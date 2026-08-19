-- ---------------------------------------------------------------------------
-- Los vehículos que mueven el material
--
-- POR QUÉ UNA TABLA Y NO SEGUIR ESCRIBIENDO LA PLACA
--
-- Hasta ahora la placa se tecleaba en cada pesaje, cada guía y cada nota de
-- entrega. Tres oportunidades de escribir la misma placa de tres maneras, y
-- ninguna forma de saber cuánto movió un camión sin adivinar cuál de las
-- variantes era él.
--
-- Pero el motivo de fondo es otro: la capacidad. La cantera despacha en metros
-- cúbicos y sus camiones tienen medida conocida —el volteo Toronto lleva unos
-- 18 m³, el chuto con volqueta unos 25—. Con el dato guardado, el despachador
-- elige el camión y el sistema sabe cuánto cabe. Sin él, cada despacho es un
-- número escrito a mano que nadie contrasta con nada.
--
-- POR QUÉ NO SON FILAS DE `maquinaria`
--
-- Los camiones propios sí son maquinaria: tienen horómetro y les toca
-- mantenimiento como a una excavadora. Los de los transportistas no: no son
-- nuestros, no los mantenemos, y meterlos en `maquinaria` los pondría a
-- competir por atención en el semáforo con equipos que sí dependen de
-- nosotros.
--
-- La salida es que esta tabla trate de lo único que comparten —cuánto cargan y
-- qué placa tienen— y que los propios apunten a su ficha de maquinaria con
-- `maquina_id`. Así el mismo camión no existe dos veces a efectos de
-- mantenimiento.
-- ---------------------------------------------------------------------------

create table if not exists public.vehiculos (
  id            bigint generated always as identity primary key,

  -- Se guarda en mayúsculas y sin espacios sobrantes. La placa es un
  -- identificador, no un texto libre: «a12bc3d» y «A12BC3D» son el mismo
  -- camión y no pueden convivir como dos.
  placa         text not null unique,

  tipo          text not null check (tipo in (
                  'VOLTEO',    -- camión de volteo
                  'CHUTO',     -- chuto con volqueta o batea
                  'GANDOLA',
                  'CAVA',
                  'CISTERNA',
                  'OTRO')),
  descripcion   text,

  -- La medida con la que se opera hoy. Obligatoria: un vehículo sin capacidad
  -- no sirve para lo que existe esta tabla.
  capacidad_m3  numeric(10,2) not null check (capacidad_m3 > 0),

  -- La otra medida, para cuando llegue la licencia de toneladas. Nula mientras
  -- nadie la haya pesado, igual que la densidad de los materiales: un número
  -- inventado aquí se convierte en una carga mal calculada en el patio.
  capacidad_ton numeric(10,2) check (capacidad_ton is null or capacidad_ton > 0),

  -- De la empresa o de un transportista.
  propio        boolean not null default true,
  transportista text,

  -- La ficha de mantenimiento, solo si es nuestro.
  maquina_id    bigint unique references public.maquinaria(id) on delete set null,

  activo        boolean not null default true,
  nota          text,
  creado_por    uuid references auth.users(id),
  creado_en     timestamptz not null default now(),

  -- Un camión ajeno sin dueño no se le puede reclamar a nadie.
  constraint vehiculo_ajeno_lleva_transportista
    check (propio or nullif(trim(coalesce(transportista, '')), '') is not null),

  -- Y no se le lleva mantenimiento a un camión que no es de la empresa.
  constraint vehiculo_ajeno_sin_ficha
    check (propio or maquina_id is null)
);

comment on table public.vehiculos is
  'Vehículos que mueven material, propios y de transportistas. Existe sobre '
  'todo por la capacidad: sin ella cada despacho es un número escrito a mano '
  'que no se contrasta con nada.';

create index if not exists vehiculos_activos_idx
  on public.vehiculos (activo, tipo);

-- ---------------------------------------------------------------------------
-- La placa, normalizada al entrar
--
-- Se hace en la base y no en la pantalla porque la placa entra por tres sitios
-- distintos, y basta que uno de ellos se olvide para que el mismo camión salga
-- dos veces en cualquier reporte.
-- ---------------------------------------------------------------------------
create or replace function private.normalizar_placa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.placa := upper(regexp_replace(trim(new.placa), '\s+', '', 'g'));

  if length(new.placa) < 4 then
    raise exception 'La placa "%" es demasiado corta para identificar un vehículo.', new.placa
      using errcode = '22023';
  end if;

  -- Un camión propio no tiene transportista: lo maneja la empresa.
  if new.propio then
    new.transportista := null;
  else
    new.transportista := nullif(trim(new.transportista), '');
  end if;

  return new;
end;
$$;

