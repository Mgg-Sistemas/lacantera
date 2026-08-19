-- ---------------------------------------------------------------------------
-- Pago contra entrega
--
-- QUÉ ES, Y POR QUÉ NO ES UNA ETIQUETA MÁS
--
-- Las condiciones que había —contado y crédito a 15, 30 o 60 días— cambian
-- CUÁNDO se paga, pero no el orden de las cosas: primero sale la plata,
-- después llega el material. Contra entrega invierte eso. El proveedor
-- entrega, se cuenta lo que trajo, y recién entonces se paga.
--
-- Y se paga SOLO LO QUE LLEGÓ. Si se pidieron cien sacos y llegaron sesenta,
-- se pagan sesenta. Es lo que hace que contra entrega signifique algo: si se
-- pagara el total al recibir la primera caja, sería crédito con otro nombre.
--
-- CÓMO QUEDA EL RECORRIDO
--
--   contado y crédito   aprobada → indicar pago → tesorería → pagada → recibir
--   contra entrega      aprobada → RECIBIR → indicar pago → tesorería → pagada
--
-- LA ORDEN PASA A LLEVAR SU PROPIA CONDICIÓN
--
-- Hasta ahora la condición vivía solo en la cotización, y la orden la miraba de
-- reojo por su `cotizacion_id`. Para esto no sirve: la orden es el contrato, y
-- de su condición depende si se puede pagar antes o después de recibir. Si
-- alguien edita la cotización, la regla de pago de una orden ya aprobada no
-- puede cambiar sola.
--
-- Se copia igual que ya se copian la moneda, la tasa y los totales.
-- ---------------------------------------------------------------------------

-- 1. La condición nueva. Solo del lado de compras: en ventas el cliente todavía
--    no la pidió, y añadir un valor que ninguna pantalla ofrece es dejar una
--    puerta abierta sin puerta detrás.
alter table public.cotizaciones     drop constraint if exists cotizaciones_condicion_pago_check;
alter table public.proveedores      drop constraint if exists proveedores_condicion_pago_check;
alter table public.facturas_compra  drop constraint if exists facturas_compra_condicion_pago_check;

alter table public.cotizaciones add constraint cotizaciones_condicion_pago_check
  check (condicion_pago in ('CONTADO','CREDITO_15','CREDITO_30','CREDITO_60','CONTRA_ENTREGA'));
alter table public.proveedores add constraint proveedores_condicion_pago_check
  check (condicion_pago in ('CONTADO','CREDITO_15','CREDITO_30','CREDITO_60','CONTRA_ENTREGA'));
alter table public.facturas_compra add constraint facturas_compra_condicion_pago_check
  check (condicion_pago in ('CONTADO','CREDITO_15','CREDITO_30','CREDITO_60','CONTRA_ENTREGA'));

-- 2. La orden guarda su condición.
alter table public.ordenes_compra
  add column if not exists condicion_pago text not null default 'CONTADO';

alter table public.ordenes_compra drop constraint if exists ordenes_compra_condicion_pago_check;
alter table public.ordenes_compra add constraint ordenes_compra_condicion_pago_check
  check (condicion_pago in ('CONTADO','CREDITO_15','CREDITO_30','CREDITO_60','CONTRA_ENTREGA'));

-- Las que ya existan toman la de su cotización.
update public.ordenes_compra o
   set condicion_pago = c.condicion_pago
  from public.cotizaciones c
 where c.id = o.cotizacion_id and o.condicion_pago is distinct from c.condicion_pago;

-- 3. El estado nuevo.
alter table public.ordenes_compra drop constraint if exists ordenes_compra_estado_check;
alter table public.ordenes_compra add constraint ordenes_compra_estado_check
  check (estado in (
    'POR_RECIBIR',        -- contra entrega: aprobada, esperando el material
    'POR_INDICAR_PAGO',
    'EN_TESORERIA',
    'PAGADA_POR_RECIBIR',
    'RECIBIDA_PARCIAL',
    'RECIBIDA',
    'PROVEEDOR_DESISTIO',
    'CANCELADA'));

