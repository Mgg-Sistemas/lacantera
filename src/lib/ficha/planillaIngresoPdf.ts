/**
 * La planilla de ingreso, en blanco, para llenar a mano.
 *
 * Es la herramienta de quien hace la entrevista: se imprime, se llena con
 * bolígrafo delante del aspirante, y después alguien la transcribe al sistema.
 *
 * DE AHÍ SALE LA ÚNICA REGLA QUE IMPORTA: **cada hueco de este papel tiene que
 * existir en la ficha del trabajador.** Un papel que pregunta algo que el
 * sistema no guarda produce un dato que se queda en el papel, y entonces la
 * carpeta de papeles vuelve a ser la fuente de verdad. Y al revés: un campo de
 * la ficha que el papel no pregunta se rellena de memoria una semana después,
 * que es como se escriben los teléfonos equivocados.
 *
 * Por eso donde el sistema ofrece una lista cerrada —estado civil, jornada,
 * forma de pago— el papel ofrece las MISMAS opciones con su casilla, y no una
 * raya en blanco. Una raya invita a escribir «unión libre», y luego en pantalla
 * hay que elegir entre cinco que no lo dicen así.
 *
 * NO SE PREGUNTA EL SUELDO NI LA FECHA DE INGRESO. Los dos salen del tabulador
 * y de la decisión de contratar, no de la entrevista; ponerlos aquí invitaría a
 * prometerlos en la mesa.
 *
 * DOS HOJAS Y NO UNA, a propósito. Apretando cabría en una, con rayas de cuatro
 * milímetros donde no entra una firma ni un nombre largo. El papel es barato y
 * la letra de otro es cara de descifrar.
 *
 * Helvetica y no la Inter del sistema, como el resto de los papeles: es una de
 * las catorce fuentes que todo lector de PDF ya tiene, y en papel no se nota.
 */

import { logoComoImagen } from './logo'
import { ABAJO, ANCHO_UTIL, DER, IZQ } from './hoja'
import {
  type EmpresaPapel,
  GRIS,
  HAIRLINE,
  membrete,
  pieDePagina,
  ROTULO,
  seccion,
  TINTA,
  tituloDocumento,
} from './papel'

type Doc = import('jspdf').jsPDF

/** Lo que mide un renglón para escribir a mano. Medido con letra normal. */
const ALTO_RENGLON = 11
const SEPARA_COL = 8
const ANCHO_COL = (ANCHO_UTIL - SEPARA_COL) / 2
const COL2 = IZQ + ANCHO_COL + SEPARA_COL

/**
 * Un hueco para escribir: el rótulo arriba, pequeño, y la raya debajo.
 *
 * El rótulo va ENCIMA y no a la izquierda porque a la izquierda se come el
 * ancho de escritura, y en un papel que se llena a mano el ancho es lo único
 * que de verdad escasea.
 */
function hueco(doc: Doc, x: number, y: number, ancho: number, rotulo: string, pista?: string) {
  doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(GRIS)
  doc.text(rotulo.toUpperCase(), x, y)

  if (pista) {
    const usado = doc.getTextWidth(rotulo.toUpperCase())
    doc.setFontSize(6.5).setTextColor(HAIRLINE === '#e7e5e4' ? '#b5b0ab' : GRIS)
    doc.text(pista, x + usado + 2, y)
  }

  doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
  doc.line(x, y + 5.5, x + ancho, y + 5.5)
}

/** Una casilla para marcar con una equis, y su palabra al lado. */
function casilla(doc: Doc, x: number, y: number, texto: string): number {
  doc.setDrawColor('#9c9690').setLineWidth(0.3)
  doc.rect(x, y - 2.6, 3, 3)
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(TINTA)
  doc.text(texto, x + 4.5, y)
  return x + 4.5 + doc.getTextWidth(texto) + 4
}

