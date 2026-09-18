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

/** El archivo, listo para enseñar: una URL de objeto que hay que revocar al terminar. */
export async function abrirFotoDeCarga(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !data) throw new Error('No se pudo abrir el archivo.')
  return URL.createObjectURL(data)
}
