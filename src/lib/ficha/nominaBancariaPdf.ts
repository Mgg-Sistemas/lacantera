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
  fechaCorta,
  notaBajoLaTabla,
  type Columna,
} from '@/lib/ficha/papel'
import { bolivares, dolares, documento } from '@/lib/formato'

/*
  EL PAGO BANCARIO DE LA NÓMINA

  Es el papel con el que se ejecutan las transferencias y los pagos móviles del
  período: a quién, por cuál banco o teléfono, y cuánto — en bolívares, que es
  la moneda en que se paga, y en dólares al lado, sin protagonismo, para cuadrar
  contra el recibo de cada quien.

  EL MONTO ES EL DEL RECIBO YA CALCULADO, NO UNA CONVERSIÓN NUEVA. El período
  congela su propia tasa al calcularse (`periodo.tasa`/`tasa_usd`), y cada
  recibo guarda su `neto`/`neto_usd` con esa misma tasa — exactamente como hace
  el informe de cierre. Recalcular con la tasa de HOY contra un período que ya
  se calculó con otra dejaría un papel de pago que no cuadra con los recibos
  que ya se entregaron. Si la tasa cambió y todavía no se pagó, se refresca la
  tasa del período desde Procesos — no se inventa una segunda cuenta aquí.
*/

export interface TrabajadorAPagar {
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
  empresa: { razonSocial: string; rif: string }
  emitidoPor: string
  momento: Date
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
    return [etiqueta, t.banco ?? 'Sin banco', cuenta || 'Sin cuenta'].join('\n')
  }
  if (t.formaPago === 'PAGO_MOVIL') {
    return [etiqueta, t.banco ?? 'Sin banco', t.telefonoPago ?? 'Sin teléfono'].join('\n')
  }
  if (t.formaPago === 'BINANCE') {
    return [etiqueta, t.numeroCuenta ?? t.telefonoPago ?? 'Sin dato'].join('\n')
  }
  return etiqueta
}

const COLUMNAS: Columna[] = [
  { titulo: 'Ficha', ancho: 10 },
  { titulo: 'Trabajador', ancho: 38 },
  { titulo: 'Forma de pago y cuenta', ancho: 64 },
  { titulo: 'Neto Bs', ancho: 22, alDerecha: true },
  { titulo: 'Neto $', ancho: 16, alDerecha: true },
]

export async function armarPagoBancario(d: DatosPagoBancario): Promise<ArchivoArmado> {
  const titulo = 'Pago de nómina'
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['Período', d.periodo.numero],
      ['Emitido', fechaLarga(d.momento)],
    ],
  })
  y = tituloDocumento(doc, y, titulo)

  const totalBs = d.trabajadores.reduce((s, t) => s + Number(t.neto), 0)
  const totalUsd = d.trabajadores.reduce((s, t) => s + Number(t.netoUsd ?? 0), 0)

  y = seccion(doc, y, 'Período')
  y = etiquetaValor(doc, y, [
    ['Período', `${fechaCorta(d.periodo.desde)} al ${fechaCorta(d.periodo.hasta)}`],
    ['Trabajadores', String(d.trabajadores.length)],
    ['Tasa del período', `Bs ${Number(d.periodo.tasaUsd).toLocaleString('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} por $`],
    ['Total Bs', bolivares(totalBs)],
    ['Total $', dolares(totalUsd)],
    ['Emitido por', d.emitidoPor],
  ])

  y = seccion(doc, y, 'Planilla de pago')
  y = tabla(
    doc,
    y,
    COLUMNAS,
    d.trabajadores.length === 0
      ? [['', '', 'Sin trabajadores en este período', '', '']]
      : d.trabajadores.map((t) => [
          t.ficha,
          `${t.nombre}\n${documento(t.cedula)}`,
          datosDePago(t),
          bolivares(t.neto),
          dolares(t.netoUsd ?? 0),
        ]),
    `Total Bs ${bolivares(totalBs)} · Total $ ${dolares(totalUsd)}`,
  )
  notaBajoLaTabla(
    doc,
    y,
    'El monto es el del recibo ya calculado para este período, a la tasa con que se calculó — no la de hoy. Si la tasa cambió y el período no se ha pagado, se refresca desde Nómina › Procesos antes de sacar este papel.',
  )

  pieDePagina(doc, `Documento generado por el sistema · ${titulo} · ${fechaLarga(d.momento)}`)
  doc.setProperties({ title: titulo })
  return {
    blob: doc.output('blob'),
    nombre: `pago-nomina-${d.periodo.numero.replace(/\s+/g, '-')}.pdf`,
  }
}
