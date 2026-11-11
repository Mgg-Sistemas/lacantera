import { logoComoImagen } from '@/lib/ficha/logo'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { ajustar } from '@/lib/ficha/hoja'
import { dinero, documento } from '@/lib/formato'
import {
  FILA_ALTERNA,
  GRIS,
  HAIRLINE,
  MARCA,
  ROTULO,
  TINTA,
  fechaCorta,
  fechaLarga,
  type EmpresaPapel,
} from '@/lib/ficha/papel'
import { porcentaje } from '@/lib/antiguedadDeDeuda'
import {
  agruparCuentasPagadasPorCliente,
  diasDeMoraAlPagar,
  fechaCaracas,
  resumenDeCuentasPagadas,
  type NotaCobradaMinima,
} from '@/lib/cuentasPagadasDeNotas'

/*
  REPORTE EJECUTIVO DE CUENTAS POR COBRAR PAGADAS EN NOTAS DE ENTREGA (10/11/2026).

  Relación ejecutiva de las notas de entrega que fueron emitidas con condición
  de cobro pendiente y cuya cancelación ya fue confirmada (manualmente o por
  conciliación bancaria). Mantiene la identidad visual corporativa en formato
  A4 sin franja de «Alcance», y ofrece dos modalidades elegibles al generar el
  documento: «Resumen + detalle» y «Solo resumen».
*/

type Doc = InstanceType<typeof import('jspdf').jsPDF>

export interface DatosReporteCuentasPagadas {
  notas: NotaCobradaMinima[]
  conDetalle: boolean
  conLogo: boolean
  /** Rango de fechas de pago si se filtró el período (ej. «01/11/2026 — 10/11/2026»). */
  periodoTexto?: string
  nombreArchivo: string
  empresa: EmpresaPapel
  emitidoPor: string
  momento: Date
}

// ── Geometría A4 ejecutiva (16 mm de margen, 178 mm útiles)
const IZQ = 16
const DER = 194
const ANCHO = DER - IZQ
const ARRIBA = 16
const LIMITE = 266
const PIE = 281

const VERDE = '#15803d'
const AMBAR_BARRA = '#f59e0b'

interface Pastilla {
  fondo: string
  texto: string
  borde: string
}

const P_PAGADA: Pastilla = { fondo: '#dcfce7', texto: '#166534', borde: '#4ade80' }
const P_MORA: Pastilla = { fondo: '#fef3c7', texto: '#92400e', borde: '#f59e0b' }

const decimal1 = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Escribe en una sola línea reduciendo ligeramente el puntaje antes de truncar. */
function enUnaLinea(
  doc: Doc,
  texto: string,
  x: number,
  y: number,
  ancho: number,
  talla: number,
  estilo: 'bold' | 'normal',
  align: 'left' | 'right' | 'center' = 'left',
  minima = 5.6,
) {
  doc.setFont('helvetica', estilo)
  let t = talla
  while (t > minima) {
    doc.setFontSize(t)
    if (doc.getTextWidth(texto) <= ancho) break
    t -= 0.25
  }
  doc.setFontSize(t)
  doc.text(doc.getTextWidth(texto) <= ancho ? texto : ajustar(doc, texto, ancho), x, y, { align })
}

function pastilla(doc: Doc, texto: string, xDer: number, yBase: number, anchoMax: number, p: Pastilla, talla = 6.1) {
  doc.setFont('helvetica', 'bold')
  let t = talla
  while (t > 4.8) {
    doc.setFontSize(t)
    if (doc.getTextWidth(texto) + 3 <= anchoMax) break
    t -= 0.2
  }
  doc.setFontSize(t)
  const w = Math.min(anchoMax, doc.getTextWidth(texto) + 3)
  doc.setFillColor(p.fondo).setDrawColor(p.borde).setLineWidth(0.2)
  doc.roundedRect(xDer - w, yBase - 3.05, w, 4.2, 0.9, 0.9, 'FD')
  doc.setTextColor(p.texto)
  doc.text(ajustar(doc, texto, anchoMax - 2), xDer - w / 2, yBase, { align: 'center' })
}

