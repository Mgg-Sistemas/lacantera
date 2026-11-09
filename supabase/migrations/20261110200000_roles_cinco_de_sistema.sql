-- ROLES Y PERMISOS DESDE CERO (la dueña, 09/11/2026)
--
-- «Vamos a borrar todos los permisos. Y vas a colocar por sistema:
-- administrador de sistemas, analista de compras (compras, inventario,
-- alimentación), analista de ventas (solo ventas y facturación), almacenista
-- (inventario, almacenes, salidas y traslados). Los demás se borran. Permite
-- crear nuevos roles. TODOS los usuarios por defecto tendrán acceso a
-- solicitud de pedido, con vista de PC y de teléfono.»
-- Y, al preguntarle: se crea además «Recursos humanos» (personal, asistencia
-- y nómina). «Los usuarios que queden sin permisos se les otorgará
-- manualmente por sistemas.»
--
-- LOS CÓDIGOS SE QUEDAN (ADMIN, COMPRAS, VENTAS, ALMACEN, RRHH): más de 300
-- reglas de la base y de las pantallas preguntan por ellos. Cambia el nombre
-- que se ve, la matriz y quién lo tiene.
--
-- Reparto (por el rol que cada quien tenía; elegido por la dueña):
--   rol de almacén (teléfono)                     → ALMACEN  (Almacenista)
--   gerente general + compras…, compras + almacén… → COMPRAS (Analista de compras)
--   almacén + ventas + vende y factura…           → VENTAS   (Analista de ventas)
--   recursos humanos                              → RRHH     (Recursos humanos)
--   el resto de roles combinados                  → sin rol (sistemas lo asigna)
--
-- La solicitud de pedido no depende de ningún rol: cualquier usuario activo
-- ve el panel (PANEL en lectura) y pide. Por eso quien queda sin rol sigue
-- pudiendo entrar a pedir.
--
-- Antes de tocar nada se guarda todo en `roles_respaldo_20261109`.

-- ---------------------------------------------------------------------------
-- 0. Respaldo
-- ---------------------------------------------------------------------------
create table if not exists public.roles_respaldo_20261109 (
  tabla text not null,
  datos jsonb not null,
  guardado_en timestamptz not null default now()
);
alter table public.roles_respaldo_20261109 enable row level security;
revoke all on public.roles_respaldo_20261109 from anon, authenticated;

insert into public.roles_respaldo_20261109 (tabla, datos)
select 'roles', to_jsonb(r) from public.roles r
union all select 'usuarios_roles', to_jsonb(u) from public.usuarios_roles u
union all select 'rol_permisos', to_jsonb(p) from public.rol_permisos p
union all select 'rol_acciones', to_jsonb(a) from public.rol_acciones a
union all select 'rol_incluye', to_jsonb(i) from public.rol_incluye i
union all select 'rol_permisos_por_defecto', to_jsonb(d) from public.rol_permisos_por_defecto d;

-- ---------------------------------------------------------------------------
-- 1. Todo usuario activo ve el panel (y con él, pide)
-- ---------------------------------------------------------------------------
-- Con el mismo `default 'LECTURA'` que ya tenía: `create or replace` no deja
-- quitarlo (42P13).
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
  --
  -- PANEL en lectura lo tiene todo usuario activo, con rol o sin él
  -- (09/11/2026): es lo que hace falta para hacer una solicitud de pedido
  -- (catálogo de artículos, tasa, propietarios), y pedir lo puede cualquiera.
  select private.tiene_rol('ADMIN')
      or (
           p_modulo = 'PANEL'
           and private.rango_nivel(p_nivel) <= private.rango_nivel('LECTURA')
           and exists (select 1 from public.perfiles p
                        where p.id = (select auth.uid()) and p.activo)
         )
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

create or replace function public.mis_permisos()
returns table(modulo text, nivel text)
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
                 and rp.nivel <> 'NINGUNO'
               order by private.rango_nivel(rp.nivel) desc
               limit 1),
             -- El panel, para todo usuario activo (ver private.tiene_permiso).
             case when m.codigo = 'PANEL'
                   and exists (select 1 from public.perfiles p
                                where p.id = (select auth.uid()) and p.activo)
                  then 'LECTURA' end,
             'NINGUNO')
         end
  from public.modulos m
  order by m.orden;
