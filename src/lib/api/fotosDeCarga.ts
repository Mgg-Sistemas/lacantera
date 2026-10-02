import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/*
  LAS FOTOS DEL CAMIÓN QUE SE LLEVA EL MATERIAL.

  Angélica, 18/09/2026: «en el módulo de salidas, despachos, permite añadir 4
  imágenes en formato de imagen o pdf, para poder adjuntar las fotos de los
  vehículos que se llevarán lo despachado o la salida. Esto no va en el pdf que
  se imprime, pero sí se podrá ver en el histórico, con su trazabilidad».

  Van colgadas del número de la salida (SS-…) o del despacho (SD-…), y nunca se
  borran: quitar una la deja a la vista, tachada, con quién, cuándo y por qué.
*/

export type OrigenDeCarga = 'SALIDA' | 'DESPACHO'

export const MAXIMO_DE_ARCHIVOS = 4
export const TIPOS_ADMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
export const PESO_MAXIMO = 10 * 1024 * 1024

const BUCKET = 'cargas'

export interface FotoDeCarga {
  id: number
  origen: OrigenDeCarga
  referencia: string
  path: string
  nombre: string | null
  tipo: string
  tamano: number | null
  subida_por: string | null
  subida_en: string
  quitada_por: string | null
  quitada_en: string | null
  motivo_quitada: string | null
}

/** Todas las de un origen de una vez: una consulta por pantalla, no una por tarjeta. */
export function useFotosDeCarga(origen: OrigenDeCarga) {
  return useQuery({
    queryKey: ['fotos-de-carga', origen],
    queryFn: async () =>
      desenvolver<FotoDeCarga[]>(
        await supabase
          .from('fotos_de_carga')
          .select('*')
          .eq('origen', origen)
          .order('subida_en'),
      ),
  })
}

/** Por qué no se admite un archivo, o null si vale. */
export function problemaDelArchivo(f: File): string | null {
  if (!TIPOS_ADMITIDOS.includes(f.type)) return `${f.name}: solo fotos (JPG, PNG, WEBP) o PDF.`
  if (f.size > PESO_MAXIMO) return `${f.name}: pesa más de 10 MB.`
  return null
}

/*
  LA MINIATURA SE GUARDA AL SUBIR, NO SE FABRICA AL MIRAR.

  Antes la versión chica se le pedía a Storage al vuelo, con su transformación
  de imagen —encogerla al firmar la dirección—. Eso Supabase lo cobra por
  imagen y por mes, y el contador se pasó del tope del plan: la lista de fotos
  de carga es lo ÚNICO del sistema que tocaba esa transformación.

  Ahora la miniatura se fabrica UNA vez, en el navegador de quien sube, y se
  guarda al lado del original. Verla es bajar un archivo de pocos kilobytes,
  sin transformación ninguna: el contador deja de subir.

  Se guarda cuadrada y recortada al centro, al DOBLE del lado en que se ve —una
  pantalla de densidad doble convierte 80 puntos en 160 píxeles, y una placa a
  80 se vería lavada— y en JPEG, que para una miniatura pesa una fracción.

  Es un lujo, no un requisito: si fabricarla o guardarla falla, la subida del
  original NO se cae, y mirarla baja el original, como se hacía antes. Los PDF
  no llevan miniatura: la transformación era de imágenes, y quien la pide ya
  los distingue.
*/
const LADO_MINIATURA = 80

/** La miniatura vive junto al original, con su mismo nombre más `.thumb.jpg`. */
const rutaMiniatura = (path: string) => `${path}.thumb.jpg`

/** Una miniatura cuadrada, recortada al centro, hecha en el navegador. */
async function fabricarMiniatura(fuente: Blob): Promise<Blob> {
  const lado = LADO_MINIATURA * 2
  // `from-image`: respeta la orientación EXIF, para que la foto de un celular
  // no salga acostada. La transformación de Storage ya lo hacía; esto la iguala.
  const bitmap = await createImageBitmap(fuente, { imageOrientation: 'from-image' })
  try {
    // «cover»: se llena el cuadrado y se recorta lo que sobra, sin franjas.
    const escala = Math.max(lado / bitmap.width, lado / bitmap.height)
    const ancho = bitmap.width * escala
    const alto = bitmap.height * escala
    const lienzo = document.createElement('canvas')
    lienzo.width = lado
    lienzo.height = lado
    const pincel = lienzo.getContext('2d')
    if (!pincel) throw new Error('El navegador no da un lienzo para la miniatura.')
    pincel.drawImage(bitmap, (lado - ancho) / 2, (lado - alto) / 2, ancho, alto)
    const blob = await new Promise<Blob | null>((listo) => lienzo.toBlob(listo, 'image/jpeg', 0.6))
    if (!blob) throw new Error('No se pudo codificar la miniatura.')
    return blob
  } finally {
    bitmap.close()
  }
}

