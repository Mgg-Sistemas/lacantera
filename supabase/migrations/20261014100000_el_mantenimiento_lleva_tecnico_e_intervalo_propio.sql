-- ============================================================================
-- El mantenimiento lleva técnico y su propio intervalo de horas
--
-- Christopher, 14/10/2026: investigado el módulo de Maquinaria, ya existía el
-- ciclo completo de taller (entrada/salida, tres tipos, repuestos, semáforo
-- por horómetro configurable por máquina). Faltaban dos cosas puntuales:
--
--   1. QUIÉN HIZO EL TRABAJO, de verdad — no quien lo anota en el sistema
--      (`cerrado_por`, que es el usuario logueado), sino el mecánico o el
--      taller externo. Solo tiene sentido sobre máquina: el taller de
--      inventario (rectificar/fabricar material) no lo necesita y no se le
--      exige.
--
--   2. EL INTERVALO DEL PRÓXIMO MANTENIMIENTO, variable por evento. Hasta
--      ahora el «tope» era fijo por máquina (`maquinaria.tope_horas`, editable
--      en la ficha pero igual para todos los mantenimientos de esa máquina).
--      Un cambio de aceite especial puede durar menos que el estándar de la
--      máquina; esto deja decidirlo mantenimiento a mantenimiento, sin tocar
--      la configuración de la máquina. Si no se indica, se usa el tope de la
--      máquina —mismo comportamiento de siempre—.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Las columnas nuevas en la orden de taller.
-- ---------------------------------------------------------------------------
alter table public.mantenimientos
  add column if not exists tecnico text,
  add column if not exists intervalo_horas numeric(10,2) check (intervalo_horas is null or intervalo_horas > 0);

comment on column public.mantenimientos.tecnico is
  'Quién hizo el trabajo de verdad: el mecánico o el taller externo, no quien lo anota en el sistema.';
comment on column public.mantenimientos.intervalo_horas is
  'Solo en MANTENIMIENTO cerrado sobre una máquina: cada cuántas horas toca el próximo, para este ciclo. Si es nulo, se usa el tope configurado en la máquina.';

-- ---------------------------------------------------------------------------
-- 2. cerrar_mantenimiento aprende los dos parámetros.
--
-- El intervalo solo se resuelve y se guarda cuando la orden es de una máquina
-- y es tipo MANTENIMIENTO —en cualquier otro caso (servicio, reparación, o
-- taller de material) no reinicia ningún contador, así que un intervalo ahí
-- no significaría nada—.
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_def    text := pg_get_functiondef('public.cerrar_mantenimiento(bigint,text,numeric,jsonb,text,date,numeric,bigint)'::regprocedure);
  v_anclas text[] := array[
    $a$p_destino_id bigint DEFAULT NULL::bigint)
 RETURNS bigint$a$,
    $a$if v_salida > v_hoy then
    raise exception 'No se puede cerrar una orden de taller con fecha futura.' using errcode = '22023';
  end if;$a$,
    $a$update public.mantenimientos
     set estado = 'CERRADO', detalle = btrim(p_detalle), fecha_salida = v_salida,
         costo_usd = p_costo_usd, costo_repuestos_usd = v_total,
         cantidad_devuelta = v_devuelto,
         cerrado_por = (select auth.uid()), cerrado_en = now()
   where id = p_id;$a$
  ];
  v_nuevas text[] := array[
    $n$p_destino_id bigint DEFAULT NULL::bigint,
 p_tecnico text DEFAULT NULL::text, p_intervalo_horas numeric DEFAULT NULL::numeric)
 RETURNS bigint$n$,
    $n$if v_salida > v_hoy then
    raise exception 'No se puede cerrar una orden de taller con fecha futura.' using errcode = '22023';
  end if;

  if p_intervalo_horas is not null and p_intervalo_horas <= 0 then
    raise exception 'El intervalo del próximo mantenimiento tiene que ser mayor que cero.'
      using errcode = '22023';
  end if;$n$,
    $n$update public.mantenimientos
     set estado = 'CERRADO', detalle = btrim(p_detalle), fecha_salida = v_salida,
         costo_usd = p_costo_usd, costo_repuestos_usd = v_total,
         cantidad_devuelta = v_devuelto,
         tecnico = nullif(btrim(coalesce(p_tecnico, '')), ''),
         intervalo_horas = case
           when v_orden.maquina_id is not null and v_orden.tipo = 'MANTENIMIENTO'
             then coalesce(p_intervalo_horas, v_maq.tope_horas)
           else null
         end,
         cerrado_por = (select auth.uid()), cerrado_en = now()
   where id = p_id;$n$
  ];
begin
  for i in 1 .. array_length(v_anclas, 1) loop
    if (length(v_def) - length(replace(v_def, v_anclas[i], ''))) / length(v_anclas[i]) <> 1 then
      raise exception 'cerrar_mantenimiento: el ancla % no aparece exactamente una vez', i;
    end if;
    v_def := replace(v_def, v_anclas[i], v_nuevas[i]);
  end loop;

  execute 'drop function public.cerrar_mantenimiento(bigint,text,numeric,jsonb,text,date,numeric,bigint)';
  execute v_def;
end
$mig$;

