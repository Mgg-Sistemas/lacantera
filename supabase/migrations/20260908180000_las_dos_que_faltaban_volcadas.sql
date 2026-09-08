/*
  LAS DOS QUE FALTABAN, VOLCADAS.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026. No cambia nada en la base viva: son los
  mismos cuerpos que ya corren. Cierra la deuda que dejó escrita
  `20260908160000`.
  ————————————————————————————————————————————————————————————————————————

  POR QUÉ NO ESTABAN, Y POR QUÉ EL ARGUMENTO NO SE SOSTENÍA

  Escribí que no las copiaba porque «copiarlas a mano es exactamente como se
  introduce una diferencia entre el archivo y la base», y lo dejé como deuda
  declarada con plazo.

  El carril de base de datos le encontró la salida en una frase:

      «El riesgo que teméis es el de copiar a mano, y es cierto. Pero
       `pg_get_functiondef` genera el texto sin que nadie lo teclee: volcar su
       salida a un archivo no puede introducir diferencia, y es el mismo método
       con el que sacasteis los otros seis. El tamaño no es un obstáculo para un
       volcado, solo para una transcripción.»

  Es exacto, y la distinción es la que yo no hice: **transcribir y volcar no son
  la misma operación.** Mi razonamiento valía contra el primero y lo apliqué al
  segundo, que es donde no aplica. La deuda no hacía falta.

  QUÉ TRAE CADA UNA

    registrar_recepcion  La reja del costo raro, la misma que las entradas: un
                         precio que se sale diez veces del promedio no entra sin
                         que alguien lo acepte, y el factor queda anotado en
                         `aviso_costo`. Sin este archivo, reconstruir desde cero
                         devolvía la recepción que metía cualquier precio al
                         libro.
    crear_articulo       Para cuando ya existe un artículo cuyo nombre se reduce
                         al mismo núcleo —«Insumos» e «Insumo»— salvo que venga
                         confirmado, y pone el código si no se le da uno. Sin
                         este archivo volvía el catálogo que no reconoce
                         duplicados y que exige un código que nadie tiene.
*/

do $guarda$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='nombre_nucleo') then
    raise exception 'Falta private.nombre_nucleo.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='estado_tras_recepcion') then
    raise exception 'Falta private.estado_tras_recepcion.';
  end if;
end $guarda$;

-- ===========================================================================
-- La recepcion, que tambien duda del precio
-- ===========================================================================
create or replace function public.registrar_recepcion(
  p_orden_id bigint, p_almacen_id bigint, p_renglones jsonb,
  p_nota text default null, p_fecha date default null
) returns integer language plpgsql security definer set search_path to ''
as $function$
declare
  v_estado    text;
  v_cond      text;
  v_moneda    text;
  v_tasa      numeric;
  v_tasa_usd  numeric;
  v_item      jsonb;
  v_renglon   public.orden_renglones;
  v_cantidad  numeric;
  v_costo_usd numeric;
  v_movs      integer := 0;
  v_nuevo     text;
  c_factor    constant numeric := 10;
  v_ref       numeric;
  v_veces     numeric;
  v_msg       text;
  v_nombre    text;
