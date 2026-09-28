-- ═══════════════════════════════════════════════════════════════════════════
-- EL RESPALDO DICE SU MATERIAL, Y SIGUE SIN SUMAR
--
-- Christopher, 28/09/2026, mirando la planilla: «no estoy pudiendo ver cuando
-- son salidas o entradas múltiples, por ejemplo no veo los de piedra y arena»,
-- y al confirmarle la causa: «corrígeme eso».
--
-- LA CAUSA. La rama B de esta vista —la nota de entrega que respalda una nota
-- de salida— salía como UNA fila por nota, con material, cantidad y unidad en
-- NULL. La pantalla la pintaba en gris: «Respaldo de una salida · CLIENTE ·
-- Respalda la nota de salida NS-…», y nada más. Sus renglones SÍ existen en
-- nota_entrega_renglones; la vista sencillamente no los leía. Quien llegaba
-- con esa NE en la mano encontraba su número y ninguna mercancía.
--
-- EL PORQUÉ DEL DISEÑO VIEJO, Y SU FALLO. Se quería no contar dos veces lo
-- que ya cuenta la fila de la NS, y eso sigue siendo correcto. El fallo fue
-- tratar «no sumar» y «no mostrar» como la misma cosa: la salida interna ya
-- demostraba que se puede enseñar el material en gris sin que entre en los
-- totales.
--
-- EL CAMBIO. La rama B lee sus renglones: una fila por renglón, con su
-- material, su cantidad y su unidad. Conserva el estado RESPALDO, así que
-- nada de lo que suma cambia: el monto solo se calcula sobre VIGENTE, la
-- pantalla y el Excel solo suman VIGENTE, y la plantilla de carga solo
-- exporta VIGENTE. El precio se queda en blanco a propósito: el precio de ese
-- despacho vive en la fila de la NS, donde se teclea, y ponerlo también aquí
-- sería enseñar el mismo dinero dos veces.
--
-- LA CLAVE CAMBIA para esas filas: de NE#<numero de nota> a NE#<id del
-- renglón>, porque ahora puede haber varias por nota. No ata nada: la carga
-- por Excel rechaza toda clave que no sea de un despacho VIGENTE, y lo
-- escrito a mano se guarda por renglon_id o movimiento_id, que aquí siguen
-- en NULL. El join con renglones es LEFT por prudencia: una nota de respaldo
-- sin renglones —que hoy no existe— seguiría enseñando su número, porque la
-- serie se enseña entera.
--
-- Se comprobó antes de tocar que la vista de producción era idéntica a la del
-- repositorio: nadie más la había cambiado.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_control_despacho as
with serie as (
  select c.prefijo,
         format('%s-%s-%s', c.prefijo, c.anio, lpad(n::text, 4, '0')) as numero
    from public.correlativos c
   cross join lateral generate_series(1, c.ultimo) as n
   where c.prefijo in ('NE', 'NS')
),
base as (
  -- A) Cada renglón de una nota de entrega de las de siempre.
  select 'NE:' || r.id                          as clave,
         'NOTA_ENTREGA'::text                   as origen,
         n.numero                               as documento,
         n.fecha,
         c.nombre                               as cliente,
         n.cliente_id,
         c.rif                                  as rif_doc,
         r.descripcion                          as material,
         r.cantidad::numeric                    as cantidad,
         r.unidad,
         case when n.moneda = 'USD' and r.precio_unitario > 0 then r.precio_unitario end as precio_doc,
         n.moneda                               as moneda_doc,
         case when n.estado = 'ANULADA' then 'ANULADA' else 'VIGENTE' end as estado_doc,
         case when n.estado = 'ANULADA' then n.motivo_anulacion end      as detalle,
         r.id                                   as renglon_id,
         null::bigint                           as movimiento_id,
         null::text                             as destino_escrito
    from public.notas_entrega n
    join public.nota_entrega_renglones r on r.nota_id = n.id
    left join public.clientes c on c.id = n.cliente_id
   where n.nota_salida is null

  union all

  -- B) La nota de entrega que respalda una salida: ahora con sus renglones a
  --    la vista. Su dinero y sus totales los sigue contando la fila de la NS;
  --    esto enseña qué llevaba, que es lo que preguntaba quien la buscaba.
  select 'NE#' || coalesce(r.id::text, n.numero),
         'NOTA_ENTREGA', n.numero, n.fecha,
         c.nombre, n.cliente_id, c.rif,
         r.descripcion, r.cantidad::numeric, r.unidad, null, n.moneda,
         case when n.estado = 'ANULADA' then 'ANULADA' else 'RESPALDO' end,
         'Respalda la nota de salida ' || n.nota_salida,
         null, null, null
    from public.notas_entrega n
    left join public.nota_entrega_renglones r on r.nota_id = n.id
    left join public.clientes c on c.id = n.cliente_id
   where n.nota_salida is not null

  union all

  -- C y D) Cada asiento de una nota de salida: hacia fuera es un despacho;
  --        hacia un área de la empresa se ve como interna y no suma.
  select 'NS:' || m.id, 'NOTA_SALIDA', m.nota_salida, m.fecha,
         coalesce(cl.nombre, m.destino_externo, g.nombre),
         eq.cliente_id, cl.rif,
         a.nombre, m.cantidad::numeric, m.unidad,
         null, null,
         case
           when exists (select 1 from public.inventario_movimientos x
                         where x.movimiento_origen = m.id and x.tipo = 'REVERSO') then 'DESHECHA'
           when m.destino_externo is null then 'INTERNA'
           else 'VIGENTE'
         end,
         case
           when m.destino_externo is null then 'Salida interna'
           else (select 'Tiene la nota de entrega ' || ne.numero
                   from public.notas_entrega ne
                  where ne.nota_salida = m.nota_salida and ne.estado <> 'ANULADA' limit 1)
         end,
         null, m.id, m.destino_externo
    from public.inventario_movimientos m
    join public.articulos a on a.id = m.articulo_id
    left join public.organigrama_nodos g on g.id = m.grupo_id
    left join public.control_despacho_clientes eq on eq.destino = upper(btrim(m.destino_externo))
    left join public.clientes cl on cl.id = eq.cliente_id
   where m.nota_salida is not null and m.signo = -1 and m.tipo <> 'REVERSO'

  union all

  -- E) El número que la serie gastó y no tiene nada detrás.
  select s.prefijo || '#' || s.numero,
         case s.prefijo when 'NE' then 'NOTA_ENTREGA' else 'NOTA_SALIDA' end,
         s.numero, null, null, null, null, null, null, null, null, null,
         'SIN_DOCUMENTO', 'La serie gastó este número y no hay documento con él',
         null, null, null
    from serie s
   where (s.prefijo = 'NE' and not exists (select 1 from public.notas_entrega n where n.numero = s.numero))
      or (s.prefijo = 'NS' and not exists (select 1 from public.inventario_movimientos m where m.nota_salida = s.numero))
)
select b.clave, b.origen, b.documento, b.fecha,
       b.cliente, b.cliente_id, b.destino_escrito,
       coalesce(cd.rif, b.rif_doc)                         as rif,
       (cd.rif is null and b.rif_doc is not null)          as rif_del_cliente,
       b.material, b.cantidad, b.unidad,
       coalesce(cd.precio_usd, b.precio_doc)               as precio,
       (cd.precio_usd is null and b.precio_doc is not null) as precio_de_la_nota,
       b.moneda_doc,
       case when b.estado_doc = 'VIGENTE'
            then round(coalesce(cd.precio_usd, b.precio_doc) * b.cantidad, 2) end as monto,
       cd.estado_control, e.nombre as estado_control_nombre,
       cd.observacion, cd.extra,
       b.estado_doc, b.detalle,
       b.renglon_id, b.movimiento_id,
       (b.estado_doc = 'VIGENTE' and coalesce(cd.rif, b.rif_doc) is null) as falta_rif
  from base b
  left join public.control_despacho cd
    on cd.renglon_id = b.renglon_id or cd.movimiento_id = b.movimiento_id
  left join public.control_despacho_estados e on e.codigo = cd.estado_control;

-- La planilla se sigue leyendo por su propia puerta (20260921163203): con los
-- permisos del dueño y sin acceso directo. Se reafirma por si un `create or
-- replace` de otro día lo moviera.
alter view public.v_control_despacho set (security_invoker = off);
revoke all on public.v_control_despacho from public, anon, authenticated;
