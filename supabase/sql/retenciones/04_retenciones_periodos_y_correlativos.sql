-- ============================================================
-- ESTADO: PENDIENTE DE APLICAR
-- MODULO: Retenciones Fiscales (Minería Internacional TS, C.A.)
-- ARCHIVO: 04_retenciones_periodos_y_correlativos.sql
--
-- DESCRIPCIÓN:
-- Crea la estructura de Períodos Fiscales (V3R: quincenas IVA y meses ISLR/Municipal),
-- el control estricto de correlativos y numeración continua sin huecos (V2R y R14 por empresa),
-- y las funciones RPC para asignación atómica de comprobantes practicados.
--
-- CONSULTA DE VERIFICACIÓN / RESULTADO ESPERADO:
-- Ejecutar tras aplicar este script:
--   1) SELECT count(*) >= 24 AS periodos_ok FROM public.retencion_periodos;
--      -> true (períodos quincenales y mensuales generados)
--   2) SELECT count(*) >= 2 AS series_numeracion_ok FROM public.retencion_numeros;
--      -> true (control de correlativos iniciado)
--   3) SELECT proname FROM pg_proc WHERE proname = 'retencion_siguiente_numero_impuesto';
--      -> 'retencion_siguiente_numero_impuesto' (función atómica lista)
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


-- V3R · 8 de 13 · gt_retencion_periodos · migración gt_retencion_periodos, versión 20261020100008

-- ── Guarda: solo sigue si la base está justo antes de V3R (si no, se detiene sin escribir nada) ──


CREATE TABLE IF NOT EXISTS public.retencion_periodos (
  id                uuid primary key default gen_random_uuid(),
  tipo              text not null references public.retencion_impuestos (clave) on delete restrict,
  periodo           text not null check (periodo ~ '^[0-9]{4}(0[1-9]|1[0-2])$'),
  tramo             smallint not null check (tramo in (0, 1, 2)),
  periodicidad      text not null check (periodicidad in ('quincenal', 'mensual', 'anual')),   -- la que tenía al generarse
  desde             date not null,
  hasta             date not null,
  vence             date,
  declara           text not null default 'gt' check (declara in ('gt', 'otro_sistema')),
  motivo_cambio     text,
  declarado_en      timestamptz,
  declarado_por     text,
  reabierto_en      timestamptz,
  reabierto_por     text,
  reabierto_motivo  text,
  created_at        timestamptz not null default now(),
  unique (tipo, periodo, tramo),
  check (hasta >= desde)
);
CREATE INDEX IF NOT EXISTS retencion_periodos_rango_idx on public.retencion_periodos (tipo, desde, hasta);
CREATE INDEX IF NOT EXISTS retencion_periodos_declarado_idx on public.retencion_periodos (tipo, periodo) where declarado_en is not null;
comment on table public.retencion_periodos is 'Retenciones: períodos de declaración por impuesto (quincena, mes o año), generados con la periodicidad vigente';

-- La clave del candado de un período.
create function public.retencion_periodo_llave(p_id uuid)
returns bigint language sql immutable set search_path = public as $$
  select hashtextextended('retencion_periodo:' || p_id::text, 0);
$$;

-- El período de una retención: el suyo si lo trae (AAAAMM + quincena), si no el que contiene la fecha.
create function public.retencion_periodo_de(p_tipo text, p_periodo text, p_quincena smallint, p_fecha date)
returns public.retencion_periodos language plpgsql stable security definer set search_path = public as $$
declare p public.retencion_periodos; t text := upper(p_tipo);
begin
  if nullif(p_periodo, '') is not null then
    select * into p from public.retencion_periodos x
     where x.tipo = t and x.periodo = p_periodo
       and (x.tramo = 0
            or x.tramo = coalesce(p_quincena,
                                  case when to_char(p_fecha, 'YYYYMM') = p_periodo and extract(day from p_fecha) > 15 then 2 else 1 end))
     order by x.tramo limit 1;
    return p;   -- vacío si ese período no se ha generado
  end if;
  select * into p from public.retencion_periodos x
   where x.tipo = t and coalesce(p_fecha, current_date) between x.desde and x.hasta
   order by x.desde desc limit 1;
  return p;
end $$;

-- Corre una fecha si cae en sábado o domingo, según la regla de la versión.
create function public.retencion_fecha_habil(p_fecha date, p_regla text)
returns date language sql immutable set search_path = public as $$
  select case
    when p_fecha is null or p_regla = 'igual' or extract(isodow from p_fecha) < 6 then p_fecha
    when p_regla = 'anterior_habil' then p_fecha - (extract(isodow from p_fecha)::int - 5)
    else p_fecha + (8 - extract(isodow from p_fecha)::int) end;
$$;

