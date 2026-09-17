import type { ReactNode } from 'react'
import { alternarAyuda, useAyudaVisible } from '@/lib/ayuda'
import { cn } from '@/lib/cn'

/** Un texto de ayuda: desaparece cuando el «(?)» de la cabecera está apagado. */
export function Ayuda({ children }: { children: ReactNode }) {
  return useAyudaVisible() ? <>{children}</> : null
}

/** El interruptor de todas las ayudas del sistema. */
export function BotonAyuda() {
  const visible = useAyudaVisible()
  const rotulo = visible ? 'Ocultar la ayuda' : 'Mostrar la ayuda'
  return (
    <button
      type="button"
      onClick={alternarAyuda}
      aria-pressed={visible}
      aria-label={rotulo}
      title={rotulo}
      className={cn(
        'border-royal-600/70 h-10 shrink-0 rounded-xl border px-3 font-mono text-base transition-colors',
        visible
          ? 'bg-royal-600/10 text-royal-700 dark:text-royal-300'
          : 'text-ink/60 hover:bg-ink/4 hover:text-ink/85',
      )}
    >
      (?)
    </button>
  )
}
