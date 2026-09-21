import { logoComoImagen } from '@/lib/ficha/logo'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import {
  membrete,
  tituloDocumento,
  lineaEmpresa,
  seccion,
  etiquetaValor,
  tabla,
  pieDePagina,
  fechaLarga,
  fechaCorta,
  notaBajoLaTabla,
  type Columna,
} from '@/lib/ficha/papel'
import type {
  CierreDeCuenta,
  CierreDeMoneda,
  FilaPorMoneda,
  GastoDeCategoria,
  RenglonDelLibroDeDinero,
} from '@/lib/api/tesoreriaReportes'

/*
  LOS PAPELES DE TESORERÍA

  Cuatro, y los cuatro obedecen la misma regla: NADA SE SUMA ENTRE MONEDAS. La
  moneda es la fila o es la sección, nunca una columna que se pueda totalizar
  con otra. Un total que mezcla bolívares y dólares es un número que no existe.

  Todos se ven antes de descargarse: devuelven el archivo armado y la pantalla
  lo enseña en el visor.
*/

type Doc = import('jspdf').jsPDF

interface Cabecera {
  empresa: { razonSocial: string; rif: string }
  emitidoPor: string
  momento: Date
}

const decimal2 = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const n = (v: string | number | null | undefined): string => decimal2.format(Number(v ?? 0))
/** Un cero en Debe o en Haber estorba: la columna vacía se lee mejor. */
const oVacio = (v: string | number): string => (Number(v) === 0 ? '' : n(v))
const oRaya = (v: number | null): string => (v === null ? '—' : n(v))

const periodo = (desde: string | null, hasta: string | null): string =>
  desde && hasta
    ? `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`
    : desde
      ? `Desde el ${fechaCorta(desde)}`
      : hasta
        ? `Hasta el ${fechaCorta(hasta)}`
        : 'Todo el libro'

async function abrir(
  c: Cabecera,
  titulo: string,
  alcance: string,
): Promise<{ doc: Doc; y: number }> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  let y = membrete(doc, logo, {
    empresa: c.empresa,
    datos: [
      ['Alcance', alcance],
      ['Emitido', fechaLarga(c.momento)],
    ],
  })
  y = tituloDocumento(doc, y, titulo)
  y = lineaEmpresa(doc, y, `${c.empresa.razonSocial} · RIF ${c.empresa.rif} · Tesorería`)
  return { doc, y }
}

function cerrar(doc: Doc, c: Cabecera, titulo: string, nombre: string): ArchivoArmado {
  pieDePagina(doc, `Documento generado por el sistema · ${titulo} · ${fechaLarga(c.momento)}`)
  doc.setProperties({ title: titulo })
  return { blob: doc.output('blob'), nombre }
}

const sufijo = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// ---------------------------------------------------------------------------
// 1. Resumen por moneda
// ---------------------------------------------------------------------------

const COLUMNAS_RESUMEN: Columna[] = [
  { titulo: 'Moneda', ancho: 20 },
  { titulo: 'Debe', ancho: 26, alDerecha: true },
  { titulo: 'Haber', ancho: 26, alDerecha: true },
  { titulo: 'Saldo en cajas', ancho: 28, alDerecha: true },
  { titulo: 'Por pagar', ancho: 25, alDerecha: true },
  { titulo: 'Por cobrar', ancho: 25, alDerecha: true },
]

/*
  Debe y Haber son de FLUJO —respetan el rango— y Saldo, Por pagar y Por cobrar
  son de EXISTENCIA —a hoy—. Mezclar las dos naturalezas en una tabla solo se
  sostiene si el papel lo dice, así que la nota al pie no es opcional.
*/
export const NOTA_FLUJO_Y_EXISTENCIA =
  'Debe y Haber suman lo movido en el período. Saldo en cajas, Por pagar y Por cobrar son a la fecha de emisión, no al cierre del período. Cada moneda va en su fila: no se suman entre sí. Por cobrar se lleva en bolívares y en dólares; lo facturado en otra divisa va en la fila del dólar por su equivalente.'

