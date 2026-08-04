-- ============================================================================
-- Facturas de proveedor
--
-- Hasta ahora una compra terminaba en una recepción de material y una
-- instrucción de pago. Faltaba el papel: la factura que emite el proveedor, que
-- es lo que sustenta el crédito fiscal del IVA y lo que va al libro de compras.
-- Sin ella, el IVA pagado no se puede descontar del IVA cobrado, y eso es
-- dinero real que se queda en el camino.
--
-- CUATRO DECISIONES:
--
-- 1. NO SE COPIAN LOS RENGLONES. Una factura de proveedor puede traer cuarenta
--    líneas y nadie las teclea; lo que el libro de compras necesita son cuatro
--    cifras —exento, base imponible, IVA y total— y esas sí se copian, tal
--    como están impresas. El detalle de qué llegó ya vive en la recepción.
--
-- 2. EL TOTAL SE CALCULA Y TIENE QUE CUADRAR. Si la suma de lo que se teclea
--    no da el total del papel, o el papel está mal o el tecleo está mal, y las
--    dos cosas hay que verlas antes de guardar, no en la declaración.
--
-- 3. UN PROVEEDOR NO TIENE DOS FACTURAS CON EL MISMO NÚMERO. Es la única forma
--    de que la misma factura no se registre dos veces y se descuente dos veces
--    el mismo crédito fiscal, que es exactamente lo que un reparo busca.
--
-- 4. LOS PAGOS SE PARECEN A LOS COBROS. Misma forma que en ventas: la cuenta
--    de donde sale el dinero manda la moneda, el saldo se mide en dólares
--    porque se paga en las dos, y el IGTF va en su propio asiento porque no es
--    del proveedor sino del fisco.
--
-- La empresa es contribuyente ORDINARIO del IVA, así que no retiene IVA a sus
-- proveedores: la columna existe y admite un monto, pero por defecto va en
-- cero. Si algún día la califican como especial, se llena y no hay que tocar
-- nada más.
-- ============================================================================

create table if not exists public.facturas_compra (
  id              bigint generated always as identity primary key,
  proveedor_id    bigint not null references public.proveedores(id),
  orden_id        bigint references public.ordenes_compra(id),

  -- Los dos números son del proveedor, no nuestros: se copian del papel.
  numero_factura  text not null,
  numero_control  text,

  fecha_emision   date not null,
  fecha_recepcion date not null default current_date,

  condicion_pago  text not null default 'CONTADO'
                  check (condicion_pago in ('CONTADO', 'CREDITO_15', 'CREDITO_30', 'CREDITO_60')),
  dias_credito    smallint not null default 0 check (dias_credito >= 0),
  vence_el        date,

  moneda          char(3) not null references public.monedas(codigo),
  tasa            numeric(20,10) not null check (tasa > 0),
  tasa_usd        numeric(20,10) not null check (tasa_usd > 0),

  exento          numeric(20,2) not null default 0 check (exento >= 0),
  base_imponible  numeric(20,2) not null default 0 check (base_imponible >= 0),
  alicuota_iva    numeric(5,2)  not null default 16 check (alicuota_iva >= 0),
  iva             numeric(20,2) not null default 0 check (iva >= 0),

  -- Retenciones que le hacemos al proveedor: se le descuentan del pago y se
  -- enteran al fisco. Hoy en cero, porque somos contribuyentes ordinarios.
  retencion_iva   numeric(20,2) not null default 0 check (retencion_iva >= 0),
  retencion_islr  numeric(20,2) not null default 0 check (retencion_islr >= 0),

  -- El total se escribe en vez de generarse porque de él cuelgan dos columnas
  -- calculadas, y una columna calculada no puede apoyarse en otra. La función
  -- que registra lo pone, y la restricción de abajo comprueba que cuadre.
  total           numeric(20,2) not null check (total >= 0),
  total_bs        numeric(20,2) generated always as (round(total * tasa, 2)) stored,
  total_usd       numeric(20,2) generated always as (round(total * tasa / tasa_usd, 2)) stored,
  retencion_usd   numeric(20,2) generated always as (
                    round((retencion_iva + retencion_islr) * tasa / tasa_usd, 2)) stored,

  observacion     text,
  estado          text not null default 'REGISTRADA'
                  check (estado in ('REGISTRADA', 'PAGADA', 'ANULADA')),
  motivo_anulacion text,
  anulada_por     uuid references auth.users(id),
  anulada_en      timestamptz,

  registrada_por  uuid references auth.users(id),
  registrada_en   timestamptz not null default now(),

  constraint facturas_compra_unica unique (proveedor_id, numero_factura),
  constraint facturas_compra_total_cuadra check (total = round(exento + base_imponible + iva, 2)),
  constraint facturas_compra_recibida_despues check (fecha_recepcion >= fecha_emision),
  constraint facturas_compra_anulada_con_motivo check (
    estado <> 'ANULADA' or motivo_anulacion is not null)
);

