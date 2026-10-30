/*
  UN SOLO CONTADOR PARA TODO LO QUE BLOQUEA EL SCROLL DEL FONDO.

  Antes cada modal —y el cajón del menú en el teléfono— guardaba su propio
  «cómo estaba antes» y lo devolvía al cerrarse. Funciona con uno solo, pero se
  rompe en cuanto dos se abren a la vez y se cierran juntos: un modal abierto
  encima de otro, cerrados de un tirón por el mismo botón —justo lo que hacen
  «Guardar» en Camiones, Editar, Completar, Enlazar y Marcar pendiente de la
  nota de entrega, que cierran su propia ventana y la de la nota al mismo
  tiempo—.

  El de encima se abrió cuando el scroll YA estaba bloqueado por el de abajo,
  así que su «antes» es «bloqueado». Si su cierre corre después del de abajo,
  deja el scroll bloqueado para siempre, hasta recargar la página. Encontrado
  el 30/10/2026, en Notas de entrega: «se me quita la barra de la derecha para
  seguir bajando», y se quedaba así incluso después de cerrar.

  Con un contador no importa el orden ni cuántos se cierren juntos: se
  bloquea al pasar de 0 a 1 y se libera al volver a 0, lo pida quien lo pida.
*/

let candados = 0

/** Pide el bloqueo. Devuelve la función que lo suelta —llamarla dos veces no hace nada la segunda vez—. */
export function bloquearScroll(): () => void {
  if (candados === 0) document.body.style.overflow = 'hidden'
  candados += 1

  let liberado = false
  return () => {
    if (liberado) return
    liberado = true
    candados = Math.max(0, candados - 1)
    if (candados === 0) document.body.style.overflow = ''
  }
}
