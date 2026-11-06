/*
  LOS MENSAJES DE WHATSAPP DE COMPRAS

  Tomados de MGG (`src/modules/pedidos/ordenPagoTxt.ts`) y adaptados a La
  Cantera, que es bimoneda y cuyo pago lo decide quien aprueba dentro de
  Compras —Tesorería no se vincula—.

  Uno por paso, como en MGG:
  - «Solicitud de pedido»: lo que se pide, para el almacén general.
  - «Revisión del almacén»: qué tiene (lo entrega) y qué va a Compras.
  - «Para aprobar»: la solicitud en «Órdenes pendientes por aprobar», con el
    pago que Compras dejó indicado.
  - «Para pagar»: la orden aprobada que falta pagar, o la cuenta abierta.
  - «Estado del pago»: PAGADA, o NO PAGADA con su motivo.
  - «Recepción» y «Finalizada».
  - Reportes del tablero: «Pendientes por pagar» y «Reporte de compras».

  ⚠ NINGÚN EMOJI LLEVA EL SELECTOR U+FE0F. WhatsApp normaliza el texto del
  enlace y del otro lado llega un cuadrito. Por eso aquí solo van emojis que son
  de color por sí mismos (📌 y no 🗒️). Los `*` son las negritas de WhatsApp.

  Nunca salen solos: los abre un botón, y se ven antes de mandarlos.
*/
import type { Compra, Cotizacion, Orden, Tarjeta } from '@/lib/api/compras'
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

type OrdenDelMensaje = Pick<
  Orden,
  'numero' | 'moneda' | 'total' | 'total_bs' | 'proveedor' | 'condicion_pago' | 'renglones'
>

const cantidadTxt = (c: string | number, u?: string | null) =>
  `${Number(c).toLocaleString('es-VE', { maximumFractionDigits: 2 })}${limpio(u) ? ` ${limpio(u)}` : ''}`

/** «• BOMBA: 12 de 20 UND», renglón por renglón. */
function lineasRecibido(orden: OrdenDelMensaje): string[] {
  return [...(orden.renglones ?? [])]
    .sort((a, b) => a.linea - b.linea)
    .map((r) => {
      const pedida = Number(r.cantidad)
      const llego = Number(r.cantidad_recibida)
      const marca = llego >= pedida - 0.0001 ? '✅' : llego > 0 ? '🟡' : '⏳'
      return `${marca} ${limpio(r.descripcion)}: ${cantidadTxt(llego)} de ${cantidadTxt(pedida, r.unidad)}`
    })
}

/**
 * El comprobante de recepción (fase 4), con la forma del de MGG: qué llegó al
 * almacén general de cada renglón y si la orden quedó completa.
 */
export function textoRecepcion(d: {
  compra?: Partial<Pick<Compra, 'numero' | 'titulo' | 'prioridad'>> | null
  orden: OrdenDelMensaje
  almacen?: string | null
  recibio?: string | null
  nota?: string | null
  fecha?: string | null
  personas?: PersonasCompra
  empresa?: string | null
}): string {
  const { compra, orden } = d
  const completa = (orden.renglones ?? []).every(
    (r) => Number(r.cantidad_recibida) >= Number(r.cantidad) - 0.0001,
  )
  const L: string[] = []
  L.push('📥 *RECEPCIÓN EN ALMACÉN*')
  L.push(`📄 *Orden:* ${orden.numero}${compra?.numero ? ` (${compra.numero})` : ''}`)
  L.push(`🏭 *Proveedor:* ${orden.proveedor?.nombre ?? '—'}`)
  L.push(`🏬 *Almacén:* ${limpio(d.almacen) || 'ALMACÉN GENERAL'}`)
  if (limpio(compra?.titulo)) L.push(`📝 *Detalle:* ${limpio(compra?.titulo)}`)
  L.push(...lineasPersonas({ solicita: d.personas?.solicita }))
  L.push('', `📦 *Materiales (${(orden.renglones ?? []).length}):*`, ...lineasRecibido(orden))
  L.push('', completa ? '📊 *Estado:* *RECIBIDA COMPLETA*' : '📊 *Estado:* *RECIBIDA EN PARTE*')
  if (limpio(d.nota)) L.push(`📝 *Nota:* ${limpio(d.nota)}`)
  if (limpio(d.recibio)) L.push(`👷 *Recibido por:* ${limpio(d.recibio)}`)
  L.push(`🕒 ${d.fecha ? fechaCorta(d.fecha) : fechaHoraTxt()}`)
  if (limpio(d.empresa)) L.push('', `🏢 *${limpio(d.empresa)}*`)
  return L.join('\n')
}

