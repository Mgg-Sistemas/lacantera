import { logoComoImagen } from '@/lib/ficha/logo'
import { ABAJO, ARRIBA, PIE } from '@/lib/ficha/hoja'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import {
  membrete,
  tituloDocumento,
  lineaEmpresa,
  seccion,
  etiquetaValor,
  bloqueEtiquetado,
  tabla,
  firmaCentrada,
  pieDePagina,
  fechaLarga,
  fechaCorta,
  type Columna,
} from '@/lib/ficha/papel'

/*
  LOS PAPELES DE COMPRAS, EN LA FORMA QUE PIDIÓ LA LÍDER

  Nos pasó dos documentos de MGG como el formato al que ajustarse: una orden de
  compra y un comprobante de pago. Se distinguen del que teníamos en que el
  título va en negro y grande sobre blanco, los datos van en bloques de
  etiqueta y valor en vez de párrafos, y la tabla lleva cabecera teñida.

  La estructura es la suya. Dos cosas se apartan a propósito:

    - EL COLOR es el de La Cantera y no el de MGG. Copiar también el color
      haría que los papeles de dos empresas se confundan sobre una mesa, que
      es justo lo que un membrete existe para evitar.

    - LA COLUMNA «SUBCATEGORÍA» no va. El modelo la lleva y la imprime vacía
      —«—»— porque tampoco la tiene. Sería una columna siempre en blanco
      quitándole ancho a la descripción, que es lo único que no se puede
      abreviar sin dejar de reconocer lo que se pidió.

  Y una que dejó de ser cierta: aquí decía que la marca tampoco se imprimía
  «porque no guardamos ese dato, y si hace falta de verdad, primero hay que
  poder guardarlo». Se guarda desde el 27 de agosto —lo pidió Diana, que recibe
  del proveedor la marca y la presentación que el pedido no trae— así que la
  orden ya la lleva, y la cotización también.
*/

const decimal2 = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const numero = (v: string | number | null | undefined): string =>
  decimal2.format(Number(v ?? 0))

const conMoneda = (moneda: string, v: string | number | null | undefined): string =>
  `${moneda === 'VES' ? 'Bs' : '$'} ${numero(v)}`

/** Entera si es entera. Ocho mil novecientos litros no se leen «8.900,00». */
const cantidad = (v: string | number): string => {
  const n = Number(v ?? 0)
  return Number.isInteger(n) ? n.toLocaleString('es-VE') : decimal2.format(n)
}

// ---------------------------------------------------------------------------
// Orden de compra
// ---------------------------------------------------------------------------

export interface RenglonDeOrden {
  sku: string
  descripcion: string
  categoria: string
  cantidad: string | number
  unidad: string
  precioUnitario: string | number
  subtotal: string | number
}

export interface DatosOrdenCompra {
  /*
    Quién autoriza, con su firma si la tiene guardada.

    Es el gerente que aprobó, no quien imprime: el papel dice quién autorizó la
    compra, y eso no cambia porque lo imprima otro después. Sin firma guardada
    la raya sale en blanco, que es como salía antes y se firma a mano.
  */
  autoriza?: {
    nombre?: string | null
    imagen?: string | null
    /*
      De quién era la autoridad, cuando quien firma no podía por su puesto.

      Es lo que pidió la líder: que la orden diga «bajo autorización del gerente
      general». Va debajo de la raya y no en lugar del nombre a propósito —
      quien firma es quien firma, y la autoridad prestada es un dato aparte. Las
      dos cosas juntas es lo único que deja reconstruir quién respondía por esto
      dentro de un año.
    */
    porAutorizacionDe?: string | null
  }

  numero: string
  /** El pedido del que salió. Va en la cabecera y en el pie. */
  refPedido: string
  emitida: string

  proveedor: {
    nombre: string
    rif: string
    telefono?: string | null
    direccion?: string | null
  }

  condiciones: {
    unidadSolicitante?: string | null
    solicitante?: string | null
    fechaSolicitud?: string | null
    finalidad?: string | null
    notas?: string | null
    clasificacion?: string | null
    entregaPrometida?: string | null
    condicionPago?: string | null
    documentos?: string | null
    aprobadaPor?: string | null
    aprobadaEl?: string | null
    confirmadaPor?: string | null
    confirmadaEl?: string | null
  }

