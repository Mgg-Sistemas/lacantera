/*
  Lo que comparten las partes del centro de costo: el guion de lo que no se
  sabe, el costo por m³ con cuatro decimales, y las etiquetas.

  Va aparte del componente `Cifra` porque un archivo que exporta un
  componente y además funciones rompe el refresco en caliente de Vite.
*/
import { CLASES, type ClaseCosto } from '@/lib/api/costos'
import { dolares } from '@/lib/formato'

/** Los numéricos llegan como string y a veces como number. */
export const aTexto = (v: unknown): string => (v == null ? '' : String(v))

/** Dinero que puede no saberse. El guion es la respuesta, no un hueco. */
export const dineroONada = (v: number | string | null | undefined): string =>
  v === null || v === undefined ? '—' : dolares(v)

const decimal4 = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })

export const porM3 = (v: number | null | undefined): string =>
  v === null || v === undefined ? '—' : `$ ${decimal4.format(v)} / m³`

export const diceQueIncluye = (incluye: ClaseCosto[]): string =>
  incluye.length === 0 ? 'nada todavía' : incluye.map((c) => CLASES[c].toLowerCase()).join(' + ')

export const ORIGENES: Record<string, string> = {
  MANUAL: 'Tecleado aquí',
  ACARREO: 'Viajes de camiones',
  SALIDA_PLANTA: 'Salidas de planta',
  FIJO: 'Gasto fijo',
  NOMINA: 'Nómina',
  INVENTARIO: 'Inventario',
  TESORERIA: 'Tesorería',
}
