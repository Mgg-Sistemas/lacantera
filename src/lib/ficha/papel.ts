import { IZQ, DER, ARRIBA, ABAJO, ANCHO_UTIL, PIE, ajustar } from '@/lib/ficha/hoja'

/*
  LA FORMA DE PAPEL QUE PIDIÓ LA LÍDER DE SISTEMAS

  Nos pasó dos documentos de MGG —una orden de compra y un comprobante de
  pago— como el formato al que hay que ajustarse. Se distingue del que
  teníamos en cuatro cosas, y las cuatro tienen su motivo:

    - EL TÍTULO VA EN NEGRO Y GRANDE, sobre fondo blanco, con el logo a su
      izquierda y una regla de color debajo. La banda de color llena que
      usábamos se come tinta en una impresora de oficina y, fotocopiada, deja
      el título en blanco sobre gris.

    - BLOQUES DE ETIQUETA Y VALOR en vez de párrafos. Un papel de compras se
      lee buscando un dato concreto —quién lo aprobó, cuándo se prometió la
      entrega—, y en columna se encuentra sin leer el resto.

    - LA TABLA LLEVA CABECERA DE COLOR y filas alternas. Con quince renglones
      de repuestos, la fila alterna es lo que evita leer el precio de la línea
      de arriba.

    - EL PIE DICE QUE LO GENERÓ EL SISTEMA y de qué documento salió. Es lo que
      permite volver al origen cuando el papel aparece meses después en una
      carpeta.

  EL COLOR ES EL NUESTRO, NO EL DE ELLOS

  La estructura es la que mandó; el naranja es el de La Cantera y no el de
  MGG. Copiar también el color haría que los papeles de dos empresas distintas
  se confundan sobre una mesa, que es justo lo que un membrete existe para
  evitar. Si la quiere idéntica, es cambiar esta constante.
*/

type Doc = import('jspdf').jsPDF

export const MARCA = '#cc3f00'
export const TINTA = '#1c1917'
export const GRIS = '#78716c'
export const GRIS_SUAVE = '#a8a29e'
export const FILA_ALTERNA = '#f5f5f4'
export const HAIRLINE = '#e7e5e4'

/** Lo que un renglón de tabla necesita saber de su columna. */
export interface Columna {
  titulo: string
  /** Ancho en milímetros. La suma tiene que dar `ANCHO_UTIL` (150). */
  ancho: number
  alDerecha?: boolean
}

// ---------------------------------------------------------------------------

/**
 * El membrete: logo, título, y la línea de identificación debajo.
 *
 * Devuelve la altura a la que sigue el documento, para que quien lo llama no
 * tenga que saber cuánto mide esto.
 */
export function membrete(
  doc: Doc,
  logo: string,
  d: { titulo: string; subtitulo?: string | null; derecha?: string | null },
): number {
  doc.addImage(logo, 'PNG', IZQ, ARRIBA - 6, 20, 20)

  doc.setTextColor(TINTA).setFont('helvetica', 'bold').setFontSize(20)
  doc.text(d.titulo, IZQ + 25, ARRIBA + 3)

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(GRIS)
  if (d.subtitulo) doc.text(ajustar(doc, d.subtitulo, 95), IZQ + 25, ARRIBA + 9.5)
  if (d.derecha) doc.text(d.derecha, DER, ARRIBA + 9.5, { align: 'right' })

  // La regla de color, que es lo único teñido de la cabecera.
  doc.setDrawColor(MARCA).setLineWidth(0.8)
  doc.line(IZQ, ARRIBA + 16, DER, ARRIBA + 16)

  return ARRIBA + 24
}

/** Una línea con quién emite el papel. Para los documentos cortos. */
export function lineaEmpresa(doc: Doc, y: number, texto: string): number {
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(TINTA)
  doc.text(ajustar(doc, texto, ANCHO_UTIL), IZQ, y)
  return y + 8
}

/**
 * Las dos partes, una enfrente de la otra.
 *
 * A la izquierda quien emite; a la derecha el de fuera, con su rótulo encima.
 * Esa asimetría —solo el de la derecha lleva rótulo— es del modelo, y tiene
 * sentido: quien lee el papel ya sabe de quién le llega, lo que necesita
 * confirmar es que va dirigido a él.
 */
