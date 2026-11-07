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
import { useProveedores } from '@/lib/api/catalogo'
import {
  useAprobarOrden,
  useCancelarOrden,
  useNoLeidos,
  usePedidos,
  usePermisosPedidos,
  type EstadoOrden,
  type Orden,
  type PermisosPedidos,
} from '@/lib/api/pedidos'
import {
  ACENTO_COLUMNA,
  ESTADOS_FASES_SP,
  KANBAN_COLS_OC,
  KANBAN_COLS_PEDIDOS,
  KANBAN_COLS_SERVICIO,
  TOPE_COLUMNA_OC,
  coincide,
  fechaHoraVE,
  money,
  progresoRecepcion,
  puedeFinalizarse,
  quienCargo,
  quienSolicita,
  relTime,
  type TonoEstado,
} from '@/lib/pedidos'
import { desglosarOc, infoModalidad } from '@/lib/ofertas'
import { esCredito, labelMetodoPago, montoAPagar, saldoCredito, totalRetenciones } from '@/lib/pagos'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { CrearOrdenModal } from './CrearOrdenModal'
import { EstadoBadge, OrdenDetailModal } from './OrdenDetailModal'
import { ConfirmDialog, MotivoModal } from './Dialogos'
import { OcPorLoteView } from './OcPorLoteView'
import { NuevoServicioModal } from './NuevoServicioModal'
import { SolicitudMercadoModal } from './SolicitudMercadoModal'
import { CategoriasModal } from './CategoriasModal'
import { ServicioDirectoView } from './ServicioDirectoView'

