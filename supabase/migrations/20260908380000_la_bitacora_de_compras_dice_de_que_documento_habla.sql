/*
  LA BITÁCORA DE COMPRAS DICE DE QUÉ DOCUMENTO HABLA.

  Christopher, con la captura delante: un renglón del registro que decía
  «Creó una anotación de compras» y nada más. Ni qué documento, ni de qué
  estado a cuál. La fila lo guarda todo —`documento_tipo`, `documento_id`,
  `estado_anterior`, `estado_nuevo`— y el registro no lo decía.

  ═══════════════════════════════════════════════════════════════════════════
  POR QUÉ ESTA TABLA SE ESCAPÓ DEL PASEO GENÉRICO
  ═══════════════════════════════════════════════════════════════════════════

  `private.etiqueta_de_fila` camina las claves foráneas de la fila y junta el
  nombre de cada fila apuntada. Funciona para toda tabla hija, y no funciona
  aquí: **`documento_id` no tiene clave foránea**. No puede tenerla — apunta a
  tres tablas distintas según lo que diga `documento_tipo`:

      SOLICITUD  → solicitudes_pedido      COTIZACION → cotizaciones
      ORDEN      → ordenes_compra

  Un puntero polimórfico es invisible para `pg_constraint`, y por eso el paseo
  genérico salía con las manos vacías. La regla no se puede deducir del
  catálogo: hay que escribirla. Va explícita, y va nombrada, para que el día que
  aparezca un cuarto tipo se vea dónde se añade.

  ES LA ÚNICA TABLA CON ESTA FORMA —se comprobó contra `pg_attribute`: ninguna
  otra en `public` tiene `documento_tipo`—, así que no se inventa un mecanismo
  general para un caso: se resuelve el caso.

  ═══════════════════════════════════════════════════════════════════════════
  LO YA REGISTRADO NO SE TOCA
  ═══════════════════════════════════════════════════════════════════════════

  Los asientos viejos siguen sin etiqueta, y así se quedan. La auditoría es
  inmutable: reescribirle una columna a un asiento de hace tres días —aunque sea
  un rótulo derivado de lo que ya guarda— es exactamente lo que un registro de
  auditoría no puede permitir, porque entonces no prueba nada.

  Y no hace falta: la ficha resuelve esas filas al mostrarlas —la pantalla ya
  narra «la cotización n.º 49 pasó de confirmada a corregida» leyendo el mismo
  JSON—. Lo que se arregla aquí es lo que se escriba de ahora en adelante, que
  es donde una etiqueta guardada sí sirve: en la LISTA, que no abre cada fila.
*/

create or replace function private.etiqueta_de_fila(p_tabla text, p_fila jsonb)
returns text language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_propia text;
  v_partes text[] := '{}';
  v_fk     record;
  v_valor  text;
  v_otra   jsonb;
  v_nombre text;
  v_tabla  text;
begin
  /*
    EL PUNTERO POLIMÓRFICO DE LA BITÁCORA DE COMPRAS.

    Va antes que todo lo demás porque es una regla de esta tabla, y una regla
    concreta gana a un paseo genérico que aquí no puede funcionar: `documento_id`
    no tiene clave foránea que caminar.

    Si el documento ya no existe —o el tipo es uno que esta lista no conoce— se
    devuelve al menos «SOLICITUD n.º 67», que sigue señalando una fila. Media
    etiqueta es mejor que ninguna; una etiqueta inventada, no.
  */
  if p_tabla = 'compras_bitacora' then
    v_valor := nullif(btrim(coalesce(p_fila ->> 'documento_id', '')), '');
    v_tabla := case upper(btrim(coalesce(p_fila ->> 'documento_tipo', '')))
                 when 'SOLICITUD'  then 'solicitudes_pedido'
                 when 'COTIZACION' then 'cotizaciones'
                 when 'ORDEN'      then 'ordenes_compra'
               end;

    if v_valor is not null and v_tabla is not null then
      begin
        execute format('select x.numero from public.%I x where x.id::text = $1 limit 1', v_tabla)
          into v_propia using v_valor;
      exception when others then
        -- Una etiqueta nunca puede tumbar una escritura.
        v_propia := null;
      end;
    end if;

    return nullif(btrim(
      btrim(coalesce(p_fila ->> 'documento_tipo', '')) || ' ' ||
      coalesce(v_propia, case when v_valor is not null then 'n.º ' || v_valor else '' end)
    ), '');
  end if;

  v_propia := private.etiqueta_natural(p_fila);
  if v_propia is not null then return v_propia; end if;

  for v_fk in
    select att.attname as columna,
           cl.relname  as tabla_destino,
           attd.attname as columna_destino
      from pg_constraint c
      join pg_class      t    on t.oid = c.conrelid
      join pg_namespace  n    on n.oid = t.relnamespace
      join pg_class      cl   on cl.oid = c.confrelid
      join pg_namespace  nd   on nd.oid = cl.relnamespace
      join pg_attribute  att  on att.attrelid = c.conrelid and att.attnum = c.conkey[1]
      join pg_attribute  attd on attd.attrelid = c.confrelid and attd.attnum = c.confkey[1]
     where c.contype = 'f'
       and n.nspname = 'public'
       and t.relname = p_tabla
       and cardinality(c.conkey) = 1
       and c.confrelid <> c.conrelid
       -- Fuera de `public` no se mira: casi todas apuntan a `auth.users`, y
       -- quien lo hizo ya esta en la cabecera del asiento.
       and nd.nspname = 'public'
       -- Ni las de «por quien»: `a_usuario` es identidad, `por_usuario` no.
       and att.attname !~ '(^por_|_por$)'
     order by att.attnum
  loop
    exit when cardinality(v_partes) >= 3;

    v_valor := nullif(btrim(coalesce(p_fila ->> v_fk.columna, '')), '');
    continue when v_valor is null;

    begin
      execute format('select to_jsonb(x) from public.%I x where x.%I::text = $1 limit 1',
                     v_fk.tabla_destino, v_fk.columna_destino)
        into v_otra using v_valor;
    exception when others then
      -- Una etiqueta nunca puede tumbar una escritura.
      v_otra := null;
    end;

    if v_otra is not null then
      v_nombre := private.etiqueta_natural(v_otra);
      if v_nombre is not null then
        v_partes := v_partes || v_nombre;
      end if;
    end if;
  end loop;

  return nullif(array_to_string(v_partes, ' · '), '');
end;
$function$;

comment on function private.etiqueta_de_fila(text, jsonb) is
  'De que fila habla un asiento de auditoria, en palabras. `compras_bitacora` va aparte y primero: su `documento_id` apunta a tres tablas segun `documento_tipo` y un puntero polimorfico no tiene clave foranea que caminar. Para el resto: primero mira si la fila se nombra sola; si no —el caso de toda fila hija—, camina sus claves foraneas de una columna y junta el nombre de cada fila apuntada: «BOTAS DE SEGURIDAD · Barril». Un solo nivel, sin las de «por quien», y tope de tres. Nunca lanza.';
