-- ============================================================================
-- ARCHIVO: 12_retencion_alta_proveedor_y_multiservicios.sql
-- OBJETIVO:
--   1. Habilitar a usuarios con permiso de escritura en RETENCIONES en la
--      función public.guardar_proveedor (además de COMPRAS y ADMIN), respetando
--      el patrón de escritura por RPC de La Cantera.
--   2. Registrar en public.proveedores a MULTISERVICIOS Y.J.1413, C.A.
--      (RIF J-40151378-6) con sus datos fiscales impresos en la Factura N° 543.
--   3. Sincronizar el domicilio fiscal oficial de MINERIA INTERNACIONAL TS, C.A.
--      en public.config['retenciones.parametros'] para el membrete del comprobante.
-- ============================================================================

BEGIN;

-- 1. Permitir que RETENCIONES (ESCRITURA) también registre/edite proveedores vía RPC
CREATE OR REPLACE FUNCTION public.guardar_proveedor(
  p_id bigint,
  p_rif text,
  p_nombre text,
  p_nombre_comercial text DEFAULT NULL,
  p_contacto text DEFAULT NULL,
  p_telefono text DEFAULT NULL,
  p_correo text DEFAULT NULL,
  p_direccion text DEFAULT NULL,
  p_condicion_pago text DEFAULT 'CONTADO',
  p_moneda_preferida character DEFAULT 'USD',
  p_contribuyente_especial boolean DEFAULT false,
  p_notas text DEFAULT NULL,
  p_activo boolean DEFAULT true,
  p_metodo_pago_preferido text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_rif text := upper(regexp_replace(coalesce(p_rif, ''), '[\s.]', '', 'g'));
  v_id  bigint;
  v_autorizado boolean := false;
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role', 'dashboard_user') THEN
    v_autorizado := true;
  ELSE
    PERFORM private.exigir_usuario_activo();
    v_autorizado := coalesce(private.tiene_rol('COMPRAS'), false)
                 OR coalesce(private.tiene_permiso('COMPRAS', 'ESCRITURA'), false)
                 OR coalesce(private.tiene_permiso('RETENCIONES', 'ESCRITURA'), false);
  END IF;

  IF NOT v_autorizado THEN
    RAISE EXCEPTION 'Se requiere permiso de escritura en Compras o Retenciones para guardar proveedores.'
      USING errcode = '42501';
  END IF;

  IF v_rif ~ '^[VEJPGC][0-9]{9}$' THEN
    v_rif := substr(v_rif, 1, 1) || '-' || substr(v_rif, 2, 8) || '-' || substr(v_rif, 10, 1);
  ELSIF v_rif ~ '^[VEJPGC]-[0-9]{9}$' THEN
    v_rif := substr(v_rif, 1, 2) || substr(v_rif, 3, 8) || '-' || substr(v_rif, 11, 1);
  END IF;

  IF v_rif !~ '^[VEJPGC]-[0-9]{8}-[0-9]$' THEN
    RAISE EXCEPTION 'El RIF "%" no tiene forma válida. Se espera J-12345678-9.', p_rif
      USING errcode = '22023';
  END IF;

  IF length(trim(coalesce(p_nombre, ''))) < 3 THEN
    RAISE EXCEPTION 'El nombre o razón social del proveedor es obligatorio.' USING errcode = '22023';
  END IF;

  IF p_metodo_pago_preferido IS NOT NULL THEN
    PERFORM 1 FROM public.metodos_pago WHERE codigo = p_metodo_pago_preferido AND activo;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El método de pago "%" no existe o está desactivado.', p_metodo_pago_preferido
        USING errcode = '23503';
    END IF;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.proveedores
      (rif, nombre, nombre_comercial, contacto, telefono, correo, direccion,
       condicion_pago, moneda_preferida, contribuyente_especial, notas, activo, creado_por,
       metodo_pago_preferido)
    VALUES
      (v_rif, trim(p_nombre), nullif(trim(coalesce(p_nombre_comercial, '')), ''),
       nullif(trim(coalesce(p_contacto, '')), ''), nullif(trim(coalesce(p_telefono, '')), ''),
       nullif(trim(coalesce(p_correo, '')), ''), nullif(trim(coalesce(p_direccion, '')), ''),
       coalesce(p_condicion_pago, 'CONTADO'), coalesce(p_moneda_preferida, 'USD'), coalesce(p_contribuyente_especial, false),
       nullif(trim(coalesce(p_notas, '')), ''), coalesce(p_activo, true), (SELECT auth.uid()),
       p_metodo_pago_preferido)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.proveedores SET
      rif = v_rif,
      nombre = trim(p_nombre),
      nombre_comercial = nullif(trim(coalesce(p_nombre_comercial, '')), ''),
      contacto = nullif(trim(coalesce(p_contacto, '')), ''),
      telefono = nullif(trim(coalesce(p_telefono, '')), ''),
      correo = nullif(trim(coalesce(p_correo, '')), ''),
      direccion = nullif(trim(coalesce(p_direccion, '')), ''),
      condicion_pago = coalesce(p_condicion_pago, condicion_pago, 'CONTADO'),
      moneda_preferida = coalesce(p_moneda_preferida, moneda_preferida, 'USD'),
      contribuyente_especial = CASE WHEN private.tiene_permiso('RETENCIONES', 'ESCRITURA')
        THEN coalesce(p_contribuyente_especial, contribuyente_especial) ELSE contribuyente_especial END,
      notas = nullif(trim(coalesce(p_notas, '')), ''),
      activo = coalesce(p_activo, true),
      metodo_pago_preferido = p_metodo_pago_preferido
    WHERE id = p_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'No existe el proveedor %.', p_id USING errcode = 'P0002';
    END IF;
  END IF;

  -- Sincronizar columnas alias si existen (razon_social / email / estado)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'proveedores' AND column_name = 'razon_social') THEN
    EXECUTE 'UPDATE public.proveedores SET razon_social = nombre WHERE id = $1' USING v_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'proveedores' AND column_name = 'email') THEN
    EXECUTE 'UPDATE public.proveedores SET email = correo WHERE id = $1' USING v_id;
  END IF;

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya hay un proveedor registrado con el RIF %.', v_rif USING errcode = '23505';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.guardar_proveedor(
  bigint, text, text, text, text, text, text, text, text, character, boolean, text, boolean, text
) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.guardar_proveedor(
  bigint, text, text, text, text, text, text, text, text, character, boolean, text, boolean, text
) TO authenticated, service_role;

