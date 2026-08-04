import { useEffect, useMemo, useRef, useState } from 'react'
import { Printer, Search } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { enMayuscula } from '@/lib/texto'
import './manual.css'
/*
  El manual entra como texto, no como componentes.

  Lo escribe scripts/manual-a-html.mjs desde docs/manual-de-usuario.md, que es
  donde vive el manual de verdad. Convertirlo a JSX obligaria a mantener las
  mismas 4.700 lineas en dos sitios, y el dia que se desincronicen gana el que
  nadie esta leyendo.

  Viaja en su propio trozo del paquete, con el resto de esta pantalla: son 500
  kB que no tiene por que descargar quien entra a registrar una salida de
  almacen.
*/
import manualHtml from './manual.generado.html?raw'

interface Capitulo {
  id: string
  numero: string
  nombre: string
}

interface Hallazgo {
  /** Lo que se muestra en la lista de resultados. */
  texto: string
  /** De donde salio: una seccion del manual o un mensaje del sistema. */
  donde: string
  /** A donde lleva al pulsarlo. */
  id: string
}

/** Mayusculas y sin tildes en los dos lados, para que «nomina» encuentre «Nómina». */
const compara = (texto: string) => enMayuscula(texto.toLowerCase())

export function Manual() {
  const contenido = useRef<HTMLDivElement>(null)
  const [capitulos, setCapitulos] = useState<Capitulo[]>([])
  const [buscable, setBuscable] = useState<Hallazgo[]>([])
  const [activo, setActivo] = useState('')
  const [busqueda, setBusqueda] = useState('')

  /*
    El indice se lee del documento ya montado en vez de generarse aparte.

    Es un archivo mas que no hay que mantener sincronizado: si el manual gana un
    capitulo, el riel lo muestra sin tocar nada.
  */
  useEffect(() => {
    const raiz = contenido.current
    if (!raiz) return

    const secciones = Array.from(raiz.querySelectorAll<HTMLElement>('section.cap'))

    setCapitulos(
      secciones
        .filter((s) => s.dataset.cap)
        .map((s) => ({
          id: s.id,
          numero: s.dataset.cap ?? '',
          nombre: s.querySelector('.cap-tit span:last-child')?.textContent?.trim() ?? '',
        })),
    )

    const encontrables: Hallazgo[] = []

    for (const h of raiz.querySelectorAll<HTMLElement>('h2.cap-tit, h3, h4')) {
      const seccion = h.closest<HTMLElement>('section.cap')
      if (!seccion) continue
      encontrables.push({
        texto: h.textContent?.trim() ?? '',
        donde: 'Sección',
        id: h.id || seccion.id,
      })
    }

    /*
      Los mensajes de error se buscan aparte porque son la consulta mas comun:
      alguien tiene una franja roja en pantalla y quiere saber que hacer. Sin
      esto habria que adivinar en que capitulo esta.
    */
    for (const fila of raiz.querySelectorAll<HTMLElement>('table.tabla-mensajes tbody tr')) {
      const primera = fila.querySelector('td')
      const seccion = fila.closest<HTMLElement>('section.cap')
      if (!primera || !seccion) continue
      const capitulo = seccion.querySelector('.cap-tit span:last-child')?.textContent?.trim() ?? ''
      encontrables.push({
        texto: primera.textContent?.trim() ?? '',
        donde: `Mensaje · ${capitulo}`,
        id: seccion.id,
      })
    }

    setBuscable(encontrables)
  }, [])

  /** Marca en el riel el capitulo que se esta leyendo. */
  useEffect(() => {
    const raiz = contenido.current
    if (!raiz || !capitulos.length) return

    const secciones = Array.from(raiz.querySelectorAll<HTMLElement>('section.cap[data-cap]'))
    const visibles = new Map<string, boolean>()

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) visibles.set(e.target.id, e.isIntersecting)
        const primero = secciones.find((s) => visibles.get(s.id))
        if (primero) setActivo(primero.id)
      },
      { rootMargin: '-10% 0px -70% 0px' },
    )

    for (const s of secciones) observador.observe(s)
    return () => observador.disconnect()
  }, [capitulos])

  const hallazgos = useMemo(() => {
    const termino = compara(busqueda.trim())
    if (termino.length < 2) return []
    return buscable.filter((h) => compara(h.texto).includes(termino)).slice(0, 30)
  }, [busqueda, buscable])

  const irA = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setBusqueda('')
  }

  const buscando = busqueda.trim().length >= 2

  return (
    <>
      <PageHeader
        title="Manual de usuario"
        description="Cómo se usa el sistema, explicado para quien trabaja con él todos los días."
        actions={
          <Button variant="outline" icon={<Printer />} onClick={() => window.print()}>
            Imprimir
          </Button>
        }
      />

      <div className="flex flex-col gap-8 pb-16 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1">
          <div className="relative mb-8 max-w-md">
            <Input
              label="Buscar"
              type="search"
              sinNormalizar
              icon={<Search />}
              placeholder="Un mensaje de error o un tema"
              hint="Busca en los títulos y en los mensajes que muestra el sistema."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />

            {buscando ? (
              <div className="border-ink/15 rounded-card bg-surface shadow-popover absolute inset-x-0 top-[4.6rem] z-20 max-h-96 overflow-y-auto border">
                {hallazgos.length ? (
                  <ul>
                    {hallazgos.map((h, n) => (
                      <li key={`${h.id}-${n}`}>
                        <button
                          type="button"
                          onClick={() => irA(h.id)}
                          className="border-hairline hover:bg-canvas block w-full border-b px-3 py-2 text-left last:border-b-0"
                        >
                          <span className="text-ink/85 block text-sm">{h.texto}</span>
                          <span className="text-ink/50 mt-0.5 block text-xs">{h.donde}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-ink/50 px-3 py-3 text-sm">Nada coincide con esa búsqueda.</p>
                )}
              </div>
            ) : null}
          </div>

          {/*
            Contenido de nuestro propio repositorio, generado en la compilación
            desde el markdown del manual. No hay nada aquí que venga de un
            usuario ni de la base, que es lo que haría peligroso este montaje.
          */}
          <div
            ref={contenido}
            className="manual"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: manualHtml }}
          />
        </div>

        {/*
          El riel va a la derecha: a la izquierda ya está el menú del sistema, y
          dos columnas de navegación pegadas se leen como una sola rota.
        */}
        <nav
          aria-label="Capítulos del manual"
          className="border-hairline sticky top-6 hidden w-56 shrink-0 border-l pl-4 xl:block"
        >
          <p className="text-ink/45 mb-2 text-2xs font-semibold tracking-[0.12em] uppercase">
            Capítulos
          </p>
          <ul className="max-h-[calc(100svh-9rem)] space-y-0.5 overflow-y-auto">
            {capitulos.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => irA(c.id)}
                  className={
                    activo === c.id
                      ? 'text-royal-600 dark:text-royal-300 flex w-full gap-2 rounded px-1.5 py-1 text-left text-sm font-medium'
                      : 'text-ink/65 hover:text-ink/90 hover:bg-ink/5 flex w-full gap-2 rounded px-1.5 py-1 text-left text-sm'
                  }
                >
                  <span className="tabular text-ink/40 w-4 shrink-0 text-xs leading-5">
                    {c.numero}
                  </span>
                  <span className="min-w-0">{c.nombre}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  )
}
