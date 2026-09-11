/*
  EL SUELDO QUE SE ESCRIBE EN LA FICHA ES LO QUE LA PERSONA RECIBE.

  Christopher, 11/09/2026, después de preguntarlo a la empresa:

    «Cuando dicen que ganan 500 $ es exactamente todo englobado.»
    «El cálculo anterior que daba 267 debe hacerse pero dando 250, lo mismo si
     se ingresa 200 o 300.»
    «Un sueldo aborda todo excepto bonos adicionales (fuera de salario) y
     penalizaciones.»

  Esto cierra el hilo que empezó con «nómina me está haciendo el cálculo mal».
  No lo estaba: 250 de salario + 20 de cestaticket − 2,83 de retenciones daban
  267,17 y la aritmética era correcta. Lo que estaba mal era qué significaba el
  número de la ficha.

  ═══════════════════════════════════════════════════════════════════════════
  LO QUE CAMBIA
  ═══════════════════════════════════════════════════════════════════════════

  `empleados.salario_base` deja de ser el salario básico y pasa a ser el NETO
  del período: lo que la persona recibe. De él salen el cestaticket y las
  retenciones de ley, y el básico es lo que queda.

  O sea que se despeja hacia atrás en vez de sumarse hacia adelante.

  LA ECUACIÓN. Llamando b al básico diario y D a los días pagados:

      b·D  +  cesta  −  IVSS  −  RPE  −  FAOV  =  objetivo

  El cestaticket no depende del sueldo. El IVSS y el RPE tampoco: se calculan
  sobre múltiplos del salario mínimo —congelado en 130 Bs desde 2022— y para
  cualquier sueldo real están topados en 650 y 1.300 Bs, o sea que son
  constantes. El FAOV sí es proporcional: sale del salario integral, que es el
  básico por el factor de las alícuotas. Despejando:

      b = (objetivo − cesta + IVSS + RPE) / (D · (1 − factor · faov%))

  Que el IVSS y el RPE estén topados es una SUPOSICIÓN, y por eso se comprueba
  en cada recibo. Si algún día el salario mínimo sube lo bastante como para que
  dejen de estarlo, la ecuación deja de valer — y la nómina se planta en vez de
  pagar mal en silencio. Ese `raise` es la mitad del valor de este arreglo.

  ═══════════════════════════════════════════════════════════════════════════
  NO HACE FALTA TOCAR NI UN SUELDO
  ═══════════════════════════════════════════════════════════════════════════

  Es lo mejor de este camino. Los 900, 500, 350 y 300 que hay cargados YA
  significaban el paquete en la cabeza de quien los escribió: por eso son cifras
  redondas y por eso nadie reconocía los netos de 267,17 y 193,01. El motor
  pasa a entenderlos como siempre se entendieron. Ni una fila de `empleados` ni
  del tabulador se modifica en esta migración.

  ═══════════════════════════════════════════════════════════════════════════
  LO QUE ESTO CUESTA, Y HAY QUE SABERLO
  ═══════════════════════════════════════════════════════════════════════════

  EL SALARIO BÁSICO DECLARADO BAJA. Con 500 englobados queda en unos 465 al mes.
  Las prestaciones, las vacaciones y las utilidades se calculan sobre el básico,
  así que bajan en la misma proporción — y la provisión de prestaciones que se
  aparta cada quincena, también.

  Es legal: el cestaticket de verdad no es salario (LOTTT 105.2) y es la
  práctica corriente del país. Pero es una decisión de la empresa sobre el
  pasivo laboral, no un efecto secundario de un arreglo técnico, y queda escrita
  aquí para que dentro de un año se sepa quién la tomó y por qué.

  ═══════════════════════════════════════════════════════════════════════════
  LOS BONOS Y LAS PENALIZACIONES SIGUEN POR FUERA
  ═══════════════════════════════════════════════════════════════════════════

  Se cargan por novedad y se suman o restan DESPUÉS, que es justo lo que se
  pidió: el sueldo aterriza en su cifra y lo demás la mueve. Comprobado en
  caliente, con la transacción rodada hacia atrás:

      sin bono ni penalización          con bono de 50 y penalización de 30
      ─────────────────────────         ───────────────────────────────────
      Salario del período   232,64      Salario del período       232,64
      Cestaticket            20,00      Bono de excelencia         50,00
      Seguro social          −0,02      Cestaticket                20,00
      Régimen de empleo      −0,00      Seguro social              −0,02
      Vivienda               −2,62      Régimen de empleo          −0,00
      ─────────────────────────         Vivienda                   −3,18
      NETO                  250,00      Casco perdido             −30,00
                                        ───────────────────────────────────
                                        NETO                      269,44

  El bono sube el FAOV porque legalmente es salario y entra en el integral: por
  eso 269,44 y no 270. Es correcto, y es la clase de detalle que conviene que
  esté escrito antes de que alguien lo reporte como fallo.

  Y los cuatro niveles, sobre el período NOM-2026-0007 completo:

      900 $/mes (1 persona)  → 450,00 $ la quincena
      500 $/mes (6 personas) → 250,00 $
      350 $/mes (12 personas)→ 175,00 $
      300 $/mes (3 personas) → 150,00 $
*/

