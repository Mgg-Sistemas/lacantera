/*
  PEDIDOS / COMPRAS COMO EN MGG · LO QUE NO ES PANTALLA

  Las etiquetas de los estados y de los eventos del historial, quién pide y
  quién cargó, y el reparto de la revisión del almacén. Copiado de MGG
  (`format.ts` STATUS_MAP, `PedidosPage.tsx` eventLabel, `quienSolicita.ts`,
  `revisionAlmacen.ts`) con una diferencia que manda en todo el archivo:

  UN SOLO ALMACÉN REVISA (decisión de la dueña, 07/11/2026). En MGG confirman
  Los Pinos y Matanza, y lo que tiene la sede que no es la de destino viaja por
  traslado. Aquí todo llega a ALM-GEN, así que la «sede» es una sola y no hay
  traslados. La forma de los datos se conserva —`almacen_sedes['ALM-GEN']`,
  `almacen_origenes['ALM-GEN']`— para que estas funciones lean lo mismo que en
  MGG y el día que haya otro almacén que revise baste con sumarlo aquí.
*/
import type { EventoHistorial, EstadoOrden, ItemOrden, MarcaAlmacen, Orden } from '@/lib/api/pedidos'

/** La única sede que revisa: el almacén general. */
export const SEDE_ALMACEN = 'ALM-GEN'
export const ETIQUETA_ALMACEN = 'Almacén General'

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

export type TonoEstado = 'info' | 'success' | 'warning' | 'royal' | 'danger' | 'neutral'

/** MGG `format.ts` STATUS_MAP: etiqueta y clase del badge. */
export const ESTADOS: Record<EstadoOrden, { label: string; tono: TonoEstado }> = {
  revision_almacen: { label: 'En revisión de almacén', tono: 'info' },
  atendida_almacen: { label: 'Atendida por almacén', tono: 'success' },
  pendiente: { label: 'Pendiente', tono: 'warning' },
  aprobada: { label: 'Aprobada', tono: 'success' },
  asignada: { label: 'Repartida entre proveedores', tono: 'info' },
  oc_creada: { label: 'Ordenes pendiente por aprobar', tono: 'warning' },
  confirmada_metodo: { label: 'Confirmada (indicar método de pago)', tono: 'warning' },
  cuenta_abierta: { label: 'Crédito · cuenta abierta', tono: 'warning' },
  oc_aprobada: { label: 'Confirmada pagar', tono: 'info' },
  por_recibir: { label: 'Pendiente por recepción', tono: 'royal' },
  pagada: { label: 'Pagada', tono: 'success' },
  recibida: { label: 'Recibida', tono: 'info' },
  finalizada: { label: 'Finalizada', tono: 'success' },
  cancelada: { label: 'Cancelada', tono: 'danger' },
  anulada: { label: 'Anulada', tono: 'danger' },
  desistida_proveedor: { label: 'Proveedor desistió', tono: 'warning' },
}

export const etiquetaEstado = (e: string | null | undefined): string =>
  (e && ESTADOS[e as EstadoOrden]?.label) || e || '—'

/** Pestaña SP con el flujo de almacén (MGG `KANBAN_COLS_PEDIDOS_ALMACEN`). */
export const KANBAN_COLS_PEDIDOS: { key: EstadoOrden; label: string }[] = [
  { key: 'revision_almacen', label: 'En revisión de almacén' },
  { key: 'pendiente', label: 'Pendiente' },
  { key: 'aprobada', label: 'Aprobada' },
  { key: 'recibida', label: 'Recibida' },
  { key: 'finalizada', label: 'Finalizada' },
  { key: 'atendida_almacen', label: 'Atendida por almacén' },
  { key: 'cancelada', label: 'Cancelada' },
]

/** Pestaña «🧾 Órdenes de Compra» (MGG `KANBAN_COLS_OC`). */
export const KANBAN_COLS_OC: { key: EstadoOrden; label: string }[] = [
  { key: 'aprobada', label: 'Pendiente (cargar ofertas)' },
  { key: 'oc_creada', label: 'Ordenes pendiente por aprobar' },
  { key: 'cuenta_abierta', label: 'Crédito / cuentas abiertas' },
  { key: 'confirmada_metodo', label: 'Confirmada (indicar método de pago)' },
  { key: 'oc_aprobada', label: 'Confirmada pagar' },
  { key: 'por_recibir', label: 'Pendiente por recepción' },
  { key: 'pagada', label: 'Pagada' },
  { key: 'recibida', label: 'Recibida' },
  { key: 'finalizada', label: 'Finalizada' },
  { key: 'anulada', label: 'Anulada' },
  { key: 'desistida_proveedor', label: 'Proveedor desistió' },
]

/**
 * Pestaña «🛠 Servicios» (MGG `KANBAN_COLS_SERVICIO`): el ciclo completo de una
 * OC en una sola pestaña, con los nombres de un servicio.
 */
