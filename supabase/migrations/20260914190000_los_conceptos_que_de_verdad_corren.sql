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

-- private.basico_diario_englobado(p_empleado bigint, p_fecha date, p_tasa_usd numeric, p_dias numeric)
-- venia de: 20260914100000_las_prestaciones_en_la_moneda_de_la_ficha.sql
CREATE OR REPLACE FUNCTION private.basico_diario_englobado(p_empleado bigint, p_fecha date, p_tasa_usd numeric, p_dias numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_emp          record;
  v_dias_mes     numeric;
  v_horas        numeric;
  v_obj_diario   numeric;
  v_tasa_salario numeric;
  v_obj          numeric;
  v_cesta        numeric;
  v_ivss         numeric;
  v_rpe          numeric;
  v_sm           numeric;
  v_bv           numeric;
  v_util         numeric;
  v_factor       numeric;
  v_basico       numeric;
  v_ley          text[];
begin
  /*
    GEMELO DEL DESPEJE DE `calcular_nomina`. Si cambia alli, cambia aqui: la
    migracion 20260914100000 comprueba que los dos dan lo mismo sobre los recibos
    vivos, y esa comprobacion se puede repetir en cualquier momento.

    Devuelve el basico diario en BOLIVARES, igual que lo guarda el recibo.
  */
  select * into v_emp from public.empleados where id = p_empleado;
  if v_emp.id is null then
    raise exception 'No existe el trabajador %.', p_empleado using errcode = 'P0002';
  end if;
  if coalesce(p_dias, 0) <= 0 then
    raise exception 'Hacen falta dias para despejar el basico.' using errcode = '22023';
  end if;

  v_dias_mes := private.parametro('dias_mes_nomina', p_fecha);
  v_sm       := private.parametro('salario_minimo_nacional', p_fecha);
  v_horas    := private.parametro(
    case v_emp.tipo_jornada
      when 'NOCTURNA' then 'jornada_nocturna_horas'
      when 'MIXTA'    then 'jornada_mixta_horas'
      else 'jornada_diurna_horas'
    end, p_fecha);

  v_obj_diario := case v_emp.base_estipulacion
    when 'MENSUAL' then v_emp.salario_base / v_dias_mes
    when 'DIARIO'  then v_emp.salario_base
    when 'HORA'    then v_emp.salario_base * v_horas
  end;

  v_tasa_salario := private.tasa_de_nomina(v_emp.moneda_salario, p_tasa_usd, p_fecha);

  -- Como en calcular_nomina: cada pieza entra solo si su concepto esta encendido.
  v_ley   := private.conceptos_de_ley(p_fecha);
  v_obj   := round(v_obj_diario * v_tasa_salario * p_dias, 2);
  v_cesta := case when 'CESTATICKET' = any(v_ley)
                  then round(private.parametro('cestaticket_mensual_usd', p_fecha) * p_tasa_usd
                             / v_dias_mes * p_dias, 2)
                  else 0 end;
  v_ivss  := case when 'IVSS' = any(v_ley)
                  then round(v_sm * private.parametro('ivss_tope_salarios_minimos', p_fecha)
                             * private.parametro('ivss_trabajador', p_fecha) / 100
                             * p_dias / v_dias_mes, 2)
                  else 0 end;
  v_rpe   := case when 'RPE' = any(v_ley)
                  then round(greatest(v_sm * private.parametro('rpe_tope_salarios_minimos', p_fecha),
                                      v_sm * private.parametro('rpe_piso_salarios_minimos', p_fecha))
                             * private.parametro('rpe_trabajador', p_fecha) / 100
                             * p_dias / v_dias_mes, 2)
                  else 0 end;

  v_bv   := private.dias_bono_vacacional(p_empleado, p_fecha);
  v_util := coalesce(v_emp.dias_utilidades, private.parametro('utilidades_dias_minimo', p_fecha));
  v_factor := 1
    + v_bv   / private.parametro('dias_base_alicuotas', p_fecha)
    + v_util / private.parametro('dias_base_alicuotas', p_fecha);

  v_basico := (v_obj - v_cesta + v_ivss + v_rpe)
    / (p_dias * (1 - case when 'FAOV' = any(v_ley)
                          then v_factor * private.parametro('faov_trabajador', p_fecha) / 100
                          else 0 end));

  if 'CESTATICKET' = any(v_ley) and v_basico <= 0 then
    raise exception 'El sueldo de % no alcanza a cubrir el beneficio de alimentacion.',
      v_emp.nombres || ' ' || v_emp.apellidos
      using errcode = '22023',
            hint = 'El sueldo de la ficha es lo que la persona recibe, y de ahi sale el cestaticket. Revisa la ficha.';
  end if;

  if v_ley && array['IVSS', 'RPE']::text[]
     and v_basico * v_dias_mes
       < v_sm * greatest(
           case when 'IVSS' = any(v_ley) then private.parametro('ivss_tope_salarios_minimos', p_fecha) else 0 end,
           case when 'RPE' = any(v_ley) then private.parametro('rpe_tope_salarios_minimos', p_fecha) else 0 end) then
    raise exception 'El seguro social de % dejo de estar topado, y el basico ya no se puede despejar con esta ecuacion.',
      v_emp.nombres || ' ' || v_emp.apellidos
      using errcode = '22023';
  end if;

  return v_basico;
end
$function$;

-- private.salario_para_prestaciones(p_empleado bigint, p_hasta date, p_desde date, OUT normal_diario numeric, OUT integral_diario numeric, OUT estimado boolean)
-- venia de: 20260914170000_el_interruptor_que_de_verdad_corre.sql
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
     -- Solo trae salario de ley un recibo calculado con el salario integral, que
     -- es cuando el FAOV o las prestaciones estaban encendidos. Sin el, se estima
     -- desde la ficha como si no hubiera recibo. Sin lista es de antes del
     -- interruptor, y se calculo con todo.
     and coalesce(p.conceptos_de_ley && array['FAOV', 'PRESTACIONES']::text[], true)
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
-- venia de: 20260914170000_el_interruptor_que_de_verdad_corre.sql
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
    LOS CONCEPTOS CON QUE SE CALCULO TIENEN QUE SER LOS QUE RIGEN.

    Si algun interruptor de los conceptos de ley se movio despues del calculo, los
    recibos estan hechos con reglas que ya no rigen para esta quincena. Aprobarlos
    seria pagar lo que el sistema ya no calcularia.
  */
  if v_p.conceptos_de_ley is distinct from private.conceptos_de_ley(v_p.hasta) then
    raise exception 'Los conceptos de ley cambiaron después de calcular la %: vuelve a calcularla antes de aprobarla.',
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
-- venia de: 20260914170000_el_interruptor_que_de_verdad_corre.sql
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

  -- Los conceptos de ley que rigen para el cierre del periodo, y cada uno suelto.
  v_ley              text[];
  v_con_cesta        boolean;
  v_con_ivss         boolean;
  v_con_rpe          boolean;
  v_con_faov         boolean;
  v_con_recargos     boolean;
  v_con_prestaciones boolean;
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
    LOS CONCEPTOS DE LEY SE ELIGEN UNO POR UNO, Y NINGUNO SE BORRO.

    Decision de la empresa del 14/09/2026: el recibo lleva lo pactado —el sueldo
    de la ficha, los bonos y descuentos cargados a mano, las faltas
    injustificadas— y encima solo los conceptos de ley que esten encendidos:
    cestaticket aparte; seguro social, regimen de empleo y FAOV, cada uno con su
    retencion y su aporte; recargos, y prestaciones. Todo el calculo de ley sigue
    aqui debajo, cada bloque detras de su concepto.

    Se lee por la fecha de cierre del periodo y se guarda en el periodo al final.
    Los aprobados o pagados no se recalculan: ninguno cambia de conceptos por
    debajo. El tope del tercio en los descuentos y la regla del recibo en negativo
    no dependen de ninguno.
  */
  v_ley              := private.conceptos_de_ley(v_p.hasta);
  v_con_cesta        := 'CESTATICKET'  = any(v_ley);
  v_con_ivss         := 'IVSS'         = any(v_ley);
  v_con_rpe          := 'RPE'          = any(v_ley);
  v_con_faov         := 'FAOV'         = any(v_ley);
  v_con_recargos     := 'RECARGOS'     = any(v_ley);
  v_con_prestaciones := 'PRESTACIONES' = any(v_ley);

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

    /*
      CADA PIEZA DEL DESPEJE ENTRA SOLO SI SU CONCEPTO ESTA ENCENDIDO.

      Es la ecuacion de arriba con cero en lo que este apagado:

          b = (objetivo - cesta·[c] + IVSS·[i] + RPE·[r]) / (D · (1 - factor · faov% · [f]))

      Con todo encendido da lo de siempre; con todo apagado, b = objetivo / D, el
      sueldo de la ficha tal cual. Las alicuotas solo hacen falta si alguien usa el
      salario integral —el FAOV o las prestaciones—: sin ellos el factor es 1 y el
      integral queda igual al normal.
    */
    v_cesta_periodo := 0;
    v_ivss_fijo     := 0;
    v_rpe_fijo      := 0;

    if v_con_cesta then
    v_cesta_periodo := round(
      private.parametro('cestaticket_mensual_usd', v_p.hasta) * v_p.tasa_usd
      / private.parametro('dias_mes_nomina', v_p.hasta) * v_dias_pagados, 2);
    end if;

    if v_con_ivss then
    v_ivss_fijo := round(
      v_sm * private.parametro('ivss_tope_salarios_minimos', v_p.hasta)
      * private.parametro('ivss_trabajador', v_p.hasta) / 100
      * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);
    end if;

    if v_con_rpe then
    v_rpe_fijo := round(
      greatest(v_sm * private.parametro('rpe_tope_salarios_minimos', v_p.hasta),
               v_sm * private.parametro('rpe_piso_salarios_minimos', v_p.hasta))
      * private.parametro('rpe_trabajador', v_p.hasta) / 100
      * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);
    end if;

    if v_con_faov or v_con_prestaciones then
    v_dias_bv   := private.dias_bono_vacacional(v_emp.id, v_p.hasta);
    v_dias_util := coalesce(v_emp.dias_utilidades,
                            private.parametro('utilidades_dias_minimo', v_p.hasta));

    v_factor_integral := 1
      + v_dias_bv   / private.parametro('dias_base_alicuotas', v_p.hasta)
      + v_dias_util / private.parametro('dias_base_alicuotas', v_p.hasta);
    else
      v_dias_bv         := 0;
      v_dias_util       := 0;
      v_factor_integral := 1;
    end if;

    v_basico_diario := (v_objetivo - v_cesta_periodo + v_ivss_fijo + v_rpe_fijo)
      / (v_dias_pagados
         * (1 - case when v_con_faov
                     then v_factor_integral * private.parametro('faov_trabajador', v_p.hasta) / 100
                     else 0 end));

    -- Solo el cestaticket puede comerse el sueldo: lo demas que entra lo sube.
    if v_con_cesta and v_basico_diario <= 0 then
      raise exception 'El sueldo de % no alcanza a cubrir el beneficio de alimentacion del periodo.',
        v_emp.nombres || ' ' || v_emp.apellidos
        using errcode = '22023',
              hint = 'El sueldo de la ficha es lo que la persona recibe, y de ahi sale el cestaticket. Subelo o revisa la ficha.';
    end if;

    /* La suposicion de la que cuelga la ecuacion, comprobada en cada recibo en que
       cuenta: con el seguro social o el regimen de empleo encendidos, y contra el
       tope de los que lo esten. */
    if (v_con_ivss or v_con_rpe)
       and v_basico_diario * private.parametro('dias_mes_nomina', v_p.hasta)
         < v_sm * greatest(
             case when v_con_ivss then private.parametro('ivss_tope_salarios_minimos', v_p.hasta) else 0 end,
             case when v_con_rpe  then private.parametro('rpe_tope_salarios_minimos', v_p.hasta) else 0 end) then
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

    if v_con_recargos then
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

    if v_con_cesta then
    /* La misma cifra que entro en el despeje del basico. Se calcula una vez
       arriba y se reusa aqui: si se recalculara, las dos cuentas podrian
       separarse y el neto dejaria de aterrizar donde debe. */
    v_monto := v_cesta_periodo;

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'CESTA', 'Beneficio de alimentación', v_dias_pagados,
            null, v_monto, 'ASIGNACION', 70);
    end if;

    if v_con_ivss then
    v_base := least(v_normal_mensual,
                    v_sm * private.parametro('ivss_tope_salarios_minimos', v_p.hasta));
    v_monto := round(v_base * private.parametro('ivss_trabajador', v_p.hasta) / 100
                     * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'DED-IVSS', 'Seguro social obligatorio', null, v_base,
            v_monto, 'DEDUCCION', 110);
    end if;

    if v_con_rpe then
    v_base := greatest(
      least(v_normal_mensual, v_sm * private.parametro('rpe_tope_salarios_minimos', v_p.hasta)),
      v_sm * private.parametro('rpe_piso_salarios_minimos', v_p.hasta));
    v_monto := round(v_base * private.parametro('rpe_trabajador', v_p.hasta) / 100
                     * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'DED-RPE', 'Régimen prestacional de empleo', null, v_base,
            v_monto, 'DEDUCCION', 115);
    end if;

    if v_con_faov then
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

    if v_con_ivss then
    v_base := least(v_normal_mensual,
                    v_sm * private.parametro('ivss_tope_salarios_minimos', v_p.hasta));
    v_monto := round(v_base * private.parametro('ivss_patronal', v_p.hasta) / 100
                     * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'APO-IVSS', 'Aporte patronal al seguro social', null,
            v_base, v_monto, 'APORTE', 210);
    end if;

    if v_con_rpe then
    v_base := greatest(
      least(v_normal_mensual, v_sm * private.parametro('rpe_tope_salarios_minimos', v_p.hasta)),
      v_sm * private.parametro('rpe_piso_salarios_minimos', v_p.hasta));
    v_monto := round(v_base * private.parametro('rpe_patronal', v_p.hasta) / 100
                     * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'APO-RPE', 'Aporte patronal al régimen de empleo', null,
            v_base, v_monto, 'APORTE', 215);
    end if;

    if v_con_faov then
    v_monto := round(v_integral_mensual * private.parametro('faov_patronal', v_p.hasta) / 100
                     * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);

    insert into public.nomina_recibo_lineas
      (recibo_id, concepto, descripcion, cantidad, base, monto, tipo, orden)
    values (v_recibo_id, 'APO-FAOV', 'Aporte patronal al FAOV', null,
            v_integral_mensual, v_monto, 'APORTE', 220);
    end if;

    if v_con_prestaciones then
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
     set estado = 'CALCULADA', calculada_en = now(), conceptos_de_ley = v_ley
   where id = p_periodo_id;

  return v_recibos;
end;
$function$;
