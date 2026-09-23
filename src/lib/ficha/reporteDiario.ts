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

  Sin tablas y sin columnas alineadas con espacios: WhatsApp usa tipografía de
  ancho variable y las descuadra. Los asteriscos sí, que son su forma de poner
  negrita, y así los títulos se distinguen.

  ═══════════════════════════════════════════════════════════════════════════
  CON EMOJI, Y NO ES ADORNO (23/09/2026)
  ═══════════════════════════════════════════════════════════════════════════

  Esto nació el 12/09 diciendo «sin emoji», y estaba mal. Christopher mandó el
  mensaje que de verdad se manda cada tarde al grupo y lleva emoji en cada
  título y en cada renglón de transporte y de totales. El reporte que arma el
  sistema tiene que poder pegarse en la conversación sin que nadie note el
  cambio; si llega en otro formato, el grupo lo lee como un mensaje ajeno.

  Así que los emoji de aquí abajo no se eligieron: se copiaron de su mensaje,
  uno por uno, y las secciones van numeradas como allí. Cambiar uno cambia
  cómo se ve el mensaje en el grupo, no solo el código.

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

/**
 * El recorrido que encabeza el mensaje.
 *
 * Va en el título porque en el suyo va: el grupo sabe de un vistazo de dónde
 * a dónde se movió el material. Si algún día la casa reporta otro recorrido,
 * se cambia aquí y en ningún otro sitio.
 */
const RECORRIDO = 'EXPLORACIÓN / MINA ➔ PLANTA FIJA'

/** «1,55», con la coma de aquí. */
const densidadEscrita = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(DENSIDAD_MINA)

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

  lineas.push(`📊 *REPORTE DIARIO DE OPERACIONES: ${RECORRIDO}* 🏭`)
  lineas.push(d.razonSocial)
  lineas.push(fechaLarga(d.fecha))
  lineas.push('')

  // ── Equipos ──────────────────────────────────────────────────────────────
  //
  // Sin viñeta y sin emoji por renglón, como en el suyo: el emoji del título
  // ya dice que lo de abajo son máquinas, y repetirlo en cada línea convierte
  // la lista en una pared de dibujitos.
  lineas.push('🚜 *1. EQUIPOS Y MAQUINARIA EN OPERACIÓN*')
  if (d.equipos.length === 0) {
    lineas.push('No se anotó el horómetro de ningún equipo.')
  } else {
    for (const e of d.equipos) {
      const horas = e.horas === null ? null : `${decimal1.format(Number(e.horas))} h`
      const cola = [horas, e.operador].filter(Boolean).join(' — ')
      lineas.push(`${e.codigo} ${e.maquina}${cola === '' ? '' : ` — ${cola}`}`)
    }
  }

  // La flota cierra la sección de equipos, igual que en el suyo: los camiones
  // también son máquinas del día, y así el grupo ve de una cuántos hubo y de
  // qué empresas antes de entrar al detalle.
  if (d.camiones.length > 0) {
    const empresas = [...new Set(d.camiones.map((c) => c.transportista).filter(Boolean))]
    lineas.push(
      `*Flota de Transporte:* ${entero.format(d.camiones.length)} ` +
        `${d.camiones.length === 1 ? 'camión' : 'camiones'}` +
        (empresas.length === 0 ? '' : ` (${empresas.join(' / ')})`),
    )
  }
  lineas.push('')

  // ── Transporte ───────────────────────────────────────────────────────────
  lineas.push('🚚 *2. RESUMEN DE TRANSPORTE Y FLETES*')
  if (d.camiones.length === 0) {
    lineas.push('No se registraron viajes.')
  } else {
    for (const c of d.camiones) {
      const tramos = [
        c.aPlanta > 0 ? { n: c.aPlanta, nombre: 'a planta' } : null,
        c.aLavado > 0 ? { n: c.aLavado, nombre: 'a lavado' } : null,
        c.coraza > 0 ? { n: c.coraza, nombre: 'de coraza' } : null,
      ].filter((t) => t !== null)

      const total = c.aPlanta + c.aLavado + c.coraza
      const viajes = `${entero.format(total)} ${total === 1 ? 'viaje' : 'viajes'}`

      // Con un solo tramo el desglose diría dos veces el mismo número
      // —«10 viajes (10 a planta)»—, así que el tramo se pega al total.
      const detalle =
        tramos.length === 1
          ? ` ${tramos[0].nombre}`
          : ` (${tramos.map((t) => `${entero.format(t.n)} ${t.nombre}`).join(', ')})`

      const quien = c.chofer === null ? '' : ` | ${c.chofer}`
      const cuanto = c.m3 === null ? '' : ` — ${decimal1.format(c.m3)} m³`
      lineas.push(`🚛 ${c.transportista} (Placa: ${c.placa})${quien} ➔ ${viajes}${detalle}${cuanto} 🟢`)
    }
  }
  lineas.push('')

  // ── Totales ──────────────────────────────────────────────────────────────
  const viajes = d.camiones.reduce((s, c) => s + c.aPlanta + c.aLavado + c.coraza, 0)
  const deLaMina = d.camiones.reduce((s, c) => s + c.aPlanta + c.coraza, 0)
  const m3 = d.camiones.reduce((s, c) => s + (c.m3 ?? 0), 0)
  const sinCarga = d.camiones.reduce((s, c) => s + c.sinCarga, 0)
  const hayM3 = d.camiones.some((c) => c.m3 !== null)

  lineas.push('📈 *3. TOTALES DE MATERIAL TRASLADADO*')
  lineas.push(
    `🔄 Total de Fletes / Viajes: ${entero.format(viajes)} viajes ` +
      `(${entero.format(deLaMina)} bajaron de la mina)`,
  )

  const tonelaje = `⚖️ Tonelaje Estimado (Densidad ~${densidadEscrita} t/m³): ~${entero.format(m3 * DENSIDAD_MINA)} Toneladas`

  if (!hayM3) {
    lineas.push('📦 Volumen Total: no se puede calcular, ningún camión tiene carga útil cargada.')
  } else if (sinCarga > 0) {
    lineas.push(
      `📦 Volumen Total: ${decimal1.format(m3)} m³ (parcial: ${entero.format(sinCarga)} viajes sin medir)`,
    )
    lineas.push(`${tonelaje} (parcial)`)
  } else {
    lineas.push(`📦 Volumen Total: ${decimal1.format(m3)} m³`)
    lineas.push(tonelaje)
  }
  lineas.push('')

  // ── Novedades ────────────────────────────────────────────────────────────
  //
  // Se pegan tal cual se teclean. Quien las escribe les pone sus propios emoji
  // —⚙️ la planta, 🚜 la máquina, ⚡ el generador, 🚧 el paso—, y eso no lo
  // puede adivinar el sistema: son el juicio del día, no un dato.
  lineas.push('🛠️ *4. OPERATIVIDAD Y NOVEDADES*')
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