export const KANBAN_COLS_SERVICIO: { key: EstadoOrden; label: string }[] = [
  { key: 'pendiente', label: 'Solicitado' },
  { key: 'aprobada', label: 'Aprobado (cotizar)' },
  { key: 'oc_creada', label: 'Pendiente por aprobación' },
  { key: 'cuenta_abierta', label: 'Crédito / cuenta abierta' },
  { key: 'confirmada_metodo', label: 'Confirmado (método de pago)' },
  { key: 'oc_aprobada', label: 'Confirmado pagar' },
  { key: 'por_recibir', label: 'Pendiente por realizar' },
  { key: 'pagada', label: 'Pagado' },
  { key: 'recibida', label: 'Servicio realizado' },
  { key: 'finalizada', label: 'Finalizado' },
  { key: 'cancelada', label: 'Cancelado' },
]

/**
 * MGG `FINALIDAD_MERCADO`. En MGG la Solicitud de Mercado no pasa por el
 * almacén; en La Cantera sí (la dueña, 09/11/2026): nace en revisión de
 * almacén como cualquier SP y el almacenista confirma qué tiene.
 */
export const FINALIDAD_MERCADO = 'PEDIDO PARA RESTABLECER EL MERCADO'

/**
 * ¿Es una Solicitud de Mercado (o una OC hija de una)? Las hijas heredan la
 * finalidad y la clasificación de la madre al repartirse entre proveedores.
 */
export const esMercado = (o: Pick<Orden, 'finalidad' | 'clasificacion'>): boolean =>
  o.finalidad === FINALIDAD_MERCADO || (o.clasificacion ?? []).includes('Mercado')

/** MGG: en la pestaña OC, 10 tarjetas por columna salvo «Pendiente (cargar ofertas)». */
export const TOPE_COLUMNA_OC = 10

/**
 * Las fases de la SP: lo único que ve quien no lleva Compras (MGG
 * `ESTADOS_FASES_SP`). Con «Repartida entre proveedores»: la SP ya aprobada
 * cuyas OC hijas cubren todo sigue siendo la solicitud de quien la pidió.
 */
export const ESTADOS_FASES_SP = new Set<EstadoOrden>([...KANBAN_COLS_PEDIDOS.map((c) => c.key), 'asignada'])

/** El color del punto de cada columna (MGG `app-shell.css`). */
export const ACENTO_COLUMNA: Partial<Record<EstadoOrden, TonoEstado>> = {
  pendiente: 'warning',
  aprobada: 'success',
  desistida_proveedor: 'warning',
  cancelada: 'danger',
  anulada: 'danger',
  recibida: 'info',
  pagada: 'success',
  revision_almacen: 'info',
  atendida_almacen: 'success',
}

// ---------------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------------

/** MGG `eventLabel`, con los dos eventos que aquí existen y allá no. */
const EVENTOS: Record<string, string> = {
  creada: 'Orden creada',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada por la empresa',
  desistida_proveedor: 'Proveedor desistió',
  proveedor_cambiado: 'Cambio de proveedor',
  editada: 'Orden editada',
  cantidades_editadas: 'Cantidades editadas',
  items_eliminados: 'Productos eliminados',
  oc_creada: 'OC creada (oferta elegida)',
  oc_editada: 'OC editada',
  nota_editada: 'Nota de la OC editada',
  oc_reabierta: 'OC reabierta · volver a cotizar y re-elegir oferta',
  oc_reabierta_edicion: 'OC modificada · vuelve a aprobación del Gerente',
  confirmada_metodo: 'OC confirmada · indicar método de pago',
  // La base arma el evento como 'confirmada_' || estado: con confirmada_metodo sale doble.
  confirmada_confirmada_metodo: 'OC confirmada · indicar método de pago',
  confirmada_por_recibir: 'OC confirmada · pendiente por recepción',
  confirmada_cuenta_abierta: 'OC confirmada · crédito (cuenta abierta)',
  metodo_pago: 'Método de pago indicado · enviada a pagar',
  // Sin Tesorería: MGG dice «(sigue en Tesorería)» y «Pago registrado (Tesorería)».
  metodo_pago_corregido: 'Método de pago corregido',
  // 08/11/2026: el IVA de la factura y la tasa BCV de las retenciones en Bs.
  datos_fiscales: 'IVA de la factura / tasa de las retenciones',
  devolucion_decidida: 'Compras decidió sobre un producto devuelto',
  oc_aprobada: 'Confirmada pagar',
  anticipo: 'Pago anticipado',
  abono: 'Abono registrado (crédito)',
  credito_saldado: 'Crédito saldado · pendiente por recepción',
  pagada: 'Pago registrado',
  recibida: 'Recepción confirmada',
  finalizada: 'Pedido finalizado',
  revisada_almacen: 'Revisada por almacén',
  destino_entrega: 'Destino de entrega indicado',
  // En MGG este evento sale con su nombre crudo («items_actualizados»): no
  // está en su tabla de etiquetas. Aquí se le pone una.
  items_actualizados: 'Ítems a comprar actualizados',
  // Propio de La Cantera: la solicitud de salida del almacén no se aprobó.
  salida_rechazada: 'El almacén no entregó · la salida no se aprobó',
  // Fase 2. En MGG estos tres salen con su nombre crudo; aquí, con etiqueta.
  proveedores_asignados: 'Proveedores asignados (sub-OC por proveedor)',
  modalidad_pago_cambiada: 'Modalidad de pago cambiada',
  anulada: 'OC anulada',
  // Fase 3, propios de La Cantera (sin Tesorería ni Retenciones).
  documento_retenciones: 'Documento y retenciones indicados',
  credito_a_recepcion: 'Crédito · enviada a Pendiente por recepción',
  // Fase 4. MGG tiene `recibida` y `finalizada`; la recepción parcial
  // acumulada, la evaluación como evento y el comprobante son de La Cantera.
  recibida_parcial: 'Recepción parcial en almacén',
  evaluacion: 'Proveedor evaluado',
  comprobante_adjunto: 'Factura / nota de entrega cargada',
  // Fase 5a. MGG deja constancia del servicio prestado con el mismo
  // `recibida`; aquí lleva su nombre. Los del servicio directo son de La
  // Cantera (en MGG ese historial solo guarda el anticipo).
  servicio_realizado: 'Servicio realizado',
  detalle_editado: 'Detalle del servicio editado',
  montado: 'Factura y monto cargados · por pagar',
  montos_editados: 'Montos editados',
  facturas_actualizadas: 'Facturas actualizadas',
}

