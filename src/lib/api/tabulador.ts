import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/**
 * El tabulador: cuánto gana cada cargo.
 *
 * Se lee de una vista y no de la tabla porque las cifras derivadas —quincenal,
 * semanal, diario— se calculan en la base. Repetir aquí esas divisiones sería
 * tener el mismo cálculo escrito en dos idiomas, y bastaría con que alguien
 * cambiara el divisor en uno para que la pantalla y un informe dijeran cosas
 * distintas sobre el mismo sueldo.
 */
export interface NivelTabulador {
  id: number
  cargo: string
  sueldo_mensual: string
  moneda: string
  orden: number
  activo: boolean
  nota: string | null
  actualizado_en: string
  /** Nulos si falta el parámetro `tabulador_dias_mes`. La pantalla muestra un guion. */
  sueldo_quincenal: string | null
  sueldo_semanal: string | null
  sueldo_diario: string | null
  dias_mes: string | null
  /** Cuántas personas activas están en este nivel. */
  personas: number
}

/** Una ficha cuyo sueldo o cargo no coincide con su nivel del tabulador. */
export interface Desfase {
  empleado_id: number
  ficha: string
  nombres: string
  apellidos: string
  cargo: string
  tabulador_id: number
  cargo_tabulador: string
  salario_actual: string
  moneda_actual: string
  base_actual: string
  salario_tabulador: string
  moneda_tabulador: string
  diferencia: string
}

/** Lo que devolvió el botón: a quién le cambió qué. */
export interface CambioSincronizado {
  empleado_id: number
  ficha: string
  nombre: string
  cargo_antes: string
  cargo_ahora: string
  salario_antes: string
  moneda_antes: string
  salario_ahora: string
  moneda_ahora: string
}

export function useTabulador() {
  return useQuery({
    queryKey: ['tabulador'],
    queryFn: async () =>
      desenvolver<NivelTabulador[]>(
        await supabase.from('v_tabulador').select('*').order('orden').order('cargo'),
      ),
  })
}

/**
 * Quién está fuera de la escala, ahora mismo.
 *
 * Es lo que convierte "Sincronizar" en una decisión y no en una apuesta: la
 * pantalla enseña la lista antes de tocar nada. Se refresca sola cuando alguien
 * cambia el tabulador desde otro equipo, porque comparte la clave `tabulador`.
 */
export function useDesfase() {
  return useQuery({
    queryKey: ['tabulador', 'desfase'],
    queryFn: async () =>
      desenvolver<Desfase[]>(
        await supabase.from('v_tabulador_desfase').select('*').order('apellidos'),
      ),
  })
}

function useAccionTabulador<A, R>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tabulador'] })
      // Cambiar el tabulador cambia sueldos: el listado de personal, la ficha
      // de cada quien y cualquier nómina en borrador quedan viejos.
      void qc.invalidateQueries({ queryKey: ['nomina'] })
    },
  })
}

export function useGuardarNivel() {
  return useAccionTabulador(
    (n: {
      id?: number
      cargo: string
      sueldo_mensual: number | string
      moneda: string
      orden: number | string
      activo: boolean
      nota?: string
    }) =>
      rpc<number>('guardar_cargo_tabulador', {
        p_id: n.id ?? null,
        p_cargo: n.cargo,
        p_sueldo: Number(n.sueldo_mensual),
        p_moneda: n.moneda,
        p_orden: Number(n.orden || 100),
        p_activo: n.activo,
        p_nota: n.nota || null,
      }),
  )
}

export function useEliminarNivel() {
  return useAccionTabulador((id: number) => rpc('eliminar_cargo_tabulador', { p_id: id }))
}

export function useAsignarTabulador() {
  return useAccionTabulador((a: { empleado_id: number; tabulador_id: number | null; igualar?: boolean }) =>
    rpc('asignar_tabulador', {
      p_empleado_id: a.empleado_id,
      p_tabulador_id: a.tabulador_id,
      p_igualar: a.igualar ?? true,
    }),
  )
}

/**
 * El botón.
 *
 * Devuelve la lista de lo que cambió, no un contador. Con un número hay que ir
 * a buscar a quién le tocó; con la lista, quien lo pulsó puede avisarle.
 */
export function useSincronizarTabulador() {
  return useAccionTabulador<void, CambioSincronizado[]>(() =>
    rpc<CambioSincronizado[]>('sincronizar_tabulador', {}),
  )
}
