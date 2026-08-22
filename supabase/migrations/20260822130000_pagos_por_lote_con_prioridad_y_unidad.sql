-- ---------------------------------------------------------------------------
-- Pagar varios de una vez, sabiendo qué urge y para quién es
--
-- La líder pidió agilizar los pagos: poder marcarlos con casillas y pagarlos
-- por lote, clasificando «por urgencia o prioridad (es algo que la solicitud de
-- pedido debe tener y desde ahí se trae a la OC y así) y por departamento», y
-- pudiendo ordenar por valor de mayor a menor.
--
-- LA PRIORIDAD YA EXISTÍA
--
-- NORMAL, ALTA y URGENTE, en la solicitud, desde el primer día. Lo que no hacía
-- era llegar hasta la cola de pagos: quien paga veía proveedor, monto y días
-- esperando, y tenía que abrir cada compra para saber si alguna urgía. Se trae,
-- no se inventa.
--
-- El departamento es el destino del pedido —el mismo eje del reporte de gasto
-- por unidad—: de catálogo cuando es un almacén, texto libre cuando no.
-- ---------------------------------------------------------------------------

-- Las columnas nuevas van al final: `create or replace view` no deja meterlas
-- en medio, y un drop obligaría a tumbar lo que dependa de ella.
create or replace view public.v_cuentas_por_pagar as
 SELECT i.id AS instruccion_id,
    i.orden_id,
    o.numero AS orden_numero,
    o.solicitud_id,
    s.titulo,
    p.id AS proveedor_id,
    p.nombre AS proveedor,
    p.rif,
    i.metodo,
    i.moneda,
    i.monto,
    i.monto_bs,
    i.monto_usd,
    i.igtf_aplica,
    i.igtf_monto,
    i.banco,
    i.numero_cuenta,
    i.titular,
    i.documento,
    i.telefono,
    i.correo_binance,
    i.red_cripto,
    i.receptor,
    i.nota,
    i.creada_en,
    CURRENT_DATE - i.creada_en::date AS dias_esperando,

    -- Lo nuevo: qué urge, para quién es, y para cuándo se pidió.
    s.prioridad,
    -- Para ordenar sin que el front tenga que saber el orden de las palabras.
    CASE s.prioridad
      WHEN 'URGENTE' THEN 1
      WHEN 'ALTA'    THEN 2
      ELSE 3
    END AS prioridad_orden,
    COALESCE(al.nombre, s.destino, 'Sin definir') AS unidad,
    s.destino_almacen_id,
    s.requerida_para
   FROM instrucciones_pago i
     JOIN ordenes_compra o ON o.id = i.orden_id
     JOIN solicitudes_pedido s ON s.id = o.solicitud_id
     LEFT JOIN almacenes al ON al.id = s.destino_almacen_id
     LEFT JOIN proveedores p ON p.id = o.proveedor_id
  WHERE i.estado = 'POR_PAGAR'::text AND o.estado <> 'CANCELADA'::text;

alter view public.v_cuentas_por_pagar set (security_invoker = true);

comment on view public.v_cuentas_por_pagar is
  'Lo que compras autorizo pagar y todavia no ha salido. Trae la prioridad y el '
  'destino del pedido para poder agrupar el trabajo: quien paga necesita saber '
  'que urge y para quien es, no solo cuanto.';

-- ---------------------------------------------------------------------------
-- Pagar varios de una vez
--
-- NO REESCRIBE NADA. Recorre y llama a `registrar_pago`, que ya sabe todo lo
-- que hay que saber: comprobar el estado, exigir referencia si no es efectivo,
-- cuadrar la moneda, escribir el movimiento de tesorería, el del IGTF, anotar
-- en la bitácora y cerrar la orden cuando queda saldada. Copiar ese cuerpo aquí
-- sería tener dos sitios que pagan, y en tres meses uno de los dos no cerraría
-- la orden.
--
-- TODO O NADA. Una función es una transacción: si el séptimo falla, los seis
-- anteriores se deshacen. Es lo que hace falta — quien marca doce casillas y
-- pulsa una vez no puede quedarse sin saber cuáles pasaron.
--
-- UNA SOLA MONEDA POR LOTE. El dinero sale de una cuenta, y una cuenta tiene
-- una moneda. Se comprueba antes de empezar para poder decirlo entero —«hay 3
-- en bolívares»— en vez de fallar en el tercero con un mensaje sobre uno solo.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_pagos_en_lote(
  p_ids        bigint[],
  p_cuenta_id  bigint,
  p_referencia text default null,
  p_fecha      date default null,
  p_nota       text default null
) returns integer
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_id      bigint;
  v_cuenta  record;
  v_monedas text;
  v_cuantas integer := 0;
