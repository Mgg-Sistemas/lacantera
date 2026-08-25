-- La planilla de artículos puede traer existencia.
--
-- La líder: «permitamos la carga de inventario por lote de almacén». Y
-- Christopher marca el camino barato: tres columnas más en la planilla que ya
-- existe, opcionales, en vez de una pantalla nueva.
--
-- =========================================================================
-- PRECIO NO ES COSTO, Y LA PLANILLA YA TENÍA «PRECIO»
-- =========================================================================
--
-- El encargo dice «almacén, precio y cantidad». Pero la planilla YA trae una
-- columna `precio`, y es el precio de VENTA: va a `precios_venta` y decide a
-- cuánto se le factura al cliente.
--
-- Lo que hace falta para meter existencia es otro número: cuánto VALE lo que
-- entra. De ahí sale el costo promedio, y con él el valor del inventario y lo
-- que va a costar cada consumo futuro. Meter el precio de venta como si fuera
-- costo infla el inventario y hace que cada salida se cargue de más, en
-- silencio y para siempre.
--
-- Por eso la columna nueva se llama `costo` y no reutiliza `precio`. Son dos
-- números distintos que en esta planilla pueden convivir en la misma fila: se
-- carga el artículo, lo que hay de él, lo que vale, y a cuánto se vende.
--
-- =========================================================================
-- NO SE ESCRIBEN MOVIMIENTOS AQUÍ
-- =========================================================================
--
-- Se llama a `registrar_entradas`, que es la puerta que ya existe. Con eso
-- vienen gratis y sin copiar nada: el cerrojo de existencia (regla 8), el
-- recálculo del costo promedio, el número de movimiento y la auditoría.
-- Escribir movimientos a mano aquí sería una segunda puerta al mismo sitio, con
-- su propia forma de equivocarse.
--
-- Y no abre ningún hueco de permiso: `registrar_entradas` pide el rol ALMACEN,
-- que por equivalencia es INVENTARIO:ESCRITURA — exactamente lo que ya pide
-- esta función para entrar. Quien puede cargar la planilla puede meter la
-- existencia, así que nadie va a quedarse a medias.
--
-- Todo va en una sola transacción: si la entrada falla, los artículos tampoco
-- quedan.
--
-- =========================================================================
-- COMPROBADO, en transacción revertida
-- =========================================================================
--
--   EN SECO: total=5 nuevos=2 con_existencia=1 errores=3 aplicado=false
--     fila 3: «Hay cantidad pero falta el costo…»
--     fila 4: «El almacén "ALMACEN DE LA LUNA" no existe o está inactivo…»
--     fila 5: «Esto no se inventaría, así que no puede tener existencia…»
--     y no se creó nada: artículos ENS-* = 0
--
--   CONFIRMADA: nuevos=2 con_existencia=1 aplicado=true
--     existencia en ALM-GEN = 100
--     movimientos escritos = 1   <- uno por almacén, no uno por artículo
--     el movimiento dice: CARGA INICIAL POR PLANILLA

