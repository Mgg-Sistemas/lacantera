/*
  EL DESTINATARIO INTERNO DE UNA SALIDA ES UNA PERSONA, NO UN ÁREA.

  Christopher, 03/11/2026, con el reporte de una salida delante: «Recibe:
  Wilmer Blanco», no «OPERACIONES › PLANTA». Quien pide material lo pide para
  alguien con nombre y apellido, y el papel tiene que poder decirlo.

  SOLO AL SOLICITAR (`pedir_salida`/`pedir_salidas`). La salida directa de
  escritorio sigue cargando a un área o cargo del organigrama: ahí sí puede no
  haber una sola persona a quien nombrar —toda la cuadrilla de un turno, por
  ejemplo—, y nadie pidió cambiarla.

  NO SE BORRA `grupo_id` NI LO QUE YA TIENE. Las solicitudes de antes de hoy se
  quedan con su área tal como está —es su historia, y una salida vieja tiene
  que poder seguir diciendo a dónde fue—. Desde ahora, el formulario de
  solicitar ya no ofrece el organigrama: escribe en `empleado_id`.

  PERSONAS_DE_LA_EMPRESA DEJA DE FILTRAR POR ACTIVO.

  La usan dos pantallas: `QuienResponde` (elegir a alguien de la empresa como
  responsable externo, texto libre) y ahora también el destinatario interno
  (una referencia de verdad, `empleado_id`). Un `empleado_id` de una solicitud
  vieja tiene que poder resolver su nombre aunque esa persona ya no esté
  activa —el mismo motivo por el que `grupos_de_salida()` siempre devolvió los
  nodos apagados también—. Por eso la función ahora trae a todo el mundo con
  un `activo` calculado (`activo and fecha_egreso is null`, el mismo criterio
  de `entregar_a_trabajador`), y cada pantalla filtra del lado del cliente
  cuando lo que necesita es la lista para ELEGIR, no para LEER.

  `PEDIR_SALIDA`/`PEDIR_SALIDAS` SE PARCHEAN CON `pg_get_functiondef` +
  reemplazo de anclas, como el resto de esta casa: son funciones que ya
  llevan varias migraciones encima (firma, permisos restringidos, y al menos
  una más que no dejó archivo propio —esta migración no toca nada de eso,
  solo el pedazo que le toca—), y reescribirlas a mano es como se introduce
  una diferencia con lo que de verdad corre. Si alguna ancla no aparece
  exactamente una vez, esto falla con una excepción que dice cuál — no deja
  la base a medias.
*/

-- ─────────────────────── 1 · la columna y su regla ─────────────────────────

alter table public.solicitudes_salida
  add column if not exists empleado_id bigint references public.empleados(id);

comment on column public.solicitudes_salida.empleado_id is
  'La persona de nómina que recibe, desde el 03/11/2026. Antes de esa fecha el destinatario interno era un área o cargo del organigrama: ver grupo_id.';

do $mig$
declare
  v_nombre text;
begin
  select conname into v_nombre
    from pg_constraint
   where conrelid = 'public.solicitudes_salida'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%grupo_id%destino_externo%';

  if v_nombre is not null then
    execute format('alter table public.solicitudes_salida drop constraint %I', v_nombre);
  end if;

  alter table public.solicitudes_salida
    add constraint solicitud_un_solo_destinatario
    check (
      (case when empleado_id      is not null then 1 else 0 end) +
      (case when destino_externo  is not null then 1 else 0 end) <= 1
    );
end
$mig$;

-- ───────────────── 2 · personas_de_la_empresa, para los dos usos ───────────

drop function if exists public.personas_de_la_empresa();

create function public.personas_de_la_empresa()
returns table(id bigint, nombre text, cargo text, activo boolean)
language plpgsql
stable
security definer
set search_path to ''
as $func$
begin
  perform private.exigir_permiso('SALIDAS', 'LECTURA');

  return query
  select e.id,
         btrim(e.nombres || ' ' || e.apellidos),
         e.cargo,
         e.activo and e.fecha_egreso is null
    from public.empleados e
   order by e.apellidos, e.nombres;
end;
$func$;

revoke all on function public.personas_de_la_empresa() from public, anon;
grant execute on function public.personas_de_la_empresa() to authenticated, service_role;

comment on function public.personas_de_la_empresa() is
  'La gente de la empresa, para quien trabaja en Salidas y no tiene permiso de Nómina. Trae a todos —activos e inactivos, con su `activo` calculado— porque una salida vieja tiene que poder seguir diciendo a quién fue; quien ofrece una lista para ELEGIR filtra `activo` del lado del cliente.';

