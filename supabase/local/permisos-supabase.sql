-- ============================================================================
-- Los permisos que Supabase pone de fabrica y un `drop schema public` se lleva
--
-- Al reconstruir un proyecto borrando y recreando el esquema `public` se
-- pierden los ALTER DEFAULT PRIVILEGES que Supabase trae configurados. Las
-- migraciones siguen aplicandose sin quejarse —crean sus tablas igual— pero
-- las que no llevan un `grant` explicito dentro nacen sin permiso de lectura
-- para `anon` ni `authenticated`.
--
-- El sintoma no se parece a la causa: la aplicacion entra, la sesion se abre,
-- y al pedir una vista responde «permission denied for table X» nombrando una
-- tabla que la vista une por dentro y que nadie escribio en el codigo. Se
-- descubrio asi, leyendo `v_existencias` por la API: fallaba para TODOS los
-- usuarios, incluido el administrador, lo cual descarta que fuera un problema
-- de permisos del sistema y apunta al reparto de Postgres.
--
-- Medido contra produccion: alli hay 151 objetos legibles por `authenticated`;
-- en la replica recien hecha habia 108. Faltaban 43.
--
-- QUE NO ES ESTO: no es abrir la base. `anon` y `authenticated` reciben SELECT
-- sobre todo, igual que en produccion, y quien protege los datos es la RLS —las
-- 93 tablas la tienen activada— mas las funciones SECURITY DEFINER para
-- escribir. Conceder menos aqui que en produccion no hace la replica mas
-- segura: la hace mentir.
--
-- Se aplica DESPUES de las migraciones.
-- ============================================================================

-- Lo que herede lo que se cree de ahora en adelante.
alter default privileges in schema public
  grant select, references, trigger on tables to anon, authenticated;
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant usage, select, update on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

-- Y lo que ya existe, que los privilegios por omision no alcanzan hacia atras.
grant select, references, trigger on all tables    in schema public to anon, authenticated;
grant all                        on all tables    in schema public to service_role;
grant usage, select, update      on all sequences in schema public to anon, authenticated, service_role;
grant execute                    on all functions in schema public to anon, authenticated, service_role;