export async function armarResumenPorMoneda(
  d: Cabecera & {
    desde: string | null
    hasta: string | null
    filas: FilaPorMoneda[]
    cuentas: { nombre: string; tipo: string; moneda: string; saldo: string }[]
  },
): Promise<ArchivoArmado> {
  const titulo = 'Resumen por moneda'
  const { doc, y: y0 } = await abrir(d, titulo, periodo(d.desde, d.hasta))
  let y = seccion(doc, y0, 'Alcance')
  y = etiquetaValor(doc, y, [
    ['Período de Debe y Haber', periodo(d.desde, d.hasta)],
    ['Saldos y pendientes', `A la fecha de emisión, ${fechaLarga(d.momento)}`],
    ['Emitido por', d.emitidoPor],
  ])

  y = seccion(doc, y, 'Por moneda')
  y = tabla(
    doc,
    y,
    COLUMNAS_RESUMEN,
    d.filas.map((f) => [f.moneda, n(f.debe), n(f.haber), n(f.saldo), oRaya(f.porPagar), oRaya(f.porCobrar)]),
  )
  y = notaBajoLaTabla(doc, y, NOTA_FLUJO_Y_EXISTENCIA)

  y = seccion(doc, y, 'Saldo de cada caja, banco y billetera')
  tabla(
    doc,
    y,
    [
      { titulo: 'Cuenta', ancho: 78 },
      { titulo: 'Tipo', ancho: 26 },
      { titulo: 'Moneda', ancho: 18 },
      { titulo: 'Saldo', ancho: 28, alDerecha: true },
    ],
    d.cuentas.map((c) => [c.nombre, c.tipo, c.moneda, n(c.saldo)]),
  )

  return cerrar(doc, d, titulo, 'tesoreria-resumen-por-moneda.pdf')
}

// ---------------------------------------------------------------------------
// 2. El libro: de una caja, o de una moneda entera
// ---------------------------------------------------------------------------

const COLUMNAS_LIBRO: Columna[] = [
  { titulo: 'Fecha', ancho: 15 },
  { titulo: 'Caja', ancho: 24 },
  { titulo: 'Concepto', ancho: 36 },
  { titulo: 'Beneficiario', ancho: 21 },
  { titulo: 'Debe', ancho: 18, alDerecha: true },
  { titulo: 'Haber', ancho: 18, alDerecha: true },
  { titulo: 'Saldo', ancho: 18, alDerecha: true },
]

export async function armarLibroDeDinero(
  d: Cabecera & {
    /** «CAJA FUERTE DIVISAS» o «Todas las cuentas en USD». */
    alcance: string
    moneda: string
    desde: string | null
    hasta: string | null
    /** Solo cuando el libro es de UNA cuenta: el saldo antes del primer renglón. */
    saldoAnterior: number | null
    renglones: RenglonDelLibroDeDinero[]
  },
): Promise<ArchivoArmado> {
  const titulo = `Libro de ${d.alcance}`
  const { doc, y: y0 } = await abrir(d, 'Libro de movimientos de dinero', d.alcance)

  const debe = d.renglones.reduce((s, r) => s + Number(r.debe), 0)
  const haber = d.renglones.reduce((s, r) => s + Number(r.haber), 0)

  let y = seccion(doc, y0, 'Alcance')
  y = etiquetaValor(doc, y, [
    ['Cuenta', d.alcance],
    ['Moneda', d.moneda],
    ['Período', periodo(d.desde, d.hasta)],
    ...(d.saldoAnterior !== null
      ? ([['Saldo anterior', `${n(d.saldoAnterior)} ${d.moneda}`]] as [string, string][])
      : []),
    ['Entró / salió', `${n(debe)} / ${n(haber)} ${d.moneda}`],
    ...(d.saldoAnterior !== null
      ? ([['Saldo al final', `${n(d.saldoAnterior + debe - haber)} ${d.moneda}`]] as [string, string][])
      : []),
    ['Movimientos', String(d.renglones.length)],
    ['Emitido por', d.emitidoPor],
  ])

  y = seccion(doc, y, 'Movimientos')
  y = tabla(
    doc,
    y,
    COLUMNAS_LIBRO,
    // Un libro sin renglones lo dice: una tabla en blanco parece un reporte roto.
    (d.renglones.length === 0
      ? [['', '', 'Sin movimientos en el período', '', '', '', '']]
      : []
    ).concat(d.renglones.map((r) => [
      fechaCorta(r.fecha),
      r.cuenta ?? '—',
      r.referencia ? `${r.concepto} · ${r.referencia}` : r.concepto,
      r.contraparte ?? '',
      oVacio(r.debe),
      oVacio(r.haber),
      r.saldo === null ? '—' : n(r.saldo),
    ])),
  )
  notaBajoLaTabla(
    doc,
    y,
    d.saldoAnterior === null
      ? 'El saldo de cada renglón es el de SU caja después de ese movimiento, no el de la moneda entera: cada caja lleva su propia cuenta.'
      : 'El saldo es el de la cuenta después de cada movimiento. Sale de sumar el libro, que no se edita ni se borra: lo que se deshizo aparece como reverso.',
  )

  return cerrar(doc, d, titulo, `tesoreria-libro-${sufijo(d.alcance)}.pdf`)
}

// ---------------------------------------------------------------------------
// 3. Gastos por categoría
// ---------------------------------------------------------------------------

