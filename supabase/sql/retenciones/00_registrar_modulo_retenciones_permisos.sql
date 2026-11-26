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
