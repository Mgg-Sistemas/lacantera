import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'
import type { SolicitudDeSalida } from './salidas'

/*
  EL TELÉFONO DEL ALMACENISTA, FASE 1b DE «ALMACÉN E INVENTARIO COMO MGG».

  08/11/2026. Lo que la página única (`pages/inventario/Almacen.tsx`) necesita
  para salida, traslado, por retornar, reporte de stock e históricos y que no
  tenía ya su gancho. Las escrituras son RPC: las de siempre
  (`transferir_existencia`, `entregar_a_trabajador`) por sus ganchos de
  siempre, y las nuevas de la migración `20261108900000_…_fase_1b.sql`.
*/

/** Lo que el teléfono invalida después de mover algo: lo mismo que las demás puertas. */
function useInvalidarTodo() {
  const qc = useQueryClient()
  return () => {
    for (const k of [
      'solicitudes-salida',
      'existencias',
      'existencias-totales',
      'movimientos',
      'notificaciones',
      'asignaciones',
      'asignables',
      'entregables',
      'telefono-por-retornar',
      'telefono-historico-salidas',
      'telefono-historico-traslados',
    ]) {
      void qc.invalidateQueries({ queryKey: [k] })
    }
  }
}

/* ──────────────────────────────────────── ⬆ salida mixta */

export interface SalidaDelTelefono {
  id: number
  /** El número de la solicitud (SS-…). */
  numero: string
  /** ENTREGADA si quien la registró podía aprobarla; PEDIDA si queda «Por aprobar». */
  estado: 'ENTREGADA' | 'PEDIDA'
  /** La nota de salida (NS-…), cuando se entregó. */
  nota_salida: string | null
}

/**
 * La salida MIXTA del teléfono (decisión 0.1 «C» de la dueña, 08/11/2026):
 * se pide siempre y, si quien la registra puede aprobar salidas en ese almacén
 * y entregarlas, la base la aprueba y la entrega en la misma transacción.
 */
export function useSalidaDesdeElTelefono() {
  const invalidar = useInvalidarTodo()
  return useMutation({
    mutationFn: (s: {
      almacen_id: number
      renglones: { articulo_id: number; cantidad: number; propietario?: string | null }[]
      motivo: string
      empleado_id?: number | null
      externo?: string | null
      responsable?: string | null
    }) =>
      rpc<SalidaDelTelefono>('salida_desde_el_telefono', {
        p_almacen_id: s.almacen_id,
        p_renglones: s.renglones.map((r) => ({
          articulo_id: String(r.articulo_id),
          cantidad: String(r.cantidad),
          ...(r.propietario ? { propietario: r.propietario } : {}),
        })),
        p_motivo: s.motivo,
        p_empleado_id: s.empleado_id ?? null,
        p_externo: s.externo?.trim() || null,
        p_responsable: s.responsable?.trim() || null,
      }),
    onSuccess: invalidar,
  })
}

const SELECT_SOLICITUD =
  '*, almacen:almacenes(nombre), renglones:solicitud_salida_renglones(*, articulo:articulos(codigo, nombre, unidad))'

/** Una solicitud por su número, para armar su orden en PDF. */
export async function leerSolicitudPorNumero(numero: string): Promise<SolicitudDeSalida> {
  return desenvolver<SolicitudDeSalida>(
    await supabase.from('solicitudes_salida').select(SELECT_SOLICITUD).eq('numero', numero).single(),
  )
}

/* ──────────────────────────────────────── 🔁 traslado directo */

/** Los números (MOV-…) de las salidas de un traslado, para el mensaje. */
export async function numerosDeMovimientos(ids: number[]): Promise<string[]> {
  if (ids.length === 0) return []
  const filas = desenvolver<{ id: number; numero: string }[]>(
    await supabase.from('inventario_movimientos').select('id, numero').in('id', ids),
  )
  return ids.map((id) => filas.find((f) => f.id === id)?.numero).filter((n): n is string => !!n)
}

/* ──────────────────────────────────────── 🔄 por retornar */

export interface PrestamoPorRetornar {
  id: number
  numero: string | null
  articulo_id: number
  articulo_codigo: string
  articulo: string
  unidad: string
  empleado_id: number
  empleado: string
  fecha_entrega: string
  fecha_limite: string | null
  entregada_en: string
  nota: string | null
  /** Lo que todavía no volvió. */
  falta: string
  /** Lo que ya volvió por retornos parciales. */
  retornado: string
  /** Lo que salió: falta + retornado. */
  total: string
}

export function usePrestamosPorRetornar(almacenId: number | undefined, activa = true) {
  return useQuery({
    queryKey: ['telefono-por-retornar', almacenId ?? 0],
    queryFn: () => rpc<PrestamoPorRetornar[]>('prestamos_por_retornar', { p_almacen_id: almacenId }),
    enabled: activa && !!almacenId,
  })
}

export interface RetornoHecho {
  numero: string | null
  retorna: number
  retornado: number
  total: number
  falta: number
}

/** Retorno de un préstamo: todo o una parte. */
export function useRetornarPrestamo() {
  const invalidar = useInvalidarTodo()
  return useMutation({
    mutationFn: (r: { id: number; cantidad: number; nota?: string | null }) =>
      rpc<RetornoHecho>('devolver_parte_de_prestamo', {
        p_id: r.id,
        p_cantidad: r.cantidad,
        p_nota: r.nota?.trim() || null,
      }),
    onSuccess: invalidar,
  })
}

/* ──────────────────────────────────────── 📲 reporte de stock */

export interface FilaDeStock {
  articulo_id: number
  codigo: string
  nombre: string
  categoria: string
  unidad: string
  cierre: string
  entradas: string
  salidas: string
}

