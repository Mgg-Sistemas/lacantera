import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/*
  EL CONTROL DE ALIMENTACIÓN

  Christopher, 05/10/2026: «como lo manejan en MGG te lo traes para La
  Cantera». Cada comida servida al personal —desayuno, almuerzo o cena— se
  registra con cuántas personas comieron y qué víveres se gastaron. Los
  víveres se descuentan del inventario al costo promedio, y de ahí sale el
  número que justifica el módulo: EL COSTO POR PLATO.

  La comida no se edita ni se borra: SE ANULA con motivo —el cocinero puede
  anular la de hoy; las de otros días piden control total— y los víveres
  vuelven al inventario con un reverso. Como todo en la casa, la base manda:
  la pantalla solo adelanta lo que la base va a exigir igual.
*/

export type TipoComida = 'DESAYUNO' | 'ALMUERZO' | 'CENA'

export const TIPOS_DE_COMIDA: { tipo: TipoComida; nombre: string; emoji: string }[] = [
  { tipo: 'DESAYUNO', nombre: 'Desayuno', emoji: '🍳' },
  { tipo: 'ALMUERZO', nombre: 'Almuerzo', emoji: '🍽️' },
  { tipo: 'CENA', nombre: 'Cena', emoji: '🌙' },
]

export interface RenglonDeComida {
  articulo_id: number
  articulo: string
  unidad: string
  cantidad: string
  costo_usd: string
  valor_usd: string
}

export interface Comida {
  id: number
  numero: string
  fecha: string
  tipo: TipoComida
  platos: number
  almacen_id: number
  almacen: string
  valor_usd: string
  costo_por_plato_usd: string | null
  origen: 'PC' | 'TELEFONO'
  nota: string | null
  estado: 'SERVIDA' | 'ANULADA'
  renglones: RenglonDeComida[]
  servida_por: string | null
  servida_en: string
  anulada_en: string | null
  anulada_por: string | null
  motivo_anulacion: string | null
}

/** Lo que responde la base al servir: para el acuse, sin otra consulta. */
export interface ComidaServida {
  id: number
  numero: string
  valor_usd: number
  costo_por_plato_usd: number
}

export function useComidas(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['alimentacion', 'comidas', desde, hasta],
    queryFn: async () =>
      desenvolver<Comida[]>(
        await supabase
          .from('v_comidas')
          .select('*')
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .order('fecha', { ascending: false })
          .order('id', { ascending: false }),
      ),
  })
}

/**
 * Los víveres con existencia, por almacén.

 * Sale de la misma vista de existencias que usa todo el mundo: la categoría
 * VIVERES es lo único que distingue la comida de un repuesto.
 */
export interface ViverEnAlmacen {
  almacen_id: number
  almacen: string
  articulo_id: number
  articulo: string
  unidad: string
  existencia: string
  stock_minimo: string
  costo_promedio_usd: string | null
}

export function useViveres() {
  return useQuery({
    queryKey: ['alimentacion', 'viveres'],
    queryFn: async () =>
      desenvolver<ViverEnAlmacen[]>(
        await supabase
          .from('v_existencias')
          .select('almacen_id, almacen, articulo_id, articulo, unidad, existencia, stock_minimo, costo_promedio_usd')
          .eq('categoria', 'VIVERES')
          .gt('existencia', 0)
          .order('articulo'),
      ),
  })
}

function useAccion<A, R = unknown>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['alimentacion'] })
      // La comida descuenta inventario: las existencias cambian con ella.
      void qc.invalidateQueries({ queryKey: ['existencias'] })
      void qc.invalidateQueries({ queryKey: ['movimientos'] })
    },
  })
}

export function useServirComida() {
  return useAccion(
    (c: {
      tipo: TipoComida
      platos: number
      almacen_id: number
      renglones: { articulo_id: number; cantidad: number }[]
      fecha?: string | null
      nota?: string | null
      origen?: 'PC' | 'TELEFONO'
    }) =>
      rpc<ComidaServida>('servir_comida', {
        p_tipo: c.tipo,
        p_platos: c.platos,
        p_almacen_id: c.almacen_id,
        p_renglones: c.renglones,
        p_fecha: c.fecha ?? null,
        p_nota: c.nota ?? null,
        p_origen: c.origen ?? 'PC',
      }),
  )
}

export function useAnularComida() {
  return useAccion((a: { id: number; motivo: string }) =>
    rpc<void>('anular_comida', { p_id: a.id, p_motivo: a.motivo }),
  )
}

/* ────────────────────────────────────── la solicitud de mercado ──────────

   Traída de MGG: la cocina arma la lista de compra —todos los víveres, con
   las cantidades de la última vez— y la manda. Por debajo es un pedido de
   compras de verdad (SOL-…, urgente) que la oficina cotiza, aprueba y
   recibe; la cocina no necesita el permiso de Compras porque la puerta
   `solicitar_mercado` pide el de Alimentación. */

export interface ListaDeMercado {
  numero: string
  fecha: string
  estado: string
  renglones: { articulo_id: number; cantidad: string }[]
}

/** La última solicitud de mercado, para sugerir cantidades. Nula si no hay. */
export function useUltimaListaDeMercado() {
  return useQuery({
    queryKey: ['alimentacion', 'mercado', 'ultima'],
    queryFn: () => rpc<ListaDeMercado | null>('ultima_lista_de_mercado', {}),
  })
}

export interface MercadoSolicitado {
  id: number
  numero: string
}

export function useSolicitarMercado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: {
      renglones: {
        articulo_id?: number | null
        descripcion?: string
        cantidad: number
        observacion?: string | null
      }[]
      almacen_id?: number | null
      nota?: string | null
    }) =>
      rpc<MercadoSolicitado>('solicitar_mercado', {
        p_renglones: p.renglones,
        p_almacen_id: p.almacen_id ?? null,
        p_nota: p.nota ?? null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['alimentacion'] })
      // El pedido aparece en el tablero de Compras de quien lo tenga abierto.
      void qc.invalidateQueries({ queryKey: ['compras'] })
      void qc.invalidateQueries({ queryKey: ['notificaciones'] })
    },
  })
}
