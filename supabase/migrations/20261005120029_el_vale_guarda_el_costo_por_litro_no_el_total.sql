-- ═══════════════════════════════════════════════════════════════════════════
-- EL VALE GUARDA EL COSTO POR LITRO, NO EL TOTAL
--
-- Encontrado el 05/10/2026 trayendo el control de alimentación: al escribir el
-- consumo de la cocina hubo que mirar qué significa `p_costo_usd` en
-- `private.registrar_movimiento`, y la tabla lo dice sin ambigüedad
-- (20260727190000): `costo_usd` es POR UNIDAD y `valor_usd` se genera
-- multiplicando por la cantidad.
--
-- `despachar_combustible` le pasaba el promedio MULTIPLICADO por los litros:
--
--     v_costo := private.costo_promedio(...) * p_cantidad;   ← total
--     registrar_movimiento(..., p_cantidad, v_costo, ...)    ← esperaba unitario
--
-- Con eso, un vale de 100 litros a 0,50 $ habría quedado con valor de 5.000 $
-- en vez de 50: el consumo valorado se infla por un factor de la cantidad, y
-- el promedio de lo que queda en el tanque se hunde.
--
-- NO DAÑÓ NINGÚN DATO: se comprobó en producción que no existe ni un
-- movimiento de despacho de combustible todavía. Y AL APLICARLO SE DESCUBRIÓ
-- ALGO MEJOR: la función viva de producción ya no era la de este repositorio.
-- El compañero la evolucionó —dueño del material, propietario en el asiento—
-- y su versión pasa el costo POR UNIDAD correctamente; el total solo se usa
-- para la columna propia del vale. El ancla no apareció, el parche avisó «ya
-- guarda el costo por litro» y no tocó nada: el error solo existía en la
-- versión vieja del archivo de este repo. El parche se queda porque es
-- inofensivo y deja esta historia escrita donde se va a buscar.
--
-- Se corrige con el parche anclado de la casa: se exige UNA sola coincidencia
-- del texto viejo, y si la función cambió y el ancla no está, la migración
-- revienta en vez de callar.
-- ═══════════════════════════════════════════════════════════════════════════

do $parche$
declare
  v_def   text;
  v_ancla text := 'private.costo_promedio(p_almacen_id, p_articulo_id) * p_cantidad';
  v_veces integer;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'despachar_combustible';

  if v_def is null then
    raise exception 'despachar_combustible no existe: el parche no tiene dónde aplicarse.';
  end if;

  v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);

  if v_veces = 0 then
    raise notice 'despachar_combustible ya guarda el costo por litro: nada que tocar.';
    return;
  end if;
  if v_veces > 1 then
    raise exception 'El ancla aparece % veces y el parche exige una sola: revisar a mano.', v_veces;
  end if;

  v_def := replace(v_def, v_ancla, 'private.costo_promedio(p_almacen_id, p_articulo_id)');
  execute v_def;
  raise notice 'despachar_combustible: el movimiento guarda el costo por litro.';
end $parche$;
