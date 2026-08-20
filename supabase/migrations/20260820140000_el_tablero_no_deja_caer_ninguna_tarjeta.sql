-- ---------------------------------------------------------------------------
-- El tablero no puede dejar caer ninguna tarjeta
--
-- QUEDABA UN HUECO
--
-- `20260819290000` anadio la rama de POR_RECIBIR y una red para cualquier
-- estado de orden no contemplado. Pero el CASE seguia terminando en un ELSE
-- implicito que devuelve null, y una tarjeta sin columna NO SE DIBUJA EN
-- NINGUNA: la compra desaparece del tablero sin dejar rastro. Ese hueco lo
-- alcanzaba todavia una solicitud APROBADA cuya orden faltara.
--
-- Lo senalo el carril de base de datos: el problema no es solo que faltara una
-- rama, es que el diseno hace que este tipo de fallo se manifieste como
-- DESAPARICION en vez de como error. Ahora el ultimo recurso manda la tarjeta a
-- la primera columna, donde estorba y se ve.
--
-- Y DE PASO, UN CAMPO QUE EL FRONT CREIA TENER
--
-- `Tarjeta.destino_almacen_id` estaba declarado en la interface de
-- compras.ts y la vista no lo devolvia: llegaba `undefined` en silencio, porque
-- `desenvolver<T>` es un cast y no valida nada. Se expone en la vista, que es
-- lo que el tipo decia desde el principio.
-- ---------------------------------------------------------------------------
drop view if exists public.v_panel_resumen;
drop view if exists public.v_compras_tablero;

create view public.v_compras_tablero
with (security_invoker = on) as
select
  s.id                       as solicitud_id,
  s.numero,
  s.titulo,
  s.prioridad,
  s.requerida_para,
  s.destino,
  -- Lo declaraba la interface del front y la vista no lo devolvia.
  s.destino_almacen_id,
  s.estado                   as estado_solicitud,
  s.creada_en,
  s.solicitante_id,
  coalesce(pide.nombre, s.solicitante_nombre, per.nombre) as solicitante,
  coalesce(pide.cargo, s.solicitante_cargo)               as solicitante_cargo,
  s.registrada_por,
  per.nombre                 as registrada_por_nombre,
  o.id                       as orden_id,
  o.numero                   as orden_numero,
  o.estado                   as estado_orden,
  -- Hace falta en la tarjeta: una orden contra entrega se lee distinto, porque
  -- recibe antes de pagar.
  o.condicion_pago,
  o.fecha_pago,
  o.entrega_estimada,
  o.desistio_resolucion,

  coalesce(prov_o.nombre, prov_c.nombre) as proveedor,
  coalesce(o.moneda, cot.moneda)         as moneda,
  coalesce(o.total, cot.total)           as total,
  coalesce(o.total_usd, cot.total_usd)   as total_usd,
  coalesce(o.total_bs, cot.total_bs)     as total_bs,

  (select count(*) from public.cotizaciones c where c.solicitud_id = s.id) as cotizaciones,
  (select count(*) from public.solicitud_renglones r where r.solicitud_id = s.id) as renglones,

  case when o.fecha_pago is not null and o.estado in
            ('PAGADA_POR_RECIBIR', 'RECIBIDA_PARCIAL', 'PROVEEDOR_DESISTIO')
       then current_date - o.fecha_pago end as dias_sin_recibir,

  case
    when s.estado in ('BORRADOR', 'PEDIDO')     then 'PEDIDO'
    when s.estado = 'CONFIRMADA'                then 'CONFIRMADA'
    when s.estado = 'POR_CONFIRMAR_GERENTE'     then 'GERENTE'
    when s.estado = 'CANCELADA'                 then 'CANCELADA'
    when o.estado = 'CANCELADA'                 then 'CANCELADA'
    when o.estado = 'PROVEEDOR_DESISTIO'        then 'DESISTIO'
    when o.estado in ('POR_RECIBIR', 'POR_INDICAR_PAGO', 'EN_TESORERIA') then 'APROBADA'
    when o.estado in ('PAGADA_POR_RECIBIR', 'RECIBIDA_PARCIAL') then 'PAGADA'
    when o.estado = 'RECIBIDA'                  then 'RECIBIDA'
    when o.id is not null                       then 'APROBADA'
    -- El ultimo recurso, que antes era null. Estorbar se puede corregir;
    -- desaparecer sin ruido, no.
    else 'PEDIDO'
  end as columna
from public.solicitudes_pedido s
left join public.perfiles per  on per.id  = s.registrada_por
left join public.perfiles pide on pide.id = s.solicitante_id

left join lateral (
  select oc.*
  from public.ordenes_compra oc
  where oc.solicitud_id = s.id
  order by (oc.estado = 'CANCELADA'), oc.id desc
  limit 1
) o on true

left join public.cotizaciones cot on cot.id = s.cotizacion_elegida_id
left join public.proveedores prov_o on prov_o.id = o.proveedor_id
left join public.proveedores prov_c on prov_c.id = cot.proveedor_id;

grant select on public.v_compras_tablero to authenticated;

comment on view public.v_compras_tablero is
  'Una fila por compra, con la columna del tablero donde va. El CASE no puede '
  'devolver null: una tarjeta sin columna desaparece del tablero sin dejar '
  'rastro.';

create view public.v_panel_resumen
with (security_invoker = on) as
select
  (select count(*) from public.v_compras_tablero where columna = 'PEDIDO')     as compras_pedido,
  (select count(*) from public.v_compras_tablero where columna = 'CONFIRMADA') as compras_cotizando,
  (select count(*) from public.v_compras_tablero where columna = 'GERENTE')    as compras_por_aprobar,
  (select count(*) from public.v_compras_tablero where columna = 'APROBADA')   as compras_aprobadas,
  (select count(*) from public.v_compras_tablero where columna = 'PAGADA')     as compras_pagadas_sin_recibir,

  (select coalesce(sum(total_usd), 0) from public.v_compras_tablero where columna = 'PAGADA')
    as pagado_sin_recibir_usd,
  (select count(*) from public.v_compras_tablero
    where columna = 'PAGADA' and coalesce(dias_sin_recibir, 0) > 7)
    as compras_atrasadas,

  (select count(*) from public.v_cuentas_por_pagar)                    as por_pagar_n,
  (select coalesce(sum(monto_usd), 0) from public.v_cuentas_por_pagar) as por_pagar_usd,
  (select coalesce(max(dias_esperando), 0) from public.v_cuentas_por_pagar)
    as pago_mas_viejo_dias,

  (select coalesce(sum(saldo), 0) from public.v_saldos_tesoreria
    where activa and moneda = 'USD') as disponible_usd,
  (select coalesce(sum(saldo), 0) from public.v_saldos_tesoreria
    where activa and moneda = 'VES') as disponible_ves,
  (select count(*) from public.cuentas_tesoreria c
    where c.activa and not exists (
      select 1 from public.tesoreria_movimientos m where m.cuenta_id = c.id))
    as cuentas_sin_abrir,

  (select coalesce(sum(valor_usd), 0) from public.v_existencias) as inventario_usd,
  (select count(*) from public.v_existencias
    where stock_minimo > 0 and existencia <= stock_minimo) as articulos_bajo_minimo,

  (select exists (
     select 1 from public.tasas_cambio
     where moneda_origen = 'USD' and moneda_destino = 'VES'
       and fuente = 'BCV' and fecha = current_date))
    as tasa_de_hoy;

grant select on public.v_panel_resumen to authenticated;
