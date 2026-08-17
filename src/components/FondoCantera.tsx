import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'

/**
 * El frente de fondo, en rotación lenta.
 *
 * CRUCE Y NO DESLIZAMIENTO
 *
 * Las imágenes se funden unas sobre otras; ninguna entra deslizándose. No es
 * gusto: encima de esto va el seguimiento del puntero, y dos movimientos
 * horizontales a la vez —uno que responde a la mano y otro que va por su
 * cuenta— se leen como un fallo. El cruce no compite con el parallax porque no
 * ocurre en el mismo eje: uno mueve, el otro revela.
 *
 * NUEVE SEGUNDOS, NO TRES
 *
 * Es un fondo, no una presentación. A un ritmo de anuncio la pantalla pide
 * atención constantemente y trabaja en contra de lo único que hay que hacer
 * aquí, que es escribir una clave. Nueve segundos de reposo y casi segundo y
 * medio de cruce hacen que el cambio se perciba de reojo, no de frente.
 *
 * LO QUE NO SE DESCARGA
 *
 * Solo la primera imagen es urgente; las demás llegan cuando ya se ve la
 * pantalla. Quien abre esto lo hace a las seis de la mañana desde la cantera,
 * y no puede esperar a tres fotografías para poder escribir su usuario.
 *
 * SI UNA FALTA, DESAPARECE
 *
 * Una ruta rota no deja el hueco gris del icono de imagen partida: se cae de
 * la lista y el resto sigue rotando. Un fondo decorativo nunca puede estropear
 * una pantalla de acceso.
 */

/** El orden es el del recorrido: se arranca la roca, se ve el corte, se carga. */
const FRENTES = ['/cantera/01.jpg', '/cantera/02.jpg', '/cantera/03.jpg', '/cantera.jpg']

const REPOSO_MS = 9000
const CRUCE_MS = 1400

export function FondoCantera({ className }: { className?: string }) {
  const [vivas, setVivas] = useState(FRENTES)
  const [actual, setActual] = useState(0)

  useEffect(() => {
    if (vivas.length < 2) return

    // Con movimiento reducido no rota. Las guías reservan las animaciones que
    // se repiten solas para los indicadores de carga, y con razón: un fondo
    // que cambia cada nueve segundos, para quien pidió quietud, es justo lo
    // que no puede ignorar mientras teclea.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const reloj = setInterval(() => setActual((i) => (i + 1) % vivas.length), REPOSO_MS)
    return () => clearInterval(reloj)
  }, [vivas.length])

  return (
    <div className={cn('absolute inset-0 overflow-hidden', className)} aria-hidden="true">
      {vivas.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          // La primera manda: es la que se ve mientras las otras llegan.
          loading={i === 0 ? 'eager' : 'lazy'}
          fetchPriority={i === 0 ? 'high' : 'low'}
          decoding="async"
          onError={() => setVivas((l) => (l.length > 1 ? l.filter((s) => s !== src) : l))}
          className="absolute inset-0 size-full object-cover transition-opacity ease-in-out"
          style={{
            opacity: i === actual ? 1 : 0,
            transitionDuration: `${CRUCE_MS}ms`,
          }}
        />
      ))}
    </div>
  )
}
