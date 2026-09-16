/*
  LOS CAMIONES LOS GOBIERNA MAQUINARIA.

  Christopher, 16/09/2026: la maquinaria y los vehículos se llevan en una sola
  pantalla, como en el otro sistema que ya usa — dos tablas, un solo catálogo.
  La pantalla de Vehículos sale de Despachos y entra en Maquinaria › Equipos.

  NO SE MUEVE NINGUNA FILA. Las dos tablas siguen siendo dos: a `vehiculos` le
  cuelgan siete tablas (viajes, pesajes, guías, notas de entrega, salidas de
  planta, choferes y el centro de costo, con viajes ya aceptados), y un viaje
  de máquina propia no se paga mientras uno de camión sí. Fusionarlas sería
  reescribir todo eso para ganar nada que no dé la pantalla.

  LO QUE CAMBIA ES QUIÉN PUEDE, Y NADIE PIERDE NADA:

  - Dar de alta un camión, corregir su placa, tipo, descripción, nota o sacarlo
    de servicio, y asignarle chofer: ahora basta Maquinaria en escritura (hoy
    Operaciones y Almacén), además de lo que ya valía — Despachos en escritura
    o las casillas DESPACHOS.EDITAR_VEHICULO / DESPACHOS.ASIGNAR_CHOFER.
    Las casillas cuentan también cuando llegan por autorización: antes estas
    funciones pedían el MÓDULO Despachos y una autorización no alcanzaba, así
    que quien la tenía podía fijar la carga útil y no guardar el camión.

  - Lo que mueve dinero sigue pidiendo la casilla. Cambiarle a un camión que
    ya existe de quién es, si es propio, cuánto le cabe o su ficha de
    mantenimiento decide a quién se le pagan los viajes siguientes y cuántos
    metros cúbicos admite cada uno. Eso pide DESPACHOS.EDITAR_VEHICULO (o
    Despachos en escritura), no Maquinaria a secas. La carga útil y eliminar
    no se tocan: siguen con sus casillas.

  - La hoja de vida se lee con Maquinaria, con Despachos o con la casilla de
    ver vehículos. Sus enlaces apuntan a Maquinaria.

  - Bajar la capacidad por debajo de la carga útil daba el check crudo de la
    tabla. Ahora lo dice en español.

  Parche anclado: cada texto se busca en el cuerpo vivo y tiene que aparecer
  las veces esperadas. Si alguien tocó la función entretanto, no se aplica nada.
*/

do $parche$
declare
  v_def text;
  r     record;
begin
  for r in
    select * from (values
      -- 1. Guardar: quién puede.
      ('public.guardar_vehiculo(bigint, text, text, numeric, text, numeric, boolean, text, bigint, boolean, text)', 1,
       $a$  perform private.exigir_permiso('DESPACHOS', 'ESCRITURA');$a$,
       $b$  -- LOS CAMIONES LOS GOBIERNA MAQUINARIA: basta su escritura, además de lo
  -- que ya valía. Una autorización sobre la casilla también cuenta.
  if not (private.tiene_permiso('MAQUINARIA', 'ESCRITURA')
          or private.tiene_permiso('DESPACHOS', 'ESCRITURA')
          or private.puede_accion('DESPACHOS.EDITAR_VEHICULO')) then
    perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');
  end if;$b$),

      -- 2. Guardar: lo que mueve dinero pide la casilla.
      ('public.guardar_vehiculo(bigint, text, text, numeric, text, numeric, boolean, text, bigint, boolean, text)', 1,
       $a$  if p_id is null then
    insert into public.vehiculos$a$,
       $b$  if p_id is not null then
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
    insert into public.vehiculos$b$),

      -- 3. Choferes.
      ('public.asignar_chofer(bigint, bigint, text, text, date, text, text)', 1,
       $a$  perform private.exigir_permiso('DESPACHOS', 'ESCRITURA');$a$,
       $b$  if not (private.tiene_permiso('MAQUINARIA', 'ESCRITURA')
          or private.tiene_permiso('DESPACHOS', 'ESCRITURA')
          or private.puede_accion('DESPACHOS.ASIGNAR_CHOFER')) then
    perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');
  end if;$b$),

      ('public.terminar_chofer(bigint, date, text)', 1,
       $a$  perform private.exigir_permiso('DESPACHOS', 'ESCRITURA');$a$,
       $b$  if not (private.tiene_permiso('MAQUINARIA', 'ESCRITURA')
          or private.tiene_permiso('DESPACHOS', 'ESCRITURA')
          or private.puede_accion('DESPACHOS.ASIGNAR_CHOFER')) then
    perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');
  end if;$b$),

      -- 4. La hoja de vida.
      ('public.historial_vehiculo(bigint, integer)', 1,
       $a$  perform private.exigir_permiso('DESPACHOS', 'LECTURA');$a$,
       $b$  if not (private.tiene_permiso('MAQUINARIA', 'LECTURA')
          or private.tiene_permiso('DESPACHOS', 'LECTURA')
          or private.puede_accion('DESPACHOS.VER_VEHICULOS')) then
    perform private.exigir_permiso('MAQUINARIA', 'LECTURA');
  end if;$b$),

      ('public.historial_vehiculo(bigint, integer)', 3,
       $a$'/app/despachos/vehiculos'$a$,
       $b$'/app/maquinaria'$b$)
    ) as t(funcion, veces, antes, despues)
  loop
    v_def := pg_get_functiondef(r.funcion::regprocedure);
    if (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes) <> r.veces then
      raise exception 'El cuerpo vivo de % no es el esperado: el anclaje no aparece % vez/veces.',
        r.funcion, r.veces using errcode = '22023';
    end if;
    execute replace(v_def, r.antes, r.despues);
  end loop;
