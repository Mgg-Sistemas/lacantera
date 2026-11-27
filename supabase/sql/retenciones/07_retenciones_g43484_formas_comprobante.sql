/* ============================================================
   La Cantera · Retenciones · G.O. 43.484 · FORMAS DEL COMPROBANTE E ISLR R14
   MINERIA INTERNACIONAL TS, C.A. (RIF: J-50209170-0)
   Archivo: supabase/sql/retenciones/07_retenciones_g43484_formas_comprobante.sql
   Estado: PENDIENTE DE APLICAR EN SUPABASE SQL EDITOR

   ALCANCE DE LA MIGRACIÓN:
   1. Agrega columnas normativas de G.O. 43.484 a public.retenciones:
      - fecha_entrega: fecha de entrega real del comprobante (opcional).
      - impuesto_causado: IVA de la factura o bruto de ISLR antes de sustraendo.
      - monto_sin_derecho_credito_iva: compras sin derecho a crédito fiscal.
   2. Actualiza el formato del ISLR a AAAAMM8 (14 dígitos AAAAMMSSSSSSSS),
      conforme al estándar legal R14 SENIAT (art. 24 Decreto 1.808 / Gaceta 43.484).
   3. Actualiza public.retencion_lineas_insertar para persistir fecha_entrega,
      impuesto_causado y monto_sin_derecho_credito_iva.
   4. Idempotente y reversible: corre dentro de BEGIN...COMMIT.
   ============================================================ */

begin;

/* ── 0. Precondiciones ────────────────────────────────────────── */
do $$
begin
  if to_regclass('public.retenciones') is null
     or to_regclass('public.retencion_impuestos') is null
     or to_regclass('public.retencion_series') is null then
    raise exception 'G43484_PRECONDICION: faltan tablas base del módulo de retenciones.';
  end if;
end $$;

/* ── 1. Asegurar tabla public.config y permisos PostgREST ─────── */
CREATE TABLE IF NOT EXISTS public.config (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;
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
        'empresa_telefono', '+58 414-0000000',
        'es_agente_retencion_iva', false,
        'es_contribuyente_especial', false,
        'retiene_islr', true,
        'retiene_municipal', true,
        'valor_ut', 43,
        'iva_alicuota', 16,
        'iva_retencion', 75,
        'iva_retencion_especial', 100,
        'igtf_alicuota', 3,
        'imprimir_original_copia', false
    ),
    now()
)
ON CONFLICT (key) DO NOTHING;

/* ── 2. Columnas normativas en public.retenciones ──────────────── */
alter table public.retenciones
  add column if not exists fecha_entrega date,
  add column if not exists impuesto_causado numeric(14,2) default 0
    check (impuesto_causado is null or impuesto_causado >= 0),
  add column if not exists monto_sin_derecho_credito_iva numeric(14,2) default 0
    check (monto_sin_derecho_credito_iva is null or monto_sin_derecho_credito_iva >= 0);

comment on column public.retenciones.fecha_entrega is
  'Opcional. Art. 18.3: fecha real de entrega al proveedor; puede quedar vacía.';
comment on column public.retenciones.impuesto_causado is
  'Art. 18.8: IVA de la factura o bruto del ISLR antes del sustraendo.';
comment on column public.retenciones.monto_sin_derecho_credito_iva is
  'Dato interno manual separado de exento (compras sin derecho a crédito fiscal).';

-- Rellenar impuesto_causado nulo histórico si existiera
update public.retenciones
   set impuesto_causado = case
     when upper(tipo) = 'IVA' then coalesce(iva_monto, 0)
     when upper(tipo) = 'ISLR' then round(coalesce(base, 0) * coalesce(porcentaje, 0) / 100, 2)
     else 0
   end
 where impuesto_causado is null;

/* ── 2. Actualización de formato ISLR a AAAAMM8 (14 dígitos R14) ── */
update public.retencion_impuestos
   set serie_formato = 'AAAAMM8'
 where clave = 'ISLR';

update public.retencion_series
   set formato = 'AAAAMM8'
 where tipo = 'ISLR';

