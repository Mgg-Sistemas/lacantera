import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useAlmacenes, useRegistrarRecepcion } from '@/lib/api/inventario'
import type { Orden } from '@/lib/api/compras'
import { hoyEnCaracas } from '@/lib/api/tasas'

interface Props {
  abierto: boolean
  onCerrar: () => void
  orden: Orden
}

export function ModalRecepcion({ abierto, onCerrar, orden }: Props) {
  const { data: almacenes } = useAlmacenes()
  const recibir = useRegistrarRecepcion()

  const pendientes = orden.renglones
    .slice()
    .sort((a, b) => a.linea - b.linea)
    .map((r) => ({
      ...r,
      pendiente: Number(r.cantidad) - Number(r.cantidad_recibida),
    }))
    .filter((r) => r.pendiente > 0.0001)

  // Se propone recibir todo lo que falta: lo normal es que llegue completo, y
  // corregir un número es más rápido que escribir todos.
  const [cantidades, setCantidades] = useState<Record<number, string>>(() =>
    Object.fromEntries(pendientes.map((r) => [r.id, String(r.pendiente)])),
  )
  const [almacenId, setAlmacenId] = useState(
    () => String(almacenes?.find((a) => a.recibe_compras)?.id ?? ''),
  )
  const [fecha, setFecha] = useState(hoyEnCaracas())
  const [nota, setNota] = useState('')

  // El almacén por defecto llega con la consulta, después del primer render.
  const almacenElegido =
    almacenId || String(almacenes?.find((a) => a.recibe_compras)?.id ?? almacenes?.[0]?.id ?? '')

  const guardar = async () => {
    await recibir.mutateAsync({
      orden_id: orden.id,
      almacen_id: Number(almacenElegido),
      fecha,
      nota,
      renglones: pendientes
        .map((r) => ({
          orden_renglon_id: r.id,
          cantidad: Number(cantidades[r.id] ?? 0),
        }))
        .filter((r) => r.cantidad > 0),
    })
    onCerrar()
  }

  const algo = pendientes.some((r) => Number(cantidades[r.id] ?? 0) > 0)

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Recibir material"
      descripcion="Lo que se registre aquí entra al inventario y no se puede editar después: una corrección se hace con un ajuste."
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={!algo || recibir.isPending}>
            {recibir.isPending ? 'Registrando…' : 'Registrar la recepción'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Almacén que recibe"
          value={almacenElegido}
          onChange={(e) => setAlmacenId(e.target.value)}
          opciones={(almacenes ?? []).map((a) => ({
            valor: String(a.id),
            etiqueta: `${a.codigo} · ${a.nombre}`,
          }))}
        />
        <Input
          label="Fecha de recepción"
          type="date"
          max={hoyEnCaracas()}
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />
      </div>

      <h3 className="text-ink/85 mt-6 mb-2 text-sm font-semibold">Qué llegó</h3>

      <div className="space-y-2.5">
        {pendientes.map((r) => (
          <div key={r.id} className="border-hairline rounded-card border p-3">
            <p className="text-ink/85 text-sm font-medium">{r.descripcion}</p>
            <p className="text-ink/50 text-xs">
              Pedido {r.cantidad} {r.unidad}
              {Number(r.cantidad_recibida) > 0
                ? ` · ya recibido ${r.cantidad_recibida}`
                : ''}{' '}
              · falta {r.pendiente}
            </p>

            <Input
              label="Cantidad que llegó"
              className="mt-2 sm:max-w-[220px]"
              type="number"
              min="0"
              max={r.pendiente}
              step="0.01"
              inputMode="decimal"
              value={cantidades[r.id] ?? ''}
              onChange={(e) => setCantidades((c) => ({ ...c, [r.id]: e.target.value }))}
              hint="Déjalo en cero si este renglón no llegó todavía."
            />
          </div>
        ))}

        {pendientes.length === 0 ? (
          <p className="text-ink/55 text-sm">Ya se recibió todo lo de esta orden.</p>
        ) : null}
      </div>

      <Textarea
        label="Nota"
        className="mt-4"
        rows={2}
        placeholder="Opcional: número de guía, quién trajo el material, estado en que llegó"
        value={nota}
        onChange={(e) => setNota(e.target.value)}
      />

      {recibir.error ? <ErrorDeCarga error={recibir.error} className="mt-4" /> : null}
    </Modal>
  )
}
