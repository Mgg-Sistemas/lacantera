/**
 * Formateo de cifras.
 *
 * Los montos llegarán de Postgres como `string`, no como `number`: PostgREST
 * serializa `numeric` en texto para no perder precisión. Estas funciones
 * aceptan ambos y solo convierten en el último momento, para presentar.
 * La aritmética de dinero nunca debe pasar por `Number`.
 */

const numero = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const decimal2 = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const decimal4 = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
})

const aNumero = (valor: string | number): number =>
  typeof valor === 'number' ? valor : Number(valor)

/** Toneladas, sin decimales. En cantera nadie habla de 1.284,37 t. */
export const toneladas = (valor: string | number): string => `${numero.format(aNumero(valor))} t`

/** Metros cúbicos. */
export const metrosCubicos = (valor: string | number): string =>
  `${numero.format(aNumero(valor))} m³`

export const dolares = (valor: string | number): string =>
  `$ ${decimal2.format(aNumero(valor))}`

/**
 * Dólares sin céntimos, para indicadores.
 * En una cifra de titular los céntimos no informan y sí obligan a partir el
 * número en dos líneas. En documentos y listados se usa `dolares`.
 */
export const dolaresRedondos = (valor: string | number): string =>
  `$ ${numero.format(aNumero(valor))}`

export const bolivares = (valor: string | number): string =>
  `Bs ${decimal2.format(aNumero(valor))}`

/**
 * El símbolo con el que se escribe cada moneda.
 *
 * Son hechos, no configuración: el euro se escribe € en todas partes. Lo que sí
 * es configuración —qué monedas existen y de dónde sale su tasa— vive en la
 * tabla `monedas`. Una moneda que no esté aquí se rotula con su propio código,
 * que es feo pero no miente.
 */
const SIMBOLOS: Record<string, string> = {
  VES: 'Bs',
  USD: '$',
  EUR: '€',
  USDT: 'USDT',
}

/**
 * Un monto en la moneda que le corresponde.
 *
 * El sistema maneja varias a la vez y una cifra sin su símbolo es una trampa:
 * 3.185.647 en bolívares y en dólares no son ni parecidos.
 *
 * Antes esto decía «bolívares si es VES, dólares en cualquier otro caso», y
 * mientras solo hubo dos monedas coló. Al entrar el USDT dejó de colar: el
 * saldo de la cuenta de Binance salía rotulado con un `$` que no le
 * correspondía, en la tarjeta de la cuenta y en los desplegables de traslado.
 */
export const dinero = (moneda: string | null | undefined, valor: string | number): string => {
  const codigo = moneda ?? 'USD'
  const simbolo = SIMBOLOS[codigo] ?? codigo
  return `${simbolo} ${decimal2.format(aNumero(valor))}`
}

/** La tasa lleva cuatro decimales: a 235 Bs/USD, el cuarto decimal ya mueve céntimos. */
export const tasa = (valor: string | number): string => decimal4.format(aNumero(valor))

export const porcentaje = (valor: string | number): string =>
  `${decimal2.format(aNumero(valor))}%`

export const enteros = (valor: string | number): string => numero.format(aNumero(valor))

export function fechaHora(iso: string | null): string {
  if (!iso) return '—'
  if (Number.isNaN(new Date(iso).getTime())) return '—'
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/**
 * Una fecha sin hora.
 *
 * A una fecha suelta se le pega el mediodía a propósito: el navegador la
 * interpreta como medianoche UTC y en Venezuela —cuatro horas atrás— se muestra
 * el día anterior. Al mediodía no hay huso que la mueva de día.
 *
 * SI LO QUE LLEGA ES UN INSTANTE COMPLETO se usa tal cual, porque ya trae su
 * hora y su huso. Antes se le pegaba el mediodía igual, y "2026-08-04T14:34:01
 * +00:00T12:00:00" no es una fecha: `Intl` lanzaba y la pantalla entera se
 * quedaba en blanco. Pasó al mostrar cuándo se actualizó un precio.
 *
 * Y si aun así no se entiende, se dibuja una raya. Un dato con mala forma puede
 * estropear su celda; no puede tumbar la página que lo rodea.
 */
export function fecha(iso: string | null): string {
  if (!iso) return '—'

  const d = iso.length <= 10 ? new Date(`${iso}T12:00:00`) : new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'

  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

/**
 * Cuánto hace que ocurrió algo.
 *
 * Es lo que distingue una lista de una herramienta: un pedido de hace tres
 * horas y uno de hace nueve días se ven igual hasta que alguien pone el tiempo
 * al lado.
 */
export function hace(iso: string): string {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutos < 1) return 'ahora mismo'
  if (minutos < 60) return `hace ${minutos} min`

  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h`

  const dias = Math.floor(horas / 24)
  if (dias < 30) return `hace ${dias} d`

  const meses = Math.floor(dias / 30)
  return `hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`
}

/*
  LA UNIDAD, DICHA EN PALABRAS

  «Cuántos l» no se entiende, y era lo que salía de bajar la unidad a minúscula:
  el catálogo guarda siglas —L, GAL, UND— porque en una tabla de veinte filas es
  lo único que cabe, y en el rótulo de un campo hay sitio para la palabra.

  Lo que no esté en la lista sale tal cual, en minúscula. Es una lista de
  cortesía, no un catálogo: un rótulo un poco seco es mejor que un campo que no
  se deja escribir porque alguien añadió una unidad nueva.
*/
const EN_PALABRAS: Record<string, string> = {
  L: 'litros',
  GAL: 'galones',
  UND: 'unidades',
  KG: 'kilos',
  TON: 'toneladas',
  M3: 'metros cúbicos',
  M: 'metros',
  PAR: 'pares',
  CAJA: 'cajas',
  SACO: 'sacos',
  ROLLO: 'rollos',
  JGO: 'juegos',
  H: 'horas',
}

export function enPlural(unidad: string | null | undefined): string {
  const u = (unidad ?? '').trim().toUpperCase()
  return EN_PALABRAS[u] ?? u.toLowerCase()
}
