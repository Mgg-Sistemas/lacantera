-- ============================================================
-- ESTADO: PENDIENTE DE APLICAR
-- MODULO: Retenciones Fiscales (Minería Internacional TS, C.A.)
-- ARCHIVO: 02_retenciones_entes_impuestos_y_valores.sql
--
-- DESCRIPCIÓN:
-- Crea la arquitectura de Entes Tributarios (R1: SENIAT, Alcaldía Piar, Alcaldía Caroní, Gobernación),
-- Fichas de Impuestos y Series (R2: IVA, ISLR, Municipal, Estadal, IGTF) y Parámetros con Historial (R3: UT 43 Bs, etc.).
--
-- CONSULTA DE VERIFICACIÓN / RESULTADO ESPERADO:
-- Ejecutar tras aplicar este script:
--   1) SELECT count(*) >= 3 AS entes_ok FROM public.retencion_entes;
--      -> true (SENIAT, Alcaldía Piar, Caroní, etc.)
--   2) SELECT count(*) >= 4 AS impuestos_ok FROM public.retencion_impuestos;
--      -> true (IVA, ISLR, MUNICIPAL, IGTF registrados)
--   3) SELECT count(*) >= 1 AS ut_ok FROM public.retencion_parametros WHERE valor_numero = 43;
--      -> true (Unidad Tributaria de 43 Bs vigente)
--
-- SEGURIDAD:
-- Transaccional (BEGIN...COMMIT), idempotente y no destructivo para los datos vivos.
-- ============================================================

BEGIN;


-- R1 · 1 de 13 · gt_retenciones_quien · migración gt_retenciones_quien, versión 20261020100001

-- ── Guarda: solo sigue si la base está justo antes de R1 (si no, se detiene sin escribir nada) ──


-- Quién y cuándo, común a las tablas de R1.
create function public.retencion_r1_tocar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := coalesce(auth.jwt() ->> 'email', current_user);
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  return new;
end $$;
revoke execute on function public.retencion_r1_tocar() from public, anon, authenticated;

-- 1) Entes
create table public.retencion_entes (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null check (length(btrim(nombre)) >= 3),
  tipo             text not null check (tipo in ('nacional', 'estadal', 'municipal')),
  estado           text,           -- territorio: estado (para estadal y municipal)
  municipio        text,           -- territorio: municipio (para municipal)
  rif              text,
  activo           boolean not null default true,
  desde            date not null default current_date,
  hasta            date,
  motivo           text,
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text,
  check (hasta is null or hasta >= desde),
  check (tipo <> 'municipal' or (nullif(btrim(estado), '') is not null and nullif(btrim(municipio), '') is not null)),
  check (tipo <> 'estadal' or nullif(btrim(estado), '') is not null)
);
create unique index retencion_entes_unico on public.retencion_entes (tipo, lower(btrim(nombre)));
comment on table public.retencion_entes is 'Retenciones: quien crea y cobra el impuesto (SENIAT, alcaldía, gobernación), con su territorio';
create trigger trg_retencion_entes_tocar before insert or update on public.retencion_entes
  for each row execute function public.retencion_r1_tocar();

insert into public.retencion_entes (nombre, tipo, motivo) values
  ('SENIAT', 'nacional', 'Semilla R1');
insert into public.retencion_entes (nombre, tipo, estado, municipio, motivo) values
  ('Alcaldía del Municipio Caroní', 'municipal', 'Bolívar', 'Caroní', 'Semilla R1 (D3: ISAE de Caroní)');

-- 1b) Qué impuestos crea o cobra cada ente. Puente con la clave de texto de hoy; R2 (impuesto contenedor)
--     convierte cada fila en un impuesto con su ente (retencion_impuestos.ente_id) y esta tabla queda como vista o se retira.
create table public.retencion_ente_impuestos (
  id               uuid primary key default gen_random_uuid(),
  ente_id          uuid not null references public.retencion_entes (id) on delete restrict,
  impuesto_clave   text not null check (impuesto_clave in ('IVA', 'ISLR', 'MUNICIPAL', 'ESTADAL', 'IGTF')),
  activo           boolean not null default true,
  desde            date not null default current_date,
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text,
  unique (ente_id, impuesto_clave)
);
comment on table public.retencion_ente_impuestos is 'Retenciones: impuestos que crea o cobra cada ente (puente provisional hasta R2)';
create trigger trg_retencion_ente_impuestos_tocar before insert or update on public.retencion_ente_impuestos
  for each row execute function public.retencion_r1_tocar();
insert into public.retencion_ente_impuestos (ente_id, impuesto_clave)
select e.id, i.clave from public.retencion_entes e
  cross join lateral unnest(case when e.tipo = 'nacional' then array['IVA', 'ISLR', 'IGTF'] else array['MUNICIPAL'] end) as i(clave);

-- 2) Logos con versiones, en un bucket privado propio (PNG o JPG, hasta 1 MB)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('retenciones-logos', 'retenciones-logos', false, 1048576, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy "retenciones_logos read" on storage.objects for select to authenticated
  using (bucket_id = 'retenciones-logos');
create policy "retenciones_logos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'retenciones-logos' and ((select public.is_admin()) or (select public.puede('retenciones'))));
-- Sin UPDATE: un archivo no se reemplaza (cada versión tiene su ruta; un comprobante viejo conserva su logo).
-- DELETE solo de un archivo huérfano: va después de crear retencion_ente_logos.

create table public.retencion_ente_logos (
  id               uuid primary key default gen_random_uuid(),
  ente_id          uuid not null references public.retencion_entes (id) on delete restrict,
  ruta             text not null check (ruta like 'entes/%'),   -- ruta dentro del bucket retenciones-logos
  nombre_archivo   text,
  desde            date not null default current_date,
  activo           boolean not null default true,
  motivo           text,
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text,
  unique (ente_id, desde)
);
comment on table public.retencion_ente_logos is 'Retenciones: logo de cada ente, por versiones (desde una fecha)';
create trigger trg_retencion_ente_logos_tocar before insert or update on public.retencion_ente_logos
  for each row execute function public.retencion_r1_tocar();

-- 2b) Imágenes de la EMPRESA como agente (logo, firma, sello), con versiones; mismo bucket, carpeta agente/.
create table public.retencion_agente_imagenes (
  id               uuid primary key default gen_random_uuid(),
  clase            text not null check (clase in ('logo', 'firma', 'sello')),
  ruta             text not null check (ruta like 'agente/%'),
  nombre_archivo   text,
  firmante         text,           -- para la firma: nombre y cargo de quien firma
  desde            date not null default current_date,
  activo           boolean not null default true,
  motivo           text,
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text,
  unique (clase, desde)
);
comment on table public.retencion_agente_imagenes is 'Retenciones: logo, firma y sello de la empresa en los comprobantes, por versiones (desde una fecha)';
create trigger trg_retencion_agente_imagenes_tocar before insert or update on public.retencion_agente_imagenes
  for each row execute function public.retencion_r1_tocar();

create function public.retencion_agente_imagen_vigente(p_clase text, p_fecha date)
returns text language sql stable security invoker set search_path = public as $$
  select i.ruta from public.retencion_agente_imagenes i
   where i.clase = p_clase and i.activo and i.desde <= coalesce(p_fecha, current_date)
   order by i.desde desc limit 1;
$$;

-- DELETE solo de un archivo HUÉRFANO (ninguna versión lo usa): limpia la subida cuando falla el insert de la versión.
create policy "retenciones_logos delete huerfano" on storage.objects for delete to authenticated
  using (bucket_id = 'retenciones-logos' and ((select public.is_admin()) or (select public.puede('retenciones')))
         and not exists (select 1 from public.retencion_ente_logos l where l.ruta = storage.objects.name)
         and not exists (select 1 from public.retencion_agente_imagenes i where i.ruta = storage.objects.name));

create function public.retencion_ente_logo_vigente(p_ente uuid, p_fecha date)
returns text language sql stable security invoker set search_path = public as $$
  select l.ruta from public.retencion_ente_logos l
   where l.ente_id = p_ente and l.activo and l.desde <= coalesce(p_fecha, current_date)
   order by l.desde desc limit 1;
$$;

-- 3) Condición del agente por impuesto y fecha
create table public.retencion_agente_condiciones (
  id               uuid primary key default gen_random_uuid(),
  -- Clave del impuesto (los valores de hoy de retenciones.tipo). R2 la convertirá en FK a retencion_impuestos.
  impuesto_clave   text check (impuesto_clave in ('IVA', 'ISLR', 'MUNICIPAL', 'ESTADAL', 'IGTF')),
  condicion        text not null check (condicion in ('agente_retencion', 'agente_percepcion', 'contribuyente_especial')),
  valor            boolean not null,
  desde            date not null,
  hasta            date,
  motivo           text not null check (length(btrim(motivo)) > 0),
  fuente           text,           -- providencia o acto que designa
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text,
  check (hasta is null or hasta >= desde),
  -- «especial» es de la empresa, no de un impuesto; las otras dos, de un impuesto
  check ((condicion = 'contribuyente_especial') = (impuesto_clave is null))
);
create unique index retencion_agente_condiciones_desde on public.retencion_agente_condiciones
  (coalesce(impuesto_clave, '*'), condicion, desde);
comment on table public.retencion_agente_condiciones is 'Retenciones: condición de la empresa por impuesto (agente, especial, percepción) con vigencia';
create trigger trg_retencion_agente_condiciones_tocar before insert or update on public.retencion_agente_condiciones
  for each row execute function public.retencion_r1_tocar();

-- La condición vigente en una fecha; si no hay ninguna para esa fecha, la marca del JSON de hoy (convivencia).
create function public.retencion_agente_condicion(p_impuesto text, p_condicion text, p_fecha date)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v boolean; clave text;
begin
  select c.valor into v from public.retencion_agente_condiciones c
   where coalesce(c.impuesto_clave, '*') = coalesce(upper(p_impuesto), '*') and c.condicion = p_condicion
     and c.desde <= coalesce(p_fecha, current_date)
     and (c.hasta is null or c.hasta >= coalesce(p_fecha, current_date))
   order by c.desde desc limit 1;
  if found then return v; end if;
  clave := case when p_condicion = 'contribuyente_especial' then 'contribuyente_especial'
                when p_condicion = 'agente_retencion' and upper(p_impuesto) = 'IVA' then 'agente_retencion_iva' end;
  if clave is null then return false; end if;
  select coalesce((value ->> clave)::boolean, false) into v from public.config where key = 'retenciones.parametros';
  return coalesce(v, false);
end $$;
revoke execute on function public.retencion_agente_condicion(text, text, date) from public, anon;
grant execute on function public.retencion_agente_condicion(text, text, date) to authenticated, service_role;

-- Convivencia: el valor vigente HOY se copia a las marcas del JSON que lee el código de hoy.
create function public.retencion_agente_condiciones_al_json()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.config
     set value = jsonb_set(jsonb_set(value,
                   '{agente_retencion_iva}', to_jsonb(public.retencion_agente_condicion('IVA', 'agente_retencion', current_date))),
                   '{contribuyente_especial}', to_jsonb(public.retencion_agente_condicion(null, 'contribuyente_especial', current_date))),
         updated_by = 'retencion_agente_condiciones (R1)',
         updated_at = now()
   where key = 'retenciones.parametros';
  return null;
end $$;
revoke execute on function public.retencion_agente_condiciones_al_json() from public, anon, authenticated;
create trigger trg_retencion_agente_condiciones_al_json after insert or update on public.retencion_agente_condiciones
  for each statement execute function public.retencion_agente_condiciones_al_json();

-- Carga inicial: los valores de HOY del JSON (no cambia ninguna decisión).
insert into public.retencion_agente_condiciones (impuesto_clave, condicion, valor, desde, motivo)
select 'IVA', 'agente_retencion', coalesce((value ->> 'agente_retencion_iva')::boolean, false), current_date,
       'Carga inicial R1 desde Parámetros (valor vigente al aplicar). La fecha real de la designación la confirma el usuario.'
  from public.config where key = 'retenciones.parametros';