create function public.retencion_periodos_generar(p_anio int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.retencion_impuestos; v public.retencion_impuesto_versiones;
  m int; q int; d1 date; d2 date; n int := 0; k int; venc date;
begin
  if not (public.is_admin() or public.puede('retenciones')) then
    raise exception using errcode = '42501', message = 'RET_SIN_PERMISO: hace falta el permiso de Retenciones.';
  end if;
  if p_anio not between 2020 and 2100 then
    raise exception using errcode = 'P0001', message = 'RET_ANIO_INVALIDO: ' || p_anio;
  end if;
  for i in select * from public.retencion_impuestos where activo and admite_practicada order by orden, clave loop
    <<meses>>
    for m in 1..12 loop
      -- La periodicidad del mes es la de la versión vigente el día 1 (o la primera, si la fecha es anterior).
      v := public.retencion_impuesto_version(i.clave, make_date(p_anio, m, 1));
      continue when v.id is null;   -- un impuesto sin versión no genera períodos
      for q in (case when v.periodicidad = 'quincenal' then 1 else 0 end)..(case when v.periodicidad = 'quincenal' then 2 else 0 end) loop
        d1 := make_date(p_anio, m, case when q = 2 then 16 else 1 end);
        d2 := case when v.periodicidad = 'anual' then make_date(p_anio, 12, 31)
                   when q = 1 then make_date(p_anio, m, 15)
                   else (date_trunc('month', d1) + interval '1 month - 1 day')::date end;
        venc := case when v.vence_dia is null then null
                     else public.retencion_fecha_habil(
                            least(date_trunc('month', d2 + 1)::date + (v.vence_dia - 1),
                                  (date_trunc('month', d2 + 1) + interval '1 month - 1 day')::date),
                            v.vence_si_inhabil) end;
        insert into public.retencion_periodos (tipo, periodo, tramo, periodicidad, desde, hasta, vence, declara, motivo_cambio)
        values (i.clave, to_char(d1, 'YYYYMM'), q, v.periodicidad, d1, d2, venc,
                case when v.convive then 'otro_sistema' else 'gt' end,
                'Generado para ' || p_anio)
        on conflict (tipo, periodo, tramo) do nothing;
        get diagnostics k = row_count;
        n := n + k;
      end loop;
      exit meses when v.periodicidad = 'anual';   -- el período anual ya cubre el resto del año
    end loop;
  end loop;
  return n;
end $$;

create function public.retencion_periodo_declarar(p_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.retencion_periodos; n int; quien text := coalesce(auth.jwt() ->> 'email', current_user);
begin
  if not (public.is_admin() or public.puede('retenciones')) then
    raise exception using errcode = '42501', message = 'RET_SIN_PERMISO: hace falta el permiso de Retenciones.';
  end if;
  select * into p from public.retencion_periodos where id = p_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'RET_PERIODO_NO_EXISTE'; end if;
  if p.declarado_en is not null then
    raise exception using errcode = 'P0001', message = 'RET_PERIODO_YA_DECLARADO: el período ya está declarado.';
  end if;
  perform pg_advisory_xact_lock(public.retencion_periodo_llave(p.id));
  perform set_config('retenciones.periodo_por_funcion', 'si', true);
  update public.retencion_periodos set declarado_en = now(), declarado_por = quien where id = p_id;
  perform set_config('retenciones.periodo_por_funcion', '', true);
  update public.retenciones r
     set estado = 'declarada', declarada_at = now(), declarada_por = quien, updated_at = now()
   where r.rol = 'practicada' and r.estado = 'registrada' and upper(r.tipo) = p.tipo
     and (public.retencion_periodo_de(r.tipo, r.comprobante_periodo, r.quincena, coalesce(r.factura_fecha, r.fecha))).id = p.id;
  get diagnostics n = row_count;
  return n;
end $$;

create function public.retencion_periodo_reabrir(p_id uuid, p_motivo text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.retencion_periodos; n int; quien text := coalesce(auth.jwt() ->> 'email', current_user);
begin
  if not (public.is_admin() or public.puede('retenciones')) then
    raise exception using errcode = '42501', message = 'RET_SIN_PERMISO: hace falta el permiso de Retenciones.';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception using errcode = 'P0001', message = 'RET_MOTIVO_OBLIGATORIO: indique por qué se reabre el período.';
  end if;
  select * into p from public.retencion_periodos where id = p_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'RET_PERIODO_NO_EXISTE'; end if;
  if p.declarado_en is null then
    raise exception using errcode = 'P0001', message = 'RET_PERIODO_NO_DECLARADO: el período no está declarado.';
  end if;
  perform pg_advisory_xact_lock(public.retencion_periodo_llave(p.id));
  perform set_config('retenciones.periodo_por_funcion', 'si', true);
  update public.retencion_periodos
     set declarado_en = null, declarado_por = null, reabierto_en = now(), reabierto_por = quien,
         reabierto_motivo = btrim(p_motivo), motivo_cambio = btrim(p_motivo)
   where id = p_id;
  perform set_config('retenciones.periodo_por_funcion', '', true);
  update public.retenciones r
     set estado = 'registrada', declarada_at = null, declarada_por = null, updated_at = now()
   where r.rol = 'practicada' and r.estado = 'declarada' and upper(r.tipo) = p.tipo
     and (public.retencion_periodo_de(r.tipo, r.comprobante_periodo, r.quincena, coalesce(r.factura_fecha, r.fecha))).id = p.id;
  get diagnostics n = row_count;
  return n;
end $$;

-- Por la API, solo vencimiento y quién declara (con motivo); lo demás, solo las funciones. Y el historial (R2).
create function public.retencion_periodos_guarda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare quien text := coalesce(auth.jwt() ->> 'email', current_user);
begin
  if tg_op = 'UPDATE' then
    -- Solo declarar y reabrir ponen esta marca (local a su transacción); set_config no está expuesto como RPC.
    if coalesce(current_setting('retenciones.periodo_por_funcion', true), '') <> 'si' then
      if (new.tipo, new.periodo, new.tramo, new.periodicidad, new.desde, new.hasta, new.declarado_en, new.declarado_por,
          new.reabierto_en, new.reabierto_por, new.reabierto_motivo)
         is distinct from
         (old.tipo, old.periodo, old.tramo, old.periodicidad, old.desde, old.hasta, old.declarado_en, old.declarado_por,
          old.reabierto_en, old.reabierto_por, old.reabierto_motivo) then
        raise exception using errcode = '42501', message = 'RET_PERIODO_SOLO_POR_FUNCION: declarar y reabrir se hacen con sus funciones.';
      end if;
    end if;
    if new.declara is distinct from old.declara then
      if old.declarado_en is not null then
        raise exception using errcode = 'P0001', message = 'RET_PERIODO_DECLARA_DECLARADO: un período declarado no cambia de declarante.';
      end if;
      if coalesce(btrim(new.motivo_cambio), '') = '' then
        raise exception using errcode = 'P0001', message = 'RET_MOTIVO_OBLIGATORIO: indique por qué cambia quién declara el período.';
      end if;
    end if;
  end if;
  insert into public.retencion_historial (tabla, clave, antes, despues, motivo, actor)
  values ('retencion_periodos', new.tipo || ':' || new.periodo || ':' || new.tramo,
          case when tg_op = 'UPDATE' then to_jsonb(old) - 'motivo_cambio' end,
          to_jsonb(new) - 'motivo_cambio', new.motivo_cambio, quien);
  new.motivo_cambio := null;
  return new;
end $$;
DROP TRIGGER IF EXISTS trg_retencion_periodos_guarda ON public.retencion_periodos;
create trigger trg_retencion_periodos_guarda before insert or update on public.retencion_periodos
  for each row execute function public.retencion_periodos_guarda();

-- Candado en retenciones: nada practicado entra, se mueve ni se desanula en un período declarado.
create function public.retenciones_periodo_candado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.retencion_periodos; mira boolean;
begin
  if new.rol <> 'practicada' or new.estado = 'anulada' then return new; end if;
  mira := tg_op = 'INSERT'
          or upper(new.tipo) <> upper(old.tipo) or new.rol <> old.rol
          or new.comprobante_periodo is distinct from old.comprobante_periodo
          or new.fecha is distinct from old.fecha
          or new.factura_fecha is distinct from old.factura_fecha
          or new.quincena is distinct from old.quincena
          or old.estado = 'anulada';
  if not mira then return new; end if;
  p := public.retencion_periodo_de(new.tipo, new.comprobante_periodo, new.quincena, coalesce(new.factura_fecha, new.fecha, current_date));
  if p.id is null then return new; end if;   -- período no generado todavía: nada que proteger
  perform pg_advisory_xact_lock_shared(public.retencion_periodo_llave(p.id));
  if exists (select 1 from public.retencion_periodos x where x.id = p.id and x.declarado_en is not null) then
    raise exception using errcode = 'P0001',
      message = 'RET_PERIODO_DECLARADO: el período ' || p.periodo || case when p.tramo > 0 then ' (quincena ' || p.tramo || ')' else '' end
             || ' de ' || upper(new.tipo) || ' ya está declarado. Reábralo antes.';
  end if;
  return new;
end $$;
DROP TRIGGER IF EXISTS trg_retenciones_periodo_candado ON public.retenciones;
create trigger trg_retenciones_periodo_candado before insert or update on public.retenciones
  for each row execute function public.retenciones_periodo_candado();

revoke execute on function public.retencion_periodos_guarda(), public.retenciones_periodo_candado() from public, anon, authenticated;
revoke execute on function public.retencion_periodos_generar(int), public.retencion_periodo_declarar(uuid),
  public.retencion_periodo_reabrir(uuid, text), public.retencion_periodo_de(text, text, smallint, date),
  public.retencion_fecha_habil(date, text), public.retencion_periodo_llave(uuid) from public, anon;
grant execute on function public.retencion_periodos_generar(int), public.retencion_periodo_declarar(uuid),
  public.retencion_periodo_reabrir(uuid, text), public.retencion_periodo_de(text, text, smallint, date),
  public.retencion_fecha_habil(date, text) to authenticated, service_role;

alter table public.retencion_periodos enable row level security;
revoke all on public.retencion_periodos from anon;
revoke insert, delete, truncate, references, trigger on public.retencion_periodos from authenticated;
DROP POLICY IF EXISTS retencion_periodos_read ON public.retencion_periodos;
create policy retencion_periodos_read on public.retencion_periodos for select to authenticated using (true);
DROP POLICY IF EXISTS retencion_periodos_update ON public.retencion_periodos;
create policy retencion_periodos_update on public.retencion_periodos for update to authenticated
  using ((select public.is_admin()) or (select public.puede('retenciones')))
  with check ((select public.is_admin()) or (select public.puede('retenciones')));
DO $$
DECLARE r text;
BEGIN
  FOR r IN SELECT unnest(ARRAY['retencion_periodos']) LOOP
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


-- V2R · 10 de 13 · gt_retenciones_numeracion_continua · migración gt_retenciones_numeracion_continua, versión 20261020100010

-- ── Guarda: solo sigue si la base está justo antes de V2R (si no, se detiene sin escribir nada) ──


-- De dónde salió el número de una practicada: 'sistema' (lo puso la base) o 'dado' (editado, del otro
-- sistema o del código de hoy, que lo pide antes). Nulo en las que no llevan número. Hoy 0 filas.
alter table public.retenciones ADD COLUMN IF NOT EXISTS numero_origen text check (numero_origen is null or numero_origen in ('sistema', 'dado'));
-- ISAE: «Operación N°», correlativo por año, editable y distinto del número del comprobante (maqueta v8).
alter table public.retenciones ADD COLUMN IF NOT EXISTS operacion_numero integer check (operacion_numero is null or operacion_numero >= 1);

CREATE TABLE IF NOT EXISTS public.retencion_numeros (
  tipo           text not null,
  numero         text not null,
  secuencial     bigint,
  retencion_id   uuid,            -- sin FK: la fila puede desaparecer y el número tiene que quedar
  estado         text not null default 'en_uso' check (estado in ('en_uso', 'retirado')),
  motivo_retiro  text check (motivo_retiro in ('cambiado', 'borrado')),
  registrado_en  timestamptz not null default now(),
  registrado_por text,
  retirado_en    timestamptz,
  retirado_por   text,
  primary key (tipo, numero)
);
CREATE INDEX IF NOT EXISTS retencion_numeros_secuencial_idx on public.retencion_numeros (tipo, secuencial desc);
CREATE INDEX IF NOT EXISTS retencion_numeros_retencion_idx on public.retencion_numeros (retencion_id);
comment on table public.retencion_numeros is 'Retenciones: cada número dado en cada serie; un número no se vuelve a dar nunca';

alter table public.retencion_numeros enable row level security;
revoke all on public.retencion_numeros from anon;
revoke insert, update, delete, truncate, references, trigger on public.retencion_numeros from authenticated;
DROP POLICY IF EXISTS retencion_numeros_read ON public.retencion_numeros;
create policy retencion_numeros_read on public.retencion_numeros for select to authenticated using (true);

create function public.retencion_secuencial(p_numero text)
returns bigint
language sql
immutable
set search_path = public
as $$
  -- 14 dígitos = AAAAMM + 8 (el secuencial son los 8 últimos); 10 dígitos = el secuencial entero.
  select case when p_numero ~ '^[0-9]{14}$' then substr(p_numero, 7)::bigint
              when p_numero ~ '^[0-9]{10}$' then p_numero::bigint end;
$$;

-- El siguiente secuencial de una serie (interno: lo usan el trigger y la vista previa).
create function public.retencion_serie_siguiente(p_tipo text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
           coalesce((select max(r.secuencial) from public.retencion_numeros r where r.tipo = upper(p_tipo)), 0),
           coalesce((select max(public.retencion_secuencial(x.comprobante_nro)) from public.retenciones x
                      where upper(x.tipo) = upper(p_tipo) and x.rol = 'practicada'), 0),
           coalesce((select s.serie_inicial - 1 from public.retencion_impuestos s where s.clave = upper(p_tipo)), 0)
         ) + 1;
$$;
revoke execute on function public.retencion_serie_siguiente(text) from public, anon, authenticated;

-- Arma el número con el formato de la serie (R2: AAAAMM8 = 14 dígitos; N10 = 10 dígitos).
create function public.retencion_armar_numero(p_formato text, p_periodo text, p_secuencial bigint)
returns text
language sql
immutable
set search_path = public
as $$
  select case when p_formato = 'AAAAMM8' then p_periodo || lpad(p_secuencial::text, 8, '0')
              else lpad(p_secuencial::text, 10, '0') end;
$$;

-- Vista previa del número que tocaría. No reserva nada: si otro registra antes, sale el siguiente.
create function public.siguiente_comprobante_retencion(p_tipo text, p_periodo text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.retencion_impuestos;
  n bigint;
begin
  select * into s from public.retencion_impuestos where clave = upper(p_tipo);
  if not found or not s.numera then
    raise exception using errcode = 'P0001', message = 'RET_SERIE_NO_NUMERA: ' || upper(coalesce(p_tipo, '')) || ' no lleva comprobante propio.';
  end if;
  if s.serie_formato = 'AAAAMM8' and coalesce(p_periodo, '') !~ '^[0-9]{4}(0[1-9]|1[0-2])$' then
    raise exception using errcode = 'P0001', message = 'RET_PERIODO_INVALIDO: el período debe ser AAAAMM (recibido: ' || coalesce(p_periodo, 'nulo') || ').';
  end if;
  if s.serie_modo = 'manual' then
    return null;   -- el número lo da el otro sistema
  end if;
  n := public.retencion_serie_siguiente(p_tipo);
  return public.retencion_armar_numero(s.serie_formato, p_periodo, n);
end $$;
revoke execute on function public.siguiente_comprobante_retencion(text, text) from public, anon;
grant execute on function public.siguiente_comprobante_retencion(text, text) to authenticated, service_role;

-- BEFORE: asigna o valida el número de una practicada y, si el impuesto numera operaciones (el ISAE), la Operación N° del año.
create function public.retenciones_numeros_guarda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t text := upper(new.tipo);
  s public.retencion_impuestos;
  hay_impuesto boolean;
  hay_serie boolean;
  n bigint;
  per text;
  sec_old bigint;
  cambia boolean;
  anio int;
begin
  if new.rol <> 'practicada' then return new; end if;
  cambia := tg_op = 'INSERT'
            or new.comprobante_nro is distinct from old.comprobante_nro
            or upper(new.tipo) <> upper(old.tipo)
            or new.rol <> old.rol;
  -- Un UPDATE que no toca el número (estado, declarar, anular, adjuntar…) no pide ningún candado:
  -- así declarar (candado del período → filas) nunca espera a la serie (consultoría v8, punto 9).
  if not cambia then return new; end if;

  select * into s from public.retencion_impuestos where clave = t;
  hay_impuesto := found;
  hay_serie := hay_impuesto and s.numera;

  if hay_serie then
    -- Una serie a la vez. Orden fijo de candados: SERIE → AÑO del ISAE → (V3) PERÍODO.
    perform pg_advisory_xact_lock(hashtextextended('retencion_serie:' || t, 0));

    -- Cambiar el número de una que ya lo tenía.
    if tg_op = 'UPDATE' and old.rol = 'practicada' and old.comprobante_nro is not null then
      if new.comprobante_nro is null then
        raise exception using errcode = 'P0001', message = 'RET_NUMERO_NO_SE_QUITA: una retención practicada no se queda sin número.';
      end if;
      if old.estado in ('declarada', 'anulada') then
        raise exception using errcode = 'P0001', message = 'RET_NUMERO_NO_EDITABLE: una retención declarada o anulada conserva su número.';
      end if;
      sec_old := public.retencion_secuencial(old.comprobante_nro);
      if exists (select 1 from public.retencion_numeros r
                  where r.tipo = upper(old.tipo) and r.retencion_id is distinct from old.id
                    and ((sec_old is not null and r.secuencial > sec_old)
                         or (sec_old is null and r.registrado_en > old.created_at))) then
        raise exception using errcode = 'P0001', message = 'RET_NUMERO_NO_ES_EL_ULTIMO: solo se cambia el número de la última de su serie. Anúlela y regístrela de nuevo.';
      end if;
    end if;

    if new.comprobante_nro is null then
      -- En «manual» (el número lo da el otro sistema) no se deja una practicada sin número en silencio.
      if tg_op = 'INSERT' and s.serie_modo = 'manual' then
        raise exception using errcode = 'P0001',
          message = 'RET_NUMERO_FALTA: la serie de ' || t || ' la numera el otro sistema: escriba el número de su comprobante.';
      end if;
      if tg_op = 'INSERT' and s.serie_modo = 'automatica' then
        per := coalesce(nullif(new.comprobante_periodo, ''), to_char(coalesce(new.factura_fecha, new.fecha, current_date), 'YYYYMM'));
        if per !~ '^[0-9]{4}(0[1-9]|1[0-2])$' then
          raise exception using errcode = 'P0001', message = 'RET_PERIODO_INVALIDO: el período debe ser AAAAMM (recibido: ' || per || ').';
        end if;
        n := public.retencion_serie_siguiente(t);
        if (s.serie_formato = 'AAAAMM8' and n > 99999999) or (s.serie_formato = 'N10' and n > 9999999999) then
          raise exception using errcode = 'P0001', message = 'RET_SERIE_LLENA: la serie de ' || t || ' llegó a su último número.';
        end if;
        new.comprobante_nro := public.retencion_armar_numero(s.serie_formato, per, n);
        new.numero := case when n <= 2147483647 then n::integer end;
        new.comprobante_periodo := per;
        new.numero_origen := 'sistema';
      end if;
    else
      -- Con número dado: con el formato de la serie y sin haberse dado antes.
      if (s.serie_formato = 'AAAAMM8' and new.comprobante_nro !~ '^[0-9]{14}$')
         or (s.serie_formato = 'N10' and new.comprobante_nro !~ '^[0-9]{10}$') then
        raise exception using errcode = 'P0001',
          message = 'RET_NUMERO_FORMATO: el comprobante de ' || t || ' lleva '
                 || case when s.serie_formato = 'AAAAMM8' then '14 dígitos (AAAAMM y 8 de la serie).' else '10 dígitos.' end;
      end if;
      if exists (select 1 from public.retencion_numeros r
                  where r.tipo = t and r.numero = new.comprobante_nro and r.retencion_id is distinct from new.id) then
        raise exception using errcode = 'P0001', message = 'RET_NUMERO_USADO: el número ' || new.comprobante_nro || ' ya se dio en la serie de ' || t || ' (no se vuelve a dar, aunque se haya anulado o cambiado).';
      end if;
      n := public.retencion_secuencial(new.comprobante_nro);
      new.numero := case when n <= 2147483647 then n::integer end;
      -- Un número que no puso la base (editado, del otro sistema o del código de hoy) queda marcado.
      new.numero_origen := 'dado';
    end if;
  end if;

  -- Operación N° (el ISAE, y cualquier impuesto con numera_operacion): correlativo del AÑO de la retención
  -- y del impuesto, distinto del número del comprobante. Lo decide el impuesto (R2), no su nombre.
  -- Si llega dado (editado), se respeta: un repetido solo se avisa en pantalla (maqueta v8), no se bloquea.
  if tg_op = 'INSERT' and hay_impuesto and s.numera_operacion and new.operacion_numero is null then
    anio := extract(year from coalesce(new.fecha, current_date))::int;
    perform pg_advisory_xact_lock(hashtextextended('retencion_operacion:' || t || ':' || anio, 0));
    select coalesce(max(x.operacion_numero), 0) + 1 into new.operacion_numero
      from public.retenciones x
     where upper(x.tipo) = t and x.rol = 'practicada' and extract(year from x.fecha) = anio;
  end if;
  return new;
end $$;
revoke execute on function public.retenciones_numeros_guarda() from public, anon, authenticated;

-- AFTER: anota en el registro el número nuevo y retira el viejo.
create function public.retenciones_numeros_anotar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  quien text := coalesce(auth.jwt() ->> 'email', current_user);
begin
  if tg_op in ('UPDATE', 'DELETE') and old.rol = 'practicada' and old.comprobante_nro is not null
     and (tg_op = 'DELETE' or new.comprobante_nro is distinct from old.comprobante_nro
          or upper(new.tipo) <> upper(old.tipo) or new.rol <> old.rol) then
    update public.retencion_numeros
       set estado = 'retirado',
           motivo_retiro = case when tg_op = 'DELETE' then 'borrado' else 'cambiado' end,
           retirado_en = now(), retirado_por = quien
     where tipo = upper(old.tipo) and numero = old.comprobante_nro and retencion_id = old.id and estado = 'en_uso';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.rol = 'practicada' and new.comprobante_nro is not null
     and exists (select 1 from public.retencion_impuestos s where s.clave = upper(new.tipo) and s.numera)
     and (tg_op = 'INSERT' or new.comprobante_nro is distinct from old.comprobante_nro
          or upper(new.tipo) <> upper(old.tipo) or new.rol <> old.rol) then
    insert into public.retencion_numeros (tipo, numero, secuencial, retencion_id, registrado_por)
    values (upper(new.tipo), new.comprobante_nro, public.retencion_secuencial(new.comprobante_nro), new.id, quien);
  end if;
  return null;
end $$;
revoke execute on function public.retenciones_numeros_anotar() from public, anon, authenticated;

-- Orden de los BEFORE (alfabético): trg_retencion_agente_valido (régimen) va antes que este.
DROP TRIGGER IF EXISTS trg_retenciones_numeros_guarda ON public.retenciones;
create trigger trg_retenciones_numeros_guarda
  before insert or update on public.retenciones
  for each row execute function public.retenciones_numeros_guarda();
DROP TRIGGER IF EXISTS trg_retenciones_numeros_anotar ON public.retenciones;
create trigger trg_retenciones_numeros_anotar
  after insert or update or delete on public.retenciones
  for each row execute function public.retenciones_numeros_anotar();

-- Una serie que ya dio números no cambia de formato (los números viejos y los nuevos no serían de la misma
-- serie). El primer número (serie_inicial) sí se puede subir: el siguiente es el mayor entre lo dado e inicial.
create function public.retencion_impuestos_serie_guarda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.serie_formato is distinct from old.serie_formato
     and exists (select 1 from public.retencion_numeros r where r.tipo = new.clave) then
    raise exception using errcode = 'P0001',
      message = 'RET_SERIE_EN_USO: la serie de ' || new.clave || ' ya dio números: no cambia de formato.';
  end if;
  return new;
end $$;
revoke execute on function public.retencion_impuestos_serie_guarda() from public, anon, authenticated;
DROP TRIGGER IF EXISTS trg_retencion_impuestos_serie_guarda ON public.retencion_impuestos;
create trigger trg_retencion_impuestos_serie_guarda
  before update on public.retencion_impuestos
  for each row execute function public.retencion_impuestos_serie_guarda();

-- Lo que ya hubiera (hoy 0 filas): al registro.
insert into public.retencion_numeros (tipo, numero, secuencial, retencion_id, registrado_en, registrado_por)
select upper(x.tipo), x.comprobante_nro, public.retencion_secuencial(x.comprobante_nro), x.id, x.created_at, 'paquete V2'
  from public.retenciones x
 where x.rol = 'practicada' and x.comprobante_nro is not null
   and upper(x.tipo) in (select clave from public.retencion_impuestos where numera)
on conflict (tipo, numero) do nothing;


-- R14 · 18 · migración gt_retencion_numeros_por_empresa, versión 20261101100018 (después de R13)

-- ── Guarda: solo sigue si R13 está, R14 no, y retencion_numeros aún no tiene empresa_id (si no, se detiene) ──


-- 1) Asegurar existencia de retencion_empresas_receptoras antes de la FK
CREATE TABLE IF NOT EXISTS public.retencion_empresas_receptoras (
  id                         text primary key,
  clave                      text not null unique,
  nombre                     text not null,
  nombre_corto               text,
  rif                        text not null,
  color_badge                text not null default '#d97706',
  activo                     boolean not null default true,
  orden                      int not null default 10,
  email                      text,
  telefono                   text,
  direccion_fiscal           text,
  municipio                  text,
  estado                     text,
  licencia_municipal         text,
  es_agente_iva              boolean not null default false,
  es_contribuyente_especial  boolean not null default false,
  retiene_islr               boolean not null default true,
  retiene_municipal          boolean not null default true,
  pct_iva_general            numeric(5,2) not null default 75,
  imprimir_original_y_copia  boolean not null default false,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  actualizado_por            text
);

ALTER TABLE public.retencion_empresas_receptoras ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.retencion_empresas_receptoras TO postgres, service_role, authenticated;
GRANT SELECT ON public.retencion_empresas_receptoras TO anon;

INSERT INTO public.retencion_empresas_receptoras (
  id, clave, nombre, nombre_corto, rif, color_badge, direccion_fiscal, municipio, estado, email, telefono
) VALUES (
  'empresa-mits', 'MITS', 'MINERIA INTERNACIONAL TS, C.A.', 'MITS', 'J-50209170-0', '#d97706',
  'Sector La Cantera, Estado Bolívar', 'Piar', 'Bolívar', 'contacto@mineriainternacionalts.com', '+58 424-9349731'
)
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  rif = EXCLUDED.rif;

-- 2) El registro de números gana la empresa. Lo que hay se completa con la empresa de su retención (o MITS),
--    y la clave primaria pasa a incluir la empresa: el mismo número puede repetirse entre empresas.
ALTER TABLE public.retencion_numeros ADD COLUMN IF NOT EXISTS empresa_id text;

UPDATE public.retencion_numeros n SET empresa_id = coalesce(
  (SELECT r.empresa_id FROM public.retenciones r WHERE r.id = n.retencion_id),
  'empresa-mits');

ALTER TABLE public.retencion_numeros
  ALTER COLUMN empresa_id SET DEFAULT 'empresa-mits',
  ALTER COLUMN empresa_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'retencion_numeros_empresa_fk') THEN
    ALTER TABLE public.retencion_numeros ADD CONSTRAINT retencion_numeros_empresa_fk
      FOREIGN KEY (empresa_id) REFERENCES public.retencion_empresas_receptoras (id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE public.retencion_numeros DROP CONSTRAINT IF EXISTS retencion_numeros_pkey;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'retencion_numeros_pkey') THEN
    ALTER TABLE public.retencion_numeros ADD CONSTRAINT retencion_numeros_pkey PRIMARY KEY (empresa_id, tipo, numero);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS retencion_numeros_empresa_serie_idx ON public.retencion_numeros (empresa_id, tipo, secuencial);

-- 2) El próximo número de la serie, por empresa (misma cuenta de antes, pero mirando solo esa empresa).
create or replace function public.retencion_serie_siguiente(p_empresa text, p_tipo text)
  returns bigint language sql stable security definer set search_path to 'public'
