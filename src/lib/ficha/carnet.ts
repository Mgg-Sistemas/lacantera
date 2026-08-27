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

import qrcode from 'qrcode-generator'
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
  /**
   * El carnet emitido: su código y la dirección que lleva el QR.
   *
   * Sin esto el reverso sale como salía, sin QR. No es un caso raro ni un
   * error: un trabajador al que todavía no se le ha emitido carnet no tiene
   * código, y un QR que lleva a «este carnet no existe» es peor que no tenerlo.
   */
  verificacion?: { codigo: string; url: string } | null
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
 * El QR, dibujado módulo a módulo sobre el lienzo.
 *
 * NO SE PINTA UNA IMAGEN Y SE ESCALA
 *
 * La librería sabe devolver una etiqueta `<img>` con el QR dentro, y usarla
 * sería una línea. Pero esa imagen nace del tamaño que ella decide y aquí habría
 * que estirarla hasta los milímetros que toquen: al estirar, los bordes de cada
 * módulo quedan a medio píxel y el lector duda. Dibujando los módulos a mano,
 * cada uno mide un número ENTERO de píxeles del lienzo y el borde cae siempre
 * donde tiene que caer.
 *
 * Por eso el lado real se redondea hacia abajo: treinta y dos milímetros a 300
 * dpi son 378 píxeles, y entre 33 módulos tocan a 11,45. Se usan 11 y el QR
 * acaba midiendo 363 píxeles —30,7 mm— en vez de los 32 pedidos. Perder un
 * milímetro y pico a cambio de que no haya un solo borde borroso es el cambio
 * que hay que hacer.
 *
 * CORRECCIÓN DE ERRORES ALTA, Y NO ES POR CAPRICHO
 *
 * Esto va plastificado en el bolsillo de alguien que trabaja en una cantera.
 * Con el nivel «Q» el código se sigue leyendo con la cuarta parte de su
 * superficie rayada o con polvo encima. Cuesta unos módulos más de tamaño; a
 * cambio, el carnet sigue sirviendo después del primer mes de uso.
 */
