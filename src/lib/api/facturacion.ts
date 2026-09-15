import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/**
 * Facturación: facturas de venta, notas de crédito, cobros y cuentas por cobrar.
 *
 * Se separó de `ventas.ts` el 15/09/2026, cuando la facturación pasó a ser su
 * propio módulo (permiso FACTURACION). Ventas se queda con lo comercial: clientes,
 * precios, cotizaciones y notas de entrega. Lo que sale de aquí es fiscal: gasta
 * número de control, entra al libro y deja a alguien debiendo.
 *
 * Las claves de react-query se quedan como estaban (`['ventas', 'facturas']`,
 * `['cobranza']`…) a propósito: `lib/tiempoReal.ts` invalida por ellas cuando
 * cambia una fila, y renombrarlas aquí sin tocar allá dejaría pantallas sin
 * refrescarse.
 */

/**
 * Toda escritura fiscal invalida lo mismo que invalidaba en ventas.
 *
 * Una factura toca la cobranza y la cuenta del cliente; un cobro, el libro de
 * tesorería; una nota de crédito con devolución, el patio. Refrescar solo la
 * pantalla donde se hizo el clic deja el resto contando otra cosa.
 */
function useAccionFacturacion<A, R = unknown>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ventas'] })
      void qc.invalidateQueries({ queryKey: ['cobranza'] })
      void qc.invalidateQueries({ queryKey: ['clientes'] })
      void qc.invalidateQueries({ queryKey: ['existencias'] })
      void qc.invalidateQueries({ queryKey: ['movimientos'] })
      void qc.invalidateQueries({ queryKey: ['tesoreria'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Facturas
// ---------------------------------------------------------------------------

export interface FacturaVenta {
  id: number
  numero: string
  numero_control: string
  cliente_id: number
  cliente: string
  cliente_rif: string
  cliente_direccion: string | null
  fecha: string
  condicion_pago: string
  dias_credito: number
  vence_el: string
  moneda: string
  tasa: string
  tasa_usd: string
  alicuota_iva: string
  descuento: string
  flete: string
  subtotal: string
  base_imponible: string
  iva: string
  total: string
  retencion_iva: string
  total_bs: string
  total_usd: string
  retencion_usd: string
  estado: string
  observacion: string | null
  emitida_en: string
  motivo_anulacion: string | null
  cobrado_usd: string
  /** Lo que le han restado las notas de crédito. Baja el saldo igual que un cobro. */
  acreditado_usd: string
  saldo_usd: string
  dias_vencida: number
  renglones: number
}

export function useFacturas(estado?: string) {
  return useQuery({
    queryKey: ['ventas', 'facturas', estado ?? 'todas'],
    queryFn: async () => {
      let q = supabase
        .from('v_facturas_venta')
        .select('*')
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })
        .limit(200)
      if (estado) q = q.eq('estado', estado)
      return desenvolver<FacturaVenta[]>(await q)
    },
  })
}

export function useFacturarNotas() {
  return useAccionFacturacion<
    { notas: number[]; condicion_pago?: string | null; fecha?: string; observacion?: string | null },
    number
  >((f) =>
    rpc<number>('facturar_notas', {
      p_notas: f.notas,
      p_condicion_pago: f.condicion_pago || null,
      p_fecha: f.fecha || null,
      p_observacion: f.observacion || null,
    }),
  )
}

export function useAnularFactura() {
  return useAccionFacturacion((f: { id: number; motivo: string }) =>
    rpc<void>('anular_factura', { p_id: f.id, p_motivo: f.motivo }),
  )
}

// ---------------------------------------------------------------------------
// Notas de crédito
//
// Corrigen una factura que ya salió de la empresa. Anular sirve mientras el
// papel no se entregó; después el cliente tiene un documento fiscal que existe
// y lo que corresponde es restarle por diferencia.
// ---------------------------------------------------------------------------

export const TIPOS_NOTA_CREDITO = [
  {
    valor: 'DEVOLUCION',
    etiqueta: 'Devolución de material',
    ayuda: 'El cliente devolvió lo despachado. Elige el patio y el material vuelve a existencia.',
  },
  {
    valor: 'CORRECCION',
    etiqueta: 'Se facturó de más',
    ayuda: 'El precio o la cantidad quedaron por encima de lo acordado.',
  },
  {
    valor: 'DESCUENTO',
    etiqueta: 'Descuento posterior',
    ayuda: 'Una rebaja acordada después de emitir la factura.',
  },
  {
    valor: 'ANULACION',
    etiqueta: 'Dejar la factura sin efecto',
    ayuda: 'La venta no ocurrió, pero la factura ya estaba en manos del cliente.',
  },
]

export interface NotaCredito {
  id: number
  numero: string
  numero_control: string
  factura_id: number
  factura_numero: string
  factura_control: string
  factura_fecha: string
  factura_total: string
  cliente_id: number
  cliente: string
  cliente_rif: string
  fecha: string
  tipo: string
  motivo: string
  moneda: string
  tasa: string
  tasa_usd: string
  alicuota_iva: string
  subtotal: string
  base_imponible: string
  iva: string
  total: string
  total_bs: string
  total_usd: string
  estado: string
  motivo_anulacion: string | null
  emitida_en: string
  renglones: number
  devolvio_material: boolean
}

export function useNotasCredito(facturaId?: number | null) {
  return useQuery({
    queryKey: ['ventas', 'notas-credito', facturaId ?? 'todas'],
    queryFn: async () => {
      let q = supabase
        .from('v_notas_credito')
        .select('*')
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })
        .limit(200)
      if (facturaId) q = q.eq('factura_id', facturaId)
      return desenvolver<NotaCredito[]>(await q)
    },
  })
}

