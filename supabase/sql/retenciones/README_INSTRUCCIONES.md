# 📜 Instrucciones de Aplicación: Scripts SQL de Retenciones y Libro Fiscal

> **Empresa:** MINERIA INTERNACIONAL TS, C.A. (RIF `J-50209170-0`)  
> **Módulo:** Retenciones Fiscales y Libro Fiscal  
> **Ubicación:** `supabase/sql/retenciones/`

Este directorio contiene la suite completa de scripts SQL para inicializar el módulo de Retenciones y Libro Fiscal en Supabase. Cada archivo es **transaccional (`BEGIN...COMMIT`)**, **idempotente** y está diseñado para **no perjudicar la base de datos viva** en caso de reintento o fallo.

---

## 📋 Guía de Ejecución Paso a Paso

Aplique los scripts en orden estricto desde el **SQL Editor de Supabase**:

### Paso 1: Tablas Base, Catálogos y Parámetros Globales
- **Archivo:** `01_retenciones_tablas_base_y_config.sql`
- **Estado:** `-- ESTADO: PENDIENTE DE APLICAR`
- **Contenido:** Tabla `public.retenciones`, `public.retenciones_conceptos`, series de numeración y parámetros de Minería Internacional TS, C.A. en `public.config`.
- **Query de Verificación:**
  ```sql
  SELECT count(*) >= 0 AS tabla_lista FROM public.retenciones;
  SELECT value->>'empresa_rif' AS rif, value->>'valor_ut' AS ut 
    FROM public.config WHERE key = 'retenciones.parametros';
  ```
- **Resultado Esperado:** `tabla_lista = true`, `rif = 'J-50209170-0'`, `ut = '43'`.

---

### Paso 2: Entes Tributarios, Impuestos y Valores Históricos
- **Archivo:** `02_retenciones_entes_impuestos_y_valores.sql`
- **Estado:** `-- ESTADO: PENDIENTE DE APLICAR`
- **Contenido:** Entes (SENIAT, Alcaldía Piar, Alcaldía Caroní, Gobernación Bolívar), fichas de impuestos (IVA, ISLR, Municipal, Estadal, IGTF) y parámetros con historial de UT.
- **Query de Verificación:**
  ```sql
  SELECT count(*) >= 3 AS entes_ok FROM public.retencion_entes;
  SELECT count(*) >= 4 AS impuestos_ok FROM public.retencion_impuestos;
  SELECT count(*) >= 1 AS ut_ok FROM public.retencion_parametros WHERE valor_numero = 43;
  ```
- **Resultado Esperado:** Las 3 consultas devuelven `true`.

---

### Paso 3: Clasificaciones, Tarifas y Motor de Reglas
- **Archivo:** `03_retenciones_clasificaciones_tarifas_y_reglas.sql`
- **Estado:** `-- ESTADO: PENDIENTE DE APLICAR`
- **Contenido:** Motivos de no retención, supuestos especiales, conceptos de ISLR según Decreto 1.808, tarifas 1 y 2 con factores de sustraendo y reglas de cálculo.
- **Query de Verificación:**
  ```sql
  SELECT count(*) >= 4 AS motivos_ok FROM public.retencion_motivos_no_aplica;
  SELECT count(*) >= 10 AS conceptos_islr_ok FROM public.retencion_clasificacion_codigos;
  SELECT count(*) >= 2 AS tarifas_ok FROM public.retencion_tarifas;
  SELECT count(*) >= 5 AS reglas_ok FROM public.retencion_reglas;
  ```
- **Resultado Esperado:** Todas devuelven `true`.

---

### Paso 4: Períodos Fiscales y Correlativos Continuos
- **Archivo:** `04_retenciones_periodos_y_correlativos.sql`
- **Estado:** `-- ESTADO: PENDIENTE DE APLICAR`
- **Contenido:** Períodos 2026/2027 (quincenas IVA y meses ISLR), tabla de números por impuesto y funciones atómicas de numeración continua.
- **Query de Verificación:**
  ```sql
  SELECT count(*) >= 24 AS periodos_ok FROM public.retencion_periodos;
  SELECT proname FROM pg_proc WHERE proname = 'retencion_siguiente_numero_impuesto';
  ```
- **Resultado Esperado:** `periodos_ok = true` y función `retencion_siguiente_numero_impuesto` presente.

---

### Paso 5: Facturas de Origen, Buzón, Multiempresa y Auditoría
- **Archivo:** `05_retenciones_facturas_buzon_y_multiempresa.sql`
- **Estado:** `-- ESTADO: PENDIENTE DE APLICAR`
- **Contenido:** Registro de facturas y adjuntos, buzón externo de proveedores, multiempresa (con Minería Internacional TS como empresa principal), auditoría fiscal y restricciones de integridad.
- **Query de Verificación:**
  ```sql
  SELECT count(*) >= 1 AS empresa_receptora_ok 
    FROM public.retencion_empresas_receptoras WHERE clave = 'MITS';
  SELECT proname FROM pg_proc WHERE proname = 'retencion_factura_registrar';
  SELECT count(*) >= 1 AS buzon_ok 
    FROM information_schema.tables WHERE table_name = 'retenciones_buzon_facturas';
  ```
- **Resultado Esperado:** `empresa_receptora_ok = true`, función `retencion_factura_registrar` presente, `buzon_ok = true`.
