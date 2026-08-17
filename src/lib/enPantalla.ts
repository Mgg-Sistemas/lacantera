import { useEffect, useRef, useState } from 'react'

/**
 * Saber cuándo un bloque entra en pantalla.
 *
 * Sirve para dos cosas en la portada: revelar el texto de cada capítulo cuando
 * llega, y saber en cuál está la persona para marcarlo en el raíl de abajo.
 *
 * Va con un observador y no escuchando el scroll. La diferencia no es de
 * estilo: una rueda de ratón dispara cientos de eventos por segundo y cada uno
 * obligaría a preguntar por la posición de un elemento, que es de las
 * preguntas que fuerzan al navegador a recalcular la página entera antes de
 * responder. El observador avisa él, cuando toca, y no cuesta nada mientras
 * tanto.
 *
 * `unaVez` para lo que se revela: un texto que ya apareció no debe volver a
 * desvanecerse al subir. Quien sube está releyendo, y verlo apagarse en la cara
 * es de las cosas que hacen que una página se sienta rota aunque funcione.
 */
export function useEnPantalla<T extends HTMLElement>(opciones?: {
  unaVez?: boolean
  /** Cuánto tiene que asomar para contar. 0.5 = la mitad del bloque. */
  parte?: number
}) {
  const ref = useRef<T>(null)
  const [dentro, setDentro] = useState(false)

  const { unaVez = false, parte = 0.35 } = opciones ?? {}

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Sin observador —navegador viejo— se da por visto. Vale más enseñar el
    // texto de golpe que dejarlo invisible para siempre.
    if (typeof IntersectionObserver === 'undefined') {
      setDentro(true)
      return
    }

    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setDentro(true)
          if (unaVez) obs.disconnect()
        } else if (!unaVez) {
          setDentro(false)
        }
      },
      { threshold: parte },
    )

    obs.observe(el)
    return () => obs.disconnect()
  }, [unaVez, parte])

  return { ref, dentro }
}
