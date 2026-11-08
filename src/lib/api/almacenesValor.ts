import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'
import type { Existencia } from './inventario'

/*
  ▣ ALMACENES COMO MGG · LO QUE SE LEE (fase 6, 08/11/2026)

  Solo lecturas, sobre lo que ya existe: `v_existencias` para el valor, las
  unidades y los productos de cada almacén, `inventario_movimientos` para las
  entradas, las salidas y el consumo, y `que_impide_desactivar_almacen` para
  avisar antes del ✕. Ninguna migración: lo que MGG guarda en columnas (sede,
  subalmacén, ubicación física) aquí no existe y no se inventa.

  Vive en su propio archivo y no en `inventario.ts` para no pisar a las otras
  fases, que tocan ese archivo al mismo tiempo.
*/

/** Los sitios que las cuentas nuevas no miran: combustible no se toca. */
export const FUERA_DE_VALORES = ['COMBUSTIBLE', 'TRANSITO']

/*
  QUÉ ES «USADO».

  MGG cuenta como consumo los movimientos tipo `salida`: todo lo que deja el
  almacén y no vuelve (no los traslados ni los ajustes). Aquí eso son las
  salidas del libro: a consumo, por despacho, como pago de una compra, merma y
  las bajas viejas. Un traslado no es consumo: el material sigue en la empresa.
*/
export const TIPOS_DE_CONSUMO = [
  'SALIDA_CONSUMO',
  'SALIDA_DESPACHO',
  'SALIDA_INTERCAMBIO',
  'SALIDA_MERMA',
  'SALIDA_BAJA',
]

/*
  LO QUE NO ES ENTRADA NI SALIDA DE MATERIAL.

  La corrección de costo se asienta como un par (sale todo y vuelve a entrar
  con otro costo) y el cambio de dueño también (deja de ser de uno y pasa a ser
  del otro, en el mismo almacén). Contarlos inflaría las dos columnas con
  material que nunca se movió.
*/
const NO_MUEVEN_MATERIAL = ['AJUSTE_COSTO', 'CAMBIO_DUENO_SALIDA', 'CAMBIO_DUENO_ENTRADA']

/** Un renglón del libro, con lo justo para sumar. */
export interface MovimientoDeAlmacen {
  id: number
  numero: string
  fecha: string
  tipo: string
  signo: number
  articulo_id: number
  cantidad: string
  valor_usd: string | null
  movimiento_origen: number | null
}

/** Lo que el libro trae de una vez. PostgREST corta en mil. */
const TANDA = 1000

/**
 * Todo el libro de un almacén.
 *
 * Se trae entero (en tandas de mil) porque «Total usados» y «Consumo diario»
 * son de toda la historia, y un total calculado sobre las últimas doscientas
 * filas sería un número equivocado y callado. Con eso mismo se arma el modal de
 * consumo, filtrando por fecha aquí: así un reverso de un día que cae fuera
 * del período sigue anulando su salida.
 */
export function useMovimientosDeAlmacen(almacenId: number | null) {
  return useQuery({
    queryKey: ['movimientos-de-almacen', almacenId],
    enabled: almacenId !== null,
    staleTime: 60_000,
    queryFn: async () => {
      const todos: MovimientoDeAlmacen[] = []
      for (let desde = 0; ; desde += TANDA) {
        const tanda = desenvolver<MovimientoDeAlmacen[]>(
          await supabase
            .from('inventario_movimientos')
            .select('id, numero, fecha, tipo, signo, articulo_id, cantidad, valor_usd, movimiento_origen')
            .eq('almacen_id', almacenId as number)
            .order('id', { ascending: true })
            .range(desde, desde + TANDA - 1),
        )
        todos.push(...tanda)
        if (tanda.length < TANDA) break
      }
      return todos
    },
  })
}

/**
 * Los movimientos que cuentan: sin los que se deshicieron.
 *
 * Un reverso apunta a su original con `movimiento_origen`. Los dos se sacan:
 * una salida reversada no se usó, y contar la salida y su reverso como una
 * entrada y una salida describiría algo que no pasó.
 */
export function movimientosQueCuentan(movs: MovimientoDeAlmacen[]): MovimientoDeAlmacen[] {
  const reversados = new Set<number>()
  for (const m of movs) if (m.tipo === 'REVERSO' && m.movimiento_origen) reversados.add(m.movimiento_origen)
  return movs.filter((m) => m.tipo !== 'REVERSO' && !reversados.has(m.id))
}

/** Lo que MGG enseña de cada producto en el detalle de un almacén. */
export interface EstadisticaDeProducto {
  /** «Total de entradas históricas». */
  entradas: number
  /** «Total de salidas históricas». */
  salidas: number
  /** «Total usados»: lo que salió y no volvió. */
  usados: number
  /** «Consumo diario»: usados ÷ días desde la primera salida. */
  diario: number
}

/**
 * Entradas, salidas, usados y consumo diario por artículo
 * (`movStatsDeAlmacen` y `consumoDeAlmacen` de MGG en una sola pasada).
 */
