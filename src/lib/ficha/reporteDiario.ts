/*
  El reporte diario de operaciones, en texto plano.

  No es un PDF ni un archivo: es el mensaje que hoy alguien escribe a mano cada
  tarde en WhatsApp. El sistema lo arma con lo que ya sabe, y quien lo manda
  solo lo copia y lo pega.

  ═══════════════════════════════════════════════════════════════════════════
  POR QUÉ TEXTO Y NO UN PDF
  ═══════════════════════════════════════════════════════════════════════════

  Un PDF en un grupo de WhatsApp hay que abrirlo. El reporte diario se lee de
  un vistazo en la propia conversación, y por eso lleva veinte años siendo un
  mensaje. Cambiarlo por un adjunto no es modernizarlo: es que dejen de leerlo.

  ═══════════════════════════════════════════════════════════════════════════
  NADA DE FORMATO QUE WHATSAPP NO ENTIENDA
  ═══════════════════════════════════════════════════════════════════════════

  Sin tablas, sin columnas alineadas con espacios —WhatsApp usa tipografía de
  ancho variable y las descuadra—, sin emoji. Los asteriscos sí: son su forma
  de poner negrita, y así los títulos se distinguen.

  ═══════════════════════════════════════════════════════════════════════════
  LO QUE NO SE SABE SE DICE
  ═══════════════════════════════════════════════════════════════════════════

  Si no se anotó ningún horómetro, el reporte dice que no se anotó en vez de
  callar la sección: un reporte sin la línea de equipos parece un día sin
  equipos. Y si hay camiones sin carga útil, el total de metros cúbicos sale
  marcado como parcial, con cuántos viajes no está contando.
*/

/**
 * La densidad con la que el reporte de la casa convierte a toneladas.
 *
 * Es la del material que baja de la mina, sin clasificar. Los productos
 * terminados llevan 1,44 en el catálogo y no se mezclan aquí: lo que se
 * convierte es lo que salió del frente, no lo que salió de la planta.
 */
const DENSIDAD_MINA = 1.55

const decimal1 = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

const entero = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 0 })

const dia = new Intl.DateTimeFormat('es-VE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export interface EquipoDelReporte {
  codigo: string
  maquina: string
  tipo: string
  horas: string | null
  operador: string | null
}

export interface CamionDelReporte {
  placa: string
  transportista: string
  chofer: string | null
  /** Viajes vivos por tramo, ya contados. */
  aPlanta: number
  aLavado: number
  coraza: number
  /** Nulo cuando ninguno de sus viajes sabe cuánto cargó. */
  m3: number | null
  /** Cuántos de sus viajes no suman metros cúbicos. */
  sinCarga: number
}

export interface DatosReporteDiario {
  fecha: string
  razonSocial: string
  equipos: EquipoDelReporte[]
  camiones: CamionDelReporte[]
  /** Lo que se teclea al generarlo. Vacío es una respuesta válida. */
  novedades: string
}

/** «jueves 11 de septiembre de 2026», con la inicial en mayúscula. */
function fechaLarga(iso: string): string {
  const texto = dia.format(new Date(`${iso.slice(0, 10)}T12:00:00`))
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function textoDelReporteDiario(d: DatosReporteDiario): string {
  const lineas: string[] = []

  lineas.push('*REPORTE DIARIO DE OPERACIONES*')
  lineas.push(d.razonSocial)
  lineas.push(fechaLarga(d.fecha))
  lineas.push('')

  // ── Equipos ──────────────────────────────────────────────────────────────
  lineas.push('*EQUIPOS EN OPERACIÓN*')
  if (d.equipos.length === 0) {
    lineas.push('No se anotó el horómetro de ningún equipo.')
  } else {
    for (const e of d.equipos) {
      const horas = e.horas === null ? null : `${decimal1.format(Number(e.horas))} h`
      lineas.push(
        `• ${e.codigo} ${e.maquina}${[horas, e.operador].filter(Boolean).length > 0 ? ' — ' : ''}${[horas, e.operador].filter(Boolean).join(' — ')}`,
      )
    }
  }
  lineas.push('')

  // ── Transporte ───────────────────────────────────────────────────────────
  lineas.push('*TRANSPORTE*')
  if (d.camiones.length === 0) {
    lineas.push('No se registraron viajes.')
  } else {
    for (const c of d.camiones) {
      const tramos = [
        c.aPlanta > 0 ? `${entero.format(c.aPlanta)} a planta` : null,
        c.aLavado > 0 ? `${entero.format(c.aLavado)} a lavado` : null,
        c.coraza > 0 ? `${entero.format(c.coraza)} de coraza` : null,
      ].filter(Boolean)

      const quien = [c.placa, c.chofer].filter(Boolean).join(' · ')
      const cuanto = c.m3 === null ? '' : ` — ${decimal1.format(c.m3)} m³`
      lineas.push(`• ${quien} (${c.transportista}): ${tramos.join(', ')}${cuanto}`)
    }
  }
  lineas.push('')

  // ── Totales ──────────────────────────────────────────────────────────────
  const viajes = d.camiones.reduce((s, c) => s + c.aPlanta + c.aLavado + c.coraza, 0)
  const deLaMina = d.camiones.reduce((s, c) => s + c.aPlanta + c.coraza, 0)
  const m3 = d.camiones.reduce((s, c) => s + (c.m3 ?? 0), 0)
  const sinCarga = d.camiones.reduce((s, c) => s + c.sinCarga, 0)
  const hayM3 = d.camiones.some((c) => c.m3 !== null)

  lineas.push('*TOTALES*')
  lineas.push(`Viajes: ${entero.format(viajes)} (${entero.format(deLaMina)} bajaron de la mina)`)

  if (!hayM3) {
    lineas.push('Metros cúbicos: no se puede calcular, ningún camión tiene carga útil cargada.')
  } else if (sinCarga > 0) {
    lineas.push(
      `Metros cúbicos: ${decimal1.format(m3)} m³ (parcial: ${entero.format(sinCarga)} viajes sin medir)`,
    )
    lineas.push(`Toneladas: ${entero.format(m3 * DENSIDAD_MINA)} t aprox. (parcial)`)
  } else {
    lineas.push(`Metros cúbicos: ${decimal1.format(m3)} m³`)
    lineas.push(`Toneladas: ${entero.format(m3 * DENSIDAD_MINA)} t aprox.`)
  }
  lineas.push('')

  // ── Novedades ────────────────────────────────────────────────────────────
  lineas.push('*NOVEDADES*')
  const novedades = d.novedades.trim()
  lineas.push(novedades === '' ? 'Sin novedades.' : novedades)

  return lineas.join('\n')
}

/**
 * Lo deja en el portapapeles.
 *
 * Devuelve si lo consiguió: el navegador puede negarse —sin https, o sin que
 * el gesto del usuario haya llegado hasta aquí— y entonces la pantalla enseña
 * el texto para copiarlo a mano en vez de decir que ya está copiado.
 */
export async function copiarAlPortapapeles(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    return false
  }
}
