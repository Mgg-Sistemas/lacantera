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
  notaBajoLaTabla,
  type Columna,
  type EmpresaPapel,
} from '@/lib/ficha/papel'

/*
  LOS PAPELES DE LA PANTALLA PRINCIPAL DE INVENTARIO (fases 3 y 4 de
  «Almacén e Inventario como MGG», 08/11/2026).

  Tres documentos de MGG con el membrete de La Cantera:
  - «Trazabilidad de producto» (`productoPdf.ts` de MGG): stock por almacén y
    los movimientos con su saldo.
  - «Resumen de inventario» (`inventarioResumenPdf.ts`): el valor por almacén
    y las salidas, traslados y productos nuevos de un período.
  - «Inventario» (`almacenExport.ts`, el general): agrupado por almacén con su
    subtotal y el «VALOR TOTAL».

  Los anchos de cada tabla suman los 150 mm útiles. Sin permiso para ver el
  valor (los montos llegan nulos de la base), las columnas de dinero no se
  dibujan: un papel firmado diciendo que todo vale 0,00 afirma algo falso.
*/

const decimal2 = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dinero = (v: number | null | undefined) => (v == null ? '—' : `$ ${decimal2.format(v)}`)
const cantidad = (v: number) =>
  Number.isInteger(v) ? v.toLocaleString('es-VE') : v.toLocaleString('es-VE', { maximumFractionDigits: 2 })
const sufijo = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/* ──────────────────────────────────────── trazabilidad */

export interface StockDeTrazabilidad {
  almacen: string
  dueno: string | null
  stock: number
  costo: number | null
  valor: number | null
}

export interface MovimientoDeTrazabilidad {
  fecha: string
  tipo: string
  almacen: string
  delta: number
  saldo: number
  costo: number | null
  pmp: number | null
  referencia: string
  detalle: string
}

export async function armarTrazabilidadPdf(d: {
  empresa: EmpresaPapel
  sku: string
  nombre: string
  categoria: string
  unidad: string
  minimo: number
  stock: StockDeTrazabilidad[]
  movimientos: MovimientoDeTrazabilidad[]
  /** Cuando el kardex vino recortado o filtrado, lo que no está. */
  nota?: string | null
  emitidoPor: string
  momento: Date
}): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const conValor = d.stock.some((s) => s.valor !== null) || d.movimientos.some((m) => m.costo !== null)

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['Producto', d.sku],
      ['Generado', fechaLarga(d.momento)],
    ],
  })
  y = tituloDocumento(doc, y, 'Trazabilidad de producto')
  y = lineaEmpresa(doc, y, `${d.empresa.razonSocial} · Generado ${fechaLarga(d.momento)} por ${d.emitidoPor}`)

  const total = d.stock.reduce((s, r) => s + r.stock, 0)
  const valor = d.stock.reduce((s, r) => s + (r.valor ?? 0), 0)
  y = seccion(doc, y, 'Producto')
  y = etiquetaValor(doc, y, [
    ['Código', d.sku],
    ['Nombre', d.nombre],
    ['Categoría', d.categoria],
    ['Unidad', d.unidad],
    ['Stock total', `${cantidad(total)} ${d.unidad}`],
    ['Mínimo', d.minimo > 0 ? `${cantidad(d.minimo)} ${d.unidad}` : 'Sin mínimo'],
    ...(conValor ? ([['Valor', dinero(valor)]] as [string, string][]) : []),
  ])

  y = seccion(doc, y, 'Stock por almacén')
  const colStock: Columna[] = conValor
    ? [
        { titulo: 'Almacén', ancho: 46 },
        { titulo: 'Dueño', ancho: 30 },
        { titulo: 'Stock', ancho: 26, alDerecha: true },
        { titulo: 'Costo prom.', ancho: 22, alDerecha: true },
        { titulo: 'Valor', ancho: 26, alDerecha: true },
      ]
    : [
        { titulo: 'Almacén', ancho: 70 },
        { titulo: 'Dueño', ancho: 44 },
        { titulo: 'Stock', ancho: 36, alDerecha: true },
      ]
  y = tabla(
    doc,
    y,
    colStock,
    d.stock.map((s) => [
      s.almacen,
      s.dueno ?? '—',
      `${cantidad(s.stock)} ${d.unidad}`,
      ...(conValor ? [dinero(s.costo), dinero(s.valor)] : []),
    ]),
    conValor ? `VALOR TOTAL   ${dinero(valor)}` : undefined,
  )

  y = seccion(doc, y, `Movimientos (${d.movimientos.length})`)
  const colMov: Columna[] = conValor
    ? [
        { titulo: 'Fecha', ancho: 15 },
        { titulo: 'Tipo', ancho: 22 },
        { titulo: 'Almacén', ancho: 20 },
        { titulo: 'Δ', ancho: 12, alDerecha: true },
        { titulo: 'Saldo', ancho: 13, alDerecha: true },
        { titulo: 'Costo unit.', ancho: 13, alDerecha: true },
        { titulo: 'PMP', ancho: 13, alDerecha: true },
        { titulo: 'Ref.', ancho: 17 },
        { titulo: 'Detalle', ancho: 25 },
      ]
    : [
        { titulo: 'Fecha', ancho: 16 },
        { titulo: 'Tipo', ancho: 26 },
        { titulo: 'Almacén', ancho: 24 },
        { titulo: 'Δ', ancho: 14, alDerecha: true },
        { titulo: 'Saldo', ancho: 15, alDerecha: true },
        { titulo: 'Ref.', ancho: 20 },
        { titulo: 'Detalle', ancho: 35 },
      ]
  y = tabla(
    doc,
    y,
    colMov,
    d.movimientos.map((m) => [
      m.fecha,
      m.tipo,
      m.almacen,
      `${m.delta > 0 ? '+' : m.delta < 0 ? '−' : ''}${cantidad(Math.abs(m.delta))}`,
      cantidad(m.saldo),
      ...(conValor ? [dinero(m.costo), dinero(m.pmp)] : []),
      m.referencia,
      m.detalle,
    ]),
  )
  notaBajoLaTabla(
    doc,
    y,
    d.nota ??
      'El saldo es lo que quedó en ese almacén después de cada movimiento. Las correcciones de costo salen y vuelven a entrar la misma cantidad: no cambian el stock.',
  )

  pieDePagina(doc, `Trazabilidad · ${d.sku} · ${fechaLarga(d.momento)}`)
  doc.setProperties({ title: `Trazabilidad — ${d.sku} ${d.nombre}` })
  return { blob: doc.output('blob'), nombre: `trazabilidad-${sufijo(d.sku)}.pdf` }
}

