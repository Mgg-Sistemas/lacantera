/*
  PERMISOS RESTRINGIDOS, Y LAS APROBACIONES POR SU CASILLA

  Christopher, 16/09/2026, al repartir quién aprueba salidas, órdenes de compra y
  ventas: hay quien puede solicitarlas sin poder aprobarlas, y eso «se debe
  manejar tal como se intenta, mediante permisos». Enseguida: «así como hay
  permisos extendidos, deberían haber permisos reducidos o revocados».

  1. PERMISOS RESTRINGIDOS. Lo contrario de extender: a una persona concreta se le
     quita una casilla que su rol le daría, con la razón escrita, por un tiempo o
     sin fecha de fin. Manda sobre el rol y sobre lo extendido, y se levanta a la
     vista, con otra razón.

     Solo se restringe lo que la base pregunta por su nombre. La mayoría de las
     casillas todavía se decide por el nivel del módulo que da el rol, y ahí
     restringir escondería el botón sin frenar a la función: quien la puso creería
     que está puesta. Esas se quitan cambiando el rol.

     Al administrador no se le restringe nada, por la misma razón por la que
     `tiene_permiso` lo deja pasar siempre: es quien vuelve a abrir lo que se
     cierre.

  2. APROBAR UNA SALIDA TIENE CASILLA. Aprobaba quien responde por el almacén o, de
     respaldo, la gerencia por su rol, y no había manera de prestárselo a alguien
     más ni de quitárselo a nadie. Ahora es «Aprobar las solicitudes de salida»: la
     gerencia la trae por su rol, se extiende a quien haga falta, y a quien se le
     restringe no aprueba por ningún camino, tampoco por responder por el almacén.
     Los traslados siguen como estaban.

  3. DEVOLVER UN PEDIDO A COMPRAS VA POR SU CASILLA. La función pedía el rol de
     gerente general, y la pantalla enseñaba el botón a quien tuviera la casilla de
     aprobar: quien aprobaba con un permiso extendido veía «Devolver a compras» y
     la base le decía que no.

  4. APROBAR VIAJES RESPETA LA RESTRICCIÓN. Ya iba por casilla, pero el rol de
     gerente y ser responsable del sitio pasaban por encima.

  5. UN ROL QUE VENDE. El rol «Ventas» no vende, a propósito (8/09/2026). Vender es
     ahora un rol propio, «Vende y factura», para dárselo a quien la gerencia
     decida sin tener que hacerlo administrador.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Las restricciones
-- ═══════════════════════════════════════════════════════════════════════════

create table public.restricciones (
  id               bigint generated always as identity primary key,
  accion           text not null references public.acciones(codigo) on delete cascade,
  a_usuario        uuid not null references public.perfiles(id),
  por_usuario      uuid not null references public.perfiles(id),
  desde            date not null default current_date,
  hasta            date,
  motivo           text not null,
  levantada_en     timestamptz,
  levantada_por    uuid references public.perfiles(id),
  levantada_motivo text,
  creada_en        timestamptz not null default now(),
  constraint restricciones_fechas check (hasta is null or hasta >= desde),
  constraint restricciones_motivo check (length(btrim(motivo)) >= 5),
  constraint restricciones_no_a_si_mismo check (a_usuario <> por_usuario)
);

comment on table public.restricciones is
  'Lo que se le quita a una persona concreta aunque su rol se lo dé: la casilla, quién la restringió, desde cuándo, hasta cuándo y por qué. Lo contrario de autorizaciones. Manda sobre el rol y sobre lo extendido; no se le pone al administrador.';

create index restricciones_vigentes_idx on public.restricciones (a_usuario, accion)
  where levantada_en is null;

alter table public.restricciones enable row level security;

-- Las ven quienes las ponen y la persona a quien se le pusieron. A diferencia
-- de lo extendido, la razón de una restricción puede decir algo de alguien que
-- no hace falta que lea toda la empresa.
create policy restricciones_lectura on public.restricciones for select to authenticated
  using (a_usuario = (select auth.uid())
         or (select public.mis_roles()) && array['ADMIN', 'GERENTE_GENERAL']);

revoke all on public.restricciones from anon;
revoke insert, update, delete, truncate, references, trigger on public.restricciones from authenticated;

create trigger trg_auditar after insert or delete or update on public.restricciones
  for each row execute function private.auditar('id');

create trigger trg_normalizar before insert or update on public.restricciones
  for each row execute function private.normalizar_texto('motivo', 'levantada_motivo');

insert into public.auditoria_modulos (tabla, modulo) values ('restricciones', 'USUARIOS');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. ¿Está restringida? ¿Qué casillas se pueden restringir?
-- ═══════════════════════════════════════════════════════════════════════════

create function private.accion_restringida(p_accion text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $func$
  /*
    ¿LE QUITARON ESTA CASILLA A QUIEN ESTÁ ACTUANDO?

    El administrador pasa siempre. `restringir_accion` ya no deja ponérsela, y
    esto cubre a quien tuviera una de antes y después recibiera el rol.
  */
  select not private.tiene_rol('ADMIN')
     and exists (
           select 1
             from public.restricciones r
            where r.a_usuario = (select auth.uid())
              and r.accion = p_accion
              and r.levantada_en is null
              and r.desde <= current_date
              and (r.hasta is null or r.hasta >= current_date));
