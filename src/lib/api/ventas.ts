import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/**
 * Ventas: clientes, precios, cotizaciones, despachos, facturas y cobros.
 *
 * Los importes llegan como `string` porque PostgREST serializa `numeric` en
 * texto para no perder precisión. Aquí no se convierten: se pasan tal cual a
 * las funciones de formato, que son las únicas que hacen `Number` y solo para
 * mostrar.
 */

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export interface Cliente {
  id: number
  rif: string
  nombre: string
  nombre_comercial: string | null
  contacto: string | null
  telefono: string | null
  correo: string | null
  direccion: string | null
  condicion_pago: string
  limite_credito: string
  moneda_preferida: string
  contribuyente_especial: boolean
  retencion_iva: string
  exento_iva: boolean
  activo: boolean
  notas: string | null
  /** De la vista: lo que debe hoy y cuánto le queda de su límite. */
  deuda_usd: string
  disponible_usd: string
  facturas: number
  ultima_venta: string | null
}

export const CONDICIONES_PAGO = [
  { valor: 'CONTADO', etiqueta: 'De contado' },
  { valor: 'CREDITO_15', etiqueta: 'Crédito a 15 días' },
  { valor: 'CREDITO_30', etiqueta: 'Crédito a 30 días' },
  { valor: 'CREDITO_60', etiqueta: 'Crédito a 60 días' },
]

export const MONEDAS = [
  { valor: 'USD', etiqueta: 'Dólares' },
  { valor: 'VES', etiqueta: 'Bolívares' },
]

export function useClientes(soloActivos = false) {
  return useQuery({
    queryKey: ['clientes', soloActivos],
    queryFn: async () => {
      let q = supabase.from('v_clientes').select('*').order('nombre')
      if (soloActivos) q = q.eq('activo', true)
      return desenvolver<Cliente[]>(await q)
    },
  })
}

export interface ClienteAGuardar {
  id?: number
  rif: string
  nombre: string
  nombre_comercial?: string | null
  contacto?: string | null
  telefono?: string | null
  correo?: string | null
  direccion?: string | null
  condicion_pago?: string
  limite_credito?: number
  moneda_preferida?: string
  contribuyente_especial?: boolean
  retencion_iva?: number
  exento_iva?: boolean
  activo?: boolean
  notas?: string | null
}

export function useGuardarCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (c: ClienteAGuardar) =>
      rpc<number>('guardar_cliente', {
        p_id: c.id ?? null,
        p_rif: c.rif,
        p_nombre: c.nombre,
        p_nombre_comercial: c.nombre_comercial || null,
        p_contacto: c.contacto || null,
        p_telefono: c.telefono || null,
        p_correo: c.correo || null,
        p_direccion: c.direccion || null,
        p_condicion_pago: c.condicion_pago ?? 'CONTADO',
        p_limite_credito: c.limite_credito ?? 0,
        p_moneda: c.moneda_preferida ?? 'USD',
        p_especial: c.contribuyente_especial ?? false,
        p_retencion_iva: c.retencion_iva ?? 75,
        p_exento_iva: c.exento_iva ?? false,
        p_activo: c.activo ?? true,
        p_notas: c.notas || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['clientes'] })
      void qc.invalidateQueries({ queryKey: ['ventas'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Lista de precios
// ---------------------------------------------------------------------------

export interface PrecioVenta {
  articulo_id: number
  codigo: string
  nombre: string
  categoria: string
  unidad: string
  /** Nulos cuando el artículo todavía no tiene precio puesto. */
  moneda: string | null
  precio: string | null
  precio_minimo: string | null
  nota: string | null
  actualizado_en: string | null
  activo: boolean
}

export function usePrecios() {
  return useQuery({
    queryKey: ['precios-venta'],
    queryFn: async () =>
      desenvolver<PrecioVenta[]>(
        await supabase.from('v_precios_venta').select('*').order('categoria').order('nombre'),
      ),
  })
}

export function useGuardarPrecio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: {
      articulo_id: number
      precio: number
      precio_minimo?: number
      moneda?: string
      nota?: string | null
    }) =>
      rpc<number>('guardar_precio_venta', {
        p_articulo_id: p.articulo_id,
        p_precio: p.precio,
        p_minimo: p.precio_minimo ?? 0,
        p_moneda: p.moneda ?? 'USD',
        p_nota: p.nota || null,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['precios-venta'] }),
  })
}

// ---------------------------------------------------------------------------
// Lo que se escribe en un documento de venta
// ---------------------------------------------------------------------------

export interface RenglonVenta {
  articulo_id: number
  descripcion?: string
  cantidad: number
  unidad?: string
  precio_unitario: number
  exento_iva?: boolean
}

/**
 * Toda escritura de ventas invalida lo mismo.
 *
 * Un despacho toca el patio; una factura, la cobranza; un cobro, el libro de
 * tesorería. Refrescar solo la pantalla donde se hizo el clic deja el resto
 * contando otra cosa, y ese "resto" lo está mirando alguien más.
 */
