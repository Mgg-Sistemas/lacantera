import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/**
 * Ventas: clientes, precios, cotizaciones y notas de entrega.
 *
 * Lo fiscal —facturas, notas de crédito, cobros y cuentas por cobrar— vive desde
 * el 15/09/2026 en `facturacion.ts`, que es su propio módulo.
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

/*
  AQUÍ HABÍA UNA LISTA DE MONEDAS ESCRITA A MANO

  Tenía dos elementos, dólar y bolívar, y la usaban cinco pantallas. Cuando
  entraron el euro y el USDT con tasa vigente, esas cinco siguieron ofreciendo
  dos: ventas no podía cotizar, despachar, poner precio ni asignarle moneda a un
  cliente en euros, teniendo la base las cuatro.

  Se quitó en vez de ampliarla. `useMonedasUsables()` de `lib/api/tasas` ya hacía
  el trabajo bien —y mejor: solo ofrece las que tienen tasa registrada, porque
  ofrecer una moneda que va a fallar al guardar es peor que no ofrecerla—.

  Lo encontró el carril de base de datos comparando lo que sabe la base con lo
  que enseñan las pantallas.
*/

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

/**
 * Una fila por cada precio: arena a 12 por M3 y a 9 por TON son dos. Lo que
 * todavía no tiene ninguno sale una vez, en la unidad del artículo y sin cifra.
 */
export interface PrecioVenta {
  articulo_id: number
  codigo: string
  nombre: string
  categoria: string
  /** La unidad en que se vende a este precio. Sin precio, la del artículo. */
  unidad: string
  /** Nulos cuando el artículo todavía no tiene precio puesto. */
  moneda: string | null
  precio: string | null
  precio_minimo: string | null
  nota: string | null
  actualizado_en: string | null
  activo: boolean
  /** La unidad en que lo lleva el patio. */
  unidad_articulo: string
  /** Toneladas por metro cúbico. Sin ella no se vende en la otra unidad. */
  densidad_ton_m3: string | null
}

export function usePrecios() {
  return useQuery({
    queryKey: ['precios-venta'],
    queryFn: async () =>
      desenvolver<PrecioVenta[]>(
        await supabase
          .from('v_precios_venta')
          .select('*')
          .order('categoria')
          .order('nombre')
          .order('unidad'),
      ),
  })
}

/**
 * En qué unidades se puede vender un artículo.
 *
 * La suya siempre. La otra entre metros cúbicos y toneladas solo si tiene
 * densidad, porque sin ella no se sabe cuánto sale del patio. Es la misma regla
 * con la que la base guarda un precio y carga un renglón.
 */
export function unidadesDeVenta(p: Pick<PrecioVenta, 'unidad_articulo' | 'densidad_ton_m3'>): string[] {
  if (!p.densidad_ton_m3) return [p.unidad_articulo]
  if (p.unidad_articulo === 'M3') return ['M3', 'TON']
  if (p.unidad_articulo === 'TON') return ['TON', 'M3']
  return [p.unidad_articulo]
}

export function useGuardarPrecio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: {
      articulo_id: number
      unidad: string
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
        p_unidad: p.unidad,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['precios-venta'] }),
  })
}

/** Lo ya emitido no cambia: cada renglón guardó el precio de lista que tenía. */
export function useQuitarPrecio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { articulo_id: number; unidad: string }) =>
      rpc<void>('quitar_precio_venta', { p_articulo_id: p.articulo_id, p_unidad: p.unidad }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['precios-venta'] }),
  })
}

// ---------------------------------------------------------------------------
// Lo que se escribe en un documento de venta
// ---------------------------------------------------------------------------

/**
 * A qué precio sale un renglón. Lo dice quien vende y la base calcula el precio
 * a partir de ahí: la lista no se copia a mano ni un cero se cuela sin motivo.
 */
export type CondicionVenta = 'LISTA' | 'DESCUENTO' | 'SIN_CARGO' | 'ACORDADO'

