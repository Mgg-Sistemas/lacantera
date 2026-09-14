/*
  LOS CONCEPTOS DE LEY SE ELIGEN UNO POR UNO.

  Christopher preguntó si encender el interruptor traía todas las normas a la vez, y si
  podía elegirse. Las traía todas de golpe. Eligió «por concepto, para todos»: un
  interruptor por concepto, que vale para toda la nómina desde una fecha.

  LOS SEIS, Y QUÉ ENCIENDE CADA UNO

    CESTATICKET   el beneficio de alimentación en su propia línea
    IVSS          retención y aporte del seguro social
    RPE           retención y aporte del régimen prestacional de empleo
    FAOV          retención y aporte del FAOV, sobre el salario integral
    RECARGOS      horas extra, bono nocturno, feriados y descansos trabajados
    PRESTACIONES  lo que se aparta en cada recibo, y el módulo de prestaciones

  El salario integral —con las alícuotas de bono vacacional y utilidades— solo se calcula
  si alguien lo usa: el FAOV o las prestaciones. Sin ninguno de los dos, el integral queda
  igual al normal, como con solo lo pactado.

  El sueldo de la ficha sigue siendo lo que la persona recibe: el despeje del básico resta
  y suma solo lo que esté encendido. Con todo encendido da lo mismo que antes del
  interruptor; con todo apagado, lo mismo que solo lo pactado.

  DÓNDE SE GUARDA

  1. En el mismo `regimen_nomina`, que ya tiene su puerta, su vigencia y las negativas de
     las puertas genéricas. Su texto dice qué conceptos se calculan, en su orden y
     separados por coma: «IVSS, FAOV». Apagados todos, SOLO LO PACTADO, que es la fila que
     ya hay y no cambia de valor. Todos encendidos se escribe la lista entera: DE LEY deja
     de admitirse, y ninguna fila lo usa. La tabla solo acepta eso, en ese orden y sin
     repetidos.
  2. Cada quincena guarda la lista con que se calculó (`nomina_periodos.conceptos_de_ley`),
     que sustituye a `solo_lo_pactado`. La vista conserva sus dos columnas de antes,
     derivadas, para los navegadores que siguen con la pantalla anterior abierta, y añade
     las dos listas.
  3. `cambiar_conceptos_de_ley(conceptos, desde)` es la puerta nueva, con las reglas de la
     anterior. `cambiar_regimen_nomina` queda como todo o nada encima de ella, mientras
     haya pantallas viejas abiertas.
  4. `calcular_nomina`, su gemelo `basico_diario_englobado`, `aprobar_nomina`,
     `salario_para_prestaciones` y la reja de prestaciones leen la lista.
*/

-- 1. Los seis conceptos en su orden, la lista que rige en una fecha, y qué texto es válido.
create or replace function private.conceptos_de_ley_todos()
returns text[]
language sql
immutable
set search_path to ''
as $function$
  select array['CESTATICKET', 'IVSS', 'RPE', 'FAOV', 'RECARGOS', 'PRESTACIONES']::text[];
$function$;

create or replace function private.conceptos_de_ley(p_fecha date)
returns text[]
language sql
stable
security definer
set search_path to ''
as $function$
  /*
    Los conceptos de ley que se calculan en una fecha, en su orden. Vacía es solo lo
    pactado. Sin fila son todos, que es lo que había antes del interruptor: así ningún
    periodo anterior cambia de cuentas.

    No usa private.parametro porque ese falla cuando falta la clave, y aquí que falte
    significa algo. El orden y la ausencia de repetidos los garantiza la tabla.
  */
  select coalesce((
    select case x.valor_texto
             when 'SOLO LO PACTADO' then '{}'::text[]
             else string_to_array(x.valor_texto, ', ')
           end
      from public.nomina_parametros x
     where x.clave = 'regimen_nomina'
       and x.vigencia_desde <= p_fecha
       and (x.vigencia_hasta is null or x.vigencia_hasta >= p_fecha)
     order by x.vigencia_desde desc
     limit 1), private.conceptos_de_ley_todos());
$function$;

