/**
 * Los papeles con los que la empresa trata con alguien de fuera.
 *
 * Son cuatro —cotización, nota de entrega, factura y orden de compra— y se
 * arman con el mismo archivo a propósito. No es ahorro de código: es que los tres dicen lo mismo
 * en distinto momento, y si se maquetaran por separado acabarían diciéndolo
 * distinto. Quien recibe una cotización, después una nota y al final una
 * factura tiene que poder poner los papeles uno al lado del otro y reconocer
 * que son de la misma empresa y del mismo negocio. Y el proveedor que recibe
 * una orden de compra, lo mismo.
 *
 * Lo que cambia entre ellos:
 *
 *   - EL RÓTULO Y EL COLOR de la banda. La factura va en azul de la casa, la
 *     nota de entrega en naranja de seguridad —es un papel de patio, se lee con
 *     guantes— y la cotización en gris, porque todavía no compromete a nadie.
 *
 *   - LO QUE SE IMPRIME DEBAJO DEL NÚMERO. La factura lleva su número de
 *     control fiscal y su fecha de vencimiento; la nota, el vehículo, el chofer
 *     y el peso de la romana; la cotización, hasta cuándo vale.
 *
 *   - EL PIE. La factura advierte que la retención de IVA la declara el
 *     comprador; la nota, que no es documento fiscal y que hay que firmar el
 *     recibido; la cotización, que los precios cambian con la tasa.
 *
 * TRES CENTÍMETROS DE MARGEN por los cuatro lados, como todo lo que sale de
 * aquí: viene de `hoja.ts` y no se decide en este archivo.
 *
 * LA TABLA SE PARTE EN VARIAS HOJAS. Una factura que junta la semana de un
 * cliente puede llevar veinte renglones, y con 237 mm de alto útil no caben.
 * Cada hoja repite el encabezado de columnas y numera "página 2 de 3": una
 * factura suelta sin ese rótulo no se sabe si está completa.
 */

import { logoComoImagen } from './logo'
import { ABAJO, ajustar, ANCHO_UTIL, ARRIBA, CENTRO, DER, IZQ, PIE } from './hoja'
import { EMPRESA } from '@/lib/empresa'
import {
  type EmpresaPapel,
  FILA_ALTERNA,
  GRIS,
  GRIS_SUAVE,
  HAIRLINE,
  membrete,
  ROTULO,
  TINTA,
  tituloDocumento,
} from './papel'
import type { PdfArmado } from './reciboPdf'

// El primario de la marca. Antes era el azul de «La Cantera».
/*
  El naranja de la nota de entrega es el único color propio que queda.

  Los demás documentos toman el azul pizarra de la casa. La nota no: es el papel
  que el chofer lleva encima por el patio, y en un fajo mezclado el color es lo
  que la separa de una factura sin leer ninguna. Antes eso era una banda llena
  de arriba abajo; ahora tiñe el rótulo del documento y la banda de las hojas
  siguientes, que es donde hace falta.
*/
const NARANJA = '#C2500A'

type Doc = import('jspdf').jsPDF

/*
  Ya no hay 'ORDEN'.

  Este archivo sabía armar una orden de compra desde antes de que compras
  tuviera la suya. Hoy la arma `comprasPdf.ts`, que además ya usa el membrete
  compartido, y ninguna pantalla pedía 'ORDEN' aquí —se comprobó buscándolo en
  todo el front—. Lo que quedaba era un rótulo, un pie, dos rótulos de firma y
  una etiqueta «Proveedor» que nadie iba a ver nunca, y que al leer el archivo
  hacían pensar que ventas y compras comparten papel. No lo comparten.
*/
export type TipoDocumento = 'COTIZACION' | 'NOTA' | 'FACTURA'

export interface RenglonImpreso {
  descripcion: string
  cantidad: string | number
  unidad: string
  precio_unitario: string | number
  subtotal: string | number
  exento_iva?: boolean
}

export interface DatosDocumento {
  tipo: TipoDocumento
  numero: string
  fecha: string

  /** Solo la factura. Es el correlativo fiscal. */
  numeroControl?: string | null
  /** Factura: cuándo vence. Cotización: hasta cuándo vale. */
  vigencia?: { rotulo: string; fecha: string } | null
  condicionPago?: string | null

