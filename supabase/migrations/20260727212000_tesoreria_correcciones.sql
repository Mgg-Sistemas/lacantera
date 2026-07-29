-- ============================================================================
-- Tres correcciones a tesorería
--
-- 1. Reversar una sola pata de un traslado creaba dinero de la nada.
-- 2. Editar una cuenta borraba en silencio datos que la pantalla no cargaba.
-- 3. El ajuste, único remedio para una apertura mal puesta, no tenía botón.
--    (Eso se arregla en la pantalla; aquí va lo que le toca a la base.)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Un traslado no se reversa por la mitad
--
-- Un traslado escribe dos líneas enlazadas: sale de una cuenta y entra en
-- otra. El reverso escribe una sola línea contraria, así que reversando la
-- salida el dinero volvía al origen y se quedaba también en el destino. Cada
-- cuenta cuadraba con su propio libro y el descuadre no se veía por ninguna
-- parte.
--
-- Tampoco se arregla a mano después: el enlace entre las dos patas solo puede
-- escribirse una vez.
--
-- Un traslado equivocado se deshace con otro traslado en sentido contrario,
-- que es lo que de verdad pasó: el dinero volvió.
-- ---------------------------------------------------------------------------
create or replace function public.reversar_movimiento_tesoreria(
  p_id     bigint,
  p_motivo text
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_m record;
begin
  perform private.exigir_rol('TESORERIA');

  if length(trim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Escribe por qué se reversa. La línea anulada se queda a la vista y sin motivo no se entiende.'
      using errcode = '22023';
  end if;

  select * into v_m from public.tesoreria_movimientos where id = p_id;

  if v_m.id is null then
    raise exception 'No existe el movimiento %.', p_id using errcode = 'P0002';
  end if;

  if exists (select 1 from public.tesoreria_movimientos where movimiento_origen = p_id) then
    raise exception 'El movimiento % ya fue reversado.', v_m.numero using errcode = '55000';
  end if;

  if v_m.instruccion_id is not null then
    raise exception 'Este movimiento es el pago de una compra. Reversarlo a solas dejaría la compra pagada y el dinero de vuelta: devuelve la instrucción de pago desde la compra.'
      using errcode = '55000';
  end if;

  if v_m.transferencia_par is not null then
    raise exception 'El movimiento % es una de las dos mitades de un traslado. Reversar solo esta devolvería el dinero al origen dejándolo también en el destino. Deshazlo con un traslado en sentido contrario.', v_m.numero
      using errcode = '55000';
  end if;

  return private.registrar_movimiento_tesoreria(
    v_m.cuenta_id, 'REVERSO', (v_m.signo * -1)::integer, v_m.monto,
    'Reverso de ' || v_m.numero || ': ' || trim(p_motivo),
    null, v_m.referencia, v_m.contraparte, null, null, v_m.id, p_motivo);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. La vista de saldos devuelve todos los datos de la cuenta
--
-- La pantalla de edición se llena con lo que trae esta vista. Como no traía
-- `documento`, `correo_binance`, `red_cripto` ni `nota`, el formulario los
-- abría vacíos y al guardar los ponía en nulo: quien entraba a corregir el
-- número de cuenta se llevaba por delante el RIF del titular sin enterarse.
--
-- Las columnas nuevas van al final porque `create or replace view` no admite
-- reordenar las que ya existen.
-- ---------------------------------------------------------------------------
create or replace view public.v_saldos_tesoreria
with (security_invoker = on) as
select
  c.id,
  c.codigo,
  c.nombre,
  c.tipo,
  c.moneda,
  c.banco,
  c.numero_cuenta,
  c.titular,
  c.activa,
  c.permite_sobregiro,
  coalesce(m.saldo, 0)      as saldo,
  coalesce(m.saldo_bs, 0)   as saldo_bs,
  coalesce(m.saldo_usd, 0)  as saldo_usd,
  m.movimientos,
  m.ultimo_movimiento,
  c.documento,
  c.correo_binance,
  c.red_cripto,
  c.nota
from public.cuentas_tesoreria c
left join lateral (
  select
    sum(t.signo * t.monto)     as saldo,
    sum(t.signo * t.monto_bs)  as saldo_bs,
    sum(t.signo * t.monto_usd) as saldo_usd,
    count(*)                   as movimientos,
    max(t.fecha)               as ultimo_movimiento
  from public.tesoreria_movimientos t
  where t.cuenta_id = c.id
) m on true;

grant select on public.v_saldos_tesoreria to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Guardar una cuenta explica qué falta
--
-- La restricción por tipo salta con el texto crudo de Postgres, que no le dice
-- a nadie qué campo llenar. Se traduce, como ya hace `indicar_pago`.
-- ---------------------------------------------------------------------------
create or replace function public.guardar_cuenta(
  p_id             bigint default null,
  p_codigo         text default null,
  p_nombre         text default null,
  p_tipo           text default 'BANCO',
  p_moneda         char(3) default 'VES',
  p_banco          text default null,
  p_numero_cuenta  text default null,
  p_titular        text default null,
  p_documento      text default null,
  p_correo_binance text default null,
  p_red_cripto     text default null,
  p_sobregiro      boolean default false,
  p_activa         boolean default true,
  p_nota           text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id     bigint;
  v_moneda char(3);
begin
  perform private.exigir_rol('TESORERIA');

  if length(trim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'Ponle nombre a la cuenta: es lo que se lee al elegir de dónde sale el dinero.'
      using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.cuentas_tesoreria
      (codigo, nombre, tipo, moneda, banco, numero_cuenta, titular, documento,
       correo_binance, red_cripto, permite_sobregiro, activa, nota, creada_por)
    values
      (upper(trim(coalesce(nullif(p_codigo, ''), 'CTA-' || to_char(now(), 'YYYYMMDDHH24MISS')))),
       trim(p_nombre), p_tipo, p_moneda,
       nullif(trim(coalesce(p_banco, '')), ''),
       nullif(trim(coalesce(p_numero_cuenta, '')), ''),
       nullif(trim(coalesce(p_titular, '')), ''),
       nullif(trim(coalesce(p_documento, '')), ''),
       nullif(trim(coalesce(p_correo_binance, '')), ''),
       nullif(trim(coalesce(p_red_cripto, '')), ''),
       coalesce(p_sobregiro, false), coalesce(p_activa, true),
       nullif(trim(coalesce(p_nota, '')), ''),
       (select auth.uid()))
    returning id into v_id;

    return v_id;
  end if;

  select moneda into v_moneda from public.cuentas_tesoreria where id = p_id;

  if v_moneda is null then
    raise exception 'No existe la cuenta %.', p_id using errcode = 'P0002';
  end if;

  if v_moneda <> p_moneda
     and exists (select 1 from public.tesoreria_movimientos where cuenta_id = p_id) then
    raise exception 'La cuenta ya tiene movimientos en % y no puede cambiar de moneda. Crea otra cuenta.', v_moneda
      using errcode = '55000';
  end if;

  update public.cuentas_tesoreria set
    nombre = trim(p_nombre),
    tipo = p_tipo,
    moneda = p_moneda,
    banco = nullif(trim(coalesce(p_banco, '')), ''),
    numero_cuenta = nullif(trim(coalesce(p_numero_cuenta, '')), ''),
    titular = nullif(trim(coalesce(p_titular, '')), ''),
    documento = nullif(trim(coalesce(p_documento, '')), ''),
    correo_binance = nullif(trim(coalesce(p_correo_binance, '')), ''),
    red_cripto = nullif(trim(coalesce(p_red_cripto, '')), ''),
    permite_sobregiro = coalesce(p_sobregiro, false),
    activa = coalesce(p_activa, true),
    nota = nullif(trim(coalesce(p_nota, '')), '')
  where id = p_id;

  return p_id;
exception
  when check_violation then
    raise exception '%', case p_tipo
      when 'BANCO'     then 'Una cuenta bancaria necesita banco, número de cuenta y titular.'
      when 'CAJA'      then 'Una caja necesita saber quién responde por el efectivo.'
      when 'BILLETERA' then 'Una billetera necesita el correo de la plataforma o la dirección de la wallet.'
      else 'Faltan datos de la cuenta.'
    end using errcode = '23514';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. La línea del IGTF nombra a la misma contraparte que la del pago
--
-- En un pago en efectivo sin proveedor registrado, la del pago decía a quién
-- se le entregó y la del impuesto quedaba en blanco. Son la misma operación.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_pago(
  p_instruccion_id bigint,
  p_cuenta_id      bigint,
  p_referencia     text default null,
  p_fecha          date default null,
  p_nota           text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_i         record;
  v_cuenta    record;
  v_o_estado  text;
  v_faltan    numeric;
  v_orden     text;
  v_prov      text;
  v_a_quien   text;
begin
  perform private.exigir_rol('TESORERIA');

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
$$;
