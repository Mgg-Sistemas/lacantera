import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AvisosFlotantes } from '@/components/AvisosFlotantes'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Vacio } from '@/components/ui/Estado'
import { cn } from '@/lib/cn'
import { useMiPerfil, useSoloTelefono } from '@/lib/api/usuarios'
import { useMisRoles } from '@/lib/api/catalogo'
import {
  usePermisosPedidos,
  usePorRecibir,
  useSolicitudesEnRevision,
  useSolicitudesRevisadas,
  type Orden,
} from '@/lib/api/pedidos'
import {
  fechaHoraVE,
  relTime,
  resultadoRevision,
  resumenRevision,
  seRevisa,
  solicitaDe,
  textoEstadoSedes,
} from '@/lib/pedidos'
import { mensajeRevisionAlmacen } from '@/lib/ficha/pedidosWhatsapp'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { ModalWhatsappCompra } from '@/pages/compras/ModalWhatsappCompra'
import { RevisionSolicitudAlmacen } from './RevisionSolicitudAlmacen'
import { usePdfSolicitud } from './usePdfSolicitud'
import { RecepcionesTelefono } from './RecepcionesTelefono'

/*
  SOLICITUDES DE PEDIDO EN EL TELÉFONO (MGG `SolicitudesAlmacenMovilView.tsx`)

  Los botones grandes de filtro, la lista y la revisión en variante teléfono,
  como en MGG. Las revisadas son las de los últimos 7 días y al tocarlas sale
  su mensaje de WhatsApp. Sin «🔁 Traslados por hacer»: revisa un solo
  almacén (decisión de la dueña, 07/11/2026).

  Fase 4: el botón «📥 Recepciones» abre la recepción de las OC por teléfono
  (MGG `RecepcionesTelefono.tsx`).
*/

const DIAS_REVISADAS = 7

type Filtro = 'pendientes' | 'urgentes' | 'revisadas'

