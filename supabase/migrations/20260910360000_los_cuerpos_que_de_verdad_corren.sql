/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  1 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
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
  viva —no normalizado, no perdonando comentarios— y los 1 coinciden. Y el
  detector, que antes marcaba estas 1, pasa a cero.

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

-- public.guardar_maquina(p_id bigint, p_codigo text, p_nombre text, p_tipo text, p_marca text, p_modelo text, p_serial text, p_anio smallint, p_almacen_id bigint, p_tope_horas numeric, p_aviso_horas numeric, p_alarma_horas numeric, p_dias_mantenimiento smallint, p_nota text, p_combustible_id bigint, p_capacidad_combustible numeric, p_propietario text, p_estado text, p_fotos jsonb, p_operador_id bigint, p_clase text)
-- venia de: 20260910140000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.guardar_maquina(p_id bigint, p_codigo text, p_nombre text, p_tipo text, p_marca text DEFAULT NULL::text, p_modelo text DEFAULT NULL::text, p_serial text DEFAULT NULL::text, p_anio smallint DEFAULT NULL::smallint, p_almacen_id bigint DEFAULT NULL::bigint, p_tope_horas numeric DEFAULT 250, p_aviso_horas numeric DEFAULT 200, p_alarma_horas numeric DEFAULT 220, p_dias_mantenimiento smallint DEFAULT NULL::smallint, p_nota text DEFAULT NULL::text, p_combustible_id bigint DEFAULT NULL::bigint, p_capacidad_combustible numeric DEFAULT NULL::numeric, p_propietario text DEFAULT NULL::text, p_estado text DEFAULT NULL::text, p_fotos jsonb DEFAULT NULL::jsonb, p_operador_id bigint DEFAULT NULL::bigint, p_clase text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id     bigint;
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_art    record;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  if length(v_codigo) < 2 then
    raise exception 'La máquina necesita un código que la identifique.' using errcode = '23514';
  end if;
  if p_clase is not null and upper(btrim(p_clase)) not in ('MAQUINA', 'VEHICULO', 'EQUIPO') then
    raise exception 'Eso no es una clase valida: %.', p_clase
      using errcode = '22023',
            hint = 'MAQUINA lo que trabaja en la mina, VEHICULO lo que lleva gente y encargos, EQUIPO lo que no es ninguna de las dos.';
  end if;

  if length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'La máquina necesita un nombre.' using errcode = '23514';
  end if;
  if p_tipo not in ('EXCAVADORA','CARGADOR','CAMION','PLANTA','PERFORADORA',
                    'VEHICULO','GENERADOR','OTRO') then
    raise exception 'Tipo de máquina no válido: %.', p_tipo using errcode = '22023';
  end if;
  if not (p_aviso_horas <= p_alarma_horas and p_alarma_horas <= p_tope_horas) then
    raise exception 'El aviso (%) tiene que ir antes que la alarma (%), y la alarma antes que el tope (%).',
      p_aviso_horas, p_alarma_horas, p_tope_horas using errcode = '22023';
  end if;
  if p_tope_horas <= 0 then
    raise exception 'El tope de horas tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if p_almacen_id is not null then
    perform 1 from public.almacenes where id = p_almacen_id;
    if not found then
      raise exception 'No existe el almacén %.', p_almacen_id using errcode = '23503';
    end if;
  end if;

  -- El combustible que quema tiene que ser combustible. Sin esto, elegir por
  -- error un filtro de aire dejaría la máquina sin poder surtirse nunca, y el
  -- mensaje del despacho hablaría de un artículo que no pinta nada.
  if p_combustible_id is not null then
    select id, nombre, categoria into v_art
      from public.articulos where id = p_combustible_id;
    if v_art.id is null then
      raise exception 'No existe el artículo %.', p_combustible_id using errcode = '23503';
    end if;
    if v_art.categoria <> 'COMBUSTIBLE' then
      raise exception '"%" no es combustible.', v_art.nombre using errcode = '22023';
    end if;
  end if;

  if p_capacidad_combustible is not null and p_capacidad_combustible <= 0 then
    raise exception 'La capacidad del tanque tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  /*
    EL ESTADO SOLO AL NACER. Al corregir se ignora: cambiarlo es un hecho que
    `cambiar_estado_maquina` obliga a explicar con un motivo, y desde aqui se
    podria parar una excavadora tocando un desplegable.
  */
  if p_id is null and nullif(btrim(coalesce(p_estado, '')), '') is not null then
    if upper(btrim(p_estado)) = 'EN_MANTENIMIENTO' then
      raise exception 'Una maquina en mantenimiento lo esta en un taller, y eso se abre aparte.'
        using errcode = '22023',
              hint = 'Registrala en espera y abre el mantenimiento: ahi se dice el taller, la especialidad y el porque, y el estado lo pone solo.';
    end if;
    if upper(btrim(p_estado)) not in ('ACTIVA', 'EN_ESPERA', 'FUERA_DE_SERVICIO', 'DESINCORPORADA') then
      raise exception 'Estado de maquina no valido: %.', p_estado using errcode = '22023';
    end if;
  end if;

  /*
    DOS FOTOS COMO MINIMO, Y SOLO AL NACER. Sin esto, «obligatorio al registrar»
    seria una sugerencia: se crearia la maquina y las fotos quedarian para
    despues, que es para nunca.
  */
  if p_id is null
     and coalesce(jsonb_array_length(coalesce(p_fotos, '[]'::jsonb)), 0) < 2 then
    raise exception 'Hacen falta al menos dos fotos de la maquina para registrarla.'
      using errcode = '22023',
            hint = 'Una sola no enseña una maquina: hay un lado que no se ve. Y el dia que se discuta un golpe, lo que vale es lo que se fotografio al recibirla.';
  end if;

  if p_operador_id is not null
     and not exists (select 1 from public.empleados e
                      where e.id = p_operador_id and e.activo) then
    raise exception 'Ese empleado no existe o ya no esta activo.'
      using errcode = '22023',
            hint = 'Una maquina a cargo de quien ya no trabaja aqui esta a cargo de nadie.';
  end if;

  if p_id is null then
    insert into public.maquinaria
      (codigo, nombre, tipo, marca, modelo, serial, anio, almacen_id, estado,
       tope_horas, aviso_horas, alarma_horas, dias_mantenimiento, nota,
       combustible_id, capacidad_combustible, propietario, operador_id, clase, creada_por)
    values
      (v_codigo, btrim(p_nombre), p_tipo,
       nullif(btrim(coalesce(p_marca, '')), ''), nullif(btrim(coalesce(p_modelo, '')), ''),
       nullif(btrim(coalesce(p_serial, '')), ''), p_anio, p_almacen_id,
       coalesce(upper(nullif(btrim(coalesce(p_estado, '')), '')), 'ACTIVA'),
       p_tope_horas, p_aviso_horas, p_alarma_horas, p_dias_mantenimiento,
       nullif(btrim(coalesce(p_nota, '')), ''),
       p_combustible_id, p_capacidad_combustible,
       coalesce(nullif(btrim(coalesce(p_propietario, '')), ''), 'LACANTERA'),
       p_operador_id,
       coalesce(nullif(upper(btrim(coalesce(p_clase, ''))), ''), 'MAQUINA'),
       (select auth.uid()))
    returning id into v_id;

    insert into public.maquina_fotos (maquina_id, path, nota, orden, subida_por)
    select v_id, f.valor ->> 'path',
           nullif(btrim(coalesce(f.valor ->> 'nota', '')), ''),
           (f.orden * 10)::smallint, (select auth.uid())
      from jsonb_array_elements(p_fotos) with ordinality f(valor, orden)
     where nullif(btrim(coalesce(f.valor ->> 'path', '')), '') is not null;
  else
    update public.maquinaria
       set codigo = v_codigo, nombre = btrim(p_nombre), tipo = p_tipo,
           marca  = nullif(btrim(coalesce(p_marca, '')), ''),
           modelo = nullif(btrim(coalesce(p_modelo, '')), ''),
           serial = nullif(btrim(coalesce(p_serial, '')), ''),
           anio   = p_anio, almacen_id = p_almacen_id,
           tope_horas = p_tope_horas, aviso_horas = p_aviso_horas,
           alarma_horas = p_alarma_horas, dias_mantenimiento = p_dias_mantenimiento,
           nota = nullif(btrim(coalesce(p_nota, '')), ''),
           combustible_id = p_combustible_id,
           capacidad_combustible = p_capacidad_combustible,
           propietario = coalesce(nullif(btrim(coalesce(p_propietario, '')), ''), propietario),
           operador_id = p_operador_id,
           clase = coalesce(nullif(upper(btrim(coalesce(p_clase, ''))), ''), clase)
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'No existe la máquina %.', p_id using errcode = 'P0002';
    end if;
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe una máquina con el código %.', v_codigo using errcode = '23505';
end;
$function$;
