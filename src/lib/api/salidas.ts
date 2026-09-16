import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/*
  LAS SOLICITUDES DE SALIDA

  Christopher, 16/09/2026: «nos piden que manejemos las solicitudes de salida,
  así como la opción de salida directa. Por igual con traslados».

  Quien necesita material no siempre es quien puede entregarlo. Sin un sitio
  donde pedirlo, se pide por teléfono y se anota después —o no se anota—, y el
  libro deja de parecerse al patio.

  Ni PEDIDA ni APROBADA mueven una sola unidad: la entrega es la que llama a
  `registrar_salidas`, que es la única puerta que descuenta. El número de la
  nota que sale queda guardado en la solicitud, así que el papel firmado y lo
  que lo pidió se encuentran el uno al otro.
*/
export type EstadoDeSolicitud = 'PEDIDA' | 'APROBADA' | 'ENTREGADA' | 'RECHAZADA' | 'CANCELADA'

/** Cómo se dice cada estado en pantalla, y de qué color se pinta. */
export const ESTADO_DE_SOLICITUD: Record<
  EstadoDeSolicitud,
  { texto: string; tono: 'warning' | 'royal' | 'success' | 'neutral' }
> = {
  PEDIDA: { texto: 'Por aprobar', tono: 'warning' },
  APROBADA: { texto: 'Por entregar', tono: 'royal' },
  ENTREGADA: { texto: 'Entregada', tono: 'success' },
  RECHAZADA: { texto: 'No aprobada', tono: 'neutral' },
  CANCELADA: { texto: 'Cancelada', tono: 'neutral' },
}

export interface RenglonDeSolicitud {
  id: number
  articulo_id: number
  cantidad: string
  presentaciones: string | null
  presentacion: string | null
  suelto: string | null
  propietario: string | null
  articulo?: { codigo: string; nombre: string; unidad: string } | null
}

export interface SolicitudDeSalida {
  id: number
  numero: string
  estado: EstadoDeSolicitud
  almacen_id: number
  clase: string
  motivo: string
  grupo_id: number | null
  destino_externo: string | null
  responsable_externo: string | null
  pedida_por: string | null
  pedida_en: string
  aprobada_por: string | null
  aprobada_en: string | null
  /** Cierto cuando la aprobó administración y no quien responde por el almacén. */
  aprobada_de_respaldo: boolean | null
  entregada_por: string | null
  entregada_en: string | null
  /** El número de la nota de salida que se emitió al entregarla. */
  nota_salida: string | null
  /** Por qué se rechazó o se canceló. */
  cierre_motivo: string | null
  almacen?: { nombre: string } | null
  renglones?: RenglonDeSolicitud[]
}

export function useSolicitudesDeSalida() {
  return useQuery({
    queryKey: ['solicitudes-salida'],
    queryFn: async () =>
      desenvolver<SolicitudDeSalida[]>(
        await supabase
          .from('solicitudes_salida')
          .select(
            '*, almacen:almacenes(nombre), renglones:solicitud_salida_renglones(*, articulo:articulos(codigo, nombre, unidad))',
          )
          .order('pedida_en', { ascending: false })
          .limit(200),
      ),
  })
}

/*
  Cada paso cambia tres cosas a la vez: la solicitud, lo que hay en el almacén
  —solo al entregar— y el libro. Se invalidan las tres para no dejar una
  pantalla abierta contando otra historia.
*/
function useAccionDeSolicitud<A>(fn: (a: A) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['solicitudes-salida'] })
      void qc.invalidateQueries({ queryKey: ['existencias'] })
      void qc.invalidateQueries({ queryKey: ['existencias-totales'] })
      void qc.invalidateQueries({ queryKey: ['movimientos'] })
      void qc.invalidateQueries({ queryKey: ['notificaciones'] })
    },
  })
}

export function usePedirSalida() {
  return useAccionDeSolicitud(
    (s: {
      almacen_id: number
      renglones: Array<{
        articulo_id: number
        cantidad: number
        presentaciones?: number | null
        presentacion?: string | null
        suelto?: number | null
        propietario?: string | null
      }>
      /** Para qué se necesita. Una solicitud no elige razón de salida. */
      motivo: string
      grupo_id?: number | null
      externo?: string | null
      responsable?: string | null
    }) =>
      rpc<string>('pedir_salida', {
        p_almacen_id: s.almacen_id,
        p_renglones: s.renglones.map((r) => ({
          articulo_id: String(r.articulo_id),
          cantidad: String(r.cantidad),
          ...(r.presentaciones ? { presentaciones: String(r.presentaciones) } : {}),
          ...(r.presentacion ? { presentacion: r.presentacion } : {}),
          ...(r.suelto ? { suelto: String(r.suelto) } : {}),
          ...(r.propietario ? { propietario: r.propietario } : {}),
        })),
        p_motivo: s.motivo,
        p_grupo_id: s.grupo_id ?? null,
        p_externo: s.externo || null,
        p_responsable: s.responsable || null,
      }),
  )
}

export function useAprobarSolicitud() {
  return useAccionDeSolicitud((id: number) =>
    rpc<number>('aprobar_solicitud_salida', { p_id: id }),
  )
}

export function useRechazarSolicitud() {
  return useAccionDeSolicitud((s: { id: number; motivo: string }) =>
    rpc<number>('rechazar_solicitud_salida', { p_id: s.id, p_motivo: s.motivo }),
  )
}

export function useCancelarSolicitud() {
  return useAccionDeSolicitud((s: { id: number; motivo: string }) =>
    rpc<number>('cancelar_solicitud_salida', { p_id: s.id, p_motivo: s.motivo }),
  )
}

export function useEntregarSolicitud() {
  return useAccionDeSolicitud((id: number) =>
    rpc<string>('entregar_solicitud_salida', { p_id: id }),
  )
}

/**
 * Lo que la pantalla ofrece en cada solicitud.
 *
 * Es la misma regla que aplica la base, dicha aquí solo para no enseñar botones
 * que van a fallar. Quien decide sigue siendo la base al pulsar.
 */
export function quePuedoHacerConLaSolicitud(
  s: SolicitudDeSalida,
  yo: { yo: string; respaldo: boolean; sitios: number[] } | undefined | null,
  puedoEntregar: boolean,
) {
  if (!yo) return { aprobar: false, rechazar: false, cancelar: false, entregar: false }
  const respondoPorElAlmacen = yo.respaldo || yo.sitios.includes(s.almacen_id)
  return {
    aprobar: s.estado === 'PEDIDA' && respondoPorElAlmacen,
    rechazar: s.estado === 'PEDIDA' && respondoPorElAlmacen,
    cancelar:
      (s.estado === 'PEDIDA' || s.estado === 'APROBADA') &&
      (s.pedida_por === yo.yo || respondoPorElAlmacen),
    entregar: s.estado === 'APROBADA' && puedoEntregar,
  }
}
