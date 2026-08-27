import { IZQ, DER, ARRIBA, ABAJO, ANCHO_UTIL, PIE, ajustar } from '@/lib/ficha/hoja'

/*
  LA FORMA DE PAPEL QUE PIDIÓ LA LÍDER DE SISTEMAS

  Nos pasó dos documentos de MGG —una orden de compra y un comprobante de
  pago— como el formato al que hay que ajustarse. Se distingue del que
  teníamos en cuatro cosas, y las cuatro tienen su motivo:

    - EL TÍTULO VA EN NEGRO Y GRANDE, sobre fondo blanco, con el logo a su
      izquierda y una regla de color debajo. La banda de color llena que
      usábamos se come tinta en una impresora de oficina y, fotocopiada, deja
      el título en blanco sobre gris.

    - BLOQUES DE ETIQUETA Y VALOR en vez de párrafos. Un papel de compras se
      lee buscando un dato concreto —quién lo aprobó, cuándo se prometió la
      entrega—, y en columna se encuentra sin leer el resto.

    - LA TABLA LLEVA CABECERA DE COLOR y filas alternas. Con quince renglones
      de repuestos, la fila alterna es lo que evita leer el precio de la línea
      de arriba.

    - EL PIE DICE QUE LO GENERÓ EL SISTEMA y de qué documento salió. Es lo que
      permite volver al origen cuando el papel aparece meses después en una
      carpeta.

  EL COLOR ES EL NUESTRO, NO EL DE ELLOS

  La estructura es la que mandó; el naranja es el de La Cantera y no el de
  MGG. Copiar también el color haría que los papeles de dos empresas distintas
  se confundan sobre una mesa, que es justo lo que un membrete existe para
  evitar. Si la quiere idéntica, es cambiar esta constante.
*/

type Doc = import('jspdf').jsPDF

/*
  LA PALETA DEL PAPEL, MEDIDA DEL MODELO QUE MANDÓ LA LÍDER

  Es la del membrete de Minería Internacional TS, y por eso se copia entera —a
  diferencia de la vez anterior, cuando el modelo era de MGG y copiar el color
  habría hecho que los papeles de dos empresas se confundieran sobre una mesa.
  Este es el papel de la casa: el color también.

  Son dos colores y no uno, y esa es la parte que no se ve hasta tenerlo
  delante: el ROJO identifica a la empresa —el nombre arriba, la cabecera de la
  tabla— y el AZUL PIZARRA ordena el documento —el título, las etiquetas—. Con
  un solo color todo compite por la misma atención; con dos, el ojo separa
  «quién emite esto» de «qué dice».
*/

/** El rojo ladrillo del membrete y de las cabeceras de tabla. */
export const MARCA = '#8c2f1f'
/** El azul pizarra del título del documento y de las etiquetas. */
export const ROTULO = '#2f5063'
/** La etiqueta teñida —la prioridad—, más viva que el membrete a propósito. */
export const REALCE = '#e1503c'

export const TINTA = '#333333'
export const GRIS = '#6b6b6b'
export const GRIS_SUAVE = '#a8a29e'
export const FILA_ALTERNA = '#f7f4f1'
export const HAIRLINE = '#e7e5e4'

/** Lo que un renglón de tabla necesita saber de su columna. */
export interface Columna {
  titulo: string
  /** Ancho en milímetros. La suma tiene que dar `ANCHO_UTIL` (150). */
  ancho: number
  alDerecha?: boolean
}

// ---------------------------------------------------------------------------

/** Lo que la cabecera necesita saber de quien emite el papel. */
export interface EmpresaPapel {
  razonSocial: string
  rif: string
  /** «OPERACIONES Y LOGÍSTICA MINERA». La segunda línea del membrete. */
  actividad?: string | null
  /** «ESTADO LA GUAIRA, VENEZUELA». Va debajo del RIF, partido si hace falta. */
  domicilio?: string | null
  /**
   * Teléfono y correo, ya juntos: «0286-9515000 · ventas@…».
   *
   * Hoy los dos están vacíos en Configuración, así que ningún papel lo enseña.
   * Está aquí porque la factura vieja sí lo imprimía y al unificar la cabecera
   * se habría perdido: el día que alguien los llene, salen solos.
   */
  contacto?: string | null
}

