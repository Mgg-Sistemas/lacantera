import { useEffect, useRef } from 'react'

/**
 * Que la pantalla acuse el movimiento del ratón.
 *
 * Publica dos variables CSS en el elemento —`--px` y `--py`, de -1 a 1— con la
 * posición del puntero respecto al centro. Quien quiera reaccionar las lee desde
 * una clase; este enganche no sabe qué se mueve ni cuánto, y así el mismo código
 * sirve para la portada.
 *
 * POR QUÉ NO HAY UN BUCLE DE ANIMACIÓN AQUÍ
 *
 * La tentación es montar un `requestAnimationFrame` que interpole hacia el
 * destino. No hace falta: la suavidad la da una transición CSS sobre `transform`
 * en quien se mueve, que corre en el compositor y no en el hilo principal. Un
 * bucle propio haría el mismo trabajo peor y despertaría la pestaña sesenta
 * veces por segundo para nada.
 *
 * Lo que sí se hace es agrupar: `pointermove` dispara mucho más rápido que los
 * fotogramas, así que se guarda la última posición y se escribe una sola vez por
 * fotograma. Sin esto se toca el DOM cientos de veces por segundo.
 *
 * CUÁNDO NO SE ACTIVA
 *
 * Con `prefers-reduced-motion` no se engancha nada. El parallax es de los
 * efectos que producen mareo de verdad, y quien pidió que la pantalla se esté
 * quieta lo pidió sobre todo por esto.
 *
 * Y solo con puntero fino. En una pantalla táctil no hay "posición del ratón":
 * el dedo aparece donde toca, así que la imagen daría un salto brusco al primer
 * contacto —justo encima del campo que se acaba de tocar— y luego se quedaría
 * clavada. Un efecto que solo tiene sentido con ratón se apaga sin ratón.
 */
export function usePuntero<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const nodo = ref.current
    if (!nodo || typeof window === 'undefined' || !window.matchMedia) return

    const quietud = window.matchMedia('(prefers-reduced-motion: reduce)')
    const punteroFino = window.matchMedia('(pointer: fine)')
    if (quietud.matches || !punteroFino.matches) return

    let pedido = 0
    let x = 0
    let y = 0

    const escribir = () => {
      pedido = 0
      nodo.style.setProperty('--px', x.toFixed(4))
      nodo.style.setProperty('--py', y.toFixed(4))
    }

    const alMover = (e: PointerEvent) => {
      // Respecto al centro de la ventana y no del elemento: lo que importa es
      // hacia dónde mira quien usa la pantalla, no sobre qué caja pasa.
      x = (e.clientX / window.innerWidth) * 2 - 1
      y = (e.clientY / window.innerHeight) * 2 - 1
      if (!pedido) pedido = requestAnimationFrame(escribir)
    }

    // Al salir del documento vuelve al centro en vez de quedarse torcida.
    const alSalir = () => {
      x = 0
      y = 0
      if (!pedido) pedido = requestAnimationFrame(escribir)
    }

    window.addEventListener('pointermove', alMover, { passive: true })
    document.addEventListener('pointerleave', alSalir)

    return () => {
      window.removeEventListener('pointermove', alMover)
      document.removeEventListener('pointerleave', alSalir)
      if (pedido) cancelAnimationFrame(pedido)
    }
  }, [])

  return ref
}
