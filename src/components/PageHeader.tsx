import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  /** Una línea que sitúa la pantalla. No repite el título. */
  description?: string
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 py-6">
      <div className="min-w-0">
        <h1 className="text-ink/90 text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-ink/55 mt-1 text-base">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  )
}
