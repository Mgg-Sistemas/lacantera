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
 *   - EL RÓTULO Y EL COLOR de la banda. La factura va en el marrón de la casa, la
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
import { dinero, esCedula } from '@/lib/formato'
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

  Los demás documentos toman el marrón de rótulo de la casa. La nota no: es el papel
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
  /**
   * A qué precio salió y cómo se midió, cuando no es lo normal: «20 % de
   * descuento sobre 12,00», «sin cargo: …», «estimado con 1,44 t/m³». Va en una
   * segunda línea gris a todo lo ancho. Un 0,00 sin explicación en un papel
   * fiscal obliga a llamar a alguien para saber si fue un regalo o un error.
   */
  detalle?: string | null
  cantidad: string | number
  unidad: string
  /**
   * La misma cantidad en la otra medida, ya escrita: «40,32 TON». La resuelve
   * la pantalla, que sabe si el renglón se pesó al despachar o si sale de la
   * densidad. Nulo si no se puede saber: en la columna sale «—».
   */
  conversion?: string | null
  precio_unitario: string | number
  subtotal: string | number
  exento_iva?: boolean
}

/** Lo que crece un renglón por cada línea de más, de descripción o de detalle. */
const LINEA_DE_MAS = 3.4

/** Seis milímetros un renglón, más una línea por la segunda de descripción y otra por el detalle. */
const altoRenglon = (lineas: number, r: RenglonImpreso) =>
  6 + (lineas - 1) * LINEA_DE_MAS + (r.detalle ? 3 : 0)

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
    /**
     * Cuando la nota lleva varios camiones, uno por fila. Si viene con algo,
     * manda sobre los cuatro de arriba, que son el camión único de siempre.
     */
    camiones?: {
      vehiculo?: string | null
      chofer?: string | null
      cedulaChofer?: string | null
      ticket?: string | null
      pesoNeto?: string | null
    }[]
  } | null

  moneda: string
  /** Bolívares por una unidad de la moneda del documento: por euro si va en euros. */
  tasa: string | number
  /**
   * Bolívares por dólar, congelada con el documento.
   *
   * Hace falta aparte de `tasa`: un documento en bolívares tiene `tasa` 1 y su
   * equivalente en dólares sale de esta. Hasta el 15/09/2026 las pantallas
   * pasaban esta como `tasa`, y en euros o USDT el equivalente en bolívares
   * salía multiplicado por la tasa del dólar.
   */
  tasaUsd?: string | number | null
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
  /** El IGTF, si lo lleva. Sin él no hay línea. */
  alicuotaIgtf?: string | number | null
  igtf?: string | number | null
  total: string | number
  /** Solo la factura, y solo si el cliente es contribuyente especial. */
  retencionIva?: string | number | null

  observacion?: string | null
  /**
   * Con qué densidad se convirtió cada material, para debajo de la tabla. Solo
   * se imprime si el papel lleva la columna de conversión.
   */
  notaConversion?: string | null
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
  // Sin leyenda: «en la nota de entrega únicamente dejemos el total; cualquier
  // otra nota no debe ir» (Christopher, 17/09/2026).
  NOTA: '',
  FACTURA:
    'La retención del IVA, cuando aplica, la declara y entera el comprador. Original: cliente. Copia: archivo.',
}

const decimal2 = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const numero = (v: string | number | null | undefined): string =>
  decimal2.format(typeof v === 'number' ? v : Number(v ?? 0))

/*
  EL SIMBOLO LO DECIDE `dinero()`, NO ESTE ARCHIVO.

  Aqui vivia `moneda === 'VES' ? 'Bs' : '$'`, que es exactamente la regla que
  `lib/formato` abandono cuando entro el USDT: hoy hay cuatro monedas activas
  —EUR, USD, USDT y VES— y con esa regla una factura en euros se imprime «$».

  En pantalla eso ya se arreglo; en el papel no, porque este archivo tiene su
  propia copia de todo. Y el papel es el que ve el cliente.
*/
const conSimbolo = (moneda: string, v: string | number | null | undefined): string =>
  dinero(moneda, v ?? 0)

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
//
// Y HAY DOS REPARTOS. Christopher, 16/09/2026: «se desea que todo producto de
// venta se exprese en m3 y ton por igual». La otra medida iba en la línea gris
// de detalle, en letra pequeña, y así no se lee por igual. Ahora tiene columna,
// que aparece solo si algún renglón tiene con qué convertirse, como en los
// papeles de inventario. Le quita quince milímetros a la descripción, y por eso
// la descripción puede ocupar dos renglones en vez de cortarse antes.
// ---------------------------------------------------------------------------
interface Columnas {
  /** Lo que mide la descripción desde su margen. */
  descripcion: number
  cant: number
  unid: number
  /** Nulo cuando el papel no lleva conversión. */
  conv: number | null
  prec: number
  total: number
}

