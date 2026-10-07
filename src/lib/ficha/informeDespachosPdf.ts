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
import type { DetalleDespachos } from '@/lib/api/ventas'

/*
  EL INFORME DE DESPACHOS Y VENTAS

  Se pidió un informe de despachos, traslados y notas de entrega, visible
  desde el Panel, que se mantenga al día solo. Los cinco totales ya salían
  del mismo cálculo que usa el Panel (`v_panel_resumen`); este papel los
  imprime junto con el desglose —por artículo, por destino, por cliente—
  que se pide aparte, solo al generar el informe.

  NINGUNA CATEGORÍA DE CLIENTE INVENTADA. No hay «Público/Institucional» ni
  «Ferretero/Retail»: esa clasificación no existe en el sistema, y no se
  inventa aquí. Lo que se imprime son nombres, cantidades y montos reales.
*/

export interface ResumenDespachos {
  movimientos: number
  traslados: number
  notasVigentes: number
  totalUsd: string | number
  totalBs: string | number
}

export interface DatosInformeDespachos {
  resumen: ResumenDespachos
  detalle: DetalleDespachos
  empresa: EmpresaPapel
  emitidoPor: string
  momento: Date
}

const decimal2 = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const dinero = (v: string | number): string => decimal2.format(Number(v ?? 0))

/** Entera si es entera. 752 metros cúbicos no se leen «752,00». */
const cantidad = (v: string | number): string => {
  const n = Number(v ?? 0)
  return Number.isInteger(n) ? n.toLocaleString('es-VE') : decimal2.format(n)
}

const COLUMNAS_ARTICULO: Columna[] = [
  { titulo: 'Artículo', ancho: 70 },
  { titulo: 'Unidad', ancho: 30 },
  { titulo: 'Cantidad', ancho: 50, alDerecha: true },
]

const COLUMNAS_DESTINO: Columna[] = [
  { titulo: 'Destino', ancho: 100 },
  { titulo: 'Movimientos', ancho: 50, alDerecha: true },
]

const COLUMNAS_CLIENTE: Columna[] = [
  { titulo: 'Cliente', ancho: 100 },
  { titulo: 'Monto ($)', ancho: 50, alDerecha: true },
]

export async function armarInformeDespachos(d: DatosInformeDespachos): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [['Generado', fechaLarga(d.momento)]],
  })

  y = tituloDocumento(doc, y, 'Informe de despachos y ventas')

  y = lineaEmpresa(
    doc,
    y,
    `${d.empresa.razonSocial} · RIF ${d.empresa.rif} · Sistema administrativo`,
  )

  y = seccion(doc, y, 'Resumen')
  y = etiquetaValor(doc, y, [
    ['Movimientos de salida', cantidad(d.resumen.movimientos)],
    ['Traslados', cantidad(d.resumen.traslados)],
    ['Notas vigentes', cantidad(d.resumen.notasVigentes)],
    ['Total facturado', `$ ${dinero(d.resumen.totalUsd)}`],
    ['Total en bolívares', `Bs ${dinero(d.resumen.totalBs)}`],
    ['Emitido por', d.emitidoPor],
  ])

  if (d.detalle.por_articulo.length > 0) {
    y = seccion(doc, y, 'Volumen por producto')
    y = tabla(
      doc,
      y,
      COLUMNAS_ARTICULO,
      d.detalle.por_articulo.map((r) => [r.articulo, r.unidad, cantidad(r.cantidad)]),
    )
  }

  if (d.detalle.por_destino.length > 0) {
    y = seccion(doc, y, 'Principales destinos')
    y = tabla(
      doc,
      y,
      COLUMNAS_DESTINO,
      d.detalle.por_destino.map((r) => [r.destino, cantidad(r.movimientos)]),
    )
  }

  if (d.detalle.por_cliente.length > 0) {
    y = seccion(doc, y, 'Principales clientes')
    y = tabla(
      doc,
      y,
      COLUMNAS_CLIENTE,
      d.detalle.por_cliente.map((r) => [r.cliente, dinero(r.monto_usd)]),
    )
  }

  pieDePagina(doc, `Documento generado por el sistema · ${fechaLarga(d.momento)}`)

  doc.setProperties({ title: 'Informe de despachos y ventas' })

  return { blob: doc.output('blob'), nombre: 'informe-de-despachos-y-ventas.pdf' }
}
