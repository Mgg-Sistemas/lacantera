-- ---------------------------------------------------------------------------
-- Las herramientas se asignan a una persona, no se consumen
--
-- LO QUE PIDIERON Y POR QUÉ NO ES UNA SALIDA DE ALMACÉN
--
-- «Digitalizar la entrega de herramientas, que cada asignación quede vinculada
-- a un colaborador para asegurar la trazabilidad y la responsabilidad
-- individual en caso de incidencias.»
--
-- Un saco de cemento sale del almacén y ya no vuelve: eso es un consumo. Una
-- llave sale del taller, está en manos de alguien, y vuelve. Registrarla como
-- salida dejaría el taller diciendo que no la tiene cuando sí la tiene — solo
-- que no en el estante.
--
-- Por eso asignar NO mueve el inventario. Las tres llaves siguen siendo tres.
-- Lo que cambia es cuántas están disponibles para prestar, que es un número
-- distinto y por eso hay una vista que lo calcula.
--
-- LA PÉRDIDA SÍ MUEVE EL INVENTARIO, Y ADEMÁS QUEDA A NOMBRE DE ALGUIEN
--
-- Cuando una se pierde pasan dos cosas a la vez, y las dos hacen falta:
--
--   La existencia baja de verdad. Si había tres y se perdió una, quedan dos, y
--   eso tiene que verse en Existencias como en cualquier merma — si no, el
--   inventario miente y el día del conteo no cuadra.
--
--   La asignación NO se cierra: queda «perdida», con su responsable, su fecha
--   y lo que costaba. Es lo que permite que alguien la reponga, y lo que ve
--   quien procesa la nómina de ese período.
--
-- Cerrarla al perderla —o borrarla— sería quedarse con la merma y sin el
-- responsable, que es exactamente lo contrario de lo que se pidió.
-- ---------------------------------------------------------------------------

create table if not exists public.asignaciones_herramienta (
  id           bigint generated always as identity primary key,
  numero       text unique,

  articulo_id  bigint not null references public.articulos(id),
  -- De dónde salió. Casi siempre un taller, pero no se exige: una herramienta
  -- puede vivir en el almacén general y prestarse igual.
  almacen_id   bigint not null references public.almacenes(id),
  empleado_id  bigint not null references public.empleados(id),

  cantidad     numeric(20,4) not null check (cantidad > 0),

  estado       text not null default 'ASIGNADA' check (estado in (
                 'ASIGNADA',  -- la tiene la persona
                 'DEVUELTA',  -- volvió al almacén
                 'PERDIDA',   -- no volvió: descontada y pendiente de reponer
                 'REPUESTA'   -- se perdió y ya se saldó
               )),

  fecha_entrega   date not null default current_date,
  fecha_devolucion date,
  fecha_perdida   date,

  -- Qué pasó. Obligatorio al reportar una pérdida: dentro de tres meses es lo
  -- único que dirá si fue un descuido o un accidente de trabajo.
  motivo       text,
  nota         text,

  -- Lo que costaba cuando se perdió, al costo promedio de ese almacén. Se
  -- congela aquí y no se recalcula: el precio de reposición se discute sobre
  -- lo que valía el día que pasó, no sobre lo que vale hoy.
  costo_usd    numeric(20,6),
  -- La merma que se registró. Ata las dos versiones de la historia.
  movimiento_id bigint references public.inventario_movimientos(id),

  -- Cómo se saldó: descuento en nómina, reposición física, o se le perdonó.
  saldado_como text check (saldado_como in ('DESCUENTO', 'REPOSICION', 'EXONERADO')),
  saldado_el   date,

  entregado_por uuid references auth.users(id),
  creado_en    timestamptz not null default now(),

  constraint asignacion_perdida_con_motivo check (
    estado not in ('PERDIDA', 'REPUESTA')
    or (fecha_perdida is not null and length(btrim(coalesce(motivo, ''))) >= 4)
  ),
  constraint asignacion_devuelta_con_fecha check (
    estado <> 'DEVUELTA' or fecha_devolucion is not null
  ),
  constraint asignacion_repuesta_dice_como check (
    estado <> 'REPUESTA' or (saldado_como is not null and saldado_el is not null)
  )
);

create index if not exists asignaciones_por_empleado_idx
  on public.asignaciones_herramienta (empleado_id, estado);
create index if not exists asignaciones_abiertas_idx
  on public.asignaciones_herramienta (articulo_id, almacen_id)
  where estado = 'ASIGNADA';

comment on table public.asignaciones_herramienta is
  'Herramientas en manos de alguien. Asignar no mueve el inventario —la '
  'herramienta sigue siendo de la empresa—; perderla sí, y deja el registro a '
  'nombre del responsable.';

