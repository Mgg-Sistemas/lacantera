import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { METODOS_PAGO, useIndicarPago } from '@/lib/api/compras'
import type { DatosPago, Orden } from '@/lib/api/compras'
import { bolivares, dolares } from '@/lib/formato'
import { BANCOS } from '@/lib/bancos'

interface Props {
  abierto: boolean
  onCerrar: () => void
  orden: Orden
}

export function ModalPago({ abierto, onCerrar, orden }: Props) {
  const indicar = useIndicarPago()

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

  const cambiar = (cambios: DatosPago) => setDatos((d) => ({ ...d, ...cambios }))

  // El pago móvil solo existe en bolívares y Binance no liquida en bolívares.
  const monedasPosibles =
    metodo === 'PAGO_MOVIL'
      ? [{ valor: 'VES', etiqueta: 'Bolívares' }]
      : metodo === 'BINANCE'
        ? [{ valor: 'USD', etiqueta: 'Dólares (USDT)' }]
        : [
            { valor: 'USD', etiqueta: 'Dólares' },
            { valor: 'VES', etiqueta: 'Bolívares' },
          ]

  const cambiarMetodo = (nuevo: string) => {
    setMetodo(nuevo)
    if (nuevo === 'PAGO_MOVIL') setMoneda('VES')
    if (nuevo === 'BINANCE') setMoneda('USD')
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Cómo se paga"
          value={metodo}
          onChange={(e) => cambiarMetodo(e.target.value)}
          opciones={METODOS_PAGO}
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

      {metodo === 'TRANSFERENCIA' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Banco"
            vacio="Elige el banco"
            value={datos.banco ?? ''}
            onChange={(e) => cambiar({ banco: e.target.value })}
            opciones={BANCOS.map((b) => ({ valor: b, etiqueta: b }))}
          />
          <Input
            label="Número de cuenta"
            inputMode="numeric"
            placeholder="0102 0000 00 0000000000"
            value={datos.numero_cuenta ?? ''}
            onChange={(e) => cambiar({ numero_cuenta: e.target.value })}
          />
          <Input
            label="Titular de la cuenta"
            value={datos.titular ?? ''}
            onChange={(e) => cambiar({ titular: e.target.value })}
          />
          <Input
            label="Cédula o RIF del titular"
            placeholder="J-12345678-9"
            value={datos.documento ?? ''}
            onChange={(e) => cambiar({ documento: e.target.value })}
          />
        </div>
      ) : null}

      {metodo === 'PAGO_MOVIL' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Banco"
            vacio="Elige el banco"
            value={datos.banco ?? ''}
            onChange={(e) => cambiar({ banco: e.target.value })}
            opciones={BANCOS.map((b) => ({ valor: b, etiqueta: b }))}
          />
          <Input
            label="Teléfono"
            inputMode="tel"
            placeholder="0414 1234567"
            value={datos.telefono ?? ''}
            onChange={(e) => cambiar({ telefono: e.target.value })}
          />
          <Input
            label="Cédula o RIF"
            placeholder="V-12345678"
            value={datos.documento ?? ''}
            onChange={(e) => cambiar({ documento: e.target.value })}
          />
          <Input
            label="A nombre de"
            value={datos.titular ?? ''}
            onChange={(e) => cambiar({ titular: e.target.value })}
          />
        </div>
      ) : null}

      {metodo === 'BINANCE' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Correo o Pay ID de Binance"
            value={datos.correo_binance ?? ''}
            onChange={(e) => cambiar({ correo_binance: e.target.value })}
          />
          <Input
            label="Dirección de la billetera"
            hint="Si se paga por red en vez de Pay ID"
            value={datos.numero_cuenta ?? ''}
            onChange={(e) => cambiar({ numero_cuenta: e.target.value })}
          />
          <Select
            label="Red"
            vacio="Sin especificar"
            value={datos.red_cripto ?? ''}
            onChange={(e) => cambiar({ red_cripto: e.target.value })}
            opciones={[
              { valor: 'TRC20', etiqueta: 'TRC20 (Tron)' },
              { valor: 'BEP20', etiqueta: 'BEP20 (BNB Chain)' },
              { valor: 'ERC20', etiqueta: 'ERC20 (Ethereum)' },
              { valor: 'PAY', etiqueta: 'Binance Pay (interno)' },
            ]}
          />
          <Input
            label="Titular de la cuenta"
            value={datos.titular ?? ''}
            onChange={(e) => cambiar({ titular: e.target.value })}
          />
        </div>
      ) : null}

      {metodo === 'EFECTIVO' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Quién recibe"
            value={datos.receptor ?? ''}
            onChange={(e) => cambiar({ receptor: e.target.value })}
          />
          <Input
            label="Cédula de quien recibe"
            placeholder="V-12345678"
            value={datos.documento ?? ''}
            onChange={(e) => cambiar({ documento: e.target.value })}
          />
        </div>
      ) : null}

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
