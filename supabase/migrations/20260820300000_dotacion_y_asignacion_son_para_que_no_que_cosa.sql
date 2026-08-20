-- ---------------------------------------------------------------------------
-- Dotación y asignación se distinguen por PARA QUÉ, no por qué cosa
--
-- EL MODELO QUE TENÍA ESTE CARRIL, Y ESTABA MAL
--
-- Se había asumido que dotación era lo consumible y asignación lo retornable.
-- Christopher lo corrigió y el ejemplo lo derrumba solo: **una laptop es
-- dotación y vuelve; unas mascarillas son dotación y se gastan; unas botas son
-- dotación y se gastan despacio**.
--
-- LA DISTINCIÓN DE VERDAD
--
--   DOTACIÓN    Lo que la empresa le da porque su rol lo necesita, mientras
--               trabaje. Casco, guantes, uniforme, botas, laptop, bolígrafos.
--
--   ASIGNACIÓN  Lo que se le da —o pide— para una actividad concreta y durante
--               un tiempo acotado. Kit de llaves, taladro mecánico, motosierra.
--
-- Y `articulos.modo_entrega` sigue existiendo y sigue siendo otra cosa: dice si
-- el bien vuelve o se gasta. Son dos ejes perpendiculares, y las cuatro
-- casillas existen de verdad:
--
--                    RETORNABLE            CONSUMIBLE
--   DOTACIÓN         laptop                mascarillas, botas
--   ASIGNACIÓN       taladro, motosierra   electrodos para una reparación
--
-- Por eso al entregar hay que preguntar **dos cosas**: qué se lleva, y para
-- qué. El sistema solo deducía la primera.
--
-- DÓNDE SE GUARDA CADA UNA
--
-- El propósito viaja con la entrega, no con el artículo: el mismo taladro puede
-- ser dotación de un mecánico y asignación temporal de un ayudante.
--
--   Lo retornable ya tenía su tabla con estado — `asignaciones_herramienta`—
--   y ahí entra `clase`.
--
--   Lo consumible deja rastro en el libro de inventario, y ahí entra
--   `entrega_clase`. Es una columna que solo tiene valor cuando el movimiento
--   es una entrega a una persona, igual que `empleado_id`, que ya sentó ese
--   precedente en esta misma tabla.
--
-- POR QUÉ SE TOCA `registrar_movimiento`, QUE ES EL CORAZÓN DEL LIBRO
--
-- Porque es quien hace el INSERT, y el libro es inmutable: un disparador impide
-- modificar una fila después de escrita. No hay forma de poner el dato luego.
--
-- Se borra y se recrea con un parámetro más **al final y con valor por
-- defecto**, así que las veinte llamadas que hoy pasan doce argumentos por
-- posición siguen resolviendo a esta misma función sin tocarse. El `drop` es
-- obligatorio: `create or replace` con otra lista de parámetros no reemplaza,
-- crea una segunda y deja las dos conviviendo.
-- ---------------------------------------------------------------------------
alter table public.asignaciones_herramienta
  add column if not exists clase text not null default 'ASIGNACION';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'asignaciones_clase_check') then
    alter table public.asignaciones_herramienta
      add constraint asignaciones_clase_check check (clase in ('DOTACION', 'ASIGNACION'));
  end if;
end $$;

comment on column public.asignaciones_herramienta.clase is
  'Para qué se le dio: DOTACION si es por su rol, ASIGNACION si es para una '
  'actividad concreta y acotada. Nada que ver con que el bien vuelva o no — '
  'eso lo dice articulos.modo_entrega.';

alter table public.inventario_movimientos
  add column if not exists entrega_clase text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'movimientos_entrega_clase_check') then
    alter table public.inventario_movimientos
      add constraint movimientos_entrega_clase_check
      check (entrega_clase is null or entrega_clase in ('DOTACION', 'ASIGNACION'));
  end if;
end $$;

comment on column public.inventario_movimientos.entrega_clase is
  'Solo en las salidas que son una entrega a una persona: para qué se le dio. '
  'Nulo en todo lo demás, como `empleado_id`.';

-- ---------------------------------------------------------------------------
drop function if exists private.registrar_movimiento(
  text, integer, bigint, bigint, numeric, numeric, text, bigint, bigint, bigint, date, bigint);

