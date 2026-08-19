-- ---------------------------------------------------------------------------
-- La vista de guias se quedo con el nombre viejo de la columna
--
-- La migracion 20260819260000 renombro `toneladas` a `cantidad` en la tabla y
-- actualizo `registrar_guia`, pero no toco `v_guias_movilizacion`. Postgres
-- renombra la columna dentro de la vista sin avisar y le deja el alias
-- anterior, asi que la vista seguia devolviendo `toneladas` y no existia
-- `cantidad`.
--
-- Lo que se veia: la columna «Ampara» del listado mostraba NaN, porque el
-- front lee `g.cantidad`, la vista no lo tenia, y `Number(undefined)` es NaN.
-- Sin error en consola ni pantalla roja: se guardaba bien y se pintaba mal.
--
-- Y habia un segundo fallo en la misma linea: la vista exponia `a.unidad` —la
-- unidad del ARTICULO del catalogo— en vez de `g.unidad`, que es la que se
-- eligio para la guia. Como los cinco productos estan cargados en TON, el
-- selector M3/TON que se acababa de anadir no tenia ningun efecto visible: la
-- guia se guardaba en metros cubicos y el listado la mostraba en toneladas.
-- Es exactamente la trampa que la migracion anterior venia a quitar.
--
-- La unidad del articulo se conserva como `unidad_articulo` por si hiciera
-- falta, pero con otro nombre: son dos cosas distintas y confundirlas es lo
-- que causo esto.
-- ---------------------------------------------------------------------------
drop view if exists public.v_guias_movilizacion;

create view public.v_guias_movilizacion
with (security_invoker = on) as
select
  g.id,
  g.numero,
  g.numero_guia,
  g.fecha_emision,
  g.vigencia_hasta,
  g.frente_id,
  g.origen,
  g.destino,
  g.cliente_id,
  g.articulo_id,
  g.cantidad,
  g.unidad,
  g.transportista,
  g.vehiculo,
  g.vehiculo_id,
  g.chofer,
  g.cedula_chofer,
  g.observacion,
  g.estado,
  g.nota_entrega_id,
  g.motivo_anulacion,
  g.anulada_por,
  g.anulada_en,
  g.registrada_por,
  g.registrada_en,
  a.nombre as articulo,
  a.unidad as unidad_articulo,
  c.nombre as cliente,
  f.codigo as frente_codigo,
  f.nombre as frente,
  n.numero as nota_entrega,
  g.estado = 'VIGENTE' and g.vigencia_hasta < current_date as vencida,
  g.vigencia_hasta - current_date as dias_para_vencer
from public.guias_movilizacion g
join public.articulos a on a.id = g.articulo_id
left join public.clientes c on c.id = g.cliente_id
left join public.frentes_explotacion f on f.id = g.frente_id
left join public.notas_entrega n on n.id = g.nota_entrega_id;

comment on view public.v_guias_movilizacion is
  'Las guias del ministerio. `unidad` es la de la guia -lo que dice el papel- y no la del articulo del catalogo: son cosas distintas y confundirlas etiquetaba el numero con la medida equivocada.';
