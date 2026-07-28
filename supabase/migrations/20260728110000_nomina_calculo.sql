-- ============================================================================
-- El motor de nómina
--
-- Calcula un período completo. Es idempotente a propósito: recalcular borra
-- los recibos del período y los vuelve a hacer. Quien corrige una hora extra
-- mal cargada no tiene que adivinar qué quedó a medias.
--
-- El orden del cálculo no es negociable, y sale del art. 104 de la LOTTT:
-- "ninguno de los conceptos que conforman el salario normal producirá efectos
-- sobre sí mismo". Por eso se calcula por capas:
--
--   1. Salario básico del período  → base de los recargos
--   2. Recargos (extras, nocturno, feriados) sobre esa base, no sobre el total
--   3. Salario normal = básico + recargos + primas regulares
--   4. Salario integral = normal + alícuota de bono vacacional + de utilidades
--   5. Deducciones y aportes sobre la base que manda cada ley, que no es la
--      misma para todas
--
-- Sumar todo y sacar porcentajes al final da un número más alto y equivocado.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Días de bono vacacional que le tocan a un empleado
--
-- Quince el primer año y uno más por cada año de servicio, con tope de treinta
-- (LOTTT 192). Se recalcula en cada aniversario, así que no puede guardarse
-- una vez y olvidarse.
-- ---------------------------------------------------------------------------
create or replace function private.dias_bono_vacacional(p_empleado bigint, p_fecha date)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_emp   record;
  v_anios integer;
  v_dias  numeric;
begin
  select * into v_emp from public.empleados where id = p_empleado;

  if v_emp.dias_bono_vacacional is not null then
    return v_emp.dias_bono_vacacional;   -- pactado por contrato
  end if;

  v_anios := greatest(0, extract(year from age(p_fecha, v_emp.fecha_ingreso))::integer);
  v_dias  := private.parametro('bono_vacacional_dias_base', p_fecha) + v_anios;

  return least(v_dias, private.parametro('bono_vacacional_tope', p_fecha));
end;
$$;

