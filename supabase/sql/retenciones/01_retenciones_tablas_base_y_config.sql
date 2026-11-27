-- ============================================================
-- ESTADO: PENDIENTE DE APLICAR
-- MODULO: Retenciones Fiscales (Minería Internacional TS, C.A.)
-- ARCHIVO: 01_retenciones_tablas_base_y_config.sql
--
-- DESCRIPCIÓN:
-- Crea la tabla principal `public.retenciones`, el catálogo de conceptos `public.retenciones_conceptos`,
-- las series y ajustes generales, y registra en `public.config` los parámetros iniciales de
-- Minería Internacional TS, C.A. (RIF J-50209170-0, UT = 43 Bs, IVA 75%/100%).
--
-- CONSULTA DE VERIFICACIÓN / RESULTADO ESPERADO:
-- Ejecutar tras aplicar este script:
--   1) SELECT count(*) >= 0 AS tabla_lista FROM public.retenciones;
--      -> true (tabla lista y accesible)
--   2) SELECT value->>'empresa_rif' AS rif, value->>'valor_ut' AS ut FROM public.config WHERE key = 'retenciones.parametros';
--      -> rif: 'J-50209170-0', ut: '43'
--
-- SEGURIDAD:
-- Transaccional (BEGIN...COMMIT), idempotente (IF NOT EXISTS),
-- no afecta tablas existentes y no destructivo en caso de error o fallo.
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
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_full(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.puede_leer(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_operativo() TO anon, authenticated, service_role;


BEGIN;

-- 0) Registro del módulo 'RETENCIONES' en el sistema de permisos
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'modulos') THEN
        INSERT INTO public.modulos (codigo, nombre, descripcion, orden)
        VALUES ('RETENCIONES', 'Retenciones', 'Retenciones fiscales de IVA, ISLR, ISAE municipal y timbre estadal.', 65)
        ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion, orden = EXCLUDED.orden;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rol_permisos') THEN
            INSERT INTO public.rol_permisos (rol, modulo, nivel)
            SELECT r.codigo, 'RETENCIONES', CASE WHEN r.codigo = 'ADMIN' THEN 'TOTAL' ELSE 'NINGUNO' END
            FROM public.roles r
            ON CONFLICT (rol, modulo) DO NOTHING;
        END IF;
    END IF;
END $$;

-- 1) Tabla de configuración global si no existe
CREATE TABLE IF NOT EXISTS public.config (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamptz DEFAULT now(),
    updated_by text
);
ALTER TABLE public.config ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.config ADD COLUMN IF NOT EXISTS updated_by text;
ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;

-- Permisos y roles para PostgREST schema cache
GRANT ALL ON public.config TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.config TO authenticated;
GRANT SELECT ON public.config TO anon;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'config' AND policyname = 'config read auth') THEN
        CREATE POLICY "config read auth" ON public.config FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'config' AND policyname = 'config anon read') THEN
        CREATE POLICY "config anon read" ON public.config FOR SELECT TO anon USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'config' AND policyname = 'config_all_auth') THEN
        CREATE POLICY "config_all_auth" ON public.config FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;

-- Parámetros iniciales de Retenciones para Minería Internacional TS, C.A.
INSERT INTO public.config (key, value, updated_at)
VALUES (
    'retenciones.parametros',
    jsonb_build_object(
        'empresa_nombre', 'MINERIA INTERNACIONAL TS, C.A.',
        'empresa_rif', 'J-50209170-0',
        'empresa_domicilio', 'Sector La Cantera, Estado Bolívar, Venezuela',
        'empresa_municipio', 'Piar',
        'empresa_estado', 'Bolívar',
        'empresa_email', 'contacto@mineriainternacionalts.com',
        'empresa_telefono', '+58 424-9349731',
        'valor_ut', 43,
        'alicuota_iva', 16,
        'pct_iva_general', 75,
        'pct_iva_especial', 100,
        'pct_igtf', 3,
        'es_agente_retencion_iva', false,
        'es_contribuyente_especial', false,
        'retiene_islr', true,
        'retiene_municipal', true,
        'imprimir_original_y_copia', false,
        'incluir_logo', true,
        'incluir_firma', true,
        'incluir_sello', true,
        'incluir_qr', true,
        'buzon_activo', true
    ),
    now()
)
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value || public.config.value,
    updated_at = now();

