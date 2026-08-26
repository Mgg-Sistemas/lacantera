-- Los avisos que llevaban a un pedido borrado.
--
-- Se me quedaron en la limpieza de las cuentas de prueba, y es un descuido con
-- consecuencia visible: los conté en el barrido —«notificaciones: 10»— y luego
-- no los borré. Christopher pulsó uno y aterrizó en /app/compras/44, que ya no
-- existe.
--
-- Los diez apuntaban al mismo pedido de prueba: el nuevo pedido, la
-- confirmación, la aprobación de gerencia, el pago devuelto, el pago ejecutado
-- y la compra pagada. El recorrido entero, con su rastro de avisos.
--
-- POR QUÉ NO SE FUERON SOLOS. `notificaciones.ruta` es texto: no hay clave
-- foránea al documento, así que borrar el pedido no se los lleva. Y no es un
-- defecto de diseño —una notificación tiene que sobrevivir a lo que anuncia, y
-- lo normal es ANULAR un documento, no borrarlo—. Pero en una limpieza sí hay
-- que barrerlos, y ahora queda escrito para la próxima.
--
-- Se borra por la ruta y comprobando que el destino no exista, en vez de por
-- fecha: así no se lleva por delante ningún aviso vivo que se hubiera creado el
-- mismo día.
--
-- La otra mitad del arreglo está en el front: `useCompra` usaba `single()`, así
-- que un pedido inexistente devolvía «Cannot coerce the result to a single JSON
-- object» tras tres reintentos, en vez del vacío que la pantalla ya tenía
-- escrito y no llegaba a usar nunca.

delete from public.notificaciones n
 where n.ruta ~ '^/app/compras/[0-9]+$'
   and not exists (
     select 1 from public.solicitudes_pedido s
      where s.id = split_part(n.ruta, '/', 4)::bigint
   );