function dibujarQr(
  ctx: CanvasRenderingContext2D,
  texto: string,
  centroXmm: number,
  arribaMm: number,
  ladoMm: number,
): number {
  const qr = qrcode(0, 'Q')
  qr.addData(texto)
  qr.make()

  const modulos = qr.getModuleCount()
  const paso = Math.floor(mm(ladoMm) / modulos)
  const lado = paso * modulos

  const x = mm(centroXmm) - lado / 2
  const y = mm(arribaMm)

  /*
    El fondo blanco se pinta aunque el papel ya sea blanco.

    Es la zona de silencio: el QR necesita cuatro módulos de margen limpio a su
    alrededor o el lector no encuentra dónde empieza. Pintarla aquí garantiza el
    margen aunque un día alguien ponga una marca de agua detrás.
  */
  const silencio = paso * 4
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(x - silencio, y - silencio, lado + silencio * 2, lado + silencio * 2)

  ctx.fillStyle = TINTA
  for (let fila = 0; fila < modulos; fila++) {
    for (let col = 0; col < modulos; col++) {
      if (qr.isDark(fila, col)) {
        ctx.fillRect(x + col * paso, y + fila * paso, paso, paso)
      }
    }
  }

  // Devuelve dónde termina, en milímetros, para que el reverso siga debajo.
  return arribaMm + lado / mm(1)
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
function reverso(
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement,
  verificacion?: { codigo: string; url: string } | null,
) {
  const ANCHO = mm(CARNET_ANCHO_MM)
  const ALTO = mm(CARNET_ALTO_MM)

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, ANCHO, ALTO)

  /*
    SIN CÓDIGO, EL REVERSO ES EL DE SIEMPRE

    A un trabajador al que todavía no se le emitió carnet no se le puede
    imprimir un QR: llevaría a «este carnet no existe». Así que este reverso
    tiene dos maquetas y no una, y la de arriba es la que había.
  */
  if (!verificacion) {
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
    return
  }

  /*
    CON CÓDIGO: LA MARCA SE ENCOGE Y EL QR MANDA

    El QR va aquí y no en el frente, que es donde lo puso el modelo que mandaron.
    En el frente no cabe —entre la foto y la barra amarilla quedan cuatro
    milímetros— y meterlo obligaría a robarle sitio a la foto, que es lo único
    que identifica a alguien de un vistazo en un portón.

    Aquí cabe a treinta milímetros. Un QR de treinta se lee de medio metro y
    aguanta el plástico rayado; uno de veinte, apretado en una esquina del
    frente, hay que acercárselo a la cara. Que se lea es lo único que le pedimos.

    Lo que se pierde: el reverso deja de ser igual para todos. Antes se imprimía
    uno y servía para toda la plantilla. Ahora cada persona tiene el suyo, que es
    lo mismo que ya pasa con el frente.
  */
  const ladoLogo = mm(13)
  dibujarLogo(ctx, logo, (ANCHO - ladoLogo) / 2, mm(5), ladoLogo, false)

  ctx.fillStyle = TINTA
  ctx.font = `700 ${pt(6.6)}px ${FUENTE}`
  textoCentrado(ctx, EMPRESA.nombre, mm(23))

  ctx.fillStyle = GRIS
  ctx.font = `500 ${pt(5.4)}px ${FUENTE}`
  textoCentrado(ctx, `${EMPRESA.forma} · RIF ${EMPRESA.rif}`, mm(27))

  ctx.fillStyle = HAIRLINE
  ctx.fillRect(mm(10), mm(30.5), mm(CARNET_ANCHO_MM - 20), Math.max(1, mm(0.25)))

  ctx.fillStyle = MARCA_CARGO
  ctx.font = `600 ${pt(5.2)}px ${FUENTE}`
  ctx.letterSpacing = `${mm(0.15)}px`
  textoCentrado(ctx, 'ESCANEE PARA VERIFICAR', mm(32.8))
  ctx.letterSpacing = '0px'

  /*
    Y LA DIRECCIÓN, IMPRESA DEBAJO.

    Nadie puede impedir que un carnet falsificado lleve un QR que apunte a una
    copia de esta página diciendo VIGENTE siempre. Lo único que se puede hacer es
    que la dirección buena esté escrita al lado, para que quien escanea pueda
    comparar lo que le abrió el teléfono con lo que dice el plástico.

    No es una hipótesis: preparando esto se imprimió una muestra con un dominio
    inventado que resultó ser de otra empresa, y al escanearla se llegaba a su
    aplicación. Con la dirección impresa, eso se ve.

    Sale de la propia URL del QR, no de una constante aparte: si las dos se
    escribieran por separado, un día dirían cosas distintas.
  */
  ctx.fillStyle = GRIS
  ctx.font = `500 ${pt(4.4)}px ${FUENTE}`
  textoCentrado(ctx, verificacion.url.replace(/^https?:\/\//, '').split('/')[0], mm(35.2))

  /*
    El QR arranca en 39,5 y no en 38, y pide 32 mm y no 30.

    Las dos cifras salieron de medir el dibujo, no de elegirlas. Con 30 mm los
    módulos quedaban en 0,76 mm y para un plástico que va a acabar rayado eso es
    justo; con 32 salen a 0,85. Y con el QR arrancando en 38 su zona de silencio
    —el blanco obligatorio de cuatro módulos alrededor— empezaba en 34,95 y le
    comía el pie a las letras de «ESCANEE PARA VERIFICAR», que se dibuja antes.
    Metro y medio de aire más abajo y el problema desaparece.
  */
  const finQr = dibujarQr(ctx, verificacion.url, CARNET_ANCHO_MM / 2, 39.5, 32)

  /*
    EL CÓDIGO TAMBIÉN VA ESCRITO, DEBAJO

    Es lo que salva el carnet cuando el QR ya no se lee: rayado, mojado, o
    escaneado por un teléfono viejo. Con el código a la vista, quien verifica lo
    teclea en la misma pantalla y llega igual.

    Va partido en grupos de seis. Dieciocho caracteres seguidos se copian mal
    —se salta uno y se repite otro— y agrupados se leen de tres golpes.
  */
  ctx.fillStyle = TINTA
  ctx.font = `600 ${pt(6.4)}px ${FUENTE}`
  ctx.letterSpacing = `${mm(0.25)}px`
  textoCentrado(
    ctx,
    (verificacion.codigo.match(/.{1,6}/g) ?? [verificacion.codigo]).join(' '),
    mm(finQr + 4.2),
  )
  ctx.letterSpacing = '0px'

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
  if (cara === 'reverso') reverso(ctx, logo, d.verificacion)
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

/**
 * Las dos caras en un PDF a tamaño real, que es lo que se lleva a la imprenta.
 *
 * UNA IMAGEN NO TIENE TAMAÑO
 *
 * El PNG mide 638 × 1016 píxeles y nada más: cuánto es eso en centímetros
 * depende de a qué resolución decida imprimirlo quien lo reciba. Hay que
 * decírselo aparte, por mensaje, y confiar en que no se pierda por el camino.
 * Un carnet impreso un 4% más grande no entra en la funda de plastificar.
 *
 * El PDF lleva la medida dentro. La página ES de 54 × 86 mm, así que la
 * imprenta abre el archivo y ya está: no hay nada que ajustar ni nada que
 * preguntar. Es lo único que cambia respecto a las imágenes, y es justo lo que
 * pedía la líder al decir «optimizado para su posterior impresión».
 *
 * DOS PÁGINAS, NO DOS ARCHIVOS
 *
 * Frente y reverso van en el mismo documento y en ese orden. Mandarlos por
 * separado es cómo se acaba imprimiendo el frente de uno con el reverso de
 * otro, o el reverso al revés.
 */
export async function armarCarnetPdf(d: DatosCarnet): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')

  const [frenteLienzo, reversoLienzo] = await Promise.all([
    dibujarCarnet(d, 'frente'),
    dibujarCarnet(d, 'reverso'),
  ])

  const doc = new jsPDF({
    unit: 'mm',
    format: [CARNET_ANCHO_MM, CARNET_ALTO_MM],
    orientation: 'portrait',
    compress: true,
  })

  // Sin márgenes: el dibujo ya trae los suyos y la sangre la pone la imprenta.
  doc.addImage(
    frenteLienzo.toDataURL('image/png'),
    'PNG', 0, 0, CARNET_ANCHO_MM, CARNET_ALTO_MM,
  )
  doc.addPage([CARNET_ANCHO_MM, CARNET_ALTO_MM], 'portrait')
  doc.addImage(
    reversoLienzo.toDataURL('image/png'),
    'PNG', 0, 0, CARNET_ANCHO_MM, CARNET_ALTO_MM,
  )

  doc.setProperties({ title: `Carnet ${d.ficha} — ${d.nombres} ${d.apellidos}` })

  const apellido = d.apellidos.split(' ')[0].toLowerCase()
  return { blob: doc.output('blob'), nombre: `carnet-${d.ficha}-${apellido}.pdf` }
}