/**
 * La compra cerrada (fase 4): llegó todo y está pagada.
 */
export function textoFinalizada(d: {
  compra: Pick<Compra, 'numero' | 'titulo' | 'prioridad'>
  orden: OrdenDelMensaje & Pick<Orden, 'fecha_pago'>
  nota?: string | null
  personas?: PersonasCompra
  empresa?: string | null
}): string {
  const { compra, orden } = d
  const L: string[] = []
  L.push(`🔹 *ORDEN:* ${orden.numero} (${compra.numero})`)
  L.push('✅ *COMPRA FINALIZADA*')
  L.push(`🏭 *Proveedor:* ${orden.proveedor?.nombre ?? '—'}`)
  L.push(`📝 *Detalle:* ${limpio(compra.titulo)}`)
  L.push(...lineasPersonas(d.personas))
  if (orden.condicion_pago) L.push(`📋 *Condición:* ${condicionTxt(orden.condicion_pago)}`)
  L.push(`💵 *Monto:* ${montoConBs(orden.moneda, orden.total, orden.total_bs)}`)
  if (orden.fecha_pago) L.push(`💳 *Pagada:* ${orden.fecha_pago.split('-').reverse().join('/')}`)
  L.push('📦 *Recibida completa en el almacén general*')
  if (limpio(d.nota)) L.push(`📌 *Nota:* ${limpio(d.nota)}`)
  if (limpio(d.empresa)) L.push('', `🏢 *${limpio(d.empresa)}*`)
  return L.join('\n')
}

/**
 * La respuesta del almacén general (fase 2): qué entrega, con qué solicitud de
 * salida, y qué pasa a Compras. Si entregó todo, la compra queda FINALIZADA.
 *
 * `faltan` son los renglones que siguen en el pedido después de la revisión,
 * con lo que falta.
 */
export function textoRevisionAlmacen(d: {
  compra: Pick<Compra, 'numero' | 'titulo' | 'prioridad' | 'estado' | 'salida_almacen_numero' | 'revision_almacen_nota'>
  entregado: { descripcion: string; cantidad: string | number; unidad?: string | null; articulo?: string | null }[]
  faltan: { descripcion: string; cantidad: string | number; unidad?: string | null }[]
  personas?: PersonasCompra
  empresa?: string | null
}): string {
  const { compra } = d
  const finalizada = compra.estado === 'FINALIZADA'
  const cant = (c: string | number, u?: string | null) =>
    `${Number(c).toLocaleString('es-VE', { maximumFractionDigits: 2 })}${limpio(u) ? ` ${limpio(u)}` : ''}`
  const L: string[] = []
  L.push(`✅ *ALMACÉN GENERAL HA REVISADO EL PEDIDO ${compra.numero}*`)
  L.push(`📅 ${fechaHoraTxt()}`)
  if (finalizada) L.push('🏁 *FINALIZADA: el almacén entrega todo*')
  if (compra.prioridad === 'URGENTE') L.push('🚨 *URGENTE*')
  L.push(`📝 *Detalle:* ${limpio(compra.titulo)}`)
  L.push(...lineasPersonas({ solicita: d.personas?.solicita }))

  if (d.entregado.length > 0) {
    L.push('', `📦 *TIENE (lo entrega almacén) · ${d.entregado.length}:*`)
    for (const r of d.entregado) {
      L.push(`• ${limpio(r.descripcion)}: ${cant(r.cantidad, r.unidad)}${limpio(r.articulo) ? ` (${limpio(r.articulo)})` : ''}`)
    }
    if (limpio(compra.salida_almacen_numero)) L.push(`🧾 *Solicitud de salida:* ${limpio(compra.salida_almacen_numero)}`)
  } else {
    L.push('', '📦 *TIENE (lo entrega almacén):*', '• Nada de lo solicitado')
  }

  if (!finalizada && d.faltan.length > 0) {
    L.push('', `🛒 *VA A SOLICITAR A COMPRAS · ${d.faltan.length}:*`)
    for (const r of d.faltan) L.push(`• ${limpio(r.descripcion)}: ${cant(r.cantidad, r.unidad)}`)
  } else {
    L.push('', '🛒 *VA A SOLICITAR A COMPRAS:* nada, el almacén tiene todo.')
  }
  if (limpio(compra.revision_almacen_nota)) L.push('', `📌 *Nota:* ${limpio(compra.revision_almacen_nota)}`)
  if (limpio(d.empresa)) L.push('', `🏢 *${limpio(d.empresa)}*`)
  return L.join('\n')
}

