import { logoComoImagen } from '@/lib/ficha/logo'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { dinero, documento } from '@/lib/formato'
import {
  membrete,
  tituloDocumento,
  lineaEmpresa,
  seccion,
  etiquetaValor,
  tabla,
  notaBajoLaTabla,
  pieDePagina,
  fechaLarga,
  fechaCorta,
  MARCA,
  ROTULO,
  TINTA,
  GRIS,
  FILA_ALTERNA,
  type Columna,
  type EmpresaPapel,
} from '@/lib/ficha/papel'
import { IZQ, ANCHO_UTIL } from '@/lib/ficha/hoja'
import type { DocumentoDelInforme } from '@/lib/api/gastos'

/*
  LOS REPORTES PDF DE GASTOS (10/11/2026).

  Pedido: «un reporte PDF de los gastos de este módulo» y «un informe, también
  en PDF, que compare los gastos registrados con las ventas de material —notas
  de entrega despachadas—, sin las que aún están por cobrar», con rango de
  fechas, mes y las opciones necesarias.

  Dos papeles con el mismo esqueleto: un cuadro de totales arriba, el alcance,
  las tablas por período y por categoría (o por cliente), y el detalle si se
  pide. Lo que se apaga en las opciones no deja rastro en el papel.

  LAS MONEDAS NO SE MEZCLAN TAL CUAL. Cada documento trae su equivalente en Bs
  y en $ —las notas con la tasa del día en que se hicieron, los gastos con la
  BCV del día de la factura— y solo esos equivalentes se suman. El informe de
  gastos enseña además lo facturado en cada moneda original, por separado.
*/

type Doc = InstanceType<typeof import('jspdf').jsPDF>

export type Agrupacion = 'mes' | 'semana' | 'dia'
export type MonedaDelReporte = 'USD' | 'VES' | 'AMBAS'

interface Monto {
  usd: number
  bs: number
}

const CERO: Monto = { usd: 0, bs: 0 }

function sumar(docs: DocumentoDelInforme[]): Monto {
  return docs.reduce((s, d) => ({ usd: s.usd + (d.total_usd ?? 0), bs: s.bs + (d.total_bs ?? 0) }), CERO)
}

/** El monto en la moneda elegida; con «ambas», dos renglones. */
function enMoneda(m: Monto, moneda: MonedaDelReporte): string {
  if (moneda === 'USD') return dinero('USD', m.usd)
  if (moneda === 'VES') return dinero('VES', m.bs)
  return `${dinero('USD', m.usd)}\n${dinero('VES', m.bs)}`
}

/** El monto en la moneda elegida, en una sola línea (cuadros y pies de tabla). */
function enLinea(m: Monto, moneda: MonedaDelReporte): string {
  if (moneda === 'USD') return dinero('USD', m.usd)
  if (moneda === 'VES') return dinero('VES', m.bs)
  return `${dinero('USD', m.usd)} · ${dinero('VES', m.bs)}`
}

