import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface OpcionBuscable {
  valor: string
  /**
   * Lo que va en la columna angosta: el código con el que la gente lo pide.
   *
   * Opcional porque no todo tiene código. Un artículo sí —REP-NEU— y entonces
   * la lista va a dos columnas; un cliente no, y va a una sola.
   */
  codigo?: string
  nombre?: string
  /**
   * Una sola línea, cuando no hay código y nombre por separado.
   *
   * Existe para poder convertir de golpe los desplegables que ya venían
   * armando su etiqueta a mano —«JESMARY BARCO · ficha 0018»— sin tener que
   * partir treinta plantillas a mano y equivocarse en alguna.
   */
  etiqueta?: string
  /** Tercera línea opcional: unidad, categoría, existencia. */
  detalle?: string
}

/** Lo que se enseña cuando solo hay una línea. */
const textoDe = (o: OpcionBuscable) => o.etiqueta ?? o.nombre ?? o.valor

interface Props {
  label: string
  opciones: OpcionBuscable[]
  valor: string
  onCambio: (valor: string) => void
  /** Texto cuando no hay nada elegido. Si falta, el campo no admite vacío. */
  vacio?: string
  hint?: string
  error?: string
  disabled?: boolean
  className?: string
}

/*
  UN DESPLEGABLE DEJA DE SERVIR PASADOS TREINTA RENGLONES

  El `<select>` del navegador obliga a recorrer la lista con la vista. Con el
  catálogo de la cantera —repuestos, insumos, EPP, herramienta— eso son más de
  cien renglones, y quien está cargando una orden de compra ya sabe lo que
  busca: escribe «neumatico», o «REP-NEU», o «29.5».

  Se descartó partirlo en dos campos —código por un lado, nombre por otro—
  porque obliga a saber de antemano cuál de los dos recuerdas. Un solo campo que
  busque en los dos no tiene esa pega, y la separación que sí ayuda —ver el
  código junto al nombre— se resuelve en la lista, que va a dos columnas.

  La lista se dibuja en `document.body`. Dentro de un modal, que tiene su propio
  desplazamiento, una lista absoluta se recorta contra el borde; es el mismo
  motivo por el que `Modal` ya se dibuja allí.
*/
export function SelectBuscable({
  label,
  opciones,
  valor,
  onCambio,
  vacio,
  hint,
  error,
  disabled,
  className,
}: Props) {
  const id = useId()
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [resaltada, setResaltada] = useState(0)
  const [caja, setCaja] = useState<{ x: number; y: number; ancho: number; arriba: boolean } | null>(
    null,
  )

  const anclaRef = useRef<HTMLDivElement>(null)
  const entradaRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLUListElement>(null)

  const elegida = opciones.find((o) => o.valor === valor)

  // Tildes fuera y todo a minúscula, igual que el buscador general: quien
  // escribe deprisa no pone tildes, y el catálogo sí las tiene.
  const normalizar = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()

  const filtradas = useMemo(() => {
    const trozos = normalizar(texto).split(/\s+/).filter(Boolean)
    if (trozos.length === 0) return opciones

    // Cada palabra por separado, en cualquier orden: «neu 29» encuentra
    // «NEUMATICO 29.5R25» sin obligar a escribirlo seguido.
    return opciones.filter((o) => {
      const heno = normalizar(
        `${o.codigo ?? ''} ${o.nombre ?? ''} ${o.etiqueta ?? ''} ${o.detalle ?? ''}`,
      )
      return trozos.every((t) => heno.includes(t))
    })
  }, [opciones, texto])

  useLayoutEffect(() => {
    if (!abierto) return

    const medir = () => {
      const r = anclaRef.current?.getBoundingClientRect()
      if (!r) return

      // Si abajo no caben 200 px, se abre hacia arriba. Pasa siempre con el
      // último renglón de una tabla larga.
      const holgura = window.innerHeight - r.bottom
      const arriba = holgura < 200 && r.top > holgura

      setCaja({
        x: r.left,
        y: arriba ? window.innerHeight - r.top + 6 : r.bottom + 6,
        ancho: r.width,
        arriba,
      })
    }

    medir()
    window.addEventListener('resize', medir)
    window.addEventListener('scroll', medir, true)
    return () => {
      window.removeEventListener('resize', medir)
      window.removeEventListener('scroll', medir, true)
    }
  }, [abierto])

  useEffect(() => {
    if (abierto) entradaRef.current?.focus()
    else setTexto('')
  }, [abierto])

  useEffect(() => setResaltada(0), [texto])

  // Que la resaltada no se quede fuera de vista al bajar con el teclado.
  useEffect(() => {
    listaRef.current?.querySelector('[data-resaltada="si"]')?.scrollIntoView({ block: 'nearest' })
  }, [resaltada, filtradas])

  useEffect(() => {
    if (!abierto) return

    const fuera = (e: MouseEvent) => {
      const t = e.target as Node
      if (!anclaRef.current?.contains(t) && !listaRef.current?.contains(t)) setAbierto(false)
    }

    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const elegir = (v: string) => {
    onCambio(v)
    setAbierto(false)
  }

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!abierto) return setAbierto(true)
      setResaltada((i) => Math.min(i + 1, filtradas.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setResaltada((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const o = filtradas[resaltada]
      if (o) elegir(o.valor)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setAbierto(false)
    }
  }

  const describedById = `${id}-desc`

  return (
    <div className={cn('w-full', className)}>
      <label htmlFor={id} className="text-ink/75 mb-1.5 block text-sm font-medium">
        {label}
      </label>

      <div ref={anclaRef} className="relative">
        {abierto ? (
          <>
            <Search className="text-ink/40 pointer-events-none absolute inset-y-0 left-3 my-auto size-[18px]" />
            <input
              ref={entradaRef}
              id={id}
              role="combobox"
              aria-expanded
              aria-controls={`${id}-lista`}
              autoComplete="off"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={teclas}
              placeholder="Escribe el código o el nombre…"
              className={cn(
                'rounded-control bg-surface text-ink/90 h-10 w-full border pr-9 pl-10 text-base',
                'border-royal-600 focus:ring-royal-600/20 focus:ring-2 focus:outline-none',
              )}
            />
          </>
        ) : (
          <button
            type="button"
            id={id}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error || hint ? describedById : undefined}
            onClick={() => setAbierto(true)}
            onKeyDown={teclas}
            className={cn(
              'rounded-control bg-surface h-10 w-full border pr-9 pl-3.5 text-left text-base',
              'transition-[border-color,box-shadow] duration-150 focus:outline-none',
              'disabled:cursor-not-allowed disabled:opacity-55',
              elegida ? 'text-ink/90' : 'text-ink/40',
              error
                ? 'border-danger focus:border-danger focus:ring-danger/20 focus:ring-2'
                : 'border-ink/20 hover:border-ink/32 focus:border-royal-600 focus:ring-royal-600/20 focus:ring-2',
            )}
          >
            <span className="flex items-center gap-2 truncate">
              {elegida ? (
                <>
                  {elegida.codigo ? (
                    <span className="text-ink/45 shrink-0 font-mono text-xs">
                      {elegida.codigo}
                    </span>
                  ) : null}
                  <span className="truncate">{textoDe(elegida)}</span>
                </>
              ) : (
                (vacio ?? 'Selecciona…')
              )}
            </span>
          </button>
        )}

        <ChevronDown className="text-ink/40 pointer-events-none absolute inset-y-0 right-3 my-auto size-[18px]" />
      </div>

      {error || hint ? (
        <p
          id={describedById}
          className={cn('mt-1.5 text-xs', error ? 'text-danger' : 'text-ink/50')}
        >
          {error ?? hint}
        </p>
      ) : null}

      {abierto && caja
        ? createPortal(
            <ul
              ref={listaRef}
              id={`${id}-lista`}
              role="listbox"
              style={{
                left: caja.x,
                width: caja.ancho,
                ...(caja.arriba ? { bottom: caja.y } : { top: caja.y }),
              }}
              className="border-ink/15 bg-surface fixed z-[70] max-h-72 overflow-y-auto rounded-[10px] border shadow-xl"
            >
              {vacio !== undefined ? (
                <li>
                  <button
                    type="button"
                    onClick={() => elegir('')}
                    className="text-ink/45 hover:bg-ink/6 flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                  >
                    <X className="size-3.5 shrink-0" />
                    {vacio}
                  </button>
                </li>
              ) : null}

              {filtradas.length === 0 ? (
                <li className="text-ink/45 px-3 py-6 text-center text-sm">
                  Nada coincide con «{texto}».
                </li>
              ) : (
                filtradas.map((o, i) => (
                  <li key={o.valor}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={o.valor === valor}
                      data-resaltada={i === resaltada ? 'si' : 'no'}
                      onMouseEnter={() => setResaltada(i)}
                      onClick={() => elegir(o.valor)}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2 text-left',
                        i === resaltada ? 'bg-royal-600/12' : 'hover:bg-ink/6',
                      )}
                    >
                      {/* El código en columna propia y a ancho fijo: así la
                          vista baja en línea recta en vez de ir a saltos. Sin
                          código no se reserva la columna: dejaría a todas las
                          filas con un hueco delante. */}
                      {o.codigo ? (
                        <span className="text-ink/45 w-24 shrink-0 truncate font-mono text-xs">
                          {o.codigo}
                        </span>
                      ) : null}

                      <span className="min-w-0 flex-1">
                        <span className="text-ink/90 block truncate text-sm">{textoDe(o)}</span>
                        {o.detalle ? (
                          <span className="text-ink/45 block truncate text-xs">{o.detalle}</span>
                        ) : null}
                      </span>

                      {o.valor === valor ? (
                        <Check className="text-royal-600 size-4 shrink-0" />
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </ul>,
            document.body,
          )
        : null}
    </div>
  )
}
