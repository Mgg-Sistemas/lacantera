import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

// ---------------------------------------------------------------------------
// Las siete columnas del tablero
//
// El nombre de la columna lo calcula la vista `v_compras_tablero`, no esta
// pantalla: si el tablero decidiera por su cuenta en qué columna va cada
// tarjeta, un informe podría contar distinto que el tablero.
// ---------------------------------------------------------------------------

export type Columna =
  | 'PEDIDO'
  | 'CONFIRMADA'
  | 'GERENTE'
  | 'APROBADA'
  | 'PAGADA'
  | 'CANCELADA'
  | 'DESISTIO'
  | 'RECIBIDA'

export interface DefinicionColumna {
  clave: Columna
  titulo: string
  /** Lo que hay que hacer para que la tarjeta salga de aquí. */
  accion: string
  tono: 'neutral' | 'info' | 'royal' | 'warning' | 'success' | 'danger'
}

export const COLUMNAS: DefinicionColumna[] = [
  { clave: 'PEDIDO', titulo: 'Pedido', accion: 'Confirmar', tono: 'neutral' },
  { clave: 'CONFIRMADA', titulo: 'Confirmada', accion: 'Indicar proveedores', tono: 'info' },
  { clave: 'GERENTE', titulo: 'Confirmar por el gerente', accion: 'Aprobar', tono: 'royal' },
  { clave: 'APROBADA', titulo: 'Aprobada', accion: 'Indicar método de pago', tono: 'warning' },
  { clave: 'PAGADA', titulo: 'Pagada', accion: 'Pendiente por recepcionar', tono: 'success' },
  // La compra termina aquí, pero se queda a la vista: si desapareciera al
  // recibirse, no habría dónde comprobar que llegó.
  { clave: 'RECIBIDA', titulo: 'Recibida', accion: 'Cerrada', tono: 'info' },
  { clave: 'CANCELADA', titulo: 'Cancelada', accion: 'No sigue', tono: 'neutral' },
  { clave: 'DESISTIO', titulo: 'El proveedor desistió', accion: 'Resolver el dinero', tono: 'danger' },
]

export interface Tarjeta {
  solicitud_id: number
  numero: string
  titulo: string
  prioridad: 'NORMAL' | 'ALTA' | 'URGENTE'
  requerida_para: string | null
  destino: string | null
  estado_solicitud: string
  creada_en: string
  /** Quién pidió, cuando tiene usuario en el sistema. */
  solicitante_id: string | null
  /** El nombre de quien pidió, venga del perfil o escrito a mano. */
  solicitante: string | null
  solicitante_cargo: string | null
  /** Quién lo cargó. No siempre es la misma persona que lo pidió. */
  registrada_por: string
  registrada_por_nombre: string | null
  orden_id: number | null
  orden_numero: string | null
  estado_orden: string | null
  fecha_pago: string | null
  entrega_estimada: string | null
  desistio_resolucion: string | null
  proveedor: string | null
  moneda: string | null
  total: string | null
  total_usd: string | null
  total_bs: string | null
  cotizaciones: number
  renglones: number
  dias_sin_recibir: number | null
  columna: Columna
}

export function useTablero() {
  return useQuery({
    queryKey: ['compras', 'tablero'],
    queryFn: async () =>
      desenvolver<Tarjeta[]>(
        await supabase.from('v_compras_tablero').select('*').order('creada_en', { ascending: false }),
      ),
    // El tablero es lo que mira compras todo el día: se refresca solo.
    refetchInterval: 60_000,
  })
}

// ---------------------------------------------------------------------------
// Detalle de una compra
// ---------------------------------------------------------------------------

export interface RenglonPedido {
  id: number
  linea: number
  articulo_id: number | null
  descripcion: string
  cantidad: string
  unidad: string
  observacion: string | null
}

export interface RenglonCotizacion {
  id: number
  solicitud_renglon_id: number
  cantidad: string
  precio_unitario: string
  exento_iva: boolean
  subtotal: string
  observacion: string | null
}

