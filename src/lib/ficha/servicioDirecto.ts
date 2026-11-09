import { logoComoImagen } from '@/lib/ficha/logo'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import {
  membrete,
  tituloDocumento,
  seccion,
  etiquetaValor,
  tabla,
  pieDePagina,
  fechaLarga,
  firmas,
  type EmpresaPapel,
} from '@/lib/ficha/papel'
import type { ServicioDirecto } from '@/lib/api/pedidos'
import { etiquetaDocumento, nombreMetodoPago, labelRetencion, montoAPagar, resumenDatosPago } from '@/lib/pagos'
import { fechaHoraVE, fmtCant } from '@/lib/pedidos'
import { ESTADO_SD } from '@/lib/servicios'
import { montoTxt } from '@/lib/ficha/pedidosWhatsapp'
import { ordenDesdeDirecto } from '@/pages/pedidos/ordenDesdeDirecto'

/*
  EL PAPEL Y LOS MENSAJES DEL SERVICIO DIRECTO (MGG `servicioDirectoPdf.ts`)

  El PDF es el «Comprobante de Servicio Directo» de MGG —la ficha, «Servicios
  realizados» con Categoría / Subcategoría / Detalle / Cantidad / Costo unit.
  / Precio y el total—, en el papel de La Cantera, más lo que aquí hace
  Compras y en MGG Tesorería: el documento, las retenciones, el monto a
  pagar y el pago registrado.

  Los WhatsApp («💬 WhatsApp para pagar» y «💬 Aviso de pago») siguen la forma
  de `textoOrdenPago` y `textoOrdenPagada` de la OC: MGG no tiene uno propio
  para el servicio directo porque lo paga Tesorería. Emojis sin U+FE0F.
*/

