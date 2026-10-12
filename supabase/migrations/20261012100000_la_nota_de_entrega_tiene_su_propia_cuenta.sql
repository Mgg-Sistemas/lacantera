-- ============================================================================
-- La nota de entrega tiene su propia cuenta por cobrar o por pagar
--
-- «Ya existe el módulo de cuentas por cobrar y notas de crédito, pero están
-- enlazados a las facturas, aún no podemos gestionar por facturas» —no por
-- falta de código, sino porque la facturación todavía no se usa por trámites
-- legales con la sucursal. Mientras tanto el material sale igual, con nota de
-- entrega, y hay que poder cobrarlo (o devolverlo si pagaron de más) sin
-- esperar a esa factura.
--
-- Por eso esto NO toca facturas_venta, cobros_venta ni notas_credito: es su
-- propio libro, colgado directo de notas_entrega. El día que la facturación
-- se active, `facturar_notas` podrá trasladar estos movimientos a cobros_venta
-- —se decide entonces, no aquí—.
--
-- SIN IVA, SIN RETENCIÓN. El negocio no aplica IVA todavía: el saldo de la
-- nota es su `total_usd` tal cual (ya neto de descuento y flete), sin nada que
-- restarle por retención porque esa casilla no existe fuera de una factura.
--
-- UNA SOLA CUENTA, DOS SENTIDOS. No hay «cuenta por cobrar» y «cuenta por
-- pagar» como objetos distintos: es el mismo saldo neto de la nota. Si es
-- positivo, el cliente debe (por cobrar); si es negativo —pagó de más, o se le
-- reembolsa algo—, la empresa le debe a él (por pagar). Un solo libro con dos
-- tipos de movimiento, COBRO y REEMBOLSO, basta para las dos direcciones.
--
-- LA TASA ES LA DEL DÍA EN QUE SE REGISTRA EL MOVIMIENTO, no la de la nota.
-- Es el mismo patrón que `registrar_cobro` de facturas: la nota congeló su
-- tasa al despachar, pero el dinero entra o sale un día distinto y a su propio
-- cambio — por eso el saldo se lleva en dólares y no en bolívares.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. El libro de movimientos
-- ---------------------------------------------------------------------------
create table if not exists public.cuenta_nota_entrega_movimientos (
  id            bigint generated always as identity primary key,
  numero        text not null unique,
  nota_id       bigint not null references public.notas_entrega(id),

  tipo          text not null check (tipo in ('COBRO', 'REEMBOLSO')),
  fecha         date not null default current_date,

  cuenta_id     bigint not null references public.cuentas_tesoreria(id),
  moneda        char(3) not null references public.monedas(codigo),
  tasa          numeric(20,10) not null check (tasa > 0),
  tasa_usd      numeric(20,10) not null check (tasa_usd > 0),
  monto         numeric(20,6) not null check (monto > 0),
  monto_usd     numeric(20,6) generated always as (round(monto * tasa / tasa_usd, 2)) stored,

  referencia    text,
  observacion   text,

  estado        text not null default 'VIGENTE' check (estado in ('VIGENTE', 'ANULADO')),
  motivo_anulacion text,

  movimiento_id    bigint,
  registrado_por   uuid references auth.users(id),
  registrado_en    timestamptz not null default now(),
  anulado_por      uuid references auth.users(id),
  anulado_en       timestamptz
);

create index if not exists cuenta_nota_entrega_movimientos_nota_idx
  on public.cuenta_nota_entrega_movimientos (nota_id);

alter table public.cuenta_nota_entrega_movimientos enable row level security;
revoke insert, update, delete on public.cuenta_nota_entrega_movimientos from anon, authenticated;
grant select on public.cuenta_nota_entrega_movimientos to authenticated;

drop policy if exists cuenta_nota_entrega_movimientos_lectura on public.cuenta_nota_entrega_movimientos;
create policy cuenta_nota_entrega_movimientos_lectura on public.cuenta_nota_entrega_movimientos
  for select to authenticated using (private.tiene_permiso('FACTURACION', 'LECTURA'));

