-- ============================================================================
-- El panel deja de estar inventado
--
-- La pantalla de inicio mostraba producción, despachos y nómina de ejemplo:
-- números redondos puestos a mano cuando todavía no había ningún módulo. Ahora
-- que compras, inventario y tesorería llevan datos reales, esas cifras falsas
-- al lado de las verdaderas son peores que no mostrar nada: nadie sabe cuáles
-- creer.
--
-- Los totales se calculan aquí y no en el navegador. Sumar en la pantalla
-- obliga a bajarse cada movimiento y cada tarjeta para devolver un número, y
-- con dos años de operación eso deja de abrir.
-- ============================================================================

create or replace view public.v_panel_resumen
with (security_invoker = on) as
select
  -- Compras, por dónde va cada una
  (select count(*) from public.v_compras_tablero where columna = 'PEDIDO')     as compras_pedido,
  (select count(*) from public.v_compras_tablero where columna = 'CONFIRMADA') as compras_cotizando,
  (select count(*) from public.v_compras_tablero where columna = 'GERENTE')    as compras_por_aprobar,
  (select count(*) from public.v_compras_tablero where columna = 'APROBADA')   as compras_aprobadas,
  (select count(*) from public.v_compras_tablero where columna = 'PAGADA')     as compras_pagadas_sin_recibir,

  -- Dinero que ya salió y todavía no tiene material enfrente. Es la cifra que
  -- justifica que estas compras no se archiven solas.
  (select coalesce(sum(total_usd), 0) from public.v_compras_tablero where columna = 'PAGADA')
    as pagado_sin_recibir_usd,
  (select count(*) from public.v_compras_tablero
    where columna = 'PAGADA' and coalesce(dias_sin_recibir, 0) > 7)
    as compras_atrasadas,

  -- Lo que se debe: instrucciones autorizadas que no han salido del banco.
  (select count(*) from public.v_cuentas_por_pagar)                as por_pagar_n,
  (select coalesce(sum(monto_usd), 0) from public.v_cuentas_por_pagar) as por_pagar_usd,
  (select coalesce(max(dias_esperando), 0) from public.v_cuentas_por_pagar)
    as pago_mas_viejo_dias,

  -- Lo que hay. Cada moneda por separado: sumarlas con la tasa de hoy
  -- escondería que se puede tener mucho bolívar y ningún dólar justo el día
  -- que hay que pagarle a un proveedor en divisas.
  (select coalesce(sum(saldo), 0) from public.v_saldos_tesoreria
    where activa and moneda = 'USD') as disponible_usd,
  (select coalesce(sum(saldo), 0) from public.v_saldos_tesoreria
    where activa and moneda = 'VES') as disponible_ves,
  (select count(*) from public.cuentas_tesoreria c
    where c.activa and not exists (
      select 1 from public.tesoreria_movimientos m where m.cuenta_id = c.id))
    as cuentas_sin_abrir,

  -- Inventario: lo que vale y lo que está por acabarse.
  (select coalesce(sum(valor_usd), 0) from public.v_existencias) as inventario_usd,
  (select count(*) from public.v_existencias
    where stock_minimo > 0 and existencia < stock_minimo) as articulos_bajo_minimo,

  -- Si no hay tasa de hoy, no se puede emitir ningún documento valorado: es lo
  -- primero que hay que arreglar por la mañana.
  (select exists (
     select 1 from public.tasas_cambio
     where moneda_origen = 'USD' and moneda_destino = 'VES'
       and fuente = 'BCV' and fecha = current_date))
    as tasa_de_hoy;

grant select on public.v_panel_resumen to authenticated;
