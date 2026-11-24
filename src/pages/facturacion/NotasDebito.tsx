/*
  NOTAS DE DÉBITO (Providencia SNAT/2026/00093, Arts. 12 y 13 · 23/11/2026).

  Ajustan en más una factura ya emitida: un recargo, una diferencia de precio o
  de cambio, un flete que no se cobró. Llevan su propio correlativo (NDB-…), el
  número de control de la misma serie que las facturas, y hacen referencia a la
  fecha, número, control y monto de la factura que ajustan. Entran al libro de
  ventas sumando, y su emisión en el Portal SENIAT se registra igual que la de
  la factura.

  El cobro del cargo adicional se registra aparte: la nota no cambia el saldo de
  la factura en Cuentas por cobrar.
*/
import { useMemo, useState } from 'react'
import { FilePlus2, Plus, Printer, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { Visor } from '@/components/Visor'
import { dinero, fecha, fechaHora } from '@/lib/formato'
import { useFacturas } from '@/lib/api/facturacion'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import { useMiPerfil, useMisPermisos } from '@/lib/api/usuarios'
import { hoyEnCaracas } from '@/lib/api/tasas'
import {
  AVISO_MIGRACION,
  useAnularNotaDebito,
  useConfigFiscal,
  useEmisionesPorDocumento,
  useEmitirNotaDebito,
  useNotasDebito,
  type NotaDebito,
} from '@/lib/api/seniat'
import { armarDocumento } from '@/lib/ficha/ventaPdf'
import type { PdfArmado } from '@/lib/ficha/reciboPdf'
import { LEYENDA_PROVIDENCIA } from '@/lib/fiscal/providencia'
import { BloqueEmisionSeniat, ModalEmisionSeniat } from './EmisionSeniat'

interface Concepto {
  descripcion: string
  monto: string
  exento_iva: boolean
}

const VACIO: Concepto = { descripcion: '', monto: '', exento_iva: false }

/** «1.234,50» o «1234.50»: con coma, la coma es el decimal; sin ella, el punto. */
const numeroDe = (v: string) => {
  const t = v.trim()
  const n = t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t)
  return Number.isFinite(n) ? n : 0
}

