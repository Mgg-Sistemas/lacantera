import { logoComoImagen } from '@/lib/ficha/logo'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { ajustar } from '@/lib/ficha/hoja'
import { dinero, documento } from '@/lib/formato'
import {
  FILA_ALTERNA,
  GRIS,
  HAIRLINE,
  MARCA,
  ROTULO,
  TINTA,
  fechaCorta,
  fechaLarga,
  type EmpresaPapel,
} from '@/lib/ficha/papel'
import type { DocumentoDelInforme } from '@/lib/api/gastos'

/*
  INFORMES EJECUTIVOS EN PDF DEL MÓDULO DE GASTOS (10/11/2026).

  1. Comparativo de gastos y ventas (`armarComparativoGastosVentas`):
     Balance operativo entre los ingresos por ventas de material efectivamente
     cobradas (notas de entrega despachadas de contado o con crédito pagado) y
     los egresos registrados en Gastos (más órdenes pagadas de Compras cuando se
     incluyan). Presenta comparación visual intuitiva de absorción vs. margen
     neto, tres tarjetas de indicadores ejecutivos, evolución por período,
     distribución de gastos por categoría (con su impacto sobre las ventas),
     ingresos por cliente y relación detallada opcional.

  2. Informe ejecutivo de gastos (`armarInformeDeGastos`):
     Consolidado administrativo de facturas de gasto por moneda original y
     equivalente BCV, indicadores de concentración, ejecución por categoría,
     evolución por período, relación detallada opcional y registro de auditoría
     de facturas anuladas.

  Ambos informes emplean el formato institucional A4 sin sección de «Alcance».
*/

type Doc = InstanceType<typeof import('jspdf').jsPDF>

export type Agrupacion = 'mes' | 'semana' | 'dia'
export type MonedaDelReporte = 'USD' | 'VES' | 'AMBAS'

export interface Monto {
  usd: number
  bs: number
}

const CERO: Monto = { usd: 0, bs: 0 }

// ── Geometría A4 ejecutiva (16 mm de margen, 178 mm útiles)
const IZQ = 16
const DER = 194
const ANCHO = DER - IZQ
const ARRIBA = 16
const LIMITE = 266
const PIE = 281

const ROJO_VENCIDO = '#b91c1c'
const VERDE = '#15803d'
const AMBAR = '#b45309'
const AMBAR_BARRA = '#d97706'

interface Pastilla {
  fondo: string
  texto: string
  borde: string
}

const P_SUPERAVIT: Pastilla = { fondo: '#dcfce7', texto: '#166534', borde: '#4ade80' }
const P_DEFICIT: Pastilla = { fondo: '#fee2e2', texto: '#991b1b', borde: '#f87171' }

const decimal1 = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

export function sumar(docs: DocumentoDelInforme[]): Monto {
  return docs.reduce((s, d) => ({ usd: s.usd + (d.total_usd ?? 0), bs: s.bs + (d.total_bs ?? 0) }), CERO)
}

function valorManda(m: Monto, moneda: MonedaDelReporte): number {
  return moneda === 'VES' ? m.bs : m.usd
}

function codigoManda(moneda: MonedaDelReporte): 'USD' | 'VES' {
  return moneda === 'VES' ? 'VES' : 'USD'
}

function montoPrincipal(m: Monto, moneda: MonedaDelReporte): string {
  const cod = codigoManda(moneda)
  return dinero(cod, valorManda(m, moneda))
}

function enLinea(m: Monto, moneda: MonedaDelReporte): string {
  if (moneda === 'USD') return dinero('USD', m.usd)
  if (moneda === 'VES') return dinero('VES', m.bs)
  return `${dinero('USD', m.usd)} · ${dinero('VES', m.bs)}`
}

export function ratioPorcentaje(parte: Monto, total: Monto, moneda: MonedaDelReporte): number {
  const p = valorManda(parte, moneda)
  const t = valorManda(total, moneda)
  if (t <= 0) return 0
  return (p / t) * 100
}

function porcentajeTexto(parte: Monto, total: Monto, moneda: MonedaDelReporte): string {
  const t = valorManda(total, moneda)
  if (t <= 0) return '—'
  return `${decimal1.format(ratioPorcentaje(parte, total, moneda))} %`
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/** La clave ordenable del período al que pertenece una fecha AAAA-MM-DD. */
export function clavePeriodo(fechaIso: string, agrupar: Agrupacion): string {
  if (agrupar === 'dia') return fechaIso
  if (agrupar === 'mes') return fechaIso.slice(0, 7)
  // La semana empieza el lunes; la clave es la fecha de ese lunes.
  const [a, m, d] = fechaIso.split('-').map(Number)
  const dia = new Date(Date.UTC(a, m - 1, d))
  const corrimiento = (dia.getUTCDay() + 6) % 7
  dia.setUTCDate(dia.getUTCDate() - corrimiento)
  return dia.toISOString().slice(0, 10)
}

export function nombrePeriodo(clave: string, agrupar: Agrupacion): string {
  if (agrupar === 'dia') return fechaCorta(clave)
  if (agrupar === 'mes') {
    const [a, m] = clave.split('-').map(Number)
    return `${MESES[m - 1]} ${a}`
  }
  const [a, m, d] = clave.split('-').map(Number)
  const fin = new Date(Date.UTC(a, m - 1, d + 6)).toISOString().slice(0, 10)
  return `${fechaCorta(clave)} al ${fechaCorta(fin)}`
}

function agruparPor<T extends DocumentoDelInforme>(docs: T[], clave: (d: T) => string): Map<string, T[]> {
  const grupos = new Map<string, T[]>()
  for (const d of docs) {
    const k = clave(d)
    const g = grupos.get(k)
    if (g) g.push(d)
    else grupos.set(k, [d])
  }
  return grupos
}

export interface DatosDeLosReportes {
  documentos: DocumentoDelInforme[]
  desde: string
  hasta: string
  agrupar: Agrupacion
  moneda: MonedaDelReporte
  /** El rótulo de las categorías elegidas, o «Todas». */
  categorias: string
  conDetalle: boolean
  conLogo: boolean
  nombreArchivo: string
  empresa: EmpresaPapel
  emitidoPor: string
  momento: Date
}

export interface DatosDelComparativo extends DatosDeLosReportes {
  conCompras: boolean
  conPorCobrar: boolean
}

/*
  LA NÓMINA EN ESTOS PAPELES (11/11/2026). Llega como un gasto más, con la
  categoría «NOMINA» (ver `ReportesDeGastos`): una línea por período, por lo
  asignado más los aportes, fechada el día en que termina el período. Aquí
  solo se explica al pie y se separa en el desglose por origen.
*/
const esNomina = (g: DocumentoDelInforme) => g.categoria === 'NOMINA'

function notaDeNomina(gastos: DocumentoDelInforme[]): string {
  const n = gastos.filter(esNomina).length
  if (!n) return ''
  return ` Incluye ${plural(n, 'nómina', 'nóminas')} en la categoría «Nómina»: lo asignado a los trabajadores más los aportes patronales, contado en el mes en que termina cada período y convertido con la tasa de la propia nómina.`
}

const NOMBRE_AGRUPAR: Record<Agrupacion, string> ={ mes: 'Mes', semana: 'Semana', dia: 'Día' }
const ADJETIVO_AGRUPAR: Record<Agrupacion, string> = { mes: 'mensual', semana: 'semanal', dia: 'diaria' }

/** Escribe en una sola línea reduciendo ligeramente la fuente antes de recortar. */
function enUnaLinea(
  doc: Doc,
  texto: string,
  x: number,
  y: number,
  ancho: number,
  talla: number,
  estilo: 'bold' | 'normal',
  align: 'left' | 'right' | 'center' = 'left',
  minima = 5.5,
) {
  doc.setFont('helvetica', estilo)
  let t = talla
  while (t > minima) {
    doc.setFontSize(t)
    if (doc.getTextWidth(texto) <= ancho) break
    t -= 0.25
  }
  doc.setFontSize(t)
  doc.text(doc.getTextWidth(texto) <= ancho ? texto : ajustar(doc, texto, ancho), x, y, { align })
}

function pastilla(doc: Doc, texto: string, xDer: number, yBase: number, anchoMax: number, p: Pastilla, talla = 6.0) {
  doc.setFont('helvetica', 'bold')
  let t = talla
  while (t > 4.7) {
    doc.setFontSize(t)
    if (doc.getTextWidth(texto) + 3 <= anchoMax) break
    t -= 0.2
  }
  doc.setFontSize(t)
  const w = Math.min(anchoMax, doc.getTextWidth(texto) + 3)
  doc.setFillColor(p.fondo).setDrawColor(p.borde).setLineWidth(0.2)
  doc.roundedRect(xDer - w, yBase - 3.05, w, 4.2, 0.9, 0.9, 'FD')
  doc.setTextColor(p.texto)
  doc.text(ajustar(doc, texto, anchoMax - 2), xDer - w / 2, yBase, { align: 'center' })
}

/** Membrete institucional y tarjeta de control derecha (sin franja de «Alcance»). */
function cabecera(
  doc: Doc,
  logo: string,
  d: DatosDeLosReportes,
  tituloTarjeta: string,
  registrosTexto: string,
): number {
  const y = ARRIBA
  const ANCHO_CAJA = 68
  const xCaja = DER - ANCHO_CAJA
  const LADO = 23
  if (logo) doc.addImage(logo, 'PNG', IZQ, y - 0.5, LADO, LADO)
  const X = logo ? IZQ + LADO + 4.5 : IZQ
  const ANCHO_NOMBRE = xCaja - X - 4

  const nombre = (d.empresa.razonSocial || '').toUpperCase()
  doc.setTextColor(MARCA)
  enUnaLinea(doc, nombre, X, y + 5, ANCHO_NOMBRE, 15, 'bold', 'left', 9.5)

  let bajo = y + 5
  if (d.empresa.actividad) {
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(ROTULO)
    doc.text(ajustar(doc, d.empresa.actividad.toUpperCase(), ANCHO_NOMBRE), X, y + 10)
    bajo = y + 10
  }
  const rif = `RIF: ${d.empresa.rif}`
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(TINTA)
  doc.text(rif, X, bajo + 4.8)
  if (d.empresa.contacto) {
    const xc = X + doc.getTextWidth(rif)
    doc.setFont('helvetica', 'normal').setTextColor(GRIS)
    doc.text(ajustar(doc, `  ·  ${d.empresa.contacto}`, Math.max(12, ANCHO_NOMBRE - (xc - X))), xc, bajo + 4.8)
  }
  bajo += 4.8
  if (d.empresa.domicilio) {
    doc.setFont('helvetica', 'normal').setFontSize(7.1).setTextColor(GRIS)
    const lineas = (doc.splitTextToSize(d.empresa.domicilio.toUpperCase(), ANCHO_NOMBRE) as string[]).slice(0, 2)
    doc.text(lineas, X, bajo + 4.2, { lineHeightFactor: 1.3 })
    bajo += 4.2 + (lineas.length - 1) * 3
  }
  bajo = Math.max(bajo, y + LADO - 1)

  const filas: Array<[string, string, boolean]> = [
    ['PERÍODO', `${fechaCorta(d.desde)} — ${fechaCorta(d.hasta)}`, false],
    ['EMISIÓN', fechaLarga(d.momento), false],
    ['EMITIDO POR', d.emitidoPor || 'Sistema', false],
    ['REGISTROS', registrosTexto, true],
  ]

  const CAB = 6.8
  const FILA = 5.1
  const alto = CAB + filas.length * FILA + 2.2
  const yc = y - 0.5
  doc.setFillColor('#faf8f6').setDrawColor('#d6d3d1').setLineWidth(0.3)
  doc.roundedRect(xCaja, yc, ANCHO_CAJA, alto, 1.4, 1.4, 'FD')
  doc.setFillColor(MARCA).rect(xCaja, yc, ANCHO_CAJA, CAB, 'F')
  doc.setTextColor('#FFFFFF')
  enUnaLinea(doc, tituloTarjeta, xCaja + ANCHO_CAJA / 2, yc + 4.7, ANCHO_CAJA - 4, 7.8, 'bold', 'center')

  let yf = yc + CAB + 4.0
  filas.forEach(([et, val, destacado], i) => {
    if (i > 0) {
      doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
      doc.line(xCaja + 3, yf - 3.5, DER - 3, yf - 3.5)
    }
    doc.setFont('helvetica', 'bold').setFontSize(6.6).setTextColor(GRIS)
    doc.text(`${et}:`, xCaja + 3, yf)
    doc.setTextColor(destacado ? MARCA : TINTA)
    enUnaLinea(doc, val, DER - 3, yf, ANCHO_CAJA - 26, destacado ? 7.4 : 7.1, 'bold', 'right')
    yf += FILA
  })

  const regla = Math.max(bajo + 3.5, yc + alto + 3)
  doc.setDrawColor(MARCA).setLineWidth(0.7).line(IZQ, regla, DER, regla)
  return regla + 4.5
}

/** Cabecera ejecutiva de continuación en las páginas 2 en adelante. */
function cabeceraCorta(doc: Doc, logo: string, d: DatosDeLosReportes, titulo: string): number {
  const LADO = 11
  if (logo) doc.addImage(logo, 'PNG', IZQ, ARRIBA - 1, LADO, LADO)
  const x = logo ? IZQ + LADO + 3.5 : IZQ
  doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(MARCA)
  doc.text(titulo.toUpperCase(), x, ARRIBA + 3.8)
  doc.setFont('helvetica', 'bold').setFontSize(7.4).setTextColor(ROTULO)
  doc.text(ajustar(doc, (d.empresa.razonSocial || '').toUpperCase(), 92), x, ARRIBA + 8)
  doc.setFont('helvetica', 'normal').setFontSize(7.1).setTextColor(GRIS)
  doc.text(
    `Período: ${fechaCorta(d.desde)} — ${fechaCorta(d.hasta)} · Emisión: ${fechaLarga(d.momento)}`,
    DER,
    ARRIBA + 6,
    { align: 'right' },
  )
  const regla = ARRIBA + 11.5
  doc.setDrawColor(MARCA).setLineWidth(0.6).line(IZQ, regla, DER, regla)
  return regla + 5
}

function tituloSeccion(doc: Doc, y: number, titulo: string, sub: string | null, color = ROTULO): number {
  doc.setFillColor(color).rect(IZQ, y, 2.2, 5.2, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(9.2).setTextColor(ROTULO)
  const t = titulo.toUpperCase()
  doc.text(t, IZQ + 4.5, y + 4.1)
  if (sub) {
    const xs = IZQ + 4.5 + doc.getTextWidth(t) + 3
    doc.setFont('helvetica', 'normal').setFontSize(7.3).setTextColor(GRIS)
    doc.text(ajustar(doc, sub, DER - xs), xs, y + 4.1)
  }
  return y + 7.2
}

function cerrarDocumento(doc: Doc, titulo: string, emitidoPor: string, nombreArchivo: string): ArchivoArmado {
  const paginas = doc.getNumberOfPages()
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p)
    doc.setDrawColor('#d6d3d1').setLineWidth(0.3).line(IZQ, PIE - 5.5, DER, PIE - 5.5)
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(GRIS)
    doc.text(
      ajustar(doc, `Documento generado por el sistema · ${titulo} · Emitido por ${emitidoPor || 'Sistema'}`, ANCHO - 30),
      IZQ,
      PIE - 1,
    )
    doc.setFont('helvetica', 'bold').setFontSize(7.4).setTextColor(ROTULO)
    doc.text(`Página ${p} de ${paginas}`, DER, PIE - 1, { align: 'right' })
  }
  doc.setProperties({ title: titulo })
  return { blob: doc.output('blob'), nombre: nombreArchivo }
}

