import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
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

export interface Moneda {
  codigo: string
  nombre: string
  simbolo: string
  decimales: number
  es_curso_legal: boolean
  /** De dónde sale su tasa: BCV, PARALELO, INTERNA o CONTRACTUAL. */
  fuente_tasa: string
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

/*
  EL CATÁLOGO MANDA, Y NO UNA LISTA ESCRITA A MANO

  La pantalla de tasas solo dejaba registrar el dólar porque el front mandaba
  `p_origen: 'USD'` fijo, no porque la base lo impidiera. Y las monedas estaban
  escritas a mano en siete sitios distintos, así que añadir una obligaba a
  acordarse de los siete.

  Ahora sale de `monedas`. El día que entre otra —o que el USDT deje de llamarse
  `UST` cuando se ensanche el código—, la pantalla se entera sola.
*/
export function useMonedas() {
  return useQuery({
    queryKey: ['monedas'],
    staleTime: 10 * 60_000,
    queryFn: async () =>
      desenvolver<Moneda[]>(
        await supabase
          .from('monedas')
          .select('codigo, nombre, simbolo, decimales, es_curso_legal, fuente_tasa')
          .eq('activa', true)
          .order('es_curso_legal', { ascending: false })
          .order('codigo'),
      ),
  })
}

/**
 * Las monedas a las que se les puede registrar una tasa.
 *
 * El bolívar queda fuera: es la moneda contra la que se mide todo lo demás, y
 * su tasa contra sí mismo es 1 por definición. Registrarla no significaría
 * nada.
 */
export function useMonedasConTasa() {
  const monedas = useMonedas()
  return {
    ...monedas,
    data: monedas.data?.filter((m) => m.codigo !== 'VES'),
  }
}

export function useTasasRegistradas(limite = 60, origen?: string) {
  return useQuery({
    queryKey: ['tasas', limite, origen ?? 'todas'],
    queryFn: async () => {
      let consulta = supabase
        .from('tasas_cambio')
        .select('*')
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })
        .limit(limite)

      if (origen) consulta = consulta.eq('moneda_origen', origen)

      return desenvolver<TasaRegistrada[]>(await consulta)
    },
  })
}

export interface TasaVigente {
  tasa: string
  fecha: string
  fuente: string
  arrastrada: boolean
}

/**
 * La tasa con la que la base valora los documentos de hoy.
 *
 * Se consulta aparte de la del BCV en vivo porque son dos cosas distintas: la
 * de arriba informa, esta compromete. Si no coinciden, alguien tiene que
 * registrar la del día antes de emitir.
 */
export function useTasaVigente(origen = 'USD', fuente = 'BCV') {
  return useQuery({
    queryKey: ['tasa-vigente', origen, fuente],
    queryFn: async () => {
      const filas = await rpc<TasaVigente[]>('obtener_tasa', {
        p_origen: origen,
        p_destino: 'VES',
        p_fecha: hoyEnCaracas(),
        p_fuente: fuente,
      })

      return filas?.[0] ?? null
    },
    staleTime: 5 * 60_000,
  })
}

/**
 * La tasa vigente de varias monedas a la vez.
 *
 * Va con `enabled` porque el indicador de la barra solo necesita las demás
 * cuando alguien lo despliega. Pedirlas en cada carga de página sería una
 * consulta por moneda para un dato que casi nadie mira.
 */
export function useTasasVigentes(monedas: Moneda[] | undefined, activo: boolean) {
  return useQueries({
    queries: (monedas ?? []).map((m) => ({
      queryKey: ['tasa-vigente', m.codigo, m.fuente_tasa],
      queryFn: async () => {
        const filas = await rpc<TasaVigente[]>('obtener_tasa', {
          p_origen: m.codigo,
          p_destino: 'VES',
          p_fecha: hoyEnCaracas(),
          p_fuente: m.fuente_tasa,
        })

        return filas?.[0] ?? null
      },
      staleTime: 5 * 60_000,
      enabled: activo,
    })),
    combine: (resultados) => ({
      // Cada moneda con su tasa, o con null si nadie se la ha registrado.
      datos: (monedas ?? []).map((m, i) => ({ moneda: m, tasa: resultados[i]?.data ?? null })),
      cargando: resultados.some((r) => r.isPending && r.fetchStatus !== 'idle'),
    }),
  })
}

export function useRegistrarTasa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (t: { origen: string; fecha: string; tasa: number; fuente: string }) =>
      rpc<number>('registrar_tasa', {
        p_origen: t.origen,
        p_destino: 'VES',
        p_fecha: t.fecha,
        p_tasa: t.tasa,
        p_fuente: t.fuente,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasas'] })
      void qc.invalidateQueries({ queryKey: ['tasa-vigente'] })
      void qc.invalidateQueries({ queryKey: ['monedas-usables'] })
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
export type MonedaUsable = { valor: string; etiqueta: string; simbolo: string }

/**
 * La misma lista, dicha en símbolos.
 *
 * Para los sitios donde la moneda comparte fila con un monto y no hay ancho
 * para «Dólar estadounidense»: el sueldo del tabulador, el salario de una
 * ficha, el monto de una novedad. Es una función y no otro gancho a propósito
 * — la consulta ya está hecha, esto solo elige qué columna se pinta.
 */
export function enSimbolos(lista: MonedaUsable[] | undefined) {
  return (lista ?? []).map((m) => ({ valor: m.valor, etiqueta: m.simbolo }))
}

export function useMonedasUsables() {
  return useQuery({
    queryKey: ['monedas-usables'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [conTasa, catalogo] = await Promise.all([
        supabase.from('tasas_cambio').select('moneda_origen'),
        supabase.from('monedas').select('codigo, nombre, simbolo').eq('activa', true),
      ])

      const filas = desenvolver<Array<{ moneda_origen: string }>>(conTasa)
      const monedas = desenvolver<Array<{ codigo: string; nombre: string; simbolo: string }>>(
        catalogo,
      )

      // El nombre sale del catálogo y no de un mapa aquí dentro: cuando el
      // USDT deje de llamarse `UST`, esta lista no hay que tocarla.
      const porCodigo = new Map(monedas.map((m) => [m.codigo, m]))
      const codigos = ['USD', 'VES', ...filas.map((f) => f.moneda_origen)]

      /*
        Viaja el nombre y el símbolo, y elige quien pinta.

        En un desplegable ancho cabe «Dólar estadounidense» y se lee mejor. En
        una columna estrecha —el sueldo del tabulador, el monto de una novedad—
        ese nombre parte la etiqueta de al lado en dos líneas y descuadra la
        fila entera. Ahí manda el símbolo.
      */
      return [...new Set(codigos)].map((c): MonedaUsable => ({
        valor: c,
        etiqueta: porCodigo.get(c)?.nombre ?? c,
        simbolo: porCodigo.get(c)?.simbolo ?? c,
      }))
    },
  })
}
