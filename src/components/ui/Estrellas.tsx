import { useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'

/*
  ★★★★☆ CALIFICAR CON ESTRELLAS (la dueña: «que al momento de calificar al
  proveedor sea todo tipo estrellas»)

  Cinco estrellas clicables, con el label arriba como los otros campos y la
  etiqueta del valor al lado («Excelente»). Al pasar el mouse se previsualiza.
  Accesible como un grupo de radios: Tab entra a la estrella marcada y las
  flechas mueven la calificación. Con `soloLectura` solo se muestra.
*/

interface EstrellasProps {
  /** Si falta, no hay label arriba (p. ej. al mostrarla dentro de un texto). */
  label?: string
  /** 1 a 5; 0 o null, sin calificar. */
  value: number | null
  onChange?: (n: number) => void
  /** La etiqueta de cada valor (1 a 5): se muestra al lado y la lee el lector de pantalla. */
  etiquetas?: Record<number, string>
  soloLectura?: boolean
  hint?: string
  size?: 'sm' | 'md'
  className?: string
}

const VALORES = [1, 2, 3, 4, 5] as const

export function Estrellas({
  label,
  value,
  onChange,
  etiquetas,
  soloLectura = false,
  hint,
  size = 'md',
  className,
}: EstrellasProps) {
  const id = useId()
  const labelId = `${id}-label`
  const hintId = `${id}-hint`
  const [hover, setHover] = useState<number | null>(null)
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const actual = Math.max(0, Math.min(5, Math.round(value ?? 0)))
  const mostrado = soloLectura ? actual : (hover ?? actual)
  const etiqueta = mostrado > 0 ? etiquetas?.[mostrado] : undefined

  function elegir(n: number) {
    if (soloLectura || !onChange) return
    onChange(Math.max(1, Math.min(5, n)))
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, n: number) {
    let sig: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') sig = Math.min(5, n + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') sig = Math.max(1, n - 1)
    else if (e.key === 'Home') sig = 1
    else if (e.key === 'End') sig = 5
    if (sig == null) return
    e.preventDefault()
    elegir(sig)
    refs.current[sig - 1]?.focus()
  }

  const tam = size === 'sm' ? 'text-lg' : 'text-[1.75rem]'

  if (soloLectura) {
    const texto = `${actual} de 5 estrellas${etiquetas?.[actual] ? ` · ${etiquetas[actual]}` : ''}`
    return (
      <span className={cn('inline-flex items-center gap-1.5', className)}>
        {label ? <span className="text-ink/75 text-sm font-medium">{label}</span> : null}
        <span role="img" aria-label={texto} className={cn('leading-none tracking-tight', size === 'sm' ? 'text-base' : 'text-xl')}>
          {VALORES.map((n) => (
            <span key={n} aria-hidden="true" className={n <= actual ? 'text-warning-fuerte' : 'text-ink/25'}>
              {n <= actual ? '★' : '☆'}
            </span>
          ))}
        </span>
        {etiquetas?.[actual] ? <span className="text-ink/70 text-sm">{etiquetas[actual]}</span> : null}
      </span>
    )
  }

  // La estrella que recibe el Tab: la marcada o, sin calificar, la primera.
  const enfocable = actual > 0 ? actual : 1

  return (
    <div className={cn('w-full min-w-0', className)}>
      {label ? (
        <div id={labelId} className="text-ink/75 mb-1.5 block text-sm font-medium">
          {label}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div
          role="radiogroup"
          aria-labelledby={label ? labelId : undefined}
          aria-describedby={hint ? hintId : undefined}
          className="flex items-center"
          onMouseLeave={() => setHover(null)}
        >
          {VALORES.map((n) => {
            const llena = n <= mostrado
            return (
              <button
                key={n}
                ref={(el) => {
                  refs.current[n - 1] = el
                }}
                type="button"
                role="radio"
                aria-checked={n === actual}
                aria-label={`${n} de 5${etiquetas?.[n] ? ` · ${etiquetas[n]}` : ''}`}
                tabIndex={n === enfocable ? 0 : -1}
                onClick={() => elegir(n)}
                onMouseEnter={() => setHover(n)}
                onFocus={() => setHover(null)}
                onKeyDown={(e) => onKeyDown(e, n)}
                className={cn(
                  'rounded-control cursor-pointer px-0.5 leading-none transition-[color,transform] duration-100',
                  'focus-visible:ring-royal-600/40 focus:outline-none focus-visible:ring-2',
                  'hover:scale-110',
                  tam,
                  llena ? 'text-warning-fuerte' : 'text-ink/25 hover:text-ink/40',
                )}
              >
                <span aria-hidden="true">{llena ? '★' : '☆'}</span>
              </button>
            )
          })}
        </div>
        {etiqueta ? (
          <span className={cn('text-sm', hover != null && hover !== actual ? 'text-ink/50' : 'text-ink/80 font-medium')}>
            {etiqueta}
          </span>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="text-ink/50 mt-1.5 text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
