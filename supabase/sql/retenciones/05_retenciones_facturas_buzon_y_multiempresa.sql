-- ============================================================
-- ESTADO: PENDIENTE DE APLICAR
-- MODULO: Retenciones Fiscales (Minería Internacional TS, C.A.)
-- ARCHIVO: 05_retenciones_facturas_buzon_y_multiempresa.sql
--
-- DESCRIPCIÓN:
-- Crea la estructura de Documentos y Facturas de Origen (P03, R7F),
-- Buzón de Facturas Externas y Adjuntos (R11, R12), Multi-Empresa con ficha de Minería Internacional TS, C.A. (R13),
-- Restricciones de Integridad y Rangos (R9), Auditoría Fiscal (RLOG), Régimen por Empresa (RREG) y Firmas (RESP).
--
-- CONSULTA DE VERIFICACIÓN / RESULTADO ESPERADO:
-- Ejecutar tras aplicar este script:
--   1) SELECT count(*) >= 1 AS empresa_receptora_ok FROM public.retencion_empresas_receptoras WHERE clave = 'MITS';
--      -> true (Minería Internacional TS, C.A. registrada como receptora)
--   2) SELECT proname FROM pg_proc WHERE proname = 'retencion_factura_registrar';
--      -> 'retencion_factura_registrar' (función de registro de facturas lista)
--   3) SELECT count(*) >= 1 AS buzon_ok FROM information_schema.tables WHERE table_name = 'retenciones_buzon_facturas';
--      -> true (buzón operativo)
--
-- SEGURIDAD:
-- Transaccional (BEGIN...COMMIT), idempotente y no destructivo para los datos vivos.
-- ============================================================

BEGIN;


-- P03 · 11 de 13 · gt_facturas_del_origen · migración gt_facturas_del_origen, versión 20261020100011

-- ── Guarda: solo sigue si la base está justo antes de P03 (si no, se detiene sin escribir nada) ──


-- 1) adjuntos_directos: 'orden' y 'orden_factura'; es_factura; la factura de la OC va bajo /facturas/.
alter table public.adjuntos_directos drop constraint adjuntos_directos_modulo_check;
alter table public.adjuntos_directos add constraint adjuntos_directos_modulo_check
  check (modulo in ('compra', 'servicio', 'orden', 'orden_factura'));
alter table public.adjuntos_directos add column es_factura boolean;
alter table public.adjuntos_directos add constraint adjuntos_directos_es_factura check (
      (modulo <> 'orden' or es_factura is not true)
  and (modulo <> 'orden_factura' or (es_factura is true and path like '%/facturas/%')));
comment on column public.adjuntos_directos.es_factura is
  'true = factura del proveedor; false = otro papel (pago, solicitud…); null = cargado antes de P03 (en compra y servicio cuenta como factura)';
comment on table public.adjuntos_directos is
  'Compras: archivos de compra directa, servicio directo, OC (generales) y facturas de OC (orden_factura → compras-oc, <orden>/facturas/…)';

-- 2) Puente documento fiscal × origen (Retenciones)
create table public.retencion_documento_origenes (
  id                   uuid primary key default gen_random_uuid(),
  documento_id         uuid not null references public.retencion_documentos (id) on delete cascade,
  orden_id             uuid references public.ordenes (id) on delete restrict,
  compra_directa_id    uuid references public.compras_directas (id) on delete restrict,
  servicio_directo_id  uuid references public.servicios_directos (id) on delete restrict,
  adjunto_id           uuid references public.adjuntos_directos (id) on delete set null,
  creado_por           text,
  created_at           timestamptz not null default now(),
  check (num_nonnulls(orden_id, compra_directa_id, servicio_directo_id) = 1)
);
create unique index retencion_documento_origenes_unico on public.retencion_documento_origenes
  (documento_id, (coalesce(orden_id, compra_directa_id, servicio_directo_id)));
create index retencion_documento_origenes_orden_idx on public.retencion_documento_origenes (orden_id) where orden_id is not null;
create index retencion_documento_origenes_compra_idx on public.retencion_documento_origenes (compra_directa_id) where compra_directa_id is not null;
create index retencion_documento_origenes_servicio_idx on public.retencion_documento_origenes (servicio_directo_id) where servicio_directo_id is not null;
create index retencion_documento_origenes_adjunto_idx on public.retencion_documento_origenes (adjunto_id) where adjunto_id is not null;
comment on table public.retencion_documento_origenes is 'Retenciones: a qué órdenes, compras o servicios cubre cada documento fiscal y de qué archivo salió';

-- Guarda de adjuntos_directos: campos fijos; nada registrado se toca; el borrado de una factura queda en el historial.
create function public.adjuntos_directos_guarda()
returns trigger language plpgsql security definer set search_path = public as $$
declare quien text := coalesce(auth.jwt() ->> 'email', current_user);
begin
  if tg_op = 'INSERT' then
    if new.modulo = 'orden_factura' and new.es_factura is null then new.es_factura := true; end if;
    return new;
  end if;
  if exists (select 1 from public.retencion_documento_origenes p where p.adjunto_id = old.id) then
    raise exception using errcode = 'P0001',
      message = 'RET_ADJUNTO_REGISTRADO: este archivo ya está registrado como factura en Retenciones; no se cambia ni se borra mientras su documento fiscal exista.';
  end if;
  if tg_op = 'DELETE' then
    if old.modulo <> 'orden' then
      insert into public.retencion_historial (tabla, clave, antes, despues, motivo, actor)
      values (tg_table_name, old.modulo || ':' || old.path, to_jsonb(old), null, 'borrado', quien);
    end if;
    return old;
  end if;
  if (new.modulo, new.ref_id, new.path, new.created_at, new.created_by)
     is distinct from (old.modulo, old.ref_id, old.path, old.created_at, old.created_by) then
    raise exception using errcode = 'P0001', message = 'RET_ADJUNTO_CAMPO: de un archivo solo se cambian el nombre, el tipo y si es factura.';
  end if;
  return new;
end $$;
revoke execute on function public.adjuntos_directos_guarda() from public, anon, authenticated;
create trigger trg_adjuntos_directos_guarda before insert or update or delete on public.adjuntos_directos
  for each row execute function public.adjuntos_directos_guarda();

-- Guarda de la puente: un origen; el archivo es de ESE origen y cuenta como factura; quién y cuándo.
create function public.retencion_documento_origenes_guarda()
returns trigger language plpgsql security definer set search_path = public as $$
declare a public.adjuntos_directos;
begin
  if num_nonnulls(new.orden_id, new.compra_directa_id, new.servicio_directo_id) <> 1 then
    raise exception using errcode = 'P0001', message = 'RET_ORIGEN_UNO: cada enlace va a exactamente una orden, compra directa o servicio directo.';
  end if;
  if new.adjunto_id is not null then
    select * into a from public.adjuntos_directos where id = new.adjunto_id;
    if found then
      if not (a.es_factura is true or (a.es_factura is null and a.modulo in ('compra', 'servicio'))) then
        raise exception using errcode = 'P0001', message = 'RET_ADJUNTO_NO_FACTURA: ese archivo no está marcado como factura (es un pago, una solicitud u otro papel).';
      end if;
      if not ((a.modulo = 'orden_factura' and a.ref_id = new.orden_id)
           or (a.modulo = 'compra' and a.ref_id = new.compra_directa_id)
           or (a.modulo = 'servicio' and a.ref_id = new.servicio_directo_id)) then
        raise exception using errcode = 'P0001', message = 'RET_ADJUNTO_ORIGEN: ese archivo de factura es de otro documento de origen.';
      end if;
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.creado_por := coalesce(auth.jwt() ->> 'email', current_user);
    new.created_at := now();
  end if;
  return new;
end $$;
revoke execute on function public.retencion_documento_origenes_guarda() from public, anon, authenticated;
create trigger trg_retencion_documento_origenes_guarda before insert or update on public.retencion_documento_origenes
  for each row execute function public.retencion_documento_origenes_guarda();

-- Un origen con un documento fiscal registrado no se borra (D37: no perder el origen). La FK RESTRICT de la puente es el
-- respaldo; este trigger va antes y da el código para la pantalla (en esas tablas solo hay triggers de auditoría AFTER).
create function public.retencion_origen_con_documento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.retencion_documento_origenes p
              where (tg_table_name = 'ordenes' and p.orden_id = old.id)
                 or (tg_table_name = 'compras_directas' and p.compra_directa_id = old.id)
                 or (tg_table_name = 'servicios_directos' and p.servicio_directo_id = old.id)) then
    raise exception using errcode = 'P0001',
      message = 'RET_ORIGEN_CON_DOCUMENTO: tiene una factura registrada en Retenciones; para borrarlo, primero hay que borrar ese documento fiscal (solo si está libre).';
  end if;
  return old;
end $$;
revoke execute on function public.retencion_origen_con_documento() from public, anon, authenticated;
create trigger trg_retencion_origen_con_documento before delete on public.ordenes
  for each row execute function public.retencion_origen_con_documento();
create trigger trg_retencion_origen_con_documento before delete on public.compras_directas
  for each row execute function public.retencion_origen_con_documento();
create trigger trg_retencion_origen_con_documento before delete on public.servicios_directos
  for each row execute function public.retencion_origen_con_documento();

-- El origen «principal» de retencion_documentos (el que manda la RPC de VF) se copia a la puente.
create function public.retencion_documentos_a_origenes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and coalesce(old.orden_id, old.compra_directa_id, old.servicio_directo_id) is distinct from
         coalesce(new.orden_id, new.compra_directa_id, new.servicio_directo_id) then
    delete from public.retencion_documento_origenes p
     where p.documento_id = old.id
       and coalesce(p.orden_id, p.compra_directa_id, p.servicio_directo_id) = coalesce(old.orden_id, old.compra_directa_id, old.servicio_directo_id)
       and p.adjunto_id is null;
  end if;
  if num_nonnulls(new.orden_id, new.compra_directa_id, new.servicio_directo_id) = 1 then
    insert into public.retencion_documento_origenes (documento_id, orden_id, compra_directa_id, servicio_directo_id)
    values (new.id, new.orden_id, new.compra_directa_id, new.servicio_directo_id)
    on conflict (documento_id, (coalesce(orden_id, compra_directa_id, servicio_directo_id))) do nothing;
  end if;
  return null;
end $$;
revoke execute on function public.retencion_documentos_a_origenes() from public, anon, authenticated;
create trigger trg_retencion_documentos_a_origenes after insert or update of orden_id, compra_directa_id, servicio_directo_id
  on public.retencion_documentos for each row execute function public.retencion_documentos_a_origenes();

-- 3) retencion_documentos: forma, FK, únicos por sentido y borrado de una factura libre.
alter table public.retencion_documentos add constraint retencion_documentos_forma check (
      (factura_nro is null or (length(factura_nro) between 1 and 30 and factura_nro = btrim(factura_nro) and factura_nro !~ '[\r\n]'))
  and (factura_control is null or (length(factura_control) between 1 and 30 and factura_control = btrim(factura_control) and factura_control !~ '[\r\n]'))
  and (factura_fecha is null or factura_fecha between date '2000-01-01' and date '2100-12-31'));
alter table public.retencion_documentos
  add constraint retencion_documentos_compra_directa_fk foreign key (compra_directa_id) references public.compras_directas (id) on delete set null;
create index retencion_documentos_compra_fk_idx on public.retencion_documentos (compra_directa_id) where compra_directa_id is not null;
-- Practicada: la emite el proveedor (su RIF, o el proveedor si falta el RIF). Recibida: la emitimos nosotros.
create unique index retencion_documentos_unica_practicada on public.retencion_documentos
  ((coalesce(upper(regexp_replace(rif, '[^A-Za-z0-9]', '', 'g')), proveedor_id::text)), factura_nro, (coalesce(factura_control, '')), tipo_documento)
  where rol = 'practicada' and factura_nro is not null;
create unique index retencion_documentos_unica_recibida on public.retencion_documentos
  (factura_nro, (coalesce(factura_control, '')), tipo_documento)
  where rol = 'sufrida' and factura_nro is not null;

create function public.retencion_documentos_borrado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.retenciones r where r.documento_id = old.id)
     or exists (select 1 from public.retencion_decisiones d where d.documento_id = old.id)
     or exists (select 1 from public.retencion_documentos x where x.documento_afectado_id = old.id) then
    raise exception using errcode = 'P0001',
      message = 'RET_DOCUMENTO_NO_LIBRE: esta factura tiene retenciones (aunque estén anuladas), decisiones o notas que la afectan: no se borra.';
  end if;
  insert into public.retencion_historial (tabla, clave, antes, despues, motivo, actor)
  values (tg_table_name, coalesce(old.factura_nro, '?') || ':' || old.id, to_jsonb(old), null, 'borrado',
          coalesce(auth.jwt() ->> 'email', current_user));
  return old;
end $$;
revoke execute on function public.retencion_documentos_borrado() from public, anon, authenticated;
create trigger trg_retencion_documentos_borrado before delete on public.retencion_documentos
  for each row execute function public.retencion_documentos_borrado();

grant delete on public.retencion_documentos to authenticated;
create policy retencion_documentos_delete on public.retencion_documentos for delete to authenticated
  using ((select public.is_admin()) or (select public.puede('retenciones')));

-- RLS de la puente (adjuntos_directos conserva las suyas)
alter table public.retencion_documento_origenes enable row level security;
revoke all on public.retencion_documento_origenes from anon;
revoke truncate, references, trigger on public.retencion_documento_origenes from authenticated;

create policy retencion_documento_origenes_read on public.retencion_documento_origenes for select to authenticated using (true);
create policy retencion_documento_origenes_insert on public.retencion_documento_origenes for insert to authenticated
  with check ((select public.is_admin()) or (select public.puede('retenciones')) or (select public.puede('tesoreria')));
create policy retencion_documento_origenes_update on public.retencion_documento_origenes for update to authenticated
  using ((select public.is_admin()) or (select public.puede('retenciones')) or (select public.puede('tesoreria')))
  with check ((select public.is_admin()) or (select public.puede('retenciones')) or (select public.puede('tesoreria')));
create policy retencion_documento_origenes_delete on public.retencion_documento_origenes for delete to authenticated
  using ((select public.is_admin()) or (select public.puede('retenciones')) or (select public.puede('tesoreria')));

alter publication supabase_realtime add table public.retencion_documento_origenes;

-- 4) Vistas (respetan la RLS de quien consulta)
create view public.origen_facturas_adjuntos_estado with (security_invoker = true) as
select a.id as adjunto_id, a.modulo,
       case a.modulo when 'orden_factura' then 'oc' when 'compra' then 'compra_directa' else 'servicio_directo' end as origen_tipo,
       a.ref_id as origen_id,
       case a.modulo when 'orden_factura' then 'compras-oc' when 'compra' then 'compras-directas' else 'servicios-directos' end as bucket,
       a.path, a.nombre, a.content_type, a.es_factura, a.created_by as subido_por, a.created_at as subido_en,
       exists (select 1 from public.retencion_documento_origenes p where p.adjunto_id = a.id) as registrado,
       (select array_agg(p.documento_id) from public.retencion_documento_origenes p where p.adjunto_id = a.id) as documentos
  from public.adjuntos_directos a
 where (a.es_factura is true or (a.es_factura is null and a.modulo in ('compra', 'servicio')))
   and ((a.modulo = 'orden_factura' and exists (select 1 from public.ordenes o where o.id = a.ref_id))
     or (a.modulo = 'compra' and exists (select 1 from public.compras_directas c where c.id = a.ref_id))
     or (a.modulo = 'servicio' and exists (select 1 from public.servicios_directos s where s.id = a.ref_id)));
comment on view public.origen_facturas_adjuntos_estado is
  'Cada archivo que cuenta como factura de un origen que existe, y si ya está registrado como documento fiscal';

create view public.retencion_documentos_por_origen with (security_invoker = true) as
select p.id as enlace_id,
       case when p.orden_id is not null then 'oc' when p.compra_directa_id is not null then 'compra_directa' else 'servicio_directo' end as origen_tipo,
       coalesce(p.orden_id, p.compra_directa_id, p.servicio_directo_id) as origen_id,
       p.adjunto_id,
       d.id as documento_id, d.rol, d.tipo_documento, d.factura_nro, d.factura_control, d.factura_fecha, d.factura_total, d.moneda,
       d.proveedor_id, d.rif, d.razon_social,
       coalesce((select jsonb_object_agg(r.tipo, r.estado) from public.retenciones r where r.documento_id = d.id and r.estado <> 'anulada'), '{}'::jsonb) as retenciones,
       coalesce((select jsonb_object_agg(x.impuesto_clave, x.decision) from public.retencion_decisiones x where x.documento_id = d.id), '{}'::jsonb) as decisiones,
       not (exists (select 1 from public.retenciones r where r.documento_id = d.id)
            or exists (select 1 from public.retencion_decisiones x where x.documento_id = d.id)
            or exists (select 1 from public.retencion_documentos y where y.documento_afectado_id = d.id)) as libre
  from public.retencion_documento_origenes p
  join public.retencion_documentos d on d.id = p.documento_id;
comment on view public.retencion_documentos_por_origen is 'Cada documento fiscal por cada origen que cubre, con sus retenciones vigentes, decisiones y si está libre';

create view public.origenes_sin_factura with (security_invoker = true) as
select 'oc'::text as origen_tipo, o.id as origen_id, coalesce(o.oc_codigo, o.codigo) as codigo, o.recibida_en as desde
  from public.ordenes o
 where o.recibida_en is not null and o.factura_path is null and o.factura_recepcion_path is null
   and not exists (select 1 from public.adjuntos_directos a where a.modulo = 'orden_factura' and a.ref_id = o.id)
   and not exists (select 1 from public.retencion_documento_origenes p where p.orden_id = o.id)
union all
select 'compra_directa', c.id, c.codigo, c.recepcionada_at
  from public.compras_directas c
 where c.recepcionada_at is not null and c.adjunto_path is null
   and not exists (select 1 from public.adjuntos_directos a where a.modulo = 'compra' and a.ref_id = c.id and a.es_factura is not false)
   and not exists (select 1 from public.retencion_documento_origenes p where p.compra_directa_id = c.id)
union all
select 'servicio_directo', s.id, s.codigo, s.finalizada_at
  from public.servicios_directos s
 where s.finalizada_at is not null and s.adjunto_path is null
   and not exists (select 1 from public.adjuntos_directos a where a.modulo = 'servicio' and a.ref_id = s.id and a.es_factura is not false)
   and not exists (select 1 from public.retencion_documento_origenes p where p.servicio_directo_id = s.id);
comment on view public.origenes_sin_factura is
  'OC recibidas, compras directas recepcionadas y servicios finalizados sin ningún archivo que cuente como factura (aviso de la pantalla)';

revoke all on public.origen_facturas_adjuntos_estado, public.retencion_documentos_por_origen, public.origenes_sin_factura from anon;

-- 5) Storage: un archivo registrado como factura no se borra ni se sobrescribe (nadie, ni admin); Compras limpia las
--    facturas de OC que no están registradas. Las demás condiciones de cada política quedan como estaban.
drop policy "compras-directas delete op" on storage.objects;
create policy "compras-directas delete op" on storage.objects for delete to authenticated
  using (bucket_id = 'compras-directas' and (select public.is_operativo())
         and not exists (select 1 from public.adjuntos_directos a join public.retencion_documento_origenes p on p.adjunto_id = a.id
                          where a.modulo = 'compra' and a.path = storage.objects.name));
drop policy "compras-directas update op" on storage.objects;
create policy "compras-directas update op" on storage.objects for update to authenticated
  using (bucket_id = 'compras-directas' and (select public.is_operativo())
         and not exists (select 1 from public.adjuntos_directos a join public.retencion_documento_origenes p on p.adjunto_id = a.id
                          where a.modulo = 'compra' and a.path = storage.objects.name))
  with check (bucket_id = 'compras-directas' and (select public.is_operativo())
         and not exists (select 1 from public.adjuntos_directos a join public.retencion_documento_origenes p on p.adjunto_id = a.id
                          where a.modulo = 'compra' and a.path = storage.objects.name));
drop policy "servicios-directos delete op" on storage.objects;
create policy "servicios-directos delete op" on storage.objects for delete to authenticated
  using (bucket_id = 'servicios-directos' and (select public.is_operativo())
         and not exists (select 1 from public.adjuntos_directos a join public.retencion_documento_origenes p on p.adjunto_id = a.id
                          where a.modulo = 'servicio' and a.path = storage.objects.name));
drop policy "servicios-directos update op" on storage.objects;
create policy "servicios-directos update op" on storage.objects for update to authenticated
  using (bucket_id = 'servicios-directos' and (select public.is_operativo())
         and not exists (select 1 from public.adjuntos_directos a join public.retencion_documento_origenes p on p.adjunto_id = a.id
                          where a.modulo = 'servicio' and a.path = storage.objects.name))
  with check (bucket_id = 'servicios-directos' and (select public.is_operativo())
         and not exists (select 1 from public.adjuntos_directos a join public.retencion_documento_origenes p on p.adjunto_id = a.id
                          where a.modulo = 'servicio' and a.path = storage.objects.name));
drop policy "compras-oc delete op" on storage.objects;
create policy "compras-oc delete op" on storage.objects for delete to authenticated
  using (bucket_id = 'compras-oc' and (select public.is_admin())
         and not exists (select 1 from public.adjuntos_directos a join public.retencion_documento_origenes p on p.adjunto_id = a.id
                          where a.modulo = 'orden_factura' and a.path = storage.objects.name));
drop policy "compras-oc update op" on storage.objects;
create policy "compras-oc update op" on storage.objects for update to authenticated
  using (bucket_id = 'compras-oc'
         and ((select public.is_admin()) or (select public.puede('pedidos')) or (select public.puede('tesoreria')) or (select public.puede('retenciones')))
         and not exists (select 1 from public.adjuntos_directos a join public.retencion_documento_origenes p on p.adjunto_id = a.id
                          where a.modulo = 'orden_factura' and a.path = storage.objects.name))
  with check (bucket_id = 'compras-oc'
         and ((select public.is_admin()) or (select public.puede('pedidos')) or (select public.puede('tesoreria')) or (select public.puede('retenciones')))
         and not exists (select 1 from public.adjuntos_directos a join public.retencion_documento_origenes p on p.adjunto_id = a.id
                          where a.modulo = 'orden_factura' and a.path = storage.objects.name));
create policy "compras-oc delete factura huerfana" on storage.objects for delete to authenticated
  using (bucket_id = 'compras-oc' and name like '%/facturas/%'
         and ((select public.is_admin()) or (select public.puede('pedidos')))
         and not exists (select 1 from public.adjuntos_directos a join public.retencion_documento_origenes p on p.adjunto_id = a.id
                          where a.modulo = 'orden_factura' and a.path = storage.objects.name));

-- 6) Datos (D38): reenlazar los «📎 Adjuntos» de OC que se subieron a op-imagenes y nunca se registraron (el CHECK
--    rechazaba 'orden'). Solo archivos con la forma de FacturasDirectas (<orden>/<stamp>-<nombre>) cuya orden existe y que
--    no tienen fila. No toca ningún archivo. Idempotente. El 20/10 01:58-02:10: 54 (y 2 de órdenes ya borradas, que no
--    se enlazan).
insert into public.adjuntos_directos (modulo, ref_id, path, nombre, content_type, created_at, created_by)
select 'orden', r.id, o.name,
       regexp_replace(split_part(o.name, '/', 2), '^[0-9a-z]{2,8}-', ''),
       nullif(o.metadata ->> 'mimetype', ''),
       o.created_at,
       coalesce((select u.email from public.usuarios u where u.id = o.owner), 'reenlace P03')
  from storage.objects o
  join public.ordenes r on r.id::text = split_part(o.name, '/', 1)
 where o.bucket_id = 'op-imagenes'
   and o.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-z]{2,8}-[^/]+$'
   and not exists (select 1 from public.adjuntos_directos a where a.path = o.name);

-- ── Registro de esta migración, con su SQL completo (mismo bloque: si algo de arriba falla, no queda) ──
 es_factura; la factura de la OC va bajo /facturas/.
alter table public.adjuntos_directos drop constraint adjuntos_directos_modulo_check;
alter table public.adjuntos_directos add constraint adjuntos_directos_modulo_check
  check (modulo in ('compra', 'servicio', 'orden', 'orden_factura'));
