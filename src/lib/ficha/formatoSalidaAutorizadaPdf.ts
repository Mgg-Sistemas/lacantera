import { logoComoImagen } from '@/lib/ficha/logo'
import { ajustar } from '@/lib/ficha/hoja'
import type { ArchivoArmado } from '@/lib/ficha/armado'

/*
  FORMATO DE SALIDA AUTORIZADA (ARTÍCULOS NO INVENTARIADOS / ÁREA DE CANTERA)

  Sigue el diseño ejecutivo de «Constancia y Autorización Operativa» con:
    - Página 1: Membrete corporativo, Lugar y Fecha, título «CONSTANCIA Y
      AUTORIZACIÓN OPERATIVA», recuadro de ASUNTO con barra lateral naranja,
      párrafo formal con autorización de Norbelis Sequea, tabla de
      ESPECIFICACIONES DEL COMPONENTE / MATERIAL, tabla de RESPONSABLES DEL
      TRASLADO / TÉCNICO y bloque de firma centrado al pie.
    - Página 2 (y siguientes si hay más de 4 fotos): ANEXO FOTOGRÁFICO con el
      registro visual en tarjetas enmarcadas y pie «Fotografía N — ...».
*/

export interface RenglonEspecificacionSalida {
  concepto: string
  detalle: string
}

export interface ResponsableTrasladoSalida {
  nombre: string
  cedula: string
  rol: string
}

export interface FotoAnexoSalida {
  /** Data URL JPEG ya normalizada para jsPDF. */
  dataUrl: string
  /** Descripción que acompaña a «Fotografía N — ...». */
  leyenda: string
}

export interface DatosFormatoSalidaAutorizada {
  lugar: string
  fechaIso: string
  kicker?: string
  titulo: string
  asunto: string
  autorizadoPor: string
  autorizadoCedula: string
  autorizadoCargo: string
  instalacion: string
  descripcionCorta: string
  motivoResumen: string
  parrafoPersonalizado?: string | null
  especificaciones: RenglonEspecificacionSalida[]
  responsables: ResponsableTrasladoSalida[]
  firmaPieLinea1: string
  firmaPieLinea2: string
  subtituloAnexo?: string
  fotos: FotoAnexoSalida[]
  empresa?: {
    razonSocial?: string
    subtitulo?: string
  }
}

type Doc = import('jspdf').jsPDF

// Márgenes amplios estilo documento ejecutivo (18 mm por lado en A4 = 174 mm útiles)
const IZQ = 18
const DER = 192
const ANCHO = DER - IZQ
const CENTRO = IZQ + ANCHO / 2
const PIE_Y = 282

// Paleta ejecutiva idéntica al modelo adjunto
const AZUL_OSCURO = '#1b2631'
const TINTA = '#1f2937'
const TEXTO_CUERPO = '#334155'
const GRIS = '#64748b'
const NARANJA = '#c2511a'
const FONDO_ASUNTO = '#f3f4f6'
const BORDE_TABLA = '#cbd5e1'
const FILA_PAR = '#f8fafc'

const MESES_LARGOS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

export function fechaEjecutivaLarga(iso: string): string {
  const limpio = iso.slice(0, 10)
  const [a, m, d] = limpio.split('-').map(Number)
  if (!a || !m || !d) return iso
  return `${d} de ${MESES_LARGOS[m - 1] ?? ''} de ${a}`
}

type SegmentoTexto = {
  texto: string
  negrita?: boolean
}

/**
 * Dibuja un párrafo con palabras en negrita intercaladas, repartiendo por
 * renglones dentro de `anchoMax`.
 */
