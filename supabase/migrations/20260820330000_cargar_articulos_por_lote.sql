-- ---------------------------------------------------------------------------
-- Cargar artículos por lote, desde una planilla
--
-- LO QUE PIDE LA LÍDER DE SISTEMAS
--
-- Que el sistema dé una plantilla, que el usuario la llene y la suba, que el
-- sistema compruebe que está entera y que dice cosas que el sistema entiende, y
-- que entonces —y solo entonces— cargue los datos.
--
-- POR QUÉ LA COMPROBACIÓN VIVE AQUÍ Y NO EN EL NAVEGADOR
--
-- El navegador también comprueba, para que quien sube el archivo vea el error
-- sin esperar. Pero esa comprobación es una cortesía, no una garantía: el
-- navegador no escribe (regla 1 de la casa), y lo que decide qué entra es esta
-- función. Si las dos discrepan, manda esta.
--
-- DOS PASADAS: MIRAR Y APLICAR
--
-- `p_confirmar = false` comprueba y devuelve el informe sin tocar nada. Es la
-- pasada que se enseña en pantalla antes de que nadie decida. Con `true` hace
-- lo mismo y además escribe.
--
-- Es la misma función a propósito. Dos funciones —una que valida y otra que
-- carga— acabarían divergiendo el día que se añada una regla a una sola, y el
-- usuario vería «todo correcto» y luego un error.
--
-- TODO O NADA
--
-- Si una sola fila está mal, no entra ninguna. Una carga a medias de una lista
-- de precios es peor que ninguna: nadie sabe luego qué quedó dentro y qué no,
-- y el archivo ya no sirve para volver a intentarlo porque repetiría lo que sí
-- entró. Se devuelve el número de fila y el motivo de cada error para que se
-- corrija la planilla y se suba otra vez.
--
-- QUÉ SE CARGA
--
-- El artículo y, si la planilla lo trae, su precio de venta. Van juntos porque
-- es lo que hace falta: hay 170 artículos y cero precios, así que cargar el
-- catálogo sin el precio dejaría Ventas igual de parado que antes.
--
-- El código manda. Si ya existe, se actualiza; si no, se crea. Así la misma
-- planilla sirve para dar de alta y para corregir, y subirla dos veces no
-- duplica nada.
-- ---------------------------------------------------------------------------