-- ---------------------------------------------------------------------------
-- Abrir un período
-- ---------------------------------------------------------------------------
create or replace function public.abrir_periodo(
  p_tipo        text,
  p_desde       date,
  p_hasta       date,
  p_descripcion text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tasas record;
  v_dias  integer;
  v_id    bigint;
begin
  perform private.exigir_rol('RRHH');

  if p_hasta < p_desde then
    raise exception 'El período termina antes de empezar.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.nomina_periodos
    where estado <> 'ANULADA' and tipo = p_tipo
      and desde <= p_hasta and hasta >= p_desde
  ) then
    raise exception 'Ya hay un período % que se solapa con esas fechas. Dos nóminas sobre los mismos días pagarían dos veces.', p_tipo
      using errcode = '55000';
  end if;

  -- Los días que se pagan no son los del calendario: la quincena son 15 y el
  -- mes 30, tenga 28 o 31. El salario mensual se divide siempre entre 30.
  v_dias := case p_tipo
              when 'SEMANAL'   then 7
              when 'QUINCENAL' then 15
              when 'MENSUAL'   then private.parametro('dias_mes_nomina', p_desde)::integer
              else (p_hasta - p_desde) + 1
            end;

  select * into v_tasas from private.tasas_del_dia('VES', p_hasta);

  insert into public.nomina_periodos
    (numero, tipo, desde, hasta, dias, descripcion, tasa, tasa_usd, creado_por)
  values
    (private.siguiente_numero('NOM'), p_tipo, p_desde, p_hasta, v_dias,
     nullif(trim(coalesce(p_descripcion, '')), ''),
     v_tasas.tasa, v_tasas.tasa_usd, (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

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

  update public.nomina_periodos
     set estado = 'CALCULADA', calculada_en = now()
   where id = p_periodo_id;

  return v_recibos;
end;
$$;

-- ---------------------------------------------------------------------------
-- Aprobar y anular
-- ---------------------------------------------------------------------------
create or replace function public.aprobar_nomina(p_periodo_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p       record;
  v_recibos integer;
  v_neto    numeric;
begin
  perform private.exigir_rol('GERENTE_GENERAL');

  select * into v_p from public.nomina_periodos where id = p_periodo_id;

  if v_p.id is null then
    raise exception 'No existe el período %.', p_periodo_id using errcode = 'P0002';
  end if;

  if v_p.estado <> 'CALCULADA' then
    raise exception 'Solo se aprueba una nómina calculada. Esta está en "%".', v_p.estado
      using errcode = '55000';
  end if;

  select count(*), coalesce(sum(neto), 0) into v_recibos, v_neto
  from public.nomina_recibos where periodo_id = p_periodo_id;

  if v_recibos = 0 then
    raise exception 'Este período no tiene ningún recibo. Calcúlalo antes de aprobarlo.'
      using errcode = '55000';
  end if;

  update public.nomina_periodos
     set estado = 'APROBADA', aprobada_por = (select auth.uid()), aprobada_en = now()
   where id = p_periodo_id;

  perform private.notificar(
    'NOMINA', 'APROBADA',
    'Nómina ' || v_p.numero || ' aprobada',
    v_recibos || ' recibos por ' || to_char(v_neto, 'FM999G999G999D00') || ' Bs. Lista para pagar.',
    '/app/nomina/procesos',
    array['TESORERIA', 'RRHH'], 'ATENCION');
end;
$$;

create or replace function public.anular_periodo_nomina(p_periodo_id bigint, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  perform private.exigir_rol('RRHH');

  if length(trim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Escribe por qué se anula la nómina. Es un documento con consecuencias legales.'
      using errcode = '22023';
  end if;

  select estado into v_estado from public.nomina_periodos where id = p_periodo_id;

  if v_estado is null then
    raise exception 'No existe el período %.', p_periodo_id using errcode = 'P0002';
  end if;

  -- Una nómina pagada no se anula: el dinero ya salió. Lo que corresponde es
  -- un ajuste en el período siguiente, que deja rastro de las dos cosas.
  if v_estado = 'PAGADA' then
    raise exception 'Esta nómina ya se pagó y no se puede anular. Corrige la diferencia en el período siguiente.'
      using errcode = '55000';
  end if;

  if v_estado = 'ANULADA' then
    raise exception 'Este período ya estaba anulado.' using errcode = '55000';
  end if;

  update public.nomina_periodos
     set estado = 'ANULADA', anulada_por = (select auth.uid()), anulada_en = now(),
         motivo_anulacion = trim(p_motivo)
   where id = p_periodo_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pagar: aquí la nómina se encuentra con tesorería
--
-- Es la conexión que faltaba. El neto sale de una cuenta concreta y escribe su
-- línea en el libro, igual que el pago de una compra. Sin esto, la nómina
-- quedaría "pagada" sin que el saldo de ninguna cuenta se moviera.
-- ---------------------------------------------------------------------------
create or replace function public.pagar_nomina(
  p_periodo_id bigint,
  p_cuenta_id  bigint,
  p_referencia text default null,
  p_fecha      date default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p      record;
  v_cuenta record;
  v_neto   numeric;
  v_n      integer;
  v_monto  numeric;
  v_mov    bigint;
begin
  perform private.exigir_rol('TESORERIA');

  select * into v_p from public.nomina_periodos where id = p_periodo_id;

  if v_p.id is null then
    raise exception 'No existe el período %.', p_periodo_id using errcode = 'P0002';
  end if;

  if v_p.estado <> 'APROBADA' then
    raise exception 'Solo se paga una nómina aprobada. Esta está en "%".', v_p.estado
      using errcode = '55000';
  end if;

  select count(*), coalesce(sum(neto), 0) into v_n, v_neto
  from public.nomina_recibos where periodo_id = p_periodo_id;

  select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta_id;

  if v_cuenta.id is null then
    raise exception 'Indica de qué cuenta sale el dinero.' using errcode = '22023';
  end if;

  -- Los recibos están en bolívares. Pagando desde una cuenta en divisas, lo
  -- que sale de ella es el equivalente a la tasa del período, la misma con la
  -- que se calculó: usar otra haría que el trabajador cobrara distinto de lo
  -- que dice su recibo.
  v_monto := case when v_cuenta.moneda = 'VES' then v_neto
                  else round(v_neto / v_p.tasa_usd, 2) end;

  v_mov := private.registrar_movimiento_tesoreria(
    p_cuenta_id, 'EGRESO', -1, v_monto,
    'Nómina ' || v_p.numero || ' — ' || v_n || ' trabajador' || case when v_n = 1 then '' else 'es' end,
    p_fecha, p_referencia, 'Personal', null, null, null, null);

  update public.nomina_periodos
     set estado = 'PAGADA', pagada_en = now()
   where id = p_periodo_id;

  perform private.notificar(
    'NOMINA', 'PAGADA',
    'Nómina ' || v_p.numero || ' pagada',
    'Salieron ' || to_char(v_monto, 'FM999G999G999D00') || ' ' || v_cuenta.moneda ||
      ' de ' || v_cuenta.nombre || ' para ' || v_n || ' trabajador' ||
      case when v_n = 1 then '' else 'es' end || '.',
    '/app/nomina/recibos',
    array['GERENTE_GENERAL', 'RRHH', 'TESORERIA'], 'INFO');

  return v_mov;
end;
$$;

-- ---------------------------------------------------------------------------
-- Alta de personal y novedades
-- ---------------------------------------------------------------------------
create or replace function public.guardar_empleado(
  p_id             bigint default null,
  p_ficha          text default null,
  p_cedula         text default null,
  p_nombres        text default null,
  p_apellidos      text default null,
  p_cargo          text default null,
  p_departamento   text default null,
  p_fecha_ingreso  date default null,
  p_frecuencia     text default 'QUINCENAL',
  p_base           text default 'MENSUAL',
  p_salario        numeric default 0,
  p_moneda         char(3) default 'VES',
  p_jornada        text default 'DIURNA',
  p_dias_utilidades numeric default null,
  p_forma_pago     text default 'TRANSFERENCIA',
  p_banco          text default null,
  p_numero_cuenta  text default null,
  p_telefono_pago  text default null,
  p_telefono       text default null,
  p_activo         boolean default true,
  p_nota           text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform private.exigir_rol('RRHH');

  if length(trim(coalesce(p_nombres, ''))) < 2 or length(trim(coalesce(p_apellidos, ''))) < 2 then
    raise exception 'Faltan el nombre y el apellido del trabajador.' using errcode = '22023';
  end if;

  if p_fecha_ingreso is null then
    raise exception 'La fecha de ingreso decide la antigüedad, el bono vacacional y las prestaciones. No puede quedar vacía.'
      using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.empleados
      (ficha, cedula, nombres, apellidos, cargo, departamento, fecha_ingreso,
       frecuencia, base_estipulacion, salario_base, moneda_salario, tipo_jornada,
       dias_utilidades, forma_pago, banco, numero_cuenta, telefono_pago, telefono,
       activo, nota, creado_por)
    values
      (upper(trim(coalesce(nullif(p_ficha, ''), 'F-' || to_char(now(), 'YYYYMMDDHH24MISS')))),
       upper(trim(p_cedula)), trim(p_nombres), trim(p_apellidos), trim(p_cargo),
       nullif(trim(coalesce(p_departamento, '')), ''), p_fecha_ingreso,
       p_frecuencia, p_base, p_salario, p_moneda, p_jornada, p_dias_utilidades,
       p_forma_pago,
       nullif(trim(coalesce(p_banco, '')), ''),
       nullif(trim(coalesce(p_numero_cuenta, '')), ''),
       nullif(trim(coalesce(p_telefono_pago, '')), ''),
       nullif(trim(coalesce(p_telefono, '')), ''),
       coalesce(p_activo, true), nullif(trim(coalesce(p_nota, '')), ''),
       (select auth.uid()))
    returning id into v_id;

    return v_id;
  end if;

  update public.empleados set
    cedula = upper(trim(p_cedula)),
    nombres = trim(p_nombres),
    apellidos = trim(p_apellidos),
    cargo = trim(p_cargo),
    departamento = nullif(trim(coalesce(p_departamento, '')), ''),
    fecha_ingreso = p_fecha_ingreso,
    frecuencia = p_frecuencia,
    base_estipulacion = p_base,
    salario_base = p_salario,
    moneda_salario = p_moneda,
    tipo_jornada = p_jornada,
    dias_utilidades = p_dias_utilidades,
    forma_pago = p_forma_pago,
    banco = nullif(trim(coalesce(p_banco, '')), ''),
    numero_cuenta = nullif(trim(coalesce(p_numero_cuenta, '')), ''),
    telefono_pago = nullif(trim(coalesce(p_telefono_pago, '')), ''),
    telefono = nullif(trim(coalesce(p_telefono, '')), ''),
    activo = coalesce(p_activo, true),
    nota = nullif(trim(coalesce(p_nota, '')), '')
  where id = p_id;

  return p_id;
exception
  when unique_violation then
    raise exception 'Ya hay un trabajador con esa cédula o esa ficha.' using errcode = '23505';
  when check_violation then
    raise exception 'La cédula se escribe como V-12345678 o E-12345678.' using errcode = '23514';
end;
$$;

create or replace function public.egresar_empleado(
  p_id     bigint,
  p_fecha  date,
  p_motivo text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.exigir_rol('RRHH');

  if length(trim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe el motivo del egreso: de él dependen las prestaciones que le tocan.'
      using errcode = '22023';
  end if;

  update public.empleados
     set fecha_egreso = p_fecha, motivo_egreso = trim(p_motivo), activo = false
   where id = p_id;
end;
$$;

create or replace function public.guardar_novedad(
  p_periodo_id bigint,
  p_empleado_id bigint,
  p_he_diurnas  numeric default 0,
  p_he_nocturnas numeric default 0,
  p_horas_nocturnas numeric default 0,
  p_feriados    numeric default 0,
  p_descansos   numeric default 0,
  p_faltas_inj  numeric default 0,
  p_faltas_just numeric default 0,
  p_nota        text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
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

  insert into public.nomina_novedades
    (periodo_id, empleado_id, horas_extra_diurnas, horas_extra_nocturnas,
     horas_nocturnas, dias_feriados_trabajados, dias_descanso_trabajados,
     faltas_injustificadas, faltas_justificadas, nota, registrado_por)
  values
    (p_periodo_id, p_empleado_id, coalesce(p_he_diurnas, 0), coalesce(p_he_nocturnas, 0),
     coalesce(p_horas_nocturnas, 0), coalesce(p_feriados, 0), coalesce(p_descansos, 0),
     coalesce(p_faltas_inj, 0), coalesce(p_faltas_just, 0),
     nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()))
  on conflict (periodo_id, empleado_id) do update set
    horas_extra_diurnas = excluded.horas_extra_diurnas,
    horas_extra_nocturnas = excluded.horas_extra_nocturnas,
    horas_nocturnas = excluded.horas_nocturnas,
    dias_feriados_trabajados = excluded.dias_feriados_trabajados,
    dias_descanso_trabajados = excluded.dias_descanso_trabajados,
    faltas_injustificadas = excluded.faltas_injustificadas,
    faltas_justificadas = excluded.faltas_justificadas,
    nota = excluded.nota,
    registrado_por = excluded.registrado_por,
    registrado_en = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.guardar_novedad_monto(
  p_periodo_id  bigint,
  p_empleado_id bigint,
  p_concepto    text,
  p_monto       numeric,
  p_moneda      char(3) default 'VES',
  p_nota        text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
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

  insert into public.nomina_novedades_montos
    (periodo_id, empleado_id, concepto, monto, moneda, nota, registrado_por)
  values
    (p_periodo_id, p_empleado_id, p_concepto, p_monto, p_moneda,
     nullif(trim(coalesce(p_nota, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.eliminar_novedad_monto(p_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  perform private.exigir_rol('RRHH');

  select p.estado into v_estado
  from public.nomina_novedades_montos n
  join public.nomina_periodos p on p.id = n.periodo_id
  where n.id = p_id;

  if v_estado not in ('BORRADOR', 'CALCULADA') then
    raise exception 'El período está en "%" y ya no admite cambios.', v_estado
      using errcode = '55000';
  end if;

  delete from public.nomina_novedades_montos where id = p_id;
end;
$$;

create or replace function public.guardar_parametro_nomina(
  p_clave       text,
  p_valor       numeric,
  p_unidad      text,
  p_desde       date,
  p_descripcion text,
  p_fuente      text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform private.exigir_rol('RRHH');

  -- Se cierra la vigencia anterior en vez de borrarla: sin el histórico, una
  -- nómina de marzo recalculada en agosto usaría cifras que en marzo no
  -- existían.
  update public.nomina_parametros
     set vigencia_hasta = p_desde - 1
   where clave = p_clave and vigencia_hasta is null and vigencia_desde < p_desde;

  insert into public.nomina_parametros
    (clave, valor, unidad, vigencia_desde, descripcion, fuente, registrado_por)
  values (p_clave, p_valor, p_unidad, p_desde, p_descripcion,
          nullif(trim(coalesce(p_fuente, '')), ''), (select auth.uid()))
  on conflict (clave, vigencia_desde) do update set
    valor = excluded.valor,
    unidad = excluded.unidad,
    descripcion = excluded.descripcion,
    fuente = excluded.fuente,
    registrado_por = excluded.registrado_por,
    registrado_en = now()
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Vistas
-- ---------------------------------------------------------------------------
create or replace view public.v_nomina_periodos
with (security_invoker = on) as
select
  p.*,
  r.recibos,
  coalesce(r.total_neto, 0)       as total_neto,
  coalesce(r.total_asignado, 0)   as total_asignado,
  coalesce(r.total_deducido, 0)   as total_deducido,
  coalesce(r.total_aportes, 0)    as total_aportes,
  coalesce(r.total_neto, 0) / p.tasa_usd as total_neto_usd
from public.nomina_periodos p
left join lateral (
  select count(*) as recibos,
         sum(neto) as total_neto,
         sum(total_asignaciones) as total_asignado,
         sum(total_deducciones) as total_deducido,
         sum(total_aportes) as total_aportes
  from public.nomina_recibos where periodo_id = p.id
) r on true;

grant select on public.v_nomina_periodos to authenticated;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
do $$
declare
  v_firma text;
begin
  foreach v_firma in array array[
    'public.abrir_periodo(text, date, date, text)',
    'public.calcular_nomina(bigint)',
    'public.aprobar_nomina(bigint)',
    'public.anular_periodo_nomina(bigint, text)',
    'public.pagar_nomina(bigint, bigint, text, date)',
    'public.guardar_empleado(bigint, text, text, text, text, text, text, date, text, text, numeric, char, text, numeric, text, text, text, text, text, boolean, text)',
    'public.egresar_empleado(bigint, date, text)',
    'public.guardar_novedad(bigint, bigint, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text)',
    'public.guardar_novedad_monto(bigint, bigint, text, numeric, char, text)',
    'public.eliminar_novedad_monto(bigint)',
    'public.guardar_parametro_nomina(text, numeric, text, date, text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_firma);
    execute format('grant execute on function %s to authenticated', v_firma);
  end loop;
end
$$;
