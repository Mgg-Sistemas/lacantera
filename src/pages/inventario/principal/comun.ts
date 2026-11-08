import { enteros } from '@/lib/formato'
import type { Almacen, Existencia } from '@/lib/api/inventario'

/*
  LO COMÚN A LOS MODALES DE LA PANTALLA PRINCIPAL DE INVENTARIO (fases 3 y 4
  de «Almacén e Inventario como MGG», 08/11/2026).
*/

/** Los sitios que estas pantallas no miran: combustible y lo que va en camino. */
export const FUERA = ['COMBUSTIBLE', 'TRANSITO']

/** Un sitio donde estos modales pueden mover material. */
export const almacenUsable = (a: Pick<Almacen, 'tipo' | 'admite_sin_costo'>) =>
  !FUERA.includes(a.tipo) && !a.admite_sin_costo

/** Una fila de `v_existencias` que estos modales pueden enseñar. */
export const filaUsable = (e: Pick<Existencia, 'almacen_tipo'>) => !FUERA.includes(e.almacen_tipo ?? '')

/** Entera si es entera, con dos decimales si no. */
export function cantidad(valor: number): string {
  return Number.isInteger(valor) ? enteros(valor) : valor.toLocaleString('es-VE', { maximumFractionDigits: 2 })
}

/** Lo que tecleó la persona como número: acepta la coma decimal. */
export function numeroTecleado(texto: string): number {
  const limpio = texto.trim().replace(/\s/g, '')
  if (!limpio) return NaN
  // «1.234,5» → 1234.5; «12,5» → 12.5; «12.5» → 12.5
  const normal = limpio.includes(',') ? limpio.replace(/\./g, '').replace(',', '.') : limpio
  return Number(normal)
}

/*
  EL ÍCONO Y EL NOMBRE DE CADA TIPO EN EL KARDEX.

  Las etiquetas de MGG (`movimientos.repository.ts` L.20-31) para lo que existe
  en los dos: «Ajuste manual», «Entrada», «Salida», «Traslado entre
  almacenes». Lo que solo existe aquí lleva el nombre de siempre del libro.
  Sin U+FE0F: el ícono es el carácter solo.
*/
export function iconoDeTipo(tipo: string): string {
  if (tipo.startsWith('ENTRADA_')) return '⬇'
  if (tipo.startsWith('SALIDA_')) return '⬆'
  if (tipo.startsWith('TRANSFERENCIA_')) return '↔'
  if (tipo === 'AJUSTE_COSTO') return '$'
  if (tipo.startsWith('AJUSTE_')) return '⚙'
  if (tipo === 'REVERSO') return '↩'
  if (tipo.startsWith('CAMBIO_DUENO')) return '⇄'
  return '•'
}

/** Los motivos sugeridos de MGG (`motivoMovimiento.ts` L.62-67), con la transferencia de aquí. */
export const MOTIVOS_SUGERIDOS: Record<'entrada' | 'salida' | 'transferencia' | 'ajuste', string[]> = {
  entrada: ['Compra sin orden de compra', 'Devolución de material no usado', 'Material donado', 'Aparecido en conteo físico'],
  salida: ['Entrega a personal', 'Material dañado o vencido', 'Devolución al proveedor', 'Préstamo a otra área'],
  transferencia: ['Reposición del almacén', 'Material para la obra', 'Reorganización del almacén'],
  ajuste: ['Conteo físico', 'Rotura', 'Corrección de carga', 'Merma'],
}

/** La regla de MGG para un motivo escrito a mano: cinco letras y al menos una letra. */
export function problemaDeMotivo(motivo: string, que: string): string | null {
  const m = motivo.trim()
  if (!m) return `Escribí el motivo: ${que} cargada a mano necesita decir por qué se hizo.`
  if (m.length < 5) return `El motivo es muy corto: escribí al menos 5 caracteres que expliquen la ${que.replace(/^una /, '')}.`
  if (!/\p{L}/u.test(m)) return 'El motivo tiene que decir algo: escribilo en palabras, no solo números o guiones.'
  return null
}

/** El día en palabras, para la cabecera de cada día del kardex. */
export function diaLargo(fecha: string): string {
  const d = new Date(`${fecha.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return fecha
  return new Intl.DateTimeFormat('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
}

/** La hora de Caracas de un instante. */
export function horaDe(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('es-VE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Caracas' }).format(d)
}

/** dd/mm/aaaa de una fecha del libro. */
export function fechaCorta(fecha: string): string {
  const [a, m, d] = fecha.slice(0, 10).split('-')
  return d && m && a ? `${d}/${m}/${a}` : fecha
}
