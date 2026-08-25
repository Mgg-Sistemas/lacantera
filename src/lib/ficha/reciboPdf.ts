/**
 * El recibo de pago, en papel.
 *
 * No es un resumen bonito de lo que ya se ve en pantalla: es la prueba de que
 * se pagó. Sin recibo firmado, en un reclamo laboral se presume cierto lo que
 * alegue el trabajador, así que el papel tiene que decir tres cosas sin lugar a
 * duda — cuánto se ganó, qué se descontó y por qué, y quién recibió qué.
 *
 * De ahí las decisiones de este archivo:
 *
 * - Cada concepto va con su renglón, no agregado. "Deducciones: 1.240" no
 *   sirve de prueba de nada; "IVSS 4% sobre 5 salarios: 620" sí.
 * - Los aportes del patrono y las provisiones salen aparte y rotulados, porque
 *   no se le descuentan a nadie. Mezclados con las deducciones convierten un
 *   recibo correcto en una discusión.
 * - Las dos firmas van al pie, en blanco. Se firman a mano al imprimir: una
 *   firma dibujada por el sistema no prueba que la persona estuvo delante.
 * - Dos copias por hoja, con línea de corte. Una se la lleva el trabajador y la
 *   otra se archiva firmada, que es la que vale.
 *
 * La tipografía es Helvetica por lo mismo que en la ficha: la trae cualquier
 * lector de PDF y no engorda el archivo.
 */

import { logoComoImagen } from './logo'
import { ABAJO, ajustar, ANCHO_UTIL, ARRIBA, DER, IZQ } from './hoja'
import type { ArchivoArmado } from './armado'
import { EMPRESA } from '@/lib/empresa'

// El primario de la marca. Antes era el azul de «La Cantera».
const MARCA = '#cc3f00'
const AZUL_CLARO = '#B9C6F5'
const TINTA = '#262C3D'
const GRIS = '#7B839A'
const HAIRLINE = '#E6E9F2'
const ROJO = '#C0392B'

/** Donde arranca la columna de subtotales: el último tercio del ancho útil. */
const COL_TOTAL = IZQ + ANCHO_UTIL * 0.62

type Doc = import('jspdf').jsPDF

export interface LineaImpresa {
  descripcion: string
  cantidad: string | null
  monto: string
  tipo: 'ASIGNACION' | 'DEDUCCION' | 'APORTE' | 'PROVISION'
  orden: number
}

export interface FirmaEmpresa {
  nombre: string
  cargo: string
  cedula: string
  /** Su firma guardada, si la tiene y la tiene encendida. */
  imagen?: string | null
}

export interface DatosRecibo {
  /** Del período, para que el papel diga qué se está pagando. */
  periodo: string
  desde: string
  hasta: string
  diasPagados: string
  /** Lo que paga el periodo. Nulo en los recibos anteriores a que se guardara. */
  diasFacturados?: string | null
  /** Facturados menos TODAS las faltas: lo que de verdad estuvo. */
  diasLaborados?: string | null

  ficha: string
  cedula: string
  nombreCompleto: string
  cargo: string

  salarioBasicoDiario: string
  salarioNormalDiario: string
  salarioIntegralDiario: string

  lineas: LineaImpresa[]
  totalAsignaciones: string
  totalDeducciones: string
  neto: string
  netoUsd: string

  formaPago: string
  banco: string | null
  numeroCuenta: string | null

  firma: FirmaEmpresa
  emitidoPor: string

  /*
    La firma del trabajador, si la guardó.

    Sin ella el recibo sale como siempre, con la raya en blanco para firmar a
    mano — que sigue siendo el caso de casi todos y no puede parecer un fallo.
  */
  firmaTrabajador?: string | null
}

// --- Formato --------------------------------------------------------------
// El PDF no hereda los formateadores de la interfaz: allí `bolivares()` mete
// el símbolo y aquí la columna ya lleva su encabezado. Repetirlo en cada
// renglón roba ancho y ensucia la lectura de una columna de cifras.

const cifra = (v: string | number) =>
  new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number(v),
  )

const dia = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

// --- Piezas ---------------------------------------------------------------

