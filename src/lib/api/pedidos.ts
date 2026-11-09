import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'
import type { DatosPago, PagoMetodo, Retencion } from '@/lib/pagos'
import { normalizarCierre, normalizarFilas } from '@/lib/reportesCompras'

/*
  PEDIDOS / COMPRAS COMO EN MGG (fase 1, 07/11/2026)

  Una sola tabla, `compras_ordenes`: la Solicitud de Pedido y, después, su
  orden de compra. Se lee con `compras_ordenes_visibles` (decide qué filas
  ve cada quien, y solo Compras recibe los datos de pago) y se escribe solo
  por funciones, que vuelven a preguntar el permiso. Todo lo que cambia invalida `['pedidos']`, y el canal en vivo
  (`tiempoReal.ts`) también, así que dos pantallas abiertas no se pisan.
*/

export type EstadoOrden =
  | 'revision_almacen'
  | 'atendida_almacen'
  | 'pendiente'
  | 'aprobada'
  | 'asignada'
  | 'oc_creada'
  | 'confirmada_metodo'
  | 'cuenta_abierta'
  | 'oc_aprobada'
  | 'por_recibir'
  | 'pagada'
  | 'recibida'
  | 'finalizada'
  | 'cancelada'
  | 'anulada'
  | 'desistida_proveedor'

/** Lo que el almacén marcó de un renglón. */
export interface MarcaAlmacen {
  disponible: number
  revisado: boolean
  /** El artículo de ALM-GEN que entrega (un renglón «general» no tiene ficha). */
  articulo_id?: number | null
  por?: string | null
  por_nombre?: string | null
  en?: string | null
}

/** El renglón, con la forma de MGG (`productoId` es aquí `articulo_id`). */
export interface ItemOrden {
  sku: string
  nombre: string
  cantidad: number
  /** Unitario BCV, en $. */
  precio: number
  /** Unitario si se paga en divisa efectivo. */
  precio_usd?: number | null
  articulo_id?: number | null
  unidad?: string | null
  /** Sin valor = se compra. */
  comprar?: boolean
  finalidad?: string | null
  /** Renglón sin ficha: Compras le pone el nombre de inventario al cotizar. */
  general?: boolean
  marca?: string | null
  modelo?: string | null
  // La revisión del almacén.
  cantidad_solicitada?: number | null
  cantidad_almacen?: number | null
  almacen_revisado?: boolean
  almacen_sedes?: Record<string, MarcaAlmacen> | null
  almacen_origenes?: Record<string, number> | null
  almacen_articulo_id?: number | null
  /** La salida que no se aprobó y devolvió el renglón a Compras. */
  almacen_sin_salida?: string | null
  // La OC (fase 2): lo que sale de la cotización aceptada.
  /** El precio BCV unitario de la cotización (para volver a «Pago en Bs»). */
  precio_bcv?: number | null
  /** La medida en que vende el proveedor (BULTO) y cuántas unidades de uso trae. */
  unidad_compra?: string | null
  factor_compra?: number | null
  /** «Se guarda en inventario como»: la ficha ligada a un renglón de nombre general. */
  articulo_nombre?: string | null
  /** Producto que el proveedor agregó en su cotización (la SP no lo pedía). */
  agregado?: boolean
  // La recepción (fase 4), en la unidad de compra.
  /** Lo recibido, acumulado entre todas las recepciones. */
  cantidad_recibida?: number | null
  /** La marca con la que llegó, si es otra. */
  marca_recibida?: string | null
  nota_marca?: string | null
  /** Este renglón no entra al inventario (servicio o consumo inmediato). */
  sin_inventario?: boolean
  /** La ficha se creó al recibir (renglón de nombre general). */
  ficha_creada?: boolean
  // Solo servicios (fase 5a, MGG `ItemOrden` de clase 'servicio').
  servicio_categoria?: string | null
  servicio_tipo?: string | null
  /** El equipo de Maquinaria; un electrodoméstico va solo con su nombre. */
  equipo_id?: number | null
  equipo_nombre?: string | null
  /** Recarga: bombonas (o botellones) y los kg (o litros) en total. */
  bombonas?: number | null
  kg_recarga?: number | null
  /** «▸ Detalle (opcional)»: piezas y trabajos del renglón. */
  detalle_items?: DetalleServicioItem[] | null
}

/** Una pieza o trabajo del detalle de un renglón de servicio (MGG `DetalleServicioItem`). */
export interface DetalleServicioItem {
  descripcion: string
  cantidad?: number | null
  precio?: number | null
}

export interface EventoHistorial {
  at: string
  evento: string
  actor?: string | null
  actor_nombre?: string | null
  motivo?: string | null
  detalle?: string | null
  [clave: string]: unknown
}

export interface Imagen {
  path: string
  filename: string
}

export interface Orden {
  id: number
  codigo: string
  parent_orden_id: number | null
  clase: 'producto' | 'servicio'
  estado: EstadoOrden
  proveedor_id: number | null
  creado_por: string
  creado_por_nombre: string | null
  solicitante_id: string | null
  solicitante_nombre: string | null
  unidad_solicitante: string | null
  items: ItemOrden[]
  total: number | string
  moneda: string
  notas: string | null
  motivo: string | null
  finalidad: string | null
  urgente: boolean
  imagenes: Imagen[]
  historial: EventoHistorial[]
  creado_en: string
  actualizado_en: string | null
  revisada_almacen_por: string | null
  revisada_almacen_por_nombre: string | null
  revisada_almacen_en: string | null
  nota_almacen: string | null
  revision_sedes: Record<
    string,
    { confirmada_por?: string | null; confirmada_por_nombre?: string | null; confirmada_en?: string | null; nota?: string | null }
  > | null
  salida_almacen_numero: string | null
  aprobada_por: string | null
  aprobada_por_nombre: string | null
  aprobada_en: string | null
  rechazada_en: string | null
  motivo_rechazo: string | null
  cancelada_por_nombre: string | null
  cancelada_en: string | null
  motivo_cancelacion: string | null
  oc_codigo: string | null
  oc_creada_por_nombre: string | null
  oc_creada_en: string | null
  oc_aprobada_por_nombre: string | null
  oc_aprobada_en: string | null
  condiciones_pago: string | null
  modalidad_pago: 'usd' | 'bs' | null
  // La OC (fase 2).
  oc_creada_por: string | null
  oc_aprobada_por: string | null
  oferta_detalle: DetalleOferta | null
  oferta_precio_efectivo: number | string | null
  oferta_precio_bcv: number | string | null
  oferta_motivo: string | null
  oferta_motivo_adjuntos: Imagen[] | null
  descuento_obtenido: number | string | null
  iva: number | string | null
  igtf: number | string | null
  iva_incluido: boolean
  ajuste: number | string | null
  ajuste_motivo: string | null
  pago_en_divisa: boolean | null
  total_divisa: number | string | null
  clasificacion: string[]
  anulada_por_nombre: string | null
  anulada_en: string | null
  motivo_anulacion: string | null
  recibida_en: string | null
  abonado_total: number | string
  // El pago (fase 3, sin Tesorería).
  metodo_pago: PagoMetodo[] | null
  metodo_pago_por_nombre: string | null
  metodo_pago_en: string | null
  descuento_pago: number | string | null
  pago_qr_path: string | null
  pago_qr_nombre: string | null
  numero_administracion: string | null
  comprobante_tipo: 'factura' | 'nota_entrega' | null
  retenciones: Retencion[]
  /** IVA de la factura cuando la OC se cotizó sin IVA (08/11/2026): se suma al total. */
  iva_factura?: number | string | null
  /** Tasa BCV de las retenciones que se pagan en Bs (08/11/2026). */
  retenciones_tasa?: number | string | null
  pagada_por: string | null
  pagada_por_nombre: string | null
  pagada_en: string | null
  pago_fecha: string | null
  pago_referencia: string | null
  pago_monto: number | string | null
  pago_moneda: 'USD' | 'Bs' | 'USDT' | null
  pago_tasa: number | string | null
  pago_monto_usd: number | string | null
  pago_comprobante_path: string | null
  pago_comprobante_nombre: string | null
  pago_nota: string | null
  // La recepción (fase 4): contra entrega paga lo recibido.
  recibido_total: number | string | null
  recibida_por: string | null
  recibida_por_nombre: string | null
  nota_recepcion: string | null
  sin_inventario: boolean
  recepcion_fotos: Array<Imagen & { recepcion?: number }> | null
  factura_path: string | null
  factura_nombre: string | null
  factura_tipo: 'factura' | 'nota_entrega' | null
  finalizada_por_nombre: string | null
  finalizada_en: string | null
}

