import { cn } from '@/lib/cn'

/*
  UN INTERRUPTOR

  Para lo que se enciende y se apaga sin guardar nada más: la firma que se
  prefiere no usar hoy y sí mañana. No sirve para elegir entre dos cosas —eso
  es un selector— ni para confirmar algo, que lleva botón.

  Va con `button` y `role="switch"` en vez de un checkbox maquillado: el lector
  de pantalla dice «activado / desactivado» en vez de «casilla marcada», que es
  lo que de verdad está pasando.
*/
export function Interruptor({
  encendido,
  onCambio,
  etiqueta,
  detalle,
  deshabilitado,
  className,
}: {
  encendido: boolean
  onCambio: (v: boolean) => void
  etiqueta: string
  detalle?: string
  deshabilitado?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <button
        type="button"
        role="switch"
        aria-checked={encendido}
        aria-label={etiqueta}
        disabled={deshabilitado}
        onClick={() => onCambio(!encendido)}
        className={cn(
          'relative mt-0.5 h-[22px] w-[38px] shrink-0 rounded-full transition-colors',
          'focus-visible:ring-royal-600/40 focus-visible:ring-2 focus-visible:outline-none',
          encendido ? 'bg-royal-600' : 'bg-ink/20',
          deshabilitado && 'cursor-not-allowed opacity-50',
        )}
      >
        <span
          className={cn(
            'absolute top-[3px] size-4 rounded-full bg-white shadow-sm transition-all',
            encendido ? 'left-[19px]' : 'left-[3px]',
          )}
        />
      </button>

      <div className="min-w-0">
        <p className="text-ink/80 text-sm">{etiqueta}</p>
        {detalle ? <p className="text-ink/45 mt-0.5 text-xs">{detalle}</p> : null}
      </div>
    </div>
  )
}
