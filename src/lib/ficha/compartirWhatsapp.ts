/*
  COMPARTIR UN REPORTE CON SUS FOTOS, DE VERDAD.

  `copiarAlPortapapeles` (en `reporteDiario.ts`) ya resuelve "pegarlo a mano
  en WhatsApp". Esto es lo otro: mandar el texto Y las fotos juntas, de un
  solo toque, con la función de compartir del propio navegador —no es un
  truco de WhatsApp, es `navigator.share`, y si quien la recibe tiene
  WhatsApp instalado, aparece como una opción más del menú—.

  SOLO TIENE SENTIDO CON POCAS FOTOS, DE UNA SOLA NOTA.

  Christopher, 16/10/2026, al pedir el reporte por nota en vez de uno
  agregado: «me están pidiendo un reporte individual». Un reporte de varios
  días con fotos de notas distintas revueltas no se puede compartir así —por
  eso esto vive al lado del reporte de UNA nota, no del que junta un rango de
  fechas.

  EL SOPORTE NO ES PAREJO, Y ESO NO ES UN ERROR DE AQUÍ.

  En el teléfono, casi siempre funciona. En computadora de escritorio, la
  mayoría de los navegadores no dejan compartir archivos —solo texto, o
  nada—. Por eso esto nunca se ofrece como la única salida: el botón de
  copiar el texto sigue ahí al lado, siempre.
*/

export type ResultadoDeCompartir = 'compartido' | 'cancelado' | 'sin_soporte'

/**
 * Comparte el texto y, si el navegador lo admite, las fotos junto con él.
 *
 * Sin fotos, o sin soporte para compartir archivos, intenta compartir solo
 * el texto —que sí funciona en casi todos lados—. Si ni eso hay, devuelve
 * `sin_soporte` para que la pantalla ofrezca copiar en su lugar.
 */
export async function compartirConFotos(
  texto: string,
  fotos: File[],
): Promise<ResultadoDeCompartir> {
  if (!('share' in navigator)) return 'sin_soporte'

  const compartirArchivos =
    fotos.length > 0 &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: fotos })

  try {
    await navigator.share(compartirArchivos ? { text: texto, files: fotos } : { text: texto })
    return 'compartido'
  } catch (e) {
    // Quien comparte se arrepiente y cierra el menú: no es un fallo, es una decisión.
    if (e instanceof Error && e.name === 'AbortError') return 'cancelado'
    return 'sin_soporte'
  }
}
