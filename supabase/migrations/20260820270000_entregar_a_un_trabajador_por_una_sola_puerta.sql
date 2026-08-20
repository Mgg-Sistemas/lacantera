-- ---------------------------------------------------------------------------
-- Entregarle cosas a un trabajador, por una sola puerta
--
-- HABÍA DOS PUERTAS Y HACÍAN COSAS DISTINTAS
--
-- `asignar_herramienta`, desde el módulo de asignaciones: crea un préstamo.
-- No descuenta del almacén, queda a nombre de alguien y se le pide de vuelta.
-- Un artículo cada vez.
--
-- `entregar_dotacion`, desde la ficha del trabajador: registra
-- `SALIDA_CONSUMO`. **Descuenta.** Varios artículos de una vez, pero no deja
-- constancia de que nadie tenga nada.
--
-- Y LA FICHA OFRECÍA HERRAMIENTA
--
-- Filtraba por categoría —EPP, HERRAMIENTA, INSUMO— y lo consumía todo. Así
-- que entregar un torquímetro desde la ficha lo hacía **desaparecer del
-- almacén** en vez de dejarlo prestado. Nadie se enteraba: el almacén decía la
-- verdad sobre lo que ya no tenía y mentía sobre por qué.
--
-- UNA PUERTA QUE MIRA EL CATÁLOGO
--
-- Ahora hay una sola función y cada renglón va por donde le toca según
-- `articulos.modo_entrega`, que es justo el dato que se añadió para esto:
--
--   RETORNABLE  → préstamo. No descuenta, queda a su nombre.
--   CONSUMIBLE  → salida de consumo. Descuenta y queda quién lo recibió.
--   NO          → se para y dice cuál. Media tonelada de granzón no se le
--                 entrega a nadie.
--
-- Las dos pantallas la llaman: el módulo de asignaciones y la ficha. Lo que
-- decide qué pasa deja de ser desde dónde se pulsó y pasa a ser qué cosa es.
--
-- POR QUÉ NO SE BORRAN LAS DOS VIEJAS
--
-- `asignar_herramienta` sigue: es la entrega de un artículo suelto desde la
-- fila de la lista, y ahí no hace falta armar renglones. `entregar_dotacion`
-- también, porque hay migraciones y pantallas que la nombran; deja de usarse
-- desde la ficha y se queda como estaba para lo que ya existía.
-- ---------------------------------------------------------------------------
create or replace function public.entregar_a_trabajador(
  p_empleado_id bigint,
  p_almacen_id  bigint,
  p_renglones   jsonb,
  p_fecha       date default null,
  p_nota        text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_fecha     date := coalesce(p_fecha, current_date);
  v_emp       record;
  v_art       record;
  v_item      jsonb;
  v_cantidad  numeric;
  v_libres    numeric;
  v_hay       numeric;
  v_costo     numeric;
  v_prestados integer := 0;
  v_gastados  integer := 0;
begin
  -- Entrega quien lleva las asignaciones, y también almacén o RRHH: los tres
  -- reparten cosas a la gente, cada uno por su lado del mostrador.
  if not private.tiene_permiso('ASIGNACIONES', 'ESCRITURA')
     and not private.tiene_rol('ALMACEN', 'RRHH', 'ADMIN') then
    raise exception 'No tienes permiso para entregarle cosas a un trabajador.'
      using errcode = '42501';
  end if;

  if v_fecha > current_date then
    raise exception 'No se entrega nada con fecha futura.' using errcode = '22023';
  end if;

  select * into v_emp from public.empleados where id = p_empleado_id;

  if v_emp.id is null then
    raise exception 'No existe ese trabajador.' using errcode = 'P0002';
  end if;

  if not v_emp.activo or v_emp.fecha_egreso is not null then
    raise exception 'A % ya no se le entrega nada: está egresado.',
      v_emp.nombres || ' ' || v_emp.apellidos using errcode = '55000';
  end if;

  if not exists (select 1 from public.almacenes where id = p_almacen_id and activo) then
    raise exception 'El almacén indicado no existe o está inactivo.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'Indica qué se entrega y en qué cantidad.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_cantidad := coalesce((v_item->>'cantidad')::numeric, 0);

    if v_cantidad <= 0 then
      continue;   -- Renglón que se dejó en blanco.
    end if;

    select * into v_art from public.articulos where id = (v_item->>'articulo_id')::bigint;

    if v_art.id is null then
      raise exception 'No existe el artículo %.', v_item->>'articulo_id' using errcode = 'P0002';
    end if;

    if v_art.modo_entrega = 'NO' then
      raise exception '"%" no es algo que se le entregue a una persona. Si debería serlo, cámbialo en el catálogo.',
        v_art.nombre using errcode = '22023';
    end if;

    if v_art.modo_entrega = 'RETORNABLE' then
      -- Lo prestado sigue contando como existencia: es de la empresa. Lo que
      -- no se puede es prestar dos veces lo mismo.
      select private.existencia(p_almacen_id, v_art.id)
           - coalesce((select sum(a.cantidad) from public.asignaciones_herramienta a
                        where a.articulo_id = v_art.id and a.almacen_id = p_almacen_id
                          and a.estado = 'ASIGNADA'), 0)
        into v_libres;

      if v_libres < v_cantidad then
        raise exception 'De "%" solo quedan % sin prestar.', v_art.nombre, v_libres
          using errcode = '55000';
      end if;

      insert into public.asignaciones_herramienta
        (numero, articulo_id, almacen_id, empleado_id, cantidad, fecha_entrega, nota, entregado_por)
      values
        (private.siguiente_numero('ASG'), v_art.id, p_almacen_id, p_empleado_id,
         v_cantidad, v_fecha, nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()));

      v_prestados := v_prestados + 1;

    else
      v_hay := private.existencia(p_almacen_id, v_art.id);

      if v_cantidad > v_hay then
        raise exception 'De "%" solo hay % en existencia y se intentan entregar %.',
          v_art.nombre, v_hay, v_cantidad using errcode = '22023';
      end if;

      v_costo := private.costo_promedio(p_almacen_id, v_art.id);

      perform private.registrar_movimiento(
        'SALIDA_CONSUMO', -1, p_almacen_id, v_art.id, v_cantidad, v_costo,
        format('Entrega a %s (%s). %s',
               v_emp.nombres || ' ' || v_emp.apellidos, v_emp.ficha,
               coalesce(nullif(trim(coalesce(p_nota, '')), ''), 'Entrega a trabajador')),
        null, null, null, v_fecha, p_empleado_id);

      v_gastados := v_gastados + 1;
    end if;
  end loop;

  if v_prestados + v_gastados = 0 then
    raise exception 'No se indicó ninguna cantidad a entregar.' using errcode = '22023';
  end if;

  -- Se devuelven las dos cuentas porque la pantalla tiene algo distinto que
  -- decir de cada una: lo prestado hay que pedirlo de vuelta, lo consumido no.
  return jsonb_build_object('prestados', v_prestados, 'consumidos', v_gastados);
