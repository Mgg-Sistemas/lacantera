/**
 * La planilla de ingreso, en blanco, para llenar a mano.
 *
 * Es la herramienta de quien hace la entrevista: se imprime, se llena con
 * bolígrafo delante del aspirante, y después alguien la transcribe al sistema.
 *
 * DE AHÍ SALE LA ÚNICA REGLA QUE IMPORTA: **cada hueco de este papel tiene que
 * existir en la ficha del trabajador.** Un papel que pregunta algo que el
 * sistema no guarda produce un dato que se queda en el papel, y entonces la
 * carpeta de papeles vuelve a ser la fuente de verdad. Y al revés: un campo de
 * la ficha que el papel no pregunta se rellena de memoria una semana después,
 * que es como se escriben los teléfonos equivocados.
 *
 * Por eso donde el sistema ofrece una lista cerrada —estado civil, género— el
 * papel ofrece las MISMAS opciones con su casilla, y no una raya. Una raya
 * invita a escribir «unión libre», y luego en pantalla hay que elegir entre
 * cinco que no lo dicen así.
 *
 * TRES HUECOS NO TIENEN TODAVÍA DÓNDE TRANSCRIBIRSE, y hay que decirlo aquí
 * porque son la excepción a la regla de arriba: el **tipo de cuenta**, el
 * **grado de instrucción** y la **última experiencia laboral**. Los tres los
 * pidió la empresa y los tres hacen falta —transferir a una cuenta de ahorro
 * cuando es corriente lo rebota el banco—, pero `empleados` no tiene columna
 * para ninguno. El papel va por delante a propósito; lo que no se puede es
 * olvidar que la ficha todavía no los admite.
 *
 * LO QUE NO SE PREGUNTA, Y POR QUÉ
 *
 *   · El sueldo y la fecha de ingreso salen del tabulador y de la decisión de
 *     contratar. Ponerlos aquí invitaría a prometerlos en la mesa.
 *   · La jornada la decide la empresa al cargar la ficha, no el aspirante.
 *   · La forma de pago la decide nómina después, según lo que la empresa use
 *     con cada quien. Los DATOS bancarios sí se piden, para tenerlos el día
 *     que haya que pagar.
 *
 * EL TONO DEL PAPEL ES FORMAL Y NEUTRO, y no el de la casa. Lo pidió la
 * empresa el 24/09/2026 señalando la hoja equivalente de Golden Touch como
 * modelo: allí las secciones son «Datos personales» y «Contacto en caso de
 * emergencia», no «Quién es» ni «A quién avisar». Un papel que el aspirante
 * firma y que puede acabar en un expediente laboral se lee como un documento,
 * no como una conversación. **Este archivo se comenta en la voz de la casa; lo
 * que se imprime, no.**
 *
 * Y POR LO MISMO NO LLEVA NI UNA LÍNEA DE AYUDA. No hay pistas bajo los
 * rótulos, ni ejemplos entre paréntesis, ni la marca de qué campo es optativo.
 * Un «(si lo tiene)» impreso es permiso para dejarlo en blanco, y quien
 * entrevista ya sabe qué preguntar.
 *
 * DOS HOJAS Y NO UNA, a propósito. Apretando cabría en una, con rayas de cuatro
 * milímetros donde no entra una firma ni un nombre largo. El papel es barato y
 * la letra de otro es cara de descifrar.
 *
 * Helvetica y no la Inter del sistema, como el resto de los papeles: es una de
 * las catorce fuentes que todo lector de PDF ya tiene, y en papel no se nota.
 */

import { logoComoImagen } from './logo'
import { ABAJO, ajustar, ANCHO_UTIL, DER, IZQ } from './hoja'
import {
  type EmpresaPapel,
  GRIS,
  HAIRLINE,
  membrete,
  pieDePagina,
  ROTULO,
  seccion,
  TINTA,
  tituloDocumento,
} from './papel'

type Doc = import('jspdf').jsPDF

/** Lo que mide un renglón para escribir a mano. Menos no admite una letra normal. */
const ALTO_RENGLON = 11
const SEPARA_COL = 8
const ANCHO_COL = (ANCHO_UTIL - SEPARA_COL) / 2
const COL2 = IZQ + ANCHO_COL + SEPARA_COL

