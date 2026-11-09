/*
  NO SE SURTE MÁS DE LO QUE HAY (Golden Touch, saldoSuficiente.ts, 09/10/2026).

  De un tanque no sale más combustible del que tiene. La garantía está en la
  base (`registrar_movimiento` y los cerrojos de cada puerta); esto es para
  avisar antes de enviar, con el saldo que se ve en la tarjeta del tanque.
*/
import { cifra } from '@/lib/formato'
import type { Numerico, TipoMovLibro } from './tipos'

/** Margen de redondeo: el saldo se lee con dos decimales. */
const TOLERANCIA = 0.005

const v = (x: Numerico | null | undefined): number => (x == null || !Number.isFinite(Number(x)) ? 0 : Number(x))

/** ¿Este tipo de movimiento SACA litros del tanque? */
export function saleDelTanque(tipo: TipoMovLibro): boolean {
  return tipo === 'uso' || tipo === 'merma' || tipo === 'traslado'
}

/** Litros que el movimiento saca del tanque (negativo si suma). */
export function litrosQueSalen(tipo: TipoMovLibro, litros: Numerico | null | undefined): number {
  return saleDelTanque(tipo) ? v(litros) : -v(litros)
}

/** El tanque está vacío: no hay nada que surtir. */
export function tanqueSinLitros(saldo: Numerico | null | undefined): boolean {
  return v(saldo) <= TOLERANCIA
}

export interface MovSalida {
  tipo: TipoMovLibro
  litros: Numerico | null | undefined
  tanqueId?: number | null
}

/**
 * Cuántos litros MÁS saca este cambio: todo si es nuevo o cambia de tanque; la
 * diferencia si se corrige en el mismo; cero si no es una salida.
 */
export function litrosExtraQueSalen(antes: MovSalida | null, despues: MovSalida): number {
  if (!saleDelTanque(despues.tipo)) return 0
  const nuevo = !antes || (antes.tanqueId != null && despues.tanqueId != null && antes.tanqueId !== despues.tanqueId)
  const extra = nuevo ? v(despues.litros) : v(despues.litros) - litrosQueSalen(antes.tipo, antes.litros)
  return Math.round(extra * 100) / 100
}

/** El mensaje si el tanque no alcanza; nulo si alcanza. */
export function errorSaldoInsuficiente(o: {
  nombre: string
  saldo: Numerico | null | undefined
  litros: number
  edicion?: boolean
}): string | null {
  const litros = v(o.litros)
  if (!(litros > 0)) return null
  const saldo = v(o.saldo)
  if (saldo - litros >= -TOLERANCIA) return null
  const hay = cifra(Math.max(0, saldo))
  return o.edicion
    ? `El tanque ${o.nombre} tiene ${hay} L; el cambio saca ${cifra(litros)} L más y lo dejaría en negativo.`
    : `El tanque ${o.nombre} tiene ${hay} L; no se pueden surtir ${cifra(litros)} L.`
}

/** Etiqueta del tanque en los selectores: «CMB-TAN · 845 L» o «CMB-TAN · sin litros». */
export function etiquetaTanque(nombre: string, saldo: Numerico | null | undefined): string {
  return tanqueSinLitros(saldo) ? `${nombre} · sin litros` : `${nombre} · ${cifra(v(saldo))} L`
}

/**
 * Etiqueta del destino de un traslado. Un bidón no acumula saldo: se dice que
 * es salida directa (Golden Touch, bidonCombustible.ts, 23/10/2026).
 */
export function etiquetaTanqueDestino(t: { nombre: string; es_bidon: boolean; saldo_litros: Numerico }): string {
  return t.es_bidon ? `🪣 ${t.nombre} · salida directa (sin saldo)` : etiquetaTanque(t.nombre, t.saldo_litros)
}