-- ---------------------------------------------------------------------------
-- 2. La vista: una fila por nota con saldo, no con el libro completo
--
-- Solo las notas vigentes (una ANULADA no debe ni le deben nada: el material
-- volvió al patio). El saldo se lleva en dólares; el equivalente en bolívares
-- al cambio de hoy lo arma la pantalla con la tasa vigente, igual que ya hace
-- con el pago combinado — no se congela nada aquí porque todavía no se pagó.
-- ---------------------------------------------------------------------------
create or replace view public.v_cuenta_nota_entrega
with (security_invoker = on) as
select
  n.id as nota_id,
  n.numero,
  n.cliente_id,
  c.nombre as cliente,
  n.moneda,
  n.fecha,
  n.total_usd,
  coalesce(cobros.monto_usd, 0)::numeric(20,6) as cobrado_usd,
  coalesce(reembolsos.monto_usd, 0)::numeric(20,6) as reembolsado_usd,
  (n.total_usd - coalesce(cobros.monto_usd, 0) + coalesce(reembolsos.monto_usd, 0))::numeric(20,6) as saldo_usd
from public.notas_entrega n
join public.clientes c on c.id = n.cliente_id
left join lateral (
  select sum(m.monto_usd) as monto_usd
    from public.cuenta_nota_entrega_movimientos m
   where m.nota_id = n.id and m.tipo = 'COBRO' and m.estado = 'VIGENTE'
) cobros on true
left join lateral (
  select sum(m.monto_usd) as monto_usd
    from public.cuenta_nota_entrega_movimientos m
   where m.nota_id = n.id and m.tipo = 'REEMBOLSO' and m.estado = 'VIGENTE'
) reembolsos on true
where n.estado <> 'ANULADA';

