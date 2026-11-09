/*
  LOS PERMISOS SOLO POR LA MATRIZ, Y UN SOLO ROL POR USUARIO (la dueña, 09/11/2026)

  «Los permisos restringidos y los permisos extendidos se van a manejar por la
  matriz de permisos. Es decir, vuelan permisos restringidos y extendidos, todo
  se manejará por la matriz.» Y en el mismo pedido: «un usuario tendrá un solo
  rol, con múltiples permisos».

  Lo que queda:

    - Lo que una persona puede hacer sale SOLO de la matriz de su rol: el nivel
      por módulo (ninguno, lectura, escritura, total) y las casillas de acción
      del rol (rol_acciones). Nada se presta ni se quita por persona.
    - Cada usuario tiene UN rol (restricción única en usuarios_roles).
    - El administrador sigue llegando a todo.
    - La lista «Usuarios autorizados para aprobar» (aprobar OC / salidas, con
      firma) NO cambia: es una lista aparte y no era un permiso extendido.

  CÓMO NADIE CAMBIA DE ACCESO

  1. Quien tenía Administrador entre sus roles queda con Administrador solo:
     ya llegaba a todo y lo sigue haciendo.

  2. Quien tenía varios roles recibe UN rol nuevo por cada combinación distinta
     («Almacén + Compras + …»): su matriz es la UNIÓN de la de sus roles —el
     nivel más alto de cada módulo y todas las casillas—, y se guarda como su
     «↺ Por defecto».

  3. Ese rol nuevo DECLARA a qué roles equivale (tabla `rol_incluye`). Así las
     funciones y políticas que preguntan por un rol concreto
     (`exigir_rol('COMPRAS','ALMACEN')`, avisos con roles fijos como
     array['COMPRAS'], «Gerente general aprueba de respaldo», las políticas con
     `mis_roles() && array[...]`) siguen respondiendo igual sin tocar ninguna de
     ellas: `private.roles_actuales()` (y con ella `tiene_rol`, `exigir_rol` y
     `mis_roles`) devuelve el rol del usuario y los que ese rol incluye.

  4. Lo que a una persona se le había extendido o restringido y su rol no le
     daba pasa a SU rol: si su combinación de roles era solo suya, el rol nuevo
     ya es solo suyo y lo absorbe; si no, se le hace uno propio con su nombre.
     Lo extendido que su rol ya le daba no cambia nada y no se copia.

  5. Las restricciones también frenaban caminos que no van por casilla (el
     nivel de Maquinaria para los vehículos, responder por el sitio para los
     viajes, el rol para crear artículos). Para que la matriz pueda decir eso
     mismo, un rol «Detallado» (a_la_medida) ahora manda también ahí: lo que no
     tiene marcado no lo hace por ningún camino (`private.accion_quitada`). El
     rol de quien tenía restricciones nace detallado, con la lista exacta de
     casillas que podía usar. Los roles por módulo entero no cambian.

  LO QUE CAMBIA EN LOS DATOS DE HOY (consultados el 09/11/2026)

    - Ocho administradores (admin_, antoni264, jlozada, lozadaw_,
      norbelis835, prueba, revision.sistema, sistemas2) quedan con Administrador
      solo. Lo que norbelis835 tenía extendido ya se lo daba Administrador.
    - compras (DIANA): lo extendido (aprobar compra, devolver a cotización,
      compra directa) ya se lo daban Gerente general y Compras. Sin cambio.
    - genesis: su rol propio lleva «precio manual con lista», «generar nota de
      entrega» y «borrar motivo de combustible», que tenía extendidos.
    - rrhh01 (AGATHA): su rol propio lleva las 8 casillas de nómina y las 3 de
      tasas que tenía extendidas.
    - almacen01 (CESAR): su rol propio lleva «cocina en teléfono» y «ver la
      valoración del inventario». Su rol es detallado porque «Ve el personal»
      lo era (si fuera por módulo entero, la lectura de nómina le abriría ver
      tabulador, recibos y prestaciones, que hoy no tiene). Por lo mismo lleva
      marcadas «asignar chofer» y «editar vehículo»: hoy las hace por su
      escritura en Maquinaria, y en un rol detallado sin la casilla se le
      cerrarían.
    - administrador2 (RAFAEL): su rol propio es detallado, sin las 22 casillas
      que tenía restringidas (7 de ellas se las daba su rol: vender bajo el
      mínimo, registrar/aprobar/anular viajes, fijar tarifas, editar el catálogo
      y autorizar facturas; más asignar chofer y editar vehículo, que frenaba
      aunque Maquinaria le abriera el camino), y con «generar nota de entrega»,
      que tenía extendida. Responde por el sitio FLETES EXTERNOS y sigue sin
      aprobar sus viajes, como hoy.
      Única diferencia posible a futuro: «aprobar solicitudes de salida» es una
      casilla apagada (la decide la lista de autorizados), así que ya no
      frena a quien responde por un almacén. Hoy él no responde por ninguno ni
      está en la lista: no gana nada hoy.
    - prueba01: rol detallado (incluía AUDITOR, que lo era), con las casillas
      exactas que tenía, más «asignar chofer» y «editar vehículo» por la misma
      razón que almacen01.
    - dorianne19 y administradora_ (archivada) comparten combinación y rol.
      leni12 y susi (archivadas) reciben su combinación, para que si se
      reactivan vuelvan con lo mismo.

  Las tablas `autorizaciones` y `restricciones` se quedan como historia (nadie
  escribe ni lee de ellas desde la aplicación), y los roles de antes de este
  paso quedan copiados en `usuarios_roles_antes_del_rol_unico`.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. Lo de antes, guardado
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.usuarios_roles_antes_del_rol_unico (
  usuario_id  uuid not null,
  rol         text not null,
  asignado_en timestamptz,
  guardado_en timestamptz not null default now(),
  primary key (usuario_id, rol)
);

comment on table public.usuarios_roles_antes_del_rol_unico is
  'Los roles de cada usuario el 09/11/2026, antes de pasar a un solo rol por usuario. Solo historia.';

alter table public.usuarios_roles_antes_del_rol_unico enable row level security;
revoke all on public.usuarios_roles_antes_del_rol_unico from anon, authenticated, public;

insert into public.usuarios_roles_antes_del_rol_unico (usuario_id, rol, asignado_en)
select usuario_id, rol, asignado_en from public.usuarios_roles
on conflict do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. A qué roles equivale un rol
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.rol_incluye (
  rol     text not null references public.roles(codigo) on delete cascade,
  incluye text not null references public.roles(codigo) on delete cascade,
  primary key (rol, incluye),
  constraint rol_incluye_no_a_si_mismo check (rol <> incluye),
  -- Administrador no se hereda: se asigna, a la vista.
  constraint rol_incluye_no_administrador check (incluye <> 'ADMIN' and rol <> 'ADMIN')
);

comment on table public.rol_incluye is
  'Un rol que cuenta como otros para las funciones que preguntan por un rol concreto (exigir_rol, avisos por rol, políticas). Los permisos los da su propia matriz, no esto.';

alter table public.rol_incluye enable row level security;

drop policy if exists rol_incluye_lectura on public.rol_incluye;
create policy rol_incluye_lectura on public.rol_incluye
  for select to authenticated using (true);

revoke all on public.rol_incluye from anon, public;
grant select on public.rol_incluye to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Un rol por usuario, sin que nadie cambie de acceso
-- ═══════════════════════════════════════════════════════════════════════════

do $un_rol$
declare
  g          record;
  v_codigo   text;
  v_base     text;
  v_nombre   text;
  v_desc     text;
  v_medida   boolean;
  v_tel      boolean;
  v_color    text;
  v_n        integer;
begin
  -- Administrador: queda solo con Administrador.
  delete from public.usuarios_roles ur
   where ur.rol <> 'ADMIN'
     and exists (select 1 from public.usuarios_roles a
                  where a.usuario_id = ur.usuario_id and a.rol = 'ADMIN');

  -- Cada usuario con sus roles.
  create temp table _ru_usuarios on commit drop as
  select p.id, p.usuario, p.nombre, array_agg(ur.rol order by ur.rol) as roles
    from public.perfiles p
    join public.usuarios_roles ur on ur.usuario_id = p.id
   group by p.id, p.usuario, p.nombre;

  -- Lo que hoy le da su combinación de roles, sin contar lo de la persona:
  -- casillas marcadas y lo que abre el nivel en los roles por módulo entero.
  create temp table _ru_casillas on commit drop as
  select u.id, ra.accion
    from _ru_usuarios u
    join public.rol_acciones ra on ra.rol = any(u.roles)
  union
  select u.id, a.codigo
    from _ru_usuarios u
    join public.rol_permisos rp on rp.rol = any(u.roles)
    join public.roles r on r.codigo = rp.rol
    join public.acciones a on a.modulo = rp.modulo
   where not r.a_la_medida
     and a.nivel_equivalente is not null
     and private.rango_nivel(rp.nivel) >= private.rango_nivel(a.nivel_equivalente);

  -- Lo extendido vigente que su rol no le daba.
  create temp table _ru_extendido on commit drop as
  select distinct d.a_usuario as id, d.accion
    from public.autorizaciones d
    join _ru_usuarios u on u.id = d.a_usuario
   where d.revocada_en is null
     and d.desde <= current_date
     and (d.hasta is null or d.hasta >= current_date)
     and not exists (select 1 from _ru_casillas c where c.id = d.a_usuario and c.accion = d.accion);

  -- Lo restringido vigente (todo: también frenaba caminos que no van por casilla).
  create temp table _ru_restringido on commit drop as
  select distinct r.a_usuario as id, r.accion
    from public.restricciones r
    join _ru_usuarios u on u.id = r.a_usuario
   where r.levantada_en is null
     and r.desde <= current_date
     and (r.hasta is null or r.hasta >= current_date);

  -- Cada grupo es una combinación de roles; quien tenía algo suyo va aparte.
  create temp table _ru_grupos on commit drop as
  select u.*,
         exists (select 1 from _ru_extendido e where e.id = u.id)
           or exists (select 1 from _ru_restringido r where r.id = u.id) as propio,
         exists (select 1 from _ru_restringido r where r.id = u.id) as con_restriccion
    from _ru_usuarios u
   where not ('ADMIN' = any(u.roles));

  for g in
    select array_to_string(x.roles, ',') as clave, x.roles,
           case when x.propio then x.id end as persona,
           case when x.propio then x.usuario end as usuario,
           case when x.propio then x.nombre end as nombre,
           bool_or(x.con_restriccion) as con_restriccion,
           array_agg(x.id) as usuarios
      from _ru_grupos x
     group by x.roles, case when x.propio then x.id end,
              case when x.propio then x.usuario end, case when x.propio then x.nombre end
     order by 1, 3
  loop
    -- Un solo rol y nada propio: se queda como está.
    continue when cardinality(g.roles) = 1 and g.persona is null;

    -- Nombre y código legibles. Básico solo da el panel, que todos tienen: no
    -- se nombra salvo que sea lo único.
    select string_agg(r.nombre, ' + ' order by r.orden, r.codigo),
           string_agg(r.codigo, '_' order by r.orden, r.codigo)
      into v_nombre, v_base
      from public.roles r
     where r.codigo = any(g.roles)
       and (r.codigo <> 'BASICO' or g.roles = array['BASICO']);

    if g.persona is not null then
      v_nombre := v_nombre || ' · ' || g.nombre;
      v_base := v_base || '_' || upper(regexp_replace(g.usuario, '[^a-zA-Z0-9]+', '_', 'g'));
    end if;

    v_codigo := v_base;
    v_n := 1;
    while exists (select 1 from public.roles where codigo = v_codigo) loop
      v_n := v_n + 1;
      v_codigo := v_base || '_' || v_n;
    end loop;

    -- Detallado si alguno de sus roles lo era (si no, el nivel de ese rol abriría
    -- casillas que no tenía) o si hay restricciones que expresar.
    select bool_or(r.a_la_medida) or coalesce(g.con_restriccion, false),
           bool_or(r.solo_telefono),
           (array_agg(r.color order by (r.codigo = 'BASICO'), r.orden, r.codigo))[1]
      into v_medida, v_tel, v_color
      from public.roles r
     where r.codigo = any(g.roles);

    v_desc := 'Un solo rol con lo que daban '
              || (select string_agg('«' || r.nombre || '»', ', ' order by r.orden, r.codigo)
                    from public.roles r where r.codigo = any(g.roles))
              || ' (09/11/2026, al pasar a un rol por usuario).'
              || case when g.persona is not null
                      then ' Lleva además lo que a ' || g.nombre
                           || ' se le había extendido o restringido por persona.'
                      else '' end;

    insert into public.roles (codigo, nombre, descripcion, orden, sistema, a_la_medida, solo_telefono, color)
    values (v_codigo, left(v_nombre, 120), v_desc, 95, false, v_medida, v_tel, v_color);

    -- La matriz: el nivel más alto de cada módulo entre sus roles.
    insert into public.rol_permisos (rol, modulo, nivel)
    select v_codigo, rp.modulo,
           (array_agg(rp.nivel order by private.rango_nivel(rp.nivel) desc nulls last))[1]
      from public.rol_permisos rp
     where rp.rol = any(g.roles)
     group by rp.modulo;

    insert into public.rol_permisos_por_defecto (rol, modulo, nivel)
    select rol, modulo, nivel from public.rol_permisos where rol = v_codigo
    on conflict (rol, modulo) do nothing;

    -- Las casillas.
    if v_medida then
      -- Detallado: la lista exacta de lo que podía hacer.
      insert into public.rol_acciones (rol, accion)
      select v_codigo, s.accion
        from (
          select c.accion from _ru_casillas c where c.id = g.usuarios[1]
          union
          select e.accion from _ru_extendido e where e.id = g.persona
          union
          -- Vehículos y choferes: hoy también los abre la escritura en
          -- Maquinaria o en Despachos. En un rol detallado sin la casilla se
          -- cerrarían.
          select a.codigo
            from public.acciones a
           where a.codigo in ('DESPACHOS.ASIGNAR_CHOFER', 'DESPACHOS.EDITAR_VEHICULO')
             and exists (select 1 from public.rol_permisos rp
                          where rp.rol = v_codigo and rp.modulo in ('MAQUINARIA', 'DESPACHOS')
                            and private.rango_nivel(rp.nivel) >= private.rango_nivel('ESCRITURA'))
        ) s
       where not exists (select 1 from _ru_restringido r where r.id = g.persona and r.accion = s.accion)
      on conflict (rol, accion) do nothing;
    else
      -- Por módulo entero: las casillas de sus roles, y lo extendido. Lo que
      -- abre el nivel lo sigue abriendo el nivel.
      insert into public.rol_acciones (rol, accion)
      select v_codigo, ra.accion from public.rol_acciones ra where ra.rol = any(g.roles)
      union
      select v_codigo, e.accion from _ru_extendido e where e.id = g.persona
      on conflict (rol, accion) do nothing;
    end if;

    insert into public.rol_incluye (rol, incluye)
    select v_codigo, x from unnest(g.roles) as x
    on conflict do nothing;

    delete from public.usuarios_roles where usuario_id = any(g.usuarios);
    insert into public.usuarios_roles (usuario_id, rol)
    select x, v_codigo from unnest(g.usuarios) as x;
  end loop;
end
$un_rol$;

alter table public.usuarios_roles
  add constraint usuarios_roles_un_rol_por_usuario unique (usuario_id);

comment on constraint usuarios_roles_un_rol_por_usuario on public.usuarios_roles is
  'Un usuario tiene un solo rol (la dueña, 09/11/2026). Sus permisos son la matriz de ese rol.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Los roles de quien actúa: el suyo y los que ese incluye
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function private.roles_actuales()
returns text[]
language sql
stable
security definer
set search_path = ''
as $function$
  -- Su rol, y aquellos a los que equivale. Es lo que leen `tiene_rol`,
  -- `exigir_rol`, `mis_roles` y las políticas: un rol «Compras + Almacén»
  -- sigue contando como Compras y como Almacén.
  select coalesce(array_agg(distinct x.rol), '{}'::text[])
    from public.usuarios_roles ur
    join public.perfiles p on p.id = ur.usuario_id
    cross join lateral (
      select ur.rol
      union all
      select ri.incluye from public.rol_incluye ri where ri.rol = ur.rol
    ) as x(rol)
   where ur.usuario_id = (select auth.uid())
     and p.activo;
$function$;

create or replace function private.tiene_rol(variadic p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
      from unnest(private.roles_actuales()) as r(rol)
     where r.rol = any(p_roles) or r.rol = 'ADMIN'
  );
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Poder una acción: solo la matriz del rol
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function private.puede_accion_propia(p_accion text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  /*
    Administrador, casilla marcada en su rol, o el nivel del módulo en un rol
    que no sea detallado. Nada por persona (09/11/2026).
  */
  select private.tiene_rol('ADMIN')
      or exists (
           select 1
             from public.usuarios_roles ur
             join public.perfiles p on p.id = ur.usuario_id
             join public.rol_acciones ra on ra.rol = ur.rol
            where ur.usuario_id = (select auth.uid())
              and p.activo
              and ra.accion = p_accion)
      or exists (
           select 1
             from public.usuarios_roles ur
             join public.perfiles     p  on p.id = ur.usuario_id
             join public.roles        r  on r.codigo = ur.rol
             join public.acciones     a  on a.codigo = p_accion
             join public.rol_permisos rp on rp.rol = ur.rol and rp.modulo = a.modulo
            where ur.usuario_id = (select auth.uid())
              and p.activo
              and not r.a_la_medida
              and a.nivel_equivalente is not null
              and private.rango_nivel(rp.nivel) >= private.rango_nivel(a.nivel_equivalente));
