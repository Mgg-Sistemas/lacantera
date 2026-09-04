/*
  LAS CUENTAS SE ARCHIVAN, PERO PRIMERO SE APAGAN

  EL PROBLEMA QUE RESUELVE

  Una cuenta no se borra. Lo decidió la base hace tiempo y lo decidió bien:
  hay dieciséis columnas apuntando a `perfiles` y setenta y nueve a
  `auth.users`, casi todas sin cascada, porque quien pidió una compra o firmó
  una autorización tiene que seguir teniendo nombre dentro de un año. Así que
  hoy la única baja es `activo = false`, y la lista de usuarios mezcla para
  siempre a quien trabaja con quien se fue en julio.

  Lo pidió el dueño: «ya que no se puede eliminar un usuario, necesito tener
  la opción de archivar, y un apartado ahí mismo donde vea los archivados,
  además de una regla: para archivar al usuario es necesario desactivarlo».

  POR QUÉ SE HACE ASÍ Y NO DE LA OTRA FORMA

  Archivado NO es un tercer estado al lado de activo/inactivo. Es información
  añadida a una cuenta que ya está apagada: cuándo, por qué y quién. La marca
  es la fecha; no hay booleano aparte. El precedente en contra está en
  `maquinaria.activa`, que nació al lado de `estado`, se contradijo con él y
  hubo que borrarla (20260819160000). Y el precedente a favor es `empleados`:
  `activo` + `fecha_egreso` + `motivo_egreso`, escritos juntos por una sola
  función que exige el motivo.

  La regla del dueño es lo que hace que esto sea barato y seguro. Las diez
  puertas de autorización de la base —`tiene_rol`, `puede_accion`,
  `roles_actuales`, `admins_activos_sin`, `normalizar_solicitante`…— ya miran
  `p.activo`. Como una cuenta archivada está siempre inactiva, y eso lo
  garantiza un CHECK y no la pantalla, un archivado no pasa ninguna puerta sin
  que haya que tocar ninguna. Si archivado hubiera nacido independiente de
  activo habría once sitios que corregir, y olvidar uno dejaría al archivado
  entrando con sus roles.

  QUIÉN ARCHIVA

  El administrador, siempre, y además quien tenga la casilla nueva
  `USUARIOS.ARCHIVAR_USUARIO`: marcada en un rol o dada por permiso extendido.
  Es lo que pidió el dueño: «ADMIN como único que archiva, además de alguien
  que le demos permisos de archivar». Por eso la reja es `exigir_accion` y no
  `exigir_rol('ADMIN')` como el resto del módulo: la casilla existe para poder
  prestarse. La misma casilla sirve para sacar del archivo.

  QUÉ CAMBIA PARA QUIÉN, HOY

  Nada para nadie hasta que alguien archive. Las nueve cuentas de producción
  están activas; el apartado nace vacío. Los selectores que ya filtran por
  activo dejan fuera al archivado sin cambios; Auditoría lo sigue mostrando
  porque es historia; los papeles viejos siguen diciendo quién los firmó.

  Dos pasos en las dos direcciones. Para archivar hay que desactivar antes.
  Para volver a encender hay que desarchivar antes, y desarchivar deja la
  cuenta INACTIVA a propósito: sacar algo del archivo no es decidir que la
  persona vuelve a entrar. Eso lo decide quien reactive, con su propio botón.

  LO QUE NO HACE Y POR QUÉ SE DICE

  No libera el nombre de usuario: `perfiles.usuario` es UNIQUE y el correo
  sintético vive también en `auth.users` y `auth.identities`. No revoca roles
  ni autorizaciones: se neutralizan solos por `activo` y vuelven al reactivar,
  como pasa hoy al desactivar. No cierra sesiones ni frena el login: un
  inactivo entra y ve el sistema vacío, y eso sigue igual — es otra decisión,
  documentada en `acciones.dice` de USUARIOS.ACTIVAR_USUARIO. No ata el egreso
  de un empleado con la baja de su cuenta: `egresar_empleado` sigue sin tocar
  `perfiles`, y ese hueco queda apuntado para otra migración.

  El cuerpo de `activar_usuario` se sacó de `pg_get_functiondef` sobre el
  catálogo vivo y se le añadió una sola guarda encima. No se reescribió de
  memoria.

  APLICADA el 04/09/2026 y PROBADA en transacción deshecha con pruebas/usuarios.mjs.
*/

