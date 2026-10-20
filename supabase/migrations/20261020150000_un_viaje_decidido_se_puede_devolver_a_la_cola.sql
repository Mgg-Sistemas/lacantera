-- ============================================================================
-- UN VIAJE DECIDIDO SE PUEDE DEVOLVER A LA COLA
--
-- Christopher, 20/10/2026: aprobó once viajes cuando quería aprobar tres. Los
-- otros ocho llevaban días esperando y se fueron con el lote. El sistema no
-- tenía cómo deshacerlo:
--
--   · `rechazar_viajes` los marcaría RECHAZADO, que es una DECISIÓN —«estos
--     viajes no se pagan»— y no un deshacer. Además el propio papel dice que
--     un rechazado no se vuelve a aprobar.
--   · `anular_acarreo` los borraría del conteo, que es peor: el viaje ocurrió.
--
-- Hubo que arreglarlo con SQL a mano. Esta es la puerta para que la próxima
-- vez no haga falta.
--
-- DEVOLVER NO ES DECIDIR. El viaje vuelve a POR_APROBAR —otra vez en la
-- bandeja, esperando— y se le quita el sello de quién decidió. Lo que NO se
-- borra es que esto pasó: queda quién lo devolvió, cuándo y por qué, y ahí se
-- queda aunque después se apruebe. Un viaje que fue aprobado, devuelto y
-- vuelto a aprobar tiene una historia, y esa historia es justo lo que alguien
-- va a querer leer meses después, cuadrando un pago.
--
-- LA DEVUELVE QUIEN PUDO DECIDIRLA, con la misma regla de siempre
-- (`como_aprueba_viaje`): el responsable de la mina o planta, quien tiene la
-- casilla, o la gerencia. Quien no pudo aprobar un viaje tampoco puede
-- desaprobarlo.
-- ============================================================================


-- ────────────────────────── 1 · el rastro de la vuelta ─────────────────────

alter table public.acarreos
  add column if not exists devuelto_por      uuid references auth.users(id),
  add column if not exists devuelto_en       timestamptz,
  add column if not exists motivo_devolucion text;

comment on column public.acarreos.motivo_devolucion is
  'Por qué se devolvió a la cola un viaje ya decidido. No se borra al volver a decidirlo: es el historial de que pasó.';

-- Las tres mitades van juntas o no van: una devolución sin motivo no explica
-- nada, y un motivo sin fecha no dice cuándo.
alter table public.acarreos drop constraint if exists acarreo_devuelto_completo;
alter table public.acarreos add constraint acarreo_devuelto_completo
  check (num_nulls(devuelto_por, devuelto_en, motivo_devolucion) in (0, 3));


-- ─────────────────────────────── 2 · la puerta ─────────────────────────────

create or replace function public.devolver_viajes_a_por_aprobar(
  p_ids    bigint[],
  p_motivo text
) returns integer
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_a      record;
  v_como   text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_n      integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelve a entrar.' using errcode = '28000';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'No hay viajes que devolver.' using errcode = '22023';
  end if;
  if v_motivo is null or length(v_motivo) < 4 then
    raise exception 'Diga por qué vuelve a la cola: lo va a leer quien tenga que decidirlo otra vez.'
      using errcode = '22023';
  end if;

  for v_a in
    select a.id, a.estado, a.secuencia, a.equipo_codigo,
           r.nombre as ruta, r.origen_id, r.destino_id
      from public.acarreos a
      left join public.rutas_acarreo r on r.id = a.ruta_id
     where a.id = any (p_ids)
     order by a.id
       for update of a
  loop
    /*
      Solo lo YA DECIDIDO vuelve. El anulado no —se anuló, que es otra cosa— y
      el que ya espera no tiene a dónde volver; decirlo así evita que alguien
      crea que hizo algo cuando no hizo nada.
    */
    if v_a.estado not in ('APROBADO', 'RECHAZADO') then
      raise exception 'El viaje % de % no está decidido: está %. Solo vuelve a la cola lo aprobado o lo rechazado.',
        v_a.secuencia, coalesce(v_a.equipo_codigo, 'ese camión'), lower(replace(v_a.estado, '_', ' '))
        using errcode = '55000';
    end if;

    v_como := private.como_aprueba_viaje(v_a.origen_id, v_a.destino_id);
    if v_como is null then
      raise exception 'Los viajes de «%» los devuelve quien puede decidirlos: el responsable de la mina o planta de origen o de destino, o alguien con la casilla «Aprobar o rechazar viajes».', v_a.ruta
        using errcode = '42501';
    end if;

    update public.acarreos
       set estado                 = 'POR_APROBAR',
           -- El sello de la decisión se va: ya no hay decisión.
           decidido_por           = null,
           decidido_en            = null,
           decidido_como          = null,
           firma_de_quien_aprueba = null,
           motivo_rechazo         = null,
           -- El de la devolución se queda, aunque luego se decida otra vez.
           devuelto_por           = (select auth.uid()),
           devuelto_en            = now(),
           motivo_devolucion      = v_motivo
     where id = v_a.id;
    v_n := v_n + 1;
  end loop;

  if v_n <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'Alguno de esos viajes no existe.' using errcode = 'P0002';
  end if;

  return v_n;