as $fn$
  select greatest(
           coalesce((select max(r.secuencial) from public.retencion_numeros r
                      where r.empresa_id = p_empresa and r.tipo = upper(p_tipo)), 0),
           coalesce((select max(public.retencion_secuencial(x.comprobante_nro)) from public.retenciones x
                      where x.empresa_id = p_empresa and upper(x.tipo) = upper(p_tipo) and x.rol = 'practicada'), 0),
           coalesce((select s.serie_inicial - 1 from public.retencion_impuestos s where s.clave = upper(p_tipo)), 0)
         ) + 1;
$fn$;

-- 3) El trigger que arma/valida el número de la retención, ahora por empresa (candado, chequeos y operación N°).
create or replace function public.retenciones_numeros_guarda() returns trigger
  language plpgsql security definer set search_path to 'public'
as $fn$
declare
  t text := upper(new.tipo);
  e text := new.empresa_id;
  s public.retencion_impuestos;
  hay_impuesto boolean;
  hay_serie boolean;
  n bigint;
  per text;
  sec_old bigint;
  cambia boolean;
  anio int;
begin
  if new.rol <> 'practicada' then return new; end if;
  cambia := tg_op = 'INSERT'
            or new.comprobante_nro is distinct from old.comprobante_nro
            or upper(new.tipo) <> upper(old.tipo)
            or new.rol <> old.rol;
  -- Un UPDATE que no toca el número (estado, declarar, anular, adjuntar…) no pide ningún candado.
  if not cambia then return new; end if;

  select * into s from public.retencion_impuestos where clave = t;
  hay_impuesto := found;
  hay_serie := hay_impuesto and s.numera;

  if hay_serie then
    -- Una serie POR EMPRESA a la vez. Orden fijo de candados: SERIE(empresa) → OPERACIÓN(empresa) del ISAE.
    perform pg_advisory_xact_lock(hashtextextended('retencion_serie:' || e || ':' || t, 0));

    -- Cambiar el número de una que ya lo tenía (dentro de la serie de SU empresa).
    if tg_op = 'UPDATE' and old.rol = 'practicada' and old.comprobante_nro is not null then
      if new.comprobante_nro is null then
        raise exception using errcode = 'P0001', message = 'RET_NUMERO_NO_SE_QUITA: una retención practicada no se queda sin número.';
      end if;
      if old.estado in ('declarada', 'anulada') then
        raise exception using errcode = 'P0001', message = 'RET_NUMERO_NO_EDITABLE: una retención declarada o anulada conserva su número.';
      end if;
      sec_old := public.retencion_secuencial(old.comprobante_nro);
      if exists (select 1 from public.retencion_numeros r
                  where r.empresa_id = e and r.tipo = upper(old.tipo) and r.retencion_id is distinct from old.id
                    and ((sec_old is not null and r.secuencial > sec_old)
                         or (sec_old is null and r.registrado_en > old.created_at))) then
        raise exception using errcode = 'P0001', message = 'RET_NUMERO_NO_ES_EL_ULTIMO: solo se cambia el número de la última de su serie. Anúlela y regístrela de nuevo.';
      end if;
    end if;

    if new.comprobante_nro is null then
      -- En «manual» (el número lo da el otro sistema) no se deja una practicada sin número en silencio.
      if tg_op = 'INSERT' and s.serie_modo = 'manual' then
        raise exception using errcode = 'P0001',
          message = 'RET_NUMERO_FALTA: la serie de ' || t || ' la numera el otro sistema: escriba el número de su comprobante.';
      end if;
      if tg_op = 'INSERT' and s.serie_modo = 'automatica' then
        per := coalesce(nullif(new.comprobante_periodo, ''), to_char(coalesce(new.factura_fecha, new.fecha, current_date), 'YYYYMM'));
        if per !~ '^[0-9]{4}(0[1-9]|1[0-2])$' then
          raise exception using errcode = 'P0001', message = 'RET_PERIODO_INVALIDO: el período debe ser AAAAMM (recibido: ' || per || ').';
        end if;
        n := public.retencion_serie_siguiente(e, t);
        if (s.serie_formato = 'AAAAMM8' and n > 99999999) or (s.serie_formato = 'N10' and n > 9999999999) then
          raise exception using errcode = 'P0001', message = 'RET_SERIE_LLENA: la serie de ' || t || ' llegó a su último número.';
        end if;
        new.comprobante_nro := public.retencion_armar_numero(s.serie_formato, per, n);
        new.numero := case when n <= 2147483647 then n::integer end;
        new.comprobante_periodo := per;
        new.numero_origen := 'sistema';
      end if;
    else
      -- Con número dado: con el formato de la serie y sin haberse dado antes EN ESA EMPRESA.
      if (s.serie_formato = 'AAAAMM8' and new.comprobante_nro !~ '^[0-9]{14}$')
         or (s.serie_formato = 'N10' and new.comprobante_nro !~ '^[0-9]{10}$') then
        raise exception using errcode = 'P0001',
          message = 'RET_NUMERO_FORMATO: el comprobante de ' || t || ' lleva '
                 || case when s.serie_formato = 'AAAAMM8' then '14 dígitos (AAAAMM y 8 de la serie).' else '10 dígitos.' end;
      end if;
      if exists (select 1 from public.retencion_numeros r
                  where r.empresa_id = e and r.tipo = t and r.numero = new.comprobante_nro and r.retencion_id is distinct from new.id) then
        raise exception using errcode = 'P0001', message = 'RET_NUMERO_USADO: el número ' || new.comprobante_nro || ' ya se dio en la serie de ' || t || ' (no se vuelve a dar, aunque se haya anulado o cambiado).';
      end if;
      n := public.retencion_secuencial(new.comprobante_nro);
      new.numero := case when n <= 2147483647 then n::integer end;
      new.numero_origen := 'dado';
    end if;
  end if;

  -- Operación N° (el ISAE): correlativo del AÑO y del impuesto, POR EMPRESA, distinto del número del comprobante.
  if tg_op = 'INSERT' and hay_impuesto and s.numera_operacion and new.operacion_numero is null then
    anio := extract(year from coalesce(new.fecha, current_date))::int;
    perform pg_advisory_xact_lock(hashtextextended('retencion_operacion:' || e || ':' || t || ':' || anio, 0));
    select coalesce(max(x.operacion_numero), 0) + 1 into new.operacion_numero
      from public.retenciones x
     where x.empresa_id = e and upper(x.tipo) = t and x.rol = 'practicada' and extract(year from x.fecha) = anio;
  end if;
  return new;
