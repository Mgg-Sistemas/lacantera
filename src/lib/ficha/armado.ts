/**
 * Un archivo listo, todavía sin guardar.
 *
 * Las funciones que arman papeles —recibos, facturas, fichas, carnets— no lo
 * descargan: devuelven esto. Quien lo pidió decide qué hacer con él, y en este
 * sistema lo que hace siempre es enseñarlo en el visor para que la persona lo
 * revise antes de quedárselo.
 *
 * El nombre viaja con el blob porque un blob no tiene nombre: si se separaran,
 * el archivo terminaría guardado con el identificador aleatorio que el navegador
 * le pone a las direcciones de memoria.
 */
export interface ArchivoArmado {
  blob: Blob
  nombre: string
}
