import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Vacio } from '@/components/ui/Estado'
import { fechaHora } from '@/lib/formato'
import { ESTADO_DE_SOLICITUD, type SolicitudDeSalida } from '@/lib/api/salidas'
import { ESTADO_TRASLADO, type Traslado } from '@/lib/api/inventario'
import {
  COLUMNAS_SALIDA,
  COLUMNAS_TRASLADO,
  PAGINA_HISTORICO,
  cantidadDe,
  cantidadLegible,
  materialDe,
  normalizar,
  ultimaAccionDeSolicitud,
  ultimoPasoDeTraslado,
} from './tableroSalidas'

/*
  «📚 HISTÓRICO» DE SALIDAS Y DE TRASLADOS (MGG `HistoricoSolicitudes`), 08/11/2026.

  Todas las solicitudes, con filtros y quién hizo cada cosa. El tablero enseña
  las 10 últimas de cada columna; lo demás se busca aquí. Llega con la columna
  y los filtros del tablero ya puestos cuando se entra por «📚 Ver las N
  anteriores». Se recorre de 50 en 50 («↓ Ver 50 más · faltan N»). Un clic en
  la fila abre el mismo detalle del tablero, con sus botones.
*/

export interface FiltroInicial {
  columna?: string
  usuario?: string
  solicitante?: string
}

/** El día (AAAA-MM-DD) de un instante, en la hora de aquí. */
const diaDe = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function BarraDeFiltros({ children, hay, onLimpiar }: { children: ReactNode; hay: boolean; onLimpiar: () => void }) {
  return (
    <Card className="mb-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
      {hay ? (
        <div className="mt-3">
          <Button size="sm" variant="ghost" onClick={onLimpiar}>
            ✕ Limpiar
          </Button>
        </div>
      ) : null}
    </Card>
  )
}

function Paginado({ vistos, total, onMas }: { vistos: number; total: number; onMas: () => void }) {
  if (vistos >= total) return null
  return (
    <div className="mt-3 flex justify-center">
      <Button variant="outline" size="sm" onClick={onMas}>
        ↓ Ver {Math.min(PAGINA_HISTORICO, total - vistos)} más · faltan {(total - vistos).toLocaleString('es-VE')}
      </Button>
    </div>
  )
}

