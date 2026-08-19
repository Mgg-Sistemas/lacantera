import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver } from './rpc'

/**
 * Las máquinas, su horómetro y su mantenimiento.
 *
 * EL SEMÁFORO NO SE CALCULA AQUÍ
 *
 * Viene de `v_maquinaria`, que lo deriva de los umbrales de cada máquina. Es a
 * propósito: si el front lo recalculara, dos pantallas podrían discrepar sobre
 * si una máquina puede seguir trabajando, y esa es de las cosas que no admiten
 * dos opiniones.
 */

export type Semaforo = 'OK' | 'AVISO' | 'ALARMA' | 'BLOQUEANTE'

export interface Maquina {
  id: number
  codigo: string
  nombre: string
  tipo: string
  marca: string | null
  modelo: string | null
  serial: string | null
  anio: number | null
  almacen_id: number | null
  almacen: string | null
  almacen_tipo: string | null
  estado: string
  tope_horas: string
  aviso_horas: string
  alarma_horas: string
  nota: string | null
  activa: boolean
  /** Lo que lleva trabajado desde el último mantenimiento profundo. */
  horas_desde_mant: string
  horas_totales: string
  horas_para_el_tope: string
  ultima_lectura: string | null
  horometro_actual: string | null
  ultimo_mantenimiento: string | null
  semaforo: Semaforo
}

export interface Lectura {
  id: number
  maquina_id: number
  fecha: string
  inicial: string
  final: string
  horas: string
  operador_id: number | null
  nota: string | null
}

export interface Mantenimiento {
  id: number
  maquina_id: number
  fecha: string
  tipo: 'MANTENIMIENTO' | 'SERVICIO'
  detalle: string
  horometro: string | null
  taller_id: number | null
  costo_usd: string | null
  registrado_en: string
}

export const TIPOS_MAQUINA = [
  { valor: 'EXCAVADORA', etiqueta: 'Excavadora' },
  { valor: 'CARGADOR', etiqueta: 'Cargador' },
  { valor: 'CAMION', etiqueta: 'Camión' },
  { valor: 'PLANTA', etiqueta: 'Planta' },
  { valor: 'PERFORADORA', etiqueta: 'Perforadora' },
  { valor: 'VEHICULO', etiqueta: 'Vehículo' },
  { valor: 'GENERADOR', etiqueta: 'Generador' },
  { valor: 'OTRO', etiqueta: 'Otro' },
]

export const ESTADOS_MAQUINA = [
  { valor: 'ACTIVA', etiqueta: 'Activa' },
  { valor: 'EN_MANTENIMIENTO', etiqueta: 'En mantenimiento' },
  { valor: 'FUERA_DE_SERVICIO', etiqueta: 'Fuera de servicio' },
  { valor: 'DESINCORPORADA', etiqueta: 'Desincorporada' },
]

// ---------------------------------------------------------------------------

export function useMaquinaria(soloActivas = true) {
  return useQuery({
    queryKey: ['maquinaria', soloActivas],
    queryFn: async () => {
      let q = supabase.from('v_maquinaria').select('*').order('codigo')
      if (soloActivas) q = q.eq('activa', true)
      return desenvolver<Maquina[]>(await q)
    },
  })
}

export function useLecturas(maquinaId: number | null) {
  return useQuery({
    queryKey: ['maquinaria', 'lecturas', maquinaId],
    enabled: maquinaId !== null,
    queryFn: async () =>
      desenvolver<Lectura[]>(
        await supabase
          .from('horometro_lecturas')
          .select('*')
          .eq('maquina_id', maquinaId!)
          .order('fecha', { ascending: false })
          .limit(60),
      ),
  })
}

/**
 * Lo reparado en un taller, sea de la máquina que sea.
 *
 * Es la otra mitad de lo que hace un taller: la primera es lo que tiene
 * asignado en inventario, y esta es en qué lo gastó.
 */
export function useMantenimientosDeTaller(tallerId: number | null) {
  return useQuery({
    queryKey: ['maquinaria', 'mantenimientos-taller', tallerId],
    enabled: tallerId !== null,
    queryFn: async () =>
      desenvolver<Mantenimiento[]>(
        await supabase
          .from('mantenimientos')
          .select('*')
          .eq('taller_id', tallerId!)
          .order('fecha', { ascending: false })
          .limit(40),
      ),
  })
}

