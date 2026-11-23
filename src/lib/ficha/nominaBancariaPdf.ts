import { logoComoImagen } from '@/lib/ficha/logo'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import {
  membrete,
  tituloDocumento,
  seccion,
  etiquetaValor,
  tabla,
  firmas,
  pieDePagina,
  fechaLarga,
  fechaCorta,
  notaBajoLaTabla,
  type Columna,
} from '@/lib/ficha/papel'
import { ABAJO } from '@/lib/ficha/hoja'
import { bolivares, dolares, documento } from '@/lib/formato'

/*
  EL PAGO BANCARIO DE LA NÓMINA (Y LOTE BANCO DEL TESORO 0163)

  Es el papel con el que se ejecutan las transferencias y los pagos móviles del
  período: con su correlativo de operación bancaria (`0163XXXXXX`), a quién, por
  cuál banco o cuenta, y cuánto — en bolívares, que es la moneda en que se paga,
  y en dólares al lado para cuadrar contra el recibo de cada quien.
*/

export interface TrabajadorAPagar {
  correlativo?: string | null
  ficha: string
  nombre: string
  cedula: string
  formaPago: string
  banco: string | null
  tipoCuenta: string | null
  numeroCuenta: string | null
  telefonoPago: string | null
  neto: string | number
  netoUsd: string | number | null
}

export interface DatosPagoBancario {
  periodo: { numero: string; desde: string; hasta: string; tasaUsd: string | number }
  trabajadores: TrabajadorAPagar[]
  empresa: { razonSocial: string; rif: string; actividad?: string | null; domicilio?: string | null }
  emitidoPor: string
  momento: Date
  alcance?: string | null
  cuentaOrdenante?: string | null
  fechaValor?: string | null
  firmaRrhh?: string | null
}

const FORMA_PAGO: Record<string, string> = {
  TRANSFERENCIA: 'Transferencia',
  PAGO_MOVIL: 'Pago móvil',
  EFECTIVO: 'Efectivo',
  BINANCE: 'Binance',
}

const TIPO_CUENTA: Record<string, string> = {
  CORRIENTE: 'Corriente',
  AHORRO: 'Ahorro',
}

/** Lo que hace falta para pagarle, en las líneas que la celda deja partir. */
function datosDePago(t: TrabajadorAPagar): string {
  const etiqueta = FORMA_PAGO[t.formaPago] ?? t.formaPago

  if (t.formaPago === 'TRANSFERENCIA') {
    const cuenta = [t.tipoCuenta ? TIPO_CUENTA[t.tipoCuenta] : null, t.numeroCuenta]
      .filter(Boolean)
      .join(' · ')
    return [t.banco ?? etiqueta, cuenta || 'Sin cuenta'].join('\n')
  }
  if (t.formaPago === 'PAGO_MOVIL') {
    return [etiqueta, t.banco ?? 'Sin banco', t.telefonoPago ?? 'Sin teléfono'].join('\n')
  }
  if (t.formaPago === 'BINANCE') {
    return [etiqueta, t.numeroCuenta ?? t.telefonoPago ?? 'Sin dato'].join('\n')
  }
  return etiqueta
}

// Suma exacta = 150 mm (ANCHO_UTIL)
const COLUMNAS_CON_CORRELATIVO: Columna[] = [
  { titulo: 'Correlativo', ancho: 21 },
  { titulo: 'Ficha', ancho: 11 },
  { titulo: 'Trabajador / Cédula', ancho: 37 },
  { titulo: 'Banco y número de cuenta', ancho: 45 },
  { titulo: 'Neto Bs', ancho: 21, alDerecha: true },
  { titulo: 'Neto $', ancho: 15, alDerecha: true },
]

const COLUMNAS_CLASICAS: Columna[] = [
  { titulo: 'Ficha', ancho: 10 },
  { titulo: 'Trabajador', ancho: 38 },
  { titulo: 'Forma de pago y cuenta', ancho: 64 },
  { titulo: 'Neto Bs', ancho: 22, alDerecha: true },
  { titulo: 'Neto $', ancho: 16, alDerecha: true },
]

