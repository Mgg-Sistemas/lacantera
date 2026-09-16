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
} from '@/lib/ficha/papel'
import { conversionEnCelda, hayConversion, notaDeConversion } from '@/lib/medidas'

/*
  EL LIBRO DE MOVIMIENTOS, EN PAPEL

  Lo pidió Christopher: «un pdf para enterar los movimientos de todo el
  inventario o de algún almacén en específico».

  Es el papel que se lleva a una revisión: qué entró, qué salió y qué se
  trasladó, en orden, con quién lo registró y con qué documento. La pantalla ya
  lo enseña; el papel existe porque quien revisa no siempre está delante de una
  pantalla, y porque un archivo firmado es lo que queda cuando alguien pregunta
  seis meses después.

  No lleva firmas. Un libro no se firma: se consulta. Lo que se firma es el
  conteo —eso es el acta de existencias— y esto es otra cosa.
*/

export interface RenglonDelLibro {
  numero: string
  fecha: string
  tipo: string
  articulo: string
  /** La densidad del catálogo, para la columna «Conversión». Ver `lib/medidas.ts`. */
  densidad?: string | number | null
  almacen: string
  cantidad: string
  unidad: string
  signo: number
  valorUsd: string | number
  quien: string
}

export interface DatosLibro {
  /** El sitio, o null cuando es el libro entero. */
  almacen: string | null
  /** Lo que el filtro de la pantalla dejó fuera, dicho en palabras. */
  filtro?: string | null
  renglones: RenglonDelLibro[]
  empresa: { razonSocial: string; rif: string }
  emitidoPor: string
  momento: Date
}

const decimal2 = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const numero = (v: string | number): string => decimal2.format(Number(v ?? 0))

const cantidad = (v: string | number): string => {
  const n = Number(v ?? 0)
  return Number.isInteger(n) ? n.toLocaleString('es-VE') : decimal2.format(n)
}

/*
  Los anchos suman los 150 mm útiles.

  La descripción del artículo se lleva la parte grande porque es lo único que
  no se puede abreviar sin dejar de reconocerlo; el número de movimiento cabe
  en trece caracteres siempre, y la fecha en diez.
*/
const COLUMNAS: Columna[] = [
  { titulo: 'Movimiento', ancho: 24 },
  { titulo: 'Fecha', ancho: 18 },
  { titulo: 'Concepto', ancho: 30 },
  { titulo: 'Artículo', ancho: 34 },
  { titulo: 'Cantidad', ancho: 22, alDerecha: true },
  { titulo: 'Valor', ancho: 22, alDerecha: true },
]

/* Con la columna de la conversión, sigue sumando 150: la pagan un poco todas. */
const COLUMNAS_CON_CONVERSION: Columna[] = [
  { titulo: 'Movimiento', ancho: 22 },
  { titulo: 'Fecha', ancho: 16 },
  { titulo: 'Concepto', ancho: 26 },
  { titulo: 'Artículo', ancho: 30 },
  { titulo: 'Cantidad', ancho: 20, alDerecha: true },
  { titulo: 'Conversión', ancho: 20, alDerecha: true },
  { titulo: 'Valor', ancho: 16, alDerecha: true },
]

export async function armarLibroDeMovimientos(d: DatosLibro): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  const donde = d.almacen ?? 'Todos los almacenes'

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['Alcance', donde],
      ['Emitido', fechaLarga(d.momento)],
    ],
  })

  y = tituloDocumento(doc, y, 'Libro de movimientos')

  y = lineaEmpresa(
    doc,
    y,
    `${d.empresa.razonSocial} · RIF ${d.empresa.rif} · Sistema administrativo`,
  )

  const entradas = d.renglones.filter((r) => r.signo > 0).length
  const salidas = d.renglones.filter((r) => r.signo < 0).length

  y = seccion(doc, y, 'Alcance')
  y = etiquetaValor(doc, y, [
    ['Sitio', donde],
    ['Movimientos listados', String(d.renglones.length)],
    ['Entradas / salidas', `${entradas} entraron · ${salidas} salieron`],
    ['Filtro aplicado', d.filtro || 'Ninguno: se lista todo el libro'],
    ['Emitido por', d.emitidoPor],
  ])

  y = seccion(doc, y, 'Movimientos')
  const conConversion = hayConversion(d.renglones)
  const signoDe = (r: RenglonDelLibro) => (r.signo > 0 ? '+' : r.signo < 0 ? '−' : '')
  y = tabla(
    doc,
    y,
    conConversion ? COLUMNAS_CON_CONVERSION : COLUMNAS,
    d.renglones.map((r) => {
      const convertida = conversionEnCelda(r.cantidad, r.unidad, r.densidad)
      return [
        r.numero,
        r.fecha,
        r.tipo,
        r.articulo,
        // El signo delante y no una columna aparte: en una lista de cien
        // renglones, el ojo busca el signo pegado a la cifra.
        `${signoDe(r)}${cantidad(r.cantidad)} ${r.unidad}`,
        ...(conConversion ? [convertida === '—' ? convertida : `${signoDe(r)}${convertida}`] : []),
        numero(r.valorUsd),
      ]
    }),
  )
  notaBajoLaTabla(doc, y, notaDeConversion(d.renglones))

  pieDePagina(
    doc,
    `Documento generado por el sistema · ${donde} · ${fechaLarga(d.momento)}`,
  )
  doc.setProperties({ title: `Libro de movimientos — ${donde}` })

  const sufijo = (d.almacen ?? 'todos').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return { blob: doc.output('blob'), nombre: `libro-movimientos-${sufijo}.pdf` }
}
