-- ---------------------------------------------------------------------------
-- Lo que salió del informe de salud de la base
--
-- El carril de base de datos hizo un barrido (docs/salud-de-la-base.md) y
-- encontró cosas que se arreglan aquí. Van juntas porque son todas del mismo
-- tipo: no falta funcionalidad, falta que lo que ya hay diga la verdad.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. `maquinaria.activa` era una columna muerta que contradecía al estado
--
-- Quedó de la primera versión, cuando una máquina estaba activa o no lo
-- estaba. Después llegó `estado` con sus cinco valores y nadie la quitó:
-- ninguna función la escribe —ni `guardar_maquina` ni
-- `cambiar_estado_maquina`— pero el front seguía filtrando por ella.
--
-- El resultado era un bug con consecuencia visible: desincorporar una máquina
-- la dejaba en la lista, porque `activa` seguía en `true` para siempre.
--
-- Se borra en vez de sincronizarla. Dos columnas que dicen lo mismo vuelven a
-- separarse en cuanto alguien escriba una y olvide la otra; el estado ya
-- responde la pregunta, y «está en la flota» es «su estado no es
-- DESINCORPORADA».
-- ---------------------------------------------------------------------------

-- Las vistas van primero: `v_maquinaria` hace `select m.*` y arrastraría la
-- columna, y `v_vehiculos` cuelga de ella.
drop view if exists public.v_vehiculos;
drop view if exists public.v_maquinaria;

alter table public.maquinaria drop column if exists activa;

