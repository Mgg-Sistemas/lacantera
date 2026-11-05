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
 *   - ESCALA DINÁMICA EN HOJA A4. Aprovecha el ancho comercial de la hoja
 *     (16 mm de margen lateral) y adapta la altura de las tarjetas, renglones
 *     y separaciones verticales según la cantidad de renglones para que el
 *     documento nunca quede apeñuscado arriba ni deje media página en blanco.
 */

import { logoComoImagen } from './logo'
import { dinero, esCedula } from '@/lib/formato'
import { ajustar } from './hoja'
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

/** Geometría A4 amplia para documentos ejecutivos (210 × 297 mm). */
const IZQ = 16
const DER = 194
const ANCHO_UTIL = DER - IZQ // 178 mm
const CENTRO = 105
const ARRIBA = 16
const ABAJO = 279
const PIE = 281

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

  /**
   * Solo la nota de entrega. Estado de cuenta por cobrar cuando la nota fue
   * marcada con ese compromiso de pago.
   */
  cuentaPorCobrar?: {
    estado: 'POR_COBRAR' | 'VENCIDA' | 'COBRADA'
    fechaPago?: string | null
    cobradaEn?: string | null
  } | null

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

/**
 * Parámetros de ritmo vertical y tipografía que se adaptan a la densidad del
 * documento. Con pocos renglones todo respira con mayor cuerpo; con muchos
 * renglones se compacta suavemente para aprovechar la hoja sin desbordar.
 */
interface EscalaLayout {
  tallaFila: number
  tallaDetalle: number
  altoBaseFila: number
  lineaDeMas: number
  altoDetalle: number
  altoCabeceraTabla: number
  baseFilaCliente: number
  altoDespachoBase: number
  altoCajaFirmas: number
}

function escalaParaRenglones(cantidadRenglones: number): EscalaLayout {
  if (cantidadRenglones <= 3) {
    return {
      tallaFila: 9.8,
      tallaDetalle: 8,
      altoBaseFila: 12,
      lineaDeMas: 4.4,
      altoDetalle: 4.8,
      altoCabeceraTabla: 9.8,
      baseFilaCliente: 13.5,
      altoDespachoBase: 15.5,
      altoCajaFirmas: 24,
    }
  }
  if (cantidadRenglones <= 6) {
    return {
      tallaFila: 9.2,
      tallaDetalle: 7.6,
      altoBaseFila: 10.2,
      lineaDeMas: 4,
      altoDetalle: 4.3,
      altoCabeceraTabla: 9,
      baseFilaCliente: 12.2,
      altoDespachoBase: 14,
      altoCajaFirmas: 22,
    }
  }
  return {
    tallaFila: 8.6,
    tallaDetalle: 7.2,
    altoBaseFila: 8.4,
    lineaDeMas: 3.6,
    altoDetalle: 3.8,
    altoCabeceraTabla: 8.2,
    baseFilaCliente: 11,
    altoDespachoBase: 13,
    altoCajaFirmas: 19,
  }
}

const altoRenglon = (lineas: number, r: RenglonImpreso, esc: EscalaLayout) =>
  esc.altoBaseFila + (lineas - 1) * esc.lineaDeMas + (r.detalle ? esc.altoDetalle : 0)

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
// Las columnas de la tabla (reparto sobre los 178 mm de ANCHO_UTIL)
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
  descripcion: 80,
  cant: IZQ + 109,
  unidCentro: IZQ + 123.5,
  convCentro: null,
  prec: IZQ + 153,
  total: DER - 3.5,
  divisores: [IZQ + 86, IZQ + 112, IZQ + 135, IZQ + 156],
}

const CON_CONVERSION: Columnas = {
  descripcion: 60,
  cant: IZQ + 86,
  unidCentro: IZQ + 99,
  convCentro: IZQ + 121.5,
  prec: IZQ + 153,
  total: DER - 3.5,
  divisores: [IZQ + 66, IZQ + 89, IZQ + 109, IZQ + 134, IZQ + 156],
}

/** Ancho reservado a la izquierda para los recuadros de conversión y observación. */
const ANCHO_NOTAS = 92

function lineasDeDescripcion(doc: Doc, texto: string, ancho: number, talla: number): string[] {
  doc.setFont('helvetica', 'bold').setFontSize(talla)
  const partes = doc.splitTextToSize(texto, ancho) as string[]
  if (partes.length <= 2) return partes
  return [partes[0], ajustar(doc, partes.slice(1).join(' '), ancho)]
}

/**
 * Membrete izquierdo con logo prominente + Tarjeta Fiscal derecha del Modelo Ejecutivo.
 */