export interface RenglonNotaCredito {
  articulo_id: number
  descripcion?: string
  cantidad: number
  unidad?: string
  precio_unitario: number
  exento_iva?: boolean
  /** Con almacén el material vuelve al patio. Sin almacén solo se corrige plata. */
  almacen_id?: number | null
}

export function useEmitirNotaCredito() {
  return useAccionFacturacion<
    { factura_id: number; tipo: string; motivo: string; renglones: RenglonNotaCredito[]; fecha?: string },
    number
  >((n) =>
    rpc<number>('emitir_nota_credito', {
      p_factura_id: n.factura_id,
      p_tipo: n.tipo,
      p_motivo: n.motivo,
      p_renglones: n.renglones,
      p_fecha: n.fecha || null,
    }),
  )
}

export function useAnularNotaCredito() {
  return useAccionFacturacion((n: { id: number; motivo: string }) =>
    rpc<void>('anular_nota_credito', { p_id: n.id, p_motivo: n.motivo }),
  )
}

// ---------------------------------------------------------------------------
// Cobros
// ---------------------------------------------------------------------------

export interface Cobro {
  id: number
  numero: string
  factura_id: number
  cuenta_id: number
  fecha: string
  metodo: string
  moneda: string
  monto: string
  monto_bs: string
  monto_usd: string
  igtf_aplica: boolean
  igtf_monto: string
  referencia: string | null
  nota: string | null
  estado: string
  motivo_anulacion: string | null
  registrado_en: string
  cuenta: { nombre: string; moneda: string } | null
}

export function useCobros(facturaId: number | null) {
  return useQuery({
    queryKey: ['ventas', 'cobros', facturaId],
    enabled: facturaId !== null,
    queryFn: async () =>
      desenvolver<Cobro[]>(
        await supabase
          .from('cobros_venta')
          .select('*, cuenta:cuentas_tesoreria(nombre, moneda)')
          .eq('factura_id', facturaId!)
          .order('fecha', { ascending: false })
          .order('id', { ascending: false }),
      ),
  })
}

export function useRegistrarCobro() {
  return useAccionFacturacion<
    {
      factura_id: number
      cuenta_id: number
      monto: number
      metodo?: string
      fecha?: string
      referencia?: string | null
      igtf?: boolean | null
      nota?: string | null
    },
    number
  >((c) =>
    rpc<number>('registrar_cobro', {
      p_factura_id: c.factura_id,
      p_cuenta_id: c.cuenta_id,
      p_monto: c.monto,
      p_metodo: c.metodo ?? 'TRANSFERENCIA',
      p_fecha: c.fecha || null,
      p_referencia: c.referencia || null,
      p_igtf: c.igtf ?? null,
      p_nota: c.nota || null,
    }),
  )
}

export function useAnularCobro() {
  return useAccionFacturacion((c: { id: number; motivo: string }) =>
    rpc<void>('anular_cobro', { p_id: c.id, p_motivo: c.motivo }),
  )
}

// ---------------------------------------------------------------------------
// Cuentas por cobrar
// ---------------------------------------------------------------------------

export interface PorCobrar {
  factura_id: number
  numero: string
  numero_control: string
  fecha: string
  vence_el: string
  cliente_id: number
  cliente: string
  cliente_rif: string
  condicion_pago: string
  moneda: string
  total: string
  total_bs: string
  total_usd: string
  retencion_iva: string
  retencion_usd: string
  cobrado_usd: string
  saldo_usd: string
  saldo_bs: string
  dias_vencida: number
  dias_desde_emision: number
}

export function usePorCobrar() {
  return useQuery({
    queryKey: ['cobranza'],
    queryFn: async () =>
      desenvolver<PorCobrar[]>(
        await supabase.from('v_cuentas_por_cobrar').select('*').order('vence_el'),
      ),
  })
}
