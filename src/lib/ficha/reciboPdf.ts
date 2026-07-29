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

import { marcaComoImagen, MARCA_SOBRE_OSCURO } from './marca'
import { EMPRESA } from '@/lib/empresa'

const AZUL = '#1D358F'
const AZUL_CLARO = '#B9C6F5'
const TINTA = '#262C3D'
const GRIS = '#7B839A'
const HAIRLINE = '#E6E9F2'
const ROJO = '#C0392B'

const IZQ = 14
const DER = 196

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
}

export interface DatosRecibo {
  /** Del período, para que el papel diga qué se está pagando. */
  periodo: string
  desde: string
  hasta: string
  diasPagados: string

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

/** Recorta con puntos suspensivos lo que no cabe, en vez de dejarlo salirse. */
function ajustar(doc: Doc, texto: string, ancho: number): string {
  if (doc.getTextWidth(texto) <= ancho) return texto
  let corto = texto
  while (corto.length > 1 && doc.getTextWidth(`${corto}…`) > ancho) corto = corto.slice(0, -1)
  return `${corto.trimEnd()}…`
}

// --- Piezas ---------------------------------------------------------------

function encabezado(doc: Doc, d: DatosRecibo, y0: number): number {
  doc.setFillColor(AZUL)
  doc.rect(0, y0, 210, 26, 'F')

  doc.addImage(marcaComoImagen(MARCA_SOBRE_OSCURO), 'PNG', IZQ, y0 + 6, 11, 11)

  doc.setTextColor('#FFFFFF').setFont('helvetica', 'bold').setFontSize(11)
  doc.text(EMPRESA.razonSocial, IZQ + 14, y0 + 11)

  doc.setTextColor(AZUL_CLARO).setFont('helvetica', 'normal').setFontSize(7)
  doc.text(`RIF ${EMPRESA.rif} · ${EMPRESA.actividad.toUpperCase()}`, IZQ + 14, y0 + 16.5)

  doc.setTextColor('#FFFFFF').setFont('helvetica', 'bold').setFontSize(10)
  doc.text('RECIBO DE PAGO', DER, y0 + 11, { align: 'right' })

  doc.setTextColor(AZUL_CLARO).setFont('helvetica', 'normal').setFontSize(7)
  doc.text(`Período ${d.periodo}`, DER, y0 + 16.5, { align: 'right' })

  return y0 + 32
}

function trabajador(doc: Doc, d: DatosRecibo, y: number): number {
  doc.setTextColor(TINTA).setFont('helvetica', 'bold').setFontSize(12)
  doc.text(ajustar(doc, d.nombreCompleto, 120), IZQ, y)

  doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(7.5)
  doc.text(`C.I. ${d.cedula} · Ficha ${d.ficha} · ${d.cargo}`, IZQ, y + 5)

  // El período y los días, a la derecha: es lo que se comprueba primero cuando
  // alguien reclama que le pagaron de menos.
  doc.setTextColor(GRIS).setFontSize(7.5)
  doc.text(`Del ${dia(d.desde)} al ${dia(d.hasta)}`, DER, y - 1, { align: 'right' })
  doc.setTextColor(TINTA).setFont('helvetica', 'bold').setFontSize(9)
  doc.text(`${Number(d.diasPagados)} días pagados`, DER, y + 5, { align: 'right' })

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

  doc.setTextColor(AZUL).setFont('helvetica', 'bold').setFontSize(6.5)
  doc.text(TITULOS[tipo], IZQ, y)

  let fila = y + 4
  for (const l of lineas) {
    doc.setTextColor(TINTA).setFont('helvetica', 'normal').setFontSize(8)
    const etiqueta = l.cantidad ? `${l.descripcion}  (${Number(l.cantidad)})` : l.descripcion
    doc.text(ajustar(doc, etiqueta, 140), IZQ + 2, fila)
    doc.text(cifra(l.monto), DER, fila, { align: 'right' })
    fila += 4.4
  }

  // El subtotal solo donde significa algo. Los aportes y las provisiones no
  // suman ni restan al neto: darles un total invita a restarlos.
  if (tipo === 'ASIGNACION' || tipo === 'DEDUCCION') {
    doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
    doc.line(120, fila - 2.6, DER, fila - 2.6)
    doc.setTextColor(GRIS).setFont('helvetica', 'bold').setFontSize(7.5)
    doc.text(tipo === 'ASIGNACION' ? 'Total asignaciones' : 'Total deducciones', 120, fila + 1)
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

  doc.setTextColor(AZUL).setFontSize(13)
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
  doc.text(forma, IZQ, y + 18)

  return y + 22
}

function firmas(doc: Doc, d: DatosRecibo, y: number) {
  const ancho = (DER - IZQ - 24) / 2

  /*
    La declaración va encima de la firma del trabajador y no en el pie.
    Firmar debajo de una frase que dice qué se está aceptando es lo que
    convierte el papel en prueba; una nota al final se firma sin leerla.
  */
  doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(6.5)
  doc.text(
    'Recibí conforme la cantidad indicada y estoy de acuerdo con los conceptos detallados.',
    IZQ,
    y - 4,
  )

  /*
    La fecha de recibido, en blanco y en el mismo renglón de la declaración.

    Va aquí y no bajo la firma porque ahí chocaría con el pie, y porque bajarla
    obligaría a alargar cada copia lo justo para que dejaran de caber dos por
    hoja. Es distinta de la del pie: esa dice cuándo se imprimió el papel, y
    entre imprimirlo y entregarlo pueden pasar días. En un reclamo lo que se
    discute es cuándo lo recibió el trabajador.
  */
  doc.setDrawColor(GRIS).setLineWidth(0.3)
  doc.line(DER - 34, y - 3.5, DER, y - 3.5)
  doc.text('Fecha de recibido:', DER - 36, y - 4, { align: 'right' })

  doc.setDrawColor(TINTA).setLineWidth(0.4)
  doc.line(IZQ, y + 8, IZQ + ancho, y + 8)
  doc.line(IZQ + ancho + 24, y + 8, DER, y + 8)

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
  rotulo(IZQ + ancho + 24, empresa, d.firma.nombre ? 1 : 0)
}

function pie(doc: Doc, d: DatosRecibo, y: number) {
  const hoy = new Date().toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(6.5)
  doc.text(`Emitido el ${hoy} por ${d.emitidoPor}`, IZQ, y)
  doc.text(`${EMPRESA.razonSocial} · RIF ${EMPRESA.rif}`, DER, y, { align: 'right' })
}

/** Una copia completa, empezando en `y0`. Devuelve dónde terminó. */
function copia(doc: Doc, d: DatosRecibo, y0: number, rotulo: string): number {
  let y = encabezado(doc, d, y0)

  // Dentro de la banda, bajo el período. Fuera de ella caía justo encima de
  // las fechas del período, que van pegadas al margen derecho.
  doc.setTextColor(AZUL_CLARO).setFont('helvetica', 'bold').setFontSize(6)
  doc.text(rotulo.toUpperCase(), DER, y0 + 21.5, { align: 'right' })

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
 * Van en la misma hoja cuando caben, con línea de corte. Cuando el recibo trae
 * muchos conceptos —horas extra, varias novedades, retenciones— no caben, y
 * entonces la segunda va en su propia hoja. Lo que no puede pasar es que
 * desaparezca: si el número de copias dependiera del largo del recibo, unos
 * trabajadores se quedarían sin su papel y nadie lo notaría hasta el reclamo.
 */
function hoja(doc: Doc, d: DatosRecibo) {
  const ALTO_A4 = 297
  const fin = copia(doc, d, 0, 'Original — para la empresa')

  if (fin * 2 + 8 <= ALTO_A4) {
    const corte = fin + 4
    doc.setDrawColor(ROJO).setLineWidth(0.2).setLineDashPattern([1.5, 1.5], 0)
    doc.line(IZQ - 8, corte, DER + 8, corte)
    doc.setLineDashPattern([], 0)

    doc.setTextColor(ROJO).setFont('helvetica', 'normal').setFontSize(5.5)
    doc.text('corte aquí', IZQ - 8, corte - 1.5)

    copia(doc, d, corte + 4, 'Copia — para el trabajador')
  } else {
    doc.addPage()
    copia(doc, d, 0, 'Copia — para el trabajador')
  }
}

export async function descargarRecibo(d: DatosRecibo): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  hoja(doc, d)

  doc.setProperties({
    title: `Recibo ${d.periodo} — ${d.nombreCompleto}`,
    subject: 'Recibo de pago',
    author: EMPRESA.razonSocial,
  })

  const apellido = d.nombreCompleto.split(' ').pop()?.toLowerCase() ?? ''
  doc.save(`recibo-${d.periodo}-${d.ficha}-${apellido}.pdf`)
}

/** Todos los del período, uno por hoja, para repartir de una sentada. */
export async function descargarRecibos(recibos: DatosRecibo[], periodo: string): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  for (const [i, d] of recibos.entries()) {
    if (i > 0) doc.addPage()
    hoja(doc, d)
  }

  doc.setProperties({
    title: `Recibos de pago — período ${periodo}`,
    subject: 'Recibos de pago',
    author: EMPRESA.razonSocial,
  })

  doc.save(`recibos-${periodo}.pdf`)
}
