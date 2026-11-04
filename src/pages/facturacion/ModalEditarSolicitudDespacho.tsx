import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { CampoDocumento } from '@/components/CampoDocumento'
import { documento, dolares, enteros } from '@/lib/formato'
import { cedulaComparable, placaLimpia } from '@/lib/api/transporte'
import { useTasaVigente } from '@/lib/api/tasas'
import {
  useEditarSolicitudDespacho,
  type Cliente,
  type PrecioVenta,
  type SolicitudDeDespacho,
} from '@/lib/api/ventas'
import {
  aRenglones,
  faltaEnFila,
  filaVacia,
  repreciar,
  subtotalDe,
  type FilaRenglon,
} from '@/pages/ventas/filas'
import { Renglones } from '@/pages/ventas/Renglones'
import { Totales } from '@/pages/ventas/Cotizaciones'

/*
  EDITAR EL DESPACHO ANTES DE APROBAR, SOLO ADMIN.

  A veces quien pide el despacho olvida colocar la observación general o el
  motivo de un renglón (por ejemplo, cuando el precio acordado pisa uno de
  lista o sale sin cargo), y al aprobarlo la base lo rechaza. Este cuadro le
  permite al ADMIN completar o corregir la solicitud mientras sigue en estado
  PEDIDA, sin tener que rechazarla y pedirla de nuevo desde cero.
*/