/** La parte de un total que toca a un trozo, en la moneda que manda. */
function porcentaje(parte: Monto, total: Monto, moneda: MonedaDelReporte): string {
  const p = moneda === 'VES' ? parte.bs : parte.usd
  const t = moneda === 'VES' ? total.bs : total.usd
  if (!t) return '—'
  return `${((p / t) * 100).toLocaleString('es-VE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`
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
  return `Del ${fechaCorta(clave)}\nal ${fechaCorta(fin)}`
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

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`
}

/** Que un rótulo de sección no quede solo al pie de la hoja. */
function aire(doc: Doc, y: number, minimo = 205): number {
  if (y > minimo) {
    doc.addPage()
    return 30
  }
  return y
}

/** Un cuadro con varias cifras grandes, una al lado de la otra. */
function cuadroDeCifras(
  doc: Doc,
  y: number,
  titulo: string,
  cifras: Array<{ rotulo: string; valor: string; aparte?: string; color?: string }>,
  pie: string | null,
): number {
  const ALTO = pie ? 30 : 25
  doc.setDrawColor(MARCA).setLineWidth(0.4).setFillColor(FILA_ALTERNA)
  doc.rect(IZQ, y, ANCHO_UTIL, ALTO, 'FD')

  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(ROTULO)
  doc.text(titulo, IZQ + 4, y + 6)

  const ancho = (ANCHO_UTIL - 8) / cifras.length
  cifras.forEach((c, i) => {
    const x = IZQ + 4 + i * ancho
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
    doc.text(c.rotulo, x, y + 11.5)
    // El número más largo manda la letra: que quepa entero en su casilla.
    let talla = cifras.length > 3 ? 12 : 14
    doc.setFont('helvetica', 'bold')
    while (talla > 8 && doc.setFontSize(talla).getTextWidth(c.valor) > ancho - 3) talla -= 0.5
    doc.setFontSize(talla).setTextColor(c.color ?? TINTA)
    doc.text(c.valor, x, y + 17.5)
    if (c.aparte) {
      doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(GRIS)
      doc.text(c.aparte, x, y + 21.5)
    }
  })

  if (pie) {
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
    doc.text(doc.splitTextToSize(pie, ANCHO_UTIL - 8) as string[], IZQ + 4, y + 26.5)
  }
  return y + ALTO + 8
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

const NOMBRE_AGRUPAR: Record<Agrupacion, string> = { mes: 'Mes', semana: 'Semana', dia: 'Día' }
const NOMBRE_MONEDA: Record<MonedaDelReporte, string> = {
  USD: 'Dólares (equivalente)',
  VES: 'Bolívares (equivalente)',
  AMBAS: 'Dólares y bolívares (equivalentes)',
}

async function hoja(d: DatosDeLosReportes, titulo: string, subtitulo: string): Promise<{ doc: Doc; y: number }> {
  const { jsPDF } = await import('jspdf')
  const logo = d.conLogo ? await logoComoImagen() : ''
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['Período', `${fechaCorta(d.desde)} al ${fechaCorta(d.hasta)}`],
      ['Generado', fechaLarga(d.momento)],
    ],
  })
  y = tituloDocumento(doc, y, titulo)
  y = lineaEmpresa(doc, y, `${d.empresa.razonSocial} · RIF ${d.empresa.rif} · ${subtitulo}`)
  return { doc, y }
}

function cerrar(doc: Doc, titulo: string, nombreArchivo: string): ArchivoArmado {
  pieDePagina(doc, `Documento generado por el sistema · ${titulo}`)
  doc.setProperties({ title: titulo })
  return { blob: doc.output('blob'), nombre: nombreArchivo }
}

/** Las columnas de montos de una tabla: una sola en $ o Bs, o dos con «ambas». */
function columnasDeMonto(moneda: MonedaDelReporte, ancho: number, rotulo = 'Total'): Columna[] {
  if (moneda === 'AMBAS') {
    // Los bolívares llevan más cifras: se quedan con la parte mayor.
    const mitad = Math.round(ancho * 0.43)
    return [
      { titulo: `${rotulo} $`, ancho: mitad, alDerecha: true },
      { titulo: `${rotulo} Bs`, ancho: ancho - mitad, alDerecha: true },
    ]
  }
  return [{ titulo: `${rotulo} ${moneda === 'USD' ? '$' : 'Bs'}`, ancho, alDerecha: true }]
}

/** Lo que ocupan las columnas de montos: con las dos monedas hace falta más sitio. */
function anchoMonto(moneda: MonedaDelReporte): number {
  return moneda === 'AMBAS' ? 58 : 46
}

function celdasDeMonto(m: Monto, moneda: MonedaDelReporte): string[] {
  if (moneda === 'AMBAS') return [dinero('USD', m.usd), dinero('VES', m.bs)]
  return [moneda === 'USD' ? dinero('USD', m.usd) : dinero('VES', m.bs)]
}

// ─────────────────────────────── informe de gastos ───────────────────────────

export async function armarInformeDeGastos(d: DatosDeLosReportes): Promise<ArchivoArmado> {
  const titulo = 'Informe de gastos'
  const { doc, y: y0 } = await hoja(d, titulo, 'Gastos registrados')
  let y = y0

  const gastos = d.documentos.filter((x) => x.tipo === 'GASTO')
  const anuladas = d.documentos.filter((x) => x.tipo === 'GASTO_ANULADO')
  const total = sumar(gastos)

  // Lo facturado en cada moneda original, por separado: nunca se mezclan.
  const originales = [...agruparPor(gastos, (g) => g.moneda)]
    .map(([moneda, gs]) => dinero(moneda, gs.reduce((s, g) => s + g.monto, 0)))
    .join(' · ')

  y = cuadroDeCifras(
    doc,
    y,
    'TOTAL DE GASTOS DEL PERÍODO',
    [
      { rotulo: 'En dólares (equivalente)', valor: dinero('USD', total.usd) },
      { rotulo: 'En bolívares (equivalente)', valor: dinero('VES', total.bs) },
      { rotulo: 'Facturas', valor: String(gastos.length) },
    ],
    gastos.length ? `Facturado en su moneda original: ${originales}.` : null,
  )

  y = seccion(doc, y, 'Alcance')
  y = etiquetaValor(doc, y, [
    ['Categorías', d.categorias],
    ['Agrupado por', NOMBRE_AGRUPAR[d.agrupar]],
    ['Montos en', NOMBRE_MONEDA[d.moneda]],
    ['Emitido por', d.emitidoPor],
  ])

  // Por categoría.
  y = aire(doc, y)
  y = seccion(doc, y, 'Por categoría')
  const porCategoria = [...agruparPor(gastos, (g) => g.categoria_nombre ?? 'Sin categoría')]
    .map(([nombre, gs]) => ({ nombre, n: gs.length, m: sumar(gs) }))
    .sort((a, b) => b.m.usd - a.m.usd)
  y = tabla(
    doc,
    y,
    [
      { titulo: 'Categoría', ancho: 110 - anchoMonto(d.moneda) },
      { titulo: 'Facturas', ancho: 20, alDerecha: true },
      { titulo: '% del total', ancho: 20, alDerecha: true },
      ...columnasDeMonto(d.moneda, anchoMonto(d.moneda)),
    ],
    porCategoria.map((c) => [c.nombre, String(c.n), porcentaje(c.m, total, d.moneda), ...celdasDeMonto(c.m, d.moneda)]),
    `${plural(porCategoria.length, 'CATEGORÍA', 'CATEGORÍAS')}   ${enLinea(total, d.moneda)}`,
  )

  // Por período.
  y = aire(doc, y)
  y = seccion(doc, y + 2, `Por ${NOMBRE_AGRUPAR[d.agrupar].toLowerCase()}`)
  const porPeriodo = [...agruparPor(gastos, (g) => clavePeriodo(g.fecha, d.agrupar))].sort(([a], [b]) =>
    a.localeCompare(b),
  )
  y = tabla(
    doc,
    y,
    [
      { titulo: NOMBRE_AGRUPAR[d.agrupar], ancho: 110 - anchoMonto(d.moneda) },
      { titulo: 'Facturas', ancho: 20, alDerecha: true },
      { titulo: '% del total', ancho: 20, alDerecha: true },
      ...columnasDeMonto(d.moneda, anchoMonto(d.moneda)),
    ],
    porPeriodo.map(([k, gs]) => {
      const m = sumar(gs)
      return [nombrePeriodo(k, d.agrupar), String(gs.length), porcentaje(m, total, d.moneda), ...celdasDeMonto(m, d.moneda)]
    }),
    `${plural(gastos.length, 'FACTURA', 'FACTURAS')}   ${enLinea(total, d.moneda)}`,
  )
  y = notaBajoLaTabla(
    doc,
    y,
    'Cada factura se lleva a su equivalente con la tasa BCV del día de la factura. Los montos originales en bolívares y en dólares nunca se suman entre sí.',
  )

  if (d.conDetalle && gastos.length) {
    y = aire(doc, y, 215)
    y = seccion(doc, y + 2, 'Detalle de las facturas')
    y = tabla(
      doc,
      y,
      [
        { titulo: 'Fecha / N.º', ancho: 26 },
        { titulo: 'Proveedor', ancho: 44 },
        { titulo: 'Categoría', ancho: 26 },
        { titulo: 'Monto original', ancho: 27, alDerecha: true },
        { titulo: 'Equivalente', ancho: 27, alDerecha: true },
      ],
      [...gastos]
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .map((g) => [
          `${fechaCorta(g.fecha)}\n${g.numero ?? ''}`,
          `${g.contraparte}${g.documento ? `\n${documento(g.documento)}` : ''}`,
          g.categoria_nombre ?? '—',
          dinero(g.moneda, g.monto),
          enMoneda({ usd: g.total_usd ?? 0, bs: g.total_bs ?? 0 }, d.moneda),
        ]),
      `${plural(gastos.length, 'FACTURA', 'FACTURAS')}   ${enLinea(total, d.moneda)}`,
    )
  }

  if (anuladas.length) {
    y = aire(doc, y, 215)
    y = seccion(doc, y + 2, 'Facturas anuladas (no suman)')
    y = tabla(
      doc,
      y,
      [
        { titulo: 'Fecha / N.º', ancho: 26 },
        { titulo: 'Proveedor', ancho: 70 },
        { titulo: 'Categoría', ancho: 27 },
        { titulo: 'Monto original', ancho: 27, alDerecha: true },
      ],
      anuladas.map((g) => [
        `${fechaCorta(g.fecha)}\n${g.numero ?? ''}`,
        g.contraparte,
        g.categoria_nombre ?? '—',
        dinero(g.moneda, g.monto),
      ]),
    )
  }

  return cerrar(doc, titulo, d.nombreArchivo)
}

// ───────────────────────────── gastos vs. ventas ─────────────────────────────

export interface DatosDelComparativo extends DatosDeLosReportes {
  conCompras: boolean
  conPorCobrar: boolean
}

export async function armarComparativoGastosVentas(d: DatosDelComparativo): Promise<ArchivoArmado> {
  const titulo = 'Comparativo de gastos y ventas'
  const { doc, y: y0 } = await hoja(d, titulo, 'Gastos frente a ventas de material')
  let y = y0

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
  const manda = d.moneda === 'VES' ? 'VES' : 'USD'
  const enManda = (m: Monto) => dinero(manda, manda === 'VES' ? m.bs : m.usd)
  const otra = (m: Monto) => (d.moneda === 'AMBAS' ? dinero('VES', m.bs) : undefined)
  const rotuloSalidas = d.conCompras ? 'Gastos + compras' : 'Gastos'

  y = cuadroDeCifras(
    doc,
    y,
    'RESULTADO DEL PERÍODO',
    [
      { rotulo: `Ventas (${ventas.length} notas)`, valor: enManda(tVentas), aparte: otra(tVentas) },
      { rotulo: rotuloSalidas, valor: enManda(tSalidas), aparte: otra(tSalidas) },
      {
        rotulo: 'Diferencia',
        valor: enManda(diferencia),
        aparte: otra(diferencia),
        color: (manda === 'VES' ? diferencia.bs : diferencia.usd) < 0 ? '#b3261e' : '#2e7d4f',
      },
      { rotulo: 'Gastos / ventas', valor: porcentaje(tSalidas, tVentas, d.moneda) },
    ],
    d.conPorCobrar && porCobrar.length
      ? `No incluye ${plural(porCobrar.length, 'nota despachada', 'notas despachadas')} que siguen por cobrar: ${enLinea(sumar(porCobrar), d.moneda)}.`
      : null,
  )

  y = seccion(doc, y, 'Alcance')
  y = etiquetaValor(doc, y, [
    ['Ventas', 'Notas de entrega despachadas, de contado o a crédito ya cobradas'],
    ['Gastos', `Facturas del módulo Gastos · categorías: ${d.categorias}`],
    ...(d.conCompras ? ([['Compras', 'Órdenes del módulo Compras ya pagadas, por su fecha de pago']] as Array<[string, string]>) : []),
    ['Agrupado por', NOMBRE_AGRUPAR[d.agrupar]],
    ['Montos en', NOMBRE_MONEDA[d.moneda]],
    ['Emitido por', d.emitidoPor],
  ])

  // Por período: todos los períodos con ventas o con gastos, aunque falte uno de los dos.
  y = aire(doc, y)
  y = seccion(doc, y, `Por ${NOMBRE_AGRUPAR[d.agrupar].toLowerCase()}`)
  const clave = (x: DocumentoDelInforme) => clavePeriodo(x.fecha, d.agrupar)
  const vPer = agruparPor(ventas, clave)
  const gPer = agruparPor(gastos, clave)
  const cPer = agruparPor(compras, clave)
  const periodos = [...new Set([...vPer.keys(), ...gPer.keys(), ...cPer.keys()])].sort()
  const cols: Columna[] = d.conCompras
    ? [
        { titulo: NOMBRE_AGRUPAR[d.agrupar], ancho: 26 },
        { titulo: 'Ventas', ancho: 26, alDerecha: true },
        { titulo: 'Gastos', ancho: 25, alDerecha: true },
        { titulo: 'Compras', ancho: 25, alDerecha: true },
        { titulo: 'Diferencia', ancho: 28, alDerecha: true },
        { titulo: 'Gasto / venta', ancho: 20, alDerecha: true },
      ]
    : [
        { titulo: NOMBRE_AGRUPAR[d.agrupar], ancho: 34 },
        { titulo: 'Ventas', ancho: 31, alDerecha: true },
        { titulo: 'Gastos', ancho: 31, alDerecha: true },
        { titulo: 'Diferencia', ancho: 32, alDerecha: true },
        { titulo: 'Gasto / venta', ancho: 22, alDerecha: true },
      ]
  y = tabla(
    doc,
    y,
    cols,
    periodos.map((k) => {
      const v = sumar(vPer.get(k) ?? [])
      const g = sumar(gPer.get(k) ?? [])
      const c = sumar(cPer.get(k) ?? [])
      const s: Monto = { usd: g.usd + c.usd, bs: g.bs + c.bs }
      const dif: Monto = { usd: v.usd - s.usd, bs: v.bs - s.bs }
      return [
        nombrePeriodo(k, d.agrupar),
        enMoneda(v, d.moneda),
        enMoneda(g, d.moneda),
        ...(d.conCompras ? [enMoneda(c, d.moneda)] : []),
        enMoneda(dif, d.moneda),
        porcentaje(s, v, d.moneda),
      ]
    }),
    `TOTAL   ventas ${enLinea(tVentas, d.moneda)}  ·  ${rotuloSalidas.toLowerCase()} ${enLinea(tSalidas, d.moneda)}`,
  )
  y = notaBajoLaTabla(
    doc,
    y,
    'Notas de entrega con su total en Bs y $ a la tasa del día en que se hicieron; gastos con la tasa BCV del día de la factura. Solo se suman esos equivalentes, nunca bolívares con dólares.',
  )

  // A dónde se fue el gasto.
  y = aire(doc, y)
  y = seccion(doc, y + 2, d.conCompras ? 'Gastos y compras por categoría' : 'Gastos por categoría')
  const porCategoria = [...agruparPor(salidas, (g) => g.categoria_nombre ?? 'Sin categoría')]
    .map(([nombre, gs]) => ({ nombre, n: gs.length, m: sumar(gs) }))
    .sort((a, b) => b.m.usd - a.m.usd)
  y = tabla(
    doc,
    y,
    [
      { titulo: 'Categoría', ancho: 104 - anchoMonto(d.moneda) },
      { titulo: 'Documentos', ancho: 22, alDerecha: true },
      { titulo: '% de lo gastado', ancho: 24, alDerecha: true },
      ...columnasDeMonto(d.moneda, anchoMonto(d.moneda)),
    ],
    porCategoria.map((c) => [c.nombre, String(c.n), porcentaje(c.m, tSalidas, d.moneda), ...celdasDeMonto(c.m, d.moneda)]),
    `${plural(salidas.length, 'DOCUMENTO', 'DOCUMENTOS')}   ${enLinea(tSalidas, d.moneda)}`,
  )
  if (d.conCompras) {
    y = notaBajoLaTabla(
      doc,
      y,
      `De lo gastado, ${enLinea(tGastos, d.moneda)} son facturas de Gastos y ${enLinea(tCompras, d.moneda)} órdenes de Compras.`,
    )
  }

  // De dónde vino la venta.
  y = aire(doc, y)
  y = seccion(doc, y + 2, 'Ventas por cliente')
  const porCliente = [...agruparPor(ventas, (v) => v.contraparte)]
    .map(([nombre, vs]) => ({ nombre, rif: vs[0].documento, n: vs.length, m: sumar(vs) }))
    .sort((a, b) => b.m.usd - a.m.usd)
  y = tabla(
    doc,
    y,
    [
      { titulo: 'Cliente', ancho: 104 - anchoMonto(d.moneda) },
      { titulo: 'Notas', ancho: 22, alDerecha: true },
      { titulo: '% de lo vendido', ancho: 24, alDerecha: true },
      ...columnasDeMonto(d.moneda, anchoMonto(d.moneda)),
    ],
    porCliente.map((c) => [
      c.rif ? `${c.nombre}\n${documento(c.rif)}` : c.nombre,
      String(c.n),
      porcentaje(c.m, tVentas, d.moneda),
      ...celdasDeMonto(c.m, d.moneda),
    ]),
    `${plural(porCliente.length, 'CLIENTE', 'CLIENTES')}   ${enLinea(tVentas, d.moneda)}`,
  )

  if (d.conDetalle) {
    if (ventas.length) {
      y = aire(doc, y, 215)
      y = seccion(doc, y + 2, 'Detalle de las ventas')
      y = tabla(
        doc,
        y,
        [
          { titulo: 'Fecha / Nota', ancho: 30 },
          { titulo: 'Cliente', ancho: 66 },
          { titulo: 'Monto original', ancho: 27, alDerecha: true },
          { titulo: 'Equivalente', ancho: 27, alDerecha: true },
        ],
        [...ventas]
          .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.numero ?? '').localeCompare(b.numero ?? ''))
          .map((v) => [
            `${fechaCorta(v.fecha)}\n${v.numero ?? ''}`,
            v.contraparte,
            dinero(v.moneda, v.monto),
            enMoneda({ usd: v.total_usd ?? 0, bs: v.total_bs ?? 0 }, d.moneda),
          ]),
        `${plural(ventas.length, 'NOTA', 'NOTAS')}   ${enLinea(tVentas, d.moneda)}`,
      )
    }
    if (salidas.length) {
      y = aire(doc, y, 215)
      y = seccion(doc, y + 2, d.conCompras ? 'Detalle de gastos y compras' : 'Detalle de los gastos')
      y = tabla(
        doc,
        y,
        [
          { titulo: 'Fecha / N.º', ancho: 30 },
          { titulo: 'Proveedor', ancho: 40 },
          { titulo: 'Categoría', ancho: 26 },
          { titulo: 'Monto original', ancho: 27, alDerecha: true },
          { titulo: 'Equivalente', ancho: 27, alDerecha: true },
        ],
        [...salidas]
          .sort((a, b) => a.fecha.localeCompare(b.fecha))
          .map((g) => [
            `${fechaCorta(g.fecha)}\n${g.numero ?? ''}`,
            g.contraparte,
            g.categoria_nombre ?? '—',
            dinero(g.moneda, g.monto),
            enMoneda({ usd: g.total_usd ?? 0, bs: g.total_bs ?? 0 }, d.moneda),
          ]),
        `${plural(salidas.length, 'DOCUMENTO', 'DOCUMENTOS')}   ${enLinea(tSalidas, d.moneda)}`,
      )
    }
  }

  return cerrar(doc, titulo, d.nombreArchivo)
}
