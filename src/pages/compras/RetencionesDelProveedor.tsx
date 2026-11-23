import { useState } from 'react'
import { Link } from 'react-router'
import { AlertCircle, Ban, CheckCircle, Clock, Download, Receipt } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import {
  type RetencionItem,
  useReintegrosPendientes,
  useRetenciones,
} from '@/lib/api/retenciones'
import { bolivares, dinero, fecha } from '@/lib/formato'
import { generarComprobanteRetencionPdf } from '@/pages/retenciones/comprobantePdf'
import { ModalAnularRetencion } from '@/pages/retenciones/ModalAnularRetencion'
import { ModalRegistrarReintegro } from '@/pages/retenciones/ModalRegistrarReintegro'

interface Props {
  proveedorId: number
}

export function RetencionesDelProveedor({ proveedorId }: Props) {
  const { data: retenciones, isPending, error } = useRetenciones({ proveedor_id: proveedorId })
  const { data: reintegros } = useReintegrosPendientes({ proveedor_id: proveedorId })
  const { data: empresaRaw } = useEmpresa()

  const [reintegroSeleccionado, setReintegroSeleccionado] = useState<RetencionItem | null>(null)
  const [anularSeleccionado, setAnularSeleccionado] = useState<RetencionItem | null>(null)
  const [descargandoId, setDescargandoId] = useState<number | null>(null)

  if (isPending) return <Cargando />
  if (error) return <ErrorDeCarga error={error} />

  const lista = retenciones ?? []
  const reintegrosPendientes = reintegros ?? []
  const totalReintegrosPendientes = reintegrosPendientes.reduce(
    (acc, r) => acc + (r.reintegro_monto ?? r.monto_retenido),
    0,
  )

  const descargarPdf = async (item: RetencionItem) => {
    try {
      setDescargandoId(item.id)
      const emp = empresaDelPapel(empresaRaw)
      await generarComprobanteRetencionPdf(item, {
        razonSocial: emp.razonSocial,
        rif: emp.rif,
        domicilio: emp.domicilio,
        telefono: empresaRaw?.telefono ?? null,
        correo: empresaRaw?.correo ?? null,
      })
    } finally {
      setDescargandoId(null)
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Alerta de reintegros diferidos pendientes */}
      {reintegrosPendientes.length > 0 ? (
        <div className="rounded-[6px] border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 text-amber-950 dark:text-amber-200">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3">
              <AlertCircle className="size-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm">
                  {reintegrosPendientes.length === 1
                    ? 'Reintegro de retención pendiente por cobrar'
                    : `${reintegrosPendientes.length} reintegros de retención pendientes por cobrar`}
                </h4>
                <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                  Este proveedor adeuda{' '}
                  <strong className="text-amber-950 dark:text-amber-100 font-bold">
                    {dinero('USD', totalReintegrosPendientes)}
                  </strong>{' '}
                  en impuestos retenidos post-pago. El dinero debe ser devuelto por el proveedor para
                  ingresar a Tesorería.
                </p>
              </div>
            </div>
            <Link to="/app/retenciones?tab=reintegros">
              <Button size="sm" variant="outline">
                Ver en módulo de retenciones
              </Button>
            </Link>
          </div>

          <div className="mt-3 space-y-2">
            {reintegrosPendientes.map((rp) => (
              <div
                key={rp.id}
                className="bg-white/70 dark:bg-stone-900/50 rounded p-2.5 text-xs flex flex-wrap items-center justify-between gap-2 border border-amber-200 dark:border-amber-900/40"
              >
                <div className="flex items-center gap-2">
                  <Clock className="size-3.5 text-amber-600" />
                  <span className="font-mono font-medium">{rp.numero_comprobante}</span>
                  <span>·</span>
                  <span>Factura: {rp.factura_numero}</span>
                  {rp.orden_numero ? <span>(Orden {rp.orden_numero})</span> : null}
                  <span>·</span>
                  <span className="font-semibold text-amber-950 dark:text-amber-200">
                    {dinero(rp.moneda, rp.reintegro_monto ?? rp.monto_retenido)}
                  </span>
                  <span className="text-amber-700 dark:text-amber-400">
                    ({rp.dias_espera_reintegro} {rp.dias_espera_reintegro === 1 ? 'día' : 'días'} en espera)
                  </span>
                </div>
                <Button
                  size="sm"
                  icon={<CheckCircle className="size-3.5" />}
                  onClick={() => setReintegroSeleccionado(rp)}
                >
                  Cobrar reintegro
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Tarjeta de historial de retenciones */}
      <Card>
        <CardHeader
          title="Comprobantes de Retención Fiscal (G.O. 43.484)"
          subtitle="Comprobantes R14 (14 dígitos) emitidos a este proveedor bajo el régimen de retenciones."
          action={
            <Link to={`/app/retenciones?busqueda=${proveedorId}`}>
              <Button size="sm" variant="outline">
                Ir a Retenciones
              </Button>
            </Link>
          }
        />

        {lista.length === 0 ? (
          <div className="py-6 text-center text-sm text-ink/45">
            <Receipt className="size-8 mx-auto mb-2 opacity-35" />
            No se han practicado retenciones a este proveedor.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[700px]">
              <thead>
                <tr className="border-b border-hairline text-ink/45 font-medium">
                  <th className="py-2.5 px-3">Comprobante R14</th>
                  <th className="py-2.5 px-3">Emisión</th>
                  <th className="py-2.5 px-3">Factura / Orden</th>
                  <th className="py-2.5 px-3">Tipo</th>
                  <th className="py-2.5 px-3 text-right">Retenido</th>
                  <th className="py-2.5 px-3">Reintegro / Origen</th>
                  <th className="py-2.5 px-3">Estado</th>
                  <th className="py-2.5 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {lista.map((r) => (
                  <tr key={r.id} className="hover:bg-stone-50/60 dark:hover:bg-stone-800/20">
                    <td className="py-2.5 px-3 font-mono font-medium text-ink/85">
                      {r.numero_comprobante}
                    </td>
                    <td className="py-2.5 px-3 text-ink/70">{fecha(r.fecha_emision)}</td>
                    <td className="py-2.5 px-3 text-ink/70">
                      <div>Fact: {r.factura_numero}</div>
                      {r.orden_id ? (
                        <Link
                          to={`/app/compras/${r.orden_id}`}
                          className="text-royal-600 hover:underline font-mono text-[11px]"
                        >
                          {r.orden_numero ?? `Orden #${r.orden_id}`}
                        </Link>
                      ) : null}
                    </td>
                    <td className="py-2.5 px-3">
                      <Chip tone="neutral">
                        {r.tipo_impuesto} {r.alicuota_pct}%
                      </Chip>
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-ink/85 tabular">
                      <div>{dinero(r.moneda, r.monto_retenido)}</div>
                      {r.moneda !== 'VES' && r.monto_retenido_bs ? (
                        <div className="text-[11px] text-ink/45">
                          Bs. {bolivares(r.monto_retenido_bs)}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2.5 px-3">
                      {r.estado_reintegro === 'PENDIENTE' ? (
                        <Chip tone="warning">Reintegro pendiente</Chip>
                      ) : r.estado_reintegro === 'REINTEGRADO' ? (
                        <Chip tone="success">Reintegrado</Chip>
                      ) : (
                        <span className="text-ink/45 text-[11px]">Descontado en pago</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <Chip
                        tone={
                          r.estado === 'REGISTRADA'
                            ? 'success'
                            : r.estado === 'DECLARADA'
                              ? 'info'
                              : 'neutral'
                        }
                      >
                        {r.estado}
                      </Chip>
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-1">
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<Download className="size-3" />}
                        disabled={descargandoId === r.id}
                        onClick={() => void descargarPdf(r)}
                      >
                        {descargandoId === r.id ? '…' : 'PDF'}
                      </Button>
                      {r.estado_reintegro === 'PENDIENTE' ? (
                        <Button
                          size="sm"
                          icon={<CheckCircle className="size-3" />}
                          onClick={() => setReintegroSeleccionado(r)}
                        >
                          Cobrar
                        </Button>
                      ) : null}
                      {r.estado === 'REGISTRADA' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Ban className="size-3" />}
                          onClick={() => setAnularSeleccionado(r)}
                        >
                          Anular
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal para registrar recepción del reintegro */}
      <ModalRegistrarReintegro
        abierta={reintegroSeleccionado !== null}
        onCerrar={() => setReintegroSeleccionado(null)}
        retencion={reintegroSeleccionado}
      />

      {/* Modal para anular comprobante */}
      <ModalAnularRetencion
        abierta={anularSeleccionado !== null}
        onCerrar={() => setAnularSeleccionado(null)}
        retencion={anularSeleccionado}
      />
    </div>
  )
}
