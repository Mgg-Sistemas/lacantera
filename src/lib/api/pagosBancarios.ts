import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { rpc } from './rpc'

/**
 * Ventas › Registros de pagos: los depósitos que llegaron al banco y las notas
 * de entrega que cubre cada uno. No es Tesorería —no mueve saldos— ni cobra
 * notas: solo relaciona y muestra.
 *
 * Todo pasa por funciones de la base: la tabla de notas solo la leen Salidas y
 * Facturación, y quien entra por Ventas tiene que poder ver qué cubre un pago.
 * Los montos llegan como texto (PostgREST serializa `numeric` así).
 */

export type EstadoPago = 'CUADRA' | 'MINIMA' | 'DIFERENCIA' | 'SIN_NOTAS' | 'ANULADO'

export interface PagoBancario {
  id: number
  fecha: string
  moneda: string
  monto: string
  tasa: string | null
  monto_usd: string | null
  referencia: string | null
  descripcion: string | null
  registrado_en: string
  registrado_por_nombre: string | null
  anulado_en: string | null
  motivo_anulacion: string | null
  notas: number
  aplicado: string
  diferencia: string
  estado: EstadoPago
  numeros: string | null
  clientes: string | null
}

export interface NotaDePago {
  enlace_id: number
  nota_id: number
  numero: string
  fecha: string
  cliente: string | null
  moneda: string
  total: string
  total_bs: string | null
  total_usd: string | null
  en_moneda_del_pago: string
  monto_aplicado: string
  estado: string
  otros_pagos: number
}

export interface NotaCandidata {
  nota_id: number
  numero: string
  fecha: string
  cliente: string | null
  moneda: string
  total: string
  en_moneda_del_pago: string
  otros_pagos: number
}

export interface NotaSinPago {
  nota_id: number
  numero: string
  fecha: string
  cliente: string | null
  moneda: string
  total: string
  total_bs: string | null
  total_usd: string | null
  facturable: boolean
}

/** Una nota que recibe en sus pagos más de lo que vale. */
export interface NotaCubiertaDeMas {
  nota_id: number
  numero: string
  fecha: string
  cliente: string | null
  moneda: string
  total: string
  total_usd: string
  aplicado_usd: string
  pagos: number
}

/** Las notas de un período que no tienen ningún pago asociado: el otro lado del cierre. */
export const leerNotasSinPago = (desde: string, hasta: string) =>
  rpc<NotaSinPago[]>('notas_sin_pago_bancario', { p_desde: desde, p_hasta: hasta })

export interface FilaDePago {
  fecha: string
  moneda: string
  monto: number
  tasa?: number | null
  referencia?: string | null
  descripcion?: string | null
}

const CLAVE = ['pagos-bancarios'] as const

export function usePagosBancarios() {
  return useQuery({
    queryKey: [...CLAVE, 'lista'],
    queryFn: () => rpc<PagoBancario[]>('listar_pagos_bancarios', {}),
  })
}

export function useNotasCubiertasDeMas() {
  return useQuery({
    queryKey: [...CLAVE, 'cubiertas-de-mas'],
    queryFn: () => rpc<NotaCubiertaDeMas[]>('notas_cubiertas_de_mas_pago_bancario', {}),
    // Mientras la función no exista en la base, el aviso simplemente no sale.
    retry: false,
  })
}

export function useNotasDePago(pagoId: number | null) {
  return useQuery({
    queryKey: [...CLAVE, 'notas', pagoId],
    queryFn: () => rpc<NotaDePago[]>('notas_de_pago_bancario', { p_pago_id: pagoId }),
    enabled: pagoId != null,
  })
}

export function useNotasCandidatas(pagoId: number | null, texto: string) {
  return useQuery({
    queryKey: [...CLAVE, 'candidatas', pagoId, texto],
    queryFn: () =>
      rpc<NotaCandidata[]>('notas_candidatas_pago_bancario', {
        p_pago_id: pagoId,
        p_texto: texto.trim() || null,
      }),
    enabled: pagoId != null,
  })
}

function useAccionPagos<A, R = unknown>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CLAVE })
    },
  })
}

export function useGuardarPagoBancario() {
  return useAccionPagos((p: FilaDePago & { id?: number }) => {
    const args = {
      p_fecha: p.fecha,
      p_moneda: p.moneda,
      p_monto: p.monto,
      p_tasa: p.tasa ?? null,
      p_referencia: p.referencia || null,
      p_descripcion: p.descripcion || null,
    }
    return p.id
      ? rpc<unknown>('editar_pago_bancario', { p_id: p.id, ...args })
      : rpc<unknown>('registrar_pago_bancario', args)
  })
}

export function useImportarPagosBancarios() {
  return useAccionPagos((filas: FilaDePago[]) =>
    rpc<{ nuevos: number; repetidos: number }>('importar_pagos_bancarios', { p_filas: filas }),
  )
}

export function useAnularPagoBancario() {
  return useAccionPagos((a: { id: number; motivo: string }) =>
    rpc<void>('anular_pago_bancario', { p_id: a.id, p_motivo: a.motivo }),
  )
}

export function useAsociarNotas() {
  return useAccionPagos((a: { pagoId: number; notas: Array<{ nota_id: number; monto?: number }> }) =>
    rpc<void>('asociar_notas_a_pago_bancario', { p_pago_id: a.pagoId, p_notas: a.notas }),
  )
}

export function useCambiarMontoAplicado() {
  return useAccionPagos((a: { enlaceId: number; monto: number }) =>
    rpc<void>('cambiar_monto_aplicado_pago', { p_enlace_id: a.enlaceId, p_monto: a.monto }),
  )
}

export function useQuitarNotaDePago() {
  return useAccionPagos((enlaceId: number) =>
    rpc<void>('quitar_nota_de_pago_bancario', { p_enlace_id: enlaceId }),
  )
}
