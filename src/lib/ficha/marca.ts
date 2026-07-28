/**
 * La marca de La Cantera, dibujable en cualquier lienzo.
 *
 * El mismo dibujo tiene que salir en tres sitios que no comparten nada: el SVG
 * de la interfaz, el PNG del carnet a 300 dpi y el PDF de la ficha. Aquí vive
 * la geometría una sola vez; cada destino la pinta con lo suyo.
 *
 * El pico va DETRÁS de la piedra a propósito. Puesto delante, la roca le tapa
 * media cabeza y el conjunto se lee como un gancho; detrás, asoma la cabeza
 * entera y el mango se pierde dentro, que es el gesto de haberlo clavado.
 */

/** Todo está dibujado sobre esta caja. Al pintar se escala desde aquí. */
export const MARCA_CAJA = 64

export interface ColoresMarca {
  /** Cara en sombra de la piedra: es la que define la silueta. */
  piedra: string
  /** Cara superior, la que da la luz. */
  piedraClara: string
  /** Cara derecha. */
  piedraMedia: string
  pico: string
}

export const MARCA_COLOR: ColoresMarca = {
  piedra: '#1D358F',
  piedraClara: '#92A9FC',
  piedraMedia: '#2B4FD9',
  pico: '#F0A128',
}

/** Sobre azul oscuro —la banda del carnet, el encabezado de la hoja— la piedra
 *  se aclara. En azul sobre azul la silueta desaparece. */
export const MARCA_SOBRE_OSCURO: ColoresMarca = {
  piedra: '#FFFFFF',
  piedraClara: '#DCE4FF',
  piedraMedia: '#BCCBFF',
  pico: '#F0A128',
}

/** Cabeza del pico: barra curva de grosor parejo con las dos puntas afiladas. */
const PICO_CABEZA =
  'M-22 -12 C-15 -22 -7 -26 0 -26 C7 -26 15 -22 22 -12 ' +
  'L17.5 -10 C11.5 -17.5 5.5 -20.5 0 -20.5 C-5.5 -20.5 -11.5 -17.5 -17.5 -10 Z'

const PICO_MANGO = 'M-3 -23 h6 v40 a3 3 0 0 1 -6 0 Z'

const PIEDRA_SILUETA = 'M9 45 L13 27 L26 19 L41 18 L55 29 L56 47 L37 58 L17 55 Z'
const PIEDRA_CARA_ALTA = 'M14.5 28 L26.5 20.5 L40 19.5 L45 30 L26 37 Z'
const PIEDRA_CARA_DERECHA = 'M46.5 31 L54.5 31.5 L55 46 L38.5 56.5 L36.5 39.5 Z'

/** Dónde queda el pico respecto de la caja de 64. */
const PICO_TRANSFORMACION = { x: 33.4, y: 22.6, giro: -18, escala: 0.62 }

/**
 * Pinta la marca sobre un lienzo 2D.
 *
 * `tamano` es el lado del cuadrado que ocupará; `x` e `y`, su esquina superior
 * izquierda. Todo en píxeles del lienzo, así que sirve igual para 30 px en
 * pantalla que para 400 px de un PNG a 300 dpi.
 */
export function dibujarMarca(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tamano: number,
  colores: ColoresMarca = MARCA_COLOR,
): void {
  const k = tamano / MARCA_CAJA
  const base = new DOMMatrix().translateSelf(x, y).scaleSelf(k, k)

  const pintar = (d: string, color: string, matriz: DOMMatrix) => {
    const p = new Path2D()
    p.addPath(new Path2D(d), matriz)
    ctx.fillStyle = color
    ctx.fill(p)
  }

  const { x: px, y: py, giro, escala } = PICO_TRANSFORMACION
  const mPico = base.translate(px, py).rotate(giro).scale(escala)

  pintar(PICO_CABEZA, colores.pico, mPico)
  pintar(PICO_MANGO, colores.pico, mPico)
  pintar(PIEDRA_SILUETA, colores.piedra, base)
  pintar(PIEDRA_CARA_ALTA, colores.piedraClara, base)
  pintar(PIEDRA_CARA_DERECHA, colores.piedraMedia, base)
}

/**
 * La marca como imagen suelta.
 *
 * jsPDF no dibuja curvas de un `path` de SVG, así que para el PDF la marca se
 * pinta antes en un lienzo y se coloca como imagen. Al ocupar 14 mm en la hoja,
 * 400 px sobran para que no se vea el borde escalonado ni al ampliar.
 */
export function marcaComoImagen(colores: ColoresMarca = MARCA_COLOR, lado = 400): string {
  const lienzo = document.createElement('canvas')
  lienzo.width = lado
  lienzo.height = lado

  const ctx = lienzo.getContext('2d')
  if (!ctx) return ''

  dibujarMarca(ctx, 0, 0, lado, colores)
  return lienzo.toDataURL('image/png')
}
