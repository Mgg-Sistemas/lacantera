import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/**
 * Los requisitos de documentación: qué papeles se le piden a quien viene a una
 * entrevista.
 *
 * NO SON LOS TIPOS DE DOCUMENTO DEL EXPEDIENTE, aunque se llamen igual, y la
 * diferencia costó una conversación entera. El usuario lo dijo así: «comparten
 * nombres e intención, la diferencia es el momento; esos documentos en nómina
 * son cuando el empleado ya entró, esta otra lista intenta informar al
 * trabajador sobre qué cosas debe proveer para posteriormente cargar en
 * sistema».
 *
 * Por eso viven en sus propias tablas y no en `tipos_documento_personal`, que
 * es a donde apuntaba la idea al principio. Dos razones, y las dos son del uso:
 *
 * 1. AQUÍ SE BORRA DE VERDAD. «Este tipo de documentos solo se imprime en el
 *    sistema, no hay información que guardar, así no generamos ruido
 *    posteriormente con N opciones deshabilitadas». Eso es cierto de una lista
 *    que solo se imprime y falso del catálogo del expediente, que tiene
 *    documentos de gente colgando: borrar ahí lo impide la base.
 *
 * 2. AQUÍ CABEN NOMBRES QUE NO SON CATEGORÍAS. «Es posible tener Cédula,
 *    Cédula 1, Cédula de Familiar, en varios títulos». «Cédula de Familiar» es
 *    un renglón de una hoja de requisitos; en el catálogo del expediente sería
 *    una opción al archivar los papeles de un trabajador.
 *
 * La lista nació sembrada con los once nombres del catálogo, así que el día uno
 * dicen lo mismo. A partir de ahí cada una va por su lado, que es lo correcto.
 */

export interface TituloDeRequisitos {
  id: number
  nombre: string
  orden: number
}

export interface RequisitoDeIngreso {
  id: number
  titulo_id: number
  nombre: string
  orden: number
  activo: boolean
}

/** Un título con lo que cuelga de él, que es como se lee y como se imprime. */
export interface GrupoDeRequisitos {
  titulo: TituloDeRequisitos
  requisitos: RequisitoDeIngreso[]
}

/**
 * Los dos niveles en una sola consulta, ya agrupados.
 *
 * Se piden las dos tablas enteras y se cruzan aquí: son cinco títulos y once
 * renglones, y una consulta anidada por cada título serían seis idas al
 * servidor para traer lo mismo.
 *
 * UN TÍTULO SIN REQUISITOS SÍ SALE, y hace falta que salga: es el estado en el
 * que queda justo después de crearlo, y si la pantalla lo escondiera, quien
 * acaba de crearlo creería que no se guardó.
 */
export function useRequisitosDeIngreso() {
  return useQuery({
    queryKey: ['requisitos', 'todo'],
    queryFn: async (): Promise<GrupoDeRequisitos[]> => {
      const [titulos, requisitos] = await Promise.all([
        supabase.from('requisitos_titulos').select('*').order('orden').order('id'),
        supabase.from('requisitos_ingreso').select('*').order('orden').order('id'),
      ])

      const lista = desenvolver<RequisitoDeIngreso[]>(requisitos)
      return desenvolver<TituloDeRequisitos[]>(titulos).map((titulo) => ({
        titulo,
        requisitos: lista.filter((r) => r.titulo_id === titulo.id),
      }))
    },
  })
}

/**
 * Cualquier cambio invalida la lista entera y no el renglón tocado.
 *
 * Mover un requisito de título cambia dos grupos, y renombrar un título cambia
 * lo que se lee en la hoja. Refrescar lo que se ve es una consulta de dos
 * tablas cortas: no vale la pena hilar qué cambió.
 */
function useAccionDeRequisitos<A, R = unknown>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['requisitos'] }),
  })
}

export function useGuardarTitulo() {
  return useAccionDeRequisitos((t: { id?: number | null; nombre: string; orden?: number | null }) =>
    rpc<number>('guardar_titulo_de_requisitos', {
      p_id: t.id ?? null,
      p_nombre: t.nombre,
      p_orden: t.orden ?? null,
    }),
  )
}

/** Se niega si el título tiene requisitos dentro, diciendo cuántos. */
export function useBorrarTitulo() {
  return useAccionDeRequisitos((id: number) =>
    rpc('borrar_titulo_de_requisitos', { p_id: id }),
  )
}

export function useGuardarRequisito() {
  return useAccionDeRequisitos(
    (r: {
      id?: number | null
      titulo_id?: number | null
      nombre: string
      orden?: number | null
      /*
        Los tres nulos no son «vacío»: son «déjalo como estaba».
        La base lo resuelve así, de modo que corregir solo el nombre no arrastra
        el orden ni apaga nada sin querer.
      */
      activo?: boolean | null
    }) =>
      rpc<number>('guardar_requisito_de_ingreso', {
        p_id: r.id ?? null,
        p_titulo_id: r.titulo_id ?? null,
        p_nombre: r.nombre,
        p_orden: r.orden ?? null,
        p_activo: r.activo ?? null,
      }),
  )
}

/** Borra de verdad: a estas filas no las referencia nadie. */
export function useBorrarRequisito() {
  return useAccionDeRequisitos((id: number) =>
    rpc('borrar_requisito_de_ingreso', { p_id: id }),
  )
}

/**
 * Lo que se imprime, a partir de lo que hay y de lo que el entrevistador marcó.
 *
 * Vive aquí y no en la pantalla porque lo usan dos: el modal, para decir cuántos
 * van a salir, y la llamada que arma el PDF. Contándolo en dos sitios acabarían
 * diciendo cifras distintas — que es el fallo que llevamos todo el día
 * encontrando en otros módulos.
 *
 * Y los títulos vacíos se caen aquí, no en el PDF: un grupo del que no se marcó
 * nada no es un grupo que imprimir.
 */
export function loQueSeImprime(
  grupos: GrupoDeRequisitos[],
  marcados: ReadonlySet<number>,
): Array<{ nombre: string; requisitos: string[] }> {
  return grupos
    .map((g) => ({
      nombre: g.titulo.nombre,
      requisitos: g.requisitos.filter((r) => marcados.has(r.id)).map((r) => r.nombre),
    }))
    .filter((g) => g.requisitos.length > 0)
}
