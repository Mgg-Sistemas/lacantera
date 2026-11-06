import { logoComoImagen } from '@/lib/ficha/logo'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { dinero } from '@/lib/formato'
import {
  membrete,
  tituloDocumento,
  lineaEmpresa,
  seccion,
  etiquetaValor,
  tabla,
  notaBajoLaTabla,
  firmas,
  pieDePagina,
  fechaLarga,
  fechaCorta,
  type Columna,
  type EmpresaPapel,
} from '@/lib/ficha/papel'
import type { EstadoPago, NotaCubiertaDeMas, NotaSinPago, PagoBancario } from '@/lib/api/pagosBancarios'

/*
  EL REPORTE DE REGISTROS DE PAGOS, Y EL CIERRE DE MES.

  Christopher, 06/11/2026: «necesitaremos un reporte PDF… dar opción a cierre
  de mes». Dos modos con el mismo papel:

  - LISTA: lo que la pantalla tiene filtrado, tal cual. No vuelve a consultar
    con sus propios filtros, igual que el historial de salidas.
  - CIERRE: un mes entero, sin importar los filtros de la pantalla. Además de
    los pagos, dice qué notas de entrega del mes no tienen ningún pago —el
    pendiente del otro lado— y deja las rayas para firmar quien elabora y
    quien revisa.

  NADA SE SUMA ENTRE MONEDAS. Los totales van por moneda; lo único que se
  junta es el equivalente en dólares, que ya viene convertido con la tasa de
  cada pago y lo dice así.

  Lo que se apaga en las opciones no deja rastro: ni una sección vacía ni un
  rótulo que diga «oculto».
*/

export const ETIQUETA_ESTADO: Record<EstadoPago, string> = {
  CUADRA: 'Cuadra',
  MINIMA: 'Diferencia mínima',
  DIFERENCIA: 'No cuadra',
  SIN_NOTAS: 'Sin notas',
  ANULADO: 'Anulado',
}

export interface DatosReportePagos {
  modo: 'LISTA' | 'CIERRE'
  /** «Septiembre 2026», solo en el cierre. */
  mes?: string
  alcance: Array<[string, string | null | undefined]>
  pagos: PagoBancario[]
  conNotasDelPago: boolean
  /** Null: la sección no va (no es cierre, o se apagó). */
  notasSinPago: NotaSinPago[] | null
  /** Notas del mes que reciben más de lo que valen. Null o vacío: la sección no va. */
  cubiertasDeMas: NotaCubiertaDeMas[] | null
  conLogo: boolean
  /** Lo que cambia en las opciones va aquí: «registros-de-pagos-cierre-2026-09.pdf». */
  nombreArchivo: string
  empresa: EmpresaPapel
  emitidoPor: string
  momento: Date
}

const COLUMNAS_PAGOS: Columna[] = [
  { titulo: 'Fecha · Ref.', ancho: 27 },
  { titulo: 'Descripción · notas', ancho: 55 },
  { titulo: 'Banco', ancho: 24, alDerecha: true },
  { titulo: 'Notas', ancho: 24, alDerecha: true },
  { titulo: 'Estado', ancho: 20 },
]

const COLUMNAS_SIN_PAGO: Columna[] = [
  { titulo: 'Nota', ancho: 30 },
  { titulo: 'Cliente', ancho: 70 },
  { titulo: 'Total', ancho: 30, alDerecha: true },
  { titulo: 'Condición', ancho: 20 },
]

const COLUMNAS_DE_MAS: Columna[] = [
  { titulo: 'Nota', ancho: 30 },
  { titulo: 'Cliente', ancho: 50 },
  { titulo: 'Vale', ancho: 25, alDerecha: true },
  { titulo: 'Recibe', ancho: 25, alDerecha: true },
  { titulo: 'Pagos', ancho: 20, alDerecha: true },
]

/** Suma por moneda, sin mezclarlas: { VES: 123, USD: 45 }. */
function porMoneda<T>(filas: T[], moneda: (f: T) => string, valor: (f: T) => number) {
  const totales = new Map<string, number>()
  for (const f of filas) totales.set(moneda(f), (totales.get(moneda(f)) ?? 0) + valor(f))
  return totales
}

const enLista = (totales: Map<string, number>) =>
  Array.from(totales.entries())
    .map(([m, v]) => dinero(m, v))
    .join('  ·  ') || '—'

export function resumenDePagos(pagos: PagoBancario[]): Array<[string, string]> {
  const vigentes = pagos.filter((p) => p.estado !== 'ANULADO')
  const cuenta = (e: EstadoPago) => vigentes.filter((p) => p.estado === e).length
  const banco = porMoneda(vigentes, (p) => p.moneda, (p) => Number(p.monto))
  const asociado = porMoneda(vigentes, (p) => p.moneda, (p) => Number(p.aplicado))
  const diferencia = porMoneda(vigentes, (p) => p.moneda, (p) => Number(p.diferencia))
  const usd = vigentes.reduce((a, p) => a + Number(p.monto_usd ?? 0), 0)

  return [
    ['Pagos', String(vigentes.length)],
    ['Equivalente total', `${dinero('USD', usd)} (con la tasa de cada pago)`],
    ['Total del banco', enLista(banco)],
    ['Total asociado a notas', enLista(asociado)],
    ['Diferencia', enLista(diferencia)],
    ['Cuadran', String(cuenta('CUADRA'))],
    ['Diferencia mínima', String(cuenta('MINIMA'))],
    ['No cuadran', String(cuenta('DIFERENCIA'))],
    ['Sin notas', String(cuenta('SIN_NOTAS'))],
    ...(pagos.length > vigentes.length
      ? ([['Anulados (no suman)', String(pagos.length - vigentes.length)]] as [string, string][])
      : []),
  ]
}

