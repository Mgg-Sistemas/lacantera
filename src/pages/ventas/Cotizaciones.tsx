import { useState } from 'react'
import { useMonedasUsables } from '@/lib/api/tasas'
import { FileText, Plus, Printer } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { Visor } from '@/components/Visor'
import { dinero, fecha } from '@/lib/formato'
import { empresaDelPapel, useAlicuotaIva, useEmpresa } from '@/lib/api/empresa'
import { useMiPerfil } from '@/lib/api/usuarios'
import { armarDocumento } from '@/lib/ficha/ventaPdf'
import type { PdfArmado } from '@/lib/ficha/reciboPdf'
import {
  useCerrarCotizacion,
  useClientes,
  useCotizacionesVenta,
  useCrearCotizacion,
  usePrecios,
  useRenglones,
  type CotizacionVenta,
} from '@/lib/api/ventas'
import { Renglones } from './Renglones'
import { aRenglones, filaVacia, gravadoDe, subtotalDe, type FilaRenglon } from './filas'
import { CasillaIva } from './CasillaIva'
import { useIvaPorDefecto } from './ivaPorDefecto'

const TONO: Record<string, 'royal' | 'success' | 'danger' | 'neutral'> = {
  ENVIADA: 'royal',
  ACEPTADA: 'success',
  RECHAZADA: 'danger',
  ANULADA: 'neutral',
}

const ETIQUETA: Record<string, string> = {
  ENVIADA: 'Enviada',
  ACEPTADA: 'Aceptada',
  RECHAZADA: 'Rechazada',
  ANULADA: 'Anulada',
}

