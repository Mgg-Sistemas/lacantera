import { logoComoImagen } from '@/lib/ficha/logo'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { cifra, documento, tasa as formatoTasa } from '@/lib/formato'
import { fechaLarga, MARCA, ROTULO, TINTA, GRIS, FILA_ALTERNA, HAIRLINE, type EmpresaPapel } from '@/lib/ficha/papel'
import { enAmbas, type AbonoPorPagar, type CuentaPorPagar } from '@/lib/api/porPagar'

/*
  CUENTAS PENDIENTES POR PAGAR, EN PDF (12/11/2026).

  El mismo papel que llevaban en Excel: logo y título arriba; ÍTEM, FACTURA /
  CONCEPTO, DESCRIPCIÓN, MONTO BS y MONTO $; y el MONTO TOTAL en las dos
  monedas. Hoja horizontal, como la hoja.

  Los montos son lo que FALTA por pagar (el saldo). El escrito en la moneda de
  la deuda va en negrita; el otro es su equivalente a la tasa BCV que se dice
  al pie, que es la de hoy. Si una cuenta tiene abonos, debajo del concepto se
  anota cuánto y cuándo («abonó $960,00 el 21/10/2026»), como la nota que
  escribían a mano en la hoja.

  Las pagadas, si se piden, van en verde —como en la hoja— y NO suman al
  total. Las anuladas no salen nunca.
*/

type Doc = InstanceType<typeof import('jspdf').jsPDF>

export interface TasaDelPapel {
  tasa: number
  fecha: string
  arrastrada: boolean
}

export interface DatosPorPagarPdf {
  cuentas: CuentaPorPagar[]
  abonos: AbonoPorPagar[]
  tasa: TasaDelPapel | null
  conLogo: boolean
  conPagadas: boolean
  /** Lo que se filtró en pantalla, dicho en palabras. Vacío si no hay filtro. */
  filtros: string
  empresa: EmpresaPapel
  emitidoPor: string
  momento: Date
  nombreArchivo: string
}

const ANCHO_HOJA = 297
const ALTO_HOJA = 210
const IZQ = 12
const DER = ANCHO_HOJA - 12
const ABAJO = ALTO_HOJA - 16
const VERDE = '#d4ecd0'
const ENCABEZADO = '#f2b47e'
const TOTAL = '#fcefd6'

const fechaCorta = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

function recortar(doc: Doc, t: string, ancho: number): string {
  if (doc.getTextWidth(t) <= ancho) return t
  let s = t
  while (s.length > 1 && doc.getTextWidth(s + '…') > ancho) s = s.slice(0, -1)
  return s + '…'
}

function cabecera(doc: Doc, logo: string, d: DatosPorPagarPdf): number {
  const y = 12
  const ALTO = 30
  const xTitulo = IZQ + 82
  doc.setDrawColor(TINTA).setLineWidth(0.4)
  doc.rect(IZQ, y, 82, ALTO)
  if (logo) {
    doc.addImage(logo, 'PNG', IZQ + 4, y + 3, 24, 24)
  }
  const xt = logo ? IZQ + 31 : IZQ + 4
  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(MARCA)
  doc.text(doc.splitTextToSize(d.empresa.razonSocial, 82 - (xt - IZQ) - 3).slice(0, 2), xt, y + 11)
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(ROTULO)
  doc.text(`RIF: ${documento(d.empresa.rif)}`, xt, y + 23)

  doc.setFillColor(TOTAL).rect(xTitulo, y, DER - xTitulo, ALTO, 'FD')
  doc.setFont('helvetica', 'bold').setFontSize(17).setTextColor(TINTA)
  doc.text('CUENTAS PENDIENTES POR PAGAR', (xTitulo + DER) / 2, y + 14, { align: 'center' })
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(GRIS)
  const fechaPapel = d.momento.toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })
  doc.text(`Al ${fechaPapel}${d.filtros ? ` · ${d.filtros}` : ''}`, (xTitulo + DER) / 2, y + 21, {
    align: 'center',
    maxWidth: DER - xTitulo - 8,
  })
  return y + ALTO
}

