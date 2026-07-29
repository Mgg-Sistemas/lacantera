-- ============================================================================
-- Permisos por módulo
--
-- Hasta aquí un rol era un nombre y cada función de la base decidía por su
-- cuenta quién podía llamarla. Eso sigue siendo así y es lo que de verdad
-- autoriza: quién aprueba una compra o quién paga una nómina es una regla del
-- negocio, no una casilla que se marca.
--
-- Lo que falta es lo otro: decir a qué llega cada rol. Un analista de compras
-- no tiene por qué ver la nómina de nadie, y hoy la ve. Esta migración añade
-- esa capa.
--
-- La matriz SOLO PUEDE RESTRINGIR. Marcarle "Control total" en Tesorería al
-- rol de Almacén no lo convierte en tesorero: seguirá chocando con la función
-- que exige el rol TESORERIA. Es una reja delante de la puerta, no una llave.
-- Puesto al revés —que la matriz otorgara— cualquier descuido en esta pantalla
-- abriría el sistema entero.
--
-- Los niveles son una escalera, no tres permisos sueltos: TOTAL incluye
-- ESCRITURA, que incluye LECTURA. Tres casillas independientes admitirían
-- "escribe pero no lee", que no significa nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Catálogo de módulos
--
-- Espeja src/config/navigation.ts. Si aparece un módulo nuevo en el menú, va
-- también aquí; si no, no habría forma de darle o quitarle permiso.
-- ---------------------------------------------------------------------------
create table if not exists public.modulos (
  codigo      text primary key,
  nombre      text not null,
  descripcion text not null,
  orden       smallint not null default 100
);

insert into public.modulos (codigo, nombre, descripcion, orden) values
  ('PANEL',         'Panel',              'El tablero de inicio y sus indicadores.',            10),
  ('EXPLOTACION',   'Explotación',        'Frentes, voladuras y producción por turno.',         20),
  ('INVENTARIO',    'Inventario',         'Existencias, movimientos y conteos.',                30),
  ('DESPACHOS',     'Despachos',          'Tickets de romana y guías de despacho.',             40),
  ('COMPRAS',       'Compras',            'Pedidos, cotizaciones, órdenes y proveedores.',      50),
  ('VENTAS',        'Ventas',             'Clientes, cotizaciones y facturación.',              60),
  ('NOMINA',        'Nómina',             'Personal, asistencia, recibos y pagos al personal.', 70),
  ('TESORERIA',     'Tesorería',          'Bancos, cajas, pagos y el libro.',                   80),
  ('TASAS',         'Tasas de cambio',    'La tasa del BCV con la que se valora todo.',         90),
  ('CONFIGURACION', 'Configuración',      'Artículos, almacenes y parámetros.',                100),
  ('USUARIOS',      'Usuarios y roles',   'Quién entra al sistema y con qué permisos.',        110)
on conflict (codigo) do update
  set nombre = excluded.nombre,
      descripcion = excluded.descripcion,
      orden = excluded.orden;

-- ---------------------------------------------------------------------------
-- Roles del sistema y roles de la casa
--
-- Los que trae el sistema no se borran ni se renombran: hay funciones que los
-- nombran por código, y borrar TESORERIA dejaría los pagos sin nadie que los
-- pueda hacer. Los que cree la administración sí.
-- ---------------------------------------------------------------------------
alter table public.roles
  add column if not exists sistema boolean not null default false;

update public.roles set sistema = true
 where codigo in ('ADMIN', 'GERENTE_GENERAL', 'COMPRAS', 'TESORERIA', 'ALMACEN',
                  'OPERACIONES', 'RRHH', 'SOLICITANTE', 'CONSULTA');

-- ---------------------------------------------------------------------------
-- La matriz
-- ---------------------------------------------------------------------------
create table if not exists public.rol_permisos (
  rol    text not null references public.roles(codigo) on delete cascade,
  modulo text not null references public.modulos(codigo) on delete cascade,
  nivel  text not null default 'NINGUNO'
         check (nivel in ('NINGUNO', 'LECTURA', 'ESCRITURA', 'TOTAL')),
  primary key (rol, modulo)
);

