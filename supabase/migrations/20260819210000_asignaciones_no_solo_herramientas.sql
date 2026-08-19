-- ---------------------------------------------------------------------------
-- Se asignan bienes, no solo herramientas — y se dañan, no solo se pierden
--
-- DOS COSAS QUE EL PRIMER DISEÑO DIO POR SENTADAS
--
-- La primera: que lo asignado era una herramienta. No lo es. Una silla de
-- oficina, un teléfono, una computadora — todo eso está en el inventario, todo
-- se le entrega a alguien y de todo hay que saber quién lo tiene. Los almacenes
-- que se cargaron lo dicen solos: bienes e inmuebles, artículos de oficina,
-- artículos de computación.
--
-- La segunda: que lo único que podía pasar era perderlo. Una silla no se
-- pierde, se rompe. Y romperse no es lo mismo que perderse en un punto que
-- importa: la silla sigue estando. Puede ir al taller y volver, o puede no
-- tener arreglo.
--
-- POR ESO LA BAJA DE INVENTARIO SE PREGUNTA, NO SE DEDUCE
--
-- Antes reportar una pérdida descontaba siempre, y estaba bien mientras lo
-- perdido fuera una llave: si no está, no está. Con un daño ya no vale — la
-- silla rota sigue en el edificio, y darla de baja porque se le partió una
-- pata deja el inventario diciendo que no existe algo que se puede ver.
--
-- Así que quien reporta dice si el bien sale del inventario o no. Sale cuando
-- no hay nada que recuperar; se queda cuando lo hay.
-- ---------------------------------------------------------------------------

alter table public.asignaciones_herramienta
  drop constraint if exists asignaciones_herramienta_estado_check;
alter table public.asignaciones_herramienta
  add constraint asignaciones_herramienta_estado_check check (estado in (
    'ASIGNADA',  -- la tiene la persona
    'DEVUELTA',  -- volvió
    'PERDIDA',   -- no aparece
    'DANADA',    -- apareció rota
    'REPUESTA'   -- hubo incidencia y ya se resolvió
  ));

comment on column public.asignaciones_herramienta.estado is
  'ASIGNADA en sus manos · DEVUELTA volvió · PERDIDA no aparece · DANADA '
  'apareció rota · REPUESTA hubo incidencia y ya se resolvió.';

-- Las dos restricciones hablaban solo de la pérdida.
alter table public.asignaciones_herramienta
  drop constraint if exists asignacion_perdida_con_motivo;
alter table public.asignaciones_herramienta
  add constraint asignacion_incidencia_con_motivo check (
    estado not in ('PERDIDA', 'DANADA', 'REPUESTA')
    or (fecha_perdida is not null and length(btrim(coalesce(motivo, ''))) >= 4)
  );

comment on column public.asignaciones_herramienta.fecha_perdida is
  'El día que se reportó la incidencia, sea pérdida o daño.';

-- Si el bien salió del inventario o sigue estando. Nula mientras no haya
-- incidencia.
alter table public.asignaciones_herramienta
  add column if not exists dado_de_baja boolean;

comment on column public.asignaciones_herramienta.dado_de_baja is
  'Si la incidencia sacó el bien del inventario. Una llave perdida sí; una '
  'silla rota que se puede arreglar, no.';