create or replace function private.regimen_nomina_valido(p_texto text)
returns boolean
language sql
immutable
set search_path to ''
as $function$
  -- SOLO LO PACTADO, o la lista de conceptos en su orden, sin repetidos y sin nada más:
  -- se rearma la lista con lo que se reconoce y tiene que salir el mismo texto.
  select p_texto = 'SOLO LO PACTADO'
      or p_texto = array_to_string(array(
           select u.c
             from unnest(private.conceptos_de_ley_todos()) with ordinality as u(c, i)
            where u.c = any(string_to_array(p_texto, ', '))
            order by u.i), ', ');
$function$;

-- 2. En esa clave la tabla solo admite eso.
alter table public.nomina_parametros drop constraint if exists nomina_parametros_regimen_valido;

alter table public.nomina_parametros
  add constraint nomina_parametros_regimen_valido
  check (clave <> 'regimen_nomina'
         or (unidad = 'TEXTO' and private.regimen_nomina_valido(valor_texto)));

-- Solo la descripción: la vigencia y el valor de la fila que hay no cambian.
update public.nomina_parametros
   set descripcion = 'Conceptos de ley de la nómina: SOLO LO PACTADO o la lista de los que se calculan'
 where clave = 'regimen_nomina';

-- 3. Cada quincena guarda la lista con que se calculó, en vez de solo sí o no.
alter table public.nomina_periodos add column if not exists conceptos_de_ley text[];

comment on column public.nomina_periodos.conceptos_de_ley is
  'Los conceptos de ley con que se calculó por última vez, en su orden; vacía si fue solo lo pactado. La escribe calcular_nomina; nula si nunca se calculó.';

update public.nomina_periodos
   set conceptos_de_ley = case when solo_lo_pactado then '{}'::text[]
                               else private.conceptos_de_ley_todos() end
 where solo_lo_pactado is not null
   and conceptos_de_ley is null;

do $mig$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.nomina_periodos'::regclass
                    and conname = 'nomina_periodos_conceptos_de_ley_validos') then
    alter table public.nomina_periodos
      add constraint nomina_periodos_conceptos_de_ley_validos
      check (conceptos_de_ley <@ private.conceptos_de_ley_todos());
  end if;
end
$mig$;

-- 4. La vista da las dos listas, y conserva las dos columnas de antes, derivadas.
create or replace view public.v_nomina_periodos
with (security_invoker = on)
as
select p.id,
       p.numero,
       p.tipo,
       p.desde,
       p.hasta,
       p.dias,
       p.descripcion,
       p.tasa,
       p.tasa_usd,
       p.estado,
       p.calculada_en,
       p.aprobada_por,
       p.aprobada_en,
       p.pagada_en,
       p.anulada_por,
       p.anulada_en,
       p.motivo_anulacion,
       p.creado_por,
       p.creado_en,
       r.recibos,
       coalesce(r.total_neto, 0::numeric) as total_neto,
       coalesce(r.total_asignado, 0::numeric) as total_asignado,
       coalesce(r.total_deducido, 0::numeric) as total_deducido,
       coalesce(r.total_aportes, 0::numeric) as total_aportes,
       coalesce(r.total_neto, 0::numeric) / p.tasa_usd as total_neto_usd,
       -- Las dos de antes, para las pantallas anteriores que sigan abiertas: ciertas solo
       -- si no hay ningún concepto. Se quitan cuando ya nadie las lea.
       cardinality(coalesce(p.conceptos_de_ley, l.vigentes)) = 0 as solo_lo_pactado,
       cardinality(l.vigentes) = 0 as solo_lo_pactado_vigente,
       -- Con qué conceptos se calculó; si nunca se calculó, los que rigen para su fecha.
       coalesce(p.conceptos_de_ley, l.vigentes) as conceptos_de_ley,
       -- Los que rigen hoy para su fecha: los que usaría un cálculo nuevo.
       l.vigentes as conceptos_de_ley_vigentes
  from public.nomina_periodos p
  left join lateral (
    select count(*) as recibos,
           sum(nomina_recibos.neto) as total_neto,
           sum(nomina_recibos.total_asignaciones) as total_asignado,
           sum(nomina_recibos.total_deducciones) as total_deducido,
           sum(nomina_recibos.total_aportes) as total_aportes
      from public.nomina_recibos
     where nomina_recibos.periodo_id = p.id) r on true
  -- La regla de private.conceptos_de_ley, escrita aquí porque la vista corre con los
  -- permisos de quien la lee, y ese no entra en private.
  cross join lateral (
    select coalesce((
      select case x.valor_texto
               when 'SOLO LO PACTADO' then '{}'::text[]
               else string_to_array(x.valor_texto, ', ')
             end
        from public.nomina_parametros x
       where x.clave = 'regimen_nomina'
         and x.vigencia_desde <= p.hasta
         and (x.vigencia_hasta is null or x.vigencia_hasta >= p.hasta)
       order by x.vigencia_desde desc
       limit 1),
      array['CESTATICKET', 'IVSS', 'RPE', 'FAOV', 'RECARGOS', 'PRESTACIONES']::text[]) as vigentes) l;