-- ---------------------------------------------------------------------------
-- Cuántas hay y cuántas quedan libres
--
-- La existencia dice cuántas tiene la empresa. Esta vista dice cuántas se
-- pueden prestar, que es lo que necesita saber quien está en el mostrador del
-- taller. Sin ella, con tres llaves y tres asignadas el sistema seguiría
-- diciendo «hay 3».
-- ---------------------------------------------------------------------------
create or replace view public.v_herramientas
with (security_invoker = on) as
select
  e.almacen_id,
  e.almacen,
  e.almacen_codigo,
  e.articulo_id,
  e.articulo_codigo,
  e.articulo,
  e.categoria,
  e.unidad,
  e.existencia,
  e.costo_promedio_usd,
  coalesce(a.asignadas, 0)                       as asignadas,
  e.existencia - coalesce(a.asignadas, 0)        as disponibles,
  coalesce(a.personas, 0)                        as personas
from public.v_existencias e
left join (
  select articulo_id, almacen_id,
         sum(cantidad)               as asignadas,
         count(distinct empleado_id) as personas
    from public.asignaciones_herramienta
   where estado = 'ASIGNADA'
   group by articulo_id, almacen_id
) a on a.articulo_id = e.articulo_id and a.almacen_id = e.almacen_id;

comment on view public.v_herramientas is
  'Existencia, cuántas están prestadas y cuántas quedan libres. La existencia '
  'sola no sirve en el mostrador: con tres llaves y tres asignadas seguiría '
  'diciendo que hay tres.';

-- ---------------------------------------------------------------------------
-- Quién tiene qué
-- ---------------------------------------------------------------------------
create or replace view public.v_asignaciones_herramienta
with (security_invoker = on) as
select
  a.id,
  a.numero,
  a.estado,
  a.articulo_id,
  ar.codigo  as articulo_codigo,
  ar.nombre  as articulo,
  ar.unidad,
  a.almacen_id,
  al.nombre  as almacen,
  a.empleado_id,
  em.ficha,
  em.cedula,
  em.nombres || ' ' || em.apellidos as empleado,
  em.cargo,
  em.departamento,
  em.fecha_egreso,
  a.cantidad,
  a.fecha_entrega,
  a.fecha_devolucion,
  a.fecha_perdida,
  a.motivo,
  a.nota,
  a.costo_usd,
  a.saldado_como,
  a.saldado_el,
  current_date - a.fecha_entrega as dias_fuera
from public.asignaciones_herramienta a
join public.articulos ar on ar.id = a.articulo_id
join public.almacenes al on al.id = a.almacen_id
join public.empleados em on em.id = a.empleado_id;

comment on view public.v_asignaciones_herramienta is
  'Quién tiene qué herramienta, desde cuándo, y qué pasó con ella.';

-- ---------------------------------------------------------------------------
-- Lo que tiene que ver quien procesa la nómina
--
-- POR QUÉ NO SE ESCRIBE EN `nomina_novedades`
--
-- Sería lo obvio y sería frágil. Esa tabla cuelga de un período, y una
-- herramienta se pierde cualquier día — puede que antes de que el período
-- exista, o después de cerrado. Escribir ahí obligaría a adivinar a qué
-- período va, y a fusionar con la fila que el analista ya haya cargado.
--
-- La nómina lee esta vista. Mientras la pérdida no se salde, aparece; cuando
-- se salda, deja de aparecer. Nadie tiene que acordarse de borrar nada.
-- ---------------------------------------------------------------------------
create or replace view public.v_herramientas_por_cobrar
with (security_invoker = on) as
select
  a.empleado_id,
  a.ficha,
  a.cedula,
  a.empleado,
  a.cargo,
  a.departamento,
  count(*)                        as herramientas,
  sum(coalesce(a.costo_usd, 0))   as costo_usd,
  min(a.fecha_perdida)            as desde,
  string_agg(a.articulo || ' (' || a.cantidad || ')', ', ' order by a.fecha_perdida)
                                  as detalle
from public.v_asignaciones_herramienta a
where a.estado = 'PERDIDA'
group by a.empleado_id, a.ficha, a.cedula, a.empleado, a.cargo, a.departamento;

comment on view public.v_herramientas_por_cobrar is
  'Herramientas perdidas y todavía sin saldar, por trabajador. Es la nota que '
  've quien procesa la nómina del período.';