alter table public.adjuntos_directos add column es_factura boolean;
alter table public.adjuntos_directos add constraint adjuntos_directos_es_factura check (
      (modulo <> 'orden' or es_factura is not true)
  and (modulo <> 'orden_factura' or (es_factura is true and path like '%/facturas/%')));
comment on column public.adjuntos_directos.es_factura is
  'true = factura del proveedor; false = otro papel (pago, solicitud…); null = cargado antes de P03 (en compra y servicio cuenta como factura)';
comment on table public.adjuntos_directos is
  'Compras: archivos de compra directa, servicio directo, OC (generales) y facturas de OC (orden_factura → compras-oc, <orden>/facturas/…)';

-- 2) Puente documento fiscal × origen (Retenciones)
create table public.retencion_documento_origenes (
  id                   uuid primary key default gen_random_uuid(),
  documento_id         uuid not null references public.retencion_documentos (id) on delete cascade,
  orden_id             uuid references public.ordenes (id) on delete restrict,
  compra_directa_id    uuid references public.compras_directas (id) on delete restrict,
  servicio_directo_id  uuid references public.servicios_directos (id) on delete restrict,
  adjunto_id           uuid references public.adjuntos_directos (id) on delete set null,
  creado_por           text,
  created_at           timestamptz not null default now(),
  check (num_nonnulls(orden_id, compra_directa_id, servicio_directo_id) = 1)
);
create unique index retencion_documento_origenes_unico on public.retencion_documento_origenes
  (documento_id, (coalesce(orden_id, compra_directa_id, servicio_directo_id)));
create index retencion_documento_origenes_orden_idx on public.retencion_documento_origenes (orden_id) where orden_id is not null;
create index retencion_documento_origenes_compra_idx on public.retencion_documento_origenes (compra_directa_id) where compra_directa_id is not null;
create index retencion_documento_origenes_servicio_idx on public.retencion_documento_origenes (servicio_directo_id) where servicio_directo_id is not null;
create index retencion_documento_origenes_adjunto_idx on public.retencion_documento_origenes (adjunto_id) where adjunto_id is not null;
comment on table public.retencion_documento_origenes is 'Retenciones: a qué órdenes, compras o servicios cubre cada documento fiscal y de qué archivo salió';

-- Guarda de adjuntos_directos: campos fijos; nada registrado se toca; el borrado de una factura queda en el historial.
create function public.adjuntos_directos_guarda()
returns trigger language plpgsql security definer set search_path = public as $$
declare quien text := coalesce(auth.jwt() ->> 'email', current_user);
begin
  if tg_op = 'INSERT' then
    if new.modulo = 'orden_factura' and new.es_factura is null then new.es_factura := true; end if;
    return new;
  end if;
  if exists (select 1 from public.retencion_documento_origenes p where p.adjunto_id = old.id) then
    raise exception using errcode = 'P0001',
      message = 'RET_ADJUNTO_REGISTRADO: este archivo ya está registrado como factura en Retenciones; no se cambia ni se borra mientras su documento fiscal exista.';
  end if;
  if tg_op = 'DELETE' then
    if old.modulo <> 'orden' then
      insert into public.retencion_historial (tabla, clave, antes, despues, motivo, actor)
      values (tg_table_name, old.modulo || ':' || old.path, to_jsonb(old), null, 'borrado', quien);
    end if;
    return old;
  end if;
  if (new.modulo, new.ref_id, new.path, new.created_at, new.created_by)
     is distinct from (old.modulo, old.ref_id, old.path, old.created_at, old.created_by) then
    raise exception using errcode = 'P0001', message = 'RET_ADJUNTO_CAMPO: de un archivo solo se cambian el nombre, el tipo y si es factura.';
  end if;
  return new;
end $$;
revoke execute on function public.adjuntos_directos_guarda() from public, anon, authenticated;
create trigger trg_adjuntos_directos_guarda before insert or update or delete on public.adjuntos_directos
  for each row execute function public.adjuntos_directos_guarda();

-- Guarda de la puente: un origen; el archivo es de ESE origen y cuenta como factura; quién y cuándo.
create function public.retencion_documento_origenes_guarda()
returns trigger language plpgsql security definer set search_path = public as $$
declare a public.adjuntos_directos;
begin
  if num_nonnulls(new.orden_id, new.compra_directa_id, new.servicio_directo_id) <> 1 then
    raise exception using errcode = 'P0001', message = 'RET_ORIGEN_UNO: cada enlace va a exactamente una orden, compra directa o servicio directo.';
  end if;
  if new.adjunto_id is not null then
    select * into a from public.adjuntos_directos where id = new.adjunto_id;
    if found then
      if not (a.es_factura is true or (a.es_factura is null and a.modulo in ('compra', 'servicio'))) then
        raise exception using errcode = 'P0001', message = 'RET_ADJUNTO_NO_FACTURA: ese archivo no está marcado como factura (es un pago, una solicitud u otro papel).';
      end if;
      if not ((a.modulo = 'orden_factura' and a.ref_id = new.orden_id)
           or (a.modulo = 'compra' and a.ref_id = new.compra_directa_id)
           or (a.modulo = 'servicio' and a.ref_id = new.servicio_directo_id)) then
        raise exception using errcode = 'P0001', message = 'RET_ADJUNTO_ORIGEN: ese archivo de factura es de otro documento de origen.';
      end if;
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.creado_por := coalesce(auth.jwt() ->> 'email', current_user);
    new.created_at := now();
  end if;
  return new;
end $$;
revoke execute on function public.retencion_documento_origenes_guarda() from public, anon, authenticated;
create trigger trg_retencion_documento_origenes_guarda before insert or update on public.retencion_documento_origenes
  for each row execute function public.retencion_documento_origenes_guarda();

-- Un origen con un documento fiscal registrado no se borra (D37: no perder el origen). La FK RESTRICT de la puente es el
-- respaldo; este trigger va antes y da el código para la pantalla (en esas tablas solo hay triggers de auditoría AFTER).
create function public.retencion_origen_con_documento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.retencion_documento_origenes p
              where (tg_table_name = 'ordenes' and p.orden_id = old.id)
                 or (tg_table_name = 'compras_directas' and p.compra_directa_id = old.id)
                 or (tg_table_name = 'servicios_directos' and p.servicio_directo_id = old.id)) then
    raise exception using errcode = 'P0001',
      message = 'RET_ORIGEN_CON_DOCUMENTO: tiene una factura registrada en Retenciones; para borrarlo, primero hay que borrar ese documento fiscal (solo si está libre).';
  end if;
  return old;
end $$;
revoke execute on function public.retencion_origen_con_documento() from public, anon, authenticated;
create trigger trg_retencion_origen_con_documento before delete on public.ordenes
  for each row execute function public.retencion_origen_con_documento();
create trigger trg_retencion_origen_con_documento before delete on public.compras_directas
  for each row execute function public.retencion_origen_con_documento();
create trigger trg_retencion_origen_con_documento before delete on public.servicios_directos
  for each row execute function public.retencion_origen_con_documento();

-- El origen «principal» de retencion_documentos (el que manda la RPC de VF) se copia a la puente.
create function public.retencion_documentos_a_origenes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and coalesce(old.orden_id, old.compra_directa_id, old.servicio_directo_id) is distinct from
         coalesce(new.orden_id, new.compra_directa_id, new.servicio_directo_id) then
    delete from public.retencion_documento_origenes p
     where p.documento_id = old.id
       and coalesce(p.orden_id, p.compra_directa_id, p.servicio_directo_id) = coalesce(old.orden_id, old.compra_directa_id, old.servicio_directo_id)
       and p.adjunto_id is null;
  end if;
  if num_nonnulls(new.orden_id, new.compra_directa_id, new.servicio_directo_id) = 1 then
    insert into public.retencion_documento_origenes (documento_id, orden_id, compra_directa_id, servicio_directo_id)
    values (new.id, new.orden_id, new.compra_directa_id, new.servicio_directo_id)
    on conflict (documento_id, (coalesce(orden_id, compra_directa_id, servicio_directo_id))) do nothing;
  end if;
  return null;
end $$;
revoke execute on function public.retencion_documentos_a_origenes() from public, anon, authenticated;
create trigger trg_retencion_documentos_a_origenes after insert or update of orden_id, compra_directa_id, servicio_directo_id
  on public.retencion_documentos for each row execute function public.retencion_documentos_a_origenes();

-- 3) retencion_documentos: forma, FK, únicos por sentido y borrado de una factura libre.
alter table public.retencion_documentos add constraint retencion_documentos_forma check (
      (factura_nro is null or (length(factura_nro) between 1 and 30 and factura_nro = btrim(factura_nro) and factura_nro !~ '[\r\n]'))
  and (factura_control is null or (length(factura_control) between 1 and 30 and factura_control = btrim(factura_control) and factura_control !~ '[\r\n]'))
  and (factura_fecha is null or factura_fecha between date '2000-01-01' and date '2100-12-31'));
alter table public.retencion_documentos
  add constraint retencion_documentos_compra_directa_fk foreign key (compra_directa_id) references public.compras_directas (id) on delete set null;
create index retencion_documentos_compra_fk_idx on public.retencion_documentos (compra_directa_id) where compra_directa_id is not null;
-- Practicada: la emite el proveedor (su RIF, o el proveedor si falta el RIF). Recibida: la emitimos nosotros.
create unique index retencion_documentos_unica_practicada on public.retencion_documentos
  ((coalesce(upper(regexp_replace(rif, '[^A-Za-z0-9]', '', 'g')), proveedor_id::text)), factura_nro, (coalesce(factura_control, '')), tipo_documento)
  where rol = 'practicada' and factura_nro is not null;
create unique index retencion_documentos_unica_recibida on public.retencion_documentos
  (factura_nro, (coalesce(factura_control, '')), tipo_documento)
  where rol = 'sufrida' and factura_nro is not null;

create function public.retencion_documentos_borrado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.retenciones r where r.documento_id = old.id)
     or exists (select 1 from public.retencion_decisiones d where d.documento_id = old.id)
     or exists (select 1 from public.retencion_documentos x where x.documento_afectado_id = old.id) then
    raise exception using errcode = 'P0001',
      message = 'RET_DOCUMENTO_NO_LIBRE: esta factura tiene retenciones (aunque estén anuladas), decisiones o notas que la afectan: no se borra.';
  end if;
  insert into public.retencion_historial (tabla, clave, antes, despues, motivo, actor)
  values (tg_table_name, coalesce(old.factura_nro, '?') || ':' || old.id, to_jsonb(old), null, 'borrado',
          coalesce(auth.jwt() ->> 'email', current_user));
  return old;
end $$;
revoke execute on function public.retencion_documentos_borrado() from public, anon, authenticated;
create trigger trg_retencion_documentos_borrado before delete on public.retencion_documentos
  for each row execute function public.retencion_documentos_borrado();

grant delete on public.retencion_documentos to authenticated;
create policy retencion_documentos_delete on public.retencion_documentos for delete to authenticated
  using ((select public.is_admin()) or (select public.puede('retenciones')));

-- RLS de la puente (adjuntos_directos conserva las suyas)
alter table public.retencion_documento_origenes enable row level security;
revoke all on public.retencion_documento_origenes from anon;
revoke truncate, references, trigger on public.retencion_documento_origenes from authenticated;

create policy retencion_documento_origenes_read on public.retencion_documento_origenes for select to authenticated using (true);
create policy retencion_documento_origenes_insert on public.retencion_documento_origenes for insert to authenticated
  with check ((select public.is_admin()) or (select public.puede('retenciones')) or (select public.puede('tesoreria')));
create policy retencion_documento_origenes_update on public.retencion_documento_origenes for update to authenticated
  using ((select public.is_admin()) or (select public.puede('retenciones')) or (select public.puede('tesoreria')))
  with check ((select public.is_admin()) or (select public.puede('retenciones')) or (select public.puede('tesoreria')));
create policy retencion_documento_origenes_delete on public.retencion_documento_origenes for delete to authenticated
  using ((select public.is_admin()) or (select public.puede('retenciones')) or (select public.puede('tesoreria')));

alter publication supabase_realtime add table public.retencion_documento_origenes;

-- 4) Vistas (respetan la RLS de quien consulta)
create view public.origen_facturas_adjuntos_estado with (security_invoker = true) as
select a.id as adjunto_id, a.modulo,
       case a.modulo when 'orden_factura' then 'oc' when 'compra' then 'compra_directa' else 'servicio_directo' end as origen_tipo,
       a.ref_id as origen_id,
       case a.modulo when 'orden_factura' then 'compras-oc' when 'compra' then 'compras-directas' else 'servicios-directos' end as bucket,
       a.path, a.nombre, a.content_type, a.es_factura, a.created_by as subido_por, a.created_at as subido_en,
       exists (select 1 from public.retencion_documento_origenes p where p.adjunto_id = a.id) as registrado,
       (select array_agg(p.documento_id) from public.retencion_documento_origenes p where p.adjunto_id = a.id) as documentos
  from public.adjuntos_directos a
 where (a.es_factura is true or (a.es_factura is null and a.modulo in ('compra', 'servicio')))
   and ((a.modulo = 'orden_factura' and exists (select 1 from public.ordenes o where o.id = a.ref_id))
     or (a.modulo = 'compra' and exists (select 1 from public.compras_directas c where c.id = a.ref_id))
     or (a.modulo = 'servicio' and exists (select 1 from public.servicios_directos s where s.id = a.ref_id)));
comment on view public.origen_facturas_adjuntos_estado is
  'Cada archivo que cuenta como factura de un origen que existe, y si ya está registrado como documento fiscal';

create view public.retencion_documentos_por_origen with (security_invoker = true) as
select p.id as enlace_id,
       case when p.orden_id is not null then 'oc' when p.compra_directa_id is not null then 'compra_directa' else 'servicio_directo' end as origen_tipo,
       coalesce(p.orden_id, p.compra_directa_id, p.servicio_directo_id) as origen_id,
       p.adjunto_id,
       d.id as documento_id, d.rol, d.tipo_documento, d.factura_nro, d.factura_control, d.factura_fecha, d.factura_total, d.moneda,
       d.proveedor_id, d.rif, d.razon_social,
       coalesce((select jsonb_object_agg(r.tipo, r.estado) from public.retenciones r where r.documento_id = d.id and r.estado <> 'anulada'), '{}'::jsonb) as retenciones,
       coalesce((select jsonb_object_agg(x.impuesto_clave, x.decision) from public.retencion_decisiones x where x.documento_id = d.id), '{}'::jsonb) as decisiones,
       not (exists (select 1 from public.retenciones r where r.documento_id = d.id)
            or exists (select 1 from public.retencion_decisiones x where x.documento_id = d.id)
            or exists (select 1 from public.retencion_documentos y where y.documento_afectado_id = d.id)) as libre
  from public.retencion_documento_origenes p
  join public.retencion_documentos d on d.id = p.documento_id;
comment on view public.retencion_documentos_por_origen is 'Cada documento fiscal por cada origen que cubre, con sus retenciones vigentes, decisiones y si está libre';

create view public.origenes_sin_factura with (security_invoker = true) as
select 'oc'::text as origen_tipo, o.id as origen_id, coalesce(o.oc_codigo, o.codigo) as codigo, o.recibida_en as desde
  from public.ordenes o
 where o.recibida_en is not null and o.factura_path is null and o.factura_recepcion_path is null
   and not exists (select 1 from public.adjuntos_directos a where a.modulo = 'orden_factura' and a.ref_id = o.id)
   and not exists (select 1 from public.retencion_documento_origenes p where p.orden_id = o.id)
union all
select 'compra_directa', c.id, c.codigo, c.recepcionada_at
  from public.compras_directas c
 where c.recepcionada_at is not null and c.adjunto_path is null
   and not exists (select 1 from public.adjuntos_directos a where a.modulo = 'compra' and a.ref_id = c.id and a.es_factura is not false)
   and not exists (select 1 from public.retencion_documento_origenes p where p.compra_directa_id = c.id)
union all
select 'servicio_directo', s.id, s.codigo, s.finalizada_at
  from public.servicios_directos s
 where s.finalizada_at is not null and s.adjunto_path is null
   and not exists (select 1 from public.adjuntos_directos a where a.modulo = 'servicio' and a.ref_id = s.id and a.es_factura is not false)
   and not exists (select 1 from public.retencion_documento_origenes p where p.servicio_directo_id = s.id);
comment on view public.origenes_sin_factura is
  'OC recibidas, compras directas recepcionadas y servicios finalizados sin ningún archivo que cuente como factura (aviso de la pantalla)';

revoke all on public.origen_facturas_adjuntos_estado, public.retencion_documentos_por_origen, public.origenes_sin_factura from anon;

-- 5) Storage: un archivo registrado como factura no se borra ni se sobrescribe (nadie, ni admin); Compras limpia las
--    facturas de OC que no están registradas. Las demás condiciones de cada política quedan como estaban.
drop policy "compras-directas delete op" on storage.objects;
create policy "compras-directas delete op" on storage.objects for delete to authenticated
  using (bucket_id = 'compras-directas' and (select public.is_operativo())
         and not exists (select 1 from public.adjuntos_directos a join public.retencion_documento_origenes p on p.adjunto_id = a.id
                          where a.modulo = 'compra' and a.path = storage.objects.name));
drop policy "compras-directas update op" on storage.objects;
create policy "compras-directas update op" on storage.objects for update to authenticated
  using (bucket_id = 'compras-directas' and (select public.is_operativo())
         and not exists (select 1 from public.adjuntos_directos a join public.retencion_documento_origenes p on p.adjunto_id = a.id
                          where a.modulo = 'compra' and a.path = storage.objects.name))
  with check (bucket_id = 'compras-directas' and (select public.is_operativo())
         and not exists (select 1 from public.adjuntos_directos a join public.retencion_documento_origenes p on p.adjunto_id = a.id
                          where a.modulo = 'compra' and a.path = storage.objects.name));
drop policy "servicios-directos delete op" on storage.objects;
create policy "servicios-directos delete op" on storage.objects for delete to authenticated
  using (bucket_id = 'servicios-directos' and (select public.is_operativo())
         and not exists (select 1 from public.adjuntos_directos a join public.retencion_documento_origenes p on p.adjunto_id = a.id
                          where a.modulo = 'servicio' and a.path = storage.objects.name));
drop policy "servicios-directos update op" on storage.objects;
create policy "servicios-directos update op" on storage.objects for update to authenticated
  using (bucket_id = 'servicios-directos' and (select public.is_operativo())
         and not exists (select 1 from public.adjuntos_directos a join public.retencion_documento_origenes p on p.adjunto_id = a.id
                          where a.modulo = 'servicio' and a.path = storage.objects.name))
  with check (bucket_id = 'servicios-directos' and (select public.is_operativo())
         and not exists (select 1 from public.adjuntos_directos a join public.retencion_documento_origenes p on p.adjunto_id = a.id
                          where a.modulo = 'servicio' and a.path = storage.objects.name));
drop policy "compras-oc delete op" on storage.objects;
create policy "compras-oc delete op" on storage.objects for delete to authenticated
  using (bucket_id = 'compras-oc' and (select public.is_admin())
         and not exists (select 1 from public.adjuntos_directos a join public.retencion_documento_origenes p on p.adjunto_id = a.id
                          where a.modulo = 'orden_factura' and a.path = storage.objects.name));
drop policy "compras-oc update op" on storage.objects;
create policy "compras-oc update op" on storage.objects for update to authenticated
  using (bucket_id = 'compras-oc'
         and ((select public.is_admin()) or (select public.puede('pedidos')) or (select public.puede('tesoreria')) or (select public.puede('retenciones')))
         and not exists (select 1 from public.adjuntos_directos a join public.retencion_documento_origenes p on p.adjunto_id = a.id
                          where a.modulo = 'orden_factura' and a.path = storage.objects.name))
  with check (bucket_id = 'compras-oc'
         and ((select public.is_admin()) or (select public.puede('pedidos')) or (select public.puede('tesoreria')) or (select public.puede('retenciones')))
         and not exists (select 1 from public.adjuntos_directos a join public.retencion_documento_origenes p on p.adjunto_id = a.id
                          where a.modulo = 'orden_factura' and a.path = storage.objects.name));
create policy "compras-oc delete factura huerfana" on storage.objects for delete to authenticated
  using (bucket_id = 'compras-oc' and name like '%/facturas/%'
         and ((select public.is_admin()) or (select public.puede('pedidos')))
         and not exists (select 1 from public.adjuntos_directos a join public.retencion_documento_origenes p on p.adjunto_id = a.id
                          where a.modulo = 'orden_factura' and a.path = storage.objects.name));

-- 6) Datos (D38): reenlazar los «📎 Adjuntos» de OC que se subieron a op-imagenes y nunca se registraron (el CHECK
--    rechazaba 'orden'). Solo archivos con la forma de FacturasDirectas (<orden>/<stamp>-<nombre>) cuya orden existe y que
--    no tienen fila. No toca ningún archivo. Idempotente. El 20/10 01:58-02:10: 54 (y 2 de órdenes ya borradas, que no
--    se enlazan).
insert into public.adjuntos_directos (modulo, ref_id, path, nombre, content_type, created_at, created_by)
select 'orden', r.id, o.name,
       regexp_replace(split_part(o.name, '/', 2), '^[0-9a-z]{2,8}-', ''),
       nullif(o.metadata ->> 'mimetype', ''),
       o.created_at,
       coalesce((select u.email from public.usuarios u where u.id = o.owner), 'reenlace P03')
  from storage.objects o
  join public.ordenes r on r.id::text = split_part(o.name, '/', 1)
 where o.bucket_id = 'op-imagenes'
   and o.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-z]{2,8}-[^/]+$'
   and not exists (select 1 from public.adjuntos_directos a where a.path = o.name);


-- R7F · 12 de 13 · gt_retencion_factura_con_regla · migración gt_retencion_factura_con_regla, versión 20261020100012

-- ── Guarda: solo sigue si la base está justo antes de R7F (si no, se detiene sin escribir nada) ──


