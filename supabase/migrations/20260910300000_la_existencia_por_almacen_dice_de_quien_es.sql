/*
  LA EXISTENCIA POR ALMACÉN TIENE QUE DECIR DE QUIÉN ES.

  Desde que el dueño viaja con el material, un almacén puede tener tres bombas
  nuestras y ocho de la gobernación. `v_existencias` agrupa por (almacén,
  artículo) y devolvía «11», sin más.

  Eso deja sin contestar la pregunta que la pantalla del traslado necesita hacer
  —«¿de quién sacas?»— y sin manera de saber siquiera si hace falta preguntarla.

  ═══════════════════════════════════════════════════════════════════════════
  LA FILA NO SE PARTE: SE LE AÑADE EL REPARTO
  ═══════════════════════════════════════════════════════════════════════════

  Agrupar por (almacén, artículo, dueño) habría dado dos filas por artículo y
  roto todas las pantallas que cuentan renglones, además de repetir el nombre y
  la unidad. Se sigue el mismo criterio que en `v_existencias_totales`: una fila,
  con el desglose dentro.

  `duenos` es un arreglo y no dos columnas porque los dueños son N: hoy dos,
  mañana los cuatro de la conversación de facturación. Un arreglo aguanta el
  cuarto sin migración.

  Solo entran los que tienen saldo POSITIVO ahí. Un dueño que ya se llevó todo lo
  suyo no está en ese almacén, y ofrecerlo en un desplegable sería ofrecer un
  cero.

  ESTE ARCHIVO CASI SE QUEDA SIN ESCRIBIR, como el de `almacenes.responsable_id`
  esta mañana. `npm run deriva` compara FUNCIONES y no mira las vistas, así que
  esta clase de hueco no la caza nadie. Vale la pena decirlo aquí para el
  siguiente que pase por delante.
*/
do $existencias$
declare v_def text;
begin
  select pg_get_viewdef('public.v_existencias'::regclass, true) into v_def;

  if position('AS duenos' in v_def) > 0 then
    raise notice 'v_existencias ya decia de quien es.';
    return;
  end if;

  /* El dueño de cada movimiento, por fuera: un movimiento con un dueño que ya no
     estuviera en el catalogo no debe borrar la fila entera. */
  v_def := replace(v_def,
'   FROM inventario_movimientos m
     JOIN almacenes a ON a.id = m.almacen_id',
'   FROM inventario_movimientos m
     JOIN almacenes a ON a.id = m.almacen_id
     LEFT JOIN propietarios prp ON prp.codigo = m.propietario');

  /* Las columnas nuevas van AL FINAL de la lista del select: `create or replace
     view` no deja meterlas en medio ni reordenar lo que ya habia. */
  v_def := regexp_replace(v_def,
    '(\s+)FROM inventario_movimientos m(\s+)JOIN almacenes a',
    ',
    COALESCE(sum(m.cantidad * m.signo) FILTER (WHERE COALESCE(prp.es_la_casa, true)), 0::numeric) AS existencia_propia,
    COALESCE(sum(m.cantidad * m.signo) FILTER (WHERE NOT COALESCE(prp.es_la_casa, true)), 0::numeric) AS existencia_ajena,
    COALESCE(( SELECT array_agg(DISTINCT t.propietario ORDER BY t.propietario)
                 FROM ( SELECT m2.propietario, sum(m2.cantidad * m2.signo) AS saldo
                          FROM inventario_movimientos m2
                         WHERE m2.almacen_id = m.almacen_id AND m2.articulo_id = m.articulo_id
                         GROUP BY m2.propietario
                        HAVING sum(m2.cantidad * m2.signo) > 0::numeric) t), ARRAY[]::text[]) AS duenos\1FROM inventario_movimientos m\2JOIN almacenes a',
    '');

  if position('AS duenos' in v_def) = 0
     or position('LEFT JOIN propietarios prp' in v_def) = 0 then
    raise exception 'Algun anclaje no encajo: no se toca la vista.';
  end if;

  execute 'create or replace view public.v_existencias as ' || v_def;
  raise notice 'la existencia por almacen dice de quien es.';
end $existencias$;

grant select on public.v_existencias to authenticated;

/*
  COMPROBADO EN CALIENTE, con la transacción rodada hacia atrás:

    antes ...: 416 en total, dueños {LACANTERA}
    después de meter 8 de la gobernación en el MISMO almacén:
              424 en total = 416 propias + 8 ajenas · dueños
              {GOBERNACION, LACANTERA} · cuadra
*/