end
$parche$;

-- 5. Lo que dicen las casillas, ahora que la pantalla vive en Maquinaria.
update public.acciones
   set dice = 'Placa, tipo y cuántos metros cúbicos carga — esa capacidad es la que se usa para saber cuánto cabe en cada viaje. Los camiones viven en Maquinaria › Equipos: con Maquinaria en escritura se dan de alta y se corrigen placa, tipo, descripción y nota. Esta casilla hace falta además para cambiar de quién es un camión que ya existe, lo que le cabe o su ficha de mantenimiento, porque eso decide a quién se le pagan sus viajes.'
 where codigo = 'DESPACHOS.EDITAR_VEHICULO';

update public.acciones
   set dice = 'Poner un chofer nuevo cierra el período del anterior; también se puede cerrar sin poner sustituto. El chofer puede ser un empleado o alguien de fuera anotado a mano. Se hace desde la ficha del camión en Maquinaria, y también lo puede quien tiene Maquinaria en escritura.'
 where codigo = 'DESPACHOS.ASIGNAR_CHOFER';

update public.acciones
   set dice = 'La ficha de cada camión en Maquinaria, su capacidad, todo lo que ha cargado y quién lo ha manejado en cada fecha. Quien tiene Maquinaria la ve sin esta casilla.'
 where codigo = 'DESPACHOS.VER_VEHICULOS';

-- 6. Comprobado al aplicar.
do $ver$
declare
  v_def text;
  r     record;
begin
  for r in
    select * from (values
      ('public.guardar_vehiculo(bigint, text, text, numeric, text, numeric, boolean, text, bigint, boolean, text)', 'DESPACHOS.EDITAR_VEHICULO'),
      ('public.asignar_chofer(bigint, bigint, text, text, date, text, text)', 'DESPACHOS.ASIGNAR_CHOFER'),
      ('public.terminar_chofer(bigint, date, text)', 'DESPACHOS.ASIGNAR_CHOFER'),
      ('public.historial_vehiculo(bigint, integer)', 'DESPACHOS.VER_VEHICULOS')
    ) as t(funcion, casilla)
  loop
    v_def := pg_get_functiondef(r.funcion::regprocedure);
    if strpos(v_def, 'tiene_permiso(''MAQUINARIA''') = 0 or strpos(v_def, r.casilla) = 0 then
      raise exception '% no quedó aceptando Maquinaria y su casilla.', r.funcion using errcode = '22023';
    end if;
    if strpos(v_def, 'exigir_permiso(''DESPACHOS''') > 0 then
      raise exception '% sigue exigiendo el módulo Despachos.', r.funcion using errcode = '22023';
    end if;
  end loop;

  if strpos(pg_get_functiondef('public.historial_vehiculo(bigint, integer)'::regprocedure), '/app/despachos/vehiculos') > 0 then
    raise exception 'historial_vehiculo sigue enlazando a Despachos.' using errcode = '22023';
  end if;

  if strpos(pg_get_functiondef('public.guardar_vehiculo(bigint, text, text, numeric, text, numeric, boolean, text, bigint, boolean, text)'::regprocedure),
            'Baja primero la carga útil') = 0 then
    raise exception 'guardar_vehiculo no quedó cuidando la carga útil.' using errcode = '22023';
  end if;
end
$ver$;
