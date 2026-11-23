import { useState } from 'react'
import {
  AlertTriangle,
  Ban,
  CheckCircle,
  Clock,
  Download,
  FileCheck,
  Plus,
  Receipt,
} from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import type { Orden } from '@/lib/api/compras'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import {
  type FacturaPendienteRetencion,
  type RetencionItem,
  useRetenciones,
} from '@/lib/api/retenciones'
import { bolivares, dinero, fecha } from '@/lib/formato'
import { generarComprobanteRetencionPdf } from '@/pages/retenciones/comprobantePdf'
import { ModalAnularRetencion } from '@/pages/retenciones/ModalAnularRetencion'
import { ModalRegistrarReintegro } from '@/pages/retenciones/ModalRegistrarReintegro'
import { ModalRegistrarRetencion } from '@/pages/retenciones/ModalRegistrarRetencion'

interface Props {
  orden: Orden
}

export function RetencionesOrden({ orden }: Props) {
  // Las retenciones aplican ESTRICTAMENTE a FACTURA, nunca a NOTA_ENTREGA
  if (orden.comprobante_tipo !== 'FACTURA') {
    return null
  }

  const { data: retenciones, isPending, error } = useRetenciones({ orden_id: orden.id })
  const { data: empresaRaw } = useEmpresa()

  const [modalRegistrar, setModalRegistrar] = useState(false)
  const [reintegroSeleccionado, setReintegroSeleccionado] = useState<RetencionItem | null>(null)
  const [anularSeleccionado, setAnularSeleccionado] = useState<RetencionItem | null>(null)
  const [descargandoId, setDescargandoId] = useState<number | null>(null)

  const yaPagada = ['PAGADA', 'RECIBIDA'].includes(orden.estado)
  const total = Number(orden.total) || 0
  const iva = Number(orden.iva) || 0
  const base = Math.max(total - iva, 0)

  const facturaPrevia: FacturaPendienteRetencion = {
    orden_id: orden.id,
    orden_numero: orden.numero,
    proveedor_id: orden.proveedor?.id ?? 0,
    proveedor_nombre: orden.proveedor?.nombre ?? 'Proveedor',
    proveedor_rif: orden.proveedor?.rif ?? 'J-00000000-0',
    proveedor_email: null,
    proveedor_telefono: orden.proveedor?.telefono ?? null,
    factura_numero: `F-${orden.numero}`,
    factura_control: null,
    factura_fecha: new Date().toISOString().slice(0, 10),
    moneda: orden.moneda,
    tasa: Number(orden.tasa) || 1,
    total,
    base_imponible: base,
    iva,
    estado_orden: orden.estado,
    ya_pagada: yaPagada,
  }

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
    <Card className="mt-4">
      <CardHeader
        title="Retenciones fiscales (SENIAT / G.O. 43.484)"
        subtitle="Comprobantes R14 (14 dígitos) y seguimiento de reintegros diferidos por IVA / ISLR."
        action={
          <Button
            size="sm"
            variant="outline"
            icon={<Plus className="size-4" />}
            onClick={() => setModalRegistrar(true)}
          >
            Emitir retención
          </Button>
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {!isPending && (!retenciones || retenciones.length === 0) ? (
        <div className="rounded-[6px] border border-hairline p-4 text-sm mt-3 bg-stone-50/50 dark:bg-stone-900/30">
          <div className="flex items-start gap-3">
            <Receipt className="size-5 text-ink/40 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink/85">
                Sin comprobantes de retención emitidos para esta orden
              </p>
              <p className="text-xs text-ink/55 mt-1 leading-relaxed">
                Esta compra tiene respaldo en factura fiscal. Si la empresa funge como agente de
                retención, puede emitir el comprobante conforme a la Providencia SNAT/2026/00093.
              </p>
              {yaPagada ? (
                <div className="mt-2.5 rounded-[4px] border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-2.5 text-xs text-amber-900 dark:text-amber-300 flex items-start gap-2">
                  <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Compra ya pagada:</strong> Al emitir una retención ahora, el monto
                    quedará automáticamente asentado como <em>Reintegro Pendiente</em> que el
                    proveedor debe reembolsar en días posteriores.
                  </span>
                </div>
              ) : null}
              <div className="mt-3">
                <Button
                  size="sm"
                  icon={<FileCheck className="size-4" />}
                  onClick={() => setModalRegistrar(true)}
                >
                  Emitir comprobante R14
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {retenciones && retenciones.length > 0 ? (
        <div className="mt-4 space-y-3">
          {retenciones.map((r) => {
            const diasEspera =
              r.estado_reintegro === 'PENDIENTE'
                ? Math.max(
                    0,
                    Math.floor(
                      (Date.now() - new Date(r.fecha_emision).getTime()) / 86_400_000,
                    ),
                  )
                : 0

            return (
              <div
                key={r.id}
                className="rounded-[6px] border border-hairline p-3 text-sm bg-surface space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-ink/85">
                      {r.numero_comprobante}
                    </span>
                    <Chip tone="neutral">
                      Retención {r.tipo_impuesto} ({r.alicuota_pct}%)
                    </Chip>
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
                    {r.origen_retencion === 'POST_PAGO' ? (
                      <Chip tone="warning">Post-pago (Diferido)</Chip>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Download className="size-3.5" />}
                      disabled={descargandoId === r.id}
                      onClick={() => void descargarPdf(r)}
                    >
                      {descargandoId === r.id ? 'Generando…' : 'PDF'}
                    </Button>
                    {r.estado === 'REGISTRADA' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Ban className="size-3.5" />}
                        onClick={() => setAnularSeleccionado(r)}
                      >
                        Anular
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-ink/40 block">Monto retenido:</span>
                    <span className="font-semibold text-ink/85 tabular">
                      {dinero(r.moneda, r.monto_retenido)}
                    </span>
                    {r.moneda !== 'VES' && r.monto_retenido_bs ? (
                      <span className="text-ink/45 block tabular text-[11px]">
                        Bs. {bolivares(r.monto_retenido_bs)}
                      </span>
                    ) : null}
                  </div>
                  <div>
                    <span className="text-ink/40 block">Impuesto causado:</span>
                    <span className="text-ink/75 tabular">
                      {dinero(r.moneda, r.impuesto_causado)}
                    </span>
                  </div>
                  <div>
                    <span className="text-ink/40 block">Fecha emisión:</span>
                    <span className="text-ink/75">{fecha(r.fecha_emision)}</span>
                  </div>
                  <div>
                    <span className="text-ink/40 block">Fecha entrega:</span>
                    <span className="text-ink/75">
                      {r.fecha_entrega ? fecha(r.fecha_entrega) : '—'}
                    </span>
                  </div>
                </div>

                {/* Banner de Reintegro en caso de retención post-pago */}
                {r.estado_reintegro === 'PENDIENTE' ? (
                  <div className="rounded-[4px] border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-amber-950 dark:text-amber-200">
                      <Clock className="size-4 text-amber-600 shrink-0" />
                      <span>
                        <strong>Reintegro pendiente:</strong> El proveedor debe reembolsar{' '}
                        <strong>{dinero(r.moneda, r.reintegro_monto ?? r.monto_retenido)}</strong>{' '}
                        ({diasEspera} {diasEspera === 1 ? 'día' : 'días'} en espera).
                      </span>
                    </div>
                    <Button
                      size="sm"
                      icon={<CheckCircle className="size-3.5" />}
                      onClick={() => setReintegroSeleccionado(r)}
                    >
                      Registrar reintegro
                    </Button>
                  </div>
                ) : null}

                {r.estado_reintegro === 'REINTEGRADO' ? (
                  <div className="rounded-[4px] border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 p-2 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                    <CheckCircle className="size-4 text-emerald-600 shrink-0" />
                    <span>
                      Reintegro recibido el {fecha(r.reintegro_fecha ?? '')} en{' '}
                      {r.reintegro_cuenta_nombre ?? 'Tesorería'} (Ref: {r.reintegro_referencia || '—'}).
                    </span>
                  </div>
                ) : null}

                {r.motivo_anulacion ? (
                  <div className="rounded-[4px] border border-rose-300 bg-rose-50 dark:bg-rose-950/20 p-2 text-xs text-rose-900 dark:text-rose-200">
                    <strong>Motivo de anulación:</strong> {r.motivo_anulacion}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}

      {/* Modal para emitir retención */}
      <ModalRegistrarRetencion
        abierta={modalRegistrar}
        onCerrar={() => setModalRegistrar(false)}
        facturaPrevia={facturaPrevia}
      />

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
    </Card>
  )
}
