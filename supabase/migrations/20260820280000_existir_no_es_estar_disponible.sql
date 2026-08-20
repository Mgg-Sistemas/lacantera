-- ---------------------------------------------------------------------------
-- Existir no es estar disponible
--
-- LA DIFERENCIA QUE NO SE VEÍA
--
-- «Hay 10 cascos» y «hay 10 cascos, 0 disponibles» son dos frases distintas y
-- el sistema solo sabía decir la primera. Quien mira Existencias ve diez y se
-- confía; los diez están en la cabeza de diez personas.
--
-- Lo dijo Christopher, y tenía razón en algo más fino de lo que parece: lo
-- prestado **sigue siendo existencia**. No se ha ido del almacén, es de la
-- empresa, y cuenta para el valor del inventario. Lo que no es, es disponible.
-- Restarlo de la existencia sería mentir en la otra dirección.
--
-- DÓNDE ESTABA Y DÓNDE NO
--
-- La distinción existía, pero solo dentro de las dos vistas de entrega
-- —`v_herramientas` y `v_entregables`— porque son las que tenían que impedir
-- prestar dos veces lo mismo. `v_existencias` y `v_existencias_totales`, que
-- son las que mira quien decide si hace falta comprar, no sabían nada.
--
-- Y ESO YA SE IMPEDÍA, PERO EN SILENCIO
--
-- `entregar_a_trabajador` y `asignar_herramienta` ya rechazan entregar más de
-- lo libre. El agujero no era que se pudiera: era que nadie lo veía venir hasta
-- que la pantalla decía que no.
--
-- `disponibles` se calcula igual para todo: existencia menos lo prestado. Un
-- consumible no tiene préstamos abiertos —lo entregado ya salió del libro— así
-- que le queda igual a la existencia sin necesidad de un caso aparte.
-- ---------------------------------------------------------------------------
create or replace view public.v_existencias as
 SELECT m.almacen_id,
    a.codigo AS almacen_codigo,
    a.nombre AS almacen,
    m.articulo_id,
    art.codigo AS articulo_codigo,
    art.nombre AS articulo,
    art.categoria,
    art.unidad,
    art.stock_minimo,
    sum(m.cantidad * m.signo::numeric) AS existencia,
    sum(m.valor_usd * m.signo::numeric) AS valor_usd,
        CASE
            WHEN sum(m.cantidad * m.signo::numeric) > 0::numeric THEN round(sum(m.valor_usd * m.signo::numeric) / sum(m.cantidad * m.signo::numeric), 6)
            ELSE NULL::numeric
        END AS costo_promedio_usd,
    max(m.fecha) AS ultimo_movimiento,
    -- Columnas nuevas al final: `create or replace view` no admite meterlas en
    -- medio, y de esta cuelgan `v_herramientas` y `v_entregables`.
    COALESCE(g.prestadas, 0::numeric) AS prestadas,
    sum(m.cantidad * m.signo::numeric) - COALESCE(g.prestadas, 0::numeric) AS disponibles
   FROM inventario_movimientos m
     JOIN almacenes a ON a.id = m.almacen_id
     JOIN articulos art ON art.id = m.articulo_id
     LEFT JOIN ( SELECT asignaciones_herramienta.articulo_id,
            asignaciones_herramienta.almacen_id,
            sum(asignaciones_herramienta.cantidad) AS prestadas
           FROM asignaciones_herramienta
          WHERE asignaciones_herramienta.estado = 'ASIGNADA'::text
          GROUP BY asignaciones_herramienta.articulo_id, asignaciones_herramienta.almacen_id) g
       ON g.articulo_id = m.articulo_id AND g.almacen_id = m.almacen_id
  GROUP BY m.almacen_id, a.codigo, a.nombre, m.articulo_id, art.codigo, art.nombre,
           art.categoria, art.unidad, art.stock_minimo, g.prestadas;

-- `create or replace view` descarta las opciones si no se repiten. Perderlo
-- aquí dejaría el inventario entero legible por cualquier sesión.
alter view public.v_existencias set (security_invoker = on);

comment on view public.v_existencias is
  'Lo que hay en cada almacén. `existencia` cuenta lo prestado, porque sigue '
  'siendo de la empresa; `disponibles` es lo que se puede entregar hoy. Las '
  'dos cifras hacen falta: una para el valor del inventario y otra para saber '
  'si hay que comprar.';

-- ---------------------------------------------------------------------------
create or replace view public.v_existencias_totales as
 SELECT art.id AS articulo_id,
    art.codigo AS articulo_codigo,
    art.nombre AS articulo,
    art.categoria,
    art.unidad,
    art.stock_minimo,
    art.densidad_ton_m3,
    sum(m.cantidad * m.signo::numeric) AS existencia,
        CASE
            WHEN art.densidad_ton_m3 IS NULL THEN NULL::numeric
            WHEN art.unidad = 'M3'::text THEN round(sum(m.cantidad * m.signo::numeric) * art.densidad_ton_m3, 4)
            WHEN art.unidad = 'TON'::text THEN round(sum(m.cantidad * m.signo::numeric) / art.densidad_ton_m3, 4)
            ELSE NULL::numeric
        END AS existencia_equivalente,
        CASE
            WHEN art.densidad_ton_m3 IS NULL THEN NULL::text
            WHEN art.unidad = 'M3'::text THEN 'TON'::text
            WHEN art.unidad = 'TON'::text THEN 'M3'::text
            ELSE NULL::text
        END AS unidad_equivalente,
    sum(m.valor_usd * m.signo::numeric) AS valor_usd,
        CASE
            WHEN sum(m.cantidad * m.signo::numeric) > 0::numeric THEN round(sum(m.valor_usd * m.signo::numeric) / sum(m.cantidad * m.signo::numeric), 6)
            ELSE NULL::numeric
        END AS costo_promedio_usd,
    count(DISTINCT m.almacen_id) AS almacenes,
    max(m.fecha) AS ultimo_movimiento,
    COALESCE(g.prestadas, 0::numeric) AS prestadas,
    sum(m.cantidad * m.signo::numeric) - COALESCE(g.prestadas, 0::numeric) AS disponibles,
    art.modo_entrega
   FROM articulos art
     JOIN inventario_movimientos m ON m.articulo_id = art.id
     LEFT JOIN ( SELECT asignaciones_herramienta.articulo_id,
            sum(asignaciones_herramienta.cantidad) AS prestadas
           FROM asignaciones_herramienta
          WHERE asignaciones_herramienta.estado = 'ASIGNADA'::text
          GROUP BY asignaciones_herramienta.articulo_id) g
       ON g.articulo_id = art.id
  GROUP BY art.id, art.codigo, art.nombre, art.categoria, art.unidad, art.stock_minimo,
           art.densidad_ton_m3, art.modo_entrega, g.prestadas;

alter view public.v_existencias_totales set (security_invoker = on);

comment on view public.v_existencias_totales is
  'Lo que hay de cada artículo en toda la empresa, con lo prestado y lo que '
  'queda disponible. `modo_entrega` viaja para que la pantalla sepa si esa '
  'diferencia puede existir siquiera.';