const SIN_CONVERSION: Columnas = {
  descripcion: 68,
  cant: IZQ + 86,
  unid: IZQ + 100,
  conv: null,
  prec: IZQ + 124,
  total: DER,
}

/*
  Medido en Helvetica a 8 puntos con las cifras más largas que se esperan:
  «12.345,67» ocupa 12,6 mm, «12.345,67 TON» 19,3 mm, un precio «123.456,78»
  14,1 mm y un total «12.345.678,90» en negrita 18 mm. Con estas marcas quedan
  al menos dos milímetros entre una columna y la siguiente.
*/
const CON_CONVERSION: Columnas = {
  descripcion: 53,
  cant: IZQ + 71,
  unid: IZQ + 83,
  conv: IZQ + 106,
  prec: IZQ + 124,
  total: DER,
}

/** Lo que dejan libre los totales a su izquierda, para las notas bajo la tabla. */
const ANCHO_NOTAS = 76

/**
 * La descripción en una o dos líneas. Una tercera ya no cabe con dignidad en un
 * renglón de factura: lo que sobra se corta con puntos suspensivos, como antes.
 */
function lineasDeDescripcion(doc: Doc, texto: string, ancho: number): string[] {
  doc.setFont('helvetica', 'normal').setFontSize(8)
  const partes = doc.splitTextToSize(texto, ancho) as string[]
  if (partes.length <= 2) return partes
  return [partes[0], ajustar(doc, partes.slice(1).join(' '), ancho)]
}

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
  // Un camión ocupa 14 mm; cada camión de más, un renglón de 5.
  const camiones = d.despacho?.camiones?.length ? d.despacho.camiones : d.despacho ? [d.despacho] : []
  const alto = altoDatos + (d.despacho ? 14 + Math.max(0, camiones.length - 1) * 5 : 0)

  doc.setFillColor(FILA_ALTERNA)
  doc.rect(IZQ, y, ANCHO_UTIL, alto, 'F')

  const parrafo = (lineas: string[], x: number, fila: number) => {
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(TINTA)
    doc.text(lineas, x, fila, { lineHeightFactor: 1.45 })
  }

  etiqueta('Cliente', x1, y + 5)
  parrafo(nombre, x1, y + 9.5)

  // Una persona sin RIF se factura con su cédula, y el papel dice cuál es.
  etiqueta(esCedula(d.contraparte.rif) ? 'Cédula' : 'RIF', x2, y + 5)
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
    // Seis milímetros que antes sobraban en «ticket · peso neto» pasan al
    // vehículo: con 24 la descripción salía «IVECO CAM…», y la placa sola no
    // dice qué camión era.
    const columnas = [
      ['Vehículo', 30],
      ['Chofer', 50],
      ['Cédula', 28],
      ['Ticket · peso neto', 34],
    ] as const

    // Las etiquetas una sola vez; debajo, un renglón por camión. Con uno solo
    // es el papel de siempre; con dos, el segundo va justo debajo del primero.
    let x = IZQ + 4
    for (const [rot, ancho] of columnas) {
      etiqueta(camiones.length > 1 && rot === 'Vehículo' ? `Vehículos (${camiones.length})` : rot, x, y + altoDatos + 4)
      x += ancho
    }
    camiones.forEach((c, i) => {
      const fila = y + altoDatos + 7.5 + i * 5
      const valores = [c.vehiculo, c.chofer, c.cedulaChofer, [c.ticket, c.pesoNeto].filter(Boolean).join(' · ')]
      let cx = IZQ + 4
      columnas.forEach(([, ancho], j) => {
        valor(valores[j] ?? '', cx, fila, ancho - 3)
        cx += ancho
      })
    })
  }

  return y + alto + 6
}

