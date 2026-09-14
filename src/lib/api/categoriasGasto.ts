import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/*
  LAS CATEGORÍAS DE GASTO Y EL FONDO ASIGNADO

  Vivían en `centroDeCostos.ts`, que se retiró el 14/09/2026 con la pantalla
  de Compras que lo usaba. Esto es lo que sobrevive de ahí: el catálogo de
  clases de gasto en dos niveles, que ahora clasifica lo manual del centro de
  costo y lo que tesorería teclea, y el fondo asignado, que sigue siendo el
  tope contra el que se compara el gasto.
*/

export interface CategoriaGasto {
  codigo: string
  nombre: string
  padre: string | null
  orden: number
  activa?: boolean
}

export interface Presupuesto {
  id: number
  numero: string | null
  desde: string
  hasta: string
  monto: string
  moneda: string
  produccion_asignada: string | null
  unidad_produccion: string
  nota: string | null
  activo: boolean
  creado_en: string
}

/**
 * El catálogo de clases de gasto, en sus dos niveles.
 *
 * Sale de la base y no de una lista escrita en el front porque la líder la va a
 * mover: una subcategoría puede cambiar de padre según cómo la empresa mire su
 * propio gasto, y eso no debería costar un despliegue.
 */
export function useCategoriasGasto(incluirApagadas = false) {
  return useQuery({
    queryKey: ['categorias-gasto', incluirApagadas],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      let consulta = supabase
        .from('categorias_gasto')
        .select('codigo, nombre, padre, orden, activa')
        .order('orden')
      if (!incluirApagadas) consulta = consulta.eq('activa', true)
      return desenvolver<CategoriaGasto[]>(await consulta)
    },
  })
}

function useAccionCatalogo<A>(fn: (a: A) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['categorias-gasto'] })
      void qc.invalidateQueries({ queryKey: ['costos'] })
    },
  })
}

/**
 * Crear o cambiar una categoría.
 *
 * Sin código, crea; con código, cambia. El código no se toca al renombrar: es lo
 * que guardan los gastos ya registrados.
 */
export function useGuardarCategoriaGasto() {
  return useAccionCatalogo(
    (c: {
      codigo?: string | null
      nombre: string
      padre?: string | null
      orden?: number | null
      activa?: boolean
    }) =>
      rpc<string>('guardar_categoria_gasto', {
        p_codigo: c.codigo ?? null,
        p_nombre: c.nombre,
        p_padre: c.padre ?? null,
        p_orden: c.orden ?? null,
        p_activa: c.activa ?? true,
      }),
  )
}

/** Solo se puede con las que nunca se usaron. El resto se apaga. */
export function useBorrarCategoriaGasto() {
  return useAccionCatalogo((codigo: string) =>
    rpc<void>('borrar_categoria_gasto', { p_codigo: codigo }),
  )
}

export function usePresupuestos() {
  return useQuery({
    queryKey: ['costos', 'presupuestos'],
    queryFn: async () =>
      desenvolver<Presupuesto[]>(
        await supabase.from('presupuestos').select('*').order('desde', { ascending: false }),
      ),
  })
}

export function useGuardarPresupuesto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: {
      id?: number | null
      desde: string
      hasta: string
      monto: number
      moneda?: string
      produccion_asignada?: number | null
      unidad_produccion?: string
      nota?: string | null
      activo?: boolean
    }) =>
      rpc<number>('guardar_presupuesto', {
        p_id: p.id ?? null,
        p_desde: p.desde,
        p_hasta: p.hasta,
        p_monto: p.monto,
        p_moneda: p.moneda ?? 'USD',
        p_produccion_asignada: p.produccion_asignada ?? null,
        p_unidad_produccion: p.unidad_produccion ?? 'M3',
        p_nota: p.nota ?? null,
        p_activo: p.activo ?? true,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['costos'] })
    },
  })
}