begin
  perform private.exigir_rol('TESORERIA', 'COMPRAS');

  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'No hay ningún pago marcado.' using errcode = '22023';
  end if;

  select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta_id;
  if v_cuenta.id is null then
    raise exception 'Indica por dónde sale el dinero.' using errcode = '22023';
  end if;

  select string_agg(distinct moneda, ', ') into v_monedas
    from public.instrucciones_pago
   where id = any(p_ids) and moneda <> v_cuenta.moneda;

  if v_monedas is not null then
    raise exception 'El lote tiene pagos en % y la cuenta está en %. Un lote sale de una sola cuenta, así que agrupa por moneda.',
      v_monedas, v_cuenta.moneda
      using errcode = '22023';
  end if;

  foreach v_id in array p_ids loop
    perform public.registrar_pago(v_id, p_cuenta_id, p_referencia, p_fecha, p_nota);
    v_cuantas := v_cuantas + 1;
  end loop;

  return v_cuantas;
end;
$func$;

comment on function public.registrar_pagos_en_lote(bigint[], bigint, text, date, text) is
  'Registra varios pagos de una tanda. Llama a registrar_pago uno por uno, asi '
  'que hereda todas sus comprobaciones; y como una funcion es una transaccion, o '
  'pasan todos o no pasa ninguno.';

