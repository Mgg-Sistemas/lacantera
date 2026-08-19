-- ---------------------------------------------------------------------------
-- Maquinaria, horómetro y mantenimiento
--
-- POR QUÉ ESTA ES LA PIEZA QUE FALTABA
--
-- Del encargo original quedaban cuatro cosas sin base sobre la que apoyarse:
-- el horómetro, el aviso de mantenimiento a las 250 horas, la separación entre
-- mantenimiento y servicio, y las «partidas de nacimiento» de cada máquina.
-- Las cuatro cuelgan de una entidad que no existía: la máquina.
--
-- Se añade también porque el taller la necesita. Un taller repara cosas, y lo
-- que repara son máquinas y herramientas; sin la máquina, una orden de taller
-- no tiene sobre qué recaer.
--
-- EL CONTADOR NO SE REINICIA: SE CALCULA
--
-- El encargo dice que al completar el mantenimiento el contador vuelve a cero.
-- La forma obvia sería guardar un número y ponerlo en cero, y sería la forma
-- frágil: un número que se pisa a mano se puede pisar mal, y no queda rastro de
-- lo que decía antes.
--
-- Aquí las horas desde el último mantenimiento se SUMAN de las lecturas
-- posteriores a él. El «reinicio» ocurre solo, porque al anotar un
-- mantenimiento las lecturas anteriores dejan de contar. No hay nada que poner
-- en cero, nada que se pueda desincronizar, y el histórico queda entero.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- La máquina
-- ---------------------------------------------------------------------------
create table if not exists public.maquinaria (
  id            bigint generated always as identity primary key,
  codigo        text not null unique,
  nombre        text not null,

  tipo          text not null default 'OTRO'
                check (tipo in ('EXCAVADORA','CARGADOR','CAMION','PLANTA',
                                'PERFORADORA','VEHICULO','GENERADOR','OTRO')),

  marca         text,
  modelo        text,
  serial        text,
  anio          smallint check (anio is null or anio between 1950 and 2100),

  /*
    Dónde vive.

    Apunta a un almacén, que es donde el sistema ya guarda talleres y patios.
    Una máquina asignada a un taller es lo que permite después preguntar qué
    hay en ese taller y qué se está reparando ahí.
  */
  almacen_id    bigint references public.almacenes(id),

  estado        text not null default 'ACTIVA'
                check (estado in ('ACTIVA','EN_MANTENIMIENTO','FUERA_DE_SERVICIO','DESINCORPORADA')),

  /*
    Los topes, por máquina y no fijos en el código.

    El encargo dice 250 horas con avisos a las 200 y 220, y ese es el valor por
    defecto. Pero un compresor y una excavadora no se atienden igual, y el día
    que el fabricante de una diga otra cosa, cambiar el número no puede exigir
    una migración.
  */
  tope_horas    numeric(10,2) not null default 250 check (tope_horas > 0),
  aviso_horas   numeric(10,2) not null default 200 check (aviso_horas > 0),
  alarma_horas  numeric(10,2) not null default 220 check (alarma_horas > 0),

  nota          text,
  activa        boolean not null default true,

  creada_por    uuid references auth.users(id),
  creada_en     timestamptz not null default now(),

  -- Los tres umbrales tienen que ir en orden o los avisos se disparan al revés.
  constraint maquinaria_umbrales_en_orden
    check (aviso_horas <= alarma_horas and alarma_horas <= tope_horas)
);

create index if not exists maquinaria_almacen_idx on public.maquinaria (almacen_id);

comment on table public.maquinaria is
  'Las maquinas de la cantera. De aqui cuelgan el horometro, el mantenimiento y los papeles de cada una.';

