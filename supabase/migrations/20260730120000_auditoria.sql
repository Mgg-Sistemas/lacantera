-- ============================================================================
-- Auditoría: quién hizo qué, cuándo
--
-- Un registro de todo lo que se escribe en el sistema, con la fecha, la hora y
-- el nombre de quien lo hizo. Lo lee solo la administración.
--
-- POR QUÉ CON DISPARADORES Y NO DENTRO DE CADA FUNCIÓN
--
-- Hay más de cincuenta funciones que escriben. Anotar en cada una significa que
-- la primera que se escriba mañana se olvidará, y el registro tendrá un hueco
-- que nadie va a notar. Un registro con huecos es PEOR que no tener ninguno:
-- parece completo, y quien lo consulta concluye que algo no pasó cuando lo que
-- pasa es que no se anotó.
--
-- Aquí no hay puerta trasera. Se escriba desde la pantalla, desde una función,
-- desde una migración o desde una consola conectada a la base, la fila queda
-- anotada. Es el mismo criterio con el que se normalizan las mayúsculas.
--
-- LO QUE NO SE ANOTA, Y POR QUÉ SE DICE
--
-- Un hueco documentado no es un hueco: es una decisión que alguien puede
-- discutir. Estos son todos los que hay.
--
--   - Las CONSULTAS. Esto anota lo que cambia, no lo que se mira. Un disparador
--     no se entera de un SELECT, y anotar cada lectura multiplicaría por mil el
--     tamaño del registro para enterrar dentro lo que de verdad importa.
--
--   - `correlativos`. Es el contador que reparte los números de documento.
--     Cambia con cada orden y cada ficha, y no dice nada que no diga ya el
--     documento que acaba de nacer.
--
--   - `notificaciones` y `notificaciones_leidas`. Las escribe el sistema solo,
--     como consecuencia de algo que ya está anotado, y leer un aviso no es un
--     movimiento.
--
--   - `nomina_recibo_lineas`. Calcular una nómina de diecisiete personas crea
--     unas ciento setenta líneas de golpe, y recalcularla las borra y las
--     rehace. Serían cientos de renglones para contar UNA acción que ya queda
--     anotada en el recibo y en el período. El detalle no se pierde: está en el
--     recibo, que sí se anota.
--
--   - Las CONTRASEÑAS. Viven cifradas en `auth.users`, que no se toca desde
--     aquí. Que alguien cambió una clave sí se anota; cuál era, jamás.
-- ============================================================================

create table if not exists public.auditoria (
  id           bigint generated always as identity primary key,
  ocurrido_en  timestamptz not null default now(),

  -- Sin clave foránea a `auth.users` A PROPÓSITO. Con ella, borrar un usuario
  -- obligaría a borrar su rastro o a dejarlo apuntando a nadie, y el rastro de
  -- quien ya no está es justo el que hace falta el día que se investiga algo.
  usuario_id   uuid,

  -- El nombre se copia en el momento, no se busca después. Si esa persona se
  -- cambia el nombre el año que viene, lo que hizo hoy lo hizo con el de hoy.
  usuario      text not null,
  nombre       text,

  tabla        text not null,
  operacion    text not null check (operacion in ('INSERT', 'UPDATE', 'DELETE', 'ACCESO', 'CLAVE')),

  -- Texto y no bigint: las claves del sistema son números, códigos de tres
  -- letras y pares de columnas. Aquí solo hace falta poder señalar la fila.
  fila_id      text,

  -- Algo con lo que reconocer la fila sin abrirla: el número de la orden, el
  -- nombre del proveedor. Se saca de la propia fila y puede faltar.
  etiqueta     text,

  antes        jsonb,
  despues      jsonb,

  -- Qué columnas cambiaron. Se guarda aparte para poder buscar «quién tocó
  -- salario_base» sin abrir cada fila del registro.
  cambios      text[],

  ip           inet
);

comment on table public.auditoria is
  'Quién escribió qué y cuándo. Solo lo lee ADMIN. No se puede modificar ni borrar.';

create index if not exists auditoria_fecha_idx   on public.auditoria (ocurrido_en desc);
create index if not exists auditoria_usuario_idx on public.auditoria (usuario_id, ocurrido_en desc);
create index if not exists auditoria_tabla_idx   on public.auditoria (tabla, ocurrido_en desc);
create index if not exists auditoria_cambios_idx on public.auditoria using gin (cambios);

