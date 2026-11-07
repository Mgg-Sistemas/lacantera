import { memo, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { AvisosFlotantes } from '@/components/AvisosFlotantes'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Segmento } from '@/components/ui/Segmento'
import { Cargando, Vacio } from '@/components/ui/Estado'
import { cn } from '@/lib/cn'
import {
  useAprobarOrden,
  useCancelarOrden,
  usePedidos,
  usePermisosPedidos,
  type EstadoOrden,
  type Orden,
  type PermisosPedidos,
} from '@/lib/api/pedidos'
import {
  ACENTO_COLUMNA,
  ESTADOS_FASES_SP,
  KANBAN_COLS_PEDIDOS,
  coincide,
  fechaHoraVE,
  money,
  quienCargo,
  quienSolicita,
  relTime,
  type TonoEstado,
} from '@/lib/pedidos'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { CrearOrdenModal } from './CrearOrdenModal'
import { EstadoBadge, OrdenDetailModal } from './OrdenDetailModal'
import { ConfirmDialog, MotivoModal } from './Dialogos'

/*
  PEDIDOS / COMPRAS (MGG `PedidosPage`) · FASE 1

  Angélica, 07/11/2026: el módulo de compras se reemplaza por una copia exacta
  del de MGG —estructura, pestañas, columnas, tarjetas, botones y textos con
  sus emojis—, dibujada con las piezas de La Cantera. Esta es la fase 1: la
  pestaña «✉ Solicitud de Pedido» completa. Las demás pestañas están en su
  sitio con un aviso de la fase en que llegan.

  QUIÉN VE QUÉ. Pedir lo puede cualquiera (06/11/2026). Quien no lleva Compras
  es el «soloSolicitud» de MGG: no ve pestañas ni filtros de OC, solo sus
  solicitudes y solo en las fases de la SP; si la abre por enlace estando ya
  más adelante, se le dice que ya está en Compras.

  LO QUE AÚN NO ESTÁ (y por qué):
    - «⌕ Histórico», «📊 Reporte por renglón», «📆 Cierre diario», «📒
      Categorías» y «🛒 Solicitud de Mercado» llegan en la fase 5, con sus
      pantallas. No se dibujan botones que no llevan a nada.
    - El administrador arranca en «✉ Solicitud de Pedido» y no en «🧾 Órdenes
      de Compra» como en MGG: esa pestaña todavía es un aviso.
*/

type Scope = 'pedidos' | 'oc' | 'oc_lote' | 'compra_directa' | 'servicio' | 'servicio_directo'
type ViewMode = 'kanban' | 'lista'

const VIEW_KEY = 'pedidos.vista'
const SCOPE_KEY = 'pedidos.pestana'

const leer = <T extends string>(clave: string, validos: readonly T[], respaldo: T): T => {
  try {
    const v = localStorage.getItem(clave)
    return v && (validos as readonly string[]).includes(v) ? (v as T) : respaldo
  } catch {
    return respaldo
  }
}
const guardar = (clave: string, valor: string) => {
  try {
    localStorage.setItem(clave, valor)
  } catch {
    /* localStorage no disponible */
  }
}

const PESTANAS: { scope: Scope; label: string; title: string }[] = [
  { scope: 'pedidos', label: '✉ Solicitud de Pedido', title: 'Ver solicitudes de pedido' },
  { scope: 'oc', label: '🧾 Órdenes de Compra', title: 'Ver órdenes de compra' },
  { scope: 'oc_lote', label: '📋 OC por lote', title: 'Checklist de compras pendientes por pagar' },
  { scope: 'compra_directa', label: '🛒 Compra Directa', title: 'Compras sin proveedor' },
  {
    scope: 'servicio',
    label: '🛠 Servicios',
    title: 'Solicitudes de servicio (recarga de gas, recarga de agua, mantenimiento de maquinaria…)',
  },
  {
    scope: 'servicio_directo',
    label: '🔧 Servicio Directo',
    title: 'Servicio sin solicitud previa: cargás la factura y el monto',
  },
]

