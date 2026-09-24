import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/*
  LA VENTA SE COBRA CON MATERIAL, Y EN VARIAS LÍNEAS

  Christopher, 24/09/2026: «a la hora de una venta o una compra sea
  multipagos, porque puede ser por intercambio de materiales, pero también
  puedo pagar con otro método el resto ahí mismo… y puede generar cuentas por
  pagar o cobrar si hay diferencia».

  Es el espejo de la compra por intercambio (`intercambio.ts`), con las tres
  decisiones que tomó ese día:

    1. El material del cliente ENTRA AL INVENTARIO CON COSTO: el valor acordado.
    2. ALMACÉN CONFIRMA QUE LLEGÓ antes de que el cobro cuente. Hasta entonces
       está «por recibir» y la factura sigue con su saldo.
    3. Si vale más que la factura, QUIEN COBRA ELIGE: crédito del cliente para
       su próxima factura, o por pagarle desde una cuenta de tesorería.

  El multipago es una sola llamada: `registrar_cobros` recibe las líneas
  —dinero, crédito del cliente, material— y las registra todas o ninguna.
*/

export type CondicionDelMaterial = 'LISTA' | 'DESCUENTO' | 'ACORDADO'
export type ExcedenteDelCliente = 'CREDITO' | 'POR_PAGAR'

export const EXCEDENTE_DEL_CLIENTE: Record<ExcedenteDelCliente, { etiqueta: string; explica: string }> = {
  CREDITO: {
    etiqueta: 'Crédito del cliente',
    explica: 'Se le descuenta de su próxima factura.',
  },
  POR_PAGAR: {
    etiqueta: 'Por pagarle',
    explica: 'Aparece en Pagos por hacer y sale de una cuenta de tesorería.',
  },
}

export interface CobroConMaterial {
  id: number
  factura_id: number
  factura: string
  cliente: string
  articulo_id: number
  articulo: string
  almacen_id: number
  almacen: string
  cantidad: string
  unidad: string
  cantidad_inventario: string
  medida: 'DIRECTA' | 'ESTIMADA'
  condicion: string
  precio_unitario: string
  moneda: string
  valor: string
  aplicado: string
  excedente: string
  excedente_como: ExcedenteDelCliente | null
  estado: 'POR_RECIBIR' | 'RECIBIDO' | 'ANULADO'
  entrada_numero: string | null
  cobro_numero: string | null
  saldo_numero: string | null
  nota: string | null
  registrado_en: string
  recibido_en: string | null
  motivo_anulacion: string | null
}

/** Un crédito abierto de un cliente, listo para descontarse de una factura suya. */
export interface CreditoDeCliente {
  id: number
  numero: string
  cliente_id: number
  moneda: string
  monto: string
  pendiente: string
  motivo: string
  creado_en: string
  factura_id: number | null
}

export interface PorPagarACliente {
  saldo_id: number
  numero: string
  cliente: string
  rif: string
  factura: string | null
  moneda: string
  monto: string
  pendiente: string
  motivo: string
  desde: string
  dias: number
}

export type LineaDeCobro =
  | {
      tipo: 'DINERO'
      cuenta_id: number
      monto: number
      metodo: string
      referencia?: string | null
      igtf?: boolean | null
      fecha?: string | null
      nota?: string | null
    }
  | { tipo: 'CREDITO'; saldo_id: number; monto: number; nota?: string | null }
  | {
      tipo: 'MATERIAL'
      articulo_id: number
      almacen_id: number
      cantidad: number
      unidad: string
      condicion: CondicionDelMaterial
      descuento_pct?: number | null
      descuento_unitario?: number | null
      precio_acordado?: number | null
      motivo_condicion?: string | null
      excedente_como?: ExcedenteDelCliente | null
      nota?: string | null
    }

function useAccion<A, R = unknown>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const clave of [
        'ventas',
        'cobranza',
        'cobros-material',
        'saldos-a-favor',
        'existencias',
        'movimientos',
        'tesoreria',
        'notificaciones',
      ]) {
        void qc.invalidateQueries({ queryKey: [clave] })
      }
    },
  })
}

/** Los cobros con material de una factura, en cualquier estado. */
export function useCobrosConMaterial(facturaId: number | null) {
  return useQuery({
    queryKey: ['cobros-material', 'factura', facturaId],
    enabled: facturaId !== null,
    queryFn: () =>
      rpc<CobroConMaterial[]>('cobros_con_material', { p_factura_id: facturaId, p_solo_pendientes: false }),
  })
}

/** Lo que almacén tiene por recibir, de todas las facturas. */
export function useMaterialPorRecibir() {
  return useQuery({
    queryKey: ['cobros-material', 'por-recibir'],
    refetchInterval: 60_000,
    queryFn: () => rpc<CobroConMaterial[]>('cobros_con_material', { p_factura_id: null, p_solo_pendientes: true }),
  })
}

export function useCreditosDeCliente(clienteId: number | null | undefined) {
  return useQuery({
    queryKey: ['saldos-a-favor', 'cliente', clienteId],
    enabled: clienteId != null,
    queryFn: async () =>
      desenvolver<CreditoDeCliente[]>(
        await supabase
          .from('saldos_a_favor')
          .select('id, numero, cliente_id, moneda, monto, pendiente, motivo, creado_en, factura_id')
          .eq('cliente_id', clienteId!)
          .eq('a_favor_de', 'CONTRAPARTE')
          .eq('forma', 'CREDITO')
          .eq('estado', 'ABIERTO')
          .order('creado_en'),
      ),
  })
}

export function usePorPagarAClientes() {
  return useQuery({
    queryKey: ['tesoreria', 'por-pagar-a-clientes'],
    queryFn: () => rpc<PorPagarACliente[]>('por_pagar_a_clientes', {}),
  })
}

/** Todas las líneas de un cobro, de una vez: se registran todas o ninguna. */
export function useRegistrarCobros() {
  return useAccion((c: { factura_id: number; lineas: LineaDeCobro[] }) =>
    rpc<unknown[]>('registrar_cobros', { p_factura_id: c.factura_id, p_lineas: c.lineas }),
  )
}

export function useRecibirMaterial() {
  return useAccion((c: { id: number; nota?: string | null }) =>
    rpc<number>('recibir_material_de_cobro', { p_id: c.id, p_nota: c.nota || null }),
  )
}

export function useAnularCobroConMaterial() {
  return useAccion((c: { id: number; motivo: string }) =>
    rpc<void>('anular_cobro_con_material', { p_id: c.id, p_motivo: c.motivo }),
  )
}

export function usePagarSaldoACliente() {
  return useAccion(
    (p: {
      saldo_id: number
      cuenta_id: number
      monto: number
      referencia?: string | null
      fecha?: string | null
      nota?: string | null
    }) =>
      rpc<number>('pagar_saldo_a_cliente', {
        p_saldo_id: p.saldo_id,
        p_cuenta_id: p.cuenta_id,
        p_monto: p.monto,
        p_referencia: p.referencia || null,
        p_fecha: p.fecha || null,
        p_nota: p.nota || null,
      }),
  )
}
