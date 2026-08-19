-- ============================================================================
-- La nómina paga a quien toca en ese período
--
-- `calcular_nomina` recorría a todos los empleados activos sin mirar cómo se
-- les paga. La columna `empleados.frecuencia` existe, se elige al dar de alta
-- al trabajador y se muestra en su ficha, pero el motor nunca la leía.
--
-- El resultado es de dinero, no de estética: abrir una nómina semanal le
-- generaba recibo también a quien cobra mensual. Y como `abrir_periodo` fija
-- los días por el tipo de período —7 la semana, 15 la quincena, 30 el mes—,
-- ese trabajador cobraba siete días cada semana además de sus treinta del mes.
-- Cuatro veces su sueldo, sin que nada en la pantalla lo delatara.
--
-- Ahora cada período paga solo a quien tiene esa frecuencia. El período
-- ESPECIAL es la excepción y alcanza a todo el mundo: es el que se abre para
-- las utilidades o un bono, que no distinguen cómo cobra cada quien.
--
-- Y cuando el período no alcanza a nadie se dice por qué. Un cero callado
-- dejaba el período en pie hasta que alguien intentaba aprobarlo y recibía un
-- "calcúlalo antes de aprobarlo" sobre una nómina que sí se había calculado.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Calcular
-- ---------------------------------------------------------------------------
create or replace function public.calcular_nomina(p_periodo_id bigint)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p        record;
  v_emp      record;
  v_nov      record;
  v_m        record;

  v_sm       numeric;   -- salario mínimo del período
  v_horas_jornada numeric;
  v_dias_pagados  numeric;

  v_basico_diario numeric;
  v_valor_hora    numeric;
  v_monto         numeric;

  v_recargo_he    numeric;
  v_recargo_noc   numeric;
  v_recargo_fer   numeric;
  v_modo          numeric;

  v_recibo_id     bigint;
  v_asignaciones  numeric;
  v_deducciones   numeric;
  v_aportes       numeric;
  v_normal        numeric;   -- salario normal del período
  v_normal_diario numeric;
  v_integral_diario numeric;
  v_normal_mensual  numeric;
  v_integral_mensual numeric;
  v_base            numeric;
  v_tope_prestamo   numeric;

  v_dias_bv       numeric;
  v_dias_util     numeric;
  v_recibos       integer := 0;
  v_frecuencias   text;
