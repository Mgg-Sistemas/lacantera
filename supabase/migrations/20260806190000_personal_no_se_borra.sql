-- ============================================================================
-- Las fichas de personal no se borran: se desincorporan
--
-- Un usuario borró fichas de trabajadores. La función lo permitía a propósito y
-- con cuidado —solo dejaba borrar a quien no tuviera recibos ni novedades, es
-- decir, a quien nunca cobró—, y la idea era buena en el papel: una ficha
-- cargada dos veces o con la cédula mal escrita ensucia la lista y hace dudar de
-- si esa persona existió.
--
-- En la práctica esa distinción no la puede hacer la base. "Nunca cobró por el
-- sistema" no significa "nunca trabajó aquí": significa que su nómina todavía no
-- se procesó, o que se le pagó por fuera, o que la ficha se cargó ayer. Y del
-- otro lado, el borrado es la única acción del sistema que no se puede
-- deshacer desde la pantalla.
--
-- Así que la puerta se cierra. Una ficha equivocada se desincorpora con el
-- motivo escrito —"CARGADA POR ERROR", "DUPLICADA DE LA FICHA 0012"— y deja de
-- aparecer en la lista de activos, que es todo lo que se quería. La diferencia
-- es que se puede leer lo que pasó.
--
-- Esta migración hace dos cosas, en este orden:
--
--   1. Devuelve las fichas que se borraron, desincorporadas.
--   2. Quita el borrado.
--
-- SE PUEDE VOLVER A CORRER. La parte que restaura salta lo que ya está.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Volver a poner lo que se borró
--
-- El registro de auditoría guarda la fila ENTERA en `antes` cuando algo se
-- borra. No es un resumen ni una lista de campos elegidos: es `to_jsonb(OLD)`,
-- la fila tal como estaba el segundo antes de desaparecer. Por eso esto es una
-- restauración de verdad y no una reconstrucción a mano.
--
-- Vuelven desincorporadas y no activas a propósito. Nadie sabe hoy cuál de esas
-- fichas era una persona trabajando y cuál un duplicado: devolverlas activas
-- metería gente en la próxima nómina sin que nadie lo haya decidido. Vuelven
-- visibles, con su historia, y quien sepa las reactiva una por una.
-- ---------------------------------------------------------------------------
do $$
declare
  v_borrado   record;
  v_emp       public.empleados%rowtype;
  v_puestos   int := 0;
  v_saltados  int := 0;
  v_ya        int := 0;
