import { useId } from 'react'
import type { TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  hint?: string
  error?: string
}

export function Textarea({ label, hint, error, className, id, rows = 3, ...rest }: TextareaProps) {
  const generatedId = useId()
  const areaId = id ?? generatedId
  const describedById = `${areaId}-desc`

  return (
    <div className={cn('w-full', className)}>
      <label htmlFor={areaId} className="text-ink/75 mb-1.5 block text-sm font-medium">
        {label}
      </label>

      <textarea
        id={areaId}
        rows={rows}
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
