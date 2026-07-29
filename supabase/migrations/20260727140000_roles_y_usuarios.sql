-- ============================================================================
-- Roles, perfiles y autorización
--
-- Dos capas, a propósito:
--
--   1. El JWT solo dice quién eres. No lleva permisos.
--   2. Los permisos se resuelven en la base, en cada llamada, contra las
--      tablas de abajo.
--
-- Si los permisos viajaran en el token, revocarle un rol a alguien no tendría
-- efecto hasta que su sesión caducara. Aquí el efecto es inmediato.
--
-- Las funciones de autorización viven en el esquema `private`, que NO está
-- expuesto por la API: nadie puede llamarlas desde el navegador para tantear
-- qué permisos tiene otro usuario.
-- ============================================================================

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Catálogo de roles
-- ---------------------------------------------------------------------------
create table if not exists public.roles (
  codigo      text primary key,
  nombre      text not null,
  descripcion text not null,
  orden       smallint not null default 100
);

insert into public.roles (codigo, nombre, descripcion, orden) values
  ('ADMIN',           'Administrador del sistema', 'Puede todo. Se reserva a quien administra el sistema, no a la gerencia.', 10),
  ('GERENTE_GENERAL', 'Gerente general',           'Única figura que aprueba una compra antes de que se pague.',            20),
  ('COMPRAS',         'Compras',                   'Aprueba requisiciones, carga cotizaciones y prepara la orden.',          30),
  ('TESORERIA',       'Tesorería',                 'Ejecuta los pagos autorizados y los concilia.',                          40),
  ('ALMACEN',         'Almacén',                   'Recibe material, cuenta existencias y despacha.',                        50),
  ('OPERACIONES',     'Operaciones',               'Registra producción, voladuras y consumo en el frente.',                 60),
  ('RRHH',            'Recursos humanos',          'Personal, asistencia y nómina.',                                         70),
  ('SOLICITANTE',     'Solicitante',               'Puede pedir material. Es el rol mínimo de cualquier supervisor.',        80),
  ('CONSULTA',        'Consulta',                  'Solo lectura.',                                                          90)
on conflict (codigo) do update
  set nombre = excluded.nombre,
      descripcion = excluded.descripcion,
      orden = excluded.orden;

-- ---------------------------------------------------------------------------
-- Perfil de la persona
--
-- `auth.users` es de Supabase y no se debe tocar para datos de negocio. Todo
-- lo que la empresa sabe de una persona vive aquí.
-- ---------------------------------------------------------------------------
create table if not exists public.perfiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  usuario   text not null unique,
  nombre    text not null,
  cargo     text,
  cedula    text,
  telefono  text,
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);

create table if not exists public.usuarios_roles (
  usuario_id  uuid not null references public.perfiles(id) on delete cascade,
  rol         text not null references public.roles(codigo),
  asignado_en timestamptz not null default now(),
  primary key (usuario_id, rol)
);

create index if not exists usuarios_roles_rol_idx on public.usuarios_roles (rol);

-- ---------------------------------------------------------------------------
-- Resolución de permisos
-- ---------------------------------------------------------------------------

-- `stable` importa: dentro de una misma consulta Postgres la evalúa una vez y
-- reutiliza el resultado. Sin eso, una política de RLS la llamaría por fila.
create or replace function private.roles_actuales()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(ur.rol), '{}'::text[])
  from public.usuarios_roles ur
  join public.perfiles p on p.id = ur.usuario_id
  where ur.usuario_id = (select auth.uid())
    and p.activo;
$$;

-- ADMIN pasa siempre. Es deliberado: si un rol quedara sin asignar a nadie,
-- el sistema se bloquearía y no habría forma de destrabarlo desde dentro.
create or replace function private.tiene_rol(variadic p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuarios_roles ur
    join public.perfiles p on p.id = ur.usuario_id
    where ur.usuario_id = (select auth.uid())
      and p.activo
      and (ur.rol = any(p_roles) or ur.rol = 'ADMIN')
  );
$$;

