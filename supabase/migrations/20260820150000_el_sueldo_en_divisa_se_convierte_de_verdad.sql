-- ---------------------------------------------------------------------------
-- El sueldo en divisa se convierte a bolívares de verdad
--
-- LO QUE PASABA
--
-- `abrir_periodo` congelaba las tasas del período con
-- `private.tasas_del_dia('VES', p_hasta)`. Esa función devuelve la tasa de la
-- moneda que se le pide **contra el bolívar**, así que para 'VES' devuelve 1:
-- es el bolívar contra sí mismo. `nomina_periodos.tasa` valía 1 siempre y no
-- llevaba información ninguna.
--
-- Y `calcular_nomina` usaba justo ese 1 para convertir los sueldos:
--
--     if v_emp.moneda_salario <> 'VES' then
--       v_basico_diario := v_basico_diario * v_p.tasa;   -- × 1
--     end if;
--
-- El efecto no es un redondeo: la cifra en dólares se escribía tal cual en una
-- casilla que todo el resto del sistema lee como bolívares. Un sueldo de 500
-- USD/mes daba una quincena de 250,00 Bs en vez de 193.833,90 — 775 veces por
-- debajo, que es exactamente la tasa del día.
--
-- No era un caso de borde: los 19 trabajadores activos y los 12 cargos del
-- tabulador están todos en USD. Salían mal todos los recibos.
--
-- ERAN TRES SITIOS, NO UNO
--
-- Además del salario básico, las dos vueltas sobre `nomina_novedades_montos`
-- —la de asignaciones y la de deducciones— hacían el mismo `* v_p.tasa`. Un
-- bono o una cuota de préstamo cargados en dólares salían igual de aplastados.
--
-- Y ARRASTRABA EL BLOQUE LEGAL ENTERO
--
-- IVSS, RPE, FAOV, los dos aportes patronales y la provisión de prestaciones
-- se calculan sobre `v_normal_mensual`, que sale del salario. Con el salario
-- aplastado, a una ficha de 500 USD se le dedujeron 10,00 Bs de seguro social.
-- Lo más caro de esto no es la deducción: es que la provisión de prestaciones
-- quedaba mal, y eso es lo que se le va acumulando a cada trabajador.
--
-- POR QUÉ SE PODÍA VER Y NO SE VIO
--
-- Dentro de la misma función `tasa_usd` se usa **bien** dos veces —el
-- cestaticket y el `neto_usd`— y `tasa` se usaba **mal** tres. En el mismo
-- recibo el cestaticket salía 62 veces mayor que el salario. Estaba en
-- pantalla.
--
-- CÓMO SE ARREGLA
--
-- Se deja de preguntar si la moneda es bolívar y se multiplica siempre por la
-- tasa de la moneda que toque, pedida a `tasas_del_dia` con la moneda real de
-- cada sueldo y de cada novedad. Para 'VES' esa tasa es 1, así que el caso
-- bolívar sigue saliendo igual y desaparece el `if` que era la trampa.
--
-- Se descartó el atajo de cambiar `v_p.tasa` por `v_p.tasa_usd`. Resolvía hoy
-- —todo está en USD— pero dejaba el mismo agujero abierto para el día que
-- entre un sueldo en euros, y `monedas` ya tiene el EUR activo.
--
-- La tasa se pide con la fecha de cierre del período, así que un recálculo da
-- el mismo número mientras la tasa de ese día no se corrija; y si se corrige,
-- se corrige la nómina, que es lo que se quiere. Los períodos pagados no se
-- recalculan —`calcular_nomina` solo admite BORRADOR y CALCULADA—, así que lo
-- ya pagado no se toca.
--
-- Y `abrir_periodo` deja de guardar un 1 disfrazado de tasa: congela la del
-- dólar, que es la moneda en la que están estipulados los sueldos y la que ya
-- usaba `neto_usd`. Así la columna deja de engañar a quien lea el código.
-- ---------------------------------------------------------------------------
create or replace function public.abrir_periodo(
  p_tipo        text,
  p_desde       date,
  p_hasta       date,
  p_descripcion text default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
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

  -- 'USD' y no 'VES'. Pedirla en bolívares devolvía 1 —el bolívar contra sí
  -- mismo— y esa columna se usaba después para convertir sueldos en divisa.
  select * into v_tasas from private.tasas_del_dia('USD', p_hasta);

  insert into public.nomina_periodos
    (numero, tipo, desde, hasta, dias, descripcion, tasa, tasa_usd, creado_por)
  values
    (private.siguiente_numero('NOM'), p_tipo, p_desde, p_hasta, v_dias,
     nullif(trim(coalesce(p_descripcion, '')), ''),
     v_tasas.tasa, v_tasas.tasa_usd, (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$function$;

comment on column public.nomina_periodos.tasa is
  'Bolívares por dólar del día de cierre, congelada al abrir. Hasta el '
  '20/08/2026 se guardaba aquí la tasa del bolívar contra sí mismo, que es 1, '
  'y con ese 1 se "convertían" los sueldos en divisa.';

comment on column public.nomina_periodos.tasa_usd is
  'Bolívares por dólar del día de cierre. Es con la que se valora el '
  'cestaticket y con la que se expresa el neto en dólares.';

-- ---------------------------------------------------------------------------
-- Y el cálculo, con los tres sitios corregidos
-- ---------------------------------------------------------------------------
create or replace function public.calcular_nomina(p_periodo_id bigint)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_p        record;
  v_emp      record;
  v_nov      record;
  v_m        record;

  v_sm       numeric;
  v_horas_jornada numeric;
  v_dias_pagados  numeric;

  v_basico_diario numeric;
  v_valor_hora    numeric;
  v_monto         numeric;

  -- Bolívares por unidad de la moneda en que está estipulado cada sueldo y
  -- cada novedad. Para 'VES' vale 1, así que el caso bolívar no necesita un
  -- `if` aparte — y ese `if` era justo donde vivía el fallo.
  v_tasa_salario numeric;
  v_tasa_linea   numeric;

  v_recargo_he    numeric;
  v_recargo_noc   numeric;
  v_recargo_fer   numeric;
  v_modo          numeric;

  v_recibo_id     bigint;
  v_asignaciones  numeric;
  v_deducciones   numeric;
  v_aportes       numeric;
  v_normal        numeric;
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

    v_dias_pagados := v_p.dias - coalesce(v_nov.faltas_injustificadas, 0);

    if v_dias_pagados <= 0 then
      continue;
    end if;

    v_basico_diario := case v_emp.base_estipulacion
      when 'MENSUAL' then v_emp.salario_base / private.parametro('dias_mes_nomina', v_p.hasta)
      when 'DIARIO'  then v_emp.salario_base
      when 'HORA'    then v_emp.salario_base * v_horas_jornada
    end;

    -- AQUÍ ESTABA EL FALLO (1 de 3). Antes: `if moneda <> 'VES' then × v_p.tasa`,
    -- y v_p.tasa valía 1. Ahora se pide la tasa de la moneda real del sueldo;
    -- si es bolívar, `tasas_del_dia` devuelve 1 y la cuenta no cambia.
    select t.tasa into v_tasa_salario
    from private.tasas_del_dia(v_emp.moneda_salario, v_p.hasta) t;

    v_basico_diario := v_basico_diario * v_tasa_salario;

    v_valor_hora := v_basico_diario / v_horas_jornada;

    insert into public.nomina_recibos
      (periodo_id, empleado_id, dias_pagados, salario_basico_diario)
    values (p_periodo_id, v_emp.id, v_dias_pagados, v_basico_diario)
    returning id into v_recibo_id;

    v_monto := round(v_basico_diario * v_dias_pagados, 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'SAL-BAS', 'Salario del período', v_dias_pagados,
            v_basico_diario, v_monto, 'ASIGNACION', 10);

    if coalesce(v_nov.horas_extra_diurnas, 0) > 0 then
      v_monto := round(v_nov.horas_extra_diurnas * v_valor_hora * (1 + v_recargo_he), 2);
      insert into public.nomina_recibo_lineas
        (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
      values (v_recibo_id, 'HE-DIU', 'Horas extra diurnas',
              v_nov.horas_extra_diurnas, v_valor_hora, v_monto, 'ASIGNACION', 30);
    end if;

    if coalesce(v_nov.horas_extra_nocturnas, 0) > 0 then
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

    for v_m in
      select n.*, c.nombre, c.tipo, c.orden
      from public.nomina_novedades_montos n
      join public.nomina_conceptos c on c.codigo = n.concepto
      where n.periodo_id = p_periodo_id and n.empleado_id = v_emp.id
        and c.tipo = 'ASIGNACION'
    loop
      -- FALLO 2 de 3: un bono cargado en dólares se guardaba tal cual como si
      -- fueran bolívares.
      select t.tasa into v_tasa_linea
      from private.tasas_del_dia(v_m.moneda, v_p.hasta) t;

      v_monto := round(v_m.monto * v_tasa_linea, 2);

      insert into public.nomina_recibo_lineas
        (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
      values (v_recibo_id, v_m.concepto, coalesce(v_m.nota, v_m.nombre),
              null, null, v_monto, 'ASIGNACION', v_m.orden);
    end loop;

    select coalesce(sum(l.monto), 0) into v_normal
    from public.nomina_recibo_lineas l
    join public.nomina_conceptos c on c.codigo = l.concepto
    where l.recibo_id = v_recibo_id and c.incide_normal;

    v_normal_diario  := v_normal / v_dias_pagados;
    v_normal_mensual := v_normal_diario * private.parametro('dias_mes_nomina', v_p.hasta);

    v_dias_bv   := private.dias_bono_vacacional(v_emp.id, v_p.hasta);
    v_dias_util := coalesce(v_emp.dias_utilidades,
                            private.parametro('utilidades_dias_minimo', v_p.hasta));

    v_integral_diario := v_normal_diario
      + (v_normal_diario * v_dias_bv)   / private.parametro('dias_base_alicuotas', v_p.hasta)
      + (v_normal_diario * v_dias_util) / private.parametro('dias_base_alicuotas', v_p.hasta);

    v_integral_mensual := v_integral_diario * private.parametro('dias_mes_nomina', v_p.hasta);

    v_monto := round(
      private.parametro('cestaticket_mensual_usd', v_p.hasta) * v_p.tasa_usd
      / private.parametro('dias_mes_nomina', v_p.hasta) * v_dias_pagados, 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'CESTA', 'Beneficio de alimentación', v_dias_pagados,
            null, v_monto, 'ASIGNACION', 70);

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
      -- FALLO 3 de 3. Y este además engañaba al tope del tercio: una cuota en
      -- dólares se comparaba aplastada contra el tope, así que nunca saltaba.
      select t.tasa into v_tasa_linea
      from private.tasas_del_dia(v_m.moneda, v_p.hasta) t;

      v_monto := round(v_m.monto * v_tasa_linea, 2);

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

    v_monto := round(v_integral_diario
                     * private.parametro('prestaciones_dias_trimestre', v_p.hasta)
                     / 90 * v_dias_pagados, 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'PRV-GAR', 'Provisión de prestaciones sociales', null,
            v_integral_diario, v_monto, 'PROVISION', 310);

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

  if v_recibos = 0 and v_p.tipo <> 'ESPECIAL' then
    select string_agg(distinct frecuencia, ', ' order by frecuencia)
      into v_frecuencias
    from public.empleados
    where activo
      and fecha_ingreso <= v_p.hasta
      and (fecha_egreso is null or fecha_egreso >= v_p.desde);

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
$function$;

-- ---------------------------------------------------------------------------
-- Los períodos ya abiertos siguen con el 1 congelado dentro
--
-- Se les pone la tasa del dólar de su fecha de cierre, que es lo que
-- `abrir_periodo` habría guardado. No se recalcula nada aquí: el recálculo
-- borra y rehace los recibos, y eso se hace desde la pantalla, a la vista de
-- quien lleva la nómina.
--
-- Los PAGADA no se tocan ni siquiera en la tasa: lo que se pagó, se pagó, y la
-- fila tiene que seguir contando lo que de verdad pasó.
-- ---------------------------------------------------------------------------
update public.nomina_periodos
   set tasa = tasa_usd
 where tasa = 1
   and tasa_usd <> 1
   and estado in ('BORRADOR', 'CALCULADA');
