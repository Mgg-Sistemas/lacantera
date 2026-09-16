/*
  EL TRASLADO DIRECTO VUELVE

  Se apagó la mañana del 16/09/2026 junto con la salida directa
  (`20260916170000`), y Christopher lo devolvió esa misma mañana: «por
  instrucción los traslados pueden volver a ser directos».

  Solo vuelve el traslado. La salida directa sigue cerrada —toda salida se
  autoriza—, y ninguna salida puede nombrar una venta. Un traslado no saca
  material de la empresa: lo cambia de sitio, y el directo sigue exigiendo que
  quien lo hace responda por los dos almacenes o sea administración.
*/

do $parche$
declare
  v_def text;
  r     record;
begin
  for r in
    select * from (values
      ('public.solicitar_traslado(bigint, bigint, bigint, numeric, text, date, numeric, text, numeric, text, boolean, boolean)',
       $a$  /*
    EL TRASLADO DIRECTO, APAGADO POR AHORA. Christopher, 16/09/2026:
    «ocultaremos las salidas y traslados directos por ahora». Pedir y enviar
    siguen abiertos: en los dos, quien responde por el destino confirma que
    llegó.
  */
  if coalesce(p_inmediato, false) then
    raise exception 'Por ahora no hay traslado directo: pide el material o envíalo, y quien responde por el almacén de destino confirma que llegó.'
      using errcode = '42501';
  end if;$a$,
       $b$  /*
    EL TRASLADO DIRECTO SE APAGÓ Y VOLVIÓ la mañana del 16/09/2026: «por
    instrucción los traslados pueden volver a ser directos». La salida directa
    sigue cerrada en `registrar_salidas`.
  */$b$)
    ) as t(funcion, antes, despues)
  loop
    v_def := pg_get_functiondef(r.funcion::regprocedure);
    if (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes) <> 1 then
      raise exception 'En % el texto «%» no aparece exactamente una vez.', r.funcion, r.antes;
    end if;
    execute replace(v_def, r.antes, r.despues);
  end loop;
end
$parche$;

do $ver$
begin
  if position('Por ahora no hay traslado directo' in pg_get_functiondef('public.solicitar_traslado(bigint, bigint, bigint, numeric, text, date, numeric, text, numeric, text, boolean, boolean)'::regprocedure)) > 0 then
    raise exception 'solicitar_traslado sigue rechazando el traslado directo';
  end if;
  if position('POR AHORA TODA SALIDA SE AUTORIZA' in pg_get_functiondef('public.registrar_salidas(bigint, jsonb, text, text, date, bigint, text, text)'::regprocedure)) = 0 then
    raise exception 'la salida directa no debía abrirse';
  end if;
end
$ver$;