/** En qué fase llega cada pestaña que todavía no está. */
const FASE_DE: Partial<Record<Scope, string>> = {
  oc: 'fase 2 (cotizar, cargar ofertas y crear la OC) y fase 3 (aprobar y pagar)',
  oc_lote: 'fase 3 (aprobar OC por lote)',
  servicio: 'fase 5 (servicios)',
  servicio_directo: 'fase 5 (servicio directo)',
}

type ModalKind =
  | { kind: 'none' }
  | { kind: 'detail'; ordenId: number }
  | { kind: 'create' }
  | { kind: 'edit'; orden: Orden }
  | { kind: 'approve'; orden: Orden }
  | { kind: 'cancel'; orden: Orden }

const ACENTO: Record<TonoEstado, string> = {
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  royal: 'bg-royal-600',
  danger: 'bg-danger',
  neutral: 'bg-ink/25',
}

export function PedidosPage() {
  const permisosQ = usePermisosPedidos()
  const pedidos = usePedidos()

  if (permisosQ.isPending) return <Cargando texto="Cargando órdenes..." />
  if (!permisosQ.data) {
    return (
      <Card className="border-danger mt-6 border">
        <strong>Error:</strong> {mensajeDe(permisosQ.error, 'Error al cargar pedidos')}
      </Card>
    )
  }
  return <Pagina permisos={permisosQ.data} pedidos={pedidos} />
}

