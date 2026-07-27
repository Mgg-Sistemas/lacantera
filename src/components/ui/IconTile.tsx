import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'royal' | 'success' | 'warning' | 'danger' | 'info' | 'safety'

const tones: Record<Tone, string> = {
  royal: 'bg-royal-600/12 text-royal-600',
  success: 'bg-success/14 text-success',
  warning: 'bg-warning/16 text-warning',
  danger: 'bg-danger/12 text-danger',
  info: 'bg-info/14 text-info',
  safety: 'bg-safety/16 text-safety',
}

const sizes = {
  sm: 'size-9 [&>svg]:size-[18px]',
  md: 'size-11 [&>svg]:size-5',
  lg: 'size-14 [&>svg]:size-6',
}

interface IconTileProps {
  tone?: Tone
  size?: keyof typeof sizes
  children: ReactNode
  className?: string
}

/** Cuadro redondeado con el icono sobre su color al 12-16%. */
export function IconTile({ tone = 'royal', size = 'md', children, className }: IconTileProps) {
  return (
    <span
      className={cn(
        'rounded-control inline-flex shrink-0 items-center justify-center',
        tones[tone],
        sizes[size],
        className,
      )}
    >
      {children}
    </span>
  )
}
