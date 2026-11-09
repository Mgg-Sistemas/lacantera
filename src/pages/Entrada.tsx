import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { Cargando } from '@/components/ui/Estado'
import { useMisAcciones, useSoloTelefono } from '@/lib/api/usuarios'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useMisRoles } from '@/lib/api/catalogo'
import { PANTALLAS_DE_TELEFONO } from '@/config/navigation'

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
/*
  VISTA DE PC Y VISTA DE TELÉFONO (la dueña, 09/11/2026: los roles nuevos
  llevan «vista de PC y de tlf»). La casilla de teléfono ya no manda a nadie a
  su pantalla de teléfono estando en la PC: en la PC se entra al panel y desde
  el menú a cada módulo; en el teléfono, directo a su pantalla. La excepción
  sigue siendo el rol «solo teléfono», que aterriza en ella siempre.
*/
const ES_TELEFONO = '(max-width: 767px)'

export function Entrada({ tablero }: { tablero: ReactNode }) {
  const acciones = useMisAcciones()
  const roles = useMisRoles()
  // `isPending` y no `resuelto`: si la pregunta fallara, se sigue como cuenta
  // normal en vez de quedarse cargando para siempre.
  const { soloTelefono, isPending: telefonoPendiente } = useSoloTelefono()
  const enTelefono = useMediaQuery(ES_TELEFONO)

  if (!acciones.resuelto || !roles.isSuccess || telefonoPendiente) return <Cargando />

  const esAdmin = roles.roles.includes('ADMIN')
  // El orden de PANTALLAS_DE_TELEFONO es la prioridad: si alguien tuviera dos
  // casillas, gana la primera que case. Ver su propio comentario en
  // navigation.ts para por qué el surtidor va delante.
  if (!esAdmin && (enTelefono || soloTelefono)) {
    const propia = PANTALLAS_DE_TELEFONO.find((p) => acciones.puede(p.accion))
    if (propia) return <Navigate to={propia.ruta} replace />
  }
  return <>{tablero}</>
}