do $mig$
declare
  v_def   text;
  v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'calcular_nomina';

  -- ---------------------------------------------------------------- 1 de 4
  v_antes := v_def;
  v_def := replace(v_def,
    $t$  v_dias_bv       numeric;
  v_dias_util     numeric;$t$,
    $t$  v_dias_bv       numeric;
  v_dias_util     numeric;

  -- Lo que la persona debe recibir, y las piezas con las que se despeja el
  -- basico a partir de ahi.
  v_objetivo_diario numeric;
  v_objetivo        numeric;
  v_cesta_periodo   numeric;
  v_ivss_fijo       numeric;
  v_rpe_fijo        numeric;
  v_factor_integral numeric;$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 1 (declaraciones) no encontrada.' using errcode = '22023';
  end if;

  -- ---------------------------------------------------------------- 2 de 4
  v_antes := v_def;
  v_def := replace(v_def,
    $t$    v_basico_diario := case v_emp.base_estipulacion
      when 'MENSUAL' then v_emp.salario_base / private.parametro('dias_mes_nomina', v_p.hasta)
      when 'DIARIO'  then v_emp.salario_base
      when 'HORA'    then v_emp.salario_base * v_horas_jornada
    end;

    v_tasa_salario := private.tasa_de_nomina(
      v_emp.moneda_salario, v_p.tasa_usd, v_p.hasta);

    v_basico_diario := v_basico_diario * v_tasa_salario;

    v_valor_hora := v_basico_diario / v_horas_jornada;$t$,
    $t$    /*
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

    v_valor_hora := v_basico_diario / v_horas_jornada;$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 2 (calculo del basico) no encontrada.' using errcode = '22023';
  end if;

  -- ---------------------------------------------------------------- 3 de 4
  v_antes := v_def;
  v_def := replace(v_def,
    $t$    v_dias_bv   := private.dias_bono_vacacional(v_emp.id, v_p.hasta);
    v_dias_util := coalesce(v_emp.dias_utilidades,
                            private.parametro('utilidades_dias_minimo', v_p.hasta));

    v_integral_diario := v_normal_diario$t$,
    $t$    /* v_dias_bv y v_dias_util ya se calcularon arriba: el factor de las
       alicuotas hace falta ANTES, para poder despejar el basico. */
    v_integral_diario := v_normal_diario$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 3 (dias de alicuotas duplicados) no encontrada.' using errcode = '22023';
  end if;

  -- ---------------------------------------------------------------- 4 de 4
  v_antes := v_def;
  v_def := replace(v_def,
    $t$    v_monto := round(
      private.parametro('cestaticket_mensual_usd', v_p.hasta) * v_p.tasa_usd
      / private.parametro('dias_mes_nomina', v_p.hasta) * v_dias_pagados, 2);$t$,
    $t$    /* La misma cifra que entro en el despeje del basico. Se calcula una vez
       arriba y se reusa aqui: si se recalculara, las dos cuentas podrian
       separarse y el neto dejaria de aterrizar donde debe. */
    v_monto := v_cesta_periodo;$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 4 (linea del cestaticket) no encontrada.' using errcode = '22023';
  end if;

  execute v_def;
end
$mig$;

/*
  Y se comprueba contra el cuerpo vivo, no contra este archivo: es la regla 7.
*/
do $ver$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'calcular_nomina';

  if position($t$v_basico_diario := (v_objetivo - v_cesta_periodo$t$ in v_def) = 0 then
    raise exception 'El despeje del basico no quedo en el cuerpo vivo.' using errcode = '22023';
  end if;
  if position($t$v_monto := v_cesta_periodo;$t$ in v_def) = 0 then
    raise exception 'La cesta no quedo reusando la cifra del despeje.' using errcode = '22023';
  end if;
  if position($t$v_basico_diario := v_basico_diario * v_tasa_salario;$t$ in v_def) > 0 then
    raise exception 'El calculo viejo del basico sigue vivo.' using errcode = '22023';
  end if;
end
$ver$;

comment on function public.calcular_nomina(bigint) is
  'Arma los recibos de un período. El sueldo de la ficha es lo que la persona RECIBE: de ahí salen el cestaticket y las retenciones, y el salario básico se despeja hacia atrás. Los bonos y las penalizaciones se cargan por novedad y mueven esa cifra. El tope del tercio (LOTTT 154) se mide sobre la SUMA de lo que se descuenta por novedad y ya no tiene lista blanca. Ningún recibo puede salir con el neto en negativo.';
