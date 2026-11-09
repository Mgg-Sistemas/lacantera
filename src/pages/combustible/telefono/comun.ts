import { n, type MovimientoLibro, type Numerico, type TipoMovLibro } from '@/lib/combustible/tipos'

/*
  LO COMÚN DEL SURTIDOR DEL TELÉFONO (fase 4 de «Combustible como Golden
  Touch», 10/11/2026). Los iconos y los nombres son los de
  `SurtidorMovilView` de Golden Touch; los dos que GT no tenía —el reverso de
  una anulación y el ajuste de costo— son del libro de aquí.
*/

/** Cuántos movimientos se ven en el teléfono. El libro completo está en la PC. */
export const ULTIMOS_EN_TELEFONO = 10

export const ICONO: Record<TipoMovLibro, string> = {
  entrada: '⬇',
  uso: '⛽',
  traslado: '🔁',
  retorno: '↩',
  merma: '🔻',
  reverso: '❌',
  ajuste: '🧮',
}

export const NOMBRE_TIPO: Record<TipoMovLibro, string> = {
  entrada: 'Entrada',
  uso: 'Surtido',
  traslado: 'Traslado',
  retorno: 'Retorno',
  merma: 'Merma',
  reverso: 'Anulación',
  ajuste: 'Ajuste de costo',
}

/** Lo que se puede registrar desde el teléfono (el retorno y la merma quedan para la PC). */
export type TipoSurtidor = 'uso' | 'traslado' | 'entrada'

export const TITULO: Record<TipoSurtidor, string> = {
  uso: 'Surtir a un equipo',
  traslado: 'Pasar a otro tanque',
  entrada: 'Entrada de combustible',
}

/** Los litros como se leen en el teléfono: «1.234,5». */
export const litros = (v: Numerico | null | undefined): string =>
  n(v).toLocaleString('es-VE', { maximumFractionDigits: 2 })

/** ¿Este renglón suma al tanque? */
export const entra = (m: Pick<MovimientoLibro, 'signo'>): boolean => m.signo === 1

/** La hora de ahora en Caracas, «HH:MM:SS», para el `<input type="time">`. */
export function horaEnCaracas(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Caracas',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date())
}

/** Un número escrito en un campo, o nulo si está vacío. */
export const leerNumero = (v: string): number | null => {
  const t = v.trim().replace(',', '.')
  if (t === '') return null
  const x = Number(t)
  return Number.isFinite(x) ? x : null
}

/** Lo que encabeza un movimiento en la lista: el equipo, si no la observación, si no el tipo. */
export function tituloDeMovimiento(m: MovimientoLibro): string {
  // En un traslado, `tanque_destino` es el tanque de la otra pata: adonde fue
  // si este renglón es la salida, de dónde vino si es la llegada.
  if (m.tipo === 'traslado' && m.tanque_destino) {
    return m.signo === -1 ? `A ${m.tanque_destino}` : `Desde ${m.tanque_destino}`
  }
  return (m.equipo || m.observacion || NOMBRE_TIPO[m.tipo]).trim()
}
