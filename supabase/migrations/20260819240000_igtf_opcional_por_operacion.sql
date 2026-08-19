-- ---------------------------------------------------------------------------
-- El IGTF se propone, no se impone
--
-- `indicar_pago` escribía `igtf_aplica` como `p_moneda <> 'VES'`: si el pago
-- iba en divisa, el 3% se cobraba y punto. La pantalla lo anunciaba con un
-- aviso ámbar que no se podía quitar — informaba de un cobro que quien
-- registra la operación no podía discutir.
--
-- La empresa pidió que fuera opcional en cada operación, igual que el IVA. Así
-- que sigue proponiéndose por la moneda, que es lo que acierta casi siempre, y
-- ahora se puede desmarcar.
--
-- `registrar_pago_compra` ya lo aceptaba (`p_igtf boolean default null`); era
-- la instrucción de pago la que no dejaba elegir. Con esto el flujo entero
-- —instruir y pagar— respeta la misma decisión.
--
-- El cuerpo es el vivo, copiado tal cual. Solo cambia el parámetro nuevo y la
-- línea que lo usa.
--
-- NOTA para quien pase por aquí: esta función conserva
-- `set search_path to 'public','pg_temp'` en vez del `''` de la casa. Se deja
-- como estaba porque cambiarlo no es lo que se venía a hacer, pero está
-- apuntado en docs/salud-de-la-base.md y conviene saldarlo aparte.
-- ---------------------------------------------------------------------------
create or replace function public.indicar_pago(
  p_orden_id bigint,
  p_metodo   text,
  p_moneda   character,
  p_monto    numeric,
  p_datos    jsonb default '{}'::jsonb,
  p_nota     text default null,
  p_igtf     boolean default null
)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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

  if v_condicion = 'CONTRA_ENTREGA' and v_estado = 'POR_RECIBIR' then
    raise exception 'Esta compra es contra entrega: se paga lo que llegue, y todavia no se ha recibido nada.'
      using errcode = '55000';
  end if;

  if v_estado not in ('POR_INDICAR_PAGO', 'EN_TESORERIA', 'RECIBIDA_PARCIAL', 'RECIBIDA') then
    raise exception 'Esta orden esta en "%" y no admite instrucciones de pago.', v_estado
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
      raise exception 'Con esta instruccion se pagaria mas que el total de la orden (% %). Ya hay % instruido.',
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
     -- Se propone por la moneda, pero decide quien registra la operacion.
     coalesce(p_igtf, p_moneda <> 'VES'),
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
$function$;

revoke execute on function public.indicar_pago(bigint, text, character, numeric, jsonb, text, boolean)
  from public, anon;
grant execute on function public.indicar_pago(bigint, text, character, numeric, jsonb, text, boolean)
  to authenticated;

-- La firma vieja quedaria como sobrecarga y PostgREST no sabria cual llamar.
drop function if exists public.indicar_pago(bigint, text, character, numeric, jsonb, text);

comment on column public.instrucciones_pago.igtf_aplica is
  'Si esta operación causa IGTF. Se propone según la moneda —el 3% grava los '
  'pagos en divisa— pero lo decide quien la registra: la empresa pidió que '
  'fuera opcional en cada operación, igual que el IVA.';
