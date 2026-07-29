-- ============================================================================
-- Cambiar la clave cierra las demás sesiones
--
-- Hasta ahora no lo hacía, y eso vacía de sentido el gesto. Quien cambia la
-- clave lo hace por un motivo: se la vio alguien, prestó el equipo, perdió el
-- teléfono. Si las sesiones que ya estaban abiertas siguen abiertas, quien
-- entró con la clave vieja sigue dentro y la persona cree que ya se resolvió.
--
-- La clave se cambia por SQL —escribiendo directamente en auth.users— porque el
-- sistema no usa el flujo de correo de Supabase: aquí las cuentas las crea la
-- administración y no hay buzón al que mandar nada. El precio de esa decisión
-- es este: GoTrue no se entera del cambio y no revoca nada por su cuenta. Hay
-- que hacerlo a mano, y es lo que faltaba.
--
-- Importa el doble desde que se puede entrar con la huella: el pase guardado en
-- un equipo perdido deja de servir en cuanto su dueño cambia la clave. Es la
-- única forma de desactivarla a distancia, y la pantalla de Mi cuenta lo dice.
-- ============================================================================

create or replace function private.cerrar_otras_sesiones(p_usuario uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- En dos pasos y con `nullif` fuera del cast a propósito: el ajuste puede
  -- llegar vacío —una llamada desde SQL, una tarea de mantenimiento— y `''::jsonb`
  -- revienta. Si reventara aquí, se caería el cambio de clave entero, que es
  -- justo lo que la persona está intentando hacer para ponerse a salvo.
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_actual uuid  := nullif(v_claims ->> 'session_id', '')::uuid;
begin
  -- Se respeta la sesión desde la que se está cambiando la clave: echar a
  -- alguien de su propia pantalla en el momento de asegurarla se lee como que
  -- algo salió mal, y le haría volver a entrar sin saber si el cambio cuajó.
  delete from auth.sessions
   where user_id = p_usuario
     and (v_actual is null or id <> v_actual);

  -- Los pases sueltos de sesiones que ya no existen. Normalmente se van en
  -- cascada con la sesión; se barren igual por si quedó alguno de una versión
  -- anterior de GoTrue, cuando los pases vivían sin sesión que los agrupara.
  delete from auth.refresh_tokens
   where user_id = p_usuario::text
     and session_id is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Se engancha en los dos sitios donde cambia una clave
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

  -- La clave vieja deja de servir en todas partes, no solo aquí.
  perform private.cerrar_otras_sesiones(v_id);

  -- Desde aquí, lo que se firme con ella es de esta persona.
  update public.perfiles set debe_cambiar_clave = false where id = v_id;
end;
$$;

revoke execute on function public.cambiar_mi_clave(text, text) from public, anon;
grant   execute on function public.cambiar_mi_clave(text, text) to authenticated;

-- Cuando la administración le repone la clave a alguien, con más razón: se hace
-- porque la persona no puede entrar, o porque hubo un problema con esa cuenta.
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

  if not exists (select 1 from public.perfiles where id = p_id) then
    raise exception 'No existe ese usuario.' using errcode = 'P0002';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_clave, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_id;

  perform private.cerrar_otras_sesiones(p_id);

  -- Nace provisional: la termina de poner su dueño.
  update public.perfiles set debe_cambiar_clave = true where id = p_id;
end;
$$;

revoke execute on function public.cambiar_clave_usuario(uuid, text) from public, anon;
grant   execute on function public.cambiar_clave_usuario(uuid, text) to authenticated;