-- ---------------------------------------------------------------------------
-- El horómetro
--
-- Una lectura por máquina y por día, con lo que marcaba al empezar y al
-- terminar. Las horas del día son la resta, y la calcula la base: escrita a
-- mano se equivoca alguien tarde o temprano, y una hora de más o de menos
-- corre el mantenimiento de sitio.
-- ---------------------------------------------------------------------------
create table if not exists public.horometro_lecturas (
  id          bigint generated always as identity primary key,
  maquina_id  bigint not null references public.maquinaria(id) on delete cascade,
  fecha       date not null default current_date,

  inicial     numeric(12,2) not null check (inicial >= 0),
  final       numeric(12,2) not null check (final >= 0),
  horas       numeric(12,2) generated always as (final - inicial) stored,

  operador_id bigint references public.empleados(id),
  nota        text,

  creada_por  uuid references auth.users(id),
  creada_en   timestamptz not null default now(),

  -- El horómetro solo avanza. Si el final es menor que el inicial, o alguien
  -- se equivocó de casilla o la maquina se cambio de reloj: las dos cosas hay
  -- que resolverlas antes de guardar, no despues.
  constraint horometro_no_retrocede check (final >= inicial),

  -- Una lectura por maquina y dia. Dos lecturas del mismo dia contarian las
  -- horas dos veces y adelantarian el mantenimiento sin motivo.
  unique (maquina_id, fecha)
);

create index if not exists horometro_maquina_fecha_idx
  on public.horometro_lecturas (maquina_id, fecha desc);

-- ---------------------------------------------------------------------------
-- Mantenimiento y servicio
--
-- LA DIVISIÓN QUE PIDIÓ EL CLIENTE, Y LO QUE SIGNIFICA DE VERDAD
--
-- No son dos etiquetas para lo mismo. El mantenimiento profundo —motor,
-- correas— es lo que el tope de horas persigue, y por eso REINICIA la cuenta.
-- El servicio regular —engrase, combustible— se hace muchas veces entre dos
-- mantenimientos y no reinicia nada.
--
-- Si el servicio reiniciara, engrasar una máquina la dejaría eternamente lejos
-- de su mantenimiento y el tope no protegería de nada. Es el error que esta
-- separación existe para impedir.
-- ---------------------------------------------------------------------------
create table if not exists public.mantenimientos (
  id          bigint generated always as identity primary key,
  maquina_id  bigint not null references public.maquinaria(id) on delete cascade,
  fecha       date not null default current_date,

  tipo        text not null check (tipo in ('MANTENIMIENTO','SERVICIO')),

  /*
    Qué se hizo. Obligatorio a propósito.

    Un mantenimiento sin detalle no sirve para nada dentro de seis meses,
    cuando alguien intente saber si ya se cambiaron las correas.
  */
  detalle     text not null check (length(btrim(detalle)) >= 3),

  -- Lo que marcaba el horómetro al hacerlo. Es el dato que permite auditar
  -- despues si se respeto el tope o se paso.
  horometro   numeric(12,2) check (horometro is null or horometro >= 0),

  taller_id   bigint references public.almacenes(id),
  costo_usd   numeric(20,6) check (costo_usd is null or costo_usd >= 0),

  registrado_por uuid references auth.users(id),
  registrado_en  timestamptz not null default now()
);

create index if not exists mantenimientos_maquina_idx
  on public.mantenimientos (maquina_id, fecha desc);

comment on column public.mantenimientos.tipo is
  'MANTENIMIENTO reinicia la cuenta de horas; SERVICIO no. Engrasar no puede aplazar el mantenimiento.';

-- ---------------------------------------------------------------------------
-- Cómo está cada máquina
--
-- Reúne lo que hace falta para decidir: cuánto lleva desde el último
-- mantenimiento, cuánto le falta para el tope, y en qué punto de aviso está.
--
-- El semáforo sale de los umbrales de la propia máquina, no de números
-- escritos aquí: así una máquina con otro régimen se comporta distinto sin
-- tocar esta vista.
-- ---------------------------------------------------------------------------
create or replace view public.v_maquinaria
with (security_invoker = on) as
with ultimo_mant as (
  select distinct on (maquina_id)
         maquina_id, fecha, horometro
    from public.mantenimientos
   where tipo = 'MANTENIMIENTO'
   order by maquina_id, fecha desc, id desc
),
horas as (
  select m.id as maquina_id,
         -- Solo las lecturas posteriores al ultimo mantenimiento. Aqui ocurre
         -- el «reinicio a cero» sin reiniciar nada.
         coalesce(sum(h.horas) filter (
           where um.fecha is null or h.fecha > um.fecha
         ), 0) as horas_desde_mant,
         coalesce(sum(h.horas), 0) as horas_totales,
         max(h.fecha) as ultima_lectura,
         max(h.final) filter (where h.fecha = (
           select max(h2.fecha) from public.horometro_lecturas h2 where h2.maquina_id = m.id
         )) as horometro_actual
    from public.maquinaria m
    left join ultimo_mant um on um.maquina_id = m.id
    left join public.horometro_lecturas h on h.maquina_id = m.id
   group by m.id
)
select
  m.*,
  a.nombre  as almacen,
  a.tipo    as almacen_tipo,
  hs.horas_desde_mant,
  hs.horas_totales,
  hs.ultima_lectura,
  hs.horometro_actual,
  um.fecha  as ultimo_mantenimiento,
  greatest(m.tope_horas - hs.horas_desde_mant, 0) as horas_para_el_tope,
  case
    when hs.horas_desde_mant >= m.tope_horas   then 'BLOQUEANTE'
    when hs.horas_desde_mant >= m.alarma_horas then 'ALARMA'
    when hs.horas_desde_mant >= m.aviso_horas  then 'AVISO'
    else 'OK'
  end as semaforo