create or replace function public.retencion_factura_registrar(p_factura jsonb, p_lineas jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  f public.retencion_documentos;
  r public.retenciones;
  l jsonb;
  salida jsonb := '[]'::jsonb;
  dk text := coalesce(nullif(p_factura ->> 'doc_kind', ''), 'manual');
  did uuid := nullif(p_factura ->> 'doc_id', '')::uuid;
  t text;
  m numeric;
  fl date;
  i int := 0;
begin
  if jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception using errcode = 'P0001', message = 'RET_FACTURA_SIN_LINEAS: la factura necesita al menos una línea de impuesto.';
  end if;
  if coalesce(p_factura ->> 'rol', '') not in ('practicada', 'sufrida') then
    raise exception using errcode = 'P0001', message = 'RET_FACTURA_ROL: rol debe ser «practicada» o «sufrida».';
  end if;
  if coalesce(nullif(p_factura ->> 'tipo_documento', ''), 'factura') not in ('factura', 'nota_debito', 'nota_credito') then
    raise exception using errcode = 'P0001', message = 'RET_DOCUMENTO_TIPO: tipo_documento debe ser factura, nota_debito o nota_credito.';
  end if;
  if coalesce(nullif(p_factura ->> 'tipo_documento', ''), 'factura') <> 'factura'
     and nullif(btrim(p_factura ->> 'factura_afectada_nro'), '') is null then
    raise exception using errcode = 'P0001', message = 'RET_DOCUMENTO_AFECTADO: una nota de débito o de crédito lleva el N° de la factura que ajusta.';
  end if;
  if dk not in ('oc', 'compra_directa', 'servicio_directo', 'manual') then
    raise exception using errcode = 'P0001', message = 'RET_FACTURA_DOC: doc_kind debe ser oc, compra_directa, servicio_directo o manual.';
  end if;
  if dk <> 'manual' and did is null then
    raise exception using errcode = 'P0001', message = 'RET_FACTURA_DOC: falta doc_id para ' || dk || '.';
  end if;

  insert into public.retencion_documentos (
    rol, tipo_documento, documento_afectado_id, factura_afectada_nro,
    proveedor_id, rif, razon_social, sujeto, factura_nro, factura_control, factura_fecha, factura_total,
    exento, iva_alicuota, iva_monto, moneda, tasa, orden_id, compra_directa_id, servicio_directo_id,
    operacion, concepto, nota, actor, actor_name)
  values (
    p_factura ->> 'rol',
    coalesce(nullif(p_factura ->> 'tipo_documento', ''), 'factura'),
    nullif(p_factura ->> 'documento_afectado_id', '')::uuid,
    nullif(btrim(p_factura ->> 'factura_afectada_nro'), ''),
    nullif(p_factura ->> 'proveedor_id', '')::uuid,
    nullif(btrim(p_factura ->> 'rif'), ''),
    nullif(btrim(p_factura ->> 'razon_social'), ''),
    nullif(p_factura ->> 'sujeto', ''),
    nullif(btrim(p_factura ->> 'factura_nro'), ''),
    nullif(btrim(p_factura ->> 'factura_control'), ''),
    nullif(p_factura ->> 'factura_fecha', '')::date,
    nullif(p_factura ->> 'factura_total', '')::numeric,
    nullif(p_factura ->> 'exento', '')::numeric,
    nullif(p_factura ->> 'iva_alicuota', '')::numeric,
    nullif(p_factura ->> 'iva_monto', '')::numeric,
    coalesce(nullif(p_factura ->> 'moneda', ''), 'Bs'),
    nullif(p_factura ->> 'tasa', '')::numeric,
    case when dk = 'oc' then did end,
    case when dk = 'compra_directa' then did end,
    case when dk = 'servicio_directo' then did end,
    nullif(p_factura ->> 'operacion', ''),
    nullif(btrim(p_factura ->> 'concepto'), ''),
    nullif(btrim(p_factura ->> 'nota'), ''),
    coalesce(nullif(p_factura ->> 'actor', ''), auth.jwt() ->> 'email'),
    nullif(p_factura ->> 'actor_name', ''))
  returning * into f;

  -- (R7F) El archivo de factura del que salió (adjuntos_directos, P03) se enlaza en la misma transacción.
  if nullif(p_factura ->> 'adjunto_id', '') is not null then
    if num_nonnulls(f.orden_id, f.compra_directa_id, f.servicio_directo_id) = 0 then
      raise exception using errcode = 'P0001', message = 'RET_ADJUNTO_SIN_ORIGEN: un archivo de factura solo se enlaza a un documento de una OC, compra directa o servicio directo.';
    end if;
    update public.retencion_documento_origenes
       set adjunto_id = (p_factura ->> 'adjunto_id')::uuid
     where documento_id = f.id
       and coalesce(orden_id, compra_directa_id, servicio_directo_id) = coalesce(f.orden_id, f.compra_directa_id, f.servicio_directo_id);
    if not found then
      raise exception using errcode = 'P0001', message = 'RET_ADJUNTO_SIN_ORIGEN: no se encontró el enlace del documento con su origen.';
    end if;
  end if;

  for l in select value from jsonb_array_elements(p_lineas) loop
    i := i + 1;
    t := upper(coalesce(l ->> 'tipo', ''));
    if t = 'REGIONAL' then t := 'ESTADAL'; end if;   -- equivalencia ESTADAL ↔ regional (D6)
    if t not in ('IVA', 'ISLR', 'MUNICIPAL', 'ESTADAL', 'IGTF') then
      raise exception using errcode = 'P0001', message = 'RET_LINEA_TIPO: línea ' || i || ': tipo no válido (' || coalesce(l ->> 'tipo', 'vacío') || ').';
    end if;
    m := coalesce(nullif(l ->> 'monto', '')::numeric, 0);
    if m < 0 then
      raise exception using errcode = 'P0001', message = 'RET_MONTO_NEGATIVO: línea ' || i || ': la retención no puede ser negativa.';
    end if;
    if m = 0 and coalesce(btrim(l ->> 'descripcion'), '') = '' then
      raise exception using errcode = 'P0001', message = 'RET_CERO_SIN_MOTIVO: línea ' || i || ': una retención en 0 debe llevar el motivo (por qué no se retiene).';
    end if;
    fl := coalesce(nullif(l ->> 'fecha', '')::date, current_date);
    insert into public.retenciones (
      tipo, documento_id, fecha, base, porcentaje, sustraendo, monto, moneda, tasa, base_bs, monto_bs,
      iva_alicuota, iva_monto, motivo, concepto_codigo, concepto, municipio, descripcion,
      comprobante_nro, comprobante_periodo, quincena, valor_ut, actor, actor_name, regla_id, foto)
    values (
      t, f.id, fl,
      coalesce(nullif(l ->> 'base', '')::numeric, 0),
      coalesce(nullif(l ->> 'porcentaje', '')::numeric, 0),
      nullif(l ->> 'sustraendo', '')::numeric,
      m,
      coalesce(nullif(l ->> 'moneda', ''), f.moneda),
      coalesce(nullif(l ->> 'tasa', '')::numeric, f.tasa),
      nullif(l ->> 'base_bs', '')::numeric,
      nullif(l ->> 'monto_bs', '')::numeric,
      nullif(l ->> 'iva_alicuota', '')::numeric,
      nullif(l ->> 'iva_monto', '')::numeric,
      nullif(btrim(l ->> 'motivo'), ''),
      nullif(l ->> 'concepto_codigo', ''),
      nullif(btrim(l ->> 'concepto'), ''),
      nullif(btrim(l ->> 'municipio'), ''),
      nullif(btrim(l ->> 'descripcion'), ''),
      nullif(btrim(l ->> 'comprobante_nro'), ''),
      -- El período sale de la FACTURA (p_factura.periodo, o su fecha), nunca de la fecha de emisión de la línea.
      coalesce(nullif(l ->> 'comprobante_periodo', ''), nullif(p_factura ->> 'periodo', ''), to_char(f.factura_fecha, 'YYYYMM')),
      coalesce(nullif(l ->> 'quincena', '')::smallint,
               case when extract(day from coalesce(f.factura_fecha, fl)) <= 15 then 1 else 2 end),
      nullif(l ->> 'valor_ut', '')::numeric,
      f.actor, f.actor_name,
      nullif(l ->> 'regla_id', '')::uuid,
      case when jsonb_typeof(l -> 'foto') = 'object' then l -> 'foto' end)
    returning * into r;
    salida := salida || jsonb_build_array(to_jsonb(r));
  end loop;

  return jsonb_build_object('factura', to_jsonb(f), 'lineas', salida);
end $$;
revoke execute on function public.retencion_factura_registrar(jsonb, jsonb) from public, anon;
grant execute on function public.retencion_factura_registrar(jsonb, jsonb) to authenticated, service_role;
comment on function public.retencion_factura_registrar(jsonb, jsonb) is
  'Registra una factura con sus líneas en una transacción (VF). Desde R7F copia regla_id y foto de cada línea, y enlaza el archivo de factura (p_factura.adjunto_id) con su origen.';

-- ── Registro de esta migración, con su SQL completo (mismo bloque: si algo de arriba falla, no queda) ──

  r public.retenciones;
  l jsonb;
  salida jsonb := '[]'::jsonb;
  dk text := coalesce(nullif(p_factura ->> 'doc_kind', ''), 'manual');
  did uuid := nullif(p_factura ->> 'doc_id', '')::uuid;
  t text;
  m numeric;
  fl date;
  i int := 0;
begin
  if jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception using errcode = 'P0001', message = 'RET_FACTURA_SIN_LINEAS: la factura necesita al menos una línea de impuesto.';
  end if;
  if coalesce(p_factura ->> 'rol', '') not in ('practicada', 'sufrida') then
    raise exception using errcode = 'P0001', message = 'RET_FACTURA_ROL: rol debe ser «practicada» o «sufrida».';
  end if;
  if coalesce(nullif(p_factura ->> 'tipo_documento', ''), 'factura') not in ('factura', 'nota_debito', 'nota_credito') then
    raise exception using errcode = 'P0001', message = 'RET_DOCUMENTO_TIPO: tipo_documento debe ser factura, nota_debito o nota_credito.';
  end if;
  if coalesce(nullif(p_factura ->> 'tipo_documento', ''), 'factura') <> 'factura'
     and nullif(btrim(p_factura ->> 'factura_afectada_nro'), '') is null then
    raise exception using errcode = 'P0001', message = 'RET_DOCUMENTO_AFECTADO: una nota de débito o de crédito lleva el N° de la factura que ajusta.';
  end if;
  if dk not in ('oc', 'compra_directa', 'servicio_directo', 'manual') then
    raise exception using errcode = 'P0001', message = 'RET_FACTURA_DOC: doc_kind debe ser oc, compra_directa, servicio_directo o manual.';
  end if;
  if dk <> 'manual' and did is null then
    raise exception using errcode = 'P0001', message = 'RET_FACTURA_DOC: falta doc_id para ' || dk || '.';
  end if;

  insert into public.retencion_documentos (
    rol, tipo_documento, documento_afectado_id, factura_afectada_nro,
    proveedor_id, rif, razon_social, sujeto, factura_nro, factura_control, factura_fecha, factura_total,
    exento, iva_alicuota, iva_monto, moneda, tasa, orden_id, compra_directa_id, servicio_directo_id,
    operacion, concepto, nota, actor, actor_name)
  values (
    p_factura ->> 'rol',
    coalesce(nullif(p_factura ->> 'tipo_documento', ''), 'factura'),
    nullif(p_factura ->> 'documento_afectado_id', '')::uuid,
    nullif(btrim(p_factura ->> 'factura_afectada_nro'), ''),
    nullif(p_factura ->> 'proveedor_id', '')::uuid,
    nullif(btrim(p_factura ->> 'rif'), ''),
    nullif(btrim(p_factura ->> 'razon_social'), ''),
    nullif(p_factura ->> 'sujeto', ''),
    nullif(btrim(p_factura ->> 'factura_nro'), ''),
    nullif(btrim(p_factura ->> 'factura_control'), ''),
    nullif(p_factura ->> 'factura_fecha', '')::date,
    nullif(p_factura ->> 'factura_total', '')::numeric,
    nullif(p_factura ->> 'exento', '')::numeric,
    nullif(p_factura ->> 'iva_alicuota', '')::numeric,
    nullif(p_factura ->> 'iva_monto', '')::numeric,
    coalesce(nullif(p_factura ->> 'moneda', ''), 'Bs'),
    nullif(p_factura ->> 'tasa', '')::numeric,
    case when dk = 'oc' then did end,
    case when dk = 'compra_directa' then did end,
    case when dk = 'servicio_directo' then did end,
    nullif(p_factura ->> 'operacion', ''),
    nullif(btrim(p_factura ->> 'concepto'), ''),
    nullif(btrim(p_factura ->> 'nota'), ''),
    coalesce(nullif(p_factura ->> 'actor', ''), auth.jwt() ->> 'email'),
    nullif(p_factura ->> 'actor_name', ''))
  returning * into f;

  -- (R7F) El archivo de factura del que salió (adjuntos_directos, P03) se enlaza en la misma transacción.
  if nullif(p_factura ->> 'adjunto_id', '') is not null then
    if num_nonnulls(f.orden_id, f.compra_directa_id, f.servicio_directo_id) = 0 then
      raise exception using errcode = 'P0001', message = 'RET_ADJUNTO_SIN_ORIGEN: un archivo de factura solo se enlaza a un documento de una OC, compra directa o servicio directo.';
    end if;
    update public.retencion_documento_origenes
       set adjunto_id = (p_factura ->> 'adjunto_id')::uuid
     where documento_id = f.id
       and coalesce(orden_id, compra_directa_id, servicio_directo_id) = coalesce(f.orden_id, f.compra_directa_id, f.servicio_directo_id);
    if not found then
      raise exception using errcode = 'P0001', message = 'RET_ADJUNTO_SIN_ORIGEN: no se encontró el enlace del documento con su origen.';
    end if;
  end if;

  for l in select value from jsonb_array_elements(p_lineas) loop
    i := i + 1;
    t := upper(coalesce(l ->> 'tipo', ''));
    if t = 'REGIONAL' then t := 'ESTADAL'; end if;   -- equivalencia ESTADAL ↔ regional (D6)
    if t not in ('IVA', 'ISLR', 'MUNICIPAL', 'ESTADAL', 'IGTF') then
      raise exception using errcode = 'P0001', message = 'RET_LINEA_TIPO: línea ' || i || ': tipo no válido (' || coalesce(l ->> 'tipo', 'vacío') || ').';
    end if;
    m := coalesce(nullif(l ->> 'monto', '')::numeric, 0);
    if m < 0 then
      raise exception using errcode = 'P0001', message = 'RET_MONTO_NEGATIVO: línea ' || i || ': la retención no puede ser negativa.';
    end if;
    if m = 0 and coalesce(btrim(l ->> 'descripcion'), '') = '' then
      raise exception using errcode = 'P0001', message = 'RET_CERO_SIN_MOTIVO: línea ' || i || ': una retención en 0 debe llevar el motivo (por qué no se retiene).';
    end if;
    fl := coalesce(nullif(l ->> 'fecha', '')::date, current_date);
    insert into public.retenciones (
      tipo, documento_id, fecha, base, porcentaje, sustraendo, monto, moneda, tasa, base_bs, monto_bs,
      iva_alicuota, iva_monto, motivo, concepto_codigo, concepto, municipio, descripcion,
      comprobante_nro, comprobante_periodo, quincena, valor_ut, actor, actor_name, regla_id, foto)
    values (
      t, f.id, fl,
      coalesce(nullif(l ->> 'base', '')::numeric, 0),
      coalesce(nullif(l ->> 'porcentaje', '')::numeric, 0),
      nullif(l ->> 'sustraendo', '')::numeric,
      m,
      coalesce(nullif(l ->> 'moneda', ''), f.moneda),
      coalesce(nullif(l ->> 'tasa', '')::numeric, f.tasa),
      nullif(l ->> 'base_bs', '')::numeric,
      nullif(l ->> 'monto_bs', '')::numeric,
      nullif(l ->> 'iva_alicuota', '')::numeric,
      nullif(l ->> 'iva_monto', '')::numeric,
      nullif(btrim(l ->> 'motivo'), ''),
      nullif(l ->> 'concepto_codigo', ''),
      nullif(btrim(l ->> 'concepto'), ''),
      nullif(btrim(l ->> 'municipio'), ''),
      nullif(btrim(l ->> 'descripcion'), ''),
      nullif(btrim(l ->> 'comprobante_nro'), ''),
      -- El período sale de la FACTURA (p_factura.periodo, o su fecha), nunca de la fecha de emisión de la línea.
      coalesce(nullif(l ->> 'comprobante_periodo', ''), nullif(p_factura ->> 'periodo', ''), to_char(f.factura_fecha, 'YYYYMM')),
      coalesce(nullif(l ->> 'quincena', '')::smallint,
               case when extract(day from coalesce(f.factura_fecha, fl)) <= 15 then 1 else 2 end),
      nullif(l ->> 'valor_ut', '')::numeric,
      f.actor, f.actor_name,
      nullif(l ->> 'regla_id', '')::uuid,
      case when jsonb_typeof(l -> 'foto') = 'object' then l -> 'foto' end)
    returning * into r;
    salida := salida || jsonb_build_array(to_jsonb(r));
  end loop;

  return jsonb_build_object('factura', to_jsonb(f), 'lineas', salida);
end $$;
revoke execute on function public.retencion_factura_registrar(jsonb, jsonb) from public, anon;
grant execute on function public.retencion_factura_registrar(jsonb, jsonb) to authenticated, service_role;
comment on function public.retencion_factura_registrar(jsonb, jsonb) is
  'Registra una factura con sus líneas en una transacción (VF). Desde R7F copia regla_id y foto de cada línea, y enlaza el archivo de factura (p_factura.adjunto_id) con su origen.';


-- R10 · 14 · migración gt_retencion_factura_sola_y_limpieza, versión 20261020100014 (después de los 13 del 21/10)

-- ── Guarda: solo sigue si la base está justo antes de R10 (si no, se detiene sin escribir nada) ──


-- 1) Limpieza
drop index public.retencion_documentos_compra_fk_idx;
revoke execute on function public.retencion_agente_valido() from public, anon, authenticated;

-- 2) La única regla de líneas (la misma de VF + R7F)
create function public.retencion_lineas_insertar(p_doc public.retencion_documentos, p_lineas jsonb, p_periodo text,
                                                 p_actor text, p_actor_name text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r public.retenciones;
  l jsonb;
  salida jsonb := '[]'::jsonb;
  t text;
  m numeric;
  fl date;
  i int := 0;
begin
  for l in select value from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    i := i + 1;
    t := upper(coalesce(l ->> 'tipo', ''));
    if t = 'REGIONAL' then t := 'ESTADAL'; end if;   -- equivalencia ESTADAL ↔ regional (D6)
    if t not in ('IVA', 'ISLR', 'MUNICIPAL', 'ESTADAL', 'IGTF') then
      raise exception using errcode = 'P0001', message = 'RET_LINEA_TIPO: línea ' || i || ': tipo no válido (' || coalesce(l ->> 'tipo', 'vacío') || ').';
    end if;
    m := coalesce(nullif(l ->> 'monto', '')::numeric, 0);
    if m < 0 then
      raise exception using errcode = 'P0001', message = 'RET_MONTO_NEGATIVO: línea ' || i || ': la retención no puede ser negativa.';
    end if;
    if m = 0 and coalesce(btrim(l ->> 'descripcion'), '') = '' then
      raise exception using errcode = 'P0001', message = 'RET_CERO_SIN_MOTIVO: línea ' || i || ': una retención en 0 debe llevar el motivo (por qué no se retiene).';
    end if;
    fl := coalesce(nullif(l ->> 'fecha', '')::date, current_date);
    insert into public.retenciones (
      tipo, documento_id, fecha, fecha_entrega, base, porcentaje, sustraendo, monto, moneda, tasa, base_bs, monto_bs,
      iva_alicuota, iva_monto, impuesto_causado, monto_sin_derecho_credito_iva, motivo, concepto_codigo, concepto, municipio, descripcion,
      comprobante_nro, comprobante_periodo, quincena, valor_ut, actor, actor_name, regla_id, foto)
    values (
      t, p_doc.id, fl,
      nullif(l ->> 'fecha_entrega', '')::date,
      coalesce(nullif(l ->> 'base', '')::numeric, 0),
      coalesce(nullif(l ->> 'porcentaje', '')::numeric, 0),
      nullif(l ->> 'sustraendo', '')::numeric,
      m,
      coalesce(nullif(l ->> 'moneda', ''), p_doc.moneda),
      coalesce(nullif(l ->> 'tasa', '')::numeric, p_doc.tasa),
      nullif(l ->> 'base_bs', '')::numeric,
      nullif(l ->> 'monto_bs', '')::numeric,
      nullif(l ->> 'iva_alicuota', '')::numeric,
      nullif(l ->> 'iva_monto', '')::numeric,
      coalesce(nullif(l ->> 'impuesto_causado', '')::numeric, nullif(l ->> 'iva_monto', '')::numeric, 0),
      coalesce(nullif(l ->> 'monto_sin_derecho_credito_iva', '')::numeric, 0),
      nullif(btrim(l ->> 'motivo'), ''),
      nullif(l ->> 'concepto_codigo', ''),
      nullif(btrim(l ->> 'concepto'), ''),
      nullif(btrim(l ->> 'municipio'), ''),
      nullif(btrim(l ->> 'descripcion'), ''),
      nullif(btrim(l ->> 'comprobante_nro'), ''),
      -- El período sale de la FACTURA (el período pedido, o su fecha), nunca de la fecha de emisión de la línea.
      coalesce(nullif(l ->> 'comprobante_periodo', ''), nullif(p_periodo, ''), to_char(p_doc.factura_fecha, 'YYYYMM')),
      coalesce(nullif(l ->> 'quincena', '')::smallint,
               case when extract(day from coalesce(p_doc.factura_fecha, fl)) <= 15 then 1 else 2 end),
      nullif(l ->> 'valor_ut', '')::numeric,
      p_actor, p_actor_name,
      nullif(l ->> 'regla_id', '')::uuid,
      case when jsonb_typeof(l -> 'foto') = 'object' then l -> 'foto' end)
    returning * into r;
    salida := salida || jsonb_build_array(to_jsonb(r));
  end loop;
  return salida;
end $$;
revoke execute on function public.retencion_lineas_insertar(public.retencion_documentos, jsonb, text, text, text) from public, anon;
grant execute on function public.retencion_lineas_insertar(public.retencion_documentos, jsonb, text, text, text) to authenticated, service_role;
comment on function public.retencion_lineas_insertar(public.retencion_documentos, jsonb, text, text, text) is
  'Retenciones (R10): la única regla para insertar líneas de retención contra un documento fiscal. La usan retencion_factura_registrar y retencion_lineas_registrar.';

-- 3) Registrar factura: igual que R7F; con solo_documento = true acepta líneas vacías.
create or replace function public.retencion_factura_registrar(p_factura jsonb, p_lineas jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  f public.retencion_documentos;
  dk text := coalesce(nullif(p_factura ->> 'doc_kind', ''), 'manual');
  did uuid := nullif(p_factura ->> 'doc_id', '')::uuid;
  solo boolean := coalesce((p_factura ->> 'solo_documento')::boolean, false);
begin
  if jsonb_typeof(p_lineas) is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'RET_FACTURA_SIN_LINEAS: la factura necesita al menos una línea de impuesto.';
  end if;
  if jsonb_array_length(p_lineas) = 0 and not solo then
    raise exception using errcode = 'P0001',
      message = 'RET_FACTURA_SIN_LINEAS: la factura necesita al menos una línea de impuesto (o registrarla sola, con solo_documento).';
  end if;
  if coalesce(p_factura ->> 'rol', '') not in ('practicada', 'sufrida') then
    raise exception using errcode = 'P0001', message = 'RET_FACTURA_ROL: rol debe ser «practicada» o «sufrida».';
  end if;
  if coalesce(nullif(p_factura ->> 'tipo_documento', ''), 'factura') not in ('factura', 'nota_debito', 'nota_credito') then
    raise exception using errcode = 'P0001', message = 'RET_DOCUMENTO_TIPO: tipo_documento debe ser factura, nota_debito o nota_credito.';
  end if;
  if coalesce(nullif(p_factura ->> 'tipo_documento', ''), 'factura') <> 'factura'
     and nullif(btrim(p_factura ->> 'factura_afectada_nro'), '') is null then
    raise exception using errcode = 'P0001', message = 'RET_DOCUMENTO_AFECTADO: una nota de débito o de crédito lleva el N° de la factura que ajusta.';
  end if;
  if dk not in ('oc', 'compra_directa', 'servicio_directo', 'manual') then
    raise exception using errcode = 'P0001', message = 'RET_FACTURA_DOC: doc_kind debe ser oc, compra_directa, servicio_directo o manual.';
  end if;
  if dk <> 'manual' and did is null then
    raise exception using errcode = 'P0001', message = 'RET_FACTURA_DOC: falta doc_id para ' || dk || '.';
  end if;

  insert into public.retencion_documentos (
    rol, tipo_documento, documento_afectado_id, factura_afectada_nro,
    proveedor_id, rif, razon_social, sujeto, factura_nro, factura_control, factura_fecha, factura_total,
    exento, iva_alicuota, iva_monto, moneda, tasa, orden_id, compra_directa_id, servicio_directo_id,
    operacion, concepto, nota, actor, actor_name)
  values (
    p_factura ->> 'rol',
    coalesce(nullif(p_factura ->> 'tipo_documento', ''), 'factura'),
    nullif(p_factura ->> 'documento_afectado_id', '')::uuid,
    nullif(btrim(p_factura ->> 'factura_afectada_nro'), ''),
    nullif(p_factura ->> 'proveedor_id', '')::uuid,
    nullif(btrim(p_factura ->> 'rif'), ''),
    nullif(btrim(p_factura ->> 'razon_social'), ''),
    nullif(p_factura ->> 'sujeto', ''),
    nullif(btrim(p_factura ->> 'factura_nro'), ''),
    nullif(btrim(p_factura ->> 'factura_control'), ''),
    nullif(p_factura ->> 'factura_fecha', '')::date,
    nullif(p_factura ->> 'factura_total', '')::numeric,
    nullif(p_factura ->> 'exento', '')::numeric,
    nullif(p_factura ->> 'iva_alicuota', '')::numeric,
    nullif(p_factura ->> 'iva_monto', '')::numeric,
    coalesce(nullif(p_factura ->> 'moneda', ''), 'Bs'),
    nullif(p_factura ->> 'tasa', '')::numeric,
    case when dk = 'oc' then did end,
    case when dk = 'compra_directa' then did end,
    case when dk = 'servicio_directo' then did end,
    nullif(p_factura ->> 'operacion', ''),
    nullif(btrim(p_factura ->> 'concepto'), ''),
    nullif(btrim(p_factura ->> 'nota'), ''),
    coalesce(nullif(p_factura ->> 'actor', ''), auth.jwt() ->> 'email'),
    nullif(p_factura ->> 'actor_name', ''))
  returning * into f;

  -- (R7F) El archivo de factura del que salió (adjuntos_directos, P03) se enlaza en la misma transacción.
  if nullif(p_factura ->> 'adjunto_id', '') is not null then
    if num_nonnulls(f.orden_id, f.compra_directa_id, f.servicio_directo_id) = 0 then
      raise exception using errcode = 'P0001', message = 'RET_ADJUNTO_SIN_ORIGEN: un archivo de factura solo se enlaza a un documento de una OC, compra directa o servicio directo.';
    end if;
    update public.retencion_documento_origenes
       set adjunto_id = (p_factura ->> 'adjunto_id')::uuid
     where documento_id = f.id
       and coalesce(orden_id, compra_directa_id, servicio_directo_id) = coalesce(f.orden_id, f.compra_directa_id, f.servicio_directo_id);
    if not found then
      raise exception using errcode = 'P0001', message = 'RET_ADJUNTO_SIN_ORIGEN: no se encontró el enlace del documento con su origen.';
    end if;
  end if;

  return jsonb_build_object('factura', to_jsonb(f),
                            'lineas', public.retencion_lineas_insertar(f, p_lineas, p_factura ->> 'periodo', f.actor, f.actor_name));
end $$;
revoke execute on function public.retencion_factura_registrar(jsonb, jsonb) from public, anon;
grant execute on function public.retencion_factura_registrar(jsonb, jsonb) to authenticated, service_role;
comment on function public.retencion_factura_registrar(jsonb, jsonb) is
  'Registra una factura con sus líneas en una transacción (VF, R7F). Desde R10: con p_factura.solo_documento = true registra solo el documento, para retener después con retencion_lineas_registrar.';

-- 4) Retener DESPUÉS contra un documento ya registrado (misma regla de líneas)
create function public.retencion_lineas_registrar(p_documento_id uuid, p_lineas jsonb, p_periodo text default null, p_actor_name text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare f public.retencion_documentos;
begin
  if jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception using errcode = 'P0001', message = 'RET_FACTURA_SIN_LINEAS: hace falta al menos una línea de impuesto para retener.';
  end if;
  select * into f from public.retencion_documentos where id = p_documento_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'RET_DOCUMENTO_NO_EXISTE: esa factura no está registrada (o no la puede ver).';
  end if;
  return jsonb_build_object('factura', to_jsonb(f),
                            'lineas', public.retencion_lineas_insertar(f, p_lineas, p_periodo, auth.jwt() ->> 'email', nullif(btrim(p_actor_name), '')));
end $$;
revoke execute on function public.retencion_lineas_registrar(uuid, jsonb, text, text) from public, anon;
grant execute on function public.retencion_lineas_registrar(uuid, jsonb, text, text) to authenticated, service_role;
comment on function public.retencion_lineas_registrar(uuid, jsonb, text, text) is
  'Retenciones (R10): retener después contra una factura ya registrada, con la misma regla de líneas que retencion_factura_registrar.';

-- 5) ¿La empresa practica ese impuesto en esa fecha? (Master 21/10 11:09: los pendientes solo cuentan lo que se practica)
--    Mismo criterio que el front (puedePracticar) para IVA e IGTF, leído de las condiciones del agente de R1 a la fecha:
--      IVA  = agente de retención de IVA, o contribuyente especial;
--      IGTF = contribuyente especial, o agente de percepción de IGTF;
--      ISLR, MUNICIPAL, ESTADAL = SOLO si su condición «agente_retencion» está cargada y vigente (sin condición, no cuenta:
--      mejor un falso «no retenible» que llenar el buscador de ruido).
create function public.retencion_empresa_practica(p_impuesto text, p_fecha date default current_date)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select case upper(coalesce(p_impuesto, ''))
           when 'IVA'  then public.retencion_agente_condicion('IVA', 'agente_retencion', p_fecha)
                         or public.retencion_agente_condicion(null, 'contribuyente_especial', p_fecha)
           when 'IGTF' then public.retencion_agente_condicion(null, 'contribuyente_especial', p_fecha)
                         or public.retencion_agente_condicion('IGTF', 'agente_percepcion', p_fecha)
           when ''     then false
           else public.retencion_agente_condicion(upper(p_impuesto), 'agente_retencion', p_fecha)
         end
