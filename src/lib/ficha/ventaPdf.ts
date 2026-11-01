/**
 * Los papeles con los que la empresa trata con alguien de fuera.
 *
 * Son tres —cotización, nota de entrega y factura— y se arman con el mismo
 * modelo Ejecutivo Cantera a propósito: quien recibe una cotización, después
 * una nota y al final una factura reconoce de inmediato la identidad visual de
 * la empresa.
 *
 * Lo que cambia entre ellos:
 *
 *   - EL RÓTULO Y EL COLOR. La factura va en el rojo ladrillo de la casa
 *     (`MARCA`), la nota de entrega en naranja de seguridad —es un papel de
 *     patio, se distingue de lejos en un fajo— y la cotización en marrón
 *     rótulo (`ROTULO`).
 *
 *   - LA TARJETA FISCAL DE CABECERA. La factura lleva su número de control
 *     fiscal y su fecha de vencimiento; la nota, su número y fecha; la
 *     cotización, hasta cuándo vale.
 *
 *   - EL PIE Y LOS TOTALES. La factura presenta el desglose directo
 *     (Subtotal + IVA = Total) con banda de equivalencia cambiaria; la nota de
 *     entrega muestra únicamente su total (y el pago combinado cuando aplica).
 *
 * TRES CENTÍMETROS DE MARGEN por los cuatro lados, como todo lo que sale de
 * aquí: viene de `hoja.ts` y no se decide en este archivo.
 */

import { logoComoImagen } from './logo'
import { dinero, esCedula } from '@/lib/formato'
import { ABAJO, ajustar, ANCHO_UTIL, ARRIBA, CENTRO, DER, IZQ, PIE } from './hoja'
import { EMPRESA } from '@/lib/empresa'
import {
  type EmpresaPapel,
  FILA_ALTERNA,
  GRIS,
  GRIS_SUAVE,
  HAIRLINE,
  MARCA,
  ROTULO,
  TINTA,
} from './papel'
import type { PdfArmado } from './reciboPdf'

const NARANJA = '#C2500A'

type Doc = import('jspdf').jsPDF

export type TipoDocumento = 'COTIZACION' | 'NOTA' | 'FACTURA'

export interface RenglonImpreso {
  descripcion: string
  /**
   * A qué precio salió y cómo se midió, cuando no es lo normal: «20 % de
   * descuento sobre 12,00», «sin cargo: …», «Precio acordado: …». Va en una
   * segunda línea gris cursiva bajo la descripción.
   */
  detalle?: string | null
  cantidad: string | number
  unidad: string
  /**
   * La misma cantidad en la otra medida, ya escrita: «1,44 TON». Nulo si no se
   * puede saber: en la columna sale «—».
   */
  conversion?: string | null
  precio_unitario: string | number
  subtotal: string | number
  exento_iva?: boolean
}

/** Lo que crece un renglón por cada línea de más, de descripción o de detalle. */
const LINEA_DE_MAS = 3.4

/** Siete milímetros un renglón base, más las líneas adicionales de descripción o detalle. */
const altoRenglon = (lineas: number, r: RenglonImpreso) =>
  7 + (lineas - 1) * LINEA_DE_MAS + (r.detalle ? 3.4 : 0)

export interface DatosDocumento {
  tipo: TipoDocumento
  numero: string
  fecha: string

  /** Solo la factura. Es el correlativo fiscal. */
  numeroControl?: string | null
  /** Factura: cuándo vence. Cotización: hasta cuándo vale. */
  vigencia?: { rotulo: string; fecha: string } | null
  condicionPago?: string | null

  contraparte: {
    nombre: string
    rif: string
    direccion?: string | null
    telefono?: string | null
  }

  /** Solo la nota de entrega. */
  despacho?: {
    vehiculo?: string | null
    chofer?: string | null
    cedulaChofer?: string | null
    ticket?: string | null
    pesoNeto?: string | null
    camiones?: {
      vehiculo?: string | null
      chofer?: string | null
      cedulaChofer?: string | null
      ticket?: string | null
      pesoNeto?: string | null
    }[]
  } | null

  /**
   * Solo la nota de entrega. Lo que se esperaba cobrar en cada moneda, cuando
   * el cliente paga una parte en dólares y otra en bolívares.
   */
  pagoCombinado?: { usd: string | number; bs: string | number } | null

  moneda: string
  /** Bolívares por una unidad de la moneda del documento. */
  tasa: string | number
  /** Bolívares por dólar, congelada con el documento. */
  tasaUsd?: string | number | null
  renglones: RenglonImpreso[]

  subtotal: string | number
  descuento: string | number
  flete: string | number
  baseImponible?: string | number | null
  iva: string | number
  alicuotaIva: string | number
  /** El IGTF, si lo lleva. Sin él no hay línea. */
  alicuotaIgtf?: string | number | null
  igtf?: string | number | null
  total: string | number
  /** Solo la factura, y solo si el cliente es contribuyente especial. */
  retencionIva?: string | number | null

  observacion?: string | null
  /**
   * Resumen de conversión bajo la tabla. Solo se imprime si el papel lleva la
   * columna de conversión.
   */
  notaConversion?: string | null
  /** Marca de agua: ANULADA, PENDIENTE, o nada. */
  sello?: string | null

  empresa: EmpresaPapel

  emitidoPor: string
}

const ROTULOS: Record<
  TipoDocumento,
  {
    titulo: string
    color: string
    acento: string
    divisorCabecera: string
    archivo: string
    numero: string
  }
