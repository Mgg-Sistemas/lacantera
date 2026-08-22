import { useEffect, useState } from 'react'
import { Fingerprint, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { useSesion } from '@/lib/sesion'
import {
  activarHuella,
  desactivarHuella,
  enCastellano,
  estadoGuardado,
  hayHuella,
} from '@/lib/huella'

/**
 * Activar la huella en este equipo.
 *
 * Va en Mi cuenta y no en Configuración porque no se configura para nadie más:
 * cada quien la activa en el aparato desde el que trabaja. Que sea por equipo
 * no es una limitación que haya que disimular, es lo que de verdad ocurre —la
 * llave vive dentro del aparato— y decirlo evita que alguien la active en la
 * oficina y se quede esperando que el teléfono la reconozca.
 */
export function TarjetaHuella() {
  const { usuario, nombre } = useSesion()

  const [disponible, setDisponible] = useState<boolean | null>(null)
  const [activa, setActiva] = useState(false)
  const [duena, setDuena] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [fallo, setFallo] = useState('')
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    void hayHuella().then(setDisponible)
    const guardado = estadoGuardado()
    setActiva(guardado.activa)
    setDuena(guardado.usuario)
  }, [])

  const activar = async () => {
    setFallo('')
    setAviso('')
    setTrabajando(true)
    try {
      // El pase que se va a guardar cifrado es el de la sesión abierta.
      const { data } = await supabase.auth.getSession()
      const pase = data.session?.refresh_token
      if (!pase) throw new Error('No hay una sesión abierta que guardar. Vuelve a entrar.')

      await activarHuella({
        usuario,
        nombre,
        refreshToken: pase,
      })

      setActiva(true)
      setDuena(usuario)
      setAviso('Listo. En este equipo ya puedes entrar con la huella.')
    } catch (e) {
      /*
        El mensaje ya viene en castellano desde `huella.ts`.

        Aquí se intentaba silenciar la cancelación buscando «NotAllowed» dentro
        del texto del error, pero Chrome lo escribe «not allowed» —con espacio y
        en minúscula— así que la comprobación nunca acertaba y pasaba entero a
        la pantalla, enlace a la especificación incluido.

        Y silenciarlo del todo tampoco servía: WebAuthn devuelve el mismo error
        cuando alguien cancela, cuando se agota el minuto y cuando el aparato ni
        llega a preguntar. Callar los tres deja al que no pudo activarla mirando
        un botón que no hace nada.
      */
      setFallo(e instanceof Error ? e.message : enCastellano(e))
    } finally {
      setTrabajando(false)
    }
  }

  const desactivar = async () => {
    setFallo('')
    setAviso('')
    setTrabajando(true)
    try {
      await desactivarHuella()
      setActiva(false)
      setDuena('')
      setAviso('Quitada de este equipo. Aquí se entra con la clave.')
    } finally {
      setTrabajando(false)
    }
  }

  if (disponible === null) return null

  return (
    <Card>
      <CardHeader
        title="Entrar con la huella"
        subtitle="Se activa por equipo. En el teléfono hay que activarla aparte."
      />

      <div className="mt-4 flex items-start gap-3">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-[8px] ${
            activa ? 'bg-success/14 text-success' : 'bg-ink/6 text-ink/45'
          }`}
        >
          <Fingerprint className="size-5" />
        </div>

        <div className="min-w-0 flex-1 text-sm">
          {!disponible ? (
            <p className="text-ink/60">
              Este equipo no tiene lector de huella, o el navegador todavía no sabe usarlo. En un
              teléfono suele funcionar aunque aquí no.
            </p>
          ) : activa ? (
            <p className="text-ink/70">
              Activada en este equipo
              {duena && duena !== usuario ? (
                <>
                  {' '}
                  a nombre de <strong className="text-ink/90">{duena}</strong>
                </>
              ) : null}
              . Al entrar te la pedirá en vez de la clave.
            </p>
          ) : (
            <p className="text-ink/70">
              Tu huella no sale del aparato: ni el sistema ni nadie la ve. Lo que se guarda aquí es
              tu pase de sesión cifrado, y hace falta tu dedo para abrirlo.
            </p>
          )}

          {activa ? (
            <p className="text-ink/45 mt-2 text-xs">
              Si pierdes este equipo, cambia tu clave: eso la desactiva aquí y en cualquier otro
              aparato donde la hayas puesto.
            </p>
          ) : null}

          {aviso ? <p className="text-success mt-2 text-xs">{aviso}</p> : null}
          {fallo ? (
            <p className="text-danger mt-2 flex items-start gap-1.5 text-xs">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              {fallo}
            </p>
          ) : null}
        </div>
      </div>

      {disponible ? (
        <div className="mt-5 flex justify-end">
          {activa ? (
            <Button variant="outline" onClick={() => void desactivar()} disabled={trabajando}>
              {trabajando ? 'Quitando…' : 'Quitar de este equipo'}
            </Button>
          ) : (
            <Button
              icon={<ShieldCheck className="size-[18px]" />}
              onClick={() => void activar()}
              disabled={trabajando}
            >
              {trabajando ? 'Esperando el dedo…' : 'Activar la huella'}
            </Button>
          )}
        </div>
      ) : null}
    </Card>
  )
}
