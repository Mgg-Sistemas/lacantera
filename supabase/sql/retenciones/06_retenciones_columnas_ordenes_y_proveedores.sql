-- ============================================================
-- ESTADO: PENDIENTE DE APLICAR
-- MODULO: Retenciones Fiscales e Integración Compras (Minería Internacional TS, C.A.)
-- ARCHIVO: 06_retenciones_columnas_ordenes_y_proveedores.sql
--
-- DESCRIPCIÓN:
-- Integra las columnas tributarias y de momento de retención en `public.ordenes`
-- y los datos fiscales (actividad económica CIIU, tipo de persona / sujeto ISLR
-- y número de administración) en `public.proveedores`.
-- Actualiza la función `public.guardar_proveedor` para persistir dichos campos.
--
-- CONSULTA DE VERIFICACIÓN / RESULTADO ESPERADO:
--   SELECT column_name FROM information_schema.columns 
--    WHERE table_name = 'ordenes' AND column_name IN ('retencion_momento', 'retencion_compras_total');
--   -> 2 filas devueltas (ambas columnas presentes).
--
--   SELECT column_name FROM information_schema.columns 
--    WHERE table_name = 'proveedores' AND column_name IN ('actividad_economica', 'tipo_persona');
--   -> 2 filas devueltas (ambas columnas presentes).
--
-- SEGURIDAD:
-- Transaccional (BEGIN...COMMIT), idempotente (ADD COLUMN IF NOT EXISTS).
-- Totalmente seguro para la base viva; no borra ni modifica datos existentes.
-- ============================================================

BEGIN;