function cabeceraEjecutiva(
  doc: Doc,
  logo: string,
  d: DatosDocumento,
  espacioExtra = 0,
): number {
  const y = ARRIBA
  const rotulo = ROTULOS[d.tipo]

  const ANCHO_CAJA = 64
  const xCaja = DER - ANCHO_CAJA

  const LADO_LOGO = 25
  if (logo) doc.addImage(logo, 'PNG', IZQ, y - 0.5, LADO_LOGO, LADO_LOGO)

  const TEXTO = logo ? IZQ + LADO_LOGO + 4.5 : IZQ
  const ANCHO_NOMBRE = xCaja - TEXTO - 4

  let talla = 15.5
  doc.setFont('helvetica', 'bold')
  const nombre = d.empresa.razonSocial.toUpperCase()
  while (talla > 9.5) {
    doc.setFontSize(talla)
    if (doc.getTextWidth(nombre) <= ANCHO_NOMBRE) break
    talla -= 0.5
  }

  doc.setTextColor(MARCA).setFontSize(talla)
  doc.text(ajustar(doc, nombre, ANCHO_NOMBRE), TEXTO, y + 5.2)

  let bajoIzq = y + 5.2
  if (d.empresa.actividad) {
    doc.setFont('helvetica', 'bold').setFontSize(8.2).setTextColor(ROTULO)
    doc.text(ajustar(doc, d.empresa.actividad.toUpperCase(), ANCHO_NOMBRE), TEXTO, y + 10.4)
    bajoIzq = y + 10.4
  }

  const rifTexto = `RIF: ${d.empresa.rif}`
  doc.setFont('helvetica', 'bold').setFontSize(8.2).setTextColor(TINTA)
  doc.text(rifTexto, TEXTO, y + 15.2)
  if (d.empresa.contacto) {
    const xContacto = TEXTO + doc.getTextWidth(rifTexto)
    doc.setFont('helvetica', 'normal').setTextColor(GRIS)
    doc.text(
      ajustar(doc, `  ·  ${d.empresa.contacto}`, Math.max(12, ANCHO_NOMBRE - (xContacto - TEXTO))),
      xContacto,
      y + 15.2,
    )
  }
  bajoIzq = y + 15.2

  if (d.empresa.domicilio) {
    doc.setFont('helvetica', 'normal').setFontSize(7.4).setTextColor(GRIS)
    const lineas = (
      doc.splitTextToSize(d.empresa.domicilio.toUpperCase(), ANCHO_NOMBRE) as string[]
    ).slice(0, 2)
    doc.text(lineas, TEXTO, y + 19.6, { lineHeightFactor: 1.32 })
    bajoIzq = y + 19.6 + (lineas.length - 1) * 3.1
  }

  bajoIzq = Math.max(bajoIzq, y + LADO_LOGO - 1)

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

  const ALTO_CABECERA_CAJA = 7
  const ALTO_FILA_CAJA = 5.6
  const altoCuerpoCaja = filasCaja.length * ALTO_FILA_CAJA + 2.8
  const altoCaja = ALTO_CABECERA_CAJA + altoCuerpoCaja
  const yCaja = y - 0.5

  // Fondo y borde general de la tarjeta fiscal
  doc.setFillColor('#faf8f6')
  doc.setDrawColor('#d6d3d1').setLineWidth(0.3)
  doc.roundedRect(xCaja, yCaja, ANCHO_CAJA, altoCaja, 1.4, 1.4, 'FD')

  // Banda superior de la tarjeta con el título del documento
  doc.setFillColor(rotulo.color)
  doc.rect(xCaja, yCaja, ANCHO_CAJA, ALTO_CABECERA_CAJA, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor('#FFFFFF')
  doc.text(rotulo.titulo, xCaja + ANCHO_CAJA / 2, yCaja + 4.9, { align: 'center' })

  let yFila = yCaja + ALTO_CABECERA_CAJA + 4.6
  filasCaja.forEach((f) => {
    if (f.separador) {
      doc.setDrawColor(HAIRLINE).setLineWidth(0.22)
      if (f.separador === 'dashed') doc.setLineDashPattern([0.9, 0.9], 0)
      doc.line(xCaja + 3, yFila - 3.9, DER - 3, yFila - 3.9)
      if (f.separador === 'dashed') doc.setLineDashPattern([], 0)
    }

    doc.setFont('helvetica', 'bold').setFontSize(7.4).setTextColor(GRIS)
    doc.text(`${f.etiqueta}:`, xCaja + 3, yFila)

    doc
      .setFont('helvetica', 'bold')
      .setFontSize(f.destacado ? 10.2 : 8.5)
      .setTextColor(f.destacado ? rotulo.color : TINTA)
    doc.text(ajustar(doc, f.valor, 38), DER - 3, yFila, { align: 'right' })

    yFila += ALTO_FILA_CAJA
  })

  const regla = Math.max(bajoIzq + 4, yCaja + altoCaja + 3.5) + espacioExtra * 0.35
  doc.setDrawColor(rotulo.color).setLineWidth(0.75)
  doc.line(IZQ, regla, DER, regla)

  return regla + 5 + espacioExtra * 0.65
}

/**
 * Calcula y dibuja la tarjeta del cliente con barra lateral de acento y datos de despacho.
 */
function medirEncabezadoCliente(doc: Doc, d: DatosDocumento, esc: EscalaLayout) {
  const ANCHO_1 = 104
  const RENGLON = 4.2

  doc.setFont('helvetica', 'bold').setFontSize(9.8)
  const nombre = (doc.splitTextToSize(d.contraparte.nombre || '—', ANCHO_1) as string[]).slice(0, 2)
  doc.setFont('helvetica', 'bold').setFontSize(8.8)
  const direccion = (
    doc.splitTextToSize(d.contraparte.direccion ?? '—', ANCHO_1) as string[]
  ).slice(0, 3)

  const altoFila1 = esc.baseFilaCliente + (nombre.length - 1) * RENGLON
  const altoFila2 = esc.baseFilaCliente + (direccion.length - 1) * RENGLON
  const altoDatos = altoFila1 + altoFila2

  const camiones = d.despacho?.camiones?.length
    ? d.despacho.camiones
    : d.despacho
      ? [d.despacho]
      : []
  const altoDespacho = d.despacho
    ? esc.altoDespachoBase + Math.max(0, camiones.length - 1) * 5.6
    : 0

  return {
    nombre,
    direccion,
    altoFila1,
    altoFila2,
    altoDatos,
    camiones,
    altoDespacho,
    altoTotal: altoDatos + altoDespacho,
  }
}

function encabezadoCliente(
  doc: Doc,
  d: DatosDocumento,
  y: number,
  esc: EscalaLayout,
  espacioExtra = 0,
): number {
  const rotulo = ROTULOS[d.tipo]
  const x1 = IZQ + 5.5
  const xDiv = IZQ + 114
  const x2 = IZQ + 118
  const ANCHO_2 = DER - x2 - 3

  const m = medirEncabezadoCliente(doc, d, esc)

  // Fondo y contorno de la tarjeta
  doc.setFillColor(FILA_ALTERNA)
  doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
  doc.rect(IZQ, y, ANCHO_UTIL, m.altoTotal, 'FD')

  // Barra lateral izquierda de acento
  doc.setFillColor(rotulo.acento)
  doc.rect(IZQ, y, 1.8, m.altoTotal, 'F')

  // Líneas internas de la grilla de cliente
  doc.setDrawColor(HAIRLINE).setLineWidth(0.25)
  doc.line(xDiv, y, xDiv, y + m.altoDatos)
  doc.line(IZQ + 1.8, y + m.altoFila1, DER, y + m.altoFila1)

  const etiqueta = (texto: string, x: number, fila: number, color = GRIS) => {
    doc.setFont('helvetica', 'bold').setFontSize(7.2).setTextColor(color)
    doc.text(texto.toUpperCase(), x, fila)
  }

  // Fila 1: Cliente y Cédula/RIF
  etiqueta('Cliente / Razón Social', x1, y + 5, rotulo.acento)
  doc.setFont('helvetica', 'bold').setFontSize(9.8).setTextColor('#1c1917')
  doc.text(m.nombre, x1, y + 9.8, { lineHeightFactor: 1.32 })

  etiqueta(esCedula(d.contraparte.rif) ? 'Cédula / RIF' : 'RIF / Cédula', x2, y + 5, rotulo.acento)
  doc.setFont('helvetica', 'bold').setFontSize(9.8).setTextColor('#1c1917')
  doc.text(ajustar(doc, d.contraparte.rif || '—', ANCHO_2), x2, y + 9.8)

  // Fila 2: Dirección y Condición de pago / Teléfono
  const yDir = y + m.altoFila1
  etiqueta('Dirección Fiscal', x1, yDir + 5, GRIS)
  doc.setFont('helvetica', 'bold').setFontSize(8.8).setTextColor(TINTA)
  doc.text(m.direccion, x1, yDir + 9.6, { lineHeightFactor: 1.32 })

  etiqueta(d.condicionPago ? 'Condición de pago' : 'Teléfono', x2, yDir + 5, GRIS)
  const valorCondicion = d.condicionPago ?? d.contraparte.telefono ?? '—'
  if (d.condicionPago) {
    doc.setFont('helvetica', 'bold').setFontSize(8.6)
    const textoCond = ajustar(doc, valorCondicion, ANCHO_2 - 5)
    const anchoPastilla = doc.getTextWidth(textoCond) + 5
    doc.setFillColor('#ebe5e0')
    doc.roundedRect(x2, yDir + 6.1, anchoPastilla, 5.2, 1, 1, 'F')
    doc.setTextColor(ROTULO)
    doc.text(textoCond, x2 + 2.5, yDir + 9.7)
  } else {
    doc.setFont('helvetica', 'bold').setFontSize(8.8).setTextColor(TINTA)
    doc.text(ajustar(doc, valorCondicion, ANCHO_2), x2, yDir + 9.6)
  }

  // Fila 3 (solo Nota de Entrega): Vehículo, Chofer, Cédula, Ticket/Peso
  if (d.despacho) {
    const yDesp = y + m.altoDatos
    doc.setDrawColor('#d6d3d1').setLineWidth(0.35)
    doc.line(IZQ + 1.8, yDesp, DER, yDesp)

    const columnas = [
      ['Vehículo', 38],
      ['Chofer', 58],
      ['Cédula', 34],
      ['Ticket · peso neto', 42],
    ] as const

    let x = x1
    for (const [rot, ancho] of columnas) {
      etiqueta(
        m.camiones.length > 1 && rot === 'Vehículo' ? `Vehículos (${m.camiones.length})` : rot,
        x,
        yDesp + 5.2,
        rotulo.acento,
      )
      x += ancho
    }

    m.camiones.forEach((c, i) => {
      const fila = yDesp + 10.2 + i * 5.6
      const valores = [
        c.vehiculo,
        c.chofer,
        c.cedulaChofer,
        [c.ticket, c.pesoNeto].filter(Boolean).join(' · '),
      ]
      let cx = x1
      columnas.forEach(([, ancho], j) => {
        doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor('#1c1917')
        doc.text(ajustar(doc, valores[j] || '—', ancho - 3), cx, fila)
        cx += ancho
      })
    })
  }

  return y + m.altoTotal + 6 + espacioExtra
}

function cabeceraTabla(
  doc: Doc,
  y: number,
  col: Columnas,
  rotulo: (typeof ROTULOS)[TipoDocumento],
  esc: EscalaLayout,
): number {
  const ALTO = esc.altoCabeceraTabla
  doc.setFillColor(rotulo.color)
  doc.rect(IZQ, y, ANCHO_UTIL, ALTO, 'F')

  // Separadores verticales sutiles en la cabecera
  doc.setDrawColor(rotulo.divisorCabecera).setLineWidth(0.25)
  for (const x of col.divisores) {
    doc.line(x, y + 1.5, x, y + ALTO - 1.5)
  }

  const yTexto = y + ALTO * 0.64
  doc.setTextColor('#FFFFFF').setFont('helvetica', 'bold').setFontSize(8)
  doc.text('DESCRIPCIÓN', IZQ + 3.5, yTexto)
  doc.text('CANTIDAD', col.cant, yTexto, { align: 'right' })
  doc.text('UNIDAD', col.unidCentro, yTexto, { align: 'center' })
  if (col.convCentro !== null) doc.text('CONVERSIÓN', col.convCentro, yTexto, { align: 'center' })
  doc.text('PRECIO', col.prec, yTexto, { align: 'right' })
  doc.text('TOTAL', col.total, yTexto, { align: 'right' })

  return y + ALTO
}

function pie(doc: Doc, d: DatosDocumento, pagina: number, de: number) {
  doc.setDrawColor('#d6d3d1').setLineWidth(0.3)
  doc.line(IZQ, PIE - 9, DER, PIE - 9)

  const legal =
    d.tipo === 'FACTURA' && d.empresa.imprenta
      ? `${PIES[d.tipo]} Imprenta: ${d.empresa.imprenta}.`
      : PIES[d.tipo]

  doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(7.4)
  const lineas = (doc.splitTextToSize(legal, ANCHO_UTIL - 34) as string[]).slice(0, 2)
  doc.text(lineas, IZQ, lineas.length > 1 ? PIE - 6.6 : PIE - 5)

  doc.setFont('helvetica', 'bold').setFontSize(7.6).setTextColor(ROTULO)
  doc.text(`Página ${pagina} de ${de}`, DER, PIE - 5, { align: 'right' })

  doc.setFont('helvetica', 'normal').setFontSize(7.4).setTextColor(GRIS)
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
  doc.setTextColor('#DE3B40').setFont('helvetica', 'bold').setFontSize(68)
  doc.text(texto, CENTRO, 165, { align: 'center', angle: 28 })
  doc.restoreGraphicsState()
}

const mencionaImpuestos = (d: DatosDocumento) => d.tipo !== 'NOTA'

const lineaDeIva = (d: DatosDocumento) =>
  d.tipo === 'FACTURA' || (d.tipo === 'COTIZACION' && Number(d.alicuotaIva) > 0)

const lineaDeIgtf = (d: DatosDocumento) => mencionaImpuestos(d) && Number(d.igtf ?? 0) > 0

function altoTotales(d: DatosDocumento): number {
  if (!mencionaImpuestos(d)) {
    return 14.5 + (d.pagoCombinado ? 6 : 0) + (d.cuentaPorCobrar ? 6.5 : 0)
  }
  const filas =
    1 + // subtotal
    (lineaDeIva(d) ? 1 : 0) +
    (lineaDeIgtf(d) ? 1 : 0) +
    (Number(d.descuento) > 0 ? 1 : 0) +
    (Number(d.flete) > 0 ? 1 : 0) +
    (Number(d.retencionIva ?? 0) > 0 ? 2 : 0)
  return filas * 5.8 + 22
}

/**
 * Tarjeta de totales a la derecha: Subtotal + IVA directo, banda de TOTAL
 * resaltada y barra inferior con la equivalencia cambiaria.
 */
function totales(doc: Doc, d: DatosDocumento, y: number): number {
  const rotulo = ROTULOS[d.tipo]
  const x = IZQ + 98
  const ancho = DER - x
  const yInicio = y

  if (!mencionaImpuestos(d)) {
    const altoCaja =
      11.5 + (d.pagoCombinado ? 6 : 0) + (d.cuentaPorCobrar ? 6.5 : 0)
    doc.setFillColor('#faf8f6')
    doc.setDrawColor(rotulo.color).setLineWidth(0.45)
    doc.roundedRect(x, yInicio, ancho, altoCaja, 1.2, 1.2, 'FD')

    doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(rotulo.color)
    doc.text('TOTAL', x + 4.5, yInicio + 7.4)
    doc.setFontSize(12.2).setTextColor('#111111')
    doc.text(conSimbolo(d.moneda, d.total), DER - 4.5, yInicio + 7.4, { align: 'right' })

    let yCursor = yInicio + 10

    if (d.pagoCombinado) {
      doc.setDrawColor(HAIRLINE).setLineWidth(0.25)
      doc.line(x + 3.5, yCursor, DER - 3.5, yCursor)
      doc.setFont('helvetica', 'normal').setFontSize(8.2).setTextColor(GRIS)
      doc.text('Pago combinado', x + 4.5, yCursor + 4.8)
      doc.setFont('helvetica', 'bold').setTextColor(TINTA)
      doc.text(
        `${conSimbolo('USD', d.pagoCombinado.usd)} + ${conSimbolo('VES', d.pagoCombinado.bs)}`,
        DER - 4.5,
        yCursor + 4.8,
        { align: 'right' },
      )
      yCursor += 6
    }

    if (d.cuentaPorCobrar) {
      doc.setDrawColor(HAIRLINE).setLineWidth(0.25)
      doc.line(x + 3.5, yCursor, DER - 3.5, yCursor)

      const esVencida = d.cuentaPorCobrar.estado === 'VENCIDA'
      const esCobrada = d.cuentaPorCobrar.estado === 'COBRADA'
      const colorEstado = esCobrada ? '#166534' : esVencida ? '#991b1b' : '#92400e'
      const fondoPastilla = esCobrada ? '#dcfce7' : esVencida ? '#fee2e2' : '#fef3c7'
      const fTexto = esCobrada
        ? d.cuentaPorCobrar.cobradaEn
          ? `Cobrada · ${fechaCorta(d.cuentaPorCobrar.cobradaEn)}`
          : 'Cobrada'
        : esVencida
          ? `Vencida · ${d.cuentaPorCobrar.fechaPago ? fechaCorta(d.cuentaPorCobrar.fechaPago) : '—'}`
          : `Por cobrar · ${d.cuentaPorCobrar.fechaPago ? fechaCorta(d.cuentaPorCobrar.fechaPago) : '—'}`

      doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(GRIS)
      doc.text('Cuenta por cobrar', x + 4.5, yCursor + 4.8)

      doc.setFont('helvetica', 'bold').setFontSize(7.6)
      const wPast = doc.getTextWidth(fTexto) + 4.4
      doc.setFillColor(fondoPastilla)
      doc.roundedRect(DER - 4.5 - wPast, yCursor + 1.3, wPast, 4.6, 0.9, 0.9, 'F')
      doc.setTextColor(colorEstado)
      doc.text(fTexto, DER - 4.5 - wPast / 2, yCursor + 4.6, { align: 'center' })
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

  const ALTO_FILA = 5.6
  const altoSuperiores = filasSuperiores.length * ALTO_FILA + 3.6
  const ALTO_BANDA_TOTAL = 9.8
  const tieneRetencion = Number(d.retencionIva ?? 0) > 0
  const altoRetencion = tieneRetencion ? 12 : 0
  const ALTO_BANDA_EQ = 6.8
  const altoTotalCaja = altoSuperiores + ALTO_BANDA_TOTAL + altoRetencion + ALTO_BANDA_EQ

  // Contenedor blanco general
  doc.setFillColor('#ffffff')
  doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
  doc.roundedRect(x, yInicio, ancho, altoTotalCaja, 1.2, 1.2, 'FD')

  let cursor = yInicio + 5.4
  for (const [etq, val] of filasSuperiores) {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(GRIS)
    doc.text(etq, x + 4.5, cursor)
    doc.setFont('helvetica', 'bold').setTextColor(TINTA)
    doc.text(val, DER - 4.5, cursor, { align: 'right' })
    cursor += ALTO_FILA
  }

  // Banda de TOTAL destacada
  const yBandaTotal = yInicio + altoSuperiores
  doc.setFillColor(FILA_ALTERNA)
  doc.rect(x + 0.2, yBandaTotal, ancho - 0.4, ALTO_BANDA_TOTAL, 'F')
  doc.setDrawColor(rotulo.color).setLineWidth(0.55)
  doc.line(x, yBandaTotal, DER, yBandaTotal)

  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(rotulo.color)
  doc.text('TOTAL', x + 4.5, yBandaTotal + 6.6)
  doc.setFontSize(12.2).setTextColor('#111111')
  doc.text(conSimbolo(d.moneda, d.total), DER - 4.5, yBandaTotal + 6.6, { align: 'right' })

  let yDespuesTotal = yBandaTotal + ALTO_BANDA_TOTAL

  if (tieneRetencion) {
    doc.setDrawColor(HAIRLINE).setLineWidth(0.25)
    doc.line(x, yDespuesTotal, DER, yDespuesTotal)

    doc.setFont('helvetica', 'normal').setFontSize(8.6).setTextColor(GRIS)
    doc.text('Retención de IVA', x + 4.5, yDespuesTotal + 4.8)
    doc.setFont('helvetica', 'bold').setTextColor(MARCA)
    doc.text(`- ${conSimbolo(d.moneda, d.retencionIva)}`, DER - 4.5, yDespuesTotal + 4.8, {
      align: 'right',
    })

    doc.setFont('helvetica', 'bold').setFontSize(9.2).setTextColor(TINTA)
    doc.text('A pagar', x + 4.5, yDespuesTotal + 9.8)
    doc.text(
      conSimbolo(d.moneda, Number(d.total) - Number(d.retencionIva ?? 0)),
      DER - 4.5,
      yDespuesTotal + 9.8,
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

  doc.setFont('helvetica', 'normal').setFontSize(7.6).setTextColor('#f5f5f4')
  doc.text(`Tasa BCV: ${numero(tasaRef)} Bs/$`, x + 4.5, yDespuesTotal + 4.6)
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor('#ffffff')
  doc.text(otra, DER - 4.5, yDespuesTotal + 4.6, { align: 'right' })

  return yInicio + altoTotalCaja + 3
}

function firmas(doc: Doc, d: DatosDocumento, yCaja: number, altoCaja: number) {
  const izquierda = d.tipo === 'NOTA' ? 'Entregado por' : 'Por la empresa'
  const derecha = d.tipo === 'NOTA' ? 'Recibido conforme' : 'Aceptado por el cliente'
  const subIzq = 'Nombre, cédula, fecha y sello'
  const subDer = 'Nombre, cédula, fecha y firma'

  const SEPARA = 12
  const ancho = (ANCHO_UTIL - SEPARA) / 2
  const yLinea = yCaja + altoCaja - 9

  for (const [i, [texto, subtitulo]] of [
    [izquierda, subIzq],
    [derecha, subDer],
  ].entries()) {
    const x = IZQ + i * (ancho + SEPARA)
    doc.setFillColor('#faf8f6')
    doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
    doc.roundedRect(x, yCaja, ancho, altoCaja, 1.2, 1.2, 'FD')

    const margenLinea = ancho * 0.1
    doc.setDrawColor(TINTA).setLineWidth(0.4)
    doc.line(x + margenLinea, yLinea, x + ancho - margenLinea, yLinea)

    doc.setTextColor(ROTULO).setFont('helvetica', 'bold').setFontSize(8)
    doc.text(texto.toUpperCase(), x + ancho / 2, yLinea + 4.2, { align: 'center' })
    doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(7.2)
    doc.text(subtitulo, x + ancho / 2, yLinea + 7.4, { align: 'center' })
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
  let cursor = y

  if (lineasConversion.length > 0) {
    const altoCaja = 5.4 + lineasConversion.length * 4
    doc.setFillColor('#faf8f6')
    doc.setDrawColor(HAIRLINE).setLineWidth(0.25)
    doc.rect(IZQ, cursor, ANCHO_NOTAS, altoCaja, 'FD')
    doc.setFillColor(GRIS_SUAVE)
    doc.rect(IZQ, cursor, 1.4, altoCaja, 'F')

    lineasConversion.forEach((linea, idx) => {
      doc
        .setFont('helvetica', idx === 0 ? 'bold' : 'normal')
        .setFontSize(idx === 0 ? 8 : 7.5)
        .setTextColor(idx === 0 ? ROTULO : GRIS)
      doc.text(linea, IZQ + 4, cursor + 4.6 + idx * 4)
    })

    cursor += altoCaja + 3.5
  }

  if (lineasObservacion.length > 0) {
    const altoObs = 5 + lineasObservacion.length * 4
    doc.setFillColor('#faf8f6')
    doc.setDrawColor(HAIRLINE).setLineWidth(0.25)
    doc.rect(IZQ, cursor, ANCHO_NOTAS, altoObs, 'FD')
    doc.setFillColor(acento)
    doc.rect(IZQ, cursor, 1.4, altoObs, 'F')

    doc.setFont('helvetica', 'normal').setFontSize(7.6).setTextColor(TINTA)
    lineasObservacion.forEach((linea, idx) => {
      doc.text(linea, IZQ + 4, cursor + 4.5 + idx * 4)
    })

    cursor += altoObs
  }

  return cursor
}

function dibujarDocumento(doc: Doc, logo: string, d: DatosDocumento): void {
  const rotulo = ROTULOS[d.tipo]
  const col = d.renglones.some((r) => r.conversion) ? CON_CONVERSION : SIN_CONVERSION
  const esc = escalaParaRenglones(d.renglones.length)

  // Medir notas de conversión y observación antes de repartir las hojas
  doc.setFont('helvetica', 'normal').setFontSize(7.6)
  let lineasConversion: string[] = []
  if (col.convCentro !== null && d.notaConversion) {
    for (const parrafo of d.notaConversion.split('\n')) {
      const envueltas = doc.splitTextToSize(parrafo, ANCHO_NOTAS - 7) as string[]
      lineasConversion.push(...envueltas)
    }
    if (lineasConversion.length > 7) {
      lineasConversion = [
        ...lineasConversion.slice(0, 6),
        ajustar(doc, lineasConversion.slice(6).join(' '), ANCHO_NOTAS - 7),
      ]
    }
  }

  doc.setFont('helvetica', 'normal').setFontSize(7.6)
  let lineasObservacion: string[] = []
  if (d.observacion) {
    lineasObservacion = doc.splitTextToSize(
      `Observación: ${d.observacion}`,
      ANCHO_NOTAS - 7,
    ) as string[]
    if (lineasObservacion.length > 5) {
      lineasObservacion = [
        ...lineasObservacion.slice(0, 4),
        ajustar(doc, lineasObservacion.slice(4).join(' '), ANCHO_NOTAS - 7),
      ]
    }
  }

  const altoNotasIzq =
    (lineasConversion.length > 0 ? 5.4 + lineasConversion.length * 4 : 0) +
    (lineasConversion.length > 0 && lineasObservacion.length > 0 ? 3.5 : 0) +
    (lineasObservacion.length > 0 ? 5 + lineasObservacion.length * 4 : 0)
  const altoBloqueInferior = Math.max(altoTotales(d), altoNotasIzq)
  const cierre = altoBloqueInferior + esc.altoCajaFirmas + 14
  const topeTabla = ABAJO - 14

  const lineas = d.renglones.map((r) =>
    lineasDeDescripcion(doc, r.descripcion, col.descripcion, esc.tallaFila),
  )
  const altoDe = (i: number) => altoRenglon(lineas[i].length, d.renglones[i], esc)
  const sumaRenglones = d.renglones.reduce((acc, _, i) => acc + altoDe(i), 0)

  // Medir cuánto ocupa la primera página en su escala base para saber cuánto
  // espacio vertical libre hay cuando el documento cabe en una sola hoja.
  const mCliente = medirEncabezadoCliente(doc, d, esc)
  const altoMembreteBase = 37
  const altoUsadoBase =
    ARRIBA +
    altoMembreteBase +
    mCliente.altoTotal +
    6 +
    esc.altoCabeceraTabla +
    sumaRenglones +
    6 +
    altoBloqueInferior +
    10 +
    esc.altoCajaFirmas

  const cabeEnUnaHoja = ARRIBA + altoMembreteBase + mCliente.altoTotal + 6 + esc.altoCabeceraTabla + sumaRenglones + cierre <= ABAJO - 6
  const espacioLibre = cabeEnUnaHoja ? Math.max(0, ABAJO - 10 - altoUsadoBase) : 0

  // Repartimos el espacio libre de forma armónica entre las secciones y el cuerpo
  // de la tabla para que la hoja se vea proporcionada de arriba a abajo.
  const extraMembrete = Math.min(espacioLibre * 0.14, 7)
  const extraCliente = Math.min(espacioLibre * 0.14, 7)
  const extraPorFila =
    cabeEnUnaHoja && d.renglones.length > 0
      ? Math.min((espacioLibre * 0.22) / d.renglones.length, 4.5)
      : 0
  const extraCuerpoTabla = cabeEnUnaHoja
    ? Math.min(
        Math.max(0, espacioLibre - extraMembrete - extraCliente - extraPorFila * d.renglones.length) *
          0.48,
        42,
      )
    : 0
  const extraPostTabla = cabeEnUnaHoja ? Math.min(espacioLibre * 0.12, 7) : 0

  const yTrasMembrete = cabeceraEjecutiva(doc, logo, d, extraMembrete)
  const yPrimera = encabezadoCliente(doc, d, yTrasMembrete, esc, extraCliente)

  const altoFilaConExtra = (i: number) => altoDe(i) + extraPorFila

  const hojas: number[][] = []
  {
    let y = yPrimera + esc.altoCabeceraTabla
    let actual: number[] = []

    for (const i of d.renglones.keys()) {
      if (y + altoFilaConExtra(i) > topeTabla) {
        hojas.push(actual)
        actual = []
        y = ARRIBA + 14 + esc.altoCabeceraTabla
      }
      actual.push(i)
      y += altoFilaConExtra(i)
    }
    hojas.push(actual)

    if (y + extraCuerpoTabla + cierre > ABAJO) hojas.push([])
  }

  for (const [indice, posiciones] of hojas.entries()) {
    if (indice > 0) doc.addPage()

    let y: number

    if (indice === 0) {
      y = yPrimera
    } else {
      doc.setFillColor(rotulo.color)
      doc.rect(IZQ, ARRIBA, ANCHO_UTIL, 10.5, 'F')
      if (logo) doc.addImage(logo, 'PNG', IZQ + 3, ARRIBA + 1.2, 8, 8)
      doc.setTextColor('#FFFFFF').setFont('helvetica', 'bold').setFontSize(9)
      doc.text(`${rotulo.titulo} ${d.numero}`, IZQ + 14, ARRIBA + 6.8)
      doc.setFont('helvetica', 'normal').setFontSize(8)
      doc.text(ajustar(doc, d.contraparte.nombre, 75), DER - 3.5, ARRIBA + 6.8, { align: 'right' })
      y = ARRIBA + 14
    }

    const yInicioTabla = y
    y = cabeceraTabla(doc, y, col, rotulo, esc)

    for (const [k, i] of posiciones.entries()) {
      const r = d.renglones[i]
      const descripcion = lineas[i]
      const bajada = (descripcion.length - 1) * esc.lineaDeMas
      const alto = altoFilaConExtra(i)
      const offsetVertical = extraPorFila * 0.42
      const yTextoBase = y + esc.altoBaseFila * 0.58 + offsetVertical

      // Fondo de la fila
      doc.setFillColor(k % 2 === 1 ? FILA_ALTERNA : '#FFFFFF')
      doc.rect(IZQ, y, ANCHO_UTIL, alto, 'F')

      // Separadores verticales e inferior de la fila
      doc.setDrawColor(HAIRLINE).setLineWidth(0.25)
      for (const xDiv of col.divisores) {
        doc.line(xDiv, y, xDiv, y + alto)
      }
      doc.line(IZQ, y + alto, DER, y + alto)

      // Descripción en negrita
      doc.setTextColor('#1c1917').setFont('helvetica', 'bold').setFontSize(esc.tallaFila)
      descripcion.forEach((linea, j) =>
        doc.text(linea, IZQ + 3.5, yTextoBase + j * esc.lineaDeMas),
      )

      // Cantidad
      doc.setTextColor('#1c1917').setFont('helvetica', 'bold').setFontSize(esc.tallaFila)
      doc.text(numero(r.cantidad), col.cant, yTextoBase, { align: 'right' })

      // Unidad centrada en pastilla
      doc.setFont('helvetica', 'bold').setFontSize(esc.tallaFila - 1.2)
      const textoUnidad = r.unidad || '—'
      const anchoPastilla = Math.max(doc.getTextWidth(textoUnidad) + 4.4, 9)
      const altoPastilla = 5
      doc.setFillColor(k % 2 === 1 ? '#ebe5e0' : '#f3efeb')
      doc.roundedRect(
        col.unidCentro - anchoPastilla / 2,
        yTextoBase - 3.6,
        anchoPastilla,
        altoPastilla,
        0.9,
        0.9,
        'F',
      )
      doc.setTextColor(ROTULO)
      doc.text(textoUnidad, col.unidCentro, yTextoBase - 0.2, { align: 'center' })

      // Conversión centrada
      if (col.convCentro !== null) {
        doc
          .setFont('helvetica', 'bold')
          .setFontSize(esc.tallaFila - 0.3)
          .setTextColor(r.conversion ? ROTULO : GRIS)
        doc.text(r.conversion ?? '—', col.convCentro, yTextoBase, { align: 'center' })
      }

      // Precio unitario
      doc.setFont('helvetica', 'normal').setFontSize(esc.tallaFila).setTextColor(TINTA)
      doc.text(numero(r.precio_unitario), col.prec, yTextoBase, { align: 'right' })

      // Subtotal del renglón
      doc.setFont('helvetica', 'bold').setFontSize(esc.tallaFila).setTextColor('#111111')
      doc.text(numero(r.subtotal), col.total, yTextoBase, { align: 'right' })

      // Línea secundaria de detalle (con pequeña flecha en L compatible con WinAnsi)
      if (r.detalle) {
        const yDet = yTextoBase + bajada + esc.altoDetalle * 0.88
        doc.setDrawColor(GRIS_SUAVE).setLineWidth(0.3)
        doc.line(IZQ + 4, yDet - 2.1, IZQ + 4, yDet - 0.7)
        doc.line(IZQ + 4, yDet - 0.7, IZQ + 5.6, yDet - 0.7)

        doc.setTextColor(GRIS).setFont('helvetica', 'italic').setFontSize(esc.tallaDetalle)
        doc.text(ajustar(doc, r.detalle, col.descripcion - 5), IZQ + 6.6, yDet)
      }

      y += alto
    }

    // Si hay pocos renglones en hoja única, prolongamos el cuerpo de la tabla con
    // renglones de guía sutiles para darle porte de formato ejecutivo completo.
    if (indice === 0 && hojas.length === 1 && extraCuerpoTabla >= 9) {
      const altoGuia = 10.5
      const numGuias = Math.floor(extraCuerpoTabla / altoGuia)
      for (let g = 0; g < numGuias; g++) {
        const indiceVisual = posiciones.length + g
        const alto = g === numGuias - 1 ? extraCuerpoTabla - g * altoGuia : altoGuia
        doc.setFillColor(indiceVisual % 2 === 1 ? '#fcfbfa' : '#ffffff')
        doc.rect(IZQ, y, ANCHO_UTIL, alto, 'F')
        doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
        for (const xDiv of col.divisores) {
          doc.line(xDiv, y, xDiv, y + alto)
        }
        doc.line(IZQ, y + alto, DER, y + alto)
        y += alto
      }
    }

    // Borde exterior de la tabla y línea de cierre inferior en el acento del documento
    doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
    doc.line(IZQ, yInicioTabla, IZQ, y)
    doc.line(DER, yInicioTabla, DER, y)
    doc.setDrawColor(rotulo.acento).setLineWidth(0.55)
    doc.line(IZQ, y, DER, y)

    if (indice === hojas.length - 1) {
      const yBloque = y + 4.5 + extraPostTabla
      const finNotas = pintarNotasIzquierda(
        doc,
        yBloque,
        lineasConversion,
        lineasObservacion,
        rotulo.acento,
      )
      const finTotales = totales(doc, d, yBloque)
      const finBloque = Math.max(finNotas, finTotales)

      const topeFirmasMax = ABAJO - esc.altoCajaFirmas - 12
      const yCajaFirmas = Math.min(
        Math.max(finBloque + 8, topeFirmasMax),
        ABAJO - esc.altoCajaFirmas - 10,
      )
      firmas(doc, d, yCajaFirmas, esc.altoCajaFirmas)
    }

    if (d.sello) sello(doc, d.sello)

    pie(doc, d, indice + 1, hojas.length)
  }
}

export async function armarDocumento(d: DatosDocumento): Promise<PdfArmado> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  const logo = await logoComoImagen(600, false)

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
  const logo = await logoComoImagen(600, false)

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