create or replace function public.cargar_articulos_por_lote(p_filas jsonb, p_confirmar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
    perform private.exigir_permiso('VENTAS', 'ESCRITURA');
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_n := v_n + 1;
    v_motivo := null;
    v_estado := null;
    v_almacen_id := null;
    v_cantidad := null;
    v_costo := null;

    v_codigo    := upper(btrim(coalesce(v_fila->>'codigo', '')));
    v_nombre    := btrim(coalesce(v_fila->>'nombre', ''));
    v_categoria := upper(btrim(coalesce(v_fila->>'categoria', '')));
    v_unidad    := upper(btrim(coalesce(v_fila->>'unidad', '')));
    v_modo      := upper(btrim(coalesce(nullif(btrim(coalesce(v_fila->>'modo_entrega','')), ''), 'CONSUMIBLE')));
    v_moneda    := upper(btrim(coalesce(nullif(btrim(coalesce(v_fila->>'moneda','')), ''), 'USD')));
    v_almacen_txt := btrim(coalesce(v_fila->>'almacen', ''));

    if v_codigo = '' then
      v_motivo := 'Falta el código.';
    elsif v_nombre = '' then
      v_motivo := 'Falta el nombre.';
    elsif v_categoria = '' then
      v_motivo := 'Falta la categoría.';
    elsif v_unidad = '' then
      v_motivo := 'Falta la unidad.';

    elsif v_codigo = any(v_vistos) then
      v_motivo := format('El código %s se repite en la planilla.', v_codigo);

    elsif v_categoria not in ('PRODUCTO','REPUESTO','INSUMO','COMBUSTIBLE','LUBRICANTE',
                              'EPP','HERRAMIENTA','EXPLOSIVO','SERVICIO') then
      v_motivo := format('«%s» no es una categoría del sistema.', v_categoria);

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
      elsif v_precio is not null
            and not exists (select 1 from public.monedas where codigo = v_moneda and activa) then
        v_motivo := format('La moneda «%s» no está activa en el sistema.', v_moneda);
      end if;

      /*
        LA EXISTENCIA. Las tres van juntas o no va ninguna.

        Media fila —un almacén sin cantidad, una cantidad sin costo— casi
        siempre es una celda que se quedó sin llenar, y adivinar el resto es
        meter existencia que nadie pidió. Se avisa y se para.
      */
      if v_motivo is null and (v_almacen_txt <> '' or v_cantidad is not null or v_costo is not null) then
        if not v_inv then
          v_motivo := 'Esto no se inventaría, así que no puede tener existencia en un almacén.';
        elsif v_almacen_txt = '' then
          v_motivo := 'Hay cantidad o costo pero falta el almacén: no se sabe dónde meterlo.';
        elsif v_cantidad is null then
          v_motivo := 'Hay almacén pero falta la cantidad.';
        elsif v_costo is null then
          v_motivo := 'Hay cantidad pero falta el costo. Sin él, lo que entra vale cero y cada salida futura se carga mal.';
        elsif v_cantidad <= 0 then
          v_motivo := 'La cantidad que entra tiene que ser mayor que cero.';
        elsif v_costo <= 0 then
          v_motivo := 'El costo por unidad tiene que ser mayor que cero.';
        elsif not exists (select 1 from public.monedas where codigo = v_moneda and activa) then
          v_motivo := format('La moneda «%s» no está activa en el sistema.', v_moneda);
        else
          -- Por código o por nombre: quien llena la planilla escribe lo que ve
          -- en la pantalla de almacenes, y ahí se lee el nombre.
          select a.id into v_almacen_id
            from public.almacenes a
           where a.activo
             and (upper(a.codigo) = upper(v_almacen_txt) or upper(a.nombre) = upper(v_almacen_txt));

          if v_almacen_id is null then
            v_motivo := format('El almacén «%s» no existe o está inactivo. Los que hay: %s.',
              v_almacen_txt,
              (select string_agg(a.codigo || ' · ' || a.nombre, ', ' order by a.nombre)
                 from public.almacenes a where a.activo));
          end if;
        end if;
      end if;
    end if;

    if v_motivo is not null then
      v_errores := v_errores + 1;
      v_estado  := 'ERROR';
    else
      v_vistos := v_vistos || v_codigo;
      select id into v_id from public.articulos where codigo = v_codigo;

      if v_id is null then
        v_estado := 'NUEVO';
        v_nuevos := v_nuevos + 1;
      else
        v_estado := 'ACTUALIZA';
        v_actualizados := v_actualizados + 1;
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
            (v_codigo, v_nombre, nullif(btrim(coalesce(v_fila->>'descripcion','')), ''),
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
                                 'costo', v_costo, 'moneda', v_moneda));
        end if;
      end if;
    end if;

    v_informe := v_informe || jsonb_build_object(
      'fila', v_n,
      'codigo', v_codigo,
      'nombre', v_nombre,
      'estado', v_estado,
      'motivo', v_motivo);
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
    'errores', v_errores,
    'aplicado', p_confirmar and v_errores = 0,
    'filas', v_informe);
end;
$function$;

revoke all on function public.cargar_articulos_por_lote(jsonb, boolean) from public, anon;
grant execute on function public.cargar_articulos_por_lote(jsonb, boolean) to authenticated;

comment on function public.cargar_articulos_por_lote(jsonb, boolean) is
  'Da de alta y corrige articulos desde una planilla, y opcionalmente mete su existencia inicial. Las columnas almacen, cantidad y costo van juntas o no van: media fila es una celda sin llenar, no una intencion. La existencia se mete llamando a registrar_entradas —una vez por almacen— para no duplicar el cerrojo ni el costo promedio. Ojo: `precio` es el de VENTA y `costo` es lo que vale lo que entra; son dos numeros distintos.';
