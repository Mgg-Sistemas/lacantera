import { useState } from 'react'
import { Printer, Truck } from 'lucide-react'
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
import { dinero, enteros, fecha } from '@/lib/formato'
import { useEmpresa } from '@/lib/api/empresa'
import { useMiPerfil } from '@/lib/api/usuarios'
import { useAlmacenes, useExistencias } from '@/lib/api/inventario'
import { useGuias, useTickets } from '@/lib/api/despachos'
import { armarDocumento } from '@/lib/ficha/ventaPdf'
import type { PdfArmado } from '@/lib/ficha/reciboPdf'
import {
  MONEDAS,
  useAnularNota,
  useClientes,
  useDespachar,
  useNotasEntrega,
  usePrecios,
  useRenglones,
  type NotaEntrega,
} from '@/lib/api/ventas'
import { Renglones } from './Renglones'
import { aRenglones, filaVacia, gravadoDe, subtotalDe, type FilaRenglon } from './filas'
import { TablaRenglones, Totales } from './Cotizaciones'

const TONO: Record<string, 'safety' | 'success' | 'neutral'> = {
  DESPACHADA: 'safety',
  FACTURADA: 'success',
  ANULADA: 'neutral',
}

const ETIQUETA: Record<string, string> = {
  DESPACHADA: 'Por facturar',
  FACTURADA: 'Facturada',
  ANULADA: 'Anulada',
}

