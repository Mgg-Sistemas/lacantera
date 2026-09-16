/*
  EL ORGANIGRAMA LO PUEDE MIRAR CUALQUIERA; TOCARLO, NO

  Christopher, 16/09/2026, cuando le propuse completar los grupos que faltan:

    «El organigrama puede ser editable por admin, RRHH, pero lo mantendremos
    como está, no tenemos la instrucción de modificarlo. Así mismo, ¿qué pasa si
    alguien inventa o crea Limpieza, Contrata, y así indiscriminadamente? Por
    eso, solo personas autorizadas pueden editar el organigrama, aunque todos
    deberían poder descargarlo en pdf o imagen».

  Las dos mitades. Editar sigue pidiendo NOMINA en escritura y lo niega la base,
  no la pantalla: si cualquiera pudiera crear ramas, en una semana habría tres
  «Limpieza» y ningún organigrama. Mirarlo es otra cosa: saber a quién le toca
  qué no le hace daño a nadie y le ahorra a media empresa preguntarlo.

  `organigrama_nodos` lo cierra su RLS a quien tiene nómina, así que mirarlo
  necesitaba una puerta. No se abre la tabla —eso abriría también lo que cuelga
  de ella—: esta función devuelve el árbol tal como lo enseña la vista, y nada
  más, a quien tenga sesión.
*/
create or replace function public.organigrama_para_todos()
returns setof public.v_organigrama
language sql
stable
security definer
set search_path to ''
as $func$
  select * from public.v_organigrama order by camino;
$func$;

revoke all on function public.organigrama_para_todos() from public, anon;
grant execute on function public.organigrama_para_todos() to authenticated;

comment on function public.organigrama_para_todos() is
  'El organigrama para mirarlo y descargarlo. Lo puede llamar cualquiera con sesión; editarlo sigue pidiendo NOMINA en escritura.';

do $ver$
begin
  if not has_function_privilege('authenticated', 'public.organigrama_para_todos()', 'execute') then
    raise exception 'el organigrama no lo puede leer quien tiene sesión';
  end if;
  if has_function_privilege('anon', 'public.organigrama_para_todos()', 'execute') then
    raise exception 'el organigrama se puede leer sin sesión';
  end if;
end
$ver$;
