import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from '@/lib/api/rpc'
import { fotoRecortada, type Encuadre } from '@/lib/ficha/encuadre'

/*
  EL CARNET COMO DOCUMENTO EMITIDO, NO COMO IMPRESIÓN

  Hasta ahora «el carnet» era una imagen que salía de la ficha: se bajaba, se
  imprimía y ahí acababa el asunto para el sistema. Ahora es un documento con
  vida propia — se emite, tiene un código, y se anula.

  Lo pidió la líder a partir del carnet de otra empresa, cuyo QR abre una página
  con los datos del empleado. Christopher decidió lo que lo cambia todo: el QR
  no apunta al trabajador sino a ESTA emisión concreta. Si el plástico se pierde
  se anula, se emite otro, y el perdido escanea como no válido.
*/

export interface Carnet {
  id: number
  empleado_id: number
  codigo: string
  estado: 'VIGENTE' | 'ANULADO'
  emitido_por: string | null
  emitido_en: string
  anulado_por: string | null
  anulado_en: string | null
  anulado_motivo: string | null
}

/** Lo que devuelve la página pública. Es lo único que se publica sin sesión. */
export interface CarnetVerificado {
  existe: boolean
  vigente?: boolean
  /**
   * Por qué NO vale, como CATEGORIA y nunca como texto libre.
   *
   * Antes la base devolvia la nota que teclea nomina —«se lo robaron en el
   * terminal»— y eso acababa publicado en internet al lado de una cara y una
   * cedula. Ahora sale una de dos palabras que escribe la propia funcion.
   */
  causa?: 'ANULADO' | 'EGRESADO' | null
  nombre?: string
  cedula?: string
  cargo?: string
  ficha?: string
  departamento?: string | null
  desde?: string
  foto?: string | null
  emitido_en?: string
  empresa?: { razonSocial: string; rif: string }
}

/** El carnet vigente de una persona, si tiene alguno. */
export function useCarnetVigente(empleadoId: number | null | undefined) {
  return useQuery({
    enabled: empleadoId !== null && empleadoId !== undefined,
    queryKey: ['carnets', 'vigente', empleadoId],
    queryFn: async () => {
      const filas = await desenvolver<Carnet[]>(
        await supabase
          .from('carnets')
          .select('*')
          .eq('empleado_id', empleadoId!)
          .eq('estado', 'VIGENTE')
          .limit(1),
      )
      return filas[0] ?? null
    },
  })
}

/** Todo lo que se le ha emitido a alguien, para ver qué se anuló y por qué. */
export function useHistorialDeCarnets(empleadoId: number | null | undefined) {
  return useQuery({
    enabled: empleadoId !== null && empleadoId !== undefined,
    queryKey: ['carnets', 'historial', empleadoId],
    queryFn: async () =>
      desenvolver<Carnet[]>(
        await supabase
          .from('carnets')
          .select('*')
          .eq('empleado_id', empleadoId!)
          .order('emitido_en', { ascending: false }),
      ),
  })
}

function useAccionCarnet<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['carnets'] })
    },
  })
}

/**
 * Emite un carnet y devuelve su código.
 *
 * `foto` es la que se va a imprimir, ya reducida. Se guarda con la emisión
 * porque la página pública no puede leer el almacén —los buckets son privados—
 * y porque así se enseña la foto QUE LLEVA ESE CARNET: si alguien despega el
 * plástico y cambia el retrato, la comparación lo delata.
 */
export function useEmitirCarnet() {
  return useAccionCarnet((p: { empleado_id: number; motivo?: string | null; foto?: string | null }) =>
    rpc<string>('emitir_carnet', {
      p_empleado_id: p.empleado_id,
      p_motivo: p.motivo ?? null,
      p_foto: p.foto ?? null,
    }),
  )
}

export function useAnularCarnet() {
  return useAccionCarnet((p: { empleado_id: number; motivo: string }) =>
    rpc<number>('anular_carnet', { p_empleado_id: p.empleado_id, p_motivo: p.motivo }),
  )
}

/**
 * Verificar un carnet SIN sesión.
 *
 * Es la única llamada del sistema que hace un navegador sin haber entrado. No
 * usa el ayudante `rpc` de la casa a propósito: aquel traduce los errores
 * pensando en un operador que está dentro del sistema —«Tu usuario no tiene
 * permiso»— y quien abre esto no tiene usuario ni sabe qué es un permiso.
 */
export async function verificarCarnet(codigo: string): Promise<CarnetVerificado> {
  const { data, error } = await supabase.rpc('verificar_carnet', { p_codigo: codigo })

  if (error) {
    throw new Error(
      error.message?.includes('Failed to fetch')
        ? 'No hay conexión. Revisa la señal del teléfono e inténtalo otra vez.'
        : 'No se pudo comprobar el carnet en este momento.',
    )
  }

  return (data ?? { existe: false }) as CarnetVerificado
}

/**
 * La dirección que se imprime dentro del QR.
 *
 * Sale de dónde esté servida la aplicación, no de una constante: así el carnet
 * que se imprime desde producción apunta a producción sin que nadie tenga que
 * acordarse de nada. `VITE_URL_PUBLICA` existe para el día que el sistema viva
 * en un dominio y los carnets deban apuntar a otro.
 *
 * OJO CON DÓNDE SE IMPRIME. Un carnet impreso desde un despliegue de prueba
 * lleva la dirección de ese despliegue grabada en el plástico para siempre. Por
 * eso la pantalla que emite enseña la dirección completa antes de emitir, en vez
 * de esconderla: es lo único que evita ese error, y no se puede arreglar
 * después.
 */
export function urlDeVerificacion(codigo: string): string {
  const base = (import.meta.env.VITE_URL_PUBLICA as string | undefined) ?? window.location.origin
  return `${base.replace(/\/+$/, '')}/v/${codigo}`
}

/**
 * La foto, reducida a lo que cabe en una emisión.
 *
 * NO SE RECORTA A MANO: se llama a `fotoRecortada`, que es la misma cuenta que
 * usa el previo de la pantalla y la que se imprime. Escribí primero mi propia
 * versión con `drawImage` y salió enredada y con la escala mal; el sistema ya
 * tenía resuelto exactamente esto y no había por qué volver a resolverlo.
 *
 * Se pide el mismo hueco que en el carnet —24 × 27 mm— pero a 250 dpi en vez de
 * 300, que da unos 236 × 266 píxeles. Es el triple de lo que mide en la pantalla
 * del que verifica, así que la cara se compara igual de bien, y el data URL baja
 * a unos veinte kilobytes.
 */
export function fotoParaVerificar(img: HTMLImageElement, encuadre: Encuadre): string {
  return fotoRecortada(img, 24, 27, encuadre, 250, 0.72)
}
