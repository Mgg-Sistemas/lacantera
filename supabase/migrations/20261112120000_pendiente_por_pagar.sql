-- ============================================================================
-- GASTOS › PENDIENTE POR PAGAR (12/11/2026)
--
-- Pedido: un submódulo de Gastos para llevar las cuentas por pagar —facturas
-- o gastos de servicios— que hoy viven en una hoja de Excel («CUENTAS
-- PENDIENTES POR PAGAR»: ítem, factura/concepto, descripción, monto Bs,
-- monto $ y total). Según se ingrese en Bs o en $, se ve el otro a la tasa
-- del día, en paralelo. Lo controlan dos personas; los demás administradores
-- solo miran.
--
-- QUIÉN CONTROLA: UNA LISTA POR PERSONA, PROPIA DE ESTE MÓDULO.
--   Las dos personas son ADMIN, como otras seis, y el ADMIN pasa por encima de
--   todo permiso por rol: con la matriz no se puede decir «estos dos sí, los
--   demás ADMIN no». Tampoco se reusa `usuarios_autorizados` (aprobar OC,
--   salidas, despachos): su CHECK exige aprobar_oc o aprobar_salidas y
--   cambiarlo tocaría tres piezas compartidas para algo que no es aprobar.
--   Aquí la función NO deja pasar al ADMIN por serlo: es la idea del pedido.
--
-- EL MONTO ESCRITO NO CAMBIA NUNCA. El equivalente en la otra moneda lo pone
--   la pantalla con la tasa BCV vigente (`obtener_tasa`), y dice de qué día es.
--   Cada ABONO sí congela su tasa: la BCV de la fecha del abono, puesta por el
--   servidor, nunca la que mande el cliente. El saldo vive siempre en la
--   moneda de la deuda.
--
-- ES BITÁCORA, NO CONTABILIDAD: no mueve ninguna cuenta de Tesorería, igual
--   que Gastos. Nada se borra: la deuda o el abono equivocado se anula con
--   motivo y queda a la vista.
--
-- Lo que viene de una orden de compra NO va aquí: se paga en Compras › Pagos
--   por hacer (`v_cuentas_por_pagar`, otra cosa aunque el nombre se parezca).
-- ============================================================================

-- ─────────────────────────────── quién controla ─────────────────────────────

create table if not exists public.gastos_por_pagar_controladores (
  usuario_id   uuid primary key references public.perfiles(id),
  activo       boolean not null default true,
  asignado_por uuid,
  asignado_en  timestamptz not null default now()
);

alter table public.gastos_por_pagar_controladores enable row level security;
create policy gastos_por_pagar_controladores_lectura on public.gastos_por_pagar_controladores
  for select to authenticated
  using (private.tiene_permiso('GASTOS', 'LECTURA') or usuario_id = (select auth.uid()));

create trigger trg_auditar
  after insert or update or delete on public.gastos_por_pagar_controladores
  for each row execute function private.auditar('usuario_id');

-- Las dos personas que nombró gerencia el 12/11/2026. Se siembran por su id
-- (el repositorio es público: aquí no van nombres). Desde aquí, un ADMIN
-- cambia la lista con `guardar_controlador_por_pagar`, y queda quién lo hizo.
insert into public.gastos_por_pagar_controladores (usuario_id)
select id from public.perfiles
 where id in ('2259cd4e-08ec-4f56-83fa-18db6ae0b70b', '81fe81bb-5572-4b36-95b5-b4007a798c8b')
on conflict (usuario_id) do nothing;

create or replace function private.controla_por_pagar()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.gastos_por_pagar_controladores c
      join public.perfiles p on p.id = c.usuario_id
     where c.usuario_id = (select auth.uid())
       and c.activo
       and p.activo
  );
$$;

create or replace function private.exigir_control_por_pagar()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.controla_por_pagar() then
    raise exception 'Las cuentas por pagar solo las registran y modifican quienes las llevan. Usted puede verlas, no cambiarlas.'
      using errcode = '42501';
  end if;
end;
$$;

