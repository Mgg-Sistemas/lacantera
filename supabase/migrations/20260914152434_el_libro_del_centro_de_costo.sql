/*
  EL LIBRO DEL CENTRO DE COSTO.

  Una fila por hecho, con su moneda, su monto y la tasa del día del hecho,
  como `tesoreria_movimientos`. El costo y los metros cúbicos van en columnas
  distintas: así el costo por m³ puede cambiar de base —mina, planta,
  despacho— sin migrar nada. Es la lección de Golden Touch, que tiene cuatro
  cálculos de tasa que no coinciden porque el denominador quedó pegado a la
  fórmula.

  Las filas que vienen de otro módulo llevan `origen` y `origen_id` y son de
  solo lectura desde aquí: se corrigen en su módulo y el cambio entra como
  REVERSO. ENTREGA suma al fondo, ABONO resta del fondo, el resto es costo.
  Ninguna fila mueve el fondo y el costo a la vez.

  Segunda pieza de siete. La primera abrió la caja; esta pone el libro, el
  fondo con su origen, los gastos fijos y el gasto suelto. Lo que viene de
  viajes y de la planta entra en la tercera.
*/

-- ---------------------------------------------------------------------------
-- 1. De dónde viene el dinero
--
-- «Venta propia» no se siembra: Ventas no tiene cobros todavía, y el día que
-- los tenga se decide con datos delante si el cobro se enlaza o se teclea.
-- ---------------------------------------------------------------------------
create table if not exists public.costo_origenes_fondo (
  codigo       text primary key,
  nombre       text not null,
  genera_deuda boolean not null default true,
  activo       boolean not null default true,
  orden        smallint not null default 100
);

comment on table public.costo_origenes_fondo is
  'Quien entrega dinero para operar. genera_deuda: lo entregado se debe y se '
  'ensena como deuda por origen, que es seguimiento interno y no la cuenta por '
  'pagar oficial.';

insert into public.costo_origenes_fondo (codigo, nombre, genera_deuda, orden) values
  ('CASA_MATRIZ', 'Casa matriz', true, 10),
  ('SOCIO',       'Socio',       true, 20)
on conflict (codigo) do nothing;

alter table public.costo_origenes_fondo enable row level security;

drop policy if exists costo_origenes_fondo_lectura on public.costo_origenes_fondo;
create policy costo_origenes_fondo_lectura on public.costo_origenes_fondo
  for select to authenticated
  using (private.tiene_permiso('COSTOS', 'LECTURA'));

revoke all on public.costo_origenes_fondo from anon, authenticated;
grant select on public.costo_origenes_fondo to authenticated;

drop trigger if exists trg_auditar on public.costo_origenes_fondo;
create trigger trg_auditar after insert or update or delete on public.costo_origenes_fondo
  for each row execute function private.auditar('codigo');

drop trigger if exists trg_normalizar on public.costo_origenes_fondo;
create trigger trg_normalizar before insert or update on public.costo_origenes_fondo
  for each row execute function private.normalizar_texto('nombre');

-- ---------------------------------------------------------------------------
-- 2. Lo que se repite cada caja y ningún módulo registra
--
-- Explosivos, energía, alquiler de máquinas, administración. Sin esto el
-- costo por m³ sería el flete disfrazado de costo. Cada uno activo aparece por
-- aceptar al abrir una caja, y se acepta tal cual, con otro monto, o se
-- rechaza.
-- ---------------------------------------------------------------------------
create table if not exists public.costo_gastos_fijos (
  id        bigint generated always as identity primary key,
  nombre    text not null,
  categoria text references public.categorias_gasto(codigo),
  moneda    char(3) not null default 'USD',
  monto     numeric(16,2) not null check (monto > 0),
  activo    boolean not null default true,
  nota      text
);

comment on table public.costo_gastos_fijos is
  'Lo que se repite cada caja y ningun modulo registra: explosivos, energia, '
  'alquiler, administracion. Cada uno activo aparece por aceptar al abrir una '
  'caja.';

alter table public.costo_gastos_fijos enable row level security;

drop policy if exists costo_gastos_fijos_lectura on public.costo_gastos_fijos;
create policy costo_gastos_fijos_lectura on public.costo_gastos_fijos
  for select to authenticated
  using (private.tiene_permiso('COSTOS', 'LECTURA'));