  /**
   * El de enfrente: el cliente en una venta, el proveedor en una orden.
   *
   * Se llama así y no `cliente` porque una orden de compra con el proveedor
   * metido en un campo llamado «cliente» es de las cosas que confunden a quien
   * lea esto dentro de un año.
   */
  contraparte: {
    nombre: string
    rif: string
    direccion?: string | null
    telefono?: string | null
  }

  /** Solo la nota de entrega. */
  despacho?: {
    vehiculo?: string | null
    chofer?: string | null
    cedulaChofer?: string | null
    ticket?: string | null
    pesoNeto?: string | null
  } | null

  moneda: string
  tasa: string | number
  renglones: RenglonImpreso[]

  subtotal: string | number
  descuento: string | number
  flete: string | number
  /**
   * La que calculó la base, no una que se eche aquí.
   *
   * `private.recalcular_venta` la reparte: al gravado le quita el descuento en
   * la proporción que le toca y le suma el flete en esa misma proporción. Echar
   * esa cuenta otra vez en el navegador sería tener dos versiones de la misma
   * verdad, y la que vale es la de Postgres.
   */
  baseImponible?: string | number | null
  iva: string | number
  alicuotaIva: string | number
  total: string | number
  /** Solo la factura, y solo si el cliente es contribuyente especial. */
  retencionIva?: string | number | null

  observacion?: string | null
  /** Marca de agua: ANULADA, o nada. */
  sello?: string | null

  empresa: EmpresaPapel

  emitidoPor: string
}

const ROTULOS: Record<
  TipoDocumento,
  { titulo: string; color: string; archivo: string; numero: string }
> = {
  COTIZACION: {
    titulo: 'COTIZACIÓN',
    color: ROTULO,
    archivo: 'cotizacion',
    numero: 'N° COTIZACIÓN',
  },
  NOTA: { titulo: 'NOTA DE ENTREGA', color: NARANJA, archivo: 'nota-entrega', numero: 'N° NOTA' },
  FACTURA: { titulo: 'FACTURA', color: ROTULO, archivo: 'factura', numero: 'N° FACTURA' },
}

const PIES: Record<TipoDocumento, string> = {
  COTIZACION:
    'Los precios están expresados con la tasa del día indicada arriba y se ajustan al momento de facturar. Esta cotización no compromete existencias.',
  NOTA: 'ESTE DOCUMENTO NO ES UNA FACTURA. Ampara el traslado del material; la factura se emite aparte. Quien recibe firma conforme el material y el peso.',
  FACTURA:
    'La retención del IVA, cuando aplica, la declara y entera el comprador. Original: cliente. Copia: archivo.',
}

const decimal2 = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const numero = (v: string | number | null | undefined): string =>
  decimal2.format(typeof v === 'number' ? v : Number(v ?? 0))

const conSimbolo = (moneda: string, v: string | number | null | undefined): string =>
  `${moneda === 'VES' ? 'Bs' : '$'} ${numero(v)}`

const fechaCorta = (iso: string): string =>
  new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(`${iso.slice(0, 10)}T12:00:00`),
  )

// ---------------------------------------------------------------------------
// Las columnas de la tabla
//
// Se reparten los 150 mm útiles. Las cifras van alineadas a la derecha, así que
// cada una necesita por delante el hueco de su número más largo: una cantidad
// de seis dígitos o un total en bolívares ocupan mucho más que el rótulo de la
// cabecera, y si se reparte el ancho mirando los rótulos, la primera factura
// con cifras grandes escribe una columna encima de la otra.
//
// ANCHO_DESCRIPCION es lo que queda antes de que empiece la cantidad más
// larga que cabe, no lo que queda hasta la columna. Con el reparto anterior la
// descripción llegaba hasta el número y salía «PIEDRA PICADA N.º 1 DE
// GRANULOMETRIA CONT32,50», que en una factura es un renglón ilegible.
// ---------------------------------------------------------------------------
const COL_CANT = IZQ + 86
const COL_UNID = IZQ + 100
const COL_PREC = IZQ + 124
const COL_TOTAL = DER
const ANCHO_DESCRIPCION = 68

