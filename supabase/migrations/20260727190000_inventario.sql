-- ============================================================================
-- Inventario
--
-- El libro de movimientos es INMUTABLE. Nada se edita y nada se borra: una
-- existencia que no cuadra se corrige con un movimiento nuevo que la explica,
-- no borrando el que estaba mal. Es la única forma de que dentro de seis meses
-- se pueda responder "¿por qué el 14 de marzo había 40 toneladas menos?".
--
-- La existencia no se guarda en ninguna columna: se calcula sumando el libro.
-- Un contador guardado se desincroniza el día que algo falla a mitad de una
-- operación, y a partir de ahí nadie sabe cuál de los dos números es el bueno.
--
-- El costo se lleva en dólares. En una economía con la moneda moviéndose todos
-- los días, el costo promedio en bolívares no significa nada: mezcla compras
-- de enero con compras de julio como si valieran lo mismo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Almacenes
-- ---------------------------------------------------------------------------
create table if not exists public.almacenes (
  id         bigint generated always as identity primary key,
  codigo     text not null unique,
  nombre     text not null,
  tipo       text not null check (tipo in ('PATIO', 'ALMACEN', 'TALLER', 'COMBUSTIBLE', 'TRANSITO')),
  ubicacion  text,
  -- El almacén de recepción por defecto de las compras.
  recibe_compras boolean not null default false,
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

insert into public.almacenes (codigo, nombre, tipo, recibe_compras) values
  ('ALM-GEN', 'Almacén general',      'ALMACEN',     true),
  ('TALLER',  'Taller mecánico',      'TALLER',      false),
  ('SURT',    'Surtidor de gasoil',   'COMBUSTIBLE', false),
  ('PATIO',   'Patio de material',    'PATIO',       false)
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------------
-- Libro de movimientos
-- ---------------------------------------------------------------------------
create table if not exists public.inventario_movimientos (
  id            bigint generated always as identity primary key,
  numero        text not null unique,
  fecha         date not null default current_date,

  tipo          text not null check (tipo in (
                  'ENTRADA_COMPRA',
                  'ENTRADA_PRODUCCION',
                  'ENTRADA_DEVOLUCION',
                  'SALIDA_CONSUMO',
                  'SALIDA_DESPACHO',
                  'SALIDA_MERMA',
                  'AJUSTE_POSITIVO',
                  'AJUSTE_NEGATIVO',
                  'TRANSFERENCIA_SALIDA',
                  'TRANSFERENCIA_ENTRADA',
                  'REVERSO')),

  -- +1 entra, -1 sale. Se guarda en la fila en vez de deducirse del tipo:
  -- así una suma del libro no depende de que quien la escriba recuerde la
  -- lista completa de tipos.
  signo         smallint not null check (signo in (-1, 1)),

  almacen_id    bigint not null references public.almacenes(id),
  articulo_id   bigint not null references public.articulos(id),

  cantidad      numeric(20,4) not null check (cantidad > 0),
  unidad        text not null references public.unidades(codigo),

  -- Costo unitario en dólares al momento del movimiento. En las salidas es el
  -- promedio ponderado que había; en las entradas, lo que se pagó.
  costo_usd     numeric(20,6) not null default 0 check (costo_usd >= 0),
  valor_usd     numeric(20,6) generated always as (round(cantidad * costo_usd, 6)) stored,

  -- De dónde viene el movimiento, cuando viene de otro documento.
  orden_id          bigint references public.ordenes_compra(id),
  orden_renglon_id  bigint references public.orden_renglones(id),
  movimiento_origen bigint references public.inventario_movimientos(id),

  nota          text,
  registrado_por uuid references auth.users(id),
  registrado_en timestamptz not null default now()
);

create index if not exists movimientos_existencia_idx
  on public.inventario_movimientos (almacen_id, articulo_id, fecha);
create index if not exists movimientos_recientes_idx
  on public.inventario_movimientos (registrado_en desc);
create index if not exists movimientos_orden_idx
  on public.inventario_movimientos (orden_id) where orden_id is not null;

-- Inmutable. Una corrección es un movimiento nuevo, nunca una edición.
create or replace function private.movimientos_inmutables()
returns trigger
language plpgsql
as $$
begin
  raise exception 'El libro de inventario no se modifica ni se borra (operación: %). Registre un reverso o un ajuste.', TG_OP
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists trg_movimientos_inmutables on public.inventario_movimientos;
create trigger trg_movimientos_inmutables
  before update or delete on public.inventario_movimientos
  for each row execute function private.movimientos_inmutables();

-- ---------------------------------------------------------------------------
-- Existencias
-- ---------------------------------------------------------------------------
create or replace view public.v_existencias
with (security_invoker = on) as
select
  m.almacen_id,
  a.codigo   as almacen_codigo,
  a.nombre   as almacen,
  m.articulo_id,
  art.codigo as articulo_codigo,
  art.nombre as articulo,
  art.categoria,
  art.unidad,
  art.stock_minimo,
  sum(m.cantidad * m.signo)                          as existencia,
  sum(m.valor_usd * m.signo)                         as valor_usd,
  case when sum(m.cantidad * m.signo) > 0
       then round(sum(m.valor_usd * m.signo) / sum(m.cantidad * m.signo), 6)
  end                                                as costo_promedio_usd,
  max(m.fecha)                                       as ultimo_movimiento
from public.inventario_movimientos m
join public.almacenes a  on a.id = m.almacen_id
join public.articulos art on art.id = m.articulo_id
group by m.almacen_id, a.codigo, a.nombre, m.articulo_id,
         art.codigo, art.nombre, art.categoria, art.unidad, art.stock_minimo;

-- ---------------------------------------------------------------------------
-- Costo promedio de un artículo en un almacén
--
-- Se calcula sobre el libro en el momento de usarlo. Mantener un promedio
-- guardado obliga a recalcularlo en cada movimiento y a rezar para que nunca
-- se pierda una actualización.
-- ---------------------------------------------------------------------------
create or replace function private.costo_promedio(p_almacen bigint, p_articulo bigint)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case when sum(cantidad * signo) > 0
              then round(sum(valor_usd * signo) / sum(cantidad * signo), 6)
              else 0 end
  from public.inventario_movimientos
  where almacen_id = p_almacen and articulo_id = p_articulo;
$$;

create or replace function private.existencia(p_almacen bigint, p_articulo bigint)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(cantidad * signo), 0)
  from public.inventario_movimientos
  where almacen_id = p_almacen and articulo_id = p_articulo;
