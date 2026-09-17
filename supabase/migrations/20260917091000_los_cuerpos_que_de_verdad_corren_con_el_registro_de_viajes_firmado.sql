/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  2 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
  las crea. No cambia nada en la base: son los mismos cuerpos que ya corren,
  puestos donde reconstruir desde cero da lo mismo que hay.

  POR QUE APARECIO ESTA DIFERENCIA, que es lo unico interesante de este archivo:
  las migraciones de esta casa parchean con `pg_get_functiondef` + `replace` en
  vez de reescribir funciones de siete mil letras. El parche es correcto y el
  motivo es bueno —copiar a mano es lo que introduce diferencias—, pero deja el
  cuerpo repartido entre el archivo que la creo y los cinco que la tocaron
  despues. El archivo deja de servir para reconstruir aunque cada parche este
  bien.

  Lo levanto el carril de base de datos, tres veces en un dia, y la tercera con
  el diagnostico que lo explica: no es falta de cuidado, es que la verificacion
  se hace UNA VEZ al escribir y seis migraciones despues otra cosa toca la misma
  funcion. Un md5 comprobado el lunes no dice nada del miercoles.

  Por eso esto es generado y no transcrito: volcar la salida de Postgres no puede
  introducir una diferencia, y teclearla si.

  QUE SE COMPROBO ANTES DE GUARDARLO

  Cada cuerpo de aqui se comparo BYTE A BYTE contra `pg_proc.prosrc` de la base
  viva —no normalizado, no perdonando comentarios— y los 2 coinciden. Y el
  detector, que antes marcaba estas 2, pasa a cero.

  NO SE APLICO, Y ES A PROPOSITO

  Aplicarlo seria un no-op: son exactamente los cuerpos que ya corren, sacados de
  `pg_get_functiondef`. Su valor no esta en cambiar la base sino en que
  reconstruirla desde cero de lo mismo que hay.

  Y LA TRAMPA QUE ESO DEJA, dicha aqui para que no sorprenda: si manana otra
  migracion toca una de estas funciones y alguien corre ESTE archivo suelto,
  despues, la revierte al cuerpo de hoy. En orden no pasa —va fechado con su dia y
  detras de todo lo de ese dia—, pero un volcado no es una migracion normal y
  conviene saberlo antes de ejecutarlo a mano.
*/

-- public.aprobar_viajes(p_ids bigint[], p_con_firma boolean)
-- venia de: 20260916130000_plantas_rutas_y_viajes_que_se_aprueban.sql
CREATE OR REPLACE FUNCTION public.aprobar_viajes(p_ids bigint[], p_con_firma boolean DEFAULT true)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_a    record;
  v_como text;
  v_n    integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelve a entrar.' using errcode = '28000';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'No hay viajes que aprobar.' using errcode = '22023';
  end if;

  for v_a in
    select a.id, a.estado, a.secuencia, a.equipo_codigo, r.nombre as ruta, r.origen_id, r.destino_id
      from public.acarreos a
      left join public.rutas_acarreo r on r.id = a.ruta_id
     where a.id = any (p_ids)
     order by a.id
       for update of a
  loop
    if v_a.estado <> 'POR_APROBAR' then
      raise exception 'El viaje % de % no está por aprobar: está %.',
        v_a.secuencia, coalesce(v_a.equipo_codigo, 'ese camión'), lower(replace(v_a.estado, '_', ' '))
        using errcode = '55000';
    end if;

    v_como := private.como_aprueba_viaje(v_a.origen_id, v_a.destino_id);
    if v_como is null then
      raise exception 'Los viajes de «%» los aprueba el responsable de la mina o planta de origen o de destino, o alguien con la casilla «Aprobar o rechazar viajes».', v_a.ruta
        using errcode = '42501';
    end if;

    update public.acarreos
       set estado = 'APROBADO', decidido_por = (select auth.uid()), decidido_en = now(), decidido_como = v_como,
           -- «Todo papel, como mínimo, con la firma de quien autoriza».
           firma_de_quien_aprueba = coalesce(p_con_firma, true) and private.tengo_firma_encendida()
     where id = v_a.id;
    v_n := v_n + 1;
  end loop;

  if v_n <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'Alguno de esos viajes no existe.' using errcode = 'P0002';
  end if;

  return v_n;
end;
$function$;