-- ---------------------------------------------------------------------------
-- No se toca
--
-- Un registro que se puede editar o borrar no sirve para lo que existe. Quien
-- quiera tapar algo tendría que empezar por tapar la prueba de que lo hizo, y
-- esto se lo impide desde la base, no desde la pantalla.
-- ---------------------------------------------------------------------------
create or replace function private.auditoria_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'El registro de auditoría no se modifica ni se borra. Es lo único que lo hace valer.'
    using errcode = '42501';
end;
$$;

drop trigger if exists auditoria_inmutable on public.auditoria;
create trigger auditoria_inmutable before update or delete on public.auditoria
  for each row execute function private.auditoria_inmutable();

-- ---------------------------------------------------------------------------
-- Permisos
--
-- Nadie escribe aquí desde la aplicación: las filas las pone el disparador, que
-- corre con los permisos de la base. Y leer es solo de ADMIN, porque este
-- registro contiene todo lo que pasó por el sistema —sueldos, cédulas, cuentas
-- bancarias— junto y en un solo sitio.
-- ---------------------------------------------------------------------------
alter table public.auditoria enable row level security;
revoke insert, update, delete on public.auditoria from anon, authenticated;
grant select on public.auditoria to authenticated;

drop policy if exists auditoria_lectura on public.auditoria;
create policy auditoria_lectura on public.auditoria
  for select to authenticated
  using ((select public.mis_roles()) && array['ADMIN']::text[]);

-- ---------------------------------------------------------------------------
-- Quién está escribiendo
-- ---------------------------------------------------------------------------
create or replace function private.quien_escribe()
returns table (id uuid, usuario text, nombre text)
language plpgsql
stable
security definer
set search_path = ''
as $$
-- Los nombres de la tabla de salida son también variables aquí dentro, y tres
-- de ellos coinciden con columnas de `perfiles`. Ante la duda, gana la columna.
#variable_conflict use_column
declare
  v_id uuid := (select auth.uid());
begin
  if v_id is null then
    -- Una migración, una tarea de mantenimiento, alguien conectado a la base
    -- por fuera. No es un usuario y no se le puede inventar uno.
    return query select null::uuid, 'SISTEMA'::text, null::text;
    return;
  end if;

  return query
  select v_id,
         coalesce(p.usuario, 'DESCONOCIDO'),
         p.nombre
    from (select 1) x
    left join public.perfiles p on p.id = v_id;
end;
$$;

-- La dirección desde la que llegó la petición, si PostgREST la pasó. Va entre
-- algodones: es un dato de adorno, y no puede tumbar una escritura por venir mal
-- formado un encabezado que pone un intermediario.
create or replace function private.ip_de_la_peticion()
returns inet
language plpgsql
stable
as $$
declare
  v_cabeceras jsonb;
  v_ip text;
begin
  v_cabeceras := nullif(current_setting('request.headers', true), '')::jsonb;
  if v_cabeceras is null then return null; end if;

  -- `x-forwarded-for` puede traer varias separadas por coma; la primera es la
  -- del cliente.
  v_ip := split_part(coalesce(v_cabeceras ->> 'x-forwarded-for',
                              v_cabeceras ->> 'x-real-ip', ''), ',', 1);
  return nullif(trim(v_ip), '')::inet;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- El disparador
--
-- Uno solo para las treinta y dos tablas. Recibe como argumentos las columnas
-- de la clave primaria, que se leen del catálogo al crearlo: así no hay que
-- adivinar si la fila se identifica por `id`, por `codigo` o por dos columnas.
-- ---------------------------------------------------------------------------
create or replace function private.auditar()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_quien    record;
  v_antes    jsonb;
  v_despues  jsonb;
  v_fila     jsonb;
  v_cambios  text[];
  v_clave    text;
  v_partes   text[] := '{}';
  v_etiqueta text;
  v_col      text;
