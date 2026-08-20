-- ---------------------------------------------------------------------------
-- Cada artículo cuenta su historia desde que se creó
--
-- LO QUE PASABA
--
-- Todo lo que le ocurre a un artículo estaba registrado, y repartido en tres
-- sitios que nadie cruza a mano: el libro de inventario, las asignaciones y la
-- propia fila del catálogo. Para saber qué le había pasado a un neumático había
-- que abrir Movimientos, filtrar, abrir Asignaciones, buscar por artículo, y
-- juntarlo de cabeza.
--
-- Christopher lo pidió con la comparación exacta: «tal como ya lo hacen las
-- solicitudes de compras». Una compra sí cuenta su historia seguida.
--
-- POR QUÉ UNA VISTA Y NO UNA TABLA DE REGISTRO
--
-- La bitácora de compras es una tabla porque registra **transiciones de
-- estado**, que no dejan rastro en ningún otro sitio: que una orden pasó de
-- aprobada a en tesorería no se deduce de nada.
--
-- Aquí es al revés. Cada hecho ya está escrito y es inmutable: la entrada está
-- en el libro, la entrega en su asignación, el nacimiento en `creado_en`. Una
-- tabla nueva sería copiarlos, y copiar es la forma más segura de que un día
-- las dos versiones no coincidan.
--
-- QUÉ ENTRA
--
--   El nacimiento          — de `articulos.creado_en`
--   Todo el libro          — entradas, salidas, ajustes, transferencias y
--                            reversos, con su tipo dicho en palabras
--   La vida de lo prestado — entrega, devolución, pérdida o daño, y reposición
--
-- Los cuatro momentos de una asignación salen como cuatro hechos y no como uno
-- con estado: en una historia importa cuándo se entregó **y** cuándo volvió, no
-- solo dónde acabó.
--
-- EL SIGNO DICE SI SUMÓ O RESTÓ
--
-- +1, -1 o 0 para lo que no mueve existencia —una entrega retornable no
-- descuenta, el bien sigue siendo de la empresa—. Así la pantalla puede pintar
-- la flecha sin volver a interpretar el tipo.
-- ---------------------------------------------------------------------------
create or replace view public.v_historial_articulo as

-- 1. Nació
select a.id                          as articulo_id,
       a.creado_en                   as ocurrido_en,
       a.creado_en::date             as fecha,
       'CREACION'::text              as tipo,
       'Se creó en el catálogo'::text as titulo,
       a.categoria || ' · ' || a.unidad as detalle,
       null::numeric                 as cantidad,
       0                             as signo,
       null::text                    as almacen,
       null::text                    as documento,
       coalesce(p.nombre, p.usuario) as quien,
       null::text                    as persona
  from public.articulos a
  left join public.perfiles p on p.id = a.creado_por

union all

-- 2. Todo lo que movió el libro
select m.articulo_id,
       m.registrado_en,
       m.fecha,
       m.tipo,
       case m.tipo
         when 'ENTRADA_COMPRA'        then 'Entró por una compra'
         when 'ENTRADA_PRODUCCION'    then 'Entró por producción'
         when 'ENTRADA_DEVOLUCION'    then 'Volvió al almacén'
         when 'SALIDA_CONSUMO'        then 'Salió para consumo'
         when 'SALIDA_DESPACHO'       then 'Salió en un despacho'
         when 'SALIDA_MERMA'          then 'Se dio de baja por merma'
         when 'AJUSTE_POSITIVO'       then 'Ajuste: sobraba'
         when 'AJUSTE_NEGATIVO'       then 'Ajuste: faltaba'
         when 'TRANSFERENCIA_SALIDA'  then 'Se transfirió a otro almacén'
         when 'TRANSFERENCIA_ENTRADA' then 'Llegó de otro almacén'
         when 'REVERSO'               then 'Se reversó un movimiento'
         else m.tipo
       end,
       m.nota,
       m.cantidad,
       m.signo,
       al.nombre,
       m.numero,
       coalesce(pf.nombre, pf.usuario),
       case when m.empleado_id is not null
            then e.nombres || ' ' || e.apellidos end
  from public.inventario_movimientos m
  join public.almacenes al on al.id = m.almacen_id
  left join public.perfiles  pf on pf.id = m.registrado_por
  left join public.empleados e  on e.id = m.empleado_id

