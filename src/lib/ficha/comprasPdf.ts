import { logoComoImagen } from '@/lib/ficha/logo'
import { ABAJO, ARRIBA } from '@/lib/ficha/hoja'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import {
  membrete,
  lineaEmpresa,
  dosPartes,
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

    - LAS COLUMNAS «MARCA / MODELO» Y «SUBCATEGORÍA» no van. El modelo las
      lleva y las imprime vacías —«—» en las dos— porque tampoco las tiene.
      Nosotros no guardamos esos datos, así que serían dos columnas siempre en
      blanco quitándole ancho a la descripción, que es lo único que no se
      puede abreviar sin dejar de reconocer lo que se pidió. Si hacen falta de
      verdad, primero hay que poder guardarlas.
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
  { titulo: 'Descripción', ancho: 48 },
  { titulo: 'Categoría', ancho: 20 },
  { titulo: 'Cantidad', ancho: 14, alDerecha: true },
  { titulo: 'Unidad', ancho: 10 },
  { titulo: 'Precio unit.', ancho: 19, alDerecha: true },
  { titulo: 'Subtotal', ancho: 19, alDerecha: true },
]

export async function armarOrdenDeCompra(d: DatosOrdenCompra): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const logo = await logoComoImagen()

  let y = membrete(doc, logo, {
    titulo: 'ORDEN DE COMPRA',
    subtitulo: `N° ${d.numero}  ·  Ref. pedido: ${d.refPedido}`,
    derecha: `Emitida: ${d.emitida}`,
  })

  y = dosPartes(
    doc,
    y,
    [d.empresa.razonSocial, `RIF ${d.empresa.rif}`, d.empresa.actividad ?? 'Sistema administrativo'],
    {
      rotulo: 'PROVEEDOR',
      lineas: [
        d.proveedor.nombre,
        `RIF: ${d.proveedor.rif}`,
        d.proveedor.telefono ?? '',
        d.proveedor.direccion ?? '',
      ].filter(Boolean),
    },
  )

  y = seccion(doc, y, 'Condiciones')
  y = etiquetaValor(doc, y, [
    ['Unidad solicitante', d.condiciones.unidadSolicitante],
    ['Solicitante', d.condiciones.solicitante],
    ['Fecha de solicitud', d.condiciones.fechaSolicitud],
    ['Finalidad', d.condiciones.finalidad],
    ['Notas', d.condiciones.notas],
    ['Clasificación', d.condiciones.clasificacion],
    ['Fecha de entrega prometida', d.condiciones.entregaPrometida],
    ['Condiciones de pago', d.condiciones.condicionPago],
    ['Documentos', d.condiciones.documentos],
    ['Aprobada por (analista)', d.condiciones.aprobadaPor],
    ['Aprobada el', d.condiciones.aprobadaEl],
    ['OC confirmada por (gerente)', d.condiciones.confirmadaPor],
    ['OC confirmada el', d.condiciones.confirmadaEl],
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
      cantidad(r.cantidad),
      r.unidad,
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
    y = etiquetaValor(doc, y, desglose)
  }

  if (d.observaciones) {
    y = seccion(doc, y, 'Notas / observaciones')
    doc.setFont('helvetica', 'normal').setFontSize(9)
    const lineas = doc.splitTextToSize(d.observaciones, 150) as string[]
    doc.text(lineas, 30, y, { lineHeightFactor: 1.45 })
    y += lineas.length * 4.6 + 6
  }

  if (d.sello) marcaDeAgua(doc, d.sello)

  // Las firmas van enteras o en su propia hoja: una raya partida entre dos
  // páginas no la firma nadie.
  if (y > ABAJO - 34) {
    doc.addPage()
    y = ARRIBA
  }
  // Una sola firma, la de quien autoriza. La raya de «recibido por el
  // proveedor» salió en blanco en todas las órdenes emitidas: la orden se manda
  // por correo, no se le pone delante al proveedor para que la firme.
  firmaCentrada(doc, Math.max(y + 18, ABAJO - 26), {
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
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const logo = await logoComoImagen()

  let y = membrete(doc, logo, {
    titulo: 'COMPROBANTE DE PAGO',
    subtitulo: `${d.ordenNumero}  ·  ${d.fechaPago}`,
    derecha: `Generado: ${fechaLarga(d.momento)}`,
  })

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
