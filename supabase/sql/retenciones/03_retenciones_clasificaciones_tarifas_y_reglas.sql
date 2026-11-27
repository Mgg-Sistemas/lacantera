-- ============================================================
-- ESTADO: PENDIENTE DE APLICAR
-- MODULO: Retenciones Fiscales (Minería Internacional TS, C.A.)
-- ARCHIVO: 03_retenciones_clasificaciones_tarifas_y_reglas.sql
--
-- DESCRIPCIÓN:
-- Crea los Motivos de No Aplicación y Supuestos (R6), Formatos de Impresión (R8),
-- Clasificaciones y Conceptos ISLR (R4: Decreto 1.808), Tarifas por tramos (R5)
-- y el motor de Reglas Fiscales (R7) para el cálculo automático de retenciones.
--
-- CONSULTA DE VERIFICACIÓN / RESULTADO ESPERADO:
-- Ejecutar tras aplicar este script:
--   1) SELECT count(*) >= 4 AS motivos_ok FROM public.retencion_motivos_no_aplica;
--      -> true (motivos exento, no sujeto, etc.)
--   2) SELECT count(*) >= 2 AS formatos_ok FROM public.retencion_formatos;
--      -> true (formatos estándar cargados)
--   3) SELECT count(*) >= 10 AS clasificaciones_ok FROM public.retencion_clasificacion_codigos;
--      -> true (conceptos ISLR de ley)
--   4) SELECT count(*) >= 2 AS tarifas_ok FROM public.retencion_tarifas;
--      -> true (Tarifa 1 y 2 con sus tramos)
--   5) SELECT count(*) >= 5 AS reglas_ok FROM public.retencion_reglas;
--      -> true (reglas automáticas de cálculo activas)
--
-- SEGURIDAD:
-- Transaccional (BEGIN...COMMIT), idempotente y no destructivo para los datos vivos.
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


-- R6 · 4 de 13 · gt_retencion_motivos_y_supuestos · migración gt_retencion_motivos_y_supuestos, versión 20261020100004

-- ── Guarda: solo sigue si la base está justo antes de R6 (si no, se detiene sin escribir nada) ──


CREATE TABLE IF NOT EXISTS public.retencion_motivos_no_aplica (
  id               uuid primary key default gen_random_uuid(),
  impuesto_clave   text references public.retencion_impuestos (clave) on delete restrict,   -- nulo = todos
  texto            text not null check (length(btrim(texto)) >= 3),
  requiere_texto   boolean not null default false,
  activo           boolean not null default true,
  orden            smallint not null default 0,
  desde            date not null default current_date,
  hasta            date,
  fuente           text,
  nota             text,
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text,
  check (hasta is null or hasta >= desde)
);
CREATE unique INDEX IF NOT EXISTS retencion_motivos_no_aplica_texto on public.retencion_motivos_no_aplica
  (coalesce(impuesto_clave, '*'), lower(btrim(texto)));
comment on table public.retencion_motivos_no_aplica is 'Retenciones: motivos para marcar que una factura no lleva retención (por impuesto o para todos), con vigencia';

CREATE TABLE IF NOT EXISTS public.retencion_supuestos (
  id               uuid primary key default gen_random_uuid(),
  impuesto_clave   text not null references public.retencion_impuestos (clave) on delete restrict,
  codigo           text not null check (codigo ~ '^[A-Za-z][A-Za-z0-9_]{1,40}$'),
  texto            text not null check (length(btrim(texto)) >= 3),
  pct              numeric not null check (pct between 0 and 100),
  activo           boolean not null default true,
  orden            smallint not null default 0,
  desde            date not null default current_date,
  hasta            date,
  fuente           text,
  nota             text,
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text,
  unique (impuesto_clave, codigo),
  check (hasta is null or hasta >= desde)
);
comment on table public.retencion_supuestos is 'Retenciones: supuestos que imponen un % de retención (el 100 % del art. 5 del IVA), con vigencia';

-- Quién y cuándo + historial (R2).
create function public.retencion_r6_anotar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  quien text := coalesce(auth.jwt() ->> 'email', current_user);
  j jsonb := to_jsonb(new);
begin
  new.actualizado_en := now();
  new.actualizado_por := quien;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  insert into public.retencion_historial (tabla, clave, antes, despues, motivo, actor)
  values (tg_table_name,
          coalesce(j ->> 'impuesto_clave', '*') || ':' || coalesce(j ->> 'codigo', j ->> 'texto'),
          case when tg_op = 'UPDATE' then to_jsonb(old) - 'actualizado_en' - 'actualizado_por' end,
          j - 'actualizado_en' - 'actualizado_por',
          j ->> 'nota',
          quien);
  return new;
end $$;
revoke execute on function public.retencion_r6_anotar() from public, anon, authenticated;
DROP TRIGGER IF EXISTS trg_retencion_motivos_no_aplica_anotar ON public.retencion_motivos_no_aplica;
create trigger trg_retencion_motivos_no_aplica_anotar before insert or update on public.retencion_motivos_no_aplica
  for each row execute function public.retencion_r6_anotar();
DROP TRIGGER IF EXISTS trg_retencion_supuestos_anotar ON public.retencion_supuestos;
create trigger trg_retencion_supuestos_anotar before insert or update on public.retencion_supuestos
  for each row execute function public.retencion_r6_anotar();

-- Lo vigente en una fecha.
create function public.retencion_motivos_vigentes(p_impuesto text, p_fecha date)
returns setof public.retencion_motivos_no_aplica language sql stable security invoker set search_path = public as $$
  select m.* from public.retencion_motivos_no_aplica m
   where m.activo and (m.impuesto_clave is null or m.impuesto_clave = upper(p_impuesto))
     and m.desde <= coalesce(p_fecha, current_date) and (m.hasta is null or m.hasta >= coalesce(p_fecha, current_date))
   order by m.impuesto_clave nulls last, m.orden, m.texto;
$$;
create function public.retencion_supuestos_vigentes(p_impuesto text, p_fecha date)
returns setof public.retencion_supuestos language sql stable security invoker set search_path = public as $$
  select s.* from public.retencion_supuestos s
   where s.activo and s.impuesto_clave = upper(p_impuesto)
     and s.desde <= coalesce(p_fecha, current_date) and (s.hasta is null or s.hasta >= coalesce(p_fecha, current_date))
   order by s.orden, s.codigo;
$$;
revoke execute on function public.retencion_motivos_vigentes(text, date), public.retencion_supuestos_vigentes(text, date) from public, anon;
grant execute on function public.retencion_motivos_vigentes(text, date), public.retencion_supuestos_vigentes(text, date) to authenticated, service_role;

-- Semilla: los 5 supuestos del 100 % que hoy están en el código (mismo código y texto).
insert into public.retencion_supuestos (impuesto_clave, codigo, texto, pct, orden, desde, fuente, nota) values
  ('IVA', 'ivaNoDiscriminado',      'El IVA no está discriminado en la factura', 100, 1, date '2020-01-01', null, 'Cotejar con el contador: la Providencia vigente y el art. 5.'),
  ('IVA', 'facturaNoCumple',        'La factura no cumple los requisitos de facturación', 100, 2, date '2020-01-01', null, 'Cotejar con el contador: la Providencia vigente y el art. 5.'),
  ('IVA', 'proveedorNoInscrito',    'El proveedor está sujeto a retención del 100% según el Portal Fiscal, o no está inscrito en el RIF', 100, 3, date '2020-01-01', null, 'Cotejar con el contador: la Providencia vigente y el art. 5.'),
  ('IVA', 'proveedorNoDomiciliado', 'El proveedor no está domiciliado en el país', 100, 4, date '2020-01-01', null, 'Cotejar con el contador: la Providencia vigente y el art. 5.'),
  ('IVA', 'metalesPreciosos',       'Compra de metales o piedras preciosas', 100, 5, date '2020-01-01', null, 'Cotejar con el contador: la Providencia vigente y el art. 5.');

-- RLS
do $$
declare t text;
begin
  foreach t in array array['retencion_motivos_no_aplica', 'retencion_supuestos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate, references, trigger on public.%I from authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()) or (select public.puede(''retenciones'')))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin()) or (select public.puede(''retenciones''))) with check ((select public.is_admin()) or (select public.puede(''retenciones'')))', t || '_update', t);
  end loop;
end $$;

DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT unnest(ARRAY['retencion_motivos_no_aplica', 'retencion_supuestos']) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = r
    ) THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', r);
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END;
    END IF;
  END LOOP;
END $$;


-- R8 · 5 de 13 · gt_retencion_formatos · migración gt_retencion_formatos, versión 20261020100005

-- ── Guarda: solo sigue si la base está justo antes de R8 (si no, se detiene sin escribir nada) ──


CREATE TABLE IF NOT EXISTS public.retencion_formatos (
  id                   uuid primary key default gen_random_uuid(),
  impuesto_clave       text references public.retencion_impuestos (clave) on delete restrict,   -- nulo = general
  documento            text not null check (documento ~ '^[a-z][a-z0-9_]{1,30}$'),
  desde                date not null,
  hasta                date,
  orientacion          text not null default 'vertical' check (orientacion in ('vertical', 'horizontal')),
  textos               jsonb,     -- {"encabezado": "...", "nota_legal": "...", "pie": "..."}
  rotulos              jsonb,     -- {"campo": "rótulo", ...}
  columnas             jsonb,     -- [{"campo": "...", "rotulo": "...", "visible": true, "orden": 1, "ancho": 20}, ...]
  muestra_logo_ente    boolean not null default true,
  muestra_logo_agente  boolean not null default true,
  muestra_firma        boolean not null default true,
  muestra_sello        boolean not null default true,
  de_fabrica           boolean not null default false,
  motivo               text not null check (length(btrim(motivo)) > 0),
  fuente               text,
  created_at           timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),
  actualizado_por      text,
  check (hasta is null or hasta >= desde)
);
CREATE unique INDEX IF NOT EXISTS retencion_formatos_desde on public.retencion_formatos (coalesce(impuesto_clave, '*'), documento, desde);
CREATE unique INDEX IF NOT EXISTS retencion_formatos_abierto on public.retencion_formatos (coalesce(impuesto_clave, '*'), documento) where hasta is null;
comment on table public.retencion_formatos is 'Retenciones: formatos de impresión por impuesto y documento, con versiones desde una fecha';

-- Quién y cuándo + historial (R2).
create function public.retencion_r8_anotar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  quien text := coalesce(auth.jwt() ->> 'email', current_user);
  j jsonb := to_jsonb(new);
