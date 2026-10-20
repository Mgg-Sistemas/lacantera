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
  EL INFORME DE ASIGNACIONES, EN PAPEL.

  Christopher, 20/10/2026: un informe de entradas y salidas para lo que se
  presta o se consume por una persona, hermano del de Alimentación
  (19/10/2026) — mismo molde: alcance del período primero, el detalle
  después. Lo que entra es lo que se devuelve; lo que sale es cada entrega,
  sea préstamo o consumible.

  El historial de donde sale nunca se edita: `asignaciones_herramienta` no
  tiene UPDATE ni DELETE para un usuario estándar, solo los pasos que ya
  tiene el módulo —devolver, reportar pérdida o daño—, cada uno un hecho
  nuevo. Este papel es la lectura de ese historial, no otra copia de él.
*/

export interface AsignacionDelInforme {
  numero: string | null
  fechaEntrega: string
  trabajador: string
  articulo: string
  unidad: string
  cantidad: string | number
  clase: 'DOTACION' | 'ASIGNACION'
  /** El código tal cual lo guarda la base, no la palabra que se enseña. */
  estado: 'ASIGNADA' | 'DEVUELTA' | 'PERDIDA' | 'DANADA' | 'REPUESTA'
  fechaDevolucion: string | null
}

/** Cómo se dice cada estado en el papel. */
const ESTADO_EN_PALABRAS: Record<AsignacionDelInforme['estado'], string> = {
  ASIGNADA: 'Por devolver',
  DEVUELTA: 'Devuelta',
  PERDIDA: 'Perdida',
  DANADA: 'Dañada',
  REPUESTA: 'Repuesta',
}

export interface DatosInformeAsignaciones {
  desde: string
  hasta: string
  asignaciones: AsignacionDelInforme[]
  empresa: { razonSocial: string; rif: string }
  emitidoPor: string
  momento: Date
}

const entero = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 2 })
const cantidadEs = (v: string | number): string => {
  const n = Number(v ?? 0)
  return Number.isInteger(n) ? entero.format(n) : n.toLocaleString('es-VE', { maximumFractionDigits: 2 })
}

const COLUMNAS: Columna[] = [
  { titulo: 'Fecha', ancho: 20 },
  { titulo: 'Trabajador', ancho: 38 },
  { titulo: 'Artículo', ancho: 34 },
  { titulo: 'Cant.', ancho: 16, alDerecha: true },
  { titulo: 'Clase', ancho: 20 },
  { titulo: 'Estado', ancho: 22 },
]

export async function armarInformeAsignaciones(d: DatosInformeAsignaciones): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  const prestamos = d.asignaciones.filter((a) => a.clase === 'ASIGNACION')
  const dotaciones = d.asignaciones.filter((a) => a.clase === 'DOTACION')
  const sinDevolver = d.asignaciones.filter((a) => a.estado === 'ASIGNADA')
  const devueltas = d.asignaciones.filter((a) => a.estado === 'DEVUELTA')
  const perdidasODanadas = d.asignaciones.filter((a) => a.estado === 'PERDIDA' || a.estado === 'DANADA')

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['Período', `${fechaCorta(d.desde)} al ${fechaCorta(d.hasta)}`],
      ['Emitido', fechaLarga(d.momento)],
    ],
  })

  y = tituloDocumento(doc, y, 'Informe de asignaciones')

  y = lineaEmpresa(doc, y, `${d.empresa.razonSocial} · RIF ${d.empresa.rif} · Sistema administrativo`)

  y = seccion(doc, y, 'Alcance')
  y = etiquetaValor(doc, y, [
    ['Período', `${fechaCorta(d.desde)} al ${fechaCorta(d.hasta)}`],
    ['Entregas en el período', String(d.asignaciones.length)],
    ['Préstamos / Dotaciones', `${prestamos.length} · ${dotaciones.length}`],
    ['Sin devolver todavía', String(sinDevolver.length)],
    ['Devueltas', String(devueltas.length)],
    ['Perdidas o dañadas', String(perdidasODanadas.length)],
    ['Emitido por', d.emitidoPor],
  ])

  y = seccion(doc, y, 'Entregas del período')
  if (d.asignaciones.length === 0) {
    y = etiquetaValor(doc, y, [['Sin entregas', 'Ninguna entrega quedó registrada en este período']], {
      columnas: 1,
    })
  } else {
    y = tabla(
      doc,
      y,
      COLUMNAS,
      d.asignaciones.map((a) => [
        fechaCorta(a.fechaEntrega),
        a.trabajador,
        a.articulo,
        `${cantidadEs(a.cantidad)} ${a.unidad}`,
        a.clase === 'DOTACION' ? 'Dotación' : 'Préstamo',
        ESTADO_EN_PALABRAS[a.estado],
      ]),
    )
  }

  pieDePagina(
    doc,
    `Documento generado por el sistema · ${fechaCorta(d.desde)} al ${fechaCorta(d.hasta)} · ${fechaLarga(d.momento)}`,
  )
  doc.setProperties({ title: `Informe de asignaciones — ${fechaCorta(d.desde)} al ${fechaCorta(d.hasta)}` })

  return {
    blob: doc.output('blob'),
    nombre: `informe-asignaciones-${d.desde}-a-${d.hasta}.pdf`,
  }
}
