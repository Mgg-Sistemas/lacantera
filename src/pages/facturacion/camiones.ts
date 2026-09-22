import type { CamionParaGuardar } from '@/lib/api/salidas'
import type { CamionDeNota } from '@/lib/api/ventas'

/*
  LO QUE SE EDITA DE LOS CAMIONES DE UNA NOTA, SIN PANTALLA.

  Las filas del editor, cómo se arman desde lo guardado y cómo se convierten en
  lo que la base espera. Va aparte del componente para que se pueda probar sin
  navegador y para que el recargado en caliente no se queje.
*/

export interface CamionEnEdicion {
  /** Para React: no hay id hasta guardar. */
  clave: string
  vehiculo_id: string
  chofer_id: string
  ticket: string
  peso_neto: string
}

export const camionVacio = (): CamionEnEdicion => ({
  clave: crypto.randomUUID(),
  vehiculo_id: '',
  chofer_id: '',
  ticket: '',
  peso_neto: '',
})

/** Los guardados, listos para editarse. Sin ninguno, una fila en blanco para empezar. */
export function camionesParaEditar(guardados: CamionDeNota[] | undefined): CamionEnEdicion[] {
  const filas = (guardados ?? []).map((c) => ({
    clave: crypto.randomUUID(),
    vehiculo_id: c.vehiculo_id ? String(c.vehiculo_id) : '',
    chofer_id: c.chofer_id ? String(c.chofer_id) : '',
    ticket: c.ticket ?? '',
    peso_neto: c.peso_neto ? String(Number(c.peso_neto)) : '',
  }))
  return filas.length > 0 ? filas : [camionVacio()]
}

/** Una fila dice algo si tiene chofer o vehículo. Solo un ticket no es un camión. */
const diceAlgo = (c: CamionEnEdicion) => c.vehiculo_id !== '' || c.chofer_id !== ''
/** A medias: lleva ticket o peso, pero no a quién ni en qué. */
const aMedias = (c: CamionEnEdicion) => !diceAlgo(c) && (c.ticket.trim() !== '' || c.peso_neto.trim() !== '')

export function camionesParaGuardar(filas: CamionEnEdicion[]): CamionParaGuardar[] {
  return filas.filter(diceAlgo).map((c) => ({
    vehiculo_id: c.vehiculo_id ? Number(c.vehiculo_id) : null,
    chofer_id: c.chofer_id ? Number(c.chofer_id) : null,
    ticket: c.ticket.trim() || null,
    peso_neto: c.peso_neto.trim() === '' ? null : Number(c.peso_neto.replace(',', '.')),
  }))
}

/** Por qué no se puede guardar todavía, o nada. */
export function faltaEnLosCamiones(filas: CamionEnEdicion[]): string | null {
  const n = filas.findIndex(aMedias)
  if (n >= 0) return `El camión ${n + 1} tiene ticket o peso, pero no dice ni el chofer ni el vehículo.`
  const malo = filas.findIndex((c) => c.peso_neto.trim() !== '' && !(Number(c.peso_neto.replace(',', '.')) >= 0))
  if (malo >= 0) return `El peso del camión ${malo + 1} no es un número.`
  return null
}
