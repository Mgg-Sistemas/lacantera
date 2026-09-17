/*
  LA GUÍA DE MOVILIZACIÓN ES OPCIONAL

  Christopher, 17/09/2026, con la nota de entrega delante: «No tenemos Guía. Eso
  es en el módulo de facturación, despacho». El formulario decía «No hay guías
  vigentes: el despacho de mineral se rechazará», y así era: `despachar` negaba
  toda nota con mineral sin guía, salvo a quien tuviera control total sobre
  Despachos.

  La regla salió de la respuesta del 16/09 a «¿qué guía acompaña cada despacho?»
  —«cada camión que sale debe estar respaldado por una guía»—, que describía la
  práctica formal y no lo que esta operación tiene hoy. Sin guías cargadas
  (`guias_movilizacion` vacía), ninguna venta de mineral podía salir.

  Ahora la guía se elige si la hay, y se engancha y se gasta como antes; si no,
  el despacho sale igual. Si algún día se exige, se vuelve a poner aquí.
*/

do $parche$
declare
  v_def   text := pg_get_functiondef('public.despachar(bigint, bigint, jsonb, character, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text, bigint, bigint)'::regprocedure);
  v_antes text := $a$  -- Ninguna salida de mineral viaja sin guía. Se comprueba después de cargar
  -- los renglones porque hasta aquí no se sabía si esta nota lleva producto o
  -- es solo un flete.
  select exists (
    select 1
    from public.nota_entrega_renglones r
    join public.articulos a on a.id = r.articulo_id
    where r.nota_id = v_id and a.categoria = 'PRODUCTO'
  ) into v_producto;

  if v_producto and p_guia_id is null and not private.tiene_permiso('DESPACHOS', 'TOTAL') then
    raise exception 'Este despacho lleva mineral y no tiene guía de movilización. Cárgala en Despachos › Guías, o pídele a quien tenga control total sobre Despachos que lo autorice sin ella.'
      using errcode = '55000';
  end if;
$a$;
  v_despues text := $b$  -- La guía de movilización es opcional desde el 17/09/2026: «No tenemos
  -- guía». Si llega, se engancha y queda gastada más abajo; si no, sale igual.
$b$;
begin
  if (length(v_def) - length(replace(v_def, v_antes, ''))) / length(v_antes) <> 1 then
    raise exception 'despachar no tiene el freno de la guía una sola vez: no se toca.';
  end if;
  execute replace(v_def, v_antes, v_despues);
end
$parche$;

do $ver$
begin
  if position('no tiene guía de movilización' in pg_get_functiondef('public.despachar(bigint, bigint, jsonb, character, bigint, text, text, text, numeric, numeric, text, numeric, numeric, numeric, date, text, bigint, bigint)'::regprocedure)) > 0 then
    raise exception 'despachar sigue exigiendo la guía';
  end if;
end
$ver$;