const fechaHoraTxt = (iso?: string | null) => {
  const d = iso ? new Date(iso) : new Date()
  return new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

const fechaCorta = (ymd?: string | null) => (ymd ? ymd.slice(0, 10).split('-').reverse().join('/') : '')

/**
 * La solicitud de pedido (como el «WhatsApp de la SP» de MGG): qué se pide,
 * para qué y quién. Va al almacén general, que es el primero que lo revisa.
 */
export function textoSolicitudPedido(d: {
  compra: Pick<
    Compra,
    'numero' | 'titulo' | 'justificacion' | 'prioridad' | 'requerida_para' | 'creada_en' | 'enviada_en'
  >
  renglones: { descripcion: string; cantidad: string | number; unidad?: string | null; observacion?: string | null }[]
  personas?: PersonasCompra
  cargo?: string | null
  empresa?: string | null
}): string {
  const { compra } = d
  const L: string[] = []
  L.push(`📋 *SOLICITUD DE PEDIDO ${compra.numero}*`)
  if (compra.prioridad === 'URGENTE') L.push('🚨 *URGENTE*')
  else if (compra.prioridad === 'ALTA') L.push('🟠 *Prioridad alta*')
  L.push(`📅 ${fechaHoraTxt(compra.enviada_en ?? compra.creada_en)}`)
  L.push('📍 Llega al: ALMACÉN GENERAL')
  if (compra.requerida_para) L.push(`⏰ Se necesita para el: ${fechaCorta(compra.requerida_para)}`)
  if (limpio(d.personas?.solicita)) {
    L.push(`👤 Solicita: ${limpio(d.personas?.solicita)}${limpio(d.cargo) ? ` — ${limpio(d.cargo)}` : ''}`)
  }
  L.push(`📝 *Detalle:* ${limpio(compra.titulo)}`)
  if (limpio(compra.justificacion)) L.push(`🎯 Para qué: ${limpio(compra.justificacion)}`)
  L.push('', `*PRODUCTOS SOLICITADOS (${d.renglones.length}):*`)
  for (const r of d.renglones) {
    L.push(`• ${limpio(r.descripcion)} — ${cantidadTxt(r.cantidad, r.unidad)}${limpio(r.observacion) ? ` (${limpio(r.observacion)})` : ''}`)
  }
  if (limpio(d.empresa)) L.push('', `🏢 *${limpio(d.empresa)}*`)
  return L.join('\n')
}

/**
 * Para pagar (como el «WhatsApp para pagar» de MGG): la orden aprobada que
 * falta pagar, con el monto y los datos del beneficiario. A crédito no lleva
 * los datos: dice hasta cuándo hay.
 */
export function textoParaPagar(d: {
  compra: Pick<Compra, 'numero' | 'titulo' | 'prioridad' | 'justificacion'>
  orden: Pick<
    Orden,
    'numero' | 'moneda' | 'total' | 'total_bs' | 'proveedor' | 'condicion_pago' | 'credito_vence' | 'tasa'
  >
  cotizacion?: Pick<Cotizacion, 'pago_metodo' | 'pago_moneda' | 'pago_datos'> | null
  aprobadaEl?: string | null
  productos?: number
  personas?: PersonasCompra
  metodo: NombreDeMetodo
  empresa?: string | null
}): string {
  const { compra, orden } = d
  const credito = !!orden.credito_vence
  const L: string[] = []
  L.push(`🔹 *ORDEN:* ${orden.numero} (${compra.numero})`)
  L.push(credito ? '💳 *CUENTA ABIERTA · por pagar al vencer*' : '💰 *Aprobada · por pagar*')
  L.push(compra.prioridad === 'URGENTE' ? '🚨 *Requerimiento:* URGENTE' : '🟢 *Requerimiento:* Normal')
  L.push(`🏭 *Proveedor:* ${orden.proveedor?.nombre ?? '—'}`)
  L.push(`📝 *Detalle:* ${limpio(compra.titulo)}`)
  if (limpio(compra.justificacion)) L.push(`📌 *Para qué:* ${limpio(compra.justificacion)}`)
  L.push(...lineasPersonas(d.personas).map((x) => x.replace('👔 *Aprobó:*', '👔 *Autorizó:*')))
  if (d.aprobadaEl) L.push(`📅 *Fecha de aprobación:* ${d.aprobadaEl}`)
  if (d.productos) L.push(`📦 *Productos:* ${d.productos}`)
  if (orden.condicion_pago) L.push(`📋 *Condición:* ${condicionTxt(orden.condicion_pago)}`)
  L.push(`💵 *Total:* ${dinero(orden.moneda, orden.total)}`)
  if (orden.moneda !== 'VES' && orden.total_bs != null) {
    L.push(`💱 *En Bs:* ${dinero('VES', orden.total_bs)}${orden.tasa ? ` (tasa ${Number(orden.tasa).toLocaleString('es-VE', { maximumFractionDigits: 4 })})` : ''}`)
  }
  if (credito) L.push(`⏰ *Vence el:* ${fechaCorta(orden.credito_vence)}`)
  else if (d.cotizacion) L.push(...lineasPago(d.cotizacion, d.metodo))
  if (limpio(d.empresa)) L.push(`🏢 *${limpio(d.empresa)}*`)
  return L.join('\n')
}

/** Lo que el tablero sabe de cada compra; basta para los reportes. */
type TarjetaDelReporte = Pick<
  Tarjeta,
  'numero' | 'titulo' | 'orden_numero' | 'proveedor' | 'moneda' | 'total' | 'total_usd' | 'total_bs' | 'columna' | 'credito_vence' | 'prioridad'
>

const usd = (n: number) => dinero('USD', n)
const bs = (n: number) => dinero('VES', n)

function bloque(titulo: string, lista: TarjetaDelReporte[], conVence = false): { L: string[]; usd: number; bs: number } {
  const L: string[] = []
  let tUsd = 0
  let tBs = 0
  if (lista.length === 0) return { L, usd: 0, bs: 0 }
  L.push('', `${titulo} · ${lista.length}*`)
  lista.forEach((t, i) => {
    const u = Number(t.total_usd ?? 0)
    const b = Number(t.total_bs ?? 0)
    tUsd += u
    tBs += b
    const monto = t.total != null && t.moneda ? dinero(t.moneda, t.total) : 'sin monto'
    const enBs = t.moneda && t.moneda !== 'VES' && t.total_bs != null ? ` (${bs(b)})` : ''
    L.push(
      `${i + 1}. ${t.orden_numero ?? t.numero} · ${limpio(t.proveedor) || limpio(t.titulo)} — ${monto}${enBs}${t.prioridad === 'URGENTE' ? ' 🚨' : ''}`,
    )
    if (conVence && t.credito_vence) L.push(`   ⏰ vence el ${fechaCorta(t.credito_vence)}`)
  })
  L.push(`*Subtotal:* ${usd(tUsd)} · ${bs(tBs)}`)
  return { L, usd: tUsd, bs: tBs }
}

/** «Pendientes por pagar» del tablero (como el de MGG). */
export function textoPendientesPorPagar(tarjetas: TarjetaDelReporte[], empresa?: string | null): string {
  const porPagar = tarjetas.filter((t) => t.columna === 'APROBADA')
  const credito = tarjetas.filter((t) => t.columna === 'CREDITO')
  const L: string[] = ['📊 *PENDIENTES POR PAGAR*', `📅 ${fechaHoraTxt()}`]
  if (porPagar.length + credito.length === 0) {
    L.push('', '✅ No hay pendientes por pagar en este momento.')
  } else {
    L.push(`🧾 ${porPagar.length + credito.length} pendiente(s)${credito.length ? ` · ${credito.length} a crédito` : ''}`)
    const a = bloque('📦 *ÓRDENES POR PAGAR', porPagar)
    L.push(...a.L)
    if (porPagar.length) L.push('', '💰 *TOTAL POR PAGAR*', `${usd(a.usd)} · ${bs(a.bs)}`)
    const c = bloque('💳 *CUENTAS A CRÉDITO (aparte del total)', credito, true)
    L.push(...c.L)
  }
  if (limpio(empresa)) L.push('', `🏢 *${limpio(empresa)}*`)
  return L.join('\n')
}

/** El reporte del tablero por etapa (como el «Reporte por renglón» de MGG). */
export function textoReporteCompras(tarjetas: TarjetaDelReporte[], empresa?: string | null): string {
  const etapas: { col: string[]; titulo: string; vence?: boolean }[] = [
    { col: ['REVISION'], titulo: '🏬 *EN REVISIÓN DEL ALMACÉN' },
    { col: ['PEDIDO', 'CONFIRMADA'], titulo: '🛒 *POR COTIZAR' },
    { col: ['GERENTE'], titulo: '⏳ *PENDIENTE POR APROBAR' },
    { col: ['APROBADA'], titulo: '💰 *POR PAGAR' },
    { col: ['CREDITO'], titulo: '💳 *CUENTAS A CRÉDITO', vence: true },
    { col: ['PAGADA'], titulo: '📦 *PAGADA · POR RECIBIR' },
    { col: ['RECIBIDA'], titulo: '📥 *RECIBIDA · POR FINALIZAR' },
  ]
  const activas = tarjetas.filter((t) => etapas.some((e) => e.col.includes(t.columna)))
  const L: string[] = ['📊 *REPORTE DE COMPRAS*', `📅 ${fechaHoraTxt()}`]
  if (activas.length === 0) {
    L.push('', '✅ No hay compras pendientes en este momento.')
  } else {
    L.push(`🧾 ${activas.length} compra(s) en curso`)
    let tUsd = 0
    let tBs = 0
    for (const e of etapas) {
      const b = bloque(e.titulo, tarjetas.filter((t) => e.col.includes(t.columna)), e.vence)
      L.push(...b.L)
      tUsd += b.usd
      tBs += b.bs
    }
    L.push('', '💰 *TOTAL GENERAL*', `${usd(tUsd)} · ${bs(tBs)}`)
  }
  if (limpio(empresa)) L.push('', `🏢 *${limpio(empresa)}*`)
  return L.join('\n')
}

/**
 * Los renglones tal como se pidieron. Lo que el almacén entregó entero ya no
 * está en el pedido: se recupera de lo atendido, con la cantidad pedida.
 */
export function renglonesComoSePidieron(
  compra: Pick<Compra, 'renglones' | 'atendido'>,
): { linea: number; descripcion: string; cantidad: string; unidad: string | null; observacion: string | null }[] {
  const atendidos = (compra.atendido ?? []).filter((a) => !a.sin_salida_en && a.linea != null)
  const lineas = new Set(atendidos.map((a) => a.linea))
  return [
    ...atendidos.map((a) => ({
      linea: a.linea ?? 0,
      descripcion: a.descripcion,
      cantidad: a.cantidad_pedida,
      unidad: a.unidad,
      observacion: null,
    })),
    ...(compra.renglones ?? [])
      .filter((r) => !lineas.has(r.linea))
      .map((r) => ({
        linea: r.linea,
        descripcion: r.descripcion_pedida ?? r.descripcion,
        cantidad: r.cantidad,
        unidad: r.unidad,
        observacion: r.observacion,
      })),
  ].sort((a, b) => a.linea - b.linea)
}
