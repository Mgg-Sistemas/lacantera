/*
  LA PLANILLA DE ARTÍCULOS REVISA TODO ANTES DE ACEPTAR

  Christopher, 15/09/2026, en tres tiempos:

    «La planilla de artículos: si viene sin moneda, la sigue rellenando en
    dólares. En el sistema se debe frenar esos items en específico advirtiendo
    y permitiendo su corrección en sistema».

    «La planilla realmente debe abarcar un poco más, detectando errores y
    duplicados antes de aceptar los datos en la BD, por tanto, deberá validar
    errores o intento de nuevos códigos/categorías, etc.»

    Y lo que le informó un usuario dev: «la planilla para la carga por lote no
    se está reflejando correctamente en existencia, solo carga catálogo».

  LO QUE SE MIDIÓ ANTES DE TOCAR NADA

  El lote del 12/09 a las 09:20:58 creó 130 artículos y actualizó 3, y ningún
  asiento del libro lleva la nota de la planilla. Pero esta función sí escribe
  existencia: probada en bloque revertido, una fila con almacén, cantidad y
  costo crea el artículo y su entrada. Así que aquellas filas llegaron sin
  almacén ni cantidad, y la revisión no dijo que solo iba a cargar catálogo.
  Eso lo arregla la pantalla, que ahora lo pregunta; esta función devuelve
  cuántas filas traen existencia —ya lo hacía— y la pantalla lo usa.

  LA REGLA: LO QUE REVENTARÍA AL CONFIRMAR, PARA EN LA REVISIÓN

  La revisión y la carga son la misma función para que lo que se enseña sea lo
  que se escribe. Pero había filas que la revisión daba por buenas y que al
  confirmar tumbaban el lote entero, porque la entrada al almacén tiene rejas
  que aquí no se miraban: un sitio que no guarda material, un tanque que solo
  admite lo que no costó nada, una moneda sin tasa del día. Ahora se miran aquí.

  QUÉ PARA AHORA

    - La moneda vacía con precio o con costo. Ya no se supone USD.
    - Un código tecleado que no existe. Rellenar ese código creaba un artículo
      nuevo con el código que se le ocurrió a quien llenó el archivo, y así es
      como el catálogo acabó con nombres metidos en el campo del código. Para un
      artículo nuevo el código va vacío: la base le pone uno.
    - Un nombre que ya es de OTRO artículo, con el código de uno distinto.
    - El mismo nombre dos veces en el archivo, aunque lleven códigos distintos.
    - Cambiarle la unidad a un artículo con movimientos: sus cantidades pasarían
      a significar otra cosa.
    - «En camino», un patio de máquinas o un tanque sin costo como almacén.
    - Una moneda sin tasa para hoy.

  QUÉ SE ENSEÑA SIN PARAR

    - Un nombre nuevo que se parece a uno que ya está. No para —DISCO DE CORTE 7
      y DISCO DE CORTE 9 son dos artículos—, pero ahora se cuenta y se dice cuál,
      para que la pantalla pida mirarlo y ofrezca «es el mismo».
    - Una fila sin código que resulta ser un artículo del catálogo: se actualiza
      ese en vez de crear otro, y se dice.
    - Un cambio de categoría.

  Y cada problema dice en qué casilla está —`campo`—, para que la pantalla abra
  la fila con el cursor ahí.
*/
do $mig$
declare
  v_def   text := pg_get_functiondef('public.cargar_articulos_por_lote(jsonb,boolean)'::regprocedure);

  -- Cambia un trozo que tiene que aparecer exactamente una vez.
  v_ancla text;
  v_nuevo text;
begin
  -- 1. Las variables nuevas.
  v_ancla := $a$  v_avisos_de_costo int := 0;
begin
$a$;
  v_nuevo := $n$  v_avisos_de_costo int := 0;
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
$n$;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'ancla 1 (variables) no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, v_nuevo);

  -- 2. Se limpian fila a fila.
  v_ancla := $a$    v_motivo := null;
$a$;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'ancla 2 (limpiar) no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, $n$    v_motivo := null;
    v_campo := null;
    v_parecido := null;
$n$);

  -- 3. La moneda vacía se queda vacía.
  v_ancla := $a$    v_moneda    := upper(btrim(coalesce(nullif(btrim(coalesce(v_fila->>'moneda','')), ''), 'USD')));
$a$;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'ancla 3 (moneda por defecto) no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, $n$    -- Vacía se queda vacía: rellenarla con dólares es lo que guardaba bolívares
    -- como si fueran dólares. Las rejas de la moneda van más abajo.
    v_moneda    := upper(btrim(coalesce(v_fila->>'moneda', '')));
$n$);

  -- 4. El código tal como vino.
  v_ancla := $a$    if v_codigo = '' and v_nombre <> '' then
$a$;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'ancla 4 (codigo tecleado) no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, $n$    v_codigo_tecleado := v_codigo;

$n$ || v_ancla);

  -- 5. Lo que falta, lo repetido y lo que no existe.
  v_ancla := $a$    if v_nombre = '' then
      v_motivo := 'Falta el nombre.';
    elsif v_categoria = '' then
      v_motivo := 'Falta la categoría.';
    elsif v_unidad = '' then
      v_motivo := 'Falta la unidad.';

    elsif coalesce(nullif(v_codigo, ''), 'NUCLEO:' || v_nucleo) = any(v_vistos) then
      v_motivo := case when v_codigo <> ''
        then format('El código %s se repite en la planilla.', v_codigo)
        else format('«%s» aparece dos veces en la planilla.', v_nombre) end;
