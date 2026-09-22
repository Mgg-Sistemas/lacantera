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
  notaBajoLaTabla,
  type Columna,
} from '@/lib/ficha/papel'
import { duracion, horaDe, type Jornada } from '@/lib/api/asistencia'

/*
  EL REPORTE DE ASISTENCIA

  Dos tablas: el resumen por persona —días, horas, y cuántas jornadas quedaron
  sin salida— y el detalle jornada por jornada. Las anuladas no salen: no son
  asistencia. Las abiertas salen con la salida en raya y NO suman horas: una
  jornada sin salida no dice cuánto estuvo alguien, y sumarle cero es mentir
  menos que inventarle ocho.
*/

const COLUMNAS_RESUMEN: Columna[] = [
  { titulo: 'Persona', ancho: 66 },
  { titulo: 'Ficha', ancho: 16 },
  { titulo: 'Días', ancho: 18, alDerecha: true },
  { titulo: 'Horas', ancho: 26, alDerecha: true },
  { titulo: 'Sin salida', ancho: 24, alDerecha: true },
]

const COLUMNAS_DETALLE: Columna[] = [
  { titulo: 'Fecha', ancho: 20 },
  { titulo: 'Persona', ancho: 46 },
  { titulo: 'Entrada', ancho: 16, alDerecha: true },
  { titulo: 'Salida', ancho: 16, alDerecha: true },
  { titulo: 'Horas', ancho: 20, alDerecha: true },
  { titulo: 'Turno', ancho: 14 },
  { titulo: 'Origen', ancho: 18 },
]

const periodo = (desde: string, hasta: string) =>
  desde === hasta ? `El ${fechaCorta(desde)}` : `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`

export async function armarReporteDeAsistencia(d: {
  empresa: { razonSocial: string; rif: string }
  emitidoPor: string
  momento: Date
  desde: string
  hasta: string
  jornadas: Jornada[]
}): Promise<ArchivoArmado> {
  const titulo = 'Reporte de asistencia'
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  const vivas = d.jornadas.filter((j) => j.estado !== 'ANULADA')
  const abiertas = vivas.filter((j) => j.estado === 'ABIERTA').length
  const minutos = vivas.reduce((s, j) => s + (j.minutos ?? 0), 0)

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['Período', periodo(d.desde, d.hasta)],
      ['Emitido', fechaLarga(d.momento)],
    ],
  })
  y = tituloDocumento(doc, y, titulo)
  y = lineaEmpresa(doc, y, `${d.empresa.razonSocial} · RIF ${d.empresa.rif} · Control de asistencia`)

  // Por persona: días distintos, minutos cerrados, jornadas abiertas.
  const porPersona = new Map<number, { nombre: string; ficha: string; dias: Set<string>; minutos: number; abiertas: number }>()
  for (const j of vivas) {
    const p = porPersona.get(j.empleado_id) ?? { nombre: j.nombre, ficha: j.ficha, dias: new Set<string>(), minutos: 0, abiertas: 0 }
    p.dias.add(j.fecha)
    p.minutos += j.minutos ?? 0
    if (j.estado === 'ABIERTA') p.abiertas++
    porPersona.set(j.empleado_id, p)
  }
  const personas = [...porPersona.values()].sort((a, b) => a.nombre.localeCompare(b.nombre))

  y = seccion(doc, y, 'Alcance')
  y = etiquetaValor(doc, y, [
    ['Período', periodo(d.desde, d.hasta)],
    ['Personas', String(personas.length)],
    ['Jornadas', String(vivas.length)],
    ['Horas cerradas', duracion(minutos)],
    ...(abiertas > 0 ? ([['Sin salida', `${abiertas} jornada${abiertas === 1 ? '' : 's'}`]] as [string, string][]) : []),
    ['Emitido por', d.emitidoPor],
  ])

  y = seccion(doc, y, 'Por persona')
  y = tabla(
    doc,
    y,
    COLUMNAS_RESUMEN,
    personas.length === 0
      ? [['Sin asistencia en el período', '', '', '', '']]
      : personas.map((p) => [p.nombre, p.ficha, String(p.dias.size), duracion(p.minutos), p.abiertas ? String(p.abiertas) : '']),
  )
  y = notaBajoLaTabla(
    doc,
    y,
    'Las horas son las de las jornadas cerradas. Una jornada sin salida cuenta como día presente pero no suma horas: nadie sabe a qué hora se fue.',
  )

  if (vivas.length > 0) {
    y = seccion(doc, y, 'Jornada por jornada')
    tabla(
      doc,
      y,
      COLUMNAS_DETALLE,
      vivas.map((j) => [
        fechaCorta(j.fecha),
        j.nombre,
        horaDe(j.entrada),
        j.salida ? horaDe(j.salida) : '—',
        j.minutos === null ? 'sin salida' : duracion(j.minutos),
        j.turno === 'DIA' ? 'Día' : 'Noche',
        j.origen === 'CARNET' ? 'Carnet' : 'A mano',
      ]),
    )
  }

  pieDePagina(doc, `Documento generado por el sistema · ${titulo} · ${fechaLarga(d.momento)}`)
  doc.setProperties({ title: titulo })
  return { blob: doc.output('blob'), nombre: `asistencia-${d.desde}-a-${d.hasta}.pdf` }
}
