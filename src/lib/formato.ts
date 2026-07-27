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

/** La tasa lleva cuatro decimales: a 235 Bs/USD, el cuarto decimal ya mueve céntimos. */
export const tasa = (valor: string | number): string => decimal4.format(aNumero(valor))

export const porcentaje = (valor: string | number): string =>
  `${decimal2.format(aNumero(valor))}%`

export const enteros = (valor: string | number): string => numero.format(aNumero(valor))

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
