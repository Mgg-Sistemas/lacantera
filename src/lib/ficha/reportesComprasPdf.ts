import { logoComoImagen } from '@/lib/ficha/logo'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import {
  etiquetaValor,
  membrete,
  notaBajoLaTabla,
  pieDePagina,
  seccion,
  tabla,
  tituloDocumento,
  type EmpresaPapel,
} from '@/lib/ficha/papel'
import { ALTO_HOJA } from '@/lib/ficha/hoja'
import type { Orden } from '@/lib/api/pedidos'
import { etiquetaEstado, fechaHoraVE, fmtCant, money, solicitaDe } from '@/lib/pedidos'
import { labelCondicionPago } from '@/lib/ofertas'
import {
  ITEMS_CIERRE,
  agruparReporte,
  fechaReporteTexto,
  fmtMonto,
  textoRetenciones,
  totalGeneralTexto,
  totalPorPagar,
  totalesTexto,
  type FilaReporteCompras,
  type ResumenCierre,
} from '@/lib/reportesCompras'

/*
  LOS PDF DE LOS REPORTES DE COMPRAS (MGG `reporteComprasPdf.ts`,
  `cierreDiarioPdf.ts`, `historicoPedidoPdf.ts`)

  Las secciones y los rótulos son los de MGG, en su orden. El papel es el de
  la casa (`papel.ts`): membrete, colores y tabla de La Cantera, siempre A4
  vertical —MGG gira el reporte por renglón a horizontal; aquí la tabla cabe
  de pie partiendo el motivo en renglones—. Como el resto del sistema, no se
  descargan solos: se abren en el visor.
*/

/** Si lo que sigue no cabe, a la página siguiente (la tabla se parte sola; los rótulos no). */
function asegurar(doc: import('jspdf').jsPDF, y: number, alto: number): number {
  if (y + alto > ALTO_HOJA - 60) {
    doc.addPage()
    return 30
  }
  return y
}

// ---------------------------------------------------------------------------
// 📊 Reporte de compras por renglón
// ---------------------------------------------------------------------------

export async function armarReporteComprasPdf(filas: FilaReporteCompras[], empresa: EmpresaPapel): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const ahora = new Date().toISOString()
  const grupos = agruparReporte(filas).filter((g) => g.filas.length > 0)

  let y = membrete(doc, logo, {
    empresa,
    datos: [
      ['Renglones', String(filas.length)],
      ['Fecha', fechaHoraVE(ahora)],
    ],
  })
  y = tituloDocumento(doc, y, 'Reporte de compras · por renglón')
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor('#6b6b6b')
  doc.text('Pendiente por aprobar · Cuentas a crédito · Por indicar método de pago · Por pagar', 105, y - 3, {
    align: 'center',
  })
  y += 3

  for (const g of grupos) {
    const credito = g.key === 'cuenta_abierta'
    y = asegurar(doc, y, 30)
    y = seccion(doc, y, `${g.titulo} · ${g.filas.length} renglón(es)`)
    y = tabla(
      doc,
      y,
      credito
        ? [
            { titulo: '#', ancho: 8 },
            { titulo: 'Código', ancho: 24 },
            { titulo: 'Tipo', ancho: 18 },
            { titulo: 'Motivo', ancho: 43 },
            { titulo: 'Monto', ancho: 19, alDerecha: true },
            { titulo: 'Abonado', ancho: 19, alDerecha: true },
            { titulo: 'Saldo', ancho: 19, alDerecha: true },
          ]
        : [
            { titulo: '#', ancho: 8 },
            { titulo: 'Código', ancho: 26 },
            { titulo: 'Tipo', ancho: 22 },
            { titulo: 'Motivo', ancho: 68 },
            { titulo: 'Monto', ancho: 26, alDerecha: true },
          ],
      g.filas.map((f, i) =>
        credito
          ? [String(i + 1), f.codigo, f.tipo, f.motivo, fmtMonto(f.monto, f.moneda), fmtMonto(f.abonado, f.moneda), fmtMonto(f.saldo, f.moneda)]
          : [String(i + 1), f.codigo, f.tipo, f.motivo, fmtMonto(f.monto, f.moneda)],
      ),
      `TOTAL ${g.titulo}${credito ? ' (saldo pendiente)' : ''}: ${totalesTexto(g)}`,
    )
  }

  if (!grupos.length) {
    y = etiquetaValor(doc, y, [['Estado', 'No hay compras pendientes en este momento.']], { columnas: 1 })
  } else {
    y = asegurar(doc, y, 20)
    y = seccion(doc, y, 'Total general')
    y = etiquetaValor(
      doc,
      y,
      [
        ['Total', totalGeneralTexto(filas)],
        ['Cómo se suma', 'Suma de los cuatro renglones (en crédito, el saldo pendiente) · en la moneda de cada compra'],
      ],
      { columnas: 1 },
    )
  }

  pieDePagina(doc, `Generado ${fechaHoraVE(ahora)} · ${filas.length} renglón(es) · ${empresa.razonSocial}`)
  doc.setProperties({ title: 'Reporte de compras · por renglón' })
  return { blob: doc.output('blob'), nombre: 'reporte-compras-por-renglon.pdf' }
}