create index if not exists rol_permisos_modulo_idx on public.rol_permisos (modulo);

-- ---------------------------------------------------------------------------
-- Resolución
-- ---------------------------------------------------------------------------

-- La escalera, en número, para poder compararla.
create or replace function private.rango_nivel(p_nivel text)
returns smallint
language sql
immutable
as $$
  select case p_nivel
           when 'TOTAL'     then 3
           when 'ESCRITURA' then 2
           when 'LECTURA'   then 1
           else 0
         end::smallint;
$$;

-- `stable` importa: dentro de una consulta Postgres la evalúa una vez en vez
-- de por fila. Una política de RLS la llama en cada fila leída.
create or replace function private.tiene_permiso(p_modulo text, p_nivel text default 'LECTURA')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- ADMIN pasa siempre, igual que en private.tiene_rol. Si la matriz pudiera
  -- dejar a ADMIN fuera de un módulo, una tarde de clics podría cerrar la
  -- pantalla de usuarios y no habría manera de volver a abrirla desde dentro.
  select private.tiene_rol('ADMIN')
      or exists (
           select 1
           from public.usuarios_roles ur
           join public.perfiles     p  on p.id = ur.usuario_id
           join public.rol_permisos rp on rp.rol = ur.rol
           where ur.usuario_id = (select auth.uid())
             and p.activo
             and rp.modulo = p_modulo
             and private.rango_nivel(rp.nivel) >= private.rango_nivel(p_nivel)
         );
$$;

create or replace function private.exigir_permiso(p_modulo text, p_nivel text default 'LECTURA')
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelve a entrar.' using errcode = '28000';
  end if;

  if not private.tiene_permiso(p_modulo, p_nivel) then
    raise exception 'Tu usuario no tiene acceso a %.',
      coalesce((select m.nombre from public.modulos m where m.codigo = p_modulo), p_modulo)
      using errcode = '42501';
  end if;
end;
$$;

