/*
  ROLES Y PERMISOS COMO EN MGG

  Angélica, 06-07/11/2026: «todos los usuarios tendrán acceso a crear una
  solicitud de pedido, pero solo los que manejen compras harán el proceso de
  compras … trae la funcionalidad del módulo de roles y permisos de MGG …
  es por check con permisos para aprobar, con permisos en vistas de teléfono,
  para descargar la base de datos … los administradores por defecto tendrán
  los accesos y full control en todos los módulos … eso incluye poder aprobar
  órdenes de compra».

  Decidido con ella (07/11): se conservan los permisos extendidos y
  restringidos por persona, y cada usuario sigue pudiendo tener varios roles.
  Encima de eso entra lo de MGG:

  1. USUARIOS AUTORIZADOS PARA APROBAR (la lista de MGG). Una lista por
     persona: quién aprueba órdenes de compra y quién aprueba salidas, con su
     firma. El administrador aprueba siempre, sin estar en la lista. Reemplaza
     a `compras_aprobadores` (que queda como vista, para la pantalla) y a la
     casilla SALIDAS.APROBAR_SOLICITUD, que se apaga.
     Se carga con lo de hoy: Norbelis (compras y salidas) y Diana (salidas),
     que es quien aprueba salidas sin ser administradora.

  2. EL ADMINISTRADOR LLEGA A TODO: aprueba órdenes de compra y salidas, y
     descarga el respaldo (antes el respaldo pedía el rol RESPALDO aunque
     fuera administrador).

  3. CUALQUIER USUARIO ACTIVO CREA UNA SOLICITUD DE PEDIDO y ve las suyas.
     El resto de compras sigue siendo de quien tenga el módulo.

  4. EL ROL SOLICITANTE SE BORRA: ya no hace falta para pedir. Quien lo tenía
     pasa a BÁSICO, un rol nuevo que solo ve el panel (como el rol recién
     creado de MGG), para que nadie quede sin rol.

  5. CADA ROL: su color, «solo teléfono» desde la pantalla, la pantalla de
     teléfono de compras como casilla nueva, y «↺ Por defecto» con la matriz
     de hoy guardada.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Usuarios autorizados para aprobar
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.usuarios_autorizados (
  usuario_id      uuid primary key references public.perfiles(id) on delete cascade,
  aprobar_oc      boolean not null default false,
  aprobar_salidas boolean not null default false,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references public.perfiles(id),
  constraint usuarios_autorizados_algo check (aprobar_oc or aprobar_salidas)
);

comment on table public.usuarios_autorizados is
  'Quién aprueba órdenes de compra y quién aprueba salidas (Usuarios › Roles y permisos). El administrador aprueba siempre, sin estar aquí.';

alter table public.usuarios_autorizados enable row level security;

drop policy if exists usuarios_autorizados_lectura on public.usuarios_autorizados;
create policy usuarios_autorizados_lectura on public.usuarios_autorizados
  for select to authenticated using (true);

revoke all on public.usuarios_autorizados from anon, public;
grant select on public.usuarios_autorizados to authenticated;

-- Lo de hoy: Norbelis aprueba las órdenes (era `compras_aprobadores`) y las
-- salidas; Diana aprueba salidas (tenía la casilla por Gerente general).
insert into public.usuarios_autorizados (usuario_id, aprobar_oc, aprobar_salidas)
select a.usuario_id, true, true from public.compras_aprobadores a
on conflict (usuario_id) do update set aprobar_oc = true;

insert into public.usuarios_autorizados (usuario_id, aprobar_oc, aprobar_salidas)
select p.id, false, true
  from public.perfiles p
 where p.activo and p.archivado_en is null
   and not exists (select 1 from public.usuarios_roles ur where ur.usuario_id = p.id and ur.rol = 'ADMIN')
   and (exists (select 1 from public.usuarios_roles ur
                  join public.rol_acciones ra on ra.rol = ur.rol
                 where ur.usuario_id = p.id and ra.accion = 'SALIDAS.APROBAR_SOLICITUD')
        or exists (select 1 from public.autorizaciones a
                    where a.a_usuario = p.id and a.accion = 'SALIDAS.APROBAR_SOLICITUD'
                      and a.revocada_en is null and a.desde <= now()
                      and (a.hasta is null or a.hasta >= now())))
   and not exists (select 1 from public.restricciones r
                    where r.a_usuario = p.id and r.accion = 'SALIDAS.APROBAR_SOLICITUD'
                      and r.levantada_en is null and r.desde <= now()
                      and (r.hasta is null or r.hasta >= now()))
on conflict (usuario_id) do update set aprobar_salidas = true;

-- ¿Aprueba órdenes de compra? El administrador siempre.
create or replace function private.es_aprobador_de_compras()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.tiene_rol('ADMIN')
      or exists (select 1
                   from public.usuarios_autorizados a
                   join public.perfiles p on p.id = a.usuario_id
                  where a.usuario_id = (select auth.uid()) and a.aprobar_oc and p.activo);
$function$;

-- ¿Aprueba salidas? El administrador siempre.
create or replace function private.es_aprobador_de_salidas()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.tiene_rol('ADMIN')
      or exists (select 1
                   from public.usuarios_autorizados a
                   join public.perfiles p on p.id = a.usuario_id
                  where a.usuario_id = (select auth.uid()) and a.aprobar_salidas and p.activo);
$function$;

create or replace function private.exigir_aprobador_de_compras()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_quien text;
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelva a entrar.' using errcode = '28000';
  end if;

  if private.es_aprobador_de_compras() then
    return;
  end if;

  select string_agg(p.nombre, ', ' order by p.nombre) into v_quien
    from public.usuarios_autorizados a
    join public.perfiles p on p.id = a.usuario_id
   where a.aprobar_oc and p.activo;

  raise exception 'Las órdenes de compra las aprueba un administrador%. Se cambia en Usuarios › Roles y permisos.',
    coalesce(' o ' || v_quien, '')
    using errcode = '42501';
end;
$function$;

-- Quién aprueba una solicitud de salida: quien responde por el almacén, o
-- quien esté autorizado en la lista (o sea administrador). A quien se le
-- restringió no aprueba por ningún camino.
create or replace function private.como_aprueba_salida(p_almacen bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when private.accion_restringida('SALIDAS.APROBAR_SOLICITUD') then null
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
declare
  v_restringida boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelva a entrar.' using errcode = '28000';
  end if;

  v_restringida := private.accion_restringida('SALIDAS.APROBAR_SOLICITUD');

  -- Lo mismo que decide `private.como_aprueba_salida`, dicho a la pantalla.
  return jsonb_build_object(
    'yo', (select auth.uid()),
    'respaldo', (not v_restringida) and private.es_aprobador_de_salidas(),
    'restringida', v_restringida,
    'sitios', case when v_restringida then '[]'::jsonb else coalesce(
      (select jsonb_agg(a.id order by a.id)
         from public.almacenes a
         join public.empleados e on e.id = a.responsable_id
         join public.perfiles p on p.id = e.perfil_id
        where e.perfil_id = (select auth.uid()) and e.activo and p.activo),
      '[]'::jsonb) end);
end;
$function$;

-- La casilla vieja ya no decide: la lista manda. Se apaga para que no se
-- marque creyendo que hace algo.
update public.acciones set activa = false where codigo = 'SALIDAS.APROBAR_SOLICITUD';

-- `compras_aprobadores` queda como vista de la lista, para la pantalla.
drop table if exists public.compras_aprobadores;
create view public.compras_aprobadores
with (security_invoker = true) as
  select a.usuario_id, a.creado_en as desde, null::text as nota
    from public.usuarios_autorizados a
   where a.aprobar_oc;

revoke all on public.compras_aprobadores from anon, public;
grant select on public.compras_aprobadores to authenticated;

-- La lista, para la pantalla de roles: con nombre y si tiene firma.
create or replace function public.usuarios_autorizados_lista()
returns table (
  usuario_id uuid,
  nombre text,
  usuario text,
  activo boolean,
  aprobar_oc boolean,
  aprobar_salidas boolean,
  firma text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.exigir_permiso('USUARIOS', 'LECTURA');

  return query
  select a.usuario_id, p.nombre, p.usuario, p.activo, a.aprobar_oc, a.aprobar_salidas,
         (select f.imagen from public.firmas f where f.perfil_id = a.usuario_id)
    from public.usuarios_autorizados a
    join public.perfiles p on p.id = a.usuario_id
   order by p.nombre;
end;
$function$;

create or replace function public.guardar_usuario_autorizado(
  p_usuario uuid,
  p_aprobar_oc boolean,
  p_aprobar_salidas boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.exigir_rol('ADMIN');

  if not exists (select 1 from public.perfiles where id = p_usuario and activo) then
    raise exception 'Ese usuario no existe o está inactivo.' using errcode = 'P0002';
  end if;

  if not (coalesce(p_aprobar_oc, false) or coalesce(p_aprobar_salidas, false)) then
    raise exception 'Debe quedar al menos una opción. Para quitarle todo, use «Quitar».'
      using errcode = '22023';
  end if;

  insert into public.usuarios_autorizados (usuario_id, aprobar_oc, aprobar_salidas, actualizado_por)
  values (p_usuario, coalesce(p_aprobar_oc, false), coalesce(p_aprobar_salidas, false), (select auth.uid()))
  on conflict (usuario_id) do update
    set aprobar_oc = excluded.aprobar_oc,
        aprobar_salidas = excluded.aprobar_salidas,
        actualizado_en = now(),
        actualizado_por = excluded.actualizado_por;
end;
$function$;

-- Lo que ya aprobó se conserva: solo deja de poder aprobar.
create or replace function public.quitar_usuario_autorizado(p_usuario uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.exigir_rol('ADMIN');
  delete from public.usuarios_autorizados where usuario_id = p_usuario;
end;
$function$;

-- La firma de un usuario, cargada por el administrador desde la lista.
create or replace function public.guardar_firma_de_usuario(p_usuario uuid, p_imagen text, p_origen text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.exigir_rol('ADMIN');
  perform private.validar_firma(p_imagen, p_origen);

  if not exists (select 1 from public.perfiles where id = p_usuario) then
    raise exception 'Ese usuario no existe.' using errcode = 'P0002';
  end if;

  insert into public.firmas (perfil_id, imagen, origen)
  values (p_usuario, p_imagen, p_origen)
  on conflict (perfil_id) where perfil_id is not null do update
    set imagen = excluded.imagen,
        origen = excluded.origen,
        usar = true,
        actualizada_en = now();
end;
$function$;

create or replace function public.quitar_firma_de_usuario(p_usuario uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.exigir_rol('ADMIN');
  delete from public.firmas where perfil_id = p_usuario;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. El administrador descarga el respaldo
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function private.puede_respaldar()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.tiene_rol('ADMIN')
      or exists (
    select 1
      from public.usuarios_roles ur
      join public.perfiles     p  on p.id = ur.usuario_id
      join public.rol_permisos rp on rp.rol = ur.rol
     where ur.usuario_id = (select auth.uid())
       and p.activo
       and rp.modulo = 'RESPALDO'
       and rp.nivel  = 'TOTAL'
  );
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Cualquier usuario activo crea una solicitud de pedido y ve las suyas
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function private.exigir_usuario_activo()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelva a entrar.' using errcode = '28000';
  end if;

  if not exists (select 1 from public.perfiles p where p.id = (select auth.uid()) and p.activo) then
    raise exception 'Su usuario está inactivo.' using errcode = '42501';
  end if;
end;
$function$;

create or replace function public.crear_pedido(
  p_titulo text,
  p_justificacion text,
  p_renglones jsonb,
  p_prioridad text default 'NORMAL',
  p_requerida_para date default null,
  p_destino text default null,
  p_enviar boolean default true,
  p_solicitante_id uuid default null,
  p_solicitante_nombre text default null,
  p_solicitante_cargo text default null,
  p_destino_almacen_id bigint default null,
  p_con_firma boolean default false
) returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id      bigint;
  v_sol     record;
  v_destino text := nullif(trim(coalesce(p_destino, '')), '');
  v_nombre  text;
  v_estado  text := case when p_enviar then 'REVISION_ALMACEN' else 'BORRADOR' end;
begin
  -- Pedir lo puede cualquiera; comprar, solo quien lleva compras.
  perform private.exigir_usuario_activo();

  if length(trim(coalesce(p_titulo, ''))) < 4 then
    raise exception 'Póngale un título al pedido: es lo que se lee en el tablero.' using errcode = '22023';
  end if;

  if p_destino_almacen_id is not null then
    select nombre into v_nombre from public.almacenes where id = p_destino_almacen_id;
    if v_nombre is null then
      raise exception 'No existe el almacén %.', p_destino_almacen_id using errcode = '23503';
    end if;
    v_destino := v_nombre;
  end if;

  select * into v_sol from private.normalizar_solicitante(
    coalesce(p_solicitante_id,
             case when nullif(trim(coalesce(p_solicitante_nombre, '')), '') is null
                  then (select auth.uid()) end),
    p_solicitante_nombre, p_solicitante_cargo);

  insert into public.solicitudes_pedido
    (numero, titulo, justificacion, prioridad, requerida_para, destino,
     destino_almacen_id, estado,
     registrada_por, solicitante_id, solicitante_nombre, solicitante_cargo, enviada_en,
     firma_de_quien_pide)
  values
    (private.siguiente_numero('SOL'), trim(p_titulo), trim(coalesce(p_justificacion, '')),
     coalesce(p_prioridad, 'NORMAL'), p_requerida_para, v_destino,
     p_destino_almacen_id,
     v_estado,
     (select auth.uid()), v_sol.o_id, v_sol.o_nombre, v_sol.o_cargo,
     case when p_enviar then now() end,
     coalesce(p_con_firma, false)
       and v_sol.o_id is not distinct from (select auth.uid())
       and private.tengo_firma_encendida())
  returning id into v_id;

  perform private.escribir_renglones(v_id, p_renglones);
  perform private.anotar('SOLICITUD', v_id, null, v_estado);

  return v_id;
end;
$function$;

-- Cada quien ve sus propias solicitudes, aunque no lleve compras.
drop policy if exists solicitudes_pedido_propias on public.solicitudes_pedido;
create policy solicitudes_pedido_propias on public.solicitudes_pedido
  for select to authenticated
  using (registrada_por = (select auth.uid()) or solicitante_id = (select auth.uid()));

drop policy if exists solicitud_renglones_propias on public.solicitud_renglones;
create policy solicitud_renglones_propias on public.solicitud_renglones
  for select to authenticated
  using (exists (select 1 from public.solicitudes_pedido s
                  where s.id = solicitud_renglones.solicitud_id
                    and (s.registrada_por = (select auth.uid()) or s.solicitante_id = (select auth.uid()))));

drop policy if exists solicitud_atendido_almacen_propias on public.solicitud_atendido_almacen;
create policy solicitud_atendido_almacen_propias on public.solicitud_atendido_almacen
  for select to authenticated
  using (exists (select 1 from public.solicitudes_pedido s
                  where s.id = solicitud_atendido_almacen.solicitud_id
                    and (s.registrada_por = (select auth.uid()) or s.solicitante_id = (select auth.uid()))));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. SOLICITANTE se va; BÁSICO lo reemplaza
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.roles (codigo, nombre, descripcion, orden, sistema, a_la_medida, solo_telefono)
values ('BASICO', 'Básico',
        'Ve el panel y hace solicitudes de pedido. Es el rol con el que nace un usuario.',
        coalesce((select orden from public.roles where codigo = 'SOLICITANTE'), 90),
        true, false, false)
on conflict (codigo) do nothing;

insert into public.rol_permisos (rol, modulo, nivel)
values ('BASICO', 'PANEL', 'LECTURA')
on conflict (rol, modulo) do nothing;

insert into public.usuarios_roles (usuario_id, rol)
select ur.usuario_id, 'BASICO' from public.usuarios_roles ur where ur.rol = 'SOLICITANTE'
on conflict do nothing;

delete from public.usuarios_roles where rol = 'SOLICITANTE';
delete from public.rol_acciones   where rol = 'SOLICITANTE';
delete from public.rol_permisos   where rol = 'SOLICITANTE';
delete from public.roles          where codigo = 'SOLICITANTE';

-- El alta de usuarios nacía con SOLICITANTE.
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
  v_rol     text;
begin
  perform private.exigir_rol('ADMIN');

  if v_usuario !~ '^[a-z0-9._-]{3,32}$' then
    raise exception 'El usuario "%" no es válido: de 3 a 32 caracteres, solo letras, números, punto, guion y guion bajo.', p_usuario
      using errcode = '22023';
  end if;

  if p_clave is null or length(p_clave) < 8 then
    raise exception 'La clave debe tener al menos 8 caracteres.' using errcode = '22023';
  end if;

  if coalesce(array_length(p_roles, 1), 0) = 0 then
    raise exception 'Asigne al menos un rol.' using errcode = '22023';
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

  foreach v_rol in array p_roles loop
    insert into public.usuarios_roles (usuario_id, rol) values (v_id, v_rol);
  end loop;

  return v_id;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Cada rol: color, solo teléfono, pantalla de compras y «por defecto»
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.roles add column if not exists color text not null default '#64748b';
update public.roles set color = '#dc2626' where codigo = 'ADMIN';

-- La pantalla de teléfono de compras, como casilla (igual que surtidor,
-- cocina y almacén): solo se tiene marcándola.
insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente, activa)
values ('COMPRAS.TELEFONO', 'COMPRAS', 'Pantalla de teléfono de compras',
        'Entra a compras desde el teléfono: pedidos por revisar, por recibir, por aprobar y por pagar.',
        coalesce((select max(orden) + 1 from public.acciones where modulo = 'COMPRAS'), 1),
        null, true)
on conflict (codigo) do nothing;

-- Crear y editar un rol, ahora con color y «solo teléfono».
drop function if exists public.crear_rol(text, text, text, boolean);
create function public.crear_rol(
  p_codigo text,
  p_nombre text,
  p_descripcion text,
  p_a_la_medida boolean default false,
  p_color text default null,
  p_solo_telefono boolean default false
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
begin
  perform private.exigir_rol('ADMIN');

  if v_codigo !~ '^[A-Z][A-Z0-9_]{2,}$' then
    raise exception 'El código de un rol va en mayúsculas, sin espacios y con al menos tres letras. Por ejemplo: SUPERVISOR_PATIO.'
      using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'El rol necesita un nombre.' using errcode = '22023';
  end if;

  if p_color is not null and p_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'El color va como #RRGGBB.' using errcode = '22023';
  end if;

  insert into public.roles (codigo, nombre, descripcion, a_la_medida, color, solo_telefono)
  values (v_codigo, btrim(p_nombre), btrim(coalesce(p_descripcion, '')),
          coalesce(p_a_la_medida, false), coalesce(p_color, '#64748b'),
          coalesce(p_solo_telefono, false));

  -- Como en MGG: un rol nuevo ve el panel y nada más.
  insert into public.rol_permisos (rol, modulo, nivel) values (v_codigo, 'PANEL', 'LECTURA')
  on conflict (rol, modulo) do nothing;
exception
  when unique_violation then
    raise exception 'Ya existe un rol con el código %.', v_codigo using errcode = '23505';
end;
$function$;

drop function if exists public.guardar_rol(text, text, text, boolean);
create function public.guardar_rol(
  p_codigo text,
  p_nombre text,
  p_descripcion text,
  p_a_la_medida boolean default null,
  p_color text default null,
  p_solo_telefono boolean default null
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.exigir_rol('ADMIN');

  if length(btrim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'El rol necesita un nombre.' using errcode = '22023';
  end if;

  if p_color is not null and p_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'El color va como #RRGGBB.' using errcode = '22023';
  end if;

  -- El administrador no se encierra en el teléfono: es quien abre todo.
  if p_codigo = 'ADMIN' and coalesce(p_solo_telefono, false) then
    raise exception 'El administrador no puede quedar solo en el teléfono.' using errcode = '42501';
  end if;

  -- Nulo deja cada cosa como estaba.
  update public.roles
     set nombre = btrim(p_nombre),
         descripcion = btrim(coalesce(p_descripcion, '')),
         a_la_medida = coalesce(p_a_la_medida, a_la_medida),
         color = coalesce(p_color, color),
         solo_telefono = coalesce(p_solo_telefono, solo_telefono)
   where codigo = p_codigo;

  if not found then
    raise exception 'No existe el rol "%".', p_codigo using errcode = 'P0002';
  end if;
end;
$function$;

-- «↺ Por defecto»: la matriz de hoy queda guardada como la de fábrica.
create table if not exists public.rol_permisos_por_defecto (
  rol    text not null references public.roles(codigo) on delete cascade,
  modulo text not null,
  nivel  text not null,
  primary key (rol, modulo)
);

alter table public.rol_permisos_por_defecto enable row level security;
revoke all on public.rol_permisos_por_defecto from anon, public, authenticated;

insert into public.rol_permisos_por_defecto (rol, modulo, nivel)
select rol, modulo, nivel from public.rol_permisos
on conflict (rol, modulo) do nothing;

create or replace function public.restablecer_rol(p_rol text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.exigir_rol('ADMIN');

  if p_rol = 'ADMIN' then
    raise exception 'El administrador tiene acceso completo por definición.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.roles where codigo = p_rol) then
    raise exception 'No existe el rol "%".', p_rol using errcode = 'P0002';
  end if;

  delete from public.rol_permisos where rol = p_rol;

  if exists (select 1 from public.rol_permisos_por_defecto where rol = p_rol) then
    insert into public.rol_permisos (rol, modulo, nivel)
    select rol, modulo, nivel from public.rol_permisos_por_defecto where rol = p_rol;
  else
    -- Un rol creado después: lo de un rol recién nacido, el panel.
    insert into public.rol_permisos (rol, modulo, nivel) values (p_rol, 'PANEL', 'LECTURA');
  end if;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Permisos de las funciones
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on function private.es_aprobador_de_salidas() from public, anon;
revoke all on function private.exigir_usuario_activo() from public, anon;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.usuarios_autorizados_lista()',
    'public.guardar_usuario_autorizado(uuid, boolean, boolean)',
    'public.quitar_usuario_autorizado(uuid)',
    'public.guardar_firma_de_usuario(uuid, text, text)',
    'public.quitar_firma_de_usuario(uuid)',
    'public.restablecer_rol(text)',
    'public.crear_rol(text, text, text, boolean, text, boolean)',
    'public.guardar_rol(text, text, text, boolean, text, boolean)',
    'public.crear_pedido(text, text, jsonb, text, date, text, boolean, uuid, text, text, bigint, boolean)',
    'public.crear_usuario_sistema(text, text, text, text, text, text, text[])',
    'public.como_apruebo_salidas()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
