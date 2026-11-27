begin;

alter table public.compras_ordenes
  add column if not exists retencion_finalizada boolean not null default false,
  add column if not exists retencion_finalizada_por text,
  add column if not exists retencion_finalizada_en timestamptz,
  add column if not exists retencion_iva_path text,
  add column if not exists retencion_iva_nombre text,
  add column if not exists retencion_islr_path text,
  add column if not exists retencion_islr_nombre text,
  add column if not exists retencion_municipal_path text,
  add column if not exists retencion_municipal_nombre text;

create policy compras_ordenes_lectura_retenciones on public.compras_ordenes for select to authenticated
  using ((select private.tiene_permiso('RETENCIONES', 'LECTURA')) and oc_codigo is not null);

create view public.retencion_ordenes with (security_invoker = true) as
  select o.*, o.creado_en as created_at, o.oc_creada_en as oc_emitida_en,
         o.factura_path as factura_recepcion_path, o.factura_nombre as factura_recepcion_nombre,
         o.condiciones_pago as condicion_pago
    from public.compras_ordenes o
   where o.oc_codigo is not null
     and (select private.tiene_permiso('RETENCIONES', 'LECTURA'));

revoke all on public.retencion_ordenes from public, anon, authenticated;
grant select on public.retencion_ordenes to authenticated;

insert into storage.buckets (id, name, public) values ('retenciones-comprobantes', 'retenciones-comprobantes', false)
on conflict (id) do nothing;

create policy retenciones_comprobantes_lectura on storage.objects for select to authenticated
  using (bucket_id = 'retenciones-comprobantes' and (select private.tiene_permiso('RETENCIONES', 'LECTURA')));
create policy retenciones_comprobantes_carga on storage.objects for insert to authenticated
  with check (bucket_id = 'retenciones-comprobantes' and (select private.tiene_permiso('RETENCIONES', 'ESCRITURA')));

create function public.retencion_finalizar_orden(p_orden_id bigint, p_comprobantes jsonb)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_o public.compras_ordenes;
begin
  perform private.exigir_usuario_activo();
  if not private.tiene_permiso('RETENCIONES', 'ESCRITURA') then
    raise exception 'Se requiere permiso de Retenciones para finalizar.' using errcode = '42501';
  end if;
  select * into v_o from public.compras_ordenes o where o.id = p_orden_id for update;
  if v_o.oc_codigo is null or coalesce(v_o.factura_tipo,v_o.comprobante_tipo) is distinct from 'factura'
    or v_o.estado in ('cancelada','anulada','desistida_proveedor') then
    raise exception 'La orden debe estar vigente y respaldada por una factura.' using errcode = '22023';
  end if;
  if v_o.retencion_finalizada then
    return v_o.id;
  end if;
  if jsonb_typeof(p_comprobantes) is distinct from 'object' or exists (
    select 1 from jsonb_each(p_comprobantes) x
     where x.key not in ('iva','islr','municipal')
        or not exists (
          select 1 from storage.objects s where s.bucket_id = 'retenciones-comprobantes'
            and s.name = x.value ->> 'path'
            and split_part(s.name, '/', 1) = v_o.id::text
        )
  ) then
    raise exception 'Hay comprobantes que no corresponden a la orden.' using errcode = '22023';
  end if;
  if p_comprobantes = '{}'::jsonb and not exists (
    select 1 from public.retenciones r join public.retencion_documento_origenes f on f.documento_id = r.documento_id
     where f.orden_id = v_o.id and r.estado <> 'anulada'
  ) and not exists (
    select 1 from public.retencion_decisiones d join public.retencion_documento_origenes f on f.documento_id = d.documento_id
     where f.orden_id = v_o.id
  ) then
    raise exception 'Registra la retención, el motivo de no aplicación o un comprobante antes de finalizar.' using errcode = '22023';
  end if;
  update public.compras_ordenes
     set retencion_finalizada = true, retencion_finalizada_por = private.compras_mi_nombre(),
         retencion_finalizada_en = now(),
         retencion_iva_path = p_comprobantes #>> '{iva,path}', retencion_iva_nombre = p_comprobantes #>> '{iva,nombre}',
         retencion_islr_path = p_comprobantes #>> '{islr,path}', retencion_islr_nombre = p_comprobantes #>> '{islr,nombre}',
         retencion_municipal_path = p_comprobantes #>> '{municipal,path}',
         retencion_municipal_nombre = p_comprobantes #>> '{municipal,nombre}'
   where id = v_o.id;
  return v_o.id;
