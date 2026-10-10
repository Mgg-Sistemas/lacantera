-- ═══════════════════════════════════════════════════════════════════════════
-- EL EMPLEADO SE PUEDE REINCORPORAR
--
-- Se pidió un botón de «Reincorporar», al lado de «Editar datos», para quien
-- ya está desincorporado. `egresar_empleado` solo sabía ir en una dirección
-- —`activo` a falso, con su fecha y su motivo—; esto es el camino de vuelta.
--
-- QUÉ DESHACE, Y QUÉ NO TOCA
--
-- Deshace exactamente lo que `egresar_empleado` escribió: `activo` vuelve a
-- verdadero y `fecha_egreso`/`motivo_egreso` vuelven a nulos — la ficha deja
-- de decir «Desincorporado» y de enseñar la sección «Egreso», con la misma
-- antigüedad de siempre (cuenta desde `fecha_ingreso`, que no se toca: esto
-- no es una ficha nueva, es la misma persona que vuelve).
--
-- No toca nada más, por la misma razón que `egresar_empleado` tampoco lo
-- hacía: `calcular_nomina` no filtra por `activo` -usa el solape de fechas- y
-- cada recibo ya emitido congela `egresado_en` en el momento de calcularse
-- (20260831100000_al_desincorporado_se_le_paga.sql). El recibo de un mes en
-- que la persona estaba de baja sigue diciéndolo, se reincorpore cuando se
-- reincorpore. Tampoco toca `perfiles`: el egreso nunca tocó la cuenta de
-- acceso, así que la reincorporación no tiene una que restaurar.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.reincorporar_empleado(p_id bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_empleado record;
begin
  perform private.exigir_rol('RRHH');

  select id, nombres, apellidos, activo into v_empleado from public.empleados where id = p_id;
  if v_empleado.id is null then
    raise exception 'No existe ese trabajador.' using errcode = 'P0002';
  end if;
  if v_empleado.activo then
    raise exception 'El trabajador "% %" ya está activo.', v_empleado.nombres, v_empleado.apellidos
      using errcode = '55000';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe el motivo de la reincorporación: queda en la auditoría.'
      using errcode = '22023';
  end if;

  update public.empleados
     set activo = true, fecha_egreso = null, motivo_egreso = null
   where id = p_id;
end;
$func$;

revoke all on function public.reincorporar_empleado(bigint, text) from public, anon;
grant execute on function public.reincorporar_empleado(bigint, text) to authenticated;

do $comprueba$
declare
  v_oid regprocedure := 'public.reincorporar_empleado(bigint, text)'::regprocedure;
begin
  if has_function_privilege('anon', v_oid, 'execute') then
    raise exception 'reincorporar_empleado no puede ser ejecutable por anon.';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception 'reincorporar_empleado tiene que ser ejecutable por authenticated (exige el rol por dentro).';
  end if;
end
$comprueba$;
