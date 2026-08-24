import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useAlmacenes } from '@/lib/api/inventario'
import { useCerrarMantenimiento, type OrdenDeTaller } from '@/lib/api/maquinaria'
import { hoyEnCaracas } from '@/lib/api/tasas'

/*
  EL MATERIAL VUELVE DEL TALLER

  Una orden sobre material no cuelga de ninguna máquina, así que no se podía
  cerrar desde ningún sitio: el modal de taller se abre desde la fila de un
  equipo. Esto es su puerta, desde la cola del propio taller.

  LA PREGUNTA QUE IMPORTA ES CUÁNTO VOLVIÓ

  Y viene rellena con todo lo que entró, porque es lo que pasa casi siempre.
  Quien tenga que cambiarlo es porque algo se perdió por el camino, y entonces
  vale la pena que se pare a escribir el número.

  La diferencia no se pierde de vista: se registra como merma del taller. Un
  material que entra y no sale entero, sin dejar rastro, es exactamente cómo se
  descuadra un inventario sin que nadie sepa cuándo empezó.
*/

export function ModalVuelveDelTaller({
  orden,
  onCerrar,
}: {
  /** La orden abierta sobre material. `null` cierra el modal. */
  orden: OrdenDeTaller | null
  onCerrar: () => void
}) {
  const { data: almacenes } = useAlmacenes()
  const cerrar = useCerrarMantenimiento()
  const hoy = hoyEnCaracas()

  const [detalle, setDetalle] = useState('')
  const [devuelto, setDevuelto] = useState('')
  const [destino, setDestino] = useState('')
  const [costo, setCosto] = useState('')
  const [dia, setDia] = useState(hoy)

  useEffect(() => {
    if (!orden) return
    setDetalle('')
    // Viene relleno con lo que entró: es el caso normal, y así solo teclea
    // quien tiene algo distinto que decir.
    setDevuelto(orden.cantidad ?? '')
    setDestino('')
    setCosto('')
    setDia(hoy)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden])

  const entraron = Number(orden?.cantidad ?? 0)
  const vuelven = Number(devuelto)
  const merma = Math.max(entraron - vuelven, 0)
  const seDesborda = vuelven > entraron

  const valido =
    detalle.trim().length >= 3 && Boolean(destino) && vuelven >= 0 && !seDesborda

  const enviar = async () => {
    if (!orden) return
    await cerrar.mutateAsync({
      id: orden.id,
      detalle: detalle.trim(),
      costo_usd: costo ? Number(costo) : null,
      devuelto: vuelven,
      destino_id: Number(destino),
      fecha_salida: dia,
    })
    onCerrar()
  }

  return (
    <Modal
      abierto={orden !== null}
      onCerrar={onCerrar}
      titulo="El material vuelve del taller"
      descripcion={orden ? `${orden.numero ?? ''} · ${orden.sobre}` : ''}
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button disabled={!valido || cerrar.isPending} onClick={() => void enviar()}>
            {cerrar.isPending ? 'Cerrando…' : 'Cerrar el trabajo'}
          </Button>
        </>
      }
    >
      <Textarea
        label="Qué se le hizo"
        rows={2}
        placeholder="Se enderezaron en la prensa"
        value={detalle}
        onChange={(e) => setDetalle(e.target.value)}
      />

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input
          label={`Cuánto vuelve (${orden?.unidad?.toLowerCase() ?? 'unidades'})`}
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={devuelto}
          onChange={(e) => setDevuelto(e.target.value)}
          error={seDesborda ? `Del taller no puede volver más de ${entraron}` : undefined}
          hint={
            merma > 0 && !seDesborda
              ? `Se quedan ${merma} ${orden?.unidad?.toLowerCase() ?? ''} como merma del taller.`
              : 'Entraron ' + entraron + ' y vuelven todas.'
          }
        />
        <Select
          label="A qué almacén vuelve"
          vacio="Elegir"
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          opciones={(almacenes ?? [])
            .filter((a) => a.id !== orden?.taller_id)
            .map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))}
          hint="Puede no ser el mismo del que salió."
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input label="Sale el" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
        <Input
          label="Qué costó el trabajo (USD)"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          placeholder="Opcional"
          value={costo}
          onChange={(e) => setCosto(e.target.value)}
          hint="Si lo hizo un taller de fuera y pasó factura."
        />
      </div>

      {cerrar.error ? <ErrorDeCarga error={cerrar.error} className="mt-3" /> : null}
    </Modal>
  )
}
