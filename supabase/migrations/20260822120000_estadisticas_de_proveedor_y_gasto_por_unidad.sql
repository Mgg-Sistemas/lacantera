-- ---------------------------------------------------------------------------
-- Cuánto se le ha comprado a cada proveedor, y qué unidad gasta más
--
-- Dos peticiones del mismo mensaje de la líder:
--
--   «se necesita estadísticas sobre los proveedores, tal que, item más
--    solicitado, total invertido, invertido este mes»
--   «¿Qué unidad/departamento genera más consumo/gasto?»
--
-- QUÉ CUENTA COMO INVERTIDO
--
-- Las órdenes, no las facturas ni los pagos. Una orden aprobada es dinero
-- comprometido: el proveedor ya sabe que se le compró y a qué precio. Contar
-- por factura dejaría fuera lo comprado que aún no ha facturado, y contar por
-- pago dejaría fuera lo que está por pagarse. La pregunta «cuánto le hemos
-- comprado a este» se responde con el compromiso, no con la caja.
--
-- Las canceladas no cuentan: se canceló antes de recibir nada.
--
-- TODO EN DÓLARES
--
-- Un proveedor puede haber cotizado en bolívares en enero y en dólares en
-- marzo. Sumar las dos cifras tal cual da un número sin significado.
-- `total_usd` es columna generada de la orden, con la tasa que se congeló el
-- día que se aprobó, así que la suma es comparable en el tiempo.
--
-- «ESTE MES» ES EL MES CORRIDO, NO LOS ÚLTIMOS TREINTA DÍAS
--
-- Quien pregunta «cuánto llevamos este mes» compara contra el mes pasado y
-- contra un presupuesto mensual. Los últimos treinta días responden otra
-- pregunta, y el día 2 darían una cifra enorme sin explicación.
-- ---------------------------------------------------------------------------

create or replace view public.v_proveedor_resumen as
with ordenes as (
  select o.proveedor_id, o.id, o.creada_en, o.total_usd
    from public.ordenes_compra o
   where o.estado <> 'CANCELADA'
)
select p.id as proveedor_id,
       p.nombre,
       p.rif,

       count(o.id)                                        as ordenes,
       coalesce(sum(o.total_usd), 0)                      as invertido_usd,

       coalesce(sum(o.total_usd) filter (
         where o.creada_en >= date_trunc('month', current_date)
       ), 0)                                              as invertido_mes_usd,

       count(o.id) filter (
         where o.creada_en >= date_trunc('month', current_date)
       )                                                  as ordenes_mes,

       max(o.creada_en)                                   as ultima_compra,

       -- Lo que más se le compra, por veces que aparece en una orden suya. Por
       -- veces y no por monto: la pregunta es «qué le compramos a este», y un
       -- solo neumático caro no lo convierte en el proveedor de neumáticos.
       (select r.descripcion
          from public.orden_renglones r
          join ordenes o2 on o2.id = r.orden_id
         where o2.proveedor_id = p.id
         group by r.descripcion
         order by count(*) desc, sum(r.subtotal) desc
         limit 1)                                         as articulo_frecuente,

       (select count(*)
          from public.orden_renglones r
          join ordenes o2 on o2.id = r.orden_id
         where o2.proveedor_id = p.id)                     as renglones

  from public.proveedores p
  left join ordenes o on o.proveedor_id = p.id
 group by p.id, p.nombre, p.rif;

alter view public.v_proveedor_resumen set (security_invoker = true);

comment on view public.v_proveedor_resumen is
  'Cuanto se le ha comprado a cada proveedor y que se le compra. Cuenta ordenes '
  'aprobadas —dinero comprometido— y no facturas ni pagos, y todo en dolares a '
  'la tasa que congelo cada orden.';

