import type { RetencionItem } from '@/lib/api/retenciones'
import { EMPRESA } from '@/lib/empresa'

export interface EmpresaPdf {
  razonSocial: string
  rif: string
  domicilio?: string | null
  telefono?: string | null
  correo?: string | null
}

export async function generarComprobanteRetencionPdf(
  retencion: RetencionItem,
  empresa: EmpresaPdf,
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'landscape', compress: true })

  const pageWidth = doc.internal.pageSize.getWidth() // 279.4 mm
  const pageHeight = doc.internal.pageSize.getHeight() // 215.9 mm
  const margin = 14
  const contentWidth = pageWidth - margin * 2

  // Paleta oficial
  const colorPrimario = [140, 47, 31] as const // #8c2f1f Marca
  const colorGrisOscuro = [51, 51, 51] as const // #333333 Tinta
  const colorGrisClaro = [107, 107, 107] as const // #6b6b6b
  const colorFondoTabla = [247, 244, 241] as const // #f7f4f1
  const colorLinea = [231, 229, 228] as const // #e7e5e4

  let y = margin + 4

  // Encabezado de la Empresa (Agente de Retención)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...colorPrimario)
  doc.text(empresa.razonSocial || EMPRESA.razonSocial, margin, y)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...colorGrisOscuro)
  y += 5
  doc.text(`RIF: ${empresa.rif || EMPRESA.rif}`, margin, y)
  y += 4
  const dom = empresa.domicilio || 'Carretera Nacional Upata - San Félix, Sector El Tapón'
  doc.text(`Domicilio fiscal: ${dom}`, margin, y)

  // Título del Comprobante (Centrado / Derecha)
  const esIva = retencion.tipo_impuesto === 'IVA'
  const titulo = esIva
    ? 'COMPROBANTE DE RETENCIÓN DEL IMPUESTO AL VALOR AGREGADO'
    : `COMPROBANTE DE RETENCIÓN DE ${retencion.tipo_impuesto}`

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...colorGrisOscuro)
  doc.text(titulo, margin, y + 10)

  // Cuadro Superior Derecho: Número de Comprobante y Fechas (G.O. 43.484 Art. 18.1, 18.3)
  const boxWidth = 90
  const boxX = pageWidth - margin - boxWidth
  const boxY = margin

  doc.setDrawColor(...colorLinea)
  doc.setFillColor(...colorFondoTabla)
  doc.roundedRect(boxX, boxY, boxWidth, 26, 2, 2, 'FD')

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...colorPrimario)
  doc.text('N° DE COMPROBANTE (14 DÍGITOS)', boxX + 4, boxY + 6)
  doc.setFontSize(11)
  doc.setFont('courier', 'bold')
  doc.setTextColor(...colorGrisOscuro)
  doc.text(retencion.numero_comprobante || '00000000000000', boxX + 4, boxY + 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...colorGrisOscuro)
  doc.text(`Fecha de emisión: ${retencion.fecha_emision}`, boxX + 4, boxY + 17)
  const fechaEnt = retencion.fecha_entrega ? retencion.fecha_entrega : 'Pendiente por entrega'
  doc.text(`Fecha de entrega: ${fechaEnt}`, boxX + 4, boxY + 22)

  y = margin + 28
  doc.setDrawColor(...colorPrimario)
  doc.setLineWidth(0.8)
  doc.line(margin, y, pageWidth - margin, y)

  // Datos del Proveedor / Sujeto Retenido (Art. 18.4)
  y += 5
  doc.setFillColor(...colorFondoTabla)
  doc.roundedRect(margin, y, contentWidth, 20, 1.5, 1.5, 'F')
  doc.setDrawColor(...colorLinea)
  doc.setLineWidth(0.3)
  doc.roundedRect(margin, y, contentWidth, 20, 1.5, 1.5, 'D')

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...colorPrimario)
  doc.text('DATOS DEL PROVEEDOR (SUJETO RETENIDO)', margin + 4, y + 5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...colorGrisOscuro)
  doc.text(`Razón Social: ${retencion.proveedor_nombre}`, margin + 4, y + 10)
  doc.text(`RIF: ${retencion.proveedor_rif}`, margin + 4, y + 15)

  const emailProv = retencion.proveedor_email || 'No registrado'
  doc.text(`Correo fiscal: ${emailProv}`, margin + 110, y + 10)
  const dirProv = retencion.proveedor_direccion || 'No especificada'
  doc.text(`Domicilio fiscal: ${dirProv.slice(0, 75)}`, margin + 110, y + 15)

  // Período de Imposición (Art. 18.7)
  const periodoTxt = `Período fiscal: ${retencion.periodo.slice(0, 4)} - Mes ${retencion.periodo.slice(4, 6)}`
  doc.setFont('helvetica', 'bold')
  doc.text(periodoTxt, pageWidth - margin - 55, y + 5)

  y += 24

  // Tabla Principal de Operaciones (Art. 18.5, 18.6, 18.8)
  const columnas = [
    { titulo: 'Oper.', ancho: 12, alinear: 'center' },
    { titulo: 'Fecha Fac.', ancho: 22, alinear: 'center' },
    { titulo: 'N° Factura', ancho: 25, alinear: 'left' },
    { titulo: 'N° Control', ancho: 25, alinear: 'left' },
    { titulo: 'Total Factura', ancho: 28, alinear: 'right' },
    { titulo: 'Sin Dcho Crédito', ancho: 26, alinear: 'right' },
    { titulo: 'Exento', ancho: 22, alinear: 'right' },
    { titulo: 'Base Imponible', ancho: 28, alinear: 'right' },
    { titulo: '% Alícuota', ancho: 18, alinear: 'center' },
    { titulo: 'Imp. Causado', ancho: 23, alinear: 'right' },
    { titulo: 'Imp. Retenido', ancho: 28, alinear: 'right' },
  ] as const

  // Cabecera de la tabla
  doc.setFillColor(...colorPrimario)
  doc.rect(margin, y, contentWidth, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(255, 255, 255)

  let curX = margin
  for (const c of columnas) {
    const posX = c.alinear === 'center' ? curX + c.ancho / 2 : c.alinear === 'right' ? curX + c.ancho - 2 : curX + 2
    doc.text(c.titulo, posX, y + 4.8, { align: c.alinear as any })
    curX += c.ancho
  }

  y += 7

  // Renglón de la factura
  const fmtMonto = (n: number) =>
    (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })

  doc.setFillColor(255, 255, 255)
  doc.rect(margin, y, contentWidth, 8, 'F')
  doc.setDrawColor(...colorLinea)
  doc.line(margin, y + 8, margin + contentWidth, y + 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...colorGrisOscuro)

  curX = margin
  const filaDatos = [
    '01',
    retencion.factura_fecha,
    retencion.factura_numero,
    retencion.factura_control || '—',
    `${fmtMonto(retencion.total_factura)} ${retencion.moneda}`,
    `${fmtMonto(retencion.monto_sin_derecho_credito_iva)}`,
    `${fmtMonto(retencion.monto_exento)}`,
    `${fmtMonto(retencion.base_imponible)}`,
    `${retencion.alicuota_pct}%`,
    `${fmtMonto(retencion.impuesto_causado)}`,
    `${fmtMonto(retencion.monto_retenido)}`,
  ]

  for (let i = 0; i < columnas.length; i++) {
    const c = columnas[i]
    const valor = filaDatos[i]
    const posX = c.alinear === 'center' ? curX + c.ancho / 2 : c.alinear === 'right' ? curX + c.ancho - 2 : curX + 2
    doc.text(valor, posX, y + 5.2, { align: c.alinear as any })
    curX += c.ancho
  }

  // Fila de Totales
  y += 8
  doc.setFillColor(...colorFondoTabla)
  doc.rect(margin, y, contentWidth, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.text('TOTALES:', margin + 80, y + 5.2)

  const xRetenido = margin + contentWidth - 2
  doc.text(`${fmtMonto(retencion.monto_retenido)} ${retencion.moneda}`, xRetenido, y + 5.2, { align: 'right' })

  // Equivalente en Bolívares si la factura es en moneda extranjera
  y += 12
  if (retencion.moneda !== 'BS') {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...colorGrisClaro)
    const eqBs = `Monto retenido equivalente en moneda nacional: Bs. ${fmtMonto(retencion.monto_retenido_bs)} (Tasa oficial BCV: Bs. ${fmtMonto(retencion.tasa)} por USD)`
    doc.text(eqBs, margin, y)
    y += 5
  }

  // Concepto oficial de ISLR si aplica
  if (retencion.tipo_impuesto === 'ISLR' && retencion.concepto_islr_codigo) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...colorGrisOscuro)
    const conceptoTxt = `Concepto SENIAT: Código ${retencion.concepto_islr_codigo} ${retencion.concepto_islr_nombre ? `· ${retencion.concepto_islr_nombre}` : ''}`
    doc.text(conceptoTxt, margin, y)
    y += 4.5
  }

  // Fundamento Legal (Providencia Administrativa SNAT/2026/00093 o Decreto 1.808)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...colorGrisClaro)
  const baseLegal =
    retencion.tipo_impuesto === 'IVA'
      ? 'Comprobante emitido de conformidad con la Providencia Administrativa SNAT/2026/00093, publicada en Gaceta Oficial N° 43.484 del 21/10/2026.'
      : 'Comprobante emitido de conformidad con el Decreto Presidencial N° 1.808 (Reglamento de Retenciones de ISLR) y normativas del SENIAT.'
  doc.text(baseLegal, margin, y)

  // Cuadros de Firma y Sello
  y = pageHeight - margin - 25
  const sigBoxW = 90
  const sigX1 = margin + 20
  const sigX2 = pageWidth - margin - sigBoxW - 20

  doc.setDrawColor(...colorLinea)
  doc.line(sigX1, y, sigX1 + sigBoxW, y)
  doc.line(sigX2, y, sigX2 + sigBoxW, y)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...colorGrisOscuro)
  doc.text('POR EL AGENTE DE RETENCIÓN', sigX1 + sigBoxW / 2, y + 4, { align: 'center' })
  doc.text('POR EL PROVEEDOR (SUJETO RETENIDO)', sigX2 + sigBoxW / 2, y + 4, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...colorGrisClaro)
  doc.text('Firma y Sello Autorizado', sigX1 + sigBoxW / 2, y + 8, { align: 'center' })
  doc.text('Firma, C.I., Fecha y Sello de Recepción', sigX2 + sigBoxW / 2, y + 8, { align: 'center' })

  // Descargar automáticamente el PDF
  const nombreLimpio = `COMPROBANTE-RETENCION-${retencion.tipo_impuesto}-${retencion.numero_comprobante}.pdf`
  doc.save(nombreLimpio)
}