insert into public.retencion_agente_condiciones (impuesto_clave, condicion, valor, desde, motivo)
select null, 'contribuyente_especial', coalesce((value ->> 'contribuyente_especial')::boolean, false), current_date,
       'Carga inicial R1 desde Parámetros (valor vigente al aplicar). La fecha real la confirma el usuario.'
  from public.config where key = 'retenciones.parametros';

-- 4) El trigger del régimen lee la condición a la fecha de la retención (mismos mensajes que hoy)
create or replace function public.retencion_agente_valido()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  especial boolean;
  agente_iva boolean;
  f date := coalesce(new.factura_fecha, new.fecha, current_date);
begin
  if new.rol <> 'practicada' or new.tipo not in ('IVA', 'IGTF') then
    return new;
  end if;

  especial := public.retencion_agente_condicion(null, 'contribuyente_especial', f);
  agente_iva := public.retencion_agente_condicion('IVA', 'agente_retencion', f);

  if coalesce(especial, false) then
    return new;
  end if;
  -- IVA: basta con estar designada agente de retención de IVA.
  if new.tipo = 'IVA' and coalesce(agente_iva, false) then
    return new;
  end if;

  raise exception using
    errcode = 'check_violation',
    message = case when new.tipo = 'IVA'
      then 'La empresa no puede retener IVA: no está marcada como agente de retención de IVA.'
      else 'La empresa no puede percibir IGTF: no está designada contribuyente especial.' end,
    hint = 'Si te la practicaron a vos, registrala como «Nos la practicaron». '
        || 'Si el SENIAT designó a la empresa, marcá la casilla en Parámetros fiscales.';
end $$;

-- 5) Perfil fiscal del proveedor, con vigencia
create table public.retencion_contraparte_perfiles (
  id                     uuid primary key default gen_random_uuid(),
  proveedor_id           uuid not null references public.proveedores (id) on delete restrict,
  tipo_persona           text not null check (tipo_persona in ('natural', 'juridica')),
  residente              boolean not null default true,   -- residente (PN) o domiciliada (PJ)
  sujeto                 text generated always as (
                           case when tipo_persona = 'natural' then case when residente then 'PNR' else 'PNNR' end
                                else case when residente then 'PJD' else 'PJND' end end) stored,
  tipo_contribuyente     text not null default 'ordinario' check (tipo_contribuyente in ('ordinario', 'especial', 'formal')),
  es_agente_retencion    boolean not null default false,  -- la contraparte retiene IVA (sirve para las recibidas)
  licencia_tipo          text,           -- texto hasta que «Tipos de licencia» tenga tabla
  licencia_numero        text,
  licencia_estado        text not null default 'por_solicitar'
                           check (licencia_estado in ('por_solicitar', 'solicitada', 'vigente', 'vencida', 'no_aplica')),
  licencia_vence         date,
  licencia_ente_id       uuid references public.retencion_entes (id) on delete restrict,   -- alcaldía que la emite
  datos_solicitados_en   timestamptz,
  observacion            text,
  motivo                 text,           -- por qué cambió (versión nueva)
  desde                  date not null default current_date,
  hasta                  date,
  created_at             timestamptz not null default now(),
  actualizado_en         timestamptz not null default now(),
  actualizado_por        text,
  check (hasta is null or hasta >= desde),
  check (licencia_estado <> 'vigente' or nullif(btrim(licencia_numero), '') is not null)
);
create unique index retencion_contraparte_perfiles_abierto on public.retencion_contraparte_perfiles (proveedor_id) where hasta is null;
create unique index retencion_contraparte_perfiles_desde on public.retencion_contraparte_perfiles (proveedor_id, desde);
comment on table public.retencion_contraparte_perfiles is 'Retenciones: perfil fiscal del proveedor, con vigencia (cada cambio de fondo es una versión)';

-- Una versión nueva cierra la abierta el día antes; no se puede abrir una versión anterior a la abierta.
create function public.retencion_contraparte_perfiles_versionar()
returns trigger language plpgsql security definer set search_path = public as $$
declare abierta public.retencion_contraparte_perfiles;
begin
  select * into abierta from public.retencion_contraparte_perfiles
   where proveedor_id = new.proveedor_id and hasta is null for update;
  if found then
    if new.desde <= abierta.desde then
      raise exception using errcode = 'P0001',
        message = 'RET_PERFIL_DESDE: la versión nueva tiene que empezar después del ' || to_char(abierta.desde, 'DD/MM/YYYY') || '.';
    end if;
    update public.retencion_contraparte_perfiles set hasta = new.desde - 1 where id = abierta.id;
  end if;
  return new;
end $$;
revoke execute on function public.retencion_contraparte_perfiles_versionar() from public, anon, authenticated;
create trigger trg_retencion_contraparte_perfiles_versionar before insert on public.retencion_contraparte_perfiles
  for each row execute function public.retencion_contraparte_perfiles_versionar();
create trigger trg_retencion_contraparte_perfiles_tocar before insert or update on public.retencion_contraparte_perfiles
  for each row execute function public.retencion_r1_tocar();

-- 6) Actividades económicas del proveedor (N). Cada fila lleva la CIIU (catálogo de Compras, actividades_economicas)
--    y/o el código de la ORDENANZA de un ente municipal (la que da la alícuota del ISAE; texto hasta R4, que añade la FK).
create table public.retencion_contraparte_actividades (
  id                uuid primary key default gen_random_uuid(),
  proveedor_id      uuid not null references public.proveedores (id) on delete restrict,
  ciiu_codigo       text references public.actividades_economicas (codigo) on delete restrict,
  ente_id           uuid references public.retencion_entes (id) on delete restrict,
  ordenanza_codigo  text check (ordenanza_codigo is null or length(btrim(ordenanza_codigo)) > 0),
  descripcion       text,
  principal         boolean not null default false,
  desde             date not null default current_date,
  hasta             date,
  activa            boolean not null default true,
  nota              text,
  created_at        timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  actualizado_por   text,
  check (hasta is null or hasta >= desde),
  check (ciiu_codigo is not null or ordenanza_codigo is not null),
  check ((ordenanza_codigo is null) = (ente_id is null))
);
create unique index retencion_contraparte_actividades_unica on public.retencion_contraparte_actividades
  (proveedor_id, coalesce(ciiu_codigo, ''), coalesce(ente_id::text, ''), coalesce(ordenanza_codigo, '')) where activa;
create unique index retencion_contraparte_actividades_principal on public.retencion_contraparte_actividades
  (proveedor_id) where activa and principal;
comment on table public.retencion_contraparte_actividades is 'Retenciones: las N actividades económicas de cada proveedor (CIIU y/o código de la ordenanza del municipio)';
create trigger trg_retencion_contraparte_actividades_tocar before insert or update on public.retencion_contraparte_actividades
  for each row execute function public.retencion_r1_tocar();

-- 6b) «Perfil completo»: una sola regla, en la base. faltan = lo que falta; completo = no falta nada.
--     perfil: sin versión vigente hoy · actividad: ninguna activa · licencia_vencida: estado «vencida», o «vigente» con
--     vence < hoy. «por_solicitar», «solicitada» y «no_aplica» cuentan como licencia cargada (la pantalla las marca aparte).
create view public.retencion_contraparte_estado with (security_invoker = true) as
select pr.id as proveedor_id,
       p.id as perfil_id,
       p.sujeto,
       p.tipo_contribuyente,
       p.licencia_estado,
       p.licencia_vence,
       (select count(*) from public.retencion_contraparte_actividades a
         where a.proveedor_id = pr.id and a.activa and (a.hasta is null or a.hasta >= current_date))::int as actividades,
       f.faltan,
       cardinality(f.faltan) = 0 as completo
  from public.proveedores pr
  left join public.retencion_contraparte_perfiles p
    on p.proveedor_id = pr.id and p.desde <= current_date and (p.hasta is null or p.hasta >= current_date)
  cross join lateral (select array_remove(array[
         case when p.id is null then 'perfil' end,
         case when not exists (select 1 from public.retencion_contraparte_actividades a
                                where a.proveedor_id = pr.id and a.activa and (a.hasta is null or a.hasta >= current_date))
              then 'actividad' end,
         case when p.licencia_estado = 'vencida' or (p.licencia_estado = 'vigente' and p.licencia_vence < current_date)
              then 'licencia_vencida' end
       ], null) as faltan) f;
comment on view public.retencion_contraparte_estado is 'Retenciones: si el perfil fiscal de cada proveedor está completo hoy y qué le falta';
revoke all on public.retencion_contraparte_estado from anon;

-- 7) RLS: lee cualquier autenticada; escribe puede('retenciones') (o admin); nadie borra.
do $$
declare t text;
begin
  foreach t in array array['retencion_entes', 'retencion_ente_impuestos', 'retencion_ente_logos', 'retencion_agente_imagenes', 'retencion_agente_condiciones',
                           'retencion_contraparte_perfiles', 'retencion_contraparte_actividades'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate, references, trigger on public.%I from authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()) or (select public.puede(''retenciones'')))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin()) or (select public.puede(''retenciones''))) with check ((select public.is_admin()) or (select public.puede(''retenciones'')))', t || '_update', t);
  end loop;
end $$;

alter publication supabase_realtime add table public.retencion_entes, public.retencion_ente_impuestos, public.retencion_ente_logos, public.retencion_agente_imagenes,
  public.retencion_agente_condiciones, public.retencion_contraparte_perfiles, public.retencion_contraparte_actividades;

-- ── Registro de esta migración, con su SQL completo (mismo bloque: si algo de arriba falla, no queda) ──

  new.actualizado_por := coalesce(auth.jwt() ->> 'email', current_user);
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  return new;
end $$;
revoke execute on function public.retencion_r1_tocar() from public, anon, authenticated;

-- 1) Entes
create table public.retencion_entes (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null check (length(btrim(nombre)) >= 3),
  tipo             text not null check (tipo in ('nacional', 'estadal', 'municipal')),
  estado           text,           -- territorio: estado (para estadal y municipal)
  municipio        text,           -- territorio: municipio (para municipal)
  rif              text,
  activo           boolean not null default true,
  desde            date not null default current_date,
  hasta            date,
  motivo           text,
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text,
  check (hasta is null or hasta >= desde),
  check (tipo <> 'municipal' or (nullif(btrim(estado), '') is not null and nullif(btrim(municipio), '') is not null)),
  check (tipo <> 'estadal' or nullif(btrim(estado), '') is not null)
);
create unique index retencion_entes_unico on public.retencion_entes (tipo, lower(btrim(nombre)));
comment on table public.retencion_entes is 'Retenciones: quien crea y cobra el impuesto (SENIAT, alcaldía, gobernación), con su territorio';
create trigger trg_retencion_entes_tocar before insert or update on public.retencion_entes
  for each row execute function public.retencion_r1_tocar();

insert into public.retencion_entes (nombre, tipo, motivo) values
  ('SENIAT', 'nacional', 'Semilla R1');
insert into public.retencion_entes (nombre, tipo, estado, municipio, motivo) values
  ('Alcaldía del Municipio Caroní', 'municipal', 'Bolívar', 'Caroní', 'Semilla R1 (D3: ISAE de Caroní)');

-- 1b) Qué impuestos crea o cobra cada ente. Puente con la clave de texto de hoy; R2 (impuesto contenedor)
--     convierte cada fila en un impuesto con su ente (retencion_impuestos.ente_id) y esta tabla queda como vista o se retira.
create table public.retencion_ente_impuestos (
  id               uuid primary key default gen_random_uuid(),
  ente_id          uuid not null references public.retencion_entes (id) on delete restrict,
  impuesto_clave   text not null check (impuesto_clave in ('IVA', 'ISLR', 'MUNICIPAL', 'ESTADAL', 'IGTF')),
  activo           boolean not null default true,
  desde            date not null default current_date,
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text,
  unique (ente_id, impuesto_clave)
);
comment on table public.retencion_ente_impuestos is 'Retenciones: impuestos que crea o cobra cada ente (puente provisional hasta R2)';
create trigger trg_retencion_ente_impuestos_tocar before insert or update on public.retencion_ente_impuestos
  for each row execute function public.retencion_r1_tocar();
