import type { RetencionItem } from '@/lib/api/retenciones'
import { EMPRESA } from '@/lib/empresa'

const montoVe = (n: number) =>
  Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Genera el texto reglamentario y amigable para enviar por WhatsApp al proveedor
 * notificando la emisión formal de la retención practicada.
 */
export function armarMensajeWhatsAppRetencion(
  item: RetencionItem,
  agente?: { razonSocial?: string; rif?: string },
): string {
  const razon = agente?.razonSocial || EMPRESA.razonSocial
  const rifAgente = agente?.rif || EMPRESA.rif
  const sig = item.moneda === 'BS' ? 'Bs.' : '$'

  const lineas: string[] = []
  lineas.push('🧾 *COMPROBANTE DE RETENCIÓN FISCAL*')
  lineas.push(`🏢 *Agente:* ${razon}`)
  lineas.push(`🆔 *RIF Agente:* ${rifAgente}`)
  lineas.push('────────────────────────')
  lineas.push(`👤 *Proveedor:* ${item.proveedor_nombre}`)
  lineas.push(`🆔 *RIF:* ${item.proveedor_rif}`)
  if (item.orden_numero) lineas.push(`📄 *Orden Compra:* ${item.orden_numero}`)
  lineas.push(`🧾 *Factura N°:* ${item.factura_numero}`)
  if (item.factura_control) lineas.push(`🔢 *N° Control:* ${item.factura_control}`)
  lineas.push(`📅 *Fecha Factura:* ${item.factura_fecha}`)
  lineas.push(`📋 *N° Comprobante (R14):* ${item.numero_comprobante}`)
  lineas.push('────────────────────────')
  lineas.push(`💰 *Total Factura:* ${sig} ${montoVe(item.total_factura)}`)
  lineas.push(`📊 *Base Imponible:* ${sig} ${montoVe(item.base_imponible)}`)

  if (item.tipo_impuesto === 'ISLR' && item.concepto_islr_codigo) {
    lineas.push(
      `📑 *Concepto ISLR:* ${item.concepto_islr_codigo} ${item.concepto_islr_nombre ? `(${item.concepto_islr_nombre})` : ''}`,
    )
  }

  lineas.push(`✂️ *Retención (${item.tipo_impuesto} ${item.alicuota_pct}%):* ${sig} ${montoVe(item.monto_retenido)}`)
  if (item.moneda !== 'BS' && item.monto_retenido_bs > 0) {
    lineas.push(`🇻🇪 *Equivalente en Bs:* Bs. ${montoVe(item.monto_retenido_bs)} (Tasa: Bs. ${montoVe(item.tasa)})`)
  }

  if (item.origen_retencion === 'POST_PAGO') {
    lineas.push('────────────────────────')
    lineas.push('⚠️ *ESTADO:* Retención post-pago (Reintegro pendiente a la empresa).')
  }

  lineas.push('────────────────────────')
  lineas.push('ℹ️ Comprobante emitido según normativa fiscal del SENIAT (G.O. 43.484 / Decreto 1.808).')
  return lineas.join('\n')
}

/**
 * Abre WhatsApp Web o la app nativa con el texto preformateado y el teléfono del proveedor si existe.
 */
export function abrirWhatsAppRetencion(
  item: RetencionItem,
  agente?: { razonSocial?: string; rif?: string },
): void {
  const texto = armarMensajeWhatsAppRetencion(item, agente)
  const telLimpio = (item.proveedor_telefono || '').replace(/\D/g, '')

  let telParam = ''
  if (telLimpio.startsWith('0')) {
    telParam = `58${telLimpio.slice(1)}`
  } else if (telLimpio.startsWith('58')) {
    telParam = telLimpio
  } else if (telLimpio.length >= 10) {
    telParam = telLimpio
  }

  const url = telParam
    ? `https://wa.me/${telParam}?text=${encodeURIComponent(texto)}`
    : `https://wa.me/?text=${encodeURIComponent(texto)}`

  window.open(url, '_blank', 'noopener,noreferrer')
}
