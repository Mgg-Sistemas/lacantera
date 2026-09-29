import { logoComoImagen } from '@/lib/ficha/logo'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import {
  membrete,
  tituloDocumento,
  seccion,
  etiquetaValor,
  tabla,
  pieDePagina,
  fechaLarga,
  fechaCorta,
  notaBajoLaTabla,
  type Columna,
} from '@/lib/ficha/papel'
import { dinero, bolivares, dolares } from '@/lib/formato'
import type { NotaEntrega } from '@/lib/api/ventas'

/*
  EL REPORTE DE NOTAS DE ENTREGA, EN BOLÍVARES Y EN DÓLARES

  Cada nota ya guarda su propia tasa BCV, congelada el día en que se emitió
  —`tasa`/`tasa_usd`, ver `notas_entrega` en la migración de ventas—, y de ahí
  salen `total_bs`/`total_usd` como columnas generadas por Postgres. Este
  reporte no recalcula nada: solo imprime lo que la base ya resolvió, para que
  la cifra del papel sea siempre la misma que la de la fila que la originó.

  SOLO SUMA LO NO ANULADO, igual que Control de despacho: una nota anulada
  sigue en la lista —para que la serie no tenga huecos sin explicar— pero no
  entra en el total, porque el material que representaba ya volvió al patio.
*/

const COLUMNAS: Columna[] = [
  { titulo: '# Nota', ancho: 16 },
  { titulo: 'Cliente', ancho: 30 },
  { titulo: 'Vehículo', ancho: 16 },
  { titulo: 'Fecha', ancho: 14 },
  { titulo: 'Total', ancho: 18, alDerecha: true },
  { titulo: 'Total Bs', ancho: 20, alDerecha: true },
  { titulo: 'Total $', ancho: 18, alDerecha: true },
  { titulo: 'Estado', ancho: 18 },
]

const ETIQUETA: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  DESPACHADA: 'Despachada',
  FACTURADA: 'Facturada',
  ANULADA: 'Anulada',
}

export async function armarReporteNotasDeEntrega(d: {
  empresa: { razonSocial: string; rif: string }
  emitidoPor: string
  momento: Date
  /** «Las 12 notas marcadas», «Las 200 más recientes»… */
  alcance: string
  notas: NotaEntrega[]
}): Promise<ArchivoArmado> {
  const titulo = 'Notas de entrega'
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [['Emitido', fechaLarga(d.momento)]],
  })
  y = tituloDocumento(doc, y, titulo)

  const vigentes = d.notas.filter((nota) => nota.estado !== 'ANULADA')
  const totalBs = vigentes.reduce((s, nota) => s + Number(nota.total_bs), 0)
  const totalUsd = vigentes.reduce((s, nota) => s + Number(nota.total_usd), 0)
  const anuladas = d.notas.length - vigentes.length

  y = seccion(doc, y, 'Alcance')
  y = etiquetaValor(doc, y, [
    ['Notas', d.alcance],
    ['Vigentes', String(vigentes.length)],
    ['Anuladas', String(anuladas)],
    ['Total Bs', bolivares(totalBs)],
    ['Total $', dolares(totalUsd)],
    ['Emitido por', d.emitidoPor],
  ])

  y = seccion(doc, y, 'Planilla')
  y = tabla(
    doc,
    y,
    COLUMNAS,
    d.notas.length === 0
      ? [['', '', '', '', '', 'Sin notas en el período', '', '']]
      : d.notas.map((nota) => [
          nota.numero,
          nota.cliente ?? 'Cliente por concretar',
          nota.vehiculo ?? '—',
          fechaCorta(nota.fecha),
          dinero(nota.moneda, nota.total),
          bolivares(nota.total_bs),
          dolares(nota.total_usd),
          ETIQUETA[nota.estado] ?? nota.estado,
        ]),
    `Total Bs ${bolivares(totalBs)} · Total $ ${dolares(totalUsd)}`,
  )
  notaBajoLaTabla(
    doc,
    y,
    'Cada monto sale de la tasa BCV vigente el día en que se emitió su nota, ya congelada — no la de hoy. Solo se suman las notas vigentes: una anulada se enseña en su renglón pero no entra en el total.',
  )

  pieDePagina(doc, `Documento generado por el sistema · ${titulo} · ${fechaLarga(d.momento)}`)
  doc.setProperties({ title: titulo })
  return { blob: doc.output('blob'), nombre: `notas-de-entrega-${d.momento.toISOString().slice(0, 10)}.pdf` }
}
