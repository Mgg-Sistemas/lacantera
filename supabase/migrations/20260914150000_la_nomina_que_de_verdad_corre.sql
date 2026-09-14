/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  5 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
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
  viva —no normalizado, no perdonando comentarios— y los 5 coinciden. Y el
  detector, que antes marcaba estas 5, pasa a cero.

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

-- public.calcular_intereses_prestaciones(p_anio integer, p_mes integer)
-- venia de: 20260805130000_prestaciones.sql
CREATE OR REPLACE FUNCTION public.calcular_intereses_prestaciones(p_anio integer, p_mes integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tasa    numeric;
  v_hasta   date;
  v_emp     record;
  v_base    numeric;
  v_monto   numeric;
  v_cuantos integer := 0;
begin
  perform private.exigir_permiso('NOMINA', 'ESCRITURA');

  select tasa into v_tasa from public.prestaciones_tasas where anio = p_anio and mes = p_mes;

  if v_tasa is null then
    raise exception 'No está cargada la tasa de intereses de %/%. Cárgala antes de calcular: con una tasa inventada, los intereses también lo serían.',
      p_mes, p_anio using errcode = 'P0002';
  end if;

  v_hasta := (make_date(p_anio, p_mes, 1) + interval '1 month' - interval '1 day')::date;

  -- Con la nomina en solo lo pactado, las prestaciones estan deshabilitadas.
  perform private.exigir_prestaciones_habilitadas(v_hasta);

  if v_hasta > current_date then
    raise exception 'El mes %/% todavía no ha terminado.', p_mes, p_anio using errcode = '22023';
  end if;

  for v_emp in
    select p.* from public.v_prestaciones p
    where p.fecha_egreso is null or p.fecha_egreso >= make_date(p_anio, p_mes, 1)
  loop
    -- Los intereses corren sobre la garantía, no sobre los intereses ya
    -- abonados: eso sería interés sobre interés y la ley no lo manda.
    v_base := v_emp.garantia - v_emp.anticipos - v_emp.corte_anticipos;

    continue when coalesce(v_base, 0) <= 0;

    v_monto := round(v_base * v_tasa / 100 / 12, 2);

    continue when v_monto <= 0;

    insert into public.prestaciones_intereses
      (empleado_id, anio, mes, base, tasa, moneda, monto, calculado_por)
    values
      (v_emp.empleado_id, p_anio, p_mes, round(v_base, 2), v_tasa,
       v_emp.moneda, v_monto, (select auth.uid()))
    on conflict (empleado_id, anio, mes) do update
      set base = excluded.base, tasa = excluded.tasa, monto = excluded.monto,
          calculado_por = excluded.calculado_por, calculado_en = now();

    v_cuantos := v_cuantos + 1;
  end loop;

  return v_cuantos;
end;
$function$;

-- public.calcular_liquidacion(p_empleado_id bigint, p_fecha_egreso date, p_motivo text, p_otras_asignaciones numeric, p_otras_deducciones numeric, p_observacion text)
-- venia de: 20260805130000_prestaciones.sql
CREATE OR REPLACE FUNCTION public.calcular_liquidacion(p_empleado_id bigint, p_fecha_egreso date, p_motivo text, p_otras_asignaciones numeric DEFAULT 0, p_otras_deducciones numeric DEFAULT 0, p_observacion text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_emp    record;
  v_p      record;
  v_sal    record;
  v_tasas  record;
  v_dias_servicio integer;
  v_anios  numeric;
  v_anios_enteros integer;
  v_meses_frac numeric;
  v_retro  numeric;
  v_base   numeric;
  v_vac_dias numeric;
  v_bv_dias  numeric;
  v_util_dias numeric;
  v_vac    numeric;
  v_bv     numeric;
  v_util   numeric;
  v_indem  numeric := 0;
  v_total  numeric;
  v_id     bigint;
begin
  perform private.exigir_permiso('NOMINA', 'TOTAL');

  -- Con la nomina en solo lo pactado, las prestaciones estan deshabilitadas.
  perform private.exigir_prestaciones_habilitadas(p_fecha_egreso);

  select * into v_emp from public.empleados where id = p_empleado_id;

  if v_emp.id is null then
    raise exception 'No existe el trabajador %.', p_empleado_id using errcode = 'P0002';
  end if;

  if p_fecha_egreso < v_emp.fecha_ingreso then
    raise exception 'La fecha de egreso es anterior a la de ingreso.' using errcode = '22023';
  end if;

  if p_fecha_egreso > current_date then
    raise exception 'No se liquida con fecha futura.' using errcode = '22023';
  end if;

  if exists (select 1 from public.prestaciones_liquidaciones
              where empleado_id = p_empleado_id and estado <> 'ANULADA') then
    raise exception 'A % ya se le calculó la liquidación. Anúlala primero si hay que rehacerla.',
      v_emp.nombres using errcode = '55000';
  end if;

  v_dias_servicio := p_fecha_egreso - v_emp.fecha_ingreso;
  v_anios := round(v_dias_servicio::numeric / 365, 4);
  v_anios_enteros := floor(v_dias_servicio::numeric / 365)::integer;

  -- Una fracción superior a seis meses cuenta como año completo (LOTTT 142.c).
  v_meses_frac := (v_dias_servicio - v_anios_enteros * 365)::numeric / 30;
  if v_meses_frac > 6 then
    v_anios_enteros := v_anios_enteros + 1;
  end if;

  select * into v_sal from private.salario_para_prestaciones(p_empleado_id, p_fecha_egreso);
  select * into v_p   from public.v_prestaciones where empleado_id = p_empleado_id;
  select * into v_tasas from private.tasas_del_dia(v_emp.moneda_salario, p_fecha_egreso);

  -- Las dos cuentas que manda comparar el 142.d.
  v_retro := round(v_anios_enteros * 30 * v_sal.integral_diario, 2);
  v_base  := greatest(round(v_p.garantia, 2), v_retro);

  -- Vacaciones y bono vacacional fraccionados por los meses completos del
  -- último año de servicio (LOTTT 196).
  v_vac_dias := round(
    (15 + least(greatest(v_anios_enteros - 1, 0), 15))
    * least(v_meses_frac, 12) / 12, 2);
  v_bv_dias := round(
    private.dias_bono_vacacional(p_empleado_id, p_fecha_egreso)
    * least(v_meses_frac, 12) / 12, 2);
  v_util_dias := round(
    coalesce(v_emp.dias_utilidades, private.parametro('utilidades_dias_minimo', p_fecha_egreso))
    * least(extract(month from p_fecha_egreso)::numeric, 12) / 12, 2);

  v_vac  := round(v_vac_dias  * v_sal.normal_diario, 2);
  v_bv   := round(v_bv_dias   * v_sal.normal_diario, 2);
  v_util := round(v_util_dias * v_sal.normal_diario, 2);

  -- LOTTT 92: el despido injustificado paga, además, otro tanto igual.
  if p_motivo = 'DESPIDO_INJUSTIFICADO' then
    v_indem := v_base;
  end if;

  v_total := round(
    v_base + round(v_p.intereses, 2) + v_vac + v_bv + v_util + v_indem
    - round(v_p.anticipos + v_p.corte_anticipos, 2)
    + coalesce(p_otras_asignaciones, 0) - coalesce(p_otras_deducciones, 0), 2);

  insert into public.prestaciones_liquidaciones
    (numero, empleado_id, fecha_ingreso, fecha_egreso, motivo,
     anios_servicio, dias_servicio, moneda, tasa, tasa_usd,
     salario_normal_diario, salario_integral_diario,
     garantia_acumulada, retroactivo_30_dias, base_prestaciones,
     intereses, anticipos,
     vacaciones_dias, vacaciones_monto, bono_vacacional_dias, bono_vacacional_monto,
     utilidades_dias, utilidades_monto, indemnizacion,
     otras_asignaciones, otras_deducciones, total, observacion, calculada_por)
  values
    (private.siguiente_numero('LIQ'), p_empleado_id, v_emp.fecha_ingreso, p_fecha_egreso,
     p_motivo, v_anios, v_dias_servicio, v_emp.moneda_salario, v_tasas.tasa, v_tasas.tasa_usd,
     round(v_sal.normal_diario, 6), round(v_sal.integral_diario, 6),
     round(v_p.garantia, 2), v_retro, v_base,
     round(v_p.intereses, 2), round(v_p.anticipos + v_p.corte_anticipos, 2),
     v_vac_dias, v_vac, v_bv_dias, v_bv, v_util_dias, v_util, v_indem,
     coalesce(p_otras_asignaciones, 0), coalesce(p_otras_deducciones, 0), v_total,
     nullif(trim(coalesce(p_observacion, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$function$;

-- public.calcular_nomina(p_periodo_id bigint)
-- venia de: 20260914090000_los_cuerpos_que_de_verdad_corren.sql
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
     set estado = 'CALCULADA', calculada_en = now()
   where id = p_periodo_id;

  return v_recibos;
end;
$function$;

-- public.calcular_trimestre_prestaciones(p_anio integer, p_trimestre integer)
-- venia de: 20260805130000_prestaciones.sql
CREATE OR REPLACE FUNCTION public.calcular_trimestre_prestaciones(p_anio integer, p_trimestre integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_desde   date;
  v_hasta   date;
  v_emp     record;
  v_sal     record;
  v_tasas   record;
  v_dias    numeric;
  v_adic    numeric;
  v_anios   integer;
  v_cuantos integer := 0;
begin
  perform private.exigir_permiso('NOMINA', 'ESCRITURA');

  if p_trimestre not between 1 and 4 then
    raise exception 'El trimestre va del 1 al 4 (recibido: %).', p_trimestre using errcode = '22023';
  end if;

  v_desde := make_date(p_anio, p_trimestre * 3 - 2, 1);
  v_hasta := (v_desde + interval '3 months' - interval '1 day')::date;

  if v_hasta > current_date then
    raise exception 'El trimestre % de % todavía no ha terminado: cierra el %.',
      p_trimestre, p_anio, to_char(v_hasta, 'DD/MM/YYYY') using errcode = '22023';
  end if;

  -- Con la nomina en solo lo pactado, las prestaciones estan deshabilitadas.
  perform private.exigir_prestaciones_habilitadas(v_hasta);

  v_dias := private.parametro('prestaciones_dias_trimestre', v_hasta);

  for v_emp in
    select e.*, c.fecha_corte
    from public.empleados e
    left join public.prestaciones_corte c on c.empleado_id = e.id
    where e.fecha_ingreso <= v_hasta
      and (e.fecha_egreso is null or e.fecha_egreso >= v_desde)
    order by e.apellidos, e.nombres
  loop
    -- La garantía se causa a partir del tercer mes de servicio (LOTTT 142.a).
    continue when v_emp.fecha_ingreso + 90 > v_hasta;

    -- Nada anterior al corte: eso ya está cargado a mano.
    continue when v_emp.fecha_corte is not null and v_hasta <= v_emp.fecha_corte;

    continue when exists (
      select 1 from public.prestaciones_depositos
       where empleado_id = v_emp.id and anio = p_anio and trimestre = p_trimestre
         and estado = 'CALCULADO');

    select * into v_sal from private.salario_para_prestaciones(v_emp.id, v_hasta, v_desde);

    -- Los dos días adicionales por año, en el trimestre del aniversario y solo
    -- a partir del segundo año, acumulativos hasta treinta (LOTTT 142.b).
    v_adic := 0;
    v_anios := extract(year from age(v_hasta, v_emp.fecha_ingreso))::integer;

    if v_anios >= 1
       and make_date(p_anio, extract(month from v_emp.fecha_ingreso)::integer,
                     least(extract(day from v_emp.fecha_ingreso)::integer, 28))
           between v_desde and v_hasta then
      v_adic := least(v_anios * 2, 30);
    end if;

    select * into v_tasas from private.tasas_del_dia(v_emp.moneda_salario, v_hasta);

    insert into public.prestaciones_depositos
      (empleado_id, anio, trimestre, fecha, dias, dias_adicionales,
       salario_normal_diario, salario_integral_diario,
       moneda, tasa, tasa_usd, monto, estimado, calculado_por)
    values
      (v_emp.id, p_anio, p_trimestre, v_hasta, v_dias, v_adic,
       round(v_sal.normal_diario, 6), round(v_sal.integral_diario, 6),
       v_emp.moneda_salario, v_tasas.tasa, v_tasas.tasa_usd,
       round((v_dias + v_adic) * v_sal.integral_diario, 2), v_sal.estimado,
       (select auth.uid()));

    v_cuantos := v_cuantos + 1;
  end loop;

  return v_cuantos;
end;
$function$;

-- public.registrar_anticipo_prestaciones(p_empleado_id bigint, p_monto numeric, p_motivo text, p_cuenta_id bigint, p_fecha date, p_detalle text, p_referencia text)
-- venia de: 20260908290000_los_cuerpos_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.registrar_anticipo_prestaciones(p_empleado_id bigint, p_monto numeric, p_motivo text, p_cuenta_id bigint DEFAULT NULL::bigint, p_fecha date DEFAULT NULL::date, p_detalle text DEFAULT NULL::text, p_referencia text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_p      record;
  v_emp    record;
  v_cuenta record;
  v_fecha  date := coalesce(p_fecha, current_date);
  v_tasas  record;
  v_id     bigint;
  v_mov    bigint;
begin
  -- Adelantar prestaciones es sacar dinero contra lo que se le debe a alguien.
  perform private.exigir_permiso('NOMINA', 'TOTAL');

  -- Con la nomina en solo lo pactado, las prestaciones estan deshabilitadas.
  perform private.exigir_prestaciones_habilitadas(v_fecha);

  select * into v_emp from public.empleados where id = p_empleado_id;
  if v_emp.id is null then
    raise exception 'No existe el trabajador %.', p_empleado_id using errcode = 'P0002';
  end if;

  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El anticipo tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  if v_fecha > current_date then
    raise exception 'No se registra un anticipo con fecha futura.' using errcode = '22023';
  end if;

  select * into v_p from public.v_prestaciones where empleado_id = p_empleado_id;

  if p_monto > v_p.disponible_anticipo + 0.01 then
    raise exception 'A % se le pueden adelantar hasta % y se están pidiendo %. La ley permite adelantar hasta el 75%% de lo acumulado.',
      v_p.nombre, private.numero_es(v_p.disponible_anticipo, 2), private.numero_es(p_monto, 2) using errcode = '55000';
  end if;

  select * into v_tasas from private.tasas_del_dia(v_emp.moneda_salario, v_fecha);

  insert into public.prestaciones_anticipos
    (numero, empleado_id, fecha, motivo, detalle, cuenta_id, moneda, tasa, tasa_usd,
     monto, referencia, registrado_por)
  values
    (private.siguiente_numero('ANT'), p_empleado_id, v_fecha, p_motivo,
     nullif(trim(coalesce(p_detalle, '')), ''), p_cuenta_id, v_emp.moneda_salario,
     v_tasas.tasa, v_tasas.tasa_usd, p_monto,
     nullif(trim(coalesce(p_referencia, '')), ''), (select auth.uid()))
  returning id into v_id;

  -- El dinero sale de verdad, así que el libro de tesorería tiene que verlo.
  if p_cuenta_id is not null then
    select * into v_cuenta from public.cuentas_tesoreria where id = p_cuenta_id;

    if v_cuenta.id is null then
      raise exception 'No existe la cuenta %.', p_cuenta_id using errcode = 'P0002';
    end if;

    v_mov := private.registrar_movimiento_tesoreria(
      p_cuenta_id, 'EGRESO', -1, p_monto,
      format('ANTICIPO DE PRESTACIONES A %s %s', v_emp.nombres, v_emp.apellidos),
      v_fecha, p_referencia, v_emp.apellidos || ', ' || v_emp.nombres,
      null, null, null, p_detalle);

    update public.prestaciones_anticipos set movimiento_id = v_mov where id = v_id;
  end if;

  return v_id;
end;
$function$;