$$;

-- ---------------------------------------------------------------------------
-- 2. Los cinco roles
-- ---------------------------------------------------------------------------
update public.roles set
  nombre = v.nombre, descripcion = v.descripcion, orden = v.orden,
  sistema = true, a_la_medida = false, solo_telefono = false
from (values
  ('ADMIN',   'Administrador de sistemas', 'Todo el sistema. Asigna roles y permisos.', 10),
  ('COMPRAS', 'Analista de compras',       'Compras, inventario y alimentación.', 20),
  ('VENTAS',  'Analista de ventas',        'Ventas y facturación.', 30),
  ('ALMACEN', 'Almacenista',               'Inventario, almacenes, salidas y traslados.', 40),
  ('RRHH',    'Recursos humanos',          'Personal, asistencia y nómina.', 50)
) as v(codigo, nombre, descripcion, orden)
where roles.codigo = v.codigo;

-- 2a. Quién queda con cuál (por el rol que tenía).
update public.usuarios_roles ur set rol = m.nuevo
from (values
  ('ALMACEN_ALMACEN_TELEFONO_VE_PERSONAL_ALMACEN01',                 'ALMACEN'),
  ('ALMACEN_TELEFONO',                                               'ALMACEN'),
  ('GERENTE_GENERAL_COMPRAS_ALMACEN_VENTAS_OPERACIONES',             'COMPRAS'),
  ('COMPRAS_ALMACEN_VENTAS_OPERACIONES_RRHH',                        'COMPRAS'),
  ('ALMACEN_VENTAS_VENDE_Y_FACTURA_OPERACIONES_AUDITOR_ADMINISTRADOR2', 'VENTAS'),
  ('ALMACEN_VENTAS_VENDE_Y_FACTURA_OPERACIONES_RRHH_GENESIS',         'VENTAS'),
  ('VENDE_Y_FACTURA',                                                'VENTAS'),
  ('RRHH_RRHH01',                                                    'RRHH')
) as m(viejo, nuevo)
where ur.rol = m.viejo;

-- 2b. Las acciones marcadas que cada rol nuevo hereda de los que lo forman,
--     solo de sus módulos (las de teléfono se reparten aparte, abajo).
create temporary table _acciones_nuevas on commit drop as
select distinct f.nuevo as rol, ra.accion
  from public.rol_acciones ra
  join public.acciones a on a.codigo = ra.accion
  join (values
    ('COMPRAS', 'COMPRAS'), ('COMPRAS', 'ALMACEN'),
    ('VENTAS', 'VENTAS'), ('VENTAS', 'VENDE_Y_FACTURA'),
    ('ALMACEN', 'ALMACEN'), ('ALMACEN', 'ALMACEN_TELEFONO'),
    ('RRHH', 'RRHH')
  ) as f(nuevo, fuente) on f.fuente = ra.rol
  join (values
    ('COMPRAS', 'COMPRAS'), ('COMPRAS', 'INVENTARIO'), ('COMPRAS', 'ALIMENTACION'),
    ('VENTAS', 'VENTAS'), ('VENTAS', 'FACTURACION'),
    ('ALMACEN', 'INVENTARIO'), ('ALMACEN', 'SALIDAS'),
    ('RRHH', 'NOMINA'), ('RRHH', 'ASISTENCIA')
  ) as mm(rol, modulo) on mm.rol = f.nuevo and mm.modulo = a.modulo
 where a.codigo not like '%TELEFONO%';

-- 2c. Fuera los demás: primero quien los tenga queda sin rol, luego el rol
--     (con su matriz, sus acciones y sus combinaciones, en cascada).
delete from public.usuarios_roles
 where rol not in ('ADMIN', 'COMPRAS', 'VENTAS', 'ALMACEN', 'RRHH');
