-- ---------------------------------------------------------------------------
-- El inventario total, y la convivencia de M³ con la tonelada
--
-- DOS COSAS QUE VIENEN JUNTAS PORQUE SON LA MISMA PREGUNTA
--
-- La dirección de Sistemas pidió una vista del inventario completo antes de
-- las vistas por almacén o taller. Y avisó que la cantera opera en metros
-- cúbicos mientras tramita la licencia para trabajar en toneladas, de modo que
-- las dos medidas van a terminar conviviendo.
--
-- Son la misma pregunta porque un total no se puede sumar sin saber en qué
-- unidad está cada cosa.
--
-- LO QUE ESTABA AL REVÉS
--
-- El catálogo se escribió suponiendo lo contrario: «la tonelada es la unidad
-- canónica del material, el metro cúbico se usa para hablar con el cliente
-- pero se convierte a tonelada para registrar» (20260727145000). Hoy la
-- tonelada es justamente la que no está licenciada. No se invierte el supuesto
-- a la fuerza —eso obligaría a reescribir ventas y despachos por algo que
-- cambiará otra vez cuando llegue el permiso—: se le quita el carácter de
-- canónica a ambas y se guarda lo que permite pasar de una a la otra.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Densidad, por material y no global
--
-- Un metro cúbico de arena y uno de piedra #1 no pesan lo mismo: la
-- granulometría cambia cuánto aire queda entre grano y grano. Una constante
-- única de la cantera daría un número redondo y falso en cada material salvo
-- uno.
--
-- Queda nula a propósito. Mientras nadie haya medido la densidad real de un
-- material, el sistema no inventa su equivalencia: simplemente no ofrece la
-- otra unidad para ese artículo. Un factor inventado es peor que una casilla
-- vacía, porque el vacío se ve y el invento no.
-- ---------------------------------------------------------------------------
alter table public.articulos
  add column if not exists densidad_ton_m3 numeric(10,4)
    check (densidad_ton_m3 is null or densidad_ton_m3 > 0);

comment on column public.articulos.densidad_ton_m3 is
  'Toneladas que pesa un metro cúbico de este material. Nula mientras no se '
  'haya medido: sin ella el sistema no muestra la equivalencia, en vez de '
  'suponerla.';

-- ---------------------------------------------------------------------------
-- Existencias consolidadas: el inventario de la empresa, sin partir
--
-- POR QUÉ NO BASTA CON SUMAR v_existencias EN LA PANTALLA
--
-- La existencia sí se suma. El costo promedio no: promediar los promedios de
-- cada almacén da un número que no es el costo de nada. Si un almacén tiene
-- 10 sacos a 4 USD y otro tiene 90 a 6 USD, el promedio de los promedios es 5
-- y el costo real es 5,80. Por eso el consolidado se calcula aquí, sobre el
-- libro, y no restando de la vista por almacén.
--
-- CUÁNTOS ALMACENES LO TIENEN
--
-- Va incluido porque es la primera pregunta después de ver el total: si algo
-- está repartido en cuatro sitios, el siguiente clic es saber en cuáles. La
-- vista general lleva a la vista por almacén, no la reemplaza.
-- ---------------------------------------------------------------------------
create or replace view public.v_existencias_totales
with (security_invoker = on) as
select
  art.id                                             as articulo_id,
  art.codigo                                         as articulo_codigo,
  art.nombre                                         as articulo,
  art.categoria,
  art.unidad,
  art.stock_minimo,
  art.densidad_ton_m3,
  sum(m.cantidad * m.signo)                          as existencia,

  -- La misma existencia en la otra unidad, solo si hay con qué convertirla.
  case
    when art.densidad_ton_m3 is null then null
    when art.unidad = 'M3'  then round(sum(m.cantidad * m.signo) * art.densidad_ton_m3, 4)
    when art.unidad = 'TON' then round(sum(m.cantidad * m.signo) / art.densidad_ton_m3, 4)
  end                                                as existencia_equivalente,
  case
    when art.densidad_ton_m3 is null then null
    when art.unidad = 'M3'  then 'TON'
    when art.unidad = 'TON' then 'M3'
  end                                                as unidad_equivalente,

  sum(m.valor_usd * m.signo)                         as valor_usd,
  case when sum(m.cantidad * m.signo) > 0
       then round(sum(m.valor_usd * m.signo) / sum(m.cantidad * m.signo), 6)
  end                                                as costo_promedio_usd,

  -- En cuántos sitios ha pasado por el libro. No es lo mismo que «en cuántos
  -- queda algo» —eso exige mirar almacén por almacén, y para eso está
  -- v_existencias—, pero sirve para saber si vale la pena abrir el detalle.
  count(distinct m.almacen_id)                       as almacenes,
  max(m.fecha)                                       as ultimo_movimiento
from public.articulos art
join public.inventario_movimientos m on m.articulo_id = art.id
group by art.id, art.codigo, art.nombre, art.categoria, art.unidad,
         art.stock_minimo, art.densidad_ton_m3;

comment on view public.v_existencias_totales is
  'Existencia de cada artículo en toda la empresa, sin separar por almacén. '
  'El costo promedio se recalcula sobre el libro completo porque promediar '
  'los promedios de cada almacén no da el costo de nada.';

-- ---------------------------------------------------------------------------
-- Dónde está repartido, por tipo de sitio
--
-- «El inventario es general, luego se divide en almacenes y talleres.» Esta
-- vista es el escalón intermedio: cuánto hay en patio, cuánto en almacén,
-- cuánto en cada taller. Sin ella el salto del total a un almacén concreto se
-- da a ciegas.
-- ---------------------------------------------------------------------------
create or replace view public.v_existencias_por_tipo
with (security_invoker = on) as
select
  a.tipo,
  m.articulo_id,
  art.codigo as articulo_codigo,
  art.nombre as articulo,
  art.unidad,
  sum(m.cantidad * m.signo) as existencia,
  sum(m.valor_usd * m.signo) as valor_usd,
  count(distinct m.almacen_id) as sitios
from public.inventario_movimientos m
join public.almacenes a  on a.id = m.almacen_id
join public.articulos art on art.id = m.articulo_id
group by a.tipo, m.articulo_id, art.codigo, art.nombre, art.unidad;

comment on view public.v_existencias_por_tipo is
  'Escalón entre el total de la empresa y el detalle por almacén: cuánto hay '
  'en patio, en almacén, en taller y en combustible.';