-- 2) Tabla principal de Retenciones
CREATE TABLE IF NOT EXISTS public.retenciones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rol text NOT NULL DEFAULT 'practicada' CHECK (rol IN ('practicada', 'recibida')),
    tipo text NOT NULL CHECK (tipo IN ('iva', 'islr', 'municipal', 'regional', 'igtf', 'ordenanza')),
    estado text NOT NULL DEFAULT 'registrada' CHECK (estado IN ('registrada', 'declarada', 'anulada')),
    numero bigint,
    comprobante_nro text,
    comprobante_periodo text,
    comprobante_fecha date,
    fecha_emision date DEFAULT current_date,
    contraparte_nombre text,
    contraparte_rif text,
    sujeto text,
    factura_numero text,
    factura_control text,
    factura_fecha date,
    fecha_entrega date,
    factura_total numeric(14,2) DEFAULT 0,
    base_imponible numeric(14,2) DEFAULT 0,
    iva_alicuota numeric(5,2),
    iva_monto numeric(14,2),
    impuesto_causado numeric(14,2) DEFAULT 0,
    monto_sin_derecho_credito_iva numeric(14,2) DEFAULT 0,
    porcentaje numeric(5,2) NOT NULL DEFAULT 0,
    concepto_codigo text,
    concepto text,
    municipio text,
    sustraendo numeric(14,2) DEFAULT 0,
    monto numeric(14,2) NOT NULL DEFAULT 0,
    moneda text NOT NULL DEFAULT 'Bs',
    tasa numeric(18,6) DEFAULT 1,
    base_bs numeric(14,2),
    monto_bs numeric(14,2),
    descripcion text,
    proveedor_id bigint references public.proveedores(id),
    documento_id uuid,
    orden_id bigint,
    compra_directa_id bigint,
    servicio_directo_id bigint,
    empresa_id text DEFAULT 'empresa-mits',
    valor_ut numeric(14,2) DEFAULT 43,
    anulada_motivo text,
    anulada_por text,
    declarada_at timestamptz,
    declarada_por text,
    actor text,
    actor_name text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Asegurar cada columna por si la tabla ya existía previamente en la base de datos
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS rol text NOT NULL DEFAULT 'practicada';
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'registrada';
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS numero bigint;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS comprobante_nro text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS comprobante_periodo text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS comprobante_fecha date;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS fecha_emision date DEFAULT current_date;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS contraparte_nombre text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS contraparte_rif text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS sujeto text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS factura_numero text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS factura_control text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS factura_fecha date;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS fecha_entrega date;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS factura_total numeric(14,2) DEFAULT 0;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS base_imponible numeric(14,2) DEFAULT 0;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS iva_alicuota numeric(5,2);
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS iva_monto numeric(14,2);
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS impuesto_causado numeric(14,2) DEFAULT 0;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS monto_sin_derecho_credito_iva numeric(14,2) DEFAULT 0;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS porcentaje numeric(5,2) NOT NULL DEFAULT 0;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS concepto_codigo text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS concepto text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS municipio text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS sustraendo numeric(14,2) DEFAULT 0;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS monto numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS moneda text NOT NULL DEFAULT 'Bs';
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS tasa numeric(18,6) DEFAULT 1;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS base_bs numeric(14,2);
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS monto_bs numeric(14,2);
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS descripcion text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS proveedor_id bigint references public.proveedores(id);
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS documento_id uuid;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'retenciones' AND column_name = 'orden_id' AND data_type = 'uuid') THEN
    ALTER TABLE public.retenciones ALTER COLUMN orden_id TYPE bigint USING NULL;
  ELSE
    ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS orden_id bigint;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'retenciones' AND column_name = 'compra_directa_id' AND data_type = 'uuid') THEN
    ALTER TABLE public.retenciones ALTER COLUMN compra_directa_id TYPE bigint USING NULL;
  ELSE
    ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS compra_directa_id bigint;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'retenciones' AND column_name = 'servicio_directo_id' AND data_type = 'uuid') THEN
    ALTER TABLE public.retenciones ALTER COLUMN servicio_directo_id TYPE bigint USING NULL;
  ELSE
    ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS servicio_directo_id bigint;
  END IF;
