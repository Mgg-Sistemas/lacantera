-- ============================================================================
-- Borrar un empleado: solo el que nunca existió
--
-- Hay dos cosas distintas que en la calle se llaman igual:
--
--   · Alguien que trabajó y se fue. Su historia se conserva entera: cobró,
--     firmó recibos y hay dinero que salió a su nombre. Eso NO se borra — se
--     egresa, con fecha y motivo, y sigue estando para cuando lo pida una
--     inspección o el propio trabajador.
--
--   · Alguien que se cargó por error. Nombre mal escrito, cédula repetida,
--     una ficha creada dos veces. Nunca cobró nada. Dejarlo egresado ensucia
--     la lista y hace dudar de si esa persona existió.
--
-- Esta función es para lo segundo, y comprueba antes de borrar. No es una
-- cortesía: si borrar arrastrara recibos, el libro de nómina dejaría de
-- cuadrar con lo que salió de tesorería, y eso no se descubre hasta el cierre.
-- ============================================================================

-- Devuelve la ruta de la foto, si tenía. La base no habla con el
-- almacenamiento: quien llama es el que puede borrar el archivo, y sin este
-- dato la foto quedaría ocupando espacio pagado para siempre.
create or replace function public.eliminar_empleado(p_id bigint)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nombre    text;
  v_recibos   int;
  v_novedades int;
  v_foto      text;
begin
  perform private.exigir_rol('RRHH');

  select trim(e.nombres || ' ' || e.apellidos), e.foto_path
    into v_nombre, v_foto
    from public.empleados e
   where e.id = p_id;

  if v_nombre is null then
    raise exception 'No existe ese trabajador.' using errcode = '22023';
  end if;

  select count(*) into v_recibos   from public.nomina_recibos   where empleado_id = p_id;
  select count(*) into v_novedades from public.nomina_novedades where empleado_id = p_id;

  if v_recibos > 0 then
    raise exception
      '% tiene % recibo(s) de nómina. No se puede borrar a quien ya cobró: egrésalo con su fecha y su motivo, y su historia se conserva.',
      v_nombre, v_recibos
      using errcode = '23503';
  end if;

  if v_novedades > 0 then
    raise exception
      '% tiene % novedad(es) registradas. Bórralas primero, o egrésalo si de verdad trabajó.',
      v_nombre, v_novedades
      using errcode = '23503';
  end if;

  delete from public.empleados where id = p_id;

  return v_foto;
end;
$$;

revoke execute on function public.eliminar_empleado(bigint) from public, anon;
grant   execute on function public.eliminar_empleado(bigint) to authenticated;