/* ── 3. Función atómica retencion_lineas_insertar con columnas nuevas ── */
create or replace function public.retencion_lineas_insertar(
  p_doc public.retencion_documentos, p_lineas jsonb, p_periodo text,
  p_actor text, p_actor_name text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r public.retenciones;
  l jsonb;
  salida jsonb := '[]'::jsonb;
  t text;
  m numeric;
  fl date;
  i int := 0;
begin
  for l in select value from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    i := i + 1;
    t := upper(coalesce(l ->> 'tipo', ''));
    if t = 'REGIONAL' then t := 'ESTADAL'; end if;
    if t not in ('IVA', 'ISLR', 'MUNICIPAL', 'ESTADAL', 'IGTF') then
      raise exception using errcode = 'P0001', message = 'RET_LINEA_TIPO: línea ' || i || ': tipo no válido (' || coalesce(l ->> 'tipo', 'vacío') || ').';
    end if;
    m := coalesce(nullif(l ->> 'monto', '')::numeric, 0);
    if m < 0 then
      raise exception using errcode = 'P0001', message = 'RET_MONTO_NEGATIVO: línea ' || i || ': la retención no puede ser negativa.';
    end if;
    if m = 0 and coalesce(btrim(l ->> 'descripcion'), '') = '' then
      raise exception using errcode = 'P0001', message = 'RET_CERO_SIN_MOTIVO: línea ' || i || ': una retención en 0 debe llevar el motivo (por qué no se retiene).';
    end if;
    fl := coalesce(nullif(l ->> 'fecha', '')::date, current_date);
    insert into public.retenciones (
      tipo, documento_id, fecha, fecha_entrega, base, porcentaje, sustraendo, monto, moneda, tasa,
      base_bs, monto_bs, iva_alicuota, iva_monto, impuesto_causado,
      monto_sin_derecho_credito_iva, motivo, concepto_codigo, concepto, municipio, descripcion,
      comprobante_nro, comprobante_periodo, quincena, valor_ut, actor, actor_name, regla_id, foto)
    values (
      t, p_doc.id, fl,
      nullif(l ->> 'fecha_entrega', '')::date,
      coalesce(nullif(l ->> 'base', '')::numeric, 0),
      coalesce(nullif(l ->> 'porcentaje', '')::numeric, 0),
      nullif(l ->> 'sustraendo', '')::numeric,
      m,
      coalesce(nullif(l ->> 'moneda', ''), p_doc.moneda),
      coalesce(nullif(l ->> 'tasa', '')::numeric, p_doc.tasa),
      nullif(l ->> 'base_bs', '')::numeric,
      nullif(l ->> 'monto_bs', '')::numeric,
      nullif(l ->> 'iva_alicuota', '')::numeric,
      nullif(l ->> 'iva_monto', '')::numeric,
      coalesce(nullif(l ->> 'impuesto_causado', '')::numeric, nullif(l ->> 'iva_monto', '')::numeric, 0),
      coalesce(nullif(l ->> 'monto_sin_derecho_credito_iva', '')::numeric, 0),
      nullif(btrim(l ->> 'motivo'), ''),
      nullif(l ->> 'concepto_codigo', ''),
      nullif(btrim(l ->> 'concepto'), ''),
      nullif(btrim(l ->> 'municipio'), ''),
      nullif(btrim(l ->> 'descripcion'), ''),
      nullif(btrim(l ->> 'comprobante_nro'), ''),
      coalesce(nullif(l ->> 'comprobante_periodo', ''), nullif(p_periodo, ''), to_char(p_doc.factura_fecha, 'YYYYMM')),
      coalesce(nullif(l ->> 'quincena', '')::smallint,
               case when extract(day from coalesce(p_doc.factura_fecha, fl)) <= 15 then 1 else 2 end),
      nullif(l ->> 'valor_ut', '')::numeric,
      p_actor, p_actor_name,
      nullif(l ->> 'regla_id', '')::uuid,
      case when jsonb_typeof(l -> 'foto') = 'object' then l -> 'foto' end)
    returning * into r;
    salida := salida || jsonb_build_array(to_jsonb(r));
  end loop;
  return salida;
end $$;

revoke execute on function public.retencion_lineas_insertar(public.retencion_documentos, jsonb, text, text, text) from public, anon;
grant execute on function public.retencion_lineas_insertar(public.retencion_documentos, jsonb, text, text, text) to authenticated, service_role;
comment on function public.retencion_lineas_insertar(public.retencion_documentos, jsonb, text, text, text) is
  'Retenciones: regla única para insertar líneas de retención contra un documento fiscal, soportando fecha_entrega, impuesto_causado y sin_derecho de G.O. 43.484.';

/* ── 4. Verificación obligatoria antes del COMMIT ─────────────── */
do $$
declare
  v_cols integer;
  v_funcion text;
begin
  select count(*) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'retenciones'
     and column_name in ('fecha_entrega', 'impuesto_causado', 'monto_sin_derecho_credito_iva');
  if v_cols <> 3 then
    raise exception 'G43484_VERIFICACION: faltan columnas (%/3). Se revierte todo.', v_cols;
  end if;

  select p.prosrc into v_funcion
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'retencion_lineas_insertar';
  if coalesce(v_funcion, '') not like '%fecha_entrega%'
     or coalesce(v_funcion, '') not like '%impuesto_causado%' then
    raise exception 'G43484_VERIFICACION: la función de líneas no quedó actualizada. Se revierte todo.';
  end if;

  if (select serie_formato from public.retencion_impuestos where clave = 'ISLR') <> 'AAAAMM8' then
    raise exception 'G43484_VERIFICACION: ISLR no quedó en AAAAMM8. Se revierte todo.';
  end if;
end $$;

-- Recargar cache de PostgREST
NOTIFY pgrst, 'reload schema';

commit;

/* ── 5. Resultado final de corroboración ───────────────────────── */
select
  'SUCCESS OK' as estatus,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'retenciones'
      and column_name in ('fecha_entrega', 'impuesto_causado', 'monto_sin_derecho_credito_iva')) as columnas_ok,
  (select serie_formato from public.retencion_impuestos where clave = 'ISLR') as formato_islr,
  (select formato from public.retencion_series where tipo = 'ISLR') as serie_islr,
  'MINERIA INTERNACIONAL TS, C.A.' as empresa;
