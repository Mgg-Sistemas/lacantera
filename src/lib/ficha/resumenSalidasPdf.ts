import { ARRIBA, ABAJO } from '@/lib/ficha/hoja'
import { logoComoImagen } from '@/lib/ficha/logo'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import {
  membrete,
  tituloDocumento,
  lineaEmpresa,
  seccion,
  etiquetaValor,
  tabla,
  pieDePagina,
  fechaLarga,
  type Columna,
  type EmpresaPapel,
} from '@/lib/ficha/papel'

/*
  EL «📊 RESUMEN» DE SALIDAS EN PAPEL (MGG `resumenSalidasReporte`), 08/11/2026.

  MGG imprime «RESUMEN DE SALIDAS POR UNIDAD SOLICITANTE»: una tabla con el
  gasto por unidad y, debajo, el detalle de cada salida. Aquí va lo mismo por
  destino o por área, armado con el mismo papel de La Cantera que el historial
  de salidas (`historialSalidasPdf`), y con las filas que la pantalla ya
  calculó: el papel no vuelve a consultar la base.
*/

export interface GrupoEnPapel {
  nombre: string
  salidas: number
  renglones: number
  /** Ya dicho: «$ 1.234,00», o «sin valorar». */
  valor: string
}

export interface RenglonEnPapel {
  fecha: string
  nota: string
  grupo: string
  articulo: string
  cantidad: string
  valor: string
}

export interface DatosResumenSalidas {
  /** «destino» o «área o cargo»: lo que encabeza la primera columna. */
  porQue: string
  alcance: Array<[string, string | null | undefined]>
  grupos: GrupoEnPapel[]
  renglones: RenglonEnPapel[]
  total: string
  empresa: EmpresaPapel
  emitidoPor: string
  momento: Date
}

const COLUMNAS_GRUPOS = (porQue: string): Columna[] => [
  { titulo: porQue.charAt(0).toUpperCase() + porQue.slice(1), ancho: 70 },
  { titulo: 'Salidas', ancho: 22, alDerecha: true },
  { titulo: 'Renglones', ancho: 25, alDerecha: true },
  { titulo: 'Valor (USD)', ancho: 33, alDerecha: true },
]

const COLUMNAS_DETALLE: Columna[] = [
  { titulo: 'Fecha / nota', ancho: 34 },
  { titulo: 'Destino', ancho: 34 },
  { titulo: 'Artículo', ancho: 40 },
  { titulo: 'Cantidad', ancho: 20, alDerecha: true },
  { titulo: 'Valor (USD)', ancho: 22, alDerecha: true },
]

export async function armarResumenSalidas(d: DatosResumenSalidas): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [['Generado', fechaLarga(d.momento)]],
  })

  const titulo = `Resumen de salidas por ${d.porQue}`
  y = tituloDocumento(doc, y, titulo)
  y = lineaEmpresa(doc, y, `${d.empresa.razonSocial} · RIF ${d.empresa.rif} · Sistema administrativo`)

  y = seccion(doc, y, 'Alcance')
  y = etiquetaValor(doc, y, [
    ...d.alcance,
    ['Gasto total', d.total],
    ['Emitido por', d.emitidoPor],
  ])

  y = seccion(doc, y, `Gasto por ${d.porQue}`)
  y = tabla(
    doc,
    y,
    COLUMNAS_GRUPOS(d.porQue),
    d.grupos.map((g) => [g.nombre, String(g.salidas), String(g.renglones), g.valor]),
    `TOTAL   ${d.total}`,
  )

  // Que el rótulo no quede solo al pie de una hoja y su tabla en la siguiente.
  if (y > ABAJO - 50) {
    doc.addPage()
    y = ARRIBA
  }
  y = seccion(doc, y, 'Detalle de salidas')
  tabla(
    doc,
    y,
    COLUMNAS_DETALLE,
    d.renglones.map((r) => [`${r.fecha}\n${r.nota}`, r.grupo, r.articulo, r.cantidad, r.valor]),
  )

  pieDePagina(doc, `Documento generado por el sistema · ${fechaLarga(d.momento)}`)
  doc.setProperties({ title: titulo })

  return { blob: doc.output('blob'), nombre: 'resumen-de-salidas.pdf' }
}
