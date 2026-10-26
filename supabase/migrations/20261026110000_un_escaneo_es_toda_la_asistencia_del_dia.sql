-- ============================================================================
-- UN ESCANEO ES TODA LA ASISTENCIA DEL DÍA (26/10/2026)
--
-- Christopher: «necesito que cuando la gente se escanee cuente como entrada y
-- salida, solo me interesa saber que asistió». El modelo de antes alternaba
-- entrada/salida y exigía un segundo escaneo para cerrar la jornada; quien no
-- volvía a escanear ese mismo día —o pasaba del plazo de
-- `horas_maximas_jornada`— dejaba la jornada abierta para siempre. Eso era
-- exactamente el aviso de "361 jornadas de otros días sin salida".
--
-- AHORA: el primer escaneo del día deja la jornada completa de una vez,
-- entrada y salida con la misma hora — una marca de presencia, no un
-- horario—. Si la persona vuelve a escanear ese mismo día, no se crea nada
-- nuevo: se avisa que ya había marcado, con la hora de la primera vez.
--
-- SOLO NÓMINA. Visitantes —la gente de afuera— sigue con su entrada/salida
-- real tal como está: ahí sí importa saber si alguien sigue adentro. Su RPC
-- (`registrar_visita`) lee `asistencia_config.horas_maximas_jornada` para su
-- propio candado, así que esa tabla y la pantalla de Ajustes NO se tocan.
--
-- LAS 361 JORNADAS YA ABIERTAS SE CIERRAN TAMBIÉN, con la salida igual a la
-- entrada —mismo criterio que las nuevas—, para que el histórico quede
-- limpio y el aviso ámbar no vuelva a aparecer por lo que pasó antes de hoy.
-- ============================================================================

-- ─────────────────────── 1 · la jornada admite salida = entrada ────────────
--
-- Antes exigía `salida > entrada` (medía un horario). Ahora una marca de
-- presencia nace con las dos iguales, así que el candado se afloja a `>=`.

alter table public.asistencia_jornadas
  drop constraint if exists asistencia_sale_despues_de_entrar;

alter table public.asistencia_jornadas
  add constraint asistencia_sale_despues_de_entrar
  check (salida is null or salida >= entrada);

-- ─────────────────────── 2 · las ya abiertas se cierran solas ──────────────

update public.asistencia_jornadas
   set salida = entrada
 where salida is null
   and anulada_en is null;

-- ─────────────────────── 3 · marcar_asistencia: una por persona por día ────

create or replace function public.marcar_asistencia(p_codigo text default null, p_empleado_id bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_codigo    text;
  v_carnet    record;
  v_emp       record;
  v_existente record;
  v_ahora     timestamptz := now();
  v_hoy       date;
  v_id        bigint;
begin
  if not (private.tiene_permiso('ASISTENCIA', 'ESCRITURA') or private.puede_accion('ASISTENCIA.ESCANEAR')) then
    raise exception 'Su usuario no tiene permiso para marcar asistencia.' using errcode = '42501';
  end if;

  if p_codigo is not null then
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

  perform pg_advisory_xact_lock(hashtext('asistencia'), p_empleado_id::integer);

  select id, nombres, apellidos, ficha, activo, fecha_egreso into v_emp from public.empleados where id = p_empleado_id;
  if v_emp.id is null then
    raise exception 'Esa persona no está en el personal.' using errcode = 'P0002';
  end if;
  if not v_emp.activo or v_emp.fecha_egreso is not null then
    raise exception '% ya no está activo en el personal: no se le marca asistencia.', v_emp.nombres || ' ' || v_emp.apellidos
      using errcode = '55000';
  end if;

  v_hoy := (v_ahora at time zone 'America/Caracas')::date;

  -- Ya marcó hoy: no se crea una segunda jornada, se avisa con la primera.
  select * into v_existente
    from public.asistencia_jornadas
   where empleado_id = p_empleado_id and fecha = v_hoy and anulada_en is null
   limit 1;

  if v_existente.id is not null then
    return jsonb_build_object(
      'accion', 'YA_MARCADA', 'jornada_id', v_existente.id, 'momento', v_existente.entrada,
      'empleado_id', v_emp.id, 'nombre', v_emp.nombres || ' ' || v_emp.apellidos, 'ficha', v_emp.ficha);
  end if;

  insert into public.asistencia_jornadas (empleado_id, fecha, entrada, salida, origen, carnet_codigo, registrado_por)
  values (p_empleado_id, v_hoy, v_ahora, v_ahora,
          case when v_codigo is null then 'MANUAL' else 'CARNET' end, v_codigo, (select auth.uid()))
  returning id into v_id;

  return jsonb_build_object(
    'accion', 'ASISTIO', 'jornada_id', v_id, 'momento', v_ahora,
    'empleado_id', v_emp.id, 'nombre', v_emp.nombres || ' ' || v_emp.apellidos, 'ficha', v_emp.ficha);
end;
$function$;

-- ─────────────────────────────────── comprobación ───────────────────────────
-- Debe devolver: abiertas = 0, constraint_laxo = true.
select
  (select count(*) from public.asistencia_jornadas where salida is null and anulada_en is null) as abiertas,
  (select position('>= entrada' in pg_get_constraintdef(oid)) > 0
     from pg_constraint
    where conrelid = 'public.asistencia_jornadas'::regclass
      and conname = 'asistencia_sale_despues_de_entrar')                                         as constraint_laxo;
