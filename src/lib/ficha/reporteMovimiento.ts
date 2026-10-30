/*
  EL REPORTE DE UN MOVIMIENTO DE INVENTARIO, EN TEXTO PLANO.

  Hermano de `reporteDespacho.ts` y `reporteSalida.ts`: mismo estilo —emojis,
  asteriscos para negrita, nada de tablas—, pero para cualquier renglón del
  libro de movimientos y no solo para una venta o una salida con papel propio.

  No todos tienen de dónde sacar fotos: una entrada, un ajuste, un reverso o
  un traslado interno no nacen de una salida ni de un despacho, así que
  `fotos` puede no venir —y entonces el reporte no dice nada de fotos, en vez
  de decir «0 fotos» como si se hubiera buscado y no hubiera ninguna.
*/

export interface DatosReporteMovimiento {
  numero: string
  /** «Salida a consumo · VENTA», ya resuelto con `nombreDeMovimiento`. */
  tipo: string
  fecha: string
  articulo: string
  almacen: string
  cantidad: string | number
  unidad: string
  signo: number
  valorUsd: string | number | null
  /** A quién: el grupo interno, o «X, de fuera de la empresa · responde Y». */
  paraQuien: string | null
  /** La nota libre del movimiento. */
  nota: string | null
  registradoPor: string
  /** Null si este movimiento no tiene de dónde sacar fotos. */
  fotos: number | null
}

const dia = new Intl.DateTimeFormat('es-VE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const cantidadFmt = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 2 })

/** «Jueves 16 de octubre de 2026», con la inicial en mayúscula. */
function fechaLarga(iso: string): string {
  const texto = dia.format(new Date(`${iso.slice(0, 10)}T12:00:00`))
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function textoDelReporteMovimiento(d: DatosReporteMovimiento): string {
  const lineas: string[] = []

  const flecha = d.signo > 0 ? '📥 *ENTRADA*' : '📤 *SALIDA*'
  lineas.push(`${flecha} ${d.numero}`)
  lineas.push(d.tipo)
  lineas.push(fechaLarga(d.fecha))
  lineas.push('')

  lineas.push(
    `📦 *Material:* ${d.signo > 0 ? '+' : '−'}${cantidadFmt.format(Number(d.cantidad))} ${d.unidad} de ${d.articulo}`,
  )
  lineas.push(`🏭 *Almacén:* ${d.almacen}`)
  if (d.paraQuien) lineas.push(`🎯 *Para:* ${d.paraQuien}`)
  if (d.valorUsd !== null) lineas.push(`💰 *Valor:* $ ${cantidadFmt.format(Number(d.valorUsd))}`)
  lineas.push('')

  if (d.nota) {
    lineas.push(`📝 *Nota:* ${d.nota}`)
    lineas.push('')
  }

  lineas.push(`✍️ Registró: ${d.registradoPor}`)
  if (d.fotos !== null) {
    lineas.push(`📷 ${d.fotos} foto${d.fotos === 1 ? '' : 's'} adjunta${d.fotos === 1 ? '' : 's'}`)
  }

  return lineas.join('\n')
}
