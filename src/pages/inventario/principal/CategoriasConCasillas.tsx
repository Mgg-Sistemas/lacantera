import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

/*
  CATEGORÍAS CON CASILLAS (el `MultiCheckFiltro` de MGG).

  Varias a la vez; vacío = todas. El panel se abre debajo del botón y se cierra
  al tocar fuera. Vive aparte desde el 08/11/2026: la usan la pantalla
  principal y «Exportar inventario».
*/
export function CategoriasConCasillas({
  opciones,
  seleccionadas,
  onCambio,
}: {
  opciones: { valor: string; etiqueta: string }[]
  seleccionadas: string[]
  onCambio: (v: string[]) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const rotulo =
    seleccionadas.length === 0
      ? 'Todas las categorías'
      : seleccionadas.length === 1
        ? (opciones.find((o) => o.valor === seleccionadas[0])?.etiqueta ?? seleccionadas[0])
        : `${seleccionadas.length} categorías`

  return (
    <div ref={caja} className="relative w-full min-w-0">
      <p className="text-ink/75 mb-1.5 block text-sm font-medium">Categoría</p>
      <button
        type="button"
        title="Marcá una o varias categorías"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="rounded-control bg-surface text-ink/90 border-ink/20 hover:border-ink/32 relative h-10 w-full truncate border pr-9 pl-3.5 text-left text-base"
      >
        {rotulo}
        <ChevronDown className="text-ink/40 pointer-events-none absolute inset-y-0 right-3 my-auto size-[18px]" />
      </button>
      {abierto ? (
        <div className="bg-surface shadow-card border-ink/12 rounded-control absolute left-0 z-20 mt-1 max-h-72 w-full min-w-[14rem] overflow-y-auto border p-2">
          <p className="text-ink/50 px-2 pb-1 text-xs">Marcá una o varias categorías</p>
          {opciones.map((o) => (
            <label
              key={o.valor}
              className="hover:bg-ink/4 flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm"
            >
              <input
                type="checkbox"
                checked={seleccionadas.includes(o.valor)}
                onChange={(e) =>
                  onCambio(
                    e.target.checked
                      ? [...seleccionadas, o.valor]
                      : seleccionadas.filter((v) => v !== o.valor),
                  )
                }
              />
              <span className="text-ink/85">{o.etiqueta}</span>
            </label>
          ))}
          {seleccionadas.length > 0 ? (
            <button
              type="button"
              onClick={() => onCambio([])}
              className="text-royal-600 dark:text-royal-300 mt-1 px-2 text-xs font-medium underline"
            >
              Todas las categorías
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