revoke all on public.costo_gastos_fijos from anon, authenticated;
grant select on public.costo_gastos_fijos to authenticated;

drop trigger if exists trg_auditar on public.costo_gastos_fijos;
create trigger trg_auditar after insert or update or delete on public.costo_gastos_fijos
  for each row execute function private.auditar('id');

drop trigger if exists trg_normalizar on public.costo_gastos_fijos;
create trigger trg_normalizar before insert or update on public.costo_gastos_fijos
  for each row execute function private.normalizar_texto('nombre', 'nota');

-- ---------------------------------------------------------------------------
-- 3. El libro
-- ---------------------------------------------------------------------------
create table if not exists public.costo_movimientos (
  id              bigint generated always as identity primary key,
  caja_id         bigint not null references public.costo_cajas(id),
  fecha           date not null,
  descripcion     text not null,
  clase           text not null check (clase in
                    ('ENTREGA', 'ABONO', 'VIAJE', 'COMBUSTIBLE', 'NOMINA', 'COMPRA', 'GASTO', 'FIJO')),

  -- El dinero, como en tesorería: lo tecleado, la tasa de su moneda a
  -- bolívares y la del dólar BCV, las dos del día del hecho. `monto_usd` sale
  -- de ahí y no se puede teclear.
  moneda          char(3) not null,
  monto           numeric(16,2) not null default 0 check (monto >= 0),
  tasa            numeric(20,10) not null check (tasa > 0),
  tasa_usd        numeric(20,10) not null check (tasa_usd > 0),
  tasa_arrastrada boolean not null default false,
  monto_usd       numeric(16,2) generated always as (round(monto * tasa / tasa_usd, 2)) stored,

  -- Los metros cúbicos, aparte del dinero. Nulo cuando no se sabe: nunca cero.
  m3              numeric(12,2) check (m3 is null or m3 > 0),
  producto_id     bigint references public.articulos(id),
  medida          text check (medida is null or medida in ('MINA', 'PLANTA', 'DESPACHO')),

  -- De dónde vino. MANUAL es lo único que se teclea aquí.
  origen          text not null check (origen in
                    ('MANUAL', 'ACARREO', 'SALIDA_PLANTA', 'FIJO', 'NOMINA', 'INVENTARIO', 'TESORERIA')),
  origen_id       bigint,
  sentido         text not null default 'ORIGINAL' check (sentido in ('ORIGINAL', 'REVERSO')),
  reversa_a       bigint references public.costo_movimientos(id),

  categoria       text references public.categorias_gasto(codigo),
  origen_fondo    text references public.costo_origenes_fondo(codigo),
  vehiculo_id     bigint references public.vehiculos(id),

  -- Con fecha de una caja ya cerrada. Se enseña aparte y no mueve el costo
  -- por m³ de la caja en la que cayó.
  llego_tarde     boolean not null default false,

  nota            text,
  registrado_por  uuid references auth.users(id),
  registrado_en   timestamptz not null default now(),

  constraint costo_mov_origen_con_id       check ((origen = 'MANUAL') = (origen_id is null)),
  constraint costo_mov_reverso_apunta      check ((sentido = 'REVERSO') = (reversa_a is not null)),
  constraint costo_mov_fondo_con_origen    check ((clase in ('ENTREGA', 'ABONO')) = (origen_fondo is not null)),
  constraint costo_mov_m3_con_medida       check ((m3 is null) = (medida is null)),
  constraint costo_mov_producto_en_planta  check (producto_id is null or medida in ('PLANTA', 'DESPACHO')),
  constraint costo_mov_algo_que_contar     check (monto > 0 or m3 is not null)
);

-- El mismo viaje no entra dos veces en la misma caja. La caja va en el índice
-- por los gastos fijos, que se repiten cada caja; que un viaje no entre en dos
-- cajas distintas lo garantiza `costo_decisiones`.
create unique index if not exists costo_mov_un_original_por_origen
  on public.costo_movimientos (caja_id, origen, origen_id)
  where sentido = 'ORIGINAL' and origen <> 'MANUAL';

