/*
  EL REPORTE DEL DÍA SE ARMA SOLO.

  Cada tarde alguien escribe a mano, en WhatsApp, lo mismo que el sistema ya
  sabe: qué equipos trabajaron, cuántos viajes bajó cada camión, y los totales.
  Christopher: «que copiarían y pegarían para enviar a ws».

  Lo único que no está en ninguna tabla son las novedades —la manguera del
  Doosan, el generador—, y por eso se teclean al generar el reporte y no se
  guardan: son el texto de ese día, no un dato del sistema.

  ═══════════════════════════════════════════════════════════════════════════
  POR QUÉ ESTO ES UNA FUNCIÓN Y NO UNA VISTA
  ═══════════════════════════════════════════════════════════════════════════

  «Equipos en operación» son los que tienen horas anotadas ese día, y eso vive
  en Maquinaria: `horometro_lecturas` y `maquinaria`, con su propia reja. Quien
  carga los viajes es un analista administrativo con Explotación, no con
  Maquinaria.

  Si esto fuera una vista `security_invoker`, a ese analista le devolvería CERO
  FILAS y el reporte saldría con la sección de equipos vacía — no con un error,
  con un silencio. Es exactamente el fallo que esta misma semana dejó la
  pantalla de viajes en blanco, y el que ya costó el nombre de quien recibe en
  el vale de combustible.

  Así que es SECURITY DEFINER y hace su propia pregunta: quien pueda LEER
  Explotación puede ver qué máquinas trabajaron hoy. No abre Maquinaria: no
  enseña costos, ni mantenimiento, ni de quién es cada equipo. Solo qué
  trabajó y cuántas horas, que es lo que el reporte dice.
*/

create or replace function public.equipos_en_operacion(p_fecha date)
returns table (
  codigo   text,
  maquina  text,
  tipo     text,
  horas    numeric,
  operador text
)
language plpgsql
security definer
set search_path to ''
stable
as $$
begin
  perform private.exigir_permiso('EXPLOTACION', 'LECTURA');

  return query
    select
      m.codigo,
      m.nombre,
      m.tipo,
      h.horas,
      -- El nombre del operador solo si la lectura dice quién fue. En blanco
      -- antes que inventarlo: el reporte lo lee gente que sabe quién opera qué.
      nullif(btrim(coalesce(e.nombres, '') || ' ' || coalesce(e.apellidos, '')), '')
    from public.horometro_lecturas h
    join public.maquinaria m on m.id = h.maquina_id
    left join public.empleados e on e.id = h.operador_id
    where h.fecha = p_fecha
      -- Una lectura de cero horas es «se anotó el horómetro y no se movió».
      -- Ese equipo no estuvo en operación.
      and coalesce(h.horas, 0) > 0
    order by m.codigo;
end;
$$;

comment on function public.equipos_en_operacion(date) is
  'Que maquinas trabajaron un dia y cuantas horas, para el reporte diario de '
  'operaciones. Pregunta por Explotacion, no por Maquinaria: quien carga los '
  'viajes no tiene por que tener el modulo de equipos.';

revoke execute on function public.equipos_en_operacion(date) from public, anon;
grant  execute on function public.equipos_en_operacion(date) to authenticated;