-- ---------------------------------------------------------------------------
-- 4. La orden nace con la condición de su cotización, y en el estado que toca
--
-- Va en un disparador y no dentro de `aprobar_compra` a propósito: esa función
-- hace además el asiento, la numeración y la bitácora, y reescribirla entera
-- para cambiar dos campos es arriesgar lo que ya funciona por algo que el
-- disparador resuelve sin tocarla.
-- ---------------------------------------------------------------------------
create or replace function private.orden_hereda_condicion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_condicion text;
begin
  select condicion_pago into v_condicion
    from public.cotizaciones where id = new.cotizacion_id;

  if v_condicion is not null then
    new.condicion_pago := v_condicion;
  end if;

  -- Contra entrega arranca esperando el material, no esperando el pago.
  if new.condicion_pago = 'CONTRA_ENTREGA' and new.estado = 'POR_INDICAR_PAGO' then
    new.estado := 'POR_RECIBIR';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orden_hereda_condicion on public.ordenes_compra;
create trigger trg_orden_hereda_condicion
  before insert on public.ordenes_compra
  for each row execute function private.orden_hereda_condicion();

-- ---------------------------------------------------------------------------
-- 5. Cuánto se puede pagar de una orden
--
-- En contado y crédito, el total: la orden vale lo que vale.
--
-- En contra entrega, lo recibido prorrateado sobre el total. Se prorratea y no
-- se suma el subtotal a secas porque la orden lleva además IVA, flete y
-- descuento: pagar el subtotal de lo recibido dejaría fuera el IVA de esa misma
-- mercancía, que el proveedor factura igual.
-- ---------------------------------------------------------------------------
create or replace function private.tope_pagable(p_orden_id bigint)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
           when o.condicion_pago <> 'CONTRA_ENTREGA' then o.total
           else round(
             o.total * coalesce(
               (select sum(r.cantidad_recibida * r.precio_unitario)
                  from public.orden_renglones r where r.orden_id = o.id)
               / nullif((select sum(r.cantidad * r.precio_unitario)
                           from public.orden_renglones r where r.orden_id = o.id), 0),
               0),
             6)
         end
    from public.ordenes_compra o
   where o.id = p_orden_id;
$$;

comment on function private.tope_pagable(bigint) is
  'Hasta cuanto se puede instruir. En contra entrega, solo lo recibido.';

