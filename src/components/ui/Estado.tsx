import { AlertTriangle, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Los tres estados que toda pantalla que lee de la base tiene que saber
 * mostrar: cargando, error y vacío. Están juntos a propósito — cuando se
 * resuelven por separado en cada pantalla, siempre falta alguno.
 */

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="text-ink/45 flex items-center justify-center gap-2 py-12 text-sm">
      <Loader2 className="size-4 animate-spin" />
      {texto}
    </div>
  )
}

export function ErrorDeCarga({ error, className }: { error: unknown; className?: string }) {
  const mensaje = error instanceof Error ? error.message : String(error)

  return (
    <div
      role="alert"
      className={cn(
        'border-danger/25 bg-danger-soft flex items-start gap-2.5 rounded-[6px] border p-3.5',
        className,
      )}
    >
      <AlertTriangle className="text-danger mt-px size-[18px] shrink-0" />
      <p className="text-danger text-sm">{mensaje}</p>
    </div>
  )
}

interface VacioProps {
  icono?: ReactNode
  titulo: string
  /** Qué hacer para que deje de estar vacío. Una pantalla vacía es una invitación. */
  descripcion?: string
  accion?: ReactNode
  className?: string
}

export function Vacio({ icono, titulo, descripcion, accion, className }: VacioProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {icono ? <div className="text-ink/25 [&>svg]:size-8">{icono}</div> : null}
      <p className="text-ink/75 mt-3 text-base font-medium">{titulo}</p>
      {descripcion ? (
        <p className="text-ink/50 mt-1 max-w-sm text-sm leading-relaxed">{descripcion}</p>
      ) : null}
      {accion ? <div className="mt-4">{accion}</div> : null}
    </div>
  )
}
