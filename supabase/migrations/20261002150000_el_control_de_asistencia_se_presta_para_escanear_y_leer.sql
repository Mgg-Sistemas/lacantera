-- ═══════════════════════════════════════════════════════════════════════════
-- EL CONTROL DE ASISTENCIA SE PRESTA PARA ESCANEAR Y LEER
--
-- Hasta hoy el módulo ASISTENCIA era de un solo nivel: quien no tuviera
-- ESCRITURA de módulo (por rol) no podía ni ver la pantalla ni escanear un
-- carnet. Se pidió poder prestarle a alguien —genesis, en este caso— SOLO lo
-- de escanear y leer, sin darle el nivel completo del módulo (que también
-- deja cargar jornadas a mano, corregir y anular).
--
-- LA CASILLA NUEVA: `ASISTENCIA.ESCANEAR`, con `nivel_equivalente = 'LECTURA'`
-- — quien ya tenga LECTURA o más de ASISTENCIA por su rol la tiene gratis, y
-- además se puede prestar aparte a quien no tenga ningún nivel.
--
-- LA LECTURA TAMBIÉN SE ABRE CON LA CASILLA, EN LAS CUATRO TABLAS DEL MÓDULO
-- (jornadas, config, visitas, visitantes conocidos): sin esto, a quien se le
-- prestara la casilla vería la pantalla pero con todo vacío -el «no le digas
-- que no, dile que no hay nadie» que el propio `ExigePermiso.tsx` dice que es
-- peor que un «no» claro-.
--
-- EL REGISTRO MANUAL (`cargar_asistencia`) NO ENTRA EN LA CASILLA, A PROPÓSITO.
-- Pedido explícito: cargar una jornada completa a mano queda solo para quien
-- tiene el ROL de administrador, ni siquiera por el nivel TOTAL del módulo.
-- `corregir_asistencia`/`anular_asistencia`/`guardar_ajustes_de_asistencia`
-- tampoco se tocan: siguen pidiendo ASISTENCIA/ESCRITURA o TOTAL, como antes.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente)
values ('ASISTENCIA.ESCANEAR', 'ASISTENCIA',
        'Escanear o marcar asistencia',
        'Deja escanear el carnet (o elegir la persona) para marcar entrada o salida, y ver la pantalla de Control de asistencia. No deja cargar una jornada a mano -eso sigue siendo solo de administración- ni corregir o anular una marca ya hecha.',
        10, 'LECTURA')
on conflict (codigo) do update
  set nombre = excluded.nombre, dice = excluded.dice, nivel_equivalente = excluded.nivel_equivalente;

alter policy asistencia_jornadas_lectura on public.asistencia_jornadas
  using (private.tiene_permiso('ASISTENCIA', 'LECTURA') or private.puede_accion('ASISTENCIA.ESCANEAR'));
alter policy asistencia_config_lectura on public.asistencia_config
  using (private.tiene_permiso('ASISTENCIA', 'LECTURA') or private.puede_accion('ASISTENCIA.ESCANEAR'));
alter policy asistencia_visitas_lectura on public.asistencia_visitas
  using (private.tiene_permiso('ASISTENCIA', 'LECTURA') or private.puede_accion('ASISTENCIA.ESCANEAR'));
alter policy asistencia_visitantes_lectura on public.asistencia_visitantes
  using (private.tiene_permiso('ASISTENCIA', 'LECTURA') or private.puede_accion('ASISTENCIA.ESCANEAR'));

create or replace function public.marcar_asistencia(p_codigo text DEFAULT NULL::text, p_empleado_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if not (private.tiene_permiso('ASISTENCIA', 'ESCRITURA') or private.puede_accion('ASISTENCIA.ESCANEAR')) then
    raise exception 'No tienes permiso para marcar asistencia.' using errcode = '42501';
  end if;
  select * into v_cfg from public.asistencia_config where unica;

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

  select * into v_abierta
    from public.asistencia_jornadas
   where empleado_id = p_empleado_id and salida is null and anulada_en is null
   order by entrada desc limit 1;

  if v_abierta.id is not null
     and v_ahora - v_abierta.entrada <= make_interval(hours => v_cfg.horas_maximas_jornada) then
    if v_ahora - v_abierta.entrada < make_interval(mins => v_cfg.minutos_doble_marca) then
      raise exception 'Doble escaneo: % marcó entrada hace un momento.', v_emp.nombres || ' ' || v_emp.apellidos
        using errcode = '55000';
    end if;
    update public.asistencia_jornadas set salida = v_ahora where id = v_abierta.id;
    v_id := v_abierta.id;
    v_accion := 'SALIDA';
  else
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
$function$;

create or replace function public.cargar_asistencia(p_empleado_id bigint, p_entrada timestamp with time zone, p_salida timestamp with time zone DEFAULT NULL::timestamp with time zone, p_nota text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id bigint; v_emp record; v_cfg record;
begin
  perform private.exigir_rol('ADMIN');
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
$function$;

do $comprueba$
begin
  if (select nivel_equivalente from public.acciones where codigo = 'ASISTENCIA.ESCANEAR') is distinct from 'LECTURA' then
    raise exception 'ASISTENCIA.ESCANEAR no quedó con nivel_equivalente LECTURA.';
  end if;
  if not exists (
    select 1 from pg_policy pol join pg_class c on c.oid = pol.polrelid
     where pol.polname = 'asistencia_jornadas_lectura'
       and pg_get_expr(pol.polqual, pol.polrelid) like '%ASISTENCIA.ESCANEAR%'
  ) then
    raise exception 'asistencia_jornadas_lectura no quedó con la casilla nueva.';
  end if;
  if not exists (
    select 1 from pg_policy pol join pg_class c on c.oid = pol.polrelid
     where pol.polname = 'asistencia_config_lectura'
       and pg_get_expr(pol.polqual, pol.polrelid) like '%ASISTENCIA.ESCANEAR%'
  ) then
    raise exception 'asistencia_config_lectura no quedó con la casilla nueva.';
  end if;
  if not exists (
    select 1 from pg_policy pol join pg_class c on c.oid = pol.polrelid
     where pol.polname = 'asistencia_visitas_lectura'
       and pg_get_expr(pol.polqual, pol.polrelid) like '%ASISTENCIA.ESCANEAR%'
  ) then
    raise exception 'asistencia_visitas_lectura no quedó con la casilla nueva.';
  end if;
  if not exists (
    select 1 from pg_policy pol join pg_class c on c.oid = pol.polrelid
     where pol.polname = 'asistencia_visitantes_lectura'
       and pg_get_expr(pol.polqual, pol.polrelid) like '%ASISTENCIA.ESCANEAR%'
  ) then
    raise exception 'asistencia_visitantes_lectura no quedó con la casilla nueva.';
  end if;
  if position('ASISTENCIA.ESCANEAR' in pg_get_functiondef('public.marcar_asistencia(text, bigint)'::regprocedure)) = 0 then
    raise exception 'marcar_asistencia no quedó con la casilla nueva.';
  end if;
  if position('exigir_rol(''ADMIN'')' in pg_get_functiondef('public.cargar_asistencia(bigint, timestamptz, timestamptz, text)'::regprocedure)) = 0 then
    raise exception 'cargar_asistencia no quedó restringida a ADMIN.';
  end if;
end
$comprueba$;
