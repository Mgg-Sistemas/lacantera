-- ============================================================================
-- LOS PAGOS DEL BANCO FORZADOS A CUADRAR (06/11/2026)
--
-- Pedido del usuario de sistemas, para cerrar el mes: «Fuerza a que cuadren
-- todas […] necesitamos justificar la entrada de dinero en el banco para poder
-- cerrar mes, cambia el monto de las notas en ese apartado para que cuadre con
-- el del banco, sin tocar las originales». Y sobre el aviso de notas cubiertas
-- de más: «no dejes ningún aviso […] con que no toques la original en notas de
-- entrega se ve el rastro original».
--
-- QUÉ SE HACE:
--  1. Cada enlace pago↔nota gana `ajuste_forzado_en`: cuándo su monto aplicado
--     se forzó para que el pago cuadre con el banco.
--  2. Todo pago vigente con notas cuya suma de montos aplicados no es igual al
--     monto del banco se fuerza: los montos aplicados de sus notas se escalan
--     en proporción y el centavo que sobre del redondeo va a la nota de mayor
--     monto. El pago queda en «Cuadra». Los pagos sin notas no se tocan (no
--     hay a qué aplicar).
--  3. El aviso de «notas cubiertas de más» deja fuera las notas que tienen un
--     enlace forzado: se forzó a propósito.
--
-- NO SE TOCA NINGUNA NOTA DE ENTREGA: ni su total, ni su tasa, ni su estado.
-- Lo forzado vive solo en `pagos_bancarios_notas.monto_aplicado`.
--
-- RESPALDO: antes de cambiar, cada enlace tal como estaba se copia a
-- `private.respaldo_montos_aplicados_20261106` (y la bitácora guarda además el
-- antes y el después de cada fila).
-- ============================================================================

alter table public.pagos_bancarios_notas
  add column if not exists ajuste_forzado_en timestamptz;

comment on column public.pagos_bancarios_notas.ajuste_forzado_en is
  'Cuándo el monto aplicado se forzó para que el pago cuadre con el banco. La nota de entrega no cambia; estas notas no salen en el aviso de cubiertas de más.';

create table if not exists private.respaldo_montos_aplicados_20261106 (
  fila       jsonb not null,
  copiado_en timestamptz not null default now()
);
comment on table private.respaldo_montos_aplicados_20261106 is
  'Cómo estaban los enlaces pago↔nota antes de forzar que los pagos cuadraran con el banco (06/11/2026).';

-- Los pagos que no cuadran, con sus enlaces vigentes.
insert into private.respaldo_montos_aplicados_20261106 (fila)
select to_jsonb(l)
  from public.pagos_bancarios_notas l
 where l.quitado_en is null
   and l.pago_id in (
     select p.id
       from public.pagos_bancarios p
       join public.pagos_bancarios_notas e on e.pago_id = p.id and e.quitado_en is null
      where p.anulado_en is null
      group by p.id, p.monto
     having abs(p.monto - sum(e.monto_aplicado)) >= 0.005);

do $forzar$
declare
  v       record;
  v_resto numeric;
  v_mayor bigint;
begin
  for v in
    select p.id, p.monto, sum(e.monto_aplicado) as aplicado
      from public.pagos_bancarios p
      join public.pagos_bancarios_notas e on e.pago_id = p.id and e.quitado_en is null
     where p.anulado_en is null
     group by p.id, p.monto
    having abs(p.monto - sum(e.monto_aplicado)) >= 0.005
  loop
    update public.pagos_bancarios_notas l
       set monto_aplicado    = round(l.monto_aplicado * v.monto / v.aplicado, 2),
           ajuste_forzado_en = now()
     where l.pago_id = v.id and l.quitado_en is null;

    select v.monto - sum(monto_aplicado) into v_resto
      from public.pagos_bancarios_notas where pago_id = v.id and quitado_en is null;
    select id into v_mayor
      from public.pagos_bancarios_notas where pago_id = v.id and quitado_en is null
     order by monto_aplicado desc, id limit 1;
    update public.pagos_bancarios_notas
       set monto_aplicado = monto_aplicado + v_resto
     where id = v_mayor;
  end loop;

  if exists (
    select 1
      from public.pagos_bancarios p
      join public.pagos_bancarios_notas e on e.pago_id = p.id and e.quitado_en is null
     where p.anulado_en is null
     group by p.id, p.monto
    having abs(p.monto - sum(e.monto_aplicado)) >= 0.005
  ) then
    raise exception 'Quedó algún pago sin cuadrar: no se aplica nada.';
  end if;
end
$forzar$;

-- El aviso: igual que antes, menos las notas con un enlace forzado.
create or replace function public.notas_cubiertas_de_mas_pago_bancario()
returns table (
  nota_id bigint, numero text, fecha date, cliente text, moneda text,
  total numeric, total_usd numeric, aplicado_usd numeric, pagos integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_permiso('VENTAS', 'LECTURA');

  return query
  select n.id, n.numero, n.fecha, cl.nombre, n.moneda::text, n.total,
         n.total_usd, round(private.nota_aplicado_usd(n.id), 2),
         (select count(*)::integer from public.pagos_bancarios_notas o
           join public.pagos_bancarios op on op.id = o.pago_id
          where o.nota_id = n.id and o.quitado_en is null and op.anulado_en is null)
    from public.notas_entrega n
    left join public.clientes cl on cl.id = n.cliente_id
   where exists (select 1 from public.pagos_bancarios_notas l where l.nota_id = n.id and l.quitado_en is null)
     and not exists (select 1 from public.pagos_bancarios_notas f
                      where f.nota_id = n.id and f.quitado_en is null and f.ajuste_forzado_en is not null)
     and private.nota_aplicado_usd(n.id) > n.total_usd + private.nota_margen_usd(n.total_usd)
   order by n.fecha, n.numero;
end;
$$;