// ---------------------------------------------------------------------------
// 📆 Cierre diario
// ---------------------------------------------------------------------------

export async function armarCierreDiarioPdf(
  r: ResumenCierre,
  d: { etiqueta: string; empresa: EmpresaPapel; impreso: string; labelMetodo: (m: string) => string },
): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['Período', d.etiqueta],
      ['Impreso', fechaReporteTexto(d.impreso)],
    ],
  })
  y = tituloDocumento(doc, y, 'Cierre diario · Compras')
  y = etiquetaValor(
    doc,
    y,
    [
      ['Período', d.etiqueta],
      ['Fecha y hora de impresión', fechaReporteTexto(d.impreso)],
    ],
    { columnas: 1 },
  )

  y = tabla(
    doc,
    y,
    [
      { titulo: 'Concepto', ancho: 120 },
      { titulo: 'Cantidad', ancho: 30, alDerecha: true },
    ],
    ITEMS_CIERRE.map((it) => [it.titulo, String(r[it.key])]),
  )

  y = asegurar(doc, y, 30)
  y = seccion(doc, y, `Detalle · órdenes por pagar (${r.por_pagar_detalle.length})`)
  if (r.por_pagar_detalle.length) {
    const t = totalPorPagar(r)
    y = tabla(
      doc,
      y,
      [
        { titulo: 'Orden', ancho: 32 },
        { titulo: 'Proveedor', ancho: 84 },
        { titulo: 'Monto $', ancho: 34, alDerecha: true },
      ],
      r.por_pagar_detalle.map((f) => [f.codigo, f.proveedor, fmtMonto(f.monto, f.moneda)]),
      `TOTAL PENDIENTE POR PAGAR: ${fmtMonto(t.usd)}${t.enBs ? `  ·  ${fmtMonto(t.bs, 'Bs')}` : ''}`,
    )
  } else {
    y = etiquetaValor(doc, y, [['Detalle', 'No quedaron órdenes pendientes por pagar en este período.']], { columnas: 1 })
  }

  y = asegurar(doc, y, 30)
  y = seccion(doc, y, `Pagos del período (${r.pagos.length})`)
  if (r.pagos.length) {
    y = tabla(
      doc,
      y,
      [
        { titulo: 'Código', ancho: 25 },
        { titulo: 'Tipo', ancho: 17 },
        { titulo: 'Proveedor', ancho: 32 },
        { titulo: 'Método', ancho: 22 },
        { titulo: 'Total', ancho: 18, alDerecha: true },
        { titulo: 'Retenciones', ancho: 18, alDerecha: true },
        { titulo: 'Pagado', ancho: 18, alDerecha: true },
      ],
      r.pagos.map((p) => [
        p.codigo,
        p.tipo,
        p.proveedor,
        p.metodos.map(d.labelMetodo).join(' + ') || '—',
        p.total == null ? '—' : fmtMonto(p.total),
        p.total_retenciones > 0 ? fmtMonto(p.total_retenciones) : '—',
        fmtMonto(p.monto_pagado),
      ]),
      `TOTAL PAGADO: ${fmtMonto(r.total_pagado)} · RETENCIONES: ${fmtMonto(r.total_retenciones)}`,
    )
    const conRet = r.pagos.filter((p) => p.total_retenciones > 0)
    y = notaBajoLaTabla(
      doc,
      y,
      conRet.length
        ? `Retenciones: ${conRet.map((p) => `${p.codigo} — ${textoRetenciones(p)}`).join(' · ')}. Los abonos de un crédito no llevan retención propia: las retenciones del crédito se descuentan del monto a pagar de la orden.`
        : null,
    )
  } else {
    y = etiquetaValor(doc, y, [['Pagos', 'No se registraron pagos en este período.']], { columnas: 1 })
  }

  y = asegurar(doc, y, 30)
  y = seccion(doc, y, 'Actividad por analista')
  if (r.analistas.length) {
    y = tabla(
      doc,
      y,
      [
        { titulo: 'Analista', ancho: 80 },
        { titulo: 'Cotizaciones cargadas', ancho: 35, alDerecha: true },
        { titulo: 'Órdenes finalizadas', ancho: 35, alDerecha: true },
      ],
      r.analistas.map((a) => [a.nombre, String(a.cotizaciones), String(a.finalizadas)]),
      `TOTAL: ${r.total_cotizaciones} cotización(es) · ${r.total_finalizadas} orden(es) finalizada(s)`,
    )
  } else {
    etiquetaValor(doc, y, [['Analistas', 'Sin actividad de analistas registrada en este período.']], { columnas: 1 })
  }

  pieDePagina(doc, `Impreso ${fechaReporteTexto(d.impreso)} · ${d.empresa.razonSocial}`)
  doc.setProperties({ title: 'Cierre diario · Compras' })
  return { blob: doc.output('blob'), nombre: 'cierre-diario-compras.pdf' }
}

