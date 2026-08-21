import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { rpc, desenvolver } from '@/lib/api/rpc'

/*
  LOS PAPELES QUE LLEGAN CON UNA COMPRA

  Comprobante de pago, nota de entrega, factura. Llegan en momentos distintos y
  de manos distintas —tesorería paga, almacén recibe, compras archiva— y por
  eso cuelgan de la orden y no de la factura: la orden es el único documento
  presente en los tres momentos.

  Se guardan en el bucket que ya existía para las facturas del proveedor. Es
  privado, admite PDF e imágenes —incluido HEIC, que es lo que sale de un
  iPhone— y tener dos sitios para el mismo papel sería tener dos sitios donde
  buscarlo.
*/

const BUCKET = 'facturas-proveedor'

export type TipoDePapel = 'COMPROBANTE_PAGO' | 'NOTA_ENTREGA' | 'FACTURA' | 'OTRO'

export const TIPOS_DE_PAPEL: Array<{ valor: TipoDePapel; etiqueta: string; dice: string }> = [
  {
    valor: 'COMPROBANTE_PAGO',
    etiqueta: 'Comprobante de pago',
    dice: 'La captura de la transferencia, el voucher, el recibo del banco.',
  },
  {
    valor: 'NOTA_ENTREGA',
    etiqueta: 'Nota de entrega',
    dice: 'El papel que trajo el camión y que firmó quien recibió.',
  },
  {
    valor: 'FACTURA',
    etiqueta: 'Factura del proveedor',
    dice: 'La fiscal. Es la única que da derecho al crédito del IVA.',
  },
  { valor: 'OTRO', etiqueta: 'Otro papel', dice: 'Cualquier otra cosa que convenga guardar.' },
]

export interface PapelDeCompra {
  id: number
  orden_id: number
  tipo: TipoDePapel
  archivo_path: string
  archivo_nombre: string
  nota: string | null
  subido_por: string | null
  subido_en: string
}

export function usePapelesDeCompra(ordenId: number | null | undefined) {
  return useQuery({
    enabled: ordenId !== null && ordenId !== undefined,
    queryKey: ['compras', 'papeles', ordenId],
    queryFn: async () =>
      desenvolver<PapelDeCompra[]>(
        await supabase
          .from('compras_papeles')
          .select('*')
          .eq('orden_id', ordenId!)
          .order('subido_en', { ascending: false }),
      ),
  })
}

function useAccionPapeles<A>(fn: (a: A) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['compras'] })
    },
  })
}

/**
 * Sube el archivo primero y lo registra después.
 *
 * En ese orden y no al revés: si se registrara primero y la subida fallara,
 * quedaría una fila apuntando a un archivo que no existe, y quien la abriera
 * vería un error sin saber por qué. Al revés, lo peor que queda es un archivo
 * huérfano en el bucket, que no engaña a nadie.
 */
export function useAdjuntarPapel() {
  return useAccionPapeles(
    async (a: { orden_id: number; tipo: TipoDePapel; archivo: File; nota?: string | null }) => {
      // El nombre viaja aparte: en la ruta se limpia para que no rompa, y el
      // original se guarda para poder devolvérselo tal cual al descargarlo.
      const limpio = a.archivo.name.replace(/[^\w.-]+/g, '_').slice(-80)
      const ruta = `orden-${a.orden_id}/${Date.now()}-${limpio}`

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(ruta, a.archivo, { contentType: a.archivo.type, upsert: false })
      if (error) throw error

      try {
        return await rpc<number>('adjuntar_papel_de_compra', {
          p_orden_id: a.orden_id,
          p_tipo: a.tipo,
          p_archivo_path: ruta,
          p_archivo_nombre: a.archivo.name,
          p_nota: a.nota ?? null,
        })
      } catch (e) {
        // Si la base lo rechaza, el archivo se va con él. Un bucket que
        // acumula lo que nadie registró acaba costando dinero por basura.
        await supabase.storage.from(BUCKET).remove([ruta])
        throw e
      }
    },
  )
}

export function useQuitarPapel() {
  return useAccionPapeles(async (a: { id: number }) => {
    const ruta = await rpc<string>('quitar_papel_de_compra', { p_id: a.id })
    if (ruta) await supabase.storage.from(BUCKET).remove([ruta])
  })
}

/**
 * Una dirección temporal para mirar el papel.
 *
 * El bucket es privado, así que no hay URL pública que valga. Se firma por
 * cinco minutos: lo que dura mirar un documento, no lo que dura un enlace
 * reenviado por correo.
 */
export async function enlaceDelPapel(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300)
  if (error) throw error
  return data.signedUrl
}
