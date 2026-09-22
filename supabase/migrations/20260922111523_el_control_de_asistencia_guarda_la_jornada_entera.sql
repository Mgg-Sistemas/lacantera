-- ═══════════════════════════════════════════════════════════════════════════
-- CONTROL DE ASISTENCIA: LA JORNADA ENTERA EN UNA FILA
--
-- Christopher, 22/09/2026: un módulo «para escanear los carnet o poder cargar
-- manualmente las horas de inicio o de salida de alguien», con calendario,
-- donde «el que tenga los permisos pueda modificar las horas», que al escanear
-- «se tome automáticamente la hora del sistema», y que «si pasa el día porque
-- no marcaron la salida no se traiga el registro al día siguiente como si
-- fuera la salida».
--
-- Trae de referencia el módulo del otro sistema, que guarda MARCAS sueltas
-- —entrada, salida, entrada…— y las empareja después. Ahí se vio lo que eso
-- cuesta: el turno de noche que cruza la medianoche se rompe porque «hoy» es la
-- fecha del calendario; el 77 % de los días queda con entrada y sin salida; una
-- marca errada no se puede corregir; la carga manual se salta toda la lógica; y
-- dos lectores a la vez meten dos entradas.
--
-- AQUÍ LA UNIDAD ES LA JORNADA, NO LA MARCA. Una fila por persona y turno, con
-- su entrada y su salida en la misma fila. Emparejar deja de ser un problema
-- porque nunca hubo nada que emparejar; corregir es cambiar dos horas de una
-- fila; y «se le olvidó marcar la salida» es una fila con la salida en blanco,
-- que se ve, se completa a mano o se queda así, y NUNCA se cierra con la
-- entrada del día siguiente.
--
-- LA JORNADA TIENE UNA DURACIÓN MÁXIMA (16 horas de fábrica, se ajusta). Al
-- escanear, se busca la jornada abierta de esa persona cuya entrada esté dentro
-- de ese plazo: si la hay, se cierra con la hora de ahora; si no —no hay
-- ninguna, o la que hay ya se pasó del plazo—, se abre una nueva. El que entró
-- a las 19:00 y sale a las 07:00 cierra bien, porque han pasado 12 horas; el
-- que entró el lunes a las 07:00 y vuelve a escanear el martes a las 07:00 abre
-- otra, porque han pasado 24, y la del lunes queda abierta para que alguien la
-- mire. Eso es exactamente lo que pidió Christopher.
--
-- LA HORA LA PONE LA BASE. `now()` del servidor, no el reloj del teléfono que
-- escanea. La carga manual sí trae sus horas, y por eso se marca como MANUAL y
-- queda con quién la cargó.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. El módulo, con su permiso propio
--
-- LECTURA ve el calendario. ESCRITURA marca con el carnet, carga a mano y
-- corrige horas. TOTAL además anula jornadas y cambia los ajustes.
-- ───────────────────────────────────────────────────────────────────────────
insert into public.modulos (codigo, nombre, descripcion, orden) values
  ('ASISTENCIA', 'Control de asistencia',
   'Quién entró y quién salió, y a qué hora: con el carnet, o cargado a mano por quien tenga permiso.',
   65)
on conflict (codigo) do update
  set nombre = excluded.nombre, descripcion = excluded.descripcion, orden = excluded.orden;

insert into public.rol_permisos (rol, modulo, nivel)
select r.codigo, 'ASISTENCIA', case when r.codigo = 'ADMIN' then 'TOTAL' else 'NINGUNO' end
from public.roles r
on conflict (rol, modulo) do nothing;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Los ajustes: cuánto puede durar una jornada, y qué es un doble escaneo
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.asistencia_config (
  unica                  boolean primary key default true check (unica),
  horas_maximas_jornada  smallint not null default 16 check (horas_maximas_jornada between 4 and 24),
  minutos_doble_marca    smallint not null default 2 check (minutos_doble_marca between 0 and 30)
);
insert into public.asistencia_config (unica) values (true) on conflict do nothing;

