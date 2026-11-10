import type { EtapaVenta, TarjetaVenta } from '@/lib/api/ventasTablero'
import { dolares, dinero, fecha } from '@/lib/formato'
import { textoAnulada, textoCotizacion, textoDespachoAprobado, textoDespachoPorAprobar, textoFacturada, textoFinalizada } from '@/lib/ficha/ventasWhatsapp'

/*
  LO QUE NO ES PANTALLA DEL TABLERO DE VENTAS: columnas, etiquetas, chips y
  a qué pantalla de siempre lleva cada documento.
*/

export type Tono = 'royal' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export const COLUMNAS: { etapa: EtapaVenta; titulo: string; ayuda: string; tono: Tono }[] = [
  { etapa: 'cot', titulo: 'Cotizaciones', ayuda: 'Enviadas al cliente', tono: 'info' },
  { etapa: 'aprobar', titulo: 'Despacho por aprobar', ayuda: 'Se pidió despachar', tono: 'warning' },
  { etapa: 'despachada', titulo: 'Despachada · por cobrar', ayuda: 'Salió con su nota de entrega', tono: 'royal' },
  { etapa: 'facturada', titulo: 'Facturada · por cobrar', ayuda: 'Con número de control', tono: 'royal' },
  { etapa: 'cobrada', titulo: 'Cobrada', ayuda: 'Venta finalizada', tono: 'success' },
  { etapa: 'anulada', titulo: 'Anuladas · no aprobadas', ayuda: 'Con su motivo', tono: 'danger' },
]

export const TIPO_DOC: Record<TarjetaVenta['tipo'], string> = {
  COT: 'Cotización',
  SD: 'Despacho',
  NE: 'Nota de entrega',
  FAC: 'Factura',
}

export const MOTIVO_NO_DESPACHO = {
  sin_cupo: { icono: '💳', label: 'Cliente sin cupo de crédito', corto: 'Sin cupo' },
  deuda_vencida: { icono: '⏳', label: 'Cliente con deuda vencida', corto: 'Deuda vencida' },
  sin_material: { icono: '⛰', label: 'No hay material en el patio', corto: 'Sin material' },
  otro: { icono: '📝', label: 'Otro', corto: 'No aprobado' },
} as const

export function textoNoDespacho(t: Pick<TarjetaVenta, 'no_despacho_motivo' | 'no_despacho_detalle'>): string {
  if (!t.no_despacho_motivo) return ''
  const base = t.no_despacho_motivo === 'otro' ? '' : MOTIVO_NO_DESPACHO[t.no_despacho_motivo].label
  return [base, (t.no_despacho_detalle ?? '').trim()].filter(Boolean).join(': ')
}

const ESTADO_ANULADO: Record<string, string> = {
  RECHAZADA: 'No aprobada',
  CANCELADA: 'Cancelada',
  ANULADA: 'Anulada',
}
export const etiquetaAnulada = (t: TarjetaVenta) =>
  t.tipo === 'COT' && t.estado_doc === 'RECHAZADA' ? 'La rechazó el cliente' : (ESTADO_ANULADO[t.estado_doc] ?? t.estado_doc)

const CONDICION: Record<string, string> = {
  CONTADO: 'Contado',
  CREDITO_15: 'Crédito 15 días',
  CREDITO_30: 'Crédito 30 días',
  CREDITO_60: 'Crédito 60 días',
}
export const condicionTxt = (c?: string | null) => (c ? (CONDICION[c] ?? c) : null)

export const hoyIso = () => new Date().toLocaleDateString('en-CA')

export interface ChipTablero {
  tono: Tono
  texto: string
  titulo?: string
}