$$;
revoke execute on function public.retencion_empresa_practica(text, date) from public, anon;
grant execute on function public.retencion_empresa_practica(text, date) to authenticated, service_role;
comment on function public.retencion_empresa_practica(text, date) is
  'Retenciones (R10): si la empresa practica ese impuesto en esa fecha, según las condiciones del agente (R1). ISLR, ISAE y estadal cuentan solo con su condición cargada.';

-- 6) Facturas registradas y retenibles (buscador)
create view public.retencion_facturas_resumen with (security_invoker = true) as
select d.id as documento_id, d.rol, d.tipo_documento, d.factura_nro, d.factura_control, d.factura_fecha,
       d.factura_total, d.exento, d.iva_monto, d.moneda, d.tasa,
       d.proveedor_id, coalesce(d.rif, p.rif) as rif, coalesce(d.razon_social, p.razon_social) as razon_social,
       d.orden_id, d.compra_directa_id, d.servicio_directo_id, d.created_at,
       coalesce(ret.retenido, '{}'::jsonb) as retenido,
       coalesce(dec.decisiones, '{}'::jsonb) as decisiones,
       coalesce(pend.pendientes, '{}'::text[]) as pendientes,
       (d.rol = 'practicada' and cardinality(coalesce(pend.pendientes, '{}'::text[])) > 0) as retenible,
       lower(concat_ws(' ', d.factura_nro, d.factura_control, coalesce(d.rif, p.rif), coalesce(d.razon_social, p.razon_social))) as buscar
  from public.retencion_documentos d
  left join public.proveedores p on p.id = d.proveedor_id
  left join lateral (
    select jsonb_object_agg(x.tipo, jsonb_build_object('lineas', x.n, 'monto', x.monto, 'monto_bs', x.monto_bs, 'estados', x.estados)) as retenido
      from (select upper(r.tipo) as tipo, count(*) as n, sum(r.monto) as monto, sum(r.monto_bs) as monto_bs,
                   to_jsonb(array_agg(distinct r.estado)) as estados
              from public.retenciones r
             where r.documento_id = d.id and r.estado <> 'anulada'
             group by 1) x) ret on true
  left join lateral (
    select jsonb_object_agg(x.impuesto_clave, x.decision) as decisiones
      from public.retencion_decisiones x where x.documento_id = d.id) dec on true
  left join lateral (
    select array_agg(i.clave order by i.orden) as pendientes
      from public.retencion_impuestos i
     where i.activo and i.admite_practicada
       and public.retencion_empresa_practica(i.clave, coalesce(d.factura_fecha, d.created_at::date))
       and not exists (select 1 from public.retenciones r where r.documento_id = d.id and upper(r.tipo) = i.clave and r.estado <> 'anulada')
       and not exists (select 1 from public.retencion_decisiones x where x.documento_id = d.id and x.impuesto_clave = i.clave and x.decision = 'no_aplica')) pend on true;
comment on view public.retencion_facturas_resumen is
  'Retenciones (R10): cada documento fiscal con lo retenido por impuesto, sus decisiones, los impuestos pendientes y si es retenible (buscador del front).';
revoke all on public.retencion_facturas_resumen from anon;
grant select on public.retencion_facturas_resumen to authenticated;

-- 7) Textos sembrados que ve el usuario, en lenguaje claro (Master 21/10 11:19): sin siglas de paquetes, archivos ni jerga.
--    Solo las filas de nuestras cargas, identificadas por su clave Y su texto exacto de hoy: lo que el equipo ya haya
--    cambiado no se toca. Las reglas, solo si siguen «en prueba» (las vigentes no se editan). Va en un DO para que el
--    editor diga «Success»; el espejo de R4 se apaga mientras tanto (no reescribe retenciones_conceptos).
do $textos$
begin
  perform set_config('retenciones.r4_carga', 'si', true);

  update public.retencion_agente_condiciones
     set motivo = 'Carga inicial desde la configuración anterior (valor vigente al instalar). Falta confirmar la fecha real de la designación.'
   where impuesto_clave = 'IVA' and condicion = 'agente_retencion'
     and motivo = 'Carga inicial R1 desde Parámetros (valor vigente al aplicar). La fecha real de la designación la confirma el usuario.';
  update public.retencion_agente_condiciones
     set motivo = 'Carga inicial desde la configuración anterior (valor vigente al instalar). Falta confirmar la fecha real.'
   where impuesto_clave is null and condicion = 'contribuyente_especial'
     and motivo = 'Carga inicial R1 desde Parámetros (valor vigente al aplicar). La fecha real la confirma el usuario.';

  update public.retencion_entes set motivo = 'Carga inicial: ente del ISAE de Caroní.'
   where tipo = 'municipal' and nombre = 'Alcaldía del Municipio Caroní' and motivo = 'Semilla R1 (D3: ISAE de Caroní)';
  update public.retencion_entes set motivo = 'Carga inicial.'
   where tipo = 'nacional' and nombre = 'SENIAT' and motivo = 'Semilla R1';

  update public.retencion_impuesto_versiones
     set motivo = 'Valor inicial. Vale también para fechas anteriores. Falta confirmarlo.'
   where motivo = 'Valor de arranque (R2; antes V1). Vale también para fechas anteriores. A confirmar por el usuario.';
  update public.retencion_impuesto_versiones
     set fuente = 'Valores iniciales del sistema (14/10/2026)'
   where fuente = 'Valores de arranque de V1 (14/10)';

  update public.retencion_parametros set motivo = 'Carga inicial: valor por defecto.'
   where impuesto_clave is null and clave = 'aviso_licencia_dias' and motivo = 'Carga inicial R3: valor por defecto (Master, 16/10 15:16).';
  update public.retencion_parametros set motivo = 'Carga inicial: valor por defecto.'
   where impuesto_clave is null and clave = 'avisos_activos' and motivo = 'Carga inicial R3: valor por defecto.';
  update public.retencion_parametros set motivo = 'Carga inicial: UT vigente desde el 02/06/2025 (antes de esa fecha no hay UT cargada).'
   where impuesto_clave is null and clave = 'ut' and motivo = 'Carga inicial R3: UT vigente desde el 02/06/2025 (no retroactiva: antes no hay UT cargada).';
  update public.retencion_parametros
     set motivo = 'Carga inicial: valor que tenía Parámetros al instalar. Falta que el contador confirme desde cuándo rige.'
   where clave in ('alicuota', 'pct_retencion')
     and motivo = 'Carga inicial R3: valor de hoy en Parámetros. Fecha de inicio a confirmar por el contador.';
  update public.retencion_parametros
     set motivo = 'Carga inicial: el 100 % que se venía usando en los supuestos del art. 5. Falta que el contador confirme la fuente.'
   where impuesto_clave = 'IVA' and clave = 'pct_retencion_art5'
     and motivo = 'Carga inicial R3: el 100 % que hoy usa el código en los supuestos del art. 5. Fuente a confirmar por el contador.';

  update public.retencion_clasificacion_valores
     set motivo = 'Carga inicial desde la lista anterior de conceptos de ISLR. Falta que el contador confirme desde cuándo rige.'
   where motivo = 'Carga inicial R4 desde retenciones_conceptos. Fecha de inicio a confirmar por el contador.';
  update public.retencion_clasificacion_valores set nota = 'Tarifa N° 2: faltan sus tramos.'
   where nota = 'Tarifa N° 2 pendiente (R5).';
  update public.retencion_clasificacion_valores
     set nota = 'Mínimo y sustraendo: 83,3334 UT, los que se venían usando. Falta cotejarlos con el contador.'
   where nota = 'Mínimo y sustraendo: los 83,3334 UT que hoy usa el código; cotejar con el contador.';

  update public.retencion_reglas
     set motivo = 'Regla inicial: reproduce el cálculo actual. En prueba hasta compararla con el simulador.'
   where estado = 'en_prueba'
     and motivo = 'Arranque R7: lo que hoy hace el código (retencionesCalculo.ts). En prueba hasta compararla con el simulador.';

  perform set_config('retenciones.r4_carga', '', true);
end $textos$;

-- ── Registro de esta migración, con su SQL completo (mismo bloque: si algo de arriba falla, no queda) ──

revoke execute on function public.retencion_agente_valido() from public, anon, authenticated;

-- 2) La única regla de líneas (la misma de VF + R7F)
create function public.retencion_lineas_insertar(p_doc public.retencion_documentos, p_lineas jsonb, p_periodo text,
                                                 p_actor text, p_actor_name text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r public.retenciones;
  l jsonb;
  salida jsonb := '[]'::jsonb;
  t text;
  m numeric;
  fl date;
  i int := 0;
begin
  for l in select value from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    i := i + 1;
    t := upper(coalesce(l ->> 'tipo', ''));
    if t = 'REGIONAL' then t := 'ESTADAL'; end if;   -- equivalencia ESTADAL ↔ regional (D6)
    if t not in ('IVA', 'ISLR', 'MUNICIPAL', 'ESTADAL', 'IGTF') then
      raise exception using errcode = 'P0001', message = 'RET_LINEA_TIPO: línea ' || i || ': tipo no válido (' || coalesce(l ->> 'tipo', 'vacío') || ').';
    end if;
    m := coalesce(nullif(l ->> 'monto', '')::numeric, 0);
    if m < 0 then
      raise exception using errcode = 'P0001', message = 'RET_MONTO_NEGATIVO: línea ' || i || ': la retención no puede ser negativa.';
    end if;
    if m = 0 and coalesce(btrim(l ->> 'descripcion'), '') = '' then
      raise exception using errcode = 'P0001', message = 'RET_CERO_SIN_MOTIVO: línea ' || i || ': una retención en 0 debe llevar el motivo (por qué no se retiene).';
    end if;
    fl := coalesce(nullif(l ->> 'fecha', '')::date, current_date);
    insert into public.retenciones (
      tipo, documento_id, fecha, fecha_entrega, base, porcentaje, sustraendo, monto, moneda, tasa, base_bs, monto_bs,
      iva_alicuota, iva_monto, impuesto_causado, monto_sin_derecho_credito_iva, motivo, concepto_codigo, concepto, municipio, descripcion,
      comprobante_nro, comprobante_periodo, quincena, valor_ut, actor, actor_name, regla_id, foto)
    values (
      t, p_doc.id, fl,
      nullif(l ->> 'fecha_entrega', '')::date,
      coalesce(nullif(l ->> 'base', '')::numeric, 0),
      coalesce(nullif(l ->> 'porcentaje', '')::numeric, 0),
      nullif(l ->> 'sustraendo', '')::numeric,
      m,
      coalesce(nullif(l ->> 'moneda', ''), p_doc.moneda),
      coalesce(nullif(l ->> 'tasa', '')::numeric, p_doc.tasa),
      nullif(l ->> 'base_bs', '')::numeric,
      nullif(l ->> 'monto_bs', '')::numeric,
      nullif(l ->> 'iva_alicuota', '')::numeric,
      nullif(l ->> 'iva_monto', '')::numeric,
      coalesce(nullif(l ->> 'impuesto_causado', '')::numeric, nullif(l ->> 'iva_monto', '')::numeric, 0),
      coalesce(nullif(l ->> 'monto_sin_derecho_credito_iva', '')::numeric, 0),
      nullif(btrim(l ->> 'motivo'), ''),
      nullif(l ->> 'concepto_codigo', ''),
      nullif(btrim(l ->> 'concepto'), ''),
      nullif(btrim(l ->> 'municipio'), ''),
      nullif(btrim(l ->> 'descripcion'), ''),
      nullif(btrim(l ->> 'comprobante_nro'), ''),
      -- El período sale de la FACTURA (el período pedido, o su fecha), nunca de la fecha de emisión de la línea.
      coalesce(nullif(l ->> 'comprobante_periodo', ''), nullif(p_periodo, ''), to_char(p_doc.factura_fecha, 'YYYYMM')),
      coalesce(nullif(l ->> 'quincena', '')::smallint,
               case when extract(day from coalesce(p_doc.factura_fecha, fl)) <= 15 then 1 else 2 end),
      nullif(l ->> 'valor_ut', '')::numeric,
      p_actor, p_actor_name,
      nullif(l ->> 'regla_id', '')::uuid,
      case when jsonb_typeof(l -> 'foto') = 'object' then l -> 'foto' end)
    returning * into r;
    salida := salida || jsonb_build_array(to_jsonb(r));
  end loop;
  return salida;
end $$;
revoke execute on function public.retencion_lineas_insertar(public.retencion_documentos, jsonb, text, text, text) from public, anon;
grant execute on function public.retencion_lineas_insertar(public.retencion_documentos, jsonb, text, text, text) to authenticated, service_role;
comment on function public.retencion_lineas_insertar(public.retencion_documentos, jsonb, text, text, text) is
  'Retenciones (R10): la única regla para insertar líneas de retención contra un documento fiscal. La usan retencion_factura_registrar y retencion_lineas_registrar.';

-- 3) Registrar factura: igual que R7F; con solo_documento = true acepta líneas vacías.
create or replace function public.retencion_factura_registrar(p_factura jsonb, p_lineas jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  f public.retencion_documentos;
  dk text := coalesce(nullif(p_factura ->> 'doc_kind', ''), 'manual');
  did uuid := nullif(p_factura ->> 'doc_id', '')::uuid;
  solo boolean := coalesce((p_factura ->> 'solo_documento')::boolean, false);
begin
  if jsonb_typeof(p_lineas) is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'RET_FACTURA_SIN_LINEAS: la factura necesita al menos una línea de impuesto.';
  end if;
  if jsonb_array_length(p_lineas) = 0 and not solo then
    raise exception using errcode = 'P0001',
      message = 'RET_FACTURA_SIN_LINEAS: la factura necesita al menos una línea de impuesto (o registrarla sola, con solo_documento).';
  end if;
  if coalesce(p_factura ->> 'rol', '') not in ('practicada', 'sufrida') then
    raise exception using errcode = 'P0001', message = 'RET_FACTURA_ROL: rol debe ser «practicada» o «sufrida».';
  end if;
  if coalesce(nullif(p_factura ->> 'tipo_documento', ''), 'factura') not in ('factura', 'nota_debito', 'nota_credito') then
    raise exception using errcode = 'P0001', message = 'RET_DOCUMENTO_TIPO: tipo_documento debe ser factura, nota_debito o nota_credito.';
  end if;
  if coalesce(nullif(p_factura ->> 'tipo_documento', ''), 'factura') <> 'factura'
     and nullif(btrim(p_factura ->> 'factura_afectada_nro'), '') is null then
    raise exception using errcode = 'P0001', message = 'RET_DOCUMENTO_AFECTADO: una nota de débito o de crédito lleva el N° de la factura que ajusta.';
  end if;
  if dk not in ('oc', 'compra_directa', 'servicio_directo', 'manual') then
    raise exception using errcode = 'P0001', message = 'RET_FACTURA_DOC: doc_kind debe ser oc, compra_directa, servicio_directo o manual.';
  end if;
  if dk <> 'manual' and did is null then
    raise exception using errcode = 'P0001', message = 'RET_FACTURA_DOC: falta doc_id para ' || dk || '.';
  end if;

  insert into public.retencion_documentos (
    rol, tipo_documento, documento_afectado_id, factura_afectada_nro,
    proveedor_id, rif, razon_social, sujeto, factura_nro, factura_control, factura_fecha, factura_total,
    exento, iva_alicuota, iva_monto, moneda, tasa, orden_id, compra_directa_id, servicio_directo_id,
    operacion, concepto, nota, actor, actor_name)
  values (
    p_factura ->> 'rol',
    coalesce(nullif(p_factura ->> 'tipo_documento', ''), 'factura'),
    nullif(p_factura ->> 'documento_afectado_id', '')::uuid,
    nullif(btrim(p_factura ->> 'factura_afectada_nro'), ''),
    nullif(p_factura ->> 'proveedor_id', '')::uuid,
    nullif(btrim(p_factura ->> 'rif'), ''),
    nullif(btrim(p_factura ->> 'razon_social'), ''),
    nullif(p_factura ->> 'sujeto', ''),
    nullif(btrim(p_factura ->> 'factura_nro'), ''),
    nullif(btrim(p_factura ->> 'factura_control'), ''),
    nullif(p_factura ->> 'factura_fecha', '')::date,
    nullif(p_factura ->> 'factura_total', '')::numeric,
    nullif(p_factura ->> 'exento', '')::numeric,
    nullif(p_factura ->> 'iva_alicuota', '')::numeric,
    nullif(p_factura ->> 'iva_monto', '')::numeric,
    coalesce(nullif(p_factura ->> 'moneda', ''), 'Bs'),
    nullif(p_factura ->> 'tasa', '')::numeric,
    case when dk = 'oc' then did end,
    case when dk = 'compra_directa' then did end,
    case when dk = 'servicio_directo' then did end,
    nullif(p_factura ->> 'operacion', ''),
    nullif(btrim(p_factura ->> 'concepto'), ''),
    nullif(btrim(p_factura ->> 'nota'), ''),
    coalesce(nullif(p_factura ->> 'actor', ''), auth.jwt() ->> 'email'),
    nullif(p_factura ->> 'actor_name', ''))
  returning * into f;

  -- (R7F) El archivo de factura del que salió (adjuntos_directos, P03) se enlaza en la misma transacción.
  if nullif(p_factura ->> 'adjunto_id', '') is not null then
    if num_nonnulls(f.orden_id, f.compra_directa_id, f.servicio_directo_id) = 0 then
      raise exception using errcode = 'P0001', message = 'RET_ADJUNTO_SIN_ORIGEN: un archivo de factura solo se enlaza a un documento de una OC, compra directa o servicio directo.';
    end if;
    update public.retencion_documento_origenes
       set adjunto_id = (p_factura ->> 'adjunto_id')::uuid
     where documento_id = f.id
       and coalesce(orden_id, compra_directa_id, servicio_directo_id) = coalesce(f.orden_id, f.compra_directa_id, f.servicio_directo_id);
    if not found then
      raise exception using errcode = 'P0001', message = 'RET_ADJUNTO_SIN_ORIGEN: no se encontró el enlace del documento con su origen.';
    end if;
  end if;

  return jsonb_build_object('factura', to_jsonb(f),
                            'lineas', public.retencion_lineas_insertar(f, p_lineas, p_factura ->> 'periodo', f.actor, f.actor_name));
end $$;
revoke execute on function public.retencion_factura_registrar(jsonb, jsonb) from public, anon;
grant execute on function public.retencion_factura_registrar(jsonb, jsonb) to authenticated, service_role;
comment on function public.retencion_factura_registrar(jsonb, jsonb) is
  'Registra una factura con sus líneas en una transacción (VF, R7F). Desde R10: con p_factura.solo_documento = true registra solo el documento, para retener después con retencion_lineas_registrar.';

-- 4) Retener DESPUÉS contra un documento ya registrado (misma regla de líneas)
create function public.retencion_lineas_registrar(p_documento_id uuid, p_lineas jsonb, p_periodo text default null, p_actor_name text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare f public.retencion_documentos;
begin
  if jsonb_typeof(p_lineas) is distinct from 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception using errcode = 'P0001', message = 'RET_FACTURA_SIN_LINEAS: hace falta al menos una línea de impuesto para retener.';
  end if;
  select * into f from public.retencion_documentos where id = p_documento_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'RET_DOCUMENTO_NO_EXISTE: esa factura no está registrada (o no la puede ver).';
  end if;
  return jsonb_build_object('factura', to_jsonb(f),
                            'lineas', public.retencion_lineas_insertar(f, p_lineas, p_periodo, auth.jwt() ->> 'email', nullif(btrim(p_actor_name), '')));
end $$;
revoke execute on function public.retencion_lineas_registrar(uuid, jsonb, text, text) from public, anon;
grant execute on function public.retencion_lineas_registrar(uuid, jsonb, text, text) to authenticated, service_role;
comment on function public.retencion_lineas_registrar(uuid, jsonb, text, text) is
  'Retenciones (R10): retener después contra una factura ya registrada, con la misma regla de líneas que retencion_factura_registrar.';

-- 5) ¿La empresa practica ese impuesto en esa fecha? (Master 21/10 11:09: los pendientes solo cuentan lo que se practica)
--    Mismo criterio que el front (puedePracticar) para IVA e IGTF, leído de las condiciones del agente de R1 a la fecha:
--      IVA  = agente de retención de IVA, o contribuyente especial;
--      IGTF = contribuyente especial, o agente de percepción de IGTF;
--      ISLR, MUNICIPAL, ESTADAL = SOLO si su condición «agente_retencion» está cargada y vigente (sin condición, no cuenta:
--      mejor un falso «no retenible» que llenar el buscador de ruido).
create function public.retencion_empresa_practica(p_impuesto text, p_fecha date default current_date)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select case upper(coalesce(p_impuesto, ''))
           when 'IVA'  then public.retencion_agente_condicion('IVA', 'agente_retencion', p_fecha)
                         or public.retencion_agente_condicion(null, 'contribuyente_especial', p_fecha)
           when 'IGTF' then public.retencion_agente_condicion(null, 'contribuyente_especial', p_fecha)
                         or public.retencion_agente_condicion('IGTF', 'agente_percepcion', p_fecha)
           when ''     then false
           else public.retencion_agente_condicion(upper(p_impuesto), 'agente_retencion', p_fecha)
         end
