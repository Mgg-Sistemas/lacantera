/*
  LA MISMA CANTIDAD EN LA OTRA MEDIDA, CUANDO SE PUEDE SABER

  La cantera opera en metros cúbicos y tramita vender por tonelada: las dos
  medidas conviven. Christopher, 16/09/2026, con una nota de salida que daba la
  arena solo en metros cúbicos: «los productos, en los pdf, no están saliendo con
  la conversión solicitada». Y enseguida: «si un producto, sea en m3 o ton, no
  tiene su contraparte, no se podrá hacer la conversión».

  La contraparte es la densidad del catálogo: cuántas toneladas pesa un metro
  cúbico de ese material. Con ella, M3 y TON se leen el uno en el otro; sin ella
  no se supone nada y el papel calla. Es la misma regla con la que la base
  calcula `existencia_equivalente` para la pantalla de existencias.

  En el papel se escribe «aprox.» y no «≈»: la letra de los PDF no trae ese signo,
  y el reporte diario ya lo dice así. Y va la densidad con la que se hizo la
  cuenta, porque hoy es un estimado y quien firma tiene que poder saberlo.
*/

const dos = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** La cantidad en la otra medida, o null si no hay densidad o no es M3 ni TON. */
export function enLaOtraMedida(
  cantidad: string | number,
  unidad: string,
  densidad: string | number | null | undefined,
): { cantidad: number; unidad: 'M3' | 'TON' } | null {
  const d = Number(densidad)
  const c = Number(cantidad)
  if (!(d > 0) || !Number.isFinite(c)) return null
  if (unidad === 'M3') return { cantidad: c * d, unidad: 'TON' }
  if (unidad === 'TON') return { cantidad: c / d, unidad: 'M3' }
  return null
}

/** «equivale a 40,32 TON aprox. (1,44 t/m³)», o null si no se puede saber. */
export function equivalenciaEnPapel(
  cantidad: string | number,
  unidad: string,
  densidad: string | number | null | undefined,
): string | null {
  const otra = enLaOtraMedida(cantidad, unidad, densidad)
  if (!otra) return null
  return `equivale a ${dos.format(otra.cantidad)} ${otra.unidad} aprox. (${Number(densidad).toLocaleString('es-VE')} t/m³)`
}
