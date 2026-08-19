import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/**
 * La romana y las guías.
 *
 * Los dos papeles que acompañan al camión y que existen aunque no haya venta:
 * se pesa lo que entra y se emiten guías antes de que nadie cargue. Ventas los
 * consume; aquí se producen.
 */

export interface Ticket {
  id: number
  numero: string
  fecha: string
  hora: string | null
  tipo: string
  vehiculo: string
  chofer: string | null
  cedula_chofer: string | null
  transportista: string | null
  articulo_id: number | null
  articulo: string | null
  unidad: string | null
  cliente_id: number | null
  cliente: string | null
  proveedor_id: number | null
  proveedor: string | null
  peso_bruto: string
  peso_tara: string
  peso_neto: string
  romana: string | null
  operador: string | null
  nota: string | null
  estado: string
  nota_entrega: string | null
  motivo_anulacion: string | null
  registrado_en: string
}

export interface Guia {
  id: number
  numero: string
  numero_guia: string
  fecha_emision: string
  vigencia_hasta: string
  vencida: boolean
  dias_para_vencer: number
  frente_id: number | null
  frente: string | null
  frente_codigo: string | null
  origen: string | null
  destino: string
  cliente_id: number | null
  cliente: string | null
  articulo_id: number
  articulo: string
  /** M3 o TON, lo que diga el papel del ministerio. */
  unidad: string
  cantidad: string
  transportista: string | null
  vehiculo: string | null
  chofer: string | null
  cedula_chofer: string | null
  observacion: string | null
  estado: string
  nota_entrega: string | null
  motivo_anulacion: string | null
  registrada_en: string
}

export const TIPOS_TICKET = [
  { valor: 'SALIDA', etiqueta: 'Salida — material que se va' },
  { valor: 'ENTRADA', etiqueta: 'Entrada — algo que llega' },
]

function useAccion<A, R = unknown>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['despachos'] })
      void qc.invalidateQueries({ queryKey: ['ventas'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Romana
// ---------------------------------------------------------------------------

export function useTickets(estado?: string) {
  return useQuery({
    queryKey: ['despachos', 'tickets', estado ?? 'todos'],
    queryFn: async () => {
      let q = supabase.from('v_romana_tickets').select('*')
      if (estado) q = q.eq('estado', estado)
      return desenvolver<Ticket[]>(
        await q.order('fecha', { ascending: false }).order('id', { ascending: false }).limit(400),
      )
    },
  })
}

export function useRegistrarTicket() {
  return useAccion(
    (t: {
      tipo: string
      vehiculo: string
      peso_bruto: number
      peso_tara: number
      articulo_id?: number | null
      cliente_id?: number | null
      proveedor_id?: number | null
      chofer?: string | null
      cedula_chofer?: string | null
      transportista?: string | null
      romana?: string | null
      operador?: string | null
      fecha?: string | null
      hora?: string | null
      nota?: string | null
    }) =>
      rpc<number>('registrar_ticket', {
        p_tipo: t.tipo,
        p_vehiculo: t.vehiculo,
        p_peso_bruto: t.peso_bruto,
        p_peso_tara: t.peso_tara,
        p_articulo_id: t.articulo_id ?? null,
        p_cliente_id: t.cliente_id ?? null,
        p_proveedor_id: t.proveedor_id ?? null,
        p_chofer: t.chofer ?? null,
        p_cedula_chofer: t.cedula_chofer ?? null,
        p_transportista: t.transportista ?? null,
        p_romana: t.romana ?? null,
        p_operador: t.operador ?? null,
        p_fecha: t.fecha ?? null,
        p_hora: t.hora ?? null,
        p_nota: t.nota ?? null,
      }),
  )
}

export function useAnularTicket() {
  return useAccion((a: { id: number; motivo: string }) =>
    rpc('anular_ticket', { p_id: a.id, p_motivo: a.motivo }),
  )
}

// ---------------------------------------------------------------------------
// Guías de movilización
// ---------------------------------------------------------------------------

export function useGuias(estado?: string) {
  return useQuery({
    queryKey: ['despachos', 'guias', estado ?? 'todas'],
    queryFn: async () => {
      let q = supabase.from('v_guias_movilizacion').select('*')
      if (estado) q = q.eq('estado', estado)
      return desenvolver<Guia[]>(
        await q
          .order('fecha_emision', { ascending: false })
          .order('id', { ascending: false })
          .limit(400),
      )
    },
  })
}

export function useRegistrarGuia() {
  return useAccion(
    (g: {
      numero_guia: string
      vigencia_hasta: string
      destino: string
      articulo_id: number
      cantidad: number
      unidad?: string
      cliente_id?: number | null
      frente_id?: number | null
      origen?: string | null
      transportista?: string | null
      vehiculo?: string | null
      chofer?: string | null
      cedula_chofer?: string | null
      fecha_emision?: string | null
      observacion?: string | null
    }) =>
      rpc<number>('registrar_guia', {
        p_numero_guia: g.numero_guia,
        p_vigencia_hasta: g.vigencia_hasta,
        p_destino: g.destino,
        p_articulo_id: g.articulo_id,
        p_cantidad: g.cantidad,
        p_unidad: g.unidad ?? 'M3',
        p_cliente_id: g.cliente_id ?? null,
        p_frente_id: g.frente_id ?? null,
        p_origen: g.origen ?? null,
        p_transportista: g.transportista ?? null,
        p_vehiculo: g.vehiculo ?? null,
        p_chofer: g.chofer ?? null,
        p_cedula_chofer: g.cedula_chofer ?? null,
        p_fecha_emision: g.fecha_emision ?? null,
        p_observacion: g.observacion ?? null,
      }),
  )
}

export function useAnularGuia() {
  return useAccion((a: { id: number; motivo: string }) =>
    rpc('anular_guia', { p_id: a.id, p_motivo: a.motivo }),
  )
}