insert into public.retencion_ente_impuestos (ente_id, impuesto_clave)
select e.id, i.clave from public.retencion_entes e
  cross join lateral unnest(case when e.tipo = 'nacional' then array['IVA', 'ISLR', 'IGTF'] else array['MUNICIPAL'] end) as i(clave);

-- 2) Logos con versiones, en un bucket privado propio (PNG o JPG, hasta 1 MB)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('retenciones-logos', 'retenciones-logos', false, 1048576, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy "retenciones_logos read" on storage.objects for select to authenticated
  using (bucket_id = 'retenciones-logos');
create policy "retenciones_logos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'retenciones-logos' and ((select public.is_admin()) or (select public.puede('retenciones'))));
-- Sin UPDATE: un archivo no se reemplaza (cada versión tiene su ruta; un comprobante viejo conserva su logo).
-- DELETE solo de un archivo huérfano: va después de crear retencion_ente_logos.

create table public.retencion_ente_logos (
  id               uuid primary key default gen_random_uuid(),
  ente_id          uuid not null references public.retencion_entes (id) on delete restrict,
  ruta             text not null check (ruta like 'entes/%'),   -- ruta dentro del bucket retenciones-logos
  nombre_archivo   text,
  desde            date not null default current_date,
  activo           boolean not null default true,
  motivo           text,
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text,
  unique (ente_id, desde)
);
comment on table public.retencion_ente_logos is 'Retenciones: logo de cada ente, por versiones (desde una fecha)';
create trigger trg_retencion_ente_logos_tocar before insert or update on public.retencion_ente_logos
  for each row execute function public.retencion_r1_tocar();

-- 2b) Imágenes de la EMPRESA como agente (logo, firma, sello), con versiones; mismo bucket, carpeta agente/.
create table public.retencion_agente_imagenes (
  id               uuid primary key default gen_random_uuid(),
  clase            text not null check (clase in ('logo', 'firma', 'sello')),
  ruta             text not null check (ruta like 'agente/%'),
  nombre_archivo   text,
  firmante         text,           -- para la firma: nombre y cargo de quien firma
  desde            date not null default current_date,
  activo           boolean not null default true,
  motivo           text,
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text,
  unique (clase, desde)
);
comment on table public.retencion_agente_imagenes is 'Retenciones: logo, firma y sello de la empresa en los comprobantes, por versiones (desde una fecha)';
create trigger trg_retencion_agente_imagenes_tocar before insert or update on public.retencion_agente_imagenes
  for each row execute function public.retencion_r1_tocar();

create function public.retencion_agente_imagen_vigente(p_clase text, p_fecha date)
returns text language sql stable security invoker set search_path = public as $$
  select i.ruta from public.retencion_agente_imagenes i
   where i.clase = p_clase and i.activo and i.desde <= coalesce(p_fecha, current_date)
   order by i.desde desc limit 1;
$$;

-- DELETE solo de un archivo HUÉRFANO (ninguna versión lo usa): limpia la subida cuando falla el insert de la versión.
create policy "retenciones_logos delete huerfano" on storage.objects for delete to authenticated
  using (bucket_id = 'retenciones-logos' and ((select public.is_admin()) or (select public.puede('retenciones')))
         and not exists (select 1 from public.retencion_ente_logos l where l.ruta = storage.objects.name)
         and not exists (select 1 from public.retencion_agente_imagenes i where i.ruta = storage.objects.name));

create function public.retencion_ente_logo_vigente(p_ente uuid, p_fecha date)
returns text language sql stable security invoker set search_path = public as $$
  select l.ruta from public.retencion_ente_logos l
   where l.ente_id = p_ente and l.activo and l.desde <= coalesce(p_fecha, current_date)
   order by l.desde desc limit 1;
$$;

-- 3) Condición del agente por impuesto y fecha
create table public.retencion_agente_condiciones (
  id               uuid primary key default gen_random_uuid(),
  -- Clave del impuesto (los valores de hoy de retenciones.tipo). R2 la convertirá en FK a retencion_impuestos.
  impuesto_clave   text check (impuesto_clave in ('IVA', 'ISLR', 'MUNICIPAL', 'ESTADAL', 'IGTF')),
  condicion        text not null check (condicion in ('agente_retencion', 'agente_percepcion', 'contribuyente_especial')),
  valor            boolean not null,
  desde            date not null,
  hasta            date,
  motivo           text not null check (length(btrim(motivo)) > 0),
  fuente           text,           -- providencia o acto que designa
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text,
  check (hasta is null or hasta >= desde),
  -- «especial» es de la empresa, no de un impuesto; las otras dos, de un impuesto
  check ((condicion = 'contribuyente_especial') = (impuesto_clave is null))
);
create unique index retencion_agente_condiciones_desde on public.retencion_agente_condiciones
  (coalesce(impuesto_clave, '*'), condicion, desde);
comment on table public.retencion_agente_condiciones is 'Retenciones: condición de la empresa por impuesto (agente, especial, percepción) con vigencia';
create trigger trg_retencion_agente_condiciones_tocar before insert or update on public.retencion_agente_condiciones
  for each row execute function public.retencion_r1_tocar();

-- La condición vigente en una fecha; si no hay ninguna para esa fecha, la marca del JSON de hoy (convivencia).
create function public.retencion_agente_condicion(p_impuesto text, p_condicion text, p_fecha date)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v boolean; clave text;
begin
  select c.valor into v from public.retencion_agente_condiciones c
   where coalesce(c.impuesto_clave, '*') = coalesce(upper(p_impuesto), '*') and c.condicion = p_condicion
     and c.desde <= coalesce(p_fecha, current_date)
     and (c.hasta is null or c.hasta >= coalesce(p_fecha, current_date))
   order by c.desde desc limit 1;
  if found then return v; end if;
  clave := case when p_condicion = 'contribuyente_especial' then 'contribuyente_especial'
                when p_condicion = 'agente_retencion' and upper(p_impuesto) = 'IVA' then 'agente_retencion_iva' end;
  if clave is null then return false; end if;
  select coalesce((value ->> clave)::boolean, false) into v from public.config where key = 'retenciones.parametros';
  return coalesce(v, false);
end $$;
revoke execute on function public.retencion_agente_condicion(text, text, date) from public, anon;
grant execute on function public.retencion_agente_condicion(text, text, date) to authenticated, service_role;

-- Convivencia: el valor vigente HOY se copia a las marcas del JSON que lee el código de hoy.
create function public.retencion_agente_condiciones_al_json()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.config
     set value = jsonb_set(jsonb_set(value,
                   '{agente_retencion_iva}', to_jsonb(public.retencion_agente_condicion('IVA', 'agente_retencion', current_date))),
                   '{contribuyente_especial}', to_jsonb(public.retencion_agente_condicion(null, 'contribuyente_especial', current_date))),
         updated_by = 'retencion_agente_condiciones (R1)',
         updated_at = now()
   where key = 'retenciones.parametros';
  return null;
end $$;
revoke execute on function public.retencion_agente_condiciones_al_json() from public, anon, authenticated;
create trigger trg_retencion_agente_condiciones_al_json after insert or update on public.retencion_agente_condiciones
  for each statement execute function public.retencion_agente_condiciones_al_json();

-- Carga inicial: los valores de HOY del JSON (no cambia ninguna decisión).
insert into public.retencion_agente_condiciones (impuesto_clave, condicion, valor, desde, motivo)
select 'IVA', 'agente_retencion', coalesce((value ->> 'agente_retencion_iva')::boolean, false), current_date,
       'Carga inicial R1 desde Parámetros (valor vigente al aplicar). La fecha real de la designación la confirma el usuario.'
  from public.config where key = 'retenciones.parametros';
insert into public.retencion_agente_condiciones (impuesto_clave, condicion, valor, desde, motivo)
select null, 'contribuyente_especial', coalesce((value ->> 'contribuyente_especial')::boolean, false), current_date,
       'Carga inicial R1 desde Parámetros (valor vigente al aplicar). La fecha real la confirma el usuario.'
  from public.config where key = 'retenciones.parametros';

-- 4) El trigger del régimen lee la condición a la fecha de la retención (mismos mensajes que hoy)
create or replace function public.retencion_agente_valido()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  especial boolean;
  agente_iva boolean;
  f date := coalesce(new.factura_fecha, new.fecha, current_date);
begin
  if new.rol <> 'practicada' or new.tipo not in ('IVA', 'IGTF') then
    return new;
  end if;

  especial := public.retencion_agente_condicion(null, 'contribuyente_especial', f);
  agente_iva := public.retencion_agente_condicion('IVA', 'agente_retencion', f);

  if coalesce(especial, false) then
    return new;
  end if;
  -- IVA: basta con estar designada agente de retención de IVA.
  if new.tipo = 'IVA' and coalesce(agente_iva, false) then
    return new;
  end if;

  raise exception using
    errcode = 'check_violation',
    message = case when new.tipo = 'IVA'
      then 'La empresa no puede retener IVA: no está marcada como agente de retención de IVA.'
      else 'La empresa no puede percibir IGTF: no está designada contribuyente especial.' end,
    hint = 'Si te la practicaron a vos, registrala como «Nos la practicaron». '
        || 'Si el SENIAT designó a la empresa, marcá la casilla en Parámetros fiscales.';
end $$;

-- 5) Perfil fiscal del proveedor, con vigencia
create table public.retencion_contraparte_perfiles (
  id                     uuid primary key default gen_random_uuid(),
  proveedor_id           uuid not null references public.proveedores (id) on delete restrict,
  tipo_persona           text not null check (tipo_persona in ('natural', 'juridica')),
  residente              boolean not null default true,   -- residente (PN) o domiciliada (PJ)
  sujeto                 text generated always as (
                           case when tipo_persona = 'natural' then case when residente then 'PNR' else 'PNNR' end
                                else case when residente then 'PJD' else 'PJND' end end) stored,
  tipo_contribuyente     text not null default 'ordinario' check (tipo_contribuyente in ('ordinario', 'especial', 'formal')),
  es_agente_retencion    boolean not null default false,  -- la contraparte retiene IVA (sirve para las recibidas)
  licencia_tipo          text,           -- texto hasta que «Tipos de licencia» tenga tabla
  licencia_numero        text,
  licencia_estado        text not null default 'por_solicitar'
                           check (licencia_estado in ('por_solicitar', 'solicitada', 'vigente', 'vencida', 'no_aplica')),
  licencia_vence         date,
  licencia_ente_id       uuid references public.retencion_entes (id) on delete restrict,   -- alcaldía que la emite
  datos_solicitados_en   timestamptz,
  observacion            text,
  motivo                 text,           -- por qué cambió (versión nueva)
  desde                  date not null default current_date,
  hasta                  date,
  created_at             timestamptz not null default now(),
  actualizado_en         timestamptz not null default now(),
  actualizado_por        text,
  check (hasta is null or hasta >= desde),
  check (licencia_estado <> 'vigente' or nullif(btrim(licencia_numero), '') is not null)
);
create unique index retencion_contraparte_perfiles_abierto on public.retencion_contraparte_perfiles (proveedor_id) where hasta is null;
create unique index retencion_contraparte_perfiles_desde on public.retencion_contraparte_perfiles (proveedor_id, desde);
comment on table public.retencion_contraparte_perfiles is 'Retenciones: perfil fiscal del proveedor, con vigencia (cada cambio de fondo es una versión)';

-- Una versión nueva cierra la abierta el día antes; no se puede abrir una versión anterior a la abierta.
create function public.retencion_contraparte_perfiles_versionar()
returns trigger language plpgsql security definer set search_path = public as $$
declare abierta public.retencion_contraparte_perfiles;
begin
  select * into abierta from public.retencion_contraparte_perfiles
   where proveedor_id = new.proveedor_id and hasta is null for update;
  if found then
    if new.desde <= abierta.desde then
      raise exception using errcode = 'P0001',
        message = 'RET_PERFIL_DESDE: la versión nueva tiene que empezar después del ' || to_char(abierta.desde, 'DD/MM/YYYY') || '.';
    end if;
    update public.retencion_contraparte_perfiles set hasta = new.desde - 1 where id = abierta.id;
  end if;
  return new;
