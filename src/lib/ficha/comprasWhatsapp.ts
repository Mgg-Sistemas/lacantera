/*
  LOS MENSAJES DE WHATSAPP DE COMPRAS

  Tomados de MGG (`src/modules/pedidos/ordenPagoTxt.ts`) y adaptados a La
  Cantera, que es bimoneda y cuyo pago lo decide quien aprueba dentro de
  Compras —Tesorería no se vincula—.

  Dos mensajes:
  - «Para aprobar»: la solicitud está en «Órdenes pendientes por aprobar». Lleva
    lo justo para decidir —qué es, quién lo pide, cuántos productos, las
    cotizaciones y cuánto— y el pago que Compras dejó indicado.
  - «Estado del pago»: lo que se decidió al aprobar o después. PAGADA, o NO
    PAGADA con su motivo.

  ⚠ NINGÚN EMOJI LLEVA EL SELECTOR U+FE0F. WhatsApp normaliza el texto del
  enlace y del otro lado llega un cuadrito. Por eso aquí solo van emojis que son
  de color por sí mismos (📌 y no 🗒️). Los `*` son las negritas de WhatsApp.

  Nunca salen solos: los abre un botón, y se ven antes de mandarlos.
*/
import type { Compra, Cotizacion, Orden } from '@/lib/api/compras'
import { CONDICIONES_PAGO } from '@/lib/api/catalogo'
import { dinero } from '@/lib/formato'

/** El nombre de un método de pago, si la pantalla tiene el catálogo; si no, el código. */
export type NombreDeMetodo = (codigo: string | null | undefined) => string

/**
 * Cédula o RIF con su letra: «CI: V-12345678», «RIF: J-50046044-9».
 *
 * Si se guardó con letra, manda esa letra. Si solo son números, hasta 8 dígitos
 * es una cédula (V) y 9 un RIF de empresa (J). Mismo criterio que MGG.
 */
export function ciRifTxt(
  v: string | null | undefined,
): { etiqueta: 'CI' | 'RIF' | 'Pasaporte' | 'CI/RIF'; valor: string } | null {
  const t = String(v ?? '').toUpperCase().replace(/[\s.]/g, '')
  if (!t) return null
  const m = /^([VEJGPC])?-?(\d+)-?(\d)?$/.exec(t)
  if (!m) return { etiqueta: 'CI/RIF', valor: String(v).trim() }
  const digitos = m[2] + (m[3] ?? '')
  const letra = m[1] ?? (digitos.length <= 8 ? 'V' : 'J')
  if (digitos.length === 9) return { etiqueta: 'RIF', valor: `${letra}-${digitos.slice(0, 8)}-${digitos.slice(8)}` }
  if (letra === 'V' || letra === 'E') return { etiqueta: 'CI', valor: `${letra}-${digitos}` }
  if (letra === 'P') return { etiqueta: 'Pasaporte', valor: `P-${digitos}` }
  return { etiqueta: 'RIF', valor: `${letra}-${digitos}` }
}

const limpio = (v: unknown) => String(v ?? '').replace(/\s*\r?\n\s*/g, ' ').trim()

const condicionTxt = (c: string | null | undefined) =>
  CONDICIONES_PAGO.find((x) => x.valor === c)?.etiqueta ?? (c ?? '')

/** Los datos del beneficiario, uno por renglón: se leen para teclear el pago. */
function lineasDatosPago(datos: Record<string, unknown> | null | undefined): string[] {
  const d = datos ?? {}
  const L: string[] = []
  const add = (k: string, v: unknown) => {
    const t = limpio(v)
    if (t) L.push(`* ${k}: ${t}`)
  }
  add('Titular', d.titular)
  const doc = ciRifTxt(d.documento as string | undefined)
  if (doc) L.push(`* ${doc.etiqueta}: ${doc.valor}`)
  add('Banco', d.banco)
  add('Cuenta', d.numero_cuenta)
  add('Tlf', d.telefono)
  add('Correo/ID', d.correo_binance)
  add('Red', d.red_cripto)
  add('Recibe', d.receptor)
  return L
}

/** «💳 *Transferencia bancaria* (USD)» y debajo los datos del beneficiario. */
function lineasPago(c: Pick<Cotizacion, 'pago_metodo' | 'pago_moneda' | 'pago_datos'>, metodo: NombreDeMetodo): string[] {
  if (!c.pago_metodo) return ['💳 *Pago:* (Compras todavía no lo indica)']
  if (c.pago_metodo === 'INTERCAMBIO') return ['💳 *Pago:* con productos (intercambio)']
  return [
    `💳 *${metodo(c.pago_metodo)}*${c.pago_moneda ? ` (${c.pago_moneda})` : ''}`,
    ...lineasDatosPago(c.pago_datos as Record<string, unknown> | null),
  ]
}

