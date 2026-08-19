import { useEmpresa } from '@/lib/api/empresa'
import { cn } from '@/lib/cn'

/**
 * Si esta operación lleva IVA.
 *
 * POR QUÉ ES UNA CASILLA Y NO UN CAMPO DE ALÍCUOTA
 *
 * La alícuota se guarda por documento y podría escribirse a mano. Pero la
 * pregunta real no es «cuánto», es «sí o no»: en Venezuela la alícuota general
 * es una, y quien emite no la está decidiendo — la aplica o no la aplica. Un
 * campo numérico abierto invita a escribir un 16 mal tecleado, que es un error
 * que no se ve hasta que alguien cuadra el libro.
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
  alicuota = 16,
  className,
}: {
  aplica: boolean
  onCambiar: (aplica: boolean) => void
  alicuota?: number
  className?: string
}) {
  const { data: empresa } = useEmpresa()
  const porDefecto = empresa?.aplica_iva ?? true

  return (
    <div className={cn('border-hairline rounded-[6px] border p-3', className)}>
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={aplica}
          onChange={(e) => onCambiar(e.target.checked)}
          className="accent-royal-600 mt-0.5 size-4 shrink-0"
        />
        <span>
          <span className="text-ink/85 text-sm font-medium">
            Esta operación lleva IVA ({alicuota}%)
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
    </div>
  )
}
