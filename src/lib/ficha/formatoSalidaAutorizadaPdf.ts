import { logoComoImagen } from '@/lib/ficha/logo'
import { ajustar } from '@/lib/ficha/hoja'
import type { ArchivoArmado } from '@/lib/ficha/armado'

/*
  FORMATO DE SALIDA AUTORIZADA (ARTÍCULOS NO INVENTARIADOS / ÁREA DE CANTERA)

  Regla clave: todo campo, fila, columna o sección que se deje vacío en el
  formulario se omite por completo del PDF (nunca se imprimen filas con «S/N»,
  «—» ni tablas vacías).
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
  /** Descripción opcional que acompaña a «Fotografía N — ...». */
  leyenda: string
}

export interface DatosFormatoSalidaAutorizada {
  modo?: 'SALIDA' | 'ENTRADA'
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
  const limpio = iso.trim().slice(0, 10)
  if (!limpio) return ''
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
    if (!seg.texto) continue
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

  if (palabras.length === 0) return y

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
    const extraEspacio =
      actual.length > 0 && actual[actual.length - 1].espacioDespues ? anchoEspacio : 0
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
      const texto = fila.celdas[cIdx]?.trim() || ''
      return texto ? (doc.splitTextToSize(texto, col.ancho - PAD_X * 2) as string[]) : ['']
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
      if (lineasPorCol[cIdx][0]) {
        doc.text(lineasPorCol[cIdx], xCelda + PAD_X, y + 5.5, { lineHeightFactor: 1.3 })
      }
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

  // Pie de la fotografía: si no se llenó la leyenda, solo dice «Fotografía N»
  const leyendaLimpia = foto.leyenda.trim()
  const rotulo = leyendaLimpia ? `Fotografía ${numero} — ${leyendaLimpia}` : `Fotografía ${numero}`
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
  const pieIzq = lugar.trim() ? `${razonSocial} — Cantera de ${lugar.trim()}` : razonSocial
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(GRIS)
    doc.text(pieIzq, IZQ, PIE_Y)
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
  const subtituloEmpresa = (d.empresa?.subtitulo || 'OPERACIONES Y MANTENIMIENTO').toUpperCase()
  const lugar = d.lugar.trim()
  const fechaFormateada = fechaEjecutivaLarga(d.fechaIso)
  const fechaTexto = [lugar, fechaFormateada].filter(Boolean).join(', ')

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

  // Lugar y fecha a la derecha (solo si hay lugar o fecha)
  if (fechaTexto) {
    doc.setFont('helvetica', 'bold').setFontSize(8.8).setTextColor(TINTA)
    doc.text(lugar && fechaFormateada ? 'Lugar y Fecha:' : lugar ? 'Lugar:' : 'Fecha:', DER, y + 10, {
      align: 'right',
    })
    doc.setFont('helvetica', 'normal').setFontSize(8.8).setTextColor(TEXTO_CUERPO)
    doc.text(fechaTexto, DER, y + 15, { align: 'right' })
  }

  y += 26
  doc.setDrawColor(AZUL_OSCURO).setLineWidth(0.6)
  doc.line(IZQ, y, DER, y)

  // Kicker y Título principal
  y += 10
  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(NARANJA)
  doc.text((d.kicker || 'CONSTANCIA Y AUTORIZACIÓN OPERATIVA').toUpperCase(), IZQ, y)

  if (d.titulo.trim()) {
    y += 7
    doc.setFont('helvetica', 'bold').setFontSize(15.5).setTextColor(TINTA)
    doc.text(ajustar(doc, d.titulo.trim(), ANCHO), IZQ, y)
  }

  // Recuadro ASUNTO con barra lateral naranja (solo si hay asunto)
  const textoAsunto = d.asunto.trim()
  if (textoAsunto) {
    y += 7
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
  }

  // Párrafo formal de autorización (se adapta limpiamente a los campos que sí se hayan llenado)
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
    const segmentos: SegmentoTexto[] = [
      {
        texto:
          'Por medio de la presente, se solicita y deja constancia de la autorización',
      },
    ]

