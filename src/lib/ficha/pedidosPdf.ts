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
  type Columna,
  type EmpresaPapel,
} from '@/lib/ficha/papel'
import type { Orden } from '@/lib/api/pedidos'
import {
  ETIQUETA_ALMACEN,
  SEDE_ALMACEN,
  cantidadSolicitada,
  etiquetaEstado,
  estadoRevision,
  fechaHoraVE,
  fmtCant,
  marcaDeAlmacen,
  repartoRenglon,
  resumenRevision,
  seRevisa,
  solicitaDe,
} from '@/lib/pedidos'

/*
  EL PDF DE LA SOLICITUD DE PEDIDO (MGG `solicitudPedidoPdf.ts`)

  Las secciones son las de MGG y en su orden: la ficha (fecha, solicitante,
  dónde se necesita, finalidad, urgente, estado, notas), los productos
  solicitados —con lo que tiene el almacén y lo que va a Compras cuando ya hay
  revisión—, la revisión del almacén y, con la SP cerrada, el reparto y la
  nota del almacén.

  Lo que se aparta, a propósito:
    - EL PAPEL ES EL DE LA CASA: membrete, colores y tabla de La Cantera
      (`papel.ts`), no el naranja de MGG. Dos empresas no comparten papel.
    - SIEMPRE VERTICAL. MGG gira la hoja cuando hay revisión porque suma dos
      columnas de sede; aquí la sede es una sola y la tabla cabe de pie.
    - SIN «TRASLADOS ENTRE ALMACENES»: un solo almacén revisa (decisión de la
      dueña, 07/11/2026). En su lugar, la solicitud de salida por la que
      entrega el almacén general.
*/

const COLUMNAS: Columna[] = [
  { titulo: '#', ancho: 10 },
  { titulo: 'Producto', ancho: 90 },
  { titulo: 'Cantidad', ancho: 25, alDerecha: true },
  { titulo: 'Unidad', ancho: 25 },
]

const COLUMNAS_REVISION: Columna[] = [
  { titulo: '#', ancho: 8 },
  { titulo: 'Producto', ancho: 62 },
  { titulo: 'Cantidad', ancho: 20, alDerecha: true },
  { titulo: 'Unidad', ancho: 18 },
  { titulo: ETIQUETA_ALMACEN, ancho: 22, alDerecha: true },
  { titulo: 'A Compras', ancho: 20, alDerecha: true },
]

