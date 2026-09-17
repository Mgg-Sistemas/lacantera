import { Input } from '@/components/ui/Input'
import { useAlicuotaIva, useEmpresa } from '@/lib/api/empresa'
import { cn } from '@/lib/cn'

/**
 * Si esta operación lleva IVA, y a qué alícuota.
 *
 * UNA CASILLA, Y EL PORCENTAJE SE PUEDE CAMBIAR
 *
 * Empezó siendo solo la casilla, con un argumento: en Venezuela la alícuota
 * general es una, y quien emite no la decide, la aplica o no. Christopher,
 * 17/09/2026: «el IVA debe ser configurable desde el formulario», y «el usuario
 * debe tener por defecto 16 %, pero debe poder manipular el porcentaje». Así
 * que la casilla sigue diciendo sí o no, y cuando es sí se ve el porcentaje, que
 * arranca en el de la ficha de la empresa —16 si la ficha no lo dice— y se
 * cambia en ese documento sin tocar la ficha.
 *
 * LLEGA MARCADA SEGÚN LO QUE DIGA LA EMPRESA
 *
 * «Por operación» no puede querer decir «hay que acordarse en cada una». Una
 * empresa está o no está en el régimen, y eso no cambia de una venta a otra;
 * lo que cambia es el caso particular. Así que la casilla arranca del valor de
 * la ficha de la empresa y quien emite la cambia cuando toca.
 */
export function CasillaIva({
  aplica,
  onCambiar,
  alicuota,
  onAlicuota,
  className,
}: {
  aplica: boolean
  onCambiar: (aplica: boolean) => void
  /** El porcentaje escrito. Si no se pasa, el de la ficha de la empresa. */
  alicuota?: string
  /** Con él, el porcentaje se puede cambiar en este documento. */
  onAlicuota?: (valor: string) => void
  className?: string
}) {
  const { data: empresa } = useEmpresa()
  const vigente = useAlicuotaIva()
  const porDefecto = empresa?.aplica_iva ?? true
  const escrito = alicuota ?? String(vigente)
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
            <span className="text-ink/85 text-sm font-medium">
              Esta operación lleva IVA{onAlicuota ? '' : ` (${escrito}%)`}
            </span>
            <span className="text-ink/50 mt-0.5 block text-xs leading-relaxed">
              {aplica === porDefecto
                ? 'Es lo habitual según la ficha de la empresa.'
                : porDefecto
                  ? 'La empresa cobra IVA por defecto: esta operación va sin él.'
                  : 'La empresa no cobra IVA por defecto: esta operación sí lo lleva.'}
            </span>
          </span>
        </label>

        {onAlicuota && aplica ? (
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
            hint={Number(escrito) === vigente ? 'La de la empresa.' : `La de la empresa es ${vigente} %.`}
          />
        ) : null}
      </div>
    </div>
  )
}
