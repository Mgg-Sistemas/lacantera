/*
  AL DESINCORPORADO SE LE PAGA LO QUE TRABAJÓ.

  A Jesús Antonio Guerra Alvarado lo desincorporaron el 26 de agosto y hay que
  pagarle la quincena. Se propusieron dos caminos: un botón de «reincorporar»
  hasta que cobre, o un apartado de pago por desincorporación.

  Ninguno de los dos hacía falta. **Era un fallo, no una funcionalidad que
  faltara**, y estaba en una sola palabra.

  DÓNDE ESTABA

  El bucle de `calcular_nomina` seleccionaba así:

      where activo
        and fecha_ingreso <= v_p.hasta
        and (fecha_egreso is null or fecha_egreso >= v_p.desde)

  Las dos últimas líneas ya dicen exactamente quién pertenece al período: entró
  antes de que terminara y no se había ido antes de que empezara. Esa condición
  existe para incluir a quien sale a mitad de quincena — no tiene otro
  propósito.

  Pero `egresar_empleado` apaga `activo` a la vez que pone `fecha_egreso`, así
  que `and activo` borraba a esa persona del cálculo el mismo día que se le daba
  de baja. Las dos condiciones se contradecían y ganaba la equivocada.

  SE COMPROBÓ ANTES DE QUITARLO que la columna es redundante y no un segundo
  criterio:

      inactivos sin fecha de egreso .... 0
      activos con fecha de egreso ...... 0

  Las dos dicen lo mismo, y solo una de las dos sabe de fechas.

  Y LOS DÍAS SE PRORRATEAN, o el arreglo cambiaría un error por otro

  Quitar el filtro a secas habría hecho que Jesús cobrara la quincena entera por
  doce días trabajados. Ahora se cuenta el solape entre el rango del período y
  el tiempo que la persona estuvo en nómina, y se aplica esa proporción a los
  días que paga el período.

  Para quien estuvo el período completo el solape es el rango entero y sale
  `v_p.dias` exacto, **así que el caso normal no cambia en nada**. Esa es la
  propiedad que hace seguro el arreglo, y se comprobó ejecutándolo.

  Vale igual para quien ENTRA a mitad de período, que hasta hoy también cobraba
  la quincena completa desde su primer día. Ese lado nadie lo había reportado.

  COMPROBADO CON EL CASO REAL, en una transacción deshecha, sobre el período del
  15 al 31 de agosto:

    ficha 0019  JESUS ANTONIO GUERRA ALVARADO   egreso 26/08
                antes: no salía
                ahora: 10,59 días facturados, egresado_en 26/08, neto $118,81

    los otros 21 trabajadores: 15,00 días y el mismo neto de siempre

  Doce días de diecisiete de rango, por quince que paga la quincena, son 10,59.

  Y `egresado_en` SE CONGELA EN EL RECIBO

  No se lee de la ficha al imprimir. Un recibo es un documento: dice lo que era
  cierto el día que se emitió. Si la persona se reincorpora mañana, el recibo de
  agosto tiene que seguir diciendo que en agosto se fue.
*/

alter table public.nomina_recibos
  add column if not exists egresado_en date;

comment on column public.nomina_recibos.egresado_en is
  'La fecha en que esa persona salio, si salio dentro de este periodo. Se congela al calcular: un recibo dice lo que era cierto cuando se emitio.';