export const etiquetaEvento = (ev: string): string => EVENTOS[ev] ?? ev

/** MGG `eventClass`: el color del punto. */
const CLASE_EVENTO: Record<string, TonoEstado> = {
  aprobada: 'success',
  rechazada: 'danger',
  cancelada: 'danger',
  desistida_proveedor: 'warning',
  proveedor_cambiado: 'info',
  editada: 'info',
  cantidades_editadas: 'info',
  oc_creada: 'info',
  oc_editada: 'info',
  nota_editada: 'info',
  oc_reabierta: 'warning',
  oc_reabierta_edicion: 'warning',
  confirmada_metodo: 'info',
  confirmada_confirmada_metodo: 'info',
  anticipo: 'info',
  confirmada_por_recibir: 'info',
  confirmada_cuenta_abierta: 'warning',
  metodo_pago: 'success',
  metodo_pago_corregido: 'warning',
  oc_aprobada: 'success',
  abono: 'info',
  credito_saldado: 'success',
  pagada: 'success',
  recibida: 'success',
  finalizada: 'success',
  revisada_almacen: 'info',
  salida_rechazada: 'warning',
  proveedores_asignados: 'info',
  modalidad_pago_cambiada: 'info',
  anulada: 'danger',
  documento_retenciones: 'info',
  credito_a_recepcion: 'info',
  recibida_parcial: 'warning',
  evaluacion: 'info',
  comprobante_adjunto: 'info',
  servicio_realizado: 'success',
  detalle_editado: 'info',
  montado: 'info',
  montos_editados: 'warning',
  facturas_actualizadas: 'info',
}

export const claseEvento = (ev: string): TonoEstado => CLASE_EVENTO[ev] ?? 'neutral'

/**
 * Lo que va detrás de la etiqueta: el cambio de proveedor «de A → B · motivo»
 * (MGG `extrasCambioProveedor`), « · motivo», o el detalle del almacén.
 */
export function extraEvento(h: EventoHistorial): string {
  const motivo = typeof h.motivo === 'string' && h.motivo.trim() ? ` · ${h.motivo}` : ''
  if (typeof h.proveedorAnterior === 'string' && typeof h.proveedorNuevo === 'string') {
    return ` · de ${h.proveedorAnterior} → ${h.proveedorNuevo}${motivo}`
  }
  if (h.evento === 'oc_creada' && typeof h.proveedor === 'string') {
    return ` · ${h.proveedor}${typeof h.oc_codigo === 'string' ? ` · ${h.oc_codigo}` : ''}${typeof h.parent === 'string' ? ` · de ${h.parent}` : ''}`
  }
  if (h.evento === 'desistida_proveedor' && typeof h.proveedor === 'string') return ` · ${h.proveedor}${motivo}`
  if (h.evento === 'proveedores_asignados' && Array.isArray(h.proveedores)) {
    return ` · ${(h.proveedores as unknown[]).join(', ')}${h.completo ? ' · todo asignado' : ' · queda algo por asignar'}`
  }
  if (h.evento === 'modalidad_pago_cambiada') {
    return ` · ${h.a === 'usd' ? 'Pago en $ (Divisa)' : 'Pago en Bs al cambio (tasa BCV)'}`
  }
  const pago = extraPago(h)
  if (pago) return pago
  const recepcion = extraRecepcion(h)
  if (recepcion) return recepcion
  if (motivo) return motivo
  if (
    (h.evento === 'revisada_almacen' || h.evento === 'salida_rechazada' || h.evento === 'creada') &&
    typeof h.detalle === 'string' &&
    h.detalle.trim()
  ) {
    return ` · ${h.detalle}`
  }
  return ''
}

const usd = (v: unknown): string => money(v as number)