export async function armarReportePagos(d: DatosReportePagos): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = d.conLogo ? await logoComoImagen() : ''
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  const titulo = d.modo === 'CIERRE' ? `Cierre de mes · ${d.mes ?? ''}` : 'Registros de pagos'

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [['Generado', fechaLarga(d.momento)]],
  })
  y = tituloDocumento(doc, y, titulo)
  y = lineaEmpresa(doc, y, `${d.empresa.razonSocial} · RIF ${d.empresa.rif} · Pagos del banco y notas de entrega`)

  y = seccion(doc, y, 'Alcance')
  y = etiquetaValor(doc, y, [...d.alcance, ['Emitido por', d.emitidoPor]])

  y = seccion(doc, y, 'Resumen')
  y = etiquetaValor(doc, y, resumenDePagos(d.pagos))

  y = seccion(doc, y, 'Pagos del banco')
  y = tabla(
    doc,
    y,
    COLUMNAS_PAGOS,
    d.pagos.map((p) => {
      const detalle = [p.descripcion ?? '']
      if (d.conNotasDelPago) {
        detalle.push(p.notas > 0 ? `Notas: ${p.numeros ?? ''}${p.clientes ? ` · ${p.clientes}` : ''}` : 'Sin notas asociadas')
      }
      const estado =
        p.estado === 'MINIMA' || p.estado === 'DIFERENCIA'
          ? `${ETIQUETA_ESTADO[p.estado]}\n${Number(p.diferencia) > 0 ? 'sobran' : 'faltan'} ${dinero(p.moneda, Math.abs(Number(p.diferencia)))}`
          : ETIQUETA_ESTADO[p.estado]
      return [
        `${fechaCorta(p.fecha)}\n${p.referencia ? `REF ${p.referencia}` : 'Sin ref.'}`,
        detalle.filter(Boolean).join('\n') || '—',
        dinero(p.moneda, p.monto),
        p.notas > 0 ? dinero(p.moneda, p.aplicado) : '—',
        estado,
      ]
    }),
  )
  y = notaBajoLaTabla(
    doc,
    y,
    '«Notas» es lo que cubren las notas de entrega asociadas a cada pago, en la moneda del pago. Diferencia mínima: no suma exacto, pero la diferencia es de redondeo de la tasa.',
  )

  if (d.notasSinPago) {
    y = seccion(doc, y + 2, 'Notas de entrega del mes sin pago asociado')
    if (d.notasSinPago.length === 0) {
      y = etiquetaValor(doc, y, [['Pendientes', 'Ninguna: todas las notas del mes tienen pago asociado.']])
    } else {
      const total = porMoneda(d.notasSinPago, (n) => n.moneda, (n) => Number(n.total))
      y = tabla(
        doc,
        y,
        COLUMNAS_SIN_PAGO,
        d.notasSinPago.map((n) => [
          `${n.numero}\n${fechaCorta(n.fecha)}`,
          n.cliente ?? 'Sin cliente',
          dinero(n.moneda, n.total),
          n.facturable ? 'Facturable' : 'No facturable',
        ]),
        `${d.notasSinPago.length} NOTAS   ${enLista(total)}`,
      )
    }
  }

  if (d.cubiertasDeMas && d.cubiertasDeMas.length > 0) {
    y = seccion(doc, y + 2, 'Notas cubiertas de más')
    y = tabla(
      doc,
      y,
      COLUMNAS_DE_MAS,
      d.cubiertasDeMas.map((n) => [
        `${n.numero}\n${fechaCorta(n.fecha)}`,
        n.cliente ?? 'Sin cliente',
        dinero('USD', n.total_usd),
        dinero('USD', n.aplicado_usd),
        String(n.pagos),
      ]),
    )
    y = notaBajoLaTabla(
      doc,
      y,
      'Estas notas reciben en sus pagos más de lo que valen (por encima del 0,5 % de redondeo). Hay que quitar la nota de los pagos que no le corresponden, o bajar su monto aplicado, antes de dar el mes por cerrado.',
    )
  }

  if (d.modo === 'CIERRE') {
    if (y > 245) {
      doc.addPage()
      y = 30
    }
    firmas(doc, y + 18, { texto: 'Elaborado por', nombre: d.emitidoPor }, 'Revisado por')
  }

  pieDePagina(doc, `Documento generado por el sistema · ${titulo} · ${fechaLarga(d.momento)}`)
  doc.setProperties({ title: titulo })

  return { blob: doc.output('blob'), nombre: d.nombreArchivo }
}
