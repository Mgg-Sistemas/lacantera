-- ---------------------------------------------------------------------------
-- No entra material sin su papel
--
-- La líder describió el flujo así:
--
--   «El equipo de compras entra al sistema para registrar un movimiento de
--    compra/pedido. Intentan guardar sin subir nada → el sistema muestra error
--    (porque falta la factura o nota de entrega). Suben la factura escaneada,
--    pero aún no tienen el comprobante de transferencia → el sistema los deja
--    guardar (porque el comprobante es opcional). Suben tanto la factura como el
--    comprobante → el sistema guarda sin problema.»
--
-- =========================================================================
-- DÓNDE VA LA REJA, QUE ERA LA PREGUNTA DE VERDAD
-- =========================================================================
--
-- «Registrar un movimiento de compra» admitía dos lecturas con consecuencias muy
-- distintas, y se preguntó antes de elegir: al CREAR el pedido o al RECIBIR el
-- material. Christopher eligió al recibir, y es lo correcto por una razón
-- física: al crear el pedido el proveedor todavía no ha entregado nada, así que
-- exigir su factura ahí no bloquearía «los pedidos sin papel», bloquearía TODOS.
--
-- Al recibir, el papel viene con el camión. Es el único momento en que existe.
--
-- Y sin excepción: tampoco el gerente. Fue la otra respuesta, y evita el camino
-- por el que estas rejas se erosionan —primero es una excepción, después es la
-- costumbre—.
--
-- =========================================================================
-- EL COMPROBANTE DE PAGO NO SE PIDE, Y ESO TAMBIÉN ESTÁ PENSADO
-- =========================================================================
--
-- Es opcional porque llega después y de otras manos. Pedirlo aquí obligaría a
-- retener el material en el portón esperando a que alguien mande la captura de
-- la transferencia, que es exactamente lo que la líder describió que NO debe
-- pasar.
--
-- Y tampoco vale como sustituto: un comprobante dice que se pagó, no qué llegó.
-- El papel que dice qué se está recibiendo es el del proveedor, y es el que hace
-- falta para reclamar si falta algo.
--
-- =========================================================================
-- LA REJA VA EN LA BASE Y NO EN LA PANTALLA
-- =========================================================================
--
-- La pantalla también lo dice —enterarse al pulsar Guardar, con el camión en el
-- portón, es tarde— pero la que manda es esta: `registrar_recepcion` es la única
-- puerta por la que entra material de una compra, y una regla que solo vive en
-- el navegador es una regla que se salta cualquiera que llame a la función.
--
-- COMPROBADO, en transacción revertida:
--
--   recibir sin ningún papel ........ parado: «Falta el papel del proveedor»
--   solo con comprobante de pago .... parado, por lo mismo
--   con nota de entrega ............. pasa
-- ---------------------------------------------------------------------------

create or replace function public.registrar_recepcion(
  p_orden_id bigint,
  p_almacen_id bigint,
  p_renglones jsonb,
  p_nota text default null::text,
  p_fecha date default null::date
)
returns integer
language plpgsql
security definer
set search_path to ''
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

      perform private.registrar_movimiento(
        'ENTRADA_COMPRA', 1, p_almacen_id, v_renglon.articulo_id,
        v_cantidad, v_costo_usd, p_nota, p_orden_id, v_renglon.id, null, p_fecha);

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

comment on function public.registrar_recepcion(bigint, bigint, jsonb, text, date) is
  'Mete en el almacén lo que llegó de una compra. No deja entrar material sin factura o nota de entrega adjunta: el comprobante de pago no cuenta, porque dice que se pagó y no qué llegó.';
