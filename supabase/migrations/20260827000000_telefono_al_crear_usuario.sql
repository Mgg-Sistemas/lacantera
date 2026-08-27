/*
  EL TELÉFONO QUE SE ESCRIBE AL CREAR UN USUARIO SE GUARDA.

  La ventana de alta pedía Cargo, Cédula y Teléfono, y de los tres solo dos
  llegaban a la base: `crear_usuario_sistema` no tenía parámetro para el
  teléfono. El usuario se creaba sin dar ningún error y el número se perdía en
  silencio, que es la peor forma de perder un dato — nadie lo nota hasta que
  hace falta llamar a esa persona.

  El rodeo que quedaba era abrir la ficha del usuario recién creado y volver a
  escribirlo, porque `guardar_perfil` sí lo guarda.

  Se añade el parámetro y se pasa al perfil. Lo demás de la función queda igual.

  VA CON DROP Y NO CON UN `create or replace` A SECAS. Cambiar la lista de
  argumentos no reemplaza la función: crea una segunda con el mismo nombre, y
  entonces hay dos, la vieja sigue viva y una llamada por posición puede caer en
  cualquiera de las dos.

  Y POR ESO HAY QUE REPONER LOS PERMISOS. Al soltar la función se van con ella
  sus grants, y una función nueva en `public` nace con `execute` para todo el
  mundo — incluido `anon`, que es quien mira el sistema sin haber entrado. Se
  vuelve a cerrar aquí mismo, en la misma migración, para que no quede una
  ventana entre una cosa y la otra.
*/

drop function if exists public.crear_usuario_sistema(text, text, text, text, text, text[]);

create function public.crear_usuario_sistema(
  p_usuario text,
  p_clave   text,
  p_nombre  text,
  p_cargo   text default null,
  p_cedula  text default null,
  p_telefono text default null,
  p_roles   text[] default array['SOLICITANTE']
)
returns uuid
language plpgsql
security definer
set search_path to ''
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

  /*
    El teléfono entra vacío como nulo y no como cadena vacía. Un '' en la
    columna se lee luego como «tiene teléfono» y sale impreso como un hueco;
    un nulo se lee como lo que es, que no se cargó.
  */
  insert into public.perfiles (id, usuario, nombre, cargo, cedula, telefono, debe_cambiar_clave)
  values (v_id, v_usuario, p_nombre, p_cargo, p_cedula,
          nullif(btrim(coalesce(p_telefono, '')), ''), true);

  foreach v_rol in array p_roles loop
    insert into public.usuarios_roles (usuario_id, rol) values (v_id, v_rol);
  end loop;

  return v_id;
end;
$$;

revoke execute on function public.crear_usuario_sistema(text, text, text, text, text, text, text[])
  from public, anon;
grant execute on function public.crear_usuario_sistema(text, text, text, text, text, text, text[])
  to authenticated;
