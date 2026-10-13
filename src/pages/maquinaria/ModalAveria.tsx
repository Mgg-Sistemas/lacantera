import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { FotosDeCarga } from '@/components/FotosDeCarga'
import {
  CATEGORIAS_AVERIA,
  useAnularAveria,
  useAverias,
  useMarcarAveriaAtendida,
  useReportarAveria,
  type Averia,
  type Maquina,
} from '@/lib/api/maquinaria'
import { fechaHora } from '@/lib/formato'
import { etiquetaDeMaquina } from '@/lib/maquina'

/**
 * Averías de una máquina, aparte del mantenimiento.
 *
 * LA AVERÍA Y LA ORDEN DE TALLER SON DOS PAPELES DISTINTOS.
 *
 * Clonado del módulo de Servicios de SOS La Guaira —sin su membrete—: se
 * reporta lo que se dañó en el momento en que se nota, sin esperar a que
 * alguien decida qué hacer con eso. Queda pendiente hasta que una orden de
 * taller la atiende —al entrar al taller, en «Meter al taller»— o se marca
 * atendida aquí mismo si se resolvió sin pasar por el taller.
 *
 * Reportarla NUNCA cambia el estado operativo de la máquina: eso se decide
 * aparte, en «Cambiar estado». Son dos preguntas distintas —¿se resolvió el
 * papel? / ¿la máquina sirve hoy?—, y mezclarlas deja una pila de reportes
 * sin cerrar distorsionando si la flota está sana.
 */
const TONO_AVERIA: Record<Averia['estado'], 'danger' | 'success' | 'neutral'> = {
  PENDIENTE: 'danger',
  ATENDIDA: 'success',
  ANULADA: 'neutral',
}

const ETIQUETA_AVERIA: Record<Averia['estado'], string> = {
  PENDIENTE: 'Pendiente',
  ATENDIDA: 'Atendida',
  ANULADA: 'Anulada',
}