begin
  for v_borrado in
    -- Si una misma ficha se borró más de una vez —creada, borrada, vuelta a
    -- crear, vuelta a borrar— vale la última: es la que tiene los datos como
    -- quedaron. `distinct on` con ese orden es exactamente eso.
    select distinct on ((a.antes ->> 'id')::bigint)
           (a.antes ->> 'id')::bigint as id,
           a.antes                    as fila,
           a.ocurrido_en,
           a.usuario                  as borro
      from public.auditoria a
     where a.tabla = 'empleados'
       and a.operacion = 'DELETE'
       and a.antes ? 'id'
     order by (a.antes ->> 'id')::bigint, a.ocurrido_en desc
  loop
    if exists (select 1 from public.empleados e where e.id = v_borrado.id) then
      v_ya := v_ya + 1;
      continue;
    end if;

    v_emp := jsonb_populate_record(null::public.empleados, v_borrado.fila);

    -- La cédula y el número de ficha son únicos. Si alguien volvió a cargar a
    -- esa persona a mano después del borrado, restaurarla crearía un duplicado
    -- —que es justo el problema que el borrado quería resolver—. Se salta y se
    -- dice, para que quien lea el resultado sepa que esa quedó fuera.
    if exists (
      select 1 from public.empleados e
       where e.cedula = v_emp.cedula or e.ficha = v_emp.ficha
    ) then
      v_saltados := v_saltados + 1;
      raise notice 'SIN RESTAURAR · % % (ficha %, %): ya existe una ficha con esa cédula o ese número.',
        v_emp.nombres, v_emp.apellidos, v_emp.ficha, v_emp.cedula;
      continue;
    end if;

    -- La foto no vuelve. La pantalla borraba el archivo del almacén después de
    -- borrar la ficha, así que la ruta guardada apunta a algo que ya no existe;
    -- dejarla puesta daría una ficha con un recuadro roto para siempre.
    v_emp.foto_path := null;

    -- Referencias que pueden haber muerto mientras la ficha no estaba.
    if v_emp.creado_por is not null
       and not exists (select 1 from auth.users u where u.id = v_emp.creado_por) then
      v_emp.creado_por := null;
    end if;

    if v_emp.tabulador_id is not null
       and not exists (select 1 from public.nomina_tabulador t where t.id = v_emp.tabulador_id) then
      v_emp.tabulador_id := null;
    end if;

    -- Desincorporada. La fecha es la del borrado, que es cuando de hecho dejó
    -- de contar; `greatest` con el ingreso porque la tabla no admite un egreso
    -- anterior al ingreso, y hay fichas con la fecha de ingreso puesta por el
    -- sistema al cargarlas del libro de nómina.
    v_emp.activo := false;
    v_emp.fecha_egreso := coalesce(
      v_emp.fecha_egreso,
      greatest(v_borrado.ocurrido_en::date, v_emp.fecha_ingreso)
    );
    v_emp.motivo_egreso := coalesce(
      nullif(trim(coalesce(v_emp.motivo_egreso, '')), ''),
      format('FICHA RESTAURADA. LA BORRO %s EL %s. REVISAR SI DEBE VOLVER A ACTIVARSE.',
             coalesce(v_borrado.borro, 'ALGUIEN'),
             to_char(v_borrado.ocurrido_en, 'DD/MM/YYYY'))
    );

    -- `overriding system value` porque `id` es `generated always`. Se conserva
    -- el número original y no hay riesgo de choque: la secuencia solo avanza,
    -- así que un id que existió nunca se vuelve a repartir.
    insert into public.empleados overriding system value select (v_emp).*;

    v_puestos := v_puestos + 1;
    raise notice 'RESTAURADA · % % (ficha %, %) · desincorporada el %',
      v_emp.nombres, v_emp.apellidos, v_emp.ficha, v_emp.cedula, v_emp.fecha_egreso;
  end loop;

  -- Por si las fichas restauradas fueran las de los últimos números repartidos.
  perform setval(
    pg_get_serial_sequence('public.empleados', 'id'),
    greatest(coalesce((select max(id) from public.empleados), 1), 1)
  );

  raise notice '---';
  raise notice 'Fichas restauradas: % · ya estaban: % · sin restaurar por duplicado: %',
    v_puestos, v_ya, v_saltados;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Quitar el borrado
--
-- La función se queda en su sitio, con la misma firma, en vez de borrarla. Si
-- se borrara, quien tenga la pantalla vieja abierta recibiría un
-- "función no encontrada" —un error de programación, no de negocio— y no
-- sabría qué hacer con él. Así recibe una frase que se entiende y que dice
-- dónde está el botón que sí sirve.
-- ---------------------------------------------------------------------------
create or replace function public.eliminar_empleado(p_id bigint)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nombre text;
begin
  perform private.exigir_rol('RRHH');

  select trim(e.nombres || ' ' || e.apellidos) into v_nombre
    from public.empleados e where e.id = p_id;

  raise exception
    'Las fichas de personal ya no se borran: se desincorporan. Usa "Egresar" con la fecha y el motivo —"cargada por error" también es un motivo—, y % deja de salir entre los activos sin que se pierda lo que decía su ficha.',
    coalesce(v_nombre, 'esa persona')
    using errcode = '42501',
          hint = 'Un borrado no se puede deshacer desde la pantalla; una desincorporación se revierte volviendo a activar la ficha.';
end;
$$;

revoke execute on function public.eliminar_empleado(bigint) from public, anon;
grant   execute on function public.eliminar_empleado(bigint) to authenticated;
