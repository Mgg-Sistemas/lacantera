import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Quita el relleno interno cuando el contenido es una tabla a sangre. */
  flush?: boolean
}

export function Card({ flush = false, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'bg-surface rounded-card shadow-card',
        // `min-w-0` es obligatorio, no cosmético: como ítem de grid o flex, el
        // mínimo por defecto es `auto`, que equivale al ancho mínimo del
        // contenido. Una tabla ancha dentro estira la card, la card estira la
        // columna, y la página entera termina con scroll horizontal en móvil
        // aunque la tabla ya tenga su propio contenedor con overflow.
        'min-w-0',
        !flush && 'p-5',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: string
  /** Línea de contexto bajo el título. Explica la cifra, no la repite. */
  subtitle?: string
  action?: ReactNode
  className?: string
}

export function CardHeader({ title, subtitle, action, className }: CardHeaderProps) {
  return (
    // En pantalla estrecha, el título y su acción se apilan. Compartiendo
    // línea, una etiqueta de estado larga —"Pagada · pendiente por
    // recepcionar"— deja el título en "Qué …", que es justo lo que había que
    // leer.
    <div
      className={cn(
        'flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-ink/90 truncate text-xl font-medium">{title}</h2>
        {subtitle ? <p className="text-ink/55 mt-0.5 text-sm">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0 empty:hidden">{action}</div> : null}
    </div>
  )
}