/** Las retenciones de un evento: «IVA 75 % $12,00 · ISLR 2 % $2,00». */
function retencionesTxt(v: unknown): string {
  if (!Array.isArray(v) || !v.length) return ''
  return (v as Array<{ tipo?: string; modo?: string; valor?: number; monto?: number }>)
    .map((r) => `${r.tipo ?? ''} ${r.modo === 'monto' ? '(monto)' : `${r.valor ?? ''} %`} ${usd(r.monto)}`)
    .join(' · ')
}

const METODO_TXT: Record<string, string> = {
  divisas_efectivo: 'Divisas en efectivo',
  efectivo_bs: 'Efectivo (Bs)',
  transferencia: 'Transferencia',
  pago_movil: 'Pago móvil',
  binance_usdt: 'Binance / USDT',
  zelle: 'Zelle',
  otro: 'Otro',
}

function metodosTxt(v: unknown): string {
  if (!Array.isArray(v) || !v.length) return ''
  return (v as Array<{ metodo?: string; detalle?: string }>)
    .map((m) => conDetalle(m.metodo, m.detalle))
    .join(' + ')
}

/** «Otro: <detalle>» cuando el método «Otro» dice cuál es (09/11/2026). */
function conDetalle(metodo: unknown, detalle: unknown): string {
  const d = typeof detalle === 'string' ? detalle.trim() : ''
  if (metodo === 'otro' && d) return `Otro: ${d}`
  return METODO_TXT[String(metodo ?? '')] ?? String(metodo ?? '')
}

/** Lo que dicen los eventos del pago (fase 3): documento, retenciones, método, monto a pagar, referencia. */
function extraPago(h: EventoHistorial): string {
  const doc = h.comprobante === 'factura' ? 'Factura' : h.comprobante === 'nota_entrega' ? 'Nota de entrega' : ''
  const partes: string[] = []
  switch (h.evento) {
    case 'metodo_pago':
    case 'metodo_pago_corregido':
      partes.push(metodosTxt(h.metodos ?? (h.despues as { metodos?: unknown } | undefined)?.metodos), doc)
      if (retencionesTxt(h.retenciones)) partes.push(`Ret.: ${retencionesTxt(h.retenciones)}`)
      if (Number(h.descuento_pago) > 0) partes.push(`desc. ${usd(h.descuento_pago)}`)
      if (h.monto_a_pagar != null) partes.push(`a pagar ${usd(h.monto_a_pagar)}`)
      break
    case 'documento_retenciones':
      partes.push(doc)
      partes.push(retencionesTxt(h.retenciones) ? `Ret.: ${retencionesTxt(h.retenciones)}` : 'sin retenciones')
      if (h.monto_a_pagar != null) partes.push(`a pagar ${usd(h.monto_a_pagar)}`)
      if (h.saldo != null) partes.push(`saldo ${usd(h.saldo)}`)
      break
    case 'devolucion_decidida':
      if (typeof h.producto === 'string') partes.push(`${h.producto} ${fmtCant(h.cantidad as number)}${h.unidad ? ` ${h.unidad}` : ''}`)
      if (typeof h.motivo === 'string') partes.push(h.motivo)
      partes.push(
        h.decision === 'recotizar'
          ? `se vuelve a cotizar${h.nueva_sp ? ` en ${h.nueva_sp}` : ''}`
          : h.decision === 'descartar'
            ? 'no se repone'
            : 'lo cambia el proveedor',
      )
      if (typeof h.nota === 'string') partes.push(h.nota)
      break
    case 'datos_fiscales':
      partes.push(Number(h.iva_factura) > 0 ? `IVA de la factura ${usd(h.iva_factura)}` : 'sin IVA de la factura')
      if (Number(h.tasa) > 0) partes.push(`tasa BCV ${Number(h.tasa).toLocaleString('es-VE')}`)
      break
    case 'pagada':
      partes.push(usd(h.monto_usd ?? h.monto))
      if (h.moneda === 'Bs') partes.push(`Bs ${Number(h.monto).toLocaleString('es-VE', { minimumFractionDigits: 2 })} a ${h.tasa}`)
      if (typeof h.referencia === 'string') partes.push(`ref. ${h.referencia}`)
      if (typeof h.fecha === 'string') partes.push(`del ${h.fecha.split('-').reverse().join('/')}`)
      if (typeof h.comprobante_nombre === 'string') partes.push(`📎 ${h.comprobante_nombre}`)
      break
    case 'abono':
      partes.push(usd(h.monto), conDetalle(h.metodo, h.metodo_detalle))
      if (typeof h.referencia === 'string') partes.push(`ref. ${h.referencia}`)
      if (h.saldo != null) partes.push(`saldo ${usd(h.saldo)}`)
      break
    case 'credito_saldado':
    case 'credito_a_recepcion':
      if (h.abonado != null) partes.push(`abonado ${usd(h.abonado)}`)
      if (h.saldo != null) partes.push(`saldo ${usd(h.saldo)}`)
      break
    default:
      return ''
  }
  const t = partes.filter(Boolean).join(' · ')
  return t ? ` · ${t}` : ''
}

/** «5 · Excelente» (MGG `CALIDAD_LABEL`). */
export const CALIDAD_LABEL: Record<number, string> = {
  5: '5 · Excelente',
  4: '4 · Buena',
  3: '3 · Aceptable',
  2: '2 · Deficiente',
  1: '1 · Muy mala',
}