    if (d.autorizadoPor.trim() || d.autorizadoCargo.trim()) {
      const cargoTexto = d.autorizadoCargo.trim() ? ` ${d.autorizadoCargo.trim()} ` : ' '
      segmentos.push({ texto: ` otorgada por${cargoTexto}` })
      if (d.autorizadoPor.trim()) {
        segmentos.push({ texto: d.autorizadoPor.trim(), negrita: true })
      }
      if (d.autorizadoCedula.trim()) {
        segmentos.push({ texto: ', titular de la cédula de identidad ' })
        segmentos.push({ texto: d.autorizadoCedula.trim(), negrita: true })
      }
    }

    if (d.modo === 'ENTRADA') {
      if (d.instalacion.trim()) {
        segmentos.push({
          texto: `, para el ingreso a las instalaciones de la ${d.instalacion.trim()} (`,
        })
        segmentos.push({ texto: razonSocial, negrita: true })
        segmentos.push({ texto: ')' })
      } else {
        segmentos.push({ texto: ', para el ingreso a las instalaciones de ' })
        segmentos.push({ texto: razonSocial, negrita: true })
      }

      segmentos.push({
        texto: d.motivoResumen.trim()
          ? ` del siguiente material, equipo o componente, por concepto de ${d.motivoResumen.trim()}.`
          : ' del siguiente material, equipo o componente.',
      })
    } else {
      if (d.instalacion.trim()) {
        segmentos.push({
          texto: `, para la salida de las instalaciones de la ${d.instalacion.trim()} `,
        })
      } else {
        segmentos.push({ texto: ', para la salida de las instalaciones de ' })
      }

      segmentos.push({ texto: razonSocial, negrita: true })
      segmentos.push({
        texto: d.motivoResumen.trim()
          ? ` del siguiente material, equipo o componente, con fines exclusivos de ${d.motivoResumen.trim()}.`
          : ' del siguiente material, equipo o componente.',
      })
    }