export function ModalEditarSolicitudDespacho({
  abierto,
  onCerrar,
  solicitud,
  clientes,
  precios,
  monedas,
  opcionesDePatio,
  existenciasDePatio,
}: {
  abierto: boolean
  onCerrar: () => void
  solicitud: SolicitudDeDespacho
  clientes: Cliente[]
  precios: PrecioVenta[]
  monedas: Array<{ valor: string; etiqueta: string }>
  opcionesDePatio: Array<{ valor: string; etiqueta: string }>
  existenciasDePatio: (almacenId: string) => Record<number, number> | undefined
}) {
  const editar = useEditarSolicitudDespacho()
  const { data: tasaHoy } = useTasaVigente()

  const [clienteId, setClienteId] = useState(String(solicitud.cliente_id))
  const [almacenId, setAlmacenId] = useState(String(solicitud.almacen_id))
  const [moneda, setMoneda] = useState(solicitud.moneda ?? 'USD')
  const [vehiculo, setVehiculo] = useState(solicitud.vehiculo)
  const [vehiculoDescripcion, setVehiculoDescripcion] = useState(
    solicitud.vehiculo_descripcion ?? '',
  )
  const [chofer, setChofer] = useState(solicitud.chofer)
  const [cedula, setCedula] = useState(solicitud.cedula_chofer)
  const [ticket, setTicket] = useState(solicitud.ticket ?? '')
  const [pesoBruto, setPesoBruto] = useState(
    solicitud.peso_bruto ? String(Number(solicitud.peso_bruto)) : '',
  )
  const [pesoTara, setPesoTara] = useState(
    solicitud.peso_tara ? String(Number(solicitud.peso_tara)) : '',
  )
  const [flete, setFlete] = useState(String(Number(solicitud.flete || 0)))
  const [observacion, setObservacion] = useState(solicitud.observacion ?? '')
  const [pagoCombinado, setPagoCombinado] = useState(solicitud.pago_combinado)
  const [montoUsdCombinado, setMontoUsdCombinado] = useState(
    solicitud.monto_usd_combinado != null ? String(Number(solicitud.monto_usd_combinado)) : '',
  )
  const [montoBsCombinado, setMontoBsCombinado] = useState(
    solicitud.monto_bs_combinado != null ? String(Number(solicitud.monto_bs_combinado)) : '',
  )
  const [pendienteCobro, setPendienteCobro] = useState(solicitud.pendiente_por_cobrar)
  const [fechaPago, setFechaPago] = useState(
    solicitud.fecha_pago ? solicitud.fecha_pago.slice(0, 10) : '',
  )
  const [filas, setFilas] = useState<FilaRenglon[]>(() =>
    solicitud.renglones.length > 0
      ? solicitud.renglones.map((r) => ({
          ...filaVacia(),
          articulo_id: String(r.articulo_id),
          descripcion: r.descripcion ?? r.articulo ?? '',
          cantidad: String(Number(r.cantidad)),
          unidad: r.unidad ?? '',
          precio: r.precio_unitario != null ? String(Number(r.precio_unitario)) : '',
          exento: Boolean(r.exento_iva),
          condicion: r.condicion ?? 'ACORDADO',
          descuentoEn: r.descuento_pct != null ? 'PORCENTAJE' : 'MONTO',
          descuento:
            r.descuento_pct != null
              ? String(Number(r.descuento_pct))
              : r.descuento_unitario != null
                ? String(Number(r.descuento_unitario))
                : '',
          motivo: r.motivo_condicion ?? '',
          almacen_id: r.almacen_id ? String(r.almacen_id) : '',
        }))
      : [filaVacia()],
  )

  const tasaUsdHoy = Number(tasaHoy?.tasa ?? 0)
  const cambiarMoneda = (nueva: string) => {
    setMoneda(nueva)
    setFilas((actuales) => repreciar(actuales, precios, nueva, tasaUsdHoy))
    if (nueva !== 'USD') {
      setPagoCombinado(false)
      setMontoUsdCombinado('')
      setMontoBsCombinado('')
    }
  }

  const subtotal = subtotalDe(filas)
  const total = subtotal + (Number(flete) || 0)
  const incompletas = filas.some((f) => faltaEnFila(f, precios) !== null)
  const faltaTransporte =
    chofer.trim().length < 3 ||
    cedulaComparable(cedula).length < 5 ||
    placaLimpia(vehiculo).length < 4

  const totalUsdEquivalente = moneda === 'USD' ? total : tasaUsdHoy > 0 ? total / tasaUsdHoy : 0
  const combinadoUsd = Number(montoUsdCombinado) || 0
  const combinadoBsEnUsd = tasaUsdHoy > 0 ? (Number(montoBsCombinado) || 0) / tasaUsdHoy : 0
  const diferenciaCombinado = totalUsdEquivalente - combinadoUsd - combinadoBsEnUsd
  const combinadoCuadra = Math.abs(diferenciaCombinado) < 0.01
  const faltaElCombinado =
    pagoCombinado &&
    (montoUsdCombinado.trim() === '' || montoBsCombinado.trim() === '' || !combinadoCuadra)

  const faltaAlgo =
    !clienteId ||
    !almacenId ||
    incompletas ||
    faltaTransporte ||
    faltaElCombinado ||
    (pendienteCobro && !fechaPago) ||
    aRenglones(filas).length === 0

  return (
    <Modal
      abierto={abierto}
      ancho="lg"
      onCerrar={onCerrar}
      titulo={`Editar despacho ${solicitud.numero}`}
      descripcion="Solo un administrador ve este botón. Permite completar la observación, el motivo del precio o cualquier dato del despacho antes de aprobarlo."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={faltaAlgo || editar.isPending}
            onClick={async () => {
              await editar.mutateAsync({
                id: solicitud.id,
                cliente_id: Number(clienteId),
                almacen_id: Number(almacenId),
                renglones: aRenglones(filas),
                moneda,
                vehiculo: placaLimpia(vehiculo),
                vehiculo_descripcion: vehiculoDescripcion.trim() || null,
                chofer: chofer.trim(),
                cedula_chofer: cedula.trim(),
                ticket: ticket.trim() || null,
                peso_bruto: Number(pesoBruto) || null,
                peso_tara: Number(pesoTara) || null,
                flete: Number(flete) || 0,
                observacion: observacion.trim() || null,
                pago_combinado: pagoCombinado,
                monto_usd_combinado: pagoCombinado ? combinadoUsd : null,
                monto_bs_combinado: pagoCombinado ? Number(montoBsCombinado) || 0 : null,
                pendiente_por_cobrar: pendienteCobro,
                fecha_pago: pendienteCobro ? fechaPago : null,
              })
              onCerrar()
            }}
          >
            {editar.isPending ? 'Guardando…' : 'Guardar los cambios'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <SelectBuscable
            label="Cliente"
            vacio="Seleccione el cliente"
            valor={clienteId}
            onCambio={setClienteId}
            opciones={clientes.map((c) => ({
              valor: String(c.id),
              etiqueta: `${c.nombre} · ${documento(c.rif)}`,
            }))}
          />
        </div>
        <Select
          label="Moneda"
          value={moneda}
          onChange={(e) => cambiarMoneda(e.target.value)}
          opciones={monedas}
        />
        <div className="sm:col-span-3">
          <SelectBuscable
            label="Patio"
            vacio="Seleccione el patio o almacén"
            valor={almacenId}
            onCambio={setAlmacenId}
            opciones={opcionesDePatio}
            hint="Si un renglón sale de otro patio, se elige en el renglón."
          />
        </div>
      </div>

      <div className="mt-4">
        <Renglones
          filas={filas}
          onCambiar={setFilas}
          precios={precios}
          moneda={moneda}
          patios={{
            opciones: opcionesDePatio,
            deLaNota: almacenId,
            existencias: (id) => existenciasDePatio(id),
          }}
          sinIva
        />
      </div>

      <div className="border-hairline rounded-card mt-4 border border-dashed p-3">
        <p className="text-ink/55 mb-2 text-xs font-medium tracking-wide uppercase">
          Datos del despacho y romana
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Vehículo (placa)"
            value={vehiculo}
            onChange={(e) => setVehiculo(e.target.value)}
          />
          <Input
            label="Vehículo (marca/modelo)"
            value={vehiculoDescripcion}
            onChange={(e) => setVehiculoDescripcion(e.target.value)}
          />
          <Input
            label="Chofer"
            value={chofer}
            onChange={(e) => setChofer(e.target.value)}
          />
          <CampoDocumento label="Cédula del chofer" valor={cedula} onCambiar={setCedula} />
        </div>

        <div className="mt-3 grid gap-4 sm:grid-cols-3">
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
            value={pesoBruto}
            onChange={(e) => setPesoBruto(e.target.value)}
          />
          <Input
            label="Tara (kg)"
            type="number"
            min="0"
            inputMode="decimal"
            hint={
              Number(pesoBruto) > Number(pesoTara)
                ? `Neto: ${enteros(Number(pesoBruto) - Number(pesoTara))} kg`
                : undefined
            }
            value={pesoTara}
            onChange={(e) => setPesoTara(e.target.value)}
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
          alicuota={0}
          iva={0}
          total={total}
          sinIva
        />
      </div>

      {moneda === 'USD' ? (
        <div className="mt-4">
          <label className="border-hairline flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm">
            <input
              type="checkbox"
              className="accent-royal-600 mt-0.5 size-4 shrink-0"
              checked={pagoCombinado}
              onChange={(e) => {
                setPagoCombinado(e.target.checked)
                if (!e.target.checked) {
                  setMontoUsdCombinado('')
                  setMontoBsCombinado('')
                }
              }}
            />
            <span className="text-ink/80">
              Pago combinado: parte en $ y parte en Bs
            </span>
          </label>

          {pagoCombinado ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input
                label="Monto en $"
                type="number"
                value={montoUsdCombinado}
                onChange={(e) => setMontoUsdCombinado(e.target.value)}
                placeholder="0,00"
              />
              <Input
                label="Monto en Bs"
                type="number"
                value={montoBsCombinado}
                onChange={(e) => setMontoBsCombinado(e.target.value)}
                placeholder="0,00"
              />
              <p
                className={`text-xs sm:col-span-2 ${
                  montoUsdCombinado.trim() === '' || montoBsCombinado.trim() === ''
                    ? 'text-ink/50'
                    : combinadoCuadra
                      ? 'text-success'
                      : 'text-warning'
                }`}
              >
                {montoUsdCombinado.trim() === '' || montoBsCombinado.trim() === ''
                  ? 'Falta indicar cuánto se paga en cada moneda.'
                  : combinadoCuadra
                    ? `Cuadra con el total de la nota (${dolares(totalUsdEquivalente)}).`
                    : diferenciaCombinado > 0
                      ? `Faltan ${dolares(diferenciaCombinado)} por cubrir del total.`
                      : `Sobran ${dolares(Math.abs(diferenciaCombinado))} respecto al total.`}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4">
        <label className="border-hairline flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm">
          <input
            type="checkbox"
            className="accent-royal-600 mt-0.5 size-4 shrink-0"
            checked={pendienteCobro}
            onChange={(e) => {
              setPendienteCobro(e.target.checked)
              if (!e.target.checked) setFechaPago('')
            }}
          />
          <span className="text-ink/80">Pendiente por cobrar</span>
        </label>

        {pendienteCobro ? (
          <div className="mt-3">
            <Input
              label="Fecha de pago"
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              value={fechaPago}
              onChange={(e) => setFechaPago(e.target.value)}
              hint={!fechaPago ? 'Hace falta para dejarla pendiente por cobrar.' : undefined}
            />
          </div>
        ) : null}
      </div>

      {editar.error ? <ErrorDeCarga error={editar.error} className="mt-4" /> : null}
    </Modal>
  )
}