export async function armarGastosPorCategoria(
  d: Cabecera & { desde: string | null; hasta: string | null; gastos: GastoDeCategoria[] },
): Promise<ArchivoArmado> {
  const titulo = 'Gastos por categoría'
  const { doc, y: y0 } = await abrir(d, titulo, periodo(d.desde, d.hasta))
  let y = seccion(doc, y0, 'Alcance')
  y = etiquetaValor(doc, y, [
    ['Período', periodo(d.desde, d.hasta)],
    ['Qué cuenta', 'Todo lo que salió de una caja, banco o billetera, menos los traslados entre cuentas propias'],
    ['Emitido por', d.emitidoPor],
  ])

  const monedas = [...new Set(d.gastos.map((g) => g.moneda))]
  if (monedas.length === 0) {
    y = seccion(doc, y, 'Sin gastos en el período')
  }
  for (const moneda of monedas) {
    const suyos = d.gastos.filter((g) => g.moneda === moneda)
    const total = suyos.reduce((s, g) => s + g.monto, 0)
    y = seccion(doc, y, `En ${moneda} · ${n(total)}`)
    y = tabla(
      doc,
      y,
      [
        { titulo: 'Categoría', ancho: 46 },
        { titulo: 'Subcategoría', ancho: 50 },
        { titulo: 'Mov.', ancho: 12, alDerecha: true },
        { titulo: 'Monto', ancho: 26, alDerecha: true },
        { titulo: '%', ancho: 16, alDerecha: true },
      ],
      suyos.map((g) => [
        g.padre,
        g.categoria === g.padre ? '' : g.categoria,
        String(g.movimientos),
        n(g.monto),
        total > 0 ? `${n((g.monto / total) * 100)} %` : '',
      ]),
    )
  }
  notaBajoLaTabla(
    doc,
    y,
    'Cada moneda se totaliza por separado. «SIN CLASIFICAR» es lo que se pagó sin decir en qué: se clasifica después desde Movimientos de dinero.',
  )
  return cerrar(doc, d, titulo, 'tesoreria-gastos-por-categoria.pdf')
}

// ---------------------------------------------------------------------------
// 4. Cierre de mes
// ---------------------------------------------------------------------------

export async function armarCierreDeMes(
  d: Cabecera & {
    /** «septiembre de 2026» */
    mes: string
    archivo: string
    cuentas: CierreDeCuenta[]
    monedas: CierreDeMoneda[]
    gastos: GastoDeCategoria[]
    movimientos: number
  },
): Promise<ArchivoArmado> {
  const titulo = `Cierre de ${d.mes}`
  const { doc, y: y0 } = await abrir(d, 'Cierre de mes', d.mes)
  let y = seccion(doc, y0, 'Alcance')
  y = etiquetaValor(doc, y, [
    ['Mes', d.mes],
    ['Movimientos del mes', String(d.movimientos)],
    ['Emitido por', d.emitidoPor],
  ])

  y = seccion(doc, y, 'Resultado del mes, por moneda')
  y = tabla(
    doc,
    y,
    [
      { titulo: 'Moneda', ancho: 30 },
      { titulo: 'Ingresos', ancho: 40, alDerecha: true },
      { titulo: 'Gastos', ancho: 40, alDerecha: true },
      { titulo: 'Resultado', ancho: 40, alDerecha: true },
    ],
    d.monedas.map((m) => [m.moneda, n(m.ingresos), n(m.gastos), n(m.resultado)]),
  )
  y = notaBajoLaTabla(
    doc,
    y,
    'Ni los traslados entre cuentas propias ni los saldos de apertura cuentan como ingreso o gasto: el dinero no entró ni salió de la empresa.',
  )

  y = seccion(doc, y, 'Cada caja, banco y billetera')
  y = tabla(
    doc,
    y,
    [
      { titulo: 'Cuenta', ancho: 46 },
      { titulo: 'Mon.', ancho: 12 },
      { titulo: 'Saldo inicial', ancho: 23, alDerecha: true },
      { titulo: 'Entró', ancho: 23, alDerecha: true },
      { titulo: 'Salió', ancho: 23, alDerecha: true },
      { titulo: 'Saldo final', ancho: 23, alDerecha: true },
    ],
    d.cuentas.map((c) => [c.cuenta, c.moneda, n(c.inicial), n(c.entradas), n(c.salidas), n(c.final)]),
  )
  y = notaBajoLaTabla(
    doc,
    y,
    'El saldo inicial es el final menos lo movido en el mes. Aquí «entró» y «salió» sí incluyen los traslados, porque en esa cuenta el dinero se movió de verdad.',
  )

  const monedas = [...new Set(d.gastos.map((g) => g.moneda))]
  for (const moneda of monedas) {
    const suyos = d.gastos.filter((g) => g.moneda === moneda)
    y = seccion(doc, y, `Gastos del mes en ${moneda}`)
    y = tabla(
      doc,
      y,
      [
        { titulo: 'Categoría', ancho: 56 },
        { titulo: 'Subcategoría', ancho: 56 },
        { titulo: 'Monto', ancho: 38, alDerecha: true },
      ],
      suyos.map((g) => [g.padre, g.categoria === g.padre ? '' : g.categoria, n(g.monto)]),
    )
  }

  return cerrar(doc, d, titulo, `tesoreria-cierre-${d.archivo}.pdf`)
}
