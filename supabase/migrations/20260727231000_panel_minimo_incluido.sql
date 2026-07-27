-- ============================================================================
-- Estar en el mínimo ya es estar bajo el mínimo
--
-- El panel contaba `existencia < stock_minimo` y la pantalla de existencias
-- `<=`. Con dos muelas y un mínimo de dos, una decía "1 artículo bajo el
-- mínimo" y el otro "ninguno". Dos números distintos para la misma pregunta
-- hacen que no se crea ninguno.
--
-- Manda el `<=`: el mínimo es el punto en el que hay que reponer, no el punto
-- a partir del cual ya es tarde.
-- ============================================================================

create or replace view public.v_panel_resumen
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