END $$;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS empresa_id text DEFAULT 'empresa-mits';
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS valor_ut numeric(14,2) DEFAULT 43;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS anulada_motivo text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS anulada_por text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS declarada_at timestamptz;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS declarada_por text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS actor text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS actor_name text;
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.retenciones ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Si hay filas previas con comprobante_fecha nulo, inicializar con fecha_emision o fecha actual
UPDATE public.retenciones SET comprobante_fecha = coalesce(fecha_emision, current_date) WHERE comprobante_fecha IS NULL;

ALTER TABLE public.retenciones ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'retenciones' AND policyname = 'retenciones_select_auth') THEN
        CREATE POLICY "retenciones_select_auth" ON public.retenciones FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'retenciones' AND policyname = 'retenciones_insert_auth') THEN
        CREATE POLICY "retenciones_insert_auth" ON public.retenciones FOR INSERT TO authenticated WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'retenciones' AND policyname = 'retenciones_update_auth') THEN
        CREATE POLICY "retenciones_update_auth" ON public.retenciones FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS retenciones_tipo_estado_idx ON public.retenciones (tipo, estado);
CREATE INDEX IF NOT EXISTS retenciones_fecha_ix ON public.retenciones (comprobante_fecha);
CREATE INDEX IF NOT EXISTS retenciones_orden_idx ON public.retenciones (orden_id) WHERE orden_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS retenciones_empresa_idx ON public.retenciones (empresa_id);

-- 3) Catálogo de conceptos de retención ISLR
CREATE TABLE IF NOT EXISTS public.retenciones_conceptos (
    codigo text PRIMARY KEY,
    concepto text NOT NULL,
    pjd numeric(5,2) DEFAULT 0,
    pjnd numeric(5,2) DEFAULT 0,
    pnr numeric(5,2) DEFAULT 0,
    pnnr numeric(5,2) DEFAULT 0,
    base_pct numeric(5,2) DEFAULT 100,
    activo boolean NOT NULL DEFAULT true,
    orden int DEFAULT 0,
    nota text
);

ALTER TABLE public.retenciones_conceptos ADD COLUMN IF NOT EXISTS base_pct numeric(5,2) DEFAULT 100;
ALTER TABLE public.retenciones_conceptos ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;
ALTER TABLE public.retenciones_conceptos ADD COLUMN IF NOT EXISTS orden int DEFAULT 0;
ALTER TABLE public.retenciones_conceptos ADD COLUMN IF NOT EXISTS nota text;

ALTER TABLE public.retenciones_conceptos ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'retenciones_conceptos' AND policyname = 'retenciones_conceptos_read') THEN
        CREATE POLICY "retenciones_conceptos_read" ON public.retenciones_conceptos FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

INSERT INTO public.retenciones_conceptos (codigo, concepto, pjd, pjnd, pnr, pnnr, base_pct, activo, orden) VALUES
('001', 'Honorarios profesionales pagados a personas naturales residentes', 0, 0, 3.00, 34.00, 100, true, 1),
('002', 'Honorarios profesionales pagados a personas jurídicas domiciliadas', 5.00, 5.00, 0, 0, 100, true, 2),
('003', 'Comisiones mercantiles', 5.00, 5.00, 3.00, 34.00, 100, true, 3),
('004', 'Ejecución de obras y prestaciones de servicios en general', 2.00, 5.00, 1.00, 34.00, 100, true, 4),
('005', 'Arrendamiento de bienes inmuebles', 5.00, 5.00, 3.00, 34.00, 100, true, 5),
('006', 'Fletes y transporte de carga', 3.00, 5.00, 3.00, 34.00, 100, true, 6),
('007', 'Publicidad y propaganda comercial', 5.00, 5.00, 3.00, 34.00, 100, true, 7),
('008', 'Suministro de combustible y lubricantes', 1.00, 5.00, 1.00, 34.00, 100, true, 8)
ON CONFLICT (codigo) DO UPDATE SET
    concepto = EXCLUDED.concepto,
    pjd = EXCLUDED.pjd,
    pjnd = EXCLUDED.pjnd,
    pnr = EXCLUDED.pnr,
    pnnr = EXCLUDED.pnnr;