/**
 * Sube los archivos y los anota en la base, en ese orden.
 *
 * Se anota uno por uno: si el tercero falla, los dos primeros quedan bien
 * puestos y el error dice cuál no entró. Un archivo subido que no llega a
 * anotarse queda suelto en el bucket, que no le miente a nadie.
 */
export async function subirFotosDeCarga(
  origen: OrigenDeCarga,
  referencias: string[],
  archivos: File[],
) {
  for (const archivo of archivos) {
    const extension = archivo.name.split('.').pop()?.toLowerCase() || 'bin'
    const ruta = `${origen.toLowerCase()}/${crypto.randomUUID()}.${extension}`
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(ruta, archivo, { contentType: archivo.type, upsert: false })
    if (error) throw new Error(`No se pudo subir ${archivo.name}: ${error.message}`)

    // La miniatura, solo para imágenes y sin tumbar la subida si falla: el
    // original ya está puesto, que es lo que de verdad importa.
    if (archivo.type.startsWith('image/')) {
      try {
        const mini = await fabricarMiniatura(archivo)
        await supabase.storage
          .from(BUCKET)
          .upload(rutaMiniatura(ruta), mini, { contentType: 'image/jpeg', upsert: true })
      } catch {
        /* sin miniatura guardada: verla bajará el original, como antes */
      }
    }

    // Una salida de varios almacenes son varias solicitudes: el mismo archivo va a todas.
    for (const referencia of referencias) {
      await rpc('adjuntar_foto_de_carga', {
        p_origen: origen,
        p_referencia: referencia,
        p_path: ruta,
        p_nombre: archivo.name,
        p_tipo: archivo.type,
        p_tamano: archivo.size,
      })
    }
  }
}

export function useSubirFotosDeCarga() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: { origen: OrigenDeCarga; referencias: string[]; archivos: File[] }) =>
      subirFotosDeCarga(a.origen, a.referencias, a.archivos),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['fotos-de-carga'] }),
  })
}

export function useQuitarFotoDeCarga() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (q: { id: number; motivo: string }) =>
      rpc<void>('quitar_foto_de_carga', { p_id: q.id, p_motivo: q.motivo }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['fotos-de-carga'] }),
  })
}

export async function miniaturaDeFotoDeCarga(path: string): Promise<string> {
  // La versión chica que se guardó al subir. SIN transformación: una dirección
  // firmada a un archivo que ya existe, que es lo que no se cobra.
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(rutaMiniatura(path), 600)
  // Sin miniatura guardada —una foto de antes de este cambio—: se lanza para
  // que quien llama baje el original, que es justo lo que su red ya hace.
  if (error || !data) throw new Error('No hay miniatura guardada.')
  return data.signedUrl
}

/** El archivo entero, para abrirlo. Una URL de objeto que hay que revocar al terminar. */
export async function abrirFotoDeCarga(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !data) throw new Error('No se pudo abrir el archivo.')
  return URL.createObjectURL(data)
}

/*
  LAS FOTOS DE ANTES DE ESTE CAMBIO SE REPARAN SOLAS AL MIRARLAS.

  Una foto subida antes del guardado de miniaturas no tiene su `.thumb.jpg`, y
  sin esto bajaría su original entero cada vez que se mira. Aquí, la primera
  vez que alguien CON permiso la ve, se baja el original UNA vez, se fabrica la
  miniatura que faltaba, se guarda para siempre, y se muestra ya la chica.

  Así no hace falta un repaso aparte ni credenciales de servidor: el arreglo
  corre en el navegador de quien ya tiene la sesión y el permiso, y cada foto
  se cura la primera vez que de verdad se necesita.

  Si guardar la miniatura falla —un usuario de solo lectura—, no pasa nada: se
  ve igual de chica esta vez, y la próxima la curará quien sí pueda escribir.
  Y si ni fabricarla se puede, quien llama cae a bajar el original, como antes.
*/
export async function repararMiniatura(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !data) throw new Error('No se pudo abrir el archivo.')
  const mini = await fabricarMiniatura(data)
  try {
    await supabase.storage
      .from(BUCKET)
      .upload(rutaMiniatura(path), mini, { contentType: 'image/jpeg', upsert: true })
  } catch {
    /* solo lectura: se ve chica igual, y otro la guardará después */
  }
  return URL.createObjectURL(mini)
}
