/*
  CUÁNTO TIEMPO LLEVA VENCIDA UNA DEUDA (09/11/2026).

  Lógica pura, sin red ni PDF, para el reporte de clientes con cuentas por
  cobrar: los días de atraso de una nota, en qué tramo cae y cuánto suma cada
  tramo. Vive aparte para poder probarla con `node` sin navegador
  (scripts/test-antiguedad-de-deuda.mjs).

  Las fechas de pago son fechas sin hora («2026-10-23»): se comparan contra el
  día de `hoy` a medianoche local, así que una nota que vence hoy tiene 0 días
  de atraso.
*/

export interface NotaConVencimiento {
  fecha_pago: string | null
  vencida: boolean
  total_usd: string | number | null
}

export type TramoDeAtraso = 'AL_DIA' | 'D1_15' | 'D16_30' | 'D31_60' | 'MAS_60'

export const ROTULO_DE_TRAMO: Record<TramoDeAtraso, string> = {
  AL_DIA: 'Al día',
  D1_15: '1–15 días',
  D16_30: '16–30 días',
  D31_60: '31–60 días',
  MAS_60: '+60 días',
}

/** Días desde que venció; 0 si todavía no vence o no tiene fecha. */
export function diasVencida(fechaPago: string | null, hoy = new Date()): number {
  if (!fechaPago) return 0
  const [a, m, d] = fechaPago.slice(0, 10).split('-').map(Number)
  if (!a || !m || !d) return 0
  const vence = new Date(a, m - 1, d)
  const cero = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.max(0, Math.round((cero.getTime() - vence.getTime()) / 86_400_000))
}

/**
 * El tramo de una nota. Manda `vencida`, que la calcula la base: una nota no
 * vencida está al día aunque los días digan otra cosa. Una vencida con 0 días
 * (la fecha no llegó a la hora local) cuenta en el primer tramo.
 */
export function tramoDeAtraso(n: NotaConVencimiento, hoy = new Date()): TramoDeAtraso {
  if (!n.vencida) return 'AL_DIA'
  const dias = diasVencida(n.fecha_pago, hoy)
  if (dias <= 15) return 'D1_15'
  if (dias <= 30) return 'D16_30'
  if (dias <= 60) return 'D31_60'
  return 'MAS_60'
}

/** Cuánto suma en dólares cada tramo, y cuántas notas tiene. */
export function antiguedadDeLaDeuda(
  notas: NotaConVencimiento[],
  hoy = new Date(),
): Record<TramoDeAtraso, { notas: number; usd: number }> {
  const r: Record<TramoDeAtraso, { notas: number; usd: number }> = {
    AL_DIA: { notas: 0, usd: 0 },
    D1_15: { notas: 0, usd: 0 },
    D16_30: { notas: 0, usd: 0 },
    D31_60: { notas: 0, usd: 0 },
    MAS_60: { notas: 0, usd: 0 },
  }
  for (const n of notas) {
    const t = tramoDeAtraso(n, hoy)
    r[t].notas += 1
    r[t].usd += Number(n.total_usd ?? 0)
  }
  return r
}

/** La fecha de pago vencida más vieja de un grupo de notas, o null si ninguna está vencida. */
export function vencimientoMasViejo(notas: NotaConVencimiento[]): string | null {
  let mas: string | null = null
  for (const n of notas) {
    if (!n.vencida || !n.fecha_pago) continue
    if (mas === null || n.fecha_pago < mas) mas = n.fecha_pago
  }
  return mas
}

/** Qué parte del total es `parte`, en porcentaje; 0 si el total es 0. */
export const porcentaje = (parte: number, total: number): number => (total > 0 ? (parte / total) * 100 : 0)