$$;
revoke execute on function public.retencion_empresa_practica(text, date) from public, anon;
grant execute on function public.retencion_empresa_practica(text, date) to authenticated, service_role;
comment on function public.retencion_empresa_practica(text, date) is
  'Retenciones (R10): si la empresa practica ese impuesto en esa fecha, según las condiciones del agente (R1). ISLR, ISAE y estadal cuentan solo con su condición cargada.';

-- 6) Facturas registradas y retenibles (buscador)
create view public.retencion_facturas_resumen with (security_invoker = true) as
select d.id as documento_id, d.rol, d.tipo_documento, d.factura_nro, d.factura_control, d.factura_fecha,
       d.factura_total, d.exento, d.iva_monto, d.moneda, d.tasa,
       d.proveedor_id, coalesce(d.rif, p.rif) as rif, coalesce(d.razon_social, p.razon_social) as razon_social,
       d.orden_id, d.compra_directa_id, d.servicio_directo_id, d.created_at,
       coalesce(ret.retenido, '{}'::jsonb) as retenido,
       coalesce(dec.decisiones, '{}'::jsonb) as decisiones,
       coalesce(pend.pendientes, '{}'::text[]) as pendientes,
       (d.rol = 'practicada' and cardinality(coalesce(pend.pendientes, '{}'::text[])) > 0) as retenible,
       lower(concat_ws(' ', d.factura_nro, d.factura_control, coalesce(d.rif, p.rif), coalesce(d.razon_social, p.razon_social))) as buscar
  from public.retencion_documentos d
  left join public.proveedores p on p.id = d.proveedor_id
  left join lateral (
    select jsonb_object_agg(x.tipo, jsonb_build_object('lineas', x.n, 'monto', x.monto, 'monto_bs', x.monto_bs, 'estados', x.estados)) as retenido
      from (select upper(r.tipo) as tipo, count(*) as n, sum(r.monto) as monto, sum(r.monto_bs) as monto_bs,
                   to_jsonb(array_agg(distinct r.estado)) as estados
              from public.retenciones r
             where r.documento_id = d.id and r.estado <> 'anulada'
             group by 1) x) ret on true
  left join lateral (
    select jsonb_object_agg(x.impuesto_clave, x.decision) as decisiones
      from public.retencion_decisiones x where x.documento_id = d.id) dec on true
  left join lateral (
    select array_agg(i.clave order by i.orden) as pendientes
      from public.retencion_impuestos i
     where i.activo and i.admite_practicada
       and public.retencion_empresa_practica(i.clave, coalesce(d.factura_fecha, d.created_at::date))
       and not exists (select 1 from public.retenciones r where r.documento_id = d.id and upper(r.tipo) = i.clave and r.estado <> 'anulada')
       and not exists (select 1 from public.retencion_decisiones x where x.documento_id = d.id and x.impuesto_clave = i.clave and x.decision = 'no_aplica')) pend on true;
comment on view public.retencion_facturas_resumen is
  'Retenciones (R10): cada documento fiscal con lo retenido por impuesto, sus decisiones, los impuestos pendientes y si es retenible (buscador del front).';
revoke all on public.retencion_facturas_resumen from anon;
grant select on public.retencion_facturas_resumen to authenticated;

-- 7) Textos sembrados que ve el usuario, en lenguaje claro (Master 21/10 11:19): sin siglas de paquetes, archivos ni jerga.
--    Solo las filas de nuestras cargas, identificadas por su clave Y su texto exacto de hoy: lo que el equipo ya haya
--    cambiado no se toca. Las reglas, solo si siguen «en prueba» (las vigentes no se editan). Va en un DO para que el
--    editor diga «Success»; el espejo de R4 se apaga mientras tanto (no reescribe retenciones_conceptos).
do $textos$
begin
  perform set_config('retenciones.r4_carga', 'si', true);

  update public.retencion_agente_condiciones
     set motivo = 'Carga inicial desde la configuración anterior (valor vigente al instalar). Falta confirmar la fecha real de la designación.'
   where impuesto_clave = 'IVA' and condicion = 'agente_retencion'
     and motivo = 'Carga inicial R1 desde Parámetros (valor vigente al aplicar). La fecha real de la designación la confirma el usuario.';
  update public.retencion_agente_condiciones
     set motivo = 'Carga inicial desde la configuración anterior (valor vigente al instalar). Falta confirmar la fecha real.'
   where impuesto_clave is null and condicion = 'contribuyente_especial'
     and motivo = 'Carga inicial R1 desde Parámetros (valor vigente al aplicar). La fecha real la confirma el usuario.';

  update public.retencion_entes set motivo = 'Carga inicial: ente del ISAE de Caroní.'
   where tipo = 'municipal' and nombre = 'Alcaldía del Municipio Caroní' and motivo = 'Semilla R1 (D3: ISAE de Caroní)';
  update public.retencion_entes set motivo = 'Carga inicial.'
   where tipo = 'nacional' and nombre = 'SENIAT' and motivo = 'Semilla R1';

  update public.retencion_impuesto_versiones
     set motivo = 'Valor inicial. Vale también para fechas anteriores. Falta confirmarlo.'
   where motivo = 'Valor de arranque (R2; antes V1). Vale también para fechas anteriores. A confirmar por el usuario.';
  update public.retencion_impuesto_versiones
     set fuente = 'Valores iniciales del sistema (14/10/2026)'
   where fuente = 'Valores de arranque de V1 (14/10)';

  update public.retencion_parametros set motivo = 'Carga inicial: valor por defecto.'
   where impuesto_clave is null and clave = 'aviso_licencia_dias' and motivo = 'Carga inicial R3: valor por defecto (Master, 16/10 15:16).';
  update public.retencion_parametros set motivo = 'Carga inicial: valor por defecto.'
   where impuesto_clave is null and clave = 'avisos_activos' and motivo = 'Carga inicial R3: valor por defecto.';
  update public.retencion_parametros set motivo = 'Carga inicial: UT vigente desde el 02/06/2025 (antes de esa fecha no hay UT cargada).'
   where impuesto_clave is null and clave = 'ut' and motivo = 'Carga inicial R3: UT vigente desde el 02/06/2025 (no retroactiva: antes no hay UT cargada).';
  update public.retencion_parametros
     set motivo = 'Carga inicial: valor que tenía Parámetros al instalar. Falta que el contador confirme desde cuándo rige.'
   where clave in ('alicuota', 'pct_retencion')
     and motivo = 'Carga inicial R3: valor de hoy en Parámetros. Fecha de inicio a confirmar por el contador.';
  update public.retencion_parametros
     set motivo = 'Carga inicial: el 100 % que se venía usando en los supuestos del art. 5. Falta que el contador confirme la fuente.'
   where impuesto_clave = 'IVA' and clave = 'pct_retencion_art5'
     and motivo = 'Carga inicial R3: el 100 % que hoy usa el código en los supuestos del art. 5. Fuente a confirmar por el contador.';

  update public.retencion_clasificacion_valores
     set motivo = 'Carga inicial desde la lista anterior de conceptos de ISLR. Falta que el contador confirme desde cuándo rige.'
   where motivo = 'Carga inicial R4 desde retenciones_conceptos. Fecha de inicio a confirmar por el contador.';
  update public.retencion_clasificacion_valores set nota = 'Tarifa N° 2: faltan sus tramos.'
   where nota = 'Tarifa N° 2 pendiente (R5).';
  update public.retencion_clasificacion_valores
     set nota = 'Mínimo y sustraendo: 83,3334 UT, los que se venían usando. Falta cotejarlos con el contador.'
   where nota = 'Mínimo y sustraendo: los 83,3334 UT que hoy usa el código; cotejar con el contador.';

  update public.retencion_reglas
     set motivo = 'Regla inicial: reproduce el cálculo actual. En prueba hasta compararla con el simulador.'
   where estado = 'en_prueba'
     and motivo = 'Arranque R7: lo que hoy hace el código (retencionesCalculo.ts). En prueba hasta compararla con el simulador.';

  perform set_config('retenciones.r4_carga', '', true);
end $textos$;


-- R11 · 15 · migración gt_retencion_buzon_facturas_externas, versión 20261029100015 (después de los 14 de Retenciones)

-- ── Guarda: solo sigue si los 14 de Retenciones están y R11 no (si no, se detiene sin escribir nada) ──


-- 1) Las formas
create function public.retencion_rif_valido(p_rif text)
returns boolean language sql immutable set search_path = public as $$
  select p_rif is not null and upper(regexp_replace(p_rif, '[^A-Za-z0-9]', '', 'g')) ~ '^[VEJPG][0-9]{9}$'
$$;

create function public.retencion_buzon_adjuntos_validos(p_adjuntos jsonb, p_factura_id text)
returns boolean language sql immutable set search_path = public as $$
  select jsonb_typeof(p_adjuntos) = 'array'
     and jsonb_array_length(p_adjuntos) <= 6
     and not exists (
           select 1 from jsonb_array_elements(p_adjuntos) a
            where jsonb_typeof(a) <> 'object'
               or coalesce(a ->> 'tipo', '') not in ('imagen', 'pdf')
               or left(coalesce(a ->> 'path', ''), length(p_factura_id) + 1) <> p_factura_id || '/'
               or length(coalesce(a ->> 'path', '')) <= length(p_factura_id) + 1
               or length(a ->> 'path') > 300
               or position('..' in a ->> 'path') > 0
               or (a ? 'tamanoBytes' and (jsonb_typeof(a -> 'tamanoBytes') <> 'number'
                                          or (a ->> 'tamanoBytes')::numeric not between 0 and 12582912)))
     and (select count(*) from jsonb_array_elements(p_adjuntos) a where a ->> 'tipo' = 'imagen') <= 4
     and (select count(*) from jsonb_array_elements(p_adjuntos) a where a ->> 'tipo' = 'pdf') <= 2
$$;

revoke execute on function public.retencion_rif_valido(text) from public, anon;
revoke execute on function public.retencion_buzon_adjuntos_validos(jsonb, text) from public, anon;
grant execute on function public.retencion_rif_valido(text) to authenticated, service_role;
grant execute on function public.retencion_buzon_adjuntos_validos(jsonb, text) to authenticated, service_role;

-- 2) Empresas receptoras
create table public.retencion_empresas_receptoras (
  id                         text primary key,
  clave                      text not null unique,
  nombre                     text not null,
  nombre_corto               text,
  rif                        text not null,
  color_badge                text not null default '#64748b',
  activo                     boolean not null default true,
  orden                      int not null default 10,
  email                      text,
  telefono                   text,
  direccion_fiscal           text,
  municipio                  text,
  estado                     text,
  licencia_municipal         text,
  es_agente_iva              boolean not null default true,
  es_contribuyente_especial  boolean not null default false,
  retiene_islr               boolean not null default true,
  retiene_municipal          boolean not null default false,
  pct_iva_general            numeric(5,2) not null default 75,
  imprimir_original_y_copia  boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  actualizado_por            text,
  constraint retencion_empresas_receptoras_id_forma check (id ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  constraint retencion_empresas_receptoras_clave_forma check (clave ~ '^[a-z0-9_-]{1,64}$'),
  constraint retencion_empresas_receptoras_nombre_largo check (length(btrim(nombre)) between 1 and 200),
  constraint retencion_empresas_receptoras_nombre_corto_largo check (nombre_corto is null or length(btrim(nombre_corto)) between 1 and 60),
  constraint retencion_empresas_receptoras_rif_forma check (rif = 'S/RIF' or public.retencion_rif_valido(rif)),
  constraint retencion_empresas_receptoras_color_forma check (color_badge ~ '^#[0-9A-Fa-f]{6}$'),
  constraint retencion_empresas_receptoras_orden_rango check (orden between 0 and 9999),
  constraint retencion_empresas_receptoras_email_forma check (email is null or (length(email) <= 200 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  constraint retencion_empresas_receptoras_textos_largo check (
    coalesce(length(telefono), 0) <= 40 and coalesce(length(direccion_fiscal), 0) <= 500
    and coalesce(length(municipio), 0) <= 100 and coalesce(length(estado), 0) <= 100
    and coalesce(length(licencia_municipal), 0) <= 60 and coalesce(length(actualizado_por), 0) <= 200),
  constraint retencion_empresas_receptoras_pct_iva_rango check (pct_iva_general between 0 and 100)
);

-- 3) Buzón de facturas externas
create table public.retencion_facturas_externas (
  id                text primary key,
  empresa_id        text not null references public.retencion_empresas_receptoras (id) on delete restrict,
  empresa_nombre    text not null,
  proveedor_nombre  text not null,
  proveedor_rif     text not null,
  factura_numero    text not null,
  factura_control   text,
  factura_fecha     date not null,
  monto_total       numeric(14,2) not null,
  moneda            text not null default 'Bs',
  tasa              numeric(12,4),
  monto_bs          numeric(14,2) not null default 0,
  monto_usd         numeric(14,2),
  descripcion       text not null,
  observaciones     text,
  estatus           text not null default 'recibida',
  adjuntos          jsonb not null default '[]'::jsonb,
  created_by        text,
  created_by_name   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  actualizado_por   text,
  constraint retencion_facturas_externas_id_forma check (id ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  constraint retencion_facturas_externas_moneda_lista check (moneda in ('Bs', 'USD')),
  constraint retencion_facturas_externas_estatus_lista check (estatus in ('recibida', 'en_revision', 'retenida', 'descartada')),
  constraint retencion_facturas_externas_montos_rango check (monto_total >= 0 and monto_bs >= 0 and (monto_usd is null or monto_usd >= 0)),
  constraint retencion_facturas_externas_monto_moneda check ((moneda <> 'Bs' or monto_bs = monto_total) and (moneda <> 'USD' or monto_usd = monto_total)),
  constraint retencion_facturas_externas_tasa_rango check (tasa is null or tasa > 0),
  constraint retencion_facturas_externas_fecha_rango check (factura_fecha between date '2000-01-01' and date '2100-12-31'),
  constraint retencion_facturas_externas_rif_forma check (proveedor_rif = 'S/RIF' or public.retencion_rif_valido(proveedor_rif)),
  constraint retencion_facturas_externas_textos_largo check (
    length(btrim(empresa_nombre)) between 1 and 200 and length(btrim(proveedor_nombre)) between 1 and 200
    and length(btrim(factura_numero)) between 1 and 40 and (factura_control is null or length(btrim(factura_control)) between 1 and 40)
    and length(btrim(descripcion)) between 1 and 1000 and coalesce(length(observaciones), 0) <= 2000
    and coalesce(length(created_by), 0) <= 200 and coalesce(length(created_by_name), 0) <= 200
    and coalesce(length(actualizado_por), 0) <= 200),
  constraint retencion_facturas_externas_adjuntos_tope check (public.retencion_buzon_adjuntos_validos(adjuntos, id))
);

create index retencion_facturas_externas_empresa_idx on public.retencion_facturas_externas (empresa_id);
create index retencion_facturas_externas_estatus_idx on public.retencion_facturas_externas (estatus);
create index retencion_facturas_externas_fecha_idx on public.retencion_facturas_externas (factura_fecha desc);
create index retencion_facturas_externas_creada_idx on public.retencion_facturas_externas (created_at desc);

-- Lo que pone la base (no el teléfono): autor, fechas y la foto del nombre de la empresa
create function public.retencion_buzon_tocar()
returns trigger language plpgsql security invoker set search_path = public as $$
declare quien text := coalesce(nullif(auth.jwt() ->> 'email', ''), current_user); nombre_empresa text; nombre_actor text;
begin
  new.updated_at := now();
  new.actualizado_por := quien;
  if tg_op = 'INSERT' then
    new.created_at := now();
    if tg_table_name = 'retencion_facturas_externas' then
      if new.estatus <> 'recibida' then
        raise exception using errcode = 'P0001', message = 'RET_BUZON_ESTATUS: una factura nueva entra como «recibida».';
      end if;
      new.created_by := quien;
      -- el nombre a mostrar lo pone la base, no el cliente: el del usuario de la sesión (nombre + apellido)
      select nullif(btrim(concat_ws(' ', u.nombre, u.apellido)), '') into nombre_actor from public.usuarios u where u.id = auth.uid();
      new.created_by_name := nombre_actor;  -- nulo si no se encuentra: el correo en created_by basta de respaldo
      -- la foto del nombre; si la sesión no ve la empresa, deciden la RLS y la clave foránea
      select e.nombre into nombre_empresa from public.retencion_empresas_receptoras e where e.id = new.empresa_id;
      if found then new.empresa_nombre := nombre_empresa; end if;
    end if;
  else
    if new.id <> old.id then
      raise exception using errcode = 'P0001', message = 'RET_BUZON_ID: el identificador no se cambia.';
    end if;
    new.created_at := old.created_at;
    if tg_table_name = 'retencion_facturas_externas' then
      new.created_by := old.created_by;
      new.created_by_name := old.created_by_name;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.retencion_buzon_tocar() from public, anon, authenticated;

create trigger trg_retencion_empresas_receptoras_tocar before insert or update on public.retencion_empresas_receptoras
  for each row execute function public.retencion_buzon_tocar();
create trigger trg_retencion_facturas_externas_tocar before insert or update on public.retencion_facturas_externas
  for each row execute function public.retencion_buzon_tocar();

-- Semilla: GT y MTO, tal como están en rrhh_empresas (los datos que el sistema ya imprime)
insert into public.retencion_empresas_receptoras (id, clave, nombre, nombre_corto, rif, color_badge, orden, municipio, estado)
select v.id, v.clave, r.nombre, v.corto, r.rif, v.color, v.orden, v.municipio, 'Bolívar'
  from (values ('empresa-mits', 'mits', 'GT',  'Minería Internacional TS, C.A.', '#eab308', 1, 'Caroní'),
               ('empresa-mto',          'mto',          'MTO', 'MTO',          '#d97706', 2, null)) v(id, clave, rrhh, corto, color, orden, municipio)
  join public.rrhh_empresas r on r.clave = v.rrhh;

-- 4) Permisos y RLS
revoke all on public.retencion_empresas_receptoras from public, anon;
revoke all on public.retencion_facturas_externas from public, anon;
grant select, insert, update, delete on public.retencion_empresas_receptoras to authenticated;
grant select, insert, update, delete on public.retencion_facturas_externas to authenticated;
grant all on public.retencion_empresas_receptoras to service_role;
grant all on public.retencion_facturas_externas to service_role;

alter table public.retencion_empresas_receptoras enable row level security;
alter table public.retencion_facturas_externas enable row level security;

create policy retencion_empresas_receptoras_read on public.retencion_empresas_receptoras for select to authenticated
  using ((select public.puede_leer('retenciones')));
create policy retencion_empresas_receptoras_insert on public.retencion_empresas_receptoras for insert to authenticated
  with check ((select public.is_admin()) or (select public.puede('retenciones')));
create policy retencion_empresas_receptoras_update on public.retencion_empresas_receptoras for update to authenticated
  using ((select public.is_admin()) or (select public.puede('retenciones')))
  with check ((select public.is_admin()) or (select public.puede('retenciones')));
create policy retencion_empresas_receptoras_delete on public.retencion_empresas_receptoras for delete to authenticated
  using ((select public.is_admin()) or (select public.puede('retenciones')));

create policy retencion_facturas_externas_read on public.retencion_facturas_externas for select to authenticated
  using ((select public.puede_leer('retenciones')));
create policy retencion_facturas_externas_insert on public.retencion_facturas_externas for insert to authenticated
  with check ((select public.puede_leer('retenciones')));
create policy retencion_facturas_externas_update on public.retencion_facturas_externas for update to authenticated
  using ((select public.is_admin()) or (select public.puede('retenciones')))
  with check ((select public.is_admin()) or (select public.puede('retenciones')));
create policy retencion_facturas_externas_delete on public.retencion_facturas_externas for delete to authenticated
  using ((select public.is_admin()) or (select public.puede('retenciones')));

-- 5) Bucket privado de los soportes
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('retenciones-facturas-externas', 'retenciones-facturas-externas', false, 12582912,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

create policy "retenciones-facturas-externas read" on storage.objects for select to authenticated
  using (bucket_id = 'retenciones-facturas-externas' and (select public.puede_leer('retenciones')));
create policy "retenciones-facturas-externas insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'retenciones-facturas-externas' and (select public.puede_leer('retenciones'))
              and name ~ '^[a-z0-9][a-z0-9-]{2,63}/[^/]{1,200}$' and position('..' in name) = 0);
create policy "retenciones-facturas-externas update" on storage.objects for update to authenticated
  using (bucket_id = 'retenciones-facturas-externas' and ((select public.is_admin()) or (select public.puede('retenciones'))))
  with check (bucket_id = 'retenciones-facturas-externas' and ((select public.is_admin()) or (select public.puede('retenciones'))));
create policy "retenciones-facturas-externas delete" on storage.objects for delete to authenticated
  using (bucket_id = 'retenciones-facturas-externas' and ((select public.is_admin()) or (select public.puede('retenciones'))));

-- 6) Tiempo real
alter publication supabase_realtime add table public.retencion_empresas_receptoras, public.retencion_facturas_externas;

-- ── Registro de esta migración, con su SQL completo (mismo bloque: si algo de arriba falla, no queda) ──


create function public.retencion_buzon_adjuntos_validos(p_adjuntos jsonb, p_factura_id text)
returns boolean language sql immutable set search_path = public as $$
  select jsonb_typeof(p_adjuntos) = 'array'
     and jsonb_array_length(p_adjuntos) <= 6
     and not exists (
           select 1 from jsonb_array_elements(p_adjuntos) a
            where jsonb_typeof(a) <> 'object'
               or coalesce(a ->> 'tipo', '') not in ('imagen', 'pdf')
               or left(coalesce(a ->> 'path', ''), length(p_factura_id) + 1) <> p_factura_id || '/'
               or length(coalesce(a ->> 'path', '')) <= length(p_factura_id) + 1
               or length(a ->> 'path') > 300
               or position('..' in a ->> 'path') > 0
               or (a ? 'tamanoBytes' and (jsonb_typeof(a -> 'tamanoBytes') <> 'number'
                                          or (a ->> 'tamanoBytes')::numeric not between 0 and 12582912)))
     and (select count(*) from jsonb_array_elements(p_adjuntos) a where a ->> 'tipo' = 'imagen') <= 4
     and (select count(*) from jsonb_array_elements(p_adjuntos) a where a ->> 'tipo' = 'pdf') <= 2
$$;

revoke execute on function public.retencion_rif_valido(text) from public, anon;
revoke execute on function public.retencion_buzon_adjuntos_validos(jsonb, text) from public, anon;
grant execute on function public.retencion_rif_valido(text) to authenticated, service_role;
grant execute on function public.retencion_buzon_adjuntos_validos(jsonb, text) to authenticated, service_role;

