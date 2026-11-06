-- ============================================================================
-- LAS NOTAS DE ENTREGA DE UN PERÍODO QUE NO TIENEN NINGÚN PAGO (06/11/2026)
--
-- Para el cierre de mes de Ventas › Registros de pagos. El cierre no es solo
-- «qué pagos del banco no tienen notas»: también «qué notas del mes no tienen
-- pago». Con las dos listas el papel dice lo pendiente de los dos lados.
--
-- Solo lectura. Va por `security definer` por la misma razón que el resto del
-- submódulo: la tabla de notas solo la leen Salidas y Facturación, y esto se
-- consulta desde Ventas. Fuera quedan las anuladas y las de total cero (las
-- sin cargo no esperan pago). Un pago anulado o un enlace quitado no cuentan
-- como pago.
-- ============================================================================

create or replace function public.notas_sin_pago_bancario(p_desde date, p_hasta date)
returns table (
  nota_id bigint, numero text, fecha date, cliente text, moneda text,
  total numeric, total_bs numeric, total_usd numeric, facturable boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_permiso('VENTAS', 'LECTURA');

  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El período no es válido.' using errcode = '22023';
  end if;

  return query
  select n.id, n.numero, n.fecha, cl.nombre, n.moneda::text,
         n.total, n.total_bs, n.total_usd, n.facturable
    from public.notas_entrega n
    left join public.clientes cl on cl.id = n.cliente_id
   where n.estado <> 'ANULADA'
     and n.fecha between p_desde and p_hasta
     and n.total > 0
     and not exists (
           select 1
             from public.pagos_bancarios_notas l
             join public.pagos_bancarios p on p.id = l.pago_id
            where l.nota_id = n.id and l.quitado_en is null and p.anulado_en is null)
   order by n.fecha, n.numero;
end;
$$;

revoke all on function public.notas_sin_pago_bancario(date, date) from public, anon;
grant execute on function public.notas_sin_pago_bancario(date, date) to authenticated;
