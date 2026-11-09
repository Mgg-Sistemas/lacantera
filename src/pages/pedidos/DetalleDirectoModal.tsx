import type { ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { cn } from '@/lib/cn'
import type { ServicioDirecto } from '@/lib/api/pedidos'
import { claseEvento, etiquetaEvento, extraEvento, fechaHoraVE, fmtCant, money, type TonoEstado } from '@/lib/pedidos'
import { etiquetaDocumento, nombreMetodoPago, labelRetencion, resumenDatosPago } from '@/lib/pagos'
import { ESTADO_SD } from '@/lib/servicios'
import { montoAPagarDirecto } from '@/lib/ficha/servicioDirecto'
import { abrirArchivoDirecto } from './ordenDesdeDirecto'

/*
  EL DETALLE DE UN SERVICIO DIRECTO (MGG `DetalleDirectoModal`)

  La ficha, los servicios con su cantidad, costo unitario y precio (y el
  detalle de piezas y trabajos), la trazabilidad, la nota y las facturas.
  Como aquí paga Compras y no Tesorería, suma una sección «Pago»: el
  método, el documento, las retenciones, el monto a pagar y el pago
  registrado. Los botones llegan por `footer`.
*/

const PUNTO: Record<TonoEstado, string> = {
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  royal: 'bg-royal-600',
  danger: 'bg-danger',
  neutral: 'bg-ink/30',
}

function Fila({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-ink/50 min-w-[8.5rem]">{k}</span>
      <strong className="text-ink/85 min-w-0 font-semibold break-words">{children}</strong>
    </div>
  )
}

export function DetalleDirectoModal({
  servicio: s,
  footer,
  onClose,
}: {
  servicio: ServicioDirecto
  footer: ReactNode
  onClose: () => void
}) {
  const historial = [...(s.historial ?? [])].reverse()
  const total = Number(s.gasto) || 0
  const rets = s.retenciones ?? []

  return (
    <Modal abierto onCerrar={onClose} titulo={`Servicio directo · ${s.codigo}`} ancho="lg" acciones={footer}>
      <div className="mb-3">
        <Chip tone={s.estado === 'finalizada' ? 'success' : s.estado === 'en_proceso' ? 'neutral' : 'warning'}>
          {ESTADO_SD[s.estado] ?? s.estado}
        </Chip>
      </div>

      {s.pago_externo ? (
        <div className="border-royal-600 bg-royal-600/8 mb-3 rounded-[6px] border-l-4 px-3 py-2 text-sm">
          💳 <strong>Pago a externo — reintegrar el dinero</strong>
          <div className="text-ink/60 text-xs">Lo pagó una persona externa; al pagar, se le reintegra.</div>
          {s.pago_externo_datos?.trim() ? <div className="mt-1 whitespace-pre-wrap">👤 {s.pago_externo_datos.trim()}</div> : null}
        </div>
      ) : null}

      <div className="mb-4 grid gap-x-4 gap-y-1 sm:grid-cols-2">
        <Fila k="Equipo">{s.equipo_nombre || '—'}</Fila>
        <Fila k="Proveedor / taller">{s.proveedor_nombre || '—'}</Fila>
        {s.unidad_solicitante ? <Fila k="Unidad solicitante">{s.unidad_solicitante}</Fila> : null}
        {s.solicitante_nombre ? <Fila k="Quién lo solicita">{s.solicitante_nombre}</Fila> : null}
        <Fila k="Generó">{s.creado_por_nombre || '—'}</Fila>
        <Fila k="Creado">{fechaHoraVE(s.creado_en)}</Fila>
        <Fila k="Pagado">{s.pagada_en ? fechaHoraVE(s.pagada_en) : '—'}</Fila>
      </div>

      <h4 className="text-ink/85 mb-2 font-semibold">Servicios</h4>
      <div className="border-hairline overflow-x-auto rounded-[6px] border">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-ink/4 text-ink/55 text-left text-xs">
            <tr>
              <th className="px-3 py-2 font-medium">Detalle</th>
              <th className="px-3 py-2 text-right font-medium">Cantidad</th>
              <th className="px-3 py-2 text-right font-medium">Costo unit.</th>
              <th className="px-3 py-2 text-right font-medium">Precio</th>
            </tr>
          </thead>
          <tbody>
            {s.items.map((it, i) => {
              const g = it.gasto != null ? Number(it.gasto) : null
              const cu = g != null && Number(it.cantidad) > 0 ? g / Number(it.cantidad) : null
              const det = (it.detalle_items ?? []).filter((d) => (d.descripcion ?? '').trim())
              return (
                <tr key={i} className="border-hairline border-t align-top">
                  <td className="px-3 py-2">
                    {it.descripcion}
                    {det.length ? (
                      <ul className="text-ink/55 mt-1 ml-4 list-disc text-xs">
                        {det.map((d, j) => (
                          <li key={j}>
                            {d.descripcion}
                            {d.cantidad != null ? ` · ${fmtCant(d.cantidad)}` : ''}
                            {d.precio != null ? ` · ${money(d.precio)}` : ''}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{fmtCant(it.cantidad)}</td>
                  <td className="px-3 py-2 text-right font-mono">{cu != null ? money(cu) : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono">{g != null ? money(g) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-hairline border-t font-semibold">
              <td colSpan={3} className="px-3 py-2 text-right">
                TOTAL
              </td>
              <td className="px-3 py-2 text-right font-mono">{total > 0 ? money(total) : '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {s.metodo_pago?.length || s.pagada_en ? (
        <>
          <h4 className="text-ink/85 mt-4 mb-2 font-semibold">Pago</h4>
          <div className="border-hairline space-y-1 rounded-[6px] border px-3 py-2 text-sm">
            {(s.metodo_pago ?? []).map((m, i) => (
              <div key={i}>
                💳 {nombreMetodoPago(m.metodo, m.detalle)}
                {Number(m.monto) > 0 ? ` · ${m.moneda === 'USD' ? money(m.monto) : `${m.moneda} ${Number(m.monto).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`}` : ''}
                {m.datos && resumenDatosPago(m.metodo, m.datos) ? (
                  <div className="text-ink/55 pl-5 text-xs">↳ {resumenDatosPago(m.metodo, m.datos)}</div>
                ) : null}
              </div>
            ))}
            {s.metodo_pago_en ? (
              <div className="text-ink/50 text-xs">
                indicado {fechaHoraVE(s.metodo_pago_en)} por {s.metodo_pago_por_nombre ?? '—'}
              </div>
            ) : null}
            {s.numero_administracion ? <div>📞 Tel. administración: {s.numero_administracion}</div> : null}
            {s.comprobante_tipo ? <div>🧾 Documento: {etiquetaDocumento(s.comprobante_tipo)}</div> : null}
            {Number(s.descuento_pago) > 0 ? <div>🏷 Descuento en el pago: − {money(s.descuento_pago)}</div> : null}
            {rets.map((r) => (
              <div key={r.tipo}>
                Retención {labelRetencion(r)} <strong className="text-danger font-mono">− {money(r.monto)}</strong>
              </div>
            ))}
            {s.metodo_pago?.length ? (
              <div>
                Monto a pagar: <strong className="text-success font-mono">{money(montoAPagarDirecto(s))}</strong>
              </div>
            ) : null}
            {s.pago_qr_path ? (
              <Button size="sm" variant="ghost" onClick={() => void abrirArchivoDirecto(s.pago_qr_path!, s.pago_qr_nombre)}>
                📷 Ver QR / imagen de pago
              </Button>
            ) : null}
            {s.pagada_en ? (
              <div className="border-hairline mt-1 border-t pt-1">
                ✓ Pagado {s.pago_fecha ? s.pago_fecha.split('-').reverse().join('/') : fechaHoraVE(s.pagada_en)} ·{' '}
                <strong className="font-mono">{money(s.pago_monto_usd)}</strong>
                {s.pago_moneda === 'Bs' ? (
                  <span className="text-ink/50">
                    {' '}
                    (Bs {Number(s.pago_monto).toLocaleString('es-VE', { minimumFractionDigits: 2 })} a{' '}
                    {Number(s.pago_tasa).toLocaleString('es-VE')})
                  </span>
                ) : null}
                {s.pago_referencia ? <> · ref. <span className="font-mono">{s.pago_referencia}</span></> : null}
                <span className="text-ink/50"> · registró {s.pagada_por_nombre ?? '—'}</span>
                {s.pago_nota ? <div className="text-ink/60 text-xs">📝 {s.pago_nota}</div> : null}
                {s.pago_comprobante_path ? (
                  <div>
                    <Button size="sm" variant="ghost" onClick={() => void abrirArchivoDirecto(s.pago_comprobante_path!, s.pago_comprobante_nombre)}>
                      📎 {s.pago_comprobante_nombre ?? 'Comprobante de pago'}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {historial.length ? (
        <>
          <h4 className="text-ink/85 mt-4 mb-2 font-semibold">Trazabilidad</h4>
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
                  {h.evento === 'creada' ? 'Servicio directo creado' : etiquetaEvento(h.evento)}
                  {extraEvento(h)}
                </div>
                <div className="text-ink/50 text-xs">
                  {fechaHoraVE(h.at)} · {h.actor_nombre ?? '—'}
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : null}

      {s.nota?.trim() ? (
        <>
          <h4 className="text-ink/85 mt-4 mb-2 font-semibold">Nota</h4>
          <div className="border-hairline rounded-[6px] border px-3 py-2 text-sm whitespace-pre-wrap">📝 {s.nota.trim()}</div>
        </>
      ) : null}

      <h4 className="text-ink/85 mt-4 mb-2 font-semibold">Facturas</h4>
      {s.facturas?.length ? (
        <div className="space-y-1">
          {s.facturas.map((a) => (
            <div key={a.path} className="border-hairline flex items-center justify-between gap-2 rounded-[6px] border px-2 py-1">
              <Button size="sm" variant="ghost" title="Ver factura" onClick={() => void abrirArchivoDirecto(a.path, a.filename)}>
                📎 {a.filename}
              </Button>
              <span className="text-ink/45 text-xs">{fechaHoraVE(a.at)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-ink/50 text-sm">Sin facturas cargadas.</p>
      )}
    </Modal>
  )
}
