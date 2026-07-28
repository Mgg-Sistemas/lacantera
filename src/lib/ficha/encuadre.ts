/**
 * El encuadre de la foto.
 *
 * De la foto no se guarda un recorte, se guarda dónde mirar: un punto de
 * interés en fracciones de 0 a 1 y cuánto acercar. Recortar al subir sería más
 * simple y peor — el carnet vertical y el recuadro de la hoja A4 no tienen la
 * misma proporción, así que un recorte fijo serviría para uno y dejaría la
 * cara torcida en el otro. Con el punto de interés, cada destino calcula su
 * propio recorte de la foto original.
 *
 * Esta función es la que hace que lo que se ve al centrar en pantalla sea
 * exactamente lo que sale en el PNG y en el PDF. Si el previo y la exportación
 * calcularan por separado, se irían separando en cuanto alguien tocara una.
 */

export interface Encuadre {
  /** 1 = la foto entera cabe cubriendo el recuadro. Hasta 4. */
  zoom: number
  /** Punto de interés horizontal: 0 pega la foto a la izquierda, 1 a la derecha. */
  x: number
  /** Vertical: 0 arriba, 1 abajo. */
  y: number
}

export const ENCUADRE_CENTRADO: Encuadre = { zoom: 1, x: 0.5, y: 0.5 }

export interface Recorte {
  /** Ancho y alto con que hay que pintar la foto completa. */
  ancho: number
  alto: number
  /** Desplazamiento respecto de la esquina del recuadro. Siempre ≤ 0. */
  dx: number
  dy: number
}

/**
 * Cómo pintar una foto de `anchoFoto × altoFoto` dentro de un recuadro de
 * `ancho × alto` respetando el encuadre.
 *
 * Con zoom 1 equivale a `object-fit: cover`: la foto se agranda lo justo para
 * tapar el recuadro sin deformarse, y sobra por un lado. El punto de interés
 * decide qué parte de ese sobrante se recorta.
 */
export function recorte(
  anchoFoto: number,
  altoFoto: number,
  ancho: number,
  alto: number,
  e: Encuadre = ENCUADRE_CENTRADO,
): Recorte {
  const cubrir = Math.max(ancho / anchoFoto, alto / altoFoto)
  const escala = cubrir * Math.max(1, e.zoom)

  const w = anchoFoto * escala
  const h = altoFoto * escala

  // `ancho - w` nunca es positivo, así que dx recorre de "pegado a la derecha"
  // hasta 0 conforme x va de 1 a 0. No hace falta acotar nada.
  return { ancho: w, alto: h, dx: (ancho - w) * e.x, dy: (alto - h) * e.y }
}

/**
 * La foto ya recortada, como imagen suelta.
 *
 * El PDF no sabe recortar: coloca la imagen que se le dé, estirada al recuadro.
 * Así que el recorte se hace antes, con la misma cuenta que usa la pantalla, y
 * se le entrega una imagen que ya tiene la proporción del hueco.
 */
export function fotoRecortada(
  foto: HTMLImageElement,
  anchoMm: number,
  altoMm: number,
  e: Encuadre,
  dpi = 300,
): string {
  const ancho = Math.round((anchoMm / 25.4) * dpi)
  const alto = Math.round((altoMm / 25.4) * dpi)

  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto

  const ctx = lienzo.getContext('2d')
  if (!ctx) return ''

  const r = recorte(foto.naturalWidth, foto.naturalHeight, ancho, alto, e)
  ctx.drawImage(foto, r.dx, r.dy, r.ancho, r.alto)

  return lienzo.toDataURL('image/jpeg', 0.92)
}

/** El mismo recorte, en propiedades de CSS. Es lo que usa el previo. */
export function recorteCss(
  anchoFoto: number,
  altoFoto: number,
  ancho: number,
  alto: number,
  e: Encuadre = ENCUADRE_CENTRADO,
): { backgroundSize: string; backgroundPosition: string } {
  const r = recorte(anchoFoto, altoFoto, ancho, alto, e)
  return {
    backgroundSize: `${r.ancho}px ${r.alto}px`,
    backgroundPosition: `${r.dx}px ${r.dy}px`,
  }
}