export function NotasDebito() {
  const notas = useNotasDebito()
  const facturas = useFacturas()
  const { data: empresa } = useEmpresa()
  const { data: yo } = useMiPerfil()
  const { puede } = useMisPermisos()
  const fiscal = useConfigFiscal()
  const emisiones = useEmisionesPorDocumento('NOTA_DEBITO')
  const emitir = useEmitirNotaDebito()
  const anular = useAnularNotaDebito()

  const [creando, setCreando] = useState(false)
  const [facturaId, setFacturaId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [fechaNota, setFechaNota] = useState(hoyEnCaracas())
  const [conceptos, setConceptos] = useState<Concepto[]>([{ ...VACIO }])
  const [detalle, setDetalle] = useState<NotaDebito | null>(null)
  const [anulando, setAnulando] = useState<NotaDebito | null>(null)
  const [motivoAnulacion, setMotivoAnulacion] = useState('')
  const [registrando, setRegistrando] = useState<NotaDebito | null>(null)
  const [pdf, setPdf] = useState<PdfArmado | null>(null)

  const elegibles = useMemo(
    () => (facturas.data ?? []).filter((f) => f.estado !== 'ANULADA'),
    [facturas.data],
  )
  const factura = elegibles.find((f) => String(f.id) === facturaId)
  const alicuota = Number(factura?.alicuota_iva ?? 0)
  const base = conceptos.filter((c) => !c.exento_iva).reduce((s, c) => s + numeroDe(c.monto), 0)
  const exento = conceptos.filter((c) => c.exento_iva).reduce((s, c) => s + numeroDe(c.monto), 0)
  const iva = Math.round(base * alicuota) / 100
  const conceptosValidos = conceptos.every((c) => c.descripcion.trim().length >= 3 && numeroDe(c.monto) > 0)

  const cerrar = () => {
    setCreando(false)
    setFacturaId('')
    setMotivo('')
    setFechaNota(hoyEnCaracas())
    setConceptos([{ ...VACIO }])
    emitir.reset()
  }

  const imprimir = async (n: NotaDebito) => {
    const emision = emisiones.mapa.get(n.id) ?? null
    setPdf(
      await armarDocumento({
        tipo: 'NOTA_DEBITO',
        numero: n.numero,
        fecha: n.fecha,
        numeroControl: n.numero_control,
        emitidoEn: emision?.emitida_en ?? n.emitida_en,
        seniat: emision
          ? { numero: emision.numero, control: emision.numero_control, medio: emision.medio }
          : null,
        contraparte: { nombre: n.cliente, rif: n.cliente_rif, direccion: n.cliente_direccion },
        moneda: n.moneda,
        tasa: n.tasa,
        tasaUsd: n.tasa_usd,
        renglones: n.renglones.map((r) => ({
          descripcion: r.descripcion,
          cantidad: 1,
          unidad: 'SERV',
          precio_unitario: r.monto,
          subtotal: r.monto,
          exento_iva: r.exento_iva,
        })),
        subtotal: Number(n.base_imponible) + Number(n.exento),
        descuento: 0,
        flete: 0,
        baseImponible: n.base_imponible,
        iva: n.iva,
        alicuotaIva: n.alicuota_iva,
        total: n.total,
        observacion: `Motivo: ${n.motivo}`,
        referencias: [
          {
            rotulo: 'Ajusta la factura',
            valor: `${n.factura_numero} · control ${n.factura_control} · del ${fecha(n.factura_fecha)} · monto ${dinero(n.moneda, n.factura_total)}`,
          },
        ],
        sello: n.estado === 'ANULADA' ? 'ANULADA' : null,
        leyendaFiscal: LEYENDA_PROVIDENCIA,
        empresa: empresaDelPapel(empresa),
        emitidoPor: yo?.nombre ?? '',
      }),
    )
  }

  const lista = notas.data?.lista ?? []

  return (
    <>
      <PageHeader
        title="Notas de débito"
        description="Ajustes en más sobre una factura ya emitida: recargos, diferencias de precio o de cambio. Entran al libro de ventas y se emiten en el Portal SENIAT (Providencia SNAT/2026/00093)."
        actions={
          puede('FACTURACION', 'TOTAL') ? (
            <Button icon={<Plus />} onClick={() => setCreando(true)} disabled={notas.data?.migracionPendiente}>
              Emitir nota de débito
            </Button>
          ) : null
        }
      />

      {notas.isPending ? <Cargando /> : null}
      {notas.error ? <ErrorDeCarga error={notas.error} /> : null}
      {notas.data?.migracionPendiente ? (
        <Card>
          <p className="text-warning text-sm">{AVISO_MIGRACION}</p>
        </Card>
      ) : null}

      {notas.data && !notas.data.migracionPendiente && lista.length === 0 ? (
        <Card>
          <Vacio
            icono={<FilePlus2 />}
            titulo="Sin notas de débito emitidas"
            descripcion="Se emiten sobre una factura para cobrar un cargo que no estaba en ella."
          />
        </Card>
      ) : null}

      {lista.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Nota</th>
                  <th className="px-3 py-3 font-medium">Factura</th>
                  <th className="px-3 py-3 font-medium">Cliente</th>
                  <th className="px-3 py-3 font-medium">Fecha</th>
                  <th className="px-3 py-3 text-right font-medium">Total</th>
                  <th className="px-5 py-3 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((n) => (
                  <tr
                    key={n.id}
                    onClick={() => setDetalle(n)}
                    className="border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors last:border-0"
                  >
                    <td className="tabular px-5 py-3">
                      <span className="text-ink/85 font-medium">{n.numero}</span>
                      <span className="text-ink/45 block text-xs">{n.numero_control}</span>
                      {emisiones.mapa.get(n.id) ? (
                        <span className="text-success block text-xs">SENIAT {emisiones.mapa.get(n.id)!.numero}</span>
                      ) : null}
                    </td>
                    <td className="text-ink/70 tabular px-3 py-3">{n.factura_numero}</td>
                    <td className="text-ink/70 px-3 py-3">{n.cliente}</td>
                    <td className="text-ink/60 px-3 py-3 text-xs">{fecha(n.fecha)}</td>
                    <td className="tabular text-ink/85 px-3 py-3 text-right font-medium">
                      +{dinero(n.moneda, n.total)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Chip tone={n.estado === 'ANULADA' ? 'neutral' : 'royal'}>
                        {n.estado === 'ANULADA' ? 'Anulada' : 'Emitida'}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* ------------------------------------------------------- emitir */}
      {creando ? (
        <Modal
          abierto
          ancho="lg"
          onCerrar={cerrar}
          titulo="Emitir nota de débito"
          descripcion="Elija la factura que se ajusta y escriba cada concepto con su monto, en la moneda de la factura."
          acciones={
            <>
              <Button variant="ghost" onClick={cerrar}>
                Cancelar
              </Button>
              <Button
                disabled={!factura || motivo.trim().length < 6 || !conceptosValidos || emitir.isPending}
                onClick={async () => {
                  await emitir.mutateAsync({
                    factura_id: factura!.id,
                    motivo,
                    fecha: fechaNota,
                    renglones: conceptos.map((c) => ({
                      descripcion: c.descripcion.trim(),
                      monto: numeroDe(c.monto),
                      exento_iva: c.exento_iva,
                    })),
                  })
                  cerrar()
                }}
              >
                {emitir.isPending ? 'Emitiendo…' : 'Emitir la nota'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Factura que se ajusta"
              vacio="Elija la factura"
              value={facturaId}
              onChange={(e) => setFacturaId(e.target.value)}
              opciones={elegibles.map((f) => ({
                valor: String(f.id),
                etiqueta: `${f.numero} · ${f.cliente} · ${dinero(f.moneda, f.total)}`,
              }))}
              className="sm:col-span-2"
            />
            <Input
              label="Fecha"
              type="date"
              value={fechaNota}
              max={hoyEnCaracas()}
              onChange={(e) => setFechaNota(e.target.value)}
            />
          </div>
          <Textarea
            label="Motivo"
            rows={2}
            maxLength={500}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="mt-4"
          />

          <div className="mt-4 space-y-2">
            {conceptos.map((c, i) => (
              <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_140px_auto_auto]">
                <Input
                  label={`Concepto ${i + 1}`}
                  value={c.descripcion}
                  onChange={(e) =>
                    setConceptos((v) => v.map((x, j) => (j === i ? { ...x, descripcion: e.target.value } : x)))
                  }
                />
                <Input
                  label={`Monto (${factura?.moneda ?? '—'})`}
                  inputMode="decimal"
                  value={c.monto}
                  onChange={(e) =>
                    setConceptos((v) => v.map((x, j) => (j === i ? { ...x, monto: e.target.value } : x)))
                  }
                />
                <label className="text-ink/70 mb-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-royal-600 size-4"
                    checked={c.exento_iva}
                    onChange={(e) =>
                      setConceptos((v) => v.map((x, j) => (j === i ? { ...x, exento_iva: e.target.checked } : x)))
                    }
                  />
                  Exento (E)
                </label>
                <Button
                  variant="ghost"
                  icon={<Trash2 />}
                  disabled={conceptos.length === 1}
                  onClick={() => setConceptos((v) => v.filter((_, j) => j !== i))}
                  title="Quitar concepto"
                />
              </div>
            ))}
            <Button variant="ghost" size="sm" icon={<Plus />} onClick={() => setConceptos((v) => [...v, { ...VACIO }])}>
              Añadir concepto
            </Button>
          </div>

          {factura ? (
            <div className="bg-ink/4 rounded-card mt-4 space-y-1 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-ink/60">Base imponible</span>
                <span className="tabular">{dinero(factura.moneda, base)}</span>
              </div>
              {exento > 0 ? (
                <div className="flex justify-between">
                  <span className="text-ink/60">Exento</span>
                  <span className="tabular">{dinero(factura.moneda, exento)}</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-ink/60">IVA {alicuota}% (el de la factura)</span>
                <span className="tabular">{dinero(factura.moneda, iva)}</span>
              </div>
              <div className="border-hairline flex justify-between border-t pt-1 font-semibold">
                <span>Total de la nota</span>
                <span className="tabular">{dinero(factura.moneda, base + exento + iva)}</span>
              </div>
            </div>
          ) : null}
          {emitir.error ? <ErrorDeCarga error={emitir.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      {/* ------------------------------------------------------ detalle */}
      {detalle ? (
        <Modal
          abierto
          ancho="lg"
          onCerrar={() => setDetalle(null)}
          titulo={`${detalle.numero} · control ${detalle.numero_control}`}
          descripcion={`Ajusta la factura ${detalle.factura_numero} · ${detalle.cliente}`}
          acciones={
            <>
              <Button variant="ghost" onClick={() => setDetalle(null)}>
                Cerrar
              </Button>
              <Button variant="outline" icon={<Printer />} onClick={() => void imprimir(detalle)}>
                Imprimir
              </Button>
              {detalle.estado === 'EMITIDA' && puede('FACTURACION', 'TOTAL') ? (
                <Button
                  variant="outline"
                  className="text-danger"
                  onClick={() => {
                    setAnulando(detalle)
                    setMotivoAnulacion('')
                    setDetalle(null)
                  }}
                >
                  Anular
                </Button>
              ) : null}
            </>
          }
        >
          <p className="text-ink/70 bg-ink/3 rounded-[6px] p-3 text-sm">{detalle.motivo}</p>
          <div className="mt-3 space-y-1.5">
            {detalle.renglones.map((r, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-ink/80">
                  {r.descripcion}
                  {r.exento_iva ? ' (E)' : ''}
                </span>
                <span className="tabular">{dinero(detalle.moneda, r.monto)}</span>
              </div>
            ))}
          </div>
          <div className="border-hairline mt-3 flex items-baseline justify-between border-t pt-3">
            <span className="text-ink/55 text-sm">
              Base {dinero(detalle.moneda, detalle.base_imponible)} · IVA {dinero(detalle.moneda, detalle.iva)}
              {Number(detalle.exento) > 0 ? ` · Exento ${dinero(detalle.moneda, detalle.exento)}` : ''}
            </span>
            <span className="tabular text-xl font-semibold">+{dinero(detalle.moneda, detalle.total)}</span>
          </div>
          <p className="text-ink/45 mt-2 text-xs">Emitida {fechaHora(detalle.emitida_en)}</p>
          {detalle.estado === 'ANULADA' ? (
            <p className="text-danger mt-2 text-sm">Anulada: {detalle.motivo_anulacion}</p>
          ) : null}
          {detalle.estado !== 'ANULADA' || emisiones.mapa.get(detalle.id) ? (
            <BloqueEmisionSeniat
              emision={emisiones.mapa.get(detalle.id)}
              vigente={fiscal.vigente}
              migracionPendiente={emisiones.migracionPendiente}
              onRegistrar={() => setRegistrando(detalle)}
            />
          ) : null}
        </Modal>
      ) : null}

      {anulando ? (
        <Modal
          abierto
          onCerrar={() => setAnulando(null)}
          titulo={`Anular la nota ${anulando.numero}`}
          descripcion="El número de control ya se gastó: la nota queda anulada con su motivo."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setAnulando(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={anular.isPending || motivoAnulacion.trim().length < 4}
                onClick={async () => {
                  await anular.mutateAsync({ id: anulando.id, motivo: motivoAnulacion })
                  setAnulando(null)
                }}
              >
                {anular.isPending ? 'Anulando…' : 'Anular'}
              </Button>
            </>
          }
        >
          <Textarea
            label="Motivo"
            rows={3}
            maxLength={500}
            value={motivoAnulacion}
            onChange={(e) => setMotivoAnulacion(e.target.value)}
          />
          {anular.error ? <ErrorDeCarga error={anular.error} className="mt-3" /> : null}
        </Modal>
      ) : null}

      {registrando ? (
        <ModalEmisionSeniat
          documento="NOTA_DEBITO"
          documentoId={registrando.id}
          numeroSistema={registrando.numero}
          existente={emisiones.mapa.get(registrando.id)}
          onCerrar={() => setRegistrando(null)}
        />
      ) : null}

      <Visor
        abierto={pdf !== null}
        onCerrar={() => setPdf(null)}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ''}
        titulo="Nota de débito"
      />
    </>
  )
}
