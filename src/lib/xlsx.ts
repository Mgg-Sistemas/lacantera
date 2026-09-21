/*
  LIBRO DE EXCEL, SIN LIBRERÍA

  Un .xlsx es un zip con seis archivos de XML. Aquí se escribe y se lee lo justo
  para una hoja: texto, números, una cabecera con color y anchos de columna. No
  hay fórmulas, ni fechas de Excel, ni varias hojas; para eso haría falta una
  librería de verdad, y el proyecto no carga ninguna.

  AL ESCRIBIR el zip va sin comprimir: una planilla de mil filas pesa poco y así
  no hace falta un compresor. AL LEER sí se descomprime, porque lo que guarda
  Excel viene comprimido: lo hace el navegador con DecompressionStream.
*/

export type CeldaXlsx = string | number | null

export interface ColumnaXlsx {
  titulo: string
  /** Ancho en caracteres, como lo mide Excel. */
  ancho: number
  /** Cabecera en el color de realce: «esta columna es la que se llena». */
  realce?: boolean
}

export interface HojaXlsx {
  nombre: string
  columnas: ColumnaXlsx[]
  filas: CeldaXlsx[][]
}

const TABLA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(b: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const escapar = (t: string) =>
  t
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    // Lo que XML no admite dentro de un texto.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')

const letraDe = (i: number): string => {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

/** Los colores del sistema: el de la marca en la cabecera, el realce en lo que se llena. */
const MARCA = 'FF8C2F1F'
const REALCE = 'FFE1503C'

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="${MARCA}"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="${REALCE}"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
</styleSheet>`

function xmlDeLaHoja(h: HojaXlsx): string {
  const texto = (ref: string, v: string, estilo: number) =>
    `<c r="${ref}" s="${estilo}" t="inlineStr"><is><t xml:space="preserve">${escapar(v)}</t></is></c>`
  const filas = [
    `<row r="1">${h.columnas.map((c, j) => texto(`${letraDe(j)}1`, c.titulo, c.realce ? 2 : 1)).join('')}</row>`,
    ...h.filas.map((f, i) => {
      const r = i + 2
      const celdas = f.map((v, j) => {
        const ref = `${letraDe(j)}${r}`
        if (v === null || v === '') return ''
        if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}" s="3"><v>${v}</v></c>` : ''
        // Estilo de texto: un RIF o un número de nota no deben volverse número.
        return texto(ref, v, 4)
      })
      return `<row r="${r}">${celdas.join('')}</row>`
    }),
  ]
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${h.columnas.map((c, j) => `<col min="${j + 1}" max="${j + 1}" width="${c.ancho}" customWidth="1"/>`).join('')}</cols>
<sheetData>${filas.join('')}</sheetData>
</worksheet>`
}

export function escribirXlsx(hoja: HojaXlsx): Blob {
  const nombre = escapar(hoja.nombre.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Hoja')
  const archivos: [string, string][] = [
    [
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ],
    [
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      'xl/workbook.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${nombre}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    ['xl/styles.xml', ESTILOS],
    ['xl/worksheets/sheet1.xml', xmlDeLaHoja(hoja)],
  ]

  const cod = new TextEncoder()
  const trozos: Uint8Array[] = []
  const indice: Uint8Array[] = []
  let desplazamiento = 0

  for (const [ruta, contenido] of archivos) {
    const nombreBytes = cod.encode(ruta)
    const datos = cod.encode(contenido)
    const crc = crc32(datos)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // nombres en UTF-8
    local.setUint16(8, 0, true) // sin comprimir
    local.setUint16(10, 0, true)
    local.setUint16(12, 0x21, true) // 1980-01-01: la fecha del zip no importa
    local.setUint32(14, crc, true)
    local.setUint32(18, datos.length, true)
    local.setUint32(22, datos.length, true)
    local.setUint16(26, nombreBytes.length, true)
    local.setUint16(28, 0, true)

    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(4, 20, true)
    central.setUint16(6, 20, true)
    central.setUint16(8, 0x0800, true)
    central.setUint16(10, 0, true)
    central.setUint16(12, 0, true)
    central.setUint16(14, 0x21, true)
    central.setUint32(16, crc, true)
    central.setUint32(20, datos.length, true)
    central.setUint32(24, datos.length, true)
    central.setUint16(28, nombreBytes.length, true)
    central.setUint32(42, desplazamiento, true)

    trozos.push(new Uint8Array(local.buffer), nombreBytes, datos)
    indice.push(new Uint8Array(central.buffer), nombreBytes)
    desplazamiento += 30 + nombreBytes.length + datos.length
  }

  const largoIndice = indice.reduce((s, b) => s + b.length, 0)
  const fin = new DataView(new ArrayBuffer(22))
  fin.setUint32(0, 0x06054b50, true)
  fin.setUint16(8, archivos.length, true)
  fin.setUint16(10, archivos.length, true)
  fin.setUint32(12, largoIndice, true)
  fin.setUint32(16, desplazamiento, true)

  return new Blob([...trozos, ...indice, new Uint8Array(fin.buffer)] as BlobPart[], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/* ───────────────────────────────────────────────────────────────── leer */

async function inflar(datos: Uint8Array): Promise<Uint8Array> {
  const flujo = new Blob([datos as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(flujo).arrayBuffer())
}

const PARTES_QUE_SE_LEEN = /^xl\/(worksheets\/[^/]+\.xml|sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels)$/

async function abrirZip(bufer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const v = new DataView(bufer)
  const bytes = new Uint8Array(bufer)
  let fin = -1
  for (let i = bufer.byteLength - 22; i >= 0 && i >= bufer.byteLength - 65557; i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      fin = i
      break
    }
  }
  if (fin < 0) throw new Error('El archivo no es un libro de Excel (.xlsx).')

  const cuantos = v.getUint16(fin + 10, true)
  let p = v.getUint32(fin + 16, true)
  const deco = new TextDecoder()
  const salida = new Map<string, Uint8Array>()

  for (let i = 0; i < cuantos; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('El libro de Excel está dañado.')
    const metodo = v.getUint16(p + 10, true)
    const comprimido = v.getUint32(p + 20, true)
    const largoNombre = v.getUint16(p + 28, true)
    const largoExtra = v.getUint16(p + 30, true)
    const largoComentario = v.getUint16(p + 32, true)
    const local = v.getUint32(p + 42, true)
    const ruta = deco.decode(bytes.subarray(p + 46, p + 46 + largoNombre))
    p += 46 + largoNombre + largoExtra + largoComentario

    // Solo interesan la hoja y sus textos: lo demás ni se descomprime.
    if (!PARTES_QUE_SE_LEEN.test(ruta)) continue
    const inicio = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    const crudo = bytes.subarray(inicio, inicio + comprimido)
    if (metodo === 0) salida.set(ruta, crudo)
    else if (metodo === 8) salida.set(ruta, await inflar(crudo))
    else throw new Error('El libro usa una compresión que no se sabe leer.')
  }
  return salida
}

const desescapar = (t: string) =>
  t
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
    // Excel escribe así los caracteres de control: _x000D_ es un retorno.
    .replace(/_x([0-9a-fA-F]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))

/** Todos los <t> de un trozo, sin la guía fonética. */
const textoDe = (xml: string): string =>
  [...xml.replace(/<rPh[\s>].*?<\/rPh>/gs, '').matchAll(/<t(?:\s[^>]*)?>(.*?)<\/t>/gs)]
    .map((m) => desescapar(m[1]))
    .join('')

/**
 * La primera hoja del libro, como filas de textos. Un número llega como lo
 * guarda Excel —«25.5», con punto—; una celda vacía, como texto vacío.
 */
export async function leerXlsx(bufer: ArrayBuffer): Promise<string[][]> {
  const zip = await abrirZip(bufer)
  const deco = new TextDecoder()
  const leer = (ruta: string) => {
    const b = zip.get(ruta)
    return b ? deco.decode(b) : null
  }

  // La primera hoja según el libro, no según el nombre del archivo: Excel
  // puede llamar sheet2.xml a la que el usuario ve primero.
  let ruta = 'xl/worksheets/sheet1.xml'
  const libro = leer('xl/workbook.xml')
  const enlaces = leer('xl/_rels/workbook.xml.rels')
  const rid = libro?.match(/<sheet\s[^>]*?r:id="([^"]+)"/)?.[1]
  if (rid && enlaces) {
    const enlace = [...enlaces.matchAll(/<Relationship\s[^>]*?>/g)]
      .map((m) => m[0])
      .find((r) => r.includes(`Id="${rid}"`))
    const destino = enlace?.match(/Target="([^"]+)"/)?.[1]
    if (destino) ruta = destino.startsWith('/') ? destino.slice(1) : `xl/${destino}`
  }
  const hoja = leer(ruta) ?? leer([...zip.keys()].find((k) => k.startsWith('xl/worksheets/')) ?? '')
  if (!hoja) throw new Error('El libro no tiene ninguna hoja.')

  const compartidos = [...(leer('xl/sharedStrings.xml') ?? '').matchAll(/<si>(.*?)<\/si>|<si\/>/gs)].map((m) =>
    textoDe(m[1] ?? ''),
  )

  const filas: string[][] = []
  for (const f of hoja.matchAll(/<row(?:\s[^>]*?)?(?:\/>|>(.*?)<\/row>)/gs)) {
    const numero = Number(f[0].match(/\sr="(\d+)"/)?.[1] ?? filas.length + 1)
    const fila: string[] = []
    for (const c of (f[1] ?? '').matchAll(/<c\s([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
      const ref = c[1].match(/(?:^|\s)r="([A-Z]+)\d+"/)?.[1]
      const tipo = c[1].match(/(?:^|\s)t="([^"]+)"/)?.[1]
      const dentro = c[2] ?? ''
      const v = dentro.match(/<v>(.*?)<\/v>/s)?.[1]
      let valor = ''
      if (tipo === 's') valor = compartidos[Number(v)] ?? ''
      else if (tipo === 'inlineStr') valor = textoDe(dentro)
      else if (v !== undefined) valor = desescapar(v)
      const col = ref ? [...ref].reduce((s, l) => s * 26 + l.charCodeAt(0) - 64, 0) - 1 : fila.length
      fila[col] = valor
    }
    filas[numero - 1] = Array.from(fila, (x) => x ?? '')
  }
  return Array.from(filas, (x) => x ?? [])
}

/**
 * Un CSV como filas de textos. Adivina el separador por la primera línea —Excel
 * en español usa punto y coma— y lee tanto UTF-8 como el Windows-1252 con que
 * Excel guarda cuando se le pide «CSV» a secas.
 */
export function leerCsv(bufer: ArrayBuffer): string[][] {
  let texto: string
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bufer)
  } catch {
    texto = new TextDecoder('windows-1252').decode(bufer)
  }
  texto = texto.replace(/^﻿/, '')
  const primera = texto.slice(0, texto.search(/\r?\n|$/))
  const sep = [';', '\t', ','].reduce((a, b) => (primera.split(b).length > primera.split(a).length ? b : a))

  const filas: string[][] = []
  let fila: string[] = []
  let celda = ''
  let comillas = false
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]
    if (comillas) {
      if (ch === '"' && texto[i + 1] === '"') {
        celda += '"'
        i++
      } else if (ch === '"') comillas = false
      else celda += ch
    } else if (ch === '"' && celda === '') comillas = true
    else if (ch === sep) {
      fila.push(celda)
      celda = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++
      fila.push(celda)
      filas.push(fila)
      fila = []
      celda = ''
    } else celda += ch
  }
  if (celda !== '' || fila.length > 0) {
    fila.push(celda)
    filas.push(fila)
  }
  return filas
}

/** Lee lo que se suba: libro de Excel o CSV, según lo que sea de verdad. */
export async function leerHoja(archivo: File): Promise<string[][]> {
  const bufer = await archivo.arrayBuffer()
  // Un .xlsx es un zip, y un zip empieza por «PK».
  const esZip = new DataView(bufer).byteLength > 4 && new DataView(bufer).getUint16(0, true) === 0x4b50
  return esZip ? leerXlsx(bufer) : leerCsv(bufer)
}

/** Baja un archivo armado en memoria. */
export function bajarArchivo(blob: Blob, nombre: string): void {
  const enlace = document.createElement('a')
  enlace.href = URL.createObjectURL(blob)
  enlace.download = nombre
  enlace.click()
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000)
}