/** Datos técnicos y logística de la oferta elegida (MGG `oferta_detalle`). */
export interface DetalleOferta {
  marca?: string | null
  modelo?: string | null
  procedencia?: string | null
  materiales?: string | null
  dimensiones?: string | null
  peso?: string | null
  calidad?: string | null
  logistica?: Partial<Record<'flete' | 'transporte' | 'embalaje' | 'seguros', 'incluido' | 'comprador'>> | null
}

/** Una fila de la cotización. Varias con el mismo sku son variantes de marca. */
export interface ItemOferta {
  sku: string
  nombre: string
  cantidad: number
  precio: number
  precio_usd?: number | null
  unidad?: string | null
  marca?: string | null
  modelo?: string | null
  unidad_compra?: string | null
  factor_compra?: number | null
  /** «Se guarda en inventario como» (renglón general) o el producto agregado. */
  articulo_id?: number | null
  articulo_nombre?: string | null
  agregado?: boolean
  comprar?: boolean
}

/** Una cotización (MGG `ofertas_proveedor`). */
export interface Oferta {
  id: number
  orden_id: number
  proveedor_id: number
  items: ItemOferta[]
  precio_total: number | string
  precio_efectivo: number | string | null
  descuento: number | string | null
  iva: number | string | null
  igtf: number | string | null
  iva_incluido: boolean
  ajuste: number | string | null
  ajuste_motivo: string | null
  fecha_entrega_prometida: string | null
  condiciones_pago: string | null
  notas: string | null
  detalle: DetalleOferta | null
  estado: 'pendiente' | 'aceptada' | 'descartada'
  score_calculado: number | string | null
  motivo_descarte: string | null
  adjuntos: Imagen[]
  registrada_por: string
  registrada_por_nombre: string | null
  registrada_en: string
  decidida_por: string | null
  decidida_por_nombre: string | null
  decidida_en: string | null
}

/** Lo que alimenta el score (MGG `ProveedorStats`). */
export interface EstadisticaProveedor {
  proveedor_id: number
  puntualidad_pct: number
  calidad_avg: number
  cumplimiento_pct: number
  total_evaluaciones: number
  total_ordenes: number
}

/** Un mensaje del chat interno de la orden (MGG `oc_mensajes`). */
export interface MensajeOrden {
  id: number
  orden_id: number
  texto: string
  autor: string
  autor_nombre: string | null
  leido_por: string[]
  creado_en: string
}

/** Los permisos de MGG traducidos (ver `compras_mis_permisos_de_pedidos`). */
export interface PermisosPedidos {
  /** Ve Compras: si no, es «soloSolicitud». */
  compras: boolean
  escribe: boolean
  /** MGG `canManageProcurement`. */
  gestiona: boolean
  aprueba_oc: boolean
  revisa_almacen: boolean
  /** Recibe en el almacén general (Inventario en escritura o rol de almacén). */
  recibe_almacen?: boolean
  pide_por_otro: boolean
  yo: string
  mi_nombre: string | null
}

export const BUCKET_PEDIDOS = 'compras-pedidos'
/** Las fotos/PDF de las cotizaciones y del motivo de elección (MGG `ofertas-pdf`). */
export const BUCKET_OFERTAS = 'compras-ofertas'
export const MAX_IMAGENES_OP = 4
/** Comprobantes de pago y de abonos, y la imagen / QR de pago (fase 3). */
export const BUCKET_PAGOS = 'compras-pagos'
/** Fotos de la recepción y la factura / nota de entrega escaneada (fase 4). */
export const BUCKET_RECEPCIONES = 'compras-recepciones'

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------

export function usePermisosPedidos() {
  return useQuery({
    queryKey: ['pedidos', 'permisos'],
    queryFn: () => rpc<PermisosPedidos>('compras_mis_permisos_de_pedidos'),
    staleTime: 5 * 60_000,
  })
}

/** Todas las órdenes que cada quien puede ver, la más nueva primero. */
export function usePedidos() {
  return useQuery({
    queryKey: ['pedidos', 'lista'],
    queryFn: () => rpc<Orden[]>('compras_ordenes_visibles', { p_vista: 'todas' }),
    refetchOnWindowFocus: true,
    // El canal en vivo de la tabla solo llega a Compras; los demás refrescan solos.
    refetchInterval: 60_000,
  })
}

/** «Por revisar»: las que esperan al almacén, la más vieja primero. */
export function useSolicitudesEnRevision() {
  return useQuery({
    queryKey: ['pedidos', 'almacen', 'por-revisar'],
    queryFn: () => rpc<Orden[]>('compras_ordenes_visibles', { p_vista: 'por_revisar' }),
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  })
}

/** «Revisadas»: las que el almacén cerró en los últimos `dias`. */
export function useSolicitudesRevisadas(dias = 30) {
  return useQuery({
    queryKey: ['pedidos', 'almacen', 'revisadas', dias],
    queryFn: () => rpc<Orden[]>('compras_ordenes_visibles', { p_vista: 'revisadas', p_dias: dias }),
    refetchOnWindowFocus: true,
  })
}

export function useProximoCodigo(activo: boolean) {
  return useQuery({
    queryKey: ['pedidos', 'proximo-codigo'],
    queryFn: () => rpc<string>('compras_proximo_codigo'),
    enabled: activo,
    staleTime: 0,
  })
}

export function useUnidadesSolicitantes() {
  return useQuery({
    queryKey: ['pedidos', 'unidades'],
    queryFn: async () =>
      desenvolver<{ id: number; nombre: string; activo: boolean }[]>(
        await supabase
          .from('compras_unidades_solicitantes')
          .select('id, nombre, activo')
          .eq('activo', true)
          .order('nombre'),
      ),
    staleTime: 5 * 60_000,
  })
}

/** Una dirección firmada de diez minutos, como `compras-oc` en MGG. */
export async function urlImagen(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_PEDIDOS).createSignedUrl(path, 600)
  if (error || !data) throw new Error(error?.message ?? 'No se pudo abrir la imagen')
  return data.signedUrl
}

// ---------------------------------------------------------------------------
// Escrituras
// ---------------------------------------------------------------------------

function useInvalidar() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['pedidos'] })
}

export interface DatosSolicitud {
  items: Array<Partial<ItemOrden> & { nombre: string; cantidad: number }>
  notas: string
  unidad_solicitante: string | null
  solicitante_nombre: string | null
  urgente: boolean
}

export function useCrearSolicitud() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: DatosSolicitud) =>
      rpc<{ id: number; codigo: string; estado: EstadoOrden }>('compras_crear_solicitud', {
        p_items: d.items,
        p_notas: d.notas,
        p_unidad_solicitante: d.unidad_solicitante,
        p_solicitante_nombre: d.solicitante_nombre,
        p_urgente: d.urgente,
      }),
    onSuccess: invalidar,
  })
}

