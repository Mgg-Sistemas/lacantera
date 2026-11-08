import { logoComoImagen } from '@/lib/ficha/logo'
import { ARRIBA, ABAJO } from '@/lib/ficha/hoja'
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
  type Columna,
} from '@/lib/ficha/papel'
import type { HojaXlsx } from '@/lib/xlsx'

/*
  📄 REPORTE · {ALMACÉN} Y 📊 CONSUMO · {ALMACÉN} (fase 6, 08/11/2026)

  Los papeles de `almacenExport.ts` y `ConsumoChartModal.tsx` de MGG, hechos
  con lo que La Cantera ya usa: el PDF con el membrete y la tabla de
  `papel.ts` (se abre en el Visor, con su botón de descarga) y el Excel con
  `lib/xlsx.ts`, sin librerías nuevas.

  El precio solo sale si quien emite puede verlo: sin
  `INVENTARIO.VER_VALORACION` la vista devuelve nulo, y un papel que dice que
  todo vale 0,00 afirma algo falso (ver `actaExistencias.ts`).
*/

const decimal2 = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const dinero = (v: number): string => `$ ${decimal2.format(v)}`

/** Entera si es entera. Ocho mil litros no se leen «8.000,00». */
const cantidad = (v: number): string =>
  Number.isInteger(v) ? v.toLocaleString('es-VE') : decimal2.format(v)

const sufijo = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export interface EmpresaDelReporte {
  razonSocial: string
  rif: string
}

// ---------------------------------------------------------------------------
// 📄 Reporte · {almacén}
// ---------------------------------------------------------------------------

/** Un producto con existencia en el almacén. */
export interface RenglonDeReporte {
  codigo: string
  producto: string
  categoria: string
  unidad: string
  stock: number
  /** Nulos si quien emite no ve precios. */
  costo: number | null
  valor: number | null
}

export interface DatosReporteAlmacen {
  almacen: string
  renglones: RenglonDeReporte[]
  empresa: EmpresaDelReporte
  emitidoPor: string
  momento: Date
}

/* Suman los 150 mm útiles de la hoja. */
const COLUMNAS_REPORTE: Columna[] = [
  { titulo: 'Código', ancho: 22 },
  { titulo: 'Producto', ancho: 46 },
  { titulo: 'Categoría', ancho: 22 },
  { titulo: 'Unidad', ancho: 14 },
  { titulo: 'Stock', ancho: 16, alDerecha: true },
  { titulo: 'Costo unit.', ancho: 14, alDerecha: true },
  { titulo: 'Valor', ancho: 16, alDerecha: true },
]

/* Sin precios, el producto se queda con el ancho de las dos columnas de dinero. */
const COLUMNAS_REPORTE_SIN_PRECIO: Columna[] = [
  { titulo: 'Código', ancho: 24 },
  { titulo: 'Producto', ancho: 70 },
  { titulo: 'Categoría', ancho: 24 },
  { titulo: 'Unidad', ancho: 14 },
  { titulo: 'Stock', ancho: 18, alDerecha: true },
]

const conPrecio = (r: RenglonDeReporte[]) => r.some((x) => x.valor !== null || x.costo !== null)
const totalDe = (r: RenglonDeReporte[]) => r.reduce((s, x) => s + (x.valor ?? 0), 0)

/** Dibuja la tabla de productos de un almacén y devuelve dónde sigue el papel. */
function tablaDeProductos(doc: Parameters<typeof tabla>[0], y: number, renglones: RenglonDeReporte[], pie: string) {
  const precio = conPrecio(renglones)
  return tabla(
    doc,
    y,
    precio ? COLUMNAS_REPORTE : COLUMNAS_REPORTE_SIN_PRECIO,
    renglones.map((r) => [
      r.codigo,
      r.producto,
      r.categoria,
      r.unidad,
      cantidad(r.stock),
      ...(precio ? [dinero(r.costo ?? 0), dinero(r.valor ?? 0)] : []),
    ]),
    precio ? pie : '',
  )
}

