/*
  El papel del cierre de una caja del centro de costo.

  Sale de la foto congelada (`resumen_json`), nunca recalculando: el costo de
  un mes no cambia porque un gasto se registró en el siguiente. Y lleva los
  seis cierres anteriores en una fila, porque a gerencia lo que le sirve para
  fijar precio es la tendencia, no una foto suelta.
*/
import { logoComoImagen } from '@/lib/ficha/logo'
import { ABAJO, ARRIBA } from '@/lib/ficha/hoja'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import {
  fechaCorta,
  fechaLarga,
  etiquetaValor,
  lineaEmpresa,
  membrete,
  pieDePagina,
  seccion,
  tabla,
  tituloDocumento,
  type Columna,
  type EmpresaPapel,
} from '@/lib/ficha/papel'
import { CLASES, type ClaseCosto, type MovimientoCosto, type ResumenCaja } from '@/lib/api/costos'

const decimal2 = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const decimal4 = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })

const dinero = (v: number | string | null | undefined): string =>
  v === null || v === undefined ? '—' : `$ ${decimal2.format(Number(v))}`
const m3 = (v: number | string | null | undefined): string =>
  v === null || v === undefined ? '—' : decimal2.format(Number(v))
const porM3 = (v: number | null | undefined): string =>
  v === null || v === undefined ? '—' : `$ ${decimal4.format(v)} / m³`

const diceQueIncluye = (incluye: ClaseCosto[]): string =>
  incluye.length === 0 ? 'nada todavía' : incluye.map((c) => CLASES[c].toLowerCase()).join(' + ')

export interface DatosCierreDeCaja {
  resumen: ResumenCaja
  filas: MovimientoCosto[]
  empresa_papel: EmpresaPapel
  emitidoPor: string
  momento: Date
}

/* Los anchos suman los 150 mm útiles. */
const COL_PRODUCTO: Columna[] = [
  { titulo: 'Producto', ancho: 90 },
  { titulo: 'Salidas', ancho: 30, alDerecha: true },
  { titulo: 'm³ (estimado)', ancho: 30, alDerecha: true },
]
const COL_CATEGORIA: Columna[] = [
  { titulo: 'Categoría', ancho: 100 },
  { titulo: 'USD', ancho: 50, alDerecha: true },
]
const COL_TENDENCIA: Columna[] = [
  { titulo: 'Caja', ancho: 20 },
  { titulo: 'Hasta', ancho: 30 },
  { titulo: '$ / m³', ancho: 34, alDerecha: true },
  { titulo: 'm³ planta', ancho: 33, alDerecha: true },
  { titulo: 'Costo', ancho: 33, alDerecha: true },
]
const COL_MOVIMIENTO: Columna[] = [
  { titulo: 'Fecha', ancho: 20 },
  { titulo: 'Descripción', ancho: 66 },
  { titulo: 'Clase', ancho: 22 },
  { titulo: 'm³', ancho: 18, alDerecha: true },
  { titulo: 'USD', ancho: 24, alDerecha: true },
]

export async function armarCierreDeCaja(d: DatosCierreDeCaja): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const r = d.resumen
  const caja = r.caja
  const nombre = caja.nombre ? `Caja ${caja.numero} · ${caja.nombre}` : `Caja ${caja.numero}`

  let y = membrete(doc, logo, {
    empresa: d.empresa_papel,
    datos: [
      ['Caja', String(caja.numero)],
      ['Desde', fechaCorta(caja.fecha_inicio)],
      ['Hasta', caja.fecha_fin ? fechaCorta(caja.fecha_fin) : 'abierta'],
      ['Generado', fechaLarga(d.momento)],
    ],
  })

  y = tituloDocumento(doc, y, `Cierre de caja · Centro de costo`)
  y = lineaEmpresa(doc, y, `${d.empresa_papel.razonSocial} · RIF ${d.empresa_papel.rif} · ${nombre}`)

  y = seccion(doc, y, 'Resumen')
  y = etiquetaValor(doc, y, [
    ['Costo por m³', r.dinero_tapado ? 'sin acceso al pago de viajes' : porM3(r.costo_por_m3)],
    ['Incluye', diceQueIncluye(r.incluye)],
    ['Costo de la caja', dinero(r.costo_usd)],
    ['Ajustes de cajas cerradas', dinero(r.ajustes_tardios_usd)],
    ['m³ salidos de planta', `${m3(r.m3_planta)} (estimado por carga útil)`],
    ['m³ bajados de la mina', m3(r.m3_mina)],
    ['Costo por m³ de mina', porM3(r.costo_por_m3_mina)],
    ['Saldo inicial', dinero(caja.saldo_inicial_usd)],
    ['Entregado', dinero(r.entregado_usd)],
    ['Abonado', dinero(r.abonado_usd)],
    ['Fondo', dinero(r.fondo_usd)],
    ['Fondo asignado', r.fondo_asignado_usd === null ? 'sin asignar' : dinero(r.fondo_asignado_usd)],
  ])

  if (r.por_producto.length > 0) {
    y = seccion(doc, y + 2, 'm³ por producto')
    y = tabla(
      doc,
      y,
      COL_PRODUCTO,
      r.por_producto.map((p) => [p.producto, String(p.salidas), m3(p.m3)]),
      `Total   ${m3(r.m3_planta)} m³`,
    )
  }

  if (r.por_categoria.length > 0) {
    y = seccion(doc, y + 2, 'Costo por categoría')
    y = tabla(
      doc,
      y,
      COL_CATEGORIA,
      r.por_categoria.map((c) => [c.nombre, dinero(c.monto_usd)]),
      `Total   ${dinero(r.costo_usd)}`,
    )
  }

  if (r.tendencia.length > 0) {
    if (y + 40 > ABAJO - 30) {
      doc.addPage()
      y = ARRIBA
    }
    y = seccion(doc, y + 2, 'Últimos cierres')
    y = tabla(
      doc,
      y,
      COL_TENDENCIA,
      r.tendencia.map((t) => [
        String(t.numero),
        fechaCorta(t.fecha_fin),
        t.costo_por_m3 === null ? '—' : `$ ${decimal4.format(t.costo_por_m3)}`,
        m3(t.m3_planta),
        dinero(t.costo_usd),
      ]),
    )
  }

  if (d.filas.length > 0) {
    doc.addPage()
    y = ARRIBA
    y = seccion(doc, y, 'Movimientos')
    y = tabla(
      doc,
      y,
      COL_MOVIMIENTO,
      d.filas.map((f) => [
        fechaCorta(f.fecha),
        (f.sentido === 'REVERSO' ? '↩ ' : '') + f.descripcion + (f.llego_tarde ? ' (llegó tarde)' : ''),
        CLASES[f.clase] ?? f.clase,
        m3(f.m3),
        dinero(f.monto_usd),
      ]),
    )
  }

  pieDePagina(doc, `Cierre de caja ${caja.numero} · centro de costo · emitido por ${d.emitidoPor}`)

  return { blob: doc.output('blob'), nombre: `cierre-caja-${caja.numero}.pdf` }
}
