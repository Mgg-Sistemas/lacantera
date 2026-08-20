import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Moneda } from '@/lib/api/tasas'

/**
 * La tasa que publica hoy la fuente de cada moneda.
 *
 * IMPORTANTE — esto es solo para MOSTRAR. La tasa con la que se valora un
 * documento se resuelve en el servidor contra `tasas_cambio` y queda congelada
 * en la fila. Si cada navegador consultara su propia tasa al emitir, dos
 * personas emitiendo a la misma hora podrían valorar distinto.
 *
 * DE DÓNDE SALE CADA UNA, Y POR QUÉ NO TODAS DEL MISMO SITIO
 *
 * El dólar y el euro se piden a un agregador público en vez de a bcv.org.ve:
 * el sitio del BCV publica la tasa dentro del HTML de la portada, sin API, y su
 * certificado da problemas con frecuencia. Raspar una portada desde el
 * navegador del usuario no es viable ni fiable.
 *
 * El USDT no lo publica ningún organismo. Su precio sale del libro P2P de
 * Binance, y esa consulta **no se puede hacer desde el navegador**: comprobado
 * el 20/08/2026, `p2p.binance.com` no manda `Access-Control-Allow-Origin` y el
 * navegador la bloquea. Por eso va por la función `tasa-usdt`, que la pide
 * desde el servidor y devuelve la mediana. Dolarapi sí manda `*`, así que el
 * dólar y el euro se quedan donde estaban.
 */
const DOLARAPI: Record<string, string> = {
  USD: 'https://ve.dolarapi.com/v1/dolares/oficial',
  EUR: 'https://ve.dolarapi.com/v1/euros/oficial',
}

interface RespuestaApi {
  promedio: number | null
  compra: number | null
  venta: number | null
  fechaActualizacion: string
}

export interface TasaEnVivo {
  valor: number
  /** Fecha de publicación que reporta la fuente. */
  fecha: Date
  /** `false` si la tasa no es de hoy: hay que avisar antes de registrar nada. */
  vigente: boolean
  /** Quién la publica, para poder decirlo en pantalla. */
  fuente: string
}

/** Compatibilidad con el nombre viejo. */
export type TasaBcv = TasaEnVivo

/** Fecha en formato AAAA-MM-DD según el huso de Venezuela. */
function fechaEnCaracas(momento: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(momento)
}

async function desdeDolarapi(codigo: string): Promise<TasaEnVivo> {
  const respuesta = await fetch(DOLARAPI[codigo], { headers: { Accept: 'application/json' } })

  if (!respuesta.ok) {
    throw new Error(`La fuente de la tasa respondió ${respuesta.status}`)
  }

  const datos = (await respuesta.json()) as RespuestaApi
  const valor = datos.promedio ?? datos.venta ?? datos.compra

  if (valor === null || !Number.isFinite(valor) || valor <= 0) {
    throw new Error('La fuente no devolvió una tasa utilizable')
  }

  const fecha = new Date(datos.fechaActualizacion)

  return {
    valor,
    fecha,
    vigente: fechaEnCaracas(fecha) === fechaEnCaracas(new Date()),
    fuente: 'BCV',
  }
}

async function desdeBinance(): Promise<TasaEnVivo> {
  const { data, error } = await supabase.functions.invoke<{
    valor: number
    consultado_en: string
  }>('tasa-usdt', { body: { filas: 10 } })

  if (error) throw error
  if (!data || !Number.isFinite(data.valor)) {
    throw new Error('Binance no devolvió una tasa utilizable')
  }

  // El P2P cotiza a cada momento, así que lo que devuelve es siempre de ahora:
  // no hay «tasa de ayer» que avisar como en el BCV.
  return {
    valor: data.valor,
    fecha: new Date(data.consultado_en),
    vigente: true,
    fuente: 'BINANCE_P2P',
  }
}

/**
 * La tasa en vivo de una moneda, si tiene fuente consultable.
 *
 * Se decide por el símbolo y no por el código a propósito: el Tether entró
 * como `UST` porque `monedas.codigo` medía tres, y pasa a `USDT` cuando se
 * ensancha. El símbolo dice `USDT` en los dos casos.
 */
export function useTasaEnVivo(moneda: Moneda | undefined) {
  const codigo = moneda?.codigo ?? ''
  const simbolo = moneda?.simbolo ?? ''
  const porDolarapi = Boolean(DOLARAPI[codigo])
  const porBinance = simbolo === 'USDT'

  return useQuery({
    queryKey: ['tasa-en-vivo', codigo],
    enabled: porDolarapi || porBinance,
    queryFn: () => (porBinance ? desdeBinance() : desdeDolarapi(codigo)),
    // El BCV publica una vez al día; el P2P se mueve todo el rato, pero media
    // hora es suficiente para una cifra que alguien va a mirar antes de
    // registrarla.
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
    retry: 2,
  })
}

/** El dólar, que es lo que enseña la barra. */
export function useTasaBcv() {
  return useQuery({
    queryKey: ['tasa-en-vivo', 'USD'],
    queryFn: () => desdeDolarapi('USD'),
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
    retry: 2,
  })
}