/* ──────────────────────────────────────── resumen */

export interface GrupoDelResumen {
  titulo: string
  filas: { fecha: string; sku: string; producto: string; cantidad: string; almacen: string; destino: string; valor: number | null }[]
  valor: number | null
}

export async function armarResumenInventarioPdf(d: {
  empresa: EmpresaPapel
  desde: string
  hasta: string
  valorTotal: number | null
  almacenes: { nombre: string; productos: number; unidades: number; valor: number | null }[]
  grupos: GrupoDelResumen[]
  emitidoPor: string
  momento: Date
}): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const conValor = d.valorTotal !== null

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['Período', `${d.desde} → ${d.hasta}`],
      ['Generado', fechaLarga(d.momento)],
    ],
  })
  y = tituloDocumento(doc, y, 'Resumen de inventario')
  y = lineaEmpresa(doc, y, `${d.empresa.razonSocial} · Generado ${fechaLarga(d.momento)} por ${d.emitidoPor}`)

  y = seccion(doc, y, 'Resumen')
  y = etiquetaValor(doc, y, [
    ['Valor total', conValor ? dinero(d.valorTotal) : 'No se muestra: quien emite no ve precios'],
    ['Almacenes', String(d.almacenes.length)],
    ...d.grupos.map(
      (g) =>
        [g.titulo, `${g.filas.length}${conValor && g.valor !== null ? ` · ${dinero(g.valor)}` : ''}`] as [string, string],
    ),
  ])

  y = seccion(doc, y, 'Total por almacén')
  y = tabla(
    doc,
    y,
    conValor
      ? [
          { titulo: 'Almacén', ancho: 66 },
          { titulo: 'Productos', ancho: 24, alDerecha: true },
          { titulo: 'Unidades', ancho: 28, alDerecha: true },
          { titulo: 'Valor', ancho: 32, alDerecha: true },
        ]
      : [
          { titulo: 'Almacén', ancho: 90 },
          { titulo: 'Productos', ancho: 28, alDerecha: true },
          { titulo: 'Unidades', ancho: 32, alDerecha: true },
        ],
    d.almacenes.map((a) => [
      a.nombre,
      String(a.productos),
      cantidad(a.unidades),
      ...(conValor ? [dinero(a.valor)] : []),
    ]),
    conValor ? `VALOR TOTAL   ${dinero(d.valorTotal)}` : undefined,
  )

  for (const g of d.grupos) {
    y = seccion(doc, y, `${g.titulo} (${g.filas.length})`)
    if (g.filas.length === 0) {
      doc.setFont('helvetica', 'normal').setFontSize(9)
      doc.text('Sin movimientos en el período.', 30, y)
      y += 10
      continue
    }
    y = tabla(
      doc,
      y,
      conValor
        ? [
            { titulo: 'Fecha', ancho: 17 },
            { titulo: 'SKU', ancho: 18 },
            { titulo: 'Producto', ancho: 37 },
            { titulo: 'Cant.', ancho: 18, alDerecha: true },
            { titulo: 'Almacén', ancho: 20 },
            { titulo: 'Destino', ancho: 20 },
            { titulo: 'Valor', ancho: 20, alDerecha: true },
          ]
        : [
            { titulo: 'Fecha', ancho: 18 },
            { titulo: 'SKU', ancho: 20 },
            { titulo: 'Producto', ancho: 46 },
            { titulo: 'Cant.', ancho: 20, alDerecha: true },
            { titulo: 'Almacén', ancho: 23 },
            { titulo: 'Destino', ancho: 23 },
          ],
      g.filas.map((f) => [
        f.fecha,
        f.sku,
        f.producto,
        f.cantidad,
        f.almacen,
        f.destino || '—',
        ...(conValor ? [dinero(f.valor)] : []),
      ]),
    )
  }

  pieDePagina(doc, `Resumen de inventario · ${d.desde} → ${d.hasta}`)
  doc.setProperties({ title: `Resumen de inventario ${d.desde} a ${d.hasta}` })
  return { blob: doc.output('blob'), nombre: `resumen-inventario-${d.desde}-${d.hasta}.pdf` }
}

