import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { quitarAviso, useAvisosFlotantes } from '@/lib/avisosFlotantes'

const TONOS = {
  success: 'border-success/40 bg-surface text-ink/85 [&_span.marca]:bg-success',
  error: 'border-danger/40 bg-surface text-ink/85 [&_span.marca]:bg-danger',
  warning: 'border-warning/40 bg-surface text-ink/85 [&_span.marca]:bg-warning',
  info: 'border-info/40 bg-surface text-ink/85 [&_span.marca]:bg-info',
} as const

/*
  Se pinta sobre todo lo demás —también sobre los modales—, abajo y al centro
  en el teléfono, abajo a la derecha en la computadora. Se cuelga del `body`
  por la misma razón que `Modal`: un ancestro con `transform` cambiaría su
  marco.
*/
export function AvisosFlotantes() {
  const avisos = useAvisosFlotantes()
  if (avisos.length === 0) return null

  return createPortal(
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] flex flex-col items-center gap-2 sm:right-4 sm:left-auto sm:items-end"
    >
      {avisos.map((a) => (
        <div
          key={a.id}
          role={a.tipo === 'error' ? 'alert' : 'status'}
          className={cn(
            'shadow-popover pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-[8px] border px-3.5 py-3 text-sm',
            TONOS[a.tipo],
          )}
        >
          <span className="marca mt-1.5 size-2 shrink-0 rounded-full" aria-hidden="true" />
          <p className="min-w-0 flex-1 whitespace-pre-line">{a.texto}</p>
          <button
            type="button"
            onClick={() => quitarAviso(a.id)}
            aria-label="Cerrar aviso"
            className="text-ink/40 hover:text-ink/70 -mt-0.5 -mr-1 rounded p-0.5"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}