/** La calidad en estrellas: «Excelente» (CALIDAD_LABEL sin el número). */
export const CALIDAD_ESTRELLAS: Record<number, string> = Object.fromEntries(
  Object.entries(CALIDAD_LABEL).map(([n, t]) => [n, t.replace(/^\d+\s*·\s*/, '')]),
)

/** La puntualidad en estrellas (la dueña, 09/11/2026). */
export const PUNTUALIDAD_LABEL: Record<number, string> = {
  5: 'A tiempo o antes',
  4: 'Un día tarde',
  3: 'Algo tarde (2-3 días)',
  2: 'Tarde (4-7 días)',
  1: 'Muy tarde (más de 7 días)',
}

/** Las estrellas que sugieren los días (+ adelantado, − atrasado). */
export function estrellasPorDias(dias: number): number {
  const d = Math.round(num(dias))
  if (d >= 0) return 5
  if (d === -1) return 4
  if (d >= -3) return 3
  if (d >= -7) return 2
  return 1
}

/** Los días que se guardan cuando solo hay estrellas (sin fechas). */
export const DIAS_POR_ESTRELLAS: Record<number, number> = { 5: 0, 4: -1, 3: -3, 2: -7, 1: -15 }

/** «★★★★☆». */
export const estrellas = (n: number): string => {
  const k = Math.max(0, Math.min(5, Math.round(num(n))))
  return '★'.repeat(k) + '☆'.repeat(5 - k)
}

/** «en la fecha prometida», «2 día(s) antes», «3 día(s) después». */
export function textoPuntualidad(dias: number): string {
  const d = Math.round(num(dias))
  if (d === 0) return 'en la fecha prometida'
  return d > 0 ? `${d} día(s) antes de lo prometido (adelantado)` : `${Math.abs(d)} día(s) después de lo prometido (atrasado)`
}

/** Lo que dicen los eventos de la recepción y del cierre (fase 4). */
function extraRecepcion(h: EventoHistorial): string {
  const partes: string[] = []
  switch (h.evento) {
    case 'montado':
      if (h.total != null) partes.push(`total ${money(h.total as number)}`)
      if (h.facturas) partes.push(`${h.facturas} factura(s)`)
      if (h.pago_externo) partes.push('pago a externo')
      if (h.edicion) partes.push('corregido')
      break
    case 'montos_editados':
      if (h.antes != null && h.total != null) partes.push(`de ${money(h.antes as number)} a ${money(h.total as number)}`)
      if (h.pagado != null) partes.push(`pagado ${money(h.pagado as number)}`)
      break
    case 'facturas_actualizadas':
      if (h.facturas != null) partes.push(`${h.facturas} factura(s)`)
      if (Number(h.quitadas) > 0) partes.push(`${h.quitadas} quitada(s)`)
      break
    case 'servicio_realizado':
    case 'recibida':
    case 'recibida_parcial': {
      if (typeof h.recepcion === 'string') partes.push(h.recepcion)
      const ren = Array.isArray(h.renglones)
        ? (h.renglones as Array<{ nombre?: string; cantidad?: number; unidad?: string; pedido?: number; recibido?: number }>)
        : []
      if (ren.length) {
        partes.push(
          ren
            .map(
              (r) =>
                `${r.nombre ?? ''} ${fmtCant(r.cantidad)}${r.unidad ? ` ${r.unidad}` : ''}${
                  r.pedido != null && num(r.recibido) < num(r.pedido) ? ` (van ${fmtCant(r.recibido)} de ${fmtCant(r.pedido)})` : ''
                }`,
            )
            .join(', '),
        )
      }
      if (h.recibido_total != null) partes.push(`recibido ${money(h.recibido_total as number)}`)
      const noEntraron = Array.isArray(h.no_entraron)
        ? (h.no_entraron as Array<{ nombre?: string; cantidad?: number; unidad?: string; motivo?: string }>)
        : []
      if (noEntraron.length) {
        partes.push(
          `no entró: ${noEntraron
            .map(
              (r) =>
                `${r.nombre ?? ''} ${fmtCant(r.cantidad)}${r.unidad ? ` ${r.unidad}` : ''} (${
                  MOTIVO_NO_ENTRA[r.motivo as MotivoNoEntra] ?? r.motivo ?? ''
                })`,
            )
            .join(', ')}`,
        )
      }
      const faltan = Array.isArray(h.faltan) ? (h.faltan as Array<{ nombre?: string; falta?: number; unidad?: string }>) : []
      if (faltan.length) {
        partes.push(
          `${h.cerrada_sin_completar ? 'no llegó' : 'falta'}: ${faltan.map((f) => `${f.nombre ?? ''} ${fmtCant(f.falta)}${f.unidad ? ` ${f.unidad}` : ''}`).join(', ')}`,
        )
      }
      if (h.sin_inventario) partes.push('sin sumar al inventario')
      if (Array.isArray(h.fichas_creadas) && h.fichas_creadas.length) partes.push(`ficha nueva: ${(h.fichas_creadas as string[]).join(', ')}`)
      if (Array.isArray(h.marcas_cambiadas) && h.marcas_cambiadas.length) partes.push(`otra marca: ${(h.marcas_cambiadas as string[]).join(', ')}`)
      if (typeof h.nota === 'string' && h.nota.trim()) partes.push(`📝 ${h.nota}`)
      break
    }
    case 'evaluacion':
      if (h.calidad != null) partes.push(`${estrellas(h.calidad as number)} ${CALIDAD_LABEL[num(h.calidad)] ?? h.calidad}`)
      if (h.puntualidad != null) partes.push(`🕒 ${estrellas(h.puntualidad as number)} ${PUNTUALIDAD_LABEL[num(h.puntualidad)] ?? ''}`.trim())
      if (h.puntualidad_dias != null) partes.push(textoPuntualidad(h.puntualidad_dias as number))
      if (typeof h.comentario === 'string' && h.comentario.trim()) partes.push(h.comentario)
      break
    case 'finalizada':
      if (typeof h.factura === 'string') partes.push(`📎 ${h.factura}`)
      break
    case 'comprobante_adjunto':
      partes.push(h.tipo === 'nota_entrega' ? 'Nota de entrega' : 'Factura')
      if (typeof h.archivo === 'string') partes.push(`📎 ${h.archivo}`)
      break
    default:
      return ''
  }
  const t = partes.filter(Boolean).join(' · ')
  return t ? ` · ${t}` : ''
}