end $$;
revoke execute on function public.retencion_contraparte_perfiles_versionar() from public, anon, authenticated;
create trigger trg_retencion_contraparte_perfiles_versionar before insert on public.retencion_contraparte_perfiles
  for each row execute function public.retencion_contraparte_perfiles_versionar();
create trigger trg_retencion_contraparte_perfiles_tocar before insert or update on public.retencion_contraparte_perfiles
  for each row execute function public.retencion_r1_tocar();

-- 6) Actividades económicas del proveedor (N). Cada fila lleva la CIIU (catálogo de Compras, actividades_economicas)
--    y/o el código de la ORDENANZA de un ente municipal (la que da la alícuota del ISAE; texto hasta R4, que añade la FK).
create table public.retencion_contraparte_actividades (
  id                uuid primary key default gen_random_uuid(),
  proveedor_id      uuid not null references public.proveedores (id) on delete restrict,
  ciiu_codigo       text references public.actividades_economicas (codigo) on delete restrict,
  ente_id           uuid references public.retencion_entes (id) on delete restrict,
  ordenanza_codigo  text check (ordenanza_codigo is null or length(btrim(ordenanza_codigo)) > 0),
  descripcion       text,
  principal         boolean not null default false,
  desde             date not null default current_date,
  hasta             date,
  activa            boolean not null default true,
  nota              text,
  created_at        timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  actualizado_por   text,
  check (hasta is null or hasta >= desde),
  check (ciiu_codigo is not null or ordenanza_codigo is not null),
  check ((ordenanza_codigo is null) = (ente_id is null))
);
create unique index retencion_contraparte_actividades_unica on public.retencion_contraparte_actividades
  (proveedor_id, coalesce(ciiu_codigo, ''), coalesce(ente_id::text, ''), coalesce(ordenanza_codigo, '')) where activa;
create unique index retencion_contraparte_actividades_principal on public.retencion_contraparte_actividades
  (proveedor_id) where activa and principal;
comment on table public.retencion_contraparte_actividades is 'Retenciones: las N actividades económicas de cada proveedor (CIIU y/o código de la ordenanza del municipio)';
create trigger trg_retencion_contraparte_actividades_tocar before insert or update on public.retencion_contraparte_actividades
  for each row execute function public.retencion_r1_tocar();

-- 6b) «Perfil completo»: una sola regla, en la base. faltan = lo que falta; completo = no falta nada.
--     perfil: sin versión vigente hoy · actividad: ninguna activa · licencia_vencida: estado «vencida», o «vigente» con
--     vence < hoy. «por_solicitar», «solicitada» y «no_aplica» cuentan como licencia cargada (la pantalla las marca aparte).
create view public.retencion_contraparte_estado with (security_invoker = true) as
select pr.id as proveedor_id,
       p.id as perfil_id,
       p.sujeto,
       p.tipo_contribuyente,
       p.licencia_estado,
       p.licencia_vence,
       (select count(*) from public.retencion_contraparte_actividades a
         where a.proveedor_id = pr.id and a.activa and (a.hasta is null or a.hasta >= current_date))::int as actividades,
       f.faltan,
       cardinality(f.faltan) = 0 as completo
  from public.proveedores pr
  left join public.retencion_contraparte_perfiles p
    on p.proveedor_id = pr.id and p.desde <= current_date and (p.hasta is null or p.hasta >= current_date)
  cross join lateral (select array_remove(array[
         case when p.id is null then 'perfil' end,
         case when not exists (select 1 from public.retencion_contraparte_actividades a
                                where a.proveedor_id = pr.id and a.activa and (a.hasta is null or a.hasta >= current_date))
              then 'actividad' end,
         case when p.licencia_estado = 'vencida' or (p.licencia_estado = 'vigente' and p.licencia_vence < current_date)
              then 'licencia_vencida' end
       ], null) as faltan) f;
comment on view public.retencion_contraparte_estado is 'Retenciones: si el perfil fiscal de cada proveedor está completo hoy y qué le falta';
revoke all on public.retencion_contraparte_estado from anon;

-- 7) RLS: lee cualquier autenticada; escribe puede('retenciones') (o admin); nadie borra.
do $$
declare t text;
begin
  foreach t in array array['retencion_entes', 'retencion_ente_impuestos', 'retencion_ente_logos', 'retencion_agente_imagenes', 'retencion_agente_condiciones',
                           'retencion_contraparte_perfiles', 'retencion_contraparte_actividades'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate, references, trigger on public.%I from authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()) or (select public.puede(''retenciones'')))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin()) or (select public.puede(''retenciones''))) with check ((select public.is_admin()) or (select public.puede(''retenciones'')))', t || '_update', t);
  end loop;
end $$;

alter publication supabase_realtime add table public.retencion_entes, public.retencion_ente_impuestos, public.retencion_ente_logos, public.retencion_agente_imagenes,
  public.retencion_agente_condiciones, public.retencion_contraparte_perfiles, public.retencion_contraparte_actividades;
$sql_gt$],
   coalesce(nullif(auth.email(), ''), nullif(current_setting('request.jwt.claim.email', true), ''), session_user::text));


INSERT INTO public.retencion_entes (nombre, tipo, estado, municipio, motivo) VALUES
  ('Alcaldía del Municipio Piar', 'municipal', 'Bolívar', 'Piar', 'Semilla La Cantera (ISAE Upata/Piar)')
ON CONFLICT DO NOTHING;

INSERT INTO public.retencion_entes (nombre, tipo, estado, motivo) VALUES
  ('Gobernación del Estado Bolívar', 'estadal', 'Bolívar', 'Semilla La Cantera (Timbre Fiscal Bolívar)')
ON CONFLICT DO NOTHING;


-- R2 · 2 de 13 · gt_retencion_impuestos · migración gt_retencion_impuestos, versión 20261020100002

-- ── Guarda: solo sigue si la base está justo antes de R2 (si no, se detiene sin escribir nada) ──


-- 3) Historial genérico (va primero: lo usan los triggers de 1 y 2)
create table public.retencion_historial (
  id       bigint generated always as identity primary key,
  tabla    text not null,
  clave    text not null,
  antes    jsonb,
  despues  jsonb,
  motivo   text,
  actor    text,
  at       timestamptz not null default now()
);
create index retencion_historial_clave_idx on public.retencion_historial (tabla, clave, at desc);
comment on table public.retencion_historial is 'Retenciones: cada alta y cambio de impuestos y sus versiones, con motivo, quién y cuándo';

-- 1) Impuestos
create table public.retencion_impuestos (
  clave                      text primary key check (clave ~ '^[A-Z][A-Z0-9_]{1,29}$'),
  nombre                     text not null check (length(btrim(nombre)) >= 2),
  ente_id                    uuid references public.retencion_entes (id) on delete restrict,
  admite_practicada          boolean not null default true,
  admite_sufrida             boolean not null default true,
  numera                     boolean not null default true,
  -- AAAAMM8 = 14 dígitos (AAAAMM + 8; el IVA); N10 = 10 dígitos continuos.
  serie_formato              text check (serie_formato in ('AAAAMM8', 'N10')),
  -- automatica: el sistema da el número (editable); manual: lo da el otro sistema.
  serie_modo                 text not null default 'automatica' check (serie_modo in ('automatica', 'manual')),
  serie_inicial              bigint not null default 1 check (serie_inicial >= 1),
  serie_ultimo_otro_sistema  bigint check (serie_ultimo_otro_sistema is null or serie_ultimo_otro_sistema >= 0),
  numera_operacion           boolean not null default false,   -- «Operación N°» (ISAE)
  agrupa                     boolean not null default false,   -- «Agrupar comprobantes»
  exporta                    text not null default 'ninguno' check (exporta in ('txt', 'xml', 'planilla', 'ninguno')),
  orden                      smallint not null default 0,
  activo                     boolean not null default true,
  motivo_cambio              text,    -- motivo de ESTE cambio: la base lo pasa al historial y lo vacía
  created_at                 timestamptz not null default now(),
  actualizado_en             timestamptz not null default now(),
  actualizado_por            text,
  check (admite_practicada or admite_sufrida),
  check (not numera or serie_formato is not null)
);
comment on table public.retencion_impuestos is 'Retenciones: el impuesto como contenedor (ente, serie, exportación); lo que cambia con el tiempo va en retencion_impuesto_versiones';

-- 2) Versiones
create table public.retencion_impuesto_versiones (
  id                       uuid primary key default gen_random_uuid(),
  impuesto_clave           text not null references public.retencion_impuestos (clave) on delete restrict,
  desde                    date not null,
  hasta                    date,
  periodicidad             text not null check (periodicidad in ('quincenal', 'mensual', 'anual')),
  vence_dia                smallint check (vence_dia between 1 and 31),
  vence_si_inhabil         text not null default 'siguiente_habil' check (vence_si_inhabil in ('siguiente_habil', 'anterior_habil', 'igual')),
  plazo_entrega_dias       smallint not null default 2 check (plazo_entrega_dias between 0 and 60),
  plazo_dias_habiles       boolean not null default true,    -- lunes a viernes, sin feriados (D25)
  convive                  boolean not null default false,
  otro_sistema_nombre      text,
  otro_sistema_en_totales  boolean not null default false,
  base_legal               text,
  fuente                   text,
  motivo                   text not null check (length(btrim(motivo)) > 0),
  created_at               timestamptz not null default now(),
  actualizado_en           timestamptz not null default now(),
  actualizado_por          text,
  check (hasta is null or hasta >= desde),
  check (not convive or nullif(btrim(otro_sistema_nombre), '') is not null)
);
create unique index retencion_impuesto_versiones_desde on public.retencion_impuesto_versiones (impuesto_clave, desde);
create unique index retencion_impuesto_versiones_abierta on public.retencion_impuesto_versiones (impuesto_clave) where hasta is null;
comment on table public.retencion_impuesto_versiones is 'Retenciones: periodicidad, vencimiento, plazo de entrega, convivencia y base legal de cada impuesto, con vigencia';

-- Quién y cuándo + historial (lo pone la base). Para impuestos, además, la regla de la serie inicial.
create function public.retencion_r2_anotar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  quien text := coalesce(auth.jwt() ->> 'email', current_user);
  j jsonb := to_jsonb(new);
begin
  if tg_table_name = 'retencion_impuestos' then
    if new.serie_ultimo_otro_sistema is not null and new.serie_inicial <= new.serie_ultimo_otro_sistema then
      raise exception using errcode = 'P0001',
        message = 'RET_SERIE_INICIAL: el primer número de ' || new.clave || ' tiene que ser mayor que el último del otro sistema ('
               || new.serie_ultimo_otro_sistema || ').';
    end if;
  end if;
  new.actualizado_en := now();
  new.actualizado_por := quien;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  insert into public.retencion_historial (tabla, clave, antes, despues, motivo, actor)
  values (tg_table_name,
          coalesce(j ->> 'clave', j ->> 'impuesto_clave'),
          case when tg_op = 'UPDATE' then to_jsonb(old) - 'motivo_cambio' - 'actualizado_en' - 'actualizado_por' end,
          j - 'motivo_cambio' - 'actualizado_en' - 'actualizado_por',
          coalesce(j ->> 'motivo_cambio', j ->> 'motivo'),
          quien);
  if tg_table_name = 'retencion_impuestos' then
    new.motivo_cambio := null;   -- el motivo vale para ESTE cambio
  end if;
  return new;
end $$;
revoke execute on function public.retencion_r2_anotar() from public, anon, authenticated;

create trigger trg_retencion_impuestos_anotar before insert or update on public.retencion_impuestos
  for each row execute function public.retencion_r2_anotar();
create trigger trg_retencion_impuesto_versiones_anotar before insert or update on public.retencion_impuesto_versiones
  for each row execute function public.retencion_r2_anotar();

