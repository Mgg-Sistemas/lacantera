import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

export interface TasaRegistrada {
  id: number
  moneda_origen: string
  moneda_destino: string
  fecha: string
  tasa: string
  fuente: string
  registrado_en: string
}

/** Fecha de hoy en Venezuela, en formato AAAA-MM-DD. */
export function hoyEnCaracas(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function useTasasRegistradas(limite = 60) {
  return useQuery({
    queryKey: ['tasas', limite],
    queryFn: async () =>
      desenvolver<TasaRegistrada[]>(
        await supabase
          .from('tasas_cambio')
          .select('*')
          .order('fecha', { ascending: false })
          .order('id', { ascending: false })
          .limit(limite),
      ),
  })
}

/**
 * La tasa con la que la base valora los documentos de hoy.
 *
 * Se consulta aparte de la del BCV en vivo porque son dos cosas distintas: la
 * de arriba informa, esta compromete. Si no coinciden, alguien tiene que
 * registrar la del día antes de emitir.
 */
export function useTasaVigente() {
  return useQuery({
    queryKey: ['tasa-vigente'],
    queryFn: async () => {
      const filas = await rpc<
        { tasa: string; fecha: string; fuente: string; arrastrada: boolean }[]
      >('obtener_tasa', {
        p_origen: 'USD',
        p_destino: 'VES',
        p_fecha: hoyEnCaracas(),
        p_fuente: 'BCV',
      })

      return filas?.[0] ?? null
    },
    staleTime: 5 * 60_000,
  })
}

export function useRegistrarTasa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (t: { fecha: string; tasa: number; fuente?: string }) =>
      rpc<number>('registrar_tasa', {
        p_origen: 'USD',
        p_destino: 'VES',
        p_fecha: t.fecha,
        p_tasa: t.tasa,
        p_fuente: t.fuente ?? 'BCV',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasas'] })
      void qc.invalidateQueries({ queryKey: ['tasa-vigente'] })
    },
  })
}