// ────────────────────── 1. INFORME EJECUTIVO DE GASTOS ──────────────────────

export async function armarInformeDeGastos(d: DatosDeLosReportes): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = d.conLogo ? await logoComoImagen(600, false) : ''
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const titulo = 'Informe ejecutivo de gastos'

  const gastos = d.documentos.filter((x) => x.tipo === 'GASTO')
  const anuladas = d.documentos.filter((x) => x.tipo === 'GASTO_ANULADO')
  const total = sumar(gastos)
  const manda = codigoManda(d.moneda)

  const porCategoria = [...agruparPor(gastos, (g) => g.categoria_nombre ?? 'Sin categoría')]
    .map(([nombre, gs]) => ({ nombre, n: gs.length, m: sumar(gs) }))
    .sort((a, b) => valorManda(b.m, d.moneda) - valorManda(a.m, d.moneda))

  const porPeriodo = [...agruparPor(gastos, (g) => clavePeriodo(g.fecha, d.agrupar))].sort(([a], [b]) =>
    a.localeCompare(b),
  )

  const proveedoresUnicos = new Set(
    gastos.filter((g) => !esNomina(g)).map((g) => g.contraparte.trim().toUpperCase()),
  ).size
  const usdDocs = gastos.filter((g) => g.moneda === 'USD')
  const vesDocs = gastos.filter((g) => g.moneda === 'VES')
  const otrasDocs = gastos.filter((g) => g.moneda !== 'USD' && g.moneda !== 'VES')
  const usdOrig = usdDocs.reduce((s, g) => s + g.monto, 0)
  const vesOrig = vesDocs.reduce((s, g) => s + g.monto, 0)
  const vesEquivUsd = vesDocs.reduce((s, g) => s + (g.total_usd ?? 0), 0)
  const otrasEquivUsd = otrasDocs.reduce((s, g) => s + (g.total_usd ?? 0), 0)

  const originalesTexto =
    [...agruparPor(gastos, (g) => g.moneda)]
      .map(([mon, gs]) => `${dinero(mon, gs.reduce((s, g) => s + g.monto, 0))} (${mon})`)
      .join(' · ') || 'Sin facturas vigentes'

  const nuevaHoja = () => {
    doc.addPage()
    return cabeceraCorta(doc, logo, d, titulo)
  }

  let y = cabecera(
    doc,
    logo,
    d,
    'INFORME EJECUTIVO DE GASTOS',
    `${plural(gastos.length, 'factura', 'facturas')} · ${plural(porCategoria.length, 'categoría', 'categorías')}`,
  )

  // ── Recuadro principal de total de gastos
  {
    const ALTO = 22
    doc.setFillColor('#faf8f6').setDrawColor(MARCA).setLineWidth(0.6)
    doc.roundedRect(IZQ, y, ANCHO, ALTO, 1.2, 1.2, 'FD')
    const xSep = DER - 74
    doc.setDrawColor('#d6d3d1').setLineWidth(0.3).line(xSep, y + 3, xSep, y + ALTO - 3)

    doc.setFont('helvetica', 'bold').setFontSize(7.6).setTextColor(ROTULO)
    doc.text('TOTAL DE GASTOS OPERATIVOS DEL PERÍODO', IZQ + 4, y + 5.5)
    doc.setTextColor('#111111')
    enUnaLinea(doc, montoPrincipal(total, d.moneda), IZQ + 4, y + 13.5, xSep - IZQ - 8, 18, 'bold')
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
    const subIzq =
      d.moneda === 'AMBAS'
        ? `Equivalente en bolívares: ${dinero('VES', total.bs)}`
        : d.categorias !== 'Todas'
          ? `Categorías seleccionadas: ${d.categorias}`
          : 'Expresado a tasa BCV vigente a la fecha de cada factura'
    doc.text(ajustar(doc, subIzq, xSep - IZQ - 8), IZQ + 4, y + 18.5)

    doc.setFont('helvetica', 'bold').setFontSize(7.2).setTextColor(MARCA)
    doc.text('FACTURACIÓN EN MONEDA DE ORIGEN', DER - 4, y + 5.5, { align: 'right' })
    doc.setTextColor('#111111')
    enUnaLinea(doc, originalesTexto, DER - 4, y + 12.5, 67, 9.5, 'bold', 'right', 6.5)
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(GRIS)
    doc.text(
      ajustar(doc, `${plural(gastos.length, 'factura vigente procesada', 'facturas vigentes procesadas')}`, 67),
      DER - 4,
      y + 18.5,
      { align: 'right' },
    )
    y += ALTO + 4
  }

  // ── Tres tarjetas ejecutivas
  {
    const GAP = 4
    const w = (ANCHO - GAP * 2) / 3
    const H = 25
    const mayorCat = porCategoria[0]

    const tarjeta = (i: number, acento: string, tituloT: string) => {
      const x = IZQ + i * (w + GAP)
      doc.setFillColor('#ffffff').setDrawColor('#d6d3d1').setLineWidth(0.28)
      doc.roundedRect(x, y, w, H, 1.3, 1.3, 'FD')
      doc.setFillColor(acento).rect(x, y, 2, H, 'F')
      doc.setTextColor(acento)
      enUnaLinea(doc, tituloT, x + 4.5, y + 4.8, w - 6.5, 6.7, 'bold')
      return x + 4.5
    }

    // 1. Documentos procesados
    let x = tarjeta(0, ROTULO, 'DOCUMENTOS PROCESADOS')
    doc.setTextColor('#1c1917')
    enUnaLinea(doc, plural(gastos.length, 'factura vigente', 'facturas vigentes'), x, y + 11.5, w - 7, 11, 'bold', 'left', 8)
    doc.setFont('helvetica', 'bold').setFontSize(6.9).setTextColor(TINTA)
    const prom = gastos.length > 0 ? valorManda(total, d.moneda) / gastos.length : 0
    doc.text(ajustar(doc, `Promedio: ${dinero(manda, prom)} por factura`, w - 7), x, y + 16.5)
    doc.setFont('helvetica', 'normal').setFontSize(6.6).setTextColor(GRIS)
    doc.text(ajustar(doc, `${plural(proveedoresUnicos, 'proveedor registrado', 'proveedores registrados')}`, w - 7), x, y + 21)

    // 2. Mayor categoría de gasto
    x = tarjeta(1, AMBAR, 'MAYOR CATEGORÍA DE GASTO')
    doc.setTextColor('#1c1917')
    enUnaLinea(doc, mayorCat ? mayorCat.nombre : 'Sin registros', x, y + 11.5, w - 7, 10.5, 'bold', 'left', 7.2)
    doc.setFont('helvetica', 'bold').setFontSize(6.9).setTextColor(TINTA)
    doc.text(
      ajustar(doc, mayorCat ? `${montoPrincipal(mayorCat.m, d.moneda)} · ${plural(mayorCat.n, 'factura', 'facturas')}` : '—', w - 7),
      x,
      y + 16.5,
    )
    doc.setFont('helvetica', 'normal').setFontSize(6.6).setTextColor(GRIS)
    doc.text(
      ajustar(doc, mayorCat ? `Representa el ${porcentajeTexto(mayorCat.m, total, d.moneda)} del total` : '—', w - 7),
      x,
      y + 21,
    )

    // 3. Moneda de emisión original
    x = tarjeta(2, MARCA, 'MONEDA DE EMISIÓN ORIGINAL')
    const xDer = x + w - 8
    doc.setFont('helvetica', 'normal').setFontSize(6.6).setTextColor(TINTA)
    doc.text(`Emitidas en USD (${usdDocs.length})`, x, y + 10.3)
    doc.setTextColor('#1c1917')
    enUnaLinea(doc, dinero('USD', usdOrig), xDer, y + 10.3, 24, 6.7, 'bold', 'right')

    doc.setFont('helvetica', 'normal').setFontSize(6.6).setTextColor(TINTA)
    doc.text(`Emitidas en VES (${vesDocs.length})`, x, y + 15.1)
    doc.setTextColor('#1c1917')
    enUnaLinea(doc, dinero('VES', vesOrig), xDer, y + 15.1, 26, 6.7, 'bold', 'right')

    doc.setDrawColor(HAIRLINE).setLineWidth(0.2).line(x, y + 17.4, xDer, y + 17.4)
    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(GRIS)
    const etEquiv = otrasDocs.length > 0 ? `Equiv. VES + otras (${otrasDocs.length})` : 'Equiv. VES en USD'
    doc.text(ajustar(doc, etEquiv, w - 31), x, y + 21.1)
    enUnaLinea(doc, dinero('USD', vesEquivUsd + otrasEquivUsd), xDer, y + 21.1, 24, 6.6, 'bold', 'right')

    y += H + 6
  }

  // ── Función auxiliar para tablas de resumen de gastos (Categoría / Período)
  const pintarTablaResumenGastos = (
    tituloSec: string,
    subSec: string,
    col1Titulo: string,
    filas: Array<{ nombre: string; n: number; m: Monto }>,
    etiquetaCierre: string,
  ) => {
    if (y + 30 > LIMITE) y = nuevaHoja()
    y = tituloSeccion(doc, y, tituloSec, subSec, AMBAR)

    const ambas = d.moneda === 'AMBAS'
    const c1 = { x: IZQ, w: ambas ? 68 : 94 }
    const cDoc = { x: c1.x + c1.w, w: 22 }
    const cBs = { x: cDoc.x + cDoc.w, w: ambas ? 32 : 0 }
    const cUsd = { x: cBs.x + cBs.w, w: ambas ? 26 : 32 }
    const cPct = { x: cUsd.x + cUsd.w, w: 30 }
    const divs = ambas ? [cDoc.x, cBs.x, cUsd.x, cPct.x] : [cDoc.x, cUsd.x, cPct.x]

    const pintarCab = (yy: number) => {
      const H = 7.6
      doc.setFillColor(MARCA).rect(IZQ, yy, ANCHO, H, 'F')
      doc.setDrawColor('#b05646').setLineWidth(0.22)
      for (const x of divs) doc.line(x, yy + 1.3, x, yy + H - 1.3)
      const yt = yy + 5
      doc.setFont('helvetica', 'bold').setFontSize(6.8).setTextColor('#FFFFFF')
      doc.text(col1Titulo, c1.x + 2, yt)
      doc.text('FACTURAS', cDoc.x + cDoc.w / 2, yt, { align: 'center' })
      if (ambas) {
        doc.text('TOTAL BS', cBs.x + cBs.w - 2, yt, { align: 'right' })
        doc.text('TOTAL $', cUsd.x + cUsd.w - 2, yt, { align: 'right' })
      } else {
        doc.text(d.moneda === 'USD' ? 'TOTAL $' : 'TOTAL BS', cUsd.x + cUsd.w - 2, yt, { align: 'right' })
      }
      doc.text('% DEL TOTAL', cPct.x + 2, yt)
      return yy + H
    }

    let yIni = y
    y = pintarCab(y)
    const cerrarT = (yFin: number) => {
      doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
      doc.line(IZQ, yIni, IZQ, yFin)
      doc.line(DER, yIni, DER, yFin)
      doc.setDrawColor(MARCA).setLineWidth(0.5).line(IZQ, yFin, DER, yFin)
    }

    filas.forEach((f, i) => {
      const H = 8
      if (y + H > LIMITE) {
        cerrarT(y)
        y = nuevaHoja()
        yIni = y
        y = pintarCab(y)
      }
      doc.setFillColor(i % 2 === 1 ? FILA_ALTERNA : '#ffffff').rect(IZQ, y, ANCHO, H, 'F')
      doc.setDrawColor(HAIRLINE).setLineWidth(0.22)
      for (const x of divs) doc.line(x, y, x, y + H)
      doc.line(IZQ, y + H, DER, y + H)

      const yb = y + 5.1
      doc.setTextColor('#1c1917')
      enUnaLinea(doc, f.nombre, c1.x + 2, yb, c1.w - 4, 7.4, 'bold')

      doc.setFont('helvetica', 'bold').setFontSize(7.4).setTextColor(TINTA)
      doc.text(String(f.n), cDoc.x + cDoc.w / 2, yb, { align: 'center' })

      if (ambas) {
        doc.setTextColor(TINTA)
        enUnaLinea(doc, dinero('VES', f.m.bs), cBs.x + cBs.w - 2, yb, cBs.w - 3.5, 7.2, 'normal', 'right')
        doc.setTextColor('#1c1917')
        enUnaLinea(doc, dinero('USD', f.m.usd), cUsd.x + cUsd.w - 2, yb, cUsd.w - 3.5, 7.5, 'bold', 'right')
      } else {
        doc.setTextColor('#1c1917')
        enUnaLinea(doc, montoPrincipal(f.m, d.moneda), cUsd.x + cUsd.w - 2, yb, cUsd.w - 3.5, 7.5, 'bold', 'right')
      }

      const pct = ratioPorcentaje(f.m, total, d.moneda)
      const anchoB = cPct.w - 4
      doc.setFillColor('#e7e5e4').rect(cPct.x + 2, y + 2.2, anchoB, 1.8, 'F')
      if (pct > 0) {
        doc.setFillColor(MARCA).rect(cPct.x + 2, y + 2.2, Math.max(0.6, (anchoB * Math.min(100, pct)) / 100), 1.8, 'F')
      }
      doc.setFont('helvetica', 'normal').setFontSize(6.3).setTextColor(GRIS)
      doc.text(`${decimal1.format(pct)} %`, cPct.x + 2, y + 6.4)
      y += H
    })
    cerrarT(y)

    const HC = 8
    if (y + HC > LIMITE) y = nuevaHoja()
    doc.setFillColor('#faf8f6').setDrawColor(MARCA).setLineWidth(0.4).rect(IZQ, y, ANCHO, HC, 'FD')
    doc.setFont('helvetica', 'bold').setFontSize(7.6).setTextColor(MARCA)
    doc.text(ajustar(doc, etiquetaCierre, 100), IZQ + 3.5, y + 5.1)
    doc.setTextColor('#111111')
    const derTexto = ambas ? `${dinero('VES', total.bs)}   ·   ${dinero('USD', total.usd)}` : montoPrincipal(total, d.moneda)
    enUnaLinea(doc, derTexto, DER - 3.5, y + 5.1, 72, 7.6, 'bold', 'right')
    y += HC + 5
  }

  pintarTablaResumenGastos(
    'Ejecución de gastos por categoría',
    'Ordenado de mayor a menor monto devengado',
    'CATEGORÍA',
    porCategoria,
    `TOTAL GENERAL (${plural(porCategoria.length, 'CATEGORÍA', 'CATEGORÍAS')} · ${plural(gastos.length, 'FACTURA', 'FACTURAS')})`,
  )

  pintarTablaResumenGastos(
    `Evolución de gastos por ${NOMBRE_AGRUPAR[d.agrupar].toLowerCase()}`,
    `Distribución ${ADJETIVO_AGRUPAR[d.agrupar]} de las facturas registradas en el período`,
    NOMBRE_AGRUPAR[d.agrupar].toUpperCase(),
    porPeriodo.map(([k, gs]) => ({ nombre: nombrePeriodo(k, d.agrupar), n: gs.length, m: sumar(gs) })),
    `TOTAL ACUMULADO (${plural(porPeriodo.length, 'PERÍODO', 'PERÍODOS')} · ${plural(gastos.length, 'FACTURA', 'FACTURAS')})`,
  )

  doc.setFont('helvetica', 'italic').setFontSize(6.8).setTextColor(GRIS)
  const notaPie = doc.splitTextToSize(
    'Cada factura de gasto se convierte a su equivalente con la tasa BCV vigente a la fecha del documento. Los montos originales emitidos en bolívares y en dólares no se suman directamente entre sí.' +
      notaDeNomina(gastos),
    ANCHO,
  ) as string[]
  doc.text(notaPie, IZQ, y - 1, { lineHeightFactor: 1.3 })
  y += notaPie.length * 3.1 + 2

  // ── Detalle opcional de facturas de gasto
  if (d.conDetalle && gastos.length > 0) {
    y = pintarTablaDetalleGastos(
      doc,
      y,
      nuevaHoja,
      'Relación detallada de facturas de gasto',
      'Facturas vigentes del período con su categoría, proveedor y equivalentes a tasa BCV',
      gastos,
      d.moneda,
    )
  }

  // ── Facturas anuladas (auditoría)
  if (anuladas.length > 0) {
    if (y + 30 > LIMITE) y = nuevaHoja()
    else y += 2
    y = tituloSeccion(
      doc,
      y,
      'Facturas anuladas (registro de auditoría, no suman)',
      'Documentos dejados sin efecto durante el período',
      ROJO_VENCIDO,
    )
    const cF = { x: IZQ, w: 30 }
    const cP = { x: IZQ + 30, w: 72 }
    const cC = { x: IZQ + 102, w: 42 }
    const cM = { x: IZQ + 144, w: 34 }
    const divsA = [cP.x, cC.x, cM.x]

    const cabAnul = (yy: number) => {
      const H = 7
      doc.setFillColor('#f1efed').rect(IZQ, yy, ANCHO, H, 'F')
      doc.setDrawColor('#d6d3d1').setLineWidth(0.25).line(IZQ, yy + H, DER, yy + H)
      const yt = yy + 4.6
      doc.setFont('helvetica', 'bold').setFontSize(6.6).setTextColor(TINTA)
      doc.text('FECHA / REGISTRO', cF.x + 2, yt)
      doc.text('PROVEEDOR', cP.x + 2, yt)
      doc.text('CATEGORÍA', cC.x + 2, yt)
      doc.text('MONTO ORIGINAL', cM.x + cM.w - 2, yt, { align: 'right' })
      return yy + H
    }
    let yIniA = y
    y = cabAnul(y)
    anuladas.forEach((g, i) => {
      const H = 8.4
      if (y + H > LIMITE) {
        doc.setDrawColor(HAIRLINE).setLineWidth(0.25)
        doc.line(IZQ, yIniA, IZQ, y)
        doc.line(DER, yIniA, DER, y)
        y = nuevaHoja()
        yIniA = y
        y = cabAnul(y)
      }
      doc.setFillColor(i % 2 === 1 ? FILA_ALTERNA : '#ffffff').rect(IZQ, y, ANCHO, H, 'F')
      doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
      for (const x of divsA) doc.line(x, y, x, y + H)
      doc.line(IZQ, y + H, DER, y + H)
      const yb = y + 3.8
      doc.setTextColor('#1c1917')
      enUnaLinea(doc, fechaCorta(g.fecha), cF.x + 2, yb, cF.w - 4, 7.1, 'bold')
      if (g.numero) {
        doc.setFont('helvetica', 'normal').setFontSize(6.2).setTextColor(GRIS)
        doc.text(ajustar(doc, g.numero, cF.w - 4), cF.x + 2, yb + 3.3)
      }
      doc.setTextColor(TINTA)
      enUnaLinea(doc, g.contraparte, cP.x + 2, yb + 1.2, cP.w - 4, 7.1, 'normal')
      enUnaLinea(doc, g.categoria_nombre ?? '—', cC.x + 2, yb + 1.2, cC.w - 4, 6.9, 'normal')
      enUnaLinea(doc, dinero(g.moneda, g.monto), cM.x + cM.w - 2, yb + 1.2, cM.w - 4, 7.1, 'bold', 'right')
      y += H
    })
    doc.setDrawColor(HAIRLINE).setLineWidth(0.25)
    doc.line(IZQ, yIniA, IZQ, y)
    doc.line(DER, yIniA, DER, y)
    doc.setDrawColor(ROTULO).setLineWidth(0.45).line(IZQ, y, DER, y)
    y += 5
  }

  return cerrarDocumento(doc, titulo, d.emitidoPor, d.nombreArchivo)
}