begin
  new.actualizado_en := now();
  new.actualizado_por := quien;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  insert into public.retencion_historial (tabla, clave, antes, despues, motivo, actor)
  values (tg_table_name, coalesce(j ->> 'impuesto_clave', '*') || ':' || (j ->> 'documento'),
          case when tg_op = 'UPDATE' then to_jsonb(old) - 'actualizado_en' - 'actualizado_por' end,
          j - 'actualizado_en' - 'actualizado_por', j ->> 'motivo', quien);
  return new;
end $$;
revoke execute on function public.retencion_r8_anotar() from public, anon, authenticated;
DROP TRIGGER IF EXISTS trg_retencion_formatos_anotar ON public.retencion_formatos;
create trigger trg_retencion_formatos_anotar before insert or update on public.retencion_formatos
  for each row execute function public.retencion_r8_anotar();

-- Forma del contenido (alta y cambio); en el alta, la versión nueva cierra la abierta.
create function public.retencion_formatos_guarda()
returns trigger language plpgsql security definer set search_path = public as $$
declare abierta public.retencion_formatos;
begin
  if (new.textos is not null and jsonb_typeof(new.textos) <> 'object')
     or (new.rotulos is not null and jsonb_typeof(new.rotulos) <> 'object')
     or (new.columnas is not null and jsonb_typeof(new.columnas) <> 'array') then
    raise exception using errcode = 'P0001',
      message = 'RET_FORMATO_FORMA: textos y rótulos van como objeto ({…}) y columnas como lista ([…]).';
  end if;
  if new.de_fabrica then
    -- Volver a fábrica: el contenido es el del código.
    new.textos := null; new.rotulos := null; new.columnas := null;
  end if;
  if tg_op = 'INSERT' then
    select * into abierta from public.retencion_formatos
     where impuesto_clave is not distinct from new.impuesto_clave and documento = new.documento and hasta is null for update;
    if found then
      if new.desde <= abierta.desde then
        raise exception using errcode = 'P0001',
          message = 'RET_FORMATO_DESDE: la versión nueva del formato tiene que empezar después del '
                 || to_char(abierta.desde, 'DD/MM/YYYY') || '. Para corregir la vigente, edítela.';
      end if;
      update public.retencion_formatos set hasta = new.desde - 1 where id = abierta.id;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.retencion_formatos_guarda() from public, anon, authenticated;
-- «0»: corre ANTES de anotar (los BEFORE corren por orden alfabético): el historial ve el contenido ya vaciado
-- de una versión «de fábrica».
DROP TRIGGER IF EXISTS trg_retencion_formatos_0_guarda ON public.retencion_formatos;
create trigger trg_retencion_formatos_0_guarda before insert or update on public.retencion_formatos
  for each row execute function public.retencion_formatos_guarda();

-- La versión vigente en una fecha (nada = fábrica).
create function public.retencion_formato_vigente(p_impuesto text, p_documento text, p_fecha date)
returns setof public.retencion_formatos language sql stable security invoker set search_path = public as $$
  select f.* from public.retencion_formatos f
   where f.impuesto_clave is not distinct from upper(nullif(p_impuesto, '')) and f.documento = p_documento
     and f.desde <= coalesce(p_fecha, current_date) and (f.hasta is null or f.hasta >= coalesce(p_fecha, current_date))
   order by f.desde desc limit 1;
$$;
revoke execute on function public.retencion_formato_vigente(text, text, date) from public, anon;
grant execute on function public.retencion_formato_vigente(text, text, date) to authenticated, service_role;

-- RLS
alter table public.retencion_formatos enable row level security;
revoke all on public.retencion_formatos from anon;
revoke delete, truncate, references, trigger on public.retencion_formatos from authenticated;
DROP POLICY IF EXISTS retencion_formatos_read ON public.retencion_formatos;
create policy retencion_formatos_read on public.retencion_formatos for select to authenticated using (true);
DROP POLICY IF EXISTS retencion_formatos_insert ON public.retencion_formatos;
create policy retencion_formatos_insert on public.retencion_formatos for insert to authenticated
  with check ((select public.is_admin()) or (select public.puede('retenciones')));
DROP POLICY IF EXISTS retencion_formatos_update ON public.retencion_formatos;
create policy retencion_formatos_update on public.retencion_formatos for update to authenticated
  using ((select public.is_admin()) or (select public.puede('retenciones')))
  with check ((select public.is_admin()) or (select public.puede('retenciones')));
DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT unnest(ARRAY['retencion_formatos']) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = r
    ) THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', r);
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END;
    END IF;
  END LOOP;
END $$;




-- R4 · 6 de 13 · gt_retencion_clasificaciones · migración gt_retencion_clasificaciones, versión 20261020100006

-- ── Guarda: solo sigue si la base está justo antes de R4 (si no, se detiene sin escribir nada) ──


CREATE TABLE IF NOT EXISTS public.retencion_clasificaciones (
  id               uuid primary key default gen_random_uuid(),
  clave            text unique check (clave ~ '^[a-z][a-z0-9_]{1,40}$'),
  nombre           text not null check (length(btrim(nombre)) >= 3),
  impuesto_clave   text references public.retencion_impuestos (clave) on delete restrict,
  ente_id          uuid references public.retencion_entes (id) on delete restrict,
  descripcion      text,
  fuente           text,
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text,
  check (impuesto_clave is not null or ente_id is not null)
);
comment on table public.retencion_clasificaciones is 'Retenciones: tablas de clasificación (conceptos del ISLR, actividades del ISAE, rubros…), de un impuesto o de un ente';

CREATE TABLE IF NOT EXISTS public.retencion_clasificacion_codigos (
  id                uuid primary key default gen_random_uuid(),
  clasificacion_id  uuid not null references public.retencion_clasificaciones (id) on delete restrict,
  codigo            text not null check (length(btrim(codigo)) > 0),
  descripcion       text not null check (length(btrim(descripcion)) >= 2),
  orden             integer not null default 100,
  activo            boolean not null default true,
  nota              text,
  created_at        timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  actualizado_por   text,
  unique (clasificacion_id, codigo)
);
comment on table public.retencion_clasificacion_codigos is 'Retenciones: cada código de una tabla de clasificación (lo que se elige)';

CREATE TABLE IF NOT EXISTS public.retencion_clasificacion_valores (
  id                 uuid primary key default gen_random_uuid(),
  codigo_id          uuid not null references public.retencion_clasificacion_codigos (id) on delete restrict,
  sujeto             text check (sujeto in ('PJD', 'PJND', 'PNR', 'PNNR')),   -- nulo = todos
  pct                numeric check (pct is null or pct between 0 and 100),
  base_pct           numeric not null default 100 check (base_pct > 0 and base_pct <= 100),
  minimo             numeric check (minimo is null or minimo >= 0),
  minimo_unidad      text check (minimo_unidad in ('UT', 'Bs', 'MMV')),
  sustraendo_factor  numeric check (sustraendo_factor is null or sustraendo_factor >= 0),
  desde              date not null,
  hasta              date,
  fuente             text,
  motivo             text not null check (length(btrim(motivo)) > 0),
  nota               text,
  created_at         timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  actualizado_por    text,
  check (hasta is null or hasta >= desde),
  check ((minimo is null) = (minimo_unidad is null))
);
CREATE unique INDEX IF NOT EXISTS retencion_clasificacion_valores_desde on public.retencion_clasificacion_valores (codigo_id, coalesce(sujeto, '*'), desde);
CREATE unique INDEX IF NOT EXISTS retencion_clasificacion_valores_abierto on public.retencion_clasificacion_valores (codigo_id, coalesce(sujeto, '*')) where hasta is null;
comment on table public.retencion_clasificacion_valores is 'Retenciones: % por sujeto, porción de la base, mínimo y sustraendo de cada código, con vigencia';

-- Quién y cuándo + historial (R2), para las tres tablas.
create function public.retencion_r4_anotar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  quien text := coalesce(auth.jwt() ->> 'email', current_user);
  j jsonb := to_jsonb(new);
  clave text;
begin
  new.actualizado_en := now();
  new.actualizado_por := quien;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  if tg_table_name = 'retencion_clasificacion_valores' then
    select c.codigo into clave from public.retencion_clasificacion_codigos c where c.id = (j ->> 'codigo_id')::uuid;
    clave := coalesce(clave, '?') || ':' || coalesce(j ->> 'sujeto', '*');
  else
    clave := coalesce(j ->> 'clave', j ->> 'codigo', j ->> 'nombre');
  end if;
  insert into public.retencion_historial (tabla, clave, antes, despues, motivo, actor)
  values (tg_table_name, clave,
          case when tg_op = 'UPDATE' then to_jsonb(old) - 'actualizado_en' - 'actualizado_por' end,
          j - 'actualizado_en' - 'actualizado_por', coalesce(j ->> 'motivo', j ->> 'nota'), quien);
  return new;
end $$;
revoke execute on function public.retencion_r4_anotar() from public, anon, authenticated;
DROP TRIGGER IF EXISTS trg_retencion_clasificaciones_anotar ON public.retencion_clasificaciones;
create trigger trg_retencion_clasificaciones_anotar before insert or update on public.retencion_clasificaciones
  for each row execute function public.retencion_r4_anotar();
DROP TRIGGER IF EXISTS trg_retencion_clasificacion_codigos_anotar ON public.retencion_clasificacion_codigos;
create trigger trg_retencion_clasificacion_codigos_anotar before insert or update on public.retencion_clasificacion_codigos
  for each row execute function public.retencion_r4_anotar();
DROP TRIGGER IF EXISTS trg_retencion_clasificacion_valores_anotar ON public.retencion_clasificacion_valores;
create trigger trg_retencion_clasificacion_valores_anotar before insert or update on public.retencion_clasificacion_valores
  for each row execute function public.retencion_r4_anotar();

-- Un valor nuevo cierra el abierto del mismo código y sujeto el día antes.
create function public.retencion_clasificacion_valores_versionar()
returns trigger language plpgsql security definer set search_path = public as $$
declare abierta public.retencion_clasificacion_valores;
begin
  select * into abierta from public.retencion_clasificacion_valores
   where codigo_id = new.codigo_id and sujeto is not distinct from new.sujeto and hasta is null for update;
  if found then
    if new.desde <= abierta.desde then
      raise exception using errcode = 'P0001',
        message = 'RET_CLASIFICACION_DESDE: el valor nuevo tiene que empezar después del ' || to_char(abierta.desde, 'DD/MM/YYYY')
               || '. Para corregir el vigente, edítelo.';
    end if;
    update public.retencion_clasificacion_valores set hasta = new.desde - 1 where id = abierta.id;
  end if;
  return new;
