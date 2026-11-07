import { memo, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Segmento } from '@/components/ui/Segmento'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Vacio } from '@/components/ui/Estado'
import { Visor } from '@/components/Visor'
import { cn } from '@/lib/cn'
import { useProveedores } from '@/lib/api/catalogo'
import { useEmpresa, empresaDelPapel } from '@/lib/api/empresa'
import {
  borrarArchivosDirecto,
  subirArchivoDirecto,
  useAgregarUnidad,
  useCatalogo,
  useCrearServicioDirecto,
  useDetalleServicioDirecto,
  useEliminarServicioDirecto,
  useEquiposServicio,
  useMontarServicioDirecto,
  useServiciosDirectos,
  useUnidadesSolicitantes,
  type ArchivoSubido,
  type DetalleServicioItem,
  type EstadoServicioDirecto,
  type LineaServicioDirecto,
  type PermisosPedidos,
  type ServicioDirecto,
} from '@/lib/api/pedidos'
import { fechaHoraVE, fmtCant, money } from '@/lib/pedidos'
import {
  COLUMNAS_SD,
  ELECTRODOMESTICOS,
  ESTADO_SD,
  TIPOS_SERVICIO_DIRECTO,
  equiposDeTipo,
  esMantenimientoElectrodomestico,
  esRecarga,
  esRecargaAgua,
  limpiarDetalle,
  opcionesTipo,
  rotuloEquipo,
  tipoMantenimiento,
  totalRecarga,
} from '@/lib/servicios'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { armarServicioDirectoPdf, montoAPagarDirecto, textoServicioDirectoPagado, textoServicioDirectoPago } from '@/lib/ficha/servicioDirecto'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { enMayuscula } from '@/lib/texto'
import { ModalWhatsappCompra } from '@/pages/compras/ModalWhatsappCompra'
import { ConfirmDialog } from './Dialogos'
import { DetalleItemsEditor } from './DetalleItemsEditor'
import { DetalleDirectoModal } from './DetalleDirectoModal'
import { EditarMontosModal } from './EditarMontosModal'
import { FacturasModal } from './FacturasModal'
import { MetodoPagoModal } from './MetodoPagoModal'
import { MarcarPagadaModal } from './PagoModales'
import { abrirArchivoDirecto, ordenDesdeDirecto } from './ordenDesdeDirecto'

/*
  «🔧 SERVICIO DIRECTO» (MGG `ServicioDirectoView`) · FASE 5a

  Un servicio ya contratado o ya prestado que se registra directo, sin
  solicitud ni cotización: el kanban «En proceso | Por pagar | … |
  Finalizada», la lista, la tarjeta y sus botones, el alta con varios
  servicios (categoría · tipo · equipo de Maquinaria), «Cargar factura y
  monto», «✎ Detalle», «✎ Editar montos», «🧾 Facturas» y el detalle.

  Lo que se aparta de MGG, a propósito:
    - SIN TESORERÍA (decisión de la dueña). En MGG «Cargar factura y monto»
      lo manda a Tesorería, que lo paga desde una caja. Aquí queda «Por
      pagar» y sigue el esquema de la fase 3: «💳 Indicar método de pago»
      (documento y retenciones IVA/ISLR/IGTF/ISAE) → «Confirmado pagar» →
      «💵 Marcar pagado» (el comprobante se puede subir o no) → «Finalizada».
      Por eso el kanban suma la columna «Confirmado pagar».
    - SIN ANTICIPO NI «PAGAR CON ABONOS»: en MGG los dos crean una Cuenta por
      Pagar en Tesorería, que aquí no existe.
    - SIN «REPUESTO DEL INVENTARIO»: en MGG el alta descuenta el repuesto del
      stock en el momento; aquí toda salida pasa por una solicitud de salida
      autorizada en Salidas, así que el repuesto se pide por ahí.
    - SIEMPRE EN $: sin «Moneda del servicio» ni «⇄ Convertir».
    - «+ NUEVO SERVICIO DIRECTO» A LA VISTA (MGG lo escondió «por ahora»): sin
      él la pestaña no tendría de dónde llenarse. Lo usa quien lleva Compras.
*/

type Vista = 'kanban' | 'lista'
const VISTA_KEY = 'pedidos.vista.servicio-directo'

const leerVista = (): Vista => {
  try {
    return localStorage.getItem(VISTA_KEY) === 'lista' ? 'lista' : 'kanban'
  } catch {
    return 'kanban'
  }
}

type ModalSd =
  | { kind: 'none' }
  | { kind: 'crear' }
  | { kind: 'detalle'; id: number }
  | { kind: 'montar'; id: number }
  | { kind: 'detalle_edit'; id: number }
  | { kind: 'metodo'; id: number; modo: 'enviar' | 'corregir' }
  | { kind: 'pagar'; id: number }
  | { kind: 'montos'; id: number }
  | { kind: 'facturas'; id: number }
  | { kind: 'eliminar'; id: number }
  | { kind: 'ws'; id: number; tipo: 'pago' | 'pagado' }

const COLOR_COLUMNA: Record<EstadoServicioDirecto, string> = {
  en_proceso: 'bg-ink/25',
  por_pagar: 'bg-warning',
  confirmada_pagar: 'bg-info',
  finalizada: 'bg-success',
}