-- Para la pantalla: ¿muestro los botones?
create or replace function public.controlo_cuentas_por_pagar()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.controla_por_pagar();
$$;

-- ─────────────────────────────── la deuda ───────────────────────────────────

create table if not exists public.gastos_por_pagar (
  id               bigint generated always as identity primary key,
  numero           text not null,
  fecha            date not null,
  -- «Factura / concepto» de la hoja: a quién se le debe o qué es.
  proveedor        text not null,
  numero_factura   text,
  -- «Aún no entregan factura».
  sin_factura      boolean not null default false,
  descripcion      text not null,
  moneda           text not null check (moneda in ('VES', 'USD')),
  monto            numeric(14,2) not null check (monto > 0),
  vence            date,
  observacion      text,
  registrado_por   uuid not null,
  registrado_en    timestamptz not null default now(),
  actualizado_por  uuid,
  actualizado_en   timestamptz,
  anulada_en       timestamptz,
  anulada_por      uuid,
  motivo_anulacion text,
  constraint gastos_por_pagar_proveedor_no_vacio check (btrim(proveedor) <> ''),
  constraint gastos_por_pagar_descripcion_no_vacia check (btrim(descripcion) <> '')
);

create unique index if not exists gastos_por_pagar_numero_unico on public.gastos_por_pagar (numero);
create index if not exists gastos_por_pagar_fecha on public.gastos_por_pagar (fecha);

alter table public.gastos_por_pagar enable row level security;
create policy gastos_por_pagar_lectura on public.gastos_por_pagar
  for select to authenticated
  using (private.tiene_permiso('GASTOS', 'LECTURA') or private.controla_por_pagar());

create trigger trg_auditar
  after insert or update or delete on public.gastos_por_pagar
  for each row execute function private.auditar('id');

create trigger trg_normalizar
  before insert or update on public.gastos_por_pagar
  for each row execute function private.normalizar_texto(
    'proveedor', 'numero_factura', 'descripcion', 'observacion', 'motivo_anulacion');

-- ─────────────────────────────── los abonos ─────────────────────────────────

create table if not exists public.gastos_por_pagar_abonos (
  id                     bigint generated always as identity primary key,
  cuenta_id              bigint not null references public.gastos_por_pagar(id),
  fecha                  date not null,
  moneda                 text not null check (moneda in ('VES', 'USD')),
  monto                  numeric(14,2) not null check (monto > 0),
  -- Bs por dólar, BCV, de la fecha del abono. La pone el servidor.
  tasa                   numeric(18,6),
  -- Lo que descuenta del saldo, en la moneda de la deuda.
  monto_en_moneda_cuenta numeric(14,2) not null check (monto_en_moneda_cuenta > 0),
  referencia             text,
  nota                   text,
  registrado_por         uuid not null,
  registrado_en          timestamptz not null default now(),
  anulado_en             timestamptz,
  anulado_por            uuid,
  motivo_anulacion       text
);

create index if not exists gastos_por_pagar_abonos_cuenta on public.gastos_por_pagar_abonos (cuenta_id);

alter table public.gastos_por_pagar_abonos enable row level security;
create policy gastos_por_pagar_abonos_lectura on public.gastos_por_pagar_abonos
  for select to authenticated
  using (private.tiene_permiso('GASTOS', 'LECTURA') or private.controla_por_pagar());

create trigger trg_auditar
  after insert or update or delete on public.gastos_por_pagar_abonos
  for each row execute function private.auditar('id');

create trigger trg_normalizar
  before insert or update on public.gastos_por_pagar_abonos
  for each row execute function private.normalizar_texto('referencia', 'nota', 'motivo_anulacion');

-- ─────────────────────────────── lo que se enseña ───────────────────────────
--
-- El estado no se guarda: sale de los abonos vigentes. ANULADA manda sobre
-- todo; PAGADA es saldo de un céntimo o menos (los abonos en la otra moneda
-- redondean).

create or replace view public.v_gastos_por_pagar
  with (security_invoker = on) as
