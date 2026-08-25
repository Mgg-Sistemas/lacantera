-- ---------------------------------------------------------------------------
-- El libro dice cómo se pagó y en qué moneda
--
-- Christopher: «debemos ajustar /app/tesoreria/movimientos. Sencillamente no
-- está correcto en trasfondo o data, ya no se manejan cajas ni bancos, esto dará
-- error tarde o temprano».
--
-- Es cierto y es más grande de lo que parece: la cuenta no es una columna de una
-- pantalla, es el eje por el que pasa TODO el dinero. DIECISÉIS funciones
-- escriben en `tesoreria_movimientos` —compras, nómina, cobros, liquidaciones,
-- anticipos— y las siete cuentas cargadas son de prueba, empezando por una que
-- se llama «CAJA CHICA PRUEBA».
--
-- Preguntado qué la sustituye, la respuesta fue: el MÉTODO y la MONEDA.
--
-- =========================================================================
-- ESTE PASO NO ROMPE NADA, Y ESE ES EL PUNTO
-- =========================================================================
--
-- Hay una trampa en el orden. Si se borran las cuentas mientras `cuenta_id`
-- sigue siendo obligatoria, ningún pago se puede registrar: el error que se
-- teme para «tarde o temprano» pasa a ser esta noche.
--
-- Así que primero se añade lo que sustituye, se rellena solo con lo que ya se
-- sabe, y la cuenta pasa a ser opcional. Las dieciséis siguen pasándola y
-- ninguna se entera. Retirarla de los formularios de pago y borrar los datos de
-- prueba va en el siguiente tramo, con sitio para probarlo.
--
-- =========================================================================
-- DE DÓNDE SALE CADA UNO
-- =========================================================================
--
-- La MONEDA estaba, escondida: vivía en la cuenta. Cada movimiento ya guarda su
-- `tasa` y su `tasa_usd`, y de ahí salen `monto_bs` y `monto_usd`, pero en
-- ninguna parte decía «esto son dólares». Quitando la cuenta sin esto, la moneda
-- original se habría perdido.
--
-- El MÉTODO también estaba, y en el sitio correcto: `instrucciones_pago.metodo`
-- —EFECTIVO, TRANSFERENCIA, PAGO_MOVIL— que es lo que de verdad se registra
-- cuando alguien paga. El libro no lo miraba.
--
-- El disparador de inmutabilidad se apaga para rellenar y se vuelve a encender
-- en la misma transacción: el libro de tesorería no se modifica, y esta
-- migración lo modifica una vez, a propósito y con motivo.
--
-- COMPROBADO tras aplicar: 15 de 15 con moneda, 13 de 15 con método —los dos sin
-- él son la apertura y la nómina, que no nacen de una instrucción de pago—, y el
-- disparador volvió encendido.
-- ---------------------------------------------------------------------------

alter table public.tesoreria_movimientos
  add column if not exists metodo text,
  add column if not exists moneda text;

comment on column public.tesoreria_movimientos.metodo is
  'Cómo se pagó: EFECTIVO, TRANSFERENCIA, PAGO_MOVIL… Sustituye a «de qué cuenta salió», que era un dato que la empresa ya no lleva.';

comment on column public.tesoreria_movimientos.moneda is
  'En qué moneda se movió. Antes vivía en la cuenta, así que al quitar la cuenta se habría perdido: `monto_bs` y `monto_usd` salen de las tasas y ninguno de los dos dice cuál era la original.';

do $migracion$
begin
  alter table public.tesoreria_movimientos disable trigger tesoreria_movimientos_inmutable;

  update public.tesoreria_movimientos m
     set moneda = coalesce(m.moneda, c.moneda)
    from public.cuentas_tesoreria c
   where c.id = m.cuenta_id
     and m.moneda is null;

  update public.tesoreria_movimientos m
     set metodo = coalesce(m.metodo, i.metodo)
    from public.instrucciones_pago i
   where i.id = m.instruccion_id
     and m.metodo is null;

  alter table public.tesoreria_movimientos enable trigger tesoreria_movimientos_inmutable;
end;
$migracion$;

alter table public.tesoreria_movimientos alter column cuenta_id drop not null;

comment on column public.tesoreria_movimientos.cuenta_id is
  'De qué cuenta salió. EN RETIRADA: la empresa ya no lleva cajas ni bancos, y su sitio lo ocupan `metodo` y `moneda`. Se deja para no perder lo ya escrito; no construir nada nuevo encima.';

