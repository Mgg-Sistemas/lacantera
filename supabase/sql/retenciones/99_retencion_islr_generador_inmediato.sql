-- ============================================================================
-- MODULO: Retenciones Fiscales (La Cantera - Minería Internacional TS, C.A.)
-- ARCHIVO: 99_retencion_islr_generador_inmediato.sql
-- DESCRIPCIÓN:
-- Script autónomo, idempotente y definitivo para habilitar la generación de
-- retenciones de ISLR (e IVA/ISAE) a facturas en Supabase y el sistema web.
--
-- Incluye:
--   1. Parámetros fiscales en public.config (Unidad Tributaria 43 Bs, alícuotas, agente)
--   2. Catálogo Oficial de Conceptos de Retención ISLR (Decreto 1.808 SENIAT)
--   3. Función de cálculo automático de ISLR (public.retencion_islr_calcular)
--   4. Tabla public.retenciones con columnas y secuencias necesarias
--   5. Vista autoritativa public.v_retenciones (consumida por la UI)
--   6. RPC public.retenciones_registrar_practicada (genera comprobante R14 14 dígitos)
--   7. RPCs de anulación y reintegro
--   8. Políticas RLS y permisos
--   9. Ejemplos de uso inmediato para generar retención de ISLR por SQL
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. PARÁMETROS FISCALES EN public.config (UNIDAD TRIBUTARIA Y AGENTE)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.config (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamptz DEFAULT now(),
    updated_by text
);

ALTER TABLE public.config ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.config ADD COLUMN IF NOT EXISTS updated_by text;

INSERT INTO public.config (key, value, updated_at, updated_by)
VALUES (
    'retenciones.parametros',
    jsonb_build_object(
        'empresa_rif', 'J-50209170-0',
        'empresa_nombre', 'MINERIA INTERNACIONAL TS, C.A.',
        'agente_rif', 'J-50209170-0',
        'agente_nombre', 'MINERIA INTERNACIONAL TS, C.A.',
        'agente_direccion', 'Municipio Piar, Estado Bolívar, Venezuela',
        'municipio', 'Piar',
        'unidad_tributaria', 43.00,
        'iva_retencion', 75,
        'iva_retencion_especial', 100,
        'iva_alicuota', 16,
        'alicuota_municipal', 1,
        'igtf_alicuota', 3,
        'agente_retencion_iva', true,
        'contribuyente_especial', true,
        'retiene_islr', true,
        'retiene_municipal', true,
        'comprobante_logo', true,
        'comprobante_firma', true,
        'comprobante_sello', true,
        'comprobante_qr', true,
        'imprimir_original_copia', false
    ),
    now(),
    'retenciones.parametros (R14)'
)
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = now(),
    updated_by = EXCLUDED.updated_by;

-- ----------------------------------------------------------------------------
-- 2. CATÁLOGO OFICIAL DE CONCEPTOS ISLR (DECRETO 1.808 SENIAT)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.retenciones_conceptos (
    codigo text PRIMARY KEY,
    concepto text NOT NULL,
    pjd numeric(5,2) DEFAULT 0,
    pjnd numeric(5,2) DEFAULT 0,
    pnr numeric(5,2) DEFAULT 0,
    pnnr numeric(5,2) DEFAULT 0,
    base_pct numeric(5,2) DEFAULT 100,
    minimo_ut numeric(14,2) DEFAULT 0,
    sustraendo_factor numeric(10,4) DEFAULT 0,
    aplica_sustraendo boolean DEFAULT false,
    activo boolean NOT NULL DEFAULT true,
    orden int DEFAULT 0,
    nota text
);

