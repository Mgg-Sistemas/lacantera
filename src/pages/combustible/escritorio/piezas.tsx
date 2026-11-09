import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

const CLASE_MINI =
  'border-ink/20 bg-surface text-ink/85 rounded-control h-8 border px-2 text-sm focus:border-royal-600 focus:ring-royal-600/20 focus:ring-2 focus:outline-none'

/** El selector chico de las barras de filtros. */
export function MiniSelect({
  value,
  onChange,
  opciones,
  className,
  title,
}: {
  value: string
  onChange: (v: string) => void
  opciones: { valor: string; etiqueta: string }[]
  className?: string
  title?: string
}) {
  return (
    <select title={title} value={value} onChange={(e) => onChange(e.target.value)} className={cn(CLASE_MINI, 'max-w-48', className)}>
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.etiqueta}
        </option>
      ))}
    </select>
  )
}

/** El campo chico de las barras de filtros (búsqueda, fechas). */
export function MiniInput({
  value,
  onChange,
  type = 'text',
  placeholder,
  className,
}: {
  value: string
  onChange: (v: string) => void
  type?: 'text' | 'search' | 'date'
  placeholder?: string
  className?: string
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(CLASE_MINI, className)}
    />
  )
}

/** La barra de nivel de la tarjeta: roja por debajo del 12 %. */
export function BarraNivel({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, pct))
  return (
    <div className="bg-ink/8 my-2 h-[7px] overflow-hidden rounded-full">
      <div className={cn('h-full rounded-full', p < 12 ? 'bg-danger' : 'bg-royal-600')} style={{ width: `${p}%` }} />
    </div>
  )
}

/** Una cifra con su rótulo, para los resúmenes de arriba de cada modal. */
export function Cifra({
  rotulo,
  valor,
  className,
  tono,
}: {
  rotulo: string
  valor: ReactNode
  className?: string
  tono?: 'success' | 'danger' | 'warning' | 'info' | 'royal'
}) {
  const color = {
    success: 'text-success',
    danger: 'text-danger',
    warning: 'text-warning',
    info: 'text-info',
    royal: 'text-royal-700 dark:text-royal-300',
  }
  return (
    <div className={cn('border-hairline bg-canvas rounded-lg border px-3 py-2', className)}>
      <p className="text-ink/50 text-2xs font-medium tracking-wide uppercase">{rotulo}</p>
      <p className={cn('tabular text-ink/90 mt-0.5 text-lg font-semibold', tono && color[tono])}>{valor}</p>
    </div>
  )
}

/** Fila «etiqueta ……… valor» del detalle. */
export function Fila({ k, v, realce }: { k: string; v: ReactNode; realce?: boolean }) {
  return (
    <div className="border-hairline flex justify-between gap-4 border-b py-1.5 text-sm">
      <span className="text-ink/55">{k}</span>
      <span className={cn('tabular text-right', realce ? 'text-warning font-semibold' : 'text-ink/85')}>{v}</span>
    </div>
  )
}

/** Un campo calculado (HRS, litros por contador): no se escribe, se lee. */
export function Calculado({ label, valor, pista }: { label: string; valor: string; pista?: string }) {
  return (
    <div>
      <p className="text-ink/70 mb-1.5 text-sm font-medium">{label}</p>
      <div className="border-warning/40 bg-warning-soft text-ink/90 tabular rounded-control flex h-10 items-center border px-3 text-sm font-semibold">
        {valor || <span className="text-ink/40 font-normal">se calcula solo</span>}
      </div>
      {pista ? <p className="text-ink/50 mt-1 text-xs">{pista}</p> : null}
    </div>
  )
}

/** Botón de pastilla de los filtros de Golden Touch (presets, agrupación…). */
export function Pastilla({
  activa,
  onClick,
  children,
  title,
}: {
  activa: boolean
  onClick: () => void
  children: ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        activa
          ? 'border-royal-600 bg-royal-600 text-white'
          : 'border-hairline text-ink/70 hover:bg-ink/5 bg-transparent',
      )}
    >
      {children}
    </button>
  )
}