-- ---------------------------------------------------------------------------
-- El escritor acepta los dos datos nuevos
--
-- OJO, Y ESTO COSTÓ: el `drop` de la versión vieja va ANTES del `create`, en
-- esta misma migración. Al aplicarlo sin él quedaron las dos vivas —la de doce
-- argumentos y la de catorce— y toda llamada empezó a fallar con «function is
-- not unique». Con dieciséis funciones colgando de ella, eso es el sistema de
-- pagos entero parado. Es la regla 7 de la casa, cobrada por segunda vez el
-- mismo día.
-- ---------------------------------------------------------------------------
drop function if exists private.registrar_movimiento_tesoreria(
  bigint, text, integer, numeric, text, date, text, text, bigint, bigint, bigint, text);

create or replace function private.registrar_movimiento_tesoreria(
  p_cuenta bigint,
  p_tipo text,
  p_signo integer,
  p_monto numeric,
  p_concepto text,
  p_fecha date default null,
  p_referencia text default null,
  p_contraparte text default null,
  p_instruccion bigint default null,
  p_orden bigint default null,
  p_origen bigint default null,
  p_nota text default null,
  p_metodo text default null,
  p_moneda text default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_cuenta public.cuentas_tesoreria;
  v_moneda text;
  v_metodo text;
  v_fecha  date := coalesce(p_fecha, (now() at time zone 'America/Caracas')::date);
  v_tasas  record;
  v_id     bigint;
begin
  if p_cuenta is not null then
    select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta;
    if v_cuenta.id is null then
      raise exception 'No existe esa cuenta.' using errcode = 'P0002';
    end if;
  end if;

  -- La moneda: la que digan, o la de la cuenta mientras haya cuenta. Sin una ni
  -- otra no se puede convertir nada, así que se para aquí y no al calcular.
  v_moneda := coalesce(nullif(btrim(coalesce(p_moneda, '')), ''), v_cuenta.moneda);
  if v_moneda is null then
    raise exception 'Falta decir en qué moneda se movió el dinero.' using errcode = '22023';
  end if;

  -- El método: el que digan, o el de la instrucción de pago que lo originó.
  v_metodo := nullif(btrim(coalesce(p_metodo, '')), '');
  if v_metodo is null and p_instruccion is not null then
    select i.metodo into v_metodo from public.instrucciones_pago i where i.id = p_instruccion;
  end if;

  select * into v_tasas from private.tasas_del_dia(v_moneda, v_fecha);

  insert into public.tesoreria_movimientos
    (numero, fecha, cuenta_id, tipo, signo, monto, tasa, tasa_usd, concepto,
     referencia, contraparte, instruccion_id, orden_id, movimiento_origen, nota,
     registrado_por, metodo, moneda)
  values
    (private.siguiente_numero('TES'), v_fecha, p_cuenta, p_tipo, p_signo, p_monto,
     v_tasas.tasa, v_tasas.tasa_usd, btrim(p_concepto),
     nullif(btrim(coalesce(p_referencia, '')), ''),
     nullif(btrim(coalesce(p_contraparte, '')), ''),
     p_instruccion, p_orden, p_origen, nullif(btrim(coalesce(p_nota, '')), ''),
     (select auth.uid()), v_metodo, v_moneda)
  returning id into v_id;

  return v_id;
end;
$func$;

comment on function private.registrar_movimiento_tesoreria(bigint, text, integer, numeric, text, date, text, text, bigint, bigint, bigint, text, text, text) is
  'El único escritor del libro de tesorería. La cuenta ya es opcional: su sitio lo ocupan el método y la moneda, que es lo que la empresa lleva de verdad.';

-- COMPROBADO, en transacción revertida, después del drop:
--
--   versiones vivas ......... 1
--   con cuenta, como hoy .... moneda=USD, cuenta=8   (las dieciséis siguen igual)
--   sin cuenta, mundo nuevo . moneda=USD, metodo=TRANSFERENCIA, sin cuenta
--   sin cuenta ni moneda .... parado: «Falta decir en qué moneda se movió»
--   registrar_egreso ........ pasa (una de las dieciséis, de verdad)
--   modificar el libro ...... parado: «El libro de tesorería no se edita ni se borra»