/**
 * El recuadro del cliente y, en la nota, el del camión.
 *
 * LA DIRECCIÓN DEL COMPRADOR VA COMPLETA, en dos renglones si hace falta. Una
 * factura sin la dirección del cliente está mal emitida, y una con la dirección
 * cortada a mitad de palabra —«EDIFICIO SEDE ADMINISTRATIVA, P…»— no está mejor
 * emitida: dice menos que ninguna y encima parece completa.
 */
function encabezadoCliente(doc: Doc, d: DatosDocumento, y: number): number {
  const etiqueta = (texto: string, x: number, fila: number) => {
    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(GRIS)
    doc.text(texto.toUpperCase(), x, fila)
  }
  const valor = (texto: string, x: number, fila: number, ancho: number) => {
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(TINTA)
    doc.text(ajustar(doc, texto || '—', ancho), x, fila)
  }

  const x1 = IZQ + 4
  const x2 = IZQ + 96
  const ANCHO_1 = 88
  const RENGLON = 3.6

  // Se mide antes de pintar el fondo: el alto de la caja sale de cuántos
  // renglones ocupan el nombre y la dirección, no al revés. Una razón social
  // venezolana completa —«INVERSIONES Y CONSTRUCCIONES METALURGICAS DEL
  // CARONI, C.A.»— no cabe en un renglón de 88 mm, y recortarla con puntos
  // suspensivos en una factura es escribir mal el nombre del comprador.
  doc.setFont('helvetica', 'bold').setFontSize(8)
  const nombre = (doc.splitTextToSize(d.contraparte.nombre, ANCHO_1) as string[]).slice(0, 2)
  const direccion = (
    doc.splitTextToSize(d.contraparte.direccion ?? '—', ANCHO_1) as string[]
  ).slice(0, 3)

  const yDireccion = 14.5 + (nombre.length - 1) * RENGLON
  const altoDatos = yDireccion + 4.5 + (direccion.length - 1) * RENGLON + 3
  const alto = altoDatos + (d.despacho ? 14 : 0)

  doc.setFillColor(FILA_ALTERNA)
  doc.rect(IZQ, y, ANCHO_UTIL, alto, 'F')

  const parrafo = (lineas: string[], x: number, fila: number) => {
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(TINTA)
    doc.text(lineas, x, fila, { lineHeightFactor: 1.45 })
  }

  etiqueta('Cliente', x1, y + 5)
  parrafo(nombre, x1, y + 9.5)

  etiqueta('RIF', x2, y + 5)
  valor(d.contraparte.rif, x2, y + 9.5, 50)

  etiqueta('Dirección', x1, y + yDireccion)
  parrafo(direccion, x1, y + yDireccion + 4.5)

  etiqueta(d.condicionPago ? 'Condición' : 'Teléfono', x2, y + 14.5)
  valor(d.condicionPago ?? d.contraparte.telefono ?? '', x2, y + 19, 50)

  if (d.despacho) {
    doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
    doc.line(IZQ + 4, y + altoDatos, DER - 4, y + altoDatos)

    // Las cuatro columnas no miden lo mismo porque lo que llevan tampoco: una
    // placa son siete caracteres y el nombre de un chofer, treinta. Repartido
    // en cuartos, el chofer salía como «JOSE GREGORIO RO…», que es justo el
    // dato por el que se pregunta cuando hay que llamar al camión.
    const trozos = [
      ['Vehículo', d.despacho.vehiculo, 24],
      ['Chofer', d.despacho.chofer, 50],
      ['Cédula', d.despacho.cedulaChofer, 28],
      ['Ticket · peso neto', [d.despacho.ticket, d.despacho.pesoNeto].filter(Boolean).join(' · '), 40],
    ] as const

    let x = IZQ + 4
    for (const [rot, val, ancho] of trozos) {
      etiqueta(rot, x, y + altoDatos + 4)
      valor(val ?? '', x, y + altoDatos + 7.5, ancho - 3)
      x += ancho
    }
  }

  return y + alto + 6
}