export function useEditarSolicitud() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: DatosSolicitud & { id: number }) =>
      rpc<{ id: number; codigo: string; estado: EstadoOrden }>('compras_editar_solicitud', {
        p_id: d.id,
        p_items: d.items,
        p_notas: d.notas,
        p_unidad_solicitante: d.unidad_solicitante,
        p_solicitante_nombre: d.solicitante_nombre,
        p_urgente: d.urgente,
      }),
    onSuccess: invalidar,
  })
}

export function useCancelarOrden() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: { id: number; motivo: string }) =>
      rpc('compras_cancelar_orden', { p_id: d.id, p_motivo: d.motivo }),
    onSuccess: invalidar,
  })
}

export function useAprobarOrden() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (id: number) => rpc('compras_aprobar_orden', { p_id: id }),
    onSuccess: invalidar,
  })
}

export function useMarcarComprar() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: { id: number; sku: string; comprar: boolean }) =>
      rpc('compras_marcar_comprar', { p_id: d.id, p_sku: d.sku, p_comprar: d.comprar }),
    onSuccess: invalidar,
  })
}

export function useEditarCantidades() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: { id: number; cantidades: Record<string, number>; eliminar: string[] }) =>
      rpc('compras_editar_cantidades', { p_id: d.id, p_cantidades: d.cantidades, p_eliminar: d.eliminar }),
    onSuccess: invalidar,
  })
}

export function useAgregarUnidad() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (nombre: string) => rpc<string>('compras_agregar_unidad_solicitante', { p_nombre: nombre }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pedidos', 'unidades'] }),
  })
}

/** Una marca de la revisión: lo que el almacén tiene de un renglón. */
export interface MarcaEnviada {
  sku: string
  disponible: number
  revisado: boolean
  articulo_id: number | null
}

/*
  El autoguardado de la revisión (MGG `guardarMarcasSede`): solo los renglones
  tocados. No invalida la lista a propósito: la pantalla que marca ya tiene lo
  suyo, y rehacer la consulta a cada toque haría saltar lo que se está
  escribiendo. El canal en vivo se encarga de las demás pantallas.
*/
export function guardarMarcas(id: number, marcas: MarcaEnviada[]): Promise<Orden> {
  return rpc<Orden>('compras_revisar_en_almacen', { p_id: id, p_items: marcas, p_confirmar: false })
}

export function useConfirmarRevision() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: { id: number; marcas: MarcaEnviada[]; nota: string | null }) =>
      rpc<Orden>('compras_revisar_en_almacen', {
        p_id: d.id,
        p_items: d.marcas,
        p_confirmar: true,
        p_nota: d.nota,
      }),
    onSuccess: invalidar,
  })
}

/*
  LAS FOTOS DE REFERENCIA (MGG `guardarImagenesOrden`).

  Se suben al depósito en la carpeta de la orden, se borran las que se quitaron
  y al final se anota la lista. Va después de crear o editar, como en MGG: si
  las fotos fallan, la orden ya quedó y se avisa aparte.
*/
export async function guardarImagenesOrden(
  ordenId: number,
  nuevas: File[],
  existentes: Imagen[] = [],
  quitar: string[] = [],
): Promise<void> {
  const quedan = existentes.filter((a) => !quitar.includes(a.path))
  const subidas: Imagen[] = []
  for (const f of nuevas) {
    const limpio = f.name.replace(/[^\w.-]+/g, '_').slice(-80) || 'imagen'
    const path = `${ordenId}/op-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${limpio}`
    const { error } = await supabase.storage
      .from(BUCKET_PEDIDOS)
      .upload(path, f, { upsert: false, contentType: f.type || undefined })
    if (error) throw new Error(error.message)
    subidas.push({ path, filename: f.name })
  }
  if (quitar.length) {
    // Que no se borre del depósito no deja la orden mal: la lista es la que manda.
    await supabase.storage.from(BUCKET_PEDIDOS).remove(quitar)
  }
  await rpc('compras_guardar_imagenes', { p_id: ordenId, p_imagenes: [...quedan, ...subidas] })
}

// ---------------------------------------------------------------------------
// Fase 2: cotizaciones, OC y chat
// ---------------------------------------------------------------------------

/** Las cotizaciones de unas órdenes (las madres), la más barata primero (MGG). */
export function useOfertas(ordenIds: number[]) {
  const ids = [...new Set(ordenIds)].sort((a, b) => a - b)
  return useQuery({
    queryKey: ['pedidos', 'ofertas', ids],
    queryFn: async () =>
      desenvolver<Oferta[]>(
        await supabase.from('compras_ofertas').select('*').in('orden_id', ids).order('precio_total', { ascending: true }),
      ),
    enabled: ids.length > 0,
  })
}

export function useEstadisticasProveedores(activo = true) {
  return useQuery({
    queryKey: ['pedidos', 'estadisticas-proveedores'],
    queryFn: () => rpc<EstadisticaProveedor[]>('compras_estadisticas_proveedores'),
    enabled: activo,
    staleTime: 60_000,
  })
}

/** Una dirección firmada de cinco minutos, como `ofertas-pdf` en MGG. */
export async function urlAdjuntoOferta(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_OFERTAS).createSignedUrl(path, 300)
  if (error || !data) throw new Error(error?.message ?? 'No se pudo abrir el adjunto')
  return data.signedUrl
}

/** MGG `subirAdjuntosOferta`: `{ordenId}/{provId}-{nonce}-{nombre}`. */
export async function subirAdjuntosOferta(madreId: number, prefijo: string, archivos: File[]): Promise<Imagen[]> {
  const out: Imagen[] = []
  for (const f of archivos) {
    const limpio = f.name.replace(/[^\w.-]+/g, '_').slice(-80) || 'archivo'
    const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const path = `${madreId}/${prefijo}-${nonce}-${limpio}`
    const { error } = await supabase.storage
      .from(BUCKET_OFERTAS)
      .upload(path, f, { upsert: false, contentType: f.type || undefined })
    if (error) throw new Error(error.message)
    out.push({ path, filename: f.name })
  }
  return out
}

export interface DatosOferta {
  items: Array<Partial<ItemOferta> & { sku: string }>
  descuento: number | null
  iva: number | null
  igtf: number | null
  iva_incluido: boolean
  ajuste: number | null
  ajuste_motivo: string | null
  fecha_entrega_prometida: string | null
  condiciones_pago: string | null
  notas: string | null
  detalle: DetalleOferta | null
  adjuntos: Imagen[]
}

export interface ProveedorNuevo {
  razon_social: string
  rif: string
  telefono: string | null
  correo: string | null
  direccion: string | null
}

export function useGuardarOferta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: {
      ordenId: number
      ofertaId: number | null
      proveedorId: number | null
      proveedorNuevo: ProveedorNuevo | null
      datos: DatosOferta
      motivoCambio?: string | null
    }) =>
      rpc<{ id: number; proveedor_id: number; proveedor_creado: boolean; orden_id: number }>('compras_guardar_oferta', {
        p_orden_id: d.ordenId,
        p_oferta_id: d.ofertaId,
        p_proveedor_id: d.proveedorId,
        p_proveedor_nuevo: d.proveedorNuevo,
        p_datos: d.datos,
        p_motivo_cambio: d.motivoCambio ?? null,
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['pedidos'] })
      if (r.proveedor_creado) void qc.invalidateQueries({ queryKey: ['proveedores'] })
    },
  })
}

export function useEliminarOferta() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async (id: number) => {
      const adjuntos = await rpc<Imagen[]>('compras_eliminar_oferta', { p_oferta_id: id })
      // Que no se borre del depósito no deja nada mal: la oferta ya no existe.
      if (adjuntos?.length) await supabase.storage.from(BUCKET_OFERTAS).remove(adjuntos.map((a) => a.path))
    },
    onSuccess: invalidar,
  })
}