/** Membrete institucional y tarjeta de control del reporte (sin barra de «Alcance»). */
function cabecera(doc: Doc, logo: string, d: DatosReporteCuentasPagadas, clientesCount: number): number {
  const y = ARRIBA
  const ANCHO_CAJA = 68
  const xCaja = DER - ANCHO_CAJA
  const LADO = 23
  if (logo) doc.addImage(logo, 'PNG', IZQ, y - 0.5, LADO, LADO)
  const X = logo ? IZQ + LADO + 4.5 : IZQ
  const ANCHO_NOMBRE = xCaja - X - 4

  const nombre = (d.empresa.razonSocial || '').toUpperCase()
  doc.setTextColor(MARCA)
  enUnaLinea(doc, nombre, X, y + 5, ANCHO_NOMBRE, 15, 'bold', 'left', 9.5)

  let bajo = y + 5
  if (d.empresa.actividad) {
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(ROTULO)
    doc.text(ajustar(doc, d.empresa.actividad.toUpperCase(), ANCHO_NOMBRE), X, y + 10)
    bajo = y + 10
  }
  const rif = `RIF: ${d.empresa.rif}`
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(TINTA)
  doc.text(rif, X, bajo + 4.8)
  if (d.empresa.contacto) {
    const xc = X + doc.getTextWidth(rif)
    doc.setFont('helvetica', 'normal').setTextColor(GRIS)
    doc.text(ajustar(doc, `  ·  ${d.empresa.contacto}`, Math.max(12, ANCHO_NOMBRE - (xc - X))), xc, bajo + 4.8)
  }
  bajo += 4.8
  if (d.empresa.domicilio) {
    doc.setFont('helvetica', 'normal').setFontSize(7.1).setTextColor(GRIS)
    const lineas = (doc.splitTextToSize(d.empresa.domicilio.toUpperCase(), ANCHO_NOMBRE) as string[]).slice(0, 2)
    doc.text(lineas, X, bajo + 4.2, { lineHeightFactor: 1.3 })
    bajo += 4.2 + (lineas.length - 1) * 3
  }
  bajo = Math.max(bajo, y + LADO - 1)

  const filas: Array<[string, string, boolean]> = [
    ['EMISIÓN', fechaLarga(d.momento), false],
    ['EMITIDO POR', d.emitidoPor || 'Sistema', false],
  ]
  if (d.periodoTexto) filas.push(['PERÍODO', d.periodoTexto, false])
  filas.push([
    'REGISTROS',
    `${plural(clientesCount, 'cliente', 'clientes')} · ${plural(d.notas.length, 'nota', 'notas')}`,
    true,
  ])

  const CAB = 6.8
  const FILA = 5.2
  const alto = CAB + filas.length * FILA + 2.2
  const yc = y - 0.5
  doc.setFillColor('#faf8f6').setDrawColor('#d6d3d1').setLineWidth(0.3)
  doc.roundedRect(xCaja, yc, ANCHO_CAJA, alto, 1.4, 1.4, 'FD')
  doc.setFillColor(MARCA).rect(xCaja, yc, ANCHO_CAJA, CAB, 'F')
  doc.setTextColor('#FFFFFF')
  enUnaLinea(doc, 'CUENTAS POR COBRAR PAGADAS', xCaja + ANCHO_CAJA / 2, yc + 4.7, ANCHO_CAJA - 4, 8, 'bold', 'center')

  let yf = yc + CAB + 4.1
  filas.forEach(([et, val, destacado], i) => {
    if (i > 0) {
      doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
      doc.line(xCaja + 3, yf - 3.6, DER - 3, yf - 3.6)
    }
    doc.setFont('helvetica', 'bold').setFontSize(6.7).setTextColor(GRIS)
    doc.text(`${et}:`, xCaja + 3, yf)
    doc.setTextColor(destacado ? MARCA : TINTA)
    enUnaLinea(doc, val, DER - 3, yf, ANCHO_CAJA - 26, destacado ? 7.6 : 7.2, 'bold', 'right')
    yf += FILA
  })

  const regla = Math.max(bajo + 3.5, yc + alto + 3)
  doc.setDrawColor(MARCA).setLineWidth(0.7).line(IZQ, regla, DER, regla)
  return regla + 4.5
}