create index if not exists facturas_compra_proveedor_idx
  on public.facturas_compra (proveedor_id, fecha_emision desc);
create index if not exists facturas_compra_estado_idx
  on public.facturas_compra (estado, vence_el);

-- ---------------------------------------------------------------------------
-- Pagos
-- ---------------------------------------------------------------------------
create table if not exists public.pagos_compra (
  id            bigint generated always as identity primary key,
  numero        text not null unique,
  factura_id    bigint not null references public.facturas_compra(id),
  cuenta_id     bigint not null references public.cuentas_tesoreria(id),

  fecha         date not null default current_date,
  metodo        text not null default 'TRANSFERENCIA'
                check (metodo in ('TRANSFERENCIA', 'PAGO_MOVIL', 'EFECTIVO', 'BINANCE', 'CHEQUE')),

  moneda        char(3) not null references public.monedas(codigo),
  tasa          numeric(20,10) not null check (tasa > 0),
  tasa_usd      numeric(20,10) not null check (tasa_usd > 0),
  monto         numeric(20,6) not null check (monto > 0),
  monto_usd     numeric(20,6) generated always as (round(monto * tasa / tasa_usd, 2)) stored,

  igtf_alicuota numeric(5,2) not null default 3 check (igtf_alicuota >= 0),
  igtf_aplica   boolean not null default false,
  igtf_monto    numeric(20,6) generated always as (
                  case when igtf_aplica then round(monto * igtf_alicuota / 100, 2) else 0 end
                ) stored,

  referencia    text,
  nota          text,

  movimiento_id      bigint references public.tesoreria_movimientos(id),
  movimiento_igtf_id bigint references public.tesoreria_movimientos(id),

  estado        text not null default 'REGISTRADO'
                check (estado in ('REGISTRADO', 'ANULADO')),
  motivo_anulacion text,
  anulado_por   uuid references auth.users(id),
  anulado_en    timestamptz,

  registrado_por uuid references auth.users(id),
  registrado_en  timestamptz not null default now(),

  constraint pagos_compra_anulado_con_motivo check (
    estado <> 'ANULADO' or motivo_anulacion is not null)
);

create index if not exists pagos_compra_factura_idx on public.pagos_compra (factura_id);

-- ---------------------------------------------------------------------------
-- Vistas
-- ---------------------------------------------------------------------------
create or replace view public.v_facturas_compra
with (security_invoker = on) as
select
  f.*,
  p.nombre as proveedor,
  p.rif    as proveedor_rif,
  o.numero as orden_numero,
  coalesce(g.pagado_usd, 0) as pagado_usd,
  greatest(f.total_usd - f.retencion_usd - coalesce(g.pagado_usd, 0), 0) as saldo_usd,
  case when f.estado = 'REGISTRADA' and f.vence_el is not null and f.vence_el < current_date
       then current_date - f.vence_el else 0 end as dias_vencida
from public.facturas_compra f
join public.proveedores p on p.id = f.proveedor_id
left join public.ordenes_compra o on o.id = f.orden_id
left join lateral (
  select sum(monto_usd) as pagado_usd
  from public.pagos_compra
  where factura_id = f.id and estado = 'REGISTRADO'
) g on true;

grant select on public.v_facturas_compra to authenticated;

create or replace view public.v_pagos_compra
with (security_invoker = on) as
select
  g.*,
  c.nombre as cuenta,
  f.numero_factura,
  p.nombre as proveedor
from public.pagos_compra g
join public.cuentas_tesoreria c on c.id = g.cuenta_id
join public.facturas_compra f   on f.id = g.factura_id
join public.proveedores p       on p.id = f.proveedor_id;

grant select on public.v_pagos_compra to authenticated;

