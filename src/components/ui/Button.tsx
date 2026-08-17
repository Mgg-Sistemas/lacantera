import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { sonarPulsar } from '@/lib/sonido'

type Variant = 'primary' | 'soft' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  // La sombra teñida de azul bajo el botón primario es un gesto de Materio:
  // levanta la acción principal sin subir su saturación.
  primary:
    'bg-royal-600 text-white shadow-primary hover:bg-royal-700 active:bg-royal-800 disabled:bg-royal-600/50 disabled:shadow-none',
  soft: 'bg-royal-600/10 text-royal-700 dark:text-royal-300 hover:bg-royal-600/16 active:bg-royal-600/24',
  outline:
    'border border-ink/20 bg-transparent text-ink/80 hover:border-ink/32 hover:bg-ink/4 active:bg-ink/8',
  ghost: 'bg-transparent text-ink/70 hover:bg-ink/6 hover:text-ink/90 active:bg-ink/10',
  danger: 'bg-danger text-white hover:brightness-95 active:brightness-90',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-3 text-sm',
  md: 'h-10 gap-2 px-[18px] text-base',
  lg: 'h-12 gap-2 px-6 text-base',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  block?: boolean
  /** Icono a la izquierda del texto. */
  icon?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  icon,
  className,
  children,
  type = 'button',
  onClick,
  ...rest
}: ButtonProps) {
  /*
    Acuse de recibo: se hunde y suena.

    El hundido va en `transform` y no en tamaño ni en margen, que moverían lo
    que hay alrededor; aquí solo se encoge el botón y nada más se entera. Y va
    bajo `motion-safe`: con movimiento reducido la transición dura cero, así
    que la escala daría un salto en vez de un gesto — peor que no tenerla.

    El sonido va aquí y no en cada pantalla porque si no, en 53 archivos habría
    53 criterios distintos sobre cuándo suena algo. Respeta el mismo silencio
    que los avisos: un solo interruptor apaga el sistema entero.

    Se llama antes de `onClick` a propósito. Si el manejador navega o lanza,
    el sonido ya salió: el acuse de recibo no puede depender de que la acción
    termine bien.
  */
  const alPulsar = (e: MouseEvent<HTMLButtonElement>) => {
    sonarPulsar()
    onClick?.(e)
  }

  return (
    <button
      type={type}
      onClick={alPulsar}
      className={cn(
        'rounded-control inline-flex items-center justify-center font-medium',
        // `scale` y no `transform`: Tailwind 4 compila `scale-[0.97]` a la
        // propiedad independiente `scale`, así que una transición sobre
        // `transform` no la alcanza y el hundido daría un salto seco. Se ve
        // igual en el navegador — solo que sin suavizar.
        'transition-[color,background-color,border-color,scale,box-shadow] duration-150',
        'motion-safe:active:scale-[0.97]',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {icon ? <span className="shrink-0 [&>svg]:size-[18px]">{icon}</span> : null}
      {children}
    </button>
  )
}