revoke execute on function public.registrar_pagos_en_lote(bigint[], bigint, text, date, text) from public, anon;
grant  execute on function public.registrar_pagos_en_lote(bigint[], bigint, text, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Quien lleva compras también registra el pago
--
-- Al combinarse tesorería con compras por decisión de la empresa, quien lleva
-- compras tiene que poder cerrar la cola: la entrada está en su módulo y el
-- botón ya se le muestra.
--
-- Sin esto el lote fallaba de una forma difícil de entender: la función del
-- lote acepta los dos roles pero llama a esta por dentro, que solo aceptaba
-- tesorería. Pasaba la puerta y reventaba en el primer pago.
--
-- Solo cambia la línea del rol. El resto del cuerpo es el que ya había.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_pago(
  p_instruccion_id bigint,
  p_cuenta_id bigint,
  p_referencia text default null,
  p_fecha date default null,
  p_nota text default null
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_i         record;
  v_cuenta    record;
  v_o_estado  text;
  v_faltan    numeric;
  v_orden     text;
  v_prov      text;
  v_a_quien   text;
begin
  perform private.exigir_rol('TESORERIA', 'COMPRAS');

  select * into v_i from public.instrucciones_pago where id = p_instruccion_id;

  if v_i.id is null then
    raise exception 'No existe la instrucción de pago %.', p_instruccion_id using errcode = 'P0002';
  end if;

  if v_i.estado <> 'POR_PAGAR' then
    raise exception 'Esta instrucción está en "%" y no se puede volver a pagar.', v_i.estado
      using errcode = '55000';
  end if;

  if v_i.metodo <> 'EFECTIVO' and length(trim(coalesce(p_referencia, ''))) = 0 then
    raise exception 'Falta el número de referencia de la transacción.' using errcode = '22023';
  end if;

  select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta_id;

  if v_cuenta.id is null then
    raise exception 'Indica de qué cuenta sale el dinero.' using errcode = '22023';
  end if;

  if v_cuenta.moneda <> v_i.moneda then
    raise exception 'La instrucción es por % y la cuenta "%" está en %. Elige una cuenta en % o cambia la instrucción.',
      v_i.moneda, v_cuenta.nombre, v_cuenta.moneda, v_i.moneda
      using errcode = '22023';
  end if;

  select o.numero, p.nombre into v_orden, v_prov
  from public.ordenes_compra o
  left join public.proveedores p on p.id = o.proveedor_id
  where o.id = v_i.orden_id;

  v_a_quien := coalesce(v_prov, v_i.titular, v_i.receptor);

  perform private.registrar_movimiento_tesoreria(
    p_cuenta_id, 'PAGO', -1, v_i.monto,
    'Pago de la orden ' || coalesce(v_orden, v_i.orden_id::text),
    p_fecha, p_referencia, v_a_quien,
    v_i.id, v_i.orden_id, null, p_nota);

  if v_i.igtf_monto > 0 then
    perform private.registrar_movimiento_tesoreria(
      p_cuenta_id, 'IGTF', -1, v_i.igtf_monto,
      'IGTF ' || rtrim(rtrim(to_char(v_i.igtf_alicuota, 'FM990.99'), '0'), '.') ||
        '% de la orden ' || coalesce(v_orden, v_i.orden_id::text),
      p_fecha, p_referencia, v_a_quien,
      v_i.id, v_i.orden_id, null, null);
  end if;

  update public.instrucciones_pago
     set estado = 'PAGADA',
         referencia = nullif(trim(coalesce(p_referencia, '')), ''),
         fecha_pago = coalesce(p_fecha, current_date),
         pagada_por = (select auth.uid()),
         pagada_en = now()
   where id = p_instruccion_id;

  perform private.anotar('PAGO', p_instruccion_id, 'POR_PAGAR', 'PAGADA', p_nota);

  select o.total - coalesce(sum(
           case when i.moneda = o.moneda then i.monto
                else round(i.monto * i.tasa / nullif(o.tasa, 0), 6) end), 0)
    into v_faltan
  from public.ordenes_compra o
  left join public.instrucciones_pago i on i.orden_id = o.id and i.estado = 'PAGADA'
  where o.id = v_i.orden_id
  group by o.total;

  select estado into v_o_estado from public.ordenes_compra where id = v_i.orden_id;

  if v_faltan <= 0.01 then
    update public.ordenes_compra
       set estado = 'PAGADA_POR_RECIBIR',
           fecha_pago = coalesce(p_fecha, current_date),
           pagada_en = now()
     where id = v_i.orden_id;

    perform private.anotar('ORDEN', v_i.orden_id, v_o_estado, 'PAGADA_POR_RECIBIR');
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Sin saldos que llevar, no hay saldo que exigir
--
-- Por instrucción de la líder, la empresa dejó de llevar bancos y cajas: «el
-- sistema no manejará saldo hábil real, solo gestionará y reflejará los
-- movimientos».
--
-- Se quitó el aviso de la pantalla y los indicadores de disponible, pero la
-- base seguía negándose a pagar cuando el saldo calculado no alcanzaba.
-- Apareció al probar el primer lote:
--
--   «En "CAJA CHICA PRUEBA" hay 257.56 USD y se intentan sacar 556.80»
--
-- Es exactamente lo que la instrucción decía que no debía pasar. Un saldo que
-- nadie mantiene no puede impedir registrar un pago que ya salió del banco: el
-- pago es un hecho, no una solicitud de autorización.
--
-- POR QUÉ POR AQUÍ Y NO QUITANDO LA COMPROBACIÓN
--
-- `private.registrar_movimiento_tesoreria` la usan también la nómina y las
-- ventas. Quitarla de ahí afectaría a todo el sistema y no habría vuelta atrás
-- sin volver a escribirla.
--
-- La palanca ya existía: `permite_sobregiro` por cuenta. Se enciende, y el
-- sistema sigue calculando el saldo —está ahí, se puede consultar— pero deja de
-- imponerlo. El día que la empresa quiera volver a llevar sus cuentas, se apaga
-- y todo vuelve a exigirse.
--
-- El default cambia también: una cuenta creada mañana tiene que nacer con el
-- mismo criterio, o alguien se topará con este error dentro de un mes sin
-- entender por qué unas cuentas sí y otras no.
-- ---------------------------------------------------------------------------
alter table public.cuentas_tesoreria alter column permite_sobregiro set default true;

update public.cuentas_tesoreria set permite_sobregiro = true where not permite_sobregiro;

comment on column public.cuentas_tesoreria.permite_sobregiro is
  'Si la cuenta puede quedar en negativo. Encendido en todas desde que la '
  'empresa dejo de llevar saldos: el sistema calcula el saldo pero no lo impone, '
  'porque un pago que ya salio del banco es un hecho y no una autorizacion.';