-- 5. calcular_nomina: cada bloque de ley detrás de su concepto. Parche sobre el cuerpo
--    vivo, en orden: cada ancla tiene que aparecer exactamente una vez o no se toca nada.
do $mig$
declare
  v_def text;
  r     record;
begin
  select pg_get_functiondef('public.calcular_nomina(bigint)'::regprocedure) into v_def;

  for r in
    select * from (values
      (1,
       $t$  v_frecuencias   text;
  v_pactado       boolean;
begin
$t$,
       $t$  v_frecuencias   text;

  -- Los conceptos de ley que rigen para el cierre del periodo, y cada uno suelto.
  v_ley              text[];
  v_con_cesta        boolean;
  v_con_ivss         boolean;
  v_con_rpe          boolean;
  v_con_faov         boolean;
  v_con_recargos     boolean;
  v_con_prestaciones boolean;
begin
$t$),
      (2,
       $t$  /*
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
$t$,
       $t$  /*
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
$t$),
      (3,
       $t$    if v_pactado then
      -- El sueldo de la ficha, tal cual, por los dias pagados. No hay nada de ley
      -- que sacarle, asi que no hay nada que despejar.
      v_basico_diario   := v_objetivo / v_dias_pagados;
      v_cesta_periodo   := 0;
      v_dias_bv         := 0;
      v_dias_util       := 0;
      v_factor_integral := 1;
    else
    v_cesta_periodo := round(
$t$,
       $t$    /*
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
$t$),
      (4,
       $t$      / private.parametro('dias_mes_nomina', v_p.hasta) * v_dias_pagados, 2);

    v_ivss_fijo := round(
$t$,
       $t$      / private.parametro('dias_mes_nomina', v_p.hasta) * v_dias_pagados, 2);
    end if;

    if v_con_ivss then
    v_ivss_fijo := round(
$t$),
      (5,
       $t$      * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);

    v_rpe_fijo := round(
$t$,
       $t$      * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);
    end if;

    if v_con_rpe then
    v_rpe_fijo := round(
$t$),
      (6,
       $t$      * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);

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
$t$,
       $t$      * v_dias_pagados / private.parametro('dias_mes_nomina', v_p.hasta), 2);
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
$t$),
      (7,
       $t$    /* La suposicion de la que cuelga la ecuacion, comprobada en cada recibo. */
    if v_basico_diario * private.parametro('dias_mes_nomina', v_p.hasta)
       < v_sm * greatest(private.parametro('ivss_tope_salarios_minimos', v_p.hasta),
                         private.parametro('rpe_tope_salarios_minimos', v_p.hasta)) then
$t$,
       $t$    /* La suposicion de la que cuelga la ecuacion, comprobada en cada recibo en que
       cuenta: con el seguro social o el regimen de empleo encendidos, y contra el
       tope de los que lo esten. */
    if (v_con_ivss or v_con_rpe)
       and v_basico_diario * private.parametro('dias_mes_nomina', v_p.hasta)
         < v_sm * greatest(
             case when v_con_ivss then private.parametro('ivss_tope_salarios_minimos', v_p.hasta) else 0 end,
             case when v_con_rpe  then private.parametro('rpe_tope_salarios_minimos', v_p.hasta) else 0 end) then
$t$),
      (8,
       $t$              hint = 'Subio el salario minimo respecto de los sueldos. Hay que rehacer el despeje en calcular_nomina.';
    end if;

    end if;

    v_valor_hora := v_basico_diario / v_horas_jornada;
$t$,
       $t$              hint = 'Subio el salario minimo respecto de los sueldos. Hay que rehacer el despeje en calcular_nomina.';
    end if;

    v_valor_hora := v_basico_diario / v_horas_jornada;
$t$),
      (9,
       $t$    if not v_pactado then
    if coalesce(v_nov.horas_extra_diurnas, 0) > 0 then
$t$,
       $t$    if v_con_recargos then
    if coalesce(v_nov.horas_extra_diurnas, 0) > 0 then
$t$),
      (10,
       $t$    if not v_pactado then
    /* La misma cifra que entro en el despeje del basico. Se calcula una vez
$t$,
       $t$    if v_con_cesta then
    /* La misma cifra que entro en el despeje del basico. Se calcula una vez
$t$),
      (11,
       $t$            null, v_monto, 'ASIGNACION', 70);

    v_base := least(v_normal_mensual,
$t$,
       $t$            null, v_monto, 'ASIGNACION', 70);
    end if;

    if v_con_ivss then
    v_base := least(v_normal_mensual,
$t$),
      (12,
       $t$            v_monto, 'DEDUCCION', 110);

    v_base := greatest(
$t$,
       $t$            v_monto, 'DEDUCCION', 110);
    end if;

    if v_con_rpe then
    v_base := greatest(
$t$),
      (13,
       $t$            v_monto, 'DEDUCCION', 115);

    v_monto := round(v_integral_mensual * private.parametro('faov_trabajador', v_p.hasta) / 100
$t$,
       $t$            v_monto, 'DEDUCCION', 115);
    end if;

    if v_con_faov then
    v_monto := round(v_integral_mensual * private.parametro('faov_trabajador', v_p.hasta) / 100
$t$),
      (14,
       $t$    if not v_pactado then

    v_base := least(v_normal_mensual,
$t$,
       $t$    if v_con_ivss then
    v_base := least(v_normal_mensual,
$t$),
      (15,
       $t$            v_base, v_monto, 'APORTE', 210);

    v_base := greatest(
$t$,
       $t$            v_base, v_monto, 'APORTE', 210);
    end if;

    if v_con_rpe then
    v_base := greatest(
$t$),
      (16,
       $t$            v_base, v_monto, 'APORTE', 215);

    v_monto := round(v_integral_mensual * private.parametro('faov_patronal', v_p.hasta) / 100
$t$,
       $t$            v_base, v_monto, 'APORTE', 215);
    end if;

    if v_con_faov then
    v_monto := round(v_integral_mensual * private.parametro('faov_patronal', v_p.hasta) / 100
$t$),
      (17,
       $t$            v_integral_mensual, v_monto, 'APORTE', 220);

    v_monto := round(v_integral_diario
$t$,
       $t$            v_integral_mensual, v_monto, 'APORTE', 220);
    end if;

    if v_con_prestaciones then
    v_monto := round(v_integral_diario
$t$),
      (18,
       $t$     set estado = 'CALCULADA', calculada_en = now(), solo_lo_pactado = v_pactado
$t$,
       $t$     set estado = 'CALCULADA', calculada_en = now(), conceptos_de_ley = v_ley
$t$)
    ) as t(orden, ancla, nuevo)
    order by orden
  loop
    if (length(v_def) - length(replace(v_def, r.ancla, ''))) / length(r.ancla) <> 1 then
      raise exception 'El ancla % de calcular_nomina no aparece exactamente una vez.', r.orden
        using errcode = '22023';
    end if;

    v_def := replace(v_def, r.ancla, r.nuevo);
  end loop;

  if position('v_pactado' in v_def) > 0 then
    raise exception 'A calcular_nomina le quedó algún v_pactado.' using errcode = '22023';
  end if;

  execute v_def;
end
$mig$;

-- 6. Las demás que leían solo sí o no leen la lista. El mismo parche, función por función.
do $mig$
declare
  v_def  text;
  v_func text;
  r      record;
begin
  for r in
    select * from (values
      (1, 'public', 'aprobar_nomina',
       $t$  /*
    EL REGIMEN CON QUE SE CALCULO TIENE QUE SER EL QUE RIGE.

    Si el interruptor de los conceptos de ley se movio despues del calculo, los
    recibos estan hechos con reglas que ya no rigen para esta quincena. Aprobarlos
    seria pagar lo que el sistema ya no calcularia.
  */
  if v_p.solo_lo_pactado is distinct from private.nomina_solo_lo_pactado(v_p.hasta) then
    raise exception 'El régimen de la nómina cambió después de calcular la %: vuelve a calcularla antes de aprobarla.',
$t$,
       $t$  /*
    LOS CONCEPTOS CON QUE SE CALCULO TIENEN QUE SER LOS QUE RIGEN.

    Si algun interruptor de los conceptos de ley se movio despues del calculo, los
    recibos estan hechos con reglas que ya no rigen para esta quincena. Aprobarlos
    seria pagar lo que el sistema ya no calcularia.
  */
  if v_p.conceptos_de_ley is distinct from private.conceptos_de_ley(v_p.hasta) then
    raise exception 'Los conceptos de ley cambiaron después de calcular la %: vuelve a calcularla antes de aprobarla.',
$t$),
      (2, 'private', 'salario_para_prestaciones',
       $t$     -- Un recibo de solo lo pactado no trae salario de ley: sin el, se estima
     -- desde la ficha como si no hubiera recibo.
     and not coalesce(p.solo_lo_pactado, false)
$t$,
       $t$     -- Solo trae salario de ley un recibo calculado con el salario integral, que
     -- es cuando el FAOV o las prestaciones estaban encendidos. Sin el, se estima
     -- desde la ficha como si no hubiera recibo. Sin lista es de antes del
     -- interruptor, y se calculo con todo.
     and coalesce(p.conceptos_de_ley && array['FAOV', 'PRESTACIONES']::text[], true)
$t$),
      (3, 'private', 'basico_diario_englobado',
       $t$  v_basico       numeric;
begin
$t$,
       $t$  v_basico       numeric;
  v_ley          text[];
begin
$t$),
      (4, 'private', 'basico_diario_englobado',
       $t$  v_obj   := round(v_obj_diario * v_tasa_salario * p_dias, 2);
  v_cesta := round(private.parametro('cestaticket_mensual_usd', p_fecha) * p_tasa_usd
                   / v_dias_mes * p_dias, 2);
  v_ivss  := round(v_sm * private.parametro('ivss_tope_salarios_minimos', p_fecha)
                   * private.parametro('ivss_trabajador', p_fecha) / 100
                   * p_dias / v_dias_mes, 2);
  v_rpe   := round(greatest(v_sm * private.parametro('rpe_tope_salarios_minimos', p_fecha),
                            v_sm * private.parametro('rpe_piso_salarios_minimos', p_fecha))
                   * private.parametro('rpe_trabajador', p_fecha) / 100
                   * p_dias / v_dias_mes, 2);
$t$,
       $t$  -- Como en calcular_nomina: cada pieza entra solo si su concepto esta encendido.
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
$t$),
      (5, 'private', 'basico_diario_englobado',
       $t$  v_basico := (v_obj - v_cesta + v_ivss + v_rpe)
    / (p_dias * (1 - v_factor * private.parametro('faov_trabajador', p_fecha) / 100));

  if v_basico <= 0 then
$t$,
       $t$  v_basico := (v_obj - v_cesta + v_ivss + v_rpe)
    / (p_dias * (1 - case when 'FAOV' = any(v_ley)
                          then v_factor * private.parametro('faov_trabajador', p_fecha) / 100
                          else 0 end));

  if 'CESTATICKET' = any(v_ley) and v_basico <= 0 then
$t$),
      (6, 'private', 'basico_diario_englobado',
       $t$  if v_basico * v_dias_mes
     < v_sm * greatest(private.parametro('ivss_tope_salarios_minimos', p_fecha),
                       private.parametro('rpe_tope_salarios_minimos', p_fecha)) then
$t$,
       $t$  if v_ley && array['IVSS', 'RPE']::text[]
     and v_basico * v_dias_mes
       < v_sm * greatest(
           case when 'IVSS' = any(v_ley) then private.parametro('ivss_tope_salarios_minimos', p_fecha) else 0 end,
           case when 'RPE' = any(v_ley) then private.parametro('rpe_tope_salarios_minimos', p_fecha) else 0 end) then
$t$),
      (7, 'public', 'calcular_intereses_prestaciones',
       $t$  -- Con la nomina en solo lo pactado, las prestaciones estan deshabilitadas.
$t$,
       $t$  -- Con las prestaciones apagadas en los conceptos de ley, esto no corre.
$t$),
      (8, 'public', 'calcular_liquidacion',
       $t$  -- Con la nomina en solo lo pactado, las prestaciones estan deshabilitadas.
$t$,
       $t$  -- Con las prestaciones apagadas en los conceptos de ley, esto no corre.
$t$),
      (9, 'public', 'calcular_trimestre_prestaciones',
       $t$  -- Con la nomina en solo lo pactado, las prestaciones estan deshabilitadas.
$t$,
       $t$  -- Con las prestaciones apagadas en los conceptos de ley, esto no corre.
$t$),
      (10, 'public', 'registrar_anticipo_prestaciones',
       $t$  -- Con la nomina en solo lo pactado, las prestaciones estan deshabilitadas.
$t$,
       $t$  -- Con las prestaciones apagadas en los conceptos de ley, esto no corre.
$t$)
    ) as t(orden, esquema, funcion, ancla, nuevo)
    order by orden
  loop
    if v_func is distinct from r.esquema || '.' || r.funcion then
      if v_def is not null then
        execute v_def;
      end if;

      v_func := r.esquema || '.' || r.funcion;

      -- `strict`: si no existe, o hay dos con ese nombre, se para aquí.
      select pg_get_functiondef(p.oid) into strict v_def
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = r.esquema and p.proname = r.funcion;
    end if;

    if (length(v_def) - length(replace(v_def, r.ancla, ''))) / length(r.ancla) <> 1 then
      raise exception 'El ancla % de % no aparece exactamente una vez.', r.orden, v_func
        using errcode = '22023';
    end if;

    v_def := replace(v_def, r.ancla, r.nuevo);
  end loop;

  execute v_def;
