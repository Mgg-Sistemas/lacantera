import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { rpc, desenvolver } from '@/lib/api/rpc'

/*
  EL ORGANIGRAMA

  Un árbol, y por tanto una sola tabla. La vista lo devuelve ya recorrido y
  ordenado por `camino`, así que aquí no hace falta ordenar nada: basta con
  armar la jerarquía para pintarla.
*/

export type TipoDeNodo = 'UNIDAD' | 'CARGO'

export interface NodoOrganigrama {
  id: number
  padre_id: number | null
  nombre: string
  titular: string | null
  tipo: TipoDeNodo
  cuantos: number
  departamento: string | null
  nota: string | null
  orden: number
  activo: boolean
  nivel: number
  camino: string
  hijos: number
  /** Cuánta gente tiene la nómina en ese departamento. Null: no está enlazado. */
  registrados: number | null
}

/** El mismo nodo, ya con sus hijos colgando. */
export interface RamaOrganigrama extends NodoOrganigrama {
  ramas: RamaOrganigrama[]
  /** La suma de `cuantos` de este nodo y de todo lo que cuelga de él. */
  previstosEnRama: number
}

export function useOrganigrama() {
  return useQuery({
    queryKey: ['organigrama'],
    queryFn: async () =>
      desenvolver<NodoOrganigrama[]>(
        await supabase.from('v_organigrama').select('*').order('camino'),
      ),
  })
}

/**
 * De la lista plana al árbol.
 *
 * La vista ya viene ordenada por `camino`, que pone a cada hijo detrás de su
 * padre. Eso permite armar el árbol en una pasada: cuando llega un nodo, su
 * padre ya está en el mapa.
 */
export function armarArbol(nodos: NodoOrganigrama[]): RamaOrganigrama[] {
  const porId = new Map<number, RamaOrganigrama>()
  const raices: RamaOrganigrama[] = []

  for (const n of nodos) {
    const rama: RamaOrganigrama = { ...n, ramas: [], previstosEnRama: 0 }
    porId.set(n.id, rama)

    const padre = n.padre_id !== null ? porId.get(n.padre_id) : undefined
    if (padre) padre.ramas.push(rama)
    else raices.push(rama)
  }

  // La suma sube desde las hojas, así que se recorre al revés: cuando se llega
  // a un nodo, sus hijos ya sumaron lo suyo.
  const sumar = (r: RamaOrganigrama): number => {
    r.previstosEnRama = r.cuantos + r.ramas.reduce((t, h) => t + sumar(h), 0)
    return r.previstosEnRama
  }
  raices.forEach(sumar)

  return raices
}

function useAccionOrganigrama<A>(fn: (a: A) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['organigrama'] }),
  })
}

export function useGuardarNodo() {
  return useAccionOrganigrama(
    (n: {
      id?: number | null
      nombre: string
      padre_id?: number | null
      titular?: string | null
      tipo?: TipoDeNodo
      cuantos?: number
      departamento?: string | null
      nota?: string | null
      orden?: number
    }) =>
      rpc<number>('guardar_nodo_organigrama', {
        p_id: n.id ?? null,
        p_nombre: n.nombre,
        p_padre_id: n.padre_id ?? null,
        p_titular: n.titular ?? null,
        p_tipo: n.tipo ?? 'UNIDAD',
        p_cuantos: n.cuantos ?? 1,
        p_departamento: n.departamento ?? null,
        p_nota: n.nota ?? null,
        p_orden: n.orden ?? 0,
      }),
  )
}

export function useMoverNodo() {
  return useAccionOrganigrama((m: { id: number; padre_id: number; orden?: number }) =>
    rpc('mover_nodo_organigrama', {
      p_id: m.id,
      p_padre_id: m.padre_id,
      p_orden: m.orden ?? 0,
    }),
  )
}

export function useEliminarNodo() {
  return useAccionOrganigrama((n: { id: number }) =>
    rpc('eliminar_nodo_organigrama', { p_id: n.id }),
  )
}

/**
 * Los departamentos que la nómina tiene escritos, para poder enganchar un nodo
 * a uno de ellos sin escribirlo a mano y equivocarse en una letra.
 */
export function useDepartamentosDeNomina() {
  return useQuery({
    queryKey: ['organigrama', 'departamentos'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const filas = desenvolver<Array<{ departamento: string | null }>>(
        await supabase.from('empleados').select('departamento').eq('activo', true),
      )
      const cuenta = new Map<string, number>()
      let sinDepartamento = 0
      for (const f of filas) {
        const d = (f.departamento ?? '').trim()
        if (d) cuenta.set(d, (cuenta.get(d) ?? 0) + 1)
        else sinDepartamento++
      }

      /*
        `activos` no es la suma de la lista.

        Hay gente en nómina sin departamento escrito, y sumar solo los
        departamentos daría un total menor que la plantilla real — una tarjeta
        que dice «19 registrados» habiendo 20 personas. Se devuelven las tres
        cifras y que la pantalla diga la que toca en cada sitio.
      */
      return {
        lista: [...cuenta.entries()]
          .map(([departamento, personas]) => ({ departamento, personas }))
          .sort((a, b) => a.departamento.localeCompare(b.departamento, 'es')),
        activos: filas.length,
        sinDepartamento,
      }
    },
  })
}