/** [{sku, idx}] — idx: la fila (marca) elegida dentro de `oferta.items`. */
export type Seleccion = Array<{ sku: string; idx: number | null }>

export function useAceptarOferta() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: {
      ordenId: number
      ofertaId: number
      seleccion: Seleccion
      modalidad: 'usd' | 'bs'
      motivo: string | null
      adjuntos: Imagen[]
      score: number | null
    }) =>
      rpc<{ id: number; codigo: string; oc_codigo: string; sub_oc: boolean }>('compras_aceptar_oferta', {
        p_orden_id: d.ordenId,
        p_oferta_id: d.ofertaId,
        p_seleccion: d.seleccion,
        p_modalidad: d.modalidad,
        p_motivo: d.motivo,
        p_motivo_adjuntos: d.adjuntos,
        p_score: d.score,
      }),
    onSuccess: invalidar,
  })
}

export function useAsignarProveedores() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: { ordenId: number; asignaciones: Array<{ oferta_id: number; skus: string[]; modalidad: 'usd' | 'bs' }> }) =>
      rpc<Array<{ id: number; codigo: string; oc_codigo: string }>>('compras_asignar_proveedores', {
        p_orden_id: d.ordenId,
        p_asignaciones: d.asignaciones,
      }),
    onSuccess: invalidar,
  })
}

export function useReabrirOc() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: { id: number; motivo: string | null }) => rpc('compras_reabrir_oc', { p_id: d.id, p_motivo: d.motivo }),
    onSuccess: invalidar,
  })
}

export function useDesistirProveedor() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: { id: number; motivo: string }) => rpc('compras_desistir_proveedor', { p_id: d.id, p_motivo: d.motivo }),
    onSuccess: invalidar,
  })
}

export function useAnularOc() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: { id: number; motivo: string }) => rpc('compras_anular_oc', { p_id: d.id, p_motivo: d.motivo }),
    onSuccess: invalidar,
  })
}

export interface DatosEditarOc {
  items: Array<{
    sku: string
    nombre: string
    cantidad: number
    precio: number
    marca: string | null
    modelo: string | null
    finalidad: string | null
    articulo_id?: number | null
  }>
  proveedor_id: number | null
  condiciones_pago: string | null
  notas: string | null
  descuento: number | null
  iva?: number | null
  igtf?: number | null
  iva_incluido?: boolean
  ajuste?: number | null
  ajuste_motivo?: string | null
  unidad_solicitante?: string | null
  solicitante_nombre?: string | null
  motivo?: string | null
  finalidad?: string | null
  urgente?: boolean
}

export function useEditarOc() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: { id: number; datos: DatosEditarOc }) =>
      rpc<{ sin_cambios: boolean; reabierta: boolean }>('compras_editar_oc', { p_id: d.id, p_datos: d.datos }),
    onSuccess: invalidar,
  })
}

export function useCambiarModalidad() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: { id: number; modalidad: 'usd' | 'bs' }) =>
      rpc('compras_cambiar_modalidad_pago', { p_id: d.id, p_modalidad: d.modalidad }),
    onSuccess: invalidar,
  })
}

/** El hilo de una orden, del más viejo al más nuevo. */
export function useMensajesOrden(ordenId: number) {
  return useQuery({
    queryKey: ['pedidos', 'mensajes', ordenId],
    queryFn: async () =>
      desenvolver<MensajeOrden[]>(
        await supabase
          .from('compras_mensajes')
          .select('*')
          .eq('orden_id', ordenId)
          .order('creado_en', { ascending: true })
          .limit(500),
      ),
  })
}

/** Cuántos mensajes sin leer tiene cada orden (MGG `noLeidosPorOrden`). */
export function useNoLeidos(yo: string | null | undefined) {
  return useQuery({
    queryKey: ['pedidos', 'mensajes', 'no-leidos', yo],
    enabled: !!yo,
    queryFn: async () => {
      const filas = desenvolver<Array<{ orden_id: number }>>(
        await supabase.from('compras_mensajes').select('orden_id').not('leido_por', 'cs', `{${yo}}`).limit(2000),
      )
      const m = new Map<number, number>()
      for (const f of filas) m.set(f.orden_id, (m.get(f.orden_id) ?? 0) + 1)
      return m
    },
  })
}

export function useEnviarMensaje() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: { ordenId: number; texto: string }) =>
      rpc<MensajeOrden>('compras_enviar_mensaje', { p_orden_id: d.ordenId, p_texto: d.texto }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pedidos', 'mensajes'] }),
  })
}

export async function marcarMensajesLeidos(ordenId: number): Promise<void> {
  await rpc('compras_marcar_mensajes_leidos', { p_orden_id: ordenId })
}

// ---------------------------------------------------------------------------
// Fase 3: aprobación y pago (dentro de Compras, sin Tesorería)
// ---------------------------------------------------------------------------

/** Un abono a un crédito (MGG `abonos_credito`, sin caja). */
export interface Abono {
  id: number
  orden_id: number
  fecha: string
  /** En dólares: lo que baja del saldo. */
  monto: number | string
  moneda: 'USD' | 'Bs' | 'USDT'
  monto_moneda: number | string
  tasa: number | string | null
  metodo: string
  referencia: string | null
  comprobante_path: string | null
  comprobante_nombre: string | null
  nota: string | null
  saldo_restante: number | string | null
  registrado_por: string
  registrado_por_nombre: string | null
  registrado_en: string
}

/** Una cuenta del proveedor para pagarle (MGG `proveedor_datos_pago`). */
export interface CuentaProveedor {
  id: number
  proveedor_id: number
  metodo: string
  datos: DatosPago
  clave: string
  actualizado_en: string
}

/** Un archivo ya subido: {path, filename}. */
export type ArchivoSubido = Imagen

/** «✔ Aprobar OC» individual y «✔ Aprobar en lote» (MGG `aprobarOcsEnLote`). */
export function useAprobarOc() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (ids: number[]) =>
      rpc<Array<{ id: number; codigo: string; oc_codigo: string | null; estado: EstadoOrden }>>('compras_aprobar_oc', {
        p_ids: ids,
      }),
    onSuccess: invalidar,
  })
}

export interface DatosMetodoPago {
  metodos: Array<{ metodo: string; monto: number; datos?: DatosPago }>
  numero_administracion: string
  comprobante_tipo: 'factura' | 'nota_entrega'
  retenciones: Array<{ tipo: string; modo: string; valor: number | null; moneda: 'USD' | 'Bs' }>
  descuento_pago?: number | null
  qr?: ArchivoSubido | null
  confirmo_recepcion?: boolean
}

export function useIndicarMetodoPago() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: { id: number; datos: DatosMetodoPago }) =>
      rpc<{ id: number; estado: EstadoOrden; monto_a_pagar: number }>('compras_indicar_metodo_pago', {
        p_id: d.id,
        p_datos: d.datos,
      }),
    onSuccess: invalidar,
  })
}

export function useCorregirMetodoPago() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: { id: number; datos: DatosMetodoPago }) =>
      rpc<{ id: number; estado: EstadoOrden; monto_a_pagar: number }>('compras_corregir_metodo_pago', {
        p_id: d.id,
        p_datos: d.datos,
      }),
    onSuccess: invalidar,
  })
}

/**
 * El IVA de la factura y la tasa BCV de las retenciones en Bs (08/11/2026).
 * Se guarda justo antes de indicar o corregir el pago, o el documento de un
 * crédito, para que la base ya calcule con ellos.
 */