end;
$$;
revoke all on function public.retencion_finalizar_orden(bigint,jsonb) from public, anon;
grant execute on function public.retencion_finalizar_orden(bigint,jsonb) to authenticated;

create function public.retencion_guardar_perfil_proveedor(p_id bigint, p_datos jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();
  if not (private.tiene_permiso('COMPRAS', 'ESCRITURA') or private.tiene_permiso('RETENCIONES', 'ESCRITURA')) then
    raise exception 'Se requiere permiso para editar el perfil fiscal.' using errcode = '42501';
  end if;
  update public.proveedores
     set actividad_economica = case when p_datos ? 'actividad_economica'
           then nullif(btrim(p_datos ->> 'actividad_economica'), '') else actividad_economica end,
         tipo_persona = case when p_datos ? 'tipo_persona'
           then nullif(btrim(p_datos ->> 'tipo_persona'), '') else tipo_persona end,
         numero_administracion = case when p_datos ? 'numero_administracion'
           then nullif(btrim(p_datos ->> 'numero_administracion'), '') else numero_administracion end
   where id = p_id;
  if not found then
    raise exception 'No existe ese proveedor.' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.retencion_guardar_perfil_proveedor(bigint,jsonb) from public, anon;
grant execute on function public.retencion_guardar_perfil_proveedor(bigint,jsonb) to authenticated;

-- Las políticas de la importación se subordinan a la matriz nativa.
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array['retenciones','retencion_documentos','retencion_documento_origenes',
    'retencion_facturas_externas','retencion_periodos','retencion_decisiones','retencion_numeros',
    'retencion_series','retencion_ajustes','retencion_historial','adjuntos_directos']
  loop
    execute format('alter table public.%I enable row level security', v_tabla);
    execute format('revoke all on public.%I from public, anon', v_tabla);
    execute format($p$create policy retenciones_matriz_lectura on public.%I as restrictive for select to authenticated
      using ((select private.tiene_permiso('RETENCIONES', 'LECTURA')) or (select private.tiene_permiso('COMPRAS', 'LECTURA')))$p$, v_tabla);
    execute format($p$create policy retenciones_matriz_insertar on public.%I as restrictive for insert to authenticated
      with check ((select private.tiene_permiso('RETENCIONES', 'ESCRITURA')))$p$, v_tabla);
    execute format($p$create policy retenciones_matriz_editar on public.%I as restrictive for update to authenticated
      using ((select private.tiene_permiso('RETENCIONES', 'ESCRITURA')))
      with check ((select private.tiene_permiso('RETENCIONES', 'ESCRITURA')))$p$, v_tabla);
    execute format($p$create policy retenciones_matriz_borrar on public.%I as restrictive for delete to authenticated
      using ((select private.tiene_permiso('RETENCIONES', 'TOTAL')))$p$, v_tabla);
  end loop;
end;
$$;

create policy retenciones_adjuntos_lectura on public.adjuntos_directos for select to authenticated using (true);
grant select on public.adjuntos_directos to authenticated;

-- Generar los períodos usando las versiones fiscales ya instaladas.
select public.retencion_periodos_generar(extract(year from current_date)::int);
select public.retencion_periodos_generar(extract(year from current_date)::int + 1);

commit;