end
$mig$;

-- 7. La reja de prestaciones mira su concepto.
create or replace function private.exigir_prestaciones_habilitadas(p_fecha date)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if 'PRESTACIONES' = any(private.conceptos_de_ley(p_fecha)) then
    return;
  end if;

  raise exception 'Las prestaciones sociales están deshabilitadas: el % están apagadas en los conceptos de ley.',
    to_char(p_fecha, 'DD/MM/YYYY')
    using errcode = '55000',
          hint = 'Se vuelven a habilitar encendiendo Prestaciones sociales en los conceptos de ley, en Nómina › Parámetros de nómina.';
end;
$function$;

-- 8. La puerta nueva.
create or replace function public.cambiar_conceptos_de_ley(p_conceptos text[], p_desde date)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_todos   text[] := private.conceptos_de_ley_todos();
  v_pedidos text[];
  v_raros   text;
  v_texto   text;
  v_ultimo  record;
  v_futuro  date;
  v_id      bigint;
begin
  /*
    LOS INTERRUPTORES DE LOS CONCEPTOS DE LEY.

    Lo decide quien aprueba la nomina, porque es la misma decision vista antes:
    RRHH carga las cifras de ley, pero cuales usa la nomina, no. Llega la lista
    entera de los que quedan encendidos y no un interruptor suelto: asi lo que se
    guarda es exactamente lo que se vio en la pantalla al pulsar.
  */
  perform private.exigir_rol('GERENTE_GENERAL');

  if p_conceptos is null or p_desde is null then
    raise exception 'Hay que decir qué conceptos de ley calcula la nómina y desde qué día.'
      using errcode = '22023';
  end if;

  select string_agg(distinct c, ', ') into v_raros
    from unnest(p_conceptos) as c
   where c is not null and not (c = any(v_todos));

  if v_raros is not null then
    raise exception 'No existe el concepto de ley «%». Los que hay: %.',
      v_raros, array_to_string(v_todos, ', ')
      using errcode = '22023';
  end if;

  -- En su orden y sin repetidos: dos listas iguales se escriben igual.
  v_pedidos := array(
    select u.c
      from unnest(v_todos) with ordinality as u(c, i)
     where u.c = any(p_conceptos)
     order by u.i);

  if v_pedidos = private.conceptos_de_ley(p_desde) then
    raise exception 'El % la nómina ya calcula exactamente esos conceptos de ley: no hay nada que cambiar.',
      to_char(p_desde, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  -- No se cambia por debajo de lo aprobado: esos recibos se hicieron con los
  -- conceptos de antes y no se van a rehacer.
  select numero, hasta into v_ultimo
    from public.nomina_periodos
   where estado in ('APROBADA', 'PAGADA')
   order by hasta desc
   limit 1;

  if v_ultimo.hasta is not null and p_desde <= v_ultimo.hasta then
    raise exception 'No puede regir desde el %: la nómina % cierra el % y ya está aprobada. Elige un día posterior.',
      to_char(p_desde, 'DD/MM/YYYY'), v_ultimo.numero, to_char(v_ultimo.hasta, 'DD/MM/YYYY')
      using errcode = '55000';
  end if;

  -- Un cambio por delante de otro ya programado lo dejaria a medias.
  select min(vigencia_desde) into v_futuro
    from public.nomina_parametros
   where clave = 'regimen_nomina' and vigencia_desde > p_desde;

  if v_futuro is not null then
    raise exception 'Ya hay un cambio de los conceptos de ley programado para el %. Uno anterior a ese lo dejaría a medias.',
      to_char(v_futuro, 'DD/MM/YYYY')
      using errcode = '55000';
  end if;

  v_texto := case when cardinality(v_pedidos) = 0 then 'SOLO LO PACTADO'
                  else array_to_string(v_pedidos, ', ') end;

  update public.nomina_parametros
     set vigencia_hasta = p_desde - 1
   where clave = 'regimen_nomina'
     and vigencia_desde < p_desde
     and (vigencia_hasta is null or vigencia_hasta >= p_desde);

  insert into public.nomina_parametros
    (clave, unidad, valor, valor_texto, vigencia_desde, descripcion, fuente, registrado_por)
  values
    ('regimen_nomina', 'TEXTO', null, v_texto, p_desde,
     'Conceptos de ley de la nómina: SOLO LO PACTADO o la lista de los que se calculan',
     'Interruptores de los conceptos de ley',
     (select auth.uid()))
  on conflict (clave, vigencia_desde) do update set
    valor_texto    = excluded.valor_texto,
    vigencia_hasta = null,
    descripcion    = excluded.descripcion,
    fuente         = excluded.fuente,
    registrado_por = excluded.registrado_por,
    registrado_en  = now()
  returning id into v_id;

  return v_id;
end;
$function$;

comment on function public.cambiar_conceptos_de_ley(text[], date) is
  'Los interruptores de los conceptos de ley: pone desde un día la lista de los que calcula la nómina (CESTATICKET, IVSS, RPE, FAOV, RECARGOS, PRESTACIONES; vacía es solo lo pactado). Solo GERENTE_GENERAL o ADMIN; no por debajo de una nómina aprobada ni por delante de un cambio programado.';

revoke all on function public.cambiar_conceptos_de_ley(text[], date) from public;
revoke all on function public.cambiar_conceptos_de_ley(text[], date) from anon;
grant execute on function public.cambiar_conceptos_de_ley(text[], date) to authenticated;

-- 9. La puerta de antes, todo o nada encima de la nueva.
create or replace function public.cambiar_regimen_nomina(p_solo_lo_pactado boolean, p_desde date)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
begin
  /*
    LA PUERTA DE LA PANTALLA ANTERIOR, QUE ERA TODO O NADA.

    Queda mientras haya navegadores con la version de antes abierta: desde el
    14/09/2026 cada quien elige cuando actualizar. Apagar es no dejar ningun
    concepto y encender es ponerlos todos, por la puerta nueva, que es la que
    comprueba quien y desde cuando. Se retira cuando ya nadie la llame.
  */
  if p_solo_lo_pactado is null then
    raise exception 'Hay que decir si la nómina lleva los conceptos de ley y desde qué día.'
      using errcode = '22023';
  end if;

  return public.cambiar_conceptos_de_ley(
    case when p_solo_lo_pactado then '{}'::text[] else private.conceptos_de_ley_todos() end,
    p_desde);
end;
$function$;

comment on function public.cambiar_regimen_nomina(boolean, date) is
  'La puerta de la pantalla anterior: todos los conceptos de ley o ninguno, por cambiar_conceptos_de_ley. Se retira cuando ninguna pantalla la llame.';

-- 10. Lo que ya nadie lee.
drop function if exists private.nomina_solo_lo_pactado(date);

alter table public.nomina_periodos drop column if exists solo_lo_pactado;

-- 11. Comprobado al aplicar.
do $ver$
declare
  v_def text;
  r     record;
begin
  if exists (select 1 from public.nomina_periodos
              where calculada_en is not null and conceptos_de_ley is null) then
    raise exception 'Hay quincenas calculadas sin su lista de conceptos.' using errcode = '22023';
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'nomina_periodos'
                and column_name = 'solo_lo_pactado') then
    raise exception 'La tabla de periodos sigue con solo_lo_pactado.' using errcode = '22023';
  end if;

  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'v_nomina_periodos'
         and column_name in ('solo_lo_pactado', 'solo_lo_pactado_vigente',
                             'conceptos_de_ley', 'conceptos_de_ley_vigentes')) <> 4 then
    raise exception 'A la vista le falta alguna de sus cuatro columnas de los conceptos.' using errcode = '22023';
  end if;

  if not exists (select 1 from pg_class
                  where oid = 'public.v_nomina_periodos'::regclass
                    and array_to_string(reloptions, ',') like '%security_invoker%') then
    raise exception 'La vista de periodos perdió security_invoker.' using errcode = '22023';
  end if;

  -- La fila que ya había no cambió de significado.
  if private.conceptos_de_ley(date '2026-09-15') <> '{}'::text[] then
    raise exception 'La quincena del 15/09/2026 dejó de ser solo lo pactado.' using errcode = '22023';
  end if;

  for r in
    select * from (values ('DE LEY'), ('IVSS, CESTATICKET'), ('IVSS, IVSS'), ('IVSS,FAOV'), ('PACTADO'))
      as t(texto)
  loop
    begin
      insert into public.nomina_parametros (clave, unidad, valor_texto, vigencia_desde, descripcion)
      values ('regimen_nomina', 'TEXTO', r.texto, date '2099-01-01', 'prueba que tiene que rebotar');
      raise exception 'La tabla aceptó «%» como conceptos de ley.', r.texto using errcode = 'P0001';
    exception when check_violation then
      null;
    end;
  end loop;

  for r in
    select * from (values
      ('public', 'calcular_nomina', 'conceptos_de_ley = v_ley'),
      ('public', 'aprobar_nomina', 'private.conceptos_de_ley(v_p.hasta)'),
      ('private', 'salario_para_prestaciones', 'array[''FAOV'', ''PRESTACIONES'']'),
      ('private', 'basico_diario_englobado', '''FAOV'' = any(v_ley)'),
      ('private', 'exigir_prestaciones_habilitadas', '''PRESTACIONES'' = any'),
      ('public', 'cambiar_regimen_nomina', 'public.cambiar_conceptos_de_ley(')
    ) as t(esquema, funcion, marca)
  loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = r.esquema and p.proname = r.funcion;
    if position(r.marca in v_def) = 0 then
      raise exception '%.% no quedó con su cambio.', r.esquema, r.funcion using errcode = '22023';
    end if;
  end loop;

  -- Literal y no con like: el guion bajo es comodín allí.
  select string_agg(n.nspname || '.' || p.proname, ', ') into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and (strpos(p.prosrc, 'nomina_solo_lo_pactado') > 0
          or strpos(p.prosrc, 'p.solo_lo_pactado') > 0
          or strpos(p.prosrc, 'v_pactado') > 0);

  if v_def is not null then
    raise exception 'Siguen leyendo el régimen de sí o no: %.', v_def using errcode = '22023';
  end if;

  if to_regprocedure('private.nomina_solo_lo_pactado(date)') is not null then
    raise exception 'private.nomina_solo_lo_pactado sigue existiendo.' using errcode = '22023';
  end if;

  if pg_catalog.has_function_privilege('anon', 'public.cambiar_conceptos_de_ley(text[], date)'::regprocedure, 'EXECUTE') then
    raise exception 'Los conceptos de ley los puede cambiar alguien sin sesión.' using errcode = '22023';
  end if;
end
$ver$;
