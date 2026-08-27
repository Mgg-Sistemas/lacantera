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
import { bolivares, dolares, tasa as fmtTasa } from '@/lib/formato'
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

  /*
    LA CUENTA ES LA DE `indicar_pago`, CALCADA. NO OTRA QUE SE LE PAREZCA.

    Esto sumaba `i.monto` de cada instrucción sin mirar la moneda: una orden en
    dólares que recibía un pago en bolívares sumaba mil dólares con ciento
    veintiséis mil bolívares y decía que no quedaba nada por pagar.

    El primer arreglo lo pasó todo por `monto_usd`, y estaba igual de mal por
    otro sitio. `monto_usd` divide por la `tasa_usd` DEL DÍA DE CADA
    INSTRUCCIÓN, y la base no hace eso: reconvierte con la tasa congelada de la
    ORDEN. El sobrante es el cociente entre las dos tasas, y el tope solo
    tolera un céntimo — así que cualquier orden que no se pagara el mismo día
    en que se creó rebotaba con «se pagaría más que el total de la orden».
    Justo el caso que esta pantalla existe para permitir.

    La regla de la base, literal, es esta:

      misma moneda que la orden  ->  el monto tal cual, sin convertir
      otra moneda                ->  monto x su tasa / la tasa de la orden

    Y `monto_bs` es exactamente `monto x tasa`, así que dividirlo entre la tasa
    de la orden da el segundo caso sin inventar nada.
  */
  const tasaOrden = Number(orden.tasa) || 0

  const comprometido = orden.instrucciones
    .filter((i) => i.estado === 'POR_PAGAR' || i.estado === 'PAGADA')
    .reduce(
      (s, i) =>
        s +
        (i.moneda === orden.moneda
          ? Number(i.monto)
          : tasaOrden > 0
            ? Number(i.monto_bs) / tasaOrden
            : 0),
      0,
    )

  const totalOrden = Number(orden.total) || 0
  const pendiente = Math.max(totalOrden - comprometido, 0)

  /*
    Lo que falta, partido en base e IVA. LA BASE SE CUBRE PRIMERO.

    Esto prorrateaba —`iva * (pendiente / total)`— y era una trampa silenciosa:
    después de instruir la base entera, el botón rotulado «Solo el IVA» ofrecía
    veintidós dólares de un IVA de ciento sesenta. La base no lo frena, porque
    no se pasa del tope: se instruía un pago corto al proveedor y nadie avisaba.

    Prorratear supone que cada pago cubrió base e IVA en proporción, que es lo
    contrario de lo que hace la casa: primero se cancela la base en divisa y
    después el IVA en bolívares. Así que se descuenta en ese orden, y las dos
    cifras siempre suman lo que falta.
  */
  const ivaOrden = Number(orden.iva) || 0
  const baseOrden = Math.max(totalOrden - ivaOrden, 0)
  const cubierto = Math.max(totalOrden - pendiente, 0)
  const basePendiente = Math.max(baseOrden - Math.min(cubierto, baseOrden), 0)
  const ivaPendiente = Math.max(pendiente - basePendiente, 0)

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
  const formatoOrden = orden.moneda === 'VES' ? bolivares : dolares

  /*
    Pasar un importe de la moneda de la orden a la que esté elegida.

    Se hace al revés de la comprobación del tope, que es lo que obliga a que
    cuadre: la base va a calcular `monto x tasa_de_esa_moneda / tasa_de_la_orden`
    y compararlo con lo que falta, así que para proponer un importe X hay que
    escribir `X x tasa_de_la_orden / tasa_de_esa_moneda`.

    SOLO SE CONVIERTE A BOLÍVARES, y no por comodidad. La tasa del bolívar es 1
    por definición —son bolívares por bolívar—, así que esa conversión es exacta
    sin consultar nada. Para las demás divisas haría falta la tasa de hoy de esa
    moneda, que esta pantalla no tiene; proponer un número aproximado sería
    ofrecer un pago que la base va a rechazar por un céntimo.

    Es además el único cruce que hace falta: la casa paga la base en divisa y el
    IVA en bolívares.
  */
  const puedeConvertir = moneda === orden.moneda || moneda === 'VES'

  const enLaMonedaElegida = (importeEnLaOrden: number) => {
    if (moneda === orden.moneda) return importeEnLaOrden
    if (moneda === 'VES') return importeEnLaOrden * tasaOrden
    return importeEnLaOrden
  }

  const proponer = (importeEnLaOrden: number) =>
    setMonto(enLaMonedaElegida(importeEnLaOrden).toFixed(2))

  const puedeRepartir = puedeConvertir && ivaPendiente > 0.01 && basePendiente > 0.01

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
          hint={
            moneda === orden.moneda
              ? `Falta por pagar: ${formatoOrden(pendiente)}`
              : `Falta por pagar: ${formatoOrden(pendiente)} · en ${moneda}, ${formato(enLaMonedaElegida(pendiente))}`
          }
        />

        {/*
          PARTIR EL PAGO EN BASE E IVA.

          Es como se compra aquí: la base se cancela en divisa y el IVA en
          bolívares a la tasa oficial. Se hacía ya --dos instrucciones sobre la
          misma orden, cada una en su moneda-- pero echando las dos cuentas a
          mano, y una de ellas es una conversión con la tasa del día.

          Los tres botones solo escriben en el campo de arriba. No deciden
          nada: el monto que vale es el que quede escrito, y se puede corregir.
        */}
        {puedeRepartir ? (
          <div className="sm:col-span-2">
            <p className="text-ink/45 mb-1.5 text-xs">Repartir lo que falta</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => proponer(pendiente)}>
                Todo · {formato(enLaMonedaElegida(pendiente))}
              </Button>
              <Button size="sm" variant="outline" onClick={() => proponer(basePendiente)}>
                Solo la base · {formato(enLaMonedaElegida(basePendiente))}
              </Button>
              <Button size="sm" variant="outline" onClick={() => proponer(ivaPendiente)}>
                Solo el IVA · {formato(enLaMonedaElegida(ivaPendiente))}
              </Button>
            </div>

            {moneda !== orden.moneda ? (
              <p className="text-ink/45 mt-1.5 text-xs">
                Convertido con la tasa que la orden lleva congelada, que es contra la que el sistema
                comprueba lo que falta: <span className="tabular">Bs {fmtTasa(orden.tasa)}</span> por{' '}
                {orden.moneda}.
              </p>
            ) : null}
          </div>
        ) : null}

        {!puedeConvertir ? (
          <p className="text-ink/45 sm:col-span-2 text-xs leading-relaxed">
            El reparto entre base e IVA solo se calcula pagando en {orden.moneda} o en bolívares.
            En {moneda}, escribe el monto a mano: hace falta la tasa del día de esa moneda para que
            la cuenta cuadre con la del sistema.
          </p>
        ) : null}

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
