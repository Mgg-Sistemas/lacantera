/*
  COMPROBANTE DE RETENCIÓN (Providencia SNAT/2026/00093, Art. 18 · 23/11/2026).

  Lo emite el agente de retención de IVA o ISLR. Lleva, como mínimo:
   1. Numeración de 14 caracteres AAAAMMSSSSSSSS.
   2. Nombre o razón social, RIF y domicilio fiscal del agente de retención.
   3. Fecha de emisión y entrega.
   4. Nombre o razón social, RIF, domicilio fiscal y correo del proveedor.
   5. Número de control de la factura o nota de débito.
   6. Número de la factura o nota de débito.
   7. Período de imposición.
   8. Monto total, base imponible, impuesto causado e impuesto retenido.
   9. Los datos de la imprenta digital, cuando aplique (no aplica: lo emite el sistema).
*/
import type { EmpresaPapel } from './papel'
import type { PdfArmado } from './reciboPdf'
import { logoComoImagen } from './logo'
import { ajustar } from './hoja'
import { MARCA, ROTULO, TINTA, GRIS, HAIRLINE } from './papel'
import { LEYENDA_PROVIDENCIA, fechaFiscal } from '@/lib/fiscal/providencia'

export interface DatosComprobanteRetencion {
  numero: string
  tipo: 'IVA' | 'ISLR'
  fechaEmision: string
  periodo: string
  empresa: EmpresaPapel & { domicilioFiscal?: string | null }
  proveedor: { nombre: string; rif: string; domicilio?: string | null; correo?: string | null }
  factura: {
    numero: string
    control: string | null
    fecha: string
    moneda: string
    tasa: number
    total: number
    base: number
    exento: number
    alicuota: number
    iva: number
  }
  retenido: number
  porcentaje?: number | null
  emitidoPor: string
}

const IZQ = 16
const DER = 194
const ANCHO = DER - IZQ

const fmt = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const n2 = (v: number) => fmt.format(v)

