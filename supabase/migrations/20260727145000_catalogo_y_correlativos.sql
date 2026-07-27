-- ============================================================================
-- Catálogo de artículos, unidades y numeración de documentos
--
-- Base compartida por compras, inventario y despachos. Va antes que compras
-- porque un renglón de requisición apunta a un artículo y a una unidad.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Correlativos
--
-- Los documentos llevan número visible (SOL-2026-0001) porque la gente los
-- nombra por ahí: "la orden 47". Una `sequence` no sirve sola porque el número
-- se reinicia cada año y el prefijo cambia por tipo de documento.
--
-- `on conflict do update ... returning` toma el bloqueo de fila dentro de la
-- misma sentencia: dos personas creando a la vez no obtienen el mismo número.
-- ---------------------------------------------------------------------------
create table if not exists public.correlativos (
  prefijo text     not null,
  anio    smallint not null,
  ultimo  integer  not null default 0,
  primary key (prefijo, anio)
);

create or replace function private.siguiente_numero(p_prefijo text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_anio  smallint := extract(year from (now() at time zone 'America/Caracas'))::smallint;
  v_ultimo integer;
begin
  insert into public.correlativos (prefijo, anio, ultimo)
  values (p_prefijo, v_anio, 1)
  on conflict (prefijo, anio) do update
    set ultimo = public.correlativos.ultimo + 1
  returning ultimo into v_ultimo;

  return format('%s-%s-%s', p_prefijo, v_anio, lpad(v_ultimo::text, 4, '0'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Unidades de medida
--
-- La tonelada es la unidad canónica del material: la romana es el único
-- instrumento auditable del patio. El metro cúbico se usa para hablar con el
-- cliente, pero se convierte a tonelada para registrar.
-- ---------------------------------------------------------------------------
create table if not exists public.unidades (
  codigo text primary key,
  nombre text not null,
  tipo   text not null check (tipo in ('MASA', 'VOLUMEN', 'LONGITUD', 'CONTEO', 'TIEMPO')),
  orden  smallint not null default 100
);

insert into public.unidades (codigo, nombre, tipo, orden) values
  ('TON',  'Tonelada',     'MASA',     10),
  ('KG',   'Kilogramo',    'MASA',     20),
  ('M3',   'Metro cúbico', 'VOLUMEN',  30),
  ('L',    'Litro',        'VOLUMEN',  40),
  ('GAL',  'Galón',        'VOLUMEN',  50),
  ('M',    'Metro',        'LONGITUD', 60),
  ('UND',  'Unidad',       'CONTEO',   70),
  ('PAR',  'Par',          'CONTEO',   80),
  ('JGO',  'Juego',        'CONTEO',   90),
  ('SACO', 'Saco',         'CONTEO',  100),
  ('CAJA', 'Caja',         'CONTEO',  110),
  ('ROLLO','Rollo',        'CONTEO',  120),
  ('HORA', 'Hora',         'TIEMPO',  130),
  ('SERV', 'Servicio',     'CONTEO',  140)
on conflict (codigo) do update
  set nombre = excluded.nombre, tipo = excluded.tipo, orden = excluded.orden;

-- ---------------------------------------------------------------------------
-- Artículos
-- ---------------------------------------------------------------------------
create table if not exists public.articulos (
  id            bigint generated always as identity primary key,
  codigo        text not null unique,
  nombre        text not null,
  descripcion   text,
  categoria     text not null check (categoria in (
                  'PRODUCTO',    -- lo que la cantera vende: piedra, arena, granzón
                  'REPUESTO',
                  'INSUMO',
                  'COMBUSTIBLE',
                  'LUBRICANTE',
                  'EPP',         -- equipo de protección personal
                  'HERRAMIENTA',
                  'EXPLOSIVO',
                  'SERVICIO')),
  unidad        text not null references public.unidades(codigo),

  -- Un servicio (flete, reparación externa) se compra pero no entra al
  -- inventario. La distinción evita existencias fantasma.
  inventariable boolean not null default true,

  -- Punto de reposición. Cero significa "no se controla".
  stock_minimo  numeric(20,4) not null default 0 check (stock_minimo >= 0),

  activo        boolean not null default true,
  creado_por    uuid references auth.users(id),
  creado_en     timestamptz not null default now()
);

create index if not exists articulos_categoria_idx on public.articulos (categoria) where activo;
create index if not exists articulos_busqueda_idx  on public.articulos using gin (to_tsvector('spanish', nombre || ' ' || coalesce(descripcion, '')));

-- Un servicio no puede ser inventariable: no hay nada que contar.
alter table public.articulos drop constraint if exists articulos_servicio_no_inventariable;
alter table public.articulos add constraint articulos_servicio_no_inventariable
  check (categoria <> 'SERVICIO' or not inventariable);

create or replace function public.crear_articulo(
  p_codigo        text,
  p_nombre        text,
  p_categoria     text,
  p_unidad        text,
  p_descripcion   text default null,
  p_inventariable boolean default true,
  p_stock_minimo  numeric default 0
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
  perform private.exigir_rol('COMPRAS', 'ALMACEN');

  if length(trim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'El nombre del artículo es obligatorio.' using errcode = '22023';
  end if;

  insert into public.articulos
    (codigo, nombre, descripcion, categoria, unidad, inventariable, stock_minimo, creado_por)
  values
    (upper(trim(p_codigo)), trim(p_nombre), nullif(trim(coalesce(p_descripcion, '')), ''),
     p_categoria, p_unidad,
     case when p_categoria = 'SERVICIO' then false else p_inventariable end,
     coalesce(p_stock_minimo, 0), (select auth.uid()))
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe un artículo con el código %.', upper(trim(p_codigo))
      using errcode = '23505';
end;
$$;

create or replace function public.cambiar_estado_articulo(p_id bigint, p_activo boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.exigir_rol('COMPRAS', 'ALMACEN');
  update public.articulos set activo = p_activo where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
alter table public.correlativos enable row level security;
alter table public.unidades     enable row level security;
alter table public.articulos    enable row level security;

revoke insert, update, delete on public.correlativos from anon, authenticated;
revoke insert, update, delete on public.unidades     from anon, authenticated;
revoke insert, update, delete on public.articulos    from anon, authenticated;
revoke select                 on public.correlativos from anon, authenticated;

grant select on public.unidades  to authenticated;
grant select on public.articulos to authenticated;

drop policy if exists unidades_lectura on public.unidades;
create policy unidades_lectura on public.unidades
  for select to authenticated using (true);

drop policy if exists articulos_lectura on public.articulos;
create policy articulos_lectura on public.articulos
  for select to authenticated using (true);

revoke execute on function public.crear_articulo(text, text, text, text, text, boolean, numeric) from public, anon;
grant   execute on function public.crear_articulo(text, text, text, text, text, boolean, numeric) to authenticated;
revoke execute on function public.cambiar_estado_articulo(bigint, boolean) from public, anon;
grant   execute on function public.cambiar_estado_articulo(bigint, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Catálogo inicial
--
-- No es relleno de demostración: es el mínimo con el que una cantera puede
-- empezar a operar el primer día. Se edita desde Configuración › Catálogo.
-- ---------------------------------------------------------------------------
insert into public.articulos (codigo, nombre, categoria, unidad, inventariable, stock_minimo) values
  ('PRD-P1',   'Piedra picada N.º 1',            'PRODUCTO',    'TON',  true,    0),
  ('PRD-P2',   'Piedra picada N.º 2',            'PRODUCTO',    'TON',  true,    0),
  ('PRD-GRZ',  'Granzón',                        'PRODUCTO',    'TON',  true,    0),
  ('PRD-ARL',  'Arena lavada',                   'PRODUCTO',    'TON',  true,    0),
  ('PRD-POL',  'Polvillo',                       'PRODUCTO',    'TON',  true,    0),
  ('CMB-GAS',  'Gasoil',                         'COMBUSTIBLE', 'L',    true, 2000),
  ('CMB-GSL',  'Gasolina',                       'COMBUSTIBLE', 'L',    true,  200),
  ('LUB-15W40','Aceite de motor 15W-40',         'LUBRICANTE',  'L',    true,  200),
  ('LUB-HID',  'Aceite hidráulico ISO 68',       'LUBRICANTE',  'L',    true,  200),
  ('LUB-GRA',  'Grasa multipropósito EP2',       'LUBRICANTE',  'KG',   true,   50),
  ('REP-MAND', 'Muela de mandíbula trituradora', 'REPUESTO',    'UND',  true,    2),
  ('REP-BAND', 'Banda transportadora 24"',       'REPUESTO',    'M',    true,   20),
  ('REP-RODA', 'Rodamiento de rodillo',          'REPUESTO',    'UND',  true,   10),
  ('REP-FILA', 'Filtro de aire',                 'REPUESTO',    'UND',  true,    6),
  ('REP-FILC', 'Filtro de combustible',          'REPUESTO',    'UND',  true,    6),
  ('REP-NEU',  'Neumático 29.5R25',              'REPUESTO',    'UND',  true,    2),
  ('EPP-CAS',  'Casco de seguridad',             'EPP',         'UND',  true,   10),
  ('EPP-BOT',  'Botas de seguridad',             'EPP',         'PAR',  true,   10),
  ('EPP-GUA',  'Guantes de carnaza',             'EPP',         'PAR',  true,   20),
  ('EPP-PRO',  'Protector auditivo',             'EPP',         'UND',  true,   20),
  ('EPP-LEN',  'Lentes de seguridad',            'EPP',         'UND',  true,   20),
  ('INS-ELEC', 'Electrodo 6013 1/8"',            'INSUMO',      'KG',   true,   20),
  ('INS-OXI',  'Oxígeno industrial',             'INSUMO',      'UND',  true,    2),
  ('EXP-EMU',  'Emulsión explosiva',             'EXPLOSIVO',   'KG',   true,    0),
  ('EXP-DET',  'Detonador no eléctrico',         'EXPLOSIVO',   'UND',  true,    0),
  ('SRV-FLE',  'Flete de material',              'SERVICIO',    'SERV', false,   0),
  ('SRV-MEC',  'Servicio mecánico externo',      'SERVICIO',    'SERV', false,   0),
  ('SRV-ELE',  'Servicio eléctrico externo',     'SERVICIO',    'SERV', false,   0)
on conflict (codigo) do nothing;
