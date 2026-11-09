/*
  EL CONTADOR DEL SURTIDOR Y EL HORÓMETRO DEL EQUIPO (Golden Touch,
  contadorSurtidor.ts, horometroEquipo.ts y cadenaMedidor.ts).

  Los dos son totalizadores que solo suben:

  · Lo que marca el surtidor AL TERMINAR es donde arranca el siguiente surtido
    de ese tanque. Si el final queda vacío se guarda inicial + litros; si el que
    surte escribe la lectura real, vale la lectura. Solo el surtido y el
    traslado pasan por la manguera.
  · Horas trabajadas = horómetro final − inicial. El final del surtido es el
    inicial del siguiente del mismo equipo. Un final menor que el inicial no se
    guarda.

  La base completa lo mismo al guardar (`combustible_registrar_uso`,
  `combustible_trasladar`); esto es para enseñarlo mientras se escribe.
*/
import { horaOrden } from './horaMovimiento'
import type { TipoMovLibro } from './tipos'

const numero = (v: number | string | null | undefined): number | null =>
  v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v)

const r2 = (v: number): number => Math.round(v * 100) / 100

// ─── Contador del surtidor ─────────────────────────────────────────────────

/** ¿Este movimiento sale por el surtidor del tanque y hace avanzar su contador? */
export function pasaPorSurtidor(tipo: TipoMovLibro): boolean {
  return tipo === 'uso' || tipo === 'traslado'
}

/** El final que se propone si el campo queda vacío: inicial + litros. */
export function contadorFinalPropuesto(
  ini: number | string | null | undefined,
  litros: number | string | null | undefined,
): number | null {
  const i = numero(ini)
  const l = numero(litros)
  if (i === null || l === null || l <= 0) return null
  return r2(i + l)
}

/** Deja completo el contador: inicial (el del formulario o el último del tanque) y final. */
export function completarContador(e: {
  tipo: TipoMovLibro
  litros: number
  ini?: number | null
  fin?: number | null
  /** Mayor contador final del tanque (`combustible_ultimo_contador`). */
  ultimo?: number | null
}): { ini: number | null; fin: number | null } {
  const ini = numero(e.ini)
  const fin = numero(e.fin)
  if (!pasaPorSurtidor(e.tipo)) return { ini, fin }
  const arranque = ini ?? numero(e.ultimo)
  return { ini: arranque, fin: fin ?? contadorFinalPropuesto(arranque, e.litros) }
}

/** ¿La lectura escrita no coincide con los litros? (aviso, no bloqueo) */
export function contadorNoCuadra(
  ini: number | null | undefined,
  fin: number | null | undefined,
  litros: number | null | undefined,
  tolerancia = 0.5,
): boolean {
  const i = numero(ini)
  const f = numero(fin)
  const l = numero(litros)
  if (i === null || f === null || l === null) return false
  return Math.abs(f - i - l) > tolerancia
}

// ─── Horómetro ─────────────────────────────────────────────────────────────

/** Horas trabajadas = final − inicial. Sin una de las dos, nulo. Cero es válido. */
export function horasTrabajadas(
  hi: number | string | null | undefined,
  hf: number | string | null | undefined,
): number | null {
  const i = numero(hi)
  const f = numero(hf)
  if (i === null || f === null) return null
  return r2(f - i)
}

/** Recordatorio (no bloqueo) cuando falta el final de un equipo que trae horómetro. */
export function faltaHorometroFinal(
  hi: number | string | null | undefined,
  hf: number | string | null | undefined,
): string | null {
  if (numero(hi) === null || numero(hf) !== null) return null
  return `Escribí el horómetro final (o el kilometraje del tablero). Arrancó en ${numero(hi)}: con el final salen las horas trabajadas y de ahí arranca el próximo surtido.`
}

/** Lo que impide guardar las lecturas, o nulo si están bien. */
export function errorHorometro(
  hi: number | string | null | undefined,
  hf: number | string | null | undefined,
): string | null {
  const h = horasTrabajadas(hi, hf)
  if (h === null || h >= 0) return null
  return `El horómetro final (${numero(hf)}) no puede ser menor que el inicial (${numero(hi)}): las horas trabajadas saldrían negativas. Revisá la lectura.`
}

/**
 * La lectura vigente entre la de Combustible y la de Maquinaria: el horómetro
 * solo sube, así que la mayor. (Golden Touch daba prioridad a una corrección
 * hacia abajo hecha en Maquinaria; aquí el horómetro no retrocede, así que no
 * hay corrección hacia abajo que respetar.)
 */
export function resolverHorometroVigente(
  combustible: number | null | undefined,
  maquinaria: number | null | undefined,
): number | null {
  const c = numero(combustible)
  const m = numero(maquinaria)
  if (c !== null && m !== null) return Math.max(c, m)
  return m ?? c
}

// ─── La cadena de un medidor ───────────────────────────────────────────────

export interface FilaMedidor {
  id: string | number
  fecha: string | null
  hora: string | null
  ini: number | null
  fin: number | null
  /** Lectura registrada en Maquinaria: da el inicial al siguiente, pero no se corrige. */
  ancla?: boolean
}

/**
 * Qué renglones quedan mal encadenados: el orden físico es la lectura FINAL (el
 * medidor solo crece) y cada inicial debería ser el final del anterior. La
 * lectura final es el dato físico y no se toca. Devuelve los iniciales que
 * cambiarían, para enseñarlos o corregirlos con `combustible_corregir_movimiento`.
 */
export function planCadenaMedidor(rows: FilaMedidor[]): { id: string | number; ini: number; fin: number }[] {
  const usables = rows
    .filter((r) => r.ini != null && r.fin != null)
    .slice()
    .sort((a, b) => {
      const vf = Number(a.fin) - Number(b.fin)
      if (vf !== 0) return vf
      const f = (a.fecha ?? '').localeCompare(b.fecha ?? '')
      if (f !== 0) return f
      const h = horaOrden(a.hora) - horaOrden(b.hora)
      if (h !== 0) return h
      return String(a.id).localeCompare(String(b.id), 'es', { numeric: true })
    })
  const cambios: { id: string | number; ini: number; fin: number }[] = []
  let prevFin: number | null = null
  for (const r of usables) {
    if (r.ancla) {
      prevFin = r2(Number(r.fin))
      continue
    }
    const fin = r2(Number(r.fin))
    const ini = prevFin == null ? r2(Number(r.ini)) : prevFin
    if (ini !== r2(Number(r.ini))) cambios.push({ id: r.id, ini, fin })
    prevFin = fin
  }
  return cambios
}