// ---------------------------------------------------------------------------
// 🖨 Detalle de pedido / compra (Histórico)
// ---------------------------------------------------------------------------

export async function armarDetallePedidoPdf(o: Orden, proveedor: string | null, empresa: EmpresaPapel): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const ahora = fechaHoraVE()

  let y = membrete(doc, logo, {
    empresa,
    datos: [
      ['N° OP', o.codigo],
      ['N° OC', o.oc_codigo ?? '—'],
    ],
  })
  y = tituloDocumento(doc, y, 'Detalle de pedido / compra')
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor('#6b6b6b')
  doc.text(`N° OP ${o.codigo}${o.oc_codigo ? ` · N° OC ${o.oc_codigo}` : ''}`, 105, y - 3, { align: 'center' })
  y += 3

  y = etiquetaValor(
    doc,
    y,
    [
      ['Estado', etiquetaEstado(o.estado)],
      ['Solicitante', solicitaDe(o)],
      ['Proveedor', proveedor ?? '—'],
      ['Clasificación', (o.clasificacion ?? []).join(', ') || null],
      ['Condición de pago', o.condiciones_pago ? labelCondicionPago(o.condiciones_pago) : null],
      ['Fecha solicitud', fechaHoraVE(o.creado_en)],
      ['Aprobada', o.aprobada_en ? fechaHoraVE(o.aprobada_en) : null],
      ['OC emitida', o.oc_creada_en ? fechaHoraVE(o.oc_creada_en) : null],
      ['Pagada', o.pagada_en ? fechaHoraVE(o.pagada_en) : null],
      ['Finalizada', o.finalizada_en ? fechaHoraVE(o.finalizada_en) : null],
      ['Cancelada', o.cancelada_en ? fechaHoraVE(o.cancelada_en) : null],
      ['Anulada', o.anulada_en ? fechaHoraVE(o.anulada_en) : null],
    ].filter(([, v]) => v != null) as Array<[string, string]>,
  )

  const items = (o.items ?? []).filter((it) => it.comprar !== false)
  y = tabla(
    doc,
    y,
    [
      { titulo: '#', ancho: 8 },
      { titulo: 'SKU', ancho: 26 },
      { titulo: 'Producto', ancho: 54 },
      { titulo: 'Cantidad', ancho: 20, alDerecha: true },
      { titulo: 'Precio', ancho: 20, alDerecha: true },
      { titulo: 'Subtotal', ancho: 22, alDerecha: true },
    ],
    items.map((it, i) => [
      String(i + 1),
      it.sku ?? '—',
      it.nombre ?? '—',
      `${fmtCant(it.cantidad)}${it.unidad ? ` ${it.unidad}` : ''}`,
      money(it.precio),
      money((Number(it.cantidad) || 0) * (Number(it.precio) || 0)),
    ]),
    `TOTAL: ${money(o.total)}`,
  )

  const motivo = (o.motivo ?? o.finalidad ?? '').trim()
  const notas = (o.notas ?? '').trim()
  const extra: Array<[string, string]> = []
  if (motivo) extra.push(['Motivo / finalidad', motivo])
  if (notas) extra.push(['Notas', notas])
  if (o.motivo_cancelacion) extra.push(['Motivo de la cancelación', o.motivo_cancelacion])
  if (o.motivo_anulacion) extra.push(['Motivo de la anulación', o.motivo_anulacion])
  if (extra.length) etiquetaValor(doc, y, extra, { columnas: 1 })

  pieDePagina(doc, `Generado ${ahora} · ${empresa.razonSocial}`)
  doc.setProperties({ title: `Pedido ${o.codigo}` })
  return { blob: doc.output('blob'), nombre: `pedido-${o.codigo}.pdf` }
}
