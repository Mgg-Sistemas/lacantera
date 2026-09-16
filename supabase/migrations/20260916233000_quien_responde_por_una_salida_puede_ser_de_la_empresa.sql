/*
  QUIEN RESPONDE POR UNA SALIDA PUEDE SER DE LA EMPRESA

  Christopher, 16/09/2026, con «Solicitar salida de material» delante: el campo
  «¿Quién responde por ello?» «puede ser texto libre o bien puede ser alguien
  de la empresa». Material que sale hacia fuera muchas veces lo lleva o lo
  entrega un trabajador de la casa, y teclear su nombre deja la puerta abierta
  a tres maneras de escribirlo.

  El formulario necesita la lista de la gente de la empresa, y `empleados` solo
  la lee quien tiene nómina. Esta función la da a quien trabaja en Salidas, con
  lo justo para reconocer a alguien —nombre y cargo— y nada de la ficha: ni la
  cédula, ni el salario, ni la fecha de ingreso. Es la misma idea que
  `personas_para_vale` en combustible.

  Lo que se guarda en la salida sigue siendo el nombre, como hasta hoy: la nota
  lo imprime igual venga de la lista o tecleado.
*/

create function public.personas_de_la_empresa()
returns table(id bigint, nombre text, cargo text)
language plpgsql
stable
security definer
set search_path to ''
as $func$
begin
  perform private.exigir_permiso('SALIDAS', 'LECTURA');

  return query
  select e.id,
         btrim(e.nombres || ' ' || e.apellidos),
         e.cargo
    from public.empleados e
   where e.activo
   order by e.apellidos, e.nombres;
end;
$func$;

revoke all on function public.personas_de_la_empresa() from public, anon;
grant execute on function public.personas_de_la_empresa() to authenticated, service_role;