-- Versión pública: la interfaz necesita saber qué dibujar. Dibujar no
-- autoriza — quien llame la función igual choca con la reja.
create or replace function public.mis_permisos()
returns table (modulo text, nivel text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.codigo,
         case
           when private.tiene_rol('ADMIN') then 'TOTAL'
           else coalesce(
             (select rp.nivel
                from public.rol_permisos rp
                join public.usuarios_roles ur on ur.rol = rp.rol
                join public.perfiles p on p.id = ur.usuario_id
               where ur.usuario_id = (select auth.uid())
                 and p.activo
                 and rp.modulo = m.codigo
               order by private.rango_nivel(rp.nivel) desc
               limit 1),
             'NINGUNO')
         end
  from public.modulos m
  order by m.orden;
$$;

revoke execute on function public.mis_permisos() from public, anon;
grant   execute on function public.mis_permisos() to authenticated;

-- ---------------------------------------------------------------------------
-- Punto de partida de la matriz
--
-- No se reparte a ojo: cada fila sale de lo que el rol ya hace hoy en las
-- funciones de la base. A quien registra recepciones se le da ESCRITURA en
-- Inventario porque ya la tenía de hecho; a quien nunca tocó la nómina se le
-- deja NINGUNO, que es el cambio real que trae esta migración.
--
-- Solo se siembra si la matriz está vacía. Reaplicar la migración no debe
-- deshacer lo que la administración haya ajustado después.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.rol_permisos) then
    raise notice 'La matriz de permisos ya tiene datos: no se toca.';
    return;
  end if;

  -- ADMIN entra por la puerta de private.tiene_permiso, no por la matriz.
  -- Se siembra igual para que la pantalla lo muestre en total y no en blanco.
  insert into public.rol_permisos (rol, modulo, nivel)
  select 'ADMIN', codigo, 'TOTAL' from public.modulos;

  insert into public.rol_permisos (rol, modulo, nivel) values
    -- Gerencia: ve la operación entera y es la única que aprueba una compra.
    ('GERENTE_GENERAL', 'PANEL',         'LECTURA'),
    ('GERENTE_GENERAL', 'EXPLOTACION',   'LECTURA'),
    ('GERENTE_GENERAL', 'INVENTARIO',    'LECTURA'),
    ('GERENTE_GENERAL', 'DESPACHOS',     'LECTURA'),
    ('GERENTE_GENERAL', 'COMPRAS',       'TOTAL'),
    ('GERENTE_GENERAL', 'VENTAS',        'LECTURA'),
    ('GERENTE_GENERAL', 'NOMINA',        'LECTURA'),
    ('GERENTE_GENERAL', 'TESORERIA',     'LECTURA'),
    ('GERENTE_GENERAL', 'TASAS',         'LECTURA'),

    -- Compras: opera su módulo y mantiene el catálogo de artículos.
    ('COMPRAS',         'PANEL',         'LECTURA'),
    ('COMPRAS',         'INVENTARIO',    'LECTURA'),
    ('COMPRAS',         'COMPRAS',       'ESCRITURA'),
    ('COMPRAS',         'TESORERIA',     'LECTURA'),
    ('COMPRAS',         'CONFIGURACION', 'ESCRITURA'),
    ('COMPRAS',         'TASAS',         'LECTURA'),

    -- Tesorería paga compras y nóminas: necesita leer las dos.
    ('TESORERIA',       'PANEL',         'LECTURA'),
    ('TESORERIA',       'COMPRAS',       'LECTURA'),
    ('TESORERIA',       'TESORERIA',     'ESCRITURA'),
    ('TESORERIA',       'NOMINA',        'LECTURA'),
    ('TESORERIA',       'TASAS',         'ESCRITURA'),

    -- Almacén recibe material, que es donde la compra se cierra.
    ('ALMACEN',         'PANEL',         'LECTURA'),
    ('ALMACEN',         'INVENTARIO',    'ESCRITURA'),
    ('ALMACEN',         'DESPACHOS',     'ESCRITURA'),
    ('ALMACEN',         'COMPRAS',       'LECTURA'),
    ('ALMACEN',         'CONFIGURACION', 'ESCRITURA'),

    -- Operaciones registra el frente y pide material.
    ('OPERACIONES',     'PANEL',         'LECTURA'),
    ('OPERACIONES',     'EXPLOTACION',   'ESCRITURA'),
    ('OPERACIONES',     'INVENTARIO',    'LECTURA'),
    ('OPERACIONES',     'COMPRAS',       'ESCRITURA'),

    -- RRHH: la nómina entera y pedir lo suyo.
    ('RRHH',            'PANEL',         'LECTURA'),
    ('RRHH',            'NOMINA',        'ESCRITURA'),
    ('RRHH',            'COMPRAS',       'ESCRITURA'),

    -- Solicitante es el rol mínimo: pedir material y ver si llegó.
    ('SOLICITANTE',     'PANEL',         'LECTURA'),
    ('SOLICITANTE',     'COMPRAS',       'ESCRITURA'),
    ('SOLICITANTE',     'INVENTARIO',    'LECTURA'),

    -- Consulta mira y no toca. Nómina y tesorería quedan fuera a propósito:
    -- "solo lectura" de lo que gana cada quien sigue siendo ver el sueldo de
    -- todo el mundo.
    ('CONSULTA',        'PANEL',         'LECTURA'),
    ('CONSULTA',        'INVENTARIO',    'LECTURA'),
    ('CONSULTA',        'COMPRAS',       'LECTURA'),
    ('CONSULTA',        'DESPACHOS',     'LECTURA'),
    ('CONSULTA',        'TASAS',         'LECTURA');

  -- Lo que no se nombró arriba queda explícito en NINGUNO, para que la
  -- pantalla muestre la matriz completa y no filas ausentes que hay que
  -- interpretar.
  insert into public.rol_permisos (rol, modulo, nivel)
  select r.codigo, m.codigo, 'NINGUNO'
    from public.roles r
   cross join public.modulos m
  on conflict (rol, modulo) do nothing;
end
$$;