export async function armarPagoBancario(d: DatosPagoBancario): Promise<ArchivoArmado> {
  const llevaCorrelativos = d.trabajadores.some((t) => Boolean(t.correlativo))
  const titulo = llevaCorrelativos ? 'Relación de pago masivo de nómina' : 'Pago de nómina'
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  const primero = d.trabajadores[0]?.correlativo ?? null
  const ultimo = d.trabajadores.at(-1)?.correlativo ?? null

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['Período', d.periodo.numero],
      ...(primero && ultimo
        ? [['Correlativos', primero === ultimo ? primero : `${primero} – ${ultimo}`] as [string, string]]
        : []),
      ['Emitido', fechaLarga(d.momento)],
    ],
  })
  y = tituloDocumento(doc, y, titulo)

  const totalBs = d.trabajadores.reduce((s, t) => s + Number(t.neto), 0)
  const totalUsd = d.trabajadores.reduce((s, t) => s + Number(t.netoUsd ?? 0), 0)

  const resumenDatos: [string, string][] = [
    ['Período', `${fechaCorta(d.periodo.desde)} al ${fechaCorta(d.periodo.hasta)}`],
    ['Registros incluidos', String(d.trabajadores.length)],
    [
      'Tasa del período',
      `Bs ${Number(d.periodo.tasaUsd).toLocaleString('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} por $`,
    ],
    ['Total a abonar (Bs)', bolivares(totalBs)],
    ['Equivalencia ($)', dolares(totalUsd)],
    ['Emitido por', d.emitidoPor],
  ]

  if (d.alcance) resumenDatos.push(['Alcance del lote', d.alcance])
  if (d.cuentaOrdenante) resumenDatos.push(['Cuenta a debitar', d.cuentaOrdenante])
  if (d.fechaValor) resumenDatos.push(['Fecha valor', fechaCorta(d.fechaValor)])

  y = seccion(doc, y, 'Resumen del lote bancario')
  y = etiquetaValor(doc, y, resumenDatos)

  y = seccion(doc, y, 'Detalle de abonos a trabajadores')
  y = tabla(
    doc,
    y,
    llevaCorrelativos ? COLUMNAS_CON_CORRELATIVO : COLUMNAS_CLASICAS,
    d.trabajadores.length === 0
      ? [
          llevaCorrelativos
            ? ['', '', 'Sin trabajadores en este lote', '', '', '']
            : ['', '', 'Sin trabajadores en este período', '', ''],
        ]
      : d.trabajadores.map((t) =>
          llevaCorrelativos
            ? [
                t.correlativo ?? '—',
                t.ficha,
                `${t.nombre}\n${documento(t.cedula)}`,
                datosDePago(t),
                bolivares(t.neto),
                dolares(t.netoUsd ?? 0),
              ]
            : [
                t.ficha,
                `${t.nombre}\n${documento(t.cedula)}`,
                datosDePago(t),
                bolivares(t.neto),
                dolares(t.netoUsd ?? 0),
              ],
        ),
    `Total Bs ${bolivares(totalBs)} · Total $ ${dolares(totalUsd)}`,
  )

  y = notaBajoLaTabla(
    doc,
    y,
    'El monto en bolívares corresponde exactamente al neto sellado en cada recibo del período, calculado a la tasa oficial registrada para dicho corte.',
  )

  if (y + 30 > ABAJO) {
    doc.addPage()
    y = 32
  }
  firmas(
    doc,
    y + 22,
    { texto: 'Elaborado por Recursos Humanos', nombre: d.firmaRrhh || d.emitidoPor },
    { texto: 'Autorizado por Administración / Tesorería' },
  )

  pieDePagina(doc, `Documento generado por el sistema · ${titulo} · ${fechaLarga(d.momento)}`)
  doc.setProperties({ title: titulo })
  return {
    blob: doc.output('blob'),
    nombre: `pago-nomina-${d.periodo.numero.replace(/\s+/g, '-')}.pdf`,
  }
}