create view public.v_maquinaria
with (security_invoker = on) as
with ultimo_mant as (
  select distinct on (maquina_id)
         maquina_id,
         coalesce(fecha_salida, fecha) as fecha,
         horometro
    from public.mantenimientos
   where tipo = 'MANTENIMIENTO'
     and estado = 'CERRADO'
   order by maquina_id, coalesce(fecha_salida, fecha) desc, id desc
),
abierta as (
  select maquina_id, id, fecha, dias_estimados, taller_id
    from public.mantenimientos
   where estado = 'ABIERTO'
),
horas as (
  select m.id as maquina_id,
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
  ab.id        as mantenimiento_abierto_id,
  ab.fecha     as mantenimiento_desde,
  ab.taller_id as mantenimiento_taller_id,
  case when ab.id is not null then current_date - ab.fecha end as dias_en_taller,
  case
    when ab.id is null or coalesce(ab.dias_estimados, m.dias_mantenimiento) is null then null
    else (current_date - ab.fecha) > coalesce(ab.dias_estimados, m.dias_mantenimiento)
  end as se_paso_en_el_taller,

  -- Sustituye a la columna borrada. Se calcula del estado, así que no puede
  -- volver a contradecirlo.
  (m.estado <> 'DESINCORPORADA') as en_la_flota,

  case
    when hs.horas_desde_mant >= m.tope_horas   then 'BLOQUEANTE'
    when hs.horas_desde_mant >= m.alarma_horas then 'ALARMA'
    when hs.horas_desde_mant >= m.aviso_horas  then 'AVISO'
    else 'OK'
  end as semaforo
from public.maquinaria m
left join horas hs on hs.maquina_id = m.id
left join ultimo_mant um on um.maquina_id = m.id
left join abierta ab on ab.maquina_id = m.id
left join public.almacenes a on a.id = m.almacen_id;

comment on view public.v_maquinaria is
  'Cada máquina con sus horas desde el último mantenimiento cerrado, su '
  'semáforo, y la orden de taller que tenga abierta. `en_la_flota` sale del '
  'estado: antes era una columna aparte que se quedaba en true para siempre.';

create view public.v_vehiculos
with (security_invoker = on) as
select
  v.id, v.placa, v.tipo, v.descripcion, v.capacidad_m3, v.capacidad_ton,
  v.propio, v.transportista, v.maquina_id, v.activo, v.nota,
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

-- ---------------------------------------------------------------------------
-- 2. La política que abría el libro de inventario a todo el mundo
--
-- `inventario_movimientos` tenía dos políticas de SELECT. Las políticas se
-- suman con OR, así que la que decía `using (true)` anulaba por completo a la
-- que comprobaba el permiso de INVENTARIO.
--
-- En la práctica: un usuario con rol SOLICITANTE o VENTAS —que no tiene por
-- qué ver el inventario— leía el libro de movimientos entero, con los costos
-- en dólares de cada entrada.
-- ---------------------------------------------------------------------------
drop policy if exists movimientos_lectura on public.inventario_movimientos;

-- ---------------------------------------------------------------------------
-- 3. `anon` conservaba escritura sobre tres tablas
--
-- `empresa`, `empresa_documentos` y `tipos_documento_legal`. Hoy no se puede
-- escribir porque la RLS solo tiene política de SELECT, pero eso es depender
-- de la segunda cerradura teniendo la primera abierta. El patrón de la casa es
-- revocar el GRANT.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.empresa               from anon, authenticated;
revoke insert, update, delete on public.empresa_documentos    from anon, authenticated;
revoke insert, update, delete on public.tipos_documento_legal from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. La única función de disparador que vivía en `public`
--
-- `tasas_cambio_inmutables` era la única ejecutable por `anon`, la única de su
-- clase fuera de `private` y la única sin `search_path` fijo. No hacía daño
-- —solo lanza una excepción, no toca ninguna tabla— pero era la excepción que
-- obliga a mirar dos veces cada vez que alguien audita la lista.
-- ---------------------------------------------------------------------------
create or replace function private.tasas_cambio_inmutables()
returns trigger
language plpgsql
security definer
set search_path = ''
as $func$
begin
  raise exception 'Las tasas de cambio no se modifican ni se borran (operación: %). Inserte una tasa nueva.', TG_OP
    using errcode = 'restrict_violation';
end;
$func$;

drop trigger if exists trg_tasas_cambio_inmutables on public.tasas_cambio;
create trigger trg_tasas_cambio_inmutables
  before update or delete on public.tasas_cambio
  for each row execute function private.tasas_cambio_inmutables();

drop function if exists public.tasas_cambio_inmutables();

-- ---------------------------------------------------------------------------
-- 5. Los almacenes de verdad
--
-- Había uno solo en toda la base, de tipo ALMACEN. Ni talleres ni patio, y sin
-- un taller `abrir_mantenimiento` no deja meter una máquina: exige que el
-- almacén sea de tipo TALLER. La pantalla de Talleres tampoco tenía de dónde
-- sacar filas. No faltaba esquema, faltaban los datos de arranque.
--
-- Los nombres y la división salen de lo que informó la dirección de Sistemas:
-- un inventario general repartido en almacenes, y dos talleres de reparación
-- con su propio stock de herramientas.
--
-- El de materia prima se crea como PATIO y no como ALMACEN: lo que guarda es
-- material a granel que entra por producción, no piezas que se cuentan.
-- ---------------------------------------------------------------------------
insert into public.almacenes (codigo, nombre, tipo, ubicacion, recibe_compras) values
  ('TAL-PRI',  'Taller de Reparación Primaria',      'TALLER',   'Planta primaria', false),
  ('TAL-FIJ',  'Taller de Reparación de Planta Fija','TALLER',   'Planta fija',     false),
  ('PAT-MP',   'Patio de materia prima',             'PATIO',    'Frente',          false),
  ('ALM-REP',  'Repuestos, insumos y consumibles',   'ALMACEN',  null,              true),
  ('ALM-TOR',  'Tornillería',                        'ALMACEN',  null,              true),
  ('ALM-OFI',  'Artículos de oficina',               'ALMACEN',  null,              true),
  ('ALM-COM',  'Artículos de computación',           'ALMACEN',  null,              false),
  ('ALM-ALI',  'Alimentación',                       'ALMACEN',  null,              true),
  ('ALM-BIE',  'Bienes e inmuebles',                 'ALMACEN',  null,              false)
on conflict (codigo) do update
  set nombre = excluded.nombre,
      tipo   = excluded.tipo,
      ubicacion = excluded.ubicacion;

comment on table public.almacenes is
  'Los sitios donde vive el inventario. Es uno solo repartido: patio para el '
  'material a granel, almacenes por familia de artículo, y talleres, que '
  'además de guardar sus herramientas reparan.';

-- ---------------------------------------------------------------------------
-- 6. Tiempo real en las tablas del módulo nuevo
--
-- Quedaron fuera de la publicación, así que quien despacha no se entera de que
-- el taller cerró una orden hasta recargar la pantalla. En un módulo cuyo
-- sentido es avisar a tiempo, eso es más que un detalle.
-- ---------------------------------------------------------------------------
do $$
declare
  v_tabla text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'No existe la publicación supabase_realtime: se omite.';
    return;
  end if;

  foreach v_tabla in array array[
    'maquinaria', 'mantenimientos', 'mantenimiento_repuestos',
    'horometro_lecturas', 'vehiculos', 'metodos_pago'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_tabla
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_tabla);
    end if;
  end loop;
end
$$;
