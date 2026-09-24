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
 * Por eso donde el sistema ofrece una lista cerrada —estado civil, jornada— el
 * papel ofrece las MISMAS opciones con su casilla, y no una raya. Una raya
 * invita a escribir «unión libre», y luego en pantalla hay que elegir entre
 * cinco que no lo dicen así.
 *
 * LA EXCEPCIÓN, Y HAY QUE DECIRLA: el tipo de cuenta —corriente o ahorro— lo
 * pidió el usuario y HOY EL SISTEMA NO LO GUARDA. Es el único hueco de este
 * papel sin sitio donde transcribirse, y está anotado como pendiente. Se pone
 * igual porque el dato hace falta al pagar; lo que no se puede es olvidar que
 * la ficha todavía no tiene dónde meterlo.
 *
 * LO QUE NO SE PREGUNTA, Y POR QUÉ
 *
 *   · El sueldo y la fecha de ingreso salen del tabulador y de la decisión de
 *     contratar. Ponerlos aquí invitaría a prometerlos en la mesa.
 *   · La forma de pago la decide nómina después, según lo que la empresa use
 *     con cada quien. Preguntarla es dejar que se elija donde no se elige. Los
 *     DATOS bancarios sí se piden, para tenerlos el día que haya que pagar.
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

/** Lo que mide un renglón para escribir a mano. Menos no admite una letra normal. */
const ALTO_RENGLON = 11
const SEPARA_COL = 8
const ANCHO_COL = (ANCHO_UTIL - SEPARA_COL) / 2
const COL2 = IZQ + ANCHO_COL + SEPARA_COL

/** La raya de firmar. Todo el pie se mide desde aquí. */
const RAYA_FIRMA = ABAJO - 27

/**
 * Dónde empieza el bloque del pie, contando el recuadro de la huella.
 *
 * Es el techo que la declaración tiene que respetar, así que vive fuera de las
 * dos funciones que lo miran: un número compartido no se desincroniza.
 */
const ARRANQUE_DEL_PIE = RAYA_FIRMA - 12

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
    doc.setFontSize(6.5).setTextColor('#b5b0ab')
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

/** Una línea de ayuda debajo del título de una sección. */
function pistaDeSeccion(doc: Doc, y: number, texto: string): number {
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
  doc.text(texto, IZQ, y)
  return y + 6
}