/* ──────────────────────────────────────── exportar */

export interface RenglonExportado {
  almacen: string
  sku: string
  producto: string
  categoria: string
  unidad: string
  stock: number
  costo: number | null
  valor: number | null
}

export async function armarInventarioExportadoPdf(d: {
  empresa: EmpresaPapel
  filtro: string | null
  renglones: RenglonExportado[]
  emitidoPor: string
  momento: Date
}): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const conValor = d.renglones.some((r) => r.valor !== null)
  const total = d.renglones.reduce((s, r) => s + (r.valor ?? 0), 0)

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['Productos', String(new Set(d.renglones.map((r) => r.sku)).size)],
      ['Generado', fechaLarga(d.momento)],
    ],
  })
  y = tituloDocumento(doc, y, 'Inventario')
  y = lineaEmpresa(doc, y, `${d.empresa.razonSocial} · Generado ${fechaLarga(d.momento)} por ${d.emitidoPor}`)
  y = seccion(doc, y, 'Alcance')
  y = etiquetaValor(doc, y, [
    ['Filtro aplicado', d.filtro || 'Ninguno: se lista todo'],
    ['Valor total', conValor ? dinero(total) : 'No se muestra: quien emite no ve precios'],
  ])

  const columnas: Columna[] = conValor
    ? [
        { titulo: 'SKU', ancho: 20 },
        { titulo: 'Producto', ancho: 42 },
        { titulo: 'Categoría', ancho: 20 },
        { titulo: 'Unidad', ancho: 14 },
        { titulo: 'Stock', ancho: 16, alDerecha: true },
        { titulo: 'Costo unit.', ancho: 18, alDerecha: true },
        { titulo: 'Valor', ancho: 20, alDerecha: true },
      ]
    : [
        { titulo: 'SKU', ancho: 24 },
        { titulo: 'Producto', ancho: 62 },
        { titulo: 'Categoría', ancho: 26 },
        { titulo: 'Unidad', ancho: 18 },
        { titulo: 'Stock', ancho: 20, alDerecha: true },
      ]

  // Agrupado por almacén, con su subtotal: el reporte general de MGG.
  const almacenes = [...new Set(d.renglones.map((r) => r.almacen))]
  for (const alm of almacenes) {
    const filas = d.renglones.filter((r) => r.almacen === alm)
    const sub = filas.reduce((s, r) => s + (r.valor ?? 0), 0)
    y = seccion(doc, y, alm)
    y = tabla(
      doc,
      y,
      columnas,
      filas.map((r) => [
        r.sku,
        r.producto,
        r.categoria,
        r.unidad,
        cantidad(r.stock),
        ...(conValor ? [dinero(r.costo), dinero(r.valor)] : []),
      ]),
      conValor ? `Subtotal   ${dinero(sub)}` : undefined,
    )
  }
  if (conValor && almacenes.length > 1) {
    seccion(doc, y, `VALOR TOTAL   ${dinero(total)}`)
  }

  pieDePagina(doc, `Inventario · ${fechaLarga(d.momento)}`)
  doc.setProperties({ title: 'Inventario' })
  return { blob: doc.output('blob'), nombre: `inventario-${d.momento.toISOString().slice(0, 10)}.pdf` }
}