alter table public.asistencia_config enable row level security;
drop policy if exists asistencia_config_lectura on public.asistencia_config;
create policy asistencia_config_lectura on public.asistencia_config
  for select to authenticated using (private.tiene_permiso('ASISTENCIA', 'LECTURA'));
revoke all on public.asistencia_config from anon, authenticated;
grant select on public.asistencia_config to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Las jornadas
--
-- No hay «una sola abierta por persona» a la fuerza: la del lunes que nadie
-- cerró tiene que poder convivir con la del martes recién abierta, que es
-- justo lo que se pidió. Lo que sí se impide es abrir DOS dentro del plazo.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.asistencia_jornadas (
  id              bigint generated always as identity primary key,
  empleado_id     bigint not null references public.empleados(id),
  -- El día al que pertenece: el de la ENTRADA, en hora de Caracas. La salida de
  -- madrugada sigue siendo del día en que se entró.
  fecha           date not null,
  entrada         timestamptz not null,
  salida          timestamptz,
  origen          text not null check (origen in ('CARNET', 'MANUAL')),
  carnet_codigo   text,
  nota            text,
  registrado_por  uuid references auth.users(id),
  registrado_en   timestamptz not null default now(),
  corregido_por   uuid references auth.users(id),
  corregido_en    timestamptz,
  anulada_en      timestamptz,
  anulada_por     uuid references auth.users(id),
  motivo_anulacion text,
  constraint asistencia_sale_despues_de_entrar check (salida is null or salida > entrada),
  constraint asistencia_jornada_cabe_en_un_dia  check (salida is null or salida - entrada <= interval '24 hours')
);

comment on table public.asistencia_jornadas is
  'Una fila por persona y turno: la entrada y la salida juntas. Salida en blanco = jornada abierta. Se anula, no se borra.';

create index if not exists asistencia_por_fecha on public.asistencia_jornadas (fecha, empleado_id);
create index if not exists asistencia_por_empleado on public.asistencia_jornadas (empleado_id, entrada desc);

alter table public.asistencia_jornadas enable row level security;
drop policy if exists asistencia_jornadas_lectura on public.asistencia_jornadas;
create policy asistencia_jornadas_lectura on public.asistencia_jornadas
  for select to authenticated using (private.tiene_permiso('ASISTENCIA', 'LECTURA'));
revoke all on public.asistencia_jornadas from anon, authenticated;
grant select on public.asistencia_jornadas to authenticated;

drop trigger if exists trg_auditar on public.asistencia_jornadas;
create trigger trg_auditar after insert or update or delete on public.asistencia_jornadas
  for each row execute function private.auditar('id');
drop trigger if exists trg_normalizar on public.asistencia_jornadas;
create trigger trg_normalizar before insert or update on public.asistencia_jornadas
  for each row execute function private.normalizar_texto('nota', 'motivo_anulacion');

do $mapa$
begin
  if to_regclass('public.auditoria_modulos') is null then
    return;
  end if;
  insert into public.auditoria_modulos (tabla, modulo) values
    ('asistencia_jornadas', 'ASISTENCIA'),
    ('asistencia_config', 'ASISTENCIA')
  on conflict (tabla) do update set modulo = excluded.modulo;