/** Cabecera de continuación para las páginas 2 en adelante. */
function cabeceraCorta(doc: Doc, logo: string, d: DatosReporteCuentasPagadas): number {
  const LADO = 11
  if (logo) doc.addImage(logo, 'PNG', IZQ, ARRIBA - 1, LADO, LADO)
  const x = logo ? IZQ + LADO + 3.5 : IZQ
  doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(MARCA)
  doc.text('CUENTAS POR COBRAR PAGADAS', x, ARRIBA + 3.8)
  doc.setFont('helvetica', 'bold').setFontSize(7.4).setTextColor(ROTULO)
  doc.text(ajustar(doc, (d.empresa.razonSocial || '').toUpperCase(), 105), x, ARRIBA + 8)
  doc.setFont('helvetica', 'normal').setFontSize(7.4).setTextColor(GRIS)
  doc.text(`Emisión: ${fechaLarga(d.momento)}`, DER, ARRIBA + 6, { align: 'right' })
  const regla = ARRIBA + 11.5
  doc.setDrawColor(MARCA).setLineWidth(0.6).line(IZQ, regla, DER, regla)
  return regla + 5
}

function tituloSeccion(doc: Doc, y: number, titulo: string, sub: string | null, color = ROTULO): number {
  doc.setFillColor(color).rect(IZQ, y, 2.2, 5.2, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(ROTULO)
  const t = titulo.toUpperCase()
  doc.text(t, IZQ + 4.5, y + 4.1)
  if (sub) {
    const xs = IZQ + 4.5 + doc.getTextWidth(t) + 3
    doc.setFont('helvetica', 'normal').setFontSize(7.4).setTextColor(GRIS)
    doc.text(ajustar(doc, sub, DER - xs), xs, y + 4.1)
  }
  return y + 7.4
}

// ── Tabla consolidada por cliente (suma exacta: 178 mm)
const COL = {
  cliente: { x: IZQ, w: 56 },
  notas: { x: IZQ + 56, w: 15 },
  ultimoPago: { x: IZQ + 71, w: 23 },
  bs: { x: IZQ + 94, w: 28 },
  usd: { x: IZQ + 122, w: 22 },
  pct: { x: IZQ + 144, w: 19 },
  estado: { x: IZQ + 163, w: 15 },
}
const DIV_CLIENTES = [COL.notas.x, COL.ultimoPago.x, COL.bs.x, COL.usd.x, COL.pct.x, COL.estado.x]

function cabeceraTablaClientes(doc: Doc, y: number): number {
  const H = 7.6
  doc.setFillColor(MARCA).rect(IZQ, y, ANCHO, H, 'F')
  doc.setDrawColor('#b05646').setLineWidth(0.22)
  for (const x of DIV_CLIENTES) doc.line(x, y + 1.3, x, y + H - 1.3)
  const yt = y + 5
  doc.setFont('helvetica', 'bold').setFontSize(6.8).setTextColor('#FFFFFF')
  doc.text('CLIENTE / RIF', COL.cliente.x + 2, yt)
  doc.text('NOTAS', COL.notas.x + COL.notas.w / 2, yt, { align: 'center' })
  doc.text('ÚLTIMO PAGO', COL.ultimoPago.x + COL.ultimoPago.w / 2, yt, { align: 'center' })
  doc.text('TOTAL BS', COL.bs.x + COL.bs.w - 2, yt, { align: 'right' })
  doc.text('TOTAL $', COL.usd.x + COL.usd.w - 2, yt, { align: 'right' })
  doc.text('% TOTAL', COL.pct.x + 2, yt)
  doc.text('ESTADO', COL.estado.x + COL.estado.w - 1.5, yt, { align: 'right' })
  return y + H
}

// ── Tabla de detalle de notas pagadas (suma exacta: 178 mm)
const DET = {
  nota: { x: IZQ, w: 25 },
  emision: { x: IZQ + 25, w: 19 },
  vence: { x: IZQ + 44, w: 20 },
  pago: { x: IZQ + 64, w: 21 },
  cumplimiento: { x: IZQ + 85, w: 23 },
  orig: { x: IZQ + 108, w: 24 },
  bs: { x: IZQ + 132, w: 25 },
  usd: { x: IZQ + 157, w: 21 },
}

function cabeceraTablaDetalle(doc: Doc, y: number): number {
  const H = 6.4
  doc.setFillColor('#f1efed').rect(IZQ, y, ANCHO, H, 'F')
  doc.setDrawColor('#d6d3d1').setLineWidth(0.2).line(IZQ, y + H, DER, y + H)
  const yt = y + 4.3
  doc.setTextColor(TINTA)
  enUnaLinea(doc, 'NOTA', DET.nota.x + 2, yt, DET.nota.w - 3, 6.3, 'bold')
  enUnaLinea(doc, 'EMISIÓN', DET.emision.x + DET.emision.w / 2, yt, DET.emision.w - 2, 6.3, 'bold', 'center')
  enUnaLinea(doc, 'VENCIMIENTO', DET.vence.x + DET.vence.w / 2, yt, DET.vence.w - 2, 6.3, 'bold', 'center')
  enUnaLinea(doc, 'FECHA DE PAGO', DET.pago.x + DET.pago.w / 2, yt, DET.pago.w - 2, 6.3, 'bold', 'center')
  enUnaLinea(doc, 'CUMPLIMIENTO', DET.cumplimiento.x + DET.cumplimiento.w / 2, yt, DET.cumplimiento.w - 2, 6.3, 'bold', 'center')
  enUnaLinea(doc, 'MONTO ORIGINAL', DET.orig.x + DET.orig.w - 2, yt, DET.orig.w - 3, 6.3, 'bold', 'right')
  enUnaLinea(doc, 'TOTAL BS', DET.bs.x + DET.bs.w - 2, yt, DET.bs.w - 3, 6.3, 'bold', 'right')
  enUnaLinea(doc, 'TOTAL $', DET.usd.x + DET.usd.w - 2, yt, DET.usd.w - 3, 6.3, 'bold', 'right')
  return y + H
}

export async function armarReporteCuentasPagadas(d: DatosReporteCuentasPagadas): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = d.conLogo ? await logoComoImagen(600, false) : ''
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const titulo = 'Cuentas por cobrar pagadas'

  const grupos = agruparCuentasPagadasPorCliente(d.notas)
  const r = resumenDeCuentasPagadas(d.notas)

  const nuevaHoja = () => {
    doc.addPage()
    return cabeceraCorta(doc, logo, d)
  }

  let y = cabecera(doc, logo, d, grupos.length)

  // ── Recuadro principal de total recaudado y cumplimiento de pago
  {
    const ALTO = 22
    doc.setFillColor('#faf8f6').setDrawColor(MARCA).setLineWidth(0.6)
    doc.roundedRect(IZQ, y, ANCHO, ALTO, 1.2, 1.2, 'FD')
    const xSep = DER - 60
    doc.setDrawColor('#d6d3d1').setLineWidth(0.3).line(xSep, y + 3, xSep, y + ALTO - 3)

    doc.setFont('helvetica', 'bold').setFontSize(7.6).setTextColor(ROTULO)
    doc.text('TOTAL RECAUDADO EN NOTAS DE ENTREGA', IZQ + 4, y + 5.5)
    doc.setTextColor('#111111')
    enUnaLinea(doc, dinero('USD', r.usd), IZQ + 4, y + 13.5, xSep - IZQ - 8, 18, 'bold')
    doc.setFont('helvetica', 'normal').setFontSize(7.6).setTextColor(GRIS)
    doc.text(`Equivalente en bolívares: ${dinero('VES', r.bs)}`, IZQ + 4, y + 18.5)

    doc.setFont('helvetica', 'bold').setFontSize(7.4).setTextColor(VERDE)
    doc.text('CUMPLIMIENTO DE PAGO', DER - 4, y + 5.5, { align: 'right' })
    doc.setTextColor('#111111')
    enUnaLinea(doc, `${decimal1.format(r.pctEnPlazo)} % en plazo`, DER - 4, y + 13, 52, 13.5, 'bold', 'right')
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(GRIS)
    doc.text(
      ajustar(doc, `${r.enPlazoCount} en vencimiento · ${r.conMoraCount} con mora`, 54),
      DER - 4,
      y + 18.5,
      { align: 'right' },
    )
    y += ALTO + 4
  }

  // ── Tres tarjetas ejecutivas
  {
    const GAP = 4
    const w = (ANCHO - GAP * 2) / 3
    const H = 25
    const mayor = grupos[0]

    const tarjeta = (i: number, acento: string, tituloT: string) => {
      const x = IZQ + i * (w + GAP)
      doc.setFillColor('#ffffff').setDrawColor('#d6d3d1').setLineWidth(0.28)
      doc.roundedRect(x, y, w, H, 1.3, 1.3, 'FD')
      doc.setFillColor(acento).rect(x, y, 2, H, 'F')
      doc.setTextColor(acento)
      enUnaLinea(doc, tituloT, x + 4.5, y + 4.8, w - 6.5, 6.7, 'bold')
      return x + 4.5
    }

    // 1. Clientes con cuentas liquidadas
    let x = tarjeta(0, ROTULO, 'CLIENTES CON CUENTAS LIQUIDADAS')
    doc.setTextColor('#1c1917')
    enUnaLinea(doc, plural(grupos.length, 'cliente', 'clientes'), x, y + 11.5, w - 7, 11, 'bold', 'left', 8)
    doc.setFont('helvetica', 'bold').setFontSize(6.9).setTextColor(TINTA)
    doc.text(ajustar(doc, plural(d.notas.length, 'nota de entrega pagada', 'notas de entrega pagadas'), w - 7), x, y + 16.5)
    if (mayor) {
      doc.setFont('helvetica', 'normal').setFontSize(6.6).setTextColor(GRIS)
      doc.text(
        ajustar(doc, `Mayor recaudación: ${decimal1.format(porcentaje(mayor.usd, r.usd))} % del total`, w - 7),
        x,
        y + 21,
      )
    }

    // 2. Oportunidad de recaudación
    x = tarjeta(1, VERDE, 'OPORTUNIDAD DE RECAUDACIÓN')
    doc.setTextColor('#1c1917')
    enUnaLinea(doc, `${r.enPlazoCount} en plazo · ${r.conMoraCount} con mora`, x, y + 11.5, w - 7, 10.5, 'bold', 'left', 7.5)
    const anchoBarra = w - 8
    doc.setFillColor('#e7e5e4').rect(x, y + 14.2, anchoBarra, 2, 'F')
    const frEnPlazo = d.notas.length > 0 ? r.enPlazoCount / d.notas.length : 0
    if (frEnPlazo > 0) doc.setFillColor(VERDE).rect(x, y + 14.2, anchoBarra * frEnPlazo, 2, 'F')
    if (frEnPlazo < 1 && d.notas.length > 0) {
      doc.setFillColor(AMBAR_BARRA).rect(x + anchoBarra * frEnPlazo, y + 14.2, anchoBarra * (1 - frEnPlazo), 2, 'F')
    }
    doc.setTextColor(GRIS)
    enUnaLinea(
      doc,
      `${dinero('USD', r.enPlazoUsd)} en plazo · ${dinero('USD', r.conMoraUsd)} mora`,
      x,
      y + 21,
      w - 7,
      6.5,
      'normal',
      'left',
      5.5,
    )

    // 3. Moneda de emisión original
    x = tarjeta(2, MARCA, 'MONEDA DE EMISIÓN ORIGINAL')
    const xDer = x + w - 8
    doc.setFont('helvetica', 'normal').setFontSize(6.6).setTextColor(TINTA)
    doc.text(`Emitidas en USD (${r.usdEmitidasCount})`, x, y + 10.3)
    doc.setTextColor('#1c1917')
    enUnaLinea(doc, dinero('USD', r.usdEmitidasMonto), xDer, y + 10.3, 24, 6.7, 'bold', 'right')

    doc.setFont('helvetica', 'normal').setFontSize(6.6).setTextColor(TINTA)
    doc.text(`Emitidas en VES (${r.vesEmitidasCount})`, x, y + 15.1)
    doc.setTextColor('#1c1917')
    enUnaLinea(doc, dinero('VES', r.vesEmitidasMonto), xDer, y + 15.1, 26, 6.7, 'bold', 'right')

    doc.setDrawColor(HAIRLINE).setLineWidth(0.2).line(x, y + 17.4, xDer, y + 17.4)
    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(GRIS)
    const etEquiv =
      r.otrasEmitidasCount > 0 ? `Equiv. VES + otras (${r.otrasEmitidasCount})` : 'Equiv. VES en USD'
    doc.text(ajustar(doc, etEquiv, w - 31), x, y + 21.1)
    enUnaLinea(doc, dinero('USD', r.vesEmitidasEquivUsd + r.otrasEmitidasEquivUsd), xDer, y + 21.1, 24, 6.6, 'bold', 'right')

    y += H + 6
  }

  // ── Tabla consolidada por cliente
  y = tituloSeccion(doc, y, 'Recaudación por cliente', 'Ordenado de mayor a menor monto pagado')
  let yInicio = y
  y = cabeceraTablaClientes(doc, y)
  const cerrarTabla = (yFin: number, color = MARCA) => {
    doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
    doc.line(IZQ, yInicio, IZQ, yFin)
    doc.line(DER, yInicio, DER, yFin)
    doc.setDrawColor(color).setLineWidth(0.5).line(IZQ, yFin, DER, yFin)
  }

  grupos.forEach((c, i) => {
    const H = 9
    if (y + H > LIMITE) {
      cerrarTabla(y)
      y = nuevaHoja()
      yInicio = y
      y = cabeceraTablaClientes(doc, y)
    }
    doc.setFillColor(i % 2 === 1 ? FILA_ALTERNA : '#ffffff').rect(IZQ, y, ANCHO, H, 'F')
    doc.setDrawColor(HAIRLINE).setLineWidth(0.22)
    for (const x of DIV_CLIENTES) doc.line(x, y, x, y + H)
    doc.line(IZQ, y + H, DER, y + H)

    const yb = y + 4
    doc.setTextColor('#1c1917')
    enUnaLinea(doc, c.cliente, COL.cliente.x + 2, yb, COL.cliente.w - 4, 7.5, 'bold')
    if (c.rif) {
      doc.setFont('helvetica', 'normal').setFontSize(6.3).setTextColor(GRIS)
      doc.text(documento(c.rif), COL.cliente.x + 2, yb + 3.3)
    }

    doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(TINTA)
    doc.text(String(c.notas.length), COL.notas.x + COL.notas.w / 2, yb + (c.rif ? 1.2 : 0), { align: 'center' })

    doc.setFont('helvetica', 'normal').setFontSize(7.1).setTextColor(c.ultimoPago ? TINTA : GRIS)
    doc.text(c.ultimoPago ? fechaCorta(c.ultimoPago) : '—', COL.ultimoPago.x + COL.ultimoPago.w / 2, yb + 1.2, {
      align: 'center',
    })

    doc.setTextColor(TINTA)
    enUnaLinea(doc, dinero('VES', c.bs), COL.bs.x + COL.bs.w - 2, yb + 1.2, COL.bs.w - 3.5, 7.2, 'normal', 'right')
    doc.setTextColor('#1c1917')
    enUnaLinea(doc, dinero('USD', c.usd), COL.usd.x + COL.usd.w - 2, yb + 1.2, COL.usd.w - 3.5, 7.6, 'bold', 'right')

    const pct = porcentaje(c.usd, r.usd)
    const anchoB = COL.pct.w - 4
    doc.setFillColor('#e7e5e4').rect(COL.pct.x + 2, yb - 2.2, anchoB, 1.8, 'F')
    if (pct > 0) doc.setFillColor(VERDE).rect(COL.pct.x + 2, yb - 2.2, Math.max(0.6, (anchoB * pct) / 100), 1.8, 'F')
    doc.setFont('helvetica', 'normal').setFontSize(6.3).setTextColor(GRIS)
    doc.text(`${decimal1.format(pct)} %`, COL.pct.x + 2, yb + 3.3)

    pastilla(doc, 'Pagada', COL.estado.x + COL.estado.w - 1.3, yb + 1.2, COL.estado.w - 2.2, P_PAGADA, 5.9)
    y += H
  })
  cerrarTabla(y)

  // ── Banda de cierre de totales y nota técnica BCV
  {
    const H = 8.2
    if (y + H + 8 > LIMITE) y = nuevaHoja()
    doc.setFillColor('#faf8f6').setDrawColor(MARCA).setLineWidth(0.4).rect(IZQ, y, ANCHO, H, 'FD')
    const yf = y + 5.2
    doc.setFont('helvetica', 'bold').setFontSize(7.8).setTextColor(MARCA)
    doc.text(
      ajustar(doc, `TOTAL RECAUDADO (${plural(grupos.length, 'CLIENTE', 'CLIENTES')} · ${plural(d.notas.length, 'NOTA', 'NOTAS')})`, 102),
      IZQ + 3.5,
      yf,
    )
    doc.setTextColor('#111111')
    enUnaLinea(doc, `${dinero('VES', r.bs)}   ·   ${dinero('USD', r.usd)}`, DER - 3.5, yf, 70, 7.8, 'bold', 'right')
    y += H + 3.5

    doc.setFont('helvetica', 'italic').setFontSize(6.8).setTextColor(GRIS)
    const notaPie = doc.splitTextToSize(
      'Montos en Bs y $ calculados con la tasa BCV vigente a la fecha de emisión de cada nota. Incluye las notas de entrega registradas con condición de cobro pendiente cuya cancelación fue confirmada.',
      ANCHO,
    ) as string[]
    doc.text(notaPie, IZQ, y + 1, { lineHeightFactor: 1.3 })
    y += 2 + notaPie.length * 3.1
  }

  // ── Detalle opcional de notas pagadas por cliente
  if (d.conDetalle && grupos.length > 0) {
    if (y + 38 > LIMITE) y = nuevaHoja()
    else y += 2
    y = tituloSeccion(
      doc,
      y,
      'Detalle de notas pagadas por cliente',
      'Comparativa entre fecha de vencimiento acordada y fecha efectiva de pago',
      VERDE,
    )

    for (const c of grupos) {
      // Evita dejar huérfana la franja del cliente al pie de página
      if (y + 7 + 6.4 + 7 * Math.min(2, c.notas.length) > LIMITE) y = nuevaHoja()
      const franja = (yy: number, sigue: boolean) => {
        doc.setFillColor(ROTULO).roundedRect(IZQ, yy, ANCHO, 7, 0.8, 0.8, 'F')
        doc.setTextColor('#FFFFFF')
        const izq = `${c.cliente}${c.rif ? ` · ${documento(c.rif)}` : ''}${sigue ? ' (continúa)' : ''}`
        const der = `${plural(c.notas.length, 'nota', 'notas')} · ${dinero('VES', c.bs)} · ${dinero('USD', c.usd)}`
        doc.setFont('helvetica', 'bold').setFontSize(7.4)
        const anchoDer = doc.getTextWidth(der)
        enUnaLinea(doc, izq, IZQ + 3, yy + 4.8, ANCHO - anchoDer - 10, 7.6, 'bold')
        doc.setFont('helvetica', 'bold').setFontSize(7.4).setTextColor('#FFFFFF')
        doc.text(der, DER - 3, yy + 4.8, { align: 'right' })
        return cabeceraTablaDetalle(doc, yy + 7)
      }
      y = franja(y, false)
      let yInicioDet = y - 6.4

      c.notas.forEach((n, i) => {
        const H = 7
        if (y + H > LIMITE) {
          doc.setDrawColor(HAIRLINE).setLineWidth(0.25)
          doc.line(IZQ, yInicioDet, IZQ, y)
          doc.line(DER, yInicioDet, DER, y)
          doc.setDrawColor(ROTULO).setLineWidth(0.45).line(IZQ, y, DER, y)
          y = nuevaHoja()
          y = franja(y, true)
          yInicioDet = y - 6.4
        }
        doc.setFillColor(i % 2 === 1 ? FILA_ALTERNA : '#ffffff').rect(IZQ, y, ANCHO, H, 'F')
        doc.setDrawColor(HAIRLINE).setLineWidth(0.2).line(IZQ, y + H, DER, y + H)
        const yb = y + 4.6

        doc.setTextColor('#1c1917')
        enUnaLinea(doc, n.numero, DET.nota.x + 2, yb, DET.nota.w - 3, 7.2, 'bold')

        doc.setFont('helvetica', 'normal').setFontSize(6.9).setTextColor(TINTA)
        doc.text(fechaCorta(n.fecha), DET.emision.x + DET.emision.w / 2, yb, { align: 'center' })
        doc.text(n.fecha_pago ? fechaCorta(n.fecha_pago) : '—', DET.vence.x + DET.vence.w / 2, yb, { align: 'center' })

        const diaPago = fechaCaracas(n.cobrada_en)
        doc.setFont('helvetica', 'bold').setFontSize(6.9).setTextColor('#1c1917')
        doc.text(diaPago ? fechaCorta(diaPago) : '—', DET.pago.x + DET.pago.w / 2, yb, { align: 'center' })

        const mora = diasDeMoraAlPagar(n.fecha_pago, n.cobrada_en)
        const textoCumpl = mora > 0 ? `${plural(mora, 'día', 'días')} de mora` : 'En plazo'
        const estiloCumpl = mora > 0 ? P_MORA : P_PAGADA
        doc.setFont('helvetica', 'bold').setFontSize(5.9)
        const wp = Math.min(DET.cumplimiento.w - 2.5, doc.getTextWidth(textoCumpl) + 3)
        pastilla(
          doc,
          textoCumpl,
          DET.cumplimiento.x + DET.cumplimiento.w / 2 + wp / 2,
          yb,
          DET.cumplimiento.w - 2.5,
          estiloCumpl,
          5.9,
        )

        doc.setTextColor(TINTA)
        enUnaLinea(doc, dinero(n.moneda, n.total), DET.orig.x + DET.orig.w - 2, yb, DET.orig.w - 3, 6.9, 'normal', 'right')
        enUnaLinea(doc, dinero('VES', n.total_bs ?? 0), DET.bs.x + DET.bs.w - 2, yb, DET.bs.w - 3, 6.9, 'normal', 'right')
        doc.setTextColor('#1c1917')
        enUnaLinea(doc, dinero('USD', n.total_usd ?? 0), DET.usd.x + DET.usd.w - 2, yb, DET.usd.w - 3, 7.2, 'bold', 'right')

        y += H
      })

      doc.setDrawColor(HAIRLINE).setLineWidth(0.25)
      doc.line(IZQ, yInicioDet, IZQ, y)
      doc.line(DER, yInicioDet, DER, y)
      doc.setDrawColor(ROTULO).setLineWidth(0.45).line(IZQ, y, DER, y)
      y += 5
    }
  }

  // ── Pie institucional en todas las hojas
  const paginas = doc.getNumberOfPages()
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p)
    doc.setDrawColor('#d6d3d1').setLineWidth(0.3).line(IZQ, PIE - 5.5, DER, PIE - 5.5)
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(GRIS)
    doc.text(
      ajustar(doc, `Documento generado por el sistema · ${titulo} · Emitido por ${d.emitidoPor || 'Sistema'}`, ANCHO - 30),
      IZQ,
      PIE - 1,
    )
    doc.setFont('helvetica', 'bold').setFontSize(7.4).setTextColor(ROTULO)
    doc.text(`Página ${p} de ${paginas}`, DER, PIE - 1, { align: 'right' })
  }

  doc.setProperties({ title: titulo })
  return { blob: doc.output('blob'), nombre: d.nombreArchivo }
}
