/**
 * La hoja, igual para todos los papeles que salen del sistema.
 *
 * Tres centímetros de margen por los cuatro lados. Va aquí y no repetido en
 * cada archivo porque el margen es una decisión de la empresa sobre CÓMO se ven
 * sus documentos, no un detalle de maquetación de uno de ellos: el día que
 * alguien añada un papel nuevo, lo hereda sin acordarse, y el día que se decida
 * otro margen se cambia una vez.
 *
 * QUÉ CUESTA
 *
 * Un A4 mide 210 × 297 mm. Con 30 mm por lado quedan 150 de ancho y 237 de
 * alto: se pierde un 43 % de la superficie. Eso tiene consecuencias reales y
 * conviene saberlas antes de descubrirlas al imprimir:
 *
 *   - Las bandas de color de los encabezados ya no llegan al borde de la hoja.
 *     Un rectángulo a sangre dentro de un margen de 3 cm no es un margen.
 *   - El recibo de pago ya no cabe dos veces en una hoja. Antes, cuando tenía
 *     pocos conceptos, la copia del trabajador iba debajo con una línea de
 *     corte; ahora va en su propia hoja. Se imprime el doble de papel, y es el
 *     precio directo del margen.
 *
 * Nada de esto rompe nada: el recibo ya sabía pasar a la hoja siguiente cuando
 * no cabía. Lo que cambia es que ahora no cabe casi nunca.
 */

/** A4 en milímetros, que es la unidad con la que se arma todo. */
export const ANCHO_HOJA = 210
export const ALTO_HOJA = 297

/** Tres centímetros. Por los cuatro lados. */
export const MARGEN = 30

export const IZQ = MARGEN
export const DER = ANCHO_HOJA - MARGEN
export const ARRIBA = MARGEN
export const ABAJO = ALTO_HOJA - MARGEN

export const ANCHO_UTIL = DER - IZQ
export const ALTO_UTIL = ABAJO - ARRIBA

/**
 * La línea base del pie de página.
 *
 * No es `ABAJO`. jsPDF coloca el texto por su línea base, y las letras con
 * rabo —la g, la p, la j— bajan por debajo de ella. Escribiendo el pie
 * justo en `ABAJO`, la tinta se comía 0,8 mm del margen: medido, no supuesto.
 * Dos milímetros de holgura dejan el renglón entero dentro de la caja.
 */
export const PIE = ABAJO - 2

/** El centro de la caja de texto, para lo que va centrado. */
export const CENTRO = IZQ + ANCHO_UTIL / 2

type Doc = import('jspdf').jsPDF

/**
 * Recorta con puntos suspensivos lo que no cabe.
 *
 * Estaba escrito dos veces, en la ficha y en el recibo. Con el ancho útil
 * reducido a 150 mm se recorta mucho más a menudo, así que vale la pena que
 * haya una sola versión y que se comporte igual en los tres papeles.
 */
export function ajustar(doc: Doc, texto: string, ancho: number): string {
  if (doc.getTextWidth(texto) <= ancho) return texto
  let corto = texto
  while (corto.length > 1 && doc.getTextWidth(`${corto}…`) > ancho) corto = corto.slice(0, -1)
  return `${corto.trimEnd()}…`
}