function useAccionVentas<A, R = unknown>(fn: (args: A) => Promise<R>) {
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
// Cotizaciones
// ---------------------------------------------------------------------------

export interface CotizacionVenta {
  id: number
  numero: string
  cliente_id: number
  cliente: string
  cliente_rif: string
  fecha: string
  validez_dias: number
  vence_el: string
  vencida: boolean
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
  total_bs: string
  total_usd: string
  estado: string
  observacion: string | null
  motivo_cierre: string | null
  creada_en: string
  renglones: number
  despachos: number
}

export interface RenglonGuardado {
  id: number
  linea: number
  articulo_id: number
  descripcion: string
  cantidad: string
  unidad: string
  precio_unitario: string
  exento_iva: boolean
  subtotal: string
}

export function useCotizacionesVenta(estado?: string) {
  return useQuery({
    queryKey: ['ventas', 'cotizaciones', estado ?? 'todas'],
    queryFn: async () => {
      let q = supabase
        .from('v_cotizaciones_venta')
        .select('*')
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })
        .limit(200)
      if (estado) q = q.eq('estado', estado)
      return desenvolver<CotizacionVenta[]>(await q)
    },
  })
}

export function useRenglones(tabla: string, columna: string, id: number | null) {
  return useQuery({
    queryKey: ['ventas', 'renglones', tabla, id],
    enabled: id !== null,
    queryFn: async () =>
      desenvolver<RenglonGuardado[]>(
        await supabase.from(tabla).select('*').eq(columna, id!).order('linea'),
      ),
  })
}

export function useCrearCotizacion() {
  return useAccionVentas<
    {
      cliente_id: number
      renglones: RenglonVenta[]
      moneda?: string
      validez_dias?: number
      alicuota_iva?: number
      descuento?: number
      flete?: number
      fecha?: string
      observacion?: string | null
    },
    number
  >((c) =>
    rpc<number>('crear_cotizacion_venta', {
      p_cliente_id: c.cliente_id,
      p_renglones: c.renglones,
      p_moneda: c.moneda ?? null,
      p_validez_dias: c.validez_dias ?? 15,
      p_alicuota_iva: c.alicuota_iva ?? null,
      p_descuento: c.descuento ?? 0,
      p_flete: c.flete ?? 0,
      p_fecha: c.fecha || null,
      p_observacion: c.observacion || null,
    }),
  )
}

export function useCerrarCotizacion() {
  return useAccionVentas((c: { id: number; estado: string; motivo?: string }) =>
    rpc<void>('cerrar_cotizacion_venta', {
      p_id: c.id,
      p_estado: c.estado,
      p_motivo: c.motivo || null,
    }),
  )
}

// ---------------------------------------------------------------------------
// Notas de entrega
// ---------------------------------------------------------------------------

export interface NotaEntrega {
  id: number
  numero: string
  cliente_id: number
  cliente: string
  cliente_rif: string
  cotizacion_id: number | null
  almacen_id: number
  almacen: string
  fecha: string
  vehiculo: string | null
  chofer: string | null
  cedula_chofer: string | null
  peso_bruto: string | null
  peso_tara: string | null
  peso_neto: string | null
  ticket_romana: string | null
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
  total_bs: string
  total_usd: string
  estado: string
  factura_id: number | null
  factura_numero: string | null
  observacion: string | null
  despachada_en: string
  motivo_anulacion: string | null
  renglones: number
}

export function useNotasEntrega(estado?: string) {
  return useQuery({
    queryKey: ['ventas', 'notas', estado ?? 'todas'],
    queryFn: async () => {
      let q = supabase
        .from('v_notas_entrega')
        .select('*')
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })
        .limit(200)
      if (estado) q = q.eq('estado', estado)
      return desenvolver<NotaEntrega[]>(await q)
    },
  })
}

export interface Despacho {
  cliente_id: number
  almacen_id: number
  renglones: RenglonVenta[]
  moneda?: string
  cotizacion_id?: number | null
  vehiculo?: string | null
  chofer?: string | null
  cedula_chofer?: string | null
  peso_bruto?: number | null
  peso_tara?: number | null
  ticket?: string | null
  alicuota_iva?: number | null
  descuento?: number
  flete?: number
  fecha?: string
  observacion?: string | null
  ticket_id?: number | null
  guia_id?: number | null
}

export function useDespachar() {
  return useAccionVentas<Despacho, number>((d) =>
    rpc<number>('despachar', {
      p_cliente_id: d.cliente_id,
      p_almacen_id: d.almacen_id,
      p_renglones: d.renglones,
      p_moneda: d.moneda ?? null,
      p_cotizacion_id: d.cotizacion_id ?? null,
      p_vehiculo: d.vehiculo || null,
      p_chofer: d.chofer || null,
      p_cedula_chofer: d.cedula_chofer || null,
      p_peso_bruto: d.peso_bruto ?? null,
      p_peso_tara: d.peso_tara ?? null,
      p_ticket: d.ticket || null,
      p_alicuota_iva: d.alicuota_iva ?? null,
      p_descuento: d.descuento ?? 0,
      p_flete: d.flete ?? 0,
      p_fecha: d.fecha || null,
      p_observacion: d.observacion || null,
      // Los dos papeles de la garita. Con ticket, los pesos y la placa salen
      // de la báscula; sin guía, la base rechaza el despacho de mineral.
      p_ticket_id: d.ticket_id ?? null,
      p_guia_id: d.guia_id ?? null,
    }),
  )
}

export function useAnularNota() {
  return useAccionVentas((n: { id: number; motivo: string }) =>
    rpc<void>('anular_nota_entrega', { p_id: n.id, p_motivo: n.motivo }),
  )
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
  return useAccionVentas<
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
  return useAccionVentas((f: { id: number; motivo: string }) =>
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
  return useAccionVentas<
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
  return useAccionVentas((n: { id: number; motivo: string }) =>
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
  return useAccionVentas<
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
  return useAccionVentas((c: { id: number; motivo: string }) =>
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