end
$mapa$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. La vista: cada jornada con su gente, sus horas y su estado
-- ───────────────────────────────────────────────────────────────────────────
create or replace view public.v_asistencia
with (security_invoker = on) as
select j.id, j.empleado_id, j.fecha, j.entrada, j.salida, j.origen, j.carnet_codigo, j.nota,
       e.ficha, e.nombres || ' ' || e.apellidos as nombre, e.cedula, e.cargo, e.departamento, e.foto_path,
       case when j.anulada_en is not null then 'ANULADA'
            when j.salida is null then 'ABIERTA'
            else 'CERRADA' end as estado,
       case when extract(hour from j.entrada at time zone 'America/Caracas') between 6 and 17
            then 'DIA' else 'NOCHE' end as turno,
       case when j.salida is null or j.anulada_en is not null then null
            else round(extract(epoch from (j.salida - j.entrada)) / 60)::integer end as minutos,
       j.registrado_por, j.registrado_en, j.corregido_por, j.corregido_en,
       j.anulada_en, j.anulada_por, j.motivo_anulacion
  from public.asistencia_jornadas j
  join public.empleados e on e.id = j.empleado_id;

revoke all on public.v_asistencia from public, anon;
grant select on public.v_asistencia to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Marcar: con el carnet o con la persona elegida. La hora la pone la base.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.marcar_asistencia(p_codigo text default null, p_empleado_id bigint default null)
returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare
  v_codigo   text;
  v_carnet   record;
  v_emp      record;
  v_cfg      record;
  v_abierta  record;
  v_ahora    timestamptz := now();
  v_id       bigint;
  v_accion   text;
  v_vieja    boolean := false;
begin
  perform private.exigir_permiso('ASISTENCIA', 'ESCRITURA');
  select * into v_cfg from public.asistencia_config where unica;

  if p_codigo is not null then
    -- Lo que lee el escáner es la dirección impresa en el QR, o el código a
    -- secas: se quedan solo las letras y los números del final.
    v_codigo := upper(regexp_replace(regexp_replace(coalesce(p_codigo, ''), '^.*/', ''), '[^A-Za-z0-9]', '', 'g'));
    select * into v_carnet from public.carnets where codigo = v_codigo;
    if v_carnet.id is null then
      raise exception 'Ese carnet no existe.' using errcode = 'P0002';
    end if;
    if v_carnet.estado <> 'VIGENTE' then
      raise exception 'Ese carnet está anulado: no sirve para marcar.' using errcode = '55000';
    end if;
    p_empleado_id := v_carnet.empleado_id;
  end if;

  if p_empleado_id is null then
    raise exception 'Falta el carnet o la persona.' using errcode = '22023';
  end if;

  -- Una persona a la vez: dos lectores escaneando a la misma en el mismo
  -- segundo entran en fila, y el segundo ve lo que hizo el primero.
  perform pg_advisory_xact_lock(hashtext('asistencia'), p_empleado_id::integer);

  select id, nombres, apellidos, ficha, activo, fecha_egreso into v_emp from public.empleados where id = p_empleado_id;
  if v_emp.id is null then
    raise exception 'Esa persona no está en el personal.' using errcode = 'P0002';
  end if;
  if not v_emp.activo or v_emp.fecha_egreso is not null then
    raise exception '% ya no está activo en el personal: no se le marca asistencia.', v_emp.nombres || ' ' || v_emp.apellidos
      using errcode = '55000';
  end if;

  -- La abierta más reciente, si la hay.
  select * into v_abierta
    from public.asistencia_jornadas
   where empleado_id = p_empleado_id and salida is null and anulada_en is null
   order by entrada desc limit 1;

  if v_abierta.id is not null
     and v_ahora - v_abierta.entrada <= make_interval(hours => v_cfg.horas_maximas_jornada) then
    -- Hay una jornada abierta y todavía está dentro del plazo: esto es la salida.
    if v_ahora - v_abierta.entrada < make_interval(mins => v_cfg.minutos_doble_marca) then
      raise exception 'Doble escaneo: % marcó entrada hace un momento.', v_emp.nombres || ' ' || v_emp.apellidos
        using errcode = '55000';
    end if;
    update public.asistencia_jornadas set salida = v_ahora where id = v_abierta.id;
    v_id := v_abierta.id;
    v_accion := 'SALIDA';
  else
    -- No hay abierta, o la que hay se pasó del plazo y se queda abierta para
    -- que alguien la revise: esto es una entrada nueva.
    v_vieja := v_abierta.id is not null;
    if exists (select 1 from public.asistencia_jornadas
                where empleado_id = p_empleado_id and anulada_en is null
                  and v_ahora - coalesce(salida, entrada) < make_interval(mins => v_cfg.minutos_doble_marca)) then
      raise exception 'Doble escaneo: % marcó hace un momento.', v_emp.nombres || ' ' || v_emp.apellidos
        using errcode = '55000';
    end if;
    insert into public.asistencia_jornadas (empleado_id, fecha, entrada, origen, carnet_codigo, registrado_por)
    values (p_empleado_id, (v_ahora at time zone 'America/Caracas')::date, v_ahora,
            case when v_codigo is null then 'MANUAL' else 'CARNET' end, v_codigo, (select auth.uid()))
    returning id into v_id;
    v_accion := 'ENTRADA';
  end if;

  return jsonb_build_object(
    'accion', v_accion, 'jornada_id', v_id, 'momento', v_ahora,
    'empleado_id', v_emp.id, 'nombre', v_emp.nombres || ' ' || v_emp.apellidos, 'ficha', v_emp.ficha,
    'quedo_abierta_otra', v_vieja,
    'abierta_desde', case when v_vieja then v_abierta.entrada end);
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Cargar a mano, corregir y anular: solo quien tiene el permiso
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.cargar_asistencia(
  p_empleado_id bigint, p_entrada timestamptz, p_salida timestamptz default null, p_nota text default null)