function encabezado(doc: Doc, d: DatosRecibo, y0: number, logo: string): number {
  doc.setFillColor(MARCA)
  // Dentro del margen y no a sangre: una banda que llega al borde de la hoja
  // convierte los tres centímetros en cero por tres de los cuatro lados.
  doc.rect(IZQ, y0, ANCHO_UTIL, 26, 'F')

  doc.addImage(logo, 'PNG', IZQ + 4, y0 + 6, 11, 11)

  // Con 150 mm de ancho, la razón social entera y el rótulo del documento ya no
  // caben en la misma línea sin tocarse. La marca baja de cuerpo lo justo y se
  // recorta si hiciera falta: mejor eso que dos textos encabalgados.
  doc.setTextColor('#FFFFFF').setFont('helvetica', 'bold').setFontSize(9.5)
  doc.text(ajustar(doc, EMPRESA.razonSocial, 78), IZQ + 18, y0 + 11)

  doc.setTextColor(AZUL_CLARO).setFont('helvetica', 'normal').setFontSize(6.5)
  doc.text(`RIF ${EMPRESA.rif}`, IZQ + 18, y0 + 16.5)

  doc.setTextColor('#FFFFFF').setFont('helvetica', 'bold').setFontSize(9)
  doc.text('RECIBO DE PAGO', DER - 4, y0 + 11, { align: 'right' })

  doc.setTextColor(AZUL_CLARO).setFont('helvetica', 'normal').setFontSize(6.5)
  doc.text(`Período ${d.periodo}`, DER - 4, y0 + 16.5, { align: 'right' })

  return y0 + 32
}

function trabajador(doc: Doc, d: DatosRecibo, y: number): number {
  doc.setTextColor(TINTA).setFont('helvetica', 'bold').setFontSize(12)
  doc.text(ajustar(doc, d.nombreCompleto, ANCHO_UTIL * 0.58), IZQ, y)

  doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(7.5)
  doc.text(
    ajustar(doc, `C.I. ${d.cedula} · Ficha ${d.ficha} · ${d.cargo}`, ANCHO_UTIL * 0.62),
    IZQ,
    y + 5,
  )

  // El período y los días, a la derecha: es lo que se comprueba primero cuando
  // alguien reclama que le pagaron de menos.
  doc.setTextColor(GRIS).setFontSize(7.5)
  doc.text(`Del ${dia(d.desde)} al ${dia(d.hasta)}`, DER, y - 1, { align: 'right' })
  /*
    LOS TRES NUMEROS, QUE ES LO QUE PIDIO LA LIDER

    «QUE SE REFLEJE EN EL RECIBO DE PAGO DIAS FACTURADOS, DIAS LABORADOS, DIAS A
    PAGAR». Van los tres juntos y en ese orden porque asi se lee la resta: de
    quince que paga la quincena, trabajo trece, y se le pagan catorce porque una
    de las dos faltas estaba justificada.

    Con un solo numero —«14 dias pagados»— quien lo recibia no podia saber si le
    habian descontado, ni cuanto, ni por que. Que es exactamente lo que se
    discute cuando se discute un recibo.

    Los recibos calculados antes de esto no traen los otros dos: entonces sale
    la linea de siempre, que no es un fallo sino un recibo mas viejo.
  */
  doc.setTextColor(TINTA).setFont('helvetica', 'bold').setFontSize(9)

  if (d.diasFacturados != null && d.diasLaborados != null) {
    doc.text(
      `${Number(d.diasFacturados)} facturados · ${Number(d.diasLaborados)} laborados · ${Number(d.diasPagados)} a pagar`,
      DER,
      y + 5,
      { align: 'right' },
    )
  } else {
    doc.text(`${Number(d.diasPagados)} días pagados`, DER, y + 5, { align: 'right' })
  }

  return y + 11
}

function salarios(doc: Doc, d: DatosRecibo, y: number): number {
  doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
  doc.line(IZQ, y, DER, y)

  const campos: [string, string][] = [
    ['Salario básico diario', cifra(d.salarioBasicoDiario)],
    ['Salario normal diario', cifra(d.salarioNormalDiario)],
    ['Salario integral diario', cifra(d.salarioIntegralDiario)],
  ]

  const ancho = (DER - IZQ) / 3
  for (const [i, [clave, valor]] of campos.entries()) {
    const x = IZQ + i * ancho
    doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(6.5)
    doc.text(clave.toUpperCase(), x, y + 4.5)
    doc.setTextColor(TINTA).setFont('helvetica', 'bold').setFontSize(8.5)
    doc.text(`Bs ${valor}`, x, y + 9)
  }

  doc.line(IZQ, y + 12, DER, y + 12)
  return y + 17
}