end;
$func$;

revoke all on function public.devolver_viajes_a_por_aprobar(bigint[], text) from public, anon;
grant execute on function public.devolver_viajes_a_por_aprobar(bigint[], text) to authenticated, service_role;


-- ──────────────── 3 · la vista enseña la vuelta ─────────────────
--
-- Se reescribe ENTERA, copiada de la que corre en producción el 20/10/2026 y
-- con las tres columnas nuevas al final. `create or replace` solo admite
-- añadir al final y exige repetir el resto igual: cambiar el orden o el tipo
-- de una columna ya existente lo rechaza, que es justo la red que queremos.
--
-- El nombre de quien devolvió sale de un quinto `perfiles`, igual que los dos
-- que ya había para quien registra y quien decide.

create or replace view public.v_acarreos
with (security_invoker = on) as
 SELECT a.id,
    a.fecha,
    a.vehiculo_id,
    COALESCE(v.placa, a.equipo_codigo) AS placa,
    COALESCE(v.descripcion, a.equipo_nombre) AS vehiculo,
    COALESCE(v.tipo, 'MAQUINA'::text) AS tipo,
    v.capacidad_m3,
    v.carga_util_m3,
    a.tramo,
    COALESCE(r.nombre,
        CASE a.tramo
            WHEN 'MINA_PLANTA'::text THEN 'Mina a planta fija'::text
            WHEN 'PLANTA_LAVADO'::text THEN 'Planta fija a lavado'::text
            WHEN 'MINA_BASE'::text THEN 'Mina a base'::text
            ELSE NULL::text
        END) AS tramo_dice,
    a.secuencia,
    a.hora,
    a.transportista,
    a.chofer,
    a.carga_m3,
        CASE
            WHEN ( SELECT private.puede_accion('EXPLOTACION.VER_PAGO_VIAJES'::text) AS puede_accion) THEN a.precio_usd
            ELSE NULL::numeric
        END::numeric(12,2) AS precio_usd,
    a.frente_id,
    f.nombre AS frente,
    a.estado,
    a.motivo_anulacion,
    a.nota,
    a.registrado_en,
    p.nombre AS registrado_por_nombre,
    r.id AS ruta_id,
    r.origen_id,
    r.destino_id,
    a.maquina_id,
    a.carga,
    a.decidido_en,
    pd.nombre AS decidido_por_nombre,
    a.decidido_como,
    a.motivo_rechazo,
    a.ruta_id IS NULL AS anterior_a_la_aprobacion,
        CASE
            WHEN ( SELECT private.puede_accion('EXPLOTACION.VER_PAGO_VIAJES'::text) AS puede_accion) THEN a.precio_antes_de_ajuste
            ELSE NULL::numeric
        END::numeric(12,2) AS precio_antes_de_ajuste,
    a.motivo_ajuste,
    a.registrado_por,
    a.decidido_por,
    a.firma_de_quien_registra,
    a.firma_de_quien_aprueba,
    a.devuelto_en,
    pv.nombre AS devuelto_por_nombre,
    a.motivo_devolucion
   FROM acarreos a
     LEFT JOIN vehiculos v ON v.id = a.vehiculo_id
     LEFT JOIN rutas_acarreo r ON r.id = a.ruta_id OR a.ruta_id IS NULL AND r.tramo_anterior = a.tramo
     LEFT JOIN frentes_explotacion f ON f.id = a.frente_id
     LEFT JOIN perfiles p ON p.id = a.registrado_por
     LEFT JOIN perfiles pd ON pd.id = a.decidido_por
     LEFT JOIN perfiles pv ON pv.id = a.devuelto_por;

grant select on public.v_acarreos to authenticated;


-- ─────────────────────────────── comprobación ──────────────────────────────
-- Debe devolver: columnas = 3, puerta = true, reja = true.

select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'acarreos'
      and column_name in ('devuelto_por', 'devuelto_en', 'motivo_devolucion'))  as columnas,
  (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'devolver_viajes_a_por_aprobar')  as puerta,
  (select count(*) = 1 from pg_constraint
    where conrelid = 'public.acarreos'::regclass
      and conname = 'acarreo_devuelto_completo')                                as reja,
  (select count(*) = 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'v_acarreos'
      and column_name = 'motivo_devolucion')                                    as la_vista;
