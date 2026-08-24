-- ---------------------------------------------------------------------------
-- Las categorías de gasto tienen dos niveles
--
-- La especificación de la líder listaba seis categorías, y dos se solapaban por
-- escrito: «Compras e insumos (médicos, de oficina, etc.)» y «Gastos
-- administrativos». El papel de oficina cabía en las dos, y resulta que el papel
-- de oficina es el gasto más grande que hay hoy en la base.
--
-- Se preguntó, y Christopher lo resolvió:
--
--   «Es la categoría de la categoría, o la especificación de la especificación:
--    todo depende de a qué nivel se esté tratando. Ejemplo: ¿Gastos
--    administrativos? => (médicos, de oficina, etc.)»
--
-- O sea que no eran seis casillas planas que competían entre sí, sino DOS
-- NIVELES. Médicos y oficina no están al lado de administrativos: están dentro.
--
-- POR QUÉ UNA TABLA Y NO UN CHECK
--
-- La casa clasifica catálogos con CHECK sobre text (regla 3), y para los estados
-- de un documento está bien: los inventa el sistema y cambian con una migración.
--
-- Esta lista no. La va a tocar la líder cuando vea el primer informe, y el
-- ejemplo que dio Christopher lo dice todo: MEDICOS puede colgar de
-- ADMINISTRATIVOS o de COMPRAS_INSUMOS según cómo mire la empresa su propio
-- gasto. Con un CHECK, mover una subcategoría de padre sería una migración; con
-- una tabla es un UPDATE de una fila.
--
-- Los seis de primer nivel sí son los que pidió y no se inventan otros: quien
-- quiera añadir, añade dentro.
--
-- POR QUÉ EL PORCENTAJE SE MIDE CONTRA EL NIVEL QUE SE PIDE
--
-- Si se midiera siempre contra el gasto total, al entrar en una categoría las
-- porciones sumarían un veinte por ciento y la torta no cerraría. Quien mira el
-- detalle de nómina quiere saber qué parte DE LA NÓMINA es cada cosa.
--
-- LO QUE SE DEDUCE, SE DEDUCE AL NIVEL FINO
--
-- Un pago de nómina no cae en NOMINA a secas sino en SUELDOS, y una orden de
-- puros repuestos en LUBRICANTES. Así la torta de primer nivel se arma sumando
-- hacia arriba, y el detalle ya está ahí sin preguntarle nada a nadie.
--
-- COMPROBADO contra los ocho egresos reales:
--
--   nivel 1   Compras e insumos   13.942,04 USD  79,1%   (se puede abrir)
--             Nómina y sueldos     3.691,91 USD  20,9%   (se puede abrir)
--   dentro de COMPRAS_INSUMOS   Insumos varios  13.942,04  100,0%
--   dentro de NOMINA            Sueldos         3.691,91   100,0%
-- ---------------------------------------------------------------------------

create table if not exists public.categorias_gasto (
  codigo  text primary key,
  nombre  text not null,
  padre   text references public.categorias_gasto(codigo),
  orden   smallint not null default 100,
  activa  boolean not null default true,
  constraint categoria_no_es_su_propio_padre check (padre is null or padre <> codigo)
);

comment on table public.categorias_gasto is
  'En qué se gasta, en dos niveles. Christopher: «es la categoría de la categoría; todo depende de a qué nivel se esté tratando». Los seis padres son los que pidió la líder; los hijos se pueden mover de padre sin migración.';
comment on column public.categorias_gasto.padre is
  'Nulo en los seis de primer nivel. En los demás, de qué cuelgan — y puede cambiar: MEDICOS puede colgar de ADMINISTRATIVOS o de COMPRAS_INSUMOS según cómo lo mire la empresa.';

