import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'royal' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'safety'

/**
 * Variante "soft": texto del color sobre el mismo color al 12-16%.
 * Es lo que permite meter seis estados en una tabla sin que grite ninguno.
 */
const tones: Record<Tone, string> = {
  royal: 'bg-royal-600/12 text-royal-700 dark:text-royal-300',
  success: 'bg-success/14 text-success',
  warning: 'bg-warning/16 text-warning',
  danger: 'bg-danger/12 text-danger',
  info: 'bg-info/14 text-info',
  /*
    EL NEUTRO PESA DISTINTO EN CADA TEMA, Y POR ESO LLEVA DOS VALORES.

    `bg-ink/8` en claro es un gris tenue —la tinta es oscura y apenas tiñe—,
    pero en oscuro la tinta es crema, asi que el mismo 8 % ACLARA la pastilla
    sobre la tarjeta. El resultado era que el chip neutro, que es el que menos
    importa, se leia como el mas fuerte de la fila: en una cotizacion,
    «Llega antes» gritaba mas que «Mas economica».

    En oscuro se baja del 8 % al 3 % y el texto al 55 %. Se probaron seis
    valores en pantalla, uno al lado del otro: al 4 % la pastilla todavia
    pesaba mas que las de color, y sin fondo dejaba de parecer un chip. El 55 %
    del texto no es redondeo — al 50 % se queda en 4,48:1 sobre la tarjeta
    oscura, por debajo del minimo para un cuerpo de 12 px.
  */
  neutral: 'bg-ink/8 text-ink/65 dark:bg-ink/[0.03] dark:text-ink/55',
  safety: 'bg-safety/16 text-safety',
}

interface ChipProps {
  tone?: Tone
  children: ReactNode
  icon?: ReactNode
  className?: string
  /** Lo que la etiqueta no alcanza a decir. Un chip cabe en dos palabras. */
  title?: string
}

export function Chip({ tone = 'neutral', children, icon, className, title }: ChipProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {icon ? <span className="[&>svg]:size-3.5">{icon}</span> : null}
      {children}
    </span>
  )
}