$func$;

revoke all on function private.accion_restringida(text) from public, anon;

create function private.acciones_que_la_base_pregunta()
returns setof text
language sql
stable
security definer
set search_path to ''
as $func$
  /*
    LAS CASILLAS QUE LA BASE PREGUNTA POR SU NOMBRE: en una función con
    `exigir_accion` o `puede_accion`, en una vista o en una política.

    Solo esas se pueden restringir. Las demás se deciden por el nivel del módulo
    que da el rol, y restringirlas escondería el botón sin frenar a la función.

    Se lee de lo que corre y no de una lista a mano: una lista se queda vieja el
    día que una función pasa a preguntar por su casilla y nadie lo apunta.
  */
  select distinct m[1]
    from (
      select p.prosrc as texto
        from pg_catalog.pg_proc p
       where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
      union all
      select v.definition
        from pg_catalog.pg_views v
       where v.schemaname = 'public'
      union all
      select concat_ws(' ', po.qual, po.with_check)
        from pg_catalog.pg_policies po
       where po.schemaname = 'public'
    ) as f
    cross join lateral regexp_matches(
      f.texto, '(?:exigir_accion|puede_accion(?:_propia)?)\(\s*''([A-Z_]+\.[A-Z_]+)''', 'g') as m;
$func$;

revoke all on function private.acciones_que_la_base_pregunta() from public, anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Poder una casilla mira la restricción
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function private.puede_accion_propia(p_accion text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $func$
  /*
    Por derecho propio: administrador, casilla marcada en un rol, o el nivel del
    módulo en un rol que no sea a la medida. Y en los dos últimos casos, que no
    se la hayan restringido a la persona: quien la tiene restringida tampoco la
    presta.
  */
  select private.tiene_rol('ADMIN')

     or (not private.accion_restringida(p_accion)
         and (
              exists (
                select 1
                  from public.usuarios_roles ur
                  join public.perfiles p on p.id = ur.usuario_id
                  join public.rol_acciones ra on ra.rol = ur.rol
                 where ur.usuario_id = (select auth.uid())
                   and p.activo
                   and ra.accion = p_accion
              )

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
                   and private.rango_nivel(rp.nivel) >= private.rango_nivel(a.nivel_equivalente)
              )));
$func$;