revoke all on function public.cerrar_mantenimiento(
  bigint, text, numeric, jsonb, text, date, numeric, bigint, text, numeric
) from public, anon;
grant execute on function public.cerrar_mantenimiento(
  bigint, text, numeric, jsonb, text, date, numeric, bigint, text, numeric
) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. v_maquinaria: el tope, el aviso y la alarma pasan a ser los de ESTE
--    ciclo —el intervalo del último mantenimiento cerrado, si se fijó uno, o
--    el tope de la máquina si no—. El aviso y la alarma se escalan en la
--    misma proporción que ya tiene configurada la máquina, para no inventar
--    un segundo par de umbrales.
-- ---------------------------------------------------------------------------
-- `create or replace view` solo admite AÑADIR columnas al final de la lista:
-- insertar una en medio («column order» incluido) lo rechaza como si fuera un
-- rename. Por eso `tope_horas_efectivo` se añade al final, aparte, y las dos
-- columnas que ya existían (`horas_para_el_tope`, `semaforo`) solo cambian su
-- fórmula en el mismo lugar que ya tenían.
do $mig$
declare
  v_def   text := pg_get_viewdef('public.v_maquinaria'::regclass, true);
  v_anclas text[] := array[
    $a$ ultimo_mant AS (
         SELECT DISTINCT ON (mantenimientos.maquina_id) mantenimientos.maquina_id,
            COALESCE(mantenimientos.fecha_salida, mantenimientos.fecha) AS fecha,
            mantenimientos.horometro
           FROM mantenimientos$a$,
    $a$    GREATEST(m.tope_horas - hs.horas_desde_mant, 0::numeric) AS horas_para_el_tope,$a$,
    $a$        CASE
            WHEN hs.horas_desde_mant >= m.tope_horas THEN 'BLOQUEANTE'::text
            WHEN hs.horas_desde_mant >= m.alarma_horas THEN 'ALARMA'::text
            WHEN hs.horas_desde_mant >= m.aviso_horas THEN 'AVISO'::text
            ELSE 'OK'::text
        END AS semaforo,$a$,
    $a$    op.ficha AS operador_ficha,
    m.clase
   FROM maquinaria m$a$
  ];
  v_nuevas text[] := array[
    $n$ ultimo_mant AS (
         SELECT DISTINCT ON (mantenimientos.maquina_id) mantenimientos.maquina_id,
            COALESCE(mantenimientos.fecha_salida, mantenimientos.fecha) AS fecha,
            mantenimientos.horometro,
            mantenimientos.intervalo_horas
           FROM mantenimientos$n$,
    $n$    GREATEST(COALESCE(um.intervalo_horas, m.tope_horas) - hs.horas_desde_mant, 0::numeric) AS horas_para_el_tope,$n$,
    $n$        CASE
            WHEN hs.horas_desde_mant >= COALESCE(um.intervalo_horas, m.tope_horas) THEN 'BLOQUEANTE'::text
            WHEN hs.horas_desde_mant >= COALESCE(um.intervalo_horas, m.tope_horas) * (m.alarma_horas / NULLIF(m.tope_horas, 0::numeric)) THEN 'ALARMA'::text
            WHEN hs.horas_desde_mant >= COALESCE(um.intervalo_horas, m.tope_horas) * (m.aviso_horas / NULLIF(m.tope_horas, 0::numeric)) THEN 'AVISO'::text
            ELSE 'OK'::text
        END AS semaforo,$n$,
    $n$    op.ficha AS operador_ficha,
    m.clase,
    COALESCE(um.intervalo_horas, m.tope_horas) AS tope_horas_efectivo
   FROM maquinaria m$n$
  ];
begin
  for i in 1 .. array_length(v_anclas, 1) loop
    if (length(v_def) - length(replace(v_def, v_anclas[i], ''))) / length(v_anclas[i]) <> 1 then
      raise exception 'v_maquinaria: el ancla % no aparece exactamente una vez', i;
    end if;
    v_def := replace(v_def, v_anclas[i], v_nuevas[i]);
  end loop;
  execute 'create or replace view public.v_maquinaria with (security_invoker = on) as ' || v_def;
end
$mig$;

-- ---------------------------------------------------------------------------
-- 4. v_mantenimientos (Historial de taller) enseña el técnico y el intervalo.
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_def   text := pg_get_viewdef('public.v_mantenimientos'::regclass, true);
  v_ancla text := $a$mt.motivo_anulacion,
    mt.registrado_en
   FROM mantenimientos mt$a$;
  v_nueva text := $n$mt.motivo_anulacion,
    mt.registrado_en,
    mt.tecnico,
    mt.intervalo_horas
   FROM mantenimientos mt$n$;
begin
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'v_mantenimientos: el ancla no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, v_nueva);
  execute 'create or replace view public.v_mantenimientos with (security_invoker = on) as ' || v_def;
end
$mig$;

-- ---------------------------------------------------------------------------
-- 5. Comprobación
-- ---------------------------------------------------------------------------
do $comprueba$
begin
  if not exists (
    select 1 from pg_proc where proname = 'cerrar_mantenimiento' and pronamespace = 'public'::regnamespace
      and pg_get_functiondef(oid) like '%p_intervalo_horas%'
  ) then
    raise exception 'cerrar_mantenimiento no quedó con el intervalo.';
  end if;
  if position('tope_horas_efectivo' in pg_get_viewdef('public.v_maquinaria'::regclass, true)) = 0 then
    raise exception 'v_maquinaria no calcula tope_horas_efectivo.';
  end if;
  if position('mt.intervalo_horas' in pg_get_viewdef('public.v_mantenimientos'::regclass, true)) = 0 then
    raise exception 'v_mantenimientos no enseña el intervalo.';
  end if;
  if (select array_to_string(reloptions, ',') from pg_class where oid = 'public.v_maquinaria'::regclass)
     is distinct from 'security_invoker=on' then
    raise exception 'v_maquinaria perdió security_invoker.';
  end if;
  if (select array_to_string(reloptions, ',') from pg_class where oid = 'public.v_mantenimientos'::regclass)
     is distinct from 'security_invoker=on' then
    raise exception 'v_mantenimientos perdió security_invoker.';
  end if;
end
$comprueba$;
