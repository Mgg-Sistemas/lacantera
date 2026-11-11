-- ============================================================================
-- EL INFORME DE GASTOS Y EL COMPARATIVO GASTOS VS. VENTAS (10/11/2026)
--
-- Pedido: un reporte PDF de los gastos del módulo Gastos y otro que los
-- compare con las ventas de material —notas de entrega DESPACHADAS—, sin las
-- que siguen por cobrar; con rango de fechas, mes y las opciones que hagan
-- falta. Con un interruptor (apagado) para sumar también las órdenes pagadas
-- del módulo Compras, en su propia línea.
--
-- Una sola función de lectura que trae los documentos del rango, cada uno en
-- su moneda original y con su equivalente en Bs y en $:
--   · GASTO / GASTO_ANULADO: las facturas de Gastos. No guardan tasa, así que
--     el equivalente sale de la tasa BCV del dólar del día de la factura (o la
--     última anterior; si no hay ninguna anterior, la primera que exista).
--   · VENTA: nota DESPACHADA de contado, o a crédito ya cobrada. Trae su total
--     en Bs y en $ con la tasa del día en que se hizo, como el resto de Ventas.
--   · POR_COBRAR: nota DESPACHADA a crédito sin cobrar. Va aparte y no se suma:
--     el informe la menciona solo como dato.
--   · COMPRA: órdenes del módulo Compras ya pagadas, por su fecha de pago
--     (flujo anterior con sus totales Bs/$; flujo nuevo en dólares, con la
--     tasa BCV del día del pago).
-- Nunca se suman monedas distintas tal cual: lo que se suma son los
-- equivalentes, y el informe lo dice.
--
-- Puertas: Gastos en lectura siempre; las ventas solo a quien ve Ventas o
-- Facturación; las compras solo a quien ve Compras. Solo lectura.
-- ============================================================================

