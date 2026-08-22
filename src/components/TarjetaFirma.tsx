import { useState } from 'react'
import { PenLine } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Interruptor } from '@/components/ui/Interruptor'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { EditorDeFirma } from '@/components/EditorDeFirma'
import {
  useFirmaDeEmpleado,
  useGuardarFirmaDeEmpleado,
  useGuardarMiFirma,
  useMiFirma,
  useQuitarFirmaDeEmpleado,
  useQuitarMiFirma,
  useUsarFirmaDeEmpleado,
  useUsarMiFirma,
} from '@/lib/api/firmas'
import type { OrigenDeFirma } from '@/lib/api/firmas'
import { fecha } from '@/lib/formato'

/*
  LA FIRMA, SEA DE QUIEN SEA

  Christopher pidió las dos: la del usuario que entra al sistema y la del
  trabajador que no. Es la misma tarjeta porque para quien la mira es lo mismo
  —una firma guardada, con su interruptor— y lo que cambia va debajo: quién
  puede tocarla y qué función la escribe.

  De ahí que reciba `de`. Con dos componentes casi iguales, el arreglo que se
  hiciera en uno tardaría meses en llegar al otro.
*/

type DeQuien = { tipo: 'usuario' } | { tipo: 'empleado'; id: number; puedeEditar: boolean }

export function TarjetaFirma({ nombre, de }: { nombre: string; de: DeQuien }) {
  const mia = useMiFirma()
  const suya = useFirmaDeEmpleado(de.tipo === 'empleado' ? de.id : null)

  const guardarMia = useGuardarMiFirma()
  const quitarMia = useQuitarMiFirma()
  const usarMia = useUsarMiFirma()
  const guardarSuya = useGuardarFirmaDeEmpleado()
  const quitarSuya = useQuitarFirmaDeEmpleado()
  const usarSuya = useUsarFirmaDeEmpleado()

  const esMia = de.tipo === 'usuario'
  const firma = esMia ? mia.data : suya.data
  const puedeEditar = esMia || de.puedeEditar

  const guardando = guardarMia.isPending || guardarSuya.isPending
  const quitando = quitarMia.isPending || quitarSuya.isPending
  const fallo = guardarMia.error ?? guardarSuya.error ?? quitarMia.error ?? quitarSuya.error

  const [abierto, setAbierto] = useState(false)
  const [nueva, setNueva] = useState<{ imagen: string; origen: OrigenDeFirma } | null>(null)

  const cerrar = () => {
    setAbierto(false)
    setNueva(null)
  }

  const guardar = async () => {
    if (!nueva) return
    if (esMia) await guardarMia.mutateAsync(nueva)
    else if (de.tipo === 'empleado')
      await guardarSuya.mutateAsync({ empleado_id: de.id, ...nueva })
    cerrar()
  }

  const quitar = () => {
    if (esMia) void quitarMia.mutateAsync(undefined)
    else if (de.tipo === 'empleado') void quitarSuya.mutateAsync({ empleado_id: de.id })
  }

  const encender = (usar: boolean) => {
    if (esMia) void usarMia.mutateAsync({ usar })
    else if (de.tipo === 'empleado') void usarSuya.mutateAsync({ empleado_id: de.id, usar })
  }

  return (
    <Card>
      <CardHeader
        title={esMia ? 'Mi firma' : 'Su firma'}
        subtitle={
          esMia
            ? 'Los papeles que emitas salen firmados con ella: órdenes de compra, actas, recibos.'
            : 'Sale impresa en sus recibos de pago y en lo que se le entregue firmado.'
        }
        action={
          firma && puedeEditar ? (
            <Button size="sm" variant="outline" onClick={() => setAbierto(true)}>
              Cambiarla
            </Button>
          ) : null
        }
      />

      {firma ? (
        <>
          {/*
            Sobre la raya, como saldrá en el papel. Verla sobre fondo blanco y
            con la raya debajo es lo que deja notar que quedó torcida o
            demasiado pequeña antes de que salga impresa cien veces.

            Apagada se ve igual pero atenuada: sigue guardada, y lo que cambia
            es que no se estampa.
          */}
          <div className="border-hairline mt-4 rounded-[8px] border bg-white p-4">
            <img
              src={firma.imagen}
              alt={esMia ? 'Tu firma' : `Firma de ${nombre}`}
              className={firma.usar ? 'mx-auto block h-20 object-contain' : 'mx-auto block h-20 object-contain opacity-30'}
            />
            <div className="mx-auto mt-1 w-3/4 border-b border-neutral-300" />
            <p className="mt-1.5 text-center text-xs text-neutral-500">{nombre}</p>
          </div>

          {puedeEditar ? (
            <Interruptor
              className="mt-4"
              encendido={firma.usar}
              onCambio={encender}
              etiqueta={firma.usar ? 'Se estampa en los papeles' : 'Guardada, pero sin usar'}
              detalle={
                firma.usar
                  ? 'Apágala para que los papeles salgan con la raya en blanco y se firmen a mano.'
                  : 'La firma sigue guardada. Enciéndela cuando quieras volver a usarla.'
              }
            />
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-ink/45 text-xs">
              Guardada el {fecha(firma.actualizada_en.slice(0, 10))}
            </span>
            {puedeEditar ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-danger ml-auto"
                disabled={quitando}
                onClick={quitar}
              >
                {quitando ? 'Quitando…' : 'Quitar la firma'}
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="mt-4">
          <p className="text-ink/55 text-sm">
            {esMia
              ? 'Todavía no has guardado ninguna. Mientras tanto, los papeles que emitas salen con la raya en blanco para firmarlos a mano.'
              : 'Todavía no tiene firma guardada. Sus papeles salen con la raya en blanco para que los firme a mano.'}
          </p>
          {puedeEditar ? (
            <Button className="mt-3" icon={<PenLine />} onClick={() => setAbierto(true)}>
              {esMia ? 'Guardar mi firma' : 'Guardar su firma'}
            </Button>
          ) : null}
        </div>
      )}

      <p className="text-ink/40 mt-4 text-xs">
        Una firma guardada la puede copiar quien la vea, así que no prueba que{' '}
        {esMia ? 'firmaste' : 'firmó'}: prueba que el papel salió del sistema. Lo que deja
        constancia de quién hizo qué es el registro de auditoría.
      </p>

      {fallo ? <ErrorDeCarga error={fallo} className="mt-3" /> : null}

      <Modal
        abierto={abierto}
        onCerrar={cerrar}
        ancho="lg"
        titulo={firma ? 'Cambiar la firma' : 'Guardar la firma'}
        descripcion={
          esMia
            ? 'Trázala, escríbela o carga una foto de la que ya usas en papel.'
            : `Trázala con ${nombre} delante, escríbela, o carga una foto de la que firmó en papel.`
        }
        acciones={
          <>
            <Button variant="ghost" onClick={cerrar}>
              Cancelar
            </Button>
            <Button disabled={!nueva || guardando} onClick={guardar}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </>
        }
      >
        <EditorDeFirma nombre={nombre} onListo={setNueva} />
        {fallo ? <ErrorDeCarga error={fallo} className="mt-3" /> : null}
      </Modal>
    </Card>
  )
}
