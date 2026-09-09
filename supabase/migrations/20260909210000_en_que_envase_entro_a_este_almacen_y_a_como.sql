/*
  EN QUÉ ENVASE ENTRÓ A ESTE ALMACÉN, Y A CÓMO.

  Christopher: «si se compra un tambor para un almacén, ¿cómo puedo ver
  expresamente esa forma de medir o presentación del item en ese almacén y con el
  valor acorde?».

  ═══════════════════════════════════════════════════════════════════════════
  POR QUÉ ESTO SÍ VA EN LA PANTALLA DE EXISTENCIAS Y LA EQUIVALENCIA NO
  ═══════════════════════════════════════════════════════════════════════════

  Hace media hora quitamos «≈ 2 tambores» de las pantallas donde se cuenta,
  porque Christopher tenía razón: «cuando revisen el inventario, buscarán
  existencias reales y no referencias o medidas de items de conversión».

  Esto es lo contrario, y la diferencia es toda la cuestión:

      «≈ 2 tambores y 188 L» ....... una DIVISIÓN de 604 entre 208. Nadie la
                                     contó. Puede ser falsa y de hecho lo era.
      «entró en TAMBOR, a 1.497,60
       el tambor, el 5/09» ......... un HECHO. Alguien tecleó ese envase y ese
                                     precio ese día, y quedó escrito.

  Lo primero es una suposición vestida de dato. Lo segundo es lo que pasó. En una
  pantalla de existencias cabe lo segundo.

  ═══════════════════════════════════════════════════════════════════════════
  QUÉ CAMBIA
  ═══════════════════════════════════════════════════════════════════════════

  `costo_por_presentacion` ya agrupaba las compras por envase; le faltaba poder
  mirar UN almacén. Y hace falta: el mismo aceite puede haber entrado en tambores
  al almacén general y en pailas al patio, y el costo promedio de cada sitio se
  lleva aparte —`private.costo_promedio` es por almacén y por artículo—, así que
  mezclarlos daría una media que no rige en ninguno de los dos.

  Con `p_almacen_id` nulo se comporta exactamente como hasta ahora, que es lo que
  necesita la ficha del artículo: ahí la pregunta es «cómo se compra esto», sin
  importar dónde acabó.

  COMPROBADO: hoy las ocho entradas son del 5/09 y ninguna capturó el envase,
  porque ese día el sistema no sabía capturarlo. Así que esto sale vacío hasta la
  próxima compra que se teclee en tambores. No es una función muerta: es una que
  empieza a hablar cuando haya algo que decir, y por eso la pantalla se calla
  entera si no hay filas en vez de enseñar una tabla vacía.
*/

/*
  EL `drop` VA EN LA MISMA MIGRACIÓN. Un parámetro más es una FIRMA distinta, y
  `create or replace` con otra firma AÑADE una función en vez de reemplazarla:
  con dos, cualquier llamada con argumentos con nombre revienta con «42725: is
  not unique». Pasó el 8/09 con `private.registrar_movimiento` y dejó las catorce
  puertas del inventario sin escribir.
*/
drop function if exists public.costo_por_presentacion(bigint);