-- 2) Empresas receptoras
create table public.retencion_empresas_receptoras (
  id                         text primary key,
  clave                      text not null unique,
  nombre                     text not null,
  nombre_corto               text,
  rif                        text not null,
  color_badge                text not null default '#64748b',
  activo                     boolean not null default true,
  orden                      int not null default 10,
  email                      text,
  telefono                   text,
  direccion_fiscal           text,
  municipio                  text,
  estado                     text,
  licencia_municipal         text,
  es_agente_iva              boolean not null default true,
  es_contribuyente_especial  boolean not null default false,
  retiene_islr               boolean not null default true,
  retiene_municipal          boolean not null default false,
  pct_iva_general            numeric(5,2) not null default 75,
  imprimir_original_y_copia  boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  actualizado_por            text,
  constraint retencion_empresas_receptoras_id_forma check (id ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  constraint retencion_empresas_receptoras_clave_forma check (clave ~ '^[a-z0-9_-]{1,64}$'),
  constraint retencion_empresas_receptoras_nombre_largo check (length(btrim(nombre)) between 1 and 200),
  constraint retencion_empresas_receptoras_nombre_corto_largo check (nombre_corto is null or length(btrim(nombre_corto)) between 1 and 60),
  constraint retencion_empresas_receptoras_rif_forma check (rif = 'S/RIF' or public.retencion_rif_valido(rif)),
  constraint retencion_empresas_receptoras_color_forma check (color_badge ~ '^#[0-9A-Fa-f]{6}$'),
  constraint retencion_empresas_receptoras_orden_rango check (orden between 0 and 9999),
  constraint retencion_empresas_receptoras_email_forma check (email is null or (length(email) <= 200 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  constraint retencion_empresas_receptoras_textos_largo check (
    coalesce(length(telefono), 0) <= 40 and coalesce(length(direccion_fiscal), 0) <= 500
    and coalesce(length(municipio), 0) <= 100 and coalesce(length(estado), 0) <= 100
    and coalesce(length(licencia_municipal), 0) <= 60 and coalesce(length(actualizado_por), 0) <= 200),
  constraint retencion_empresas_receptoras_pct_iva_rango check (pct_iva_general between 0 and 100)
);

-- 3) Buzón de facturas externas
create table public.retencion_facturas_externas (
  id                text primary key,
  empresa_id        text not null references public.retencion_empresas_receptoras (id) on delete restrict,
  empresa_nombre    text not null,
  proveedor_nombre  text not null,
  proveedor_rif     text not null,
  factura_numero    text not null,
  factura_control   text,
  factura_fecha     date not null,
  monto_total       numeric(14,2) not null,
  moneda            text not null default 'Bs',
  tasa              numeric(12,4),
  monto_bs          numeric(14,2) not null default 0,
  monto_usd         numeric(14,2),
  descripcion       text not null,
  observaciones     text,
  estatus           text not null default 'recibida',
  adjuntos          jsonb not null default '[]'::jsonb,
  created_by        text,
  created_by_name   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  actualizado_por   text,
  constraint retencion_facturas_externas_id_forma check (id ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  constraint retencion_facturas_externas_moneda_lista check (moneda in ('Bs', 'USD')),
  constraint retencion_facturas_externas_estatus_lista check (estatus in ('recibida', 'en_revision', 'retenida', 'descartada')),
  constraint retencion_facturas_externas_montos_rango check (monto_total >= 0 and monto_bs >= 0 and (monto_usd is null or monto_usd >= 0)),
  constraint retencion_facturas_externas_monto_moneda check ((moneda <> 'Bs' or monto_bs = monto_total) and (moneda <> 'USD' or monto_usd = monto_total)),
  constraint retencion_facturas_externas_tasa_rango check (tasa is null or tasa > 0),
  constraint retencion_facturas_externas_fecha_rango check (factura_fecha between date '2000-01-01' and date '2100-12-31'),
  constraint retencion_facturas_externas_rif_forma check (proveedor_rif = 'S/RIF' or public.retencion_rif_valido(proveedor_rif)),
  constraint retencion_facturas_externas_textos_largo check (
    length(btrim(empresa_nombre)) between 1 and 200 and length(btrim(proveedor_nombre)) between 1 and 200
    and length(btrim(factura_numero)) between 1 and 40 and (factura_control is null or length(btrim(factura_control)) between 1 and 40)
    and length(btrim(descripcion)) between 1 and 1000 and coalesce(length(observaciones), 0) <= 2000
    and coalesce(length(created_by), 0) <= 200 and coalesce(length(created_by_name), 0) <= 200
    and coalesce(length(actualizado_por), 0) <= 200),
  constraint retencion_facturas_externas_adjuntos_tope check (public.retencion_buzon_adjuntos_validos(adjuntos, id))
);

create index retencion_facturas_externas_empresa_idx on public.retencion_facturas_externas (empresa_id);
create index retencion_facturas_externas_estatus_idx on public.retencion_facturas_externas (estatus);
create index retencion_facturas_externas_fecha_idx on public.retencion_facturas_externas (factura_fecha desc);
create index retencion_facturas_externas_creada_idx on public.retencion_facturas_externas (created_at desc);

-- Lo que pone la base (no el teléfono): autor, fechas y la foto del nombre de la empresa
create function public.retencion_buzon_tocar()
returns trigger language plpgsql security invoker set search_path = public as $$
declare quien text := coalesce(nullif(auth.jwt() ->> 'email', ''), current_user); nombre_empresa text; nombre_actor text;
begin
  new.updated_at := now();
  new.actualizado_por := quien;
  if tg_op = 'INSERT' then
    new.created_at := now();
    if tg_table_name = 'retencion_facturas_externas' then
      if new.estatus <> 'recibida' then
        raise exception using errcode = 'P0001', message = 'RET_BUZON_ESTATUS: una factura nueva entra como «recibida».';
      end if;
      new.created_by := quien;
      -- el nombre a mostrar lo pone la base, no el cliente: el del usuario de la sesión (nombre + apellido)
      select nullif(btrim(concat_ws(' ', u.nombre, u.apellido)), '') into nombre_actor from public.usuarios u where u.id = auth.uid();
      new.created_by_name := nombre_actor;  -- nulo si no se encuentra: el correo en created_by basta de respaldo
      -- la foto del nombre; si la sesión no ve la empresa, deciden la RLS y la clave foránea
      select e.nombre into nombre_empresa from public.retencion_empresas_receptoras e where e.id = new.empresa_id;
      if found then new.empresa_nombre := nombre_empresa; end if;
    end if;
  else
    if new.id <> old.id then
      raise exception using errcode = 'P0001', message = 'RET_BUZON_ID: el identificador no se cambia.';
    end if;
    new.created_at := old.created_at;
    if tg_table_name = 'retencion_facturas_externas' then
      new.created_by := old.created_by;
      new.created_by_name := old.created_by_name;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.retencion_buzon_tocar() from public, anon, authenticated;

create trigger trg_retencion_empresas_receptoras_tocar before insert or update on public.retencion_empresas_receptoras
  for each row execute function public.retencion_buzon_tocar();
create trigger trg_retencion_facturas_externas_tocar before insert or update on public.retencion_facturas_externas
  for each row execute function public.retencion_buzon_tocar();

-- Semilla: GT y MTO, tal como están en rrhh_empresas (los datos que el sistema ya imprime)
insert into public.retencion_empresas_receptoras (id, clave, nombre, nombre_corto, rif, color_badge, orden, municipio, estado)
select v.id, v.clave, r.nombre, v.corto, r.rif, v.color, v.orden, v.municipio, 'Bolívar'
  from (values ('empresa-mits', 'mits', 'GT',  'Minería Internacional TS, C.A.', '#eab308', 1, 'Caroní'),
               ('empresa-mto',          'mto',          'MTO', 'MTO',          '#d97706', 2, null)) v(id, clave, rrhh, corto, color, orden, municipio)
  join public.rrhh_empresas r on r.clave = v.rrhh;

-- 4) Permisos y RLS
revoke all on public.retencion_empresas_receptoras from public, anon;
revoke all on public.retencion_facturas_externas from public, anon;
grant select, insert, update, delete on public.retencion_empresas_receptoras to authenticated;
grant select, insert, update, delete on public.retencion_facturas_externas to authenticated;
grant all on public.retencion_empresas_receptoras to service_role;
grant all on public.retencion_facturas_externas to service_role;

alter table public.retencion_empresas_receptoras enable row level security;
alter table public.retencion_facturas_externas enable row level security;

create policy retencion_empresas_receptoras_read on public.retencion_empresas_receptoras for select to authenticated
  using ((select public.puede_leer('retenciones')));
create policy retencion_empresas_receptoras_insert on public.retencion_empresas_receptoras for insert to authenticated
  with check ((select public.is_admin()) or (select public.puede('retenciones')));
create policy retencion_empresas_receptoras_update on public.retencion_empresas_receptoras for update to authenticated
  using ((select public.is_admin()) or (select public.puede('retenciones')))
  with check ((select public.is_admin()) or (select public.puede('retenciones')));
create policy retencion_empresas_receptoras_delete on public.retencion_empresas_receptoras for delete to authenticated
  using ((select public.is_admin()) or (select public.puede('retenciones')));

create policy retencion_facturas_externas_read on public.retencion_facturas_externas for select to authenticated
  using ((select public.puede_leer('retenciones')));
create policy retencion_facturas_externas_insert on public.retencion_facturas_externas for insert to authenticated
  with check ((select public.puede_leer('retenciones')));
create policy retencion_facturas_externas_update on public.retencion_facturas_externas for update to authenticated
  using ((select public.is_admin()) or (select public.puede('retenciones')))
  with check ((select public.is_admin()) or (select public.puede('retenciones')));
create policy retencion_facturas_externas_delete on public.retencion_facturas_externas for delete to authenticated
  using ((select public.is_admin()) or (select public.puede('retenciones')));

-- 5) Bucket privado de los soportes
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('retenciones-facturas-externas', 'retenciones-facturas-externas', false, 12582912,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

create policy "retenciones-facturas-externas read" on storage.objects for select to authenticated
  using (bucket_id = 'retenciones-facturas-externas' and (select public.puede_leer('retenciones')));
create policy "retenciones-facturas-externas insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'retenciones-facturas-externas' and (select public.puede_leer('retenciones'))
              and name ~ '^[a-z0-9][a-z0-9-]{2,63}/[^/]{1,200}$' and position('..' in name) = 0);
create policy "retenciones-facturas-externas update" on storage.objects for update to authenticated
  using (bucket_id = 'retenciones-facturas-externas' and ((select public.is_admin()) or (select public.puede('retenciones'))))
  with check (bucket_id = 'retenciones-facturas-externas' and ((select public.is_admin()) or (select public.puede('retenciones'))));
create policy "retenciones-facturas-externas delete" on storage.objects for delete to authenticated
  using (bucket_id = 'retenciones-facturas-externas' and ((select public.is_admin()) or (select public.puede('retenciones'))));

-- 6) Tiempo real
alter publication supabase_realtime add table public.retencion_empresas_receptoras, public.retencion_facturas_externas;


-- R12 · 16 · migración gt_retencion_buzon_campos_opcionales, versión 20261029100016 (después de R11)

-- ── Guarda: solo sigue si R11 está, R12 no, y la tabla aún no tiene tipo_documento (si no, se detiene sin escribir) ──


-- 1) Esos cinco campos dejan de ser obligatorios (la tabla tiene 0 filas: se ablanda sin riesgo)
alter table public.retencion_facturas_externas
  alter column proveedor_rif  drop not null,
  alter column factura_numero drop not null,
  alter column factura_fecha  drop not null,
  alter column monto_total    drop not null,
  alter column descripcion    drop not null;

-- 2) Tipo de documento (factura / nota de débito / nota de crédito)
alter table public.retencion_facturas_externas
  add column tipo_documento text not null default 'factura';

-- 3) Los CHECK: la misma regla de antes, pero solo cuando el campo viene con valor (mismos nombres)
alter table public.retencion_facturas_externas
  drop constraint retencion_facturas_externas_montos_rango,
  drop constraint retencion_facturas_externas_monto_moneda,
  drop constraint retencion_facturas_externas_fecha_rango,
  drop constraint retencion_facturas_externas_rif_forma,
  drop constraint retencion_facturas_externas_textos_largo,
  add constraint retencion_facturas_externas_montos_rango check (
    (monto_total is null or monto_total >= 0) and monto_bs >= 0 and (monto_usd is null or monto_usd >= 0)),
  add constraint retencion_facturas_externas_monto_moneda check (
    monto_total is null or ((moneda <> 'Bs' or monto_bs = monto_total) and (moneda <> 'USD' or monto_usd = monto_total))),
  add constraint retencion_facturas_externas_fecha_rango check (
    factura_fecha is null or (factura_fecha between date '2000-01-01' and date '2100-12-31')),
  add constraint retencion_facturas_externas_rif_forma check (
    proveedor_rif is null or proveedor_rif = 'S/RIF' or public.retencion_rif_valido(proveedor_rif)),
  add constraint retencion_facturas_externas_textos_largo check (
    length(btrim(empresa_nombre)) between 1 and 200
    and length(btrim(proveedor_nombre)) between 1 and 200
    and (factura_numero is null or length(btrim(factura_numero)) between 1 and 40)
    and (factura_control is null or length(btrim(factura_control)) between 1 and 40)
    and (descripcion is null or length(btrim(descripcion)) between 1 and 1000)
    and coalesce(length(observaciones), 0) <= 2000
    and coalesce(length(created_by), 0) <= 200
    and coalesce(length(created_by_name), 0) <= 200
    and coalesce(length(actualizado_por), 0) <= 200),
  add constraint retencion_facturas_externas_tipo_documento_lista check (
    tipo_documento in ('factura', 'nota_debito', 'nota_credito'));

-- ── Registro de esta migración, con su SQL completo (mismo bloque: si algo de arriba falla, no queda) ──


-- 2) Tipo de documento (factura / nota de débito / nota de crédito)
alter table public.retencion_facturas_externas
  add column tipo_documento text not null default 'factura';

-- 3) Los CHECK: la misma regla de antes, pero solo cuando el campo viene con valor (mismos nombres)
alter table public.retencion_facturas_externas
  drop constraint retencion_facturas_externas_montos_rango,
  drop constraint retencion_facturas_externas_monto_moneda,
  drop constraint retencion_facturas_externas_fecha_rango,
  drop constraint retencion_facturas_externas_rif_forma,
  drop constraint retencion_facturas_externas_textos_largo,
  add constraint retencion_facturas_externas_montos_rango check (
    (monto_total is null or monto_total >= 0) and monto_bs >= 0 and (monto_usd is null or monto_usd >= 0)),
  add constraint retencion_facturas_externas_monto_moneda check (
    monto_total is null or ((moneda <> 'Bs' or monto_bs = monto_total) and (moneda <> 'USD' or monto_usd = monto_total))),
  add constraint retencion_facturas_externas_fecha_rango check (
    factura_fecha is null or (factura_fecha between date '2000-01-01' and date '2100-12-31')),
  add constraint retencion_facturas_externas_rif_forma check (
    proveedor_rif is null or proveedor_rif = 'S/RIF' or public.retencion_rif_valido(proveedor_rif)),
  add constraint retencion_facturas_externas_textos_largo check (
    length(btrim(empresa_nombre)) between 1 and 200
    and length(btrim(proveedor_nombre)) between 1 and 200
    and (factura_numero is null or length(btrim(factura_numero)) between 1 and 40)
    and (factura_control is null or length(btrim(factura_control)) between 1 and 40)
    and (descripcion is null or length(btrim(descripcion)) between 1 and 1000)
    and coalesce(length(observaciones), 0) <= 2000
    and coalesce(length(created_by), 0) <= 200
    and coalesce(length(created_by_name), 0) <= 200
    and coalesce(length(actualizado_por), 0) <= 200),
  add constraint retencion_facturas_externas_tipo_documento_lista check (
    tipo_documento in ('factura', 'nota_debito', 'nota_credito'));


-- R13 · 17 · migración gt_retencion_multiempresa, versión 20261101100017 (después de R11)

-- ── Guarda: solo sigue si R11 está, R13 no, y la tabla aún no tiene empresa_id (si no, se detiene sin escribir) ──


-- 1) La ficha de cada empresa gana los datos fiscales que faltaban (defaults = los valores de hoy).
--    pct_iva_especial/pct_igtf/iva_alicuota son nacionales; alicuota_municipal es por empresa (ISAE de su municipio,
--    la persona de Retenciones la ajusta). El default 1 es la alícuota municipal global de hoy: GT y las existentes
--    quedan igual que hoy.
alter table public.retencion_empresas_receptoras
  add column pct_iva_especial   numeric not null default 100,
  add column pct_igtf           numeric not null default 3,
  add column iva_alicuota       numeric not null default 16,
  add column alicuota_municipal numeric not null default 1;

-- 2) El documento (cabecera) dice de qué empresa es. Primero opcional, se completa la fila que hay, y recién
--    queda obligatorio con default GT (así el front de una sola empresa sigue insertando sin cambiar nada).
alter table public.retencion_documentos add column empresa_id text;
update public.retencion_documentos set empresa_id = 'empresa-mits' where empresa_id is null;
alter table public.retencion_documentos
  alter column empresa_id set default 'empresa-mits',
  alter column empresa_id set not null,
  add constraint retencion_documentos_empresa_fk
    foreign key (empresa_id) references public.retencion_empresas_receptoras (id) on update cascade on delete restrict;
create index if not exists retencion_documentos_empresa_idx on public.retencion_documentos (empresa_id);

-- 3) Cada retención (línea) también lleva su empresa. Se completa: la de su documento si lo tiene; si no, GT.
alter table public.retenciones add column empresa_id text;
update public.retenciones r set empresa_id = coalesce(
  (select d.empresa_id from public.retencion_documentos d where d.id = r.documento_id),
  'empresa-mits');
alter table public.retenciones
  alter column empresa_id set default 'empresa-mits',
  alter column empresa_id set not null,
  add constraint retenciones_empresa_fk
    foreign key (empresa_id) references public.retencion_empresas_receptoras (id) on update cascade on delete restrict;
create index if not exists retenciones_empresa_idx on public.retenciones (empresa_id);

-- 4) No se mezclan empresas: si la línea cuelga de un documento, su empresa ES la del documento (autoritativo).
--    Un CHECK no puede mirar otra tabla, así que es un trigger. Corre primero (nombre «00», antes de la copia de
--    datos del documento) y fuerza empresa_id de la línea = la del documento. Para líneas sueltas no toca nada.
create or replace function public.retenciones_empresa_del_documento() returns trigger
  language plpgsql security definer set search_path = '' as $fn$
declare emp_doc text;
begin
  if new.documento_id is not null then
    select d.empresa_id into emp_doc from public.retencion_documentos d where d.id = new.documento_id;
    if emp_doc is not null and new.empresa_id is distinct from emp_doc then
      new.empresa_id := emp_doc;   -- la línea no puede ir en otra empresa que su documento
    end if;
  end if;
  return new;
end $fn$;

drop trigger if exists trg_retencion_00_empresa_del_documento on public.retenciones;
create trigger trg_retencion_00_empresa_del_documento
  before insert or update of empresa_id, documento_id on public.retenciones
  for each row execute function public.retenciones_empresa_del_documento();

-- ── Registro de esta migración, con su SQL completo (mismo bloque: si algo de arriba falla, no queda) ──
 alicuota_municipal es por empresa (ISAE de su municipio,
--    la persona de Retenciones la ajusta). El default 1 es la alícuota municipal global de hoy: GT y las existentes
--    quedan igual que hoy.
alter table public.retencion_empresas_receptoras
  add column pct_iva_especial   numeric not null default 100,
  add column pct_igtf           numeric not null default 3,
  add column iva_alicuota       numeric not null default 16,
  add column alicuota_municipal numeric not null default 1;

-- 2) El documento (cabecera) dice de qué empresa es. Primero opcional, se completa la fila que hay, y recién
--    queda obligatorio con default GT (así el front de una sola empresa sigue insertando sin cambiar nada).
alter table public.retencion_documentos add column empresa_id text;
update public.retencion_documentos set empresa_id = 'empresa-mits' where empresa_id is null;
alter table public.retencion_documentos
  alter column empresa_id set default 'empresa-mits',
  alter column empresa_id set not null,
  add constraint retencion_documentos_empresa_fk
    foreign key (empresa_id) references public.retencion_empresas_receptoras (id) on update cascade on delete restrict;
create index if not exists retencion_documentos_empresa_idx on public.retencion_documentos (empresa_id);

-- 3) Cada retención (línea) también lleva su empresa. Se completa: la de su documento si lo tiene; si no, GT.
alter table public.retenciones add column empresa_id text;
update public.retenciones r set empresa_id = coalesce(
  (select d.empresa_id from public.retencion_documentos d where d.id = r.documento_id),
  'empresa-mits');
alter table public.retenciones
  alter column empresa_id set default 'empresa-mits',
  alter column empresa_id set not null,
  add constraint retenciones_empresa_fk
    foreign key (empresa_id) references public.retencion_empresas_receptoras (id) on update cascade on delete restrict;
create index if not exists retenciones_empresa_idx on public.retenciones (empresa_id);

-- 4) No se mezclan empresas: si la línea cuelga de un documento, su empresa ES la del documento (autoritativo).
--    Un CHECK no puede mirar otra tabla, así que es un trigger. Corre primero (nombre «00», antes de la copia de
--    datos del documento) y fuerza empresa_id de la línea = la del documento. Para líneas sueltas no toca nada.
create or replace function public.retenciones_empresa_del_documento() returns trigger
  language plpgsql security definer set search_path = '' as $fn$
declare emp_doc text;
begin
  if new.documento_id is not null then
    select d.empresa_id into emp_doc from public.retencion_documentos d where d.id = new.documento_id;
    if emp_doc is not null and new.empresa_id is distinct from emp_doc then
      new.empresa_id := emp_doc;   -- la línea no puede ir en otra empresa que su documento
    end if;
  end if;
  return new;
end $fn$;

drop trigger if exists trg_retencion_00_empresa_del_documento on public.retenciones;
create trigger trg_retencion_00_empresa_del_documento
  before insert or update of empresa_id, documento_id on public.retenciones
  for each row execute function public.retenciones_empresa_del_documento();



INSERT INTO public.retencion_empresas_receptoras (
    id, clave, nombre, nombre_corto, rif, color_badge, activo, orden,
    direccion_fiscal, municipio, estado, email, telefono,
    pct_iva_general, pct_iva_especial, pct_igtf, iva_alicuota, alicuota_municipal, imprimir_original_y_copia
) VALUES (
    'empresa-mits', 'MITS', 'MINERIA INTERNACIONAL TS, C.A.', 'La Cantera', 'J-50209170-0', '#d97706', true, 1,
    'Sector La Cantera, Estado Bolívar, Venezuela', 'Piar', 'Bolívar', 'contacto@mineriainternacionalts.com', '+58 424-9349731',
    75, 100, 3, 16, 2, true
)
ON CONFLICT (id) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    rif = EXCLUDED.rif,
    activo = true;


-- C-k «Quién anuló»: migración gt_retenciones_anulada_por, versión 20261102100019. Armado por el Carril BD GT el 02/11/2026.
-- Origen y autorización: Master GT, por la líder (arreglo rápido: hoy la anulación no guarda quién la hizo y la
-- Auditoría lo atribuye al emisor). Es independiente de GL1 (reset) y de R13/R14; se puede aplicar en su momento.

-- ── Guarda: solo sigue si C-k no está y la columna no existe (si no, se detiene sin escribir) ──


-- Sello de anulación: quién anuló y cuándo. Dos columnas y un disparador que las sella al pasar a 'anulada'
-- (toma el correo de la sesión que anula; si la anulación ya los trajo, los respeta).
alter table public.retenciones
  add column anulada_por text,
  add column anulada_en  timestamptz;

create or replace function public.retenciones_anulada_sello() returns trigger
  language plpgsql security definer set search_path = '' as $fn$
begin
  if new.estado = 'anulada' and old.estado is distinct from 'anulada' then
    new.anulada_por := coalesce(new.anulada_por, nullif(auth.jwt() ->> 'email', ''), current_user);
    new.anulada_en  := coalesce(new.anulada_en, now());
  end if;
  return new;
end $fn$;

