-- ============================================================================
-- Tesorería: dónde está el dinero y por dónde salió
--
-- Hasta ahora una compra se pagaba y el sistema anotaba que estaba pagada,
-- pero no de qué cuenta había salido el dinero. Eso deja dos preguntas sin
-- respuesta: cuánto hay disponible ahora mismo, y con qué se pagó cuando el
-- banco pide explicaciones.
--
-- Tres decisiones sostienen el módulo:
--
--   1. Una cuenta, una moneda. Una cuenta en bolívares no guarda dólares.
--      Mezclarlas obliga a inventar un saldo "equivalente" que ya no coincide
--      con lo que dice el banco, que es contra lo único que se concilia.
--
--   2. El saldo no se guarda: se suma del libro. Un saldo almacenado se
--      desincroniza el día que algo falla a mitad de camino, y desde entonces
--      nadie sabe cuál de los dos números creer.
--
--   3. El libro es inmutable, como el de inventario. Un movimiento equivocado
--      se corrige con su contrario, no borrándolo. Un banco tampoco borra
--      líneas del estado de cuenta.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Cuentas
-- ---------------------------------------------------------------------------
create table if not exists public.cuentas_tesoreria (
  id             bigint generated always as identity primary key,
  codigo         text not null unique,
  nombre         text not null,
  tipo           text not null check (tipo in ('BANCO', 'CAJA', 'BILLETERA')),
  moneda         char(3) not null references public.monedas(codigo),

  banco          text,
  numero_cuenta  text,
  titular        text,
  documento      text,   -- cédula o RIF del titular
  correo_binance text,
  red_cripto     text,

  -- Un banco puede tener línea de crédito; una caja chica no puede entregar
  -- billetes que no tiene. Por eso el sobregiro se autoriza por cuenta y no
  -- por sistema.
  permite_sobregiro boolean not null default false,

  activa         boolean not null default true,
  nota           text,
  creada_por     uuid references auth.users(id),
  creada_en      timestamptz not null default now()
);

alter table public.cuentas_tesoreria drop constraint if exists cuentas_datos_por_tipo;
alter table public.cuentas_tesoreria add constraint cuentas_datos_por_tipo check (
  case tipo
    when 'BANCO'     then banco is not null and numero_cuenta is not null and titular is not null
    when 'CAJA'      then titular is not null            -- quién responde por el efectivo
    when 'BILLETERA' then correo_binance is not null or numero_cuenta is not null
  end
);

create index if not exists cuentas_activas_idx
  on public.cuentas_tesoreria (activa, moneda, nombre);

-- ---------------------------------------------------------------------------
-- El libro
--
-- Una línea por movimiento de dinero, con la tasa del día congelada. Sin
-- congelarla, el valor en dólares de un pago de enero cambiaría cada vez que
-- se recalcula, y el informe de marzo no coincidiría con el de abril.
-- ---------------------------------------------------------------------------
create table if not exists public.tesoreria_movimientos (
  id            bigint generated always as identity primary key,
  numero        text not null unique,
  fecha         date not null default current_date,

  cuenta_id     bigint not null references public.cuentas_tesoreria(id),
  tipo          text not null check (tipo in (
                  'APERTURA', 'INGRESO', 'EGRESO', 'PAGO', 'IGTF',
                  'COMISION', 'TRANSFERENCIA', 'AJUSTE', 'REVERSO')),
  signo         smallint not null check (signo in (-1, 1)),
  monto         numeric(20,6) not null check (monto > 0),

  tasa          numeric(20,10) not null check (tasa > 0),
  tasa_usd      numeric(20,10) not null check (tasa_usd > 0),
  monto_bs      numeric(20,6) generated always as (round(monto * tasa, 2)) stored,
  monto_usd     numeric(20,6) generated always as (round(monto * tasa / tasa_usd, 2)) stored,

  concepto      text not null,
  referencia    text,   -- número de transacción del banco
  contraparte   text,   -- a quién se le pagó o de quién entró

  -- De dónde viene el movimiento, cuando viene de otra parte del sistema.
  instruccion_id bigint references public.instrucciones_pago(id),
  orden_id       bigint references public.ordenes_compra(id),

  -- Las dos patas de una transferencia se apuntan entre sí: sin eso, un
  -- traslado entre cuentas propias se lee como un gasto y un ingreso, y el
  -- mismo dinero aparece dos veces en los totales del mes.
  transferencia_par bigint references public.tesoreria_movimientos(id),
  movimiento_origen bigint references public.tesoreria_movimientos(id),

  nota          text,
  registrado_por uuid references auth.users(id),
  registrado_en timestamptz not null default now()
);