with abonado as (
  select a.cuenta_id,
         sum(a.monto_en_moneda_cuenta) as abonado,
         count(*)                      as abonos,
         max(a.fecha)                  as ultimo_abono
    from public.gastos_por_pagar_abonos a
   where a.anulado_en is null
   group by a.cuenta_id
)
select c.*,
       coalesce(ab.abonado, 0)                         as abonado,
       greatest(c.monto - coalesce(ab.abonado, 0), 0)  as saldo,
       coalesce(ab.abonos, 0)::int                     as abonos,
       ab.ultimo_abono,
       case
         when c.anulada_en is not null                   then 'ANULADA'
         when c.monto - coalesce(ab.abonado, 0) <= 0.01  then 'PAGADA'
         when coalesce(ab.abonado, 0) > 0                then 'ABONADA'
         else 'PENDIENTE'
       end                                             as estado,
       p.nombre as registrado_por_nombre,
       u.nombre as actualizado_por_nombre,
       x.nombre as anulada_por_nombre
  from public.gastos_por_pagar c
  left join abonado ab on ab.cuenta_id = c.id
  left join public.perfiles p on p.id = c.registrado_por
  left join public.perfiles u on u.id = c.actualizado_por
  left join public.perfiles x on x.id = c.anulada_por;

create or replace view public.v_gastos_por_pagar_abonos
  with (security_invoker = on) as
select a.*,
       c.numero as cuenta_numero,
       c.moneda as cuenta_moneda,
       p.nombre as registrado_por_nombre,
       x.nombre as anulado_por_nombre
  from public.gastos_por_pagar_abonos a
  join public.gastos_por_pagar c on c.id = a.cuenta_id
  left join public.perfiles p on p.id = a.registrado_por
  left join public.perfiles x on x.id = a.anulado_por;

create or replace view public.v_gastos_por_pagar_controladores
  with (security_invoker = on) as
select c.usuario_id, c.activo, c.asignado_en,
       p.nombre, p.usuario, p.activo as usuario_activo,
       a.nombre as asignado_por_nombre
  from public.gastos_por_pagar_controladores c
  join public.perfiles p on p.id = c.usuario_id
  left join public.perfiles a on a.id = c.asignado_por;

-- ─────────────────────────────── validar lo que se escribe ─────────────────

create or replace function private.validar_cuenta_por_pagar(
  p_fecha date, p_proveedor text, p_descripcion text, p_moneda text, p_monto numeric, p_vence date
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_fecha is null then
    raise exception 'Falta la fecha.' using errcode = '22023';
  end if;
  if p_fecha > private.hoy_aqui() then
    raise exception 'La fecha no puede ser de mañana en adelante.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_proveedor, ''))) < 2 then
    raise exception 'Falta a quién se le debe (proveedor o concepto).' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_descripcion, ''))) < 3 then
    raise exception 'Falta la descripción: qué se debe.' using errcode = '22023';
  end if;
  if coalesce(p_moneda, '') not in ('VES', 'USD') then
    raise exception 'La moneda tiene que ser bolívares o dólares.' using errcode = '22023';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = '22023';
  end if;
  if p_vence is not null and p_vence < p_fecha then
    raise exception 'El vencimiento no puede ser antes de la fecha de la deuda.' using errcode = '22023';
  end if;
end;
$$;

-- ─────────────────────────────── registrar ──────────────────────────────────

