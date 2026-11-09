import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/*
  LAS PIEZAS DEL SURTIDOR DEL TELÉFONO.

  Las de `src/styles/surtidor.css` de Golden Touch (`surt-btn`, `surt-campo`,
  `surt-tanque`, `aviso`…) con los tokens de La Cantera, así que el tema claro
  y el oscuro salen solos. La regla de allá se respeta: nada que se toque mide
  menos de 56 px de alto; se usa con una mano, al lado del tanque, con guantes
  o con el sol encima.
*/

type Tono = 'primario' | 'neutro' | 'entrada'

const TONOS: Record<Tono, string> = {
  primario: 'border-royal-600 bg-royal-600/10',
  neutro: 'border-ink/25 bg-surface',
  entrada: 'border-success bg-success-soft',
}

/** `surt-btn` de Golden Touch: icono grande, título y una línea chica. */
export function BotonSurtidor({
  tono = 'neutro',
  icono,
  titulo,
  sub,
  className,
  disabled,
  onClick,
}: {
  tono?: Tono
  icono: string
  titulo: string
  sub: string
  className?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-card text-ink/90 flex min-h-[118px] w-full flex-col items-center justify-center gap-1 border-2 px-3 py-4 text-center',
        'transition-[filter,scale] motion-safe:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45',
        TONOS[tono],
        className,
      )}
    >
      <span className="text-[2.3rem] leading-none" aria-hidden>
        {icono}
      </span>
      <span className="text-xl font-bold">{titulo}</span>
      <small className="text-ink/55 text-sm leading-snug font-normal">{sub}</small>
    </button>
  )
}

/** `surt-rotulo`: la etiqueta chica en mayúscula sobre un bloque. */
export function Rotulo({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-ink/55 mt-2 mb-1.5 text-xs font-bold tracking-[0.06em] uppercase', className)}>
      {children}
    </p>
  )
}

/**
 * `surt-campo`: los campos de La Cantera a 56 px de alto y letra más grande.
 * Envuelve un `Input`, un `Select` o un `SelectBuscable` sin tocarlos.
 */
export function CampoGrande({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        '[&_input]:h-14 [&_input]:text-[1.05rem] [&_select]:h-14 [&_select]:text-[1.05rem]',
        '[&_button[id]]:h-14 [&_button[id]]:text-[1.05rem]',
        '[&_label]:text-ink/60 [&_label]:text-xs [&_label]:font-bold [&_label]:tracking-[0.05em] [&_label]:uppercase',
        className,
      )}
    >
      {children}
    </div>
  )
}

type TonoAviso = 'peligro' | 'alerta' | 'info'

const TONOS_AVISO: Record<TonoAviso, string> = {
  peligro: 'border-danger/40 bg-danger-soft',
  alerta: 'border-warning/40 bg-warning-soft',
  info: 'border-royal-600/30 bg-royal-600/8',
}

/** `aviso` de Golden Touch: icono a la izquierda y el texto. */
export function Aviso({
  tono,
  icono,
  children,
  className,
}: {
  tono: TonoAviso
  icono: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      role={tono === 'peligro' ? 'alert' : undefined}
      className={cn('rounded-card text-ink/85 flex gap-2.5 border p-3 text-sm leading-snug', TONOS_AVISO[tono], className)}
    >
      <span className="text-lg leading-none" aria-hidden>
        {icono}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** El «📖 Registro Cuaderno» de Golden Touch: una tarjeta entera que se enciende con el dedo. */
export function TarjetaCuaderno({
  encendido,
  onCambio,
  children,
}: {
  encendido: boolean
  onCambio: (v: boolean) => void
  /** Lo que se abre debajo cuando está encendida (cuántos litros). */
  children?: ReactNode
}) {
  return (
    <div>
      <button
        type="button"
        role="switch"
        aria-checked={encendido}
        onClick={() => onCambio(!encendido)}
        className={cn(
          'flex min-h-14 w-full items-center justify-between gap-3 border px-4 py-3 text-left transition-colors',
          encendido
            ? 'border-success/60 bg-success-soft rounded-t-card border-[1.5px]'
            : 'border-ink/20 bg-ink/4 rounded-card',
        )}
      >
        <span className="flex items-center gap-2.5">
          <span className="text-[1.35rem]" aria-hidden>
            📖
          </span>
          <span>
            <span className={cn('block font-bold', encendido ? 'text-success' : 'text-ink/85')}>
              Registro Cuaderno
            </span>
            <span className={cn('block text-xs', encendido ? 'text-success' : 'text-ink/50')}>
              {encendido ? 'Registrado' : 'No registrado'}
            </span>
          </span>
        </span>
        <span
          aria-hidden
          className={cn(
            'relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors',
            encendido ? 'bg-success' : 'bg-ink/25',
          )}
        >
          <span
            className={cn(
              'absolute top-[3px] size-5 rounded-full bg-white shadow-sm transition-all',
              encendido ? 'left-[23px]' : 'left-[3px]',
            )}
          />
        </span>
      </button>
      {encendido && children ? (
        <div className="border-success/60 rounded-b-card border-[1.5px] border-t-0 px-4 py-3">{children}</div>
      ) : null}
    </div>
  )
}

/** Una fila del detalle (`surt-fila`): la etiqueta a la izquierda, el dato a la derecha. */
export function Fila({ k, v }: { k: string; v: ReactNode }) {
  if (v == null || v === '' || v === false) return null
  return (
    <div className="border-hairline flex justify-between gap-4 border-b py-2 text-base">
      <span className="text-ink/55">{k}</span>
      <span className="text-ink/90 text-right font-semibold">{v}</span>
    </div>
  )
}
