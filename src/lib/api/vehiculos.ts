import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver } from './rpc'
import type { Semaforo } from './maquinaria'

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

export function useGuardarVehiculo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: Partial<Vehiculo> & { id?: number }) => {
      const { id, ...campos } = v
      const fila = id
        ? await supabase.from('vehiculos').update(campos).eq('id', id).select().single()
        : await supabase.from('vehiculos').insert(campos).select().single()
      return desenvolver(fila)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vehiculos'] })
    },
  })
}
