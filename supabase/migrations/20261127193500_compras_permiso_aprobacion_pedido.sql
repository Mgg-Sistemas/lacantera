-- La aprobación de la OP depende de la casilla de Compras.
-- La OC conserva la autorización configurada en Usuarios.
create or replace function public.compras_mis_permisos_de_pedidos()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();
  return jsonb_build_object(
    'compras', private.tiene_permiso('COMPRAS', 'LECTURA'),
    'escribe', private.tiene_permiso('COMPRAS', 'ESCRITURA'),
    'gestiona', private.compras_gestiona(),
    'aprueba_op', private.puede_accion('COMPRAS.APROBAR_COMPRA'),
    'aprueba_oc', private.compras_aprueba_oc(),
    'revisa_almacen', private.compras_revisa_almacen(),
    'recibe_almacen', private.compras_recibe_almacen(),
    'pide_por_otro', private.puede_pedir_por_otro(),
    'yo', (select auth.uid()),
    'mi_nombre', private.compras_mi_nombre());
end;
$$;

create or replace function public.compras_aprobar_orden(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.compras_ordenes;
begin
  perform private.exigir_usuario_activo();

  if not private.puede_accion('COMPRAS.APROBAR_COMPRA') then
    raise exception 'Se requiere el permiso Aprobar la compra para aprobar una Orden de Pedido.'
      using errcode = '42501';
  end if;

  select o.* into v_o from public.compras_ordenes o where o.id = p_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe o fue eliminada.' using errcode = 'P0002';
  end if;

  if v_o.estado <> 'pendiente' then
    raise exception 'La orden % está en «%»: solo se aprueba una orden pendiente.', v_o.codigo, v_o.estado
      using errcode = '55000';
  end if;

  update public.compras_ordenes
     set estado = 'aprobada',
         aprobada_por = (select auth.uid()),
         aprobada_por_nombre = private.compras_mi_nombre(),
         aprobada_en = now(),
         historial = historial || private.compras_evento('aprobada')
   where id = p_id
  returning * into v_o;

  -- MGG: «Orden aprobada: {código}».
  perform private.compras_avisar(v_o, 'PEDIDO_APROBADO', format('Orden aprobada: %s', v_o.codigo), array['COMPRAS']);
end;
$$;

revoke all on function public.compras_mis_permisos_de_pedidos(), public.compras_aprobar_orden(bigint) from public, anon;
grant execute on function public.compras_mis_permisos_de_pedidos(), public.compras_aprobar_orden(bigint) to authenticated;
