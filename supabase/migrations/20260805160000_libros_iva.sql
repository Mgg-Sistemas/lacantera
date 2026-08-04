-- ============================================================================
-- El libro de ventas del IVA
--
-- El de compras existe desde el 5 de agosto. Este faltaba, y sin los dos no se
-- declara: el IVA que se paga se descuenta del que se cobra, y para eso hacen
-- falta las dos columnas.
--
-- Dos decisiones que lo separan del de compras:
--
--   · Las facturas anuladas SÍ aparecen, en cero y marcadas. En el libro de
--     compras el número de control es del proveedor y un hueco no es asunto
--     nuestro. Aquí el número de control es el nuestro, sale de la numeración
--     autorizada de la imprenta y tiene que correr continua. Un salto sin
--     explicación en la serie es exactamente lo que se busca en una
--     fiscalización; una fila que dice "anulada" lo explica sola.
--
--   · Las notas de crédito van en el mismo libro, en negativo y apuntando a la
--     factura que corrigen. No son otro libro ni un anexo: para el SENIAT son
--     ventas del período con signo contrario.
--
-- Cada fila trae sus cifras dos veces: en la moneda en que se emitió el
-- documento y en bolívares a la tasa que ese documento congeló. El libro se
-- declara en bolívares y aquí se factura en las dos monedas, así que sumar la
-- columna en moneda original daría un número que no es ni dólares ni bolívares.
-- La conversión usa la tasa del documento, no la de hoy: es la que se le cobró
-- al cliente.
--
-- Las columnas se llaman como se llaman en la planilla, no como en el resto del
-- sistema. Quien las transcriba tiene que reconocerlas de una pasada.
-- ============================================================================

create or replace view public.v_libro_ventas
with (security_invoker = on) as

-- Lo exento no se guarda: se despeja. total = base + exento + iva, así que lo
-- exento es lo que queda al quitarle a la factura su base y su impuesto. Sale
-- del mismo sitio del que salió el total, y no de una segunda suma que podría
-- decir otra cosa.
select
  'FACTURA-' || f.id::text     as clave,
  f.id,
  'FACTURA'                    as documento,
  f.fecha,
  cl.rif                       as rif_cliente,
  cl.nombre                    as cliente,
  f.numero,
  f.numero_control,
  null::text                   as afecta_a,
  f.estado = 'ANULADA'         as anulada,
  f.moneda,
  f.tasa,
  f.alicuota_iva,
  case when f.estado = 'ANULADA' then 0
       else round(f.total - f.iva - f.base_imponible, 2) end as ventas_exentas,
  case when f.estado = 'ANULADA' then 0 else f.base_imponible end as base_imponible,
  case when f.estado = 'ANULADA' then 0 else f.iva            end as debito_fiscal,
  case when f.estado = 'ANULADA' then 0 else f.total          end as total_ventas,
  case when f.estado = 'ANULADA' then 0 else f.retencion_iva  end as iva_retenido,
  case when f.estado = 'ANULADA' then 0
       else round((f.total - f.iva - f.base_imponible) * f.tasa, 2) end as ventas_exentas_bs,
  case when f.estado = 'ANULADA' then 0 else round(f.base_imponible * f.tasa, 2) end as base_imponible_bs,
  case when f.estado = 'ANULADA' then 0 else round(f.iva           * f.tasa, 2) end as debito_fiscal_bs,
  case when f.estado = 'ANULADA' then 0 else round(f.total         * f.tasa, 2) end as total_ventas_bs,
  case when f.estado = 'ANULADA' then 0 else round(f.retencion_iva * f.tasa, 2) end as iva_retenido_bs
from public.facturas_venta f
join public.clientes cl on cl.id = f.cliente_id

union all

-- En negativo. Una nota de crédito de $100 no es una venta de $100: es una
-- venta de menos cien, y así es como cuadra el período.
select
  'NOTA-' || nc.id::text       as clave,
  nc.id,
  'NOTA_CREDITO'               as documento,
  nc.fecha,
  cl.rif                       as rif_cliente,
  cl.nombre                    as cliente,
  nc.numero,
  nc.numero_control,
  f.numero_control             as afecta_a,
  nc.estado = 'ANULADA'        as anulada,
  nc.moneda,
  nc.tasa,
  nc.alicuota_iva,
  case when nc.estado = 'ANULADA' then 0
       else -round(nc.total - nc.iva - nc.base_imponible, 2) end as ventas_exentas,
  case when nc.estado = 'ANULADA' then 0 else -nc.base_imponible end as base_imponible,
  case when nc.estado = 'ANULADA' then 0 else -nc.iva            end as debito_fiscal,
  case when nc.estado = 'ANULADA' then 0 else -nc.total          end as total_ventas,
  0::numeric                   as iva_retenido,
  case when nc.estado = 'ANULADA' then 0
       else -round((nc.total - nc.iva - nc.base_imponible) * nc.tasa, 2) end as ventas_exentas_bs,
  case when nc.estado = 'ANULADA' then 0 else -round(nc.base_imponible * nc.tasa, 2) end as base_imponible_bs,
  case when nc.estado = 'ANULADA' then 0 else -round(nc.iva            * nc.tasa, 2) end as debito_fiscal_bs,
  case when nc.estado = 'ANULADA' then 0 else -round(nc.total          * nc.tasa, 2) end as total_ventas_bs,
  0::numeric                   as iva_retenido_bs
from public.notas_credito nc
join public.clientes cl on cl.id = nc.cliente_id
join public.facturas_venta f on f.id = nc.factura_id;

grant select on public.v_libro_ventas to authenticated;

-- ---------------------------------------------------------------------------
-- Y el de compras aprende dos columnas
--
-- Le faltaba la tasa y la retención en bolívares. Sin la tasa, la pantalla no
-- puede enseñar al lado la cifra en la moneda del papel; sin la retención
-- convertida, la única columna que quedaba fuera del total en bolívares era
-- justo la que se resta.
-- ---------------------------------------------------------------------------
create or replace view public.v_libro_compras
with (security_invoker = on) as
select
  f.id,
  f.fecha_emision           as fecha,
  p.rif                     as rif_proveedor,
  p.nombre                  as proveedor,
  f.numero_factura,
  f.numero_control,
  f.moneda,
  f.exento                  as compras_exentas,
  f.base_imponible          as base_imponible,
  f.alicuota_iva,
  f.iva                     as credito_fiscal,
  f.total                   as total_compras,
  f.retencion_iva           as iva_retenido,
  round(f.exento         * f.tasa, 2) as compras_exentas_bs,
  round(f.base_imponible * f.tasa, 2) as base_imponible_bs,
  round(f.iva            * f.tasa, 2) as credito_fiscal_bs,
  round(f.total          * f.tasa, 2) as total_compras_bs,
  f.tasa,
  round(f.retencion_iva  * f.tasa, 2) as iva_retenido_bs
from public.facturas_compra f
join public.proveedores p on p.id = f.proveedor_id
where f.estado <> 'ANULADA';

grant select on public.v_libro_compras to authenticated;
