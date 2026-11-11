import { logoComoImagen } from '@/lib/ficha/logo'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { EMPRESA } from '@/lib/empresa'
import { bolivares, dinero, documento } from '@/lib/formato'
import {
  fechaLarga,
  MARCA,
  ROTULO,
  TINTA,
  GRIS,
  FILA_ALTERNA,
  HAIRLINE,
  type EmpresaPapel,
} from '@/lib/ficha/papel'
import type { CuentaParaPagos, PrecioVenta } from '@/lib/api/ventas'

/*
  LA LISTA OFICIAL DE PRECIOS EN PDF, FORMATO EJECUTIVO A4 HORIZONTAL (11/11/2026).

  Documento comercial para entregar al cliente: presenta el membrete institucional
  completo de MINERÍA INTERNACIONAL TS, C.A. (logotipo, razón social, actividad,
  RIF, correo corporativo y ubicación), tarjeta de control de vigencia, franja
  ejecutiva de 3 tarjetas (ficha institucional, resumen de oferta comercial y
  modalidad de facturación/pago), tabla numerada de materiales con pastilla de
  unidad y opción de equivalente en Bolívares (Tasa BCV), y panel derecho con las
  cuentas bancarias autorizadas de Tesorería más las condiciones comerciales y de
  despacho.

  Los artículos sin precio asignado se excluyen del documento, y cualquier opción
  desactivada en la ventana de emisión (datos bancarios, equivalente en Bs. o
  logotipo) reacomoda la diagramación sin dejar espacios vacíos.
*/

type Doc = InstanceType<typeof import('jspdf').jsPDF>

export interface DatosListaDePrecios {
  precios: PrecioVenta[]
  cuentas: CuentaParaPagos[]
  conCuentas: boolean
  conEquivalenteBs?: boolean
  tasaBcv?: number | null
  conLogo: boolean
  empresa: EmpresaPapel
  emitidoPor: string
  momento: Date
  nombreArchivo: string
}

// Geometría A4 horizontal ejecutiva (297 × 210 mm, 14 mm de margen lateral, 269 mm útiles).
const ANCHO_HOJA = 297
const ALTO_HOJA = 210
const IZQ = 14
const DER = ANCHO_HOJA - 14
const ANCHO_UTIL = DER - IZQ
const ABAJO = ALTO_HOJA - 15

const BORDE_FUERTE = '#d6cfc9'
const FONDO_PIE_TABLA = '#f3ede8'
const FONDO_CUENTA = '#fdf3f1'
const BORDE_CUENTA = '#e6b8af'

const fmtTasa = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
})

/** «01630405174053030180» → «0163-0405-1740-5303-0180», como se dicta en el banco. */
function cuentaLegible(n: string): string {
  const solo = n.replace(/\D/g, '')
  return solo.length === 20 ? solo.match(/.{4}/g)!.join('-') : n
}

/** «0163 · BANCO DEL TESORO» → «Banco del Tesoro (0163)», como lo escribe la empresa. */
function bancoLegible(b: string): string {
  const m = b.match(/^(\d{4})\s*·\s*(.+)$/)
  if (!m) return b
  const nombre = m[2]
    .toLowerCase()
    .replace(/(^|\s)(\S)/g, (_, e: string, l: string) => e + l.toUpperCase())
    .replace(/\b(Del|De|La|Los|Las|Y)\b/g, (p) => p.toLowerCase())
  return `${nombre} (${m[1]})`
}

function nombreUnidad(u: string): string {
  const limpia = u.trim().toUpperCase()
  if (limpia === 'M3' || limpia === 'M³') return 'Metro cúbico'
  if (limpia === 'TON' || limpia === 'T') return 'Tonelada'
  if (limpia === 'KG') return 'Kilogramo'
  if (limpia === 'UND' || limpia === 'UNI') return 'Unidad'
  return ''
}

