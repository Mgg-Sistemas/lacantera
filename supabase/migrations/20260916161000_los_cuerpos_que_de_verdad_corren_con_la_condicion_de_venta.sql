/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  4 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
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
  viva —no normalizado, no perdonando comentarios— y los 4 coinciden. Y el
  detector, que antes marcaba estas 4, pasa a cero.

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

-- public.cargar_articulos_por_lote(p_filas jsonb, p_confirmar boolean)
-- venia de: 20260915201000_la_planilla_que_de_verdad_corre_tras_la_tasa.sql
CREATE OR REPLACE FUNCTION public.cargar_articulos_por_lote(p_filas jsonb, p_confirmar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reparable boolean;
  v_fila         jsonb;
  v_n            int := 0;
  v_informe      jsonb := '[]'::jsonb;
  v_errores      int := 0;
  v_nuevos       int := 0;
  v_actualizados int := 0;
  v_hay_precio   boolean := false;

  v_codigo    text;
  v_nombre    text;
  v_categoria text;
  v_cat_txt   text;
  v_unidad    text;
  v_modo      text;
  v_inv       boolean;
  v_minimo    numeric;
  v_densidad  numeric;
  v_precio    numeric;
  v_precio_min numeric;
  v_moneda    text;

  -- Lo que trae la existencia, cuando la trae.
  v_almacen_txt text;
  v_almacen_id  bigint;
  v_cantidad    numeric;
  v_costo       numeric;
  v_sin_val     boolean;
  v_dueno_txt   text;
  v_con_stock   int := 0;

  /*
    Los renglones se juntan por almacén y se meten al final, no fila por fila.

    Una llamada por renglón tomaría el cerrojo del almacén una vez por artículo
    —cien artículos, cien esperas— y dejaría cien movimientos sueltos donde lo
    que hubo fue una sola carga inicial. Agrupados, queda un movimiento por
    almacén, que es lo que de verdad pasó y lo que alguien va a querer leer
    dentro de un año.
  */
  v_por_almacen jsonb := '{}'::jsonb;
  v_clave       text;

  v_motivo    text;
  v_estado    text;
  v_id        bigint;
  v_vistos    text[] := array[]::text[];
  v_nucleo    text;
  v_aviso     text;
  v_rev             jsonb;
  v_aviso_costo     text;
  v_avisos_de_costo int := 0;
  -- La casilla del problema, cuando se sabe: la pantalla abre la fila ahí.
  v_campo           text;
  -- El código tal como vino, antes de buscarlo por el nombre.
  v_codigo_tecleado text;
  -- Qué fila del archivo trajo ya cada nombre, para decirlo con su número.
  v_nombres_vistos  jsonb := '{}'::jsonb;
  v_otro_codigo     text;
  v_parecido        text;
  v_avisos_parecido int := 0;
  v_tipo_almacen    text;
  v_sin_costo_alm   boolean;
  v_ex_id           bigint;
  v_ex_unidad       text;
begin
  perform private.exigir_permiso('INVENTARIO', 'ESCRITURA');

  if jsonb_typeof(p_filas) <> 'array' then
    raise exception 'La planilla no trae filas.' using errcode = '22023';
  end if;

  select exists (
    select 1 from jsonb_array_elements(p_filas) f
    where nullif(btrim(coalesce(f->>'precio', '')), '') is not null
  ) into v_hay_precio;

  if v_hay_precio then
    perform private.exigir_permiso('VENTAS', 'TOTAL');
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_n := v_n + 1;
    v_motivo := null;
    v_campo := null;
    v_parecido := null;
    v_aviso  := null;
    v_estado := null;
    v_almacen_id := null;
    v_cantidad := null;
    v_costo := null;
    v_sin_val := false;
    v_dueno_txt := null;

    v_codigo    := upper(btrim(coalesce(v_fila->>'codigo', '')));
    v_nombre    := btrim(coalesce(v_fila->>'nombre', ''));
    /*
      SE ESCRIBE EL NOMBRE, SE GUARDA EL CODIGO.

      La planilla ofrece «Equipo de oficina y computo» porque es lo que dice la
      pantalla; la tabla guarda EQUIPO. Aqui se traduce, admitiendo tambien el
      codigo para que una planilla bajada antes de hoy siga entrando.

      Sin tildes en los dos lados: el desplegable las pone y quien teclea a mano
      casi nunca, y rechazar una fila por un acento seria el peor de los motivos.

      Si no se reconoce, se queda el texto tal cual y la reja de abajo lo nombra
      con las palabras que la persona escribio.
    */
    v_cat_txt := upper(btrim(coalesce(v_fila->>'categoria', '')));
    v_categoria := coalesce(
      (select c.codigo from public.categorias_de_articulo() c
        where upper(c.codigo) = v_cat_txt
           or translate(upper(c.etiqueta), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')
              = translate(v_cat_txt, 'ÁÉÍÓÚÜÑ', 'AEIOUUN')
        limit 1),
      v_cat_txt);
    v_unidad    := upper(btrim(coalesce(v_fila->>'unidad', '')));
    v_modo      := upper(btrim(coalesce(nullif(btrim(coalesce(v_fila->>'modo_entrega','')), ''), 'CONSUMIBLE')));
    -- Vacía se queda vacía: rellenarla con dólares es lo que guardaba bolívares
    -- como si fueran dólares. Las rejas de la moneda van más abajo.
    v_moneda    := upper(btrim(coalesce(v_fila->>'moneda', '')));
    v_almacen_txt := btrim(coalesce(v_fila->>'almacen', ''));

    v_nucleo := private.nombre_nucleo(v_nombre);

    /*
      EL CODIGO YA NO SE EXIGE, Y ESA EXIGENCIA ES DE DONDE SALIO EL PROBLEMA.

      Once de los quince articulos del catalogo llevan el nombre metido en el
      campo del codigo —«ACEITE AGROFLUIDOS» es a la vez nombre y codigo—
      porque esta funcion pedia un codigo y quien lleno la planilla no tenia
      ninguno que escribir. Un codigo que es el nombre no distingue nada: el
      indice unico deja pasar el mismo articulo dos veces con una letra de
      diferencia.

      Sin codigo, la fila se resuelve por el nombre: si ya hay un articulo cuyo
      nombre se reduce al mismo nucleo, es ese y se actualiza. Si no, es nuevo y
      el codigo se lo pone `private.codigo_de_articulo` AL GUARDAR — no al
      revisar, porque revisar la planilla tres veces gastaria tres correlativos
      por fila y dejaria huecos en la serie.
    */
    v_codigo_tecleado := v_codigo;

    if v_codigo = '' and v_nombre <> '' then
      select a.codigo into v_codigo
        from public.articulos a
       where private.nombre_nucleo(a.nombre) = v_nucleo
       order by a.activo desc
       limit 1;
      v_codigo := coalesce(v_codigo, '');
    end if;

    if v_nombre = '' then
      v_motivo := 'Falta el nombre.';
      v_campo  := 'nombre';
    elsif v_categoria = '' then
      v_motivo := 'Falta la categoría.';
      v_campo  := 'categoria';
    elsif v_unidad = '' then
      v_motivo := 'Falta la unidad.';
      v_campo  := 'unidad';

    elsif coalesce(nullif(v_codigo, ''), 'NUCLEO:' || v_nucleo) = any(v_vistos) then
      v_motivo := case when v_codigo <> ''
        then format('El código %s se repite en la planilla.', v_codigo)
        else format('«%s» aparece dos veces en la planilla.', v_nombre) end;
      v_campo  := case when v_codigo_tecleado <> '' then 'codigo' else 'nombre' end;

    /*
      EL MISMO NOMBRE DOS VECES, AUNQUE LLEVEN CÓDIGOS DISTINTOS.

      La comprobación de arriba mira el código cuando lo hay, así que dos filas
      «ACEITE 15W40» con códigos distintos pasaban y acababan en dos fichas del
      mismo aceite. Se compara el núcleo del nombre, que conserva los números:
      DISCO DE CORTE 7 y DISCO DE CORTE 9 siguen siendo dos.
    */
    elsif v_nombres_vistos ? v_nucleo then
      v_motivo := format('«%s» ya viene en la fila %s de esta planilla. Si es el mismo artículo, deja una sola fila; si es otro, cámbiale el nombre para que se distinga.',
        v_nombre, v_nombres_vistos->>v_nucleo);
      v_campo  := 'nombre';

    /*
      UN CÓDIGO TECLEADO TIENE QUE EXISTIR.

      Christopher: validar el «intento de nuevos códigos». Un código que no está
      creaba un artículo con ese código, y así entraron los nombres metidos en el
      campo del código. Para uno nuevo el código va vacío y lo pone la base.
    */
    elsif v_codigo_tecleado <> ''
          and not exists (select 1 from public.articulos a
                           where a.codigo = v_codigo_tecleado or a.codigo_anterior = v_codigo_tecleado) then
      v_motivo := format('No hay ningún artículo con el código «%s». Si es un artículo nuevo, deja el código vacío: el sistema le pone uno con las letras de su categoría.',
        v_codigo_tecleado);
      v_campo  := 'codigo';

    -- El nombre ya es de otro artículo, y la fila trae el código de uno distinto.
    elsif v_codigo_tecleado <> ''
          and exists (select 1 from public.articulos a
                       where private.nombre_nucleo(a.nombre) = v_nucleo
                         and a.codigo <> v_codigo_tecleado
                         and coalesce(a.codigo_anterior, '') <> v_codigo_tecleado) then
      select a.codigo into v_otro_codigo
        from public.articulos a
       where private.nombre_nucleo(a.nombre) = v_nucleo
         and a.codigo <> v_codigo_tecleado
         and coalesce(a.codigo_anterior, '') <> v_codigo_tecleado
       order by a.activo desc
       limit 1;
      v_motivo := format('El nombre «%s» ya es del artículo %s. Si es ese, pon su código; si es otro distinto, cámbiale el nombre para que se distinga.',
        v_nombre, v_otro_codigo);
      v_campo  := 'nombre';

    /* La lista sale del CHECK de la tabla: ver `public.categorias_de_articulo`. */
    elsif not exists (select 1 from public.categorias_de_articulo() c
                       where c.codigo = v_categoria) then
      v_motivo := format('«%s» no es una categoría del sistema. Las que hay: %s.',
        v_cat_txt,
        (select string_agg(c.etiqueta, ', ' order by c.etiqueta)
           from public.categorias_de_articulo() c));

    elsif v_modo not in ('NO','RETORNABLE','CONSUMIBLE') then
      v_motivo := format('«%s» no dice qué pasa al entregarlo: NO, RETORNABLE o CONSUMIBLE.', v_modo);

    elsif not exists (select 1 from public.unidades where codigo = v_unidad) then
      v_motivo := format('La unidad «%s» no existe. Las que hay: %s.',
        v_unidad,
        (select string_agg(u.codigo, ', ' order by u.codigo) from public.unidades u));

    else
      begin
        v_minimo   := coalesce(nullif(btrim(coalesce(v_fila->>'stock_minimo','')), '')::numeric, 0);
        v_densidad := nullif(btrim(coalesce(v_fila->>'densidad_ton_m3','')), '')::numeric;
        v_precio   := nullif(btrim(coalesce(v_fila->>'precio','')), '')::numeric;
        v_precio_min := nullif(btrim(coalesce(v_fila->>'precio_minimo','')), '')::numeric;
        v_cantidad := nullif(btrim(coalesce(v_fila->>'cantidad','')), '')::numeric;
        v_costo    := nullif(btrim(coalesce(v_fila->>'costo','')), '')::numeric;
      exception when others then
        v_minimo := null;
        v_motivo := 'Hay un número que no se entiende. Se escriben sin separador de miles y con punto decimal.';
      end;

      v_inv := case lower(btrim(coalesce(v_fila->>'inventariable', '')))
                 when '' then true
                 when 'si' then true when 'sí' then true when 'true' then true when '1' then true
                 when 'no' then false when 'false' then false when '0' then false
                 else null end;

      /*
        LO DONADO ENTRA SIN CIFRA.

        Christopher: «tenemos que considerar que puede ser una donación de otra
        empresa o entidad o fuente, así que por ello no tiene una factura o
        costo».

        NO SE SABE NO ES CERO. Escribir cero diria que la laptop donada no vale
        nada, y ese cero se promedia con lo que ya hay y abarata cada salida
        futura del articulo, en silencio y para siempre. Marcando esta columna
        el renglon entra con el costo en nulo: el hueco se guarda como hueco,
        queda fuera del promedio por los dos lados, y se cuenta aparte para que
        una valoracion a medias no se lea como completa.

        Vacio es NO, que es lo que tiene que pasar: quien no sepa que existe
        esta columna sigue teniendo que escribir el costo.
      */
      -- Vacio significa «el del almacen», que es lo que resuelve la base.
      v_dueno_txt := nullif(upper(btrim(coalesce(v_fila->>'propietario', ''))), '');

      v_sin_val := case lower(btrim(coalesce(v_fila->>'sin_valorar', '')))
                 when 'si' then true when 'sí' then true when 'true' then true when '1' then true
                 else false end;

      if v_motivo is not null then
        null;
      elsif v_inv is null then
        v_motivo := 'La columna «inventariable» se responde SI o NO.';
      elsif v_minimo < 0 then
        v_motivo := 'El mínimo no puede ser negativo.';
      elsif v_densidad is not null and v_densidad <= 0 then
        v_motivo := 'La densidad, si se pone, es mayor que cero.';
      elsif v_categoria = 'SERVICIO' and v_inv then
        v_motivo := 'Un servicio no se guarda en el almacén: «inventariable» tiene que ser NO.';
      elsif v_precio is not null and v_precio <= 0 then
        v_motivo := 'El precio tiene que ser mayor que cero.';
      elsif v_precio is null and v_precio_min is not null then
        v_motivo := 'Hay precio mínimo sin precio.';
      elsif v_precio_min is not null and v_precio_min > v_precio then
        v_motivo := 'El precio mínimo no puede pasar del precio.';
      elsif v_precio is not null and v_moneda = '' then
        v_motivo := 'Trae precio pero no dice en qué moneda. Elige la moneda: el sistema ya no supone dólares.';
        v_campo  := 'moneda';
      elsif v_precio is not null
            and not exists (select 1 from public.monedas where codigo = v_moneda and activa) then
        v_motivo := format('La moneda «%s» no está activa en el sistema.', v_moneda);
        v_campo  := 'moneda';
      end if;

      /*
        LA EXISTENCIA. Las tres van juntas o no va ninguna.

        Media fila —un almacén sin cantidad, una cantidad sin costo— casi
        siempre es una celda que se quedó sin llenar, y adivinar el resto es
        meter existencia que nadie pidió. Se avisa y se para.
      */
      if v_motivo is null and (v_almacen_txt <> '' or v_cantidad is not null or v_costo is not null or v_sin_val) then
        if not v_inv then
          v_motivo := 'Esto no se inventaría, así que no puede tener existencia en un almacén.';
        elsif v_almacen_txt = '' then
          v_motivo := 'Hay cantidad o costo pero falta el almacén: no se sabe dónde meterlo.';
        elsif v_cantidad is null then
          v_motivo := 'Hay almacén pero falta la cantidad.';
        elsif v_dueno_txt is not null
              and not exists (select 1 from public.propietarios where codigo = v_dueno_txt and activo) then
          v_motivo := format('«%s» no es un dueño registrado. Los que hay: %s.', v_dueno_txt,
            (select string_agg(codigo, ', ' order by codigo) from public.propietarios where activo));
        elsif v_sin_val and v_costo is not null then
          v_motivo := 'Está marcado «sin_valorar» y además trae costo. O se sabe cuánto costó, o no se sabe: deja una de las dos celdas vacía.';
        elsif v_costo is null and not v_sin_val then
          v_motivo := 'Hay cantidad pero falta el costo. Si llegó donado o sin factura y nadie sabe cuánto costó, escribe SI en «sin_valorar» y deja el costo vacío.';
        elsif v_cantidad <= 0 then
          v_motivo := 'La cantidad que entra tiene que ser mayor que cero.';
        elsif not v_sin_val and v_costo <= 0 then
          v_motivo := 'El costo por unidad tiene que ser mayor que cero.';
        elsif not v_sin_val and v_moneda = '' then
          v_motivo := 'Trae costo pero no dice en qué moneda. Elige la de la factura: el sistema ya no supone dólares.';
          v_campo  := 'moneda';
        elsif v_moneda <> ''
              and not exists (select 1 from public.monedas where codigo = v_moneda and activa) then
          v_motivo := format('La moneda «%s» no está activa en el sistema.', v_moneda);
          v_campo  := 'moneda';
        else
          -- Por código o por nombre: quien llena la planilla escribe lo que ve
          -- en la pantalla de almacenes, y ahí se lee el nombre.
          select a.id into v_almacen_id
            from public.almacenes a
           where a.activo
             and (upper(a.codigo) = upper(v_almacen_txt) or upper(a.nombre) = upper(v_almacen_txt));

          if v_almacen_id is null then
            -- La lista, solo con los sitios donde de verdad se puede cargar.
            v_motivo := format('El almacén «%s» no existe o está inactivo. Los que hay: %s.',
              v_almacen_txt,
              (select string_agg(a.codigo || ' · ' || a.nombre, ', ' order by a.nombre)
                 from public.almacenes a
                where a.activo and a.tipo not in ('PATIO_MAQUINAS', 'TRANSITO')
                  and not coalesce(a.admite_sin_costo, false)));
            v_campo := 'almacen';
          else
            /*
              LO QUE LA ENTRADA RECHAZARÍA, SE RECHAZA AQUÍ.

              Sin esto la revisión decía «todo correcto» y la confirmación tumbaba
              el lote entero al llegar a la entrada del almacén.
            */
            select a.tipo, coalesce(a.admite_sin_costo, false)
              into v_tipo_almacen, v_sin_costo_alm
              from public.almacenes a where a.id = v_almacen_id;

            if v_tipo_almacen in ('PATIO_MAQUINAS', 'TRANSITO') then
              v_motivo := format('En «%s» no se carga material: %s.', v_almacen_txt,
                case when v_tipo_almacen = 'TRANSITO'
                     then 'es donde espera lo que va de un sitio a otro, y solo lo mueven los traslados'
                     else 'es un patio de máquinas' end);
              v_campo := 'almacen';
              v_almacen_id := null;
            elsif v_sin_costo_alm then
              v_motivo := format('«%s» lleva aparte lo que no le costó nada a la empresa y no se carga por planilla. Elige otro almacén.', v_almacen_txt);
              v_campo := 'almacen';
              v_almacen_id := null;
            elsif not v_sin_val then
              begin
                perform private.tasas_del_dia(v_moneda, current_date);
              exception when sqlstate 'P0002' then
                v_motivo := format('No hay tasa de %s para hoy, así que no se puede saber cuánto costó en dólares. Regístrala en Tasas de cambio o usa otra moneda.', v_moneda);
                v_campo := 'moneda';
                v_almacen_id := null;
              end;
            end if;
          end if;
        end if;
      end if;
    end if;

    /*
      CAMBIAR LA UNIDAD DE LO QUE YA SE MOVIÓ.

      Cien movimientos en UND pasan a leerse en KG si la planilla le cambia la
      unidad al artículo, y ningún número del libro vuelve a significar lo que
      significaba. Si de verdad cambió, se decide en el catálogo, uno a uno.
    */
    if v_motivo is null and v_codigo <> '' then
      v_ex_id := null;
      select a.id, a.unidad into v_ex_id, v_ex_unidad
        from public.articulos a
       where a.codigo = v_codigo or a.codigo_anterior = v_codigo
       limit 1;
      if v_ex_id is not null and v_ex_unidad <> v_unidad
         and exists (select 1 from public.inventario_movimientos m where m.articulo_id = v_ex_id) then
        v_motivo := format('%s ya tiene movimientos en %s: cambiarle la unidad a %s cambiaría lo que significan sus cantidades. Deja %s, o cámbiala desde el catálogo si de verdad cambió.',
          v_codigo, v_ex_unidad, v_unidad, v_ex_unidad);
        v_campo := 'unidad';
      end if;
    end if;

    /*
      LA CASILLA DE LOS DEMÁS PROBLEMAS, DEDUCIDA DEL MENSAJE.

      Los mensajes viven en esta misma función, así que leerlos aquí no depende
      de nadie de fuera. Escribirle la casilla a cada uno por separado habría
      sido tocar veinte sitios de un cuerpo de veinte mil letras para decir lo
      mismo. El que no se reconoce se queda sin casilla: la pantalla enseña la
      fila entera.
    */
    if v_motivo is not null and v_campo is null then
      v_campo := case
        when v_motivo like '%no es una categoría%'           then 'categoria'
        when v_motivo like '%qué pasa al entregarlo%'         then 'modo_entrega'
        when v_motivo like 'La unidad %'                      then 'unidad'
        when v_motivo like '%«inventariable»%'                then 'inventariable'
        when v_motivo like 'Un servicio no se guarda%'        then 'inventariable'
        when v_motivo like 'El mínimo%'                       then 'stock_minimo'
        when v_motivo like 'La densidad%'                     then 'densidad_ton_m3'
        when v_motivo like 'Hay precio mínimo sin precio%'    then 'precio'
        when v_motivo like 'El precio mínimo%'                then 'precio_minimo'
        when v_motivo like 'El precio tiene%'                 then 'precio'
        when v_motivo like 'Esto no se inventaría%'           then 'inventariable'
        when v_motivo like '%falta el almacén%'               then 'almacen'
        when v_motivo like 'Hay almacén pero falta la cantidad%' then 'cantidad'
        when v_motivo like '%no es un dueño registrado%'      then 'propietario'
        when v_motivo like 'Está marcado «sin_valorar»%'      then 'costo'
        when v_motivo like 'Hay cantidad pero falta el costo%' then 'costo'
        when v_motivo like 'La cantidad que entra%'           then 'cantidad'
        when v_motivo like 'El costo por unidad%'             then 'costo'
      end;
    end if;

    if v_motivo is not null then
      v_errores := v_errores + 1;
      v_estado  := 'ERROR';
    else
      v_vistos := v_vistos || coalesce(nullif(v_codigo, ''), 'NUCLEO:' || v_nucleo);
      v_nombres_vistos := v_nombres_vistos || jsonb_build_object(v_nucleo, v_n);
      /*
        Tambien por el codigo viejo: una planilla anterior a la renumeracion
        trae «ACEITE AGROFLUIDOS» donde hoy pone LUB-0001, y sin esto la fila
        entraria como un articulo nuevo con el nombre otra vez en el codigo.
      */
      select id into v_id from public.articulos
       where codigo = v_codigo or codigo_anterior = v_codigo;

      if v_id is null then
        v_estado := 'NUEVO';
        v_nuevos := v_nuevos + 1;

        /*
          SE PARECE A UNO QUE YA ESTA, PERO NO ES EL MISMO.

          Avisa y deja pasar. Una planilla trae DISCO DE CORTE 7 y DISCO DE
          CORTE 9 el mismo dia, y pararla obligaria a partirla en dos. Lo que
          hace falta es que quien la revisa lo VEA antes de confirmar — el
          informe sale en pantalla justamente para eso.
        */
        select format('Se parece a «%s» (%s), que ya está.', a.nombre, a.codigo), a.codigo
          into v_aviso, v_parecido
          from public.articulos a
         where extensions.similarity(private.nombre_comparable(a.nombre),
                                     private.nombre_comparable(v_nombre)) >= 0.55
         order by extensions.similarity(private.nombre_comparable(a.nombre),
                                        private.nombre_comparable(v_nombre)) desc
         limit 1;

        if v_parecido is not null then
          v_avisos_parecido := v_avisos_parecido + 1;
        end if;
      else
        v_estado := 'ACTUALIZA';
        v_actualizados := v_actualizados + 1;

        -- Una fila sin código que ya estaba en el catálogo, o que cambia de
        -- categoría: no para, pero se dice.
        select nullif(concat_ws(' · ',
                 case when v_codigo_tecleado = ''
                      then format('Ya está en el catálogo como %s: se actualiza ese en vez de crear otro.', a.codigo) end,
                 case when a.categoria <> v_categoria
                      then format('Cambia de categoría: de %s a %s.', a.categoria, v_categoria) end), '')
          into v_aviso
          from public.articulos a where a.id = v_id;
      end if;

      if v_almacen_id is not null then
        v_con_stock := v_con_stock + 1;
      end if;

      if p_confirmar then
        if v_id is null then
          -- Vacia se deduce de la categoria, la misma regla que crear_articulo:
          -- una herramienta y un repuesto vuelven arreglados del taller, un
          -- lubricante o un producto se gastan.
          v_reparable := case lower(btrim(coalesce(v_fila->>'reparable', '')))
                           when 'si' then true when 'sí' then true
                           when '1' then true  when 'true' then true
                           when 'no' then false when '0' then false
                           when 'false' then false
                           else null end;

          insert into public.articulos
            (codigo, nombre, descripcion, categoria, unidad, inventariable,
             stock_minimo, densidad_ton_m3, modo_entrega, reparable, creado_por)
          values
            (coalesce(nullif(v_codigo, ''), private.codigo_de_articulo(v_categoria)),
             v_nombre, nullif(btrim(coalesce(v_fila->>'descripcion','')), ''),
             v_categoria, v_unidad, v_inv, v_minimo, v_densidad, v_modo,
             coalesce(v_reparable, v_categoria in ('HERRAMIENTA', 'REPUESTO')),
             (select auth.uid()))
          returning id into v_id;
        else
          v_reparable := case lower(btrim(coalesce(v_fila->>'reparable', '')))
                           when 'si' then true when 'sí' then true
                           when '1' then true  when 'true' then true
                           when 'no' then false when '0' then false
                           when 'false' then false
                           else null end;

          update public.articulos
             set nombre = v_nombre,
                 reparable = coalesce(v_reparable, reparable),
                 descripcion = coalesce(nullif(btrim(coalesce(v_fila->>'descripcion','')), ''), descripcion),
                 categoria = v_categoria,
                 unidad = v_unidad,
                 -- Al corregir, la celda vacia significa «no lo toques». Con
                 -- el valor por defecto, una herramienta RETORNABLE a la que se
                 -- le corregia el nombre pasaba a CONSUMIBLE y dejaba de poder
                 -- prestarse.
                 inventariable = case
                   when nullif(btrim(coalesce(v_fila->>'inventariable','')), '') is null
                     then inventariable else v_inv end,
                 stock_minimo = case
                   when nullif(btrim(coalesce(v_fila->>'stock_minimo','')), '') is null
                     then stock_minimo else v_minimo end,
                 densidad_ton_m3 = coalesce(v_densidad, densidad_ton_m3),
                 modo_entrega = case
                   when nullif(btrim(coalesce(v_fila->>'modo_entrega','')), '') is null
                     then modo_entrega else v_modo end
           where id = v_id;
        end if;

        if v_precio is not null then
          -- El precio de la planilla es el de la unidad del artículo.
          insert into public.precios_venta
            (articulo_id, unidad, moneda, precio, precio_minimo, actualizado_por, actualizado_en)
          values
            (v_id, (select a.unidad from public.articulos a where a.id = v_id),
             v_moneda, v_precio, coalesce(v_precio_min, 0), (select auth.uid()), now())
          on conflict (articulo_id, unidad) do update
            set moneda = excluded.moneda,
                precio = excluded.precio,
                precio_minimo = excluded.precio_minimo,
                actualizado_por = excluded.actualizado_por,
                actualizado_en = excluded.actualizado_en;
        end if;

        -- El renglón se guarda para el final, agrupado por su almacén.
        if v_almacen_id is not null then
          v_clave := v_almacen_id::text;
          v_por_almacen := jsonb_set(
            v_por_almacen, array[v_clave],
            coalesce(v_por_almacen -> v_clave, '[]'::jsonb) ||
              jsonb_build_object('articulo_id', v_id, 'cantidad', v_cantidad,
                                 'costo', coalesce(v_costo, 0), 'moneda', v_moneda,
                                 'sin_valor', v_sin_val,
                                 'propietario', v_dueno_txt,
                                 /*
                                   La revision fila por fila de la pantalla ES la
                                   confirmacion. Sin esto, cualquier articulo
                                   nuevo con costo moria pidiendo una casilla que
                                   una planilla no tiene donde poner.
                                 */
                                 'confirmado', true));
        end if;
      end if;
    end if;

    /*
      EL COSTO RARO SE ENSEÑA EN LA REVISION, QUE ES LA CONFIRMACION.

      La planilla manda sus renglones con `confirmado: true` porque la revision
      fila por fila hace de confirmacion. Pero la revision no enseñaba los avisos
      de costo: un articulo nuevo podia entrar a un precio disparatado sin
      pregunta y sin marca, que es el escenario de los cinco aceites del 5/09 por
      la via de lote.

      Aqui se hace la misma pregunta que el formulario de entrada —la misma
      funcion, `revisar_costo_de_entrada`— y la respuesta va al aviso de la fila,
      que la pantalla ya pinta. Contesta QUE a todo el mundo y CUANTO solo a quien
      puede ver el dinero, porque es lo que devuelve esa funcion.

      Un articulo que la planilla crea no tiene promedio: es primera vez sin
      preguntar. Lo que entra sin valorar no se compara, porque no trae cifra.
    */
    if v_motivo is null and v_almacen_id is not null
       and not coalesce(v_sin_val, false) and coalesce(v_costo, 0) > 0 then
      v_rev := case when v_id is null
                    then jsonb_build_object('estado', 'PRIMERA')
                    else public.revisar_costo_de_entrada(v_almacen_id, v_id, v_costo, v_moneda, null)
               end;

      v_aviso_costo := case
        when v_rev->>'estado' in ('PRIMERA', 'SIN_ARTICULO') then
          format('Primera vez que entra a este almacén, a %s %s por %s: pasa a ser la referencia de todo lo que entre después. Compruébalo con la factura.',
                 private.numero_es(v_costo, 4), v_moneda, v_unidad)
        when v_rev->>'estado' = 'DESVIA' and v_rev->>'veces' is not null then
          format('Viene costando %s USD por %s y entra a %s USD: %s veces %s. Compruébalo con la factura.',
                 private.numero_es((v_rev->>'viene_costando')::numeric, 4), v_unidad,
                 private.numero_es((v_rev->>'entra_a')::numeric, 4),
                 private.numero_es((v_rev->>'veces')::numeric, 2),
                 case when v_rev->>'hacia' = 'ARRIBA' then 'más' else 'menos' end)
        when v_rev->>'estado' = 'DESVIA' then
          format('Ese costo se sale mucho, %s, de lo que el artículo viene costando. Compruébalo con la factura.',
                 case when v_rev->>'hacia' = 'ARRIBA' then 'hacia arriba' else 'hacia abajo' end)
      end;

      if v_aviso_costo is not null then
        v_avisos_de_costo := v_avisos_de_costo + 1;
        v_aviso := case when v_aviso is null then v_aviso_costo
                        else v_aviso || ' · ' || v_aviso_costo end;
      end if;
    end if;

    v_informe := v_informe || jsonb_build_object(
      'fila', v_n,
      'codigo', v_codigo,
      'nombre', v_nombre,
      'estado', v_estado,
      'motivo', v_motivo,
      'campo', v_campo,
      'parecido_codigo', v_parecido,
      'aviso', v_aviso);
  end loop;

  if v_n = 0 then
    raise exception 'La planilla está vacía.' using errcode = '22023';
  end if;

  if p_confirmar and v_errores > 0 then
    raise exception 'La planilla tiene % fila(s) con problemas. No se cargó nada.', v_errores
      using errcode = '22023';
  end if;

  /*
    Y ahora la existencia, una entrada por almacén.

    Va al final y no dentro del bucle porque los artículos nuevos tienen que
    existir antes de que se les meta nada. Si esto revienta —un almacén que se
    desactivó entre la revisión y el guardado— se cae la transacción entera y
    tampoco quedan los artículos, que es lo correcto: media carga es peor que
    ninguna.
  */
  if p_confirmar and v_por_almacen <> '{}'::jsonb then
    for v_clave in select jsonb_object_keys(v_por_almacen) loop
      perform public.registrar_entradas(
        v_clave::bigint,
        v_por_almacen -> v_clave,
        'Carga inicial por planilla',
        null,
        null);
    end loop;
  end if;

  return jsonb_build_object(
    'total', v_n,
    'nuevos', v_nuevos,
    'actualizados', v_actualizados,
    'con_existencia', v_con_stock,
    -- Cuantas filas traen un costo que hay que mirar antes de confirmar.
    'avisos_de_costo', v_avisos_de_costo,
    -- Cuantas filas nuevas se parecen a un articulo que ya esta.
    'avisos_de_parecido', v_avisos_parecido,
    'errores', v_errores,
    'aplicado', p_confirmar and v_errores = 0,
    'filas', v_informe);
end;
$function$;

-- public.despachar(p_cliente_id bigint, p_almacen_id bigint, p_renglones jsonb, p_moneda character, p_cotizacion_id bigint, p_vehiculo text, p_chofer text, p_cedula_chofer text, p_peso_bruto numeric, p_peso_tara numeric, p_ticket text, p_alicuota_iva numeric, p_descuento numeric, p_flete numeric, p_fecha date, p_observacion text, p_ticket_id bigint, p_guia_id bigint)
-- venia de: 20260916131000_los_cuerpos_que_de_verdad_corren_con_plantas_y_rutas.sql
CREATE OR REPLACE FUNCTION public.despachar(p_cliente_id bigint, p_almacen_id bigint, p_renglones jsonb, p_moneda character DEFAULT NULL::bpchar, p_cotizacion_id bigint DEFAULT NULL::bigint, p_vehiculo text DEFAULT NULL::text, p_chofer text DEFAULT NULL::text, p_cedula_chofer text DEFAULT NULL::text, p_peso_bruto numeric DEFAULT NULL::numeric, p_peso_tara numeric DEFAULT NULL::numeric, p_ticket text DEFAULT NULL::text, p_alicuota_iva numeric DEFAULT NULL::numeric, p_descuento numeric DEFAULT 0, p_flete numeric DEFAULT 0, p_fecha date DEFAULT NULL::date, p_observacion text DEFAULT NULL::text, p_ticket_id bigint DEFAULT NULL::bigint, p_guia_id bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_cliente  record;
  v_almacen  record;
  v_tk       record;
  v_guia     record;
  v_fecha    date := coalesce(p_fecha, current_date);
  v_moneda   text;
  v_tasas    record;
  v_id       bigint;
  v_reng     record;
  v_existe   numeric;
  v_costo    numeric;
  v_mov      bigint;
  v_bruto    numeric := p_peso_bruto;
  v_tara     numeric := p_peso_tara;
  v_ticket   text    := nullif(trim(coalesce(p_ticket, '')), '');
  v_vehiculo text    := nullif(trim(coalesce(p_vehiculo, '')), '');
  v_chofer   text    := nullif(trim(coalesce(p_chofer, '')), '');
  v_cedula   text    := nullif(trim(coalesce(p_cedula_chofer, '')), '');
  v_producto boolean;
  v_en_ton   integer;
  v_del_patio integer;
begin
  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');

  select * into v_cliente from public.clientes where id = p_cliente_id;
  if v_cliente.id is null then
    raise exception 'No existe el cliente %.', p_cliente_id using errcode = 'P0002';
  end if;
  if not v_cliente.activo then
    raise exception 'El cliente "%" está inactivo.', v_cliente.nombre using errcode = '22023';
  end if;

  select * into v_almacen from public.almacenes where id = p_almacen_id;
  if v_almacen.id is null then
    raise exception 'No existe el almacén %.', p_almacen_id using errcode = 'P0002';
  end if;
  if not v_almacen.activo then
    raise exception 'El almacén "%" está cerrado.', v_almacen.nombre using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se despacha con fecha futura.' using errcode = '22023';
  end if;

  -- El pesaje. Se cierra el ticket antes de mirarlo: dos notas de entrega
  -- emitidas a la vez podrían colgarse del mismo pesaje.
  if p_ticket_id is not null then
    select * into v_tk from public.romana_tickets where id = p_ticket_id for update;

    if v_tk.id is null then
      raise exception 'No existe el ticket de romana %.', p_ticket_id using errcode = 'P0002';
    end if;
    if v_tk.tipo <> 'SALIDA' then
      raise exception 'El ticket % es de una entrada a la cantera, no de una salida.', v_tk.numero
        using errcode = '22023';
    end if;
    if v_tk.estado <> 'LIBRE' then
      raise exception 'El ticket % está %.', v_tk.numero, lower(v_tk.estado) using errcode = '55000';
    end if;
    if v_tk.cliente_id is not null and v_tk.cliente_id <> p_cliente_id then
      raise exception 'El ticket % se pesó para otro cliente.', v_tk.numero using errcode = '22023';
    end if;

    -- Los pesos salen de la romana, no del teclado: para eso se pesó.
    v_bruto    := v_tk.peso_bruto;
    v_tara     := v_tk.peso_tara;
    v_ticket   := v_tk.numero;
    v_vehiculo := coalesce(v_vehiculo, v_tk.vehiculo);
    v_chofer   := coalesce(v_chofer, v_tk.chofer);
    v_cedula   := coalesce(v_cedula, v_tk.cedula_chofer);
  end if;

  -- La guía.
  if p_guia_id is not null then
    select * into v_guia from public.guias_movilizacion where id = p_guia_id for update;

    if v_guia.id is null then
      raise exception 'No existe la guía %.', p_guia_id using errcode = 'P0002';
    end if;
    if v_guia.estado <> 'VIGENTE' then
      raise exception 'La guía % está %.', v_guia.numero_guia, lower(v_guia.estado)
        using errcode = '55000';
    end if;
    if v_guia.vigencia_hasta < v_fecha then
      raise exception 'La guía % venció el %.', v_guia.numero_guia,
        to_char(v_guia.vigencia_hasta, 'DD/MM/YYYY') using errcode = '55000';
    end if;
    if v_guia.cliente_id is not null and v_guia.cliente_id <> p_cliente_id then
      raise exception 'La guía % se emitió para otro cliente.', v_guia.numero_guia
        using errcode = '22023';
    end if;
  end if;

  v_moneda := coalesce(p_moneda, v_cliente.moneda_preferida);
  select * into v_tasas from private.tasas_del_dia(v_moneda, v_fecha);

  insert into public.notas_entrega
    (numero, cliente_id, cotizacion_id, almacen_id, fecha, vehiculo, chofer,
     cedula_chofer, peso_bruto, peso_tara, ticket_romana, moneda, tasa, tasa_usd,
     alicuota_iva, descuento, flete, observacion, despachada_por, ticket_id, guia_id)
  values
    (private.siguiente_numero('NE'), p_cliente_id, p_cotizacion_id, p_almacen_id,
     v_fecha, v_vehiculo, v_chofer, v_cedula, v_bruto, v_tara, v_ticket,
     v_moneda, v_tasas.tasa, v_tasas.tasa_usd,
     case when v_cliente.exento_iva then 0 else coalesce(p_alicuota_iva, 16) end,
     coalesce(p_descuento, 0), coalesce(p_flete, 0),
     nullif(trim(coalesce(p_observacion, '')), ''), (select auth.uid()),
     p_ticket_id, p_guia_id)
  returning id into v_id;

  perform private.cargar_renglones_venta(
    'nota_entrega_renglones', 'nota_id', v_id, p_renglones, v_moneda, v_fecha);

  /*
    LO QUE SE VENDE EN TONELADAS CON EL CAMIÓN PESADO LO DICE LA ROMANA.

    Si hay ticket y el camión lleva un solo material del patio, vendido en
    toneladas, esas toneladas son las del ticket y no las que se escribieron:
    para eso se pesó. Con dos materiales en el mismo camión el peso es de los
    dos juntos y no se reparte, así que cada renglón se queda con lo escrito y
    marcado como estimado.
  */
  if p_ticket_id is not null then
    select count(*) filter (where r.unidad = 'TON'), count(*)
      into v_en_ton, v_del_patio
      from public.nota_entrega_renglones r
     where r.nota_id = v_id and r.cantidad_inventario is not null;

    if v_en_ton = 1 and v_del_patio = 1 then
      update public.nota_entrega_renglones r
         set cantidad = round((v_bruto - v_tara) / 1000, 4),
             cantidad_inventario = case
               when r.densidad_usada is null then round((v_bruto - v_tara) / 1000, 4)
               else round((v_bruto - v_tara) / 1000 / r.densidad_usada, 4)
             end,
             medida = 'ROMANA'
       where r.nota_id = v_id and r.unidad = 'TON' and r.cantidad_inventario is not null;
    end if;
  end if;

  -- Ninguna salida de mineral viaja sin guía. Se comprueba después de cargar
  -- los renglones porque hasta aquí no se sabía si esta nota lleva producto o
  -- es solo un flete.
  select exists (
    select 1
    from public.nota_entrega_renglones r
    join public.articulos a on a.id = r.articulo_id
    where r.nota_id = v_id and a.categoria = 'PRODUCTO'
  ) into v_producto;

  if v_producto and p_guia_id is null and not private.tiene_permiso('DESPACHOS', 'TOTAL') then
    raise exception 'Este despacho lleva mineral y no tiene guía de movilización. Cárgala en Despachos › Guías, o pídele a quien tenga control total sobre Despachos que lo autorice sin ella.'
      using errcode = '55000';
  end if;

  -- Un cerrojo por casilla de patio —almacén y artículo—, tomados todos antes
  -- de tocar nada y siempre en orden de artículo. En orden porque dos despachos
  -- que pidan las mismas casillas al revés se quedarían esperando el uno al
  -- otro para siempre. No hay fila que bloquear: la existencia se suma del
  -- libro de movimientos, no se guarda en ningún sitio.
  for v_reng in
    select distinct r.articulo_id
    from public.nota_entrega_renglones r
    join public.articulos a on a.id = r.articulo_id
    where r.nota_id = v_id and a.inventariable
    order by r.articulo_id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(format('patio:%s:%s', p_almacen_id, v_reng.articulo_id), 0));
  end loop;

  -- Ahora sí el patio. Renglón por renglón, comprobando existencia antes de
  -- restar: sacar más de lo que hay deja el almacén en negativo, y una
  -- existencia negativa no es un dato sino un error que alguien tendrá que
  -- deshacer a mano.
  for v_reng in
    select r.id, r.articulo_id, coalesce(r.cantidad_inventario, r.cantidad) as cantidad,
           r.cantidad as vendida, r.unidad, a.unidad as unidad_patio, a.nombre, a.inventariable
    from public.nota_entrega_renglones r
    join public.articulos a on a.id = r.articulo_id
    where r.nota_id = v_id
    order by r.linea
  loop
    -- Un servicio —un flete— se cobra pero no sale de ningún almacén.
    continue when not v_reng.inventariable;

    v_existe := private.existencia_para_escribir(p_almacen_id, v_reng.articulo_id);

    if v_reng.cantidad > v_existe then
      raise exception 'En "%" hay % de "%" y se están despachando %.',
        v_almacen.nombre, private.cantidad_es(v_existe), v_reng.nombre, private.cantidad_es(v_reng.cantidad)
        using errcode = '22023';
    end if;

    v_costo := private.costo_promedio(p_almacen_id, v_reng.articulo_id);

    v_mov := private.registrar_movimiento(
      'SALIDA_DESPACHO', (-1)::smallint, p_almacen_id, v_reng.articulo_id,
      v_reng.cantidad, v_costo,
      format('DESPACHO A %s', v_cliente.nombre), null, null, null, v_fecha,
      -- Vendido en la otra unidad: el libro lleva la del patio y guarda al
      -- lado lo que se vendió.
      p_cantidad_capturada => case when v_reng.unidad <> v_reng.unidad_patio then v_reng.vendida end,
      p_unidad_capturada   => case when v_reng.unidad <> v_reng.unidad_patio then v_reng.unidad end);

    update public.nota_entrega_renglones set movimiento_id = v_mov where id = v_reng.id;
  end loop;

  -- Los dos papeles quedan gastados en este viaje.
  if p_ticket_id is not null then
    update public.romana_tickets
       set estado = 'USADO', nota_entrega_id = v_id where id = p_ticket_id;
  end if;

  if p_guia_id is not null then
    update public.guias_movilizacion
       set estado = 'USADA', nota_entrega_id = v_id where id = p_guia_id;
  end if;

  -- Si venía de una cotización, esa cotización quedó aceptada de hecho.
  if p_cotizacion_id is not null then
    update public.cotizaciones_venta
       set estado = 'ACEPTADA', cerrada_por = (select auth.uid()), cerrada_en = now()
     where id = p_cotizacion_id and estado = 'ENVIADA';
  end if;

  return v_id;
end;
$function$;

-- public.emitir_nota_credito(p_factura_id bigint, p_tipo text, p_motivo text, p_renglones jsonb, p_fecha date)
-- venia de: 20260915103000_la_facturacion_que_de_verdad_corre.sql
CREATE OR REPLACE FUNCTION public.emitir_nota_credito(p_factura_id bigint, p_tipo text, p_motivo text, p_renglones jsonb, p_fecha date DEFAULT NULL::date)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fac    record;
  v_id     bigint;
  v_fecha  date := coalesce(p_fecha, (now() at time zone 'America/Caracas')::date);
  v_item   jsonb;
  v_linea  smallint := 0;
  v_art    record;
  v_alm    bigint;
  v_mov    bigint;
  v_reng   bigint;
  v_unidad text;
  v_patio  numeric;
  v_fr     record;
begin
  perform private.exigir_permiso('FACTURACION', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 6 then
    raise exception 'Escribe por qué se emite. Una nota de crédito sin motivo no se le puede explicar a nadie: ni al cliente, ni al SENIAT, ni al que la lea en un año.'
      using errcode = '22023';
  end if;

  if p_tipo not in ('DEVOLUCION', 'DESCUENTO', 'CORRECCION', 'ANULACION') then
    raise exception 'Tipo de nota de crédito no válido: %.', p_tipo using errcode = '22023';
  end if;

  if coalesce(jsonb_array_length(p_renglones), 0) = 0 then
    raise exception 'La nota necesita al menos un renglón: qué se corrige y por cuánto.'
      using errcode = '22023';
  end if;

  -- La fila de la factura es el portero, igual que para cobrar y para anular.
  select * into v_fac from public.facturas_venta where id = p_factura_id for update;

  if v_fac.id is null then
    raise exception 'No existe la factura %.', p_factura_id using errcode = 'P0002';
  end if;

  if v_fac.estado = 'ANULADA' then
    raise exception 'La factura % está anulada. Una factura sin efecto no se corrige: no hay nada que restarle.',
      v_fac.numero using errcode = '55000';
  end if;

  if v_fecha < v_fac.fecha then
    raise exception 'La nota es del % y la factura que corrige es del %. Una corrección no puede ser anterior a lo que corrige.',
      to_char(v_fecha, 'DD/MM/YYYY'), to_char(v_fac.fecha, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  insert into public.notas_credito
    (numero, numero_control, factura_id, cliente_id, fecha, tipo, motivo,
     moneda, tasa, tasa_usd, alicuota_iva, emitida_por)
  values
    (private.siguiente_numero('NCR'), private.siguiente_control(), v_fac.id,
     v_fac.cliente_id, v_fecha, p_tipo, trim(p_motivo),
     -- La tasa de la factura. Si fuera la de hoy, restaría otros bolívares de
     -- los que sumó y la factura nunca cerraría.
     v_fac.moneda, v_fac.tasa, v_fac.tasa_usd, v_fac.alicuota_iva,
     (select auth.uid()))
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_linea := v_linea + 1;

    select * into v_art from public.articulos
     where id = (v_item->>'articulo_id')::bigint;

    if v_art.id is null then
      raise exception 'El renglón % apunta a un artículo que no existe.', v_linea
        using errcode = 'P0002';
    end if;

    if coalesce((v_item->>'cantidad')::numeric, 0) <= 0 then
      raise exception 'La cantidad del renglón % debe ser mayor que cero.', v_linea
        using errcode = '22023';
    end if;

    v_alm := nullif(v_item->>'almacen_id', '')::bigint;

    insert into public.nota_credito_renglones
      (nota_id, linea, articulo_id, descripcion, cantidad, unidad,
       precio_unitario, exento_iva, almacen_id)
    values
      (v_id, v_linea, v_art.id,
       coalesce(nullif(trim(coalesce(v_item->>'descripcion', '')), ''), v_art.nombre),
       (v_item->>'cantidad')::numeric,
       coalesce(nullif(v_item->>'unidad', ''), v_art.unidad),
       coalesce((v_item->>'precio_unitario')::numeric, 0),
       coalesce((v_item->>'exento_iva')::boolean, false),
       v_alm)
    returning id into v_reng;

    -- Solo si el renglón dice a qué patio vuelve. Una corrección de precio no
    -- mueve una piedra.
    if v_alm is not null then
      /*
        LO QUE VUELVE AL PATIO, EN LA UNIDAD DEL PATIO.

        Una factura en toneladas devuelve toneladas, y el patio lleva metros
        cúbicos. Se convierte con la cuenta con que salió —la cantidad del patio
        entre la vendida, del renglón de la factura que se devuelve— y, si no se
        dice cuál, con la densidad del catálogo.
      */
      v_unidad := coalesce(nullif(v_item->>'unidad', ''), v_art.unidad);
      v_patio := (v_item->>'cantidad')::numeric;

      if v_unidad <> v_art.unidad then
        select fr.cantidad, fr.cantidad_inventario into v_fr
          from public.factura_venta_renglones fr
         where fr.id = nullif(v_item->>'renglon_factura_id', '')::bigint
           and fr.factura_id = v_fac.id
           and fr.articulo_id = v_art.id
           and fr.unidad = v_unidad;

        if v_fr.cantidad_inventario is not null then
          v_patio := round(v_patio * v_fr.cantidad_inventario / v_fr.cantidad, 4);
        elsif v_art.densidad_ton_m3 is not null
              and v_unidad in ('M3', 'TON') and v_art.unidad in ('M3', 'TON') then
          v_patio := round(case when v_unidad = 'TON' then v_patio / v_art.densidad_ton_m3
                                else v_patio * v_art.densidad_ton_m3 end, 4);
        else
          raise exception 'El renglón % devuelve «%» en % y el patio lo lleva en %: no se sabe cuánto vuelve.',
            v_linea, v_art.nombre, v_unidad, v_art.unidad using errcode = '22023';
        end if;
      end if;

      if v_patio <= 0 then
        raise exception 'Lo que devuelve el renglón % no llega a mover el patio.', v_linea
          using errcode = '22023';
      end if;

      -- El décimo argumento es `p_origen`, que NO es "de dónde viene esto" sino
      -- el movimiento al que este reversa, y apunta al libro de inventario. Aquí
      -- va en nulo: esta entrada no deshace nada, es material que llegó. El
      -- enlace con la nota vive en el renglón, que es donde se puede leer.
      v_mov := private.registrar_movimiento(
        'ENTRADA_DEVOLUCION', 1, v_alm, v_art.id,
        v_patio,
        round((v_item->>'cantidad')::numeric
              * coalesce((v_item->>'precio_unitario')::numeric, 0)
              * v_fac.tasa / v_fac.tasa_usd / v_patio, 6),
        format('Devolución del cliente por nota de crédito sobre la factura %s', v_fac.numero),
        null, null, null, v_fecha,
        p_cantidad_capturada => case when v_unidad <> v_art.unidad then (v_item->>'cantidad')::numeric end,
        p_unidad_capturada   => case when v_unidad <> v_art.unidad then v_unidad end);

      update public.nota_credito_renglones set movimiento_id = v_mov where id = v_reng;
    end if;
  end loop;

  -- Si la nota deja la factura sin nada que cobrar, la factura se cierra: si no,
  -- se quedaba emitida sin admitir cobro ni anulación, y contando como vencida.
  if private.saldo_de_factura(v_fac.id) <= 0.01 then
    update public.facturas_venta
       set estado = 'COBRADA'
     where id = v_fac.id and estado = 'EMITIDA';
  end if;

  return v_id;
end;
$function$;

-- public.facturar_notas(p_notas bigint[], p_condicion_pago text, p_fecha date, p_observacion text)
-- venia de: 20260915103000_la_facturacion_que_de_verdad_corre.sql
CREATE OR REPLACE FUNCTION public.facturar_notas(p_notas bigint[], p_condicion_pago text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date, p_observacion text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_cliente   record;
  v_fecha     date := coalesce(p_fecha, current_date);
  v_notas     record;
  v_condicion text;
  v_dias      smallint;
  v_id        bigint;
  v_linea     smallint := 0;
  v_reng      record;
  v_deuda     numeric;
  v_total_usd numeric;
  v_iva       numeric;
begin
  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');

  if p_notas is null or array_length(p_notas, 1) is null then
    raise exception 'No hay notas de entrega que facturar.' using errcode = '22023';
  end if;

  -- Las notas se cierran ANTES de mirarles el estado. Sin esto, dos facturas
  -- emitidas a la vez leen las dos "DESPACHADA", las dos consumen un número de
  -- control fiscal y la segunda pisa el factura_id de la primera: dos papeles
  -- por el mismo camión. En orden de id para que dos tandas que se solapen no
  -- se queden esperándose.
  perform 1 from public.notas_entrega
   where id = any(p_notas) order by id for update;

  select count(*)                       as cuantas,
         count(distinct n.cliente_id)   as clientes,
         count(distinct n.moneda)       as monedas,
         count(distinct n.alicuota_iva) as alicuotas,
         min(n.cliente_id)              as cliente_id,
         min(n.moneda)                  as moneda,
         min(n.alicuota_iva)            as alicuota,
         sum(n.descuento)               as descuento,
         sum(n.flete)                   as flete,
         count(*) filter (where n.estado <> 'DESPACHADA') as no_despachadas
    into v_notas
  from public.notas_entrega n
  where n.id = any(p_notas);

  if v_notas.cuantas <> array_length(p_notas, 1) then
    raise exception 'Alguna de las notas indicadas no existe.' using errcode = 'P0002';
  end if;

  if v_notas.no_despachadas > 0 then
    raise exception 'Solo se facturan notas despachadas: % de las indicadas ya están facturadas o anuladas.',
      v_notas.no_despachadas using errcode = '55000';
  end if;

  if v_notas.clientes > 1 then
    raise exception 'Las notas son de % clientes distintos. Una factura es de un solo cliente.',
      v_notas.clientes using errcode = '22023';
  end if;

  if v_notas.monedas > 1 then
    raise exception 'Las notas están en monedas distintas y no se pueden sumar en una factura.'
      using errcode = '22023';
  end if;

  if v_notas.alicuotas > 1 then
    raise exception 'Las notas llevan alícuotas de IVA distintas. Factúralas por separado.'
      using errcode = '22023';
  end if;

  select * into v_cliente from public.clientes where id = v_notas.cliente_id;

  v_condicion := coalesce(p_condicion_pago, v_cliente.condicion_pago);
  v_dias := case v_condicion
              when 'CREDITO_15' then 15
              when 'CREDITO_30' then 30
              when 'CREDITO_60' then 60
              else 0
            end;

  insert into public.facturas_venta
    (numero, numero_control, cliente_id, fecha, condicion_pago, dias_credito, vence_el,
     moneda, tasa, tasa_usd, alicuota_iva, descuento, flete, observacion, emitida_por)
  select
    private.siguiente_numero('FAC'), private.siguiente_control(), v_cliente.id, v_fecha,
    v_condicion, v_dias, v_fecha + v_dias,
    v_notas.moneda, t.tasa, t.tasa_usd, v_notas.alicuota,
    coalesce(v_notas.descuento, 0), coalesce(v_notas.flete, 0),
    nullif(trim(coalesce(p_observacion, '')), ''), (select auth.uid())
  from private.tasas_del_dia(v_notas.moneda, v_fecha) t
  returning id into v_id;

  -- Los renglones se copian, no se referencian: la factura tiene que seguir
  -- diciendo lo mismo aunque después alguien anule la nota de la que salió.
  for v_reng in
    select r.*, n.id as origen
    from public.nota_entrega_renglones r
    join public.notas_entrega n on n.id = r.nota_id
    where r.nota_id = any(p_notas)
    order by n.fecha, n.numero, r.linea
  loop
    v_linea := v_linea + 1;
    insert into public.factura_venta_renglones
      (factura_id, linea, articulo_id, descripcion, cantidad, unidad,
       precio_unitario, exento_iva, nota_id,
       condicion, precio_lista, descuento_pct, descuento_unitario, motivo_condicion,
       cantidad_inventario, medida, densidad_usada)
    values
      (v_id, v_linea, v_reng.articulo_id, v_reng.descripcion, v_reng.cantidad,
       v_reng.unidad, v_reng.precio_unitario, v_reng.exento_iva, v_reng.origen,
       v_reng.condicion, v_reng.precio_lista, v_reng.descuento_pct, v_reng.descuento_unitario,
       v_reng.motivo_condicion, v_reng.cantidad_inventario, v_reng.medida, v_reng.densidad_usada);
  end loop;

  -- La retención se calcula sobre el IVA ya cuadrado por el disparador.
  if v_cliente.contribuyente_especial then
    select iva into v_iva from public.facturas_venta where id = v_id;
    update public.facturas_venta
       set retencion_iva = round(v_iva * v_cliente.retencion_iva / 100, 2)
     where id = v_id;
  end if;

  -- El techo del crédito, después de conocer el total y antes de dar el
  -- documento por bueno. Un aviso que se salta con un clic, se salta.
  if v_dias > 0 then
    select total_usd into v_total_usd from public.facturas_venta where id = v_id;

    if v_cliente.limite_credito <= 0 then
      raise exception 'A "%" no se le tiene autorizado crédito. Fija su límite o factúrale de contado.',
        v_cliente.nombre using errcode = '55000';
    end if;

    -- La deuda ya incluye esta factura: acaba de emitirse como EMITIDA.
    v_deuda := private.deuda_cliente(v_cliente.id);

    if v_deuda > v_cliente.limite_credito and not private.tiene_permiso('FACTURACION', 'TOTAL') then
      raise exception 'Con esta factura "%" quedaría debiendo % $ y su límite es % $.',
        v_cliente.nombre, private.numero_es(v_deuda, 2), private.numero_es(v_cliente.limite_credito, 2)
        using errcode = '55000';
    end if;
  end if;

  update public.notas_entrega
     set estado = 'FACTURADA', factura_id = v_id
   where id = any(p_notas);

  return v_id;
end;
$function$;
