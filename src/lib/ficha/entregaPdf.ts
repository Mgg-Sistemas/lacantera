import { ABAJO, ARRIBA, IZQ, DER, ANCHO_UTIL } from '@/lib/ficha/hoja'
import { logoComoImagen } from '@/lib/ficha/logo'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import {
  membrete,
  lineaEmpresa,
  seccion,
  etiquetaValor,
  tabla,
  firmas,
  pieDePagina,
  fechaLarga,
  GRIS,
  TINTA,
  type Columna,
} from '@/lib/ficha/papel'

/*
  LA CONSTANCIA DE ENTREGA, PARA FIRMAR A MANO

  Lo pidió la líder: que la entrega salga en papel y la firme el trabajador,
  igual que quedó el recibo de nómina. Hasta ahora la entrega quedaba registrada
  en el sistema y nada más — y un registro sin firma no sirve para reclamar nada
  el día que la herramienta no aparece.

  LA FIRMA VA EN BLANCO, A PROPÓSITO

  Es la misma instrucción que se dio para el recibo de nómina: «no usar la firma
  digital salvo se indique lo contrario». Se imprime, se firma con bolígrafo y
  se archiva. La raya sale vacía y eso no es que falte algo.

  UNA HOJA POR PERSONA, NO POR HERRAMIENTA

  Se firma lo que alguien tiene en la mano, y quien recibe cuatro cosas firma
  una vez. Cuatro papeles con una línea cada uno son cuatro papeles que archivar
  y tres que perder.

  EL TEXTO DE RESPONSABILIDAD NO ES RELLENO

  Es lo único que convierte la hoja en un documento: dice qué se recibió, en qué
  estado, cuándo hay que devolverlo y qué pasa si no vuelve. Sin ese párrafo,
  una firma debajo de una lista solo prueba que alguien vio la lista.
*/

export interface RenglonEntrega {
  codigo: string
  articulo: string
  cantidad: string | number
  unidad: string
  /** Cuándo tiene que estar de vuelta. Vacío: no se le puso fecha. */
  fechaLimite?: string | null
}

export interface DatosEntrega {
  trabajador: {
    nombre: string
    ficha: string
    cedula: string
    cargo?: string | null
    departamento?: string | null
  }
  renglones: RenglonEntrega[]
  almacen: string
  fecha: string
  entregadoPor?: string | null
  empresa: { razonSocial: string; rif: string; actividad?: string | null }
  momento: Date
}

const COLUMNAS: Columna[] = [
  { titulo: 'Código', ancho: 26 },
  { titulo: 'Lo que se entrega', ancho: 66 },
  { titulo: 'Cantidad', ancho: 20, alDerecha: true },
  { titulo: 'Unidad', ancho: 16 },
  { titulo: 'Devolver el', ancho: 22 },
]

export async function armarConstanciaDeEntrega(d: DatosEntrega): Promise<ArchivoArmado> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    titulo: 'CONSTANCIA DE ENTREGA',
    subtitulo: `${d.trabajador.nombre} · ficha ${d.trabajador.ficha}`,
    derecha: `Emitida: ${fechaLarga(d.momento)}`,
  })

  y = lineaEmpresa(
    doc,
    y,
    `${d.empresa.razonSocial} · RIF ${d.empresa.rif}${d.empresa.actividad ? ` · ${d.empresa.actividad}` : ''}`,
  )

  y = seccion(doc, y, 'Quién recibe')
  y = etiquetaValor(doc, y, [
    ['Trabajador', d.trabajador.nombre],
    ['Cédula', d.trabajador.cedula],
    ['Ficha', d.trabajador.ficha],
    ['Cargo', d.trabajador.cargo],
    ['Departamento', d.trabajador.departamento],
    ['Sale de', d.almacen],
    ['Fecha de entrega', d.fecha],
  ])

  y = seccion(doc, y, 'Qué se le entrega')
  y = tabla(
    doc,
    y,
    COLUMNAS,
    d.renglones.map((r) => [
      r.codigo,
      r.articulo,
      String(r.cantidad),
      r.unidad,
      // «No se devuelve» no cabe en veintidos milimetros y salia cortado
      // —«No se devu...»—, que en un papel que se firma se lee como un error de
      // imprenta. «No vuelve» dice lo mismo y entra entero.
      r.fechaLimite ?? 'No vuelve',
    ]),
  )

  /*
    El párrafo de responsabilidad, antes de las firmas y no después.

    Firmar es lo último que se hace en una hoja, y lo que se firma tiene que
    estar leído antes. Puesto debajo de las rayas sería letra pequeña detrás de
    la firma, que es exactamente lo que nadie lee.
  */
  const texto =
    'Declaro que recibí los bienes descritos arriba, en buen estado y en la cantidad indicada, ' +
    'para usarlos en las labores propias de mi cargo. Me comprometo a cuidarlos, a devolverlos ' +
    'en la fecha señalada o cuando la empresa los solicite, y a informar de inmediato de ' +
    'cualquier pérdida o daño. Entiendo que lo que se pierda o se dañe por descuido puede ' +
    'reponerse o descontarse de mi salario, previa autorización escrita, conforme al artículo ' +
    '154 de la Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras.'

  const lineas = doc.splitTextToSize(texto, ANCHO_UTIL) as string[]
  const altoTexto = lineas.length * 4.2 + 8

  // Si el párrafo y las firmas no caben enteros, pasan juntos a la hoja
  // siguiente: un compromiso partido por la mitad no lo firma nadie.
  if (y + altoTexto + 30 > ABAJO - 12) {
    doc.addPage()
    y = ARRIBA
  }

  doc.setDrawColor(GRIS).setLineWidth(0.2)
  doc.setLineDashPattern([0.8, 0.8], 0)
  doc.line(IZQ, y, DER, y)
  doc.setLineDashPattern([], 0)

  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(TINTA)
  doc.text(lineas, IZQ, y + 5, { lineHeightFactor: 1.45 })
  y += altoTexto

  /*
    Sin firma escaneada, ni siquiera si la persona tiene una guardada.

    Es lo que se instruyó para el recibo de nómina: se imprime y se firma a
    mano. Una constancia de entrega estampada con la firma digital de quien
    recibe prueba que el sistema tiene su firma, no que recibió la herramienta.
  */
  firmas(
    doc,
    Math.max(y + 14, ABAJO - 26),
    // Solo la cedula debajo de la raya. El nombre completo no cabia en los
    // sesenta y cinco milimetros del lado y salia cortado —«VICENTE ARAON
    // PESTANO CAMPOS · C.I. V-18.3...»—, y una cedula a medias en un papel que
    // se firma no identifica a nadie. El nombre ya esta dos veces mas arriba.
    { texto: 'Recibí conforme', nombre: `C.I. ${d.trabajador.cedula}` },
    { texto: 'Entregó', nombre: d.entregadoPor ?? null },
  )

  pieDePagina(
    doc,
    `Documento generado por el sistema · ficha ${d.trabajador.ficha} · ${fechaLarga(d.momento)}`,
  )
  doc.setProperties({ title: `Constancia de entrega — ${d.trabajador.nombre}` })

  const apellido = d.trabajador.nombre.split(' ').slice(-1)[0].toLowerCase()
  return {
    blob: doc.output('blob'),
    nombre: `entrega-${d.trabajador.ficha}-${apellido}.pdf`,
  }
}