insert into public.categorias_gasto (codigo, nombre, padre, orden) values
  ('NOMINA',           'Nómina y sueldos',           null, 10),
  ('COMPRAS_INSUMOS',  'Compras e insumos',          null, 20),
  ('MANTENIMIENTO',    'Mantenimiento de maquinaria',null, 30),
  ('COMBUSTIBLE',      'Combustible',                null, 40),
  ('ALIMENTACION',     'Alimentación',               null, 50),
  ('ADMINISTRATIVOS',  'Gastos administrativos',     null, 60),

  ('SUELDOS',          'Sueldos y salarios',         'NOMINA', 11),
  ('BONOS',            'Bonos y complementos',       'NOMINA', 12),
  ('PRESTACIONES',     'Prestaciones y anticipos',   'NOMINA', 13),
  ('LIQUIDACIONES',    'Liquidaciones',              'NOMINA', 14),

  ('REPUESTOS',        'Repuestos',                  'COMPRAS_INSUMOS', 21),
  ('HERRAMIENTAS',     'Herramientas',               'COMPRAS_INSUMOS', 22),
  ('EPP',              'Equipo de protección',       'COMPRAS_INSUMOS', 23),
  ('INSUMOS_VARIOS',   'Insumos varios',             'COMPRAS_INSUMOS', 24),

  ('TALLER_PROPIO',    'Taller propio',              'MANTENIMIENTO', 31),
  ('TALLER_EXTERNO',   'Taller externo',             'MANTENIMIENTO', 32),
  ('SERVICIO_TECNICO', 'Servicio técnico',           'MANTENIMIENTO', 33),
  ('LUBRICANTES',      'Lubricantes y filtros',      'MANTENIMIENTO', 34),

  ('GASOIL',           'Gasoil',                     'COMBUSTIBLE', 41),
  ('GASOLINA',         'Gasolina',                   'COMBUSTIBLE', 42),

  ('COMEDOR',          'Comedor y refrigerios',      'ALIMENTACION', 51),
  ('VIATICOS',         'Viáticos',                   'ALIMENTACION', 52),

  ('MEDICOS',          'Médicos y seguridad laboral','ADMINISTRATIVOS', 61),
  ('OFICINA',          'Papelería y oficina',        'ADMINISTRATIVOS', 62),
  ('SERVICIOS',        'Servicios (luz, agua, internet)', 'ADMINISTRATIVOS', 63),
  ('LEGALES',          'Legales, permisos e impuestos',   'ADMINISTRATIVOS', 64)
on conflict (codigo) do nothing;

alter table public.categorias_gasto enable row level security;

-- La lista de categorías la puede leer cualquiera con sesión: es un catálogo de
-- rótulos, no un dato de negocio. Cerrarla obligaría a abrirla en cinco sitios.
drop policy if exists categorias_gasto_lectura on public.categorias_gasto;
create policy categorias_gasto_lectura on public.categorias_gasto
  for select using (auth.uid() is not null);

revoke insert, update, delete on public.categorias_gasto from authenticated;

-- El CHECK de seis valores planos se cambia por la clave foránea: ahora la lista
-- vive en una tabla y admite dos niveles.
alter table public.tesoreria_movimientos
  drop constraint if exists tesoreria_movimientos_categoria_check;

alter table public.tesoreria_movimientos
  drop constraint if exists tesoreria_movimientos_categoria_fkey;

alter table public.tesoreria_movimientos
  add constraint tesoreria_movimientos_categoria_fkey
  foreign key (categoria) references public.categorias_gasto(codigo);

-- ---------------------------------------------------------------------------
-- La vista, ahora con los dos niveles
-- ---------------------------------------------------------------------------
create or replace view public.v_gastos as
with clase_de_orden as (
  select r.orden_id,
         bool_and(a.categoria = 'COMBUSTIBLE')                              as todo_combustible,
         bool_or(a.categoria in ('REPUESTO', 'LUBRICANTE'))                 as hay_taller,
         bool_or(a.categoria = 'HERRAMIENTA')                               as hay_herramienta,
         bool_or(a.categoria = 'EPP')                                       as hay_epp
    from public.orden_renglones r
    join public.articulos a on a.id = r.articulo_id
   group by r.orden_id
),
con_clase as (
  select
    m.*,
    coalesce(
      m.categoria,
      case
        when m.nomina_periodo_id is not null then 'SUELDOS'
        when co.todo_combustible             then 'GASOIL'
        when co.hay_taller                   then 'LUBRICANTES'
        when co.hay_herramienta              then 'HERRAMIENTAS'
        when co.hay_epp                      then 'EPP'
        when m.orden_id is not null          then 'INSUMOS_VARIOS'
      end
    ) as clase
  from public.tesoreria_movimientos m
  left join clase_de_orden co on co.orden_id = m.orden_id
  where m.signo = -1
)
select
  g.id,
  g.numero,
  g.fecha,
  g.concepto,
  g.contraparte,
  g.referencia,
  g.tipo,
  g.monto,
  g.monto_usd,
  g.monto_bs,
  g.cuenta_id,
  g.orden_id,
  g.nomina_periodo_id,
  g.registrado_en,
  g.categoria as categoria_puesta,
  g.clase     as categoria,
  c.nombre    as categoria_nombre,
  -- El de primer nivel: el padre si lo tiene, y si no, él mismo. Es lo que
  -- pinta la torta; el detalle de dentro es la clase.
  coalesce(c.padre, c.codigo)  as categoria_raiz,
  coalesce(p.nombre, c.nombre) as categoria_raiz_nombre
