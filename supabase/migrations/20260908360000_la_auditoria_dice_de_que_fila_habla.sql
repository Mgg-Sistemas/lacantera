/*
  LA AUDITORÍA DICE DE QUÉ FILA HABLA.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026, por MCP, en tres trozos —dos de ellos
  corrigiendo el primero— y probada contra las once tablas que no decían nada.
  ————————————————————————————————————————————————————————————————————————

  Christopher, con una ficha delante: «esa información dispersa y escasa o para
  nada concreta no nos dice nada».

      Creó articulo presentaciones
      Sobre: articulo presentaciones · 119
      id 119 · activa Sí · unidades 3 · articulo id 278

  Lo que de verdad pasó fue: **se declaró que BOTAS DE SEGURIDAD puede contarse
  en BARRIL, y que cada barril trae 3 PAR.** Ninguna de las dos cosas —ni el
  artículo ni la presentación— aparecía por ninguna parte.

  ═══════════════════════════════════════════════════════════════════════════
  LA MEDIDA, ANTES DE TOCAR NADA
  ═══════════════════════════════════════════════════════════════════════════

  **572 de las 1.097 filas de auditoría no tenían etiqueta. El 52%.**

  Y no están repartidas al azar: son ONCE tablas, todas de la misma forma —filas
  hijas cuya identidad vive al otro lado de una clave foránea—:

      nomina_recibos          249   periodo_id, empleado_id
      compras_bitacora        108   actor_id (y un documento_id polimórfico)
      cotizacion_renglones     70   cotizacion_id, solicitud_renglon_id
      nomina_faltas            45   periodo_id, empleado_id
      nomina_novedades         38   periodo_id, empleado_id
      tasas_cambio             28   moneda_origen, moneda_destino
      firmas                    9   perfil_id, empleado_id
      instrucciones_pago        8   orden_id
      autorizaciones            7   accion, a_usuario
      articulo_presentaciones   6   articulo_id, presentacion
      horometro_lecturas        4   maquina_id, operador_id

  Ese número es el que decidió el diseño. Con cuatro casos se arreglan a mano;
  con once del mismo patrón, la regla va al ayudante — que es la lección que
  llevo repitiendo toda la semana, aplicada al único sitio por donde pasan las
  95 tablas.

  ═══════════════════════════════════════════════════════════════════════════
  CÓMO
  ═══════════════════════════════════════════════════════════════════════════

  Dos pasadas:

    1. Si la fila se nombra sola —tiene `numero`, `nombre`, `codigo`…—, ésa es.
       Es lo que ya hacía.
    2. Si no, **se caminan sus claves foráneas**, leídas de `pg_constraint` y no
       de una lista escrita a mano, y se le pide a cada fila apuntada SU nombre.

  Con eso, `articulo_presentaciones` pasa de «119» a «BOTAS DE SEGURIDAD ·
  Barril», y las once se arreglan de una vez. La tabla que se cree mañana
  también, sin que nadie se acuerde.

  ═══════════════════════════════════════════════════════════════════════════
  LAS TRES DECISIONES, Y LO QUE SE DESCARTÓ
  ═══════════════════════════════════════════════════════════════════════════

  **Un solo nivel.** Seguir la cadena hacia arriba —el renglón a su cotización, y
  ésa a su proveedor— daría etiquetas más ricas y una consulta por salto en el
  camino de CADA escritura auditada. Un nivel resuelve las once. Medido: seis
  escrituras encadenadas, 79 ms en total.

  **Nada de «por quién».** `revocada_por`, `creada_por`, `registrado_por`,
  `por_usuario`: todas dicen quién actuó, y eso ya está en la cabecera del
  asiento con su nombre. Repetirlo alargaba la etiqueta y tapaba lo que sí
  identifica: `autorizaciones` salía «Aprobar la compra · JESMARY BARCO ·
  ADMINISTRADOR · ADMINISTRADOR». La distinción es la preposición — `a_usuario`,
  a quien se le concedió, SÍ es identidad; `por_usuario` no.

  **Se descartó resolver los nombres al MOSTRAR**, en la pantalla. Es más barato
  de escribir y siempre está al día — y por eso mismo no sirve aquí. Un registro
  que existe para explicar el pasado tiene que guardar el nombre que la cosa
  tenía ESE DÍA. Es la misma razón por la que el movimiento guarda el nombre de
  la presentación y no un puntero a su fila.

  ═══════════════════════════════════════════════════════════════════════════
  LO QUE NO ARREGLA, Y VA DICHO EN VEZ DE TAPADO
  ═══════════════════════════════════════════════════════════════════════════

  `compras_bitacora` —108 filas, la segunda con más rastro— se queda sin
  etiqueta. Su única foránea es `actor_id` y apunta a `auth.users`; su
  `documento_id` no tiene clave foránea porque señala a varias tablas según el
  caso. **Una etiqueta genérica no puede resolver un puntero polimórfico.** Esa
  tabla necesita lo suyo.

  Y las 572 filas históricas siguen sin etiqueta: la auditoría es inmutable a
  propósito —`trg_auditoria_inmutable` rechaza UPDATE y DELETE— así que lo ya
  escrito se queda como se escribió. Esto arregla lo que venga.
*/

