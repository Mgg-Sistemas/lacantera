/*
  UN ZIP DE UN SOLO ARCHIVO, SIN LIBRERÍA.

  Nació el 24/09/2026 de un fallo que se vio en producción el mismo día que
  entró Brevo: el respaldo se mandaba comprimido en gzip y Brevo lo rechazaba.

      [respaldo-por-correo] BREVO HTTP 400 invalid_parameter:
      Unsupported file format: gz

  Brevo tiene lista blanca de extensiones y `gz` no está en ella; `zip` y `tar`
  sí. Resend no mira la extensión, así que con Resend funcionaba y al añadir el
  segundo servicio dejó de funcionar. No es culpa de quien añadió Brevo: es que
  dos servicios de correo no admiten lo mismo y el adjunto estaba atado al que
  había.

  SE ELIGIÓ ZIP Y NO TAR porque tar no comprime. El respaldo son 16,5 MB en
  crudo y Brevo admite mucho menos; comprimido son uno o dos. Y porque un zip lo
  abre Windows con doble clic —que es lo que tiene delante quien recibe el
  correo— mientras que un `.gz` pide instalar algo. El arreglo salió mejor que
  lo que arreglaba.

  ESTÁ ESCRITO A MANO Y SON SETENTA LÍNEAS, por lo mismo que se dijo del gzip en
  `respaldo.ts`: `CompressionStream` es nativo desde 2023 y no hay librería que
  instalar ni que mantener. Un zip de un archivo es una cabecera, los datos y un
  índice; lo caro de un zip son los casos que aquí no hacen falta —varios
  archivos, cifrado, zip64, flujo sin saber el tamaño—.

  OJO: HAY UNA COPIA EN `supabase/functions/respaldo-por-correo/index.ts`, para
  el envío mensual del cron. No se puede compartir el archivo: uno corre en el
  navegador y el otro en Deno, y no se ven entre ellos. Si se toca esto, hay que
  tocar aquello.
*/

/*
  CRC-32, que es lo único del zip que no es rellenar campos.

  La tabla se calcula una vez al cargar. El polinomio invertido 0xEDB88320 es el
  de siempre —el de zip, gzip y PNG—; no hay nada que elegir aquí.
*/
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

/**
 * La fecha, en el formato que guarda un zip.
 *
 * MS-DOS con segundos de dos en dos y el año contado desde 1980. Se podría
 * poner cero y el archivo seguiría siendo válido, pero entonces el explorador
 * de Windows enseña «1/1/1980» y quien mira un respaldo quiere ver cuándo se
 * hizo.
 */
function fechaDos(d: Date): { hora: number; fecha: number } {
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    fecha: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

/**
 * Empaqueta un texto en un zip con un solo archivo dentro.
 *
 * `nombreDentro` es como se llamará el archivo al descomprimirlo —el `.sql`—,
 * no el zip en sí.
 */
export async function zipDeUnArchivo(nombreDentro: string, contenido: string): Promise<Uint8Array> {
  const crudo = new TextEncoder().encode(contenido)
  const crc = crc32(crudo)

  // `deflate-raw` y no `deflate`: un zip guarda el deflate pelado, sin la
  // envoltura zlib. Con `deflate` el archivo se abre mal en la mitad de los
  // programas y bien en la otra mitad, que es peor que no abrirse en ninguno.
  const comprimido = new Uint8Array(
    await new Response(
      new Blob([crudo]).stream().pipeThrough(new CompressionStream('deflate-raw')),
    ).arrayBuffer(),
  )

  const nombre = new TextEncoder().encode(nombreDentro)
  const { hora, fecha } = fechaDos(new Date())

  const LOCAL = 30 + nombre.length
  const CENTRAL = 46 + nombre.length
  const total = LOCAL + comprimido.length + CENTRAL + 22

  const zip = new Uint8Array(total)
  const v = new DataView(zip.buffer)
  let p = 0

  // ── Cabecera del archivo ────────────────────────────────────────────────
  v.setUint32(p, 0x04034b50, true) // firma PK\x03\x04
  v.setUint16(p + 4, 20, true) // versión mínima para abrirlo
  v.setUint16(p + 6, 0, true) // sin banderas
  v.setUint16(p + 8, 8, true) // método: deflate
  v.setUint16(p + 10, hora, true)
  v.setUint16(p + 12, fecha, true)
  v.setUint32(p + 14, crc, true)
  v.setUint32(p + 18, comprimido.length, true)
  v.setUint32(p + 22, crudo.length, true)
  v.setUint16(p + 26, nombre.length, true)
  v.setUint16(p + 28, 0, true) // sin campo extra
  zip.set(nombre, p + 30)
  p += LOCAL

  zip.set(comprimido, p)
  p += comprimido.length

  // ── El índice, que es lo que de verdad lee quien lo abre ────────────────
  const inicioIndice = p
  v.setUint32(p, 0x02014b50, true) // firma PK\x01\x02
  v.setUint16(p + 4, 20, true) // versión con la que se hizo
  v.setUint16(p + 6, 20, true) // versión mínima para abrirlo
  v.setUint16(p + 8, 0, true)
  v.setUint16(p + 10, 8, true)
  v.setUint16(p + 12, hora, true)
  v.setUint16(p + 14, fecha, true)
  v.setUint32(p + 16, crc, true)
  v.setUint32(p + 20, comprimido.length, true)
  v.setUint32(p + 24, crudo.length, true)
  v.setUint16(p + 28, nombre.length, true)
  v.setUint16(p + 30, 0, true) // extra
  v.setUint16(p + 32, 0, true) // comentario
  v.setUint16(p + 34, 0, true) // disco
  v.setUint16(p + 36, 0, true) // atributos internos
  v.setUint32(p + 38, 0, true) // atributos externos
  v.setUint32(p + 42, 0, true) // dónde empieza su cabecera
  zip.set(nombre, p + 46)
  p += CENTRAL

  // ── El final, que dice dónde está el índice ─────────────────────────────
  v.setUint32(p, 0x06054b50, true) // firma PK\x05\x06
  v.setUint16(p + 4, 0, true)
  v.setUint16(p + 6, 0, true)
  v.setUint16(p + 8, 1, true) // archivos en este disco
  v.setUint16(p + 10, 1, true) // archivos en total
  v.setUint32(p + 12, CENTRAL, true)
  v.setUint32(p + 16, inicioIndice, true)
  v.setUint16(p + 20, 0, true) // sin comentario

  return zip
}
