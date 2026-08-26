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
  firmas,
  pieDePagina,
  fechaLarga,
  type Columna,
} from '@/lib/ficha/papel'

/*
  EL ACTA DE EXISTENCIAS

  Es el papel que se imprime para contar: se lleva al almacén, se recorre
  estante por estante, y se firma. Por eso lleva una columna vacía —«Contado»—
  que el sistema no rellena: si la imprimiera con la cifra que él mismo cree,
  el conteo dejaría de ser un conteo y pasaría a ser una confirmación, que es
  como se cuadran los almacenes que nunca cuadran.

  Es también el primer documento que sale de Inventario. Hasta hoy el módulo no
  emitía ninguno.
*/

export interface RenglonDeActa {
  codigo: string
  articulo: string
  unidad: string
  existencia: string | number
  costoUsd: string | number
  valorUsd: string | number
}

export interface DatosActa {
  /** El sitio, o null cuando el acta es del total de la empresa. */
  almacen: string | null
  /** Lo que el filtro de la pantalla dejó fuera, dicho en palabras. */
  filtro?: string | null
  renglones: RenglonDeActa[]
  empresa: { razonSocial: string; rif: string }
  emitidoPor: string
  /** Cuándo se generó. Se pasa desde fuera para no depender del reloj aquí. */
  momento: Date
}

const decimal2 = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const numero = (v: string | number): string => decimal2.format(Number(v ?? 0))

/** Entera si es entera. Ocho mil novecientos litros no se leen «8.900,00». */
const cantidad = (v: string | number): string => {
  const n = Number(v ?? 0)
  return Number.isInteger(n) ? n.toLocaleString('es-VE') : decimal2.format(n)
}

/* Los anchos suman los 150 mm útiles. El artículo se lleva la tercera parte
   porque es lo único que no se puede abreviar sin dejar de reconocerlo. */
const COLUMNAS: Columna[] = [
  { titulo: 'Código', ancho: 22 },
  { titulo: 'Artículo', ancho: 44 },
  { titulo: 'Unidad', ancho: 15 },
  { titulo: 'Existencia', ancho: 20, alDerecha: true },
  { titulo: 'Costo unit.', ancho: 16, alDerecha: true },
  { titulo: 'Valor', ancho: 16, alDerecha: true },
  // Se imprime vacía a propósito: es donde se escribe a mano lo que se contó.
  { titulo: 'Contado', ancho: 17, alDerecha: true },
]

export async function armarActaExistencias(d: DatosActa): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  const donde = d.almacen ?? 'Todos los almacenes'

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['Almacén', donde],
      ['Generada', fechaLarga(d.momento)],
    ],
  })

  y = tituloDocumento(doc, y, 'Acta de existencias')

  y = lineaEmpresa(
    doc,
    y,
    `${d.empresa.razonSocial} · RIF ${d.empresa.rif} · Sistema administrativo`,
  )

  const total = d.renglones.reduce((s, r) => s + Number(r.valorUsd ?? 0), 0)

  y = seccion(doc, y, 'Alcance')
  y = etiquetaValor(doc, y, [
    ['Sitio', donde],
    ['Artículos listados', String(d.renglones.length)],
    ['Valor en libros', `$ ${numero(total)}`],
    ['Filtro aplicado', d.filtro || 'Ninguno: se lista todo lo que hay'],
    ['Emitida por', d.emitidoPor],
  ])

  y = seccion(doc, y, 'Existencias')
  y = tabla(
    doc,
    y,
    COLUMNAS,
    d.renglones.map((r) => [
      r.codigo,
      r.articulo,
      r.unidad,
      cantidad(r.existencia),
      numero(r.costoUsd),
      numero(r.valorUsd),
      '',
    ]),
    `TOTAL EN LIBROS   $ ${numero(total)}`,
  )

  // Si las firmas no caben, se van a su propia hoja enteras. Una raya de firma
  // partida entre dos páginas no la firma nadie.
  if (y > ABAJO - 24) {
    doc.addPage()
    y = ARRIBA
  }
  firmas(doc, y + 12, 'Contó y verificó', 'Conforme · jefatura de almacén')

  pieDePagina(
    doc,
    `Documento generado por el sistema · ${donde} · ${fechaLarga(d.momento)}`,
  )

  doc.setProperties({ title: `Acta de existencias — ${donde}` })

  const sufijo = (d.almacen ?? 'todos').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return { blob: doc.output('blob'), nombre: `acta-existencias-${sufijo}.pdf` }
}