export function dosPartes(
  doc: Doc,
  y: number,
  izquierda: string[],
  derecha: { rotulo: string; lineas: string[] },
): number {
  const medio = IZQ + ANCHO_UTIL / 2

  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(TINTA)
  doc.text(derecha.rotulo, medio, y)

  doc.setFont('helvetica', 'normal').setFontSize(9)
  doc.text(izquierda.slice(0, 4), IZQ, y + 5.5, { lineHeightFactor: 1.5 })
  doc.text(derecha.lineas.slice(0, 4), medio, y + 5.5, { lineHeightFactor: 1.5 })

  const renglones = Math.max(izquierda.length, derecha.lineas.length, 1)
  return y + 5.5 + renglones * 4.8 + 6
}

/** El rótulo de una sección: ÍTEMS, CONDICIONES. */
export function seccion(doc: Doc, y: number, titulo: string): number {
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(TINTA)
  doc.text(titulo.toUpperCase(), IZQ, y)
  return y + 6
}

/**
 * Filas de etiqueta y valor.
 *
 * El valor puede ocupar varias líneas —una nota larga, una dirección— y la
 * fila crece con él en vez de recortarlo: lo que se recorta en un papel de
 * compras suele ser justo el motivo por el que se pidió.
 */
export function etiquetaValor(
  doc: Doc,
  y: number,
  filas: Array<[string, string | null | undefined]>,
): number {
  const ANCHO_ETIQUETA = 55
  const ANCHO_VALOR = ANCHO_UTIL - ANCHO_ETIQUETA
  let fila = y

  for (const [etiqueta, valor] of filas) {
    const lineas = doc.splitTextToSize(valor || '—', ANCHO_VALOR) as string[]

    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(TINTA)
    doc.text(etiqueta, IZQ, fila)

    doc.setFont('helvetica', 'normal').setTextColor(GRIS)
    doc.text(lineas, IZQ + ANCHO_ETIQUETA, fila, { lineHeightFactor: 1.4 })

    fila += Math.max(lineas.length, 1) * 4.3 + 0.6
  }

  return fila + 3
}

/**
 * La tabla, con su cabecera de color y sus filas alternas.
 *
 * Parte de página sola cuando se acaba el papel, y repite la cabecera arriba:
 * una segunda hoja de cifras sin rótulos no se puede leer, y con veinte
 * artículos en un almacén eso pasa siempre.
 */