-- Una versión nueva cierra la abierta el día antes; no se abre una versión anterior o igual a la abierta.
create function public.retencion_impuesto_versiones_versionar()
returns trigger language plpgsql security definer set search_path = public as $$
declare abierta public.retencion_impuesto_versiones;
begin
  select * into abierta from public.retencion_impuesto_versiones
   where impuesto_clave = new.impuesto_clave and hasta is null for update;
  if found then
    if new.desde <= abierta.desde then
      raise exception using errcode = 'P0001',
        message = 'RET_VERSION_DESDE: la versión nueva de ' || new.impuesto_clave || ' tiene que empezar después del '
               || to_char(abierta.desde, 'DD/MM/YYYY') || '. Para corregir la vigente, edítela.';
    end if;
    update public.retencion_impuesto_versiones set hasta = new.desde - 1 where id = abierta.id;
  end if;
  return new;
end $$;
revoke execute on function public.retencion_impuesto_versiones_versionar() from public, anon, authenticated;
-- «zz»: corre después de anotar (los BEFORE corren por orden alfabético).
create trigger trg_retencion_impuesto_versiones_zz_versionar before insert on public.retencion_impuesto_versiones
  for each row execute function public.retencion_impuesto_versiones_versionar();

-- 4) Funciones de lectura
-- La versión vigente en una fecha; si la fecha es anterior a la primera versión, la primera.
create function public.retencion_impuesto_version(p_clave text, p_fecha date)
returns public.retencion_impuesto_versiones language plpgsql stable security invoker set search_path = public as $$
declare v public.retencion_impuesto_versiones;
begin
  select * into v from public.retencion_impuesto_versiones
   where impuesto_clave = upper(p_clave) and desde <= coalesce(p_fecha, current_date)
   order by desde desc limit 1;
  if not found then
    select * into v from public.retencion_impuesto_versiones
     where impuesto_clave = upper(p_clave) order by desde asc limit 1;
  end if;
  return v;
end $$;

-- Suma días hábiles: lunes a viernes, sin feriados (D25).
create function public.retencion_dias_habiles_sumar(p_fecha date, p_dias int)
returns date language plpgsql immutable set search_path = public as $$
declare d date := p_fecha; n int := 0;
begin
  if p_fecha is null or coalesce(p_dias, 0) <= 0 then return p_fecha; end if;
  while n < p_dias loop
    d := d + 1;
    if extract(isodow from d) < 6 then n := n + 1; end if;
  end loop;
  return d;
end $$;

-- Fecha límite para entregar el comprobante: la fecha de la factura + el plazo de la versión vigente.
create function public.retencion_plazo_entrega(p_clave text, p_fecha date)
returns date language plpgsql stable security invoker set search_path = public as $$
declare v public.retencion_impuesto_versiones := public.retencion_impuesto_version(p_clave, p_fecha);
begin
  if v.id is null or p_fecha is null then return null; end if;
  if v.plazo_dias_habiles then return public.retencion_dias_habiles_sumar(p_fecha, v.plazo_entrega_dias); end if;
  return p_fecha + v.plazo_entrega_dias;
end $$;

revoke execute on function public.retencion_impuesto_version(text, date) from public, anon;
revoke execute on function public.retencion_dias_habiles_sumar(date, int) from public, anon;
revoke execute on function public.retencion_plazo_entrega(text, date) from public, anon;
grant execute on function public.retencion_impuesto_version(text, date) to authenticated, service_role;
grant execute on function public.retencion_dias_habiles_sumar(date, int) to authenticated, service_role;
grant execute on function public.retencion_plazo_entrega(text, date) to authenticated, service_role;

-- Arranque (valores de V1, a confirmar por el usuario). El ente sale del puente de R1 (el primero activo).
insert into public.retencion_impuestos
  (clave, nombre, ente_id, numera, serie_formato, numera_operacion, exporta, orden, motivo_cambio)
select v.clave, v.nombre,
       (select b.ente_id from public.retencion_ente_impuestos b
         where b.impuesto_clave = v.clave and b.activo order by b.desde, b.created_at limit 1),
       v.numera, v.formato, v.operacion, v.exporta, v.orden, 'Valor de arranque (R2; antes V1). A confirmar por el usuario.'
  from (values ('IVA',       'IVA',     true,  'AAAAMM8', false, 'txt',      1),
               ('ISLR',      'ISLR',    true,  'N10',     false, 'xml',      2),
               ('MUNICIPAL', 'ISAE',    true,  'N10',     true,  'planilla', 3),
               ('ESTADAL',   'Estadal', true,  'N10',     false, 'planilla', 4),
               ('IGTF',      'IGTF',    false, null,      false, 'ninguno',  5))
       as v (clave, nombre, numera, formato, operacion, exporta, orden);

insert into public.retencion_impuesto_versiones (impuesto_clave, desde, periodicidad, motivo, fuente)
select v.clave, current_date, v.periodicidad,
       'Valor de arranque (R2; antes V1). Vale también para fechas anteriores. A confirmar por el usuario.',
       'Valores de arranque de V1 (14/10)'
  from (values ('IVA', 'quincenal'), ('ISLR', 'mensual'), ('MUNICIPAL', 'mensual'), ('ESTADAL', 'mensual'), ('IGTF', 'mensual'))
       as v (clave, periodicidad);

-- 5) FK nuevas, sin quitar los CHECK de hoy (los 5 valores ya están en retencion_impuestos).
alter table public.retenciones
  add constraint retenciones_tipo_impuesto_fk foreign key (tipo) references public.retencion_impuestos (clave) on delete restrict;
alter table public.retencion_agente_condiciones
  add constraint retencion_agente_condiciones_impuesto_fk foreign key (impuesto_clave) references public.retencion_impuestos (clave) on delete restrict;
alter table public.retencion_ente_impuestos
  add constraint retencion_ente_impuestos_impuesto_fk foreign key (impuesto_clave) references public.retencion_impuestos (clave) on delete restrict;
create index retenciones_tipo_idx on public.retenciones (tipo);

-- 6) El puente de R1 queda en solo lectura (el ente de cada impuesto es retencion_impuestos.ente_id).
drop policy retencion_ente_impuestos_insert on public.retencion_ente_impuestos;
drop policy retencion_ente_impuestos_update on public.retencion_ente_impuestos;
comment on table public.retencion_ente_impuestos is 'Retenciones: SOLO LECTURA desde R2 (el ente de cada impuesto es retencion_impuestos.ente_id); se retira en la contracción';

-- 7) RLS
alter table public.retencion_impuestos enable row level security;
alter table public.retencion_impuesto_versiones enable row level security;
alter table public.retencion_historial enable row level security;
revoke all on public.retencion_impuestos, public.retencion_impuesto_versiones, public.retencion_historial from anon;
revoke delete, truncate, references, trigger on public.retencion_impuestos, public.retencion_impuesto_versiones from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.retencion_historial from authenticated;

create policy retencion_impuestos_read on public.retencion_impuestos for select to authenticated using (true);
create policy retencion_impuestos_insert on public.retencion_impuestos for insert to authenticated
  with check ((select public.is_admin()) or (select public.puede('retenciones')));
create policy retencion_impuestos_update on public.retencion_impuestos for update to authenticated
  using ((select public.is_admin()) or (select public.puede('retenciones')))
  with check ((select public.is_admin()) or (select public.puede('retenciones')));

create policy retencion_impuesto_versiones_read on public.retencion_impuesto_versiones for select to authenticated using (true);
create policy retencion_impuesto_versiones_insert on public.retencion_impuesto_versiones for insert to authenticated
  with check ((select public.is_admin()) or (select public.puede('retenciones')));
create policy retencion_impuesto_versiones_update on public.retencion_impuesto_versiones for update to authenticated
  using ((select public.is_admin()) or (select public.puede('retenciones')))
  with check ((select public.is_admin()) or (select public.puede('retenciones')));

create policy retencion_historial_read on public.retencion_historial for select to authenticated using (true);

alter publication supabase_realtime add table public.retencion_impuestos, public.retencion_impuesto_versiones;

-- ── Registro de esta migración, con su SQL completo (mismo bloque: si algo de arriba falla, no queda) ──

create index retencion_historial_clave_idx on public.retencion_historial (tabla, clave, at desc);
comment on table public.retencion_historial is 'Retenciones: cada alta y cambio de impuestos y sus versiones, con motivo, quién y cuándo';

-- 1) Impuestos
create table public.retencion_impuestos (
  clave                      text primary key check (clave ~ '^[A-Z][A-Z0-9_]{1,29}$'),
  nombre                     text not null check (length(btrim(nombre)) >= 2),
  ente_id                    uuid references public.retencion_entes (id) on delete restrict,
  admite_practicada          boolean not null default true,
  admite_sufrida             boolean not null default true,
  numera                     boolean not null default true,
  -- AAAAMM8 = 14 dígitos (AAAAMM + 8; el IVA); N10 = 10 dígitos continuos.
  serie_formato              text check (serie_formato in ('AAAAMM8', 'N10')),
  -- automatica: el sistema da el número (editable); manual: lo da el otro sistema.
  serie_modo                 text not null default 'automatica' check (serie_modo in ('automatica', 'manual')),
  serie_inicial              bigint not null default 1 check (serie_inicial >= 1),
  serie_ultimo_otro_sistema  bigint check (serie_ultimo_otro_sistema is null or serie_ultimo_otro_sistema >= 0),
  numera_operacion           boolean not null default false,   -- «Operación N°» (ISAE)
  agrupa                     boolean not null default false,   -- «Agrupar comprobantes»
  exporta                    text not null default 'ninguno' check (exporta in ('txt', 'xml', 'planilla', 'ninguno')),
  orden                      smallint not null default 0,
  activo                     boolean not null default true,
  motivo_cambio              text,    -- motivo de ESTE cambio: la base lo pasa al historial y lo vacía
  created_at                 timestamptz not null default now(),
  actualizado_en             timestamptz not null default now(),
  actualizado_por            text,
  check (admite_practicada or admite_sufrida),
  check (not numera or serie_formato is not null)
);
comment on table public.retencion_impuestos is 'Retenciones: el impuesto como contenedor (ente, serie, exportación); lo que cambia con el tiempo va en retencion_impuesto_versiones';

-- 2) Versiones
create table public.retencion_impuesto_versiones (
  id                       uuid primary key default gen_random_uuid(),
  impuesto_clave           text not null references public.retencion_impuestos (clave) on delete restrict,
  desde                    date not null,
  hasta                    date,
  periodicidad             text not null check (periodicidad in ('quincenal', 'mensual', 'anual')),
  vence_dia                smallint check (vence_dia between 1 and 31),
  vence_si_inhabil         text not null default 'siguiente_habil' check (vence_si_inhabil in ('siguiente_habil', 'anterior_habil', 'igual')),
  plazo_entrega_dias       smallint not null default 2 check (plazo_entrega_dias between 0 and 60),
  plazo_dias_habiles       boolean not null default true,    -- lunes a viernes, sin feriados (D25)
  convive                  boolean not null default false,
  otro_sistema_nombre      text,
  otro_sistema_en_totales  boolean not null default false,
  base_legal               text,
  fuente                   text,
  motivo                   text not null check (length(btrim(motivo)) > 0),
  created_at               timestamptz not null default now(),
  actualizado_en           timestamptz not null default now(),
  actualizado_por          text,
  check (hasta is null or hasta >= desde),
  check (not convive or nullif(btrim(otro_sistema_nombre), '') is not null)
);
create unique index retencion_impuesto_versiones_desde on public.retencion_impuesto_versiones (impuesto_clave, desde);
create unique index retencion_impuesto_versiones_abierta on public.retencion_impuesto_versiones (impuesto_clave) where hasta is null;
comment on table public.retencion_impuesto_versiones is 'Retenciones: periodicidad, vencimiento, plazo de entrega, convivencia y base legal de cada impuesto, con vigencia';

-- Quién y cuándo + historial (lo pone la base). Para impuestos, además, la regla de la serie inicial.
create function public.retencion_r2_anotar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  quien text := coalesce(auth.jwt() ->> 'email', current_user);
  j jsonb := to_jsonb(new);
