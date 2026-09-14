/*
  LA NÓMINA PAGA SOLO LO PACTADO, CON EL CÁLCULO DE LEY DESHABILITADO Y NO BORRADO.

  Decisión de la empresa, el 14/09/2026: el recibo lleva el sueldo de la ficha,
  los bonos y comisiones y los descuentos que se cargan a mano, y resta las faltas
  injustificadas. Nada más. Christopher, al decidir cómo: «deberíamos deshabilitar,
  en vez de eliminar».

  ASÍ QUE ES UN INTERRUPTOR, NO UN BORRADO. `regimen_nomina` en nomina_parametros,
  con vigencia como todos los parámetros: «SOLO LO PACTADO» desde el 01/09/2026. Se
  lee por la fecha de cierre de cada período. El día que haga falta el cálculo
  completo se carga «DE LEY» desde esa fecha en Nómina › Parámetros, y vuelve todo
  sin reescribir nada. Los períodos aprobados o pagados no se recalculan, así que
  ninguno cambia de régimen por debajo; y sin fila el régimen es DE LEY, que es lo
  que había.

  CON EL INTERRUPTOR PUESTO, calcular_nomina:

  - paga el sueldo de la ficha por los días pagados, sin despejar nada: las faltas
    injustificadas ya restan días;
  - suma los bonos y comisiones y resta los descuentos manuales, con el tope del
    tercio y sin dejar el recibo en negativo, como antes;
  - no inserta el cestaticket aparte, ni seguro social, régimen de empleo o FAOV,
    ni aportes del patrono, ni provisión de prestaciones;
  - no calcula recargos de horas extra, nocturnas, feriados ni descansos: lo que
    haya que pagar de eso va como bono.

  Y LAS PRESTACIONES SOCIALES QUEDAN DESHABILITADAS EN LA BASE, no solo en la
  pantalla: liquidar, cerrar trimestre, intereses y anticipos se niegan con un
  mensaje que dice desde cuándo y cómo se vuelven a habilitar.

  La vista de períodos gana `solo_lo_pactado`, para que cada pantalla sepa con qué
  régimen se calculó la quincena que enseña.
*/

-- 1. El interruptor.
insert into public.nomina_parametros
  (clave, unidad, valor, valor_texto, vigencia_desde, descripcion, fuente)
values
  ('regimen_nomina', 'TEXTO', null, 'SOLO LO PACTADO', date '2026-09-01',
   'Qué calcula la nómina. SOLO LO PACTADO: sueldo de la ficha, bonos y descuentos manuales y faltas; sin cestaticket aparte, retenciones de ley, aportes, recargos ni prestaciones. DE LEY: el cálculo completo. Se cambia cargando una fila nueva desde la fecha que corresponda.',
   'Decisión de la empresa, 14/09/2026')
on conflict (clave, vigencia_desde) do nothing;

-- 2. Quién lo lee.
create or replace function private.nomina_solo_lo_pactado(p_fecha date)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  /*
    El regimen que manda en una fecha. Sin fila es DE LEY, que es lo que habia
    antes del interruptor: asi ningun periodo anterior cambia de cuentas.

    No usa private.parametro porque ese falla cuando falta la clave, y aqui que
    falte significa algo.
  */
  select coalesce((
    select x.valor_texto = 'SOLO LO PACTADO'
      from public.nomina_parametros x
     where x.clave = 'regimen_nomina'
       and x.vigencia_desde <= p_fecha
       and (x.vigencia_hasta is null or x.vigencia_hasta >= p_fecha)
     order by x.vigencia_desde desc
     limit 1), false);
$function$;

comment on function private.nomina_solo_lo_pactado(date) is
  'Cierto si en esa fecha la nómina calcula solo lo pactado (regimen_nomina = SOLO LO PACTADO). Sin fila, falso: el régimen es DE LEY.';

create or replace function private.exigir_prestaciones_habilitadas(p_fecha date)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_desde date;
begin
  if not private.nomina_solo_lo_pactado(p_fecha) then
    return;
  end if;

  select max(x.vigencia_desde) into v_desde
    from public.nomina_parametros x
   where x.clave = 'regimen_nomina' and x.vigencia_desde <= p_fecha;

  raise exception 'Las prestaciones sociales están deshabilitadas: la nómina calcula solo lo pactado desde el %.',
    to_char(v_desde, 'DD/MM/YYYY')
    using errcode = '55000',
          hint = 'Se vuelven a habilitar cargando el régimen DE LEY en Nómina › Parámetros, desde la fecha que corresponda.';
end;
$function$;

comment on function private.exigir_prestaciones_habilitadas(date) is
  'Se niega con un mensaje claro si en esa fecha la nómina calcula solo lo pactado. La llaman las cuatro puertas que calculan o adelantan prestaciones.';