export function useMantenimientos(maquinaId: number | null) {
  return useQuery({
    queryKey: ['maquinaria', 'mantenimientos', maquinaId],
    enabled: maquinaId !== null,
    queryFn: async () =>
      desenvolver<Mantenimiento[]>(
        await supabase
          .from('mantenimientos')
          .select('*')
          .eq('maquina_id', maquinaId!)
          .order('fecha', { ascending: false })
          .limit(60),
      ),
  })
}

/**
 * Lo que hay que atender.
 *
 * Se resuelve aquí y no en cada pantalla para que el Panel, el tablero y el
 * aviso de la barra cuenten lo mismo. Ordenado por gravedad y, dentro de cada
 * nivel, por lo que lleva más horas de más: si hay tres bloqueadas, la que peor
 * está va primero.
 */
export function useMaquinasQueUrgen() {
  const consulta = useMaquinaria(true)
  const orden: Record<Semaforo, number> = { BLOQUEANTE: 0, ALARMA: 1, AVISO: 2, OK: 3 }

  const urgentes = (consulta.data ?? [])
    .filter((m) => m.semaforo !== 'OK')
    .sort(
      (a, b) =>
        orden[a.semaforo] - orden[b.semaforo] ||
        Number(b.horas_desde_mant) - Number(a.horas_desde_mant),
    )

  return { ...consulta, urgentes }
}

// ---------------------------------------------------------------------------

function useAccion<A, R = unknown>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maquinaria'] }),
  })
}

export function useGuardarMaquina() {
  return useAccion(async (m: Partial<Maquina> & { codigo: string; nombre: string }) => {
    const fila = {
      codigo: m.codigo,
      nombre: m.nombre,
      tipo: m.tipo ?? 'OTRO',
      marca: m.marca || null,
      modelo: m.modelo || null,
      serial: m.serial || null,
      anio: m.anio || null,
      almacen_id: m.almacen_id || null,
      estado: m.estado ?? 'ACTIVA',
      tope_horas: m.tope_horas ?? 250,
      aviso_horas: m.aviso_horas ?? 200,
      alarma_horas: m.alarma_horas ?? 220,
      nota: m.nota || null,
      activa: m.activa ?? true,
    }

    return m.id
      ? desenvolver(await supabase.from('maquinaria').update(fila).eq('id', m.id).select().single())
      : desenvolver(await supabase.from('maquinaria').insert(fila).select().single())
  })
}

/**
 * Anotar el horómetro del día.
 *
 * Va con `upsert` sobre (máquina, fecha) porque corregir la lectura de hoy es
 * lo normal: se anota al arrancar y se completa al terminar el turno. Sin esto,
 * el segundo intento chocaría contra la restricción de una lectura por día y
 * quien la carga tendría que buscar dónde se edita.
 */
export function useGuardarLectura() {
  return useAccion(
    async (l: {
      maquina_id: number
      fecha: string
      inicial: number
      final: number
      operador_id?: number | null
      nota?: string | null
    }) =>
      desenvolver(
        await supabase
          .from('horometro_lecturas')
          .upsert(
            {
              maquina_id: l.maquina_id,
              fecha: l.fecha,
              inicial: l.inicial,
              final: l.final,
              operador_id: l.operador_id ?? null,
              nota: l.nota ?? null,
            },
            { onConflict: 'maquina_id,fecha' },
          )
          .select()
          .single(),
      ),
  )
}

export function useRegistrarMantenimiento() {
  return useAccion(
    async (m: {
      maquina_id: number
      fecha: string
      tipo: 'MANTENIMIENTO' | 'SERVICIO'
      detalle: string
      horometro?: number | null
      taller_id?: number | null
      costo_usd?: number | null
    }) =>
      desenvolver(
        await supabase
          .from('mantenimientos')
          .insert({
            maquina_id: m.maquina_id,
            fecha: m.fecha,
            tipo: m.tipo,
            detalle: m.detalle,
            horometro: m.horometro ?? null,
            taller_id: m.taller_id ?? null,
            costo_usd: m.costo_usd ?? null,
          })
          .select()
          .single(),
      ),
  )
}
