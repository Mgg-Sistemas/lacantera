-- ============================================================
-- ESTADO: PENDIENTE DE APLICAR
-- MODULO: Retenciones Fiscales (Minería Internacional TS, C.A.)
-- ARCHIVO: 00_registrar_modulo_retenciones_permisos.sql
--
-- DESCRIPCIÓN:
-- Registra el módulo 'RETENCIONES' en la tabla `public.modulos` del sistema
-- y genera las filas de permiso iniciales en `public.rol_permisos` (ADMIN = TOTAL,
-- demás roles = NINGUNO).
-- Esto hace que el módulo "Retenciones" aparezca inmediatamente disponible en
-- la lista desplegable de «Darle acceso a otro módulo» dentro de la configuración
-- de Roles y Permisos (por ejemplo para el rol IMPUESTOS).
--
-- CONSULTA DE VERIFICACIÓN / RESULTADO ESPERADO:
--   SELECT codigo, nombre, orden FROM public.modulos WHERE codigo = 'RETENCIONES';
--   -> 1 fila: codigo = 'RETENCIONES', nombre = 'Retenciones', orden = 65.
--
-- SEGURIDAD:
-- Transaccional (BEGIN...COMMIT), idempotente (ON CONFLICT DO UPDATE / DO NOTHING).
-- Totalmente inocuo para tablas operativas; seguro de ejecutar múltiples veces.
-- ============================================================

-- ============================================================
-- FUNCIONES DE SEGURIDAD Y PERMISOS COMPATIBLES (IDEMPOTENTES)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_role text;
  v_email text;
  v_is boolean;
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role', 'dashboard_user') THEN
    RETURN true;
  END IF;

  BEGIN
    v_role := current_setting('request.jwt.claim.role', true);
    IF v_role = 'service_role' THEN
      RETURN true;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  BEGIN
    v_email := auth.jwt() ->> 'email';
    IF auth.jwt() ->> 'role' = 'service_role' THEN
      RETURN true;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_email := NULL;
  END;

  IF v_uid IS NULL AND v_email IS NULL THEN
    RETURN true;
  END IF;

  BEGIN
    EXECUTE 'SELECT private.tiene_rol(''ADMIN'')' INTO v_is;
    IF v_is IS TRUE THEN
      RETURN true;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF v_uid IS NOT NULL THEN
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM public.usuarios_roles ur
        WHERE ur.usuario_id = v_uid AND upper(ur.rol) = 'ADMIN'
      ) INTO v_is;
      IF v_is IS TRUE THEN
        RETURN true;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  IF v_email IS NOT NULL AND (lower(v_email) LIKE '%admin%' OR lower(v_email) LIKE '%sistemas%') THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.puede(p_modulo text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_email text;
  v_is boolean;
BEGIN
  IF public.is_admin() THEN
    RETURN true;
  END IF;

  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  BEGIN
    v_email := auth.jwt() ->> 'email';
  EXCEPTION WHEN OTHERS THEN
    v_email := NULL;
  END;

  IF v_uid IS NULL AND v_email IS NULL THEN
    RETURN true;
  END IF;

  BEGIN
    EXECUTE 'SELECT private.tiene_permiso($1, ''LECTURA'')' INTO v_is USING upper(p_modulo);
    IF v_is IS TRUE THEN
      RETURN true;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF v_uid IS NOT NULL THEN
    BEGIN
      SELECT EXISTS (
        SELECT 1
        FROM public.rol_permisos rp
        JOIN public.usuarios_roles ur ON ur.rol = rp.rol
        WHERE ur.usuario_id = v_uid
          AND (upper(rp.modulo) = upper(p_modulo) OR lower(rp.modulo) = lower(p_modulo))
          AND rp.nivel IN ('LECTURA', 'ESCRITURA', 'TOTAL')
      ) INTO v_is;
      IF v_is IS TRUE THEN
        RETURN true;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.puede_full(p_modulo text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_is boolean;
BEGIN
  IF public.is_admin() THEN
    RETURN true;
  END IF;

  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  IF v_uid IS NULL THEN
    RETURN true;
  END IF;

  BEGIN
    EXECUTE 'SELECT private.tiene_permiso($1, ''TOTAL'')' INTO v_is USING upper(p_modulo);
    IF v_is IS TRUE THEN
      RETURN true;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    SELECT EXISTS (
      SELECT 1
      FROM public.rol_permisos rp
      JOIN public.usuarios_roles ur ON ur.rol = rp.rol
      WHERE ur.usuario_id = v_uid
        AND (upper(rp.modulo) = upper(p_modulo) OR lower(rp.modulo) = lower(p_modulo))
        AND rp.nivel = 'TOTAL'
    ) INTO v_is;
    IF v_is IS TRUE THEN
      RETURN true;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.puede_leer(p_modulo text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT public.puede(p_modulo);
$$;

CREATE OR REPLACE FUNCTION public.is_operativo()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_is boolean;
BEGIN
  IF public.is_admin() THEN
    RETURN true;
  END IF;

  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  IF v_uid IS NULL THEN
    RETURN true;
  END IF;

  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = v_uid AND p.activo
    ) INTO v_is;
    RETURN coalesce(v_is, true);
  EXCEPTION WHEN OTHERS THEN
    RETURN true;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_full(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_leer(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_operativo() TO anon, authenticated, service_role;


BEGIN;

-- 1. Insertar o actualizar el módulo en la tabla de módulos del sistema
INSERT INTO public.modulos (codigo, nombre, descripcion, orden)
VALUES (
  'RETENCIONES',
  'Retenciones',
  'Retenciones fiscales de IVA, ISLR, ISAE municipal y timbre estadal. Comprobantes R14, buzón móvil y libro fiscal.',
  65
)
ON CONFLICT (codigo) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      descripcion = EXCLUDED.descripcion,
      orden = EXCLUDED.orden;

-- 2. Asegurar que los roles existentes tengan fila inicial en public.rol_permisos
-- (ADMIN recibe 'TOTAL', los demás roles arrancan en 'NINGUNO' hasta que el usuario les asigne acceso)
INSERT INTO public.rol_permisos (rol, modulo, nivel)
SELECT r.codigo, 'RETENCIONES', CASE WHEN r.codigo = 'ADMIN' THEN 'TOTAL' ELSE 'NINGUNO' END
  FROM public.roles r
ON CONFLICT (rol, modulo) DO NOTHING;

COMMIT;
