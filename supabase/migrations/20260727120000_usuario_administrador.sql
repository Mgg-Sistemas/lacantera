-- ============================================================================
-- Usuario administrador inicial
--
-- El sistema entra con nombre de usuario, no con correo, porque buena parte de
-- la plantilla no tiene correo de empresa. Supabase Auth exige un correo, así
-- que se compone uno interno: <usuario>@lacantera.local. Ese dominio no es real
-- ni debe serlo — si lo fuera, alguien podría registrarlo por fuera y recibir
-- los correos de recuperación de contraseña.
--
-- El mapeo vive en src/lib/auth.ts. Si cambia aquí, cambia allá.
--
-- ADVERTENCIA: la clave 'CLAVE-RETIRADA-DEL-HISTORIAL' es provisional y débil para una cuenta con
-- acceso total a compras, inventario y nómina. Debe cambiarse en el primer
-- inicio de sesión. Cuando exista la tabla de perfiles se añadirá la marca
-- `debe_cambiar_clave` para forzarlo.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

do $$
declare
  v_correo  text := 'admin_@lacantera.local';
  v_usuario text := 'admin_';
  v_clave   text := 'CLAVE-RETIRADA-DEL-HISTORIAL';
  v_id      uuid;
begin
  -- Idempotente: la migración puede reaplicarse sin duplicar la cuenta.
  select id into v_id from auth.users where email = v_correo;

  if v_id is not null then
    raise notice 'El usuario % ya existe (id %). No se modifica.', v_usuario, v_id;
    return;
  end if;

  v_id := gen_random_uuid();

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    -- Se confirma de entrada: no hay buzón real que pueda recibir el correo
    -- de verificación de un dominio interno.
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_id,
    'authenticated',
    'authenticated',
    v_correo,
    extensions.crypt(v_clave, extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('usuario', v_usuario, 'nombre', 'Administrador'),
    '',
    '',
    '',
    ''
  );

  -- Sin la identidad asociada, GoTrue rechaza el inicio de sesión por clave
  -- aunque la fila de auth.users sea correcta.
  insert into auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    v_id,
    v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_correo, 'email_verified', true),
    'email',
    now(),
    now(),
    now()
  );

  raise notice 'Usuario % creado con id %.', v_usuario, v_id;
end
$$;