function cabeceraTabla(doc: Doc, y: number, col: Columnas): number {
  doc.setFillColor(TINTA)
  doc.rect(IZQ, y, ANCHO_UTIL, 6.5, 'F')

  doc.setTextColor('#FFFFFF').setFont('helvetica', 'bold').setFontSize(7)
  doc.text('DESCRIPCIÓN', IZQ + 3, y + 4.4)
  doc.text('CANTIDAD', col.cant, y + 4.4, { align: 'right' })
  doc.text('UNIDAD', col.unid, y + 4.4, { align: 'right' })
  if (col.conv !== null) doc.text('CONVERSIÓN', col.conv, y + 4.4, { align: 'right' })
  doc.text('PRECIO', col.prec, y + 4.4, { align: 'right' })
  doc.text('TOTAL', col.total - 3, y + 4.4, { align: 'right' })

  return y + 6.5
}

function pie(doc: Doc, d: DatosDocumento, pagina: number, de: number) {
  doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
  doc.line(IZQ, PIE - 8, DER, PIE - 8)

  /*
    LA IMPRENTA AUTORIZADA, Y SOLO EN LA FACTURA.

    Una factura venezolana lleva impreso quién la imprimió y con qué número la
    autorizó el SENIAT. Una cotización y una nota de entrega no: ponérselo sería
    darles un aire fiscal que no tienen.

    Va pegada al texto legal y no en un renglón propio debajo. Se probó ahí y
    caía 1,4 mm dentro del margen inferior, que la hoja reserva a propósito
    —`PIE` ya deja dos milímetros para el rabo de las letras—. Aquí el pie pasa
    de uno a dos renglones, que es justo lo que ya admitía.

    Si nadie ha cargado esos datos en Configuración no se imprime nada. Un
    renglón que dice «Imprenta: —» no cumple el requisito y encima parece que
    el sistema se dejó algo.
  */
  const legal =
    d.tipo === 'FACTURA' && d.empresa.imprenta
      ? `${PIES[d.tipo]} Imprenta: ${d.empresa.imprenta}.`
      : PIES[d.tipo]

  doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(6.5)
  const lineas = (doc.splitTextToSize(legal, ANCHO_UTIL - 30) as string[]).slice(0, 2)

  /*
    Con dos renglones, el bloque arranca más arriba.

    Medido: a 6,5 puntos el segundo renglón caía a 1,86 mm del de «Emitido
    por», y ahí los rabos de una «p» ya tocan las mayúsculas de abajo. Subiendo
    el arranque quedan 3,5 mm, y con un solo renglón nada cambia.
  */
  doc.text(lineas, IZQ, lineas.length > 1 ? PIE - 6.2 : PIE - 4.5)

  doc.text(`Página ${pagina} de ${de}`, DER, PIE - 4.5, { align: 'right' })
  doc.text(`Emitido por ${d.emitidoPor} · ${EMPRESA.marca}`, IZQ, PIE)
  /*
    La tasa, solo fuera de la nota de entrega: «cualquier otra nota no debe ir»
    (Christopher, 17/09/2026). Y la del dólar: en un documento en bolívares
    `tasa` es 1, y el pie decía «Tasa del día: 1,00 Bs/$».
  */
  if (d.tipo !== 'NOTA') {
    doc.setTextColor(GRIS_SUAVE)
    doc.text(`Tasa del día: ${numero(d.tasaUsd || d.tasa)} Bs/$`, DER, PIE, { align: 'right' })
  }
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
    // El IGTF también está dentro del total y no es exento: se saca igual que el IVA.
    const resto = Number(d.total) - Number(d.iva) - Number(d.igtf ?? 0) - Number(d.baseImponible)
    // Las milésimas de redondeo no son un exento: por debajo de un céntimo, cero.
    return resto > 0.005 ? resto : 0
  }
  return d.renglones
    .filter((r) => r.exento_iva)
    .reduce((s, r) => s + Number(r.subtotal ?? 0), 0)
}