create index if not exists tesoreria_cuenta_idx
  on public.tesoreria_movimientos (cuenta_id, fecha desc, id desc);
create index if not exists tesoreria_instruccion_idx
  on public.tesoreria_movimientos (instruccion_id);

create or replace function private.tesoreria_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Única excepción: enlazar las dos patas de una transferencia. La segunda no
  -- existe todavía cuando se escribe la primera, así que el enlace solo puede
  -- ponerse después. Se comprueba que no cambie nada más comparando las dos
  -- filas sin ese campo: cualquier otra edición sigue prohibida.
  if tg_op = 'UPDATE'
     and old.transferencia_par is null
     and new.transferencia_par is not null
     and to_jsonb(old) - 'transferencia_par' = to_jsonb(new) - 'transferencia_par' then
    return new;
  end if;

  raise exception 'El libro de tesorería no se edita ni se borra. Para corregir el movimiento %, revérsalo: queda la línea equivocada y la que la anula, y se entiende qué pasó.',
    coalesce(old.numero, '')
    using errcode = '55006';
end;
$$;

drop trigger if exists tesoreria_movimientos_inmutable on public.tesoreria_movimientos;
create trigger tesoreria_movimientos_inmutable
  before update or delete on public.tesoreria_movimientos
  for each row execute function private.tesoreria_inmutable();

-- ---------------------------------------------------------------------------
-- Saldos
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
  m.ultimo_movimiento
from public.cuentas_tesoreria c
left join lateral (
  select
    sum(t.signo * t.monto)     as saldo,
    -- El saldo en bolívares y en dólares se suma movimiento a movimiento con
    -- la tasa de cada día. Convertir el saldo final con la tasa de hoy diría
    -- cuánto valdría ese dinero si hubiera entrado hoy, que es otra cosa.
    sum(t.signo * t.monto_bs)  as saldo_bs,
    sum(t.signo * t.monto_usd) as saldo_usd,
    count(*)                   as movimientos,
    max(t.fecha)               as ultimo_movimiento
  from public.tesoreria_movimientos t
  where t.cuenta_id = c.id
) m on true;

grant select on public.v_saldos_tesoreria to authenticated;

-- Lo que se le debe a los proveedores: instrucciones emitidas y todavía sin
-- pagar. Es la cola de trabajo de tesorería y, a la vez, la deuda del día.
create or replace view public.v_cuentas_por_pagar
with (security_invoker = on) as
select
  i.id                as instruccion_id,
  i.orden_id,
  o.numero            as orden_numero,
  o.solicitud_id,
  s.titulo,
  p.id                as proveedor_id,
  p.nombre            as proveedor,
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
  current_date - i.creada_en::date as dias_esperando
from public.instrucciones_pago i
join public.ordenes_compra o     on o.id = i.orden_id
join public.solicitudes_pedido s on s.id = o.solicitud_id
left join public.proveedores p   on p.id = o.proveedor_id
where i.estado = 'POR_PAGAR'
  and o.estado not in ('CANCELADA');

grant select on public.v_cuentas_por_pagar to authenticated;

-- ---------------------------------------------------------------------------
-- Escribir en el libro
-- ---------------------------------------------------------------------------
create or replace function private.saldo_cuenta(p_cuenta bigint)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(signo * monto), 0)
  from public.tesoreria_movimientos where cuenta_id = p_cuenta;
$$;

