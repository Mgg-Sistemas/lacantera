import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/**
 * La empresa y sus papeles.
 *
 * Los archivos van a un bucket PRIVADO. Eso obliga a pedir una dirección
 * firmada cada vez que alguien quiere abrir uno: una dirección pública sería
 * eterna y compartible, y el acta de alianza con la Gobernación no es algo que
 * deba quedar colgado de un enlace que cualquiera reenvía.
 */
const BUCKET = 'documentos-legales'

export interface Empresa {
  rif: string
  razon_social: string
  domicilio_fiscal: string | null
  ciudad: string | null
  estado: string | null
  zona_postal: string | null
  inscrito_el: string | null
  rif_actualizado_el: string | null
  rif_vence_el: string | null
  gerencia_seniat: string | null
  comprobante_rif: string | null
  condicion_iva: string | null
  retencion_iva_pct: number | null
  telefono: string | null
  correo: string | null
  actualizado_en: string
}

export function useEmpresa() {
  return useQuery({
    queryKey: ['empresa'],
    queryFn: async () =>
      desenvolver(await supabase.from('empresa').select('*').eq('id', 1).single()),
  })
}

export function useGuardarEmpresa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (e: Partial<Empresa> & { rif: string; razon_social: string }) =>
      rpc<void>('guardar_empresa', {
        p_rif: e.rif,
        p_razon_social: e.razon_social,
        p_domicilio_fiscal: e.domicilio_fiscal || null,
        p_ciudad: e.ciudad || null,
        p_estado: e.estado || null,
        p_zona_postal: e.zona_postal || null,
        p_inscrito_el: e.inscrito_el || null,
        p_rif_actualizado_el: e.rif_actualizado_el || null,
        p_rif_vence_el: e.rif_vence_el || null,
        p_gerencia_seniat: e.gerencia_seniat || null,
        p_comprobante_rif: e.comprobante_rif || null,
        p_condicion_iva: e.condicion_iva || null,
        p_retencion_iva_pct: e.retencion_iva_pct ?? null,
        p_telefono: e.telefono || null,
        p_correo: e.correo || null,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['empresa'] }),
  })
}

export interface TipoDocumento {
  codigo: string
  nombre: string
  caduca: boolean
  orden: number
}

export function useTiposDocumento() {
  return useQuery({
    queryKey: ['tipos-documento'],
    queryFn: async () =>
      desenvolver(
        await supabase
          .from('tipos_documento_legal')
          .select('codigo, nombre, caduca, orden')
          .eq('activo', true)
          .order('orden'),
      ) as TipoDocumento[],
    // El catálogo no cambia en toda una jornada.
    staleTime: 60 * 60_000,
  })
}

export interface DocumentoLegal {
  id: number
  tipo: string
  nombre: string
  archivo_path: string
  mime: string | null
  bytes: number | null
  emitido_el: string | null
  vence_el: string | null
  nota: string | null
  subido_en: string
}

export function useDocumentos() {
  return useQuery({
    queryKey: ['documentos-legales'],
    queryFn: async () =>
      desenvolver(
        await supabase
          .from('empresa_documentos')
          .select('*')
          .order('subido_en', { ascending: false }),
      ) as DocumentoLegal[],
  })
}

/**
 * Sube el archivo y solo después lo anota.
 *
 * En ese orden a propósito: si la subida falla no queda una fila apuntando a un
 * archivo que no existe, que es un renglón en la lista que al pulsarlo no abre
 * nada. Al revés el fallo es más benigno —un archivo huérfano que nadie ve— y
 * si la anotación falla, se borra el archivo recién subido y no queda rastro.
 */
export function useSubirDocumento() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (d: {
      tipo: string
      nombre: string
      archivo: File
      emitido_el?: string
      vence_el?: string
      nota?: string
    }) => {
      const extension = d.archivo.name.split('.').pop()?.toLowerCase() ?? 'pdf'
      // El nombre en el almacén no es el nombre visible: dos actas pueden
      // llamarse igual, y una ruta repetida pisaría la anterior.
      const ruta = `${d.tipo}/${crypto.randomUUID()}.${extension}`

      const { error } = await supabase.storage.from(BUCKET).upload(ruta, d.archivo, {
        contentType: d.archivo.type || 'application/pdf',
        upsert: false,
      })
      if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`)

      try {
        return await rpc<number>('registrar_documento_legal', {
          p_tipo: d.tipo,
          p_nombre: d.nombre,
          p_archivo: ruta,
          p_mime: d.archivo.type || null,
          p_bytes: d.archivo.size,
          p_emitido_el: d.emitido_el || null,
          p_vence_el: d.vence_el || null,
          p_nota: d.nota || null,
        })
      } catch (e) {
        await supabase.storage.from(BUCKET).remove([ruta])
        throw e
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['documentos-legales'] }),
  })
}

export function useEliminarDocumento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      // La función devuelve la ruta justamente para poder llevarse el archivo.
      const ruta = await rpc<string>('eliminar_documento_legal', { p_id: id })
      if (ruta) await supabase.storage.from(BUCKET).remove([ruta])
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['documentos-legales'] }),
  })
}

/** Baja el archivo para verlo en el visor. Nunca deja una dirección pública. */
export async function descargarDocumento(ruta: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(BUCKET).download(ruta)
  if (error) throw new Error(`No se pudo abrir el documento: ${error.message}`)
  return data
}

/** Días que faltan para que venza. Negativo si ya venció; null si no caduca. */
export function diasParaVencer(vence: string | null): number | null {
  if (!vence) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const fin = new Date(`${vence}T00:00:00`)
  return Math.round((fin.getTime() - hoy.getTime()) / 86_400_000)
}