-- El libro de compras del IVA. Es la forma en que el SENIAT quiere ver esto, y
-- por eso las columnas se llaman como se llaman ahí y no como en el resto del
-- sistema: quien lo transcriba tiene que reconocerlas de una pasada.
create or replace view public.v_libro_compras
with (security_invoker = on) as
select
  f.id,
  f.fecha_emision           as fecha,
  p.rif                     as rif_proveedor,
  p.nombre                  as proveedor,
  f.numero_factura,
  f.numero_control,
  f.moneda,
  f.exento                  as compras_exentas,
  f.base_imponible          as base_imponible,
  f.alicuota_iva,
  f.iva                     as credito_fiscal,
  f.total                   as total_compras,
  f.retencion_iva           as iva_retenido,
  round(f.exento         * f.tasa, 2) as compras_exentas_bs,
  round(f.base_imponible * f.tasa, 2) as base_imponible_bs,
  round(f.iva            * f.tasa, 2) as credito_fiscal_bs,
  round(f.total          * f.tasa, 2) as total_compras_bs
from public.facturas_compra f
join public.proveedores p on p.id = f.proveedor_id
where f.estado <> 'ANULADA';

grant select on public.v_libro_compras to authenticated;

-- ---------------------------------------------------------------------------
-- Escribir
-- ---------------------------------------------------------------------------
create or replace function public.registrar_factura_compra(
  p_proveedor_id   bigint,
  p_numero_factura text,
  p_fecha_emision  date,
  p_exento         numeric default 0,
  p_base_imponible numeric default 0,
  p_iva            numeric default 0,
  p_moneda         char(3) default 'VES',
  p_numero_control text default null,
  p_orden_id       bigint default null,
  p_condicion_pago text default 'CONTADO',
  p_alicuota_iva   numeric default 16,
  p_retencion_iva  numeric default 0,
  p_retencion_islr numeric default 0,
  p_total_del_papel numeric default null,
  p_observacion    text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_prov  record;
  v_tasas record;
  v_dias  smallint;
  v_total numeric;
  v_id    bigint;
begin
  perform private.exigir_permiso('COMPRAS', 'ESCRITURA');

  select * into v_prov from public.proveedores where id = p_proveedor_id;

  if v_prov.id is null then
    raise exception 'No existe el proveedor %.', p_proveedor_id using errcode = 'P0002';
  end if;

  if length(trim(coalesce(p_numero_factura, ''))) = 0 then
    raise exception 'La factura necesita su número, que es el que trae impreso.' using errcode = '22023';
  end if;

  if p_fecha_emision > current_date then
    raise exception 'No se registra una factura con fecha futura.' using errcode = '22023';
  end if;

  v_total := round(coalesce(p_exento, 0) + coalesce(p_base_imponible, 0) + coalesce(p_iva, 0), 2);

  if v_total <= 0 then
    raise exception 'La factura suma cero. Revisa el exento, la base imponible y el IVA.'
      using errcode = '22023';
  end if;

  -- Si quien registra tecleó también el total del papel, tiene que coincidir.
  -- Cuando no coincide, o el papel está mal o el tecleo está mal, y las dos
  -- cosas se ven mejor ahora que en la declaración.
  if p_total_del_papel is not null and abs(p_total_del_papel - v_total) > 0.01 then
    raise exception 'El papel dice % y lo tecleado suma %. Revisa el exento (%), la base (%) y el IVA (%).',
      round(p_total_del_papel, 2), v_total, coalesce(p_exento, 0),
      coalesce(p_base_imponible, 0), coalesce(p_iva, 0) using errcode = '22023';
  end if;

  if coalesce(p_retencion_iva, 0) > coalesce(p_iva, 0) then
    raise exception 'No se puede retener más IVA (%) del que trae la factura (%).',
      p_retencion_iva, p_iva using errcode = '22023';
  end if;

  v_dias := case coalesce(p_condicion_pago, 'CONTADO')
              when 'CREDITO_15' then 15
              when 'CREDITO_30' then 30
              when 'CREDITO_60' then 60
              else 0
            end;

  select * into v_tasas from private.tasas_del_dia(p_moneda, p_fecha_emision);

  insert into public.facturas_compra
    (proveedor_id, orden_id, numero_factura, numero_control, fecha_emision, fecha_recepcion,
     condicion_pago, dias_credito, vence_el, moneda, tasa, tasa_usd,
     exento, base_imponible, alicuota_iva, iva, retencion_iva, retencion_islr, total,
     observacion, registrada_por)
  values
    (p_proveedor_id, p_orden_id, trim(p_numero_factura),
     nullif(trim(coalesce(p_numero_control, '')), ''), p_fecha_emision, current_date,
     coalesce(p_condicion_pago, 'CONTADO'), v_dias, p_fecha_emision + v_dias,
     p_moneda, v_tasas.tasa, v_tasas.tasa_usd,
     coalesce(p_exento, 0), coalesce(p_base_imponible, 0), coalesce(p_alicuota_iva, 16),
     coalesce(p_iva, 0), coalesce(p_retencion_iva, 0), coalesce(p_retencion_islr, 0), v_total,
     nullif(trim(coalesce(p_observacion, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;

exception
  when unique_violation then
    raise exception 'La factura % de "%" ya está registrada. Registrarla dos veces descuenta dos veces el mismo crédito fiscal.',
      trim(p_numero_factura), v_prov.nombre using errcode = '23505';
end;
$$;

create or replace function public.anular_factura_compra(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fac   record;
  v_pagos integer;
begin
  perform private.exigir_permiso('COMPRAS', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula la factura.' using errcode = '22023';
  end if;

  select * into v_fac from public.facturas_compra where id = p_id for update;

  if v_fac.id is null then
    raise exception 'No existe la factura %.', p_id using errcode = 'P0002';
  end if;

  if v_fac.estado = 'ANULADA' then
    raise exception 'La factura % ya estaba anulada.', v_fac.numero_factura using errcode = '55000';
  end if;

  select count(*) into v_pagos
  from public.pagos_compra where factura_id = p_id and estado = 'REGISTRADO';

  if v_pagos > 0 then
    raise exception 'La factura % tiene % pago(s) registrados. Anúlalos primero: el dinero salió y tiene que volver al libro con su propio asiento.',
      v_fac.numero_factura, v_pagos using errcode = '55000';
  end if;

  update public.facturas_compra
     set estado = 'ANULADA',
         motivo_anulacion = trim(p_motivo),
         anulada_por = (select auth.uid()),
         anulada_en = now()
   where id = p_id;
end;
$$;

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
volatile
security definer
set search_path = ''
as $$
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

  v_igtf := coalesce(p_igtf, v_cuenta.moneda <> 'VES');

  select * into v_prov from public.proveedores where id = v_fac.proveedor_id;

  insert into public.pagos_compra
    (numero, factura_id, cuenta_id, fecha, metodo, moneda, tasa, tasa_usd,
     monto, igtf_aplica, referencia, nota, registrado_por)
  values
    (private.siguiente_numero('PGC'), p_factura_id, p_cuenta_id, v_fecha,
     coalesce(p_metodo, 'TRANSFERENCIA'), v_cuenta.moneda, v_tasas.tasa, v_tasas.tasa_usd,
     p_monto, v_igtf, nullif(trim(coalesce(p_referencia, '')), ''),
     nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  select igtf_monto into v_igtf_monto from public.pagos_compra where id = v_id;

  v_mov := private.registrar_movimiento_tesoreria(
    p_cuenta_id, 'PAGO', -1, p_monto,
    format('PAGO DE LA FACTURA %s', v_fac.numero_factura),
    v_fecha, p_referencia, v_prov.nombre, null, v_fac.orden_id, null, p_nota);

  -- El IGTF de un pago en divisas lo paga quien paga, y no es del proveedor:
  -- va en su propio asiento o parecería que al proveedor se le dio de más.
  if v_igtf and v_igtf_monto > 0 then
    v_mov_igtf := private.registrar_movimiento_tesoreria(
      p_cuenta_id, 'IGTF', -1, v_igtf_monto,
      format('IGTF DEL PAGO DE LA FACTURA %s', v_fac.numero_factura),
      v_fecha, p_referencia, v_prov.nombre, null, null, v_mov, null);
  end if;

  update public.pagos_compra
     set movimiento_id = v_mov, movimiento_igtf_id = v_mov_igtf
   where id = v_id;

  if (select saldo_usd from public.v_facturas_compra where id = p_factura_id) <= 0.01 then
    update public.facturas_compra set estado = 'PAGADA' where id = p_factura_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.anular_pago_compra(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pago       record;
  v_fac        record;
  v_factura_id bigint;
begin
  perform private.exigir_permiso('COMPRAS', 'TOTAL');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se anula el pago.' using errcode = '22023';
  end if;

  select factura_id into v_factura_id from public.pagos_compra where id = p_id;

  if v_factura_id is null then
    raise exception 'No existe el pago %.', p_id using errcode = 'P0002';
  end if;

  perform 1 from public.facturas_compra where id = v_factura_id for update;

  select * into v_pago from public.pagos_compra where id = p_id for update;

  if v_pago.estado = 'ANULADO' then
    raise exception 'El pago % ya estaba anulado.', v_pago.numero using errcode = '55000';
  end if;

  select * into v_fac from public.facturas_compra where id = v_factura_id;

  perform private.registrar_movimiento_tesoreria(
    v_pago.cuenta_id, 'REVERSO', 1, v_pago.monto,
    format('ANULACIÓN DEL PAGO %s DE LA FACTURA %s: %s',
           v_pago.numero, v_fac.numero_factura, trim(p_motivo)),
    current_date, v_pago.referencia, null, null, null, v_pago.movimiento_id, null);

  if v_pago.igtf_monto > 0 then
    perform private.registrar_movimiento_tesoreria(
      v_pago.cuenta_id, 'REVERSO', 1, v_pago.igtf_monto,
      format('ANULACIÓN DEL IGTF DEL PAGO %s', v_pago.numero),
      current_date, v_pago.referencia, null, null, null, v_pago.movimiento_igtf_id, null);
  end if;

  update public.pagos_compra
     set estado = 'ANULADO',
         motivo_anulacion = trim(p_motivo),
         anulado_por = (select auth.uid()),
         anulado_en = now()
   where id = p_id;

  update public.facturas_compra set estado = 'REGISTRADA'
   where id = v_factura_id and estado = 'PAGADA';
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array['facturas_compra', 'pagos_compra'] loop
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
  v_fn text;
begin
  foreach v_fn in array array[
    'public.registrar_factura_compra(bigint, text, date, numeric, numeric, numeric, char, text, bigint, text, numeric, numeric, numeric, numeric, text)',
    'public.anular_factura_compra(bigint, text)',
    'public.registrar_pago_compra(bigint, bigint, numeric, text, date, text, boolean, text)',
    'public.anular_pago_compra(bigint, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant   execute on function %s to authenticated', v_fn);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Los datos, en mayúscula y sin tildes
-- ---------------------------------------------------------------------------
do $$
declare
  v_tabla text;
  v_cols  text;
  v_col   text;
  v_mapa  text[][] := array[
    ['facturas_compra', 'numero_factura, numero_control, observacion, motivo_anulacion'],
    ['pagos_compra',    'referencia, nota, motivo_anulacion']
  ];
begin
  for i in 1 .. array_length(v_mapa, 1) loop
    v_tabla := v_mapa[i][1];
    v_cols  := (select string_agg(format('%L', trim(c)), ', ')
                  from unnest(string_to_array(v_mapa[i][2], ',')) c);

    execute format('drop trigger if exists trg_normalizar on public.%I', v_tabla);
    execute format(
      'create trigger trg_normalizar before insert or update on public.%I
         for each row execute function private.normalizar_texto(%s)',
      v_tabla, v_cols);

    foreach v_col in array string_to_array(replace(v_mapa[i][2], ' ', ''), ',') loop
      execute format(
        'update public.%I set %I = private.en_mayuscula(%I)
          where %I is not null and %I is distinct from private.en_mayuscula(%I)',
        v_tabla, v_col, v_col, v_col, v_col, v_col);
    end loop;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Auditoría y tiempo real
-- ---------------------------------------------------------------------------
do $$
declare
  v_t record;
begin
  for v_t in
    select c.relname as tabla,
           coalesce(
             (select string_agg(format('%L', a.attname), ', ' order by k.ord)
                from pg_index i
                cross join lateral unnest(i.indkey) with ordinality as k(att, ord)
                join pg_attribute a on a.attrelid = c.oid and a.attnum = k.att
               where i.indrelid = c.oid and i.indisprimary),
             '') as clave
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and c.relname in ('facturas_compra', 'pagos_compra')
  loop
    execute format('drop trigger if exists trg_auditar on public.%I', v_t.tabla);
    execute format(
      'create trigger trg_auditar after insert or update or delete on public.%I
         for each row execute function private.auditar(%s)',
      v_t.tabla, v_t.clave);
  end loop;
end
$$;

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array['facturas_compra', 'pagos_compra'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_tabla
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_tabla);
    end if;
  end loop;
end
$$;