const money2 = (n: number | string | null | undefined) =>
  `$${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fechaDia = (iso: string): string => iso.slice(0, 10).split('-').reverse().join('/')

/** Lo que se le paga: factura − descuento en el pago − retenciones. */
export const montoAPagarDirecto = (s: ServicioDirecto): number => montoAPagar(ordenDesdeDirecto(s))

export async function armarServicioDirectoPdf(s: ServicioDirecto, empresa: EmpresaPapel): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    empresa,
    datos: [
      ['N°', s.codigo],
      ['Fecha', fechaHoraVE(s.creado_en)],
    ],
  })
  y = tituloDocumento(doc, y, 'Comprobante de Servicio Directo')

  y = etiquetaValor(
    doc,
    y,
    (
      [
        ['Estado', ESTADO_SD[s.estado]?.replace(/^\S+\s/, '') ?? s.estado],
        ['Proveedor / taller', s.proveedor_nombre],
        ['Equipo', s.equipo_nombre],
        ['Unidad solicitante', s.unidad_solicitante],
        ['Quién lo solicita', s.solicitante_nombre],
        ['Generó', s.creado_por_nombre],
        ['Creado', fechaHoraVE(s.creado_en)],
        ['Pagado', s.pagada_en ? fechaHoraVE(s.pagada_en) : null],
      ] as Array<[string, string | null]>
    ).filter(([, v]) => v),
  )

  if (s.pago_externo) {
    y = seccion(doc, y, 'Pago a externo · reintegrar el dinero')
    y = etiquetaValor(doc, y, [['Pagó', s.pago_externo_datos?.trim() || '—']], { columnas: 1 })
  }

  y = seccion(doc, y, 'Servicios realizados')
  y = tabla(
    doc,
    y,
    [
      { titulo: 'Categoría', ancho: 28 },
      { titulo: 'Subcategoría', ancho: 24 },
      { titulo: 'Detalle', ancho: 50 },
      { titulo: 'Cantidad', ancho: 16, alDerecha: true },
      { titulo: 'Costo unit.', ancho: 16, alDerecha: true },
      { titulo: 'Precio', ancho: 16, alDerecha: true },
    ],
    s.items.map((it) => {
      const g = it.gasto != null ? Number(it.gasto) : null
      const det = (it.detalle_items ?? [])
        .filter((d) => (d.descripcion ?? '').trim())
        .map(
          (d) =>
            `  • ${d.descripcion}${d.cantidad != null ? ` · ${fmtCant(d.cantidad)}` : ''}${d.precio != null ? ` · ${money2(d.precio)}` : ''}`,
        )
      return [
        it.servicio_categoria,
        it.servicio_tipo ?? '—',
        [it.descripcion, ...det].join('\n'),
        fmtCant(it.cantidad),
        g != null && Number(it.cantidad) > 0 ? money2(g / Number(it.cantidad)) : '—',
        g != null ? money2(g) : '—',
      ]
    }),
  )
  y = etiquetaValor(doc, y - 4, [['TOTAL', s.gasto != null ? money2(s.gasto) : '—']], { columnas: 1 })

  // EL PAGO: sin Tesorería, como la fase 3.
  const filasPago: Array<[string, string]> = []
  if (s.comprobante_tipo) filasPago.push(['Documento', etiquetaDocumento(s.comprobante_tipo)])
  for (const m of s.metodo_pago ?? []) {
    const datos = resumenDatosPago(m.metodo, m.datos)
    const monto = Number(m.monto) > 0 ? `${m.moneda} ${Number(m.monto).toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : ''
    filasPago.push([`Método · ${nombreMetodoPago(m.metodo, m.detalle)}`, [monto, datos].filter(Boolean).join(' · ') || String(m.moneda)])
  }
  if (s.numero_administracion) filasPago.push(['Tel. administración del proveedor', s.numero_administracion])
  if (Number(s.descuento_pago) > 0) filasPago.push(['Descuento en el pago', `-${money2(s.descuento_pago)}`])
  for (const r of s.retenciones ?? []) {
    filasPago.push([
      `Retención ${labelRetencion(r)}`,
      `-${money2(r.monto)}${r.modo === 'porcentaje' && r.base != null ? ` (sobre ${money2(r.base)})` : ''}`,
    ])
  }
  if (s.metodo_pago?.length) filasPago.push(['Monto a pagar', money2(montoAPagarDirecto(s))])
  if (s.pagada_en) {
    filasPago.push([
      'Pagado',
      `${s.pago_fecha ? fechaDia(s.pago_fecha) : fechaHoraVE(s.pagada_en)} · ${money2(s.pago_monto_usd)}${s.pago_referencia ? ` · ref. ${s.pago_referencia}` : ''}`,
    ])
  }
  if (filasPago.length) {
    if (y + 30 > 265) {
      doc.addPage()
      y = 30
    }
    y = seccion(doc, y, 'Pago')
    y = etiquetaValor(doc, y, filasPago, { columnas: 1 })
  }

  if ((s.nota ?? '').trim()) {
    y = seccion(doc, y, 'Nota / motivo')
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor('#333333')
    const lineas = doc.splitTextToSize(s.nota!.trim(), 150) as string[]
    doc.text(lineas, 30, y, { lineHeightFactor: 1.45 })
    y += lineas.length * 4.6 + 6
  }

  if (y + 22 > 265) {
    doc.addPage()
    y = 30
  }
  firmas(
    doc,
    Math.max(y + 10, 240),
    { texto: `Firma autorizada · ${empresa.razonSocial}`, nombre: s.pagada_por_nombre ?? null },
    { texto: 'Analista que realizó la solicitud', nombre: s.creado_por_nombre ?? null },
  )

  pieDePagina(doc, `Documento auto-generado · ${s.codigo} · ${fechaLarga(new Date())}`)
  doc.setProperties({ title: `Servicio directo ${s.codigo}` })
  return { blob: doc.output('blob'), nombre: `${s.codigo}.pdf` }
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

function lineasServicios(s: ServicioDirecto): string[] {
  return s.items.map((it) => `• ${it.descripcion} · ${fmtCant(it.cantidad)}${it.gasto != null ? ` · ${montoTxt(it.gasto)}` : ''}`)
}

