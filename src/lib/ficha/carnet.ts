/**
 * El carnet, dibujado a 300 dpi.
 *
 * 54 × 86 mm es la medida de una tarjeta de identificación vertical. A 300
 * puntos por pulgada eso da 638 × 1016 píxeles, que es lo que pide una imprenta
 * para que el texto chico no salga con el borde escalonado. Se dibuja en un
 * lienzo y no en HTML porque el HTML no sabe exportar: `html2canvas` y compañía
 * reinterpretan el CSS y lo que sale nunca es exactamente lo que se vio.
 *
 * Todo se mide en milímetros y se convierte al final. Así el código se lee
 * igual que la regla con la que se comprueba el resultado impreso.
 */

import { dibujarMarca, MARCA_SOBRE_OSCURO } from './marca'
import { recorte, type Encuadre } from './encuadre'
import { EMPRESA } from '@/lib/empresa'

export const CARNET_ANCHO_MM = 54
export const CARNET_ALTO_MM = 86
const DPI = 300

/** Milímetros a píxeles del lienzo. */
const mm = (v: number) => (v / 25.4) * DPI
/** Puntos tipográficos a píxeles del lienzo. */
const pt = (v: number) => (v / 72) * DPI

const AZUL_BANDA = '#1D358F'
const AZUL_CARGO = '#2B4FD9'
const AMARILLO = '#F0A128'
const TINTA = '#262C3D'
const GRIS = '#7B839A'
const HAIRLINE = '#EEF0F6'

const FUENTE = "'Inter Variable', Inter, system-ui, 'Segoe UI', sans-serif"

export interface DatosCarnet {
  ficha: string
  nombres: string
  apellidos: string
  cedula: string
  cargo: string
  departamento: string | null
  fecha_ingreso: string
  grupo_sanguineo: string | null
  foto: HTMLImageElement | null
  encuadre: Encuadre
}

/** Las cédulas se leen mucho mejor con los puntos de mil. */
function cedulaLegible(cedula: string): string {
  const [letra, numero] = cedula.split('-')
  if (!numero) return cedula
  return `${letra}-${Number(numero).toLocaleString('es-VE')}`
}

