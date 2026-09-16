/*
  LOS CUERPOS QUE DE VERDAD CORREN, CON LOS CAMIONES EN MAQUINARIA.

  No cambia nada en la base: son los mismos cuerpos que ya corren después de
  20260916105705_los_camiones_los_gobierna_maquinaria, puestos donde
  reconstruir desde cero da lo mismo que hay. Aquella migración parchea por
  anclaje, y el cuerpo quedaba repartido entre el archivo que creó cada
  función y los que la tocaron después.

  QUÉ SE COMPROBÓ ANTES DE GUARDARLO

  El cuerpo de cada una de las cuatro funciones se comparó por md5 contra
  pg_proc.prosrc de producción el 16/09/2026, y coincide byte a byte:

    asignar_chofer      47c9601151624c90fb64cdcb6a3285a8
    guardar_vehiculo    9b7b40478a7271f301c8bbc8273e0722
    historial_vehiculo  48dc30be44bdde2d2dedc96da6ac1d4f
    terminar_chofer     4779cb1a38d188d3e5a4dbdd8eb04736

  Salieron de la base local con el mismo parche aplicado. guardar_vehiculo
  traía en local la sentencia update partida en más líneas que en producción
  (deriva vieja de la base local, no de este cambio); se dejó como en
  producción y el md5 lo confirma.
*/