function cabeceraTabla(doc: Doc, y: number): number {
  doc.setFillColor(TINTA)
  doc.rect(IZQ, y, ANCHO_UTIL, 6.5, 'F')

  doc.setTextColor('#FFFFFF').setFont('helvetica', 'bold').setFontSize(7)
  doc.text('DESCRIPCIÓN', IZQ + 3, y + 4.4)
  doc.text('CANTIDAD', COL_CANT, y + 4.4, { align: 'right' })
  doc.text('UNIDAD', COL_UNID, y + 4.4, { align: 'right' })
  doc.text('PRECIO', COL_PREC, y + 4.4, { align: 'right' })
  doc.text('TOTAL', COL_TOTAL - 3, y + 4.4, { align: 'right' })

  return y + 6.5
}

function pie(doc: Doc, d: DatosDocumento, pagina: number, de: number) {
  doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
  doc.line(IZQ, PIE - 8, DER, PIE - 8)

  doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(6.5)
  const lineas = doc.splitTextToSize(PIES[d.tipo], ANCHO_UTIL - 30) as string[]
  doc.text(lineas.slice(0, 2), IZQ, PIE - 4.5)

  doc.text(`Página ${pagina} de ${de}`, DER, PIE - 4.5, { align: 'right' })
  doc.text(`Emitido por ${d.emitidoPor} · ${EMPRESA.marca}`, IZQ, PIE)
  doc.setTextColor(GRIS_SUAVE)
  doc.text(`Tasa del día: ${numero(d.tasa)} Bs/$`, DER, PIE, { align: 'right' })
}

/** ANULADA, cruzada sobre la hoja. Un papel anulado tiene que verse anulado. */
function sello(doc: Doc, texto: string) {
  doc.saveGraphicsState()
  // @ts-expect-error jsPDF expone GState por el objeto global, sin tipo propio.
  doc.setGState(new doc.GState({ opacity: 0.14 }))
  doc.setTextColor('#DE3B40').setFont('helvetica', 'bold').setFontSize(64)
  doc.text(texto, CENTRO, 165, { align: 'center', angle: 28 })
  doc.restoreGraphicsState()
}

/**
 * Los totales.
 *
 * Devuelve el alto que ocupa para poder decidir, antes de empezar a pintar
 * renglones en una hoja, si el bloque cabe debajo o hay que abrir otra.
 */
/*
  LO QUE QUEDÓ FUERA DEL IMPUESTO, QUE NO ES LO MISMO QUE LOS RENGLONES EXENTOS.

  Lo primero que se probó fue sumar los renglones que llevan su (E). Es lo que
  se espera, y está mal en cuanto hay flete o descuento: la base los reparte
  entre lo gravado y lo exento en la proporción que les toca, así que una parte
  del flete tampoco pagó impuesto. Con un flete de 120 sobre esta factura, esa
  parte son 13,89, y la columna no cuadraba por ahí.

  Una factura tiene que poder sumarse con el dedo. Así que lo exento se saca
  como lo que es: lo que queda del total una vez fuera el impuesto y la base
  sobre la que se calculó.

      exento = total - IVA - base imponible

  Cuando no llega base imponible no hay nada que reconciliar y se cae a la suma
  de los renglones, que es lo único que se puede decir con lo que hay.
*/
function totalExento(d: DatosDocumento): number {
  if (d.baseImponible != null) {
    const resto = Number(d.total) - Number(d.iva) - Number(d.baseImponible)
    // Las milésimas de redondeo no son un exento: por debajo de un céntimo, cero.
    return resto > 0.005 ? resto : 0
  }
  return d.renglones
    .filter((r) => r.exento_iva)
    .reduce((s, r) => s + Number(r.subtotal ?? 0), 0)
}

function altoTotales(d: DatosDocumento): number {
  const filas =
    3 + // subtotal, IVA, total
    (Number(d.descuento) > 0 ? 1 : 0) +
    (Number(d.flete) > 0 ? 1 : 0) +
    (totalExento(d) > 0 ? 1 : 0) +
    (d.baseImponible != null ? 1 : 0) +
    (Number(d.retencionIva ?? 0) > 0 ? 2 : 0)
  return filas * 5 + 10
}

