import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/**
 * Las facturas que emite el proveedor.
 *
 * Va aparte del resto de compras porque es otra cosa: la orden es lo que se
 * pidió, la recepción es lo que llegó y la factura es el papel fiscal que
 * sustenta el crédito del IVA. Los tres se parecen y no son lo mismo.
 */

export interface FacturaCompra {
  id: number
  proveedor_id: number
  proveedor: string
  proveedor_rif: string
  orden_id: number | null
  orden_numero: string | null
  numero_factura: string
  numero_control: string | null
  fecha_emision: string
  fecha_recepcion: string
  condicion_pago: string
  dias_credito: number
  vence_el: string | null
  moneda: string
  tasa: string
  tasa_usd: string
  exento: string
  base_imponible: string
  alicuota_iva: string
  iva: string
  retencion_iva: string
  retencion_islr: string
  total: string
  total_bs: string
  total_usd: string
  retencion_usd: string
  pagado_usd: string
  saldo_usd: string
  dias_vencida: number
  observacion: string | null
  estado: string
  motivo_anulacion: string | null
  registrada_en: string
}

export interface PagoCompra {
  id: number
  numero: string
  factura_id: number
  cuenta_id: number
  cuenta: string
  fecha: string
  metodo: string
  moneda: string
  monto: string
  monto_usd: string
  igtf_aplica: boolean
  igtf_monto: string
  referencia: string | null
  nota: string | null
  estado: string
  registrado_en: string
}

export interface LineaLibroCompras {
  id: number
  fecha: string
  rif_proveedor: string
  proveedor: string
  numero_factura: string
  numero_control: string | null
  moneda: string
  compras_exentas: string
  base_imponible: string
  alicuota_iva: string
  credito_fiscal: string
  total_compras: string
  iva_retenido: string
  compras_exentas_bs: string
  base_imponible_bs: string
  credito_fiscal_bs: string
  total_compras_bs: string
  tasa: string
  iva_retenido_bs: string
}

export const CONDICIONES_COMPRA = [
  { valor: 'CONTADO', etiqueta: 'De contado' },
  { valor: 'CREDITO_15', etiqueta: 'Crédito 15 días' },
  { valor: 'CREDITO_30', etiqueta: 'Crédito 30 días' },
  { valor: 'CREDITO_60', etiqueta: 'Crédito 60 días' },
]


function useAccion<A, R = unknown>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['facturas-compra'] })
      void qc.invalidateQueries({ queryKey: ['tesoreria'] })
      void qc.invalidateQueries({ queryKey: ['compras'] })
    },
  })
}

export function useFacturasCompra() {
  return useQuery({
    queryKey: ['facturas-compra'],
    queryFn: async () =>
      desenvolver<FacturaCompra[]>(
        await supabase
          .from('v_facturas_compra')
          .select('*')
          .order('fecha_emision', { ascending: false })
          .order('id', { ascending: false })
          .limit(400),
      ),
  })
}

export function usePagosCompra(facturaId: number | null) {
  return useQuery({
    queryKey: ['facturas-compra', 'pagos', facturaId],
    enabled: facturaId !== null,
    queryFn: async () =>
      desenvolver<PagoCompra[]>(
        await supabase
          .from('v_pagos_compra')
          .select('*')
          .eq('factura_id', facturaId!)
          .order('fecha')
          .order('id'),
      ),
  })
}

export function useLibroCompras(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['facturas-compra', 'libro', desde, hasta],
    queryFn: async () =>
      desenvolver<LineaLibroCompras[]>(
        await supabase
          .from('v_libro_compras')
          .select('*')
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .order('fecha')
          .order('id'),
      ),
  })
}

export function useRegistrarFacturaCompra() {
  return useAccion(
    (f: {
      proveedor_id: number
      numero_factura: string
      fecha_emision: string
      exento: number
      base_imponible: number
      iva: number
      moneda: string
      numero_control?: string | null
      orden_id?: number | null
      condicion_pago: string
      alicuota_iva: number
      retencion_iva?: number
      retencion_islr?: number
      total_del_papel?: number | null
      observacion?: string | null
    }) =>
      rpc<number>('registrar_factura_compra', {
        p_proveedor_id: f.proveedor_id,
        p_numero_factura: f.numero_factura,
        p_fecha_emision: f.fecha_emision,
        p_exento: f.exento,
        p_base_imponible: f.base_imponible,
        p_iva: f.iva,
        p_moneda: f.moneda,
        p_numero_control: f.numero_control ?? null,
        p_orden_id: f.orden_id ?? null,
        p_condicion_pago: f.condicion_pago,
        p_alicuota_iva: f.alicuota_iva,
        p_retencion_iva: f.retencion_iva ?? 0,
        p_retencion_islr: f.retencion_islr ?? 0,
        p_total_del_papel: f.total_del_papel ?? null,
        p_observacion: f.observacion ?? null,
      }),
  )
}

export function useAnularFacturaCompra() {
  return useAccion((a: { id: number; motivo: string }) =>
    rpc('anular_factura_compra', { p_id: a.id, p_motivo: a.motivo }),
  )
}

export function useRegistrarPagoCompra() {
  return useAccion(
    (p: {
      factura_id: number
      cuenta_id: number
      monto: number
      metodo: string
      referencia?: string | null
      igtf?: boolean | null
      nota?: string | null
    }) =>
      rpc<number>('registrar_pago_compra', {
        p_factura_id: p.factura_id,
        p_cuenta_id: p.cuenta_id,
        p_monto: p.monto,
        p_metodo: p.metodo,
        p_referencia: p.referencia ?? null,
        p_igtf: p.igtf ?? null,
        p_nota: p.nota ?? null,
      }),
  )
}

export function useAnularPagoCompra() {
  return useAccion((a: { id: number; motivo: string }) =>
    rpc('anular_pago_compra', { p_id: a.id, p_motivo: a.motivo }),
  )
}