-- ---------------------------------------------------------------------------
-- Reportar lo que pasó
--
-- Reemplaza a `reportar_perdida_herramienta`, que solo sabía de pérdidas y
-- descontaba siempre. Se deja la vieja como envoltura para no romper nada que
-- todavía la llame.
-- ---------------------------------------------------------------------------
create or replace function public.reportar_incidencia_asignacion(
  p_id       bigint,
  p_tipo     text,               -- PERDIDA o DANO
  p_motivo   text,
  p_de_baja  boolean default null,
  p_fecha    date    default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $func$
declare
  v_a      record;
  v_fecha  date := coalesce(p_fecha, current_date);
  v_art    record;
  v_emp    record;
  v_costo  numeric;
  v_mov    bigint;
  v_baja   boolean;
  v_estado text;
begin
  perform private.exigir_permiso('ASIGNACIONES', 'ESCRITURA');

  if p_tipo not in ('PERDIDA', 'DANO') then
    raise exception 'La incidencia es una pérdida o un daño (recibido: %).', p_tipo
      using errcode = '22023';
  end if;

  select * into v_a from public.asignaciones_herramienta where id = p_id for update;
  if v_a.id is null then
    raise exception 'No existe la asignación %.', p_id using errcode = 'P0002';
  end if;
  if v_a.estado <> 'ASIGNADA' then
    raise exception 'Esa asignación está %.', lower(v_a.estado) using errcode = '55000';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Hay que decir qué pasó.' using errcode = '23514';
  end if;
  if v_fecha < v_a.fecha_entrega then
    raise exception 'No pudo pasar antes de haberse entregado.' using errcode = '22023';
  end if;
  if v_fecha > current_date then
    raise exception 'No se reporta algo que todavía no ha pasado.' using errcode = '22023';
  end if;

  -- Lo perdido sale del inventario salvo que digan lo contrario; lo dañado se
  -- queda salvo que digan lo contrario. Es lo que pasa la mayoría de las veces
  -- en cada caso, y quien reporta puede cambiarlo.
  v_baja   := coalesce(p_de_baja, p_tipo = 'PERDIDA');
  v_estado := case when p_tipo = 'PERDIDA' then 'PERDIDA' else 'DANADA' end;

  select * into v_art from public.articulos where id = v_a.articulo_id;
  select * into v_emp from public.empleados where id = v_a.empleado_id;

  if v_baja then
    v_costo := private.costo_promedio(v_a.almacen_id, v_a.articulo_id) * v_a.cantidad;

    v_mov := private.registrar_movimiento(
      'SALIDA_MERMA', -1, v_a.almacen_id, v_a.articulo_id, v_a.cantidad, v_costo,
      format('%s · %s · %s',
             case when p_tipo = 'PERDIDA' then 'Bien perdido' else 'Bien dañado' end,
             coalesce(v_a.numero, p_id::text),
             v_emp.nombres || ' ' || v_emp.apellidos),
      null, null, null, v_fecha);
  else
    -- Sin baja no hay merma, pero sí hace falta saber lo que vale para poder
    -- discutir la reposición.
    v_costo := private.costo_promedio(v_a.almacen_id, v_a.articulo_id) * v_a.cantidad;
    v_mov   := null;
  end if;

  update public.asignaciones_herramienta
     set estado        = v_estado,
         fecha_perdida = v_fecha,
         motivo        = btrim(p_motivo),
         costo_usd     = v_costo,
         movimiento_id = v_mov,
         dado_de_baja  = v_baja
   where id = p_id;

  perform private.notificar(
    'ASIGNACIONES',
    case when p_tipo = 'PERDIDA' then 'BIEN_PERDIDO' else 'BIEN_DANADO' end,
    format('%s reportó %s de %s',
           v_emp.nombres || ' ' || v_emp.apellidos,
           case when p_tipo = 'PERDIDA' then 'la pérdida' else 'un daño en' end,
           v_art.nombre),
    case when v_baja
         then format('Salió del inventario. Queda pendiente de resolver: %s.', btrim(p_motivo))
         else format('Sigue en el inventario. Queda pendiente de resolver: %s.', btrim(p_motivo))
    end,
    '/app/asignaciones/incidencias', array['RRHH','ADMIN','ALMACEN'], 'ATENCION');

  return p_id;
end;
$func$;

comment on function public.reportar_incidencia_asignacion is
  'Reporta que un bien asignado se perdió o se dañó. Da de baja el inventario '
  'solo cuando no queda nada que recuperar, y deja el caso a nombre de quien '
  'lo tenía.';

-- La firma vieja, por si algo la llama todavía. Una pérdida siempre daba de
-- baja, así que se traduce con `p_de_baja => true` y sale el mismo resultado.
create or replace function public.reportar_perdida_herramienta(
  p_id bigint, p_motivo text, p_fecha date default null
)
returns bigint
language sql
volatile
security definer
set search_path = ''
as $func$
  select public.reportar_incidencia_asignacion(p_id, 'PERDIDA', p_motivo, true, p_fecha);
$func$;

-- ---------------------------------------------------------------------------
-- Saldar deja de exigir permiso de nómina
--
-- Se le puso porque el caso que se tenía en la cabeza era descontarle a alguien
-- una herramienta. Pero una silla rota por accidente la resuelve quien
-- administra, no quien paga, y con el permiso de nómina puesto el almacenista
-- no podía cerrar ni los casos que le tocan.
--
-- Queda el del propio módulo, que es el que corresponde: quien puede entregar
-- y recibir puede también cerrar lo que pasó con lo entregado.
-- ---------------------------------------------------------------------------
create or replace function public.saldar_herramienta_perdida(
  p_id bigint, p_como text, p_fecha date default null, p_nota text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $func$
declare v_a record;
begin
  perform private.exigir_permiso('ASIGNACIONES', 'ESCRITURA');

  if p_como not in ('DESCUENTO', 'REPOSICION', 'EXONERADO') then
    raise exception 'Se salda con un descuento, una reposición o una exoneración.'
      using errcode = '22023';
  end if;

  select * into v_a from public.asignaciones_herramienta where id = p_id for update;
  if v_a.id is null then
    raise exception 'No existe la asignación %.', p_id using errcode = 'P0002';
  end if;
  if v_a.estado not in ('PERDIDA', 'DANADA') then
    raise exception 'Esa asignación está %: solo se cierra lo que tuvo una incidencia.',
      lower(v_a.estado) using errcode = '55000';
  end if;

  update public.asignaciones_herramienta
     set estado = 'REPUESTA', saldado_como = p_como,
         saldado_el = coalesce(p_fecha, current_date),
         nota = coalesce(nullif(btrim(coalesce(p_nota, '')), ''), nota)
   where id = p_id;

  return p_id;
end;
$func$;

-- ---------------------------------------------------------------------------
-- Las vistas dejan de hablar solo de herramientas
-- ---------------------------------------------------------------------------
-- Se sueltan antes de rehacerlas: `create or replace view` solo deja añadir
-- columnas al final y `categoria` entra en medio. La de pendientes cuelga de
-- la otra, así que cae con ella y se vuelve a crear debajo.
drop view if exists public.v_herramientas_por_cobrar;
drop view if exists public.v_asignaciones_herramienta;

create view public.v_asignaciones_herramienta
with (security_invoker = on) as
select
  a.id, a.numero, a.estado,
  a.articulo_id, ar.codigo as articulo_codigo, ar.nombre as articulo,
  ar.categoria, ar.unidad,
  a.almacen_id, al.nombre as almacen,
  a.empleado_id, em.ficha, em.cedula,
  em.nombres || ' ' || em.apellidos as empleado,
  em.cargo, em.departamento, em.fecha_egreso,
  a.cantidad, a.fecha_entrega, a.fecha_devolucion, a.fecha_perdida,
  a.motivo, a.nota, a.costo_usd, a.dado_de_baja,
  a.saldado_como, a.saldado_el,
  current_date - a.fecha_entrega as dias_fuera
from public.asignaciones_herramienta a
join public.articulos ar on ar.id = a.articulo_id
join public.almacenes al on al.id = a.almacen_id
join public.empleados em on em.id = a.empleado_id;

comment on view public.v_asignaciones_herramienta is
  'Quién tiene qué bien, desde cuándo, y qué pasó con él.';

-- Lo pendiente de resolver, por trabajador. Ya no son solo pérdidas.
create view public.v_herramientas_por_cobrar
with (security_invoker = on) as
select
  a.empleado_id, a.ficha, a.cedula, a.empleado, a.cargo, a.departamento,
  count(*)                      as herramientas,
  sum(coalesce(a.costo_usd, 0)) as costo_usd,
  min(a.fecha_perdida)          as desde,
  string_agg(a.articulo || ' (' || a.cantidad || ')', ', ' order by a.fecha_perdida) as detalle
from public.v_asignaciones_herramienta a
where a.estado in ('PERDIDA', 'DANADA')
group by a.empleado_id, a.ficha, a.cedula, a.empleado, a.cargo, a.departamento;

comment on view public.v_herramientas_por_cobrar is
  'Bienes perdidos o dañados y todavía sin resolver, por trabajador.';

-- La vista de existencias asignadas ya no filtra por categoría en la base: lo
-- decide quien la consulta. Una silla se asigna igual que una llave.
comment on view public.v_herramientas is
  'Existencia, cuántas unidades están asignadas y cuántas quedan libres, para '
  'cualquier artículo — herramienta, silla o computadora.';

revoke execute on function public.reportar_incidencia_asignacion(bigint, text, text, boolean, date)
  from public, anon;
grant execute on function public.reportar_incidencia_asignacion(bigint, text, text, boolean, date)
  to authenticated;
