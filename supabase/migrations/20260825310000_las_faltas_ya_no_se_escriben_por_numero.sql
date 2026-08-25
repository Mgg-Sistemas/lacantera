-- Las faltas ya no se escriben por número: las manda el calendario.
--
-- `guardar_novedad` escribía las dos columnas de faltas junto con las horas
-- extra. Ahora esas columnas las mantiene `private.recontar_faltas` a partir de
-- los días señalados, así que si la pantalla sigue mandando los dos números
-- —aunque sea un cero, aunque sea sin querer— borra los días marcados.
--
-- Y no basta con quitarlo de la pantalla: bastaría una pestaña abierta desde
-- antes del cambio para vaciar la quincena de alguien al guardar sus horas
-- extra. Se cierra aquí, que es donde no se puede saltar.
--
-- Los dos parámetros SE QUEDAN en la firma. Quitarlos crearía una segunda
-- función —regla 7— y dejaría reventando a cualquier llamada vieja. Se aceptan
-- y se ignoran, y el comentario dice por qué para que nadie los «arregle»
-- volviendo a conectarlos.
--
-- COMPROBADO en transacción revertida: se marcan un día injustificado y uno
-- justificado, se guardan cuatro horas extra mandando faltas en cero, y las
-- faltas siguen en 1 y 1.

create or replace function public.guardar_novedad(
  p_periodo_id bigint,
  p_empleado_id bigint,
  p_he_diurnas numeric default 0,
  p_he_nocturnas numeric default 0,
  p_horas_nocturnas numeric default 0,
  p_feriados numeric default 0,
  p_descansos numeric default 0,
  p_faltas_inj numeric default 0,
  p_faltas_just numeric default 0,
  p_nota text default null::text
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_estado text;
  v_id     bigint;
begin
  perform private.exigir_rol('RRHH');

  select estado into v_estado from public.nomina_periodos where id = p_periodo_id;

  if v_estado not in ('BORRADOR', 'CALCULADA') then
    raise exception 'El período está en "%" y ya no admite cambios.', v_estado
      using errcode = '55000';
  end if;

  /*
    p_faltas_inj y p_faltas_just SE IGNORAN a propósito.

    Las faltas se señalan por día en public.nomina_faltas y de ahí las recuenta
    private.recontar_faltas. Escribirlas aquí borraría los días marcados.

    No se quitan de la firma porque quitarlas dejaría dos funciones vivas
    (regla 7) y rompería cualquier llamada que todavía las mande.
  */
  insert into public.nomina_novedades
    (periodo_id, empleado_id, horas_extra_diurnas, horas_extra_nocturnas,
     horas_nocturnas, dias_feriados_trabajados, dias_descanso_trabajados,
     faltas_injustificadas, faltas_justificadas, nota, registrado_por)
  values
    (p_periodo_id, p_empleado_id, coalesce(p_he_diurnas, 0), coalesce(p_he_nocturnas, 0),
     coalesce(p_horas_nocturnas, 0), coalesce(p_feriados, 0), coalesce(p_descansos, 0),
     -- En una fila nueva, lo que haya señalado ya el calendario. Cero, casi
     -- siempre: lo normal es cargar las horas antes que las faltas.
     (select count(*) from public.nomina_faltas
       where periodo_id = p_periodo_id and empleado_id = p_empleado_id
         and tipo = 'INJUSTIFICADA'),
     (select count(*) from public.nomina_faltas
       where periodo_id = p_periodo_id and empleado_id = p_empleado_id
         and tipo = 'JUSTIFICADA'),
     nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()))
  on conflict (periodo_id, empleado_id) do update set
    horas_extra_diurnas = excluded.horas_extra_diurnas,
    horas_extra_nocturnas = excluded.horas_extra_nocturnas,
    horas_nocturnas = excluded.horas_nocturnas,
    dias_feriados_trabajados = excluded.dias_feriados_trabajados,
    dias_descanso_trabajados = excluded.dias_descanso_trabajados,
    -- Las faltas NO se tocan: las manda el calendario.
    nota = excluded.nota,
    registrado_por = excluded.registrado_por,
    registrado_en = now()
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.guardar_novedad(bigint, bigint, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.guardar_novedad(bigint, bigint, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) to authenticated;

comment on function public.guardar_novedad(bigint, bigint, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) is
  'Guarda las horas extra y los recargos de un trabajador en un periodo. Los dos parametros de faltas se aceptan y se IGNORAN: las faltas se señalan por dia en nomina_faltas y de ahi se recuentan. Se dejan en la firma para no partir la funcion en dos (regla 7).';