export function ServicioDirectoView({ permisos }: { permisos: PermisosPedidos }) {
  const q = useServiciosDirectos()
  const servicios = useMemo(() => q.data ?? [], [q.data])
  const { data: proveedores } = useProveedores(false)
  const { data: empresa } = useEmpresa()
  const eliminar = useEliminarServicioDirecto()

  const [vista, setVista] = useState<Vista>(leerVista)
  const [modal, setModal] = useState<ModalSd>({ kind: 'none' })
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [tituloPdf, setTituloPdf] = useState('')
  const [errorPdf, setErrorPdf] = useState<string | null>(null)

  const gestiona = permisos.gestiona
  const sel = 'id' in modal ? (servicios.find((s) => s.id === modal.id) ?? null) : null
  const empresaNombre = empresaDelPapel(empresa).razonSocial

  // ?sd=ID abre el detalle (los avisos de la campana). Se consume de la URL.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const id = searchParams.get('sd')
    if (!id || !q.isSuccess) return
    const next = new URLSearchParams(searchParams)
    next.delete('sd')
    setSearchParams(next, { replace: true })
    const s = servicios.find((x) => String(x.id) === id)
    if (!s) toast('Ese servicio directo no existe o fue eliminado.', 'warning')
    else setModal({ kind: 'detalle', id: s.id })
  }, [searchParams, setSearchParams, q.isSuccess, servicios])

  function cambiarVista(v: Vista) {
    setVista(v)
    try {
      localStorage.setItem(VISTA_KEY, v)
    } catch {
      /* localStorage no disponible */
    }
  }

  async function verPdf(s: ServicioDirecto) {
    try {
      setErrorPdf(null)
      setTituloPdf(`Servicio directo ${s.codigo}`)
      setPdf(await armarServicioDirectoPdf(s, empresaDelPapel(empresa)))
    } catch (e) {
      setErrorPdf(mensajeDe(e, 'No se pudo generar el PDF'))
    }
  }

  const porEstado = useMemo(() => {
    const m = new Map<EstadoServicioDirecto, ServicioDirecto[]>()
    COLUMNAS_SD.forEach((c) => m.set(c.key, []))
    servicios.forEach((s) => m.get(s.estado)?.push(s))
    return m
  }, [servicios])

  /** Los botones de cada estado: los mismos en la tarjeta, la lista y el detalle. */
  function acciones(s: ServicioDirecto, enDetalle = false): ReactNode {
    const ir = (m: ModalSd) => setModal(m)
    return (
      <>
        <Button size="sm" variant="ghost" title="Ver detalle en PDF (vista previa)" onClick={() => void verPdf(s)}>
          ↓ PDF
        </Button>
        {gestiona ? (
          <Button size="sm" variant="ghost" title="Detallar piezas/reparaciones de cada renglón" onClick={() => ir({ kind: 'detalle_edit', id: s.id })}>
            ✎ Detalle
          </Button>
        ) : null}
        {s.estado === 'en_proceso' && gestiona ? (
          <Button size="sm" onClick={() => ir({ kind: 'montar', id: s.id })}>
            Cargar factura y monto
          </Button>
        ) : null}
        {s.estado === 'por_pagar' && gestiona ? (
          <>
            <Button size="sm" variant="ghost" title="Editar factura/monto (antes de indicar el método de pago)" onClick={() => ir({ kind: 'montar', id: s.id })}>
              {enDetalle ? '✎ Editar factura/monto' : '✎ Factura/monto'}
            </Button>
            <Button size="sm" onClick={() => ir({ kind: 'metodo', id: s.id, modo: 'enviar' })}>
              💳 Indicar método de pago
            </Button>
          </>
        ) : null}
        {s.estado === 'confirmada_pagar' ? (
          <>
            <Button size="sm" variant="ghost" title="Mensaje con el monto a pagar y los datos del proveedor" onClick={() => ir({ kind: 'ws', id: s.id, tipo: 'pago' })}>
              💬 WhatsApp para pagar
            </Button>
            {gestiona ? (
              <Button
                size="sm"
                variant="ghost"
                title="Corregir el método, los datos del beneficiario, el documento y las retenciones"
                onClick={() => ir({ kind: 'metodo', id: s.id, modo: 'corregir' })}
              >
                💳 Editar método de pago / datos
              </Button>
            ) : null}
            {permisos.aprueba_oc ? (
              <Button size="sm" className="bg-success hover:bg-success hover:brightness-95" onClick={() => ir({ kind: 'pagar', id: s.id })}>
                💵 Marcar pagado
              </Button>
            ) : null}
          </>
        ) : null}
        {s.estado === 'finalizada' ? (
          <>
            {gestiona ? (
              <Button size="sm" variant={enDetalle ? 'primary' : 'ghost'} title="Corregir el monto por renglón" onClick={() => ir({ kind: 'montos', id: s.id })}>
                {enDetalle ? '✎ Editar montos' : '✎ Editar'}
              </Button>
            ) : null}
            {gestiona ? (
              <Button size="sm" variant="ghost" title="Cargar nuevas facturas / quitar anteriores" onClick={() => ir({ kind: 'facturas', id: s.id })}>
                🧾 Facturas
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                s.pago_comprobante_path
                  ? void abrirArchivoDirecto(s.pago_comprobante_path)
                  : toast('No se adjuntó comprobante en este pago', 'info')
              }
            >
              📥 Comprobante de pago
            </Button>
            <Button size="sm" variant="ghost" onClick={() => ir({ kind: 'ws', id: s.id, tipo: 'pagado' })}>
              💬 Aviso de pago
            </Button>
          </>
        ) : null}
        {/* Un servicio directo FINALIZADO no se puede eliminar (registro definitivo). */}
        {s.estado !== 'finalizada' && gestiona ? (
          <Button size="sm" variant="ghost" className="text-danger" title="Eliminar" onClick={() => ir({ kind: 'eliminar', id: s.id })}>
            🗑 Eliminar
          </Button>
        ) : null}
      </>
    )
  }

  const proveedorDe = (id: number | null) => (id ? proveedores?.find((p) => p.id === id) : undefined)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        {gestiona ? <Button onClick={() => setModal({ kind: 'crear' })}>+ Nuevo servicio directo</Button> : null}
        <Segmento
          className="h-10"
          valor={vista}
          onCambio={(v) => cambiarVista(v as Vista)}
          opciones={[
            { valor: 'kanban', etiqueta: '▦ Kanban', pista: 'Vista Kanban' },
            { valor: 'lista', etiqueta: '☰ Lista', pista: 'Vista Lista' },
          ]}
        />
      </div>

      {q.error ? (
        <Card className="border-danger mb-4 border">
          <strong>Error:</strong> {mensajeDe(q.error, 'Error al cargar los servicios directos')}
        </Card>
      ) : null}

      {q.isPending ? (
        <Vacio icono={<span className="text-3xl">◔</span>} titulo="Cargando servicios directos..." />
      ) : !servicios.length ? (
        <Card>
          <Vacio icono={<span className="text-3xl">🛠</span>} titulo="Sin servicios directos registrados." />
        </Card>
      ) : vista === 'kanban' ? (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
          {COLUMNAS_SD.map((col) => {
            const items = porEstado.get(col.key) ?? []
            return (
              <section key={col.key} className="bg-ink/3 border-hairline flex w-72 shrink-0 flex-col rounded-[10px] border">
                <header className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <span className="text-ink/70 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
                    <span className={cn('size-2 rounded-full', COLOR_COLUMNA[col.key])} aria-hidden="true" />
                    {col.label}
                  </span>
                  <span className="bg-ink/8 text-ink/65 rounded-full px-2 py-0.5 text-xs font-medium">{items.length}</span>
                </header>
                <div className="flex flex-col gap-2 px-2 pb-2">
                  {items.length === 0 ? (
                    <div className="text-ink/40 border-ink/10 rounded-[8px] border border-dashed px-3 py-4 text-center text-xs">—</div>
                  ) : (
                    items.map((s) => (
                      <TarjetaServicio key={s.id} servicio={s} onVer={() => setModal({ kind: 'detalle', id: s.id })}>
                        {acciones(s)}
                      </TarjetaServicio>
                    ))
                  )}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <Card flush className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-ink/55 border-hairline border-b text-left text-xs">
              <tr>
                <th className="px-3 py-2.5 font-medium">Código</th>
                <th className="px-3 py-2.5 font-medium">Servicio(s)</th>
                <th className="px-3 py-2.5 font-medium">Equipo</th>
                <th className="px-3 py-2.5 font-medium">Proveedor</th>
                <th className="px-3 py-2.5 font-medium">Estado</th>
                <th className="px-3 py-2.5 text-right font-medium">Monto</th>
                <th className="px-3 py-2.5 font-medium">Generó</th>
                <th className="px-3 py-2.5 font-medium">Creado</th>
                <th className="px-3 py-2.5 font-medium">Pagado</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {servicios.map((s) => (
                <tr
                  key={s.id}
                  className="border-hairline hover:bg-ink/3 cursor-pointer border-b last:border-b-0"
                  title="Ver el detalle"
                  onClick={() => setModal({ kind: 'detalle', id: s.id })}
                >
                  <td className="px-3 py-2 font-mono text-xs">{s.codigo}</td>
                  <td className="px-3 py-2">
                    {s.descripcion}
                    {s.items.length > 1 ? <span className="text-ink/50"> · {s.items.length} ítems</span> : null}
                  </td>
                  <td className="px-3 py-2">{s.equipo_nombre || '—'}</td>
                  <td className="px-3 py-2">{s.proveedor_nombre || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{ESTADO_SD[s.estado] ?? s.estado}</td>
                  <td className="px-3 py-2 text-right font-mono">{s.gasto != null ? money(s.gasto) : '—'}</td>
                  <td className="px-3 py-2">{s.creado_por_nombre ?? '—'}</td>
                  <td className="text-ink/55 px-3 py-2 text-xs">{fechaHoraVE(s.creado_en)}</td>
                  <td className="text-ink/55 px-3 py-2 text-xs">{s.pagada_en ? fechaHoraVE(s.pagada_en) : '—'}</td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap gap-1">{acciones(s)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {modal.kind === 'crear' ? (
        <CrearServicioDirectoModal onClose={() => setModal({ kind: 'none' })} onCreado={(id) => setModal({ kind: 'detalle', id })} />
      ) : null}

      {modal.kind === 'detalle' && sel ? (
        <DetalleDirectoModal
          servicio={sel}
          onClose={() => setModal({ kind: 'none' })}
          footer={
            <>
              {acciones(sel, true)}
              <Button variant="ghost" onClick={() => setModal({ kind: 'none' })}>
                Cerrar
              </Button>
            </>
          }
        />
      ) : null}

      {modal.kind === 'montar' && sel ? (
        <MontarServicioModal servicio={sel} onClose={() => setModal({ kind: 'none' })} onListo={() => setModal({ kind: 'detalle', id: sel.id })} />
      ) : null}

      {modal.kind === 'detalle_edit' && sel ? <DetalleEditModal servicio={sel} onClose={() => setModal({ kind: 'none' })} /> : null}

      {modal.kind === 'metodo' && sel ? (
        <MetodoPagoModal
          orden={ordenDesdeDirecto(sel)}
          proveedor={proveedorDe(sel.proveedor_id)}
          modo={modal.modo}
          directo={sel}
          onClose={() => setModal({ kind: 'none' })}
          onListo={() => setModal({ kind: 'ws', id: sel.id, tipo: 'pago' })}
        />
      ) : null}

      {modal.kind === 'pagar' && sel ? (
        <MarcarPagadaModal
          orden={ordenDesdeDirecto(sel)}
          directo={sel}
          onClose={() => setModal({ kind: 'none' })}
          onListo={() => setModal({ kind: 'ws', id: sel.id, tipo: 'pagado' })}
        />
      ) : null}

      {modal.kind === 'montos' && sel ? <EditarMontosModal servicio={sel} onClose={() => setModal({ kind: 'none' })} /> : null}

      {modal.kind === 'facturas' && sel ? <FacturasModal servicio={sel} onClose={() => setModal({ kind: 'none' })} /> : null}

      {modal.kind === 'eliminar' && sel ? (
        <ConfirmDialog
          title="Eliminar servicio directo"
          message={`¿Eliminar el servicio directo ${sel.codigo} · "${sel.descripcion}"? Esta acción no se puede deshacer.`}
          confirmText="Eliminar"
          danger
          busy={eliminar.isPending}
          onCancel={() => setModal({ kind: 'none' })}
          onConfirm={async () => {
            try {
              await eliminar.mutateAsync(sel.id)
              toast('Servicio directo eliminado', 'success')
              setModal({ kind: 'none' })
            } catch (e) {
              toast(mensajeDe(e, 'No se pudo eliminar'), 'error')
            }
          }}
        />
      ) : null}

      {modal.kind === 'ws' && sel ? (
        <ModalWhatsappCompra
          titulo={
            modal.tipo === 'pago'
              ? `Avisar para pagar · ${sel.codigo}`
              : `Avisar por WhatsApp · ${sel.codigo} PAGADO`
          }
          texto={modal.tipo === 'pago' ? textoServicioDirectoPago(sel, empresaNombre) : textoServicioDirectoPagado(sel, empresaNombre)}
          onCerrar={() => setModal({ kind: 'none' })}
        />
      ) : null}

      <Visor
        abierto={pdf !== null || errorPdf !== null}
        error={errorPdf}
        onCerrar={() => {
          setPdf(null)
          setErrorPdf(null)
        }}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? 'servicio-directo.pdf'}
        titulo={tituloPdf || 'Servicio directo'}
        descripcion={empresaNombre}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// La tarjeta (MGG `ServicioCard`)
// ---------------------------------------------------------------------------

const TarjetaServicio = memo(function TarjetaServicio({
  servicio: s,
  onVer,
  children,
}: {
  servicio: ServicioDirecto
  onVer: () => void
  children: ReactNode
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      title="Ver el detalle"
      onClick={onVer}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onVer()
      }}
      className="bg-surface shadow-card hover:border-royal-600/40 cursor-pointer rounded-[8px] border border-transparent p-3 text-sm transition-colors"
    >
      <div className="flex justify-between gap-2">
        <strong className="text-ink/90 font-semibold">{s.descripcion}</strong>
        <span className="bg-ink/8 text-ink/65 h-fit rounded-full px-2 py-0.5 text-xs">{fmtCant(s.cantidad)}</span>
      </div>
      <div className="text-ink/45 mt-0.5 font-mono text-[11px]">{s.codigo}</div>
      {s.equipo_nombre ? <div className="text-ink/60 mt-1 text-xs">🚜 {s.equipo_nombre}</div> : null}
      {s.proveedor_nombre ? <div className="text-ink/60 text-xs">🏭 {s.proveedor_nombre}</div> : null}
      {s.items.length > 1 ? (
        <ul className="text-ink/55 mt-1 ml-4 list-disc text-[11px]">
          {s.items.map((it, i) => (
            <li key={i}>
              {it.descripcion} · {fmtCant(it.cantidad)}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="text-ink/55 mt-1.5 text-[11px] leading-relaxed">
        <div>
          Generó: <strong className="text-ink/80">{s.creado_por_nombre ?? '—'}</strong>
        </div>
        <div>Creado: {fechaHoraVE(s.creado_en)}</div>
        {s.estado === 'finalizada' ? <div>Pagado: {s.pagada_en ? fechaHoraVE(s.pagada_en) : '—'}</div> : null}
      </div>
      {s.estado === 'por_pagar' ? (
        <div className="mt-1.5 text-xs">
          <div>
            Por pagar: <strong className="font-mono">{s.gasto != null ? money(s.gasto) : '—'}</strong>
          </div>
          <div className="text-warning text-[11px]">💳 Falta indicar el método de pago</div>
          <div className="text-ink/55 text-[11px]">{s.facturas?.length ? `📎 ${s.facturas.length} factura(s)` : '— sin factura'}</div>
        </div>
      ) : null}
      {s.estado === 'confirmada_pagar' ? (
        <div className="mt-1.5 text-xs">
          <div>
            Monto a pagar: <strong className="font-mono">{money(montoAPagarDirecto(s))}</strong>
          </div>
          <div className="text-ink/55 text-[11px]">💳 {(s.metodo_pago ?? []).length} método(s) · falta marcarlo pagado</div>
          <div className="text-ink/55 text-[11px]">{s.facturas?.length ? `📎 ${s.facturas.length} factura(s)` : '— sin factura'}</div>
        </div>
      ) : null}
      {s.estado === 'finalizada' ? (
        <div className="mt-1.5 text-xs">
          <div>
            Monto: <strong className="font-mono">{s.gasto != null ? money(s.gasto) : '—'}</strong>
          </div>
          {s.pagada_por_nombre ? <div className="text-ink/55 text-[11px]">Pagó: {s.pagada_por_nombre}</div> : null}
          <div className="text-ink/55 text-[11px]">{s.facturas?.length ? `📎 ${s.facturas.length} factura(s)` : '— sin factura'}</div>
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// «Nuevo servicio directo» (MGG `CrearServicioModal`)
// ---------------------------------------------------------------------------

interface LineaUI {
  id: number
  categoria: string
  tipo: string
  equipoId: string
  electro: string
  cantidad: string
  bombonas: string
  kg: string
  detalle: DetalleServicioItem[]
}

const lineaNueva = (id: number): LineaUI => ({
  id,
  categoria: '',
  tipo: '',
  equipoId: '',
  electro: '',
  cantidad: '1',
  bombonas: '',
  kg: '',
  detalle: [],
})

function CrearServicioDirectoModal({ onClose, onCreado }: { onClose: () => void; onCreado: (id: number) => void }) {
  const crear = useCrearServicioDirecto()
  const agregarUnidad = useAgregarUnidad()
  const { data: categorias } = useCatalogo('servicio_categoria')
  const { data: tipos } = useCatalogo('servicio_tipo')
  const { data: equipos } = useEquiposServicio()
  const { data: proveedores } = useProveedores(true)
  const { data: unidades } = useUnidadesSolicitantes()

  const [lineas, setLineas] = useState<LineaUI[]>([lineaNueva(1)])
  const [seq, setSeq] = useState(2)
  const [provModo, setProvModo] = useState<'existente' | 'nuevo'>('existente')
  const [proveedorId, setProveedorId] = useState('')
  const [provNombre, setProvNombre] = useState('')
  const [provRif, setProvRif] = useState('')
  const [unidad, setUnidad] = useState('')
  const [nuevaUnidad, setNuevaUnidad] = useState('')
  const [quien, setQuien] = useState('')
  const [error, setError] = useState<string | null>(null)

  const nombresCategoria = (categorias ?? []).filter((c) => c.activo).map((c) => c.nombre)
  const tipoOpciones = opcionesTipo(
    TIPOS_SERVICIO_DIRECTO,
    (tipos ?? []).filter((t) => t.activo).map((t) => t.nombre),
  )
  const opcionesUnidad = useMemo(() => {
    const n = (unidades ?? []).map((u) => u.nombre)
    if (unidad && !n.includes(unidad)) n.unshift(unidad)
    return n.map((x) => ({ valor: x, nombre: x }))
  }, [unidades, unidad])

  const set = (id: number, patch: Partial<LineaUI>) => setLineas((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  async function handleAddUnidad() {
    const n = enMayuscula(nuevaUnidad.trim())
    if (!n) return toast('Escribí el nombre de la unidad', 'error')
    const ya = (unidades ?? []).find((u) => u.nombre.toLowerCase() === n.toLowerCase())
    if (ya) {
      setUnidad(ya.nombre)
      setNuevaUnidad('')
      return toast(`La unidad "${ya.nombre}" ya existe — se seleccionó`, 'warning')
    }
    try {
      const g = await agregarUnidad.mutateAsync(n)
      setUnidad(g ?? n)
      setNuevaUnidad('')
      toast(`Unidad "${n}" agregada al catálogo`, 'success')
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo agregar la unidad'), 'error')
    }
  }

  async function handleSubmit() {
    setError(null)
    const payload: LineaServicioDirecto[] = []
    for (const l of lineas) {
      const cat = enMayuscula(l.categoria.trim())
      if (!cat) return setError('Indicá la categoría del servicio en cada renglón.')
      const agua = esRecargaAgua(cat)
      const recarga = esRecarga(cat)
      const bombonas = recarga ? Number(l.bombonas) || 0 : 0
      const kg = recarga ? totalRecarga(bombonas, Number(l.kg) || 0) : null
      const cant = recarga ? bombonas : Number(l.cantidad) || 0
      if (cant <= 0)
        return setError(
          recarga
            ? agua
              ? 'Indicá la cantidad (botellones o cisternas; 1 si es una cisterna).'
              : 'Indicá la cantidad de bombonas.'
            : 'Cada servicio debe tener cantidad mayor que 0.',
        )
      const esElectro = esMantenimientoElectrodomestico(cat)
      const eq = !esElectro && !recarga ? ((equipos ?? []).find((x) => String(x.id) === l.equipoId) ?? null) : null
      const electro = esElectro ? enMayuscula(l.electro.trim()) : ''
      if (esElectro && !electro) return setError('Elegí el electrodoméstico al que se le hace el mantenimiento.')
      const eqNombre = esElectro ? electro : eq ? `${eq.codigo} · ${eq.nombre}` : null
      const tipo = recarga ? null : enMayuscula(l.tipo.trim()) || null
      // La descripción lleva la medida para que se vea en la tarjeta y el PDF (MGG).
      const extra = recarga
        ? agua
          ? [kg != null ? `${kg} L DE AGUA` : '', bombonas > 1 ? `${bombonas} UND` : ''].filter(Boolean).join(' · ')
          : [`${bombonas} BOMBONA(S)`, kg != null ? `${kg} KG` : ''].filter(Boolean).join(' · ')
        : ''
      const descripcion = enMayuscula([cat, eqNombre, tipo].filter(Boolean).join(' · ') + (extra ? ` · ${extra}` : ''))
      const det = limpiarDetalle(l.detalle)
      payload.push({
        servicio_categoria: cat,
        servicio_tipo: tipo,
        equipo_id: eq ? eq.id : null,
        equipo_nombre: eqNombre,
        descripcion,
        cantidad: cant,
        bombonas: recarga ? bombonas : null,
        kg_recarga: kg,
        detalle_items: det.length ? det : null,
      })
    }
    if (provModo === 'nuevo' && provNombre.trim() && !provRif.trim()) return setError('RIF (con número) y razón social son obligatorios')
    try {
      const r = await crear.mutateAsync({
        lineas: payload,
        proveedor_id: provModo === 'existente' && proveedorId ? Number(proveedorId) : null,
        proveedor_nuevo: provModo === 'nuevo' && provNombre.trim() ? { razon_social: provNombre.trim(), rif: provRif.trim() } : null,
        unidad_solicitante: unidad.trim() || null,
        solicitante_nombre: quien.trim() || null,
      })
      const prov =
        provModo === 'nuevo' ? provNombre.trim() : (proveedores ?? []).find((p) => String(p.id) === proveedorId)?.nombre
      toast(`Servicio directo creado · ${payload.length} servicio(s)${prov ? ` · ${prov}` : ''}`, 'success')
      onCreado(r.id)
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo crear el servicio directo.'))
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onClose}
      titulo="Nuevo servicio directo"
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onClose} disabled={crear.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={crear.isPending}>
            {crear.isPending ? 'Creando…' : 'Crear servicio directo'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <div className="border-danger text-danger rounded-[6px] border px-3 py-2 text-sm">
            <strong>Error:</strong> {error}
          </div>
        ) : null}

        {/* Proveedor / taller */}
        <div>
          <div className="text-ink/75 mb-1.5 text-sm font-medium">Proveedor / taller</div>
          <Segmento
            className="mb-2"
            valor={provModo}
            onCambio={(v) => setProvModo(v as 'existente' | 'nuevo')}
            opciones={[
              { valor: 'existente', etiqueta: '🔎 Existente' },
              { valor: 'nuevo', etiqueta: '＋ Nuevo' },
            ]}
          />
          {provModo === 'existente' ? (
            <SelectBuscable
              label="Proveedor / taller"
              opciones={(proveedores ?? []).map((p) => ({ valor: String(p.id), nombre: p.nombre, detalle: p.rif }))}
              valor={proveedorId}
              onCambio={setProveedorId}
              vacio="🔎 Buscá el proveedor / taller…"
              hint={(proveedores ?? []).length === 0 ? 'Sin proveedores. Usá ＋ Nuevo.' : undefined}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Razón social" placeholder="Taller / razón social" value={provNombre} onChange={(e) => setProvNombre(e.target.value)} />
              <Input
                label="RIF"
                sinNormalizar
                placeholder="J-12345678-9"
                value={provRif}
                onChange={(e) => setProvRif(e.target.value.toUpperCase())}
              />
            </div>
          )}
        </div>

        {/* Quién solicita */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <SelectBuscable
              label="Unidad solicitante"
              opciones={opcionesUnidad}
              valor={unidad}
              onCambio={setUnidad}
              vacio="Departamento / unidad que solicita"
              hint={opcionesUnidad.length === 0 ? 'Sin unidades en el catálogo. Agregá una abajo.' : undefined}
            />
            <div className="mt-2 flex gap-2">
              <Input
                label="Unidad nueva"
                ocultarEtiqueta
                placeholder="¿No está? Escribí la unidad nueva…"
                maxLength={60}
                value={nuevaUnidad}
                onChange={(e) => setNuevaUnidad(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleAddUnidad()
                  }
                }}
              />
              <Button variant="outline" size="sm" className="mt-1" onClick={() => void handleAddUnidad()} disabled={agregarUnidad.isPending}>
                {agregarUnidad.isPending ? 'Añadiendo…' : '+ Añadir'}
              </Button>
            </div>
            <p className="text-ink/50 mt-1.5 text-xs">La unidad nueva queda guardada en el catálogo (Categorías → Unidad solicitante).</p>
          </div>
          <Input label="Quién lo solicita" placeholder="Nombre de la persona" value={quien} onChange={(e) => setQuien(e.target.value)} />
        </div>

        <div>
          <div className="text-ink/75 text-sm font-medium">Servicios</div>
          <p className="text-ink/55 text-xs">
            Podés agregar <strong>varios servicios de distinto tipo</strong> (mantenimiento, recarga de gas/agua, electrodoméstico…).
            Categoría + tipo + equipo. Los montos se cargan después, con la factura.
          </p>
        </div>

        <datalist id="sd-categorias">
          {nombresCategoria.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <datalist id="sd-tipos">
          {tipoOpciones.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </datalist>
        <datalist id="sd-electro">
          {ELECTRODOMESTICOS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </datalist>

        {lineas.map((l, idx) => {
          const recarga = esRecarga(l.categoria)
          const agua = esRecargaAgua(l.categoria)
          const electro = esMantenimientoElectrodomestico(l.categoria)
          const mant = tipoMantenimiento(l.categoria)
          const lista = equiposDeTipo(equipos ?? [], mant)
          return (
            <Card key={l.id} className="space-y-3">
              {lineas.length > 1 ? (
                <div className="flex justify-end">
                  <Button size="sm" variant="ghost" title="Quitar servicio" onClick={() => setLineas((ls) => ls.filter((x) => x.id !== l.id))}>
                    ✕ Quitar servicio #{idx + 1}
                  </Button>
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label={`Categoría del servicio #${idx + 1} *`}
                  list="sd-categorias"
                  placeholder="🔎 Buscá o escribí (mantenimiento de vehículos…)"
                  value={l.categoria}
                  onChange={(e) => set(l.id, { categoria: e.target.value })}
                />
                {recarga ? (
                  <Input
                    label={agua ? '🚰 Botellones / cisternas (cantidad)' : '🛢 Cantidad de bombonas'}
                    type="number"
                    min={0}
                    step="any"
                    placeholder={agua ? 'N° de botellones/cisternas (1 = cisterna)' : 'N° de bombonas'}
                    value={l.bombonas}
                    onChange={(e) => set(l.id, { bombonas: e.target.value })}
                  />
                ) : (
                  <Input
                    label="Tipo de servicio"
                    list="sd-tipos"
                    placeholder="🔎 Elegí el tipo (caucho, aceite, pintura…)"
                    value={l.tipo}
                    onChange={(e) => set(l.id, { tipo: e.target.value })}
                  />
                )}
              </div>
              {recarga ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label={agua ? '💧 Litros por unidad' : '⚖ KG por bombona'}
                    type="number"
                    min={0}
                    step="any"
                    placeholder={agua ? 'Litros de cada uno' : 'Kg de cada una'}
                    value={l.kg}
                    onChange={(e) => set(l.id, { kg: e.target.value })}
                  />
                  <div>
                    <div className="text-ink/75 mb-1.5 text-sm font-medium">Total recarga</div>
                    <div className="border-hairline rounded-[6px] border px-3 py-2 font-mono font-bold">
                      {agua
                        ? `${totalRecarga(Number(l.bombonas) || 0, Number(l.kg) || 0)} L de agua${(Number(l.bombonas) || 0) > 1 ? ` · ${Number(l.bombonas)} und` : ''}`
                        : `${Number(l.bombonas) || 0} bombona(s) · ${totalRecarga(Number(l.bombonas) || 0, Number(l.kg) || 0)} KG`}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                  {electro ? (
                    <Input
                      label="Electrodoméstico"
                      list="sd-electro"
                      placeholder="🔎 Elegí (cocina, nevera, lavadora, microondas…)"
                      hint="Artículo electrodoméstico al que se le hace el mantenimiento."
                      value={l.electro}
                      onChange={(e) => set(l.id, { electro: e.target.value })}
                    />
                  ) : (
                    <SelectBuscable
                      label={rotuloEquipo(mant)}
                      opciones={lista.map((e) => ({
                        valor: String(e.id),
                        codigo: e.codigo,
                        nombre: e.nombre,
                        detalle: [e.tipo, e.marca, e.modelo, e.estado === 'ACTIVA' ? null : 'fuera de servicio'].filter(Boolean).join(' · '),
                      }))}
                      valor={l.equipoId}
                      onCambio={(v) => set(l.id, { equipoId: v })}
                      vacio={mant === 'motos' ? '🔎 Buscá la moto…' : mant === 'vehiculos' ? '🔎 Buscá el vehículo…' : '🔎 Buscá el equipo / vehículo…'}
                      hint={
                        lista.length === 0
                          ? mant === 'motos'
                            ? 'Sin motos registradas.'
                            : mant === 'vehiculos'
                              ? 'Sin vehículos.'
                              : 'Sin equipos.'
                          : 'Vincula el servicio al equipo de Maquinaria.'
                      }
                    />
                  )}
                  <Input
                    label="Cantidad"
                    type="number"
                    min={1}
                    step="any"
                    value={l.cantidad}
                    onChange={(e) => set(l.id, { cantidad: e.target.value })}
                  />
                </div>
              )}
              <DetalleItemsEditor value={l.detalle} onChange={(v) => set(l.id, { detalle: v })} />
            </Card>
          )
        })}

        <Button
          variant="ghost"
          className="w-full border border-dashed"
          onClick={() => {
            setLineas((ls) => [...ls, lineaNueva(seq)])
            setSeq((s) => s + 1)
          }}
        >
          ＋ Agregar otro servicio (puede ser de otro tipo)
        </Button>
        <p className="text-ink/50 text-xs">
          En este método no se cargan montos al crear. La factura y el monto se cargan después; luego se indica el método de pago y se
          marca pagado.
        </p>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// «Cargar factura y monto del servicio» (MGG `MontarServicioModal`)
// ---------------------------------------------------------------------------

function MontarServicioModal({
  servicio: s,
  onClose,
  onListo,
}: {
  servicio: ServicioDirecto
  onClose: () => void
  onListo: () => void
}) {
  const montar = useMontarServicioDirecto()
  const [gastos, setGastos] = useState<string[]>(() => s.items.map((it) => (Number(it.gasto) > 0 ? String(it.gasto) : '')))
  const [archivos, setArchivos] = useState<File[]>([])
  const [nota, setNota] = useState(s.nota ?? '')
  const [pagoExterno, setPagoExterno] = useState(!!s.pago_externo)
  const [pagoExternoDatos, setPagoExternoDatos] = useState(s.pago_externo_datos ?? '')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const total = useMemo(() => Math.round(gastos.reduce((a, g) => a + (Number(g) || 0), 0) * 100) / 100, [gastos])

  async function handleSubmit() {
    setError(null)
    if (total <= 0) return setError('Indicá cuánto costó cada servicio.')
    if (archivos.some((f) => f.type && f.type !== 'application/pdf' && !f.type.startsWith('image/')))
      return setError('La factura debe ser un PDF o una imagen.')
    if (pagoExterno && !pagoExternoDatos.trim()) return setError('Ingresá los datos de la persona externa que pagó (para reintegrarle).')
    setGuardando(true)
    const subidas: ArchivoSubido[] = []
    try {
      for (const f of archivos) subidas.push(await subirArchivoDirecto(s.id, 'factura', f))
      await montar.mutateAsync({
        id: s.id,
        gastos: gastos.map((g) => Number(g) || 0),
        nota: nota.trim() || null,
        pago_externo: pagoExterno,
        pago_externo_datos: pagoExterno ? pagoExternoDatos.trim() : null,
        facturas: subidas,
      })
      toast(`Servicio directo ${s.codigo} · ${money(total)} por pagar · falta indicar el método de pago`, 'success')
      onListo()
    } catch (e) {
      void borrarArchivosDirecto(subidas.map((a) => a.path))
      setError(mensajeDe(e, 'No se pudo guardar el servicio.'))
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onClose}
      titulo="Cargar factura y monto del servicio"
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={guardando}>
            {guardando ? 'Guardando…' : `💸 Dejar por pagar · ${money(total)}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? (
          <div className="border-danger text-danger rounded-[6px] border px-3 py-2 text-sm">
            <strong>Error:</strong> {error}
          </div>
        ) : null}
        <p className="text-ink/65 text-sm">
          Cargá los <strong>montos por servicio</strong> (en $) y la <strong>factura</strong>. El servicio queda <strong>Por pagar</strong>;
          después se indica el <strong>método de pago</strong> con su documento y retenciones, y se marca pagado. Queda casado al
          equipo de Maquinaria.
        </p>

        <div className="border-hairline overflow-x-auto rounded-[6px] border">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-ink/4 text-ink/55 text-left text-xs">
              <tr>
                <th className="px-3 py-2 font-medium">Servicio</th>
                <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                <th className="w-40 px-3 py-2 font-medium">Monto</th>
                <th className="px-3 py-2 text-right font-medium">Costo unit.</th>
              </tr>
            </thead>
            <tbody>
              {s.items.map((it, i) => {
                const g = Number(gastos[i]) || 0
                const cu = Number(it.cantidad) > 0 && g > 0 ? g / Number(it.cantidad) : 0
                return (
                  <tr key={i} className="border-hairline border-t">
                    <td className="px-3 py-2">{it.descripcion}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtCant(it.cantidad)}</td>
                    <td className="px-3 py-2">
                      <input
                        className="rounded-control border-ink/20 bg-surface h-9 w-full border px-2 text-right font-mono text-sm"
                        type="number"
                        min={0}
                        step="any"
                        placeholder="0,00"
                        aria-label={`Monto de ${it.descripcion}`}
                        value={gastos[i]}
                        onChange={(e) => setGastos((p) => p.map((x, k) => (k === i ? e.target.value : x)))}
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{money(cu)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="border-hairline rounded-[6px] border px-3 py-2 text-sm">
          Total por pagar: <strong className="font-mono">{money(total)}</strong>
        </div>

        <div>
          <div className="text-ink/75 mb-1.5 text-sm font-medium">Adjuntar FACTURA del servicio · PDF o imagen</div>
          <input
            type="file"
            accept="application/pdf,image/*"
            multiple
            onChange={(e) => {
              setArchivos(Array.from(e.target.files ?? []))
            }}
          />
          {archivos.length ? (
            <p className="text-ink/60 mt-1 text-xs">{archivos.map((f) => f.name).join(' · ')}</p>
          ) : s.facturas?.length ? (
            <p className="text-ink/50 mt-1 text-xs">Ya hay {s.facturas.length} factura(s) cargada(s).</p>
          ) : null}
        </div>

        <Textarea
          label="Nota / motivo"
          rows={2}
          placeholder="Motivo o detalle del servicio (aparece en el detalle y en el PDF)."
          hint="Se lee al indicar el método de pago y al pagar."
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />

        <div className="border-hairline border-t pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={pagoExterno} onChange={(e) => setPagoExterno(e.target.checked)} />
            <span>
              💳 Pago a externo <span className="text-ink/50">(lo pagó otra persona; hay que reintegrarle)</span>
            </span>
          </label>
          {pagoExterno ? (
            <Textarea
              className="mt-2"
              label="Datos de la persona externa que pagó *"
              rows={2}
              sinNormalizar
              placeholder="Nombre, C.I. / RIF, teléfono, y cómo reintegrarle (cuenta / pago móvil)…"
              hint="Aparece en el detalle: al pagar, se le reintegra el dinero a esta persona."
              value={pagoExternoDatos}
              onChange={(e) => setPagoExternoDatos(e.target.value)}
            />
          ) : null}
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// «Detalle · SVD-…» (MGG `DetalleEditModal`)
// ---------------------------------------------------------------------------

function DetalleEditModal({ servicio: s, onClose }: { servicio: ServicioDirecto; onClose: () => void }) {
  const guardar = useDetalleServicioDirecto()
  const [detalles, setDetalles] = useState<DetalleServicioItem[][]>(() => s.items.map((it) => it.detalle_items ?? []))

  async function onGuardar() {
    try {
      await guardar.mutateAsync({ id: s.id, detalles: detalles.map((d) => limpiarDetalle(d)) })
      toast('Detalle guardado', 'success')
      onClose()
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo guardar el detalle.'), 'error')
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onClose}
      titulo={`Detalle · ${s.codigo}`}
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onClose} disabled={guardar.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => void onGuardar()} disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : 'Guardar detalle'}
          </Button>
        </>
      }
    >
      <p className="text-ink/65 mb-3 text-sm">
        Detallá las <strong>piezas / reparaciones / trabajos</strong> de cada renglón. Sale en el PDF.
      </p>
      <div className="space-y-2">
        {s.items.map((it, i) => (
          <Card key={i}>
            <strong className="text-sm">{it.descripcion}</strong>
            <span className="text-ink/50 text-xs"> · {fmtCant(it.cantidad)}</span>
            <DetalleItemsEditor value={detalles[i] ?? []} onChange={(v) => setDetalles((p) => p.map((x, k) => (k === i ? v : x)))} />
          </Card>
        ))}
      </div>
    </Modal>
  )
}
