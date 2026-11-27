-- ============================================================
-- SCRIPT DE REVERSO Y RESTAURACIÓN PARA GOLDEN TOUCH
-- ============================================================
-- Propósito: Restaurar de forma 100% segura los parámetros canónicos
-- y la identidad fiscal de GOLDEN TOUCH 1127, C.A. en caso de haber
-- ejecutado por error el script de La Cantera en la BD de GT.
--
-- NOTA TÉCNICA: Como el script 01 falló con el error 42703 dentro de
-- un bloque BEGIN...COMMIT, PostgreSQL hizo ROLLBACK automático y
-- descartó los cambios. No obstante, al ejecutar este script aseguras
-- que la configuración de Golden Touch quede exactamente en su estado
-- canónico original.
-- ============================================================

BEGIN;

-- 1. Restaurar configuración de Golden Touch en public.config
INSERT INTO public.config (key, value, updated_at)
VALUES (
    'retenciones.parametros',
    jsonb_build_object(
        'empresa_nombre', 'Golden Touch 1127 C.A.',
        'empresa_rif', 'J-50112745-6',
        'empresa_domicilio', 'Puerto Ordaz, Estado Bolívar, Venezuela',
        'empresa_municipio', 'Caroní',
        'empresa_email', 'info@goldentouch1127.com',
        'unidad_tributaria', 43,
        'iva_retencion', 75,
        'iva_retencion_especial', 100,
        'igtf_alicuota', 3,
        'iva_alicuota', 16,
        'agente_retencion_iva', false,
        'contribuyente_especial', false,
        'retiene_islr', true,
        'retiene_municipal', false,
        'imprimir_original_copia', false,
        'comprobante_logo', true,
        'comprobante_firma', true,
        'comprobante_sello', true,
        'comprobante_qr', true,
        'buzon_activo', true,
        'multiempresa_activo', true
    ),
    now()
)
ON CONFLICT (key) DO UPDATE SET
    value = jsonb_build_object(
        'empresa_nombre', 'Golden Touch 1127 C.A.',
        'empresa_rif', 'J-50112745-6',
        'empresa_domicilio', 'Puerto Ordaz, Estado Bolívar, Venezuela',
        'empresa_municipio', 'Caroní',
        'empresa_email', 'info@goldentouch1127.com',
        'unidad_tributaria', 43,
        'iva_retencion', 75,
        'iva_retencion_especial', 100,
        'igtf_alicuota', 3,
        'iva_alicuota', 16,
        'agente_retencion_iva', false,
        'contribuyente_especial', false,
        'retiene_islr', true,
        'retiene_municipal', false,
        'imprimir_original_copia', false,
        'comprobante_logo', true,
        'comprobante_firma', true,
        'comprobante_sello', true,
        'comprobante_qr', true,
        'buzon_activo', true,
        'multiempresa_activo', true
    ),
    updated_at = now();

-- 2. Asegurar registro principal de Golden Touch en retencion_empresas_receptoras (si la tabla existe)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'retencion_empresas_receptoras') THEN
        INSERT INTO public.retencion_empresas_receptoras (
            id, clave, nombre, nombre_corto, rif, color_badge, orden,
            municipio, estado, es_agente_iva, es_contribuyente_especial, retiene_islr,
            imprimir_original_y_copia, activo
        )
        VALUES (
            'empresa-golden-touch', 'golden_touch', 'Golden Touch 1127 C.A.', 'Golden Touch',
            'J-50112745-6', '#eab308', 1, 'Caroní', 'Bolívar', false, false, true, false, true
        )
        ON CONFLICT (id) DO UPDATE SET
            nombre = EXCLUDED.nombre,
            nombre_corto = EXCLUDED.nombre_corto,
            rif = EXCLUDED.rif,
            color_badge = EXCLUDED.color_badge,
            es_contribuyente_especial = false,
            imprimir_original_y_copia = false;
    END IF;
END $$;

-- 3. Restaurar descripción del módulo RETENCIONES
UPDATE public.modulos
SET nombre = 'Retenciones',
    descripcion = 'Retenciones fiscales de IVA, ISLR y comprobantes R14 para Golden Touch 1127 C.A.'
WHERE codigo = 'RETENCIONES';

-- 4. Recargar PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- CONSULTA DE VERIFICACIÓN EN GOLDEN TOUCH:
-- ============================================================
-- SELECT value->>'empresa_nombre' AS empresa, value->>'empresa_rif' AS rif 
-- FROM public.config WHERE key = 'retenciones.parametros';
-- -> Debe devolver: 'Golden Touch 1127 C.A.' y 'J-50112745-6'.
