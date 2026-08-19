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
  /*
    EL ALMACÉN LO PROPONE EL PEDIDO, NO LA CONFIGURACIÓN

    Antes venía siempre el almacén marcado como «recibe compras», el mismo para
    todo. Un filtro de aire terminó en ALIMENTACIÓN, y no fue un descuido de
    quien recibió: la pantalla se lo puso y él no tenía por qué saber que estaba
    mal.

    Ahora manda lo que dijo quien pidió. Si el pedido decía «Taller de
    Reparación Primaria», ahí va; si el destino no era un almacén —un frente, la
    planta— se cae al de por defecto, que es lo único que queda.
  */
  const destinoDelPedido = orden.solicitud?.destino_almacen_id

  /*
    Y si el pedido no dijo destino, no se adivina.

    `recibe_compras` está marcado en seis almacenes: quien cargó los datos lo
    leyó como «puede recibir compras», que es una lectura razonable. El código
    lo leía como «el almacén por defecto» y tomaba el primero de la lista, que
    por orden alfabético es ALIMENTACIÓN. De ahí el filtro de aire.

    Con un solo candidato se propone; con seis no se propone ninguno, porque
    elegir por orden alfabético es elegir al azar con cara de decisión.
  */
  const candidatos = (almacenes ?? []).filter((a) => a.recibe_compras)
  const porDefecto = candidatos.length === 1 ? candidatos[0].id : null

  const [almacenId, setAlmacenId] = useState(() =>
    String(destinoDelPedido ?? porDefecto ?? ''),
  )
  const [fecha, setFecha] = useState(hoyEnCaracas())
  const [nota, setNota] = useState('')

  // El almacén por defecto llega con la consulta, después del primer render.
  const almacenElegido = almacenId || String(destinoDelPedido ?? porDefecto ?? '')

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
          <Button onClick={() => void guardar()} disabled={!algo || !almacenElegido || recibir.isPending}>
            {recibir.isPending ? 'Registrando…' : 'Registrar la recepción'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Almacén que recibe"
          vacio="Elige el almacén"
          value={almacenElegido}
          onChange={(e) => setAlmacenId(e.target.value)}
          opciones={(almacenes ?? []).map((a) => ({
            valor: String(a.id),
            etiqueta: `${a.codigo} · ${a.nombre}`,
          }))}
          hint={
            destinoDelPedido
              ? String(destinoDelPedido) === almacenElegido
                ? 'Es el destino que pidió quien lo solicitó.'
                : 'Ojo: el pedido era para otro sitio.'
              : orden.solicitud?.destino
                ? `El pedido decía «${orden.solicitud.destino}», que no es un almacén. Elige dónde entra.`
                : 'El pedido no dijo a dónde iba. Elige dónde entra.'
          }
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
