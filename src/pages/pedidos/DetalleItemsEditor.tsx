import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { DetalleServicioItem } from '@/lib/api/pedidos'
import { sumaDetallePrecios } from '@/lib/servicios'

/*
  «▸ DETALLE (OPCIONAL)» DE UN RENGLÓN DE SERVICIO (MGG `DetalleItemsEditor`)

  Las piezas a reparar o los trabajos de un renglón: descripción, cantidad y
  precio, los tres opcionales salvo la descripción. Si las piezas llevan
  precio, su suma es el precio del renglón. Lo usan el Nuevo servicio y el
  Servicio directo, y sale en el PDF.
*/

const CAMPO = 'rounded-control border-ink/20 bg-surface h-9 w-full min-w-0 border px-2 text-sm'

export function DetalleItemsEditor({
  value,
  onChange,
}: {
  value: DetalleServicioItem[]
  onChange: (v: DetalleServicioItem[]) => void
}) {
  const items = value ?? []
  const [abierto, setAbierto] = useState(items.length > 0)
  const subtotal = sumaDetallePrecios(items)

  const setItem = (i: number, patch: Partial<DetalleServicioItem>) =>
    onChange(items.map((it, k) => (k === i ? { ...it, ...patch } : it)))
  const add = () => {
    onChange([...items, { descripcion: '', cantidad: null }])
    setAbierto(true)
  }
  const numeroONulo = (v: string): number | null => (v === '' ? null : Number(v.replace(',', '.')))

  return (
    <div className="mt-2">
      <Button
        size="sm"
        variant="ghost"
        title="Detallar las piezas / trabajos de este renglón (opcional)"
        onClick={() => (!abierto && items.length === 0 ? add() : setAbierto((v) => !v))}
      >
        {abierto ? '▾' : '▸'} Detalle {items.length > 0 ? `(${items.length})` : '(opcional)'}
      </Button>

      {abierto ? (
        <div className="border-hairline mt-1.5 border-l-2 pl-2">
          {items.length === 0 ? (
            <p className="text-ink/50 mb-1.5 text-xs">Sin detalle. Agregá las piezas o trabajos (ej. “pastillas de freno delanteras”).</p>
          ) : null}
          {items.map((it, i) => (
            <div key={i} className="mb-1.5 grid grid-cols-[1fr_4.5rem_5.5rem_2rem] gap-1.5">
              <input
                className={CAMPO}
                placeholder="Pieza / reparación / trabajo"
                aria-label="Pieza / reparación / trabajo"
                value={it.descripcion}
                onChange={(e) => setItem(i, { descripcion: e.target.value })}
              />
              <input
                className={`${CAMPO} text-right`}
                type="number"
                min={0}
                step="any"
                placeholder="Cant."
                aria-label="Cantidad"
                value={it.cantidad ?? ''}
                onChange={(e) => setItem(i, { cantidad: numeroONulo(e.target.value) })}
              />
              <input
                className={`${CAMPO} text-right font-mono`}
                type="number"
                min={0}
                step="any"
                placeholder="Precio"
                aria-label="Precio"
                title="Precio de esta pieza / trabajo (opcional). La suma alimenta el precio de la línea."
                value={it.precio ?? ''}
                onChange={(e) => setItem(i, { precio: numeroONulo(e.target.value) })}
              />
              <button
                type="button"
                className="text-danger hover:bg-danger/10 rounded text-sm"
                title="Quitar"
                aria-label="Quitar"
                onClick={() => onChange(items.filter((_, k) => k !== i))}
              >
                ✕
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <Button size="sm" variant="ghost" onClick={add}>
              + Agregar ítem
            </Button>
            {subtotal > 0 ? (
              <span className="text-ink/55 text-xs">
                Subtotal detalle:{' '}
                <strong className="font-mono">
                  {subtotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
