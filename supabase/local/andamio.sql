-- ============================================================================
-- Andamio para correr las pruebas contra un Postgres local
--
-- Las migraciones dan por hecho medio Supabase: el esquema `auth` con sus
-- usuarios, sesiones e identidades; `storage` para las fotos del personal; la
-- publicación de tiempo real; y los roles `anon` y `authenticated`. En el
-- proyecto de Supabase todo eso ya está puesto. En un Postgres recién
-- instalado no hay nada de eso y la primera migración se cae en la primera
-- línea.
--
-- Esto lo fabrica. No pretende ser Supabase: pretende ser lo justo para que
-- las migraciones se apliquen y las pruebas corran sin tocar la base de
-- producción y sin pedirle a nadie la contraseña.
--
-- QUÉ NO REPRODUCE, y conviene tenerlo delante al leer un resultado en verde:
--
--   · GoTrue. Aquí nadie inicia sesión de verdad. Las pruebas se identifican
--     poniendo el `sub` en `request.jwt.claims`, que es exactamente lo que lee
--     `auth.uid()`; lo que no se prueba es el inicio de sesión en sí.
--   · El almacenamiento de archivos. Las tablas existen para que las políticas
--     de la migración de fichas tengan dónde agarrarse, pero no hay nada
--     detrás: no se sube ni se descarga ninguna foto.
--   · Los datos reales. Esto verifica que las funciones calculan bien, no que
--     lo cargado en producción esté bien. Son dos preguntas distintas.
--
-- Se aplica ANTES que las migraciones. `supabase/local/preparar.mjs` hace las
-- dos cosas en orden.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Roles
--
-- Sin login: aquí nadie se conecta como ellos, se llega por `set role` desde
-- el dueño, que es como llegan las pruebas.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  -- `authenticator` es con quien PostgREST abre la conexión antes de cambiarse
  -- a `anon` o a `authenticated` según el token. Aquí no lo usa nadie para
  -- conectarse, pero tiene que existir: hay migraciones que le ponen ajustes
  -- encima —`alter role authenticator set timezone`— y sin el rol revientan.
  -- Se descubrió al replicar las migraciones sobre una base vacía: la número
  -- 101 de 207 se cayó por esto.
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator nologin noinherit;
    grant anon, authenticated, service_role to authenticator;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Esquemas y extensiones
--
-- pgcrypto va en `extensions` y no en `public` porque las migraciones la
-- llaman por su nombre completo (`extensions.crypt`), igual que en Supabase.
-- ---------------------------------------------------------------------------
create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists storage;

create extension if not exists pgcrypto with schema extensions;

grant usage on schema auth       to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema storage    to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- auth.users
--
-- Solo las columnas que las migraciones y las pruebas escriben, más las que
-- Supabase trae con NOT NULL. Todo lo demás sobra para lo que se prueba aquí.
-- ---------------------------------------------------------------------------
create table if not exists auth.users (
  id                       uuid primary key,
  instance_id              uuid,
  aud                      varchar(255),
  role                     varchar(255),
  email                    varchar(255),
  encrypted_password       varchar(255),
  email_confirmed_at       timestamptz,
  invited_at               timestamptz,
  confirmation_token       varchar(255),
  confirmation_sent_at     timestamptz,
  recovery_token           varchar(255),
  recovery_sent_at         timestamptz,
  email_change_token_new   varchar(255),
  email_change             varchar(255),
  email_change_sent_at     timestamptz,
  last_sign_in_at          timestamptz,
  raw_app_meta_data        jsonb,
  raw_user_meta_data       jsonb,
  is_super_admin           boolean,
  created_at               timestamptz,
  updated_at               timestamptz,
  phone                    text,
  banned_until             timestamptz,
  deleted_at               timestamptz,
  is_sso_user              boolean not null default false,
  is_anonymous             boolean not null default false
);

create table if not exists auth.identities (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  provider_id     text not null,
  identity_data   jsonb not null,
  provider        text not null,
  last_sign_in_at timestamptz,
  created_at      timestamptz,
  updated_at      timestamptz,
  unique (provider_id, provider)
);

-- La auditoría cuelga un disparador de esta tabla, así que tiene que existir
-- con el mismo nombre de columnas: la función lee NEW.user_agent y NEW.ip.
create table if not exists auth.sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  user_agent text,
  ip         inet
);

create table if not exists auth.refresh_tokens (
  id         bigserial primary key,
  token      varchar(255),
  user_id    varchar(255),
  session_id uuid references auth.sessions(id) on delete cascade,
  revoked    boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- auth.uid()
--
-- La misma definición que usa Supabase. Es la pieza de la que cuelga todo el
-- sistema de permisos: cada política de fila pregunta por ella, y las pruebas
-- se hacen pasar por alguien poniendo el `sub` en request.jwt.claims.
-- ---------------------------------------------------------------------------
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

grant execute on function auth.uid(), auth.role(), auth.jwt()
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- storage
--
-- Las políticas de la ficha del personal solo miran `bucket_id`. El resto de
-- columnas está para que la tabla se parezca a la de verdad y una migración
-- futura no se caiga por una columna que aquí no existía.
-- ---------------------------------------------------------------------------
create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  owner              uuid,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table if not exists storage.objects (
  id             uuid primary key default gen_random_uuid(),
  bucket_id      text references storage.buckets(id),
  name           text,
  owner          uuid,
  metadata       jsonb,
  path_tokens    text[],
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  last_accessed_at timestamptz default now()
);

alter table storage.objects enable row level security;

grant select on storage.buckets to anon, authenticated;
grant select, insert, update, delete on storage.objects to authenticated;

-- ---------------------------------------------------------------------------
-- Tiempo real
--
-- Dos migraciones se paran en seco si esta publicación no existe, y hacen bien:
-- en el proyecto de verdad su ausencia significa que el tiempo real está
-- apagado. Aquí se crea vacía para que puedan añadirle sus tablas.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;
