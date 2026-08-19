import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useCuentas, useRegistrarPago } from '@/lib/api/tesoreria'
import { useMetodosPago, nombreDe } from '@/lib/api/metodosPago'
import { dinero } from '@/lib/formato'

/**
 * Lo que hace falta saber para pagar, venga de la compra o de la cola de
 * tesorería. Las dos pantallas llaman al mismo formulario: si cada una tuviera
 * el suyo, un día pedirían cosas distintas para la misma operación.
 */
export interface InstruccionPagable {
  id: number
  metodo: string
  moneda: string
  monto: string
  igtf_aplica: boolean
  igtf_monto: string
  banco: string | null
  numero_cuenta: string | null
  titular: string | null
  telefono: string | null
  correo_binance: string | null
  receptor: string | null
}

export function ModalRegistrarPago({
  instruccion,
  onCerrar,
}: {
  instruccion: InstruccionPagable
  onCerrar: () => void
}) {
  const { data: metodos } = useMetodosPago()
  const { data: cuentas } = useCuentas(true)
  const pagar = useRegistrarPago()

  const [cuentaId, setCuentaId] = useState('')
  const [referencia, setReferencia] = useState('')
  const [fecha, setFecha] = useState('')

  // Solo se ofrecen las cuentas en la moneda de la instrucción. Pagar 500 $
  // desde una cuenta en bolívares no es una elección: es un error que la base
  // rechazaría, y es mejor no llegar a proponerlo.
  const compatibles = useMemo(
    () => (cuentas ?? []).filter((c) => c.moneda === instruccion.moneda),
    [cuentas, instruccion.moneda],
  )

  const cuenta = compatibles.find((c) => String(c.id) === cuentaId)
  const total = Number(instruccion.monto) + Number(instruccion.igtf_monto)
  const alcanza = !cuenta || cuenta.permite_sobregiro || Number(cuenta.saldo) >= total

  const destino =
    instruccion.numero_cuenta ??
    instruccion.telefono ??
    instruccion.correo_binance ??
    instruccion.receptor

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Registrar el pago"
      descripcion={`${nombreDe(metodos, instruccion.metodo)} por ${dinero(instruccion.moneda, instruccion.monto)}`}
      ancho="sm"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={pagar.isPending || !cuentaId}
            onClick={async () => {
              await pagar.mutateAsync({
                instruccion_id: instruccion.id,
                cuenta_id: Number(cuentaId),
                referencia,
                fecha,
              })
              onCerrar()
            }}
          >
            {pagar.isPending ? 'Guardando…' : 'Confirmar el pago'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="border-hairline bg-canvas rounded-card border p-3 text-sm">
          <p className="text-ink/70">
            {instruccion.banco ? `${instruccion.banco} · ` : ''}
            {destino}
          </p>
          {instruccion.titular ? (
            <p className="text-ink/50 text-xs">{instruccion.titular}</p>
          ) : null}
          {instruccion.igtf_aplica ? (
            <p className="text-warning mt-1.5 text-xs">
              Con IGTF salen {dinero(instruccion.moneda, total)} —{' '}
              {dinero(instruccion.moneda, instruccion.igtf_monto)} de impuesto.
            </p>
          ) : null}
        </div>

        <Select
          label="De qué cuenta sale"
          vacio={compatibles.length ? 'Elige la cuenta' : `No hay cuentas en ${instruccion.moneda}`}
          value={cuentaId}
          onChange={(e) => setCuentaId(e.target.value)}
          opciones={compatibles.map((c) => ({
            valor: String(c.id),
            etiqueta: `${c.nombre} — ${dinero(c.moneda, c.saldo)}`,
          }))}
          hint={
            compatibles.length
              ? 'El saldo baja al confirmar.'
              : `Crea una cuenta en ${instruccion.moneda} en Tesorería › Bancos y cajas.`
          }
        />

        {cuenta && !alcanza ? (
          <p className="border-warning/30 bg-warning-soft text-ink/80 rounded-[6px] border p-2.5 text-xs">
            En esa cuenta hay {dinero(cuenta.moneda, cuenta.saldo)} y el pago es de{' '}
            {dinero(instruccion.moneda, total)}. Si el dinero ya está, falta registrar el
            ingreso o el saldo de apertura.
          </p>
        ) : null}

        <Input
          label={
            instruccion.metodo === 'EFECTIVO'
              ? 'Referencia (opcional en efectivo)'
              : 'Número de referencia'
          }
          autoFocus
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
          hint="El número que devolvió el banco o la plataforma."
        />

        <Input
          label="Fecha del pago"
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          hint="Vacío es hoy. Es la fecha que aparece en el estado de cuenta."
        />

        {pagar.error ? <ErrorDeCarga error={pagar.error} /> : null}
      </div>
    </Modal>
  )
}