function pie(doc: Doc, d: DatosPorPagarPdf, pagina: number, total: number) {
  doc.setDrawColor(HAIRLINE).setLineWidth(0.3).line(IZQ, ALTO_HOJA - 11, DER, ALTO_HOJA - 11)
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
  doc.text(`Emitido por ${d.emitidoPor || '—'} · ${fechaLarga(d.momento)}`, IZQ, ALTO_HOJA - 7)
  doc.text(`Página ${pagina} de ${total}`, DER, ALTO_HOJA - 7, { align: 'right' })
}

export async function armarPorPagarPdf(d: DatosPorPagarPdf): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = d.conLogo ? await logoComoImagen(600, false) : ''
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true })

  const filas = d.cuentas.filter((c) => c.estado !== 'ANULADA' && (d.conPagadas || c.estado !== 'PAGADA'))
  const abonosDe = new Map<number, AbonoPorPagar[]>()
  for (const a of d.abonos) {
    if (a.anulado_en) continue
    abonosDe.set(a.cuenta_id, [...(abonosDe.get(a.cuenta_id) ?? []), a])
  }
  const t = d.tasa?.tasa ?? null

  const W = DER - IZQ
  const cItem = { x: IZQ, w: 14 }
  const cConc = { x: cItem.x + cItem.w, w: 78 }
  const cDesc = { x: cConc.x + cConc.w, w: 92 }
  const cBs = { x: cDesc.x + cDesc.w, w: (W - 14 - 78 - 92) / 2 }
  const cUsd = { x: cBs.x + cBs.w, w: W - 14 - 78 - 92 - cBs.w }
  const columnas = [cItem, cConc, cDesc, cBs, cUsd]

  let y = cabecera(doc, logo, d)

  const encabezado = () => {
    doc.setFillColor(ENCABEZADO).setDrawColor(TINTA).setLineWidth(0.4).rect(IZQ, y, W, 10, 'FD')
    for (const c of columnas.slice(1)) doc.line(c.x, y, c.x, y + 10)
    doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(TINTA)
    doc.text('ÍTEM', cItem.x + cItem.w / 2, y + 6.5, { align: 'center' })
    doc.text('FACTURA / CONCEPTO', cConc.x + cConc.w / 2, y + 6.5, { align: 'center' })
    doc.text('DESCRIPCIÓN', cDesc.x + cDesc.w / 2, y + 6.5, { align: 'center' })
    doc.text('MONTO BS', cBs.x + cBs.w / 2, y + 6.5, { align: 'center' })
    doc.text('MONTO $', cUsd.x + cUsd.w / 2, y + 6.5, { align: 'center' })
    y += 10
  }
  encabezado()

  let totalBs = 0
  let totalUsd = 0
  let totalCompleto = true

  filas.forEach((c, i) => {
    const pagada = c.estado === 'PAGADA'
    const montoFila = pagada ? c.monto : c.saldo
    const ambos = enAmbas(c.moneda, montoFila, t)

    doc.setFontSize(8.8)
    const concepto = doc.splitTextToSize(c.proveedor, cConc.w - 4) as string[]
    const segunda = c.sin_factura
      ? 'AÚN NO ENTREGAN FACTURA'
      : c.numero_factura
        ? `FACT. ${c.numero_factura}`
        : ''
    const notas: string[] = []
    if (segunda) notas.push(segunda)
    const susAbonos = abonosDe.get(c.id) ?? []
    for (const a of susAbonos) {
      notas.push(`Abonó ${a.moneda === 'USD' ? '$' : 'Bs'}${cifra(a.monto)} el ${fechaCorta(a.fecha)}`)
    }
    if (pagada) notas.push('PAGADA')
    const desc = doc.splitTextToSize(c.descripcion, cDesc.w - 4) as string[]
    const lineas = Math.max(concepto.length + notas.length, desc.length, 1)
    const alto = Math.max(11, 4 + lineas * 4.1)

    if (y + alto > ABAJO - 12) {
      doc.addPage()
      y = cabecera(doc, logo, d)
      encabezado()
    }

    if (pagada) doc.setFillColor(VERDE).rect(IZQ, y, W, alto, 'F')
    else if (i % 2 === 1) doc.setFillColor(FILA_ALTERNA).rect(IZQ, y, W, alto, 'F')
    doc.setDrawColor(TINTA).setLineWidth(0.3).rect(IZQ, y, W, alto)
    for (const col of columnas.slice(1)) doc.line(col.x, y, col.x, y + alto)

    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(TINTA)
    doc.text(String(i + 1), cItem.x + cItem.w / 2, y + alto / 2 + 1.2, { align: 'center' })

    // Concepto y, debajo, la factura y los abonos.
    const bloqueConc = concepto.length + notas.length
    let yc = y + alto / 2 - ((bloqueConc - 1) * 4.1) / 2 + 1.2
    doc.setFont('helvetica', 'normal').setFontSize(8.8).setTextColor(TINTA)
    for (const l of concepto) {
      doc.text(l, cConc.x + cConc.w / 2, yc, { align: 'center' })
      yc += 4.1
    }
    doc.setFontSize(7.6).setTextColor(GRIS)
    for (const n of notas) {
      doc.text(recortar(doc, n, cConc.w - 4), cConc.x + cConc.w / 2, yc, { align: 'center' })
      yc += 4.1
    }

    let yd = y + alto / 2 - ((desc.length - 1) * 4.1) / 2 + 1.2
    doc.setFont('helvetica', 'normal').setFontSize(8.8).setTextColor(TINTA)
    for (const l of desc) {
      doc.text(l, cDesc.x + cDesc.w / 2, yd, { align: 'center' })
      yd += 4.1
    }

    // Los dos montos: el de la moneda de la deuda, en negrita.
    const yMonto = y + alto / 2 + 1.3
    const celda = (valor: number | null, propio: boolean, simbolo: string, col: { x: number; w: number }) => {
      doc.setFont('helvetica', propio ? 'bold' : 'normal').setFontSize(propio ? 10 : 9.2)
      doc.setTextColor(propio ? TINTA : GRIS)
      doc.text(valor == null ? 'sin tasa' : `${simbolo}${cifra(valor)}`, col.x + col.w / 2, yMonto, { align: 'center' })
    }
    celda(ambos.bs, c.moneda === 'VES', 'Bs ', cBs)
    celda(ambos.usd, c.moneda === 'USD', '$', cUsd)

    if (!pagada) {
      if (ambos.bs == null || ambos.usd == null) totalCompleto = false
      totalBs += ambos.bs ?? 0
      totalUsd += ambos.usd ?? 0
    }
    y += alto
  })

  // El total.
  if (y + 14 > ABAJO) {
    doc.addPage()
    y = cabecera(doc, logo, d)
  }
  doc.setFillColor(TOTAL).setDrawColor(TINTA).setLineWidth(0.5).rect(IZQ, y, W, 13, 'FD')
  doc.line(cBs.x, y, cBs.x, y + 13)
  doc.line(cUsd.x, y, cUsd.x, y + 13)
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(TINTA)
  doc.text('MONTO TOTAL', (IZQ + cBs.x) / 2, y + 8.6, { align: 'center' })
  doc.setFontSize(12.5)
  doc.text(totalCompleto ? `Bs ${cifra(totalBs)}` : 'sin tasa', cBs.x + cBs.w / 2, y + 8.6, { align: 'center' })
  doc.text(totalCompleto ? `$${cifra(totalUsd)}` : 'sin tasa', cUsd.x + cUsd.w / 2, y + 8.6, { align: 'center' })
  y += 13

  // La nota al pie: de dónde sale el otro monto.
  doc.setFont('helvetica', 'italic').setFontSize(7.8).setTextColor(GRIS)
  const nota = [
    d.tasa
      ? `Tasa BCV del ${fechaCorta(d.tasa.fecha)}: Bs ${formatoTasa(d.tasa.tasa)} por dólar${d.tasa.arrastrada ? ' (no hay tasa publicada de hoy; se usa la última)' : ''}.`
      : 'No hay tasa BCV registrada: no se calcula el equivalente en la otra moneda.',
    'Cada monto es lo que falta por pagar. En negrita, el monto en la moneda de la deuda; el otro es su equivalente a esa tasa.',
    d.conPagadas ? 'Las cuentas pagadas van en verde y no suman al total.' : '',
  ]
    .filter(Boolean)
    .join(' ')
  doc.text(doc.splitTextToSize(nota, W) as string[], IZQ, y + 5)

  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    pie(doc, d, i, total)
  }
  doc.setProperties({ title: 'Cuentas pendientes por pagar' })
  return { blob: doc.output('blob'), nombre: d.nombreArchivo }
}
