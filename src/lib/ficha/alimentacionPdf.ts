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
  fechaCorta,
  type Columna,
} from '@/lib/ficha/papel'

/*
  EL INFORME DE ALIMENTACIÓN, EN PAPEL.

  Christopher, 19/10/2026: un botón de informe PDF para el módulo, con rango
  de fechas. Es el mismo rango que ya se elige en la pantalla —no se pregunta
  dos veces— y responde lo que de verdad se pregunta de un período: cuántas
  comidas, cuánto costó cada plato, y EN QUÉ SE FUE LA PLATA — la tabla de
  víveres no es un adorno, es la razón por la que alguien pide este papel.

  Las comidas anuladas se cuentan aparte, en el alcance, y no entran en los
  totales ni en la tabla de víveres: lo que se anuló no se gastó.
*/

export interface ComidaDelInforme {
  numero: string
  fecha: string
  tipo: string
  platos: number
  valorUsd: string | number
  costoPorPlatoUsd: string | number | null
  estado: 'SERVIDA' | 'ANULADA'
}

export interface ViverDelInforme {
  articulo: string
  unidad: string
  cantidad: string | number
  valorUsd: string | number
}

export interface DatosInformeAlimentacion {
  desde: string
  hasta: string
  comidas: ComidaDelInforme[]
  viveres: ViverDelInforme[]
  empresa: { razonSocial: string; rif: string }
  emitidoPor: string
  momento: Date
}

const decimal2 = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cantidadEs = (v: string | number): string => {
  const n = Number(v ?? 0)
  return Number.isInteger(n) ? n.toLocaleString('es-VE') : decimal2.format(n)
}
const dineroEs = (v: string | number): string => `$ ${decimal2.format(Number(v ?? 0))}`

const COLUMNAS_COMIDAS: Columna[] = [
  { titulo: 'Número', ancho: 22 },
  { titulo: 'Fecha', ancho: 20 },
  { titulo: 'Tipo', ancho: 22 },
  { titulo: 'Platos', ancho: 16, alDerecha: true },
  { titulo: 'Costo', ancho: 25, alDerecha: true },
  { titulo: 'Costo/plato', ancho: 25, alDerecha: true },
  { titulo: 'Estado', ancho: 20 },
]

const COLUMNAS_VIVERES: Columna[] = [
  { titulo: 'Víver', ancho: 60 },
  { titulo: 'Unidad', ancho: 20 },
  { titulo: 'Cantidad', ancho: 35, alDerecha: true },
  { titulo: 'Valor', ancho: 35, alDerecha: true },
]

export async function armarInformeAlimentacion(d: DatosInformeAlimentacion): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  const servidas = d.comidas.filter((c) => c.estado === 'SERVIDA')
  const anuladas = d.comidas.length - servidas.length
  const totalPlatos = servidas.reduce((s, c) => s + c.platos, 0)
  const totalValor = servidas.reduce((s, c) => s + Number(c.valorUsd), 0)

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['Período', `${fechaCorta(d.desde)} al ${fechaCorta(d.hasta)}`],
      ['Emitido', fechaLarga(d.momento)],
    ],
  })

  y = tituloDocumento(doc, y, 'Informe de alimentación')

  y = lineaEmpresa(doc, y, `${d.empresa.razonSocial} · RIF ${d.empresa.rif} · Sistema administrativo`)

  y = seccion(doc, y, 'Alcance')
  y = etiquetaValor(doc, y, [
    ['Período', `${fechaCorta(d.desde)} al ${fechaCorta(d.hasta)}`],
    ['Comidas servidas', String(servidas.length)],
    ['Platos servidos', String(totalPlatos)],
    ['Gastado en víveres', dineroEs(totalValor)],
    ['Costo por plato', totalPlatos > 0 ? dineroEs(totalValor / totalPlatos) : 'No hay platos en el período'],
    ['Comidas anuladas', anuladas > 0 ? `${anuladas}, no entran en estos totales` : 'Ninguna'],
    ['Emitido por', d.emitidoPor],
  ])

  y = seccion(doc, y, 'Comidas del período')
  if (d.comidas.length === 0) {
    y = etiquetaValor(doc, y, [['Sin comidas', 'No se sirvió ninguna comida en este período']], {
      columnas: 1,
    })
  } else {
    y = tabla(
      doc,
      y,
      COLUMNAS_COMIDAS,
      d.comidas.map((c) => [
        c.numero,
        c.fecha,
        c.tipo,
        String(c.platos),
        dineroEs(c.valorUsd),
        c.costoPorPlatoUsd != null ? dineroEs(c.costoPorPlatoUsd) : '—',
        c.estado === 'ANULADA' ? 'Anulada' : 'Servida',
      ]),
    )
  }

  y = seccion(doc, y, 'Víveres consumidos (comidas servidas)')
  if (d.viveres.length === 0) {
    y = etiquetaValor(doc, y, [['Sin consumo', 'Ningún víver se descontó en este período']], {
      columnas: 1,
    })
  } else {
    y = tabla(
      doc,
      y,
      COLUMNAS_VIVERES,
      d.viveres.map((v) => [v.articulo, v.unidad, cantidadEs(v.cantidad), dineroEs(v.valorUsd)]),
      `Total: ${dineroEs(totalValor)}`,
    )
  }

  pieDePagina(
    doc,
    `Documento generado por el sistema · ${fechaCorta(d.desde)} al ${fechaCorta(d.hasta)} · ${fechaLarga(d.momento)}`,
  )
  doc.setProperties({ title: `Informe de alimentación — ${fechaCorta(d.desde)} al ${fechaCorta(d.hasta)}` })

  return {
    blob: doc.output('blob'),
    nombre: `informe-alimentacion-${d.desde}-a-${d.hasta}.pdf`,
  }
}
