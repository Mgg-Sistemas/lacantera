import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { rpc, desenvolver } from '@/lib/api/rpc'

/*
  LA FIRMA DE CADA QUIEN

  Christopher: «cada usuario debería poder guardar su propia firma digital (ya
  sea a mano estilo drawing en un canvas, o tecleado y estilizado con algún
  tipo de letra o cargando una imagen de su firma)».

  Va en la tabla y no en el bucket porque los papeles se arman en el navegador:
  una firma guardada aparte obligaría a pedir una URL firmada a mitad de armar
  cada PDF, y el papel saldría con firma o sin ella según cómo viniera la red.

  Y lo que hay que decir claro: esto NO prueba que alguien firmó. Una firma
  guardada es copiable por cualquiera que la vea. Prueba que el papel salió del
  sistema con el usuario de esa persona; lo que da fe es la auditoría.
*/

export type OrigenDeFirma = 'DIBUJADA' | 'TECLEADA' | 'IMAGEN'

export interface Firma {
  perfil_id: string
  /** El PNG completo como data URL, listo para meterlo en un papel. */
  imagen: string
  origen: OrigenDeFirma
  actualizada_en: string
}

/** La firma propia. Nula mientras no se haya guardado ninguna. */
export function useMiFirma() {
  return useQuery({
    queryKey: ['mi-firma'],
    queryFn: async () => {
      const { data: sesion } = await supabase.auth.getUser()
      const yo = sesion.user?.id
      if (!yo) return null

      return desenvolver<Firma | null>(
        await supabase.from('firmas').select('*').eq('perfil_id', yo).maybeSingle(),
      )
    },
    staleTime: 5 * 60_000,
  })
}

/**
 * Las firmas de todos, por perfil.
 *
 * En una sola consulta y no una por persona: quien arma un papel necesita la
 * de quien lo aprobó, la de quien lo recibió y la suya, y son tres viajes para
 * traer treinta kilobytes.
 */
export function useFirmas() {
  return useQuery({
    queryKey: ['firmas'],
    queryFn: async () => {
      const filas = desenvolver<Firma[]>(await supabase.from('firmas').select('*'))
      return Object.fromEntries(filas.map((f) => [f.perfil_id, f.imagen])) as Record<string, string>
    },
    staleTime: 5 * 60_000,
  })
}

function useAccionFirma<A>(fn: (a: A) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mi-firma'] })
      void qc.invalidateQueries({ queryKey: ['firmas'] })
    },
  })
}

export function useGuardarMiFirma() {
  return useAccionFirma((a: { imagen: string; origen: OrigenDeFirma }) =>
    rpc('guardar_mi_firma', { p_imagen: a.imagen, p_origen: a.origen }),
  )
}

export function useQuitarMiFirma() {
  return useAccionFirma(() => rpc('quitar_mi_firma', {}))
}
