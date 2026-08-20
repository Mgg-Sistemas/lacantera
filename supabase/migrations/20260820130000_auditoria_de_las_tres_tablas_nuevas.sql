-- ---------------------------------------------------------------------------
-- Tres tablas de negocio sin rastro de quién las cambió
--
-- `asignaciones_herramienta`, `despachos_combustible` y `vehiculo_choferes`
-- salieron sin `trg_auditar` y fuera del tiempo real. Es el mismo olvido por
-- tercera vez —pasó con maquinaria, se repitió con vehículos— y son justo las
-- que registran quién se llevó una herramienta, cuánto combustible se despachó
-- y qué chofer llevaba qué camión: las tres cosas por las que alguien pregunta
-- cuando algo falta.
--
-- Se vuelve a correr el bloque de `20260730120000`, que recorre las tablas de
-- `public` y les pone el disparador. Las nuevas entran solas y las que ya lo
-- tenían se lo vuelven a poner idéntico. Es más seguro que enumerarlas a mano,
-- que es exactamente como se quedaron fuera las tres.
--
-- `nomina_recibo_lineas` SIGUE EXCLUIDA, Y ES A PROPÓSITO
--
-- La exclusión viene de la migración original y su motivo se mantiene: son
-- cientos de renglones para contar una sola acción, y su padre `nomina_recibos`
-- sí deja rastro. El detalle de un recibo no se edita a mano — sale de un
-- cálculo— así que auditarlo llenaría el registro sin responder ninguna
-- pregunta. Si algún día se quiere, se saca de las dos listas de exclusión.
-- ---------------------------------------------------------------------------
do $$
declare
  v_t record;
begin
  for v_t in
    select c.relname as tabla,
           coalesce(
             (select string_agg(format('%L', a.attname), ', ' order by k.ord)
                from pg_index i
                cross join lateral unnest(i.indkey) with ordinality as k(att, ord)
                join pg_attribute a on a.attrelid = c.oid and a.attnum = k.att
               where i.indrelid = c.oid and i.indisprimary),
             '') as clave
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relname not in (
         'auditoria', 'correlativos', 'notificaciones',
         'notificaciones_leidas', 'nomina_recibo_lineas')
     order by c.relname
  loop
    execute format('drop trigger if exists trg_auditar on public.%I', v_t.tabla);
    execute format(
      'create trigger trg_auditar after insert or update or delete on public.%I
         for each row execute function private.auditar(%s)',
      v_t.tabla, v_t.clave);
  end loop;
end
$$;

-- Y al tiempo real, para que la pantalla de quien entrega una herramienta se
-- entere cuando otro la devuelve, sin recargar.
do $$
declare v_t text;
begin
  foreach v_t in array array[
    'asignaciones_herramienta', 'despachos_combustible', 'vehiculo_choferes'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_t);
    end if;
  end loop;
end
$$;
