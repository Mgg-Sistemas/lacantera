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
} from '@/lib/ficha/papel'
import { ABAJO, ANCHO_UTIL, CENTRO, IZQ } from '@/lib/ficha/hoja'

/*
  EL VALE DE COMBUSTIBLE

  La líder pidió que el módulo tuviera su papel. Y es el papel que más falta hace
  de todo el sistema, porque es el único que sale de la mano de quien despacha y
  va a la mano de quien recibe, en el patio, sin pantalla de por medio.

  QUÉ TIENE QUE PROBAR ESTE PAPEL

  Que a esa máquina se le echaron esos litros, ese día, por ese motivo, y que
  alguien con nombre los recibió. El combustible es de lo que más se pierde en
  una cantera, y la forma de perderlo no es que alguien se lleve un tambor: es
  que veinte litros de cada despacho no lleguen nunca a la máquina. Contra eso
  no sirve el saldo del tanque —cuadra igual— sino que cada salida tenga un
  nombre detrás.

  POR QUÉ VA GRANDE Y CON POCAS COSAS

  Es un papel que se lee de pie, con una mano, a veces con luz de amanecer. Los
  litros y la máquina van en cuerpo grande porque son lo que alguien comprueba
  de un vistazo antes de firmar; el resto es letra pequeña que solo se mira si
  algo no cuadra.

  DOS FIRMAS Y NO UNA

  Quien entrega y quien recibe. Con una sola, el papel prueba que alguien lo
  imprimió. Con las dos, prueba que hubo una entrega — que es lo que se quiere
  poder demostrar tres meses después, cuando el consumo de una máquina se
  dispare y haya que mirar hacia atrás.

  Y si la persona tiene firma guardada en el sistema, se estampa sobre la raya.
  Si no, la raya sale en blanco para firmarla a mano, que es el caso normal en
  el patio y no puede parecer que algo falló.
*/

export interface DatosValeCombustible {
  numero: string | null
  fecha: string
  /** Nula cuando el vale se transcribió otro día: no la sabemos. */
  hora?: string | null

  combustible: string
  unidad: string
  cantidad: string | number
  tanque: string

  /** El motivo, ya en palabras: «Operación», no «OPERACION». */
  motivo: string

  /** El nombre de la máquina, o lo que se escribió cuando no tiene ficha. */
  destino: string
  maquinaCodigo?: string | null
  sinFicha: boolean
  horometro?: string | number | null

  recibio: string
  recibioCedula?: string | null
  /** El PNG de su firma, si la tiene guardada y encendida. */
  recibioFirma?: string | null

  surtio?: string | null
  surtioFirma?: string | null

  costoUsd?: string | number | null
  nota?: string | null

  empresa: { razonSocial: string; rif: string }
  momento: Date
}

export interface ValeArmado {
  blob: Blob
  nombre: string
}

function cantidadLegible(valor: string | number, unidad: string): string {
  return `${Number(valor).toLocaleString('es-VE', { maximumFractionDigits: 2 })} ${unidad}`
}

