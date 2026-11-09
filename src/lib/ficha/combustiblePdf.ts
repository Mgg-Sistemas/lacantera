import { logoComoImagen } from '@/lib/ficha/logo'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import {
  encajar,
  FILA_ALTERNA,
  GRIS,
  MARCA,
  membrete,
  pieDePagina,
  ROTULO,
  TINTA,
  tituloDocumento,
  fechaLarga,
  type Bordes,
  type Celda,
  type EmpresaPapel,
} from '@/lib/ficha/papel'

/*
  LOS PAPELES DEL COMBUSTIBLE (Golden Touch: tanquePdf.ts, conciliacionPdf.ts,
  reporteExistenciasPdf.ts y exportarCombustible.ts; 10/11/2026).

  Golden Touch los arma con jspdf-autotable; aquí no hay esa librería, así que
  se arman con el membrete, el título y el pie de `papel.ts` y una tabla propia
  que, a diferencia de `tabla()`, sabe dibujarse en una hoja apaisada: el libro
  de un tanque tiene veinte columnas y en 150 mm no se lee.

  Los anchos de las columnas son PESOS, no milímetros: se reparten en el ancho
  útil de la hoja que toque. Así el mismo reporte sale en vertical o apaisado
  sin rehacer las cuentas.

  Los renglones anulados se imprimen tachados, como se ven en pantalla: el libro
  no se borra, y un papel que los escondiera no cuadraría con el saldo.
*/

type Doc = import('jspdf').jsPDF

export interface ColumnaPdf {
  titulo: string
  /** Peso relativo del ancho. */
  ancho: number
  alDerecha?: boolean
}

export interface SeccionPdf {
  titulo?: string
  columnas: ColumnaPdf[]
  filas: string[][]
  /** Índices de las filas que van tachadas (anuladas). */
  tachadas?: number[]
  /** El renglón de totales, ya escrito celda por celda. */
  totales?: string[]
}

export interface DatosPapelCombustible {
  titulo: string
  empresa: EmpresaPapel
  /** Lo de la derecha del membrete. */
  datos?: Array<[string, string]>
  /** Pares etiqueta · valor bajo el título. */
  resumen?: Array<[string, string]>
  secciones: SeccionPdf[]
  apaisado?: boolean
  emitidoPor: string
  momento: Date
  nombreArchivo: string
  /** Una nota al final («lo anulado no suma»). */
  nota?: string
}

const ALTO_FILA = 6.2
const ALTO_RENGLON = 3.2