create or replace function public.cargar_articulos_por_lote(
  p_filas jsonb,
  p_confirmar boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $func$
declare
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

  v_motivo    text;
  v_estado    text;
  v_id        bigint;
  v_vistos    text[] := array[]::text[];
begin
  perform private.exigir_permiso('INVENTARIO', 'ESCRITURA');

  if jsonb_typeof(p_filas) <> 'array' then
    raise exception 'La planilla no trae filas.' using errcode = '22023';
  end if;

  -- Poner precios es tocar la lista de ventas, aunque se haga desde una
  -- planilla de inventario. Quien no lleva ventas puede cargar el catálogo,
  -- pero no ponerle precio.
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

    v_codigo    := upper(btrim(coalesce(v_fila->>'codigo', '')));
    v_nombre    := btrim(coalesce(v_fila->>'nombre', ''));
    v_categoria := upper(btrim(coalesce(v_fila->>'categoria', '')));
    v_unidad    := upper(btrim(coalesce(v_fila->>'unidad', '')));
    v_modo      := upper(btrim(coalesce(nullif(btrim(coalesce(v_fila->>'modo_entrega','')), ''), 'CONSUMIBLE')));
    v_moneda    := upper(btrim(coalesce(nullif(btrim(coalesce(v_fila->>'moneda','')), ''), 'USD')));

    -- --------------------------------------------------------------- lo obligatorio
    if v_codigo = '' then
      v_motivo := 'Falta el código.';
    elsif v_nombre = '' then
      v_motivo := 'Falta el nombre.';
    elsif v_categoria = '' then
      v_motivo := 'Falta la categoría.';
    elsif v_unidad = '' then
      v_motivo := 'Falta la unidad.';

    -- ------------------------------------------------------- el código, una sola vez
    elsif v_codigo = any(v_vistos) then
      v_motivo := format('El código %s se repite en la planilla.', v_codigo);

    -- ----------------------------------------------------------------- los catálogos
    elsif v_categoria not in ('PRODUCTO','REPUESTO','INSUMO','COMBUSTIBLE','LUBRICANTE',
                              'EPP','HERRAMIENTA','EXPLOSIVO','SERVICIO') then
      v_motivo := format('«%s» no es una categoría del sistema.', v_categoria);

    elsif v_modo not in ('NO','RETORNABLE','CONSUMIBLE') then
      v_motivo := format('«%s» no dice qué pasa al entregarlo: NO, RETORNABLE o CONSUMIBLE.', v_modo);

    -- La unidad es catálogo cerrado, no texto libre: `articulos.unidad` es
    -- clave foránea contra `unidades`. Sin esta comprobación una unidad
    -- inventada pasaba el informe como buena y reventaba al aplicar, con el
    -- error crudo de la clave foránea. Lo descubrió el ensayo con «VIAJE».
    elsif not exists (select 1 from public.unidades where codigo = v_unidad) then
      v_motivo := format('La unidad «%s» no existe. Las que hay: %s.',
        v_unidad,
        (select string_agg(u.codigo, ', ' order by u.codigo) from public.unidades u));

    else
      -- ------------------------------------------------------------------- los números
      begin
        v_minimo   := coalesce(nullif(btrim(coalesce(v_fila->>'stock_minimo','')), '')::numeric, 0);
        v_densidad := nullif(btrim(coalesce(v_fila->>'densidad_ton_m3','')), '')::numeric;
        v_precio   := nullif(btrim(coalesce(v_fila->>'precio','')), '')::numeric;
        v_precio_min := nullif(btrim(coalesce(v_fila->>'precio_minimo','')), '')::numeric;
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
    end if;

    -- ------------------------------------------------------------------ el veredicto
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

      if p_confirmar then
        if v_id is null then
          insert into public.articulos
            (codigo, nombre, descripcion, categoria, unidad, inventariable,
             stock_minimo, densidad_ton_m3, modo_entrega, creado_por)
          values
            (v_codigo, v_nombre, nullif(btrim(coalesce(v_fila->>'descripcion','')), ''),
             v_categoria, v_unidad, v_inv, v_minimo, v_densidad, v_modo, (select auth.uid()))
          returning id into v_id;
        else
          update public.articulos
             set nombre = v_nombre,
                 descripcion = coalesce(nullif(btrim(coalesce(v_fila->>'descripcion','')), ''), descripcion),
                 categoria = v_categoria,
                 unidad = v_unidad,
                 inventariable = v_inv,
                 stock_minimo = v_minimo,
                 densidad_ton_m3 = coalesce(v_densidad, densidad_ton_m3),
                 modo_entrega = v_modo
           where id = v_id;
        end if;

        if v_precio is not null then
          insert into public.precios_venta
            (articulo_id, moneda, precio, precio_minimo, actualizado_por, actualizado_en)
          values
            -- Sin mínimo declarado va cero, que es lo que ya hace la pantalla
            -- de precios (`Number(...) || 0`) y significa «no hay suelo». La
            -- columna es NOT NULL con default cero, así que mandar NULL
            -- explícito pisaba el default y reventaba.
            (v_id, v_moneda, v_precio, coalesce(v_precio_min, 0), (select auth.uid()), now())
          on conflict (articulo_id) do update
            set moneda = excluded.moneda,
                precio = excluded.precio,
                precio_minimo = excluded.precio_minimo,
                actualizado_por = excluded.actualizado_por,
                actualizado_en = excluded.actualizado_en;
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

  -- Con un solo error no entra nada. Si se pidió aplicar, se deshace lo hecho
  -- levantando la excepción: es la única forma de que las filas buenas ya
  -- escritas en este bucle se vayan con ella.
  if p_confirmar and v_errores > 0 then
    raise exception 'La planilla tiene % fila(s) con problemas. No se cargó nada.', v_errores
      using errcode = '22023';
  end if;

  return jsonb_build_object(
    'total', v_n,
    'nuevos', v_nuevos,
    'actualizados', v_actualizados,
    'errores', v_errores,
    'aplicado', p_confirmar and v_errores = 0,
    'filas', v_informe);
end;
$func$;

comment on function public.cargar_articulos_por_lote(jsonb, boolean) is
  'Carga artículos y sus precios desde una planilla. Con p_confirmar en false '
  'solo comprueba y devuelve el informe; con true escribe. Todo o nada: si una '
  'fila falla, no entra ninguna.';

revoke execute on function public.cargar_articulos_por_lote(jsonb, boolean) from public, anon;
grant  execute on function public.cargar_articulos_por_lote(jsonb, boolean) to authenticated;
