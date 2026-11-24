import { useMemo, useState } from 'react'
import {
  Calendar as CalendarIcon,
  FileText,
  Landmark,
  Search,
  ChevronLeft,
  ChevronRight,
  Scale,
  RefreshCw,
} from 'lucide-react'
import {
  listarFeriadosSudeban,
  esFeriadoBancario,
  esFinDeSemana,
  ymdCaracas,
  type FeriadoBancario,
} from '@/lib/calendarioBancario'
import { useTomarTasaAhora } from '@/lib/api/tasas'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const DIAS_SEMANA_HEADERS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function formatearFechaVE(iso: string) {
  const parts = iso.slice(0, 10).split('-')
  if (parts.length !== 3) return iso
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

export function CalendarioBancarioView({
  fechaHoy,
  onCerrar,
}: {
  fechaHoy?: string
  onCerrar?: () => void
}) {
  const hoyStr = fechaHoy || ymdCaracas(new Date())
  const anioActual = Number(hoyStr.slice(0, 4)) || 2026
  const mesActual = (Number(hoyStr.slice(5, 7)) || 1) - 1

  const [anio, setAnio] = useState<number>(anioActual)
  const [vista, setVista] = useState<'calendario' | 'lista'>('lista')
  const [mes, setMes] = useState<number>(mesActual)
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'bancario' | 'nacional'>('todos')
  const [busqueda, setBusqueda] = useState<string>('')
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null)

  const tomarAhora = useTomarTasaAhora()

  // Feriados del año seleccionado
  const feriadosAnio = useMemo(() => listarFeriadosSudeban(anio), [anio])

  // Feriados filtrados para la vista de lista
  const feriadosFiltradosLista = useMemo(() => {
    return feriadosAnio.filter((f) => {
      if (filtroTipo === 'bancario' && f.tipo !== 'bancario') return false
      if (filtroTipo === 'nacional' && f.tipo !== 'nacional') return false
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase().trim()
        const coincideMotivo = f.motivo.toLowerCase().includes(q)
        const coincideFecha = f.fecha.includes(q) || formatearFechaVE(f.fecha).includes(q)
        const coincideDia = (f.diaNombre ?? '').toLowerCase().includes(q)
        if (!coincideMotivo && !coincideFecha && !coincideDia) return false
      }
      return true
    })
  }, [feriadosAnio, filtroTipo, busqueda])

  // Mapa de feriados para consulta rápida en la cuadrícula del calendario
  const mapaFeriados = useMemo(() => {
    const map = new Map<string, FeriadoBancario>()
    feriadosAnio.forEach((f) => map.set(f.fecha, f))
    return map
  }, [feriadosAnio])

  // Cantidad de feriados por mes en el año actual (para mostrar badges en los botones de mes)
  const conteoPorMes = useMemo(() => {
    const counts = new Array(12).fill(0)
    feriadosAnio.forEach((f) => {
      const m = parseInt(f.fecha.slice(5, 7), 10) - 1
      if (m >= 0 && m < 12) counts[m]++
    })
    return counts
  }, [feriadosAnio])

  // Feriados del mes actualmente seleccionado
  const feriadosMes = useMemo(() => {
    const prefix = `${anio}-${pad2(mes + 1)}`
    return feriadosAnio.filter((f) => f.fecha.startsWith(prefix))
  }, [feriadosAnio, anio, mes])

  // Cuadrícula de días del mes seleccionado
  const diasMes = useMemo(() => {
    const primerDia = new Date(Date.UTC(anio, mes, 1, 12, 0, 0))
    const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0, 12, 0, 0))
    const totalDias = ultimoDia.getUTCDate()

    // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado. Ajustamos para que Lunes sea 0 y Domingo sea 6
    let primerDiaSemana = primerDia.getUTCDay() - 1
    if (primerDiaSemana === -1) primerDiaSemana = 6

    const celdas: Array<{
      dia: number | null
      iso: string
      feriado: FeriadoBancario | null
      esFinde: boolean
      esHoy: boolean
    }> = []

    for (let i = 0; i < primerDiaSemana; i++) {
      celdas.push({ dia: null, iso: '', feriado: null, esFinde: false, esHoy: false })
    }

    for (let d = 1; d <= totalDias; d++) {
      const iso = `${anio}-${pad2(mes + 1)}-${pad2(d)}`
      const feriado = mapaFeriados.get(iso) ?? null
      const esFinde = esFinDeSemana(iso)
      const esHoy = iso === hoyStr
      celdas.push({ dia: d, iso, feriado, esFinde, esHoy })
    }

    return celdas
  }, [anio, mes, mapaFeriados, hoyStr])

  // ¿Hoy es feriado?
  const feriadoHoy = useMemo(() => {
    return esFeriadoBancario(hoyStr) ? mapaFeriados.get(hoyStr) ?? null : null
  }, [hoyStr, mapaFeriados])

  function cambiarMes(delta: number) {
    setMes((m) => {
      const nuevo = m + delta
      if (nuevo < 0) {
        setAnio((a) => a - 1)
        return 11
      }
      if (nuevo > 11) {
        setAnio((a) => a + 1)
        return 0
      }
      return nuevo
    })
  }

  const feriadoDetalle = diaSeleccionado ? mapaFeriados.get(diaSeleccionado) : null

  return (
    <div className="space-y-4">
      {/* ── Banner destacado si hoy es feriado bancario o fin de semana ── */}
      {feriadoHoy ? (
        <div className="relative overflow-hidden rounded-xl border border-amber-500/40 bg-amber-500/12 p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
                <Landmark className="size-6" />
              </div>
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/20 px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wider text-amber-300">
                  <span>¡HOY ES {feriadoHoy.tipo === 'bancario' ? 'LUNES BANCARIO' : 'FERIADO BANCARIO'}!</span>
                </div>
                <h3 className="mt-1 text-base sm:text-lg font-bold text-ink">
                  {feriadoHoy.motivo}
                </h3>
                <p className="mt-0.5 text-xs sm:text-sm text-ink/80 leading-relaxed">
                  Los bancos no operan hoy. La tasa oficial del BCV rige con{' '}
                  <strong className="font-semibold text-amber-300">
                    fecha valor del {feriadoHoy.diaEfectivoNombre} ({formatearFechaVE(feriadoHoy.fechaEfectivaBcv ?? '')})
                  </strong>.
                </p>
              </div>
            </div>
            {feriadoHoy.trasladadoDesde ? (
              <div className="shrink-0 rounded-lg border border-hairline bg-surface/70 px-3 py-1.5 text-2xs text-ink/70">
                Feriado religioso trasladado del {formatearFechaVE(feriadoHoy.trasladadoDesde)}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── Barra de controles: Selector de Año y Vistas ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-hairline bg-surface p-3">
        {/* Selector de Año */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-ink/60">Año:</span>
          <div className="flex rounded-lg border border-hairline p-0.5 bg-surface-subtle">
            {[2025, 2026, 2027].map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setAnio(y)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-semibold transition-all',
                  anio === y
                    ? 'bg-amber-500 text-stone-950 shadow-sm'
                    : 'text-ink/65 hover:text-ink hover:bg-surface'
                )}
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        {/* Selector de Vista: Calendario vs Lista */}
        <div className="flex rounded-lg border border-hairline p-0.5 bg-surface-subtle">
          <button
            type="button"
            onClick={() => setVista('calendario')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all',
              vista === 'calendario'
                ? 'bg-amber-500 text-stone-950 font-semibold shadow-sm'
                : 'text-ink/65 hover:text-ink hover:bg-surface'
            )}
          >
            <CalendarIcon className="size-3.5" />
            <span>Vista Calendario</span>
          </button>
          <button
            type="button"
            onClick={() => setVista('lista')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all',
              vista === 'lista'
                ? 'bg-amber-500 text-stone-950 font-semibold shadow-sm'
                : 'text-ink/65 hover:text-ink hover:bg-surface'
            )}
          >
            <FileText className="size-3.5" />
            <span>Vista Lista ({feriadosAnio.length})</span>
          </button>
        </div>
      </div>

      {/* ── VISTA DE LISTA ── */}
      {vista === 'lista' ? (
        <div className="rounded-xl border border-hairline bg-surface p-4 space-y-4 shadow-sm">
          {/* Filtros por tipo y buscador */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setFiltroTipo('todos')}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                  filtroTipo === 'todos'
                    ? 'border-amber-500 bg-amber-500 text-stone-950 font-semibold'
                    : 'border-hairline bg-surface text-ink/70 hover:bg-surface-subtle'
                )}
              >
                Todos ({feriadosAnio.length})
              </button>
              <button
                type="button"
                onClick={() => setFiltroTipo('bancario')}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                  filtroTipo === 'bancario'
                    ? 'border-amber-500 bg-amber-500 text-stone-950 font-semibold'
                    : 'border-hairline bg-surface text-ink/70 hover:bg-surface-subtle'
                )}
              >
                <Landmark className="size-3" />
                <span>Lunes Bancarios ({feriadosAnio.filter((x) => x.tipo === 'bancario').length})</span>
              </button>
              <button
                type="button"
                onClick={() => setFiltroTipo('nacional')}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                  filtroTipo === 'nacional'
                    ? 'border-amber-500 bg-amber-500 text-stone-950 font-semibold'
                    : 'border-hairline bg-surface text-ink/70 hover:bg-surface-subtle'
                )}
              >
                <span>🇻🇪 Feriados Nacionales ({feriadosAnio.filter((x) => x.tipo === 'nacional').length})</span>
              </button>
            </div>

            {/* Buscador de feriado */}
            <div className="relative min-w-[200px] max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink/40" />
              <input
                type="search"
                placeholder="Buscar feriado..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full rounded-lg border border-hairline bg-surface py-1.5 pl-8 pr-3 text-xs text-ink placeholder:text-ink/40 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Tabla de feriados */}
          <div className="overflow-x-auto rounded-lg border border-hairline">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-hairline bg-surface-subtle text-2xs uppercase tracking-wider text-ink/60">
                <tr>
                  <th className="px-3.5 py-2.5 font-semibold">Fecha</th>
                  <th className="px-3 py-2.5 font-semibold">Día</th>
                  <th className="px-3.5 py-2.5 font-semibold">Motivo / Conmemoración</th>
                  <th className="px-3 py-2.5 font-semibold">Tipo</th>
                  <th className="px-3.5 py-2.5 font-semibold">Fecha Valor BCV</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {feriadosFiltradosLista.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-ink/50">
                      No se encontraron feriados con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  feriadosFiltradosLista.map((f) => {
                    const esHoy = f.fecha === hoyStr
                    const esPasado = f.fecha < hoyStr

                    return (
                      <tr
                        key={f.fecha}
                        className={cn(
                          'transition-colors hover:bg-surface-subtle/60',
                          esHoy && 'bg-amber-500/15 font-medium'
                        )}
                      >
                        <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-ink">
                          {formatearFechaVE(f.fecha)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-ink/75">
                          {f.diaNombre}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <div className="flex flex-col">
                            <span className="font-semibold text-ink">{f.motivo}</span>
                            {f.trasladadoDesde ? (
                              <span className="text-3xs text-ink/50">
                                Trasladado del {formatearFechaVE(f.trasladadoDesde)}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-3xs font-medium border',
                              f.tipo === 'bancario'
                                ? 'border-amber-500/40 bg-amber-500/15 text-amber-400'
                                : 'border-sky-500/40 bg-sky-500/15 text-sky-400'
                            )}
                          >
                            {f.tipo === 'bancario' ? (
                              <>
                                <Landmark className="size-2.5" />
                                <span>Lunes Bancario</span>
                              </>
                            ) : (
                              <span>🇻🇪 Nacional</span>
                            )}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 text-ink/70">
                          {f.diaEfectivoNombre} {formatearFechaVE(f.fechaEfectivaBcv ?? '')}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right">
                          {esHoy ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500 bg-amber-500 px-2 py-0.5 text-3xs font-bold text-stone-950 uppercase shadow-sm">
                              ¡HOY!
                            </span>
                          ) : esPasado ? (
                            <span className="text-3xs text-ink/40">Pasado</span>
                          ) : (
                            <span className="inline-flex rounded-full border border-hairline bg-surface-subtle px-2 py-0.5 text-3xs text-ink/65">
                              Próximo
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── VISTA DE CALENDARIO ── */
        <div className="rounded-xl border border-hairline bg-surface p-4 space-y-4 shadow-sm">
          {/* Selector de meses con píldoras y contadores */}
          <div className="flex flex-wrap gap-1 border-b border-hairline pb-3">
            {MESES_CORTOS.map((nombreMes, idx) => {
              const conteo = conteoPorMes[idx]
              const esMesSeleccionado = mes === idx

              return (
                <button
                  key={nombreMes}
                  type="button"
                  onClick={() => setMes(idx)}
                  className={cn(
                    'relative rounded-lg px-2.5 py-1 text-xs font-medium transition-colors flex items-center gap-1.5',
                    esMesSeleccionado
                      ? 'bg-amber-500 text-stone-950 font-bold'
                      : 'text-ink/70 hover:bg-surface-subtle hover:text-ink'
                  )}
                >
                  <span>{nombreMes}</span>
                  {conteo > 0 ? (
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.2 text-3xs font-bold',
                        esMesSeleccionado
                          ? 'bg-stone-950 text-amber-400'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      )}
                    >
                      {conteo}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>

          {/* Navegador de mes actual */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => cambiarMes(-1)}
              className="inline-flex items-center gap-1 text-xs"
            >
              <ChevronLeft className="size-3.5" />
              <span>Anterior</span>
            </Button>
            <h4 className="text-sm font-bold text-ink">
              {MESES[mes]} {anio}
            </h4>
            <Button
              variant="outline"
              size="sm"
              onClick={() => cambiarMes(1)}
              className="inline-flex items-center gap-1 text-xs"
            >
              <span>Siguiente</span>
              <ChevronRight className="size-3.5" />
            </Button>
          </div>

          {/* Cuadrícula de 7 columnas */}
          <div className="grid grid-cols-7 gap-1.5 text-center">
            {DIAS_SEMANA_HEADERS.map((h, i) => (
              <div
                key={h}
                className={cn(
                  'rounded-md py-1.5 text-2xs font-semibold uppercase tracking-wider',
                  i >= 5 ? 'text-amber-500/70 bg-amber-500/5' : 'text-ink/60 bg-surface-subtle'
                )}
              >
                {h}
              </div>
            ))}

            {diasMes.map((c, i) => {
              if (c.dia === null) {
                return <div key={`empty-${i}`} className="min-h-16 rounded-lg bg-surface-subtle/30" />
              }

              const tieneFeriado = Boolean(c.feriado)
              const esBancario = c.feriado?.tipo === 'bancario'

              return (
                <div
                  key={c.iso}
                  onClick={() => (tieneFeriado ? setDiaSeleccionado(c.iso) : null)}
                  className={cn(
                    'group relative flex min-h-16 flex-col justify-between rounded-lg border p-1.5 text-left transition-all',
                    tieneFeriado
                      ? esBancario
                        ? 'cursor-pointer border-amber-500/50 bg-amber-500/15 hover:border-amber-500 hover:bg-amber-500/25'
                        : 'cursor-pointer border-sky-500/50 bg-sky-500/15 hover:border-sky-500 hover:bg-sky-500/25'
                      : c.esFinde
                        ? 'border-hairline/60 bg-surface-subtle/40'
                        : 'border-hairline bg-surface hover:bg-surface-subtle/40',
                    c.esHoy && 'ring-2 ring-amber-500 font-bold'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'text-xs font-semibold leading-none',
                        c.esHoy
                          ? 'rounded-full bg-amber-500 px-1.5 py-0.5 text-stone-950 font-bold'
                          : tieneFeriado
                            ? esBancario
                              ? 'text-amber-400'
                              : 'text-sky-400'
                            : 'text-ink'
                      )}
                    >
                      {c.dia}
                    </span>
                    {tieneFeriado ? (
                      <span className="text-3xs">
                        {esBancario ? '🏦' : '🇻🇪'}
                      </span>
                    ) : null}
                  </div>

                  {c.feriado ? (
                    <div className="mt-1 line-clamp-2 text-3xs font-medium leading-tight text-ink">
                      {c.feriado.motivo}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          {/* Detalle del feriado seleccionado o lista del mes */}
          {feriadoDetalle ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-amber-300">
                  {formatearFechaVE(feriadoDetalle.fecha)} ({feriadoDetalle.diaNombre}): {feriadoDetalle.motivo}
                </p>
                <p className="text-2xs text-ink/80 mt-0.5">
                  Tipo: <strong className="font-semibold">{feriadoDetalle.tipo === 'bancario' ? 'Lunes Bancario (SUDEBAN)' : 'Feriado Nacional'}</strong>
                  {' · '}
                  Rige tasa BCV: <strong className="font-semibold">{feriadoDetalle.diaEfectivoNombre} ({formatearFechaVE(feriadoDetalle.fechaEfectivaBcv ?? '')})</strong>
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setDiaSeleccionado(null)}>
                Cerrar detalle
              </Button>
            </div>
          ) : feriadosMes.length > 0 ? (
            <div className="rounded-lg border border-hairline bg-surface-subtle/50 p-3">
              <h5 className="text-2xs font-semibold uppercase tracking-wider text-ink/60 mb-1.5">
                Feriados de {MESES[mes]} ({feriadosMes.length}):
              </h5>
              <div className="space-y-1">
                {feriadosMes.map((f) => (
                  <div key={f.fecha} className="flex items-center justify-between text-xs text-ink">
                    <span>
                      <strong>{formatearFechaVE(f.fecha)}</strong> ({f.diaNombre}): {f.motivo}
                    </span>
                    <span className="text-2xs text-ink/60">
                      Tasa BCV valor: {f.diaEfectivoNombre} {formatearFechaVE(f.fechaEfectivaBcv ?? '')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-2 text-center text-xs text-ink/50">
              No hay feriados bancarios ni nacionales en {MESES[mes]} {anio}.
            </div>
          )}
        </div>
      )}

      {/* ── Botones de acción inferiores ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-hairline bg-surface p-3">
        <div className="flex items-center gap-2">
          {onCerrar ? (
            <Button variant="outline" size="sm" onClick={onCerrar}>
              Cerrar
            </Button>
          ) : null}
          <div className="text-2xs text-ink/50">
            Fuente oficial: Superintendencia de las Instituciones del Sector Bancario (SUDEBAN)
          </div>
        </div>

        <Button
          size="sm"
          className="bg-amber-500 text-stone-950 font-bold hover:bg-amber-400 border border-amber-600 shadow-sm inline-flex items-center gap-2"
          disabled={tomarAhora.isPending}
          onClick={() => tomarAhora.mutate('USD')}
        >
          <RefreshCw className={cn('size-3.5', tomarAhora.isPending && 'animate-spin')} />
          <span>{tomarAhora.isPending ? 'Actualizando BCV…' : 'Actualizar BCV'}</span>
        </Button>
      </div>

      {/* ── Nota normativa legal al pie ── */}
      <div className="flex items-start gap-2.5 rounded-lg border border-hairline/80 bg-surface-subtle/40 p-3 text-2xs text-ink/70 leading-relaxed">
        <Scale className="size-4 shrink-0 text-amber-500 mt-0.5" />
        <div>
          <strong className="font-semibold text-ink">
            Normativa SUDEBAN y Banco Central de Venezuela (BCV):
          </strong>{' '}
          Los feriados bancarios aplican a todas las instituciones del sistema bancario nacional. En días no
          bancarios y fines de semana no operan mesas de cambio interbancarias, por lo cual la tasa oficial publicada
          por el BCV rige con <em>fecha valor</em> del siguiente día hábil bancario.
        </div>
      </div>
    </div>
  )
}