$function$;

create or replace function private.puede_accion(p_accion text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  -- Ya no hay nada prestado: lo que se puede es lo que da la matriz del rol.
  select private.puede_accion_propia(p_accion);
$function$;

create or replace function private.accion_quitada(p_accion text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  /*
    ¿SU ROL DETALLADO NO TIENE ESTA CASILLA?

    Reemplaza a la restricción por persona. En un rol detallado manda la
    casilla: lo que no tiene marcado no lo hace por ningún camino, tampoco por
    el nivel de otro módulo (vehículos por Maquinaria) ni por responder por el
    sitio (viajes). En un rol por módulo entero, nunca: ahí decide el nivel.

    Una casilla apagada no se puede marcar en la matriz, así que no frena.
    El administrador pasa siempre.
  */
  select not private.tiene_rol('ADMIN')
     and exists (select 1 from public.acciones a where a.codigo = p_accion and a.activa)
     and exists (
           select 1
             from public.usuarios_roles ur
             join public.perfiles p on p.id = ur.usuario_id
             join public.roles r on r.codigo = ur.rol
            where ur.usuario_id = (select auth.uid())
              and p.activo
              and r.a_la_medida
              and not exists (select 1 from public.rol_acciones ra
                               where ra.rol = ur.rol and ra.accion = p_accion));
$function$;

revoke all on function private.accion_quitada(text) from public, anon;

-- Lo que se registraba como «bajo autorización de» ya no existe: nadie aprueba
-- con un permiso prestado. Se queda la función para quien la llama.
create or replace function private.autoriza_delegacion(p_accion text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select null::uuid;
$function$;

create or replace function public.mis_acciones()
returns setof text
language sql
stable
security definer
set search_path = ''
as $function$
  with
  yo as (
    select (select auth.uid()) as uid
  ),

  -- El administrador pasa por todo. Se pregunta una vez.
  adm as (
    select private.tiene_rol('ADMIN') as es
  ),

  -- Su rol, si el perfil está activo.
  mis as (
    select ur.rol
      from public.usuarios_roles ur
      join public.perfiles p on p.id = ur.usuario_id, yo
     where ur.usuario_id = yo.uid
       and p.activo
  ),

  -- Por casilla marcada en su rol.
  casilla as (
    select ra.accion
      from public.rol_acciones ra
      join mis m on m.rol = ra.rol
  ),

  -- Por el nivel del módulo, y solo en roles que no sean detallados.
  nivel as (
    select a.codigo as accion
      from public.acciones a
      join public.rol_permisos rp on rp.modulo = a.modulo
      join mis m                   on m.rol = rp.rol
      join public.roles r          on r.codigo = rp.rol
     where not r.a_la_medida
       and a.nivel_equivalente is not null
       and private.rango_nivel(rp.nivel) >= private.rango_nivel(a.nivel_equivalente)
  )

  select a.codigo
    from public.acciones a, adm
   where a.activa
     and (adm.es
          or a.codigo in (select accion from casilla)
          or a.codigo in (select accion from nivel));
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Quién aprueba salidas y viajes, sin restricciones por persona
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function private.como_aprueba_salida(p_almacen bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  -- Quien responde por el almacén, o quien esté en la lista de autorizados
  -- (o sea administrador).
  select case
    when private.responde_por(p_almacen) then 'RESPONSABLE'
    when private.es_aprobador_de_salidas() then 'RESPALDO'
  end
$function$;

create or replace function public.como_apruebo_salidas()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelva a entrar.' using errcode = '28000';
  end if;

  -- Lo mismo que decide `private.como_aprueba_salida`, dicho a la pantalla.
  return jsonb_build_object(
    'yo', (select auth.uid()),
    'respaldo', private.es_aprobador_de_salidas(),
    'sitios', coalesce(
      (select jsonb_agg(a.id order by a.id)
         from public.almacenes a
         join public.empleados e on e.id = a.responsable_id
         join public.perfiles p on p.id = e.perfil_id
        where e.perfil_id = (select auth.uid()) and e.activo and p.activo),
      '[]'::jsonb));
end;
$function$;

-- Las demás que preguntaban por la restricción pasan a preguntar a la matriz.
-- Se reescriben desde lo que corre, con el mismo cuerpo y su mensaje al día.
do $parche$
declare
  f     record;
  v_def text;
begin
  for f in
    select p.oid, n.nspname || '.' || p.proname as nombre
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
       and p.proname <> 'accion_restringida'
       and p.prosrc like '%accion_restringida(%'
  loop
    v_def := pg_get_functiondef(f.oid);
    v_def := replace(v_def, 'private.accion_restringida(', 'private.accion_quitada(');
    v_def := replace(v_def, ': editar el catálogo se le restringió.',
                            ': su rol no tiene marcado «editar el catálogo».');
    v_def := replace(v_def, ': aprobar salidas se le restringió.',
                            ': su rol no tiene marcado «aprobar salidas».');
    v_def := replace(v_def, ': se le restringió.', ': su rol no lo tiene marcado.');
    execute v_def;
  end loop;
end
$parche$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Asignar UN rol
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.asignar_roles(uuid, text[]);

create or replace function public.asignar_rol(p_usuario_id uuid, p_rol text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.exigir_rol('ADMIN');

  if p_rol is null or not exists (select 1 from public.roles where codigo = p_rol) then
    raise exception 'No existe el rol "%".', coalesce(p_rol, '') using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.perfiles where id = p_usuario_id) then
    raise exception 'No existe ese usuario.' using errcode = 'P0002';
  end if;

  -- Quitarse a uno mismo el ADMIN siendo el único deja el sistema cerrado.
  if p_rol <> 'ADMIN'
     and exists (select 1 from public.usuarios_roles where usuario_id = p_usuario_id and rol = 'ADMIN')
     and private.admins_activos_sin(p_usuario_id) = 0 then
    raise exception 'Es el único administrador activo. Nombre otro antes de cambiarle el rol.'
      using errcode = '42501';
  end if;

  delete from public.usuarios_roles where usuario_id = p_usuario_id and rol <> p_rol;

  insert into public.usuarios_roles (usuario_id, rol)
  values (p_usuario_id, p_rol)
  on conflict do nothing;
end;
$function$;

create or replace function public.crear_usuario_sistema(
  p_usuario text,
  p_clave text,
  p_nombre text,
  p_cargo text default null,
  p_cedula text default null,
  p_telefono text default null,
  p_roles text[] default array['BASICO']
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_usuario text := lower(trim(p_usuario));
  v_correo  text;
  v_id      uuid;
begin
  perform private.exigir_rol('ADMIN');

  if v_usuario !~ '^[a-z0-9._-]{3,32}$' then
    raise exception 'El usuario "%" no es válido: de 3 a 32 caracteres, solo letras, números, punto, guion y guion bajo.', p_usuario
      using errcode = '22023';
  end if;

  if p_clave is null or length(p_clave) < 8 then
    raise exception 'La clave debe tener al menos 8 caracteres.' using errcode = '22023';
  end if;

  -- Un usuario, un rol (09/11/2026).
  if coalesce(array_length(p_roles, 1), 0) <> 1 then
    raise exception 'Un usuario tiene un solo rol. Elija uno.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.roles where codigo = p_roles[1]) then
    raise exception 'No existe el rol "%".', p_roles[1] using errcode = 'P0002';
  end if;

  v_correo := v_usuario || '@lacantera.local';

  if exists (select 1 from auth.users where email = v_correo) then
    raise exception 'El usuario "%" ya existe.', v_usuario using errcode = '23505';
  end if;

  v_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_id, 'authenticated', 'authenticated', v_correo,
    extensions.crypt(p_clave, extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('usuario', v_usuario, 'nombre', p_nombre),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_correo, 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.perfiles (id, usuario, nombre, cargo, cedula, telefono, debe_cambiar_clave)
  values (v_id, v_usuario, p_nombre, p_cargo, p_cedula,
          nullif(btrim(coalesce(p_telefono, '')), ''), true);

  insert into public.usuarios_roles (usuario_id, rol) values (v_id, p_roles[1]);

  return v_id;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Vuelan los permisos extendidos y restringidos
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.autorizar_varias(uuid, text[], text, date, date);
drop function if exists public.autorizar_accion(uuid, text, text, date, date);
drop function if exists public.retirar_autorizacion(bigint, text);
drop function if exists public.autorizaciones_del_sistema();
drop function if exists public.mis_autorizaciones();
drop function if exists public.restringir_varias(uuid, text[], text, date, date);
drop function if exists public.restringir_accion(uuid, text, text, date, date);
drop function if exists public.levantar_restriccion(bigint, text);
drop function if exists public.restricciones_del_sistema();
drop function if exists public.acciones_restringibles();
drop function if exists private.acciones_que_la_base_pregunta();
drop function if exists private.accion_restringida(text);

-- Las tablas quedan como historia: nadie las lee ni las escribe.
revoke all on public.autorizaciones from anon, authenticated;
revoke all on public.restricciones from anon, authenticated;

comment on table public.autorizaciones is
  'Historia: los permisos extendidos por persona, hasta el 09/11/2026. Desde entonces todo sale de la matriz del rol y nada lee esta tabla.';
comment on table public.restricciones is
  'Historia: los permisos restringidos por persona, hasta el 09/11/2026. Desde entonces todo sale de la matriz del rol y nada lee esta tabla.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Permisos de las funciones
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on function private.roles_actuales() from public, anon;
revoke all on function private.tiene_rol(text[]) from public, anon;
revoke all on function private.puede_accion_propia(text) from public, anon;
revoke all on function private.puede_accion(text) from public, anon;
revoke all on function private.autoriza_delegacion(text) from public, anon;
revoke all on function private.como_aprueba_salida(bigint) from public, anon;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.mis_acciones()',
    'public.como_apruebo_salidas()',
    'public.asignar_rol(uuid, text)',
    'public.crear_usuario_sistema(text, text, text, text, text, text, text[])'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Comprobación (solo lectura)
-- ═══════════════════════════════════════════════════════════════════════════

do $ver$
declare
  v_txt text;
  v_n   integer;
begin
  -- Un rol por usuario, y todo usuario activo con uno.
  select count(*) into v_n
    from (select usuario_id from public.usuarios_roles group by usuario_id having count(*) > 1) x;
  if v_n > 0 then
    raise exception 'Quedaron % usuarios con más de un rol.', v_n;
  end if;

  select string_agg(p.usuario, ', ') into v_txt
    from public.perfiles p
   where p.activo
     and exists (select 1 from public.usuarios_roles_antes_del_rol_unico a where a.usuario_id = p.id)
     and not exists (select 1 from public.usuarios_roles ur where ur.usuario_id = p.id);
  if v_txt is not null then
    raise exception 'Quedaron sin rol: %.', v_txt;
  end if;

  -- Quien era administrador lo sigue siendo, y nadie más lo es.
  select string_agg(p.usuario, ', ') into v_txt
    from public.perfiles p
   where exists (select 1 from public.usuarios_roles_antes_del_rol_unico a
                  where a.usuario_id = p.id and a.rol = 'ADMIN')
         <> exists (select 1 from public.usuarios_roles ur
                     where ur.usuario_id = p.id and ur.rol = 'ADMIN');
  if v_txt is not null then
    raise exception 'Cambió quién es administrador: %.', v_txt;
  end if;

  -- Ninguna función lee ya lo extendido ni lo restringido.
  select string_agg(n.nspname || '.' || p.proname, ', ') into v_txt
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and (p.prosrc ~ 'public\.(autorizaciones|restricciones)\M'
          or p.prosrc like '%accion_restringida%'
          or p.prosrc like '%acciones_que_la_base_pregunta%');
  if v_txt is not null then
    raise exception 'Todavía leen lo extendido o lo restringido: %.', v_txt;
  end if;

  select string_agg(v.viewname, ', ') into v_txt
    from pg_catalog.pg_views v
   where v.schemaname = 'public'
     and v.definition ~ '(autorizaciones|restricciones)\M';
  if v_txt is not null then
    raise exception 'Vistas que todavía leen lo extendido o lo restringido: %.', v_txt;
  end if;

  if to_regprocedure('public.autorizar_accion(uuid, text, text, date, date)') is not null
     or to_regprocedure('public.restringir_accion(uuid, text, text, date, date)') is not null
     or to_regprocedure('public.asignar_roles(uuid, text[])') is not null then
    raise exception 'Quedaron funciones de escritura de lo extendido, lo restringido o los varios roles.';
  end if;

  -- Cada rol nuevo llega, en cada módulo, a lo que llegaba el más alto de los suyos.
  select string_agg(ri.rol || '/' || rp.modulo, ', ') into v_txt
    from public.rol_incluye ri
    join public.rol_permisos rp on rp.rol = ri.incluye
   where private.rango_nivel(rp.nivel) > coalesce(
           (select private.rango_nivel(x.nivel) from public.rol_permisos x
             where x.rol = ri.rol and x.modulo = rp.modulo), 0);
  if v_txt is not null then
    raise exception 'Un rol nuevo quedó por debajo de uno de los suyos en: %.', v_txt;
  end if;

  /*
    El mismo acceso efectivo, persona por persona (no administradores, activos):

      antes   = casillas y niveles de sus roles + lo extendido − lo restringido
      después = casillas y niveles de su único rol

    No puede faltar nada de antes. Lo único que puede sobrar son «asignar
    chofer» y «editar vehículo» en un rol detallado, que hoy ya hacía por su
    escritura en Maquinaria o Despachos.
  */
  with
  antes_roles as (
    select a.usuario_id, array_agg(a.rol) as roles
      from public.usuarios_roles_antes_del_rol_unico a
      join public.perfiles p on p.id = a.usuario_id
     where p.activo
     group by a.usuario_id
    having not ('ADMIN' = any(array_agg(a.rol)))
  ),
  antes as (
    select u.usuario_id, s.accion
      from antes_roles u
      cross join lateral (
        select ra.accion from public.rol_acciones ra
         where ra.rol = any(u.roles)
        union
        select ac.codigo
          from public.rol_permisos rp
          join public.roles r on r.codigo = rp.rol
          join public.acciones ac on ac.modulo = rp.modulo
         where rp.rol = any(u.roles)
           and not r.a_la_medida
           and ac.nivel_equivalente is not null
           and private.rango_nivel(rp.nivel) >= private.rango_nivel(ac.nivel_equivalente)
        union
        select d.accion from public.autorizaciones d
         where d.a_usuario = u.usuario_id and d.revocada_en is null
           and d.desde <= current_date and (d.hasta is null or d.hasta >= current_date)
      ) s
     where not exists (select 1 from public.restricciones rs
                        where rs.a_usuario = u.usuario_id and rs.accion = s.accion
                          and rs.levantada_en is null and rs.desde <= current_date
                          and (rs.hasta is null or rs.hasta >= current_date))
  ),
  despues as (
    select u.usuario_id, s.accion
      from antes_roles u
      join public.usuarios_roles ur on ur.usuario_id = u.usuario_id
      cross join lateral (
        select ra.accion from public.rol_acciones ra where ra.rol = ur.rol
        union
        select ac.codigo
          from public.rol_permisos rp
          join public.roles r on r.codigo = rp.rol
          join public.acciones ac on ac.modulo = rp.modulo
         where rp.rol = ur.rol
           and not r.a_la_medida
           and ac.nivel_equivalente is not null
           and private.rango_nivel(rp.nivel) >= private.rango_nivel(ac.nivel_equivalente)
      ) s
  )
  select string_agg(x, '; ') into v_txt
    from (
      select 'pierde ' || p.usuario || ': ' || a.accion as x
        from antes a join public.perfiles p on p.id = a.usuario_id
       where not exists (select 1 from despues d where d.usuario_id = a.usuario_id and d.accion = a.accion)
      union all
      select 'gana ' || p.usuario || ': ' || d.accion
        from despues d join public.perfiles p on p.id = d.usuario_id
       where not exists (select 1 from antes a where a.usuario_id = d.usuario_id and a.accion = d.accion)
         and d.accion not in ('DESPACHOS.ASIGNAR_CHOFER', 'DESPACHOS.EDITAR_VEHICULO')
    ) y;
  if v_txt is not null then
    raise exception 'Cambió el acceso efectivo: %.', v_txt;
  end if;
end
$ver$;