export function ModalAveria({
  abierto,
  maquina,
  puedeEscribir,
  onCerrar,
}: {
  abierto: boolean
  maquina: Maquina | null
  puedeEscribir: boolean
  onCerrar: () => void
}) {
  const { data: averias } = useAverias(maquina?.id ?? null)
  const reportar = useReportarAveria()
  const marcarAtendida = useMarcarAveriaAtendida()
  const anular = useAnularAveria()

  const [categoria, setCategoria] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [anulando, setAnulando] = useState<Averia | null>(null)
  const [motivoAnulacion, setMotivoAnulacion] = useState('')

  if (!maquina) return null

  const limpiar = () => {
    setCategoria('')
    setDescripcion('')
  }

  const reportarAveria = async () => {
    await reportar.mutateAsync({
      maquina_id: maquina.id,
      categoria,
      descripcion: descripcion.trim(),
    })
    limpiar()
  }

  const pendientes = (averias ?? []).filter((a) => a.estado === 'PENDIENTE')
  const resueltas = (averias ?? []).filter((a) => a.estado !== 'PENDIENTE')

  return (
    <>
      <Modal
        abierto={abierto}
        onCerrar={onCerrar}
        ancho="lg"
        titulo={`Averías de ${etiquetaDeMaquina(maquina)}`}
        descripcion="Lo que se dañó, aparte del taller que lo atiende. No cambia el estado de la máquina."
        acciones={
          <Button variant="ghost" onClick={onCerrar}>
            Cerrar
          </Button>
        }
      >
        {puedeEscribir ? (
          <div className="border-hairline rounded-card border p-4">
            <p className="text-ink/85 mb-3 text-sm font-semibold">Reportar una avería</p>
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
              <Select
                label="Categoría"
                vacio="Seleccione"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                opciones={CATEGORIAS_AVERIA}
              />
              <Textarea
                label="Qué pasó"
                rows={2}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                disabled={!categoria || descripcion.trim().length < 3 || reportar.isPending}
                onClick={() => void reportarAveria()}
              >
                {reportar.isPending ? 'Guardando…' : 'Reportar'}
              </Button>
            </div>
            {reportar.error ? <ErrorDeCarga error={reportar.error} className="mt-2" /> : null}
          </div>
        ) : null}

        {pendientes.length === 0 && resueltas.length === 0 ? (
          <p className="text-ink/50 mt-4 text-sm">Sin averías reportadas.</p>
        ) : null}

        {pendientes.length > 0 ? (
          <div className="mt-4">
            <p className="text-ink/55 mb-2 text-xs font-medium tracking-wide uppercase">
              Pendientes
            </p>
            <ul className="divide-hairline divide-y">
              {pendientes.map((a) => (
                <li key={a.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-ink/85 font-mono text-xs">{a.numero}</span>
                    <Chip tone={TONO_AVERIA[a.estado]}>{ETIQUETA_AVERIA[a.estado]}</Chip>
                    <span className="text-ink/45 text-2xs">
                      {CATEGORIAS_AVERIA.find((c) => c.valor === a.categoria)?.etiqueta ?? a.categoria}
                    </span>
                    <span className="text-ink/40 ml-auto text-2xs">{fechaHora(a.reportada_en)}</span>
                  </div>
                  <p className="text-ink/75 mt-1 text-sm leading-relaxed">{a.descripcion}</p>
                  {puedeEscribir ? (
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={marcarAtendida.isPending}
                        onClick={() => marcarAtendida.mutate({ id: a.id })}
                      >
                        Marcar atendida
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger"
                        onClick={() => {
                          setAnulando(a)
                          setMotivoAnulacion('')
                        }}
                      >
                        Anular
                      </Button>
                    </div>
                  ) : null}
                  <div className="mt-2">
                    <FotosDeCarga origen="AVERIA" referencia={a.numero} puedeAnadir={puedeEscribir} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {resueltas.length > 0 ? (
          <div className="mt-4">
            <p className="text-ink/55 mb-2 text-xs font-medium tracking-wide uppercase">
              Resueltas
            </p>
            <ul className="divide-hairline divide-y">
              {resueltas.map((a) => (
                <li key={a.id} className="py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-ink/70 font-mono text-xs">{a.numero}</span>
                    <Chip tone={TONO_AVERIA[a.estado]}>{ETIQUETA_AVERIA[a.estado]}</Chip>
                    <span className="text-ink/45 text-2xs">
                      {CATEGORIAS_AVERIA.find((c) => c.valor === a.categoria)?.etiqueta ?? a.categoria}
                    </span>
                    {a.mantenimiento_numero ? (
                      <span className="text-ink/45 text-2xs">· atendida en {a.mantenimiento_numero}</span>
                    ) : null}
                  </div>
                  <p className="text-ink/60 mt-1 text-sm leading-relaxed">{a.descripcion}</p>
                  {a.motivo_anulacion ? (
                    <p className="text-ink/45 mt-0.5 text-xs italic">Anulada: {a.motivo_anulacion}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Modal>

      {anulando ? (
        <Modal
          abierto
          ancho="sm"
          onCerrar={() => setAnulando(null)}
          titulo={`Anular ${anulando.numero}`}
          descripcion="Solo para una avería que se reportó por error."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setAnulando(null)}>
                No anular
              </Button>
              <Button
                disabled={anular.isPending || motivoAnulacion.trim().length < 4}
                onClick={async () => {
                  await anular.mutateAsync({ id: anulando.id, motivo: motivoAnulacion })
                  setAnulando(null)
                }}
              >
                {anular.isPending ? 'Anulando…' : 'Anular'}
              </Button>
            </>
          }
        >
          <Textarea
            label="Motivo"
            rows={3}
            value={motivoAnulacion}
            onChange={(e) => setMotivoAnulacion(e.target.value)}
            required
          />
          {anular.error ? <ErrorDeCarga error={anular.error} className="mt-4" /> : null}
        </Modal>
      ) : null}
    </>
  )
}
