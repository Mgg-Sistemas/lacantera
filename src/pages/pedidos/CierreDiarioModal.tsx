import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Visor } from '@/components/Visor'
import { cn } from '@/lib/cn'
import { useEmpresa, empresaDelPapel } from '@/lib/api/empresa'
import { useCierreDiario } from '@/lib/api/pedidos'
import { labelMetodoPago } from '@/lib/pagos'
import { fechaHoraVE } from '@/lib/pedidos'
import {
  ITEMS_CIERRE,
  fechaReporteTexto,
  fmtMonto,
  hoyVE,
  mensajeCierreDiario,
  rangoCierre,
  textoRetenciones,
  totalPorPagar,
  type FiltroCierre,
  type ModoCierre,
  type ResumenCierre,
} from '@/lib/reportesCompras'
import { armarCierreDiarioPdf } from '@/lib/ficha/reportesComprasPdf'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { bajarArchivo, escribirXlsx } from '@/lib/xlsx'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { ModalWhatsappCompra } from '@/pages/compras/ModalWhatsappCompra'

/*
  «📆 CIERRE DIARIO» (MGG `CierreDiarioModal` + `cierreDiario*.ts`)

  Cuatro cantidades —pedidos, órdenes pendientes por aprobar, órdenes por
  pagar y órdenes pagadas—, filtrables por día, semana (lunes a domingo), mes
  o rango, en hora de Venezuela; el detalle de las órdenes por pagar y el
  rendimiento por analista (cotizaciones cargadas y órdenes finalizadas). Con
  «Hoy» solo se ve lo de hoy. Salidas con la misma data: PDF, Excel y
  WhatsApp; cada una anota la hora exacta en que se imprime.

  Lo que La Cantera suma, porque no hay Tesorería: «🧾 Pagos del período»,
  cada pago registrado en Compras —OC pagada, abono de un crédito, servicio
  directo pagado— con su método, el total, las retenciones (IVA, ISLR, IGTF,
  ISAE) y el monto pagado. Y lo que cambia: todo va en $ (sin tasa BCV) y los
  analistas son quienes tuvieron actividad en el período (aquí no hay rol
  «analista» que listar con cero).
*/

