import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Download,
  Search,
  BookOpen,
  HelpCircle,
  ListOrdered,
  ExternalLink,
  ChevronDown,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { enMayuscula } from '@/lib/texto'
import { esModuloEnObra } from '@/config/navigation'
import { GUIAS_PASO_A_PASO } from '@/data/manual/guiasPasoAPaso'
import { PREGUNTAS_FRECUENTES } from '@/data/manual/preguntasFrecuentes'
import { AREAS_OPERATIVAS, type AreaOperativa } from '@/data/manual/tipos'
import './manual.css'

/*
  El manual entra como texto, no como componentes.
  Lo escribe scripts/manual-a-html.mjs desde docs/manual-de-usuario.md.
*/
import manualHtml from './manual.generado.html?raw'

type VistaManual = 'paso_a_paso' | 'preguntas_respuestas' | 'libro_completo'

interface Capitulo {
  id: string
  numero: string
  nombre: string
  aviso?: string
}

const MODULO_DEL_CAPITULO: Record<string, string> = {
  Explotación: 'EXPLOTACION',
  Despachos: 'DESPACHOS',
  Ventas: 'VENTAS',
  Tesorería: 'TESORERIA',
  Asignaciones: 'ASIGNACIONES',
}

const AVISO_FUERA_DEL_MENU = 'Este módulo no está en el menú. El capítulo queda como referencia.'

function avisoDelCapitulo(nombre: string): string | undefined {
  const modulo = MODULO_DEL_CAPITULO[nombre.trim()]
  if (!modulo || !esModuloEnObra(modulo)) return undefined
  return AVISO_FUERA_DEL_MENU
}

interface Hallazgo {
  texto: string
  donde: string
  id: string
}

const compara = (texto: string) => enMayuscula(texto.toLowerCase())