  moneda: string
  renglones: RenglonDeOrden[]
  subtotal: string | number
  descuento: string | number
  flete: string | number
  iva: string | number
  total: string | number

  observaciones?: string | null
  /** Marca de agua: ANULADA, o nada. */
  sello?: string | null

  empresa: { razonSocial: string; rif: string; actividad?: string | null }
  momento: Date
}

/*
  Los anchos suman los 150 mm útiles.

  Las cifras van alineadas a la derecha, así que cada una necesita por delante
  el hueco de su número más largo. Si se reparte mirando los rótulos de la
  cabecera —«Precio unit.» es más ancho que «44.500,00»— la primera orden con
  cifras grandes escribe una columna encima de la otra.
*/
const COLUMNAS_ORDEN: Columna[] = [
  { titulo: 'SKU', ancho: 20 },
  { titulo: 'Descripción', ancho: 45 },
  { titulo: 'Categoría', ancho: 25 },
  // La unidad va dentro de la cantidad —«80 PARES»—, como en el modelo que
  // mandó la líder. De columna aparte se llevaba doce milímetros para escribir
  // «UND», y se los quitaba a la descripción, que es lo que de verdad se lee.
  { titulo: 'Cantidad', ancho: 22, alDerecha: true },
  { titulo: 'Precio unit.', ancho: 19, alDerecha: true },
  { titulo: 'Subtotal', ancho: 19, alDerecha: true },
]

export async function armarOrdenDeCompra(d: DatosOrdenCompra): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['N° orden', d.numero],
      ['Ref. pedido', d.refPedido],
      ['Emitida', d.emitida],
    ],
  })

  y = tituloDocumento(doc, y, 'Orden de compra')

  /*
    Solo el proveedor, y a la izquierda.

    Antes esto eran dos partes enfrentadas: la empresa a la izquierda y el
    proveedor a la derecha. La empresa ya está arriba en el membrete, con su RIF
    y su domicilio, así que repetirla aquí era decir dos veces lo mismo y dejar
    al proveedor —que es el dato que se busca— arrinconado en media hoja.
  */
  y = etiquetaValor(doc, y, [
    ['Proveedor', d.proveedor.nombre],
    ['RIF', d.proveedor.rif],
    ['Teléfono', d.proveedor.telefono],
    ['Dirección', d.proveedor.direccion],
  ])

  /*
    Los rótulos, cortos.

    Venían de cuando el bloque ocupaba los 150 mm de ancho y cabía cualquier
    cosa: «Fecha de entrega prometida», «OC confirmada por (gerente)». Puestos
    en dos columnas se partían en tres pisos y hacían la fila más alta que el
    dato que rotulan —y con eso la firma se iba a una segunda hoja vacía—.

    Lo que se quita no se pierde: «aprobada» y «confirmada» ya distinguen el
    paso del analista del paso del gerente, que es lo que decían los paréntesis.
  */
  y = seccion(doc, y, 'Condiciones')
  y = etiquetaValor(doc, y, [
    ['Departamento', d.condiciones.unidadSolicitante],
    ['Solicitante', d.condiciones.solicitante],
    ['Solicitada el', d.condiciones.fechaSolicitud],
    ['Finalidad', d.condiciones.finalidad],
    ['Notas', d.condiciones.notas],
    ['Clasificación', d.condiciones.clasificacion],
    ['Entrega prometida', d.condiciones.entregaPrometida],
    ['Forma de pago', d.condiciones.condicionPago],
    ['Documentos', d.condiciones.documentos],
    ['Aprobada por', d.condiciones.aprobadaPor],
    ['Aprobada el', d.condiciones.aprobadaEl],
    ['Confirmada por', d.condiciones.confirmadaPor],
    ['Confirmada el', d.condiciones.confirmadaEl],
  ])

  y = seccion(doc, y, 'Ítems')
  y = tabla(
    doc,
    y,
    COLUMNAS_ORDEN,
    d.renglones.map((r) => [
      r.sku,
      r.descripcion,
      r.categoria,
      [cantidad(r.cantidad), r.unidad].filter(Boolean).join(' '),
      numero(r.precioUnitario),
      numero(r.subtotal),
    ]),
    `TOTAL   ${conMoneda(d.moneda, d.total)}`,
  )

  // El desglose solo sale cuando hay algo que desglosar. En una orden sin
  // descuento, sin flete y exenta de IVA, tres renglones en cero repetirían
  // que no pasa nada — y el que sí importa se pierde entre ellos.
  const desglose: Array<[string, string | null]> = []
  if (Number(d.descuento) > 0) desglose.push(['Descuento', conMoneda(d.moneda, d.descuento)])
  if (Number(d.flete) > 0) desglose.push(['Flete', conMoneda(d.moneda, d.flete)])
  if (Number(d.iva) > 0) desglose.push(['IVA', conMoneda(d.moneda, d.iva)])
  if (desglose.length > 0) {
    desglose.unshift(['Subtotal', conMoneda(d.moneda, d.subtotal)])
    y = etiquetaValor(doc, y, desglose, { columnas: 1 })
  }

  if (d.observaciones) {
    y = seccion(doc, y, 'Notas / observaciones')
    doc.setFont('helvetica', 'normal').setFontSize(9)
    const lineas = doc.splitTextToSize(d.observaciones, 150) as string[]
    doc.text(lineas, 30, y, { lineHeightFactor: 1.45 })
    y += lineas.length * 4.6 + 6
  }

  if (d.sello) marcaDeAgua(doc, d.sello)

  /*
    La firma va entera o en su propia hoja: una raya partida entre dos páginas
    no la firma nadie. Pero cuánto sitio necesita depende de si hay firma
    escaneada —quince milímetros de imagen POR ENCIMA de la raya— o solo la raya
    con el cargo y el nombre debajo.

    Antes se reservaban treinta y cuatro milímetros en todos los casos, y una
    orden de siete renglones acababa a veinticuatro del pie: la firma se iba a
    una segunda hoja donde no había nada más. Una orden de compra firmada en una
    hoja en blanco es exactamente lo que no se quiere entregar a un proveedor.
  */
  const hueco = d.autoriza?.imagen ? 18 : 8
  if (y + hueco + 10 > PIE - 3) {
    doc.addPage()
    y = ARRIBA
  }
  // Una sola firma, la de quien autoriza. La raya de «recibido por el
  // proveedor» salió en blanco en todas las órdenes emitidas: la orden se manda
  // por correo, no se le pone delante al proveedor para que la firme.
  firmaCentrada(doc, Math.max(y + hueco, ABAJO - 26), {
    texto: d.autoriza?.porAutorizacionDe
      ? `Firma autorizada · bajo autorización de ${d.autoriza.porAutorizacionDe}`
      : 'Firma autorizada',
    nombre: d.autoriza?.nombre ?? null,
    imagen: d.autoriza?.imagen ?? null,
  })

  pieDePagina(doc, `Documento generado por el sistema · ${d.refPedido} · ${fechaLarga(d.momento)}`)
  doc.setProperties({ title: `Orden de compra ${d.numero} — ${d.proveedor.nombre}` })

  return {
    blob: doc.output('blob'),
    nombre: `orden-compra-${d.numero.toLowerCase()}.pdf`,
  }
}

