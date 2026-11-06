-- ============================================================================
-- LAS VENTAS MIGRADAS DE SEPTIEMBRE FUERON EN BOLÍVARES (06/11/2026)
--
-- Christopher: NE-2026-0250 a NE-2026-0255 —seis de las ventas históricas que
-- `20261105150000_migrar_ventas_historicas_de_salidas_a_notas_de_entrega`
-- trajo de las salidas NS-2026-0006 a NS-2026-0011— «fueron transacciones en
-- Bs» y no deben salir en el reporte en dólares. Se migraron en USD por error.
--
-- Se corrige el dato, no el reporte: esconderlas solo del papel dejaría la
-- nota diciendo dólares en el filtro de moneda, en el reporte de WhatsApp y
-- en el cierre de pagos.
--
-- LOS MONTOS NO CAMBIAN. Cada nota pasa a VES con tasa 1 y conserva su
-- `tasa_usd` (la BCV del día en que se hizo). El precio del renglón se pone
-- de modo que el total en Bs sea EXACTAMENTE el `total_bs` que ya tenía, y su
-- equivalente en $ sigue siendo el mismo. Probado antes en una transacción
-- que se deshizo: totales idénticos y ninguna nota cubierta de más en
-- Registros de pagos (cuatro de ellas están asociadas a pagos del banco).
--
-- No toca inventario, cliente, fecha ni número. NE-2026-0249 (PENDIENTE, sin
-- cliente) queda fuera a propósito hasta que se confirme su moneda.
--
-- RESPALDO: antes de cambiar nada, las filas tal como estaban se copian a
-- `private.respaldo_notas_usd_a_bs_20261106` (y la bitácora guarda además el
-- antes y el después de cada fila).
-- ============================================================================

create table if not exists private.respaldo_notas_usd_a_bs_20261106 (
  tabla      text not null,
  fila       jsonb not null,
  copiado_en timestamptz not null default now()
);
comment on table private.respaldo_notas_usd_a_bs_20261106 is
  'Cómo estaban NE-2026-0250..0255 y sus renglones antes de pasarlas de USD a VES (06/11/2026).';

insert into private.respaldo_notas_usd_a_bs_20261106 (tabla, fila)
select 'notas_entrega', to_jsonb(n)
  from public.notas_entrega n
 where n.numero between 'NE-2026-0250' and 'NE-2026-0255' and n.moneda = 'USD'
union all
select 'nota_entrega_renglones', to_jsonb(r)
  from public.nota_entrega_renglones r
  join public.notas_entrega n on n.id = r.nota_id
 where n.numero between 'NE-2026-0250' and 'NE-2026-0255' and n.moneda = 'USD';

do $cambio$
declare
  v record;
  v_total_bs numeric;
  v_total_usd numeric;
begin
  for v in
    select id, numero, total_bs, total_usd, tasa_usd
      from public.notas_entrega
     where numero between 'NE-2026-0250' and 'NE-2026-0255'
       and moneda = 'USD'           -- si ya se corrió, no hace nada
  loop
    if (select count(*) from public.nota_entrega_renglones where nota_id = v.id) <> 1 then
      raise exception 'La nota % no tiene un solo renglón: no se convierte a ciegas.', v.numero;
    end if;

    update public.notas_entrega set moneda = 'VES', tasa = 1 where id = v.id;

    -- Un solo renglón: su precio es el total en Bs entre la cantidad. En
    -- LISTA el precio de lista tiene que ser igual al precio; en ACORDADO
    -- (NE-2026-0253) la lista se convierte con la tasa y el motivo se queda.
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