/**
 * El membrete: quién emite arriba, y el documento debajo.
 *
 * MANDA LA EMPRESA, NO EL TIPO DE PAPEL. Es el cambio grande respecto a lo que
 * había: antes el renglón grande decía «ORDEN DE COMPRA» y la empresa quedaba
 * en una línea de pie. Ahora es al revés, que es como está el modelo que mandó
 * la líder y como funciona un membrete de verdad — quien recibe el papel
 * necesita saber de quién le llega antes que qué es, y el tipo de documento ya
 * va centrado justo debajo.
 *
 * CON LOGO, que es el unico cambio que pidio la lider sobre el modelo. El
 * modelo no lo lleva -el nombre en color le hace de identidad- pero la empresa
 * si quiere el suyo. Va pequeno y a la izquierda del nombre, no encima: con
 * catorce milimetros la marca se reconoce y el nombre sigue siendo lo mas
 * grande de la hoja, que es lo que hace que un membrete se lea de un vistazo.
 *
 * Y si el logo no carga -da 404, o esto corre fuera del navegador- el ayudante
 * devuelve cadena vacia y aqui el texto se corre a la izquierda como si nunca
 * hubiera habido logo. Un hueco de catorce milimetros en la esquina se lee como
 * un papel roto; sin hueco no se nota que falta nada.
 *
 * Devuelve la altura a la que sigue el documento, para que quien lo llama no
 * tenga que saber cuánto mide esto.
 */
