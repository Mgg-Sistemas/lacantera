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

  /*
    LO QUE PIDIO LA LIDER: contacto de emergencia, edad, direccion.

    Van EN VIVO y no congelados al emitir, al reves que el nombre y el cargo. El
    telefono al que hay que llamar si alguien se cae en la planta tiene que ser
    el de HOY, no el que estaba en la ficha el dia que se plastifico el carnet:
    un telefono viejo en una emergencia es peor que ninguno, porque se marca y
    se pierde el tiempo.

    Del que ya no trabaja aqui no sale ninguno.
  */
  edad?: number | null
  direccion?: string | null
  telefono?: string | null
  sangre?: string | null
  contacto_emergencia?: string | null
  telefono_emergencia?: string | null
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
 * Dónde vive la página que verifica. NO se adivina.
 *
 * ESTO YA SALIÓ MAL DOS VECES Y POR ESO ESTÁ ESCRITO ASÍ.
 *
 * La primera, escribí una muestra del QR poniendo `lacantera.vercel.app` de
 * ejemplo, dando por hecho que sería el dominio. Existe, y es de otra empresa:
 * al escanearla se llegaba a la aplicación de un desconocido.
 *
 * La segunda, esta constante siguió diciendo `lacantera-omega.vercel.app`
 * después del 4 de septiembre de 2026, cuando la producción pasó al droplet con
 * el dominio propio y Vercel quedó para pruebas. El servidor compila sin
 * `VITE_URL_PUBLICA` —su `lacantera.env` solo trae las dos de Supabase—, así que
 * todo carnet que se imprimió desde el dominio grabó la dirección de pruebas.
 * Esos QR abren mientras Vercel siga publicando, porque la página verifica
 * contra la misma base; el día que no, dejan de abrir. Reimprimirlos da el mismo
 * código con la dirección buena: el QR se arma al imprimir desde aquí, no se guarda.
 *
 * Un QR impreso no se corrige: lo que se grabó en el plástico apunta ahí para
 * siempre. Así que la dirección sale de una constante y no de dónde esté abierta
 * la aplicación: un carnet impreso desde un despliegue de prueba tiene que
 * apuntar igual a producción. Comprobado el 14-sep que el dominio sirve
 * `/version.json` y la página `/v/<código>`.
 *
 * `VITE_URL_PUBLICA` la sobreescribe si algún día hiciera falta otra. Hoy no está
 * puesta en ningún entorno que se conozca, y así conviene: dos sitios que dicen
 * la dirección son dos sitios que se pueden contradecir.
 */
export const URL_PUBLICA = (
  (import.meta.env.VITE_URL_PUBLICA as string | undefined) ?? 'https://mineriainternacionalts.com'
).replace(/\/+$/, '')

export function urlDeVerificacion(codigo: string): string {
  return `${URL_PUBLICA}/v/${codigo}`
}

/**
 * ¿Se está emitiendo desde otro sitio del que va a decir el QR?
 *
 * Pasa al abrir la aplicación en un despliegue de prueba o en el ordenador de
 * alguien. No impide emitir —el QR va a apuntar bien igual, porque sale de la
 * constante— pero quien emite tiene que saber que la dirección impresa no es la
 * que tiene en la barra del navegador.
 */
export function emitiendoDesdeOtroSitio(): boolean {
  return typeof window !== 'undefined' && window.location.origin !== URL_PUBLICA
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
