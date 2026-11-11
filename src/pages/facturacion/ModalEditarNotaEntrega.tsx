import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { CIFRAS_DOCUMENTO, documento, fecha as formatoFecha, soloDocumento } from '@/lib/formato'
import type { PrecioVenta } from '@/lib/api/ventas'
import { aRenglones, filaVacia, type FilaRenglon } from '@/pages/ventas/filas'
import { Renglones } from '@/pages/ventas/Renglones'
import {
  useCambiarPreciosNotaDeSalida,
  useEditarNotaEntrega,
  useMarcarNotaCobrada,
  useMarcarNotaPendientePorCobrar,
  type Cliente,
  type NotaEntrega,
  type RenglonGuardado,
} from '@/lib/api/ventas'

/*
  EDITAR LA NOTA ENTERA, SOLO ADMIN.

  No existía ninguna forma de corregir una nota ya despachada: «Completar»
  solo trabaja mientras está PENDIENTE, y «Anular» es un final, no una
  corrección. Este cuadro deja tocar cada valor del papel —cliente, patio,
  fecha, moneda, camión, peso, flete, descuento, observación y los
  renglones— y la base exige el rol ADMIN por su cuenta, además de un motivo:
  queda en la bitácora igual que una anulación.

  LA QUE RESPALDA UNA SALIDA NO EDITA SUS RENGLONES AQUÍ. Ver el comentario de
  `editar_nota_entrega` en la migración: esos renglones cuelgan del asiento de
  la salida, no de uno propio, y tocarlos por aquí perdería ese enlace.

  PERO SÍ SU PRECIO (11/11/2026): «editables, para poder cambiar el monto».
  Material y cantidad quedan fijos —son los que descontó la salida— y el
  precio de cada renglón se cambia con `cambiar_precios_nota_de_salida`, que
  no toca el inventario. Se guarda junto con el resto, con el mismo motivo.
*/