-- ---------------------------------------------------------------------------
-- 6. Indicar el pago
--
-- Se reescribe entera y no se parchea: la comprobación del tope estaba escrita
-- contra el total en dos sitios de la misma sentencia, y dejar uno sin cambiar
-- habría permitido instruir de más justo en el caso que esto existe para
-- impedir.
-- ---------------------------------------------------------------------------
create or replace function public.indicar_pago(
  p_orden_id bigint,
  p_metodo   text,
  p_moneda   char(3),
  p_monto    numeric,
  p_datos    jsonb default '{}'::jsonb,
  p_nota     text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado     text;
  v_condicion  text;
  v_total      numeric;
  v_moneda     char(3);
  v_orden_tasa numeric;
  v_tope       numeric;
  v_pagado     numeric;
  v_tasa       numeric;
  v_tasa_usd   numeric;
  v_equiv      numeric;
  v_id         bigint;
begin
  perform private.exigir_rol('COMPRAS');

  select estado, total, moneda, condicion_pago, tasa
    into v_estado, v_total, v_moneda, v_condicion, v_orden_tasa
  from public.ordenes_compra where id = p_orden_id;

  if v_estado is null then
    raise exception 'No existe la orden %.', p_orden_id using errcode = 'P0002';
  end if;

  /*
    Contra entrega tiene su propia puerta.

    Una orden en `POR_RECIBIR` no admite pago: todavía no llegó nada. El mensaje
    lo dice con esas palabras porque el error natural aquí es intentar pagar por
    adelantado una compra que se pactó al revés.
  */
  if v_condicion = 'CONTRA_ENTREGA' and v_estado = 'POR_RECIBIR' then
    raise exception 'Esta compra es contra entrega: se paga lo que llegue, y todavía no se ha recibido nada.'
      using errcode = '55000';
  end if;

  if v_estado not in ('POR_INDICAR_PAGO', 'EN_TESORERIA', 'RECIBIDA_PARCIAL', 'RECIBIDA') then
    raise exception 'Esta orden está en "%" y no admite instrucciones de pago.', v_estado
      using errcode = '55000';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto a pagar debe ser mayor que cero.' using errcode = '22023';
  end if;

  select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd
  from private.tasas_del_dia(p_moneda, current_date) t;

  v_tope := private.tope_pagable(p_orden_id);

  select coalesce(sum(
           case when i.moneda = v_moneda then i.monto
                else round(i.monto * i.tasa / nullif(v_orden_tasa, 0), 6) end), 0)
    into v_pagado
  from public.instrucciones_pago i
  where i.orden_id = p_orden_id and i.estado in ('POR_PAGAR', 'PAGADA');

  v_equiv := case when p_moneda = v_moneda then p_monto
                  else round(p_monto * v_tasa / nullif(v_orden_tasa, 0), 6) end;

  if v_pagado + v_equiv > v_tope + 0.01 then
    if v_condicion = 'CONTRA_ENTREGA' then
      raise exception 'Contra entrega solo se paga lo recibido. De esta orden ha llegado material por % %, y ya hay % instruido.',
        round(v_tope, 2), v_moneda, round(v_pagado, 2) using errcode = '22023';
    else
      raise exception 'Con esta instrucción se pagaría más que el total de la orden (% %). Ya hay % instruido.',
        round(v_total, 2), v_moneda, round(v_pagado, 2) using errcode = '22023';
    end if;
  end if;

  insert into public.instrucciones_pago
    (orden_id, metodo, moneda, monto, tasa, tasa_usd,
     igtf_aplica,
     banco, numero_cuenta, titular, documento, telefono, correo_binance, red_cripto, receptor,
     nota, creada_por)
  values
    (p_orden_id, p_metodo, p_moneda, p_monto, v_tasa, v_tasa_usd,
     p_moneda <> 'VES',
     nullif(trim(coalesce(p_datos->>'banco', '')), ''),
     nullif(trim(coalesce(p_datos->>'numero_cuenta', '')), ''),
     nullif(trim(coalesce(p_datos->>'titular', '')), ''),
     nullif(trim(coalesce(p_datos->>'documento', '')), ''),
     nullif(trim(coalesce(p_datos->>'telefono', '')), ''),
     nullif(trim(coalesce(p_datos->>'correo_binance', '')), ''),
     nullif(trim(coalesce(p_datos->>'red_cripto', '')), ''),
     nullif(trim(coalesce(p_datos->>'receptor', '')), ''),
     nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  update public.ordenes_compra set estado = 'EN_TESORERIA' where id = p_orden_id;

  perform private.anotar('PAGO', v_id, null, 'POR_PAGAR', p_nota);
  if v_estado <> 'EN_TESORERIA' then
    perform private.anotar('ORDEN', p_orden_id, v_estado, 'EN_TESORERIA');
  end if;

  return v_id;
end;
$$;

revoke execute on function public.indicar_pago(bigint, text, char, numeric, jsonb, text) from public, anon;
grant   execute on function public.indicar_pago(bigint, text, char, numeric, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Recibir
--
-- `registrar_recepcion` hace además el asiento de inventario, el costeo y la
-- bitácora: son cuatrocientas líneas que funcionan y que no hay motivo para
-- reescribir por dos cambios de tres palabras. Se toma su definición viva y se
-- parchean los dos puntos exactos.
--
-- Si alguno de los dos reemplazos no encuentra su texto, la migración se
-- detiene. Un `replace` que no encuentra nada no falla: devuelve el original, y
-- la función se reinstalaría idéntica dejando contra entrega a medias.
-- ---------------------------------------------------------------------------
do $parchear$
declare
  v_src   text;
  v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'registrar_recepcion';

  if v_src is null then
    raise exception 'No existe public.registrar_recepcion.';
  end if;

  -- (a) Que admita las de contra entrega, que llegan sin pagar.
  v_antes := v_src;
  v_src := replace(v_src,
    'if v_estado not in (''PAGADA_POR_RECIBIR'', ''RECIBIDA_PARCIAL'') then',
    'if v_estado not in (''PAGADA_POR_RECIBIR'', ''RECIBIDA_PARCIAL'', ''POR_RECIBIR'') then');
  if v_src = v_antes then
    raise exception 'No se encontro la guarda de estados en registrar_recepcion.';
  end if;

  -- (b) Que una contra entrega recibida quede pidiendo pago, no cerrada.
  v_antes := v_src;
  v_src := replace(v_src,
    'v_nuevo := case when v_pendiente <= 0.0001 then ''RECIBIDA'' else ''RECIBIDA_PARCIAL'' end;',
    'v_nuevo := case
       when (select o.condicion_pago from public.ordenes_compra o where o.id = p_orden_id)
            = ''CONTRA_ENTREGA'' then ''POR_INDICAR_PAGO''
       when v_pendiente <= 0.0001 then ''RECIBIDA''
       else ''RECIBIDA_PARCIAL'' end;');
  if v_src = v_antes then
    raise exception 'No se encontro el calculo del estado final en registrar_recepcion.';
  end if;

  execute v_src;
end $parchear$;
