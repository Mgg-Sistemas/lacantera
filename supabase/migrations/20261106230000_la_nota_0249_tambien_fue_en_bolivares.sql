-- ============================================================================
-- LA NOTA NE-2026-0249 TAMBIÉN FUE EN BOLÍVARES (06/11/2026)
--
-- Christopher lo confirmó después de
-- `20261106220000_las_ventas_migradas_de_septiembre_fueron_en_bolivares`:
-- NE-2026-0249 (de la salida NS-2026-0005, PENDIENTE y sin cliente) fue
-- también una venta en Bs. Mismo trato que las otras seis: pasa a VES con la
-- tasa del día en que se hizo, sin cambiar su monto. Si el total en Bs o su
-- equivalente en $ fueran a cambiar, no se aplica nada.
--
-- Respaldo previo en la misma tabla que las otras seis.
-- ============================================================================

insert into private.respaldo_notas_usd_a_bs_20261106 (tabla, fila)
select 'notas_entrega', to_jsonb(n)
  from public.notas_entrega n
 where n.numero = 'NE-2026-0249' and n.moneda = 'USD'
union all
select 'nota_entrega_renglones', to_jsonb(r)
  from public.nota_entrega_renglones r
  join public.notas_entrega n on n.id = r.nota_id
 where n.numero = 'NE-2026-0249' and n.moneda = 'USD';

do $cambio$
declare
  v record;
  v_total_bs numeric;
  v_total_usd numeric;
begin
  for v in
    select id, numero, total_bs, total_usd, tasa_usd
      from public.notas_entrega
     where numero = 'NE-2026-0249'
       and moneda = 'USD'           -- si ya se corrió, no hace nada
  loop
    if (select count(*) from public.nota_entrega_renglones where nota_id = v.id) <> 1 then
      raise exception 'La nota % no tiene un solo renglón: no se convierte a ciegas.', v.numero;
    end if;

    update public.notas_entrega set moneda = 'VES', tasa = 1 where id = v.id;

    update public.nota_entrega_renglones r
       set precio_unitario = round(v.total_bs / r.cantidad, 6),
           precio_lista = case
             when r.condicion = 'LISTA' then round(v.total_bs / r.cantidad, 6)
             when r.precio_lista is null then null
             else round(r.precio_lista * v.tasa_usd, 6)
           end
     where r.nota_id = v.id;

    select total_bs, total_usd into v_total_bs, v_total_usd from public.notas_entrega where id = v.id;
    if v_total_bs <> v.total_bs or v_total_usd <> v.total_usd then
      raise exception 'La nota % cambiaría de monto (Bs % → %, $ % → %): no se aplica.',
        v.numero, v.total_bs, v_total_bs, v.total_usd, v_total_usd;
    end if;
  end loop;
end
$cambio$;