-- 4) Series y ajustes de retención
CREATE TABLE IF NOT EXISTS public.retencion_series (
    tipo text PRIMARY KEY CHECK (tipo IN ('IVA', 'ISLR', 'MUNICIPAL', 'ESTADAL')),
    numera boolean NOT NULL DEFAULT true,
    formato text NOT NULL DEFAULT 'N10' CHECK (formato IN ('AAAAMM8', 'N10')),
    modo text NOT NULL DEFAULT 'automatica' CHECK (modo IN ('automatica', 'manual')),
    inicial bigint NOT NULL DEFAULT 1 CHECK (inicial BETWEEN 1 AND 99999999),
    periodicidad text NOT NULL DEFAULT 'mensual' CHECK (periodicidad IN ('quincenal', 'mensual')),
    vence_dia smallint CHECK (vence_dia BETWEEN 1 AND 31),
    convive boolean NOT NULL DEFAULT false,
    solo_gt_desde date,
    motivo_cambio text,
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_por text
);

ALTER TABLE public.retencion_series ADD COLUMN IF NOT EXISTS numera boolean NOT NULL DEFAULT true;
ALTER TABLE public.retencion_series ADD COLUMN IF NOT EXISTS formato text NOT NULL DEFAULT 'N10';
ALTER TABLE public.retencion_series ADD COLUMN IF NOT EXISTS modo text NOT NULL DEFAULT 'automatica';
ALTER TABLE public.retencion_series ADD COLUMN IF NOT EXISTS inicial bigint NOT NULL DEFAULT 1;
ALTER TABLE public.retencion_series ADD COLUMN IF NOT EXISTS periodicidad text NOT NULL DEFAULT 'mensual';
ALTER TABLE public.retencion_series ADD COLUMN IF NOT EXISTS vence_dia smallint;
ALTER TABLE public.retencion_series ADD COLUMN IF NOT EXISTS convive boolean NOT NULL DEFAULT false;
ALTER TABLE public.retencion_series ADD COLUMN IF NOT EXISTS solo_gt_desde date;
ALTER TABLE public.retencion_series ADD COLUMN IF NOT EXISTS motivo_cambio text;
ALTER TABLE public.retencion_series ADD COLUMN IF NOT EXISTS actualizado_en timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.retencion_series ADD COLUMN IF NOT EXISTS actualizado_por text;

ALTER TABLE public.retencion_series ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'retencion_series' AND policyname = 'retencion_series_read') THEN
        CREATE POLICY "retencion_series_read" ON public.retencion_series FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'retencion_series' AND policyname = 'retencion_series_write') THEN
        CREATE POLICY "retencion_series_write" ON public.retencion_series FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;

INSERT INTO public.retencion_series (tipo, numera, formato, modo, inicial, periodicidad) VALUES
('IVA', true, 'AAAAMM8', 'automatica', 1, 'quincenal'),
('ISLR', true, 'AAAAMM8', 'automatica', 1, 'mensual'),
('MUNICIPAL', true, 'N10', 'automatica', 1, 'mensual'),
('ESTADAL', true, 'N10', 'automatica', 1, 'mensual')
ON CONFLICT (tipo) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.retencion_ajustes (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    otro_sistema_nombre text,
    otro_sistema_en_totales boolean NOT NULL DEFAULT false,
    agrupar_iva boolean NOT NULL DEFAULT false,
    motivo_cambio text,
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_por text
);

ALTER TABLE public.retencion_ajustes ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'retencion_ajustes' AND policyname = 'retencion_ajustes_read') THEN
        CREATE POLICY "retencion_ajustes_read" ON public.retencion_ajustes FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'retencion_ajustes' AND policyname = 'retencion_ajustes_write') THEN
        CREATE POLICY "retencion_ajustes_write" ON public.retencion_ajustes FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;

INSERT INTO public.retencion_ajustes (id, agrupar_iva)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

-- Grants para PostgREST API
GRANT ALL ON public.retenciones TO postgres, service_role, authenticated;
GRANT SELECT ON public.retenciones TO anon;
GRANT ALL ON public.retenciones_conceptos TO postgres, service_role, authenticated;
GRANT SELECT ON public.retenciones_conceptos TO anon;
GRANT ALL ON public.retencion_series TO postgres, service_role, authenticated;
GRANT SELECT ON public.retencion_series TO anon;
GRANT ALL ON public.retencion_ajustes TO postgres, service_role, authenticated;
GRANT SELECT ON public.retencion_ajustes TO anon;