export function Despachos() {
  const { data, isPending, error } = useNotasEntrega()
  const { data: clientes } = useClientes(true)
  const { data: precios } = usePrecios()
  const { data: almacenes } = useAlmacenes()
  const { data: empresa } = useEmpresa()
  const { data: yo } = useMiPerfil()
  const despachar = useDespachar()
  const anular = useAnularNota()

  const [nuevo, setNuevo] = useState(false)
  const [detalle, setDetalle] = useState<NotaEntrega | null>(null)
  const [anulando, setAnulando] = useState<NotaEntrega | null>(null)
  const [motivo, setMotivo] = useState('')
  const [pdf, setPdf] = useState<PdfArmado | null>(null)

  const [clienteId, setClienteId] = useState('')
  const [almacenId, setAlmacenId] = useState('')
  const [moneda, setMoneda] = useState('USD')
  const [vehiculo, setVehiculo] = useState('')
  const [chofer, setChofer] = useState('')
  const [cedula, setCedula] = useState('')
  const [ticket, setTicket] = useState('')
  const [ticketId, setTicketId] = useState('')
  const [guiaId, setGuiaId] = useState('')
  const [bruto, setBruto] = useState('')
  const [tara, setTara] = useState('')
  const [flete, setFlete] = useState('')
  const [observacion, setObservacion] = useState('')
  const [filas, setFilas] = useState<FilaRenglon[]>([filaVacia()])

  const { data: tickets } = useTickets('LIBRE')
  const { data: guias } = useGuias('VIGENTE')

  const ticketsLibres = (tickets ?? []).filter((t) => t.tipo === 'SALIDA')
  const guiasVigentes = (guias ?? []).filter((g) => !g.vencida)

  const { data: existencias } = useExistencias(almacenId ? Number(almacenId) : undefined)
  const renglonesDetalle = useRenglones('nota_entrega_renglones', 'nota_id', detalle?.id ?? null)

  const porArticulo: Record<number, number> = {}
  for (const e of existencias ?? []) porArticulo[e.articulo_id] = Number(e.existencia)

  const cliente = clientes?.find((c) => String(c.id) === clienteId)
  const alicuota = cliente?.exento_iva ? 0 : 16
  const subtotal = subtotalDe(filas)
  const gravado = gravadoDe(filas)
  const base = gravado + (Number(flete) || 0)
  const iva = (base * alicuota) / 100
  const total = subtotal + (Number(flete) || 0) + iva

  const limpiar = () => {
    setClienteId('')
    setMoneda('USD')
    setVehiculo('')
    setChofer('')
    setCedula('')
    setTicket('')
    setTicketId('')
    setGuiaId('')
    setBruto('')
    setTara('')
    setFlete('')
    setObservacion('')
    setFilas([filaVacia()])
  }

  const imprimir = async (n: NotaEntrega) => {
    const renglones = renglonesDetalle.data ?? []
    setPdf(
      await armarDocumento({
        tipo: 'NOTA',
        numero: n.numero,
        fecha: n.fecha,
        cliente: {
          nombre: n.cliente,
          rif: n.cliente_rif,
          direccion: clientes?.find((c) => c.id === n.cliente_id)?.direccion ?? null,
        },
        despacho: {
          vehiculo: n.vehiculo,
          chofer: n.chofer,
          cedulaChofer: n.cedula_chofer,
          ticket: n.ticket_romana,
          pesoNeto: n.peso_neto ? `${enteros(n.peso_neto)} kg` : null,
        },
        moneda: n.moneda,
        tasa: n.tasa_usd,
        renglones: renglones.map((r) => ({
          descripcion: r.descripcion,
          cantidad: r.cantidad,
          unidad: r.unidad,
          precio_unitario: r.precio_unitario,
          subtotal: r.subtotal,
          exento_iva: r.exento_iva,
        })),
        subtotal: n.subtotal,
        descuento: n.descuento,
        flete: n.flete,
        iva: n.iva,
        alicuotaIva: n.alicuota_iva,
        total: n.total,
        observacion: n.observacion,
        sello: n.estado === 'ANULADA' ? 'ANULADA' : null,
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
        title="Notas de entrega"
        description="El papel con el que sale el camión. Al despachar, el material se descuenta del patio."
        actions={
          <Button icon={<Truck />} onClick={() => setNuevo(true)}>
            Despachar
          </Button>
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<Truck />}
            titulo="Todavía no ha salido ningún camión"
            descripcion="Cada despacho rebaja el patio y queda esperando por facturar. Si el patio está en cero, carga primero la producción desde Inventario › Existencias."
            accion={
              <Button icon={<Truck />} onClick={() => setNuevo(true)}>
                Despachar
              </Button>
            }
          />
        </Card>
      ) : null}

      {data && data.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Nota</th>
                  <th className="px-3 py-3 font-medium">Cliente</th>
                  <th className="px-3 py-3 font-medium">Vehículo</th>
                  <th className="px-3 py-3 font-medium">Fecha</th>
                  <th className="px-3 py-3 text-right font-medium">Total</th>
                  <th className="px-5 py-3 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.map((n) => (
                  <tr
                    key={n.id}
                    onClick={() => setDetalle(n)}
                    className="border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors last:border-0"
                  >
                    <td className="tabular text-ink/85 px-5 py-3 font-medium">
                      {n.numero}
                      {n.factura_numero ? (
                        <span className="text-ink/45 block text-xs">{n.factura_numero}</span>
                      ) : null}
                    </td>
                    <td className="text-ink/70 px-3 py-3">{n.cliente}</td>
                    <td className="text-ink/60 px-3 py-3 text-xs">
                      {n.vehiculo ?? '—'}
                      {n.chofer ? <span className="block">{n.chofer}</span> : null}
                    </td>
                    <td className="text-ink/60 px-3 py-3 text-xs">{fecha(n.fecha)}</td>
                    <td className="tabular text-ink/85 px-3 py-3 text-right font-medium">
                      {dinero(n.moneda, n.total)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Chip tone={TONO[n.estado] ?? 'neutral'}>{ETIQUETA[n.estado]}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* ---------------------------------------------------- despachar */}
      {nuevo ? (
        <Modal
          abierto
          ancho="lg"
          onCerrar={() => {
            setNuevo(false)
            limpiar()
          }}
          titulo="Despachar material"
          descripcion="Esto rebaja el patio en el acto. Si el camión no sale, hay que anular la nota."
          acciones={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setNuevo(false)
                  limpiar()
                }}
              >
                Cancelar
              </Button>
              <Button
                disabled={
                  despachar.isPending ||
                  !clienteId ||
                  !almacenId ||
                  aRenglones(filas).length === 0
                }
                onClick={async () => {
                  await despachar.mutateAsync({
                    cliente_id: Number(clienteId),
                    almacen_id: Number(almacenId),
                    renglones: aRenglones(filas),
                    moneda,
                    vehiculo: vehiculo || null,
                    chofer: chofer || null,
                    cedula_chofer: cedula || null,
                    ticket: ticket || null,
                    peso_bruto: Number(bruto) || null,
                    peso_tara: Number(tara) || null,
                    flete: Number(flete) || 0,
                    observacion: observacion || null,
                    ticket_id: Number(ticketId) || null,
                    guia_id: Number(guiaId) || null,
                  })
                  setNuevo(false)
                  limpiar()
                }}
              >
                {despachar.isPending ? 'Despachando…' : 'Despachar'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Select
                label="Cliente"
                vacio="Elige el cliente"
                value={clienteId}
                onChange={(e) => {
                  setClienteId(e.target.value)
                  const c = clientes?.find((x) => String(x.id) === e.target.value)
                  if (c) setMoneda(c.moneda_preferida)
                }}
                opciones={(clientes ?? []).map((c) => ({
                  valor: String(c.id),
                  etiqueta: `${c.nombre} · ${c.rif}`,
                }))}
                required
              />
            </div>
            <Select
              label="Moneda"
              value={moneda}
              onChange={(e) => setMoneda(e.target.value)}
              opciones={MONEDAS}
            />
            <div className="sm:col-span-3">
              <Select
                label="De qué patio sale"
                vacio="Elige el patio o almacén"
                value={almacenId}
                onChange={(e) => setAlmacenId(e.target.value)}
                opciones={(almacenes ?? []).map((a) => ({
                  valor: String(a.id),
                  etiqueta: a.nombre,
                }))}
                required
              />
            </div>
          </div>

          <div className="mt-4">
            <Renglones
              filas={filas}
              onCambiar={setFilas}
              precios={precios ?? []}
              moneda={moneda}
              existencias={almacenId ? porArticulo : undefined}
            />
          </div>

          <div className="border-hairline rounded-card mt-4 border border-dashed p-3">
            <p className="text-ink/60 mb-3 text-xs">
              Datos del camión y de la romana. El peso no cambia lo que se factura: es la prueba
              del día que alguien discuta la cantidad.
            </p>

            {/* El pesaje y la guía se eligen de lo que la garita ya registró.
                Elegir un ticket trae sus pesos y su placa: volver a teclearlos
                es la forma de que el papel y la báscula digan cosas distintas.
                Sin guía, la base rechaza el despacho de mineral. */}
            <div className="mb-4 grid gap-4 sm:grid-cols-2">
              <Select
                label="Ticket de romana"
                vacio="Sin pesaje registrado"
                value={ticketId}
                onChange={(e) => {
                  setTicketId(e.target.value)
                  const t = ticketsLibres.find((x) => String(x.id) === e.target.value)
                  if (t) {
                    setVehiculo(t.vehiculo)
                    setChofer(t.chofer ?? '')
                    setCedula(t.cedula_chofer ?? '')
                    setBruto(String(Number(t.peso_bruto)))
                    setTara(String(Number(t.peso_tara)))
                    setTicket(t.numero)
                  }
                }}
                opciones={ticketsLibres.map((t) => ({
                  valor: String(t.id),
                  etiqueta: `${t.numero} · ${t.vehiculo} · ${enteros(t.peso_neto)} kg`,
                }))}
                hint={
                  ticketsLibres.length === 0
                    ? 'No hay pesajes sin usar. Se registran en Despachos › Tickets de romana.'
                    : 'Al elegirlo, los pesos y la placa se traen de la báscula.'
                }
              />
              <Select
                label="Guía de movilización"
                vacio="Sin guía"
                value={guiaId}
                onChange={(e) => setGuiaId(e.target.value)}
                opciones={guiasVigentes.map((g) => ({
                  valor: String(g.id),
                  etiqueta: `${g.numero_guia} · ${g.articulo} · ${enteros(g.toneladas)} t`,
                }))}
                error={
                  guiasVigentes.length === 0
                    ? 'No hay guías vigentes: el despacho de mineral se rechazará'
                    : undefined
                }
                hint="Ninguna salida de mineral viaja sin guía."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Placa del vehículo"
                placeholder="A12BC3D"
                value={vehiculo}
                onChange={(e) => setVehiculo(e.target.value)}
              />
              <Input label="Chofer" value={chofer} onChange={(e) => setChofer(e.target.value)} />
              <Input
                label="Cédula del chofer"
                placeholder="V-12345678"
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
              />
              <Input
                label="Ticket de romana"
                value={ticket}
                onChange={(e) => setTicket(e.target.value)}
              />
              <Input
                label="Peso bruto (kg)"
                type="number"
                min="0"
                inputMode="decimal"
                value={bruto}
                onChange={(e) => setBruto(e.target.value)}
              />
              <Input
                label="Tara (kg)"
                type="number"
                min="0"
                inputMode="decimal"
                hint={
                  Number(bruto) > Number(tara)
                    ? `Neto: ${enteros(Number(bruto) - Number(tara))} kg`
                    : undefined
                }
                value={tara}
                onChange={(e) => setTara(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input
              label="Flete"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={flete}
              onChange={(e) => setFlete(e.target.value)}
            />
            <Textarea
              label="Observación"
              rows={2}
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
            />
          </div>

          <div className="bg-ink/4 rounded-card mt-4 p-4">
            <Totales
              moneda={moneda}
              subtotal={subtotal}
              descuento={0}
              flete={Number(flete) || 0}
              alicuota={alicuota}
              iva={iva}
              total={total}
            />
          </div>

          {despachar.error ? <ErrorDeCarga error={despachar.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      {/* ------------------------------------------------------ detalle */}
      {detalle ? (
        <Modal
          abierto
          ancho="lg"
          onCerrar={() => setDetalle(null)}
          titulo={detalle.numero}
          descripcion={`${detalle.cliente} · ${fecha(detalle.fecha)} · sale de ${detalle.almacen}`}
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
              {detalle.estado === 'DESPACHADA' ? (
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
              ) : null}
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={TONO[detalle.estado] ?? 'neutral'}>{ETIQUETA[detalle.estado]}</Chip>
            {detalle.vehiculo ? <Chip tone="neutral">{detalle.vehiculo}</Chip> : null}
            {detalle.peso_neto ? (
              <Chip tone="info">Neto {enteros(detalle.peso_neto)} kg</Chip>
            ) : null}
            {detalle.factura_numero ? (
              <Chip tone="success">En la factura {detalle.factura_numero}</Chip>
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
            />
          </div>
        </Modal>
      ) : null}

      {/* ------------------------------------------------------- anular */}
      {anulando ? (
        <Modal
          abierto
          onCerrar={() => setAnulando(null)}
          titulo={`Anular la nota ${anulando.numero}`}
          descripcion="El material vuelve al patio con un reverso. La nota se queda a la vista, anulada."
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
                {anular.isPending ? 'Anulando…' : 'Anular la nota'}
              </Button>
            </>
          }
        >
          <Textarea
            label="Por qué se anula"
            hint="Queda escrito en el registro de auditoría con tu nombre."
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            required
          />
          {anular.error ? <ErrorDeCarga error={anular.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      <Visor
        abierto={pdf !== null}
        onCerrar={() => setPdf(null)}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ""}
        titulo="Nota de entrega"
      />
    </>
  )
}