union all

-- 3. Se entregó a alguien y sigue siendo de la empresa
select g.articulo_id,
       g.creado_en,
       g.fecha_entrega,
       'ENTREGA'::text,
       case when g.clase = 'DOTACION'
            then 'Se entregó como dotación'
            else 'Se asignó para una actividad' end,
       g.nota,
       g.cantidad,
       0,
       al.nombre,
       g.numero,
       coalesce(pf.nombre, pf.usuario),
       e.nombres || ' ' || e.apellidos
  from public.asignaciones_herramienta g
  join public.almacenes al on al.id = g.almacen_id
  join public.empleados  e  on e.id = g.empleado_id
  left join public.perfiles pf on pf.id = g.entregado_por

union all

-- 4. Volvió
select g.articulo_id,
       g.fecha_devolucion::timestamptz,
       g.fecha_devolucion,
       'DEVOLUCION'::text,
       'La devolvió'::text,
       g.nota,
       g.cantidad,
       0,
       al.nombre,
       g.numero,
       null::text,
       e.nombres || ' ' || e.apellidos
  from public.asignaciones_herramienta g
  join public.almacenes al on al.id = g.almacen_id
  join public.empleados  e  on e.id = g.empleado_id
 where g.fecha_devolucion is not null

union all

-- 5. Se perdió o se dañó
select g.articulo_id,
       g.fecha_perdida::timestamptz,
       g.fecha_perdida,
       g.estado,
       case g.estado
         when 'PERDIDA' then 'Se dio por perdida'
         when 'DANADA'  then 'Se reportó dañada'
         else 'Incidencia' end,
       g.motivo,
       g.cantidad,
       -- La pérdida sí se lleva la existencia por delante; el daño no
       -- necesariamente, pero eso lo decide quien la reporta y queda en el
       -- libro como un movimiento aparte.
       0,
       al.nombre,
       g.numero,
       null::text,
       e.nombres || ' ' || e.apellidos
  from public.asignaciones_herramienta g
  join public.almacenes al on al.id = g.almacen_id
  join public.empleados  e  on e.id = g.empleado_id
 where g.fecha_perdida is not null
   and g.estado in ('PERDIDA', 'DANADA', 'REPUESTA')

union all

-- 6. Se saldó lo perdido
select g.articulo_id,
       g.saldado_el::timestamptz,
       g.saldado_el::date,
       'REPUESTA'::text,
       case g.saldado_como
         when 'DESCUENTO'  then 'Se saldó con descuento de nómina'
         when 'REPOSICION' then 'La repuso'
         when 'EXONERADO'  then 'Se le exoneró'
         else 'Se saldó' end,
       g.motivo,
       g.cantidad,
       0,
       al.nombre,
       g.numero,
       null::text,
       e.nombres || ' ' || e.apellidos
  from public.asignaciones_herramienta g
  join public.almacenes al on al.id = g.almacen_id
  join public.empleados  e  on e.id = g.empleado_id
 where g.saldado_el is not null;

alter view public.v_historial_articulo set (security_invoker = on);

comment on view public.v_historial_articulo is
  'Todo lo que le ha pasado a un artículo, en una línea de tiempo: su creación, '
  'cada movimiento del libro y la vida de lo que se prestó. No es una tabla '
  'nueva — cada hecho ya estaba escrito en su sitio, y copiarlos sería '
  'garantizar que un día no coincidan.';

grant select on public.v_historial_articulo to authenticated;