export interface Cotizacion {
  id: number
  /** Correlativo propio: COT-2026-0001. Lo asigna la base, no el navegador. */
  numero: string
  proveedor_id: number
  /** El número que el proveedor puso en su papel, cuando lo puso. */
  numero_proveedor: string | null
  fecha: string
  validez_dias: number
  dias_entrega: number | null
  condicion_pago: string
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
  observacion: string | null
  registrada_en: string
  proveedor: { id: number; nombre: string; rif: string; condicion_pago: string } | null
  renglones: RenglonCotizacion[]
}

export interface InstruccionPago {
  id: number
  metodo: 'TRANSFERENCIA' | 'PAGO_MOVIL' | 'BINANCE' | 'EFECTIVO'
  moneda: string
  monto: string
  monto_bs: string
  monto_usd: string
  igtf_aplica: boolean
  igtf_monto: string
  banco: string | null
  numero_cuenta: string | null
  titular: string | null
  documento: string | null
  telefono: string | null
  correo_binance: string | null
  red_cripto: string | null
  receptor: string | null
  estado: 'POR_PAGAR' | 'PAGADA' | 'DEVUELTA' | 'ANULADA'
  nota: string | null
  referencia: string | null
  fecha_pago: string | null
  creada_en: string
  motivo_devolucion: string | null
}

export interface RenglonOrden {
  id: number
  linea: number
  articulo_id: number | null
  descripcion: string
  cantidad: string
  unidad: string
  precio_unitario: string
  exento_iva: boolean
  subtotal: string
  cantidad_recibida: string
}

export interface Orden {
  id: number
  numero: string
  estado: string
  moneda: string
  tasa: string
  tasa_usd: string
  subtotal: string
  descuento: string
  flete: string
  iva: string
  total: string
  total_bs: string
  total_usd: string
  dias_entrega: number | null
  entrega_estimada: string | null
  fecha_pago: string | null
  recibida_en: string | null
  desistio_motivo: string | null
  desistio_en: string | null
  desistio_resolucion: string | null
  desistio_nota: string | null
  motivo_cancelacion: string | null
  creada_en: string
  proveedor: { id: number; nombre: string; rif: string } | null
  renglones: RenglonOrden[]
  instrucciones: InstruccionPago[]
}

export interface Compra {
  id: number
  numero: string
  titulo: string
  justificacion: string
  prioridad: 'NORMAL' | 'ALTA' | 'URGENTE'
  requerida_para: string | null
  destino: string | null
  estado: string
  creada_en: string
  enviada_en: string | null
  /** Quién pidió: o un usuario del sistema, o un nombre escrito a mano. */
  solicitante_id: string | null
  solicitante_nombre: string | null
  solicitante_cargo: string | null
  /** Quién lo cargó en el sistema. */
  registrada_por: string
  confirmada_por: string | null
  confirmada_en: string | null
  cotizacion_elegida_id: number | null
  aprobada_gg_por: string | null
  aprobada_gg_en: string | null
  motivo_cancelacion: string | null
  renglones: RenglonPedido[]
  cotizaciones: Cotizacion[]
  ordenes: Orden[]
}

const SELECT_DETALLE = `
  *,
  renglones:solicitud_renglones(*),
  cotizaciones:cotizaciones!cotizaciones_solicitud_id_fkey(
    *,
    proveedor:proveedores(id, nombre, rif, condicion_pago),
    renglones:cotizacion_renglones(*)
  ),
  ordenes:ordenes_compra(
    *,
    proveedor:proveedores(id, nombre, rif),
    renglones:orden_renglones(*),
    instrucciones:instrucciones_pago(*)
  )
`

export function useCompra(id: number | undefined) {
  return useQuery({
    enabled: id !== undefined && Number.isFinite(id),
    queryKey: ['compras', 'detalle', id],
    queryFn: async () =>
      desenvolver<Compra>(
        await supabase.from('solicitudes_pedido').select(SELECT_DETALLE).eq('id', id!).single(),
      ),
  })
}

export interface EventoBitacora {
  id: number
  documento_tipo: string
  documento_id: number
  estado_anterior: string | null
  estado_nuevo: string
  nota: string | null
  actor_id: string | null
  ocurrido_en: string
}