> = {
  COTIZACION: {
    titulo: 'COTIZACIÓN',
    color: ROTULO,
    acento: ROTULO,
    divisorCabecera: '#735a49',
    archivo: 'cotizacion',
    numero: 'N° COTIZACIÓN',
  },
  NOTA: {
    titulo: 'NOTA DE ENTREGA',
    color: NARANJA,
    acento: NARANJA,
    divisorCabecera: '#d97736',
    archivo: 'nota-entrega',
    numero: 'N° NOTA',
  },
  FACTURA: {
    titulo: 'FACTURA',
    color: MARCA,
    acento: ROTULO,
    divisorCabecera: '#b05646',
    archivo: 'factura',
    numero: 'N° FACTURA',
  },
}

const PIES: Record<TipoDocumento, string> = {
  COTIZACION:
    'Los precios están expresados con la tasa del día indicada arriba y se ajustan al momento de facturar. Esta cotización no compromete existencias.',
  NOTA: '',
  FACTURA:
    'La retención del IVA, cuando aplica, la declara y entera el comprador. Original: cliente. Copia: archivo.',
}

const decimal2 = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const numero = (v: string | number | null | undefined): string =>
  decimal2.format(typeof v === 'number' ? v : Number(v ?? 0))

const conSimbolo = (moneda: string, v: string | number | null | undefined): string =>
  dinero(moneda, v ?? 0)

const fechaCorta = (iso: string): string =>
  new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(`${iso.slice(0, 10)}T12:00:00`),
  )

// ---------------------------------------------------------------------------
// Las columnas de la tabla (reparto sobre los 150 mm de ANCHO_UTIL)
//
// Cada columna tiene su propio hueco delimitado por líneas divisorias sutiles.
// UNIDAD y CONVERSIÓN van centradas dentro de su celda para que los encabezados
// y valores nunca se peguen entre sí.
// ---------------------------------------------------------------------------
interface Columnas {
  /** Ancho útil para el texto de la descripción. */
  descripcion: number
  /** Posición X derecha para CANTIDAD. */
  cant: number
  /** Centro X de la columna UNIDAD. */
  unidCentro: number
  /** Centro X de la columna CONVERSIÓN (nulo cuando no aplica). */
  convCentro: number | null
  /** Posición X derecha para PRECIO. */
  prec: number
  /** Posición X derecha para TOTAL. */
  total: number
  /** Coordenadas X donde se trazan los separadores verticales de la tabla. */
  divisores: number[]
}

const SIN_CONVERSION: Columnas = {
  descripcion: 66,
  cant: IZQ + 91.5,
  unidCentro: IZQ + 103,
  convCentro: null,
  prec: IZQ + 128.5,
  total: DER - 2.5,
  divisores: [IZQ + 72, IZQ + 94, IZQ + 112, IZQ + 131],
}

const CON_CONVERSION: Columnas = {
  descripcion: 48,
  cant: IZQ + 71.5,
  unidCentro: IZQ + 82,
  convCentro: IZQ + 101,
  prec: IZQ + 128.5,
  total: DER - 2.5,
  divisores: [IZQ + 54, IZQ + 74, IZQ + 90, IZQ + 112, IZQ + 131],
}

/** Ancho reservado a la izquierda para los recuadros de conversión y observación. */
const ANCHO_NOTAS = 76

function lineasDeDescripcion(doc: Doc, texto: string, ancho: number): string[] {
  doc.setFont('helvetica', 'bold').setFontSize(8)
  const partes = doc.splitTextToSize(texto, ancho) as string[]
  if (partes.length <= 2) return partes
  return [partes[0], ajustar(doc, partes.slice(1).join(' '), ancho)]
}

/**
 * Membrete izquierdo + Tarjeta Fiscal derecha del Modelo Ejecutivo.
 */
