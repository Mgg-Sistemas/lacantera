import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ChipTasa } from '@/components/ChipTasa'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useIndicarPago } from '@/lib/api/compras'
import { useMetodosPago, opcionesDe, monedasDe } from '@/lib/api/metodosPago'
import { useMonedasUsables } from '@/lib/api/tasas'
import { CamposDePago } from '@/components/CamposDePago'
import type { DatosPago, Orden } from '@/lib/api/compras'
import { bolivares, dolares } from '@/lib/formato'
import { cn } from '@/lib/cn'

interface Props {
  abierto: boolean
  onCerrar: () => void
  orden: Orden
}

export function ModalPago({ abierto, onCerrar, orden }: Props) {
  const indicar = useIndicarPago()

  /*
    Las monedas salen del catálogo, no de una lista de dos escrita a mano.

    Estaba cruzando la regla del método contra `MONEDAS`, que solo tenía dólar
    y bolívar. Con la cuenta de Binance ya en USDT, a un método `NUNCA_VES` le
    quedaba únicamente el dólar: la pantalla ofrecía indicar un pago en dólares
    sobre una cuenta en Tether. No llegó a corromper nada porque
    `registrar_pago_compra` toma la moneda de la cuenta y no de la instrucción,
    pero la instrucción habría quedado diciendo una moneda que no era.

    Lo encontró el carril de base de datos revisando el contrato.
  */
  const catalogo = useMonedasUsables()
  const todas = catalogo.data ?? []
  const { data: metodos } = useMetodosPago()

  // Lo instruido y lo pagado ya reservan parte de la orden; lo que se ofrece
  // por defecto es lo que falta, no el total.
  const comprometido = orden.instrucciones
    .filter((i) => i.estado === 'POR_PAGAR' || i.estado === 'PAGADA')
    .reduce((s, i) => s + Number(i.monto), 0)
  const pendiente = Math.max(Number(orden.total) - comprometido, 0)

  /*
    Se propone cómo cobra el proveedor, no un método fijo.

    Estaba en «Transferencia» para todos, y el dato ya existía en su ficha sin
    que nadie lo mirara. Quien paga tenía que acordarse de que a este se le
    paga por Zelle y a aquel por pago móvil. Se propone; se puede cambiar,
    porque el que siempre cobra por transferencia un día pide efectivo.
  */
  const [metodo, setMetodo] = useState(orden.proveedor?.metodo_pago_preferido ?? 'TRANSFERENCIA')
  const [moneda, setMoneda] = useState(orden.moneda)
  const [monto, setMonto] = useState(String(pendiente.toFixed(2)))
  const [datos, setDatos] = useState<DatosPago>({})
  const [nota, setNota] = useState('')

  /*
    EL IGTF SE PROPONE, NO SE IMPONE

    El 3% grava los pagos en divisa, así que se marca solo cuando la moneda no
    es el bolívar. Pero la empresa pidió que fuera opcional en cada operación
    —igual que el IVA—, y hay casos donde no aplica. Antes salía como un aviso
    y no había forma de quitarlo: la pantalla informaba de un cobro que el
    usuario no podía discutir.
  */
  const [conIgtf, setConIgtf] = useState(moneda !== 'VES')

  const elegido = (metodos ?? []).find((m) => m.codigo === metodo)

  /*
    El método que propone el proveedor puede no servir para esta orden.

    Un proveedor que cobra por Zelle solo admite dólares; si la orden va en
    bolívares, el modal abría con una pareja imposible y la base lo rechazaba
    al guardar. Se cuadra en cuanto llega el catálogo: si el método no admite
    la moneda, se pasa a la primera que sí, igual que al cambiarlo a mano.
  */
  useEffect(() => {
    if (!metodos || !elegido) return
    const admitidas = monedasDe(elegido, todas)
    if (admitidas.length > 0 && !admitidas.some((m) => m.valor === moneda)) {
      setMoneda(admitidas[0].valor)
      setConIgtf(admitidas[0].valor !== 'VES')
    }
    // Solo cuando llega el catálogo o cambia el método: si `moneda` entrara
    // como dependencia, elegir bolívares a mano se desharía solo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metodos, metodo, todas])

  const cambiar = (cambios: DatosPago) => setDatos((d) => ({ ...d, ...cambios }))

  /*
    Las monedas que admite el método las dice el catálogo, no un `if`.

    Antes esto era una escalera: si es pago móvil, bolívares; si es Binance,
    dólares; si no, las dos. Cada método nuevo obligaba a añadir un peldaño, y
    la misma regla estaba además escrita en la base. Ahora hay una sola:
    `moneda_regla`.
  */
  const monedasPosibles = monedasDe(elegido, todas)

  const cambiarMetodo = (nuevo: string) => {
    setMetodo(nuevo)

    // Si la moneda puesta no le sirve al método nuevo, se pasa a la primera que
    // sí. Dejarla inválida haría que el guardado fallara al llegar a la base
    // con un mensaje que no señala el selector que hay que corregir.
    const m = (metodos ?? []).find((x) => x.codigo === nuevo)
    const admitidas = monedasDe(m, todas)
    if (!admitidas.some((x) => x.valor === moneda) && admitidas[0]) {
      setConIgtf(admitidas[0].valor !== 'VES')
      setMoneda(admitidas[0].valor)
    }

    setDatos({})
  }

  const igtf = conIgtf ? Number(monto || 0) * 0.03 : 0
  const formato = moneda === 'VES' ? bolivares : dolares

  const guardar = async () => {
    await indicar.mutateAsync({
      orden_id: orden.id,
      metodo,
      moneda,
      monto: Number(monto),
      datos,
      nota,
      igtf: conIgtf,
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

        <label
          className={cn(
            'flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm sm:mt-6',
            conIgtf ? 'border-warning/30 bg-warning-soft' : 'border-hairline',
          )}
        >
          <input
            type="checkbox"
            checked={conIgtf}
            onChange={(e) => setConIgtf(e.target.checked)}
            className="accent-royal-600 mt-0.5 size-4 shrink-0"
          />
          <span className="text-ink/80">
            Causa <strong>IGTF del 3%</strong>
            {conIgtf ? (
              <>
                {' '}= <span className="tabular">{dolares(igtf)}</span>. Sale además del monto.
              </>
            ) : (
              <span className="text-ink/50"> — esta operación no lo causa.</span>
            )}
          </span>
        </label>
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