export const CONDICION_VENTA: Record<CondicionVenta, { etiqueta: string; ayuda: string }> = {
  LISTA: {
    etiqueta: 'Precio de lista',
    ayuda: 'El de Ventas › Lista de precios, en la moneda del documento.',
  },
  DESCUENTO: {
    etiqueta: 'Con descuento',
    ayuda: 'Sobre el precio de lista, en porcentaje o en monto por unidad.',
  },
  SIN_CARGO: {
    etiqueta: 'Sin cargo',
    ayuda: 'Sale sin cobrarse. Se dice por qué, y lo autoriza quien pueda vender bajo el mínimo.',
  },
  ACORDADO: {
    etiqueta: 'Precio acordado',
    ayuda: 'Esa unidad no tiene precio de lista: se escribe el que se acordó.',
  },
}

/** Cómo se supo lo que salió del patio. Solo en notas y facturas. */
export type MedidaRenglon = 'DIRECTA' | 'ROMANA' | 'ESTIMADA'

export interface RenglonVenta {
  articulo_id: number
  descripcion?: string
  cantidad: number
  unidad?: string
  /** Solo cuenta con precio acordado: en los demás lo calcula la base. */
  precio_unitario: number
  exento_iva?: boolean
  condicion: CondicionVenta
  descuento_pct?: number | null
  descuento_unitario?: number | null
  motivo_condicion?: string | null
  /** Solo en el despacho: el patio de este renglón, si no es el de la nota. */
  almacen_id?: number | null
  /** Nació de una nota de salida, sin precio, y todavía lo espera. */
  precio_pendiente?: boolean
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
  /** Cero si no se marcó. */
  alicuota_igtf?: string
  igtf?: string
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
  /** Las notas de crédito no llevan condición: corrigen, no venden. */
  condicion?: CondicionVenta
  precio_lista?: string | null
  descuento_pct?: string | null
  descuento_unitario?: string | null
  motivo_condicion?: string | null
  /** Solo notas de entrega y facturas: lo que salió del patio, en su unidad. */
  cantidad_inventario?: string | null
  medida?: MedidaRenglon | null
  densidad_usada?: string | null
  /** Solo notas de entrega: el patio del renglón, si no fue el de la nota. */
  almacen_id?: number | null
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
      alicuota_igtf?: number
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
      p_alicuota_iva: c.alicuota_iva ?? 0,
      p_descuento: c.descuento ?? 0,
      p_flete: c.flete ?? 0,
      p_fecha: c.fecha || null,
      p_observacion: c.observacion || null,
      p_alicuota_igtf: c.alicuota_igtf ?? 0,
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
  /** Nulo solo en la que nació de una salida y todavía no tiene cliente. */
  cliente_id: number | null
  cliente: string | null
  cliente_rif: string | null
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
  /** El NS del que nació, cuando una nota de salida dejó su nota de entrega. */
  nota_salida: string | null
  solicitud_salida_id: number | null
  /** Falso: es solo respaldo y no entra nunca a una factura. */
  facturable: boolean
  /** Renglones que nacieron sin precio y todavía lo esperan. */
  precios_pendientes: number
}

