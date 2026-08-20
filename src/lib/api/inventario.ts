import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

// ---------------------------------------------------------------------------
// Almacenes
// ---------------------------------------------------------------------------

export interface Almacen {
  id: number
  codigo: string
  nombre: string
  tipo: string
  ubicacion: string | null
  recibe_compras: boolean
  activo: boolean
}

export const TIPOS_ALMACEN = [
  { valor: 'ALMACEN', etiqueta: 'Almacén' },
  { valor: 'PATIO', etiqueta: 'Patio de material' },
  { valor: 'TALLER', etiqueta: 'Taller' },
  { valor: 'COMBUSTIBLE', etiqueta: 'Combustible' },
  { valor: 'TRANSITO', etiqueta: 'En tránsito' },
]

export function useAlmacenes(soloActivos = true) {
  return useQuery({
    queryKey: ['almacenes', soloActivos],
    queryFn: async () => {
      let q = supabase.from('almacenes').select('*').order('nombre')
      if (soloActivos) q = q.eq('activo', true)
      return desenvolver<Almacen[]>(await q)
    },
    staleTime: 5 * 60_000,
  })
}

export function useGuardarAlmacen() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: Partial<Almacen> & { codigo: string; nombre: string; tipo: string }) =>
      rpc<number>('guardar_almacen', {
        p_id: a.id ?? null,
        p_codigo: a.codigo,
        p_nombre: a.nombre,
        p_tipo: a.tipo,
        p_ubicacion: a.ubicacion ?? null,
        p_recibe_compras: a.recibe_compras ?? false,
        p_activo: a.activo ?? true,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['almacenes'] }),
  })
}

// ---------------------------------------------------------------------------
// Existencias
// ---------------------------------------------------------------------------

export interface Existencia {
  almacen_id: number
  almacen_codigo: string
  almacen: string
  articulo_id: number
  articulo_codigo: string
  articulo: string
  categoria: string
  unidad: string
  stock_minimo: string
  existencia: string
  /** De la existencia, cuánto está en manos de alguien y no se puede entregar. */
  prestadas: string
  /** Lo que se puede entregar hoy: existencia menos lo prestado. */
  disponibles: string
  valor_usd: string
  costo_promedio_usd: string | null
  ultimo_movimiento: string | null
}

export function useExistencias(almacenId?: number, activa = true) {
  return useQuery({
    queryKey: ['existencias', almacenId ?? 'todos'],
    queryFn: async () => {
      let q = supabase.from('v_existencias').select('*').order('articulo')
      if (almacenId) q = q.eq('almacen_id', almacenId)
      return desenvolver<Existencia[]>(await q)
    },
    enabled: activa,
  })
}

/**
 * El inventario de la empresa entero, sin partir por almacén.
 *
 * POR QUÉ NO SE SUMA EN LA PANTALLA
 *
 * La existencia sí se podría sumar aquí. El costo promedio no: promediar los
 * promedios de cada almacén da un número que no es el costo de nada. La vista
 * lo recalcula sobre el libro completo, que es la única forma de que cuadre.
 */
export interface ExistenciaTotal {
  articulo_id: number
  articulo_codigo: string
  articulo: string
  categoria: string
  unidad: string
  stock_minimo: string
  densidad_ton_m3: string | null
  existencia: string
  prestadas: string
  disponibles: string
  modo_entrega: string
  /** La misma existencia en la otra medida. Nula si nadie midió la densidad. */
  existencia_equivalente: string | null
  unidad_equivalente: string | null
  valor_usd: string
  costo_promedio_usd: string | null
  /** En cuántos almacenes o talleres ha pasado por el libro. */
  almacenes: number
  ultimo_movimiento: string | null
}

export function useExistenciasTotales(activa = true) {
  return useQuery({
    queryKey: ['existencias-totales'],
    queryFn: async () =>
      desenvolver<ExistenciaTotal[]>(
        await supabase.from('v_existencias_totales').select('*').order('articulo'),
      ),
    enabled: activa,
  })
}

/**
 * Dónde está repartido un artículo.
 *
 * Es el escalón que faltaba entre el total de la empresa y un almacén
 * concreto: ver que hay 400 sacos no dice en cuál de los cuatro sitios
 * buscarlos.
 */
export function useExistenciasDeArticulo(articuloId: number | null) {
  return useQuery({
    queryKey: ['existencias-articulo', articuloId],
    queryFn: async () =>
      desenvolver<Existencia[]>(
        await supabase
          .from('v_existencias')
          .select('*')
          .eq('articulo_id', articuloId!)
          .order('almacen'),
      ),
    enabled: articuloId !== null,
  })
}

// ---------------------------------------------------------------------------
// Movimientos
// ---------------------------------------------------------------------------