function recortar(doc: Doc, t: string, ancho: number): string {
  if (doc.getTextWidth(t) <= ancho) return t
  let s = t
  while (s.length > 1 && doc.getTextWidth(s + '…') > ancho) s = s.slice(0, -1)
  return s + '…'
}

function domicilioInstitucional(empresa: EmpresaPapel): string {
  return empresa.domicilio || 'Vargas - La Guaira'
}

function cabecera(
  doc: Doc,
  logo: string,
  d: DatosListaDePrecios,
  cantidadProductos: number,
  mostrarBs: boolean,
  tasaNum: number | null,
): number {
  const y = 12
  const LADO = 20
  if (logo) doc.addImage(logo, 'PNG', IZQ, y, LADO, LADO)
  const x = logo ? IZQ + LADO + 4.5 : IZQ

  const razon = d.empresa.razonSocial || EMPRESA.razonSocial
  const rifFormateado = documento(d.empresa.rif || EMPRESA.rif)
  const actividad = (d.empresa.actividad || EMPRESA.actividad).toUpperCase()
  const domicilio = domicilioInstitucional(d.empresa).toUpperCase()

  doc.setFont('helvetica', 'bold').setFontSize(14.5).setTextColor(MARCA)
  doc.text(recortar(doc, razon, 145), x, y + 5.5)

  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(ROTULO)
  doc.text(recortar(doc, actividad, 145), x, y + 10.2)

  doc.setFont('helvetica', 'bold').setFontSize(8.2).setTextColor(TINTA)
  doc.text(`RIF: ${rifFormateado}`, x, y + 14.8)

  doc.setFont('helvetica', 'bold').setFontSize(7.6).setTextColor(GRIS)
  doc.text(recortar(doc, domicilio, 145), x, y + 19.2)

  // Tarjeta de control a la derecha
  const W = 96
  const ALTO_CAB = 7.2
  const ALTO_CUERPO = 15.6
  const xr = DER - W

  doc.setFillColor(FILA_ALTERNA).setDrawColor(MARCA).setLineWidth(0.35)
  doc.roundedRect(xr, y, W, ALTO_CAB + ALTO_CUERPO, 1.4, 1.4, 'FD')
  doc.setFillColor(MARCA).rect(xr, y, W, ALTO_CAB, 'F')

  doc.setFont('helvetica', 'bold').setFontSize(9.2).setTextColor('#ffffff')
  doc.text('LISTA OFICIAL DE PRECIOS', xr + W / 2, y + 4.9, { align: 'center' })

  const rubrosTxt = `${cantidadProductos} ${cantidadProductos === 1 ? 'material comercializable' : 'materiales comercializables'}`
  const monedaTxt =
    mostrarBs && tasaNum
      ? `USD y Bs. (Tasa Bs ${fmtTasa.format(tasaNum)})`
      : 'Dólares (USD) · Ref. BCV'

  const filasControl: Array<{ etq: string; val: string }> = [
    { etq: 'RUBROS EN CATÁLOGO', val: rubrosTxt },
    { etq: 'MONEDA DE COTIZACIÓN', val: monedaTxt },
    { etq: 'FECHA DE EMISIÓN', val: fechaLarga(d.momento) },
  ]

  let yc = y + ALTO_CAB + 4.2
  for (const f of filasControl) {
    doc.setFont('helvetica', 'bold').setFontSize(6.8).setTextColor(GRIS)
    doc.text(f.etq, xr + 3.5, yc)
    doc.setFont('helvetica', 'bold').setFontSize(7.6).setTextColor(TINTA)
    doc.text(recortar(doc, f.val, W - 40), xr + W - 3.5, yc, { align: 'right' })
    yc += 4.6
  }

  const yl = y + ALTO_CAB + ALTO_CUERPO + 3
  doc.setDrawColor(MARCA).setLineWidth(0.65).line(IZQ, yl, DER, yl)
  return yl + 4.5
}