begin
  if TG_OP = 'DELETE' then
    v_antes := to_jsonb(OLD);
  elsif TG_OP = 'INSERT' then
    v_despues := to_jsonb(NEW);
  else
    v_antes := to_jsonb(OLD);
    v_despues := to_jsonb(NEW);

    select array_agg(e.key order by e.key) into v_cambios
      from jsonb_each(v_despues) e
     where e.value is distinct from v_antes -> e.key;

    -- Un UPDATE que no cambió nada no es un movimiento. Anotarlo llenaría el
    -- registro de renglones vacíos entre los que sí dicen algo.
    if v_cambios is null then
      return null;
    end if;
  end if;

  v_fila := coalesce(v_despues, v_antes);

  -- La clave primaria, tal como la declaró la tabla.
  foreach v_col in array TG_ARGV loop
    v_partes := v_partes || coalesce(v_fila ->> v_col, '?');
  end loop;
  v_clave := nullif(array_to_string(v_partes, '·'), '');

  -- Con qué reconocerla de un vistazo. Es una preferencia, no una regla: si la
  -- tabla no tiene ninguna de estas columnas, se queda sin etiqueta y el
  -- registro sigue valiendo igual.
  --
  -- `rol` va de los primeros a propósito. Las tablas que reparten permisos
  -- —`usuarios_roles`, `rol_permisos`— se identifican por un uuid y un código,
  -- y sin etiqueta el registro enseñaba «e0a9d9b2-12c5-42f9-81e5-…·RRHH», que
  -- no le dice nada a quien está mirando quién le dio qué a quién.
  foreach v_col in array array[
    'numero', 'razon_social', 'nombres', 'nombre', 'titulo',
    'rol', 'usuario', 'concepto', 'descripcion', 'cargo', 'clave', 'codigo'
  ] loop
    if v_fila ? v_col and nullif(trim(coalesce(v_fila ->> v_col, '')), '') is not null then
      v_etiqueta := left(v_fila ->> v_col, 120);
      exit;
    end if;
  end loop;

  select * into v_quien from private.quien_escribe();

  insert into public.auditoria
    (usuario_id, usuario, nombre, tabla, operacion, fila_id, etiqueta, antes, despues, cambios, ip)
  values
    (v_quien.id, v_quien.usuario, v_quien.nombre, TG_TABLE_NAME, TG_OP,
     v_clave, v_etiqueta, v_antes, v_despues, v_cambios, private.ip_de_la_peticion());

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dónde se pone
--
-- La lista de tablas se saca del catálogo y no se escribe a mano: una tabla
-- nueva que alguien añada mañana entra sola en cuanto se vuelva a correr esto,
-- en vez de quedarse fuera porque nadie se acordó de apuntarla aquí.
--
-- Las claves primarias también salen del catálogo y viajan como argumentos del
-- disparador.
-- ---------------------------------------------------------------------------
do $$
declare
  v_t     record;
  v_args  text;
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
         'auditoria',              -- se anotaría a sí misma, sin fin
         'correlativos',           -- el contador de los números de documento
         'notificaciones',         -- las escribe el sistema, no una persona
         'notificaciones_leidas',  -- leer un aviso no es un movimiento
         'nomina_recibo_lineas'    -- cientos de renglones para contar una acción
       )
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

-- ---------------------------------------------------------------------------
-- Las entradas al sistema
--
-- Quién entró y cuándo es la primera pregunta que se le hace a un registro de
-- auditoría, y no se puede responder con los disparadores de arriba: entrar no
-- escribe en ninguna tabla del negocio.
--
-- Se engancha en `auth.sessions`, que es donde Supabase apunta cada sesión que
-- abre. Así queda anotado el acceso venga de donde venga, sin depender de que
-- la pantalla avise.
--
-- TODO EL CUERPO VA DENTRO DE UN `exception when others`. Es deliberado y es la
-- única vez que se hace en esta migración: si algo falla aquí —la tabla llena,
-- un cambio de Supabase en el esquema de `auth`— lo que se pierde es un renglón
-- del registro. Sin ese resguardo, lo que se pierde es que NADIE puede entrar
-- al sistema. No hay comparación entre las dos cosas.
--
-- No se anotan las SALIDAS. Supabase borra la fila de la sesión al cerrarla,
-- pero también al caducar, al cambiar la clave y al limpiar sesiones viejas, y
-- desde aquí no hay forma de distinguirlas. Anotar «salió» cuando en realidad
-- se le venció la sesión sería escribir algo falso en el único sitio del
-- sistema que tiene que ser cierto.
-- ---------------------------------------------------------------------------
create or replace function private.auditar_acceso()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_usuario text;
  v_nombre  text;