export async function armarSolicitudPedidoPdf(o: Orden, empresa: EmpresaPapel): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const generado = fechaHoraVE()

  const conf = estadoRevision(o)
  const cerrada = !!o.revisada_almacen_en
  const enCurso = !cerrada && conf.revisados > 0
  const tieneRevision = cerrada || enCurso

  let y = membrete(doc, logo, {
    empresa,
    datos: [
      ['N° solicitud', o.codigo],
      ['Fecha', fechaHoraVE(o.creado_en)],
    ],
  })

  y = tituloDocumento(doc, y, `Solicitud de Pedido ${o.codigo}`)

  // MGG: «{URGENTE · }{estado} · Generado {fecha}», en gris bajo el título.
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor('#6b6b6b')
  doc.text(`${o.urgente ? 'URGENTE · ' : ''}${etiquetaEstado(o.estado)} · Generado ${generado}`, 105, y - 3, {
    align: 'center',
  })
  y += 3

  y = etiquetaValor(doc, y, [
    ['Fecha', fechaHoraVE(o.creado_en)],
    ['Solicitante', solicitaDe(o)],
    ['Se necesita en', ETIQUETA_ALMACEN],
    ['Finalidad', o.finalidad ?? o.motivo ?? null],
    ['Urgente', o.urgente ? 'Sí' : null],
    ['Estado', etiquetaEstado(o.estado)],
  ].filter(([, v]) => v != null) as Array<[string, string]>)

  if (o.notas?.trim()) {
    y = etiquetaValor(doc, y, [['Notas', o.notas.trim()]], { columnas: 1 })
  }

  const items = (o.items ?? []).filter((it) => seRevisa(it) || it.cantidad_solicitada != null)

  y = seccion(doc, y, `Productos solicitados (${items.length})`)
  if (!items.length) {
    y = tabla(doc, y, COLUMNAS, [['', 'Sin productos', '', '']])
  } else if (!tieneRevision) {
    y = tabla(
      doc,
      y,
      COLUMNAS,
      items.map((it, i) => [String(i + 1), it.nombre, fmtCant(cantidadSolicitada(it)), it.unidad ?? '']),
    )
  } else {
    y = tabla(
      doc,
      y,
      COLUMNAS_REVISION,
      items.map((it, i) => {
        const m = marcaDeAlmacen(it)
        const rep = repartoRenglon(it)
        // La celda del almacén: lo que tiene, «no hay», o «sin responder» (en
        // curso) / «—» (cerrada), como MGG.
        const celda = cerrada
          ? rep.almacen > 0
            ? fmtCant(rep.almacen)
            : 'no hay'
          : m?.revisado
            ? m.disponible > 0
              ? fmtCant(m.disponible)
              : 'no hay'
            : 'sin responder'
        return [
          String(i + 1),
          it.nombre,
          fmtCant(cantidadSolicitada(it)),
          it.unidad ?? '',
          celda,
          cerrada ? (rep.falta > 0 ? fmtCant(rep.falta) : '—') : '—',
        ]
      }),
    )
  }

  if (tieneRevision) {
    y = seccion(doc, y, 'Revisión de almacén')
    const rev = o.revision_sedes?.[SEDE_ALMACEN]
    y = tabla(
      doc,
      y,
      [
        { titulo: 'Sede', ancho: 32 },
        { titulo: 'Estado', ancho: 28 },
        { titulo: 'Confirmó', ancho: 34 },
        { titulo: 'Fecha', ancho: 26 },
        { titulo: 'Nota', ancho: 30 },
      ],
      [
        [
          ETIQUETA_ALMACEN,
          conf.confirmada ? 'Confirmó' : conf.revisados > 0 ? `En curso (${conf.revisados}/${conf.total})` : 'Pendiente',
          rev?.confirmada_por_nombre ?? '—',
          rev?.confirmada_en ? fechaHoraVE(rev.confirmada_en) : '—',
          rev?.nota ?? '—',
        ],
      ],
    )
  }

  if (cerrada) {
    const { tiene, falta } = resumenRevision(o.items ?? [])
    y = seccion(doc, y, 'Reparto')
    const filas = [
      ...tiene.map((r) => [`Entrega ${ETIQUETA_ALMACEN}`, r.nombre, `${fmtCant(r.cantidad)} ${r.unidad}`.trim()]),
      ...falta.map((r) => ['Va a Compras', r.nombre, `${fmtCant(r.cantidad)} ${r.unidad}`.trim()]),
    ]
    y = tabla(
      doc,
      y,
      [
        { titulo: 'Origen', ancho: 45 },
        { titulo: 'Producto', ancho: 75 },
        { titulo: 'Cantidad', ancho: 30, alDerecha: true },
      ],
      filas.length ? filas : [['—', 'Sin productos', '']],
    )

    if (o.salida_almacen_numero) {
      y = etiquetaValor(doc, y, [['Solicitud de salida', o.salida_almacen_numero]], { columnas: 1 })
    }

    if (o.nota_almacen?.trim()) {
      y = seccion(doc, y, 'Nota de almacén')
      doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor('#333333')
      const lineas = doc.splitTextToSize(o.nota_almacen.trim(), 150) as string[]
      doc.text(lineas, 30, y, { lineHeightFactor: 1.45 })
    }
  }

  pieDePagina(doc, `Solicitud de Pedido ${o.codigo} · ${fechaLarga(new Date())}`)
  doc.setProperties({ title: `Solicitud de Pedido ${o.codigo}` })

  return { blob: doc.output('blob'), nombre: `${o.codigo}.pdf` }
}