function fechaCorta(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  const dd = String(d.getDate()).padStart(2, '0')
  const mmes = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mmes}/${d.getFullYear()}`
}

/**
 * Un nombre largo no cabe en 45 mm. En vez de encogerlo hasta que no se lea,
 * se usa el primer nombre y el primer apellido, que es como llama al portero.
 */
function nombreDeCarnet(ctx: CanvasRenderingContext2D, d: DatosCarnet, anchoMax: number): string {
  const completo = `${d.nombres} ${d.apellidos}`.trim()
  if (ctx.measureText(completo).width <= anchoMax) return completo

  const corto = `${d.nombres.split(' ')[0]} ${d.apellidos.split(' ')[0]}`
  return corto
}

function textoDerecha(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number) {
  ctx.textAlign = 'right'
  ctx.fillText(texto, x, y)
  ctx.textAlign = 'left'
}

function textoCentrado(ctx: CanvasRenderingContext2D, texto: string, y: number) {
  ctx.textAlign = 'center'
  ctx.fillText(texto, mm(CARNET_ANCHO_MM / 2), y)
  ctx.textAlign = 'left'
}

/**
 * Pinta el carnet completo y devuelve el lienzo.
 *
 * Espera a que las fuentes estén cargadas: sin eso, el primer carnet del día
 * sale en la tipografía de reserva y nadie entiende por qué el segundo se ve
 * distinto.
 */
export async function dibujarCarnet(d: DatosCarnet): Promise<HTMLCanvasElement> {
  await document.fonts.ready

  const lienzo = document.createElement('canvas')
  lienzo.width = Math.round(mm(CARNET_ANCHO_MM))
  lienzo.height = Math.round(mm(CARNET_ALTO_MM))

  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('El navegador no pudo preparar el lienzo del carnet.')

  ctx.textBaseline = 'alphabetic'

  // Fondo
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, lienzo.width, lienzo.height)

  // ---------------------------------------------------------------- Banda
  ctx.fillStyle = AZUL_BANDA
  ctx.fillRect(0, 0, lienzo.width, mm(21))

  dibujarMarca(ctx, mm(4), mm(3), mm(7), MARCA_SOBRE_OSCURO)

  // La razón social se parte en dos líneas: entera en una sola caben 30
  // caracteres en 37 mm y habría que bajarla a un cuerpo que en la mano no se
  // lee. El corte respeta la parte distintiva arriba y deja abajo la forma
  // societaria con el RIF, que es como se cita a una empresa venezolana.
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `700 ${pt(7)}px ${FUENTE}`
  ctx.fillText(EMPRESA.nombre, mm(13.3), mm(7.4))

  ctx.fillStyle = 'rgba(255,255,255,.75)'
  ctx.font = `400 ${pt(5.4)}px ${FUENTE}`
  ctx.fillText(`${EMPRESA.forma} · RIF ${EMPRESA.rif}`, mm(13.3), mm(11.6))

  // ----------------------------------------------------------------- Foto
  const fx = mm(14)
  const fy = mm(15)
  const fw = mm(26)
  const fh = mm(29)

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(fx, fy, fw, fh)

  const ix = fx + mm(1)
  const iy = fy + mm(1)
  const iw = mm(24)
  const ih = mm(27)

  ctx.fillStyle = '#CFD6E6'
  ctx.fillRect(ix, iy, iw, ih)

  if (d.foto) {
    const r = recorte(d.foto.naturalWidth, d.foto.naturalHeight, iw, ih, d.encuadre)
    ctx.save()
    ctx.beginPath()
    ctx.rect(ix, iy, iw, ih)
    ctx.clip()
    ctx.drawImage(d.foto, ix + r.dx, iy + r.dy, r.ancho, r.alto)
    ctx.restore()
  }

  // -------------------------------------------------------------- Nombre
  ctx.fillStyle = TINTA
  ctx.font = `700 ${pt(9.5)}px ${FUENTE}`
  textoCentrado(ctx, nombreDeCarnet(ctx, d, mm(45)), mm(50))

  ctx.fillStyle = AZUL_CARGO
  ctx.font = `600 ${pt(6)}px ${FUENTE}`
  ctx.letterSpacing = `${mm(0.1)}px`
  textoCentrado(ctx, d.cargo.toUpperCase(), mm(54))
  ctx.letterSpacing = '0px'

  // --------------------------------------------------------------- Datos
  const filas: Array<[string, string]> = [
    ['Cédula', cedulaLegible(d.cedula)],
    ['Departamento', d.departamento ?? '—'],
    ['Ingreso', fechaCorta(d.fecha_ingreso)],
    ['Sangre', d.grupo_sanguineo ?? '—'],
  ]

  let y = mm(60)
  for (const [clave, valor] of filas) {
    ctx.font = `400 ${pt(6.2)}px ${FUENTE}`
    ctx.fillStyle = GRIS
    ctx.fillText(clave, mm(4.5), y)

    ctx.font = `600 ${pt(6.2)}px ${FUENTE}`
    ctx.fillStyle = TINTA
    textoDerecha(ctx, valor, mm(49.5), y)

    ctx.fillStyle = HAIRLINE
    ctx.fillRect(mm(4.5), y + mm(1.2), mm(45), Math.max(1, mm(0.25)))
    y += mm(4.5)
  }

  // ----------------------------------------------------------------- Pie
  ctx.fillStyle = AMARILLO
  ctx.fillRect(0, mm(CARNET_ALTO_MM - 7.1), lienzo.width, mm(7.1))

  ctx.fillStyle = TINTA
  ctx.font = `600 ${pt(5.2)}px ${FUENTE}`
  ctx.letterSpacing = `${mm(0.18)}px`
  ctx.fillText('FICHA', mm(4.5), mm(CARNET_ALTO_MM - 2.6))
  ctx.letterSpacing = '0px'

  ctx.font = `700 ${pt(11)}px ${FUENTE}`
  textoDerecha(ctx, d.ficha, mm(49.5), mm(CARNET_ALTO_MM - 2.3))

  return lienzo
}

/** Descarga el carnet como PNG. */
export async function descargarCarnet(d: DatosCarnet): Promise<void> {
  const lienzo = await dibujarCarnet(d)

  const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, 'image/png'))
  if (!blob) throw new Error('No se pudo generar la imagen del carnet.')

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `carnet-${d.ficha}-${d.apellidos.split(' ')[0].toLowerCase()}.png`

  // El enlace tiene que estar en el documento para que el clic cuente como
  // navegación, y la URL no se puede soltar en la misma vuelta del bucle: el
  // navegador todavía no ha empezado a leer el archivo y la descarga se cae
  // sin decir nada. Por eso se libera en el siguiente turno.
  document.body.append(a)
  a.click()
  a.remove()

  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