export function useReporteDeStock(almacenId: number | undefined, desde: string, hasta: string, activa = true) {
  return useQuery({
    queryKey: ['telefono-reporte-stock', almacenId ?? 0, desde, hasta],
    queryFn: () =>
      rpc<FilaDeStock[]>('reporte_de_stock', { p_almacen_id: almacenId, p_desde: desde, p_hasta: hasta }),
    enabled: activa && !!almacenId && !!desde && !!hasta && desde <= hasta,
  })
}

/* ──────────────────────────────────────── 🧾 histórico de salidas */

export interface PrestamoDelHistorico {
  id: number
  numero: string | null
  estado: string
  articulo: string
  unidad: string
  empleado: string
  cantidad: string
  fecha_entrega: string
  fecha_devolucion: string | null
  nota: string | null
}

/**
 * Las salidas de un almacén en unas fechas: las solicitudes (pedidas desde el
 * teléfono o desde Salidas) y los préstamos con retorno. Se piden desde la
 * base por almacén y fecha, no se filtra una lista ya traída.
 */
export function useHistoricoSalidas(almacenId: number | undefined, desde: string, hasta: string, activa = true) {
  return useQuery({
    queryKey: ['telefono-historico-salidas', almacenId ?? 0, desde, hasta],
    enabled: activa && !!almacenId && !!desde && !!hasta && desde <= hasta,
    queryFn: async () => {
      // `pedida_en` es un instante: el «hasta» se cierra al final del día de Caracas.
      const [solicitudes, prestamos] = await Promise.all([
        supabase
          .from('solicitudes_salida')
          .select(SELECT_SOLICITUD)
          .eq('almacen_id', almacenId!)
          .gte('pedida_en', `${desde}T00:00:00-04:00`)
          .lte('pedida_en', `${hasta}T23:59:59-04:00`)
          .order('pedida_en', { ascending: false })
          .limit(1000),
        supabase
          .from('v_asignaciones_herramienta')
          .select('id, numero, estado, articulo, unidad, empleado, cantidad, fecha_entrega, fecha_devolucion, nota, clase')
          .eq('almacen_id', almacenId!)
          .eq('clase', 'ASIGNACION')
          .gte('fecha_entrega', desde)
          .lte('fecha_entrega', hasta)
          .order('fecha_entrega', { ascending: false })
          .limit(1000),
      ])
      return {
        solicitudes: desenvolver<SolicitudDeSalida[]>(solicitudes),
        prestamos: desenvolver<PrestamoDelHistorico[]>(prestamos),
      }
    },
  })
}

/* ──────────────────────────────────────── 🔁 histórico de traslados */

export interface TrasladoDelHistorico {
  id: number
  numero: string
  fecha: string
  registrado_en: string
  registrado_por: string | null
  /** Salió de este almacén (−1) o entró a este almacén (+1). */
  signo: number
  cantidad: string
  unidad: string
  nota: string | null
  movimiento_origen: number | null
  articulo: { codigo: string; nombre: string } | null
  /** El otro almacén: el destino si salió de aquí, el origen si entró. */
  otro: string | null
}

/**
 * Los traslados de un almacén: las dos patas del libro (`TRANSFERENCIA_SALIDA`
 * desde aquí y `TRANSFERENCIA_ENTRADA` hacia aquí). El otro almacén se lee de
 * su pareja —la entrada cuelga de la salida por `movimiento_origen`—, no del
 * texto de la nota.
 */
export function useHistoricoTraslados(almacenId: number | undefined, desde: string, hasta: string, activa = true) {
  return useQuery({
    queryKey: ['telefono-historico-traslados', almacenId ?? 0, desde, hasta],
    enabled: activa && !!almacenId && !!desde && !!hasta && desde <= hasta,
    queryFn: async () => {
      type Fila = Omit<TrasladoDelHistorico, 'otro'>
      const filas = desenvolver<Fila[]>(
        (await supabase
          .from('inventario_movimientos')
          .select(
            'id, numero, fecha, registrado_en, registrado_por, signo, cantidad, unidad, nota, movimiento_origen, articulo:articulos(codigo, nombre)',
          )
          .eq('almacen_id', almacenId!)
          .in('tipo', ['TRANSFERENCIA_SALIDA', 'TRANSFERENCIA_ENTRADA'])
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .order('registrado_en', { ascending: false })
          .limit(1000)) as never,
      )
      const salidas = filas.filter((f) => f.signo < 0).map((f) => f.id)
      const origenes = filas.filter((f) => f.signo > 0 && f.movimiento_origen).map((f) => f.movimiento_origen!)
      const [parejas, de] = await Promise.all([
        salidas.length
          ? supabase
              .from('inventario_movimientos')
              .select('movimiento_origen, almacen:almacenes(nombre)')
              .in('movimiento_origen', salidas)
              .eq('tipo', 'TRANSFERENCIA_ENTRADA')
          : Promise.resolve({ data: [], error: null }),
        origenes.length
          ? supabase.from('inventario_movimientos').select('id, almacen:almacenes(nombre)').in('id', origenes)
          : Promise.resolve({ data: [], error: null }),
      ])
      const destinos = desenvolver<{ movimiento_origen: number; almacen: { nombre: string } | null }[]>(
        parejas as never,
      )
      const procedencias = desenvolver<{ id: number; almacen: { nombre: string } | null }[]>(de as never)
      return filas.map<TrasladoDelHistorico>((f) => ({
        ...f,
        otro:
          f.signo < 0
            ? (destinos.find((d) => d.movimiento_origen === f.id)?.almacen?.nombre ?? null)
            : (procedencias.find((d) => d.id === f.movimiento_origen)?.almacen?.nombre ?? null),
      }))
    },
  })
}