/** La raya de firmar. Todo el pie se mide desde aquí. */
const RAYA_FIRMA = ABAJO - 27

/**
 * Dónde empieza el bloque del pie, contando el recuadro de la huella.
 *
 * Es el techo que la declaración tiene que respetar, así que vive fuera de las
 * dos funciones que lo miran: un número compartido no se desincroniza.
 */
const ARRANQUE_DEL_PIE = RAYA_FIRMA - 12

/**
 * Un hueco para escribir: el rótulo arriba, pequeño, y la raya debajo.
 *
 * El rótulo va ENCIMA y no a la izquierda porque a la izquierda se come el
 * ancho de escritura, y en un papel que se llena a mano el ancho es lo único
 * que de verdad escasea.
 */
function hueco(doc: Doc, x: number, y: number, ancho: number, rotulo: string) {
  doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(GRIS)
  doc.text(rotulo.toUpperCase(), x, y)

  doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
  doc.line(x, y + 5.5, x + ancho, y + 5.5)
}

/** Una casilla para marcar con una equis, y su palabra al lado. */
function casilla(doc: Doc, x: number, y: number, texto: string): number {
  doc.setDrawColor('#9c9690').setLineWidth(0.3)
  doc.rect(x, y - 2.6, 3, 3)
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(TINTA)
  doc.text(texto, x + 4.5, y)
  return x + 4.5 + doc.getTextWidth(texto) + 4
}

/**
 * Un renglón de la hoja de requisitos: la casilla vacía y el documento al lado.
 *
 * La casilla es más grande que la de `casilla()` —cuatro milímetros frente a
 * tres— porque estas se marcan con un bolígrafo encima de un mostrador y no con
 * el papel apoyado en una mesa. Y el nombre va en tinta normal y no en gris: es
 * lo que la persona va a leer para saber qué buscar en su casa.
 */
function renglonDeRequisito(doc: Doc, x: number, y: number, nombre: string, ancho: number) {
  doc.setDrawColor('#9c9690').setLineWidth(0.35)
  doc.rect(x, y - 3.2, 4, 4)
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(TINTA)
  doc.text(ajustar(doc, nombre, ancho - 6.5), x + 6.5, y)
}

/** Un rótulo con su fila de casillas debajo. Para las listas cerradas. */
function opciones(doc: Doc, x: number, y: number, rotulo: string, lista: string[]): number {
  doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(GRIS)
  doc.text(rotulo.toUpperCase(), x, y)

  let cursor = x
  for (const texto of lista) cursor = casilla(doc, cursor, y + 5.5, texto)
  return y + ALTO_RENGLON
}

/**
 * Una condición de salud: la pregunta con su sí y su no, y el detalle al lado.
 *
 * Sustituye a la tabla de tres columnas que había aquí. La tabla obligaba a
 * inventarse el renglón —¿se escribe «ninguna»?, ¿se deja vacío?— y una fila en
 * blanco no distingue «no tiene» de «no se preguntó». Con el sí y el no la
 * respuesta existe siempre, que es lo que hace útil un antecedente médico.
 *
 * Los dos comparten renglón a propósito: las casillas ocupan veintitrés
 * milímetros de los ciento cincuenta, y poner el detalle debajo gastaría once
 * más por cada condición para dejar el mismo hueco en blanco al lado.
 */
function condicionDeSalud(doc: Doc, y: number, rotulo: string): number {
  hueco(doc, IZQ + 40, y, ANCHO_UTIL - 40, 'Detalle')
  return opciones(doc, IZQ, y, rotulo, ['Sí', 'No'])
}

/**
 * Una tabla con las filas vacías, para escribir dentro.
 *
 * Las columnas se dan con su ancho en milímetros y tienen que sumar el ancho
 * útil: repartirlo aquí sería adivinar cuánto ocupa «fecha de nacimiento»
 * escrito a mano, y quien arma la tabla sí lo sabe.
 */
