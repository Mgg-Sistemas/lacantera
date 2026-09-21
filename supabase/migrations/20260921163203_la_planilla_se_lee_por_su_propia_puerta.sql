-- LA PLANILLA SE LEE POR SU PROPIA PUERTA
--
-- Con security_invoker, quien tuviera SOLO el permiso de Control de despacho no
-- podría leer el libro de inventario, sus salidas desaparecerían de la vista y
-- —peor— saldrían como «sin documento», que es justo la alarma falsa que esta
-- planilla no puede dar. La vista pasa a leerse con los permisos de su dueño y
-- deja de estar al alcance directo de nadie: se entra por una función que
-- comprueba el permiso del módulo. Sigue siendo solo lectura.

alter view public.v_control_despacho set (security_invoker = off);
revoke all on public.v_control_despacho from public, anon, authenticated;

create or replace function public.control_despacho_planilla(p_desde date default null, p_hasta date default null)
returns setof public.v_control_despacho
language plpgsql stable security definer set search_path to ''
as $$
begin
  perform private.exigir_permiso('CONTROL_DESPACHO', 'LECTURA');
  return query
    select * from public.v_control_despacho v
     where (p_desde is null or v.fecha is null or v.fecha >= p_desde)
       and (p_hasta is null or v.fecha is null or v.fecha <= p_hasta)
     order by v.origen desc, v.documento, v.clave;
end;
$$;

revoke execute on function public.control_despacho_planilla(date, date) from public, anon;
grant execute on function public.control_despacho_planilla(date, date) to authenticated;
