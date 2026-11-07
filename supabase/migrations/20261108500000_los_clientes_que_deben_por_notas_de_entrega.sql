-- ============================================================================
-- LOS CLIENTES QUE DEBEN POR NOTAS DE ENTREGA (07/11/2026)
--
-- Pedido: en Ventas › Clientes, «un apartado de los clientes que tienen
-- cuentas por cobrar, ejemplo FUNDACION VENEZUELA RENACE. Toma la información
-- de los que deben desde notas de entregas, cuentas por cobrar. Que tenga un
-- reporte de los clientes que deben con su monto correspondiente».
--
-- La columna «Deuda» de Clientes (`private.deuda_cliente`) solo cuenta
-- facturas y es la que descuenta del límite de crédito; no se toca. Lo de las
-- notas va aparte: las notas marcadas pendientes por cobrar, todavía sin
-- cobrar y no anuladas —las mismas que Notas de entrega y Cuentas por cobrar
-- enseñan como «Por cobrar» o «Vencida»—.
--
-- Solo lectura. `security definer` porque la tabla de notas solo la leen
-- Salidas y Facturación, y quien entra a Clientes por Ventas tiene que poder
-- ver lo que se le debe a la empresa.
-- ============================================================================

create or replace function public.notas_por_cobrar_de_clientes()
returns table (
  cliente_id bigint, cliente text, rif text,
  nota_id bigint, numero text, fecha date, fecha_pago date, vencida boolean,
  moneda text, total numeric, total_bs numeric, total_usd numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_permiso('VENTAS', 'LECTURA');

  return query
  select n.cliente_id, cl.nombre, cl.rif,
         n.id, n.numero, n.fecha, n.fecha_pago,
         coalesce(n.fecha_pago < current_date, false),
         n.moneda::text, n.total, n.total_bs, n.total_usd
    from public.notas_entrega n
    left join public.clientes cl on cl.id = n.cliente_id
   where n.pendiente_por_cobrar
     and n.cobrada_en is null
     and n.estado <> 'ANULADA'
   order by cl.nombre nulls last, n.fecha_pago nulls last, n.numero;
end;
$$;

comment on function public.notas_por_cobrar_de_clientes() is
  'Las notas de entrega pendientes por cobrar (sin cobrar, no anuladas), con su cliente. Para Ventas › Clientes y su reporte. Solo lectura.';

revoke all on function public.notas_por_cobrar_de_clientes() from public, anon;
grant execute on function public.notas_por_cobrar_de_clientes() to authenticated;