create or replace function private.registrar_movimiento_tesoreria(
  p_cuenta      bigint,
  p_tipo        text,
  p_signo       integer,
  p_monto       numeric,
  p_concepto    text,
  p_fecha       date    default null,
  p_referencia  text    default null,
  p_contraparte text    default null,
  p_instruccion bigint  default null,
  p_orden       bigint  default null,
  p_origen      bigint  default null,
  p_nota        text    default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cuenta record;
  v_fecha  date := coalesce(p_fecha, current_date);
  v_tasas  record;
  v_saldo  numeric;
  v_id     bigint;
begin
  if p_signo not in (-1, 1) then
    raise exception 'El signo de un movimiento solo puede ser +1 o -1 (recibido: %).', p_signo
      using errcode = '22023';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta;

  if v_cuenta.id is null then
    raise exception 'No existe la cuenta %.', p_cuenta using errcode = 'P0002';
  end if;

  if not v_cuenta.activa then
    raise exception 'La cuenta "%" está cerrada. Reábrela si todavía se mueve dinero por ella.', v_cuenta.nombre
      using errcode = '55000';
  end if;

  if v_fecha > current_date then
    raise exception 'No se puede registrar un movimiento con fecha futura.' using errcode = '22023';
  end if;

  -- Una salida que deja la cuenta en negativo casi nunca es una salida real:
  -- o falta cargar el saldo de apertura, o el dinero salió de otra cuenta.
  if p_signo = -1 and not v_cuenta.permite_sobregiro then
    v_saldo := private.saldo_cuenta(p_cuenta);
    if v_saldo - p_monto < -0.005 then
      raise exception 'En "%" hay % % y se intentan sacar %. Si el saldo no está al día, registra primero el saldo de apertura o el ingreso que falta.',
        v_cuenta.nombre, round(v_saldo, 2), v_cuenta.moneda, round(p_monto, 2)
        using errcode = '55000';
    end if;
  end if;

  select * into v_tasas from private.tasas_del_dia(v_cuenta.moneda, v_fecha);

  insert into public.tesoreria_movimientos
    (numero, fecha, cuenta_id, tipo, signo, monto, tasa, tasa_usd, concepto,
     referencia, contraparte, instruccion_id, orden_id, movimiento_origen, nota,
     registrado_por)
  values
    (private.siguiente_numero('TES'), v_fecha, p_cuenta, p_tipo, p_signo, p_monto,
     v_tasas.tasa, v_tasas.tasa_usd, trim(p_concepto),
     nullif(trim(coalesce(p_referencia, '')), ''),
     nullif(trim(coalesce(p_contraparte, '')), ''),
     p_instruccion, p_orden, p_origen,
     nullif(trim(coalesce(p_nota, '')), ''),
     (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Operaciones
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

  -- Cambiarle la moneda a una cuenta con movimientos reinterpretaría todo lo
  -- que ya pasó por ella: los mismos números pasarían a significar otra cosa.
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
end;
$$;

-- El saldo de apertura es el puente entre lo que ya había y lo que el sistema
-- va a llevar de ahora en adelante. Se registra una sola vez por cuenta: dos
-- aperturas serían dos versiones del punto de partida.
create or replace function public.registrar_apertura(
  p_cuenta bigint,
  p_monto  numeric,
  p_fecha  date default null,
  p_nota   text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.exigir_rol('TESORERIA');

  if exists (select 1 from public.tesoreria_movimientos
              where cuenta_id = p_cuenta and tipo = 'APERTURA') then
    raise exception 'Esta cuenta ya tiene su saldo de apertura. Si estaba mal, corrígelo con un ajuste.'
      using errcode = '55000';
  end if;

  return private.registrar_movimiento_tesoreria(
    p_cuenta, 'APERTURA', 1, p_monto, 'Saldo de apertura', p_fecha,
    null, null, null, null, null, p_nota);
end;
$$;

create or replace function public.registrar_ingreso(
  p_cuenta      bigint,
  p_monto       numeric,
  p_concepto    text,
  p_fecha       date default null,
  p_referencia  text default null,
  p_contraparte text default null,
  p_nota        text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.exigir_rol('TESORERIA');

  if length(trim(coalesce(p_concepto, ''))) < 4 then
    raise exception 'Escribe de qué es el ingreso. Un monto sin concepto no se puede conciliar después.'
      using errcode = '22023';
  end if;

  return private.registrar_movimiento_tesoreria(
    p_cuenta, 'INGRESO', 1, p_monto, p_concepto, p_fecha,
    p_referencia, p_contraparte, null, null, null, p_nota);
end;
$$;

create or replace function public.registrar_egreso(
  p_cuenta      bigint,
  p_monto       numeric,
  p_concepto    text,
  p_fecha       date default null,
  p_referencia  text default null,
  p_contraparte text default null,
  p_nota        text default null,
  p_tipo        text default 'EGRESO'
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.exigir_rol('TESORERIA');

  if length(trim(coalesce(p_concepto, ''))) < 4 then
    raise exception 'Escribe en qué se gastó. Un monto sin concepto no se puede conciliar después.'
      using errcode = '22023';
  end if;

  if p_tipo not in ('EGRESO', 'COMISION') then
    raise exception 'Tipo de egreso no válido: %.', p_tipo using errcode = '22023';
  end if;

  return private.registrar_movimiento_tesoreria(
    p_cuenta, p_tipo, -1, p_monto, p_concepto, p_fecha,
    p_referencia, p_contraparte, null, null, null, p_nota);
end;
$$;

-- Mover dinero entre cuentas propias no es un gasto seguido de un ingreso: es
-- el mismo dinero cambiando de sitio. Se escriben las dos patas juntas y se
-- apuntan entre sí para que ningún informe lo cuente como movimiento del mes.
create or replace function public.transferir_entre_cuentas(
  p_origen         bigint,
  p_destino        bigint,
  p_monto          numeric,
  p_monto_destino  numeric default null,
  p_fecha          date default null,
  p_referencia     text default null,
  p_nota           text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ori     record;
  v_des     record;
  v_llega   numeric;
  v_sale_id bigint;
  v_entra_id bigint;
begin
  perform private.exigir_rol('TESORERIA');

  if p_origen = p_destino then
    raise exception 'El origen y el destino son la misma cuenta.' using errcode = '22023';
  end if;

  select * into v_ori from public.cuentas_tesoreria where id = p_origen;
  select * into v_des from public.cuentas_tesoreria where id = p_destino;

  if v_ori.id is null or v_des.id is null then
    raise exception 'Alguna de las dos cuentas no existe.' using errcode = 'P0002';
  end if;

  -- Entre monedas distintas, lo que llega no se calcula: se copia del
  -- comprobante. La casa de cambio no aplica la tasa oficial y el sistema no
  -- va a inventar un número que el banco desmienta.
  if v_ori.moneda = v_des.moneda then
    v_llega := coalesce(p_monto_destino, p_monto);
    if v_llega <> p_monto then
      raise exception 'Entre dos cuentas en % debe llegar lo mismo que sale. Si el banco cobró comisión, regístrala aparte.', v_ori.moneda
        using errcode = '22023';
    end if;
  else
    v_llega := p_monto_destino;
    if coalesce(v_llega, 0) <= 0 then
      raise exception 'Indica cuánto llegó en % : entre monedas distintas el monto lo decide el cambio, no el sistema.', v_des.moneda
        using errcode = '22023';
    end if;
  end if;

  v_sale_id := private.registrar_movimiento_tesoreria(
    p_origen, 'TRANSFERENCIA', -1, p_monto,
    'Transferencia a ' || v_des.nombre, p_fecha, p_referencia, v_des.nombre,
    null, null, null, p_nota);

  v_entra_id := private.registrar_movimiento_tesoreria(
    p_destino, 'TRANSFERENCIA', 1, v_llega,
    'Transferencia desde ' || v_ori.nombre, p_fecha, p_referencia, v_ori.nombre,
    null, null, null, p_nota);

  update public.tesoreria_movimientos set transferencia_par = v_entra_id where id = v_sale_id;
  update public.tesoreria_movimientos set transferencia_par = v_sale_id  where id = v_entra_id;

  return v_sale_id;
end;
$$;

create or replace function public.ajustar_cuenta(
  p_cuenta bigint,
  p_monto  numeric,
  p_motivo text,
  p_fecha  date default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.exigir_rol('TESORERIA');

  if length(trim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Un ajuste sin explicación es un descuadre escondido. Escribe qué apareció o qué faltó.'
      using errcode = '22023';
  end if;

  if coalesce(p_monto, 0) = 0 then
    raise exception 'Un ajuste de cero no ajusta nada.' using errcode = '22023';
  end if;

  return private.registrar_movimiento_tesoreria(
    p_cuenta, 'AJUSTE', case when p_monto > 0 then 1 else -1 end, abs(p_monto),
    'Ajuste: ' || trim(p_motivo), p_fecha, null, null, null, null, null, p_motivo);
end;
$$;

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

  return private.registrar_movimiento_tesoreria(
    v_m.cuenta_id, 'REVERSO', (v_m.signo * -1)::integer, v_m.monto,
    'Reverso de ' || v_m.numero || ': ' || trim(p_motivo),
    null, v_m.referencia, v_m.contraparte, null, null, v_m.id, p_motivo);
end;
$$;

-- ---------------------------------------------------------------------------
-- El pago de una compra ahora sale de una cuenta
--
-- Es el hueco que dejó el módulo de compras: la instrucción quedaba pagada
-- pero el dinero no salía de ninguna parte. Con la cuenta, el pago escribe su
-- línea en el libro y el saldo baja.
-- ---------------------------------------------------------------------------
drop function if exists public.registrar_pago(bigint, text, date, text);

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
  v_i        record;
  v_cuenta   record;
  v_o_estado text;
  v_faltan   numeric;
  v_concepto text;
  v_prov     text;
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

  -- La instrucción dice cuánto y en qué moneda hay que pagar; la cuenta tiene
  -- la suya. Si no coinciden, el monto que saldría del banco no sería el que
  -- se autorizó.
  if v_cuenta.moneda <> v_i.moneda then
    raise exception 'La instrucción es por % y la cuenta "%" está en %. Elige una cuenta en % o cambia la instrucción.',
      v_i.moneda, v_cuenta.nombre, v_cuenta.moneda, v_i.moneda
      using errcode = '22023';
  end if;

  select numero into v_concepto from public.ordenes_compra where id = v_i.orden_id;
  select p.nombre into v_prov
  from public.ordenes_compra o
  left join public.proveedores p on p.id = o.proveedor_id
  where o.id = v_i.orden_id;

  perform private.registrar_movimiento_tesoreria(
    p_cuenta_id, 'PAGO', -1, v_i.monto,
    'Pago de la orden ' || coalesce(v_concepto, v_i.orden_id::text),
    p_fecha, p_referencia, coalesce(v_prov, v_i.titular, v_i.receptor),
    v_i.id, v_i.orden_id, null, p_nota);

  -- El IGTF sale de la misma cuenta pero no es parte del precio: se escribe
  -- aparte para poder responder cuánto se pagó de impuesto en el mes sin
  -- desarmar cada pago.
  if v_i.igtf_monto > 0 then
    perform private.registrar_movimiento_tesoreria(
      p_cuenta_id, 'IGTF', -1, v_i.igtf_monto,
      'IGTF ' || trim(to_char(v_i.igtf_alicuota, 'FM990.99')) || '% de la orden ' ||
        coalesce(v_concepto, v_i.orden_id::text),
      p_fecha, p_referencia, coalesce(v_prov, v_i.titular),
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

-- ---------------------------------------------------------------------------
-- Cuentas de arranque
--
-- Las cuentas que casi con seguridad existen, para que tesorería no empiece
-- con la pantalla en blanco. Los números quedan en "POR DEFINIR" a la vista:
-- inventar uno sería peor que dejarlo pendiente, y así se ve qué falta.
-- ---------------------------------------------------------------------------
insert into public.cuentas_tesoreria (codigo, nombre, tipo, moneda, banco, numero_cuenta, titular, permite_sobregiro)
values
  ('BCO-VES-1', 'Banesco · cuenta corriente Bs', 'BANCO', 'VES', 'Banesco', 'POR DEFINIR', 'La Cantera C.A.', false),
  ('BCO-USD-1', 'Banco Nacional de Crédito · divisas', 'BANCO', 'USD', 'BNC', 'POR DEFINIR', 'La Cantera C.A.', false),
  ('CAJA-BS',   'Caja chica en bolívares', 'CAJA', 'VES', null, null, 'Administración', false),
  ('CAJA-USD',  'Caja chica en divisas', 'CAJA', 'USD', null, null, 'Administración', false)
on conflict (codigo) do nothing;

insert into public.cuentas_tesoreria (codigo, nombre, tipo, moneda, correo_binance, titular, permite_sobregiro)
values ('BIN-USDT', 'Binance · USDT', 'BILLETERA', 'USD', 'POR DEFINIR', 'La Cantera C.A.', false)
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array['cuentas_tesoreria', 'tesoreria_movimientos'] loop
    execute format('alter table public.%I enable row level security', v_tabla);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', v_tabla);
    execute format('grant select on public.%I to authenticated', v_tabla);
    execute format('drop policy if exists %I on public.%I', v_tabla || '_lectura', v_tabla);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      v_tabla || '_lectura', v_tabla);
  end loop;
end
$$;

do $$
declare
  v_firma text;
begin
  foreach v_firma in array array[
    'public.guardar_cuenta(bigint, text, text, text, char, text, text, text, text, text, text, boolean, boolean, text)',
    'public.registrar_apertura(bigint, numeric, date, text)',
    'public.registrar_ingreso(bigint, numeric, text, date, text, text, text)',
    'public.registrar_egreso(bigint, numeric, text, date, text, text, text, text)',
    'public.transferir_entre_cuentas(bigint, bigint, numeric, numeric, date, text, text)',
    'public.ajustar_cuenta(bigint, numeric, text, date)',
    'public.reversar_movimiento_tesoreria(bigint, text)',
    'public.registrar_pago(bigint, bigint, text, date, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_firma);
    execute format('grant execute on function %s to authenticated', v_firma);
  end loop;
end
$$;
