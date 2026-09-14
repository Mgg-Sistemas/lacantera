/*
  SIN SESIÓN, SOLO SE VERIFICA EL CARNET.

  Veinticuatro funciones de `public` las podía llamar cualquiera con la clave
  pública de la página, sin iniciar sesión. No era una fuga —el carril de base de
  datos lo comprobó: todas empiezan pidiendo permiso, y sin sesión no hay a quién
  dárselo—, pero la puerta estaba abierta y lo único que la cerraba era una línea
  dentro de cada función. La primera que se escriba sin esa línea queda a la vista
  de cualquiera.

  DE DÓNDE SALE. Supabase deja privilegios por defecto en `public`: cada función
  nueva nace con EXECUTE para `anon`, `authenticated` y `service_role`, y Postgres
  le suma por su cuenta EXECUTE para PUBLIC. A casi todas se lo quitó alguna
  migración; a estas veinticuatro, no. Dieciséis lo tenían por las dos vías y ocho
  solo por `anon`, así que hay que nombrar las dos: quitar una deja la puerta por
  la otra.

  QUIEN TIENE SESIÓN NO PIERDE NADA. Las veinticuatro tienen EXECUTE explícito para
  `authenticated` y `service_role` —comprobado antes de aplicar—, y la verificación
  de abajo lo exige después. Ninguna política ni vista depende de ellas.

  LA ÚNICA QUE SE QUEDA ABIERTA es `verificar_carnet`, que se llama desde el código
  QR del carnet, sin sesión: es la razón de ser de la ruta /v.

  Y PARA QUE NO VUELVA A PASAR, una guardia como la de las vistas
  (`trg_vista_con_invoker`): al crear o alterar una función en `public`, si la puede
  llamar un anónimo, se le quita y se avisa. Una función que de verdad tenga que ser
  pública se añade a la lista de la guardia, en una migración, diciendo por qué.
*/

do $mig$
declare
  r record;
  v_revisadas constant text[] := array[
    'a_cargo_de_empleados', 'agregar_foto_maquina', 'auditoria_nombres',
    'borrar_presentacion', 'borrar_presentacion_de_articulo', 'cambiar_dueno_de_material',
    'categorias_de_articulo', 'costo_por_presentacion', 'despachar_combustible',
    'envases_aqui', 'guardar_almacen', 'guardar_maquina', 'guardar_presentacion',
    'guardar_propietario', 'montar_agregado', 'presentaciones_parecidas',
    'quitar_foto_de_maquina', 'reenvasar', 'registrar_ajuste', 'registrar_baja',
    'registrar_entrada', 'renumerar_articulo', 'retirar_agregado', 'transferir_existencia'
  ];
  v_n int := 0;
begin
  for r in
    select p.oid, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) as args
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname <> 'verificar_carnet'
       and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
       and not exists (
         select 1 from pg_catalog.pg_depend d
          where d.classid = 'pg_catalog.pg_proc'::regclass
            and d.objid = p.oid and d.deptype = 'e')
     order by p.proname
  loop
    -- Solo las que se miraron una por una. Si aparece otra, se para aqui.
    if not (r.proname = any (v_revisadas)) then
      raise exception 'public.%(%) la puede llamar un anonimo y no esta entre las revisadas: mirala antes de cerrarla.',
        r.proname, r.args using errcode = '22023';
    end if;

    execute format('revoke execute on function public.%I(%s) from public, anon', r.proname, r.args);
    v_n := v_n + 1;
  end loop;

  raise notice 'Cerradas a quien no inicio sesion: % funciones.', v_n;
end
$mig$;

create or replace function private.funcion_sin_anonimo()
returns event_trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r record;
begin
  for r in
    select c.objid, c.object_identity, p.proname
      from pg_catalog.pg_event_trigger_ddl_commands() c
      join pg_catalog.pg_proc p on p.oid = c.objid
     where c.object_type in ('function', 'procedure')
       and c.schema_name = 'public'
       and not c.in_extension
  loop
    /*
      LA UNICA PUERTA PUBLICA A PROPOSITO es la verificacion del carnet, que se
      abre desde el codigo QR sin sesion. Si algun dia hace falta otra, se añade
      aqui, en una migracion, y queda escrito por que.
    */
    continue when r.proname = any (array['verificar_carnet']);

    -- Solo si la tiene: asi el aviso sale cuando de verdad se cerro algo, y el
    -- `revoke` no se repite en cada `create or replace` de una funcion ya cerrada.
    if pg_catalog.has_function_privilege('anon', r.objid, 'EXECUTE') then
      execute format('revoke execute on routine %s from public, anon', r.object_identity);

      raise notice
        'La funcion % la podia llamar cualquiera sin iniciar sesion y se le ha quitado. Quien tiene sesion conserva el permiso que tenga dado.',
        r.object_identity;
    end if;
  end loop;
end;
$function$;

comment on function private.funcion_sin_anonimo() is
  'Guardia de trg_funcion_sin_anonimo: al crear o alterar una función en public, le quita EXECUTE a PUBLIC y a anon si lo tiene. La única excepción es verificar_carnet, que se llama sin sesión desde el QR del carnet.';

drop event trigger if exists trg_funcion_sin_anonimo;

create event trigger trg_funcion_sin_anonimo
  on ddl_command_end
  when tag in ('CREATE FUNCTION', 'ALTER FUNCTION', 'CREATE PROCEDURE', 'ALTER PROCEDURE')
  execute function private.funcion_sin_anonimo();

comment on event trigger trg_funcion_sin_anonimo is
  'Ninguna función de public nace llamable sin sesión, salvo verificar_carnet. Los privilegios por defecto de Supabase se la dan a anon y Postgres a PUBLIC; esta guardia se la quita al crearla.';

do $ver$
declare
  v_abiertas   text;
  v_sin_sesion text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_abiertas
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname <> 'verificar_carnet'
     and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_abiertas is not null then
    raise exception 'Siguen abiertas a quien no inicio sesion: %.', v_abiertas using errcode = '22023';
  end if;

  select string_agg(p.proname, ', ' order by p.proname) into v_sin_sesion
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = any (array[
       'a_cargo_de_empleados', 'agregar_foto_maquina', 'auditoria_nombres',
       'borrar_presentacion', 'borrar_presentacion_de_articulo', 'cambiar_dueno_de_material',
       'categorias_de_articulo', 'costo_por_presentacion', 'despachar_combustible',
       'envases_aqui', 'guardar_almacen', 'guardar_maquina', 'guardar_presentacion',
       'guardar_propietario', 'montar_agregado', 'presentaciones_parecidas',
       'quitar_foto_de_maquina', 'reenvasar', 'registrar_ajuste', 'registrar_baja',
       'registrar_entrada', 'renumerar_articulo', 'retirar_agregado', 'transferir_existencia'])
     and not (pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
              and pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE'));
  if v_sin_sesion is not null then
    raise exception 'Se cerraron tambien para quien tiene sesion: %.', v_sin_sesion using errcode = '22023';
  end if;

  if not pg_catalog.has_function_privilege('anon', 'public.verificar_carnet(text)'::regprocedure, 'EXECUTE') then
    raise exception 'La verificacion del carnet sin sesion dejo de funcionar.' using errcode = '22023';
  end if;

  if not exists (select 1 from pg_catalog.pg_event_trigger
                  where evtname = 'trg_funcion_sin_anonimo' and evtenabled = 'O') then
    raise exception 'La guardia de funciones no quedo encendida.' using errcode = '22023';
  end if;
end
$ver$;
