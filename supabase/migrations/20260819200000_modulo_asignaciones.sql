-- ---------------------------------------------------------------------------
-- Asignaciones es un módulo, no una pantalla de inventario
--
-- Nació colgando de INVENTARIO porque la herramienta sale de un almacén, y eso
-- era mirar solo la mitad. La otra mitad es una persona: quién la tiene, desde
-- cuándo, y de quién es la responsabilidad si no vuelve. Eso no es inventario
-- — es a quién se le entregó algo.
--
-- Colgado de INVENTARIO, el permiso quedaba mal repartido en las dos puntas:
-- quien lleva la nómina necesitaba permiso de inventario para resolver una
-- pérdida que no tiene nada que ver con el almacén, y cualquiera con acceso al
-- inventario podía entregar herramientas a nombre de un trabajador.
--
-- Con módulo propio cada quien tiene lo suyo: el almacenista entrega y recibe,
-- quien paga resuelve lo que no volvió, y la gerencia lo mira sin poder tocar
-- ninguna de las dos cosas.
-- ---------------------------------------------------------------------------
insert into public.modulos (codigo, nombre, descripcion, orden) values
  ('ASIGNACIONES', 'Asignaciones',
   'Herramientas y equipo entregados a un trabajador, y qué pasó con ellos.', 35)
on conflict (codigo) do update
  set nombre = excluded.nombre,
      descripcion = excluded.descripcion,
      orden = excluded.orden;

-- Por defecto nadie, y después se abre a quien corresponde: es más seguro
-- olvidarse de dar un permiso que olvidarse de quitarlo.
insert into public.rol_permisos (rol, modulo, nivel)
select r.codigo, 'ASIGNACIONES', 'NINGUNO' from public.roles r
on conflict (rol, modulo) do nothing;

update public.rol_permisos set nivel = 'TOTAL'
 where modulo = 'ASIGNACIONES' and rol = 'ADMIN';

-- Almacén entrega y recibe. RRHH resuelve lo que no volvió — es quien decide
-- si se descuenta— y por eso también escribe.
update public.rol_permisos set nivel = 'ESCRITURA'
 where modulo = 'ASIGNACIONES' and rol in ('ALMACEN', 'RRHH');

update public.rol_permisos set nivel = 'LECTURA'
 where modulo = 'ASIGNACIONES' and rol in ('GERENTE_GENERAL', 'OPERACIONES', 'CONSULTA');

-- ---------------------------------------------------------------------------
-- Las funciones piden el permiso del módulo nuevo
--
-- Entregar, devolver y reportar la pérdida son de quien está en el mostrador.
-- Saldar es de quien paga, y por eso además de ASIGNACIONES exige NOMINA: la
-- decisión de descontarle a alguien no es del almacén.
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
  v_fecha  date := coalesce(p_fecha, current_date);
  v_emp    record;
  v_art    record;
  v_libres numeric;
  v_id     bigint;
begin
  perform private.exigir_permiso('ASIGNACIONES', 'ESCRITURA');

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
  if v_emp.fecha_egreso is not null then
    raise exception '% ya no trabaja en la empresa.', v_emp.nombres || ' ' || v_emp.apellidos
      using errcode = '55000';
  end if;

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

create or replace function public.devolver_herramienta(
  p_id bigint, p_fecha date default null, p_nota text default null
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
  perform private.exigir_permiso('ASIGNACIONES', 'ESCRITURA');

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

create or replace function public.reportar_perdida_herramienta(
  p_id bigint, p_motivo text, p_fecha date default null
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
  perform private.exigir_permiso('ASIGNACIONES', 'ESCRITURA');

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

  v_mov := private.registrar_movimiento(
    'SALIDA_MERMA', -1, v_a.almacen_id, v_a.articulo_id, v_a.cantidad, v_costo,
    format('Herramienta perdida · %s · %s', coalesce(v_a.numero, p_id::text),
           v_emp.nombres || ' ' || v_emp.apellidos),
    null, null, null, v_fecha);

  update public.asignaciones_herramienta
     set estado = 'PERDIDA', fecha_perdida = v_fecha, motivo = btrim(p_motivo),
         costo_usd = v_costo, movimiento_id = v_mov
   where id = p_id;

  perform private.notificar(
    'ASIGNACIONES', 'HERRAMIENTA_PERDIDA',
    format('%s no devolvió %s', v_emp.nombres || ' ' || v_emp.apellidos, v_art.nombre),
    format('Se descontó del inventario. Queda pendiente de reponer o descontar: %s.', btrim(p_motivo)),
    '/app/asignaciones/sin-devolver', array['RRHH','ADMIN','ALMACEN'], 'ATENCION');

  return p_id;
end;
$func$;

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
  -- Los dos: es una asignación, pero decidir que se le descuenta a alguien es
  -- de nómina. Sin el segundo, el almacenista podría cerrar el caso solo.
  perform private.exigir_permiso('ASIGNACIONES', 'ESCRITURA');
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
     set estado = 'REPUESTA', saldado_como = p_como,
         saldado_el = coalesce(p_fecha, current_date),
         nota = coalesce(nullif(btrim(coalesce(p_nota, '')), ''), nota)
   where id = p_id;

  return p_id;
end;
$func$;

-- ---------------------------------------------------------------------------
-- Y la lectura
-- ---------------------------------------------------------------------------
drop policy if exists asignaciones_lectura on public.asignaciones_herramienta;
create policy asignaciones_lectura on public.asignaciones_herramienta
  for select to authenticated
  using (private.tiene_permiso('ASIGNACIONES', 'LECTURA'));
