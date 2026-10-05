import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { Cargando } from '@/components/ui/Estado'
import { useMisAcciones } from '@/lib/api/usuarios'
import { useMisRoles } from '@/lib/api/catalogo'

/*
  DÓNDE ATERRIZA CADA QUIEN AL ENTRAR.

  Casi todo el mundo entra al tablero, y así sigue. La excepción es la gente de
  campo: quien tiene la casilla del surtidor abre el sistema y ya está en la
  pantalla de surtir, sin pasar por un tablero que en un teléfono no le dice
  nada y que además tendría que bajar entero por la señal de la mina.

  Es lo que en los sistemas hermanos llaman «rol solo teléfono». Aquí no hizo
  falta un rol nuevo: es una casilla que se le presta a quien está en la bomba.

  EL ADMINISTRADOR SE QUEDA EN EL TABLERO aunque tenga la casilla. No es un
  caso raro: el administrador pasa TODAS las casillas por definición, así que
  sin esta línea cualquier administrador entraría al surtidor y pensaría que el
  sistema se rompió. Aterrizar en un sitio u otro es una comodidad, no un
  permiso, y por eso se decide aquí y no en la base.

  EL TABLERO LLEGA COMO PROP, no importado aquí. Importándolo, el chunk de esta
  pantalla se llevaría el del tablero por delante, y entonces el teléfono del
  surtidor —el que peor señal tiene— descargaría justo lo único que nunca va a
  mirar. Así sigue siendo perezoso: solo se trae si se pinta.

  SE ESPERA A SABER. Mientras las dos preguntas no estén resueltas no se pinta
  nada: enseñar el tablero y saltar al surtidor medio segundo después se lee
  como un parpadeo roto.
*/
export function Entrada({ tablero }: { tablero: ReactNode }) {
  const acciones = useMisAcciones()
  const roles = useMisRoles()

  if (!acciones.resuelto || !roles.isSuccess) return <Cargando />

  const esAdmin = roles.roles.includes('ADMIN')
  // Si alguien tuviera las dos casillas, gana el surtidor: el combustible se
  // mueve más veces al día que la cocina, y desde cada pantalla se llega a la
  // otra por el menú.
  if (!esAdmin && acciones.puede('COMBUSTIBLE.SURTIDOR_TELEFONO')) {
    return <Navigate to="/app/combustible/surtidor" replace />
  }
  if (!esAdmin && acciones.puede('ALIMENTACION.COCINA_TELEFONO')) {
    return <Navigate to="/app/alimentacion/cocina" replace />
  }
  return <>{tablero}</>
}
