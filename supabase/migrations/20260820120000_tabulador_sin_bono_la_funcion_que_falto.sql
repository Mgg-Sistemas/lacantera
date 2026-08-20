-- ---------------------------------------------------------------------------
-- La mitad que nunca corrió de `20260806160000_tabulador_sin_bono`
--
-- LO QUE ESTABA ROTO
--
-- Aquella migración hacía dos cosas: borrar `nomina_tabulador.bono_mensual` y
-- rehacer `guardar_cargo_tabulador` sin el bono. En la base viva corrió la
-- primera y no la segunda, así que la función lleva desde el 6 de agosto
-- escribiendo una columna que ya no existe — en sus **dos** ramas, el insert y
-- el update.
--
-- Efecto: crear o editar cualquier cargo del tabulador falla con
-- `42703: column "bono_mensual" ... does not exist`. Es decir, no se podía dar
-- un aumento ni añadir un cargo nuevo.
--
-- POR QUÉ NO LO VIO NADIE
--
-- Postgres **no valida el cuerpo de una función plpgsql contra el esquema al
-- crearla**, solo al ejecutarla. Y leer seguía funcionando, porque `v_tabulador`
-- no toca el bono: la pantalla se veía perfecta hasta que alguien pulsaba
-- guardar.
--
-- Lo encontró el carril de base de datos comparando los cuerpos de las
-- funciones contra `pg_attribute`, que es la única forma de cazar esto.
--
-- EL `DROP` EXPLÍCITO NO ES OPCIONAL
--
-- `create or replace` con una lista de parámetros distinta **no reemplaza**:
-- crea una segunda función y deja las dos conviviendo. PostgREST resuelve por
-- nombre de argumento y con dos candidatas no sabría cuál llamar. Por eso se
-- borra la de ocho argumentos antes de crear la de siete.
-- ---------------------------------------------------------------------------
drop function if exists public.guardar_cargo_tabulador(
  bigint, text, numeric, numeric, character, integer, boolean, text);

create or replace function public.guardar_cargo_tabulador(
  p_id     bigint default null,
  p_cargo  text default null,
  p_sueldo numeric default null,
  p_moneda character default 'USD',
  p_orden  integer default 100,
  p_activo boolean default true,
  p_nota   text default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id bigint;
begin
  perform private.exigir_rol('RRHH');

  if length(trim(coalesce(p_cargo, ''))) < 3 then
    raise exception 'El cargo no puede quedar vacío: es el nombre con el que las fichas se enganchan al tabulador.'
      using errcode = '22023';
  end if;

  if p_sueldo is null or p_sueldo < 0 then
    raise exception 'El sueldo mensual tiene que ser un número de cero para arriba.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.nomina_tabulador
      (cargo, sueldo_mensual, moneda, orden, activo, nota, actualizado_por)
    values
      (trim(p_cargo), p_sueldo, p_moneda, coalesce(p_orden, 100),
       coalesce(p_activo, true), nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()))
    returning id into v_id;

    return v_id;
  end if;

  update public.nomina_tabulador set
    cargo          = trim(p_cargo),
    sueldo_mensual = p_sueldo,
    moneda         = p_moneda,
    orden          = coalesce(p_orden, 100),
    activo         = coalesce(p_activo, true),
    nota           = nullif(trim(coalesce(p_nota, '')), ''),
    actualizado_por = (select auth.uid()),
    actualizado_en  = now()
  where id = p_id;

  if not found then
    raise exception 'No existe ese cargo en el tabulador.' using errcode = 'P0002';
  end if;

  return p_id;
exception
  when unique_violation then
    raise exception 'Ya hay un cargo con ese nombre en el tabulador.' using errcode = '23505';
end;
$function$;

revoke execute on function public.guardar_cargo_tabulador(
  bigint, text, numeric, character, integer, boolean, text) from public, anon;
grant execute on function public.guardar_cargo_tabulador(
  bigint, text, numeric, character, integer, boolean, text) to authenticated;
