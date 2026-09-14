/**
 * Lo que sale de la planta, camión por camión.
 *
 * Es el denominador del costo por metro cúbico. Los m³ son la carga útil del
 * camión, no una medida: por eso la pantalla dice «estimado». Va separado de
 * facturación a propósito: la salida no espera a la factura.
 *
 * Los numéricos llegan como `string` y a veces como `number`: no se les llama
 * `.trim()` a secas.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

export interface SalidaPlanta {
  id: number
  numero: string
  fecha: string
  vehiculo_id: number
  placa: string
  transportista: string | null
  propio: boolean
  producto_id: number
  producto: string
  /** Nulo cuando el camión no tiene carga útil y nadie tecleó los m³. */
  m3: string | null
  cliente_id: number | null
  cliente: string | null
  nota_entrega_id: number | null
  nota: string | null
  estado: 'REGISTRADO' | 'ANULADO'
  motivo_anulacion: string | null
  registrado_en: string
  registrado_por_nombre: string | null
}

export interface ProductoDePlanta {
  id: number
  codigo: string
  nombre: string
}

/**
 * Una salida cambia lo que está por aceptar en el centro de costo, así que se
 * invalida también.
 */
function useAccion<A>(fn: (a: A) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['salidas-planta'] })
      void qc.invalidateQueries({ queryKey: ['costos'] })
    },
  })
}

export function useSalidasDelDia(fecha: string) {
  return useQuery({
    queryKey: ['salidas-planta', fecha],
    enabled: Boolean(fecha),
    queryFn: async () =>
      desenvolver<SalidaPlanta[]>(
        await supabase
          .from('v_salidas_planta')
          .select('*')
          .eq('fecha', fecha)
          .order('id', { ascending: false }),
      ),
  })
}

/**
 * Los productos de la planta. Por función, no leyendo el catálogo: quien
 * anota en planta no tiene por qué tener Inventario, y una vista sin permiso
 * devolvería un combo vacío sin decir por qué.
 */
export function useProductosDePlanta() {
  return useQuery({
    queryKey: ['salidas-planta', 'productos'],
    staleTime: 10 * 60_000,
    queryFn: () => rpc<ProductoDePlanta[]>('productos_de_planta'),
  })
}

export function useRegistrarSalida() {
  return useAccion(
    (s: {
      fecha: string
      vehiculo_id: number
      producto_id: number
      m3?: number | null
      cliente_id?: number | null
      nota?: string | null
    }) =>
      rpc<number>('registrar_salida_planta', {
        p_fecha: s.fecha,
        p_vehiculo_id: s.vehiculo_id,
        p_producto_id: s.producto_id,
        p_m3: s.m3 ?? null,
        p_cliente_id: s.cliente_id ?? null,
        p_nota: s.nota ?? null,
      }),
  )
}

export function useAnularSalida() {
  return useAccion((a: { id: number; motivo: string }) =>
    rpc('anular_salida_planta', { p_id: a.id, p_motivo: a.motivo }),
  )
}