function pintarParrafoMixto(
  doc: Doc,
  segmentos: SegmentoTexto[],
  x: number,
  y: number,
  anchoMax: number,
  talla = 10,
  altoLinea = 5.2,
): number {
  type Palabra = { texto: string; negrita: boolean; espacioDespues: boolean }
  const palabras: Palabra[] = []

  for (const seg of segmentos) {
    const trozos = seg.texto.split(/(\s+)/)
    for (const t of trozos) {
      if (!t) continue
      if (/^\s+$/.test(t)) {
        if (palabras.length > 0) palabras[palabras.length - 1].espacioDespues = true
      } else {
        palabras.push({ texto: t, negrita: Boolean(seg.negrita), espacioDespues: false })
      }
    }
  }

  const medirPalabra = (p: Palabra) => {
    doc.setFont('helvetica', p.negrita ? 'bold' : 'normal').setFontSize(talla)
    return doc.getTextWidth(p.texto)
  }
  doc.setFont('helvetica', 'normal').setFontSize(talla)
  const anchoEspacio = doc.getTextWidth(' ')

  const lineas: Palabra[][] = []
  let actual: Palabra[] = []
  let anchoActual = 0

  for (const p of palabras) {
    const w = medirPalabra(p)
    const extraEspacio = actual.length > 0 && actual[actual.length - 1].espacioDespues ? anchoEspacio : 0
    if (actual.length > 0 && anchoActual + extraEspacio + w > anchoMax) {
      lineas.push(actual)
      actual = [p]
      anchoActual = w
    } else {
      anchoActual += extraEspacio + w
      actual.push(p)
    }
  }
  if (actual.length > 0) lineas.push(actual)

  let cursorY = y
  doc.setTextColor(TEXTO_CUERPO)

  for (const linea of lineas) {
    let cursorX = x
    for (let i = 0; i < linea.length; i++) {
      const p = linea[i]
      doc.setFont('helvetica', p.negrita ? 'bold' : 'normal').setFontSize(talla)
      doc.text(p.texto, cursorX, cursorY)
      cursorX += doc.getTextWidth(p.texto)
      if (p.espacioDespues && i < linea.length - 1) {
        cursorX += anchoEspacio
      }
    }
    cursorY += altoLinea
  }

  return cursorY
}

function pintarTablaEjecutiva(
  doc: Doc,
  yInicial: number,
  columnas: Array<{ titulo: string; ancho: number }>,
  filas: Array<{ celdas: string[]; primeraEnNegrita?: boolean }>,
): number {
  const ALTO_CABECERA = 8.5
  const PAD_X = 3.2
  const ALTO_BASE = 8.2
  const ALTO_LINEA = 4.1
  let y = yInicial

  // Cabecera azul oscuro
  doc.setFillColor(AZUL_OSCURO)
  doc.rect(IZQ, y, ANCHO, ALTO_CABECERA, 'F')

  doc.setFont('helvetica', 'bold').setFontSize(8.8).setTextColor('#FFFFFF')
  let xCab = IZQ
  for (const col of columnas) {
    doc.text(col.titulo, xCab + PAD_X, y + 5.7)
    xCab += col.ancho
  }
  y += ALTO_CABECERA

  filas.forEach((fila, idx) => {
    const lineasPorCol = columnas.map((col, cIdx) => {
      const esNegrita = cIdx === 0 && (fila.primeraEnNegrita ?? true)
      doc.setFont('helvetica', esNegrita ? 'bold' : 'normal').setFontSize(8.8)
      const texto = fila.celdas[cIdx]?.trim() || '—'
      return doc.splitTextToSize(texto, col.ancho - PAD_X * 2) as string[]
    })

    const maxLineas = Math.max(1, ...lineasPorCol.map((l) => l.length))
    const altoFila = ALTO_BASE + (maxLineas - 1) * ALTO_LINEA

    if (idx % 2 === 1) {
      doc.setFillColor(FILA_PAR)
      doc.rect(IZQ, y, ANCHO, altoFila, 'F')
    }

    // Bordes de celda
    doc.setDrawColor(BORDE_TABLA).setLineWidth(0.25)
    let xCelda = IZQ
    columnas.forEach((col, cIdx) => {
      doc.rect(xCelda, y, col.ancho, altoFila, 'S')
      const esNegrita = cIdx === 0 && (fila.primeraEnNegrita ?? true)
      doc.setFont('helvetica', esNegrita ? 'bold' : 'normal').setFontSize(8.8)
      doc.setTextColor(esNegrita ? TINTA : TEXTO_CUERPO)
      doc.text(lineasPorCol[cIdx], xCelda + PAD_X, y + 5.5, { lineHeightFactor: 1.3 })
      xCelda += col.ancho
    })

    y += altoFila
  })

  return y
}

