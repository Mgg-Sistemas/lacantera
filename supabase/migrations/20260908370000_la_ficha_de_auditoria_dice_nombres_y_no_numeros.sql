/*
  LA FICHA DE AUDITORÍA DICE NOMBRES, NO NÚMEROS.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026, por MCP, en dos trozos —el segundo
  corrigiendo un fallo de diseño del primero— y probada con la reja de ADMIN.
  ————————————————————————————————————————————————————————————————————————

  Christopher, por segunda vez: «necesitamos un módulo de auditoría
  extremadamente explícito».

  Lo anterior arregló el TÍTULO —de «119» a «BOTAS DE SEGURIDAD · Barril»— y el
  orden de los campos. Pero el cuerpo de la ficha seguía siendo un volcado de
  columnas, y ahí está lo que él señala:

      articulo id     278
      periodo id      3
      empleado id     14

  Tres números muertos. Quien lee la auditoría un año después no tiene forma de
  saber de qué artículo, de qué período ni de qué persona se habla sin abrir
  otras tres pantallas.

  ═══════════════════════════════════════════════════════════════════════════
  QUÉ HACE
  ═══════════════════════════════════════════════════════════════════════════

  `public.auditoria_nombres(id)` devuelve, para un asiento, el nombre de cada
  valor que apunta a otra fila, **indexado por columna y luego por valor**:

      { "articulo_id":  { "278": "BOTAS DE SEGURIDAD" },
        "presentacion": { "BARRIL": "Barril" } }

  La pantalla lo pide una vez al abrir la ficha y escribe el nombre donde había
  un número, dejando el número detrás en pequeño por si hay que rastrearlo.

  POR COLUMNA Y NO POR VALOR, y esto es una corrección a mi primera versión. La
  primera devolvía `{"278": "BOTAS…", "9": "ALMACEN GENERAL"}` — la clave era el
  valor. El fallo se ve mirando un movimiento de inventario: `almacen_id` 9 y,
  el día que exista, `articulo_id` 9 caen en la misma clave y uno pisa al otro.
  La pantalla escribiría «ALMACEN GENERAL» donde va un artículo. No llegó a
  pasar —hoy los ids no coinciden— y eso es suerte, no diseño.

  ═══════════════════════════════════════════════════════════════════════════
  POR QUÉ SE RESUELVE AL MOSTRAR Y NO AL ESCRIBIR
  ═══════════════════════════════════════════════════════════════════════════

  Es lo contrario de lo que se decidió para la ETIQUETA, y la diferencia
  importa:

    - **La etiqueta** es la identidad del asiento y se congela: si el artículo se
      renombra mañana, el asiento tiene que seguir diciendo cómo se llamaba el
      día que pasó. Por eso se guarda.
    - **Esto** es una ayuda de lectura sobre columnas que ya están guardadas en
      crudo. El número 278 no cambia; lo que cambia es que ahora se puede leer.
      Guardar también el nombre sería duplicar un dato que ya está en la
      etiqueta, y duplicar es como se llega a dos verdades distintas.

  Se miran `antes` y `despues` a la vez: en un UPDATE que cambia el artículo hay
  dos ids distintos y los dos hay que poder leerlos.

  PERMISO: la auditoría solo la lee ADMIN —`auditoria_lectura` compara contra
  `mis_roles()`— y esta función exige lo mismo antes de resolver nada. Es
  SECURITY DEFINER porque tiene que leer tablas que el lector quizá no ve, así
  que la reja va escrita dentro y no se hereda de ningún sitio.
*/

create or replace function public.auditoria_nombres(p_id bigint)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_fila   record;
  v_fk     record;
  v_out    jsonb := '{}'::jsonb;
  v_col    jsonb;
  v_valor  text;
  v_otra   jsonb;
  v_nombre text;
begin
  -- La misma reja que la tabla: la auditoria es de ADMIN.
  if not private.tiene_rol('ADMIN') then
    raise exception 'La auditoría solo la puede leer un administrador.'
      using errcode = '42501';
  end if;

  select a.tabla, a.antes, a.despues into v_fila
    from public.auditoria a where a.id = p_id;

  if v_fila.tabla is null then
    return v_out;
  end if;

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
       and t.relname = v_fila.tabla
       and cardinality(c.conkey) = 1
       and nd.nspname = 'public'
  loop
    v_col := '{}'::jsonb;

    -- Los dos lados: un UPDATE que cambia el articulo trae dos ids distintos.
    foreach v_valor in array array[
      nullif(btrim(coalesce(v_fila.despues ->> v_fk.columna, '')), ''),
      nullif(btrim(coalesce(v_fila.antes   ->> v_fk.columna, '')), '')
    ] loop
      continue when v_valor is null or v_col ? v_valor;

      begin
        execute format('select to_jsonb(x) from public.%I x where x.%I::text = $1 limit 1',
                       v_fk.tabla_destino, v_fk.columna_destino)
          into v_otra using v_valor;
      exception when others then
        -- Leer un nombre nunca puede tumbar la ficha.
        v_otra := null;
      end;

      if v_otra is not null then
        v_nombre := private.etiqueta_natural(v_otra);
        if v_nombre is not null then
          v_col := v_col || jsonb_build_object(v_valor, v_nombre);
        end if;
      end if;
    end loop;

    if v_col <> '{}'::jsonb then
      v_out := v_out || jsonb_build_object(v_fk.columna, v_col);
    end if;
  end loop;

  return v_out;
end;
$function$;

comment on function public.auditoria_nombres(bigint) is
  'Para un asiento de auditoria, el nombre de cada valor que apunta a otra fila, indexado por COLUMNA y luego por valor: {"articulo_id": {"278": "BOTAS DE SEGURIDAD"}}. Por columna y no por valor porque dos claves foraneas distintas pueden traer el mismo numero. La pantalla lo pide al abrir la ficha y escribe el nombre donde habia un numero. Se resuelve al MOSTRAR y no al escribir, al reves que la etiqueta: la etiqueta es la identidad del asiento y se congela; esto es una ayuda de lectura. Solo ADMIN, como la tabla.';

grant execute on function public.auditoria_nombres(bigint) to authenticated;

/*
  COMPROBADO el 8 de septiembre contra los asientos que ya hay:

    presentacion ..... {"articulo_id": {"278": "BOTAS DE SEGURIDAD"},
                        "presentacion": {"BARRIL": "Barril"}}
    movimiento ....... {"unidad": {"L": "Litro"},
                        "almacen_id": {"9": "ALMACEN GENERAL"},
                        "articulo_id": {"272": "VALVULINA 140"}}
    recibo de nomina . {"periodo_id": {"20": "NOM-2026-0003"},
                        "empleado_id": {"18": "MICHEL"}}

    sin ADMIN ........ rebota: «La auditoría solo la puede leer un
                       administrador.»

  Nada de produccion tocado: es una funcion de lectura.
*/
