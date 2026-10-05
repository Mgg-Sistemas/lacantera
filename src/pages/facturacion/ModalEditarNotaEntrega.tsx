import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { documento } from '@/lib/formato'
import type { PrecioVenta } from '@/lib/api/ventas'
import { aRenglones, filaVacia, type FilaRenglon } from '@/pages/ventas/filas'
import { Renglones } from '@/pages/ventas/Renglones'
import {
  useEditarNotaEntrega,
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
  la salida, no de uno propio, y tocarlos por aquí perdería ese enlace. Para
  esas notas el bloque de renglones no se enseña.
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

  const faltaAlgo =
    !clienteId || !almacenId || !fecha || !moneda || motivo.trim().length < 4

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
            disabled={faltaAlgo || editar.isPending}
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
        <Input label="Vehículo (placa)" value={vehiculo} onChange={(e) => setVehiculo(e.target.value)} />
        <Input label="Chofer" value={chofer} onChange={(e) => setChofer(e.target.value)} />
        <Input label="Cédula del chofer" value={cedula} onChange={(e) => setCedula(e.target.value)} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
          value={flete}
          onChange={(e) => setFlete(e.target.value)}
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
      </div>

      <div className="mt-4">
        <Textarea label="Observación" rows={2} value={observacion} onChange={(e) => setObservacion(e.target.value)} />
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
        <p className="text-ink/55 bg-ink/4 rounded-card mt-4 p-3 text-xs">
          Esta nota respalda la salida {nota.nota_salida}: sus renglones son los que esa salida
          descontó del patio, y no se editan desde aquí.
        </p>
      )}

      <div className="mt-4">
        <Textarea
          label="Motivo"
          hint="Queda escrito en el registro de auditoría con su nombre."
          rows={2}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          required
        />
      </div>

      {editar.error ? <ErrorDeCarga error={editar.error} className="mt-4" /> : null}
    </Modal>
  )
}