-- public.registrar_viajes(p_fecha date, p_ruta_id bigint, p_carga text, p_cantidad integer, p_vehiculo_id bigint, p_maquina_id bigint, p_hora time without time zone, p_carga_m3 numeric, p_precio_usd numeric, p_frente_id bigint, p_nota text, p_con_firma boolean)
-- venia de: 20260916151000_los_cuerpos_que_de_verdad_corren_con_el_ajuste_de_precio.sql
CREATE OR REPLACE FUNCTION public.registrar_viajes(p_fecha date, p_ruta_id bigint, p_carga text, p_cantidad integer DEFAULT 1, p_vehiculo_id bigint DEFAULT NULL::bigint, p_maquina_id bigint DEFAULT NULL::bigint, p_hora time without time zone DEFAULT NULL::time without time zone, p_carga_m3 numeric DEFAULT NULL::numeric, p_precio_usd numeric DEFAULT NULL::numeric, p_frente_id bigint DEFAULT NULL::bigint, p_nota text DEFAULT NULL::text, p_con_firma boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ruta    public.rutas_acarreo;
  v_origen  public.sitios_operacion;
  v_destino public.sitios_operacion;
  v_carga   text := upper(btrim(coalesce(p_carga, '')));
  v_veh     record;
  v_maq     record;
  v_tarifa  record;
  v_precio  numeric;
  v_m3      numeric;
  v_chofer  text;
  v_transp  text;
  v_codigo  text;
  v_nombre  text;
  v_util    numeric;
  v_cabe    numeric;
  v_desde   smallint;
  i         integer;
begin
  perform private.exigir_accion('EXPLOTACION.REGISTRAR_VIAJES');

  if p_fecha is null or p_fecha > private.hoy_aqui() then
    raise exception 'La fecha del viaje no puede ir en blanco ni ser del futuro.' using errcode = '22023';
  end if;

  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 60 then
    raise exception 'La cantidad de viajes tiene que estar entre 1 y 60. Llegó %.', p_cantidad
      using errcode = '22023';
  end if;

  select * into v_ruta from public.rutas_acarreo where id = p_ruta_id;
  if v_ruta.id is null then
    raise exception 'Esa ruta no existe.' using errcode = 'P0002';
  end if;
  if not v_ruta.activa then
    raise exception 'La ruta «%» está apagada.', v_ruta.nombre
      using errcode = '55000', hint = 'Se enciende en Explotación › Plantas y rutas.';
  end if;

  select * into v_origen  from public.sitios_operacion where id = v_ruta.origen_id;
  select * into v_destino from public.sitios_operacion where id = v_ruta.destino_id;

  if v_origen.estado = 'CERRADO' and v_origen.cerrado_en <= p_fecha then
    raise exception '«%» está cerrada desde el %: no despacha viajes de esa fecha en adelante.',
      v_origen.nombre, to_char(v_origen.cerrado_en, 'DD/MM/YYYY') using errcode = '55000';
  end if;
  if v_destino.estado = 'CERRADO' and v_destino.cerrado_en <= p_fecha then
    raise exception '«%» está cerrada desde el %: no recibe viajes de esa fecha en adelante.',
      v_destino.nombre, to_char(v_destino.cerrado_en, 'DD/MM/YYYY') using errcode = '55000';
  end if;

  if (p_vehiculo_id is null) = (p_maquina_id is null) then
    raise exception 'Di quién hizo el viaje: un camión o una máquina propia, uno de los dos.'
      using errcode = '22023';
  end if;

  if p_vehiculo_id is not null then
    select v.id, v.placa, v.descripcion, v.activo, v.transportista, v.capacidad_m3, v.carga_util_m3
      into v_veh
      from public.vehiculos v where v.id = p_vehiculo_id;
    if v_veh.id is null then
      raise exception 'Ese vehículo no existe.' using errcode = 'P0002';
    end if;
    if not v_veh.activo then
      raise exception 'El camión % está dado de baja.', v_veh.placa
        using errcode = '55000',
              hint = 'Si volvió a la flota, reactívalo en Vehículos antes de cargarle viajes.';
    end if;

    select ch.chofer into v_chofer
      from public.v_vehiculo_choferes ch
     where ch.vehiculo_id = p_vehiculo_id
       and ch.desde <= p_fecha
       and (ch.hasta is null or ch.hasta >= p_fecha)
     order by ch.desde desc
     limit 1;

    v_transp := coalesce(nullif(btrim(coalesce(v_veh.transportista, '')), ''), 'FLOTA PROPIA');
    v_codigo := v_veh.placa;
    v_nombre := v_veh.descripcion;
    v_util   := v_veh.carga_util_m3;
    v_cabe   := v_veh.capacidad_m3;
  else
    select m.id, m.codigo, m.nombre, e.nombres || ' ' || e.apellidos as operador
      into v_maq
      from public.maquinaria m
      left join public.empleados e on e.id = m.operador_id
     where m.id = p_maquina_id;
    if v_maq.id is null then
      raise exception 'Esa máquina no existe.' using errcode = 'P0002';
    end if;

    v_chofer := v_maq.operador;
    v_transp := 'FLOTA PROPIA';
    v_codigo := v_maq.codigo;
    v_nombre := v_maq.nombre;
  end if;

  if v_carga not in ('COMPLETA', 'PARCIAL', 'VACIO') then
    raise exception 'Di cómo volvió: con la carga completa, con carga parcial o vacío.'
      using errcode = '22023';
  end if;

  if v_carga = 'VACIO' then
    if p_carga_m3 is not null then
      raise exception 'Un viaje vacío no lleva metros cúbicos.' using errcode = '22023';
    end if;
    v_m3 := null;
  elsif v_carga = 'PARCIAL' then
    if p_carga_m3 is null or p_carga_m3 <= 0 then
      raise exception 'Con carga parcial hay que decir cuántos metros cúbicos traía.' using errcode = '22023';
    end if;
    v_m3 := p_carga_m3;
  else
    v_m3 := coalesce(p_carga_m3, v_util);
    if v_m3 is not null and v_m3 <= 0 then
      raise exception 'La carga tiene que ser mayor que cero, o quedar en blanco.' using errcode = '22023';
    end if;
  end if;

  if v_m3 is not null and v_cabe is not null and v_m3 > v_cabe then
    raise exception 'El camión % no carga %, le caben %.', v_codigo, v_m3, v_cabe
      using errcode = '22023';
  end if;

  select t.precio_usd, t.precio_hasta_usd into v_tarifa
    from public.ruta_tarifas t
   where t.ruta_id = v_ruta.id and t.vigente_desde <= p_fecha
   order by t.vigente_desde desc
   limit 1;

  if p_precio_usd is not null and p_precio_usd < 0 then
    raise exception 'El precio del viaje no puede ser negativo.' using errcode = '22023';
  end if;

  if p_maquina_id is not null then
    /*
      LAS MÁQUINAS PROPIAS NO SE PAGAN POR VIAJE. Sus movimientos «no se
      facturan por viaje individual, a menos que se trate de un servicio
      alquilado a terceros por hora o volumen». El viaje queda contado, a cero.
    */
    if coalesce(p_precio_usd, 0) <> 0 then
      raise exception 'Las máquinas propias no se pagan por viaje: el viaje queda contado sin precio.'
        using errcode = '22023';
    end if;
    v_precio := 0;
  elsif v_ruta.precio_libre then
    if p_precio_usd is null then
      raise exception 'La ruta «%» no tiene tarifa fija: di cuánto se paga este viaje.', v_ruta.nombre
        using errcode = '22023';
    end if;
    v_precio := p_precio_usd;
  elsif v_tarifa.precio_usd is null then
    raise exception 'La ruta «%» no tiene tarifa para el %.', v_ruta.nombre, to_char(p_fecha, 'DD/MM/YYYY')
      using errcode = '55000', hint = 'Se pone en Explotación › Plantas y rutas.';
  elsif v_tarifa.precio_hasta_usd is not null then
    if p_precio_usd is null or p_precio_usd < v_tarifa.precio_usd or p_precio_usd > v_tarifa.precio_hasta_usd then
      raise exception 'La tarifa de «%» va de % a % USD: di cuánto se paga este viaje, dentro de ese rango.',
        v_ruta.nombre, v_tarifa.precio_usd, v_tarifa.precio_hasta_usd using errcode = '22023';
    end if;
    v_precio := p_precio_usd;
  else
    v_precio := coalesce(p_precio_usd, v_tarifa.precio_usd);
  end if;

  if p_frente_id is not null
     and not exists (select 1 from public.frentes_explotacion f where f.id = p_frente_id) then
    raise exception 'Ese frente no existe.' using errcode = 'P0002';
  end if;

  /*
    La numeración sigue la de los viajes de antes: en una ruta que sustituye un
    tramo, cuentan también los viajes de ese tramo sin ruta.
  */
  select coalesce(max(a.secuencia), 0) into v_desde
    from public.acarreos a
   where a.fecha = p_fecha
     and (a.vehiculo_id = p_vehiculo_id or a.maquina_id = p_maquina_id)
     and (a.ruta_id = v_ruta.id
          or (a.ruta_id is null and v_ruta.tramo_anterior is not null and a.tramo = v_ruta.tramo_anterior));

  for i in 1..p_cantidad loop
    insert into public.acarreos
      (fecha, vehiculo_id, maquina_id, ruta_id, tramo, secuencia, hora, frente_id,
       transportista, chofer, equipo_codigo, equipo_nombre, carga, carga_m3, precio_usd,
       estado, nota, registrado_por, firma_de_quien_registra)
    values
      (p_fecha, p_vehiculo_id, p_maquina_id, v_ruta.id, v_ruta.tramo_anterior, v_desde + i,
       case when i = 1 then p_hora end, p_frente_id,
       v_transp, v_chofer, v_codigo, v_nombre, v_carga, v_m3, v_precio,
       'POR_APROBAR', nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()),
       coalesce(p_con_firma, false) and private.tengo_firma_encendida());
  end loop;

  return p_cantidad;
end;
$function$;
