begin;

create or replace view public.retencion_ordenes with (security_invoker = true) as
  select o.*, o.creado_en as created_at, o.oc_creada_en as oc_emitida_en,
         o.factura_path as factura_recepcion_path, o.factura_nombre as factura_recepcion_nombre,
         o.condiciones_pago as condicion_pago, o.moneda as total_moneda,
         coalesce(o.iva_factura, o.iva, 0) as iva_monto, coalesce(o.igtf, 0) as igtf_monto
    from public.compras_ordenes o
   where o.oc_codigo is not null and (select private.tiene_permiso('RETENCIONES', 'LECTURA'));

create view public.retencion_compras_directas with (security_invoker = true) as
  select o.id, o.codigo, o.creado_en as created_at, o.proveedor_id,
         p.nombre as proveedor_nombre, o.moneda, o.total as gasto
    from public.compras_ordenes o join public.proveedores p on p.id=o.proveedor_id
   where o.oc_codigo is null and o.recibida_en is not null
     and (select private.tiene_permiso('RETENCIONES', 'LECTURA'));

create view public.retencion_servicios_directos with (security_invoker = true) as
  select s.id, s.codigo, s.creado_en as created_at, s.proveedor_id, s.proveedor_nombre, s.moneda, s.gasto
    from public.compras_servicios_directos s where (select private.tiene_permiso('RETENCIONES', 'LECTURA'));

create policy compras_directas_lectura_retenciones on public.compras_ordenes for select to authenticated
  using (oc_codigo is null and recibida_en is not null and (select private.tiene_permiso('RETENCIONES', 'LECTURA')));
create policy servicios_directos_lectura_retenciones on public.compras_servicios_directos for select to authenticated
  using ((select private.tiene_permiso('RETENCIONES', 'LECTURA')));
create policy proveedores_lectura_retenciones on public.proveedores for select to authenticated
  using ((select private.tiene_permiso('RETENCIONES', 'LECTURA')));

revoke all on public.retencion_compras_directas, public.retencion_servicios_directos from public, anon, authenticated;
grant select on public.retencion_compras_directas, public.retencion_servicios_directos to authenticated;

create function public.retencion_asignar_orden(p_retencion uuid, p_orden bigint)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_r public.retenciones;
  v_o public.compras_ordenes;
begin
  perform private.exigir_usuario_activo();
  if not private.tiene_permiso('RETENCIONES', 'ESCRITURA') then
    raise exception 'Se requiere permiso de Retenciones.' using errcode = '42501';
  end if;
  select * into v_r from public.retenciones where id=p_retencion for update;
  select * into v_o from public.compras_ordenes where id=p_orden for update;
  if v_r.id is null or v_o.oc_codigo is null or v_r.proveedor_id is distinct from v_o.proveedor_id
     or v_r.estado <> 'registrada' or coalesce(v_o.factura_tipo,v_o.comprobante_tipo) is distinct from 'factura' then
    raise exception 'La retención debe estar registrada y ser del proveedor de la orden con factura.' using errcode = '22023';
  end if;
  if v_r.documento_id is null then
    update public.retenciones set orden_id=p_orden where id=v_r.id;
  else
    update public.retencion_documentos set orden_id=p_orden
      where id=v_r.documento_id and num_nonnulls(compra_directa_id,servicio_directo_id)=0;
    if not found then
      raise exception 'La factura ya tiene un origen de compra o servicio directo.' using errcode = '22023';
    end if;
  end if;
  return p_orden;
end;
$$;
revoke all on function public.retencion_asignar_orden(uuid,bigint) from public, anon;
grant execute on function public.retencion_asignar_orden(uuid,bigint) to authenticated;

create table public.retencion_reintegros (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null unique references public.retencion_documentos(id),
  datos jsonb not null check (jsonb_typeof(datos)='object'),
  monto_bs numeric(18,2) not null check (monto_bs>0),
  fecha_reintegro date,
  referencia text,
  cuenta_id bigint references public.cuentas_tesoreria(id),
  cuenta_nombre text,
  movimiento_id bigint unique references public.tesoreria_movimientos(id),
  nota text,
  registrado_en timestamptz not null default now()
);
alter table public.retencion_reintegros enable row level security;
create policy retencion_reintegros_lectura on public.retencion_reintegros for select to authenticated
  using ((select private.tiene_permiso('RETENCIONES','LECTURA')));
revoke all on public.retencion_reintegros from public, anon, authenticated;
grant select on public.retencion_reintegros to authenticated;