delete from public.rol_incluye;
delete from public.roles
 where codigo not in ('ADMIN', 'COMPRAS', 'VENTAS', 'ALMACEN', 'RRHH');

-- 2d. La matriz de los cuatro (ADMIN sigue en TOTAL en todo). Lo que no se
--     nombra queda en NINGUNO.
create temporary table _matriz on commit drop as
select r.rol, m.codigo as modulo, coalesce(n.nivel, 'NINGUNO') as nivel
  from (values ('COMPRAS'), ('VENTAS'), ('ALMACEN'), ('RRHH')) as r(rol)
  cross join public.modulos m
  left join (values
    ('COMPRAS', 'PANEL', 'LECTURA'), ('COMPRAS', 'COMPRAS', 'TOTAL'),
    ('COMPRAS', 'INVENTARIO', 'ESCRITURA'), ('COMPRAS', 'ALIMENTACION', 'ESCRITURA'),
    ('VENTAS', 'PANEL', 'LECTURA'), ('VENTAS', 'VENTAS', 'TOTAL'),
    ('VENTAS', 'FACTURACION', 'TOTAL'),
    ('ALMACEN', 'PANEL', 'LECTURA'), ('ALMACEN', 'INVENTARIO', 'ESCRITURA'),
    ('ALMACEN', 'SALIDAS', 'ESCRITURA'),
    ('RRHH', 'PANEL', 'LECTURA'), ('RRHH', 'NOMINA', 'ESCRITURA'),
    ('RRHH', 'ASISTENCIA', 'ESCRITURA')
  ) as n(rol, modulo, nivel) on n.rol = r.rol and n.modulo = m.codigo;

delete from public.rol_permisos where rol in ('COMPRAS', 'VENTAS', 'ALMACEN', 'RRHH');
insert into public.rol_permisos (rol, modulo, nivel) select rol, modulo, nivel from _matriz;

delete from public.rol_permisos_por_defecto where rol in ('COMPRAS', 'VENTAS', 'ALMACEN', 'RRHH');
insert into public.rol_permisos_por_defecto (rol, modulo, nivel) select rol, modulo, nivel from _matriz;

delete from public.rol_acciones where rol in ('COMPRAS', 'VENTAS', 'ALMACEN', 'RRHH');
insert into public.rol_acciones (rol, accion) select rol, accion from _acciones_nuevas;

-- 2e. Las pantallas de teléfono de cada quien. En la PC se sigue entrando al
--     panel; en el teléfono, a su pantalla (Entrada.tsx).
insert into public.rol_acciones (rol, accion)
select v.rol, v.accion
  from (values
    ('COMPRAS', 'COMPRAS.TELEFONO'),
    ('ALMACEN', 'INVENTARIO.ALMACEN_TELEFONO'),
    ('ALMACEN', 'INVENTARIO.SOLICITUDES_TELEFONO')
  ) as v(rol, accion)
 where exists (select 1 from public.acciones a where a.codigo = v.accion)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Comprobación: si algo no cuadra, no se guarda nada.
-- ---------------------------------------------------------------------------
do $verificar$
declare
  v_roles int;
  v_ajenos int;
  v_admins int;
begin
  select count(*) into v_roles from public.roles;
  if v_roles <> 5 then
    raise exception 'Quedaron % roles, se esperaban 5', v_roles;
  end if;

  select count(*) into v_ajenos from public.usuarios_roles
   where rol not in ('ADMIN', 'COMPRAS', 'VENTAS', 'ALMACEN', 'RRHH');
  if v_ajenos > 0 then
    raise exception 'Quedaron % usuarios con un rol borrado', v_ajenos;
  end if;

  select count(*) into v_admins from public.usuarios_roles ur
    join public.perfiles p on p.id = ur.usuario_id
   where ur.rol = 'ADMIN' and p.activo;
  if v_admins = 0 then
    raise exception 'No quedó ningún administrador activo';
  end if;

  if exists (select 1 from public.rol_permisos rp
              where rp.rol = 'ADMIN' and rp.nivel <> 'TOTAL') then
    raise exception 'ADMIN perdió algún módulo';
  end if;
end
$verificar$;
