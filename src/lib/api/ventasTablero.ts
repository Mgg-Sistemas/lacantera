import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/** Lo que «Despachar esta cotización» le pone al pedido de despacho. */
export interface CotizacionParaDespacho {
  id: number
  numero: string
  cliente_id: number
  moneda: string
  /** El descuento y el flete de la cotización viajan al despacho (12/11/2026). */
  descuento: number
  flete: number
  /** Pasó su «vale hasta»: se despacha igual, pero se avisa para revisar precios. */
  vencida: boolean
  renglones: Array<{
    articulo_id: number | null
    descripcion: string
    cantidad: number
    unidad: string
    precio_unitario: number
    exento_iva: boolean
    condicion: string | null
    descuento_pct: number | null
    descuento_unitario: number | null
    motivo_condicion: string | null
  }>
}

export async function leerCotizacionParaDespacho(id: number): Promise<CotizacionParaDespacho> {
  const c = desenvolver<{
    id: number
    numero: string
    cliente_id: number
    moneda: string
    descuento: number | string | null
    flete: number | string | null
    fecha: string
    validez_dias: number
  }>(
    await supabase
      .from('cotizaciones_venta')
      .select('id, numero, cliente_id, moneda, descuento, flete, fecha, validez_dias')
      .eq('id', id)
      .single(),
  )
  const renglones = desenvolver<CotizacionParaDespacho['renglones']>(
    await supabase
      .from('cotizacion_venta_renglones')
      .select('articulo_id, descripcion, cantidad, unidad, precio_unitario, exento_iva, condicion, descuento_pct, descuento_unitario, motivo_condicion')
      .eq('cotizacion_id', id)
      .order('linea'),
  )
  // Vence al terminar el día `fecha + validez_dias` (el mismo criterio de la vista).
  const vence = new Date(`${c.fecha}T12:00:00`)
  vence.setDate(vence.getDate() + Number(c.validez_dias || 0))
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return {
    id: c.id,
    numero: c.numero,
    cliente_id: c.cliente_id,
    moneda: c.moneda,
    descuento: Number(c.descuento ?? 0),
    flete: Number(c.flete ?? 0),
    vencida: vence < hoy,
    renglones,
  }
}

/*
  EL TABLERO DE VENTAS (la dueña, 10/11/2026: «así como se tiene compras»).

  Una tarjeta por venta en su etapa. No hay una tabla nueva: la base junta los
  documentos que ya existen (`ventas_tablero`) —cotización, solicitud de
  despacho, nota de entrega, factura, cobros y conciliación— y le pone a cada
  uno la columna donde va. Así lo vendido no se reescribe.
*/

export type EtapaVenta = 'cot' | 'aprobar' | 'despachada' | 'facturada' | 'cobrada' | 'anulada'
export type TipoDocVenta = 'COT' | 'SD' | 'NE' | 'FAC'
export type MotivoNoDespacho = 'sin_cupo' | 'deuda_vencida' | 'sin_material' | 'otro'

export interface RenglonDespacho {
  articulo_id: number | null
  descripcion: string
  cantidad: number
  unidad: string
  precio_unitario: number | null
  condicion?: string | null
}

export interface TarjetaVenta {
  clave: string
  tipo: TipoDocVenta
  id: number
  numero: string
  etapa: EtapaVenta
  estado_doc: string
  cliente_id: number | null
  cliente: string | null
  rif: string | null
  at: string | null
  fecha?: string | null
  moneda: string | null
  tasa?: number | null
  /** Montos: solo llegan a quien puede verlos. */
  total?: number | null
  total_usd?: number | null
  total_bs?: number | null
  iva?: number | null
  igtf?: number | null
  aplicado?: number | null
  saldo_usd?: number | null
  cobrado?: number | null
  renglones?: RenglonDespacho[]
  almacen?: string | null
  chofer?: string | null
  cedula_chofer?: string | null
  vehiculo?: string | null
  ticket?: string | null
  guia_id?: number | null
  facturable?: boolean
  pago_combinado?: boolean
  pendiente_por_cobrar?: boolean
  fecha_pago?: string | null
  vencida?: boolean
  precios_pendientes?: number
  desde_salida?: boolean
  nota_salida?: string | null
  observacion?: string | null
  numero_control?: string | null
  condicion?: string | null
  vence_el?: string | null
  por?: string | null
  por_id?: string | null
  motivo?: string | null
  cobrada_en?: string | null
  no_despacho_motivo?: MotivoNoDespacho | null
  no_despacho_detalle?: string | null
  no_despacho_por?: string | null
  no_despacho_en?: string | null
  resumen?: string | null
  cadena: { cot?: string | null; sd?: string | null; ne?: string | null; ns?: string | null; fac?: string | null }
}

export interface PermisosVentas {
  ver: boolean
  cotizar: boolean
  despachar: boolean
  aprueba_despacho: boolean
  facturar: boolean
  cobrar: boolean
  conciliar: boolean
  anular: boolean
  montos: boolean
}

export function useVentasTablero(dias: number) {
  return useQuery({
    queryKey: ['ventas', 'tablero', dias],
    queryFn: () => rpc<TarjetaVenta[]>('ventas_tablero', { p_dias: dias }),
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  })
}

export function usePermisosVentas() {
  return useQuery({
    queryKey: ['ventas', 'tablero-permisos'],
    queryFn: () => rpc<PermisosVentas>('ventas_mis_permisos'),
    staleTime: 5 * 60_000,
  })
}

function useInvalidarVentas() {
  const qc = useQueryClient()
  return () => {
    // Todo Ventas cuelga de ['ventas'] (notas, despachos, cotizaciones, el tablero).
    void qc.invalidateQueries({ queryKey: ['ventas'] })
    void qc.invalidateQueries({ queryKey: ['existencias'] })
    void qc.invalidateQueries({ queryKey: ['movimientos'] })
  }
}

/** «¿Se despacha?» → Sí. Devuelve el id de la nota de entrega nueva. */
export function useAprobarDespachoVenta() {
  const invalidar = useInvalidarVentas()
  return useMutation({
    mutationFn: (id: number) => rpc<number>('aprobar_despacho', { p_id: id }),
    onSuccess: invalidar,
  })
}

/** «¿Se despacha?» → No, por ahora: queda por aprobar con el motivo. */
export function useNoSeDespacha() {
  const invalidar = useInvalidarVentas()
  return useMutation({
    mutationFn: (d: { id: number; motivo: MotivoNoDespacho; detalle: string | null }) =>
      rpc<{ id: number; numero: string; motivo: MotivoNoDespacho; texto: string }>('ventas_no_se_despacha', {
        p_id: d.id,
        p_motivo: d.motivo,
        p_detalle: d.detalle,
      }),
    onSuccess: invalidar,
  })
}

/** «No procede»: el despacho queda no aprobado (RECHAZADA) con su motivo. */
export function useRechazarDespachoVenta() {
  const invalidar = useInvalidarVentas()
  return useMutation({
    mutationFn: (d: { id: number; motivo: string }) => rpc<void>('rechazar_despacho', { p_id: d.id, p_motivo: d.motivo }),
    onSuccess: invalidar,
  })
}
