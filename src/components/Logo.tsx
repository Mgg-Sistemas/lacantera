import { cn } from '@/lib/cn'

interface LogoProps {
  className?: string
  /** Oculta el texto y deja solo la marca. Para el sidebar colapsado. */
  markOnly?: boolean
  /** Invierte el texto para fondos oscuros. */
  inverted?: boolean
}

/**
 * La marca es un bloque de roca fracturado: tres planos que salen de un mismo
 * cuerpo. Es lo que hace una cantera — separar un macizo en fracciones.
 */
export function Logo({ className, markOnly = false, inverted = false }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="size-8 shrink-0"
        aria-hidden="true"
      >
        <path d="M16 2 L30 11 L24 15 L16 10 Z" fill="#3B62F0" />
        <path d="M16 2 L2 11 L8 15 L16 10 Z" fill="#2B4FD9" />
        <path d="M2 11 L2 22 L16 30 L16 18 Z" fill="#1D358F" />
        <path d="M30 11 L30 22 L16 30 L16 18 Z" fill="#2340B4" />
        <path d="M8 15 L16 10 L24 15 L16 18 Z" fill="#92A9FC" />
      </svg>

      {!markOnly && (
        <span
          className={cn(
            'text-[17px] leading-none font-semibold tracking-tight',
            inverted ? 'text-white' : 'text-ink/90',
          )}
        >
          La Cantera
        </span>
      )}
    </span>
  )
}
