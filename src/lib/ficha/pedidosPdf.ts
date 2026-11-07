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
  chip,
  firmas,
  type Columna,
  type EmpresaPapel,
} from '@/lib/ficha/papel'
import { DATOS_TECNICOS, LOGISTICA, desglosarOc, infoModalidad, labelCondicionPago } from '@/lib/ofertas'
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

// ---------------------------------------------------------------------------
// Fase 2: «↓ PDF para cotizar» y «↓ OC PDF» (MGG `solicitudCotizacionPdf.ts`,
// `ordenCompraPdf.ts`), en el papel de la casa.
// ---------------------------------------------------------------------------

const money2 = (n: number | string | null | undefined) =>
  `$${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fechaCortaVE = (iso: string | null | undefined): string | null => {
  if (!iso) return null
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** MGG «Descripción»: motivo y finalidad sin repetir. */
const descripcionDe = (o: Pick<Orden, 'motivo' | 'finalidad'>): string | null => {
  const m = (o.motivo ?? '').trim()
  const f = (o.finalidad ?? '').trim()
  return [m, f === m ? '' : f].filter(Boolean).join(' · ') || null
}

/**
 * «Solicitud de cotización» para mandar al proveedor: los materiales con su
 * medida y cantidad, las columnas de precio en blanco y lo que tiene que
 * completar. Sin los renglones desmarcados (`comprar=false`).
 */
export async function armarSolicitudCotizacionPdf(o: Orden, empresa: EmpresaPapel): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    empresa,
    datos: [
      ['N°', o.codigo],
      ['Fecha', fechaCortaVE(new Date().toISOString()) ?? ''],
    ],
  })
  y = tituloDocumento(doc, y, 'Solicitud de cotización')

  y = etiquetaValor(doc, y, [
    ['Unidad solicitante', o.unidad_solicitante],
    ['Solicitante', o.solicitante_nombre ?? o.creado_por_nombre],
  ])
  const desc = descripcionDe(o)
  const notas = (o.notas ?? '').trim()
  if (desc || notas) {
    y = etiquetaValor(
      doc,
      y,
      [
        ['Descripción', desc],
        ['Nota', notas || null],
      ].filter(([, v]) => v) as Array<[string, string]>,
      { columnas: 1 },
    )
  }

  const items = (o.items ?? []).filter((it) => it.comprar !== false)
  y = seccion(doc, y, `Materiales solicitados (${items.length})`)
  y = tabla(
    doc,
    y,
    [
      { titulo: '#', ancho: 8 },
      { titulo: 'SKU', ancho: 22 },
      { titulo: 'Material', ancho: 50 },
      { titulo: 'Medida', ancho: 16 },
      { titulo: 'Cant.', ancho: 16, alDerecha: true },
      { titulo: 'Precio unit.', ancho: 19, alDerecha: true },
      { titulo: 'Total', ancho: 19, alDerecha: true },
    ],
    items.length
      ? items.map((it, i) => [
          String(i + 1),
          it.general && !it.articulo_id ? '—' : it.sku,
          [it.nombre, [it.marca, it.modelo].filter(Boolean).join(' · ')].filter(Boolean).join('\n'),
          it.unidad ?? '',
          fmtCant(it.cantidad),
          '',
          '',
        ])
      : [['', '', 'Sin materiales', '', '', '', '']],
  )

  y = seccion(doc, y, 'A completar por el proveedor')
  const raya = '______________________'
  y = etiquetaValor(doc, y, [
    ['Proveedor', raya],
    ['RIF', raya],
    ['Validez de la oferta', raya],
    ['Tiempo de entrega', raya],
    ['Condición de pago', raya],
    ['Total cotizado', raya],
  ])

  pieDePagina(doc, `Documento auto-generado · ${fechaLarga(new Date())} · Los precios los completa el proveedor.`)
  doc.setProperties({ title: `Solicitud de cotización ${o.codigo}` })
  return { blob: doc.output('blob'), nombre: `${o.codigo}-cotizar.pdf` }
}

/** Lo que el PDF de la OC necesita además de la orden. */
export interface DatosOcPdf {
  proveedor: {
    nombre: string
    rif: string | null
    contacto: string | null
    correo: string | null
    telefono: string | null
    direccion: string | null
  } | null
  /** La oferta aceptada: de ahí sale la fecha de entrega prometida. */
  fechaEntregaPrometida: string | null
  /** La categoría de cada artículo, por su id. */
  categoriaDe: (articuloId: number | null | undefined) => string | null
}

/**
 * «ORDEN DE COMPRA» (MGG `ordenCompraPdf.ts`): proveedor, condiciones, datos de
 * la oferta elegida, desistimientos, ítems con su pie de totales, notas y
 * firmas. La firma escaneada de quien aprueba llega con la aprobación (fase 3):
 * hasta entonces la raya va en blanco.
 */
export async function armarOrdenCompraPdf(o: Orden, empresa: EmpresaPapel, d: DatosOcPdf): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const oc = o.oc_codigo ?? o.codigo

  let y = membrete(doc, logo, {
    empresa,
    datos: [
      ['N°', oc],
      ['Ref. pedido', o.codigo],
      ['Emitida', fechaHoraVE(o.oc_creada_en ?? o.creado_en)],
    ],
  })
  y = tituloDocumento(doc, y, o.clase === 'servicio' ? 'Orden de servicio' : 'Orden de compra')
  if (o.urgente) {
    chip(doc, 30, y - 3, 'Orden urgente')
    y += 5
  }

  y = seccion(doc, y, 'Proveedor')
  y = etiquetaValor(doc, y, [
    ['Razón social', d.proveedor?.nombre ?? '—'],
    ['RIF', d.proveedor?.rif ?? null],
    ['Contacto', d.proveedor?.contacto ?? null],
    ['Email', d.proveedor?.correo ?? null],
    ['Teléfono', d.proveedor?.telefono ?? null],
    ['Dirección', d.proveedor?.direccion ?? null],
  ])

  y = seccion(doc, y, 'Condiciones')
  y = etiquetaValor(
    doc,
    y,
    (
      [
        ['Unidad solicitante', o.unidad_solicitante],
        ['Solicitante', o.solicitante_nombre ?? o.creado_por_nombre],
        ['Fecha de solicitud', fechaHoraVE(o.creado_en)],
        ['Finalidad', descripcionDe(o)],
        ['Clasificación', o.clasificacion?.length ? o.clasificacion.join(', ') : null],
        ['Entrega prometida', fechaCortaVE(d.fechaEntregaPrometida)],
        ['Condiciones de pago', labelCondicionPago(o.condiciones_pago)],
        ['Modalidad de pago', o.modalidad_pago ? infoModalidad(o.modalidad_pago).larga : null],
        ['Aprobada por', o.aprobada_por_nombre],
        ['Aprobada el', o.aprobada_en ? fechaHoraVE(o.aprobada_en) : null],
        ['OC creada por', o.oc_creada_por_nombre],
        ['OC confirmada por', o.oc_aprobada_por_nombre],
        ['OC confirmada el', o.oc_aprobada_en ? fechaHoraVE(o.oc_aprobada_en) : null],
      ] as Array<[string, string | null]>
    ).filter(([, v]) => v),
  )

  // DATOS DE LA OFERTA ELEGIDA.
  const det = o.oferta_detalle
  const filasOferta: Array<[string, string | null]> = []
  if (det) {
    for (const t of DATOS_TECNICOS) if (det[t.clave]) filasOferta.push([t.label, String(det[t.clave])])
    for (const l of LOGISTICA) {
      const v = det.logistica?.[l.clave]
      if (v) filasOferta.push([l.label, v === 'incluido' ? 'Incluido en el precio' : 'Por cuenta del comprador'])
    }
  }
  const bcv = Number(o.oferta_precio_bcv) || 0
  const efe = Number(o.oferta_precio_efectivo) || 0
  if (bcv > 0 && efe > 0 && efe < bcv) {
    filasOferta.push(['Modalidad elegida', infoModalidad(o.modalidad_pago).larga])
    filasOferta.push(['Precio total (BCV)', money2(bcv)])
    filasOferta.push(['Precio en divisa efectivo', money2(efe)])
    filasOferta.push(['Ahorro por pago en efectivo', `${money2(bcv - efe)} (-${Math.round(((bcv - efe) / bcv) * 100)}%)`])
  }
  if (Number(o.descuento_obtenido) > 0) {
    const des = desglosarOc(o)
    filasOferta.push(['Subtotal', money2(des.subtotal)])
    filasOferta.push(['Descuento obtenido', money2(des.descuento)])
    filasOferta.push(['Total a pagar (con descuento)', money2(o.total)])
  }
  if (o.oferta_motivo?.trim()) filasOferta.push(['Motivo de elección', o.oferta_motivo.trim()])
  if (filasOferta.length) {
    y = seccion(doc, y, 'Datos de la oferta elegida')
    y = etiquetaValor(doc, y, filasOferta)
  }

  // DESISTIMIENTOS DE PROVEEDOR.
  const desist = (o.historial ?? []).filter((h) => h.evento === 'desistida_proveedor')
  if (desist.length) {
    y = seccion(doc, y, 'Desistimientos de proveedor')
    y = tabla(
      doc,
      y,
      [
        { titulo: 'Proveedor', ancho: 45 },
        { titulo: 'Desistió', ancho: 30 },
        { titulo: 'Motivo', ancho: 45 },
        { titulo: 'Registró', ancho: 30 },
      ],
      desist.map((h) => [
        String(h.proveedor ?? '—'),
        fechaHoraVE(h.at),
        String(h.motivo ?? '—'),
        String(h.actor_nombre ?? '—'),
      ]),
    )
  }

  // ÍTEMS.
  const items = (o.items ?? []).filter((it) => it.comprar !== false)
  y = seccion(doc, y, 'Ítems')
  y = tabla(
    doc,
    y,
    [
      { titulo: 'SKU', ancho: 20 },
      { titulo: 'Descripción', ancho: 40 },
      { titulo: 'Marca / Modelo', ancho: 22 },
      { titulo: 'Categoría', ancho: 18 },
      { titulo: 'Cantidad', ancho: 17, alDerecha: true },
      { titulo: 'Precio unit.', ancho: 16, alDerecha: true },
      { titulo: 'Subtotal', ancho: 17, alDerecha: true },
    ],
    items.map((it) => [
      it.general && !it.articulo_id ? '—' : it.sku,
      [it.nombre, it.articulo_nombre && it.articulo_nombre !== it.nombre ? `(inventario: ${it.articulo_nombre})` : '']
        .filter(Boolean)
        .join('\n'),
      [it.marca, it.modelo].filter(Boolean).join(' / ') || '—',
      d.categoriaDe(it.articulo_id) ?? '—',
      `${fmtCant(it.cantidad)} ${it.unidad_compra ?? it.unidad ?? ''}`.trim(),
      `${money2(it.precio)}${it.unidad_compra ? ` / ${it.unidad_compra}` : ''}`,
      money2((Number(it.cantidad) || 0) * (Number(it.precio) || 0)),
    ]),
  )

  // El pie de totales (MGG `lineasDeTotal`).
  const des = desglosarOc(o)
  const total = Number(o.total) || 0
  const lineas: Array<[string, string]> = []
  if (Math.abs(total - des.subtotal) > 0.005 || des.ivaIncluido) {
    lineas.push([des.ivaIncluido ? 'Subtotal ítems (con IVA)' : 'Subtotal ítems', money2(des.subtotal)])
    if (des.descuento) lineas.push(['Descuento', `-${money2(des.descuento)}`])
    if (des.iva && !des.ivaIncluido) lineas.push(['IVA', money2(des.iva)])
    if (des.igtf) lineas.push(['IGTF', money2(des.igtf)])
    if (des.ajuste) lineas.push([o.ajuste_motivo ? `Ajuste · ${o.ajuste_motivo}` : 'Ajuste', money2(des.ajuste)])
    const otros = Math.round((total - des.esperado) * 100) / 100
    if (Math.abs(otros) > 0.005) lineas.push(['Otros ajustes', money2(otros)])
  }
  lineas.push(['TOTAL', money2(total)])
  if (des.ivaIncluido && des.iva) {
    lineas.push(['Base sin IVA (informativo)', money2(des.subtotal - des.iva)])
    lineas.push(['IVA (incluido en los precios) (informativo)', money2(des.iva)])
  }
  y = etiquetaValor(doc, y - 4, lineas, { columnas: 1 })

  if ((o.notas ?? '').trim()) {
    y = seccion(doc, y, 'Notas / observaciones')
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor('#333333')
    const lineasNota = doc.splitTextToSize(o.notas!.trim(), 150) as string[]
    doc.text(lineasNota, 30, y, { lineHeightFactor: 1.45 })
    y += lineasNota.length * 4.6 + 6
  }

  if (y + 22 > 265) {
    doc.addPage()
    y = 30
  }
  firmas(
    doc,
    Math.max(y + 10, 240),
    {
      texto: o.oc_aprobada_en ? 'Firma autorizada' : `Firma autorizada · ${empresa.razonSocial}`,
      nombre: o.oc_aprobada_por_nombre ?? null,
    },
    { texto: 'Analista que realizó la solicitud', nombre: o.oc_creada_por_nombre ?? o.aprobada_por_nombre ?? null },
  )

  pieDePagina(doc, `Documento auto-generado · ${o.codigo} · ${fechaLarga(new Date())}`)
  doc.setProperties({ title: `Orden de compra ${oc}` })
  return { blob: doc.output('blob'), nombre: `${oc}.pdf` }
}
