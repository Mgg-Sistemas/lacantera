/* La decisión de «¿Se pagará?» y sus reglas. La pinta SePagara.tsx. */

export interface DecisionPago {
  sePaga: boolean | null
  motivo: '' | 'SIN_FONDOS' | 'ESPERANDO' | 'OTRO'
  otro: string
  referencia: string
}

export const DECISION_VACIA: DecisionPago = { sePaga: null, motivo: '', otro: '', referencia: '' }

export const MOTIVOS: { valor: Exclude<DecisionPago['motivo'], ''>; texto: string }[] = [
  { valor: 'SIN_FONDOS', texto: 'Sin fondos en estos momentos' },
  { valor: 'ESPERANDO', texto: 'Esperando respuesta' },
  { valor: 'OTRO', texto: 'Otro' },
]

/** El motivo escrito tal como se guarda y se manda por WhatsApp. */
export function motivoDe(d: DecisionPago): string | null {
  if (d.sePaga !== false) return null
  if (d.motivo === 'OTRO') return d.otro.trim() || null
  return MOTIVOS.find((m) => m.valor === d.motivo)?.texto ?? null
}

/** Si ya se puede mandar: dijo que sí, o dijo que no y explicó por qué. */
export function decisionCompleta(d: DecisionPago): boolean {
  if (d.sePaga === true) return true
  if (d.sePaga === false) return (motivoDe(d)?.length ?? 0) >= 5
  return false
}
