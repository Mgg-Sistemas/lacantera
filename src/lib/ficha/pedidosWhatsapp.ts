/*
  LOS MENSAJES DE WHATSAPP DE LA SOLICITUD DE PEDIDO (MGG `revisionAlmacen.ts`)

  Copiados línea por línea de MGG, con sus emojis: todos son de color por sí
  mismos y van SIN el selector U+FE0F, que algunos teléfonos pintan como un
  cuadrito. Nada se manda solo: el texto se enseña en `ModalWhatsappCompra` y
  desde ahí se copia o se abre WhatsApp (hoja de compartir en el teléfono,
  api.whatsapp.com en la computadora, nunca wa.me).

  Una diferencia, la de todo el módulo: revisa UN almacén (ALM-GEN). El
  mensaje de la revisión completa de MGG lista «Revisaron: Los Pinos — X ·
  Matanza — Y» y el reparto por sede; aquí hay una sola, así que sale
  «Revisó: …» y lo que tiene, sin bloques por sede ni traslados. Lo que el
  almacén entrega sale por una solicitud de salida, y el mensaje lo dice.
*/
import type { Abono, Orden } from '@/lib/api/pedidos'
import { labelCondicionPago } from '@/lib/ofertas'
import {
  basesPago,
  esCredito,
  etiquetaDocumento,
  labelMetodoPago,
  labelRetencion,
  montoAPagar,
  saldoCredito,
  type DatosPago,
} from '@/lib/pagos'
import {
  cantidadSolicitada,
  fechaHoraVE,
  fmtCant,
  quienSolicita,
  resumenRevision,
  seRevisa,
} from '@/lib/pedidos'

function linea(r: { nombre: string; cantidad: number; unidad?: string | null }): string {
  const u = (r.unidad ?? '').trim()
  return `• ${r.nombre} — ${fmtCant(r.cantidad)}${u ? ' ' + u : ''}`
}

/** MGG `mensajeSolicitudPedido`: la SP tal como se pidió. */
export function mensajeSolicitudPedido(o: Orden): string {
  const items = (o.items ?? []).filter((it) => seRevisa(it) || it.cantidad_solicitada != null)
  const partes: string[] = []
  partes.push(`📋 *SOLICITUD DE PEDIDO ${o.codigo}*`)
  if (o.urgente) partes.push('🚨 *URGENTE*')
  partes.push(`📅 ${fechaHoraVE(o.creado_en)}`)
  // MGG pone aquí la sede donde se necesita. Todo llega al almacén general.
  partes.push('📍 Se necesita en: Almacén General')
  const unidad = (o.unidad_solicitante ?? '').trim()
  const persona = (quienSolicita(o) ?? '').trim()
  if (unidad || persona) partes.push(`👤 Solicita: ${[unidad, persona].filter(Boolean).join(' — ')}`)
  const finalidad = (o.finalidad ?? o.motivo ?? '').trim()
  if (finalidad) partes.push(`🎯 Finalidad: ${finalidad}`)
  partes.push('')
  partes.push(`*PRODUCTOS SOLICITADOS (${items.length}):*`)
  for (const it of items) partes.push(linea({ nombre: it.nombre, cantidad: cantidadSolicitada(it), unidad: it.unidad }))
  const nota = (o.notas ?? '').trim()
  if (nota) {
    partes.push('')
    partes.push(`📝 ${nota}`)
  }
  return partes.join('\n')
}

// ---------------------------------------------------------------------------
// Fase 2: la OC (MGG `ordenPagoTxt.ts`)
// ---------------------------------------------------------------------------