function pintarTarjetaFoto(
  doc: Doc,
  x: number,
  y: number,
  anchoTarjeta: number,
  altoTarjeta: number,
  foto: FotoAnexoSalida,
  numero: number,
) {
  const PAD = 2.8
  const ALTO_LEYENDA = 8.5
  const anchoImg = anchoTarjeta - PAD * 2
  const altoImg = altoTarjeta - PAD - ALTO_LEYENDA

  // Marco exterior
  doc.setFillColor('#FFFFFF')
  doc.setDrawColor(BORDE_TABLA).setLineWidth(0.3)
  doc.rect(x, y, anchoTarjeta, altoTarjeta, 'FD')

  // Imagen centrada o encajada dentro del hueco
  try {
    doc.addImage(foto.dataUrl, 'JPEG', x + PAD, y + PAD, anchoImg, altoImg)
  } catch {
    doc.setFillColor(FONDO_ASUNTO)
    doc.rect(x + PAD, y + PAD, anchoImg, altoImg, 'F')
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(GRIS)
    doc.text('Imagen no disponible', x + anchoTarjeta / 2, y + PAD + altoImg / 2, {
      align: 'center',
    })
  }

  // Pie de la fotografía
  const leyendaLimpia = foto.leyenda.trim() || `Vista de referencia ${numero}`
  const rotulo = `Fotografía ${numero} — ${leyendaLimpia}`
  doc.setFont('helvetica', 'bold').setFontSize(8.2).setTextColor(TINTA)
  doc.text(
    ajustar(doc, rotulo, anchoTarjeta - PAD * 2),
    x + anchoTarjeta / 2,
    y + altoTarjeta - 2.8,
    { align: 'center' },
  )
}

function pintarPieDePaginas(doc: Doc, razonSocial: string, lugar: string) {
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(GRIS)
    doc.text(`${razonSocial} — Cantera de ${lugar || 'Naiguatá'}`, IZQ, PIE_Y)
    doc.text(`Página ${p} de ${total}`, DER, PIE_Y, { align: 'right' })
  }
}