-- ---------------------------------------------------------------------------
-- 1. El nombre natural de una fila, sacado de la propia fila
-- ---------------------------------------------------------------------------
create or replace function private.etiqueta_natural(p_fila jsonb)
returns text language plpgsql immutable set search_path to ''
as $function$
declare v_col text;
begin
  /*
    El orden es una preferencia, no una regla. `rol` va de los primeros porque
    las tablas que reparten permisos se identifican por un uuid y un codigo, y
    sin eso el registro ensenaba «e0a9d9b2-…·RRHH».

    Y `presentacion` NO esta aqui a proposito: es el nombre de OTRA cosa, no el
    de la fila. Ponerlo hacia que `articulo_presentaciones` se llamara «BARRIL»
    en vez de «BOTAS DE SEGURIDAD · Barril» — o sea, mejor que «119» y todavia
    sin decir de que articulo habla.
  */
  foreach v_col in array array[
    'numero', 'numero_guia', 'numero_factura', 'razon_social', 'nombres',
    'nombre', 'titulo', 'rol', 'usuario', 'concepto', 'descripcion', 'cargo',
    'clave', 'codigo', 'placa'
  ] loop
    if p_fila ? v_col and nullif(btrim(coalesce(p_fila ->> v_col, '')), '') is not null then
      return left(p_fila ->> v_col, 120);
    end if;
  end loop;
  return null;
end;
$function$;

comment on function private.etiqueta_natural(jsonb) is
  'El nombre con el que una fila se reconoce de un vistazo, buscado en sus propias columnas. Devuelve nulo cuando no tiene ninguno — el caso de toda fila hija, y de ahi la segunda pasada de private.etiqueta_de_fila.';