const TITULOS = {
  ASIGNACION: 'LO QUE SE GANA',
  DEDUCCION: 'LO QUE SE DESCUENTA',
  APORTE: 'APORTES DEL PATRONO — NO SE LE DESCUENTAN',
  PROVISION: 'SE APARTA A SU FAVOR — NO SALE DE SU PAGO',
} as const

function bloque(doc: Doc, d: DatosRecibo, tipo: LineaImpresa['tipo'], y: number): number {
  const lineas = d.lineas.filter((l) => l.tipo === tipo).sort((a, b) => a.orden - b.orden)
  if (lineas.length === 0) return y

  doc.setTextColor(MARCA).setFont('helvetica', 'bold').setFontSize(6.5)
  doc.text(TITULOS[tipo], IZQ, y)

  let fila = y + 4
  for (const l of lineas) {
    doc.setTextColor(TINTA).setFont('helvetica', 'normal').setFontSize(8)
    const etiqueta = l.cantidad ? `${l.descripcion}  (${Number(l.cantidad)})` : l.descripcion
    // Hasta donde empieza la columna de cifras, menos un respiro. Antes era un
    // 140 fijo que con el ancho nuevo dejaba la descripción encima del monto.
    doc.text(ajustar(doc, etiqueta, COL_TOTAL - IZQ - 6), IZQ + 2, fila)
    doc.text(cifra(l.monto), DER, fila, { align: 'right' })
    fila += 4.4
  }

  // El subtotal solo donde significa algo. Los aportes y las provisiones no
  // suman ni restan al neto: darles un total invita a restarlos.
  if (tipo === 'ASIGNACION' || tipo === 'DEDUCCION') {
    doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
    doc.line(COL_TOTAL, fila - 2.6, DER, fila - 2.6)
    doc.setTextColor(GRIS).setFont('helvetica', 'bold').setFontSize(7.5)
    doc.text(
      tipo === 'ASIGNACION' ? 'Total asignaciones' : 'Total deducciones',
      COL_TOTAL,
      fila + 1,
    )
    doc.setTextColor(TINTA).setFontSize(8.5)
    doc.text(
      cifra(tipo === 'ASIGNACION' ? d.totalAsignaciones : d.totalDeducciones),
      DER,
      fila + 1,
      { align: 'right' },
    )
    fila += 5
  }

  return fila + 3
}

function neto(doc: Doc, d: DatosRecibo, y: number): number {
  doc.setFillColor('#F2F5FD')
  doc.rect(IZQ, y, DER - IZQ, 13, 'F')

  doc.setTextColor(TINTA).setFont('helvetica', 'bold').setFontSize(9)
  doc.text('NETO A COBRAR', IZQ + 4, y + 8)

  doc.setTextColor(MARCA).setFontSize(13)
  doc.text(`Bs ${cifra(d.neto)}`, DER - 4, y + 8.5, { align: 'right' })

  // La referencia en dólares no es lo que se paga: es lo que valía ese día.
  // Sin el rótulo, un recibo viejo parece una deuda en divisas.
  if (Number(d.netoUsd) > 0) {
    doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(6.5)
    doc.text(`referencia: $ ${cifra(d.netoUsd)}`, DER - 4, y + 12, { align: 'right' })
  }

  /*
    En presente y no en pasado. El recibo se imprime a menudo antes de que el
    dinero salga del banco, y un papel que afirma "pagado" cuando todavía no lo
    está es exactamente lo que no se quiere firmar.
  */
  const forma =
    d.formaPago === 'TRANSFERENCIA' && d.banco
      ? `Se paga por transferencia a ${d.banco}${d.numeroCuenta ? ` · ${d.numeroCuenta}` : ''}`
      : `Forma de pago: ${d.formaPago.toLowerCase()}`

  doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(7)
  doc.text(ajustar(doc, forma, ANCHO_UTIL), IZQ, y + 18)

  return y + 22
}

