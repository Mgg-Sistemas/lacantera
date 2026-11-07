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
import type { NotaPorCobrarDeCliente } from '@/lib/api/ventas'

/*
  EL REPORTE DE LOS CLIENTES QUE DEBEN POR NOTAS DE ENTREGA (07/11/2026).

  Pedido: «un reporte de los clientes que deben con su monto correspondiente».
  Las notas son las pendientes por cobrar, sin cobrar y no anuladas. Cada una
  trae su total en Bs y en $ con la tasa del día en que se hizo —igual que el
  reporte Bs/$ de Notas de entrega—, y esos dos equivalentes son lo único que
  se suma.

  Lo que se apaga en las opciones no deja rastro: sin detalle no hay sección
  vacía, y «solo vencidas» se dice en el alcance porque cambia qué se cuenta.
*/

type Doc = InstanceType<typeof import('jspdf').jsPDF>

export interface ClienteQueDebe {
  clave: string
  cliente: string
  rif: string | null
  notas: NotaPorCobrarDeCliente[]
  vencidas: number
  bs: number
  usd: number
  usdVencido: number
}

/** Agrupa las notas por cliente, de quien más debe a quien menos. */
export function agruparPorCliente(notas: NotaPorCobrarDeCliente[]): ClienteQueDebe[] {
  const grupos = new Map<string, ClienteQueDebe>()
  for (const n of notas) {
    const clave = n.cliente_id != null ? String(n.cliente_id) : 'sin-cliente'
    const g =
      grupos.get(clave) ??
      ({ clave, cliente: n.cliente ?? 'Sin cliente', rif: n.rif, notas: [], vencidas: 0, bs: 0, usd: 0, usdVencido: 0 } as ClienteQueDebe)
    g.notas.push(n)
    g.bs += Number(n.total_bs ?? 0)
    g.usd += Number(n.total_usd ?? 0)
    if (n.vencida) {
      g.vencidas += 1
      g.usdVencido += Number(n.total_usd ?? 0)
    }
    grupos.set(clave, g)
  }
  return Array.from(grupos.values()).sort((a, b) => b.usd - a.usd)
}

/** Días desde que venció; 0 si todavía no vence o no tiene fecha. */
export function diasVencida(fechaPago: string | null, hoy = new Date()): number {
  if (!fechaPago) return 0
  const [a, m, d] = fechaPago.split('-').map(Number)
  const vence = new Date(a, m - 1, d)
  const cero = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.max(0, Math.round((cero.getTime() - vence.getTime()) / 86_400_000))
}

export interface DatosReporteClientesPorCobrar {
  clientes: ClienteQueDebe[]
  alcance: Array<[string, string | null | undefined]>
  conDetalle: boolean
  conLogo: boolean
  nombreArchivo: string
  empresa: EmpresaPapel
  emitidoPor: string
  momento: Date
}

const COLUMNAS_CLIENTES: Columna[] = [
  { titulo: 'Cliente', ancho: 62 },
  { titulo: 'Notas', ancho: 16, alDerecha: true },
  { titulo: 'Vencidas', ancho: 18, alDerecha: true },
  { titulo: 'Total Bs', ancho: 30, alDerecha: true },
  { titulo: 'Total $', ancho: 24, alDerecha: true },
]

const COLUMNAS_NOTAS: Columna[] = [
  { titulo: 'Nota', ancho: 30 },
  { titulo: 'Vence', ancho: 36 },
  { titulo: 'Moneda', ancho: 16 },
  { titulo: 'Total Bs', ancho: 38, alDerecha: true },
  { titulo: 'Total $', ancho: 30, alDerecha: true },
]