const MODOS: { key: ModoCierre; label: string }[] = [
  { key: 'dia', label: 'Día' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mes' },
  { key: 'rango', label: 'Rango de fechas' },
]

const filtroDeHoy = (): FiltroCierre => {
  const hoy = hoyVE()
  return { modo: 'dia', dia: hoy, mes: hoy.slice(0, 7), desde: hoy, hasta: hoy }
}

const metodos = (l: string[]) => l.map(labelMetodoPago).join(' + ') || '—'

function libroExcel(r: ResumenCierre, etiqueta: string, impreso: string): Blob {
  const t = totalPorPagar(r)
  const filas: (string | number | null)[][] = [
    ['Período', etiqueta],
    ['Impreso', fechaReporteTexto(impreso)],
    [],
    ['CONCEPTO', 'CANTIDAD'],
    ...ITEMS_CIERRE.map((it) => [it.titulo, String(r[it.key])]),
    [],
    [`DETALLE · ÓRDENES POR PAGAR (${r.por_pagar_detalle.length})`],
    ['ORDEN', 'PROVEEDOR', null, null, null, null, 'MONTO $'],
    ...r.por_pagar_detalle.map((f) => [f.codigo, f.proveedor, null, null, null, null, f.monto]),
    ['TOTAL PENDIENTE POR PAGAR', null, null, null, null, null, t.usd],
    [],
    [`PAGOS DEL PERÍODO (${r.pagos.length})`],
    ['CÓDIGO', 'TIPO', 'PROVEEDOR', 'MÉTODO', 'TOTAL $', 'RETENCIONES $', 'PAGADO $', 'FECHA', 'REFERENCIA'],
    ...r.pagos.map((p) => [
      p.codigo,
      p.tipo,
      p.proveedor,
      metodos(p.metodos),
      p.total,
      p.total_retenciones || null,
      p.monto_pagado,
      fechaHoraVE(p.fecha),
      p.referencia ?? null,
    ]),
    ['TOTAL', null, null, null, null, r.total_retenciones, r.total_pagado],
    [],
    ['ACTIVIDAD POR ANALISTA'],
    ['ANALISTA', 'COTIZACIONES CARGADAS', 'ÓRDENES FINALIZADAS'],
    ...r.analistas.map((a) => [a.nombre, String(a.cotizaciones), String(a.finalizadas)]),
    ['TOTAL', String(r.total_cotizaciones), String(r.total_finalizadas)],
  ]
  return escribirXlsx({
    nombre: 'Cierre diario',
    columnas: [
      { titulo: 'CIERRE DIARIO · COMPRAS', ancho: 36 },
      { titulo: '', ancho: 30 },
      { titulo: '', ancho: 30 },
      { titulo: '', ancho: 22 },
      { titulo: '', ancho: 14 },
      { titulo: '', ancho: 16 },
      { titulo: '', ancho: 14 },
      { titulo: '', ancho: 20 },
      { titulo: '', ancho: 18 },
    ],
    filas,
  })
}

export function CierreDiarioModal({ onClose }: { onClose: () => void }) {
  const [filtro, setFiltro] = useState<FiltroCierre>(filtroDeHoy)
  const rango = useMemo(() => rangoCierre(filtro), [filtro])
  const q = useCierreDiario(rango.desde, rango.hasta)
  const r = q.data ?? null
  const cargando = q.isPending
  const { data: empresa } = useEmpresa()
  const papel = empresaDelPapel(empresa)
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [errorPdf, setErrorPdf] = useState<string | null>(null)
  const [genPdf, setGenPdf] = useState(false)
  const [avisar, setAvisar] = useState<string | null>(null)

  const set = (patch: Partial<FiltroCierre>) => setFiltro((f) => ({ ...f, ...patch }))
  const t = r ? totalPorPagar(r) : null

  async function verPdf() {
    if (!r) return
    setGenPdf(true)
    try {
      setErrorPdf(null)
      setPdf(
        await armarCierreDiarioPdf(r, {
          etiqueta: rango.etiqueta,
          empresa: papel,
          impreso: new Date().toISOString(),
          labelMetodo: labelMetodoPago,
        }),
      )
    } catch (e) {
      setErrorPdf(mensajeDe(e, 'No se pudo generar el PDF'))
    } finally {
      setGenPdf(false)
    }
  }

  function verExcel() {
    if (!r) return
    try {
      bajarArchivo(libroExcel(r, rango.etiqueta, new Date().toISOString()), 'cierre-diario-compras.xlsx')
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo generar el Excel'), 'error')
    }
  }

  return (
    <>
      <Modal
        abierto
        onCerrar={onClose}
        titulo="Cierre diario"
        ancho="lg"
        acciones={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
            <Button variant="ghost" onClick={verExcel} disabled={!r}>
              📊 Excel
            </Button>
            <Button
              variant="ghost"
              disabled={!r}
              onClick={() =>
                r &&
                setAvisar(
                  mensajeCierreDiario(r, { etiqueta: rango.etiqueta, empresa: papel.razonSocial, labelMetodo: labelMetodoPago }),
                )
              }
            >
              💬 WhatsApp
            </Button>
            <Button onClick={() => void verPdf()} disabled={genPdf || !r}>
              {genPdf ? 'Generando…' : '📄 Ver PDF (vista previa)'}
            </Button>
          </>
        }
      >
        <div role="tablist" aria-label="Período del cierre" className="mb-3 flex flex-wrap gap-1.5">
          {MODOS.map((m) => (
            <Button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={filtro.modo === m.key}
              variant={filtro.modo === m.key ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => set({ modo: m.key })}
            >
              {m.label}
            </Button>
          ))}
        </div>

        <div className="mb-3 flex flex-wrap items-end gap-2.5">
          {filtro.modo === 'dia' || filtro.modo === 'semana' ? (
            <label className="text-ink/70 flex flex-col gap-1 text-xs font-medium">
              {filtro.modo === 'dia' ? 'Día' : 'Un día de la semana'}
              <input
                type="date"
                className="rounded-control border-ink/20 bg-surface text-ink/85 h-10 border px-3 text-sm"
                value={filtro.dia}
                onChange={(e) => set({ dia: e.target.value })}
              />
            </label>
          ) : null}
          {filtro.modo === 'mes' ? (
            <label className="text-ink/70 flex flex-col gap-1 text-xs font-medium">
              Mes
              <input
                type="month"
                className="rounded-control border-ink/20 bg-surface text-ink/85 h-10 border px-3 text-sm"
                value={filtro.mes}
                onChange={(e) => set({ mes: e.target.value })}
              />
            </label>
          ) : null}
          {filtro.modo === 'rango' ? (
            <>
              <label className="text-ink/70 flex flex-col gap-1 text-xs font-medium">
                Desde
                <input
                  type="date"
                  className="rounded-control border-ink/20 bg-surface text-ink/85 h-10 border px-3 text-sm"
                  value={filtro.desde}
                  max={filtro.hasta || undefined}
                  onChange={(e) => set({ desde: e.target.value })}
                />
              </label>
              <label className="text-ink/70 flex flex-col gap-1 text-xs font-medium">
                Hasta
                <input
                  type="date"
                  className="rounded-control border-ink/20 bg-surface text-ink/85 h-10 border px-3 text-sm"
                  value={filtro.hasta}
                  min={filtro.desde || undefined}
                  onChange={(e) => set({ hasta: e.target.value })}
                />
              </label>
            </>
          ) : null}
          <Button type="button" variant="ghost" title="Volver a HOY: solo lo de hoy" onClick={() => setFiltro(filtroDeHoy())}>
            Hoy
          </Button>
        </div>

        <div className="text-ink/60 mb-3 text-[13px]">
          <div>
            <strong>Período:</strong> {rango.etiqueta}
          </div>
          <div>
            <strong>🕒 Fecha y hora de impresión:</strong> {fechaReporteTexto(q.dataUpdatedAt ? new Date(q.dataUpdatedAt).toISOString() : null)}{' '}
            <span className="opacity-80">(al generar el PDF, el Excel o el WhatsApp se anota la hora exacta)</span>
          </div>
        </div>

        {q.error ? (
          <p className="border-danger text-danger mb-3 rounded-[8px] border px-3 py-2 text-sm">
            <strong>Error:</strong> {mensajeDe(q.error, 'No se pudo cargar el cierre diario')}
          </p>
        ) : null}

        <div className="grid gap-2.5 sm:grid-cols-2">
          {ITEMS_CIERRE.map((it) => (
            <div key={it.key} className="bg-surface shadow-card rounded-[10px] px-4 py-3">
              <div className="text-sm font-bold">
                {it.emoji} {it.titulo}
              </div>
              <div className="text-royal-700 dark:text-royal-300 my-0.5 font-mono text-[2.1rem] leading-tight font-extrabold">
                {cargando || !r ? '…' : r[it.key]}
              </div>
              <div className="text-ink/55 text-xs">{it.ayuda}</div>
            </div>
          ))}
        </div>

        {/* ── Detalle de las órdenes pendientes por pagar ── */}
        <section className="border-hairline mt-5 border-t pt-4">
          <div className="mb-2.5 text-[15px] font-bold">
            💵 Detalle de órdenes pendientes por pagar{!cargando && r ? ` (${r.por_pagar_detalle.length})` : ''}
          </div>
          {cargando ? (
            <p className="text-ink/55 text-sm">Cargando órdenes por pagar…</p>
          ) : !r?.por_pagar_detalle.length ? (
            <p className="text-ink/55 text-sm italic">No quedaron órdenes pendientes por pagar en este período.</p>
          ) : (
            <div className="border-hairline overflow-x-auto rounded-[8px] border">
              <table className="w-full text-[13px]">
                <thead className="text-ink/55 border-hairline border-b text-left text-xs">
                  <tr>
                    <th className="w-32 px-3 py-2 font-medium">Orden</th>
                    <th className="px-3 py-2 font-medium">Proveedor</th>
                    <th className="w-36 px-3 py-2 text-right font-medium">Monto $</th>
                  </tr>
                </thead>
                <tbody>
                  {r.por_pagar_detalle.map((f) => (
                    <tr key={f.id} className="border-hairline border-b last:border-b-0">
                      <td className="px-3 py-2 font-mono">{f.codigo}</td>
                      <td className="px-3 py-2 font-semibold">{f.proveedor}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold whitespace-nowrap">{fmtMonto(f.monto, f.moneda)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-hairline border-t-2 font-bold">
                    <td colSpan={2} className="px-3 py-2">
                      TOTAL PENDIENTE POR PAGAR
                    </td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                      {fmtMonto(t?.usd ?? 0)}
                      {t?.enBs ? ` · ${fmtMonto(t.bs, 'Bs')}` : ''}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        {/* ── Pagos del período (sin Tesorería: salen de Compras) ── */}
        <section className="border-hairline mt-5 border-t pt-4">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[15px] font-bold">🧾 Pagos del período{!cargando && r ? ` (${r.pagos.length})` : ''}</div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <Chip tone="neutral" title="Retenciones descontadas en los pagos del período">
                Retenciones: <strong className="ml-1">{cargando || !r ? '…' : fmtMonto(r.total_retenciones)}</strong>
              </Chip>
              <Chip tone="success" title="Lo pagado en el período, en dólares">
                Pagado: <strong className="ml-1">{cargando || !r ? '…' : fmtMonto(r.total_pagado)}</strong>
              </Chip>
            </div>
          </div>
          {cargando ? (
            <p className="text-ink/55 text-sm">Cargando pagos…</p>
          ) : !r?.pagos.length ? (
            <p className="text-ink/55 text-sm italic">No se registraron pagos en este período.</p>
          ) : (
            <div className="border-hairline overflow-x-auto rounded-[8px] border">
              <table className="w-full min-w-[680px] text-[13px]">
                <thead className="text-ink/55 border-hairline border-b text-left text-xs">
                  <tr>
                    <th className="px-3 py-2 font-medium">Código</th>
                    <th className="px-3 py-2 font-medium">Proveedor</th>
                    <th className="px-3 py-2 font-medium">Método</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                    <th className="px-3 py-2 text-right font-medium">Retenciones</th>
                    <th className="px-3 py-2 text-right font-medium">Monto pagado</th>
                  </tr>
                </thead>
                <tbody>
                  {r.pagos.map((p) => (
                    <tr key={`${p.origen}-${p.id}`} className="border-hairline border-b last:border-b-0">
                      <td className="px-3 py-2">
                        <span className="font-mono">{p.codigo}</span>
                        <div className="text-ink/45 text-xs">
                          {p.tipo} · {fechaHoraVE(p.fecha)}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {p.proveedor}
                        {p.pagado_por ? <div className="text-ink/45 text-xs">Registró: {p.pagado_por}</div> : null}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {metodos(p.metodos)}
                        {p.referencia ? <div className="text-ink/45">ref. {p.referencia}</div> : null}
                      </td>
                      <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{p.total == null ? '—' : fmtMonto(p.total)}</td>
                      <td
                        className={cn('px-3 py-2 text-right font-mono whitespace-nowrap', p.total_retenciones > 0 && 'text-warning')}
                        title={textoRetenciones(p)}
                      >
                        {p.total_retenciones > 0 ? `−${fmtMonto(p.total_retenciones)}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold whitespace-nowrap">{fmtMonto(p.monto_pagado)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-hairline border-t-2 font-bold">
                    <td colSpan={4} className="px-3 py-2">
                      TOTAL
                    </td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">−{fmtMonto(r.total_retenciones)}</td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{fmtMonto(r.total_pagado)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="text-ink/50 mt-1.5 text-xs">
            Un abono de crédito no lleva retención propia: las retenciones del crédito se descuentan del monto a pagar de la
            orden.
          </p>
        </section>

        {/* ── Actividad por analista ── */}
        <section className="border-hairline mt-5 border-t pt-4">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[15px] font-bold">👥 Rendimiento por analista</div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <Chip tone="neutral" title="Total de cotizaciones cargadas en el período">
                Cotizaciones cargadas: <strong className="ml-1">{cargando || !r ? '…' : r.total_cotizaciones}</strong>
              </Chip>
              <Chip tone="neutral" title="Total de órdenes finalizadas en el período">
                Órdenes finalizadas: <strong className="ml-1">{cargando || !r ? '…' : r.total_finalizadas}</strong>
              </Chip>
            </div>
          </div>
          {cargando ? (
            <p className="text-ink/55 text-sm">Cargando analistas…</p>
          ) : !r?.analistas.length ? (
            <p className="text-ink/55 text-sm italic">Sin actividad de analistas registrada en este período.</p>
          ) : (
            <div className="border-hairline overflow-x-auto rounded-[8px] border">
              <table className="w-full text-[13px]">
                <thead className="text-ink/55 border-hairline border-b text-left text-xs">
                  <tr>
                    <th className="px-3 py-2 font-medium">Analista</th>
                    <th className="w-44 px-3 py-2 text-center font-medium">Cotizaciones cargadas</th>
                    <th className="w-44 px-3 py-2 text-center font-medium">Órdenes finalizadas</th>
                  </tr>
                </thead>
                <tbody>
                  {r.analistas.map((a) => (
                    <tr key={a.id || a.nombre} className="border-hairline border-b last:border-b-0">
                      <td className="px-3 py-2 font-semibold">{a.nombre}</td>
                      <td className="px-3 py-2 text-center font-semibold">{a.cotizaciones}</td>
                      <td className="px-3 py-2 text-center font-semibold">{a.finalizadas}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-hairline border-t-2 font-bold">
                    <td className="px-3 py-2">TOTAL</td>
                    <td className="px-3 py-2 text-center">{r.total_cotizaciones}</td>
                    <td className="px-3 py-2 text-center">{r.total_finalizadas}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        <p className="text-ink/50 mt-3 text-xs">
          Cuentan órdenes de compra y servicios; los pagos suman además los abonos y los servicios directos. Con «Hoy» solo
          se ve lo que entró hoy a cada estado; con semana, mes o rango, lo del período. Se actualiza en vivo.
        </p>
      </Modal>

      {avisar ? <ModalWhatsappCompra titulo="Avisar · Cierre diario" texto={avisar} onCerrar={() => setAvisar(null)} /> : null}

      <Visor
        abierto={pdf !== null || errorPdf !== null}
        error={errorPdf}
        onCerrar={() => {
          setPdf(null)
          setErrorPdf(null)
        }}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? 'cierre-diario-compras.pdf'}
        titulo="Cierre diario · Compras"
        descripcion={rango.etiqueta}
      />
    </>
  )
}