create or replace function public.informe_gastos_y_ventas(
  p_desde date,
  p_hasta date,
  p_con_ventas boolean default true,
  p_con_compras boolean default false
)
returns table (
  tipo text,
  id bigint,
  numero text,
  fecha date,
  contraparte text,
  documento text,
  categoria text,
  categoria_nombre text,
  detalle text,
  moneda text,
  monto numeric,
  tasa numeric,
  total_bs numeric,
  total_usd numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.exigir_permiso('GASTOS', 'LECTURA');

  if p_desde is null or p_hasta is null then
    raise exception 'Indique desde qué fecha y hasta qué fecha.' using errcode = '22023';
  end if;
  if p_hasta < p_desde then
    raise exception 'La fecha final no puede ser anterior a la inicial.' using errcode = '22023';
  end if;

  if p_con_ventas
     and not (private.tiene_permiso('VENTAS', 'LECTURA') or private.tiene_permiso('FACTURACION', 'LECTURA')) then
    raise exception 'Para comparar con las ventas hace falta acceso a Ventas o a Facturación.'
      using errcode = '42501';
  end if;
  if p_con_compras and not private.tiene_permiso('COMPRAS', 'LECTURA') then
    raise exception 'Para sumar las órdenes de Compras hace falta acceso a Compras.'
      using errcode = '42501';
  end if;

  -- Las facturas de Gastos, con el equivalente a la tasa BCV de su día.
  return query
  select case when g.anulada_en is null then 'GASTO' else 'GASTO_ANULADO' end,
         g.id, g.numero, g.fecha, g.proveedor, g.documento_proveedor,
         g.categoria, g.categoria_nombre, g.observacion,
         g.moneda::text, g.monto, t.tasa,
         round(case when g.moneda = 'VES' then g.monto else g.monto * t.tasa end, 2),
         round(case when g.moneda = 'VES' then g.monto / nullif(t.tasa, 0)
                    when g.moneda = 'USD' then g.monto
                    else g.monto * t.tasa / nullif(tu.tasa, 0) end, 2)
    from public.v_gastos_facturas g
    left join lateral (
      select coalesce(
        (select c.tasa from public.tasas_cambio c
          where c.moneda_origen = case when g.moneda::text = 'VES' then 'USD' else g.moneda::text end
            and c.moneda_destino = 'VES' and c.fuente = 'BCV' and c.fecha <= g.fecha
          order by c.fecha desc limit 1),
        (select c.tasa from public.tasas_cambio c
          where c.moneda_origen = case when g.moneda::text = 'VES' then 'USD' else g.moneda::text end
            and c.moneda_destino = 'VES' and c.fuente = 'BCV'
          order by c.fecha asc limit 1)) as tasa
    ) t on true
    left join lateral (
      select c.tasa from public.tasas_cambio c
       where c.moneda_origen = 'USD' and c.moneda_destino = 'VES' and c.fuente = 'BCV' and c.fecha <= g.fecha
       order by c.fecha desc limit 1
    ) tu on true
   where g.fecha between p_desde and p_hasta;

  if p_con_ventas then
    return query
    select case when n.pendiente_por_cobrar and n.cobrada_en is null then 'POR_COBRAR' else 'VENTA' end,
           n.id, n.numero, n.fecha, coalesce(cl.nombre, 'SIN CLIENTE'), cl.rif,
           null::text, null::text, null::text,
           n.moneda::text, n.total, n.tasa_usd,
           round(n.total_bs, 2), round(n.total_usd, 2)
      from public.notas_entrega n
      left join public.clientes cl on cl.id = n.cliente_id
     where n.estado = 'DESPACHADA'
       and n.fecha between p_desde and p_hasta;
  end if;

  if p_con_compras then
    -- Flujo anterior: la orden pagada, por su fecha de pago.
    return query
    select 'COMPRA', o.id, o.numero, coalesce(o.fecha_pago, (o.pagada_en at time zone 'America/Caracas')::date),
           coalesce(p.nombre, '—'), p.rif, null::text, 'Órdenes de compra'::text, null::text,
           o.moneda::text, o.total, o.tasa_usd, round(o.total_bs, 2), round(o.total_usd, 2)
      from public.ordenes_compra o
      left join public.proveedores p on p.id = o.proveedor_id
     where o.pagada_en is not null
       and coalesce(o.fecha_pago, (o.pagada_en at time zone 'America/Caracas')::date) between p_desde and p_hasta;

    -- Flujo nuevo (Pedidos / Compras): en dólares, con la tasa BCV del día del pago.
    return query
    select 'COMPRA', o.id, coalesce(o.oc_codigo, o.codigo),
           coalesce(o.pago_fecha, (o.pagada_en at time zone 'America/Caracas')::date),
           coalesce(p.nombre, '—'), p.rif, null::text, 'Órdenes de compra'::text, null::text,
           'USD', coalesce(o.pago_monto_usd, o.total), t.tasa,
           round(coalesce(o.pago_monto_usd, o.total) * t.tasa, 2), round(coalesce(o.pago_monto_usd, o.total), 2)
      from public.compras_ordenes o
      left join public.proveedores p on p.id = o.proveedor_id
      left join lateral (
        select c.tasa from public.tasas_cambio c
         where c.moneda_origen = 'USD' and c.moneda_destino = 'VES' and c.fuente = 'BCV'
           and c.fecha <= coalesce(o.pago_fecha, (o.pagada_en at time zone 'America/Caracas')::date)
         order by c.fecha desc limit 1
      ) t on true
     where o.pagada_en is not null
       and coalesce(o.condiciones_pago, '') <> 'credito'
       and o.estado not in ('anulada', 'cancelada')
       and coalesce(o.pago_fecha, (o.pagada_en at time zone 'America/Caracas')::date) between p_desde and p_hasta;

    -- Las compras a crédito del flujo nuevo se cuentan por sus abonos, cada uno en
    -- su fecha (la orden a crédito no se cuenta entera, para no contarla dos veces).
    return query
    select 'COMPRA', a.id, coalesce(o.oc_codigo, o.codigo) || ' · abono', a.fecha,
           coalesce(p.nombre, '—'), p.rif, null::text, 'Órdenes de compra'::text, null::text,
           'USD', a.monto, t.tasa, round(a.monto * t.tasa, 2), round(a.monto, 2)
      from public.compras_abonos a
      join public.compras_ordenes o on o.id = a.orden_id
      left join public.proveedores p on p.id = o.proveedor_id
      left join lateral (
        select c.tasa from public.tasas_cambio c
         where c.moneda_origen = 'USD' and c.moneda_destino = 'VES' and c.fuente = 'BCV' and c.fecha <= a.fecha
         order by c.fecha desc limit 1
      ) t on true
     where o.condiciones_pago = 'credito'
       and o.estado not in ('anulada', 'cancelada')
       and a.fecha between p_desde and p_hasta;
  end if;
end;
$$;

comment on function public.informe_gastos_y_ventas(date, date, boolean, boolean) is
  'Gastos (y, si se pide, ventas despachadas y compras pagadas) de un rango, con su equivalente en Bs y $. Para los reportes PDF de Gastos. Solo lectura.';

revoke all on function public.informe_gastos_y_ventas(date, date, boolean, boolean) from public, anon;
grant execute on function public.informe_gastos_y_ventas(date, date, boolean, boolean) to authenticated;