create or replace view public.v_proveedor_articulos as
select o.proveedor_id,
       coalesce(a.nombre, r.descripcion)  as articulo,
       a.codigo                           as articulo_codigo,
       r.unidad,
       count(*)                           as veces,
       sum(r.cantidad)                    as cantidad,
       sum(r.subtotal * o.total_usd / nullif(o.total, 0)) as invertido_usd,
       max(o.creada_en)                   as ultima_vez
  from public.orden_renglones r
  join public.ordenes_compra o on o.id = r.orden_id
  left join public.articulos a on a.id = r.articulo_id
 where o.estado <> 'CANCELADA'
 group by o.proveedor_id, coalesce(a.nombre, r.descripcion), a.codigo, r.unidad;

alter view public.v_proveedor_articulos set (security_invoker = true);

comment on view public.v_proveedor_articulos is
  'Que se le compra a cada proveedor y cuanto se lleva gastado en cada cosa. El '
  'renglon se lleva a dolares con la misma proporcion que la orden, que es la '
  'unica tasa que consta.';

-- ---------------------------------------------------------------------------
-- Qué unidad gasta más
--
-- Son dos preguntas y conviene no mezclarlas, porque una unidad puede gastar
-- mucho y consumir poco —compró repuestos que siguen en el estante— o al revés:
--
--   GASTO   — lo que se compró para ese sitio. Órdenes aprobadas, dinero
--             comprometido. Responde «cuánto nos cuesta mantener esta unidad».
--
--   CONSUMO — lo que salió del almacén y ya se usó. Responde «cuánto material
--             se está gastando de verdad ahí».
--
-- El eje es el destino del pedido: al pedir algo se elige a dónde va, de la
-- lista de almacenes y talleres que reciben compras; si no es ninguno, se
-- escribe. Así `destino_almacen_id` es un eje limpio y `destino` es el escape
-- para lo que no tiene almacén: un frente, la planta de lavado.
--
-- Se agrupan los dos con coalesce, porque quien lee el reporte quiere todas
-- las unidades juntas y no una tabla de almacenes y otra de textos sueltos.
--
-- Las que no dijeron destino salen como «Sin definir» en vez de esconderse: si
-- esa fila crece, lo que hay que arreglar es que se pida sin decir para dónde.
-- ---------------------------------------------------------------------------
create or replace view public.v_gasto_por_unidad as
with pedidos as (
  select s.id                                          as solicitud_id,
         s.destino_almacen_id,
         coalesce(al.nombre, s.destino, 'Sin definir')  as unidad,
         al.tipo                                       as tipo_sitio,
         o.id                                          as orden_id,
         o.creada_en,
         o.total_usd
    from public.solicitudes_pedido s
    left join public.almacenes al on al.id = s.destino_almacen_id
    left join public.ordenes_compra o
           on o.solicitud_id = s.id and o.estado <> 'CANCELADA'
),
consumo as (
  -- Lo que salió del almacén y se usó. La baja no entra: dar algo por perdido
  -- no es consumirlo, y sumarlas haría que un robo pareciera actividad.
  select m.almacen_id, sum(m.valor_usd) as consumido_usd
    from public.inventario_movimientos m
   where m.tipo = 'SALIDA_CONSUMO'
   group by m.almacen_id
)
select p.unidad,
       max(p.tipo_sitio)                                as tipo_sitio,
       max(p.destino_almacen_id)                        as almacen_id,

       count(distinct p.solicitud_id)                   as pedidos,
       count(distinct p.orden_id)                       as ordenes,

       coalesce(sum(p.total_usd), 0)                    as gastado_usd,
       coalesce(sum(p.total_usd) filter (
         where p.creada_en >= date_trunc('month', current_date)
       ), 0)                                            as gastado_mes_usd,

       coalesce(max(c.consumido_usd), 0)                as consumido_usd,
       max(p.creada_en)                                 as ultima_compra
  from pedidos p
  left join consumo c on c.almacen_id = p.destino_almacen_id
 group by p.unidad;

alter view public.v_gasto_por_unidad set (security_invoker = true);

comment on view public.v_gasto_por_unidad is
  'Que unidad genera mas gasto y cual consume mas material. Son dos preguntas '
  'distintas: se puede comprar mucho para un sitio que todavia no lo ha usado.';
