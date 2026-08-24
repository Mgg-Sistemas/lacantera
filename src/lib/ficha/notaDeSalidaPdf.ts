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
  type Columna,
} from '@/lib/ficha/papel'
import { ABAJO, ANCHO_UTIL, IZQ } from '@/lib/ficha/hoja'

/*
  LA NOTA DE SALIDA

  «Cada salida de material que se haga, hacer una nota de salida (PDF)». Y
  después, viendo la primera versión: «necesitamos que este documento aparente
  mayor seriedad o profesionalismo».

  QUÉ ESTABA MAL, MIRANDO LAS CAPTURAS

  El recuadro gigante con «1 GAL» en cuerpo 22. Funciona en el vale de
  combustible, donde la cifra ES el documento —doscientos litros de gasoil—,
  pero un galón de aceite en letras de dos centímetros parece un cartel de feria,
  no un papel de almacén. Un documento serio no grita: ordena.

  Y «POR QUÉ SALE / SE HIZO MERMA» en mayúsculas sobre media página en blanco.
  Dos palabras solas ocupando un bloque entero es lo que hace que un papel
  parezca sin terminar.

  QUÉ LO ARREGLA: UNA TABLA

  Un documento de almacén se lee como se leen todos: encabezado con los datos,
  renglones con lo que salió, total abajo, firmas al pie. Es la misma forma que
  ya tienen la orden de compra y la factura de esta casa, y por eso se usa el
  mismo armador de tablas — no uno propio.

  Y LA TABLA RESUELVE LA OTRA PETICIÓN

  «¿Es posible gestionar la salida de más de un material a la vez?». Sí, y era
  la misma pregunta: un papel con una tabla de renglones es exactamente un papel
  que puede llevar varios materiales. Una salida de cinco cosas para el mismo
  trabajo es UN documento con cinco líneas, no cinco documentos.

  EL VALOR VA EN EL PAPEL

  Una salida de almacén es un costo, y quien firma tiene derecho a saber por
  cuánto está firmando. El total va destacado abajo de la tabla, como en
  cualquier documento que mueva dinero.
*/

export interface RenglonDeSalida {
  articuloCodigo: string
  articulo: string
  cantidad: string | number
  unidad: string
  costoUnitarioUsd?: string | number | null
  valorUsd?: string | number | null
}

export interface DatosNotaDeSalida {
  numero: string
  fecha: string

  almacen: string
  /** «Salida a consumo», «Baja por daño»… ya en palabras. */
  clase: string
  motivo?: string | null
  /** A dónde va, cuando se sabe. */
  destino?: string | null

  renglones: RenglonDeSalida[]

  entrego?: string | null
  entregoFirma?: string | null

  empresa: { razonSocial: string; rif: string }
  momento: Date
}

export interface NotaArmada {
  blob: Blob
  nombre: string
}

/*
  Los anchos suman los 150 mm útiles.

  Las cifras van alineadas a la derecha, así que cada una necesita por delante el
  hueco de su número más largo. Repartir mirando los rótulos de la cabecera deja
  la primera nota con cifras grandes escribiendo una columna encima de otra.
*/
const COLUMNAS: Columna[] = [
  { titulo: 'Código', ancho: 26 },
  { titulo: 'Material', ancho: 58 },
  { titulo: 'Cantidad', ancho: 17, alDerecha: true },
  { titulo: 'Unidad', ancho: 13 },
  // «Costo unit.» a ocho puntos no cabe en quince milimetros: la cabecera se
  // montaba encima de la de al lado. Se ensancha la columna y se acorta el
  // rotulo — en un papel de almacen, «Costo» no se confunde con nada.
  { titulo: 'Costo', ancho: 18, alDerecha: true },
  { titulo: 'Total', ancho: 18, alDerecha: true },
]

/*
  Dos decimales, siempre. Es lo predeterminado de la casa, y en un papel que se
  firma importa mas que en una pantalla: tres cifras con distinta cantidad de
  decimales en la misma columna no se pueden comparar de un vistazo.
*/
function numero(valor: string | number, decimales = 2): string {
  return Number(valor).toLocaleString('es-VE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
}

export async function armarNotaDeSalida(d: DatosNotaDeSalida): Promise<NotaArmada> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const logo = await logoComoImagen()

  let y = membrete(doc, logo, {
    titulo: 'NOTA DE SALIDA',
    subtitulo: `${d.numero}  ·  ${d.fecha}`,
    derecha: `Generado: ${fechaLarga(d.momento)}`,
  })

  y = lineaEmpresa(doc, y, `${d.empresa.razonSocial} · RIF ${d.empresa.rif}`)

  y = bloqueEtiquetado(doc, y, 'La salida', [
    ['De qué almacén', d.almacen],
    ['Clase', d.clase],
    ['A dónde va', d.destino],
    ['Fecha', d.fecha],
  ])

  // El motivo va antes de la tabla y no al final: es lo que explica todos los
  // renglones, y leerlo después de la lista obliga a volver a subir.
  if (d.motivo) {
    y = seccion(doc, y, 'Por qué sale')
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(TINTA)
    const lineas = doc.splitTextToSize(d.motivo, ANCHO_UTIL) as string[]
    doc.text(lineas, IZQ, y, { lineHeightFactor: 1.45 })
    y += lineas.length * 4.6 + 6
  }

  const total = d.renglones.reduce((s, r) => s + Number(r.valorUsd ?? 0), 0)

  y = tabla(
    doc,
    y,
    COLUMNAS,
    d.renglones.map((r) => [
      r.articuloCodigo,
      r.articulo,
      numero(r.cantidad),
      r.unidad,
      r.costoUnitarioUsd != null ? numero(r.costoUnitarioUsd) : '—',
      r.valorUsd != null ? numero(r.valorUsd) : '—',
    ]),
    total > 0 ? `TOTAL   $ ${numero(total)}` : undefined,
  )

  /*
    Las firmas van a altura fija —abajo del todo— porque una nota se firma
    siempre en el mismo sitio y quien maneja veinte al día no debe buscarlas.
    Eso obliga a comprobar que la tabla no llegue hasta ahí: con quince
    renglones se pisarían.
  */
  if (y > ABAJO - 46) {
    doc.addPage()
    y = membrete(doc, logo, {
      titulo: 'NOTA DE SALIDA',
      subtitulo: `${d.numero}  ·  (continuación)`,
      derecha: null,
    })
  }

  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
  const aviso = doc.splitTextToSize(
    'Al firmar, quien recibe declara que se le entregó el material relacionado arriba en las cantidades indicadas. Esta nota respalda una salida de inventario y queda registrada en el libro de movimientos.',
    ANCHO_UTIL,
  ) as string[]
  doc.text(aviso, IZQ, Math.max(y + 6, ABAJO - 40), { lineHeightFactor: 1.4 })

  firmas(
    doc,
    ABAJO - 24,
    { texto: 'Entregó', nombre: d.entrego ?? null, imagen: d.entregoFirma ?? null },
    // Sin nombre: el sistema todavía no captura quién retira. Se firma a mano.
    { texto: 'Recibió conforme', nombre: null },
  )

  pieDePagina(doc, `Documento generado por el sistema · ${d.numero} · ${fechaLarga(d.momento)}`)

  doc.setProperties({ title: `Nota de salida ${d.numero}` })

  return {
    blob: doc.output('blob'),
    nombre: `nota-salida-${d.numero.toLowerCase()}.pdf`,
  }
}