export function useDatosFiscalesPago() {
  return useMutation({
    mutationFn: (d: { id: number; iva_factura: number | null; tasa: number | null }) =>
      rpc<{ id: number; iva_factura: number | null; retenciones_tasa: number | null }>('compras_datos_fiscales_pago', {
        p_id: d.id,
        p_iva_factura: d.iva_factura,
        p_tasa: d.tasa,
      }),
  })
}

export function useDocumentoRetenciones() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: {
      id: number
      comprobante_tipo: 'factura' | 'nota_entrega'
      retenciones: DatosMetodoPago['retenciones']
    }) =>
      rpc<{ id: number; monto_a_pagar: number; saldo: number }>('compras_documento_retenciones', {
        p_id: d.id,
        p_comprobante_tipo: d.comprobante_tipo,
        p_retenciones: d.retenciones,
      }),
    onSuccess: invalidar,
  })
}

/** Lo que se escribe al registrar un pago o un abono. */
export interface DatosPagoRegistrado {
  fecha: string
  monto: number
  moneda: 'USD' | 'Bs' | 'USDT'
  tasa: number | null
  referencia: string | null
  comprobante: ArchivoSubido | null
  nota: string | null
  /** Solo el abono: con qué se abonó. */
  metodo?: string
}

export function useMarcarPagada() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: { id: number; datos: DatosPagoRegistrado }) =>
      rpc<{ id: number; estado: EstadoOrden; monto_usd: number }>('compras_marcar_pagada', { p_id: d.id, p_datos: d.datos }),
    onSuccess: invalidar,
  })
}

export function useRegistrarAbono() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: { id: number; datos: DatosPagoRegistrado }) =>
      rpc<{ id: number; abonado_total: number; saldo: number }>('compras_registrar_abono', { p_id: d.id, p_datos: d.datos }),
    onSuccess: invalidar,
  })
}

export function useEnviarCreditoARecepcion() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (id: number) => rpc('compras_enviar_credito_a_recepcion', { p_id: id }),
    onSuccess: invalidar,
  })
}

/** Los abonos de una orden, del más viejo al más nuevo. */
export function useAbonos(ordenId: number, activo = true) {
  return useQuery({
    queryKey: ['pedidos', 'abonos', ordenId],
    enabled: activo,
    queryFn: async () =>
      desenvolver<Abono[]>(
        await supabase
          .from('compras_abonos')
          .select('*')
          .eq('orden_id', ordenId)
          .order('registrado_en', { ascending: true }),
      ),
  })
}

/** Las cuentas guardadas del proveedor, la más reciente primero. */
export function useCuentasProveedor(proveedorId: number | null | undefined) {
  return useQuery({
    queryKey: ['pedidos', 'datos-pago', proveedorId],
    enabled: !!proveedorId,
    queryFn: async () =>
      desenvolver<CuentaProveedor[]>(
        await supabase
          .from('proveedor_datos_pago')
          .select('*')
          .eq('proveedor_id', proveedorId!)
          .order('actualizado_en', { ascending: false }),
      ),
  })
}

export function useQuitarCuentaProveedor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => rpc('compras_quitar_datos_pago', { p_id: id }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pedidos', 'datos-pago'] }),
  })
}

/** El teléfono de administración que ya está en la ficha del proveedor. */
export function useTelefonoAdministracion(proveedorId: number | null | undefined) {
  return useQuery({
    queryKey: ['proveedores', 'numero-administracion', proveedorId],
    enabled: !!proveedorId,
    queryFn: async () =>
      desenvolver<{ numero_administracion: string | null } | null>(
        await supabase.from('proveedores').select('numero_administracion').eq('id', proveedorId!).maybeSingle(),
      )?.numero_administracion ?? null,
  })
}

/** `{ordenId}/{pago|abono|qr}-{nonce}-{nombre}` en el depósito de pagos. */
export async function subirArchivoPago(ordenId: number, prefijo: 'pago' | 'abono' | 'qr', f: File): Promise<ArchivoSubido> {
  if (f.size > 10 * 1024 * 1024) throw new Error('El archivo supera los 10 MB.')
  const limpio = f.name.replace(/[^\w.-]+/g, '_').slice(-80) || 'archivo'
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const path = `${ordenId}/${prefijo}-${nonce}-${limpio}`
  const { error } = await supabase.storage
    .from(BUCKET_PAGOS)
    .upload(path, f, { upsert: false, contentType: f.type || undefined })
  if (error) throw new Error(error.message)
  return { path, filename: f.name }
}

/** Si el registro falla, el archivo recién subido se borra (que no quede huérfano). */
export async function borrarArchivoPago(path: string): Promise<void> {
  await supabase.storage.from(BUCKET_PAGOS).remove([path])
}

/** Una dirección firmada de diez minutos, como `compras-oc` en MGG. */
export async function urlArchivoPago(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_PAGOS).createSignedUrl(path, 600)
  if (error || !data) throw new Error(error?.message ?? 'No se pudo abrir el comprobante')
  return data.signedUrl
}

// ---------------------------------------------------------------------------
// Fase 4: recepción en el almacén general y cierre en Compras
// ---------------------------------------------------------------------------

/** Un renglón de una recepción: lo que llegó y su movimiento de inventario. */
export interface RenglonRecepcion {
  sku: string
  nombre: string
  articulo_id?: number | null
  articulo_nombre?: string | null
  /** Lo que llegó en esta recepción, en la unidad de compra. */
  cantidad: number
  unidad?: string | null
  factor?: number | null
  /** Lo que entró al inventario, en la unidad de uso de la ficha. */
  cantidad_inventario?: number | null
  unidad_inventario?: string | null
  precio: number
  costo_usd?: number | null
  valor: number
  movimiento_id?: number | null
  movimiento_numero?: string | null
  aviso_costo?: number | null
  sin_inventario?: boolean
  ficha_creada?: boolean
  marca_recibida?: string | null
  nota_marca?: string | null
  pedido: number
  /** Lo recibido acumulado tras esta recepción. */
  recibido: number
}

/** Una recepción de una OC (R1, R2…). */
export interface Recepcion {
  id: number
  orden_id: number
  numero: number
  codigo: string
  orden_codigo: string
  oc_codigo: string | null
  proveedor_id: number | null
  proveedor_nombre: string | null
  almacen_id: number
  renglones: RenglonRecepcion[]
  valor: number | string
  nota: string | null
  sin_inventario: boolean
  completa: boolean
  cierra: boolean
  faltan: Array<{ sku: string; nombre: string; falta: number; unidad: string | null }>
  fotos: Imagen[]
  documento_tipo: 'factura' | 'nota_entrega' | null
  documento_path: string | null
  documento_nombre: string | null
  recibida_por: string
  recibida_por_nombre: string | null
  recibida_en: string
}

/** La evaluación del proveedor al finalizar (MGG `evaluaciones_recepcion`). */
export interface Evaluacion {
  id: number
  orden_id: number
  proveedor_id: number
  calidad: number
  /** 1 a 5 estrellas (09/11/2026); null en las evaluaciones anteriores. */
  puntualidad: number | null
  puntualidad_dias: number
  fecha_prometida: string | null
  fecha_recibido: string | null
  comentario: string | null
  evaluado_por_nombre: string | null
  evaluado_por_rol: 'almacenista' | 'jefe'
  evaluado_en: string
}

/** Una orden en «Recepciones por recibir», con su proveedor (el almacén no lee proveedores). */
export interface PorRecibir {
  orden: Orden
  proveedor: string | null
  proveedor_rif: string | null
  recepciones: number
}

/** «Recepciones por recibir» (MGG `listOrdenesPorRecibir`). */
export function usePorRecibir(activo = true) {
  return useQuery({
    queryKey: ['pedidos', 'por-recibir'],
    queryFn: () => rpc<PorRecibir[]>('compras_por_recibir'),
    enabled: activo,
    refetchOnWindowFocus: true,
  })
}