function tablaEnBlanco(doc: Doc, y: number, columnas: [string, number][], filas: number): number {
  const ALTO_FILA = 9

  doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(ROTULO)
  let x = IZQ
  for (const [titulo, ancho] of columnas) {
    doc.text(titulo.toUpperCase(), x + 1.5, y)
    x += ancho
  }

  const arriba = y + 2
  doc.setDrawColor(HAIRLINE).setLineWidth(0.3)

  for (let f = 0; f <= filas; f++) doc.line(IZQ, arriba + f * ALTO_FILA, DER, arriba + f * ALTO_FILA)

  x = IZQ
  for (const [, ancho] of columnas) {
    doc.line(x, arriba, x, arriba + filas * ALTO_FILA)
    x += ancho
  }
  doc.line(DER, arriba, DER, arriba + filas * ALTO_FILA)

  return arriba + filas * ALTO_FILA + 8
}

/*
  EL PIE FIRMADO: EXACTAMENTE DOS FIRMAS Y NADA DEBAJO DE ELLAS.

  Firma quien da los datos y firma quien los recibe. Una planilla con una sola
  firma no dice quién estuvo delante, y a los tres meses eso es justo lo que se
  pregunta. No hay una tercera, y bajo la raya no va más que el rótulo: llevó
  una leyenda con «nombre en letra de molde y cédula» y el pie pasaba a leerse
  como cuatro campos de firma.

  LA HUELLA ES OPCIONAL Y SE DECIDE ANTES DE IMPRIMIR. Hay quien no firma igual
  dos veces, y para esos casos la huella del pulgar vale más que la rúbrica.
  Pero no siempre hace falta, y un recuadro vacío en todas las planillas invita
  a dejarlo vacío — y un campo que se deja vacío siempre acaba enseñando que el
  papel no se llena entero.
*/
function pieFirmado(doc: Doc, conHuella: boolean): void {
  const anchoHuella = 26
  const desdeX = conHuella ? IZQ + anchoHuella + 8 : IZQ
  const SEPARA = 16
  const ancho = (DER - desdeX - SEPARA) / 2

  doc.setDrawColor('#9c9690').setLineWidth(0.3)

  if (conHuella) {
    doc.rect(IZQ, ARRANQUE_DEL_PIE, anchoHuella, 24)
    // El rótulo va DENTRO del recuadro: encima se comía la línea que necesita
    // la declaración, y dentro no estorba a la huella, que se estampa al medio.
    doc.setFont('helvetica', 'normal').setFontSize(6).setTextColor(GRIS)
    doc.text('HUELLA', IZQ + anchoHuella / 2, ARRANQUE_DEL_PIE + 4, { align: 'center' })
    doc.text('Pulgar derecho', IZQ + anchoHuella / 2, ARRANQUE_DEL_PIE + 28, { align: 'center' })
  }

  for (const [i, texto] of ['Firma del aspirante', 'Empleado'].entries()) {
    const x = desdeX + i * (ancho + SEPARA)

    doc.line(x, RAYA_FIRMA, x + ancho, RAYA_FIRMA)

    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS)
    doc.text(texto, x + ancho / 2, RAYA_FIRMA + 4, { align: 'center' })
  }
}

/** Un grupo de la hoja de requisitos: el título y lo que cuelga de él. */
export interface ApartadoImpreso {
  nombre: string
  requisitos: string[]
}

export interface DatosPlanilla {
  empresa: EmpresaPapel
  /** Si el pie lleva recuadro para la huella del pulgar. Se elige al imprimir. */
  conHuella: boolean
  /**
   * Los requisitos de documentación, agrupados y ya filtrados por quien imprime.
   *
   * VACÍO ES UNA RESPUESTA VÁLIDA y no un error: sin requisitos no hay tercera
   * hoja y la planilla sale como salía. Así el día que alguien vacíe la lista no
   * se imprime una hoja con un título y nada debajo.
   */
  requisitos?: ApartadoImpreso[]
}

