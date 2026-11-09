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
  etiquetaDocumento,
  labelMetodoPago,
  labelRetencion,
  montoAPagar,
  resumenDatosPago,
  saldoCredito,
} from '@/lib/pagos'
import {
  ETIQUETA_ALMACEN,
  cantidadSolicitada,
  etiquetaEstado,
  estadoRevision,
  fechaHoraVE,
  fmtCant,
  marcaDeAlmacen,
  repartoRenglon,
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

  const servicio = o.clase === 'servicio'
  y = tituloDocumento(doc, y, `${servicio ? 'Solicitud de servicio' : 'Solicitud de Pedido'} ${o.codigo}`)

  // MGG: «{URGENTE · }{estado} · Generado {fecha}», en gris bajo el título.
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor('#6b6b6b')
  doc.text(`${o.urgente ? 'URGENTE · ' : ''}${etiquetaEstado(o.estado)} · Generado ${generado}`, 105, y - 3, {
    align: 'center',
  })
  y += 3

  y = etiquetaValor(doc, y, [
    ['Fecha', fechaHoraVE(o.creado_en)],
    ['Solicitante', solicitaDe(o)],
    // Un servicio no llega al almacén (fase 5a).
    ['Se necesita en', servicio ? null : ETIQUETA_ALMACEN],
    ['Finalidad', o.finalidad ?? o.motivo ?? null],
    ['Urgente', o.urgente ? 'Sí' : null],
    ['Estado', etiquetaEstado(o.estado)],
  ].filter(([, v]) => v != null) as Array<[string, string]>)

  if (o.notas?.trim()) {
    y = etiquetaValor(doc, y, [['Notas', o.notas.trim()]], { columnas: 1 })
  }

  const items = (o.items ?? []).filter((it) => seRevisa(it) || it.cantidad_solicitada != null)

  y = seccion(doc, y, `${servicio ? 'Servicios solicitados' : 'Productos solicitados'} (${items.length})`)
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

  /*
    SOLO LOS PRODUCTOS SOLICITADOS (la dueña, 09/11/2026: «acá solo deja
    productos solicitados; lo demás quitalo»). La revisión del almacén, el
    reparto y su nota se ven en la orden, no en el papel.
  */

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
  /** La firma guardada de quien aprobó la OC (fase 3). Sin ella, la raya va en blanco. */
  firmaAprobador?: string | null
}

/**
 * «ORDEN DE COMPRA» (MGG `ordenCompraPdf.ts`): proveedor, condiciones, datos de
 * la oferta elegida, desistimientos, ítems con su pie de totales, el pago
 * (documento, retenciones y monto a pagar, fase 3), notas y firmas. Ya
 * aprobada, la firma guardada de quien la aprobó; sin firma, la raya en blanco.
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
      [
        it.nombre,
        it.articulo_nombre && it.articulo_nombre !== it.nombre ? `(inventario: ${it.articulo_nombre})` : '',
        // MGG: el detalle de un renglón de servicio sale como «  • desc · cant · precio».
        ...(it.detalle_items ?? []).map(
          (x) =>
            `  • ${x.descripcion}${x.cantidad != null ? ` · ${fmtCant(x.cantidad)}` : ''}${x.precio != null ? ` · ${money2(x.precio)}` : ''}`,
        ),
      ]
        .filter(Boolean)
        .join('\n'),
      [it.marca, it.modelo].filter(Boolean).join(' / ') || '—',
      o.clase === 'servicio'
        ? [it.servicio_categoria, it.servicio_tipo].filter(Boolean).join(' · ') || '—'
        : (d.categoriaDe(it.articulo_id) ?? '—'),
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

  // EL PAGO (fase 3): sin Tesorería, las retenciones se restan del total.
  const rets = o.retenciones ?? []
  const filasPago: Array<[string, string]> = []
  if (o.comprobante_tipo) filasPago.push(['Documento', etiquetaDocumento(o.comprobante_tipo)])
  for (const m of o.metodo_pago ?? []) {
    const datos = resumenDatosPago(m.metodo, m.datos)
    const monto = Number(m.monto) > 0 ? `${m.moneda} ${Number(m.monto).toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : ''
    filasPago.push([`Método · ${labelMetodoPago(m.metodo)}`, [monto, datos].filter(Boolean).join(' · ') || String(m.moneda)])
  }
  if (o.numero_administracion) filasPago.push(['Tel. administración del proveedor', o.numero_administracion])
  if (Number(o.iva_factura) > 0) filasPago.push(['IVA de la factura', `+${money2(o.iva_factura)}`])
  if (Number(o.descuento_pago) > 0) filasPago.push(['Descuento en el pago', `-${money2(o.descuento_pago)}`])
  for (const r of rets) {
    const enBsRet = r.moneda === 'Bs' && Number(r.monto_bs) > 0
    filasPago.push([
      `Retención ${labelRetencion(r)}`,
      `-${money2(r.monto)}${r.modo === 'porcentaje' && r.base != null ? ` (sobre ${money2(r.base)})` : ''}${
        enBsRet
          ? ` · se paga en Bs ${Number(r.monto_bs).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (tasa ${Number(r.tasa ?? o.retenciones_tasa).toLocaleString('es-VE', { maximumFractionDigits: 4 })})`
          : ''
      }`,
    ])
  }
  if (rets.length || Number(o.descuento_pago) > 0 || o.metodo_pago?.length) {
    filasPago.push(['Monto a pagar', money2(montoAPagar(o))])
  }
  if (Number(o.abonado_total) > 0) {
    filasPago.push(['Abonado', money2(o.abonado_total)])
    filasPago.push(['Saldo pendiente', money2(saldoCredito(o))])
  }
  if (o.pagada_en && o.pago_fecha) {
    filasPago.push([
      'Pagada',
      `${fechaCortaVE(o.pago_fecha) ?? ''} · ${money2(o.pago_monto_usd)}${o.pago_referencia ? ` · ref. ${o.pago_referencia}` : ''}`,
    ])
  }
  /*
    LAS FIRMAS NUNCA SOLAS EN UNA HOJA (la dueña, 09/11/2026: «el OC PDF tiene
    una hoja vacía solo para las firmas»). Antes se preguntaba si cabía el pago
    y, después, si cabían las firmas: el pago llenaba la primera hoja y las
    firmas caían solas en la segunda. Ahora se mide el final entero —pago,
    notas y firmas— y, si no cabe, baja junto a la hoja siguiente.
  */
  const nota = (o.notas ?? '').trim()
  doc.setFont('helvetica', 'normal').setFontSize(9)
  const lineasDeNota = nota ? (doc.splitTextToSize(nota, 150) as string[]).length : 0
  const altoPago = filasPago.length ? 12 + filasPago.length * 5.6 : 0
  const altoNotas = nota ? 12 + lineasDeNota * 4.6 + 6 : 0
  const ALTO_FIRMAS = 26
  if (altoPago + altoNotas > 0 && y + altoPago + altoNotas + ALTO_FIRMAS > 262) {
    doc.addPage()
    y = 30
  }

  if (filasPago.length) {
    y = seccion(doc, y, 'Pago')
    y = etiquetaValor(doc, y, filasPago, { columnas: 1 })
  }

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
      imagen: o.oc_aprobada_en ? (d.firmaAprobador ?? null) : null,
    },
    { texto: 'Analista que realizó la solicitud', nombre: o.oc_creada_por_nombre ?? o.aprobada_por_nombre ?? null },
  )

  pieDePagina(doc, `Documento auto-generado · ${o.codigo} · ${fechaLarga(new Date())}`)
  doc.setProperties({ title: `Orden de compra ${oc}` })
  return { blob: doc.output('blob'), nombre: `${oc}.pdf` }
}