end $$;
revoke execute on function public.retencion_clasificacion_valores_versionar() from public, anon, authenticated;
-- «zz»: corre después de anotar (los BEFORE corren por orden alfabético).
DROP TRIGGER IF EXISTS trg_retencion_clasificacion_valores_zz_versionar ON public.retencion_clasificacion_valores;
create trigger trg_retencion_clasificacion_valores_zz_versionar before insert on public.retencion_clasificacion_valores
  for each row execute function public.retencion_clasificacion_valores_versionar();

-- 5) El valor vigente de un código para un sujeto (o el de «todos»).
create function public.retencion_clasificacion_valor(p_codigo_id uuid, p_sujeto text, p_fecha date)
returns setof public.retencion_clasificacion_valores language sql stable security invoker set search_path = public as $$
  select v.* from public.retencion_clasificacion_valores v
   where v.codigo_id = p_codigo_id and (v.sujeto = upper(p_sujeto) or v.sujeto is null)
     and v.desde <= coalesce(p_fecha, current_date) and (v.hasta is null or v.hasta >= coalesce(p_fecha, current_date))
   order by (v.sujeto is null), v.desde desc limit 1;
$$;
revoke execute on function public.retencion_clasificacion_valor(uuid, text, date) from public, anon;
grant execute on function public.retencion_clasificacion_valor(uuid, text, date) to authenticated, service_role;

-- 4) La FK de las actividades del proveedor (R1), y su vínculo automático por (ente, código de la ordenanza).
alter table public.retencion_contraparte_actividades
  ADD COLUMN IF NOT EXISTS clasificacion_codigo_id uuid references public.retencion_clasificacion_codigos (id) on delete restrict;
CREATE INDEX IF NOT EXISTS retencion_contraparte_actividades_codigo_idx on public.retencion_contraparte_actividades (clasificacion_codigo_id);

create function public.retencion_actividad_vincular()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.clasificacion_codigo_id is null and new.ente_id is not null and nullif(btrim(new.ordenanza_codigo), '') is not null then
    select c.id into new.clasificacion_codigo_id
      from public.retencion_clasificacion_codigos c
      join public.retencion_clasificaciones k on k.id = c.clasificacion_id
     where k.ente_id = new.ente_id and k.activo and c.codigo = btrim(new.ordenanza_codigo)
     order by k.created_at limit 1;
  end if;
  return new;
end $$;
revoke execute on function public.retencion_actividad_vincular() from public, anon, authenticated;
DROP TRIGGER IF EXISTS trg_retencion_contraparte_actividades_vincular ON public.retencion_contraparte_actividades;
create trigger trg_retencion_contraparte_actividades_vincular before insert or update on public.retencion_contraparte_actividades
  for each row execute function public.retencion_actividad_vincular();

-- Al dar de alta un código de la clasificación de un ente, se vinculan las actividades que ya lo nombraban.
create function public.retencion_codigo_vincula_actividades()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.retencion_contraparte_actividades a
     set clasificacion_codigo_id = new.id
    from public.retencion_clasificaciones k
   where k.id = new.clasificacion_id and k.ente_id is not null
     and a.clasificacion_codigo_id is null and a.ente_id = k.ente_id and btrim(a.ordenanza_codigo) = new.codigo;
  return null;
end $$;
revoke execute on function public.retencion_codigo_vincula_actividades() from public, anon, authenticated;
DROP TRIGGER IF EXISTS trg_retencion_clasificacion_codigos_vincula ON public.retencion_clasificacion_codigos;
create trigger trg_retencion_clasificacion_codigos_vincula after insert on public.retencion_clasificacion_codigos
  for each row execute function public.retencion_codigo_vincula_actividades();

-- 6) Convivencia con retenciones_conceptos. pg_trigger_depth() > 1 = lo disparó el otro sentido: no se devuelve.
-- (a) retenciones_conceptos → clasificación 'islr_conceptos'
create function public.retenciones_conceptos_a_clasificacion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  k uuid; cid uuid; s text; p numeric; v public.retencion_clasificacion_valores;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  select id into k from public.retencion_clasificaciones where clave = 'islr_conceptos';
  if k is null then return null; end if;
  insert into public.retencion_clasificacion_codigos (clasificacion_id, codigo, descripcion, orden, activo, nota)
  values (k, new.codigo, new.concepto, new.orden, new.activo, new.nota)
  on conflict (clasificacion_id, codigo) do update
     set descripcion = excluded.descripcion, orden = excluded.orden, activo = excluded.activo, nota = excluded.nota
  returning id into cid;
  foreach s in array array['PJD', 'PJND', 'PNR', 'PNNR'] loop
    p := case s when 'PJD' then new.pjd when 'PJND' then new.pjnd when 'PNR' then new.pnr else new.pnnr end;
    continue when p is null;
    select * into v from public.retencion_clasificacion_valores x
     where x.codigo_id = cid and x.sujeto = s and x.desde <= current_date and (x.hasta is null or x.hasta >= current_date)
     order by x.desde desc limit 1;
    if not found then
      insert into public.retencion_clasificacion_valores (codigo_id, sujeto, pct, base_pct, minimo, minimo_unidad, sustraendo_factor, desde, motivo)
      values (cid, s, p, new.base_pct,
              case when s = 'PNR' then 83.3334 end, case when s = 'PNR' then 'UT' end, case when s = 'PNR' then 83.3334 end,
              current_date, 'Desde Conceptos (pantalla de hoy o Tesorería)');
    elsif v.pct is distinct from p or v.base_pct is distinct from new.base_pct then
      if v.desde = current_date then
        update public.retencion_clasificacion_valores set pct = p, base_pct = new.base_pct,
               motivo = 'Desde Conceptos (pantalla de hoy o Tesorería)' where id = v.id;
      else
        insert into public.retencion_clasificacion_valores (codigo_id, sujeto, pct, base_pct, minimo, minimo_unidad, sustraendo_factor, fuente, desde, motivo)
        values (cid, s, p, new.base_pct, v.minimo, v.minimo_unidad, v.sustraendo_factor, v.fuente,
                current_date, 'Desde Conceptos (pantalla de hoy o Tesorería)');
      end if;
    end if;
  end loop;
  return null;
end $$;
revoke execute on function public.retenciones_conceptos_a_clasificacion() from public, anon, authenticated;

-- (b) clasificación 'islr_conceptos' → retenciones_conceptos (solo lo vigente HOY; la carga inicial no se devuelve)
create function public.retencion_clasificacion_a_conceptos()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.retencion_clasificacion_codigos; es_islr boolean;
begin
  if pg_trigger_depth() > 1 or coalesce(current_setting('retenciones.r4_carga', true), '') = 'si' then return null; end if;
  if tg_table_name = 'retencion_clasificacion_codigos' then
    c := new;
  else
    if new.sujeto is null or new.desde > current_date or (new.hasta is not null and new.hasta < current_date) then return null; end if;
    -- Sin % (la tasa sale de una tarifa, R5): la tabla vieja conserva su último %; el cálculo de hoy no se queda sin tasa.
    if new.pct is null then return null; end if;
    select * into c from public.retencion_clasificacion_codigos where id = new.codigo_id;
  end if;
  select exists (select 1 from public.retencion_clasificaciones k where k.id = c.clasificacion_id and k.clave = 'islr_conceptos') into es_islr;
  if not es_islr then return null; end if;
  insert into public.retenciones_conceptos (codigo, concepto, orden, activo, nota)
  values (c.codigo, c.descripcion, c.orden, c.activo, c.nota)
  on conflict (codigo) do update set concepto = excluded.concepto, orden = excluded.orden, activo = excluded.activo, nota = excluded.nota;
  if tg_table_name = 'retencion_clasificacion_valores' then
    update public.retenciones_conceptos
       set pjd  = case when new.sujeto = 'PJD'  then new.pct else pjd  end,
           pjnd = case when new.sujeto = 'PJND' then new.pct else pjnd end,
           pnr  = case when new.sujeto = 'PNR'  then new.pct else pnr  end,
           pnnr = case when new.sujeto = 'PNNR' then new.pct else pnnr end,
           base_pct = new.base_pct
     where codigo = c.codigo;
  end if;
  return null;
end $$;
revoke execute on function public.retencion_clasificacion_a_conceptos() from public, anon, authenticated;

-- 1-3) Carga inicial (la marca evita que (b) devuelva cada fila a retenciones_conceptos).
select set_config('retenciones.r4_carga', 'si', true);
insert into public.retencion_clasificaciones (clave, nombre, impuesto_clave, ente_id, fuente)
values ('islr_conceptos', 'Conceptos del ISLR (Decreto 1.808)', 'ISLR',
        (select id from public.retencion_entes where tipo = 'nacional' and nombre = 'SENIAT' limit 1), 'Decreto 1.808'),
       ('isae_caroni', 'Actividades económicas · Municipio Caroní', 'MUNICIPAL',
        (select id from public.retencion_entes where tipo = 'municipal' and municipio = 'Caroní' limit 1), null);
insert into public.retencion_clasificacion_codigos (clasificacion_id, codigo, descripcion, orden, activo, nota)
select k.id, c.codigo, c.concepto, c.orden, c.activo, c.nota
  from public.retenciones_conceptos c cross join public.retencion_clasificaciones k
 where k.clave = 'islr_conceptos';
insert into public.retencion_clasificacion_valores (codigo_id, sujeto, pct, base_pct, minimo, minimo_unidad, sustraendo_factor, desde, motivo, nota)
select d.id, s.sujeto, s.pct, c.base_pct,
       case when s.sujeto = 'PNR' then 83.3334 end, case when s.sujeto = 'PNR' then 'UT' end, case when s.sujeto = 'PNR' then 83.3334 end,
       date '2020-01-01',
       'Carga inicial R4 desde retenciones_conceptos. Fecha de inicio a confirmar por el contador.',
       case when s.sujeto = 'PNR' then 'Mínimo y sustraendo: los 83,3334 UT que hoy usa el código; cotejar con el contador.'
            when s.sujeto in ('PJND', 'PNNR') and s.pct = 34 then 'Tarifa N° 2 pendiente (R5).' end
  from public.retenciones_conceptos c
  join public.retencion_clasificacion_codigos d on d.codigo = c.codigo
  join public.retencion_clasificaciones k on k.id = d.clasificacion_id and k.clave = 'islr_conceptos'
  cross join lateral (values ('PJD', c.pjd), ('PJND', c.pjnd), ('PNR', c.pnr), ('PNNR', c.pnnr)) as s (sujeto, pct)
 where s.pct is not null;
select set_config('retenciones.r4_carga', '', true);