export function membrete(
  doc: Doc,
  /** El logo ya convertido a data URL. Cadena vacia si no se pudo cargar. */
  logo: string,
  d: {
    empresa: EmpresaPapel
    /** Lo de la derecha: [«N° SOLICITUD», «S-C 2026-0826»], [«FECHA», …]. */
    datos?: Array<[string, string]>
    /**
     * Dónde empieza, si no es arriba del todo.
     *
     * Lo pide el recibo de nómina, que imprime dos ejemplares en la misma hoja
     * cuando caben —el del trabajador y el que se archiva firmado— y el segundo
     * arranca a media página. Los demás papeles no lo pasan y empiezan en el
     * margen, como siempre.
     */
    desde?: number
  },
): number {
  const y = d.desde ?? ARRIBA

  // El logo, centrado con los tres renglones de texto que tiene al lado.
  if (logo) doc.addImage(logo, 'PNG', IZQ, y - 2.5, 14, 14)

  const TEXTO = logo ? IZQ + 17 : IZQ
  const ANCHO_NOMBRE = logo ? 88 : 105

  /*
    LA RAZÓN SOCIAL SE ENCOGE, NO SE CORTA.

    «MINERIA INTERNACIONAL TS, C.A.» mide 88,7 mm a quince puntos y el hueco es
    de 88: fallaba por siete décimas de milímetro y `ajustar` la dejaba en
    «MINERIA INTERNACIONAL TS, C...» en TODOS los papeles del sistema.

    No es un detalle de maquetación. `empresa.ts` ya lo dice: la razón social va
    tal como está en el registro, «y un documento laboral que escribe el nombre
    distinto al del registro se discute». Un nombre con puntos suspensivos no es
    el nombre. Un punto tipográfico menos no lo nota nadie.

    Es la misma regla que las tablas: antes de romper el texto, encoger la letra.
  */
  let talla = 15
  doc.setFont('helvetica', 'bold')
  const nombre = d.empresa.razonSocial.toUpperCase()
  while (talla > 9) {
    doc.setFontSize(talla)
    if (doc.getTextWidth(nombre) <= ANCHO_NOMBRE) break
    talla -= 0.5
  }

  /*
    Se apunta hasta dónde llega cada renglón de la izquierda.

    Los datos de la derecha van alineados al margen y crecen hacia la
    izquierda, así que necesitan saber con qué se van a encontrar. Sin esto se
    montaban encima: el caso peor medido era un acta de existencias con el
    almacén «TALLER DE REPARACION DE PLANTA FIJA», que tapaba treinta y seis
    milímetros del nombre de la empresa.
  */
  const ocupado: Array<{ base: number; hasta: number }> = []
  const anotar = (base: number, texto: string) =>
    ocupado.push({ base, hasta: TEXTO + doc.getTextWidth(texto) })

  doc.setTextColor(MARCA).setFontSize(talla)
  const nombreImpreso = ajustar(doc, nombre, ANCHO_NOMBRE)
  doc.text(nombreImpreso, TEXTO, y + 2)
  anotar(y + 2, nombreImpreso)

  doc.setFont('helvetica', 'normal').setFontSize(6.8).setTextColor(GRIS)
  if (d.empresa.actividad) {
    const act = ajustar(doc, d.empresa.actividad.toUpperCase(), ANCHO_NOMBRE)
    doc.text(act, TEXTO, y + 6.5)
    anotar(y + 6.5, act)
  }

  /*
    EL RIF VA SOLO EN SU RENGLÓN, Y EL DOMICILIO DEBAJO, PARTIDO.

    Antes los dos compartían línea —«DOMICILIO  |  J-RIF: …»— y esa línea pasaba
    por `ajustar`, que corta y pone puntos suspensivos. Con el domicilio fiscal
    de verdad de esta empresa, que son noventa y cinco caracteres, la línea mide
    152 mm en un hueco de 88: se cortaba en «…MUNICIPIO ANGOSTURA DEL ORI...» y
    EL RIF NO LLEGABA A IMPRIMIRSE.

    El RIF es obligatorio en todo papel que emite una empresa venezolana. Un
    documento sin él no es un descuido de maquetación.

    No estaba explotando todavía: los seis papeles ya migrados no le pasan
    domicilio a esta función, así que la línea era solo el RIF y cabía. Se
    descubrió al ir a migrar la factura y la constancia, que sí lo pasan — y que
    hoy, cada una por su cuenta, ya lo parten en dos y tres renglones en vez de
    cortarlo. Migrarlas sin esto habría sido cambiar algo que funciona por algo
    que pierde el RIF.

    Así que el orden se invierte: primero el RIF, que es corto y obligatorio, y
    debajo el domicilio, partido y como mucho en dos renglones. Y la cabecera
    crece solo cuando hay domicilio que enseñar, así que a los seis de antes no
    les cambia ni un milímetro.
  */
  const identidad = ['J-RIF: ' + d.empresa.rif, d.empresa.contacto].filter(Boolean).join('  ·  ')
  const identidadImpresa = ajustar(doc, identidad, ANCHO_NOMBRE)
  doc.text(identidadImpresa, TEXTO, y + 10)
  anotar(y + 10, identidadImpresa)

  let bajo = y + 10
  if (d.empresa.domicilio) {
    doc.setFontSize(6.2)
    const lineas = (
      doc.splitTextToSize(d.empresa.domicilio.toUpperCase(), ANCHO_NOMBRE) as string[]
    ).slice(0, 2)
    doc.text(lineas, TEXTO, y + 13.4, { lineHeightFactor: 1.3 })
    lineas.forEach((l, i) => anotar(y + 13.4 + i * 2.4, l))
    bajo = y + 13.4 + (lineas.length - 1) * 2.4
  }

  /*
    A la derecha, el número del documento y su fecha.

    El primer par va en negro y algo mayor: es el número, y es lo que alguien
    busca cuando tiene el papel en la mano y le preguntan por él. Los demás en
    gris pequeño.
  */
  /*
    CADA DATO SE ENCOGE HASTA CABER EN LO QUE LE DEJAN, Y NO SE MONTA NUNCA.

    Iban alineados a `DER` sin ningún límite por la izquierda, contando con que
    siempre serían cortos. Cuatro papeles ya se pisaban: la cotización por 1,2
    mm —el punto de «C.A.» quedaba bajo la «N» de «N° COTIZACIÓN»—, el libro de
    movimientos por 1,5, y el acta de existencias por 1,9 con el filtro vacío y
    por 35,9 con un almacén de nombre largo, que deja el nombre de la empresa
    ilegible.

    El hueco se mide contra el renglón de la izquierda que comparte su altura,
    no contra uno fijo: el primer dato compite con la razón social, que es
    grande, y los de abajo con el domicilio, que es pequeño.

    Se encoge antes de recortar, que es la regla de toda esta hoja. Y solo si
    ni al mínimo cabe, se recorta el VALOR y no la etiqueta: sin etiqueta, un
    número suelto en una esquina no dice qué es.
  */
  const datos = d.datos ?? []
  datos.forEach(([etiqueta, valor], i) => {
    const alto = y + 2 + i * 4.6

    const choca = ocupado
      .filter((o) => Math.abs(o.base - alto) < 2.3)
      .reduce((max, o) => Math.max(max, o.hasta), TEXTO)
    const hueco = Math.max(DER - choca - 3, 24)

    const base = i === 0 ? 9 : 7
    const minima = i === 0 ? 6.5 : 5.5
    const color = i === 0 ? MARCA : GRIS
    const rotulo = etiqueta.toUpperCase() + ': '

    // El primer par va en negro y algo mayor: es el número, y es lo que alguien
    // busca cuando tiene el papel en la mano y le preguntan por él.
    doc.setFont('helvetica', i === 0 ? 'bold' : 'normal').setTextColor(color)

    let talla = base
    while (talla > minima) {
      doc.setFontSize(talla)
      if (doc.getTextWidth(rotulo + valor) <= hueco) break
      talla -= 0.25
    }
    doc.setFontSize(talla)

    const anchoRotulo = doc.getTextWidth(rotulo)
    const texto = rotulo + ajustar(doc, valor, Math.max(hueco - anchoRotulo, 8))
    doc.text(texto, DER, alto, { align: 'right' })
  })

  /*
    La regla se apoya en lo más bajo que haya: el bloque de la izquierda o los
    datos de la derecha. Con `y + 14` fijo, un domicilio de dos renglones se
    salía por debajo de la raya.
  */
  const finDatos = y + 2 + Math.max(0, (d.datos?.length ?? 1) - 1) * 4.6
  const regla = Math.max(y + 14, bajo + 3.2, finDatos + 3.2)

  // La regla de color, que es lo único teñido de la cabecera.
  doc.setDrawColor(MARCA).setLineWidth(0.8)
  doc.line(IZQ, regla, DER, regla)

  return regla
}

