-- ============================================================================
-- La clave la termina de poner su dueño
--
-- Hasta aquí la clave la asignaba el administrador y ahí se quedaba: una clave
-- que conocen dos personas no identifica a ninguna. Si alguien aprueba una
-- compra con una clave que también sabe quien administra el sistema, la firma
-- no distingue a uno del otro, y eso es justo lo que un control interno tiene
-- que poder hacer.
--
-- El reparto queda así:
--
--   · El administrador pone la primera clave y la entrega en persona.
--   · Al entrar por primera vez, el sistema no deja pasar hasta que la persona
--     la cambia por una que solo ella sepa.
--   · A partir de ahí, la cambia cuando quiera desde su cuenta.
--   · Si la olvida, el administrador le pone otra provisional y vuelve a
--     empezar el ciclo.
-- ============================================================================

alter table public.perfiles
  add column if not exists debe_cambiar_clave boolean not null default false;

comment on column public.perfiles.debe_cambiar_clave is
  'La clave vigente la asignó el administrador. Hasta que su dueño la cambie, no identifica a nadie.';

-- ---------------------------------------------------------------------------
-- Cambiarse la clave uno mismo
--
-- Pide la actual aunque venga obligado por el primer ingreso. Sin ese
-- requisito, una sesión olvidada abierta en una máquina compartida deja que
-- cualquiera que pase se apropie de la cuenta cambiando la clave.
-- ---------------------------------------------------------------------------
create or replace function public.cambiar_mi_clave(p_actual text, p_nueva text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id     uuid := (select auth.uid());
  v_actual text;
begin
  if v_id is null then
    raise exception 'Sesión no válida. Vuelve a entrar.' using errcode = '28000';
  end if;

  if p_nueva is null or length(p_nueva) < 8 then
    raise exception 'La clave nueva debe tener al menos 8 caracteres.' using errcode = '22023';
  end if;

  if p_actual = p_nueva then
    raise exception 'La clave nueva tiene que ser distinta de la actual.' using errcode = '22023';
  end if;

  select encrypted_password into v_actual from auth.users where id = v_id;

  if v_actual is null or extensions.crypt(p_actual, v_actual) <> v_actual then
    raise exception 'La clave actual no es correcta.' using errcode = '28P01';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_nueva, extensions.gen_salt('bf')),
         updated_at = now()
   where id = v_id;

  -- Ya es suya: desde aquí, lo que se firme con ella es de esta persona.
  update public.perfiles set debe_cambiar_clave = false where id = v_id;
end;
$$;

revoke execute on function public.cambiar_mi_clave(text, text) from public, anon;
grant   execute on function public.cambiar_mi_clave(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- La clave que pone el administrador nace marcada como provisional
-- ---------------------------------------------------------------------------
create or replace function public.cambiar_clave_usuario(p_id uuid, p_clave text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.exigir_rol('ADMIN');

  if p_clave is null or length(p_clave) < 8 then
    raise exception 'La clave debe tener al menos 8 caracteres.' using errcode = '22023';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_clave, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_id;

  if not found then
    raise exception 'No existe ese usuario.' using errcode = '22023';
  end if;

  -- Aunque el administrador se la cambie a sí mismo: si la escribió para
  -- dársela a alguien, el ciclo tiene que volver a empezar.
  update public.perfiles set debe_cambiar_clave = true where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Alta de usuarios: igual, la primera clave es prestada
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

  insert into public.perfiles (id, usuario, nombre, cargo, cedula, debe_cambiar_clave)
  values (v_id, v_usuario, p_nombre, p_cargo, p_cedula, true);

  foreach v_rol in array p_roles loop
    insert into public.usuarios_roles (usuario_id, rol) values (v_id, v_rol);
  end loop;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quién soy y qué me falta
--
-- La pantalla de la cuenta podría leer `perfiles` directamente, pero entonces
-- tendría que saber comparar con auth.uid() para encontrarse a sí misma. Una
-- función que devuelve una fila es menos superficie y no admite equivocarse de
-- persona.
-- ---------------------------------------------------------------------------
create or replace function public.mi_perfil()
returns table (
  id                 uuid,
  usuario            text,
  nombre             text,
  cargo              text,
  cedula             text,
  telefono           text,
  activo             boolean,
  creado_en          timestamptz,
  debe_cambiar_clave boolean,
  roles              text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.usuario, p.nombre, p.cargo, p.cedula, p.telefono,
         p.activo, p.creado_en, p.debe_cambiar_clave,
         coalesce(
           (select array_agg(ur.rol order by r.orden)
              from public.usuarios_roles ur
              join public.roles r on r.codigo = ur.rol
             where ur.usuario_id = p.id),
           '{}'::text[])
    from public.perfiles p
   where p.id = (select auth.uid());
$$;

revoke execute on function public.mi_perfil() from public, anon;
grant   execute on function public.mi_perfil() to authenticated;

-- ---------------------------------------------------------------------------
-- Las cuentas que ya existen
--
-- Al administrador se le exige el cambio: su clave es la que se escribió en
-- una migración y anduvo por el historial de git. Al resto también, porque
-- todas las claves vigentes hoy las puso el administrador.
-- ---------------------------------------------------------------------------
update public.perfiles set debe_cambiar_clave = true where debe_cambiar_clave = false;