/** El monto en su moneda y, si no es en bolívares, también en bolívares a la tasa de la cotización. */
function montoConBs(moneda: string, total: string | number, totalBs: string | number | null | undefined): string {
  const base = dinero(moneda, total)
  if (moneda === 'VES' || totalBs === null || totalBs === undefined) return base
  return `${base} · ${dinero('VES', totalBs)}`
}

export interface PersonasCompra {
  solicita?: string | null
  analista?: string | null
  aprobo?: string | null
}

function lineasPersonas(p: PersonasCompra | undefined): string[] {
  const L: string[] = []
  if (limpio(p?.solicita)) L.push(`🙋 *Solicita:* ${limpio(p?.solicita)}`)
  if (limpio(p?.analista)) L.push(`🛒 *Compras:* ${limpio(p?.analista)}`)
  if (limpio(p?.aprobo)) L.push(`👔 *Aprobó:* ${limpio(p?.aprobo)}`)
  return L
}

/**
 * El mensaje para pedir la aprobación.
 *
 * Con varias propuestas las lista todas con su monto en la moneda de cada una
 * y en bolívares; quien aprueba escoge en el sistema, no en el chat.
 */
export function textoParaAprobar(d: {
  compra: Pick<Compra, 'numero' | 'titulo' | 'justificacion' | 'prioridad'>
  propuestas: Cotizacion[]
  productos: number
  personas?: PersonasCompra
  metodo: NombreDeMetodo
  empresa?: string | null
}): string {
  const { compra, propuestas } = d
  const L: string[] = []
  L.push(`🔹 *SOLICITUD:* ${compra.numero}`)
  L.push('⏳ *Pendiente por aprobar*')
  if (compra.prioridad === 'URGENTE') L.push('🚨 *URGENTE*')
  L.push(`📝 *Detalle:* ${limpio(compra.titulo)}`)
  if (limpio(compra.justificacion)) L.push(`📌 *Para qué:* ${limpio(compra.justificacion)}`)
  L.push(...lineasPersonas({ solicita: d.personas?.solicita, analista: d.personas?.analista }))
  if (d.productos > 0) L.push(`📦 *Productos:* ${d.productos}`)

  if (propuestas.length === 1) {
    const c = propuestas[0]
    L.push(`🏭 *Proveedor:* ${c.proveedor?.nombre ?? '—'}`)
    L.push(`📋 *Condición:* ${condicionTxt(c.condicion_pago)}`)
    L.push(...lineasPago(c, d.metodo))
    L.push(`💵 *Total:* ${montoConBs(c.moneda, c.total, c.total_bs)}`)
  } else if (propuestas.length > 1) {
    L.push('', `📊 *COTIZACIONES (${propuestas.length}):*`)
    propuestas.forEach((c, i) => {
      L.push(
        `• *Cotización ${i + 1}:* ${c.proveedor?.nombre ?? '—'} · ${montoConBs(c.moneda, c.total, c.total_bs)} · ${condicionTxt(c.condicion_pago)}`,
      )
    })
    L.push('')
  }

  if (limpio(d.empresa)) L.push(`🏢 *${limpio(d.empresa)}*`)
  return L.join('\n')
}

/**
 * El mensaje del estado del pago: PAGADA, o NO PAGADA con el motivo.
 *
 * Lleva el monto en la moneda de la orden y en bolívares, y el método con sus
 * datos para quien tenga que ejecutar o comprobar el pago.
 */
export function textoEstadoPago(d: {
  compra: Pick<Compra, 'numero' | 'titulo' | 'prioridad'>
  orden: Pick<Orden, 'numero' | 'moneda' | 'total' | 'total_bs' | 'proveedor' | 'condicion_pago'>
  cotizacion?: Pick<Cotizacion, 'pago_metodo' | 'pago_moneda' | 'pago_datos'> | null
  estado: string
  referencia?: string | null
  personas?: PersonasCompra
  metodo: NombreDeMetodo
  empresa?: string | null
}): string {
  const { compra, orden } = d
  const L: string[] = []
  L.push(`🔹 *ORDEN:* ${orden.numero} (${compra.numero})`)
  L.push(compra.prioridad === 'URGENTE' ? '🚨 *Requerimiento:* URGENTE' : '🟢 *Requerimiento:* Normal')
  L.push(`🏭 *Proveedor:* ${orden.proveedor?.nombre ?? '—'}`)
  L.push(`📝 *Detalle:* ${limpio(compra.titulo)}`)
  L.push(...lineasPersonas(d.personas))
  if (orden.condicion_pago) L.push(`📋 *Condición:* ${condicionTxt(orden.condicion_pago)}`)
  L.push(`💵 *Monto:* ${montoConBs(orden.moneda, orden.total, orden.total_bs)}`)
  if (d.cotizacion) L.push(...lineasPago(d.cotizacion, d.metodo))
  if (limpio(d.referencia)) L.push(`🧾 *Referencia:* ${limpio(d.referencia)}`)
  L.push(`📊 *Estado:* *${limpio(d.estado)}*`)
  if (limpio(d.empresa)) L.push(`🏢 *${limpio(d.empresa)}*`)
  return L.join('\n')
}
