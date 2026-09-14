/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  4 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
  las crea. No cambia nada en la base: son los mismos cuerpos que ya corren,
  puestos donde reconstruir desde cero da lo mismo que hay.

  POR QUE APARECIO ESTA DIFERENCIA, que es lo unico interesante de este archivo:
  las migraciones de esta casa parchean con `pg_get_functiondef` + `replace` en
  vez de reescribir funciones de siete mil letras. El parche es correcto y el
  motivo es bueno —copiar a mano es lo que introduce diferencias—, pero deja el
  cuerpo repartido entre el archivo que la creo y los cinco que la tocaron
  despues. El archivo deja de servir para reconstruir aunque cada parche este
  bien.

  Lo levanto el carril de base de datos, tres veces en un dia, y la tercera con
  el diagnostico que lo explica: no es falta de cuidado, es que la verificacion
  se hace UNA VEZ al escribir y seis migraciones despues otra cosa toca la misma
  funcion. Un md5 comprobado el lunes no dice nada del miercoles.

  Por eso esto es generado y no transcrito: volcar la salida de Postgres no puede
  introducir una diferencia, y teclearla si.

  QUE SE COMPROBO ANTES DE GUARDARLO

  Cada cuerpo de aqui se comparo BYTE A BYTE contra `pg_proc.prosrc` de la base
  viva —no normalizado, no perdonando comentarios— y los 4 coinciden. Y el
  detector, que antes marcaba estas 4, pasa a cero.

  NO SE APLICO, Y ES A PROPOSITO

  Aplicarlo seria un no-op: son exactamente los cuerpos que ya corren, sacados de
  `pg_get_functiondef`. Su valor no esta en cambiar la base sino en que
  reconstruirla desde cero de lo mismo que hay.

  Y LA TRAMPA QUE ESO DEJA, dicha aqui para que no sorprenda: si manana otra
  migracion toca una de estas funciones y alguien corre ESTE archivo suelto,
  despues, la revierte al cuerpo de hoy. En orden no pasa —va fechado con su dia y
  detras de todo lo de ese dia—, pero un volcado no es una migracion normal y
  conviene saberlo antes de ejecutarlo a mano.
*/