grant select on public.v_cuenta_nota_entrega to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Registrar un movimiento (COBRO o REEMBOLSO)
--
-- Mismo permiso que el resto de la pantalla de Notas de entrega —Facturación
-- en escritura—, porque esto vive ahí y lo maneja la misma gente, aunque no
-- toque ni una tabla fiscal.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_movimiento_cuenta_nota(
  p_nota_id     bigint,
  p_tipo        text,
  p_monto       numeric,
  p_cuenta_id   bigint,
  p_fecha       date default null,
  p_referencia  text default null,
  p_observacion text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nota   record;
  v_cuenta record;
  v_fecha  date := coalesce(p_fecha, current_date);
  v_tasas  record;
  v_id     bigint;
  v_mov    bigint;
begin
  perform private.exigir_permiso('FACTURACION', 'ESCRITURA');

  if p_tipo not in ('COBRO', 'REEMBOLSO') then
    raise exception 'El movimiento es COBRO o REEMBOLSO, no «%».', p_tipo using errcode = '22023';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se registra un movimiento con fecha futura.' using errcode = '22023';
  end if;

  select * into v_nota from public.notas_entrega where id = p_nota_id;

  if v_nota.id is null then
    raise exception 'No existe la nota de entrega %.', p_nota_id using errcode = 'P0002';
  end if;

  if v_nota.estado = 'ANULADA' then
    raise exception 'La nota % está anulada: no tiene cuenta que cobrar ni que pagar.', v_nota.numero
      using errcode = '55000';
  end if;

  select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta_id;

  if v_cuenta.id is null then
    raise exception 'No existe la cuenta %.', p_cuenta_id using errcode = 'P0002';
  end if;

  -- El movimiento entra o sale en la moneda de la cuenta de tesorería, igual
  -- que un cobro de factura: el saldo se compara en dólares, no en la moneda
  -- de la nota ni en la de la cuenta.
  select * into v_tasas from private.tasas_del_dia(v_cuenta.moneda, v_fecha);

  insert into public.cuenta_nota_entrega_movimientos
    (numero, nota_id, tipo, fecha, cuenta_id, moneda, tasa, tasa_usd, monto,
     referencia, observacion, registrado_por)
  values
    (private.siguiente_numero('CXN'), p_nota_id, p_tipo, v_fecha, p_cuenta_id,
     v_cuenta.moneda, v_tasas.tasa, v_tasas.tasa_usd, p_monto,
     nullif(trim(coalesce(p_referencia, '')), ''), nullif(trim(coalesce(p_observacion, '')), ''),
     (select auth.uid()))
  returning id into v_id;

  -- El COBRO entra a la cuenta; el REEMBOLSO sale. El libro de tesorería no
  -- se edita nunca a mano: cada cosa que pasa es un asiento propio.
  if p_tipo = 'COBRO' then
    v_mov := private.registrar_movimiento_tesoreria(
      p_cuenta_id, 'INGRESO', 1, p_monto,
      format('COBRO DE LA NOTA DE ENTREGA %s', v_nota.numero),
      v_fecha, p_referencia, null, null, null, null, p_observacion);
  else
    v_mov := private.registrar_movimiento_tesoreria(
      p_cuenta_id, 'EGRESO', -1, p_monto,
      format('REEMBOLSO DE LA NOTA DE ENTREGA %s', v_nota.numero),
      v_fecha, p_referencia, null, null, null, null, p_observacion);
  end if;

  update public.cuenta_nota_entrega_movimientos set movimiento_id = v_mov where id = v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Anular un movimiento
-- ---------------------------------------------------------------------------
create or replace function public.anular_movimiento_cuenta_nota(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_mov  record;
  v_nota record;
begin
  perform private.exigir_permiso('FACTURACION', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula el movimiento.' using errcode = '22023';
  end if;

  select * into v_mov from public.cuenta_nota_entrega_movimientos where id = p_id;

  if v_mov.id is null then
    raise exception 'No existe el movimiento %.', p_id using errcode = 'P0002';
  end if;

  if v_mov.estado = 'ANULADO' then
    raise exception 'El movimiento % ya estaba anulado.', v_mov.numero using errcode = '55000';
  end if;

  select * into v_nota from public.notas_entrega where id = v_mov.nota_id;

  -- El dinero que entró o salió tiene que salir del libro con su propio
  -- asiento contrario: el libro de tesorería no se edita, se le escribe el
  -- reverso.
  perform private.registrar_movimiento_tesoreria(
    v_mov.cuenta_id, 'REVERSO', case when v_mov.tipo = 'COBRO' then -1 else 1 end, v_mov.monto,
    format('ANULACIÓN DEL MOVIMIENTO %s DE LA NOTA %s: %s',
           v_mov.numero, v_nota.numero, trim(p_motivo)),
    current_date, v_mov.referencia, null, null, null, v_mov.movimiento_id, null);

  update public.cuenta_nota_entrega_movimientos
     set estado = 'ANULADO',
         motivo_anulacion = trim(p_motivo),
         anulado_por = (select auth.uid()),
         anulado_en = now()
   where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. anular_nota_entrega no puede dejar movimientos de cuenta sueltos
--
-- Si ya se le cobró algo a esta nota (o se le reembolsó), anularla sin avisar
-- dejaría un cobro en el libro de tesorería sin ningún documento vigente
-- detrás. Se anulan primero los movimientos; después, la nota.
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_def   text;
  v_ancla text := $anchor$  if v_nota.estado = 'FACTURADA' then$anchor$;
  v_nueva text := $nuevo$  if exists (
    select 1 from public.cuenta_nota_entrega_movimientos
     where nota_id = p_id and estado = 'VIGENTE'
  ) then
    raise exception 'La nota % tiene cobros o reembolsos registrados. Anúlalos primero.', v_nota.numero
      using errcode = '55000';
  end if;

  if v_nota.estado = 'FACTURADA' then$nuevo$;
begin
  select pg_get_functiondef('public.anular_nota_entrega(bigint, text)'::regprocedure) into strict v_def;

  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'anular_nota_entrega no tiene el ancla esperada exactamente una vez.'
      using errcode = '22023';
  end if;

  v_def := replace(v_def, v_ancla, v_nueva);
  execute 'drop function public.anular_nota_entrega(bigint, text)';
  execute v_def;
end
$mig$;

-- ---------------------------------------------------------------------------
-- 6. Permisos de ejecución
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.registrar_movimiento_cuenta_nota(bigint, text, numeric, bigint, date, text, text)',
    'public.anular_movimiento_cuenta_nota(bigint, text)',
    'public.anular_nota_entrega(bigint, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant   execute on function %s to authenticated', v_fn);
  end loop;
end
$$;