-- Un movimiento se reversa una vez.
create unique index if not exists costo_mov_un_reverso
  on public.costo_movimientos (reversa_a)
  where sentido = 'REVERSO';

create index if not exists costo_mov_caja on public.costo_movimientos (caja_id, fecha);

comment on table public.costo_movimientos is
  'El libro del centro de costo. ENTREGA suma al fondo, ABONO resta del fondo, '
  'el resto es costo. m3 y medida van aparte del dinero para que el costo por '
  'm3 pueda cambiar de base. origen <> MANUAL es solo lectura: se corrige en '
  'su modulo y entra como REVERSO.';

comment on column public.costo_movimientos.tasa_arrastrada is
  'Cierto cuando la tasa BCV usada es de un dia anterior al del hecho, porque '
  'ese dia no se registro. La pantalla lo avisa.';

alter table public.costo_movimientos enable row level security;

drop policy if exists costo_movimientos_lectura on public.costo_movimientos;
create policy costo_movimientos_lectura on public.costo_movimientos
  for select to authenticated
  using (private.tiene_permiso('COSTOS', 'LECTURA'));

revoke all on public.costo_movimientos from anon, authenticated;
grant select on public.costo_movimientos to authenticated;

drop trigger if exists trg_auditar on public.costo_movimientos;
create trigger trg_auditar after insert or update or delete on public.costo_movimientos
  for each row execute function private.auditar('id');

drop trigger if exists trg_normalizar on public.costo_movimientos;
create trigger trg_normalizar before insert or update on public.costo_movimientos
  for each row execute function private.normalizar_texto('descripcion', 'nota');

-- ---------------------------------------------------------------------------
-- 4. Lo decidido
--
-- Es lo que la función de candidatos resta. Un rechazo deshecho no se borra:
-- se marca `deshecha_en`, y queda quién y cuándo.
-- ---------------------------------------------------------------------------
create table if not exists public.costo_decisiones (
  id            bigint generated always as identity primary key,
  caja_id       bigint not null references public.costo_cajas(id),
  origen        text not null check (origen in
                  ('ACARREO', 'SALIDA_PLANTA', 'FIJO', 'NOMINA', 'INVENTARIO', 'TESORERIA')),
  origen_id     bigint not null,
  decision      text not null check (decision in ('ACEPTADA', 'RECHAZADA')),
  movimiento_id bigint references public.costo_movimientos(id),
  motivo        text,
  decidido_por  uuid references auth.users(id),
  decidido_en   timestamptz not null default now(),
  deshecha_por  uuid references auth.users(id),
  deshecha_en   timestamptz,

  constraint costo_dec_aceptada_con_fila  check ((decision = 'ACEPTADA') = (movimiento_id is not null)),
  constraint costo_dec_rechazo_con_motivo check (decision <> 'RECHAZADA' or motivo is not null)
);

create unique index if not exists costo_dec_una_vigente
  on public.costo_decisiones (caja_id, origen, origen_id)
  where deshecha_en is null;

comment on table public.costo_decisiones is
  'Que se acepto y que se rechazo, y quien. Un rechazo deshecho no se borra: '
  'se marca deshecha_en. Es lo que la funcion de candidatos resta.';

alter table public.costo_decisiones enable row level security;

drop policy if exists costo_decisiones_lectura on public.costo_decisiones;
create policy costo_decisiones_lectura on public.costo_decisiones
  for select to authenticated
  using (private.tiene_permiso('COSTOS', 'LECTURA'));

revoke all on public.costo_decisiones from anon, authenticated;
grant select on public.costo_decisiones to authenticated;

drop trigger if exists trg_auditar on public.costo_decisiones;
create trigger trg_auditar after insert or update or delete on public.costo_decisiones
  for each row execute function private.auditar('id');

drop trigger if exists trg_normalizar on public.costo_decisiones;
create trigger trg_normalizar before insert or update on public.costo_decisiones
  for each row execute function private.normalizar_texto('motivo');

do $mapa$
begin
  if to_regclass('public.auditoria_modulos') is null then
    raise notice 'auditoria_modulos todavia no existe en esta base: el mapa de modulo se salta.';
    return;
  end if;

  insert into public.auditoria_modulos (tabla, modulo)
  values ('costo_origenes_fondo', 'COSTOS'), ('costo_gastos_fijos', 'COSTOS'),
         ('costo_movimientos', 'COSTOS'), ('costo_decisiones', 'COSTOS')
  on conflict (tabla) do update set modulo = excluded.modulo;
