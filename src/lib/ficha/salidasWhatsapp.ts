import type { SolicitudDeSalida } from '@/lib/api/salidas'
import { fechaHoraVE } from '@/lib/pedidos'

/*
  LOS MENSAJES DE WHATSAPP DE LAS NOTAS DE SALIDA (la dueña, 10/11/2026):
  pedida, aprobada y rechazada. La entregada ya tiene el suyo, con fotos
  (`reporteSalida.ts`).
*/

const limpio = (l: Array<string | null | false | undefined>) => l.filter(Boolean).join('\n')
const pie = (empresa: string) => `🏢 *${empresa.toUpperCase()}*`

function material(s: SolicitudDeSalida): string[] {
  const r = (s.renglones ?? []).map(
    (x) => `• ${x.articulo?.nombre ?? 'Artículo'} — ${Number(x.cantidad).toLocaleString('es-VE', { maximumFractionDigits: 2 })} ${x.articulo?.unidad ?? ''}`.trim(),
  )
  return r.length ? [`📦 *Material (${r.length}):*`, ...r] : []
}

export function textoSalidaPedida(s: SolicitudDeSalida, d: { pide: string; para: string; empresa: string }): string {
  return limpio([
    `📤 *SOLICITUD DE SALIDA ${s.numero} · POR APROBAR*`,
    `🏬 *Almacén:* ${s.almacen?.nombre ?? '—'}`,
    `🙋 *Pide:* ${d.pide}`,
    `🎯 *Para qué:* ${s.motivo}`,
    `📍 *Para:* ${d.para}`,
    ...material(s),
    s.vehiculo ? `🚛 *Vehículo:* ${s.vehiculo}` : null,
    `📅 *Fecha:* ${fechaHoraVE(s.pedida_en)}`,
    '➡ *Sigue:* aprobar la salida',
    pie(d.empresa),
  ])
}

export function textoSalidaAprobada(s: SolicitudDeSalida, d: { aprobo: string; para: string; empresa: string }): string {
  return limpio([
    `✅ *SALIDA APROBADA · ${s.numero}*`,
    `🏬 *Almacén:* ${s.almacen?.nombre ?? '—'}`,
    `🎯 *Para qué:* ${s.motivo}`,
    `📍 *Para:* ${d.para}`,
    ...material(s),
    `👔 *Aprobó:* ${d.aprobo}`,
    `📅 *Fecha:* ${fechaHoraVE(s.aprobada_en ?? undefined)}`,
    '➡ *Sigue:* el almacén entrega el material',
    pie(d.empresa),
  ])
}

export function textoSalidaRechazada(s: SolicitudDeSalida, d: { motivo: string; pide: string; cancelada: boolean; empresa: string }): string {
  return limpio([
    d.cancelada ? `⊘ *SALIDA CANCELADA · ${s.numero}*` : `✕ *SALIDA NO APROBADA · ${s.numero}*`,
    `🏬 *Almacén:* ${s.almacen?.nombre ?? '—'}`,
    `🙋 *Pidió:* ${d.pide}`,
    `🎯 *Para qué:* ${s.motivo}`,
    ...material(s),
    `📌 *Motivo:* ${d.motivo}`,
    pie(d.empresa),
  ])
}