-- ---------------------------------------------------------------------------
-- Entregar
-- ---------------------------------------------------------------------------
create or replace function public.asignar_herramienta(
  p_articulo_id bigint,
  p_almacen_id  bigint,
  p_empleado_id bigint,
  p_cantidad    numeric,
  p_fecha       date default null,
  p_nota        text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $func$
declare
  v_fecha   date := coalesce(p_fecha, current_date);
  v_emp     record;
  v_art     record;
  v_libres  numeric;
  v_id      bigint;
begin
  perform private.exigir_permiso('INVENTARIO', 'ESCRITURA');

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad tiene que ser mayor que cero.' using errcode = '22023';
  end if;
  if v_fecha > current_date then
    raise exception 'No se entrega una herramienta con fecha futura.' using errcode = '22023';
  end if;

  select * into v_art from public.articulos where id = p_articulo_id;
  if v_art.id is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;

  select * into v_emp from public.empleados where id = p_empleado_id;
  if v_emp.id is null then
    raise exception 'No existe el trabajador %.', p_empleado_id using errcode = 'P0002';
  end if;
  -- A quien ya no trabaja aquí no se le entrega nada. Si se le entregó antes,
  -- eso se resuelve devolviendo o reportando la pérdida, no asignando más.
  if v_emp.fecha_egreso is not null then
    raise exception '% ya no trabaja en la empresa.', v_emp.nombres || ' ' || v_emp.apellidos
      using errcode = '55000';
  end if;

  -- Lo que se puede prestar es lo que hay menos lo que ya está prestado. La
  -- existencia sola diría que sí aunque las tres llaves estén en manos ajenas.
  select private.existencia(p_almacen_id, p_articulo_id)
       - coalesce((
           select sum(cantidad) from public.asignaciones_herramienta
            where articulo_id = p_articulo_id and almacen_id = p_almacen_id
              and estado = 'ASIGNADA'), 0)
    into v_libres;

  if v_libres < p_cantidad then
    raise exception 'Solo quedan % de "%" sin asignar.', v_libres, v_art.nombre
      using errcode = '55000';
  end if;

  insert into public.asignaciones_herramienta
    (numero, articulo_id, almacen_id, empleado_id, cantidad, fecha_entrega, nota, entregado_por)
  values
    (private.siguiente_numero('ASG'), p_articulo_id, p_almacen_id, p_empleado_id,
     p_cantidad, v_fecha, nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$func$;

comment on function public.asignar_herramienta is
  'Entrega una herramienta a un trabajador. No mueve el inventario: la '
  'herramienta sigue siendo de la empresa, solo cambia de sitio.';

-- ---------------------------------------------------------------------------
-- Devolver
-- ---------------------------------------------------------------------------
create or replace function public.devolver_herramienta(
  p_id    bigint,
  p_fecha date default null,
  p_nota  text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $func$
declare
  v_a     record;
  v_fecha date := coalesce(p_fecha, current_date);
begin
  perform private.exigir_permiso('INVENTARIO', 'ESCRITURA');

  select * into v_a from public.asignaciones_herramienta where id = p_id for update;
  if v_a.id is null then
    raise exception 'No existe la asignación %.', p_id using errcode = 'P0002';
  end if;
  if v_a.estado <> 'ASIGNADA' then
    raise exception 'Esa asignación está %.', lower(v_a.estado) using errcode = '55000';
  end if;
  if v_fecha < v_a.fecha_entrega then
    raise exception 'No puede devolverse antes de haberse entregado.' using errcode = '22023';
  end if;

  update public.asignaciones_herramienta
     set estado = 'DEVUELTA',
         fecha_devolucion = v_fecha,
         nota = coalesce(nullif(btrim(coalesce(p_nota, '')), ''), nota)
   where id = p_id;

  return p_id;
end;
$func$;

-- ---------------------------------------------------------------------------
-- Reportar que se perdió
--
-- Aquí es donde el inventario baja de verdad, y donde nace la nota para
-- nómina.
-- ---------------------------------------------------------------------------
create or replace function public.reportar_perdida_herramienta(
  p_id     bigint,
  p_motivo text,
  p_fecha  date default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $func$
declare
  v_a     record;
  v_fecha date := coalesce(p_fecha, current_date);
  v_art   record;
  v_emp   record;
  v_costo numeric;
  v_mov   bigint;
begin
  perform private.exigir_permiso('INVENTARIO', 'ESCRITURA');

  select * into v_a from public.asignaciones_herramienta where id = p_id for update;
  if v_a.id is null then
    raise exception 'No existe la asignación %.', p_id using errcode = 'P0002';
  end if;
  if v_a.estado <> 'ASIGNADA' then
    raise exception 'Esa asignación está %.', lower(v_a.estado) using errcode = '55000';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Hay que decir qué pasó con la herramienta.' using errcode = '23514';
  end if;
  if v_fecha < v_a.fecha_entrega then
    raise exception 'No pudo perderse antes de haberse entregado.' using errcode = '22023';
  end if;

  select * into v_art from public.articulos where id = v_a.articulo_id;
  select * into v_emp from public.empleados where id = v_a.empleado_id;

  v_costo := private.costo_promedio(v_a.almacen_id, v_a.articulo_id) * v_a.cantidad;

  -- La merma. Es lo que hace que la existencia sea la real: si había tres y se
  -- perdió una, quedan dos, y así lo dice Existencias.
  v_mov := private.registrar_movimiento(
    'SALIDA_MERMA', -1, v_a.almacen_id, v_a.articulo_id, v_a.cantidad, v_costo,
    format('Herramienta perdida · %s · %s', coalesce(v_a.numero, p_id::text),
           v_emp.nombres || ' ' || v_emp.apellidos),
    null, null, null, v_fecha);

  update public.asignaciones_herramienta
     set estado        = 'PERDIDA',
         fecha_perdida = v_fecha,
         motivo        = btrim(p_motivo),
         costo_usd     = v_costo,
         movimiento_id = v_mov
   where id = p_id;

  -- Quien lleva la nómina tiene que enterarse el día que pasa, no el día que
  -- va a pagar.
  perform private.notificar(
    'NOMINA', 'HERRAMIENTA_PERDIDA',
    format('%s no devolvió %s', v_emp.nombres || ' ' || v_emp.apellidos, v_art.nombre),
    format('Se descontó del inventario. Queda pendiente de reponer o descontar: %s.',
           btrim(p_motivo)),
    '/app/nomina/herramientas', array['NOMINA','ADMIN'], 'ATENCION');

  return p_id;
end;
$func$;

comment on function public.reportar_perdida_herramienta is
  'Descuenta la herramienta del almacén como merma y deja la asignación a '
  'nombre del responsable, pendiente de saldar.';

-- ---------------------------------------------------------------------------
-- Saldar la pérdida
--
-- Tres formas, y las tres cierran el asunto: se le descontó en nómina, la
-- repuso él mismo, o se decidió no cobrársela. La tercera existe porque una
-- herramienta que se rompe trabajando no es lo mismo que una que se pierde, y
-- sin esa salida la lista de pendientes se llena de cosas que nadie va a
-- cobrar y deja de mirarse.
--
-- Reponer NO vuelve a sumar al inventario: si la persona trae una llave nueva,
-- eso entra por donde entra todo lo que llega, con su recepción o su ajuste.
-- Sumarla aquí sería una segunda puerta al mismo almacén.
-- ---------------------------------------------------------------------------
create or replace function public.saldar_herramienta_perdida(
  p_id    bigint,
  p_como  text,
  p_fecha date default null,
  p_nota  text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $func$
declare
  v_a record;
begin
  perform private.exigir_permiso('NOMINA', 'ESCRITURA');

  if p_como not in ('DESCUENTO', 'REPOSICION', 'EXONERADO') then
    raise exception 'Se salda con un descuento, una reposición o una exoneración.'
      using errcode = '22023';
  end if;

  select * into v_a from public.asignaciones_herramienta where id = p_id for update;
  if v_a.id is null then
    raise exception 'No existe la asignación %.', p_id using errcode = 'P0002';
  end if;
  if v_a.estado <> 'PERDIDA' then
    raise exception 'Esa asignación está %: solo se salda lo que se perdió.', lower(v_a.estado)
      using errcode = '55000';
  end if;

  update public.asignaciones_herramienta
     set estado       = 'REPUESTA',
         saldado_como = p_como,
         saldado_el   = coalesce(p_fecha, current_date),
         nota         = coalesce(nullif(btrim(coalesce(p_nota, '')), ''), nota)
   where id = p_id;

  return p_id;
end;
$func$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
revoke execute on function public.asignar_herramienta(bigint, bigint, bigint, numeric, date, text)
  from public, anon;
grant execute on function public.asignar_herramienta(bigint, bigint, bigint, numeric, date, text)
  to authenticated;

revoke execute on function public.devolver_herramienta(bigint, date, text) from public, anon;
grant  execute on function public.devolver_herramienta(bigint, date, text) to authenticated;

revoke execute on function public.reportar_perdida_herramienta(bigint, text, date) from public, anon;
grant  execute on function public.reportar_perdida_herramienta(bigint, text, date) to authenticated;

revoke execute on function public.saldar_herramienta_perdida(bigint, text, date, text) from public, anon;
grant  execute on function public.saldar_herramienta_perdida(bigint, text, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
--
-- Lo lee quien lleva inventario y quien lleva nómina: son los dos lados de la
-- misma fila. Escribir es de inventario —quien está en el mostrador del
-- taller—, salvo saldar, que es de nómina y por eso lo comprueba su función.
-- ---------------------------------------------------------------------------
alter table public.asignaciones_herramienta enable row level security;

drop policy if exists asignaciones_lectura on public.asignaciones_herramienta;
create policy asignaciones_lectura on public.asignaciones_herramienta
  for select to authenticated
  using (
    private.tiene_permiso('INVENTARIO', 'LECTURA')
    or private.tiene_permiso('NOMINA', 'LECTURA')
  );

revoke insert, update, delete on public.asignaciones_herramienta from anon, authenticated;
