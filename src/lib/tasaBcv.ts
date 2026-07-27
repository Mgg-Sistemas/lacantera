import { useQuery } from '@tanstack/react-query'

/**
 * Tasa oficial del BCV.
 *
 * Se consulta a un agregador público en vez de a bcv.org.ve directamente: el
 * sitio del BCV publica la tasa dentro del HTML de la portada, sin API, y su
 * certificado da problemas con frecuencia. Raspar una portada desde el
 * navegador del usuario no es viable ni fiable.
 *
 * IMPORTANTE — esta tasa es solo para MOSTRAR. La tasa con la que se valora un
 * documento debe resolverse en el servidor contra la tabla `tasas_cambio` y
 * quedar congelada en la fila. Si cada navegador consultara su propia tasa al
 * emitir, dos personas emitiendo a la misma hora podrían valorar distinto.
 */
const ENDPOINT = 'https://ve.dolarapi.com/v1/dolares/oficial'

interface RespuestaApi {
  promedio: number | null
  compra: number | null
  venta: number | null
  fechaActualizacion: string
}

export interface TasaBcv {
  valor: number
  /** Fecha de publicación que reporta la fuente. */
  fecha: Date
  /** `false` si la tasa no es de hoy: hay que avisar antes de registrar nada. */
  vigente: boolean
}

/** Fecha en formato AAAA-MM-DD según el huso de Venezuela. */
function fechaEnCaracas(momento: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(momento)
}

async function obtenerTasaBcv(): Promise<TasaBcv> {
  const respuesta = await fetch(ENDPOINT, { headers: { Accept: 'application/json' } })

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
  }
}

export function useTasaBcv() {
  return useQuery({
    queryKey: ['tasa-bcv'],
    queryFn: obtenerTasaBcv,
    // El BCV publica una vez al día. Consultar más seguido no aporta nada,
    // pero conviene revalidar cada media hora por si publican tarde.
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
    retry: 2,
  })
}