begin
  if tg_table_name = 'retencion_impuestos' then
    if new.serie_ultimo_otro_sistema is not null and new.serie_inicial <= new.serie_ultimo_otro_sistema then
      raise exception using errcode = 'P0001',
        message = 'RET_SERIE_INICIAL: el primer número de ' || new.clave || ' tiene que ser mayor que el último del otro sistema ('
               || new.serie_ultimo_otro_sistema || ').';
    end if;
  end if;
  new.actualizado_en := now();
  new.actualizado_por := quien;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  insert into public.retencion_historial (tabla, clave, antes, despues, motivo, actor)
  values (tg_table_name,
          coalesce(j ->> 'clave', j ->> 'impuesto_clave'),
          case when tg_op = 'UPDATE' then to_jsonb(old) - 'motivo_cambio' - 'actualizado_en' - 'actualizado_por' end,
          j - 'motivo_cambio' - 'actualizado_en' - 'actualizado_por',
          coalesce(j ->> 'motivo_cambio', j ->> 'motivo'),
          quien);
  if tg_table_name = 'retencion_impuestos' then
    new.motivo_cambio := null;   -- el motivo vale para ESTE cambio
  end if;
  return new;
end $$;
revoke execute on function public.retencion_r2_anotar() from public, anon, authenticated;

create trigger trg_retencion_impuestos_anotar before insert or update on public.retencion_impuestos
  for each row execute function public.retencion_r2_anotar();
create trigger trg_retencion_impuesto_versiones_anotar before insert or update on public.retencion_impuesto_versiones
  for each row execute function public.retencion_r2_anotar();

-- Una versión nueva cierra la abierta el día antes; no se abre una versión anterior o igual a la abierta.
create function public.retencion_impuesto_versiones_versionar()
returns trigger language plpgsql security definer set search_path = public as $$
declare abierta public.retencion_impuesto_versiones;
begin
  select * into abierta from public.retencion_impuesto_versiones
   where impuesto_clave = new.impuesto_clave and hasta is null for update;
  if found then
    if new.desde <= abierta.desde then
      raise exception using errcode = 'P0001',
        message = 'RET_VERSION_DESDE: la versión nueva de ' || new.impuesto_clave || ' tiene que empezar después del '
               || to_char(abierta.desde, 'DD/MM/YYYY') || '. Para corregir la vigente, edítela.';
    end if;
    update public.retencion_impuesto_versiones set hasta = new.desde - 1 where id = abierta.id;
  end if;
  return new;
end $$;
revoke execute on function public.retencion_impuesto_versiones_versionar() from public, anon, authenticated;
-- «zz»: corre después de anotar (los BEFORE corren por orden alfabético).
create trigger trg_retencion_impuesto_versiones_zz_versionar before insert on public.retencion_impuesto_versiones
  for each row execute function public.retencion_impuesto_versiones_versionar();

-- 4) Funciones de lectura
-- La versión vigente en una fecha; si la fecha es anterior a la primera versión, la primera.
create function public.retencion_impuesto_version(p_clave text, p_fecha date)
returns public.retencion_impuesto_versiones language plpgsql stable security invoker set search_path = public as $$
declare v public.retencion_impuesto_versiones;
begin
  select * into v from public.retencion_impuesto_versiones
   where impuesto_clave = upper(p_clave) and desde <= coalesce(p_fecha, current_date)
   order by desde desc limit 1;
  if not found then
    select * into v from public.retencion_impuesto_versiones
     where impuesto_clave = upper(p_clave) order by desde asc limit 1;
  end if;
  return v;
end $$;

-- Suma días hábiles: lunes a viernes, sin feriados (D25).
create function public.retencion_dias_habiles_sumar(p_fecha date, p_dias int)
returns date language plpgsql immutable set search_path = public as $$
declare d date := p_fecha; n int := 0;
begin
  if p_fecha is null or coalesce(p_dias, 0) <= 0 then return p_fecha; end if;
  while n < p_dias loop
    d := d + 1;
    if extract(isodow from d) < 6 then n := n + 1; end if;
  end loop;
  return d;
end $$;

-- Fecha límite para entregar el comprobante: la fecha de la factura + el plazo de la versión vigente.
create function public.retencion_plazo_entrega(p_clave text, p_fecha date)
returns date language plpgsql stable security invoker set search_path = public as $$
declare v public.retencion_impuesto_versiones := public.retencion_impuesto_version(p_clave, p_fecha);
begin
  if v.id is null or p_fecha is null then return null; end if;
  if v.plazo_dias_habiles then return public.retencion_dias_habiles_sumar(p_fecha, v.plazo_entrega_dias); end if;
  return p_fecha + v.plazo_entrega_dias;
end $$;

revoke execute on function public.retencion_impuesto_version(text, date) from public, anon;
revoke execute on function public.retencion_dias_habiles_sumar(date, int) from public, anon;
revoke execute on function public.retencion_plazo_entrega(text, date) from public, anon;
grant execute on function public.retencion_impuesto_version(text, date) to authenticated, service_role;
grant execute on function public.retencion_dias_habiles_sumar(date, int) to authenticated, service_role;
grant execute on function public.retencion_plazo_entrega(text, date) to authenticated, service_role;

-- Arranque (valores de V1, a confirmar por el usuario). El ente sale del puente de R1 (el primero activo).
insert into public.retencion_impuestos
  (clave, nombre, ente_id, numera, serie_formato, numera_operacion, exporta, orden, motivo_cambio)
select v.clave, v.nombre,
       (select b.ente_id from public.retencion_ente_impuestos b
         where b.impuesto_clave = v.clave and b.activo order by b.desde, b.created_at limit 1),
       v.numera, v.formato, v.operacion, v.exporta, v.orden, 'Valor de arranque (R2; antes V1). A confirmar por el usuario.'
  from (values ('IVA',       'IVA',     true,  'AAAAMM8', false, 'txt',      1),
               ('ISLR',      'ISLR',    true,  'N10',     false, 'xml',      2),
               ('MUNICIPAL', 'ISAE',    true,  'N10',     true,  'planilla', 3),
               ('ESTADAL',   'Estadal', true,  'N10',     false, 'planilla', 4),
               ('IGTF',      'IGTF',    false, null,      false, 'ninguno',  5))
       as v (clave, nombre, numera, formato, operacion, exporta, orden);

insert into public.retencion_impuesto_versiones (impuesto_clave, desde, periodicidad, motivo, fuente)
select v.clave, current_date, v.periodicidad,
       'Valor de arranque (R2; antes V1). Vale también para fechas anteriores. A confirmar por el usuario.',
       'Valores de arranque de V1 (14/10)'
  from (values ('IVA', 'quincenal'), ('ISLR', 'mensual'), ('MUNICIPAL', 'mensual'), ('ESTADAL', 'mensual'), ('IGTF', 'mensual'))
       as v (clave, periodicidad);

-- 5) FK nuevas, sin quitar los CHECK de hoy (los 5 valores ya están en retencion_impuestos).
alter table public.retenciones
  add constraint retenciones_tipo_impuesto_fk foreign key (tipo) references public.retencion_impuestos (clave) on delete restrict;
alter table public.retencion_agente_condiciones
  add constraint retencion_agente_condiciones_impuesto_fk foreign key (impuesto_clave) references public.retencion_impuestos (clave) on delete restrict;
alter table public.retencion_ente_impuestos
  add constraint retencion_ente_impuestos_impuesto_fk foreign key (impuesto_clave) references public.retencion_impuestos (clave) on delete restrict;
create index retenciones_tipo_idx on public.retenciones (tipo);

-- 6) El puente de R1 queda en solo lectura (el ente de cada impuesto es retencion_impuestos.ente_id).
drop policy retencion_ente_impuestos_insert on public.retencion_ente_impuestos;
drop policy retencion_ente_impuestos_update on public.retencion_ente_impuestos;
comment on table public.retencion_ente_impuestos is 'Retenciones: SOLO LECTURA desde R2 (el ente de cada impuesto es retencion_impuestos.ente_id); se retira en la contracción';

-- 7) RLS
alter table public.retencion_impuestos enable row level security;
alter table public.retencion_impuesto_versiones enable row level security;
alter table public.retencion_historial enable row level security;
revoke all on public.retencion_impuestos, public.retencion_impuesto_versiones, public.retencion_historial from anon;
revoke delete, truncate, references, trigger on public.retencion_impuestos, public.retencion_impuesto_versiones from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.retencion_historial from authenticated;

create policy retencion_impuestos_read on public.retencion_impuestos for select to authenticated using (true);
create policy retencion_impuestos_insert on public.retencion_impuestos for insert to authenticated
  with check ((select public.is_admin()) or (select public.puede('retenciones')));
create policy retencion_impuestos_update on public.retencion_impuestos for update to authenticated
  using ((select public.is_admin()) or (select public.puede('retenciones')))
  with check ((select public.is_admin()) or (select public.puede('retenciones')));

create policy retencion_impuesto_versiones_read on public.retencion_impuesto_versiones for select to authenticated using (true);
create policy retencion_impuesto_versiones_insert on public.retencion_impuesto_versiones for insert to authenticated
  with check ((select public.is_admin()) or (select public.puede('retenciones')));
create policy retencion_impuesto_versiones_update on public.retencion_impuesto_versiones for update to authenticated
  using ((select public.is_admin()) or (select public.puede('retenciones')))
  with check ((select public.is_admin()) or (select public.puede('retenciones')));

create policy retencion_historial_read on public.retencion_historial for select to authenticated using (true);

alter publication supabase_realtime add table public.retencion_impuestos, public.retencion_impuesto_versiones;
$sql_gt$],
   coalesce(nullif(auth.email(), ''), nullif(current_setting('request.jwt.claim.email', true), ''), session_user::text));

-- R3 · 3 de 13 · gt_retencion_parametros · migración gt_retencion_parametros, versión 20261020100003

-- ── Guarda: solo sigue si la base está justo antes de R3 (si no, se detiene sin escribir nada) ──


-- 1) Catálogo de claves
create table public.retencion_parametro_claves (
  clave            text primary key check (clave ~ '^[a-z][a-z0-9_]{1,40}$'),
  nombre           text not null check (length(btrim(nombre)) >= 2),
  ambito           text not null check (ambito in ('general', 'impuesto')),
  tipo_valor       text not null check (tipo_valor in ('numero', 'texto', 'si_no')),
  unidad           text check (unidad in ('%', 'Bs', 'UT', 'dias')),
  descripcion      text,
  orden            smallint not null default 0,
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text
);
comment on table public.retencion_parametro_claves is 'Retenciones: qué parámetros existen, su ámbito (general o por impuesto) y su tipo de valor';

-- 2) Valores con vigencia
create table public.retencion_parametros (
  id               uuid primary key default gen_random_uuid(),
  impuesto_clave   text references public.retencion_impuestos (clave) on delete restrict,   -- nulo = general
  clave            text not null references public.retencion_parametro_claves (clave) on delete restrict,
  valor            jsonb not null,
  desde            date not null,
  hasta            date,
  fuente           text,
  motivo           text not null check (length(btrim(motivo)) > 0),
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text,
  check (hasta is null or hasta >= desde)
);
create unique index retencion_parametros_desde on public.retencion_parametros (coalesce(impuesto_clave, '*'), clave, desde);
create unique index retencion_parametros_abierto on public.retencion_parametros (coalesce(impuesto_clave, '*'), clave) where hasta is null;
comment on table public.retencion_parametros is 'Retenciones: UT, alícuotas, porcentajes y demás parámetros, con vigencia, fuente y motivo';

-- 3) Tipos de licencia
create table public.retencion_licencia_tipos (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null check (length(btrim(nombre)) >= 2),
  ente_id          uuid references public.retencion_entes (id) on delete restrict,
  activo           boolean not null default true,
  orden            smallint not null default 0,
  nota             text,
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text
);
create unique index retencion_licencia_tipos_nombre on public.retencion_licencia_tipos (lower(btrim(nombre)));
comment on table public.retencion_licencia_tipos is 'Retenciones: catálogo de tipos de licencia (los usa el perfil fiscal de R1)';

-- Quién y cuándo + historial (R2). Solo lee NEW como jsonb: la misma función sirve a las tres tablas.
create function public.retencion_r3_anotar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  quien text := coalesce(auth.jwt() ->> 'email', current_user);
  j jsonb := to_jsonb(new);
