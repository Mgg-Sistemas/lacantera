-- Las autorizaciones se conceden y se retiran, desde la pantalla de usuarios.
--
-- Christopher lo aterriza: «en usuarios, se pueda extender permisos que no
-- competen a un rol, bajo una justificación». Por PERSONA, no por rol — que es
-- justo la diferencia: el rol dice lo que compete al puesto, y esto es lo que
-- se le presta a alguien concreto por encima de su puesto.
--
-- La tabla se renombra a `autorizaciones`. La creé como `delegaciones` y es el
-- mismo objeto, pero la palabra que usan la líder y Christopher es
-- «autorización» y es la que va a salir impresa en el papel. Dos vocabularios
-- para lo mismo es lo que hace que dentro de tres meses alguien busque
-- «autorizar» y no encuentre nada.

alter table public.delegaciones rename to autorizaciones;
alter index if exists delegaciones_vigentes_idx rename to autorizaciones_vigentes_idx;
alter table public.autorizaciones rename constraint delegaciones_fechas to autorizaciones_fechas;
alter table public.autorizaciones rename constraint delegaciones_motivo to autorizaciones_motivo;
alter table public.autorizaciones rename constraint delegaciones_no_a_si_mismo to autorizaciones_no_a_si_mismo;

drop policy if exists delegaciones_lectura on public.autorizaciones;
drop policy if exists autorizaciones_lectura on public.autorizaciones;
create policy autorizaciones_lectura on public.autorizaciones
  for select using (auth.uid() is not null);

comment on table public.autorizaciones is
  'Permisos extendidos a una PERSONA por encima de lo que le compete por su rol, bajo justificacion, por un tiempo o indefinidamente. Los concede administracion o la gerencia. Es lo que hace verdad el check de «bajo autorizacion de» en los papeles que se emiten usandolos.';

create or replace function private.autoriza_delegacion(p_accion text)
returns uuid
language sql
stable
security definer
set search_path to ''
as $func$
  select case when private.puede_accion_propia(p_accion) then null
              else (
                select d.por_usuario
                  from public.autorizaciones d
                  join public.perfiles p on p.id = d.a_usuario
                 where d.a_usuario = (select auth.uid())
                   and d.accion = p_accion
                   and d.revocada_en is null
                   and p.activo
                   and d.desde <= current_date
                   and (d.hasta is null or d.hasta >= current_date)
                 order by d.creada_en desc
                 limit 1
              )
         end;
$func$;