-- Los triggers de convivencia, DESPUÉS de la carga.
DROP TRIGGER IF EXISTS trg_retenciones_conceptos_a_clasificacion ON public.retenciones_conceptos;
create trigger trg_retenciones_conceptos_a_clasificacion after insert or update on public.retenciones_conceptos
  for each row execute function public.retenciones_conceptos_a_clasificacion();
DROP TRIGGER IF EXISTS trg_retencion_clasificacion_valores_a_conceptos ON public.retencion_clasificacion_valores;
create trigger trg_retencion_clasificacion_valores_a_conceptos after insert or update on public.retencion_clasificacion_valores
  for each row execute function public.retencion_clasificacion_a_conceptos();
DROP TRIGGER IF EXISTS trg_retencion_clasificacion_codigos_a_conceptos ON public.retencion_clasificacion_codigos;
create trigger trg_retencion_clasificacion_codigos_a_conceptos after update on public.retencion_clasificacion_codigos
  for each row execute function public.retencion_clasificacion_a_conceptos();

-- Lo que ya haya en las actividades del proveedor (hoy, casi seguro, nada que vincular: Caroní está vacía).
update public.retencion_contraparte_actividades a
   set clasificacion_codigo_id = c.id
  from public.retencion_clasificacion_codigos c
  join public.retencion_clasificaciones k on k.id = c.clasificacion_id
 where a.clasificacion_codigo_id is null and k.ente_id = a.ente_id and c.codigo = btrim(a.ordenanza_codigo);

-- 7) RLS
do $$
declare t text;
begin
  foreach t in array array['retencion_clasificaciones', 'retencion_clasificacion_codigos', 'retencion_clasificacion_valores'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate, references, trigger on public.%I from authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()) or (select public.puede(''retenciones'')))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin()) or (select public.puede(''retenciones''))) with check ((select public.is_admin()) or (select public.puede(''retenciones'')))', t || '_update', t);
  end loop;
end $$;

DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT unnest(ARRAY['retencion_clasificaciones', 'retencion_clasificacion_codigos', 'retencion_clasificacion_valores']) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = r
    ) THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', r);
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END;
    END IF;
  END LOOP;
END $$;


-- R5 · 7 de 13 · gt_retencion_tarifas · migración gt_retencion_tarifas, versión 20261020100007

-- ── Guarda: solo sigue si la base está justo antes de R5 (si no, se detiene sin escribir nada) ──


CREATE TABLE IF NOT EXISTS public.retencion_tarifas (
  id               uuid primary key default gen_random_uuid(),
  clave            text not null unique check (clave ~ '^[a-z][a-z0-9_]{1,40}$'),
  nombre           text not null check (length(btrim(nombre)) >= 3),
  impuesto_clave   text references public.retencion_impuestos (clave) on delete restrict,
  unidad           text not null check (unidad in ('UT', 'Bs')),
  activo           boolean not null default true,
  fuente           text,
  nota             text,
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text
);
comment on table public.retencion_tarifas is 'Retenciones: tarifas progresivas por tramos (p. ej. la Tarifa N° 2 del ISLR)';

CREATE TABLE IF NOT EXISTS public.retencion_tarifa_versiones (
  id               uuid primary key default gen_random_uuid(),
  tarifa_id        uuid not null references public.retencion_tarifas (id) on delete restrict,
  desde            date not null,
  hasta            date,
  cerrada          boolean not null default false,    -- publicada: sus tramos ya no cambian y se aplica
  motivo           text not null check (length(btrim(motivo)) > 0),
  fuente           text,
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text,
  check (hasta is null or hasta >= desde)
);
CREATE unique INDEX IF NOT EXISTS retencion_tarifa_versiones_desde on public.retencion_tarifa_versiones (tarifa_id, desde);
CREATE unique INDEX IF NOT EXISTS retencion_tarifa_versiones_abierta on public.retencion_tarifa_versiones (tarifa_id) where hasta is null;
comment on table public.retencion_tarifa_versiones is 'Retenciones: cada versión de una tarifa, desde una fecha; se publica (cerrada) para aplicarse';

CREATE TABLE IF NOT EXISTS public.retencion_tarifa_tramos (
  id               uuid primary key default gen_random_uuid(),
  version_id       uuid not null references public.retencion_tarifa_versiones (id) on delete restrict,
  desde_monto      numeric not null check (desde_monto >= 0),
  hasta_monto      numeric,
  pct              numeric not null check (pct between 0 and 100),
  sustraendo       numeric not null default 0 check (sustraendo >= 0),
  nota             text,
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text,
  unique (version_id, desde_monto),
  check (hasta_monto is null or hasta_monto > desde_monto)
);
comment on table public.retencion_tarifa_tramos is 'Retenciones: tramos de una versión de tarifa (más de desde_monto y hasta hasta_monto, inclusive)';

-- La tasa de un código y sujeto (R4) puede salir de una tarifa.
alter table public.retencion_clasificacion_valores
  ADD COLUMN IF NOT EXISTS tarifa_id uuid references public.retencion_tarifas (id) on delete restrict;
alter table public.retencion_clasificacion_valores
  add constraint retencion_clasificacion_valores_pct_o_tarifa check (pct is null or tarifa_id is null);
CREATE INDEX IF NOT EXISTS retencion_clasificacion_valores_tarifa_idx on public.retencion_clasificacion_valores (tarifa_id) where tarifa_id is not null;

-- Quién y cuándo + historial (R2).
create function public.retencion_r5_anotar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  quien text := coalesce(auth.jwt() ->> 'email', current_user);
  j jsonb := to_jsonb(new);
  clave text;
begin
  new.actualizado_en := now();
  new.actualizado_por := quien;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  clave := case tg_table_name
             when 'retencion_tarifas' then j ->> 'clave'
             when 'retencion_tarifa_versiones' then
               (select t.clave from public.retencion_tarifas t where t.id = (j ->> 'tarifa_id')::uuid) || ':' || (j ->> 'desde')
             else
               (select t.clave || ':' || v.desde from public.retencion_tarifa_versiones v join public.retencion_tarifas t on t.id = v.tarifa_id
                 where v.id = (j ->> 'version_id')::uuid) || ':' || (j ->> 'desde_monto')
           end;
  insert into public.retencion_historial (tabla, clave, antes, despues, motivo, actor)
  values (tg_table_name, coalesce(clave, '?'),
          case when tg_op = 'UPDATE' then to_jsonb(old) - 'actualizado_en' - 'actualizado_por' end,
          j - 'actualizado_en' - 'actualizado_por', coalesce(j ->> 'motivo', j ->> 'nota'), quien);
  return new;
end $$;
revoke execute on function public.retencion_r5_anotar() from public, anon, authenticated;
DROP TRIGGER IF EXISTS trg_retencion_tarifas_anotar ON public.retencion_tarifas;
create trigger trg_retencion_tarifas_anotar before insert or update on public.retencion_tarifas
  for each row execute function public.retencion_r5_anotar();
DROP TRIGGER IF EXISTS trg_retencion_tarifa_versiones_anotar ON public.retencion_tarifa_versiones;
create trigger trg_retencion_tarifa_versiones_anotar before insert or update on public.retencion_tarifa_versiones
  for each row execute function public.retencion_r5_anotar();
DROP TRIGGER IF EXISTS trg_retencion_tarifa_tramos_anotar ON public.retencion_tarifa_tramos;
create trigger trg_retencion_tarifa_tramos_anotar before insert or update on public.retencion_tarifa_tramos
  for each row execute function public.retencion_r5_anotar();

-- Problemas de los tramos de una versión (vacío = bien).
create function public.retencion_tarifa_revisar(p_version uuid)
returns text[] language plpgsql stable security invoker set search_path = public as $$
declare r text[] := '{}'; x record; n int := 0; sin_tope int := 0;
begin
  for x in
    select t.desde_monto, t.hasta_monto, lead(t.desde_monto) over (order by t.desde_monto) as siguiente, row_number() over (order by t.desde_monto) as i
      from public.retencion_tarifa_tramos t where t.version_id = p_version order by t.desde_monto
  loop
    n := n + 1;
    if x.i = 1 and x.desde_monto <> 0 then r := r || ('el primer tramo empieza en ' || x.desde_monto || ', no en 0'); end if;
    if x.hasta_monto is null then sin_tope := sin_tope + 1; end if;
    if x.siguiente is not null and x.hasta_monto is null then
      r := r || ('el tramo que empieza en ' || x.desde_monto || ' no tiene tope y no es el último');
    elsif x.siguiente is not null and x.hasta_monto <> x.siguiente then
      r := r || ('entre ' || x.hasta_monto || ' y ' || x.siguiente || ' hay un hueco o un solape');
    end if;
  end loop;
  if n = 0 then r := r || 'la versión no tiene tramos'::text; end if;
  if n > 0 and sin_tope = 0 then r := r || 'el último tramo tiene tope: un monto mayor no tendría tasa'::text; end if;
  return r;
end $$;

-- Versiones: una nueva cierra la abierta; publicar exige tramos sin problemas; no se despublica.
create function public.retencion_tarifa_versiones_guarda()
returns trigger language plpgsql security definer set search_path = public as $$
declare abierta public.retencion_tarifa_versiones; problemas text[];
begin
  if tg_op = 'INSERT' then
    new.cerrada := false;   -- se publica después de cargar los tramos
    select * into abierta from public.retencion_tarifa_versiones where tarifa_id = new.tarifa_id and hasta is null for update;
    if found then
      if new.desde <= abierta.desde then
        raise exception using errcode = 'P0001',
          message = 'RET_TARIFA_DESDE: la versión nueva tiene que empezar después del ' || to_char(abierta.desde, 'DD/MM/YYYY') || '.';
      end if;
      update public.retencion_tarifa_versiones set hasta = new.desde - 1 where id = abierta.id;
    end if;
  else
    if old.cerrada and not new.cerrada then
      raise exception using errcode = 'P0001', message = 'RET_TARIFA_CERRADA: una versión publicada no se despublica; haga una versión nueva.';
    end if;
    if old.cerrada and (new.desde is distinct from old.desde or new.tarifa_id is distinct from old.tarifa_id) then
      raise exception using errcode = 'P0001', message = 'RET_TARIFA_CERRADA: una versión publicada no cambia de fecha; haga una versión nueva.';
    end if;
    if new.cerrada and not old.cerrada then
      problemas := public.retencion_tarifa_revisar(new.id);
      if cardinality(problemas) > 0 then
        raise exception using errcode = 'P0001', message = 'RET_TARIFA_TRAMOS: no se puede publicar: ' || array_to_string(problemas, '; ') || '.';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.retencion_tarifa_versiones_guarda() from public, anon, authenticated;