// ---------------------------------------------------------------------------
// Fase 3: «📋 OC por lote» (MGG `checklistOcPdf.ts`), en el papel de la casa
// ---------------------------------------------------------------------------

/**
 * «ÓRDENES DE COMPRA PENDIENTES POR CONFIRMACIÓN»: la relación de las OC
 * marcadas. MGG la saca apaisada y con un correlativo «GT-MTZ-BS-NNN-AAAA»;
 * aquí va vertical (la tabla de la casa cabe) y con la fecha en el nombre.
 */
export async function armarChecklistOcPdf(
  ordenes: Orden[],
  empresa: EmpresaPapel,
  d: { proveedorDe: (o: Orden) => string; descripcionDe: (o: Orden) => string },
): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const hoy = fechaHoraVE()

  let y = membrete(doc, logo, {
    empresa,
    datos: [
      ['Órdenes', String(ordenes.length)],
      ['Fecha', hoy],
    ],
  })
  y = tituloDocumento(doc, y, 'Órdenes de compra pendientes por confirmación')

  const corta = (iso: string | null | undefined) => fechaCortaVE(iso) ?? '—'
  y = tabla(
    doc,
    y,
    [
      { titulo: 'Item', ancho: 8 },
      { titulo: 'N° ODC', ancho: 19 },
      { titulo: 'Solicitado por', ancho: 19 },
      { titulo: 'Proveedor', ancho: 22 },
      { titulo: 'Descripción', ancho: 29 },
      { titulo: 'Monto $', ancho: 16, alDerecha: true },
      { titulo: 'F. compra', ancho: 13 },
      { titulo: 'F. firma', ancho: 13 },
      { titulo: 'Estatus', ancho: 11 },
    ],
    ordenes.map((o, i) => [
      String(i + 1),
      o.oc_codigo ?? o.codigo,
      [o.solicitante_nombre ?? o.creado_por_nombre, o.unidad_solicitante].filter(Boolean).join('\n') || '—',
      d.proveedorDe(o) || '—',
      d.descripcionDe(o) || '—',
      money2(o.total),
      corta(o.oc_creada_en),
      corta(o.oc_aprobada_en),
      o.estado === 'oc_creada' ? 'POR CONFIRMAR' : 'CONFIRMADA',
    ]),
  )

  const total = ordenes.reduce((a, o) => a + (Number(o.total) || 0), 0)
  etiquetaValor(doc, y - 2, [['Total', money2(total)]], { columnas: 1 })

  pieDePagina(doc, `Generado ${hoy} · ${empresa.razonSocial}`)
  doc.setProperties({ title: 'Órdenes de compra pendientes por confirmación' })
  return { blob: doc.output('blob'), nombre: `checklist-oc-${new Date().toISOString().slice(0, 10)}.pdf` }
}