create or replace function private.puede_accion(p_accion text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $func$
  /*
    Lo propio o lo extendido. Lo propio ya mira la restricción; lo extendido la
    vuelve a mirar, porque una restricción manda también sobre lo prestado.
  */
  select private.puede_accion_propia(p_accion)
      or (not private.accion_restringida(p_accion)
          and exists (
                select 1
                  from public.autorizaciones d
                  join public.perfiles p on p.id = d.a_usuario
                 where d.a_usuario = (select auth.uid())
                   and d.accion = p_accion
                   and d.revocada_en is null
                   and p.activo
                   and d.desde <= current_date
                   and (d.hasta is null or d.hasta >= current_date)));
$func$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Restringir, levantar, y verlas
-- ═══════════════════════════════════════════════════════════════════════════

create function public.restringir_accion(
  p_usuario_id uuid,
  p_accion     text,
  p_motivo     text,
  p_desde      date default null,
  p_hasta      date default null)
returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_yo     uuid := (select auth.uid());
  v_desde  date := coalesce(p_desde, current_date);
  v_nombre text;
  v_accion public.acciones;
  v_id     bigint;
begin
  -- Los mismos que extienden: administración y la gerencia.
  perform private.exigir_rol('ADMIN', 'GERENTE_GENERAL');

  select * into v_accion from public.acciones where codigo = p_accion;

  if v_accion.codigo is null then
    raise exception 'No existe la acción «%».', p_accion using errcode = 'P0002';
  end if;

  if not v_accion.activa then
    raise exception 'La casilla «%» está apagada: no la tiene nadie.', v_accion.nombre
      using errcode = '55000';
  end if;

  /*
    Una restricción que no frena es peor que ninguna: quien la puso cree que está
    puesta. Si la base no pregunta por esta casilla, la decide el nivel del
    módulo en el rol, y ahí se quita cambiando el rol.
  */
  if not exists (select 1 from private.acciones_que_la_base_pregunta() as c where c = p_accion) then
    raise exception '«%» todavía la decide el nivel que el rol da en el módulo, no la casilla: restringirla no la frenaría. Para quitársela, cámbiale el rol.', v_accion.nombre
      using errcode = '55000';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe por qué se le restringe. Dentro de un mes es lo único que va a explicar por qué esta persona no pudo hacerlo.'
      using errcode = '22023';
  end if;

  select nombre into v_nombre from public.perfiles where id = p_usuario_id and activo;
  if v_nombre is null then
    raise exception 'No existe esa persona, o está desactivada.' using errcode = 'P0002';
  end if;

  if p_usuario_id = v_yo then
    raise exception 'No puedes restringirte permisos a ti mismo.' using errcode = '42501';
  end if;

  if exists (select 1 from public.usuarios_roles where usuario_id = p_usuario_id and rol = 'ADMIN') then
    raise exception '% es administrador del sistema, y al administrador no se le restringe nada. Si no debe poder «%», quítale ese rol.', v_nombre, v_accion.nombre
      using errcode = '42501';
  end if;

  if p_hasta is not null and p_hasta < v_desde then
    raise exception 'La fecha de fin no puede ser anterior a la de inicio.' using errcode = '22023';
  end if;

  -- Lo extendido de esa misma casilla se retira en el mismo paso: restringir es
  -- la decisión más nueva, y dejar las dos vivas no diría cuál manda.
  update public.autorizaciones
     set revocada_en = now(), revocada_por = v_yo,
         revocada_motivo = 'Se le restringió: ' || btrim(p_motivo)
   where a_usuario = p_usuario_id and accion = p_accion and revocada_en is null;

  update public.restricciones
     set levantada_en = now(), levantada_por = v_yo,
         levantada_motivo = 'Sustituida por una nueva'
   where a_usuario = p_usuario_id and accion = p_accion and levantada_en is null;

  insert into public.restricciones (accion, a_usuario, por_usuario, desde, hasta, motivo)
  values (p_accion, p_usuario_id, v_yo, v_desde, p_hasta, btrim(p_motivo))
  returning id into v_id;

  return v_id;
end;
$func$;

revoke all on function public.restringir_accion(uuid, text, text, date, date) from public, anon;
grant execute on function public.restringir_accion(uuid, text, text, date, date) to authenticated, service_role;

create function public.restringir_varias(
  p_usuario_id uuid,
  p_acciones   text[],
  p_motivo     text,
  p_desde      date default null,
  p_hasta      date default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_accion   text;
  v_hechas   integer := 0;
  v_omitidas jsonb := '[]'::jsonb;
  v_nombre   text;
begin
  perform private.exigir_rol('ADMIN', 'GERENTE_GENERAL');

  if p_acciones is null or array_length(p_acciones, 1) is null then
    raise exception 'No elegiste ninguna casilla que restringir.' using errcode = '22023';
  end if;

  -- Como `autorizar_varias`: cada una en su bloque, que abre una subtransacción,
  -- para que la que no entra no tumbe a las demás; y `restringir_accion` entera,
  -- sin copiar sus comprobaciones.
  foreach v_accion in array p_acciones loop
    begin
      perform public.restringir_accion(p_usuario_id, v_accion, p_motivo, p_desde, p_hasta);
      v_hechas := v_hechas + 1;
    exception
      when others then
        select nombre into v_nombre from public.acciones where codigo = v_accion;
        v_omitidas := v_omitidas || jsonb_build_object(
          'accion', coalesce(v_nombre, v_accion),
          'motivo', sqlerrm);
    end;
  end loop;

  if v_hechas = 0 then
    raise exception 'No se restringió ninguna. %',
      (select string_agg(x->>'accion' || ': ' || (x->>'motivo'), ' · ')
         from jsonb_array_elements(v_omitidas) x)
      using errcode = '55000';
  end if;

  return jsonb_build_object('restringidas', v_hechas, 'omitidas', v_omitidas);
end;
$func$;

revoke all on function public.restringir_varias(uuid, text[], text, date, date) from public, anon;
grant execute on function public.restringir_varias(uuid, text[], text, date, date) to authenticated, service_role;

create function public.levantar_restriccion(p_id bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
begin
  perform private.exigir_rol('ADMIN', 'GERENTE_GENERAL');

  -- Se le quitó con una razón escrita; devolvérselo también la lleva.
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe por qué se levanta: se restringió con una razón, y devolverlo también la lleva.'
      using errcode = '22023';
  end if;

  if exists (select 1 from public.restricciones where id = p_id and a_usuario = (select auth.uid())) then
    raise exception 'No puedes levantarte una restricción a ti mismo: la levanta otra persona que las gestione.'
      using errcode = '42501';
  end if;

  update public.restricciones
     set levantada_en = now(),
         levantada_por = (select auth.uid()),
         levantada_motivo = btrim(p_motivo)
   where id = p_id and levantada_en is null;

  if not found then
    raise exception 'Esa restricción no existe o ya estaba levantada.' using errcode = 'P0002';
  end if;
end;
$func$;

revoke all on function public.levantar_restriccion(bigint, text) from public, anon;
grant execute on function public.levantar_restriccion(bigint, text) to authenticated, service_role;

create function public.restricciones_del_sistema()
returns table (
  id                 bigint,
  accion             text,
  accion_nombre      text,
  modulo             text,
  modulo_nombre      text,
  a_usuario          uuid,
  a_nombre           text,
  a_es_administrador boolean,
  por_usuario        uuid,
  por_nombre         text,
  desde              date,
  hasta              date,
  motivo             text,
  vigente            boolean,
  levantada_en       timestamptz,
  levantada_por      uuid,
  levantada_nombre   text,
  levantada_motivo   text,
  creada_en          timestamptz)
language sql
stable
security definer
set search_path to ''
as $func$
  -- Las mismas que deja leer la política: quien las gestiona, todas; los demás,
  -- las suyas.
  with f as (
    select r.*,
           exists (select 1 from public.usuarios_roles ur
                    where ur.usuario_id = r.a_usuario and ur.rol = 'ADMIN') as es_admin
      from public.restricciones r
     where (select auth.uid()) is not null
       and (private.tiene_rol('GERENTE_GENERAL') or r.a_usuario = (select auth.uid()))
  )
  select f.id, f.accion, a.nombre, a.modulo, m.nombre,
         f.a_usuario, pa.nombre, f.es_admin,
         f.por_usuario, pp.nombre,
         f.desde, f.hasta, f.motivo,
         f.levantada_en is null
           and f.desde <= current_date
           and (f.hasta is null or f.hasta >= current_date)
           and pa.activo
           and not f.es_admin,
         f.levantada_en, f.levantada_por, pl.nombre, f.levantada_motivo, f.creada_en
    from f
    join public.acciones a  on a.codigo = f.accion
    join public.modulos  m  on m.codigo = a.modulo
    join public.perfiles pa on pa.id = f.a_usuario
    join public.perfiles pp on pp.id = f.por_usuario
    left join public.perfiles pl on pl.id = f.levantada_por
   order by (f.levantada_en is null) desc, f.creada_en desc;
$func$;

revoke all on function public.restricciones_del_sistema() from public, anon;
grant execute on function public.restricciones_del_sistema() to authenticated, service_role;

create function public.acciones_restringibles()
returns setof text
language sql
stable
security definer
set search_path to ''
as $func$
  select a.codigo
    from public.acciones a
    join public.modulos m on m.codigo = a.modulo
   where a.activa
     and a.codigo in (select private.acciones_que_la_base_pregunta())
   order by m.orden, a.orden;
$func$;

revoke all on function public.acciones_restringibles() from public, anon;
grant execute on function public.acciones_restringibles() to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Aprobar una salida tiene casilla
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente, activa)
values ('SALIDAS.APROBAR_SOLICITUD', 'SALIDAS', 'Aprobar las solicitudes de salida',
        'Decide si lo que alguien solicitó puede salir del almacén: aprobarla, no aprobarla con su razón o cancelarla. No entrega ni descuenta nada; eso lo hace almacén al entregar. También aprueba quien responde por ese almacén, salvo que se le haya restringido. No la concede ningún nivel de módulo: hay que darla a mano o por permiso extendido.',
        10, null, true);

-- La gerencia aprobaba de respaldo por su rol, y lo sigue haciendo.
insert into public.rol_acciones (rol, accion) values ('GERENTE_GENERAL', 'SALIDAS.APROBAR_SOLICITUD');

create function private.como_aprueba_salida(p_almacen bigint)
returns text
language sql
stable
security definer
set search_path to ''
as $func$
  /*
    QUIÉN APRUEBA UNA SOLICITUD DE SALIDA, Y EN CALIDAD DE QUÉ.

    Quien responde por el almacén, como responsable; quien tenga la casilla, de
    respaldo. A quien se le restringió no aprueba por ningún camino: la
    restricción está para decir que esa persona solicita y no aprueba.

    Los traslados siguen con `como_actua_en`: aceptar uno no saca nada de la
    empresa.
  */
  select case
    when private.accion_restringida('SALIDAS.APROBAR_SOLICITUD') then null
    when private.responde_por(p_almacen) then 'RESPONSABLE'
    when private.puede_accion('SALIDAS.APROBAR_SOLICITUD') then 'RESPALDO'
  end
$func$;

revoke all on function private.como_aprueba_salida(bigint) from public, anon;

create function public.como_apruebo_salidas()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $func$
declare
  v_restringida boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelve a entrar.' using errcode = '28000';
  end if;

  v_restringida := private.accion_restringida('SALIDAS.APROBAR_SOLICITUD');

  -- Lo mismo que decide `private.como_aprueba_salida`, dicho a la pantalla para
  -- que no enseñe botones que van a fallar.
  return jsonb_build_object(
    'yo', (select auth.uid()),
    'respaldo', private.puede_accion('SALIDAS.APROBAR_SOLICITUD'),
    'restringida', v_restringida,
    'sitios', case when v_restringida then '[]'::jsonb else coalesce(
      (select jsonb_agg(a.id order by a.id)
         from public.almacenes a
         join public.empleados e on e.id = a.responsable_id
         join public.perfiles p on p.id = e.perfil_id
        where e.perfil_id = (select auth.uid()) and e.activo and p.activo),
      '[]'::jsonb) end);
end;
$func$;

revoke all on function public.como_apruebo_salidas() from public, anon;
grant execute on function public.como_apruebo_salidas() to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Los parches: salidas, devolver a compras, viajes, y extender lo restringido
-- ═══════════════════════════════════════════════════════════════════════════

do $parche$
declare
  v_def text;
  r     record;
begin
  for r in
    select * from (values
      (1, 'public.aprobar_solicitud_salida(bigint)',
       $a$  v_como := private.como_actua_en(v_s.almacen_id);$a$,
       $b$  -- A quien se le restringió no aprueba por ningún camino, tampoco por
  -- responder por el almacén.
  if private.accion_restringida('SALIDAS.APROBAR_SOLICITUD') then
    raise exception 'No puedes aprobar la solicitud %: aprobar salidas se te restringió. Solicitarlas sí puedes.', v_s.numero
      using errcode = '42501';
  end if;
  v_como := private.como_aprueba_salida(v_s.almacen_id);$b$),

      (2, 'public.aprobar_solicitud_salida(bigint)',
       $a$, o administración.',$a$,
       $b$, o quien tenga la casilla de aprobar salidas.',$b$),

      (3, 'public.rechazar_solicitud_salida(bigint, text)',
       $a$  if private.como_actua_en(v_s.almacen_id) is null then$a$,
       $b$  if private.accion_restringida('SALIDAS.APROBAR_SOLICITUD') then
    raise exception 'No puedes resolver la solicitud %: aprobar salidas se te restringió. Solicitarlas sí puedes.', v_s.numero
      using errcode = '42501';
  end if;
  if private.como_aprueba_salida(v_s.almacen_id) is null then$b$),

      (4, 'public.rechazar_solicitud_salida(bigint, text)',
       $a$, o administración.',$a$,
       $b$, o quien tenga la casilla de aprobar salidas.',$b$),

      (5, 'public.cancelar_solicitud_salida(bigint, text)',
       $a$     and private.como_actua_en(v_s.almacen_id) is null then
    raise exception 'La cancela quien la pidió, o quien responde por el almacén.'$a$,
       $b$     and private.como_aprueba_salida(v_s.almacen_id) is null then
    raise exception 'La cancela quien la pidió, o quien puede aprobarla.'$b$),

      (6, 'public.devolver_a_cotizacion(bigint, text)',
       $a$  perform private.exigir_rol('GERENTE_GENERAL');$a$,
       $b$  -- Por la casilla y no por el rol. Devolver es la otra cara de aprobar, y la
  -- pantalla lo ofrece a quien aprueba: con el rol, quien aprobaba con un
  -- permiso extendido veía el botón y la base le decía que no.
  perform private.exigir_accion('COMPRAS.DEVOLVER_A_COTIZACION');$b$),

      (7, 'private.como_aprueba_viaje(bigint, bigint)',
       $a$  select case
    when exists ($a$,
       $b$  select case
    when private.accion_restringida('EXPLOTACION.APROBAR_VIAJES') then null
    when exists ($b$),

      -- Entero y de una vez: partido en dos, el paso intermedio deja un `case`
      -- sin su `end` y la base no acepta la función a medias.
      (8, 'public.como_apruebo_viajes()',
       $a$    'todas', private.puede_accion('EXPLOTACION.APROBAR_VIAJES') or private.tiene_rol('GERENTE_GENERAL'),
    'sitios', coalesce(
      (select jsonb_agg(s.id order by s.id)
         from public.sitios_operacion s
         join public.empleados e on e.id = s.responsable_id
         join public.perfiles p on p.id = e.perfil_id
        where e.perfil_id = (select auth.uid()) and e.activo and p.activo),
      '[]'::jsonb));$a$,
       $b$    'todas', not private.accion_restringida('EXPLOTACION.APROBAR_VIAJES')
             and (private.puede_accion('EXPLOTACION.APROBAR_VIAJES') or private.tiene_rol('GERENTE_GENERAL')),
    'sitios', case when private.accion_restringida('EXPLOTACION.APROBAR_VIAJES') then '[]'::jsonb else coalesce(
      (select jsonb_agg(s.id order by s.id)
         from public.sitios_operacion s
         join public.empleados e on e.id = s.responsable_id
         join public.perfiles p on p.id = e.perfil_id
        where e.perfil_id = (select auth.uid()) and e.activo and p.activo),
      '[]'::jsonb) end);$b$),

      (9, 'public.autorizar_accion(uuid, text, text, date, date)',
       $a$  -- Si ya la tiene por derecho propio, esto no le añadiría nada y dejaría en el$a$,
       $b$  -- Extender lo que se le restringió dejaría dos filas que se contradicen, y
  -- nadie sabría cuál manda cuando haya que responder por lo firmado. Primero se
  -- levanta la restricción, a la vista.
  if exists (
    select 1 from public.restricciones rs
     where rs.a_usuario = p_usuario_id and rs.accion = p_accion and rs.levantada_en is null
       and daterange(rs.desde, rs.hasta, '[]') && daterange(v_desde, p_hasta, '[]')
  ) then
    raise exception 'A % se le restringió «%». Levanta la restricción antes de extendérsela.', v_nombre, v_accion.nombre
      using errcode = '55000';
  end if;

  -- Si ya la tiene por derecho propio, esto no le añadiría nada y dejaría en el$b$)
    ) as t(n, funcion, antes, despues)
    order by n
  loop
    v_def := pg_get_functiondef(r.funcion::regprocedure);
    if (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes) <> 1 then
      raise exception 'En % el texto «%» no aparece exactamente una vez.', r.funcion, r.antes;
    end if;
    execute replace(v_def, r.antes, r.despues);
  end loop;
end
$parche$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Un rol que vende
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.roles (codigo, nombre, descripcion, orden, sistema, a_la_medida)
values ('VENDE_Y_FACTURA', 'Vende y factura',
        'Cotiza, vende, factura, cobra y anula en Ventas y Facturación, con los precios y los montos a la vista. El rol Ventas, en cambio, no vende.',
        56, false, false);

insert into public.rol_permisos (rol, modulo, nivel)
select 'VENDE_Y_FACTURA', m.codigo,
       case m.codigo
         when 'VENTAS'      then 'TOTAL'
         when 'FACTURACION' then 'TOTAL'
         when 'INVENTARIO'  then 'LECTURA'
         when 'SALIDAS'     then 'LECTURA'
         when 'TASAS'       then 'LECTURA'
         when 'PANEL'       then 'LECTURA'
         else 'NINGUNO'
       end
  from public.modulos m;

-- Ver los montos no lo da ningún nivel: sin estas dos, las cotizaciones, notas y
-- facturas llegan con las cifras vacías. El tablero del mes no va: es de la
-- gerencia, no de quien vende.
insert into public.rol_acciones (rol, accion)
values ('VENDE_Y_FACTURA', 'VENTAS.VER_VENTAS'),
       ('VENDE_Y_FACTURA', 'FACTURACION.VER_FACTURACION'),
       ('VENDE_Y_FACTURA', 'TASAS.VER_TASAS');

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Comprobación
-- ═══════════════════════════════════════════════════════════════════════════

do $ver$
begin
  if not exists (select 1 from private.acciones_que_la_base_pregunta() c where c = 'SALIDAS.APROBAR_SOLICITUD') then
    raise exception 'aprobar salidas no quedó preguntada por su casilla';
  end if;
  if not exists (select 1 from private.acciones_que_la_base_pregunta() c where c = 'COMPRAS.DEVOLVER_A_COTIZACION') then
    raise exception 'devolver a compras no quedó preguntada por su casilla';
  end if;
  if position('como_aprueba_salida' in pg_get_functiondef('public.cancelar_solicitud_salida(bigint, text)'::regprocedure)) = 0 then
    raise exception 'cancelar una solicitud sigue decidiendo con como_actua_en';
  end if;
  if position('accion_restringida' in pg_get_functiondef('private.puede_accion(text)'::regprocedure)) = 0 then
    raise exception 'puede_accion no mira las restricciones';
  end if;
  if position('restricciones' in pg_get_functiondef('public.autorizar_accion(uuid, text, text, date, date)'::regprocedure)) = 0 then
    raise exception 'autorizar_accion deja extender lo restringido';
  end if;
  if not exists (select 1 from public.rol_permisos where rol = 'VENDE_Y_FACTURA' and modulo = 'VENTAS' and nivel = 'TOTAL') then
    raise exception 'el rol que vende no quedó con ventas';
  end if;
end
$ver$;
