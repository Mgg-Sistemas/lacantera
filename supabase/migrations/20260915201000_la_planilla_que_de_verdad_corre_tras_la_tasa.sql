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

-- public.cargar_articulos_por_lote(p_filas jsonb, p_confirmar boolean)
-- venia de: 20260915191000_la_planilla_que_de_verdad_corre.sql
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
          insert into public.precios_venta
            (articulo_id, moneda, precio, precio_minimo, actualizado_por, actualizado_en)
          values
            (v_id, v_moneda, v_precio, coalesce(v_precio_min, 0), (select auth.uid()), now())
          on conflict (articulo_id) do update
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