/*
  PEDIDOS / COMPRAS (MGG `PedidosPage`) · FASES 1, 2 Y 3

  Angélica, 07/11/2026: el módulo de compras se reemplaza por una copia exacta
  del de MGG —estructura, pestañas, columnas, tarjetas, botones y textos con
  sus emojis—, dibujada con las piezas de La Cantera. La fase 1 es la pestaña
  «✉ Solicitud de Pedido»; la fase 2, «🧾 Órdenes de Compra» con las columnas
  de MGG (cargar ofertas, OC por aprobar, … proveedor desistió) y sus
  tarjetas con proveedor, modalidad de pago y «💬 n». La fase 3 aprueba y
  paga dentro de Compras (sin Tesorería): «📋 OC por lote», y en las tarjetas
  el método, el monto a pagar (total − retenciones), el saldo del crédito y el
  pago registrado. La fase 4 recibe en el almacén (pantalla del almacén) y
  finaliza en Compras con la evaluación del proveedor; las tarjetas dicen lo
  recibido, la recepción parcial y si está lista para finalizar. Las demás
  pestañas están en su sitio con un aviso de la fase en que llegan.

  El tope de 10 tarjetas por columna de la pestaña OC lleva en MGG al
  Histórico; aquí, hasta que llegue el Histórico (fase 5), a la Lista filtrada
  por ese estado.

  QUIÉN VE QUÉ. Pedir lo puede cualquiera (06/11/2026). Quien no lleva Compras
  es el «soloSolicitud» de MGG: no ve pestañas ni filtros de OC, solo sus
  solicitudes y solo en las fases de la SP; si la abre por enlace estando ya
  más adelante, se le dice que ya está en Compras.

  La fase 5a pone «🛠 Servicios» (solicitudes SV con sus columnas de MGG:
  Solicitado … Servicio realizado, Finalizado), «🔧 Servicio Directo», «🛒
  Solicitud de Mercado» y «📒 Categorías» (unidades solicitantes, categorías y
  tipos de servicio). Compra Directa sigue siendo la de La Cantera.

  LO QUE AÚN NO ESTÁ (y por qué):
    - «⌕ Histórico», «📊 Reporte por renglón» y «📆 Cierre diario» llegan en
      la fase 5b, con sus pantallas. No se dibujan botones que no llevan a
      nada.
    - Sin la tarjeta «🛒 La cocina solicitó restablecer el mercado»: en La
      Cantera no hay alertas de mercado; la cocina lo pide desde Alimentación.
    - El administrador arranca en la última pestaña que usó (la primera vez,
      «✉ Solicitud de Pedido»), no siempre en «🧾 Órdenes de Compra» como en
      MGG.
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

type ModalKind =
  | { kind: 'none' }
  | { kind: 'detail'; ordenId: number }
  | { kind: 'create' }
  | { kind: 'create-servicio' }
  | { kind: 'mercado' }
  | { kind: 'categorias' }
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

  const proveedoresQ = useProveedores(false)
  const nombreProveedor = useMemo(() => {
    const m = new Map<number, string>()
    for (const p of proveedoresQ.data ?? []) m.set(p.id, p.nombre)
    return (id: number | null | undefined) => (id ? (m.get(id) ?? null) : null)
  }, [proveedoresQ.data])
  const noLeidos = useNoLeidos(permisos.yo)

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
          coincide(o, filterText, nombreProveedor(o.proveedor_id)),
      ),
    [ordenesDePestana, filterEstado, filterCreador, filterText, nombreProveedor],
  )

  const columnas = scope === 'oc' ? KANBAN_COLS_OC : scope === 'servicio' ? KANBAN_COLS_SERVICIO : KANBAN_COLS_PEDIDOS
  const kanbanCols =
    filterEstado && columnas.some((c) => c.key === filterEstado) ? columnas.filter((c) => c.key === filterEstado) : columnas

  // ?detalle=ID abre el detalle (avisos y búsqueda global). Se consume de la URL.
  const [searchParams, setSearchParams] = useSearchParams()

  // ?scope=… lleva a una pestaña (MGG: oc_lote|oc|pedidos|compra_directa…). El
  // `sd` del servicio directo se queda: lo consume su vista.
  useEffect(() => {
    const s = searchParams.get('scope')
    if (!s) return
    const next = new URLSearchParams(searchParams)
    next.delete('scope')
    setSearchParams(next, { replace: true })
    if (!soloSolicitud && PESTANAS.some((p) => p.scope === s)) {
      setScope(s as Scope)
      guardar(SCOPE_KEY, s)
    }
  }, [searchParams, setSearchParams, soloSolicitud])
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
          ) : scope !== 'compra_directa' && scope !== 'oc_lote' && scope !== 'servicio_directo' ? (
            <div className="flex flex-wrap gap-2">
              {permisos.gestiona ? (
                <Button variant="ghost" title="Gestionar las unidades solicitantes" onClick={() => setModal({ kind: 'categorias' })}>
                  📒 Categorías
                </Button>
              ) : null}
              {scope === 'servicio' ? (
                <Button onClick={() => setModal({ kind: 'create-servicio' })}>+ Nuevo servicio</Button>
              ) : (
                <>
                  {scope === 'pedidos' ? (
                    <Button
                      variant="ghost"
                      title="Solicitud de Mercado: víveres y art. de limpieza para la cocina (urgente)"
                      onClick={() => setModal({ kind: 'mercado' })}
                    >
                      🛒 Solicitud de Mercado
                    </Button>
                  ) : null}
                  <Button onClick={() => setModal({ kind: 'create' })}>+ Nueva orden</Button>
                </>
              )}
            </div>
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
      ) : scope === 'oc_lote' ? (
        <OcPorLoteView
          ordenes={ordenes}
          permisos={permisos}
          cargando={pedidos.isPending}
          proveedor={nombreProveedor}
          onOpen={(id) => setModal({ kind: 'detail', ordenId: id })}
        />
      ) : scope === 'servicio_directo' ? (
        <ServicioDirectoView permisos={permisos} />
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
              tope={scope === 'oc' ? TOPE_COLUMNA_OC : null}
              proveedor={nombreProveedor}
              noLeidos={noLeidos.data}
              onOpen={(id) => setModal({ kind: 'detail', ordenId: id })}
              onVerMas={(estado) => {
                setFilterEstado(estado)
                switchView('lista')
              }}
            />
          ) : (
            <OrdenesTable
              ordenes={filteredOrdenes}
              canManageProcurement={canManageProcurement}
              proveedor={nombreProveedor}
              noLeidos={noLeidos.data}
              onView={(id) => setModal({ kind: 'detail', ordenId: id })}
              onApprove={(o) => setModal({ kind: 'approve', orden: o })}
            />
          )}
        </>
      )}

      {modal.kind === 'detail' && currentDetail ? (
        <OrdenDetailModal
          key={currentDetail.id}
          orden={currentDetail}
          ordenes={ordenes}
          permisos={permisos}
          onAbrir={(id) => setModal({ kind: 'detail', ordenId: id })}
          onClose={() => setModal({ kind: 'none' })}
          onApprove={() => setModal({ kind: 'approve', orden: currentDetail })}
          onEditar={() => setModal({ kind: 'edit', orden: currentDetail })}
          onCancel={() => setModal({ kind: 'cancel', orden: currentDetail })}
        />
      ) : null}

      {/* Los servicios se editan con el formato de servicio (MGG), no con el de productos. */}
      {modal.kind === 'create-servicio' || (modal.kind === 'edit' && modal.orden.clase === 'servicio') ? (
        <NuevoServicioModal
          orden={modal.kind === 'edit' ? modal.orden : null}
          permisos={permisos}
          onClose={() => setModal(modal.kind === 'edit' ? { kind: 'detail', ordenId: modal.orden.id } : { kind: 'none' })}
          onCreated={() => setModal(modal.kind === 'edit' ? { kind: 'detail', ordenId: modal.orden.id } : { kind: 'none' })}
        />
      ) : null}

      {modal.kind === 'mercado' ? (
        <SolicitudMercadoModal onClose={() => setModal({ kind: 'none' })} onCreated={(id) => setModal({ kind: 'detail', ordenId: id })} />
      ) : null}

      {modal.kind === 'categorias' ? <CategoriasModal onClose={() => setModal({ kind: 'none' })} /> : null}

      {modal.kind === 'create' || (modal.kind === 'edit' && modal.orden.clase !== 'servicio') ? (
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

type NombreProveedor = (id: number | null | undefined) => string | null

/** MGG «↻ n»: cuántas veces cambió el proveedor de la orden. */
const cambiosDeProveedor = (o: Orden): number => (o.historial ?? []).filter((h) => h.evento === 'proveedor_cambiado').length

function OrdenesTable({
  ordenes,
  canManageProcurement,
  proveedor,
  noLeidos,
  onView,
  onApprove,
}: {
  ordenes: Orden[]
  canManageProcurement: boolean
  proveedor: NombreProveedor
  noLeidos: Map<number, number> | undefined
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
          {ordenes.map((o) => {
            const sinLeer = noLeidos?.get(o.id) ?? 0
            const cambios = cambiosDeProveedor(o)
            return (
              <tr
                key={o.id}
                className="border-hairline hover:bg-ink/3 cursor-pointer border-b last:border-b-0"
                onClick={() => onView(o.id)}
                title="Ver detalle"
              >
                <td className="px-4 py-2.5 font-mono">
                  {o.oc_codigo ?? o.codigo}
                  {o.oc_codigo ? <div className="text-ink/45 text-[11px]">{o.codigo}</div> : null}
                  {o.urgente ? (
                    <span className="bg-danger ml-1.5 rounded px-1.5 py-0.5 font-sans text-[10px] font-semibold text-white">
                      🚨 URGENTE
                    </span>
                  ) : null}
                  {sinLeer ? (
                    <Chip tone="royal" className="ml-1.5 font-sans" title={`${sinLeer} mensaje(s) sin leer`}>
                      💬 {sinLeer}
                    </Chip>
                  ) : null}
                </td>
                <td className="px-4 py-2.5">
                  {proveedor(o.proveedor_id) ?? '—'}
                  {cambios ? <div className="text-warning text-[11px]">↻ {cambios} cambio(s) de proveedor</div> : null}
                </td>
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
            )
          })}
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
  tope,
  proveedor,
  noLeidos,
  onOpen,
  onVerMas,
}: {
  ordenes: Orden[]
  cols: { key: EstadoOrden; label: string }[]
  /** Pestaña OC: 10 tarjetas por columna salvo «Pendiente (cargar ofertas)». */
  tope: number | null
  proveedor: NombreProveedor
  noLeidos: Map<number, number> | undefined
  onOpen: (id: number) => void
  onVerMas: (estado: EstadoOrden) => void
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
        const limite = tope && col.key !== 'aprobada' ? tope : null
        const visibles = limite ? items.slice(0, limite) : items
        const sobran = items.length - visibles.length
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
                visibles.map((o) => (
                  <KanbanCard
                    key={o.id}
                    orden={o}
                    proveedor={proveedor(o.proveedor_id)}
                    sinLeer={noLeidos?.get(o.id) ?? 0}
                    onOpen={onOpen}
                  />
                ))
              )}
              {sobran > 0 ? (
                <button
                  type="button"
                  className="text-royal-700 dark:text-royal-300 px-2 py-1 text-left text-xs font-medium hover:underline"
                  onClick={() => onVerMas(col.key)}
                >
                  + {sobran} más · ver en la Lista →
                </button>
              ) : null}
            </div>
          </section>
        )
      })}
    </div>
  )
}

