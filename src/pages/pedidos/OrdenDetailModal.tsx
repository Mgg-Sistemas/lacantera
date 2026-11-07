import { useMemo, useState, type ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Visor } from '@/components/Visor'
import { cn } from '@/lib/cn'
import { useArticulos } from '@/lib/api/catalogo'
import { useEmpresa, empresaDelPapel } from '@/lib/api/empresa'
import {
  urlImagen,
  useEditarCantidades,
  useMarcarComprar,
  type ItemOrden,
  type Orden,
  type PermisosPedidos,
} from '@/lib/api/pedidos'
import {
  ESTADOS,
  claseEvento,
  etiquetaEvento,
  extraEvento,
  fechaHoraVE,
  fmtCant,
  money,
  repartoRenglon,
  revisadaPorAlmacen,
  textoEstadoSedes,
  type TonoEstado,
} from '@/lib/pedidos'
import { mensajeRevisionAlmacen, mensajeSolicitudPedido } from '@/lib/ficha/pedidosWhatsapp'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { armarSolicitudPedidoPdf } from '@/lib/ficha/pedidosPdf'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { ModalWhatsappCompra } from '@/pages/compras/ModalWhatsappCompra'
import { ConfirmDialog } from './Dialogos'

/*
  EL DETALLE DE UNA ORDEN (MGG `OrdenDetailModal`), EN LO QUE TOCA A LA FASE 1

  Los avisos de arriba (urgente, en revisión de almacén, revisada por almacén),
  las filas clave → valor, la tabla «Ítems» con «✎ Cantidades» y la columna
  «Comprar», el historial y los botones del pie de los estados de la SP:
  «↓ PDF de la OP», «💬 WhatsApp de la SP», «💬 Mensaje de almacén»,
  «Cancelar orden», «✎ Editar orden» y «Aprobar Orden de Pedido». Los de la OC
  (ofertas, aprobar, pagar, recibir, finalizar) llegan con sus fases.

  No se minimiza a la barra de abajo como en MGG: esa barra es una pieza del
  armazón de MGG que La Cantera no tiene, y para la fase 1 no hacía falta.
*/

const PUNTO: Record<TonoEstado, string> = {
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  royal: 'bg-royal-600',
  danger: 'bg-danger',
  neutral: 'bg-ink/30',
}

export function EstadoBadge({ estado }: { estado: string }) {
  const e = ESTADOS[estado as keyof typeof ESTADOS]
  return <Chip tone={e?.tono === 'royal' ? 'royal' : (e?.tono ?? 'neutral')}>{e?.label ?? estado}</Chip>
}

function Fila({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="border-hairline grid grid-cols-[9rem_1fr] gap-3 border-b py-2 text-sm last:border-b-0 sm:grid-cols-[12rem_1fr]">
      <div className="text-ink/50">{k}</div>
      <div className="text-ink/85 min-w-0 break-words">{children}</div>
    </div>
  )
}