returns bigint
language plpgsql security definer set search_path to ''
as $$
declare v_id bigint; v_emp record; v_cfg record;
begin
  perform private.exigir_permiso('ASISTENCIA', 'ESCRITURA');
  select * into v_cfg from public.asistencia_config where unica;
  select id, activo, fecha_egreso into v_emp from public.empleados where id = p_empleado_id;
  if v_emp.id is null then
    raise exception 'Esa persona no está en el personal.' using errcode = 'P0002';
  end if;
  if p_entrada is null then
    raise exception 'Falta la hora de entrada.' using errcode = '22023';
  end if;
  if p_entrada > now() + interval '5 minutes' then
    raise exception 'La entrada está en el futuro.' using errcode = '22023';
  end if;
  if p_salida is not null and p_salida <= p_entrada then
    raise exception 'La salida tiene que ser después de la entrada.' using errcode = '22023';
  end if;
  if p_salida is not null and p_salida - p_entrada > interval '24 hours' then
    raise exception 'Una jornada no puede durar más de 24 horas. Si fueron dos días, cárgalos como dos.' using errcode = '22023';
  end if;
  if p_salida is null and exists (select 1 from public.asistencia_jornadas
        where empleado_id = p_empleado_id and salida is null and anulada_en is null
          and now() - entrada <= make_interval(hours => v_cfg.horas_maximas_jornada)) then
    raise exception 'Esa persona ya tiene una jornada abierta: ciérrala o corrígela antes de abrir otra.' using errcode = '55000';
  end if;
  if exists (select 1 from public.asistencia_jornadas
              where empleado_id = p_empleado_id and anulada_en is null
                and tstzrange(entrada, coalesce(salida, entrada + interval '1 minute'), '[)')
                    && tstzrange(p_entrada, coalesce(p_salida, p_entrada + interval '1 minute'), '[)')) then
    raise exception 'Esa persona ya tiene una jornada que se cruza con esas horas.' using errcode = '55000';
  end if;

  insert into public.asistencia_jornadas (empleado_id, fecha, entrada, salida, origen, nota, registrado_por)
  values (p_empleado_id, (p_entrada at time zone 'America/Caracas')::date, p_entrada, p_salida, 'MANUAL',
          nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.corregir_asistencia(
  p_id bigint, p_entrada timestamptz, p_salida timestamptz default null, p_nota text default null)
returns void
language plpgsql security definer set search_path to ''
as $$
declare v_j record; v_cfg record;
begin
  perform private.exigir_permiso('ASISTENCIA', 'ESCRITURA');
  select * into v_cfg from public.asistencia_config where unica;
  select * into v_j from public.asistencia_jornadas where id = p_id for update;
  if v_j.id is null then
    raise exception 'No existe esa jornada.' using errcode = 'P0002';
  end if;
  if v_j.anulada_en is not null then
    raise exception 'Esa jornada está anulada: no se corrige.' using errcode = '55000';
  end if;
  if p_entrada is null then
    raise exception 'Falta la hora de entrada.' using errcode = '22023';
  end if;
  if p_salida is not null and p_salida <= p_entrada then
    raise exception 'La salida tiene que ser después de la entrada.' using errcode = '22023';
  end if;
  if p_salida is not null and p_salida - p_entrada > interval '24 hours' then
    raise exception 'Una jornada no puede durar más de 24 horas.' using errcode = '22023';
  end if;
  if p_salida is null and exists (select 1 from public.asistencia_jornadas
        where empleado_id = v_j.empleado_id and salida is null and anulada_en is null and id <> p_id
          and now() - entrada <= make_interval(hours => v_cfg.horas_maximas_jornada)) then
    raise exception 'Esa persona ya tiene otra jornada abierta.' using errcode = '55000';
  end if;
  if exists (select 1 from public.asistencia_jornadas
              where empleado_id = v_j.empleado_id and anulada_en is null and id <> p_id
                and tstzrange(entrada, coalesce(salida, entrada + interval '1 minute'), '[)')
                    && tstzrange(p_entrada, coalesce(p_salida, p_entrada + interval '1 minute'), '[)')) then
    raise exception 'Se cruza con otra jornada de la misma persona.' using errcode = '55000';
  end if;

  update public.asistencia_jornadas
     set entrada = p_entrada, salida = p_salida,
         fecha = (p_entrada at time zone 'America/Caracas')::date,
         nota = nullif(btrim(coalesce(p_nota, '')), ''),
         corregido_por = (select auth.uid()), corregido_en = now()
   where id = p_id;
end;
$$;

create or replace function public.anular_asistencia(p_id bigint, p_motivo text)
returns void
language plpgsql security definer set search_path to ''
as $$
begin
  perform private.exigir_permiso('ASISTENCIA', 'TOTAL');
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Di por qué se anula.' using errcode = '22023';
  end if;
  update public.asistencia_jornadas
     set anulada_en = now(), anulada_por = (select auth.uid()), motivo_anulacion = btrim(p_motivo)
   where id = p_id and anulada_en is null;
  if not found then
    raise exception 'No existe esa jornada, o ya estaba anulada.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.guardar_ajustes_de_asistencia(p_horas_maximas smallint, p_minutos_doble smallint)
returns void
language plpgsql security definer set search_path to ''
as $$
begin
  perform private.exigir_permiso('ASISTENCIA', 'TOTAL');
  update public.asistencia_config
     set horas_maximas_jornada = coalesce(p_horas_maximas, horas_maximas_jornada),
         minutos_doble_marca = coalesce(p_minutos_doble, minutos_doble_marca)
   where unica;
end;
$$;

revoke execute on function public.marcar_asistencia(text, bigint) from public, anon;
revoke execute on function public.cargar_asistencia(bigint, timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.corregir_asistencia(bigint, timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.anular_asistencia(bigint, text) from public, anon;
revoke execute on function public.guardar_ajustes_de_asistencia(smallint, smallint) from public, anon;
grant execute on function public.marcar_asistencia(text, bigint) to authenticated;
grant execute on function public.cargar_asistencia(bigint, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.corregir_asistencia(bigint, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.anular_asistencia(bigint, text) to authenticated;
grant execute on function public.guardar_ajustes_de_asistencia(smallint, smallint) to authenticated;
