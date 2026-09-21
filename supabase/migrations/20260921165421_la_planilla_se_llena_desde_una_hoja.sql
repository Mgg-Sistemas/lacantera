-- LA PLANILLA SE PUEDE LLENAR DESDE UNA HOJA DE EXCEL
--
-- Christopher, 21/09/2026: «debería poder cargar masivamente por Excel, y
-- descargar la plantilla». La pantalla baja la plantilla con las filas que se
-- ven, se llena en Excel y se sube; esto guarda todas las filas de una vez.
--
-- TODO O NADA: es una sola función, así que si una fila trae un status que no
-- existe o un precio negativo, no se guarda ninguna. Media carga es peor que
-- ninguna: no se sabría cuáles entraron.
--
-- Sigue sin escribir fuera del módulo: cada fila pasa por
-- guardar_control_despacho, que comprueba el permiso y solo toca control_despacho.

create or replace function public.cargar_control_despacho(p_filas jsonb)
returns integer
language plpgsql security definer set search_path to ''
as $$
declare
  v_fila jsonb;
  v_n integer := 0;
begin
  perform private.exigir_permiso('CONTROL_DESPACHO', 'ESCRITURA');

  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
    raise exception 'La carga no trae filas.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_filas) > 2000 then
    raise exception 'Son demasiadas filas para una sola carga: parte la hoja en tandas de 2000.' using errcode = '22023';
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    perform public.guardar_control_despacho(
      v_fila->>'origen',
      (v_fila->>'id')::bigint,
      v_fila->>'rif',
      (v_fila->>'precio')::numeric,
      v_fila->>'estado',
      v_fila->>'observacion',
      v_fila->>'extra');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.cargar_control_despacho(jsonb) from public, anon;
grant execute on function public.cargar_control_despacho(jsonb) to authenticated;
