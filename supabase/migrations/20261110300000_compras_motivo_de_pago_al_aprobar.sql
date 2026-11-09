-- MOTIVO DE PAGO AL APROBAR LA OC (la dueña, 09/11/2026: «esa función está en
-- GT y MGG, la quiero al momento de aprobar una OC»).
--
-- En MGG, Tesorería pregunta «¿Se pagará esta OC?». Aquí la pregunta se hace al
-- aprobar:
--   Sí → se aprueba como hasta hoy (compras_aprobar_oc).
--   No → la OC NO se aprueba: queda por aprobar con su motivo a la vista
--        (⏳ sin fondos en estos momentos, 👔 esperando respuesta del jefe,
--        🚫 no procede esta compra —con justificación—, 📝 otro). Si no
--        procede, se avisa al analista que creó la OC para que la cancele o
--        busque otra cotización (MGG `handleNotificarNoProcede`).
-- Después se puede volver a «✔ Aprobar OC» y, si se aprueba, el motivo deja de
-- mostrarse (la tarjeta solo lo enseña mientras siga por aprobar).

alter table public.compras_ordenes
  add column if not exists no_pago_motivo text
    check (no_pago_motivo in ('sin_fondos', 'esperando_jefe', 'no_procede', 'otro')),
  add column if not exists no_pago_detalle text,
  add column if not exists no_pago_por_nombre text,
  add column if not exists no_pago_en timestamptz;

create or replace function public.compras_no_se_pagara(p_id bigint, p_motivo text, p_detalle text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o       public.compras_ordenes;
  v_detalle text := nullif(btrim(coalesce(p_detalle, '')), '');
  v_oc      text;
  v_txt     text;
  v_para    uuid[];
begin
  perform private.exigir_usuario_activo();

  if not private.compras_aprueba_oc() then
    raise exception 'Solo los usuarios autorizados para aprobar órdenes de compra pueden indicar el motivo de pago.'
      using errcode = '42501';
  end if;

  if p_motivo is null or p_motivo not in ('sin_fondos', 'esperando_jefe', 'no_procede', 'otro') then
    raise exception 'Elegí el motivo por el cual no se pagará.' using errcode = '22023';
  end if;
  if p_motivo = 'no_procede' and v_detalle is null then
    raise exception 'Escribí la justificación de por qué no se hará la compra.' using errcode = '22023';
  end if;
  if p_motivo = 'otro' and v_detalle is null then
    raise exception 'Especificá el motivo.' using errcode = '22023';
  end if;
  if length(coalesce(v_detalle, '')) > 500 then
    raise exception 'El motivo no puede pasar de 500 caracteres.' using errcode = '22023';
  end if;

  select * into v_o from public.compras_ordenes where id = p_id for update;
  if not found then
    raise exception 'No existe esa orden.' using errcode = 'P0002';
  end if;
  if v_o.estado <> 'oc_creada' then
    raise exception 'El motivo de pago se indica con la OC por aprobar.' using errcode = '55000';
  end if;

  v_detalle := upper(v_detalle);
  v_txt := case p_motivo
             when 'sin_fondos' then 'Sin fondos en estos momentos'
             when 'esperando_jefe' then 'Esperando respuesta del jefe'
             when 'no_procede' then 'No procede esta compra'
             else 'Otro' end
           || coalesce(': ' || v_detalle, '');
  v_oc := coalesce(v_o.oc_codigo, v_o.codigo);

  update public.compras_ordenes
     set no_pago_motivo = p_motivo,
         no_pago_detalle = v_detalle,
         no_pago_por_nombre = private.compras_mi_nombre(),
         no_pago_en = now(),
         historial = historial || private.compras_evento('no_se_pagara', jsonb_build_object(
           'oc_codigo', v_o.oc_codigo,
           'motivo', p_motivo,
           'detalle', v_detalle))
   where id = v_o.id
  returning * into v_o;

  if p_motivo = 'no_procede' then
    -- Al analista que creó la OC (y a quien la pidió), para que la cancele o
    -- busque otra cotización.
    select coalesce(array_agg(distinct u), '{}') into v_para
      from unnest(array[v_o.oc_creada_por, v_o.creado_por]) u
     where u is not null;
    insert into public.notificaciones
      (modulo, tipo, titulo, detalle, ruta, roles, importancia, actor_id, para_usuarios)
    values
      ('COMPRAS', 'OC_NO_PROCEDE',
       format('No procede la compra: %s · cancelá la OC o buscá otra cotización', v_oc),
       v_detalle, '/app/pedidos?detalle=' || v_o.id,
       array['COMPRAS'], 'ATENCION', (select auth.uid()), v_para);
  else
    perform private.compras_avisar(v_o, 'OC_NO_PAGADA',
      format('OC %s no se pagará por ahora · %s', v_oc, v_txt),
      array['COMPRAS'], '/app/pedidos', 'INFO');
  end if;

  return jsonb_build_object('id', v_o.id, 'oc_codigo', v_o.oc_codigo, 'motivo', p_motivo, 'texto', v_txt);
end;
$$;

revoke all on function public.compras_no_se_pagara(bigint, text, text) from public, anon;
grant execute on function public.compras_no_se_pagara(bigint, text, text) to authenticated;