end $fn$;

-- 4) El trigger que anota/retira el número en el registro, ahora con la empresa (la PK la incluye).
create or replace function public.retenciones_numeros_anotar() returns trigger
  language plpgsql security definer set search_path to 'public'
as $fn$
declare
  quien text := coalesce(auth.jwt() ->> 'email', current_user);
begin
  if tg_op in ('UPDATE', 'DELETE') and old.rol = 'practicada' and old.comprobante_nro is not null
     and (tg_op = 'DELETE' or new.comprobante_nro is distinct from old.comprobante_nro
          or upper(new.tipo) <> upper(old.tipo) or new.rol <> old.rol) then
    update public.retencion_numeros
       set estado = 'retirado',
           motivo_retiro = case when tg_op = 'DELETE' then 'borrado' else 'cambiado' end,
           retirado_en = now(), retirado_por = quien
     where empresa_id = old.empresa_id and tipo = upper(old.tipo) and numero = old.comprobante_nro
       and retencion_id = old.id and estado = 'en_uso';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.rol = 'practicada' and new.comprobante_nro is not null
     and exists (select 1 from public.retencion_impuestos s where s.clave = upper(new.tipo) and s.numera)
     and (tg_op = 'INSERT' or new.comprobante_nro is distinct from old.comprobante_nro
          or upper(new.tipo) <> upper(old.tipo) or new.rol <> old.rol) then
    insert into public.retencion_numeros (empresa_id, tipo, numero, secuencial, retencion_id, registrado_por)
    values (new.empresa_id, upper(new.tipo), new.comprobante_nro, public.retencion_secuencial(new.comprobante_nro), new.id, quien);
  end if;
  return null;
