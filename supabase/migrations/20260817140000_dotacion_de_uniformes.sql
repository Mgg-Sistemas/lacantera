-- ============================================================================
-- Dotación: qué se le entregó a cada trabajador
--
-- El cliente pidió llevar los uniformes del personal. No hace falta una entidad
-- nueva para eso: un uniforme, unas botas o un casco son artículos del catálogo
-- —la categoría EPP ya existe y viene sembrada— y entregárselos a alguien es
-- una salida de almacén como cualquier otra. Lo único que faltaba era poder
-- decir a quién.
--
-- Hacerlo así y no con una tabla aparte tiene una consecuencia práctica que es
-- justo la que se busca: la dotación descuenta existencias y arrastra su costo.
-- Con una tabla propia habría dos verdades sobre cuántas botas quedan, y la que
-- se consultaría para reponer sería la equivocada.
--
-- El movimiento sigue siendo inmutable. Una entrega mal cargada se deshace con
-- el reverso de siempre, y la vista deja de contarla.
-- ============================================================================

alter table public.inventario_movimientos
  add column if not exists empleado_id bigint references public.empleados(id);

create index if not exists movimientos_empleado_idx
  on public.inventario_movimientos (empleado_id, fecha desc)
  where empleado_id is not null;

-- ---------------------------------------------------------------------------
-- El motor del libro aprende a anotar a quién
--
-- El parámetro va al final y con valor por defecto: así las once llamadas que
-- ya existen siguen escribiendo exactamente lo mismo que escribían.
--
-- Se BORRA la versión anterior antes de crear la nueva, y esto no es opcional.
-- `create or replace` solo reemplaza cuando la firma es idéntica; al añadir un
-- parámetro lo que hace es dejar dos funciones con el mismo nombre. A partir de
-- ahí toda llamada con argumentos sin tipar es ambigua y PostgreSQL la rechaza
-- con un "is not unique" que no dice de dónde viene. Le pasó ya a
-- `guardar_empleado` en este mismo repositorio.
-- ---------------------------------------------------------------------------
drop function if exists private.registrar_movimiento(
  text, integer, bigint, bigint, numeric, numeric, text, bigint, bigint, bigint, date);

-- La primera versión de todas llevaba el signo en smallint. Se limpia también,
-- por si esta migración se aplica sobre una base que nunca vio el cambio.
drop function if exists private.registrar_movimiento(
  text, smallint, bigint, bigint, numeric, numeric, text, bigint, bigint, bigint, date);

