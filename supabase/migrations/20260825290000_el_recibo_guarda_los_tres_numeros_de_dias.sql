-- El recibo guarda los tres números de días, y el trabajador firma a mano.
--
-- `calcular_nomina` son trescientas líneas y de ellas cambian tres. Se lee la
-- definición viva y se sustituyen cadenas exactas, en vez de recopiar la
-- función entera al archivo: cada copia a mano es una ocasión de meter una
-- diferencia sin querer en el cálculo de lo que cobra la gente.
--
-- Si alguna cadena no aparece —porque la función cambió desde que se midió—
-- esto revienta antes de aplicar nada.

do $recibo$
declare
  v_def   text;
  v_nuevo text;
  v_cambios text[][] := array[
    -- 1. Las dos variables nuevas
    ['  v_dias_pagados  numeric;',
     E'  v_dias_pagados  numeric;\n  v_dias_facturados numeric;\n  v_dias_laborados  numeric;'],

    -- 2. Los tres números, juntos y en el mismo sitio para que se lean de una
    --    vez y no haya que buscar de dónde sale cada uno.
    ['    v_dias_pagados := v_p.dias - coalesce(v_nov.faltas_injustificadas, 0);',
     E'    /*\n'
     '      LOS TRES NUMEROS DEL RECIBO\n'
     '\n'
     '        FACTURADOS  los dias que paga el periodo. Una quincena paga 15\n'
     '                    aunque su rango tenga 16 fechas.\n'
     '        LABORADOS   facturados menos TODAS las faltas: es lo que de verdad\n'
     '                    estuvo. No entra en ningun calculo, se ensena.\n'
     '        A PAGAR     facturados menos solo las INJUSTIFICADAS, porque la\n'
     '                    justificada se paga. Es sobre este que se calcula todo,\n'
     '                    y es el que habia desde siempre.\n'
     '    */\n'
     '    v_dias_facturados := v_p.dias;\n'
     '    v_dias_laborados  := greatest(v_p.dias\n'
     '                                  - coalesce(v_nov.faltas_injustificadas, 0)\n'
     '                                  - coalesce(v_nov.faltas_justificadas, 0), 0);\n'
     '    v_dias_pagados := v_p.dias - coalesce(v_nov.faltas_injustificadas, 0);'],

    -- 3. Que se guarden
    [E'    insert into public.nomina_recibos\n      (periodo_id, empleado_id, dias_pagados, salario_basico_diario)\n    values (p_periodo_id, v_emp.id, v_dias_pagados, v_basico_diario)\n    returning id into v_recibo_id;',
     E'    insert into public.nomina_recibos\n      (periodo_id, empleado_id, dias_pagados, dias_facturados, dias_laborados,\n       salario_basico_diario)\n    values (p_periodo_id, v_emp.id, v_dias_pagados, v_dias_facturados,\n            v_dias_laborados, v_basico_diario)\n    returning id into v_recibo_id;']
  ];
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'calcular_nomina' and p.prokind = 'f';

  if v_def is null then
    raise exception 'No existe public.calcular_nomina';
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
$recibo$;

comment on function public.calcular_nomina(bigint) is
  'Rehace los recibos del periodo. Guarda los tres numeros de dias: facturados (los que paga el periodo), laborados (menos todas las faltas) y a pagar (menos solo las injustificadas, que es sobre el que se calcula el sueldo).';

-- ---------------------------------------------------------------------------
-- El trabajador firma a mano
--
-- La líder: «QUE FIRMA EL EMPLEADO. IMPRIME Y LO FIRMAN (No usar la firma
-- digital salvo se indique lo contrario)».
--
-- El recibo estampa la firma guardada de quien la tenga encendida. Había una
-- encendida, así que ese recibo salía firmado y el resto con la raya en blanco.
--
-- Se apagan todas las de TRABAJADOR. No se borran: el interruptor y la imagen
-- siguen ahí para el día que se indique lo contrario, que es lo que dijo la
-- líder — y el propio archivo del recibo ya lo razonaba así: «una firma
-- dibujada por el sistema no prueba que la persona estuvo delante».
--
-- La firma de la EMPRESA no se toca: esa sí va impresa, y es de quien emite el
-- papel, no de quien lo recibe.
-- ---------------------------------------------------------------------------
update public.firmas
   set usar = false
 where empleado_id is not null and usar;
