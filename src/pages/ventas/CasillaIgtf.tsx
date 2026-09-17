import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { IGTF_POR_DEFECTO } from './ivaPorDefecto'

/**
 * Si esta operación lleva IGTF, y a qué alícuota.
 *
 * LA MISMA CASILLA QUE EL IVA. Christopher, 17/09/2026: «hay momentos donde no
 * solo es IVA, sino además o en cambio, IGTF (que debe ser igual de modificable
 * que el IVA)». Llega desmarcada, porque es el caso particular y no la regla, y
 * al marcarla el porcentaje arranca en el de ley y se cambia en este documento.
 *
 * Se calcula sobre el total con IVA: lo que grava es el pago en divisas, y lo
 * que se paga es el total.
 */
export function CasillaIgtf({
  aplica,
  onCambiar,
  alicuota,
  onAlicuota,
  className,
}: {
  aplica: boolean
  onCambiar: (aplica: boolean) => void
  /** El porcentaje escrito. Si no se pasa, el de ley. */
  alicuota?: string
  onAlicuota: (valor: string) => void
  className?: string
}) {
  const escrito = alicuota ?? String(IGTF_POR_DEFECTO)
  const n = Number(escrito.replace(',', '.'))
  const fueraDeRango = escrito.trim() === '' || !Number.isFinite(n) || n < 0 || n > 100

  return (
    <div className={cn('border-hairline rounded-[6px] border p-3', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={aplica}
            onChange={(e) => onCambiar(e.target.checked)}
            className="accent-royal-600 mt-0.5 size-4 shrink-0"
          />
          <span>
            <span className="text-ink/85 text-sm font-medium">Esta operación lleva IGTF</span>
            <span className="text-ink/50 mt-0.5 block text-xs leading-relaxed">
              {aplica
                ? 'Se calcula sobre el total con IVA.'
                : 'Márcala cuando el pago se haga en divisas y toque cobrarlo.'}
            </span>
          </span>
        </label>

        {aplica ? (
          <Input
            className="w-36"
            label="Alícuota (%)"
            type="number"
            min="0"
            max="100"
            step="0.01"
            inputMode="decimal"
            value={escrito}
            onChange={(e) => onAlicuota(e.target.value)}
            error={fueraDeRango ? 'Entre 0 y 100.' : undefined}
            hint={n === IGTF_POR_DEFECTO ? 'La de ley.' : `La de ley es ${IGTF_POR_DEFECTO} %.`}
          />
        ) : null}
      </div>
    </div>
  )
}