export function Manual() {
  const contenido = useRef<HTMLDivElement>(null)
  const [vista, setVista] = useState<VistaManual>('paso_a_paso')
  const [areaFiltro, setAreaFiltro] = useState<AreaOperativa>('TODAS')
  const [busqueda, setBusqueda] = useState('')

  // Acordeones abiertos
  const [guiaAbierta, setGuiaAbierta] = useState<string | null>(GUIAS_PASO_A_PASO[0]?.id ?? null)
  const [qaAbierto, setQaAbierto] = useState<string | null>(PREGUNTAS_FRECUENTES[0]?.id ?? null)

  // Estado del libro tradicional
  const [capitulos, setCapitulos] = useState<Capitulo[]>([])
  const [buscable, setBuscable] = useState<Hallazgo[]>([])
  const [activo, setActivo] = useState('')

  // Leer capítulos del HTML tradicional cuando se monta
  useEffect(() => {
    const raiz = contenido.current
    if (!raiz) return

    const secciones = Array.from(raiz.querySelectorAll<HTMLElement>('section.cap'))

    const leidos = secciones
      .filter((s) => s.dataset.cap)
      .map((s) => {
        const nombre = s.querySelector('.cap-tit span:last-child')?.textContent?.trim() ?? ''
        return { seccion: s, id: s.id, numero: s.dataset.cap ?? '', nombre, aviso: avisoDelCapitulo(nombre) }
      })

    for (const c of leidos) {
      if (!c.aviso || c.seccion.querySelector('.cap-aviso')) continue
      const banda = document.createElement('p')
      banda.className = 'cap-aviso'
      banda.textContent = c.aviso
      c.seccion.querySelector('.cap-tit')?.after(banda)
    }

    setCapitulos(leidos.map(({ id, numero, nombre, aviso }) => ({ id, numero, nombre, aviso })))

    const encontrables: Hallazgo[] = []
    for (const h of raiz.querySelectorAll<HTMLElement>('h2.cap-tit, h3, h4')) {
      const seccion = h.closest<HTMLElement>('section.cap')
      if (!seccion) continue
      encontrables.push({
        texto: h.textContent?.trim() ?? '',
        donde: 'Sección del Manual',
        id: h.id || seccion.id,
      })
    }

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

  // Observer de lectura para la vista de libro
  useEffect(() => {
    if (vista !== 'libro_completo') return
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
  }, [capitulos, vista])

  // Filtros de guías y preguntas
  const guiasFiltradas = useMemo(() => {
    const term = compara(busqueda.trim())
    return GUIAS_PASO_A_PASO.filter((g) => {
      const coincideArea = areaFiltro === 'TODAS' || g.area === areaFiltro
      if (!coincideArea) return false
      if (!term) return true
      return (
        compara(g.titulo).includes(term) ||
        compara(g.resumen).includes(term) ||
        g.palabrasClave.some((k) => compara(k).includes(term)) ||
        g.pasos.some((p) => compara(p.titulo).includes(term) || compara(p.detalle).includes(term))
      )
    })
  }, [busqueda, areaFiltro])

  const qaFiltradas = useMemo(() => {
    const term = compara(busqueda.trim())
    return PREGUNTAS_FRECUENTES.filter((q) => {
      const coincideArea = areaFiltro === 'TODAS' || q.area === areaFiltro
      if (!coincideArea) return false
      if (!term) return true
      return (
        compara(q.pregunta).includes(term) ||
        compara(q.respuestaCorta).includes(term) ||
        compara(q.causaRaiz).includes(term) ||
        compara(q.accionSolucion).includes(term) ||
        q.palabrasClave.some((k) => compara(k).includes(term))
      )
    })
  }, [busqueda, areaFiltro])

  const hallazgosLibro = useMemo(() => {
    const termino = compara(busqueda.trim())
    if (termino.length < 2) return []
    return buscable.filter((h) => compara(h.texto).includes(termino)).slice(0, 15)
  }, [busqueda, buscable])

  const irASeccionLibro = (id: string) => {
    setVista('libro_completo')
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
    setBusqueda('')
  }

  return (
    <>
      <PageHeader
        title="Manual y Centro de Ayuda Operativa"
        description="Guías paso a paso, respuestas rápidas a bloqueos operativos y manual técnico completo de La Cantera."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              icon={<Download className="size-4" />}
              title="Abre el diálogo de impresión oficial. Elija «Guardar como PDF»."
              onClick={() => {
                setVista('libro_completo')
                setTimeout(() => window.print(), 100)
              }}
            >
              Descargar en PDF
            </Button>
          </div>
        }
      />

      {/* Selector de Pilares Principales */}
      <div className="mb-6 flex border-b border-hairline gap-4 sm:gap-8">
        <button
          type="button"
          onClick={() => setVista('paso_a_paso')}
          className={`pb-3 text-sm font-medium transition-all relative flex items-center gap-2 ${
            vista === 'paso_a_paso'
              ? 'text-tierra-600 dark:text-tierra-300 border-b-2 border-tierra-600 dark:border-tierra-400 font-semibold'
              : 'text-ink/50 hover:text-ink/80'
          }`}
        >
          <ListOrdered className="size-4.5" />
          <span>Guías Paso a Paso</span>
          <span className="rounded-full bg-ink/6 px-2 py-0.5 text-xs text-ink/75 font-semibold">
            {GUIAS_PASO_A_PASO.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setVista('preguntas_respuestas')}
          className={`pb-3 text-sm font-medium transition-all relative flex items-center gap-2 ${
            vista === 'preguntas_respuestas'
              ? 'text-tierra-600 dark:text-tierra-300 border-b-2 border-tierra-600 dark:border-tierra-400 font-semibold'
              : 'text-ink/50 hover:text-ink/80'
          }`}
        >
          <HelpCircle className="size-4.5" />
          <span>Preguntas Frecuentes (Q&A)</span>
          <span className="rounded-full bg-ink/6 px-2 py-0.5 text-xs text-ink/75 font-semibold">
            {PREGUNTAS_FRECUENTES.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setVista('libro_completo')}
          className={`pb-3 text-sm font-medium transition-all relative flex items-center gap-2 ${
            vista === 'libro_completo'
              ? 'text-tierra-600 dark:text-tierra-300 border-b-2 border-tierra-600 dark:border-tierra-400 font-semibold'
              : 'text-ink/50 hover:text-ink/80'
          }`}
        >
          <BookOpen className="size-4.5" />
          <span>Manual Completo (Libro Oficial)</span>
        </button>
      </div>

      {/* Barra de Búsqueda Reactiva y Filtro por Área */}
      <div className="mb-6 space-y-4">
        <div className="relative max-w-2xl">
          <Input
            label="Buscar en el manual y centro de ayuda"
            type="search"
            sinNormalizar
            icon={<Search />}
            placeholder="¿Qué desea hacer? (ej. «emitir retención», «feriado bancario», «chofer», «error»...)"
            hint="Busca simultáneamente en procedimientos paso a paso, dudas frecuentes y el manual completo."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />

          {busqueda.trim().length >= 2 && hallazgosLibro.length > 0 && vista !== 'libro_completo' ? (
            <div className="border-hairline rounded-[6px] bg-surface shadow-popover absolute inset-x-0 top-[4.6rem] z-30 max-h-72 overflow-y-auto border p-2">
              <p className="px-3 py-1.5 text-2xs font-semibold tracking-wider text-ink/50 uppercase">
                Capítulos del manual completo que coinciden:
              </p>
              <ul>
                {hallazgosLibro.map((h, n) => (
                  <li key={`${h.id}-${n}`}>
                    <button
                      type="button"
                      onClick={() => irASeccionLibro(h.id)}
                      className="border-hairline hover:bg-ink/5 flex w-full items-center justify-between border-b px-3 py-2 text-left rounded-[4px] last:border-b-0 transition-colors"
                    >
                      <span className="text-ink/90 text-sm font-medium">{h.texto}</span>
                      <span className="text-ink/50 text-xs ml-2 shrink-0">{h.donde} ›</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {/* Pastillas de filtro por Área Operativa */}
        {vista !== 'libro_completo' ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs font-semibold text-ink/50 mr-1">Área:</span>
            {AREAS_OPERATIVAS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAreaFiltro(a.id)}
                className={`px-3 py-1 text-xs rounded-full border transition-all ${
                  areaFiltro === a.id
                    ? 'border-tierra-600 bg-tierra-600/10 text-tierra-600 dark:text-tierra-300 font-semibold'
                    : 'border-hairline bg-surface/50 text-ink/65 hover:border-ink/30 hover:text-ink/90'
                }`}
                title={a.descripcion}
              >
                {a.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* ========================================================================= */}
      {/* PILAR 1: GUÍAS PASO A PASO (STEP-BY-STEP) */}
      {/* ========================================================================= */}
      {vista === 'paso_a_paso' && (
        <div className="space-y-4 max-w-5xl">
          {guiasFiltradas.length === 0 ? (
            <div className="rounded-[6px] border border-dashed border-hairline p-12 text-center bg-surface">
              <ListOrdered className="size-10 text-ink/40 mx-auto mb-3" />
              <p className="text-sm font-semibold text-ink/85">No se encontraron guías para la búsqueda</p>
              <p className="text-xs text-ink/50 mt-1">
                Pruebe con otros términos o seleccione «Todo el sistema» en el filtro de áreas.
              </p>
            </div>
          ) : (
            guiasFiltradas.map((guia) => {
              const estaAbierta = guiaAbierta === guia.id
              return (
                <div
                  key={guia.id}
                  className="rounded-[6px] border border-hairline bg-surface transition-all overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setGuiaAbierta(estaAbierta ? null : guia.id)}
                    className="w-full p-4 text-left flex items-start justify-between gap-4 hover:bg-ink/2 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-ink/90">{guia.titulo}</span>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-ink/6 text-ink/75">
                          {AREAS_OPERATIVAS.find((a) => a.id === guia.area)?.label}
                        </span>
                      </div>
                      <p className="text-xs text-ink/60 leading-relaxed max-w-3xl">{guia.resumen}</p>
                    </div>
                    <div className="shrink-0 pt-1">
                      <ChevronDown
                        className={`size-5 text-ink/50 transition-transform duration-200 ${
                          estaAbierta ? 'rotate-180 text-tierra-600' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {estaAbierta && (
                    <div className="p-4 pt-0 border-t border-hairline space-y-5 bg-ink/2">
                      {/* Metadatos: Rol y Ruta */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-4 text-xs">
                        <div className="p-2.5 rounded-[4px] border border-hairline bg-surface flex items-center justify-between">
                          <span className="text-ink/55">Rol requerido:</span>
                          <strong className="text-ink/85">{guia.rolRequerido}</strong>
                        </div>
                        <div className="p-2.5 rounded-[4px] border border-hairline bg-surface flex items-center justify-between">
                          <span className="text-ink/55">Ubicación en menú:</span>
                          <span className="text-ink/85 font-mono text-[11px]">{guia.rutaMenu}</span>
                        </div>
                      </div>

                      {/* Lista numerada de pasos */}
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-ink/70 uppercase tracking-wider">
                          Pasos a seguir:
                        </p>
                        <div className="space-y-2.5">
                          {guia.pasos.map((paso) => (
                            <div
                              key={paso.numero}
                              className="rounded-[6px] border border-hairline bg-surface p-3.5 flex items-start gap-3.5"
                            >
                              <span className="size-6 rounded-full bg-tierra-600/10 text-tierra-600 dark:text-tierra-300 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                                {paso.numero}
                              </span>
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-xs font-bold text-ink/90">{paso.titulo}</p>
                                  {paso.boton ? (
                                    <span className="px-2 py-0.5 rounded-[4px] border border-hairline bg-ink/5 text-[11px] font-mono text-ink/80 font-medium">
                                      Botón: «{paso.boton}»
                                    </span>
                                  ) : null}
                                </div>
                                <p className="text-xs text-ink/75 leading-relaxed">{paso.detalle}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Resultado esperado */}
                      <div className="rounded-[6px] border border-success/30 bg-success-soft p-3 text-xs text-ink/80 flex items-start gap-2.5">
                        <CheckCircle2 className="size-4.5 text-success shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-ink/90 block">Resultado al finalizar:</strong>
                          <span className="text-ink/75">{guia.resultado}</span>
                        </div>
                      </div>

                      {/* Cómo revertir o corregir */}
                      <div className="rounded-[6px] border border-warning/30 bg-warning-soft p-3 text-xs text-ink/80 flex items-start gap-2.5">
                        <RotateCcw className="size-4.5 text-warning shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-ink/90 block">↺ Si te equivocaste o necesitas corregir:</strong>
                          <span className="text-ink/75">{guia.revertir}</span>
                        </div>
                      </div>

                      {/* Enlace directo a la pantalla */}
                      {guia.rutaDirecta ? (
                        <div className="pt-1 flex justify-end">
                          <Link to={guia.rutaDirecta}>
                            <Button size="sm" icon={<ExternalLink className="size-3.5" />}>
                              Ir a la pantalla
                            </Button>
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* PILAR 2: PREGUNTAS FRECUENTES (Q&A OPERATIVO) */}
      {/* ========================================================================= */}
      {vista === 'preguntas_respuestas' && (
        <div className="space-y-4 max-w-5xl">
          {qaFiltradas.length === 0 ? (
            <div className="rounded-[6px] border border-dashed border-hairline p-12 text-center bg-surface">
              <HelpCircle className="size-10 text-ink/40 mx-auto mb-3" />
              <p className="text-sm font-semibold text-ink/85">No se encontraron respuestas para la búsqueda</p>
              <p className="text-xs text-ink/50 mt-1">
                Escriba otra palabra clave o explore las categorías en el menú superior.
              </p>
            </div>
          ) : (
            qaFiltradas.map((qa) => {
              const estaAbierta = qaAbierto === qa.id
              return (
                <div
                  key={qa.id}
                  className="rounded-[6px] border border-hairline bg-surface transition-all overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setQaAbierto(estaAbierta ? null : qa.id)}
                    className="w-full p-4 text-left flex items-start justify-between gap-4 hover:bg-ink/2 transition-colors"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-ink/90 flex items-center gap-2">
                          <HelpCircle className="size-4 text-tierra-600 dark:text-tierra-300 shrink-0" />
                          {qa.pregunta}
                        </span>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-ink/6 text-ink/75">
                          {AREAS_OPERATIVAS.find((a) => a.id === qa.area)?.label}
                        </span>
                      </div>
                      <p className="text-xs text-ink/75 leading-relaxed">{qa.respuestaCorta}</p>
                    </div>
                    <div className="shrink-0 pt-1">
                      <ChevronDown
                        className={`size-5 text-ink/50 transition-transform duration-200 ${
                          estaAbierta ? 'rotate-180 text-tierra-600' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {estaAbierta && (
                    <div className="p-4 pt-0 border-t border-hairline space-y-4 bg-ink/2">
                      {/* Causa Raíz */}
                      <div className="rounded-[6px] border border-hairline bg-surface p-3.5 space-y-1 text-xs">
                        <p className="font-semibold text-ink/70 uppercase tracking-wider text-[11px]">
                          ¿Por qué ocurre? (Causa del sistema):
                        </p>
                        <p className="text-ink/80 leading-relaxed">{qa.causaRaiz}</p>
                      </div>

                      {/* Acción y Solución */}
                      <div className="rounded-[6px] border border-hairline bg-surface p-3.5 space-y-1 text-xs">
                        <p className="font-semibold text-tierra-600 dark:text-tierra-300 uppercase tracking-wider text-[11px]">
                          Acción a seguir (Solución):
                        </p>
                        <div className="text-ink/80 leading-relaxed whitespace-pre-line font-normal">
                          {qa.accionSolucion}
                        </div>
                      </div>

                      {/* Enlace recomendado */}
                      {qa.rutaRecomendada ? (
                        <div className="flex justify-end pt-1">
                          <Link to={qa.rutaRecomendada}>
                            <Button size="sm" variant="outline" icon={<ExternalLink className="size-3.5" />}>
                              {qa.textoRuta || 'Ir a la pantalla'}
                            </Button>
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* PILAR 3: MANUAL COMPLETO (LIBRO OFICIAL EXTENDIDO) */}
      {/* ========================================================================= */}
      {vista === 'libro_completo' && (
        <div className="flex flex-col gap-8 pb-16 xl:flex-row xl:items-start">
          <div className="min-w-0 flex-1">
            <div
              ref={contenido}
              className="manual"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: manualHtml }}
            />
          </div>

          {/* Riel lateral de capítulos */}
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
                    onClick={() => {
                      document.getElementById(c.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }}
                    className={
                      activo === c.id
                        ? 'text-tierra-600 dark:text-tierra-300 flex w-full gap-2 rounded px-1.5 py-1 text-left text-sm font-medium'
                        : 'text-ink/65 hover:text-ink/90 hover:bg-ink/5 flex w-full gap-2 rounded px-1.5 py-1 text-left text-sm'
                    }
                  >
                    <span className="tabular text-ink/40 w-4 shrink-0 text-xs leading-5">
                      {c.numero}
                    </span>
                    <span className="min-w-0">
                      {c.nombre}
                      {c.aviso ? (
                        <span className="text-warning ml-1.5" title={c.aviso} aria-label={c.aviso}>
                          ·
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}
    </>
  )
}