function firmas(doc: Doc, d: DatosRecibo, y: number) {
  // 16 mm de separación en vez de 24: con 150 mm de ancho, dos columnas de 63
  // dejaban los nombres largos recortados en mitad del apellido.
  const SEPARA = 16
  const ancho = (DER - IZQ - SEPARA) / 2

  /*
    La declaración va encima de la firma del trabajador y no en el pie.
    Firmar debajo de una frase que dice qué se está aceptando es lo que
    convierte el papel en prueba; una nota al final se firma sin leerla.
  */
  doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(6.5)
  doc.text('Recibí conforme la cantidad indicada y estoy de acuerdo con', IZQ, y - 8)
  doc.text('los conceptos detallados.', IZQ, y - 5)

  /*
    La fecha de recibido, en blanco y en el mismo renglón de la declaración.

    Va aquí y no bajo la firma porque ahí chocaría con el pie, y porque bajarla
    obligaría a alargar cada copia lo justo para que dejaran de caber dos por
    hoja. Es distinta de la del pie: esa dice cuándo se imprimió el papel, y
    entre imprimirlo y entregarlo pueden pasar días. En un reclamo lo que se
    discute es cuándo lo recibió el trabajador.
  */
  doc.setDrawColor(GRIS).setLineWidth(0.3)
  doc.line(DER - 26, y - 3.5, DER, y - 3.5)
  doc.text('Fecha de recibido:', DER - 28, y - 4, { align: 'right' })

  /*
    Las firmas guardadas van SOBRE la raya, no encima del hueco.

    Alto fijo y ancho por proporción, con tope al de la columna: la imagen ya
    viene recortada al trazo, y una rúbrica alargada invadiría la de al lado.
    El recibo lleva dos copias por hoja, así que 10 mm es lo que cabe sin
    empujar la segunda fuera de la página.
  */
  const estampar = (imagen: string | null | undefined, x: number) => {
    if (!imagen) return
    const ALTO = 10
    try {
      const props = doc.getImageProperties(imagen)
      const anchoFirma = Math.min(ancho - 4, (props.width / props.height) * ALTO)
      doc.addImage(imagen, 'PNG', x + (ancho - anchoFirma) / 2, y + 8 - ALTO - 0.5, anchoFirma, ALTO)
    } catch {
      // Una imagen que jsPDF no sabe leer no puede tumbar la nómina entera: el
      // recibo sale con la raya en blanco, que es firmable.
    }
  }

  estampar(d.firmaTrabajador, IZQ)
  estampar(d.firma.imagen, IZQ + ancho + SEPARA)

  doc.setDrawColor(TINTA).setLineWidth(0.4)
  doc.line(IZQ, y + 8, IZQ + ancho, y + 8)
  doc.line(IZQ + ancho + SEPARA, y + 8, DER, y + 8)

  const rotulo = (x: number, lineas: string[], negrita = 0) => {
    let fila = y + 12
    for (const [i, texto] of lineas.entries()) {
      doc.setFont('helvetica', i < negrita ? 'bold' : 'normal').setFontSize(i < negrita ? 8 : 6.5)
      doc.setTextColor(i < negrita ? TINTA : GRIS)
      doc.text(ajustar(doc, texto, ancho), x + ancho / 2, fila, { align: 'center' })
      fila += i < negrita ? 4 : 3.4
    }
  }

  rotulo(IZQ, [d.nombreCompleto, `C.I. ${d.cedula}`, 'Firma del trabajador'], 1)

  // Solo se imprime lo que Recursos Humanos llenó. Un renglón en blanco se
  // completa a mano; un nombre inventado por el sistema no se detecta.
  const empresa = d.firma.nombre
    ? [d.firma.nombre, d.firma.cargo, d.firma.cedula ? `C.I. ${d.firma.cedula}` : ''].filter(
        Boolean,
      )
    : [d.firma.cargo || 'Por la empresa']
  rotulo(IZQ + ancho + SEPARA, empresa, d.firma.nombre ? 1 : 0)
}

function pie(doc: Doc, d: DatosRecibo, y: number) {
  const hoy = new Date().toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(6.5)
  doc.text(ajustar(doc, `Emitido el ${hoy} por ${d.emitidoPor}`, ANCHO_UTIL * 0.45), IZQ, y)
  doc.text(`RIF ${EMPRESA.rif}`, DER, y, { align: 'right' })
}