-- public.calcular_nomina(p_periodo_id bigint)
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.calcular_nomina(p_periodo_id bigint)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_p        record;
  v_emp      record;
  v_nov      record;
  v_m        record;

  v_sm       numeric;
  v_horas_jornada numeric;
  v_dias_pagados  numeric;
  v_dias_facturados numeric;
  v_dias_laborados  numeric;

  -- Lo que hace falta para prorratear a quien entra o sale a mitad de periodo.
  v_dias_rango   integer;
  v_desde_emp    date;
  v_hasta_emp    date;
  v_dias_en      integer;
  v_egresado_en  date;

  v_basico_diario numeric;
  v_valor_hora    numeric;
  v_monto         numeric;

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
  v_descontado      numeric;

  v_dias_bv       numeric;
  v_dias_util     numeric;

  -- Lo que la persona debe recibir, y las piezas con las que se despeja el
  -- basico a partir de ahi.
  v_objetivo_diario numeric;
  v_objetivo        numeric;
  v_cesta_periodo   numeric;
  v_ivss_fijo       numeric;
  v_rpe_fijo        numeric;
  v_factor_integral numeric;
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

  v_dias_rango := (v_p.hasta - v_p.desde) + 1;

  /*
    SE QUITO EL `and activo` DE ESTE FILTRO, Y ESE ERA EL FALLO.

    La ventana de fechas de las dos lineas siguientes ya dice exactamente quien
    pertenece al periodo: entro antes de que terminara y no se habia ido antes
    de que empezara. Esa condicion existe para incluir a quien sale a mitad de
    quincena — es su unico proposito.

    Pero `egresar_empleado` apaga `activo` a la vez que pone `fecha_egreso`, asi
    que el `and activo` borraba a esa persona del calculo el mismo dia que se le
    daba de baja. El resultado es que a quien se va el 26 no se le paga la
    quincena que trabajo hasta el 26, que es dinero que se le debe.

    Se comprobo antes de quitarlo que la columna es redundante y no un segundo
    criterio: en la base no hay ni un solo empleado con `activo = false` sin
    `fecha_egreso`, ni uno activo con fecha de egreso puesta. Las dos dicen lo
    mismo, y solo una de las dos sabe de fechas.
  */
  for v_emp in
    select * from public.empleados
    where fecha_ingreso <= v_p.hasta
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

    /*
      LOS DIAS SE PRORRATEAN AL TIEMPO QUE ESTUVO EN NOMINA.

      Sin esto, incluir al que sale a mitad de periodo seria cambiar un error
      por otro: dejaria de no cobrar y pasaria a cobrar la quincena entera.

      Se cuenta el solape entre el rango del periodo y el tiempo que la persona
      estuvo empleada, y se aplica esa proporcion a los dias que paga el
      periodo. Para quien estuvo el periodo completo el solape es el rango
      entero y sale `v_p.dias` exacto, asi que el caso normal no cambia en nada
      — que es la propiedad que hace seguro este arreglo.

      Vale igual para quien ENTRA a mitad de periodo, que hasta ahora tambien
      cobraba la quincena completa desde su primer dia.
    */
    v_desde_emp := greatest(v_emp.fecha_ingreso, v_p.desde);
    v_hasta_emp := least(coalesce(v_emp.fecha_egreso, v_p.hasta), v_p.hasta);
    v_dias_en   := (v_hasta_emp - v_desde_emp) + 1;

    if v_dias_en <= 0 then
      continue;
    end if;

    v_dias_facturados := case
      when v_dias_en >= v_dias_rango then v_p.dias
      else round(v_p.dias * v_dias_en::numeric / v_dias_rango, 2)
    end;

    v_dias_laborados  := greatest(v_dias_facturados
                                  - coalesce(v_nov.faltas_injustificadas, 0)
                                  - coalesce(v_nov.faltas_justificadas, 0), 0);
    v_dias_pagados := v_dias_facturados - coalesce(v_nov.faltas_injustificadas, 0);

    if v_dias_pagados <= 0 then
      continue;
    end if;

    -- Se congela en el recibo si la salida cae dentro de este periodo. Va aqui
    -- y no se lee de la ficha al imprimir porque un recibo es un documento:
    -- dice lo que era cierto el dia que se emitio, y no cambia si manana la
    -- persona se reincorpora.
    v_egresado_en := case
      when v_emp.fecha_egreso between v_p.desde and v_p.hasta then v_emp.fecha_egreso
    end;

    /*
      EL SUELDO QUE SE ESCRIBE EN LA FICHA ES LO QUE LA PERSONA RECIBE.

      Christopher, 11/09/2026: «cuando dicen que ganan 500 $ es exactamente todo
      englobado»; «el calculo anterior que daba 267 debe hacerse pero dando 250,
      lo mismo si se ingresa 200 o 300»; «un sueldo aborda todo excepto bonos
      adicionales (fuera de salario) y penalizaciones».

      Hasta hoy `salario_base` era el salario basico, y encima se le sumaba el
      cestaticket y se le restaban las retenciones: quien tenia 500 al mes
      cobraba 267,17 por quincena y no 250. La cuenta estaba bien; lo que estaba
      mal era que significaba el numero de la ficha.

      Ahora significa el neto. De el salen el cestaticket y las retenciones, y el
      salario basico es lo que queda: se despeja hacia atras en vez de sumarse
      hacia adelante.

      LA ECUACION. Llamando b al basico diario y D a los dias pagados:

          b·D  +  cesta  -  IVSS  -  RPE  -  FAOV  =  objetivo

      El cestaticket no depende del sueldo. El IVSS y el RPE tampoco: se calculan
      sobre multiplos del salario minimo —congelado en 130 Bs— y para cualquier
      sueldo real estan topados, o sea que son constantes. El FAOV si es
      proporcional: sale del salario integral, que es el basico por el factor de
      las alicuotas. Despejando:

          b = (objetivo - cesta + IVSS + RPE) / (D · (1 - factor · faov%))

      QUE EL IVSS Y EL RPE ESTEN TOPADOS ES UNA SUPOSICION, y se comprueba aqui
      mismo. Si un dia el salario minimo sube lo bastante como para que dejen de
      estarlo, la ecuacion deja de valer — y entonces la nomina se planta en vez
      de pagar mal en silencio.

      LO QUE ESTO CUESTA, Y HAY QUE SABERLO: el salario basico declarado baja.
      Con 500 englobados queda en unos 465 al mes. Las prestaciones, las
      vacaciones y las utilidades se calculan sobre ese basico, asi que bajan en
      la misma proporcion. Es legal —el cestaticket de verdad no es salario— y es
      la practica corriente del pais, pero es una decision de la empresa, no un
      efecto secundario.

      Los bonos y las penalizaciones se cargan por novedad y se suman o restan
      DESPUES, que es justo lo que se pidio: el sueldo aterriza en su cifra y lo
      demas la mueve.
    */
    v_objetivo_diario := case v_emp.base_estipulacion
      when 'MENSUAL' then v_emp.salario_base / private.parametro('dias_mes_nomina', v_p.hasta)
      when 'DIARIO'  then v_emp.salario_base
      when 'HORA'    then v_emp.salario_base * v_horas_jornada
    end;

    v_tasa_salario := private.tasa_de_nomina(
      v_emp.moneda_salario, v_p.tasa_usd, v_p.hasta);

    v_objetivo := round(v_objetivo_diario * v_tasa_salario * v_dias_pagados, 2);

    v_cesta_periodo := round(
      private.parametro('cestaticket_mensual_usd', v_p.hasta) * v_p.tasa_usd
      / private.parametro('dias_mes_nomina', v_p.hasta) * v_dias_pagados, 2);

    v_ivss_fijo := round(
      v_sm * private.parametro('ivss_tope_salarios_minimos', v_p.hasta)
      * private.parametro('ivss_trabajador', v_p.hasta) / 100
      * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);

    v_rpe_fijo := round(
      greatest(v_sm * private.parametro('rpe_tope_salarios_minimos', v_p.hasta),
               v_sm * private.parametro('rpe_piso_salarios_minimos', v_p.hasta))
      * private.parametro('rpe_trabajador', v_p.hasta) / 100
      * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);

    v_dias_bv   := private.dias_bono_vacacional(v_emp.id, v_p.hasta);
    v_dias_util := coalesce(v_emp.dias_utilidades,
                            private.parametro('utilidades_dias_minimo', v_p.hasta));

    v_factor_integral := 1
      + v_dias_bv   / private.parametro('dias_base_alicuotas', v_p.hasta)
      + v_dias_util / private.parametro('dias_base_alicuotas', v_p.hasta);

    v_basico_diario := (v_objetivo - v_cesta_periodo + v_ivss_fijo + v_rpe_fijo)
      / (v_dias_pagados
         * (1 - v_factor_integral * private.parametro('faov_trabajador', v_p.hasta) / 100));

    if v_basico_diario <= 0 then
      raise exception 'El sueldo de % no alcanza a cubrir el beneficio de alimentacion del periodo.',
        v_emp.nombres || ' ' || v_emp.apellidos
        using errcode = '22023',
              hint = 'El sueldo de la ficha es lo que la persona recibe, y de ahi sale el cestaticket. Subelo o revisa la ficha.';
    end if;

    /* La suposicion de la que cuelga la ecuacion, comprobada en cada recibo. */
    if v_basico_diario * private.parametro('dias_mes_nomina', v_p.hasta)
       < v_sm * greatest(private.parametro('ivss_tope_salarios_minimos', v_p.hasta),
                         private.parametro('rpe_tope_salarios_minimos', v_p.hasta)) then
      raise exception 'El seguro social de % dejo de estar topado, y el basico ya no se puede despejar con esta ecuacion.',
        v_emp.nombres || ' ' || v_emp.apellidos
        using errcode = '22023',
              hint = 'Subio el salario minimo respecto de los sueldos. Hay que rehacer el despeje en calcular_nomina.';
    end if;

    v_valor_hora := v_basico_diario / v_horas_jornada;

    insert into public.nomina_recibos
      (periodo_id, empleado_id, dias_pagados, dias_facturados, dias_laborados,
       salario_basico_diario, egresado_en)
    values (p_periodo_id, v_emp.id, v_dias_pagados, v_dias_facturados,
            v_dias_laborados, v_basico_diario, v_egresado_en)
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
      v_tasa_linea := private.tasa_de_nomina(v_m.moneda, v_p.tasa_usd, v_p.hasta);
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

    /* v_dias_bv y v_dias_util ya se calcularon arriba: el factor de las
       alicuotas hace falta ANTES, para poder despejar el basico. */
    v_integral_diario := v_normal_diario
      + (v_normal_diario * v_dias_bv)   / private.parametro('dias_base_alicuotas', v_p.hasta)
      + (v_normal_diario * v_dias_util) / private.parametro('dias_base_alicuotas', v_p.hasta);

    v_integral_mensual := v_integral_diario * private.parametro('dias_mes_nomina', v_p.hasta);

    /* La misma cifra que entro en el despeje del basico. Se calcula una vez
       arriba y se reusa aqui: si se recalculara, las dos cuentas podrian
       separarse y el neto dejaria de aterrizar donde debe. */
    v_monto := v_cesta_periodo;

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
      v_normal * private.parametro('descuento_prestamo_max', v_p.hasta) / 100, 2);
    v_descontado := 0;

    for v_m in
      select n.*, c.nombre, c.orden
      from public.nomina_novedades_montos n
      join public.nomina_conceptos c on c.codigo = n.concepto
      where n.periodo_id = p_periodo_id and n.empleado_id = v_emp.id
        and c.tipo = 'DEDUCCION'
      order by c.orden
    loop
      v_tasa_linea := private.tasa_de_nomina(v_m.moneda, v_p.tasa_usd, v_p.hasta);
      v_monto := round(v_m.monto * v_tasa_linea, 2);

      /*
        EL TOPE ES DE TODO LO QUE SE DESCUENTA, NO DE CADA COSA POR SEPARADO.

        Antes la reja miraba solo DED-PRE y DED-ANT, y comparaba cada linea
        contra el tercio por su cuenta: dos descuentos de un tercio pasaban los
        dos. El articulo 154 limita lo que se le descuenta a alguien en el
        periodo, no lo que se le descuenta por concepto.

        Las retenciones legales no pasan por aqui y no deben: IVSS, RPE y FAOV
        son retenciones de ley, no descuentos, y se insertan fuera de este bucle.
      */
      v_descontado := v_descontado + v_monto;

      if v_descontado > v_tope_prestamo then
        raise exception 'A % no se le puede descontar tanto en este periodo: entre todos los descuentos suman %, y el tope es % (un tercio de lo que gana, LOTTT 154). El que se pasa es "%".',
          v_emp.nombres || ' ' || v_emp.apellidos,
          private.numero_es(v_descontado, 2), private.numero_es(v_tope_prestamo, 2), v_m.nombre
          using errcode = '22023',
                hint = 'Reparte lo que falte en los periodos siguientes, o baja el monto de este.';
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

    /*
        UN RECIBO NO DEJA A NADIE DEBIENDO DINERO.

        Con el tope de arriba bien puesto esto ya no deberia poder ocurrir. Se
        deja porque es la regla que de verdad importa, y sigue en pie si manana
        se toca el parametro del tercio o entra una deduccion por otra via.

        Falla en vez de truncar en cero: truncar perdonaria el exceso en silencio
        y el saldo se evaporaria. Fallar obliga a que alguien mire que se cargo
        mal.
      */
    if v_asignaciones - v_deducciones < 0 then
      raise exception 'El recibo de % saldria en negativo: gana % y se le descuentan %. Un recibo no puede dejar al trabajador debiendo dinero.',
        v_emp.nombres || ' ' || v_emp.apellidos,
        private.numero_es(v_asignaciones, 2), private.numero_es(v_deducciones, 2)
        using errcode = '22023',
              hint = 'Revisa las deducciones cargadas a esa persona en este periodo.';
    end if;

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
    where fecha_ingreso <= v_p.hasta
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