// ---------------------------------------------------------------------------
// La recepción (fase 4)
// ---------------------------------------------------------------------------

/** Lo recibido de un renglón (acumulado), en la unidad de compra. */
export const recibidoDe = (it: ItemOrden): number => num(it.cantidad_recibida)

/** Lo que falta por llegar de un renglón. */
/** Lo que ya no se espera: se devolvió y Compras lo recotizó o lo descartó (09/11/2026). */
export const devueltaDe = (it: ItemOrden): number => num(it.cantidad_devuelta)
export const faltaDe = (it: ItemOrden): number => Math.max(r4(num(it.cantidad) - recibidoDe(it) - devueltaDe(it)), 0)

/** Por qué un producto no entró en la recepción (09/11/2026). */
export type MotivoNoEntra = 'no_llego' | 'cambio' | 'equivocacion' | 'defectuoso'
export const MOTIVO_NO_ENTRA: Record<MotivoNoEntra, string> = {
  no_llego: 'No llegó (queda pendiente)',
  cambio: 'Lo va a cambiar el proveedor',
  equivocacion: 'Equivocación en la compra',
  defectuoso: 'Vino defectuoso',
}

/** La unidad en que se cuenta al recibir: la de compra (BULTO) o la de uso. */
export const unidadRecepcion = (it: ItemOrden): string => (it.unidad_compra || it.unidad || '').trim()

/** Los renglones que se reciben (los que se compran). */
export const renglonesARecibir = (o: Pick<Orden, 'items'>): ItemOrden[] => (o.items ?? []).filter((it) => it.comprar !== false)

/** ¿Hubo ya alguna recepción? */
export const tieneRecepcion = (o: Pick<Orden, 'recibido_total' | 'recibida_en'>): boolean =>
  o.recibido_total != null || !!o.recibida_en

/** MGG `recibirOrdenParcial`: estados recibibles, sin `recibida_en`. */
export const esRecibible = (o: Pick<Orden, 'estado' | 'recibida_en' | 'oc_codigo'>): boolean =>
  !!o.oc_codigo && !o.recibida_en && ['por_recibir', 'cuenta_abierta', 'pagada'].includes(o.estado)

/** «Recibido x de y»: cuántos renglones están completos. */
export function progresoRecepcion(o: Pick<Orden, 'items'>): { completos: number; total: number; parcial: boolean } {
  const ren = renglonesARecibir(o)
  const completos = ren.filter((it) => faltaDe(it) <= 0).length
  return { completos, total: ren.length, parcial: ren.some((it) => recibidoDe(it) > 0) && completos < ren.length }
}

/**
 * MGG: «✓ Finalizar orden» con la orden recibida y pagada: recibida (no contra
 * entrega sin pagar), contra entrega pagada, o crédito saldado y recibido.
 */
export const puedeFinalizarse = (o: Pick<Orden, 'estado' | 'recibida_en' | 'pagada_en'>): boolean =>
  !!o.recibida_en && !!o.pagada_en && ['recibida', 'pagada', 'cuenta_abierta'].includes(o.estado)

// ---------------------------------------------------------------------------
// Quién pide y quién cargó (MGG `quienSolicita.ts`)
// ---------------------------------------------------------------------------

/** Quien pide el material. */
export const quienSolicita = (o: Pick<Orden, 'solicitante_nombre' | 'creado_por_nombre'>): string | null =>
  o.solicitante_nombre?.trim() || o.creado_por_nombre?.trim() || null

/** Quien cargó la solicitud, si no es la misma persona que pide. */
export function quienCargo(o: Pick<Orden, 'solicitante_nombre' | 'creado_por_nombre'>): string | null {
  const cargo = o.creado_por_nombre?.trim()
  if (!cargo) return null
  return cargo.toUpperCase() === (o.solicitante_nombre ?? '').trim().toUpperCase() ? null : cargo
}

