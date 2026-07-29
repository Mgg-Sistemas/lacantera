import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

interface ModalProps {
  abierto: boolean
  onCerrar: () => void
  titulo: string
  /** Una línea que dice qué se decide aquí. No repite el título. */
  descripcion?: string
  children: ReactNode
  /** Botones. Van al pie, alineados a la derecha. */
  acciones?: ReactNode
  ancho?: 'sm' | 'md' | 'lg'
}

const anchos = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
}

export function Modal({
  abierto,
  onCerrar,
  titulo,
  descripcion,
  children,
  acciones,
  ancho = 'md',
}: ModalProps) {
  const panel = useRef<HTMLDivElement>(null)

  /*
    `onCerrar` se lee de una referencia y no de las dependencias del efecto.

    Cada pantalla lo escribe en el sitio —`onCerrar={() => setEdicion(null)}`—,
    así que es una función distinta en cada render. Puesta como dependencia, el
    efecto se rehacía con cada tecla y volvía a mover el foco al panel: se
    escribía una letra y había que hacer clic otra vez para escribir la
    siguiente. Cualquier modal con un campo de texto quedaba inservible.
  */
  const alCerrar = useRef(onCerrar)
  useEffect(() => {
    alCerrar.current = onCerrar
  })

  useEffect(() => {
    if (!abierto) return

    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar.current()
    }
    document.addEventListener('keydown', alPulsar)

    // El foco entra al panel: sin esto, tabular desde el modal recorre la
    // página de detrás, que el usuario no puede ver. Solo si no está ya
    // dentro — si alguien está escribiendo, moverlo es quitarle el cursor.
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus()

    // Bloquear el desplazamiento de fondo. En móvil, sin esto, el dedo mueve
    // la página y el modal parece pegado a la nada.
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', alPulsar)
      document.body.style.overflow = previo
    }
  }, [abierto])

  if (!abierto) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="bg-ink/40 absolute inset-0 backdrop-blur-[1px]"
        onClick={onCerrar}
        aria-hidden="true"
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className={cn(
          'bg-surface shadow-popover relative flex max-h-[92svh] w-full flex-col outline-none',
          'rounded-t-[10px] sm:rounded-card',
          anchos[ancho],
        )}
      >
        <div className="border-hairline flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-ink/90 text-xl font-medium">{titulo}</h2>
            {descripcion ? <p className="text-ink/55 mt-0.5 text-sm">{descripcion}</p> : null}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="text-ink/45 hover:bg-ink/6 hover:text-ink/80 -mt-1 -mr-1 rounded-[6px] p-1.5 transition-colors"
          >
            <X className="size-[18px]" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {acciones ? (
          <div className="border-hairline flex flex-wrap justify-end gap-2 border-t px-5 py-4">
            {acciones}
          </div>
        ) : null}
      </div>
    </div>
  )
}
