import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { marcarMensajesLeidos, useEnviarMensaje, useMensajesOrden, type Orden } from '@/lib/api/pedidos'
import { fechaHoraVE } from '@/lib/pedidos'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'

/*
  EL CHAT INTERNO DE LA ORDEN (MGG `ChatOC.tsx`)

  Un hilo de seguimiento por orden, al pie del detalle. No se envía al
  proveedor. En MGG lo leen Compras y Tesorería; aquí no hay Tesorería, así que
  lo lee quien puede ver la orden. Es en vivo: el canal de `tiempoReal.ts`
  rehace el hilo cuando alguien escribe. Al abrirlo se marcan leídos, y eso
  apaga el «💬 n» de la tarjeta.
*/
export function ChatOC({ orden, yo }: { orden: Orden; yo: string }) {
  const qc = useQueryClient()
  const mensajes = useMensajesOrden(orden.id)
  const enviar = useEnviarMensaje()
  const [texto, setTexto] = useState('')
  const caja = useRef<HTMLDivElement>(null)

  const lista = mensajes.data ?? []
  const sinLeer = lista.some((m) => !m.leido_por?.includes(yo))

  useEffect(() => {
    caja.current?.scrollTo({ top: caja.current.scrollHeight })
  }, [lista.length])

  useEffect(() => {
    if (!sinLeer) return
    marcarMensajesLeidos(orden.id)
      .then(() => qc.invalidateQueries({ queryKey: ['pedidos', 'mensajes'] }))
      .catch(() => undefined)
  }, [sinLeer, orden.id, qc])

  async function mandar(e: FormEvent) {
    e.preventDefault()
    const t = texto.trim()
    if (!t) {
      toast('El mensaje no puede estar vacío.', 'error')
      return
    }
    try {
      await enviar.mutateAsync({ ordenId: orden.id, texto: t })
      setTexto('')
    } catch (err) {
      toast(mensajeDe(err, 'No se pudo enviar el mensaje'), 'error')
    }
  }

  return (
    <div className="border-royal-600/60 bg-royal-600/5 mt-6 rounded-[12px] border-2 p-3">
      <h4 className="text-royal-700 dark:text-royal-300 font-semibold">💬 Chat interno · {orden.oc_codigo ?? orden.codigo}</h4>
      <p className="text-ink/55 mt-0.5 text-xs">
        Hilo de seguimiento interno de esta orden (no se envía al proveedor). Lo ve quien sigue la orden en Compras.
      </p>
      <div ref={caja} className="bg-surface/60 mt-2 max-h-[260px] space-y-2 overflow-y-auto rounded-[8px] p-2">
        {mensajes.isPending ? (
          <p className="text-ink/50 text-sm">Cargando…</p>
        ) : lista.length === 0 ? (
          <p className="text-ink/50 text-sm">Sin mensajes. Iniciá la conversación.</p>
        ) : (
          lista.map((m) => {
            const mio = m.autor === yo
            return (
              <div key={m.id} className={cn('flex', mio ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[80%] rounded-[10px] px-3 py-1.5 text-sm',
                    mio ? 'bg-royal-600 text-white' : 'bg-surface border-hairline border',
                  )}
                >
                  <div className="break-words whitespace-pre-wrap">{m.texto}</div>
                  <div className={cn('mt-0.5 text-[10px]', mio ? 'text-white/75' : 'text-ink/45')}>
                    {mio ? 'Vos' : (m.autor_nombre ?? 'Usuario')} · {fechaHoraVE(m.creado_en)}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
      <form className="mt-2 flex gap-2" onSubmit={(e) => void mandar(e)}>
        <input
          className="rounded-control border-ink/20 bg-surface h-10 min-w-0 flex-1 border px-3 text-sm"
          placeholder="Escribí un mensaje…"
          maxLength={2000}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          aria-label="Mensaje"
        />
        <Button type="submit" disabled={!texto.trim() || enviar.isPending}>
          {enviar.isPending ? 'Enviando…' : 'Enviar'}
        </Button>
      </form>
    </div>
  )
}
