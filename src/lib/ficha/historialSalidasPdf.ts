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
  EL REPORTE DEL HISTORIAL DE SALIDAS Y TRASLADOS

  Se pidió poder sacar en papel lo mismo que la pantalla ya filtra — un
  artículo, un rango de fechas, «solo salidas»— y que sume lo que salió.
  «Que el informe se genere de acuerdo a lo que esté buscando en el módulo»:
  por eso este documento no vuelve a consultar la base con sus propios
  filtros, recibe las filas que la pantalla ya cargó y filtró, igual que el
  acta de existencias.

  La suma solo aparece cuando el filtro deja un solo artículo: sumar
  cantidades de artículos distintos es sumar litros con pares de botas, y la
  pantalla tiene la misma regla.
*/

export interface RenglonDeReporte {
  numero: string
  fecha: string
  movimiento: string
  articulo: string
  almacen: string
  paraQuien: string
  registradoPor: string
  /** Ya con su signo y su unidad: «−16 M3», «+320 UND». */
  cantidad: string
}

export interface DatosReporteSalidas {
  /** Lo que se buscó, ya dicho en palabras: «Vista: Solo salidas», «Artículo: …». */
  alcance: Array<[string, string | null | undefined]>
  renglones: RenglonDeReporte[]
  /** Solo con un artículo elegido: «752,00 M3 salieron». Null, no se imprime total. */
  totalTexto?: string | null
  empresa: EmpresaPapel
  emitidoPor: string
  momento: Date
}

/* Las siete columnas suman los 150 mm útiles. «Movimiento» lleva el tipo y el
   número juntos —«Salida a consumo · MOV-2026-0630»— en vez de una columna
   para cada uno: el número solo no dice nada y el tipo solo no se puede
   buscar en el papel. */
const COLUMNAS: Columna[] = [
  { titulo: 'Fecha', ancho: 18 },
  { titulo: 'Movimiento', ancho: 28 },
  { titulo: 'Artículo', ancho: 26 },
  { titulo: 'Almacén', ancho: 18 },
  { titulo: 'Destino', ancho: 22 },
  { titulo: 'Registrado por', ancho: 18 },
  { titulo: 'Cantidad', ancho: 20, alDerecha: true },
]

export async function armarReporteSalidas(d: DatosReporteSalidas): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [['Generado', fechaLarga(d.momento)]],
  })

  y = tituloDocumento(doc, y, 'Historial de salidas y traslados')

  y = lineaEmpresa(
    doc,
    y,
    `${d.empresa.razonSocial} · RIF ${d.empresa.rif} · Sistema administrativo`,
  )

  y = seccion(doc, y, 'Alcance')
  y = etiquetaValor(doc, y, [
    ...d.alcance,
    ['Movimientos listados', String(d.renglones.length)],
    ...(d.totalTexto ? ([['Total', d.totalTexto]] as [string, string][]) : []),
    ['Emitido por', d.emitidoPor],
  ])

  y = seccion(doc, y, 'Movimientos')
  y = tabla(
    doc,
    y,
    COLUMNAS,
    d.renglones.map((r) => [
      r.fecha,
      `${r.movimiento} · ${r.numero}`,
      r.articulo,
      r.almacen,
      r.paraQuien,
      r.registradoPor,
      r.cantidad,
    ]),
    d.totalTexto ? `TOTAL   ${d.totalTexto}` : '',
  )

  pieDePagina(doc, `Documento generado por el sistema · ${fechaLarga(d.momento)}`)

  doc.setProperties({ title: 'Historial de salidas y traslados' })

  return { blob: doc.output('blob'), nombre: 'historial-salidas-y-traslados.pdf' }
}
