-- ---------------------------------------------------------------------------
-- Las casillas se marcan desde la pantalla
--
-- La maquinaria estaba; faltaba la puerta para usarla. Esto trae lo que necesita
-- la pantalla de armar un rol: leer el catálogo, leer y escribir las casillas de
-- cada rol, y saber qué puede hacer QUIEN MIRA para esconderle los botones que
-- no le sirven.
--
-- =========================================================================
-- UN ROL DETALLADO NO SE QUEDA SIN LOS TRECE MÓDULOS QUE FALTAN
-- =========================================================================
--
-- Hoy solo Configuración y Respaldo tienen catálogo de acciones. Si «detallado»
-- quisiera decir «solo casillas, en todo el sistema», un rol nuevo no podría
-- tocar Compras ni Inventario ni Nómina hasta que estén los quince — o sea,
-- sería inservible durante días.
--
-- No hace falta, y sale gratis por cómo quedó la puerta: `puede_accion` ignora
-- el escalón para los roles detallados, pero las 124 funciones que todavía
-- llaman a `exigir_permiso` leen `rol_permisos` sin mirar de qué clase es el
-- rol. Así que un rol detallado se rige por CASILLAS donde hay catálogo y por
-- ESCALÓN donde todavía no lo hay.
--
-- Se afina módulo a módulo y nadie se queda esperando. La pantalla lo dice con
-- todas las letras, porque un rol que a veces se rige de una manera y a veces
-- de otra hay que explicarlo o parece roto.
--
-- COMPROBADO en el navegador, creando un rol desde la pantalla: las casillas se
-- marcan y se desmarcan, sobreviven a recargar, quien tiene el rol solo puede
-- lo marcado, y Compras —sin catálogo todavía— le sigue funcionando por
-- escalón. ADMIN no se deja recortar.
--
-- NOTA DE NOMBRE: la columna se llama `a_la_medida` y la pantalla dice
-- «Detallado». Christopher pidió cambiar el texto visible; el nombre interno se
-- queda para no arrastrar un renombrado por media base.
-- ---------------------------------------------------------------------------

create or replace function public.acciones_del_sistema()
returns table (
  codigo            text,
  modulo            text,
  modulo_nombre     text,
  nombre            text,
  dice              text,
  orden             smallint,
  nivel_equivalente text
)
language sql
stable
security definer
set search_path to ''
as $func$
  select a.codigo, a.modulo, m.nombre, a.nombre, a.dice, a.orden, a.nivel_equivalente
    from public.acciones a
    join public.modulos  m on m.codigo = a.modulo
   where a.activa
   order by m.orden, a.orden, a.nombre;
$func$;

revoke all on function public.acciones_del_sistema() from public, anon;
grant execute on function public.acciones_del_sistema() to authenticated;

create or replace function public.acciones_de_los_roles()
returns table (rol text, accion text)
language sql
stable
security definer
set search_path to ''
as $func$
  select ra.rol, ra.accion from public.rol_acciones ra;
$func$;

revoke all on function public.acciones_de_los_roles() from public, anon;
grant execute on function public.acciones_de_los_roles() to authenticated;

create or replace function public.marcar_accion_de_rol(
  p_rol     text,
  p_accion  text,
  p_marcada boolean
)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
begin
  perform private.exigir_rol('ADMIN');

  if not exists (select 1 from public.roles where codigo = p_rol) then
    raise exception 'No existe el rol "%".', p_rol using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.acciones where codigo = p_accion) then
    raise exception 'No existe la acción "%".', p_accion using errcode = 'P0002';
  end if;

  -- ADMIN no se toca. Es la misma razón por la que `tiene_permiso` lo deja
  -- pasar siempre: si se le pudieran quitar casillas, una tarde de clics
  -- cerraría la pantalla de permisos y no habría manera de volver a abrirla.
  if p_rol = 'ADMIN' then
    raise exception 'El rol de administrador no se recorta: es el que puede volver a abrir lo que se cierre.'
      using errcode = '42501';
  end if;

  if coalesce(p_marcada, false) then
    insert into public.rol_acciones (rol, accion, puesta_por)
    values (p_rol, p_accion, (select auth.uid()))
    on conflict (rol, accion) do nothing;
  else
    delete from public.rol_acciones where rol = p_rol and accion = p_accion;
  end if;
end;
$func$;

revoke all on function public.marcar_accion_de_rol(text, text, boolean) from public, anon;
grant execute on function public.marcar_accion_de_rol(text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- La clase de rol se elige al crearlo, y se puede cambiar después
--
-- Ganan un parámetro al final, con valor por defecto, para que lo que ya las
-- llama siga resolviendo igual — PostgREST resuelve por nombre.
-- ---------------------------------------------------------------------------
create or replace function public.crear_rol(
  p_codigo      text,
  p_nombre      text,
  p_descripcion text,
  p_a_la_medida boolean default false
)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
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

  insert into public.roles (codigo, nombre, descripcion, a_la_medida)
  values (v_codigo, btrim(p_nombre), btrim(coalesce(p_descripcion, '')),
          coalesce(p_a_la_medida, false));
exception
  when unique_violation then
    raise exception 'Ya existe un rol con el código %.', v_codigo using errcode = '23505';
end;
$func$;

revoke all on function public.crear_rol(text, text, text, boolean) from public, anon;
grant execute on function public.crear_rol(text, text, text, boolean) to authenticated;

create or replace function public.guardar_rol(
  p_codigo      text,
  p_nombre      text,
  p_descripcion text,
  p_a_la_medida boolean default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
begin
  perform private.exigir_rol('ADMIN');

  if length(btrim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'El rol necesita un nombre.' using errcode = '22023';
  end if;

  -- Nulo deja la clase como estaba: quien solo viene a corregir el nombre no
  -- tiene por qué cambiar de qué se rige el rol sin querer.
  update public.roles
     set nombre = btrim(p_nombre),
         descripcion = btrim(coalesce(p_descripcion, '')),
         a_la_medida = coalesce(p_a_la_medida, a_la_medida)
   where codigo = p_codigo;

  if not found then
    raise exception 'No existe el rol "%".', p_codigo using errcode = 'P0002';
  end if;
end;
$func$;

revoke all on function public.guardar_rol(text, text, text, boolean) from public, anon;
grant execute on function public.guardar_rol(text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Lo que puede hacer QUIEN MIRA, para esconderle los botones
--
-- Es el gemelo de `mis_permisos`. Sin esto, la pantalla solo sabe el escalón, y
-- «ver pero no modificar» —que es la mitad de lo que se pidió— no se puede
-- pintar: los botones seguirían ahí para fallar al pulsarlos.
-- ---------------------------------------------------------------------------
create or replace function public.mis_acciones()
returns setof text
language sql
stable
security definer
set search_path to ''
as $func$
  select a.codigo
    from public.acciones a
   where a.activa
     and private.puede_accion(a.codigo);
$func$;

revoke all on function public.mis_acciones() from public, anon;
grant execute on function public.mis_acciones() to authenticated;

comment on function public.mis_acciones() is
  'Las acciones que quien llama puede hacer. La pantalla las usa para esconder botones: sin esto, «ver pero no modificar» no se puede pintar y los botones se quedan para fallar al pulsarlos.';
