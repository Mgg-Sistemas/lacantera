/*
  DE QUIÉN ES ALGO, SIN DIBUJAR NADA.

  Va aparte del componente y no junto a él por un motivo mecánico, el mismo que
  llevó a sacar `pestanasDeModulos` de `Pestanas`: un archivo que exporta un
  componente y además funciones rompe el refresco en caliente de Vite, que solo
  sabe reemplazar un módulo cuando todo lo que exporta son componentes.
*/

/** El código del dueño que somos nosotros. */
export const LA_CASA = 'LACANTERA'

/**
 * Si esto es de otro.
 *
 * El nulo cuenta como nuestro: la columna nació con `default 'LACANTERA'` y
 * todo lo que había antes de que existiera la pregunta era de la casa.
 */
export const esAjeno = (propietario?: string | null) => (propietario ?? LA_CASA) !== LA_CASA

/**
 * La marca del dueño, para donde no cabe una pastilla.
 *
 * Dentro de un `<select>` o de la tercera línea de `SelectBuscable` no se puede
 * meter un elemento, y ahí lo ajeno tiene que notarse igual: quien elige el
 * almacén de destino de una entrada está decidiendo de quién va a ser lo que
 * entre, y enterarse después de guardar llega tarde.
 */
export function detalleDeDueno(propietario: string | null | undefined, nombre?: string) {
  return esAjeno(propietario) ? `De ${nombre ?? propietario}` : undefined
}

/** Une la línea de detalle que ya traía la opción con la del dueño. */
export function conDueno(detalle: string | undefined, dueno: string | undefined) {
  return [detalle, dueno].filter(Boolean).join(' · ') || undefined
}