export function estadisticasDeAlmacen(
  movs: MovimientoDeAlmacen[],
  hoy: string,
): Map<number, EstadisticaDeProducto> {
  const acc = new Map<number, EstadisticaDeProducto & { primera: string | null }>()
  for (const m of movimientosQueCuentan(movs)) {
    if (NO_MUEVEN_MATERIAL.includes(m.tipo)) continue
    const cant = Math.abs(Number(m.cantidad) || 0)
    const cur = acc.get(m.articulo_id) ?? { entradas: 0, salidas: 0, usados: 0, diario: 0, primera: null }
    if (m.signo > 0) cur.entradas += cant
    else cur.salidas += cant
    if (TIPOS_DE_CONSUMO.includes(m.tipo)) {
      cur.usados += cant
      if (!cur.primera || m.fecha < cur.primera) cur.primera = m.fecha
    }
    acc.set(m.articulo_id, cur)
  }

  const out = new Map<number, EstadisticaDeProducto>()
  const fin = Date.parse(`${hoy}T00:00:00`)
  for (const [id, v] of acc) {
    let diario = 0
    if (v.primera && v.usados > 0) {
      const dias = Math.max(1, Math.ceil((fin - Date.parse(`${v.primera}T00:00:00`)) / 86_400_000))
      diario = Math.round((v.usados / dias) * 100) / 100
    }
    out.set(id, { entradas: v.entradas, salidas: v.salidas, usados: v.usados, diario })
  }
  return out
}

/** Una fila del modal «📊 Consumo»: un producto consumido en el período. */
export interface ConsumoDeProducto {
  articulo_id: number
  codigo: string
  nombre: string
  unidad: string
  cantidad: number
  /** Cantidad × costo del movimiento. Lo sin valorar suma cero. */
  valor: number
  movimientos: MovimientoDeAlmacen[]
}

/**
 * El consumo por producto entre dos fechas (`consumoPorProductoEnAlmacen` de
 * MGG). Las fechas son días de Caracas, `AAAA-MM-DD`, y entran las dos.
 */
export function consumoPorProducto(
  movs: MovimientoDeAlmacen[],
  desde: string,
  hasta: string,
  existencias: Existencia[],
): ConsumoDeProducto[] {
  const acc = new Map<number, ConsumoDeProducto>()
  for (const m of movimientosQueCuentan(movs)) {
    if (!TIPOS_DE_CONSUMO.includes(m.tipo)) continue
    if (m.fecha < desde || m.fecha > hasta) continue
    const cant = Math.abs(Number(m.cantidad) || 0)
    if (cant <= 0) continue
    let cur = acc.get(m.articulo_id)
    if (!cur) {
      const e = existencias.find((x) => x.articulo_id === m.articulo_id)
      cur = {
        articulo_id: m.articulo_id,
        codigo: e?.articulo_codigo ?? '—',
        nombre: e?.articulo ?? `Artículo ${m.articulo_id}`,
        unidad: e?.unidad ?? '',
        cantidad: 0,
        valor: 0,
        movimientos: [],
      }
      acc.set(m.articulo_id, cur)
    }
    cur.cantidad += cant
    cur.valor += Math.abs(Number(m.valor_usd) || 0)
    cur.movimientos.push(m)
  }
  return [...acc.values()]
}

/** Lo que bloquea o avisa antes de desactivar un almacén. Lo calcula la base. */
export interface ImpedimentoDeAlmacen {
  nivel: 'BLOQUEA' | 'AVISA'
  que: string
  cuantos: number
  detalle: string
}

/** `que_impide_desactivar_almacen`: la misma lista con la que la base se niega. */
export function useQueImpideDesactivarAlmacen(almacenId: number | null) {
  return useQuery({
    queryKey: ['almacenes', 'que-impide-desactivar', almacenId],
    enabled: almacenId !== null,
    queryFn: () => rpc<ImpedimentoDeAlmacen[]>('que_impide_desactivar_almacen', { p_id: almacenId }),
  })
}

/** Valor, productos y unidades de un almacén (`AlmacenValor` de MGG). */
export interface ValorDeAlmacen {
  valor: number
  /** Productos con existencia distinta de cero (MGG no cuenta las filas en cero). */
  items: number
  unidades: number
}

export const VALOR_VACIO: ValorDeAlmacen = { valor: 0, items: 0, unidades: 0 }

/** `agruparValores` de MGG, sobre `v_existencias`, por id de almacén. */
export function valoresPorAlmacen(existencias: Existencia[]): Map<number, ValorDeAlmacen> {
  const out = new Map<number, ValorDeAlmacen>()
  for (const e of existencias) {
    const stock = Number(e.existencia) || 0
    if (stock === 0) continue
    const v = out.get(e.almacen_id) ?? { valor: 0, items: 0, unidades: 0 }
    v.valor += Number(e.valor_usd) || 0
    v.items += 1
    v.unidades += stock
    out.set(e.almacen_id, v)
  }
  return out
}