end
$mapa$;

-- ---------------------------------------------------------------------------
-- 5. La única puerta al libro
--
-- Toma el cerrojo de la caja abierta, valora con la tasa de LA FECHA DEL
-- HECHO —no la del clic— y marca llego_tarde si la fecha es anterior a la
-- caja. Si no hay tasa, `tasas_del_dia` falla: nunca se guarda un nulo que la
-- pantalla pinte como cero.
-- ---------------------------------------------------------------------------
create or replace function private.costo_escribir(
  p_fecha        date,
  p_descripcion  text,
  p_clase        text,
  p_moneda       text,
  p_monto        numeric,
  p_origen       text,
  p_origen_id    bigint default null,
  p_m3           numeric default null,
  p_producto_id  bigint default null,
  p_medida       text default null,
  p_categoria    text default null,
  p_origen_fondo text default null,
  p_vehiculo_id  bigint default null,
  p_nota         text default null,
  p_sentido      text default 'ORIGINAL',
  p_reversa_a    bigint default null
) returns bigint
language plpgsql security definer set search_path to ''
as $$
declare
  v_caja   public.costo_cajas;
  v_tasas  record;
  v_moneda char(3) := upper(btrim(coalesce(p_moneda, 'USD')));
  v_arr    boolean;
  v_id     bigint;
begin
  v_caja := private.costo_caja_abierta(true);

  if p_fecha is null or p_fecha > private.hoy_aqui() then
    raise exception 'La fecha no puede ir en blanco ni ser del futuro.' using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_descripcion, ''))) < 3 then
    raise exception 'Hay que decir que es.' using errcode = '22023';
  end if;

  if coalesce(p_monto, 0) < 0 then
    raise exception 'El monto no puede ser negativo.' using errcode = '22023';
  end if;

  select * into v_tasas from private.tasas_del_dia(v_moneda, p_fecha);
  select t.arrastrada into v_arr from public.obtener_tasa('USD', 'VES', p_fecha, 'BCV') t;

  insert into public.costo_movimientos
    (caja_id, fecha, descripcion, clase, moneda, monto, tasa, tasa_usd, tasa_arrastrada,
     m3, producto_id, medida, origen, origen_id, sentido, reversa_a,
     categoria, origen_fondo, vehiculo_id, llego_tarde, nota, registrado_por)
  values
    (v_caja.id, p_fecha, btrim(p_descripcion), p_clase, v_moneda, coalesce(p_monto, 0),
     v_tasas.tasa, v_tasas.tasa_usd, coalesce(v_arr, false),
     p_m3, p_producto_id, p_medida, p_origen, p_origen_id, p_sentido, p_reversa_a,
     p_categoria, p_origen_fondo, p_vehiculo_id, p_fecha < v_caja.fecha_inicio,
     nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

comment on function private.costo_escribir(date, text, text, text, numeric, text, bigint, numeric, bigint, text, text, text, bigint, text, text, bigint) is
  'La unica funcion que inserta en costo_movimientos. Toma el cerrojo de la '
  'caja abierta y valora con la tasa del dia del hecho.';

-- ---------------------------------------------------------------------------
-- 6. Las puertas del navegador
-- ---------------------------------------------------------------------------
create or replace function public.costo_registrar_entrega(
  p_fecha        date,
  p_origen_fondo text,
  p_moneda       text,
  p_monto        numeric,
  p_descripcion  text,
  p_nota         text default null
) returns bigint
language plpgsql security definer set search_path to ''
as $$
begin
  perform private.exigir_accion('COSTOS.FONDO');

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'La entrega tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.costo_origenes_fondo o
                  where o.codigo = p_origen_fondo and o.activo) then
    raise exception 'Ese origen del fondo no existe o esta apagado.' using errcode = 'P0002';
  end if;

  return private.costo_escribir(
    p_fecha, p_descripcion, 'ENTREGA', p_moneda, p_monto,
    'MANUAL', null, null, null, null, null, p_origen_fondo, null, p_nota);