export function chipsDe(t: TarjetaVenta): ChipTablero[] {
  const c: ChipTablero[] = []
  const hoy = hoyIso()
  if (t.etapa === 'cot' && t.vence_el) {
    c.push(t.vence_el < hoy ? { tono: 'danger', texto: 'Cotización vencida' } : { tono: 'neutral', texto: `Válida hasta ${fecha(t.vence_el)}` })
  }
  if (t.etapa === 'aprobar' && t.no_despacho_motivo) {
    c.push({ tono: 'warning', texto: `${MOTIVO_NO_DESPACHO[t.no_despacho_motivo].icono} ${MOTIVO_NO_DESPACHO[t.no_despacho_motivo].corto}`, titulo: textoNoDespacho(t) })
  }
  if (t.pago_combinado) c.push({ tono: 'neutral', texto: '💱 Pago combinado' })
  if (t.tipo === 'NE' && t.etapa === 'despachada') {
    if (!t.cliente) c.push({ tono: 'warning', texto: 'Falta cliente' })
    if ((t.precios_pendientes ?? 0) > 0) c.push({ tono: 'warning', texto: 'Falta precio' })
    if (t.desde_salida) c.push({ tono: 'royal', texto: `Desde ${t.nota_salida ?? 'nota de salida'}` })
    if (t.facturable === false) c.push({ tono: 'neutral', texto: 'Respaldo' })
    if (Number(t.aplicado) > 0) c.push({ tono: 'success', texto: `Abonado ${dolares(Number(t.aplicado))}` })
  }
  if (t.pendiente_por_cobrar && t.fecha_pago && (t.etapa === 'despachada' || t.etapa === 'aprobar')) {
    c.push(t.vencida ? { tono: 'danger', texto: `Venció el ${fecha(t.fecha_pago)}` } : { tono: 'warning', texto: `Cobrar el ${fecha(t.fecha_pago)}` })
  }
  if (t.tipo === 'FAC') {
    const cond = condicionTxt(t.condicion)
    if (cond) c.push({ tono: cond.startsWith('Crédito') ? 'warning' : 'neutral', texto: cond })
    if (t.etapa === 'facturada' && t.vence_el) {
      c.push(t.vencida ? { tono: 'danger', texto: `Vencida desde ${fecha(t.vence_el)}` } : { tono: 'warning', texto: `Vence ${fecha(t.vence_el)}` })
    }
    if (t.etapa === 'facturada' && Number(t.cobrado) > 0) c.push({ tono: 'success', texto: `Cobrado ${dolares(Number(t.cobrado))}` })
  }
  if (t.etapa === 'anulada') c.push({ tono: 'danger', texto: etiquetaAnulada(t), titulo: t.motivo ?? undefined })
  return c
}

/** El monto que importa en la tarjeta: el saldo si se debe, si no el total. */
export function montoDe(t: TarjetaVenta): { texto: string; etiqueta: string | null } | null {
  if ((t.etapa === 'despachada' || t.etapa === 'facturada') && t.saldo_usd != null) {
    const parcial = Number(t.aplicado ?? t.cobrado ?? 0) > 0
    return { texto: dolares(Number(t.saldo_usd)), etiqueta: parcial ? 'saldo' : null }
  }
  if (t.total_usd != null) return { texto: dolares(Number(t.total_usd)), etiqueta: null }
  if (t.total != null) return { texto: dinero(t.moneda, Number(t.total)), etiqueta: null }
  return null
}

/** La pantalla de siempre donde vive cada documento. */
export function rutaDe(t: TarjetaVenta): { ruta: string; etiqueta: string } {
  switch (t.tipo) {
    case 'COT':
      return { ruta: `/app/ventas/cotizaciones?cotizacion=${encodeURIComponent(t.numero)}`, etiqueta: 'Abrir la cotización' }
    case 'SD':
      return { ruta: '/app/facturacion/notas-entrega', etiqueta: 'Abrir en Notas de entrega' }
    case 'NE':
      return { ruta: `/app/facturacion/notas-entrega?nota=${encodeURIComponent(t.numero)}`, etiqueta: 'Abrir la nota de entrega' }
    case 'FAC':
      return { ruta: `/app/facturacion?factura=${encodeURIComponent(t.numero)}`, etiqueta: 'Abrir la factura' }
  }
}

export function coincide(t: TarjetaVenta, q: string): boolean {
  if (!q) return true
  const h = [t.numero, t.cliente, t.rif, t.resumen, t.chofer, t.vehiculo, t.cadena.cot, t.cadena.sd, t.cadena.ne, t.cadena.fac, t.cadena.ns]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((p) => h.includes(p))
}

/** El PDF del documento: se abre en su pantalla con el papel de siempre. El despacho por aprobar no tiene papel todavía. */
export function pdfDe(t: TarjetaVenta): string | null {
  return t.tipo === 'SD' ? null : `${rutaDe(t).ruta}&pdf=1`
}

/** El WhatsApp de la etapa en que está la venta (el mismo del detalle). */
export function whatsappDe(t: TarjetaVenta, empresa: string): { titulo: string; texto: string } {
  const [titulo, texto] =
    t.etapa === 'cot'
      ? ['Cotización', textoCotizacion(t, empresa)]
      : t.etapa === 'aprobar'
        ? ['Despacho por aprobar', textoDespachoPorAprobar(t, empresa)]
        : t.etapa === 'despachada'
          ? ['Despacho aprobado', textoDespachoAprobado(t, empresa)]
          : t.etapa === 'facturada'
            ? ['Factura', textoFacturada(t, empresa)]
            : t.etapa === 'cobrada'
              ? ['Venta finalizada', textoFinalizada(t, empresa)]
              : ['Anulación', textoAnulada(t, empresa)]
  return { titulo: `${titulo} · ${t.numero}`, texto }
}