create or replace function private.puede_accion(p_accion text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $func$
  select private.puede_accion_propia(p_accion)
      or exists (
           select 1
             from public.autorizaciones d
             join public.perfiles p on p.id = d.a_usuario
            where d.a_usuario = (select auth.uid())
              and d.accion = p_accion
              and d.revocada_en is null
              and p.activo
              and d.desde <= current_date
              and (d.hasta is null or d.hasta >= current_date)
         );
$func$;

-- ---------------------------------------------------------------------------
-- Conceder
-- ---------------------------------------------------------------------------
create or replace function public.autorizar_accion(
  p_usuario_id uuid,
  p_accion     text,
  p_motivo     text,
  p_desde      date default null,
  p_hasta      date default null
)
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
  -- Lo gestionan administración y la gerencia, como pidió Christopher.
  perform private.exigir_rol('ADMIN', 'GERENTE_GENERAL');

  select * into v_accion from public.acciones where codigo = p_accion;

  if v_accion.codigo is null then
    raise exception 'No existe la acción "%".', p_accion using errcode = 'P0002';
  end if;

  if not v_accion.activa then
    raise exception 'La casilla "%" está apagada: no se reparte ni se presta.', v_accion.nombre
      using errcode = '55000';
  end if;

  /*
    Las dos que no se prestan nunca.

    Prestar la llave que reparte llaves es una escalera a todo el sistema, y con
    un peldaño intermedio que además la disimula: quien recibiera «repartir los
    permisos de un rol» podría darse a sí mismo cualquier cosa al día siguiente,
    y el registro solo diría que se le prestó una casilla.
  */
  if p_accion in ('USUARIOS.DAR_PERMISOS', 'USUARIOS.ASIGNAR_ROLES') then
    raise exception 'Esa no se presta: quien la recibe puede darse a sí mismo cualquier otra cosa. Si de verdad hace falta, se le da el rol de administrador y queda a la vista.'
      using errcode = '42501';
  end if;

  /*
    Nadie presta lo que no tiene.

    Sin este freno, la gerencia podría concederle a cualquiera «crear usuarios»
    —que es algo que la gerencia misma no puede hacer, porque esas funciones
    exigen el rol de administrador— y eso no sería delegar sino fabricar permiso
    de la nada. El administrador pasa siempre, así que puede prestar cualquier
    cosa.

    Se mira el derecho PROPIO a posta: si lo tuyo también es prestado, no lo
    vuelves a prestar. Una autorización que se re-presta es una cadena que nadie
    puede seguir cuando haya que responder por lo firmado.
  */
  if not private.puede_accion_propia(p_accion) then
    raise exception 'No puedes extender "%" porque tú no la tienes por derecho propio.', v_accion.nombre
      using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe por qué se le extiende. Sin justificación, dentro de un mes nadie sabrá si esto sigue haciendo falta.'
      using errcode = '22023';
  end if;

  select nombre into v_nombre from public.perfiles where id = p_usuario_id and activo;
  if v_nombre is null then
    raise exception 'No existe esa persona, o está desactivada.' using errcode = 'P0002';
  end if;

  if p_usuario_id = v_yo then
    raise exception 'No puedes extenderte permisos a ti mismo.' using errcode = '42501';
  end if;

  if p_hasta is not null and p_hasta < v_desde then
    raise exception 'La fecha de fin no puede ser anterior a la de inicio.' using errcode = '22023';
  end if;

  -- Si ya la tiene por derecho propio, esto no le añadiría nada y dejaría en el
  -- papel un «bajo autorización de» que no corresponde. Se avisa en vez de
  -- guardar una fila muerta.
  if exists (
    select 1 from public.usuarios_roles ur
      join public.rol_permisos rp on rp.rol = ur.rol and rp.modulo = v_accion.modulo
      join public.roles r on r.codigo = ur.rol
     where ur.usuario_id = p_usuario_id and not r.a_la_medida
       and v_accion.nivel_equivalente is not null
       and private.rango_nivel(rp.nivel) >= private.rango_nivel(v_accion.nivel_equivalente)
    union all
    select 1 from public.usuarios_roles ur
      join public.rol_acciones ra on ra.rol = ur.rol and ra.accion = p_accion
     where ur.usuario_id = p_usuario_id
  ) then
    raise exception '% ya puede "%" por su rol. No hace falta extendérsela.', v_nombre, v_accion.nombre
      using errcode = '55000';
  end if;

  -- Una vigente para la misma persona y la misma casilla se retira sola: dos
  -- autorizaciones vivas de lo mismo dejan sin saber cuál es la que ampara el
  -- papel que se acaba de firmar.
  update public.autorizaciones
     set revocada_en = now(), revocada_por = v_yo,
         revocada_motivo = 'Sustituida por una nueva'
   where a_usuario = p_usuario_id and accion = p_accion and revocada_en is null;

  insert into public.autorizaciones
    (accion, a_usuario, por_usuario, desde, hasta, motivo, creada_por)
  values
    (p_accion, p_usuario_id, v_yo, v_desde, p_hasta, btrim(p_motivo), v_yo)
  returning id into v_id;

  return v_id;
end;
$func$;

revoke all on function public.autorizar_accion(uuid, text, text, date, date) from public, anon;
grant execute on function public.autorizar_accion(uuid, text, text, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Retirar
--
-- No se borra la fila: los papeles que se firmaron amparados en ella siguen
-- diciendo «bajo autorización de», y si la fila desaparece esa frase se queda
-- sin nada detrás. Se marca retirada, con fecha y con quién.
-- ---------------------------------------------------------------------------
create or replace function public.retirar_autorizacion(
  p_id     bigint,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
begin
  perform private.exigir_rol('ADMIN', 'GERENTE_GENERAL');

  update public.autorizaciones
     set revocada_en = now(),
         revocada_por = (select auth.uid()),
         revocada_motivo = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = p_id and revocada_en is null;

  if not found then
    raise exception 'Esa autorización no existe o ya estaba retirada.' using errcode = 'P0002';
  end if;
end;
$func$;

revoke all on function public.retirar_autorizacion(bigint, text) from public, anon;
grant execute on function public.retirar_autorizacion(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Lo que la pantalla necesita leer
-- ---------------------------------------------------------------------------
create or replace function public.autorizaciones_del_sistema()
returns table (
  id              bigint,
  accion          text,
  accion_nombre   text,
  modulo          text,
  modulo_nombre   text,
  a_usuario       uuid,
  a_nombre        text,
  por_usuario     uuid,
  por_nombre      text,
  desde           date,
  hasta           date,
  motivo          text,
  vigente         boolean,
  revocada_en     timestamptz,
  revocada_por    uuid,
  revocada_nombre text,
  revocada_motivo text,
  creada_en       timestamptz
)
language sql
stable
security definer
set search_path to ''
as $func$
  select d.id, d.accion, a.nombre, a.modulo, m.nombre,
         d.a_usuario, pa.nombre, d.por_usuario, pp.nombre,
         d.desde, d.hasta, d.motivo,
         d.revocada_en is null
           and d.desde <= current_date
           and (d.hasta is null or d.hasta >= current_date)
           and pa.activo,
         d.revocada_en, d.revocada_por, pr.nombre, d.revocada_motivo, d.creada_en
    from public.autorizaciones d
    join public.acciones a  on a.codigo = d.accion
    join public.modulos  m  on m.codigo = a.modulo
    join public.perfiles pa on pa.id = d.a_usuario
    join public.perfiles pp on pp.id = d.por_usuario
    left join public.perfiles pr on pr.id = d.revocada_por
   order by (d.revocada_en is null) desc, d.creada_en desc;
$func$;

revoke all on function public.autorizaciones_del_sistema() from public, anon;
grant execute on function public.autorizaciones_del_sistema() to authenticated;

-- Lo que tiene prestado quien mira, para que la pantalla sepa cuándo enseñar el
-- check y de quién es la autoridad que va a invocar.
create or replace function public.mis_autorizaciones()
returns table (accion text, por_nombre text, hasta date, motivo text)
language sql
stable
security definer
set search_path to ''
as $func$
  select d.accion, pp.nombre, d.hasta, d.motivo
    from public.autorizaciones d
    join public.perfiles pa on pa.id = d.a_usuario
    join public.perfiles pp on pp.id = d.por_usuario
   where d.a_usuario = (select auth.uid())
     and d.revocada_en is null
     and pa.activo
     and d.desde <= current_date
     and (d.hasta is null or d.hasta >= current_date);
$func$;

revoke all on function public.mis_autorizaciones() from public, anon;
grant execute on function public.mis_autorizaciones() to authenticated;

comment on function public.mis_autorizaciones() is
  'Lo que quien mira tiene prestado ahora mismo, y de quien. La pantalla lo usa para enseñar el check de «bajo autorizacion de» solo cuando de verdad hay una autorizacion detras.';
