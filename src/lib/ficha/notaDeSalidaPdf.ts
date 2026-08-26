import { logoComoImagen } from '@/lib/ficha/logo'
import {
  GRIS,
  MARCA,
  TINTA,
  bloqueEtiquetado,
  fechaLarga,
  firmas,
  lineaEmpresa,
  membrete,
  tituloDocumento,
  pieDePagina,
  seccion,
  tabla,
  type Columna,
} from '@/lib/ficha/papel'
import { ABAJO, ANCHO_UTIL, ARRIBA, DER, IZQ } from '@/lib/ficha/hoja'

/** Lo que mide una fila en `tabla`. Si cambia alli, cambia aqui. */
const ALTO_FILA = 6.5

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
  /**
   * De qué almacén sale este renglón.
   *
   * Solo importa cuando la nota mezcla varios sitios, y entonces NO se imprime
   * como una columna más: la tabla se parte en un bloque por almacén, con el
   * nombre entero encima. Probamos la columna y hubo que meterla a la fuerza —
   * primero cortaba los nombres, y con códigos dejaba de entenderse.
   */
  almacen?: string | null
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
  { titulo: 'Material', ancho: 55 },
  { titulo: 'Cantidad', ancho: 18, alDerecha: true },
  { titulo: 'Unidad', ancho: 15 },
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

/** Un renglón, en las seis celdas de la tabla. Es el mismo dibujo con sitio o sin él. */
const celdas = (r: RenglonDeSalida): string[] => [
  r.articuloCodigo,
  r.articulo,
  numero(r.cantidad),
  r.unidad,
  r.costoUnitarioUsd != null ? numero(r.costoUnitarioUsd) : '—',
  r.valorUsd != null ? numero(r.valorUsd) : '—',
]