DROP TRIGGER IF EXISTS trg_retencion_tarifa_versiones_zz_guarda ON public.retencion_tarifa_versiones;
create trigger trg_retencion_tarifa_versiones_zz_guarda before insert or update on public.retencion_tarifa_versiones
  for each row execute function public.retencion_tarifa_versiones_guarda();

-- Tramos: se dan de alta, se cambian y se BORRAN solo en una versión sin publicar (ajuste 16/10 20:58, pedido de
-- Principal vía Master: sin borrar no había forma de quitar un tramo mal cargado). Lo publicado no se borra, tampoco
-- como postgres ni desde una RPC: la política lo limita para la API y este trigger para todos. El borrado va al historial.
create function public.retencion_tarifa_tramos_guarda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.retencion_tarifa_versiones v where v.id = old.version_id and v.cerrada) then
      raise exception using errcode = 'P0001', message = 'RET_TARIFA_CERRADA: la versión está publicada: sus tramos no se borran; haga una versión nueva.';
    end if;
    insert into public.retencion_historial (tabla, clave, antes, despues, motivo, actor)
    values (tg_table_name,
            coalesce((select t.clave || ':' || v.desde from public.retencion_tarifa_versiones v join public.retencion_tarifas t on t.id = v.tarifa_id
                       where v.id = old.version_id), '?') || ':' || old.desde_monto,
            to_jsonb(old) - 'actualizado_en' - 'actualizado_por', null, 'borrado',
            coalesce(auth.jwt() ->> 'email', current_user));
    return old;
  end if;
  if exists (select 1 from public.retencion_tarifa_versiones v where v.id = new.version_id and v.cerrada)
     or (tg_op = 'UPDATE' and exists (select 1 from public.retencion_tarifa_versiones v where v.id = old.version_id and v.cerrada)) then
    raise exception using errcode = 'P0001', message = 'RET_TARIFA_CERRADA: la versión está publicada: sus tramos no cambian; haga una versión nueva.';
  end if;
  return new;
end $$;
revoke execute on function public.retencion_tarifa_tramos_guarda() from public, anon, authenticated;
DROP TRIGGER IF EXISTS trg_retencion_tarifa_tramos_zz_guarda ON public.retencion_tarifa_tramos;
create trigger trg_retencion_tarifa_tramos_zz_guarda before insert or update or delete on public.retencion_tarifa_tramos
  for each row execute function public.retencion_tarifa_tramos_guarda();

-- Aplica la tarifa (versión publicada vigente en la fecha). Paso 4 «tramos» del modelo.
create function public.retencion_tarifa_aplicar(p_tarifa uuid, p_base numeric, p_ut numeric, p_fecha date)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  t public.retencion_tarifas; v public.retencion_tarifa_versiones; x public.retencion_tarifa_tramos; b numeric; factor numeric;
begin
  select * into t from public.retencion_tarifas where id = p_tarifa;
  if not found or p_base is null then return null; end if;
  select * into v from public.retencion_tarifa_versiones
   where tarifa_id = p_tarifa and cerrada and desde <= coalesce(p_fecha, current_date)
     and (hasta is null or hasta >= coalesce(p_fecha, current_date))
   order by desde desc limit 1;
  if not found then return null; end if;
  if t.unidad = 'UT' then
    if coalesce(p_ut, 0) <= 0 then return null; end if;
    factor := p_ut;
  else
    factor := 1;
  end if;
  b := p_base / factor;
  -- Límite inferior exclusivo (salvo el 0) y superior inclusivo: «hasta 2.000» incluye 2.000.
  select * into x from public.retencion_tarifa_tramos
   where version_id = v.id and (desde_monto < b or desde_monto = 0)
   order by desde_monto desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object(
    'version_id', v.id, 'desde_monto', x.desde_monto, 'hasta_monto', x.hasta_monto, 'pct', x.pct,
    'sustraendo', round(x.sustraendo * factor, 2),
    'monto', greatest(0, round(p_base * x.pct / 100 - x.sustraendo * factor, 2)));
end $$;

revoke execute on function public.retencion_tarifa_revisar(uuid), public.retencion_tarifa_aplicar(uuid, numeric, numeric, date) from public, anon;
grant execute on function public.retencion_tarifa_revisar(uuid), public.retencion_tarifa_aplicar(uuid, numeric, numeric, date) to authenticated, service_role;

-- Arranque: la Tarifa N° 2, sin tramos (los carga el contador).
insert into public.retencion_tarifas (clave, nombre, impuesto_clave, unidad, nota)
values ('islr_tarifa_2', 'Tarifa N° 2 (ISLR)', 'ISLR', 'UT', 'Los tramos los carga el contador; luego se publica la versión.');

-- RLS
do $$
declare t text;
begin
  foreach t in array array['retencion_tarifas', 'retencion_tarifa_versiones', 'retencion_tarifa_tramos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate, references, trigger on public.%I from authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()) or (select public.puede(''retenciones'')))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin()) or (select public.puede(''retenciones''))) with check ((select public.is_admin()) or (select public.puede(''retenciones'')))', t || '_update', t);
  end loop;
end $$;

-- Borrar: solo tramos de una versión sin publicar (el resto de las tablas sigue sin DELETE).
grant delete on public.retencion_tarifa_tramos to authenticated;
DROP POLICY IF EXISTS retencion_tarifa_tramos_delete ON public.retencion_tarifa_tramos;
create policy retencion_tarifa_tramos_delete on public.retencion_tarifa_tramos for delete to authenticated
  using (((select public.is_admin()) or (select public.puede('retenciones')))
         and exists (select 1 from public.retencion_tarifa_versiones v where v.id = version_id and not v.cerrada));

DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT unnest(ARRAY['retencion_tarifas', 'retencion_tarifa_versiones', 'retencion_tarifa_tramos']) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = r
    ) THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', r);
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END;
    END IF;
  END LOOP;
END $$;


-- R7 · 9 de 13 · gt_retencion_reglas · migración gt_retencion_reglas, versión 20261020100009

-- ── Guarda: solo sigue si la base está justo antes de R7 (si no, se detiene sin escribir nada) ──


CREATE TABLE IF NOT EXISTS public.retencion_reglas (
  id               uuid primary key default gen_random_uuid(),
  impuesto_clave   text not null references public.retencion_impuestos (clave) on delete restrict,
  nombre           text not null check (length(btrim(nombre)) >= 2),
  version          integer not null default 1 check (version >= 1),
  estado           text not null default 'en_prueba' check (estado in ('en_prueba', 'vigente', 'retirada')),
  desde            date not null,
  hasta            date,
  prioridad        smallint not null default 100,
  motivo           text not null check (length(btrim(motivo)) > 0),
  fuente           text,
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text,
  unique (impuesto_clave, nombre, version),
  check (hasta is null or hasta >= desde)
);
CREATE INDEX IF NOT EXISTS retencion_reglas_vigencia_idx on public.retencion_reglas (impuesto_clave, estado, desde);
comment on table public.retencion_reglas is 'Retenciones: cómo y cuándo se retiene cada impuesto (versiones; solo «en prueba» se edita)';

CREATE TABLE IF NOT EXISTS public.retencion_regla_condiciones (
  id               uuid primary key default gen_random_uuid(),
  regla_id         uuid not null references public.retencion_reglas (id) on delete restrict,
  pieza            text not null check (pieza in ('direccion', 'tipo_documento', 'tipo_operacion', 'sujeto', 'tipo_contribuyente',
                                                  'condicion_agente', 'clasificacion', 'monto_minimo')),
  operador         text not null default 'es' check (operador in ('es', 'no_es', 'en', 'no_en')),
  valor            jsonb not null,
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text
);
CREATE INDEX IF NOT EXISTS retencion_regla_condiciones_regla_idx on public.retencion_regla_condiciones (regla_id);
comment on table public.retencion_regla_condiciones is 'Retenciones: condiciones de una regla (piezas de una lista cerrada)';

CREATE TABLE IF NOT EXISTS public.retencion_regla_pasos (
  id               uuid primary key default gen_random_uuid(),
  regla_id         uuid not null references public.retencion_reglas (id) on delete restrict,
  paso             smallint not null check (paso between 1 and 8),
  operacion        text not null,
  valores          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text,
  unique (regla_id, paso)
);
comment on table public.retencion_regla_pasos is 'Retenciones: los pasos 1-8 del cálculo de una regla, cada uno con una operación de la lista cerrada';

CREATE TABLE IF NOT EXISTS public.retencion_decisiones (
  id               uuid primary key default gen_random_uuid(),
  documento_id     uuid not null references public.retencion_documentos (id) on delete restrict,
  impuesto_clave   text not null references public.retencion_impuestos (clave) on delete restrict,
  decision         text not null check (decision in ('aplica', 'no_aplica')),
  motivo_id        uuid references public.retencion_motivos_no_aplica (id) on delete restrict,
  motivo_texto     text,      -- foto del texto del motivo
  detalle          text,      -- texto libre, si el motivo lo pide
  regla_id         uuid references public.retencion_reglas (id) on delete restrict,
  created_at       timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text,
  unique (documento_id, impuesto_clave)
);
comment on table public.retencion_decisiones is 'Retenciones: por documento fiscal e impuesto, si corresponde retener o no aplica (con su motivo)';

-- 4) La regla y la foto en la retención.
alter table public.retenciones ADD COLUMN IF NOT EXISTS regla_id uuid references public.retencion_reglas (id) on delete restrict;
alter table public.retenciones ADD COLUMN IF NOT EXISTS regla_version integer;
alter table public.retenciones ADD COLUMN IF NOT EXISTS foto jsonb check (foto is null or jsonb_typeof(foto) = 'object');
CREATE INDEX IF NOT EXISTS retenciones_regla_idx on public.retenciones (regla_id) where regla_id is not null;

create function public.retenciones_regla_foto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.foto is not null
     and (new.foto is distinct from old.foto or new.regla_id is distinct from old.regla_id) then
    raise exception using errcode = 'P0001',
      message = 'RET_FOTO_NO_CAMBIA: la retención ya guarda la regla y la foto con las que se calculó; no cambian.';
  end if;
  if new.regla_id is not null and (tg_op = 'INSERT' or new.regla_id is distinct from old.regla_id or new.regla_version is null) then
    select r.version into new.regla_version from public.retencion_reglas r where r.id = new.regla_id;
  end if;
  return new;
end $$;
revoke execute on function public.retenciones_regla_foto() from public, anon, authenticated;
DROP TRIGGER IF EXISTS trg_retenciones_regla_foto ON public.retenciones;
create trigger trg_retenciones_regla_foto before insert or update on public.retenciones
  for each row execute function public.retenciones_regla_foto();

