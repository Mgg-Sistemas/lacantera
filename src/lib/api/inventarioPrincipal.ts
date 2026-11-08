import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/*
  LA PANTALLA PRINCIPAL DE INVENTARIO, FASES 3 Y 4 DE «ALMACÉN E INVENTARIO
  COMO MGG» (08/11/2026).

  Lo que necesitan los modales de MGG (trazabilidad, resumen, sin costo) y que
  no tenía ya su gancho. Las escrituras son RPC: las de siempre por sus ganchos
  de siempre (`useRegistrarEntradas`, `useTransferir`, `useRegistrarAjuste`,
  `useReversarMovimiento`, `useSalidaDesdeElTelefono`…) y la nueva de la
  migración `20261109000000_inventario_como_mgg_fase_4.sql`.

  Las lecturas cuelgan de la clave «movimientos»: toda escritura de inventario
  ya invalida esa clave, así que el kardex y el resumen se refrescan solos
  después de un movimiento, sin acordarse de nada más.
*/

/* ──────────────────────────────────────── 📋 kardex */

/** Un renglón del kardex de MGG (`historial_articulo_v2`). */
export interface FilaDeKardex {
  id: number
  numero: string
  fecha: string
  registrado_en: string
  tipo: string
  signo: number
  cantidad: string
  unidad: string
  almacen_id: number
  almacen: string
  almacen_tipo: string
  propietario: string | null
  /** Nulos sin INVENTARIO.VER_VALORACION, como en `v_existencias`. */
  costo_usd: string | null
  valor_usd: string | null
  /** El costo promedio del almacén después de este movimiento. */
  pmp_despues: string | null
  /** Lo que quedó en este almacén después de este movimiento. */
  saldo_almacen: string
  nota: string | null
  nota_salida: string | null
  razon_salida: string | null
  quien: string | null
  para_quien: string | null
  orden: string | null
  traslado: string | null
  traslado_origen: string | null
  traslado_destino: string | null
  reversado: boolean
  /** La misma regla que `reversar_movimiento`, dicha antes de pulsar. */
  reversable: boolean
  /** Cuántos movimientos tiene el artículo en total (el kardex puede venir recortado). */
  total: number
}

export const TOPE_DEL_KARDEX = 1000

export function useKardexArticulo(articuloId: number | null) {
  return useQuery({
    queryKey: ['movimientos', 'kardex', articuloId],
    enabled: articuloId != null,
    queryFn: () =>
      rpc<FilaDeKardex[]>('historial_articulo_v2', {
        p_articulo_id: articuloId,
        p_limite: TOPE_DEL_KARDEX,
      }),
  })
}

/* ──────────────────────────────────────── 📊 resumen */

export interface MovimientoDelResumen {
  id: number
  fecha: string
  registrado_en: string
  tipo: string
  signo: number
  cantidad: string
  unidad: string
  valor_usd: string | null
  almacen_id: number
  articulo_id: number
  articulo: { codigo: string; nombre: string } | null
  almacen: { nombre: string; tipo: string } | null
  /** El almacén donde entró la otra pata, cuando es la salida de un traslado. */
  destino: string | null
}

/**
 * Las salidas, los traslados y las entradas de un período, para «📊 Resumen
 * de Inventario». Se filtra por `fecha` (el día en que pasó), como el libro.
 */