end;
$$;

create or replace function public.costo_registrar_abono(
  p_fecha        date,
  p_origen_fondo text,
  p_moneda       text,
  p_monto        numeric,
  p_descripcion  text,
  p_nota         text default null
) returns bigint
language plpgsql security definer set search_path to ''
as $$
declare
  v_deuda numeric;
  v_tasas record;
  v_usd   numeric;
begin
  perform private.exigir_accion('COSTOS.FONDO');

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El abono tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  select * into v_tasas from private.tasas_del_dia(upper(btrim(coalesce(p_moneda, 'USD'))), p_fecha);
  v_usd := round(p_monto * v_tasas.tasa / v_tasas.tasa_usd, 2);

  -- Lo que se le debe a ese origen, en todas las cajas.
  select coalesce(sum(case when m.clase = 'ENTREGA' then m.monto_usd else -m.monto_usd end), 0)
    into v_deuda
    from public.costo_movimientos m
   where m.origen_fondo = p_origen_fondo
     and m.sentido = 'ORIGINAL';

  if v_usd > v_deuda + 0.005 then
    raise exception 'Ese abono dejaria a % en negativo: se le deben % USD y se intentan devolver %.',
      p_origen_fondo, round(v_deuda, 2), v_usd
      using errcode = '55000';
  end if;

  return private.costo_escribir(
    p_fecha, p_descripcion, 'ABONO', p_moneda, p_monto,
    'MANUAL', null, null, null, null, null, p_origen_fondo, null, p_nota);
end;
$$;

create or replace function public.costo_registrar_gasto(
  p_fecha       date,
  p_moneda      text,
  p_monto       numeric,
  p_descripcion text,
  p_categoria   text default null,
  p_nota        text default null
) returns bigint
language plpgsql security definer set search_path to ''
as $$
begin
  perform private.exigir_accion('COSTOS.GASTO_MANUAL');

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El gasto tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  -- Opcional a propósito. Sin categoría sale «sin clasificar», a la vista:
  -- no se le inventa casilla.
  if p_categoria is not null
     and not exists (select 1 from public.categorias_gasto c where c.codigo = p_categoria and c.activa) then
    raise exception 'Esa categoria no existe o esta apagada.' using errcode = 'P0002';
  end if;

  return private.costo_escribir(
    p_fecha, p_descripcion, 'GASTO', p_moneda, p_monto,
    'MANUAL', null, null, null, null, p_categoria, null, null, p_nota);
end;
$$;

create or replace function public.costo_guardar_origen_fondo(
  p_codigo       text,
  p_nombre       text,
  p_genera_deuda boolean default true,
  p_activo       boolean default true,
  p_orden        integer default 100
) returns text
language plpgsql security definer set search_path to ''
as $$
declare
  v_codigo text := upper(regexp_replace(btrim(coalesce(p_codigo, p_nombre, '')), '[^A-Za-z0-9]+', '_', 'g'));
begin
  perform private.exigir_accion('COSTOS.CATALOGOS');

  if length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El origen necesita un nombre.' using errcode = '22023';
  end if;

  insert into public.costo_origenes_fondo (codigo, nombre, genera_deuda, activo, orden)
  values (v_codigo, p_nombre, coalesce(p_genera_deuda, true), coalesce(p_activo, true), coalesce(p_orden, 100))
  on conflict (codigo) do update
    set nombre = excluded.nombre,
        genera_deuda = excluded.genera_deuda,
        activo = excluded.activo,
        orden = excluded.orden;

  return v_codigo;
end;
$$;