export function useBitacora(solicitudId: number | undefined, ordenId: number | null | undefined) {
  return useQuery({
    enabled: solicitudId !== undefined,
    queryKey: ['compras', 'bitacora', solicitudId, ordenId],
    queryFn: async () => {
      const eventos = desenvolver<EventoBitacora[]>(
        await supabase
          .from('compras_bitacora')
          .select('*')
          .eq('documento_tipo', 'SOLICITUD')
          .eq('documento_id', solicitudId!)
          .order('ocurrido_en'),
      )

      if (!ordenId) return eventos

      const deOrden = desenvolver<EventoBitacora[]>(
        await supabase
          .from('compras_bitacora')
          .select('*')
          .eq('documento_tipo', 'ORDEN')
          .eq('documento_id', ordenId)
          .order('ocurrido_en'),
      )

      return [...eventos, ...deOrden].sort((a, b) =>
        a.ocurrido_en.localeCompare(b.ocurrido_en),
      )
    },
  })
}

/** La orden viva de una compra. Las canceladas quedan solo como historia. */
export function ordenVigente(compra: Compra | undefined): Orden | undefined {
  if (!compra?.ordenes?.length) return undefined
  return compra.ordenes.find((o) => o.estado !== 'CANCELADA') ?? compra.ordenes[0]
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

/**
 * Toda acción invalida el tablero y el detalle. Es deliberado que no se
 * actualice el estado en local: el estado nuevo lo decide la base, que puede
 * haber hecho más cosas de las que la pantalla sabe — aprobar una compra, por
 * ejemplo, crea una orden con sus renglones.
 */
function useAccion<A>(fn: (args: A) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['compras'] })
      // Cada cambio de estado emite un aviso. Sin esta invalidación, quien lo
      // provoca no lo ve hasta la siguiente consulta periódica y parece que el
      // sistema no se enteró.
      void qc.invalidateQueries({ queryKey: ['notificaciones'] })
    },
  })
}

export interface RenglonNuevo {
  articulo_id: number | null
  descripcion: string
  cantidad: number
  unidad: string
  observacion?: string | null
}

export function useCrearPedido() {
  return useAccion(
    (p: {
      titulo: string
      justificacion: string
      renglones: RenglonNuevo[]
      prioridad?: string
      requerida_para?: string | null
      destino?: string | null
      enviar?: boolean
      /** Usuario que pide. Sin ninguno de los dos, pide quien carga. */
      solicitante_id?: string | null
      /** Quien pide y no tiene usuario: el mecánico, el operador del frente. */
      solicitante_nombre?: string | null
      solicitante_cargo?: string | null
    }) =>
      rpc<number>('crear_pedido', {
        p_titulo: p.titulo,
        p_justificacion: p.justificacion,
        p_renglones: p.renglones,
        p_prioridad: p.prioridad ?? 'NORMAL',
        p_requerida_para: p.requerida_para || null,
        p_destino: p.destino || null,
        p_enviar: p.enviar ?? true,
        p_solicitante_id: p.solicitante_id || null,
        p_solicitante_nombre: p.solicitante_nombre || null,
        p_solicitante_cargo: p.solicitante_cargo || null,
      }),
  )
}

export function useEnviarPedido() {
  return useAccion((p: { id: number }) => rpc('enviar_pedido', { p_id: p.id }))
}

export function useConfirmarPedido() {
  return useAccion((p: { id: number; nota?: string }) =>
    rpc('confirmar_pedido', { p_id: p.id, p_nota: p.nota ?? null }),
  )
}

export function useCancelarPedido() {
  return useAccion((p: { id: number; motivo: string }) =>
    rpc('cancelar_pedido', { p_id: p.id, p_motivo: p.motivo }),
  )
}

export interface RenglonCotizado {
  solicitud_renglon_id: number
  cantidad: number
  precio_unitario: number
  exento_iva: boolean
}