end;
$function$;

comment on function public.entregar_a_trabajador is
  'Entrega varias cosas a una persona de una vez. Cada renglón va por donde le '
  'toca según `articulos.modo_entrega`: lo retornable queda prestado a su '
  'nombre y lo consumible sale del almacén. Lo que no se entrega a personas, '
  'se rechaza diciendo cuál.';

revoke execute on function public.entregar_a_trabajador(bigint, bigint, jsonb, date, text) from public, anon;
grant  execute on function public.entregar_a_trabajador(bigint, bigint, jsonb, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Y lo que se le puede entregar a alguien, en una vista
--
-- La lista de asignables solo traía lo retornable, porque es lo único que sabe
-- manejar el préstamo. Para la entrega en bloque hace falta lo retornable **y**
-- lo consumible: unas botas y un torquímetro salen del mismo almacén el mismo
-- día, aunque una se gaste y el otro vuelva.
-- ---------------------------------------------------------------------------
create or replace view public.v_entregables as
select e.almacen_id,
       e.almacen,
       e.articulo_id,
       e.articulo_codigo,
       e.articulo,
       e.categoria,
       e.unidad,
       a.modo_entrega,
       e.existencia,
       coalesce(g.asignadas, 0) as prestadas,
       case when a.modo_entrega = 'RETORNABLE'
            then e.existencia - coalesce(g.asignadas, 0)
            else e.existencia
       end as disponibles
  from public.v_existencias e
  join public.articulos a on a.id = e.articulo_id and a.modo_entrega <> 'NO'
  left join (
    select articulo_id, almacen_id, sum(cantidad) as asignadas
      from public.asignaciones_herramienta
     where estado = 'ASIGNADA'
     group by articulo_id, almacen_id
  ) g on g.articulo_id = e.articulo_id and g.almacen_id = e.almacen_id;

alter view public.v_entregables set (security_invoker = on);

comment on view public.v_entregables is
  'Lo que se le puede dar a una persona desde cada almacén, con lo que queda '
  'disponible. Lo retornable descuenta lo ya prestado; lo consumible no, '
  'porque lo entregado ya salió del libro.';

grant select on public.v_entregables to authenticated;
