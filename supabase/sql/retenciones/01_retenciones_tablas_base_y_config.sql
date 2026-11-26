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
    updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'config' AND policyname = 'config read auth') THEN
        CREATE POLICY "config read auth" ON public.config FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'config' AND policyname = 'config_retenciones_parametros_insert') THEN
        CREATE POLICY config_retenciones_parametros_insert ON public.config FOR INSERT TO authenticated
        WITH CHECK (key = 'retenciones.parametros');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'config' AND policyname = 'config_retenciones_parametros_update') THEN
        CREATE POLICY config_retenciones_parametros_update ON public.config FOR UPDATE TO authenticated
        USING (key = 'retenciones.parametros') WITH CHECK (key = 'retenciones.parametros');
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
        'es_agente_retencion_iva', true,
        'es_contribuyente_especial', false,
        'retiene_islr', true,
        'retiene_municipal', true,
        'imprimir_original_y_copia', true,
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
    orden_id uuid,
    compra_directa_id uuid,
    servicio_directo_id uuid,
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
('ISLR', true, 'N10', 'automatica', 1, 'mensual'),
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

COMMIT;