/**
 * El tipo de documento, centrado bajo la regla.
 *
 * Centrado y no a la izquierda: es lo que pide el modelo, y en un papel que se
 * archiva de canto es lo que se lee al abrirlo. A la izquierda competía con el
 * nombre de la empresa, que está justo encima y es más grande.
 */
export function tituloDocumento(doc: Doc, y: number, texto: string, color = ROTULO): number {
  /*
    El título vive en su propia banda, entre dos rayas finas.

    En el modelo no es un renglón suelto: las dos rayas lo separan del membrete
    de arriba y de los datos de abajo, y eso es lo que deja leer la hoja en tres
    golpes —quién la emite, qué es, qué dice— en vez de como un bloque continuo.
  */
  doc.setDrawColor(HAIRLINE).setLineWidth(0.2)
  doc.line(IZQ, y + 3, DER, y + 3)

  /*
    EL COLOR ES OPCIONAL Y CASI NUNCA SE USA.

    Todos los papeles lo dejan en el azul pizarra de la casa. La excepción es la
    nota de entrega, que va naranja: es el papel que el chofer lleva en la mano
    por el patio, y en un fajo de hojas mezcladas el color es lo que deja
    separarla de una factura sin leer ninguna. Ese naranja estaba antes en una
    banda llena de arriba abajo, y al pasar al membrete de la casa se habría
    perdido sin que nadie lo pidiera.
  */
  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(color)
  doc.text(texto.toUpperCase(), IZQ + ANCHO_UTIL / 2, y + 10.5, { align: 'center' })

  doc.line(IZQ, y + 14, DER, y + 14)

  return y + 21
}

/**
 * Una etiqueta teñida: la prioridad, el estado que urge.
 *
 * Se dibuja midiendo el texto en vez de con un ancho fijo, porque «ALTA
 * OPERATIVA» y «NORMAL» no miden lo mismo y una caja fija deja a una nadando y
 * a la otra apretada.
 *
 * Devuelve dónde termina, por si detrás va algo más.
 */
export function chip(doc: Doc, x: number, y: number, texto: string, color = REALCE): number {
  doc.setFont('helvetica', 'bold').setFontSize(7)
  const ancho = doc.getTextWidth(texto.toUpperCase()) + 5

  doc.setFillColor(color)
  doc.roundedRect(x, y - 3.2, ancho, 4.8, 0.8, 0.8, 'F')

  doc.setTextColor('#FFFFFF')
  doc.text(texto.toUpperCase(), x + 2.5, y)

  return x + ancho
}

/**
 * La nota al pie del documento, con su raya punteada encima.
 *
 * Existe porque el modelo la trae y porque hacía falta: es donde se explica lo
 * que el papel NO dice —«los renglones 1 al 5 se excluyeron según indicación»—.
 * Sin ese renglón, un papel al que le faltan cinco líneas parece incompleto en
 * vez de filtrado a propósito.
 */
export function notaAlPie(doc: Doc, y: number, texto: string): number {
  doc.setDrawColor(GRIS_SUAVE).setLineWidth(0.2)
  doc.setLineDashPattern([0.8, 0.8], 0)
  doc.line(IZQ, y, DER, y)
  doc.setLineDashPattern([], 0)

  doc.setFont('helvetica', 'italic').setFontSize(7).setTextColor(GRIS)
  const lineas = doc.splitTextToSize(texto, ANCHO_UTIL) as string[]
  doc.text(lineas, IZQ, y + 4, { lineHeightFactor: 1.35 })

  return y + 4 + lineas.length * 3 + 3
}