export function useRegistrarCotizacion() {
  return useAccion(
    (c: {
      solicitud_id: number
      proveedor_id: number
      moneda: string
      renglones: RenglonCotizado[]
      numero_proveedor?: string | null
      fecha?: string | null
      validez_dias?: number
      dias_entrega?: number | null
      condicion_pago?: string
      alicuota_iva?: number
      descuento?: number
      flete?: number
      observacion?: string | null
    }) =>
      rpc<number>('registrar_cotizacion', {
        p_solicitud_id: c.solicitud_id,
        p_proveedor_id: c.proveedor_id,
        p_moneda: c.moneda,
        p_renglones: c.renglones,
        p_numero_proveedor: c.numero_proveedor || null,
        p_fecha: c.fecha || null,
        p_validez_dias: c.validez_dias ?? 15,
        p_dias_entrega: c.dias_entrega ?? null,
        p_condicion_pago: c.condicion_pago ?? 'CONTADO',
        p_alicuota_iva: c.alicuota_iva ?? 16,
        p_descuento: c.descuento ?? 0,
        p_flete: c.flete ?? 0,
        p_observacion: c.observacion || null,
      }),
  )
}

export function useEliminarCotizacion() {
  return useAccion((p: { id: number }) => rpc('eliminar_cotizacion', { p_id: p.id }))
}

export function useProponerCotizacion() {
  return useAccion((p: { solicitud_id: number; cotizacion_id: number; nota?: string }) =>
    rpc('proponer_cotizacion', {
      p_solicitud_id: p.solicitud_id,
      p_cotizacion_id: p.cotizacion_id,
      p_nota: p.nota ?? null,
    }),
  )
}

export function useAprobarCompra() {
  return useAccion((p: { solicitud_id: number; nota?: string }) =>
    rpc<number>('aprobar_compra', { p_solicitud_id: p.solicitud_id, p_nota: p.nota ?? null }),
  )
}

export function useDevolverACotizacion() {
  return useAccion((p: { solicitud_id: number; motivo: string }) =>
    rpc('devolver_a_cotizacion', { p_solicitud_id: p.solicitud_id, p_motivo: p.motivo }),
  )
}

export const METODOS_PAGO = [
  { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia bancaria' },
  { valor: 'PAGO_MOVIL', etiqueta: 'Pago móvil' },
  { valor: 'BINANCE', etiqueta: 'Binance' },
  { valor: 'EFECTIVO', etiqueta: 'Efectivo' },
]

/** El mismo listado, para mostrar un método ya elegido. */
export const METODO_LEGIBLE: Record<string, string> = Object.fromEntries(
  METODOS_PAGO.map((m) => [m.valor, m.etiqueta]),
)

export interface DatosPago {
  banco?: string
  numero_cuenta?: string
  titular?: string
  documento?: string
  telefono?: string
  correo_binance?: string
  red_cripto?: string
  receptor?: string
}

export function useIndicarPago() {
  return useAccion(
    (p: {
      orden_id: number
      metodo: string
      moneda: string
      monto: number
      datos: DatosPago
      nota?: string
    }) =>
      rpc<number>('indicar_pago', {
        p_orden_id: p.orden_id,
        p_metodo: p.metodo,
        p_moneda: p.moneda,
        p_monto: p.monto,
        p_datos: p.datos,
        p_nota: p.nota ?? null,
      }),
  )
}

// Registrar el pago vive en tesorería (`useRegistrarPago`): quien lo hace es
// tesorería, y el movimiento que escribe es de su libro, no del de compras.

export function useDevolverInstruccion() {
  return useAccion((p: { instruccion_id: number; motivo: string }) =>
    rpc('devolver_instruccion', { p_instruccion_id: p.instruccion_id, p_motivo: p.motivo }),
  )
}

export function useCancelarOrden() {
  return useAccion((p: { orden_id: number; motivo: string }) =>
    rpc('cancelar_orden', { p_orden_id: p.orden_id, p_motivo: p.motivo }),
  )
}

export function useMarcarDesistimiento() {
  return useAccion((p: { orden_id: number; motivo: string }) =>
    rpc('marcar_desistimiento', { p_orden_id: p.orden_id, p_motivo: p.motivo }),
  )
}

export function useResolverDesistimiento() {
  return useAccion((p: { orden_id: number; resolucion: string; nota?: string }) =>
    rpc('resolver_desistimiento', {
      p_orden_id: p.orden_id,
      p_resolucion: p.resolucion,
      p_nota: p.nota ?? null,
    }),
  )
}
