-- ---------------------------------------------------------------------------
-- El navegador no escribe, tampoco en lo que se cree mañana
--
-- El carril de base de datos reportó que «volvieron los GRANT de escritura» en
-- cuatro tablas nuevas. No volvieron: nunca se fueron de las tablas nuevas.
--
-- Supabase deja puesto un ALTER DEFAULT PRIVILEGES sobre el esquema `public`
-- que concede TODO —insert, update, delete incluidos— a `anon` y a
-- `authenticated` en cada relación que se cree. Las 72 tablas viejas están
-- limpias porque alguien escribió el revoke a mano en cada migración. Cualquier
-- tabla nueva vuelve a nacer abierta, y solo se descubre cuando alguien la
-- audita.
--
-- Eso convierte la regla de la casa —«el navegador no escribe»— en algo que hay
-- que recordar cada vez, y lo que hay que recordar cada vez se olvida. Se
-- olvidó en `compras_papeles`, en `organigrama_nodos`, en las dos de
-- incidencias y en `firmas`, que era de hacía media hora.
--
-- Hoy no había agujero: las cinco tienen RLS y solo política de SELECT, así que
-- la RLS deniega igual. Lo que faltaba era la segunda cerradura. En el resto
-- del sistema hacen falta dos cosas para escribir; ahí quedaba una.
--
-- Se arregla en los dos sentidos: el defecto, para que ninguna tabla futura
-- nazca abierta, y un barrido sobre lo que ya existe.
--
-- Las vistas van también. El carril BD no las nombró porque filtró por tablas
-- base, pero una vista simple sobre una sola tabla es actualizable en Postgres,
-- y las 50 llevaban los mismos permisos de más.
-- ---------------------------------------------------------------------------

-- 1. La causa. A partir de aquí nada nace con escritura para el navegador.
alter default privileges for role postgres in schema public
  revoke insert, update, delete on tables from anon, authenticated;

-- 2. Lo que ya existe. Se recorre en vez de listarlo: escribir los nombres a
--    mano deja fuera la tabla que se cree entre que esto se escribe y se
--    aplica, que es exactamente como empezó el problema.
do $barrido$
declare
  r record;
begin
  for r in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'v', 'p', 'm')
  loop
    execute format(
      'revoke insert, update, delete on public.%I from anon, authenticated',
      r.relname);
  end loop;
end;
$barrido$;

-- 3. La tabla que dice quién estuvo en cada incidencia de personal —un
--    conflicto, una lesión— no dejaba rastro. Es de las que conviene que lo
--    dejen desde el primer día, no desde el día en que alguien discuta una.
drop trigger if exists trg_auditar on public.incidencia_participantes;
create trigger trg_auditar
  after insert or update or delete on public.incidencia_participantes
  for each row execute function private.auditar('id');
