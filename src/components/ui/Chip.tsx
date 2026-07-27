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
  neutral: 'bg-ink/8 text-ink/65',
  safety: 'bg-safety/16 text-safety',
}

interface ChipProps {
  tone?: Tone
  children: ReactNode
  icon?: ReactNode
  className?: string
}

export function Chip({ tone = 'neutral', children, icon, className }: ChipProps) {
  return (
    <span
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
