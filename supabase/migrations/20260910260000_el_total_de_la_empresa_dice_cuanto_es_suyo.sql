/*
  «VEINTE BOTAS» NO DICE CUÁNTAS SON NUESTRAS.

  Christopher: «¿qué ocurre si existe un mismo item (ej. botas o volvo) para
  ambos dueños, o un item que ambos dueños tengan por separado (ej.
  mascarillas)? ¿Son dos items diferentes o el sistema podrá reconocer que un
  item con dos dueños diferentes? ¿Se debería modificar el código del item
  sutilmente para la diferenciación en reportes?».

  ═══════════════════════════════════════════════════════════════════════════
  ES UN SOLO ARTÍCULO, Y EL CÓDIGO NO SE TOCA
  ═══════════════════════════════════════════════════════════════════════════

  Unas botas son unas botas. Partirlas en EPP-0001 y EPP-0001-G volvería a meter
  por la puerta de atrás lo que se descartó al elegir el modelo: dos fichas para
  la misma cosa, «¿cuántas botas hay?» sin respuesta sin saberse los dos códigos,
  y la pantalla de duplicados marcándolas para siempre.

  La diferenciación en los reportes NO se hace con el código: se hace con la
  dimensión del dueño, que ya existe. El código identifica QUÉ es; el dueño dice
  DE QUIÉN es. Meter lo segundo dentro de lo primero es lo que obliga a
  reescribir el catálogo cada vez que aparece un dueño nuevo — y ya se sabe que
  van a aparecer: en facturación salieron Rápido y la comunidad.

  (Las máquinas son otra cosa y ya están bien: un Volvo es una máquina física con
  su serial, así que dos Volvos son dos filas de `maquinaria` y cada una dice de
  quién es. Ahí no hay nada que separar porque nunca estuvieron juntas.)

  ═══════════════════════════════════════════════════════════════════════════
  LO QUE SÍ FALTABA: QUE EL TOTAL LO DIGA
  ═══════════════════════════════════════════════════════════════════════════

  `v_existencias_totales` agrupa por artículo sobre TODOS los almacenes, así que
  ocho botas de la gobernación y doce compradas salían como «20» y punto. Ahí la
  pregunta se quedaba sin contestar de verdad, y de ahí venía la tentación de
  partir el código: el problema era real aunque la solución no fuera esa.

  Se resuelve donde está el problema. La fila sigue siendo UNA por artículo —para
  que «cuántas botas hay» siga teniendo respuesta— y se le añaden las columnas
  del reparto. Una fila por artículo con el desglose dentro, en vez de dos filas
  que ya no se pueden sumar.

  El reparto va enrejado por `INVENTARIO.VER_VALORACION` igual que `valor_usd`:
  las cantidades las ve cualquiera, el dinero no.
*/
do $totales$
declare v_def text;
begin
  select pg_get_viewdef('public.v_existencias_totales'::regclass, true) into v_def;

  /* Marcador exacto del texto nuevo: ni prefijo de nada, ni distinto de caja. */
  if position('existencia_propia' in v_def) > 0 then
    raise notice 'v_existencias_totales ya repartia por dueño.';
    return;
  end if;

  /* Cada movimiento necesita saber de quien era el almacen. Por fuera, para que
     un almacen sin dueño —no deberia haberlo, pero— no borre la fila entera. */
  v_def := replace(v_def,
'   FROM articulos art
     JOIN inventario_movimientos m ON m.articulo_id = art.id',
'   FROM articulos art
     JOIN inventario_movimientos m ON m.articulo_id = art.id
     LEFT JOIN almacenes alm ON alm.id = m.almacen_id
     LEFT JOIN propietarios prp ON prp.codigo = alm.propietario');

  v_def := replace(v_def,
'    art.modo_entrega
   FROM articulos art',
'    art.modo_entrega,
    COALESCE(sum(m.cantidad * m.signo::numeric)
      FILTER (WHERE COALESCE(prp.es_la_casa, true)), 0::numeric) AS existencia_propia,
    COALESCE(sum(m.cantidad * m.signo::numeric)
      FILTER (WHERE NOT COALESCE(prp.es_la_casa, true)), 0::numeric) AS existencia_ajena,
        CASE
            WHEN ( SELECT private.puede_accion(''INVENTARIO.VER_VALORACION''::text) AS puede_accion)
            THEN COALESCE(sum(m.valor_usd * m.signo::numeric)
                   FILTER (WHERE COALESCE(prp.es_la_casa, true)), 0::numeric)
            ELSE NULL::numeric
        END AS valor_propio_usd,
        CASE
            WHEN ( SELECT private.puede_accion(''INVENTARIO.VER_VALORACION''::text) AS puede_accion)
            THEN COALESCE(sum(m.valor_usd * m.signo::numeric)
                   FILTER (WHERE NOT COALESCE(prp.es_la_casa, true)), 0::numeric)
            ELSE NULL::numeric
        END AS valor_ajeno_usd
   FROM articulos art');

  if position('existencia_propia' in v_def) = 0
     or position('LEFT JOIN propietarios prp' in v_def) = 0 then
    raise exception 'Algun anclaje no encajo: no se toca la vista.';
  end if;

  execute 'create or replace view public.v_existencias_totales as ' || v_def;
  raise notice 'el total dice cuanto es nuestro y cuanto no.';
end $totales$;

grant select on public.v_existencias_totales to authenticated;

comment on view public.v_existencias_totales is
  'El inventario de la empresa por articulo, sin partir por almacen. UNA fila por articulo, con el reparto por dueño DENTRO —`existencia_propia`, `existencia_ajena` y sus valores— en vez de dos filas: asi «cuantas botas hay» sigue teniendo respuesta y «cuantas son nuestras» tambien. Lo pidio Christopher el 10/09/2026, preguntando si habria que partir el codigo del articulo para diferenciar en reportes; no hace falta, porque el codigo dice QUE es y el dueño dice DE QUIEN es, y meter lo segundo dentro de lo primero obliga a reescribir el catalogo cada vez que aparece un dueño nuevo.';

/*
  COMPROBADO EN CALIENTE, con la transacción rodada hacia atrás y metiendo el
  mismo artículo en un almacén de la gobernación:

    ACEITE HIDRAULICO 68
      total 597 = 594 propias + 3 ajenas
      valor total 3.963,18 = propio 3.843,18 + ajeno 120,00

  Cuadran cantidad y valor. Comprobado en la misma transacción, no a ojo.
*/
