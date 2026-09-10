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

-- private.registrar_movimiento(p_tipo text, p_signo integer, p_almacen bigint, p_articulo bigint, p_cantidad numeric, p_costo_usd numeric, p_nota text, p_orden bigint, p_renglon bigint, p_origen bigint, p_fecha date, p_empleado bigint, p_clase text, p_nota_salida text, p_aviso_costo numeric, p_cantidad_capturada numeric, p_unidad_capturada text, p_suelto_capturado numeric, p_costo_capturado numeric, p_costo_unidad_capturada text, p_moneda_capturada text, p_propietario text)
-- venia de: 20260910310000_los_cuerpos_que_de_verdad_corren.sql
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
     p_almacen, p_articulo, p_cantidad, v_unidad, p_costo_usd, -- un hueco es un hueco
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

-- public.registrar_entrada(p_almacen_id bigint, p_articulo_id bigint, p_cantidad numeric, p_costo_usd numeric, p_motivo text, p_referencia text, p_fecha date, p_sin_costo boolean, p_confirmado boolean, p_sin_valor boolean)
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.registrar_entrada(p_almacen_id bigint, p_articulo_id bigint, p_cantidad numeric, p_costo_usd numeric, p_motivo text, p_referencia text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date, p_sin_costo boolean DEFAULT false, p_confirmado boolean DEFAULT false, p_sin_valor boolean DEFAULT false)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c_factor constant numeric := 10;
  v_nota text; v_admite boolean; v_ref numeric; v_veces numeric; v_nombre text; v_msg text;
begin
  perform private.exigir_rol('ALMACEN');

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad que entra tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if p_sin_costo and p_sin_valor then
    raise exception '«No costo nada» y «no se sabe cuanto vale» no pueden ser las dos ciertas.'
      using errcode = '22023',
            hint = 'Lo primero es un cero comprobable —lo pago otra empresa—; lo segundo es que no hay cifra. Elige una.';
  end if;

  select a.admite_sin_costo into v_admite from public.almacenes a where a.id = p_almacen_id;

  if p_sin_costo then
    if not coalesce(v_admite, false) then
      raise exception 'Aquí no entra material sin costo: se hundiría el costo promedio de lo que ya hay.'
        using errcode = '22023', hint = 'Mételo en el tanque de combustible inicial, que es el que lo lleva aparte.';
    end if;
    if coalesce(p_costo_usd, 0) <> 0 then
      raise exception 'Si el material no costó nada para esta empresa, el costo tiene que ir en cero. Quita la marca o pon el costo en cero.'
        using errcode = '22023';
    end if;
    if length(btrim(coalesce(p_motivo, ''))) < 15 then
      raise exception 'Una entrada sin costo hay que explicarla entera: de dónde vino y quién asumió el gasto. Dentro de un año esa nota es lo único que lo va a contestar.'
        using errcode = '22023';
    end if;
  elsif coalesce(v_admite, false) then
    raise exception 'Aquí solo entra lo que no costó nada. Lo que tiene precio va al tanque de siempre.'
      using errcode = '22023';
  elsif p_sin_valor then
    -- No se declara valor. No es cero: el hueco se guarda como hueco y queda
    -- fuera del promedio, en los dos lados de la division.
    null;
  elsif coalesce(p_costo_usd, 0) <= 0 then
    raise exception 'Hay que decir cuánto costó la unidad. Si el gasto lo asumió otra empresa del grupo, marca «no costó nada para esta empresa» y explica de dónde vino.'
      using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Una entrada sin explicación no se puede auditar después. Escribe de dónde vino.'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.almacenes where id = p_almacen_id and activo) then
    raise exception 'Ese almacén no existe o está inactivo.' using errcode = '23503';
  end if;
  if not exists (select 1 from public.articulos where id = p_articulo_id and activo) then
    raise exception 'Ese artículo no existe o está inactivo.' using errcode = '23503';
  end if;

  /*
    EL AVISO. Solo cuando hay un promedio anterior contra el que comparar: en la
    primera entrada de un articulo no hay referencia y esto no protege. Ese caso
    lo cubre la pantalla, ensenando la cuenta hecha mientras se teclea — y es el
    de los cinco aceites del 5 de septiembre, que entraban por primera vez.

    EL MENSAJE NO DICE LO QUE ESA PERSONA NO PUEDE VER. `v_existencias` esconde
    el costo promedio a quien no tiene INVENTARIO.VER_VALORACION, y el rol
    ALMACEN —justo quien registra las entradas— NO lo tiene. Decirle «viene
    costando 6.074,64» le entregaria por la puerta de atras el dato que la vista
    le niega; y decirle solo el factor tampoco vale, porque sabe lo que tecleo y
    dividiendo llega al mismo sitio. A quien no puede verlo se le dice QUE se
    sale, no CUANTO. Sigue siendo accionable: comprueba la factura.
  */
  if not p_sin_costo and not p_sin_valor and coalesce(p_costo_usd, 0) > 0 then
    v_ref := private.costo_promedio(p_almacen_id, p_articulo_id);
    if coalesce(v_ref, 0) > 0 then
      v_veces := round(p_costo_usd / v_ref, 6);
      if v_veces >= c_factor or v_veces <= (1 / c_factor) then
        if not p_confirmado then
          select nombre into v_nombre from public.articulos where id = p_articulo_id;
          v_msg := case when private.puede_accion('INVENTARIO.VER_VALORACION')
            then format('%s viene costando %s por unidad y lo estás metiendo a %s: son %s. Si es correcto, acéptalo y quedará anotado.',
                        v_nombre, private.numero_es(v_ref, 4),
                        private.numero_es(p_costo_usd, 4), case when v_veces >= 1 then private.numero_es(v_veces, 2) || ' veces mas'
                   else private.numero_es(v_ref / nullif(p_costo_usd, 0), 2) || ' veces menos' end)
            else format('El costo de %s se sale mucho de lo que ese artículo viene costando. Compruébalo con la factura; si es correcto, acéptalo y quedará anotado.',
                        v_nombre)
          end;
          raise exception '%', v_msg
            using errcode = '22023',
                  hint = 'Comprueba la factura y la moneda antes de aceptar: un cero de más aquí se arrastra a cada salida.';
        end if;
      else
        v_veces := null;
      end if;
    end if;
  end if;

  v_nota := btrim(p_motivo);
  if nullif(btrim(coalesce(p_referencia, '')), '') is not null then
    v_nota := v_nota || ' · Ref.: ' || btrim(p_referencia);
  end if;
  if p_sin_valor then
    v_nota := v_nota || ' · Sin valor declarado: entró sin cifra y queda pendiente de valorar.';
  end if;

  if p_sin_costo then
    v_nota := v_nota || ' · Sin costo para esta empresa: el gasto lo asumió otra.';
  end if;

  return private.registrar_movimiento(
    'ENTRADA_DIRECTA', 1::smallint, p_almacen_id, p_articulo_id, p_cantidad,
    case when p_sin_valor then null else coalesce(p_costo_usd, 0) end,
    v_nota, null, null, null, p_fecha,
    p_aviso_costo => v_veces);
end;
$function$;