export async function armarFormatoSalidaAutorizada(
  d: DatosFormatoSalidaAutorizada,
): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  const razonSocial = (d.empresa?.razonSocial || 'MINERÍA INTERNACIONAL TS, C.A.').toUpperCase()
  const subtituloEmpresa = (
    d.empresa?.subtitulo || 'OPERACIONES Y MANTENIMIENTO'
  ).toUpperCase()
  const lugar = d.lugar.trim() || 'Naiguatá'
  const fechaTexto = `${lugar}, ${fechaEjecutivaLarga(d.fechaIso)}`

  // ═══════════════════════════════════════════════════════════════════════════
  // PÁGINA 1: CONSTANCIA Y AUTORIZACIÓN OPERATIVA
  // ═══════════════════════════════════════════════════════════════════════════
  let y = 18

  if (logo) {
    try {
      doc.addImage(logo, 'PNG', IZQ, y, 22, 22)
    } catch {
      // Si el logo falla, continúa sin interrumpir el documento
    }
  }

  const xMembrete = logo ? IZQ + 26 : IZQ
  doc.setFont('helvetica', 'bold').setFontSize(13.5).setTextColor(TINTA)
  doc.text(ajustar(doc, razonSocial, 102), xMembrete, y + 10)

  doc.setFont('helvetica', 'bold').setFontSize(8.2).setTextColor(NARANJA)
  doc.text(subtituloEmpresa, xMembrete, y + 15.2)

  // Lugar y fecha a la derecha
  doc.setFont('helvetica', 'bold').setFontSize(8.8).setTextColor(TINTA)
  doc.text('Lugar y Fecha:', DER, y + 10, { align: 'right' })
  doc.setFont('helvetica', 'normal').setFontSize(8.8).setTextColor(TEXTO_CUERPO)
  doc.text(fechaTexto, DER, y + 15, { align: 'right' })

  y += 26
  doc.setDrawColor(AZUL_OSCURO).setLineWidth(0.6)
  doc.line(IZQ, y, DER, y)

  // Kicker y Título principal
  y += 10
  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(NARANJA)
  doc.text((d.kicker || 'CONSTANCIA Y AUTORIZACIÓN OPERATIVA').toUpperCase(), IZQ, y)

  y += 7
  doc.setFont('helvetica', 'bold').setFontSize(15.5).setTextColor(TINTA)
  doc.text(ajustar(doc, d.titulo || 'Autorización de Salida de Componente / Material', ANCHO), IZQ, y)

  // Recuadro ASUNTO con barra lateral naranja
  y += 7
  const textoAsunto = d.asunto.trim() || `Autorización de salida de ${d.descripcionCorta}.`
  doc.setFont('helvetica', 'normal').setFontSize(9.5)
  const lineasAsunto = doc.splitTextToSize(`ASUNTO: ${textoAsunto}`, ANCHO - 10) as string[]
  const altoCajaAsunto = Math.max(11.5, 6.5 + lineasAsunto.length * 4.4)

  doc.setFillColor(FONDO_ASUNTO)
  doc.setDrawColor(BORDE_TABLA).setLineWidth(0.25)
  doc.rect(IZQ, y, ANCHO, altoCajaAsunto, 'FD')

  doc.setFillColor(NARANJA)
  doc.rect(IZQ, y, 1.5, altoCajaAsunto, 'F')

  y =
    pintarParrafoMixto(
      doc,
      [
        { texto: 'ASUNTO: ', negrita: true },
        { texto: textoAsunto },
      ],
      IZQ + 5,
      y + 7.2,
      ANCHO - 9,
      9.5,
      4.5,
    ) +
    (altoCajaAsunto - lineasAsunto.length * 4.5 - 1)

  // Párrafo formal de autorización
  y += 6
  if (d.parrafoPersonalizado && d.parrafoPersonalizado.trim()) {
    y = pintarParrafoMixto(
      doc,
      [{ texto: d.parrafoPersonalizado.trim() }],
      IZQ,
      y,
      ANCHO,
      10,
      5.4,
    )
  } else {
    const cargoAutoriza = d.autorizadoCargo.trim()
      ? `${d.autorizadoCargo.trim()}, `
      : ''
    y = pintarParrafoMixto(
      doc,
      [
        {
          texto: `Por medio de la presente, se solicita y deja constancia de la autorización otorgada por ${cargoAutoriza}`,
        },
        { texto: d.autorizadoPor.trim() || 'Norbelis Sequea', negrita: true },
        { texto: ', titular de la cédula de identidad ' },
        { texto: d.autorizadoCedula.trim() || 'V-25.445.835', negrita: true },
        {
          texto: `, para la salida de las instalaciones de la ${d.instalacion.trim() || 'Cantera de Naiguatá'} `,
        },
        { texto: razonSocial, negrita: true },
        {
          texto: ` del siguiente material, equipo o componente, con fines exclusivos de ${d.motivoResumen.trim() || 'traslado y operación autorizada'}.`,
        },
      ],
      IZQ,
      y,
      ANCHO,
      10,
      5.4,
    )
  }

  // Sección 1: ESPECIFICACIONES
  y += 6
  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(TINTA)
  doc.text('ESPECIFICACIONES DEL COMPONENTE / MATERIAL', IZQ, y)
  y += 4

  y = pintarTablaEjecutiva(
    doc,
    y,
    [
      { titulo: 'Concepto', ancho: 54 },
      { titulo: 'Detalle', ancho: ANCHO - 54 },
    ],
    d.especificaciones
      .filter((r) => r.concepto.trim() || r.detalle.trim())
      .map((r) => ({
        celdas: [r.concepto, r.detalle],
        primeraEnNegrita: true,
      })),
  )

  // Sección 2: RESPONSABLES DEL TRASLADO / TÉCNICO
  const responsablesValidos = d.responsables.filter(
    (r) => r.nombre.trim() || r.cedula.trim() || r.rol.trim(),
  )
  if (responsablesValidos.length > 0) {
    y += 9
    doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(TINTA)
    doc.text('RESPONSABLES DEL TRASLADO / TÉCNICO', IZQ, y)
    y += 4

    y = pintarTablaEjecutiva(
      doc,
      y,
      [
        { titulo: 'Nombre y Apellido', ancho: 62 },
        { titulo: 'Cédula de Identidad', ancho: 44 },
        { titulo: 'Rol', ancho: ANCHO - 106 },
      ],
      responsablesValidos.map((r) => ({
        celdas: [r.nombre, r.cedula, r.rol || 'Responsable de traslado / técnico'],
        primeraEnNegrita: true,
      })),
    )
  }

  // Bloque de firma centrado al pie de la primera página
  const yFirma = Math.max(y + 24, 242)
  if (yFirma < PIE_Y - 14) {
    doc.setDrawColor(AZUL_OSCURO).setLineWidth(0.5)
    doc.line(CENTRO - 38, yFirma, CENTRO + 38, yFirma)

    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(TINTA)
    doc.text(d.autorizadoPor.trim() || 'Norbelis Sequea', CENTRO, yFirma + 5, {
      align: 'center',
    })

    if (d.firmaPieLinea1.trim()) {
      doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(TEXTO_CUERPO)
      doc.text(d.firmaPieLinea1.trim(), CENTRO, yFirma + 9.4, { align: 'center' })
    }

    if (d.firmaPieLinea2.trim()) {
      doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(NARANJA)
      doc.text(d.firmaPieLinea2.trim().toUpperCase(), CENTRO, yFirma + 14, {
        align: 'center',
      })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PÁGINA 2+: ANEXO FOTOGRÁFICO
  // ═══════════════════════════════════════════════════════════════════════════
  if (d.fotos.length > 0) {
    const TAMANO_GRUPO = d.fotos.length === 4 ? 4 : 3
    for (let offset = 0; offset < d.fotos.length; offset += TAMANO_GRUPO) {
      const lote = d.fotos.slice(offset, offset + TAMANO_GRUPO)
      doc.addPage()

      let yAnexo = 20
      doc.setFont('helvetica', 'bold').setFontSize(12.5).setTextColor(TINTA)
      doc.text('ANEXO FOTOGRÁFICO', IZQ, yAnexo)

      doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(NARANJA)
      doc.text(ajustar(doc, d.descripcionCorta || d.titulo, 90), DER, yAnexo, {
        align: 'right',
      })

      yAnexo += 3.5
      doc.setDrawColor(AZUL_OSCURO).setLineWidth(0.6)
      doc.line(IZQ, yAnexo, DER, yAnexo)

      yAnexo += 7
      const textoSubAnexo =
        d.subtituloAnexo?.trim() ||
        `Registro visual del estado físico en el que se autoriza la salida del material o componente de las instalaciones de la ${d.instalacion.trim() || 'Cantera de Naiguatá'}.`
      doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(TEXTO_CUERPO)
      const lineasSub = doc.splitTextToSize(textoSubAnexo, ANCHO) as string[]
      doc.text(lineasSub, IZQ, yAnexo, { lineHeightFactor: 1.4 })
      yAnexo += lineasSub.length * 4.8 + 5

      const SEP = 6
      const anchoMitad = (ANCHO - SEP) / 2

      if (lote.length === 1) {
        const anchoUna = 132
        const altoUna = 150
        pintarTarjetaFoto(
          doc,
          CENTRO - anchoUna / 2,
          yAnexo + 4,
          anchoUna,
          altoUna,
          lote[0],
          offset + 1,
        )
      } else if (lote.length === 2) {
        const altoDos = 122
        pintarTarjetaFoto(doc, IZQ, yAnexo + 6, anchoMitad, altoDos, lote[0], offset + 1)
        pintarTarjetaFoto(
          doc,
          IZQ + anchoMitad + SEP,
          yAnexo + 6,
          anchoMitad,
          altoDos,
          lote[1],
          offset + 2,
        )
      } else if (lote.length === 3) {
        // Exactamente como el modelo adjunto: 2 arriba en paralelo + 1 centrada abajo
        const altoSup = 104
        const altoInf = 94
        const anchoInf = 104
        pintarTarjetaFoto(doc, IZQ, yAnexo, anchoMitad, altoSup, lote[0], offset + 1)
        pintarTarjetaFoto(
          doc,
          IZQ + anchoMitad + SEP,
          yAnexo,
          anchoMitad,
          altoSup,
          lote[1],
          offset + 2,
        )
        pintarTarjetaFoto(
          doc,
          CENTRO - anchoInf / 2,
          yAnexo + altoSup + SEP,
          anchoInf,
          altoInf,
          lote[2],
          offset + 3,
        )
      } else {
        // 4 fotos: cuadrícula 2×2
        const altoCuatro = 98
        pintarTarjetaFoto(doc, IZQ, yAnexo, anchoMitad, altoCuatro, lote[0], offset + 1)
        pintarTarjetaFoto(
          doc,
          IZQ + anchoMitad + SEP,
          yAnexo,
          anchoMitad,
          altoCuatro,
          lote[1],
          offset + 2,
        )
        pintarTarjetaFoto(
          doc,
          IZQ,
          yAnexo + altoCuatro + SEP,
          anchoMitad,
          altoCuatro,
          lote[2],
          offset + 3,
        )
        pintarTarjetaFoto(
          doc,
          IZQ + anchoMitad + SEP,
          yAnexo + altoCuatro + SEP,
          anchoMitad,
          altoCuatro,
          lote[3],
          offset + 4,
        )
      }
    }
  }

  pintarPieDePaginas(doc, 'Minería Internacional TS, C.A.', lugar)
  doc.setProperties({ title: d.titulo || 'Autorización de Salida' })

  const slug = (d.descripcionCorta || 'salida-autorizada')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)

  return {
    blob: doc.output('blob'),
    nombre: `autorizacion-salida-${slug || 'material'}.pdf`,
  }
}
