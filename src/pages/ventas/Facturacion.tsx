import { useState } from 'react'
import { Banknote, Printer, Receipt } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { VisorPdf } from '@/components/VisorPdf'
import { dinero, dolares, fecha, fechaHora } from '@/lib/formato'
import { useEmpresa } from '@/lib/api/empresa'
import { useMiPerfil } from '@/lib/api/usuarios'
import { useCuentas } from '@/lib/api/tesoreria'
import { armarDocumento } from '@/lib/ficha/ventaPdf'
import type { PdfArmado } from '@/lib/ficha/reciboPdf'
import {
  CONDICIONES_PAGO,
  METODOS_COBRO,
  useAnularCobro,
  useAnularFactura,
  useCobros,
  useFacturarNotas,
  useFacturas,
  useNotasEntrega,
  useRegistrarCobro,
  useRenglones,
  type FacturaVenta,
} from '@/lib/api/ventas'
import { TablaRenglones, Totales } from './Cotizaciones'

const TONO: Record<string, 'royal' | 'success' | 'neutral'> = {
  EMITIDA: 'royal',
  COBRADA: 'success',
  ANULADA: 'neutral',
}

const ETIQUETA: Record<string, string> = {
  EMITIDA: 'Por cobrar',
  COBRADA: 'Cobrada',
  ANULADA: 'Anulada',
}

