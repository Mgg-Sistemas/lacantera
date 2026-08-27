/*
  QUIÉN TIENE CARNET Y QUIÉN NO

  Christopher lo pidió así: «dar una opción o pestaña para generar carnets por
  primera vez a todos aquellos que no tengan». Para eso hace falta la lista, y
  la lista tiene que traer de una vez lo necesario para emitir —incluida la foto
  y su encuadre—, porque emitir sin foto deja un carnet cuya página de
  verificación no puede comparar ninguna cara.

  UNA SOLA CONSULTA Y NO UNA POR PERSONA

  Con veintidós trabajadores da igual, pero la pantalla que los lista es la
  misma que va a emitirlos en tanda: pedir el carnet de cada uno por separado
  son veintidós viajes antes de empezar.

  POR QUÉ DEVUELVE EL ENCUADRE Y NO SOLO LA RUTA DE LA FOTO

  De la foto no se guarda un recorte sino dónde mirar —zoom y punto de interés—,
  y el carnet recorta con eso. Sin el encuadre, la copia que se guarda con la
  emisión saldría centrada mientras la impresa está encuadrada, y quien compare
  las dos vería una cara distinta.
*/

create or replace function public.estado_de_los_carnets()
returns table (
  empleado_id bigint,
  ficha       text,
  nombre      text,
  cargo       text,
  foto_path   text,
  foto_zoom   numeric,
  foto_x      numeric,
  foto_y      numeric,
  codigo      text,
  emitido_en  timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  perform private.exigir_permiso('NOMINA', 'LECTURA');

  return query
  select e.id,
         e.ficha,
         e.nombres || ' ' || e.apellidos,
         e.cargo,
         e.foto_path,
         e.foto_zoom,
         e.foto_x,
         e.foto_y,
         c.codigo,
         c.emitido_en
  from public.empleados e
  left join public.carnets c
    on c.empleado_id = e.id and c.estado = 'VIGENTE'
  where e.fecha_egreso is null
  -- Los que no tienen, primero: son los que hay que atender.
  order by (c.codigo is not null), e.ficha;
end;
$function$;

revoke all on function public.estado_de_los_carnets() from public;
revoke execute on function public.estado_de_los_carnets() from anon;
grant execute on function public.estado_de_los_carnets() to authenticated;
