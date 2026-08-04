import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/**
 * Explotación: de dónde sale la piedra.
 *
 * El parte de turno es el único sitio por el que entra material al patio. Por
 * eso cada acción de aquí invalida también las existencias y los movimientos:
 * quien está mirando el inventario en otra pestaña tiene que ver la piedra
 * nueva sin recargar.
 */

export interface Frente {
  id: number
  codigo: string
  nombre: string
  banco: string | null
  metodo_arranque: string
  material: string | null
  estado: string
  reserva_estimada: string | null
  nota: string | null
  toneladas_producidas: string
  ultima_voladura: string | null
  voladuras: number
}

export interface Voladura {
  id: number
  numero: string
  fecha: string
  hora: string | null
  frente_id: number
  frente: string
  frente_codigo: string
  banco: string | null
  barrenos: number | null
  metros_perforados: string | null
  diametro_mm: string | null
  explosivo_tipo: string | null
  explosivo_kg: string | null
  detonadores: number | null
  cordon_metros: string | null
  toneladas_estimadas: string | null
  toneladas_producidas: string
  desvio_pct: string | null
  responsable: string | null
  permiso: string | null
  observacion: string | null
  estado: string
  motivo_anulacion: string | null
  registrada_en: string
}

export interface ProduccionTurno {
  id: number
  numero: string
  fecha: string
  turno: string
  frente_id: number
  frente: string
  frente_codigo: string
  almacen_id: number
  almacen: string
  voladura: string | null
  voladura_id: number | null
  horas_operativas: string | null
  horas_paro: string
  motivo_paro: string | null
  operador: string | null
  nota: string | null
  toneladas: string
  renglones: number
  rendimiento: string | null
  estado: string
  motivo_anulacion: string | null
  registrado_en: string
}

export interface RenglonProduccion {
  id: number
  produccion_id: number
  linea: number
  articulo_id: number
  codigo: string
  articulo: string
  unidad: string
  cantidad: string
}

export const METODOS_ARRANQUE = [
  { valor: 'VOLADURA', etiqueta: 'Voladura' },
  { valor: 'MARTILLO', etiqueta: 'Martillo hidráulico' },
  { valor: 'AMBOS', etiqueta: 'Los dos, según el material' },
]

export const ESTADOS_FRENTE = [
  { valor: 'ACTIVO', etiqueta: 'Activo' },
  { valor: 'SUSPENDIDO', etiqueta: 'Suspendido' },
  { valor: 'AGOTADO', etiqueta: 'Agotado' },
]

export const TURNOS = [
  { valor: 'I', etiqueta: 'Turno I' },
  { valor: 'II', etiqueta: 'Turno II' },
  { valor: 'III', etiqueta: 'Turno III' },
]

