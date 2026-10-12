-- ============================================================================
-- Revertir la cuenta por cobrar/pagar de la nota de entrega
--
-- Christopher, 12/10/2026: «no me gustó, deja todo como estaba antes del
-- cambio». Se comprobó antes de correr esto que la tabla nueva seguía en
-- cero filas: nadie llegó a usarla, así que no hay nada que migrar ni que
-- avisar — se quita entera.
-- ============================================================================

-- 1. anular_nota_entrega vuelve a como estaba, sin el candado que pedía
--    anular primero los movimientos de cuenta.
do $mig$
declare
  v_def   text;
  v_ancla text := $anchor$  if exists (
    select 1 from public.cuenta_nota_entrega_movimientos
     where nota_id = p_id and estado = 'VIGENTE'
  ) then
    raise exception 'La nota % tiene cobros o reembolsos registrados. Anúlalos primero.', v_nota.numero
      using errcode = '55000';
  end if;

  if v_nota.estado = 'FACTURADA' then$anchor$;
  v_nueva text := $nuevo$  if v_nota.estado = 'FACTURADA' then$nuevo$;
begin
  select pg_get_functiondef('public.anular_nota_entrega(bigint, text)'::regprocedure) into strict v_def;

  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'anular_nota_entrega no tiene el candado esperado para quitarlo.'
      using errcode = '22023';
  end if;

  v_def := replace(v_def, v_ancla, v_nueva);
  execute 'drop function public.anular_nota_entrega(bigint, text)';
  execute v_def;

  execute format('revoke execute on function %s from public, anon', 'public.anular_nota_entrega(bigint, text)');
  execute format('grant   execute on function %s to authenticated', 'public.anular_nota_entrega(bigint, text)');
end
$mig$;

-- 2. Las funciones nuevas, la vista y la tabla: fuera, en ese orden.
drop function if exists public.registrar_movimiento_cuenta_nota(bigint, text, numeric, bigint, date, text, text);
drop function if exists public.anular_movimiento_cuenta_nota(bigint, text);
drop view if exists public.v_cuenta_nota_entrega;
drop table if exists public.cuenta_nota_entrega_movimientos;
