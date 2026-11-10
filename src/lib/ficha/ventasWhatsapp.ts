import type { TarjetaVenta } from '@/lib/api/ventasTablero'
import { bolivares, dinero, dolares, fecha } from '@/lib/formato'
import { fechaHoraVE } from '@/lib/pedidos'

/*
  LOS MENSAJES DE WHATSAPP DE VENTAS (la dueña, 10/11/2026), uno por paso, con
  el mismo estilo de los de Compras: título en negrita con el número, una
  línea por dato con su emoji y la empresa al pie.

  Pasos: cotización · despacho por aprobar · despacho aprobado · despacho no
  aprobado · factura · cobro o abono · recordatorio de cobro · venta
  finalizada · venta anulada.

  Sin el selector invisible U+FE0F en los emojis (rompe el texto en algunos
  teléfonos).
*/

const CONDICION: Record<string, string> = {
  CONTADO: 'Contado',
  CREDITO_15: 'Crédito 15 días',
  CREDITO_30: 'Crédito 30 días',
  CREDITO_60: 'Crédito 60 días',
}

/** «ARENA LAVADA · 16 M3 · PIEDRA · 4 M3» → «• ARENA LAVADA — 16 M3». */
function productos(t: TarjetaVenta): string[] {
  const partes = (t.resumen ?? '').split(' · ').filter(Boolean)
  const lineas: string[] = []
  for (let i = 0; i < partes.length; i += 2) lineas.push(`• ${partes[i]} — ${partes[i + 1] ?? ''}`.trim())
  return lineas.length ? [`📦 *Productos (${lineas.length}):*`, ...lineas] : []
}

function total(t: TarjetaVenta, etiqueta = 'Total'): string | null {
  if (t.total == null && t.total_usd == null) return null
  const principal = t.total != null ? dinero(t.moneda, Number(t.total)) : dolares(Number(t.total_usd))
  const otra =
    t.moneda !== 'VES' && t.total_bs != null
      ? ` · ${bolivares(Number(t.total_bs))}`
      : t.moneda === 'VES' && t.total_usd != null
        ? ` · ${dolares(Number(t.total_usd))}`
        : ''
  return `💵 *${etiqueta}:* ${principal}${otra}`
}

const cliente = (t: TarjetaVenta) => `👤 *Cliente:* ${t.cliente ?? '—'}${t.rif ? ` · ${t.rif}` : ''}`
const pie = (empresa: string) => `🏢 *${empresa.toUpperCase()}*`
const limpio = (l: Array<string | null | false | undefined>) => l.filter(Boolean).join('\n')
const transporte = (t: TarjetaVenta) =>
  t.chofer || t.vehiculo ? `🚛 *Chofer:* ${t.chofer ?? '—'}${t.vehiculo ? ` · *Vehículo:* ${t.vehiculo}` : ''}` : null

export function textoCotizacion(t: TarjetaVenta, empresa: string): string {
  return limpio([
    `📝 *COTIZACIÓN ${t.numero}*`,
    cliente(t),
    ...productos(t),
    total(t),
    t.vence_el ? `📅 *Válida hasta:* ${fecha(t.vence_el)}` : null,
    t.por ? `🙋 *Atiende:* ${t.por}` : null,
    pie(empresa),
  ])
}

export function textoDespachoPorAprobar(t: TarjetaVenta, empresa: string): string {
  return limpio([
    `🚚 *DESPACHO POR APROBAR · ${t.numero}*`,
    cliente(t),
    t.cadena.cot ? `📝 *Cotización:* ${t.cadena.cot}` : null,
    ...productos(t),
    transporte(t),
    t.almacen ? `⛰ *Sale de:* ${t.almacen}` : null,
    t.ticket ? `⚖ *Romana:* ${t.ticket}` : null,
    t.pago_combinado ? '💱 *Pago combinado:* $ + Bs' : null,
    t.pendiente_por_cobrar && t.fecha_pago ? `📅 *Paga el:* ${fecha(t.fecha_pago)}` : null,
    total(t),
    t.por ? `🙋 *Pide:* ${t.por}` : null,
    '➡ *Sigue:* aprobar el despacho',
    pie(empresa),
  ])
}

export function textoDespachoAprobado(t: TarjetaVenta, empresa: string): string {
  return limpio([
    `✅ *DESPACHO APROBADO · NOTA DE ENTREGA ${t.cadena.ne ?? t.numero}*`,
    cliente(t),
    t.cadena.sd ? `🔖 *Despacho:* ${t.cadena.sd}` : null,
    ...productos(t),
    transporte(t),
    t.almacen ? `⛰ *Salió de:* ${t.almacen}` : null,
    t.ticket ? `⚖ *Romana:* ${t.ticket}` : null,
    total(t),
    t.por ? `👔 *Autorizó:* ${t.por}` : null,
    `📅 *Fecha:* ${fechaHoraVE(t.at ?? undefined)}`,
    t.pendiente_por_cobrar && t.fecha_pago ? `💳 *Paga el:* ${fecha(t.fecha_pago)}` : null,
    pie(empresa),
  ])
}