begin
  perform private.exigir_rol('ALMACEN');

  select estado, condicion_pago, moneda, tasa, tasa_usd
    into v_estado, v_cond, v_moneda, v_tasa, v_tasa_usd
  from public.ordenes_compra where id = p_orden_id;

  if v_estado is null then
    raise exception 'No existe la orden %.', p_orden_id using errcode = 'P0002';
  end if;

  /*
    Sin factura ni nota de entrega, el material no entra.

    El comprobante de pago NO cuenta: dice que se pagó, no que llegó ni qué
    llegó. Es el papel del proveedor el que dice qué se está recibiendo, y es
    el que hace falta para reclamar si falta algo.
  */
  if not exists (
    select 1 from public.compras_papeles p
     where p.orden_id = p_orden_id
       and p.tipo in ('FACTURA', 'NOTA_ENTREGA')
  ) then
    raise exception 'Falta el papel del proveedor: sin factura o nota de entrega el material no entra.'
      using errcode = '22023',
            hint = 'Súbela en «Papeles» de esta compra. El comprobante de pago puede esperar.';
  end if;

  -- Contra entrega admite dos estados mas. Al recibir una parte, la orden se va
  -- a POR_INDICAR_PAGO y de ahi a EN_TESORERIA mientras se paga esa parte; si
  -- esos dos no admitieran recepcion, el resto del material no podria entrar
  -- nunca y se quedaria fuera del sistema.
  if v_cond = 'CONTRA_ENTREGA' then
    if v_estado not in ('POR_RECIBIR', 'POR_INDICAR_PAGO', 'EN_TESORERIA',
                        'PAGADA_POR_RECIBIR', 'RECIBIDA_PARCIAL') then
      raise exception 'Esta orden está en "%" y no admite recepción.', v_estado
        using errcode = '55000';
    end if;
  elsif v_estado not in ('PAGADA_POR_RECIBIR', 'RECIBIDA_PARCIAL', 'POR_RECIBIR') then
    raise exception 'Esta orden está en "%" y no admite recepción.', v_estado
      using errcode = '55000';
  end if;

  if not exists (select 1 from public.almacenes where id = p_almacen_id and activo) then
    raise exception 'El almacén indicado no existe o está inactivo.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'Indica qué llegó y en qué cantidad.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_cantidad := (v_item->>'cantidad')::numeric;

    if coalesce(v_cantidad, 0) <= 0 then
      continue;   -- Renglón que no llegó en este viaje.
    end if;

    select * into v_renglon
    from public.orden_renglones
    where id = (v_item->>'orden_renglon_id')::bigint and orden_id = p_orden_id;

    if v_renglon.id is null then
      raise exception 'Ese renglón no pertenece a la orden %.', p_orden_id using errcode = '22023';
    end if;

    -- Recibir de más no es un descuido: o llegó otra cosa, o el precio pactado
    -- ya no cubre lo que entró. En cualquier caso hay que mirarlo antes.
    if v_renglon.cantidad_recibida + v_cantidad > v_renglon.cantidad + 0.0001 then
      raise exception 'De "%" se pidieron % y ya se recibieron %. No se pueden recibir % más.',
        v_renglon.descripcion, v_renglon.cantidad, v_renglon.cantidad_recibida, v_cantidad
        using errcode = '22023';
    end if;

    update public.orden_renglones
       set cantidad_recibida = cantidad_recibida + v_cantidad
     where id = v_renglon.id;

    -- Solo entra al libro lo que es inventariable. Un flete o una reparación
    -- se compran y se pagan, pero no hay nada que guardar en un estante.
    if v_renglon.articulo_id is not null
       and exists (select 1 from public.articulos
                   where id = v_renglon.articulo_id and inventariable) then

      v_costo_usd := round(v_renglon.precio_unitario * v_tasa / v_tasa_usd, 6);

      /*
        LA MISMA REJA QUE LA ENTRADA, PORQUE ES LA MISMA PUERTA.

        Esta era la que faltaba. Lo levanto el carril de base de datos el
        7/09/2026, corrigiendose a si mismo: habia dado esto por revisado
        suponiendo que «el numero viene de una orden y ya lo miro alguien». Es
        una suposicion sobre el proceso, no una lectura del codigo — el precio
        del renglon se teclea, y de aqui pasaba al libro sin que nada dudara.

        Le confundio que esta funcion SI tiene reja, la del papel del proveedor.
        Esa comprueba que exista un documento, no que el precio sea sensato: son
        dos controles y los conto como uno.

        Va la tercera con la misma forma —el vale con destino a mano, el
        traslado, y ahora la recepcion—: la comprobacion existe y hay una puerta
        al lado que no pasa por ella.

        La confirmacion viaja EN EL RENGLON y no como parametro nuevo: anadir un
        argumento crea una firma nueva que hay que soltar a mano, y eso ya
        mordio dos veces hoy.
      */
      v_ref := private.costo_promedio(p_almacen_id, v_renglon.articulo_id);
      v_veces := null;

      if coalesce(v_ref, 0) > 0 then
        v_veces := round(v_costo_usd / v_ref, 2);
        if v_veces >= c_factor or v_veces <= (1 / c_factor) then
          if not coalesce((v_item->>'confirmado')::boolean, false) then
            select nombre into v_nombre from public.articulos where id = v_renglon.articulo_id;
            v_msg := case when private.puede_accion('INVENTARIO.VER_VALORACION')
              then format('%s viene costando %s por unidad y en esta orden entra a %s: son %s. Si el precio de la orden es correcto, acéptalo y quedará anotado.',
                          v_nombre, private.numero_es(v_ref, 4), private.numero_es(v_costo_usd, 4),
                          case when v_veces >= 1 then private.numero_es(v_veces, 2) || ' veces mas'
                               else private.numero_es(v_ref / nullif(v_costo_usd, 0), 2) || ' veces menos' end)
              else format('El costo de %s en esta orden se sale mucho de lo que ese artículo viene costando. Compruébalo con la factura del proveedor.', v_nombre)
            end;
            raise exception '%', v_msg
              using errcode = '22023',
                    hint = 'Si el precio de la orden esta mal, corrigelo en la orden antes de recibir: aqui solo se acepta o se para.';
          end if;
        else
          v_veces := null;
        end if;
      end if;

      perform private.registrar_movimiento(
        'ENTRADA_COMPRA', 1, p_almacen_id, v_renglon.articulo_id,
        v_cantidad, v_costo_usd, p_nota, p_orden_id, v_renglon.id, null, p_fecha,
        p_aviso_costo => v_veces);

      v_movs := v_movs + 1;
    end if;
  end loop;

  if v_movs = 0 and not exists (
    select 1 from jsonb_array_elements(p_renglones) e
    where coalesce((e->>'cantidad')::numeric, 0) > 0
  ) then
    raise exception 'No se indicó ninguna cantidad recibida.' using errcode = '22023';
  end if;

  v_nuevo := private.estado_tras_recepcion(p_orden_id);

  update public.ordenes_compra
     set estado = v_nuevo,
         recibida_en = case when v_nuevo = 'RECIBIDA' then now() else recibida_en end
   where id = p_orden_id;

  perform private.anotar('ORDEN', p_orden_id, v_estado, v_nuevo, p_nota);

  return v_movs;