create function public.retencion_reintegro_pendiente(p_documento uuid,p_datos jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_d public.retencion_documentos;
  v_id uuid;
  v_monto numeric;
begin
  perform private.exigir_usuario_activo();
  if not private.tiene_permiso('RETENCIONES','ESCRITURA') then
    raise exception 'Se requiere permiso de Retenciones.' using errcode='42501';
  end if;
  select * into v_d from public.retencion_documentos where id=p_documento for update;
  if v_d.id is null or v_d.rol <> 'practicada' then
    raise exception 'Se requiere un documento con retenciones practicadas.' using errcode='22023';
  end if;
  select round(sum(case when r.moneda='USD' then coalesce(r.monto_bs,r.monto*r.tasa) else r.monto end),2)
    into v_monto from public.retenciones r where r.documento_id=p_documento and r.estado<>'anulada';
  if coalesce(v_monto,0)<=0 then
    raise exception 'La factura no tiene montos retenidos.' using errcode='22023';
  end if;
  insert into public.retencion_reintegros(documento_id,datos,monto_bs)
    values (p_documento,p_datos || jsonb_build_object('proveedor',v_d.razon_social,'proveedorRif',v_d.rif,
      'empresaId',v_d.empresa_id,'facturas',jsonb_build_array(v_d.factura_nro)),v_monto)
      on conflict(documento_id) do update set monto_bs=excluded.monto_bs, datos=excluded.datos
        where retencion_reintegros.movimiento_id is null
    returning id into v_id;
  if v_id is null then
    raise exception 'El reintegro de la factura ya fue cobrado.' using errcode='22023';
  end if;
  return v_id;
end;
$$;

create function public.retencion_recibir_reintegro(p_id uuid,p_cuenta bigint,p_fecha date,p_referencia text,p_nota text)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_r public.retencion_reintegros;
  v_c public.cuentas_tesoreria;
  v_mov bigint;
begin
  perform private.exigir_usuario_activo();
  if not private.tiene_permiso('RETENCIONES','ESCRITURA') then
    raise exception 'Se requiere permiso de Retenciones.' using errcode='42501';
  end if;
  select * into v_r from public.retencion_reintegros where id=p_id for update;
  if v_r.id is null or v_r.movimiento_id is not null or p_fecha is null or nullif(btrim(p_referencia),'') is null
     or not exists (select 1 from public.retenciones where documento_id=v_r.documento_id and estado<>'anulada') then
    raise exception 'Se requiere un reintegro vigente, una fecha y una referencia.' using errcode='22023';
  end if;
  select * into v_c from public.cuentas_tesoreria where id=p_cuenta and activa and moneda='VES' for share;
  if not found then raise exception 'Selecciona una cuenta activa en bolívares.' using errcode='22023'; end if;
  v_mov := private.registrar_movimiento_tesoreria(v_c.id,'INGRESO',1,v_r.monto_bs,'Reintegro de retención',
    p_fecha,p_referencia,v_r.datos ->> 'proveedor',null,null,null,p_nota);
  update public.retencion_reintegros set movimiento_id=v_mov,fecha_reintegro=p_fecha,referencia=btrim(p_referencia),
    cuenta_id=v_c.id,cuenta_nombre=v_c.nombre,nota=nullif(btrim(p_nota),'') where id=v_r.id;
  return v_mov;
end;
$$;

create function public.retencion_cuentas_reintegro()
returns table(id bigint,nombre text)
language sql stable security definer set search_path = ''
as $$
  select c.id,c.nombre from public.cuentas_tesoreria c where c.activa and c.moneda='VES'
    and private.tiene_permiso('RETENCIONES','ESCRITURA') order by c.nombre;
$$;

create function public.retencion_factura_con_reintegro(p_factura jsonb,p_lineas jsonb,p_reintegro jsonb)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  v_resultado := public.retencion_factura_registrar(p_factura,p_lineas);
  perform public.retencion_reintegro_pendiente((v_resultado #>> '{factura,id}')::uuid, p_reintegro);
  return v_resultado;
end;
$$;

create function public.retencion_lineas_con_reintegro(p_documento_id uuid,p_lineas jsonb,p_periodo text,p_actor_name text,p_reintegro jsonb)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  v_resultado := public.retencion_lineas_registrar(p_documento_id,p_lineas,p_periodo,p_actor_name);
  perform public.retencion_reintegro_pendiente(p_documento_id,p_reintegro);
  return v_resultado;
end;
$$;

revoke all on function public.retencion_reintegro_pendiente(uuid,jsonb),
  public.retencion_recibir_reintegro(uuid,bigint,date,text,text), public.retencion_cuentas_reintegro(),
  public.retencion_factura_con_reintegro(jsonb,jsonb,jsonb), public.retencion_lineas_con_reintegro(uuid,jsonb,text,text,jsonb)
  from public, anon;
grant execute on function public.retencion_reintegro_pendiente(uuid,jsonb),
  public.retencion_recibir_reintegro(uuid,bigint,date,text,text), public.retencion_cuentas_reintegro(),
  public.retencion_factura_con_reintegro(jsonb,jsonb,jsonb), public.retencion_lineas_con_reintegro(uuid,jsonb,text,text,jsonb)
  to authenticated;

commit;
