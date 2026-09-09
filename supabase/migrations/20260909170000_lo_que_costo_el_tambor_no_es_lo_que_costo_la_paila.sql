/*
  LO QUE COSTÓ EL TAMBOR NO ES LO QUE COSTÓ LA PAILA.

  Christopher, el 9/09: «es importante que se pueda expresar el valor en la
  unidad correspondiente, así también, denotar en caso el precio de ese item en
  esa otra unidad es diferente (imaginando el caso de que existan dos compras en
  tiempos distintos, donde se compre tambor y otra donde se compre en galón o
  paila, sus precios en litro serían diferentes aunque fuera el mismo producto)».

  Tiene razón y es un hecho de mercado, no una rareza: el tambor casi siempre
  sale más barato por litro que la paila. Comprar al mayor es más barato, y eso
  no desaparece porque el sistema lleve una sola cifra.

  ═══════════════════════════════════════════════════════════════════════════
  POR QUÉ ESTO NO ES UN SEGUNDO COSTO, Y NO PUEDE SERLO
  ═══════════════════════════════════════════════════════════════════════════

  La tentación es guardar un costo por presentación. **No se hace, y la razón es
  la misma por la que la existencia es una sola cifra:** el aceite de un tambor y
  el de una paila, una vez en el almacén, es el mismo aceite. No hay dos montones.
  Cuando salen 20 litros, no se puede decir de cuál de las dos compras salieron
  — nadie lo anotó, y no se puede anotar sin poner etiquetas a los litros.

  Por eso el inventario se valora al COSTO PROMEDIO, que es una sola cifra por
  artículo y almacén, y así seguirá: es lo que hace que el libro cuadre.

  Lo que faltaba no era un segundo costo. Era **poder ver la historia**: a cuánto
  salió el litro cada vez que se compró, y en qué envase. Con eso, la diferencia
  que Christopher describe deja de estar escondida dentro del promedio y se
  puede mirar, discutir con el proveedor y usar para decidir cómo comprar la
  próxima vez.

  La diferencia entre las dos cosas importa: un segundo costo sería otra verdad
  compitiendo con la primera; esto es el rastro de cómo se formó la única que hay.

  ═══════════════════════════════════════════════════════════════════════════
  QUÉ CUENTA COMO COMPRA, Y QUÉ NO
  ═══════════════════════════════════════════════════════════════════════════

  Solo `ENTRADA_COMPRA` y `ENTRADA_DIRECTA`. Quedan fuera, y cada una por su
  motivo:

    AJUSTE_COSTO ............ es una corrección de valoración, no un precio de
                              mercado. Y es urgente excluirla: la corrección del
                              9/09 sobre los cinco aceites metió diez asientos de
                              este tipo, cinco positivos y cinco negativos. Si
                              entraran aquí, el historial de precios estaría
                              contando mi propio trabajo como si fueran compras.
    TRANSFERENCIA_ENTRADA ... el material ya era de la casa; viene con el costo
                              que traía del otro almacén.
    ENTRADA_DEVOLUCION ...... vuelve lo que salió, al costo al que salió.
    ENTRADA_PRODUCCION ...... se fabricó, no se compró.
    AJUSTE_POSITIVO ......... apareció contando; no tiene precio de compra.

  El envase sale de `unidad_capturada`, que es lo que se tecleó al entrar. Donde
  es nulo, la compra se hizo en la unidad de operación y así se dice.

  LO QUE HOY DEVUELVE ESTO, Y CONVIENE SABERLO: las ocho entradas que existen son
  del 5/09 y ninguna tiene `unidad_capturada`, porque ese día el sistema todavía
  no sabía capturar la presentación. Así que hoy sale una sola fila por artículo,
  la de la unidad de operación. Esto se llena solo, a partir de la próxima compra
  que se teclee en tambores o en pailas. No es una función vacía: es una función
  esperando.
*/

/*
  EL `drop` VA EN LA MISMA MIGRACIÓN, y no es formalismo.

  Esta función se creó una hora antes sin la última columna. `create or replace`
  con un tipo de retorno distinto NO reemplaza: da «cannot change return type of
  existing function». Y con una FIRMA distinta es peor —crea una segunda función
  y toda llamada con argumentos con nombre pasa a ser ambigua—: eso ya rompió
  todas las escrituras de inventario el 8 de septiembre.
*/
drop function if exists public.costo_por_presentacion(bigint);

create or replace function public.costo_por_presentacion(p_articulo_id bigint)
returns table(
  presentacion   text,
  unidades       numeric,
  veces          integer,
  cantidad_base  numeric,
  costo_base     numeric,
  costo_envase   numeric,
  primera        date,
  ultima         date,
  /*
    SI DESPUÉS SE CORRIGIÓ LA VALORACIÓN, hay que decirlo aquí mismo.

    El asiento de una entrada es inmutable: `costo_usd` se queda para siempre
    con lo que se tecleó ese día, y así debe ser. Pero entonces esta tabla
    enseñaría «1.318.073,76 USD por litro» sin más, que es exactamente el número
    que se corrigió el 9/09, y quien lo lea sin contexto pensará que el sistema
    sigue roto.

    No se falsea el histórico ni se mete la corrección entre las compras —no es
    un precio de mercado—: se marca la fila y la pantalla dice al lado en cuánto
    quedó.
  */
  corregido_despues boolean
)
language plpgsql stable security definer set search_path to ''
as $function$
begin
  perform private.exigir_permiso('INVENTARIO', 'LECTURA');

  return query
  with compras as (
    select nullif(btrim(coalesce(m.unidad_capturada, '')), '') as envase,
           m.cantidad, m.costo_usd, m.fecha
      from public.inventario_movimientos m
     where m.articulo_id = p_articulo_id
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
         exists (select 1 from public.inventario_movimientos aj
                  where aj.articulo_id = p_articulo_id
                    and aj.tipo = 'AJUSTE_COSTO'
                    and aj.fecha >= max(c.fecha))
    from compras c
   group by c.envase
   -- La unidad de operación al final: es la que menos dice de las dos.
   order by (c.envase is null), c.envase;
end;
$function$;

comment on function public.costo_por_presentacion(bigint) is
  'A cuanto salio la unidad de operacion cada vez que se compro el articulo, agrupado por el ENVASE en que se compro. NO es un segundo costo del inventario —eso sigue siendo una sola cifra, el promedio, porque una vez en el almacen no hay dos montones y nadie puede decir de cual compra salieron los litros que salen—: es el RASTRO de como se formo ese promedio. Contesta la pregunta de Christopher: si un dia se compro en tambor y otro en paila, a cuanto salio el litro en cada caso. Solo ENTRADA_COMPRA y ENTRADA_DIRECTA; quedan fuera los AJUSTE_COSTO (correccion de valoracion, no precio de mercado, y ademas contarian la correccion del 9/09 como si fuera una compra), los traslados, las devoluciones y la produccion. Promedio ponderado por cantidad, no media de precios.';

grant execute on function public.costo_por_presentacion(bigint) to authenticated;