function totales(doc: Doc, d: DatosDocumento, y: number): number {
  const x = IZQ + ANCHO_UTIL * 0.55
  let fila = y + 4

  const linea = (rotulo: string, valor: string, fuerte = false) => {
    doc.setFont('helvetica', fuerte ? 'bold' : 'normal').setFontSize(fuerte ? 9 : 8)
    doc.setTextColor(fuerte ? TINTA : GRIS)
    doc.text(rotulo, x, fila)
    doc.setTextColor(TINTA)
    doc.text(valor, DER - 3, fila, { align: 'right' })
    fila += 5
  }

  linea('Subtotal', conSimbolo(d.moneda, d.subtotal))
  // Guion normal y no el «menos» matemático (−). Helvetica dentro del PDF usa
  // la codificación WinAnsi, que no lo tiene: salía dibujado como una comilla
  // y, peor, descuadraba el cálculo del ancho, con lo que la cifra alineada a
  // la derecha se iba 4 mm fuera del margen. Medido, no supuesto.
  if (Number(d.descuento) > 0) linea('Descuento', `- ${conSimbolo(d.moneda, d.descuento)}`)
  if (Number(d.flete) > 0) linea('Flete', conSimbolo(d.moneda, d.flete))

  /*
    LO EXENTO Y LA BASE, QUE ES LO QUE MIRA UN FISCAL.

    Una factura venezolana tiene que decir sobre qué se calculó el impuesto, y
    hasta ahora este papel enseñaba el IVA sin enseñar de dónde salía: quien lo
    recibía no podía comprobar la cuenta.

    El exento se suma de los renglones que llevan su (E). La base viene
    calculada de la base de datos, que es donde se decide cómo entra el flete y
    cómo se reparte el descuento — aquí no se calcula ninguna de las dos.

    Cada una sale solo si tiene sentido: sin renglones exentos no se enseña un
    cero, que en una factura se lee como una afirmación.
  */
  const exento = totalExento(d)
  if (exento > 0) linea('Total exento', conSimbolo(d.moneda, exento))
  if (d.baseImponible != null) linea('Base imponible', conSimbolo(d.moneda, d.baseImponible))

  // «IVA 16%», no «IVA 16,00%»: dos decimales en una alícuota entera solo
  // ocupan sitio. Los lleva cuando de verdad los tiene.
  const alicuota = Number(d.alicuotaIva)
  linea(
    `IVA ${Number.isInteger(alicuota) ? alicuota : numero(alicuota)}%`,
    conSimbolo(d.moneda, d.iva),
  )

  doc.setDrawColor(TINTA).setLineWidth(0.4)
  doc.line(x, fila - 3.5, DER - 3, fila - 3.5)
  fila += 1

  linea('TOTAL', conSimbolo(d.moneda, d.total), true)

  if (Number(d.retencionIva ?? 0) > 0) {
    doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
    doc.line(x, fila - 3.5, DER - 3, fila - 3.5)
    fila += 1
    linea('IVA retenido por el cliente', `- ${conSimbolo(d.moneda, d.retencionIva)}`)
    linea(
      'A pagar',
      conSimbolo(d.moneda, Number(d.total) - Number(d.retencionIva ?? 0)),
      true,
    )
  }

  // El equivalente en la otra moneda, siempre. Es la primera pregunta que hace
  // quien recibe el papel, y responderla con una calculadora se presta a error.
  doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(GRIS)
  const otra =
    d.moneda === 'VES'
      ? `Equivale a $ ${numero(Number(d.total) / Number(d.tasa || 1))}`
      : `Equivale a Bs ${numero(Number(d.total) * Number(d.tasa || 1))}`
  doc.text(otra, DER - 3, fila, { align: 'right' })

  return fila + 4
}

function firmas(doc: Doc, d: DatosDocumento, y: number) {
  const izquierda = d.tipo === 'NOTA' ? 'Entregado por' : 'Por la empresa'
  const derecha = d.tipo === 'NOTA' ? 'Recibido conforme' : 'Aceptado por el cliente'

  const SEPARA = 20
  const ancho = (ANCHO_UTIL - SEPARA) / 2

  for (const [i, texto] of [izquierda, derecha].entries()) {
    const x = IZQ + i * (ancho + SEPARA)
    doc.setDrawColor(TINTA).setLineWidth(0.4)
    doc.line(x, y, x + ancho, y)

    doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(7)
    doc.text(texto, x + ancho / 2, y + 4, { align: 'center' })
    doc.text('Nombre, cédula y fecha', x + ancho / 2, y + 8, { align: 'center' })
  }
}

