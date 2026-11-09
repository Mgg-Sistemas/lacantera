import { logoComoImagen } from '@/lib/ficha/logo'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import type { ImagenParaPapel } from '@/lib/api/fotosDeCarga'
import { ABAJO, ANCHO_UTIL, ARRIBA, DER, IZQ } from '@/lib/ficha/hoja'
import {
  GRIS,
  GRIS_SUAVE,
  HAIRLINE,
  ROTULO,
  TINTA,
  fechaLarga,
  membrete,
  pieDePagina,
  seccion,
  tabla,
  tituloDocumento,
  type Columna,
  type EmpresaPapel,
} from '@/lib/ficha/papel'

/*
  EL REPORTE DEL SURTIDOR, EN PAPEL (Golden Touch, `surtidorReportePdf.ts`).

  El mismo reporte que se mira en el teléfono: los movimientos de un rango
  agrupados por TIPO (surtidos, traslados, entradas, mermas, retornos), con
  los litros de cada grupo y, debajo de cada movimiento, sus FOTOS como
  miniaturas, cuatro por fila. Arriba, el resumen por tipo.

  Lo de La Cantera: el membrete, los márgenes y la tabla de la casa
  (`papel.ts`), y las fotos de `fotos_de_carga` ya reducidas por
  `imagenesParaPapel` —no las miniaturas de 160 px, que en papel se ven
  lavadas—. Los PDF adjuntos no son imágenes: se nombran.
*/

export interface MovimientoDelReporte {
  titulo: string
  detalle: string
  litros: string
  imagenes: ImagenParaPapel[]
  /** Adjuntos que no son imagen (PDF): se nombran. */
  otros: string[]
}

export interface GrupoDelReporte {
  titulo: string
  cantidad: number
  litros: string
  fotos: number
  movimientos: MovimientoDelReporte[]
}

export interface DatosReporteSurtidor {
  empresa: EmpresaPapel
  tanque: string
  desde: string
  hasta: string
  grupos: GrupoDelReporte[]
  total: { cantidad: number; litros: string; fotos: number }
  emitidoPor: string
  momento: Date
}

const dia = (f: string) => (f.length >= 10 ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : f)

const COLUMNAS_RESUMEN: Columna[] = [
  { titulo: 'Tipo de movimiento', ancho: 66 },
  { titulo: 'Movimientos', ancho: 28, alDerecha: true },
  { titulo: 'Litros', ancho: 30, alDerecha: true },
  { titulo: 'Fotos', ancho: 26, alDerecha: true },
]

type Doc = import('jspdf').jsPDF

/** Si lo que sigue no cabe, a la hoja siguiente. */
function conHueco(doc: Doc, y: number, alto: number): number {
  if (y + alto <= ABAJO - 12) return y
  doc.addPage()
  return ARRIBA
}

export async function armarReporteSurtidor(d: DatosReporteSurtidor): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['Tanque', d.tanque],
      ['Período', `${dia(d.desde)} al ${dia(d.hasta)}`],
      ['Generado', fechaLarga(d.momento)],
    ],
  })
  y = tituloDocumento(doc, y, 'Reporte del surtidor')

  y = seccion(doc, y, 'Resumen')
  y = tabla(doc, y, COLUMNAS_RESUMEN, [
    ...d.grupos.map((g) => [g.titulo, String(g.cantidad), `${g.litros} L`, String(g.fotos)]),
    ['TOTAL', String(d.total.cantidad), `${d.total.litros} L`, String(d.total.fotos)],
  ])

  if (d.grupos.length === 0) {
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(GRIS)
    doc.text('Sin movimientos en ese rango.', IZQ, y)
  }

  const GAP = 2
  const FOTO_W = (ANCHO_UTIL - GAP * 3) / 4
  const FOTO_H = 30

  for (const g of d.grupos) {
    y = conHueco(doc, y, 24)
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(ROTULO)
    doc.text(g.titulo.toUpperCase(), IZQ, y)
    doc.text(`${g.cantidad} · ${g.litros} L`, DER, y, { align: 'right' })
    doc.setDrawColor(ROTULO).setLineWidth(0.5)
    doc.line(IZQ, y + 1.5, DER, y + 1.5)
    y += 7

    for (const m of g.movimientos) {
      doc.setFont('helvetica', 'bold').setFontSize(9)
      const tit = doc.splitTextToSize(m.titulo, ANCHO_UTIL - 30) as string[]
      doc.setFont('helvetica', 'normal').setFontSize(7.5)
      const det = doc.splitTextToSize(m.detalle, ANCHO_UTIL) as string[]
      const altoTexto = tit.length * 4 + det.length * 3.4 + 2
      y = conHueco(doc, y, altoTexto + (m.imagenes.length ? FOTO_H + GAP : 4))

      doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(TINTA)
      doc.text(tit, IZQ, y)
      doc.text(`${m.litros} L`, DER, y, { align: 'right' })
      y += tit.length * 4
      doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
      doc.text(det, IZQ, y)
      y += det.length * 3.4 + 1

      if (m.imagenes.length) {
        m.imagenes.forEach((f, i) => {
          const col = i % 4
          if (col === 0 && i > 0) y += FOTO_H + GAP
          if (col === 0) y = conHueco(doc, y, FOTO_H)
          const x = IZQ + col * (FOTO_W + GAP)
          const escala = Math.min(FOTO_W / Math.max(f.ancho, 1), FOTO_H / Math.max(f.alto, 1))
          const w = f.ancho * escala
          const h = f.alto * escala
          doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
          doc.rect(x, y, FOTO_W, FOTO_H)
          try {
            doc.addImage(f.dataUrl, 'JPEG', x + (FOTO_W - w) / 2, y + (FOTO_H - h) / 2, w, h)
          } catch {
            /* una foto que jsPDF no sabe leer deja su caja vacía, no tumba el reporte */
          }
        })
        y += FOTO_H + GAP + 1
      } else if (m.otros.length === 0) {
        doc.setFontSize(7).setTextColor(GRIS_SUAVE)
        doc.text('Sin fotos', IZQ, y + 1)
        y += 3.5
      }
      if (m.otros.length) {
        doc.setFontSize(7).setTextColor(GRIS)
        const adj = doc.splitTextToSize(`Adjuntos: ${m.otros.join(', ')}`, ANCHO_UTIL) as string[]
        doc.text(adj, IZQ, y + 1)
        y += adj.length * 3.2 + 1
      }
      doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
      doc.line(IZQ, y + 0.5, DER, y + 0.5)
      y += 5
    }
    y += 3
  }

  pieDePagina(doc, `Reporte del surtidor · ${d.tanque} · emitido por ${d.emitidoPor || 'el sistema'}`)
  doc.setProperties({ title: 'Reporte del surtidor' })

  const nombre = `reporte-surtidor-${d.tanque}-${d.desde}-a-${d.hasta}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return { blob: doc.output('blob'), nombre: `${nombre}.pdf` }
}
