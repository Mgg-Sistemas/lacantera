revoke all on public.retencion_agente_imagenes from public, anon, authenticated;
grant select, insert on public.retencion_agente_imagenes to authenticated;

drop policy if exists retencion_agente_imagenes_read on public.retencion_agente_imagenes;
create policy retencion_agente_imagenes_read on public.retencion_agente_imagenes for select to authenticated
  using ((select private.tiene_permiso('RETENCIONES', 'LECTURA')));

drop policy if exists retencion_agente_imagenes_insert on public.retencion_agente_imagenes;
create policy retencion_agente_imagenes_insert on public.retencion_agente_imagenes for insert to authenticated
  with check ((select private.tiene_permiso('RETENCIONES', 'ESCRITURA')));

drop policy if exists "retenciones_logos read" on storage.objects;
create policy "retenciones_logos read" on storage.objects for select to authenticated
  using (bucket_id = 'retenciones-logos' and (select private.tiene_permiso('RETENCIONES', 'LECTURA')));

drop policy if exists "retenciones_logos insert" on storage.objects;
create policy "retenciones_logos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'retenciones-logos' and (select private.tiene_permiso('RETENCIONES', 'ESCRITURA')));
