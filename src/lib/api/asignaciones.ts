import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/**
 * Los bienes que están en manos de alguien.
 *
 * NO SON SOLO HERRAMIENTAS
 *
 * Una llave, una silla de oficina, un teléfono, una computadora. Todo eso está
 * en el inventario, todo se le entrega a alguien y de todo hay que saber quién
 * lo tiene. Por eso el módulo se llama Asignaciones y no Herramientas: la
 * primera versión se quedó corta y lo dejó dicho el caso de la silla rota.
 *
 * ASIGNAR NO ES SACAR DEL ALMACÉN
 *
 * Un saco de cemento sale y no vuelve: eso es un consumo. Una llave sale del
 * taller, está con alguien, y vuelve. Por eso asignar no mueve el inventario:
 * las tres llaves siguen siendo tres. Lo que cambia es cuántas se pueden
 * prestar, y ese es otro número — el que devuelve `useAsignables`.
 *
 * PERDERSE Y DAÑARSE NO SON LO MISMO
 *
 * Lo perdido no está: sale del inventario. Lo dañado sigue estando, y puede
 * tener arreglo. Por eso la baja se pregunta en vez de deducirse.
 */

export type EstadoAsignacion =
  | 'ASIGNADA'
  | 'DEVUELTA'
  | 'PERDIDA'
  | 'DANADA'
  | 'REPUESTA'

/** Qué pasó: no está, o está rota. */
export type TipoIncidencia = 'PERDIDA' | 'DANO'

export interface Asignable {
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
  categoria: string
  dado_de_baja: boolean | null
  saldado_como: 'DESCUENTO' | 'REPOSICION' | 'EXONERADO' | null
  saldado_el: string | null
  dias_fuera: number
}

/** Lo pendiente de resolver, agrupado por trabajador. */
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

/**
 * Lo que se puede asignar, con existencia, entregadas y libres.
 *
 * No filtra por categoría: una silla se entrega igual que una llave. Filtrar
 * por HERRAMIENTA fue el error de la primera versión — dejaba fuera
 * precisamente los bienes de oficina, que son los que más tiempo pasan en
 * manos de una persona concreta.
 */
export function useAsignables(filtros: { almacenId?: number; categoria?: string } = {}) {
  return useQuery({
    queryKey: ['asignables', filtros.almacenId ?? 'todos', filtros.categoria ?? 'todas'],
    queryFn: async () => {
      let q = supabase.from('v_herramientas').select('*').order('articulo')
      if (filtros.almacenId) q = q.eq('almacen_id', filtros.almacenId)
      if (filtros.categoria) q = q.eq('categoria', filtros.categoria)
      return desenvolver<Asignable[]>(await q)
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

export function useIncidenciasAbiertas() {
  return useQuery({
    queryKey: ['incidencias-abiertas'],
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
      void qc.invalidateQueries({ queryKey: ['asignables'] })
      void qc.invalidateQueries({ queryKey: ['asignaciones'] })
      void qc.invalidateQueries({ queryKey: ['incidencias-abiertas'] })
      // Perder una herramienta descuenta del almacén de verdad.
      void qc.invalidateQueries({ queryKey: ['existencias'] })
      void qc.invalidateQueries({ queryKey: ['existencias-totales'] })
    },
  })
}

export function useAsignar() {
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

export function useDevolver() {
  return useAccion(async (d: { id: number; fecha?: string | null; nota?: string | null }) =>
    rpc<number>('devolver_herramienta', {
      p_id: d.id,
      p_fecha: d.fecha ?? null,
      p_nota: d.nota ?? null,
    }),
  )
}

/**
 * Reportar que se perdió o que se dañó.
 *
 * `deBaja` decide si sale del inventario. Va sin valor por defecto en el
 * front a propósito: la base pone el que corresponde a cada tipo —lo perdido
 * sale, lo dañado se queda— y quien reporta lo cambia cuando el caso es el
 * otro.
 */
export function useReportarIncidencia() {
  return useAccion(
    async (p: {
      id: number
      tipo: TipoIncidencia
      motivo: string
      deBaja?: boolean | null
      fecha?: string | null
    }) =>
      rpc<number>('reportar_incidencia_asignacion', {
        p_id: p.id,
        p_tipo: p.tipo,
        p_motivo: p.motivo,
        p_de_baja: p.deBaja ?? null,
        p_fecha: p.fecha ?? null,
      }),
  )
}

export function useResolverIncidencia() {
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