/** Un rótulo con su fila de casillas debajo. Para las listas cerradas. */
function opciones(doc: Doc, x: number, y: number, rotulo: string, lista: string[]): number {
  doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(GRIS)
  doc.text(rotulo.toUpperCase(), x, y)

  let cursor = x
  for (const texto of lista) cursor = casilla(doc, cursor, y + 5.5, texto)
  return y + ALTO_RENGLON
}

/**
 * La tabla de la carga familiar, con las filas vacías.
 *
 * Cinco filas y no tres: la carga familiar de esta casa llega a cuatro y cinco
 * hijos con normalidad, y una tabla que se queda corta se continúa en el margen
 * con una flecha que nadie transcribe.
 */
function tablaEnBlanco(doc: Doc, y: number, columnas: [string, number][], filas: number): number {
  const ALTO_FILA = 9

  doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(ROTULO)
  let x = IZQ
  for (const [titulo, ancho] of columnas) {
    doc.text(titulo.toUpperCase(), x + 1.5, y)
    x += ancho
  }

  const arriba = y + 2
  doc.setDrawColor(HAIRLINE).setLineWidth(0.3)

  for (let f = 0; f <= filas; f++) {
    const linea = arriba + f * ALTO_FILA
    doc.line(IZQ, linea, DER, linea)
  }

  x = IZQ
  for (const [, ancho] of columnas) {
    doc.line(x, arriba, x, arriba + filas * ALTO_FILA)
    x += ancho
  }
  doc.line(DER, arriba, DER, arriba + filas * ALTO_FILA)

  return arriba + filas * ALTO_FILA + 8
}

/*
  EL PIE FIRMADO, ANCLADO ABAJO.

  Va pegado al margen inferior y no al final de lo que haya encima, para que
  caiga siempre a la misma altura: es donde la gente lo busca al repasar una
  pila de planillas, y donde se apoya la mano para firmar.

  DOS RAYAS Y NO UNA. Firma quien da los datos y firma quien los tomó. Una
  planilla con una sola firma no dice quién estuvo delante, y a los tres meses
  eso es justo lo que se pregunta.

  Y DEBAJO DE CADA RAYA, EL NOMBRE Y LA CÉDULA. Una firma sola no identifica a
  nadie: media plantilla firma con una rúbrica que no se lee. El nombre en letra
  de molde debajo es lo que convierte el garabato en un dato.

  LA HUELLA ES OPCIONAL Y SE DECIDE ANTES DE IMPRIMIR. Hay quien no firma igual
  dos veces, y para esos casos la huella del pulgar vale más que la rúbrica.
  Pero no siempre hace falta, y un recuadro vacío en todas las planillas invita
  a dejarlo vacío — y un campo que se deja vacío siempre acaba enseñando que el
  papel no se llena entero.
*/
function pieFirmado(doc: Doc, conHuella: boolean): void {
  const RAYA = ABAJO - 27
  const SEGUNDA = RAYA + 12

  const anchoHuella = 26
  const desdeX = conHuella ? IZQ + anchoHuella + 8 : IZQ
  const SEPARA = 16
  const ancho = (DER - desdeX - SEPARA) / 2

  doc.setDrawColor('#9c9690').setLineWidth(0.3)

  if (conHuella) {
    // El recuadro sube hasta encima de la primera raya y baja hasta la segunda:
    // así ocupa el alto de las dos y el pie se lee como un solo bloque.
    const alto = SEGUNDA - RAYA + 18
    doc.rect(IZQ, RAYA - 12, anchoHuella, alto)
    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(GRIS)
    doc.text('HUELLA', IZQ + anchoHuella / 2, RAYA - 15, { align: 'center' })
    doc.text('Pulgar derecho', IZQ + anchoHuella / 2, SEGUNDA + 9, { align: 'center' })
  }

  const lados = ['Firma del aspirante', 'Firma de quien entrevista']
  for (const [i, texto] of lados.entries()) {
    const x = desdeX + i * (ancho + SEPARA)

    doc.line(x, RAYA, x + ancho, RAYA)
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
    doc.text(texto, x + ancho / 2, RAYA + 4, { align: 'center' })

    doc.line(x, SEGUNDA, x + ancho, SEGUNDA)
    doc.setFontSize(6.5)
    doc.text('Nombre en letra de molde y cédula', x + ancho / 2, SEGUNDA + 4, { align: 'center' })
  }
}

