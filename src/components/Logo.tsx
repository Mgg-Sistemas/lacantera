import { cn } from '@/lib/cn'

interface LogoProps {
  className?: string
  /** Oculta el texto y deja solo la marca. Para el sidebar colapsado. */
  markOnly?: boolean
  /** Invierte el texto para fondos oscuros. */
  inverted?: boolean
}

/**
 * Pico y macizo.
 *
 * Un pico clavado en el bloque: la piedra es el material y el pico, en el
 * amarillo de seguridad, la herramienta. Va DETRÁS de la roca a propósito —
 * puesto delante, la piedra le tapa media cabeza y el conjunto se lee como un
 * gancho; detrás, asoma la cabeza entera y el mango se pierde dentro.
 *
 * La geometría vive también en src/lib/ficha/marca.ts, que es la que sabe
 * pintarla en un lienzo para el carnet y en el PDF. Si se toca una, se toca la
 * otra: son el mismo dibujo en dos idiomas.
 */
export function Logo({ className, markOnly = false, inverted = false }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="size-8 shrink-0"
        aria-hidden="true"
      >
        <g transform="translate(33.4 22.6) rotate(-18) scale(.62)" fill="#F0A128">
          <path
            d="M-22 -12 C-15 -22 -7 -26 0 -26 C7 -26 15 -22 22 -12
               L17.5 -10 C11.5 -17.5 5.5 -20.5 0 -20.5 C-5.5 -20.5 -11.5 -17.5 -17.5 -10 Z"
          />
          <path d="M-3 -23 h6 v40 a3 3 0 0 1 -6 0 Z" />
        </g>
        <path d="M9 45 L13 27 L26 19 L41 18 L55 29 L56 47 L37 58 L17 55 Z" fill="#1D358F" />
        <path d="M14.5 28 L26.5 20.5 L40 19.5 L45 30 L26 37 Z" fill="#92A9FC" />
        <path d="M46.5 31 L54.5 31.5 L55 46 L38.5 56.5 L36.5 39.5 Z" fill="#2B4FD9" />
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