function useAccion<A, R = unknown>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['explotacion'] })
      void qc.invalidateQueries({ queryKey: ['existencias'] })
      void qc.invalidateQueries({ queryKey: ['movimientos'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Frentes
// ---------------------------------------------------------------------------

export function useFrentes() {
  return useQuery({
    queryKey: ['explotacion', 'frentes'],
    queryFn: async () =>
      desenvolver<Frente[]>(
        await supabase.from('v_frentes').select('*').order('estado').order('codigo'),
      ),
  })
}

export function useGuardarFrente() {
  return useAccion(
    (f: {
      id?: number | null
      codigo: string
      nombre: string
      banco?: string | null
      metodo_arranque: string
      material?: string | null
      estado: string
      reserva?: number | null
      nota?: string | null
    }) =>
      rpc<number>('guardar_frente', {
        p_id: f.id ?? null,
        p_codigo: f.codigo,
        p_nombre: f.nombre,
        p_banco: f.banco ?? null,
        p_metodo_arranque: f.metodo_arranque,
        p_material: f.material ?? null,
        p_estado: f.estado,
        p_reserva: f.reserva ?? null,
        p_nota: f.nota ?? null,
      }),
  )
}

// ---------------------------------------------------------------------------
// Voladuras
// ---------------------------------------------------------------------------

export function useVoladuras() {
  return useQuery({
    queryKey: ['explotacion', 'voladuras'],
    queryFn: async () =>
      desenvolver<Voladura[]>(
        await supabase
          .from('v_voladuras')
          .select('*')
          .order('fecha', { ascending: false })
          .order('id', { ascending: false })
          .limit(300),
      ),
  })
}

export function useRegistrarVoladura() {
  return useAccion(
    (v: {
      frente_id: number
      fecha?: string | null
      hora?: string | null
      barrenos?: number | null
      metros?: number | null
      diametro_mm?: number | null
      explosivo_tipo?: string | null
      explosivo_kg?: number | null
      detonadores?: number | null
      cordon_metros?: number | null
      toneladas?: number | null
      responsable?: string | null
      permiso?: string | null
      observacion?: string | null
    }) =>
      rpc<number>('registrar_voladura', {
        p_frente_id: v.frente_id,
        p_fecha: v.fecha ?? null,
        p_hora: v.hora ?? null,
        p_barrenos: v.barrenos ?? null,
        p_metros: v.metros ?? null,
        p_diametro_mm: v.diametro_mm ?? null,
        p_explosivo_tipo: v.explosivo_tipo ?? null,
        p_explosivo_kg: v.explosivo_kg ?? null,
        p_detonadores: v.detonadores ?? null,
        p_cordon_metros: v.cordon_metros ?? null,
        p_toneladas: v.toneladas ?? null,
        p_responsable: v.responsable ?? null,
        p_permiso: v.permiso ?? null,
        p_observacion: v.observacion ?? null,
      }),
  )
}

export function useAnularVoladura() {
  return useAccion((a: { id: number; motivo: string }) =>
    rpc('anular_voladura', { p_id: a.id, p_motivo: a.motivo }),
  )
}

// ---------------------------------------------------------------------------
// Producción por turno
// ---------------------------------------------------------------------------

export function useProduccion() {
  return useQuery({
    queryKey: ['explotacion', 'produccion'],
    queryFn: async () =>
      desenvolver<ProduccionTurno[]>(
        await supabase
          .from('v_produccion_turnos')
          .select('*')
          .order('fecha', { ascending: false })
          .order('id', { ascending: false })
          .limit(300),
      ),
  })
}

export function useRenglonesProduccion(produccionId: number | null) {
  return useQuery({
    queryKey: ['explotacion', 'produccion-renglones', produccionId],
    enabled: produccionId !== null,
    queryFn: async () =>
      desenvolver<RenglonProduccion[]>(
        await supabase
          .from('v_produccion_renglones')
          .select('*')
          .eq('produccion_id', produccionId!)
          .order('linea'),
      ),
  })
}

export function useRegistrarProduccionTurno() {
  return useAccion(
    (p: {
      fecha: string
      turno: string
      frente_id: number
      almacen_id: number
      renglones: { articulo_id: number; cantidad: number }[]
      horas_operativas?: number | null
      horas_paro?: number | null
      motivo_paro?: string | null
      voladura_id?: number | null
      operador?: string | null
      nota?: string | null
    }) =>
      rpc<number>('registrar_produccion_turno', {
        p_fecha: p.fecha,
        p_turno: p.turno,
        p_frente_id: p.frente_id,
        p_almacen_id: p.almacen_id,
        p_renglones: p.renglones,
        p_horas_operativas: p.horas_operativas ?? null,
        p_horas_paro: p.horas_paro ?? 0,
        p_motivo_paro: p.motivo_paro ?? null,
        p_voladura_id: p.voladura_id ?? null,
        p_operador: p.operador ?? null,
        p_nota: p.nota ?? null,
      }),
  )
}

export function useAnularProduccionTurno() {
  return useAccion((a: { id: number; motivo: string }) =>
    rpc('anular_produccion_turno', { p_id: a.id, p_motivo: a.motivo }),
  )
}