-- ───────────────────── 3 · pedir_salida: el grupo es persona ───────────────

do $mig$
declare
  v_def    text := pg_get_functiondef('public.pedir_salida'::regproc);
  v_anclas text[] := array[
    $a$p_grupo_id bigint DEFAULT NULL::bigint$a$,
    $a$  if p_grupo_id is null and nullif(btrim(coalesce(p_externo, '')), '') is null then
    raise exception 'Falta decir quién lo va a recibir: un grupo de la empresa, o alguien de fuera.'
      using errcode = '22023';
  end if;
  if p_grupo_id is not null and nullif(btrim(coalesce(p_externo, '')), '') is not null then
    raise exception 'Lo recibe un grupo de la empresa o alguien de fuera, no los dos.'
      using errcode = '22023';
  end if;
  if p_grupo_id is not null
     and not exists (select 1 from public.organigrama_nodos o where o.id = p_grupo_id and o.activo) then
    raise exception 'Ese grupo no está en el organigrama, o está apagado.' using errcode = '23503';
  end if;$a$,
    $a$motivo, grupo_id, destino_externo, responsable_externo, pedida_por,$a$,
    $a$v_motivo, p_grupo_id,$a$
  ];
  v_nuevas text[] := array[
    $n$p_empleado_id bigint DEFAULT NULL::bigint$n$,
    $n$  if p_empleado_id is null and nullif(btrim(coalesce(p_externo, '')), '') is null then
    raise exception 'Falta decir quién lo va a recibir: una persona de la empresa, o alguien de fuera.'
      using errcode = '22023';
  end if;
  if p_empleado_id is not null and nullif(btrim(coalesce(p_externo, '')), '') is not null then
    raise exception 'Lo recibe una persona de la empresa o alguien de fuera, no los dos.'
      using errcode = '22023';
  end if;
  if p_empleado_id is not null
     and not exists (
       select 1 from public.empleados e
        where e.id = p_empleado_id and e.activo and e.fecha_egreso is null
     ) then
    raise exception 'Esa persona no está activa en la nómina.' using errcode = '23503';
  end if;$n$,
    $n$motivo, empleado_id, destino_externo, responsable_externo, pedida_por,$n$,
    $n$v_motivo, p_empleado_id,$n$
  ];
begin
  for i in 1 .. array_length(v_anclas, 1) loop
    if (length(v_def) - length(replace(v_def, v_anclas[i], ''))) / length(v_anclas[i]) <> 1 then
      raise exception 'pedir_salida: el ancla % no aparece exactamente una vez.', i;
    end if;
    v_def := replace(v_def, v_anclas[i], v_nuevas[i]);
  end loop;

  execute v_def;
end
$mig$;

-- ──────────────── 4 · pedir_salidas: el mismo cambio, de paso ──────────────

do $mig$
declare
  v_def    text := pg_get_functiondef('public.pedir_salidas'::regproc);
  v_anclas text[] := array[
    $a$p_grupo_id bigint DEFAULT NULL::bigint$a$,
    $a$p_motivo, p_grupo_id, p_externo, p_responsable, p_con_firma$a$
  ];
  v_nuevas text[] := array[
    $n$p_empleado_id bigint DEFAULT NULL::bigint$n$,
    $n$p_motivo, p_empleado_id, p_externo, p_responsable, p_con_firma$n$
  ];
begin
  for i in 1 .. array_length(v_anclas, 1) loop
    if (length(v_def) - length(replace(v_def, v_anclas[i], ''))) / length(v_anclas[i]) <> 1 then
      raise exception 'pedir_salidas: el ancla % no aparece exactamente una vez.', i;
    end if;
    v_def := replace(v_def, v_anclas[i], v_nuevas[i]);
  end loop;

  execute v_def;
end
$mig$;

-- ──────────────────────────────── comprobación ─────────────────────────────

do $ver$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'solicitudes_salida'
       and column_name = 'empleado_id'
  ) then
    raise exception 'solicitudes_salida no tiene empleado_id';
  end if;

  if position('p_empleado_id' in pg_get_functiondef('public.pedir_salida'::regproc)) = 0 then
    raise exception 'pedir_salida no quedó con p_empleado_id';
  end if;

  if position('p_empleado_id' in pg_get_functiondef('public.pedir_salidas'::regproc)) = 0 then
    raise exception 'pedir_salidas no quedó con p_empleado_id';
  end if;

  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'personas_de_la_empresa'
         and pg_get_function_result(p.oid) like '%activo boolean%') <> 1 then
    raise exception 'personas_de_la_empresa no devuelve activo';
  end if;
end
$ver$;