$a$;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'ancla 5 (validaciones de cabeza) no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, $n$    if v_nombre = '' then
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
$n$);

  -- 6. Precio sin moneda.
  v_ancla := $a$      elsif v_precio is not null
            and not exists (select 1 from public.monedas where codigo = v_moneda and activa) then
        v_motivo := format('La moneda «%s» no está activa en el sistema.', v_moneda);
$a$;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'ancla 6 (precio sin moneda) no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, $n$      elsif v_precio is not null and v_moneda = '' then
        v_motivo := 'Trae precio pero no dice en qué moneda. Elige la moneda: el sistema ya no supone dólares.';
        v_campo  := 'moneda';
      elsif v_precio is not null
            and not exists (select 1 from public.monedas where codigo = v_moneda and activa) then
        v_motivo := format('La moneda «%s» no está activa en el sistema.', v_moneda);
        v_campo  := 'moneda';
$n$);

  -- 7. Costo sin moneda. Lo que entra sin valorar no trae cifra y no la pide.
  v_ancla := $a$        elsif not exists (select 1 from public.monedas where codigo = v_moneda and activa) then
          v_motivo := format('La moneda «%s» no está activa en el sistema.', v_moneda);
$a$;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'ancla 7 (costo sin moneda) no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, $n$        elsif not v_sin_val and v_moneda = '' then
          v_motivo := 'Trae costo pero no dice en qué moneda. Elige la de la factura: el sistema ya no supone dólares.';
          v_campo  := 'moneda';
        elsif v_moneda <> ''
              and not exists (select 1 from public.monedas where codigo = v_moneda and activa) then
          v_motivo := format('La moneda «%s» no está activa en el sistema.', v_moneda);
          v_campo  := 'moneda';
$n$);

  -- 8. El almacén: que exista, que guarde material y que la moneda tenga tasa.
  v_ancla := $a$          if v_almacen_id is null then
            v_motivo := format('El almacén «%s» no existe o está inactivo. Los que hay: %s.',
              v_almacen_txt,
              (select string_agg(a.codigo || ' · ' || a.nombre, ', ' order by a.nombre)
                 from public.almacenes a where a.activo));
          end if;
$a$;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'ancla 8 (almacen) no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, $n$          if v_almacen_id is null then
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
              exception when others then
                v_motivo := format('No hay tasa de %s para hoy, así que no se puede saber cuánto costó en dólares. Regístrala en Tasas de cambio o usa otra moneda.', v_moneda);
                v_campo := 'moneda';
                v_almacen_id := null;
              end;
            end if;
          end if;
$n$);

  -- 9. La unidad de lo que ya tiene movimientos, y la casilla de cada problema.
  v_ancla := $a$    if v_motivo is not null then
      v_errores := v_errores + 1;
      v_estado  := 'ERROR';
    else
      v_vistos := v_vistos || coalesce(nullif(v_codigo, ''), 'NUCLEO:' || v_nucleo);
$a$;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'ancla 9 (errores) no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, $n$    /*
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
$n$);

  -- 10. El parecido dice cuál es.
  v_ancla := $a$        select format('Se parece a «%s» (%s), que ya está.', a.nombre, a.codigo)
          into v_aviso
$a$;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'ancla 10 (parecido) no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, $n$        select format('Se parece a «%s» (%s), que ya está.', a.nombre, a.codigo), a.codigo
          into v_aviso, v_parecido
$n$);

  -- 11. Se cuentan los parecidos, y lo que se actualiza dice por qué.
  v_ancla := $a$         limit 1;
      else
        v_estado := 'ACTUALIZA';
        v_actualizados := v_actualizados + 1;
      end if;
$a$;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'ancla 11 (actualiza) no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, $n$         limit 1;

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
$n$);

  -- 12. La casilla y el parecido viajan en el informe.
  v_ancla := $a$      'motivo', v_motivo,
$a$;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'ancla 12 (informe de fila) no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, $n$      'motivo', v_motivo,
      'campo', v_campo,
      'parecido_codigo', v_parecido,
$n$);

  -- 13. Y cuántos parecidos hay que mirar.
  v_ancla := $a$    'avisos_de_costo', v_avisos_de_costo,
$a$;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'ancla 13 (informe) no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, $n$    'avisos_de_costo', v_avisos_de_costo,
    -- Cuantas filas nuevas se parecen a un articulo que ya esta.
    'avisos_de_parecido', v_avisos_parecido,
$n$);

  execute v_def;
end
$mig$;

do $ver$
declare
  v_def text := pg_get_functiondef('public.cargar_articulos_por_lote(jsonb,boolean)'::regprocedure);
begin
  if position($t$'USD')));$t$ in v_def) > 0 then
    raise exception 'la planilla sigue rellenando la moneda con USD';
  end if;
  if position('No hay ningún artículo con el código' in v_def) = 0
     or position('ya viene en la fila' in v_def) = 0
     or position('ya tiene movimientos en' in v_def) = 0
     or position('no se carga material' in v_def) = 0
     or position($t$'avisos_de_parecido'$t$ in v_def) = 0
     or position($t$'campo', v_campo,$t$ in v_def) = 0 then
    raise exception 'falta una de las rejas nuevas de la planilla';
  end if;
end
$ver$;