$$;

-- Escribe una fila del libro. Todas las operaciones pasan por aquí para que
-- el signo y la numeración no dependan de quién llama.
create or replace function private.registrar_movimiento(
  p_tipo        text,
  p_signo       smallint,
  p_almacen     bigint,
  p_articulo    bigint,
  p_cantidad    numeric,
  p_costo_usd   numeric,
  p_nota        text default null,
  p_orden       bigint default null,
  p_renglon     bigint default null,
  p_origen      bigint default null,
  p_fecha       date default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidad text;
  v_id     bigint;
begin
  select unidad into v_unidad from public.articulos where id = p_articulo;

  if v_unidad is null then
    raise exception 'No existe el artículo %.', p_articulo using errcode = 'P0002';
  end if;

  insert into public.inventario_movimientos
    (numero, fecha, tipo, signo, almacen_id, articulo_id, cantidad, unidad,
     costo_usd, orden_id, orden_renglon_id, movimiento_origen, nota, registrado_por)
  values
    (private.siguiente_numero('MOV'), coalesce(p_fecha, current_date), p_tipo, p_signo,
     p_almacen, p_articulo, p_cantidad, v_unidad, coalesce(p_costo_usd, 0),
     p_orden, p_renglon, p_origen, nullif(trim(coalesce(p_nota, '')), ''),
     (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Recepción de una compra
--
-- Es lo que cierra el círculo: hasta aquí hay dinero pagado y nada en el
-- patio. Se puede recibir en partes; la orden queda cerrada cuando llega
-- todo lo que se pidió.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_recepcion(
  p_orden_id  bigint,
  p_almacen_id bigint,
  p_renglones jsonb,
  p_nota      text default null,
  p_fecha     date default null
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_estado    text;
  v_moneda    char(3);
  v_tasa      numeric;
  v_tasa_usd  numeric;
  v_item      jsonb;
  v_renglon   public.orden_renglones;
  v_cantidad  numeric;
  v_costo_usd numeric;
  v_movs      integer := 0;
  v_pendiente numeric;
  v_nuevo     text;
begin
  perform private.exigir_rol('ALMACEN');

  select estado, moneda, tasa, tasa_usd
    into v_estado, v_moneda, v_tasa, v_tasa_usd
  from public.ordenes_compra where id = p_orden_id;

  if v_estado is null then
    raise exception 'No existe la orden %.', p_orden_id using errcode = 'P0002';
  end if;

  if v_estado not in ('PAGADA_POR_RECIBIR', 'RECIBIDA_PARCIAL') then
    raise exception 'Esta orden está en "%" y no admite recepción.', v_estado
      using errcode = '55000';
  end if;

  if not exists (select 1 from public.almacenes where id = p_almacen_id and activo) then
    raise exception 'El almacén indicado no existe o está inactivo.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'Indica qué llegó y en qué cantidad.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_cantidad := (v_item->>'cantidad')::numeric;

    if coalesce(v_cantidad, 0) <= 0 then
      continue;   -- Renglón que no llegó en este viaje.
    end if;

    select * into v_renglon
    from public.orden_renglones
    where id = (v_item->>'orden_renglon_id')::bigint and orden_id = p_orden_id;

    if v_renglon.id is null then
      raise exception 'Ese renglón no pertenece a la orden %.', p_orden_id using errcode = '22023';
    end if;

    -- Recibir de más no es un descuido: o llegó otra cosa, o el precio pactado
    -- ya no cubre lo que entró. En cualquier caso hay que mirarlo antes.
    if v_renglon.cantidad_recibida + v_cantidad > v_renglon.cantidad + 0.0001 then
      raise exception 'De "%" se pidieron % y ya se recibieron %. No se pueden recibir % más.',
        v_renglon.descripcion, v_renglon.cantidad, v_renglon.cantidad_recibida, v_cantidad
        using errcode = '22023';
    end if;

    update public.orden_renglones
       set cantidad_recibida = cantidad_recibida + v_cantidad
     where id = v_renglon.id;

    -- Solo entra al libro lo que es inventariable. Un flete o una reparación
    -- se compran y se pagan, pero no hay nada que guardar en un estante.
    if v_renglon.articulo_id is not null
       and exists (select 1 from public.articulos
                   where id = v_renglon.articulo_id and inventariable) then

      v_costo_usd := round(v_renglon.precio_unitario * v_tasa / v_tasa_usd, 6);

      perform private.registrar_movimiento(
        'ENTRADA_COMPRA', 1, p_almacen_id, v_renglon.articulo_id,
        v_cantidad, v_costo_usd, p_nota, p_orden_id, v_renglon.id, null, p_fecha);

      v_movs := v_movs + 1;
    end if;
  end loop;

  if v_movs = 0 and not exists (
    select 1 from jsonb_array_elements(p_renglones) e
    where coalesce((e->>'cantidad')::numeric, 0) > 0
  ) then
    raise exception 'No se indicó ninguna cantidad recibida.' using errcode = '22023';
  end if;

  -- ¿Queda algo por llegar?
  select coalesce(sum(cantidad - cantidad_recibida), 0)
    into v_pendiente
  from public.orden_renglones where orden_id = p_orden_id;

  v_nuevo := case when v_pendiente <= 0.0001 then 'RECIBIDA' else 'RECIBIDA_PARCIAL' end;

  update public.ordenes_compra
     set estado = v_nuevo,
         recibida_en = case when v_nuevo = 'RECIBIDA' then now() else recibida_en end
   where id = p_orden_id;

  perform private.anotar('ORDEN', p_orden_id, v_estado, v_nuevo, p_nota);

  return v_movs;
end;
$$;

-- ---------------------------------------------------------------------------
-- Salidas y ajustes
-- ---------------------------------------------------------------------------
create or replace function public.registrar_salida(
  p_almacen_id  bigint,
  p_articulo_id bigint,
  p_cantidad    numeric,
  p_motivo      text,
  p_tipo        text default 'SALIDA_CONSUMO',
  p_fecha       date default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_existencia numeric;
  v_costo      numeric;
  v_articulo   text;
  v_id         bigint;
begin
  perform private.exigir_rol('ALMACEN');

  if p_tipo not in ('SALIDA_CONSUMO', 'SALIDA_MERMA', 'SALIDA_DESPACHO') then
    raise exception 'Tipo de salida no válido: %.', p_tipo using errcode = '22023';
  end if;

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe para qué sale. Una salida sin motivo no se puede auditar.'
      using errcode = '22023';
  end if;

  v_existencia := private.existencia(p_almacen_id, p_articulo_id);

  -- Sacar más de lo que hay produce existencias negativas, y una existencia
  -- negativa no es un dato: es un error que alguien tendrá que deshacer.
  if p_cantidad > v_existencia then
    select nombre into v_articulo from public.articulos where id = p_articulo_id;
    raise exception 'De "%" solo hay % en existencia y se intentan sacar %.',
      coalesce(v_articulo, p_articulo_id::text), v_existencia, p_cantidad
      using errcode = '22023';
  end if;

  v_costo := private.costo_promedio(p_almacen_id, p_articulo_id);

  v_id := private.registrar_movimiento(
    p_tipo, -1, p_almacen_id, p_articulo_id, p_cantidad, v_costo,
    p_motivo, null, null, null, p_fecha);

  return v_id;
end;
$$;

create or replace function public.registrar_ajuste(
  p_almacen_id  bigint,
  p_articulo_id bigint,
  p_contado     numeric,
  p_motivo      text,
  p_fecha       date default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_existencia numeric;
  v_diferencia numeric;
  v_costo      numeric;
begin
  perform private.exigir_rol('ALMACEN');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Un ajuste sin explicación es un descuadre disfrazado. Escribe qué pasó.'
      using errcode = '22023';
  end if;

  v_existencia := private.existencia(p_almacen_id, p_articulo_id);
  v_diferencia := coalesce(p_contado, 0) - v_existencia;

  if abs(v_diferencia) < 0.0001 then
    raise exception 'Lo contado coincide con lo que dice el sistema (%). No hay nada que ajustar.',
      v_existencia using errcode = '22023';
  end if;

  v_costo := private.costo_promedio(p_almacen_id, p_articulo_id);

  return private.registrar_movimiento(
    case when v_diferencia > 0 then 'AJUSTE_POSITIVO' else 'AJUSTE_NEGATIVO' end,
    case when v_diferencia > 0 then 1 else -1 end::smallint,
    p_almacen_id, p_articulo_id, abs(v_diferencia), v_costo,
    format('Conteo físico: %s contra %s en sistema. %s', p_contado, v_existencia, p_motivo),
    null, null, null, p_fecha);
end;
$$;

-- Deshacer un movimiento sin borrarlo: se escribe su contrario.
create or replace function public.reversar_movimiento(p_id bigint, p_motivo text)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_mov public.inventario_movimientos;
begin
  perform private.exigir_rol('ALMACEN');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se reversa.' using errcode = '22023';
  end if;

  select * into v_mov from public.inventario_movimientos where id = p_id;

  if v_mov.id is null then
    raise exception 'No existe el movimiento %.', p_id using errcode = 'P0002';
  end if;

  if exists (select 1 from public.inventario_movimientos where movimiento_origen = p_id) then
    raise exception 'Ese movimiento ya fue reversado.' using errcode = '55000';
  end if;

  return private.registrar_movimiento(
    'REVERSO', (-v_mov.signo)::smallint, v_mov.almacen_id, v_mov.articulo_id,
    v_mov.cantidad, v_mov.costo_usd,
    format('Reverso de %s. %s', v_mov.numero, p_motivo),
    v_mov.orden_id, v_mov.orden_renglon_id, v_mov.id, null);
end;
$$;

create or replace function public.guardar_almacen(
  p_id             bigint,
  p_codigo         text,
  p_nombre         text,
  p_tipo           text,
  p_ubicacion      text default null,
  p_recibe_compras boolean default false,
  p_activo         boolean default true
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform private.exigir_rol('ALMACEN');

  if p_id is null then
    insert into public.almacenes (codigo, nombre, tipo, ubicacion, recibe_compras, activo)
    values (upper(trim(p_codigo)), trim(p_nombre), p_tipo,
            nullif(trim(coalesce(p_ubicacion, '')), ''),
            coalesce(p_recibe_compras, false), coalesce(p_activo, true))
    returning id into v_id;
  else
    update public.almacenes set
      codigo = upper(trim(p_codigo)),
      nombre = trim(p_nombre),
      tipo = p_tipo,
      ubicacion = nullif(trim(coalesce(p_ubicacion, '')), ''),
      recibe_compras = coalesce(p_recibe_compras, false),
      activo = coalesce(p_activo, true)
    where id = p_id
    returning id into v_id;
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe un almacén con el código %.', upper(trim(p_codigo))
      using errcode = '23505';
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
alter table public.almacenes              enable row level security;
alter table public.inventario_movimientos enable row level security;

revoke insert, update, delete on public.almacenes              from anon, authenticated;
revoke insert, update, delete on public.inventario_movimientos from anon, authenticated;

grant select on public.almacenes              to authenticated;
grant select on public.inventario_movimientos to authenticated;
grant select on public.v_existencias          to authenticated;

drop policy if exists almacenes_lectura on public.almacenes;
create policy almacenes_lectura on public.almacenes
  for select to authenticated using (true);

drop policy if exists movimientos_lectura on public.inventario_movimientos;
create policy movimientos_lectura on public.inventario_movimientos
  for select to authenticated using (true);

do $$
declare
  v_firma text;
begin
  foreach v_firma in array array[
    'public.registrar_recepcion(bigint, bigint, jsonb, text, date)',
    'public.registrar_salida(bigint, bigint, numeric, text, text, date)',
    'public.registrar_ajuste(bigint, bigint, numeric, text, date)',
    'public.reversar_movimiento(bigint, text)',
    'public.guardar_almacen(bigint, text, text, text, text, boolean, boolean)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_firma);
    execute format('grant execute on function %s to authenticated', v_firma);
  end loop;
end
$$;
