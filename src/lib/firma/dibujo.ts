/*
  DE LO QUE SE DIBUJA A LO QUE SE GUARDA

  Tres formas de hacer una firma —trazarla, escribirla, fotografiarla— y una
  sola forma de guardarla: un PNG con fondo transparente, recortado al trazo.

  Transparente porque en el papel la firma se estampa SOBRE la raya. Con fondo
  blanco taparía la raya y el nombre de debajo, y se vería el rectángulo.

  Recortado porque lo que se dibuja siempre ocupa menos que el lienzo: sin
  recortar, una firma pequeña en un canvas grande sale diminuta en el PDF
  —o hay que estirar el rectángulo entero, márgenes incluidos, para que se
  vea—. Recortada, el papel la escala al hueco que tiene y siempre queda bien.
*/

/** Lo más grande que se guarda. Por encima, la firma pesa sin verse mejor. */
const ANCHO_MAXIMO = 640
const ALTO_MAXIMO = 220

/**
 * Quita todo lo que sobra alrededor del trazo y deja el PNG listo.
 *
 * Devuelve null si el lienzo está vacío: es la forma de distinguir «no dibujó
 * nada» de «dibujó algo muy tenue», que desde fuera se ven igual.
 */
export function recortarYExportar(lienzo: HTMLCanvasElement): string | null {
  const ctx = lienzo.getContext('2d')
  if (!ctx) return null

  const { width: w, height: h } = lienzo
  if (w === 0 || h === 0) return null

  const datos = ctx.getImageData(0, 0, w, h).data

  let arriba = h
  let abajo = -1
  let izq = w
  let der = -1

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Solo el canal alfa: un píxel con alfa cero no es parte del trazo por
      // muy oscuro que sea su color.
      if (datos[(y * w + x) * 4 + 3] > 8) {
        if (y < arriba) arriba = y
        if (y > abajo) abajo = y
        if (x < izq) izq = x
        if (x > der) der = x
      }
    }
  }

  if (abajo < 0) return null

  // Un respiro alrededor para que el trazo no quede pegado al borde: al
  // estamparla en el papel, un descendente cortado se lee como un error de
  // impresión.
  const MARGEN = 6
  arriba = Math.max(0, arriba - MARGEN)
  izq = Math.max(0, izq - MARGEN)
  abajo = Math.min(h - 1, abajo + MARGEN)
  der = Math.min(w - 1, der + MARGEN)

  const anchoRecorte = der - izq + 1
  const altoRecorte = abajo - arriba + 1

  const escala = Math.min(1, ANCHO_MAXIMO / anchoRecorte, ALTO_MAXIMO / altoRecorte)

  const salida = document.createElement('canvas')
  salida.width = Math.max(1, Math.round(anchoRecorte * escala))
  salida.height = Math.max(1, Math.round(altoRecorte * escala))

  const salidaCtx = salida.getContext('2d')
  if (!salidaCtx) return null
  salidaCtx.imageSmoothingQuality = 'high'
  salidaCtx.drawImage(
    lienzo,
    izq,
    arriba,
    anchoRecorte,
    altoRecorte,
    0,
    0,
    salida.width,
    salida.height,
  )

  return salida.toDataURL('image/png')
}

/**
 * Convierte el papel blanco de una foto en transparencia.
 *
 * Una firma fotografiada llega como trazo oscuro sobre hoja clara. Estamparla
 * tal cual pondría un recuadro de papel encima del documento. En vez de un
 * umbral duro —que deja el borde del trazo dentado— el alfa sale de lo oscuro
 * que es cada píxel: el trazo queda opaco, el papel desaparece, y el degradado
 * de en medio conserva el antialias del original.
 */
export function papelATransparencia(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const imagen = ctx.getImageData(0, 0, w, h)
  const d = imagen.data

  for (let i = 0; i < d.length; i += 4) {
    // Luminancia aproximada. Los coeficientes son los de siempre para el ojo
    // humano: el verde pesa más que el rojo y mucho más que el azul.
    const luz = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255

    // Por encima de este punto es papel, por debajo empieza a haber trazo.
    // 0,82 deja pasar sombras y arrugas sin comerse un trazo a lápiz.
    const UMBRAL = 0.82
    const alfa = luz >= UMBRAL ? 0 : Math.min(1, (UMBRAL - luz) / 0.45)

    // El trazo se lleva al mismo negro que el resto de la firma: una foto con
    // luz amarilla dejaría una firma parda al lado de una dibujada en negro.
    d[i] = 22
    d[i + 1] = 22
    d[i + 2] = 22
    d[i + 3] = Math.round(alfa * 255)
  }

  ctx.putImageData(imagen, 0, 0)
}

/**
 * Las letras que se ofrecen para firmar tecleando.
 *
 * Se nombran varias por familia porque no hay ninguna que esté en todos los
 * equipos, y termina en `cursive`, que el navegador resuelve con lo que tenga.
 * Si en el equipo de alguien no está la primera, cae en la siguiente sin que
 * nadie tenga que instalar nada.
 */
export const LETRAS_DE_FIRMA = [
  { valor: "'Segoe Script', 'Bradley Hand', 'Brush Script MT', cursive", etiqueta: 'Manuscrita' },
  { valor: "'Lucida Handwriting', 'Apple Chancery', 'Zapfino', cursive", etiqueta: 'Inglesa' },
  { valor: "'Ink Free', 'Comic Sans MS', 'Chalkboard SE', cursive", etiqueta: 'Suelta' },
  { valor: "'Georgia', 'Times New Roman', serif", etiqueta: 'Con letra de imprenta' },
]

/** Escribe el nombre en el lienzo, centrado y del tamaño que quepa. */
export function escribirFirma(
  lienzo: HTMLCanvasElement,
  texto: string,
  familia: string,
  color = '#161616',
): void {
  const ctx = lienzo.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, lienzo.width, lienzo.height)
  if (!texto.trim()) return

  // Se busca el cuerpo más grande que quepa a lo ancho. Escribir con un tamaño
  // fijo deja los nombres largos cortados y los cortos ridículos.
  let cuerpo = Math.floor(lienzo.height * 0.55)
  const anchoUtil = lienzo.width * 0.88

  for (; cuerpo > 10; cuerpo -= 2) {
    ctx.font = `${cuerpo}px ${familia}`
    if (ctx.measureText(texto).width <= anchoUtil) break
  }

  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(texto, lienzo.width / 2, lienzo.height / 2)
}