/** `descargarAlmacenPdf` de MGG. */
export async function armarReporteAlmacen(d: DatosReporteAlmacen): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['Almacén', d.almacen],
      ['Generado', fechaLarga(d.momento)],
    ],
  })
  y = tituloDocumento(doc, y, `Inventario · Almacén ${d.almacen}`)
  y = lineaEmpresa(doc, y, `${d.empresa.razonSocial} · RIF ${d.empresa.rif} · Sistema administrativo`)

  const precio = conPrecio(d.renglones)
  y = seccion(doc, y, 'Resumen')
  y = etiquetaValor(doc, y, [
    ['Almacén', d.almacen],
    ['Productos', String(d.renglones.length)],
    ['Valor total', precio ? dinero(totalDe(d.renglones)) : 'No se muestra: quien emite no ve precios'],
    ['Emitido por', d.emitidoPor],
  ])

  y = seccion(doc, y, 'Productos')
  tablaDeProductos(doc, y, d.renglones, `VALOR TOTAL   ${dinero(totalDe(d.renglones))}`)

  pieDePagina(doc, `Documento generado por el sistema · ${d.almacen} · ${fechaLarga(d.momento)}`)
  doc.setProperties({ title: `Inventario · Almacén ${d.almacen}` })
  return { blob: doc.output('blob'), nombre: `almacen-${sufijo(d.almacen)}.pdf` }
}

/** `descargarAlmacenExcel` de MGG. */
export function hojaReporteAlmacen(almacen: string, renglones: RenglonDeReporte[]): HojaXlsx {
  const precio = conPrecio(renglones)
  return {
    nombre: almacen,
    columnas: [
      { titulo: 'SKU', ancho: 16 },
      { titulo: 'Producto', ancho: 40 },
      { titulo: 'Categoría', ancho: 18 },
      { titulo: 'Unidad', ancho: 10 },
      { titulo: 'Stock', ancho: 12 },
      ...(precio
        ? [
            { titulo: 'Costo unit. (prom.)', ancho: 18 },
            { titulo: 'Valor', ancho: 14 },
          ]
        : []),
    ],
    filas: [
      ...renglones.map((r) => [
        r.codigo,
        r.producto,
        r.categoria,
        r.unidad,
        r.stock,
        ...(precio ? [r.costo ?? 0, r.valor ?? 0] : []),
      ]),
      ...(precio ? [[], ['', '', '', '', '', 'VALOR TOTAL', totalDe(renglones)]] : []),
    ],
  }
}

// ---------------------------------------------------------------------------
// 📄 Reporte general (todos los almacenes)
// ---------------------------------------------------------------------------

export interface AlmacenDelReporteGeneral {
  nombre: string
  codigo: string
  renglones: RenglonDeReporte[]
}

/** `descargarReporteAlmacenesPdf` de MGG, sin sedes ni subalmacenes. */
export async function armarReporteGeneral(d: {
  almacenes: AlmacenDelReporteGeneral[]
  empresa: EmpresaDelReporte
  emitidoPor: string
  momento: Date
}): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [['Generado', fechaLarga(d.momento)]],
  })
  y = tituloDocumento(doc, y, 'Inventario · Reporte por almacenes')
  y = lineaEmpresa(doc, y, `${d.empresa.razonSocial} · RIF ${d.empresa.rif} · Sistema administrativo`)

  const todos = d.almacenes.flatMap((a) => a.renglones)
  const precio = conPrecio(todos)
  y = seccion(doc, y, 'Resumen')
  y = etiquetaValor(doc, y, [
    ['Almacenes', String(d.almacenes.length)],
    ['Valor total', precio ? dinero(totalDe(todos)) : 'No se muestra: quien emite no ve precios'],
    ['Emitido por', d.emitidoPor],
  ])

  for (const a of d.almacenes) {
    // El rótulo del almacén no se queda solo al pie de una hoja.
    if (y > ABAJO - 40) {
      doc.addPage()
      y = ARRIBA
    }
    y = seccion(doc, y, `${a.codigo} · ${a.nombre}`)
    if (a.renglones.length === 0) {
      y = etiquetaValor(doc, y, [['Existencias', 'Sin existencias.']])
      continue
    }
    y = tablaDeProductos(doc, y, a.renglones, `Subtotal   ${dinero(totalDe(a.renglones))}`)
  }

  if (precio) {
    if (y > ABAJO - 20) {
      doc.addPage()
      y = ARRIBA
    }
    etiquetaValor(doc, y, [['VALOR TOTAL DEL INVENTARIO', dinero(totalDe(todos))]])
  }

  pieDePagina(doc, `Documento generado por el sistema · Reporte por almacenes · ${fechaLarga(d.momento)}`)
  doc.setProperties({ title: 'Inventario · Reporte por almacenes' })
  return { blob: doc.output('blob'), nombre: `inventario-por-almacenes-${d.momento.toISOString().slice(0, 10)}.pdf` }
}