// ──────────────── 2. COMPARATIVO EJECUTIVO DE GASTOS Y VENTAS ────────────────

export async function armarComparativoGastosVentas(d: DatosDelComparativo): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = d.conLogo ? await logoComoImagen(600, false) : ''
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const titulo = 'Comparativo de gastos y ventas'

  const ventas = d.documentos.filter((x) => x.tipo === 'VENTA')
  const porCobrar = d.documentos.filter((x) => x.tipo === 'POR_COBRAR')
  const gastos = d.documentos.filter((x) => x.tipo === 'GASTO')
  const compras = d.conCompras ? d.documentos.filter((x) => x.tipo === 'COMPRA') : []
  const salidas = [...gastos, ...compras]

  const tVentas = sumar(ventas)
  const tGastos = sumar(gastos)
  const tCompras = sumar(compras)
  const tSalidas = sumar(salidas)
  const diferencia: Monto = { usd: tVentas.usd - tSalidas.usd, bs: tVentas.bs - tSalidas.bs }
  const manda = codigoManda(d.moneda)
  const ambas = d.moneda === 'AMBAS'

  const valVentas = valorManda(tVentas, d.moneda)
  const valSalidas = valorManda(tSalidas, d.moneda)
  const valDif = valorManda(diferencia, d.moneda)
  const esSuperavit = valDif >= 0
  const pctAbsorcion = valVentas > 0 ? (valSalidas / valVentas) * 100 : 0
  const pctMargen = valVentas > 0 ? Math.max(0, 100 - pctAbsorcion) : 0

  const porCategoria = [...agruparPor(salidas, (g) => g.categoria_nombre ?? 'Sin categoría')]
    .map(([nombre, gs]) => ({ nombre, n: gs.length, m: sumar(gs) }))
    .sort((a, b) => valorManda(b.m, d.moneda) - valorManda(a.m, d.moneda))

  const porCliente = [...agruparPor(ventas, (v) => v.contraparte)]
    .map(([nombre, vs]) => ({ nombre, rif: vs[0].documento, n: vs.length, m: sumar(vs) }))
    .sort((a, b) => valorManda(b.m, d.moneda) - valorManda(a.m, d.moneda))

  const nuevaHoja = () => {
    doc.addPage()
    return cabeceraCorta(doc, logo, d, titulo)
  }

  const regTexto = `${plural(ventas.length, 'venta', 'ventas')} · ${plural(gastos.length, 'gasto', 'gastos')}${
    d.conCompras && compras.length ? ` · ${plural(compras.length, 'compra', 'compras')}` : ''
  }`

  let y = cabecera(doc, logo, d, 'COMPARATIVO GASTOS Y VENTAS', regTexto)

  // ── Panel principal: Balance Operativo y Comparación Visual Intuitiva
  {
    const hayNotaPorCobrar = d.conPorCobrar && porCobrar.length > 0
    const ALTO = hayNotaPorCobrar ? 42.5 : 35.5
    doc.setFillColor('#faf8f6').setDrawColor(MARCA).setLineWidth(0.6)
    doc.roundedRect(IZQ, y, ANCHO, ALTO, 1.3, 1.3, 'FD')

    // Encabezado del panel con pastilla de estado
    doc.setTextColor(ROTULO)
    const tituloPanel = d.conCompras
      ? 'BALANCE OPERATIVO DEL PERÍODO (VENTAS VS. GASTOS Y COMPRAS)'
      : 'BALANCE OPERATIVO DEL PERÍODO (VENTAS COBRADAS VS. GASTOS REGISTRADOS)'
    enUnaLinea(doc, tituloPanel, IZQ + 4, y + 5.2, ANCHO - 58, 7.2, 'bold')

    const textoPastilla =
      valVentas > 0 && esSuperavit
        ? `Superávit · Margen neto ${decimal1.format(pctMargen)} %`
        : esSuperavit
          ? 'Equilibrio operativo'
          : `Déficit operativo`
    pastilla(
      doc,
      textoPastilla,
      DER - 4,
      y + 5.1,
      50,
      esSuperavit ? P_SUPERAVIT : P_DEFICIT,
      5.9,
    )

    // Tres columnas financieras principales
    const yCols = y + 7.5
    const wCol = (ANCHO - 8) / 3
    const xCol2 = IZQ + 4 + wCol
    const xCol3 = IZQ + 4 + wCol * 2
    doc.setDrawColor('#d6d3d1').setLineWidth(0.28)
    doc.line(xCol2, yCols + 1, xCol2, yCols + 14.5)
    doc.line(xCol3, yCols + 1, xCol3, yCols + 14.5)

    // Columna 1: Ingresos por ventas
    doc.setFont('helvetica', 'bold').setFontSize(6.7).setTextColor(GRIS)
    doc.text(`INGRESOS POR VENTAS (${plural(ventas.length, 'NOTA', 'NOTAS')})`, IZQ + 4, yCols + 3.8)
    doc.setTextColor('#111111')
    enUnaLinea(doc, montoPrincipal(tVentas, d.moneda), IZQ + 4, yCols + 10.2, wCol - 5, 13.5, 'bold')
    doc.setFont('helvetica', 'normal').setFontSize(6.8).setTextColor(GRIS)
    doc.text(
      ambas ? `Equiv. ${dinero('VES', tVentas.bs)}` : 'Notas despachadas y cobradas',
      IZQ + 4,
      yCols + 14.2,
    )

    // Columna 2: Egresos por gastos (y compras)
    const rotuloEgreso = d.conCompras
      ? `EGRESOS: GASTOS + COMPRAS (${salidas.length})`
      : `EGRESOS POR GASTOS (${plural(gastos.length, 'FACT.', 'FACT.')})`
    doc.setFont('helvetica', 'bold').setFontSize(6.7).setTextColor(AMBAR)
    doc.text(ajustar(doc, rotuloEgreso, wCol - 6), xCol2 + 3.5, yCols + 3.8)
    doc.setTextColor('#111111')
    enUnaLinea(doc, montoPrincipal(tSalidas, d.moneda), xCol2 + 3.5, yCols + 10.2, wCol - 6, 13.5, 'bold')
    doc.setFont('helvetica', 'normal').setFontSize(6.8).setTextColor(GRIS)
    const subEgreso = ambas
      ? `Equiv. ${dinero('VES', tSalidas.bs)} (${porcentajeTexto(tSalidas, tVentas, d.moneda)})`
      : `Absorción: ${porcentajeTexto(tSalidas, tVentas, d.moneda)} de las ventas`
    doc.text(ajustar(doc, subEgreso, wCol - 6), xCol2 + 3.5, yCols + 14.2)

    // Columna 3: Resultado neto del período
    const colorNeto = esSuperavit ? VERDE : ROJO_VENCIDO
    doc.setFont('helvetica', 'bold').setFontSize(6.7).setTextColor(colorNeto)
    doc.text('RESULTADO NETO DEL PERÍODO', DER - 4, yCols + 3.8, { align: 'right' })
    const signo = valDif > 0 ? '+ ' : valDif < 0 ? '- ' : ''
    doc.setTextColor(colorNeto)
    enUnaLinea(doc, `${signo}${dinero(manda, Math.abs(valDif))}`, DER - 4, yCols + 10.2, wCol - 5, 13.5, 'bold', 'right')
    doc.setFont('helvetica', 'bold').setFontSize(6.8).setTextColor(TINTA)
    const subNeto = ambas
      ? `Equiv. ${diferencia.bs < 0 ? '- ' : ''}${dinero('VES', Math.abs(diferencia.bs))}`
      : esSuperavit
        ? 'Saldo favorable del período'
        : 'Egresos superiores a las ventas'
    doc.text(ajustar(doc, subNeto, wCol - 5), DER - 4, yCols + 14.2, { align: 'right' })

    // Separador y barra comparativa proporcional de absorción vs. margen
    const yBarraTop = yCols + 16.5
    doc.setDrawColor('#e5e0dc').setLineWidth(0.25).line(IZQ + 4, yBarraTop, DER - 4, yBarraTop)

    const izqBarraTxt = `Absorción por ${d.conCompras ? 'egresos' : 'gastos operativos'}: ${porcentajeTexto(tSalidas, tVentas, d.moneda)} (${montoPrincipal(tSalidas, d.moneda)})`
    const derBarraTxt =
      valVentas > 0 && esSuperavit
        ? `Margen neto sobre ventas: ${decimal1.format(pctMargen)} % (${montoPrincipal(diferencia, d.moneda)})`
        : !esSuperavit
          ? `Exceso de egresos sobre ventas: - ${dinero(manda, Math.abs(valDif))}`
          : 'Sin ingresos registrados en el período'

    doc.setTextColor(AMBAR)
    enUnaLinea(doc, izqBarraTxt, IZQ + 4, yBarraTop + 4, (ANCHO - 10) / 2, 6.7, 'bold')
    doc.setTextColor(colorNeto)
    enUnaLinea(doc, derBarraTxt, DER - 4, yBarraTop + 4, (ANCHO - 10) / 2, 6.7, 'bold', 'right')

    const wBarra = ANCHO - 8
    const yB = yBarraTop + 5.6
    doc.setFillColor('#e7e5e4').roundedRect(IZQ + 4, yB, wBarra, 2.5, 1.1, 1.1, 'F')
    if (valVentas > 0 || valSalidas > 0) {
      const frGasto = valVentas > 0 ? Math.min(1, Math.max(0, valSalidas / valVentas)) : 1
      if (frGasto > 0) {
        doc.setFillColor(esSuperavit ? AMBAR_BARRA : '#dc2626').rect(IZQ + 4, yB, wBarra * frGasto, 2.5, 'F')
      }
      if (frGasto < 1 && valVentas > 0) {
        doc.setFillColor(VERDE).rect(IZQ + 4 + wBarra * frGasto, yB, wBarra * (1 - frGasto), 2.5, 'F')
      }
    }

    // Nota integrada de cuentas por cobrar excluidas
    if (hayNotaPorCobrar) {
      const yNota = yB + 4.3
      doc.setDrawColor('#e5e0dc').setLineWidth(0.22).line(IZQ + 4, yNota, DER - 4, yNota)
      const mPorCobrar = sumar(porCobrar)
      doc.setFont('helvetica', 'bold').setFontSize(6.6).setTextColor(TINTA)
      doc.text(
        ajustar(
          doc,
          `Cuentas por cobrar excluidas del ingreso: ${plural(porCobrar.length, 'nota de entrega despachada pendiente', 'notas de entrega despachadas pendientes')} de cobro`,
          ANCHO - 68,
        ),
        IZQ + 4,
        yNota + 4.2,
      )
      doc.setTextColor(ROJO_VENCIDO)
      enUnaLinea(doc, enLinea(mPorCobrar, d.moneda), DER - 4, yNota + 4.2, 60, 6.8, 'bold', 'right')
    }

    y += ALTO + 3.8
  }

  // ── Tres tarjetas ejecutivas de síntesis
  {
    const GAP = 4
    const w = (ANCHO - GAP * 2) / 3
    const H = 24
    const mayorCat = porCategoria[0]

    const tarjeta = (i: number, acento: string, tituloT: string) => {
      const x = IZQ + i * (w + GAP)
      doc.setFillColor('#ffffff').setDrawColor('#d6d3d1').setLineWidth(0.28)
      doc.roundedRect(x, y, w, H, 1.3, 1.3, 'FD')
      doc.setFillColor(acento).rect(x, y, 2, H, 'F')
      doc.setTextColor(acento)
      enUnaLinea(doc, tituloT, x + 4.5, y + 4.6, w - 6.5, 6.6, 'bold')
      return x + 4.5
    }

    // 1. Desempeño comercial
    let x = tarjeta(0, VERDE, 'DESEMPEÑO COMERCIAL')
    doc.setTextColor('#1c1917')
    enUnaLinea(doc, plural(ventas.length, 'nota liquidada', 'notas liquidadas'), x, y + 11.2, w - 7, 10.5, 'bold', 'left', 8)
    doc.setFont('helvetica', 'bold').setFontSize(6.8).setTextColor(TINTA)
    const promVenta = ventas.length > 0 ? valVentas / ventas.length : 0
    doc.text(ajustar(doc, `Promedio: ${dinero(manda, promVenta)} por nota`, w - 7), x, y + 16)
    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(GRIS)
    doc.text(ajustar(doc, `${plural(porCliente.length, 'cliente con despacho cobrado', 'clientes con despachos cobrados')}`, w - 7), x, y + 20.4)

    // 2. Concentración del gasto
    x = tarjeta(1, AMBAR, 'CONCENTRACIÓN DEL GASTO')
    doc.setTextColor('#1c1917')
    enUnaLinea(
      doc,
      `${plural(salidas.length, 'documento', 'documentos')} · ${plural(porCategoria.length, 'rubro', 'rubros')}`,
      x,
      y + 11.2,
      w - 7,
      10.5,
      'bold',
      'left',
      7.5,
    )
    doc.setFont('helvetica', 'bold').setFontSize(6.8).setTextColor(TINTA)
    doc.text(ajustar(doc, mayorCat ? `Mayor rubro: ${mayorCat.nombre}` : 'Sin gastos en el período', w - 7), x, y + 16)
    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(GRIS)
    doc.text(
      ajustar(
        doc,
        mayorCat ? `${montoPrincipal(mayorCat.m, d.moneda)} (${porcentajeTexto(mayorCat.m, tSalidas, d.moneda)} del egreso)` : '—',
        w - 7,
      ),
      x,
      y + 20.4,
    )

    // 3. Relación egreso / ingreso
    x = tarjeta(2, ROTULO, 'RELACIÓN EGRESO / INGRESO')
    const baseUnidad = manda === 'VES' ? 100 : 1
    const gastoPorUnidad = valVentas > 0 ? (valSalidas / valVentas) * baseUnidad : 0
    doc.setTextColor('#1c1917')
    enUnaLinea(
      doc,
      valVentas > 0 ? `${dinero(manda, gastoPorUnidad)} por cada ${dinero(manda, baseUnidad)}` : 'Sin ventas cobradas',
      x,
      y + 11.2,
      w - 7,
      10.2,
      'bold',
      'left',
      7.2,
    )
    doc.setFont('helvetica', 'bold').setFontSize(6.8).setTextColor(esSuperavit ? VERDE : ROJO_VENCIDO)
    doc.text(
      ajustar(
        doc,
        valVentas > 0
          ? esSuperavit
            ? `Retención operativa: ${decimal1.format(pctMargen)} %`
            : `Absorción total: ${decimal1.format(pctAbsorcion)} %`
          : '—',
        w - 7,
      ),
      x,
      y + 16,
    )
    doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(GRIS)
    doc.text(
      ajustar(doc, d.categorias !== 'Todas' ? `Categorías: ${d.categorias}` : 'Calculado a tasa BCV de cada doc.', w - 7),
      x,
      y + 20.4,
    )

    y += H + 5.5
  }

  // ── Tabla 1: Evolución comparativa por período
  {
    y = tituloSeccion(
      doc,
      y,
      'Evolución comparativa por período',
      `Agrupación ${ADJETIVO_AGRUPAR[d.agrupar]} de ingresos cobrados frente a egresos registrados`,
      MARCA,
    )

    const clave = (x: DocumentoDelInforme) => clavePeriodo(x.fecha, d.agrupar)
    const vPer = agruparPor(ventas, clave)
    const gPer = agruparPor(gastos, clave)
    const cPer = agruparPor(compras, clave)
    const periodos = [...new Set([...vPer.keys(), ...gPer.keys(), ...cPer.keys()])].sort()

    const conC = d.conCompras
    const cPerCol = { x: IZQ, w: conC ? 28 : 34 }
    const cVenCol = { x: cPerCol.x + cPerCol.w, w: conC ? 26 : 32 }
    const cGasCol = { x: cVenCol.x + cVenCol.w, w: conC ? 26 : 32 }
    const cComCol = { x: cGasCol.x + cGasCol.w, w: conC ? 26 : 0 }
    const cNetCol = { x: cComCol.x + cComCol.w, w: conC ? 28 : 33 }
    const cAbsCol = { x: cNetCol.x + cNetCol.w, w: conC ? 26 : 29 }
    const cBalCol = { x: cAbsCol.x + cAbsCol.w, w: 18 }
    const divsP = conC
      ? [cVenCol.x, cGasCol.x, cComCol.x, cNetCol.x, cAbsCol.x, cBalCol.x]
      : [cVenCol.x, cGasCol.x, cNetCol.x, cAbsCol.x, cBalCol.x]

    const cabPeriodo = (yy: number) => {
      const H = 7.6
      doc.setFillColor(MARCA).rect(IZQ, yy, ANCHO, H, 'F')
      doc.setDrawColor('#b05646').setLineWidth(0.22)
      for (const x of divsP) doc.line(x, yy + 1.3, x, yy + H - 1.3)
      const yt = yy + 5
      doc.setTextColor('#FFFFFF')
      enUnaLinea(doc, 'PERÍODO', cPerCol.x + 2, yt, cPerCol.w - 3, 6.6, 'bold')
      enUnaLinea(doc, conC ? 'VENTAS' : 'VENTAS COBRADAS', cVenCol.x + cVenCol.w - 1.8, yt, cVenCol.w - 3, 6.6, 'bold', 'right')
      enUnaLinea(doc, conC ? 'GASTOS' : 'GASTOS OPERATIVOS', cGasCol.x + cGasCol.w - 1.8, yt, cGasCol.w - 3, 6.6, 'bold', 'right')
      if (conC) enUnaLinea(doc, 'COMPRAS', cComCol.x + cComCol.w - 1.8, yt, cComCol.w - 3, 6.6, 'bold', 'right')
      enUnaLinea(doc, 'RESULTADO NETO', cNetCol.x + cNetCol.w - 1.8, yt, cNetCol.w - 3, 6.6, 'bold', 'right')
      enUnaLinea(doc, '% ABSORCIÓN', cAbsCol.x + 2, yt, cAbsCol.w - 3, 6.6, 'bold')
      enUnaLinea(doc, 'BALANCE', cBalCol.x + cBalCol.w - 1.5, yt, cBalCol.w - 2.5, 6.6, 'bold', 'right')
      return yy + H
    }

    let yIniP = y
    y = cabPeriodo(y)
    const cerrarP = (yFin: number) => {
      doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
      doc.line(IZQ, yIniP, IZQ, yFin)
      doc.line(DER, yIniP, DER, yFin)
      doc.setDrawColor(MARCA).setLineWidth(0.5).line(IZQ, yFin, DER, yFin)
    }

    const pintarCeldaMontoDoble = (m: Monto, col: { x: number; w: number }, yb: number, colorPrincipal = '#1c1917', prefijo = '') => {
      doc.setTextColor(colorPrincipal)
      const val = valorManda(m, d.moneda)
      const txtP = `${prefijo}${dinero(manda, Math.abs(val))}`
      enUnaLinea(doc, txtP, col.x + col.w - 1.8, yb, col.w - 3.2, 7.3, 'bold', 'right')
      if (ambas) {
        doc.setTextColor(GRIS)
        const txtB = `${m.bs < 0 ? '- ' : ''}${dinero('VES', Math.abs(m.bs))}`
        enUnaLinea(doc, txtB, col.x + col.w - 1.8, yb + 3.3, col.w - 3.2, 6.1, 'normal', 'right')
      }
    }

    periodos.forEach((k, i) => {
      const H = ambas ? 9.2 : 7.8
      if (y + H > LIMITE) {
        cerrarP(y)
        y = nuevaHoja()
        yIniP = y
        y = cabPeriodo(y)
      }
      doc.setFillColor(i % 2 === 1 ? FILA_ALTERNA : '#ffffff').rect(IZQ, y, ANCHO, H, 'F')
      doc.setDrawColor(HAIRLINE).setLineWidth(0.22)
      for (const x of divsP) doc.line(x, y, x, y + H)
      doc.line(IZQ, y + H, DER, y + H)

      const vs = vPer.get(k) ?? []
      const gs = gPer.get(k) ?? []
      const cs = cPer.get(k) ?? []
      const v = sumar(vs)
      const g = sumar(gs)
      const c = sumar(cs)
      const s: Monto = { usd: g.usd + c.usd, bs: g.bs + c.bs }
      const dif: Monto = { usd: v.usd - s.usd, bs: v.bs - s.bs }
      const difVal = valorManda(dif, d.moneda)
      const sup = difVal >= 0

      const yb = y + (ambas ? 4.0 : 4.9)
      doc.setTextColor('#1c1917')
      enUnaLinea(doc, nombrePeriodo(k, d.agrupar), cPerCol.x + 2, yb, cPerCol.w - 3.5, 7.2, 'bold')
      if (ambas) {
        doc.setFont('helvetica', 'normal').setFontSize(6.0).setTextColor(GRIS)
        doc.text(
          ajustar(doc, `${vs.length} vta. · ${gs.length + cs.length} egr.`, cPerCol.w - 3.5),
          cPerCol.x + 2,
          yb + 3.3,
        )
      }

      pintarCeldaMontoDoble(v, cVenCol, yb)
      pintarCeldaMontoDoble(g, cGasCol, yb)
      if (conC) pintarCeldaMontoDoble(c, cComCol, yb)
      pintarCeldaMontoDoble(dif, cNetCol, yb, sup ? VERDE : ROJO_VENCIDO, difVal > 0 ? '+ ' : difVal < 0 ? '- ' : '')

      // Barra de absorción en la fila
      const vVal = valorManda(v, d.moneda)
      const sVal = valorManda(s, d.moneda)
      const pct = vVal > 0 ? (sVal / vVal) * 100 : 0
      const anchoB = cAbsCol.w - 4
      doc.setFillColor('#e7e5e4').rect(cAbsCol.x + 2, y + 2.3, anchoB, 1.8, 'F')
      if (vVal > 0 || sVal > 0) {
        const fr = vVal > 0 ? Math.min(1, Math.max(0, sVal / vVal)) : 1
        if (fr > 0) doc.setFillColor(sup ? AMBAR_BARRA : '#dc2626').rect(cAbsCol.x + 2, y + 2.3, anchoB * fr, 1.8, 'F')
        if (fr < 1 && vVal > 0) doc.setFillColor(VERDE).rect(cAbsCol.x + 2 + anchoB * fr, y + 2.3, anchoB * (1 - fr), 1.8, 'F')
      }
      doc.setFont('helvetica', 'normal').setFontSize(6.1).setTextColor(GRIS)
      doc.text(vVal > 0 ? `${decimal1.format(pct)} % gasto` : '—', cAbsCol.x + 2, y + (ambas ? 6.9 : 6.4))

      pastilla(
        doc,
        sup ? 'Superávit' : 'Déficit',
        cBalCol.x + cBalCol.w - 1.3,
        y + H / 2 + 1.1,
        cBalCol.w - 2.2,
        sup ? P_SUPERAVIT : P_DEFICIT,
        5.7,
      )
      y += H
    })
    cerrarP(y)

    const HC = 8
    if (y + HC > LIMITE) y = nuevaHoja()
    doc.setFillColor('#faf8f6').setDrawColor(MARCA).setLineWidth(0.4).rect(IZQ, y, ANCHO, HC, 'FD')
    doc.setFont('helvetica', 'bold').setFontSize(7.4).setTextColor(MARCA)
    doc.text('TOTAL CONSOLIDADO DEL PERÍODO', IZQ + 3.5, y + 5.1)
    doc.setTextColor('#111111')
    const signoTot = valDif > 0 ? '+ ' : valDif < 0 ? '- ' : ''
    const resumenTot = `Ventas: ${montoPrincipal(tVentas, d.moneda)}  ·  ${
      conC ? 'Egresos' : 'Gastos'
    }: ${montoPrincipal(tSalidas, d.moneda)}  ·  Neto: ${signoTot}${dinero(manda, Math.abs(valDif))}`
    enUnaLinea(doc, resumenTot, DER - 3.5, y + 5.1, 114, 7.4, 'bold', 'right')
    y += HC + 4.8
  }

  // ── Tabla 2: Distribución de gastos por categoría
  if (porCategoria.length > 0) {
    if (y + 30 > LIMITE) y = nuevaHoja()
    y = tituloSeccion(
      doc,
      y,
      d.conCompras ? 'Distribución de gastos y compras por categoría' : 'Distribución de gastos por categoría',
      'Ordenado de mayor a menor participación e impacto sobre las ventas',
      AMBAR,
    )

    const cCat = { x: IZQ, w: ambas ? 56 : 76 }
    const cDoc = { x: cCat.x + cCat.w, w: ambas ? 20 : 22 }
    const cBs = { x: cDoc.x + cDoc.w, w: ambas ? 30 : 0 }
    const cUsd = { x: cBs.x + cBs.w, w: ambas ? 24 : 32 }
    const cPctG = { x: cUsd.x + cUsd.w, w: 28 }
    const cPctV = { x: cPctG.x + cPctG.w, w: 20 }
    const divsC = ambas ? [cDoc.x, cBs.x, cUsd.x, cPctG.x, cPctV.x] : [cDoc.x, cUsd.x, cPctG.x, cPctV.x]

    const cabCat = (yy: number) => {
      const H = 7.6
      doc.setFillColor(MARCA).rect(IZQ, yy, ANCHO, H, 'F')
      doc.setDrawColor('#b05646').setLineWidth(0.22)
      for (const x of divsC) doc.line(x, yy + 1.3, x, yy + H - 1.3)
      const yt = yy + 5
      doc.setFont('helvetica', 'bold').setFontSize(6.7).setTextColor('#FFFFFF')
      doc.text('CATEGORÍA', cCat.x + 2, yt)
      doc.text('DOCUMENTOS', cDoc.x + cDoc.w / 2, yt, { align: 'center' })
      if (ambas) {
        doc.text('TOTAL BS', cBs.x + cBs.w - 2, yt, { align: 'right' })
        doc.text('TOTAL $', cUsd.x + cUsd.w - 2, yt, { align: 'right' })
      } else {
        doc.text(d.moneda === 'USD' ? 'TOTAL $' : 'TOTAL BS', cUsd.x + cUsd.w - 2, yt, { align: 'right' })
      }
      doc.text('% DEL GASTO', cPctG.x + 2, yt)
      doc.text('% S/ VENTAS', cPctV.x + cPctV.w - 2, yt, { align: 'right' })
      return yy + H
    }

    let yIniC = y
    y = cabCat(y)
    const cerrarC = (yFin: number) => {
      doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
      doc.line(IZQ, yIniC, IZQ, yFin)
      doc.line(DER, yIniC, DER, yFin)
      doc.setDrawColor(MARCA).setLineWidth(0.5).line(IZQ, yFin, DER, yFin)
    }

    porCategoria.forEach((c, i) => {
      const H = 8
      if (y + H > LIMITE) {
        cerrarC(y)
        y = nuevaHoja()
        yIniC = y
        y = cabCat(y)
      }
      doc.setFillColor(i % 2 === 1 ? FILA_ALTERNA : '#ffffff').rect(IZQ, y, ANCHO, H, 'F')
      doc.setDrawColor(HAIRLINE).setLineWidth(0.22)
      for (const x of divsC) doc.line(x, y, x, y + H)
      doc.line(IZQ, y + H, DER, y + H)

      const yb = y + 5.1
      doc.setTextColor('#1c1917')
      enUnaLinea(doc, c.nombre, cCat.x + 2, yb, cCat.w - 4, 7.3, 'bold')

      doc.setFont('helvetica', 'bold').setFontSize(7.3).setTextColor(TINTA)
      doc.text(String(c.n), cDoc.x + cDoc.w / 2, yb, { align: 'center' })

      if (ambas) {
        doc.setTextColor(TINTA)
        enUnaLinea(doc, dinero('VES', c.m.bs), cBs.x + cBs.w - 2, yb, cBs.w - 3.5, 7.1, 'normal', 'right')
        doc.setTextColor('#1c1917')
        enUnaLinea(doc, dinero('USD', c.m.usd), cUsd.x + cUsd.w - 2, yb, cUsd.w - 3.5, 7.4, 'bold', 'right')
      } else {
        doc.setTextColor('#1c1917')
        enUnaLinea(doc, montoPrincipal(c.m, d.moneda), cUsd.x + cUsd.w - 2, yb, cUsd.w - 3.5, 7.4, 'bold', 'right')
      }

      const pctG = ratioPorcentaje(c.m, tSalidas, d.moneda)
      const anchoB = cPctG.w - 4
      doc.setFillColor('#e7e5e4').rect(cPctG.x + 2, y + 2.2, anchoB, 1.8, 'F')
      if (pctG > 0) {
        doc.setFillColor(AMBAR_BARRA).rect(cPctG.x + 2, y + 2.2, Math.max(0.6, (anchoB * Math.min(100, pctG)) / 100), 1.8, 'F')
      }
      doc.setFont('helvetica', 'normal').setFontSize(6.2).setTextColor(GRIS)
      doc.text(`${decimal1.format(pctG)} %`, cPctG.x + 2, y + 6.4)

      doc.setFont('helvetica', 'bold').setFontSize(7.1).setTextColor(TINTA)
      doc.text(porcentajeTexto(c.m, tVentas, d.moneda), cPctV.x + cPctV.w - 2, yb, { align: 'right' })
      y += H
    })
    cerrarC(y)

    const nominas = gastos.filter(esNomina)
    const conDesglose = d.conCompras || nominas.length > 0
    const HC = conDesglose ? 12.5 : 8
    if (y + HC > LIMITE) y = nuevaHoja()
    doc.setFillColor('#faf8f6').setDrawColor(MARCA).setLineWidth(0.4).rect(IZQ, y, ANCHO, HC, 'FD')
    doc.setFont('helvetica', 'bold').setFontSize(7.4).setTextColor(MARCA)
    doc.text(
      ajustar(
        doc,
        `TOTAL DE ${d.conCompras ? 'EGRESOS' : 'GASTOS'} REGISTRADOS (${plural(porCategoria.length, 'CATEGORÍA', 'CATEGORÍAS')} · ${plural(salidas.length, 'DOCUMENTO', 'DOCUMENTOS')})`,
        96,
      ),
      IZQ + 3.5,
      y + 5.1,
    )
    doc.setTextColor('#111111')
    const derCierre = `${ambas ? `${dinero('VES', tSalidas.bs)}   ·   ${dinero('USD', tSalidas.usd)}` : montoPrincipal(tSalidas, d.moneda)}${
      valVentas > 0 ? `   (${porcentajeTexto(tSalidas, tVentas, d.moneda)} de las ventas)` : ''
    }`
    enUnaLinea(doc, derCierre, DER - 3.5, y + 5.1, 78, 7.3, 'bold', 'right')
    if (conDesglose) {
      const tNomina = sumar(nominas)
      const tFacturas: Monto = { usd: tGastos.usd - tNomina.usd, bs: tGastos.bs - tNomina.bs }
      const partes = [`Facturas de Gastos ${enLinea(tFacturas, d.moneda)}`]
      if (nominas.length) partes.push(`Nómina ${enLinea(tNomina, d.moneda)}`)
      if (d.conCompras) partes.push(`Órdenes de Compras ${enLinea(tCompras, d.moneda)}`)
      doc.setFont('helvetica', 'normal').setFontSize(6.6).setTextColor(GRIS)
      doc.text(
        ajustar(doc, `Desglose por origen: ${partes.join(' · ')}.`, ANCHO - 7),
        IZQ + 3.5,
        y + 10.1,
      )
    }
    y += HC + 4.8
  }

  // ── Tabla 3: Ingresos por cliente (ventas cobradas)
  if (porCliente.length > 0) {
    if (y + 30 > LIMITE) y = nuevaHoja()
    y = tituloSeccion(
      doc,
      y,
      'Ingresos por cliente (ventas cobradas)',
      'Participación de cada cliente en la recaudación del período',
      VERDE,
    )

    const cCli = { x: IZQ, w: ambas ? 70 : 92 }
    const cNot = { x: cCli.x + cCli.w, w: ambas ? 20 : 22 }
    const cBs = { x: cNot.x + cNot.w, w: ambas ? 32 : 0 }
    const cUsd = { x: cBs.x + cBs.w, w: ambas ? 26 : 34 }
    const cPct = { x: cUsd.x + cUsd.w, w: 30 }
    const divsV = ambas ? [cNot.x, cBs.x, cUsd.x, cPct.x] : [cNot.x, cUsd.x, cPct.x]

    const cabCli = (yy: number) => {
      const H = 7.6
      doc.setFillColor(MARCA).rect(IZQ, yy, ANCHO, H, 'F')
      doc.setDrawColor('#b05646').setLineWidth(0.22)
      for (const x of divsV) doc.line(x, yy + 1.3, x, yy + H - 1.3)
      const yt = yy + 5
      doc.setFont('helvetica', 'bold').setFontSize(6.7).setTextColor('#FFFFFF')
      doc.text('CLIENTE / RIF', cCli.x + 2, yt)
      doc.text('NOTAS', cNot.x + cNot.w / 2, yt, { align: 'center' })
      if (ambas) {
        doc.text('TOTAL BS', cBs.x + cBs.w - 2, yt, { align: 'right' })
        doc.text('TOTAL $', cUsd.x + cUsd.w - 2, yt, { align: 'right' })
      } else {
        doc.text(d.moneda === 'USD' ? 'TOTAL $' : 'TOTAL BS', cUsd.x + cUsd.w - 2, yt, { align: 'right' })
      }
      doc.text('% DE VENTAS', cPct.x + 2, yt)
      return yy + H
    }

    let yIniV = y
    y = cabCli(y)
    const cerrarV = (yFin: number) => {
      doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
      doc.line(IZQ, yIniV, IZQ, yFin)
      doc.line(DER, yIniV, DER, yFin)
      doc.setDrawColor(MARCA).setLineWidth(0.5).line(IZQ, yFin, DER, yFin)
    }

    porCliente.forEach((c, i) => {
      const H = c.rif ? 8.8 : 7.8
      if (y + H > LIMITE) {
        cerrarV(y)
        y = nuevaHoja()
        yIniV = y
        y = cabCli(y)
      }
      doc.setFillColor(i % 2 === 1 ? FILA_ALTERNA : '#ffffff').rect(IZQ, y, ANCHO, H, 'F')
      doc.setDrawColor(HAIRLINE).setLineWidth(0.22)
      for (const x of divsV) doc.line(x, y, x, y + H)
      doc.line(IZQ, y + H, DER, y + H)

      const yb = y + (c.rif ? 3.9 : 5.0)
      doc.setTextColor('#1c1917')
      enUnaLinea(doc, c.nombre, cCli.x + 2, yb, cCli.w - 4, 7.3, 'bold')
      if (c.rif) {
        doc.setFont('helvetica', 'normal').setFontSize(6.2).setTextColor(GRIS)
        doc.text(documento(c.rif), cCli.x + 2, yb + 3.2)
      }

      const ym = y + H / 2 + 1.1
      doc.setFont('helvetica', 'bold').setFontSize(7.3).setTextColor(TINTA)
      doc.text(String(c.n), cNot.x + cNot.w / 2, ym, { align: 'center' })

      if (ambas) {
        doc.setTextColor(TINTA)
        enUnaLinea(doc, dinero('VES', c.m.bs), cBs.x + cBs.w - 2, ym, cBs.w - 3.5, 7.1, 'normal', 'right')
        doc.setTextColor('#1c1917')
        enUnaLinea(doc, dinero('USD', c.m.usd), cUsd.x + cUsd.w - 2, ym, cUsd.w - 3.5, 7.4, 'bold', 'right')
      } else {
        doc.setTextColor('#1c1917')
        enUnaLinea(doc, montoPrincipal(c.m, d.moneda), cUsd.x + cUsd.w - 2, ym, cUsd.w - 3.5, 7.4, 'bold', 'right')
      }

      const pct = ratioPorcentaje(c.m, tVentas, d.moneda)
      const anchoB = cPct.w - 4
      doc.setFillColor('#e7e5e4').rect(cPct.x + 2, y + 2.2, anchoB, 1.8, 'F')
      if (pct > 0) {
        doc.setFillColor(VERDE).rect(cPct.x + 2, y + 2.2, Math.max(0.6, (anchoB * Math.min(100, pct)) / 100), 1.8, 'F')
      }
      doc.setFont('helvetica', 'normal').setFontSize(6.2).setTextColor(GRIS)
      doc.text(`${decimal1.format(pct)} %`, cPct.x + 2, y + (c.rif ? 6.8 : 6.4))
      y += H
    })
    cerrarV(y)

    const HC = 8
    if (y + HC > LIMITE) y = nuevaHoja()
    doc.setFillColor('#faf8f6').setDrawColor(MARCA).setLineWidth(0.4).rect(IZQ, y, ANCHO, HC, 'FD')
    doc.setFont('helvetica', 'bold').setFontSize(7.4).setTextColor(MARCA)
    doc.text(
      ajustar(doc, `TOTAL DE VENTAS COBRADAS (${plural(porCliente.length, 'CLIENTE', 'CLIENTES')} · ${plural(ventas.length, 'NOTA', 'NOTAS')})`, 100),
      IZQ + 3.5,
      y + 5.1,
    )
    doc.setTextColor('#111111')
    const derV = ambas ? `${dinero('VES', tVentas.bs)}   ·   ${dinero('USD', tVentas.usd)}` : montoPrincipal(tVentas, d.moneda)
    enUnaLinea(doc, derV, DER - 3.5, y + 5.1, 74, 7.4, 'bold', 'right')
    y += HC + 3.5
  }

  // Nota técnica BCV al pie del resumen
  doc.setFont('helvetica', 'italic').setFontSize(6.8).setTextColor(GRIS)
  const notaPie = doc.splitTextToSize(
    'Montos equivalentes en Bs y $ calculados con la tasa BCV vigente a la fecha de emisión de cada nota de entrega o factura de gasto. Los importes originales en distintas monedas no se suman directamente entre sí.' +
      notaDeNomina(gastos),
    ANCHO,
  ) as string[]
  if (y + notaPie.length * 3.2 > LIMITE) y = nuevaHoja()
  doc.text(notaPie, IZQ, y + 1, { lineHeightFactor: 1.3 })
  y += notaPie.length * 3.1 + 3

  // ── Sección opcional: Detalle documental
  if (d.conDetalle) {
    if (salidas.length > 0) {
      y = pintarTablaDetalleGastos(
        doc,
        y,
        nuevaHoja,
        d.conCompras ? 'Relación detallada de gastos y compras' : 'Relación detallada de gastos registrados',
        'Documentos de egreso del período con su categoría, proveedor y equivalentes a tasa BCV',
        salidas,
        d.moneda,
      )
    }
    if (ventas.length > 0) {
      y = pintarTablaDetalleVentas(doc, y, nuevaHoja, ventas, d.moneda)
    }
  }

  return cerrarDocumento(doc, titulo, d.emitidoPor, d.nombreArchivo)
}

