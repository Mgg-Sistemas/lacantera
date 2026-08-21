-- ---------------------------------------------------------------------------
-- Inventario puede recibir sin una compra detrás
--
-- LO QUE PASABA
--
-- La única forma de meter mercancía **con su costo** era `registrar_recepcion`,
-- que exige una orden de compra. `registrar_ajuste` sube la cantidad, sí, pero
-- valora lo que entra al costo promedio que ya había — y para un artículo que
-- nunca ha entrado, ese promedio es cero. Cargar el saldo inicial por ajuste
-- dejaba el almacén lleno y valorado en nada.
--
-- Christopher puso Inventario de primero en el MVP y con una condición:
-- «debe funcionar individual, no hace falta que intervenga explotación,
-- compras o ventas». Sin esta puerta no podía.
--
-- LA DIFERENCIA CON UN AJUSTE, QUE NO ES UN DETALLE
--
--   Entrada directa — entró algo y costó esto. Lo trajo alguien, se pagó por
--                     fuera, es el saldo con el que arranca el almacén. Lleva
--                     su costo porque su costo es un dato que se conoce.
--
--   Ajuste positivo — el conteo dice que hay más de lo que el sistema creía.
--                     No entró nada: apareció. Vale lo que vale el resto, y
--                     por eso hereda el promedio en vez de traer costo propio.
--
-- Son dos hechos distintos y por eso son dos movimientos distintos. Meterlos
-- en el mismo sitio haría imposible responder después a «¿cuánto material
-- entró de verdad este mes?», porque los descuadres del conteo contarían como
-- entradas.
--
-- POR QUÉ SE EXIGE COSTO MAYOR QUE CERO
--
-- Una entrada a costo cero arrastra el promedio del artículo hacia abajo y
-- envenena toda valoración posterior, sin que nadie se entere hasta que el
-- inventario vale la mitad de lo que vale. Si algo de verdad no costó nada
-- —una donación, un sobrante que aparece—, el movimiento que le corresponde es
-- el ajuste positivo, que lo valora como el resto. El mensaje lo dice.
-- ---------------------------------------------------------------------------

alter table public.inventario_movimientos
  drop constraint if exists inventario_movimientos_tipo_check;

alter table public.inventario_movimientos
  add constraint inventario_movimientos_tipo_check
  check (tipo = any (array[
    'ENTRADA_COMPRA', 'ENTRADA_PRODUCCION', 'ENTRADA_DEVOLUCION', 'ENTRADA_DIRECTA',
    'SALIDA_CONSUMO', 'SALIDA_DESPACHO', 'SALIDA_MERMA',
    'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO',
    'TRANSFERENCIA_SALIDA', 'TRANSFERENCIA_ENTRADA',
    'REVERSO'
  ]));

create or replace function public.registrar_entrada(
  p_almacen_id bigint,
  p_articulo_id bigint,
  p_cantidad numeric,
  p_costo_usd numeric,
  p_motivo text,
  p_referencia text default null,
  p_fecha date default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_nota text;
begin
  perform private.exigir_rol('ALMACEN');

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad que entra tiene que ser mayor que cero.'
      using errcode = '22023';
  end if;

  if coalesce(p_costo_usd, 0) <= 0 then
    raise exception 'Hay que decir cuánto costó la unidad. Si de verdad no costó nada, eso no es una entrada: es un ajuste de conteo, y ahí se valora como el resto del almacén.'
      using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Una entrada sin explicación no se puede auditar después. Escribe de dónde vino.'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.almacenes where id = p_almacen_id and activo) then
    raise exception 'Ese almacén no existe o está inactivo.' using errcode = '23503';
  end if;

  if not exists (select 1 from public.articulos where id = p_articulo_id and activo) then
    raise exception 'Ese artículo no existe o está inactivo.' using errcode = '23503';
  end if;

  -- La referencia va dentro de la nota y no en columna propia: es texto libre
  -- —el nombre de quien lo trajo, un número de factura de fuera— y darle
  -- columna invitaría a tratarlo como si fuera un documento del sistema, que
  -- no lo es.
  v_nota := btrim(p_motivo);
  if nullif(btrim(coalesce(p_referencia, '')), '') is not null then
    v_nota := v_nota || ' · Ref.: ' || btrim(p_referencia);
  end if;

  return private.registrar_movimiento(
    'ENTRADA_DIRECTA', 1::smallint,
    p_almacen_id, p_articulo_id, p_cantidad, p_costo_usd,
    v_nota, null, null, null, p_fecha);
end;
$func$;

comment on function public.registrar_entrada(bigint, bigint, numeric, numeric, text, text, date) is
  'Mete mercancía al almacén sin una orden de compra detrás: saldo inicial, algo '
  'comprado por fuera, material que trae alguien. Lleva costo propio, al revés '
  'que el ajuste de conteo, que hereda el promedio.';

revoke execute on function public.registrar_entrada(bigint, bigint, numeric, numeric, text, text, date) from public, anon;
grant  execute on function public.registrar_entrada(bigint, bigint, numeric, numeric, text, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- La historia del artículo tiene que saber decir el tipo nuevo
--
-- Se rehace entera porque `create or replace view` no admite añadir una rama a
-- un `case` sin reescribir la consulta. Y al final vuelve a declararse
-- `security_invoker`: `create or replace view` se lleva por delante las
-- reloptions si no se repiten, y la vista dejaría de respetar RLS en silencio.
-- Ya pasó una vez con esta misma vista.
-- ---------------------------------------------------------------------------
create or replace view public.v_historial_articulo as

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

select m.articulo_id,
       m.registrado_en,
       m.fecha,
       m.tipo,
       case m.tipo
         when 'ENTRADA_COMPRA'        then 'Entró por una compra'
         when 'ENTRADA_PRODUCCION'    then 'Entró por producción'
         when 'ENTRADA_DEVOLUCION'    then 'Volvió al almacén'
         when 'ENTRADA_DIRECTA'       then 'Entró sin compra de por medio'
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

grant select on public.v_historial_articulo to authenticated;
