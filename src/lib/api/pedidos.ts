import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/*
  PEDIDOS / COMPRAS COMO EN MGG (fase 1, 07/11/2026)

  Una sola tabla, `compras_ordenes`: la Solicitud de Pedido y, después, su
  orden de compra. Se lee directo (la política de lectura decide qué filas
  ve cada quien) y se escribe solo por funciones, que vuelven a preguntar el
  permiso. Todo lo que cambia invalida `['pedidos']`, y el canal en vivo
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
  pide_por_otro: boolean
  yo: string
  mi_nombre: string | null
}

export const BUCKET_PEDIDOS = 'compras-pedidos'
export const MAX_IMAGENES_OP = 4

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

/** Todas las órdenes que la política deja ver, la más nueva primero. */
export function usePedidos() {
  return useQuery({
    queryKey: ['pedidos', 'lista'],
    queryFn: async () =>
      desenvolver<Orden[]>(
        await supabase.from('compras_ordenes').select('*').order('creado_en', { ascending: false }),
      ),
    refetchOnWindowFocus: true,
  })
}

/** «Por revisar»: las que esperan al almacén, la más vieja primero. */
export function useSolicitudesEnRevision() {
  return useQuery({
    queryKey: ['pedidos', 'almacen', 'por-revisar'],
    queryFn: async () =>
      desenvolver<Orden[]>(
        await supabase
          .from('compras_ordenes')
          .select('*')
          .eq('estado', 'revision_almacen')
          .eq('clase', 'producto')
          .order('creado_en', { ascending: true }),
      ),
    refetchOnWindowFocus: true,
  })
}

/** «Revisadas»: las que el almacén cerró en los últimos `dias`. */
export function useSolicitudesRevisadas(dias = 30) {
  return useQuery({
    queryKey: ['pedidos', 'almacen', 'revisadas', dias],
    queryFn: async () =>
      desenvolver<Orden[]>(
        await supabase
          .from('compras_ordenes')
          .select('*')
          .not('revisada_almacen_en', 'is', null)
          .gte('revisada_almacen_en', new Date(Date.now() - dias * 86_400_000).toISOString())
          .order('revisada_almacen_en', { ascending: false })
          .limit(200),
      ),
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
