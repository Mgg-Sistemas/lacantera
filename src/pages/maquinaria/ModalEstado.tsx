import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import {
  ESTADOS_MAQUINA,
  ETIQUETA_ESTADO,
  useCambiarEstadoMaquina,
  type Maquina,
} from '@/lib/api/maquinaria'
import { cn } from '@/lib/cn'

/**
 * Mover una máquina entre activa, en espera y fuera de servicio.
 *
 * EL TALLER NO ESTÁ EN LA LISTA, Y ESO ES LO IMPORTANTE
 *
 * A «en el taller» se entra abriendo la orden de mantenimiento y se sale
 * cerrándola. Ofrecerlo aquí sería una puerta lateral que se salta el contador
 * de horas, el descuento de repuestos y el registro de qué se le hizo — es
 * decir, todo lo que hace que el mantenimiento sirva de algo.
 *
 * La base lo rechaza igual. Pero una pantalla que ofrece algo que la base va a
 * negar enseña al usuario a desconfiar de la pantalla.
 */
export function ModalEstado({
  abierto,
  maquina,
  onCerrar,
}: {
  abierto: boolean
  maquina: Maquina | null
  onCerrar: () => void
}) {
  const cambiar = useCambiarEstadoMaquina()
  const [estado, setEstado] = useState('')
  const [motivo, setMotivo] = useState('')

  useEffect(() => {
    if (!abierto) return
    setEstado(maquina?.estado ?? '')
    setMotivo('')
  }, [abierto, maquina])

  if (!maquina) return null

  const enTaller = maquina.estado === 'EN_MANTENIMIENTO'
  const cambio = estado !== '' && estado !== maquina.estado
  // Sacar una máquina de la flota o dejarla parada sin fecha se explica; volver
  // a ponerla a trabajar no necesita justificación escrita.
  const exigeMotivo = estado === 'FUERA_DE_SERVICIO' || estado === 'DESINCORPORADA'
  const valido = cambio && (!exigeMotivo || motivo.trim().length >= 4)

  const enviar = async () => {
    await cambiar.mutateAsync({ id: maquina.id, estado, motivo: motivo.trim() || null })
    onCerrar()
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Estado de ${maquina.nombre}`}
      descripcion={`Ahora mismo está ${ETIQUETA_ESTADO[maquina.estado].toLowerCase()}.`}
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            onClick={() => void enviar()}
            disabled={!valido || cambiar.isPending || enTaller}
          >
            {cambiar.isPending ? 'Guardando…' : 'Cambiar'}
          </Button>
        </>
      }
    >
      {enTaller ? (
        <p className="border-warning/30 bg-warning-soft text-ink/80 rounded-[6px] border p-3 text-sm leading-relaxed">
          Está en el taller. De ahí no se sale cambiando el estado: se sale cerrando su orden de
          mantenimiento, que es donde se anota qué se le hizo y qué repuestos llevó.
        </p>
      ) : (
        <>
          <div className="grid gap-2">
            {ESTADOS_MAQUINA.map((e) => {
              const actual = e.valor === maquina.estado
              return (
                <button
                  key={e.valor}
                  type="button"
                  onClick={() => setEstado(e.valor)}
                  className={cn(
                    'rounded-card border p-3 text-left transition-colors',
                    estado === e.valor
                      ? 'border-royal-600 bg-royal-600/5'
                      : 'border-hairline hover:border-royal-300',
                  )}
                >
                  <p className="text-ink/90 text-sm font-medium">
                    {e.etiqueta}
                    {actual ? <span className="text-ink/40 ml-2 text-xs">· ahora</span> : null}
                  </p>
                  <p className="text-ink/50 mt-0.5 text-xs leading-relaxed">{e.detalle}</p>
                </button>
              )
            })}
          </div>

          {exigeMotivo ? (
            <div className="mt-4">
              <Textarea
                label="Por qué"
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                hint="Queda en la ficha de la máquina y se avisa a operaciones."
              />
            </div>
          ) : null}

          {cambiar.error ? <ErrorDeCarga error={cambiar.error} className="mt-3" /> : null}
        </>
      )}
    </Modal>
  )
}