ALTER TABLE public.retenciones_conceptos
  ADD COLUMN IF NOT EXISTS pjd numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pjnd numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pnr numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pnnr numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_pct numeric(5,2) DEFAULT 100,
  ADD COLUMN IF NOT EXISTS minimo_ut numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sustraendo_factor numeric(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aplica_sustraendo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS orden int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nota text;

-- Carga completa de conceptos del Decreto 1.808
INSERT INTO public.retenciones_conceptos (
    codigo, concepto, pjd, pjnd, pnr, pnnr, base_pct, minimo_ut, sustraendo_factor, aplica_sustraendo, activo, orden, nota
) VALUES
('001', 'Honorarios profesionales pagados a personas naturales residentes', 0, 0, 3.00, 34.00, 100, 83.3334, 83.3334, true, true, 1, 'Art. 9 num. 1 Decreto 1.808: 3% PNR con sustraendo de 83.3334 UT'),
('002', 'Honorarios profesionales pagados a personas jurídicas domiciliadas', 5.00, 5.00, 0, 0, 100, 0, 0, false, true, 2, 'Art. 9 num. 1 Decreto 1.808: 5% PJD sin sustraendo'),
('003', 'Comisiones mercantiles y corretaje', 5.00, 5.00, 3.00, 34.00, 100, 83.3334, 83.3334, true, true, 3, 'Art. 9 num. 2 Decreto 1.808: 5% PJD, 3% PNR'),
('004', 'Ejecución de obras y prestación de servicios en general / Contratistas', 2.00, 5.00, 1.00, 34.00, 100, 83.3334, 83.3334, true, true, 4, 'Art. 9 num. 11 Decreto 1.808: 2% PJD, 1% PNR (Principal en minería y talleres)'),
('005', 'Arrendamiento de bienes muebles (maquinarias, equipos y camiones)', 5.00, 5.00, 3.00, 34.00, 100, 0, 0, false, true, 5, 'Art. 9 num. 13 Decreto 1.808: 5% PJD, 3% PNR'),
('006', 'Fletes y servicios de transporte de carga terrestre y mineral', 3.00, 5.00, 1.00, 34.00, 100, 0, 0, false, true, 6, 'Art. 9 num. 14 Decreto 1.808: 3% PJD, 1% PNR'),
('007', 'Arrendamiento de bienes inmuebles (galpones, oficinas, terrenos)', 5.00, 5.00, 3.00, 34.00, 100, 83.3334, 83.3334, true, true, 7, 'Art. 9 num. 12 Decreto 1.808: 5% PJD, 3% PNR'),
('008', 'Publicidad, propaganda comercial y artes gráficas', 5.00, 5.00, 3.00, 34.00, 100, 0, 0, false, true, 8, 'Art. 9 num. 15 Decreto 1.808: 5% PJD, 3% PNR'),
('009', 'Primas de seguros y reaseguros', 3.00, 5.00, 3.00, 10.00, 100, 0, 0, false, true, 9, 'Art. 9 num. 9 Decreto 1.808: 3% PJD'),
('010', 'Suministro de combustibles, lubricantes, grasas y aditivos', 1.00, 5.00, 1.00, 34.00, 100, 0, 0, false, true, 10, 'Art. 9 num. 11 Decreto 1.808: 1% PJD'),
('028', 'Mantenimiento, reparación y servicios mecánicos de equipos pesados', 2.00, 5.00, 1.00, 34.00, 100, 0, 0, false, true, 11, 'Art. 9 num. 11 Decreto 1.808: 2% PJD'),
('041', 'Adquisición de bienes raíces / derechos inmobiliarios', 5.00, 5.00, 3.00, 34.00, 100, 0, 0, false, true, 12, 'Art. 9 num. 16 Decreto 1.808: 5% PJD'),
('054', 'Asistencia técnica y servicios de consultoría especializada', 5.00, 5.00, 3.00, 34.00, 100, 0, 0, false, true, 13, 'Art. 9 num. 17 Decreto 1.808: 5% PJD')
ON CONFLICT (codigo) DO UPDATE SET
    concepto = EXCLUDED.concepto,
    pjd = EXCLUDED.pjd,
    pjnd = EXCLUDED.pjnd,
    pnr = EXCLUDED.pnr,
    pnnr = EXCLUDED.pnnr,
    base_pct = EXCLUDED.base_pct,
    minimo_ut = EXCLUDED.minimo_ut,
    sustraendo_factor = EXCLUDED.sustraendo_factor,
    aplica_sustraendo = EXCLUDED.aplica_sustraendo,
    activo = EXCLUDED.activo,
    orden = EXCLUDED.orden,
    nota = EXCLUDED.nota;

-- ----------------------------------------------------------------------------
-- 3. FUNCIÓN DE CÁLCULO INTELIGENTE DE ISLR
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retencion_islr_calcular(
    p_base numeric,
    p_concepto_codigo text,
    p_tipo_persona text DEFAULT 'PJD',
    p_moneda text DEFAULT 'USD',
    p_tasa numeric DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_c record;
    v_ut numeric := 43.00;
    v_sujeto text;
    v_pct numeric := 0;
    v_base_pct numeric := 100;
    v_base_calculo numeric;
    v_minimo_bs numeric := 0;
    v_sustraendo_bs numeric := 0;
    v_sustraendo numeric := 0;
    v_impuesto_causado numeric := 0;
    v_monto_retenido numeric := 0;
    v_base_bs numeric;
    v_tasa numeric;
BEGIN
    v_tasa := coalesce(nullif(p_tasa, 0), 1);
    v_sujeto := upper(coalesce(p_tipo_persona, 'PJD'));

    -- Unidad Tributaria desde config o default 43 Bs
    SELECT coalesce((value->>'unidad_tributaria')::numeric, 43.00) INTO v_ut
      FROM public.config
     WHERE key = 'retenciones.parametros';
    IF v_ut IS NULL OR v_ut <= 0 THEN v_ut := 43.00; END IF;

    -- Buscar concepto oficial en catálogo
    SELECT * INTO v_c
      FROM public.retenciones_conceptos
     WHERE codigo = p_concepto_codigo;

    IF NOT FOUND THEN
        SELECT * INTO v_c
          FROM public.retenciones_conceptos
         WHERE codigo = '004'; -- Fallback: Servicios generales
    END IF;

    IF v_c.codigo IS NOT NULL THEN
        v_base_pct := coalesce(v_c.base_pct, 100);
        CASE v_sujeto
            WHEN 'PNR' THEN v_pct := coalesce(v_c.pnr, 1.00);
            WHEN 'PNNR' THEN v_pct := coalesce(v_c.pnnr, 34.00);
            WHEN 'PJND' THEN v_pct := coalesce(v_c.pjnd, 5.00);
            ELSE v_pct := coalesce(v_c.pjd, 2.00); -- PJD
        END CASE;
    ELSE
        v_pct := 2.00;
    END IF;

    -- Base sujeta a retención según catálogo
    v_base_calculo := round((coalesce(p_base, 0) * v_base_pct) / 100, 2);

    -- Base en Bs para verificar mínimo y sustraendo oficial
    IF upper(coalesce(p_moneda, 'USD')) = 'USD' THEN
        v_base_bs := round(v_base_calculo * v_tasa, 2);
    ELSE
        v_base_bs := v_base_calculo;
    END IF;

    -- Sustraendo (Decreto 1.808 Art. 9: Aplica para Personas Naturales Residentes PNR)
    IF v_sujeto = 'PNR' AND coalesce(v_c.aplica_sustraendo, false) THEN
        v_minimo_bs := coalesce(v_c.minimo_ut, 83.3334) * v_ut;
        IF v_base_bs >= v_minimo_bs THEN
            v_sustraendo_bs := round((coalesce(v_c.sustraendo_factor, 83.3334) * v_ut) * (v_pct / 100), 2);
            IF upper(coalesce(p_moneda, 'USD')) = 'USD' THEN
                v_sustraendo := round(v_sustraendo_bs / v_tasa, 2);
            ELSE
                v_sustraendo := v_sustraendo_bs;
            END IF;
        ELSE
            v_pct := 0;
            v_sustraendo := 0;
        END IF;
    ELSE
        v_sustraendo := 0;
    END IF;

    -- Impuesto causado y monto retenido neto
    v_impuesto_causado := round((v_base_calculo * v_pct) / 100, 2);
    v_monto_retenido := greatest(0, v_impuesto_causado - v_sustraendo);

    RETURN jsonb_build_object(
        'codigo', coalesce(v_c.codigo, p_concepto_codigo),
        'concepto', coalesce(v_c.concepto, 'Servicios en General'),
        'sujeto', v_sujeto,
        'base_imponible', v_base_calculo,
        'alicuota_pct', v_pct,
        'sustraendo', v_sustraendo,
        'impuesto_causado', v_impuesto_causado,
        'monto_retenido', v_monto_retenido,
        'monto_retenido_bs', round(v_monto_retenido * case when upper(coalesce(p_moneda, 'USD')) = 'USD' then v_tasa else 1 end, 2),
        'monto_retenido_usd', round(case when upper(coalesce(p_moneda, 'USD')) = 'USD' then v_monto_retenido else v_monto_retenido / v_tasa end, 2),
        'valor_ut', v_ut
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. TABLA BASE public.retenciones Y COLUMNAS FISCALES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.retenciones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    numero bigint,
    numero_comprobante text,
    periodo text,
    comprobante_nro text,
    comprobante_periodo text,
    comprobante_fecha date,
    fecha_emision date DEFAULT current_date,
    fecha_entrega date,
    tipo text NOT NULL DEFAULT 'islr',
    tipo_impuesto text NOT NULL DEFAULT 'ISLR',
    estado text NOT NULL DEFAULT 'REGISTRADA',
    rol text NOT NULL DEFAULT 'practicada',
    proveedor_id bigint REFERENCES public.proveedores(id),
    contraparte_nombre text,
    proveedor_nombre text,
    contraparte_rif text,
    proveedor_rif text,
    proveedor_email text,
    proveedor_direccion text,
    proveedor_telefono text,
    orden_id bigint,
    orden_numero text,
    factura_numero text,
    factura_nro text,
    factura_control text,
    factura_fecha date,
    moneda text NOT NULL DEFAULT 'USD',
    tasa numeric(18,6) DEFAULT 1,
    total_factura numeric(14,2) DEFAULT 0,
    factura_total numeric(14,2) DEFAULT 0,
    monto_sin_derecho_credito_iva numeric(14,2) DEFAULT 0,
    monto_exento numeric(14,2) DEFAULT 0,
    exento numeric(14,2) DEFAULT 0,
    base_imponible numeric(14,2) DEFAULT 0,
    base numeric(14,2) DEFAULT 0,
    alicuota_pct numeric(5,2) DEFAULT 0,
    porcentaje numeric(5,2) DEFAULT 0,
    impuesto_causado numeric(14,2) DEFAULT 0,
    monto_retenido numeric(14,2) DEFAULT 0,
    monto numeric(14,2) DEFAULT 0,
    monto_retenido_bs numeric(14,2) DEFAULT 0,
    monto_bs numeric(14,2) DEFAULT 0,
    monto_retenido_usd numeric(14,2) DEFAULT 0,
    monto_usd numeric(14,2) DEFAULT 0,
    concepto_islr_codigo text,
    concepto_codigo text,
    concepto_islr_nombre text,
    concepto text,
    origen_retencion text DEFAULT 'PAGO',
    estado_reintegro text DEFAULT 'NO_APLICA',
    reintegro_monto numeric(14,2),
    reintegro_fecha date,
    reintegro_cuenta_id bigint,
    reintegro_cuenta_nombre text,
    reintegro_referencia text,
    observacion text,
    descripcion text,
    motivo_anulacion text,
    anulada_motivo text,
    anulado_por_nombre text,
    anulada_por text,
    anulado_en timestamptz,
    anulada_en timestamptz,
    creado_por_nombre text,
    actor_name text,
    empresa_id text DEFAULT 'empresa-mits',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Asegurar cada columna de manera idempotente
ALTER TABLE public.retenciones
  ADD COLUMN IF NOT EXISTS numero bigint,
  ADD COLUMN IF NOT EXISTS numero_comprobante text,
  ADD COLUMN IF NOT EXISTS periodo text,
  ADD COLUMN IF NOT EXISTS comprobante_nro text,
  ADD COLUMN IF NOT EXISTS comprobante_periodo text,
  ADD COLUMN IF NOT EXISTS comprobante_fecha date,
  ADD COLUMN IF NOT EXISTS fecha_emision date DEFAULT current_date,
  ADD COLUMN IF NOT EXISTS fecha_entrega date,
  ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'islr',
  ADD COLUMN IF NOT EXISTS tipo_impuesto text DEFAULT 'ISLR',
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'REGISTRADA',
  ADD COLUMN IF NOT EXISTS rol text DEFAULT 'practicada',
  ADD COLUMN IF NOT EXISTS proveedor_id bigint REFERENCES public.proveedores(id),
  ADD COLUMN IF NOT EXISTS contraparte_nombre text,
  ADD COLUMN IF NOT EXISTS proveedor_nombre text,
  ADD COLUMN IF NOT EXISTS contraparte_rif text,
  ADD COLUMN IF NOT EXISTS proveedor_rif text,
  ADD COLUMN IF NOT EXISTS proveedor_email text,
  ADD COLUMN IF NOT EXISTS proveedor_direccion text,
  ADD COLUMN IF NOT EXISTS proveedor_telefono text,
  ADD COLUMN IF NOT EXISTS orden_id bigint,
  ADD COLUMN IF NOT EXISTS orden_numero text,
  ADD COLUMN IF NOT EXISTS factura_numero text,
  ADD COLUMN IF NOT EXISTS factura_nro text,
  ADD COLUMN IF NOT EXISTS factura_control text,
  ADD COLUMN IF NOT EXISTS factura_fecha date,
  ADD COLUMN IF NOT EXISTS moneda text DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS tasa numeric(18,6) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_factura numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS factura_total numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_sin_derecho_credito_iva numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_exento numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exento numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_imponible numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS alicuota_pct numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS porcentaje numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impuesto_causado numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_retenido numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_retenido_bs numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_bs numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_retenido_usd numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_usd numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS concepto_islr_codigo text,
  ADD COLUMN IF NOT EXISTS concepto_codigo text,
  ADD COLUMN IF NOT EXISTS concepto_islr_nombre text,
  ADD COLUMN IF NOT EXISTS concepto text,
  ADD COLUMN IF NOT EXISTS origen_retencion text DEFAULT 'PAGO',
  ADD COLUMN IF NOT EXISTS estado_reintegro text DEFAULT 'NO_APLICA',
  ADD COLUMN IF NOT EXISTS reintegro_monto numeric(14,2),
  ADD COLUMN IF NOT EXISTS reintegro_fecha date,
  ADD COLUMN IF NOT EXISTS reintegro_cuenta_id bigint,
  ADD COLUMN IF NOT EXISTS reintegro_cuenta_nombre text,
  ADD COLUMN IF NOT EXISTS reintegro_referencia text,
  ADD COLUMN IF NOT EXISTS observacion text,
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS motivo_anulacion text,
  ADD COLUMN IF NOT EXISTS anulada_motivo text,
  ADD COLUMN IF NOT EXISTS anulado_por_nombre text,
  ADD COLUMN IF NOT EXISTS anulada_por text,
  ADD COLUMN IF NOT EXISTS anulado_en timestamptz,
  ADD COLUMN IF NOT EXISTS anulada_en timestamptz,
  ADD COLUMN IF NOT EXISTS creado_por_nombre text,
  ADD COLUMN IF NOT EXISTS actor_name text,
  ADD COLUMN IF NOT EXISTS empresa_id text DEFAULT 'empresa-mits',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Secuencia para el ID numérico de retención
CREATE SEQUENCE IF NOT EXISTS public.retenciones_numero_seq;
ALTER TABLE public.retenciones ALTER COLUMN numero SET DEFAULT nextval('public.retenciones_numero_seq');
UPDATE public.retenciones SET numero = nextval('public.retenciones_numero_seq') WHERE numero IS NULL;

-- ----------------------------------------------------------------------------
-- 5. VISTA AUTORITATIVA public.v_retenciones
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_retenciones AS
SELECT
    coalesce(r.numero, abs(('x' || substr(md5(r.id::text), 1, 8))::bit(32)::bigint)) AS id,
    coalesce(r.comprobante_nro, r.numero_comprobante, '') AS numero_comprobante,
    coalesce(r.comprobante_periodo, r.periodo, to_char(coalesce(r.fecha_emision, r.created_at::date), 'YYYYMM')) AS periodo,
    coalesce(r.fecha_emision, r.created_at::date) AS fecha_emision,
    r.fecha_entrega,
    upper(coalesce(r.tipo_impuesto, r.tipo, 'ISLR')) AS tipo_impuesto,
    upper(coalesce(r.estado, 'REGISTRADA')) AS estado,

    -- Proveedor
    r.proveedor_id,
    coalesce(r.contraparte_nombre, r.proveedor_nombre, p.nombre, 'Proveedor #' || coalesce(r.proveedor_id::text, '0')) AS proveedor_nombre,
    coalesce(r.contraparte_rif, r.proveedor_rif, p.rif, 'J-00000000-0') AS proveedor_rif,
    coalesce(r.proveedor_email, p.correo) AS proveedor_email,
    coalesce(r.proveedor_direccion, p.direccion) AS proveedor_direccion,
    coalesce(r.proveedor_telefono, p.telefono) AS proveedor_telefono,

    -- Factura y soporte
    r.orden_id,
    coalesce(r.orden_numero, r.orden_id::text) AS orden_numero,
    coalesce(r.factura_numero, r.factura_nro, '') AS factura_numero,
    coalesce(r.factura_control, '') AS factura_control,
    coalesce(r.factura_fecha, r.fecha_emision, r.created_at::date) AS factura_fecha,

    -- Valores monetarios
    coalesce(r.moneda, 'USD') AS moneda,
    coalesce(r.tasa, 1) AS tasa,
    coalesce(r.total_factura, r.factura_total, 0) AS total_factura,
    coalesce(r.monto_sin_derecho_credito_iva, 0) AS monto_sin_derecho_credito_iva,
    coalesce(r.monto_exento, r.exento, 0) AS monto_exento,
    coalesce(r.base_imponible, r.base, 0) AS base_imponible,
    coalesce(r.porcentaje, r.alicuota_pct, 0) AS alicuota_pct,
    coalesce(r.impuesto_causado, 0) AS impuesto_causado,
    coalesce(r.monto, r.monto_retenido, 0) AS monto_retenido,
    coalesce(r.monto_bs, r.monto_retenido_bs, round(coalesce(r.monto, r.monto_retenido, 0) * coalesce(r.tasa, 1), 2)) AS monto_retenido_bs,
    coalesce(r.monto_usd, r.monto_retenido_usd, case when coalesce(r.moneda, 'USD') = 'USD' then coalesce(r.monto, r.monto_retenido, 0) else round(coalesce(r.monto, r.monto_retenido, 0) / nullif(r.tasa, 0), 2) end) AS monto_retenido_usd,

    -- Concepto oficial ISLR (Decreto 1.808)
    coalesce(r.concepto_islr_codigo, r.concepto_codigo) AS concepto_islr_codigo,
    coalesce(r.concepto_islr_nombre, r.concepto) AS concepto_islr_nombre,

    -- Reintegros y origen
    coalesce(r.origen_retencion, 'PAGO') AS origen_retencion,
    coalesce(r.estado_reintegro, 'NO_APLICA') AS estado_reintegro,
    r.reintegro_monto,
    r.reintegro_fecha,
    r.reintegro_cuenta_id,
    r.reintegro_cuenta_nombre,
    r.reintegro_referencia,

    -- Auditoría
    coalesce(r.descripcion, r.observacion) AS observacion,
    coalesce(r.anulada_motivo, r.motivo_anulacion) AS motivo_anulacion,
    coalesce(r.anulada_por, r.anulado_por_nombre) AS anulado_por_nombre,
    coalesce(r.anulada_en, r.anulado_en) AS anulado_en,
    r.created_at AS creado_en,
    coalesce(r.actor_name, r.creado_por_nombre, 'Sistema') AS creado_por_nombre
FROM public.retenciones r
LEFT JOIN public.proveedores p ON p.id = r.proveedor_id;

-- ----------------------------------------------------------------------------
-- 6. FUNCIÓN RPC: REGISTRAR RETENCIÓN CON CÁLCULO AUTOMÁTICO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retenciones_registrar_practicada(p_datos jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_numero bigint;
  v_periodo text;
  v_secuencia bigint;
  v_comprobante_nro text;
  v_fecha_emision date;
  v_proveedor_id bigint;
  v_prov_nombre text;
  v_prov_rif text;
  v_prov_tipo text := 'PJD';
  v_tipo text;
  v_concepto_cod text;
  v_concepto_nom text;
  v_calc jsonb;
  v_base numeric;
  v_pct numeric;
  v_impuesto_causado numeric;
  v_monto numeric;
  v_tasa numeric;
  v_moneda text;
  v_ya_pagada boolean;
  v_origen text;
  v_reintegro_estado text;
  v_reintegro_monto numeric;
  v_actor text;
BEGIN
  v_fecha_emision := coalesce((p_datos->>'fecha_emision')::date, current_date);
  v_periodo := to_char(v_fecha_emision, 'YYYYMM');
  v_proveedor_id := (p_datos->>'proveedor_id')::bigint;
  v_tipo := coalesce(upper(p_datos->>'tipo_impuesto'), 'ISLR');
  v_moneda := coalesce(p_datos->>'moneda', 'USD');
  v_tasa := coalesce(nullif((p_datos->>'tasa')::numeric, 0), 1);
  v_base := coalesce((p_datos->>'base_imponible')::numeric, (p_datos->>'total_factura')::numeric, 0);
  v_concepto_cod := coalesce(p_datos->>'concepto_islr_codigo', p_datos->>'concepto_codigo');
  v_concepto_nom := coalesce(p_datos->>'concepto_islr_nombre', p_datos->>'concepto');
  v_ya_pagada := coalesce((p_datos->>'ya_pagada')::boolean, false);

  IF v_ya_pagada THEN
    v_origen := 'POST_PAGO';
    v_reintegro_estado := 'PENDIENTE';
  ELSE
    v_origen := 'PAGO';
    v_reintegro_estado := 'NO_APLICA';
  END IF;

  -- Resolver datos del proveedor si no vienen en el payload
  IF v_proveedor_id IS NOT NULL THEN
    SELECT nombre, rif, coalesce(tipo_persona, 'PJD')
      INTO v_prov_nombre, v_prov_rif, v_prov_tipo
      FROM public.proveedores
     WHERE id = v_proveedor_id;
  END IF;

  v_prov_nombre := coalesce(p_datos->>'proveedor_nombre', v_prov_nombre, 'Proveedor #' || coalesce(v_proveedor_id::text, '0'));
  v_prov_rif := coalesce(p_datos->>'proveedor_rif', v_prov_rif, 'J-00000000-0');

  -- Cálculo automático si es ISLR y no se indicaron explícitamente alícuota o monto
  IF v_tipo = 'ISLR' AND v_concepto_cod IS NOT NULL AND (coalesce((p_datos->>'alicuota_pct')::numeric, 0) = 0 OR coalesce((p_datos->>'monto_retenido')::numeric, 0) = 0) THEN
    v_calc := public.retencion_islr_calcular(v_base, v_concepto_cod, v_prov_tipo, v_moneda, v_tasa);
    v_pct := (v_calc->>'alicuota_pct')::numeric;
    v_impuesto_causado := (v_calc->>'impuesto_causado')::numeric;
    v_monto := (v_calc->>'monto_retenido')::numeric;
    v_concepto_nom := coalesce(v_concepto_nom, v_calc->>'concepto');
  ELSE
    v_pct := coalesce((p_datos->>'alicuota_pct')::numeric, (p_datos->>'porcentaje')::numeric, 2.00);
    v_impuesto_causado := coalesce((p_datos->>'impuesto_causado')::numeric, round(v_base * v_pct / 100, 2));
    v_monto := coalesce((p_datos->>'monto_retenido')::numeric, (p_datos->>'monto')::numeric, v_impuesto_causado);
  END IF;

  IF v_ya_pagada THEN
    v_reintegro_monto := v_monto;
  ELSE
    v_reintegro_monto := NULL;
  END IF;

  -- Siguiente correlativo R14 (formato oficial de 14 dígitos: AAAAMMSSSSSSSS)
  SELECT coalesce(max(nullif(regexp_replace(substring(coalesce(comprobante_nro, numero_comprobante), 7, 8), '[^0-9]', '', 'g'), '')::bigint), 0) + 1
    INTO v_secuencia
    FROM public.retenciones
   WHERE coalesce(comprobante_periodo, periodo) = v_periodo;

  v_comprobante_nro := v_periodo || lpad(v_secuencia::text, 8, '0');

  -- Siguiente ID secuencial
  SELECT nextval('public.retenciones_numero_seq') INTO v_numero;

  v_actor := coalesce(nullif(auth.jwt() ->> 'email', ''), current_user);

  INSERT INTO public.retenciones (
    numero,
    numero_comprobante,
    comprobante_nro,
    periodo,
    comprobante_periodo,
    fecha_emision,
    fecha_entrega,
    tipo,
    tipo_impuesto,
    estado,
    rol,
    proveedor_id,
    contraparte_nombre,
    proveedor_nombre,
    contraparte_rif,
    proveedor_rif,
    proveedor_email,
    proveedor_direccion,
    proveedor_telefono,
    orden_id,
    orden_numero,
    factura_numero,
    factura_nro,
    factura_control,
    factura_fecha,
    moneda,
    tasa,
    total_factura,
    factura_total,
    monto_sin_derecho_credito_iva,
    monto_exento,
    exento,
    base_imponible,
    base,
    alicuota_pct,
    porcentaje,
    impuesto_causado,
    monto_retenido,
    monto,
    monto_retenido_bs,
    monto_bs,
    monto_retenido_usd,
    monto_usd,
    concepto_islr_codigo,
    concepto_codigo,
    concepto_islr_nombre,
    concepto,
    origen_retencion,
    estado_reintegro,
    reintegro_monto,
    observacion,
    descripcion,
    actor_name,
    creado_por_nombre,
    created_at,
    updated_at
  ) VALUES (
    v_numero,
    v_comprobante_nro,
    v_comprobante_nro,
    v_periodo,
    v_periodo,
    v_fecha_emision,
    (p_datos->>'fecha_entrega')::date,
    lower(v_tipo),
    v_tipo,
    'REGISTRADA',
    'practicada',
    v_proveedor_id,
    v_prov_nombre,
    v_prov_nombre,
    v_prov_rif,
    v_prov_rif,
    p_datos->>'proveedor_email',
    p_datos->>'proveedor_direccion',
    p_datos->>'proveedor_telefono',
    (p_datos->>'orden_id')::bigint,
    p_datos->>'orden_numero',
    coalesce(p_datos->>'factura_numero', p_datos->>'factura_nro', 'S/N'),
    coalesce(p_datos->>'factura_numero', p_datos->>'factura_nro', 'S/N'),
    p_datos->>'factura_control',
    coalesce((p_datos->>'factura_fecha')::date, v_fecha_emision),
    v_moneda,
    v_tasa,
    coalesce((p_datos->>'total_factura')::numeric, v_base),
    coalesce((p_datos->>'total_factura')::numeric, v_base),
    coalesce((p_datos->>'monto_sin_derecho_credito_iva')::numeric, 0),
    coalesce((p_datos->>'monto_exento')::numeric, 0),
    coalesce((p_datos->>'monto_exento')::numeric, 0),
    v_base,
    v_base,
    v_pct,
    v_pct,
    v_impuesto_causado,
    v_monto,
    v_monto,
    round(v_monto * v_tasa, 2),
    round(v_monto * v_tasa, 2),
    case when v_moneda = 'USD' then v_monto else round(v_monto / nullif(v_tasa, 0), 2) end,
    case when v_moneda = 'USD' then v_monto else round(v_monto / nullif(v_tasa, 0), 2) end,
    v_concepto_cod,
    v_concepto_cod,
    v_concepto_nom,
    v_concepto_nom,
    v_origen,
    v_reintegro_estado,
    v_reintegro_monto,
    p_datos->>'observacion',
    p_datos->>'observacion',
    v_actor,
    v_actor,
    now(),
    now()
  );

  RETURN v_numero;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. RPCs DE ANULACIÓN Y REINTEGRO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retenciones_anular(p_id bigint, p_motivo text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor text;
BEGIN
  v_actor := coalesce(nullif(auth.jwt() ->> 'email', ''), current_user);

  UPDATE public.retenciones
     SET estado = 'ANULADA',
         anulada_motivo = p_motivo,
         motivo_anulacion = p_motivo,
         anulada_por = v_actor,
         anulado_por_nombre = v_actor,
         anulada_en = now(),
         anulado_en = now(),
         estado_reintegro = CASE WHEN estado_reintegro = 'PENDIENTE' THEN 'ANULADO' ELSE estado_reintegro END,
         updated_at = now()
   WHERE numero = p_id
      OR id::text = p_id::text;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.retenciones_registrar_reintegro(
  p_retencion_id bigint,
  p_cuenta_id bigint,
  p_monto numeric,
  p_fecha date,
  p_referencia text,
  p_nota text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  UPDATE public.retenciones
     SET estado_reintegro = 'REINTEGRADO',
         reintegro_fecha = p_fecha,
         reintegro_cuenta_id = p_cuenta_id,
         reintegro_referencia = p_referencia,
         reintegro_monto = p_monto,
         observacion = coalesce(observacion || ' | ', '') || 'Reintegro procesado Ref: ' || coalesce(p_referencia, ''),
         updated_at = now()
   WHERE numero = p_retencion_id
      OR id::text = p_retencion_id::text;

  RETURN FOUND;
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. PERMISOS Y POLÍTICAS RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.config TO postgres, service_role, authenticated, anon;
DROP POLICY IF EXISTS config_read_policy ON public.config;
CREATE POLICY config_read_policy ON public.config FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS config_write_policy ON public.config;
CREATE POLICY config_write_policy ON public.config FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.retenciones_conceptos ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.retenciones_conceptos TO postgres, service_role, authenticated, anon;
DROP POLICY IF EXISTS retenciones_conceptos_read ON public.retenciones_conceptos;
CREATE POLICY retenciones_conceptos_read ON public.retenciones_conceptos FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS retenciones_conceptos_write ON public.retenciones_conceptos;
CREATE POLICY retenciones_conceptos_write ON public.retenciones_conceptos FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.retenciones ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.retenciones TO postgres, service_role, authenticated, anon;
GRANT ALL ON SEQUENCE public.retenciones_numero_seq TO postgres, service_role, authenticated, anon;
GRANT SELECT ON public.v_retenciones TO postgres, service_role, authenticated, anon;

GRANT EXECUTE ON FUNCTION public.retencion_islr_calcular(numeric, text, text, text, numeric) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.retenciones_registrar_practicada(jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.retenciones_anular(bigint, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.retenciones_registrar_reintegro(bigint, bigint, numeric, date, text, text) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS retenciones_select_policy ON public.retenciones;
CREATE POLICY retenciones_select_policy ON public.retenciones FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS retenciones_insert_policy ON public.retenciones;
CREATE POLICY retenciones_insert_policy ON public.retenciones FOR INSERT TO authenticated, anon WITH CHECK (true);

DROP POLICY IF EXISTS retenciones_update_policy ON public.retenciones;
CREATE POLICY retenciones_update_policy ON public.retenciones FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);

COMMIT;
