import { logoComoImagen } from '@/lib/ficha/logo'
import {
  GRIS,
  TINTA,
  bloqueEtiquetado,
  fechaLarga,
  firmas,
  lineaEmpresa,
  membrete,
  pieDePagina,
  seccion,
  tabla,
  tituloDocumento,
} from '@/lib/ficha/papel'
import { ABAJO, ANCHO_UTIL, IZQ } from '@/lib/ficha/hoja'
import {
  COLUMNAS,
  COLUMNAS_SIN_DINERO,
  celdas,
  numero,
  type NotaArmada,
  type RenglonDeSalida,
} from '@/lib/ficha/notaDeSalidaPdf'

/*
  LA NOTA DE TRASLADO

  Christopher: los traslados «llevan su nota de traslado, con o sin precio
  (igual que nota de salida con su check)». Hasta hoy un traslado no dejaba
  papel. Lo más parecido era la nota de salida que sacaba la pata de salida
  desde Movimientos, que no decía a dónde iba el material ni tenía dónde firmar
  quien lo recibe.

  ES LA NOTA DE SALIDA CON OTRO RECORRIDO

  Mismas columnas, mismos dos decimales y la misma casilla de costos, porque un
  papel de almacén se lee igual venga de donde venga. Lo que cambia es lo que el
  traslado tiene y la salida no: un sitio de donde sale, otro donde entra, y una
  firma en cada punta.

  EL NÚMERO ES EL DEL MOVIMIENTO

  El traslado todavía no tiene numeración propia: nace y termina en el mismo
  instante, como dos movimientos hermanos. Se usa el de la salida, que es la
  cabeza de la pareja y la que se deshace. La numeración propia llegará con la
  solicitud de traslado, cuando un traslado pueda tardar en llegar.
*/

export interface DatosNotaDeTraslado {
  /** Si el papel lleva las cifras de dinero. Por defecto, sin ellas. */
  conCostos?: boolean
  numero: string
  fecha: string
  origen: string
  destino: string
  motivo?: string | null
  renglones: RenglonDeSalida[]
  empresa: { razonSocial: string; rif: string }
  momento: Date
}

export async function armarNotaDeTraslado(d: DatosNotaDeTraslado): Promise<NotaArmada> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['N° traslado', d.numero],
      ['Fecha', d.fecha],
      ['Generado', fechaLarga(d.momento)],
    ],
  })

  y = tituloDocumento(doc, y, 'Nota de traslado')
  y = lineaEmpresa(doc, y, `${d.empresa.razonSocial} · RIF ${d.empresa.rif}`)

  y = bloqueEtiquetado(doc, y, 'El traslado', [
    ['Sale de', d.origen],
    ['Entra en', d.destino],
    ['Fecha', d.fecha],
  ])

  // El motivo antes de la tabla, como en la nota de salida: explica todos los
  // renglones, y leerlo después de la lista obliga a volver a subir.
  if (d.motivo) {
    y = seccion(doc, y, 'Por qué se mueve')
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(TINTA)
    const lineas = doc.splitTextToSize(d.motivo, ANCHO_UTIL) as string[]
    doc.text(lineas, IZQ, y, { lineHeightFactor: 1.45 })
    y += lineas.length * 4.6 + 6
  }

  const conCostos = d.conCostos === true
  const total = d.renglones.reduce((s, r) => s + Number(r.valorUsd ?? 0), 0)
  y = tabla(
    doc,
    y,
    conCostos ? COLUMNAS : COLUMNAS_SIN_DINERO,
    d.renglones.map((r) => celdas(r, conCostos)),
    conCostos && total > 0 ? `TOTAL   $ ${numero(total)}` : undefined,
  )

  /*
    Las firmas van abajo del todo y a altura fija, con la misma cuenta que la
    nota de salida: se mide cuánto ocupa el aviso y de ahí hacia arriba es donde
    puede acabar la tabla. Si no cabe, pasan a una hoja de continuación.
  */
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
  const aviso = doc.splitTextToSize(
    'Al firmar, quien recibe en el destino declara que llegó el material relacionado arriba en las cantidades indicadas. Un traslado cambia el material de sitio y no de valor, y queda registrado en el libro de movimientos.',
    ANCHO_UTIL,
  ) as string[]

  const LINEA_DE_FIRMAS = ABAJO - 24
  const ARRANQUE_DEL_AVISO = LINEA_DE_FIRMAS - 4 - aviso.length * 3.8

  if (y > ARRANQUE_DEL_AVISO) {
    doc.addPage()
    y = membrete(doc, logo, {
      empresa: d.empresa,
      datos: [
        ['N° traslado', d.numero],
        ['', '(continuación)'],
      ],
    })
  }

  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
  doc.text(aviso, IZQ, Math.max(y + 6, ARRANQUE_DEL_AVISO), { lineHeightFactor: 1.4 })

  // Una firma en cada punta. Sin nombre: el sistema todavía no captura quién
  // carga ni quién recibe, y se firma a mano.
  firmas(
    doc,
    LINEA_DE_FIRMAS,
    { texto: 'Entregó en el origen', nombre: null },
    { texto: 'Recibió en el destino', nombre: null },
  )

  pieDePagina(doc, `Documento generado por el sistema · ${d.numero} · ${fechaLarga(d.momento)}`)
  doc.setProperties({ title: `Nota de traslado ${d.numero}` })

  return {
    blob: doc.output('blob'),
    nombre: `nota-traslado-${d.numero.toLowerCase()}.pdf`,
  }
}
