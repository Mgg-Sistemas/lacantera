import { useId, useState } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/cn'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string
  /** Texto de ayuda. Si hay error, el error lo sustituye. */
  hint?: string
  error?: string
  icon?: ReactNode
  /** Añade el botón de mostrar/ocultar y alterna el type. */
  revealable?: boolean
}

export function Input({
  label,
  hint,
  error,
  icon,
  revealable = false,
  className,
  type = 'text',
  id,
  ...rest
}: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const describedById = `${inputId}-desc`
  const [revealed, setRevealed] = useState(false)

  const resolvedType = revealable ? (revealed ? 'text' : 'password') : type

  return (
    <div className={cn('w-full', className)}>
      <label htmlFor={inputId} className="text-ink/75 mb-1.5 block text-sm font-medium">
        {label}
      </label>

      <div className="relative">
        {icon ? (
          <span className="text-ink/40 pointer-events-none absolute inset-y-0 left-3 flex items-center [&>svg]:size-[18px]">
            {icon}
          </span>
        ) : null}

        <input
          id={inputId}
          type={resolvedType}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? describedById : undefined}
          className={cn(
            'rounded-control bg-surface h-10 w-full border text-base',
            'placeholder:text-ink/35 text-ink/90',
            'transition-[border-color,box-shadow] duration-150',
            'focus:outline-none',
            icon ? 'pl-10' : 'pl-3.5',
            revealable ? 'pr-10' : 'pr-3.5',
            error
              ? 'border-danger focus:border-danger focus:ring-danger/20 focus:ring-2'
              : 'border-ink/20 hover:border-ink/32 focus:border-royal-600 focus:ring-royal-600/20 focus:ring-2',
          )}
          {...rest}
        />

        {revealable ? (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            title={revealed ? 'Ocultar la clave' : 'Ver la clave'}
            // Al 40% no se veía: quien escribe mal la clave a ciegas no
            // descubre que hay forma de mirarla, y vuelve a intentarlo a
            // ciegas. Un control que existe pero no se distingue del fondo
            // es un control que no existe.
            className="text-ink/60 hover:bg-ink/8 hover:text-ink/90 focus-visible:outline-royal-600 absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-[6px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
          >
            {revealed ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </button>
        ) : null}
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
