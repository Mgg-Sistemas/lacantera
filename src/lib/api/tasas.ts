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

/**
 * Las monedas con las que de verdad se puede operar.
 *
 * POR QUÉ NO ES UNA LISTA FIJA
 *
 * Dos pantallas ofrecían euros en un desplegable escrito a mano. Elegirlo no
 * hacía nada malo —la base rechaza el documento con «No hay tasa BCV de EUR a
 * bolívares»— pero ofrecer algo que siempre falla es peor que no ofrecerlo:
 * quien lo elige descubre el problema después de llenar el formulario entero.
 *
 * Una moneda se puede usar cuando hay con qué convertirla. El bolívar y el
 * dólar siempre están —el sistema se mide en dólares y la tasa BCV es la del
 * par USD/VES—; cualquier otra aparece el día que se le registre una tasa, y
 * desaparece sola si nunca se le registra.
 */
export function useMonedasUsables() {
  return useQuery({
    queryKey: ['monedas-usables'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const filas = desenvolver<Array<{ moneda_origen: string }>>(
        await supabase.from('tasas_cambio').select('moneda_origen'),
      )

      const nombres: Record<string, string> = {
        USD: 'Dólares',
        VES: 'Bolívares',
        EUR: 'Euros',
      }

      const codigos = ['USD', 'VES', ...filas.map((f) => f.moneda_origen)]
      return [...new Set(codigos)].map((c) => ({
        valor: c,
        etiqueta: nombres[c] ?? c,
      }))
    },
  })
}