/** Una nota por su número: para abrirla desde un enlace aunque la lista no la traiga. */
export async function leerNotaEntregaPorNumero(numero: string): Promise<NotaEntrega | null> {
  return (
    desenvolver<NotaEntrega[]>(await supabase.from('v_notas_entrega').select('*').eq('numero', numero).limit(1))[0] ??
    null
  )
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

/*
  EL DESPACHO SE PIDE Y SE APRUEBA. Angélica, 18/09/2026: «quiero que las notas
  de entrega lleven igual un nivel de autorización», y que salgan siempre con
  chofer, cédula y placa. Pedir no mueve nada; al aprobar corre el despacho de
  siempre y nace la nota de entrega. Desde el navegador ya no se puede
  despachar sin pasar por aquí: la base lo mudó a un esquema privado.
*/
export interface PedidoDeDespacho extends Despacho {
  vehiculo: string
  chofer: string
  cedula_chofer: string
  /** Marca y modelo. Solo hace falta si la placa no está en el catálogo. */
  vehiculo_descripcion?: string | null
}

export function useSolicitarDespacho() {
  return useAccionVentas<PedidoDeDespacho, string>((d) =>
    rpc<string>('solicitar_despacho', {
      p_cliente_id: d.cliente_id,
      p_almacen_id: d.almacen_id,
      p_renglones: d.renglones,
      p_vehiculo: d.vehiculo,
      p_chofer: d.chofer,
      p_cedula_chofer: d.cedula_chofer,
      p_vehiculo_descripcion: d.vehiculo_descripcion || null,
      p_moneda: d.moneda ?? null,
      p_cotizacion_id: d.cotizacion_id ?? null,
      p_peso_bruto: d.peso_bruto ?? null,
      p_peso_tara: d.peso_tara ?? null,
      p_ticket: d.ticket || null,
      p_descuento: d.descuento ?? 0,
      p_flete: d.flete ?? 0,
      p_observacion: d.observacion || null,
      // Los dos papeles de la garita. Con ticket, los pesos y la placa salen
      // de la báscula.
      p_ticket_id: d.ticket_id ?? null,
      p_guia_id: d.guia_id ?? null,
    }),
  )
}

export type EstadoDeDespacho = 'PEDIDA' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA'

export interface SolicitudDeDespacho {
  id: number
  numero: string
  estado: EstadoDeDespacho
  cliente_id: number
  cliente: string
  cliente_rif: string
  almacen_id: number
  almacen: string
  moneda: string | null
  vehiculo: string
  vehiculo_descripcion: string | null
  chofer: string
  cedula_chofer: string
  ticket: string | null
  peso_bruto: string | null
  peso_tara: string | null
  flete: string
  observacion: string | null
  pedida_por: string | null
  pedida_en: string
  resuelta_por: string | null
  resuelta_en: string | null
  motivo_cierre: string | null
  nota_id: number | null
  nota_numero: string | null
  renglones: Array<{
    articulo_id: number
    articulo: string | null
    descripcion?: string
    cantidad: number
    unidad?: string
    /** Solo llega a quien ve los montos. */
    precio_unitario?: number
  }>
}

export function useSolicitudesDespacho() {
  return useQuery({
    queryKey: ['ventas', 'solicitudes-despacho'],
    queryFn: async () =>
      desenvolver<SolicitudDeDespacho[]>(
        await supabase
          .from('v_solicitudes_despacho')
          .select('*')
          .order('pedida_en', { ascending: false })
          .limit(200),
      ),
  })
}

/** Si quien mira tiene la casilla de aprobar despachos (propia o prestada, y no restringida). */
export function usePuedoAprobarDespachos() {
  return useQuery({
    queryKey: ['mis-acciones', 'aprobar-despachos'],
    queryFn: () => rpc<boolean>('puedo_aprobar_despachos'),
    staleTime: 60_000,
  })
}

export function useAprobarDespacho() {
  return useAccionVentas((id: number) => rpc<number>('aprobar_despacho', { p_id: id }))
}

export function useRechazarDespacho() {
  return useAccionVentas((r: { id: number; motivo: string }) =>
    rpc<void>('rechazar_despacho', { p_id: r.id, p_motivo: r.motivo }),
  )
}

export function useCancelarDespacho() {
  return useAccionVentas((r: { id: number; motivo: string }) =>
    rpc<void>('cancelar_despacho', { p_id: r.id, p_motivo: r.motivo }),
  )
}

export function useAnularNota() {
  return useAccionVentas((n: { id: number; motivo: string }) =>
    rpc<void>('anular_nota_entrega', { p_id: n.id, p_motivo: n.motivo }),
  )
}