export async function armarNotaDeSalida(d: DatosNotaDeSalida): Promise<NotaArmada> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  let y = membrete(doc, logo, {
    empresa: d.empresa,
    datos: [
      ['N° nota', d.numero],
      ['Fecha', d.fecha],
      ['Generado', fechaLarga(d.momento)],
    ],
  })

  y = tituloDocumento(doc, y, 'Nota de salida')

  y = lineaEmpresa(doc, y, `${d.empresa.razonSocial} · RIF ${d.empresa.rif}`)

  // Si los renglones vienen de sitios distintos, ninguno de ellos es «el»
  // almacén de la nota: decir uno solo arriba sería falso.
  const sitios = new Set(d.renglones.map((r) => (r.almacen ?? '').trim()).filter(Boolean))
  const mezclada = sitios.size > 1

  /*
    Las filas vacias no se pintan.

    «A dónde va — » no dice nada y ocupa lo mismo que una fila con contenido: en
    una nota con material de tres sitios, esos milimetros eran justo los que
    empujaban las firmas a una segunda hoja. Un dato que no se tiene se calla.
  */
  y = bloqueEtiquetado(
    doc,
    y,
    'La salida',
    (
      [
        ['De qué almacén', mezclada ? 'Varios · se indica en cada renglón' : d.almacen],
        ['Clase', d.clase],
        ['A dónde va', d.destino],
        ['Fecha', d.fecha],
      ] as Array<[string, string | null | undefined]>
    ).filter(([, valor]) => Boolean(valor && String(valor).trim())),
  )

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

  /*
    UN BLOQUE POR SITIO

    Con renglones de dos almacenes hicieron falta dos intentos antes de dar con
    esto. Una columna «De dónde» cortaba los nombres —«ALMACEN GENE…»—, y
    poniendo el código en su lugar dejaba de entenderse: quien firma el papel no
    tiene por qué saberse las siglas.

    Lo que funciona es no meter el sitio en la fila. La tabla se parte en un
    bloque por almacén, con el nombre entero como título, y cada bloque lleva su
    subtotal. Los renglones conservan todo el ancho, y de paso el papel dice algo
    que la columna no decía: cuánto salió de cada sitio.
  */
  if (mezclada) {
    // Se agrupa conservando el orden en que llegaron: el papel sigue el orden
    // del libro, y reordenar por nombre haría que no coincidieran.
    const porSitio = new Map<string, RenglonDeSalida[]>()
    for (const r of d.renglones) {
      const sitio = (r.almacen ?? '').trim() || 'Sin indicar'
      const ya = porSitio.get(sitio)
      if (ya) ya.push(r)
      else porSitio.set(sitio, [r])
    }

    for (const [sitio, suyos] of porSitio) {
      /*
        El titulo del bloque no usa `seccion`: a once puntos y con seis
        milimetros debajo, tres bloques empujaban las firmas a una segunda hoja
        con cuatro renglones. Aqui el titulo es parte de la tabla, no una
        seccion del documento, y se dibuja como tal.
      */
      /*
        Un titulo de bloque no se pinta si no cabe debajo, por lo menos, la
        cabecera de su tabla y una fila.

        `tabla` comprueba el hueco antes de cada FILA, pero no antes de su
        cabecera: con el bloque anterior acabando bajo, la hoja se quedaba con
        el nombre del almacen y la banda naranja de titulos, y nada debajo. La
        tabla de verdad empezaba en la hoja siguiente. No se pierde ningun dato
        —es cosmetico— pero un papel que se firma no puede tener eso.

        Se piden dos alturas de fila: la cabecera y el primer renglon. Con una
        sola, la cabecera cabria y la fila saltaria igual.
      */
      if (y + 4.5 + ALTO_FILA * 2 > ABAJO - 30) {
        doc.addPage()
        y = ARRIBA
      }

      doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(TINTA)
      doc.text(`DE ${sitio.toUpperCase()}`, IZQ, y)
      y += 4.5

      const suma = suyos.reduce((t, r) => t + Number(r.valorUsd ?? 0), 0)
      // `tabla` deja ocho milimetros detras, que separan de lo que venga
      // despues. Entre bloques del mismo cuadro sobran cuatro.
      y = tabla(doc, y, COLUMNAS, suyos.map(celdas), `Subtotal   $ ${numero(suma)}`) - 4
    }

    // El total de la nota, con el mismo peso que en una nota de un solo sitio:
    // es la cifra por la que se firma, y quedarse en los subtotales obligaría a
    // sumarlos de cabeza.
    doc.setFillColor(MARCA)
    doc.rect(IZQ, y - 4, ANCHO_UTIL, 8, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor('#FFFFFF')
    doc.text(`TOTAL DE LA NOTA   $ ${numero(total)}`, DER - 4, y + 1.4, {
      align: 'right',
    })
    y += 10
  } else {
    y = tabla(
      doc,
      y,
      COLUMNAS,
      d.renglones.map(celdas),
      total > 0 ? `TOTAL   $ ${numero(total)}` : undefined,
    )
  }

  /*
    Las firmas van a altura fija —abajo del todo— porque una nota se firma
    siempre en el mismo sitio y quien maneja veinte al día no debe buscarlas.
    Eso obliga a comprobar que la tabla no llegue hasta ahí: con quince
    renglones se pisarían.
  */
  /*
    DÓNDE EMPIEZA LA ZONA DE FIRMAS

    Las firmas van a altura fija —abajo del todo— porque una nota se firma
    siempre en el mismo sitio y quien maneja veinte al día no debe buscarlas. Eso
    obliga a comprobar que la tabla no llegue hasta ahí.

    Antes la comprobación era un número redondo, «cuarenta y seis milímetros», y
    con material de tres almacenes se pasaba por 1,7 mm: la nota se iba a dos
    hojas con cuatro renglones y la segunda llevaba solo las firmas. Medido, no
    supuesto: el aviso ocupa lo que ocupa según en cuántas líneas parta, y de ahí
    hacia arriba es donde puede acabar la tabla.
  */
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
  const aviso = doc.splitTextToSize(
    'Al firmar, quien recibe declara que se le entregó el material relacionado arriba en las cantidades indicadas. Esta nota respalda una salida de inventario y queda registrada en el libro de movimientos.',
    ANCHO_UTIL,
  ) as string[]

  const LINEA_DE_FIRMAS = ABAJO - 24
  // Cuatro milímetros de aire entre la última línea del aviso y la raya donde
  // se firma: pegados se leen como una sola cosa.
  const ARRANQUE_DEL_AVISO = LINEA_DE_FIRMAS - 4 - aviso.length * 3.8

  if (y > ARRANQUE_DEL_AVISO) {
    doc.addPage()
    y = membrete(doc, logo, {
      empresa: d.empresa,
      datos: [
        ['N° nota', d.numero],
        ['', '(continuación)'],
      ],
    })
  }

  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
  doc.text(aviso, IZQ, Math.max(y + 6, ARRANQUE_DEL_AVISO), {
    lineHeightFactor: 1.4,
  })

  firmas(
    doc,
    LINEA_DE_FIRMAS,
    {
      texto: 'Entregó',
      nombre: d.entrego ?? null,
      imagen: d.entregoFirma ?? null,
    },
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
