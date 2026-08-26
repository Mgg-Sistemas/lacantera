/*
  UNA HERRAMIENTA PRESTADA TIENE FECHA DE VUELTA

  Lo pidió la líder. Hoy se presta y nadie reclama hasta que alguien la echa en
  falta, que suele ser el día que hace falta y ya no está. La fecha límite es
  opcional a propósito: hay préstamos de una mañana y hay dotación que no vuelve
  nunca, y obligar a poner fecha en todos convertiría el campo en un trámite que
  se rellena con cualquier cosa.

  EL AVISO SALE UNA VEZ, NO TODOS LOS DÍAS

  Un aviso diario por la misma llave deja de leerse a la tercera mañana, y con
  él dejan de leerse los demás. Se marca cuándo se avisó y no se repite.

  ENSAYADO EN UNA TRANSACCIÓN DESHECHA

  Fecha límite anterior a la entrega rechazada por el CHECK; el aviso emitido
  una vez y cero la segunda; la vista distinguiendo veinte días fuera de ocho
  días vencida; y al devolverla, la marca del aviso y el retraso vueltos a nulo.
*/

alter table public.asignaciones_herramienta
  add column if not exists fecha_limite date,
  add column if not exists aviso_vencida_en timestamptz;

alter table public.asignaciones_herramienta
  drop constraint if exists asignacion_limite_despues_de_entrega;

alter table public.asignaciones_herramienta
  add constraint asignacion_limite_despues_de_entrega
  check (fecha_limite is null or fecha_limite >= fecha_entrega);

/*
  `asignar_herramienta` gana un parámetro, así que se BORRA antes de recrearla.

  Con `create or replace` y una lista de argumentos distinta, Postgres no
  reemplaza nada: crea una segunda función con el mismo nombre. PostgREST se
  queda entonces sin saber a cuál llamar y el front recibe un error de
  ambigüedad que no señala a ninguna parte. Ya está escrito en las reglas de la
  casa, y aun así es el error que más veces se ha repetido aquí.
*/
drop function if exists public.asignar_herramienta(bigint, bigint, bigint, numeric, date, text);