export async function armarComprobanteRetencion(d: DatosComprobanteRetencion): Promise<PdfArmado> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const logo = await logoComoImagen(600, false)

  // Membrete
  let y = 16
  if (logo) doc.addImage(logo, 'PNG', IZQ, y - 1, 22, 22)
  const xt = logo ? IZQ + 26 : IZQ
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(MARCA)
  doc.text(ajustar(doc, d.empresa.razonSocial.toUpperCase(), 100), xt, y + 5)
  doc.setFontSize(8.2).setTextColor(ROTULO)
  if (d.empresa.actividad) doc.text(d.empresa.actividad.toUpperCase(), xt, y + 10)
  doc.setTextColor(TINTA).text(`RIF: ${d.empresa.rif}`, xt, y + 14.6)
  doc.setFont('helvetica', 'normal').setFontSize(7.4).setTextColor(GRIS)
  const dom = (d.empresa.domicilioFiscal || d.empresa.domicilio || '').toUpperCase()
  if (dom) doc.text((doc.splitTextToSize(dom, 100) as string[]).slice(0, 2), xt, y + 18.6)

  // Tarjeta del número
  const xc = DER - 62
  doc.setFillColor('#faf8f6').setDrawColor('#d6d3d1').setLineWidth(0.3)
  doc.roundedRect(xc, y - 1, 62, 30, 1.4, 1.4, 'FD')
  doc.setFillColor(MARCA).rect(xc, y - 1, 62, 7, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(8.4).setTextColor('#FFFFFF')
  doc.text(`COMPROBANTE DE RETENCIÓN ${d.tipo}`, xc + 31, y + 3.8, { align: 'center' })
  const filaTarjeta = (et: string, v: string, yy: number, destacado = false) => {
    doc.setFont('helvetica', 'bold').setFontSize(7.2).setTextColor(GRIS).text(`${et}:`, xc + 3, yy)
    doc.setFontSize(destacado ? 9.6 : 8.4).setTextColor(destacado ? MARCA : TINTA)
    doc.text(v, DER - 3, yy, { align: 'right' })
  }
  filaTarjeta('N°', d.numero, y + 11.5, true)
  filaTarjeta('EMISIÓN', fechaFiscal(d.fechaEmision), y + 17)
  filaTarjeta('PERÍODO', `${d.periodo.slice(0, 4)}-${d.periodo.slice(4, 6)}`, y + 22.5)

  y += 34
  doc.setDrawColor(MARCA).setLineWidth(0.75).line(IZQ, y, DER, y)
  y += 6

  // Agente y proveedor
  const bloque = (titulo: string, filas: [string, string][], x: number, ancho: number, yy: number) => {
    doc.setFillColor('#fbf9f7').setDrawColor(HAIRLINE).setLineWidth(0.3)
    const alto = 8 + filas.length * 5.4
    doc.rect(x, yy, ancho, alto, 'FD')
    doc.setFillColor(ROTULO).rect(x, yy, 1.6, alto, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(7.6).setTextColor(ROTULO).text(titulo, x + 4, yy + 5)
    filas.forEach(([k, v], i) => {
      const fy = yy + 10.4 + i * 5.4
      doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(GRIS).text(k, x + 4, fy)
      doc.setFont('helvetica', 'bold').setFontSize(8.2).setTextColor(TINTA)
      doc.text(ajustar(doc, v || '—', ancho - 30), x + 26, fy)
    })
    return alto
  }
  const anchoMitad = (ANCHO - 4) / 2
  const a1 = bloque(
    'AGENTE DE RETENCIÓN',
    [
      ['Razón social', d.empresa.razonSocial],
      ['RIF', d.empresa.rif],
      ['Domicilio', d.empresa.domicilioFiscal || d.empresa.domicilio || ''],
    ],
    IZQ,
    anchoMitad,
    y,
  )
  const a2 = bloque(
    'SUJETO RETENIDO (PROVEEDOR)',
    [
      ['Razón social', d.proveedor.nombre],
      ['RIF', d.proveedor.rif],
      ['Domicilio', d.proveedor.domicilio ?? ''],
      ['Correo', d.proveedor.correo ?? ''],
    ],
    IZQ + anchoMitad + 4,
    anchoMitad,
    y,
  )
  y += Math.max(a1, a2) + 7

  // Tabla del documento
  const cols = [
    { t: 'Fecha', w: 20, al: 'left' as const },
    { t: 'N° factura', w: 24, al: 'left' as const },
    { t: 'N° control', w: 26, al: 'left' as const },
    { t: 'Total', w: 24, al: 'right' as const },
    { t: 'Exento', w: 20, al: 'right' as const },
    { t: 'Base imponible', w: 24, al: 'right' as const },
    { t: d.tipo === 'IVA' ? `IVA ${n2(d.factura.alicuota)}%` : 'Impuesto', w: 20, al: 'right' as const },
    { t: 'Retenido', w: 20, al: 'right' as const },
  ]
  doc.setFillColor(MARCA).rect(IZQ, y, ANCHO, 8, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(7.2).setTextColor('#FFFFFF')
  let x = IZQ
  for (const c of cols) {
    doc.text(c.t.toUpperCase(), c.al === 'right' ? x + c.w - 2 : x + 2, y + 5.2, { align: c.al })
    x += c.w
  }
  y += 8
  const valores = [
    fechaFiscal(d.factura.fecha),
    d.factura.numero,
    d.factura.control ?? '—',
    n2(d.factura.total),
    n2(d.factura.exento),
    n2(d.factura.base),
    d.tipo === 'IVA' ? n2(d.factura.iva) : '—',
    n2(d.retenido),
  ]
  doc.setDrawColor(HAIRLINE).setLineWidth(0.25).rect(IZQ, y, ANCHO, 9)
  doc.setFont('helvetica', 'bold').setFontSize(8.2).setTextColor(TINTA)
  x = IZQ
  cols.forEach((c, i) => {
    doc.text(ajustar(doc, valores[i], c.w - 3), c.al === 'right' ? x + c.w - 2 : x + 2, y + 5.8, { align: c.al })
    x += c.w
  })
  y += 14

  // Totales
  const tasa = d.factura.tasa || 1
  doc.setFillColor('#faf6f4').setDrawColor(MARCA).setLineWidth(0.4)
  doc.roundedRect(DER - 86, y, 86, 22, 1.2, 1.2, 'FD')
  doc.setFont('helvetica', 'bold').setFontSize(7.6).setTextColor(GRIS)
  doc.text(`IMPUESTO RETENIDO (${d.factura.moneda})`, DER - 82, y + 6)
  doc.setFontSize(12).setTextColor(MARCA).text(n2(d.retenido), DER - 4, y + 7, { align: 'right' })
  doc.setFontSize(7.6).setTextColor(GRIS).text('EQUIVALENTE EN BS', DER - 82, y + 14)
  doc.setFontSize(9.6).setTextColor(TINTA).text(n2(d.retenido * tasa), DER - 4, y + 14.5, { align: 'right' })
  doc.setFont('helvetica', 'normal').setFontSize(6.8).setTextColor(GRIS)
  doc.text(`Tasa: ${n2(tasa)} Bs por ${d.factura.moneda}`, DER - 82, y + 19.4)
  if (d.porcentaje) {
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(TINTA)
    doc.text(`Porcentaje de retención: ${n2(d.porcentaje)} %`, IZQ, y + 6)
  }
  y += 34

  // Firmas
  const anchoF = (ANCHO - 20) / 2
  for (const [i, t] of ['Agente de retención · firma y sello', 'Recibido por el proveedor · fecha'].entries()) {
    const fx = IZQ + i * (anchoF + 20)
    doc.setDrawColor(TINTA).setLineWidth(0.3).line(fx, y + 16, fx + anchoF, y + 16)
    doc.setFont('helvetica', 'bold').setFontSize(7.6).setTextColor(GRIS).text(t, fx + anchoF / 2, y + 20.5, { align: 'center' })
  }

  // Pie
  doc.setDrawColor('#d6d3d1').setLineWidth(0.3).line(IZQ, 272, DER, 272)
  doc.setFont('helvetica', 'normal').setFontSize(7.2).setTextColor(GRIS)
  doc.text(
    `Comprobante de retención de ${d.tipo} · Art. 18 · Emitido por ${d.emitidoPor || '—'} · entregar al proveedor`,
    IZQ,
    277,
  )
  doc.setFont('helvetica', 'italic').setFontSize(6.6)
  doc.text(LEYENDA_PROVIDENCIA, (IZQ + DER) / 2, 285, { align: 'center' })

  doc.setProperties({ title: `Comprobante de retención ${d.tipo} ${d.numero}`, author: d.empresa.razonSocial })
  return { blob: doc.output('blob'), nombre: `comprobante-retencion-${d.tipo.toLowerCase()}-${d.numero}.pdf` }
}