create or replace function public.costo_guardar_gasto_fijo(
  p_id        bigint,
  p_nombre    text,
  p_moneda    text,
  p_monto     numeric,
  p_categoria text default null,
  p_activo    boolean default true,
  p_nota      text default null
) returns bigint
language plpgsql security definer set search_path to ''
as $$
declare v_id bigint;
begin
  perform private.exigir_accion('COSTOS.CATALOGOS');

  if length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El gasto fijo necesita un nombre.' using errcode = '22023';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto del gasto fijo tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if p_categoria is not null
     and not exists (select 1 from public.categorias_gasto c where c.codigo = p_categoria) then
    raise exception 'Esa categoria no existe.' using errcode = 'P0002';
  end if;

  if p_id is null then
    insert into public.costo_gastos_fijos (nombre, categoria, moneda, monto, activo, nota)
    values (p_nombre, p_categoria, upper(btrim(coalesce(p_moneda, 'USD'))), p_monto,
            coalesce(p_activo, true), p_nota)
    returning id into v_id;
  else
    update public.costo_gastos_fijos
       set nombre = p_nombre,
           categoria = p_categoria,
           moneda = upper(btrim(coalesce(p_moneda, 'USD'))),
           monto = p_monto,
           activo = coalesce(p_activo, true),
           nota = p_nota
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese gasto fijo no existe.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.costo_registrar_entrega(date, text, text, numeric, text, text) from public, anon;
grant  execute on function public.costo_registrar_entrega(date, text, text, numeric, text, text) to authenticated;

revoke execute on function public.costo_registrar_abono(date, text, text, numeric, text, text) from public, anon;
grant  execute on function public.costo_registrar_abono(date, text, text, numeric, text, text) to authenticated;

revoke execute on function public.costo_registrar_gasto(date, text, numeric, text, text, text) from public, anon;
grant  execute on function public.costo_registrar_gasto(date, text, numeric, text, text, text) to authenticated;

revoke execute on function public.costo_guardar_origen_fondo(text, text, boolean, boolean, integer) from public, anon;
grant  execute on function public.costo_guardar_origen_fondo(text, text, boolean, boolean, integer) to authenticated;

revoke execute on function public.costo_guardar_gasto_fijo(bigint, text, text, numeric, text, boolean, text) from public, anon;
grant  execute on function public.costo_guardar_gasto_fijo(bigint, text, text, numeric, text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Las lentes
--
-- `vehiculos` y `articulos` los lee la vista con la RLS de quien mira; a quien
-- tenga COSTOS y no la flota le llega la placa en blanco. Es un rótulo, no un
-- dato de negocio.
-- ---------------------------------------------------------------------------
create or replace view public.v_costo_movimientos
with (security_invoker = on) as
select
  m.id, m.caja_id, m.fecha, m.descripcion, m.clase, m.moneda, m.monto,
  m.tasa, m.tasa_usd, m.tasa_arrastrada, m.monto_usd,
  m.m3, m.producto_id, a.nombre as producto, m.medida,
  m.origen, m.origen_id, m.sentido, m.reversa_a,
  m.categoria, c.nombre as categoria_nombre,
  coalesce(c.padre, c.codigo) as categoria_raiz,
  m.origen_fondo, o.nombre as origen_fondo_nombre,
  m.vehiculo_id, v.placa,
  m.llego_tarde, m.nota, m.registrado_en,
  p.nombre as registrado_por_nombre
from public.costo_movimientos m
left join public.articulos a on a.id = m.producto_id
left join public.categorias_gasto c on c.codigo = m.categoria
left join public.costo_origenes_fondo o on o.codigo = m.origen_fondo
left join public.vehiculos v on v.id = m.vehiculo_id
left join public.perfiles p on p.id = m.registrado_por;

grant select on public.v_costo_movimientos to authenticated;

create or replace view public.v_costo_deuda_por_origen
with (security_invoker = on) as
select
  o.codigo as origen_fondo,
  o.nombre,
  o.genera_deuda,
  o.activo,
  coalesce(sum(m.monto_usd) filter (where m.clase = 'ENTREGA'), 0)::numeric(16,2) as entregado_usd,
  coalesce(sum(m.monto_usd) filter (where m.clase = 'ABONO'), 0)::numeric(16,2)   as abonado_usd,
  (coalesce(sum(m.monto_usd) filter (where m.clase = 'ENTREGA'), 0)
   - coalesce(sum(m.monto_usd) filter (where m.clase = 'ABONO'), 0))::numeric(16,2) as deuda_usd
from public.costo_origenes_fondo o
left join public.costo_movimientos m
  on m.origen_fondo = o.codigo and m.sentido = 'ORIGINAL'
group by o.codigo, o.nombre, o.genera_deuda, o.activo, o.orden
order by o.orden;

grant select on public.v_costo_deuda_por_origen to authenticated;