// ────────────────── TABLAS AUXILIARES DE DETALLE DOCUMENTAL ─────────────────

function pintarTablaDetalleGastos(
  doc: Doc,
  y0: number,
  nuevaHoja: () => number,
  tituloSec: string,
  subSec: string,
  docs: DocumentoDelInforme[],
  moneda: MonedaDelReporte,
): number {
  let y = y0
  if (y + 34 > LIMITE) y = nuevaHoja()
  else y += 2
  y = tituloSeccion(doc, y, tituloSec, subSec, AMBAR)

  const ambas = moneda === 'AMBAS'
  const cF = { x: IZQ, w: 26 }
  const cP = { x: cF.x + cF.w, w: ambas ? 48 : 62 }
  const cC = { x: cP.x + cP.w, w: ambas ? 34 : 42 }
  const cO = { x: cC.x + cC.w, w: 24 }
  const cB = { x: cO.x + cO.w, w: ambas ? 25 : 0 }
  const cU = { x: cB.x + cB.w, w: ambas ? 21 : 24 }
  const divs = ambas ? [cP.x, cC.x, cO.x, cB.x, cU.x] : [cP.x, cC.x, cO.x, cU.x]

  const cab = (yy: number) => {
    const H = 7.2
    doc.setFillColor(MARCA).rect(IZQ, yy, ANCHO, H, 'F')
    doc.setDrawColor('#b05646').setLineWidth(0.22)
    for (const x of divs) doc.line(x, yy + 1.3, x, yy + H - 1.3)
    const yt = yy + 4.8
    doc.setTextColor('#FFFFFF')
    enUnaLinea(doc, 'FECHA / REGISTRO', cF.x + 1.8, yt, cF.w - 3, 6.4, 'bold')
    enUnaLinea(doc, 'PROVEEDOR / RIF', cP.x + 1.8, yt, cP.w - 3, 6.4, 'bold')
    enUnaLinea(doc, 'CATEGORÍA / DETALLE', cC.x + 1.8, yt, cC.w - 3, 6.4, 'bold')
    enUnaLinea(doc, 'MONTO ORIG.', cO.x + cO.w - 1.8, yt, cO.w - 3, 6.4, 'bold', 'right')
    if (ambas) {
      enUnaLinea(doc, 'TOTAL BS', cB.x + cB.w - 1.8, yt, cB.w - 3, 6.4, 'bold', 'right')
      enUnaLinea(doc, 'TOTAL $', cU.x + cU.w - 1.8, yt, cU.w - 3, 6.4, 'bold', 'right')
    } else {
      enUnaLinea(doc, moneda === 'USD' ? 'EQUIV. $' : 'EQUIV. BS', cU.x + cU.w - 1.8, yt, cU.w - 3, 6.4, 'bold', 'right')
    }
    return yy + H
  }

  let yIni = y
  y = cab(y)
  const cerrar = (yFin: number) => {
    doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
    doc.line(IZQ, yIni, IZQ, yFin)
    doc.line(DER, yIni, DER, yFin)
    doc.setDrawColor(MARCA).setLineWidth(0.5).line(IZQ, yFin, DER, yFin)
  }

  const ordenados = [...docs].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.numero ?? '').localeCompare(b.numero ?? ''))
  ordenados.forEach((g, i) => {
    const H = 8.8
    if (y + H > LIMITE) {
      cerrar(y)
      y = nuevaHoja()
      yIni = y
      y = cab(y)
    }
    doc.setFillColor(i % 2 === 1 ? FILA_ALTERNA : '#ffffff').rect(IZQ, y, ANCHO, H, 'F')
    doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
    for (const x of divs) doc.line(x, y, x, y + H)
    doc.line(IZQ, y + H, DER, y + H)

    const yb = y + 3.9
    doc.setTextColor('#1c1917')
    enUnaLinea(doc, fechaCorta(g.fecha), cF.x + 1.8, yb, cF.w - 3, 7.0, 'bold')
    if (g.numero) {
      doc.setFont('helvetica', 'normal').setFontSize(6.0).setTextColor(GRIS)
      doc.text(ajustar(doc, g.numero, cF.w - 3), cF.x + 1.8, yb + 3.2)
    }

    doc.setTextColor('#1c1917')
    enUnaLinea(doc, g.contraparte, cP.x + 1.8, yb, cP.w - 3, 7.0, 'bold')
    if (g.documento) {
      doc.setFont('helvetica', 'normal').setFontSize(6.0).setTextColor(GRIS)
      doc.text(ajustar(doc, documento(g.documento), cP.w - 3), cP.x + 1.8, yb + 3.2)
    }

    doc.setTextColor(TINTA)
    enUnaLinea(doc, g.categoria_nombre ?? '—', cC.x + 1.8, yb, cC.w - 3, 6.8, 'bold')
    if (g.detalle) {
      doc.setFont('helvetica', 'normal').setFontSize(5.9).setTextColor(GRIS)
      doc.text(ajustar(doc, g.detalle, cC.w - 3), cC.x + 1.8, yb + 3.2)
    }

    const ym = y + 5.1
    doc.setTextColor(TINTA)
    enUnaLinea(doc, dinero(g.moneda, g.monto), cO.x + cO.w - 1.8, ym, cO.w - 3, 6.9, 'normal', 'right')
    const m: Monto = { usd: g.total_usd ?? 0, bs: g.total_bs ?? 0 }
    if (ambas) {
      enUnaLinea(doc, dinero('VES', m.bs), cB.x + cB.w - 1.8, ym, cB.w - 3, 6.9, 'normal', 'right')
      doc.setTextColor('#1c1917')
      enUnaLinea(doc, dinero('USD', m.usd), cU.x + cU.w - 1.8, ym, cU.w - 3, 7.1, 'bold', 'right')
    } else {
      doc.setTextColor('#1c1917')
      enUnaLinea(doc, montoPrincipal(m, moneda), cU.x + cU.w - 1.8, ym, cU.w - 3, 7.1, 'bold', 'right')
    }
    y += H
  })
  cerrar(y)
  return y + 5
}