function cabeceraCorta(doc: Doc, logo: string, d: DatosListaDePrecios): number {
  const y = 11
  if (logo) doc.addImage(logo, 'PNG', IZQ, y, 10, 10)
  const x = logo ? IZQ + 12.5 : IZQ
  const razon = d.empresa.razonSocial || EMPRESA.razonSocial
  const rifFormateado = documento(d.empresa.rif || EMPRESA.rif)

  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(MARCA)
  doc.text(`${razon} · LISTA OFICIAL DE PRECIOS`, x, y + 4.5)
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
  doc.text(`RIF: ${rifFormateado} · ${domicilioInstitucional(d.empresa)}`, x, y + 8.6)

  doc.setFont('helvetica', 'bold').setFontSize(7.8).setTextColor(ROTULO)
  doc.text(fechaLarga(d.momento), DER, y + 6.5, { align: 'right' })

  const yl = y + 12
  doc.setDrawColor(MARCA).setLineWidth(0.45).line(IZQ, yl, DER, yl)
  return yl + 4.5
}

function franjaEjecutiva(
  doc: Doc,
  y: number,
  d: DatosListaDePrecios,
  filas: PrecioVenta[],
  mostrarBs: boolean,
  tasaNum: number | null,
): number {
  const GAP = 4
  const w1 = 92
  const w2 = 85
  const w3 = ANCHO_UTIL - w1 - w2 - GAP * 2
  const ALTO = 20.5

  const razon = d.empresa.razonSocial || EMPRESA.razonSocial
  const rifFormateado = documento(d.empresa.rif || EMPRESA.rif)
  const actividad = d.empresa.actividad || EMPRESA.actividad
  const domicilio = domicilioInstitucional(d.empresa)

  // Cálculo del resumen comercial
  const montos = filas.map((p) => Number(p.precio)).filter((n) => Number.isFinite(n) && n > 0)
  const minPrecio = montos.length ? Math.min(...montos) : 0
  const maxPrecio = montos.length ? Math.max(...montos) : 0
  const monedaRef = filas[0]?.moneda ?? 'USD'
  const unidadesUnicas = [...new Set(filas.map((f) => f.unidad.trim().toUpperCase()))]
  const sufijoUnidad = unidadesUnicas.length === 1 ? ` / ${unidadesUnicas[0]}` : ''
  const rangoTexto =
    minPrecio === maxPrecio
      ? `${dinero(monedaRef, minPrecio)}${sufijoUnidad}`
      : `${dinero(monedaRef, minPrecio)} a ${dinero(monedaRef, maxPrecio)}${sufijoUnidad}`

  const descUnidades =
    unidadesUnicas.length === 1 && nombreUnidad(unidadesUnicas[0])
      ? `${nombreUnidad(unidadesUnicas[0])} (${unidadesUnicas[0]})`
      : unidadesUnicas.join(', ')

  const tarjetas: Array<{
    x: number
    w: number
    acento: string
    rotulo: string
    principal: string
    linea1: string
    linea2: string
  }> = [
    {
      x: IZQ,
      w: w1,
      acento: MARCA,
      rotulo: 'DATOS INSTITUCIONALES DEL PROVEEDOR',
      principal: razon,
      linea1: `RIF: ${rifFormateado} · Actividad: ${actividad}`,
      linea2: `Ubicación: ${domicilio}`,
    },
    {
      x: IZQ + w1 + GAP,
      w: w2,
      acento: ROTULO,
      rotulo: 'RESUMEN DE OFERTA COMERCIAL',
      principal: `${filas.length} ${filas.length === 1 ? 'Producto Activo' : 'Productos Activos'} · ${rangoTexto}`,
      linea1: `Despacho en planta por ${descUnidades}.`,
      linea2: 'Materiales áridos y agregados para construcción y obras.',
    },
    {
      x: IZQ + w1 + GAP + w2 + GAP,
      w: w3,
      acento: ROTULO,
      rotulo: 'MODALIDAD DE FACTURACIÓN Y PAGO',
      principal:
        mostrarBs && tasaNum
          ? `Tasa BCV del Día: Bs ${fmtTasa.format(tasaNum)} / USD`
          : 'Precios Unitarios en Divisas (USD)',
      linea1:
        mostrarBs && tasaNum
          ? 'Precios en Dólares (USD) con su equivalente referencial'
          : 'Pagos en Bolívares (Bs.) calculados a la tasa oficial del',
      linea2:
        mostrarBs && tasaNum
          ? 'en Bolívares (Bs.) a la tasa oficial BCV del día.'
          : 'BCV vigente a la fecha de facturación o recepción del pago.',
    },
  ]

  for (const t of tarjetas) {
    doc.setFillColor(FILA_ALTERNA).setDrawColor(BORDE_FUERTE).setLineWidth(0.28)
    doc.roundedRect(t.x, y, t.w, ALTO, 1.2, 1.2, 'FD')
    doc.setFillColor(t.acento).rect(t.x, y, 1.3, ALTO, 'F')

    const xp = t.x + 4
    const maxW = t.w - 6.5
    doc.setFont('helvetica', 'bold').setFontSize(6.6).setTextColor(ROTULO)
    doc.text(t.rotulo, xp, y + 4.4)

    doc.setFont('helvetica', 'bold').setFontSize(8.8).setTextColor(TINTA)
    doc.text(recortar(doc, t.principal, maxW), xp, y + 9.4)

    doc.setFont('helvetica', 'normal').setFontSize(7.2).setTextColor(GRIS)
    doc.text(recortar(doc, t.linea1, maxW), xp, y + 14.1)
    doc.text(recortar(doc, t.linea2, maxW), xp, y + 17.9)
  }

  return y + ALTO + 5.5
}