/** Las recepciones de una orden, de la primera a la última. */
export function useRecepcionesDeOrden(ordenId: number, activo = true) {
  return useQuery({
    queryKey: ['pedidos', 'recepciones', 'orden', ordenId],
    enabled: activo,
    queryFn: async () =>
      desenvolver<Recepcion[]>(
        await supabase.from('compras_recepciones').select('*').eq('orden_id', ordenId).order('numero', { ascending: true }),
      ),
  })
}

/** El histórico de recepciones del almacén entre dos fechas (aaaa-mm-dd, hora de Caracas). */
export function useRecepcionesEntre(desde: string, hasta: string, activo = true) {
  return useQuery({
    queryKey: ['pedidos', 'recepciones', 'entre', desde, hasta],
    enabled: activo && !!desde && !!hasta,
    queryFn: async () =>
      desenvolver<Recepcion[]>(
        await supabase
          .from('compras_recepciones')
          .select('*')
          .gte('recibida_en', `${desde}T00:00:00-04:00`)
          .lte('recibida_en', `${hasta}T23:59:59.999-04:00`)
          .order('recibida_en', { ascending: false })
          .limit(500),
      ),
  })
}

export function useEvaluacionDeOrden(ordenId: number, activo = true) {
  return useQuery({
    queryKey: ['pedidos', 'evaluaciones', ordenId],
    enabled: activo,
    queryFn: async () =>
      desenvolver<Evaluacion | null>(
        await supabase.from('compras_evaluaciones').select('*').eq('orden_id', ordenId).maybeSingle(),
      ),
  })
}

/** La ficha de un renglón de nombre general al recibirlo: una que ya existe o una nueva. */
export type FichaRecepcion =
  | { articulo_id: number }
  | { crear: { nombre: string; categoria: string; unidad: string; confirmado?: boolean } }

/** Un archivo con su tipo de documento. */
export type DocumentoSubido = ArchivoSubido & { tipo: 'factura' | 'nota_entrega' }

export interface DatosRecepcion {
  renglones: Array<{
    sku: string
    cantidad: number
    marca_recibida?: string | null
    nota_marca?: string | null
    sin_inventario?: boolean
    ficha?: FichaRecepcion | null
  }>
  nota: string | null
  sin_inventario: boolean
  /** No llega más: cerrar la recepción con lo recibido. */
  cerrar: boolean
  fotos: ArchivoSubido[]
  documento: DocumentoSubido | null
}

export interface ResultadoRecepcion {
  id: number
  estado: EstadoOrden
  recepcion_id: number
  codigo: string
  numero: number
  completa: boolean
  cerrada: boolean
  valor: number
  recibido_total: number
}

export function useRecibirOrden() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: { id: number; datos: DatosRecepcion }) =>
      rpc<ResultadoRecepcion>('compras_recibir_orden', { p_id: d.id, p_datos: d.datos }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pedidos'] })
      // Entró al inventario de ALM-GEN, y quizá una ficha nueva al catálogo.
      for (const k of ['existencias', 'existencias-totales', 'movimientos', 'articulos']) {
        void qc.invalidateQueries({ queryKey: [k] })
      }
    },
  })
}

export interface DatosFinalizar {
  calidad: number
  /** 1 a 5 estrellas. */
  puntualidad?: number
  puntualidad_dias: number
  fecha_prometida: string | null
  fecha_recibido: string | null
  comentario: string | null
  factura: DocumentoSubido | null
}

export function useFinalizarOrden() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: { id: number; datos: DatosFinalizar }) =>
      rpc<{ id: number; estado: EstadoOrden; evaluacion_id: number | null }>('compras_finalizar_orden', {
        p_id: d.id,
        p_datos: d.datos,
      }),
    onSuccess: invalidar,
  })
}

export function useAdjuntarComprobante() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: { id: number; archivo: DocumentoSubido }) =>
      rpc('compras_adjuntar_comprobante', { p_id: d.id, p_archivo: d.archivo }),
    onSuccess: invalidar,
  })
}

/** `{ordenId}/{foto|documento|factura}-{nonce}-{nombre}` en el depósito de recepciones. */
export async function subirArchivoRecepcion(
  ordenId: number,
  prefijo: 'foto' | 'documento' | 'factura',
  f: File,
): Promise<ArchivoSubido> {
  if (f.size > 10 * 1024 * 1024) throw new Error('El archivo supera los 10 MB.')
  const limpio = f.name.replace(/[^\w.-]+/g, '_').slice(-80) || 'archivo'
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const path = `${ordenId}/${prefijo}-${nonce}-${limpio}`
  const { error } = await supabase.storage
    .from(BUCKET_RECEPCIONES)
    .upload(path, f, { upsert: false, contentType: f.type || undefined })
  if (error) throw new Error(error.message)
  return { path, filename: f.name }
}

/** Si la recepción falla, lo recién subido se borra (que no quede huérfano). */
export async function borrarArchivosRecepcion(paths: string[]): Promise<void> {
  if (paths.length) await supabase.storage.from(BUCKET_RECEPCIONES).remove(paths)
}

/** Una dirección firmada de diez minutos. */
export async function urlArchivoRecepcion(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_RECEPCIONES).createSignedUrl(path, 600)
  if (error || !data) throw new Error(error?.message ?? 'No se pudo abrir el archivo')
  return data.signedUrl
}

// ---------------------------------------------------------------------------
// Fase 5a: servicios, catálogos, Solicitud de Mercado y servicio directo
// ---------------------------------------------------------------------------

/** Los catálogos de «📒 Categorías» (MGG `catalogos_pedido`). */
export type Catalogo = 'unidad_solicitante' | 'servicio_categoria' | 'servicio_tipo'

const TABLA_CATALOGO: Record<Catalogo, string> = {
  unidad_solicitante: 'compras_unidades_solicitantes',
  servicio_categoria: 'compras_categorias_servicio',
  servicio_tipo: 'compras_tipos_servicio',
}

export interface ItemCatalogo {
  id: number
  nombre: string
  activo: boolean
}

/** Un catálogo entero (activos e inactivos), por nombre. */
export function useCatalogo(catalogo: Catalogo, activo = true) {
  return useQuery({
    queryKey: ['pedidos', 'catalogos', catalogo],
    enabled: activo,
    queryFn: async () =>
      desenvolver<ItemCatalogo[]>(
        await supabase.from(TABLA_CATALOGO[catalogo]).select('id, nombre, activo').order('nombre'),
      ),
    staleTime: 60_000,
  })
}

function useInvalidarCatalogos() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: ['pedidos', 'catalogos'] })
    void qc.invalidateQueries({ queryKey: ['pedidos', 'unidades'] })
  }
}

export function useGuardarCatalogo() {
  const invalidar = useInvalidarCatalogos()
  return useMutation({
    mutationFn: (d: { catalogo: Catalogo; id: number | null; nombre: string }) =>
      rpc<{ id: number; nombre: string }>('compras_catalogo_guardar', {
        p_catalogo: d.catalogo,
        p_id: d.id,
        p_nombre: d.nombre,
      }),
    onSuccess: invalidar,
  })
}

export function useActivarCatalogo() {
  const invalidar = useInvalidarCatalogos()
  return useMutation({
    mutationFn: (d: { catalogo: Catalogo; id: number; activo: boolean }) =>
      rpc('compras_catalogo_activar', { p_catalogo: d.catalogo, p_id: d.id, p_activo: d.activo }),
    onSuccess: invalidar,
  })
}

export function useEliminarCatalogo() {
  const invalidar = useInvalidarCatalogos()
  return useMutation({
    mutationFn: (d: { catalogo: Catalogo; id: number }) =>
      rpc('compras_catalogo_eliminar', { p_catalogo: d.catalogo, p_id: d.id }),
    onSuccess: invalidar,
  })
}

