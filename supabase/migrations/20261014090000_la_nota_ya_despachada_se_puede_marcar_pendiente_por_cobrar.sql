-- ============================================================================
-- La nota ya despachada se puede marcar pendiente por cobrar
--
-- Christopher, 14/10/2026: cuatro notas ya despachadas (NE-2026-0095 a 0098)
-- necesitaban quedar pendientes por cobrar, y la casilla solo existía al
-- pedir el despacho —`solicitar_despacho`—. Esto agrega el mismo recordatorio
-- para una nota que ya nació sin él, simétrico a «marcar como cobrada».
-- ============================================================================

create or replace function public.marcar_nota_de_entrega_pendiente_por_cobrar(
  p_id bigint,
  p_fecha_pago date
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nota record;
begin
  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');

  select * into v_nota from public.notas_entrega where id = p_id;

  if v_nota.id is null then
    raise exception 'No existe la nota de entrega %.', p_id using errcode = 'P0002';
  end if;

  if v_nota.estado = 'ANULADA' then
    raise exception 'La nota % está anulada: no tiene cuenta que cobrar.', v_nota.numero
      using errcode = '55000';
  end if;

  if v_nota.pendiente_por_cobrar and v_nota.cobrada_en is null then
    raise exception 'La nota % ya está pendiente por cobrar.', v_nota.numero using errcode = '55000';
  end if;

  if p_fecha_pago is null then
    raise exception 'Hace falta la fecha de pago.' using errcode = '22023';
  end if;

  if p_fecha_pago < current_date then
    raise exception 'La fecha de pago no puede ser anterior a hoy.' using errcode = '22023';
  end if;

  update public.notas_entrega
     set pendiente_por_cobrar = true,
         fecha_pago = p_fecha_pago,
         cobrada_en = null,
         aviso_vencida_en = null
   where id = p_id;
end;
$$;

revoke all on function public.marcar_nota_de_entrega_pendiente_por_cobrar(bigint, date) from public, anon;
grant execute on function public.marcar_nota_de_entrega_pendiente_por_cobrar(bigint, date) to authenticated;
