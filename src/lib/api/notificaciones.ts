import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

export type Modulo = 'COMPRAS' | 'INVENTARIO' | 'NOMINA' | 'TESORERIA' | 'VENTAS' | 'SISTEMA'
export type Importancia = 'INFO' | 'ATENCION' | 'URGENTE'

export interface Notificacion {
  id: number
  modulo: Modulo
  tipo: string
  titulo: string
  detalle: string | null
  /** A dónde lleva el clic. Puede faltar en avisos que no abren nada. */
  ruta: string | null
  importancia: Importancia
  creada_en: string
  actor_id: string | null
  actor: string | null
  leida: boolean
}

/**
 * Se consulta cada medio minuto en vez de por suscripción en vivo.
 *
 * Un aviso de este sistema no es un mensaje de chat: que "hay un pago por
 * ejecutar" llegue treinta segundos después no cambia nada, y una conexión
 * permanente abierta en cada pestaña sí se cae sola cuando la red del patio
 * flaquea. Además, cada acción propia invalida esta consulta, así que lo que
 * uno mismo provoca aparece al instante.
 */
export function useNotificaciones(limite = 40) {
  return useQuery({
    queryKey: ['notificaciones'],
    queryFn: async () =>
      desenvolver<Notificacion[]>(
        await supabase
          .from('v_mis_notificaciones')
          .select('*')
          .order('creada_en', { ascending: false })
          .limit(limite),
      ),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
}

export function useMarcarLeida() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { id: number }) => rpc('marcar_notificacion_leida', { p_id: p.id }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  })
}

export function useMarcarTodasLeidas() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => rpc<number>('marcar_notificaciones_leidas'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  })
}