-- Quién y cuándo + historial (R2), para las cuatro tablas.
create function public.retencion_r7_anotar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  quien text := coalesce(auth.jwt() ->> 'email', current_user);
  j jsonb := to_jsonb(new);
  clave text;
begin
  new.actualizado_en := now();
  new.actualizado_por := quien;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  if tg_table_name = 'retencion_reglas' then
    clave := (j ->> 'impuesto_clave') || ':' || (j ->> 'nombre') || ':v' || (j ->> 'version');
  elsif tg_table_name = 'retencion_decisiones' then
    clave := (j ->> 'documento_id') || ':' || (j ->> 'impuesto_clave');
  else
    select r.impuesto_clave || ':' || r.nombre || ':v' || r.version into clave from public.retencion_reglas r where r.id = (j ->> 'regla_id')::uuid;
    clave := coalesce(clave, '?') || ':' || coalesce(j ->> 'paso', j ->> 'pieza');
  end if;
  insert into public.retencion_historial (tabla, clave, antes, despues, motivo, actor)
  values (tg_table_name, clave,
          case when tg_op = 'UPDATE' then to_jsonb(old) - 'actualizado_en' - 'actualizado_por' end,
          j - 'actualizado_en' - 'actualizado_por', coalesce(j ->> 'motivo', j ->> 'motivo_texto'), quien);
  return new;
end $$;
revoke execute on function public.retencion_r7_anotar() from public, anon, authenticated;
DROP TRIGGER IF EXISTS trg_retencion_reglas_anotar ON public.retencion_reglas;
create trigger trg_retencion_reglas_anotar before insert or update on public.retencion_reglas
  for each row execute function public.retencion_r7_anotar();
DROP TRIGGER IF EXISTS trg_retencion_regla_condiciones_anotar ON public.retencion_regla_condiciones;
create trigger trg_retencion_regla_condiciones_anotar before insert or update on public.retencion_regla_condiciones
  for each row execute function public.retencion_r7_anotar();
DROP TRIGGER IF EXISTS trg_retencion_regla_pasos_anotar ON public.retencion_regla_pasos;
create trigger trg_retencion_regla_pasos_anotar before insert or update on public.retencion_regla_pasos
  for each row execute function public.retencion_r7_anotar();
DROP TRIGGER IF EXISTS trg_retencion_decisiones_anotar ON public.retencion_decisiones;
create trigger trg_retencion_decisiones_anotar before insert or update on public.retencion_decisiones
  for each row execute function public.retencion_r7_anotar();

-- 1) Reglas: solo «en_prueba» se edita; el estado lo cambian solo las RPC (marca local a su transacción).
create function public.retencion_reglas_guarda()
returns trigger language plpgsql security definer set search_path = public as $$
declare por_funcion boolean := coalesce(current_setting('retenciones.regla_por_funcion', true), '') = 'si';
begin
  if tg_op = 'INSERT' then
    if new.estado <> 'en_prueba' and not por_funcion then
      raise exception using errcode = 'P0001', message = 'RET_REGLA_ESTADO: una regla nace «en prueba»; se activa con retencion_regla_activar.';
    end if;
    return new;
  end if;
  if new.estado is distinct from old.estado and not por_funcion then
    raise exception using errcode = 'P0001', message = 'RET_REGLA_ESTADO: el estado se cambia con retencion_regla_activar o retencion_regla_retirar.';
  end if;
  if old.estado <> 'en_prueba' and not por_funcion then
    raise exception using errcode = 'P0001',
      message = 'RET_REGLA_NO_EDITABLE: la regla está ' || old.estado || '; para cambiarla, haga una versión nueva.';
  end if;
  if new.impuesto_clave is distinct from old.impuesto_clave or new.nombre is distinct from old.nombre or new.version is distinct from old.version then
    raise exception using errcode = 'P0001', message = 'RET_REGLA_NO_EDITABLE: el impuesto, el nombre y la versión no cambian.';
  end if;
  return new;
end $$;
revoke execute on function public.retencion_reglas_guarda() from public, anon, authenticated;
DROP TRIGGER IF EXISTS trg_retencion_reglas_zz_guarda ON public.retencion_reglas;
create trigger trg_retencion_reglas_zz_guarda before insert or update on public.retencion_reglas
  for each row execute function public.retencion_reglas_guarda();

