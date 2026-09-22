import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/*
  CONTROL DE ASISTENCIA

  Christopher, 22/09/2026: escanear el carnet o cargar a mano las horas de
  entrada y salida, verlo en calendario, y que quien tenga el permiso pueda
  corregir las horas. La hora del escaneo la pone la base, no el teléfono.

  LA UNIDAD ES LA JORNADA: una fila con la entrada y la salida juntas. Una
  jornada con la salida en blanco está ABIERTA, y se queda así hasta que alguien
  la cierre o la corrija: la entrada del día siguiente nunca la cierra.
*/

export interface Jornada {
  id: number
  empleado_id: number
  /** El día de la entrada, en Caracas. La salida de madrugada sigue siendo de ese día. */
  fecha: string
  entrada: string
  salida: string | null
  origen: 'CARNET' | 'MANUAL'
  carnet_codigo: string | null
  nota: string | null
  ficha: string
  nombre: string
  cedula: string
  cargo: string
  departamento: string | null
  foto_path: string | null
  estado: 'ABIERTA' | 'CERRADA' | 'ANULADA'
  turno: 'DIA' | 'NOCHE'
  /** Solo cuando está cerrada. */
  minutos: number | null
  registrado_por: string | null
  registrado_en: string
  corregido_por: string | null
  corregido_en: string | null
  anulada_en: string | null
  anulada_por: string | null
  motivo_anulacion: string | null
}

export interface AjustesDeAsistencia {
  horas_maximas_jornada: number
  minutos_doble_marca: number
}

/** Lo que responde la base al marcar. */
export interface Marcada {
  accion: 'ENTRADA' | 'SALIDA'
  jornada_id: number
  momento: string
  empleado_id: number
  nombre: string
  ficha: string
  /** Había una jornada vieja abierta que se pasó del plazo: se abrió otra y esa sigue abierta. */
  quedo_abierta_otra: boolean
  abierta_desde: string | null
}

export function useJornadas(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['asistencia', 'jornadas', desde, hasta],
    queryFn: async () =>
      desenvolver<Jornada[]>(
        await supabase.from('v_asistencia').select('*').gte('fecha', desde).lte('fecha', hasta).order('entrada'),
      ),
  })
}

/** Lo de hoy, más lo que quedó abierto de otros días: eso también es «hoy». */
export function useJornadasDeHoy(hoy: string) {
  return useQuery({
    queryKey: ['asistencia', 'hoy', hoy],
    refetchInterval: 60_000,
    queryFn: async () =>
      desenvolver<Jornada[]>(
        await supabase
          .from('v_asistencia')
          .select('*')
          .or(`fecha.eq.${hoy},estado.eq.ABIERTA`)
          .order('entrada', { ascending: false }),
      ),
  })
}

export function useAjustesDeAsistencia() {
  return useQuery({
    queryKey: ['asistencia', 'ajustes'],
    queryFn: async () =>
      desenvolver<AjustesDeAsistencia[]>(await supabase.from('asistencia_config').select('*').limit(1))[0] ?? {
        horas_maximas_jornada: 16,
        minutos_doble_marca: 2,
      },
  })
}

function useAccion<T, R = unknown>(hacer: (v: T) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: hacer,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['asistencia'] }),
  })
}

/** Con el carnet (lo que lee el escáner, dirección o código) o con la persona elegida. */
export function useMarcarAsistencia() {
  return useAccion((v: { codigo?: string; empleado_id?: number }) =>
    rpc<Marcada>('marcar_asistencia', { p_codigo: v.codigo ?? null, p_empleado_id: v.empleado_id ?? null }),
  )
}

export function useCargarAsistencia() {
  return useAccion((v: { empleado_id: number; entrada: string; salida: string | null; nota: string | null }) =>
    rpc<number>('cargar_asistencia', {
      p_empleado_id: v.empleado_id,
      p_entrada: v.entrada,
      p_salida: v.salida,
      p_nota: v.nota,
    }),
  )
}

export function useCorregirAsistencia() {
  return useAccion((v: { id: number; entrada: string; salida: string | null; nota: string | null }) =>
    rpc('corregir_asistencia', { p_id: v.id, p_entrada: v.entrada, p_salida: v.salida, p_nota: v.nota }),
  )
}

export function useAnularAsistencia() {
  return useAccion((v: { id: number; motivo: string }) =>
    rpc('anular_asistencia', { p_id: v.id, p_motivo: v.motivo }),
  )
}

export function useGuardarAjustesDeAsistencia() {
  return useAccion((v: AjustesDeAsistencia) =>
    rpc('guardar_ajustes_de_asistencia', {
      p_horas_maximas: v.horas_maximas_jornada,
      p_minutos_doble: v.minutos_doble_marca,
    }),
  )
}

/**
 * Basta con que el navegador dé acceso a la cámara (sitio seguro): el QR lo
 * descifra el lector nativo donde lo hay y `jsqr` donde no (iPhone, Windows).
 */
export const hayCamaraQueLeaQr = (): boolean => typeof window !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

/* ───────────────────────────────────────────────── horas, en Caracas */

const CARACAS = 'America/Caracas'

const partes = (iso: string) => {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: CARACAS,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  return { fecha: `${v('year')}-${v('month')}-${v('day')}`, hora: `${v('hour') === '24' ? '00' : v('hour')}:${v('minute')}` }
}

/** «07:12» */
export const horaDe = (iso: string | null): string => (iso ? partes(iso).hora : '—')

/** Lo que pide un `<input type="datetime-local">`, en hora de Caracas. */
export const aFechaHoraLocal = (iso: string | null): string => {
  if (!iso) return ''
  const p = partes(iso)
  return `${p.fecha}T${p.hora}`
}

/**
 * De vuelta: lo tecleado en el `datetime-local` se toma como hora de Caracas,
 * pase lo que pase con el reloj del navegador. Caracas no cambia de hora, así
 * que el desfase es siempre −04:00.
 */
export const deFechaHoraLocal = (v: string): string | null => (v ? new Date(`${v}:00-04:00`).toISOString() : null)

/** «8 h 30 min» */
export function duracion(minutos: number | null): string {
  if (minutos === null) return '—'
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`
}