-- ---------------------------------------------------------------------------
-- La guarda: si el esquema no es el que se supone, mejor morir aquí
-- ---------------------------------------------------------------------------

do $guarda$
declare
  v_faltan text := '';
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'perfiles'
                    and column_name = 'activo') then
    v_faltan := v_faltan || ' perfiles.activo';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'private' and p.proname = 'exigir_accion') then
    v_faltan := v_faltan || ' private.exigir_accion';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'private' and p.proname = 'exigir_rol') then
    v_faltan := v_faltan || ' private.exigir_rol';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'private' and p.proname = 'admins_activos_sin') then
    v_faltan := v_faltan || ' private.admins_activos_sin';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'activar_usuario'
                    and pg_get_function_identity_arguments(p.oid) = 'p_id uuid, p_activo boolean') then
    v_faltan := v_faltan || ' public.activar_usuario(uuid, boolean)';
  end if;
  if not exists (select 1 from public.acciones where codigo = 'USUARIOS.ACTIVAR_USUARIO') then
    v_faltan := v_faltan || ' acciones.USUARIOS.ACTIVAR_USUARIO';
  end if;

  if v_faltan <> '' then
    raise exception 'La base no es la que esta migracion espera. Falta:%', v_faltan;
  end if;
end $guarda$;

-- ---------------------------------------------------------------------------
-- La casilla
-- ---------------------------------------------------------------------------

insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente)
values (
  'USUARIOS.ARCHIVAR_USUARIO', 'USUARIOS',
  'Archivar o sacar del archivo una cuenta',
  'Guarda en el archivo una cuenta que ya esta inactiva, con la fecha, el motivo y quien la archivo, y la saca de la lista de en uso. Una cuenta archivada no se puede volver a encender sin sacarla antes del archivo, y al sacarla vuelve inactiva: encenderla es otra decision. No la concede ningun nivel de modulo: hay que darla a mano o por permiso extendido. El administrador la tiene siempre.',
  55, null
)
on conflict (codigo) do update
  set modulo = excluded.modulo,
      nombre = excluded.nombre,
      dice   = excluded.dice,
      orden  = excluded.orden,
      nivel_equivalente = excluded.nivel_equivalente;

-- ---------------------------------------------------------------------------
-- Las tres columnas, y la regla que las ata a `activo`
-- ---------------------------------------------------------------------------

alter table public.perfiles
  add column if not exists archivado_en     timestamptz,
  add column if not exists archivado_por    uuid references public.perfiles(id),
  add column if not exists archivado_motivo text;

comment on column public.perfiles.archivado_en is
  'Cuando se guardo la cuenta en el archivo. Nula mientras este en uso. Es la marca: no hay booleano aparte.';
comment on column public.perfiles.archivado_por is
  'Quien la archivo. Se conserva aunque esa persona se vaya despues: es historia.';
comment on column public.perfiles.archivado_motivo is
  'Por que se archivo, con las palabras de quien lo hizo. Obligatorio: es lo que lee quien la busque dentro de un anio.';

/*
  Una cuenta archivada está siempre apagada. Lo dice la base, no la pantalla:
  así ninguna función futura puede dejar un archivado con `activo = true`
  aunque se olvide de esta regla. Y la fecha y el motivo van juntos: no hay
  archivo sin explicación.
*/
alter table public.perfiles drop constraint if exists perfiles_archivado_apagado;
alter table public.perfiles add constraint perfiles_archivado_apagado
  check (archivado_en is null or not activo);

alter table public.perfiles drop constraint if exists perfiles_archivado_con_motivo;
alter table public.perfiles add constraint perfiles_archivado_con_motivo
  check ((archivado_en is null) = (archivado_motivo is null));