function cabeceraEjecutiva(doc: Doc, logo: string, d: DatosDocumento): number {
  const y = ARRIBA
  const rotulo = ROTULOS[d.tipo]

  const ANCHO_CAJA = 56
  const xCaja = DER - ANCHO_CAJA

  if (logo) doc.addImage(logo, 'PNG', IZQ, y - 1, 14, 14)

  const TEXTO = logo ? IZQ + 17 : IZQ
  const ANCHO_NOMBRE = xCaja - TEXTO - 4

  let talla = 13.5
  doc.setFont('helvetica', 'bold')
  const nombre = d.empresa.razonSocial.toUpperCase()
  while (talla > 8.5) {
    doc.setFontSize(talla)
    if (doc.getTextWidth(nombre) <= ANCHO_NOMBRE) break
    talla -= 0.5
  }

  doc.setTextColor(MARCA).setFontSize(talla)
  doc.text(ajustar(doc, nombre, ANCHO_NOMBRE), TEXTO, y + 3)

  let bajoIzq = y + 3
  if (d.empresa.actividad) {
    doc.setFont('helvetica', 'bold').setFontSize(6.8).setTextColor(ROTULO)
    doc.text(ajustar(doc, d.empresa.actividad.toUpperCase(), ANCHO_NOMBRE), TEXTO, y + 7.2)
    bajoIzq = y + 7.2
  }

  const rifTexto = `RIF: ${d.empresa.rif}`
  doc.setFont('helvetica', 'bold').setFontSize(6.8).setTextColor(TINTA)
  doc.text(rifTexto, TEXTO, y + 11)
  if (d.empresa.contacto) {
    const xContacto = TEXTO + doc.getTextWidth(rifTexto)
    doc.setFont('helvetica', 'normal').setTextColor(GRIS)
    doc.text(
      ajustar(doc, `  ·  ${d.empresa.contacto}`, Math.max(10, ANCHO_NOMBRE - (xContacto - TEXTO))),
      xContacto,
      y + 11,
    )
  }
  bajoIzq = y + 11

  if (d.empresa.domicilio) {
    doc.setFont('helvetica', 'normal').setFontSize(6.2).setTextColor(GRIS)
    const lineas = (
      doc.splitTextToSize(d.empresa.domicilio.toUpperCase(), ANCHO_NOMBRE) as string[]
    ).slice(0, 2)
    doc.text(lineas, TEXTO, y + 14.4, { lineHeightFactor: 1.3 })
    bajoIzq = y + 14.4 + (lineas.length - 1) * 2.4
  }

  // Tarjeta Fiscal a la derecha
  const filasCaja: Array<{
    etiqueta: string
    valor: string
    destacado?: boolean
    separador?: 'dashed' | 'solid'
  }> = [{ etiqueta: rotulo.numero, valor: d.numero, destacado: true }]

  if (d.numeroControl) {
    filasCaja.push({
      etiqueta: 'N° CONTROL',
      valor: d.numeroControl,
      separador: 'dashed',
    })
  }

  filasCaja.push({
    etiqueta: 'FECHA',
    valor: fechaCorta(d.fecha),
    separador: 'solid',
  })

  if (d.vigencia) {
    filasCaja.push({
      etiqueta: d.vigencia.rotulo.toUpperCase(),
      valor: fechaCorta(d.vigencia.fecha),
    })
  }

  const ALTO_CABECERA_CAJA = 5.6
  const ALTO_FILA_CAJA = 4.4
  const altoCuerpoCaja = filasCaja.length * ALTO_FILA_CAJA + 2.2
  const altoCaja = ALTO_CABECERA_CAJA + altoCuerpoCaja
  const yCaja = y - 1.5

  // Fondo y borde general de la tarjeta fiscal
  doc.setFillColor('#faf8f6')
  doc.setDrawColor('#d6d3d1').setLineWidth(0.25)
  doc.roundedRect(xCaja, yCaja, ANCHO_CAJA, altoCaja, 1.2, 1.2, 'FD')

  // Banda superior de la tarjeta con el título del documento
  doc.setFillColor(rotulo.color)
  doc.rect(xCaja, yCaja, ANCHO_CAJA, ALTO_CABECERA_CAJA, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor('#FFFFFF')
  doc.text(rotulo.titulo, xCaja + ANCHO_CAJA / 2, yCaja + 3.9, { align: 'center' })

  let yFila = yCaja + ALTO_CABECERA_CAJA + 3.6
  filasCaja.forEach((f) => {
    if (f.separador) {
      doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
      if (f.separador === 'dashed') doc.setLineDashPattern([0.8, 0.8], 0)
      doc.line(xCaja + 2.5, yFila - 3.1, DER - 2.5, yFila - 3.1)
      if (f.separador === 'dashed') doc.setLineDashPattern([], 0)
    }

    doc.setFont('helvetica', 'bold').setFontSize(6.2).setTextColor(GRIS)
    doc.text(`${f.etiqueta}:`, xCaja + 2.5, yFila)

    doc
      .setFont('helvetica', 'bold')
      .setFontSize(f.destacado ? 8.2 : 7)
      .setTextColor(f.destacado ? rotulo.color : TINTA)
    doc.text(ajustar(doc, f.valor, 32), DER - 2.5, yFila, { align: 'right' })

    yFila += ALTO_FILA_CAJA
  })

  const regla = Math.max(bajoIzq + 3.5, yCaja + altoCaja + 2.8)
  doc.setDrawColor(rotulo.color).setLineWidth(0.65)
  doc.line(IZQ, regla, DER, regla)

  return regla + 3.5
}

/**
 * Tarjeta del cliente con barra lateral de acento y, en la nota, datos del despacho.
 */
function encabezadoCliente(doc: Doc, d: DatosDocumento, y: number): number {
  const rotulo = ROTULOS[d.tipo]
  const x1 = IZQ + 4.5
  const xDiv = IZQ + 92
  const x2 = IZQ + 95
  const ANCHO_1 = 84.5
  const ANCHO_2 = 52
  const RENGLON = 3.5

  doc.setFont('helvetica', 'bold').setFontSize(8.2)
  const nombre = (doc.splitTextToSize(d.contraparte.nombre || '—', ANCHO_1) as string[]).slice(0, 2)
  doc.setFont('helvetica', 'bold').setFontSize(7.6)
  const direccion = (
    doc.splitTextToSize(d.contraparte.direccion ?? '—', ANCHO_1) as string[]
  ).slice(0, 3)

  const altoFila1 = 9.5 + (nombre.length - 1) * RENGLON
  const altoFila2 = 9.5 + (direccion.length - 1) * RENGLON
  const altoDatos = altoFila1 + altoFila2

  const camiones = d.despacho?.camiones?.length
    ? d.despacho.camiones
    : d.despacho
      ? [d.despacho]
      : []
  const altoDespacho = d.despacho ? 12 + Math.max(0, camiones.length - 1) * 4.8 : 0
  const altoTotal = altoDatos + altoDespacho

  // Fondo y contorno de la tarjeta
  doc.setFillColor(FILA_ALTERNA)
  doc.setDrawColor(HAIRLINE).setLineWidth(0.25)
  doc.rect(IZQ, y, ANCHO_UTIL, altoTotal, 'FD')

  // Barra lateral izquierda de acento
  doc.setFillColor(rotulo.acento)
  doc.rect(IZQ, y, 1.4, altoTotal, 'F')

  // Líneas internas de la grilla de cliente
  doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
  doc.line(xDiv, y, xDiv, y + altoDatos)
  doc.line(IZQ + 1.4, y + altoFila1, DER, y + altoFila1)

  const etiqueta = (texto: string, x: number, fila: number, color = GRIS) => {
    doc.setFont('helvetica', 'bold').setFontSize(6.2).setTextColor(color)
    doc.text(texto.toUpperCase(), x, fila)
  }

  // Fila 1: Cliente y Cédula/RIF
  etiqueta('Cliente / Razón Social', x1, y + 4.2, rotulo.acento)
  doc.setFont('helvetica', 'bold').setFontSize(8.2).setTextColor('#222222')
  doc.text(nombre, x1, y + 8, { lineHeightFactor: 1.35 })

  etiqueta(esCedula(d.contraparte.rif) ? 'Cédula / RIF' : 'RIF / Cédula', x2, y + 4.2, rotulo.acento)
  doc.setFont('helvetica', 'bold').setFontSize(8.2).setTextColor('#222222')
  doc.text(ajustar(doc, d.contraparte.rif || '—', ANCHO_2), x2, y + 8)

  // Fila 2: Dirección y Condición de pago / Teléfono
  const yDir = y + altoFila1
  etiqueta('Dirección Fiscal', x1, yDir + 4.2, GRIS)
  doc.setFont('helvetica', 'bold').setFontSize(7.6).setTextColor(TINTA)
  doc.text(direccion, x1, yDir + 8, { lineHeightFactor: 1.35 })

  etiqueta(d.condicionPago ? 'Condición de pago' : 'Teléfono', x2, yDir + 4.2, GRIS)
  const valorCondicion = d.condicionPago ?? d.contraparte.telefono ?? '—'
  if (d.condicionPago) {
    doc.setFont('helvetica', 'bold').setFontSize(7.4)
    const textoCond = ajustar(doc, valorCondicion, ANCHO_2 - 4)
    const anchoPastilla = doc.getTextWidth(textoCond) + 4
    doc.setFillColor('#ebe5e0')
    doc.roundedRect(x2, yDir + 5.1, anchoPastilla, 4.2, 0.8, 0.8, 'F')
    doc.setTextColor(ROTULO)
    doc.text(textoCond, x2 + 2, yDir + 8)
  } else {
    doc.setFont('helvetica', 'bold').setFontSize(7.6).setTextColor(TINTA)
    doc.text(ajustar(doc, valorCondicion, ANCHO_2), x2, yDir + 8)
  }

  // Fila 3 (solo Nota de Entrega): Vehículo, Chofer, Cédula, Ticket/Peso
  if (d.despacho) {
    const yDesp = y + altoDatos
    doc.setDrawColor('#d6d3d1').setLineWidth(0.3)
    doc.line(IZQ + 1.4, yDesp, DER, yDesp)

    const columnas = [
      ['Vehículo', 32],
      ['Chofer', 48],
      ['Cédula', 28],
      ['Ticket · peso neto', 36],
    ] as const

    let x = x1
    for (const [rot, ancho] of columnas) {
      etiqueta(
        camiones.length > 1 && rot === 'Vehículo' ? `Vehículos (${camiones.length})` : rot,
        x,
        yDesp + 4.2,
        rotulo.acento,
      )
      x += ancho
    }

    camiones.forEach((c, i) => {
      const fila = yDesp + 8 + i * 4.8
      const valores = [
        c.vehiculo,
        c.chofer,
        c.cedulaChofer,
        [c.ticket, c.pesoNeto].filter(Boolean).join(' · '),
      ]
      let cx = x1
      columnas.forEach(([, ancho], j) => {
        doc.setFont('helvetica', 'bold').setFontSize(7.6).setTextColor('#222222')
        doc.text(ajustar(doc, valores[j] || '—', ancho - 3), cx, fila)
        cx += ancho
      })
    })
  }

  return y + altoTotal + 4.5
}

function cabeceraTabla(
  doc: Doc,
  y: number,
  col: Columnas,
  rotulo: (typeof ROTULOS)[TipoDocumento],
): number {
  const ALTO = 7
  doc.setFillColor(rotulo.color)
  doc.rect(IZQ, y, ANCHO_UTIL, ALTO, 'F')

  // Separadores verticales sutiles en la cabecera
  doc.setDrawColor(rotulo.divisorCabecera).setLineWidth(0.2)
  for (const x of col.divisores) {
    doc.line(x, y + 1.2, x, y + ALTO - 1.2)
  }

  doc.setTextColor('#FFFFFF').setFont('helvetica', 'bold').setFontSize(6.8)
  doc.text('DESCRIPCIÓN', IZQ + 3, y + 4.7)
  doc.text('CANTIDAD', col.cant, y + 4.7, { align: 'right' })
  doc.text('UNIDAD', col.unidCentro, y + 4.7, { align: 'center' })
  if (col.convCentro !== null) doc.text('CONVERSIÓN', col.convCentro, y + 4.7, { align: 'center' })
  doc.text('PRECIO', col.prec, y + 4.7, { align: 'right' })
  doc.text('TOTAL', col.total, y + 4.7, { align: 'right' })

  return y + ALTO
}

function pie(doc: Doc, d: DatosDocumento, pagina: number, de: number) {
  doc.setDrawColor('#d6d3d1').setLineWidth(0.25)
  doc.line(IZQ, PIE - 8, DER, PIE - 8)

  const legal =
    d.tipo === 'FACTURA' && d.empresa.imprenta
      ? `${PIES[d.tipo]} Imprenta: ${d.empresa.imprenta}.`
      : PIES[d.tipo]

  doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(6.5)
  const lineas = (doc.splitTextToSize(legal, ANCHO_UTIL - 30) as string[]).slice(0, 2)
  doc.text(lineas, IZQ, lineas.length > 1 ? PIE - 6.2 : PIE - 4.5)

  doc.setFont('helvetica', 'bold').setTextColor(ROTULO)
  doc.text(`Página ${pagina} de ${de}`, DER, PIE - 4.5, { align: 'right' })

  doc.setFont('helvetica', 'normal').setTextColor(GRIS)
  doc.text(`Emitido por ${d.emitidoPor} · ${EMPRESA.marca}`, IZQ, PIE)

  if (d.tipo !== 'NOTA') {
    doc.setTextColor(GRIS_SUAVE)
    doc.text(`Tasa del día: ${numero(d.tasaUsd || d.tasa)} Bs/$`, DER, PIE, { align: 'right' })
  }
}

function sello(doc: Doc, texto: string) {
  doc.saveGraphicsState()
  // @ts-expect-error jsPDF expone GState por el objeto global, sin tipo propio.
  doc.setGState(new doc.GState({ opacity: 0.14 }))
  doc.setTextColor('#DE3B40').setFont('helvetica', 'bold').setFontSize(64)
  doc.text(texto, CENTRO, 165, { align: 'center', angle: 28 })
  doc.restoreGraphicsState()
}

const mencionaImpuestos = (d: DatosDocumento) => d.tipo !== 'NOTA'

const lineaDeIva = (d: DatosDocumento) =>
  d.tipo === 'FACTURA' || (d.tipo === 'COTIZACION' && Number(d.alicuotaIva) > 0)

const lineaDeIgtf = (d: DatosDocumento) => mencionaImpuestos(d) && Number(d.igtf ?? 0) > 0

function altoTotales(d: DatosDocumento): number {
  if (!mencionaImpuestos(d)) return d.pagoCombinado ? 18 : 13
  const filas =
    1 + // subtotal
    (lineaDeIva(d) ? 1 : 0) +
    (lineaDeIgtf(d) ? 1 : 0) +
    (Number(d.descuento) > 0 ? 1 : 0) +
    (Number(d.flete) > 0 ? 1 : 0) +
    (Number(d.retencionIva ?? 0) > 0 ? 2 : 0)
  return filas * 4.8 + 18
}

/**
 * Tarjeta de totales a la derecha: Subtotal + IVA directo, banda de TOTAL
 * resaltada y barra inferior con la equivalencia cambiaria.
 */
function totales(doc: Doc, d: DatosDocumento, y: number): number {
  const rotulo = ROTULOS[d.tipo]
  const x = IZQ + 82
  const ancho = DER - x
  const yInicio = y + 3

  if (!mencionaImpuestos(d)) {
    const altoCaja = d.pagoCombinado ? 14 : 9
    doc.setFillColor('#faf8f6')
    doc.setDrawColor(rotulo.color).setLineWidth(0.4)
    doc.roundedRect(x, yInicio, ancho, altoCaja, 1, 1, 'FD')

    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(rotulo.color)
    doc.text('TOTAL', x + 3.5, yInicio + 6)
    doc.setFontSize(10.5).setTextColor('#111111')
    doc.text(conSimbolo(d.moneda, d.total), DER - 3.5, yInicio + 6, { align: 'right' })

    if (d.pagoCombinado) {
      doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
      doc.line(x + 3, yInicio + 8, DER - 3, yInicio + 8)
      doc.setFont('helvetica', 'normal').setFontSize(7.2).setTextColor(GRIS)
      doc.text('Pago combinado', x + 3.5, yInicio + 12)
      doc.setFont('helvetica', 'bold').setTextColor(TINTA)
      doc.text(
        `${conSimbolo('USD', d.pagoCombinado.usd)} + ${conSimbolo('VES', d.pagoCombinado.bs)}`,
        DER - 3.5,
        yInicio + 12,
        { align: 'right' },
      )
    }

    return yInicio + altoCaja + 3
  }

  // Filas superiores (Subtotal, Descuento, Flete, IVA, IGTF)
  const filasSuperiores: Array<[string, string]> = [
    ['Subtotal', conSimbolo(d.moneda, d.subtotal)],
  ]
  if (Number(d.descuento) > 0) {
    filasSuperiores.push(['Descuento', `- ${conSimbolo(d.moneda, d.descuento)}`])
  }
  if (Number(d.flete) > 0) {
    filasSuperiores.push(['Flete', conSimbolo(d.moneda, d.flete)])
  }
  if (lineaDeIva(d)) {
    const alicuota = Number(d.alicuotaIva)
    const etqIva = `IVA (${Number.isInteger(alicuota) ? alicuota : numero(alicuota)}%)`
    filasSuperiores.push([etqIva, conSimbolo(d.moneda, d.iva)])
  }
  if (lineaDeIgtf(d)) {
    const alicuotaIgtf = Number(d.alicuotaIgtf ?? 0)
    const etqIgtf = `IGTF (${Number.isInteger(alicuotaIgtf) ? alicuotaIgtf : numero(alicuotaIgtf)}%)`
    filasSuperiores.push([etqIgtf, conSimbolo(d.moneda, d.igtf ?? 0)])
  }

  const ALTO_FILA = 4.6
  const altoSuperiores = filasSuperiores.length * ALTO_FILA + 3
  const ALTO_BANDA_TOTAL = 8
  const tieneRetencion = Number(d.retencionIva ?? 0) > 0
  const altoRetencion = tieneRetencion ? 10 : 0
  const ALTO_BANDA_EQ = 5.6
  const altoTotalCaja = altoSuperiores + ALTO_BANDA_TOTAL + altoRetencion + ALTO_BANDA_EQ

  // Contenedor blanco general
  doc.setFillColor('#ffffff')
  doc.setDrawColor(HAIRLINE).setLineWidth(0.25)
  doc.roundedRect(x, yInicio, ancho, altoTotalCaja, 1, 1, 'FD')

  let cursor = yInicio + 4.4
  for (const [etq, val] of filasSuperiores) {
    doc.setFont('helvetica', 'normal').setFontSize(7.8).setTextColor(GRIS)
    doc.text(etq, x + 3.5, cursor)
    doc.setFont('helvetica', 'bold').setTextColor(TINTA)
    doc.text(val, DER - 3.5, cursor, { align: 'right' })
    cursor += ALTO_FILA
  }

  // Banda de TOTAL destacada
  const yBandaTotal = yInicio + altoSuperiores
  doc.setFillColor(FILA_ALTERNA)
  doc.rect(x + 0.2, yBandaTotal, ancho - 0.4, ALTO_BANDA_TOTAL, 'F')
  doc.setDrawColor(rotulo.color).setLineWidth(0.5)
  doc.line(x, yBandaTotal, DER, yBandaTotal)

  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(rotulo.color)
  doc.text('TOTAL', x + 3.5, yBandaTotal + 5.4)
  doc.setFontSize(10.5).setTextColor('#111111')
  doc.text(conSimbolo(d.moneda, d.total), DER - 3.5, yBandaTotal + 5.4, { align: 'right' })

  let yDespuesTotal = yBandaTotal + ALTO_BANDA_TOTAL

  if (tieneRetencion) {
    doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
    doc.line(x, yDespuesTotal, DER, yDespuesTotal)

    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
    doc.text('Retención de IVA', x + 3.5, yDespuesTotal + 4)
    doc.setFont('helvetica', 'bold').setTextColor(MARCA)
    doc.text(`- ${conSimbolo(d.moneda, d.retencionIva)}`, DER - 3.5, yDespuesTotal + 4, {
      align: 'right',
    })

    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(TINTA)
    doc.text('A pagar', x + 3.5, yDespuesTotal + 8.2)
    doc.text(
      conSimbolo(d.moneda, Number(d.total) - Number(d.retencionIva ?? 0)),
      DER - 3.5,
      yDespuesTotal + 8.2,
      { align: 'right' },
    )
    yDespuesTotal += altoRetencion
  }

  // Banda inferior con la tasa BCV y equivalencia en la otra moneda
  doc.setFillColor(rotulo.acento)
  doc.rect(x, yDespuesTotal, ancho, ALTO_BANDA_EQ, 'F')

  const tasaRef = Number(d.tasaUsd || d.tasa || 1)
  const otra =
    d.moneda === 'VES'
      ? `Equivale a $ ${numero(Number(d.total) / tasaRef)}`
      : `Equivale a Bs ${numero(Number(d.total) * Number(d.tasa || 1))}`

  doc.setFont('helvetica', 'normal').setFontSize(6.6).setTextColor('#f5f5f4')
  doc.text(`Tasa BCV: ${numero(tasaRef)} Bs/$`, x + 3.5, yDespuesTotal + 3.9)
  doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor('#ffffff')
  doc.text(otra, DER - 3.5, yDespuesTotal + 3.9, { align: 'right' })

  return yInicio + altoTotalCaja + 3
}

function firmas(doc: Doc, d: DatosDocumento, y: number) {
  const izquierda = d.tipo === 'NOTA' ? 'Entregado por' : 'Por la empresa'
  const derecha = d.tipo === 'NOTA' ? 'Recibido conforme' : 'Aceptado por el cliente'
  const subIzq = 'Nombre, cédula, fecha y sello'
  const subDer = 'Nombre, cédula, fecha y firma'

  const SEPARA = 12
  const ancho = (ANCHO_UTIL - SEPARA) / 2
  const ALTO_CAJA = 17

  for (const [i, [texto, subtitulo]] of [
    [izquierda, subIzq],
    [derecha, subDer],
  ].entries()) {
    const x = IZQ + i * (ancho + SEPARA)
    doc.setFillColor('#faf8f6')
    doc.setDrawColor(HAIRLINE).setLineWidth(0.25)
    doc.roundedRect(x, y - 9.5, ancho, ALTO_CAJA, 1, 1, 'FD')

    const margenLinea = ancho * 0.12
    doc.setDrawColor(TINTA).setLineWidth(0.35)
    doc.line(x + margenLinea, y - 0.5, x + ancho - margenLinea, y - 0.5)

    doc.setTextColor(ROTULO).setFont('helvetica', 'bold').setFontSize(6.8)
    doc.text(texto.toUpperCase(), x + ancho / 2, y + 3, { align: 'center' })
    doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(6.3)
    doc.text(subtitulo, x + ancho / 2, y + 6, { align: 'center' })
  }
}

/**
 * Recuadro izquierdo bajo la tabla para el resumen de conversión y observación.
 */
function pintarNotasIzquierda(
  doc: Doc,
  y: number,
  lineasConversion: string[],
  lineasObservacion: string[],
  acento: string,
): number {
  let cursor = y + 3

  if (lineasConversion.length > 0) {
    const altoCaja = 4.2 + lineasConversion.length * 3.1
    doc.setFillColor('#faf8f6')
    doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
    doc.rect(IZQ, cursor, ANCHO_NOTAS, altoCaja, 'FD')
    doc.setFillColor(GRIS_SUAVE)
    doc.rect(IZQ, cursor, 1.1, altoCaja, 'F')

    lineasConversion.forEach((linea, idx) => {
      doc
        .setFont('helvetica', idx === 0 ? 'bold' : 'normal')
        .setFontSize(idx === 0 ? 6.8 : 6.3)
        .setTextColor(idx === 0 ? ROTULO : GRIS)
      doc.text(linea, IZQ + 3, cursor + 3.5 + idx * 3.1)
    })

    cursor += altoCaja + 2.5
  }

  if (lineasObservacion.length > 0) {
    const altoObs = 4 + lineasObservacion.length * 3.1
    doc.setFillColor('#faf8f6')
    doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
    doc.rect(IZQ, cursor, ANCHO_NOTAS, altoObs, 'FD')
    doc.setFillColor(acento)
    doc.rect(IZQ, cursor, 1.1, altoObs, 'F')

    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(TINTA)
    lineasObservacion.forEach((linea, idx) => {
      doc.text(linea, IZQ + 3, cursor + 3.4 + idx * 3.1)
    })

    cursor += altoObs
  }

  return cursor
}

function dibujarDocumento(doc: Doc, logo: string, d: DatosDocumento): void {
  const rotulo = ROTULOS[d.tipo]
  const col = d.renglones.some((r) => r.conversion) ? CON_CONVERSION : SIN_CONVERSION

  // Medir notas de conversión y observación antes de repartir las hojas
  doc.setFont('helvetica', 'normal').setFontSize(6.4)
  let lineasConversion: string[] = []
  if (col.convCentro !== null && d.notaConversion) {
    for (const parrafo of d.notaConversion.split('\n')) {
      const envueltas = doc.splitTextToSize(parrafo, ANCHO_NOTAS - 5) as string[]
      lineasConversion.push(...envueltas)
    }
    if (lineasConversion.length > 7) {
      lineasConversion = [
        ...lineasConversion.slice(0, 6),
        ajustar(doc, lineasConversion.slice(6).join(' '), ANCHO_NOTAS - 5),
      ]
    }
  }

  doc.setFont('helvetica', 'normal').setFontSize(6.5)
  let lineasObservacion: string[] = []
  if (d.observacion) {
    lineasObservacion = doc.splitTextToSize(
      `Observación: ${d.observacion}`,
      ANCHO_NOTAS - 5,
    ) as string[]
    if (lineasObservacion.length > 5) {
      lineasObservacion = [
        ...lineasObservacion.slice(0, 4),
        ajustar(doc, lineasObservacion.slice(4).join(' '), ANCHO_NOTAS - 5),
      ]
    }
  }

  const altoNotasIzq =
    (lineasConversion.length > 0 ? 6.5 + lineasConversion.length * 3.1 : 0) +
    (lineasObservacion.length > 0 ? 6 + lineasObservacion.length * 3.1 : 0)
  const cierre = Math.max(altoTotales(d), altoNotasIzq) + 26
  const topeTabla = ABAJO - 14

  const yTrasMembrete = cabeceraEjecutiva(doc, logo, d)
  const yPrimera = encabezadoCliente(doc, d, yTrasMembrete)

  const lineas = d.renglones.map((r) => lineasDeDescripcion(doc, r.descripcion, col.descripcion))
  const altoDe = (i: number) => altoRenglon(lineas[i].length, d.renglones[i])

  const hojas: number[][] = []
  {
    let y = yPrimera + 7
    let actual: number[] = []

    for (const i of d.renglones.keys()) {
      if (y + altoDe(i) > topeTabla) {
        hojas.push(actual)
        actual = []
        y = ARRIBA + 12 + 7
      }
      actual.push(i)
      y += altoDe(i)
    }
    hojas.push(actual)

    if (y + cierre > ABAJO) hojas.push([])
  }

  for (const [indice, posiciones] of hojas.entries()) {
    if (indice > 0) doc.addPage()

    let y: number

    if (indice === 0) {
      y = yPrimera
    } else {
      doc.setFillColor(rotulo.color)
      doc.rect(IZQ, ARRIBA, ANCHO_UTIL, 9, 'F')
      if (logo) doc.addImage(logo, 'PNG', IZQ + 3, ARRIBA + 1.5, 6, 6)
      doc.setTextColor('#FFFFFF').setFont('helvetica', 'bold').setFontSize(8)
      doc.text(`${rotulo.titulo} ${d.numero}`, IZQ + 12, ARRIBA + 6)
      doc.setFont('helvetica', 'normal').setFontSize(7)
      doc.text(ajustar(doc, d.contraparte.nombre, 60), DER - 3, ARRIBA + 6, { align: 'right' })
      y = ARRIBA + 12
    }

    const yInicioTabla = y
    y = cabeceraTabla(doc, y, col, rotulo)

    for (const [k, i] of posiciones.entries()) {
      const r = d.renglones[i]
      const descripcion = lineas[i]
      const bajada = (descripcion.length - 1) * LINEA_DE_MAS
      const alto = altoDe(i)

      // Fondo de la fila
      doc.setFillColor(k % 2 === 1 ? FILA_ALTERNA : '#FFFFFF')
      doc.rect(IZQ, y, ANCHO_UTIL, alto, 'F')

      // Separadores verticales e inferior de la fila
      doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
      for (const xDiv of col.divisores) {
        doc.line(xDiv, y, xDiv, y + alto)
      }
      doc.line(IZQ, y + alto, DER, y + alto)

      // Descripción en negrita
      doc.setTextColor('#222222').setFont('helvetica', 'bold').setFontSize(8)
      descripcion.forEach((linea, j) => doc.text(linea, IZQ + 3, y + 4.5 + j * LINEA_DE_MAS))

      // Cantidad
      doc.setTextColor('#222222').setFont('helvetica', 'bold').setFontSize(8)
      doc.text(numero(r.cantidad), col.cant, y + 4.5, { align: 'right' })

      // Unidad centrada en pastilla
      doc.setFont('helvetica', 'bold').setFontSize(6.6)
      const textoUnidad = r.unidad || '—'
      const anchoPastilla = Math.max(doc.getTextWidth(textoUnidad) + 3.4, 7.5)
      doc.setFillColor(k % 2 === 1 ? '#ebe5e0' : '#f3efeb')
      doc.roundedRect(
        col.unidCentro - anchoPastilla / 2,
        y + 1.5,
        anchoPastilla,
        4.1,
        0.7,
        0.7,
        'F',
      )
      doc.setTextColor(ROTULO)
      doc.text(textoUnidad, col.unidCentro, y + 4.3, { align: 'center' })

      // Conversión centrada
      if (col.convCentro !== null) {
        doc
          .setFont('helvetica', 'bold')
          .setFontSize(7.8)
          .setTextColor(r.conversion ? ROTULO : GRIS)
        doc.text(r.conversion ?? '—', col.convCentro, y + 4.5, { align: 'center' })
      }

      // Precio unitario
      doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(TINTA)
      doc.text(numero(r.precio_unitario), col.prec, y + 4.5, { align: 'right' })

      // Subtotal del renglón
      doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor('#111111')
      doc.text(numero(r.subtotal), col.total, y + 4.5, { align: 'right' })

      // Línea secundaria de detalle (con pequeña flecha en L compatible con WinAnsi)
      if (r.detalle) {
        const yDet = y + 7.8 + bajada
        doc.setDrawColor(GRIS_SUAVE).setLineWidth(0.25)
        doc.line(IZQ + 3.5, yDet - 1.8, IZQ + 3.5, yDet - 0.6)
        doc.line(IZQ + 3.5, yDet - 0.6, IZQ + 4.8, yDet - 0.6)

        doc.setTextColor(GRIS).setFont('helvetica', 'italic').setFontSize(6.5)
        doc.text(ajustar(doc, r.detalle, col.descripcion - 4), IZQ + 5.6, yDet)
      }

      y += alto
    }

    // Borde exterior de la tabla y línea de cierre inferior en el acento del documento
    doc.setDrawColor(HAIRLINE).setLineWidth(0.25)
    doc.line(IZQ, yInicioTabla, IZQ, y)
    doc.line(DER, yInicioTabla, DER, y)
    doc.setDrawColor(rotulo.acento).setLineWidth(0.45)
    doc.line(IZQ, y, DER, y)

    if (indice === hojas.length - 1) {
      const finNotas = pintarNotasIzquierda(
        doc,
        y,
        lineasConversion,
        lineasObservacion,
        rotulo.acento,
      )
      const finTotales = totales(doc, d, y)
      const finBloque = Math.max(finNotas, finTotales)
      firmas(doc, d, Math.min(Math.max(finBloque + 14, ABAJO - 22), ABAJO - 14))
    }

    if (d.sello) sello(doc, d.sello)

    pie(doc, d, indice + 1, hojas.length)
  }
}

export async function armarDocumento(d: DatosDocumento): Promise<PdfArmado> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  const logo = await logoComoImagen()

  dibujarDocumento(doc, logo, d)

  doc.setProperties({
    title: `${ROTULOS[d.tipo].titulo} ${d.numero} — ${d.contraparte.nombre}`,
    subject: ROTULOS[d.tipo].titulo,
    author: d.empresa.razonSocial,
  })

  return {
    blob: doc.output('blob'),
    nombre: `${ROTULOS[d.tipo].archivo}-${d.numero.toLowerCase()}.pdf`,
  }
}

export async function armarVariosDocumentos(
  lista: DatosDocumento[],
  opciones: { titulo: string; archivo: string },
): Promise<PdfArmado> {
  if (lista.length === 0) {
    throw new Error('No hay ningún documento que imprimir.')
  }

  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const logo = await logoComoImagen()

  lista.forEach((d, i) => {
    if (i > 0) doc.addPage()
    dibujarDocumento(doc, logo, d)
  })

  doc.setProperties({
    title: opciones.titulo,
    subject: opciones.titulo,
    author: lista[0].empresa.razonSocial,
  })

  return {
    blob: doc.output('blob'),
    nombre: opciones.archivo,
  }
}