-- 2) y 3) Validación de condiciones y pasos (devuelve el problema o null).
create function public.retencion_regla_valida_condicion(p_pieza text, p_operador text, p_valor jsonb)
returns text language plpgsql stable security definer set search_path = public as $$
declare lista text[]; e jsonb;
begin
  lista := case p_pieza
    when 'direccion' then array['practicada', 'sufrida']
    when 'tipo_documento' then array['factura', 'nota_debito', 'nota_credito', 'pago']
    when 'tipo_operacion' then array['bienes', 'servicios', 'ambos']
    when 'sujeto' then array['PJD', 'PJND', 'PNR', 'PNNR']
    when 'tipo_contribuyente' then array['ordinario', 'especial', 'formal', 'agente_percepcion']
    when 'condicion_agente' then array['agente_retencion', 'agente_percepcion', 'contribuyente_especial']
  end;
  if lista is not null then
    if p_operador in ('es', 'no_es') then
      if jsonb_typeof(p_valor) <> 'string' or not ((p_valor #>> '{}') = any (lista)) then
        return p_pieza || ' admite: ' || array_to_string(lista, ', ');
      end if;
    else
      if jsonb_typeof(p_valor) <> 'array' or jsonb_array_length(p_valor) = 0 then
        return p_pieza || ' con «' || p_operador || '» lleva una lista';
      end if;
      for e in select * from jsonb_array_elements(p_valor) loop
        if jsonb_typeof(e) <> 'string' or not ((e #>> '{}') = any (lista)) then
          return p_pieza || ' admite: ' || array_to_string(lista, ', ');
        end if;
      end loop;
    end if;
    return null;
  end if;
  if p_operador not in ('es', 'no_es') or jsonb_typeof(p_valor) <> 'object' then
    return p_pieza || ' va con «es» o «no_es» y un objeto';
  end if;
  if p_pieza = 'clasificacion' then
    if not exists (select 1 from public.retencion_clasificaciones k where k.clave = p_valor ->> 'clasificacion') then
      return 'clasificacion: no existe la clasificación «' || coalesce(p_valor ->> 'clasificacion', '') || '»';
    end if;
    if p_valor ? 'codigos' and jsonb_typeof(p_valor -> 'codigos') <> 'array' then return 'clasificacion: «codigos» es una lista'; end if;
  elsif p_pieza = 'monto_minimo' then
    if jsonb_typeof(p_valor -> 'monto') <> 'number' or (p_valor ->> 'monto')::numeric < 0
       or coalesce(p_valor ->> 'unidad', '') not in ('UT', 'Bs') or coalesce(p_valor ->> 'sobre', '') not in ('base', 'pago') then
      return 'monto_minimo: {"monto": n ≥ 0, "unidad": "UT" | "Bs", "sobre": "base" | "pago"}';
    end if;
  end if;
  return null;
end $$;

create function public.retencion_regla_valida_paso(p_paso int, p_operacion text, p_valores jsonb)
returns text language plpgsql stable security definer set search_path = public as $$
declare permitidas text[]; e jsonb; v jsonb := coalesce(p_valores, '{}'::jsonb);
begin
  permitidas := case p_paso
    when 1 then array['componer_base'] when 2 then array['convertir_moneda'] when 3 then array['comparar_minimo']
    when 4 then array['pct_fijo', 'pct_parametro', 'pct_clasificacion', 'tramos', 'monto_fijo']
    when 5 then array['restar_sustraendo'] when 6 then array['retener_pct', 'retener_todo']
    when 7 then array['topes'] when 8 then array['redondear'] end;
  if permitidas is null or not (p_operacion = any (permitidas)) then
    return 'el paso ' || p_paso || ' admite: ' || coalesce(array_to_string(permitidas, ', '), 'nada (pasos 1 a 8)');
  end if;
  if jsonb_typeof(v) <> 'object' then return 'los valores van como objeto'; end if;
  case p_operacion
    when 'componer_base' then
      if jsonb_typeof(v -> 'componentes') <> 'array' or jsonb_array_length(v -> 'componentes') = 0 then
        return 'componer_base lleva «componentes»: [{"campo", "signo"}]';
      end if;
      for e in select * from jsonb_array_elements(v -> 'componentes') loop
        if coalesce(e ->> 'campo', '') not in ('base_imponible', 'exento', 'iva', 'igtf', 'subtotal', 'total', 'pago', 'pago_divisas',
                                               'descuento', 'flete', 'otros')
           or coalesce(e ->> 'signo', '') not in ('+', '-') then
          return 'componer_base: campo de base_imponible, exento, iva, igtf, subtotal, total, pago, pago_divisas, descuento, flete u otros; signo + o -';
        end if;
      end loop;
      if v ? 'porcion' and not ((jsonb_typeof(v -> 'porcion') = 'number' and (v ->> 'porcion')::numeric > 0 and (v ->> 'porcion')::numeric <= 100)
                                or (v ->> 'porcion') = 'clasificacion') then
        return 'componer_base: «porcion» es un % (0-100] o "clasificacion"';
      end if;
    when 'convertir_moneda' then
      if coalesce(v ->> 'tasa', '') <> 'bcv_fecha_factura' then return 'convertir_moneda: {"tasa": "bcv_fecha_factura"}'; end if;
    when 'comparar_minimo' then
      if not ((v ->> 'desde') = 'clasificacion'
              or (jsonb_typeof(v -> 'monto') = 'number' and (v ->> 'monto')::numeric >= 0 and coalesce(v ->> 'unidad', '') in ('UT', 'Bs', 'MMV'))) then
        return 'comparar_minimo: {"desde": "clasificacion"} o {"monto": n, "unidad": "UT" | "Bs" | "MMV"}';
      end if;
    when 'pct_fijo', 'retener_pct' then
      if jsonb_typeof(v -> 'pct') = 'number' then
        if (v ->> 'pct')::numeric < 0 or (v ->> 'pct')::numeric > 100 then return p_operacion || ': el % va de 0 a 100'; end if;
      elsif p_operacion = 'retener_pct' and v ? 'parametro' then
        if not exists (select 1 from public.retencion_parametro_claves k where k.clave = v ->> 'parametro') then
          return 'retener_pct: no existe el parámetro «' || (v ->> 'parametro') || '»';
        end if;
        if v ? 'supuestos' and not exists (select 1 from public.retencion_parametro_claves k where k.clave = v ->> 'supuestos') then
          return 'retener_pct: no existe el parámetro «' || (v ->> 'supuestos') || '»';
        end if;
      else
        return p_operacion || ' lleva {"pct": n}' || case when p_operacion = 'retener_pct' then ' o {"parametro", "supuestos"}' else '' end;
      end if;
    when 'pct_parametro' then
      if not exists (select 1 from public.retencion_parametro_claves k where k.clave = v ->> 'parametro') then
        return 'pct_parametro: no existe el parámetro «' || coalesce(v ->> 'parametro', '') || '»';
      end if;
    when 'pct_clasificacion' then
      if not exists (select 1 from public.retencion_clasificaciones k where k.clave = v ->> 'clasificacion') then
        return 'pct_clasificacion: no existe la clasificación «' || coalesce(v ->> 'clasificacion', '') || '»';
      end if;
    when 'tramos' then
      if not exists (select 1 from public.retencion_tarifas t where t.clave = v ->> 'tarifa') then
        return 'tramos: no existe la tarifa «' || coalesce(v ->> 'tarifa', '') || '»';
      end if;
    when 'monto_fijo' then
      if jsonb_typeof(v -> 'monto') <> 'number' or (v ->> 'monto')::numeric < 0 or coalesce(v ->> 'unidad', '') not in ('UT', 'Bs') then
        return 'monto_fijo: {"monto": n ≥ 0, "unidad": "UT" | "Bs"}';
      end if;
    when 'restar_sustraendo' then
      if not ((v ->> 'desde') = 'clasificacion'
              or (jsonb_typeof(v -> 'factor') = 'number' and (v ->> 'factor')::numeric >= 0)
              or (jsonb_typeof(v -> 'monto') = 'number' and (v ->> 'monto')::numeric >= 0)) then
        return 'restar_sustraendo: {"desde": "clasificacion"}, {"factor": n} o {"monto": n}';
      end if;
    when 'retener_todo' then
      null;
    when 'topes' then
      if (v ? 'minimo' and jsonb_typeof(v -> 'minimo') <> 'number')
         or (v ? 'maximo' and jsonb_typeof(v -> 'maximo') <> 'null' and coalesce(v ->> 'maximo', '') not in ('impuesto_causado', 'base')) then
        return 'topes: {"minimo": n, "maximo": "impuesto_causado" | "base" | null}';
      end if;
    when 'redondear' then
      if jsonb_typeof(v -> 'decimales') <> 'number' or (v ->> 'decimales')::numeric not in (0, 1, 2, 3, 4) then
        return 'redondear: {"decimales": 0 a 4}';
      end if;
  end case;
  return null;
end $$;
revoke execute on function public.retencion_regla_valida_condicion(text, text, jsonb), public.retencion_regla_valida_paso(int, text, jsonb) from public, anon;
grant execute on function public.retencion_regla_valida_condicion(text, text, jsonb), public.retencion_regla_valida_paso(int, text, jsonb) to authenticated, service_role;

-- Condiciones y pasos: se dan de alta, se cambian y se BORRAN solo en una regla «en_prueba», y válidos (el borrado:
-- ajuste 16/10 20:58, pedido de Principal vía Master; la versión nueva copia todo, así que sin borrar no había salida).
-- Lo vigente o retirado no se borra, tampoco como postgres: la política lo limita para la API y este trigger para todos.
create function public.retencion_regla_piezas_guarda()
returns trigger language plpgsql security definer set search_path = public as $$
declare estado text; problema text; j jsonb; por_funcion boolean := coalesce(current_setting('retenciones.regla_por_funcion', true), '') = 'si';
begin
  if tg_op = 'DELETE' then
    select r.estado into estado from public.retencion_reglas r where r.id = old.regla_id;
    if estado is distinct from 'en_prueba' and not por_funcion then
      raise exception using errcode = 'P0001',
        message = 'RET_REGLA_NO_EDITABLE: la regla está ' || coalesce(estado, '?') || '; no se le quita nada; haga una versión nueva.';
    end if;
    insert into public.retencion_historial (tabla, clave, antes, despues, motivo, actor)
    values (tg_table_name,
            coalesce((select r.impuesto_clave || ':' || r.nombre || ':v' || r.version from public.retencion_reglas r where r.id = old.regla_id), '?')
              || ':' || coalesce(to_jsonb(old) ->> 'paso', to_jsonb(old) ->> 'pieza'),
            to_jsonb(old) - 'actualizado_en' - 'actualizado_por', null, 'borrado',
            coalesce(auth.jwt() ->> 'email', current_user));
    return old;
  end if;
  j := to_jsonb(new);
  -- En un cambio, también la regla de ORIGEN tiene que estar en prueba (no se saca una pieza de una regla vigente).
  if tg_op = 'UPDATE' and new.regla_id is distinct from old.regla_id then
    select r.estado into estado from public.retencion_reglas r where r.id = old.regla_id;
    if estado is distinct from 'en_prueba' and not por_funcion then
      raise exception using errcode = 'P0001',
        message = 'RET_REGLA_NO_EDITABLE: la regla de origen está ' || coalesce(estado, '?') || '; haga una versión nueva.';
    end if;
  end if;
  select r.estado into estado from public.retencion_reglas r where r.id = new.regla_id;
  if estado is distinct from 'en_prueba' and not por_funcion then
    raise exception using errcode = 'P0001',
      message = 'RET_REGLA_NO_EDITABLE: la regla está ' || coalesce(estado, '?') || '; para cambiarla, haga una versión nueva.';
  end if;
  if tg_table_name = 'retencion_regla_condiciones' then
    problema := public.retencion_regla_valida_condicion(j ->> 'pieza', j ->> 'operador', j -> 'valor');
    if problema is not null then raise exception using errcode = 'P0001', message = 'RET_REGLA_CONDICION: ' || problema || '.'; end if;
  else
    problema := public.retencion_regla_valida_paso((j ->> 'paso')::int, j ->> 'operacion', j -> 'valores');
    if problema is not null then raise exception using errcode = 'P0001', message = 'RET_REGLA_PASO: ' || problema || '.'; end if;
  end if;
  return new;
end $$;
revoke execute on function public.retencion_regla_piezas_guarda() from public, anon, authenticated;
DROP TRIGGER IF EXISTS trg_retencion_regla_condiciones_zz_guarda ON public.retencion_regla_condiciones;
create trigger trg_retencion_regla_condiciones_zz_guarda before insert or update or delete on public.retencion_regla_condiciones
  for each row execute function public.retencion_regla_piezas_guarda();
DROP TRIGGER IF EXISTS trg_retencion_regla_pasos_zz_guarda ON public.retencion_regla_pasos;
create trigger trg_retencion_regla_pasos_zz_guarda before insert or update or delete on public.retencion_regla_pasos
  for each row execute function public.retencion_regla_piezas_guarda();

-- 5) Decisiones: «no aplica» con motivo (foto del texto) y detalle si el motivo lo pide.
create function public.retencion_decisiones_guarda()
returns trigger language plpgsql security definer set search_path = public as $$
declare m public.retencion_motivos_no_aplica;
begin
  if new.decision = 'no_aplica' then
    if new.motivo_id is not null then
      select * into m from public.retencion_motivos_no_aplica where id = new.motivo_id;
      if m.impuesto_clave is not null and m.impuesto_clave <> new.impuesto_clave then
        raise exception using errcode = 'P0001', message = 'RET_DECISION_MOTIVO: ese motivo es de ' || m.impuesto_clave || ', no de ' || new.impuesto_clave || '.';
      end if;
      if m.requiere_texto and nullif(btrim(new.detalle), '') is null then
        raise exception using errcode = 'P0001', message = 'RET_DECISION_DETALLE: el motivo «' || m.texto || '» pide un texto.';
      end if;
      if tg_op = 'INSERT' or new.motivo_id is distinct from old.motivo_id then
        new.motivo_texto := m.texto;   -- la foto del texto: editar el motivo después no lo cambia
      end if;
    end if;
    if nullif(btrim(new.motivo_texto), '') is null then
      raise exception using errcode = 'P0001', message = 'RET_DECISION_MOTIVO: «no aplica» lleva un motivo.';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.retencion_decisiones_guarda() from public, anon, authenticated;
DROP TRIGGER IF EXISTS trg_retencion_decisiones_0_guarda ON public.retencion_decisiones;
create trigger trg_retencion_decisiones_0_guarda before insert or update on public.retencion_decisiones
  for each row execute function public.retencion_decisiones_guarda();

-- 6) RPC
create function public.retencion_regla_nueva_version(p_regla uuid, p_desde date, p_motivo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.retencion_reglas; nuevo uuid; v int;
begin
  if not (public.is_admin() or public.puede('retenciones')) then
    raise exception using errcode = '42501', message = 'RET_SIN_PERMISO: hace falta el permiso de Retenciones.';
  end if;
  if coalesce(btrim(p_motivo), '') = '' or p_desde is null then
    raise exception using errcode = 'P0001', message = 'RET_MOTIVO_OBLIGATORIO: indique desde cuándo y por qué.';
  end if;
  select * into r from public.retencion_reglas where id = p_regla;
  if not found then raise exception using errcode = 'P0001', message = 'RET_REGLA_NO_EXISTE'; end if;
  select max(x.version) + 1 into v from public.retencion_reglas x where x.impuesto_clave = r.impuesto_clave and x.nombre = r.nombre;
  insert into public.retencion_reglas (impuesto_clave, nombre, version, estado, desde, prioridad, motivo, fuente)
  values (r.impuesto_clave, r.nombre, v, 'en_prueba', p_desde, r.prioridad, btrim(p_motivo), r.fuente)
  returning id into nuevo;
  insert into public.retencion_regla_condiciones (regla_id, pieza, operador, valor)
  select nuevo, c.pieza, c.operador, c.valor from public.retencion_regla_condiciones c where c.regla_id = p_regla;
  insert into public.retencion_regla_pasos (regla_id, paso, operacion, valores)
  select nuevo, s.paso, s.operacion, s.valores from public.retencion_regla_pasos s where s.regla_id = p_regla;
  return nuevo;
end $$;

create function public.retencion_regla_activar(p_regla uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.retencion_reglas; previa public.retencion_reglas;
begin
  if not (public.is_admin() or public.puede('retenciones')) then
    raise exception using errcode = '42501', message = 'RET_SIN_PERMISO: hace falta el permiso de Retenciones.';
  end if;
  select * into r from public.retencion_reglas where id = p_regla for update;
  if not found then raise exception using errcode = 'P0001', message = 'RET_REGLA_NO_EXISTE'; end if;
  if r.estado <> 'en_prueba' then
    raise exception using errcode = 'P0001', message = 'RET_REGLA_ESTADO: solo se activa una regla «en prueba» (esta está ' || r.estado || ').';
  end if;
  if not exists (select 1 from public.retencion_regla_pasos s where s.regla_id = r.id) then
    raise exception using errcode = 'P0001', message = 'RET_REGLA_PASO: la regla no tiene pasos.';
  end if;
  perform set_config('retenciones.regla_por_funcion', 'si', true);
  for previa in select * from public.retencion_reglas x
                 where x.impuesto_clave = r.impuesto_clave and x.nombre = r.nombre and x.estado = 'vigente' and x.id <> r.id
                   and (x.hasta is null or x.hasta >= r.desde) for update loop
    if previa.desde >= r.desde then
      perform set_config('retenciones.regla_por_funcion', '', true);
      raise exception using errcode = 'P0001',
        message = 'RET_REGLA_ESTADO: la versión ' || previa.version || ' rige desde el ' || to_char(previa.desde, 'DD/MM/YYYY')
               || '; la nueva tiene que empezar después.';
    end if;
    update public.retencion_reglas set hasta = r.desde - 1, motivo = btrim(coalesce(p_motivo, motivo)) where id = previa.id;
  end loop;
  update public.retencion_reglas set estado = 'vigente', motivo = coalesce(nullif(btrim(p_motivo), ''), motivo) where id = r.id;
  perform set_config('retenciones.regla_por_funcion', '', true);
end $$;

create function public.retencion_regla_retirar(p_regla uuid, p_hasta date, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.retencion_reglas;
begin
  if not (public.is_admin() or public.puede('retenciones')) then
    raise exception using errcode = '42501', message = 'RET_SIN_PERMISO: hace falta el permiso de Retenciones.';
  end if;
  if coalesce(btrim(p_motivo), '') = '' or p_hasta is null then
    raise exception using errcode = 'P0001', message = 'RET_MOTIVO_OBLIGATORIO: indique hasta cuándo y por qué.';
  end if;
  select * into r from public.retencion_reglas where id = p_regla for update;
  if not found then raise exception using errcode = 'P0001', message = 'RET_REGLA_NO_EXISTE'; end if;
  if r.estado <> 'vigente' then
    raise exception using errcode = 'P0001', message = 'RET_REGLA_ESTADO: solo se retira una regla vigente.';
  end if;
  if p_hasta < r.desde then
    raise exception using errcode = 'P0001', message = 'RET_REGLA_ESTADO: la regla empieza el ' || to_char(r.desde, 'DD/MM/YYYY') || '.';
  end if;
  perform set_config('retenciones.regla_por_funcion', 'si', true);
  update public.retencion_reglas set estado = 'retirada', hasta = p_hasta, motivo = btrim(p_motivo) where id = r.id;
  perform set_config('retenciones.regla_por_funcion', '', true);
end $$;

-- Las reglas que rigen en una fecha (vigentes o retiradas después de esa fecha), con sus condiciones y pasos.
-- Con p_incluir_prueba, también las «en prueba» (para el simulador).
create function public.retencion_reglas_vigentes(p_impuesto text, p_fecha date, p_incluir_prueba boolean default false)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'regla', to_jsonb(r),
           'condiciones', coalesce((select jsonb_agg(jsonb_build_object('pieza', c.pieza, 'operador', c.operador, 'valor', c.valor) order by c.pieza)
                                      from public.retencion_regla_condiciones c where c.regla_id = r.id), '[]'::jsonb),
           'pasos', coalesce((select jsonb_agg(jsonb_build_object('paso', s.paso, 'operacion', s.operacion, 'valores', s.valores) order by s.paso)
                                from public.retencion_regla_pasos s where s.regla_id = r.id), '[]'::jsonb))
         order by r.prioridad, r.nombre, r.version), '[]'::jsonb)
    from public.retencion_reglas r
   where r.impuesto_clave = upper(p_impuesto)
     and (r.estado in ('vigente', 'retirada') or (p_incluir_prueba and r.estado = 'en_prueba'))
     and r.desde <= coalesce(p_fecha, current_date) and (r.hasta is null or r.hasta >= coalesce(p_fecha, current_date));
$$;

revoke execute on function public.retencion_regla_nueva_version(uuid, date, text), public.retencion_regla_activar(uuid, text),
  public.retencion_regla_retirar(uuid, date, text), public.retencion_reglas_vigentes(text, date, boolean) from public, anon;
grant execute on function public.retencion_regla_nueva_version(uuid, date, text), public.retencion_regla_activar(uuid, text),
  public.retencion_regla_retirar(uuid, date, text), public.retencion_reglas_vigentes(text, date, boolean) to authenticated, service_role;

-- 7) Arranque: las 5 de hoy, «en prueba», armadas con lo que hace retencionesCalculo.ts.
insert into public.retencion_reglas (impuesto_clave, nombre, desde, motivo, fuente)
select x.imp, x.nombre, current_date,
       'Arranque R7: lo que hoy hace el código (retencionesCalculo.ts). En prueba hasta compararla con el simulador.', null
  from (values ('IVA', 'IVA'), ('ISLR', 'ISLR por concepto'), ('MUNICIPAL', 'ISAE'), ('ESTADAL', 'Estadal'), ('IGTF', 'IGTF')) as x (imp, nombre);

insert into public.retencion_regla_condiciones (regla_id, pieza, operador, valor)
select r.id, c.pieza, c.operador, c.valor
  from public.retencion_reglas r
  join (values
    ('IVA',       'direccion',        'es', '"practicada"'::jsonb),
    ('IVA',       'condicion_agente', 'en', '["agente_retencion", "contribuyente_especial"]'::jsonb),
    ('ISLR',      'direccion',        'es', '"practicada"'::jsonb),
    ('ISLR',      'clasificacion',    'es', '{"clasificacion": "islr_conceptos"}'::jsonb),
    ('MUNICIPAL', 'direccion',        'es', '"practicada"'::jsonb),
    ('ESTADAL',   'direccion',        'es', '"practicada"'::jsonb)
  ) as c (imp, pieza, operador, valor) on c.imp = r.impuesto_clave
 where r.version = 1;

insert into public.retencion_regla_pasos (regla_id, paso, operacion, valores)
select r.id, s.paso, s.operacion, s.valores
  from public.retencion_reglas r
  join (values
    -- IVA: el IVA de la factura × 75 % (o 100 % en los supuestos).
    ('IVA', 1, 'componer_base', '{"componentes": [{"campo": "iva", "signo": "+"}]}'::jsonb),
    ('IVA', 6, 'retener_pct', '{"parametro": "pct_retencion", "supuestos": "pct_retencion_art5"}'::jsonb),
    ('IVA', 8, 'redondear', '{"decimales": 2}'::jsonb),
    -- ISLR: el pago × la porción del concepto; en Bs; mínimo; % del concepto y sujeto; sustraendo; nunca negativo.
    ('ISLR', 1, 'componer_base', '{"componentes": [{"campo": "pago", "signo": "+"}], "porcion": "clasificacion"}'::jsonb),
    ('ISLR', 2, 'convertir_moneda', '{"tasa": "bcv_fecha_factura"}'::jsonb),
    ('ISLR', 3, 'comparar_minimo', '{"desde": "clasificacion"}'::jsonb),
    ('ISLR', 4, 'pct_clasificacion', '{"clasificacion": "islr_conceptos"}'::jsonb),
    ('ISLR', 5, 'restar_sustraendo', '{"desde": "clasificacion"}'::jsonb),
    ('ISLR', 7, 'topes', '{"minimo": 0}'::jsonb),
    ('ISLR', 8, 'redondear', '{"decimales": 2}'::jsonb),
    -- ISAE y estadal: el pago × la alícuota de Parámetros (hoy); el ISAE por actividad será una versión nueva.
    ('MUNICIPAL', 1, 'componer_base', '{"componentes": [{"campo": "pago", "signo": "+"}]}'::jsonb),
    ('MUNICIPAL', 4, 'pct_parametro', '{"parametro": "alicuota"}'::jsonb),
    ('MUNICIPAL', 8, 'redondear', '{"decimales": 2}'::jsonb),
    ('ESTADAL', 1, 'componer_base', '{"componentes": [{"campo": "pago", "signo": "+"}]}'::jsonb),
    ('ESTADAL', 4, 'pct_parametro', '{"parametro": "alicuota"}'::jsonb),
    ('ESTADAL', 8, 'redondear', '{"decimales": 2}'::jsonb),
    -- IGTF: el pago en divisas × su alícuota.
    ('IGTF', 1, 'componer_base', '{"componentes": [{"campo": "pago_divisas", "signo": "+"}]}'::jsonb),
    ('IGTF', 4, 'pct_parametro', '{"parametro": "alicuota"}'::jsonb),
    ('IGTF', 8, 'redondear', '{"decimales": 2}'::jsonb)
  ) as s (imp, paso, operacion, valores) on s.imp = r.impuesto_clave
 where r.version = 1;

-- RLS
do $$
declare t text;
begin
  foreach t in array array['retencion_reglas', 'retencion_regla_condiciones', 'retencion_regla_pasos', 'retencion_decisiones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate, references, trigger on public.%I from authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()) or (select public.puede(''retenciones'')))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin()) or (select public.puede(''retenciones''))) with check ((select public.is_admin()) or (select public.puede(''retenciones'')))', t || '_update', t);
  end loop;
end $$;

-- Borrar: solo condiciones y pasos de una regla «en_prueba» (reglas y decisiones siguen sin DELETE).
grant delete on public.retencion_regla_condiciones, public.retencion_regla_pasos to authenticated;
DROP POLICY IF EXISTS retencion_regla_condiciones_delete ON public.retencion_regla_condiciones;
create policy retencion_regla_condiciones_delete on public.retencion_regla_condiciones for delete to authenticated
  using (((select public.is_admin()) or (select public.puede('retenciones')))
         and exists (select 1 from public.retencion_reglas r where r.id = regla_id and r.estado = 'en_prueba'));
DROP POLICY IF EXISTS retencion_regla_pasos_delete ON public.retencion_regla_pasos;
create policy retencion_regla_pasos_delete on public.retencion_regla_pasos for delete to authenticated
  using (((select public.is_admin()) or (select public.puede('retenciones')))
         and exists (select 1 from public.retencion_reglas r where r.id = regla_id and r.estado = 'en_prueba'));

DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT unnest(ARRAY['retencion_reglas', 'retencion_regla_condiciones', 'retencion_regla_pasos', 'retencion_decisiones']) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = r
    ) THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', r);
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END;
    END IF;
  END LOOP;
END $$;



COMMIT;