// ---------------------------------------------------------------------------
// 📊 Consumo · {almacén}
// ---------------------------------------------------------------------------

export interface RenglonDeConsumo {
  producto: string
  codigo: string
  unidad: string
  cantidad: number
  valor: number
}

export interface DatosConsumoAlmacen {
  almacen: string
  /** «15 días», «2026-11-01 → 2026-11-08». */
  periodo: string
  renglones: RenglonDeConsumo[]
  /** Falso si quien emite no ve precios: la columna de valor no sale. */
  conValor: boolean
  empresa: EmpresaDelReporte
  emitidoPor: string
  momento: Date
}

const COLUMNAS_CONSUMO: Columna[] = [
  { titulo: '#', ancho: 10 },
  { titulo: 'Producto', ancho: 74 },
  { titulo: 'Cantidad', ancho: 34, alDerecha: true },
  { titulo: 'Valor ($)', ancho: 32, alDerecha: true },
]

const COLUMNAS_CONSUMO_SIN_VALOR: Columna[] = [
  { titulo: '#', ancho: 10 },
  { titulo: 'Producto', ancho: 100 },
  { titulo: 'Cantidad', ancho: 40, alDerecha: true },
]

/** El PDF del modal de consumo de MGG (`construirPdf`). */
export async function armarConsumoAlmacen(d: DatosConsumoAlmacen): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['Almacén', d.almacen],
      ['Período', d.periodo],
    ],
  })
  y = tituloDocumento(doc, y, `Consumo · ${d.almacen}`)
  y = lineaEmpresa(doc, y, `${d.empresa.razonSocial} · RIF ${d.empresa.rif} · Sistema administrativo`)

  const total = d.renglones.reduce((s, r) => s + r.valor, 0)
  y = seccion(doc, y, 'Resumen')
  y = etiquetaValor(doc, y, [
    ['Período', d.periodo],
    ['Productos consumidos', String(d.renglones.length)],
    ...(d.conValor ? ([['Valor total', dinero(total)]] as [string, string][]) : []),
    ['Emitido por', d.emitidoPor],
  ])

  y = seccion(doc, y, 'Consumo por producto')
  tabla(
    doc,
    y,
    d.conValor ? COLUMNAS_CONSUMO : COLUMNAS_CONSUMO_SIN_VALOR,
    d.renglones.map((r, i) => [
      String(i + 1),
      `${r.producto} · ${r.codigo}`,
      `${cantidad(r.cantidad)} ${r.unidad}`.trim(),
      ...(d.conValor ? [dinero(r.valor)] : []),
    ]),
    d.conValor ? `TOTAL   ${dinero(total)}` : '',
  )

  pieDePagina(doc, `Documento generado por el sistema · Consumo · ${d.almacen} · ${fechaLarga(d.momento)}`)
  doc.setProperties({ title: `Consumo · ${d.almacen}` })
  return {
    blob: doc.output('blob'),
    nombre: `consumo-${sufijo(d.almacen)}-${d.momento.toISOString().slice(0, 10)}.pdf`,
  }
}

/** El mismo consumo en Excel. */
export function hojaConsumoAlmacen(d: Pick<DatosConsumoAlmacen, 'almacen' | 'renglones' | 'conValor'>): HojaXlsx {
  const total = d.renglones.reduce((s, r) => s + r.valor, 0)
  const cant = d.renglones.reduce((s, r) => s + r.cantidad, 0)
  return {
    nombre: `Consumo ${d.almacen}`,
    columnas: [
      { titulo: 'SKU', ancho: 16 },
      { titulo: 'Producto', ancho: 40 },
      { titulo: 'Unidad', ancho: 10 },
      { titulo: 'Cantidad', ancho: 14 },
      ...(d.conValor ? [{ titulo: 'Valor ($)', ancho: 14 }] : []),
    ],
    filas: [
      ...d.renglones.map((r) => [r.codigo, r.producto, r.unidad, r.cantidad, ...(d.conValor ? [r.valor] : [])]),
      [],
      ['', 'TOTAL', '', cant, ...(d.conValor ? [total] : [])],
    ],
  }
}