/*
  EL CUERPO SE PARCHEA, COMO EN `20260825290000`.

  Se lee la definicion viva con `pg_get_functiondef`, se cambian cinco trozos
  exactos y se ejecuta. Trescientas lineas copiadas en cada migracion se
  desincronizan a la tercera, y ningun archivo del repositorio tiene hoy el
  cuerpo entero: las migraciones anteriores tambien parchean. Anclar en lo que
  ellas dejan es lo correcto para una base rehecha desde cero.

  EL CENTINELA, Y POR QUE HACE FALTA

  Esta migracion se aplico primero por MCP y el archivo se escribio despues, asi
  que en la base de hoy ya esta puesta. Un parche por texto no es idempotente
  —peor aun: el trozo viejo del cambio 1 es PREFIJO del nuevo, asi que un
  segundo pase duplicaria las declaraciones, y eso paso de verdad al probarlo—.

  Se mira una sola vez si `v_dias_rango` ya esta declarada. Si esta, la funcion
  ya lleva este cambio y no se toca nada. Es una condicion y no cinco, y no
  depende de que los comentarios esten escritos igual.
*/
do $desincorporado$
declare
  v_def   text;
  v_nuevo text;
  i       integer;
  v_cambios text[][] := array[

    -- 1. Las variables del prorrateo
    [E'  v_dias_pagados  numeric;\n  v_dias_facturados numeric;\n  v_dias_laborados  numeric;',
     E'  v_dias_pagados  numeric;\n  v_dias_facturados numeric;\n  v_dias_laborados  numeric;\n\n  -- Lo que hace falta para prorratear a quien entra o sale a mitad de periodo.\n  v_dias_rango   integer;\n  v_desde_emp    date;\n  v_hasta_emp    date;\n  v_dias_en      integer;\n  v_egresado_en  date;'],

    -- 2. El filtro que sobraba, y el rango que hace falta para prorratear
    [E'  v_modo          := private.parametro(''modo_concurrencia_recargos'', v_p.hasta);\n\n  for v_emp in\n    select * from public.empleados\n    where activo\n      and fecha_ingreso <= v_p.hasta',
     E'  v_modo          := private.parametro(''modo_concurrencia_recargos'', v_p.hasta);\n\n  v_dias_rango := (v_p.hasta - v_p.desde) + 1;\n\n  /*\n    SE QUITO EL `and activo` DE ESTE FILTRO, Y ESE ERA EL FALLO.\n\n    La ventana de fechas de las dos lineas siguientes ya dice exactamente quien\n    pertenece al periodo. `egresar_empleado` apaga `activo` a la vez que pone\n    `fecha_egreso`, asi que borraba del calculo a quien salia a mitad de\n    quincena — que es justo a quien esa ventana existe para incluir.\n  */\n  for v_emp in\n    select * from public.empleados\n    where fecha_ingreso <= v_p.hasta'],

    -- 3. Los dias, prorrateados al tiempo que estuvo
    [E'    v_dias_facturados := v_p.dias;\n    v_dias_laborados  := greatest(v_p.dias\n                                  - coalesce(v_nov.faltas_injustificadas, 0)\n                                  - coalesce(v_nov.faltas_justificadas, 0), 0);\n    v_dias_pagados := v_p.dias - coalesce(v_nov.faltas_injustificadas, 0);',
     E'    /*\n      LOS DIAS SE PRORRATEAN AL TIEMPO QUE ESTUVO EN NOMINA.\n\n      Para quien estuvo el periodo completo el solape es el rango entero y sale\n      `v_p.dias` exacto, asi que el caso normal no cambia en nada. Esa es la\n      propiedad que hace seguro este arreglo.\n    */\n    v_desde_emp := greatest(v_emp.fecha_ingreso, v_p.desde);\n    v_hasta_emp := least(coalesce(v_emp.fecha_egreso, v_p.hasta), v_p.hasta);\n    v_dias_en   := (v_hasta_emp - v_desde_emp) + 1;\n\n    if v_dias_en <= 0 then\n      continue;\n    end if;\n\n    v_dias_facturados := case\n      when v_dias_en >= v_dias_rango then v_p.dias\n      else round(v_p.dias * v_dias_en::numeric / v_dias_rango, 2)\n    end;\n\n    v_dias_laborados  := greatest(v_dias_facturados\n                                  - coalesce(v_nov.faltas_injustificadas, 0)\n                                  - coalesce(v_nov.faltas_justificadas, 0), 0);\n    v_dias_pagados := v_dias_facturados - coalesce(v_nov.faltas_injustificadas, 0);'],

    -- 4. La fecha de egreso, congelada en el recibo
    [E'    insert into public.nomina_recibos\n      (periodo_id, empleado_id, dias_pagados, dias_facturados, dias_laborados,\n       salario_basico_diario)\n    values (p_periodo_id, v_emp.id, v_dias_pagados, v_dias_facturados,\n            v_dias_laborados, v_basico_diario)\n    returning id into v_recibo_id;',
     E'    -- Se congela si la salida cae dentro de este periodo. Un recibo dice lo\n    -- que era cierto el dia que se emitio, y no cambia si manana la persona se\n    -- reincorpora.\n    v_egresado_en := case\n      when v_emp.fecha_egreso between v_p.desde and v_p.hasta then v_emp.fecha_egreso\n    end;\n\n    insert into public.nomina_recibos\n      (periodo_id, empleado_id, dias_pagados, dias_facturados, dias_laborados,\n       salario_basico_diario, egresado_en)\n    values (p_periodo_id, v_emp.id, v_dias_pagados, v_dias_facturados,\n            v_dias_laborados, v_basico_diario, v_egresado_en)\n    returning id into v_recibo_id;'],

    -- 5. El mismo filtro, en el mensaje de «ninguno cobra asi»
    [E'    from public.empleados\n    where activo\n      and fecha_ingreso <= v_p.hasta\n      and (fecha_egreso is null or fecha_egreso >= v_p.desde);',
     E'    from public.empleados\n    where fecha_ingreso <= v_p.hasta\n      and (fecha_egreso is null or fecha_egreso >= v_p.desde);']
  ];
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'calcular_nomina' and p.prokind = 'f';

  if v_def is null then
    raise exception 'No existe public.calcular_nomina';
  end if;

  -- El centinela. Si ya esta, esta migracion ya corrio y no hay nada que hacer.
  if position('v_dias_rango' in v_def) > 0 then
    raise notice 'calcular_nomina ya lleva el prorrateo; no se toca.';
    return;
  end if;

  v_nuevo := v_def;
  for i in 1 .. array_length(v_cambios, 1) loop
    if position(v_cambios[i][1] in v_nuevo) = 0 then
      raise exception 'En calcular_nomina no aparece el trozo %: «%». La funcion cambio desde que se midio.',
        i, left(v_cambios[i][1], 60);
    end if;
    v_nuevo := replace(v_nuevo, v_cambios[i][1], v_cambios[i][2]);
  end loop;

  execute v_nuevo;
end;
$desincorporado$;


comment on function public.calcular_nomina(bigint) is
  'Rehace los recibos del periodo. Incluye a quien entro o salio a mitad de periodo, con los dias prorrateados al tiempo que estuvo en nomina.';

/*
  COMPROBADO DESPUÉS DE APLICARLA

    -- La columna está
    select column_name from information_schema.columns
     where table_schema='public' and table_name='nomina_recibos'
       and column_name='egresado_en';

    -- Y el ensayo entero, deshecho:
    --   begin;
    --   update public.nomina_periodos set estado='BORRADOR' where id=10;
    --   set local role authenticated;
    --   select set_config('request.jwt.claims','{"sub":"…","role":"authenticated"}',true);
    --   select public.calcular_nomina(10);
    --   select e.ficha, r.dias_facturados, r.egresado_en, r.neto_usd
    --     from public.nomina_recibos r join public.empleados e on e.id=r.empleado_id
    --    where r.periodo_id=10 order by (r.egresado_en is null), e.ficha;
    --   rollback;
*/
