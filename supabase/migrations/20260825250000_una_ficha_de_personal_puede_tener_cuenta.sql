-- Una ficha de personal puede tener cuenta en el sistema.
--
-- La líder, hace días, y hoy se entiende para qué: «vincular perfiles de
-- empleados con cuentas de usuario del sistema. Las filas deberán tener un
-- indicador visual sutil en caso tenga un usuario relacionado. Si tiene usuario
-- asignado: mostrar de forma explícita la fecha de creación, el nombre de
-- usuario y el rol asignado. Si NO tiene usuario asignado: el sistema debe
-- actuar de manera silenciosa, sin mostrar ningún indicador o mención».
--
-- Lo que lo volvió urgente es el permiso extendido: una autorización se le da a
-- una PERSONA, y Jesmary es empleada y cuenta a la vez. Hasta ahora el sistema
-- no sabía que eran la misma.
--
-- =========================================================================
-- POR QUÉ NO SE ADIVINA POR LA CÉDULA
-- =========================================================================
--
-- Era la tentación evidente: las dos tablas tienen cédula, se cruzan y listo.
-- Medido antes de escribir nada:
--
--   perfiles con cédula ............ 4 de 12
--   empleados ...................... 22
--   casan por cédula ............... 0
--
-- CERO. Atar identidades por un campo que ocho de doce cuentas tienen vacío es
-- fabricar vínculos falsos en silencio, y un vínculo falso aquí le cuelga a un
-- trabajador la cuenta de otro — y con ella, en su expediente, lo que hizo otro.
-- Lo ata una persona, a mano, y queda en la auditoría.
--
-- =========================================================================
-- UNA CUENTA, UNA FICHA
-- =========================================================================
--
-- `unique` sobre la columna: una cuenta no puede colgar de dos fichas. Y como
-- la columna es una sola, una ficha no puede tener dos cuentas. Las dos
-- direcciones cerradas con una sola restricción.
--
-- `on delete set null` y no `cascade`: si algún día se borra un perfil, la ficha
-- del trabajador NO se va con él. Son cosas distintas — una persona sigue
-- trabajando aquí aunque le cierren la cuenta.
--
-- COMPROBADO en transacción revertida, entrando como Leniska (RRHH): ató la
-- ficha de Jesmary con su usuario, la ficha devolvió usuario, fecha de creación
-- y los seis roles, el freno de «una cuenta es de una sola persona» saltó
-- nombrando de quién era, y desatar dejó la columna en nulo.

alter table public.empleados
  add column if not exists perfil_id uuid unique references public.perfiles(id) on delete set null;

comment on column public.empleados.perfil_id is
  'La cuenta del sistema de esta persona, si tiene. Nulo es lo normal: de 22 trabajadores solo unos pocos entran al sistema. Se ata a mano —por cedula daban CERO coincidencias— y unico, para que una cuenta no cuelgue de dos fichas.';

-- ---------------------------------------------------------------------------
-- La casilla
--
-- Atar una identidad no reparte ningún permiso, pero decide de quién es una
-- cuenta, y eso se lee en la ficha de personal. Va al nivel de quien lleva las
-- fichas: administración, la gerencia y recursos humanos. Es el mismo escalón
-- que corregir la ficha, que es donde se hace.
-- ---------------------------------------------------------------------------
insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente) values
  ('NOMINA.VINCULAR_CUENTA', 'NOMINA', 'Decir qué cuenta del sistema es de cada trabajador',
   'Ata la ficha de un trabajador con su usuario del sistema. No le da ni le quita ningún permiso: solo deja dicho que son la misma persona, para que la ficha muestre con qué usuario entra y qué rol tiene. Atarle la cuenta equivocada a alguien le cuelga en su expediente lo que hizo otro.',
   35, 'ESCRITURA')
on conflict (codigo) do update
  set nombre = excluded.nombre, dice = excluded.dice,
      orden = excluded.orden, nivel_equivalente = excluded.nivel_equivalente;

-- ---------------------------------------------------------------------------
-- Atar y desatar
-- ---------------------------------------------------------------------------
create or replace function public.vincular_cuenta_a_empleado(
  p_empleado_id bigint,
  p_perfil_id   uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_emp    record;
  v_perfil record;
  v_otra   text;
begin
  perform private.exigir_accion('NOMINA.VINCULAR_CUENTA');

  select id, nombres, apellidos, ficha into v_emp
    from public.empleados where id = p_empleado_id;
  if v_emp.id is null then
    raise exception 'No existe esa ficha de personal.' using errcode = 'P0002';
  end if;

  -- Desatar es pasar nulo. No hace falta una función aparte para eso.
  if p_perfil_id is null then
    update public.empleados set perfil_id = null where id = p_empleado_id;
    return;
  end if;

  select id, nombre, usuario, activo into v_perfil
    from public.perfiles where id = p_perfil_id;
  if v_perfil.id is null then
    raise exception 'No existe esa cuenta.' using errcode = 'P0002';
  end if;

  -- El mensaje dice de quién es, no solo que está ocupada: sin el nombre, quien
  -- lo lee no sabe si se equivocó de cuenta o de ficha.
  select concat_ws(' ', e.nombres, e.apellidos) into v_otra
    from public.empleados e
   where e.perfil_id = p_perfil_id and e.id <> p_empleado_id;

  if v_otra is not null then
    raise exception 'La cuenta "%" ya está atada a la ficha de %. Una cuenta es de una sola persona.',
      v_perfil.usuario, v_otra using errcode = '23505';
  end if;

  update public.empleados set perfil_id = p_perfil_id where id = p_empleado_id;
end;
$func$;

revoke all on function public.vincular_cuenta_a_empleado(bigint, uuid) from public, anon;
grant execute on function public.vincular_cuenta_a_empleado(bigint, uuid) to authenticated;

comment on function public.vincular_cuenta_a_empleado(bigint, uuid) is
  'Ata la ficha de un trabajador con su cuenta del sistema, o la desata pasando nulo. No reparte ningun permiso: solo deja dicho que son la misma persona.';

-- ---------------------------------------------------------------------------
-- Las cuentas que todavía no son de nadie
--
-- Para el desplegable de atar. Devuelve solo las libres —y la que ya tenga esta
-- ficha, para que se vea elegida— porque ofrecer una cuenta ocupada es enseñar
-- una opción que va a reventar al guardar.
-- ---------------------------------------------------------------------------
create or replace function public.cuentas_sin_ficha(p_empleado_id bigint default null)
returns table (id uuid, usuario text, nombre text, cargo text, creado_en timestamptz)
language sql
stable
security definer
set search_path to ''
as $func$
  select p.id, p.usuario, p.nombre, p.cargo, p.creado_en
    from public.perfiles p
   where p.activo
     and (not exists (select 1 from public.empleados e where e.perfil_id = p.id)
          or exists (select 1 from public.empleados e
                      where e.perfil_id = p.id and e.id = p_empleado_id))
   order by p.nombre;
$func$;

revoke all on function public.cuentas_sin_ficha(bigint) from public, anon;
grant execute on function public.cuentas_sin_ficha(bigint) to authenticated;