// ---------------------------------------------------------------------------
// Comprobante de pago
// ---------------------------------------------------------------------------

export interface DatosComprobantePago {
  ordenNumero: string
  pedidoNumero: string
  proveedor: string
  solicitante?: string | null
  condicionPago?: string | null

  totalOrden: string | number
  monedaOrden: string

  metodo: string
  montoPagado: string | number
  monedaPago: string
  fechaPago: string
  pagadoPor?: string | null
  /** El archivo que subió tesorería, si lo hay. */
  comprobanteAdjunto?: string | null

  empresa: { razonSocial: string; rif: string }
  momento: Date
}

export async function armarComprobanteDePago(
  d: DatosComprobantePago,
): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['Orden', d.ordenNumero],
      ['Fecha de pago', d.fechaPago],
      ['Generado', fechaLarga(d.momento)],
    ],
  })

  y = tituloDocumento(doc, y, 'Comprobante de pago')

  y = lineaEmpresa(
    doc,
    y,
    `${d.empresa.razonSocial} · RIF ${d.empresa.rif} · Sistema administrativo`,
  )

  y = bloqueEtiquetado(doc, y, 'Orden de compra', [
    ['Pedido', d.pedidoNumero],
    ['N° de orden', d.ordenNumero],
    ['Proveedor', d.proveedor],
    ['Solicitante', d.solicitante],
    ['Condición de pago', d.condicionPago],
    ['Total de la orden', conMoneda(d.monedaOrden, d.totalOrden)],
  ])

  y = bloqueEtiquetado(doc, y, 'Pago', [
    ['Método de pago', d.metodo],
    ['Monto pagado', conMoneda(d.monedaPago, d.montoPagado)],
    ['Fecha de pago', d.fechaPago],
    ['Pagado por', d.pagadoPor],
    ['Comprobante adjunto', d.comprobanteAdjunto ?? 'Sin archivo adjunto'],
  ])

  pieDePagina(
    doc,
    `Documento generado por el sistema · ${d.pedidoNumero} · ${fechaLarga(d.momento)}`,
  )
  doc.setProperties({ title: `Comprobante de pago ${d.ordenNumero}` })

  return {
    blob: doc.output('blob'),
    nombre: `comprobante-pago-${d.ordenNumero.toLowerCase()}.pdf`,
  }
}