begin
  new.actualizado_en := now();
  new.actualizado_por := quien;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  insert into public.retencion_historial (tabla, clave, antes, despues, motivo, actor)
  values (tg_table_name,
          case tg_table_name
            when 'retencion_parametros' then coalesce(j ->> 'impuesto_clave', '*') || ':' || (j ->> 'clave')
            when 'retencion_licencia_tipos' then j ->> 'nombre'
            else j ->> 'clave' end,
          case when tg_op = 'UPDATE' then to_jsonb(old) - 'actualizado_en' - 'actualizado_por' end,
          j - 'actualizado_en' - 'actualizado_por',
          j ->> 'motivo',
          quien);
  return new;
end $$;
revoke execute on function public.retencion_r3_anotar() from public, anon, authenticated;

create trigger trg_retencion_parametro_claves_anotar before insert or update on public.retencion_parametro_claves
  for each row execute function public.retencion_r3_anotar();
create trigger trg_retencion_parametros_anotar before insert or update on public.retencion_parametros
  for each row execute function public.retencion_r3_anotar();
create trigger trg_retencion_licencia_tipos_anotar before insert or update on public.retencion_licencia_tipos
  for each row execute function public.retencion_r3_anotar();

-- Ámbito y tipo del valor (alta y cambio); en el alta, la versión nueva cierra la abierta.
create function public.retencion_parametros_guarda()
returns trigger language plpgsql security definer set search_path = public as $$
declare k public.retencion_parametro_claves; abierta public.retencion_parametros;
begin
  select * into k from public.retencion_parametro_claves where clave = new.clave;
  if not found then return new; end if;   -- la FK la rechaza con su propio error
  if (k.ambito = 'general' and new.impuesto_clave is not null) or (k.ambito = 'impuesto' and new.impuesto_clave is null) then
    raise exception using errcode = 'P0001',
      message = 'RET_PARAMETRO_AMBITO: «' || new.clave || '» es ' || case when k.ambito = 'general' then 'general (sin impuesto).' else 'de un impuesto (indique cuál).' end;
  end if;
  -- (el CASE va entre paréntesis: dentro de un IF, su THEN cortaría la condición)
  if jsonb_typeof(new.valor) is distinct from (case k.tipo_valor when 'numero' then 'number' when 'texto' then 'string' when 'si_no' then 'boolean' end) then
    raise exception using errcode = 'P0001',
      message = 'RET_PARAMETRO_TIPO: «' || new.clave || '» lleva un valor de tipo ' || k.tipo_valor || '.';
  end if;
  if tg_op = 'INSERT' then
    select * into abierta from public.retencion_parametros
     where impuesto_clave is not distinct from new.impuesto_clave and clave = new.clave and hasta is null for update;
    if found then
      if new.desde <= abierta.desde then
        raise exception using errcode = 'P0001',
          message = 'RET_PARAMETRO_DESDE: el valor nuevo de «' || new.clave || '» tiene que empezar después del '
                 || to_char(abierta.desde, 'DD/MM/YYYY') || '. Para corregir el vigente, edítelo.';
      end if;
      update public.retencion_parametros set hasta = new.desde - 1 where id = abierta.id;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.retencion_parametros_guarda() from public, anon, authenticated;
-- «zz»: corre después de anotar (los BEFORE corren por orden alfabético).
create trigger trg_retencion_parametros_zz_guarda before insert or update on public.retencion_parametros
  for each row execute function public.retencion_parametros_guarda();

-- 4) Funciones de lectura
create function public.retencion_parametro(p_impuesto text, p_clave text, p_fecha date)
returns jsonb language sql stable security invoker set search_path = public as $$
  select p.valor from public.retencion_parametros p
   where p.impuesto_clave is not distinct from upper(nullif(p_impuesto, '')) and p.clave = p_clave
     and p.desde <= coalesce(p_fecha, current_date) and (p.hasta is null or p.hasta >= coalesce(p_fecha, current_date))
   order by p.desde desc limit 1;
$$;

create function public.retencion_parametros_vigentes(p_fecha date)
returns table (impuesto_clave text, clave text, nombre text, valor jsonb, unidad text, desde date, fuente text)
language sql stable security invoker set search_path = public as $$
  select p.impuesto_clave, p.clave, k.nombre, p.valor, k.unidad, p.desde, p.fuente
    from public.retencion_parametros p join public.retencion_parametro_claves k on k.clave = p.clave
   where p.desde <= coalesce(p_fecha, current_date) and (p.hasta is null or p.hasta >= coalesce(p_fecha, current_date))
   order by p.impuesto_clave nulls first, k.orden, p.clave;
$$;

revoke execute on function public.retencion_parametro(text, text, date) from public, anon;
revoke execute on function public.retencion_parametros_vigentes(date) from public, anon;
grant execute on function public.retencion_parametro(text, text, date) to authenticated, service_role;
grant execute on function public.retencion_parametros_vigentes(date) to authenticated, service_role;

-- 5) Convivencia: el valor vigente HOY se copia a su clave del JSON (los que no tienen valor hoy no se tocan).
create function public.retencion_parametros_al_json()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.config
     set value = value || jsonb_strip_nulls(jsonb_build_object(
                   'unidad_tributaria',  public.retencion_parametro(null, 'ut', current_date),
                   'iva_alicuota',       public.retencion_parametro('IVA', 'alicuota', current_date),
                   'iva_retencion',      public.retencion_parametro('IVA', 'pct_retencion', current_date),
                   'igtf_alicuota',      public.retencion_parametro('IGTF', 'alicuota', current_date),
                   'municipal_alicuota', public.retencion_parametro('MUNICIPAL', 'alicuota', current_date),
                   'estadal_alicuota',   public.retencion_parametro('ESTADAL', 'alicuota', current_date))),
         updated_by = 'retencion_parametros (R3)',
         updated_at = now()
   where key = 'retenciones.parametros';
  return null;
end $$;
revoke execute on function public.retencion_parametros_al_json() from public, anon, authenticated;
create trigger trg_retencion_parametros_al_json after insert or update on public.retencion_parametros
  for each statement execute function public.retencion_parametros_al_json();

-- Arranque del catálogo
insert into public.retencion_parametro_claves (clave, nombre, ambito, tipo_valor, unidad, orden, descripcion) values
  ('ut',                 'Unidad tributaria',                 'general',  'numero', 'Bs', 1, 'Valor de la UT en bolívares'),
  ('alicuota',           'Alícuota',                          'impuesto', 'numero', '%',  2, 'Alícuota del impuesto'),
  ('pct_retencion',      '% de retención',                    'impuesto', 'numero', '%',  3, 'Porcentaje de retención general (IVA: 75 %)'),
  ('pct_retencion_art5', '% de retención de los supuestos del art. 5', 'impuesto', 'numero', '%', 4, 'IVA: 100 % en los supuestos del art. 5'),
  ('aviso_licencia_dias', 'Aviso de vencimiento de licencia', 'general', 'numero', 'dias', 10, 'Cuántos días antes del vencimiento de una licencia se avisa'),
  ('avisos_activos',      'Avisos activos',                   'general', 'si_no',  null,   11, 'Si se muestran los avisos de vencimiento');

-- Carga inicial desde el JSON de hoy (un valor que no esté en el JSON no se carga).
insert into public.retencion_parametros (impuesto_clave, clave, valor, desde, fuente, motivo)
select x.imp, x.clave, c.value -> x.k, x.desde, x.fuente, x.motivo
  from public.config c
  cross join (values
    (null::text, 'ut',            'unidad_tributaria',  date '2025-06-02', 'Providencia SNAT/2025/000048, G.O. 43.140',
       'Carga inicial R3: UT vigente desde el 02/06/2025 (no retroactiva: antes no hay UT cargada).'),
    ('IVA',       'alicuota',      'iva_alicuota',       date '2020-01-01', null,
       'Carga inicial R3: valor de hoy en Parámetros. Fecha de inicio a confirmar por el contador.'),
    ('IVA',       'pct_retencion', 'iva_retencion',      date '2020-01-01', null,
       'Carga inicial R3: valor de hoy en Parámetros. Fecha de inicio a confirmar por el contador.'),
    ('IGTF',      'alicuota',      'igtf_alicuota',      date '2020-01-01', null,
       'Carga inicial R3: valor de hoy en Parámetros. Fecha de inicio a confirmar por el contador.'),
    ('MUNICIPAL', 'alicuota',      'municipal_alicuota', date '2020-01-01', null,
       'Carga inicial R3: valor de hoy en Parámetros. Fecha de inicio a confirmar por el contador.'),
    ('ESTADAL',   'alicuota',      'estadal_alicuota',   date '2020-01-01', null,
       'Carga inicial R3: valor de hoy en Parámetros. Fecha de inicio a confirmar por el contador.')
  ) as x (imp, clave, k, desde, fuente, motivo)
 where c.key = 'retenciones.parametros' and jsonb_typeof(c.value -> x.k) = 'number';
insert into public.retencion_parametros (impuesto_clave, clave, valor, desde, motivo)
values ('IVA', 'pct_retencion_art5', '100'::jsonb, date '2020-01-01',
        'Carga inicial R3: el 100 % que hoy usa el código en los supuestos del art. 5. Fuente a confirmar por el contador.');
insert into public.retencion_parametros (clave, valor, desde, motivo) values
  ('aviso_licencia_dias', '30'::jsonb,   date '2020-01-01', 'Carga inicial R3: valor por defecto (Master, 16/10 15:16).'),
  ('avisos_activos',      'true'::jsonb, date '2020-01-01', 'Carga inicial R3: valor por defecto.');

-- Tipos de licencia que la pantalla ya guardó en el JSON (clave licencia_tipos), si los hay. La clave no se toca.
insert into public.retencion_licencia_tipos (id, nombre, activo, nota)
select case when (e ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (e ->> 'id')::uuid
            else gen_random_uuid() end,
       btrim(e ->> 'nombre'),
       case when jsonb_typeof(e -> 'activo') = 'boolean' then (e ->> 'activo')::boolean else true end,
       'Cargado desde Parámetros (JSON) al aplicar R3'
  from public.config c
  cross join lateral jsonb_array_elements(case when jsonb_typeof(c.value -> 'licencia_tipos') = 'array'
                                               then c.value -> 'licencia_tipos' else '[]'::jsonb end) as e
 where c.key = 'retenciones.parametros' and jsonb_typeof(e) = 'object' and length(btrim(coalesce(e ->> 'nombre', ''))) >= 2
on conflict do nothing;

-- 7) RLS
do $$
declare t text;
begin
  foreach t in array array['retencion_parametro_claves', 'retencion_parametros', 'retencion_licencia_tipos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate, references, trigger on public.%I from authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()) or (select public.puede(''retenciones'')))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin()) or (select public.puede(''retenciones''))) with check ((select public.is_admin()) or (select public.puede(''retenciones'')))', t || '_update', t);
  end loop;
end $$;

alter publication supabase_realtime add table public.retencion_parametro_claves, public.retencion_parametros, public.retencion_licencia_tipos;

-- ── Registro de esta migración, con su SQL completo (mismo bloque: si algo de arriba falla, no queda) ──

comment on table public.retencion_parametro_claves is 'Retenciones: qué parámetros existen, su ámbito (general o por impuesto) y su tipo de valor';

-- 2) Valores con vigencia
create table public.retencion_parametros (
  id               uuid primary key default gen_random_uuid(),
  impuesto_clave   text references public.retencion_impuestos (clave) on delete restrict,   -- nulo = general
  clave            text not null references public.retencion_parametro_claves (clave) on delete restrict,
  valor            jsonb not null,
  desde            date not null,
  hasta            date,
  fuente           text,
  motivo           text not null check (length(btrim(motivo)) > 0),
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text,
  check (hasta is null or hasta >= desde)
);
create unique index retencion_parametros_desde on public.retencion_parametros (coalesce(impuesto_clave, '*'), clave, desde);
create unique index retencion_parametros_abierto on public.retencion_parametros (coalesce(impuesto_clave, '*'), clave) where hasta is null;
comment on table public.retencion_parametros is 'Retenciones: UT, alícuotas, porcentajes y demás parámetros, con vigencia, fuente y motivo';