export function ModalEditarNotaEntrega({
  abierto,
  onCerrar,
  nota,
  renglones,
  clientes,
  precios,
  monedas,
  opcionesDePatio,
  existenciasDePatio,
}: {
  abierto: boolean
  onCerrar: () => void
  nota: NotaEntrega
  renglones: RenglonGuardado[]
  clientes: Cliente[]
  precios: PrecioVenta[]
  monedas: Array<{ valor: string; etiqueta: string }>
  opcionesDePatio: Array<{ valor: string; etiqueta: string }>
  existenciasDePatio: (almacenId: string) => Record<number, number> | undefined
}) {
  const editar = useEditarNotaEntrega()
  const cambiarPrecios = useCambiarPreciosNotaDeSalida()
  const marcarCobrada = useMarcarNotaCobrada()
  const marcarPendiente = useMarcarNotaPendientePorCobrar()
  const editaRenglones = nota.nota_salida === null

  const [clienteId, setClienteId] = useState(String(nota.cliente_id ?? ''))
  const [almacenId, setAlmacenId] = useState(String(nota.almacen_id))
  const [fecha, setFecha] = useState(nota.fecha.slice(0, 10))
  const [moneda, setMoneda] = useState(nota.moneda)
  const [vehiculo, setVehiculo] = useState(nota.vehiculo ?? '')
  const [chofer, setChofer] = useState(nota.chofer ?? '')
  const [cedula, setCedula] = useState(nota.cedula_chofer ?? '')
  const [pesoBruto, setPesoBruto] = useState(nota.peso_bruto ? String(Number(nota.peso_bruto)) : '')
  const [pesoTara, setPesoTara] = useState(nota.peso_tara ? String(Number(nota.peso_tara)) : '')
  const [flete, setFlete] = useState(String(Number(nota.flete)))
  const [descuento, setDescuento] = useState(String(Number(nota.descuento)))
  const [observacion, setObservacion] = useState(nota.observacion ?? '')
  const [motivo, setMotivo] = useState('')
  const [filas, setFilas] = useState<FilaRenglon[]>(() =>
    renglones.length > 0
      ? renglones.map((r) => ({
          ...filaVacia(),
          articulo_id: String(r.articulo_id),
          descripcion: r.descripcion,
          cantidad: String(Number(r.cantidad)),
          unidad: r.unidad,
          precio: String(Number(r.precio_unitario)),
          exento: r.exento_iva,
          condicion: r.condicion ?? 'ACORDADO',
          descuentoEn: r.descuento_pct != null ? 'PORCENTAJE' : 'MONTO',
          descuento: r.descuento_pct ?? r.descuento_unitario ?? '',
          motivo: r.motivo_condicion ?? '',
          almacen_id: r.almacen_id ? String(r.almacen_id) : '',
        }))
      : [filaVacia()],
  )

  // Los precios de una nota que respalda una salida, renglón por renglón.
  const [preciosSalida, setPreciosSalida] = useState<Record<number, string>>(() =>
    Object.fromEntries(renglones.map((r) => [r.id, String(Number(r.precio_unitario))])),
  )
  const preciosCambiados = editaRenglones
    ? []
    : renglones
        .filter((r) => Number(preciosSalida[r.id]) !== Number(r.precio_unitario))
        .map((r) => ({ renglon_id: r.id, precio: Number(preciosSalida[r.id]) }))
  const precioInvalido = preciosCambiados.some((p) => !(p.precio > 0))

  const faltaAlgo =
    !clienteId || !almacenId || !fecha || !moneda || motivo.trim().length < 4 || precioInvalido

  return (
    <Modal
      abierto={abierto}
      ancho="lg"
      onCerrar={onCerrar}
      titulo={`Editar ${nota.numero}`}
      descripcion="Solo un administrador ve este botón. Cada cambio queda en la bitácora con el motivo."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={faltaAlgo || editar.isPending || cambiarPrecios.isPending}
            onClick={async () => {
              await editar.mutateAsync({
                id: nota.id,
                motivo,
                cliente_id: Number(clienteId),
                almacen_id: Number(almacenId),
                fecha,
                moneda,
                vehiculo,
                chofer,
                cedula_chofer: cedula,
                peso_bruto: Number(pesoBruto) || null,
                peso_tara: Number(pesoTara) || null,
                ticket_romana: nota.ticket_romana,
                flete: Number(flete) || 0,
                descuento: Number(descuento) || 0,
                observacion,
                renglones: editaRenglones ? aRenglones(filas) : undefined,
              })
              if (preciosCambiados.length > 0) {
                await cambiarPrecios.mutateAsync({ id: nota.id, motivo, precios: preciosCambiados })
              }
              onCerrar()
            }}
          >
            {editar.isPending || cambiarPrecios.isPending ? 'Guardando…' : 'Guardar los cambios'}
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
        <Select label="Moneda" value={moneda} onChange={(e) => setMoneda(e.target.value)} opciones={monedas} />
        <SelectBuscable
          label="Patio"
          vacio="Seleccione el patio o almacén"
          valor={almacenId}
          onCambio={setAlmacenId}
          opciones={opcionesDePatio}
        />
        <Input label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Input
          label="Vehículo (placa)"
          solo="alfanumerico"
          maxLength={8}
          value={vehiculo}
          onChange={(e) => setVehiculo(e.target.value)}
        />
        <Input label="Chofer" solo="letras" maxLength={60} value={chofer} onChange={(e) => setChofer(e.target.value)} />
        <Input
          label="Cédula del chofer"
          value={cedula}
          onChange={(e) => setCedula(soloDocumento(e.target.value, CIFRAS_DOCUMENTO.cedula))}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input
          label="Peso bruto (kg)"
          type="number"
          min="0"
          inputMode="decimal"
          limite={{ maxEnteros: 6, maxDecimales: 2, sinNegativos: true }}
          value={pesoBruto}
          onChange={(e) => setPesoBruto(e.target.value)}
        />
        <Input
          label="Tara (kg)"
          type="number"
          min="0"
          inputMode="decimal"
          limite={{ maxEnteros: 6, maxDecimales: 2, sinNegativos: true }}
          value={pesoTara}
          onChange={(e) => setPesoTara(e.target.value)}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input
          label="Flete"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          limite={{ maxDecimales: 2, sinNegativos: true }}
          value={flete}
          onChange={(e) => setFlete(e.target.value)}
        />
        <Input
          label="Descuento"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          limite={{ maxDecimales: 2, sinNegativos: true }}
          value={descuento}
          onChange={(e) => setDescuento(e.target.value)}
        />
      </div>

      <div className="mt-4">
        <Textarea label="Observación" rows={2} maxLength={500} value={observacion} onChange={(e) => setObservacion(e.target.value)} />
      </div>

      {/*
        CUENTA POR COBRAR, APARTE DE ESTA EDICIÓN. Christopher, 16/10/2026:
        pidió la opción aquí mismo, en editar. Usa el mismo recordatorio que
        ya existe en el detalle de la nota (`marcar_nota_de_entrega_cobrada` /
        `marcar_nota_de_entrega_pendiente_por_cobrar`), no `editar_nota_entrega`:
        no es parte del papel, así que no pide motivo ni queda en esa bitácora.
      */}
      <div className="border-hairline mt-4 rounded-[6px] border p-3">
        <p className="text-ink/45 mb-2 text-xs font-medium tracking-wide uppercase">
          Cuenta por cobrar
        </p>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <span className="text-ink/70 text-sm">
            {nota.pendiente_por_cobrar
              ? nota.cobrada_en
                ? `Cobrada el ${formatoFecha(nota.cobrada_en)}.`
                : 'Pendiente por cobrar.'
              : 'No está marcada como pendiente por cobrar.'}
          </span>

          {nota.pendiente_por_cobrar && !nota.cobrada_en ? (
            <Button
              size="sm"
              variant="outline"
              disabled={marcarCobrada.isPending}
              onClick={async () => {
                await marcarCobrada.mutateAsync({ id: nota.id })
                onCerrar()
              }}
            >
              {marcarCobrada.isPending ? 'Guardando…' : 'Marcar como cobrada'}
            </Button>
          ) : nota.estado !== 'ANULADA' ? (
            // Sin fecha de pago desde el 11/11/2026: las cuentas por cobrar no vencen.
            <Button
              size="sm"
              variant="ghost"
              disabled={marcarPendiente.isPending}
              onClick={async () => {
                await marcarPendiente.mutateAsync({ id: nota.id })
                onCerrar()
              }}
            >
              {marcarPendiente.isPending ? 'Guardando…' : 'Marcar pendiente por cobrar'}
            </Button>
          ) : null}
        </div>
        {marcarCobrada.error ? <ErrorDeCarga error={marcarCobrada.error} className="mt-2" /> : null}
        {marcarPendiente.error ? <ErrorDeCarga error={marcarPendiente.error} className="mt-2" /> : null}
      </div>

      {editaRenglones ? (
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
      ) : (
        <div className="border-hairline mt-4 rounded-[6px] border p-3">
          <p className="text-ink/55 mb-3 text-xs">
            Esta nota respalda la salida {nota.nota_salida}: el material y la cantidad son los que
            esa salida descontó del patio y no cambian. El precio sí se puede cambiar; el
            inventario no se toca.
          </p>
          <div className="space-y-3">
            {renglones.map((r) => (
              <div key={r.id} className="grid items-end gap-3 sm:grid-cols-[1fr_auto_160px]">
                <div>
                  <p className="text-ink/85 text-sm font-medium">{r.descripcion}</p>
                  <p className="text-ink/50 text-xs">Renglón {r.linea}</p>
                </div>
                <p className="tabular text-ink/70 pb-2 text-sm">
                  {Number(r.cantidad)} {r.unidad}
                </p>
                <Input
                  label={`Precio (${moneda === 'VES' ? 'Bs' : moneda})`}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  limite={{ maxDecimales: 2, sinNegativos: true }}
                  value={preciosSalida[r.id] ?? ''}
                  onChange={(e) => setPreciosSalida((p) => ({ ...p, [r.id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          {precioInvalido ? <p className="text-warning mt-2 text-xs">Cada precio tiene que ser mayor que cero.</p> : null}
        </div>
      )}

      <div className="mt-4">
        <Textarea
          label="Motivo"
          hint="Queda escrito en el registro de auditoría con su nombre."
          rows={2}
          maxLength={500}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          required
        />
      </div>

      {editar.error ? <ErrorDeCarga error={editar.error} className="mt-4" /> : null}
      {cambiarPrecios.error ? <ErrorDeCarga error={cambiarPrecios.error} className="mt-4" /> : null}
    </Modal>
  )
}