// ---------------------------------------------------------------------------

/** La palabra cruzada en diagonal, para lo que ya no vale. */
function marcaDeAgua(doc: import('jspdf').jsPDF, texto: string): void {
  doc.saveGraphicsState()
  // @ts-expect-error jsPDF expone GState por el objeto, no por el tipo.
  doc.setGState(new doc.GState({ opacity: 0.12 }))
  doc.setTextColor('#000000').setFont('helvetica', 'bold').setFontSize(72)
  doc.text(texto, 105, 165, { align: 'center', angle: 28 })
  doc.restoreGraphicsState()
}

export { fechaCorta }

// ---------------------------------------------------------------------------
// Cotización recibida
// ---------------------------------------------------------------------------

/*
  EL PAPEL DE UNA COTIZACIÓN CARGADA.

  Lo pidieron para poder mandarla por correo o llevarla a una reunión sin tener
  que abrir el sistema, que es cuando de verdad se comparan precios.

  NO ES EL PAPEL DEL PROVEEDOR, Y EL PIE LO DICE. Es lo que el sistema anotó de
  lo que el proveedor mandó, con nuestro membrete: quien lo reciba tiene que
  poder distinguirlo del original, porque las cifras son transcritas y el
  original es el que vale si algún día no coinciden. Por eso tampoco lleva
  firma — no hay nada que autorizar en un documento que solo recoge una oferta.

  Y por eso lleva el número del proveedor cuando lo puso: es lo único que ata
  esta hoja con el papel que llegó.
*/

export interface RenglonDeCotizacion {
  descripcion: string
  marca?: string | null
  presentacion?: string | null
  cantidad: string | number
  unidad: string
  precioUnitario: string | number
  subtotal: string | number
  exento?: boolean
}

export interface DatosCotizacionCompra {
  numero: string
  /** El pedido del que salió. */
  refPedido: string
  /** El número que el proveedor puso en su papel, si lo puso. */
  numeroProveedor?: string | null
  fecha: string

  proveedor: {
    nombre: string
    rif: string
    telefono?: string | null
    direccion?: string | null
  }

  condiciones: {
    validezDias?: number | null
    diasEntrega?: number | null
    condicionPago?: string | null
    cargadaPor?: string | null
    tituloPedido?: string | null
  }

  moneda: string
  /** La tasa con la que se congeló. Va al pie: sin ella el total en Bs no se puede rehacer. */
  tasa?: string | number | null
  renglones: RenglonDeCotizacion[]
  subtotal: string | number
  descuento: string | number
  flete: string | number
  iva: string | number
  alicuota: string | number
  total: string | number

  observaciones?: string | null
  /** «PROPUESTA AL GERENTE», «APROBADA», o nada. */
  sello?: string | null

  empresa: { razonSocial: string; rif: string; actividad?: string | null }
  momento: Date
}

/*
  Los anchos suman los 150 mm útiles, como en la orden.

  Aquí no va el SKU y sí van marca y presentación: una cotización no se lee para
  saber qué código de almacén es, se lee para saber qué ofrecen y a cómo. El
  código ya está en el pedido, que es de donde salen estos renglones.
*/
const COLUMNAS_COTIZACION: Columna[] = [
  { titulo: 'Descripción', ancho: 40 },
  { titulo: 'Marca', ancho: 21 },
  // 26 y no 20: con 20 el propio rótulo se partía en «PRESENTACI / ÓN», que es
  // lo primero que se ve de la tabla. Se midió en el PDF, no se calculó.
  { titulo: 'Presentación', ancho: 26 },
  { titulo: 'Cantidad', ancho: 21, alDerecha: true },
  { titulo: 'Precio unit.', ancho: 21, alDerecha: true },
  { titulo: 'Subtotal', ancho: 21, alDerecha: true },
]