export function Facturacion() {
  const { data, isPending, error } = useFacturas()
  const porFacturar = useNotasEntrega('DESPACHADA')
  const { data: empresa } = useEmpresa()
  const { data: yo } = useMiPerfil()
  const { data: cuentas } = useCuentas()

  const facturar = useFacturarNotas()
  const anular = useAnularFactura()
  const cobrar = useRegistrarCobro()
  const anularCobro = useAnularCobro()

  const [emitiendo, setEmitiendo] = useState(false)
  const [detalle, setDetalle] = useState<FacturaVenta | null>(null)
  const [cobrando, setCobrando] = useState<FacturaVenta | null>(null)
  const [anulando, setAnulando] = useState<FacturaVenta | null>(null)
  const [motivo, setMotivo] = useState('')
  const [pdf, setPdf] = useState<PdfArmado | null>(null)

  const [elegidas, setElegidas] = useState<number[]>([])
  const [condicion, setCondicion] = useState('')
  const [observacion, setObservacion] = useState('')

  const [cuentaId, setCuentaId] = useState('')
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('TRANSFERENCIA')
  const [referencia, setReferencia] = useState('')
  const [igtf, setIgtf] = useState<boolean | null>(null)

  const renglonesDetalle = useRenglones('factura_venta_renglones', 'factura_id', detalle?.id ?? null)
  const cobros = useCobros(detalle?.id ?? null)

  const notas = porFacturar.data ?? []

  // Solo se pueden juntar notas del mismo cliente y la misma moneda: una
  // factura es de un cliente y tiene un total en una moneda. Elegida la
  // primera, el resto se deshabilita solo.
  const primera = notas.find((n) => elegidas.includes(n.id))
  const compatible = (n: (typeof notas)[number]) =>
    !primera || (n.cliente_id === primera.cliente_id && n.moneda === primera.moneda)

  const totalElegido = notas
    .filter((n) => elegidas.includes(n.id))
    .reduce((s, n) => s + Number(n.total), 0)

  const cuenta = cuentas?.find((c) => String(c.id) === cuentaId)

  const imprimir = async (f: FacturaVenta) => {
    const renglones = renglonesDetalle.data ?? []
    setPdf(
      await armarDocumento({
        tipo: 'FACTURA',
        numero: f.numero,
        fecha: f.fecha,
        numeroControl: f.numero_control,
        vigencia: { rotulo: 'Vence el', fecha: f.vence_el },
        condicionPago: CONDICIONES_PAGO.find((c) => c.valor === f.condicion_pago)?.etiqueta ?? null,
        cliente: { nombre: f.cliente, rif: f.cliente_rif, direccion: f.cliente_direccion },
        moneda: f.moneda,
        tasa: f.tasa_usd,
        renglones: renglones.map((r) => ({
          descripcion: r.descripcion,
          cantidad: r.cantidad,
          unidad: r.unidad,
          precio_unitario: r.precio_unitario,
          subtotal: r.subtotal,
          exento_iva: r.exento_iva,
        })),
        subtotal: f.subtotal,
        descuento: f.descuento,
        flete: f.flete,
        iva: f.iva,
        alicuotaIva: f.alicuota_iva,
        total: f.total,
        retencionIva: f.retencion_iva,
        observacion: f.observacion,
        sello: f.estado === 'ANULADA' ? 'ANULADA' : null,
        empresa: {
          razonSocial: empresa?.razon_social ?? '',
          rif: empresa?.rif ?? '',
          domicilio: empresa?.domicilio_fiscal ?? null,
          telefono: empresa?.telefono ?? null,
          correo: empresa?.correo ?? null,
        },
        emitidoPor: yo?.nombre ?? '',
      }),
    )
  }

  return (
    <>
      <PageHeader
        title="Facturación"
        description="Se factura contra notas de entrega: una, o todas las de la semana de un cliente."
        actions={
          <Button
            icon={<Receipt />}
            disabled={notas.length === 0}
            onClick={() => {
              setElegidas([])
              setCondicion('')
              setObservacion('')
              setEmitiendo(true)
            }}
          >
            Facturar{notas.length > 0 ? ` (${notas.length} por facturar)` : ''}
          </Button>
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<Receipt />}
            titulo="Todavía no se ha facturado nada"
            descripcion={
              notas.length > 0
                ? `Hay ${notas.length} nota(s) de entrega esperando factura.`
                : 'Primero se despacha con nota de entrega; la factura sale de ahí.'
            }
            accion={
              notas.length > 0 ? (
                <Button icon={<Receipt />} onClick={() => setEmitiendo(true)}>
                  Facturar
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : null}

      {data && data.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Factura</th>
                  <th className="px-3 py-3 font-medium">Cliente</th>
                  <th className="px-3 py-3 font-medium">Fecha</th>
                  <th className="px-3 py-3 text-right font-medium">Total</th>
                  <th className="px-3 py-3 text-right font-medium">Saldo</th>
                  <th className="px-5 py-3 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() => setDetalle(f)}
                    className="border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors last:border-0"
                  >
                    <td className="tabular px-5 py-3">
                      <span className="text-ink/85 font-medium">{f.numero}</span>
                      <span className="text-ink/45 block text-xs">{f.numero_control}</span>
                    </td>
                    <td className="text-ink/70 px-3 py-3">{f.cliente}</td>
                    <td className="text-ink/60 px-3 py-3 text-xs">
                      {fecha(f.fecha)}
                      {f.dias_vencida > 0 ? (
                        <span className="text-danger block">vencida hace {f.dias_vencida} d</span>
                      ) : f.dias_credito > 0 ? (
                        <span className="block">vence {fecha(f.vence_el)}</span>
                      ) : null}
                    </td>
                    <td className="tabular text-ink/85 px-3 py-3 text-right font-medium">
                      {dinero(f.moneda, f.total)}
                    </td>
                    <td className="tabular px-3 py-3 text-right">
                      {f.estado === 'EMITIDA' ? (
                        <span className="text-ink/85 font-medium">{dolares(f.saldo_usd)}</span>
                      ) : (
                        <span className="text-ink/30">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Chip tone={TONO[f.estado] ?? 'neutral'}>{ETIQUETA[f.estado]}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* ----------------------------------------------------- facturar */}
      {emitiendo ? (
        <Modal
          abierto
          ancho="lg"
          onCerrar={() => setEmitiendo(false)}
          titulo="Emitir factura"
          descripcion="Marca las notas de entrega que van en esta factura. Tienen que ser del mismo cliente y la misma moneda."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setEmitiendo(false)}>
                Cancelar
              </Button>
              <Button
                disabled={facturar.isPending || elegidas.length === 0}
                onClick={async () => {
                  await facturar.mutateAsync({
                    notas: elegidas,
                    condicion_pago: condicion || null,
                    observacion: observacion || null,
                  })
                  setEmitiendo(false)
                  setElegidas([])
                }}
              >
                {facturar.isPending ? 'Emitiendo…' : 'Emitir la factura'}
              </Button>
            </>
          }
        >
          {notas.length === 0 ? (
            <Vacio
              icono={<Receipt />}
              titulo="No hay notas por facturar"
              descripcion="Todo lo despachado ya está facturado."
            />
          ) : (
            <div className="space-y-2">
              {notas.map((n) => {
                const marcada = elegidas.includes(n.id)
                const puede = compatible(n)

                return (
                  <label
                    key={n.id}
                    className={`border-hairline rounded-card flex items-center gap-3 border p-3 ${
                      puede ? 'hover:bg-ink/3 cursor-pointer' : 'cursor-not-allowed opacity-40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-royal-600 size-4 shrink-0"
                      checked={marcada}
                      disabled={!puede}
                      onChange={(e) =>
                        setElegidas((v) =>
                          e.target.checked ? [...v, n.id] : v.filter((x) => x !== n.id),
                        )
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-ink/85 text-sm font-medium">
                        {n.numero} · {n.cliente}
                      </p>
                      <p className="text-ink/50 text-xs">
                        {fecha(n.fecha)}
                        {n.vehiculo ? ` · ${n.vehiculo}` : ''} · {n.renglones} renglón(es)
                      </p>
                    </div>
                    <span className="tabular text-ink/80 shrink-0 text-sm font-medium">
                      {dinero(n.moneda, n.total)}
                    </span>
                  </label>
                )
              })}
            </div>
          )}

          {elegidas.length > 0 ? (
            <>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Select
                  label="Condición de pago"
                  vacio="La que tenga el cliente"
                  value={condicion}
                  onChange={(e) => setCondicion(e.target.value)}
                  opciones={CONDICIONES_PAGO}
                  hint="A crédito, el sistema comprueba el límite del cliente antes de emitir."
                />
                <Textarea
                  label="Observación"
                  rows={2}
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                />
              </div>

              <div className="bg-ink/4 rounded-card mt-4 flex items-baseline justify-between p-4">
                <span className="text-ink/60 text-sm">
                  {elegidas.length} nota(s) de {primera?.cliente}
                </span>
                <span className="tabular text-ink/90 text-lg font-semibold">
                  {dinero(primera?.moneda ?? 'USD', totalElegido)}
                </span>
              </div>
            </>
          ) : null}

          {facturar.error ? <ErrorDeCarga error={facturar.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      {/* ------------------------------------------------------ detalle */}
      {detalle ? (
        <Modal
          abierto
          ancho="lg"
          onCerrar={() => setDetalle(null)}
          titulo={`${detalle.numero} · control ${detalle.numero_control}`}
          descripcion={`${detalle.cliente} · ${fecha(detalle.fecha)}`}
          acciones={
            <>
              <Button variant="ghost" onClick={() => setDetalle(null)}>
                Cerrar
              </Button>
              <Button
                variant="outline"
                icon={<Printer />}
                disabled={renglonesDetalle.isPending}
                onClick={() => void imprimir(detalle)}
              >
                Imprimir
              </Button>
              {detalle.estado === 'EMITIDA' ? (
                <>
                  <Button
                    variant="outline"
                    className="text-danger"
                    onClick={() => {
                      setAnulando(detalle)
                      setMotivo('')
                    }}
                  >
                    Anular
                  </Button>
                  <Button
                    icon={<Banknote />}
                    onClick={() => {
                      setCobrando(detalle)
                      setCuentaId('')
                      setMonto('')
                      setReferencia('')
                      setIgtf(null)
                    }}
                  >
                    Registrar cobro
                  </Button>
                </>
              ) : null}
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={TONO[detalle.estado] ?? 'neutral'}>{ETIQUETA[detalle.estado]}</Chip>
            <Chip tone="neutral">
              {CONDICIONES_PAGO.find((c) => c.valor === detalle.condicion_pago)?.etiqueta}
            </Chip>
            {detalle.dias_vencida > 0 ? (
              <Chip tone="danger">Vencida hace {detalle.dias_vencida} días</Chip>
            ) : null}
            {Number(detalle.retencion_iva) > 0 ? (
              <Chip tone="warning">Retiene IVA</Chip>
            ) : null}
          </div>

          {detalle.motivo_anulacion ? (
            <p className="text-danger mt-3 text-sm">Anulada: {detalle.motivo_anulacion}</p>
          ) : null}

          <TablaRenglones
            moneda={detalle.moneda}
            renglones={renglonesDetalle.data ?? []}
            cargando={renglonesDetalle.isPending}
          />

          <div className="bg-ink/4 rounded-card mt-4 p-4">
            <Totales
              moneda={detalle.moneda}
              subtotal={Number(detalle.subtotal)}
              descuento={Number(detalle.descuento)}
              flete={Number(detalle.flete)}
              alicuota={Number(detalle.alicuota_iva)}
              iva={Number(detalle.iva)}
              total={Number(detalle.total)}
              retencion={Number(detalle.retencion_iva)}
            />
            {detalle.estado === 'EMITIDA' ? (
              <p className="text-ink/55 border-hairline mt-3 border-t pt-3 text-sm">
                Abonado {dolares(detalle.cobrado_usd)} · falta{' '}
                <span className="text-ink/85 font-semibold">{dolares(detalle.saldo_usd)}</span>
                <span className="text-ink/40 block text-xs">
                  El saldo se lleva en dólares porque se cobra en las dos monedas.
                </span>
              </p>
            ) : null}
          </div>

          {(cobros.data ?? []).length > 0 ? (
            <Card flush className="mt-4">
              <CardHeader title="Cobros" className="p-4 pb-0" />
              <div className="space-y-2 p-4 pt-3">
                {(cobros.data ?? []).map((c) => (
                  <div
                    key={c.id}
                    className={`border-hairline flex items-center justify-between gap-3 border-b pb-2 text-sm last:border-0 ${
                      c.estado === 'ANULADO' ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-ink/80">
                        {c.numero} ·{' '}
                        {METODOS_COBRO.find((m) => m.valor === c.metodo)?.etiqueta ?? c.metodo}
                        {c.estado === 'ANULADO' ? ' · anulado' : ''}
                      </p>
                      <p className="text-ink/45 text-xs">
                        {fechaHora(c.registrado_en)}
                        {c.cuenta ? ` · ${c.cuenta.nombre}` : ''}
                        {c.referencia ? ` · ref. ${c.referencia}` : ''}
                        {Number(c.igtf_monto) > 0
                          ? ` · IGTF ${dinero(c.moneda, c.igtf_monto)}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="tabular text-ink/85 font-medium">
                        {dinero(c.moneda, c.monto)}
                      </span>
                      {c.estado === 'REGISTRADO' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger"
                          disabled={anularCobro.isPending}
                          onClick={() =>
                            void anularCobro.mutateAsync({
                              id: c.id,
                              motivo: 'ANULADO DESDE LA FACTURA',
                            })
                          }
                        >
                          Anular
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {anularCobro.error ? <ErrorDeCarga error={anularCobro.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      {/* -------------------------------------------------------- cobro */}
      {cobrando ? (
        <Modal
          abierto
          onCerrar={() => setCobrando(null)}
          titulo={`Cobrar la factura ${cobrando.numero}`}
          descripcion={`${cobrando.cliente} · faltan ${dolares(cobrando.saldo_usd)}`}
          acciones={
            <>
              <Button variant="ghost" onClick={() => setCobrando(null)}>
                Cancelar
              </Button>
              <Button
                disabled={cobrar.isPending || !cuentaId || !Number(monto)}
                onClick={async () => {
                  await cobrar.mutateAsync({
                    factura_id: cobrando.id,
                    cuenta_id: Number(cuentaId),
                    monto: Number(monto),
                    metodo,
                    referencia: referencia || null,
                    igtf,
                  })
                  setCobrando(null)
                  setDetalle(null)
                }}
              >
                {cobrar.isPending ? 'Registrando…' : 'Registrar el cobro'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="A qué cuenta entró"
              vacio="Elige la cuenta"
              value={cuentaId}
              onChange={(e) => {
                setCuentaId(e.target.value)
                setIgtf(null)
              }}
              opciones={(cuentas ?? [])
                .filter((c) => c.activa)
                .map((c) => ({
                  valor: String(c.id),
                  etiqueta: `${c.nombre} · ${c.moneda}`,
                }))}
              hint="El cobro se registra en la moneda de la cuenta."
              required
            />
            <Input
              label={`Monto${cuenta ? ` en ${cuenta.moneda}` : ''}`}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              required
            />
            <Select
              label="Cómo pagó"
              value={metodo}
              onChange={(e) => setMetodo(e.target.value)}
              opciones={METODOS_COBRO}
            />
            <Input
              label="Referencia"
              placeholder="Número de la transferencia"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
            />
          </div>

          {cuenta ? (
            <label className="text-ink/75 mt-4 flex cursor-pointer items-start gap-2 text-sm select-none">
              <input
                type="checkbox"
                className="accent-royal-600 mt-0.5 size-4"
                checked={igtf ?? cuenta.moneda !== 'VES'}
                onChange={(e) => setIgtf(e.target.checked)}
              />
              <span>
                Cobrarle el IGTF del 3%
                <span className="text-ink/45 block text-xs leading-relaxed">
                  Grava los pagos en divisas. No abona la factura: es un impuesto que se recauda y
                  se entera al SENIAT, y va en su propio asiento del libro.
                </span>
              </span>
            </label>
          ) : null}

          {cobrar.error ? <ErrorDeCarga error={cobrar.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      {/* ------------------------------------------------------- anular */}
      {anulando ? (
        <Modal
          abierto
          onCerrar={() => setAnulando(null)}
          titulo={`Anular la factura ${anulando.numero}`}
          descripcion="La factura no se borra: se queda con su número, marcada como anulada. Sus notas de entrega vuelven a estar por facturar."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setAnulando(null)}>
                No anular
              </Button>
              <Button
                disabled={anular.isPending || motivo.trim().length < 4}
                onClick={async () => {
                  await anular.mutateAsync({ id: anulando.id, motivo })
                  setAnulando(null)
                  setDetalle(null)
                }}
              >
                {anular.isPending ? 'Anulando…' : 'Anular la factura'}
              </Button>
            </>
          }
        >
          <p className="text-ink/60 mb-4 text-sm leading-relaxed">
            Anular sirve mientras la factura no haya salido de la empresa. Una que ya está en manos
            del cliente se corrige con nota de crédito, no anulándola.
          </p>
          <Textarea
            label="Por qué se anula"
            hint="Queda en el registro de auditoría con tu nombre y la hora."
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            required
          />
          {anular.error ? <ErrorDeCarga error={anular.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      <VisorPdf
        abierto={pdf !== null}
        onCerrar={() => setPdf(null)}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ""}
        titulo="Factura"
      />
    </>
  )
}