/** «💬 WhatsApp para pagar» del servicio directo: el monto a pagar y cómo pagarle. */
export function textoServicioDirectoPago(s: ServicioDirecto, empresa: string): string {
  const aPagar = montoAPagarDirecto(s)
  const rets = s.retenciones ?? []
  const L: string[] = []
  L.push(`🔹 *SERVICIO DIRECTO:* ${s.codigo}`)
  L.push(`🏭 *Proveedor:* ${s.proveedor_nombre || '—'}`)
  if (s.equipo_nombre) L.push(`🚜 *Equipo:* ${s.equipo_nombre}`)
  if (s.nota?.trim()) L.push(`📌 *Nota:* ${s.nota.trim().replace(/\s*\r?\n\s*/g, ' ')}`)
  if (s.solicitante_nombre) L.push(`🙋 *Solicita:* ${s.solicitante_nombre}`)
  if (s.creado_por_nombre) L.push(`🛒 *Analista de compras:* ${s.creado_por_nombre}`)
  L.push('')
  L.push(`🛠 *SERVICIOS (${s.items.length}):*`)
  L.push(...lineasServicios(s))
  L.push('')
  L.push(`💵 *Total:* ${montoTxt(s.gasto)}`)
  if (s.comprobante_tipo) L.push(`🧾 *Documento:* ${etiquetaDocumento(s.comprobante_tipo)}`)
  if (Number(s.descuento_pago) > 0) L.push(`🏷 *Descuento en el pago:* −${montoTxt(s.descuento_pago)}`)
  for (const r of rets) L.push(`🧾 *Retención ${labelRetencion(r)}:* −${montoTxt(r.monto)}`)
  L.push(`✅ *Neto a pagar:* ${montoTxt(aPagar)}`)
  if (s.pago_externo) L.push(`💳 *Pago a externo · reintegrar a:* ${(s.pago_externo_datos ?? '').trim().replace(/\s*\r?\n\s*/g, ' ') || '—'}`)
  const metodos = s.metodo_pago ?? []
  if (!metodos.length) L.push('💳 *Pago:* (todavía sin método de pago indicado)')
  for (const m of metodos) {
    const conMonto = Number(m.monto) > 0 && !(metodos.length === 1 && Math.abs(Number(m.monto) - aPagar) < 0.01)
    L.push(`💳 *${nombreMetodoPago(m.metodo, m.detalle)}:*${conMonto ? ` ${montoTxt(m.monto, m.moneda === 'USD' ? '$' : m.moneda)}` : ''}`)
    const datos = resumenDatosPago(m.metodo, m.datos)
    if (datos) L.push(`* ${datos}`)
  }
  if (s.numero_administracion) L.push(`📞 *Tel. administración:* ${s.numero_administracion}`)
  L.push(`🏢 *${empresa.toUpperCase()}*`)
  return L.join('\n')
}

/** «💬 Aviso de pago»: el servicio directo ya pagado (en MGG, «PAGADA POR TESORERIA»). */
export function textoServicioDirectoPagado(s: ServicioDirecto, empresa: string): string {
  const L: string[] = []
  L.push(`🔹 *SERVICIO DIRECTO:* ${s.codigo}`)
  L.push(`🏭 *Proveedor:* ${s.proveedor_nombre || '—'}`)
  L.push(`🛠 *Servicio:* ${s.descripcion}`)
  if (s.nota?.trim()) L.push(`📌 *Nota del analista:* ${s.nota.trim().replace(/\s*\r?\n\s*/g, ' ')}`)
  if (s.creado_por_nombre) L.push(`🛒 *Analista encargado:* ${s.creado_por_nombre}`)
  if (s.solicitante_nombre) L.push(`🙋 *Solicita:* ${s.solicitante_nombre}`)
  L.push(`💵 *Monto en $:* ${montoTxt(s.pago_monto_usd ?? montoAPagarDirecto(s))}`)
  if (s.pago_moneda === 'Bs') {
    L.push(`💱 *Pagado en Bs:* ${montoTxt(s.pago_monto, 'Bs')} (tasa ${Number(s.pago_tasa).toLocaleString('es-VE')})`)
  }
  if (s.pago_referencia) L.push(`🧾 *Referencia:* ${s.pago_referencia}`)
  if (s.pago_fecha) L.push(`📅 *Fecha de pago:* ${fechaDia(s.pago_fecha)}`)
  if (s.pagada_por_nombre) L.push(`👤 *Registró:* ${s.pagada_por_nombre}`)
  L.push('📊 *Estado:* *PAGADO · FINALIZADO*')
  L.push(`🏢 *${empresa.toUpperCase()}*`)
  return L.join('\n')
}
