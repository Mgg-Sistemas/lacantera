/*
  ABRIR UN ARCHIVO SIN ENSEÑAR DÓNDE VIVE

  La dueña, el 9 de noviembre, con la captura de una imagen de solicitud de
  pedido abierta en otra pestaña: «Archivos exponen la dirección y herramienta
  de BD o donde reside el archivo». La barra decía
  `xtvgkhrurcsmoonfzwnv.supabase.co/storage/v1/object/sign/compras-pedidos/…`:
  el proveedor, el proyecto, el depósito y la ruta interna, todo a la vista.

  Por eso ningún archivo guardado se abre ya con su dirección firmada. Se trae
  aquí, se arma en memoria y la pestaña recibe una dirección `blob:` del propio
  sistema, que no dice nada de dónde salió.

  LA VENTANA SE ABRE ANTES DE BAJAR EL ARCHIVO. Si se abriera después de la
  espera, el navegador ya no la cuenta como respuesta al clic y la bloquea
  como emergente. Mientras llega enseña «Abriendo…»; si el navegador la
  bloqueó igual, el archivo se descarga con su nombre en vez de perderse.
*/
import { supabase } from '@/lib/supabase'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'

/** Lo que tarda en soltarse la copia en memoria: de sobra para que la pestaña la cargue. */
const VIDA_DE_LA_COPIA = 60_000

const TIPOS_POR_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  heic: 'image/heic',
  txt: 'text/plain',
}

const extensionDe = (nombre: string): string => {
  const ultima = nombre.split('/').pop() ?? ''
  return ultima.includes('.') ? (ultima.split('.').pop() ?? '').toLowerCase() : ''
}

/** Lo que el navegador sabe enseñar en una pestaña; el resto se descarga. */
const seVeEnPestana = (tipo: string): boolean =>
  tipo.startsWith('image/') || tipo === 'application/pdf' || tipo === 'text/plain'

/**
 * Un nombre para la pestaña y la descarga: el que se dio, o uno genérico con
 * la extensión de la ruta («Comprobante de pago.png»).
 */
export function nombreLegible(path: string, nombre?: string | null, generico = 'Archivo'): string {
  const dado = nombre?.trim()
  if (dado) return dado
  const ext = extensionDe(path)
  return ext ? `${generico}.${ext}` : generico
}

function pintarEspera(ventana: Window, nombre: string) {
  try {
    const d = ventana.document
    d.title = 'Abriendo…'
    d.body.style.cssText =
      'margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font:14px system-ui,sans-serif;color:#555;background:#f4f4f5'
    d.body.textContent = `Abriendo ${nombre}…`
  } catch {
    // Si el navegador no deja tocar la ventana, se queda en blanco: no pasa nada.
  }
}

/*
  La imagen se pinta en una página propia y no navegando a la dirección
  `blob:`: así la pestaña lleva el nombre del archivo y no un identificador
  aleatorio.
*/
function pintarImagen(ventana: Window, url: string, nombre: string) {
  const d = ventana.document
  d.title = nombre
  d.body.style.cssText =
    'margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#18181b'
  const img = d.createElement('img')
  img.src = url
  img.alt = nombre
  img.style.cssText = 'max-width:100%;max-height:100vh;object-fit:contain;background:#fff'
  d.body.replaceChildren(img)
}

function guardarComo(url: string, nombre: string) {
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
}

/** El tipo real del archivo: el que trae, o el de su extensión si vino genérico. */
function conTipo(blob: Blob, nombre: string): Blob {
  if (blob.type && blob.type !== 'application/octet-stream') return blob
  const tipo = TIPOS_POR_EXTENSION[extensionDe(nombre)]
  return tipo ? new Blob([blob], { type: tipo }) : blob
}

/**
 * Abre un archivo en otra pestaña sin enseñar su dirección.
 *
 * Hay que llamarla directamente en el clic (sin `await` antes): la ventana se
 * abre en el acto y el archivo llega después. Lanza si no se pudo traer.
 */
export async function abrirArchivo(traer: () => Promise<Blob>, nombre: string): Promise<void> {
  const ventana = window.open('', '_blank')
  if (ventana) pintarEspera(ventana, nombre)

  let blob: Blob
  try {
    blob = conTipo(await traer(), nombre)
  } catch (e) {
    ventana?.close()
    throw e
  }

  const url = URL.createObjectURL(blob)
  setTimeout(() => URL.revokeObjectURL(url), VIDA_DE_LA_COPIA)

  if (!ventana || ventana.closed || !seVeEnPestana(blob.type)) {
    ventana?.close()
    guardarComo(url, nombre)
    return
  }
  try {
    if (blob.type.startsWith('image/')) pintarImagen(ventana, url, nombre)
    else ventana.location.href = url
  } catch {
    ventana.close()
    guardarComo(url, nombre)
  }
}

/** Descarga un archivo con su nombre, sin pasar por su dirección. Lanza si no se pudo traer. */
export async function descargarArchivo(traer: () => Promise<Blob>, nombre: string): Promise<void> {
  const blob = conTipo(await traer(), nombre)
  const url = URL.createObjectURL(blob)
  guardarComo(url, nombre)
  setTimeout(() => URL.revokeObjectURL(url), VIDA_DE_LA_COPIA)
}

/** Trae un archivo del almacén con la sesión del usuario (mismos permisos que la dirección firmada). */
export async function bajarDeAlmacen(deposito: string, path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(deposito).download(path)
  if (error || !data) throw new Error('No se pudo traer el archivo.')
  return data
}

/** Trae un archivo de una dirección (firmada) para no tener que enseñarla. */
export async function bajarDeDireccion(url: string): Promise<Blob> {
  const respuesta = await fetch(url)
  if (!respuesta.ok) throw new Error('No se pudo traer el archivo.')
  return respuesta.blob()
}

/**
 * Abre un archivo del almacén en otra pestaña; si falla, lo avisa. Para usar
 * tal cual en un `onClick`.
 */
export async function abrirDeAlmacen(
  deposito: string,
  path: string,
  nombre?: string | null,
  generico = 'Archivo',
): Promise<void> {
  try {
    await abrirArchivo(() => bajarDeAlmacen(deposito, path), nombreLegible(path, nombre, generico))
  } catch (e) {
    toast(mensajeDe(e, 'No se pudo abrir el archivo'), 'error')
  }
}