export function textoDespachoNoAprobado(t: TarjetaVenta, motivo: string, noProcede: boolean, empresa: string): string {
  return limpio([
    noProcede ? `🚫 *DESPACHO NO APROBADO · ${t.numero}*` : `⏳ *DESPACHO NO APROBADO POR AHORA · ${t.numero}*`,
    cliente(t),
    ...productos(t),
    total(t),
    `📌 *Motivo:* ${motivo}`,
    noProcede ? '➡ *Sigue:* no se despacha' : '➡ *Sigue:* por aprobar; se aprueba cuando se resuelva',
    pie(empresa),
  ])
}

export function textoFacturada(t: TarjetaVenta, empresa: string): string {
  return limpio([
    `🧾 *FACTURA ${t.numero}${t.numero_control ? ` · Nº DE CONTROL ${t.numero_control}` : ''}*`,
    cliente(t),
    t.cadena.ne ? `📄 *Nota de entrega:* ${t.cadena.ne}` : null,
    ...productos(t),
    t.iva ? `🧮 *IVA:* ${dinero(t.moneda, Number(t.iva))}` : null,
    t.igtf ? `💱 *IGTF:* ${dinero(t.moneda, Number(t.igtf))}` : null,
    total(t),
    t.condicion ? `📋 *Condición:* ${CONDICION[t.condicion] ?? t.condicion}${t.vence_el ? ` · vence ${fecha(t.vence_el)}` : ''}` : null,
    pie(empresa),
  ])
}

export function textoCobro(
  t: TarjetaVenta,
  cobro: { metodo: string; referencia?: string | null; monto: string },
  saldo: number,
  empresa: string,
): string {
  return limpio([
    saldo <= 0.01 ? `✅ *${t.tipo === 'FAC' ? 'FACTURA' : 'NOTA'} COBRADA · ${t.numero}*` : `💵 *ABONO REGISTRADO · ${t.numero}*`,
    cliente(t),
    `💳 *Método:* ${cobro.metodo}`,
    cobro.referencia ? `🧾 *Referencia:* ${cobro.referencia}` : null,
    `💵 *Monto:* ${cobro.monto}`,
    saldo > 0.01 ? `📉 *Saldo pendiente:* ${dolares(saldo)}` : '✓ *Saldo:* $0,00',
    `📅 *Fecha:* ${fechaHoraVE()}`,
    pie(empresa),
  ])
}

export function textoRecordatorio(t: TarjetaVenta, empresa: string): string {
  const vence = t.tipo === 'FAC' ? t.vence_el : t.fecha_pago
  return limpio([
    `🔔 *RECORDATORIO DE COBRO · ${t.numero}*`,
    cliente(t),
    vence ? (t.vencida ? `📅 *Venció el:* ${fecha(vence)}` : `📅 *Vence el:* ${fecha(vence)}`) : null,
    total(t, t.tipo === 'FAC' ? 'Total factura' : 'Total nota'),
    Number(t.aplicado ?? t.cobrado ?? 0) > 0 ? `💵 *Abonado:* ${dolares(Number(t.aplicado ?? t.cobrado))}` : null,
    t.saldo_usd != null ? `📉 *Saldo:* ${dolares(Number(t.saldo_usd))}` : null,
    '🏦 Puede pagar por transferencia o pago móvil y enviar el comprobante por aquí.',
    pie(empresa),
  ])
}

export function textoFinalizada(t: TarjetaVenta, empresa: string): string {
  const cadena = [t.cadena.cot, t.cadena.sd, t.cadena.ns, t.cadena.ne, t.cadena.fac].filter(Boolean).join(' → ')
  return limpio([
    `🏁 *VENTA FINALIZADA · ${t.numero}*`,
    cliente(t),
    cadena ? `🔗 ${cadena}` : null,
    ...productos(t),
    total(t, 'Total cobrado'),
    pie(empresa),
  ])
}

export function textoAnulada(t: TarjetaVenta, empresa: string): string {
  return limpio([
    `⊘ *${t.tipo === 'COT' && t.estado_doc === 'RECHAZADA' ? 'COTIZACIÓN RECHAZADA' : t.tipo === 'SD' ? 'DESPACHO NO APROBADO' : 'VENTA ANULADA'} · ${t.numero}*`,
    cliente(t),
    ...productos(t),
    t.motivo ? `📌 *Motivo:* ${t.motivo}` : null,
    pie(empresa),
  ])
}
