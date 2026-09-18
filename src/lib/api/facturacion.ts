import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'
import type { RenglonVenta } from './ventas'

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
  /** El IGTF de la factura: sobre el total con IVA. Cero si no lleva. */
  alicuota_igtf: string
  igtf: string
  /** NOTAS: salió de notas de entrega. DIRECTA: con sus propios renglones. */
  origen: 'NOTAS' | 'DIRECTA'
  /** Solo en una directa: el material salió del patio al emitirla. */
  saca_material: boolean
  almacen_id: number | null
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

export interface FacturaDeNotas {
  notas: number[]
  condicion_pago?: string | null
  fecha?: string
  observacion?: string | null
  /** La decide la factura: las notas de entrega no llevan IVA. */
  alicuota_iva: number
  alicuota_igtf: number
}

/*
  Los parámetros de `facturar_notas`, en un solo sitio. Emitir y enviar a
  autorizar mandan exactamente lo mismo: la factura por autorizar guarda estos
  parámetros y la base los usa tal cual al autorizarla.
*/
const argumentosDeNotas = (f: FacturaDeNotas) => ({
  p_notas: f.notas,
  p_condicion_pago: f.condicion_pago || null,
  p_fecha: f.fecha || null,
  p_observacion: f.observacion || null,
  p_alicuota_iva: f.alicuota_iva,
  p_alicuota_igtf: f.alicuota_igtf,
})

export function useFacturarNotas() {
  return useAccionFacturacion<FacturaDeNotas, number>((f) =>
    rpc<number>('facturar_notas', argumentosDeNotas(f)),
  )
}

/**
 * La factura sin nota de entrega, con sus propios renglones.
 *
 * Christopher, 17/09/2026: «que se pueda crear una factura sin necesidad de nota
 * de entrega y viceversa». Si el material sale con ella, la base lo descuenta
 * del patio de cada renglón al emitirla; si no, sale después con notas que se
 * enlazan a esta factura. Devuelve el id de la factura.
 */
export interface FacturaDirectaNueva {
  cliente_id: number
  renglones: RenglonVenta[]
  moneda: string
  condicion_pago?: string | null
  fecha?: string
  observacion?: string | null
  alicuota_iva: number
  alicuota_igtf: number
  saca_material: boolean
  /** El patio por defecto de los renglones que no digan otro. */
  almacen_id: number | null
}

const argumentosDirectos = (f: FacturaDirectaNueva) => ({
  p_cliente_id: f.cliente_id,
  p_renglones: f.renglones,
  p_moneda: f.moneda,
  p_condicion_pago: f.condicion_pago || null,
  p_fecha: f.fecha || null,
  p_observacion: f.observacion || null,
  p_alicuota_iva: f.alicuota_iva,
  p_alicuota_igtf: f.alicuota_igtf,
  p_saca_material: f.saca_material,
  p_almacen_id: f.almacen_id,
})

export function useFacturarDirecto() {
  return useAccionFacturacion<FacturaDirectaNueva, number>((f) =>
    rpc<number>('facturar_directo', argumentosDirectos(f)),
  )
}

/**
 * Enlazar una nota de entrega a una factura que ya existe: la nota pasa a
 * facturada con ese número y la factura no cambia. Solo a una factura sin nota
 * que no haya sacado el material, o se contaría dos veces.
 */
export function useEnlazarNotaAFactura() {
  return useAccionFacturacion((e: { nota_id: number; factura_id: number }) =>
    rpc<void>('enlazar_nota_a_factura', { p_nota_id: e.nota_id, p_factura_id: e.factura_id }),
  )
}

/** Deshacer un enlace hecho por error. Una nota de la que salió la factura no se suelta. */
export function useDesenlazarNota() {
  return useAccionFacturacion((notaId: number) =>
    rpc<void>('desenlazar_nota_de_factura', { p_nota_id: notaId }),
  )
}

export function useAnularFactura() {
  return useAccionFacturacion((f: { id: number; motivo: string }) =>
    rpc<void>('anular_factura', { p_id: f.id, p_motivo: f.motivo }),
  )
}