CREATE OR REPLACE FUNCTION public.asignar_chofer(p_vehiculo_id bigint, p_empleado_id bigint DEFAULT NULL::bigint, p_nombre text DEFAULT NULL::text, p_cedula text DEFAULT NULL::text, p_desde date DEFAULT NULL::date, p_motivo text DEFAULT NULL::text, p_nota text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_desde  date := coalesce(p_desde, current_date);
  v_actual record;
  v_veh    record;
  v_emp    record;
  v_id     bigint;
begin
  if not (private.tiene_permiso('MAQUINARIA', 'ESCRITURA')
          or private.tiene_permiso('DESPACHOS', 'ESCRITURA')
          or private.puede_accion('DESPACHOS.ASIGNAR_CHOFER')) then
    perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');
  end if;

  select * into v_veh from public.vehiculos where id = p_vehiculo_id for update;
  if v_veh.id is null then
    raise exception 'No existe el vehículo %.', p_vehiculo_id using errcode = 'P0002';
  end if;

  if p_empleado_id is null and length(btrim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'Hay que decir quién lo va a manejar.' using errcode = '23514';
  end if;

  if p_empleado_id is not null then
    select * into v_emp from public.empleados where id = p_empleado_id;
    if v_emp.id is null then
      raise exception 'No existe el empleado %.', p_empleado_id using errcode = '23503';
    end if;
    if not v_emp.activo then
      raise exception 'El empleado % ya no está activo.', v_emp.nombres using errcode = '55000';
    end if;
  end if;

  if v_desde > current_date then
    raise exception 'No se asigna un chofer con fecha futura.' using errcode = '22023';
  end if;

  -- El traspaso cierra el período anterior el día antes de empezar el nuevo.
  -- Si se cerrara el mismo día, dos choferes figurarían manejando a la vez.
  select * into v_actual
    from public.vehiculo_choferes
   where vehiculo_id = p_vehiculo_id and hasta is null
   for update;

  if v_actual.id is not null then
    if v_desde <= v_actual.desde then
      raise exception 'El chofer anterior empezó el %; el traspaso tiene que ser posterior.',
        to_char(v_actual.desde, 'DD/MM/YYYY') using errcode = '22023';
    end if;

    update public.vehiculo_choferes
       set hasta = v_desde - 1,
           motivo = coalesce(motivo, p_motivo)
     where id = v_actual.id;
  end if;

  insert into public.vehiculo_choferes
    (vehiculo_id, empleado_id, nombre, cedula, desde, motivo, nota, creada_por)
  values
    (p_vehiculo_id, p_empleado_id,
     case when p_empleado_id is null then btrim(p_nombre) end,
     nullif(btrim(coalesce(p_cedula, '')), ''),
     v_desde, nullif(btrim(coalesce(p_motivo, '')), ''),
     nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guardar_vehiculo(p_id bigint, p_placa text, p_tipo text, p_capacidad_m3 numeric, p_descripcion text DEFAULT NULL::text, p_capacidad_ton numeric DEFAULT NULL::numeric, p_propio boolean DEFAULT true, p_transportista text DEFAULT NULL::text, p_maquina_id bigint DEFAULT NULL::bigint, p_activo boolean DEFAULT true, p_nota text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id bigint;
begin
  -- LOS CAMIONES LOS GOBIERNA MAQUINARIA: basta su escritura, además de lo
  -- que ya valía. Una autorización sobre la casilla también cuenta.
  if not (private.tiene_permiso('MAQUINARIA', 'ESCRITURA')
          or private.tiene_permiso('DESPACHOS', 'ESCRITURA')
          or private.puede_accion('DESPACHOS.EDITAR_VEHICULO')) then
    perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');
  end if;

  if p_tipo not in ('VOLTEO','CHUTO','GANDOLA','CAVA','CISTERNA','OTRO') then
    raise exception 'Tipo de vehículo no válido: %.', p_tipo using errcode = '22023';
  end if;
  if coalesce(p_capacidad_m3, 0) <= 0 then
    raise exception 'Hay que decir cuántos metros cúbicos carga: es para lo que sirve tenerlo cargado.'
      using errcode = '23514';
  end if;
  if not p_propio and length(btrim(coalesce(p_transportista, ''))) = 0 then
    raise exception 'Un vehículo que no es de la empresa tiene que decir de quién es.'
      using errcode = '23514';
  end if;
  if p_maquina_id is not null then
    if not p_propio then
      raise exception 'Solo un vehículo de la empresa puede tener ficha de mantenimiento.'
        using errcode = '22023';
    end if;
    perform 1 from public.maquinaria where id = p_maquina_id;
    if not found then
      raise exception 'No existe la máquina %.', p_maquina_id using errcode = '23503';
    end if;
  end if;

  if p_id is not null then
    -- De quién es, si es propio, cuánto le cabe y su ficha deciden a quién se
    -- paga cada viaje y cuántos metros admite: con Maquinaria a secas no.
    if not (private.tiene_permiso('DESPACHOS', 'ESCRITURA')
            or private.puede_accion('DESPACHOS.EDITAR_VEHICULO'))
       and exists (
         select 1 from public.vehiculos v
          where v.id = p_id
            and (v.propio is distinct from p_propio
                 or upper(btrim(coalesce(v.transportista, ''))) is distinct from
                      (case when p_propio then '' else upper(btrim(coalesce(p_transportista, ''))) end)
                 or v.capacidad_m3 is distinct from p_capacidad_m3
                 or v.maquina_id is distinct from
                      (case when p_propio then p_maquina_id else null end))) then
      raise exception 'Cambiar de quién es un camión, lo que le cabe o su ficha de mantenimiento pide la casilla «Dar de alta y corregir un vehículo».'
        using errcode = '42501',
              hint = 'Lo demás —placa, tipo, descripción, nota, en servicio— se corrige con Maquinaria.';
    end if;

    if exists (select 1 from public.vehiculos v
                where v.id = p_id and v.carga_util_m3 > p_capacidad_m3) then
      raise exception 'Este camión trae % m³ por viaje: lo que le cabe no puede quedar por debajo. Baja primero la carga útil.',
        (select v.carga_util_m3 from public.vehiculos v where v.id = p_id)
        using errcode = '22023';
    end if;
  end if;

  if p_id is null then
    insert into public.vehiculos
      (placa, tipo, descripcion, capacidad_m3, capacidad_ton, propio,
       transportista, maquina_id, activo, nota, creado_por)
    values
      (p_placa, p_tipo, nullif(btrim(coalesce(p_descripcion, '')), ''),
       p_capacidad_m3, p_capacidad_ton, p_propio,
       case when p_propio then null else btrim(p_transportista) end,
       case when p_propio then p_maquina_id else null end,
       p_activo, nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
    returning id into v_id;
  else
    update public.vehiculos
       set placa = p_placa, tipo = p_tipo,
           descripcion = nullif(btrim(coalesce(p_descripcion, '')), ''),
           capacidad_m3 = p_capacidad_m3, capacidad_ton = p_capacidad_ton,
           propio = p_propio,
           transportista = case when p_propio then null else btrim(p_transportista) end,
           maquina_id = case when p_propio then p_maquina_id else null end,
           activo = p_activo,
           nota = nullif(btrim(coalesce(p_nota, '')), '')
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'No existe el vehículo %.', p_id using errcode = 'P0002';
    end if;
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya hay un vehículo con la placa %.',
      upper(regexp_replace(btrim(p_placa), '\s+', '', 'g')) using errcode = '23505';
end;
$function$;

CREATE OR REPLACE FUNCTION public.historial_vehiculo(p_vehiculo_id bigint, p_limite integer DEFAULT 200)
 RETURNS TABLE(cuando timestamp with time zone, fecha date, clase text, titulo text, detalle text, cantidad numeric, unidad text, signo smallint, valor_usd numeric, lugar text, persona text, quien text, documento text, ruta text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_maquina bigint;
begin
  if not (private.tiene_permiso('MAQUINARIA', 'LECTURA')
          or private.tiene_permiso('DESPACHOS', 'LECTURA')
          or private.puede_accion('DESPACHOS.VER_VEHICULOS')) then
    perform private.exigir_permiso('MAQUINARIA', 'LECTURA');
  end if;

  select v.maquina_id into v_maquina from public.vehiculos v where v.id = p_vehiculo_id;

  return query
  select * from (
    select v.creado_en as cuando, v.creado_en::date as fecha, 'ALTA'::text as clase,
           'Se dio de alta'::text as titulo,
           concat_ws(' · ', v.tipo,
             case when v.propio then 'propio' else 'de ' || coalesce(v.transportista, 'un transportista') end,
             nullif(v.descripcion, '')) as detalle,
           null::numeric as cantidad, null::text as unidad, 0::smallint as signo,
           null::numeric as valor_usd, null::text as lugar, null::text as persona,
           coalesce(p.nombre, p.usuario) as quien,
           v.placa as documento, '/app/maquinaria'::text as ruta
      from public.vehiculos v
      left join public.perfiles p on p.id = v.creado_por
     where v.id = p_vehiculo_id

    union all

    select a.fecha::timestamptz, a.fecha, a.tipo,
           concat_ws(' · ', a.tipo, nullif(a.estado, '')),
           a.detalle, a.cantidad, a.unidad, 0::smallint, null::numeric,
           null::text, null::text, null::text,
           a.numero, '/app/despachos'
      from public.v_vehiculo_actividad a
     where a.vehiculo_id = p_vehiculo_id

    union all

    -- Se hizo cargo el día que empezó, no el día que alguien lo anotó.
    select c.desde::timestamptz, c.desde, 'CHOFER'::text,
           format('Se hizo cargo %s', coalesce(c.nombre, 'alguien')),
           concat_ws(' · ', nullif(c.motivo, ''), nullif(c.nota, '')),
           null::numeric, null::text, 0::smallint, null::numeric,
           null::text, c.nombre, null::text,
           nullif(c.cedula, ''), '/app/maquinaria'
      from public.vehiculo_choferes c
     where c.vehiculo_id = p_vehiculo_id

    union all

    select c.hasta::timestamptz, c.hasta, 'CHOFER'::text,
           format('Lo dejó %s', coalesce(c.nombre, 'alguien')),
           concat_ws(' · ', nullif(c.motivo, ''),
             format('lo manejó %s días', (c.hasta - c.desde))),
           null::numeric, null::text, 0::smallint, null::numeric,
           null::text, c.nombre, null::text,
           nullif(c.cedula, ''), '/app/maquinaria'
      from public.vehiculo_choferes c
     where c.vehiculo_id = p_vehiculo_id
       and c.hasta is not null

    union all

    -- Lo de su máquina, menos el alta: el camión ya tiene la suya arriba, y dos
    -- «se dio de alta» en la misma línea de tiempo solo confunden.
    select m.cuando, m.fecha, m.clase, m.titulo, m.detalle, m.cantidad, m.unidad,
           m.signo, m.valor_usd, m.lugar, m.persona, m.quien, m.documento, m.ruta
      from private.hechos_de_maquina(v_maquina) m
     where v_maquina is not null
       and m.clase <> 'ALTA'
       and private.tiene_permiso('MAQUINARIA', 'LECTURA')
  ) h
  order by h.cuando desc nulls last
  limit coalesce(p_limite, 200);
end;
$function$;

CREATE OR REPLACE FUNCTION public.terminar_chofer(p_id bigint, p_hasta date DEFAULT NULL::date, p_motivo text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fila  record;
  v_hasta date := coalesce(p_hasta, current_date);
begin
  if not (private.tiene_permiso('MAQUINARIA', 'ESCRITURA')
          or private.tiene_permiso('DESPACHOS', 'ESCRITURA')
          or private.puede_accion('DESPACHOS.ASIGNAR_CHOFER')) then
    perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');
  end if;

  select * into v_fila from public.vehiculo_choferes where id = p_id for update;
  if v_fila.id is null then
    raise exception 'No existe esa asignación de chofer.' using errcode = 'P0002';
  end if;
  if v_fila.hasta is not null then
    raise exception 'Esa asignación ya está cerrada.' using errcode = '55000';
  end if;
  if v_hasta < v_fila.desde then
    raise exception 'No puede terminar antes de empezar.' using errcode = '22023';
  end if;

  update public.vehiculo_choferes
     set hasta = v_hasta,
         motivo = coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), motivo)
   where id = p_id;

  return p_id;
end;
$function$;
