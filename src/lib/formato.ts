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
 * Un monto en la moneda que le corresponde.
 *
 * El sistema maneja las dos a la vez y una cifra sin su símbolo es una trampa:
 * 3.185.647 en bolívares y en dólares no son ni parecidos.
 */
export const dinero = (moneda: string | null | undefined, valor: string | number): string =>
  moneda === 'VES' ? bolivares(valor) : dolares(valor)

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