// ---------------------------------------------------------------------------
// Facturas por autorizar
//
// Christopher, 18/09/2026: a quien se le restringe «Autorizar y emitir
// facturas» prepara la factura «pero hasta ahí»: queda por autorizar. No gasta
// número de control ni toca el patio ni el libro hasta que alguien con la
// casilla la autoriza, y en ese momento la base la emite con los mismos
// parámetros que habría usado quien la preparó.
// ---------------------------------------------------------------------------

/** La casilla que decide si una factura se emite o queda por autorizar. */
export const AUTORIZAR_FACTURA = 'FACTURACION.AUTORIZAR_FACTURA'

export type EstadoPorAutorizar = 'POR_AUTORIZAR' | 'AUTORIZADA' | 'RECHAZADA' | 'RETIRADA'

export interface FacturaPorAutorizar {
  id: number
  numero: string
  origen: 'NOTAS' | 'DIRECTA'
  estado: EstadoPorAutorizar
  cliente_id: number
  cliente: string
  cliente_rif: string | null
  moneda: string
  total_estimado: string
  notas: string | null
  cuantos: number
  observacion: string | null
  preparada_por: string
  preparada_por_nombre: string | null
  preparada_en: string
  decidida_por: string | null
  decidida_por_nombre: string | null
  decidida_en: string | null
  motivo: string | null
  factura_id: number | null
  factura_numero: string | null
}

/**
 * Las por autorizar, y las decididas de la última semana: quien preparó una
 * tiene que poder ver que se la rechazaron y por qué.
 */
export function useFacturasPorAutorizar() {
  return useQuery({
    queryKey: ['ventas', 'por-autorizar'],
    queryFn: async () => {
      const hace = new Date(Date.now() - 7 * 86_400_000).toISOString()
      return desenvolver<FacturaPorAutorizar[]>(
        await supabase
          .from('v_facturas_por_autorizar')
          .select('*')
          .or(`estado.eq.POR_AUTORIZAR,decidida_en.gte.${hace}`)
          .order('id', { ascending: false })
          .limit(100),
      )
    },
    // No hay tiempo real sobre esta tabla: quien autoriza la ve llegar sin recargar.
    refetchInterval: 60_000,
  })
}

export function useEnviarNotasAAutorizar() {
  return useAccionFacturacion((f: FacturaDeNotas & { total_estimado: number }) =>
    rpc<number>('enviar_factura_a_autorizar', {
      p_origen: 'NOTAS',
      p_argumentos: argumentosDeNotas(f),
      p_total_estimado: Math.max(0, f.total_estimado),
    }),
  )
}

export function useEnviarDirectaAAutorizar() {
  return useAccionFacturacion((f: FacturaDirectaNueva & { total_estimado: number }) =>
    rpc<number>('enviar_factura_a_autorizar', {
      p_origen: 'DIRECTA',
      p_argumentos: argumentosDirectos(f),
      p_total_estimado: Math.max(0, f.total_estimado),
    }),
  )
}

/** Autorizar es emitir: devuelve el id de la factura que se emitió. */
export function useAutorizarFactura() {
  return useAccionFacturacion((id: number) => rpc<number>('autorizar_factura', { p_id: id }))
}

export function useRechazarFacturaPorAutorizar() {
  return useAccionFacturacion((f: { id: number; motivo: string }) =>
    rpc<void>('rechazar_factura_por_autorizar', { p_id: f.id, p_motivo: f.motivo }),
  )
}

export function useRetirarFacturaPorAutorizar() {
  return useAccionFacturacion((f: { id: number; motivo: string }) =>
    rpc<void>('retirar_factura_por_autorizar', { p_id: f.id, p_motivo: f.motivo }),
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
  /**
   * El renglón de la factura que se devuelve. Con él la base convierte lo
   * devuelto a la unidad del patio con la misma cuenta con que salió: unas
   * toneladas pesadas en la romana no vuelven con la densidad del catálogo.
   */
  renglon_factura_id?: number | null
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