/** Una copia completa, empezando en `y0`. Devuelve dónde terminó. */
function copia(doc: Doc, d: DatosRecibo, y0: number, rotulo: string, logo: string): number {
  let y = encabezado(doc, d, y0, logo)

  // Dentro de la banda, bajo el período. Fuera de ella caía justo encima de
  // las fechas del período, que van pegadas al margen derecho.
  doc.setTextColor(AZUL_CLARO).setFont('helvetica', 'bold').setFontSize(6)
  doc.text(rotulo.toUpperCase(), DER - 4, y0 + 21.5, { align: 'right' })

  y = trabajador(doc, d, y)
  y = salarios(doc, d, y)
  for (const tipo of ['ASIGNACION', 'DEDUCCION', 'APORTE', 'PROVISION'] as const) {
    y = bloque(doc, d, tipo, y)
  }
  y = neto(doc, d, y)
  firmas(doc, d, y + 8)
  pie(doc, d, y + 34)

  return y + 38
}

/**
 * Siempre dos copias: una se la lleva el trabajador, la otra se archiva firmada.
 *
 * Van en la misma hoja cuando caben, con línea de corte; si no, la segunda va
 * en su propia hoja. Lo que no puede pasar es que desaparezca: si el número de
 * copias dependiera del largo del recibo, unos trabajadores se quedarían sin su
 * papel y nadie lo notaría hasta el reclamo.
 *
 * Con el margen de 3 cm el reparto cambió de hecho. Antes cabían dos copias
 * cuando el recibo era corto; ahora el alto útil son 237 mm y una copia ronda
 * los 145, así que casi siempre son dos hojas. La regla no se toca —sigue
 * midiendo y decidiendo— pero el resultado habitual es otro, y se imprime el
 * doble de papel. Es el precio del margen, no un fallo.
 */
function hoja(doc: Doc, d: DatosRecibo, logo: string) {
  const fin = copia(doc, d, ARRIBA, 'Original — para la empresa', logo)

  // Lo que ocupó la primera, más el corte, más otra igual: ¿cabe antes del
  // margen de abajo?
  const corte = fin + 4
  const cabe = corte + 4 + (fin - ARRIBA) <= ABAJO

  if (cabe) {
    doc.setDrawColor(ROJO).setLineWidth(0.2).setLineDashPattern([1.5, 1.5], 0)
    doc.line(IZQ, corte, DER, corte)
    doc.setLineDashPattern([], 0)

    doc.setTextColor(ROJO).setFont('helvetica', 'normal').setFontSize(5.5)
    doc.text('corte aquí', IZQ, corte - 1.5)

    copia(doc, d, corte + 4, 'Copia — para el trabajador', logo)
  } else {
    doc.addPage()
    copia(doc, d, ARRIBA, 'Copia — para el trabajador', logo)
  }
}

/**
 * El PDF armado, sin guardarlo.
 *
 * Es el mismo `ArchivoArmado` que devuelven el carnet y la ficha: un blob y el
 * nombre con el que debe guardarse. Se conserva el nombre viejo porque media
 * docena de pantallas lo llaman así y renombrarlo no arreglaría nada.
 */
export type PdfArmado = ArchivoArmado

export async function armarRecibo(d: DatosRecibo): Promise<PdfArmado> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  const logo = await logoComoImagen()
  hoja(doc, d, logo)

  doc.setProperties({
    title: `Recibo ${d.periodo} — ${d.nombreCompleto}`,
    subject: 'Recibo de pago',
    author: EMPRESA.razonSocial,
  })

  const apellido = d.nombreCompleto.split(' ').pop()?.toLowerCase() ?? ''
  return {
    blob: doc.output('blob'),
    nombre: `recibo-${d.periodo}-${d.ficha}-${apellido}.pdf`,
  }
}

/** Todos los del período, uno por hoja, para repartir de una sentada. */
export async function armarRecibos(
  recibos: DatosRecibo[],
  periodo: string,
): Promise<PdfArmado> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  // Una sola carga para todo el lote: cincuenta recibos seguidos no pueden
  // convertir el PNG cincuenta veces.
  const logo = await logoComoImagen()

  for (const [i, d] of recibos.entries()) {
    if (i > 0) doc.addPage()
    hoja(doc, d, logo)
  }

  doc.setProperties({
    title: `Recibos de pago — período ${periodo}`,
    subject: 'Recibos de pago',
    author: EMPRESA.razonSocial,
  })

  return { blob: doc.output('blob'), nombre: `recibos-${periodo}.pdf` }
}