/** MGG `montoTxt`: «$1.234,56» o «Bs 1.234,56». */
export function montoTxt(n: number | string | null | undefined, moneda = '$'): string {
  const v = (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return moneda === '$' ? `$${v}` : `${moneda} ${v}`
}

/** MGG `detalleTxt`: el motivo y la finalidad, sin repetir. */
export function detalleTxt(o: Pick<Orden, 'motivo' | 'finalidad'>): string {
  const motivo = (o.motivo ?? '').trim()
  const finalidad = (o.finalidad ?? '').trim()
  return [motivo, finalidad === motivo ? '' : finalidad].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}

/** Una cotización de la orden para el mensaje «para aprobar». */
export interface CotizacionMensaje {
  proveedor: string
  /** Monto final a pagar de la cotización, en $. */
  monto: number
  elegida: boolean
  /** Quién la escogió (solo la elegida). */
  elegidaPor?: string | null
}

/** MGG `lineasCotizaciones`: el monto en $ y en Bs con la tasa del día; sin tasa, solo en $. */
export function lineasCotizaciones(cotizaciones: CotizacionMensaje[], tasaBs?: number | null): string[] {
  if (!cotizaciones.length) return []
  const tasa = Number(tasaBs) > 0 ? Number(tasaBs) : null
  const montos = (n: number) => [montoTxt(n, '$'), tasa ? montoTxt(n * tasa, 'Bs') : null].filter(Boolean).join(' · ')
  const L: string[] = ['', `📊 *COTIZACIONES (${cotizaciones.length}):*`]
  cotizaciones.forEach((c, i) => {
    L.push(`• *Cotización ${i + 1}:* ${c.proveedor || '—'} · ${montos(c.monto)}${c.elegida ? ' ✅' : ''}`)
  })
  const i = cotizaciones.findIndex((c) => c.elegida)
  if (i >= 0) {
    const quien = (cotizaciones[i].elegidaPor ?? '').trim()
    L.push(`✅ *${quien ? `El analista ${quien} escogió` : 'Se escogió'} la Cotización ${i + 1}* (${cotizaciones[i].proveedor || '—'})`)
  }
  L.push('')
  return L
}

/**
 * MGG `textoOrdenAprobacion` («💬 WhatsApp para aprobar»): la OC está «Ordenes
 * pendiente por aprobar» y quien aprueba decide viendo lo esencial. Al pie va
 * el nombre de la empresa (en MGG, «MINERAL GROUP GUAYANA C.A.»).
 */
export function textoOrdenAprobacion(
  o: Orden,
  d: {
    proveedor: string
    condicion: string | null
    empresa: string
    cotizaciones?: CotizacionMensaje[]
    tasaBs?: number | null
  },
): string {
  const detalle = detalleTxt(o)
  const nota = (o.notas ?? '').trim()
  const productos = (o.items ?? []).filter((i) => i.comprar !== false)
  const solicita = (quienSolicita(o) ?? '').trim()
  const analista = (o.oc_creada_por_nombre ?? o.aprobada_por_nombre ?? '').trim()

  const L: string[] = []
  L.push(`🔹 *ORDEN:* ${o.oc_codigo ?? o.codigo}`)
  L.push('⏳ *Pendiente por aprobar*')
  if (o.urgente) L.push('🚨 *URGENTE*')
  L.push(`🏭 *Proveedor:* ${d.proveedor || '—'}`)
  if (detalle) L.push(`📝 *Detalle:* ${detalle}`)
  if (nota) L.push(`📌 *Nota:* ${nota.replace(/\s*\r?\n\s*/g, ' ')}`)
  if (solicita) L.push(`🙋 *Solicita:* ${solicita}`)
  if (analista) L.push(`🛒 *Analista de compras:* ${analista}`)
  if (productos.length) L.push(`📦 *Productos:* ${productos.length}`)
  if (d.condicion) L.push(`📋 *Condición:* ${d.condicion}`)
  L.push(...lineasCotizaciones(d.cotizaciones ?? [], d.tasaBs))
  L.push(`💵 *Total:* ${montoTxt(o.total, '$')}`)
  L.push(`🏢 *${d.empresa.toUpperCase()}*`)
  return L.join('\n')
}

// ---------------------------------------------------------------------------
// Fase 3: aprobación y pago (MGG `ordenPagoTxt.ts`, sin Tesorería)
// ---------------------------------------------------------------------------

/** MGG `bancoTxt`: «Banco de Venezuela (0102)». Aquí la lista ya dice «0102 · BANCO DE VENEZUELA». */
function bancoTxt(b?: string | null): string {
  const t = (b ?? '').trim()
  const m = /^(\d{4})\s*·\s*(.+)$/.exec(t)
  return m ? `${m[2]} (${m[1]})` : t
}

/** Las líneas «* Banco / * CI / * Tlf …» de un método con datos (MGG). */
function lineasDatosPago(metodo: string, d: DatosPago | undefined): string[] {
  if (!d) return []
  const L: string[] = []
  const add = (k: string, v?: string) => {
    if (v && v.trim()) L.push(`* ${k}: ${v.trim()}`)
  }
  if (metodo === 'pago_movil') {
    add('Banco', bancoTxt(d.banco))
    add('CI/RIF', d.ci_rif)
    add('Tlf', d.telefono)
  } else if (metodo === 'transferencia') {
    add('Titular', d.nombre)
    add('CI/RIF', d.ci)
    add('Banco', bancoTxt(d.banco))
    add('Cuenta', d.cuenta)
  } else if (metodo === 'zelle') {
    add('Titular', d.nombre)
    add('Correo', d.email)
  } else if (metodo === 'binance_usdt') {
    add('Correo/ID', d.email_o_id)
  }
  return L
}

/** Lo que el mensaje necesita además de la orden. */
export interface DatosMensajePago {
  proveedor: string
  empresa: string
  condicion: string | null
  cotizaciones?: CotizacionMensaje[]
  tasaBs?: number | null
}

const fechaDia = (iso: string): string => iso.slice(0, 10).split('-').reverse().join('/')

/**
 * MGG `textoOrdenPago` («💬 WhatsApp para pagar»), sin Tesorería: el documento,
 * cada retención y el «Monto a pagar» (total − descuento − retenciones), que
 * aquí siempre se restan. Con abonos, lo abonado y el saldo. Los métodos con
 * los datos del proveedor no salen en crédito (MGG).
 */
export function textoOrdenPago(o: Orden, d: DatosMensajePago): string {
  const detalle = detalleTxt(o)
  const nota = (o.notas ?? '').trim()
  const solicita = (quienSolicita(o) ?? '').trim()
  const analista = (o.oc_creada_por_nombre ?? o.aprobada_por_nombre ?? '').trim()
  const autorizo = (o.oc_aprobada_por_nombre ?? '').trim()
  const abonado = Number(o.abonado_total) || 0
  const credito = esCredito(o) || o.estado === 'cuenta_abierta' || abonado > 0
  const rets = o.retenciones ?? []
  const aPagar = montoAPagar(o)
  const tasa = Number(d.tasaBs) > 0 ? Number(d.tasaBs) : null

  const L: string[] = []
  L.push(`🔹 *ORDEN:* ${o.oc_codigo ?? o.codigo}`)
  L.push(o.urgente ? '🚨 *Requerimiento:* URGENTE' : '🟢 *Requerimiento:* Normal')
  L.push(`🏭 *Proveedor:* ${d.proveedor || '—'}`)
  if (detalle) L.push(`📝 *Detalle:* ${detalle}`)
  if (nota) L.push(`📌 *Nota:* ${nota.replace(/\s*\r?\n\s*/g, ' ')}`)
  if (solicita) L.push(`🙋 *Solicita:* ${solicita}`)
  if (analista) L.push(`🛒 *Analista de compras:* ${analista}`)
  if (autorizo) L.push(`👔 *Autorizó:* ${autorizo}`)
  if (o.oc_aprobada_en) L.push(`📅 *Fecha de aprobación:* ${fechaHoraVE(o.oc_aprobada_en)}`)
  if (d.condicion) L.push(`📋 *Condición:* ${d.condicion}`)
  L.push(...lineasCotizaciones(d.cotizaciones ?? [], d.tasaBs))
  L.push(`💵 *Total:* ${montoTxt(basesPago(o).total, '$')}`)
  if (o.comprobante_tipo) L.push(`🧾 *Documento:* ${etiquetaDocumento(o.comprobante_tipo)}`)
  if (Number(o.descuento_pago) > 0) L.push(`🏷 *Descuento en el pago:* −${montoTxt(o.descuento_pago, '$')}`)
  for (const r of rets) L.push(`🧾 *Retención ${labelRetencion(r)}:* −${montoTxt(r.monto, '$')}`)
  if (rets.length || Number(o.descuento_pago) > 0) L.push(`✅ *Monto a pagar:* ${montoTxt(aPagar, '$')}`)
  if (abonado > 0) {
    L.push(`✅ *Abonado:* ${montoTxt(abonado, '$')}`)
    L.push(`🔺 *Saldo pendiente:* ${montoTxt(saldoCredito(o), '$')}`)
  }
  const enBs = abonado > 0 ? saldoCredito(o) : aPagar
  if (tasa) {
    L.push(
      `💱 *En Bs:* ${montoTxt(enBs * tasa, 'Bs')} (tasa ${tasa.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })})`,
    )
  }
  if (!credito) {
    const metodos = o.metodo_pago ?? []
    if (!metodos.length) L.push('💳 *Pago:* (todavía sin método de pago indicado)')
    for (const m of metodos) {
      const conMonto = Number(m.monto) > 0 && !(metodos.length === 1 && Math.abs(Number(m.monto) - aPagar) < 0.01)
      L.push(`💳 *${labelMetodoPago(m.metodo)}:*${conMonto ? ` ${montoTxt(m.monto, m.moneda === 'USD' ? '$' : m.moneda)}` : ''}`)
      L.push(...lineasDatosPago(m.metodo, m.datos))
    }
  }
  L.push(`🏢 *${d.empresa.toUpperCase()}*`)
  return L.join('\n')
}

/** El aviso de que la OC se aprobó y adónde sigue (MGG lo dice en la campana). */
export function textoOcAprobada(o: Orden, d: { proveedor: string; empresa: string; condicion: string | null }): string {
  const sigue =
    o.estado === 'por_recibir'
      ? 'Pendiente por recepción (contra entrega: se paga lo recibido)'
      : o.estado === 'cuenta_abierta'
        ? 'Crédito · cuenta abierta (se paga con abonos)'
        : 'Indicar el método de pago'
  const L: string[] = []
  L.push(`✅ *OC APROBADA: ${o.oc_codigo ?? o.codigo}*`)
  if (o.urgente) L.push('🚨 *URGENTE*')
  L.push(`🏭 *Proveedor:* ${d.proveedor || '—'}`)
  const solicita = (quienSolicita(o) ?? '').trim()
  if (solicita) L.push(`🙋 *Solicita:* ${solicita}`)
  if (o.oc_aprobada_por_nombre) L.push(`👔 *Autorizó:* ${o.oc_aprobada_por_nombre}`)
  if (o.oc_aprobada_en) L.push(`📅 *Fecha de aprobación:* ${fechaHoraVE(o.oc_aprobada_en)}`)
  if (d.condicion) L.push(`📋 *Condición:* ${d.condicion}`)
  L.push(`➡ *Sigue:* ${sigue}`)
  L.push(`💵 *Total:* ${montoTxt(o.total, '$')}`)
  L.push(`🏢 *${d.empresa.toUpperCase()}*`)
  return L.join('\n')
}

/**
 * MGG `textoOrdenTesoreria` («PAGADA POR TESORERIA»); aquí paga Compras, y el
 * mensaje lleva la referencia, la fecha y que sigue la recepción.
 */
export function textoOrdenPagada(o: Orden, d: { proveedor: string; empresa: string }): string {
  const nota = (o.notas ?? '').trim()
  const analista = (o.oc_creada_por_nombre ?? o.aprobada_por_nombre ?? '').trim()
  const solicita = (quienSolicita(o) ?? '').trim()
  const L: string[] = []
  L.push(`🔹 *ORDEN:* ${o.oc_codigo ?? o.codigo}`)
  L.push(`🏭 *Proveedor:* ${d.proveedor || '—'}`)
  if (nota) L.push(`📌 *Nota del analista:* ${nota.replace(/\s*\r?\n\s*/g, ' ')}`)
  if (analista) L.push(`🛒 *Analista encargado:* ${analista}`)
  if (solicita) L.push(`🙋 *Solicita:* ${solicita}`)
  L.push(`💵 *Monto en $:* ${montoTxt(o.pago_monto_usd ?? montoAPagar(o), '$')}`)
  if (o.pago_moneda === 'Bs') {
    L.push(`💱 *Pagado en Bs:* ${montoTxt(o.pago_monto, 'Bs')} (tasa ${Number(o.pago_tasa).toLocaleString('es-VE')})`)
  }
  if (o.pago_referencia) L.push(`🧾 *Referencia:* ${o.pago_referencia}`)
  if (o.pago_fecha) L.push(`📅 *Fecha de pago:* ${fechaDia(o.pago_fecha)}`)
  if (o.pagada_por_nombre) L.push(`👤 *Registró:* ${o.pagada_por_nombre}`)
  L.push(`📊 *Estado:* *${o.estado === 'pagada' ? 'PAGADA' : 'PAGADA · PENDIENTE POR RECEPCIÓN'}*`)
  L.push(`🏢 *${d.empresa.toUpperCase()}*`)
  return L.join('\n')
}

/** El abono registrado, con lo abonado y el saldo. */
export function textoAbono(o: Orden, a: Abono, d: { proveedor: string; empresa: string }): string {
  const L: string[] = []
  L.push('💳 *ABONO REGISTRADO · CRÉDITO*')
  L.push(`🔹 *ORDEN:* ${o.oc_codigo ?? o.codigo}`)
  L.push(`🏭 *Proveedor:* ${d.proveedor || '—'}`)
  L.push(
    `💵 *Abono:* ${montoTxt(a.monto, '$')}${a.moneda === 'Bs' ? ` (${montoTxt(a.monto_moneda, 'Bs')} a ${Number(a.tasa).toLocaleString('es-VE')})` : ''}`,
  )
  L.push(`💳 *Método:* ${labelMetodoPago(a.metodo)}`)
  if (a.referencia) L.push(`🧾 *Referencia:* ${a.referencia}`)
  L.push(`📅 *Fecha:* ${fechaDia(a.fecha)}`)
  L.push(`💵 *Monto a pagar:* ${montoTxt(montoAPagar(o), '$')}`)
  L.push(`✅ *Abonado:* ${montoTxt(o.abonado_total, '$')}`)
  const saldo = saldoCredito(o)
  L.push(saldo > 0.01 ? `🔺 *Saldo pendiente:* ${montoTxt(saldo, '$')}` : '✅ *Crédito pagado en su totalidad*')
  L.push(`🏢 *${d.empresa.toUpperCase()}*`)
  return L.join('\n')
}

/** «📋 OC por lote»: las OC por aprobar, en un solo mensaje. */
export function textoLoteAprobacion(ordenes: Orden[], d: { proveedorDe: (o: Orden) => string; empresa: string }): string {
  const L: string[] = []
  L.push(`📋 *ÓRDENES DE COMPRA PENDIENTES POR APROBAR (${ordenes.length})*`)
  L.push(`📅 *Generado:* ${fechaHoraVE()}`)
  L.push('')
  ordenes.forEach((o, i) => {
    L.push(`${i + 1}. 🔹 *${o.oc_codigo ?? o.codigo}* · ${d.proveedorDe(o) || '—'}${o.urgente ? ' · 🚨 URGENTE' : ''}`)
    const sol = [o.unidad_solicitante, quienSolicita(o)].filter(Boolean).join(' — ')
    L.push(
      `    💵 ${montoTxt(o.total, '$')}${o.condiciones_pago ? ` · ${labelCondicionPago(o.condiciones_pago)}` : ''}${sol ? ` · 🙋 ${sol}` : ''}`,
    )
  })
  L.push('')
  L.push(`💰 *Total (${ordenes.length} órdenes):* *${montoTxt(ordenes.reduce((a, o) => a + (Number(o.total) || 0), 0), '$')}*`)
  L.push(`🏢 *${d.empresa.toUpperCase()}*`)
  return L.join('\n')
}

/** MGG `mensajeRevisionAlmacen`: lo que entrega el almacén y lo que va a Compras. */
export function mensajeRevisionAlmacen(o: Orden): string {
  const { tiene, falta } = resumenRevision(o.items ?? [])
  const partes: string[] = []
  partes.push(`✅ *ALMACÉN HA REVISADO LA ORDEN ${o.codigo}*`)
  partes.push(`📅 ${fechaHoraVE(o.revisada_almacen_en)}`)
  partes.push('📍 Se necesita en: Almacén General')
  const revisor = (o.revisada_almacen_por_nombre ?? '').trim()
  if (revisor) partes.push(`👤 Revisó: ${revisor}`)
  partes.push('')
  partes.push('📦 *TIENE (lo entrega almacén):*')
  if (!tiene.length) partes.push('• Nada de lo solicitado')
  else for (const r of tiene) partes.push(linea(r))
  // Propio de La Cantera: lo que entrega sale por una solicitud de salida.
  if (o.salida_almacen_numero) {
    partes.push('')
    partes.push(`📤 Sale por la solicitud de salida ${o.salida_almacen_numero}`)
  }
  partes.push('')
  if (falta.length) {
    partes.push('🛒 *VA A SOLICITAR A COMPRAS:*')
    for (const r of falta) partes.push(linea(r))
  } else {
    partes.push('🛒 *VA A SOLICITAR A COMPRAS:* nada, almacén tiene todo.')
  }
  const nota = (o.nota_almacen ?? '').trim()
  if (nota) {
    partes.push('')
    partes.push(`📝 ${nota}`)
  }
  return partes.join('\n')
}