end;
$function$;

-- ===========================================================================
-- El alta de articulo, que avisa del parecido y pone el codigo
-- ===========================================================================
create or replace function public.crear_articulo(
  p_codigo text, p_nombre text, p_categoria text, p_unidad text,
  p_descripcion text default null, p_inventariable boolean default true,
  p_stock_minimo numeric default 0, p_modo_entrega text default null,
  p_reparable boolean default null, p_presentacion text default null,
  p_unidades_por_presentacion numeric default null, p_marca text default null,
  p_numero_parte text default null, p_confirmado boolean default false
) returns bigint language plpgsql security definer set search_path to ''
as $function$
declare
  v_id        bigint;
  v_modo      text;
  v_codigo    text;
  v_reparable boolean;
  v_pres      text := nullif(trim(coalesce(p_presentacion, '')), '');
  v_igual     record;
begin
  perform private.exigir_rol('COMPRAS', 'ALMACEN');

  if length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El artículo necesita un nombre.' using errcode = '22023';
  end if;

  /*
    EL QUE YA ESTA Y SE LLAMA IGUAL.

    Christopher: «debemos asegurar que el sistema impide (o minimo
    advierte/sugiere) duplicados... Insumos o Insumo, Repuesto disco de corte 7'
    o Disco de corte 7'».

    Aqui se PARA, no se impide: dos articulos pueden llamarse casi igual y ser
    dos cosas —DISCO DE CORTE 7 y DISCO DE CORTE 9—, asi que la decision es de
    quien lo esta creando. Lo que no puede pasar es que la tome sin enterarse.

    Solo salta con el nucleo IDENTICO. Los parecidos de menos —«aceite motor SAE
    50» contra «ACEITE DE MOTOR SAE 50»— los ensena la pantalla mientras se
    escribe, con `articulos_parecidos`, que para eso sugiere sin bloquear.

    El inactivo tambien cuenta: se desactiva lo que deja de usarse, no lo que
    deja de existir, y volver a crearlo con otro codigo parte su historia en dos.
  */
  if not coalesce(p_confirmado, false) then
    select a.codigo, a.nombre, a.activo into v_igual
      from public.articulos a
     where private.nombre_nucleo(a.nombre) = private.nombre_nucleo(p_nombre)
     order by a.activo desc
     limit 1;

    if v_igual.codigo is not null then
      -- Tres huecos separados. `%%` seria un porcentaje literal, no dos.
      raise exception 'Ya existe «%» con el código %.% Si de verdad es otra cosa, confírmalo.',
        v_igual.nombre, v_igual.codigo,
        case when v_igual.activo then '' else ' Está inactivo, pero sigue en el catálogo.' end
        using errcode = '22023',
              hint = 'Dos artículos casi iguales acaban con la existencia repartida entre los dos y ninguno cuadrando.';
    end if;
  end if;

  /*
    EL CODIGO NO SE PIDE: SE PONE.

    Once de los quince articulos de hoy llevan el nombre metido en el campo del
    codigo —«ACEITE AGROFLUIDOS» es a la vez nombre y codigo— porque la planilla
    lo exigia y quien la lleno no tenia ninguno que escribir. Un codigo que es
    el nombre no distingue nada: el indice unico deja pasar el mismo articulo
    dos veces con una letra de diferencia.
  */
  v_codigo := nullif(upper(trim(coalesce(p_codigo, ''))), '');
  if v_codigo is null then
    v_codigo := private.codigo_de_articulo(p_categoria);
  end if;

  v_reparable := coalesce(p_reparable, p_categoria in ('HERRAMIENTA', 'REPUESTO'));

  v_modo := coalesce(nullif(trim(coalesce(p_modo_entrega, '')), ''),
    case p_categoria
      when 'HERRAMIENTA' then 'RETORNABLE'
      when 'EPP'         then 'RETORNABLE'
      when 'PRODUCTO'    then 'NO'
      when 'SERVICIO'    then 'NO'
      else 'CONSUMIBLE'
    end);

  if v_pres is null and p_unidades_por_presentacion is not null then
    raise exception 'Dice cuántas unidades trae la presentación, pero no dice cuál es. Escribe la presentación o deja las dos vacías.'
      using errcode = '22023';
  end if;

  insert into public.articulos
    (codigo, nombre, descripcion, categoria, unidad, inventariable, stock_minimo,
     modo_entrega, reparable, presentacion, unidades_por_presentacion,
     marca, numero_parte, creado_por)
  values
    (v_codigo, trim(p_nombre), nullif(trim(coalesce(p_descripcion, '')), ''),
     p_categoria, p_unidad,
     case when p_categoria = 'SERVICIO' then false else p_inventariable end,
     coalesce(p_stock_minimo, 0), v_modo, v_reparable,
     v_pres, p_unidades_por_presentacion,
     nullif(trim(coalesce(p_marca, '')), ''),
     nullif(trim(coalesce(p_numero_parte, '')), ''),
     (select auth.uid()))
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe un artículo con el código %.', v_codigo
      using errcode = '23505';
  when foreign_key_violation then
    raise exception 'Esa presentación no está en la lista.' using errcode = '23503';
end;
$function$;

revoke execute on function public.crear_articulo(text,text,text,text,text,boolean,numeric,text,boolean,text,numeric,text,text,boolean) from public, anon;
grant execute on function public.crear_articulo(text,text,text,text,text,boolean,numeric,text,boolean,text,numeric,text,text,boolean) to authenticated;

/*
  COMPROBADO el 8 de septiembre, con el metodo que ya usa
  `20260908130000`: cada cuerpo de aqui contra `pg_proc.prosrc` de la base viva,
  quitando comentarios de bloque y de linea y colapsando espacios.

  La leccion del carril de BD sobre su propia medicion vale para las dos
  partes y se anota: **antes de acusar a un archivo de mentir hay que igualar la
  normalizacion de los dos lados.** Su primera comparacion dio «no coinciden»
  porque quitaba los `--` y no los bloques `/* */`.

  Con esto, la deriva queda en cero: los nueve objetos que el repositorio no
  describia el 8 de septiembre a las 08:45 estan todos escritos.
*/
