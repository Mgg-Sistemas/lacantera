import { logoComoImagen } from '@/lib/ficha/logo'
import {
  TINTA,
  bloqueEtiquetado,
  fechaLarga,
  firmas,
  lineaEmpresa,
  membrete,
  notaBajoLaTabla,
  pieDePagina,
  seccion,
  tabla,
  tituloDocumento,
} from '@/lib/ficha/papel'
import { ABAJO, ANCHO_UTIL, IZQ } from '@/lib/ficha/hoja'
import { hayConversion, notaDeConversion } from '@/lib/medidas'
import {
  celdas,
  columnasDeNota,
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

  EL NÚMERO ES EL DEL TRASLADO

  Desde que el traslado pasa por solicitud, aceptada y recibida, tiene número
  propio —TRA— y el papel lleva ese, con el paso en el que está: la nota que se
  imprime al aceptar dice «De camino», y la misma nota impresa al recibir dice
  «Recibido». Los traslados de antes, sin número propio, siguen saliendo con
  el de su movimiento de salida.

  DOS FIRMAS: ENVIÓ Y RECIBIÓ

  Christopher, 16/09/2026: la firma «aplica para todo aquello que en el sistema
  pueda generar una solicitud u orden y pueda ser aceptado», y en el traslado
  firman quien envió y quien recibió. Quien lo pidió no firma —participan dos—
  y su nombre va en el cuadro de datos, con cuándo pasó cada cosa.

  Las firmas llegan ya decididas. Cada uno eligió al actuar si ponía la suya;
  aquí solo se estampa la imagen cuando tocaba.
*/

/** Quién hizo cada paso del traslado, para el cuadro de datos y las rayas. */
export interface TrasladoEnPapel {
  /** Cómo nació, dicho como se lee. */
  forma: string
  /** Una sola persona, en un solo paso: el cuadro no repite «envió» y «recibió». */
  directo: boolean
  /** Solo en los pedidos: enviado o directo, quien lo pide es quien lo envía. */
  pidio: { nombre: string | null; fecha: string | null } | null
  envio: { nombre: string | null; fecha: string | null; firma?: string | null; deRespaldo?: boolean }
  recibio: { nombre: string | null; fecha: string | null; firma?: string | null; deRespaldo?: boolean }
  cancelo: { nombre: string | null; fecha: string | null; motivo: string | null } | null
}

export interface DatosNotaDeTraslado {
  /** Si el papel lleva las cifras de dinero. Por defecto, sin ellas. */
  conCostos?: boolean
  numero: string
  fecha: string
  origen: string
  destino: string
  motivo?: string | null
  /** El paso, dicho como se lee: «De camino». Solo en los traslados con número. */
  estado?: string | null
  /** Quién hizo cada paso. Nulo en los traslados de antes, sin número propio. */
  pasos?: TrasladoEnPapel | null
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

  /*
    QUIÉN HIZO CADA PASO, EN EL MISMO CUADRO.

    Un cuadro y no dos, como en la nota de salida: con dos títulos, las firmas
    se van a otra hoja. Las filas vacías no se pintan; lo que falta por hacer se
    dice, para que el papel no deje suponer que ya pasó.
  */
  const p = d.pasos
  const quienYCuando = (x: { nombre: string | null; fecha: string | null }) =>
    [x.nombre ?? '—', x.fecha].filter(Boolean).join(' · ')
  const comoAdministracion = (si?: boolean) => (si ? ' · como administración' : '')

  const filasDeLosPasos: Array<[string, string | null | undefined]> = !p
    ? []
    : p.directo
      ? [['Hecho por', `${quienYCuando(p.envio)}${comoAdministracion(p.envio.deRespaldo)}`]]
      : [
          ['Pedido por', p.pidio ? quienYCuando(p.pidio) : null],
          [
            'Enviado por',
            p.envio.nombre
              ? `${quienYCuando(p.envio)}${comoAdministracion(p.envio.deRespaldo)}`
              : null,
          ],
          [
            'Llegada confirmada por',
            p.recibio.nombre
              ? `${quienYCuando(p.recibio)}${comoAdministracion(p.recibio.deRespaldo)}`
              : p.cancelo
                ? 'No llegó: se canceló'
                : 'Pendiente: todavía no se confirma',
          ],
          ['Cancelado por', p.cancelo ? quienYCuando(p.cancelo) : null],
          ['Por qué se canceló', p.cancelo?.motivo],
        ]

  y = bloqueEtiquetado(
    doc,
    y,
    'El traslado',
    (
      [
        ['Sale de', d.origen],
        ['Entra en', d.destino],
        ['Fecha', d.fecha],
        ['Estado', d.estado],
        ['Cómo nació', p?.forma],
        ...filasDeLosPasos,
      ] as Array<[string, string | null | undefined]>
    ).filter(([, valor]) => Boolean(valor && String(valor).trim())),
  )

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
  const conConversion = hayConversion(d.renglones)
  const total = d.renglones.reduce((s, r) => s + Number(r.valorUsd ?? 0), 0)
  y = tabla(
    doc,
    y,
    columnasDeNota(conCostos, conConversion),
    d.renglones.map((r) => celdas(r, conCostos, conConversion)),
    conCostos && total > 0 ? `TOTAL   $ ${numero(total)}` : undefined,
  )
  y = notaBajoLaTabla(doc, y, notaDeConversion(d.renglones))

  /*
    Las firmas van abajo del todo y a altura fija, con la misma cuenta que la
    nota de salida: sin aviso encima —Christopher pidió quitarlo de los papeles—,
    lo que se reserva es el hueco de la firma estampada. Si la tabla llega hasta
    ahí, las firmas pasan a una hoja de continuación.
  */
  const LINEA_DE_FIRMAS = ABAJO - 24
  const ARRANQUE_DE_FIRMAS = LINEA_DE_FIRMAS - 16

  if (y > ARRANQUE_DE_FIRMAS) {
    doc.addPage()
    membrete(doc, logo, {
      empresa: d.empresa,
      datos: [
        ['N° traslado', d.numero],
        ['', '(continuación)'],
      ],
    })
  }

  // Una firma en cada punta, con el nombre de quien dio ese paso. La raya de
  // un paso que todavía no se da sale en blanco, para firmarla a mano.
  firmas(
    doc,
    LINEA_DE_FIRMAS,
    { texto: 'Envió', nombre: p?.envio.nombre ?? null, imagen: p?.envio.firma ?? null },
    { texto: 'Recibió', nombre: p?.recibio.nombre ?? null, imagen: p?.recibio.firma ?? null },
  )

  /*
    UN TRASLADO CANCELADO SE VE CRUZADO. Su papel se puede imprimir —para
    archivarlo, para explicar por qué volvió el material—, pero no puede servir
    para mover nada.
  */
  if (p?.cancelo) {
    for (let pagina = 1; pagina <= doc.getNumberOfPages(); pagina++) {
      doc.setPage(pagina)
      doc.saveGraphicsState()
      // @ts-expect-error jsPDF expone GState por el objeto global, sin tipo propio.
      doc.setGState(new doc.GState({ opacity: 0.14 }))
      doc.setTextColor('#DE3B40').setFont('helvetica', 'bold').setFontSize(54)
      doc.text('CANCELADO', IZQ + ANCHO_UTIL / 2, 165, { align: 'center', angle: 28 })
      doc.restoreGraphicsState()
    }
  }

  pieDePagina(doc, `Documento generado por el sistema · ${d.numero} · ${fechaLarga(d.momento)}`)
  doc.setProperties({ title: `Nota de traslado ${d.numero}` })

  return {
    blob: doc.output('blob'),
    nombre: `nota-traslado-${d.numero.toLowerCase()}.pdf`,
  }
}