-- 1b) Tabla de documentos fiscales (cabecera de facturas y notas para retenciones)
CREATE TABLE IF NOT EXISTS public.retencion_documentos (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rol                    text NOT NULL DEFAULT 'practicada' CHECK (rol IN ('practicada', 'recibida', 'sufrida')),
  tipo_documento         text NOT NULL DEFAULT 'factura' CHECK (tipo_documento IN ('factura', 'nota_debito', 'nota_credito')),
  documento_afectado_id  uuid REFERENCES public.retencion_documentos(id),
  factura_afectada_nro   text,
  proveedor_id           bigint REFERENCES public.proveedores(id),
  rif                    text,
  razon_social           text,
  sujeto                 text,
  factura_nro            text,
  factura_control        text,
  factura_fecha          date,
  factura_total          numeric(14,2) DEFAULT 0,
  exento                 numeric(14,2) DEFAULT 0,
  iva_alicuota           numeric(5,2),
  iva_monto              numeric(14,2),
  moneda                 text NOT NULL DEFAULT 'Bs',
  tasa                   numeric(18,6) DEFAULT 1,
  doc_kind               text,
  doc_id                 text,
  orden_id               bigint,
  compra_directa_id      bigint,
  servicio_directo_id    bigint,
  adjunto_id             uuid,
  empresa_id             text DEFAULT 'empresa-mits',
  operacion              text,
  concepto               text,
  nota                   text,
  periodo                text,
  actor                  text,
  actor_name             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.retencion_documentos ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.retencion_documentos TO postgres, service_role, authenticated;
GRANT SELECT ON public.retencion_documentos TO anon;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'retencion_documentos' AND policyname = 'retencion_documentos_select') THEN
    CREATE POLICY "retencion_documentos_select" ON public.retencion_documentos FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'retencion_documentos' AND policyname = 'retencion_documentos_write') THEN
    CREATE POLICY "retencion_documentos_write" ON public.retencion_documentos FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'retenciones_documento_id_fkey') THEN
    ALTER TABLE public.retenciones ADD CONSTRAINT retenciones_documento_id_fkey
      FOREIGN KEY (documento_id) REFERENCES public.retencion_documentos(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Funciones de escritura RPC para Retenciones (La Cantera: operaciones por función)
CREATE OR REPLACE FUNCTION public.guardar_retencion(
  p_id                            uuid default null,
  p_rol                           text default 'practicada',
  p_tipo                          text default 'iva',
  p_estado                        text default 'registrada',
  p_comprobante_nro               text default null,
  p_comprobante_periodo           text default null,
  p_comprobante_fecha             date default current_date,
  p_contraparte_nombre            text default null,
  p_contraparte_rif               text default null,
  p_sujeto                        text default null,
  p_factura_numero                text default null,
  p_factura_control               text default null,
  p_factura_fecha                 date default null,
  p_factura_total                 numeric default 0,
  p_base_imponible                numeric default 0,
  p_iva_alicuota                  numeric default null,
  p_iva_monto                     numeric default null,
  p_impuesto_causado              numeric default 0,
  p_porcentaje                    numeric default 0,
  p_concepto_codigo               text default null,
  p_concepto                      text default null,
  p_municipio                     text default null,
  p_sustraendo                    numeric default 0,
  p_monto                         numeric default 0,
  p_moneda                        text default 'Bs',
  p_tasa                          numeric default 1,
  p_base_bs                       numeric default null,
  p_monto_bs                      numeric default null,
  p_descripcion                   text default null,
  p_proveedor_id                  bigint default null,
  p_orden_id                      bigint default null,
  p_compra_directa_id             bigint default null,
  p_servicio_directo_id           bigint default null,
  p_documento_id                  uuid default null,
  p_empresa_id                    text default 'empresa-mits',
  p_valor_ut                      numeric default 43
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid := coalesce(p_id, gen_random_uuid());
BEGIN
  IF NOT (public.is_admin() OR public.puede('retenciones')) THEN
    RAISE EXCEPTION 'Sin permiso para registrar retenciones fiscales.' USING errcode = '42501';
  END IF;

  INSERT INTO public.retenciones (
    id, rol, tipo, estado, comprobante_nro, comprobante_periodo, comprobante_fecha,
    contraparte_nombre, contraparte_rif, sujeto, factura_numero, factura_control, factura_fecha,
    factura_total, base_imponible, iva_alicuota, iva_monto, impuesto_causado, porcentaje,
    concepto_codigo, concepto, municipio, sustraendo, monto, moneda, tasa, base_bs, monto_bs,
    descripcion, proveedor_id, orden_id, compra_directa_id, servicio_directo_id, documento_id,
    empresa_id, valor_ut, actor, actor_name
  ) VALUES (
    v_id, coalesce(p_rol, 'practicada'), p_tipo, coalesce(p_estado, 'registrada'),
    p_comprobante_nro, p_comprobante_periodo, coalesce(p_comprobante_fecha, current_date),
    trim(p_contraparte_nombre), upper(trim(p_contraparte_rif)), p_sujeto,
    trim(p_factura_numero), trim(p_factura_control), p_factura_fecha,
    coalesce(p_factura_total, 0), coalesce(p_base_imponible, 0), p_iva_alicuota, p_iva_monto,
    coalesce(p_impuesto_causado, 0), coalesce(p_porcentaje, 0), p_concepto_codigo, trim(p_concepto),
    p_municipio, coalesce(p_sustraendo, 0), coalesce(p_monto, 0), coalesce(p_moneda, 'Bs'),
    coalesce(p_tasa, 1), p_base_bs, p_monto_bs, trim(p_descripcion),
    p_proveedor_id, p_orden_id, p_compra_directa_id, p_servicio_directo_id, p_documento_id,
    coalesce(p_empresa_id, 'empresa-mits'), coalesce(p_valor_ut, 43),
    coalesce(auth.jwt() ->> 'email', current_user), nullif(trim(auth.jwt() ->> 'name'), '')
  )
  ON CONFLICT (id) DO UPDATE SET
    rol = EXCLUDED.rol,
    tipo = EXCLUDED.tipo,
    estado = EXCLUDED.estado,
    comprobante_nro = EXCLUDED.comprobante_nro,
    comprobante_periodo = EXCLUDED.comprobante_periodo,
    comprobante_fecha = EXCLUDED.comprobante_fecha,
    contraparte_nombre = EXCLUDED.contraparte_nombre,
    contraparte_rif = EXCLUDED.contraparte_rif,
    sujeto = EXCLUDED.sujeto,
    factura_numero = EXCLUDED.factura_numero,
    factura_control = EXCLUDED.factura_control,
    factura_fecha = EXCLUDED.factura_fecha,
    factura_total = EXCLUDED.factura_total,
    base_imponible = EXCLUDED.base_imponible,
    iva_alicuota = EXCLUDED.iva_alicuota,
    iva_monto = EXCLUDED.iva_monto,
    impuesto_causado = EXCLUDED.impuesto_causado,
    porcentaje = EXCLUDED.porcentaje,
    concepto_codigo = EXCLUDED.concepto_codigo,
    concepto = EXCLUDED.concepto,
    municipio = EXCLUDED.municipio,
    sustraendo = EXCLUDED.sustraendo,
    monto = EXCLUDED.monto,
    moneda = EXCLUDED.moneda,
    tasa = EXCLUDED.tasa,
    base_bs = EXCLUDED.base_bs,
    monto_bs = EXCLUDED.monto_bs,
    descripcion = EXCLUDED.descripcion,
    proveedor_id = EXCLUDED.proveedor_id,
    orden_id = EXCLUDED.orden_id,
    compra_directa_id = EXCLUDED.compra_directa_id,
    servicio_directo_id = EXCLUDED.servicio_directo_id,
    documento_id = EXCLUDED.documento_id,
    empresa_id = EXCLUDED.empresa_id,
    valor_ut = EXCLUDED.valor_ut,
    updated_at = now();

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.anular_retencion(p_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.puede_full('retenciones')) THEN
    RAISE EXCEPTION 'Sin permiso para anular retenciones fiscales.' USING errcode = '42501';
  END IF;

  IF length(trim(coalesce(p_motivo, ''))) < 3 THEN
    RAISE EXCEPTION 'Debe indicar el motivo de anulación de la retención.' USING errcode = '22023';
  END IF;

  UPDATE public.retenciones
     SET estado = 'anulada',
         anulada_motivo = trim(p_motivo),
         anulada_por = coalesce(auth.jwt() ->> 'email', current_user),
         updated_at = now()
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la retención especificada.' USING errcode = 'P0002';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.guardar_retencion(uuid, text, text, text, text, text, date, text, text, text, text, text, date, numeric, numeric, numeric, numeric, numeric, numeric, text, text, text, numeric, numeric, text, numeric, numeric, numeric, text, bigint, bigint, bigint, bigint, uuid, text, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.anular_retencion(uuid, text) TO authenticated, service_role;


-- Recargar cache de PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;