-- 3) Tipos de licencia
create table public.retencion_licencia_tipos (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null check (length(btrim(nombre)) >= 2),
  ente_id          uuid references public.retencion_entes (id) on delete restrict,
  activo           boolean not null default true,
  orden            smallint not null default 0,
  nota             text,
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text
);
create unique index retencion_licencia_tipos_nombre on public.retencion_licencia_tipos (lower(btrim(nombre)));
comment on table public.retencion_licencia_tipos is 'Retenciones: catálogo de tipos de licencia (los usa el perfil fiscal de R1)';

-- Quién y cuándo + historial (R2). Solo lee NEW como jsonb: la misma función sirve a las tres tablas.
create function public.retencion_r3_anotar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  quien text := coalesce(auth.jwt() ->> 'email', current_user);
  j jsonb := to_jsonb(new);
begin
  new.actualizado_en := now();
  new.actualizado_por := quien;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  insert into public.retencion_historial (tabla, clave, antes, despues, motivo, actor)
  values (tg_table_name,
          case tg_table_name
            when 'retencion_parametros' then coalesce(j ->> 'impuesto_clave', '*') || ':' || (j ->> 'clave')
            when 'retencion_licencia_tipos' then j ->> 'nombre'
            else j ->> 'clave' end,
          case when tg_op = 'UPDATE' then to_jsonb(old) - 'actualizado_en' - 'actualizado_por' end,
          j - 'actualizado_en' - 'actualizado_por',
          j ->> 'motivo',
          quien);
  return new;
end $$;
revoke execute on function public.retencion_r3_anotar() from public, anon, authenticated;

create trigger trg_retencion_parametro_claves_anotar before insert or update on public.retencion_parametro_claves
  for each row execute function public.retencion_r3_anotar();
create trigger trg_retencion_parametros_anotar before insert or update on public.retencion_parametros
  for each row execute function public.retencion_r3_anotar();
create trigger trg_retencion_licencia_tipos_anotar before insert or update on public.retencion_licencia_tipos
  for each row execute function public.retencion_r3_anotar();

-- Ámbito y tipo del valor (alta y cambio); en el alta, la versión nueva cierra la abierta.
create function public.retencion_parametros_guarda()
returns trigger language plpgsql security definer set search_path = public as $$
declare k public.retencion_parametro_claves; abierta public.retencion_parametros;
begin
  select * into k from public.retencion_parametro_claves where clave = new.clave;
  if not found then return new; end if;   -- la FK la rechaza con su propio error
  if (k.ambito = 'general' and new.impuesto_clave is not null) or (k.ambito = 'impuesto' and new.impuesto_clave is null) then
    raise exception using errcode = 'P0001',
      message = 'RET_PARAMETRO_AMBITO: «' || new.clave || '» es ' || case when k.ambito = 'general' then 'general (sin impuesto).' else 'de un impuesto (indique cuál).' end;
  end if;
  -- (el CASE va entre paréntesis: dentro de un IF, su THEN cortaría la condición)
  if jsonb_typeof(new.valor) is distinct from (case k.tipo_valor when 'numero' then 'number' when 'texto' then 'string' when 'si_no' then 'boolean' end) then
    raise exception using errcode = 'P0001',
      message = 'RET_PARAMETRO_TIPO: «' || new.clave || '» lleva un valor de tipo ' || k.tipo_valor || '.';
  end if;
  if tg_op = 'INSERT' then
    select * into abierta from public.retencion_parametros
     where impuesto_clave is not distinct from new.impuesto_clave and clave = new.clave and hasta is null for update;
    if found then
      if new.desde <= abierta.desde then
        raise exception using errcode = 'P0001',
          message = 'RET_PARAMETRO_DESDE: el valor nuevo de «' || new.clave || '» tiene que empezar después del '
                 || to_char(abierta.desde, 'DD/MM/YYYY') || '. Para corregir el vigente, edítelo.';
      end if;
      update public.retencion_parametros set hasta = new.desde - 1 where id = abierta.id;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.retencion_parametros_guarda() from public, anon, authenticated;
-- «zz»: corre después de anotar (los BEFORE corren por orden alfabético).
create trigger trg_retencion_parametros_zz_guarda before insert or update on public.retencion_parametros
  for each row execute function public.retencion_parametros_guarda();

-- 4) Funciones de lectura
create function public.retencion_parametro(p_impuesto text, p_clave text, p_fecha date)
returns jsonb language sql stable security invoker set search_path = public as $$
  select p.valor from public.retencion_parametros p
   where p.impuesto_clave is not distinct from upper(nullif(p_impuesto, '')) and p.clave = p_clave
     and p.desde <= coalesce(p_fecha, current_date) and (p.hasta is null or p.hasta >= coalesce(p_fecha, current_date))
   order by p.desde desc limit 1;
$$;

create function public.retencion_parametros_vigentes(p_fecha date)
returns table (impuesto_clave text, clave text, nombre text, valor jsonb, unidad text, desde date, fuente text)
language sql stable security invoker set search_path = public as $$
  select p.impuesto_clave, p.clave, k.nombre, p.valor, k.unidad, p.desde, p.fuente
    from public.retencion_parametros p join public.retencion_parametro_claves k on k.clave = p.clave
   where p.desde <= coalesce(p_fecha, current_date) and (p.hasta is null or p.hasta >= coalesce(p_fecha, current_date))
   order by p.impuesto_clave nulls first, k.orden, p.clave;
$$;

revoke execute on function public.retencion_parametro(text, text, date) from public, anon;
revoke execute on function public.retencion_parametros_vigentes(date) from public, anon;
grant execute on function public.retencion_parametro(text, text, date) to authenticated, service_role;
grant execute on function public.retencion_parametros_vigentes(date) to authenticated, service_role;

-- 5) Convivencia: el valor vigente HOY se copia a su clave del JSON (los que no tienen valor hoy no se tocan).
create function public.retencion_parametros_al_json()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.config
     set value = value || jsonb_strip_nulls(jsonb_build_object(
                   'unidad_tributaria',  public.retencion_parametro(null, 'ut', current_date),
                   'iva_alicuota',       public.retencion_parametro('IVA', 'alicuota', current_date),
                   'iva_retencion',      public.retencion_parametro('IVA', 'pct_retencion', current_date),
                   'igtf_alicuota',      public.retencion_parametro('IGTF', 'alicuota', current_date),
                   'municipal_alicuota', public.retencion_parametro('MUNICIPAL', 'alicuota', current_date),
                   'estadal_alicuota',   public.retencion_parametro('ESTADAL', 'alicuota', current_date))),
         updated_by = 'retencion_parametros (R3)',
         updated_at = now()
   where key = 'retenciones.parametros';
  return null;
end $$;
revoke execute on function public.retencion_parametros_al_json() from public, anon, authenticated;
create trigger trg_retencion_parametros_al_json after insert or update on public.retencion_parametros
  for each statement execute function public.retencion_parametros_al_json();

-- Arranque del catálogo
insert into public.retencion_parametro_claves (clave, nombre, ambito, tipo_valor, unidad, orden, descripcion) values
  ('ut',                 'Unidad tributaria',                 'general',  'numero', 'Bs', 1, 'Valor de la UT en bolívares'),
  ('alicuota',           'Alícuota',                          'impuesto', 'numero', '%',  2, 'Alícuota del impuesto'),
  ('pct_retencion',      '% de retención',                    'impuesto', 'numero', '%',  3, 'Porcentaje de retención general (IVA: 75 %)'),
  ('pct_retencion_art5', '% de retención de los supuestos del art. 5', 'impuesto', 'numero', '%', 4, 'IVA: 100 % en los supuestos del art. 5'),
  ('aviso_licencia_dias', 'Aviso de vencimiento de licencia', 'general', 'numero', 'dias', 10, 'Cuántos días antes del vencimiento de una licencia se avisa'),
  ('avisos_activos',      'Avisos activos',                   'general', 'si_no',  null,   11, 'Si se muestran los avisos de vencimiento');

-- Carga inicial desde el JSON de hoy (un valor que no esté en el JSON no se carga).
insert into public.retencion_parametros (impuesto_clave, clave, valor, desde, fuente, motivo)
select x.imp, x.clave, c.value -> x.k, x.desde, x.fuente, x.motivo
  from public.config c
  cross join (values
    (null::text, 'ut',            'unidad_tributaria',  date '2025-06-02', 'Providencia SNAT/2025/000048, G.O. 43.140',
       'Carga inicial R3: UT vigente desde el 02/06/2025 (no retroactiva: antes no hay UT cargada).'),
    ('IVA',       'alicuota',      'iva_alicuota',       date '2020-01-01', null,
       'Carga inicial R3: valor de hoy en Parámetros. Fecha de inicio a confirmar por el contador.'),
    ('IVA',       'pct_retencion', 'iva_retencion',      date '2020-01-01', null,
       'Carga inicial R3: valor de hoy en Parámetros. Fecha de inicio a confirmar por el contador.'),
    ('IGTF',      'alicuota',      'igtf_alicuota',      date '2020-01-01', null,
       'Carga inicial R3: valor de hoy en Parámetros. Fecha de inicio a confirmar por el contador.'),
    ('MUNICIPAL', 'alicuota',      'municipal_alicuota', date '2020-01-01', null,
       'Carga inicial R3: valor de hoy en Parámetros. Fecha de inicio a confirmar por el contador.'),
    ('ESTADAL',   'alicuota',      'estadal_alicuota',   date '2020-01-01', null,
       'Carga inicial R3: valor de hoy en Parámetros. Fecha de inicio a confirmar por el contador.')
  ) as x (imp, clave, k, desde, fuente, motivo)
 where c.key = 'retenciones.parametros' and jsonb_typeof(c.value -> x.k) = 'number';
insert into public.retencion_parametros (impuesto_clave, clave, valor, desde, motivo)
values ('IVA', 'pct_retencion_art5', '100'::jsonb, date '2020-01-01',
        'Carga inicial R3: el 100 % que hoy usa el código en los supuestos del art. 5. Fuente a confirmar por el contador.');
insert into public.retencion_parametros (clave, valor, desde, motivo) values
  ('aviso_licencia_dias', '30'::jsonb,   date '2020-01-01', 'Carga inicial R3: valor por defecto (Master, 16/10 15:16).'),
  ('avisos_activos',      'true'::jsonb, date '2020-01-01', 'Carga inicial R3: valor por defecto.');

-- Tipos de licencia que la pantalla ya guardó en el JSON (clave licencia_tipos), si los hay. La clave no se toca.
insert into public.retencion_licencia_tipos (id, nombre, activo, nota)
select case when (e ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (e ->> 'id')::uuid
            else gen_random_uuid() end,
       btrim(e ->> 'nombre'),
       case when jsonb_typeof(e -> 'activo') = 'boolean' then (e ->> 'activo')::boolean else true end,
       'Cargado desde Parámetros (JSON) al aplicar R3'
  from public.config c
  cross join lateral jsonb_array_elements(case when jsonb_typeof(c.value -> 'licencia_tipos') = 'array'
                                               then c.value -> 'licencia_tipos' else '[]'::jsonb end) as e
 where c.key = 'retenciones.parametros' and jsonb_typeof(e) = 'object' and length(btrim(coalesce(e ->> 'nombre', ''))) >= 2
on conflict do nothing;

-- 7) RLS
do $$
declare t text;
begin
  foreach t in array array['retencion_parametro_claves', 'retencion_parametros', 'retencion_licencia_tipos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate, references, trigger on public.%I from authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()) or (select public.puede(''retenciones'')))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin()) or (select public.puede(''retenciones''))) with check ((select public.is_admin()) or (select public.puede(''retenciones'')))', t || '_update', t);
  end loop;
end $$;

alter publication supabase_realtime add table public.retencion_parametro_claves, public.retencion_parametros, public.retencion_licencia_tipos;
$sql_gt$],
   coalesce(nullif(auth.email(), ''), nullif(current_setting('request.jwt.claim.email', true), ''), session_user::text));

COMMIT;
