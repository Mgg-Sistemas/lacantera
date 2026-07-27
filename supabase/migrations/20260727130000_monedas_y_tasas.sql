-- ============================================================================
-- Monedas y tasas de cambio
--
-- Base del sistema bimoneda. Todo lo demás (compras, inventario, nómina,
-- tesorería) depende de estas dos tablas, así que van primero.
--
-- La tasa que se muestra en la barra superior se consulta desde el navegador a
-- una fuente pública, pero eso es SOLO para informar. La tasa con la que se
-- valora un documento se resuelve aquí y se congela en la fila del documento:
-- si cada navegador resolviera su propia tasa al emitir, dos personas
-- registrando a la misma hora podrían valorar distinto.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Monedas
-- ---------------------------------------------------------------------------
create table if not exists public.monedas (
  codigo         char(3) primary key,          -- ISO 4217
  nombre         text     not null,
  simbolo        text     not null,
  decimales      smallint not null default 2 check (decimales between 0 and 6),
  -- Determina si un pago desde una cuenta en esta moneda causa IGTF.
  es_curso_legal boolean  not null default false,
  activa         boolean  not null default true
);

insert into public.monedas (codigo, nombre, simbolo, es_curso_legal) values
  ('VES', 'Bolívar',               'Bs', true),
  ('USD', 'Dólar estadounidense',  '$',  false),
  ('EUR', 'Euro',                  '€',  false)
on conflict (codigo) do update
  set nombre = excluded.nombre,
      simbolo = excluded.simbolo,
      es_curso_legal = excluded.es_curso_legal;

-- ---------------------------------------------------------------------------
-- Tasas de cambio
-- ---------------------------------------------------------------------------
create table if not exists public.tasas_cambio (
  id             bigint generated always as identity primary key,
  moneda_origen  char(3) not null references public.monedas(codigo),
  moneda_destino char(3) not null references public.monedas(codigo),
  fecha          date    not null,

  -- 10 decimales: la tasa inversa VES→USD ronda 1,3e-3 y con menos escala se
  -- pierden céntimos al reexpresar montos grandes.
  tasa           numeric(20,10) not null check (tasa > 0),

  -- BCV es la única admisible como base imponible. Las demás existen porque
  -- la empresa opera con ellas (precios de venta, acuerdos con proveedores),
  -- pero nunca deben usarse en un documento fiscal.
  fuente         text not null check (fuente in ('BCV', 'PARALELO', 'INTERNA', 'CONTRACTUAL')),

  registrado_por uuid references auth.users(id),
  registrado_en  timestamptz not null default now(),

  constraint tasas_monedas_distintas check (moneda_origen <> moneda_destino),
  constraint tasas_unicas unique (moneda_origen, moneda_destino, fecha, fuente)
);

create index if not exists tasas_cambio_busqueda_idx
  on public.tasas_cambio (moneda_origen, moneda_destino, fuente, fecha desc);

-- Una tasa referenciada por un documento no se puede alterar: es evidencia de
-- auditoría. Si el BCV publica una corrección, se inserta una fila nueva y se
-- reprocesan los documentos afectados con un procedimiento explícito.
create or replace function public.tasas_cambio_inmutables()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Las tasas de cambio no se modifican ni se borran (operación: %). Inserte una tasa nueva.', TG_OP
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists trg_tasas_cambio_inmutables on public.tasas_cambio;
create trigger trg_tasas_cambio_inmutables
  before update or delete on public.tasas_cambio
  for each row execute function public.tasas_cambio_inmutables();

-- ---------------------------------------------------------------------------
-- Resolución de la tasa aplicable
-- ---------------------------------------------------------------------------
-- Devuelve la última tasa publicada en la fecha indicada o antes. El arrastre
-- es necesario: el BCV no publica fines de semana ni feriados, y un documento
-- emitido en sábado tiene que valorarse con la tasa del viernes.
create or replace function public.obtener_tasa(
  p_origen  char(3),
  p_destino char(3),
  p_fecha   date default current_date,
  p_fuente  text default 'BCV'
)
returns table (
  tasa      numeric(20,10),
  fecha     date,
  fuente    text,
  arrastrada boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.tasa,
         t.fecha,
         t.fuente,
         t.fecha < p_fecha as arrastrada
  from public.tasas_cambio t
  where t.moneda_origen  = p_origen
    and t.moneda_destino = p_destino
    and t.fuente         = p_fuente
    and t.fecha         <= p_fecha
  order by t.fecha desc, t.id desc
  limit 1;
$$;

revoke execute on function public.obtener_tasa(char, char, date, text) from public, anon;
grant   execute on function public.obtener_tasa(char, char, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Permisos y RLS
-- ---------------------------------------------------------------------------
alter table public.monedas       enable row level security;
alter table public.tasas_cambio  enable row level security;

-- Escritura solo por función; el cliente nunca inserta directo.
revoke insert, update, delete on public.monedas      from anon, authenticated;
revoke insert, update, delete on public.tasas_cambio from anon, authenticated;

grant select on public.monedas      to authenticated;
grant select on public.tasas_cambio to authenticated;

-- Lectura para cualquier usuario autenticado: la tasa la necesita todo el
-- mundo. El control de quién puede REGISTRARLA vive en la función de abajo.
drop policy if exists monedas_lectura on public.monedas;
create policy monedas_lectura on public.monedas
  for select to authenticated using (true);

drop policy if exists tasas_lectura on public.tasas_cambio;
create policy tasas_lectura on public.tasas_cambio
  for select to authenticated using (true);

-- Registrar la tasa del día. La comprobación de permiso se añade cuando exista
-- el módulo de roles; por ahora exige sesión válida.
create or replace function public.registrar_tasa(
  p_origen  char(3),
  p_destino char(3),
  p_fecha   date,
  p_tasa    numeric,
  p_fuente  text default 'BCV'
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  bigint;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  if p_tasa is null or p_tasa <= 0 then
    raise exception 'La tasa debe ser mayor que cero (recibido: %)', p_tasa
      using errcode = '22023';
  end if;

  if p_fecha > current_date then
    raise exception 'No se puede registrar una tasa con fecha futura'
      using errcode = '22023';
  end if;

  insert into public.tasas_cambio
    (moneda_origen, moneda_destino, fecha, tasa, fuente, registrado_por)
  values
    (p_origen, p_destino, p_fecha, p_tasa, p_fuente, v_uid)
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe una tasa % para %/% del %', p_fuente, p_origen, p_destino, p_fecha
      using errcode = '23505',
            hint = 'Las tasas no se corrigen: si el valor cambió, consulte con administración.';
end;
$$;

revoke execute on function public.registrar_tasa(char, char, date, numeric, text) from public, anon;
grant   execute on function public.registrar_tasa(char, char, date, numeric, text) to authenticated;
