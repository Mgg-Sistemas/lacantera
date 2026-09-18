import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/*
  EL CATÁLOGO DE QUIEN SE LLEVA EL MATERIAL.

  Angélica, 18/09/2026: la nota de entrega sale obligatoriamente con chofer,
  cédula y placa, y «esos datos se van a ir convirtiendo en un catálogo en el
  que vas a permitir editar, deshabilitar y agregar datos. Si los datos no
  existen se agregan».

  No es la flota de Maquinaria: aquí entra cualquier camión que cargue en el
  patio, casi siempre del cliente, con su placa y su marca/modelo.
*/

export interface Chofer {
  id: number
  nombre: string
  cedula: string
  activo: boolean
}

export interface VehiculoDeDespacho {
  id: number
  placa: string
  descripcion: string | null
  activo: boolean
}

export function useChoferes() {
  return useQuery({
    queryKey: ['catalogo-transporte', 'choferes'],
    queryFn: async () =>
      desenvolver<Chofer[]>(
        await supabase.from('choferes').select('id, nombre, cedula, activo').order('nombre'),
      ),
  })
}

export function useVehiculosDeDespacho() {
  return useQuery({
    queryKey: ['catalogo-transporte', 'vehiculos'],
    queryFn: async () =>
      desenvolver<VehiculoDeDespacho[]>(
        await supabase
          .from('vehiculos_de_despacho')
          .select('id, placa, descripcion, activo')
          .order('placa'),
      ),
  })
}

function useAccionTransporte<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['catalogo-transporte'] }),
  })
}

export function useGuardarChofer() {
  return useAccionTransporte((c: { id?: number | null; nombre: string; cedula: string; activo?: boolean }) =>
    rpc<number>('guardar_chofer', {
      p_id: c.id ?? null,
      p_nombre: c.nombre,
      p_cedula: c.cedula,
      p_activo: c.activo ?? true,
    }),
  )
}

export function useGuardarVehiculoDeDespacho() {
  return useAccionTransporte(
    (v: { id?: number | null; placa: string; descripcion: string | null; activo?: boolean }) =>
      rpc<number>('guardar_vehiculo_de_despacho', {
        p_id: v.id ?? null,
        p_placa: v.placa,
        p_descripcion: v.descripcion || null,
        p_activo: v.activo ?? true,
      }),
  )
}

/** Igual que la base: sin espacios ni guiones, en mayúsculas. */
export const placaLimpia = (p: string) => p.trim().toUpperCase().replace(/[\s-]+/g, '')

/** Igual que la base: solo los dígitos. «V-15.517.657» y «15517657» son la misma. */
export const cedulaComparable = (c: string) => c.toUpperCase().replace(/^[VEJPG]|[^0-9]/g, '')
