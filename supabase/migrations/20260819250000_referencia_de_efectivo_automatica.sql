-- ---------------------------------------------------------------------------
-- La referencia de un pago en efectivo se genera sola
--
-- En una transferencia la referencia la devuelve el banco y se copia. En
-- efectivo no la devuelve nadie, así que el campo quedaba vacío — y un pago sin
-- referencia no se puede señalar en una conversación: «el de 24 dólares», y
-- hubo tres ese día.
--
-- Se le pone una del sistema con el mismo contador que numera todos los
-- documentos de la casa: EFEUSD-2026-0001 en dólares, EFEBS-2026-0001 en
-- bolívares. Si quien paga escribe una, manda la suya.
--
-- El año va en medio porque así lo hace `private.siguiente_numero` con todos
-- los correlativos, y tener dos formatos de número conviviendo es peor que
-- tener uno un poco más largo de lo pedido.
--
-- El cuerpo es el vivo, copiado tal cual; solo se añade el bloque que genera
-- la referencia y el uso de `v_ref` en lugar de `p_referencia`.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_pago_compra(
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
  v_fac       record;
  v_cuenta    record;
  v_prov      record;
  v_fecha     date := coalesce(p_fecha, current_date);
  v_tasas     record;
  v_saldo     numeric;
  v_monto_usd numeric;
  v_igtf      boolean;
  v_igtf_monto numeric;
  v_id        bigint;
  v_mov       bigint;
  v_mov_igtf  bigint;
  v_ref       text := nullif(trim(coalesce(p_referencia, '')), '');
begin
  perform private.exigir_permiso('COMPRAS', 'ESCRITURA');

  -- El portero, igual que en los cobros: sin él, dos pagos simultáneos leen
  -- los dos el mismo saldo y los dos pasan.
  perform 1 from public.facturas_compra where id = p_factura_id for update;

  select * into v_fac from public.v_facturas_compra where id = p_factura_id;

  if v_fac.id is null then
    raise exception 'No existe la factura %.', p_factura_id using errcode = 'P0002';
  end if;

  if v_fac.estado <> 'REGISTRADA' then
    raise exception 'La factura % está % y no admite pagos.', v_fac.numero_factura,
      lower(v_fac.estado) using errcode = '55000';
  end if;

  select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta_id;

  if v_cuenta.id is null then
    raise exception 'No existe la cuenta %.', p_cuenta_id using errcode = 'P0002';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto del pago tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se registra un pago con fecha futura.' using errcode = '22023';
  end if;

  select * into v_tasas from private.tasas_del_dia(v_cuenta.moneda, v_fecha);
  v_monto_usd := round(p_monto * v_tasas.tasa / v_tasas.tasa_usd, 2);
  v_saldo := v_fac.saldo_usd;

  if v_monto_usd > v_saldo + 0.01 then
    raise exception 'A la factura % le faltan % $ y se están pagando % $.',
      v_fac.numero_factura, round(v_saldo, 2), round(v_monto_usd, 2) using errcode = '22023';
  end if;

  /*
    La referencia del efectivo se genera sola.

    En una transferencia la referencia la devuelve el banco; en efectivo no la
    devuelve nadie, y el campo quedaba vacío. Un pago sin referencia no se
    puede señalar en una conversación —«el de 24 dólares», y hubo tres— así que
    se le pone una del sistema: EFEUSD-2026-0001, con el mismo contador que
    numera todos los documentos de la casa. Si quien paga escribe una, manda la
    suya.
  */
  if v_ref is null and coalesce(p_metodo, '') = 'EFECTIVO' then
    v_ref := private.siguiente_numero(
      'EFE' || case when v_cuenta.moneda = 'VES' then 'BS' else v_cuenta.moneda end);
  end if;

  v_igtf := coalesce(p_igtf, v_cuenta.moneda <> 'VES');

  select * into v_prov from public.proveedores where id = v_fac.proveedor_id;

  insert into public.pagos_compra
    (numero, factura_id, cuenta_id, fecha, metodo, moneda, tasa, tasa_usd,
     monto, igtf_aplica, referencia, nota, registrado_por)
  values
    (private.siguiente_numero('PGC'), p_factura_id, p_cuenta_id, v_fecha,
     coalesce(p_metodo, 'TRANSFERENCIA'), v_cuenta.moneda, v_tasas.tasa, v_tasas.tasa_usd,
     p_monto, v_igtf, v_ref,
     nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  select igtf_monto into v_igtf_monto from public.pagos_compra where id = v_id;

  v_mov := private.registrar_movimiento_tesoreria(
    p_cuenta_id, 'PAGO', -1, p_monto,
    format('PAGO DE LA FACTURA %s', v_fac.numero_factura),
    v_fecha, v_ref, v_prov.nombre, null, v_fac.orden_id, null, p_nota);

  -- El IGTF de un pago en divisas lo paga quien paga, y no es del proveedor:
  -- va en su propio asiento o parecería que al proveedor se le dio de más.
  if v_igtf and v_igtf_monto > 0 then
    v_mov_igtf := private.registrar_movimiento_tesoreria(
      p_cuenta_id, 'IGTF', -1, v_igtf_monto,
      format('IGTF DEL PAGO DE LA FACTURA %s', v_fac.numero_factura),
      v_fecha, v_ref, v_prov.nombre, null, null, v_mov, null);
  end if;

  update public.pagos_compra
     set movimiento_id = v_mov, movimiento_igtf_id = v_mov_igtf
   where id = v_id;

  if (select saldo_usd from public.v_facturas_compra where id = p_factura_id) <= 0.01 then
    update public.facturas_compra set estado = 'PAGADA' where id = p_factura_id;
  end if;

  return v_id;
end;
$function$;