export function useProximoCodigoServicio(activo: boolean) {
  return useQuery({
    queryKey: ['pedidos', 'proximo-codigo-servicio'],
    queryFn: () => rpc<string>('compras_proximo_codigo_servicio'),
    enabled: activo,
    staleTime: 0,
  })
}

/** Un equipo de Maquinaria para casar el servicio (MGG `MaquinariaEquipo`). */
export interface EquipoServicio {
  id: number
  codigo: string
  nombre: string
  tipo: string | null
  clase: string | null
  estado: string | null
  marca: string | null
  modelo: string | null
}

export function useEquiposServicio(activo = true) {
  return useQuery({
    queryKey: ['pedidos', 'equipos-servicio'],
    queryFn: () => rpc<EquipoServicio[]>('compras_equipos_para_servicio'),
    enabled: activo,
    staleTime: 5 * 60_000,
  })
}

/** Un renglón de servicio tal como lo manda el formulario. */
export interface RenglonServicio {
  sku?: string | null
  nombre: string
  cantidad: number
  precio: number
  servicio_categoria: string
  servicio_tipo: string | null
  equipo_id: number | null
  equipo_nombre: string | null
  bombonas: number | null
  kg_recarga: number | null
  detalle_items: DetalleServicioItem[] | null
}

export interface DatosServicio {
  items: RenglonServicio[]
  notas: string | null
  unidad_solicitante: string
  solicitante_nombre: string | null
  urgente: boolean
}

export function useCrearServicio() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: DatosServicio) =>
      rpc<{ id: number; codigo: string; estado: EstadoOrden }>('compras_crear_servicio', {
        p_items: d.items,
        p_notas: d.notas,
        p_unidad_solicitante: d.unidad_solicitante,
        p_solicitante_nombre: d.solicitante_nombre,
        p_urgente: d.urgente,
      }),
    onSuccess: invalidar,
  })
}

export function useEditarServicio() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: DatosServicio & { id: number }) =>
      rpc<{ id: number; codigo: string; estado: EstadoOrden }>('compras_editar_servicio', {
        p_id: d.id,
        p_items: d.items,
        p_notas: d.notas,
        p_unidad_solicitante: d.unidad_solicitante,
        p_solicitante_nombre: d.solicitante_nombre,
        p_urgente: d.urgente,
      }),
    onSuccess: invalidar,
  })
}

/** «🔧 Servicio realizado»: por renglón, cuánto se prestó. */
export function useServicioRealizado() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: { id: number; renglones: Array<{ sku: string; cantidad: number }>; nota: string | null }) =>
      rpc<{ id: number; estado: EstadoOrden; recibido_total: number }>('compras_servicio_realizado', {
        p_id: d.id,
        p_datos: { renglones: d.renglones, nota: d.nota },
      }),
    onSuccess: invalidar,
  })
}

/** La última Solicitud de Mercado, para sugerir cantidades. */
export interface UltimaMercado {
  codigo: string
  fecha: string
  renglones: Array<{ articulo_id: number; cantidad: number }>
}

export function useUltimaSolicitudMercado(activo = true) {
  return useQuery({
    queryKey: ['pedidos', 'mercado', 'ultima'],
    queryFn: () => rpc<UltimaMercado | null>('compras_ultima_solicitud_mercado'),
    enabled: activo,
  })
}

export function useCrearSolicitudMercado() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: {
      items: Array<{ sku?: string; nombre: string; cantidad: number; unidad?: string | null; articulo_id: number | null }>
      notas: string | null
      unidad_solicitante: string
      solicitante_nombre: string | null
    }) =>
      rpc<{ id: number; codigo: string; estado: EstadoOrden }>('compras_crear_solicitud_mercado', {
        p_items: d.items,
        p_notas: d.notas,
        p_unidad_solicitante: d.unidad_solicitante,
        p_solicitante_nombre: d.solicitante_nombre,
      }),
    onSuccess: invalidar,
  })
}

// ---------------------------------------------------------------------------
// 🔧 Servicio directo (MGG `servicios_directos`)
// ---------------------------------------------------------------------------

export type EstadoServicioDirecto = 'en_proceso' | 'por_pagar' | 'confirmada_pagar' | 'finalizada'

export interface ServicioDirectoItem {
  servicio_categoria: string
  servicio_tipo?: string | null
  equipo_id?: number | null
  equipo_nombre?: string | null
  /** El nombre del renglón: «CATEGORÍA · EQUIPO · TIPO · 2 BOMBONA(S) · 86 KG». */
  descripcion: string
  cantidad: number
  bombonas?: number | null
  kg_recarga?: number | null
  /** El monto del renglón, en $ (se carga con la factura). */
  gasto?: number | null
  detalle_items?: DetalleServicioItem[] | null
}

export interface FacturaDirecto {
  path: string
  filename: string
  at: string
}

export interface ServicioDirecto {
  id: number
  codigo: string
  descripcion: string
  proveedor_id: number | null
  proveedor_nombre: string | null
  equipo_id: number | null
  equipo_nombre: string | null
  cantidad: number | string
  items: ServicioDirectoItem[]
  estado: EstadoServicioDirecto
  moneda: string
  gasto: number | string | null
  unidad_solicitante: string | null
  solicitante_nombre: string | null
  nota: string | null
  pago_externo: boolean
  pago_externo_datos: string | null
  facturas: FacturaDirecto[]
  historial: EventoHistorial[]
  creado_por: string
  creado_por_nombre: string | null
  creado_en: string
  actualizado_en: string | null
  montado_por_nombre: string | null
  montado_en: string | null
  metodo_pago: PagoMetodo[] | null
  metodo_pago_por_nombre: string | null
  metodo_pago_en: string | null
  comprobante_tipo: 'factura' | 'nota_entrega' | null
  retenciones: Retencion[]
  descuento_pago: number | string | null
  numero_administracion: string | null
  pago_qr_path: string | null
  pago_qr_nombre: string | null
  pagada_por_nombre: string | null
  pagada_en: string | null
  pago_fecha: string | null
  pago_referencia: string | null
  pago_monto: number | string | null
  pago_moneda: 'USD' | 'Bs' | 'USDT' | null
  pago_tasa: number | string | null
  pago_monto_usd: number | string | null
  pago_comprobante_path: string | null
  pago_comprobante_nombre: string | null
  pago_nota: string | null
  finalizada_en: string | null
}

/** Facturas, comprobante y QR del servicio directo. */
export const BUCKET_SERVICIOS_DIRECTOS = 'compras-servicios-directos'

export function useServiciosDirectos(activo = true) {
  return useQuery({
    queryKey: ['pedidos', 'servicios-directos'],
    enabled: activo,
    queryFn: async () =>
      desenvolver<ServicioDirecto[]>(
        await supabase.from('compras_servicios_directos').select('*').order('creado_en', { ascending: false }),
      ),
    refetchOnWindowFocus: true,
  })
}

function useInvalidarDirectos() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['pedidos', 'servicios-directos'] })
}

/** Un renglón del «Nuevo servicio directo». */
export interface LineaServicioDirecto {
  servicio_categoria: string
  servicio_tipo: string | null
  equipo_id: number | null
  equipo_nombre: string | null
  descripcion: string
  cantidad: number
  bombonas: number | null
  kg_recarga: number | null
  detalle_items: DetalleServicioItem[] | null
}