drop trigger if exists trg_retencion_anulada_sello on public.retenciones;
create trigger trg_retencion_anulada_sello
  before update of estado on public.retenciones
  for each row execute function public.retenciones_anulada_sello();

-- ── Registro de esta migración, con su SQL completo (mismo bloque: si algo de arriba falla, no queda) ──


create or replace function public.retenciones_anulada_sello() returns trigger
  language plpgsql security definer set search_path = '' as $fn$
begin
  if new.estado = 'anulada' and old.estado is distinct from 'anulada' then
    new.anulada_por := coalesce(new.anulada_por, nullif(auth.jwt() ->> 'email', ''), current_user);
    new.anulada_en  := coalesce(new.anulada_en, now());
  end if;
  return new;
end $fn$;

drop trigger if exists trg_retencion_anulada_sello on public.retenciones;
create trigger trg_retencion_anulada_sello
  before update of estado on public.retenciones
  for each row execute function public.retenciones_anulada_sello();

-- R-LOG «Registro append-only de las acciones del módulo»: migración gt_retencion_log_auditoria, versión 20261102100020.
-- Armado por el Carril BD GT el 02/11/2026. Origen y autorización: Master GT, por la líder (Auditoría opción 2, fase
-- inmediata post-go-live). EXTIENDE retencion_historial (una sola fuente), NO crea tabla nueva. INDEPENDIENTE de C-k/GL1.

-- ── Guarda: solo sigue si R-LOG no está (si no, se detiene sin escribir) ──


-- Una sola función escribe en retencion_historial (misma forma que r2..r8_anotar: antes/despues jsonb sin ruido,
-- motivo, actor, at). Cinco disparadores (uno por tabla) cierran los huecos que la Auditoría no registraba.
create or replace function public.retencion_log_anotar() returns trigger
  language plpgsql security definer set search_path = '' as $fn$
declare
  jnew jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  jold jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  jref jsonb := coalesce(jnew, jold);
  quien text := coalesce(nullif(auth.jwt() ->> 'email', ''), current_user);
  limpio text[] := array['motivo_cambio', 'actualizado_en', 'actualizado_por', 'updated_at', 'created_at'];
  v_clave text; v_motivo text;
begin
  if tg_table_name = 'retenciones' then
    v_clave := upper(coalesce(jref ->> 'tipo', '?')) || ':' || coalesce(jref ->> 'comprobante_nro', jref ->> 'id');
  elsif tg_table_name = 'retencion_agente_condiciones' then
    v_clave := coalesce(jref ->> 'impuesto_clave', '*') || ':' || coalesce(jref ->> 'condicion', '?');
  elsif tg_table_name = 'retencion_facturas_externas' then
    v_clave := coalesce(jref ->> 'proveedor_rif', '?') || ':' || coalesce(jref ->> 'factura_numero', jref ->> 'id');
  elsif tg_table_name = 'retencion_empresas_receptoras' then
    v_clave := coalesce(jref ->> 'clave', jref ->> 'id');
  elsif tg_table_name = 'retencion_documentos' then
    v_clave := coalesce(jref ->> 'factura_nro', '?') || ':' || coalesce(jref ->> 'id', '?');
  else
    v_clave := coalesce(jref ->> 'id', '?');
  end if;

  if tg_op = 'DELETE' then
    v_motivo := coalesce(jold ->> 'motivo', 'borrada');
  elsif tg_table_name = 'retenciones' then
    v_motivo := case
      when tg_op = 'INSERT' then 'emitida'
      when jnew ->> 'estado' = 'anulada' and jold ->> 'estado' is distinct from 'anulada'
        then coalesce(jnew ->> 'anulada_motivo', 'anulada')
      when jnew ->> 'estado' is distinct from jold ->> 'estado' then 'estado: ' || coalesce(jnew ->> 'estado', '?')
      else 'editada' end;
  else
    v_motivo := coalesce(jref ->> 'motivo', case when tg_op = 'INSERT' then 'alta' else 'cambio' end);
  end if;

  insert into public.retencion_historial (tabla, clave, antes, despues, motivo, actor)
  values (tg_table_name, v_clave,
          case when jold is null then null else jold - limpio end,
          case when jnew is null then null else jnew - limpio end,
          v_motivo, quien);
  return null;
end $fn$;

drop trigger if exists trg_retenciones_zz_log on public.retenciones;
create trigger trg_retenciones_zz_log after insert or update or delete on public.retenciones
  for each row execute function public.retencion_log_anotar();

drop trigger if exists trg_retencion_agente_condiciones_zz_log on public.retencion_agente_condiciones;
create trigger trg_retencion_agente_condiciones_zz_log after insert or update or delete on public.retencion_agente_condiciones
  for each row execute function public.retencion_log_anotar();

drop trigger if exists trg_retencion_facturas_externas_zz_log on public.retencion_facturas_externas;
create trigger trg_retencion_facturas_externas_zz_log after insert or update or delete on public.retencion_facturas_externas
  for each row execute function public.retencion_log_anotar();

drop trigger if exists trg_retencion_empresas_receptoras_zz_log on public.retencion_empresas_receptoras;
create trigger trg_retencion_empresas_receptoras_zz_log after insert or update or delete on public.retencion_empresas_receptoras
  for each row execute function public.retencion_log_anotar();

-- Documentos: el DELETE ya lo registra retencion_documentos_borrado; aquí solo alta y cambio (no duplicar el borrado).
drop trigger if exists trg_retencion_documentos_zz_log on public.retencion_documentos;
create trigger trg_retencion_documentos_zz_log after insert or update on public.retencion_documentos
  for each row execute function public.retencion_log_anotar();

-- Índice de lectura para la Auditoría (hoy historial solo tiene PK por id).
create index if not exists retencion_historial_tabla_clave_at_idx
  on public.retencion_historial (tabla, clave, at desc);

-- ── Registro de esta migración, con su SQL completo (mismo bloque: si algo de arriba falla, no queda) ──

  jold jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  jref jsonb := coalesce(jnew, jold);
  quien text := coalesce(nullif(auth.jwt() ->> 'email', ''), current_user);
  limpio text[] := array['motivo_cambio', 'actualizado_en', 'actualizado_por', 'updated_at', 'created_at'];
  v_clave text; v_motivo text;
begin
  if tg_table_name = 'retenciones' then
    v_clave := upper(coalesce(jref ->> 'tipo', '?')) || ':' || coalesce(jref ->> 'comprobante_nro', jref ->> 'id');
  elsif tg_table_name = 'retencion_agente_condiciones' then
    v_clave := coalesce(jref ->> 'impuesto_clave', '*') || ':' || coalesce(jref ->> 'condicion', '?');
  elsif tg_table_name = 'retencion_facturas_externas' then
    v_clave := coalesce(jref ->> 'proveedor_rif', '?') || ':' || coalesce(jref ->> 'factura_numero', jref ->> 'id');
  elsif tg_table_name = 'retencion_empresas_receptoras' then
    v_clave := coalesce(jref ->> 'clave', jref ->> 'id');
  elsif tg_table_name = 'retencion_documentos' then
    v_clave := coalesce(jref ->> 'factura_nro', '?') || ':' || coalesce(jref ->> 'id', '?');
  else
    v_clave := coalesce(jref ->> 'id', '?');
  end if;
  if tg_op = 'DELETE' then
    v_motivo := coalesce(jold ->> 'motivo', 'borrada');
  elsif tg_table_name = 'retenciones' then
    v_motivo := case
      when tg_op = 'INSERT' then 'emitida'
      when jnew ->> 'estado' = 'anulada' and jold ->> 'estado' is distinct from 'anulada'
        then coalesce(jnew ->> 'anulada_motivo', 'anulada')
      when jnew ->> 'estado' is distinct from jold ->> 'estado' then 'estado: ' || coalesce(jnew ->> 'estado', '?')
      else 'editada' end;
  else
    v_motivo := coalesce(jref ->> 'motivo', case when tg_op = 'INSERT' then 'alta' else 'cambio' end);
  end if;
  insert into public.retencion_historial (tabla, clave, antes, despues, motivo, actor)
  values (tg_table_name, v_clave,
          case when jold is null then null else jold - limpio end,
          case when jnew is null then null else jnew - limpio end,
          v_motivo, quien);
  return null;
end $fn$;
drop trigger if exists trg_retenciones_zz_log on public.retenciones;
create trigger trg_retenciones_zz_log after insert or update or delete on public.retenciones for each row execute function public.retencion_log_anotar();
drop trigger if exists trg_retencion_agente_condiciones_zz_log on public.retencion_agente_condiciones;
create trigger trg_retencion_agente_condiciones_zz_log after insert or update or delete on public.retencion_agente_condiciones for each row execute function public.retencion_log_anotar();
drop trigger if exists trg_retencion_facturas_externas_zz_log on public.retencion_facturas_externas;
create trigger trg_retencion_facturas_externas_zz_log after insert or update or delete on public.retencion_facturas_externas for each row execute function public.retencion_log_anotar();
drop trigger if exists trg_retencion_empresas_receptoras_zz_log on public.retencion_empresas_receptoras;
create trigger trg_retencion_empresas_receptoras_zz_log after insert or update or delete on public.retencion_empresas_receptoras for each row execute function public.retencion_log_anotar();
drop trigger if exists trg_retencion_documentos_zz_log on public.retencion_documentos;
create trigger trg_retencion_documentos_zz_log after insert or update on public.retencion_documentos for each row execute function public.retencion_log_anotar();
create index if not exists retencion_historial_tabla_clave_at_idx on public.retencion_historial (tabla, clave, at desc);

-- D2 «Régimen por empresa en una sola fuente (L6)»: migración gt_retencion_regimen_por_empresa, versión 20261102100021.
-- Carril BD GT, 02/11/2026. Origen y autorización: Master GT, por la líder (Fase 2 · D2, Opción A + enforce los 5). Post-go-live.
-- Unifica el régimen en retencion_agente_condiciones CON empresa_id (por empresa, con vigencia); la ficha deja de gobernar
-- el régimen. La base rechaza registrar un impuesto que la empresa no retiene (los 5, no solo IVA/IGTF).

-- ── Guarda ──


-- 1) empresa_id en L6 (primero opcional).
alter table public.retencion_agente_condiciones add column empresa_id text;

-- 2) Las 2 filas GLOBALES de hoy son el régimen de GT → se reasignan a GT y se rebasan al piso 2026-10-01
--    (su motivo dice «falta confirmar la fecha real»; la líder la afina luego por la UI del Régimen).
update public.retencion_agente_condiciones
   set empresa_id = 'empresa-mits', desde = date '2026-10-01'
 where empresa_id is null;

-- 3) Obligatoria, con default GT y clave foránea a la empresa.
alter table public.retencion_agente_condiciones
  alter column empresa_id set default 'empresa-mits',
  alter column empresa_id set not null,
  add constraint retencion_agente_condiciones_empresa_fk
    foreign key (empresa_id) references public.retencion_empresas_receptoras (id) on update cascade on delete restrict;

-- 4) El único deja de ser global y pasa a ser POR EMPRESA.
drop index if exists public.retencion_agente_condiciones_desde;
create unique index retencion_agente_condiciones_desde
  on public.retencion_agente_condiciones (empresa_id, coalesce(impuesto_clave, '*'), condicion, desde);

-- 5) Backfill: por cada empresa, su régimen tomado de la ficha (lo que ya existe no se duplica).
--    IVA/ISLR/MUNICIPAL/ESTADAL como 'agente_retencion'; 'contribuyente_especial' con impuesto NULL. IGTF no lleva fila
--    (su «practica» = especial OR IGTF/agente_percepcion). ESTADAL = false (la ficha no tiene esa bandera).
insert into public.retencion_agente_condiciones (empresa_id, impuesto_clave, condicion, valor, desde, motivo)
select e.id, s.impuesto, s.condicion,
       case
         when s.condicion = 'contribuyente_especial' then e.es_contribuyente_especial
         when s.impuesto = 'IVA'       then e.es_agente_iva
         when s.impuesto = 'ISLR'      then e.retiene_islr
         when s.impuesto = 'MUNICIPAL' then e.retiene_municipal
         else false
       end,
       date '2026-10-01',
       'Migración D2: régimen tomado de la ficha al unificar en L6 (02/11/2026).'
from public.retencion_empresas_receptoras e
cross join (values
    ('IVA', 'agente_retencion'), ('ISLR', 'agente_retencion'), ('MUNICIPAL', 'agente_retencion'),
    ('ESTADAL', 'agente_retencion'), (cast(null as text), 'contribuyente_especial')
  ) as s(impuesto, condicion)
where not exists (
  select 1 from public.retencion_agente_condiciones x
  where x.empresa_id = e.id
    and coalesce(x.impuesto_clave, '*') = coalesce(s.impuesto, '*')
    and x.condicion = s.condicion);

-- 6) Funciones: la lectura del régimen pasa a ser POR EMPRESA. Se dejan las firmas viejas como atajos a GT
--    (para que el front sin migrar siga andando durante el despliegue por fases de Principal).
create or replace function public.retencion_agente_condicion(p_empresa text, p_impuesto text, p_condicion text, p_fecha date)
  returns boolean language plpgsql stable security definer set search_path = 'public' as $fn$
declare v boolean;
begin
  select c.valor into v from public.retencion_agente_condiciones c
   where c.empresa_id = p_empresa
     and coalesce(c.impuesto_clave, '*') = coalesce(upper(p_impuesto), '*')
     and c.condicion = p_condicion
     and c.desde <= coalesce(p_fecha, current_date)
     and (c.hasta is null or c.hasta >= coalesce(p_fecha, current_date))
   order by c.desde desc limit 1;
  return coalesce(v, false);
end $fn$;

create or replace function public.retencion_agente_condicion(p_impuesto text, p_condicion text, p_fecha date)
  returns boolean language sql stable security definer set search_path = 'public' as $fn$
  select public.retencion_agente_condicion('empresa-mits', p_impuesto, p_condicion, p_fecha);
$fn$;

create or replace function public.retencion_empresa_practica(p_empresa text, p_impuesto text, p_fecha date default current_date)
  returns boolean language sql stable security definer set search_path = 'public' as $fn$
  select case upper(coalesce(p_impuesto, ''))
    when 'IVA'  then public.retencion_agente_condicion(p_empresa, 'IVA', 'agente_retencion', p_fecha)
                  or public.retencion_agente_condicion(p_empresa, null, 'contribuyente_especial', p_fecha)
    when 'IGTF' then public.retencion_agente_condicion(p_empresa, null, 'contribuyente_especial', p_fecha)
                  or public.retencion_agente_condicion(p_empresa, 'IGTF', 'agente_percepcion', p_fecha)
    when ''     then false
    else public.retencion_agente_condicion(p_empresa, upper(p_impuesto), 'agente_retencion', p_fecha)
  end
$fn$;

create or replace function public.retencion_empresa_practica(p_impuesto text, p_fecha date default current_date)
  returns boolean language sql stable security definer set search_path = 'public' as $fn$
  select public.retencion_empresa_practica('empresa-mits', p_impuesto, p_fecha);
$fn$;

-- 7) La base rechaza practicar un impuesto que la empresa no retiene (los 5, por empresa y a la fecha).
create or replace function public.retencion_agente_valido() returns trigger
  language plpgsql security definer set search_path = 'public' as $fn$
declare f date := coalesce(new.factura_fecha, new.fecha, current_date);
begin
  if new.rol <> 'practicada' then return new; end if;
  if public.retencion_empresa_practica(new.empresa_id, new.tipo, f) then return new; end if;
  raise exception using errcode = 'check_violation',
    message = 'La empresa no retiene ' || new.tipo || ' en esa fecha: su Régimen (Parámetros › Régimen) no la habilita.',
    hint = 'Si te la practicaron, registrala como «Nos la practicaron». Si corresponde, ajustá el Régimen de la empresa.';
end $fn$;

drop trigger if exists trg_retencion_agente_valido on public.retenciones;
create trigger trg_retencion_agente_valido before insert or update of rol, tipo, empresa_id on public.retenciones
  for each row execute function public.retencion_agente_valido();

-- Nota: retencion_agente_condiciones_al_json no se toca: ya llama a la firma de 3 args (ahora atajo a GT), así que
-- el espejo del JSON queda GT-only de forma natural, mientras el front per-empresa lee L6. Se retira cuando el front ya no use el JSON.

-- ── Registro de esta migración, con su SQL completo ──

update public.retencion_agente_condiciones set empresa_id = 'empresa-mits', desde = date '2026-10-01' where empresa_id is null;
alter table public.retencion_agente_condiciones alter column empresa_id set default 'empresa-mits', alter column empresa_id set not null, add constraint retencion_agente_condiciones_empresa_fk foreign key (empresa_id) references public.retencion_empresas_receptoras (id) on update cascade on delete restrict;
drop index if exists public.retencion_agente_condiciones_desde;
create unique index retencion_agente_condiciones_desde on public.retencion_agente_condiciones (empresa_id, coalesce(impuesto_clave, '*'), condicion, desde);
insert into public.retencion_agente_condiciones (empresa_id, impuesto_clave, condicion, valor, desde, motivo)
select e.id, s.impuesto, s.condicion, case when s.condicion='contribuyente_especial' then e.es_contribuyente_especial when s.impuesto='IVA' then e.es_agente_iva when s.impuesto='ISLR' then e.retiene_islr when s.impuesto='MUNICIPAL' then e.retiene_municipal else false end, date '2026-10-01', 'Migración D2: régimen tomado de la ficha al unificar en L6 (02/11/2026).'
from public.retencion_empresas_receptoras e cross join (values ('IVA','agente_retencion'),('ISLR','agente_retencion'),('MUNICIPAL','agente_retencion'),('ESTADAL','agente_retencion'),(cast(null as text),'contribuyente_especial')) as s(impuesto,condicion)
where not exists (select 1 from public.retencion_agente_condiciones x where x.empresa_id=e.id and coalesce(x.impuesto_clave,'*')=coalesce(s.impuesto,'*') and x.condicion=s.condicion);
create or replace function public.retencion_agente_condicion(p_empresa text, p_impuesto text, p_condicion text, p_fecha date) returns boolean language plpgsql stable security definer set search_path='public' as $fn$ declare v boolean; begin select c.valor into v from public.retencion_agente_condiciones c where c.empresa_id=p_empresa and coalesce(c.impuesto_clave,'*')=coalesce(upper(p_impuesto),'*') and c.condicion=p_condicion and c.desde<=coalesce(p_fecha,current_date) and (c.hasta is null or c.hasta>=coalesce(p_fecha,current_date)) order by c.desde desc limit 1; return coalesce(v,false); end $fn$;
create or replace function public.retencion_agente_condicion(p_impuesto text, p_condicion text, p_fecha date) returns boolean language sql stable security definer set search_path='public' as $fn$ select public.retencion_agente_condicion('empresa-mits', p_impuesto, p_condicion, p_fecha); $fn$;
create or replace function public.retencion_empresa_practica(p_empresa text, p_impuesto text, p_fecha date default current_date) returns boolean language sql stable security definer set search_path='public' as $fn$ select case upper(coalesce(p_impuesto,'')) when 'IVA' then public.retencion_agente_condicion(p_empresa,'IVA','agente_retencion',p_fecha) or public.retencion_agente_condicion(p_empresa,null,'contribuyente_especial',p_fecha) when 'IGTF' then public.retencion_agente_condicion(p_empresa,null,'contribuyente_especial',p_fecha) or public.retencion_agente_condicion(p_empresa,'IGTF','agente_percepcion',p_fecha) when '' then false else public.retencion_agente_condicion(p_empresa,upper(p_impuesto),'agente_retencion',p_fecha) end $fn$;
create or replace function public.retencion_empresa_practica(p_impuesto text, p_fecha date default current_date) returns boolean language sql stable security definer set search_path='public' as $fn$ select public.retencion_empresa_practica('empresa-mits', p_impuesto, p_fecha); $fn$;
create or replace function public.retencion_agente_valido() returns trigger language plpgsql security definer set search_path='public' as $fn$ declare f date := coalesce(new.factura_fecha, new.fecha, current_date); begin if new.rol<>'practicada' then return new; end if; if public.retencion_empresa_practica(new.empresa_id, new.tipo, f) then return new; end if; raise exception using errcode='check_violation', message='La empresa no retiene '||new.tipo||' en esa fecha: su Régimen (Parámetros › Régimen) no la habilita.', hint='Si te la practicaron, registrala como «Nos la practicaron». Si corresponde, ajustá el Régimen de la empresa.'; end $fn$;
drop trigger if exists trg_retencion_agente_valido on public.retenciones;
create trigger trg_retencion_agente_valido before insert or update of rol, tipo, empresa_id on public.retenciones for each row execute function public.retencion_agente_valido();

-- GT · ENTREGA POR PAQUETE · 59-RESP-aplicar.sql
-- «Modelo de permisos del RESPALDO (traspaso desde MGG)»: migración gt_dump_database_sql_permiso_respaldo,
-- versión 20261102100023. Carril BD GT, 02/11/2026. Origen y autorización: Master GT, por la líder.
-- ALCANCE: esto es GT (respaldo/permisos), NO Retenciones; encargo explícito de la líder.
--
-- QUÉ HACE (3 cambios, nada más):
--   1) ACL: le quita a `anon` el permiso de ejecutar public.dump_database_sql() (hoy lo tiene; en MGG no). Se conservan
--      authenticated (lo usa la app, gateado por dentro), service_role y postgres.
--   2) roles_permisos: agrega el módulo 'respaldo' con lectura=true a los roles 'admin' y 'analista' (los dos que hoy
--      pueden respaldar). El resto queda sin respaldo, asignable después por la UI. Idempotente.
--   3) dump_database_sql(): se conserva TODO el cuerpo actual (SECURITY DEFINER, search_path='public',
--      statement_timeout, columnas GENERATED ALWAYS, array_agg, with ordinality). SOLO cambia el chequeo inicial:
--      de «usuarios.role in ('admin','analista')» (que no mira estado) a «puede_leer('respaldo')» (activo + permiso).
--

-- ── Guarda ──


-- 1) ACL: quitar EXECUTE a anon (se conservan authenticated, service_role, postgres).
revoke execute on function public.dump_database_sql() from anon;

-- 2) roles_permisos: módulo 'respaldo' con lectura=true a 'admin' y 'analista' (preserva el acceso actual).
update public.roles_permisos
   set permisos = jsonb_set(coalesce(permisos, '{}'::jsonb), '{respaldo}', '{"lectura": true}'::jsonb, true)
 where role in ('admin', 'analista');

-- 3) dump_database_sql(): mismo cuerpo, SOLO cambia el chequeo inicial a puede_leer('respaldo').
create or replace function public.dump_database_sql()
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
 set statement_timeout to '60s'
as $function$
declare
  t        record;
  gencols  text[];
  filas    text[];
  partes   text[] := '{}';
