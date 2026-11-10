-- VENTAS COMO COMPRAS · FASE 5: LA CONCILIACIÓN COBRA LA NOTA (la dueña,
-- 10/11/2026: «¿Cómo se marca que una nota de entrega sin factura ya se pagó?
-- → Con la conciliación de pagos»).
--
-- La nota «pendiente por cobrar» queda cobrada sola cuando los pagos
-- conciliados la cubren (y vuelve a pendiente si se quita o se anula el pago).
-- Así el aviso de «pasó la fecha de pago» y la pantalla de Notas de entrega
-- dicen lo mismo que el tablero. «Marcar como cobrada» a mano ya no se ofrece.

create or replace function private.nota_cobrada_por_conciliacion(p_nota bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total    numeric;
  v_aplicado numeric;
  v_ultimo   timestamptz;
begin
  if p_nota is null then
    return;
  end if;

  select n.total_usd into v_total
    from public.notas_entrega n
   where n.id = p_nota and n.pendiente_por_cobrar and n.estado <> 'ANULADA';
  if not found or coalesce(v_total, 0) <= 0 then
    return;
  end if;

  select coalesce(sum(pbn.monto_aplicado), 0), max(pbn.asociado_en)
    into v_aplicado, v_ultimo
    from public.pagos_bancarios_notas pbn
    join public.pagos_bancarios pb on pb.id = pbn.pago_id
   where pbn.nota_id = p_nota and pbn.quitado_en is null and pb.anulado_en is null;

  if v_aplicado >= v_total - 0.05 then
    update public.notas_entrega
       set cobrada_en = coalesce(cobrada_en, v_ultimo, now())
     where id = p_nota and cobrada_en is null;
  else
    -- Solo se deshace lo que la conciliación había puesto: una nota marcada
    -- a mano antes del 10/11/2026 (sin pagos enlazados) no se toca.
    update public.notas_entrega
       set cobrada_en = null
     where id = p_nota and cobrada_en is not null
       and exists (select 1 from public.pagos_bancarios_notas x where x.nota_id = p_nota);
  end if;
end;
$$;

create or replace function private.trg_conciliacion_cobra_la_nota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nota bigint;
begin
  if tg_table_name = 'pagos_bancarios_notas' then
    if tg_op in ('INSERT', 'UPDATE') then
      perform private.nota_cobrada_por_conciliacion(new.nota_id);
    end if;
    if tg_op in ('UPDATE', 'DELETE') and old.nota_id is distinct from coalesce(new.nota_id, -1) then
      perform private.nota_cobrada_por_conciliacion(old.nota_id);
    end if;
  else
    -- pagos_bancarios: al anularse (o reactivarse) un pago, sus notas.
    for v_nota in select distinct pbn.nota_id from public.pagos_bancarios_notas pbn where pbn.pago_id = new.id loop
      perform private.nota_cobrada_por_conciliacion(v_nota);
    end loop;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_conciliacion_cobra_la_nota on public.pagos_bancarios_notas;
create trigger trg_conciliacion_cobra_la_nota
  after insert or update or delete on public.pagos_bancarios_notas
  for each row execute function private.trg_conciliacion_cobra_la_nota();

drop trigger if exists trg_conciliacion_cobra_la_nota on public.pagos_bancarios;
create trigger trg_conciliacion_cobra_la_nota
  after update of anulado_en on public.pagos_bancarios
  for each row execute function private.trg_conciliacion_cobra_la_nota();

-- Las que ya estaban conciliadas del todo y seguían «pendientes por cobrar».
do $ponerse_al_dia$
declare
  v_nota bigint;
begin
  for v_nota in
    select n.id
      from public.notas_entrega n
     where n.pendiente_por_cobrar and n.cobrada_en is null and n.estado <> 'ANULADA'
       and exists (select 1 from public.pagos_bancarios_notas x where x.nota_id = n.id and x.quitado_en is null)
  loop
    perform private.nota_cobrada_por_conciliacion(v_nota);
  end loop;
end
$ponerse_al_dia$;
