import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { Search } from 'lucide-react'
import { navigation, moduloDeRuta, esRutaSoloAdmin } from '@/config/navigation'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useMisRoles } from '@/lib/api/catalogo'
import { cn } from '@/lib/cn'

/**
 * Ir a cualquier pantalla escribiendo su nombre.
 *
 * POR QUÉ EXISTE
 *
 * La lupa de la barra llevaba puesta desde el principio y no hacía nada: un
 * botón con su atajo dibujado al lado y sin `onClick`. Eso es peor que no
 * tenerla — quien la pulsa concluye que el sistema está roto, y con razón.
 *
 * Se podía quitar. Pero el encargo de la dirección fue que nadie tuviera que
 * preguntarse dónde se hace algo, y con veinte pantallas repartidas en cinco
 * módulos, escribir «horómetro» y llegar es exactamente eso.
 *
 * NO ES UNA BÚSQUEDA DE DATOS
 *
 * Busca pantallas, no documentos. Escribir el número de una factura no la va a
 * encontrar, y el texto de ayuda lo dice para que nadie lo intente dos veces.
 * Buscar dentro de los datos es otra cosa —y más cara— que se hará cuando haya
 * datos que buscar.
 *
 * SOLO LO QUE ESTE USUARIO PUEDE ABRIR
 *
 * Se filtra por permiso igual que el menú. Ofrecer un atajo a una pantalla que
 * va a rebotar por falta de permiso es enseñar una puerta cerrada.
 */

interface Destino {
  label: string
  seccion: string
  grupo: string | null
  to: string
}

export function Buscador() {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [cursor, setCursor] = useState(0)
  const navegar = useNavigate()
  const { puede } = useMisPermisos()
  const { puede: tieneRol } = useMisRoles()
  const campo = useRef<HTMLInputElement>(null)

  // Ctrl+K y Cmd+K. Se escucha siempre, esté abierto o no: es el atajo que la
  // propia barra anuncia, y anunciarlo sin que funcione fue el problema.
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setAbierto((v) => !v)
      }
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('keydown', alPulsar)
    return () => document.removeEventListener('keydown', alPulsar)
  }, [])

  useEffect(() => {
    if (!abierto) return
    setTexto('')
    setCursor(0)
    // El foco al campo, o el atajo abriría una caja donde no se puede escribir.
    const t = setTimeout(() => campo.current?.focus(), 10)
    return () => clearTimeout(t)
  }, [abierto])

  const destinos = useMemo<Destino[]>(() => {
    const salida: Destino[] = []

    for (const seccion of navigation) {
      for (const item of seccion.items) {
        const agregar = (label: string, to: string, grupo: string | null) => {
          if (esRutaSoloAdmin(to) && !tieneRol('ADMIN')) return
          if (!puede(moduloDeRuta(to), 'LECTURA')) return
          salida.push({ label, to, seccion: seccion.label ?? '', grupo })
        }

        if (item.to) agregar(item.label, item.to, null)
        for (const hijo of item.children ?? []) agregar(hijo.label, hijo.to, item.label)
      }
    }

    return salida
  }, [puede, tieneRol])

  /*
    Coincide por trozos sueltos y sin tildes.

    «mant taller» tiene que encontrar «Historial de taller» dentro de
    Maquinaria, y «horometro» a «Horómetro» aunque nadie escriba la tilde con
    prisa. Se compara contra el nombre, su grupo y su sección, que es como la
    gente se refiere a las pantallas: «el de compras», «el tablero de ventas».
  */
  const normalizar = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

  const resultados = useMemo(() => {
    const trozos = normalizar(texto).split(/\s+/).filter(Boolean)
    if (trozos.length === 0) return destinos.slice(0, 8)

    return destinos
      .filter((d) => {
        const heno = normalizar(`${d.label} ${d.grupo ?? ''} ${d.seccion}`)
        return trozos.every((t) => heno.includes(t))
      })
      .slice(0, 10)
  }, [texto, destinos])

  useEffect(() => setCursor(0), [texto])

  const ir = (d: Destino) => {
    setAbierto(false)
    void navegar(d.to)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-ink/45 hover:text-ink/70 ml-1 flex items-center gap-2 rounded-md text-base transition-colors"
      >
        <Search className="size-5" />
        <span className="hidden sm:inline">Buscar</span>
        <kbd className="text-ink/40 border-ink/15 text-2xs hidden rounded border px-1.5 py-0.5 font-medium md:inline">
          Ctrl K
        </kbd>
      </button>

      {abierto
        ? createPortal(
            // Al `body` por lo mismo que los modales: la animación de entrada
            // de cada pantalla convierte a `fixed` en relativo a ella.
            <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[10vh]">
              <div
                className="bg-ink/40 absolute inset-0 backdrop-blur-[1px]"
                onClick={() => setAbierto(false)}
                aria-hidden="true"
              />

              <div
                role="dialog"
                aria-modal="true"
                aria-label="Buscar pantalla"
                className="bg-surface shadow-popover rounded-card relative flex w-full max-w-xl flex-col overflow-hidden"
              >
                <div className="border-hairline flex items-center gap-3 border-b px-4">
                  <Search className="text-ink/35 size-[18px] shrink-0" />
                  <input
                    ref={campo}
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setCursor((c) => Math.min(c + 1, resultados.length - 1))
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setCursor((c) => Math.max(c - 1, 0))
                      }
                      if (e.key === 'Enter' && resultados[cursor]) {
                        e.preventDefault()
                        ir(resultados[cursor])
                      }
                    }}
                    placeholder="Escribe el nombre de una pantalla"
                    className="text-ink/90 placeholder:text-ink/35 h-14 w-full bg-transparent text-base outline-none"
                  />
                </div>

                {resultados.length === 0 ? (
                  <p className="text-ink/50 px-4 py-6 text-sm">
                    Nada con ese nombre. Esto busca pantallas, no documentos: el número de una
                    factura no se encuentra aquí.
                  </p>
                ) : (
                  <ul className="max-h-[50vh] overflow-y-auto py-1.5">
                    {resultados.map((d, i) => (
                      <li key={d.to}>
                        <button
                          type="button"
                          onMouseEnter={() => setCursor(i)}
                          onClick={() => ir(d)}
                          className={cn(
                            'flex w-full items-baseline gap-2 px-4 py-2.5 text-left transition-colors',
                            i === cursor ? 'bg-royal-600/8' : 'hover:bg-ink/4',
                          )}
                        >
                          <span className="text-ink/90 text-sm">{d.label}</span>
                          <span className="text-ink/40 text-xs">
                            {d.grupo ? `${d.grupo} · ` : ''}
                            {d.seccion}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