/** Una línea con quién emite el papel. Para los documentos cortos. */
export function lineaEmpresa(doc: Doc, y: number, texto: string): number {
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(TINTA)
  doc.text(ajustar(doc, texto, ANCHO_UTIL), IZQ, y)
  return y + 8
}

/**
 * Las dos partes, una enfrente de la otra.
 *
 * A la izquierda quien emite; a la derecha el de fuera, con su rótulo encima.
 * Esa asimetría —solo el de la derecha lleva rótulo— es del modelo, y tiene
 * sentido: quien lee el papel ya sabe de quién le llega, lo que necesita
 * confirmar es que va dirigido a él.
 */
export function dosPartes(
  doc: Doc,
  y: number,
  izquierda: string[],
  derecha: { rotulo: string; lineas: string[] },
): number {
  const medio = IZQ + ANCHO_UTIL / 2

  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(TINTA)
  doc.text(derecha.rotulo, medio, y)

  doc.setFont('helvetica', 'normal').setFontSize(9)
  doc.text(izquierda.slice(0, 4), IZQ, y + 5.5, { lineHeightFactor: 1.5 })
  doc.text(derecha.lineas.slice(0, 4), medio, y + 5.5, { lineHeightFactor: 1.5 })

  const renglones = Math.max(izquierda.length, derecha.lineas.length, 1)
  return y + 5.5 + renglones * 4.8 + 6
}

/** El rótulo de una sección: ÍTEMS, CONDICIONES. */
export function seccion(doc: Doc, y: number, titulo: string): number {
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(ROTULO)
  doc.text(titulo.toUpperCase(), IZQ, y)
  return y + 6
}

/**
 * Filas de etiqueta y valor.
 *
 * El valor puede ocupar varias líneas —una nota larga, una dirección— y la
 * fila crece con él en vez de recortarlo: lo que se recorta en un papel de
 * compras suele ser justo el motivo por el que se pidió.
 */
export function etiquetaValor(
  doc: Doc,
  y: number,
  filas: Array<[string, string | null | undefined]>,
  opciones: { columnas?: 1 | 2 } = {},
): number {
  /*
    DOS COLUMNAS, COMO EL MODELO.

    Las trece condiciones de una orden de compra, una debajo de otra, se comían
    media hoja y empujaban la firma a una segunda página donde no había nada
    más: una orden de compra firmada en una hoja en blanco. El modelo que mandó
    la líder los pone de dos en dos —«SOLICITANTE» y «ESTATUS» en el mismo
    renglón— y con eso el papel entero cabe donde tiene que caber.

    Queda la salida a una sola columna para el desglose del dinero: subtotal,
    descuento, flete e IVA se leen en pila, uno debajo de otro, porque se suman.
    Enfrentados de dos en dos parecerían cuatro datos sueltos.
  */
  const columnas = opciones.columnas ?? 2
  const MITAD = columnas === 2 ? ANCHO_UTIL / 2 : ANCHO_UTIL
  const ANCHO_ETIQUETA = columnas === 2 ? 34 : 55
  const ANCHO_VALOR = MITAD - ANCHO_ETIQUETA - 3

  let fila = y

  for (let i = 0; i < filas.length; i += columnas) {
    let renglones = 1

    filas.slice(i, i + columnas).forEach(([etiqueta, valor], j) => {
      const x = IZQ + j * MITAD

      /*
        La etiqueta en azul pizarra y con dos puntos; el valor en tinta.

        Antes era al revés de lo que pide el modelo: etiqueta negra y valor
        gris, o sea el dato más apagado que su rótulo. Se lee buscando el VALOR,
        así que es el valor el que tiene que resaltar.
      */
      const rotulo = encajar(doc, etiqueta.toUpperCase() + ':', ANCHO_ETIQUETA - 2, 8.5, 'bold', true)
      doc.setTextColor(ROTULO)
      doc.text(rotulo.lineas, x, fila, { lineHeightFactor: 1.4 })

      const dato = encajar(doc, valor || '—', ANCHO_VALOR, 8.5)
      doc.setTextColor(TINTA)
      doc.text(dato.lineas, x + ANCHO_ETIQUETA, fila, { lineHeightFactor: 1.4 })

      renglones = Math.max(renglones, rotulo.lineas.length, dato.lineas.length)
    })

    fila += renglones * 4.3 + 0.6
  }

  return fila + 3
}