function encabezadoSeccion(
  doc: Doc,
  x: number,
  y: number,
  w: number,
  titulo: string,
  subtitulo: string,
): number {
  doc.setFillColor(MARCA).rect(x, y, 1.4, 4.2, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(8.2).setTextColor(ROTULO)
  doc.text(titulo.toUpperCase(), x + 3.2, y + 3.4)
  if (subtitulo) {
    doc.setFont('helvetica', 'normal').setFontSize(7.2).setTextColor(GRIS)
    doc.text(subtitulo, x + w, y + 3.4, { align: 'right' })
  }
  return y + 6.2
}

function panelDerechoPagoYCondiciones(
  doc: Doc,
  d: DatosListaDePrecios,
  x: number,
  y: number,
  w: number,
): number {
  const cuentas = d.cuentas
  const razon = d.empresa.razonSocial || EMPRESA.razonSocial
  const rifEmpresa = documento(d.empresa.rif || EMPRESA.rif)

  const ALTO_CAB = 7.2
  const ALTO_TITULAR = 13.5
  const ALTO_CUENTA = 21.5
  const altoCajaPago = ALTO_CAB + ALTO_TITULAR + cuentas.length * ALTO_CUENTA + 1.5

  doc.setFillColor('#ffffff').setDrawColor(MARCA).setLineWidth(0.42)
  doc.roundedRect(x, y, w, altoCajaPago, 1.4, 1.4, 'FD')

  // Cabecera de la tarjeta bancaria
  doc.setFillColor(MARCA).rect(x, y, w, ALTO_CAB, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(8.2).setTextColor('#ffffff')
  doc.text('DATOS BANCARIOS PARA EL PAGO', x + 3.8, y + 4.9)
  doc.setFont('helvetica', 'normal').setFontSize(6.8).setTextColor('#fce7e3')
  doc.text('Tesorería Corporativa', x + w - 3.8, y + 4.9, { align: 'right' })

  // Franja del titular / beneficiario
  const yt = y + ALTO_CAB
  doc.setFillColor(FILA_ALTERNA).rect(x + 0.25, yt, w - 0.5, ALTO_TITULAR, 'F')
  doc.setDrawColor(HAIRLINE).setLineWidth(0.25).line(x, yt + ALTO_TITULAR, x + w, yt + ALTO_TITULAR)

  doc.setFont('helvetica', 'bold').setFontSize(6.3).setTextColor(GRIS)
  doc.text('BENEFICIARIO / TITULAR DE LA CUENTA', x + 3.8, yt + 3.9)
  doc.setFont('helvetica', 'bold').setFontSize(8.4).setTextColor(TINTA)
  doc.text(recortar(doc, cuentas[0]?.titular || razon, w - 7.6), x + 3.8, yt + 8.1)
  const rifTitular = cuentas[0]?.documento ? documento(cuentas[0].documento) : rifEmpresa
  doc.setFont('helvetica', 'bold').setFontSize(7.1).setTextColor(ROTULO)
  doc.text(recortar(doc, `RIF: ${rifTitular}`, w - 7.6), x + 3.8, yt + 11.7)

  // Listado de cuentas activas
  let yc = yt + ALTO_TITULAR + 2.5
  cuentas.forEach((c, idx) => {
    if (idx > 0) {
      doc.setDrawColor(HAIRLINE).setLineWidth(0.25).line(x + 3.5, yc - 1.2, x + w - 3.5, yc - 1.2)
    }

    const banco = bancoLegible(c.banco ?? '—')

    doc.setFont('helvetica', 'bold').setFontSize(8.6).setTextColor(TINTA)
    doc.text(recortar(doc, banco, w - 7.6), x + 3.8, yc + 3.5)

    // Recuadro resaltado para el número de cuenta
    const yNum = yc + 6.1
    const hNum = 12.2
    doc.setFillColor(FONDO_CUENTA).setDrawColor(BORDE_CUENTA).setLineWidth(0.3)
    doc.roundedRect(x + 3.5, yNum, w - 7, hNum, 1.1, 1.1, 'FD')

    doc.setFont('helvetica', 'bold').setFontSize(6.2).setTextColor(ROTULO)
    const subTitular =
      idx > 0 && c.titular && c.titular !== cuentas[0]?.titular
        ? `NÚMERO DE CUENTA · ${c.titular}`
        : 'NÚMERO DE CUENTA CORRIENTE'
    doc.text(recortar(doc, subTitular, w - 12), x + 6, yNum + 3.8)

    doc.setFont('helvetica', 'bold').setFontSize(10.4).setTextColor(MARCA)
    doc.text(cuentaLegible(c.numero_cuenta ?? '—'), x + 6, yNum + 9.4)

    yc += ALTO_CUENTA
  })

  // Recuadro inferior: Condiciones comerciales y de despacho
  const yCond = y + altoCajaPago + 4
  const condiciones: Array<[string, string]> = [
    [
      'Vigencia de precios:',
      'Importes unitarios vigentes a la fecha de emisión por la unidad de medida indicada.',
    ],
    [
      'Tasa de cambio aplicable:',
      'Todo pago en Bolívares (Bs.) se liquida a la tasa oficial del BCV vigente el día del pago.',
    ],
    [
      'Verificación administrativa:',
      'Para autorizar el despacho es indispensable remitir el comprobante bancario con su referencia.',
    ],
    [
      'Despacho en planta:',
      'Cantidades expresadas según la unidad de comercialización seleccionada (M3 o TON).',
    ],
  ]

  const altoCond = 8 + condiciones.length * 8.4 + 2.2
  if (yCond + altoCond <= ABAJO) {
    doc.setFillColor(FILA_ALTERNA).setDrawColor(BORDE_FUERTE).setLineWidth(0.3)
    doc.roundedRect(x, yCond, w, altoCond, 1.2, 1.2, 'FD')

    doc.setFont('helvetica', 'bold').setFontSize(7.4).setTextColor(ROTULO)
    doc.text('CONDICIONES COMERCIALES Y DE DESPACHO', x + 3.8, yCond + 4.8)
    doc.setDrawColor(HAIRLINE).setLineWidth(0.25).line(x + 3.5, yCond + 6.4, x + w - 3.5, yCond + 6.4)

    let yItem = yCond + 10.3
    const xTexto = x + 6.8
    const anchoTotal = w - 10.6

    for (const [titulo, texto] of condiciones) {
      // Viñeta cuadrada vectorial (evita glifos fuera de WinAnsi en Helvetica)
      doc.setFillColor(MARCA).rect(x + 3.8, yItem - 2.0, 1.6, 1.6, 'F')

      // Título en negrita (una sola vez)
      doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(ROTULO)
      doc.text(titulo, xTexto, yItem)
      const wTit = doc.getTextWidth(titulo) + 1.5

      // Cuerpo en fuente normal: primera línea tras el título y segunda línea debajo
      doc.setFont('helvetica', 'normal').setFontSize(6.9).setTextColor(TINTA)
      const dispPrimera = Math.max(10, anchoTotal - wTit)
      const palabras = texto.split(/\s+/)
      let primera = ''
      let idxPalabra = 0
      while (idxPalabra < palabras.length) {
        const candidata = primera ? `${primera} ${palabras[idxPalabra]}` : palabras[idxPalabra]
        if (doc.getTextWidth(candidata) <= dispPrimera) {
          primera = candidata
          idxPalabra++
        } else {
          break
        }
      }

      if (primera) {
        doc.text(primera, xTexto + wTit, yItem)
      }
      const resto = palabras.slice(idxPalabra).join(' ')
      if (resto) {
        doc.text(recortar(doc, resto, anchoTotal), xTexto, yItem + 3.5)
      }

      yItem += 8.4
    }
    return yCond + altoCond
  }

  return y + altoCajaPago
}

function pie(doc: Doc, d: DatosListaDePrecios, pagina: number, total: number) {
  const razon = d.empresa.razonSocial || EMPRESA.razonSocial
  const rifFormateado = documento(d.empresa.rif || EMPRESA.rif)

  doc.setDrawColor(BORDE_FUERTE).setLineWidth(0.3).line(IZQ, ALTO_HOJA - 11, DER, ALTO_HOJA - 11)
  doc.setFont('helvetica', 'normal').setFontSize(7.2).setTextColor(GRIS)
  doc.text(
    `${razon} · RIF ${rifFormateado} · Lista Oficial de Precios · Emitido por ${d.emitidoPor || 'Sistema'} · ${fechaLarga(d.momento)}`,
    IZQ,
    ALTO_HOJA - 6.8,
  )
  doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(ROTULO)
  doc.text(`Página ${pagina} de ${total}`, DER, ALTO_HOJA - 6.8, { align: 'right' })
}

export async function armarListaDePrecios(d: DatosListaDePrecios): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = d.conLogo ? await logoComoImagen(600, false) : ''
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true })

  const filas = d.precios.filter((p) => p.activo && p.precio && Number(p.precio) > 0)
  const conCuentas = d.conCuentas && d.cuentas.length > 0
  const tasaNum = d.tasaBcv && Number(d.tasaBcv) > 0 ? Number(d.tasaBcv) : null
  const mostrarBs = Boolean(d.conEquivalenteBs && tasaNum)

  let y = cabecera(doc, logo, d, filas.length, mostrarBs, tasaNum)
  y = franjaEjecutiva(doc, y, d, filas, mostrarBs, tasaNum)

  const W_PAGO = 98
  const W_TABLA = conCuentas ? ANCHO_UTIL - W_PAGO - 5.5 : ANCHO_UTIL

  const yInicioCuerpo = y
  if (conCuentas) {
    panelDerechoPagoYCondiciones(doc, d, DER - W_PAGO, yInicioCuerpo, W_PAGO)
  }

  y = encabezadoSeccion(
    doc,
    IZQ,
    y,
    W_TABLA,
    'Catálogo de Materiales y Precios Unitarios Vigentes',
    'Precios por unidad de medida en planta',
  )

  const wItem = 13
  const wUni = mostrarBs ? 36 : 42
  const wPre = mostrarBs ? 32 : 38
  const wBs = mostrarBs ? 38 : 0
  const wProd = W_TABLA - wItem - wUni - wPre - wBs

  const cItem = { x: IZQ, w: wItem }
  const cProd = { x: cItem.x + cItem.w, w: wProd }
  const cUni = { x: cProd.x + cProd.w, w: wUni }
  const cPre = { x: cUni.x + cUni.w, w: wPre }
  const cBs = { x: cPre.x + cPre.w, w: wBs }

  const ALTO_ENCABEZADO = 7.6
  const ALTO_FILA = filas.length <= 10 ? 8.2 : 7.4
  const ALTO_PIE_TABLA = 7.4

  const dibujarEncabezadoTabla = () => {
    doc.setFillColor(MARCA).rect(IZQ, y, W_TABLA, ALTO_ENCABEZADO, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(7.4).setTextColor('#ffffff')
    doc.text('ÍTEM', cItem.x + cItem.w / 2, y + 5.1, { align: 'center' })
    doc.text('MATERIAL / PRODUCTO', cProd.x + 3.5, y + 5.1)
    doc.text('UNIDAD DE MEDIDA', cUni.x + cUni.w / 2, y + 5.1, { align: 'center' })
    doc.text('PRECIO UNITARIO ($)', cPre.x + cPre.w - 3.5, y + 5.1, { align: 'right' })
    if (mostrarBs) {
      doc.text('EQUIVALENTE Bs. (BCV)', cBs.x + cBs.w - 3.5, y + 5.1, { align: 'right' })
    }
    y += ALTO_ENCABEZADO
  }

  let yTopeTabla = y
  dibujarEncabezadoTabla()

  filas.forEach((p, i) => {
    if (y + ALTO_FILA + ALTO_PIE_TABLA > ABAJO) {
      doc.setDrawColor(BORDE_FUERTE).setLineWidth(0.3).rect(IZQ, yTopeTabla, W_TABLA, y - yTopeTabla)
      doc.addPage()
      y = cabeceraCorta(doc, logo, d)
      y = encabezadoSeccion(
        doc,
        IZQ,
        y,
        W_TABLA,
        'Catálogo de Materiales y Precios Unitarios Vigentes (continuación)',
        'Precios por unidad de medida en planta',
      )
      yTopeTabla = y
      dibujarEncabezadoTabla()
    }

    if (i % 2 === 1) {
      doc.setFillColor(FILA_ALTERNA).rect(IZQ, y, W_TABLA, ALTO_FILA, 'F')
    }
    doc.setDrawColor(HAIRLINE).setLineWidth(0.22).line(IZQ, y + ALTO_FILA, IZQ + W_TABLA, y + ALTO_FILA)

    const yTexto = y + ALTO_FILA * 0.66

    // 1. Ítem correlativo
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(GRIS)
    doc.text(String(i + 1).padStart(2, '0'), cItem.x + cItem.w / 2, yTexto, { align: 'center' })

    // 2. Material / Producto
    doc.setFont('helvetica', 'bold').setFontSize(9.2).setTextColor(TINTA)
    doc.text(recortar(doc, p.nombre, cProd.w - 6), cProd.x + 3.5, yTexto)

    // 3. Unidad de medida (pastilla ejecutiva + descripción)
    const uCod = p.unidad.trim().toUpperCase()
    const uDesc = nombreUnidad(uCod)
    doc.setFont('helvetica', 'bold').setFontSize(7.2)
    const wPill = Math.max(9.5, doc.getTextWidth(uCod) + 4.2)

    if (uDesc && cUni.w >= 36) {
      doc.setFont('helvetica', 'normal').setFontSize(7.1)
      const wDesc = doc.getTextWidth(uDesc)
      const wConjunto = wPill + 2 + wDesc
      const xPill = cUni.x + (cUni.w - wConjunto) / 2
      doc.setFillColor('#efeae4').setDrawColor('#d5cbc0').setLineWidth(0.22)
      doc.roundedRect(xPill, y + (ALTO_FILA - 4.5) / 2, wPill, 4.5, 0.8, 0.8, 'FD')
      doc.setFont('helvetica', 'bold').setFontSize(7.1).setTextColor(ROTULO)
      doc.text(uCod, xPill + wPill / 2, yTexto - 0.15, { align: 'center' })
      doc.setFont('helvetica', 'normal').setFontSize(7.1).setTextColor(GRIS)
      doc.text(uDesc, xPill + wPill + 2, yTexto)
    } else {
      const xPill = cUni.x + (cUni.w - wPill) / 2
      doc.setFillColor('#efeae4').setDrawColor('#d5cbc0').setLineWidth(0.22)
      doc.roundedRect(xPill, y + (ALTO_FILA - 4.5) / 2, wPill, 4.5, 0.8, 0.8, 'FD')
      doc.setFont('helvetica', 'bold').setFontSize(7.1).setTextColor(ROTULO)
      doc.text(uCod, xPill + wPill / 2, yTexto - 0.15, { align: 'center' })
    }

    // 4. Precio unitario
    const montoPrecio = Number(p.precio)
    const monedaFila = p.moneda ?? 'USD'
    doc.setFont('helvetica', 'bold').setFontSize(9.8).setTextColor(MARCA)
    doc.text(dinero(monedaFila, montoPrecio), cPre.x + cPre.w - 3.5, yTexto, { align: 'right' })

    // 5. Equivalente Bs. BCV (opcional)
    if (mostrarBs && tasaNum) {
      const eqBs = monedaFila === 'VES' ? montoPrecio : montoPrecio * tasaNum
      doc.setFont('helvetica', 'bold').setFontSize(8.6).setTextColor(TINTA)
      doc.text(bolivares(eqBs), cBs.x + cBs.w - 3.5, yTexto, { align: 'right' })
    }

    y += ALTO_FILA
  })

  // Banda de cierre al pie de la tabla
  doc.setFillColor(FONDO_PIE_TABLA).rect(IZQ, y, W_TABLA, ALTO_PIE_TABLA, 'F')
  doc.setDrawColor(MARCA).setLineWidth(0.45).line(IZQ, y, IZQ + W_TABLA, y)
  doc.setFont('helvetica', 'bold').setFontSize(7.4).setTextColor(ROTULO)
  doc.text(
    `TOTAL DE PRODUCTOS EN LISTA: ${filas.length} ${filas.length === 1 ? 'MATERIAL VIGENTE' : 'MATERIALES VIGENTES'}`,
    IZQ + 3.5,
    y + 4.9,
  )
  const txtDerechaPie =
    mostrarBs && tasaNum
      ? `TASA BCV APLICADA: Bs ${fmtTasa.format(tasaNum)} / USD`
      : 'PRECIOS UNITARIOS EXPRESADOS EN DÓLARES (USD)'
  doc.text(txtDerechaPie, IZQ + W_TABLA - 3.5, y + 4.9, { align: 'right' })
  y += ALTO_PIE_TABLA

  // Marco exterior de la tabla
  doc.setDrawColor(BORDE_FUERTE).setLineWidth(0.3).rect(IZQ, yTopeTabla, W_TABLA, y - yTopeTabla)

  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    pie(doc, d, i, total)
  }
  doc.setProperties({ title: 'Lista Oficial de Precios' })
  return { blob: doc.output('blob'), nombre: d.nombreArchivo }
}