create function public.asignar_herramienta(
  p_articulo_id  bigint,
  p_almacen_id   bigint,
  p_empleado_id  bigint,
  p_cantidad     numeric,
  p_fecha        date default null,
  p_nota         text default null,
  p_fecha_limite date default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_fecha date := coalesce(p_fecha, current_date);
  v_emp record; v_art record; v_libres numeric; v_id bigint;
begin
  perform private.exigir_permiso('ASIGNACIONES', 'ESCRITURA');

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad tiene que ser mayor que cero.' using errcode = '22023';
  end if;
  if v_fecha > current_date then
    raise exception 'No se entrega una herramienta con fecha futura.' using errcode = '22023';
  end if;
  if p_fecha_limite is not null and p_fecha_limite < v_fecha then
    raise exception 'La fecha de devolución no puede ser anterior a la de entrega.'
      using errcode = '22023';
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

  -- `existencia_para_escribir` y no `existencia`: toma el cerrojo ANTES de
  -- leer, que es el único orden que impide que dos entregas simultáneas
  -- decidan las dos que alcanzaba.
  select private.existencia_para_escribir(p_almacen_id, p_articulo_id)
       - coalesce((select sum(cantidad) from public.asignaciones_herramienta
                    where articulo_id = p_articulo_id and almacen_id = p_almacen_id
                      and estado = 'ASIGNADA'), 0)
    into v_libres;

  if v_libres < p_cantidad then
    raise exception 'Solo quedan % de "%" sin asignar.', v_libres, v_art.nombre
      using errcode = '55000';
  end if;

  insert into public.asignaciones_herramienta
    (numero, articulo_id, almacen_id, empleado_id, cantidad, fecha_entrega,
     fecha_limite, nota, entregado_por)
  values
    (private.siguiente_numero('ASG'), p_articulo_id, p_almacen_id, p_empleado_id,
     p_cantidad, v_fecha, p_fecha_limite,
     nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.asignar_herramienta(bigint, bigint, bigint, numeric, date, text, date) from public;
grant execute on function public.asignar_herramienta(bigint, bigint, bigint, numeric, date, text, date) to authenticated;

/*
  Las columnas nuevas van al FINAL de la vista.

  `create or replace view` no sabe insertar una columna en medio: exige que las
  que ya estaban conserven su nombre, su tipo y su sitio. Meter `clase` junto a
  `articulo_id`, que es donde se leería mejor, obligaría a borrar la vista y a
  arrastrar con ella todo lo que dependa. El orden de las columnas de una vista
  no lo lee nadie; lo que rompe sí.

  Y dice desde cuándo está fuera y desde cuándo está VENCIDA, que no es lo
  mismo: una herramienta puede llevar tres meses fuera y estar en su sitio.
*/
create or replace view public.v_asignaciones_herramienta
with (security_invoker = on) as
select
  a.id,
  a.numero,
  a.estado,
  a.articulo_id,
  ar.codigo as articulo_codigo,
  ar.nombre as articulo,
  ar.categoria,
  ar.unidad,
  a.almacen_id,
  al.nombre as almacen,
  a.empleado_id,
  em.ficha,
  em.cedula,
  (em.nombres || ' ') || em.apellidos as empleado,
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
  a.dado_de_baja,
  a.saldado_como,
  a.saldado_el,
  current_date - a.fecha_entrega as dias_fuera,
  a.clase,
  a.fecha_limite,
  case
    when a.estado = 'ASIGNADA' and a.fecha_limite is not null and a.fecha_limite < current_date
      then current_date - a.fecha_limite
  end as dias_vencida
from public.asignaciones_herramienta a
join public.articulos  ar on ar.id = a.articulo_id
join public.almacenes  al on al.id = a.almacen_id
join public.empleados  em on em.id = a.empleado_id;

/*
  El aviso de lo que se pasó de fecha.

  Lo llama pg_cron una vez al día, como ya se hace con la tasa del BCV. No es un
  disparador porque no hay nada que dispare: el hecho es que pasó un día, y de
  eso no se entera ninguna tabla.
*/
create or replace function private.avisar_asignaciones_vencidas()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_fila record;
  v_cuantas integer := 0;
begin
  for v_fila in
    select a.id, a.numero, ar.nombre as articulo, a.cantidad, ar.unidad,
           (em.nombres || ' ') || em.apellidos as empleado, em.ficha,
           current_date - a.fecha_limite as dias
    from public.asignaciones_herramienta a
    join public.articulos ar on ar.id = a.articulo_id
    join public.empleados em on em.id = a.empleado_id
    where a.estado = 'ASIGNADA'
      and a.fecha_limite is not null
      and a.fecha_limite < current_date
      and a.aviso_vencida_en is null
  loop
    perform private.notificar(
      'ASIGNACIONES', 'ASIGNACION_VENCIDA',
      'Una herramienta no volvió a tiempo',
      format('%s · %s %s de %s — %s (ficha %s) · %s día%s de retraso',
             v_fila.numero, trim(to_char(v_fila.cantidad, 'FM999G999G990D##')),
             v_fila.unidad, v_fila.articulo, v_fila.empleado, v_fila.ficha,
             v_fila.dias, case when v_fila.dias = 1 then '' else 's' end),
      '/app/asignaciones', array['ALMACEN', 'ADMIN'], 'ATENCION');

    update public.asignaciones_herramienta
       set aviso_vencida_en = now()
     where id = v_fila.id;

    v_cuantas := v_cuantas + 1;
  end loop;

  return v_cuantas;
end;
$function$;

/*
  Y devolverla borra la marca del aviso.

  Si no se limpia, una herramienta que vuelve tarde, se vuelve a prestar y se
  vuelve a pasar de fecha ya no avisa nunca más: la marca del primer retraso
  sigue puesta.
*/
create or replace function private.limpiar_aviso_vencida()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.estado is distinct from old.estado and new.estado <> 'ASIGNADA' then
    new.aviso_vencida_en := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_limpiar_aviso_vencida on public.asignaciones_herramienta;
create trigger trg_limpiar_aviso_vencida
before update on public.asignaciones_herramienta
for each row execute function private.limpiar_aviso_vencida();

-- Cada mañana a las 11:15 UTC, que aquí son las 7:15: antes de que abra el
-- taller, para que quien llega ya tenga la lista de lo que hay que reclamar.
select cron.unschedule('asignaciones-vencidas')
where exists (select 1 from cron.job where jobname = 'asignaciones-vencidas');

select cron.schedule('asignaciones-vencidas', '15 11 * * *',
                     'select private.avisar_asignaciones_vencidas()');