export function Cotizaciones() {
  const monedas = useMonedasUsables()
  const { data, isPending, error } = useCotizacionesVenta()
  const { data: clientes } = useClientes(true)
  const { data: precios } = usePrecios()
  const { data: empresa } = useEmpresa()
  const { data: yo } = useMiPerfil()
  const crear = useCrearCotizacion()
  const cerrar = useCerrarCotizacion()

  const [nueva, setNueva] = useState(false)
  const [detalle, setDetalle] = useState<CotizacionVenta | null>(null)
  const [pdf, setPdf] = useState<PdfArmado | null>(null)

  const [clienteId, setClienteId] = useState('')
  const [moneda, setMoneda] = useState('USD')
  const [validez, setValidez] = useState('15')
  const [descuento, setDescuento] = useState('')
  const [flete, setFlete] = useState('')
  const [observacion, setObservacion] = useState('')
  const [filas, setFilas] = useState<FilaRenglon[]>([filaVacia()])
  const ivaPorDefecto = useIvaPorDefecto()
  const [conIva, setConIva] = useState(ivaPorDefecto)

  const renglonesDetalle = useRenglones(
    'cotizacion_venta_renglones',
    'cotizacion_id',
    detalle?.id ?? null,
  )

  const cliente = clientes?.find((c) => String(c.id) === clienteId)
  /*
    LA ALÍCUOTA QUE SE VE ES LA QUE SE GUARDA

    Antes esto se calculaba para pintar el total y no se enviaba a la base, que
    aplicaba su 16 por defecto. Con un cliente exento la pantalla decía IVA 0 y
    el documento salía con 16: dos totales distintos para la misma venta, y el
    de la base era el bueno.

    Dos motivos la ponen en cero, y son distintos: el cliente está exento —lo
    dice su ficha— o esta operación en concreto no lleva IVA.
  */
  const alicuotaVigente = useAlicuotaIva()
  const alicuota = cliente?.exento_iva || !conIva ? 0 : alicuotaVigente
  const subtotal = subtotalDe(filas)
  const gravado = gravadoDe(filas)
  const baseDescuento = subtotal > 0 ? (Number(descuento) || 0) * (gravado / subtotal) : 0
  const base = Math.max(gravado - baseDescuento, 0) + (Number(flete) || 0)
  const iva = (base * alicuota) / 100
  const total = subtotal - (Number(descuento) || 0) + (Number(flete) || 0) + iva

  const limpiar = () => {
    setConIva(ivaPorDefecto)
    setClienteId('')
    setMoneda('USD')
    setValidez('15')
    setDescuento('')
    setFlete('')
    setObservacion('')
    setFilas([filaVacia()])
  }

  const imprimir = async (q: CotizacionVenta) => {
    const renglones = renglonesDetalle.data ?? []
    setPdf(
      await armarDocumento({
        tipo: 'COTIZACION',
        numero: q.numero,
        fecha: q.fecha,
        vigencia: { rotulo: 'Válida hasta', fecha: q.vence_el },
        contraparte: {
          nombre: q.cliente,
          rif: q.cliente_rif,
          direccion: clientes?.find((c) => c.id === q.cliente_id)?.direccion ?? null,
          // El hueco del teléfono existía en el papel desde el primer día y nadie
          // lo llenaba: salía «TELÉFONO —» en todas las notas y todas las
          // cotizaciones. El dato está aquí mismo, en la lista de clientes.
          telefono: clientes?.find((c) => c.id === q.cliente_id)?.telefono ?? null,
        },
        moneda: q.moneda,
        tasa: q.tasa_usd,
        renglones: renglones.map((r) => ({
          descripcion: r.descripcion,
          cantidad: r.cantidad,
          unidad: r.unidad,
          precio_unitario: r.precio_unitario,
          subtotal: r.subtotal,
          exento_iva: r.exento_iva,
        })),
        subtotal: q.subtotal,
        descuento: q.descuento,
        flete: q.flete,
        baseImponible: q.base_imponible,
        iva: q.iva,
        alicuotaIva: q.alicuota_iva,
        total: q.total,
        observacion: q.observacion,
        sello: q.estado === 'ANULADA' ? 'ANULADA' : null,
        empresa: empresaDelPapel(empresa),
        emitidoPor: yo?.nombre ?? '',
      }),
    )
  }

  return (
    <>
      <PageHeader
        title="Cotizaciones"
        description="Lo que se le ofrece al cliente antes de despachar. No compromete existencias."
        actions={
          <Button icon={<Plus />} onClick={() => setNueva(true)}>
            Nueva cotización
          </Button>
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<FileText />}
            titulo="Todavía no se ha cotizado nada"
            descripcion="Una cotización sirve para que el cliente sepa el precio antes de mandar el camión. También se puede despachar sin cotizar."
            accion={
              <Button icon={<Plus />} onClick={() => setNueva(true)}>
                Cotizar
              </Button>
            }
          />
        </Card>
      ) : null}

      {data && data.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Número</th>
                  <th className="px-3 py-3 font-medium">Cliente</th>
                  <th className="px-3 py-3 font-medium">Fecha</th>
                  <th className="px-3 py-3 text-right font-medium">Total</th>
                  <th className="px-5 py-3 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.map((q) => (
                  <tr
                    key={q.id}
                    onClick={() => setDetalle(q)}
                    className="border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors last:border-0"
                  >
                    <td className="tabular text-ink/85 px-5 py-3 font-medium">{q.numero}</td>
                    <td className="text-ink/70 px-3 py-3">{q.cliente}</td>
                    <td className="text-ink/60 px-3 py-3 text-xs">
                      {fecha(q.fecha)}
                      <span className="block">
                        {q.vencida ? (
                          <span className="text-warning">venció el {fecha(q.vence_el)}</span>
                        ) : (
                          `vale hasta ${fecha(q.vence_el)}`
                        )}
                      </span>
                    </td>
                    <td className="tabular text-ink/85 px-3 py-3 text-right font-medium">
                      {dinero(q.moneda, q.total)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Chip tone={TONO[q.estado] ?? 'neutral'}>{ETIQUETA[q.estado]}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* ------------------------------------------------------ nueva */}
      {nueva ? (
        <Modal
          abierto
          ancho="lg"
          onCerrar={() => {
            setNueva(false)
            limpiar()
          }}
          titulo="Nueva cotización"
          descripcion="El precio sale de la lista y se puede ajustar. La tasa queda congelada en el documento."
          acciones={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setNueva(false)
                  limpiar()
                }}
              >
                Cancelar
              </Button>
              <Button
                disabled={crear.isPending || !clienteId || aRenglones(filas).length === 0}
                onClick={async () => {
                  await crear.mutateAsync({
                    cliente_id: Number(clienteId),
                    renglones: aRenglones(filas),
                    moneda,
                    alicuota_iva: alicuota,
                    validez_dias: Number(validez) || 15,
                    descuento: Number(descuento) || 0,
                    flete: Number(flete) || 0,
                    observacion: observacion || null,
                  })
                  setNueva(false)
                  limpiar()
                }}
              >
                {crear.isPending ? 'Guardando…' : 'Guardar cotización'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <SelectBuscable
                label="Cliente"
                vacio="Elige el cliente"
                valor={clienteId}
                onCambio={(v) => {
                  setClienteId(v)
                  const c = clientes?.find((x) => String(x.id) === v)
                  if (c) setMoneda(c.moneda_preferida)
                }}
                opciones={(clientes ?? []).map((c) => ({
                  valor: String(c.id),
                  etiqueta: `${c.nombre} · ${c.rif}`,
                }))}
              />
            </div>
            <Select
              label="Moneda"
              value={moneda}
              onChange={(e) => setMoneda(e.target.value)}
              opciones={monedas.data ?? []}
            />
          </div>

          <div className="mt-4">
            <Renglones
              filas={filas}
              onCambiar={setFilas}
              precios={precios ?? []}
              moneda={moneda}
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Input
              label="Válida por (días)"
              type="number"
              min="1"
              value={validez}
              onChange={(e) => setValidez(e.target.value)}
            />
            <Input
              label="Descuento"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={descuento}
              onChange={(e) => setDescuento(e.target.value)}
            />
            <Input
              label="Flete"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              hint="Se le suma a la base imponible."
              value={flete}
              onChange={(e) => setFlete(e.target.value)}
            />
          </div>

          <Textarea
            label="Observación"
            className="mt-4"
            rows={2}
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
          />

          {/* La decisión va pegada al total: es lo que la cambia. */}
          {!cliente?.exento_iva ? (
            <CasillaIva aplica={conIva} onCambiar={setConIva} className="mt-4" />
          ) : null}

          <div className="bg-ink/4 rounded-card mt-4 p-4">
            <Totales
              moneda={moneda}
              subtotal={subtotal}
              descuento={Number(descuento) || 0}
              flete={Number(flete) || 0}
              alicuota={alicuota}
              iva={iva}
              total={total}
            />
            {cliente?.exento_iva ? (
              <p className="text-ink/50 mt-2 text-xs">
                {cliente.nombre} está registrado como exento: el documento sale sin IVA.
              </p>
            ) : null}
          </div>

          {crear.error ? <ErrorDeCarga error={crear.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      {/* ----------------------------------------------------- detalle */}
      {detalle ? (
        <Modal
          abierto
          ancho="lg"
          onCerrar={() => setDetalle(null)}
          titulo={detalle.numero}
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
              {detalle.estado === 'ENVIADA' ? (
                <>
                  <Button
                    variant="outline"
                    disabled={cerrar.isPending}
                    onClick={async () => {
                      await cerrar.mutateAsync({ id: detalle.id, estado: 'RECHAZADA' })
                      setDetalle(null)
                    }}
                  >
                    La rechazó
                  </Button>
                  <Button
                    disabled={cerrar.isPending}
                    onClick={async () => {
                      await cerrar.mutateAsync({ id: detalle.id, estado: 'ACEPTADA' })
                      setDetalle(null)
                    }}
                  >
                    La aceptó
                  </Button>
                </>
              ) : null}
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={TONO[detalle.estado] ?? 'neutral'}>{ETIQUETA[detalle.estado]}</Chip>
            {detalle.vencida ? <Chip tone="warning">Vencida</Chip> : null}
            {detalle.despachos > 0 ? (
              <Chip tone="info">
                {detalle.despachos} {detalle.despachos === 1 ? 'despacho' : 'despachos'}
              </Chip>
            ) : null}
          </div>

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
            />
          </div>

          {detalle.observacion ? (
            <p className="text-ink/60 mt-4 text-sm">{detalle.observacion}</p>
          ) : null}

          {cerrar.error ? <ErrorDeCarga error={cerrar.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      <Visor
        abierto={pdf !== null}
        onCerrar={() => setPdf(null)}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ""}
        titulo="Cotización"
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Piezas que se repiten en las tres pantallas de documentos
// ---------------------------------------------------------------------------

export function Totales({
  moneda,
  subtotal,
  descuento,
  flete,
  alicuota,
  iva,
  total,
  retencion,
}: {
  moneda: string
  subtotal: number
  descuento: number
  flete: number
  alicuota: number
  iva: number
  total: number
  retencion?: number
}) {
  const linea = (rotulo: string, valor: number, fuerte = false) => (
    <div className="flex items-baseline justify-between gap-4">
      <span className={fuerte ? 'text-ink/85 text-sm font-semibold' : 'text-ink/55 text-sm'}>
        {rotulo}
      </span>
      <span
        className={`tabular ${fuerte ? 'text-ink/90 text-base font-semibold' : 'text-ink/75 text-sm'}`}
      >
        {dinero(moneda, valor)}
      </span>
    </div>
  )

  return (
    <div className="space-y-1.5">
      {linea('Subtotal', subtotal)}
      {descuento > 0 ? linea('Descuento', -descuento) : null}
      {flete > 0 ? linea('Flete', flete) : null}
      {linea(`IVA ${alicuota}%`, iva)}
      <div className="border-hairline border-t pt-1.5">{linea('Total', total, true)}</div>
      {retencion && retencion > 0 ? (
        <>
          {linea('IVA que retiene el cliente', -retencion)}
          <div className="border-hairline border-t pt-1.5">
            {linea('A cobrar', total - retencion, true)}
          </div>
        </>
      ) : null}
    </div>
  )
}

export function TablaRenglones({
  moneda,
  renglones,
  cargando,
}: {
  moneda: string
  renglones: {
    id: number
    descripcion: string
    cantidad: string
    unidad: string
    precio_unitario: string
    subtotal: string
    exento_iva: boolean
  }[]
  cargando: boolean
}) {
  if (cargando) return <Cargando texto="Trayendo los renglones…" />

  return (
    <Card flush className="mt-4">
      <CardHeader title="Renglones" className="p-4 pb-0" />
      <div className="overflow-x-auto p-4 pt-3">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="text-ink/45 border-hairline border-b text-left text-xs">
              <th className="py-2 font-medium">Descripción</th>
              <th className="py-2 text-right font-medium">Cantidad</th>
              <th className="py-2 text-right font-medium">Precio</th>
              <th className="py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {renglones.map((r) => (
              <tr key={r.id} className="border-hairline border-b last:border-0">
                <td className="text-ink/80 py-2">
                  {r.descripcion}
                  {r.exento_iva ? (
                    <Chip tone="neutral" className="ml-2">
                      Exento
                    </Chip>
                  ) : null}
                </td>
                <td className="tabular text-ink/70 py-2 text-right">
                  {Number(r.cantidad).toLocaleString('es-VE')} {r.unidad}
                </td>
                <td className="tabular text-ink/70 py-2 text-right">
                  {dinero(moneda, r.precio_unitario)}
                </td>
                <td className="tabular text-ink/85 py-2 text-right font-medium">
                  {dinero(moneda, r.subtotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
