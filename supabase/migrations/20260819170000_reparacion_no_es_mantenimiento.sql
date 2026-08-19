-- ---------------------------------------------------------------------------
-- La reparación no es el mantenimiento
--
-- LA DISTINCIÓN QUE FALTABA
--
-- El módulo nació con dos tipos: MANTENIMIENTO, que reinicia el contador de
-- horas, y SERVICIO, que no lo toca. Los dos son preventivos — se hacen porque
-- toca, no porque algo se rompió.
--
-- La dirección de Sistemas avisa de que los dos talleres hacen otra cosa
-- distinta: reparan. Reparan lo que se dañó, y no solo máquinas de cantera —
-- también vehículos, plantas eléctricas y la planta de agua. Y quieren saber
-- cuándo fue la última reparación de cada cosa, que es una pregunta distinta
-- de cuándo le tocó el último mantenimiento.
--
-- POR QUÉ NO ES UNA TABLA NUEVA
--
-- Una reparación tiene la misma vida que un mantenimiento: el equipo entra al
-- taller, está unos días sin trabajar, se le ponen repuestos que salen del
-- almacén de ese taller, y sale. Todo eso ya está resuelto —el índice de una
-- sola orden abierta, el estado previo para poder revertir, el descuento al
-- costo promedio— y duplicarlo en otra tabla sería mantener dos veces la misma
-- lógica para que diverja a la primera corrección.
--
-- Lo único que cambia es lo que arrastra al cerrar, y eso ya dependía del
-- tipo: solo MANTENIMIENTO reinicia el contador. REPARACION entra en el mismo
-- sitio que SERVICIO — no lo toca, porque arreglar una correa rota no
-- adelanta el cambio de aceite.
-- ---------------------------------------------------------------------------
alter table public.mantenimientos drop constraint if exists mantenimientos_tipo_check;
alter table public.mantenimientos
  add constraint mantenimientos_tipo_check
    check (tipo in ('MANTENIMIENTO', 'SERVICIO', 'REPARACION'));

comment on column public.mantenimientos.tipo is
  'MANTENIMIENTO preventivo, reinicia el contador de horas al cerrar · '
  'SERVICIO rutina ligera, no lo toca · REPARACION algo se dañó, tampoco lo '
  'toca. Los tres pasan por el taller igual.';

-- ---------------------------------------------------------------------------
-- Cuándo fue la última reparación
--
-- Va al lado de `ultimo_mantenimiento` y no lo reemplaza: son dos preguntas y
-- se hacen por motivos distintos. Una dice si el equipo va al día con lo que
-- le toca; la otra, cada cuánto se está rompiendo — que es lo que termina
-- decidiendo si conviene seguir reparándolo.
-- ---------------------------------------------------------------------------
drop view if exists public.v_vehiculos;
drop view if exists public.v_maquinaria;

