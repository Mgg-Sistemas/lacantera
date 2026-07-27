import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { IconTile } from '@/components/ui/IconTile'
import { cn } from '@/lib/cn'

interface StatCardProps {
  label: string
  value: string
  icon: ReactNode
  tone?: 'royal' | 'success' | 'warning' | 'danger' | 'info' | 'safety'
  /** Variación respecto al periodo anterior, en puntos porcentuales. */
  delta?: number
  /** Contra qué se compara. Sin esto, un porcentaje no dice nada. */
  deltaLabel?: string
  /** Cuando subir es malo — mermas, cuentas por pagar — invierte el color. */
  invertDelta?: boolean
}

export function StatCard({
  label,
  value,
  icon,
  tone = 'royal',
  delta,
  deltaLabel,
  invertDelta = false,
}: StatCardProps) {
  const subio = (delta ?? 0) >= 0
  const esBueno = invertDelta ? !subio : subio

  return (
    <Card className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-ink/55 truncate text-sm">{label}</p>
        <p className="text-ink/90 tabular mt-1.5 text-3xl font-semibold tracking-tight">
          {value}
        </p>

        {delta !== undefined ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-semibold',
                esBueno ? 'text-success' : 'text-danger',
              )}
            >
              {subio ? (
                <ArrowUpRight className="size-3.5" />
              ) : (
                <ArrowDownRight className="size-3.5" />
              )}
              {Math.abs(delta).toLocaleString('es-VE', { maximumFractionDigits: 1 })}%
            </span>
            {deltaLabel ? <span className="text-ink/45">{deltaLabel}</span> : null}
          </p>
        ) : null}
      </div>

      <IconTile tone={tone} size="lg">
        {icon}
      </IconTile>
    </Card>
  )
}
