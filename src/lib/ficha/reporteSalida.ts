/*
  EL REPORTE DE UNA SALIDA, EN TEXTO PLANO.

  Hermano de `reporteDespacho.ts`, para cuando lo que sale no es una venta
  sino un traslado o una entrega a un convenio. Dos números van juntos, a
  propósito: la ORDEN (SS-...) con la que se pidió, y la NOTA (NS-...) que
  de verdad descontó el almacén al entregarla —son papeles distintos, y
  confundirlos es justo lo que este reporte evita.
*/

export interface RenglonDelReporteSalida {
  cantidad: string | number
  unidad: string
  articulo: string
}

export interface DatosReporteSalida {
  numeroOrden: string
  numeroNota: string
  razonSocial: string
  fecha: string
  almacen: string
  /** Ya resuelto: el grupo interno, o «X, de fuera de la empresa · responde Y». */
  destino: string | null
  vehiculo: string | null
  renglones: RenglonDelReporteSalida[]
  pedidoPor: string | null
  aprobadoPor: string | null
  entregadoPor: string | null
  /** Cuántas fotos del vehículo tiene adjuntas la orden que la originó. */
  fotos: number
}

const dia = new Intl.DateTimeFormat('es-VE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const entero = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 2 })

/** «Jueves 16 de octubre de 2026», con la inicial en mayúscula. */
function fechaLarga(iso: string): string {
  const texto = dia.format(new Date(`${iso.slice(0, 10)}T12:00:00`))
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function textoDelReporteSalida(d: DatosReporteSalida): string {
  const lineas: string[] = []

  lineas.push(`📦 *SALIDA ${d.numeroNota}* (orden ${d.numeroOrden})`)
  lineas.push(d.razonSocial)
  lineas.push(fechaLarga(d.fecha))
  lineas.push('')

  lineas.push(`🏭 *Sale de:* ${d.almacen}`)
  lineas.push(`🎯 *Para:* ${d.destino ?? 'Sin destino registrado'}`)
  if (d.vehiculo) lineas.push(`🚚 *Vehículo:* ${d.vehiculo}`)
  lineas.push('')

  lineas.push('🧱 *Material:*')
  if (d.renglones.length === 0) {
    lineas.push('Sin renglones.')
  } else {
    for (const r of d.renglones) {
      lineas.push(`• ${entero.format(Number(r.cantidad))} ${r.unidad} de ${r.articulo}`)
    }
  }
  lineas.push('')

  lineas.push(
    `✍️ Pidió: ${d.pedidoPor ?? '—'} · Aprobó: ${d.aprobadoPor ?? '—'} · Entregó: ${d.entregadoPor ?? '—'}`,
  )
  lineas.push(`📷 ${d.fotos} foto${d.fotos === 1 ? '' : 's'} del vehículo adjunta${d.fotos === 1 ? '' : 's'}`)

  return lineas.join('\n')
}