export interface Movimiento {
  id: number
  numero: string
  fecha: string
  tipo: string
  signo: number
  almacen_id: number
  articulo_id: number
  cantidad: string
  unidad: string
  costo_usd: string
  valor_usd: string
  orden_id: number | null
  nota: string | null
  registrado_por: string | null
  registrado_en: string
  almacen: { nombre: string } | null
  articulo: { codigo: string; nombre: string } | null
}

export const TIPOS_MOVIMIENTO: Record<string, string> = {
  ENTRADA_COMPRA: 'Entrada por compra',
  ENTRADA_PRODUCCION: 'Entrada de producción',
  ENTRADA_DEVOLUCION: 'Devolución',
  SALIDA_CONSUMO: 'Salida a consumo',
  SALIDA_DESPACHO: 'Salida por despacho',
  SALIDA_MERMA: 'Merma',
  AJUSTE_POSITIVO: 'Ajuste por conteo (sobrante)',
  AJUSTE_NEGATIVO: 'Ajuste por conteo (faltante)',
  TRANSFERENCIA_SALIDA: 'Traslado, salida',
  TRANSFERENCIA_ENTRADA: 'Traslado, entrada',
  REVERSO: 'Reverso',
}

export function useMovimientos(filtros: { almacenId?: number; articuloId?: number } = {}) {
  return useQuery({
    queryKey: ['movimientos', filtros],
    queryFn: async () => {
      let q = supabase
        .from('inventario_movimientos')
        .select('*, almacen:almacenes(nombre), articulo:articulos(codigo, nombre)')
        .order('registrado_en', { ascending: false })
        .limit(200)

      if (filtros.almacenId) q = q.eq('almacen_id', filtros.almacenId)
      if (filtros.articuloId) q = q.eq('articulo_id', filtros.articuloId)

      return desenvolver<Movimiento[]>(await q)
    },
  })
}

/**
 * Toda escritura de inventario invalida existencias, movimientos, el tablero
 * de compras y los avisos: una recepción cierra una orden y emite una
 * notificación, así que refrescar solo el inventario dejaría el resto de la
 * pantalla contando otra cosa.
 */
function useAccionInventario<A>(fn: (args: A) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['existencias'] })
      void qc.invalidateQueries({ queryKey: ['movimientos'] })
      void qc.invalidateQueries({ queryKey: ['compras'] })
      void qc.invalidateQueries({ queryKey: ['notificaciones'] })
    },
  })
}

export interface RenglonRecibido {
  orden_renglon_id: number
  cantidad: number
}

export function useRegistrarRecepcion() {
  return useAccionInventario(
    (r: {
      orden_id: number
      almacen_id: number
      renglones: RenglonRecibido[]
      nota?: string
      fecha?: string
    }) =>
      rpc<number>('registrar_recepcion', {
        p_orden_id: r.orden_id,
        p_almacen_id: r.almacen_id,
        p_renglones: r.renglones,
        p_nota: r.nota || null,
        p_fecha: r.fecha || null,
      }),
  )
}

export function useRegistrarSalida() {
  return useAccionInventario(
    (s: {
      almacen_id: number
      articulo_id: number
      cantidad: number
      motivo: string
      tipo?: string
      fecha?: string
    }) =>
      rpc<number>('registrar_salida', {
        p_almacen_id: s.almacen_id,
        p_articulo_id: s.articulo_id,
        p_cantidad: s.cantidad,
        p_motivo: s.motivo,
        p_tipo: s.tipo ?? 'SALIDA_CONSUMO',
        p_fecha: s.fecha || null,
      }),
  )
}

export function useRegistrarAjuste() {
  return useAccionInventario(
    (a: {
      almacen_id: number
      articulo_id: number
      contado: number
      motivo: string
      fecha?: string
    }) =>
      rpc<number>('registrar_ajuste', {
        p_almacen_id: a.almacen_id,
        p_articulo_id: a.articulo_id,
        p_contado: a.contado,
        p_motivo: a.motivo,
        p_fecha: a.fecha || null,
      }),
  )
}

/**
 * Traslado entre almacenes.
 *
 * Devuelve el id de la salida, que es la cabeza de la pareja: la entrada al
 * destino cuelga de ella. Quien quiera deshacerlo reversa esa y caen las dos.
 */
export function useTransferir() {
  return useAccionInventario(
    (t: {
      origen_id: number
      destino_id: number
      articulo_id: number
      cantidad: number
      motivo: string
      fecha?: string
    }) =>
      rpc<number>('transferir_existencia', {
        p_origen_id: t.origen_id,
        p_destino_id: t.destino_id,
        p_articulo_id: t.articulo_id,
        p_cantidad: t.cantidad,
        p_motivo: t.motivo,
        p_fecha: t.fecha || null,
      }),
  )
}

export function useReversarMovimiento() {
  return useAccionInventario((r: { id: number; motivo: string }) =>
    rpc<number>('reversar_movimiento', { p_id: r.id, p_motivo: r.motivo }),
  )
}