/**
 * La tabla, con su cabecera de color y sus filas alternas.
 *
 * Parte de página sola cuando se acaba el papel, y repite la cabecera arriba:
 * una segunda hoja de cifras sin rótulos no se puede leer, y con veinte
 * artículos en un almacén eso pasa siempre.
 */
/** Un texto ya medido: a qué tamaño se dibuja y en qué renglones se reparte. */
export type Celda = { talla: number; lineas: string[] }

/**
 * Encaja un texto en un ancho: ANTES DE PARTIR UNA PALABRA, ENCOGE LA LETRA.
 *
 * `splitTextToSize` reparte por espacios, pero cuando una sola palabra no cabe
 * la corta por donde sea: «HERRAMIEN / TA», «PARE / S», «CANTI / DAD». Eso no es
 * un renglón partido, es una palabra rota, y en un papel impreso se lee como un
 * error de imprenta.
 *
 * Así que primero se busca el tamaño —de ocho a seis puntos— al que la palabra
 * más larga cabe entera, y solo entonces se reparte. Un rótulo dos puntos más
 * pequeño no se nota; una palabra rota sí.
 *
 * Es además la red que faltaba: los anchos se han repartido a mano en cinco
 * documentos, y ya hubo un papel con la cabecera de «Costo unit.» montada
 * encima de la de al lado. Con esto, equivocarse en el reparto cuesta medio
 * punto de letra en vez de un documento ilegible.
 */
export function encajar(
  doc: Doc,
  texto: string,
  util: number,
  base: number,
  estilo: 'bold' | 'normal' = 'normal',
  /*
    Para los rótulos: no basta con no romper palabras, tienen que caber ENTEROS
    en un renglón. «FECHA DE / ENTREGA / PROMETIDA:» está bien partido y aun así
    es un rótulo de tres pisos que hace la fila tres veces más alta que el dato
    que rotula. Con esto se encoge hasta que entra de una vez.
  */
  unaLinea = false,
): Celda {
  const TALLAS = [8.5, 8, 7.5, 7, 6.5, 6]
  const trozos = unaLinea ? [texto || ''] : (texto || '').split(/\s+/).filter(Boolean)

  let talla = base
  for (const t of TALLAS) {
    if (t > base) continue
    talla = t
    doc.setFont('helvetica', estilo).setFontSize(t)
    if (trozos.every((p) => doc.getTextWidth(p) <= util)) break
  }

  doc.setFont('helvetica', estilo).setFontSize(talla)
  return { talla, lineas: doc.splitTextToSize(texto || '', util) as string[] }
}