-- ---------------------------------------------------------------------------
-- La reja, en la lectura
--
-- Aquí es donde la columna "Lectura" deja de ser un adorno: las políticas que
-- decían `using (true)` pasan a preguntar por el módulo. Son las tablas de
-- operación. Los catálogos compartidos —artículos, almacenes, unidades,
-- monedas, perfiles— se quedan abiertos: los lee todo el mundo porque una
-- orden de compra tiene que poder escribir el nombre del artículo, y cerrarlos
-- rompería módulos a los que sí se tiene acceso.
-- ---------------------------------------------------------------------------
do $$
declare
  v_tabla  text;
  v_modulo text;
  v_pares  text[][] := array[
    ['solicitudes_pedido',      'COMPRAS'],
    ['solicitud_renglones',     'COMPRAS'],
    ['cotizaciones',            'COMPRAS'],
    ['cotizacion_renglones',    'COMPRAS'],
    ['ordenes_compra',          'COMPRAS'],
    ['orden_renglones',         'COMPRAS'],
    ['compras_bitacora',        'COMPRAS'],
    ['proveedores',             'COMPRAS'],
    ['inventario_movimientos',  'INVENTARIO'],
    ['cuentas_tesoreria',       'TESORERIA'],
    ['tesoreria_movimientos',   'TESORERIA'],
    ['empleados',               'NOMINA'],
    ['nomina_periodos',         'NOMINA'],
    ['nomina_recibos',          'NOMINA'],
    ['nomina_recibo_lineas',    'NOMINA'],
    ['nomina_novedades',        'NOMINA'],
    ['nomina_novedades_montos', 'NOMINA']
  ];
  i int;
begin
  for i in 1 .. array_length(v_pares, 1) loop
    v_tabla  := v_pares[i][1];
    v_modulo := v_pares[i][2];

    if to_regclass('public.' || quote_ident(v_tabla)) is null then
      raise notice 'No existe public.%: se omite.', v_tabla;
      continue;
    end if;

    execute format('drop policy if exists %I on public.%I', v_tabla || '_lectura', v_tabla);
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.tiene_permiso(%L, %L))',
      v_tabla || '_lectura', v_tabla, v_modulo, 'LECTURA');
  end loop;
end
$$;

-- Una instrucción de pago vive entre los dos módulos: nace en la compra y se
-- salda en tesorería. Basta con llegar a cualquiera de los dos.
drop policy if exists instrucciones_pago_lectura on public.instrucciones_pago;
create policy instrucciones_pago_lectura on public.instrucciones_pago
  for select to authenticated
  using (private.tiene_permiso('COMPRAS', 'LECTURA') or private.tiene_permiso('TESORERIA', 'LECTURA'));

