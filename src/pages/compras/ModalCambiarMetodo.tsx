import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { CamposDePago } from '@/components/CamposDePago'
import { useCambiarMetodoDePago } from '@/lib/api/compras'
import { useMetodosPago, opcionesDe } from '@/lib/api/metodosPago'
import type { DatosPago, InstruccionPago } from '@/lib/api/compras'

/*
  CAMBIAR POR DÓNDE SE PAGA, SIN DESHACER LA APROBACIÓN

  Lo pidió la líder: una orden ya aprobada puede necesitar otro método de pago
  —se equivocaron al armarlo, la cuenta no tiene fondos, el proveedor cambió la
  seña—. Hasta ahora la única salida era devolver la instrucción a compras, que
  retrocede la orden entera y obliga a rehacer un paso que estaba bien.

  NO ES EL MODAL DE PAGO CON OTRO TÍTULO

  Aquel elige monto, moneda e IGTF, y de eso aquí no se toca nada: cambia por
  dónde sale el dinero, no cuánto. Reutilizarlo habría significado enseñar tres
  campos que hay que ignorar y confiar en que nadie los toque.

  LA MONEDA NO SE ELIGE, Y POR ESO SE FILTRAN LOS MÉTODOS

  La instrucción ya va en dólares o en bolívares y eso no cambia. El pago móvil
  solo funciona en bolívares y Zelle solo fuera de ellos, así que ofrecer los
  siete métodos sería ofrecer cuatro que la base va a rechazar. Se ofrecen los
  que sirven para la moneda que ya tiene.
*/

interface Props {
  abierto: boolean
  onCerrar: () => void
  instruccion: InstruccionPago
}

export function ModalCambiarMetodo({ abierto, onCerrar, instruccion }: Props) {
  const cambiar = useCambiarMetodoDePago()
  const { data: metodos } = useMetodosPago()

  const [metodo, setMetodo] = useState(instruccion.metodo as string)
  const [motivo, setMotivo] = useState('')

  /*
    Los datos arrancan con lo que ya hay.

    El caso más frecuente no es cambiar de método sino corregir la cuenta dentro
    del mismo: obligar a reescribir el banco y el titular que ya estaban bien es
    la forma más fácil de que se cuele una errata en el número de cuenta.
  */
  const [datos, setDatos] = useState<DatosPago>({
    banco: instruccion.banco ?? undefined,
    numero_cuenta: instruccion.numero_cuenta ?? undefined,
    titular: instruccion.titular ?? undefined,
    documento: instruccion.documento ?? undefined,
    telefono: instruccion.telefono ?? undefined,
    correo_binance: instruccion.correo_binance ?? undefined,
    red_cripto: instruccion.red_cripto ?? undefined,
    receptor: instruccion.receptor ?? undefined,
  })

  const posibles = (metodos ?? []).filter((m) =>
    instruccion.moneda === 'VES' ? m.moneda_regla !== 'NUNCA_VES' : m.moneda_regla !== 'SOLO_VES',
  )

  const elegido = posibles.find((m) => m.codigo === metodo)

  const cambiarMetodo = (nuevo: string) => {
    setMetodo(nuevo)
    // Al cambiar de método se limpian los datos: el número de cuenta de una
    // transferencia no significa nada en un pago en efectivo, y dejarlo puesto
    // es cómo se acaba pagando a quien no era.
    if (nuevo !== instruccion.metodo) setDatos({})
  }

  const guardar = async () => {
    await cambiar.mutateAsync({ instruccion_id: instruccion.id, metodo, datos, motivo })
    onCerrar()
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Cambiar el método de pago"
      descripcion="La orden sigue aprobada y en la cola. Solo cambia por dónde sale el dinero."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            onClick={() => void guardar()}
            disabled={cambiar.isPending || motivo.trim().length < 5}
          >
            {cambiar.isPending ? 'Guardando…' : 'Guardar el cambio'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Select
          label="Cómo se paga"
          value={metodo}
          onChange={(e) => cambiarMetodo(e.target.value)}
          opciones={opcionesDe(posibles)}
          hint={`El monto y la moneda no cambian: ${instruccion.monto} ${instruccion.moneda}.`}
        />

        <CamposDePago
          metodo={elegido}
          datos={datos}
          onCambiar={(cambios) => setDatos((d) => ({ ...d, ...cambios }))}
        />

        {/*
          El motivo es obligatorio, y lo dice el botón además del campo.

          Es lo único que va a leer quien pague, y es lo que distingue una
          corrección de un cambio de destinatario. La base lo exige igual; aquí
          se pide antes para no gastarle a nadie un viaje al servidor.
        */}
        <Textarea
          label="Por qué se cambia"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          placeholder="La cuenta de Banesco no tiene fondos y el proveedor aceptó pago móvil."
          hint="Queda en el historial de la compra y se le avisa a quien tenga que pagar."
        />
      </div>

      {cambiar.error ? <ErrorDeCarga error={cambiar.error} className="mt-4" /> : null}
    </Modal>
  )
}
