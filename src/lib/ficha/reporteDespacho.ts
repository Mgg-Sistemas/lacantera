/*
  EL REPORTE DE UN DESPACHO, EN TEXTO PLANO.

  Hermano del reporte diario de operaciones (`reporteDiario.ts`): mismo
  idioma —asteriscos para la negrita, emoji fijos, nada de tablas que
  WhatsApp descuadra—, pero de una sola nota, no del día entero.

  Christopher, 16/10/2026: «me están pidiendo un reporte individual de cada
  salida y nota de entrega». A diferencia del reporte diario, este no se pide
  aparte: sale solo, listo para compartir, apenas se aprueba el despacho —y
  se puede volver a sacar después, desde el detalle de la nota, por si hay
  que reenviarlo.
*/

export interface RenglonDelReporteDespacho {
  cantidad: string | number
  unidad: string
  descripcion: string
}

export interface DatosReporteDespacho {
  numero: string
  razonSocial: string
  fecha: string
  cliente: string | null
  /** Un camión por nota, o varios si se cargó en más de uno. */
  camiones: Array<{ vehiculo: string | null; chofer: string | null }>
  renglones: RenglonDelReporteDespacho[]
  moneda: string
  total: string | number
  totalBs: string | number
  totalUsd: string | number
  /** Quién lo pidió y quién lo aprobó, ya con su nombre resuelto. Null si no se sabe —una nota vieja, por ejemplo—. */
  pedidoPor: string | null
  aprobadoPor: string | null
  /** Cuántas fotos del vehículo tiene adjuntas el despacho que la originó. */
  fotos: number
  observacion: string | null
}

const dia = new Intl.DateTimeFormat('es-VE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const entero = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 2 })
const dinero2 = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const SIMBOLO: Record<string, string> = { USD: '$', VES: 'Bs' }

/** «Jueves 16 de octubre de 2026», con la inicial en mayúscula. */
function fechaLarga(iso: string): string {
  const texto = dia.format(new Date(`${iso.slice(0, 10)}T12:00:00`))
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function textoDelReporteDespacho(d: DatosReporteDespacho): string {
  const lineas: string[] = []

  lineas.push(`🚛 *DESPACHO ${d.numero}*`)
  lineas.push(d.razonSocial)
  lineas.push(fechaLarga(d.fecha))
  lineas.push('')

  lineas.push(`👤 *Cliente:* ${d.cliente ?? 'Por concretar'}`)

  if (d.camiones.length === 0) {
    lineas.push('🚚 *Vehículo:* Sin registrar')
  } else {
    for (const c of d.camiones) {
      const quien = [c.vehiculo ?? 'Sin placa', c.chofer].filter(Boolean).join(' · ')
      lineas.push(`🚚 *Vehículo:* ${quien}`)
    }
  }
  lineas.push('')

  lineas.push('🧱 *Material:*')
  if (d.renglones.length === 0) {
    lineas.push('Sin renglones.')
  } else {
    for (const r of d.renglones) {
      lineas.push(`• ${entero.format(Number(r.cantidad))} ${r.unidad} de ${r.descripcion}`)
    }
  }
  lineas.push('')

  const simbolo = SIMBOLO[d.moneda] ?? d.moneda
  lineas.push(
    `💰 *Total:* ${simbolo} ${dinero2.format(Number(d.total))} ` +
      `(Bs ${dinero2.format(Number(d.totalBs))} · $ ${dinero2.format(Number(d.totalUsd))})`,
  )
  lineas.push('')

  if (d.observacion) {
    lineas.push(`📝 *Observación:* ${d.observacion}`)
    lineas.push('')
  }

  lineas.push(`✍️ Solicitante: ${d.pedidoPor ?? '—'} · Aprobó: ${d.aprobadoPor ?? '—'}`)
  lineas.push(`📷 ${d.fotos} foto${d.fotos === 1 ? '' : 's'} del vehículo adjunta${d.fotos === 1 ? '' : 's'}`)

  return lineas.join('\n')
}
