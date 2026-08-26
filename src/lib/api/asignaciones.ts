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
  /** `DOTACION` no vuelve; `ASIGNACION` es un prestamo. */
  clase: 'DOTACION' | 'ASIGNACION'
  /** Cuando tiene que estar de vuelta. Nulo si no se le puso fecha. */
  fecha_limite: string | null
  /**
   * Dias de retraso, o nulo si no hay retraso.
   *
   * No es `dias_fuera`: una herramienta puede llevar tres meses fuera y estar
   * en su sitio. Esto solo tiene valor cuando se paso de la fecha.
   */
  dias_vencida: number | null
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

/*
  ENTREGARLE VARIAS COSAS A UNA PERSONA DE UNA VEZ

  Antes esto solo existía dentro de la ficha del trabajador, y ahí consumía
  todo lo que se le pusiera delante: entregar un torquímetro desde la ficha lo
  hacía desaparecer del almacén en vez de dejarlo prestado.

  Ahora la base decide por cada renglón según `articulos.modo_entrega`, y esta
  pantalla vive donde tiene que vivir: en el módulo de asignaciones, que es
  donde alguien va cuando quiere darle cosas a alguien.
*/
export interface Entregable {
  almacen_id: number
  almacen: string
  articulo_id: number
  articulo_codigo: string
  articulo: string
  categoria: string
  unidad: string
  modo_entrega: string
  existencia: string
  prestadas: string
  disponibles: string
}

export function useEntregables(almacenId?: number) {
  return useQuery({
    queryKey: ['entregables', almacenId ?? 'todos'],
    queryFn: async () => {
      let q = supabase.from('v_entregables').select('*').order('articulo')
      if (almacenId) q = q.eq('almacen_id', almacenId)
      return desenvolver<Entregable[]>(await q)
    },
  })
}

export function useEntregarATrabajador() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (e: {
      empleado_id: number
      almacen_id: number
      renglones: { articulo_id: number; cantidad: number }[]
      /** Para qué se le da: por su rol o para una actividad concreta. */
      clase: 'DOTACION' | 'ASIGNACION'
      fecha?: string | null
      nota?: string | null
    }) =>
      rpc<{ prestados: number; consumidos: number }>('entregar_a_trabajador', {
        p_empleado_id: e.empleado_id,
        p_almacen_id: e.almacen_id,
        p_renglones: e.renglones,
        p_clase: e.clase,
        p_fecha: e.fecha ?? null,
        p_nota: e.nota ?? null,
      }),
    onSuccess: () => {
      // Toca las tres cosas a la vez: lo prestado, lo que queda y el libro.
      void qc.invalidateQueries({ queryKey: ['asignaciones'] })
      void qc.invalidateQueries({ queryKey: ['asignables'] })
      void qc.invalidateQueries({ queryKey: ['entregables'] })
      void qc.invalidateQueries({ queryKey: ['existencias'] })
      void qc.invalidateQueries({ queryKey: ['movimientos'] })
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
      /**
       * Cuando tiene que estar de vuelta. Opcional a proposito: hay prestamos
       * de una manana y hay dotacion que no vuelve nunca, y obligar a poner
       * fecha en todos convierte el campo en un tramite que se rellena con
       * cualquier cosa.
       */
      fecha_limite?: string | null
    }) =>
      rpc<number>('asignar_herramienta', {
        p_articulo_id: a.articulo_id,
        p_almacen_id: a.almacen_id,
        p_empleado_id: a.empleado_id,
        p_cantidad: a.cantidad,
        p_fecha: a.fecha ?? null,
        p_nota: a.nota ?? null,
        p_fecha_limite: a.fecha_limite || null,
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


/*
  TODO LO QUE SE LE HA DADO A UNA PERSONA

  Une los dos rastros —lo prestado y lo consumido— porque para quien mira una
  ficha son lo mismo: cosas que se le dieron. Lo que las separa no es de dónde
  salió el registro sino `clase`, que es la pregunta que de verdad se hace: ¿es
  de su puesto, o se lo llevó para una faena?
*/
export interface EntregadoATrabajador {
  origen: 'PRESTAMO' | 'CONSUMO'
  id: number
  numero: string
  empleado_id: number
  fecha: string
  articulo_id: number
  articulo_codigo: string
  articulo: string
  unidad: string
  categoria: string
  cantidad: string
  almacen: string
  clase: 'DOTACION' | 'ASIGNACION'
  /** Solo lo prestado tiene estado; lo consumido ya salió del libro. */
  estado: string | null
  vuelve: boolean
  motivo: string | null
  nota: string | null
}

export function useEntregadoATrabajador(empleadoId?: number) {
  return useQuery({
    queryKey: ['entregado', empleadoId ?? 'todos'],
    enabled: empleadoId != null,
    queryFn: async () =>
      desenvolver<EntregadoATrabajador[]>(
        await supabase
          .from('v_entregado_a_trabajador')
          .select('*')
          .eq('empleado_id', empleadoId)
          .order('fecha', { ascending: false }),
      ),
  })
}