-- ---------------------------------------------------------------------------
-- Administrar la matriz
-- ---------------------------------------------------------------------------
create or replace function public.guardar_permiso_rol(
  p_rol    text,
  p_modulo text,
  p_nivel  text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.exigir_rol('ADMIN');

  if p_nivel not in ('NINGUNO', 'LECTURA', 'ESCRITURA', 'TOTAL') then
    raise exception 'Nivel "%" desconocido.', p_nivel using errcode = '22023';
  end if;

  -- ADMIN no se toca. Es la salida de emergencia: si alguien pudiera bajarle
  -- el nivel, un clic dejaría el sistema sin nadie que pueda volver a subirlo.
  if p_rol = 'ADMIN' then
    raise exception 'El administrador tiene acceso completo por definición y no se puede recortar.'
      using errcode = '42501';
  end if;

  insert into public.rol_permisos (rol, modulo, nivel)
  values (p_rol, p_modulo, p_nivel)
  on conflict (rol, modulo) do update set nivel = excluded.nivel;
end;
$$;

revoke execute on function public.guardar_permiso_rol(text, text, text) from public, anon;
grant   execute on function public.guardar_permiso_rol(text, text, text) to authenticated;

create or replace function public.crear_rol(
  p_codigo      text,
  p_nombre      text,
  p_descripcion text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_codigo text := upper(trim(p_codigo));
begin
  perform private.exigir_rol('ADMIN');

  if v_codigo !~ '^[A-Z][A-Z0-9_]{2,31}$' then
    raise exception 'El código "%" no es válido: de 3 a 32 caracteres, mayúsculas, números y guion bajo.', p_codigo
      using errcode = '22023';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El rol necesita un nombre.' using errcode = '22023';
  end if;

  insert into public.roles (codigo, nombre, descripcion, orden, sistema)
  values (v_codigo, trim(p_nombre), coalesce(trim(p_descripcion), ''), 200, false);

  -- Nace sin acceso a nada. Un rol nuevo que naciera abierto sería un agujero
  -- que se abre por descuido, no por decisión.
  insert into public.rol_permisos (rol, modulo, nivel)
  select v_codigo, codigo, 'NINGUNO' from public.modulos;

  return v_codigo;
end;
$$;

revoke execute on function public.crear_rol(text, text, text) from public, anon;
grant   execute on function public.crear_rol(text, text, text) to authenticated;

create or replace function public.guardar_rol(
  p_codigo      text,
  p_nombre      text,
  p_descripcion text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.exigir_rol('ADMIN');

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El rol necesita un nombre.' using errcode = '22023';
  end if;

  update public.roles
     set nombre = trim(p_nombre),
         descripcion = coalesce(trim(p_descripcion), '')
   where codigo = p_codigo;

  if not found then
    raise exception 'No existe el rol "%".', p_codigo using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.guardar_rol(text, text, text) from public, anon;
grant   execute on function public.guardar_rol(text, text, text) to authenticated;

create or replace function public.eliminar_rol(p_codigo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sistema boolean;
  v_usuarios int;
begin
  perform private.exigir_rol('ADMIN');

  select sistema into v_sistema from public.roles where codigo = p_codigo;

  if v_sistema is null then
    raise exception 'No existe el rol "%".', p_codigo using errcode = '22023';
  end if;

  -- Hay funciones que nombran estos códigos. Borrar TESORERIA dejaría los
  -- pagos sin nadie que los pueda hacer y el error saldría meses después.
  if v_sistema then
    raise exception 'El rol "%" es del sistema y no se puede borrar. Quítaselo a quien no deba tenerlo.', p_codigo
      using errcode = '42501';
  end if;

  select count(*) into v_usuarios from public.usuarios_roles where rol = p_codigo;

  if v_usuarios > 0 then
    raise exception 'El rol todavía lo tienen % usuario(s). Quítaselo antes de borrarlo.', v_usuarios
      using errcode = '23503';
  end if;

  delete from public.roles where codigo = p_codigo;
end;
$$;

revoke execute on function public.eliminar_rol(text) from public, anon;
grant   execute on function public.eliminar_rol(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Administrar usuarios
-- ---------------------------------------------------------------------------

-- Cuántos administradores activos quedarían si a este usuario se le hiciera
-- lo que se le va a hacer. Sirve para no quedarse sin ninguno.
create or replace function private.admins_activos_sin(p_excluido uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
    from public.usuarios_roles ur
    join public.perfiles p on p.id = ur.usuario_id
   where ur.rol = 'ADMIN'
     and p.activo
     and ur.usuario_id <> p_excluido;
$$;

create or replace function public.guardar_perfil_usuario(
  p_id       uuid,
  p_nombre   text,
  p_cargo    text default null,
  p_cedula   text default null,
  p_telefono text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.exigir_rol('ADMIN');

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El usuario necesita un nombre.' using errcode = '22023';
  end if;

  update public.perfiles
     set nombre   = trim(p_nombre),
         cargo    = nullif(trim(coalesce(p_cargo, '')), ''),
         cedula   = nullif(trim(coalesce(p_cedula, '')), ''),
         telefono = nullif(trim(coalesce(p_telefono, '')), '')
   where id = p_id;

  if not found then
    raise exception 'No existe ese usuario.' using errcode = '22023';
  end if;

  -- El nombre para mostrar vive además en el token, que es de donde lo lee la
  -- barra superior. Sin esto, la persona seguiría viendo el nombre viejo hasta
  -- que caducara su sesión.
  update auth.users
     set raw_user_meta_data = raw_user_meta_data || jsonb_build_object('nombre', trim(p_nombre)),
         updated_at = now()
   where id = p_id;
end;
$$;

revoke execute on function public.guardar_perfil_usuario(uuid, text, text, text, text) from public, anon;
grant   execute on function public.guardar_perfil_usuario(uuid, text, text, text, text) to authenticated;

create or replace function public.activar_usuario(p_id uuid, p_activo boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.exigir_rol('ADMIN');

  if not p_activo then
    if p_id = (select auth.uid()) then
      raise exception 'No puedes desactivar tu propio usuario.' using errcode = '42501';
    end if;

    if exists (select 1 from public.usuarios_roles where usuario_id = p_id and rol = 'ADMIN')
       and private.admins_activos_sin(p_id) = 0 then
      raise exception 'Es el único administrador activo. Nombra otro antes de desactivarlo.'
        using errcode = '42501';
    end if;
  end if;

  update public.perfiles set activo = p_activo where id = p_id;

  if not found then
    raise exception 'No existe ese usuario.' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.activar_usuario(uuid, boolean) from public, anon;
grant   execute on function public.activar_usuario(uuid, boolean) to authenticated;

create or replace function public.cambiar_clave_usuario(p_id uuid, p_clave text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.exigir_rol('ADMIN');

  if p_clave is null or length(p_clave) < 8 then
    raise exception 'La clave debe tener al menos 8 caracteres.' using errcode = '22023';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_clave, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_id;

  if not found then
    raise exception 'No existe ese usuario.' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.cambiar_clave_usuario(uuid, text) from public, anon;
grant   execute on function public.cambiar_clave_usuario(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Asignar roles: se rehace para no dejar el sistema sin administrador
-- ---------------------------------------------------------------------------
create or replace function public.asignar_roles(p_usuario_id uuid, p_roles text[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rol text;
begin
  perform private.exigir_rol('ADMIN');

  if coalesce(array_length(p_roles, 1), 0) = 0 then
    raise exception 'Un usuario sin roles no puede hacer nada. Desactívalo en vez de dejarlo sin roles.'
      using errcode = '22023';
  end if;

  -- Quitarse a uno mismo el ADMIN siendo el único deja el sistema cerrado: la
  -- pantalla de usuarios exige ADMIN, así que no habría desde dónde arreglarlo.
  if not ('ADMIN' = any(p_roles))
     and exists (select 1 from public.usuarios_roles where usuario_id = p_usuario_id and rol = 'ADMIN')
     and private.admins_activos_sin(p_usuario_id) = 0 then
    raise exception 'Es el único administrador activo. Nombra otro antes de quitarle el rol.'
      using errcode = '42501';
  end if;

  delete from public.usuarios_roles where usuario_id = p_usuario_id;

  foreach v_rol in array p_roles loop
    insert into public.usuarios_roles (usuario_id, rol) values (p_usuario_id, v_rol);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lectura de la matriz
--
-- Quién puede qué no es secreto entre quienes ya entraron: la pantalla de
-- compras necesita saber si dibuja el botón de aprobar. Lo que sí exige ADMIN
-- es cambiarla, y eso lo guardan las funciones de arriba.
-- ---------------------------------------------------------------------------
alter table public.modulos      enable row level security;
alter table public.rol_permisos enable row level security;

revoke insert, update, delete on public.modulos      from anon, authenticated;
revoke insert, update, delete on public.rol_permisos from anon, authenticated;

grant select on public.modulos      to authenticated;
grant select on public.rol_permisos to authenticated;

drop policy if exists modulos_lectura on public.modulos;
create policy modulos_lectura on public.modulos
  for select to authenticated using (true);

drop policy if exists rol_permisos_lectura on public.rol_permisos;
create policy rol_permisos_lectura on public.rol_permisos
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Tiempo real
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'No existe la publicación supabase_realtime: se omite el alta en tiempo real.';
    return;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rol_permisos'
  ) then
    alter publication supabase_realtime add table public.rol_permisos;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'roles'
  ) then
    alter publication supabase_realtime add table public.roles;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'usuarios_roles'
  ) then
    alter publication supabase_realtime add table public.usuarios_roles;
  end if;
end
$$;

-- Se borran filas al reasignar roles y al borrar un rol, y bajo RLS un DELETE
-- no llega al navegador sin la identidad completa.
alter table public.rol_permisos   replica identity full;
alter table public.usuarios_roles replica identity full;