begin
  begin
    select p.usuario, p.nombre into v_usuario, v_nombre
      from public.perfiles p where p.id = NEW.user_id;

    insert into public.auditoria
      (usuario_id, usuario, nombre, tabla, operacion, fila_id, etiqueta, ip)
    values
      (NEW.user_id, coalesce(v_usuario, 'DESCONOCIDO'), v_nombre,
       'acceso', 'ACCESO', NEW.id::text, left(coalesce(NEW.user_agent, ''), 120), NEW.ip);
  exception when others then
    -- Ni una excepción aquí puede impedir que alguien entre a trabajar.
    null;
  end;

  return null;
end;
$$;

drop trigger if exists trg_auditar_acceso on auth.sessions;
create trigger trg_auditar_acceso after insert on auth.sessions
  for each row execute function private.auditar_acceso();

-- ---------------------------------------------------------------------------
-- Los cambios de clave
--
-- La clave vive cifrada en `auth.users`, que no lleva disparador. Y el rastro
-- indirecto que deja —`perfiles.debe_cambiar_clave`— no dice lo que pasó: dice
-- que se marcó una casilla. Cambiar una clave es de las cosas que un registro
-- de auditoría existe para recoger, así que se anota a mano y por su nombre.
--
-- Se anota QUE pasó y a quién. La clave, ni la vieja ni la nueva, no se acerca
-- a esta tabla.
-- ---------------------------------------------------------------------------
create or replace function private.anotar_clave(p_de uuid, p_nota text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_quien   record;
  v_usuario text;
begin
  select * into v_quien from private.quien_escribe();
  select p.usuario into v_usuario from public.perfiles p where p.id = p_de;

  insert into public.auditoria
    (usuario_id, usuario, nombre, tabla, operacion, fila_id, etiqueta, ip)
  values
    (v_quien.id, v_quien.usuario, v_quien.nombre, 'clave', 'CLAVE',
     p_de::text, coalesce(v_usuario, 'DESCONOCIDO') || ' · ' || p_nota,
     private.ip_de_la_peticion());
end;
$$;

create or replace function public.cambiar_mi_clave(p_actual text, p_nueva text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id     uuid := (select auth.uid());
  v_actual text;
begin
  if v_id is null then
    raise exception 'Sesión no válida. Vuelve a entrar.' using errcode = '28000';
  end if;

  if p_nueva is null or length(p_nueva) < 8 then
    raise exception 'La clave nueva debe tener al menos 8 caracteres.' using errcode = '22023';
  end if;

  if p_actual = p_nueva then
    raise exception 'La clave nueva tiene que ser distinta de la actual.' using errcode = '22023';
  end if;

  select encrypted_password into v_actual from auth.users where id = v_id;

  if v_actual is null or extensions.crypt(p_actual, v_actual) <> v_actual then
    raise exception 'La clave actual no es correcta.' using errcode = '28P01';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_nueva, extensions.gen_salt('bf')),
         updated_at = now()
   where id = v_id;

  -- La clave vieja deja de servir en todas partes, no solo aquí.
  perform private.cerrar_otras_sesiones(v_id);
  perform private.anotar_clave(v_id, 'CAMBIO SU PROPIA CLAVE');

  -- Desde aquí, lo que se firme con ella es de esta persona.
  update public.perfiles set debe_cambiar_clave = false where id = v_id;
end;
$$;

revoke execute on function public.cambiar_mi_clave(text, text) from public, anon;
grant   execute on function public.cambiar_mi_clave(text, text) to authenticated;

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

  if not exists (select 1 from public.perfiles where id = p_id) then
    raise exception 'No existe ese usuario.' using errcode = 'P0002';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_clave, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_id;

  perform private.cerrar_otras_sesiones(p_id);
  perform private.anotar_clave(p_id, 'LE REPUSO LA CLAVE LA ADMINISTRACION');

  -- Nace provisional: la termina de poner su dueño.
  update public.perfiles set debe_cambiar_clave = true where id = p_id;
end;
$$;

revoke execute on function public.cambiar_clave_usuario(uuid, text) from public, anon;
grant   execute on function public.cambiar_clave_usuario(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Tiempo real
--
-- El reenvío respeta las políticas, así que solo le llega a quien ya podría
-- leerlo con una consulta: la administración. Nadie más se entera de que hay
-- movimiento.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'auditoria'
  ) then
    alter publication supabase_realtime add table public.auditoria;
  end if;
end
$$;
