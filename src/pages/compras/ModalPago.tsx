import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ChipTasa } from '@/components/ChipTasa'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useIndicarPago } from '@/lib/api/compras'
import { useMetodosPago, opcionesDe, monedasDe } from '@/lib/api/metodosPago'
import { MONEDAS } from '@/lib/api/ventas'
import { CamposDePago } from '@/components/CamposDePago'
import type { DatosPago, Orden } from '@/lib/api/compras'
import { bolivares, dolares } from '@/lib/formato'

interface Props {
  abierto: boolean
  onCerrar: () => void
  orden: Orden
}

export function ModalPago({ abierto, onCerrar, orden }: Props) {
  const indicar = useIndicarPago()
  const { data: metodos } = useMetodosPago()

  // Lo instruido y lo pagado ya reservan parte de la orden; lo que se ofrece
  // por defecto es lo que falta, no el total.
  const comprometido = orden.instrucciones
    .filter((i) => i.estado === 'POR_PAGAR' || i.estado === 'PAGADA')
    .reduce((s, i) => s + Number(i.monto), 0)
  const pendiente = Math.max(Number(orden.total) - comprometido, 0)

  const [metodo, setMetodo] = useState('TRANSFERENCIA')
  const [moneda, setMoneda] = useState(orden.moneda)
  const [monto, setMonto] = useState(String(pendiente.toFixed(2)))
  const [datos, setDatos] = useState<DatosPago>({})
  const [nota, setNota] = useState('')

  const elegido = (metodos ?? []).find((m) => m.codigo === metodo)

  const cambiar = (cambios: DatosPago) => setDatos((d) => ({ ...d, ...cambios }))

  /*
    Las monedas que admite el método las dice el catálogo, no un `if`.

    Antes esto era una escalera: si es pago móvil, bolívares; si es Binance,
    dólares; si no, las dos. Cada método nuevo obligaba a añadir un peldaño, y
    la misma regla estaba además escrita en la base. Ahora hay una sola:
    `moneda_regla`.
  */
  const monedasPosibles = monedasDe(elegido, MONEDAS)

  const cambiarMetodo = (nuevo: string) => {
    setMetodo(nuevo)

    // Si la moneda puesta no le sirve al método nuevo, se pasa a la primera que
    // sí. Dejarla inválida haría que el guardado fallara al llegar a la base
    // con un mensaje que no señala el selector que hay que corregir.
    const m = (metodos ?? []).find((x) => x.codigo === nuevo)
    const admitidas = monedasDe(m, MONEDAS)
    if (!admitidas.some((x) => x.valor === moneda) && admitidas[0]) {
      setMoneda(admitidas[0].valor)
    }

    setDatos({})
  }

  const igtf = moneda !== 'VES' ? Number(monto || 0) * 0.03 : 0
  const formato = moneda === 'VES' ? bolivares : dolares

  const guardar = async () => {
    await indicar.mutateAsync({
      orden_id: orden.id,
      metodo,
      moneda,
      monto: Number(monto),
      datos,
      nota,
    })
    onCerrar()
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Método de pago"
      descripcion="Con esto la orden pasa a tesorería para que ejecute el pago."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={indicar.isPending}>
            {indicar.isPending ? 'Enviando…' : 'Enviar a tesorería'}
          </Button>
        </>
      }
    >
      {/* De las tres pantallas donde va el chip, esta es la que más lo
          necesita: aquí se elige moneda y monto, y si el pago va en bolívares
          la tasa decide cuánto sale de la cuenta. Puesto arriba del formulario
          se lee antes de escribir la cifra, no después. */}
      <ChipTasa className="mb-4" />

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Cómo se paga"
          value={metodo}
          onChange={(e) => cambiarMetodo(e.target.value)}
          opciones={opcionesDe(metodos)}
        />

        <Select
          label="Moneda"
          value={moneda}
          onChange={(e) => setMoneda(e.target.value)}
          opciones={monedasPosibles}
        />

        <Input
          label="Monto"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          hint={`Falta por pagar: ${formato(pendiente)}`}
        />

        {moneda !== 'VES' ? (
          <div className="border-warning/30 bg-warning-soft rounded-[6px] border p-3 text-sm sm:mt-6">
            <p className="text-ink/80">
              Pago en divisa: causa <strong>IGTF del 3%</strong> ={' '}
              <span className="tabular">{dolares(igtf)}</span>. Sale además del monto.
            </p>
          </div>
        ) : null}
      </div>

      <h3 className="text-ink/85 mt-6 mb-2 text-sm font-semibold">Datos de la transacción</h3>

      <CamposDePago metodo={elegido} datos={datos} onCambiar={cambiar} />

      <Textarea
        label="Nota para tesorería"
        className="mt-4"
        rows={2}
        placeholder="Opcional: llamar antes de transferir, pagar solo en horario de oficina…"
        value={nota}
        onChange={(e) => setNota(e.target.value)}
      />

      {indicar.error ? <ErrorDeCarga error={indicar.error} className="mt-4" /> : null}
    </Modal>
  )
}