end $fn$;

-- 5) La vista previa del próximo comprobante, también por empresa (reemplaza la versión global, que el front no usa).
drop function if exists public.siguiente_comprobante_retencion(text, text);
create or replace function public.siguiente_comprobante_retencion(p_empresa text, p_tipo text, p_periodo text)
  returns text language plpgsql stable security definer set search_path to 'public'
as $fn$
declare
  s public.retencion_impuestos;
  n bigint;
begin
  select * into s from public.retencion_impuestos where clave = upper(p_tipo);
  if not found or not s.numera then
    raise exception using errcode = 'P0001', message = 'RET_SERIE_NO_NUMERA: ' || upper(coalesce(p_tipo, '')) || ' no lleva comprobante propio.';
  end if;
  if s.serie_formato = 'AAAAMM8' and coalesce(p_periodo, '') !~ '^[0-9]{4}(0[1-9]|1[0-2])$' then
    raise exception using errcode = 'P0001', message = 'RET_PERIODO_INVALIDO: el período debe ser AAAAMM (recibido: ' || coalesce(p_periodo, 'nulo') || ').';
  end if;
  if s.serie_modo = 'manual' then
    return null;   -- el número lo da el otro sistema
  end if;
  n := public.retencion_serie_siguiente(p_empresa, upper(p_tipo));
  return public.retencion_armar_numero(s.serie_formato, p_periodo, n);
end $fn$;

-- 6) Ya nadie usa la versión global del próximo número (la de 1 argumento): se retira.
drop function if exists public.retencion_serie_siguiente(text);




-- Revocar EXECUTE a los roles de API (postgres y service_role se conservan intactos).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'siguiente_numero_retencion'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.siguiente_numero_retencion(text, text) FROM anon, authenticated';
  END IF;
END $$;



COMMIT;