export function tabla(
  doc: Doc,
  y: number,
  columnas: Columna[],
  filas: string[][],
  pie?: string,
): number {
  /*
    LAS CELDAS SE PARTEN EN VARIOS RENGLONES; NO SE RECORTAN.

    Antes cada celda pasaba por `ajustar`, que corta y pone puntos suspensivos.
    En pantalla eso se tolera —se pasa el ratón por encima y se ve el resto—,
    pero esto es papel: una categoría que dice «SEGURID...» y una unidad que
    dice «P...» quedan así para siempre en el archivador. El modelo que mandó la
    líder parte en dos renglones («SERVICIOS / GENERALES») y hace la fila más
    alta, que es lo único que conserva el dato.

    La consecuencia es que la fila ya no mide siempre lo mismo, y por eso el
    corte de página se calcula contra el alto de ESTA fila y no contra una
    constante. Con la constante, una fila de tres renglones cerca del pie se
    salía de la hoja.
  */
  const ALTO_FILA = 6.5
  const ALTO_RENGLON = 3.4
  let fila = y

  const medir = (textos: string[], base: number, estilo: 'bold' | 'normal'): Celda[] =>
    columnas.map((c, j) => encajar(doc, textos[j] ?? '', c.ancho - 4, base, estilo))

  const altoDe = (celdas: Celda[]) =>
    ALTO_FILA + (Math.max(1, ...celdas.map((c) => c.lineas.length)) - 1) * ALTO_RENGLON

  const pintar = (celdas: Celda[], alto: number, estilo: 'bold' | 'normal') => {
    let x = IZQ + 2
    columnas.forEach((c, j) => {
      doc.setFont('helvetica', estilo).setFontSize(celdas[j].talla)
      doc.text(celdas[j].lineas, c.alDerecha ? x + c.ancho - 4 : x, fila + 4.4, {
        align: c.alDerecha ? 'right' : 'left',
        lineHeightFactor: 1.35,
      })
      x += c.ancho
    })
    fila += alto
  }

  const cabecera = () => {
    // En mayúscula, como el modelo. Una cabecera en minúscula se confunde con
    // la primera fila cuando la tabla es larga y se mira por encima.
    const celdas = medir(columnas.map((c) => c.titulo.toUpperCase()), 7.5, 'bold')
    const alto = altoDe(celdas)

    doc.setFillColor(MARCA)
    doc.rect(IZQ, fila, ANCHO_UTIL, alto, 'F')
    doc.setTextColor('#FFFFFF')
    pintar(celdas, alto, 'bold')
  }

  cabecera()

  filas.forEach((celdas, i) => {
    const medidas = medir(celdas, 8, 'normal')
    const alto = altoDe(medidas)

    // Contra el alto de ESTA fila, no contra una constante: desde que las
    // celdas se reparten en varios renglones, una fila de tres cerca del pie se
    // salía de la hoja.
    if (fila + alto > ABAJO - 30) {
      doc.addPage()
      fila = ARRIBA
      cabecera()
    }

    if (i % 2 === 1) {
      doc.setFillColor(FILA_ALTERNA)
      doc.rect(IZQ, fila, ANCHO_UTIL, alto, 'F')
    }

    doc.setTextColor(TINTA)
    pintar(medidas, alto, 'normal')
  })

  if (pie) {
    doc.setFillColor(FILA_ALTERNA)
    doc.rect(IZQ, fila, ANCHO_UTIL, ALTO_FILA + 1, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(TINTA)
    doc.text(pie, DER - 4, fila + 5, { align: 'right' })
    fila += ALTO_FILA + 1
  }

  return fila + 8
}

/**
 * Un bloque con cabecera teñida y filas alternas de etiqueta y valor.
 *
 * Es la forma del comprobante de pago del modelo: en vez de una tabla de
 * renglones, dos bloques —la orden y el pago— con sus datos en columna. Se
 * lee buscando un dato, no recorriendo filas, y para eso la banda de color
 * separa mejor que un título suelto.
 */
export function bloqueEtiquetado(
  doc: Doc,
  y: number,
  titulo: string,
  filas: Array<[string, string | null | undefined]>,
): number {
  const ALTO = 7
  const ANCHO_ETIQUETA = 55
  let fila = y

  doc.setFillColor(MARCA)
  doc.rect(IZQ, fila, ANCHO_UTIL, ALTO, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor('#FFFFFF')
  doc.text(titulo, IZQ + 3, fila + 4.8)
  fila += ALTO

  filas.forEach(([etiqueta, valor], i) => {
    if (i % 2 === 0) {
      doc.setFillColor(FILA_ALTERNA)
      doc.rect(IZQ, fila, ANCHO_UTIL, ALTO, 'F')
    }

    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(TINTA)
    doc.text(etiqueta, IZQ + 3, fila + 4.8)

    doc.setFont('helvetica', 'normal').setTextColor(GRIS)
    doc.text(
      ajustar(doc, valor || '—', ANCHO_UTIL - ANCHO_ETIQUETA - 6),
      IZQ + ANCHO_ETIQUETA,
      fila + 4.8,
    )
    fila += ALTO
  })

  return fila + 8
}

/** Un lado de la firma: qué se espera ahí y, si la hay, la firma de quien va. */
export interface LadoFirmado {
  /** Lo que va debajo de la raya: «Firma autorizada», «Recibido por…». */
  texto: string
  /** El PNG guardado de esa persona. Sin él la raya se queda en blanco. */
  imagen?: string | null
  /** Quién es. Va debajo del rol, en pequeño, para que el papel diga el nombre. */
  nombre?: string | null
}

/**
 * Las dos rayas de firma, con lo que se espera debajo de cada una.
 *
 * Si quien firma tiene firma guardada, se estampa SOBRE la raya y no encima
 * del hueco: una firma que flota separada de la línea se lee como pegada
 * después. Y va con fondo transparente, por eso no tapa la raya.
 *
 * Sin firma guardada, el papel sale como salía: con la raya en blanco para
 * firmarlo a mano. Es el caso normal el primer mes y no puede verse como que
 * algo falló.
 */
export function firmas(
  doc: Doc,
  y: number,
  izquierda: string | LadoFirmado,
  derecha: string | LadoFirmado,
): void {
  const SEPARA = 20
  const ancho = (ANCHO_UTIL - SEPARA) / 2

  const lados: LadoFirmado[] = [izquierda, derecha].map((l) =>
    typeof l === 'string' ? { texto: l } : l,
  )

  for (const [i, lado] of lados.entries()) {
    const x = IZQ + i * (ancho + SEPARA)

    if (lado.imagen) {
      /*
        La firma se mete en un alto fijo y se centra sobre la raya. El ancho
        sale de la proporción de la imagen —ya viene recortada al trazo— y se
        limita al del hueco: una rúbrica muy alargada invadiría la de al lado.
      */
      const ALTO = 13
      try {
        const props = doc.getImageProperties(lado.imagen)
        const anchoFirma = Math.min(ancho - 4, (props.width / props.height) * ALTO)
        doc.addImage(
          lado.imagen,
          'PNG',
          x + (ancho - anchoFirma) / 2,
          y - ALTO - 0.5,
          anchoFirma,
          ALTO,
        )
      } catch {
        // Una imagen que jsPDF no sabe leer no puede tumbar el documento
        // entero: el papel sale con la raya en blanco, que es firmable.
      }
    }

    doc.setDrawColor(TINTA).setLineWidth(0.4)
    doc.line(x, y, x + ancho, y)

    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(GRIS)
    doc.text(lado.texto, x, y + 4.5)

    if (lado.nombre) {
      doc.setFontSize(7.5).setTextColor(GRIS_SUAVE)
      doc.text(ajustar(doc, lado.nombre, ancho), x, y + 8.6)
    }
  }
}

/**
 * El pie, en todas las páginas.
 *
 * Se escribe al final y recorriendo las páginas ya hechas, porque hasta que el
 * documento no está armado no se sabe cuántas son. Dice de dónde salió el
 * papel: meses después, en una carpeta, es lo único que lo ata al sistema.
 */
export function pieDePagina(doc: Doc, texto: string): void {
  const paginas = doc.getNumberOfPages()

  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p)
    doc.setDrawColor(HAIRLINE).setLineWidth(0.3)
    doc.line(IZQ, PIE - 5, DER, PIE - 5)

    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(GRIS_SUAVE)
    doc.text(texto, IZQ, PIE)
    if (paginas > 1) {
      doc.text(`Página ${p} de ${paginas}`, DER, PIE, { align: 'right' })
    }
  }
}

