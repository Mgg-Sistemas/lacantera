-- ---------------------------------------------------------------------------
-- Un almacén puede decir cuánto le cabe
--
-- Christopher preguntó dos veces lo mismo:
--
--   «¿Dónde puedo añadir o modificar/eliminar un tanque?»
--
-- La primera vez contesté el camino —Inventario → Almacenes, tipo Combustible—
-- y era verdad, pero incompleta. Que lo preguntara otra vez es la señal: cuando
-- alguien pregunta dos veces lo mismo, el problema no es que no se lo hayan
-- explicado.
--
-- LO QUE FALTABA, Y ERA CULPA MÍA
--
-- Añadí `almacenes.capacidad` en una migración anterior y NO toqué
-- `guardar_almacen`. La columna existía, la vista la leía, y no había forma de
-- escribirla desde ninguna parte. Así que quien iba a Almacenes a crear un
-- tanque encontraba el mismo formulario de siempre: nada allí decía que eso
-- fuera un tanque, salvo el tipo.
--
-- Lo mismo con `trabajos_a_la_vez`, que se añadió para los talleres y tampoco
-- tenía por dónde entrar.
--
-- CADA CAMPO SOLO EN SU TIPO, Y RECHAZADO EN LOS DEMÁS
--
-- Un patio no tiene tope y un almacén tampoco: una capacidad ahí sería un número
-- que nadie lee y que alguien acabaría interpretando. La función lo rechaza con
-- su motivo, y la pantalla ni siquiera enseña el campo — las dos rejas dicen lo
-- mismo, que es como no hay que explicar después lo que no se pudo hacer.
-- ---------------------------------------------------------------------------

drop function if exists public.guardar_almacen(bigint, text, text, text, text, boolean, boolean);

create or replace function public.guardar_almacen(
  p_id                bigint default null,
  p_codigo            text default null,
  p_nombre            text default null,
  p_tipo              text default 'ALMACEN',
  p_ubicacion         text default null,
  p_recibe_compras    boolean default false,
  p_activo            boolean default true,
  p_capacidad         numeric default null,
  p_trabajos_a_la_vez smallint default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_id     bigint;
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
begin
  perform private.exigir_permiso('INVENTARIO', 'ESCRITURA');

  if length(v_codigo) < 2 then
    raise exception 'El almacén necesita un código que lo identifique.' using errcode = '23514';
  end if;
  if length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El almacén necesita un nombre.' using errcode = '23514';
  end if;
  if p_tipo not in ('PATIO', 'ALMACEN', 'TALLER', 'COMBUSTIBLE', 'TRANSITO') then
    raise exception 'Tipo de almacén no válido: %.', p_tipo using errcode = '22023';
  end if;

  if p_capacidad is not null and p_capacidad <= 0 then
    raise exception 'La capacidad tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if p_capacidad is not null and p_tipo <> 'COMBUSTIBLE' then
    raise exception 'Solo un tanque de combustible dice cuánto le cabe.'
      using errcode = '22023',
            hint = 'Un patio o un almacén no tienen tope: déjalo vacío.';
  end if;

  if p_trabajos_a_la_vez is not null and p_tipo <> 'TALLER' then
    raise exception 'Solo un taller dice cuántos trabajos aguanta a la vez.'
      using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.almacenes
      (codigo, nombre, tipo, ubicacion, recibe_compras, activo, capacidad, trabajos_a_la_vez)
    values
      (v_codigo, btrim(p_nombre), p_tipo,
       nullif(btrim(coalesce(p_ubicacion, '')), ''),
       coalesce(p_recibe_compras, false), coalesce(p_activo, true),
       p_capacidad, p_trabajos_a_la_vez)
    returning id into v_id;
  else
    update public.almacenes
       set codigo = v_codigo,
           nombre = btrim(p_nombre),
           tipo = p_tipo,
           ubicacion = nullif(btrim(coalesce(p_ubicacion, '')), ''),
           recibe_compras = coalesce(p_recibe_compras, false),
           activo = coalesce(p_activo, true),
           capacidad = p_capacidad,
           trabajos_a_la_vez = p_trabajos_a_la_vez
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'No existe el almacén %.', p_id using errcode = 'P0002';
    end if;
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe un almacén con el código %.', v_codigo using errcode = '23505';
end;
$func$;

comment on function public.guardar_almacen(bigint, text, text, text, text, boolean, boolean, numeric, smallint) is
  'Crea o corrige un almacén. Un tanque de combustible dice además cuánto le cabe, y un taller cuántos trabajos aguanta a la vez.';

revoke all on function public.guardar_almacen(bigint, text, text, text, text, boolean, boolean, numeric, smallint) from public;
revoke all on function public.guardar_almacen(bigint, text, text, text, text, boolean, boolean, numeric, smallint) from anon;
grant execute on function public.guardar_almacen(bigint, text, text, text, text, boolean, boolean, numeric, smallint) to authenticated;
