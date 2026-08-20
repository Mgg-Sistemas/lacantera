-- ---------------------------------------------------------------------------
-- Lo que falta respaldar es lo que ya ocurrió, no lo que está en cola
--
-- LA PREGUNTA DEL CARRIL DE BASE DE DATOS
--
-- «La vista excluye CANCELADA pero no PROVEEDOR_DESISTIO. ¿Tiene sentido
-- pedirle comprobante a una orden de la que el proveedor se echó atrás?»
--
-- La respuesta no está en el estado. Está en si pasó algo irreversible.
--
-- Una desistida puede haber entregado parte y cobrado: `marcar_desistimiento`
-- admite RECIBIDA_PARCIAL justamente por eso, y OC-2026-0004 está desistida
-- **con un pago hecho**. Ese dinero salió y ese material entró; que el
-- proveedor luego se echara atrás no borra la operación ni la obligación de
-- tener con qué sustentarla.
--
-- Y al revés: una orden recién aprobada, sin material y sin pagos, no tiene
-- nada que respaldar todavía. Aparecer en esta lista solo la convierte en
-- ruido, y una lista con ruido se deja de mirar.
--
-- Así que el filtro deja de mirar el estado y mira los hechos: **entró
-- material o salió dinero**. Lo que está en cola no aparece; el freno de
-- `indicar_pago` ya se encarga de que no llegue a pagarse sin declarar.
-- ---------------------------------------------------------------------------
create or replace view public.v_compras_sin_respaldo as
select o.id,
       o.numero,
       o.estado,
       o.condicion_pago,
       o.comprobante_tipo,
       p.nombre as proveedor,
       o.total,
       o.moneda,
       f.id      as factura_id,
       f.numero_factura,
       (f.id is not null)            as tiene_factura,
       (f.archivo_path is not null)  as tiene_papel,
       case
         when o.comprobante_tipo is null                  then 'SIN_DECLARAR'
         when o.comprobante_tipo = 'FACTURA' and f.id is null
           then 'FACTURA_SIN_REGISTRAR'
         when o.comprobante_tipo = 'FACTURA' and f.archivo_path is null
           then 'FACTURA_SIN_PAPEL'
       end as falta
  from public.ordenes_compra o
  join public.proveedores p on p.id = o.proveedor_id
  left join lateral (
    select f2.id, f2.numero_factura, f2.archivo_path
    from public.facturas_compra f2
    where f2.orden_id = o.id and f2.estado <> 'ANULADA'
    order by f2.id desc
    limit 1
  ) f on true
 where o.estado <> 'CANCELADA'
   -- Solo lo que ya ocurrió. Cancelar reversa las entradas, así que una
   -- cancelada no llega aquí ni por esta puerta.
   and (
     exists (select 1 from public.instrucciones_pago i
              where i.orden_id = o.id and i.estado = 'PAGADA')
     or exists (select 1 from public.orden_renglones r
                 where r.orden_id = o.id and r.cantidad_recibida > 0)
   )
   and (o.comprobante_tipo is null
        or (o.comprobante_tipo = 'FACTURA'
            and (f.id is null or f.archivo_path is null)));

comment on view public.v_compras_sin_respaldo is
  'Compras en las que ya entró material o salió dinero y les falta el respaldo '
  'del proveedor: nadie declaró con qué entrega, o se declaró factura y no se '
  'registró, o se registró y falta el papel. Las que están en cola no salen: '
  'para esas el freno de indicar_pago llega a tiempo.';