-- 2. Alta inmediata del proveedor de la Factura N° 543: MULTISERVICIOS Y.J.1413, C.A.
INSERT INTO public.proveedores (
  rif,
  nombre,
  nombre_comercial,
  telefono,
  correo,
  direccion,
  condicion_pago,
  moneda_preferida,
  contribuyente_especial,
  activo
) VALUES (
  'J-40151378-6',
  'MULTISERVICIOS Y.J.1413, C.A.',
  'MULTISERVICIOS Y.J.1413, C.A.',
  '0414-1872565',
  'multiserviciosyj1413@gmail.com',
  'Ctra. Panamericana Km. 08 Local Galpón 01 Rimeveca Maseta 03, Los Teques - Edo. Miranda ZP 1201',
  'CONTADO',
  'USD',
  false,
  true
)
ON CONFLICT (rif) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  telefono = coalesce(public.proveedores.telefono, EXCLUDED.telefono),
  correo = coalesce(public.proveedores.correo, EXCLUDED.correo),
  direccion = coalesce(public.proveedores.direccion, EXCLUDED.direccion),
  activo = true;

-- Sincronizar columnas alias en proveedores si están presentes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'proveedores' AND column_name = 'razon_social') THEN
    UPDATE public.proveedores SET razon_social = nombre WHERE rif = 'J-40151378-6';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'proveedores' AND column_name = 'email') THEN
    UPDATE public.proveedores SET email = correo WHERE rif = 'J-40151378-6';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'proveedores' AND column_name = 'estado') THEN
    UPDATE public.proveedores SET estado = 'activo' WHERE rif = 'J-40151378-6';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'proveedores' AND column_name = 'tipo_persona') THEN
    UPDATE public.proveedores SET tipo_persona = 'PJD' WHERE rif = 'J-40151378-6';
  END IF;
END $$;

-- 3. Asegurar dirección fiscal oficial de MINERIA INTERNACIONAL TS, C.A. en config para el comprobante PDF
UPDATE public.config
   SET value = coalesce(value, '{}'::jsonb) || jsonb_build_object(
     'agente_direccion', 'CALLE 8 CASA NRO 04 URB SANTA FE PARROQUIA VISTA HERMOSA MUNICIPIO ANGOSTURA DEL ORINOCO CIUDAD BOLIVAR BOLIVAR ZONA POSTAL 8001',
     'empresa_domicilio', 'CALLE 8 CASA NRO 04 URB SANTA FE PARROQUIA VISTA HERMOSA MUNICIPIO ANGOSTURA DEL ORINOCO CIUDAD BOLIVAR BOLIVAR ZONA POSTAL 8001'
   ),
   updated_at = now()
 WHERE key = 'retenciones.parametros';

COMMIT;
