begin;

-- La factura de la OC sigue en su depósito nativo. El acceso fiscal se limita
-- a la ruta exacta del archivo enlazado a una orden con factura.
create policy compras_facturas_lectura_retenciones on storage.objects for select to authenticated
  using (bucket_id='compras-recepciones'
    and (select private.tiene_permiso('RETENCIONES','LECTURA'))
    and exists (select 1 from public.compras_ordenes o where o.factura_path=storage.objects.name
      and coalesce(o.factura_tipo,o.comprobante_tipo)='factura'));

alter table public.retencion_reintegros add column cancelado_en timestamptz;

create function private.retencion_ajustar_reintegro()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_documento uuid := old.documento_id;
  v_cobro public.retencion_reintegros;
  v_monto numeric;
begin
  if v_documento is null then return null; end if;
  select * into v_cobro from public.retencion_reintegros where documento_id=v_documento for update;
  if not found then return null; end if;
  if v_cobro.movimiento_id is not null then
    raise exception 'La retención tiene un reintegro cobrado en Tesorería.' using errcode='55000';
  end if;
  select round(sum(case when r.moneda='USD' then coalesce(r.monto_bs,r.monto*r.tasa) else r.monto end),2)
    into v_monto from public.retenciones r where r.documento_id=v_documento and r.estado<>'anulada';
  update public.retencion_reintegros
     set monto_bs=coalesce(nullif(v_monto,0),monto_bs),
         cancelado_en=case when coalesce(v_monto,0)=0 then now() end
   where id=v_cobro.id;
  return null;
end;
$$;
revoke all on function private.retencion_ajustar_reintegro() from public, anon, authenticated;

create trigger retencion_ajustar_reintegro_edicion after update of estado,monto,monto_bs,tasa,moneda,documento_id
  on public.retenciones for each row
  when ((old.estado='anulada') is distinct from (new.estado='anulada')
    or old.monto is distinct from new.monto or old.monto_bs is distinct from new.monto_bs
    or old.tasa is distinct from new.tasa or old.moneda is distinct from new.moneda
    or old.documento_id is distinct from new.documento_id)
  execute function private.retencion_ajustar_reintegro();
create trigger retencion_ajustar_reintegro_borrado after delete on public.retenciones
  for each row execute function private.retencion_ajustar_reintegro();

commit;