-- ---------------------------------------------------------------------------
-- 2. Y si no lo tiene, se le pregunta a quien apunta
-- ---------------------------------------------------------------------------
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
begin
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
       -- Solo las de UNA columna: una foranea compuesta apunta a una fila que
       -- tampoco se nombra sola, y seguir por ahi es como se hace un bucle.
       and cardinality(c.conkey) = 1
       and c.confrelid <> c.conrelid
       -- Fuera de `public` no se mira: casi todas apuntan a `auth.users`, y
       -- quien lo hizo ya esta en la cabecera del asiento.
       and nd.nspname = 'public'
       -- Ni las de «por quien»: `a_usuario` es identidad, `por_usuario` no.
       and att.attname !~ '(^por_|_por$)'
     order by att.attnum
  loop
    -- Una etiqueta es para reconocer la fila de un vistazo, no para
    -- describirla; lo que no cabe en tres lo cuenta la ficha.
    exit when cardinality(v_partes) >= 3;

    v_valor := nullif(btrim(coalesce(p_fila ->> v_fk.columna, '')), '');
    continue when v_valor is null;

    begin
      execute format('select to_jsonb(x) from public.%I x where x.%I::text = $1 limit 1',
                     v_fk.tabla_destino, v_fk.columna_destino)
        into v_otra using v_valor;
    exception when others then
      -- Una etiqueta NUNCA puede tumbar una escritura: si no se puede leer, se
      -- sigue sin ella. Es un registro de lo que paso, no un portero.
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
  'De que fila habla un asiento de auditoria, en palabras. Primero mira si la fila se nombra sola; si no —el caso de toda fila hija—, camina sus claves foraneas de una columna y junta el nombre de cada fila apuntada: «BOTAS DE SEGURIDAD · Barril». Un solo nivel, sin las de «por quien», y tope de tres. Nunca lanza.';

-- ---------------------------------------------------------------------------
-- 3. Y la auditoría la usa
-- ---------------------------------------------------------------------------
do $patch$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='private' and p.proname='auditar';
  v_antes := v_def;

  if position('etiqueta_de_fila' in v_def) > 0 then
    raise notice 'private.auditar ya usa la etiqueta nueva.';
    return;
  end if;

  v_def := replace(v_def,
'  foreach v_col in array array[
    ''numero'', ''razon_social'', ''nombres'', ''nombre'', ''titulo'', ''rol'', ''usuario'',
    ''concepto'', ''descripcion'', ''cargo'', ''clave'', ''codigo''
  ] loop
    if v_fila ? v_col and nullif(trim(coalesce(v_fila ->> v_col, '''')), '''') is not null then
      v_etiqueta := left(v_fila ->> v_col, 120); exit;
    end if;
  end loop;',
'  -- La etiqueta la arma `private.etiqueta_de_fila`: primero busca un nombre en
  -- la propia fila y, si no lo hay, camina sus claves foraneas. Antes esto era
  -- solo la primera pasada, y por eso 572 de 1.097 filas no decian de que
  -- hablaban: las once tablas hijas no tienen nombre propio.
  v_etiqueta := private.etiqueta_de_fila(TG_TABLE_NAME, v_fila);');

  if v_def = v_antes then
    raise exception 'No se encontro el bucle de la etiqueta en private.auditar.';
  end if;
  execute v_def;
  raise notice 'private.auditar dice de que fila habla.';
end $patch$;

/*
  COMPROBADO el 8 de septiembre contra los datos que ya hay:

    articulo_presentaciones  «BOTAS DE SEGURIDAD · Barril»   <- el caso de la captura
    nomina_recibos ......... «NOM-2026-0003 · JESMARY GABIELA»
    nomina_faltas .......... «NOM-2026-0003 · DAMASO»
    nomina_novedades ....... «NOM-2026-0003 · DAMASO»
    cotizacion_renglones ... «COT-2026-0002 · ACEITE HIDRAULICO 68»
    horometro_lecturas ..... «RETRO»
    firmas ................. «JESUS LOZADA»
    tasas_cambio ........... «Dólar estadounidense · Bolívar»
    autorizaciones ......... «Aprobar la compra · JESMARY BARCO»
    compras_bitacora ....... (sin etiqueta, y esta explicado arriba)

  Y las que ya se nombraban solas, que NO debian cambiar:

    articulos .............. «BOTAS DE SEGURIDAD»
    empleados .............. «JAIME JESUS»
    inventario_movimientos . «MOV-2026-0004»

  Prueba de humo, porque `auditar` corre en cada escritura: seis seguidas —crear
  articulo, entrada, salida, ajuste, traslado y declarar presentacion— en 79 ms.
  Al terminar: 19 movimientos, 868.927.307,04. Nada de produccion tocado.
*/