create or replace function public.costo_por_presentacion(
  p_articulo_id bigint,
  p_almacen_id  bigint default null
)
returns table(
  presentacion   text,
  unidades       numeric,
  veces          integer,
  cantidad_base  numeric,
  costo_base     numeric,
  costo_envase   numeric,
  primera        date,
  ultima         date,
  corregido_despues boolean
)
language plpgsql stable security definer set search_path to ''
as $function$
begin
  perform private.exigir_permiso('INVENTARIO', 'LECTURA');

  return query
  with compras as (
    select nullif(btrim(coalesce(m.unidad_capturada, '')), '') as envase,
           m.id, m.cantidad, m.costo_usd, m.fecha
      from public.inventario_movimientos m
     where m.articulo_id = p_articulo_id
       -- Nulo = todos los sitios, que es lo que pregunta la ficha del articulo.
       and (p_almacen_id is null or m.almacen_id = p_almacen_id)
       and m.tipo in ('ENTRADA_COMPRA', 'ENTRADA_DIRECTA')
       and m.cantidad > 0
  )
  select c.envase,
         /*
           El factor de HOY, no el del día de la compra. Es una elección: sirve
           para traducir el costo a «lo que vale un tambor ahora», que es la
           pregunta que se hace. Si el factor cambiara, el costo por litro —que
           es el dato duro— no se movería; solo se movería la traducción.
         */
         (select ap.unidades from public.articulo_presentaciones ap
           where ap.articulo_id = p_articulo_id and ap.presentacion = c.envase) as unidades,
         count(*)::integer,
         sum(c.cantidad),
         /*
           PROMEDIO PONDERADO POR CANTIDAD, no media de los precios. Dos compras,
           una de 400 L a 7 y otra de 20 L a 12, no salen a 9,50: salen a 7,24.
           La media simple le da el mismo peso a un tambor que a un pote.
         */
         sum(c.cantidad * c.costo_usd) / nullif(sum(c.cantidad), 0),
         case when (select ap.unidades from public.articulo_presentaciones ap
                     where ap.articulo_id = p_articulo_id and ap.presentacion = c.envase) is not null
              then sum(c.cantidad * c.costo_usd) / nullif(sum(c.cantidad), 0)
                   * (select ap.unidades from public.articulo_presentaciones ap
                       where ap.articulo_id = p_articulo_id and ap.presentacion = c.envase)
         end,
         min(c.fecha), max(c.fecha),
         /*
           SE COMPARA POR IDENTIFICADOR Y NO POR FECHA, y lo enseñó la prueba.

           La corrección de los cinco aceites y una compra de tambores hecha
           después son del MISMO DÍA, así que `fecha >=` marcaba la compra nueva
           como «corregida después» cuando había ocurrido antes que ella. El id
           es monótono y no tiene ese problema: una corrección posterior a la
           compra siempre lleva un número mayor.

           Y se mira EN EL MISMO SITIO: `corregir_costo` es por almacén, así que
           una corrección en el patio no dice nada de lo que entró al general.
         */
         exists (select 1 from public.inventario_movimientos aj
                  where aj.articulo_id = p_articulo_id
                    and (p_almacen_id is null or aj.almacen_id = p_almacen_id)
                    and aj.tipo = 'AJUSTE_COSTO'
                    and aj.id > max(c.id))
    from compras c
   group by c.envase
   -- La unidad de operación al final: es la que menos dice de las dos.
   order by (c.envase is null), c.envase;
end;
$function$;

comment on function public.costo_por_presentacion(bigint, bigint) is
  'A cuanto salio la unidad de operacion cada vez que se compro el articulo, agrupado por el ENVASE en que se compro, y opcionalmente en UN almacen. Con `p_almacen_id` nulo mira todos los sitios, que es lo que pregunta la ficha del articulo; con almacen contesta la pregunta de Christopher —«si se compra un tambor para un almacen, como veo esa presentacion en ese almacen y con el valor acorde»— y hace falta porque el costo promedio se lleva por almacen: mezclarlos daria una media que no rige en ninguno. NO es un segundo costo del inventario: eso sigue siendo una sola cifra por sitio, porque una vez en el almacen no hay dos montones. Esto es el RASTRO de como se formo. A diferencia de una equivalencia —dividir 604 entre 208 y decir «2 tambores»— aqui todo es hecho registrado: alguien tecleo ese envase y ese precio ese dia. Por eso esto si cabe en una pantalla de existencias y aquello no. Solo ENTRADA_COMPRA y ENTRADA_DIRECTA; fuera los AJUSTE_COSTO, los traslados, las devoluciones y la produccion. `corregido_despues` marca la fila cuya valoracion se corrigio despues, en ese mismo almacen. Promedio ponderado por cantidad.';

grant execute on function public.costo_por_presentacion(bigint, bigint) to authenticated;