export function useMovimientosDelResumen(desde: string, hasta: string, activa = true) {
  return useQuery({
    queryKey: ['movimientos', 'resumen', desde, hasta],
    enabled: activa && !!desde && !!hasta,
    queryFn: async () => {
      const filas = desenvolver<Omit<MovimientoDelResumen, 'destino'>[]>(
        (await supabase
          .from('inventario_movimientos')
          .select(
            'id, fecha, registrado_en, tipo, signo, cantidad, unidad, valor_usd, almacen_id, articulo_id, articulo:articulos(codigo, nombre), almacen:almacenes(nombre, tipo)',
          )
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .or('tipo.like.SALIDA*,tipo.like.ENTRADA*,tipo.eq.TRANSFERENCIA_SALIDA')
          .order('registrado_en', { ascending: false })
          .limit(5000)) as never,
      )

      // A dónde fue cada traslado: la entrada cuelga de la salida.
      const salidas = filas.filter((f) => f.tipo === 'TRANSFERENCIA_SALIDA').map((f) => f.id)
      const destinos = new Map<number, string>()
      for (let i = 0; i < salidas.length; i += 200) {
        const tanda = salidas.slice(i, i + 200)
        const pares = desenvolver<{ movimiento_origen: number; almacen: { nombre: string; tipo: string } | null }[]>(
          (await supabase
            .from('inventario_movimientos')
            .select('movimiento_origen, almacen:almacenes(nombre, tipo)')
            .in('movimiento_origen', tanda)
            .eq('tipo', 'TRANSFERENCIA_ENTRADA')) as never,
        )
        for (const p of pares) {
          destinos.set(p.movimiento_origen, p.almacen?.tipo === 'TRANSITO' ? 'En tránsito' : (p.almacen?.nombre ?? ''))
        }
      }
      return filas.map((f) => ({ ...f, destino: destinos.get(f.id) ?? null }))
    },
  })
}

/* ──────────────────────────────────────── ⚠ sin costo */

export interface CostoSugerido {
  costo_usd: number
  orden: string | null
}

/**
 * El último costo de compra de cada artículo, para el «sugerido de {OC}» de
 * «Productos sin costo». Solo lo que entró por una compra y con cifra.
 */
export function useCostosSugeridos(articuloIds: number[], activa = true) {
  const ids = [...new Set(articuloIds)].sort((a, b) => a - b)
  return useQuery({
    queryKey: ['movimientos', 'costos-sugeridos', ids],
    enabled: activa && ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const mapa = new Map<number, CostoSugerido>()
      for (let i = 0; i < ids.length; i += 200) {
        const tanda = ids.slice(i, i + 200)
        const filas = desenvolver<
          { articulo_id: number; costo_usd: string | null; orden: { numero: string } | null }[]
        >(
          (await supabase
            .from('inventario_movimientos')
            .select('articulo_id, costo_usd, orden:ordenes_compra(numero)')
            .in('articulo_id', tanda)
            .eq('tipo', 'ENTRADA_COMPRA')
            .not('costo_usd', 'is', null)
            .order('registrado_en', { ascending: false })
            .limit(2000)) as never,
        )
        for (const f of filas) {
          if (!mapa.has(f.articulo_id) && Number(f.costo_usd) > 0) {
            mapa.set(f.articulo_id, { costo_usd: Number(f.costo_usd), orden: f.orden?.numero ?? null })
          }
        }
      }
      return mapa
    },
  })
}

/** Lo que devuelve `valorar_sin_costo`. */
export interface Valoracion {
  renglones: number
  unidades: number
  valor_usd: number
  movimientos: number[]
}

/**
 * «Guardar {n} con costo»: le pone costo a lo que entró sin valorar, con un
 * AJUSTE_COSTO en pareja por cada uno (`valorar_sin_costo`, fase 4).
 */
export function useValorarSinCosto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: {
      renglones: { almacen_id: number; articulo_id: number; costo: number; moneda: string }[]
      motivo?: string | null
    }) =>
      rpc<Valoracion>('valorar_sin_costo', {
        p_renglones: v.renglones.map((r) => ({
          almacen_id: String(r.almacen_id),
          articulo_id: String(r.articulo_id),
          costo: String(r.costo),
          moneda: r.moneda,
        })),
        p_motivo: v.motivo?.trim() || null,
      }),
    onSuccess: () => {
      for (const k of ['existencias', 'existencias-totales', 'existencias-articulo', 'movimientos', 'notificaciones']) {
        void qc.invalidateQueries({ queryKey: [k] })
      }
    },
  })
}
