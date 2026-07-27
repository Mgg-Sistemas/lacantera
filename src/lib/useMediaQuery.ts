import { useEffect, useState } from 'react'

/**
 * Responde a una media query desde JavaScript.
 *
 * Hace falta cuando la diferencia entre tamaños no es solo de estilo sino de
 * estructura: el menú contraído no oculta los textos con CSS, directamente no
 * los renderiza. Eso no se puede resolver con clases responsivas.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const lista = window.matchMedia(query)
    const alCambiar = (evento: MediaQueryListEvent) => setMatches(evento.matches)

    // Sincroniza por si el ancho cambió entre el render y el efecto.
    setMatches(lista.matches)
    lista.addEventListener('change', alCambiar)
    return () => lista.removeEventListener('change', alCambiar)
  }, [query])

  return matches
}
