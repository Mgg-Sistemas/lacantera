import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'
import type { Semaforo } from './maquinaria'
import type { HechoDeFicha } from '@/components/Historial'

/**
 * La flota que mueve el material.
 *
 * LOS PROPIOS TIENEN DOS FICHAS Y NO ES UN DESCUIDO
 *
 * Un camión de la empresa está aquí por lo que carga y en `maquinaria` por el
 * mantenimiento que le toca. Se enlazan con `maquina_id`, y la vista trae el
 * semáforo al lado de la capacidad para que quien va a cargar vea, antes de
 * hacerlo, si ese camión debería estar en el taller.
 *
 * Los de transportistas no tienen ficha de mantenimiento: no son nuestros.
 */

export interface Vehiculo {
  id: number
  placa: string
  tipo: string
  descripcion: string | null
  capacidad_m3: string
  /** Nula hasta que se pese. No se deduce de los metros cúbicos. */
  capacidad_ton: string | null
  propio: boolean
  transportista: string | null
  maquina_id: number | null
  activo: boolean
  nota: string | null
  maquina_codigo: string | null
  maquina: string | null
  semaforo_mantenimiento: Semaforo | null
  horas_desde_mant: string | null
  tope_horas: string | null
  /** Quién lo maneja hoy. Nulo si nadie lo tiene asignado. */
  chofer_actual: string | null
  cedula_chofer_actual: string | null
  chofer_desde: string | null
  asignacion_chofer_id: number | null
}

export interface ChoferDeVehiculo {
  id: number
  vehiculo_id: number
  placa: string
  empleado_id: number | null
  chofer: string
  cedula: string | null
  cargo: string | null
  /** Si está en nómina. Los de un transportista no lo están. */
  es_de_la_casa: boolean
  desde: string
  hasta: string | null
  vigente: boolean
  dias: number
  motivo: string | null
  nota: string | null
}

export interface ActividadDeVehiculo {
  vehiculo_id: number
  tipo: 'PESAJE' | 'DESPACHO' | 'GUIA' | 'TALLER'
  fecha: string
  numero: string
  detalle: string | null
  cantidad: string | null
  unidad: string
  estado: string
}

export const TIPOS_VEHICULO = [
  { valor: 'VOLTEO', etiqueta: 'Camión de volteo' },
  { valor: 'CHUTO', etiqueta: 'Chuto con volqueta' },
  { valor: 'GANDOLA', etiqueta: 'Gandola' },
  { valor: 'CAVA', etiqueta: 'Cava' },
  { valor: 'CISTERNA', etiqueta: 'Cisterna' },
  { valor: 'OTRO', etiqueta: 'Otro' },
]

export function useVehiculos(soloActivos = true) {
  return useQuery({
    queryKey: ['vehiculos', soloActivos],
    queryFn: async () => {
      let q = supabase.from('v_vehiculos').select('*').order('placa')
      if (soloActivos) q = q.eq('activo', true)
      return desenvolver<Vehiculo[]>(await q)
    },
  })
}

/**
 * Alta y corrección de un vehículo.
 *
 * Por `rpc()` como todo lo demás: la tabla tiene los permisos de escritura
 * revocados. La función es también donde viven las comprobaciones que la
 * pantalla no puede garantizar por su cuenta —que un camión ajeno diga de
 * quién es, que solo uno propio tenga ficha de mantenimiento—, y la placa se
 * normaliza en la base para que el mismo camión no exista dos veces.
 */
export function useGuardarVehiculo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      id?: number | null
      placa: string
      tipo: string
      capacidad_m3: number
      descripcion?: string | null
      capacidad_ton?: number | null
      propio: boolean
      transportista?: string | null
      maquina_id?: number | null
      activo?: boolean
      nota?: string | null
    }) =>
      rpc<number>('guardar_vehiculo', {
        p_id: v.id ?? null,
        p_placa: v.placa,
        p_tipo: v.tipo,
        p_capacidad_m3: v.capacidad_m3,
        p_descripcion: v.descripcion ?? null,
        p_capacidad_ton: v.capacidad_ton ?? null,
        p_propio: v.propio,
        p_transportista: v.transportista ?? null,
        p_maquina_id: v.maquina_id ?? null,
        p_activo: v.activo ?? true,
        p_nota: v.nota ?? null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vehiculos'] })
    },
  })
}