/** «{unidad} — {persona}», o «—». */
export const solicitaDe = (o: Pick<Orden, 'unidad_solicitante' | 'solicitante_nombre' | 'creado_por_nombre'>): string =>
  [o.unidad_solicitante, quienSolicita(o)].filter(Boolean).join(' — ') || '—'

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const r4 = (n: number) => Math.round(n * 10000) / 10000

/** Cantidad en formato venezolano, sin ceros de sobra (2 · 0,5 · 1.250). */
export const fmtCant = (n: number | string | null | undefined): string =>
  num(n).toLocaleString('es-VE', { maximumFractionDigits: 3 })

/**
 * El SKU de un renglón tal como lo enseña la pantalla: el código del
 * inventario o, en uno de nombre general, su GEN-…. Los PDF lo escribían «—»
 * en los generales y la dueña lo vio (09/11/2026): lo que dice el modal es lo
 * que va en el papel.
 */
export const skuDe = (it: { sku?: string | null }): string => it.sku?.trim() || '—'

/** dd/mm/aaaa hh:mm en hora de Caracas. */
export function fechaHoraVE(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es-VE', {
    timeZone: 'America/Caracas',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** MGG `money(total, 'USD')`. */
export const money = (n: number | string | null | undefined): string =>
  `$${num(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** «hace 5 min / 3 h / 2 d» (MGG `relTime`). */
export function relTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'hace un momento'
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  return `hace ${Math.floor(s / 86400)} d`
}

// ---------------------------------------------------------------------------
// Búsqueda (MGG `buscarOrdenes.ts`, reducido a lo que hay en la fase 1)
// ---------------------------------------------------------------------------

export const sinTildes = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * Todas las palabras tienen que aparecer en algún dato de la orden. Entran la
 * finalidad, la clasificación y la marca «mercado» / «urgente»: la Solicitud
 * de Mercado se busca escribiendo «mercado» aunque su nota no lo diga
 * (09/11/2026). `extra` suma datos de fuera de la fila (los códigos de las OC
 * hijas de una SP repartida).
 */
export function coincide(
  o: Orden,
  texto: string,
  proveedor?: string | null,
  extra: readonly (string | null | undefined)[] = [],
): boolean {
  const palabras = sinTildes(texto).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return true
  const todo = sinTildes(
    [
      o.codigo,
      o.oc_codigo,
      proveedor,
      o.unidad_solicitante,
      o.solicitante_nombre,
      o.creado_por_nombre,
      o.notas,
      o.finalidad,
      o.motivo,
      ...(o.clasificacion ?? []),
      esMercado(o) ? 'mercado solicitud de mercado' : null,
      o.urgente ? 'urgente' : null,
      o.pago_referencia,
      etiquetaEstado(o.estado),
      ...extra,
      money(o.total),
      String(o.total),
      fechaHoraVE(o.creado_en),
      ...(o.items ?? []).map((i) => `${i.nombre} ${i.sku}`),
    ]
      .filter(Boolean)
      .join(' '),
  )
  return palabras.every((p) => todo.includes(p))
}

// ---------------------------------------------------------------------------
// La revisión del almacén (MGG `revisionAlmacen.ts`, una sola sede)
// ---------------------------------------------------------------------------

/** Lo que se pidió (antes de la revisión `cantidad`; después, `cantidad_solicitada`). */
export const cantidadSolicitada = (it: ItemOrden): number =>
  it.cantidad_solicitada != null ? num(it.cantidad_solicitada) : num(it.cantidad)

/** Los renglones desmarcados en la SP (`comprar === false`) no se piden. */
export const seRevisa = (it: ItemOrden): boolean => it.comprar !== false

/** Lo que el almacén tiene, acotado a lo pedido: nunca negativo ni de más. */
export const disponibleAcotado = (it: ItemOrden, disponible: number): number =>
  Math.min(Math.max(num(disponible), 0), cantidadSolicitada(it))

/** Cuánto suma o resta cada toque del «− / +»: de a 1, o todo si piden menos de 1. */
export const pasoStepper = (pedido: number): number => (num(pedido) >= 1 ? 1 : Math.max(num(pedido), 0))

export type EstadoStock = 'sin_vincular' | 'sin_stock' | 'parcial' | 'alcanza'

export function estadoStock(pedido: number, stock: number | null): EstadoStock {
  if (stock == null) return 'sin_vincular'
  if (stock <= 0) return 'sin_stock'
  return stock >= num(pedido) ? 'alcanza' : 'parcial'
}

/** La marca guardada del almacén en el renglón. */
export function marcaDeAlmacen(it: ItemOrden): MarcaAlmacen | undefined {
  const m = it.almacen_sedes?.[SEDE_ALMACEN]
  if (!m || typeof m !== 'object') return undefined
  return {
    disponible: num(m.disponible),
    revisado: m.revisado === true,
    articulo_id: m.articulo_id ?? null,
    por: m.por ?? null,
    por_nombre: m.por_nombre ?? null,
    en: m.en ?? null,
  }
}

export interface Marca {
  disponible: number
  revisado: boolean
  articulo_id: number | null
}

/** Las marcas de partida: lo guardado en la base, o nada revisado. */
export function marcasIniciales(items: ItemOrden[]): Record<string, Marca> {
  const out: Record<string, Marca> = {}
  for (const it of items) {
    const m = marcaDeAlmacen(it)
    if (!seRevisa(it) && !m) continue
    out[it.sku] = {
      disponible: m?.disponible ?? 0,
      revisado: m?.revisado === true,
      articulo_id: m?.articulo_id ?? it.articulo_id ?? null,
    }
  }
  return out
}

/** ¿Están todos los renglones revisados? Hace falta para confirmar. */
export function todoRevisado(items: ItemOrden[], marcas: Record<string, Marca>): boolean {
  const aRevisar = items.filter(seRevisa)
  return aRevisar.length > 0 && aRevisar.every((it) => marcas[it.sku]?.revisado)
}

export interface RenglonResumen {
  sku: string
  nombre: string
  unidad: string
  cantidad: number
}

export interface ResumenRevision {
  tiene: RenglonResumen[]
  falta: RenglonResumen[]
}

const base = (it: ItemOrden) => ({ sku: it.sku, nombre: it.nombre, unidad: it.unidad ?? '' })

/** Cuánto da el almacén de este renglón: lo cerrado, o las marcas en curso. */
export function repartoRenglon(it: ItemOrden, marca?: Marca): { almacen: number; falta: number } {
  const pedido = cantidadSolicitada(it)
  let almacen = 0
  if (marca) almacen = marca.revisado ? disponibleAcotado(it, marca.disponible) : 0
  else if (it.almacen_origenes && typeof it.almacen_origenes === 'object') almacen = num(it.almacen_origenes[SEDE_ALMACEN])
  else if (it.cantidad_almacen != null) almacen = disponibleAcotado(it, num(it.cantidad_almacen))
  else {
    const m = marcaDeAlmacen(it)
    almacen = m?.revisado ? disponibleAcotado(it, m.disponible) : 0
  }
  return { almacen: r4(almacen), falta: Math.max(r4(pedido - almacen), 0) }
}

/** Tiene / falta de la revisión: con las marcas en curso o con lo cerrado. */
export function resumenRevision(items: ItemOrden[], marcas?: Record<string, Marca>): ResumenRevision {
  const tiene: RenglonResumen[] = []
  const falta: RenglonResumen[] = []
  for (const it of items) {
    const m = marcas?.[it.sku]
    // Al cerrar, lo que el almacén atiende completo queda con `comprar=false`:
    // sigue contando como lo que tiene.
    if (!seRevisa(it) && it.cantidad_almacen == null && !m) continue
    const rep = repartoRenglon(it, m)
    if (rep.almacen > 0) tiene.push({ ...base(it), cantidad: rep.almacen })
    if (rep.falta > 0) falta.push({ ...base(it), cantidad: rep.falta })
  }
  return { tiene, falta }
}

/** Cómo va la revisión: revisados de cuántos, y si ya confirmó. */
export function estadoRevision(o: Pick<Orden, 'items' | 'revision_sedes'>): {
  confirmada: boolean
  revisados: number
  total: number
  confirmadaPor: string | null
  confirmadaEn: string | null
} {
  const items = (o.items ?? []).filter(seRevisa)
  const conf = o.revision_sedes?.[SEDE_ALMACEN] ?? null
  return {
    confirmada: !!conf,
    revisados: items.filter((it) => marcaDeAlmacen(it)?.revisado).length,
    total: items.length,
    confirmadaPor: conf?.confirmada_por_nombre ?? null,
    confirmadaEn: conf?.confirmada_en ?? null,
  }
}

/** «Almacén General ✓», «Almacén General 2/5» o «Almacén General pendiente». */
export function textoEstadoSedes(o: Pick<Orden, 'items' | 'revision_sedes'>): string {
  const e = estadoRevision(o)
  return e.confirmada
    ? `${ETIQUETA_ALMACEN} ✓`
    : e.revisados > 0
      ? `${ETIQUETA_ALMACEN} ${e.revisados}/${e.total}`
      : `${ETIQUETA_ALMACEN} pendiente`
}

/** MGG `resultadoRevision`: lo que dice la columna «Resultado» de Revisadas. */
export function resultadoRevision(o: Pick<Orden, 'estado'>): { texto: string; tono: TonoEstado } {
  if (o.estado === 'atendida_almacen') return { texto: 'Almacén tenía todo', tono: 'success' }
  if (o.estado === 'pendiente') return { texto: 'Pasó a Compras', tono: 'royal' }
  return { texto: `En Compras · ${etiquetaEstado(o.estado)}`, tono: 'info' }
}

/** ¿Cerró el almacén la revisión? (MGG `revisadaAlmacen` del detalle). */
export const revisadaPorAlmacen = (o: Pick<Orden, 'estado' | 'revisada_almacen_en' | 'items'>): boolean =>
  o.estado !== 'revision_almacen' &&
  (!!o.revisada_almacen_en || (o.items ?? []).some((it) => it.cantidad_solicitada != null))
