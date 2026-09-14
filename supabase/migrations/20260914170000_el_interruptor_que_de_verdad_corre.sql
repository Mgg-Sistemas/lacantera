/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  6 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
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
  viva —no normalizado, no perdonando comentarios— y los 6 coinciden. Y el
  detector, que antes marcaba estas 6, pasa a cero.

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

-- private.salario_para_prestaciones(p_empleado bigint, p_hasta date, p_desde date, OUT normal_diario numeric, OUT integral_diario numeric, OUT estimado boolean)
-- venia de: 20260914100000_las_prestaciones_en_la_moneda_de_la_ficha.sql
CREATE OR REPLACE FUNCTION private.salario_para_prestaciones(p_empleado bigint, p_hasta date, p_desde date DEFAULT NULL::date, OUT normal_diario numeric, OUT integral_diario numeric, OUT estimado boolean)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_emp       record;
  v_rec       record;
  v_tasa_usd  numeric;
  v_divisor   numeric;
  v_dias_bv   numeric;
  v_dias_util numeric;
begin
  select * into v_emp from public.empleados where id = p_empleado;
  if v_emp.id is null then
    raise exception 'No existe el trabajador %.', p_empleado using errcode = 'P0002';
  end if;

  select r.salario_normal_diario, r.salario_integral_diario, p.tasa_usd, p.hasta
    into v_rec
    from public.nomina_recibos r
    join public.nomina_periodos p on p.id = r.periodo_id
   where r.empleado_id = p_empleado
     and p.estado <> 'ANULADA'
     and p.hasta <= p_hasta
     -- Un recibo de solo lo pactado no trae salario de ley: sin el, se estima
     -- desde la ficha como si no hubiera recibo.
     and not coalesce(p.solo_lo_pactado, false)
     and (p_desde is null or p.hasta >= p_desde)
   order by p.hasta desc, r.id desc
   limit 1;

  if v_rec.salario_normal_diario is not null and v_rec.salario_normal_diario > 0 then
    /*
      EL RECIBO ESTA EN BOLIVARES Y LOS CONSUMIDORES GUARDAN EN LA MONEDA DE LA
      FICHA. Se deshace la conversion con la tasa congelada del periodo, por la
      misma via con que calcular_nomina la hizo. Antes se devolvia tal cual: la
      liquidacion de una ficha de 900 USD salia multiplicada por la tasa.
    */
    v_divisor := private.tasa_de_nomina(v_emp.moneda_salario, v_rec.tasa_usd, v_rec.hasta);
    normal_diario   := v_rec.salario_normal_diario   / v_divisor;
    integral_diario := v_rec.salario_integral_diario / v_divisor;
    estimado := false;
    return;
  end if;

  -- Sin recibos: se estima desde la ficha, con el mismo despeje de la nomina.
  estimado := true;

  select t.tasa_usd into v_tasa_usd from private.tasas_del_dia('USD', p_hasta) t;

  /*
    EL SUELDO DE LA FICHA ES LO QUE SE RECIBE, NO EL BASICO. Dividirlo entre 30
    daba 30,00 donde el recibo guarda 28,99. Se despeja como en calcular_nomina,
    sobre un mes, y se lleva a la moneda de la ficha.
  */
  normal_diario := private.basico_diario_englobado(
                     p_empleado, p_hasta, v_tasa_usd,
                     private.parametro('dias_mes_nomina', p_hasta))
                   / private.tasa_de_nomina(v_emp.moneda_salario, v_tasa_usd, p_hasta);

  v_dias_bv   := private.dias_bono_vacacional(p_empleado, p_hasta);
  v_dias_util := coalesce(v_emp.dias_utilidades,
                          private.parametro('utilidades_dias_minimo', p_hasta));

  integral_diario := normal_diario
    + (normal_diario * v_dias_bv)   / private.parametro('dias_base_alicuotas', p_hasta)
    + (normal_diario * v_dias_util) / private.parametro('dias_base_alicuotas', p_hasta);
end
$function$;