/**
 * Quién ha manejado un vehículo, del más reciente al más antiguo.
 *
 * EL TRASPASO NO SE ANOTA: SE DEDUCE
 *
 * Asignar un chofer nuevo cierra el período del anterior el día antes. No hay
 * que acordarse de cerrar nada, y por eso el historial no tiene huecos ni
 * solapes: un índice único impide que dos figuren manejando a la vez.
 */
export function useChoferesDeVehiculo(vehiculoId: number | null) {
  return useQuery({
    queryKey: ['vehiculos', 'choferes', vehiculoId],
    enabled: vehiculoId !== null,
    queryFn: async () =>
      desenvolver<ChoferDeVehiculo[]>(
        await supabase
          .from('v_vehiculo_choferes')
          .select('*')
          .eq('vehiculo_id', vehiculoId!)
          .order('desde', { ascending: false }),
      ),
  })
}

/*
  `useActividadDeVehiculo` se fue de aqui.

  Leia `v_vehiculo_actividad` para pintar «Que ha hecho» en la ficha, y contaba
  solo la mitad: un camion propio es tambien una maquina, y su combustible y su
  taller vivian del otro lado. Ahora esa vista la une `historial_vehiculo` con
  el resto, y la ficha usa `useHistorialVehiculo`. La vista sigue viva y en uso
  —dentro de la funcion—, lo que sobraba era el hook.
*/


/**
 * Todo lo que le ha pasado a un vehículo, incluida su otra mitad.
 *
 * Un camión propio es DOS cosas: un vehículo que hace viajes y una máquina que
 * se mantiene. La ficha enseñaba la primera mitad y para la otra ponía un enlace
 * «Ver en Maquinaria» — así que quien abría la ficha de su camión no veía cuándo
 * se le había echado gasoil.
 *
 * Lo de la máquina llega solo si quien mira TIENE maquinaria: la función usa
 * `tiene_permiso` y no `exigir_permiso`, para que a un usuario de despachos la
 * ficha le enseñe su parte en vez de reventar.
 */
export function useHistorialVehiculo(vehiculoId: number | null) {
  return useQuery({
    queryKey: ['historial-vehiculo', vehiculoId],
    enabled: vehiculoId != null,
    queryFn: () =>
      rpc<HechoDeFicha[]>('historial_vehiculo', {
        p_vehiculo_id: vehiculoId,
        p_limite: 200,
      }),
  })
}

function useAccionDeVehiculo<A>(fn: (a: A) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['vehiculos'] }),
  })
}

export function useAsignarChofer() {
  return useAccionDeVehiculo(
    (a: {
      vehiculo_id: number
      empleado_id?: number | null
      nombre?: string | null
      cedula?: string | null
      desde?: string | null
      motivo?: string | null
      nota?: string | null
    }) =>
      rpc<number>('asignar_chofer', {
        p_vehiculo_id: a.vehiculo_id,
        p_empleado_id: a.empleado_id ?? null,
        p_nombre: a.nombre ?? null,
        p_cedula: a.cedula ?? null,
        p_desde: a.desde ?? null,
        p_motivo: a.motivo ?? null,
        p_nota: a.nota ?? null,
      }),
  )
}

export function useTerminarChofer() {
  return useAccionDeVehiculo((a: { id: number; hasta?: string | null; motivo?: string | null }) =>
    rpc<number>('terminar_chofer', {
      p_id: a.id,
      p_hasta: a.hasta ?? null,
      p_motivo: a.motivo ?? null,
    }),
  )
}
