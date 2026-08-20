-- ---------------------------------------------------------------------------
-- La referencia del efectivo también se genera sola al cobrar
--
-- Ya lo hacía al pagarle a un proveedor (`registrar_pago_compra`), pero no al
-- cobrarle a un cliente. En una transferencia la referencia la devuelve el
-- banco; en efectivo no la devuelve nadie y el campo quedaba vacío, con lo que
-- un cobro no se podía señalar en una conversación: «el de 520 dólares», y
-- hubo dos ese día.
--
-- Queda EFEUSD-2026-0001 o EFEBS-2026-0001, con el mismo contador que numera
-- todos los documentos de la casa. Si quien cobra escribe una, manda la suya.
--
-- La referencia generada viaja también al asiento de tesorería y al del IGTF,
-- que antes recibían `p_referencia` a secas: los tres apuntes de un mismo
-- cobro en efectivo llevan ahora el mismo número.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_cobro(
  p_factura_id bigint,
  p_cuenta_id  bigint,
  p_monto      numeric,
  p_metodo     text default 'TRANSFERENCIA',
  p_fecha      date default null,
  p_referencia text default null,
  p_igtf       boolean default null,
  p_nota       text default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_fac     record;
  v_cuenta  record;
  v_cliente record;
  v_fecha   date := coalesce(p_fecha, current_date);
  v_tasas   record;
  v_saldo   numeric;
  v_monto_usd numeric;
  v_igtf    boolean;
  v_id      bigint;
  v_mov     bigint;
  v_mov_igtf bigint;
  v_igtf_monto numeric;
  v_ref     text := nullif(trim(coalesce(p_referencia, '')), '');
begin
  perform private.exigir_permiso('VENTAS', 'ESCRITURA');

  -- El portero. Sin esto, dos cobros de $900 sobre una factura de $1.000 leen
  -- los dos "faltan $1.000" y los dos pasan; el saldo se queda en cero por el
  -- greatest y los $800 de más no aparecen en ningún sitio.
  perform 1 from public.facturas_venta where id = p_factura_id for update;

  select * into v_fac from public.v_facturas_venta where id = p_factura_id;

  if v_fac.id is null then
    raise exception 'No existe la factura %.', p_factura_id using errcode = 'P0002';
  end if;

  if v_fac.estado <> 'EMITIDA' then
    raise exception 'La factura % está % y no admite cobros.', v_fac.numero, lower(v_fac.estado)
      using errcode = '55000';
  end if;

  select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta_id;

  if v_cuenta.id is null then
    raise exception 'No existe la cuenta %.', p_cuenta_id using errcode = 'P0002';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto del cobro tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se registra un cobro con fecha futura.' using errcode = '22023';
  end if;

  -- El cobro entra en la moneda de la cuenta donde cae el dinero: si el pago
  -- llegó a la cuenta en bolívares, el cobro es en bolívares aunque la factura
  -- esté en dólares. Por eso el saldo se compara en dólares y no en la moneda
  -- de la factura.
  select * into v_tasas from private.tasas_del_dia(v_cuenta.moneda, v_fecha);
  v_monto_usd := round(p_monto * v_tasas.tasa / v_tasas.tasa_usd, 2);
  v_saldo := v_fac.saldo_usd;

  if v_monto_usd > v_saldo + 0.01 then
    raise exception 'A la factura % le faltan % $ y se están abonando % $. Si el cliente pagó de más, regístralo como dos cobros o revisa la tasa del día.',
      v_fac.numero, round(v_saldo, 2), round(v_monto_usd, 2) using errcode = '22023';
  end if;

  if v_ref is null and coalesce(p_metodo, '') = 'EFECTIVO' then
    v_ref := private.siguiente_numero(
      'EFE' || case when v_cuenta.moneda = 'VES' then 'BS' else v_cuenta.moneda end);
  end if;

  -- El IGTF grava los pagos en divisas. Se propone según la moneda de la
  -- cuenta y se puede desactivar: hay cobros exentos y quien registra lo sabe.
  v_igtf := coalesce(p_igtf, v_cuenta.moneda <> 'VES');

  select * into v_cliente from public.clientes where id = v_fac.cliente_id;

  insert into public.cobros_venta
    (numero, factura_id, cuenta_id, fecha, metodo, moneda, tasa, tasa_usd,
     monto, igtf_aplica, referencia, nota, registrado_por)
  values
    (private.siguiente_numero('COB'), p_factura_id, p_cuenta_id, v_fecha,
     coalesce(p_metodo, 'TRANSFERENCIA'), v_cuenta.moneda, v_tasas.tasa, v_tasas.tasa_usd,
     p_monto, v_igtf, v_ref,
     nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  select igtf_monto into v_igtf_monto from public.cobros_venta where id = v_id;

  v_mov := private.registrar_movimiento_tesoreria(
    p_cuenta_id, 'INGRESO', 1, p_monto,
    format('COBRO DE LA FACTURA %s', v_fac.numero),
    v_fecha, v_ref, v_cliente.nombre, null, null, null, p_nota);

  -- El IGTF entra como asiento aparte porque no es de la empresa: es un
  -- impuesto que se recauda y se entrega. Mezclado con el cobro haría creer
  -- que el cliente pagó más de lo que abonó.
  if v_igtf and v_igtf_monto > 0 then
    v_mov_igtf := private.registrar_movimiento_tesoreria(
      p_cuenta_id, 'IGTF', 1, v_igtf_monto,
      format('IGTF COBRADO EN LA FACTURA %s', v_fac.numero),
      v_fecha, v_ref, v_cliente.nombre, null, null, v_mov, null);
  end if;

  update public.cobros_venta
     set movimiento_id = v_mov, movimiento_igtf_id = v_mov_igtf
   where id = v_id;

  -- Cerrada cuando no queda saldo. El centavo de tolerancia es del redondeo de
  -- las tasas, no de la cuenta.
  if (select saldo_usd from public.v_facturas_venta where id = p_factura_id) <= 0.01 then
    update public.facturas_venta set estado = 'COBRADA' where id = p_factura_id;
  end if;

  return v_id;
end;
$function$;
