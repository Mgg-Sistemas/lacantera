-- ---------------------------------------------------------------------------
-- Una compra contra entrega tiene que poder terminarse
--
-- LO QUE PASABA
--
-- La pantalla de Recepciones decía «2 por recibir» y al abrir cualquiera de
-- las dos respondía «Ya se recibió todo lo de esta orden», con el botón
-- apagado. Las dos cosas eran ciertas a la vez, y por eso confundía tanto: el
-- material había llegado completo, pero la orden nunca dejaba de figurar como
-- pendiente.
--
-- El culpable era una rama mal ordenada en `registrar_recepcion`:
--
--     v_nuevo := case
--          when condicion_pago = 'CONTRA_ENTREGA' then 'POR_INDICAR_PAGO'
--          when v_pendiente <= 0.0001 then 'RECIBIDA'
--          else 'RECIBIDA_PARCIAL' end;
--
-- La primera rama gana siempre y no mira si queda algo pendiente, así que una
-- orden contra entrega **no podía llegar a RECIBIDA jamás**. Después el pago la
-- movía a PAGADA_POR_RECIBIR y ahí se quedaba: ocupando la columna «pagada,
-- pendiente por recepcionar», sumando días en la alarma de compras pagadas sin
-- recibir, por un material que ya estaba en el almacén.
--
-- Y HABÍA UN SEGUNDO CALLEJÓN
--
-- `registrar_recepcion` solo admitía PAGADA_POR_RECIBIR, RECIBIDA_PARCIAL y
-- POR_RECIBIR. En una recepción parcial contra entrega la orden pasa por
-- POR_INDICAR_PAGO y EN_TESORERIA mientras se paga esa parte — dos estados que
-- no estaban en la lista. El resto del material no podía entrar nunca y se
-- quedaba fuera del sistema.
--
-- CÓMO SE DECIDE AHORA
--
-- Contra entrega es la única condición donde se recibe antes de pagar, así que
-- tiene dos frentes abiertos a la vez: lo que falta por llegar y lo que falta
-- por pagar de lo que ya llegó. `private.estado_tras_recepcion` mira los dos.
-- Las demás condiciones pagan primero, así que solo miran el material.
-- ---------------------------------------------------------------------------
create or replace function private.estado_tras_recepcion(p_orden_id bigint)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $func$
declare
  v_cond      text;
  v_pendiente numeric;
  v_tope      numeric;
  v_instruido numeric;
begin
  select condicion_pago into v_cond from public.ordenes_compra where id = p_orden_id;

  select coalesce(sum(cantidad - cantidad_recibida), 0)
    into v_pendiente
  from public.orden_renglones where orden_id = p_orden_id;

  -- En cualquier condición que no sea contra entrega el dinero ya salió antes
  -- de recibir, así que lo único que decide es si falta material.
  if coalesce(v_cond, '') <> 'CONTRA_ENTREGA' then
    return case when v_pendiente <= 0.0001 then 'RECIBIDA' else 'RECIBIDA_PARCIAL' end;
  end if;

  v_tope := private.tope_pagable(p_orden_id);

  select coalesce(sum(i.monto), 0) into v_instruido
  from public.instrucciones_pago i
  where i.orden_id = p_orden_id and i.estado in ('POR_PAGAR', 'PAGADA');

  if v_tope - v_instruido > 0.01 then
    -- Llegó material que todavía nadie mandó a pagar.
    return 'POR_INDICAR_PAGO';
  end if;

  -- Lo recibido está pagado. Si además llegó todo, la compra terminó.
  return case when v_pendiente <= 0.0001 then 'RECIBIDA' else 'RECIBIDA_PARCIAL' end;
end;
$func$;

comment on function private.estado_tras_recepcion is
  'A qué estado queda una orden después de recibir material. Contra entrega '
  'mira dos cosas —lo que falta por llegar y lo que falta por pagar de lo ya '
  'llegado— porque en esa condición los dos frentes avanzan a la vez.';

-- ---------------------------------------------------------------------------
create or replace function public.registrar_recepcion(
  p_orden_id   bigint,
  p_almacen_id bigint,
  p_renglones  jsonb,
  p_nota       text default null,
  p_fecha      date default null
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_estado    text;
  v_cond      text;
  v_moneda    char(3);
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

  -- Contra entrega admite dos estados más. Al recibir una parte la orden se va
  -- a POR_INDICAR_PAGO y de ahí a EN_TESORERIA mientras se paga esa parte; si
  -- esos dos no admitieran recepción, el resto del material no podría entrar
  -- nunca y se quedaría fuera del sistema.
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

-- ---------------------------------------------------------------------------
-- Y se recolocan las que quedaron atrapadas por el fallo
--
-- OC-2026-0005 y OC-2026-0006 tenían el material completo y pagado, y seguían
-- contando como pendientes. Se recalcula su estado con la misma regla nueva;
-- las que ya estaban bien no se tocan.
-- ---------------------------------------------------------------------------
do $$
declare o record; v_nuevo text;
begin
  for o in
    select id, estado from public.ordenes_compra
     where estado in ('PAGADA_POR_RECIBIR', 'RECIBIDA_PARCIAL', 'POR_INDICAR_PAGO')
  loop
    v_nuevo := private.estado_tras_recepcion(o.id);
    if v_nuevo <> o.estado then
      update public.ordenes_compra
         set estado = v_nuevo,
             recibida_en = case when v_nuevo = 'RECIBIDA' then coalesce(recibida_en, now())
                                else recibida_en end
       where id = o.id;
    end if;
  end loop;
end $$;