create or replace function private.registrar_movimiento(
  p_tipo      text,
  p_signo     integer,
  p_almacen   bigint,
  p_articulo  bigint,
  p_cantidad  numeric,
  p_costo_usd numeric,
  p_nota      text default null,
  p_orden     bigint default null,
  p_renglon   bigint default null,
  p_origen    bigint default null,
  p_fecha     date default null,
  p_empleado  bigint default null,
  -- El añadido. Va al final y con valor por defecto para que las llamadas de
  -- doce argumentos por posición sigan valiendo tal cual están.
  p_clase     text default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
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
     entrega_clase, registrado_por)
  values
    (private.siguiente_numero('MOV'), coalesce(p_fecha, current_date), p_tipo, p_signo,
     p_almacen, p_articulo, p_cantidad, v_unidad, coalesce(p_costo_usd, 0),
     p_orden, p_renglon, p_origen, nullif(trim(coalesce(p_nota, '')), ''), p_empleado,
     p_clase, (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Y la entrega pregunta para qué
--
-- La firma cambia, así que se borra la anterior: PostgREST resuelve por nombre
-- de argumento y con dos candidatas no sabría cuál llamar.
-- ---------------------------------------------------------------------------
drop function if exists public.entregar_a_trabajador(bigint, bigint, jsonb, date, text);

create or replace function public.entregar_a_trabajador(
  p_empleado_id bigint,
  p_almacen_id  bigint,
  p_renglones   jsonb,
  p_clase       text default 'ASIGNACION',
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
  v_clase     text := coalesce(nullif(btrim(coalesce(p_clase, '')), ''), 'ASIGNACION');
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
  if not private.tiene_permiso('ASIGNACIONES', 'ESCRITURA')
     and not private.tiene_rol('ALMACEN', 'RRHH', 'ADMIN') then
    raise exception 'No tienes permiso para entregarle cosas a un trabajador.'
      using errcode = '42501';
  end if;

  if v_clase not in ('DOTACION', 'ASIGNACION') then
    raise exception 'Di si es dotación —por su rol— o asignación —para una actividad concreta.'
      using errcode = '22023';
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
      continue;
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
        (numero, articulo_id, almacen_id, empleado_id, cantidad, fecha_entrega,
         clase, nota, entregado_por)
      values
        (private.siguiente_numero('ASG'), v_art.id, p_almacen_id, p_empleado_id,
         v_cantidad, v_fecha, v_clase,
         nullif(btrim(coalesce(p_nota, '')), ''), (select auth.uid()));

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
        format('%s a %s (%s). %s',
               case when v_clase = 'DOTACION' then 'Dotación' else 'Asignación' end,
               v_emp.nombres || ' ' || v_emp.apellidos, v_emp.ficha,
               coalesce(nullif(trim(coalesce(p_nota, '')), ''), '')),
        null, null, null, v_fecha, p_empleado_id, v_clase);

      v_gastados := v_gastados + 1;
    end if;
  end loop;

  if v_prestados + v_gastados = 0 then
    raise exception 'No se indicó ninguna cantidad a entregar.' using errcode = '22023';
  end if;

  return jsonb_build_object('prestados', v_prestados, 'consumidos', v_gastados);
end;
$function$;

comment on function public.entregar_a_trabajador is
  'Entrega varias cosas a una persona. `p_clase` dice para qué —dotación por su '
  'rol, asignación para una actividad—; el catálogo dice si cada cosa vuelve o '
  'se gasta. Son dos preguntas distintas y las dos hacen falta.';

revoke execute on function public.entregar_a_trabajador(bigint, bigint, jsonb, text, date, text) from public, anon;
grant  execute on function public.entregar_a_trabajador(bigint, bigint, jsonb, text, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Todo lo que se le ha dado a una persona, en una sola lista
--
-- Une los dos rastros —lo prestado y lo consumido— porque para quien mira una
-- ficha son lo mismo: cosas que se le dieron. Lo que las separa en pantalla es
-- `clase`, que es la pregunta que de verdad hace quien la mira: ¿esto es de su
-- puesto o se lo llevó para una faena?
--
-- `vuelve` va explícito para no obligar a la pantalla a deducirlo.
-- ---------------------------------------------------------------------------
create or replace view public.v_entregado_a_trabajador as
select 'PRESTAMO'::text  as origen,
       a.id,
       a.numero,
       a.empleado_id,
       a.fecha_entrega   as fecha,
       a.articulo_id,
       art.codigo        as articulo_codigo,
       art.nombre        as articulo,
       art.unidad,
       art.categoria,
       a.cantidad,
       al.nombre         as almacen,
       a.clase,
       a.estado,
       true              as vuelve,
       a.motivo,
       a.nota
  from public.asignaciones_herramienta a
  join public.articulos art on art.id = a.articulo_id
  join public.almacenes al  on al.id = a.almacen_id

union all

select 'CONSUMO'::text,
       m.id,
       m.numero,
       m.empleado_id,
       m.fecha,
       m.articulo_id,
       art.codigo,
       art.nombre,
       art.unidad,
       art.categoria,
       m.cantidad,
       al.nombre,
       coalesce(m.entrega_clase, 'DOTACION'),
       null::text,
       false,
       null::text,
       m.nota
  from public.inventario_movimientos m
  join public.articulos art on art.id = m.articulo_id
  join public.almacenes al  on al.id = m.almacen_id
 where m.empleado_id is not null
   and m.tipo = 'SALIDA_CONSUMO'
   and m.signo = -1;

alter view public.v_entregado_a_trabajador set (security_invoker = on);

comment on view public.v_entregado_a_trabajador is
  'Todo lo que se le ha dado a cada persona: lo prestado y lo consumido, en una '
  'lista. `clase` dice si fue por su rol o para una actividad; `vuelve` dice si '
  'hay que pedirlo de vuelta.';

grant select on public.v_entregado_a_trabajador to authenticated;