export function SolicitudesAlmacenMovil() {
  const permisos = usePermisosPedidos()
  const enRevision = useSolicitudesEnRevision()
  const revisadasQ = useSolicitudesRevisadas(DIAS_REVISADAS)
  const { data: yo } = useMiPerfil()
  const { roles } = useMisRoles()
  const { soloTelefono } = useSoloTelefono()
  const { ver, armando, visor } = usePdfSolicitud()

  const [filtro, setFiltro] = useState<Filtro>('pendientes')
  const [busca, setBusca] = useState('')
  const [selId, setSelId] = useState<number | null>(null)
  const [mensaje, setMensaje] = useState<{ titulo: string; texto: string } | null>(null)
  const [enRecepciones, setEnRecepciones] = useState(false)
  const porRecibirQ = usePorRecibir()
  const porRecibir = porRecibirQ.data ?? []

  const pendientes = useMemo(() => enRevision.data ?? [], [enRevision.data])
  const urgentes = pendientes.filter((o) => o.urgente)
  const revisadas = useMemo(() => revisadasQ.data ?? [], [revisadasQ.data])
  const sel = pendientes.find((o) => o.id === selId) ?? null

  useEffect(() => {
    if (enRevision.error || revisadasQ.error) {
      toast(mensajeDe(enRevision.error ?? revisadasQ.error, 'No se pudieron cargar las solicitudes'), 'error')
    }
  }, [enRevision.error, revisadasQ.error])

  // Coincidencia en mayúsculas sobre código, solicitante, finalidad y productos (como MGG).
  const filtra = (lista: Orden[]) => {
    const q = busca.trim().toUpperCase()
    if (!q) return lista
    return lista.filter((o) =>
      [o.codigo, solicitaDe(o), o.finalidad, o.motivo, ...(o.items ?? []).map((i) => i.nombre)]
        .filter(Boolean)
        .join(' ')
        .toUpperCase()
        .includes(q),
    )
  }

  const alConfirmar = (actualizada: Orden) => {
    // En el teléfono siempre se vuelve a la lista.
    setSelId(null)
    if (actualizada.estado !== 'revision_almacen') {
      setMensaje({ titulo: `✅ Almacén revisó ${actualizada.codigo}`, texto: mensajeRevisionAlmacen(actualizada) })
    }
  }

  const lista = filtra(filtro === 'pendientes' ? pendientes : filtro === 'urgentes' ? urgentes : revisadas)

  const botonFiltro = (f: Filtro, contenido: React.ReactNode, clase?: string) => (
    <button
      type="button"
      aria-pressed={filtro === f}
      onClick={() => setFiltro(f)}
      className={cn(
        'bg-surface shadow-card flex flex-col items-center justify-center gap-0.5 rounded-[10px] border px-3 py-3 text-center',
        filtro === f ? 'border-royal-600' : 'border-transparent opacity-80',
        clase,
      )}
    >
      {contenido}
    </button>
  )

  return (
    <div className="mx-auto max-w-lg pb-10">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-ink/90 text-2xl font-semibold">📋 Solicitudes de Pedido</h1>
          <p className="text-ink/55 mt-0.5 text-sm">
            {yo?.nombre ?? ''}
            {roles.length ? ` · ${roles.filter((r) => r !== 'BASICO')[0] ?? ''}` : ''} · Almacén
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {sel ? (
            <Button variant="outline" onClick={() => setSelId(null)}>
              ← Lista
            </Button>
          ) : null}
          {!soloTelefono ? (
            <Link to="/app/solicitudes-pedido">
              <Button variant="ghost" size="sm">
                🖥 Módulo completo
              </Button>
            </Link>
          ) : null}
        </div>
      </div>

      {enRecepciones ? (
        <RecepcionesTelefono
          filas={porRecibir}
          cargando={porRecibirQ.isPending}
          error={porRecibirQ.error}
          canWrite={permisos.data?.recibe_almacen === true}
          onVolver={() => setEnRecepciones(false)}
        />
      ) : sel ? (
        <RevisionSolicitudAlmacen
          key={sel.id}
          orden={sel}
          variante="telefono"
          canWrite={permisos.data?.revisa_almacen === true}
          onConfirmada={alConfirmar}
          onVerPdf={() => void ver(sel)}
          armandoPdf={armando === sel.id}
        />
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3">
            {botonFiltro(
              'pendientes',
              <>
                <span className="text-2xl">🕒</span>
                <span className="text-xl font-semibold">{pendientes.length}</span>
                <small className="text-ink/55">Por revisar</small>
              </>,
            )}
            {botonFiltro(
              'urgentes',
              <>
                <span className="text-2xl">🚨</span>
                <span className="text-xl font-semibold">{urgentes.length}</span>
                <small className="text-ink/55">Urgentes</small>
              </>,
              filtro === 'urgentes' ? 'bg-danger/14' : undefined,
            )}
            {botonFiltro(
              'revisadas',
              <>
                <span className="text-2xl">✅</span>
                <span className="font-semibold">Revisadas ({revisadas.length})</span>
                <small className="text-ink/55">Últimos 7 días · toca una para el mensaje de WhatsApp</small>
              </>,
              cn('col-span-2 min-h-[84px]', filtro === 'revisadas' && 'bg-success/14'),
            )}
            <button
              type="button"
              onClick={() => setEnRecepciones(true)}
              className="bg-surface shadow-card col-span-2 flex min-h-[84px] flex-col items-center justify-center gap-0.5 rounded-[10px] border border-transparent px-3 py-3 text-center"
            >
              <span className="text-2xl">📥</span>
              <span className="font-semibold">Recepciones ({porRecibir.length})</span>
              <small className="text-ink/55">Órdenes de compra por recibir en el Almacén General</small>
            </button>
          </div>

          <Input
            label="Buscar"
            ocultarEtiqueta
            sinNormalizar
            type="search"
            placeholder="🔎 Buscar SP, solicitante o producto"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="mb-3"
          />

          {enRevision.isPending || revisadasQ.isPending ? (
            <p className="text-ink/50 text-sm">Cargando…</p>
          ) : lista.length === 0 ? (
            busca.trim() ? (
              <p className="text-ink/50 text-sm">Nada coincide con la búsqueda.</p>
            ) : filtro === 'revisadas' ? (
              <Vacio icono={<span className="text-3xl">✅</span>} titulo="No hay solicitudes revisadas en los últimos 7 días." />
            ) : filtro === 'urgentes' ? (
              <Vacio titulo="No hay solicitudes urgentes por revisar." />
            ) : (
              <Vacio icono={<span className="text-3xl">📋</span>} titulo="No hay solicitudes esperando revisión de almacén." />
            )
          ) : (
            <div className="space-y-2">
              {lista.map((o) => {
                if (filtro === 'revisadas') {
                  const res = resultadoRevision(o)
                  const rr = resumenRevision(o.items ?? [])
                  return (
                    <div key={o.id} className="flex gap-2">
                      <button
                        type="button"
                        className="bg-surface shadow-card flex flex-1 items-center gap-3 rounded-[10px] p-3 text-left"
                        onClick={() =>
                          setMensaje({ titulo: `✅ Revisión de ${o.codigo}`, texto: mensajeRevisionAlmacen(o) })
                        }
                      >
                        <span className="text-2xl">{o.estado === 'atendida_almacen' ? '📦' : '🛒'}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {o.codigo} · {solicitaDe(o)}
                          </span>
                          <span className="text-ink/55 mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                            <Chip tone={res.tono === 'royal' ? 'royal' : res.tono}>{res.texto}</Chip>
                            {fechaHoraVE(o.revisada_almacen_en)}
                          </span>
                        </span>
                        <span className="text-right text-sm">
                          📦 {rr.tiene.length}
                          <br />
                          🛒 {rr.falta.length}
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        className="h-auto flex-col"
                        aria-label={`Ver PDF de ${o.codigo}`}
                        disabled={armando === o.id}
                        onClick={() => void ver(o)}
                      >
                        <span>📄</span>
                        <span className="text-xs">{armando === o.id ? '…' : 'PDF'}</span>
                      </Button>
                    </div>
                  )
                }
                const n = (o.items ?? []).filter(seRevisa).length
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setSelId(o.id)}
                    className={cn(
                      'bg-surface shadow-card flex w-full items-center gap-3 rounded-[10px] border p-3 text-left',
                      o.urgente ? 'border-danger' : 'border-transparent',
                    )}
                  >
                    <span className="text-2xl">{o.urgente ? '🚨' : '📋'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {o.codigo} · {solicitaDe(o)}
                      </span>
                      <span className="text-ink/55 block text-xs">
                        {n} producto(s) · {relTime(o.creado_en)}
                      </span>
                      <span className="text-ink/55 block text-xs">🏬 {textoEstadoSedes(o)}</span>
                    </span>
                    <span className="text-lg font-semibold">{n}</span>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {mensaje ? (
        <ModalWhatsappCompra titulo={mensaje.titulo} texto={mensaje.texto} onCerrar={() => setMensaje(null)} />
      ) : null}
      {visor}
      <AvisosFlotantes />
    </div>
  )
}
