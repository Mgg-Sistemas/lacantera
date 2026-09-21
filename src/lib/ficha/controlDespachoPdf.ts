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
import { ROTULO_DEL_DOCUMENTO, type FilaDeControl } from '@/lib/api/controlDespacho'

/*
  EL PAPEL DEL CONTROL DE DESPACHO

  La planilla tal como se está viendo —o las filas que se marcaron—, con el
  membrete y los colores de todos los papeles del sistema.

  La hoja mide 150 mm de ancho útil y la planilla tiene once columnas, así que
  tres se juntan: el RIF va bajo el cliente, y las observaciones y la columna
  libre bajo el status. Nada se recorta: la celda crece hacia abajo.

  Solo suma lo VIGENTE, igual que la pantalla. Lo demás —anulada, interna, sin
  documento— sale en su renglón diciendo qué le pasó, porque el papel también
  tiene que enseñar que a la serie no le falta ningún número.
*/

const decimal2 = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const n = (v: string | number | null | undefined): string =>
  v === null || v === undefined || v === '' ? '' : decimal2.format(Number(v))

const COLUMNAS: Columna[] = [
  { titulo: '# Nota', ancho: 20 },
  { titulo: 'Fecha', ancho: 14 },
  { titulo: 'Cliente y RIF', ancho: 32 },
  { titulo: 'Material', ancho: 20 },
  { titulo: 'Cantidad', ancho: 16, alDerecha: true },
  { titulo: 'Precio', ancho: 13, alDerecha: true },
  { titulo: 'Monto US$', ancho: 15, alDerecha: true },
  { titulo: 'Status y notas', ancho: 20 },
]

const periodo = (desde: string | null, hasta: string | null): string =>
  desde && hasta
    ? `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`
    : desde
      ? `Desde el ${fechaCorta(desde)}`
      : hasta
        ? `Hasta el ${fechaCorta(hasta)}`
        : 'Todas las fechas'

export async function armarControlDeDespacho(d: {
  empresa: { razonSocial: string; rif: string }
  emitidoPor: string
  momento: Date
  desde: string | null
  hasta: string | null
  /** «Las 12 filas marcadas», «Solo lo despachado · status CONTADO»… */
  alcance: string
  columnaLibre: string
  filas: FilaDeControl[]
}): Promise<ArchivoArmado> {
  const titulo = 'Control de despacho'
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['Período', periodo(d.desde, d.hasta)],
      ['Emitido', fechaLarga(d.momento)],
    ],
  })
  y = tituloDocumento(doc, y, titulo)
  y = lineaEmpresa(doc, y, `${d.empresa.razonSocial} · RIF ${d.empresa.rif} · Control de despacho`)

  const vigentes = d.filas.filter((f) => f.estado_doc === 'VIGENTE')
  const monto = vigentes.reduce((s, f) => s + Number(f.monto ?? 0), 0)
  // Por unidad: si un día se despacha en toneladas, no se mezclan con los m³.
  const porUnidad = vigentes.reduce<Record<string, number>>((s, f) => {
    if (f.unidad) s[f.unidad] = (s[f.unidad] ?? 0) + Number(f.cantidad ?? 0)
    return s
  }, {})
  const sinPrecio = vigentes.filter((f) => f.precio === null).length
  const sinRif = vigentes.filter((f) => f.falta_rif).length

  y = seccion(doc, y, 'Alcance')
  y = etiquetaValor(doc, y, [
    ['Período', periodo(d.desde, d.hasta)],
    ['Filas', d.alcance],
    ['Despachos', String(vigentes.length)],
    ['Cantidad', Object.entries(porUnidad).map(([u, c]) => `${n(c)} ${u}`).join(' · ') || '—'],
    ['Monto', `$ ${n(monto)}`],
    ...(sinPrecio > 0 || sinRif > 0
      ? ([['Por completar', [sinPrecio > 0 ? `${sinPrecio} sin precio` : '', sinRif > 0 ? `${sinRif} sin RIF` : ''].filter(Boolean).join(' · ')]] as [string, string][])
      : []),
    ['Emitido por', d.emitidoPor],
  ])

  y = seccion(doc, y, 'Planilla')
  y = tabla(
    doc,
    y,
    COLUMNAS,
    d.filas.length === 0
      ? [['', '', 'Sin filas en el período', '', '', '', '', '']]
      : d.filas.map((f) => {
          if (f.estado_doc !== 'VIGENTE') {
            return [
              f.documento,
              f.fecha ? fechaCorta(f.fecha) : '',
              [ROTULO_DEL_DOCUMENTO[f.estado_doc].toUpperCase(), f.cliente].filter(Boolean).join(' · '),
              f.material ?? '',
              f.cantidad === null ? '' : `${n(f.cantidad)} ${f.unidad ?? ''}`,
              '',
              '',
              'NO SUMA',
            ]
          }
          const notas = [f.observacion, f.extra ? `${d.columnaLibre}: ${f.extra}` : null].filter(Boolean).join(' · ')
          return [
            f.documento,
            f.fecha ? fechaCorta(f.fecha) : '',
            `${f.cliente ?? ''}\n${f.rif ?? 'SIN RIF'}`,
            f.material ?? '',
            `${n(f.cantidad)} ${f.unidad ?? ''}`,
            n(f.precio),
            n(f.monto),
            [f.estado_control_nombre, notas].filter(Boolean).join('\n'),
          ]
        }),
    `Monto de lo despachado: $ ${n(monto)}`,
  )
  notaBajoLaTabla(
    doc,
    y,
    'Solo suma lo despachado. Los renglones que dicen NO SUMA enseñan que el número existe y qué le pasó: anulado, salida interna, respaldo de una salida o sin documento. El número, la fecha, el cliente, el material y la cantidad vienen de las notas; el RIF, el precio, el status y las notas se llevan en esta planilla.',
  )

  pieDePagina(doc, `Documento generado por el sistema · ${titulo} · ${fechaLarga(d.momento)}`)
  doc.setProperties({ title: titulo })
  return { blob: doc.output('blob'), nombre: `control-de-despacho-${d.desde ?? 'inicio'}-a-${d.hasta ?? 'hoy'}.pdf` }
}
