/*
  LA HORA DE UN MOVIMIENTO DEL TANQUE (Golden Touch, horaMovimiento.ts,
  28/09/2026).

  El libro se ordena por fecha y, dentro del día, por hora. Allá la hora era
  texto libre y entraron «6:42:08 M» y «13:43:43 PM»; aquí la base la guarda
  como `time` y llega «16:00:44», pero la lectura tolerante se conserva: sirve
  igual para lo que se teclee o se importe.

  El orden de verdad lo pone la base (`orden` en `v_combustible_libro`, la
  posición en la ventana del saldo corrido). `compararMovimientos` lo usa
  cuando viene, y solo si no viene cae a fecha → hora → número.
*/
import type { MovimientoLibro } from './tipos'

/** Sin hora: queda primero del día. */
export const SIN_HORA = -1

/** La hora como segundos desde medianoche. Acepta 12 y 24 horas, con o sin segundos y con «AM»/«PM». */
export function horaOrden(h: string | null | undefined): number {
  if (!h) return SIN_HORA
  const m = h.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:([AaPp])?\s*\.?\s*[Mm]\.?)?\s*$/)
  if (!m) return SIN_HORA
  let hh = Number(m[1])
  const mm = Number(m[2])
  const ss = Number(m[3] ?? 0)
  if (hh > 23 || mm > 59 || ss > 59) return SIN_HORA
  const ap = (m[4] ?? '').toUpperCase()
  // El sufijo solo mueve la hora si el número es de reloj de 12: «13:43 PM» ya dice 13.
  if (ap === 'P' && hh < 12) hh += 12
  if (ap === 'A' && hh === 12) hh = 0
  return hh * 3600 + mm * 60 + ss
}

/** ¿Es una hora que el sistema entiende? */
export function horaLegible(h: string | null | undefined): boolean {
  return !h || horaOrden(h) !== SIN_HORA
}

/** Lo mínimo para ordenar un renglón del libro. */
export type FilaOrdenable = Partial<Pick<MovimientoLibro, 'fecha' | 'hora' | 'orden' | 'registrado_en' | 'tanque_id'>> & {
  id?: number | string | null
}

/**
 * El orden del libro: dentro de un mismo tanque manda `orden` (el de la base);
 * si no, fecha → hora → cuándo se cargó → número.
 */
export function compararMovimientos(a: FilaOrdenable, b: FilaOrdenable): number {
  if (a.orden != null && b.orden != null && a.tanque_id != null && a.tanque_id === b.tanque_id) {
    return a.orden - b.orden
  }
  const f = (a.fecha ?? '').localeCompare(b.fecha ?? '')
  if (f !== 0) return f
  const h = horaOrden(a.hora) - horaOrden(b.hora)
  if (h !== 0) return h
  const c = (a.registrado_en ?? '').localeCompare(b.registrado_en ?? '')
  if (c !== 0) return c
  return Number(a.id ?? 0) - Number(b.id ?? 0)
}

/**
 * La fecha «AAAA-MM-DD» como Date de MEDIODÍA UTC, para el Excel: a medianoche
 * UTC se escribe desde Venezuela como el día anterior.
 */
export function fechaParaExcel(f: string | null | undefined): Date | null {
  const d = String(f ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  return new Date(`${d}T12:00:00Z`)
}

const dos = (v: number) => String(v).padStart(2, '0')

/** La hora guardada → lo que entiende un <input type="time"> («16:00:44»). */
export function horaAInput(h: string | null | undefined): string {
  const seg = horaOrden(h)
  if (seg === SIN_HORA) return ''
  return `${dos(Math.floor(seg / 3600))}:${dos(Math.floor((seg % 3600) / 60))}:${dos(seg % 60)}`
}

/** La hora para leer: «4:00 PM», como se ve en el resto del sistema de Golden Touch. */
export function horaParaLeer(h: string | null | undefined): string {
  const seg = horaOrden(h)
  if (seg === SIN_HORA) return ''
  const h24 = Math.floor(seg / 3600)
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${dos(Math.floor((seg % 3600) / 60))} ${h24 < 12 ? 'AM' : 'PM'}`
}