export function HistoricoSolicitudes({
  sols,
  inicial,
  nombreDe,
  paraQuien,
  onVer,
  topeAlcanzado,
}: {
  sols: SolicitudDeSalida[]
  inicial: FiltroInicial
  nombreDe: (uid: string | null) => string
  paraQuien: (s: SolicitudDeSalida) => string
  onVer: (s: SolicitudDeSalida) => void
  topeAlcanzado: boolean
}) {
  const [texto, setTexto] = useState('')
  const [columna, setColumna] = useState(inicial.columna ?? '')
  const [persona, setPersona] = useState(inicial.usuario ?? '')
  const [solicitante, setSolicitante] = useState(inicial.solicitante ?? '')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [pagina, setPagina] = useState(1)

  // Cualquiera que figure en el historial: quien la pidió, la aprobó (o no) o la entregó.
  const personas = useMemo(() => {
    const ids = new Set<string>()
    for (const s of sols) for (const u of [s.pedida_por, s.aprobada_por, s.entregada_por]) if (u) ids.add(u)
    return [...ids].map((id) => ({ valor: id, etiqueta: nombreDe(id) })).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'))
  }, [sols, nombreDe])
  const solicitantes = useMemo(
    () => [...new Set(sols.map(paraQuien))].sort((a, b) => a.localeCompare(b, 'es')),
    [sols, paraQuien],
  )

  const filtradas = useMemo(() => {
    const col = COLUMNAS_SALIDA.find((c) => c.clave === columna)
    const aguja = normalizar(texto.trim())
    return sols.filter((s) => {
      if (col && !col.coincide(s)) return false
      if (persona && ![s.pedida_por, s.aprobada_por, s.entregada_por].includes(persona)) return false
      if (solicitante && paraQuien(s) !== solicitante) return false
      const dia = diaDe(s.pedida_en)
      if (desde && dia < desde) return false
      if (hasta && dia > hasta) return false
      if (aguja) {
        const pajar = normalizar(
          [
            s.numero,
            s.nota_salida,
            s.almacen?.nombre,
            paraQuien(s),
            s.motivo,
            nombreDe(s.pedida_por),
            ...(s.renglones ?? []).map((r) => `${r.articulo?.nombre ?? ''} ${r.articulo?.codigo ?? ''}`),
          ]
            .filter(Boolean)
            .join(' '),
        )
        if (!pajar.includes(aguja)) return false
      }
      return true
    })
  }, [sols, columna, persona, solicitante, desde, hasta, texto, paraQuien, nombreDe])

  const hay = Boolean(texto || columna || persona || solicitante || desde || hasta)
  const limpiar = () => {
    setTexto('')
    setColumna('')
    setPersona('')
    setSolicitante('')
    setDesde('')
    setHasta('')
    setPagina(1)
  }
  const vistos = filtradas.slice(0, pagina * PAGINA_HISTORICO)

  return (
    <div>
      <BarraDeFiltros hay={hay} onLimpiar={limpiar}>
        <Input
          label="🔎 Buscar"
          sinNormalizar
          type="search"
          placeholder="Número, nota, material, destino…"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            setPagina(1)
          }}
        />
        <Select
          label="🗂 Estado"
          vacio="Todos"
          value={columna}
          onChange={(e) => {
            setColumna(e.target.value)
            setPagina(1)
          }}
          opciones={COLUMNAS_SALIDA.map((c) => ({ valor: c.clave, etiqueta: c.etiqueta }))}
        />
        <Select
          label="👤 Quien hizo la acción"
          vacio="Todos"
          value={persona}
          onChange={(e) => {
            setPersona(e.target.value)
            setPagina(1)
          }}
          opciones={personas}
        />
        <Select
          label="🏷 Solicitante"
          vacio="Todos"
          value={solicitante}
          onChange={(e) => {
            setSolicitante(e.target.value)
            setPagina(1)
          }}
          opciones={solicitantes.map((x) => ({ valor: x, etiqueta: x }))}
        />
        <Input label="📅 Creada desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <Input label="📅 Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
      </BarraDeFiltros>

      <p className="text-ink/50 mb-2 text-xs">
        {filtradas.length.toLocaleString('es-VE')} de {sols.length.toLocaleString('es-VE')} solicitud(es)
        {topeAlcanzado ? ' · se cargan las más recientes: acotá con las fechas para ir más atrás' : ''}
      </p>

      {filtradas.length === 0 ? (
        <Card>
          <Vacio
            icono={<span className="text-3xl">📚</span>}
            titulo={sols.length === 0 ? 'Todavía no hay solicitudes.' : 'Ninguna solicitud coincide con los filtros.'}
          />
        </Card>
      ) : (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-3 py-3 font-medium">Número</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                  <th className="px-3 py-3 font-medium">Material</th>
                  <th className="px-3 py-3 font-medium">Origen → Dirigido a</th>
                  <th className="px-3 py-3 font-medium">Realizado por</th>
                </tr>
              </thead>
              <tbody>
                {vistos.map((s) => {
                  const estado = ESTADO_DE_SOLICITUD[s.estado]
                  const ultima = ultimaAccionDeSolicitud(s, nombreDe)
                  return (
                    <tr
                      key={s.id}
                      className="border-hairline hover:bg-ink/3 cursor-pointer border-b align-top last:border-0"
                      onClick={() => onVer(s)}
                    >
                      <td className="text-ink/60 px-4 py-3 text-xs whitespace-nowrap">{fechaHora(s.pedida_en)}</td>
                      <td className="px-3 py-3">
                        <span className="text-royal-700 dark:text-royal-300 font-mono text-xs font-semibold">{s.numero}</span>
                        {s.nota_salida ? (
                          <span className="text-ink/45 block font-mono text-[11px]">{s.nota_salida}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <Chip tone={estado.tono}>{estado.texto}</Chip>
                      </td>
                      <td className="text-ink/80 px-3 py-3">
                        {materialDe(s)}
                        <span className="text-ink/45 block text-xs">{cantidadDe(s)}</span>
                      </td>
                      <td className="text-ink/70 px-3 py-3">
                        <span className="inline-flex flex-wrap items-center gap-1">
                          {s.almacen?.nombre ?? '—'}
                          <ArrowRight className="text-ink/35 size-3" aria-hidden="true" />
                          <span className="text-ink/85">{paraQuien(s)}</span>
                        </span>
                      </td>
                      <td className="text-ink/60 px-3 py-3 text-xs">
                        <span className="text-ink/80 block">{ultima.evento}</span>
                        {[ultima.quien, ultima.cuando ? fechaHora(ultima.cuando) : null].filter(Boolean).join(' · ')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Paginado vistos={vistos.length} total={filtradas.length} onMas={() => setPagina((p) => p + 1)} />
    </div>
  )
}

export function HistoricoTraslados({
  traslados,
  inicial,
  onVer,
  topeAlcanzado,
}: {
  traslados: Traslado[]
  inicial: FiltroInicial
  onVer: (t: Traslado) => void
  topeAlcanzado: boolean
}) {
  const [texto, setTexto] = useState('')
  const [columna, setColumna] = useState(inicial.columna ?? '')
  const [persona, setPersona] = useState(inicial.usuario ?? '')
  const [destino, setDestino] = useState(inicial.solicitante ?? '')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [pagina, setPagina] = useState(1)

  const personas = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of traslados) {
      const pares: Array<[string | null, string | null]> = [
        [t.solicitado_por, t.solicitado_por_nombre],
        [t.aceptado_por, t.aceptado_por_nombre],
        [t.recibido_por, t.recibido_por_nombre],
        [t.cancelado_por, t.cancelado_por_nombre],
      ]
      for (const [id, nombre] of pares) if (id) m.set(id, nombre ?? '—')
    }
    return [...m.entries()]
      .map(([valor, etiqueta]) => ({ valor, etiqueta }))
      .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'))
  }, [traslados])
  const destinos = useMemo(
    () => [...new Set(traslados.map((t) => t.destino ?? '—'))].sort((a, b) => a.localeCompare(b, 'es')),
    [traslados],
  )

  const filtrados = useMemo(() => {
    const col = COLUMNAS_TRASLADO.find((c) => c.clave === columna)
    const aguja = normalizar(texto.trim())
    return traslados.filter((t) => {
      if (col && !col.coincide(t)) return false
      if (persona && ![t.solicitado_por, t.aceptado_por, t.recibido_por, t.cancelado_por].includes(persona)) return false
      if (destino && (t.destino ?? '—') !== destino) return false
      const dia = diaDe(t.solicitado_en)
      if (desde && dia < desde) return false
      if (hasta && dia > hasta) return false
      if (aguja) {
        const pajar = normalizar(
          [t.numero, t.articulo, t.articulo_codigo, t.origen, t.destino, t.motivo, t.solicitado_por_nombre]
            .filter(Boolean)
            .join(' '),
        )
        if (!pajar.includes(aguja)) return false
      }
      return true
    })
  }, [traslados, columna, persona, destino, desde, hasta, texto])

  const hay = Boolean(texto || columna || persona || destino || desde || hasta)
  const limpiar = () => {
    setTexto('')
    setColumna('')
    setPersona('')
    setDestino('')
    setDesde('')
    setHasta('')
    setPagina(1)
  }
  const vistos = filtrados.slice(0, pagina * PAGINA_HISTORICO)

  return (
    <div>
      <BarraDeFiltros hay={hay} onLimpiar={limpiar}>
        <Input
          label="🔎 Buscar"
          sinNormalizar
          type="search"
          placeholder="Número, artículo, origen, destino…"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            setPagina(1)
          }}
        />
        <Select
          label="🗂 Estado"
          vacio="Todos"
          value={columna}
          onChange={(e) => {
            setColumna(e.target.value)
            setPagina(1)
          }}
          opciones={COLUMNAS_TRASLADO.map((c) => ({ valor: c.clave, etiqueta: c.etiqueta }))}
        />
        <Select
          label="👤 Quien hizo la acción"
          vacio="Todos"
          value={persona}
          onChange={(e) => {
            setPersona(e.target.value)
            setPagina(1)
          }}
          opciones={personas}
        />
        <Select
          label="🏬 Almacén destino"
          vacio="Todos"
          value={destino}
          onChange={(e) => {
            setDestino(e.target.value)
            setPagina(1)
          }}
          opciones={destinos.map((x) => ({ valor: x, etiqueta: x }))}
        />
        <Input label="📅 Creado desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <Input label="📅 Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
      </BarraDeFiltros>

      <p className="text-ink/50 mb-2 text-xs">
        {filtrados.length.toLocaleString('es-VE')} de {traslados.length.toLocaleString('es-VE')} traslado(s)
        {topeAlcanzado ? ' · se cargan los más recientes' : ''}
      </p>

      {filtrados.length === 0 ? (
        <Card>
          <Vacio
            icono={<span className="text-3xl">📚</span>}
            titulo={traslados.length === 0 ? 'Todavía no hay traslados.' : 'Ningún traslado coincide con los filtros.'}
          />
        </Card>
      ) : (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-3 py-3 font-medium">Número</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                  <th className="px-3 py-3 font-medium">Artículo</th>
                  <th className="px-3 py-3 font-medium">Origen → Destino</th>
                  <th className="px-3 py-3 font-medium">Realizado por</th>
                </tr>
              </thead>
              <tbody>
                {vistos.map((t) => {
                  const estado = ESTADO_TRASLADO[t.estado]
                  const paso = ultimoPasoDeTraslado(t)
                  return (
                    <tr
                      key={t.id}
                      className="border-hairline hover:bg-ink/3 cursor-pointer border-b align-top last:border-0"
                      onClick={() => onVer(t)}
                    >
                      <td className="text-ink/60 px-4 py-3 text-xs whitespace-nowrap">{fechaHora(t.solicitado_en)}</td>
                      <td className="px-3 py-3">
                        <span className="text-royal-700 dark:text-royal-300 font-mono text-xs font-semibold">{t.numero}</span>
                      </td>
                      <td className="px-3 py-3">
                        <Chip tone={estado.tono}>{estado.texto}</Chip>
                      </td>
                      <td className="text-ink/80 px-3 py-3">
                        {t.articulo ?? '—'}
                        <span className="text-ink/45 block text-xs">
                          {cantidadLegible(t.cantidad)} {t.unidad ?? ''}
                        </span>
                      </td>
                      <td className="text-ink/70 px-3 py-3">
                        <span className="inline-flex flex-wrap items-center gap-1">
                          {t.origen ?? '—'}
                          <ArrowRight className="text-ink/35 size-3" aria-hidden="true" />
                          <span className="text-ink/85">{t.destino ?? '—'}</span>
                        </span>
                      </td>
                      <td className="text-ink/60 px-3 py-3 text-xs">
                        <span className="text-ink/80 block">{paso.quien}</span>
                        {paso.cuando ? fechaHora(paso.cuando) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Paginado vistos={vistos.length} total={filtrados.length} onMas={() => setPagina((p) => p + 1)} />
    </div>
  )
}
