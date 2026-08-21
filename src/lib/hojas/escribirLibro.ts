/*
  ESCRIBIR UN EXCEL DE VERDAD, SIN LIBRERÍA

  La plantilla se repartía en CSV porque Excel lo abre de un doble clic. Dos
  cosas lo tumbaron:

    - EXCEL NO SEPARABA LAS COLUMNAS. Se escribía con punto y coma dando por
      hecho que Excel en español lo entiende. El de Christopher usa coma como
      separador de lista, así que le metió las doce columnas dentro de la A.
      Una plantilla que hay que repartir a mano en columnas no es una
      plantilla.

    - UN CSV NO TIENE HOJAS. Y hace falta una segunda con las instrucciones,
      porque la leyenda vive en la pantalla y quien llena el archivo lo hace
      con la pantalla cerrada.

  Así que se escribe un `.xlsx`. Un xlsx es un ZIP con XML dentro, y el
  navegador no trae escritor de ZIP — pero un ZIP sin comprimir son cuatro
  cabeceras y un CRC32, que es lo que hay aquí. Sale más barato que arrastrar
  una librería de medio megabyte al paquete que se descarga en un teléfono con
  la señal de la cantera.

  El lector de `leerHoja` ya sabía abrir xlsx. Ahora los dos extremos hablan el
  mismo idioma.
*/

// ---------------------------------------------------------------------------
// El ZIP, sin comprimir
// ---------------------------------------------------------------------------

/** La tabla del CRC32, calculada una vez. */
const TABLA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(datos: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

interface ArchivoDelZip {
  nombre: string
  contenido: string
}

/**
 * Un ZIP con las entradas guardadas tal cual, sin deflate.
 *
 * Comprimir obligaría a implementar deflate o a pasar por `CompressionStream`,
 * que es asíncrono y complicaría todo el armado. Estos archivos son XML de
 * unos pocos kilobytes: el ahorro no paga la complicación, y Excel abre igual
 * un ZIP sin comprimir.
 */
function armarZip(archivos: ArchivoDelZip[]): Blob {
  const codificador = new TextEncoder()
  const trozos: Uint8Array[] = []
  const central: Uint8Array[] = []
  let desplazamiento = 0

  const u16 = (v: number) => new Uint8Array([v & 0xff, (v >> 8) & 0xff])
  const u32 = (v: number) =>
    new Uint8Array([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff])

  const unir = (partes: Uint8Array[]) => {
    const total = partes.reduce((s, p) => s + p.length, 0)
    const salida = new Uint8Array(total)
    let i = 0
    for (const p of partes) {
      salida.set(p, i)
      i += p.length
    }
    return salida
  }

  for (const a of archivos) {
    const nombre = codificador.encode(a.nombre)
    const datos = codificador.encode(a.contenido)
    const suma = crc32(datos)

    const local = unir([
      u32(0x04034b50),
      u16(20), // versión mínima
      u16(0x0800), // el nombre va en UTF-8
      u16(0), // guardado, sin comprimir
      u16(0),
      u16(0), // fecha y hora: no importan y así el archivo es reproducible
      u32(suma),
      u32(datos.length),
      u32(datos.length),
      u16(nombre.length),
      u16(0),
      nombre,
      datos,
    ])

    central.push(
      unir([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(0),
        u16(0),
        u32(suma),
        u32(datos.length),
        u32(datos.length),
        u16(nombre.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(desplazamiento),
        nombre,
      ]),
    )

    trozos.push(local)
    desplazamiento += local.length
  }

  const directorio = unir(central)
  const fin = unir([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(archivos.length),
    u16(archivos.length),
    u32(directorio.length),
    u32(desplazamiento),
    u16(0),
  ])

  return new Blob([unir(trozos) as BlobPart, directorio as BlobPart, fin as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

// ---------------------------------------------------------------------------
// El libro
// ---------------------------------------------------------------------------

/** Los estilos que se usan, por el índice con el que la hoja los pide. */
const ESTILO = {
  normal: 0,
  titulo: 1,
  subtitulo: 2,
  cabecera: 3,
  obligatoria: 4,
  etiqueta: 5,
  parrafo: 6,
} as const

export interface CeldaDeLibro {
  texto: string
  estilo?: number
}

export interface HojaDelLibro {
  nombre: string
  /** Ancho de cada columna, en caracteres. */
  anchos: number[]
  filas: CeldaDeLibro[][]
}

const escapar = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** `0` → `A`, `26` → `AA`. */
function letraDeColumna(n: number): string {
  let s = ''
  let x = n + 1
  while (x > 0) {
    const r = (x - 1) % 26
    s = String.fromCharCode(65 + r) + s
    x = Math.floor((x - 1) / 26)
  }
  return s
}

function xmlDeHoja(hoja: HojaDelLibro): string {
  const cols = hoja.anchos
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('')

  const filas = hoja.filas
    .map((celdas, f) => {
      const cuerpo = celdas
        .map((c, i) =>
          c.texto === '' && !c.estilo
            ? ''
            : `<c r="${letraDeColumna(i)}${f + 1}" s="${c.estilo ?? 0}" t="inlineStr">` +
              `<is><t xml:space="preserve">${escapar(c.texto)}</t></is></c>`,
        )
        .join('')
      return `<row r="${f + 1}">${cuerpo}</row>`
    })
    .join('')

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<cols>${cols}</cols><sheetData>${filas}</sheetData></worksheet>`
  )
}

/*
  Los estilos, escritos a mano.

  Son seis y llegan justo: el título del documento, la línea que explica de qué
  va, la cabecera de la tabla —negrita, blanco sobre el naranja de la casa—, la
  marca de columna obligatoria, la etiqueta de las instrucciones, y el párrafo
  con ajuste de línea para que un texto largo no se salga de su celda.
*/
const ESTILOS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="5">' +
  '<font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="16"/><name val="Calibri"/></font>' +
  '<font><sz val="10"/><color rgb="FF78716C"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
  '</fonts>' +
  '<fills count="4">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFCC3F00"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFDF3EC"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="7">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
  '<xf numFmtId="0" fontId="4" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
  '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">' +
  '<alignment vertical="top" wrapText="1"/></xf>' +
  '</cellXfs></styleSheet>'

export { ESTILO }

/** Arma el libro con sus hojas y devuelve el archivo listo para descargar. */
export function armarLibro(hojas: HojaDelLibro[]): Blob {
  const refs = hojas
    .map(
      (h, i) =>
        `<sheet name="${escapar(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join('')

  const relaciones = hojas
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join('')

  const tiposDeHoja = hojas
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('')

  return armarZip([
    {
      nombre: '[Content_Types].xml',
      contenido:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        tiposDeHoja +
        '</Types>',
    },
    {
      nombre: '_rels/.rels',
      contenido:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    },
    {
      nombre: 'xl/workbook.xml',
      contenido:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets>${refs}</sheets></workbook>`,
    },
    {
      nombre: 'xl/_rels/workbook.xml.rels',
      contenido:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        relaciones +
        `<Relationship Id="rIdEstilos" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    },
    { nombre: 'xl/styles.xml', contenido: ESTILOS_XML },
    ...hojas.map((h, i) => ({
      nombre: `xl/worksheets/sheet${i + 1}.xml`,
      contenido: xmlDeHoja(h),
    })),
  ])
}