export function OrdenDetailModal({
  orden: o,
  permisos,
  onClose,
  onApprove,
  onEditar,
  onCancel,
}: {
  orden: Orden
  permisos: PermisosPedidos
  onClose: () => void
  onApprove: () => void
  onEditar: () => void
  onCancel: () => void
}) {
  const yo = permisos.yo
  const canManageProcurement = permisos.gestiona
  const isPendiente = o.estado === 'pendiente'
  const enRevisionAlmacen = o.estado === 'revision_almacen'
  const canApprove = canManageProcurement && isPendiente
  const canEditar =
    (isPendiente || o.estado === 'aprobada' || enRevisionAlmacen) &&
    !o.oc_codigo &&
    (canManageProcurement || o.creado_por === yo)
  const canEditarCant =
    ['pendiente', 'aprobada', 'oc_creada'].includes(o.estado) && (canManageProcurement || o.creado_por === yo)
  // MGG lo ofrece a quien vea el detalle; la base solo lo acepta de quien la
  // cargó o la pide, o de Compras.
  const canCancel =
    ['pendiente', 'aprobada', 'revision_almacen'].includes(o.estado) &&
    (permisos.escribe || o.creado_por === yo || o.solicitante_id === yo)
  const revisadaAlmacen = o.clase !== 'servicio' && revisadaPorAlmacen(o)

  const { data: articulos } = useArticulos()
  const categoriaDe = useMemo(() => {
    const m = new Map<number, string>()
    for (const a of articulos ?? []) m.set(a.id, a.categoria)
    return m
  }, [articulos])
  const { data: empresa } = useEmpresa()

  const marcarComprar = useMarcarComprar()
  const editarCantidades = useEditarCantidades()

  const [mensajeWs, setMensajeWs] = useState<{ titulo: string; texto: string } | null>(null)
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [errorPdf, setErrorPdf] = useState<string | null>(null)

  const [editandoCant, setEditandoCant] = useState(false)
  const [cantDraft, setCantDraft] = useState<Record<string, string>>({})
  const [skusAEliminar, setSkusAEliminar] = useState<Set<string>>(new Set())
  const [porEliminar, setPorEliminar] = useState<ItemOrden | null>(null)

  function abrirEdicionCant() {
    const d: Record<string, string> = {}
    o.items.forEach((it) => {
      d[it.sku] = String(it.cantidad ?? 0)
    })
    setCantDraft(d)
    setSkusAEliminar(new Set())
    setEditandoCant(true)
  }
  function cerrarEdicionCant() {
    setEditandoCant(false)
    setSkusAEliminar(new Set())
    setPorEliminar(null)
  }
  async function guardarCantidades() {
    const mapa: Record<string, number> = {}
    for (const it of o.items) {
      if (skusAEliminar.has(it.sku)) continue
      const v = Number(String(cantDraft[it.sku] ?? '').replace(',', '.'))
      // Lo que el almacén ya entregó entero queda en cero: no se manda.
      if (v === 0 && Number(it.cantidad) === 0 && Number(it.cantidad_almacen) > 0) continue
      if (!Number.isFinite(v) || v <= 0) {
        toast(`La cantidad de "${it.nombre}" debe ser mayor que 0.`, 'error')
        return
      }
      mapa[it.sku] = v
    }
    if (!Object.keys(mapa).length) {
      toast('La orden debe conservar al menos un producto: no se pueden eliminar todos.', 'error')
      return
    }
    try {
      const eliminados = Array.from(skusAEliminar)
      await editarCantidades.mutateAsync({ id: o.id, cantidades: mapa, eliminar: eliminados })
      toast(
        eliminados.length
          ? `${eliminados.length} producto(s) eliminado(s) · ofertas y presupuesto recalculados`
          : 'Cantidades actualizadas · comparativa recalculada',
        'success',
      )
      cerrarEdicionCant()
    } catch (e) {
      toast(mensajeDe(e, 'No se pudieron actualizar las cantidades'), 'error')
    }
  }

  async function toggleComprar(sku: string, comprar: boolean) {
    try {
      await marcarComprar.mutateAsync({ id: o.id, sku, comprar })
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo actualizar el ítem'), 'error')
    }
  }

  async function handleDownloadPdf() {
    try {
      setErrorPdf(null)
      setPdf(await armarSolicitudPedidoPdf(o, empresaDelPapel(empresa)))
    } catch (e) {
      setErrorPdf(mensajeDe(e, 'No se pudo generar el PDF'))
    }
  }

  async function verImagen(path: string) {
    try {
      window.open(await urlImagen(path), '_blank', 'noopener')
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo abrir la imagen'), 'error')
    }
  }

  const conPrecio = Number(o.total) > 0
  const puedeEditarComprar =
    !conPrecio && canManageProcurement && o.estado !== 'revision_almacen' && o.estado !== 'atendida_almacen'
  const historial = [...(o.historial ?? [])].reverse()

  const buttons = (
    <>
      {isPendiente ? (
        <Button variant="ghost" onClick={() => void handleDownloadPdf()} title="Descargar la Orden de Pedido en PDF">
          ↓ PDF de la OP
        </Button>
      ) : null}
      {o.clase !== 'servicio' ? (
        <Button
          variant="ghost"
          title="Ver el mensaje de la Solicitud de Pedido (productos y cantidades) para copiarlo o mandarlo por WhatsApp"
          onClick={() => setMensajeWs({ titulo: `Solicitud de Pedido · ${o.codigo}`, texto: mensajeSolicitudPedido(o) })}
        >
          💬 WhatsApp de la SP
        </Button>
      ) : null}
      {revisadaAlmacen ? (
        <Button
          variant="ghost"
          title="Ver el mensaje de almacén (qué tiene y qué va a solicitar a Compras) para copiarlo o mandarlo por WhatsApp"
          onClick={() => setMensajeWs({ titulo: `Revisión de almacén · ${o.codigo}`, texto: mensajeRevisionAlmacen(o) })}
        >
          💬 Mensaje de almacén
        </Button>
      ) : null}
      {canCancel ? (
        <Button variant="danger" onClick={onCancel}>
          Cancelar orden
        </Button>
      ) : null}
      {canEditar ? (
        <Button variant="ghost" onClick={onEditar} title="Editar la orden antes de su aprobación">
          ✎ Editar orden
        </Button>
      ) : null}
      {canApprove ? (
        <Button
          className="bg-success hover:bg-success hover:brightness-95"
          onClick={onApprove}
          title="Aprobar la Orden de Pedido"
        >
          Aprobar Orden de Pedido
        </Button>
      ) : null}
      <Button variant="ghost" onClick={onClose}>
        Cerrar
      </Button>
    </>
  )

  return (
    <>
      <Modal
        abierto
        onCerrar={onClose}
        titulo={`Orden ${o.codigo}${o.urgente ? ' · 🚨 URGENTE' : ''}`}
        ancho="lg"
        acciones={buttons}
      >
        {o.urgente ? (
          <div className="border-danger bg-danger/8 text-danger mb-3 rounded-[6px] border px-3 py-2 text-sm font-bold">
            🚨 ORDEN URGENTE — solicitud marcada como prioritaria.
          </div>
        ) : null}

        {enRevisionAlmacen ? (
          <div className="border-info bg-canvas mb-3 rounded-[6px] border px-3 py-2 text-sm font-semibold">
            ⏳ En revisión de almacén ({textoEstadoSedes(o)}): Compras la recibe cuando todos los almacenes confirmen.
            <div className="text-ink/55 text-xs font-normal">📍 Se necesita en Almacén General</div>
          </div>
        ) : null}

        {revisadaAlmacen ? (
          <div
            className={cn(
              'bg-canvas mb-3 rounded-[6px] border px-3 py-2 text-sm',
              o.estado === 'atendida_almacen' ? 'border-success' : 'border-info',
            )}
          >
            <div className="font-semibold">
              📦 Revisada por almacén
              {o.revisada_almacen_por_nombre ? <> · {o.revisada_almacen_por_nombre}</> : null}
              {o.revisada_almacen_en ? (
                <span className="text-ink/55 font-normal"> · {fechaHoraVE(o.revisada_almacen_en)}</span>
              ) : null}
            </div>
            <div className="text-ink/60 text-xs">
              {o.estado === 'atendida_almacen'
                ? 'Almacén tiene todo lo solicitado: no pasa a Compras.'
                : 'A Compras llega solo lo que falta (columna «A comprar»).'}
              {(() => {
                const n = o.items.filter((it) => repartoRenglon(it).almacen > 0).length
                return n > 0 ? <> Entrega: Almacén General {n} renglón(es).</> : null
              })()}
            </div>
            <div className="mt-1 text-xs">
              📍 Se necesita en <strong className="font-semibold">Almacén General</strong>
            </div>
            {o.salida_almacen_numero ? (
              <div className="mt-1 text-xs">
                📤 Sale por la solicitud de salida{' '}
                <strong className="font-mono font-semibold">{o.salida_almacen_numero}</strong>, a autorizar en Salidas.
              </div>
            ) : null}
            {o.nota_almacen?.trim() ? <div className="mt-1 text-xs whitespace-pre-wrap">📝 {o.nota_almacen}</div> : null}
          </div>
        ) : null}

        <div>
          {o.imagenes?.length ? (
            <Fila k="Imágenes de referencia">
              <div className="flex flex-wrap gap-1.5">
                {o.imagenes.map((a, i) => (
                  <Button key={a.path} size="sm" variant="ghost" onClick={() => void verImagen(a.path)}>
                    📷 Ver imagen{o.imagenes.length > 1 ? ` ${i + 1}` : ''}
                  </Button>
                ))}
              </div>
            </Fila>
          ) : null}
          <Fila k="Código">
            <span className="font-mono">{o.codigo}</span>
          </Fila>
          <Fila k="Estado">
            <EstadoBadge estado={o.estado} />
          </Fila>
          <Fila k="Proveedor actual">—</Fila>
          <Fila k="Unidad solicitante">{o.unidad_solicitante ?? '—'}</Fila>
          <Fila k="Solicita">{o.solicitante_nombre ?? '—'}</Fila>
          <Fila k="Cargada por">{o.creado_por_nombre ?? '—'}</Fila>
          <Fila k="Creada">{fechaHoraVE(o.creado_en)}</Fila>
          {o.notas?.trim() ? <Fila k="Nota">{o.notas}</Fila> : null}
          {o.aprobada_en ? (
            <Fila k="Aprobada">
              {fechaHoraVE(o.aprobada_en)} <span className="text-ink/50">por {o.aprobada_por_nombre ?? '—'}</span>
            </Fila>
          ) : null}
          {o.rechazada_en ? (
            <Fila k="Rechazada">
              {fechaHoraVE(o.rechazada_en)} · {o.motivo_rechazo ?? ''}
            </Fila>
          ) : null}
          {o.cancelada_en ? (
            <Fila k="Cancelada">
              {fechaHoraVE(o.cancelada_en)} · {o.motivo_cancelacion ?? ''}{' '}
              <span className="text-ink/50">por {o.cancelada_por_nombre ?? '—'}</span>
            </Fila>
          ) : null}
          {o.oc_codigo ? (
            <Fila k="Código OC">
              <span className="font-mono">{o.oc_codigo}</span>
            </Fila>
          ) : null}
          {o.oc_creada_en ? (
            <Fila k="OC creada">
              {fechaHoraVE(o.oc_creada_en)} <span className="text-ink/50">por {o.oc_creada_por_nombre ?? '—'}</span>
            </Fila>
          ) : null}
          {o.oc_aprobada_en ? (
            <Fila k="OC confirmada">
              {fechaHoraVE(o.oc_aprobada_en)}{' '}
              <span className="text-ink/50">por {o.oc_aprobada_por_nombre ?? '—'}</span>
            </Fila>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-ink/85 font-semibold">Ítems</h4>
          {canEditarCant ? (
            editandoCant ? (
              <span className="inline-flex items-center gap-2">
                {skusAEliminar.size > 0 ? <Chip tone="danger">{skusAEliminar.size} por eliminar</Chip> : null}
                <Button size="sm" variant="ghost" onClick={cerrarEdicionCant} disabled={editarCantidades.isPending}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={() => void guardarCantidades()} disabled={editarCantidades.isPending}>
                  {editarCantidades.isPending ? 'Guardando…' : '✓ Guardar cambios'}
                </Button>
              </span>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={abrirEdicionCant}
                title="Editar las cantidades de la SP o eliminar productos antes de elegir el proveedor"
              >
                ✎ Cantidades
              </Button>
            )
          ) : null}
        </div>

        <div className="border-hairline mt-2 overflow-x-auto rounded-[6px] border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-ink/4 text-ink/55 text-left text-xs">
              <tr>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 font-medium">Categoría</th>
                <th className="px-3 py-2 font-medium">Subcategoría</th>
                {revisadaAlmacen ? (
                  <>
                    <th className="px-3 py-2 text-right font-medium">Solicitado</th>
                    <th className="px-3 py-2 text-right font-medium">Almacén tiene</th>
                  </>
                ) : null}
                <th className="px-3 py-2 text-right font-medium">{revisadaAlmacen ? 'A comprar' : 'Cantidad'}</th>
                {conPrecio ? (
                  <>
                    <th className="px-3 py-2 text-right font-medium">Precio</th>
                    <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                  </>
                ) : (
                  <th className="px-3 py-2 text-right font-medium">Comprar</th>
                )}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {o.items.map((it, idx) => {
                const marcado = skusAEliminar.has(it.sku)
                const u = it.unidad ? ` ${it.unidad}` : ''
                return (
                  <tr
                    key={`${it.sku}-${idx}`}
                    className="border-hairline border-t"
                    style={{ opacity: marcado ? 0.45 : !conPrecio && it.comprar === false ? 0.5 : 1 }}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{it.sku}</td>
                    <td className={cn('px-3 py-2', marcado && 'line-through')}>
                      {it.nombre}
                      {it.general ? (
                        <Chip
                          tone="warning"
                          className="ml-1.5"
                          title="Nombre general: no es un producto del inventario. Compras fija el nombre de inventario al cotizar."
                        >
                          nombre general
                        </Chip>
                      ) : null}
                      {[it.marca, it.modelo].filter(Boolean).length > 0 ? (
                        <div className="text-ink/55 text-xs">🏷 {[it.marca, it.modelo].filter(Boolean).join(' · ')}</div>
                      ) : null}
                      {it.finalidad ? <div className="text-ink/55 text-xs">🎯 {it.finalidad}</div> : null}
                      {it.almacen_sin_salida ? (
                        <div className="text-warning text-xs">
                          ⚠ La salida {it.almacen_sin_salida} no se aprobó: volvió a Compras
                        </div>
                      ) : null}
                    </td>
                    <td className="text-ink/65 px-3 py-2 text-xs">
                      {it.articulo_id ? (categoriaDe.get(it.articulo_id) ?? '—') : '—'}
                    </td>
                    <td className="text-ink/40 px-3 py-2 text-xs">—</td>
                    {revisadaAlmacen ? (
                      <>
                        <td className="px-3 py-2 text-right">
                          {it.cantidad_solicitada != null ? `${fmtCant(it.cantidad_solicitada)}${u}` : '—'}
                        </td>
                        <td
                          className={cn(
                            'px-3 py-2 text-right',
                            Number(it.cantidad_almacen) > 0 && 'text-success font-semibold',
                          )}
                        >
                          {it.cantidad_almacen != null ? `${fmtCant(it.cantidad_almacen)}${u}` : '—'}
                        </td>
                      </>
                    ) : null}
                    <td className="px-3 py-2 text-right">
                      {editandoCant ? (
                        <span className="inline-flex items-center justify-end gap-1">
                          <input
                            inputMode="decimal"
                            className="border-ink/20 w-20 rounded border px-1.5 py-0.5 text-right font-mono"
                            value={cantDraft[it.sku] ?? ''}
                            disabled={editarCantidades.isPending}
                            onChange={(e) => setCantDraft((d) => ({ ...d, [it.sku]: e.target.value }))}
                          />
                          {it.unidad ? <span className="text-ink/50 text-xs">{it.unidad}</span> : null}
                        </span>
                      ) : (
                        <>
                          {fmtCant(it.cantidad)}
                          {u}
                        </>
                      )}
                    </td>
                    {conPrecio ? (
                      <>
                        <td className="px-3 py-2 text-right">{money(it.precio)}</td>
                        <td className="px-3 py-2 text-right">{money(Number(it.cantidad) * Number(it.precio))}</td>
                      </>
                    ) : (
                      <td className="px-3 py-2 text-right">
                        {puedeEditarComprar ? (
                          <input
                            type="checkbox"
                            className="accent-royal-600 size-4 cursor-pointer"
                            checked={it.comprar !== false}
                            disabled={marcarComprar.isPending}
                            title={it.comprar === false ? 'Marcar para comprar' : 'Quitar de la compra'}
                            onChange={(e) => void toggleComprar(it.sku, e.target.checked)}
                          />
                        ) : it.comprar === false ? (
                          '—'
                        ) : (
                          '✓'
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {editandoCant ? (
                        marcado ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Deshacer: volver a incluir este producto"
                            onClick={() =>
                              setSkusAEliminar((s) => {
                                const n = new Set(s)
                                n.delete(it.sku)
                                return n
                              })
                            }
                          >
                            ↩ deshacer
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger"
                            title="Eliminar este producto de la solicitud"
                            onClick={() => setPorEliminar(it)}
                          >
                            🗑
                          </Button>
                        )
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {conPrecio ? (
              <tfoot>
                <tr className="border-hairline border-t font-semibold">
                  <td colSpan={revisadaAlmacen ? 8 : 6} className="px-3 py-2 text-right">
                    TOTAL
                  </td>
                  <td className="px-3 py-2 text-right">{money(o.total)}</td>
                  <td />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        <h4 className="text-ink/85 mt-6 mb-2 font-semibold">Historial</h4>
        {historial.length === 0 ? (
          <p className="text-ink/50 text-sm">Sin eventos registrados.</p>
        ) : (
          <ol className="border-hairline ml-1.5 space-y-3 border-l pl-4">
            {historial.map((h, i) => (
              <li key={`${h.at}-${i}`} className="relative">
                <span
                  className={cn(
                    'absolute top-1.5 -left-[21px] size-2.5 rounded-full ring-2 ring-[var(--color-surface,white)]',
                    PUNTO[claseEvento(h.evento)],
                  )}
                  aria-hidden="true"
                />
                <div className="text-ink/85 text-sm">
                  {etiquetaEvento(h.evento)}
                  {extraEvento(h)}
                </div>
                <div className="text-ink/50 text-xs">
                  {fechaHoraVE(h.at)} · {h.actor_nombre ?? '—'}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Modal>

      {porEliminar ? (
        <ConfirmDialog
          title="Eliminar producto de la solicitud"
          message={`¿Eliminar "${porEliminar.nombre}"${porEliminar.sku ? ` (${porEliminar.sku})` : ''} de ${o.codigo}?\n\nSale de la solicitud y las ofertas cargadas se recalculan sin él: su presupuesto baja y el IVA/IGTF se ajusta a lo que queda.\n\nSe aplica al guardar los cambios.`}
          confirmText="Eliminar producto"
          danger
          onCancel={() => setPorEliminar(null)}
          onConfirm={() => {
            setSkusAEliminar((s) => new Set(s).add(porEliminar.sku))
            setPorEliminar(null)
          }}
        />
      ) : null}

      {mensajeWs ? (
        <ModalWhatsappCompra titulo={mensajeWs.titulo} texto={mensajeWs.texto} onCerrar={() => setMensajeWs(null)} />
      ) : null}

      <Visor
        abierto={pdf !== null || errorPdf !== null}
        error={errorPdf}
        onCerrar={() => {
          setPdf(null)
          setErrorPdf(null)
        }}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? `${o.codigo}.pdf`}
        titulo={`Solicitud de Pedido ${o.codigo}`}
        descripcion={empresaDelPapel(empresa).razonSocial}
      />
    </>
  )
}