begin
  if not public.puede_leer('respaldo') then
    raise exception 'Solo un usuario activo con permiso de Respaldo puede generar el respaldo de datos.';
  end if;

  partes := array_append(partes,
    '-- Minería Internacional TS, C.A.-Inventario · Respaldo de DATOS · ' || now()::text || chr(10) ||
    '-- Restaurar sobre el esquema base (supabase/schema.sql).' || chr(10));

  for t in
    select table_name
      from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name
  loop
    -- Las columnas GENERATED ALWAYS no se escriben: Postgres las rechaza en un INSERT.
    select coalesce(array_agg(column_name), '{}')
      into gencols
      from information_schema.columns
     where table_schema = 'public'
       and table_name = t.table_name
       and is_generated = 'ALWAYS';

    partes := array_append(partes, '-- ===== ' || t.table_name || ' =====');

    -- Un solo SELECT por tabla arma TODOS sus INSERT. `with ordinality` conserva
    -- el orden de las columnas, para que el respaldo salga siempre igual y se
    -- pueda comparar un volcado con otro.
    execute format($q$
      select coalesce(array_agg(
               format('INSERT INTO public.%%I (%%s) VALUES (%%s) ON CONFLICT DO NOTHING;',
                      %L, j.cols, j.vals)
             ), '{}')
        from public.%I x
        cross join lateral (
          select string_agg(quote_ident(e.key), ', ' order by e.ord) as cols,
                 string_agg(
                   case
                     when e.value is null or jsonb_typeof(e.value) = 'null'
                       then 'NULL'
                     when jsonb_typeof(e.value) in ('number', 'boolean')
                       then e.value #>> '{}'
                     when jsonb_typeof(e.value) in ('object', 'array')
                       then quote_literal(e.value::text) || '::jsonb'
                     else quote_literal(e.value #>> '{}')
                   end, ', ' order by e.ord) as vals
            from jsonb_each(to_jsonb(x)) with ordinality as e(key, value, ord)
           where not (e.key = any($1))
        ) j
    $q$, t.table_name, t.table_name)
    into filas
    using gencols;

    if array_length(filas, 1) > 0 then
      partes := array_append(partes, array_to_string(filas, chr(10)));
    end if;
    partes := array_append(partes, '');
  end loop;

  return array_to_string(partes, chr(10));
end;
$function$;

-- ── Registro de esta migración, con su SQL completo ──

update public.roles_permisos set permisos = jsonb_set(coalesce(permisos, '{}'::jsonb), '{respaldo}', '{"lectura": true}'::jsonb, true) where role in ('admin', 'analista');
create or replace function public.dump_database_sql()
 returns text language plpgsql security definer set search_path to 'public' set statement_timeout to '60s'
as $function$
declare
  t        record;
  gencols  text[];
  filas    text[];
  partes   text[] := '{}';
begin
  if not public.puede_leer('respaldo') then
    raise exception 'Solo un usuario activo con permiso de Respaldo puede generar el respaldo de datos.';
  end if;

  partes := array_append(partes,
    '-- Minería Internacional TS, C.A.-Inventario · Respaldo de DATOS · ' || now()::text || chr(10) ||
    '-- Restaurar sobre el esquema base (supabase/schema.sql).' || chr(10));

  for t in
    select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name
  loop
    select coalesce(array_agg(column_name), '{}') into gencols
      from information_schema.columns
     where table_schema = 'public' and table_name = t.table_name and is_generated = 'ALWAYS';
    partes := array_append(partes, '-- ===== ' || t.table_name || ' =====');
    execute format($q$
      select coalesce(array_agg(
               format('INSERT INTO public.%%I (%%s) VALUES (%%s) ON CONFLICT DO NOTHING;', %L, j.cols, j.vals)
             ), '{}')
        from public.%I x
        cross join lateral (
          select string_agg(quote_ident(e.key), ', ' order by e.ord) as cols,
                 string_agg(
                   case
                     when e.value is null or jsonb_typeof(e.value) = 'null' then 'NULL'
                     when jsonb_typeof(e.value) in ('number', 'boolean') then e.value #>> '{}'
                     when jsonb_typeof(e.value) in ('object', 'array') then quote_literal(e.value::text) || '::jsonb'
                     else quote_literal(e.value #>> '{}')
                   end, ', ' order by e.ord) as vals
            from jsonb_each(to_jsonb(x)) with ordinality as e(key, value, ord)
           where not (e.key = any($1))
        ) j
    $q$, t.table_name, t.table_name) into filas using gencols;
    if array_length(filas, 1) > 0 then
      partes := array_append(partes, array_to_string(filas, chr(10)));
    end if;
    partes := array_append(partes, '');
  end loop;
  return array_to_string(partes, chr(10));
end;
$function$;

-- R9 · 13 de 13 · gt_retencion_formas_y_rangos · migración gt_retencion_formas_y_rangos, versión 20261020100013

-- ── Guarda: solo sigue si la base está justo antes de R9 (si no, se detiene sin escribir nada) ──


-- 1) retenciones
alter table public.retenciones drop constraint retenciones_valor_ut_check;
alter table public.retenciones
  add constraint retenciones_montos_no_negativos check (
        base >= 0 and monto >= 0
    and (base_bs is null or base_bs >= 0) and (monto_bs is null or monto_bs >= 0)
    and (sustraendo is null or sustraendo >= 0) and (iva_monto is null or iva_monto >= 0)
    and (exento is null or exento >= 0) and (factura_total is null or factura_total >= 0)),
  add constraint retenciones_porcentajes check (
        porcentaje between 0 and 100 and (iva_alicuota is null or iva_alicuota between 0 and 100)),
  add constraint retenciones_tasa_positiva check (tasa is null or tasa > 0),
  add constraint retenciones_valor_ut_positivo check (valor_ut is null or valor_ut > 0),
  add constraint retenciones_quincena check (quincena is null or quincena in (1, 2)),
  add constraint retenciones_periodo_forma check (comprobante_periodo is null or comprobante_periodo ~ '^[0-9]{4}(0[1-9]|1[0-2])$'),
  add constraint retenciones_fechas check (
        fecha between date '2000-01-01' and date '2100-12-31'
    and (factura_fecha is null or factura_fecha between date '2000-01-01' and date '2100-12-31')),
  add constraint retenciones_forma check (
        (factura_nro is null or (length(factura_nro) between 1 and 30 and factura_nro = btrim(factura_nro) and factura_nro !~ '[\r\n]'))
    and (factura_control is null or (length(factura_control) between 1 and 30 and factura_control = btrim(factura_control) and factura_control !~ '[\r\n]'))
    and (comprobante_nro is null or (length(comprobante_nro) between 1 and 30 and comprobante_nro = btrim(comprobante_nro) and comprobante_nro !~ '[\r\n]'))
    and (concepto_codigo is null or (length(concepto_codigo) between 1 and 30 and concepto_codigo = btrim(concepto_codigo) and concepto_codigo !~ '[\r\n]'))),
  add constraint retenciones_moneda check (moneda in ('Bs', 'USD'));

-- 2) retencion_documentos
alter table public.retencion_documentos
  add constraint retencion_documentos_montos check (
        (factura_total is null or factura_total >= 0) and (exento is null or exento >= 0) and (iva_monto is null or iva_monto >= 0)),
  add constraint retencion_documentos_porcentajes check (iva_alicuota is null or iva_alicuota between 0 and 100),
  add constraint retencion_documentos_tasa_positiva check (tasa is null or tasa > 0),
  add constraint retencion_documentos_moneda check (moneda in ('Bs', 'USD'));

-- 3) R1: RIF del ente, fechas, y el tipo de licencia contra el catálogo de R3
alter table public.retencion_entes
  add constraint retencion_entes_rif_forma check (rif is null or upper(regexp_replace(rif, '[^A-Za-z0-9]', '', 'g')) ~ '^[VEJPG][0-9]{9}$');
alter table public.retencion_ente_impuestos
  add constraint retencion_ente_impuestos_desde_rango check (desde between date '2000-01-01' and date '2100-12-31');
alter table public.retencion_ente_logos
  add constraint retencion_ente_logos_desde_rango check (desde between date '2000-01-01' and date '2100-12-31');
alter table public.retencion_agente_imagenes
  add constraint retencion_agente_imagenes_desde_rango check (desde between date '2000-01-01' and date '2100-12-31');
alter table public.retencion_contraparte_perfiles
  add constraint retencion_contraparte_perfiles_licencia_vence_rango check (licencia_vence is null or licencia_vence between date '2000-01-01' and date '2100-12-31');

create function public.retencion_contraparte_licencia_tipo_valida()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.licencia_tipo := nullif(btrim(new.licencia_tipo), '');
  if new.licencia_tipo is null then return new; end if;
  if tg_op = 'UPDATE' and lower(new.licencia_tipo) = lower(coalesce(btrim(old.licencia_tipo), '')) then return new; end if;
  if not exists (select 1 from public.retencion_licencia_tipos t
                  where lower(btrim(t.nombre)) = lower(new.licencia_tipo) and t.activo) then
    raise exception using errcode = 'P0001',
      message = 'RET_LICENCIA_TIPO: ese tipo de licencia no está en el catálogo o está inactivo (Parámetros → Tipos de licencia).';
  end if;
  return new;
end $$;
revoke execute on function public.retencion_contraparte_licencia_tipo_valida() from public, anon, authenticated;
create trigger trg_retencion_contraparte_perfiles_licencia_tipo before insert or update of licencia_tipo
  on public.retencion_contraparte_perfiles for each row execute function public.retencion_contraparte_licencia_tipo_valida();

-- 4) Claves y códigos que se comparan (Master 10:25, K1-K3)
-- K1: el código de un supuesto es camelCase a propósito, pero no puede repetirse cambiando solo mayúsculas.
create unique index retencion_supuestos_codigo_unico_sin_mayusculas on public.retencion_supuestos (impuesto_clave, lower(codigo));
-- K2: los códigos de una clasificación (conceptos de ISLR, actividades del municipio) van sin espacios y en MAYÚSCULAS.
alter table public.retencion_clasificacion_codigos
  add constraint retencion_clasificacion_codigos_forma check (
        length(codigo) between 1 and 30 and codigo = btrim(codigo) and codigo !~ '[\r\n]' and codigo = upper(codigo));
-- K3: el código de ordenanza de una actividad del proveedor, con la misma forma: así siempre coincide con el catálogo
--     (el trigger de R4 lo enlaza por igualdad exacta).
alter table public.retencion_contraparte_actividades
  add constraint retencion_contraparte_actividades_ordenanza_forma check (
        ordenanza_codigo is null
     or (length(ordenanza_codigo) between 1 and 30 and ordenanza_codigo = btrim(ordenanza_codigo)
         and ordenanza_codigo !~ '[\r\n]' and ordenanza_codigo = upper(ordenanza_codigo)));

-- 5) Índices de retenciones (Master 21/10 08:46, informe de migraciones P1 y P2)
-- P1: retenciones_fecha_idx es idéntico a retenciones_fecha_ix (btree (fecha DESC)); sin origen en el registro y nunca usado.
drop index public.retenciones_fecha_idx;
-- P2: la FK de servicio_directo_id no tenía índice (asesor de Supabase: unindexed_foreign_keys), como sí lo tienen orden_id y proveedor_id.
create index retenciones_servicio_directo_idx on public.retenciones (servicio_directo_id) where servicio_directo_id is not null;

-- 6) Puente documento × origen (revisión de seguridad del front, 21/10 09:22; Master 09:29, puntos 2 y 3)
-- Punto 2: no se quita el enlace principal ni el que dice de qué archivo salió la factura.
create function public.retencion_documento_origenes_al_borrar()
returns trigger language plpgsql security definer set search_path = public as $$
declare d public.retencion_documentos;
begin
  select * into d from public.retencion_documentos where id = old.documento_id;
  if not found then return old; end if;   -- el documento se está borrando (cascada de un documento libre): el enlace se va con él
  if coalesce(old.orden_id, old.compra_directa_id, old.servicio_directo_id)
     = coalesce(d.orden_id, d.compra_directa_id, d.servicio_directo_id) then
    raise exception using errcode = 'P0001',
      message = 'RET_ENLACE_PRINCIPAL: es el origen principal del documento fiscal; se corrige en el documento, o se borra el documento si está libre.';
  end if;
  if old.adjunto_id is not null then
    raise exception using errcode = 'P0001',
      message = 'RET_ENLACE_CON_ARCHIVO: este enlace dice de qué archivo salió la factura; primero quite el archivo del enlace.';
  end if;
  return old;
end $$;
revoke execute on function public.retencion_documento_origenes_al_borrar() from public, anon, authenticated;
create trigger trg_retencion_documento_origenes_al_borrar before delete on public.retencion_documento_origenes
  for each row execute function public.retencion_documento_origenes_al_borrar();

-- Punto 3: una factura PRACTICADA solo se enlaza con órdenes, compras o servicios de SU proveedor (cuando los dos lo tienen).
create function public.retencion_origen_proveedor(p_orden uuid, p_compra uuid, p_servicio uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select case when p_orden is not null then (select o.proveedor_id from public.ordenes o where o.id = p_orden)
              when p_compra is not null then (select c.proveedor_id from public.compras_directas c where c.id = p_compra)
              else (select s.proveedor_id from public.servicios_directos s where s.id = p_servicio) end
$$;
revoke execute on function public.retencion_origen_proveedor(uuid, uuid, uuid) from public, anon, authenticated;

create function public.retencion_documento_origenes_proveedor()
returns trigger language plpgsql security definer set search_path = public as $$
declare d public.retencion_documentos; op uuid;
begin
  select * into d from public.retencion_documentos where id = new.documento_id;
  if not found or d.rol <> 'practicada' or d.proveedor_id is null then return new; end if;
  op := public.retencion_origen_proveedor(new.orden_id, new.compra_directa_id, new.servicio_directo_id);
  if op is not null and op <> d.proveedor_id then
    raise exception using errcode = 'P0001',
      message = 'RET_ORIGEN_OTRO_PROVEEDOR: esa orden, compra o servicio es de otro proveedor; la factura no se enlaza ahí.';
  end if;
  return new;
end $$;
revoke execute on function public.retencion_documento_origenes_proveedor() from public, anon, authenticated;
create trigger trg_retencion_documento_origenes_proveedor
  before insert or update of documento_id, orden_id, compra_directa_id, servicio_directo_id on public.retencion_documento_origenes
  for each row execute function public.retencion_documento_origenes_proveedor();

-- … y si después se cambia el proveedor (o el sentido) del documento, sus enlaces tienen que seguir cuadrando.
create function public.retencion_documentos_proveedor_enlaces()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.rol = 'practicada' and new.proveedor_id is not null
     and exists (select 1 from public.retencion_documento_origenes p
                  where p.documento_id = new.id
                    and public.retencion_origen_proveedor(p.orden_id, p.compra_directa_id, p.servicio_directo_id) <> new.proveedor_id) then
    raise exception using errcode = 'P0001',
      message = 'RET_ORIGEN_OTRO_PROVEEDOR: el documento está enlazado con órdenes, compras o servicios de otro proveedor; no se le cambia el proveedor.';
  end if;
  return null;
end $$;
revoke execute on function public.retencion_documentos_proveedor_enlaces() from public, anon, authenticated;
create trigger trg_retencion_documentos_proveedor_enlaces after update of proveedor_id, rol on public.retencion_documentos
  for each row execute function public.retencion_documentos_proveedor_enlaces();

-- ── Registro de esta migración, con su SQL completo (mismo bloque: si algo de arriba falla, no queda) ──

alter table public.retenciones
  add constraint retenciones_montos_no_negativos check (
        base >= 0 and monto >= 0
    and (base_bs is null or base_bs >= 0) and (monto_bs is null or monto_bs >= 0)
    and (sustraendo is null or sustraendo >= 0) and (iva_monto is null or iva_monto >= 0)
    and (exento is null or exento >= 0) and (factura_total is null or factura_total >= 0)),
  add constraint retenciones_porcentajes check (
        porcentaje between 0 and 100 and (iva_alicuota is null or iva_alicuota between 0 and 100)),
  add constraint retenciones_tasa_positiva check (tasa is null or tasa > 0),
  add constraint retenciones_valor_ut_positivo check (valor_ut is null or valor_ut > 0),
  add constraint retenciones_quincena check (quincena is null or quincena in (1, 2)),
  add constraint retenciones_periodo_forma check (comprobante_periodo is null or comprobante_periodo ~ '^[0-9]{4}(0[1-9]|1[0-2])$'),
  add constraint retenciones_fechas check (
        fecha between date '2000-01-01' and date '2100-12-31'
    and (factura_fecha is null or factura_fecha between date '2000-01-01' and date '2100-12-31')),
  add constraint retenciones_forma check (
        (factura_nro is null or (length(factura_nro) between 1 and 30 and factura_nro = btrim(factura_nro) and factura_nro !~ '[\r\n]'))
    and (factura_control is null or (length(factura_control) between 1 and 30 and factura_control = btrim(factura_control) and factura_control !~ '[\r\n]'))
    and (comprobante_nro is null or (length(comprobante_nro) between 1 and 30 and comprobante_nro = btrim(comprobante_nro) and comprobante_nro !~ '[\r\n]'))
    and (concepto_codigo is null or (length(concepto_codigo) between 1 and 30 and concepto_codigo = btrim(concepto_codigo) and concepto_codigo !~ '[\r\n]'))),
  add constraint retenciones_moneda check (moneda in ('Bs', 'USD'));

-- 2) retencion_documentos
alter table public.retencion_documentos
  add constraint retencion_documentos_montos check (
        (factura_total is null or factura_total >= 0) and (exento is null or exento >= 0) and (iva_monto is null or iva_monto >= 0)),
  add constraint retencion_documentos_porcentajes check (iva_alicuota is null or iva_alicuota between 0 and 100),
  add constraint retencion_documentos_tasa_positiva check (tasa is null or tasa > 0),
  add constraint retencion_documentos_moneda check (moneda in ('Bs', 'USD'));

-- 3) R1: RIF del ente, fechas, y el tipo de licencia contra el catálogo de R3
alter table public.retencion_entes
  add constraint retencion_entes_rif_forma check (rif is null or upper(regexp_replace(rif, '[^A-Za-z0-9]', '', 'g')) ~ '^[VEJPG][0-9]{9}$');
alter table public.retencion_ente_impuestos
  add constraint retencion_ente_impuestos_desde_rango check (desde between date '2000-01-01' and date '2100-12-31');
alter table public.retencion_ente_logos
  add constraint retencion_ente_logos_desde_rango check (desde between date '2000-01-01' and date '2100-12-31');
alter table public.retencion_agente_imagenes
  add constraint retencion_agente_imagenes_desde_rango check (desde between date '2000-01-01' and date '2100-12-31');
alter table public.retencion_contraparte_perfiles
  add constraint retencion_contraparte_perfiles_licencia_vence_rango check (licencia_vence is null or licencia_vence between date '2000-01-01' and date '2100-12-31');

create function public.retencion_contraparte_licencia_tipo_valida()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.licencia_tipo := nullif(btrim(new.licencia_tipo), '');
  if new.licencia_tipo is null then return new; end if;
  if tg_op = 'UPDATE' and lower(new.licencia_tipo) = lower(coalesce(btrim(old.licencia_tipo), '')) then return new; end if;
  if not exists (select 1 from public.retencion_licencia_tipos t
                  where lower(btrim(t.nombre)) = lower(new.licencia_tipo) and t.activo) then
    raise exception using errcode = 'P0001',
      message = 'RET_LICENCIA_TIPO: ese tipo de licencia no está en el catálogo o está inactivo (Parámetros → Tipos de licencia).';
  end if;
  return new;
end $$;
revoke execute on function public.retencion_contraparte_licencia_tipo_valida() from public, anon, authenticated;
create trigger trg_retencion_contraparte_perfiles_licencia_tipo before insert or update of licencia_tipo
  on public.retencion_contraparte_perfiles for each row execute function public.retencion_contraparte_licencia_tipo_valida();

-- 4) Claves y códigos que se comparan (Master 10:25, K1-K3)
-- K1: el código de un supuesto es camelCase a propósito, pero no puede repetirse cambiando solo mayúsculas.
create unique index retencion_supuestos_codigo_unico_sin_mayusculas on public.retencion_supuestos (impuesto_clave, lower(codigo));
-- K2: los códigos de una clasificación (conceptos de ISLR, actividades del municipio) van sin espacios y en MAYÚSCULAS.
alter table public.retencion_clasificacion_codigos
  add constraint retencion_clasificacion_codigos_forma check (
        length(codigo) between 1 and 30 and codigo = btrim(codigo) and codigo !~ '[\r\n]' and codigo = upper(codigo));
-- K3: el código de ordenanza de una actividad del proveedor, con la misma forma: así siempre coincide con el catálogo
--     (el trigger de R4 lo enlaza por igualdad exacta).
alter table public.retencion_contraparte_actividades
  add constraint retencion_contraparte_actividades_ordenanza_forma check (
        ordenanza_codigo is null
     or (length(ordenanza_codigo) between 1 and 30 and ordenanza_codigo = btrim(ordenanza_codigo)
         and ordenanza_codigo !~ '[\r\n]' and ordenanza_codigo = upper(ordenanza_codigo)));

-- 5) Índices de retenciones (Master 21/10 08:46, informe de migraciones P1 y P2)
-- P1: retenciones_fecha_idx es idéntico a retenciones_fecha_ix (btree (fecha DESC)); sin origen en el registro y nunca usado.
drop index public.retenciones_fecha_idx;
-- P2: la FK de servicio_directo_id no tenía índice (asesor de Supabase: unindexed_foreign_keys), como sí lo tienen orden_id y proveedor_id.
create index retenciones_servicio_directo_idx on public.retenciones (servicio_directo_id) where servicio_directo_id is not null;

-- 6) Puente documento × origen (revisión de seguridad del front, 21/10 09:22; Master 09:29, puntos 2 y 3)
-- Punto 2: no se quita el enlace principal ni el que dice de qué archivo salió la factura.
create function public.retencion_documento_origenes_al_borrar()
returns trigger language plpgsql security definer set search_path = public as $$
declare d public.retencion_documentos;
begin
  select * into d from public.retencion_documentos where id = old.documento_id;
  if not found then return old; end if;   -- el documento se está borrando (cascada de un documento libre): el enlace se va con él
  if coalesce(old.orden_id, old.compra_directa_id, old.servicio_directo_id)
     = coalesce(d.orden_id, d.compra_directa_id, d.servicio_directo_id) then
    raise exception using errcode = 'P0001',
      message = 'RET_ENLACE_PRINCIPAL: es el origen principal del documento fiscal; se corrige en el documento, o se borra el documento si está libre.';
  end if;
  if old.adjunto_id is not null then
    raise exception using errcode = 'P0001',
      message = 'RET_ENLACE_CON_ARCHIVO: este enlace dice de qué archivo salió la factura; primero quite el archivo del enlace.';
  end if;
  return old;
end $$;
revoke execute on function public.retencion_documento_origenes_al_borrar() from public, anon, authenticated;
create trigger trg_retencion_documento_origenes_al_borrar before delete on public.retencion_documento_origenes
  for each row execute function public.retencion_documento_origenes_al_borrar();

-- Punto 3: una factura PRACTICADA solo se enlaza con órdenes, compras o servicios de SU proveedor (cuando los dos lo tienen).
create function public.retencion_origen_proveedor(p_orden uuid, p_compra uuid, p_servicio uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select case when p_orden is not null then (select o.proveedor_id from public.ordenes o where o.id = p_orden)
              when p_compra is not null then (select c.proveedor_id from public.compras_directas c where c.id = p_compra)
              else (select s.proveedor_id from public.servicios_directos s where s.id = p_servicio) end
$$;
revoke execute on function public.retencion_origen_proveedor(uuid, uuid, uuid) from public, anon, authenticated;

create function public.retencion_documento_origenes_proveedor()
returns trigger language plpgsql security definer set search_path = public as $$
declare d public.retencion_documentos; op uuid;
begin
  select * into d from public.retencion_documentos where id = new.documento_id;
  if not found or d.rol <> 'practicada' or d.proveedor_id is null then return new; end if;
  op := public.retencion_origen_proveedor(new.orden_id, new.compra_directa_id, new.servicio_directo_id);
  if op is not null and op <> d.proveedor_id then
    raise exception using errcode = 'P0001',
      message = 'RET_ORIGEN_OTRO_PROVEEDOR: esa orden, compra o servicio es de otro proveedor; la factura no se enlaza ahí.';
  end if;
  return new;
end $$;
revoke execute on function public.retencion_documento_origenes_proveedor() from public, anon, authenticated;
create trigger trg_retencion_documento_origenes_proveedor
  before insert or update of documento_id, orden_id, compra_directa_id, servicio_directo_id on public.retencion_documento_origenes
  for each row execute function public.retencion_documento_origenes_proveedor();

-- … y si después se cambia el proveedor (o el sentido) del documento, sus enlaces tienen que seguir cuadrando.
create function public.retencion_documentos_proveedor_enlaces()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.rol = 'practicada' and new.proveedor_id is not null
     and exists (select 1 from public.retencion_documento_origenes p
                  where p.documento_id = new.id
                    and public.retencion_origen_proveedor(p.orden_id, p.compra_directa_id, p.servicio_directo_id) <> new.proveedor_id) then
    raise exception using errcode = 'P0001',
      message = 'RET_ORIGEN_OTRO_PROVEEDOR: el documento está enlazado con órdenes, compras o servicios de otro proveedor; no se le cambia el proveedor.';
  end if;
  return null;
end $$;
revoke execute on function public.retencion_documentos_proveedor_enlaces() from public, anon, authenticated;
create trigger trg_retencion_documentos_proveedor_enlaces after update of proveedor_id, rol on public.retencion_documentos
  for each row execute function public.retencion_documentos_proveedor_enlaces();


COMMIT;