-- public.cargar_articulos_por_lote(p_filas jsonb, p_confirmar boolean)
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.cargar_articulos_por_lote(p_filas jsonb, p_confirmar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reparable boolean;
  v_fila         jsonb;
  v_n            int := 0;
  v_informe      jsonb := '[]'::jsonb;
  v_errores      int := 0;
  v_nuevos       int := 0;
  v_actualizados int := 0;
  v_hay_precio   boolean := false;

  v_codigo    text;
  v_nombre    text;
  v_categoria text;
  v_cat_txt   text;
  v_unidad    text;
  v_modo      text;
  v_inv       boolean;
  v_minimo    numeric;
  v_densidad  numeric;
  v_precio    numeric;
  v_precio_min numeric;
  v_moneda    text;

  -- Lo que trae la existencia, cuando la trae.
  v_almacen_txt text;
  v_almacen_id  bigint;
  v_cantidad    numeric;
  v_costo       numeric;
  v_sin_val     boolean;
  v_dueno_txt   text;
  v_con_stock   int := 0;

  /*
    Los renglones se juntan por almacén y se meten al final, no fila por fila.

    Una llamada por renglón tomaría el cerrojo del almacén una vez por artículo
    —cien artículos, cien esperas— y dejaría cien movimientos sueltos donde lo
    que hubo fue una sola carga inicial. Agrupados, queda un movimiento por
    almacén, que es lo que de verdad pasó y lo que alguien va a querer leer
    dentro de un año.
  */
  v_por_almacen jsonb := '{}'::jsonb;
  v_clave       text;

  v_motivo    text;
  v_estado    text;
  v_id        bigint;
  v_vistos    text[] := array[]::text[];
  v_nucleo    text;
  v_aviso     text;
begin
  perform private.exigir_permiso('INVENTARIO', 'ESCRITURA');

  if jsonb_typeof(p_filas) <> 'array' then
    raise exception 'La planilla no trae filas.' using errcode = '22023';
  end if;

  select exists (
    select 1 from jsonb_array_elements(p_filas) f
    where nullif(btrim(coalesce(f->>'precio', '')), '') is not null
  ) into v_hay_precio;

  if v_hay_precio then
    perform private.exigir_permiso('VENTAS', 'TOTAL');
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_n := v_n + 1;
    v_motivo := null;
    v_aviso  := null;
    v_estado := null;
    v_almacen_id := null;
    v_cantidad := null;
    v_costo := null;
    v_sin_val := false;
    v_dueno_txt := null;

    v_codigo    := upper(btrim(coalesce(v_fila->>'codigo', '')));
    v_nombre    := btrim(coalesce(v_fila->>'nombre', ''));
    /*
      SE ESCRIBE EL NOMBRE, SE GUARDA EL CODIGO.

      La planilla ofrece «Equipo de oficina y computo» porque es lo que dice la
      pantalla; la tabla guarda EQUIPO. Aqui se traduce, admitiendo tambien el
      codigo para que una planilla bajada antes de hoy siga entrando.

      Sin tildes en los dos lados: el desplegable las pone y quien teclea a mano
      casi nunca, y rechazar una fila por un acento seria el peor de los motivos.

      Si no se reconoce, se queda el texto tal cual y la reja de abajo lo nombra
      con las palabras que la persona escribio.
    */
    v_cat_txt := upper(btrim(coalesce(v_fila->>'categoria', '')));
    v_categoria := coalesce(
      (select c.codigo from public.categorias_de_articulo() c
        where upper(c.codigo) = v_cat_txt
           or translate(upper(c.etiqueta), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')
              = translate(v_cat_txt, 'ÁÉÍÓÚÜÑ', 'AEIOUUN')
        limit 1),
      v_cat_txt);
    v_unidad    := upper(btrim(coalesce(v_fila->>'unidad', '')));
    v_modo      := upper(btrim(coalesce(nullif(btrim(coalesce(v_fila->>'modo_entrega','')), ''), 'CONSUMIBLE')));
    v_moneda    := upper(btrim(coalesce(nullif(btrim(coalesce(v_fila->>'moneda','')), ''), 'USD')));
    v_almacen_txt := btrim(coalesce(v_fila->>'almacen', ''));

    v_nucleo := private.nombre_nucleo(v_nombre);

    /*
      EL CODIGO YA NO SE EXIGE, Y ESA EXIGENCIA ES DE DONDE SALIO EL PROBLEMA.

      Once de los quince articulos del catalogo llevan el nombre metido en el
      campo del codigo —«ACEITE AGROFLUIDOS» es a la vez nombre y codigo—
      porque esta funcion pedia un codigo y quien lleno la planilla no tenia
      ninguno que escribir. Un codigo que es el nombre no distingue nada: el
      indice unico deja pasar el mismo articulo dos veces con una letra de
      diferencia.

      Sin codigo, la fila se resuelve por el nombre: si ya hay un articulo cuyo
      nombre se reduce al mismo nucleo, es ese y se actualiza. Si no, es nuevo y
      el codigo se lo pone `private.codigo_de_articulo` AL GUARDAR — no al
      revisar, porque revisar la planilla tres veces gastaria tres correlativos
      por fila y dejaria huecos en la serie.
    */
    if v_codigo = '' and v_nombre <> '' then
      select a.codigo into v_codigo
        from public.articulos a
       where private.nombre_nucleo(a.nombre) = v_nucleo
       order by a.activo desc
       limit 1;
      v_codigo := coalesce(v_codigo, '');
    end if;

    if v_nombre = '' then
      v_motivo := 'Falta el nombre.';
    elsif v_categoria = '' then
      v_motivo := 'Falta la categoría.';
    elsif v_unidad = '' then
      v_motivo := 'Falta la unidad.';

    elsif coalesce(nullif(v_codigo, ''), 'NUCLEO:' || v_nucleo) = any(v_vistos) then
      v_motivo := case when v_codigo <> ''
        then format('El código %s se repite en la planilla.', v_codigo)
        else format('«%s» aparece dos veces en la planilla.', v_nombre) end;

    /* La lista sale del CHECK de la tabla: ver `public.categorias_de_articulo`. */
    elsif not exists (select 1 from public.categorias_de_articulo() c
                       where c.codigo = v_categoria) then
      v_motivo := format('«%s» no es una categoría del sistema. Las que hay: %s.',
        v_cat_txt,
        (select string_agg(c.etiqueta, ', ' order by c.etiqueta)
           from public.categorias_de_articulo() c));

    elsif v_modo not in ('NO','RETORNABLE','CONSUMIBLE') then
      v_motivo := format('«%s» no dice qué pasa al entregarlo: NO, RETORNABLE o CONSUMIBLE.', v_modo);

    elsif not exists (select 1 from public.unidades where codigo = v_unidad) then
      v_motivo := format('La unidad «%s» no existe. Las que hay: %s.',
        v_unidad,
        (select string_agg(u.codigo, ', ' order by u.codigo) from public.unidades u));

    else
      begin
        v_minimo   := coalesce(nullif(btrim(coalesce(v_fila->>'stock_minimo','')), '')::numeric, 0);
        v_densidad := nullif(btrim(coalesce(v_fila->>'densidad_ton_m3','')), '')::numeric;
        v_precio   := nullif(btrim(coalesce(v_fila->>'precio','')), '')::numeric;
        v_precio_min := nullif(btrim(coalesce(v_fila->>'precio_minimo','')), '')::numeric;
        v_cantidad := nullif(btrim(coalesce(v_fila->>'cantidad','')), '')::numeric;
        v_costo    := nullif(btrim(coalesce(v_fila->>'costo','')), '')::numeric;
      exception when others then
        v_minimo := null;
        v_motivo := 'Hay un número que no se entiende. Se escriben sin separador de miles y con punto decimal.';
      end;

      v_inv := case lower(btrim(coalesce(v_fila->>'inventariable', '')))
                 when '' then true
                 when 'si' then true when 'sí' then true when 'true' then true when '1' then true
                 when 'no' then false when 'false' then false when '0' then false
                 else null end;

      /*
        LO DONADO ENTRA SIN CIFRA.

        Christopher: «tenemos que considerar que puede ser una donación de otra
        empresa o entidad o fuente, así que por ello no tiene una factura o
        costo».

        NO SE SABE NO ES CERO. Escribir cero diria que la laptop donada no vale
        nada, y ese cero se promedia con lo que ya hay y abarata cada salida
        futura del articulo, en silencio y para siempre. Marcando esta columna
        el renglon entra con el costo en nulo: el hueco se guarda como hueco,
        queda fuera del promedio por los dos lados, y se cuenta aparte para que
        una valoracion a medias no se lea como completa.

        Vacio es NO, que es lo que tiene que pasar: quien no sepa que existe
        esta columna sigue teniendo que escribir el costo.
      */
      -- Vacio significa «el del almacen», que es lo que resuelve la base.
      v_dueno_txt := nullif(upper(btrim(coalesce(v_fila->>'propietario', ''))), '');

      v_sin_val := case lower(btrim(coalesce(v_fila->>'sin_valorar', '')))
                 when 'si' then true when 'sí' then true when 'true' then true when '1' then true
                 else false end;

      if v_motivo is not null then
        null;
      elsif v_inv is null then
        v_motivo := 'La columna «inventariable» se responde SI o NO.';
      elsif v_minimo < 0 then
        v_motivo := 'El mínimo no puede ser negativo.';
      elsif v_densidad is not null and v_densidad <= 0 then
        v_motivo := 'La densidad, si se pone, es mayor que cero.';
      elsif v_categoria = 'SERVICIO' and v_inv then
        v_motivo := 'Un servicio no se guarda en el almacén: «inventariable» tiene que ser NO.';
      elsif v_precio is not null and v_precio <= 0 then
        v_motivo := 'El precio tiene que ser mayor que cero.';
      elsif v_precio is null and v_precio_min is not null then
        v_motivo := 'Hay precio mínimo sin precio.';
      elsif v_precio_min is not null and v_precio_min > v_precio then
        v_motivo := 'El precio mínimo no puede pasar del precio.';
      elsif v_precio is not null
            and not exists (select 1 from public.monedas where codigo = v_moneda and activa) then
        v_motivo := format('La moneda «%s» no está activa en el sistema.', v_moneda);
      end if;

      /*
        LA EXISTENCIA. Las tres van juntas o no va ninguna.

        Media fila —un almacén sin cantidad, una cantidad sin costo— casi
        siempre es una celda que se quedó sin llenar, y adivinar el resto es
        meter existencia que nadie pidió. Se avisa y se para.
      */
      if v_motivo is null and (v_almacen_txt <> '' or v_cantidad is not null or v_costo is not null or v_sin_val) then
        if not v_inv then
          v_motivo := 'Esto no se inventaría, así que no puede tener existencia en un almacén.';
        elsif v_almacen_txt = '' then
          v_motivo := 'Hay cantidad o costo pero falta el almacén: no se sabe dónde meterlo.';
        elsif v_cantidad is null then
          v_motivo := 'Hay almacén pero falta la cantidad.';
        elsif v_dueno_txt is not null
              and not exists (select 1 from public.propietarios where codigo = v_dueno_txt and activo) then
          v_motivo := format('«%s» no es un dueño registrado. Los que hay: %s.', v_dueno_txt,
            (select string_agg(codigo, ', ' order by codigo) from public.propietarios where activo));
        elsif v_sin_val and v_costo is not null then
          v_motivo := 'Está marcado «sin_valorar» y además trae costo. O se sabe cuánto costó, o no se sabe: deja una de las dos celdas vacía.';
        elsif v_costo is null and not v_sin_val then
          v_motivo := 'Hay cantidad pero falta el costo. Si llegó donado o sin factura y nadie sabe cuánto costó, escribe SI en «sin_valorar» y deja el costo vacío.';
        elsif v_cantidad <= 0 then
          v_motivo := 'La cantidad que entra tiene que ser mayor que cero.';
        elsif not v_sin_val and v_costo <= 0 then
          v_motivo := 'El costo por unidad tiene que ser mayor que cero.';
        elsif not exists (select 1 from public.monedas where codigo = v_moneda and activa) then
          v_motivo := format('La moneda «%s» no está activa en el sistema.', v_moneda);
        else
          -- Por código o por nombre: quien llena la planilla escribe lo que ve
          -- en la pantalla de almacenes, y ahí se lee el nombre.
          select a.id into v_almacen_id
            from public.almacenes a
           where a.activo
             and (upper(a.codigo) = upper(v_almacen_txt) or upper(a.nombre) = upper(v_almacen_txt));

          if v_almacen_id is null then
            v_motivo := format('El almacén «%s» no existe o está inactivo. Los que hay: %s.',
              v_almacen_txt,
              (select string_agg(a.codigo || ' · ' || a.nombre, ', ' order by a.nombre)
                 from public.almacenes a where a.activo));
          end if;
        end if;
      end if;
    end if;

    if v_motivo is not null then
      v_errores := v_errores + 1;
      v_estado  := 'ERROR';
    else
      v_vistos := v_vistos || coalesce(nullif(v_codigo, ''), 'NUCLEO:' || v_nucleo);
      /*
        Tambien por el codigo viejo: una planilla anterior a la renumeracion
        trae «ACEITE AGROFLUIDOS» donde hoy pone LUB-0001, y sin esto la fila
        entraria como un articulo nuevo con el nombre otra vez en el codigo.
      */
      select id into v_id from public.articulos
       where codigo = v_codigo or codigo_anterior = v_codigo;

      if v_id is null then
        v_estado := 'NUEVO';
        v_nuevos := v_nuevos + 1;

        /*
          SE PARECE A UNO QUE YA ESTA, PERO NO ES EL MISMO.

          Avisa y deja pasar. Una planilla trae DISCO DE CORTE 7 y DISCO DE
          CORTE 9 el mismo dia, y pararla obligaria a partirla en dos. Lo que
          hace falta es que quien la revisa lo VEA antes de confirmar — el
          informe sale en pantalla justamente para eso.
        */
        select format('Se parece a «%s» (%s), que ya está.', a.nombre, a.codigo)
          into v_aviso
          from public.articulos a
         where extensions.similarity(private.nombre_comparable(a.nombre),
                                     private.nombre_comparable(v_nombre)) >= 0.55
         order by extensions.similarity(private.nombre_comparable(a.nombre),
                                        private.nombre_comparable(v_nombre)) desc
         limit 1;
      else
        v_estado := 'ACTUALIZA';
        v_actualizados := v_actualizados + 1;
      end if;

      if v_almacen_id is not null then
        v_con_stock := v_con_stock + 1;
      end if;

      if p_confirmar then
        if v_id is null then
          -- Vacia se deduce de la categoria, la misma regla que crear_articulo:
          -- una herramienta y un repuesto vuelven arreglados del taller, un
          -- lubricante o un producto se gastan.
          v_reparable := case lower(btrim(coalesce(v_fila->>'reparable', '')))
                           when 'si' then true when 'sí' then true
                           when '1' then true  when 'true' then true
                           when 'no' then false when '0' then false
                           when 'false' then false
                           else null end;

          insert into public.articulos
            (codigo, nombre, descripcion, categoria, unidad, inventariable,
             stock_minimo, densidad_ton_m3, modo_entrega, reparable, creado_por)
          values
            (coalesce(nullif(v_codigo, ''), private.codigo_de_articulo(v_categoria)),
             v_nombre, nullif(btrim(coalesce(v_fila->>'descripcion','')), ''),
             v_categoria, v_unidad, v_inv, v_minimo, v_densidad, v_modo,
             coalesce(v_reparable, v_categoria in ('HERRAMIENTA', 'REPUESTO')),
             (select auth.uid()))
          returning id into v_id;
        else
          v_reparable := case lower(btrim(coalesce(v_fila->>'reparable', '')))
                           when 'si' then true when 'sí' then true
                           when '1' then true  when 'true' then true
                           when 'no' then false when '0' then false
                           when 'false' then false
                           else null end;

          update public.articulos
             set nombre = v_nombre,
                 reparable = coalesce(v_reparable, reparable),
                 descripcion = coalesce(nullif(btrim(coalesce(v_fila->>'descripcion','')), ''), descripcion),
                 categoria = v_categoria,
                 unidad = v_unidad,
                 -- Al corregir, la celda vacia significa «no lo toques». Con
                 -- el valor por defecto, una herramienta RETORNABLE a la que se
                 -- le corregia el nombre pasaba a CONSUMIBLE y dejaba de poder
                 -- prestarse.
                 inventariable = case
                   when nullif(btrim(coalesce(v_fila->>'inventariable','')), '') is null
                     then inventariable else v_inv end,
                 stock_minimo = case
                   when nullif(btrim(coalesce(v_fila->>'stock_minimo','')), '') is null
                     then stock_minimo else v_minimo end,
                 densidad_ton_m3 = coalesce(v_densidad, densidad_ton_m3),
                 modo_entrega = case
                   when nullif(btrim(coalesce(v_fila->>'modo_entrega','')), '') is null
                     then modo_entrega else v_modo end
           where id = v_id;
        end if;

        if v_precio is not null then
          insert into public.precios_venta
            (articulo_id, moneda, precio, precio_minimo, actualizado_por, actualizado_en)
          values
            (v_id, v_moneda, v_precio, coalesce(v_precio_min, 0), (select auth.uid()), now())
          on conflict (articulo_id) do update
            set moneda = excluded.moneda,
                precio = excluded.precio,
                precio_minimo = excluded.precio_minimo,
                actualizado_por = excluded.actualizado_por,
                actualizado_en = excluded.actualizado_en;
        end if;

        -- El renglón se guarda para el final, agrupado por su almacén.
        if v_almacen_id is not null then
          v_clave := v_almacen_id::text;
          v_por_almacen := jsonb_set(
            v_por_almacen, array[v_clave],
            coalesce(v_por_almacen -> v_clave, '[]'::jsonb) ||
              jsonb_build_object('articulo_id', v_id, 'cantidad', v_cantidad,
                                 'costo', coalesce(v_costo, 0), 'moneda', v_moneda,
                                 'sin_valor', v_sin_val,
                                 'propietario', v_dueno_txt,
                                 /*
                                   La revision fila por fila de la pantalla ES la
                                   confirmacion. Sin esto, cualquier articulo
                                   nuevo con costo moria pidiendo una casilla que
                                   una planilla no tiene donde poner.
                                 */
                                 'confirmado', true));
        end if;
      end if;
    end if;

    v_informe := v_informe || jsonb_build_object(
      'fila', v_n,
      'codigo', v_codigo,
      'nombre', v_nombre,
      'estado', v_estado,
      'motivo', v_motivo,
      'aviso', v_aviso);
  end loop;

  if v_n = 0 then
    raise exception 'La planilla está vacía.' using errcode = '22023';
  end if;

  if p_confirmar and v_errores > 0 then
    raise exception 'La planilla tiene % fila(s) con problemas. No se cargó nada.', v_errores
      using errcode = '22023';
  end if;

  /*
    Y ahora la existencia, una entrada por almacén.

    Va al final y no dentro del bucle porque los artículos nuevos tienen que
    existir antes de que se les meta nada. Si esto revienta —un almacén que se
    desactivó entre la revisión y el guardado— se cae la transacción entera y
    tampoco quedan los artículos, que es lo correcto: media carga es peor que
    ninguna.
  */
  if p_confirmar and v_por_almacen <> '{}'::jsonb then
    for v_clave in select jsonb_object_keys(v_por_almacen) loop
      perform public.registrar_entradas(
        v_clave::bigint,
        v_por_almacen -> v_clave,
        'Carga inicial por planilla',
        null,
        null);
    end loop;
  end if;

  return jsonb_build_object(
    'total', v_n,
    'nuevos', v_nuevos,
    'actualizados', v_actualizados,
    'con_existencia', v_con_stock,
    'errores', v_errores,
    'aplicado', p_confirmar and v_errores = 0,
    'filas', v_informe);
end;
$function$;

-- public.cerrar_mantenimiento(p_id bigint, p_detalle text, p_costo_usd numeric, p_repuestos jsonb, p_estado_salida text, p_fecha_salida date, p_devuelto numeric, p_destino_id bigint)
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.cerrar_mantenimiento(p_id bigint, p_detalle text, p_costo_usd numeric DEFAULT NULL::numeric, p_repuestos jsonb DEFAULT '[]'::jsonb, p_estado_salida text DEFAULT 'EN_ESPERA'::text, p_fecha_salida date DEFAULT NULL::date, p_devuelto numeric DEFAULT NULL::numeric, p_destino_id bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_orden record;
  v_maq   record;
  v_art   record;
  v_salida date := coalesce(p_fecha_salida, (now() at time zone 'America/Caracas')::date);
  v_hoy    date := (now() at time zone 'America/Caracas')::date;
  v_r jsonb; v_rart bigint; v_rcant numeric;
  v_unitario numeric; v_costo numeric; v_hay numeric; v_mov bigint;
  v_total numeric := 0; v_nombre text;
  v_devuelto numeric;
  v_merma numeric;
  v_sobre text;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  select * into v_orden from public.mantenimientos where id = p_id for update;
  if v_orden.id is null then
    raise exception 'No existe la orden de taller %.', p_id using errcode = 'P0002';
  end if;
  if v_orden.estado <> 'ABIERTO' then
    raise exception 'La orden % está %.', coalesce(v_orden.numero, p_id::text),
      lower(v_orden.estado) using errcode = '55000';
  end if;
  if length(btrim(coalesce(p_detalle, ''))) < 3 then
    raise exception 'Hay que decir qué se hizo.' using errcode = '23514';
  end if;
  if v_salida < v_orden.fecha then
    raise exception 'No puede salir del taller antes de haber entrado.' using errcode = '22023';
  end if;
  if v_salida > v_hoy then
    raise exception 'No se puede cerrar una orden de taller con fecha futura.' using errcode = '22023';
  end if;

  -- ---- los repuestos que se usaron de verdad ----------------------------
  if jsonb_array_length(coalesce(p_repuestos, '[]'::jsonb)) > 0 and v_orden.taller_id is null then
    raise exception 'Para descontar repuestos la orden tiene que decir en qué taller se hizo.'
      using errcode = '23514';
  end if;

  if v_orden.maquina_id is not null then
    select * into v_maq from public.maquinaria where id = v_orden.maquina_id for update;
    v_sobre := v_maq.nombre;
  else
    select * into v_art from public.articulos where id = v_orden.articulo_id;
    v_sobre := v_art.nombre;
  end if;

  for v_r in select * from jsonb_array_elements(coalesce(p_repuestos, '[]'::jsonb))
  loop
    v_rart  := (v_r ->> 'articulo_id')::bigint;
    v_rcant := (v_r ->> 'cantidad')::numeric;

    if v_rart is null or coalesce(v_rcant, 0) <= 0 then
      raise exception 'Cada repuesto necesita un artículo y una cantidad mayor que cero.'
        using errcode = '23514';
    end if;

    select nombre into v_nombre from public.articulos where id = v_rart;
    if v_nombre is null then
      raise exception 'No existe el artículo %.', v_rart using errcode = 'P0002';
    end if;

    v_hay := private.existencia_para_escribir(v_orden.taller_id, v_rart);
    if v_hay < v_rcant then
      raise exception 'El taller solo tiene % de "%": no alcanza para %.',
        v_hay, v_nombre, v_rcant using errcode = '55000';
    end if;

    v_unitario := private.costo_promedio(v_orden.taller_id, v_rart);
    v_costo    := v_unitario * v_rcant;

    v_mov := private.registrar_movimiento(
      'SALIDA_CONSUMO', -1, v_orden.taller_id, v_rart, v_rcant, v_unitario,
      format('Taller %s · %s', coalesce(v_orden.numero, p_id::text), v_sobre),
      null, null, null, v_salida);

    insert into public.mantenimiento_repuestos
      (mantenimiento_id, articulo_id, cantidad, costo_usd, movimiento_id, estado)
    -- `mantenimiento_repuestos.costo_usd` no admite nulo: un repuesto sin
    -- valorar se anota en cero en la orden, aunque su movimiento quede sin
    -- cifra. Se pierde precision en el costo de la reparacion, no en el libro.
    values (p_id, v_rart, v_rcant, coalesce(v_costo, 0), v_mov, 'USADO');

    -- Sin el coalesce, un solo repuesto sin valorar dejaria el total de la
    -- orden en nulo, y esa columna tampoco lo admite.
    v_total := v_total + coalesce(v_costo, 0);
  end loop;

  -- ---- si era material, vuelve ------------------------------------------
  if v_orden.articulo_id is not null then
    -- Lo normal es que vuelva todo. Se admite que vuelva menos —una varilla se
    -- parte al enderezarla— y esa diferencia es merma, no material perdido de
    -- vista: se registra como tal para que el inventario cuadre y para que la
    -- merma del taller se pueda mirar.
    v_devuelto := coalesce(p_devuelto, v_orden.cantidad);

    if v_devuelto < 0 or v_devuelto > v_orden.cantidad then
      raise exception 'Del taller no puede volver más de lo que entró (entraron %).', v_orden.cantidad
        using errcode = '22023';
    end if;

    if p_destino_id is null then
      raise exception 'Hay que decir a qué almacén vuelve el material.' using errcode = '23514';
    end if;

    if v_devuelto > 0 then
      perform public.transferir_existencia(
        p_origen_id := v_orden.taller_id,
        p_destino_id := p_destino_id,
        p_articulo_id := v_orden.articulo_id,
        p_cantidad := v_devuelto,
        p_motivo := format('Vuelve del taller · %s', coalesce(v_orden.numero, p_id::text)),
        p_fecha := v_salida);
    end if;

    v_merma := v_orden.cantidad - v_devuelto;
    if v_merma > 0 then
      perform private.registrar_movimiento(
        'SALIDA_MERMA', -1, v_orden.taller_id, v_orden.articulo_id, v_merma,
        private.costo_promedio(v_orden.taller_id, v_orden.articulo_id),
        format('Merma en el taller · %s', coalesce(v_orden.numero, p_id::text)),
        null, null, null, v_salida);
    end if;
  end if;

  update public.mantenimientos
     set estado = 'CERRADO', detalle = btrim(p_detalle), fecha_salida = v_salida,
         costo_usd = p_costo_usd, costo_repuestos_usd = v_total,
         cantidad_devuelta = v_devuelto,
         cerrado_por = (select auth.uid()), cerrado_en = now()
   where id = p_id;

  -- ---- la máquina sale con el estado que le toque ------------------------
  if v_orden.maquina_id is not null then
    if p_estado_salida not in ('EN_ESPERA', 'ACTIVA', 'FUERA_DE_SERVICIO') then
      raise exception 'Al salir del taller una máquina queda en espera, activa o fuera de servicio.'
        using errcode = '22023';
    end if;
    update public.maquinaria set estado = p_estado_salida where id = v_orden.maquina_id;
  end if;

  perform private.notificar(
    'MAQUINARIA', 'MANTENIMIENTO_CERRADO',
    format('%s salió del taller', v_sobre),
    case when v_orden.tipo = 'MANTENIMIENTO'
         then 'Su contador de horas vuelve a cero.'
         when v_orden.articulo_id is not null and coalesce(v_merma, 0) > 0
         then format('Volvieron %s de %s: el resto es merma.', v_devuelto, v_orden.cantidad)
         else 'Trabajo terminado.' end,
    '/app/maquinaria/mantenimientos', array['OPERACIONES', 'ALMACEN'], 'INFO');

  return p_id;
end;
$function$;

-- public.registrar_entradas(p_almacen_id bigint, p_renglones jsonb, p_motivo text, p_referencia text, p_fecha date)
-- venia de: 20260908320000_los_cuerpos_que_de_verdad_corren_ii.sql
CREATE OR REPLACE FUNCTION public.registrar_entradas(p_almacen_id bigint, p_renglones jsonb, p_motivo text, p_referencia text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c_factor constant numeric := 10;
  v_r jsonb; v_n int := 0; v_articulo bigint; v_cantidad numeric; v_costo numeric;
  v_moneda text; v_costo_usd numeric; v_tasa numeric; v_tasa_usd numeric;
  v_nota text; v_nombre text; v_ref numeric; v_veces numeric; v_msg text;
  v_pres numeric; v_sueltas numeric; v_por_pres numeric; v_unidad_pres text;
  v_nombre_pres text; v_dueno text; v_sin_valor boolean;
begin
  perform private.exigir_rol('ALMACEN');

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'No hay nada que meter: la entrada no trae renglones.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Una entrada sin explicación no se puede auditar después. Escribe de dónde vino.'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.almacenes where id = p_almacen_id and activo) then
    raise exception 'Ese almacén no existe o está inactivo.' using errcode = '23503';
  end if;

  /*
    Un almacen que admite material sin costo lleva su promedio aparte, y ese es
    el motivo de que exista. Meterle material con precio por esta puerta lo
    contamina igual que sacarlo por la otra.
  */
  if exists (select 1 from public.almacenes
              where id = p_almacen_id and coalesce(admite_sin_costo, false)) then
    raise exception 'En «%» solo entra material que esta empresa no pagó, y por eso lleva su costo aparte.'
      , (select nombre from public.almacenes where id = p_almacen_id)
      using errcode = '22023',
            hint = 'Para meter ahí, usa «Cargar combustible al tanque» marcando «no costó nada para esta empresa». Lo que sí costó va a otro almacén.';
  end if;

  v_nota := btrim(p_motivo);
  if nullif(btrim(coalesce(p_referencia, '')), '') is not null then
    v_nota := v_nota || ' · Ref.: ' || btrim(p_referencia);
  end if;

  for v_r in select * from jsonb_array_elements(p_renglones) loop
    v_n := v_n + 1;
    v_veces := null;

    v_articulo := nullif(btrim(coalesce(v_r->>'articulo_id', '')), '')::bigint;
    v_sueltas  := coalesce(nullif(btrim(coalesce(v_r->>'cantidad', '')), '')::numeric, 0);
    v_pres     := coalesce(nullif(btrim(coalesce(v_r->>'presentaciones', '')), '')::numeric, 0);
    v_costo    := coalesce(nullif(btrim(coalesce(v_r->>'costo', '')), '')::numeric, 0);
    v_moneda   := upper(coalesce(nullif(btrim(coalesce(v_r->>'moneda', '')), ''), 'USD'));
    v_sin_valor := coalesce((v_r->>'sin_valor')::boolean, false);

    /*
      DE QUIEN ES LO QUE ENTRA.

      Vacio NO es LACANTERA: es «el del almacen». `registrar_movimiento` ya
      resuelve esa parte —al entrar es del dueño del sitio salvo que se diga— y
      repetir la regla aqui seria tener dos sitios que opinan de lo mismo.

      Decirlo hace falta desde que el dueño viaja con el material: el inventario
      de la gobernacion se esta cargando renglon a renglon, y sus cosas pueden
      acabar en un almacen nuestro sin dejar de ser suyas.
    */
    v_dueno := nullif(btrim(coalesce(v_r->>'propietario', '')), '');

    select nombre, presentacion, unidades_por_presentacion
      into v_nombre, v_unidad_pres, v_por_pres
      from public.articulos where id = v_articulo and activo;
    if v_nombre is null then
      raise exception 'El renglón %: ese artículo no existe o está inactivo.', v_n using errcode = '23503';
    end if;

    if v_dueno is not null then
      v_dueno := upper(v_dueno);
      if not exists (select 1 from public.propietarios where codigo = v_dueno and activo) then
        raise exception 'El renglón % (%): «%» no es un dueño registrado. Los que hay: %.',
          v_n, v_nombre, v_dueno,
          (select string_agg(codigo, ', ' order by codigo) from public.propietarios where activo)
          using errcode = '23503';
      end if;
    end if;

    /*
      SIETE TAMBORES Y DIEZ LITROS. La cuenta la hace la base y no el navegador,
      que es lo que pidio Christopher: «asi el sistema tiene nocion en todo
      momento sobre lo que hay o no hay en sus presentaciones».
    */
    -- En que presentacion se conto este renglon. Nula: la de por defecto.
    v_nombre_pres := nullif(btrim(coalesce(v_r->>'presentacion', '')), '');
    v_cantidad := private.en_unidad_base(v_articulo, v_pres, v_sueltas, v_nombre_pres);

    if v_cantidad <= 0 then
      raise exception 'El renglón % (%): la cantidad tiene que ser mayor que cero.', v_n, v_nombre using errcode = '22023';
    end if;
    /*
      TRES CAMINOS, NO DOS: SE SABE, NO COSTO NADA, O NO SE SABE.

      Esta reja solo conocia los dos primeros y mandaba el tercero al ajuste de
      conteo, que valora heredando el promedio del almacen — o sea que le pone
      un precio inventado a algo cuyo precio nadie tiene. La puerta de un solo
      renglon ya distinguia los tres desde el 11/09; esta se quedo sin ello, y
      es justo la que se usa para cargar el inventario.

      NO SE SABE NO ES CERO. Cero dice que no vale nada y hunde el promedio de
      lo que ya hay. Sin valor guarda el hueco COMO HUECO: nulo, fuera del
      promedio en los dos lados de la division, y contado aparte en
      `existencia_sin_valorar` para que una valoracion a medias no se lea como
      completa.
    */
    if not v_sin_valor and v_costo <= 0 then
      raise exception 'El renglón % (%): hay que decir cuánto costó la unidad, o marcar que no se sabe cuánto vale.', v_n, v_nombre
        using errcode = '22023',
              hint = 'Si el precio existe pero nadie lo tiene a mano, marca «no se sabe cuánto costó» en ese renglón: entra sin cifra y queda pendiente de valorar.';
    end if;

    /*
      EL COSTO LLEVA SU PROPIA UNIDAD, que no tiene por que ser la misma que la
      cantidad. Alguien cuenta en tambores y conoce el precio por litro, o al
      reves. Sin `costo_por_presentacion` se entiende por unidad de operacion,
      que es como se ha llamado siempre a esta funcion.

      Se DIVIDE, al reves que la cantidad: el precio del bulto repartido entre
      lo que trae.
    */
    if coalesce((v_r->>'costo_por_presentacion')::boolean, false) then
      -- El divisor sale de la MISMA presentacion que nombro el renglon, no de
      -- la de por defecto: si no, «3 BIDON a 130 el bidon» divide entre 208.
      declare v_factor numeric := private.en_unidad_base(v_articulo, 1, 0, v_nombre_pres);
      begin
        if coalesce(v_factor, 0) <= 0 then
          raise exception 'El renglón % (%): no se puede dar el costo por presentación porque el catálogo no dice cuántas unidades trae.', v_n, v_nombre
            using errcode = '22023';
        end if;
        v_costo := v_costo / v_factor;
      end;
    end if;

    if v_sin_valor then
      /*
        Sin cifra no hay nada que convertir, y pedir la tasa del dia pararia la
        carga por una razon que no tiene nada que ver con este renglon: se esta
        cargando un inventario viejo, y la tasa que falta es la de hoy.
      */
      v_costo_usd := null;
    else
      select t.tasa, t.tasa_usd into v_tasa, v_tasa_usd
        from private.tasas_del_dia(v_moneda, coalesce(p_fecha, current_date)) t;
      if v_tasa is null or coalesce(v_tasa_usd, 0) = 0 then
        raise exception 'El renglón % (%): no hay tasa cargada para % en esa fecha, así que no se puede saber cuánto costó.', v_n, v_nombre, v_moneda using errcode = '22023';
      end if;

      v_costo_usd := round(v_costo * v_tasa / v_tasa_usd, 6);
    end if;

    /*
      EL AVISO DEL COSTO RARO, RENGLON A RENGLON. La confirmacion viaja EN EL
      RENGLON: con quince renglones, un unico «confirmo» aceptaria a ciegas los
      catorce que nadie miro.
    */
    v_ref := private.costo_promedio(p_almacen_id, v_articulo);

    /*
      LA PRIMERA VEZ NO HAY CONTRA QUE COMPARAR, Y ES CUANDO MAS DUELE.

      La reja de abajo compara el costo nuevo con el promedio que el articulo ya
      tenia. En su primera entrada ese promedio no existe, asi que la reja calla
      — y es justo la entrada que fijo los 868 millones el 5 de septiembre: los
      cinco aceites entraban por primera vez.

      No hay numero contra el que medir, asi que no se puede avisar de que algo
      esta mal. Lo que si se puede es DECIR QUE NADIE LO ESTA COMPROBANDO, y
      pedir que alguien mire antes de que ese costo se convierta en la
      referencia de todo lo que venga despues.

      Se pide una sola vez por articulo y almacen. A partir del segundo
      movimiento hay promedio y manda la reja de las diez veces.
    */
    if not v_sin_valor and coalesce(v_ref, 0) = 0
       and not coalesce((v_r->>'confirmado')::boolean, false) then
      raise exception 'El renglón % (%): es la primera vez que entra a este almacén, así que no hay con qué comparar el costo. Serán % % a % cada una. Compruébalo con la factura y acéptalo.',
        v_n, v_nombre, private.numero_es(v_cantidad, 2),
        (select unidad from public.articulos where id = v_articulo),
        private.numero_es(v_costo, 4)
        using errcode = '22023',
              hint = 'Este costo se convierte en la referencia de todo lo que entre después. Un cero de más aquí no lo va a corregir nadie.';
    end if;

    if not v_sin_valor and coalesce(v_ref, 0) > 0 then
      v_veces := round(v_costo_usd / v_ref, 6);
      if v_veces >= c_factor or v_veces <= (1 / c_factor) then
        if not coalesce((v_r->>'confirmado')::boolean, false) then
          v_msg := case when private.puede_accion('INVENTARIO.VER_VALORACION')
            then format('El renglón %s (%s): viene costando %s por unidad y lo estás metiendo a %s: son %s. Si es correcto, acéptalo y quedará anotado.',
                        v_n, v_nombre, private.numero_es(v_ref, 4),
                        private.numero_es(v_costo_usd, 4), case when v_veces >= 1 then private.numero_es(v_veces, 2) || ' veces mas'
                   else private.numero_es(v_ref / nullif(v_costo_usd, 0), 2) || ' veces menos' end)
            else format('El renglón %s (%s): ese costo se sale mucho de lo que el artículo viene costando. Compruébalo con la factura; si es correcto, acéptalo y quedará anotado.',
                        v_n, v_nombre)
          end;
          raise exception '%', v_msg
            using errcode = '22023',
                  hint = 'Comprueba la factura y la moneda antes de aceptar: un cero de más aquí se arrastra a cada salida.';
        end if;
      else
        v_veces := null;
      end if;
    end if;

    perform private.registrar_movimiento(
      'ENTRADA_DIRECTA', 1::smallint, p_almacen_id, v_articulo, v_cantidad,
      -- Nulo y no cero: el hueco se guarda como hueco.
      case when v_sin_valor then null else v_costo_usd end,
      case when v_sin_valor then v_nota || ' · Sin valor declarado: entró sin cifra y queda pendiente de valorar.'
           when v_moneda = 'USD' then v_nota
           else v_nota || ' · Costo declarado: ' || v_costo || ' ' || v_moneda end,
      null, null, null, p_fecha, null, null,
      p_aviso_costo => v_veces,
      p_propietario => v_dueno,
      p_cantidad_capturada => nullif(v_pres, 0),
      p_unidad_capturada => case when v_pres > 0 then private.presentacion_usada(v_articulo, v_nombre_pres) end,
      p_suelto_capturado => case when v_pres > 0 then nullif(v_sueltas, 0) end);
  end loop;

  return v_n;
end;
$function$;