from con_clase g
left join public.categorias_gasto c on c.codigo = g.clase
left join public.categorias_gasto p on p.codigo = c.padre;

alter view public.v_gastos set (security_invoker = on);

comment on view public.v_gastos is
  'Los egresos con su clase, en dos niveles. La que puso una persona manda; si no la hay se deduce del origen. Nula significa sin clasificar, y se enseña como tal en vez de inventarle una casilla.';

-- ---------------------------------------------------------------------------
-- El reparto, por el nivel que se pida
--
-- Se borra y se crea porque cambia la lista de argumentos: PostgREST resuelve
-- por nombre, y un `create or replace` dejaría dos funciones.
-- ---------------------------------------------------------------------------
drop function if exists public.gasto_por_categoria(date, date);

create function public.gasto_por_categoria(
  p_desde date default null,
  p_hasta date default null,
  p_padre text default null
)
returns table (
  codigo      text,
  nombre      text,
  veces       bigint,
  total_usd   numeric,
  porcentaje  numeric,
  tiene_hijos boolean
)
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_total numeric;
begin
  perform private.exigir_permiso('COMPRAS', 'LECTURA');

  -- El porcentaje se mide contra el total del MISMO nivel que se pide. Si se
  -- midiera siempre contra el gasto entero, al bajar a una categoría las
  -- porciones sumarían un 20% y la torta no cerraría.
  select coalesce(sum(g.monto_usd), 0) into v_total
    from public.v_gastos g
   where (p_desde is null or g.fecha >= p_desde)
     and (p_hasta is null or g.fecha <= p_hasta)
     and (p_padre is null or g.categoria_raiz = p_padre);

  return query
  with agrupado as (
    select case when p_padre is null
                then coalesce(g.categoria_raiz, 'SIN_CLASIFICAR')
                else coalesce(g.categoria, 'SIN_CLASIFICAR')
           end as cod,
           case when p_padre is null
                then coalesce(g.categoria_raiz_nombre, 'Sin clasificar')
                else coalesce(g.categoria_nombre, 'Sin clasificar')
           end as nom,
           count(*) as n,
           sum(g.monto_usd) as suma
      from public.v_gastos g
     where (p_desde is null or g.fecha >= p_desde)
       and (p_hasta is null or g.fecha <= p_hasta)
       and (p_padre is null or g.categoria_raiz = p_padre)
     group by 1, 2
  )
  select a.cod,
         a.nom,
         a.n,
         round(a.suma, 2),
         case when v_total > 0 then round(a.suma * 100 / v_total, 1) else 0 end,
         exists (select 1 from public.categorias_gasto h where h.padre = a.cod)
    from agrupado a
   order by 4 desc;
end;
$func$;

comment on function public.gasto_por_categoria(date, date, text) is
  'En qué se gastó. Sin padre, los seis de primer nivel para la torta; con padre, el detalle de dentro. Lo que no se puede clasificar sale como SIN_CLASIFICAR en vez de repartirse.';

revoke all on function public.gasto_por_categoria(date, date, text) from public;
revoke all on function public.gasto_por_categoria(date, date, text) from anon;
grant execute on function public.gasto_por_categoria(date, date, text) to authenticated;
