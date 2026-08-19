import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/**
 * Las herramientas que están en manos de alguien.
 *
 * ASIGNAR NO ES SACAR DEL ALMACÉN
 *
 * Un saco de cemento sale y no vuelve: eso es un consumo. Una llave sale del
 * taller, está con alguien, y vuelve. Por eso asignar no mueve el inventario:
 * las tres llaves siguen siendo tres. Lo que cambia es cuántas se pueden
 * prestar, y ese es otro número — el que devuelve `useHerramientas`.
 *
 * Perder una sí lo mueve: la existencia baja de verdad, y la asignación queda
 * abierta a nombre del responsable para que la vea quien procesa la nómina.
 */

export type EstadoAsignacion = 'ASIGNADA' | 'DEVUELTA' | 'PERDIDA' | 'REPUESTA'

export interface Herramienta {
  almacen_id: number
  almacen: string
  almacen_codigo: string
  articulo_id: number
  articulo_codigo: string
  articulo: string
  categoria: string
  unidad: string
  existencia: string
  costo_promedio_usd: string | null
  /** Cuántas están prestadas ahora mismo. */
  asignadas: string
  /** Lo que queda para prestar: existencia menos asignadas. */
  disponibles: string
  personas: number
}

export interface Asignacion {
  id: number
  numero: string | null
  estado: EstadoAsignacion
  articulo_id: number
  articulo_codigo: string
  articulo: string
  unidad: string
  almacen_id: number
  almacen: string
  empleado_id: number
  ficha: string
  cedula: string
  empleado: string
  cargo: string | null
  departamento: string | null
  fecha_egreso: string | null
  cantidad: string
  fecha_entrega: string
  fecha_devolucion: string | null
  fecha_perdida: string | null
  motivo: string | null
  nota: string | null
  costo_usd: string | null
  saldado_como: 'DESCUENTO' | 'REPOSICION' | 'EXONERADO' | null
  saldado_el: string | null
  dias_fuera: number
}

/** Lo que ve quien procesa la nómina: perdido y sin saldar, por trabajador. */
export interface PorCobrar {
  empleado_id: number
  ficha: string
  cedula: string
  empleado: string
  cargo: string | null
  departamento: string | null
  herramientas: number
  costo_usd: string
  desde: string
  detalle: string
}

export const MOTIVOS_SALDO = [
  {
    valor: 'DESCUENTO',
    etiqueta: 'Se le descuenta',
    detalle: 'Va como deducción en la nómina del período.',
  },
  {
    valor: 'REPOSICION',
    etiqueta: 'La repuso',
    detalle: 'Trajo otra. Entra al almacén por su recepción, no desde aquí.',
  },
  {
    valor: 'EXONERADO',
    etiqueta: 'No se le cobra',
    detalle: 'Se rompió trabajando o se decidió no cobrársela.',
  },
]

// ---------------------------------------------------------------------------

/** Con existencia, prestadas y libres. Solo lo que hay en algún sitio. */
export function useHerramientas(almacenId?: number) {
  return useQuery({
    queryKey: ['herramientas', almacenId ?? 'todos'],
    queryFn: async () => {
      let q = supabase
        .from('v_herramientas')
        .select('*')
        .eq('categoria', 'HERRAMIENTA')
        .order('articulo')
      if (almacenId) q = q.eq('almacen_id', almacenId)
      return desenvolver<Herramienta[]>(await q)
    },
  })
}

export function useAsignaciones(filtros: { estado?: EstadoAsignacion; empleadoId?: number } = {}) {
  return useQuery({
    queryKey: ['asignaciones', filtros.estado ?? 'todas', filtros.empleadoId ?? 'todos'],
    queryFn: async () => {
      let q = supabase
        .from('v_asignaciones_herramienta')
        .select('*')
        .order('fecha_entrega', { ascending: false })
        .limit(300)
      if (filtros.estado) q = q.eq('estado', filtros.estado)
      if (filtros.empleadoId) q = q.eq('empleado_id', filtros.empleadoId)
      return desenvolver<Asignacion[]>(await q)
    },
  })
}

export function useHerramientasPorCobrar() {
  return useQuery({
    queryKey: ['herramientas-por-cobrar'],
    queryFn: async () =>
      desenvolver<PorCobrar[]>(
        await supabase.from('v_herramientas_por_cobrar').select('*').order('empleado'),
      ),
  })
}

// ---------------------------------------------------------------------------

function useAccion<A>(fn: (args: A) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['herramientas'] })
      void qc.invalidateQueries({ queryKey: ['asignaciones'] })
      void qc.invalidateQueries({ queryKey: ['herramientas-por-cobrar'] })
      // Perder una herramienta descuenta del almacén de verdad.
      void qc.invalidateQueries({ queryKey: ['existencias'] })
      void qc.invalidateQueries({ queryKey: ['existencias-totales'] })
    },
  })
}

export function useAsignarHerramienta() {
  return useAccion(
    async (a: {
      articulo_id: number
      almacen_id: number
      empleado_id: number
      cantidad: number
      fecha?: string | null
      nota?: string | null
    }) =>
      rpc<number>('asignar_herramienta', {
        p_articulo_id: a.articulo_id,
        p_almacen_id: a.almacen_id,
        p_empleado_id: a.empleado_id,
        p_cantidad: a.cantidad,
        p_fecha: a.fecha ?? null,
        p_nota: a.nota ?? null,
      }),
  )
}

export function useDevolverHerramienta() {
  return useAccion(async (d: { id: number; fecha?: string | null; nota?: string | null }) =>
    rpc<number>('devolver_herramienta', {
      p_id: d.id,
      p_fecha: d.fecha ?? null,
      p_nota: d.nota ?? null,
    }),
  )
}

export function useReportarPerdida() {
  return useAccion(async (p: { id: number; motivo: string; fecha?: string | null }) =>
    rpc<number>('reportar_perdida_herramienta', {
      p_id: p.id,
      p_motivo: p.motivo,
      p_fecha: p.fecha ?? null,
    }),
  )
}

export function useSaldarPerdida() {
  return useAccion(
    async (s: {
      id: number
      como: 'DESCUENTO' | 'REPOSICION' | 'EXONERADO'
      fecha?: string | null
      nota?: string | null
    }) =>
      rpc<number>('saldar_herramienta_perdida', {
        p_id: s.id,
        p_como: s.como,
        p_fecha: s.fecha ?? null,
        p_nota: s.nota ?? null,
      }),
  )
}
