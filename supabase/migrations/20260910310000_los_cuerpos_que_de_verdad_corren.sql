/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  5 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
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
  viva —no normalizado, no perdonando comentarios— y los 5 coinciden. Y el
  detector, que antes marcaba estas 5, pasa a cero.

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

-- private.costo_promedio(p_almacen bigint, p_articulo bigint)
-- venia de: 20260910270000_el_dueno_viaja_con_el_material.sql
CREATE OR REPLACE FUNCTION private.costo_promedio(p_almacen bigint, p_articulo bigint)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when sum(cantidad * signo) > 0
              then round(sum(valor_usd * signo) / sum(cantidad * signo), 6)
              else 0 end
  from public.inventario_movimientos
  where almacen_id = p_almacen and articulo_id = p_articulo;
$function$;

-- private.existencia(p_almacen bigint, p_articulo bigint)
-- venia de: 20260910270000_el_dueno_viaja_con_el_material.sql
CREATE OR REPLACE FUNCTION private.existencia(p_almacen bigint, p_articulo bigint)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(sum(cantidad * signo), 0)
  from public.inventario_movimientos
  where almacen_id = p_almacen and articulo_id = p_articulo;
$function$;

-- private.existencia_para_escribir(p_almacen_id bigint, p_articulo_id bigint)
-- venia de: 20260910270000_el_dueno_viaja_con_el_material.sql
CREATE OR REPLACE FUNCTION private.existencia_para_escribir(p_almacen_id bigint, p_articulo_id bigint)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- El cerrojo es de transacción: se suelta solo al terminar, y hasta entonces
  -- nadie más puede leer este par almacén/artículo para escribir.
  perform pg_catalog.pg_advisory_xact_lock(p_almacen_id::int, p_articulo_id::int);
  return private.existencia(p_almacen_id, p_articulo_id);
end;
$function$;

