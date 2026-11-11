/*
  LA NÓMINA EN LOS REPORTES PDF DE GASTOS (11/11/2026).

  Pedido: «Inclúyeme en el reporte los gastos de nómina correspondientes al
  mes». Decisiones del usuario:
    · Cada nómina cuenta en el mes en que TERMINA su período (la quincena del
      16 al 31 de octubre va a octubre aunque se pague en noviembre).
    · El monto es lo ASIGNADO más los aportes patronales: lo que le costó a la
      empresa (las deducciones también son costo, solo que se le pagan a otro).
    · Entran las nóminas APROBADAS o PAGADAS; nunca BORRADOR, CALCULADA ni
      ANULADA.

  Una línea por nómina, no por empleado: el reporte no abre sueldos. Se pide
  con `p_con_nomina` y exige NÓMINA en lectura, igual que Ventas o Compras.

  La firma cambia (un parámetro más), así que la versión anterior se RENOMBRA
  con sufijo de fecha en vez de borrarse (regla del proyecto: nada de DROP).
*/

alter function public.informe_gastos_y_ventas(date, date, boolean, boolean)
  rename to informe_gastos_y_ventas_viejo_20261111;
comment on function public.informe_gastos_y_ventas_viejo_20261111(date, date, boolean, boolean) is
  'Reemplazada el 11/11/2026 por informe_gastos_y_ventas(date, date, boolean, boolean, boolean), que suma la nómina. Se conserva renombrada, no se borra.';
revoke execute on function public.informe_gastos_y_ventas_viejo_20261111(date, date, boolean, boolean) from authenticated;

create function public.informe_gastos_y_ventas(
  p_desde date,
  p_hasta date,
  p_con_ventas boolean default true,
  p_con_compras boolean default false,
  p_con_nomina boolean default false
)
 returns table(tipo text, id bigint, numero text, fecha date, contraparte text, documento text, categoria text, categoria_nombre text, detalle text, moneda text, monto numeric, tasa numeric, total_bs numeric, total_usd numeric)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
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
  if p_con_nomina and not private.tiene_permiso('NOMINA', 'LECTURA') then
    raise exception 'Para sumar la nómina hace falta acceso a Nómina.'
      using errcode = '42501';
  end if;

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
    return query
    select 'COMPRA', o.id, o.numero, coalesce(o.fecha_pago, (o.pagada_en at time zone 'America/Caracas')::date),
           coalesce(p.nombre, '—'), p.rif, null::text, 'Órdenes de compra'::text, null::text,
           o.moneda::text, o.total, o.tasa_usd, round(o.total_bs, 2), round(o.total_usd, 2)
      from public.ordenes_compra o
      left join public.proveedores p on p.id = o.proveedor_id
     where o.pagada_en is not null
       and coalesce(o.fecha_pago, (o.pagada_en at time zone 'America/Caracas')::date) between p_desde and p_hasta;

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

  -- La nómina: una línea por período, fechada el último día del período, por
  -- lo asignado más los aportes, en bolívares y a la tasa de la propia nómina.
  if p_con_nomina then
    return query
    select 'NOMINA', np.id, np.numero, np.hasta,
           'NÓMINA ' || np.tipo || ' · ' || r.n || case when r.n = 1 then ' trabajador' else ' trabajadores' end,
           null::text, 'NOMINA'::text, 'Nómina'::text,
           'Del ' || to_char(np.desde, 'DD/MM/YYYY') || ' al ' || to_char(np.hasta, 'DD/MM/YYYY')
             || ' · ' || initcap(np.estado),
           'VES', r.costo, np.tasa_usd,
           round(r.costo, 2), round(r.costo / nullif(np.tasa_usd, 0), 2)
      from public.nomina_periodos np
      join lateral (
        select count(*) as n,
               coalesce(sum(coalesce(re.total_asignaciones, 0) + coalesce(re.total_aportes, 0)), 0) as costo
          from public.nomina_recibos re
         where re.periodo_id = np.id
      ) r on true
     where np.estado in ('APROBADA', 'PAGADA')
       and np.hasta between p_desde and p_hasta
       and r.n > 0;
  end if;
end;
$function$;

comment on function public.informe_gastos_y_ventas(date, date, boolean, boolean, boolean) is
  'Documentos de los reportes PDF de Gastos: gastos siempre; notas despachadas, órdenes de Compras pagadas y nóminas aprobadas o pagadas (una línea por período, por lo asignado más aportes, en el mes en que termina) cuando se piden. 11/11/2026.';

revoke execute on function public.informe_gastos_y_ventas(date, date, boolean, boolean, boolean) from public, anon;
grant execute on function public.informe_gastos_y_ventas(date, date, boolean, boolean, boolean) to authenticated, service_role;
