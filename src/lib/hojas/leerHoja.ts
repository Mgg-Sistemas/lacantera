/*
  LEER UNA PLANILLA SIN TRAERSE MEDIA LIBRERÍA

  La plantilla que reparte el sistema es un `.csv`, que Excel abre de un doble
  clic. Pero mucha gente le da a «Guardar como» y elige `.xlsx` por costumbre, y
  entonces el archivo que sube ya no es el que descargó. Rechazarlo por eso es
  justo el tipo de fricción del que se quejó la líder de sistemas, así que aquí
  se leen los dos.

  El `.xlsx` es un ZIP con XML dentro. No hace falta una librería de 600 KB para
  eso: el navegador ya sabe descomprimir —`DecompressionStream('deflate-raw')`—
  y ya sabe leer XML —`DOMParser`—. Lo único que hay que escribir es el índice
  del ZIP, que son cuarenta líneas.

  Se lee la primera hoja y nada más. Una plantilla con dos hojas es una
  plantilla mal entendida, y adivinar cuál vale sería peor que decirlo.
*/

/** Una fila, ya emparejada con los nombres de la cabecera. */
export type FilaDeHoja = Record<string, string>

export interface HojaLeida {
  cabecera: string[]
  filas: FilaDeHoja[]
}

export class ErrorDePlanilla extends Error {}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * El separador no se supone: se cuenta.
 *
 * Excel en español guarda con punto y coma, Excel en inglés con coma, y quien
 * exporta de otro sistema a veces usa tabulador. Gana el que más veces aparece
 * en la cabecera, que es la línea que menos texto libre tiene.
 */
function separadorDe(cabecera: string): ';' | ',' | '\t' {
  const cuenta = (c: string) => cabecera.split(c).length - 1
  const candidatos: Array<[';' | ',' | '\t', number]> = [
    [';', cuenta(';')],
    [',', cuenta(',')],
    ['\t', cuenta('\t')],
  ]
  candidatos.sort((a, b) => b[1] - a[1])
  return candidatos[0][1] > 0 ? candidatos[0][0] : ';'
}

/**
 * Un CSV de verdad, con comillas.
 *
 * Se recorre carácter a carácter en vez de partir por el separador porque un
 * nombre de artículo puede llevarlo dentro —«ACEITE 15W40, GALÓN»— y partir a
 * lo bruto correría todas las columnas de esa fila una posición.
 */
function partirCsv(texto: string, sep: string): string[][] {
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let dentroDeComillas = false

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]

    if (dentroDeComillas) {
      if (c === '"') {
        // Dos comillas seguidas dentro de un campo son una comilla literal.
        if (texto[i + 1] === '"') {
          campo += '"'
          i++
        } else {
          dentroDeComillas = false
        }
      } else {
        campo += c
      }
      continue
    }

    if (c === '"') {
      dentroDeComillas = true
    } else if (c === sep) {
      fila.push(campo)
      campo = ''
    } else if (c === '\n') {
      fila.push(campo)
      filas.push(fila)
      fila = []
      campo = ''
    } else if (c !== '\r') {
      campo += c
    }
  }

  if (campo !== '' || fila.length > 0) {
    fila.push(campo)
    filas.push(fila)
  }

  return filas
}

// ---------------------------------------------------------------------------
// XLSX — un ZIP con XML dentro
// ---------------------------------------------------------------------------

const FIRMA_ZIP = 0x04034b50
const FIRMA_DIRECTORIO = 0x02014b50
const FIRMA_FIN = 0x06054b50

interface EntradaZip {
  nombre: string
  metodo: number
  desplazamiento: number
  comprimido: number
}

/**
 * El índice del ZIP se lee por el final.
 *
 * Un ZIP no se lee de principio a fin: al final trae el «directorio central»
 * con dónde empieza cada archivo. Se busca su marca hacia atrás porque después
 * puede venir un comentario de longitud variable.
 */
function indiceDelZip(datos: DataView): EntradaZip[] {
  let fin = -1
  for (let i = datos.byteLength - 22; i >= 0; i--) {
    if (datos.getUint32(i, true) === FIRMA_FIN) {
      fin = i
      break
    }
  }
  if (fin < 0) throw new ErrorDePlanilla('El archivo no parece un Excel válido.')

  const cuantas = datos.getUint16(fin + 10, true)
  let p = datos.getUint32(fin + 16, true)
  const entradas: EntradaZip[] = []

  for (let n = 0; n < cuantas; n++) {
    if (datos.getUint32(p, true) !== FIRMA_DIRECTORIO) break

    const metodo = datos.getUint16(p + 10, true)
    const comprimido = datos.getUint32(p + 20, true)
    const largoNombre = datos.getUint16(p + 28, true)
    const largoExtra = datos.getUint16(p + 30, true)
    const largoComentario = datos.getUint16(p + 32, true)
    const desplazamiento = datos.getUint32(p + 42, true)

    const nombre = new TextDecoder().decode(
      new Uint8Array(datos.buffer, datos.byteOffset + p + 46, largoNombre),
    )

    entradas.push({ nombre, metodo, desplazamiento, comprimido })
    p += 46 + largoNombre + largoExtra + largoComentario
  }

  return entradas
}