-- private.registrar_movimiento(p_tipo text, p_signo integer, p_almacen bigint, p_articulo bigint, p_cantidad numeric, p_costo_usd numeric, p_nota text, p_orden bigint, p_renglon bigint, p_origen bigint, p_fecha date, p_empleado bigint, p_clase text, p_nota_salida text, p_aviso_costo numeric, p_cantidad_capturada numeric, p_unidad_capturada text, p_suelto_capturado numeric, p_costo_capturado numeric, p_costo_unidad_capturada text, p_moneda_capturada text, p_propietario text)
-- venia de: 20260910240000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION private.registrar_movimiento(p_tipo text, p_signo integer, p_almacen bigint, p_articulo bigint, p_cantidad numeric, p_costo_usd numeric, p_nota text DEFAULT NULL::text, p_orden bigint DEFAULT NULL::bigint, p_renglon bigint DEFAULT NULL::bigint, p_origen bigint DEFAULT NULL::bigint, p_fecha date DEFAULT NULL::date, p_empleado bigint DEFAULT NULL::bigint, p_clase text DEFAULT NULL::text, p_nota_salida text DEFAULT NULL::text, p_aviso_costo numeric DEFAULT NULL::numeric, p_cantidad_capturada numeric DEFAULT NULL::numeric, p_unidad_capturada text DEFAULT NULL::text, p_suelto_capturado numeric DEFAULT NULL::numeric, p_costo_capturado numeric DEFAULT NULL::numeric, p_costo_unidad_capturada text DEFAULT NULL::text, p_moneda_capturada text DEFAULT NULL::text, p_propietario text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_unidad text; v_id bigint; v_capacidad numeric; v_nombre text; v_hay numeric;
  v_dueno text; v_duenos text[];
begin
  if p_signo not in (-1, 1) then
    raise exception 'El signo de un movimiento solo puede ser +1 o -1 (recibido: %).', p_signo
      using errcode = '22023';
  end if;

  /*
    UN PATIO DE MAQUINAS NO GUARDA MATERIAL, y este es el unico sitio de toda la
    base que escribe en `inventario_movimientos` — comprobado contra pg_proc, no
    de memoria. Poniendo el cierre aqui lo heredan las catorce puertas del
    inventario y las que se escriban mañana.
  */
  if exists (select 1 from public.almacenes a
              where a.id = p_almacen and a.tipo = 'PATIO_MAQUINAS') then
    raise exception '«%» es un patio de maquinas: ahi no se guarda material.',
      (select nombre from public.almacenes where id = p_almacen)
      using errcode = '22023',
            hint = 'Sirve para decir donde se resguarda una maquina o un vehiculo, no para llevar existencias.';
  end if;

  select unidad into v_unidad from public.articulos where id = p_articulo;
  if v_unidad is null then
    raise exception 'No existe el artículo %.', p_articulo using errcode = 'P0002';
  end if;

  /*
    DE QUIEN ES LO QUE SE MUEVE. Ver el comentario de la columna: al entrar es
    del dueño del almacen salvo que se diga; al salir, del unico que haya; y si
    hay varios se para, porque adivinar seria inventar de quien era.
  */
  v_dueno := nullif(btrim(coalesce(p_propietario, '')), '');

  if v_dueno is null then
    if p_signo = 1 then
      select a.propietario into v_dueno from public.almacenes a where a.id = p_almacen;
      v_dueno := coalesce(v_dueno, 'LACANTERA');
    else
      select array_agg(distinct t.propietario) into v_duenos
        from (select m.propietario, sum(m.cantidad * m.signo) as saldo
                from public.inventario_movimientos m
               where m.almacen_id = p_almacen and m.articulo_id = p_articulo
               group by m.propietario
              having sum(m.cantidad * m.signo) > 0) t;

      if coalesce(array_length(v_duenos, 1), 0) = 1 then
        v_dueno := v_duenos[1];
      elsif coalesce(array_length(v_duenos, 1), 0) > 1 then
        raise exception 'Aqui hay material de varios dueños (%): hay que decir de cual sale.',
          array_to_string(v_duenos, ', ')
          using errcode = '22023',
                hint = 'Un mismo sitio puede guardar cosas de la casa y de otro; sacarlas sin decir de quien eran seria inventarlo.';
      else
        -- No hay saldo de nadie. El aviso de «no alcanza» lo da quien llama, con
        -- mejor contexto; aqui solo hace falta un dueño valido para el asiento.
        select a.propietario into v_dueno from public.almacenes a where a.id = p_almacen;
        v_dueno := coalesce(v_dueno, 'LACANTERA');
      end if;
    end if;
  end if;

  /*
    Y QUE ALCANCE LO DE ESE DUEÑO, no lo que hay en total. Solo se comprueba
    cuando el sitio tiene mezcla: en un sitio de un solo dueño el saldo suyo ES
    el total, y la comprobacion de quien llama ya lo cubrio con mejor mensaje.
  */
  -- Siempre en las salidas, lo diga quien lo diga: la version anterior solo
  -- comprobaba cuando el dueño se habia resuelto solo, que es justo el caso en
  -- que no hace falta.
  if p_signo = -1 then
    select coalesce(sum(m.cantidad * m.signo), 0) into v_hay
      from public.inventario_movimientos m
     where m.almacen_id = p_almacen and m.articulo_id = p_articulo
       and m.propietario = v_dueno;
    if v_hay < p_cantidad then
      select nombre into v_nombre from public.articulos where id = p_articulo;
      raise exception 'De «%» ahi solo hay % de ese dueño: no alcanza para %.',
        v_nombre, private.cantidad_es(v_hay), private.cantidad_es(p_cantidad)
        using errcode = '55000';
    end if;
  end if;

  if p_signo = 1 then
    select capacidad, nombre into v_capacidad, v_nombre from public.almacenes where id = p_almacen;
    if v_capacidad is not null then
      perform pg_catalog.pg_advisory_xact_lock(p_almacen::int, 0);
      select coalesce(sum(m.cantidad * m.signo), 0) into v_hay
        from public.inventario_movimientos m
       where m.almacen_id = p_almacen and m.unidad = v_unidad;
      if v_hay + p_cantidad > v_capacidad then
        raise exception 'En "%" caben % % y ya hay %: no entran % más.',
          v_nombre, private.cantidad_es(v_capacidad), v_unidad, private.cantidad_es(v_hay), private.cantidad_es(p_cantidad)
          using errcode = '22023', hint = format('Quedan %s libres.', private.cantidad_es(v_capacidad - v_hay));
      end if;
    end if;
  end if;

  /*
    Todo esto se escribe AQUI y no despues con un update, porque el libro es
    inmutable: `trg_movimientos_inmutables` rechaza UPDATE y DELETE. Un dato del
    movimiento nace con el movimiento.

    COMO SE CONTO, ADEMAS DE CUANTO ES. `cantidad` es siempre la unidad de
    operacion —de ahi salen la existencia y todos los calculos— y al lado queda
    lo que la persona dijo: «7 TAMBOR + 10 L». Se guarda el trio entero y no se
    deriva ninguno de los otros dos, porque `unidades_por_presentacion` puede
    cambiar en el catalogo y entonces el movimiento viejo contaria una mentira
    nueva. Un asiento tiene que poder leerse dentro de diez anos sin depender de
    una tabla que se edita.
  */
  insert into public.inventario_movimientos
    (numero, fecha, tipo, signo, almacen_id, articulo_id, cantidad, unidad,
     costo_usd, orden_id, orden_renglon_id, movimiento_origen, nota, empleado_id,
     entrega_clase, registrado_por, nota_salida, aviso_costo, propietario,
     cantidad_capturada, unidad_capturada, suelto_capturado, costo_capturado, costo_unidad_capturada, moneda_capturada)
  values
    (private.siguiente_numero('MOV'), coalesce(p_fecha, current_date), p_tipo, p_signo,
     p_almacen, p_articulo, p_cantidad, v_unidad, coalesce(p_costo_usd, 0),
     p_orden, p_renglon, p_origen, nullif(trim(coalesce(p_nota, '')), ''), p_empleado,
     p_clase, (select auth.uid()), p_nota_salida, p_aviso_costo, v_dueno,
     nullif(p_cantidad_capturada, 0),
     nullif(btrim(coalesce(p_unidad_capturada, '')), ''),
     nullif(p_suelto_capturado, 0),
     p_costo_capturado,
     nullif(btrim(coalesce(p_costo_unidad_capturada, '')), ''),
     nullif(btrim(coalesce(p_moneda_capturada, '')), ''))
  returning id into v_id;

  return v_id;
end;
$function$;

-- public.transferir_existencia(p_origen_id bigint, p_destino_id bigint, p_articulo_id bigint, p_cantidad numeric, p_motivo text, p_fecha date, p_presentaciones numeric, p_presentacion text, p_suelto numeric, p_propietario text)
-- venia de: 20260910140000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.transferir_existencia(p_origen_id bigint, p_destino_id bigint, p_articulo_id bigint, p_cantidad numeric, p_motivo text, p_fecha date DEFAULT NULL::date, p_presentaciones numeric DEFAULT NULL::numeric, p_presentacion text DEFAULT NULL::text, p_suelto numeric DEFAULT NULL::numeric, p_propietario text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_origen public.almacenes; v_destino public.almacenes;
  v_existencia numeric; v_costo numeric; v_articulo text; v_salida bigint;
  v_cantidad numeric; v_nombre_pres text; v_dueno text; v_duenos text[];
begin
  perform private.exigir_rol('ALMACEN');

  if p_origen_id = p_destino_id then
    raise exception 'El origen y el destino son el mismo almacén.' using errcode = '22023';
  end if;

  select * into v_origen  from public.almacenes where id = p_origen_id;
  select * into v_destino from public.almacenes where id = p_destino_id;

  if v_origen.id is null then
    raise exception 'No existe el almacén de origen %.', p_origen_id using errcode = 'P0002';
  end if;
  if v_destino.id is null then
    raise exception 'No existe el almacén de destino %.', p_destino_id using errcode = 'P0002';
  end if;

  if not v_destino.activo then
    raise exception 'El almacén "%" está inactivo y no puede recibir material.', v_destino.nombre
      using errcode = '22023';
  end if;

  /*
    LA CUENTA LA HACE LA BASE, no el navegador.

    `en_unidad_base` es el mismo ayudante que usan la entrada y la salida, así
    que «2 tambores y 10 L» significa lo mismo en las tres puertas. Si se manda
    presentación, manda ella; si no, se toma la cifra pelada de siempre, que es
    lo que sigue enviando quien mueve algo que no tiene envases declarados.
  */
  if nullif(btrim(coalesce(p_presentacion, '')), '') is not null
     and coalesce(p_presentaciones, 0) > 0 then
    /*
      QUIEN VALIDA ES `en_unidad_base`, Y ESTO LO ENSEÑÓ LA PRUEBA DE HUMO.

      La primera versión de esta puerta preguntaba antes por
      `private.presentacion_usada`, y estaba mal: ese ayudante NO valida, RESUELVE
      — si la presentación pedida no está declarada, se cae a la del artículo—.
      Con eso, pedir «1 garrafa» de un aceite que se cuenta en pailas movía una
      paila y no decía nada. Una sustitución silenciosa en una puerta de
      inventario es peor que un error: el asiento queda bien formado y mintiendo.

      `en_unidad_base` sí rechaza —«no se cuenta en GARRAFA, esa presentación no
      está declarada o está apagada»— y además es el mismo ayudante que usan la
      entrada y la salida, así que las tres puertas aceptan y rechazan lo mismo.
      El nombre canónico se toma después, cuando la conversión ya dijo que sí.
    */
    v_cantidad := private.en_unidad_base(
                    p_articulo_id, p_presentaciones, coalesce(p_suelto, 0), p_presentacion);
    v_nombre_pres := upper(btrim(p_presentacion));
  else
    v_cantidad := p_cantidad;
  end if;

  if coalesce(v_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se mueve. Un traslado sin motivo no se puede auditar.'
      using errcode = '22023';
  end if;

  /*
    LA REJA DEL TANQUE SIN COSTO, QUE AQUI FALTABA.

    El material sale al `costo_promedio` de su origen. En un almacen marcado
    `admite_sin_costo` ese promedio es cero por diseno, asi que un traslado
    desde ahi mete ceros en el destino y le hunde el promedio — justo lo que
    `registrar_entrada` impide por la otra puerta. Lo encontro el carril de
    base de datos el 7/09/2026; yo di esta reja por cerrada el 31/08 y lo
    estaba solo en la puerta que mire.
  */
  if coalesce(v_origen.admite_sin_costo, false)
     and not coalesce(v_destino.admite_sin_costo, false) then
    raise exception 'De "%" no se puede trasladar a "%": lo que hay ahí entró sin costo y hundiría el costo promedio del destino.',
      v_origen.nombre, v_destino.nombre
      using errcode = '22023',
            hint = 'Antes hay que decidir a qué precio se valora lo que trasladó la otra empresa. Mientras no se decida, el traslado escribiría un cero que después no se puede distinguir de un precio real.';
  end if;

  if not coalesce(v_origen.admite_sin_costo, false)
     and coalesce(v_destino.admite_sin_costo, false) then
    raise exception 'A "%" solo entra lo que no costó nada, y lo que sale de "%" tiene precio.',
      v_destino.nombre, v_origen.nombre
      using errcode = '22023',
            hint = 'Ese almacén lleva aparte lo que no le costó nada a esta empresa. Metiendo ahí material con precio se pierde su valor y el nombre del tanque deja de ser verdad.';
  end if;

  /*
    DE QUIEN ES LO QUE SE MUEVE.

    Un traslado NO cambia de dueño: lo lleva. Antes esto era una prohibicion
    —«lo de un dueño no se mezcla con lo de otro»— y tenia sentido cuando el
    dueño lo ponia el sitio, porque entonces llegar a un almacen nuestro era
    volverse nuestro. Ahora el dueño viaja, asi que la bomba de la gobernacion
    puede estar en nuestro taller sin dejar de ser suya.

    Si no se dice de quien, se mira que hay en el origen: con un solo dueño no
    hay nada que preguntar, con varios se para. Es el mismo criterio que aplica
    `registrar_movimiento`, para que las dos capas digan lo mismo.
  */
  v_dueno := nullif(btrim(coalesce(p_propietario, '')), '');

  if v_dueno is null then
    select array_agg(distinct t.propietario) into v_duenos
      from (select m.propietario, sum(m.cantidad * m.signo) as saldo
              from public.inventario_movimientos m
             where m.almacen_id = p_origen_id and m.articulo_id = p_articulo_id
             group by m.propietario
            having sum(m.cantidad * m.signo) > 0) t;

    if coalesce(array_length(v_duenos, 1), 0) > 1 then
      raise exception 'En "%" hay material de varios dueños (%): hay que decir de cual se traslada.',
        v_origen.nombre, array_to_string(v_duenos, ', ')
        using errcode = '22023';
    end if;
    v_dueno := coalesce(v_duenos[1], v_origen.propietario, 'LACANTERA');
  end if;

  /* El cerrojo se toma igual; lo que cambia es que el saldo es el de ese dueño. */
  v_existencia := private.existencia_para_escribir(p_origen_id, p_articulo_id, v_dueno);

  if v_cantidad > v_existencia then
    select nombre into v_articulo from public.articulos where id = p_articulo_id;
    raise exception 'En "%" solo hay % de "%" de ese dueño y se intentan mover %.',
      v_origen.nombre, private.numero_es(v_existencia, 4),
      coalesce(v_articulo, p_articulo_id::text), private.numero_es(v_cantidad, 4)
      using errcode = '22023';
  end if;

  /*
    EL COSTO ES EL DEL DUEÑO Y NO EL DEL SITIO. Tres bombas nuestras a 10 y ocho
    suyas a 40 no promedian a nada que sirva para valorar ninguna: sacar una suya
    al promedio mezclado le regala valor a un lado y se lo quita al otro, y el
    destino hereda el error.
  */
  v_costo := private.costo_promedio(p_origen_id, p_articulo_id, v_dueno);

  /*
    LAS DOS PATAS LLEVAN LA MISMA MARCA: son los mismos tambores subiendo y
    bajando de la misma camioneta. Con una sola marcada, la mitad de la
    operación quedaría sin explicar.
  */
  v_salida := private.registrar_movimiento(
    p_tipo => 'TRANSFERENCIA_SALIDA', p_signo => (-1)::smallint,
    p_almacen => p_origen_id, p_articulo => p_articulo_id,
    p_cantidad => v_cantidad, p_costo_usd => v_costo,
    p_nota => format('Traslado a %s. %s', v_destino.nombre, p_motivo),
    p_fecha => p_fecha,
    p_cantidad_capturada => case when v_nombre_pres is not null then p_presentaciones end,
    p_unidad_capturada   => v_nombre_pres,
    p_suelto_capturado   => case when v_nombre_pres is not null then nullif(p_suelto, 0) end,
    p_propietario        => v_dueno);

  perform private.registrar_movimiento(
    p_tipo => 'TRANSFERENCIA_ENTRADA', p_signo => (1)::smallint,
    p_almacen => p_destino_id, p_articulo => p_articulo_id,
    p_cantidad => v_cantidad, p_costo_usd => v_costo,
    p_nota => format('Traslado desde %s. %s', v_origen.nombre, p_motivo),
    p_origen => v_salida, p_fecha => p_fecha,
    p_cantidad_capturada => case when v_nombre_pres is not null then p_presentaciones end,
    p_unidad_capturada   => v_nombre_pres,
    p_suelto_capturado   => case when v_nombre_pres is not null then nullif(p_suelto, 0) end,
    p_propietario        => v_dueno);

  return v_salida;
end;
$function$;
