/*
  EL RESPALDO NO RECOPIA LOS DATOS EN CADA VUELTA

  Esta es la que arregla el «la consulta tardó demasiado» del 06/10/2026. La
  anterior —`20261006120000`— le dio aire con el reloj; esta quita el motivo.

  DÓNDE SE IBAN LOS SIETE SEGUNDOS, MEDIDO PIEZA A PIEZA

  Armar el respaldo tardaba 8,57 s. Desglosado:

      ordenar las tablas por clave foránea .....   12 ms
      leer las 158 tablas (jsonb_agg) .......... 1337 ms
      la comprobación de identidad .............   11 ms
      la lista de columnas .....................    8 ms
      jsonb a texto ............................  304 ms
      pegar las partes al final ................   86 ms
      anotar en la auditoría ...................    6 ms
      ───────────────────────────────────────────────────
      todo lo anterior junto ................... ~1,5 s

  Faltaban siete segundos que no estaban en ninguna pieza. Estaban en CÓMO se
  llamaba a `format`:

      v_partes[v_i] := format(E'...%L::jsonb);\n\n',
        v_tabla, v_filas, v_tabla, v_tabla,
        (select string_agg(...) from pg_attribute ...),   <-- aquí
        v_forzar,
        (select string_agg(...) from pg_attribute ...),   <-- y aquí
        v_tabla, v_datos::text);

  PL/pgSQL tiene una vía rápida para las expresiones «simples»: las evalúa
  directo, pasando las variables por referencia. Una subconsulta en la lista de
  argumentos la descalifica, y entonces la expresión entera pasa por el ejecutor
  de SQL — que materializa cada parámetro. `v_datos` son megas de JSON, y se
  copiaban enteros CADA VUELTA, 158 veces.

  Medido con el mismo bucle y los mismos datos, cambiando solo eso:

      format sin subconsultas dentro ...........  1301 ms
      format con las dos subconsultas dentro ...  9024 ms

  Siete veces, por dos paréntesis mal puestos.

  Y las dos subconsultas eran LA MISMA, escrita dos veces: la lista de columnas
  para el `insert` y la del `select` son idénticas y siempre lo fueron. Así que
  se calcula una vez, en su propia línea, y `format` vuelve a recibir solo
  variables.

  NO CAMBIA NI UNA LETRA DEL ARCHIVO QUE SALE. Mismas columnas, mismo orden,
  mismo texto: la comprobación está abajo, y el tamaño en bytes antes y después
  es el mismo.
*/

do $patch$
declare
  v_def   text := pg_get_functiondef('private.armar_respaldo(text)'::regprocedure);
  v_ancla text;
  v_sub   text;
  v_veces int;
begin
  -- (a) La variable donde se guarda la lista de columnas, junto a las demas.
  v_ancla := 'v_forzar  text;';
  v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_veces <> 1 then
    raise exception 'El ancla (a) aparece % veces, se esperaba 1.', v_veces;
  end if;
  v_def := replace(v_def, v_ancla, v_ancla || E'\n  v_cols    text;');

  -- (b) La subconsulta de columnas, que esta escrita DOS veces y es la misma.
  --     Se calcula una sola vez, justo despues de `v_forzar`, y fuera de la
  --     lista de argumentos de `format`.
  v_sub := $col$(select string_agg(quote_ident(a.attname), ', ' order by a.attnum) from pg_attribute a where a.attrelid = ('public.'||quote_ident(v_tabla))::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '')$col$;
  v_veces := (length(v_def) - length(replace(v_def, v_sub, ''))) / length(v_sub);
  if v_veces <> 2 then
    raise exception 'La subconsulta de columnas aparece % veces, se esperaban 2.', v_veces;
  end if;

  v_ancla := '      into v_forzar;';
  v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_veces <> 1 then
    raise exception 'El ancla (b) aparece % veces, se esperaba 1.', v_veces;
  end if;
  v_def := replace(
    v_def,
    v_ancla,
    v_ancla                                                                  || E'\n' ||
    ''                                                                       || E'\n' ||
    '    /*'                                                                 || E'\n' ||
    '      LA LISTA DE COLUMNAS, FUERA DE `format`. 06/10/2026.'              || E'\n' ||
    ''                                                                       || E'\n' ||
    '      No es por repetirla menos —que tambien—, es por el tiempo: una'    || E'\n' ||
    '      subconsulta dentro de la lista de argumentos saca a format de la'  || E'\n' ||
    '      via rapida de PL/pgSQL, y entonces los megas de v_datos se copian' || E'\n' ||
    '      enteros en cada vuelta. Siete segundos de las 158.'                || E'\n' ||
    '    */'                                                                 || E'\n' ||
    '    select string_agg(quote_ident(a.attname), '', '' order by a.attnum)' || E'\n' ||
    '      into v_cols'                                                      || E'\n' ||
    '      from pg_attribute a'                                              || E'\n' ||
    '     where a.attrelid = (''public.''||quote_ident(v_tabla))::regclass'   || E'\n' ||
    '       and a.attnum > 0 and not a.attisdropped and a.attgenerated = '''';');

  -- (c) Y las dos subconsultas pasan a ser la variable.
  v_def := replace(v_def, v_sub, 'v_cols');

  v_veces := (length(v_def) - length(replace(v_def, 'v_cols', ''))) / length('v_cols');
  if v_veces <> 4 then
    raise exception 'v_cols queda % veces (declaracion, into y dos usos = 4).', v_veces;
  end if;

  execute v_def;
end
$patch$;