function tablaEn(doc: Doc, y0: number, b: Bordes, abajo: number, arriba: number, s: SeccionPdf): number {
  const util = b.der - b.izq
  const peso = s.columnas.reduce((a, c) => a + c.ancho, 0) || 1
  const anchos = s.columnas.map((c) => (c.ancho / peso) * util)
  let fila = y0

  const medir = (textos: string[], base: number, estilo: 'bold' | 'normal'): Celda[] =>
    s.columnas.map((_, j) => encajar(doc, textos[j] ?? '', Math.max(4, anchos[j] - 3), base, estilo))
  const altoDe = (c: Celda[]) => ALTO_FILA + (Math.max(1, ...c.map((x) => x.lineas.length)) - 1) * ALTO_RENGLON

  const pintar = (celdas: Celda[], alto: number, estilo: 'bold' | 'normal') => {
    let x = b.izq + 1.5
    s.columnas.forEach((c, j) => {
      doc.setFont('helvetica', estilo).setFontSize(celdas[j].talla)
      doc.text(celdas[j].lineas, c.alDerecha ? x + anchos[j] - 3 : x, fila + 4.2, {
        align: c.alDerecha ? 'right' : 'left',
        lineHeightFactor: 1.3,
      })
      x += anchos[j]
    })
    fila += alto
  }

  const cabecera = () => {
    const celdas = medir(
      s.columnas.map((c) => c.titulo.toUpperCase()),
      7,
      'bold',
    )
    const alto = altoDe(celdas)
    doc.setFillColor(MARCA)
    doc.rect(b.izq, fila, util, alto, 'F')
    doc.setTextColor('#FFFFFF')
    pintar(celdas, alto, 'bold')
  }

  if (s.titulo) {
    if (fila > abajo - 20) {
      doc.addPage()
      fila = arriba
    }
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(ROTULO)
    doc.text(s.titulo.toUpperCase(), b.izq, fila + 2)
    fila += 5
  }

  cabecera()
  const tachadas = new Set(s.tachadas ?? [])

  s.filas.forEach((textos, i) => {
    const celdas = medir(textos, 7.5, 'normal')
    const alto = altoDe(celdas)
    if (fila + alto > abajo) {
      doc.addPage()
      fila = arriba
      cabecera()
    }
    if (i % 2 === 1) {
      doc.setFillColor(FILA_ALTERNA)
      doc.rect(b.izq, fila, util, alto, 'F')
    }
    const inicio = fila
    doc.setTextColor(tachadas.has(i) ? GRIS : TINTA)
    pintar(celdas, alto, 'normal')
    if (tachadas.has(i)) {
      doc.setDrawColor(GRIS).setLineWidth(0.25)
      doc.line(b.izq + 1, inicio + alto / 2, b.der - 1, inicio + alto / 2)
    }
  })

  if (s.totales) {
    const celdas = medir(s.totales, 7.5, 'bold')
    const alto = altoDe(celdas)
    if (fila + alto > abajo) {
      doc.addPage()
      fila = arriba
    }
    doc.setFillColor(FILA_ALTERNA)
    doc.rect(b.izq, fila, util, alto, 'F')
    doc.setTextColor(TINTA)
    pintar(celdas, alto, 'bold')
  }

  return fila + 7
}

/** Un papel de combustible: membrete, título, resumen y una o varias tablas. */
export async function armarPapelCombustible(d: DatosPapelCombustible): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: d.apaisado ? 'landscape' : 'portrait',
    compress: true,
  })
  const ancho = d.apaisado ? 297 : 210
  const alto = d.apaisado ? 210 : 297
  const margen = d.apaisado ? 15 : 30
  const bordes: Bordes = { izq: margen, der: ancho - margen, pie: alto - (d.apaisado ? 10 : 32) }
  const arriba = d.apaisado ? 15 : 30
  const abajo = bordes.pie - 10

  let y = membrete(doc, logo, { empresa: d.empresa, datos: d.datos, bordes, desde: arriba })
  y = tituloDocumento(doc, y, d.titulo, ROTULO, bordes)

  if (d.resumen?.length) {
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(TINTA)
    const texto = d.resumen.map(([k, v]) => `${k}: ${v}`).join('   ·   ')
    const lineas = doc.splitTextToSize(texto, bordes.der - bordes.izq) as string[]
    doc.text(lineas, bordes.izq, y, { lineHeightFactor: 1.4 })
    y += lineas.length * 4.2 + 3
  }

  for (const s of d.secciones) y = tablaEn(doc, y, bordes, abajo, arriba, s)

  if (d.nota) {
    if (y > abajo - 8) {
      doc.addPage()
      y = arriba
    }
    doc.setFont('helvetica', 'italic').setFontSize(7).setTextColor(GRIS)
    doc.text(doc.splitTextToSize(d.nota, bordes.der - bordes.izq) as string[], bordes.izq, y)
  }

  pieDePagina(
    doc,
    `Documento generado por el sistema · ${d.titulo} · ${d.emitidoPor} · ${fechaLarga(d.momento)}`,
    bordes,
  )
  doc.setProperties({ title: d.titulo })
  return { blob: doc.output('blob'), nombre: d.nombreArchivo }
}

/** Un nombre de archivo sin acentos ni espacios. */
export const paraArchivo = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