function Pagina({ permisos, pedidos }: { permisos: PermisosPedidos; pedidos: ReturnType<typeof usePedidos> }) {
  const soloSolicitud = !permisos.compras
  const isAdmin = permisos.gestiona
  const canManageProcurement = permisos.gestiona

  const [scope, setScope] = useState<Scope>(() =>
    soloSolicitud ? 'pedidos' : leer(SCOPE_KEY, PESTANAS.map((p) => p.scope), 'pedidos'),
  )
  const [viewMode, setViewMode] = useState<ViewMode>(() => leer(VIEW_KEY, ['kanban', 'lista'] as const, 'kanban'))
  const [filterText, setFilterText] = useState('')
  const [filterEstado, setFilterEstado] = useState<EstadoOrden | ''>('')
  const [filterCreador, setFilterCreador] = useState('')
  const [modal, setModal] = useState<ModalKind>({ kind: 'none' })

  const aprobar = useAprobarOrden()
  const cancelar = useCancelarOrden()

  const ordenes = useMemo(() => pedidos.data ?? [], [pedidos.data])

  // Servicios muestra solo clase='servicio'; el resto, solo productos. Sin
  // Compras, solo las fases de la SP.
  const ordenesDePestana = useMemo(
    () =>
      ordenes.filter(
        (o) => (o.clase === 'servicio') === (scope === 'servicio') && (!soloSolicitud || ESTADOS_FASES_SP.has(o.estado)),
      ),
    [ordenes, scope, soloSolicitud],
  )

  const creadores = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of ordenesDePestana) m.set(o.creado_por, o.creado_por_nombre ?? '—')
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  }, [ordenesDePestana])

  const filteredOrdenes = useMemo(
    () =>
      ordenesDePestana.filter(
        (o) =>
          !(filterEstado && o.estado !== filterEstado) &&
          !(filterCreador && o.creado_por !== filterCreador) &&
          coincide(o, filterText),
      ),
    [ordenesDePestana, filterEstado, filterCreador, filterText],
  )

  const kanbanCols =
    filterEstado && KANBAN_COLS_PEDIDOS.some((c) => c.key === filterEstado)
      ? KANBAN_COLS_PEDIDOS.filter((c) => c.key === filterEstado)
      : KANBAN_COLS_PEDIDOS

  // ?detalle=ID abre el detalle (avisos y búsqueda global). Se consume de la URL.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const id = searchParams.get('detalle')
    if (!id || !pedidos.isSuccess) return
    const next = new URLSearchParams(searchParams)
    next.delete('detalle')
    setSearchParams(next, { replace: true })
    const o = ordenes.find((x) => String(x.id) === id)
    if (!o) toast('Esa orden no existe o fue eliminada.', 'warning')
    else if (soloSolicitud && (o.clase === 'servicio' || !ESTADOS_FASES_SP.has(o.estado)))
      toast('Esa orden ya está en Compras: no la puedes abrir.', 'warning')
    else setModal({ kind: 'detail', ordenId: o.id })
  }, [searchParams, setSearchParams, pedidos.isSuccess, ordenes, soloSolicitud])

  function switchScope(next: Scope) {
    setScope(next)
    guardar(SCOPE_KEY, next)
  }
  function switchView(mode: ViewMode) {
    setViewMode(mode)
    guardar(VIEW_KEY, mode)
  }

  const currentDetail = modal.kind === 'detail' ? (ordenes.find((o) => o.id === modal.ordenId) ?? null) : null

  const titulo = soloSolicitud
    ? 'Solicitudes de Pedido'
    : scope === 'oc'
      ? 'Órdenes de Compra'
      : scope === 'compra_directa'
        ? 'Compra Directa'
        : scope === 'servicio_directo'
          ? 'Servicio Directo'
          : scope === 'oc_lote'
            ? 'OC por lote'
            : scope === 'servicio'
              ? 'Servicios'
              : 'Órdenes'

  const hint = soloSolicitud
    ? 'Crea tus solicitudes de pedido y sigue en qué fase van. Compras se encarga del resto.'
    : scope === 'oc'
      ? 'Seguimiento del ciclo de compras: emisión de OC, recepción y finalización del pedido.'
      : scope === 'oc_lote'
        ? 'Checklist de órdenes de compra pendientes por confirmar. Aprobá en lote, imprimí o enviá por correo.'
        : scope === 'compra_directa'
          ? 'Compras sin proveedor. En proceso → Finalizada: al finalizar, el material entra al inventario.'
          : isAdmin
            ? 'Solicitudes de pedido generadas por analistas. Aprobá la mejor oferta antes de emitir la OC.'
            : 'Crea solicitudes de pedido. El administrador aprueba antes de emitir la orden de compra.'

  return (
    <div>
      <PageHeader
        title={titulo}
        description={hint}
        actions={
          soloSolicitud ? (
            <Button onClick={() => setModal({ kind: 'create' })}>+ Nueva solicitud</Button>
          ) : scope !== 'compra_directa' && scope !== 'oc_lote' && scope !== 'servicio_directo' && scope !== 'servicio' ? (
            <Button onClick={() => setModal({ kind: 'create' })}>+ Nueva orden</Button>
          ) : null
        }
      />

      {/* Quien solo hace solicitudes no ve las otras pestañas. */}
      {!soloSolicitud ? (
        <div role="tablist" aria-label="Tipo de vista" className="mb-4 flex flex-wrap gap-1.5">
          {PESTANAS.map((p) => (
            <button
              key={p.scope}
              type="button"
              role="tab"
              aria-selected={scope === p.scope}
              title={p.title}
              onClick={() => switchScope(p.scope)}
              className={cn(
                'rounded-[8px] px-3 py-1.5 text-sm font-medium transition-colors',
                scope === p.scope
                  ? 'bg-royal-600/12 text-royal-700 dark:text-royal-300'
                  : 'text-ink/60 hover:bg-ink/5',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : null}

      {pedidos.error ? (
        <Card className="border-danger mb-4 border">
          <strong>Error:</strong> {mensajeDe(pedidos.error, 'Error al cargar pedidos')}
        </Card>
      ) : null}

      {scope === 'compra_directa' ? (
        /* Decisión de la dueña: la compra directa sigue siendo la de La Cantera. */
        <Card className="max-w-xl">
          <p className="text-ink/75 text-sm">
            La compra directa de La Cantera sigue siendo la misma: se paga y se recibe sin pedir ni cotizar.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/app/compras/directa">
              <Button>🛒 Registrar una compra directa</Button>
            </Link>
            <Link to="/app/compras/directa/historial">
              <Button variant="outline">Historial de directas</Button>
            </Link>
          </div>
        </Card>
      ) : FASE_DE[scope] ? (
        <Card className="max-w-xl">
          <Vacio
            icono={<span className="text-3xl">🚧</span>}
            titulo={`Próximamente · ${FASE_DE[scope]}`}
            descripcion="Mientras tanto, lo que ya pasó a Compras sigue su camino en el Tablero (anterior)."
            accion={
              <Link to="/app/compras">
                <Button variant="outline">Ir al Tablero (anterior)</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <Input
              label="Buscar"
              ocultarEtiqueta
              sinNormalizar
              type="search"
              placeholder="Buscar por código, proveedor, solicitante, ítem, estado, monto, fecha…"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="min-w-[16rem] flex-1"
            />
            <select
              className="rounded-control border-ink/20 bg-surface text-ink/85 h-10 max-w-[220px] border px-3 text-sm"
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value as EstadoOrden | '')}
              title="Filtra por estado en Kanban (deja solo esa columna) y en Lista"
              aria-label="Estado"
            >
              <option value="">Todos los estados</option>
              <option value="revision_almacen">En revisión de almacén</option>
              <option value="pendiente">Pendientes</option>
              <option value="aprobada">Aprobadas (OP)</option>
              {!soloSolicitud ? (
                <>
                  <option value="oc_creada">OC creada</option>
                  <option value="oc_aprobada">OC confirmada</option>
                  <option value="pagada">Pagadas</option>
                  <option value="desistida_proveedor">Proveedor desistió</option>
                </>
              ) : null}
              <option value="recibida">Recibidas</option>
              <option value="finalizada">Finalizadas</option>
              <option value="atendida_almacen">Atendidas por almacén</option>
              <option value="cancelada">Canceladas</option>
            </select>
            <select
              className="rounded-control border-ink/20 bg-surface text-ink/85 h-10 max-w-[240px] border px-3 text-sm"
              value={filterCreador}
              onChange={(e) => setFilterCreador(e.target.value)}
              aria-label="Realizada por"
              title="Ver solo las órdenes realizadas por un usuario"
            >
              <option value="">Realizada por: todos los usuarios</option>
              {creadores.map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </select>
            <Segmento
              className="h-10"
              valor={viewMode}
              onCambio={(v) => switchView(v as ViewMode)}
              opciones={[
                { valor: 'kanban', etiqueta: '▦ Kanban', pista: 'Vista Kanban' },
                { valor: 'lista', etiqueta: '☰ Lista', pista: 'Vista Lista' },
              ]}
            />
          </div>

          {pedidos.isPending ? (
            <Vacio icono={<span className="text-3xl">◔</span>} titulo="Cargando órdenes..." />
          ) : viewMode === 'kanban' ? (
            <KanbanBoard
              ordenes={filteredOrdenes}
              cols={kanbanCols}
              onOpen={(id) => setModal({ kind: 'detail', ordenId: id })}
            />
          ) : (
            <OrdenesTable
              ordenes={filteredOrdenes}
              canManageProcurement={canManageProcurement}
              onView={(id) => setModal({ kind: 'detail', ordenId: id })}
              onApprove={(o) => setModal({ kind: 'approve', orden: o })}
            />
          )}
        </>
      )}

      {modal.kind === 'detail' && currentDetail ? (
        <OrdenDetailModal
          orden={currentDetail}
          permisos={permisos}
          onClose={() => setModal({ kind: 'none' })}
          onApprove={() => setModal({ kind: 'approve', orden: currentDetail })}
          onEditar={() => setModal({ kind: 'edit', orden: currentDetail })}
          onCancel={() => setModal({ kind: 'cancel', orden: currentDetail })}
        />
      ) : null}

      {modal.kind === 'create' || modal.kind === 'edit' ? (
        <CrearOrdenModal
          orden={modal.kind === 'edit' ? modal.orden : null}
          permisos={permisos}
          onClose={() => setModal(modal.kind === 'edit' ? { kind: 'detail', ordenId: modal.orden.id } : { kind: 'none' })}
          onCreated={() => setModal(modal.kind === 'edit' ? { kind: 'detail', ordenId: modal.orden.id } : { kind: 'none' })}
        />
      ) : null}

      {modal.kind === 'approve' ? (
        <ConfirmDialog
          title="Aprobar orden"
          message={`Aprobar ${modal.orden.codigo} por ${money(modal.orden.total)}.`}
          confirmText="Aprobar"
          success
          busy={aprobar.isPending}
          onCancel={() => setModal({ kind: 'detail', ordenId: modal.orden.id })}
          onConfirm={async () => {
            try {
              await aprobar.mutateAsync(modal.orden.id)
              toast(`Orden aprobada: ${modal.orden.codigo}`, 'success')
              setModal({ kind: 'none' })
            } catch (e) {
              toast(mensajeDe(e, 'Error al aprobar'), 'error')
            }
          }}
        />
      ) : null}

      {modal.kind === 'cancel' ? (
        <MotivoModal
          title={`Cancelar ${modal.orden.codigo}`}
          intro="Cancelar la orden. Útil cuando el cliente solicita cancelar o la empresa desiste del proyecto."
          label="Motivo"
          confirmText="Cancelar orden"
          doubleConfirm={`¿Seguro que querés cancelar la orden ${modal.orden.codigo}? Esta acción no se puede deshacer.`}
          busy={cancelar.isPending}
          onClose={() => setModal({ kind: 'detail', ordenId: modal.orden.id })}
          onConfirm={async (motivo) => {
            try {
              await cancelar.mutateAsync({ id: modal.orden.id, motivo })
              toast(`Orden cancelada: ${modal.orden.codigo}`, 'warning')
              setModal({ kind: 'none' })
            } catch (e) {
              toast(mensajeDe(e, 'No se pudo cancelar la orden'), 'error')
            }
          }}
        />
      ) : null}

      <AvisosFlotantes />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Vista Lista (MGG `OrdenesTable`)
// ---------------------------------------------------------------------------

function OrdenesTable({
  ordenes,
  canManageProcurement,
  onView,
  onApprove,
}: {
  ordenes: Orden[]
  canManageProcurement: boolean
  onView: (id: number) => void
  onApprove: (o: Orden) => void
}) {
  if (!ordenes.length) {
    return (
      <Card>
        <Vacio icono={<span className="text-3xl">✉</span>} titulo="Sin órdenes que coincidan." />
      </Card>
    )
  }
  return (
    <Card flush className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="text-ink/55 border-hairline border-b text-left text-xs">
          <tr>
            <th className="px-4 py-2.5 font-medium">Código</th>
            <th className="px-4 py-2.5 font-medium">Proveedor</th>
            <th className="px-4 py-2.5 font-medium">Solicitante</th>
            <th className="px-4 py-2.5 text-right font-medium">Ítems</th>
            <th className="px-4 py-2.5 text-right font-medium">Total</th>
            <th className="px-4 py-2.5 font-medium">Estado</th>
            <th className="px-4 py-2.5 font-medium">Fecha</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {ordenes.map((o) => (
            <tr
              key={o.id}
              className="border-hairline hover:bg-ink/3 cursor-pointer border-b last:border-b-0"
              onClick={() => onView(o.id)}
              title="Ver detalle"
            >
              <td className="px-4 py-2.5 font-mono">
                {o.codigo}
                {o.urgente ? (
                  <span className="bg-danger ml-1.5 rounded px-1.5 py-0.5 font-sans text-[10px] font-semibold text-white">
                    🚨 URGENTE
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-2.5">—</td>
              <td className="px-4 py-2.5">{quienSolicita(o) ?? '—'}</td>
              <td className="px-4 py-2.5 text-right font-mono">{o.items.length}</td>
              <td className="px-4 py-2.5 text-right font-mono">{money(o.total)}</td>
              <td className="px-4 py-2.5">
                <EstadoBadge estado={o.estado} />
              </td>
              <td className="text-ink/55 px-4 py-2.5 text-xs">{fechaHoraVE(o.creado_en)}</td>
              <td className="px-4 py-2.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="ghost" onClick={() => onView(o.id)}>
                  Ver
                </Button>
                {canManageProcurement && o.estado === 'pendiente' ? (
                  <Button size="sm" className="bg-success hover:bg-success ml-1 hover:brightness-95" onClick={() => onApprove(o)}>
                    Aprobar
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Kanban (MGG `KanbanBoard` / `KanbanCard`)
// ---------------------------------------------------------------------------

function KanbanBoard({
  ordenes,
  cols,
  onOpen,
}: {
  ordenes: Orden[]
  cols: { key: EstadoOrden; label: string }[]
  onOpen: (id: number) => void
}) {
  const byState = useMemo(() => {
    const map = new Map<EstadoOrden, Orden[]>()
    cols.forEach((c) => map.set(c.key, []))
    ordenes.forEach((o) => map.get(o.estado)?.push(o))
    return map
  }, [ordenes, cols])

  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
      {cols.map((col) => {
        const items = byState.get(col.key) ?? []
        const acento = ACENTO_COLUMNA[col.key]
        return (
          <section
            key={col.key}
            className={cn(
              'bg-ink/3 flex w-72 shrink-0 flex-col rounded-[10px] border',
              acento ? 'border-hairline' : 'border-ink/10',
            )}
          >
            <header className="flex items-center justify-between gap-2 px-3 py-2.5">
              <span className="text-ink/70 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
                <span className={cn('size-2 rounded-full', ACENTO[acento ?? 'neutral'])} aria-hidden="true" />
                {col.label}
              </span>
              <span className="bg-ink/8 text-ink/65 rounded-full px-2 py-0.5 text-xs font-medium">{items.length}</span>
            </header>
            <div className="flex flex-col gap-2 px-2 pb-2">
              {items.length === 0 ? (
                <div className="text-ink/40 border-ink/10 rounded-[8px] border border-dashed px-3 py-4 text-center text-xs">
                  Sin órdenes
                </div>
              ) : (
                items.map((o) => <KanbanCard key={o.id} orden={o} onOpen={onOpen} />)
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

const KanbanCard = memo(function KanbanCard({ orden, onOpen }: { orden: Orden; onOpen: (id: number) => void }) {
  const solicita = quienSolicita(orden)
  const cargo = quienCargo(orden)
  const n = orden.items.length
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(orden.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(orden.id)
      }}
      className={cn(
        'bg-surface shadow-card hover:border-royal-600/40 cursor-pointer rounded-[8px] border p-3 text-sm transition-colors',
        orden.urgente ? 'border-danger ring-danger ring-1' : 'border-transparent',
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs font-semibold">
        {orden.codigo}
        {orden.urgente ? (
          <span className="bg-danger rounded px-1.5 py-0.5 font-sans text-[10px] font-semibold text-white">
            🚨 URGENTE
          </span>
        ) : null}
      </div>
      <div className="text-ink/90 mt-1 font-semibold">
        {solicita || orden.unidad_solicitante ? `Solicita: ${solicita ?? orden.unidad_solicitante}` : 'Sin proveedor asignado'}
      </div>
      <div className="text-ink/60 mt-1 flex flex-wrap items-center gap-1.5 text-xs">
        <span>
          {n} ítem{n !== 1 ? 's' : ''}
        </span>
        {orden.revisada_almacen_en ? (
          <Chip tone="info" title={`Revisada por almacén · ${fechaHoraVE(orden.revisada_almacen_en)}`}>
            📦 Revisada por almacén
          </Chip>
        ) : null}
      </div>
      <div
        className="text-ink/60 mt-1 flex flex-wrap gap-x-1.5 text-[11px]"
        title={
          `${solicita ? `Solicita: ${solicita}` : 'Sin solicitante indicado'}` +
          `${orden.unidad_solicitante ? ` · Unidad: ${orden.unidad_solicitante}` : ''}` +
          `${cargo ? `\nCargada por: ${cargo}` : ''}` +
          `\nCreada: ${fechaHoraVE(orden.creado_en)}`
        }
      >
        <span>
          👤 {solicita ?? '—'}
          {orden.unidad_solicitante ? <span className="text-ink/45"> · {orden.unidad_solicitante}</span> : null}
        </span>
        {cargo ? <span className="text-ink/45">✎ {cargo}</span> : null}
        <span className="text-ink/45">· {fechaHoraVE(orden.creado_en)}</span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="font-mono font-semibold">{money(orden.total)}</span>
        <span className="text-ink/45 text-xs" title={fechaHoraVE(orden.creado_en)}>
          {relTime(orden.creado_en)}
        </span>
      </div>
    </div>
  )
})
