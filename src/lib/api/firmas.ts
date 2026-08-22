import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { rpc, desenvolver } from '@/lib/api/rpc'

/*
  LA FIRMA DE CADA QUIEN

  Christopher: «cada usuario debería poder guardar su propia firma digital»,
  y después: «tanto usuarios como empleados deben tener la posibilidad».

  Son dos casos con reglas distintas, y por eso hay dos juegos de funciones:

    La propia   — la guarda uno mismo y nadie más. La función ni siquiera
                  recibe a quién: lo saca de la sesión, para que no haya manera
                  de guardar una firma en nombre de otro.

    La de un
    trabajador  — un obrero de la cantera no entra al sistema, no tiene usuario
                  ni clave. Su firma la carga quien lleva el personal, con el
                  papel delante. Esa sí recibe a quién, y exige rol de RRHH.

  Y las dos se pueden apagar sin borrarse: quien prefiere firmar a mano deja la
  raya en blanco sin perder la imagen. Volver a encenderla es un clic; rehacerla
  es buscar otra vez el teléfono y la buena luz.

  Lo que hay que decir claro: una firma guardada la copia cualquiera que la vea,
  así que NO prueba que la persona firmó. Prueba que el papel salió del sistema.
  Lo que da fe es la auditoría.
*/

export type OrigenDeFirma = 'DIBUJADA' | 'TECLEADA' | 'IMAGEN'

export interface Firma {
  id: number
  perfil_id: string | null
  empleado_id: number | null
  /** El PNG completo como data URL, listo para meterlo en un papel. */
  imagen: string
  origen: OrigenDeFirma
  /** Apagada, la firma sigue guardada pero el papel sale con la raya en blanco. */
  usar: boolean
  actualizada_en: string
}

/** La firma propia. Nula mientras no se haya guardado ninguna. */
export function useMiFirma() {
  return useQuery({
    queryKey: ['mi-firma'],
    queryFn: async () => {
      const { data: sesion } = await supabase.auth.getUser()
      const yo = sesion.user?.id
      if (!yo) return null

      return desenvolver<Firma | null>(
        await supabase.from('firmas').select('*').eq('perfil_id', yo).maybeSingle(),
      )
    },
    staleTime: 5 * 60_000,
  })
}

/** La de un trabajador, para la ficha de personal. */
export function useFirmaDeEmpleado(empleadoId: number | null | undefined) {
  return useQuery({
    enabled: empleadoId !== null && empleadoId !== undefined,
    queryKey: ['firma-empleado', empleadoId],
    queryFn: async () =>
      desenvolver<Firma | null>(
        await supabase.from('firmas').select('*').eq('empleado_id', empleadoId!).maybeSingle(),
      ),
    staleTime: 5 * 60_000,
  })
}

/**
 * Las firmas encendidas, por perfil y por empleado.
 *
 * En una sola consulta y no una por persona: quien arma un papel necesita la
 * de quien lo aprobó, la de quien lo recibió y la suya, y son tres viajes para
 * traer treinta kilobytes.
 *
 * Las apagadas se filtran aquí y no en cada papel. Si cada documento tuviera
 * que acordarse de mirar `usar`, el primero que se olvide estampa una firma
 * que su dueño pidió no usar.
 */
export function useFirmas() {
  return useQuery({
    queryKey: ['firmas'],
    queryFn: async () => {
      const filas = desenvolver<Firma[]>(
        await supabase.from('firmas').select('*').eq('usar', true),
      )
      return {
        porPerfil: Object.fromEntries(
          filas.filter((f) => f.perfil_id).map((f) => [f.perfil_id!, f.imagen]),
        ) as Record<string, string>,
        porEmpleado: Object.fromEntries(
          filas.filter((f) => f.empleado_id).map((f) => [f.empleado_id!, f.imagen]),
        ) as Record<number, string>,
      }
    },
    staleTime: 5 * 60_000,
  })
}

function useAccionFirma<A>(fn: (a: A) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mi-firma'] })
      void qc.invalidateQueries({ queryKey: ['firma-empleado'] })
      void qc.invalidateQueries({ queryKey: ['firmas'] })
    },
  })
}

export function useGuardarMiFirma() {
  return useAccionFirma((a: { imagen: string; origen: OrigenDeFirma }) =>
    rpc('guardar_mi_firma', { p_imagen: a.imagen, p_origen: a.origen }),
  )
}

export function useQuitarMiFirma() {
  return useAccionFirma(() => rpc('quitar_mi_firma', {}))
}

export function useUsarMiFirma() {
  return useAccionFirma((a: { usar: boolean }) => rpc('usar_mi_firma', { p_usar: a.usar }))
}

export function useGuardarFirmaDeEmpleado() {
  return useAccionFirma((a: { empleado_id: number; imagen: string; origen: OrigenDeFirma }) =>
    rpc('guardar_firma_de_empleado', {
      p_empleado_id: a.empleado_id,
      p_imagen: a.imagen,
      p_origen: a.origen,
    }),
  )
}

export function useQuitarFirmaDeEmpleado() {
  return useAccionFirma((a: { empleado_id: number }) =>
    rpc('quitar_firma_de_empleado', { p_empleado_id: a.empleado_id }),
  )
}

export function useUsarFirmaDeEmpleado() {
  return useAccionFirma((a: { empleado_id: number; usar: boolean }) =>
    rpc('usar_firma_de_empleado', { p_empleado_id: a.empleado_id, p_usar: a.usar }),
  )
}
