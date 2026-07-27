import { useId } from 'react'
import type { SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

interface Opcion {
  valor: string
  etiqueta: string
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label: string
  opciones: Opcion[]
  hint?: string
  error?: string
  /** Texto de la opción vacía. Si falta, el campo no admite vacío. */
  vacio?: string
}

export function Select({
  label,
  opciones,
  hint,
  error,
  vacio,
  className,
  id,
  ...rest
}: SelectProps) {
  const generatedId = useId()
  const selectId = id ?? generatedId
  const describedById = `${selectId}-desc`

  return (
    <div className={cn('w-full', className)}>
      <label htmlFor={selectId} className="text-ink/75 mb-1.5 block text-sm font-medium">
        {label}
      </label>

      <div className="relative">
        <select
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? describedById : undefined}
          className={cn(
            'rounded-control bg-surface text-ink/90 h-10 w-full appearance-none border pr-9 pl-3.5 text-base',
            'transition-[border-color,box-shadow] duration-150 focus:outline-none',
            error
              ? 'border-danger focus:border-danger focus:ring-danger/20 focus:ring-2'
              : 'border-ink/20 hover:border-ink/32 focus:border-royal-600 focus:ring-royal-600/20 focus:ring-2',
          )}
          {...rest}
        >
          {vacio !== undefined ? <option value="">{vacio}</option> : null}
          {opciones.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>

        <ChevronDown className="text-ink/40 pointer-events-none absolute inset-y-0 right-3 my-auto size-[18px]" />
      </div>

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
