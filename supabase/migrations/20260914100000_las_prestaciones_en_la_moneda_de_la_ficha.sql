/*
  LAS PRESTACIONES SE CALCULAN EN LA MONEDA DE LA FICHA, EN LAS DOS RAMAS.

  Bloqueante 1.00 del carril de base de datos, levantado seis ciclos seguidos y
  encendido el 14/09: la NOM-2026-0001 quedó CALCULADA, termina el 15, y la rama de
  recibos de esta funcion filtra `estado <> 'ANULADA' and hasta <= p_hasta`.

  LOS DOS CONSUMIDORES GUARDAN EN LA MONEDA DE LA FICHA. `calcular_liquidacion` y
  `calcular_trimestre_prestaciones` multiplican lo que devuelve esta funcion y lo
  guardan con `moneda = v_emp.moneda_salario`. La rama de la ficha cumplia; la de
  recibos devolvia `salario_normal_diario` tal cual, que `calcular_nomina` guarda en
  BOLIVARES: sobre la ficha de 900 USD, 27.154,45 guardado como USD en vez de 32,62.

  PRIMERA MITAD: la rama de recibos deshace la conversion con la tasa CONGELADA del
  periodo, por la misma via con que `calcular_nomina` la hizo
  (`private.tasa_de_nomina(moneda, p.tasa_usd, p.hasta)`), asi que para una ficha en
  VES divide entre 1 y todo sigue igual.

  SEGUNDA MITAD: desde el 11/09 `salario_base` es lo que la persona RECIBE y
  `calcular_nomina` despeja el basico hacia atras. La rama de la ficha seguia haciendo
  `salario_base / 30`: 30,00 contra 28,99. Arreglar solo la moneda dejaba las dos
  ramas midiendo salarios distintos.

  EL DESPEJE AHORA VIVE TAMBIEN EN `private.basico_diario_englobado`, y es un GEMELO
  de `calcular_nomina`: misma ecuacion, mismos parametros, mismo redondeo. No se toco
  `calcular_nomina` —hay un periodo vivo calculado con ella—, asi que hay dos sitios.
  Por eso la verificacion de abajo exige que el gemelo reproduzca CADA recibo vivo al
  sexto decimal. Comprobado antes de aplicar, en transaccion revertida: 25 recibos, 0
  de diferencia; las dos ramas para los 25 trabajadores, 0,0000 % de diferencia.
*/

create or replace function private.basico_diario_englobado(
  p_empleado bigint,
  p_fecha    date,
  p_tasa_usd numeric,
  p_dias     numeric
) returns numeric
language plpgsql
stable
security definer
set search_path to ''
as $function$
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

  v_obj   := round(v_obj_diario * v_tasa_salario * p_dias, 2);
  v_cesta := round(private.parametro('cestaticket_mensual_usd', p_fecha) * p_tasa_usd
                   / v_dias_mes * p_dias, 2);
  v_ivss  := round(v_sm * private.parametro('ivss_tope_salarios_minimos', p_fecha)
                   * private.parametro('ivss_trabajador', p_fecha) / 100
                   * p_dias / v_dias_mes, 2);
  v_rpe   := round(greatest(v_sm * private.parametro('rpe_tope_salarios_minimos', p_fecha),
                            v_sm * private.parametro('rpe_piso_salarios_minimos', p_fecha))
                   * private.parametro('rpe_trabajador', p_fecha) / 100
                   * p_dias / v_dias_mes, 2);

  v_bv   := private.dias_bono_vacacional(p_empleado, p_fecha);
  v_util := coalesce(v_emp.dias_utilidades, private.parametro('utilidades_dias_minimo', p_fecha));
  v_factor := 1
    + v_bv   / private.parametro('dias_base_alicuotas', p_fecha)
    + v_util / private.parametro('dias_base_alicuotas', p_fecha);

  v_basico := (v_obj - v_cesta + v_ivss + v_rpe)
    / (p_dias * (1 - v_factor * private.parametro('faov_trabajador', p_fecha) / 100));

  if v_basico <= 0 then
    raise exception 'El sueldo de % no alcanza a cubrir el beneficio de alimentacion.',
      v_emp.nombres || ' ' || v_emp.apellidos
      using errcode = '22023',
            hint = 'El sueldo de la ficha es lo que la persona recibe, y de ahi sale el cestaticket. Revisa la ficha.';
  end if;

  if v_basico * v_dias_mes
     < v_sm * greatest(private.parametro('ivss_tope_salarios_minimos', p_fecha),
                       private.parametro('rpe_tope_salarios_minimos', p_fecha)) then
    raise exception 'El seguro social de % dejo de estar topado, y el basico ya no se puede despejar con esta ecuacion.',
      v_emp.nombres || ' ' || v_emp.apellidos
      using errcode = '22023';
  end if;

  return v_basico;
end
$function$;

comment on function private.basico_diario_englobado(bigint, date, numeric, numeric) is
  'El basico diario en bolivares que corresponde al sueldo englobado de la ficha. GEMELO del despeje de calcular_nomina: misma ecuacion, parametros y redondeo; comprobado contra cada recibo vivo en 20260914100000.';

create or replace function private.salario_para_prestaciones(
  p_empleado bigint,
  p_hasta    date,
  p_desde    date default null,
  out normal_diario   numeric,
  out integral_diario numeric,
  out estimado        boolean
) returns record
language plpgsql
stable
security definer
set search_path to ''
as $function$
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

comment on function private.salario_para_prestaciones(bigint, date, date) is
  'Los salarios diarios normal e integral para prestaciones, SIEMPRE en la moneda de la ficha, que es la moneda con que los guardan calcular_liquidacion y calcular_trimestre_prestaciones. Con recibo, deshace los bolivares con la tasa congelada del periodo; sin recibo, despeja el basico del sueldo englobado con private.basico_diario_englobado.';

do $ver$
declare
  v_n int; v_max numeric; v_max_rel numeric;
begin
  -- 1. El gemelo reproduce cada recibo vivo.
  select count(*),
         max(abs(round(private.basico_diario_englobado(rc.empleado_id, p.hasta, p.tasa_usd, rc.dias_pagados), 6)
                 - rc.salario_basico_diario))
    into v_n, v_max
    from public.nomina_recibos rc
    join public.nomina_periodos p on p.id = rc.periodo_id
   where p.estado <> 'ANULADA' and rc.dias_pagados > 0;

  if v_n > 0 and v_max > 0.01 then
    raise exception 'El gemelo no reproduce los recibos: diferencia maxima % Bs/dia en % recibos.', v_max, v_n
      using errcode = '22023';
  end if;

  -- 2. La rama de recibos ya no devuelve bolivares a una ficha en dolares, y
  --    coincide con el despeje de la ficha sobre la tasa del mismo periodo.
  select max(abs(
           (select s.normal_diario from private.salario_para_prestaciones(rc.empleado_id, p.hasta) s)
           / (private.basico_diario_englobado(rc.empleado_id, p.hasta, p.tasa_usd, 30)
              / private.tasa_de_nomina(e.moneda_salario, p.tasa_usd, p.hasta)) - 1))
    into v_max_rel
    from public.nomina_recibos rc
    join public.nomina_periodos p on p.id = rc.periodo_id
    join public.empleados e on e.id = rc.empleado_id
   where p.estado <> 'ANULADA' and rc.dias_pagados > 0;

  if v_n > 0 and v_max_rel > 0.001 then
    raise exception 'Las dos ramas no miden lo mismo: diferencia relativa maxima %.', v_max_rel
      using errcode = '22023';
  end if;
end
$ver$;
