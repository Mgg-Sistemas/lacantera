import { useState } from 'react'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { subunidadDe } from '@/lib/subunidad'

/*
  LA CANTIDAD DE UN VÍVER, EN SU UNIDAD O EN LA SUBDIVISIÓN DE SIEMPRE.

  Christopher, 19/10/2026: «necesito en la opción de cantidad a especificar
  cuantos gramos, kilos, etc se usaron... ahorita solo se puede poner
  completo». Lo que sale de aquí SIEMPRE está en la unidad del víver —la
  misma que entiende `servir_comida`—: esto solo deja teclear en gramos o
  mililitros cuando el kilo o el litro entero es demasiado grande para lo
  que se gastó, y enseña la cuenta mientras se teclea, nunca en silencio
  (la misma regla de `CantidadDeArticulo` con los bultos y de
  `ConversionDeCantidad` con m³ y toneladas).

  Un víver sin subdivisión posible —UND, TON, GAL…— no enseña selector: es
  el campo de siempre.
*/

interface Props {
  /** La unidad del víver, tal cual la trae el catálogo: 'KG', 'L', 'UND'… */
  unidad: string
  /** Siempre en esa unidad: lo que viaja a `servir_comida`. */
  valor: string
  onCambiar: (enUnidadBase: string) => void
  /** 'campo': con rótulo, para el formulario de escritorio. 'compacta': sin rótulo, para la fila del teléfono. */
  variante?: 'campo' | 'compacta'
  /** Mensaje de error bajo el campo. Solo se enseña en la variante 'campo'. */
  error?: string
  /** El borde en rojo, sin texto: para la variante 'compacta', donde el aviso ya va en la fila. */
  resaltar?: boolean
  disabled?: boolean
  className?: string
}

export function CampoCantidadDeViver({
  unidad,
  valor,
  onCambiar,
  variante = 'campo',
  error,
  resaltar,
  disabled,
  className,
}: Props) {
  const sub = subunidadDe(unidad)
  const [enSub, setEnSub] = useState(false)
  const [tecleado, setTecleado] = useState('')

  const escribirSub = (crudo: string) => {
    setTecleado(crudo)
    const n = Number(crudo)
    onCambiar(crudo === '' ? '' : Number.isFinite(n) ? String(n / sub!.factor) : '')
  }

  const activarSub = () => {
    const n = Number(valor)
    setTecleado(valor !== '' && Number.isFinite(n) ? String(Number((n * sub!.factor).toFixed(4))) : '')
    setEnSub(true)
  }

  const campo =
    variante === 'campo' ? (
      <Input
        label="Cantidad"
        type="number"
        min="0.001"
        step="0.001"
        inputMode="decimal"
        disabled={disabled}
        value={enSub ? tecleado : valor}
        onChange={(e) => (enSub ? escribirSub(e.target.value) : onCambiar(e.target.value))}
        error={error}
      />
    ) : (
      <input
        type="number"
        min="0"
        step="0.001"
        inputMode="decimal"
        placeholder="0"
        disabled={disabled}
        value={enSub ? tecleado : valor}
        onChange={(e) => (enSub ? escribirSub(e.target.value) : onCambiar(e.target.value))}
        className={cn(
          'border-hairline bg-surface tabular h-10 w-full rounded-[8px] border px-2 text-right text-sm',
          resaltar && 'border-danger',
        )}
      />
    )

  if (!sub) return <div className={className}>{campo}</div>

  const equivale =
    enSub && valor !== '' && Number.isFinite(Number(valor))
      ? `= ${Number(valor).toLocaleString('es-VE', { maximumFractionDigits: 4 })} ${unidad}`
      : null

  return (
    <div className={className}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-1.5">
        {campo}
        <label className={variante === 'compacta' ? 'self-center' : undefined}>
          <span className="sr-only">En qué se teclea la cantidad</span>
          <select
            disabled={disabled}
            value={enSub ? 'SUB' : 'BASE'}
            onChange={(e) => (e.target.value === 'SUB' ? activarSub() : setEnSub(false))}
            className={cn(
              'bg-surface text-ink/90 border-ink/20 hover:border-ink/32 focus:border-royal-600 focus:ring-royal-600/20 h-10 appearance-none border pr-6 pl-2 text-xs transition-[border-color,box-shadow] duration-150 focus:ring-2 focus:outline-none',
              variante === 'campo' ? 'rounded-control' : 'rounded-[8px]',
            )}
          >
            <option value="BASE">{unidad}</option>
            <option value="SUB">{sub.nombre}</option>
          </select>
        </label>
      </div>
      {equivale ? <p className="text-royal-600 dark:text-royal-300 tabular mt-1 text-xs">{equivale}</p> : null}
    </div>
  )
}