function pintarTablaDetalleVentas(
  doc: Doc,
  y0: number,
  nuevaHoja: () => number,
  ventas: DocumentoDelInforme[],
  moneda: MonedaDelReporte,
): number {
  let y = y0
  if (y + 34 > LIMITE) y = nuevaHoja()
  else y += 2
  y = tituloSeccion(
    doc,
    y,
    'Relación detallada de ventas cobradas',
    'Notas de entrega despachadas con cobro confirmado en el período',
    VERDE,
  )

  const ambas = moneda === 'AMBAS'
  const cF = { x: IZQ, w: 30 }
  const cC = { x: cF.x + cF.w, w: ambas ? 72 : 96 }
  const cO = { x: cC.x + cC.w, w: 26 }
  const cB = { x: cO.x + cO.w, w: ambas ? 27 : 0 }
  const cU = { x: cB.x + cB.w, w: ambas ? 23 : 26 }
  const divs = ambas ? [cC.x, cO.x, cB.x, cU.x] : [cC.x, cO.x, cU.x]

  const cab = (yy: number) => {
    const H = 7.2
    doc.setFillColor(MARCA).rect(IZQ, yy, ANCHO, H, 'F')
    doc.setDrawColor('#b05646').setLineWidth(0.22)
    for (const x of divs) doc.line(x, yy + 1.3, x, yy + H - 1.3)
    const yt = yy + 4.8
    doc.setTextColor('#FFFFFF')
    enUnaLinea(doc, 'FECHA / NOTA', cF.x + 1.8, yt, cF.w - 3, 6.5, 'bold')
    enUnaLinea(doc, 'CLIENTE / RIF', cC.x + 1.8, yt, cC.w - 3, 6.5, 'bold')
    enUnaLinea(doc, 'MONTO ORIG.', cO.x + cO.w - 1.8, yt, cO.w - 3, 6.5, 'bold', 'right')
    if (ambas) {
      enUnaLinea(doc, 'TOTAL BS', cB.x + cB.w - 1.8, yt, cB.w - 3, 6.5, 'bold', 'right')
      enUnaLinea(doc, 'TOTAL $', cU.x + cU.w - 1.8, yt, cU.w - 3, 6.5, 'bold', 'right')
    } else {
      enUnaLinea(doc, moneda === 'USD' ? 'EQUIV. $' : 'EQUIV. BS', cU.x + cU.w - 1.8, yt, cU.w - 3, 6.5, 'bold', 'right')
    }
    return yy + H
  }

  let yIni = y
  y = cab(y)
  const cerrar = (yFin: number) => {
    doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
    doc.line(IZQ, yIni, IZQ, yFin)
    doc.line(DER, yIni, DER, yFin)
    doc.setDrawColor(MARCA).setLineWidth(0.5).line(IZQ, yFin, DER, yFin)
  }

  const ordenadas = [...ventas].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.numero ?? '').localeCompare(b.numero ?? ''))
  ordenadas.forEach((v, i) => {
    const H = 8.4
    if (y + H > LIMITE) {
      cerrar(y)
      y = nuevaHoja()
      yIni = y
      y = cab(y)
    }
    doc.setFillColor(i % 2 === 1 ? FILA_ALTERNA : '#ffffff').rect(IZQ, y, ANCHO, H, 'F')
    doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
    for (const x of divs) doc.line(x, y, x, y + H)
    doc.line(IZQ, y + H, DER, y + H)

    const yb = y + 3.8
    doc.setTextColor('#1c1917')
    enUnaLinea(doc, fechaCorta(v.fecha), cF.x + 1.8, yb, cF.w - 3, 7.0, 'bold')
    if (v.numero) {
      doc.setFont('helvetica', 'normal').setFontSize(6.1).setTextColor(GRIS)
      doc.text(ajustar(doc, v.numero, cF.w - 3), cF.x + 1.8, yb + 3.1)
    }

    doc.setTextColor('#1c1917')
    enUnaLinea(doc, v.contraparte, cC.x + 1.8, yb + (v.documento ? 0 : 1.1), cC.w - 3, 7.0, 'bold')
    if (v.documento) {
      doc.setFont('helvetica', 'normal').setFontSize(6.0).setTextColor(GRIS)
      doc.text(ajustar(doc, documento(v.documento), cC.w - 3), cC.x + 1.8, yb + 3.1)
    }

    const ym = y + 5.0
    doc.setTextColor(TINTA)
    enUnaLinea(doc, dinero(v.moneda, v.monto), cO.x + cO.w - 1.8, ym, cO.w - 3, 6.9, 'normal', 'right')
    const m: Monto = { usd: v.total_usd ?? 0, bs: v.total_bs ?? 0 }
    if (ambas) {
      enUnaLinea(doc, dinero('VES', m.bs), cB.x + cB.w - 1.8, ym, cB.w - 3, 6.9, 'normal', 'right')
      doc.setTextColor('#1c1917')
      enUnaLinea(doc, dinero('USD', m.usd), cU.x + cU.w - 1.8, ym, cU.w - 3, 7.1, 'bold', 'right')
    } else {
      doc.setTextColor('#1c1917')
      enUnaLinea(doc, montoPrincipal(m, moneda), cU.x + cU.w - 1.8, ym, cU.w - 3, 7.1, 'bold', 'right')
    }
    y += H
  })
  cerrar(y)
  return y + 5
}
