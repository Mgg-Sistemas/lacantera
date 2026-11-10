import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { cn } from '@/lib/cn'
import { dolares, dinero } from '@/lib/formato'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import {
  useAprobarDespachoVenta,
  useNoSeDespacha,
  useRechazarDespachoVenta,
  type MotivoNoDespacho,
  type TarjetaVenta,
} from '@/lib/api/ventasTablero'
import { MOTIVO_NO_DESPACHO } from './ventasTablero'

/*
  ✔ APROBAR DESPACHO CON «¿SE DESPACHA?» (la dueña, 10/11/2026: una sola
  aprobación por venta, al despachar, y con la pregunta de Compras).

    SÍ  → nace la nota de entrega y el material sale del patio.
    NO  → por ahora: queda por aprobar con su motivo a la vista (sin cupo,
          deuda vencida, sin material, otro).
    🚫 No procede → el despacho queda no aprobado, con la justificación.
*/

type Eleccion = MotivoNoDespacho | 'no_procede'
const MOTIVOS: Eleccion[] = ['deuda_vencida', 'sin_cupo', 'sin_material', 'no_procede', 'otro']

export function AprobarDespachoModal({
  tarjeta: t,
  onCerrar,
  onAprobado,
  onNoAprobado,
}: {
  tarjeta: TarjetaVenta
  onCerrar: () => void
  onAprobado: () => void
  onNoAprobado: (motivo: string, noProcede: boolean) => void
}) {
  const aprobar = useAprobarDespachoVenta()
  const noDespacha = useNoSeDespacha()
  const rechazar = useRechazarDespachoVenta()
  const [si, setSi] = useState(true)
  const [motivo, setMotivo] = useState<Eleccion | ''>('')
  const [detalle, setDetalle] = useState('')

  const ocupado = aprobar.isPending || noDespacha.isPending || rechazar.isPending
  const det = detalle.trim()
  const listo = !!motivo && ((motivo !== 'otro' && motivo !== 'no_procede') || det.length >= 4)

  async function confirmar() {
    try {
      if (si) {
        await aprobar.mutateAsync(t.id)
        toast(`Despacho ${t.numero} aprobado · nació su nota de entrega`, 'success')
        onAprobado()
        return
      }
      if (!motivo || !listo) return
      if (motivo === 'no_procede') {
        const txt = `NO PROCEDE: ${det.toUpperCase()}`
        await rechazar.mutateAsync({ id: t.id, motivo: txt })
        toast(`Despacho ${t.numero} no aprobado`, 'success')
        onNoAprobado(txt, true)
        return
      }
      const r = await noDespacha.mutateAsync({ id: t.id, motivo, detalle: det || null })
      toast(`${t.numero} sigue por aprobar · ${MOTIVO_NO_DESPACHO[motivo].label}`, 'success')
      onNoAprobado(r.texto, false)
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo guardar'), 'error')
    }
  }

  const monto = t.total != null ? dinero(t.moneda, Number(t.total)) : t.total_usd != null ? dolares(Number(t.total_usd)) : ''

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Aprobar despacho ${t.numero}`}
      descripcion={[t.cliente, monto].filter(Boolean).join(' · ')}
      ancho="md"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </Button>
          {si ? (
            <Button className="bg-success hover:bg-success hover:brightness-95" disabled={ocupado} onClick={() => void confirmar()}>
              {aprobar.isPending ? 'Aprobando…' : '✔ Aprobar despacho'}
            </Button>
          ) : (
            <Button variant={motivo === 'no_procede' ? 'danger' : 'primary'} disabled={ocupado || !listo} onClick={() => void confirmar()}>
              {ocupado ? 'Guardando…' : motivo === 'no_procede' ? '🚫 No aprobar y enviar WhatsApp' : '📲 Guardar motivo y enviar WhatsApp'}
            </Button>
          )}
        </>
      }
    >
      <section className="border-royal-500/70 rounded-[10px] border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-ink/70 text-xs font-bold tracking-wider uppercase">🚚 Despacho</h4>
          <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-white uppercase', si ? 'bg-success' : 'bg-danger')}>
            {si ? '✓ Se despacha' : '✕ No se despacha'}
          </span>
        </div>
        <p className="text-ink/70 mt-2 text-sm">¿Se despacha esta venta?</p>
        <div className="mt-2 flex gap-2">
          <Button variant={si ? 'primary' : 'outline'} disabled={ocupado} onClick={() => setSi(true)}>
            ✅ SÍ
          </Button>
          <Button variant={!si ? 'danger' : 'outline'} disabled={ocupado} onClick={() => setSi(false)}>
            ❌ NO
          </Button>
        </div>

        {si ? (
          <p className="text-success mt-2 text-sm">
            ✓ Nace la nota de entrega y el material sale de {t.almacen ?? 'su patio'}.
          </p>
        ) : (
          <div className="border-hairline bg-ink/3 mt-3 rounded-[8px] border p-3">
            <div className="text-ink/80 mb-2 text-sm font-semibold">Motivo por el cual no se despacha:</div>
            <div className="grid gap-1.5" role="radiogroup" aria-label="Motivo por el cual no se despacha">
              {MOTIVOS.map((m) => (
                <label
                  key={m}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1.5 text-sm',
                    motivo === m && (m === 'no_procede' ? 'bg-danger/10' : 'bg-ink/6'),
                    m === 'no_procede' && 'text-danger font-semibold',
                  )}
                >
                  <input type="radio" name="motivo_no_despacho" checked={motivo === m} disabled={ocupado} onChange={() => setMotivo(m)} />
                  <span>
                    {m === 'no_procede' ? '🚫 No procede esta venta' : `${MOTIVO_NO_DESPACHO[m].icono} ${MOTIVO_NO_DESPACHO[m].label}`}
                  </span>
                </label>
              ))}
            </div>
            {motivo === 'no_procede' ? (
              <div className="mt-2">
                <Textarea
                  label="Justificación *"
                  rows={2}
                  maxLength={400}
                  value={detalle}
                  onChange={(e) => setDetalle(e.target.value)}
                  placeholder="Por qué no se despachará…"
                  autoFocus
                />
              </div>
            ) : motivo ? (
              <div className="mt-2">
                <Input
                  label={motivo === 'otro' ? 'Especifica el motivo *' : 'Detalle'}
                  maxLength={400}
                  value={detalle}
                  onChange={(e) => setDetalle(e.target.value)}
                  placeholder={motivo === 'deuda_vencida' ? 'Ej.: NE-2026-0088 sin cobrar' : 'Escribe el detalle…'}
                />
              </div>
            ) : null}
            <p className="text-ink/60 mt-2 text-xs">
              {motivo === 'no_procede'
                ? 'El despacho queda no aprobado y sale de la columna. Para despachar después, se pide otro.'
                : 'El despacho sigue por aprobar con este motivo a la vista. Cuando se resuelva, se vuelve a «✔ Aprobar despacho».'}
            </p>
          </div>
        )}
      </section>
    </Modal>
  )
}