create or replace function public.registrar_cuenta_por_pagar(
  p_fecha          date,
  p_proveedor      text,
  p_descripcion    text,
  p_moneda         text,
  p_monto          numeric,
  p_sin_factura    boolean default false,
  p_numero_factura text default null,
  p_vence          date default null,
  p_observacion    text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_numero text;
begin
  perform private.exigir_control_por_pagar();
  perform private.validar_cuenta_por_pagar(p_fecha, p_proveedor, p_descripcion, p_moneda, p_monto, p_vence);

  v_numero := private.siguiente_numero('CXP');

  insert into public.gastos_por_pagar
    (numero, fecha, proveedor, numero_factura, sin_factura, descripcion,
     moneda, monto, vence, observacion, registrado_por)
  values
    (v_numero, p_fecha, btrim(p_proveedor),
     case when coalesce(p_sin_factura, false) then null else nullif(btrim(coalesce(p_numero_factura, '')), '') end,
     coalesce(p_sin_factura, false), btrim(p_descripcion),
     p_moneda, round(p_monto, 2), p_vence, nullif(btrim(coalesce(p_observacion, '')), ''),
     (select auth.uid()));

  return v_numero;
end;
$$;

-- ─────────────────────────────── corregir ───────────────────────────────────
--
-- Mientras no tenga abonos vigentes se corrige (un error de tecleo en una
-- deuda que aún no se ha tocado). Con abonos, cambiar el monto o la moneda
-- descuadraría lo ya pagado: se anulan antes los abonos.

create or replace function public.editar_cuenta_por_pagar(
  p_id             bigint,
  p_fecha          date,
  p_proveedor      text,
  p_descripcion    text,
  p_moneda         text,
  p_monto          numeric,
  p_sin_factura    boolean default false,
  p_numero_factura text default null,
  p_vence          date default null,
  p_observacion    text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_actual public.gastos_por_pagar;
begin
  perform private.exigir_control_por_pagar();
  perform private.validar_cuenta_por_pagar(p_fecha, p_proveedor, p_descripcion, p_moneda, p_monto, p_vence);

  select * into v_actual from public.gastos_por_pagar where id = p_id for update;
  if v_actual.id is null then
    raise exception 'No existe esa cuenta por pagar.' using errcode = 'P0002';
  end if;
  if v_actual.anulada_en is not null then
    raise exception 'Esa cuenta está anulada: no se corrige.' using errcode = '55000';
  end if;
  if exists (select 1 from public.gastos_por_pagar_abonos where cuenta_id = p_id and anulado_en is null) then
    raise exception 'Esa cuenta ya tiene abonos: no se corrige.'
      using errcode = '55000',
            hint = 'Anule primero los abonos, o anule la cuenta y regístrela de nuevo.';
  end if;

  update public.gastos_por_pagar
     set fecha = p_fecha,
         proveedor = btrim(p_proveedor),
         numero_factura = case when coalesce(p_sin_factura, false) then null
                               else nullif(btrim(coalesce(p_numero_factura, '')), '') end,
         sin_factura = coalesce(p_sin_factura, false),
         descripcion = btrim(p_descripcion),
         moneda = p_moneda,
         monto = round(p_monto, 2),
         vence = p_vence,
         observacion = nullif(btrim(coalesce(p_observacion, '')), ''),
         actualizado_por = (select auth.uid()),
         actualizado_en = now()
   where id = p_id;
end;
$$;

-- ─────────────────────────────── anular la deuda ────────────────────────────

create or replace function public.anular_cuenta_por_pagar(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_actual public.gastos_por_pagar;
begin
  perform private.exigir_control_por_pagar();

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Diga por qué se anula.' using errcode = '22023';
  end if;

  select * into v_actual from public.gastos_por_pagar where id = p_id for update;
  if v_actual.id is null then
    raise exception 'No existe esa cuenta por pagar.' using errcode = 'P0002';
  end if;
  if v_actual.anulada_en is not null then
    raise exception 'Ya estaba anulada.' using errcode = '55000';
  end if;
  if exists (select 1 from public.gastos_por_pagar_abonos where cuenta_id = p_id and anulado_en is null) then
    raise exception 'Esa cuenta tiene abonos vigentes: anúlelos primero.'
      using errcode = '55000',
            hint = 'Un pago hecho no desaparece por anular la deuda.';
  end if;

  update public.gastos_por_pagar
     set anulada_en = now(),
         anulada_por = (select auth.uid()),
         motivo_anulacion = btrim(p_motivo)
   where id = p_id;
end;
$$;

-- ─────────────────────────────── abonar ─────────────────────────────────────
--
-- Un pago total es un abono por el saldo. Si se abona en la otra moneda, el
-- servidor convierte con la tasa BCV de la fecha del abono y la deja fija.
-- No se paga de más: lo que pase del saldo (con un céntimo de holgura por el
-- redondeo) se rechaza diciendo cuánto queda.

create or replace function public.abonar_cuenta_por_pagar(
  p_cuenta_id  bigint,
  p_fecha      date,
  p_moneda     text,
  p_monto      numeric,
  p_referencia text default null,
  p_nota       text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cuenta public.gastos_por_pagar;
  v_saldo  numeric;
  v_tasa   numeric;
  v_en_cta numeric;
  v_id     bigint;
begin
  perform private.exigir_control_por_pagar();

  select * into v_cuenta from public.gastos_por_pagar where id = p_cuenta_id for update;
  if v_cuenta.id is null then
    raise exception 'No existe esa cuenta por pagar.' using errcode = 'P0002';
  end if;
  if v_cuenta.anulada_en is not null then
    raise exception 'Esa cuenta está anulada: no se le abona.' using errcode = '55000';
  end if;
  if p_fecha is null then
    raise exception 'Falta la fecha del abono.' using errcode = '22023';
  end if;
  if p_fecha > private.hoy_aqui() then
    raise exception 'El abono no puede ser de mañana en adelante.' using errcode = '22023';
  end if;
  if coalesce(p_moneda, '') not in ('VES', 'USD') then
    raise exception 'El abono tiene que ser en bolívares o en dólares.' using errcode = '22023';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El abono tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  select t.tasa into v_tasa from public.obtener_tasa('USD', 'VES', p_fecha, 'BCV') t;

  if p_moneda = v_cuenta.moneda then
    v_en_cta := round(p_monto, 2);
  else
    if v_tasa is null or v_tasa <= 0 then
      raise exception 'No hay tasa BCV para el % con que convertir el abono.', to_char(p_fecha, 'DD/MM/YYYY')
        using errcode = '22023',
              hint = 'Registre la tasa de ese día en Tasas de cambio, o abone en la moneda de la deuda.';
    end if;
    v_en_cta := case when v_cuenta.moneda = 'USD' then round(p_monto / v_tasa, 2)
                     else round(p_monto * v_tasa, 2) end;
    if v_en_cta <= 0 then
      raise exception 'El abono es demasiado pequeño para convertirlo.' using errcode = '22023';
    end if;
  end if;

  select v_cuenta.monto - coalesce(sum(a.monto_en_moneda_cuenta), 0) into v_saldo
    from public.gastos_por_pagar_abonos a
   where a.cuenta_id = p_cuenta_id and a.anulado_en is null;

  if v_saldo <= 0.01 then
    raise exception 'Esa cuenta ya está pagada.' using errcode = '55000';
  end if;
  if v_en_cta > v_saldo + 0.01 then
    raise exception 'El abono pasa de lo que se debe: el saldo es % %.',
      -- Con punto de miles y coma decimal, como se escribe aquí.
      translate(to_char(v_saldo, 'FM999,999,999,990.00'), ',.', '.,'),
      case when v_cuenta.moneda = 'USD' then '$' else 'Bs' end
      using errcode = '22023';
  end if;
  -- El último céntimo del redondeo no deja una deuda viva de 0,01.
  if v_en_cta > v_saldo then
    v_en_cta := v_saldo;
  end if;

  insert into public.gastos_por_pagar_abonos
    (cuenta_id, fecha, moneda, monto, tasa, monto_en_moneda_cuenta, referencia, nota, registrado_por)
  values
    (p_cuenta_id, p_fecha, p_moneda, round(p_monto, 2), v_tasa, v_en_cta,
     nullif(btrim(coalesce(p_referencia, '')), ''), nullif(btrim(coalesce(p_nota, '')), ''),
     (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.anular_abono_por_pagar(p_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_actual public.gastos_por_pagar_abonos;
begin
  perform private.exigir_control_por_pagar();

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Diga por qué se anula el abono.' using errcode = '22023';
  end if;

  select * into v_actual from public.gastos_por_pagar_abonos where id = p_id for update;
  if v_actual.id is null then
    raise exception 'No existe ese abono.' using errcode = 'P0002';
  end if;
  if v_actual.anulado_en is not null then
    raise exception 'Ese abono ya estaba anulado.' using errcode = '55000';
  end if;

  update public.gastos_por_pagar_abonos
     set anulado_en = now(),
         anulado_por = (select auth.uid()),
         motivo_anulacion = btrim(p_motivo)
   where id = p_id;
end;
$$;

-- ─────────────────────────────── la lista de quién controla ────────────────
--
-- La cambia un ADMIN (no hay forma de impedir que un ADMIN se agregue a sí
-- mismo; queda dicho quién lo hizo y la auditoría lo registra). No se borra:
-- quien deja de llevarlas queda apagado.

create or replace function public.guardar_controlador_por_pagar(p_usuario uuid, p_activo boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.tiene_rol('ADMIN') then
    raise exception 'Solo un administrador cambia quién lleva las cuentas por pagar.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.perfiles where id = p_usuario and activo) then
    raise exception 'Ese usuario no existe o está inactivo.' using errcode = '22023';
  end if;

  insert into public.gastos_por_pagar_controladores (usuario_id, activo, asignado_por, asignado_en)
  values (p_usuario, coalesce(p_activo, true), (select auth.uid()), now())
  on conflict (usuario_id) do update
    set activo = excluded.activo,
        asignado_por = excluded.asignado_por,
        asignado_en = excluded.asignado_en;
end;
$$;

-- ─────────────────────────────── permisos de ejecución ──────────────────────

revoke all on function private.controla_por_pagar() from public, anon;
revoke all on function private.exigir_control_por_pagar() from public, anon;
revoke all on function private.validar_cuenta_por_pagar(date, text, text, text, numeric, date) from public, anon;
revoke all on function public.controlo_cuentas_por_pagar() from public, anon;
revoke all on function public.registrar_cuenta_por_pagar(date, text, text, text, numeric, boolean, text, date, text) from public, anon;
revoke all on function public.editar_cuenta_por_pagar(bigint, date, text, text, text, numeric, boolean, text, date, text) from public, anon;
revoke all on function public.anular_cuenta_por_pagar(bigint, text) from public, anon;
revoke all on function public.abonar_cuenta_por_pagar(bigint, date, text, numeric, text, text) from public, anon;
revoke all on function public.anular_abono_por_pagar(bigint, text) from public, anon;
revoke all on function public.guardar_controlador_por_pagar(uuid, boolean) from public, anon;

grant execute on function private.controla_por_pagar() to authenticated;
grant execute on function public.controlo_cuentas_por_pagar() to authenticated;
grant execute on function public.registrar_cuenta_por_pagar(date, text, text, text, numeric, boolean, text, date, text) to authenticated;
grant execute on function public.editar_cuenta_por_pagar(bigint, date, text, text, text, numeric, boolean, text, date, text) to authenticated;
grant execute on function public.anular_cuenta_por_pagar(bigint, text) to authenticated;
grant execute on function public.abonar_cuenta_por_pagar(bigint, date, text, numeric, text, text) to authenticated;
grant execute on function public.anular_abono_por_pagar(bigint, text) to authenticated;
grant execute on function public.guardar_controlador_por_pagar(uuid, boolean) to authenticated;

-- Las tablas solo se leen: se escribe por las funciones de arriba.
revoke insert, update, delete, truncate on public.gastos_por_pagar from anon, authenticated;
revoke insert, update, delete, truncate on public.gastos_por_pagar_abonos from anon, authenticated;
revoke insert, update, delete, truncate on public.gastos_por_pagar_controladores from anon, authenticated;

-- ─────────────────────────────────── comprobación ───────────────────────────
-- Debe devolver: controladores = 2, rls = 3, vistas = 3.

select
  (select count(*) from public.gastos_por_pagar_controladores where activo)                as controladores,
  (select count(*) from pg_class where relname in ('gastos_por_pagar', 'gastos_por_pagar_abonos',
     'gastos_por_pagar_controladores') and relrowsecurity)                                  as rls,
  (select count(*) from pg_views where schemaname = 'public' and viewname in ('v_gastos_por_pagar',
     'v_gastos_por_pagar_abonos', 'v_gastos_por_pagar_controladores'))                     as vistas;