export async function armarDocumento(d: DatosDocumento): Promise<PdfArmado> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  // El logo de la empresa. Se carga una vez y se reutiliza en cada hoja.
  const logo = await logoComoImagen()

  // Cuánto ocupa el cierre —totales, firmas y observación— para saber si cabe
  // detrás del último renglón o necesita hoja propia.
  const cierre = altoTotales(d) + 22 + (d.observacion ? 10 : 0)
  const topeTabla = ABAJO - 14

  // El encabezado de la primera hoja se pinta antes de repartir los renglones
  // porque su alto no es fijo: depende de si el domicilio del cliente ocupa uno
  // o dos renglones y de si el documento lleva los datos del camión. Calcularlo
  // con números escritos a mano aquí funcionaba hasta el primer cliente con
  // dirección larga, y entonces la tabla se salía por abajo sin avisar.
  /*
    LA CABECERA ES LA DE LA CASA, la misma que la orden de compra y el recibo.

    Antes era una banda de color llena de 27 mm con todo el texto en blanco
    encima. Se cambió por el membrete compartido: la razón social en rojo
    ladrillo sobre papel, el RIF, el domicilio fiscal entero y una regla. Del
    color se queda lo que decía algo —el rótulo del documento y la banda de las
    hojas siguientes—, y se va lo que solo era fondo.

    El alto ya no es fijo, y no puede serlo: crece con el domicilio de la
    empresa y con la dirección del cliente. Por eso el reparto de renglones
    arranca de lo que devuelven las dos funciones y no de un número escrito
    aquí, que es lo que hacía que la tabla se saliera por abajo sin avisar en
    cuanto llegaba un cliente con dirección larga.
  */
  const rotulo = ROTULOS[d.tipo]
  const cabecera = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      [rotulo.numero, d.numero],
      ['FECHA', fechaCorta(d.fecha)],
      ...(d.vigencia
        ? ([[d.vigencia.rotulo.toUpperCase(), fechaCorta(d.vigencia.fecha)]] as Array<
            [string, string]
          >)
        : []),
      ...(d.numeroControl
        ? ([['N° DE CONTROL', d.numeroControl]] as Array<[string, string]>)
        : []),
    ],
  })

  const yPrimera = encabezadoCliente(
    doc,
    d,
    tituloDocumento(doc, cabecera, rotulo.titulo, rotulo.color),
  )

  // Ahora sí se reparten las hojas, sin pintar: hace falta saber cuántas son
  // para poder escribir "página 1 de 3" ya en la primera.
  const hojas: RenglonImpreso[][] = []
  {
    let y = yPrimera + 6.5
    let actual: RenglonImpreso[] = []

    for (const r of d.renglones) {
      if (y + 6 > topeTabla) {
        hojas.push(actual)
        actual = []
        y = ARRIBA + 12 + 6.5
      }
      actual.push(r)
      y += 6
    }
    hojas.push(actual)

    // Si el cierre no cabe debajo de la última tanda, se va a una hoja más.
    if (y + cierre > ABAJO) hojas.push([])
  }

  for (const [indice, renglones] of hojas.entries()) {
    if (indice > 0) doc.addPage()

    let y: number

    if (indice === 0) {
      y = yPrimera
    } else {
      // Las hojas siguientes llevan una banda fina: quien tiene la hoja 3 en la
      // mano tiene que saber de qué documento es sin buscar la primera.
      doc.setFillColor(rotulo.color)
      doc.rect(IZQ, ARRIBA, ANCHO_UTIL, 9, 'F')
      // Mirando si hay logo, como hace el membrete. `logoComoImagen` devuelve
      // cadena vacía cuando no puede cargar la imagen, y `addImage('')` no
      // dibuja nada: se lanza. Una factura de tres hojas se quedaba sin
      // generar entera —ni PDF, ni aviso— porque no cargó un logo de 6 mm.
      if (logo) doc.addImage(logo, 'PNG', IZQ + 3, ARRIBA + 1.5, 6, 6)
      doc.setTextColor('#FFFFFF').setFont('helvetica', 'bold').setFontSize(8)
      doc.text(`${rotulo.titulo} ${d.numero}`, IZQ + 12, ARRIBA + 6)
      doc.setFont('helvetica', 'normal').setFontSize(7)
      doc.text(ajustar(doc, d.contraparte.nombre, 60), DER - 3, ARRIBA + 6, { align: 'right' })
      y = ARRIBA + 12
    }

    y = cabeceraTabla(doc, y)

    for (const [i, r] of renglones.entries()) {
      if (i % 2 === 1) {
        doc.setFillColor(FILA_ALTERNA)
        doc.rect(IZQ, y, ANCHO_UTIL, 6, 'F')
      }

      doc.setTextColor(TINTA).setFont('helvetica', 'normal').setFontSize(8)
      const descripcion = ajustar(doc, r.descripcion, ANCHO_DESCRIPCION)
      doc.text(descripcion, IZQ + 3, y + 4.2)
      // Se mide a los ocho puntos con los que se pintó, no a los seis y medio
      // de la marca: midiéndolo después de bajar el cuerpo, el «(E)» caía
      // encima de la última letra —«FLETE HASTA OBR(E)»—.
      const finDescripcion = IZQ + 3 + doc.getTextWidth(descripcion)

      /*
        UN RENGLÓN EXENTO TIENE QUE VERSE EXENTO.

        `exento_iva` llegaba hasta aquí desde las tres pantallas y no se leía en
        ninguna parte: quien marcaba un renglón como exento veía salir un papel
        idéntico al de un renglón gravado. La marca es de una letra, pegada a la
        descripción, y abajo se explica.

        Falta lo otro: los totales siguen sin decir la base imponible ni el
        total exento, y con una sola alícuota no se puede expresar una factura
        mixta. Eso ya no es maquetación —cambia el cálculo y hay que acordar con
        la líder cómo entra el flete— y va aparte.
      */
      if (r.exento_iva) {
        doc.setTextColor(GRIS).setFontSize(6.5)
        doc.text('(E)', finDescripcion + 1.2, y + 4.2)
        doc.setTextColor(TINTA).setFontSize(8)
      }

      doc.text(numero(r.cantidad), COL_CANT, y + 4.2, { align: 'right' })

      doc.setTextColor(GRIS).setFontSize(7)
      doc.text(r.unidad, COL_UNID, y + 4.2, { align: 'right' })

      doc.setTextColor(TINTA).setFontSize(8)
      doc.text(numero(r.precio_unitario), COL_PREC, y + 4.2, { align: 'right' })
      doc.setFont('helvetica', 'bold')
      doc.text(numero(r.subtotal), COL_TOTAL - 3, y + 4.2, { align: 'right' })

      y += 6
    }

    doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
    doc.line(IZQ, y, DER, y)

    if (indice === hojas.length - 1) {
      // La marca (E) no se explica sola, y una letra suelta en un papel fiscal
      // que nadie sabe leer es peor que no ponerla.
      if (d.renglones.some((r) => r.exento_iva)) {
        doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(6.5)
        doc.text('(E) Renglón exento de IVA.', IZQ, y + 3.5)
      }

      if (d.observacion) {
        doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(7)
        doc.text(
          ajustar(doc, `Observación: ${d.observacion}`, ANCHO_UTIL * 0.5),
          IZQ,
          d.renglones.some((r) => r.exento_iva) ? y + 8 : y + 6,
        )
      }

      const finTotales = totales(doc, d, y)
      firmas(doc, d, Math.min(Math.max(finTotales + 10, ABAJO - 26), ABAJO - 14))
    }

    if (d.sello) sello(doc, d.sello)

    pie(doc, d, indice + 1, hojas.length)
  }

  doc.setProperties({
    title: `${ROTULOS[d.tipo].titulo} ${d.numero} — ${d.contraparte.nombre}`,
    subject: ROTULOS[d.tipo].titulo,
    author: d.empresa.razonSocial,
  })

  return {
    blob: doc.output('blob'),
    nombre: `${ROTULOS[d.tipo].archivo}-${d.numero.toLowerCase()}.pdf`,
  }
}
