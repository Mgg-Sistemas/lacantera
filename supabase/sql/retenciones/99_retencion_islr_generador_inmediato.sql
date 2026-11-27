-- ============================================================================
-- MODULO: Retenciones Fiscales (La Cantera - Minería Internacional TS, C.A.)
-- ARCHIVO: 99_retencion_islr_generador_inmediato.sql
-- DESCRIPCIÓN:
-- Script autónomo, idempotente y definitivo para habilitar la generación de
-- retenciones de ISLR (e IVA/ISAE) a facturas en Supabase y el sistema web.
--
-- Incluye:
--   1. Columnas y secuencias necesarias en public.retenciones
--   2. Vista autoritativa public.v_retenciones (consumida por la UI)
--   3. RPC public.retenciones_registrar_practicada (genera comprobante R14 14 dígitos)
--   4. RPCs de anulación y reintegro
--   5. Políticas RLS y permisos
--   6. Consulta de ejemplo para generar 1 retención de ISLR a una factura inmediatamente
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. TABLA BASE public.retenciones Y COLUMNAS FISCALES
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
-- 2. VISTA AUTORITATIVA public.v_retenciones
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
-- 3. FUNCIÓN RPC: REGISTRAR RETENCIÓN PRACTICADA (ISLR / IVA)
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
  v_tipo text;
  v_base numeric;
  v_pct numeric;
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
  v_tasa := coalesce((p_datos->>'tasa')::numeric, 1);
  v_base := coalesce((p_datos->>'base_imponible')::numeric, 0);
  v_pct := coalesce((p_datos->>'alicuota_pct')::numeric, (p_datos->>'porcentaje')::numeric, 0);
  v_monto := coalesce((p_datos->>'monto_retenido')::numeric, (p_datos->>'monto')::numeric, round(v_base * v_pct / 100, 2));
  v_ya_pagada := coalesce((p_datos->>'ya_pagada')::boolean, false);

  IF v_ya_pagada THEN
    v_origen := 'POST_PAGO';
    v_reintegro_estado := 'PENDIENTE';
    v_reintegro_monto := v_monto;
  ELSE
    v_origen := 'PAGO';
    v_reintegro_estado := 'NO_APLICA';
    v_reintegro_monto := NULL;
  END IF;

  -- Resolver nombre y RIF de proveedor si no vienen en el payload
  IF v_proveedor_id IS NOT NULL THEN
    SELECT nombre, rif INTO v_prov_nombre, v_prov_rif
      FROM public.proveedores
     WHERE id = v_proveedor_id;
  END IF;

  v_prov_nombre := coalesce(p_datos->>'proveedor_nombre', v_prov_nombre, 'Proveedor #' || coalesce(v_proveedor_id::text, '0'));
  v_prov_rif := coalesce(p_datos->>'proveedor_rif', v_prov_rif, 'J-00000000-0');

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
    coalesce((p_datos->>'total_factura')::numeric, 0),
    coalesce((p_datos->>'total_factura')::numeric, 0),
    coalesce((p_datos->>'monto_sin_derecho_credito_iva')::numeric, 0),
    coalesce((p_datos->>'monto_exento')::numeric, 0),
    coalesce((p_datos->>'monto_exento')::numeric, 0),
    v_base,
    v_base,
    v_pct,
    v_pct,
    coalesce((p_datos->>'impuesto_causado')::numeric, round(v_base * v_pct / 100, 2)),
    v_monto,
    v_monto,
    round(v_monto * v_tasa, 2),
    round(v_monto * v_tasa, 2),
    case when v_moneda = 'USD' then v_monto else round(v_monto / nullif(v_tasa, 0), 2) end,
    case when v_moneda = 'USD' then v_monto else round(v_monto / nullif(v_tasa, 0), 2) end,
    p_datos->>'concepto_islr_codigo',
    p_datos->>'concepto_islr_codigo',
    p_datos->>'concepto_islr_nombre',
    p_datos->>'concepto_islr_nombre',
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
-- 4. FUNCIÓN RPC: ANULAR RETENCIÓN
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

-- ----------------------------------------------------------------------------
-- 5. FUNCIÓN RPC: REGISTRAR REINTEGRO DE RETENCIÓN POST-PAGO
-- ----------------------------------------------------------------------------
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
-- 6. PERMISOS Y POLÍTICAS RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.retenciones ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.retenciones TO postgres, service_role, authenticated, anon;
GRANT ALL ON SEQUENCE public.retenciones_numero_seq TO postgres, service_role, authenticated, anon;
GRANT SELECT ON public.v_retenciones TO postgres, service_role, authenticated, anon;

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

-- ============================================================================
-- EJEMPLO DE USO INMEDIATO:
-- Ejecute este bloque en Supabase para generar 1 retención de ISLR a una factura:
-- ============================================================================
/*
SELECT public.retenciones_registrar_practicada(
  jsonb_build_object(
    'proveedor_id', 1,
    'proveedor_nombre', 'TRANSPORTE Y SERVICIOS MINEROS EL CALLAO, C.A.',
    'proveedor_rif', 'J-31456789-0',
    'factura_numero', '00045892',
    'factura_control', '00-112233',
    'factura_fecha', current_date,
    'fecha_emision', current_date,
    'tipo_impuesto', 'ISLR',
    'concepto_islr_codigo', '002',
    'concepto_islr_nombre', 'Servicios Generales y Contratistas (2%)',
    'moneda', 'USD',
    'tasa', 55.40,
    'total_factura', 1160.00,
    'base_imponible', 1000.00,
    'alicuota_pct', 2.00,
    'impuesto_causado', 20.00,
    'monto_retenido', 20.00,
    'ya_pagada', false,
    'observacion', 'Retención de ISLR emitida para factura 00045892'
  )
);

-- Para verificar el comprobante generado:
SELECT id, numero_comprobante, periodo, fecha_emision, tipo_impuesto, estado,
       proveedor_nombre, factura_numero, total_factura, base_imponible,
       alicuota_pct, monto_retenido, moneda
  FROM public.v_retenciones
 ORDER BY id DESC
 LIMIT 1;
*/