-- public.aprobar_nomina(p_periodo_id bigint)
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.aprobar_nomina(p_periodo_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  /*
    EL REGIMEN CON QUE SE CALCULO TIENE QUE SER EL QUE RIGE.

    Si el interruptor de los conceptos de ley se movio despues del calculo, los
    recibos estan hechos con reglas que ya no rigen para esta quincena. Aprobarlos
    seria pagar lo que el sistema ya no calcularia.
  */
  if v_p.solo_lo_pactado is distinct from private.nomina_solo_lo_pactado(v_p.hasta) then
    raise exception 'El régimen de la nómina cambió después de calcular la %: vuelve a calcularla antes de aprobarla.',
      v_p.numero
      using errcode = '55000';
  end if;

  update public.nomina_periodos
     set estado = 'APROBADA', aprobada_por = (select auth.uid()), aprobada_en = now()
   where id = p_periodo_id;

  perform private.notificar(
    'NOMINA', 'APROBADA',
    'Nómina ' || v_p.numero || ' aprobada',
    v_recibos || ' recibos por ' || private.numero_es(v_neto, 2) || ' Bs. Lista para pagar.',
    '/app/nomina/procesos',
    array['RRHH'], 'ATENCION');
end;
$function$;

-- public.calcular_nomina(p_periodo_id bigint)
-- venia de: 20260914150000_la_nomina_que_de_verdad_corre.sql
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
  v_pactado       boolean;
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
    SOLO LO PACTADO, CON EL CALCULO DE LEY APAGADO Y NO BORRADO.

    Decision de la empresa del 14/09/2026: el recibo lleva el sueldo de la ficha,
    los bonos y comisiones y los descuentos cargados a mano, y resta las faltas
    injustificadas. Se deshabilito en vez de borrarse: todo lo de ley sigue aqui
    debajo, dentro de `if not v_pactado`, y vuelve a correr el dia que
    `regimen_nomina` diga DE LEY desde una fecha. Se lee por la fecha de cierre del
    periodo, y los aprobados o pagados no se recalculan: ninguno cambia de regimen
    por debajo.

    Con el interruptor puesto no hay cestaticket aparte, ni retenciones de ley, ni
    aportes, ni provision, ni recargos de horas extra, nocturnas, feriados o
    descansos: lo que haya que pagar de eso va como bono. El tope del tercio en los
    descuentos y la regla del recibo en negativo siguen igual.
  */
  v_pactado := private.nomina_solo_lo_pactado(v_p.hasta);

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

    if v_pactado then
      -- El sueldo de la ficha, tal cual, por los dias pagados. No hay nada de ley
      -- que sacarle, asi que no hay nada que despejar.
      v_basico_diario   := v_objetivo / v_dias_pagados;
      v_cesta_periodo   := 0;
      v_dias_bv         := 0;
      v_dias_util       := 0;
      v_factor_integral := 1;
    else
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

    if not v_pactado then
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

    if not v_pactado then
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
    end if;

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

    if not v_pactado then

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
    end if;

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
     set estado = 'CALCULADA', calculada_en = now(), solo_lo_pactado = v_pactado
   where id = p_periodo_id;

  return v_recibos;
end;
$function$;

-- public.cerrar_parametro_nomina(p_id bigint, p_hasta date)
-- venia de: 20260822110000_un_parametro_se_puede_quitar_si_nadie_lo_uso.sql
CREATE OR REPLACE FUNCTION public.cerrar_parametro_nomina(p_id bigint, p_hasta date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_desde date;
  v_clave text;
begin
  perform private.exigir_rol('RRHH');

  select vigencia_desde, clave into v_desde, v_clave
    from public.nomina_parametros where id = p_id;

  if v_desde is null then
    raise exception 'Ese parámetro ya no está.' using errcode = 'P0002';
  end if;

  -- El regimen no se cierra: se cambia con su interruptor, que deja escrito a que.
  if v_clave = 'regimen_nomina' then
    raise exception 'El régimen de la nómina no se cierra: se cambia con el interruptor de los conceptos de ley, en Parámetros de nómina.'
      using errcode = '22023';
  end if;

  if p_hasta is null then
    raise exception 'Hay que decir hasta qué día rigió.' using errcode = '22023';
  end if;

  if p_hasta < v_desde then
    raise exception 'No puede dejar de regir antes de empezar: «%» rige desde el %.',
      v_clave, to_char(v_desde, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  update public.nomina_parametros set vigencia_hasta = p_hasta where id = p_id;
end;
$function$;

-- public.eliminar_parametro_nomina(p_id bigint)
-- venia de: 20260822110000_un_parametro_se_puede_quitar_si_nadie_lo_uso.sql
CREATE OR REPLACE FUNCTION public.eliminar_parametro_nomina(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_desde  date;
  v_hasta  date;
  v_clave  text;
  v_choca  text;
begin
  perform private.exigir_rol('RRHH');

  select clave, vigencia_desde, vigencia_hasta
    into v_clave, v_desde, v_hasta
    from public.nomina_parametros where id = p_id;

  if v_clave is null then
    raise exception 'Ese parámetro ya no está.' using errcode = 'P0002';
  end if;

  -- El regimen no se borra: se cambia con su interruptor.
  if v_clave = 'regimen_nomina' then
    raise exception 'El régimen de la nómina no se elimina: se cambia con el interruptor de los conceptos de ley, en Parámetros de nómina.'
      using errcode = '22023';
  end if;

  -- Cualquier período que se solape con su vigencia pudo haberlo usado.
  select string_agg(numero, ', ' order by desde)
    into v_choca
    from public.nomina_periodos
   where estado <> 'ANULADA'
     and desde <= coalesce(v_hasta, 'infinity'::date)
     and hasta >= v_desde;

  if v_choca is not null then
    raise exception 'No se puede eliminar «%»: la nómina % se calculó mientras esta cifra regía, y borrarla haría que esos recibos ya no se puedan recalcular. Si dejó de aplicar, ponle fecha de fin en vez de borrarla.',
      v_clave, v_choca
      using errcode = '23503';
  end if;

  delete from public.nomina_parametros where id = p_id;
end;
$function$;

-- public.guardar_parametro_nomina(p_clave text, p_unidad text, p_desde date, p_descripcion text, p_valor numeric, p_texto text, p_fuente text)
-- venia de: 20260729090000_parametros_de_texto.sql
CREATE OR REPLACE FUNCTION public.guardar_parametro_nomina(p_clave text, p_unidad text, p_desde date, p_descripcion text, p_valor numeric DEFAULT NULL::numeric, p_texto text DEFAULT NULL::text, p_fuente text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id    bigint;
  v_texto text := nullif(trim(coalesce(p_texto, '')), '');
begin
  perform private.exigir_rol('RRHH');

  -- El regimen no es una cifra mas: se cambia con su interruptor.
  if p_clave = 'regimen_nomina' then
    raise exception 'El régimen de la nómina no se carga como un parámetro más: se cambia con el interruptor de los conceptos de ley, en Parámetros de nómina.'
      using errcode = '22023';
  end if;

  if p_unidad = 'TEXTO' then
    if v_texto is null then
      raise exception 'Un parámetro de texto necesita un valor escrito.';
    end if;
  elsif p_valor is null then
    raise exception 'Un parámetro de unidad % necesita un número.', p_unidad;
  end if;

  -- Se cierra la vigencia anterior en vez de borrarla: sin el histórico, una
  -- nómina de marzo recalculada en agosto usaría cifras que en marzo no
  -- existían.
  update public.nomina_parametros
     set vigencia_hasta = p_desde - 1
   where clave = p_clave and vigencia_hasta is null and vigencia_desde < p_desde;

  insert into public.nomina_parametros
    (clave, valor, valor_texto, unidad, vigencia_desde, descripcion, fuente, registrado_por)
  values (
    p_clave,
    case when p_unidad = 'TEXTO' then null else p_valor end,
    case when p_unidad = 'TEXTO' then v_texto else null end,
    p_unidad, p_desde, p_descripcion,
    nullif(trim(coalesce(p_fuente, '')), ''), (select auth.uid())
  )
  on conflict (clave, vigencia_desde) do update set
    valor = excluded.valor,
    valor_texto = excluded.valor_texto,
    unidad = excluded.unidad,
    descripcion = excluded.descripcion,
    fuente = excluded.fuente,
    registrado_por = excluded.registrado_por,
    registrado_en = now()
  returning id into v_id;

  return v_id;
end;
$function$;