create view public.v_maquinaria
with (security_invoker = on) as
with ultimo_mant as (
  select distinct on (maquina_id)
         maquina_id, coalesce(fecha_salida, fecha) as fecha, horometro
    from public.mantenimientos
   where tipo = 'MANTENIMIENTO' and estado = 'CERRADO'
   order by maquina_id, coalesce(fecha_salida, fecha) desc, id desc
),
ultima_rep as (
  select maquina_id,
         max(coalesce(fecha_salida, fecha)) as fecha,
         count(*) as veces
    from public.mantenimientos
   where tipo = 'REPARACION' and estado = 'CERRADO'
   group by maquina_id
),
abierta as (
  select maquina_id, id, fecha, dias_estimados, taller_id, tipo
    from public.mantenimientos where estado = 'ABIERTO'
),
horas as (
  select m.id as maquina_id,
         coalesce(sum(h.horas) filter (where um.fecha is null or h.fecha > um.fecha), 0) as horas_desde_mant,
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
  a.nombre as almacen,
  a.tipo   as almacen_tipo,
  hs.horas_desde_mant, hs.horas_totales, hs.ultima_lectura, hs.horometro_actual,
  um.fecha as ultimo_mantenimiento,
  ur.fecha as ultima_reparacion,
  coalesce(ur.veces, 0) as reparaciones,
  greatest(m.tope_horas - hs.horas_desde_mant, 0) as horas_para_el_tope,
  ab.id        as mantenimiento_abierto_id,
  ab.tipo      as mantenimiento_abierto_tipo,
  ab.fecha     as mantenimiento_desde,
  ab.taller_id as mantenimiento_taller_id,
  case when ab.id is not null then current_date - ab.fecha end as dias_en_taller,
  case
    when ab.id is null or coalesce(ab.dias_estimados, m.dias_mantenimiento) is null then null
    else (current_date - ab.fecha) > coalesce(ab.dias_estimados, m.dias_mantenimiento)
  end as se_paso_en_el_taller,
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
left join ultima_rep ur on ur.maquina_id = m.id
left join abierta ab on ab.maquina_id = m.id
left join public.almacenes a on a.id = m.almacen_id;

comment on view public.v_maquinaria is
  'Cada equipo con sus horas desde el último mantenimiento, cuándo fue su '
  'última reparación y cuántas lleva, su semáforo, y la orden de taller que '
  'tenga abierta.';

create view public.v_vehiculos
with (security_invoker = on) as
select
  v.id, v.placa, v.tipo, v.descripcion, v.capacidad_m3, v.capacidad_ton,
  v.propio, v.transportista, v.maquina_id, v.activo, v.nota,
  m.codigo as maquina_codigo, m.nombre as maquina,
  m.semaforo as semaforo_mantenimiento, m.horas_desde_mant, m.tope_horas,
  m.ultima_reparacion, m.reparaciones
from public.vehiculos v
left join public.v_maquinaria m on m.id = v.maquina_id;

comment on view public.v_vehiculos is
  'La flota con el semáforo de mantenimiento y el historial de reparaciones '
  'de los camiones propios, para que quien despacha vea antes de cargar si el '
  'camión debería estar en el taller.';

-- ---------------------------------------------------------------------------
-- Las funciones aceptan el tipo nuevo
-- ---------------------------------------------------------------------------
create or replace function public.abrir_mantenimiento(
  p_maquina_id     bigint,
  p_tipo           text,
  p_motivo         text,
  p_taller_id      bigint   default null,
  p_fecha          date     default null,
  p_dias_estimados smallint default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $func$
declare
  v_maq   record;
  v_fecha date := coalesce(p_fecha, current_date);
  v_horas numeric;
  v_id    bigint;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  if p_tipo not in ('MANTENIMIENTO', 'SERVICIO', 'REPARACION') then
    raise exception 'El tipo tiene que ser MANTENIMIENTO, SERVICIO o REPARACION (recibido: %).', p_tipo
      using errcode = '22023';
  end if;

  select * into v_maq from public.maquinaria where id = p_maquina_id for update;
  if v_maq.id is null then
    raise exception 'No existe la máquina %.', p_maquina_id using errcode = 'P0002';
  end if;

  if v_maq.estado = 'EN_MANTENIMIENTO' then
    raise exception 'La máquina "%" ya está en el taller.', v_maq.nombre using errcode = '55000';
  end if;
  if v_maq.estado = 'DESINCORPORADA' then
    raise exception 'La máquina "%" está desincorporada: ya no es de la flota.', v_maq.nombre
      using errcode = '55000';
  end if;
  if v_fecha > current_date then
    raise exception 'No se puede meter una máquina al taller con fecha futura.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Hay que decir por qué entra al taller.' using errcode = '23514';
  end if;

  if p_taller_id is not null then
    perform 1 from public.almacenes where id = p_taller_id and tipo = 'TALLER';
    if not found then
      raise exception 'El almacén % no es un taller.', p_taller_id using errcode = '22023';
    end if;
  end if;

  select horas_desde_mant into v_horas from public.v_maquinaria where id = p_maquina_id;

  insert into public.mantenimientos
    (numero, maquina_id, fecha, tipo, estado, motivo, horometro, taller_id,
     estado_previo, dias_estimados, registrado_por)
  values
    (private.siguiente_numero('MTO'), p_maquina_id, v_fecha, p_tipo, 'ABIERTO',
     btrim(p_motivo), v_horas, p_taller_id, v_maq.estado,
     coalesce(p_dias_estimados, v_maq.dias_mantenimiento), (select auth.uid()))
  returning id into v_id;

  update public.maquinaria set estado = 'EN_MANTENIMIENTO' where id = p_maquina_id;

  perform private.notificar(
    'MAQUINARIA', 'MANTENIMIENTO_ABIERTO',
    format('%s entró al taller', v_maq.nombre),
    btrim(p_motivo), '/app/maquinaria', array['OPERACIONES','ALMACEN'],
    -- Una reparación es algo que se dañó: alguien lo está esperando de vuelta.
    case when p_tipo = 'REPARACION' then 'ATENCION' else 'INFO' end);

  return v_id;
end;
$func$;

comment on function public.abrir_mantenimiento is
  'Mete un equipo al taller —por mantenimiento, servicio o reparación— y lo '
  'deja EN_MANTENIMIENTO. El contador de horas no se toca hasta cerrar, y solo '
  'lo reinicia el mantenimiento.';
