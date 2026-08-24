import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from '@/lib/api/rpc'

/*
  LO QUE SE LE HA COMPRADO A UN PROVEEDOR

  La líder: «se necesita estadísticas sobre los proveedores, tal que, item más
  solicitado, total invertido, invertido este mes».

  Todo sale de las órdenes aprobadas, no de las facturas ni de los pagos: una
  orden es dinero comprometido, y esa es la pregunta que se está haciendo
  —cuánto le hemos comprado a este— y no cuánto le hemos desembolsado.

  Y en dólares, con la tasa que congeló cada orden: un proveedor puede haber
  cotizado en bolívares en enero y en dólares en marzo, y sumar las dos cifras
  tal cual daría un número sin significado.
*/

export interface ResumenProveedor {
  proveedor_id: number
  nombre: string
  rif: string
  ordenes: number
  invertido_usd: string
  invertido_mes_usd: string
  ordenes_mes: number
  ultima_compra: string | null
  /** Lo que más veces aparece en sus órdenes. Por veces, no por monto. */
  articulo_frecuente: string | null
  renglones: number
}

export interface ArticuloDeProveedor {
  proveedor_id: number
  articulo: string
  articulo_codigo: string | null
  unidad: string | null
  veces: number
  cantidad: string
  invertido_usd: string
  ultima_vez: string
}

/** El resumen de todos, para la lista. */
export function useResumenProveedores() {
  return useQuery({
    queryKey: ['proveedores', 'resumen'],
    queryFn: async () =>
      desenvolver<ResumenProveedor[]>(
        await supabase.from('v_proveedor_resumen').select('*').order('invertido_usd', {
          ascending: false,
        }),
      ),
    staleTime: 60_000,
  })
}

/** El de uno solo, para su ficha. */
export function useResumenProveedor(id: number | null | undefined) {
  return useQuery({
    enabled: id !== null && id !== undefined,
    queryKey: ['proveedores', 'resumen', id],
    queryFn: async () =>
      desenvolver<ResumenProveedor | null>(
        await supabase.from('v_proveedor_resumen').select('*').eq('proveedor_id', id!).maybeSingle(),
      ),
  })
}

/** Qué se le compra, de lo más comprado a lo menos. */
export function useArticulosDeProveedor(id: number | null | undefined) {
  return useQuery({
    enabled: id !== null && id !== undefined,
    queryKey: ['proveedores', 'articulos', id],
    queryFn: async () =>
      desenvolver<ArticuloDeProveedor[]>(
        await supabase
          .from('v_proveedor_articulos')
          .select('*')
          .eq('proveedor_id', id!)
          .order('invertido_usd', { ascending: false }),
      ),
  })
}

/*
  QUÉ UNIDAD GASTA MÁS

  La otra pregunta de la líder. Gasto y consumo van en columnas separadas
  porque son dos cosas: una unidad puede haber comprado mucho que todavía está
  en el estante, o estar consumiendo lo que compró hace meses.
*/
export interface GastoDeUnidad {
  unidad: string
  tipo_sitio: string | null
  almacen_id: number | null
  pedidos: number
  ordenes: number
  gastado_usd: string
  gastado_mes_usd: string
  consumido_usd: string
  ultima_compra: string | null
}

/**
 * El gasto por unidad, en el período que se pida.
 *
 * Pasó de vista a función porque una vista no recibe parámetros y esta ya viene
 * agregada: no quedan filas que filtrar desde fuera, solo totales ya sumados.
 *
 * Sin fechas devuelve todo, que es lo que devolvía la vista.
 */
export function useGastoPorUnidad(rango: { desde?: string; hasta?: string } = {}) {
  return useQuery({
    queryKey: ['compras', 'gasto-por-unidad', rango.desde ?? '', rango.hasta ?? ''],
    queryFn: async () => {
      const filas = await rpc<GastoDeUnidad[]>('gasto_por_unidad', {
        p_desde: rango.desde || null,
        p_hasta: rango.hasta || null,
      })
      // El orden se pone aquí y no en la función: una función que devuelve
      // filas no garantiza el orden salvo que lo diga, y decirlo dentro obliga
      // a tocar la base el día que se quiera ordenar por otra columna.
      return [...filas].sort((a, b) => Number(b.gastado_usd) - Number(a.gastado_usd))
    },
    staleTime: 60_000,
  })
}

/*
  LOS PAPELES DE UN PROVEEDOR

  Christopher: «los comprobantes de pago o facturas o respaldos que se carguen
  en la OC, deberá reflejarse o ligarse al dicho proveedor para recordar
  siempre el movimiento».

  Los papeles cuelgan de la orden —es el único documento presente cuando llega
  cada uno— y la orden cuelga del proveedor, así que la relación ya existía:
  lo que faltaba era el camino para recorrerla al revés y verlos todos juntos.

  Se traen con el número de la orden al lado. Un papel suelto no dice nada;
  «comprobante de pago de la OC-2026-0004» sí.
*/
export interface PapelDeProveedor {
  id: number
  orden_id: number
  tipo: string
  archivo_path: string
  archivo_nombre: string
  subido_en: string
  orden: { numero: string; total: string; moneda: string } | null
}

export function usePapelesDeProveedor(id: number | null | undefined) {
  return useQuery({
    enabled: id !== null && id !== undefined,
    queryKey: ['proveedores', 'papeles', id],
    queryFn: async () => {
      // Primero sus órdenes: la tabla de papeles no guarda el proveedor, y
      // pedirle a PostgREST que filtre por una relación anidada obliga a un
      // `!inner` que aquí no aporta nada.
      const ordenes = desenvolver<Array<{ id: number; numero: string; total: string; moneda: string }>>(
        await supabase
          .from('ordenes_compra')
          .select('id, numero, total, moneda')
          .eq('proveedor_id', id!),
      )
      if (ordenes.length === 0) return []

      const papeles = desenvolver<PapelDeProveedor[]>(
        await supabase
          .from('compras_papeles')
          .select('*')
          .in(
            'orden_id',
            ordenes.map((o) => o.id),
          )
          .order('subido_en', { ascending: false }),
      )

      const porId = new Map(ordenes.map((o) => [o.id, o]))
      return papeles.map((p) => ({ ...p, orden: porId.get(p.orden_id) ?? null }))
    },
  })
}