    y = pintarParrafoMixto(doc, segmentos, IZQ, y, ANCHO, 10, 5.4)
  }

  // Sección 1: ESPECIFICACIONES (solo filas que tengan concepto y detalle con información)
  const especificacionesValidas = d.especificaciones.filter(
    (r) => r.concepto.trim() && r.detalle.trim(),
  )
  if (especificacionesValidas.length > 0) {
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
      especificacionesValidas.map((r) => ({
        celdas: [r.concepto.trim(), r.detalle.trim()],
        primeraEnNegrita: true,
      })),
    )
  }

  // Sección 2: RESPONSABLES DEL TRASLADO / TÉCNICO
  // Solo aparece si se llenó al menos el nombre o la cédula de un responsable.
  // Además, solo se incluyen las columnas que tengan información en al menos una fila.
  const responsablesValidos = d.responsables.filter(
    (r) => r.nombre.trim() || r.cedula.trim() || r.rol.trim(),
  )
  if (responsablesValidos.length > 0) {
    y += 9
    doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(TINTA)
    doc.text(
      d.modo === 'ENTRADA'
        ? 'RESPONSABLES DEL TRASLADO / ENTREGA'
        : 'RESPONSABLES DEL TRASLADO / TÉCNICO',
      IZQ,
      y,
    )
    y += 4

    const hayNombre = responsablesValidos.some((r) => Boolean(r.nombre.trim()))
    const hayCedula = responsablesValidos.some((r) => Boolean(r.cedula.trim()))
    const hayRol = responsablesValidos.some((r) => Boolean(r.rol.trim()))

    const colsDef: Array<{
      titulo: string
      peso: number
      leer: (r: ResponsableTrasladoSalida) => string
    }> = []
    if (hayNombre) colsDef.push({ titulo: 'Nombre y Apellido', peso: 62, leer: (r) => r.nombre.trim() })
    if (hayCedula) colsDef.push({ titulo: 'Cédula de Identidad', peso: 44, leer: (r) => r.cedula.trim() })
    if (hayRol) colsDef.push({ titulo: 'Rol', peso: 68, leer: (r) => r.rol.trim() })

    const pesoTotal = colsDef.reduce((acc, c) => acc + c.peso, 0) || 1
    let acumulado = 0
    const columnasResponsables = colsDef.map((c, idx) => {
      const ancho =
        idx === colsDef.length - 1
          ? ANCHO - acumulado
          : Math.round((c.peso / pesoTotal) * ANCHO)
      acumulado += ancho
      return { titulo: c.titulo, ancho }
    })

    y = pintarTablaEjecutiva(
      doc,
      y,
      columnasResponsables,
      responsablesValidos.map((r) => ({
        celdas: colsDef.map((c) => c.leer(r)),
        primeraEnNegrita: true,
      })),
    )
  }

  // Bloque de firma centrado al pie de la primera página (solo si hay datos de firma)
  const lineasPieFirma = [
    d.autorizadoPor.trim() ? { texto: d.autorizadoPor.trim(), tipo: 'nombre' as const } : null,
    d.firmaPieLinea1.trim() ? { texto: d.firmaPieLinea1.trim(), tipo: 'cedula' as const } : null,
    d.firmaPieLinea2.trim()
      ? { texto: d.firmaPieLinea2.trim().toUpperCase(), tipo: 'cargo' as const }
      : null,
  ].filter((x): x is { texto: string; tipo: 'nombre' | 'cedula' | 'cargo' } => Boolean(x))

  if (lineasPieFirma.length > 0) {
    const yFirma = Math.max(y + 24, 242)
    if (yFirma < PIE_Y - 14) {
      doc.setDrawColor(AZUL_OSCURO).setLineWidth(0.5)
      doc.line(CENTRO - 38, yFirma, CENTRO + 38, yFirma)

      let cursorFirmaY = yFirma + 5
      for (const l of lineasPieFirma) {
        if (l.tipo === 'nombre') {
          doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(TINTA)
        } else if (l.tipo === 'cedula') {
          doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(TEXTO_CUERPO)
        } else {
          doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(NARANJA)
        }
        doc.text(l.texto, CENTRO, cursorFirmaY, { align: 'center' })
        cursorFirmaY += 4.5
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PÁGINA 2+: ANEXO FOTOGRÁFICO (solo si se adjuntaron fotos)
  // ═══════════════════════════════════════════════════════════════════════════
  if (d.fotos.length > 0) {
    const TAMANO_GRUPO = d.fotos.length === 4 ? 4 : 3
    for (let offset = 0; offset < d.fotos.length; offset += TAMANO_GRUPO) {
      const lote = d.fotos.slice(offset, offset + TAMANO_GRUPO)
      doc.addPage()

      let yAnexo = 20
      doc.setFont('helvetica', 'bold').setFontSize(12.5).setTextColor(TINTA)
      doc.text('ANEXO FOTOGRÁFICO', IZQ, yAnexo)

      if (d.descripcionCorta.trim() || d.titulo.trim()) {
        doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(NARANJA)
        doc.text(
          ajustar(doc, d.descripcionCorta.trim() || d.titulo.trim(), 90),
          DER,
          yAnexo,
          { align: 'right' },
        )
      }

      yAnexo += 3.5
      doc.setDrawColor(AZUL_OSCURO).setLineWidth(0.6)
      doc.line(IZQ, yAnexo, DER, yAnexo)

      yAnexo += 7
      const textoSubAnexo = d.subtituloAnexo?.trim() || ''
      if (textoSubAnexo) {
        doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(TEXTO_CUERPO)
        const lineasSub = doc.splitTextToSize(textoSubAnexo, ANCHO) as string[]
        doc.text(lineasSub, IZQ, yAnexo, { lineHeightFactor: 1.4 })
        yAnexo += lineasSub.length * 4.8 + 5
      } else {
        yAnexo += 2
      }

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

  const esEntrada = d.modo === 'ENTRADA'
  pintarPieDePaginas(doc, 'Minería Internacional TS, C.A.', lugar)
  doc.setProperties({
    title: d.titulo.trim() || (esEntrada ? 'Autorización de Entrada' : 'Autorización de Salida'),
  })

  const slug = (d.descripcionCorta || (esEntrada ? 'entrada-autorizada' : 'salida-autorizada'))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)

  return {
    blob: doc.output('blob'),
    nombre: `${esEntrada ? 'autorizacion-entrada' : 'autorizacion-salida'}-${slug || 'material'}.pdf`,
  }
}

export async function armarFormatoEntradaAutorizada(
  d: Omit<DatosFormatoSalidaAutorizada, 'modo'>,
): Promise<ArchivoArmado> {
  return armarFormatoSalidaAutorizada({ ...d, modo: 'ENTRADA' })
}
