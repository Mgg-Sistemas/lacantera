-- ---------------------------------------------------------------------------
-- Ninguna vista nace sin `security_invoker`
--
-- El carril de base de datos lo dijo con razón: «tres veces en cuatro días es
-- un patrón, no un descuido. La comprobación no falla por falta de disciplina
-- sino porque hay que acordarse de correrla».
--
-- El mecanismo siempre es el mismo: `create or replace view` sin cláusula
-- `with` descarta las reloptions. Se arregla poniendo el `alter view ... set`
-- justo debajo, y eso hay que recordarlo cada vez — sesenta veces hasta ahora.
--
-- Un disparador de evento lo hace solo. Es la única forma de que deje de
-- depender de la memoria de quien escribe la migración.
--
-- POR QUÉ CORRIGE EN VEZ DE RECHAZAR
--
-- Se podría abortar el DDL, y sería más estricto. Pero una migración que
-- revienta a mitad deja el esquema a medias, y quien la escribió tiene que
-- adivinar cuál de sus quince vistas fue. Corregir y seguir da el mismo
-- resultado: al terminar, todas la llevan.
--
-- LA RECURSIÓN
--
-- El `alter view` de dentro vuelve a disparar el evento. Se corta comprobando
-- antes si la opción ya está: en la segunda vuelta ya está puesta y no se hace
-- nada. Sin esa comprobación esto sería un bucle infinito.
--
-- SOLO `public`
--
-- Las vistas de `private`, `auth` o `storage` no las escribimos nosotros y no
-- tienen por qué seguir nuestra regla.
--
-- COMPROBADO
--
-- Creando una vista sin la cláusula —como se creó mal tres veces— y volviendo a
-- rehacerla después: en los dos casos queda con `security_invoker=on` sin que
-- nadie lo pida.
-- ---------------------------------------------------------------------------

create or replace function private.vista_con_invoker()
returns event_trigger
language plpgsql
security definer
set search_path to ''
as $func$
declare
  r record;
begin
  for r in
    select objid, object_identity
      from pg_event_trigger_ddl_commands()
     where object_type = 'view'
       and schema_name = 'public'
  loop
    -- Solo si le falta. Esta comprobación es la que corta la recursión: el
    -- `alter` de abajo vuelve a disparar el evento, y en esa segunda vuelta la
    -- opción ya está y no se hace nada.
    if not exists (
      select 1 from pg_class c
       where c.oid = r.objid
         and coalesce(array_to_string(c.reloptions, ','), '') like '%security_invoker%'
    ) then
      execute format('alter view %s set (security_invoker = on)', r.object_identity);

      raise notice
        'A la vista % le faltaba security_invoker y se le ha puesto. Sin ella, la vista lee con los permisos de quien la creó y se salta la RLS de todo lo que consulta.',
        r.object_identity;
    end if;
  end loop;
end;
$func$;

comment on function private.vista_con_invoker() is
  'Le pone security_invoker a toda vista de public que nazca sin ella. Existe '
  'porque `create or replace view` descarta las reloptions y eso se olvidaba una '
  'vez de cada tres.';

drop event trigger if exists trg_vista_con_invoker;

create event trigger trg_vista_con_invoker
  on ddl_command_end
  when tag in ('CREATE VIEW', 'ALTER VIEW')
  execute function private.vista_con_invoker();

-- ---------------------------------------------------------------------------
-- Las tres del reporte pasan de `=true` a `=on`
--
-- Son equivalentes para Postgres: se comprobó funcionalmente, con `set role
-- authenticated` y sin sesión, que las tres devuelven cero filas igual que una
-- vista de control que llevaba `=on`. No estaban abiertas.
--
-- Se normalizan igual porque el detector del carril BD busca el literal `=on`,
-- y una alarma que salta sin motivo enseña a ignorar las alarmas.
-- ---------------------------------------------------------------------------
alter view public.v_proveedor_articulos set (security_invoker = on);
alter view public.v_proveedor_resumen   set (security_invoker = on);
alter view public.v_cuentas_por_pagar   set (security_invoker = on);
