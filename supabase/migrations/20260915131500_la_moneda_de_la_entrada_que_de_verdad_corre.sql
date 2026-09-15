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

-- public.registrar_entradas(p_almacen_id bigint, p_renglones jsonb, p_motivo text, p_referencia text, p_fecha date)
-- venia de: 20260914090000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.registrar_entradas(p_almacen_id bigint, p_renglones jsonb, p_motivo text, p_referencia text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c_factor constant numeric := 10;
  v_r jsonb; v_n int := 0; v_articulo bigint; v_cantidad numeric; v_costo numeric;
  v_moneda text; v_costo_usd numeric; v_tasa numeric; v_tasa_usd numeric;
  v_nota text; v_nombre text; v_ref numeric; v_veces numeric; v_msg text;
  v_pres numeric; v_sueltas numeric; v_por_pres numeric; v_unidad_pres text;
  v_nombre_pres text; v_dueno text; v_sin_valor boolean; v_tecleado numeric;
begin
  perform private.exigir_rol('ALMACEN');

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'No hay nada que meter: la entrada no trae renglones.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Una entrada sin explicación no se puede auditar después. Escribe de dónde vino.'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.almacenes where id = p_almacen_id and activo) then
    raise exception 'Ese almacén no existe o está inactivo.' using errcode = '23503';
  end if;

  /*
    Un almacen que admite material sin costo lleva su promedio aparte, y ese es
    el motivo de que exista. Meterle material con precio por esta puerta lo
    contamina igual que sacarlo por la otra.
  */
  if exists (select 1 from public.almacenes
              where id = p_almacen_id and coalesce(admite_sin_costo, false)) then
    raise exception 'En «%» solo entra material que esta empresa no pagó, y por eso lleva su costo aparte.'
      , (select nombre from public.almacenes where id = p_almacen_id)
      using errcode = '22023',
            hint = 'Para meter ahí, usa «Cargar combustible al tanque» marcando «no costó nada para esta empresa». Lo que sí costó va a otro almacén.';
  end if;

  v_nota := btrim(p_motivo);
  if nullif(btrim(coalesce(p_referencia, '')), '') is not null then
    v_nota := v_nota || ' · Ref.: ' || btrim(p_referencia);
  end if;

  for v_r in select * from jsonb_array_elements(p_renglones) loop
    v_n := v_n + 1;
    v_veces := null;

    v_articulo := nullif(btrim(coalesce(v_r->>'articulo_id', '')), '')::bigint;
    v_sueltas  := coalesce(nullif(btrim(coalesce(v_r->>'cantidad', '')), '')::numeric, 0);
    v_pres     := coalesce(nullif(btrim(coalesce(v_r->>'presentaciones', '')), '')::numeric, 0);
    v_costo    := coalesce(nullif(btrim(coalesce(v_r->>'costo', '')), '')::numeric, 0);
    -- Sin moneda no se supone ninguna: ver la comprobación de más abajo.
    v_moneda   := upper(nullif(btrim(coalesce(v_r->>'moneda', '')), ''));
    v_sin_valor := coalesce((v_r->>'sin_valor')::boolean, false);

    /*
      DE QUIEN ES LO QUE ENTRA.

      Vacio NO es LACANTERA: es «el del almacen». `registrar_movimiento` ya
      resuelve esa parte —al entrar es del dueño del sitio salvo que se diga— y
      repetir la regla aqui seria tener dos sitios que opinan de lo mismo.

      Decirlo hace falta desde que el dueño viaja con el material: el inventario
      de la gobernacion se esta cargando renglon a renglon, y sus cosas pueden
      acabar en un almacen nuestro sin dejar de ser suyas.
    */
    v_dueno := nullif(btrim(coalesce(v_r->>'propietario', '')), '');

    select nombre, presentacion, unidades_por_presentacion
      into v_nombre, v_unidad_pres, v_por_pres
      from public.articulos where id = v_articulo and activo;
    if v_nombre is null then
      raise exception 'El renglón %: ese artículo no existe o está inactivo.', v_n using errcode = '23503';
    end if;

    if v_dueno is not null then
      v_dueno := upper(v_dueno);
      if not exists (select 1 from public.propietarios where codigo = v_dueno and activo) then
        raise exception 'El renglón % (%): «%» no es un dueño registrado. Los que hay: %.',
          v_n, v_nombre, v_dueno,
          (select string_agg(codigo, ', ' order by codigo) from public.propietarios where activo)
          using errcode = '23503';
      end if;
    end if;

    /*
      SIETE TAMBORES Y DIEZ LITROS. La cuenta la hace la base y no el navegador,
      que es lo que pidio Christopher: «asi el sistema tiene nocion en todo
      momento sobre lo que hay o no hay en sus presentaciones».
    */
    -- En que presentacion se conto este renglon. Nula: la de por defecto.
    v_nombre_pres := nullif(btrim(coalesce(v_r->>'presentacion', '')), '');
    v_cantidad := private.en_unidad_base(v_articulo, v_pres, v_sueltas, v_nombre_pres);

    if v_cantidad <= 0 then
      raise exception 'El renglón % (%): la cantidad tiene que ser mayor que cero.', v_n, v_nombre using errcode = '22023';
    end if;
    /*
      TRES CAMINOS, NO DOS: SE SABE, NO COSTO NADA, O NO SE SABE.

      Esta reja solo conocia los dos primeros y mandaba el tercero al ajuste de
      conteo, que valora heredando el promedio del almacen — o sea que le pone
      un precio inventado a algo cuyo precio nadie tiene. La puerta de un solo
      renglon ya distinguia los tres desde el 11/09; esta se quedo sin ello, y
      es justo la que se usa para cargar el inventario.

      NO SE SABE NO ES CERO. Cero dice que no vale nada y hunde el promedio de
      lo que ya hay. Sin valor guarda el hueco COMO HUECO: nulo, fuera del
      promedio en los dos lados de la division, y contado aparte en
      `existencia_sin_valorar` para que una valoracion a medias no se lea como
      completa.
    */
    if not v_sin_valor and v_costo <= 0 then
      raise exception 'El renglón % (%): hay que decir cuánto costó la unidad, o marcar que no se sabe cuánto vale.', v_n, v_nombre
        using errcode = '22023',
              hint = 'Si el precio existe pero nadie lo tiene a mano, marca «no se sabe cuánto costó» en ese renglón: entra sin cifra y queda pendiente de valorar.';
    end if;

    /*
      LA MONEDA NO SE SUPONE. Antes se rellenaba con USD, y la pantalla hacía
      nacer cada renglón en dólares: así entró a 39.332,15 dólares una cafetera
      con factura en bolívares.
    */
    if not v_sin_valor and v_moneda is null then
      raise exception 'El renglón % (%): falta decir en qué moneda está el costo.', v_n, v_nombre
        using errcode = '22023',
              hint = 'Elige la moneda de la factura. El sistema la convierte a dólares con la tasa del día.';
    end if;

    -- La cifra tal como se tecleó, antes de repartirla entre lo que trae el bulto.
    v_tecleado := v_costo;

    /*
      EL COSTO LLEVA SU PROPIA UNIDAD, que no tiene por que ser la misma que la
      cantidad. Alguien cuenta en tambores y conoce el precio por litro, o al
      reves. Sin `costo_por_presentacion` se entiende por unidad de operacion,
      que es como se ha llamado siempre a esta funcion.

      Se DIVIDE, al reves que la cantidad: el precio del bulto repartido entre
      lo que trae.
    */
    if coalesce((v_r->>'costo_por_presentacion')::boolean, false) then
      -- El divisor sale de la MISMA presentacion que nombro el renglon, no de
      -- la de por defecto: si no, «3 BIDON a 130 el bidon» divide entre 208.
      declare v_factor numeric := private.en_unidad_base(v_articulo, 1, 0, v_nombre_pres);
      begin
        if coalesce(v_factor, 0) <= 0 then
          raise exception 'El renglón % (%): no se puede dar el costo por presentación porque el catálogo no dice cuántas unidades trae.', v_n, v_nombre
            using errcode = '22023';
        end if;
        v_costo := v_costo / v_factor;
      end;
    end if;

    if v_sin_valor then
      /*
        Sin cifra no hay nada que convertir, y pedir la tasa del dia pararia la
        carga por una razon que no tiene nada que ver con este renglon: se esta
        cargando un inventario viejo, y la tasa que falta es la de hoy.
      */
      v_costo_usd := null;
    else
      select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd
        from private.tasas_del_dia(v_moneda, coalesce(p_fecha, current_date)) t;
      if v_tasa is null or coalesce(v_tasa_usd, 0) = 0 then
        raise exception 'El renglón % (%): no hay tasa cargada para % en esa fecha, así que no se puede saber cuánto costó.', v_n, v_nombre, v_moneda using errcode = '22023';
      end if;

      v_costo_usd := round(v_costo * v_tasa / v_tasa_usd, 6);
    end if;

    /*
      EL AVISO DEL COSTO RARO, RENGLON A RENGLON. La confirmacion viaja EN EL
      RENGLON: con quince renglones, un unico «confirmo» aceptaria a ciegas los
      catorce que nadie miro.
    */
    v_ref := private.costo_promedio(p_almacen_id, v_articulo);

    /*
      LA PRIMERA VEZ NO HAY CONTRA QUE COMPARAR, Y ES CUANDO MAS DUELE.

      La reja de abajo compara el costo nuevo con el promedio que el articulo ya
      tenia. En su primera entrada ese promedio no existe, asi que la reja calla
      — y es justo la entrada que fijo los 868 millones el 5 de septiembre: los
      cinco aceites entraban por primera vez.

      No hay numero contra el que medir, asi que no se puede avisar de que algo
      esta mal. Lo que si se puede es DECIR QUE NADIE LO ESTA COMPROBANDO, y
      pedir que alguien mire antes de que ese costo se convierta en la
      referencia de todo lo que venga despues.

      Se pide una sola vez por articulo y almacen. A partir del segundo
      movimiento hay promedio y manda la reja de las diez veces.
    */
    if not v_sin_valor and coalesce(v_ref, 0) = 0
       and not coalesce((v_r->>'confirmado')::boolean, false) then
      raise exception 'El renglón % (%): es la primera vez que entra a este almacén, así que no hay con qué comparar el costo. Serán % % a % % cada una, que son % %. Compruébalo con la factura, también la moneda, y acéptalo.',
        v_n, v_nombre, private.numero_es(v_cantidad, 2),
        (select unidad from public.articulos where id = v_articulo),
        private.numero_es(v_costo, 4), v_moneda,
        -- El equivalente, siempre en la otra moneda: en la misma no dice nada.
        case when v_moneda = 'USD' then private.numero_es(v_costo * v_tasa, 2)
             else private.numero_es(v_costo_usd, 4) end,
        case when v_moneda = 'USD' then 'Bs' else 'USD' end
        using errcode = '22023',
              hint = 'Este costo se convierte en la referencia de todo lo que entre después. Un cero de más aquí no lo va a corregir nadie.';
    end if;

    if not v_sin_valor and coalesce(v_ref, 0) > 0 then
      v_veces := round(v_costo_usd / v_ref, 6);
      if v_veces >= c_factor or v_veces <= (1 / c_factor) then
        if not coalesce((v_r->>'confirmado')::boolean, false) then
          v_msg := case when private.puede_accion('INVENTARIO.VER_VALORACION')
            then format('El renglón %s (%s): viene costando %s por unidad y lo estás metiendo a %s: son %s. Si es correcto, acéptalo y quedará anotado.',
                        v_n, v_nombre, private.numero_es(v_ref, 4),
                        private.numero_es(v_costo_usd, 4), case when v_veces >= 1 then private.numero_es(v_veces, 2) || ' veces mas'
                   else private.numero_es(v_ref / nullif(v_costo_usd, 0), 2) || ' veces menos' end)
            else format('El renglón %s (%s): ese costo se sale mucho de lo que el artículo viene costando. Compruébalo con la factura; si es correcto, acéptalo y quedará anotado.',
                        v_n, v_nombre)
          end;
          raise exception '%', v_msg
            using errcode = '22023',
                  hint = 'Comprueba la factura y la moneda antes de aceptar: un cero de más aquí se arrastra a cada salida.';
        end if;
      else
        v_veces := null;
      end if;
    end if;

    perform private.registrar_movimiento(
      'ENTRADA_DIRECTA', 1::smallint, p_almacen_id, v_articulo, v_cantidad,
      -- Nulo y no cero: el hueco se guarda como hueco.
      case when v_sin_valor then null else v_costo_usd end,
      case when v_sin_valor then v_nota || ' · Sin valor declarado: entró sin cifra y queda pendiente de valorar.'
           when v_moneda = 'USD' then v_nota
           else v_nota || ' · Costo declarado: ' || v_costo || ' ' || v_moneda end,
      null, null, null, p_fecha, null, null,
      p_aviso_costo => v_veces,
      p_propietario => v_dueno,
      p_cantidad_capturada => nullif(v_pres, 0),
      p_unidad_capturada => case when v_pres > 0 then private.presentacion_usada(v_articulo, v_nombre_pres) end,
      p_suelto_capturado => case when v_pres > 0 then nullif(v_sueltas, 0) end,
      -- Y lo que se tecleó del costo, sin convertir: la cifra, a qué se refería y la moneda.
      p_costo_capturado => case when v_sin_valor then null else v_tecleado end,
      p_costo_unidad_capturada => case
        when not v_sin_valor and coalesce((v_r->>'costo_por_presentacion')::boolean, false)
        then private.presentacion_usada(v_articulo, v_nombre_pres) end,
      p_moneda_capturada => case when v_sin_valor then null else v_moneda end);
  end loop;

  return v_n;