function totalArriba(doc: Doc, y: number, clientes: ClienteQueDebe[]): number {
  const usd = clientes.reduce((s, c) => s + c.usd, 0)
  const bs = clientes.reduce((s, c) => s + c.bs, 0)
  const vencido = clientes.reduce((s, c) => s + c.usdVencido, 0)
  const notas = clientes.reduce((s, c) => s + c.notas.length, 0)
  const ALTO = 24

  doc.setDrawColor(MARCA).setLineWidth(0.4).setFillColor(FILA_ALTERNA)
  doc.rect(IZQ, y, ANCHO_UTIL, ALTO, 'FD')

  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(ROTULO)
  doc.text('TOTAL POR COBRAR EN NOTAS DE ENTREGA', IZQ + 4, y + 6)

  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(TINTA)
  doc.text(`${dinero('USD', usd)}  ·  ${dinero('VES', bs)}`, IZQ + 4, y + 14)

  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(GRIS)
  doc.text(
    `Vencido: ${dinero('USD', vencido)} · ${clientes.length} cliente${clientes.length === 1 ? '' : 's'} · ${notas} nota${notas === 1 ? '' : 's'}`,
    IZQ + 4,
    y + 20,
  )
  return y + ALTO + 8
}

export async function armarReporteClientesPorCobrar(d: DatosReporteClientesPorCobrar): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = d.conLogo ? await logoComoImagen() : ''
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const titulo = 'Clientes con cuentas por cobrar'

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [['Generado', fechaLarga(d.momento)]],
  })
  y = tituloDocumento(doc, y, titulo)
  y = lineaEmpresa(doc, y, `${d.empresa.razonSocial} · RIF ${d.empresa.rif} · Notas de entrega por cobrar`)

  y = totalArriba(doc, y, d.clientes)

  y = seccion(doc, y, 'Alcance')
  y = etiquetaValor(doc, y, [...d.alcance, ['Emitido por', d.emitidoPor]])

  y = seccion(doc, y, 'Por cliente')
  y = tabla(
    doc,
    y,
    COLUMNAS_CLIENTES,
    d.clientes.map((c) => [
      c.rif ? `${c.cliente}\n${documento(c.rif)}` : c.cliente,
      String(c.notas.length),
      String(c.vencidas),
      dinero('VES', c.bs),
      dinero('USD', c.usd),
    ]),
    `${d.clientes.length} CLIENTE${d.clientes.length === 1 ? '' : 'S'}   ${dinero('VES', d.clientes.reduce((s, c) => s + c.bs, 0))}  ·  ${dinero('USD', d.clientes.reduce((s, c) => s + c.usd, 0))}`,
  )
  y = notaBajoLaTabla(
    doc,
    y,
    'Bs y $ de cada nota con la tasa del día en que se hizo. Una nota está vencida cuando su fecha de pago ya pasó.',
  )

  if (d.conDetalle) {
    for (const c of d.clientes) {
      // Que el nombre del cliente no quede solo al pie de la hoja.
      if (y > 215) {
        doc.addPage()
        y = 30
      }
      y = seccion(doc, y + 2, c.cliente)
      y = tabla(
        doc,
        y,
        COLUMNAS_NOTAS,
        c.notas.map((n) => {
          const dias = n.vencida ? diasVencida(n.fecha_pago, d.momento) : 0
          return [
            `${n.numero}\n${fechaCorta(n.fecha)}`,
            n.fecha_pago
              ? `${fechaCorta(n.fecha_pago)}${dias > 0 ? `\nvencida hace ${dias} día${dias === 1 ? '' : 's'}` : ''}`
              : 'Sin fecha',
            n.moneda === 'VES' ? 'Bs' : n.moneda,
            dinero('VES', n.total_bs ?? 0),
            dinero('USD', n.total_usd ?? 0),
          ]
        }),
        `${c.notas.length} NOTA${c.notas.length === 1 ? '' : 'S'}   ${dinero('VES', c.bs)}  ·  ${dinero('USD', c.usd)}`,
      )
    }
  }

  pieDePagina(doc, `Documento generado por el sistema · ${titulo}`)
  doc.setProperties({ title: titulo })

  return { blob: doc.output('blob'), nombre: d.nombreArchivo }
}