export function tabla(
  doc: Doc,
  y: number,
  columnas: Columna[],
  filas: string[][],
  pie?: string,
): number {
  const ALTO_FILA = 6.5
  let fila = y

  const cabecera = () => {
    doc.setFillColor(MARCA)
    doc.rect(IZQ, fila, ANCHO_UTIL, ALTO_FILA, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor('#FFFFFF')

    let x = IZQ + 2
    for (const c of columnas) {
      doc.text(c.titulo, c.alDerecha ? x + c.ancho - 4 : x, fila + 4.4, {
        align: c.alDerecha ? 'right' : 'left',
      })
      x += c.ancho
    }
    fila += ALTO_FILA
  }

  cabecera()

  filas.forEach((celdas, i) => {
    if (fila + ALTO_FILA > ABAJO - 30) {
      doc.addPage()
      fila = ARRIBA
      cabecera()
    }

    if (i % 2 === 1) {
      doc.setFillColor(FILA_ALTERNA)
      doc.rect(IZQ, fila, ANCHO_UTIL, ALTO_FILA, 'F')
    }

    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(TINTA)
    let x = IZQ + 2
    columnas.forEach((c, j) => {
      const texto = ajustar(doc, celdas[j] ?? '', c.ancho - 4)
      doc.text(texto, c.alDerecha ? x + c.ancho - 4 : x, fila + 4.4, {
        align: c.alDerecha ? 'right' : 'left',
      })
      x += c.ancho
    })
    fila += ALTO_FILA
  })

  if (pie) {
    doc.setFillColor(FILA_ALTERNA)
    doc.rect(IZQ, fila, ANCHO_UTIL, ALTO_FILA + 1, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(TINTA)
    doc.text(pie, DER - 4, fila + 5, { align: 'right' })
    fila += ALTO_FILA + 1
  }

  return fila + 8
}

/**
 * Un bloque con cabecera teñida y filas alternas de etiqueta y valor.
 *
 * Es la forma del comprobante de pago del modelo: en vez de una tabla de
 * renglones, dos bloques —la orden y el pago— con sus datos en columna. Se
 * lee buscando un dato, no recorriendo filas, y para eso la banda de color
 * separa mejor que un título suelto.
 */
export function bloqueEtiquetado(
  doc: Doc,
  y: number,
  titulo: string,
  filas: Array<[string, string | null | undefined]>,
): number {
  const ALTO = 7
  const ANCHO_ETIQUETA = 55
  let fila = y

  doc.setFillColor(MARCA)
  doc.rect(IZQ, fila, ANCHO_UTIL, ALTO, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor('#FFFFFF')
  doc.text(titulo, IZQ + 3, fila + 4.8)
  fila += ALTO

  filas.forEach(([etiqueta, valor], i) => {
    if (i % 2 === 0) {
      doc.setFillColor(FILA_ALTERNA)
      doc.rect(IZQ, fila, ANCHO_UTIL, ALTO, 'F')
    }

    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(TINTA)
    doc.text(etiqueta, IZQ + 3, fila + 4.8)

    doc.setFont('helvetica', 'normal').setTextColor(GRIS)
    doc.text(
      ajustar(doc, valor || '—', ANCHO_UTIL - ANCHO_ETIQUETA - 6),
      IZQ + ANCHO_ETIQUETA,
      fila + 4.8,
    )
    fila += ALTO
  })

  return fila + 8
}

/** Un lado de la firma: qué se espera ahí y, si la hay, la firma de quien va. */
export interface LadoFirmado {
  /** Lo que va debajo de la raya: «Firma autorizada», «Recibido por…». */
  texto: string
  /** El PNG guardado de esa persona. Sin él la raya se queda en blanco. */
  imagen?: string | null
  /** Quién es. Va debajo del rol, en pequeño, para que el papel diga el nombre. */
  nombre?: string | null
}

/**
 * Las dos rayas de firma, con lo que se espera debajo de cada una.
 *
 * Si quien firma tiene firma guardada, se estampa SOBRE la raya y no encima
 * del hueco: una firma que flota separada de la línea se lee como pegada
 * después. Y va con fondo transparente, por eso no tapa la raya.
 *
 * Sin firma guardada, el papel sale como salía: con la raya en blanco para
 * firmarlo a mano. Es el caso normal el primer mes y no puede verse como que
 * algo falló.
 */
export function firmas(
  doc: Doc,
  y: number,
  izquierda: string | LadoFirmado,
  derecha: string | LadoFirmado,
): void {
  const SEPARA = 20
  const ancho = (ANCHO_UTIL - SEPARA) / 2

  const lados: LadoFirmado[] = [izquierda, derecha].map((l) =>
    typeof l === 'string' ? { texto: l } : l,
  )

  for (const [i, lado] of lados.entries()) {
    const x = IZQ + i * (ancho + SEPARA)

    if (lado.imagen) {
      /*
        La firma se mete en un alto fijo y se centra sobre la raya. El ancho
        sale de la proporción de la imagen —ya viene recortada al trazo— y se
        limita al del hueco: una rúbrica muy alargada invadiría la de al lado.
      */
      const ALTO = 13
      try {
        const props = doc.getImageProperties(lado.imagen)
        const anchoFirma = Math.min(ancho - 4, (props.width / props.height) * ALTO)
        doc.addImage(
          lado.imagen,
          'PNG',
          x + (ancho - anchoFirma) / 2,
          y - ALTO - 0.5,
          anchoFirma,
          ALTO,
        )
      } catch {
        // Una imagen que jsPDF no sabe leer no puede tumbar el documento
        // entero: el papel sale con la raya en blanco, que es firmable.
      }
    }

    doc.setDrawColor(TINTA).setLineWidth(0.4)
    doc.line(x, y, x + ancho, y)

    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(GRIS)
    doc.text(lado.texto, x, y + 4.5)

    if (lado.nombre) {
      doc.setFontSize(7.5).setTextColor(GRIS_SUAVE)
      doc.text(ajustar(doc, lado.nombre, ancho), x, y + 8.6)
    }
  }
}

/**
 * El pie, en todas las páginas.
 *
 * Se escribe al final y recorriendo las páginas ya hechas, porque hasta que el
 * documento no está armado no se sabe cuántas son. Dice de dónde salió el
 * papel: meses después, en una carpeta, es lo único que lo ata al sistema.
 */
export function pieDePagina(doc: Doc, texto: string): void {
  const paginas = doc.getNumberOfPages()

  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p)
    doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
    doc.line(IZQ, PIE - 5, DER, PIE - 5)

    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS_SUAVE)
    doc.text(texto, IZQ, PIE)
    if (paginas > 1) {
      doc.text(`Página ${p} de ${paginas}`, DER, PIE, { align: 'right' })
    }
  }
}

/** Fecha y hora como las escribe el modelo: «20 ago. 2026, 02:50 p. m.» */
export function fechaLarga(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d)
}

export function fechaCorta(iso: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${iso.slice(0, 10)}T12:00:00`))
}
