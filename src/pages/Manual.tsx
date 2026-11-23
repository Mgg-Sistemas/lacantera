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
  Lightbulb,
  Info,
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

type VistaManual = 'preguntas_respuestas' | 'paso_a_paso' | 'libro_completo'

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
  // Iniciamos por defecto en preguntas_respuestas para dar respuesta inmediata al usuario
  const [vista, setVista] = useState<VistaManual>('preguntas_respuestas')
  const [areaFiltro, setAreaFiltro] = useState<AreaOperativa>('TODAS')
  const [busqueda, setBusqueda] = useState('')

  // Acordeones abiertos por defecto
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
        title="Centro de Ayuda y Manual Operativo"
        description="Respuestas directas a dudas del día a día, pasos a seguir en cada pantalla y manual oficial de La Cantera."
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
      <div className="mb-6 flex border-b border-hairline gap-3 sm:gap-8">
        <button
          type="button"
          onClick={() => setVista('preguntas_respuestas')}
          className={`pb-3 text-sm font-semibold transition-all relative flex items-center gap-2 ${
            vista === 'preguntas_respuestas'
              ? 'text-tierra-600 dark:text-tierra-300 border-b-2 border-tierra-600 dark:border-tierra-400'
              : 'text-ink/50 hover:text-ink/80'
          }`}
        >
          <HelpCircle className="size-4.5" />
          <span>Preguntas Frecuentes (Q&A)</span>
          <span className="rounded-full bg-tierra-600/10 text-tierra-700 dark:text-tierra-300 px-2 py-0.5 text-xs font-bold">
            {PREGUNTAS_FRECUENTES.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setVista('paso_a_paso')}
          className={`pb-3 text-sm font-semibold transition-all relative flex items-center gap-2 ${
            vista === 'paso_a_paso'
              ? 'text-tierra-600 dark:text-tierra-300 border-b-2 border-tierra-600 dark:border-tierra-400'
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
          onClick={() => setVista('libro_completo')}
          className={`pb-3 text-sm font-semibold transition-all relative flex items-center gap-2 ${
            vista === 'libro_completo'
              ? 'text-tierra-600 dark:text-tierra-300 border-b-2 border-tierra-600 dark:border-tierra-400'
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
            label="Buscar por duda o palabra clave"
            type="search"
            sinNormalizar
            icon={<Search />}
            placeholder="Escriba su duda (ej: «retención», «reintegro», «feriado», «chofer», «báscula»...)"
            hint="Escriba lo que necesita hacer y el sistema filtrará las soluciones de inmediato."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />

          {busqueda.trim().length >= 2 && hallazgosLibro.length > 0 && vista !== 'libro_completo' ? (
            <div className="border-hairline rounded-[8px] bg-surface shadow-popover absolute inset-x-0 top-[4.6rem] z-30 max-h-72 overflow-y-auto border p-2">
              <p className="px-3 py-1.5 text-2xs font-bold tracking-wider text-ink/50 uppercase">
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

        {/* Botones de filtro por Área Temática */}
        {vista !== 'libro_completo' ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {AREAS_OPERATIVAS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAreaFiltro(a.id)}
                className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                  areaFiltro === a.id
                    ? 'border-tierra-600 bg-tierra-600/10 text-tierra-700 dark:text-tierra-300 font-bold shadow-sm'
                    : 'border-hairline bg-surface/60 text-ink/70 hover:border-ink/35 hover:text-ink'
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
      {/* PILAR 1: PREGUNTAS FRECUENTES (Q&A OPERATIVO - DIGERIBLE Y ACCIONABLE) */}
      {/* ========================================================================= */}
      {vista === 'preguntas_respuestas' && (
        <div className="space-y-4 max-w-4xl">
          {qaFiltradas.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-hairline p-12 text-center bg-surface">
              <HelpCircle className="size-10 text-ink/40 mx-auto mb-3" />
              <p className="text-base font-semibold text-ink/90">No encontramos respuestas para esa búsqueda</p>
              <p className="text-sm text-ink/60 mt-1">
                Pruebe buscando palabras más sencillas como «pago», «tasa», «romana» o elija otra área.
              </p>
            </div>
          ) : (
            qaFiltradas.map((qa) => {
              const estaAbierta = qaAbierto === qa.id
              return (
                <div
                  key={qa.id}
                  className={`rounded-[10px] border transition-all overflow-hidden bg-surface ${
                    estaAbierta
                      ? 'border-tierra-600/50 shadow-md ring-1 ring-tierra-600/15'
                      : 'border-hairline hover:border-ink/30 hover:shadow-sm'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setQaAbierto(estaAbierta ? null : qa.id)}
                    className="w-full p-4 sm:p-5 text-left flex items-start justify-between gap-4 transition-colors"
                  >
                    <div className="space-y-2.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-tierra-600/10 text-tierra-700 dark:text-tierra-300">
                          {AREAS_OPERATIVAS.find((a) => a.id === qa.area)?.label}
                        </span>
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-ink leading-snug">
                        {qa.pregunta}
                      </h3>
                      {/* Píldora de respuesta directa siempre legible y clara */}
                      <div className="p-3.5 rounded-[8px] bg-canvas/90 border border-hairline flex items-start gap-3 text-sm text-ink leading-relaxed shadow-sm">
                        <Lightbulb className="size-5 text-warning shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-tierra-600 dark:text-tierra-400 font-bold block sm:inline sm:mr-1.5">
                            Respuesta rápida:
                          </strong>
                          <span className="text-ink font-normal">{qa.respuestaCorta}</span>
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 pt-1">
                      <div
                        className={`size-8 rounded-full flex items-center justify-center transition-all ${
                          estaAbierta ? 'bg-tierra-600 text-white' : 'bg-ink/5 text-ink/70 hover:bg-ink/10'
                        }`}
                      >
                        <ChevronDown
                          className={`size-4.5 transition-transform duration-200 ${
                            estaAbierta ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    </div>
                  </button>

                  {estaAbierta && (
                    <div className="p-4 sm:p-5 pt-0 border-t border-hairline space-y-4 bg-canvas/20">
                      {/* Causa del sistema (Explicación breve) */}
                      <div className="rounded-[8px] border border-hairline bg-surface p-4 space-y-2 shadow-sm">
                        <div className="flex items-center gap-2 text-xs font-bold text-ink uppercase tracking-wider">
                          <Info className="size-4 text-tierra-600 dark:text-tierra-400" />
                          <span>¿Por qué sucede esto en el sistema?</span>
                        </div>
                        <p className="text-sm text-ink leading-relaxed pl-6 font-normal">
                          {qa.causaRaiz}
                        </p>
                      </div>

                      {/* Pasos de solución estructurados y visuales */}
                      <div className="rounded-[8px] border border-tierra-600/30 bg-surface p-4 sm:p-5 space-y-3.5 shadow-sm">
                        <div className="flex items-center gap-2 text-xs font-bold text-tierra-600 dark:text-tierra-400 uppercase tracking-wider">
                          <CheckCircle2 className="size-4.5 text-success" />
                          <span>Pasos exactos para resolverlo:</span>
                        </div>

                        <div className="space-y-3 pl-1 sm:pl-2">
                          {qa.accionSolucion.split('\n').map((line, idx) => {
                            const match = line.match(/^(\d+)\.\s*(.*)$/)
                            if (match) {
                              return (
                                <div key={idx} className="flex items-start gap-3 text-sm text-ink leading-relaxed">
                                  <span className="size-6 rounded-full bg-tierra-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                                    {match[1]}
                                  </span>
                                  <span className="flex-1 font-medium text-ink pt-0.5">{match[2]}</span>
                                </div>
                              )
                            }
                            return line.trim() ? (
                              <p key={idx} className="text-sm text-ink leading-relaxed pl-9">
                                {line}
                              </p>
                            ) : null
                          })}
                        </div>
                      </div>

                      {/* Enlace directo a la pantalla */}
                      {qa.rutaRecomendada ? (
                        <div className="flex justify-end pt-1">
                          <Link to={qa.rutaRecomendada}>
                            <Button size="sm" icon={<ExternalLink className="size-4" />}>
                              {qa.textoRuta || 'Ir a la pantalla correspondiente'}
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
      {/* PILAR 2: GUÍAS PASO A PASO (STEP-BY-STEP) */}
      {/* ========================================================================= */}
      {vista === 'paso_a_paso' && (
        <div className="space-y-4 max-w-4xl">
          {guiasFiltradas.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-hairline p-12 text-center bg-surface">
              <ListOrdered className="size-10 text-ink/40 mx-auto mb-3" />
              <p className="text-base font-semibold text-ink/90">No se encontraron guías para la búsqueda</p>
              <p className="text-sm text-ink/60 mt-1">
                Pruebe con otros términos o seleccione «Todo el sistema» en el filtro de áreas.
              </p>
            </div>
          ) : (
            guiasFiltradas.map((guia) => {
              const estaAbierta = guiaAbierta === guia.id
              return (
                <div
                  key={guia.id}
                  className={`rounded-[10px] border transition-all overflow-hidden bg-surface ${
                    estaAbierta
                      ? 'border-tierra-600/50 shadow-md ring-1 ring-tierra-600/15'
                      : 'border-hairline hover:border-ink/30 hover:shadow-sm'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setGuiaAbierta(estaAbierta ? null : guia.id)}
                    className="w-full p-4 sm:p-5 text-left flex items-start justify-between gap-4 transition-colors"
                  >
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-tierra-600/10 text-tierra-700 dark:text-tierra-300">
                          {AREAS_OPERATIVAS.find((a) => a.id === guia.area)?.label}
                        </span>
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-ink leading-snug">
                        {guia.titulo}
                      </h3>
                      <p className="text-sm text-ink/75 leading-relaxed max-w-3xl">{guia.resumen}</p>
                    </div>
                    <div className="shrink-0 pt-1">
                      <div
                        className={`size-8 rounded-full flex items-center justify-center transition-all ${
                          estaAbierta ? 'bg-tierra-600 text-white' : 'bg-ink/5 text-ink/60 hover:bg-ink/10'
                        }`}
                      >
                        <ChevronDown
                          className={`size-4.5 transition-transform duration-200 ${
                            estaAbierta ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    </div>
                  </button>

                  {estaAbierta && (
                    <div className="p-4 sm:p-5 pt-0 border-t border-hairline space-y-4 bg-canvas/20">
                      {/* Metadatos: Rol y Ruta */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs sm:text-sm">
                        <div className="p-3 rounded-[6px] border border-hairline bg-surface flex items-center justify-between">
                          <span className="text-ink/80 font-medium">¿Quién puede hacerlo?:</span>
                          <strong className="text-ink font-bold">{guia.rolRequerido}</strong>
                        </div>
                        <div className="p-3 rounded-[6px] border border-hairline bg-surface flex items-center justify-between">
                          <span className="text-ink/80 font-medium">¿Dónde se encuentra?:</span>
                          <span className="text-ink font-mono text-xs font-bold">{guia.rutaMenu}</span>
                        </div>
                      </div>

                      {/* Lista numerada de pasos */}
                      <div className="space-y-3">
                        <p className="text-xs font-bold text-ink uppercase tracking-wider">
                          Pasos a seguir:
                        </p>
                        <div className="space-y-3">
                          {guia.pasos.map((paso) => (
                            <div
                              key={paso.numero}
                              className="rounded-[8px] border border-hairline bg-surface p-4 flex items-start gap-3.5 shadow-sm"
                            >
                              <span className="size-7 rounded-full bg-tierra-600 text-white font-bold text-sm flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                                {paso.numero}
                              </span>
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-bold text-ink">{paso.titulo}</p>
                                  {paso.boton ? (
                                    <span className="px-2.5 py-0.5 rounded-[4px] border border-tierra-600/30 bg-tierra-600/10 text-xs font-mono text-tierra-700 dark:text-tierra-300 font-bold">
                                      Tocar: «{paso.boton}»
                                    </span>
                                  ) : null}
                                </div>
                                <p className="text-sm text-ink leading-relaxed font-normal">{paso.detalle}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Resultado esperado */}
                      <div className="rounded-[8px] border border-success/40 bg-surface p-4 text-sm text-ink flex items-start gap-3 shadow-sm">
                        <CheckCircle2 className="size-5 text-success shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <strong className="text-ink font-bold block">Resultado al finalizar:</strong>
                          <span className="text-ink leading-relaxed">{guia.resultado}</span>
                        </div>
                      </div>

                      {/* Cómo revertir o corregir */}
                      <div className="rounded-[8px] border border-warning/40 bg-surface p-4 text-sm text-ink flex items-start gap-3 shadow-sm">
                        <RotateCcw className="size-5 text-warning shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <strong className="text-ink font-bold block">↺ Si te equivocaste o necesitas corregir:</strong>
                          <span className="text-ink leading-relaxed">{guia.revertir}</span>
                        </div>
                      </div>

                      {/* Enlace directo a la pantalla */}
                      {guia.rutaDirecta ? (
                        <div className="pt-1 flex justify-end">
                          <Link to={guia.rutaDirecta}>
                            <Button size="sm" icon={<ExternalLink className="size-4" />}>
                              Abrir pantalla de la guía
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