end;
$function$;

-- public.revisar_costo_de_entrada(p_almacen_id bigint, p_articulo_id bigint, p_costo numeric, p_moneda text, p_fecha date)
-- venia de: 20260908130000_las_tres_que_faltaban_con_su_cuerpo.sql
CREATE OR REPLACE FUNCTION public.revisar_costo_de_entrada(p_almacen_id bigint, p_articulo_id bigint, p_costo numeric, p_moneda text DEFAULT 'USD'::text, p_fecha date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c_factor constant numeric := 10;
  v_ref       numeric;
  v_costo_usd numeric;
  v_tasa      numeric;
  v_tasa_usd  numeric;
  v_veces     numeric;
  v_ve        boolean;
begin
  /*
    LO QUE LA PANTALLA NO PODIA PREGUNTAR.

    El formulario de entrada decidia si avisar leyendo `v_existencias.
    costo_promedio_usd`, que sale NULO a quien no tiene
    INVENTARIO.VER_VALORACION —nivel TOTAL—. ALMACEN tiene ESCRITURA, asi que
    al almacenista, que es justo quien teclea las entradas, le salia NULO
    siempre; la pantalla concluia «es la primera vez que entra» en la entrada
    numero treinta, y la casilla que marcaba para seguir mandaba `confirmado`,
    que en la base vale tambien para la reja de las diez veces. El aviso del
    desvio no llegaba a aparecer nunca y quedaba aceptado de antemano.

    La vista filtra para MOSTRAR; esta funcion contesta para DECIDIR. Es la
    misma leccion de `private.saldo_de_factura`, y van dos veces hoy.

    Contesta QUE pasa siempre, y CUANTO solo a quien puede ver el dinero — el
    mismo reparto que ya hacen los mensajes de `registrar_entradas`.
  */
  perform private.exigir_permiso('INVENTARIO', 'LECTURA');

  v_ve := private.puede_accion('INVENTARIO.VER_VALORACION');

  if not exists (select 1 from public.articulos where id = p_articulo_id and activo) then
    return jsonb_build_object('estado', 'SIN_ARTICULO');
  end if;

  v_ref := private.costo_promedio(p_almacen_id, p_articulo_id);

  if coalesce(v_ref, 0) = 0 then
    /*
      LA PRIMERA VEZ, CON LA MONEDA Y SU EQUIVALENTE EN LA OTRA.

      Sin promedio no hay con qué comparar, pero sí se puede decir cuánto es lo
      tecleado en la otra moneda: 39.332,15 dólares son más de treinta y tres
      millones de bolívares, y eso se ve antes de aceptar. No es valoración —es
      la cifra que la persona acaba de escribir—, así que la ve cualquiera. Sin
      moneda o sin tasa se contesta sin equivalente, en vez de reventar mientras
      alguien teclea.
    */
    if coalesce(p_costo, 0) > 0 and nullif(btrim(coalesce(p_moneda, '')), '') is not null then
      begin
        select tasa, tasa_usd into v_tasa, v_tasa_usd
          from private.tasas_del_dia(upper(btrim(p_moneda)), coalesce(p_fecha, current_date));
      exception when others then
        v_tasa := null;
      end;

      if v_tasa is not null and coalesce(v_tasa_usd, 0) > 0 then
        return jsonb_build_object(
          'estado',      'PRIMERA',
          'moneda',      upper(btrim(p_moneda)),
          'equivale',    case when upper(btrim(p_moneda)) = 'USD' then round(p_costo * v_tasa, 2)
                              else round(p_costo * v_tasa / v_tasa_usd, 4) end,
          'equivale_en', case when upper(btrim(p_moneda)) = 'USD' then 'VES' else 'USD' end);
      end if;
    end if;

    return jsonb_build_object('estado', 'PRIMERA');
  end if;

  if coalesce(p_costo, 0) <= 0 then
    return jsonb_build_object('estado', 'NORMAL');
  end if;

  select tasa, tasa_usd into v_tasa, v_tasa_usd
    from private.tasas_del_dia(upper(coalesce(p_moneda, 'USD')), coalesce(p_fecha, current_date));

  /*
    Sin tasa no se compara. La pantalla llama a esto mientras alguien teclea,
    asi que aqui se contesta y no se revienta: quien avisa de que falta la tasa
    es el guardado, que es donde de verdad importa.
  */
  if coalesce(v_tasa_usd, 0) = 0 or v_tasa is null then
    return jsonb_build_object('estado', 'SIN_TASA');
  end if;

  v_costo_usd := round(p_costo * v_tasa / v_tasa_usd, 6);
  v_veces     := round(v_costo_usd / v_ref, 2);

  if v_veces < c_factor and v_veces > (1 / c_factor) then
    return jsonb_build_object('estado', 'NORMAL');
  end if;

  return jsonb_build_object(
    'estado',        'DESVIA',
    'hacia',         case when v_veces >= 1 then 'ARRIBA' else 'ABAJO' end,
    -- El inverso se saca de los valores crudos: 6,21 / 1.209.012,48 redondea a
    -- 0,00 y dividir entre eso revienta. Ya paso hoy.
    'veces',         case when v_ve then
                       case when v_veces >= 1 then v_veces
                            else round(v_ref / v_costo_usd, 2) end
                     end,
    'viene_costando', case when v_ve then round(v_ref, 4) end,
    'entra_a',        case when v_ve then round(v_costo_usd, 4) end);
end;
$function$;
