import { bolivares, dolares } from '@/lib/formato'
import type { NotaEntrega } from '@/lib/api/ventas'
import type { MaterialDespachado } from '@/lib/ficha/notasDeEntregaReportePdf'

/*
  EL REPORTE DE VENTAS Y DESPACHOS PARA WHATSAPP

  Hermano del reporte diario de operaciones (reporteDiario.ts) y del reporte de
  despacho (reporteDespacho.ts): texto plano estructurado con asteriscos para negritas,
  emojis representativos y sin tablas que se rompen con la tipografía de WhatsApp.

  Resume:
  - Totales en $ y en Bs (a la tasa de cada nota).
  - Cantidad de notas y desglose de materiales despachados en m³ / toneladas.
  - Lista resumida de notas con cliente, vehículo y montos.
*/

const dia = new Intl.DateTimeFormat('es-VE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const entero = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 0 })
const decimal2 = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function fechaLarga(d: Date): string {
  const texto = dia.format(d)
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

const cantidadLegible = (v: number): string =>
  Number.isInteger(v) ? v.toLocaleString('es-VE') : decimal2.format(v)

export interface DatosReporteVentasWhatsapp {
  empresa: { razonSocial: string; rif?: string }
  emitidoPor: string
  momento: Date
  alcance?: string
  notas: NotaEntrega[]
  materiales?: MaterialDespachado[]
}

export function textoDelReporteVentasWhatsapp(d: DatosReporteVentasWhatsapp): string {
  const lineas: string[] = []

  lineas.push('📊 *REPORTE DE VENTAS Y DESPACHOS*')
  if (d.empresa.razonSocial) {
    lineas.push(`🏢 *${d.empresa.razonSocial.toUpperCase()}*`)
  }
  lineas.push(`📅 ${fechaLarga(d.momento)}`)
  if (d.alcance) {
    lineas.push(`🔎 _Filtro: ${d.alcance}_`)
  }
  lineas.push('')

  const vigentes = d.notas.filter((n) => n.estado !== 'ANULADA')
  const anuladas = d.notas.length - vigentes.length
  const totalBs = vigentes.reduce((s, n) => s + Number(n.total_bs || 0), 0)
  const totalUsd = vigentes.reduce((s, n) => s + Number(n.total_usd || 0), 0)

  // 1. Resumen de totales
  lineas.push('💰 *TOTALES GENERALES*')
  lineas.push(`💵 *Total $:* ${dolares(totalUsd)}`)
  lineas.push(`🇻🇪 *Total Bs:* ${bolivares(totalBs)}`)
  lineas.push(
    `📋 *Notas emitidas:* ${entero.format(d.notas.length)} (${entero.format(vigentes.length)} vigentes${
      anuladas > 0 ? `, ${entero.format(anuladas)} anuladas` : ''
    })`,
  )
  lineas.push('')

  // 2. Materiales despachados
  if (d.materiales && d.materiales.length > 0) {
    lineas.push('🧱 *MATERIALES DESPACHADOS*')
    const ordenados = [...d.materiales].sort((a, b) => b.subtotalUsd - a.subtotalUsd)
    for (const m of ordenados) {
      lineas.push(
        `• *${m.articulo}:* ${cantidadLegible(m.cantidad)} ${m.unidad} ➔ ${dolares(m.subtotalUsd)} (${bolivares(m.subtotalBs)})`,
      )
    }
    lineas.push('')
  }

  // 3. Detalle de despachos
  if (vigentes.length > 0) {
    lineas.push('🚛 *DETALLE DE DESPACHOS*')
    for (const [idx, n] of vigentes.entries()) {
      const cliente = n.cliente ? n.cliente.trim() : 'Cliente por concretar'
      const vehiculo = n.vehiculo ? `🚚 ${n.vehiculo}` : ''
      const chofer = n.chofer ? `(${n.chofer})` : ''
      const trans = [vehiculo, chofer].filter(Boolean).join(' ')
      const parteTrans = trans ? ` · ${trans}` : ''
      lineas.push(
        `${idx + 1}. *${n.numero}* | ${cliente}${parteTrans} ➔ ${dolares(n.total_usd)} (${bolivares(n.total_bs)})`,
      )
    }
    lineas.push('')
  } else if (d.notas.length === 0) {
    lineas.push('ℹ️ _Sin notas de entrega registradas en el período._')
    lineas.push('')
  }

  // 4. Pie de reporte
  lineas.push(`👤 *Emitido por:* ${d.emitidoPor || 'Sistema'}`)
  lineas.push(`⏱️ *Generado:* ${new Intl.DateTimeFormat('es-VE', { hour: '2-digit', minute: '2-digit' }).format(d.momento)}`)

  return lineas.join('\n')
}
