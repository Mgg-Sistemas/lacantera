import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/*
  CONTROL DE DESPACHO: LA PLANILLA QUE MIRA Y NO TOCA

  Christopher, 21/09/2026: «un módulo que reciba información pero no envíe
  nada». Es la planilla de Excel que llevaba a mano. La mitad izquierda —número,
  fecha, cliente, material, m³— sale sola de las notas de entrega y de las notas
  de salida; la derecha —RIF, precio, status, observaciones y una columna
  libre— se escribe aquí.

  NADA DE ESTE ARCHIVO ESCRIBE FUERA DEL MÓDULO. Las cuatro funciones de la base
  que se llaman aquí tocan solo las tablas `control_despacho*`. No hay ninguna
  que cambie una nota, un cliente o el inventario, y así tiene que seguir.

  LA SERIE SE ENSEÑA ENTERA. Cada número de NE y de NS aparece y dice qué le
  pasó: es el control que en el Excel se llevaba escribiendo «SISTEMA» a mano.
*/

/** Qué le pasó al documento. Solo VIGENTE suma. */
export type EstadoDelDocumento =
  | 'VIGENTE'
  | 'ANULADA'
  | 'DESHECHA'
  | 'INTERNA'
  | 'RESPALDO'
  | 'SIN_DOCUMENTO'

export interface FilaDeControl {
  clave: string
  origen: 'NOTA_ENTREGA' | 'NOTA_SALIDA'
  documento: string
  fecha: string | null
  cliente: string | null
  cliente_id: number | null
  /** El nombre tal como se escribió en la salida, cuando viene de una. */
  destino_escrito: string | null
  rif: string | null
  /** El RIF sale del cliente registrado, no se tecleó aquí. */
  rif_del_cliente: boolean
  material: string | null
  cantidad: number | string | null
  unidad: string | null
  precio: number | string | null
  /** El precio lo trajo la nota de entrega (estaba en dólares). */
  precio_de_la_nota: boolean
  moneda_doc: string | null
  monto: number | string | null
  estado_control: string | null
  estado_control_nombre: string | null
  observacion: string | null
  extra: string | null
  estado_doc: EstadoDelDocumento
  detalle: string | null
  renglon_id: number | null
  movimiento_id: number | null
  falta_rif: boolean
}

export const ROTULO_DEL_DOCUMENTO: Record<EstadoDelDocumento, string> = {
  VIGENTE: '',
  ANULADA: 'Anulada',
  DESHECHA: 'Deshecha',
  INTERNA: 'Salida interna',
  RESPALDO: 'Respaldo de una salida',
  SIN_DOCUMENTO: 'Sin documento',
}

export function useControlDeDespacho(desde: string | null, hasta: string | null) {
  return useQuery({
    queryKey: ['control-despacho', 'planilla', desde, hasta],
    queryFn: () =>
      rpc<FilaDeControl[]>('control_despacho_planilla', { p_desde: desde, p_hasta: hasta }),
  })
}

export interface EstadoDeControl {
  codigo: string
  nombre: string
  orden: number
  activo: boolean
}

export function useEstadosDeControl() {
  return useQuery({
    queryKey: ['control-despacho', 'estados'],
    queryFn: async () =>
      desenvolver<EstadoDeControl[]>(
        await supabase.from('control_despacho_estados').select('*').order('orden').order('nombre'),
      ),
  })
}

export function useColumnaLibre() {
  return useQuery({
    queryKey: ['control-despacho', 'columna-libre'],
    queryFn: async () =>
      desenvolver<{ columna_libre: string }[]>(
        await supabase.from('control_despacho_config').select('columna_libre').limit(1),
      )[0]?.columna_libre ?? 'Otra',
  })
}

function useAccion<T, R = unknown>(hacer: (v: T) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: hacer,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['control-despacho'] }),
  })
}

export function useGuardarFilaDeControl() {
  return useAccion(
    (v: {
      fila: FilaDeControl
      rif: string | null
      precio: number | null
      estado: string | null
      observacion: string | null
      extra: string | null
    }) =>
      rpc<number>('guardar_control_despacho', {
        p_origen: v.fila.origen,
        p_id: v.fila.origen === 'NOTA_ENTREGA' ? v.fila.renglon_id : v.fila.movimiento_id,
        p_rif: v.rif,
        p_precio: v.precio,
        p_estado: v.estado,
        p_observacion: v.observacion,
        p_extra: v.extra,
      }),
  )
}

/** Una fila de la hoja de Excel, ya interpretada: cómo queda lo que se escribe a mano. */
export interface FilaParaCargar {
  origen: FilaDeControl['origen']
  /** El renglón de la nota de entrega o el asiento de la salida, según el origen. */
  id: number
  rif: string | null
  precio: number | null
  estado: string | null
  observacion: string | null
  extra: string | null
}

/** Todas de una vez, y todo o nada: si una fila falla, no se guarda ninguna. */
export function useCargarControlDeDespacho() {
  return useAccion((filas: FilaParaCargar[]) => rpc<number>('cargar_control_despacho', { p_filas: filas }))
}

/** A qué cliente registrado corresponde un nombre escrito a mano. Nulo lo suelta. */
export function useVincularClienteDeDestino() {
  return useAccion((v: { destino: string; cliente_id: number | null }) =>
    rpc('vincular_cliente_de_destino', { p_destino: v.destino, p_cliente_id: v.cliente_id }),
  )
}

export function useGuardarEstadoDeControl() {
  return useAccion((v: { codigo: string | null; nombre: string; orden: number; activo: boolean }) =>
    rpc<string>('guardar_estado_de_control', {
      p_codigo: v.codigo,
      p_nombre: v.nombre,
      p_orden: v.orden,
      p_activo: v.activo,
    }),
  )
}

export function useGuardarColumnaLibre() {
  return useAccion((nombre: string) =>
    rpc('guardar_columna_libre_de_control', { p_nombre: nombre }),
  )
}