from public.maquinaria m
left join horas hs on hs.maquina_id = m.id
left join ultimo_mant um on um.maquina_id = m.id
left join public.almacenes a on a.id = m.almacen_id;

comment on view public.v_maquinaria is
  'Cada maquina con sus horas desde el ultimo mantenimiento y su semaforo.';

-- ---------------------------------------------------------------------------
-- Quién puede ver y tocar esto
--
-- Se cuelga del módulo nuevo MAQUINARIA. Operaciones la usa a diario —es quien
-- anota el horómetro— y mantenimiento lo registra quien repara.
-- ---------------------------------------------------------------------------
insert into public.modulos (codigo, nombre, descripcion, orden) values
  ('MAQUINARIA', 'Maquinaria', 'Equipos, horómetro y mantenimiento.', 25)
on conflict (codigo) do update
  set nombre = excluded.nombre, descripcion = excluded.descripcion, orden = excluded.orden;

-- Por defecto nadie, y despues se abre a quien corresponde: es mas seguro
-- olvidarse de dar un permiso que olvidarse de quitarlo.
insert into public.rol_permisos (rol, modulo, nivel)
select r.codigo, 'MAQUINARIA', 'NINGUNO' from public.roles r
on conflict (rol, modulo) do nothing;

update public.rol_permisos set nivel = 'TOTAL'
 where modulo = 'MAQUINARIA' and rol in ('ADMIN');
update public.rol_permisos set nivel = 'ESCRITURA'
 where modulo = 'MAQUINARIA' and rol in ('OPERACIONES','ALMACEN');
update public.rol_permisos set nivel = 'LECTURA'
 where modulo = 'MAQUINARIA' and rol in ('GERENTE_GENERAL','COMPRAS','CONSULTA');

alter table public.maquinaria         enable row level security;
alter table public.horometro_lecturas enable row level security;
alter table public.mantenimientos     enable row level security;

drop policy if exists maquinaria_lectura on public.maquinaria;
create policy maquinaria_lectura on public.maquinaria
  for select to authenticated using (private.tiene_permiso('MAQUINARIA', 'LECTURA'));

drop policy if exists maquinaria_escritura on public.maquinaria;
create policy maquinaria_escritura on public.maquinaria
  for all to authenticated
  using (private.tiene_permiso('MAQUINARIA', 'ESCRITURA'))
  with check (private.tiene_permiso('MAQUINARIA', 'ESCRITURA'));

drop policy if exists horometro_lectura on public.horometro_lecturas;
create policy horometro_lectura on public.horometro_lecturas
  for select to authenticated using (private.tiene_permiso('MAQUINARIA', 'LECTURA'));

drop policy if exists horometro_escritura on public.horometro_lecturas;
create policy horometro_escritura on public.horometro_lecturas
  for all to authenticated
  using (private.tiene_permiso('MAQUINARIA', 'ESCRITURA'))
  with check (private.tiene_permiso('MAQUINARIA', 'ESCRITURA'));

drop policy if exists mantenimientos_lectura on public.mantenimientos;
create policy mantenimientos_lectura on public.mantenimientos
  for select to authenticated using (private.tiene_permiso('MAQUINARIA', 'LECTURA'));

drop policy if exists mantenimientos_escritura on public.mantenimientos;
create policy mantenimientos_escritura on public.mantenimientos
  for all to authenticated
  using (private.tiene_permiso('MAQUINARIA', 'ESCRITURA'))
  with check (private.tiene_permiso('MAQUINARIA', 'ESCRITURA'));
