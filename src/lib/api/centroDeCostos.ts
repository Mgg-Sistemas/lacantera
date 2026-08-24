import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'
import type { Rango } from '@/components/rango'

/*
  EL CENTRO DE COSTOS

  La líder pidió un control de egresos «tipo centro de costos», desacoplado de la
  contabilidad: sin libro mayor, sin caja chica y sin que un pago mande el saldo
  a cero.

  LO QUE ESTO NO ES: UNA SEGUNDA CONTABILIDAD

  No hay tabla de gastos. Todo lo que se lee aquí sale de `tesoreria_movimientos`,
  que ya es el acumulador único: las dieciséis funciones que mueven dinero
  —nómina, pago de orden, gasto suelto, liquidaciones— desembocan todas ahí.
  Crear una tabla paralela habría dado dos respuestas a la misma pregunta sin
  ningún error de por medio, que es la peor forma de fallar.

  Lo único que se añadió a la base es la CLASE del gasto y el PRESUPUESTO contra
  el que se compara. El resto es leer distinto lo que ya estaba.

  POR QUÉ TODO PASA POR RPC Y NO POR UNA VISTA

  `tesoreria_movimientos` solo la puede leer quien tenga TESORERIA:LECTURA, y
  esta pantalla vive en Compras. Una vista leída desde aquí devolvería cero filas
  y pintaría 0,00 sin dar ningún error. Las funciones son `security definer` con
  su propia reja de COMPRAS:LECTURA dentro.
*/

export interface ResumenCentroCostos {
  asignado_usd: string
  gastado_usd: string
  balance_usd: string
  /** Nulo cuando no hay presupuesto cargado: sin fondo no hay ejecución. */
  ejecutado_pct: string | null
  produccion_asignada: string | null
  unidad_produccion: string
  /** Nulo sin volumen asignado. Dividir entre cero no da cero, da nada. */
  costo_por_unidad: string | null
  sin_clasificar_usd: string
}

export interface TrozoDeGasto {
  codigo: string
  nombre: string
  veces: number
  total_usd: string
  porcentaje: string
  /** Cierto si esa categoría tiene un nivel de detalle dentro. */
  tiene_hijos: boolean
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

export interface GastoDelLibro {
  id: number
  numero: string | null
  fecha: string
  concepto: string
  contraparte: string | null
  tipo: string
  monto_usd: string
  categoria: string | null
  categoria_nombre: string | null
  categoria_raiz: string | null
  categoria_raiz_nombre: string | null
}

export function useResumenCentroCostos(rango: Rango) {
  return useQuery({
    queryKey: ['centro-costos', 'resumen', rango.desde, rango.hasta],
    queryFn: async () => {
      const filas = await rpc<ResumenCentroCostos[]>('resumen_centro_costos', {
        p_desde: rango.desde ?? null,
        p_hasta: rango.hasta ?? null,
      })
      return filas?.[0] ?? null
    },
  })
}

/**
 * El reparto del gasto.
 *
 * Sin `padre`, los seis de primer nivel — que es lo que pinta la torta. Con
 * `padre`, el detalle de dentro. Christopher: «es la categoría de la categoría;
 * todo depende de a qué nivel se esté tratando».
 */
export function useGastoPorCategoria(rango: Rango, padre?: string | null) {
  return useQuery({
    queryKey: ['centro-costos', 'categorias', rango.desde, rango.hasta, padre ?? 'raiz'],
    queryFn: () =>
      rpc<TrozoDeGasto[]>('gasto_por_categoria', {
        p_desde: rango.desde ?? null,
        p_hasta: rango.hasta ?? null,
        p_padre: padre ?? null,
      }),
  })
}

/** El detalle: cada egreso del período, con su clase. */
export function useGastosDelPeriodo(rango: Rango, categoria?: string | null, limite = 300) {
  return useQuery({
    queryKey: ['centro-costos', 'detalle', rango.desde, rango.hasta, categoria ?? 'todas', limite],
    queryFn: async () => {
      let consulta = supabase
        .from('v_gastos')
        .select(
          'id, numero, fecha, concepto, contraparte, tipo, monto_usd, categoria, categoria_nombre, categoria_raiz, categoria_raiz_nombre',
        )
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })
        .limit(limite)

      if (rango.desde) consulta = consulta.gte('fecha', rango.desde)
      if (rango.hasta) consulta = consulta.lte('fecha', rango.hasta)
      if (categoria) consulta = consulta.eq('categoria_raiz', categoria)

      return desenvolver<GastoDelLibro[]>(await consulta)
    },
  })
}

export function usePresupuestos() {
  return useQuery({
    queryKey: ['centro-costos', 'presupuestos'],
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
      void qc.invalidateQueries({ queryKey: ['centro-costos'] })
    },
  })
}

export interface CategoriaGasto {
  codigo: string
  nombre: string
  padre: string | null
  orden: number
}

/**
 * El catálogo de clases de gasto, en sus dos niveles.
 *
 * Sale de la base y no de una lista escrita en el front porque la líder la va a
 * mover: una subcategoría puede cambiar de padre según cómo la empresa mire su
 * propio gasto, y eso no debería costar un despliegue.
 */
export function useCategoriasGasto() {
  return useQuery({
    queryKey: ['categorias-gasto'],
    staleTime: 30 * 60_000,
    queryFn: async () =>
      desenvolver<CategoriaGasto[]>(
        await supabase
          .from('categorias_gasto')
          .select('codigo, nombre, padre, orden')
          .eq('activa', true)
          .order('orden'),
      ),
  })
}

/** Le pone la clase a un gasto que nació sin ella. Solo de nula a valor. */
export function useClasificarGasto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (g: { id: number; categoria: string }) =>
      rpc<number>('clasificar_gasto', { p_id: g.id, p_categoria: g.categoria }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['centro-costos'] })
      void qc.invalidateQueries({ queryKey: ['movimientos-tesoreria'] })
    },
  })
}
