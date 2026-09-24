-- LA CUENTA ARCHIVADA SIN HISTORIA SE ELIMINA (24/09/2026)
--
-- Christopher, después de que archivar quedara con su confirmación y su regla
-- de saldo en cero: «que no se pierdan los movimientos que un día tuvo… y
-- que una archivada se pueda eliminar».
--
-- Las dos cosas juntas dicen la regla: se elimina la cuenta archivada que
-- NUNCA tuvo movimientos —la que se creó por error o de prueba— y se queda
-- archivada la que alguna vez movió dinero, porque cada línea del libro, cada
-- cobro y cada pago apuntan a ella. Borrarla dejaría asientos apuntando a
-- nada. Archivar primero es a propósito: eliminar es un paso más allá y
-- exige que alguien ya haya decidido que esa cuenta no se usa.

create or replace function public.eliminar_cuenta(p_id bigint)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_c       public.cuentas_tesoreria;
  v_libro   integer;
  v_otros   integer;
begin
  perform private.exigir_permiso('TESORERIA', 'TOTAL');

  select * into v_c from public.cuentas_tesoreria where id = p_id for update;
  if v_c.id is null then
    raise exception 'No existe esa cuenta.' using errcode = 'P0002';
  end if;
  if v_c.activa then
    raise exception '«%» está activa. Primero se archiva; solo se elimina una cuenta archivada.', v_c.nombre
      using errcode = '55000';
  end if;

  select count(*) into v_libro from public.tesoreria_movimientos where cuenta_id = p_id;
  select (select count(*) from public.cobros_venta where cuenta_id = p_id)
       + (select count(*) from public.pagos_compra where cuenta_id = p_id)
       + (select count(*) from public.prestaciones_anticipos where cuenta_id = p_id)
       + (select count(*) from public.prestaciones_liquidaciones where cuenta_id = p_id)
       + (select count(*) from public.saldo_movimientos where cuenta_id = p_id)
    into v_otros;

  if v_libro + v_otros > 0 then
    raise exception '«%» tiene % en el libro y no se elimina: se queda archivada para que no se pierda su historia.',
      v_c.nombre,
      case when v_libro = 1 then '1 movimiento' else v_libro || ' movimientos' end
      using errcode = '55000',
            hint = 'Una cuenta que movió dinero es la contraparte de cada asiento. Archivada ya no estorba.';
  end if;

  delete from public.cuentas_tesoreria where id = p_id;
end;
$$;

comment on function public.eliminar_cuenta is
  'Elimina una cuenta de tesorería archivada que nunca tuvo movimientos. La que tuvo historia se queda archivada.';

revoke all on function public.eliminar_cuenta(bigint) from public, anon;
grant execute on function public.eliminar_cuenta(bigint) to authenticated;
