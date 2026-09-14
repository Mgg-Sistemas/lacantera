import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'

/** Una cifra con su rótulo y su pie. Apagada cuando no se sabe; en alerta cuando duele. */
export function Cifra({
  rotulo,
  valor,
  pie,
  alerta,
  apagada,
  grande,
}: {
  rotulo: string
  valor: string
  pie: string
  alerta?: boolean
  apagada?: boolean
  grande?: boolean
}) {
  return (
    <Card className={cn(alerta ? 'border-danger/30' : undefined)}>
      <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">{rotulo}</p>
      <p
        className={cn(
          'tabular mt-3 font-light',
          grande ? 'text-3xl' : 'text-2xl',
          alerta ? 'text-danger' : apagada ? 'text-ink/30' : 'text-ink/90',
        )}
      >
        {valor}
      </p>
      <p className="text-ink/45 mt-2 text-xs">{pie}</p>
    </Card>
  )
}