-- Corta con un mensaje que nombra el rol que faltaba. Un "no autorizado" seco
-- obliga a adivinar y termina en una llamada a sistemas.
create or replace function private.exigir_rol(variadic p_roles text[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelve a entrar.' using errcode = '28000';
  end if;

  if not private.tiene_rol(variadic p_roles) then
    raise exception 'Esta acción la realiza: %. Tu usuario no tiene ese rol.',
      (select string_agg(r.nombre, ' o ' order by r.orden)
       from public.roles r where r.codigo = any(p_roles))
      using errcode = '42501';
  end if;
end;
$$;

-- Versión pública, solo para que la interfaz sepa qué botones dibujar.
-- Dibujar un botón no autoriza nada: la autorización la hace cada función.
create or replace function public.mis_roles()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select private.roles_actuales();
$$;

revoke execute on function public.mis_roles() from public, anon;
grant   execute on function public.mis_roles() to authenticated;

-- ---------------------------------------------------------------------------
-- Alta de usuarios
--
-- Supabase Auth exige un correo; aquí se entra con nombre de usuario, así que
-- se compone uno interno. El mapeo espeja a src/lib/auth.ts.
-- ---------------------------------------------------------------------------
create or replace function public.crear_usuario_sistema(
  p_usuario text,
  p_clave   text,
  p_nombre  text,
  p_cargo   text default null,
  p_cedula  text default null,
  p_roles   text[] default array['SOLICITANTE']
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_usuario text := lower(trim(p_usuario));
  v_correo  text;
  v_id      uuid;
  v_rol     text;
begin
  perform private.exigir_rol('ADMIN');

  if v_usuario !~ '^[a-z0-9._-]{3,32}$' then
    raise exception 'El usuario "%" no es válido: de 3 a 32 caracteres, solo letras, números, punto, guion y guion bajo.', p_usuario
      using errcode = '22023';
  end if;

  if p_clave is null or length(p_clave) < 8 then
    raise exception 'La clave debe tener al menos 8 caracteres.' using errcode = '22023';
  end if;

  if coalesce(array_length(p_roles, 1), 0) = 0 then
    raise exception 'Asigna al menos un rol.' using errcode = '22023';
  end if;

  v_correo := v_usuario || '@lacantera.local';

  if exists (select 1 from auth.users where email = v_correo) then
    raise exception 'El usuario "%" ya existe.', v_usuario using errcode = '23505';
  end if;

  v_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_id, 'authenticated', 'authenticated', v_correo,
    extensions.crypt(p_clave, extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('usuario', v_usuario, 'nombre', p_nombre),
    '', '', '', ''
  );

  -- Sin identidad asociada, GoTrue rechaza el inicio de sesión por clave.
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_correo, 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.perfiles (id, usuario, nombre, cargo, cedula)
  values (v_id, v_usuario, p_nombre, p_cargo, p_cedula);

  foreach v_rol in array p_roles loop
    insert into public.usuarios_roles (usuario_id, rol) values (v_id, v_rol);
  end loop;

  return v_id;
end;
$$;

revoke execute on function public.crear_usuario_sistema(text, text, text, text, text, text[]) from public, anon;
grant   execute on function public.crear_usuario_sistema(text, text, text, text, text, text[]) to authenticated;

create or replace function public.asignar_roles(p_usuario_id uuid, p_roles text[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rol text;
begin
  perform private.exigir_rol('ADMIN');

  if coalesce(array_length(p_roles, 1), 0) = 0 then
    raise exception 'Un usuario sin roles no puede hacer nada. Desactívalo en vez de dejarlo sin roles.'
      using errcode = '22023';
  end if;

  delete from public.usuarios_roles where usuario_id = p_usuario_id;

  foreach v_rol in array p_roles loop
    insert into public.usuarios_roles (usuario_id, rol) values (p_usuario_id, v_rol);
  end loop;
end;
$$;

revoke execute on function public.asignar_roles(uuid, text[]) from public, anon;
grant   execute on function public.asignar_roles(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Permisos de lectura
-- ---------------------------------------------------------------------------
alter table public.roles          enable row level security;
alter table public.perfiles       enable row level security;
alter table public.usuarios_roles enable row level security;

revoke insert, update, delete on public.roles          from anon, authenticated;
revoke insert, update, delete on public.perfiles       from anon, authenticated;
revoke insert, update, delete on public.usuarios_roles from anon, authenticated;

grant select on public.roles          to authenticated;
grant select on public.perfiles       to authenticated;
grant select on public.usuarios_roles to authenticated;

-- Quién es quién es información interna compartida: un documento firmado por
-- "Pedro" tiene que poder mostrar "Pedro Ramírez, jefe de taller".
drop policy if exists roles_lectura on public.roles;
create policy roles_lectura on public.roles
  for select to authenticated using (true);

drop policy if exists perfiles_lectura on public.perfiles;
create policy perfiles_lectura on public.perfiles
  for select to authenticated using (true);

drop policy if exists usuarios_roles_lectura on public.usuarios_roles;
create policy usuarios_roles_lectura on public.usuarios_roles
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Perfil del administrador que ya existe
--
-- Se le dan todos los roles para que una sola persona pueda recorrer el flujo
-- completo mientras se prueba. En operación real, GERENTE_GENERAL debe estar
-- en manos de la gerencia y no del administrador del sistema: si quien carga
-- la cotización es el mismo que la aprueba, el control no existe.
-- ---------------------------------------------------------------------------
do $$
declare
  v_id  uuid;
  v_rol text;
begin
  select id into v_id from auth.users where email = 'admin_@lacantera.local';

  if v_id is null then
    raise notice 'No existe admin_@lacantera.local todavía. Corre antes la migración del usuario administrador.';
    return;
  end if;

  insert into public.perfiles (id, usuario, nombre, cargo)
  values (v_id, 'admin_', 'Administrador', 'Administración del sistema')
  on conflict (id) do nothing;

  for v_rol in select codigo from public.roles loop
    insert into public.usuarios_roles (usuario_id, rol)
    values (v_id, v_rol)
    on conflict do nothing;
  end loop;
end
$$;