export async function armarCotizacionDeCompra(
  d: DatosCotizacionCompra,
): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['N° cotización', d.numero],
      ['Ref. pedido', d.refPedido],
      ['Fecha', d.fecha],
    ],
  })

  y = tituloDocumento(doc, y, 'Cotización recibida')

  y = etiquetaValor(doc, y, [
    ['Proveedor', d.proveedor.nombre],
    ['RIF', d.proveedor.rif],
    ['Teléfono', d.proveedor.telefono],
    ['Dirección', d.proveedor.direccion],
  ])

  y = seccion(doc, y, 'Condiciones ofrecidas')
  y = etiquetaValor(doc, y, [
    ['Pedido', d.condiciones.tituloPedido],
    ['N° del proveedor', d.numeroProveedor],
    ['Forma de pago', d.condiciones.condicionPago],
    ['Entrega', d.condiciones.diasEntrega != null ? `${d.condiciones.diasEntrega} días` : null],
    ['Validez', d.condiciones.validezDias != null ? `${d.condiciones.validezDias} días` : null],
    ['Cargada por', d.condiciones.cargadaPor],
  ])

  y = seccion(doc, y, 'Ítems cotizados')
  y = tabla(
    doc,
    y,
    COLUMNAS_COTIZACION,
    d.renglones.map((r) => [
      r.descripcion,
      r.marca ?? '—',
      r.presentacion ?? '—',
      [cantidad(r.cantidad), r.unidad].filter(Boolean).join(' '),
      numero(r.precioUnitario),
      // La marca de exento va pegada al subtotal y no en columna propia: es una
      // nota de dos renglones de cada diez, y una columna para eso se lleva
      // ancho de la descripción todas las veces.
      `${numero(r.subtotal)}${r.exento ? ' (E)' : ''}`,
    ]),
    `TOTAL   ${conMoneda(d.moneda, d.total)}`,
  )

  const desglose: Array<[string, string | null]> = [
    ['Subtotal', conMoneda(d.moneda, d.subtotal)],
  ]
  if (Number(d.descuento) > 0) desglose.push(['Descuento', conMoneda(d.moneda, d.descuento)])
  if (Number(d.flete) > 0) desglose.push(['Flete', conMoneda(d.moneda, d.flete)])
  desglose.push([`IVA ${numero(d.alicuota)}%`, conMoneda(d.moneda, d.iva)])
  y = etiquetaValor(doc, y, desglose, { columnas: 1 })

  if (d.renglones.some((r) => r.exento)) {
    doc.setFont('helvetica', 'normal').setFontSize(7.5)
    doc.text('(E) Renglón exento de IVA.', 30, y)
    y += 5
  }

  if (d.observaciones) {
    y = seccion(doc, y, 'Notas / observaciones')
    doc.setFont('helvetica', 'normal').setFontSize(9)
    const lineas = doc.splitTextToSize(d.observaciones, 150) as string[]
    doc.text(lineas, 30, y, { lineHeightFactor: 1.45 })
    y += lineas.length * 4.6 + 6
  }

  if (d.sello) marcaDeAgua(doc, d.sello)

  /*
    El pie dice de dónde salen las cifras.

    Sin esto, una hoja con nuestro membrete y el nombre del proveedor arriba se
    lee como si el proveedor la hubiera emitido. Lo que se está entregando es
    nuestra transcripción, y quien la reciba tiene que saberlo antes de usarla
    para decidir.
  */
  pieDePagina(
    doc,
    [
      'Transcripción de la oferta recibida · el papel del proveedor es el que vale',
      d.refPedido,
      d.tasa ? `Tasa BCV ${numero(d.tasa)} Bs/$` : null,
      fechaLarga(d.momento),
    ]
      .filter(Boolean)
      .join(' · '),
  )
  doc.setProperties({ title: `Cotización ${d.numero} — ${d.proveedor.nombre}` })

  return {
    blob: doc.output('blob'),
    nombre: `cotizacion-${d.numero.toLowerCase()}.pdf`,
  }
}
