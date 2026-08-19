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

import { cargarLogo, dibujarLogo } from './logo'
import { recorte, type Encuadre } from './encuadre'
import type { ArchivoArmado } from './armado'
import { EMPRESA } from '@/lib/empresa'

export const CARNET_ANCHO_MM = 54
export const CARNET_ALTO_MM = 86
const DPI = 300

/** Milímetros a píxeles del lienzo. */
const mm = (v: number) => (v / 25.4) * DPI
/** Puntos tipográficos a píxeles del lienzo. */
const pt = (v: number) => (v / 72) * DPI

// El primario de la marca. Antes era el azul de «La Cantera».
const MARCA_BANDA = '#cc3f00'
const MARCA_CARGO = '#9e4c01'
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

/**
 * Las cédulas se leen mucho mejor con los puntos de mil.
 *
 * Se limpia el número antes de convertirlo. Una cédula guardada ya con puntos
 * —"V-18.345.221", que es como la escribe quien la copia del documento— hacía
 * `Number('18.345.221')`, que da NaN, y el carnet salía impreso con "V-NaN" en
 * el renglón de la cédula sin que nada avisara.
 */
function cedulaLegible(cedula: string): string {
  const [letra, ...resto] = cedula.split('-')
  const digitos = resto.join('-').replace(/\D/g, '')
  if (!digitos) return cedula
  return `${letra}-${Number(digitos).toLocaleString('es-VE')}`
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
 * La cara de delante: quién es.
 *
 * Dibuja desde el origen del lienzo, así que para ponerla en otro sitio basta
 * trasladar el contexto antes de llamarla. Es lo que hace la hoja de imprenta.
 */
function frente(ctx: CanvasRenderingContext2D, d: DatosCarnet, logo: HTMLImageElement) {
  // Fondo
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, mm(CARNET_ANCHO_MM), mm(CARNET_ALTO_MM))

  // ---------------------------------------------------------------- Banda
  ctx.fillStyle = MARCA_BANDA
  ctx.fillRect(0, 0, mm(CARNET_ANCHO_MM), mm(21))

  dibujarLogo(ctx, logo, mm(4), mm(3), mm(7))

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

  ctx.fillStyle = MARCA_CARGO
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
  ctx.fillRect(0, mm(CARNET_ALTO_MM - 7.1), mm(CARNET_ANCHO_MM), mm(7.1))

  ctx.fillStyle = TINTA
  ctx.font = `600 ${pt(5.2)}px ${FUENTE}`
  ctx.letterSpacing = `${mm(0.18)}px`
  ctx.fillText('FICHA', mm(4.5), mm(CARNET_ALTO_MM - 2.6))
  ctx.letterSpacing = '0px'

  ctx.font = `700 ${pt(11)}px ${FUENTE}`
  textoDerecha(ctx, d.ficha, mm(49.5), mm(CARNET_ALTO_MM - 2.3))
}


/**
 * La cara de detrás: la marca y nada más.
 *
 * Un reverso no necesita repetir datos —todos están delante— y sí necesita
 * decir de quién es la tarjeta a un metro de distancia, que es como se mira un
 * carnet colgado del cuello cuando la persona está de espaldas. Por eso va la
 * marca grande, centrada, sobre blanco, con la razón social tal como está en el
 * registro y el RIF debajo.
 *
 * La barra amarilla del pie es la misma del frente. No dice nada: está para que
 * las dos caras se reconozcan como del mismo carnet cuando se ven separadas.
 */
function reverso(ctx: CanvasRenderingContext2D, logo: HTMLImageElement) {
  const ANCHO = mm(CARNET_ANCHO_MM)
  const ALTO = mm(CARNET_ALTO_MM)

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, ANCHO, ALTO)

  /*
    El bloque —marca, nombre, RIF— se centra en el papel blanco, no en el
    carnet entero: la barra amarilla del pie ya pesa abajo, y contarla dentro
    del centro empujaba todo hacia el borde inferior. Queda un pelo más de aire
    arriba que abajo, que es como se centra a ojo cualquier cosa enmarcada.
  */
  const lado = mm(28)
  // Sobre papel blanco el disco sobra: se vería su borde.
  dibujarLogo(ctx, logo, (ANCHO - lado) / 2, mm(19), lado, false)

  ctx.fillStyle = TINTA
  ctx.font = `700 ${pt(7.4)}px ${FUENTE}`
  textoCentrado(ctx, EMPRESA.nombre, mm(57))

  ctx.fillStyle = GRIS
  ctx.font = `500 ${pt(6)}px ${FUENTE}`
  textoCentrado(ctx, `${EMPRESA.forma} · RIF ${EMPRESA.rif}`, mm(62.5))

  ctx.fillStyle = AMARILLO
  ctx.fillRect(0, ALTO - mm(7.1), ANCHO, mm(7.1))
}

export type CaraCarnet = 'frente' | 'reverso'

/**
 * Pinta una cara del carnet y devuelve el lienzo.
 *
 * Espera a que las fuentes estén cargadas: sin eso, el primer carnet del día
 * sale en la tipografía de reserva y nadie entiende por qué el segundo se ve
 * distinto.
 */
export async function dibujarCarnet(
  d: DatosCarnet,
  cara: CaraCarnet = 'frente',
): Promise<HTMLCanvasElement> {
  await document.fonts.ready
  const logo = await cargarLogo()

  const lienzo = document.createElement('canvas')
  lienzo.width = Math.round(mm(CARNET_ANCHO_MM))
  lienzo.height = Math.round(mm(CARNET_ALTO_MM))

  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('El navegador no pudo preparar el lienzo del carnet.')

  ctx.textBaseline = 'alphabetic'
  if (cara === 'reverso') reverso(ctx, logo)
  else frente(ctx, d, logo)

  return lienzo
}

/**
 * Una cara del carnet en PNG, armada y sin guardar.
 *
 * Cada cara es un archivo suyo, de 54 × 86 mm a 300 dpi —638 × 1016 píxeles—,
 * y el nombre lo dice: quien las mande a imprimir no tiene que abrirlas para
 * saber cuál es cuál.
 */
export async function armarCarnet(
  d: DatosCarnet,
  cara: CaraCarnet = 'frente',
): Promise<ArchivoArmado> {
  const lienzo = await dibujarCarnet(d, cara)

  const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, 'image/png'))
  if (!blob) throw new Error('No se pudo generar la imagen del carnet.')

  const apellido = d.apellidos.split(' ')[0].toLowerCase()
  return { blob, nombre: `carnet-${cara}-${d.ficha}-${apellido}.png` }
}
