-- ---------------------------------------------------------------------------
-- La hoja de vida de un vehículo
--
-- TRES PREGUNTAS QUE VIVÍAN EN TRES SITIOS
--
-- Qué le han hecho, qué ha hecho él, y quién lo maneja. Lo primero estaba en
-- Maquinaria, lo segundo repartido entre pesajes, despachos y guías, y lo
-- tercero en la cabeza de quien despacha. Un camión es una cosa sola.
--
-- EL CHOFER ES UN PERÍODO, NO UN CAMPO
--
-- Guardarlo como «el chofer de este camión» perdería el traspaso: el día que
-- cambia, el anterior desaparece y con él la respuesta a quién manejaba el
-- martes pasado — que es justo la pregunta que se hace cuando algo salió mal
-- en la carretera.
--
-- Por eso cada chofer es una fila con su desde y su hasta. Asignar uno nuevo
-- cierra el anterior el día antes, así que el historial no tiene huecos ni
-- solapes, y un índice único parcial impide que dos figuren manejando a la
-- vez.
-- ---------------------------------------------------------------------------
create table if not exists public.vehiculo_choferes (
  id           bigint generated always as identity primary key,
  vehiculo_id  bigint not null references public.vehiculos(id) on delete cascade,

  -- Cuando el chofer es de la casa. Los de un transportista no están en
  -- nómina, y para esos valen el nombre y la cédula sueltos.
  empleado_id  bigint references public.empleados(id),
  nombre       text,
  cedula       text,

  desde        date not null default current_date,
  hasta        date,

  motivo       text,
  nota         text,

  creada_por   uuid references auth.users(id),
  creada_en    timestamptz not null default now(),

  constraint chofer_tiene_nombre
    check (empleado_id is not null or length(btrim(coalesce(nombre, ''))) >= 3),
  constraint chofer_no_termina_antes_de_empezar
    check (hasta is null or hasta >= desde)
);

comment on table public.vehiculo_choferes is
  'Quién maneja cada vehículo y desde cuándo. Una fila por período: el '
  'traspaso cierra la anterior y abre otra, así que el historial queda solo.';

drop index if exists vehiculo_un_chofer_a_la_vez;
create unique index vehiculo_un_chofer_a_la_vez
  on public.vehiculo_choferes (vehiculo_id) where hasta is null;

create index if not exists vehiculo_choferes_idx
  on public.vehiculo_choferes (vehiculo_id, desde desc);

alter table public.vehiculo_choferes enable row level security;

drop policy if exists vehiculo_choferes_lectura on public.vehiculo_choferes;
create policy vehiculo_choferes_lectura on public.vehiculo_choferes
  for select to authenticated
  using (
    private.tiene_permiso('DESPACHOS', 'LECTURA')
    or private.tiene_permiso('MAQUINARIA', 'LECTURA')
    or private.tiene_permiso('NOMINA', 'LECTURA')
  );