export async function armarPlanillaDeIngreso(
  d: DatosPlanilla,
): Promise<{ blob: Blob; nombre: string }> {
  const { jsPDF } = await import('jspdf')
  const logo = await logoComoImagen(400, false)
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  const TITULO = 'Hoja de ingreso y registro de personal'

  // ═════════════════════════════════════════════════════════════════ hoja 1
  let y = tituloDocumento(doc, membrete(doc, logo, { empresa: d.empresa }), TITULO) + 6

  // ── 1 · Datos personales ─────────────────────────────────────────────────
  y = seccion(doc, y, '1 · Datos personales')

  hueco(doc, IZQ, y, ANCHO_COL, 'Cédula')
  hueco(doc, COL2, y, ANCHO_COL, 'RIF')
  y += ALTO_RENGLON

  hueco(doc, IZQ, y, ANCHO_COL, 'Nombres')
  hueco(doc, COL2, y, ANCHO_COL, 'Apellidos')
  y += ALTO_RENGLON

  hueco(doc, IZQ, y, ANCHO_COL, 'Fecha de nacimiento')
  hueco(doc, COL2, y, ANCHO_COL, 'Nacionalidad')
  y += ALTO_RENGLON

  y = opciones(doc, IZQ, y, 'Estado civil', [
    'Soltero/a',
    'Casado/a',
    'Concubinato',
    'Divorciado/a',
    'Viudo/a',
  ])

  y = opciones(doc, IZQ, y, 'Género', ['Masculino', 'Femenino'])

  // El grupo sanguíneo va en el carnet y en una emergencia es lo primero que se
  // busca. Se pregunta aquí porque después nadie vuelve a preguntarlo.
  y = opciones(doc, IZQ, y, 'Grupo sanguíneo', ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'])

  hueco(doc, IZQ, y, ANCHO_COL, 'Teléfono')
  hueco(doc, COL2, y, ANCHO_COL, 'Correo electrónico')
  y += ALTO_RENGLON

  hueco(doc, IZQ, y, ANCHO_UTIL, 'Dirección de habitación')
  y += ALTO_RENGLON
  // Segunda raya sin rótulo: una dirección de esta zona no cabe en 150 mm.
  doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
  doc.line(IZQ, y + 1, DER, y + 1)
  y += 12

  /*
    ── 2 · Carga familiar ──────────────────────────────────────────────────

    LA COLUMNA «¿DEPENDE?» SE FUE, y no por espacio. La empresa lo zanjó el
    24/09/2026: carga familiar ES dependencia, así que quien aparece en esta
    tabla depende del trabajador y preguntarlo otra vez en la columna de al
    lado era invitar a contestar que no. La misma tabla de Golden Touch tampoco
    la tiene. Los diez milímetros que ocupaba se reparten entre las cuatro que
    quedan, que es donde hace falta escribir.
  */
  y = seccion(doc, y, '2 · Carga familiar y dependientes')

  y = tablaEnBlanco(
    doc,
    y,
    [
      ['Nombres y apellidos', 62],
      ['Parentesco', 32],
      ['Fecha de nacimiento', 34],
      ['Cédula', 22],
    ],
    5,
  )

  /*
    ═══════════════════════════════════════════════════════════════════ hoja 2

    LA SEGUNDA HOJA LLEVA MEMBRETE PERO NO BANDA DE TÍTULO. La banda cuesta
    veintiún milímetros —el once por ciento de la caja— y con las dos secciones
    que la empresa mandó añadir, esos veintiún milímetros eran exactamente la
    diferencia entre dos hojas y tres. Lo que la banda decía no se pierde: el
    pie escribe el nombre del documento y «Página 2 de 2» en las dos hojas, así
    que una hoja suelta sigue diciendo de qué papel salió y que le falta la otra.
  */
  doc.addPage()
  y = membrete(doc, logo, { empresa: d.empresa }) + 8

  // ── 3 · Salud ────────────────────────────────────────────────────────────
  y = seccion(doc, y, '3 · Salud')
  y = condicionDeSalud(doc, y, 'Alergia')
  y = condicionDeSalud(doc, y, 'Patología')
  y += 2

  // ── 4 · Formación y experiencia ──────────────────────────────────────────
  y = seccion(doc, y, '4 · Formación y experiencia')

  y = opciones(doc, IZQ, y, 'Grado de instrucción', [
    'Primaria',
    'Bachiller',
    'T.S.U.',
    'Universitario',
    'Postgrado',
  ])

  hueco(doc, IZQ, y, ANCHO_COL, 'Última empresa donde trabajó')
  hueco(doc, COL2, y, ANCHO_COL, 'Cargo desempeñado')
  y += ALTO_RENGLON

  hueco(doc, IZQ, y, ANCHO_COL, 'Tiempo en el cargo')
  hueco(doc, COL2, y, ANCHO_COL, 'Motivo de retiro')
  y += ALTO_RENGLON + 2

  // ── 5 · Contacto de emergencia ───────────────────────────────────────────
  y = seccion(doc, y, '5 · Contacto de emergencia')
  hueco(doc, IZQ, y, ANCHO_COL, 'Nombre y parentesco')
  hueco(doc, COL2, y, ANCHO_COL, 'Teléfono')
  y += ALTO_RENGLON + 2

  // ── 6 · Cargo a postular ─────────────────────────────────────────────────
  y = seccion(doc, y, '6 · Cargo a postular')

  hueco(doc, IZQ, y, ANCHO_COL, 'Cargo a postular')
  hueco(doc, COL2, y, ANCHO_COL, 'Departamento o frente')
  y += ALTO_RENGLON

  /*
    «DISPONIBILIDAD INMEDIATA: SÍ / NO» Y NO «DESDE CUÁNDO PUEDE EMPEZAR».

    La raya abierta se contestaba con «cuando me llamen» o con una fecha que
    para cuando alguien lee el papel ya pasó. Lo que quien contrata necesita
    saber en la mesa es si puede empezar ya, y eso son dos casillas.
  */
  y = opciones(doc, IZQ, y, 'Disponibilidad inmediata', ['Sí', 'No'])
  y += 2

  // ── 7 · Datos bancarios ──────────────────────────────────────────────────
  y = seccion(doc, y, '7 · Datos bancarios')

  hueco(doc, IZQ, y, ANCHO_COL, 'Banco')
  hueco(doc, COL2, y, ANCHO_COL, 'Número de cuenta')
  y += ALTO_RENGLON

  hueco(doc, COL2, y, ANCHO_COL, 'Teléfono de pago móvil')
  y = opciones(doc, IZQ, y, 'Tipo de cuenta', ['Corriente', 'Ahorro'])

  /*
    LA FECHA CIERRA EL PAPEL, y va sola en su renglón.

    No dice de quién es ni quién la escribe. La llena recursos humanos al
    recibir la planilla, pero eso es un procedimiento interno y un papel que se
    lo explica al aspirante está contando algo que no le toca. «Fecha», y ya.
  */
  hueco(doc, DER - 60, y + 2, 60, 'Fecha')

  /*
    LA DECLARACIÓN SE APOYA SOBRE EL PIE, y su sitio se calcula hacia arriba.

    Estuvo anclada a una altura fija y se montó encima del último bloque: se vio
    en el PDF antes de que nadie lo probara. El fallo no era la altura elegida
    sino elegir una — cualquier número fijo choca con lo de arriba el día que
    una sección crece, o con las firmas el día que el texto se parte en un
    renglón más, y de eso decide el lector de PDF y no nosotros.

    Así que se mide el texto, se mira dónde empieza el pie y se resta. Lo que
    queda flojo es el hueco del medio, que es hueco.
  */
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(TINTA)
  const declaracion = doc.splitTextToSize(
    'Declaro que los datos asentados en esta planilla son correctos y verídicos, y autorizo a la ' +
      'empresa a verificar su autenticidad cuando lo requiera.',
    ANCHO_UTIL,
  ) as string[]

  let yDeclaracion = ARRANQUE_DEL_PIE - 6 - declaracion.length * 4.5
  for (const linea of declaracion) {
    doc.text(linea, IZQ, yDeclaracion)
    yDeclaracion += 4.5
  }

  pieFirmado(doc, d.conHuella)

  /*
    EL PIE SE ESCRIBE UNA SOLA VEZ, AL FINAL.

    LA TERCERA HOJA SOLO EXISTE SI HAY QUÉ PONER EN ELLA.

    Es la que se lleva el prospecto: le dice qué documentos traer la próxima vez.
    Va después de la planilla y no antes porque la planilla se llena delante del
    entrevistador y esto se lee en casa.

    LOS TÍTULOS VACÍOS NO SE IMPRIMEN. Un título sin requisitos debajo es una
    promesa que el papel no cumple —quien lo lea buscará la lista y no la habrá—,
    y además es la forma que tiene quien imprime de dejar fuera un grupo entero
    sin borrarlo: desmarca sus renglones y el título se va con ellos.
  */
  const grupos = (d.requisitos ?? []).filter((g) => g.requisitos.length > 0)

  if (grupos.length > 0) {
    /*
      CON BANDA DE TÍTULO, Y AQUÍ SÍ SE PAGAN LOS VEINTIÚN MILÍMETROS.

      La hoja 2 renuncia a la banda porque es la continuación de la 1 y el pie ya
      dice de qué papel salió. Esta no: **se separa del taco y se la lleva otra
      persona**. Sin banda, puesta al lado de la planilla, parecían dos papeles
      de dos empresas — y el aspirante recibe una y entrega la otra el mismo día.

      Y SE LLAMA «CONSIGNACIÓN» Y NO «REQUISITOS». Lo que se lleva es la lista de
      lo que va a consignar si queda; «requisitos» es como lo llamamos nosotros
      por dentro. El código y el modal siguen diciendo requisitos: lo que cambia
      es lo que lee quien no trabaja aquí.
    */
    doc.addPage()
    y =
      tituloDocumento(
        doc,
        membrete(doc, logo, { empresa: d.empresa }),
        'Hoja de consignación de documentos',
      ) + 8

    /*
      ENTRE LA BANDA Y EL PRIMER APARTADO NO VA NADA, Y COSTÓ CINCO REDACCIONES
      DESCUBRIR QUE LA BUENA ERA NINGUNA.

      Aquí hubo, por este orden: una frase que mandaba marcar a quien solo lee;
      otra que explicaba quién llena el papel; un rótulo «Documentos a
      consignar»; y una línea de apoyo diciendo que los marcados son los que hay
      que entregar. Las cuatro decían, con otras palabras, lo que la banda ya
      dice en tres: HOJA DE CONSIGNACIÓN DE DOCUMENTOS.

      El título nombra el papel y explica qué se hace con él. Lo que se ponga
      debajo o lo repite o narra un procedimiento en el que quien lee no
      participa — el aspirante tuvo la hoja delante mientras se marcaba.

      Así que el primer rótulo del papel es el del primer apartado de verdad.
    */
    /*
      DOS COLUMNAS, Y SE CAMBIA DE HOJA ANTES DE PERDER UN RENGLÓN.

      Con los once nombres que trae el sistema esto entra de sobra en una hoja.
      Pero la lista la edita la empresa y va a crecer, así que el corte está
      puesto: cuando el siguiente renglón no cabe, se abre otra hoja en vez de
      pintarlo encima del pie. Un requisito que no se imprime es un documento
      que el prospecto no trae.
    */
    const TECHO = ABAJO - 14
    const PASO = 7

    for (const grupo of grupos) {
      // El título y su primer renglón no se separan: un título al pie de una
      // hoja con su lista en la siguiente se lee como dos cosas distintas.
      if (y + 6 + PASO > TECHO) {
        doc.addPage()
        y = membrete(doc, logo, { empresa: d.empresa }) + 8
      }

      y = seccion(doc, y, grupo.nombre)
      y += 1

      for (let i = 0; i < grupo.requisitos.length; i += 2) {
        if (y > TECHO) {
          doc.addPage()
          y = membrete(doc, logo, { empresa: d.empresa }) + 8
        }
        renglonDeRequisito(doc, IZQ, y, grupo.requisitos[i], ANCHO_COL)
        if (grupo.requisitos[i + 1]) {
          renglonDeRequisito(doc, COL2, y, grupo.requisitos[i + 1], ANCHO_COL)
        }
        y += PASO
      }

      y += 4
    }
  }

  /*
    `pieDePagina` recorre TODAS las páginas ya hechas en cada llamada. Se
    llamaba dos veces —una por hoja, con «Hoja 1 de 2» y «Hoja 2 de 2» escritos
    a mano— y la segunda pasada estampaba «Hoja 2 de 2» también en la primera,
    encima de lo que ya había. El papel salía diciendo «Hoja 2 de 2 · Página 1
    de 2» en la portada.

    Y la cuenta a mano sobraba de todas formas: el propio pie numera las
    páginas cuando hay más de una.
  */
  pieDePagina(doc, TITULO)

  return { blob: doc.output('blob'), nombre: 'planilla-de-ingreso.pdf' }
}