-- ---------------------------------------------------------------------------
-- Archivar
-- ---------------------------------------------------------------------------

create or replace function public.archivar_usuario(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_activo    boolean;
  v_archivado timestamptz;
begin
  perform private.exigir_accion('USUARIOS.ARCHIVAR_USUARIO');

  -- Antes que nada: nadie se archiva a sí mismo. Es defensa en profundidad —
  -- para archivarse tendría que estar inactivo, y un inactivo no pasa la reja
  -- de arriba— pero la regla se dice aquí para que no dependa de la otra.
  if p_id = (select auth.uid()) then
    raise exception 'No puedes archivar tu propio usuario.' using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se archiva: es lo que va a leer quien lo busque dentro de un año.'
      using errcode = '22023';
  end if;

  select p.activo, p.archivado_en into v_activo, v_archivado
    from public.perfiles p where p.id = p_id;

  if v_activo is null then
    raise exception 'No existe ese usuario.' using errcode = 'P0002';
  end if;

  if v_archivado is not null then
    raise exception 'Ya está archivado.' using errcode = '55000';
  end if;

  -- La regla del dueño. Se archiva lo que ya está apagado; si sigue encendido,
  -- primero hay que decidir apagarlo, con su propio botón y su propia
  -- confirmación. Archivar no es una forma escondida de desactivar.
  if v_activo then
    raise exception 'Primero hay que desactivarlo. Se archiva lo que ya está apagado.'
      using errcode = '55000';
  end if;

  update public.perfiles
     set archivado_en     = now(),
         archivado_por    = (select auth.uid()),
         archivado_motivo = btrim(p_motivo)
   where id = p_id;
end;
$function$;

revoke all on function public.archivar_usuario(uuid, text) from public, anon;
grant execute on function public.archivar_usuario(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Sacar del archivo
-- ---------------------------------------------------------------------------

create or replace function public.desarchivar_usuario(p_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_archivado timestamptz;
begin
  perform private.exigir_accion('USUARIOS.ARCHIVAR_USUARIO');

  select p.archivado_en into v_archivado
    from public.perfiles p where p.id = p_id;

  if not found then
    raise exception 'No existe ese usuario.' using errcode = 'P0002';
  end if;

  if v_archivado is null then
    raise exception 'No está archivado.' using errcode = '55000';
  end if;

  -- Vuelve a la lista de en uso, pero INACTIVO. Sacar del archivo no es
  -- decidir que la persona vuelve a entrar: eso lo decide quien reactive.
  update public.perfiles
     set archivado_en     = null,
         archivado_por    = null,
         archivado_motivo = null
   where id = p_id;
end;
$function$;

revoke all on function public.desarchivar_usuario(uuid) from public, anon;
grant execute on function public.desarchivar_usuario(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- La guarda en `activar_usuario`: un archivado no se enciende
--
-- Cuerpo sacado de pg_get_functiondef sobre producción el 04/09/2026. Lo único
-- nuevo es el bloque «Un archivado no se enciende». Todo lo demás —la reja de
-- ADMIN, no desactivarse a uno mismo, no dejar el sistema sin administrador—
-- está tal cual estaba.
-- ---------------------------------------------------------------------------

create or replace function public.activar_usuario(p_id uuid, p_activo boolean)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform private.exigir_rol('ADMIN');

  -- Un archivado no se enciende. Primero se saca del archivo, y ese paso lo
  -- da quien tenga la casilla de archivar; encenderlo lo da el administrador.
  -- Sin esta guarda, el CHECK de la tabla rebotaría igual, pero con un mensaje
  -- que no le dice a nadie qué hacer.
  if p_activo and exists (
       select 1 from public.perfiles p where p.id = p_id and p.archivado_en is not null
     ) then
    raise exception 'Está archivado. Sácalo del archivo antes de volver a activarlo.'
      using errcode = '55000';
  end if;

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
$function$;

revoke all on function public.activar_usuario(uuid, boolean) from public, anon;
grant execute on function public.activar_usuario(uuid, boolean) to authenticated;