export function useCrearServicioDirecto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: {
      lineas: LineaServicioDirecto[]
      proveedor_id: number | null
      proveedor_nuevo: { razon_social: string; rif: string } | null
      unidad_solicitante: string | null
      solicitante_nombre: string | null
    }) => rpc<{ id: number; codigo: string; estado: EstadoServicioDirecto }>('compras_crear_servicio_directo', { p_datos: d }),
    onSuccess: (_r, d) => {
      void qc.invalidateQueries({ queryKey: ['pedidos', 'servicios-directos'] })
      void qc.invalidateQueries({ queryKey: ['pedidos', 'catalogos'] })
      if (d.proveedor_nuevo) void qc.invalidateQueries({ queryKey: ['proveedores'] })
    },
  })
}

export function useDetalleServicioDirecto() {
  const invalidar = useInvalidarDirectos()
  return useMutation({
    mutationFn: (d: { id: number; detalles: DetalleServicioItem[][] }) =>
      rpc('compras_detalle_servicio_directo', { p_id: d.id, p_detalles: d.detalles }),
    onSuccess: invalidar,
  })
}

export function useMontarServicioDirecto() {
  const invalidar = useInvalidarDirectos()
  return useMutation({
    mutationFn: (d: {
      id: number
      gastos: number[]
      nota: string | null
      pago_externo: boolean
      pago_externo_datos: string | null
      facturas: ArchivoSubido[]
    }) =>
      rpc<{ id: number; estado: EstadoServicioDirecto; gasto: number }>('compras_montar_servicio_directo', {
        p_id: d.id,
        p_datos: {
          gastos: d.gastos,
          nota: d.nota,
          pago_externo: d.pago_externo,
          pago_externo_datos: d.pago_externo_datos,
          facturas: d.facturas,
        },
      }),
    onSuccess: invalidar,
  })
}

export function useMetodoPagoServicioDirecto() {
  const invalidar = useInvalidarDirectos()
  return useMutation({
    mutationFn: (d: { id: number; datos: DatosMetodoPago }) =>
      rpc<{ id: number; estado: EstadoServicioDirecto; monto_a_pagar: number }>('compras_metodo_pago_servicio_directo', {
        p_id: d.id,
        p_datos: d.datos,
      }),
    onSuccess: invalidar,
  })
}

export function usePagarServicioDirecto() {
  const invalidar = useInvalidarDirectos()
  return useMutation({
    mutationFn: (d: { id: number; datos: DatosPagoRegistrado }) =>
      rpc<{ id: number; estado: EstadoServicioDirecto; monto_usd: number }>('compras_pagar_servicio_directo', {
        p_id: d.id,
        p_datos: d.datos,
      }),
    onSuccess: invalidar,
  })
}

export function useEditarMontosServicioDirecto() {
  const invalidar = useInvalidarDirectos()
  return useMutation({
    mutationFn: (d: { id: number; gastos: number[]; nota: string | null; pago_externo: boolean; pago_externo_datos: string | null }) =>
      rpc<{ id: number; gasto: number }>('compras_editar_montos_servicio_directo', {
        p_id: d.id,
        p_datos: {
          gastos: d.gastos,
          nota: d.nota,
          pago_externo: d.pago_externo,
          pago_externo_datos: d.pago_externo_datos,
        },
      }),
    onSuccess: invalidar,
  })
}

/** La lista final de facturas; las quitadas se borran del depósito después. */
export function useFacturasServicioDirecto() {
  const invalidar = useInvalidarDirectos()
  return useMutation({
    mutationFn: async (d: { id: number; facturas: ArchivoSubido[] }) => {
      const quitadas = await rpc<string[]>('compras_facturas_servicio_directo', { p_id: d.id, p_facturas: d.facturas })
      if (quitadas?.length) await supabase.storage.from(BUCKET_SERVICIOS_DIRECTOS).remove(quitadas)
    },
    onSuccess: invalidar,
  })
}

export function useEliminarServicioDirecto() {
  const invalidar = useInvalidarDirectos()
  return useMutation({
    mutationFn: async (id: number) => {
      const paths = await rpc<string[]>('compras_eliminar_servicio_directo', { p_id: id })
      // Que no se borre del depósito no deja nada mal: el servicio ya no existe.
      if (paths?.length) await supabase.storage.from(BUCKET_SERVICIOS_DIRECTOS).remove(paths)
    },
    onSuccess: invalidar,
  })
}

/** `{id}/{factura|pago|qr}-{nonce}-{nombre}` en el depósito del servicio directo. */
export async function subirArchivoDirecto(id: number, prefijo: 'factura' | 'pago' | 'qr', f: File): Promise<ArchivoSubido> {
  if (f.size > 10 * 1024 * 1024) throw new Error(`"${f.name}": no puede superar 10 MB`)
  if (f.type && f.type !== 'application/pdf' && !f.type.startsWith('image/')) throw new Error(`"${f.name}": debe ser PDF o imagen`)
  const limpio = f.name.replace(/[^\w.-]+/g, '_').slice(-80) || 'archivo'
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const path = `${id}/${prefijo}-${nonce}-${limpio}`
  const { error } = await supabase.storage
    .from(BUCKET_SERVICIOS_DIRECTOS)
    .upload(path, f, { upsert: false, contentType: f.type || undefined })
  if (error) throw new Error(error.message)
  return { path, filename: f.name }
}

/** Si el registro falla, lo recién subido se borra (que no quede huérfano). */
export async function borrarArchivosDirecto(paths: string[]): Promise<void> {
  if (paths.length) await supabase.storage.from(BUCKET_SERVICIOS_DIRECTOS).remove(paths)
}

/** Una dirección firmada de diez minutos. */
export async function urlArchivoDirecto(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_SERVICIOS_DIRECTOS).createSignedUrl(path, 600)
  if (error || !data) throw new Error(error?.message ?? 'No se pudo abrir la factura')
  return data.signedUrl
}

// ---------------------------------------------------------------------------
// 📊 Reportes e histórico (fase 5b, MGG `ReporteComprasModal`,
// `CierreDiarioModal`, `HistoricoPage`)
// ---------------------------------------------------------------------------

/** Las compras pendientes, una fila por compra (MGG `listReporteCompras`). */
export function useReporteCompras(activo = true) {
  return useQuery({
    queryKey: ['pedidos', 'reportes', 'por-renglon'],
    queryFn: async () => normalizarFilas(await rpc<unknown>('compras_reporte_por_renglon')),
    enabled: activo,
  })
}

/** El cierre del período, del día `desde` al día `hasta` (hora de Venezuela). */
export function useCierreDiario(desde: string, hasta: string, activo = true) {
  return useQuery({
    queryKey: ['pedidos', 'reportes', 'cierre', desde, hasta],
    queryFn: async () =>
      normalizarCierre(await rpc<Record<string, unknown>>('compras_cierre_diario', { p_desde: desde, p_hasta: hasta })),
    enabled: activo && !!desde && !!hasta,
  })
}

/** Una compra del flujo anterior (`v_compras_anteriores`), solo para leer. */
export interface CompraAnterior {
  solicitud_id: number
  numero: string
  titulo: string
  prioridad: string | null
  destino: string | null
  estado_solicitud: string
  creada_en: string
  solicitante: string | null
  registrada_por_nombre: string | null
  orden_id: number | null
  orden_numero: string | null
  estado_orden: string | null
  condicion_pago: string | null
  proveedor: string | null
  moneda: string | null
  total: number | string | null
  total_usd: number | string | null
  total_bs: number | string | null
  renglones: number
  columna: string | null
  historico_en: string | null
  historico_columna: string | null
  historico_nota: string | null
  directa: boolean
  finalidad: string | null
  finalizada_en: string | null
}

export function useComprasAnteriores(activo = true) {
  return useQuery({
    queryKey: ['compras', 'anteriores'],
    queryFn: async () =>
      desenvolver<CompraAnterior[]>(
        await supabase.from('v_compras_anteriores').select('*').order('creada_en', { ascending: false }),
      ),
    enabled: activo,
  })
}