-- 1. Columnas en public.ordenes_compra y public.ordenes para cálculo previo de retenciones en Compras
DO $$
BEGIN
  -- Soporte prioritario para public.ordenes_compra (esquema nativo de La Cantera)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ordenes_compra') THEN
    ALTER TABLE public.ordenes_compra
      ADD COLUMN IF NOT EXISTS retencion_momento       text,
      ADD COLUMN IF NOT EXISTS retencion_iva_pct       numeric,
      ADD COLUMN IF NOT EXISTS retencion_iva_monto     numeric,
      ADD COLUMN IF NOT EXISTS retencion_islr_pct      numeric,
      ADD COLUMN IF NOT EXISTS retencion_islr_monto    numeric,
      ADD COLUMN IF NOT EXISTS retencion_isae_pct      numeric,
      ADD COLUMN IF NOT EXISTS retencion_isae_monto    numeric,
      ADD COLUMN IF NOT EXISTS retencion_igtf_pct      numeric,
      ADD COLUMN IF NOT EXISTS retencion_igtf_monto    numeric,
      ADD COLUMN IF NOT EXISTS retencion_compras_total numeric NOT NULL DEFAULT 0;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_compra_retencion_momento_chk') THEN
      ALTER TABLE public.ordenes_compra ADD CONSTRAINT ordenes_compra_retencion_momento_chk
        CHECK (retencion_momento IS NULL OR retencion_momento IN ('antes_de_pagar', 'despues_de_pagar'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_compra_ret_no_negativas') THEN
      ALTER TABLE public.ordenes_compra ADD CONSTRAINT ordenes_compra_ret_no_negativas CHECK (
        coalesce(retencion_iva_monto, 0)  >= 0 AND coalesce(retencion_islr_monto, 0) >= 0 AND
        coalesce(retencion_isae_monto, 0) >= 0 AND coalesce(retencion_igtf_monto, 0) >= 0 AND
        retencion_compras_total >= 0 AND
        coalesce(retencion_iva_pct, 0)  BETWEEN 0 AND 100 AND coalesce(retencion_islr_pct, 0) BETWEEN 0 AND 100 AND
        coalesce(retencion_isae_pct, 0) BETWEEN 0 AND 100 AND coalesce(retencion_igtf_pct, 0) BETWEEN 0 AND 100
      );
    END IF;

    COMMENT ON COLUMN public.ordenes_compra.retencion_momento IS 'Momento de retención: antes_de_pagar (baja el neto a pagar) o despues_de_pagar (pago completo y retención posterior).';
    COMMENT ON COLUMN public.ordenes_compra.retencion_compras_total IS 'Suma de retenciones estimadas en la orden de compra. Total de la orden no se reescribe.';
  END IF;

  -- Soporte complementario si existe public.compras_ordenes
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'compras_ordenes') THEN
    ALTER TABLE public.compras_ordenes
      ADD COLUMN IF NOT EXISTS retencion_momento       text,
      ADD COLUMN IF NOT EXISTS retencion_iva_pct       numeric,
      ADD COLUMN IF NOT EXISTS retencion_iva_monto     numeric,
      ADD COLUMN IF NOT EXISTS retencion_islr_pct      numeric,
      ADD COLUMN IF NOT EXISTS retencion_islr_monto    numeric,
      ADD COLUMN IF NOT EXISTS retencion_isae_pct      numeric,
      ADD COLUMN IF NOT EXISTS retencion_isae_monto    numeric,
      ADD COLUMN IF NOT EXISTS retencion_igtf_pct      numeric,
      ADD COLUMN IF NOT EXISTS retencion_igtf_monto    numeric,
      ADD COLUMN IF NOT EXISTS retencion_compras_total numeric NOT NULL DEFAULT 0;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compras_ordenes_retencion_momento_chk') THEN
      ALTER TABLE public.compras_ordenes ADD CONSTRAINT compras_ordenes_retencion_momento_chk
        CHECK (retencion_momento IS NULL OR retencion_momento IN ('antes_de_pagar', 'despues_de_pagar'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compras_ordenes_ret_no_negativas') THEN
      ALTER TABLE public.compras_ordenes ADD CONSTRAINT compras_ordenes_ret_no_negativas CHECK (
        coalesce(retencion_iva_monto, 0)  >= 0 AND coalesce(retencion_islr_monto, 0) >= 0 AND
        coalesce(retencion_isae_monto, 0) >= 0 AND coalesce(retencion_igtf_monto, 0) >= 0 AND
        retencion_compras_total >= 0 AND
        coalesce(retencion_iva_pct, 0)  BETWEEN 0 AND 100 AND coalesce(retencion_islr_pct, 0) BETWEEN 0 AND 100 AND
        coalesce(retencion_isae_pct, 0) BETWEEN 0 AND 100 AND coalesce(retencion_igtf_pct, 0) BETWEEN 0 AND 100
      );
    END IF;

    COMMENT ON COLUMN public.compras_ordenes.retencion_momento IS 'Momento de retención: antes_de_pagar (baja el neto a pagar) o despues_de_pagar (pago completo y retención posterior).';
    COMMENT ON COLUMN public.compras_ordenes.retencion_compras_total IS 'Suma de retenciones estimadas en la orden de compra. Total de la orden no se reescribe.';
  END IF;

  -- Soporte complementario si existe public.ordenes
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ordenes' AND table_type = 'BASE TABLE') THEN
    ALTER TABLE public.ordenes
      ADD COLUMN IF NOT EXISTS retencion_momento       text,
      ADD COLUMN IF NOT EXISTS retencion_iva_pct       numeric,
      ADD COLUMN IF NOT EXISTS retencion_iva_monto     numeric,
      ADD COLUMN IF NOT EXISTS retencion_islr_pct      numeric,
      ADD COLUMN IF NOT EXISTS retencion_islr_monto    numeric,
      ADD COLUMN IF NOT EXISTS retencion_isae_pct      numeric,
      ADD COLUMN IF NOT EXISTS retencion_isae_monto    numeric,
      ADD COLUMN IF NOT EXISTS retencion_igtf_pct      numeric,
      ADD COLUMN IF NOT EXISTS retencion_igtf_monto    numeric,
      ADD COLUMN IF NOT EXISTS retencion_compras_total numeric NOT NULL DEFAULT 0;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_retencion_momento_chk') THEN
      ALTER TABLE public.ordenes ADD CONSTRAINT ordenes_retencion_momento_chk
        CHECK (retencion_momento IS NULL OR retencion_momento IN ('antes_de_pagar', 'despues_de_pagar'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_ret_compras_no_negativas') THEN
      ALTER TABLE public.ordenes ADD CONSTRAINT ordenes_ret_compras_no_negativas CHECK (
        coalesce(retencion_iva_monto, 0)  >= 0 AND coalesce(retencion_islr_monto, 0) >= 0 AND
        coalesce(retencion_isae_monto, 0) >= 0 AND coalesce(retencion_igtf_monto, 0) >= 0 AND
        retencion_compras_total >= 0 AND
        coalesce(retencion_iva_pct, 0)  BETWEEN 0 AND 100 AND coalesce(retencion_islr_pct, 0) BETWEEN 0 AND 100 AND
        coalesce(retencion_isae_pct, 0) BETWEEN 0 AND 100 AND coalesce(retencion_igtf_pct, 0) BETWEEN 0 AND 100
      );
    END IF;

    COMMENT ON COLUMN public.ordenes.retencion_momento IS 'Momento de retención: antes_de_pagar (baja el neto a pagar) o despues_de_pagar (pago completo y retención posterior).';
    COMMENT ON COLUMN public.ordenes.retencion_compras_total IS 'Suma de retenciones estimadas en la orden de compra. Total de la orden no se reescribe.';
  END IF;
END $$;

-- 2. Columnas en public.proveedores para datos y perfiles fiscales
ALTER TABLE public.proveedores
  ADD COLUMN IF NOT EXISTS actividad_economica   text,
  ADD COLUMN IF NOT EXISTS tipo_persona          text,
  ADD COLUMN IF NOT EXISTS numero_administracion text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proveedores_tipo_persona_chk') THEN
    ALTER TABLE public.proveedores ADD CONSTRAINT proveedores_tipo_persona_chk
      CHECK (tipo_persona IS NULL OR tipo_persona IN ('PNR', 'PNNR', 'PJD', 'PJND'));
  END IF;
END $$;

COMMENT ON COLUMN public.proveedores.actividad_economica IS 'Código CIIU / SENIAT de la actividad económica del proveedor.';
COMMENT ON COLUMN public.proveedores.tipo_persona IS 'Calificación de sujeto fiscal ISLR: PNR (Natural Residente), PNNR (Natural No Residente), PJD (Jurídica Domiciliada), PJND (Jurídica No Domiciliada).';
COMMENT ON COLUMN public.proveedores.numero_administracion IS 'Teléfono o contacto administrativo para notificación de comprobantes R14.';

-- 3. Catálogo de actividades económicas (si no existe)
CREATE TABLE IF NOT EXISTS public.actividades_economicas (
  codigo      text PRIMARY KEY,
  descripcion text NOT NULL,
  tipo        text NOT NULL DEFAULT 'actividad' CHECK (tipo IN ('seccion', 'actividad')),
  activa      boolean NOT NULL DEFAULT true,
  creada_en   timestamptz NOT NULL DEFAULT now()
);

COMMIT;