drop trigger if exists vehiculos_normalizar on public.vehiculos;
create trigger vehiculos_normalizar
  before insert or update on public.vehiculos
  for each row execute function private.normalizar_placa();

-- ---------------------------------------------------------------------------
-- Enlazar los documentos ya existentes con el vehículo
--
-- POR QUÉ LA PLACA SIGUE GUARDÁNDOSE COMO TEXTO
--
-- No se reemplaza el campo `vehiculo` por la clave: se añade la clave al lado.
-- El texto es lo que se imprimió en el documento, y un documento emitido no
-- puede cambiar porque alguien corrija después la placa en el catálogo. La
-- clave sirve para contar; el texto, para responder por lo que se firmó.
--
-- POR QUÉ SE RESUELVE CON UN DISPARADOR Y NO CAMBIANDO LAS FUNCIONES
--
-- El pesaje, la guía y la nota de entrega se registran por tres funciones
-- distintas, cada una con su lista de parámetros y sus permisos. Cambiarles la
-- firma a las tres para pasar un dato que se puede deducir de la placa es
-- mover tres piezas delicadas para no ganar nada. El disparador busca la placa
-- en el catálogo y, si la encuentra, deja el enlace puesto.
-- ---------------------------------------------------------------------------
alter table public.romana_tickets
  add column if not exists vehiculo_id bigint references public.vehiculos(id);
alter table public.notas_entrega
  add column if not exists vehiculo_id bigint references public.vehiculos(id);
alter table public.guias_movilizacion
  add column if not exists vehiculo_id bigint references public.vehiculos(id);

create or replace function private.enlazar_vehiculo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_placa text := upper(regexp_replace(trim(coalesce(new.vehiculo, '')), '\s+', '', 'g'));
begin
  if new.vehiculo_id is null and v_placa <> '' then
    select v.id into new.vehiculo_id
    from public.vehiculos v
    where v.placa = v_placa;
  end if;

  return new;
end;
$$;

drop trigger if exists tickets_enlazar_vehiculo on public.romana_tickets;
create trigger tickets_enlazar_vehiculo
  before insert or update of vehiculo on public.romana_tickets
  for each row execute function private.enlazar_vehiculo();

drop trigger if exists notas_enlazar_vehiculo on public.notas_entrega;
create trigger notas_enlazar_vehiculo
  before insert or update of vehiculo on public.notas_entrega
  for each row execute function private.enlazar_vehiculo();

drop trigger if exists guias_enlazar_vehiculo on public.guias_movilizacion;
create trigger guias_enlazar_vehiculo
  before insert or update of vehiculo on public.guias_movilizacion
  for each row execute function private.enlazar_vehiculo();

-- ---------------------------------------------------------------------------
-- Quién puede verlos y tocarlos
--
-- Los lee cualquiera que trabaje en despachos, ventas o maquinaria: los tres
-- necesitan saber qué camión es cuál. Los edita quien lleva despachos, que es
-- quien conoce la flota que entra al patio.
-- ---------------------------------------------------------------------------
alter table public.vehiculos enable row level security;

drop policy if exists vehiculos_lectura on public.vehiculos;
create policy vehiculos_lectura on public.vehiculos
  for select to authenticated
  using (
    private.tiene_permiso('DESPACHOS', 'LECTURA')
    or private.tiene_permiso('VENTAS', 'LECTURA')
    or private.tiene_permiso('MAQUINARIA', 'LECTURA')
  );

drop policy if exists vehiculos_escritura on public.vehiculos;
create policy vehiculos_escritura on public.vehiculos
  for all to authenticated
  using (private.tiene_permiso('DESPACHOS', 'ESCRITURA'))
  with check (private.tiene_permiso('DESPACHOS', 'ESCRITURA'));

-- ---------------------------------------------------------------------------
-- La flota con su ficha de mantenimiento al lado
--
-- Un despachador que ve que el camión está pasado de tope puede mandarlo al
-- taller antes de cargarlo. Ese cruce es la razón de que `maquina_id` exista.
-- ---------------------------------------------------------------------------
create or replace view public.v_vehiculos
with (security_invoker = on) as
select
  v.id,
  v.placa,
  v.tipo,
  v.descripcion,
  v.capacidad_m3,
  v.capacidad_ton,
  v.propio,
  v.transportista,
  v.maquina_id,
  v.activo,
  v.nota,
  m.codigo   as maquina_codigo,
  m.nombre   as maquina,
  m.semaforo as semaforo_mantenimiento,
  m.horas_desde_mant,
  m.tope_horas
from public.vehiculos v
left join public.v_maquinaria m on m.id = v.maquina_id;

comment on view public.v_vehiculos is
  'La flota con el semáforo de mantenimiento de los camiones propios, para '
  'que quien despacha vea antes de cargar si el camión debería estar en el '
  'taller.';
