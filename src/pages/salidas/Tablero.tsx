import { useState } from 'react'
import type { ReactNode } from 'react'
import { Vacio } from '@/components/ui/Estado'
import { cn } from '@/lib/cn'
import {
  TOPE_COLUMNA,
  guardarLista,
  leerLista,
  type ColumnaDeTablero,
  type TonoColumna,
} from './tableroSalidas'

/*
  EL TABLERO DE SALIDAS Y DE TRASLADOS (MGG `SolicitudesKanban`), 08/11/2026.

  Lo mismo que MGG, con las piezas de La Cantera:
    - arriba, la fila de chips «Mostrar»: uno por columna con su color y su
      conteo; un clic la oculta o la vuelve a enseñar, y se recuerda en el
      navegador. Con alguna oculta aparece «✕ Mostrar todas»;
    - cada columna enseña las 10 últimas (`TOPE_COLUMNA`) y, si hay más, al
      pie «📚 Ver las N anteriores», que abre el Histórico ya filtrado;
    - cada columna tiene su propio desplazamiento vertical, y el tablero el
      suyo horizontal: en un teléfono se recorre de lado sin mover la página.
*/

const PUNTO: Record<TonoColumna, string> = {
  warning: 'bg-warning',
  royal: 'bg-royal-600',
  success: 'bg-success',
  danger: 'bg-danger',
  neutral: 'bg-ink/30',
}

const CONTADOR: Record<TonoColumna, string> = {
  warning: 'bg-warning/16 text-warning',
  royal: 'bg-royal-600/12 text-royal-700 dark:text-royal-300',
  success: 'bg-success/14 text-success',
  danger: 'bg-danger/12 text-danger',
  neutral: 'bg-ink/8 text-ink/65',
}

export function Tablero<T>({
  items,
  columnas,
  claveLocal,
  claveDe,
  tarjeta,
  onVerAnteriores,
  vacio,
}: {
  items: T[]
  columnas: ColumnaDeTablero<T>[]
  /** Dónde se recuerdan las columnas ocultas (localStorage). */
  claveLocal: string
  claveDe: (x: T) => string | number
  tarjeta: (x: T) => ReactNode
  onVerAnteriores: (columna: string) => void
  vacio: string
}) {
  const [ocultas, setOcultas] = useState<string[]>(() =>
    leerLista(
      claveLocal,
      columnas.map((c) => c.clave),
    ),
  )
  const alternar = (clave: string) =>
    setOcultas((prev) => {
      const next = prev.includes(clave) ? prev.filter((k) => k !== clave) : [...prev, clave]
      guardarLista(claveLocal, next)
      return next
    })
  const mostrarTodas = () => {
    setOcultas([])
    guardarLista(claveLocal, [])
  }

  const visibles = columnas.filter((c) => !ocultas.includes(c.clave))

  return (
    <div>
      {/*
        El conteo se ve aunque la columna esté oculta, para no perder de vista
        lo pendiente; cada chip lleva el color de su columna (MGG).
      */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="text-ink/50 mr-1 text-xs font-medium">Mostrar</span>
        {columnas.map((col) => {
          const activa = !ocultas.includes(col.clave)
          const n = items.filter(col.coincide).length
          return (
            <button
              key={col.clave}
              type="button"
              aria-pressed={activa}
              title={activa ? 'Ocultar esta columna' : 'Mostrar esta columna'}
              onClick={() => alternar(col.clave)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                activa
                  ? 'border-hairline bg-surface text-ink/80'
                  : 'text-ink/40 border-dashed border-ink/20 line-through decoration-ink/30',
              )}
            >
              <span className={cn('size-2 rounded-full', activa ? PUNTO[col.tono] : 'bg-ink/20')} aria-hidden="true" />
              {col.etiqueta}
              <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', CONTADOR[col.tono])}>{n}</span>
            </button>
          )
        })}
        {ocultas.length > 0 ? (
          <button
            type="button"
            onClick={mostrarTodas}
            className="text-royal-700 dark:text-royal-300 rounded-full px-2.5 py-1 text-xs font-medium hover:underline"
          >
            ✕ Mostrar todas
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <Vacio icono={<span className="text-3xl">🗂</span>} titulo={vacio} />
      ) : visibles.length === 0 ? (
        <Vacio
          icono={<span className="text-3xl">🗂</span>}
          titulo="Todas las columnas están ocultas. Elegí al menos una arriba."
        />
      ) : (
        <div className="-mx-1 grid auto-cols-[minmax(15.5rem,1fr)] grid-flow-col gap-3 overflow-x-auto px-1 pb-3">
          {visibles.map((col) => {
            const todas = items.filter(col.coincide)
            const enColumna = todas.slice(0, TOPE_COLUMNA)
            const anteriores = todas.length - enColumna.length
            return (
              <section key={col.clave} className="bg-ink/3 border-hairline flex min-w-0 flex-col rounded-[10px] border">
                <header className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <span className="text-ink/75 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
                    <span className={cn('size-2 rounded-full', PUNTO[col.tono])} aria-hidden="true" />
                    {col.etiqueta}
                  </span>
                  <span
                    className={cn('rounded-full px-2 py-0.5 text-xs font-medium tabular-nums', CONTADOR[col.tono])}
                    title={anteriores > 0 ? `${todas.length} en total · se ven las ${enColumna.length} últimas` : undefined}
                  >
                    {todas.length}
                  </span>
                </header>
                {/* Lista con desplazamiento propio: la columna no empuja la página. */}
                <div className="flex max-h-[max(320px,calc(100vh-300px))] flex-col gap-2 overflow-y-auto px-2 pb-2">
                  {enColumna.length === 0 ? (
                    <div className="text-ink/40 border-ink/10 rounded-[8px] border border-dashed px-3 py-4 text-center text-xs">
                      —
                    </div>
                  ) : (
                    enColumna.map((x) => <div key={claveDe(x)}>{tarjeta(x)}</div>)
                  )}
                </div>
                {anteriores > 0 ? (
                  <button
                    type="button"
                    className="text-royal-700 dark:text-royal-300 hover:bg-ink/5 mx-2 mb-2 rounded-[6px] px-2 py-1.5 text-xs font-medium"
                    title={`Ver las ${anteriores} anteriores en el histórico, con filtros`}
                    onClick={() => onVerAnteriores(col.clave)}
                  >
                    📚 Ver las {anteriores.toLocaleString('es-VE')} anteriores
                  </button>
                ) : null}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