async function sacarDelZip(
  bytes: Uint8Array,
  datos: DataView,
  entrada: EntradaZip,
): Promise<string> {
  const p = entrada.desplazamiento
  if (datos.getUint32(p, true) !== FIRMA_ZIP) {
    throw new ErrorDePlanilla('El archivo está dañado y no se puede abrir.')
  }

  // La cabecera local repite el nombre y el extra, y sus longitudes pueden no
  // coincidir con las del directorio. Hay que leerlas de aquí.
  const largoNombre = datos.getUint16(p + 26, true)
  const largoExtra = datos.getUint16(p + 28, true)
  const inicio = p + 30 + largoNombre + largoExtra
  const crudo = bytes.subarray(inicio, inicio + entrada.comprimido)

  // Método 0: guardado tal cual. Método 8: deflate.
  if (entrada.metodo === 0) return new TextDecoder().decode(crudo)

  const flujo = new Blob([crudo as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  return new Response(flujo).text()
}

/** `AB12` → 27. La letra es base 26 sin cero. */
function columnaDe(referencia: string): number {
  const letras = referencia.replace(/[0-9]/g, '')
  let n = 0
  for (const l of letras) n = n * 26 + (l.charCodeAt(0) - 64)
  return n - 1
}

async function leerXlsx(archivo: File): Promise<string[][]> {
  if (typeof DecompressionStream === 'undefined') {
    throw new ErrorDePlanilla(
      'Este navegador no sabe abrir archivos .xlsx. Guarda la planilla como CSV y vuelve a subirla.',
    )
  }

  const bytes = new Uint8Array(await archivo.arrayBuffer())
  const datos = new DataView(bytes.buffer)
  const entradas = indiceDelZip(datos)

  const hoja =
    entradas.find((e) => e.nombre === 'xl/worksheets/sheet1.xml') ??
    entradas.find((e) => e.nombre.startsWith('xl/worksheets/'))
  if (!hoja) throw new ErrorDePlanilla('El Excel no trae ninguna hoja.')

  // Excel guarda el texto una sola vez en una tabla aparte y en las celdas
  // deja el número de fila de esa tabla. Sin ella solo se leerían los números.
  const tabla = entradas.find((e) => e.nombre === 'xl/sharedStrings.xml')
  let compartidas: string[] = []
  if (tabla) {
    const xml = new DOMParser().parseFromString(
      await sacarDelZip(bytes, datos, tabla),
      'application/xml',
    )
    compartidas = [...xml.getElementsByTagName('si')].map((si) =>
      [...si.getElementsByTagName('t')].map((t) => t.textContent ?? '').join(''),
    )
  }

  const xml = new DOMParser().parseFromString(
    await sacarDelZip(bytes, datos, hoja),
    'application/xml',
  )

  return [...xml.getElementsByTagName('row')].map((fila) => {
    const salida: string[] = []
    for (const celda of [...fila.getElementsByTagName('c')]) {
      const donde = columnaDe(celda.getAttribute('r') ?? '')
      const tipo = celda.getAttribute('t')
      let valor = ''

      if (tipo === 's') {
        const i = Number(celda.getElementsByTagName('v')[0]?.textContent ?? -1)
        valor = compartidas[i] ?? ''
      } else if (tipo === 'inlineStr') {
        valor = [...celda.getElementsByTagName('t')].map((t) => t.textContent ?? '').join('')
      } else {
        valor = celda.getElementsByTagName('v')[0]?.textContent ?? ''
      }

      // Excel omite las celdas vacías, así que la posición hay que rellenarla:
      // sin esto una fila con la descripción en blanco correría las columnas.
      while (salida.length < donde) salida.push('')
      salida[donde] = valor
    }
    return salida
  })
}

// ---------------------------------------------------------------------------

/**
 * Lee la planilla y empareja cada fila con la cabecera.
 *
 * Los nombres de columna se normalizan —minúscula, sin tildes, con guion bajo—
 * para que «Stock mínimo», «stock_minimo» y «STOCK MINIMO» sean la misma
 * columna. Quien llena una planilla no tiene por qué respetar mayúsculas.
 */
export interface OpcionesDeLectura {
  /**
   * La columna que identifica cada fila: `codigo`, `cedula`, `rif`.
   *
   * Sirve para encontrar la cabecera. Desde que la plantilla lleva título y
   * subtítulo, la cabecera ya no está en la fila 1, y tomar la primera fila
   * con contenido daría «carga de artículos — minería internacional ts» como
   * nombre de la primera columna y ninguna otra. Todas las filas saldrían
   * vacías y el informe diría «falta el código» en todas — un error cierto
   * que no explica nada.
   */
  claveEsperada?: string
  /** Las columnas que la plantilla debería traer, para avisar de las que no. */
  columnasEsperadas?: string[]
}

export interface HojaLeidaConAvisos extends HojaLeida {
  /** Columnas de la plantilla que el archivo no trae. */
  faltan: string[]
  /** En qué fila del archivo estaba la cabecera. Para poder decirlo. */
  filaDeCabecera: number
}

/**
 * Cuántas filas se admiten de una vez.
 *
 * No es capricho: todo el lote viaja como un solo `jsonb` y se valida y se
 * escribe en una transacción. Un archivo de diez mil filas no falla con un
 * mensaje: se queda pensando hasta que el navegador o la base cortan, y quien
 * lo subió no sabe si cargó, si va a cargar, o si tiene que volver a
 * intentarlo. Mejor decirlo antes de empezar.
 */
const TOPE_DE_FILAS = 2000

export async function leerHoja(
  archivo: File,
  opciones: OpcionesDeLectura = {},
): Promise<HojaLeidaConAvisos> {
  const nombre = archivo.name.toLowerCase()
  let celdas: string[][]

  if (nombre.endsWith('.xlsx')) {
    celdas = await leerXlsx(archivo)
  } else if (nombre.endsWith('.xls')) {
    throw new ErrorDePlanilla(
      'El formato .xls es de Excel 97 y no se puede leer. Ábrelo y guárdalo como .xlsx.',
    )
  } else if (nombre.endsWith('.csv') || nombre.endsWith('.txt')) {
    // El BOM que Excel escribe delante se colaría dentro del primer nombre de
    // columna y esa columna no coincidiría con ninguna.
    const texto = (await archivo.text()).replace(/^﻿/, '')
    const primera = texto.split('\n')[0] ?? ''
    celdas = partirCsv(texto, separadorDe(primera))
  } else {
    throw new ErrorDePlanilla(
      'Ese archivo no es una planilla. Se admiten .xlsx y .csv, que es lo que descarga el botón de la plantilla.',
    )
  }

  const conContenido = celdas.filter((f) => f.some((c) => c.trim() !== ''))
  if (conContenido.length === 0) throw new ErrorDePlanilla('La planilla está vacía.')

  const normalizar = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')

  /*
    LA CABECERA SE BUSCA, NO SE SUPONE

    Se toma la primera fila que contenga la columna clave. Así da igual cuántas
    líneas de título lleve la plantilla por encima, y da igual que alguien
    añada una nota suya arriba —que lo hará—.

    Sin clave que buscar, se cae a la vieja regla: la primera fila con algo.
  */
  const clave = opciones.claveEsperada ? normalizar(opciones.claveEsperada) : null
  let indiceCabecera = 0

  if (clave) {
    const encontrada = conContenido.findIndex((f) => f.some((c) => normalizar(c) === clave))
    if (encontrada < 0) {
      throw new ErrorDePlanilla(
        `No encuentro la fila de columnas: en ninguna parte del archivo aparece «${opciones.claveEsperada}». ` +
          'Vuelve a bajar la plantilla y llena esa, sin cambiarle los nombres a las columnas.',
      )
    }
    indiceCabecera = encontrada
  }

  const cabecera = conContenido[indiceCabecera].map(normalizar)

  const filas = conContenido.slice(indiceCabecera + 1).map((celda) => {
    const fila: FilaDeHoja = {}
    cabecera.forEach((nombreColumna, i) => {
      if (nombreColumna) fila[nombreColumna] = (celda[i] ?? '').trim()
    })
    return fila
  })

  if (filas.length > TOPE_DE_FILAS) {
    throw new ErrorDePlanilla(
      `La planilla trae ${filas.length} filas y el máximo por archivo es ${TOPE_DE_FILAS}. ` +
        'Pártela en varias y súbelas una detrás de otra: cada una se comprueba y se carga por su cuenta.',
    )
  }

  const faltan = (opciones.columnasEsperadas ?? []).filter((c) => !cabecera.includes(normalizar(c)))

  return { cabecera, filas, faltan, filaDeCabecera: indiceCabecera + 1 }
}