const KanbanCard = memo(function KanbanCard({
  orden,
  proveedor,
  sinLeer,
  onOpen,
}: {
  orden: Orden
  proveedor: string | null
  sinLeer: number
  onOpen: (id: number) => void
}) {
  const solicita = quienSolicita(orden)
  const cargo = quienCargo(orden)
  const n = orden.items.length
  const cambios = cambiosDeProveedor(orden)
  const bcv = Number(orden.oferta_precio_bcv) || 0
  const efe = Number(orden.oferta_precio_efectivo) || 0
  const iva = Number(orden.iva) || 0
  const des = desglosarOc(orden)
  const cuadra = !orden.oc_codigo || des.cuadra
  const ivaPct = iva && des.subtotal ? Math.round((iva / Math.max(0.01, des.subtotal - des.descuento - (orden.iva_incluido ? iva : 0))) * 100) : 0
  // El pago (fase 3): lo que MGG muestra en las columnas de Tesorería, aquí en la tarjeta.
  const rets = orden.retenciones ?? []
  const credito = esCredito(orden) && ['cuenta_abierta', 'por_recibir', 'recibida', 'pagada'].includes(orden.estado)
  const saldo = credito ? saldoCredito(orden) : 0
  const creditoSaldado = credito && Number(orden.abonado_total) > 0 && saldo <= 0.01
  const metodos = (orden.metodo_pago ?? []).map((m) => labelMetodoPago(m.metodo)).join(' + ')
  const pago =
    credito && !creditoSaldado ? (
      <span className="text-warning">
        💳 Abonado {money(orden.abonado_total)} · Saldo {money(saldo)}
      </span>
    ) : orden.pagada_en && orden.pago_monto_usd != null ? (
      <span className="text-success">
        ✓ Pagada {money(orden.pago_monto_usd)}
        {orden.pago_referencia ? <span className="text-ink/50"> · ref. {orden.pago_referencia}</span> : null}
      </span>
    ) : orden.estado === 'oc_aprobada' || orden.estado === 'confirmada_metodo' ? (
      <span className="text-ink/65">
        {metodos ? <>💳 {metodos} · </> : null}
        {rets.length || Number(orden.descuento_pago) > 0 ? (
          <span title={`Retenciones −${money(totalRetenciones(rets))}`}>A pagar </span>
        ) : null}
        {rets.length || Number(orden.descuento_pago) > 0 || metodos ? (
          <strong className="font-mono">{money(montoAPagar(orden))}</strong>
        ) : null}
      </span>
    ) : null
  // La recepción y el cierre (fase 4).
  const prog = progresoRecepcion(orden)
  const listaParaFinalizar = puedeFinalizarse(orden)
  const recepcion =
    orden.estado === 'finalizada' ? (
      <span className="text-success">✓ Finalizada{orden.finalizada_en ? ` · ${fechaHoraVE(orden.finalizada_en)}` : ''}</span>
    ) : orden.recibida_en ? (
      <span className={listaParaFinalizar ? 'text-success' : 'text-ink/65'}>
        📦 Recibida {money(orden.recibido_total)}
        {orden.estado === 'recibida' && orden.condiciones_pago === 'contra_entrega' && !orden.metodo_pago?.length ? (
          <span className="text-warning"> · 💳 indicar método (pagar lo recibido)</span>
        ) : listaParaFinalizar ? (
          ' · lista para finalizar'
        ) : orden.estado === 'cuenta_abierta' ? (
          <span className="text-warning"> · pendiente por pagar</span>
        ) : null}
      </span>
    ) : prog.parcial ? (
      <span className="text-warning">
        📦 Recepción parcial · {prog.completos}/{prog.total} completos · {money(orden.recibido_total)}
      </span>
    ) : null
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
        {orden.oc_codigo ?? orden.codigo}
        {orden.urgente ? (
          <span className="bg-danger rounded px-1.5 py-0.5 font-sans text-[10px] font-semibold text-white">
            🚨 URGENTE
          </span>
        ) : null}
        {sinLeer ? (
          <Chip tone="royal" className="ml-auto font-sans" title={`${sinLeer} mensaje(s) sin leer`}>
            💬 {sinLeer}
          </Chip>
        ) : null}
      </div>
      {orden.oc_codigo ? <div className="text-ink/45 font-mono text-[11px]">{orden.codigo}</div> : null}
      <div className="text-ink/90 mt-1 font-semibold">
        {proveedor
          ? proveedor
          : solicita || orden.unidad_solicitante
            ? `Solicita: ${solicita ?? orden.unidad_solicitante}`
            : 'Sin proveedor asignado'}
      </div>
      <div className="text-ink/60 mt-1 flex flex-wrap items-center gap-1.5 text-xs">
        <span>
          {n} ítem{n !== 1 ? 's' : ''}
        </span>
        {cambios ? (
          <Chip tone="warning" title="Cambios de proveedor">
            ↻ {cambios}
          </Chip>
        ) : null}
        {creditoSaldado ? (
          <Chip tone="success" title="Crédito pagado en su totalidad">
            ✓ Pagado · {orden.recibida_en ? 'finalizar' : 'a recepción'}
          </Chip>
        ) : null}
        {rets.length ? (
          <Chip tone="neutral" title={rets.map((r) => `${r.tipo} −${money(r.monto)}`).join(' · ')}>
            🧾 Contiene retención
          </Chip>
        ) : null}
        {orden.pagada_en && !esCredito(orden) ? <span className="text-ink/45">✓ Pagada</span> : null}
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
      {proveedor && orden.modalidad_pago ? (
        <div className="mt-1 text-[11px]">
          <Chip tone={orden.modalidad_pago === 'usd' ? 'success' : 'info'}>
            {infoModalidad(orden.modalidad_pago).icono} {infoModalidad(orden.modalidad_pago).label}
          </Chip>
          {bcv > 0 && efe > 0 && efe < bcv ? (
            <div className="text-ink/55 mt-0.5">
              Cotiz. BCV: {money(bcv)} → en $: {money(efe)} (-{money(bcv - efe)})
            </div>
          ) : efe > 0 && orden.modalidad_pago === 'usd' ? (
            <div className="text-ink/55 mt-0.5">Opción en $: {money(efe)}</div>
          ) : null}
          {iva ? (
            <div className="text-ink/55">
              incl. IVA {ivaPct}% · {money(iva)}
            </div>
          ) : null}
        </div>
      ) : null}
      {pago ? <div className="mt-1 text-[11px]">{pago}</div> : null}
      {recepcion ? <div className="mt-1 text-[11px]">{recepcion}</div> : null}
      <div className="mt-2 flex items-center justify-between">
        <span className={cn('font-mono font-semibold', !cuadra && 'text-warning')} title={cuadra ? undefined : 'El total no cuadra con sus partes'}>
          {cuadra ? '' : '⚠ '}
          {money(orden.total)}
        </span>
        <span className="text-ink/45 text-xs" title={fechaHoraVE(orden.creado_en)}>
          {relTime(orden.creado_en)}
        </span>
      </div>
    </div>
  )
})