/**
 * Una tabla con las filas vacías, para escribir dentro.
 *
 * Las columnas se dan con su ancho en milímetros y tienen que sumar el ancho
 * útil: repartirlo aquí sería adivinar cuánto ocupa «fecha de nacimiento»
 * escrito a mano, y quien arma la tabla sí lo sabe.
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

  for (let f = 0; f <= filas; f++) doc.line(IZQ, arriba + f * ALTO_FILA, DER, arriba + f * ALTO_FILA)

  x = IZQ
  for (const [, ancho] of columnas) {
    doc.line(x, arriba, x, arriba + filas * ALTO_FILA)
    x += ancho
  }
  doc.line(DER, arriba, DER, arriba + filas * ALTO_FILA)

  return arriba + filas * ALTO_FILA + 8
}

/*
  EL PIE FIRMADO: EXACTAMENTE DOS FIRMAS.

  Firma quien da los datos y firma quien los tomó. Una planilla con una sola
  firma no dice quién estuvo delante, y a los tres meses eso es justo lo que se
  pregunta. Y no hay una tercera.

  EL NOMBRE VA DE LEYENDA, NO EN SU PROPIA RAYA. Llevaba una segunda raya debajo
  para el nombre y la cédula, y el pie pasaba a leerse como CUATRO campos de
  firma. Lo dijo el usuario mirándolo. Ahora es texto pequeño bajo la única
  raya: dice qué escribir sin parecer otro sitio donde firmar.

  LA HUELLA ES OPCIONAL Y SE DECIDE ANTES DE IMPRIMIR. Hay quien no firma igual
  dos veces, y para esos casos la huella del pulgar vale más que la rúbrica.
  Pero no siempre hace falta, y un recuadro vacío en todas las planillas invita
  a dejarlo vacío — y un campo que se deja vacío siempre acaba enseñando que el
  papel no se llena entero.
*/
function pieFirmado(doc: Doc, conHuella: boolean): void {
  const anchoHuella = 26
  const desdeX = conHuella ? IZQ + anchoHuella + 8 : IZQ
  const SEPARA = 16
  const ancho = (DER - desdeX - SEPARA) / 2

  doc.setDrawColor('#9c9690').setLineWidth(0.3)

  if (conHuella) {
    doc.rect(IZQ, ARRANQUE_DEL_PIE, anchoHuella, 24)
    // El rótulo va DENTRO del recuadro: encima se comía la línea que necesita
    // la declaración, y dentro no estorba a la huella, que se estampa al medio.
    doc.setFont('helvetica', 'normal').setFontSize(6).setTextColor(GRIS)
    doc.text('HUELLA', IZQ + anchoHuella / 2, ARRANQUE_DEL_PIE + 4, { align: 'center' })
    doc.text('Pulgar derecho', IZQ + anchoHuella / 2, ARRANQUE_DEL_PIE + 28, { align: 'center' })
  }

  for (const [i, texto] of ['Firma del aspirante', 'Firma de quien entrevista'].entries()) {
    const x = desdeX + i * (ancho + SEPARA)

    doc.line(x, RAYA_FIRMA, x + ancho, RAYA_FIRMA)

    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
    doc.text(texto, x + ancho / 2, RAYA_FIRMA + 4, { align: 'center' })

    doc.setFontSize(6.5).setTextColor('#b5b0ab')
    doc.text('nombre en letra de molde y cédula', x + ancho / 2, RAYA_FIRMA + 8, {
      align: 'center',
    })
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

  // ═════════════════════════════════════════════════════════════════ hoja 1
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

  // ── 1 · Quién es ─────────────────────────────────────────────────────────
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

  // El grupo sanguíneo va en el carnet y en una emergencia es lo primero que se
  // busca. Se pregunta aquí porque después nadie vuelve a preguntarlo.
  y = opciones(doc, IZQ, y, 'Grupo sanguíneo', ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'])

  hueco(doc, IZQ, y, ANCHO_COL, 'Teléfono')
  hueco(doc, COL2, y, ANCHO_COL, 'Correo electrónico', '(si tiene)')
  y += ALTO_RENGLON

  hueco(doc, IZQ, y, ANCHO_UTIL, 'Dirección de habitación')
  y += ALTO_RENGLON
  // Segunda raya sin rótulo: una dirección de esta zona no cabe en 150 mm.
  doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
  doc.line(IZQ, y + 1, DER, y + 1)
  y += 10

  // ── 2 · Carga familiar ───────────────────────────────────────────────────
  y = seccion(doc, y, '2 · Carga familiar y dependientes')
  y = pistaDeSeccion(
    doc,
    y,
    'Parentesco: cónyuge, concubino/a, hijo/a, padre, madre, hermano/a, abuelo/a, nieto/a u otro familiar.',
  )

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

  // ═════════════════════════════════════════════════════════════════ hoja 2
  doc.addPage()
  y =
    tituloDocumento(
      doc,
      membrete(doc, logo, { empresa: d.empresa }),
      'Hoja de ingreso — continuación',
    ) + 6

  // ── 3 · Salud ────────────────────────────────────────────────────────────
  y = seccion(doc, y, '3 · Salud')

  /*
    La explicación va en la cabecera de la primera columna y no en un renglón
    aparte. Un renglón de ayuda cuesta seis milímetros, y en esta hoja los seis
    milímetros son la diferencia entre que la declaración quepa encima de las
    firmas o se le monte. Dos filas por lo mismo: lo normal es ninguna o una, y
    lo que no quepa se sigue en la nota del sistema al transcribir.
  */
  y = tablaEnBlanco(
    doc,
    y,
    [
      ['Qué es (alergia, condición, tratamiento)', 80],
      ['Detalle', 40],
      ['Desde cuándo', 30],
    ],
    2,
  )

  // ── 4 · A quién avisar ───────────────────────────────────────────────────
  y = seccion(doc, y, '4 · A quién avisar en una emergencia')
  hueco(doc, IZQ, y, ANCHO_COL, 'Nombre y parentesco', '(ej.: Marta Arias, esposa)')
  hueco(doc, COL2, y, ANCHO_COL, 'Teléfono de esa persona')
  y += ALTO_RENGLON + 2

  // ── 5 · El puesto ────────────────────────────────────────────────────────
  y = seccion(doc, y, '5 · El puesto')

  hueco(doc, IZQ, y, ANCHO_COL, 'Cargo al que aspira')
  hueco(doc, COL2, y, ANCHO_COL, 'Departamento o frente')
  y += ALTO_RENGLON

  y = opciones(doc, IZQ, y, 'Jornada', ['Diurna — 8 h', 'Nocturna — 7 h', 'Mixta — 7,5 h'])

  hueco(doc, IZQ, y, ANCHO_COL, 'Desde cuándo puede empezar')
  hueco(doc, COL2, y, ANCHO_COL, 'Lugar y fecha de la entrevista')
  y += ALTO_RENGLON + 2

  // ── 6 · Dónde cobraría ───────────────────────────────────────────────────
  y = seccion(doc, y, '6 · Dónde cobraría')

  hueco(doc, IZQ, y, ANCHO_COL, 'Banco')
  hueco(doc, COL2, y, ANCHO_COL, 'Número de cuenta')
  y += ALTO_RENGLON

  /*
    EL TIPO DE CUENTA NO TIENE DÓNDE GUARDARSE TODAVÍA.

    Lo pidió el usuario y hace falta: transferir a una cuenta de ahorro cuando
    es corriente lo rebota el banco. Pero `empleados` no tiene la columna, así
    que hoy este es el único hueco del papel que no se puede transcribir. Queda
    anotado como pendiente; el papel va por delante a propósito, que fue lo que
    se pidió.
  */
  const finTipo = opciones(doc, IZQ, y, 'Tipo de cuenta', ['Corriente', 'Ahorro'])
  hueco(doc, COL2, y, ANCHO_COL, 'Cédula del titular', '(si no es la suya)')
  y = finTipo

  hueco(doc, IZQ, y, ANCHO_COL, 'Teléfono del pago móvil')

  /*
    LA DECLARACIÓN SE APOYA SOBRE EL PIE, y su sitio se calcula hacia arriba.

    Estuvo anclada a una altura fija y se montó encima del último bloque: se vio
    en el PDF antes de que nadie lo probara. El fallo no era la altura elegida
    sino elegir una — cualquier número fijo choca con lo de arriba el día que
    una sección crece, o con las firmas el día que el texto se parte en un
    renglón más, y de eso decide el lector de PDF y no nosotros.

    Así que se mide el texto, se mira dónde empieza el pie y se resta. Lo que
    queda flojo es el hueco del medio, que es hueco.
  */
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(TINTA)
  const declaracion = doc.splitTextToSize(
    'Declaro que los datos escritos aquí son ciertos, y autorizo a la empresa a comprobarlos si lo necesita.',
    ANCHO_UTIL,
  ) as string[]

  let yDeclaracion = ARRANQUE_DEL_PIE - 6 - declaracion.length * 4.5
  for (const linea of declaracion) {
    doc.text(linea, IZQ, yDeclaracion)
    yDeclaracion += 4.5
  }

  pieFirmado(doc, d.conHuella)
  pieDePagina(doc, 'Hoja 2 de 2 · Hoja de ingreso y registro de personal')

  return { blob: doc.output('blob'), nombre: 'planilla-de-ingreso.pdf' }
}
