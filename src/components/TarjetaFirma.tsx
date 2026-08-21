import { useState } from 'react'
import { PenLine } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { EditorDeFirma } from '@/components/EditorDeFirma'
import { useGuardarMiFirma, useMiFirma, useQuitarMiFirma } from '@/lib/api/firmas'
import type { OrigenDeFirma } from '@/lib/api/firmas'
import { fecha } from '@/lib/formato'

/*
  MI FIRMA

  Christopher: «cada usuario debería poder guardar su propia firma digital».
  Va en Mi cuenta y no en la administración de usuarios por la misma razón que
  la clave: es lo único de esta pantalla que es suyo y de nadie más. Que otro
  pueda cargar la firma de alguien es exactamente lo que no debe poder pasar,
  y por eso la función de la base tampoco recibe a quién: la saca de la sesión.

  Lo que la firma guardada hace, y lo que no, está dicho abajo en la pantalla.
  Callarlo dejaría creer que un papel firmado así prueba que la persona lo
  firmó, y no lo prueba: prueba que salió del sistema con su usuario. Lo que da
  fe es la auditoría.
*/

export function TarjetaFirma({ nombre }: { nombre: string }) {
  const { data: firma } = useMiFirma()
  const guardar = useGuardarMiFirma()
  const quitar = useQuitarMiFirma()

  const [abierto, setAbierto] = useState(false)
  const [nueva, setNueva] = useState<{ imagen: string; origen: OrigenDeFirma } | null>(null)

  const cerrar = () => {
    setAbierto(false)
    setNueva(null)
  }

  return (
    <Card>
      <CardHeader
        title="Mi firma"
        subtitle="Los papeles que emitas salen firmados con ella: órdenes de compra, actas, recibos."
        action={
          firma ? (
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
          */}
          <div className="border-hairline mt-4 rounded-[8px] border bg-white p-4">
            <img
              src={firma.imagen}
              alt="Tu firma"
              className="mx-auto block h-20 object-contain"
            />
            <div className="mx-auto mt-1 w-3/4 border-b border-neutral-300" />
            <p className="mt-1.5 text-center text-xs text-neutral-500">{nombre}</p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-ink/45 text-xs">
              Guardada el {fecha(firma.actualizada_en.slice(0, 10))}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger ml-auto"
              disabled={quitar.isPending}
              onClick={() => void quitar.mutateAsync(undefined)}
            >
              {quitar.isPending ? 'Quitando…' : 'Quitar la firma'}
            </Button>
          </div>
        </>
      ) : (
        <div className="mt-4">
          <p className="text-ink/55 text-sm">
            Todavía no has guardado ninguna. Mientras tanto, los papeles que emitas salen con la
            raya en blanco para firmarlos a mano.
          </p>
          <Button className="mt-3" icon={<PenLine />} onClick={() => setAbierto(true)}>
            Guardar mi firma
          </Button>
        </div>
      )}

      <p className="text-ink/40 mt-4 text-xs">
        Una firma guardada la puede copiar quien la vea, así que no prueba que firmaste: prueba
        que el papel salió del sistema con tu usuario. Lo que deja constancia de quién hizo qué es
        el registro de auditoría.
      </p>

      {quitar.error ? <ErrorDeCarga error={quitar.error} className="mt-3" /> : null}

      <Modal
        abierto={abierto}
        onCerrar={cerrar}
        ancho="lg"
        titulo={firma ? 'Cambiar mi firma' : 'Guardar mi firma'}
        descripcion="Trázala, escríbela o carga una foto de la que ya usas en papel."
        acciones={
          <>
            <Button variant="ghost" onClick={cerrar}>
              Cancelar
            </Button>
            <Button
              disabled={!nueva || guardar.isPending}
              onClick={async () => {
                if (!nueva) return
                await guardar.mutateAsync(nueva)
                cerrar()
              }}
            >
              {guardar.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </>
        }
      >
        <EditorDeFirma nombre={nombre} onListo={setNueva} />
        {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-3" /> : null}
      </Modal>
    </Card>
  )
}
