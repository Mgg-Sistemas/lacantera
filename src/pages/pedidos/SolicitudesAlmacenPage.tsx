import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { AvisosFlotantes } from '@/components/AvisosFlotantes'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Vacio } from '@/components/ui/Estado'
import { cn } from '@/lib/cn'
import { useMisAcciones, useSoloTelefono } from '@/lib/api/usuarios'
import {
  usePermisosPedidos,
  usePorRecibir,
  useSolicitudesEnRevision,
  useSolicitudesRevisadas,
  type Orden,
} from '@/lib/api/pedidos'
import {
  ETIQUETA_ALMACEN,
  coincide,
  esMercado,
  estadoRevision,
  fechaHoraVE,
  relTime,
  resultadoRevision,
  resumenRevision,
  seRevisa,
  solicitaDe,
} from '@/lib/pedidos'
import { mensajeRevisionAlmacen } from '@/lib/ficha/pedidosWhatsapp'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { ModalWhatsappCompra } from '@/pages/compras/ModalWhatsappCompra'
import { ResumenListas, RevisionSolicitudAlmacen } from './RevisionSolicitudAlmacen'
import { ACCION_TELEFONO_SOLICITUDES, usePdfSolicitud } from './usePdfSolicitud'
import { RecepcionesPorRecibir } from './RecepcionesPorRecibir'

/*
  SOLICITUDES DE PEDIDO EN EL ALMACÉN (MGG `SolicitudesAlmacenPage.tsx`)

  Las pestañas «🕒 Por revisar» y «✅ Revisadas» de MGG, con su lista a la
  izquierda y la revisión a la derecha, y la tabla de revisadas que se
  despliega. MGG tiene una tercera, «🔁 Traslados por hacer», porque revisan
  dos sedes y lo que tiene una viaja a la otra; aquí revisa solo el almacén
  general (decisión de la dueña, 07/11/2026), así que no hay traslados: lo que
  tiene sale por una solicitud de salida.

  Fase 4: la tercera pestaña es «📥 Recepciones por recibir» (MGG Inventario →
  Recepciones): las OC pagadas o en contra entrega que el almacén recibe en
  ALM-GEN, con el modal «Recibir {OC}» y el histórico de recepciones.
*/

type Pestana = 'pendientes' | 'revisadas' | 'recepciones'