create or replace function private.registrar_movimiento(
  p_tipo        text,
  p_signo       integer,
  p_almacen     bigint,
  p_articulo    bigint,
  p_cantidad    numeric,
  p_costo_usd   numeric,
  p_nota        text default null,
  p_orden       bigint default null,
  p_renglon     bigint default null,
  p_origen      bigint default null,
  p_fecha       date default null,
  p_empleado    bigint default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_unidad text;
  v_id     bigint;
begin
  if p_signo not in (-1, 1) then
    raise exception 'El signo de un movimiento solo puede ser +1 o -1 (recibido: %).', p_signo
      using errcode = '22023';
  end if;

  select unidad into v_unidad from public.articulos where id = p_articulo;

  if v_unidad is null then
    raise exception 'No existe el artículo %.', p_articulo using errcode = 'P0002';
  end if;

  insert into public.inventario_movimientos
    (numero, fecha, tipo, signo, almacen_id, articulo_id, cantidad, unidad,
     costo_usd, orden_id, orden_renglon_id, movimiento_origen, nota, empleado_id,
     registrado_por)
  values
    (private.siguiente_numero('MOV'), coalesce(p_fecha, current_date), p_tipo, p_signo,
     p_almacen, p_articulo, p_cantidad, v_unidad, coalesce(p_costo_usd, 0),
     p_orden, p_renglon, p_origen, nullif(trim(coalesce(p_nota, '')), ''), p_empleado,
     (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Entregar una dotación
--
-- Varias prendas de una vez, porque así se entrega: el casco, las botas y los
-- guantes salen juntos y se firman en el mismo papel.
-- ---------------------------------------------------------------------------
create or replace function public.entregar_dotacion(
  p_empleado_id bigint,
  p_almacen_id  bigint,
  p_renglones   jsonb,
  p_fecha       date default null,
  p_nota        text default null
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_emp      record;
  v_item     jsonb;
  v_articulo bigint;
  v_cantidad numeric;
  v_hay      numeric;
  v_costo    numeric;
  v_nombre   text;
  v_n        integer := 0;
begin
  -- La entrega la hace almacén y la registra recursos humanos; en una cantera
  -- pequeña suele ser la misma persona. Cualquiera de los dos vale.
  perform private.exigir_rol('ALMACEN', 'RRHH');

  select * into v_emp from public.empleados where id = p_empleado_id;

  if v_emp.id is null then
    raise exception 'No existe ese trabajador.' using errcode = 'P0002';
  end if;

  if not v_emp.activo then
    raise exception 'A % ya no se le entrega dotación: está egresado.',
      v_emp.nombres || ' ' || v_emp.apellidos using errcode = '55000';
  end if;

  if not exists (select 1 from public.almacenes where id = p_almacen_id and activo) then
    raise exception 'El almacén indicado no existe o está inactivo.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'Indica qué se entrega y en qué cantidad.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_renglones) loop
    v_articulo := (v_item->>'articulo_id')::bigint;
    v_cantidad := coalesce((v_item->>'cantidad')::numeric, 0);

    if v_cantidad <= 0 then
      continue;
    end if;

    select nombre into v_nombre from public.articulos where id = v_articulo;

    if v_nombre is null then
      raise exception 'No existe el artículo %.', v_articulo using errcode = 'P0002';
    end if;

    -- La misma cuenta que cualquier salida: no se entrega lo que no hay. Un
    -- almacén en negativo deja de poder decir cuántas botas faltan por comprar.
    v_hay := private.existencia(p_almacen_id, v_articulo);

    if v_cantidad > v_hay then
      raise exception 'De "%" solo hay % en existencia y se intentan entregar %.',
        v_nombre, v_hay, v_cantidad using errcode = '22023';
    end if;

    v_costo := private.costo_promedio(p_almacen_id, v_articulo);

    perform private.registrar_movimiento(
      'SALIDA_CONSUMO', -1, p_almacen_id, v_articulo, v_cantidad, v_costo,
      format('Dotación a %s (%s). %s',
             v_emp.nombres || ' ' || v_emp.apellidos, v_emp.ficha,
             coalesce(nullif(trim(coalesce(p_nota, '')), ''), 'Entrega de dotación')),
      null, null, null, p_fecha, p_empleado_id);

    v_n := v_n + 1;
  end loop;

  if v_n = 0 then
    raise exception 'No se indicó ninguna cantidad a entregar.' using errcode = '22023';
  end if;

  return v_n;
end;
$$;

revoke execute on function public.entregar_dotacion(bigint, bigint, jsonb, date, text)
  from public, anon;
grant execute on function public.entregar_dotacion(bigint, bigint, jsonb, date, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Lo que tiene cada quien
--
-- Se excluye lo reversado: una entrega deshecha no es una entrega, y si
-- siguiera figurando nadie sabría cuándo toca reponer.
-- ---------------------------------------------------------------------------
create or replace view public.v_dotaciones
with (security_invoker = on) as
select
  m.id,
  m.numero,
  m.fecha,
  m.empleado_id,
  e.ficha,
  e.nombres,
  e.apellidos,
  e.cargo,
  m.articulo_id,
  a.codigo   as articulo_codigo,
  a.nombre   as articulo,
  a.categoria,
  m.cantidad,
  m.unidad,
  m.costo_usd,
  m.valor_usd,
  m.almacen_id,
  al.nombre  as almacen,
  m.nota,
  m.registrado_por,
  m.registrado_en
from public.inventario_movimientos m
join public.empleados  e  on e.id  = m.empleado_id
join public.articulos  a  on a.id  = m.articulo_id
join public.almacenes  al on al.id = m.almacen_id
where m.empleado_id is not null
  and m.signo < 0
  and not exists (
    select 1 from public.inventario_movimientos r
     where r.movimiento_origen = m.id and r.tipo = 'REVERSO'
  );

grant select on public.v_dotaciones to authenticated;