begin
  perform private.exigir_rol('RRHH');

  select * into v_p from public.nomina_periodos where id = p_periodo_id;

  if v_p.id is null then
    raise exception 'No existe el período %.', p_periodo_id using errcode = 'P0002';
  end if;

  if v_p.estado not in ('BORRADOR', 'CALCULADA') then
    raise exception 'El período está en "%" y ya no se recalcula. Anúlalo si hay que rehacerlo.', v_p.estado
      using errcode = '55000';
  end if;

  -- Recalcular es rehacer, no acumular. Se borra lo anterior entero.
  delete from public.nomina_recibos where periodo_id = p_periodo_id;

  v_sm            := private.parametro('salario_minimo_nacional', v_p.hasta);
  v_recargo_he    := private.parametro('recargo_hora_extra', v_p.hasta) / 100;
  v_recargo_noc   := private.parametro('recargo_bono_nocturno', v_p.hasta) / 100;
  v_recargo_fer   := private.parametro('recargo_feriado_trabajado', v_p.hasta) / 100;
  v_modo          := private.parametro('modo_concurrencia_recargos', v_p.hasta);

  for v_emp in
    select * from public.empleados
    where activo
      and fecha_ingreso <= v_p.hasta
      and (fecha_egreso is null or fecha_egreso >= v_p.desde)
      -- Cada período paga a quien cobra con esa frecuencia y a nadie más. El
      -- ESPECIAL es la excepción: se abre para las utilidades o un bono, que
      -- alcanzan a la plantilla entera cobre como cobre cada quien.
      and (v_p.tipo = 'ESPECIAL' or frecuencia = v_p.tipo)
    order by apellidos, nombres
  loop
    select * into v_nov
    from public.nomina_novedades
    where periodo_id = p_periodo_id and empleado_id = v_emp.id;

    v_horas_jornada := private.parametro(
      case v_emp.tipo_jornada
        when 'NOCTURNA' then 'jornada_nocturna_horas'
        when 'MIXTA'    then 'jornada_mixta_horas'
        else 'jornada_diurna_horas'
      end, v_p.hasta);

    -- Días efectivamente pagados: los del período menos las faltas sin
    -- justificar. La falta justificada no descuenta salario.
    v_dias_pagados := v_p.dias - coalesce(v_nov.faltas_injustificadas, 0);

    if v_dias_pagados <= 0 then
      continue;   -- No trabajó ningún día del período.
    end if;

    -- El salario diario básico. El mensual se divide entre 30 aunque el mes
    -- tenga 31: es la convención que impone la propia ley al hablar de
    -- salario diario.
    v_basico_diario := case v_emp.base_estipulacion
      when 'MENSUAL' then v_emp.salario_base / private.parametro('dias_mes_nomina', v_p.hasta)
      when 'DIARIO'  then v_emp.salario_base
      when 'HORA'    then v_emp.salario_base * v_horas_jornada
    end;

    -- Un salario pactado en divisas se lleva a bolívares con la tasa del
    -- período: el recibo es un documento en moneda de curso legal.
    if v_emp.moneda_salario <> 'VES' then
      v_basico_diario := v_basico_diario * v_p.tasa;
    end if;

    v_valor_hora := v_basico_diario / v_horas_jornada;

    insert into public.nomina_recibos
      (periodo_id, empleado_id, dias_pagados, salario_basico_diario)
    values (p_periodo_id, v_emp.id, v_dias_pagados, v_basico_diario)
    returning id into v_recibo_id;

    -- ---- Capa 1: el salario básico del período -----------------------------
    v_monto := round(v_basico_diario * v_dias_pagados, 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'SAL-BAS', 'Salario del período', v_dias_pagados,
            v_basico_diario, v_monto, 'ASIGNACION', 10);

    -- ---- Capa 2: recargos, todos sobre el básico ---------------------------
    -- Nunca sobre el acumulado: el art. 104 prohíbe que un concepto del
    -- salario normal produzca efectos sobre sí mismo.
    if coalesce(v_nov.horas_extra_diurnas, 0) > 0 then
      v_monto := round(v_nov.horas_extra_diurnas * v_valor_hora * (1 + v_recargo_he), 2);
      insert into public.nomina_recibo_lineas
        (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
      values (v_recibo_id, 'HE-DIU', 'Horas extra diurnas',
              v_nov.horas_extra_diurnas, v_valor_hora, v_monto, 'ASIGNACION', 30);
    end if;

    if coalesce(v_nov.horas_extra_nocturnas, 0) > 0 then
      -- Dos recargos sobre la misma hora. El documento marca esto como
      -- pendiente de criterio, así que el modo es un parámetro y no una
      -- decisión escondida en el código.
      v_monto := round(v_nov.horas_extra_nocturnas * v_valor_hora *
                 case when v_modo = 2
                      then (1 + v_recargo_he) * (1 + v_recargo_noc)
                      else 1 + v_recargo_he + v_recargo_noc end, 2);
      insert into public.nomina_recibo_lineas
        (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
      values (v_recibo_id, 'HE-NOC', 'Horas extra nocturnas',
              v_nov.horas_extra_nocturnas, v_valor_hora, v_monto, 'ASIGNACION', 35);
    end if;

    if coalesce(v_nov.horas_nocturnas, 0) > 0 then
      v_monto := round(v_nov.horas_nocturnas * v_valor_hora * v_recargo_noc, 2);
      insert into public.nomina_recibo_lineas
        (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
      values (v_recibo_id, 'BON-NOC', 'Bono nocturno',
              v_nov.horas_nocturnas, v_valor_hora, v_monto, 'ASIGNACION', 40);
    end if;

    if coalesce(v_nov.dias_feriados_trabajados, 0) > 0 then
      v_monto := round(v_nov.dias_feriados_trabajados * v_basico_diario * v_recargo_fer, 2);
      insert into public.nomina_recibo_lineas
        (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
      values (v_recibo_id, 'FER-TRAB', 'Recargo por feriado trabajado',
              v_nov.dias_feriados_trabajados, v_basico_diario, v_monto, 'ASIGNACION', 45);
    end if;

    if coalesce(v_nov.dias_descanso_trabajados, 0) > 0 then
      v_monto := round(v_nov.dias_descanso_trabajados * v_basico_diario * v_recargo_fer, 2);
      insert into public.nomina_recibo_lineas
        (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
      values (v_recibo_id, 'DESC-TRAB', 'Recargo por descanso trabajado',
              v_nov.dias_descanso_trabajados, v_basico_diario, v_monto, 'ASIGNACION', 50);
    end if;

    -- ---- Asignaciones cargadas a mano --------------------------------------
    for v_m in
      select n.*, c.nombre, c.tipo, c.orden
      from public.nomina_novedades_montos n
      join public.nomina_conceptos c on c.codigo = n.concepto
      where n.periodo_id = p_periodo_id and n.empleado_id = v_emp.id
        and c.tipo = 'ASIGNACION'
    loop
      v_monto := round(case when v_m.moneda = 'VES' then v_m.monto
                            else v_m.monto * v_p.tasa end, 2);
      insert into public.nomina_recibo_lineas
        (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
      values (v_recibo_id, v_m.concepto, coalesce(v_m.nota, v_m.nombre),
              null, null, v_monto, 'ASIGNACION', v_m.orden);
    end loop;

    -- ---- Capa 3: el salario normal -----------------------------------------
    select coalesce(sum(l.monto), 0) into v_normal
    from public.nomina_recibo_lineas l
    join public.nomina_conceptos c on c.codigo = l.concepto
    where l.recibo_id = v_recibo_id and c.incide_normal;

    v_normal_diario  := v_normal / v_dias_pagados;
    v_normal_mensual := v_normal_diario * private.parametro('dias_mes_nomina', v_p.hasta);

    -- ---- Capa 4: el salario integral ---------------------------------------
    v_dias_bv   := private.dias_bono_vacacional(v_emp.id, v_p.hasta);
    v_dias_util := coalesce(v_emp.dias_utilidades,
                            private.parametro('utilidades_dias_minimo', v_p.hasta));

    v_integral_diario := v_normal_diario
      + (v_normal_diario * v_dias_bv)   / private.parametro('dias_base_alicuotas', v_p.hasta)
      + (v_normal_diario * v_dias_util) / private.parametro('dias_base_alicuotas', v_p.hasta);

    v_integral_mensual := v_integral_diario * private.parametro('dias_mes_nomina', v_p.hasta);

    -- ---- Cestaticket -------------------------------------------------------
    -- No es salario (LOTTT 105.2) pero se paga con la nómina. Va indexado en
    -- dólares porque así se anunció y así se exige.
    v_monto := round(
      private.parametro('cestaticket_mensual_usd', v_p.hasta) * v_p.tasa_usd
      / private.parametro('dias_mes_nomina', v_p.hasta) * v_dias_pagados, 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'CESTA', 'Beneficio de alimentación', v_dias_pagados,
            null, v_monto, 'ASIGNACION', 70);

    -- ---- Capa 5: deducciones ------------------------------------------------
    -- Cada ley manda su propia base y no coinciden. El IVSS y el RPE se
    -- calculan sobre el salario normal con tope; el FAOV sobre el integral y
    -- sin tope.
    v_base := least(v_normal_mensual,
                    v_sm * private.parametro('ivss_tope_salarios_minimos', v_p.hasta));
    v_monto := round(v_base * private.parametro('ivss_trabajador', v_p.hasta) / 100
                     * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'DED-IVSS', 'Seguro social obligatorio', null, v_base,
            v_monto, 'DEDUCCION', 110);

    v_base := greatest(
      least(v_normal_mensual, v_sm * private.parametro('rpe_tope_salarios_minimos', v_p.hasta)),
      v_sm * private.parametro('rpe_piso_salarios_minimos', v_p.hasta));
    v_monto := round(v_base * private.parametro('rpe_trabajador', v_p.hasta) / 100
                     * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'DED-RPE', 'Régimen prestacional de empleo', null, v_base,
            v_monto, 'DEDUCCION', 115);

    v_monto := round(v_integral_mensual * private.parametro('faov_trabajador', v_p.hasta) / 100
                     * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'DED-FAOV', 'Fondo de ahorro para la vivienda', null,
            v_integral_mensual, v_monto, 'DEDUCCION', 120);

    -- Deducciones cargadas a mano, con el tope del art. 154: entre préstamos y
    -- anticipos no se le puede quitar más de un tercio de lo que gana.
    v_tope_prestamo := round(
      (v_normal + 0) * private.parametro('descuento_prestamo_max', v_p.hasta) / 100, 2);

    for v_m in
      select n.*, c.nombre, c.orden
      from public.nomina_novedades_montos n
      join public.nomina_conceptos c on c.codigo = n.concepto
      where n.periodo_id = p_periodo_id and n.empleado_id = v_emp.id
        and c.tipo = 'DEDUCCION'
      order by c.orden
    loop
      v_monto := round(case when v_m.moneda = 'VES' then v_m.monto
                            else v_m.monto * v_p.tasa end, 2);

      if v_m.concepto in ('DED-PRE', 'DED-ANT') and v_monto > v_tope_prestamo then
        raise exception 'A % no se le pueden descontar % por "%": el tope del período es % (un tercio de lo que gana, LOTTT 154).',
          v_emp.nombres || ' ' || v_emp.apellidos, round(v_monto, 2), v_m.nombre, v_tope_prestamo
          using errcode = '22023';
      end if;

      insert into public.nomina_recibo_lineas
        (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
      values (v_recibo_id, v_m.concepto, coalesce(v_m.nota, v_m.nombre),
              null, null, v_monto, 'DEDUCCION', v_m.orden);
    end loop;

    -- ---- Aportes del patrono ------------------------------------------------
    -- No se le descuentan al trabajador: son costo de la empresa. Se guardan
    -- en el recibo porque son parte de lo que cuesta esa nómina y hay que
    -- enterarlos al mismo tiempo.
    v_base := least(v_normal_mensual,
                    v_sm * private.parametro('ivss_tope_salarios_minimos', v_p.hasta));
    v_monto := round(v_base * private.parametro('ivss_patronal', v_p.hasta) / 100
                     * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'APO-IVSS', 'Aporte patronal al seguro social', null,
            v_base, v_monto, 'APORTE', 210);

    v_base := greatest(
      least(v_normal_mensual, v_sm * private.parametro('rpe_tope_salarios_minimos', v_p.hasta)),
      v_sm * private.parametro('rpe_piso_salarios_minimos', v_p.hasta));
    v_monto := round(v_base * private.parametro('rpe_patronal', v_p.hasta) / 100
                     * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'APO-RPE', 'Aporte patronal al régimen de empleo', null,
            v_base, v_monto, 'APORTE', 215);

    v_monto := round(v_integral_mensual * private.parametro('faov_patronal', v_p.hasta) / 100
                     * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'APO-FAOV', 'Aporte patronal al FAOV', null,
            v_integral_mensual, v_monto, 'APORTE', 220);

    -- ---- Provisión de prestaciones -------------------------------------------
    -- Quince días de salario integral por trimestre (LOTTT 142.a). Se prorratea
    -- por período para que el costo aparezca cuando se causa y no de golpe cada
    -- tres meses. No se le descuenta a nadie: se aparta.
    v_monto := round(v_integral_diario
                     * private.parametro('prestaciones_dias_trimestre', v_p.hasta)
                     / 90 * v_dias_pagados, 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'PRV-GAR', 'Provisión de prestaciones sociales', null,
            v_integral_diario, v_monto, 'PROVISION', 310);

    -- ---- Totales -------------------------------------------------------------
    select
      coalesce(sum(monto) filter (where tipo = 'ASIGNACION'), 0),
      coalesce(sum(monto) filter (where tipo = 'DEDUCCION'), 0),
      coalesce(sum(monto) filter (where tipo in ('APORTE', 'PROVISION')), 0)
    into v_asignaciones, v_deducciones, v_aportes
    from public.nomina_recibo_lineas where recibo_id = v_recibo_id;

    update public.nomina_recibos set
      salario_normal_diario   = round(v_normal_diario, 6),
      salario_integral_diario = round(v_integral_diario, 6),
      total_asignaciones      = v_asignaciones,
      total_deducciones       = v_deducciones,
      total_aportes           = v_aportes,
      neto_usd                = round((v_asignaciones - v_deducciones) / v_p.tasa_usd, 2)
    where id = v_recibo_id;

    v_recibos := v_recibos + 1;
  end loop;

  -- Un período que no alcanza a nadie explica por qué. Devolver cero en
  -- silencio lo dejaba en pie hasta que alguien intentaba aprobarlo y recibía
  -- un "calcúlalo antes de aprobarlo" sobre una nómina que sí se había
  -- calculado, que es la forma más rápida de perder una tarde.
  if v_recibos = 0 and v_p.tipo <> 'ESPECIAL' then
    select string_agg(distinct frecuencia, ', ' order by frecuencia)
      into v_frecuencias
    from public.empleados
    where activo
      and fecha_ingreso <= v_p.hasta
      and (fecha_egreso is null or fecha_egreso >= v_p.desde);

    -- Nulo significa que no hay ningún trabajador activo en esas fechas, y eso
    -- no es un error de tipo de período: es una plantilla vacía.
    if v_frecuencias is not null then
      raise exception 'Ningún trabajador activo cobra de forma %. Los que hay cobran: %. Abre el período que corresponda, o corrige la frecuencia en la ficha del trabajador.',
        lower(v_p.tipo), lower(v_frecuencias) using errcode = '55000';
    end if;
  end if;

  update public.nomina_periodos
     set estado = 'CALCULADA', calculada_en = now()
   where id = p_periodo_id;

  return v_recibos;
end;
$$;
