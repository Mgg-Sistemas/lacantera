-- ---------------------------------------------------------------------------
-- La existencia dice de qué tipo es el almacén donde está
--
-- Christopher, sobre la pantalla de combustible: «hay un error en combustible…
-- ese error es extraño».
--
-- Lo raro no era el error, era la pantalla. Arriba, bajo el título «En el
-- tanque», enseñaba «PATIO DE MATERIA PRIMA · GASOIL · 5.400 L». Debajo, al
-- despachar, la base contestaba «el combustible sale del tanque, no de PATIO DE
-- MATERIA PRIMA; ese almacén es de tipo PATIO».
--
-- Las dos cosas son ciertas y se contradicen. La base tiene razón —un patio no
-- es un tanque— y la pantalla mentía, porque `useTanques` filtraba por la
-- CATEGORÍA DEL ARTÍCULO («esto es combustible») y no por el TIPO DEL ALMACÉN
-- («esto es un tanque»). Cualquier sitio con gasoil se llamaba tanque.
--
-- Es la tercera vez esta semana que una pantalla lee de un sitio y el dato vive
-- en otro. Las anteriores fueron `v_gastos` contra la RPC y `v_maquinaria`
-- contra la tabla. Aquí ni siquiera es un sitio distinto: es la columna
-- equivocada de la misma fila.
--
-- El combustible en el patio existe de verdad: entró por una compra recibida
-- ahí. No hay que esconderlo — hay que llamarlo por su nombre y ofrecer la
-- salida. Para eso la vista tiene que decir de qué tipo es el sitio; sin eso, la
-- pantalla no puede distinguir una cosa de la otra.
--
-- =========================================================================
-- LA COLUMNA VA AL FINAL, Y HAY QUE VOLVER A PONER security_invoker
-- =========================================================================
--
-- `create or replace view` no admite meter una columna en medio —«cannot change
-- name of view column»— y además DESCARTA las reloptions, así que la vista
-- perdería `security_invoker` sin avisar. El disparador de eventos
-- `trg_vista_con_invoker` está justo para atrapar eso; se pone a mano de todas
-- formas, que es lo que el disparador espera encontrar.
--
-- COMPROBADO: la vista conserva `security_invoker=on` después del reemplazo, y
-- la única fila de combustible sale con `almacen_tipo = PATIO`, que es
-- exactamente la que hacía falta distinguir.
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
    COALESCE(g.prestadas, 0::numeric) AS prestadas,
    sum(m.cantidad * m.signo::numeric) - COALESCE(g.prestadas, 0::numeric) AS disponibles,
    a.tipo AS almacen_tipo
   FROM inventario_movimientos m
     JOIN almacenes a ON a.id = m.almacen_id
     JOIN articulos art ON art.id = m.articulo_id
     LEFT JOIN ( SELECT asignaciones_herramienta.articulo_id,
            asignaciones_herramienta.almacen_id,
            sum(asignaciones_herramienta.cantidad) AS prestadas
           FROM asignaciones_herramienta
          WHERE asignaciones_herramienta.estado = 'ASIGNADA'::text
          GROUP BY asignaciones_herramienta.articulo_id, asignaciones_herramienta.almacen_id) g ON g.articulo_id = m.articulo_id AND g.almacen_id = m.almacen_id
  GROUP BY m.almacen_id, a.codigo, a.nombre, a.tipo, m.articulo_id, art.codigo, art.nombre, art.categoria, art.unidad, art.stock_minimo, g.prestadas;

alter view public.v_existencias set (security_invoker = on);

comment on column public.v_existencias.almacen_tipo is
  'PATIO, ALMACEN, TALLER, COMBUSTIBLE o TRANSITO. Sin esto, una pantalla no puede distinguir «hay gasoil aquí» de «esto es un tanque».';
