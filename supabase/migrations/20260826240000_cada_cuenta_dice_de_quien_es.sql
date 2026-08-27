/*
  CADA CUENTA DICE DE QUIÉN ES

  La ficha del trabajador ya dice con qué usuario entra esa persona. Christopher
  pidió el camino de vuelta: que la lista de usuarios diga de qué trabajador es
  cada cuenta.

  POR QUÉ UNA FUNCIÓN Y NO UN CRUCE EN EL NAVEGADOR

  La lista de usuarios se lee de `perfiles`, cuya política de lectura es `true`.
  Pero el nombre y la ficha están en `empleados`, y esa exige NOMINA:LECTURA.

  Hoy los dos únicos roles con USUARIOS —ADMIN y GERENTE_GENERAL— tienen también
  NOMINA, así que un cruce hecho en el navegador funcionaría. Y dejaría de
  funcionar en silencio el día que alguien reciba USUARIOS sin NOMINA: la columna
  se quedaría vacía sin un solo error, y quien la mire concluiría que ninguna
  cuenta tiene ficha. Es exactamente el fallo que este sistema arrastra en otros
  sitios — una pantalla prometiendo lo que la base no le va a dar.

  Con esta función, quien puede ver la lista de usuarios ve el vínculo, y punto.

  LA SUGERENCIA ES POR CÉDULA Y SOLO POR CÉDULA

  Cuando una cuenta NO está atada, se busca si hay una ficha que le corresponda.
  Probé a cruzar por nombre y el resultado fue basura: la cuenta «admin_», cuyo
  titular se llama ADMINISTRADOR, casaba con diecinueve trabajadores. En un
  sistema que paga nóminas, sugerir mal es peor que no sugerir.

  Por cédula, normalizada a solo dígitos —las cuentas la guardan «20301176» y las
  fichas «V-20301176», y eso ya costó una vez dar por buena la conclusión de que
  no coincidía ninguna—. Y si hay más de una ficha con la misma cédula no se
  sugiere nada: una sugerencia ambigua no es una sugerencia.

  ENSAYADO CONTRA LOS DATOS REALES

  De las ocho cuentas: una atada (`administradora_` con la ficha 0018), una
  sugerida (`administrador2` con la 0017 de RAFAEL QUILARQUEZ, misma cédula), y
  seis sin nada. Y llamándola con un usuario sin USUARIOS contesta «Tu usuario no
  tiene acceso a Usuarios y roles».
*/

create or replace function public.fichas_de_las_cuentas()
returns table (
  perfil_id   uuid,
  empleado_id bigint,
  ficha       text,
  nombre      text,
  -- `true` cuando no están atadas y solo se parecen por la cédula.
  sugerida    boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  perform private.exigir_permiso('USUARIOS', 'LECTURA');

  return query
  with atadas as (
    select e.perfil_id,
           e.id,
           e.ficha,
           e.nombres || ' ' || e.apellidos as nombre
    from public.empleados e
    where e.perfil_id is not null
  ),
  candidatas as (
    /*
      Una sola ficha libre por cuenta, y solo si la cédula coincide entera.
      `count(*) over` sirve para descartar el empate: con dos fichas de la misma
      cédula no se enseña ninguna.
    */
    select p.id as perfil_id,
           e.id as empleado_id,
           e.ficha,
           e.nombres || ' ' || e.apellidos as nombre,
           count(*) over (partition by p.id) as cuantas
    from public.perfiles p
    join public.empleados e
      on e.perfil_id is null
     and e.fecha_egreso is null
     and nullif(regexp_replace(coalesce(e.cedula, ''), '\D', '', 'g'), '')
         = nullif(regexp_replace(coalesce(p.cedula, ''), '\D', '', 'g'), '')
    where not exists (select 1 from public.empleados x where x.perfil_id = p.id)
  )
  select a.perfil_id, a.id, a.ficha, a.nombre, false
  from atadas a
  union all
  select c.perfil_id, c.empleado_id, c.ficha, c.nombre, true
  from candidatas c
  where c.cuantas = 1;
end;
$function$;

revoke all on function public.fichas_de_las_cuentas() from public;
revoke execute on function public.fichas_de_las_cuentas() from anon;
grant execute on function public.fichas_de_las_cuentas() to authenticated;
