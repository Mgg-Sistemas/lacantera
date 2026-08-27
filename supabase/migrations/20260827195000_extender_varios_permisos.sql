/*
  EXTENDER VARIOS PERMISOS DE UNA VEZ.

  «En vez de agregar uno por uno, la opcion de marcar varios». Prestarle cuatro
  casillas a la misma persona eran cuatro pasadas por el mismo formulario,
  escribiendo la misma justificacion cada vez.

  CADA UNA EN SU PROPIO BLOQUE, Y ESO NO ES ADORNO.

  Un bloque con EXCEPTION abre una subtransaccion, asi que la que falla se
  deshace sola y las demas siguen. Hace falta porque `autorizar_accion` rechaza
  cosas que en un lote son normales y no son error de quien las manda: que la
  persona ya pueda esa casilla por su rol, o que quien extiende no la tenga por
  derecho propio. Con todo en la misma transaccion, marcar cinco y que una ya
  la tuviera no dejaria ninguna.

  SE REUSA `autorizar_accion` ENTERA en vez de copiar sus comprobaciones. Son
  ocho, incluidas las dos casillas que no se prestan nunca y la que impide
  extenderse permisos a uno mismo. Duplicarlas seria dejar dos puertas que hay
  que acordarse de cerrar las dos veces, y la que se olvide sera la de aqui.

  Devuelve cuantas entraron y cuales no, con su motivo, porque el modal tiene
  que poder decirlo: cerrar diciendo «listo» habiendo extendido tres de cinco
  es como no decirlo, y las dos que faltan se descubren el dia que alguien no
  puede hacer lo que creia que podia.
*/

create or replace function public.autorizar_varias(
  p_usuario_id uuid,
  p_acciones   text[],
  p_motivo     text,
  p_desde      date default null,
  p_hasta      date default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_accion   text;
  v_hechas   integer := 0;
  v_omitidas jsonb := '[]'::jsonb;
  v_nombre   text;
begin
  perform private.exigir_rol('ADMIN', 'GERENTE_GENERAL');

  if p_acciones is null or array_length(p_acciones, 1) is null then
    raise exception 'No elegiste ninguna casilla que extender.' using errcode = '22023';
  end if;

  foreach v_accion in array p_acciones loop
    begin
      perform public.autorizar_accion(p_usuario_id, v_accion, p_motivo, p_desde, p_hasta);
      v_hechas := v_hechas + 1;
    exception
      when others then
        select nombre into v_nombre from public.acciones where codigo = v_accion;
        v_omitidas := v_omitidas || jsonb_build_object(
          'accion', coalesce(v_nombre, v_accion),
          'motivo', sqlerrm);
    end;
  end loop;

  if v_hechas = 0 then
    raise exception 'No se extendio ninguna. %',
      (select string_agg(x->>'accion' || ': ' || (x->>'motivo'), ' - ')
         from jsonb_array_elements(v_omitidas) x)
      using errcode = '55000';
  end if;

  return jsonb_build_object('extendidas', v_hechas, 'omitidas', v_omitidas);
end;
$function$;

revoke all on function public.autorizar_varias(uuid, text[], text, date, date) from public, anon;
grant execute on function public.autorizar_varias(uuid, text[], text, date, date)
  to authenticated, service_role;

/*
  COMPROBADO DESPUES DE APLICARLA

    select p.oid::regprocedure::text,
           has_function_privilege('anon', p.oid, 'execute') as la_tiene_anon,
           p.proconfig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'autorizar_varias';
    -- autorizar_varias(uuid,text[],text,date,date) | false | {search_path=""}
*/