revoke insert, update, delete on public.vehiculo_choferes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Asignar y traspasar
-- ---------------------------------------------------------------------------
create or replace function public.asignar_chofer(
  p_vehiculo_id bigint,
  p_empleado_id bigint default null,
  p_nombre      text default null,
  p_cedula      text default null,
  p_desde       date default null,
  p_motivo      text default null,
  p_nota        text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $func$
declare
  v_desde  date := coalesce(p_desde, current_date);
  v_actual record;
  v_veh    record;
  v_emp    record;
  v_id     bigint;
begin
  perform private.exigir_permiso('DESPACHOS', 'ESCRITURA');

  select * into v_veh from public.vehiculos where id = p_vehiculo_id for update;
  if v_veh.id is null then
    raise exception 'No existe el vehículo %.', p_vehiculo_id using errcode = 'P0002';
  end if;

  if p_empleado_id is null and length(btrim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'Hay que decir quién lo va a manejar.' using errcode = '23514';
  end if;

  if p_empleado_id is not null then
    select * into v_emp from public.empleados where id = p_empleado_id;
    if v_emp.id is null then
      raise exception 'No existe el empleado %.', p_empleado_id using errcode = '23503';
    end if;
    if not v_emp.activo then
      raise exception 'El empleado % ya no está activo.', v_emp.nombres using errcode = '55000';
    end if;
  end if;

  if v_desde > current_date then
    raise exception 'No se asigna un chofer con fecha futura.' using errcode = '22023';
  end if;

  -- El traspaso cierra el período anterior el día antes de empezar el nuevo.
  -- Si se cerrara el mismo día, dos choferes figurarían manejando a la vez.
  select * into v_actual
    from public.vehiculo_choferes
   where vehiculo_id = p_vehiculo_id and hasta is null
   for update;

  if v_actual.id is not null then
    if v_desde <= v_actual.desde then
      raise exception 'El chofer anterior empezó el %; el traspaso tiene que ser posterior.',
        to_char(v_actual.desde, 'DD/MM/YYYY') using errcode = '22023';
    end if;

    update public.vehiculo_choferes
       set hasta = v_desde - 1,
           motivo = coalesce(motivo, p_motivo)
     where id = v_actual.id;
  end if;

  insert into public.vehiculo_choferes
    (vehiculo_id, empleado_id, nombre, cedula, desde, motivo, nota, creada_por)
  values
    (p_vehiculo_id, p_empleado_id,
     case when p_empleado_id is null then btrim(p_nombre) end,
     nullif(btrim(coalesce(p_cedula, '')), ''),
     v_desde, nullif(btrim(coalesce(p_motivo, '')), ''),
     nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$func$;

create or replace function public.terminar_chofer(
  p_id     bigint,
  p_hasta  date default null,
  p_motivo text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $func$
declare
  v_fila  record;
  v_hasta date := coalesce(p_hasta, current_date);
begin
  perform private.exigir_permiso('DESPACHOS', 'ESCRITURA');

  select * into v_fila from public.vehiculo_choferes where id = p_id for update;
  if v_fila.id is null then
    raise exception 'No existe esa asignación de chofer.' using errcode = 'P0002';
  end if;
  if v_fila.hasta is not null then
    raise exception 'Esa asignación ya está cerrada.' using errcode = '55000';
  end if;
  if v_hasta < v_fila.desde then
    raise exception 'No puede terminar antes de empezar.' using errcode = '22023';
  end if;

  update public.vehiculo_choferes
     set hasta = v_hasta,
         motivo = coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), motivo)
   where id = p_id;

  return p_id;
end;
$func$;

revoke execute on function public.asignar_chofer(bigint, bigint, text, text, date, text, text)
  from public, anon;
grant execute on function public.asignar_chofer(bigint, bigint, text, text, date, text, text)
  to authenticated;

revoke execute on function public.terminar_chofer(bigint, date, text) from public, anon;
grant execute on function public.terminar_chofer(bigint, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Las vistas
-- ---------------------------------------------------------------------------
create or replace view public.v_vehiculo_choferes
with (security_invoker = on) as
select
  vc.id,
  vc.vehiculo_id,
  v.placa,
  vc.empleado_id,
  coalesce(nullif(btrim(concat_ws(' ', e.nombres, e.apellidos)), ''), vc.nombre) as chofer,
  coalesce(e.cedula, vc.cedula)       as cedula,
  e.cargo,
  vc.empleado_id is not null          as es_de_la_casa,
  vc.desde,
  vc.hasta,
  vc.hasta is null                    as vigente,
  coalesce(vc.hasta, current_date) - vc.desde + 1 as dias,
  vc.motivo,
  vc.nota,
  vc.creada_en
from public.vehiculo_choferes vc
join public.vehiculos v on v.id = vc.vehiculo_id
left join public.empleados e on e.id = vc.empleado_id;

comment on view public.v_vehiculo_choferes is
  'Quién ha manejado cada vehículo y cuándo. El nombre sale de la nómina '
  'cuando el chofer es de la casa, y del texto cuando es de un transportista.';

-- `v_vehiculos` gana columnas en medio, así que hay que soltarla antes.
drop view if exists public.v_vehiculos;

create view public.v_vehiculos
with (security_invoker = on) as
select
  v.id, v.placa, v.tipo, v.descripcion, v.capacidad_m3, v.capacidad_ton,
  v.propio, v.transportista, v.maquina_id, v.activo, v.nota,
  m.codigo   as maquina_codigo,
  m.nombre   as maquina,
  m.semaforo as semaforo_mantenimiento,
  m.horas_desde_mant,
  m.tope_horas,
  ch.chofer  as chofer_actual,
  ch.cedula  as cedula_chofer_actual,
  ch.desde   as chofer_desde,
  ch.id      as asignacion_chofer_id
from public.vehiculos v
left join public.v_maquinaria m on m.id = v.maquina_id
left join public.v_vehiculo_choferes ch on ch.vehiculo_id = v.id and ch.vigente;

comment on view public.v_vehiculos is
  'La flota, con el semáforo de mantenimiento de los camiones propios y quién '
  'maneja cada uno hoy.';

-- ---------------------------------------------------------------------------
-- Lo que ha hecho un vehículo
--
-- Un pesaje, un despacho, una guía y un paso por el taller son cuatro tablas
-- distintas y la misma pregunta. Se unen aquí para que la ficha no tenga que
-- hacer cuatro consultas y ordenarlas a mano.
--
-- Los tres primeros cuelgan de `vehiculo_id`, que resuelve un disparador a
-- partir de la placa. El mantenimiento cuelga de la máquina, y solo lo tienen
-- los camiones propios: los de un transportista no los mantenemos nosotros.
-- ---------------------------------------------------------------------------
create or replace view public.v_vehiculo_actividad
with (security_invoker = on) as
select
  t.vehiculo_id,
  'PESAJE'  as tipo,
  t.fecha,
  t.numero,
  concat_ws(' · ', t.tipo, coalesce(c.nombre, p.nombre)) as detalle,
  t.peso_neto as cantidad,
  'KG'      as unidad,
  t.estado
from public.romana_tickets t
left join public.clientes c    on c.id = t.cliente_id
left join public.proveedores p on p.id = t.proveedor_id
where t.vehiculo_id is not null

union all

select n.vehiculo_id, 'DESPACHO', n.fecha, n.numero, c.nombre, n.total_usd, 'USD', n.estado
from public.notas_entrega n
left join public.clientes c on c.id = n.cliente_id
where n.vehiculo_id is not null

union all

select g.vehiculo_id, 'GUIA', g.fecha_emision, g.numero_guia,
       concat_ws(' · ', a.nombre, g.destino), g.cantidad, g.unidad, g.estado
from public.guias_movilizacion g
left join public.articulos a on a.id = g.articulo_id
where g.vehiculo_id is not null

union all

select v.id, 'TALLER', mt.fecha, mt.numero,
       concat_ws(' · ', mt.tipo, coalesce(mt.detalle, mt.motivo)),
       mt.costo_total_usd, 'USD', mt.estado
from public.v_mantenimientos mt
join public.vehiculos v on v.maquina_id = mt.maquina_id;

comment on view public.v_vehiculo_actividad is
  'Todo lo que ha hecho un vehículo —pesajes, despachos, guías y pasos por el '
  'taller— en una sola línea de tiempo.';