export function SolicitudesAlmacenPage() {
  const permisos = usePermisosPedidos()
  const enRevision = useSolicitudesEnRevision()
  const revisadasQ = useSolicitudesRevisadas(30)
  const porRecibirQ = usePorRecibir()
  const porRecibir = useMemo(() => porRecibirQ.data ?? [], [porRecibirQ.data])
  const [recepcionAbrir, setRecepcionAbrir] = useState<number | null>(null)
  const { puede: puedeAccion } = useMisAcciones()
  const { soloTelefono } = useSoloTelefono()
  const { ver, armando, visor } = usePdfSolicitud()

  /*
    08/11/2026 · El botón «Recepciones» de la pantalla de inventario (la de
    MGG) trae `?pestana=recepciones` para abrir directo «📥 Recepciones por
    recibir», como la pestaña «Recepciones» de MGG.
  */
  const [searchParams, setSearchParams] = useSearchParams()
  const [pestana, setPestana] = useState<Pestana>(() =>
    searchParams.get('pestana') === 'recepciones' ? 'recepciones' : 'pendientes',
  )
  const [busca, setBusca] = useState('')
  const [buscaRev, setBuscaRev] = useState('')
  const [selId, setSelId] = useState<number | null>(null)
  const [abierta, setAbierta] = useState<number | null>(null)
  const [mensajes, setMensajes] = useState<{ titulo: string; texto: string }[]>([])

  const pendientes = useMemo(() => enRevision.data ?? [], [enRevision.data])
  const revisadas = useMemo(() => revisadasQ.data ?? [], [revisadasQ.data])
  const sel = pendientes.find((o) => o.id === selId) ?? null

  // Si otra persona cierra la SP abierta, se avisa (no si la cerró uno mismo).
  const cerradaPorMi = useRef<number | null>(null)
  useEffect(() => {
    if (selId == null || !enRevision.isSuccess) return
    if (pendientes.some((o) => o.id === selId)) return
    if (cerradaPorMi.current !== selId) {
      const r = revisadas.find((o) => o.id === selId)
      toast(r ? `${r.codigo} ya la revisó ${r.revisada_almacen_por_nombre || 'otro usuario'}` : 'La solicitud ya no está en revisión', 'info')
    }
    setSelId(null)
  }, [pendientes, selId, enRevision.isSuccess, revisadas])

  // El aviso de la campana trae ?detalle=ID: se abre esa SP si sigue por
  // revisar, o esa OC si está por recibir (fase 4).
  useEffect(() => {
    const id = searchParams.get('detalle')
    if (!id || !enRevision.isSuccess || porRecibirQ.isPending) return
    const next = new URLSearchParams(searchParams)
    next.delete('detalle')
    setSearchParams(next, { replace: true })
    if (pendientes.some((o) => String(o.id) === id)) {
      setPestana('pendientes')
      setSelId(Number(id))
    } else if (porRecibir.some((f) => String(f.orden.id) === id)) {
      setPestana('recepciones')
      setRecepcionAbrir(Number(id))
    } else {
      toast('La orden ya no está por revisar ni por recibir', 'info')
    }
  }, [searchParams, setSearchParams, enRevision.isSuccess, pendientes, porRecibirQ.isPending, porRecibir])

  const filtradas = pendientes.filter((o) => coincide(o, busca))
  const revFiltradas = revisadas.filter((o) => coincide(o, buscaRev))

  const alConfirmar = (actualizada: Orden) => {
    cerradaPorMi.current = actualizada.id
    if (actualizada.estado !== 'revision_almacen') {
      setMensajes([{ titulo: `✅ Almacén revisó ${actualizada.codigo}`, texto: mensajeRevisionAlmacen(actualizada) }])
      setSelId(null)
    }
  }

  const error = enRevision.error ?? revisadasQ.error
  const cargando = enRevision.isPending || revisadasQ.isPending

  return (
    <div>
      <PageHeader
        title="📋 Solicitudes de Pedido"
        description="El almacén general confirma qué tiene de cada solicitud antes de que llegue a Compras, y recibe la mercancía de las órdenes de compra."
        actions={
          !soloTelefono && puedeAccion(ACCION_TELEFONO_SOLICITUDES) ? (
            <Link to="/app/solicitudes-pedido/telefono">
              <Button variant="ghost">📱 Vista de teléfono</Button>
            </Link>
          ) : null
        }
      />

      {error ? (
        <Card className="border-danger mb-4 border">
          <strong>Error:</strong> {mensajeDe(error, 'No se pudieron cargar las solicitudes')}
        </Card>
      ) : null}

      <div role="tablist" aria-label="Solicitudes de pedido" className="mb-4 flex flex-wrap gap-1.5">
        {(
          [
            ['pendientes', `🕒 Por revisar (${pendientes.length})`],
            ['revisadas', `✅ Revisadas (${revisadas.length})`],
            ['recepciones', `📥 Recepciones por recibir (${porRecibir.length})`],
          ] as const
        ).map(([p, label]) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={pestana === p}
            onClick={() => setPestana(p)}
            className={cn(
              'rounded-[8px] px-3 py-1.5 text-sm font-medium transition-colors',
              pestana === p ? 'bg-royal-600/12 text-royal-700 dark:text-royal-300' : 'text-ink/60 hover:bg-ink/5',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {pestana === 'recepciones' ? (
        <RecepcionesPorRecibir
          filas={porRecibir}
          cargando={porRecibirQ.isPending}
          error={porRecibirQ.error}
          canWrite={permisos.data?.recibe_almacen === true}
          abrirId={recepcionAbrir}
          onAbierta={() => setRecepcionAbrir(null)}
        />
      ) : cargando ? (
        <p className="text-ink/50 text-sm">Cargando…</p>
      ) : pestana === 'pendientes' ? (
        pendientes.length === 0 ? (
          <Card>
            <Vacio icono={<span className="text-3xl">📋</span>} titulo="No hay solicitudes esperando revisión de almacén." />
          </Card>
        ) : (
          <div className="flex flex-wrap items-start gap-4">
            <div className="w-full space-y-2 lg:sticky lg:top-0 lg:max-h-[calc(100vh-6rem)] lg:max-w-[380px] lg:min-w-[280px] lg:flex-1 lg:overflow-y-auto">
              <Input
                label="Buscar"
                ocultarEtiqueta
                sinNormalizar
                type="search"
                placeholder="🔎 Buscar SP, solicitante o producto"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
              {filtradas.length === 0 ? <p className="text-ink/50 text-sm">Nada coincide con la búsqueda.</p> : null}
              {filtradas.map((o) => {
                const e = estadoRevision(o)
                const n = (o.items ?? []).filter(seRevisa).length
                return (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={selId === o.id}
                    onClick={() => setSelId(o.id)}
                    className={cn(
                      'bg-surface shadow-card block w-full rounded-[8px] border p-3 text-left text-sm',
                      selId === o.id ? 'border-royal-600' : 'border-transparent',
                      o.urgente && 'border-l-danger border-l-4',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <strong className="font-mono">{o.codigo}</strong>
                      <span className="ml-auto flex items-center gap-1.5">
                        {esMercado(o) ? <Chip tone="neutral">🛒 Mercado</Chip> : null}
                        {o.urgente ? <Chip tone="danger">🚨 Urgente</Chip> : null}
                        <span className="text-ink/45 text-xs">{relTime(o.creado_en)}</span>
                      </span>
                    </div>
                    <div className="text-ink/80 mt-1 truncate">{solicitaDe(o)}</div>
                    <div className="text-ink/50 mt-0.5 text-xs">
                      {n} producto(s) · 📍 {ETIQUETA_ALMACEN}
                    </div>
                    <div className="mt-1.5">
                      <Chip tone={e.confirmada ? 'success' : e.revisados > 0 ? 'info' : 'warning'}>
                        {ETIQUETA_ALMACEN} {e.confirmada ? '✓' : e.revisados > 0 ? `${e.revisados}/${e.total}` : 'pendiente'}
                      </Chip>
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="min-w-0 flex-[3_1_440px]">
              {sel ? (
                <RevisionSolicitudAlmacen
                  key={sel.id}
                  orden={sel}
                  variante="pc"
                  canWrite={permisos.data?.revisa_almacen === true}
                  onConfirmada={alConfirmar}
                  onVerPdf={() => void ver(sel)}
                  armandoPdf={armando === sel.id}
                />
              ) : (
                <Card>
                  <Vacio icono={<span className="text-3xl">👈</span>} titulo="Elige una solicitud de la lista para revisarla." />
                </Card>
              )}
            </div>
          </div>
        )
      ) : revisadas.length === 0 ? (
        <Card>
          <Vacio
            icono={<span className="text-3xl">✅</span>}
            titulo="Almacén no ha revisado solicitudes en los últimos 30 días."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              label="Buscar"
              ocultarEtiqueta
              sinNormalizar
              type="search"
              placeholder="🔎 Buscar SP, solicitante o producto"
              value={buscaRev}
              onChange={(e) => setBuscaRev(e.target.value)}
              className="max-w-sm"
            />
            <span className="text-ink/55 text-sm">
              {revFiltradas.length === revisadas.length
                ? `${revisadas.length} solicitud(es)`
                : `${revFiltradas.length} de ${revisadas.length}`}{' '}
              · últimos 30 días · toca una fila para ver el detalle
            </span>
          </div>
          {revFiltradas.length === 0 ? (
            <Card>
              <Vacio icono={<span className="text-3xl">🔎</span>} titulo="Nada coincide con la búsqueda." />
            </Card>
          ) : (
            <Card flush className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="text-ink/55 border-hairline border-b text-left text-xs">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">SP</th>
                    <th className="px-4 py-2.5 font-medium">Solicitante</th>
                    <th className="px-4 py-2.5 font-medium">Se necesita en</th>
                    <th className="px-4 py-2.5 font-medium">Resultado</th>
                    <th className="px-4 py-2.5 font-medium">Revisaron</th>
                    <th className="px-4 py-2.5 text-right font-medium">📦 Tiene · 🛒 Compras</th>
                    <th className="px-4 py-2.5 font-medium">Salida</th>
                    <th className="px-4 py-2.5" aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {revFiltradas.map((o) => {
                    const res = resultadoRevision(o)
                    const rr = resumenRevision(o.items ?? [])
                    const abiertaFila = abierta === o.id
                    const alternar = () => setAbierta(abiertaFila ? null : o.id)
                    return (
                      <Fragment key={o.id}>
                        <tr
                          className={cn(
                            'border-hairline cursor-pointer border-b',
                            abiertaFila && 'bg-royal-600/6',
                          )}
                          tabIndex={0}
                          title={abiertaFila ? 'Ocultar el detalle' : 'Ver el detalle'}
                          onClick={alternar}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              alternar()
                            }
                          }}
                        >
                          <td className="px-4 py-2.5">
                            <strong className="font-mono">
                              {abiertaFila ? '▾' : '▸'} {o.codigo}
                            </strong>
                            {o.urgente ? (
                              <div>
                                <Chip tone="danger">🚨 Urgente</Chip>
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-2.5">{solicitaDe(o)}</td>
                          <td className="px-4 py-2.5">{ETIQUETA_ALMACEN}</td>
                          <td className="px-4 py-2.5">
                            <Chip tone={res.tono === 'royal' ? 'royal' : res.tono}>{res.texto}</Chip>
                          </td>
                          <td className="px-4 py-2.5">
                            {ETIQUETA_ALMACEN}: {o.revisada_almacen_por_nombre ?? '—'}
                            <div className="text-ink/50 text-xs">{fechaHoraVE(o.revisada_almacen_en)}</div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono">
                            📦 {rr.tiene.length} · 🛒 {rr.falta.length}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs">{o.salida_almacen_numero ?? '—'}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={armando === o.id}
                              title="Abre la SP en la vista previa de PDF"
                              onClick={() => void ver(o)}
                            >
                              {armando === o.id ? 'Armando…' : '📄 Ver PDF'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setMensajes([{ titulo: `✅ Revisión de ${o.codigo}`, texto: mensajeRevisionAlmacen(o) }])
                              }
                            >
                              💬 Mensaje de la revisión
                            </Button>
                          </td>
                        </tr>
                        {abiertaFila ? (
                          <tr className="bg-canvas border-hairline border-b">
                            <td colSpan={8} className="px-4 py-3">
                              <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                                <ResumenListas resumen={rr} />
                                <div className="space-y-1 text-sm">
                                  <div>
                                    🏬 <strong className="font-semibold">{ETIQUETA_ALMACEN}</strong>: confirmó{' '}
                                    {o.revisada_almacen_por_nombre ?? '—'} · {fechaHoraVE(o.revisada_almacen_en)}
                                  </div>
                                  {o.salida_almacen_numero ? (
                                    <div>
                                      📤 Solicitud de salida{' '}
                                      <strong className="font-mono font-semibold">{o.salida_almacen_numero}</strong>
                                    </div>
                                  ) : null}
                                  {o.nota_almacen ? <div className="text-ink/55">📝 {o.nota_almacen}</div> : null}
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {mensajes.length > 0 ? (
        <ModalWhatsappCompra
          titulo={mensajes[0].titulo}
          texto={mensajes[0].texto}
          onCerrar={() => setMensajes((m) => m.slice(1))}
        />
      ) : null}
      {visor}
      <AvisosFlotantes />
    </div>
  )
}