export async function armarValeDeCombustible(d: DatosValeCombustible): Promise<ValeArmado> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const logo = await logoComoImagen()

  const cuando = d.hora ? `${d.fecha} · ${d.hora.slice(0, 5)}` : d.fecha

  let y = membrete(doc, logo, {
    titulo: 'VALE DE COMBUSTIBLE',
    subtitulo: d.numero ? `${d.numero}  ·  ${cuando}` : cuando,
    derecha: `Generado: ${fechaLarga(d.momento)}`,
  })

  y = lineaEmpresa(doc, y, `${d.empresa.razonSocial} · RIF ${d.empresa.rif}`)

  /*
    LO QUE SE COMPRUEBA DE UN VISTAZO

    Los litros y a qué se le echaron, en grande y centrados, dentro de un
    recuadro. Es lo que mira quien va a firmar, y si tiene que buscarlo entre
    ocho renglones de letra igual, deja de mirarlo a la tercera vez.
  */
  const ALTO_CAJA = 30
  doc.setDrawColor(TINTA).setLineWidth(0.4)
  doc.rect(IZQ, y, ANCHO_UTIL, ALTO_CAJA)

  doc.setFont('helvetica', 'bold').setFontSize(22).setTextColor(TINTA)
  doc.text(cantidadLegible(d.cantidad, d.unidad), CENTRO, y + 12, { align: 'center' })

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(GRIS)
  doc.text(`de ${d.combustible}`, CENTRO, y + 18, { align: 'center' })

  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(TINTA)
  const aQue = d.maquinaCodigo ? `${d.maquinaCodigo} · ${d.destino}` : d.destino
  doc.text(aQue.toUpperCase(), CENTRO, y + 25.5, { align: 'center', maxWidth: ANCHO_UTIL - 8 })

  y += ALTO_CAJA + 10

  y = bloqueEtiquetado(doc, y, 'El despacho', [
    ['Para qué', d.motivo],
    ['De qué tanque', d.tanque],
    ['Fecha', cuando],
    // Sin horómetro el vale sirve igual para el gasto, pero no para el consumo
    // por hora. Se dice, en vez de dejar el hueco: quien lea el papel tiene que
    // saber que ese dato falta y no que se olvidó de imprimirse.
    [
      'Horómetro',
      d.horometro != null
        ? `${Number(d.horometro).toLocaleString('es-VE', { maximumFractionDigits: 2 })} h`
        : d.sinFicha
          ? 'No aplica: no tiene ficha de máquina'
          : 'No se tomó',
    ],
    ['Costo', d.costoUsd != null ? `$ ${Number(d.costoUsd).toFixed(2)}` : null],
  ])

  y = bloqueEtiquetado(doc, y, 'Quién', [
    ['Recibió', d.recibio],
    ['Cédula', d.recibioCedula],
    ['Entregó', d.surtio],
  ])

  if (d.nota) {
    y = seccion(doc, y, 'Nota')
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(TINTA)
    const lineas = doc.splitTextToSize(d.nota, ANCHO_UTIL) as string[]
    doc.text(lineas, IZQ, y, { lineHeightFactor: 1.45 })
    y += lineas.length * 4.6 + 6
  }

  /*
    Las firmas van a una altura fija —abajo del todo— porque un vale se firma
    siempre en el mismo sitio y quien lo maneja a diario no debe tener que
    buscarlas. Pero eso obliga a comprobar que lo de arriba no llegue hasta
    ahi: una nota larga se les echaria encima y el papel saldria con el texto
    pisado. Si no cabe, se pasa a otra hoja entera.
  */
  if (y > ABAJO - 46) {
    doc.addPage()
    y = membrete(doc, logo, {
      titulo: 'VALE DE COMBUSTIBLE',
      subtitulo: d.numero ? `${d.numero}  ·  (continuación)` : '(continuación)',
      derecha: null,
    })
  }

  /*
    La advertencia va encima de las firmas y no al pie.

    Al pie nadie la lee. Justo antes de la raya, sí — es el único sitio del
    papel donde quien firma se para un segundo.
  */
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
  const aviso = doc.splitTextToSize(
    'Al firmar, quien recibe declara que se le entregó la cantidad indicada arriba. Este vale respalda una salida de inventario y no se puede anular sin dejar constancia.',
    ANCHO_UTIL,
  ) as string[]
  doc.text(aviso, IZQ, Math.max(y + 4, ABAJO - 40), { lineHeightFactor: 1.4 })

  firmas(
    doc,
    ABAJO - 24,
    { texto: 'Entregó', nombre: d.surtio ?? null, imagen: d.surtioFirma ?? null },
    { texto: 'Recibió conforme', nombre: d.recibio, imagen: d.recibioFirma ?? null },
  )

  pieDePagina(
    doc,
    `Documento generado por el sistema${d.numero ? ` · ${d.numero}` : ''} · ${fechaLarga(d.momento)}`,
  )

  doc.setProperties({
    title: `Vale de combustible ${d.numero ?? ''} — ${d.destino}`,
  })

  return {
    blob: doc.output('blob'),
    nombre: `vale-combustible-${(d.numero ?? 'sin-numero').toLowerCase()}.pdf`,
  }
}
