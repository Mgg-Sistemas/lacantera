import { Link } from 'react-router'
import { AlertTriangle } from 'lucide-react'
import { useTasaVigente } from '@/lib/api/tasas'
import { tasa as formatearTasa } from '@/lib/formato'
import { cn } from '@/lib/cn'

/**
 * Con qué tasa se va a valorar esto.
 *
 * NO ES EL INDICADOR DE LA BARRA, Y LA DIFERENCIA IMPORTA
 *
 * Arriba, en la barra, va la tasa que el BCV publicó: se consulta a una fuente
 * pública, informa y no compromete a nada. Este chip muestra otra cosa — la
 * tasa registrada en el sistema, que es con la que de verdad se va a congelar
 * el documento que se está emitiendo.
 *
 * Las dos coinciden casi siempre, y por eso confundirlas es fácil y caro: el
 * día que el BCV publica y nadie la carga, la barra enseña la nueva y el
 * documento se valora con la de ayer. Quien mira arriba cree que está bien.
 * Este chip se pone donde se emite, no donde se navega, y dice la que manda.
 *
 * TRES ESTADOS, PORQUE HAY TRES SITUACIONES DISTINTAS
 *
 * Al día: se enseña y punto, sin adornos. Es lo normal y no debe llamar la
 * atención.
 *
 * Arrastrada: hay tasa, pero es de un día anterior. Se puede seguir —el
 * sistema no bloquea— pero avisa, porque lo que se emita queda valorado con
 * una tasa vieja y eso no se descubre hasta el cierre del mes.
 *
 * Sin ninguna: no se puede emitir nada valorado. Ahí el chip deja de informar y
 * se vuelve un enlace a la pantalla donde se arregla, porque avisar de un
 * problema sin decir dónde se resuelve solo sirve para molestar.
 */
export function ChipTasa({ className }: { className?: string }) {
  const { data, isPending } = useTasaVigente()

  if (isPending) {
    return (
      <span
        className={cn(
          'border-hairline bg-ink/5 inline-block h-6 w-40 animate-pulse rounded-full border',
          className,
        )}
        aria-hidden="true"
      />
    )
  }

  // Sin tasa registrada no se puede valorar nada, así que el chip lleva a
  // resolverlo en vez de limitarse a dar la mala noticia.
  if (!data) {
    return (
      <Link
        to="/app/tasas"
        className={cn(
          'border-danger/30 bg-danger-soft text-danger hover:border-danger/50 text-2xs inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium transition-colors',
          className,
        )}
      >
        <AlertTriangle className="size-3.5 shrink-0" />
        Sin tasa registrada — cárgala
      </Link>
    )
  }

  const arrastrada = data.arrastrada
  const fechaCorta = new Date(`${data.fecha}T12:00:00`).toLocaleDateString('es-VE', {
    day: 'numeric',
    month: 'short',
  })

  return (
    <span
      title={
        arrastrada
          ? `No hay tasa de hoy. Lo que se emita ahora se valora con la del ${fechaCorta}.`
          : 'Con esta tasa se valora lo que se emita hoy.'
      }
      className={cn(
        'text-2xs inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
        arrastrada
          ? 'border-warning/40 bg-warning-soft text-warning font-medium'
          : 'border-hairline bg-surface text-ink/60',
        className,
      )}
    >
      {arrastrada ? <AlertTriangle className="size-3.5 shrink-0" /> : null}
      <span className="text-ink/40">Se valora a</span>
      <span className={cn('tabular font-semibold', arrastrada ? 'text-warning' : 'text-ink/80')}>
        Bs {formatearTasa(Number(data.tasa))}
      </span>
      {arrastrada ? <span>· del {fechaCorta}</span> : null}
    </span>
  )
}
