/*
  LAS OTRAS DOS LENTES DE LOS NÚMEROS.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026, por MCP, en dos trozos, y comprobada
  escribiendo contra la base viva en transacción deshecha. No cambia datos.
  ————————————————————————————————————————————————————————————————————————

  El barrido anterior dijo en su propio archivo lo que se le escapaba, y esto es
  ir a buscarlo. Dos lentes más:

    TERCERA — la variable declarada `numeric` metida cruda en el hueco, sin un
    `round()` alrededor que la delatara. Cinco sitios, y dos de ellos en rejas
    que se ven a diario: la capacidad del almacén en
    `private.registrar_movimiento` —que corre por dentro de TODAS las puertas
    del inventario— y la existencia de `abrir_mantenimiento`.

    CUARTA — el campo de un `record`: `v_renglon.cantidad`. No aparece en
    ninguna declaración, así que la lente anterior no podía verlo. Tres sitios,
    y otra vez los que más rebotan: el despacho, la recepción de una orden y la
    anulación de una nota de crédito.

  QUE HAYAN HECHO FALTA CUATRO LENTES PARA VEINTIOCHO SITIOS ES EL DATO.

  No hay una sola forma de meter un número en un mensaje, y cada lente encuentra
  los que la anterior no podía ver. Por eso esto se cuenta por lentes y no por
  «ya no queda ninguno» — aunque hoy, con las cuatro puestas, no quede ninguno.

  La consulta que lo comprueba está al final, y es la que hay que volver a
  correr la próxima vez, no la memoria de que un día se hizo.
*/

do $guarda$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='cantidad_es') then
    raise exception 'Falta private.cantidad_es.';
  end if;
end $guarda$;

do $barrido$
declare
  v_pares text[] := array[
    -- esquema | funcion | antes | despues

    -- Tercera lente: la variable numeric cruda.
    'private|cargar_renglones_venta|v_articulo.nombre, v_minimo.precio_minimo, v_minimo.moneda, v_precio, p_moneda|v_articulo.nombre, private.numero_es(v_minimo.precio_minimo, 2), v_minimo.moneda, private.numero_es(v_precio, 2), p_moneda',
    'private|registrar_movimiento|v_nombre, v_capacidad, v_unidad, v_hay, p_cantidad|v_nombre, private.cantidad_es(v_capacidad), v_unidad, private.cantidad_es(v_hay), private.cantidad_es(p_cantidad)',
    'private|registrar_movimiento|hint = format(''Quedan %s libres.'', v_capacidad - v_hay)|hint = format(''Quedan %s libres.'', private.cantidad_es(v_capacidad - v_hay))',
    'public|abrir_mantenimiento|'', v_hay, v_art.unidad, v_art.nombre|'', private.cantidad_es(v_hay), v_art.unidad, v_art.nombre',
    'public|registrar_ticket|coalesce(p_peso_bruto, 0), coalesce(p_peso_tara, 0) using errcode|private.cantidad_es(coalesce(p_peso_bruto, 0)), private.cantidad_es(coalesce(p_peso_tara, 0)) using errcode',

    -- Cuarta lente: el campo de un record.
    'public|despachar|v_almacen.nombre, v_existe, v_reng.nombre, v_reng.cantidad|v_almacen.nombre, private.cantidad_es(v_existe), v_reng.nombre, private.cantidad_es(v_reng.cantidad)',
    'public|anular_nota_credito|v_nota.numero, v_reng.cantidad, v_hay using errcode|v_nota.numero, private.cantidad_es(v_reng.cantidad), private.cantidad_es(v_hay) using errcode',
    'public|registrar_recepcion|v_renglon.descripcion, v_renglon.cantidad, v_renglon.cantidad_recibida, v_cantidad|v_renglon.descripcion, private.cantidad_es(v_renglon.cantidad), private.cantidad_es(v_renglon.cantidad_recibida), private.cantidad_es(v_cantidad)'
  ];
  v_par text; v_t text[]; v_def text; v_antes text; v_oid oid;
  v_hechos int := 0; v_saltados int := 0; v_faltan text := '';
begin
  foreach v_par in array v_pares loop
    v_t := string_to_array(v_par, '|');
    for v_oid in
      select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = v_t[1] and p.proname = v_t[2]
    loop
      v_def := pg_get_functiondef(v_oid);
      v_antes := v_def;
      v_def := replace(v_def, v_t[3], v_t[4]);
      if v_def = v_antes then
        if position(v_t[4] in v_antes) > 0 then
          v_saltados := v_saltados + 1;
        else
          v_faltan := v_faltan || format(E'\n  %s.%s: no se encontro «%s»', v_t[1], v_t[2], left(v_t[3], 60));
        end if;
      else
        execute v_def;
        v_hechos := v_hechos + 1;
      end if;
    end loop;
  end loop;

  if v_faltan <> '' then
    raise exception 'Sustituciones que no encajaron: %', v_faltan;
  end if;
  raise notice 'Las otras dos lentes: % cambiados, % ya estaban.', v_hechos, v_saltados;
end $barrido$;

/*
  LA CONSULTA DE LAS CUATRO LENTES JUNTAS. Devuelve «ninguna» el 8 de
  septiembre, y es la que hay que volver a correr, no la memoria de haberlo
  hecho:

    with decls as (
      select p.oid, n.nspname, p.proname,
             array(select distinct d[1] from regexp_matches(p.prosrc, '([vp]_[a-z_0-9]+)\s+numeric', 'g') d) as num
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public','private') and p.prokind='f'
    )
    select coalesce(string_agg(distinct f, E'\n'), 'ninguna') from (
      select d.nspname||'.'||d.proname||' · '||v as f
        from decls d, pg_proc p, lateral regexp_matches(p.prosrc, '(raise exception[^;]{0,240};)', 'g') m,
             unnest(d.num) v
       where p.oid = d.oid and array_length(d.num,1) > 0
         and m[1] ~ ('[,(] *' || v || ' *[,)]')
         and m[1] !~ ('numero_es\(' || v || '|cantidad_es\(' || v)
      union all
      select n.nspname||'.'||p.proname||' · campo'
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
             lateral regexp_matches(p.prosrc, '(raise exception[^;]{0,240};)', 'g') m
       where n.nspname in ('public','private') and p.prokind='f' and m[1] ~ '%'
         and m[1] ~* '[,(] *[vp]_[a-z_0-9]+\.(cantidad|monto|total|saldo|precio|costo|existencia|peso|neto|limite|litros|horas|km|capacidad|minimo|disponible|acumulado|tope)[a-z_]* *[,)]'
         and m[1] !~ 'numero_es|cantidad_es'
      union all
      select n.nspname||'.'||p.proname||' · to_char'
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
             lateral regexp_matches(p.prosrc, '(to_char\([^)]{0,120}(9G999|990D|D##|FM9)[^)]{0,60}\))', 'g') m
       where n.nspname in ('public','private') and p.proname <> 'numero_es'
    ) t;

  COMPROBADO ESCRIBIENDO, porque `private.registrar_movimiento` corre por dentro
  de las tres puertas del inventario y romperlo seria romperlo todo:

    entrada de 3 TAMBOR .... 624,00 L
    salida de 100 L ........ 524,00 L
    sacar de mas ........... rebota: «solo quedan 524,0000 y se intentan sacar
                             999.999,5000»
    contados 2 TAMBOR ...... 416,00 L

  Al terminar: 19 movimientos, 868.927.307,04. Nada de produccion tocado.
*/