/** Fecha y hora como las escribe el modelo: «20 ago. 2026, 02:50 p. m.» */
export function fechaLarga(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d)
}

export function fechaCorta(iso: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${iso.slice(0, 10)}T12:00:00`))
}

/**
 * Una sola firma, centrada.
 *
 * La líder lo pidió así para la orden de compra: «quita la firma del proveedor,
 * solo coloca en el medio la del sr Jesús Lozada».
 *
 * Y tiene razón de fondo, no solo de gusto. La raya de «recibido por el
 * proveedor» nunca se llenaba: la orden se manda por correo o por WhatsApp, no
 * se le pone delante a nadie para que la firme. Una raya que sale en blanco en
 * todos los papeles enseña que las rayas de este documento no se firman —y la
 * que sí importa se lee como decorado.
 *
 * Queda una, la de quien autoriza, y en el medio porque a la izquierda con la
 * derecha vacía el papel se ve descuadrado.
 */
export function firmaCentrada(doc: Doc, y: number, lado: string | LadoFirmado): void {
  const l: LadoFirmado = typeof lado === 'string' ? { texto: lado } : lado

  // Poco más de la mitad del ancho útil. A todo lo ancho, la raya parece un
  // subrayado del párrafo de arriba en vez de un sitio donde firmar.
  const ancho = 80
  const x = IZQ + (ANCHO_UTIL - ancho) / 2

  if (l.imagen) {
    const ALTO = 15
    try {
      const props = doc.getImageProperties(l.imagen)
      const anchoFirma = Math.min(ancho - 4, (props.width / props.height) * ALTO)
      doc.addImage(l.imagen, 'PNG', x + (ancho - anchoFirma) / 2, y - ALTO - 0.5, anchoFirma, ALTO)
    } catch {
      // Una imagen que jsPDF no sabe leer no puede tumbar el documento entero.
    }
  }

  doc.setDrawColor(TINTA).setLineWidth(0.4)
  doc.line(x, y, x + ancho, y)

  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(GRIS)
  doc.text(l.texto, x + ancho / 2, y + 4.5, { align: 'center' })

  if (l.nombre) {
    doc.setFontSize(7.5).setTextColor(GRIS_SUAVE)
    doc.text(ajustar(doc, l.nombre, ancho), x + ancho / 2, y + 8.6, { align: 'center' })
  }
}