/*
  LA NOTA DE ENTREGA NO MENCIONA IMPUESTOS. Christopher, 17/09/2026: «solo la
  factura tendrá mención de IVA o IGTF; las notas de entrega en su PDF literal
  deben decir NOTA DE ENTREGA». Ni la línea del IVA, ni la base, ni el exento,
  ni la marca (E) en los renglones.
*/
const mencionaImpuestos = (d: DatosDocumento) => d.tipo !== 'NOTA'

/*
  La línea del IVA. La factura la lleva siempre; la cotización, solo si quien la
  hizo marcó el IVA: «por defecto que no lleve IVA o IGTF» (Christopher,
  17/09/2026).
*/
const lineaDeIva = (d: DatosDocumento) =>
  d.tipo === 'FACTURA' || (d.tipo === 'COTIZACION' && Number(d.alicuotaIva) > 0)

const lineaDeIgtf = (d: DatosDocumento) => mencionaImpuestos(d) && Number(d.igtf ?? 0) > 0

function altoTotales(d: DatosDocumento): number {
  if (!mencionaImpuestos(d)) return 15
  const filas =
    2 + // subtotal, total
    (lineaDeIva(d) ? 1 : 0) +
    (lineaDeIgtf(d) ? 1 : 0) +
    (Number(d.descuento) > 0 ? 1 : 0) +
    (Number(d.flete) > 0 ? 1 : 0) +
    (lineaDeIva(d) && totalExento(d) > 0 ? 1 : 0) +
    (lineaDeIva(d) && d.baseImponible != null ? 1 : 0) +
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

  /*
    LA NOTA DE ENTREGA, SOLO EL TOTAL. Christopher, 17/09/2026: «en la nota de
    entrega únicamente dejemos el total; cualquier otra nota no debe ir». Sin
    subtotal, sin flete aparte y sin la equivalencia en la otra moneda.
  */
  if (!mencionaImpuestos(d)) {
    linea('TOTAL', conSimbolo(d.moneda, d.total), true)
    return fila
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
  if (lineaDeIva(d)) {
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
  }

  if (lineaDeIgtf(d)) {
    const alicuotaIgtf = Number(d.alicuotaIgtf ?? 0)
    linea(
      `IGTF ${Number.isInteger(alicuotaIgtf) ? alicuotaIgtf : numero(alicuotaIgtf)}%`,
      conSimbolo(d.moneda, d.igtf ?? 0),
    )
  }

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
      ? `Equivale a $ ${numero(Number(d.total) / Number(d.tasaUsd || d.tasa || 1))}`
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
    /*
      Ya no hace falta pedirlo, y dejarlo sería PEOR que no ponerlo.

      Esta línea decía `conDomicilio: d.tipo === 'FACTURA'`, que con el valor
      por omisión invertido el 25/09 pasaría a significar lo contrario de lo que
      quería decir: a la cotización y a la nota de entrega les QUITARÍA la
      dirección que ahora tienen que llevar. Se quita la línea y las tres se
      comportan igual.
    */
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

  // La columna de conversión va si algún renglón tiene con qué convertirse, y
  // con ella cambia el reparto entero: se decide antes de medir nada.
  const col = d.renglones.some((r) => r.conversion) ? CON_CONVERSION : SIN_CONVERSION

  // Cuántas líneas ocupa cada descripción depende del ancho que le tocó, y el
  // reparto en hojas depende de eso: se miden todas antes de repartir.
  const lineas = d.renglones.map((r) => lineasDeDescripcion(doc, r.descripcion, col.descripcion))
  const altoDe = (i: number) => altoRenglon(lineas[i].length, d.renglones[i])

  // Ahora sí se reparten las hojas, sin pintar: hace falta saber cuántas son
  // para poder escribir "página 1 de 3" ya en la primera. Cada hoja guarda la
  // posición de sus renglones, que es la que tienen sus líneas medidas.
  const hojas: number[][] = []
  {
    let y = yPrimera + 6.5
    let actual: number[] = []

    for (const i of d.renglones.keys()) {
      if (y + altoDe(i) > topeTabla) {
        hojas.push(actual)
        actual = []
        y = ARRIBA + 12 + 6.5
      }
      actual.push(i)
      y += altoDe(i)
    }
    hojas.push(actual)

    // Si el cierre no cabe debajo de la última tanda, se va a una hoja más.
    if (y + cierre > ABAJO) hojas.push([])
  }

  for (const [indice, posiciones] of hojas.entries()) {
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

    y = cabeceraTabla(doc, y, col)

    for (const [k, i] of posiciones.entries()) {
      const r = d.renglones[i]
      const descripcion = lineas[i]
      const bajada = (descripcion.length - 1) * LINEA_DE_MAS

      if (k % 2 === 1) {
        doc.setFillColor(FILA_ALTERNA)
        doc.rect(IZQ, y, ANCHO_UTIL, altoDe(i), 'F')
      }

      doc.setTextColor(TINTA).setFont('helvetica', 'normal').setFontSize(8)
      descripcion.forEach((linea, j) => doc.text(linea, IZQ + 3, y + 4.2 + j * LINEA_DE_MAS))
      // Se mide a los ocho puntos con los que se pintó, no a los seis y medio
      // de la marca: midiéndolo después de bajar el cuerpo, el «(E)» caía
      // encima de la última letra —«FLETE HASTA OBR(E)»—. Va detrás de la
      // última línea de la descripción, que es donde termina.
      const finDescripcion = IZQ + 3 + doc.getTextWidth(descripcion[descripcion.length - 1] ?? '')

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
      if (r.exento_iva && mencionaImpuestos(d)) {
        doc.setTextColor(GRIS).setFontSize(6.5)
        doc.text('(E)', finDescripcion + 1.2, y + 4.2 + bajada)
        doc.setTextColor(TINTA).setFontSize(8)
      }

      doc.text(numero(r.cantidad), col.cant, y + 4.2, { align: 'right' })

      doc.setTextColor(GRIS).setFontSize(7)
      doc.text(r.unidad, col.unid, y + 4.2, { align: 'right' })

      // En la misma letra que la cantidad: se pidió que las dos medidas se
      // lean por igual. El guion, en gris, es «este renglón no se puede
      // convertir», no un cero.
      if (col.conv !== null) {
        doc.setTextColor(r.conversion ? TINTA : GRIS).setFontSize(8)
        doc.text(r.conversion ?? '—', col.conv, y + 4.2, { align: 'right' })
      }

      doc.setTextColor(TINTA).setFontSize(8)
      doc.text(numero(r.precio_unitario), col.prec, y + 4.2, { align: 'right' })
      doc.setFont('helvetica', 'bold')
      doc.text(numero(r.subtotal), col.total - 3, y + 4.2, { align: 'right' })

      if (r.detalle) {
        doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(6.5)
        doc.text(ajustar(doc, r.detalle, ANCHO_UTIL - 6), IZQ + 3, y + 7.6 + bajada)
      }

      y += altoDe(i)
    }

    doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
    doc.line(IZQ, y, DER, y)

    if (indice === hojas.length - 1) {
      // Las notas bajo la tabla se apilan a la izquierda, en el ancho que dejan
      // los totales, cada una debajo de la anterior.
      let yNota = y + 3.5

      // La marca (E) no se explica sola, y una letra suelta en un papel fiscal
      // que nadie sabe leer es peor que no ponerla.
      if (mencionaImpuestos(d) && d.renglones.some((r) => r.exento_iva)) {
        doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(6.5)
        doc.text('(E) Renglón exento de IVA.', IZQ, yNota)
        yNota += 3.2
      }

      /*
        DE DÓNDE SALEN LAS TONELADAS. Una columna de conversión sin decirlo se
        lee como si todo se hubiera pesado en la romana. Los renglones pesados o
        estimados al despachar lo dicen en su propia línea; esta nota es para
        los que salen de la densidad.
      */
      if (col.conv !== null && d.notaConversion) {
        doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(6.5)
        let nota = doc.splitTextToSize(d.notaConversion, ANCHO_NOTAS) as string[]
        if (nota.length > 3) nota = [...nota.slice(0, 2), ajustar(doc, nota.slice(2).join(' '), ANCHO_NOTAS)]
        nota.forEach((linea, j) => doc.text(linea, IZQ, yNota + j * 2.9))
        yNota += nota.length * 2.9 + 0.3
      }

      if (d.observacion) {
        doc.setTextColor(GRIS).setFont('helvetica', 'normal').setFontSize(7)
        doc.text(ajustar(doc, `Observación: ${d.observacion}`, ANCHO_UTIL * 0.5), IZQ, yNota + 2.5)
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