export interface DatosPlanilla {
  empresa: EmpresaPapel
  /** Si el pie lleva recuadro para la huella del pulgar. Se elige al imprimir. */
  conHuella: boolean
}

export async function armarPlanillaDeIngreso(
  d: DatosPlanilla,
): Promise<{ blob: Blob; nombre: string }> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen(400, false)
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  // ─────────────────────────────────────────────── hoja 1
  let y = tituloDocumento(
    doc,
    membrete(doc, logo, { empresa: d.empresa }),
    'Hoja de ingreso y registro de personal',
  )

  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(GRIS)
  doc.text(
    'Se llena a mano durante la entrevista. Escribe en letra de molde: esto se copia al sistema tal cual.',
    IZQ,
    y + 4,
  )
  y += 12

  // ── 1. Quién es ──────────────────────────────────────────────────────────
  y = seccion(doc, y, '1 · Quién es')

  hueco(doc, IZQ, y, ANCHO_COL, 'Cédula')
  hueco(doc, COL2, y, ANCHO_COL, 'RIF', '(si lo tiene)')
  y += ALTO_RENGLON

  hueco(doc, IZQ, y, ANCHO_COL, 'Nombres')
  hueco(doc, COL2, y, ANCHO_COL, 'Apellidos')
  y += ALTO_RENGLON

  hueco(doc, IZQ, y, ANCHO_COL, 'Fecha de nacimiento', '(día / mes / año)')
  hueco(doc, COL2, y, ANCHO_COL, 'Nacionalidad')
  y += ALTO_RENGLON

  y = opciones(doc, IZQ, y, 'Estado civil', [
    'Soltero/a',
    'Casado/a',
    'Concubinato',
    'Divorciado/a',
    'Viudo/a',
  ])

  y = opciones(doc, IZQ, y, 'Género', ['Masculino', 'Femenino'])

  /*
    El grupo sanguíneo va en el carnet y en una emergencia es lo primero que se
    busca. Se pregunta en la entrevista porque después nadie vuelve a preguntarlo.
  */
  y = opciones(doc, IZQ, y, 'Grupo sanguíneo', [
    'O+',
    'O-',
    'A+',
    'A-',
    'B+',
    'B-',
    'AB+',
    'AB-',
  ])

  hueco(doc, IZQ, y, ANCHO_COL, 'Teléfono')
  hueco(doc, COL2, y, ANCHO_COL, 'Correo electrónico', '(si tiene)')
  y += ALTO_RENGLON

  hueco(doc, IZQ, y, ANCHO_UTIL, 'Dirección de habitación')
  y += ALTO_RENGLON
  // Segunda raya sin rótulo: una dirección de esta zona no cabe en 150 mm.
  doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
  doc.line(IZQ, y + 1, DER, y + 1)
  y += 10

  // ── 2. Carga familiar ────────────────────────────────────────────────────
  y = seccion(doc, y, '2 · Carga familiar y dependientes')

  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
  doc.text(
    'Parentesco: cónyuge, concubino/a, hijo/a, padre, madre, hermano/a, abuelo/a, nieto/a u otro familiar.',
    IZQ,
    y,
  )
  y += 6

  y = tablaEnBlanco(
    doc,
    y,
    [
      ['Nombres y apellidos', 58],
      ['Parentesco', 30],
      ['Fecha de nacimiento', 32],
      ['Cédula', 20],
      ['¿Depende?', 10],
    ],
    5,
  )

  pieDePagina(doc, 'Hoja 1 de 2 · Hoja de ingreso y registro de personal')

  // ─────────────────────────────────────────────── hoja 2
  doc.addPage()
  y = tituloDocumento(
    doc,
    membrete(doc, logo, { empresa: d.empresa }),
    'Hoja de ingreso — continuación',
  )
  y += 6

  // ── 3. Salud ─────────────────────────────────────────────────────────────
  y = seccion(doc, y, '3 · Salud')

  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
  doc.text(
    'Alergias, condiciones crónicas, tratamientos o limitaciones que haya que tener en cuenta en el trabajo.',
    IZQ,
    y,
  )
  y += 6

  y = tablaEnBlanco(
    doc,
    y,
    [
      ['Qué es', 45],
      ['Detalle', 75],
      ['Desde cuándo', 30],
    ],
    3,
  )

  // ── 4. A quién avisar ────────────────────────────────────────────────────
  y = seccion(doc, y, '4 · A quién avisar en una emergencia')

  hueco(doc, IZQ, y, ANCHO_COL, 'Nombre y parentesco', '(ej.: Marta Arias, esposa)')
  hueco(doc, COL2, y, ANCHO_COL, 'Teléfono de esa persona')
  y += ALTO_RENGLON + 4

  // ── 5. El puesto ─────────────────────────────────────────────────────────
  y = seccion(doc, y, '5 · El puesto')

  hueco(doc, IZQ, y, ANCHO_COL, 'Cargo al que aspira')
  hueco(doc, COL2, y, ANCHO_COL, 'Departamento o frente')
  y += ALTO_RENGLON

  y = opciones(doc, IZQ, y, 'Jornada', ['Diurna — 8 h', 'Nocturna — 7 h', 'Mixta — 7,5 h'])

  hueco(doc, IZQ, y, ANCHO_UTIL, 'Desde cuándo puede empezar')
  y += ALTO_RENGLON + 4

  // ── 6. Cómo cobraría ─────────────────────────────────────────────────────
  // (la fecha va abajo, junto a las firmas)
  y = seccion(doc, y, '6 · Cómo cobraría')

  y = opciones(doc, IZQ, y, 'Forma de pago', [
    'Transferencia',
    'Pago móvil',
    'Efectivo',
    'Zelle',
    'Binance / USDT',
  ])

  hueco(doc, IZQ, y, ANCHO_COL, 'Banco')
  hueco(doc, COL2, y, ANCHO_COL, 'Número de cuenta')
  y += ALTO_RENGLON

  hueco(doc, IZQ, y, ANCHO_COL, 'Teléfono del pago móvil')
  hueco(doc, COL2, y, ANCHO_COL, 'Cédula del titular', '(si no es la suya)')
  y += ALTO_RENGLON + 4

  /*
    LA DECLARACIÓN SE ANCLA AL PIE, como las firmas, y no al final de lo de
    arriba.
    
    Calculado: con las seis secciones encima, el texto terminaba a 1,5 mm de la
    raya de firmar si se partía en tres renglones en vez de dos — y de cuántos
    renglones se parte depende del lector de PDF, no de nosotros. Anclado abajo,
    la distancia es la misma siempre y lo que se mueve es el hueco de arriba,
    que es hueco.
  */
  y = ABAJO - 48
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(TINTA)
  const declaracion = doc.splitTextToSize(
    'Declaro que los datos escritos aquí son ciertos y están al día, y autorizo a la empresa a ' +
      'comprobarlos si lo necesita. Me comprometo a avisar si alguno cambia.',
    ANCHO_UTIL,
  ) as string[]
  for (const linea of declaracion) {
    doc.text(linea, IZQ, y)
    y += 4.5
  }

  // La fecha, encima de las firmas. Un papel firmado sin fecha no dice cuándo
  // era cierto lo que dice, que en una planilla de datos es medio dato.
  y += 3
  hueco(doc, IZQ, y, 60, 'Lugar y fecha de la entrevista')

  // Las firmas se anclan al pie y no al final del texto: así caen a la misma
  // altura en cualquier impresión, que es donde la gente las busca.
  pieFirmado(doc, d.conHuella)

  pieDePagina(doc, 'Hoja 2 de 2 · Hoja de ingreso y registro de personal')

  return { blob: doc.output('blob'), nombre: 'planilla-de-ingreso.pdf' }
}
