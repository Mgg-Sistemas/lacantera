import { useId } from 'react'
import type { ChangeEvent, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { enMayuscula } from '@/lib/texto'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  hint?: string
  error?: string
  /** Deja el texto tal como se escribe. Ver la nota en `Input`. */
  sinNormalizar?: boolean
}

export function Textarea({
  label,
  hint,
  error,
  sinNormalizar = false,
  className,
  id,
  rows = 3,
  onChange,
  ...rest
}: TextareaProps) {
  const generatedId = useId()
  const areaId = id ?? generatedId
  const describedById = `${areaId}-desc`

  // Los motivos y las notas también son datos: se guardan en mayúscula, y aquí
  // se ven así mientras se escriben en vez de al releerlos después.
  const alEscribir = (e: ChangeEvent<HTMLTextAreaElement>) => {
    if (!sinNormalizar) {
      const cursor = e.target.selectionStart
      e.target.value = enMayuscula(e.target.value)
      e.target.setSelectionRange(cursor, cursor)
    }
    onChange?.(e)
  }

  return (
    <div className={cn('w-full min-w-0', className)}>
      <label htmlFor={areaId} className="text-ink/75 mb-1.5 block text-sm font-medium">
        {label}
      </label>

      <textarea
        id={areaId}
        rows={rows}
        onChange={alEscribir}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? describedById : undefined}
        className={cn(
          'rounded-control bg-surface text-ink/90 placeholder:text-ink/35 w-full border px-3.5 py-2.5 text-base',
          'transition-[border-color,box-shadow] duration-150 focus:outline-none',
          error
            ? 'border-danger focus:border-danger focus:ring-danger/20 focus:ring-2'
            : 'border-ink/20 hover:border-ink/32 focus:border-royal-600 focus:ring-royal-600/20 focus:ring-2',
        )}
        {...rest}
      />

      {error || hint ? (
        <p
          id={describedById}
          className={cn('mt-1.5 text-xs', error ? 'text-danger' : 'text-ink/50')}
        >
          {error ?? hint}
        </p>
      ) : null}
    </div>
  )
}