-- 3. La vista de períodos dice con qué régimen se calcula cada uno.
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
       -- La misma regla que private.nomina_solo_lo_pactado, escrita aquí porque
       -- la vista corre con los permisos de quien la lee, y ese no ve `private`.
       coalesce((
         select x.valor_texto = 'SOLO LO PACTADO'
           from public.nomina_parametros x
          where x.clave = 'regimen_nomina'
            and x.vigencia_desde <= p.hasta
            and (x.vigencia_hasta is null or x.vigencia_hasta >= p.hasta)
          order by x.vigencia_desde desc
          limit 1), false) as solo_lo_pactado
  from public.nomina_periodos p
  left join lateral (
    select count(*) as recibos,
           sum(nomina_recibos.neto) as total_neto,
           sum(nomina_recibos.total_asignaciones) as total_asignado,
           sum(nomina_recibos.total_deducciones) as total_deducido,
           sum(nomina_recibos.total_aportes) as total_aportes
      from public.nomina_recibos
     where nomina_recibos.periodo_id = p.id) r on true;

-- 4. calcular_nomina: el cálculo de ley queda, apagado por el interruptor.
do $mig$
declare
  v_def   text;
  v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'calcular_nomina';

  -- 4.1 La variable.
  v_antes := v_def;
  v_def := replace(v_def,
    $t$  v_frecuencias   text;
begin$t$,
    $t$  v_frecuencias   text;
  v_pactado       boolean;
begin$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 4.1 (declaraciones) no encontrada.' using errcode = '22023';
  end if;

  -- 4.2 Se lee una vez, por la fecha de cierre del periodo.
  v_antes := v_def;
  v_def := replace(v_def,
    $t$  v_dias_rango := (v_p.hasta - v_p.desde) + 1;
$t$,
    $t$  v_dias_rango := (v_p.hasta - v_p.desde) + 1;

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
$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 4.2 (lectura del regimen) no encontrada.' using errcode = '22023';
  end if;

  -- 4.3 El despeje del basico solo corre de ley.
  v_antes := v_def;
  v_def := replace(v_def,
    $t$    v_cesta_periodo := round(
$t$,
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
$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 4.3a (inicio del despeje) no encontrada.' using errcode = '22023';
  end if;

  v_antes := v_def;
  v_def := replace(v_def,
    $t$
    v_valor_hora := v_basico_diario / v_horas_jornada;
$t$,
    $t$
    end if;

    v_valor_hora := v_basico_diario / v_horas_jornada;
$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 4.3b (fin del despeje) no encontrada.' using errcode = '22023';
  end if;

  -- 4.4 Los recargos.
  v_antes := v_def;
  v_def := replace(v_def,
    $t$    if coalesce(v_nov.horas_extra_diurnas, 0) > 0 then
$t$,
    $t$    if not v_pactado then
    if coalesce(v_nov.horas_extra_diurnas, 0) > 0 then
$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 4.4a (inicio de los recargos) no encontrada.' using errcode = '22023';
  end if;

  v_antes := v_def;
  v_def := replace(v_def,
    $t$              v_nov.dias_descanso_trabajados, v_basico_diario, v_monto, 'ASIGNACION', 50);
    end if;
$t$,
    $t$              v_nov.dias_descanso_trabajados, v_basico_diario, v_monto, 'ASIGNACION', 50);
    end if;
    end if;
$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 4.4b (fin de los recargos) no encontrada.' using errcode = '22023';
  end if;

  -- 4.5 El cestaticket y las retenciones de ley.
  v_antes := v_def;
  v_def := replace(v_def,
    $t$    /* La misma cifra que entro en el despeje del basico.$t$,
    $t$    if not v_pactado then
    /* La misma cifra que entro en el despeje del basico.$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 4.5a (inicio del cestaticket) no encontrada.' using errcode = '22023';
  end if;

  v_antes := v_def;
  v_def := replace(v_def,
    $t$            v_integral_mensual, v_monto, 'DEDUCCION', 120);
$t$,
    $t$            v_integral_mensual, v_monto, 'DEDUCCION', 120);
    end if;
$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 4.5b (fin de las retenciones) no encontrada.' using errcode = '22023';
  end if;

  -- 4.6 Los aportes del patrono y la provision.
  v_antes := v_def;
  v_def := replace(v_def,
    $t$              null, null, v_monto, 'DEDUCCION', v_m.orden);
    end loop;
$t$,
    $t$              null, null, v_monto, 'DEDUCCION', v_m.orden);
    end loop;

    if not v_pactado then
$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 4.6a (inicio de los aportes) no encontrada.' using errcode = '22023';
  end if;

  v_antes := v_def;
  v_def := replace(v_def,
    $t$            v_integral_diario, v_monto, 'PROVISION', 310);
$t$,
    $t$            v_integral_diario, v_monto, 'PROVISION', 310);
    end if;
$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 4.6b (fin de la provision) no encontrada.' using errcode = '22023';
  end if;

  execute v_def;
end
$mig$;

-- 5. Las cuatro puertas de prestaciones se niegan con el interruptor puesto.
do $mig$
declare
  v_def   text;
  v_antes text;
  r       record;
begin
  for r in
    select * from (values
      ('calcular_liquidacion',
       $t$  perform private.exigir_permiso('NOMINA', 'TOTAL');
$t$,
       $t$  perform private.exigir_permiso('NOMINA', 'TOTAL');

  -- Con la nomina en solo lo pactado, las prestaciones estan deshabilitadas.
  perform private.exigir_prestaciones_habilitadas(p_fecha_egreso);
$t$),
      ('registrar_anticipo_prestaciones',
       $t$  perform private.exigir_permiso('NOMINA', 'TOTAL');
$t$,
       $t$  perform private.exigir_permiso('NOMINA', 'TOTAL');

  -- Con la nomina en solo lo pactado, las prestaciones estan deshabilitadas.
  perform private.exigir_prestaciones_habilitadas(v_fecha);
$t$),
      ('calcular_trimestre_prestaciones',
       $t$  v_dias := private.parametro('prestaciones_dias_trimestre', v_hasta);
$t$,
       $t$  -- Con la nomina en solo lo pactado, las prestaciones estan deshabilitadas.
  perform private.exigir_prestaciones_habilitadas(v_hasta);

  v_dias := private.parametro('prestaciones_dias_trimestre', v_hasta);
$t$),
      ('calcular_intereses_prestaciones',
       $t$  v_hasta := (make_date(p_anio, p_mes, 1) + interval '1 month' - interval '1 day')::date;
$t$,
       $t$  v_hasta := (make_date(p_anio, p_mes, 1) + interval '1 month' - interval '1 day')::date;

  -- Con la nomina en solo lo pactado, las prestaciones estan deshabilitadas.
  perform private.exigir_prestaciones_habilitadas(v_hasta);
$t$)
    ) as t(funcion, ancla, nuevo)
  loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = r.funcion;

    if (length(v_def) - length(replace(v_def, r.ancla, ''))) / length(r.ancla) <> 1 then
      raise exception 'ANCLA de % no aparece exactamente una vez.', r.funcion using errcode = '22023';
    end if;

    v_antes := v_def;
    v_def := replace(v_def, r.ancla, r.nuevo);
    if v_def = v_antes then
      raise exception 'ANCLA de % no encontrada.', r.funcion using errcode = '22023';
    end if;

    execute v_def;
  end loop;
end
$mig$;

-- 6. Comprobado al aplicar.
do $ver$
declare
  v_def text;
  v_n   int;
  r     record;
begin
  if not private.nomina_solo_lo_pactado(date '2026-09-15') then
    raise exception 'El interruptor no manda en la quincena del 1 al 15 de septiembre.' using errcode = '22023';
  end if;
  if private.nomina_solo_lo_pactado(date '2026-08-31') then
    raise exception 'El interruptor se colo hacia atras del 01/09/2026.' using errcode = '22023';
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'calcular_nomina';

  if position('v_pactado := private.nomina_solo_lo_pactado(v_p.hasta);' in v_def) = 0 then
    raise exception 'calcular_nomina no lee el regimen.' using errcode = '22023';
  end if;

  v_n := (length(v_def) - length(replace(v_def, 'if not v_pactado then', ''))) / length('if not v_pactado then');
  if v_n <> 3 then
    raise exception 'calcular_nomina tiene % bloques apagables, y tenian que ser 3.', v_n using errcode = '22023';
  end if;

  for r in
    select p.proname, pg_get_functiondef(p.oid) as def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('calcular_liquidacion', 'registrar_anticipo_prestaciones',
                         'calcular_trimestre_prestaciones', 'calcular_intereses_prestaciones')
  loop
    if position('private.exigir_prestaciones_habilitadas(' in r.def) = 0 then
      raise exception '% no se niega con el interruptor puesto.', r.proname using errcode = '22023';
    end if;
  end loop;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'v_nomina_periodos'
                    and column_name = 'solo_lo_pactado') then
    raise exception 'La vista de periodos no dice el regimen.' using errcode = '22023';
  end if;

  if not exists (select 1 from pg_class
                  where oid = 'public.v_nomina_periodos'::regclass
                    and array_to_string(reloptions, ',') like '%security_invoker%') then
    raise exception 'La vista de periodos perdio security_invoker.' using errcode = '22023';
  end if;
end
$ver$;

-- 7. El parámetro se nombra corto: en Nómina › Parámetros la descripción es su
--    título, y la frase larga del primer insert no cabía como nombre.
update public.nomina_parametros
   set descripcion = 'Régimen de la nómina: SOLO LO PACTADO o DE LEY'
 where clave = 'regimen_nomina' and vigencia_desde = date '2026-09-01';
