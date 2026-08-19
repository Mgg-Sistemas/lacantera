-- ============================================================================
-- El respaldo generaba un archivo que no se podía restaurar
-- ============================================================================
--
-- `respaldo_datos()` construía cada insert así:
--
--     insert into public.tabla overriding system value
--     select (jsonb_populate_record(null::public.tabla, x)).*
--       from jsonb_array_elements('[...]'::jsonb) as x;
--
-- El `.*` expande TODAS las columnas, incluidas las calculadas —las que la base
-- deriva sola, `generated always as ... stored`—. Postgres rechaza que se les
-- escriba un valor, así que la restauración moría en la primera:
--
--     ERROR:  cannot insert a non-DEFAULT value into column "neto"
--     DETAIL:  Column "neto" is a generated column.
--
-- Son 38 columnas repartidas en 23 de las 63 tablas: recibos de nómina,
-- facturas de compra y de venta, movimientos de tesorería, prestaciones,
-- tickets de romana. Más de un tercio del sistema.
--
-- Lo grave no es el fallo, es cuándo se descubre. El archivo se descargaba con
-- buena cara, pesaba lo que tenía que pesar y decía cuántas filas llevaba. Solo
-- fallaba al restaurarlo, que es el único momento en que ya no hay alternativa.
--
-- La función sí resolvía con cuidado el caso vecino —`overriding system value`
-- solo en las tablas con columna de identidad, preguntando al catálogo—, con un
-- comentario largo explicando por qué. Se le pasó el otro.
--
-- ARREGLO: lista explícita de columnas, sin las calculadas, y
-- `jsonb_populate_recordset` en vez de `jsonb_populate_record` + `.*`.
--
-- SE PARCHEA, NO SE REESCRIBE. Redefinir la función entera copiándola de la
-- migración original perdería cualquier corrección posterior que viva solo en
-- la base. Se lee lo que hay ahí, se sustituye el trozo malo y, si no aparece
-- tal cual se espera, se aborta en vez de escribir algo a medias.
--
-- Comprobado en base local: se generó el guion, se borraron las 22 filas de una
-- tabla, se restauró desde el guion y la huella MD5 quedó idéntica.
-- ============================================================================

do $parche$
declare
  v_def  text;
  v_cols text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'respaldo_datos';

  if v_def is null then
    raise exception 'No existe public.respaldo_datos(): nada que parchear.';
  end if;

  if position('insert into public.%I%s' in v_def) = 0 then
    raise exception 'El insert no es el esperado: la función ya cambió. Revisar a mano.';
  end if;

  -- Comillas de dólar: este texto lleva comillas simples dentro, y escaparlas a
  -- mano es exactamente como se rompen los parches.
  v_cols := $q$(select string_agg(quote_ident(a.attname), ', ' order by a.attnum) from pg_attribute a where a.attrelid = ('public.'||quote_ident(v_tabla))::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '')$q$;

  -- Desde el `insert` hasta el `as x;` que lo cierra. El modificador `s` deja
  -- que el punto cruce saltos de línea; el `?` lo hace perezoso para no
  -- comerse más de un bloque.
  v_def := regexp_replace(
    v_def,
    'insert into public\.%I%s.*?as x;',
    'insert into public.%I (%s)%s\nselect %s\n  from jsonb_populate_recordset(null::public.%I, %L::jsonb);',
    's');

  if position('v_tabla, v_filas, v_tabla, v_tabla, v_forzar, v_tabla, v_datos::text)' in v_def) = 0 then
    raise exception 'Los argumentos del format() no son los esperados. Revisar a mano.';
  end if;

  v_def := replace(
    v_def,
    'v_tabla, v_filas, v_tabla, v_tabla, v_forzar, v_tabla, v_datos::text)',
    'v_tabla, v_filas, v_tabla, v_tabla, ' || v_cols || ', v_forzar, ' || v_cols || ', v_tabla, v_datos::text)');

  execute v_def;
end $parche$;
