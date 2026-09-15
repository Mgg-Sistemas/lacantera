/*
  LA PLANILLA SOLO CULPA A LA TASA CUANDO DE VERDAD FALTA

  El carril de base de datos, al auditar `20260915190000`: la revisión de la
  planilla atrapaba cualquier error al pedir la tasa del día y lo contaba como
  «no hay tasa de hoy». Un fallo de otra naturaleza —un tiempo agotado, un
  error en `obtener_tasa`— quedaría disfrazado de tasa ausente, y quien carga
  iría a registrar una tasa que ya estaba.

  `private.tasas_del_dia` avisa de la tasa que falta con el código P0002. Se
  atrapa solo ese; cualquier otro sale como lo que es.

  Christopher: «Procede».
*/
do $mig$
declare
  v_def   text := pg_get_functiondef('public.cargar_articulos_por_lote(jsonb,boolean)'::regprocedure);
  v_ancla text := $a$              exception when others then
                v_motivo := format('No hay tasa de %s para hoy$a$;
begin
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'la captura de la tasa no aparece exactamente una vez';
  end if;

  v_def := replace(v_def, v_ancla, $n$              exception when sqlstate 'P0002' then
                v_motivo := format('No hay tasa de %s para hoy$n$);

  execute v_def;
end
$mig$;

do $ver$
declare
  v_def text := pg_get_functiondef('public.cargar_articulos_por_lote(jsonb,boolean)'::regprocedure);
begin
  if position($t$exception when sqlstate 'P0002' then$t$ in v_def) = 0
     or position($t$exception when others then
                v_motivo := format('No hay tasa$t$ in v_def) > 0 then
    raise exception 'la planilla sigue atrapando cualquier error como tasa ausente';
  end if;
end
$ver$;
