/*
  EL REPORTE DE ALIMENTACIÓN, EN TEXTO PLANO.

  Hermano del reporte diario de operaciones (`reporteDiario.ts`): mismo
  idioma —asteriscos para la negrita, emoji fijos, nada de tablas que
  WhatsApp descuadra—, pero de un período de comidas, no de un día de
  acarreo.

  Christopher, 19/10/2026: un botón de reporte para el módulo, con el mismo
  rango de fechas que ya se elige en la pantalla. Es un resumen, no una
  transcripción: una lista de cada comida sería demasiado larga para un
  mensaje. Lo que responde es «¿en qué se fue la plata», con los víveres de
  mayor gasto del período.
*/

export interface TipoDelReporte {
  tipo: string
  nombre: string
  comidas: number
  platos: number
}

export interface ViverDelReporte {
  articulo: string
  unidad: string
  cantidad: string | number
  valorUsd: string | number
}

export interface DatosReporteAlimentacion {
  desde: string
  hasta: string
  razonSocial: string
  comidasServidas: number
  comidasAnuladas: number
  platos: number
  valorUsd: number
  porTipo: TipoDelReporte[]
  /** Ya ordenados de mayor a menor gasto. */
  viveresDeMayorGasto: ViverDelReporte[]
}

const dia = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })
const dinero2 = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const entero = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 2 })

const fechaLarga = (iso: string): string => dia.format(new Date(`${iso.slice(0, 10)}T12:00:00`))

export function textoDelReporteAlimentacion(d: DatosReporteAlimentacion): string {
  const lineas: string[] = []

  lineas.push('🍽️ *REPORTE DE ALIMENTACIÓN*')
  lineas.push(d.razonSocial)
  lineas.push(
    d.desde === d.hasta
      ? fechaLarga(d.desde)
      : `Del ${fechaLarga(d.desde)} al ${fechaLarga(d.hasta)}`,
  )
  lineas.push('')

  lineas.push('📋 *Resumen*')
  lineas.push(
    `${entero.format(d.comidasServidas)} comida${d.comidasServidas === 1 ? '' : 's'} servida${d.comidasServidas === 1 ? '' : 's'} · ` +
      `${entero.format(d.platos)} plato${d.platos === 1 ? '' : 's'}`,
  )
  lineas.push(`💰 Gastado en víveres: $ ${dinero2.format(d.valorUsd)}`)
  lineas.push(
    `🍽️ Costo por plato: ${d.platos > 0 ? `$ ${dinero2.format(d.valorUsd / d.platos)}` : 'no hay platos en el período'}`,
  )
  if (d.comidasAnuladas > 0) {
    lineas.push(`🚫 ${d.comidasAnuladas} anulada${d.comidasAnuladas === 1 ? '' : 's'}: no entra${d.comidasAnuladas === 1 ? '' : 'n'} en estos números`)
  }
  lineas.push('')

  lineas.push('🥘 *Por tipo de comida*')
  if (d.porTipo.every((t) => t.comidas === 0)) {
    lineas.push('Sin comidas servidas.')
  } else {
    for (const t of d.porTipo) {
      if (t.comidas === 0) continue
      lineas.push(`${t.nombre}: ${entero.format(t.comidas)} · ${entero.format(t.platos)} platos`)
    }
  }
  lineas.push('')

  lineas.push('🥕 *Víveres con mayor gasto*')
  if (d.viveresDeMayorGasto.length === 0) {
    lineas.push('Sin consumo de víveres en el período.')
  } else {
    d.viveresDeMayorGasto.forEach((v, i) => {
      lineas.push(
        `${i + 1}. ${v.articulo} — ${entero.format(Number(v.cantidad))} ${v.unidad} · $ ${dinero2.format(Number(v.valorUsd))}`,
      )
    })
  }

  return lineas.join('\n')
}
