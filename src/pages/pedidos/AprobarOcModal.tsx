import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { cn } from '@/lib/cn'
import { money, MOTIVO_NO_PAGO } from '@/lib/pedidos'
import {
  useAprobarOc,
  useNoSePagara,
  type EstadoOrden,
  type MotivoNoPago,
  type Orden,
} from '@/lib/api/pedidos'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'

/*
  ✔ APROBAR OC CON «MOTIVO DE PAGO» (la dueña, 09/11/2026: «esa función está
  en GT y MGG, la quiero al momento de aprobar una OC»).

  Es la tarjeta «💳 Motivo de Pago» de la Tesorería de MGG, puesta en la
  aprobación:
    SÍ  → se aprueba y sigue según su condición (método de pago, recepción o
          cuenta abierta), con su WhatsApp de siempre.
    NO  → no se aprueba: queda por aprobar con el motivo a la vista en la
          tarjeta y en el historial, y se arma el WhatsApp. «No procede»
          pide justificación y avisa al analista para que cancele la OC o
          busque otra cotización.
*/

const ORDEN_MOTIVOS: MotivoNoPago[] = ['sin_fondos', 'esperando_jefe', 'no_procede', 'otro']

export function AprobarOcModal({
  orden: o,
  proveedor,
  onCerrar,
  onAprobada,
  onNoSePagara,
}: {
  orden: Orden
  proveedor: string
  onCerrar: () => void
  onAprobada: (estado: EstadoOrden | undefined) => void
  /** El texto del motivo, para armar el WhatsApp. */
  onNoSePagara: (motivo: string, noProcede: boolean) => void
}) {
  const aprobar = useAprobarOc()
  const noPagar = useNoSePagara()
  const [sePagara, setSePagara] = useState<'si' | 'no'>('si')
  const [motivo, setMotivo] = useState<MotivoNoPago | ''>('')
  const [justificacion, setJustificacion] = useState('')
  const [otro, setOtro] = useState('')

  const ocCodigo = o.oc_codigo ?? o.codigo
  const ocupado = aprobar.isPending || noPagar.isPending
  const detalle = motivo === 'no_procede' ? justificacion.trim() : motivo === 'otro' ? otro.trim() : ''
  const listoNo = !!motivo && (motivo === 'sin_fondos' || motivo === 'esperando_jefe' || !!detalle)

  async function confirmarSi() {
    try {
      const [r] = await aprobar.mutateAsync([o.id])
      onAprobada(r?.estado)
    } catch (e) {
      toast(mensajeDe(e, 'Error al confirmar'), 'error')
    }
  }

  async function confirmarNo() {
    if (!motivo || !listoNo) return
    try {
      const r = await noPagar.mutateAsync({ id: o.id, motivo, detalle: detalle || null })
      toast(
        motivo === 'no_procede'
          ? `Se avisó al analista: ${ocCodigo} no procede`
          : `${ocCodigo} sigue por aprobar · ${MOTIVO_NO_PAGO[motivo].label}`,
        'success',
      )
      onNoSePagara(r.texto, motivo === 'no_procede')
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo guardar el motivo'), 'error')
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Aprobar ${o.clase === 'servicio' ? 'orden de servicio' : 'OC'} ${ocCodigo}`}
      descripcion={`${proveedor || 'Sin proveedor'} · ${money(Number(o.total))}`}
      ancho="md"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </Button>
          {sePagara === 'si' ? (
            <Button
              className="bg-success hover:bg-success hover:brightness-95"
              disabled={ocupado}
              onClick={() => void confirmarSi()}
            >
              {aprobar.isPending ? 'Aprobando…' : '✔ Aprobar OC'}
            </Button>
          ) : (
            <Button
              variant={motivo === 'no_procede' ? 'danger' : 'primary'}
              disabled={ocupado || !listoNo}
              onClick={() => void confirmarNo()}
            >
              {noPagar.isPending
                ? 'Guardando…'
                : motivo === 'no_procede'
                  ? '🚫 Notificar que no procede y enviar WhatsApp'
                  : '📲 Guardar motivo y enviar WhatsApp'}
            </Button>
          )}
        </>
      }
    >
      <section className="border-royal-500/70 rounded-[10px] border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-ink/70 text-xs font-bold tracking-wider uppercase">💼 Motivo de pago</h4>
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase',
              sePagara === 'si' ? 'bg-success text-white' : 'bg-danger text-white',
            )}
          >
            {sePagara === 'si' ? '✓ Se pagará esta OC' : '✕ No se pagará'}
          </span>
        </div>
        <p className="text-ink/70 mt-2 text-sm">¿Se pagará esta OC?</p>
        <div className="mt-2 flex gap-2">
          <Button
            variant={sePagara === 'si' ? 'primary' : 'outline'}
            disabled={ocupado}
            onClick={() => setSePagara('si')}
          >
            ✅ SÍ
          </Button>
          <Button
            variant={sePagara === 'no' ? 'danger' : 'outline'}
            disabled={ocupado}
            onClick={() => setSePagara('no')}
          >
            ❌ NO
          </Button>
        </div>

        {sePagara === 'si' ? (
          <p className="text-success mt-2 text-sm">
            ✓ Se procede con el pago de la OC.{' '}
            {o.condiciones_pago === 'contra_entrega'
              ? 'Al aprobarla pasa a pendiente por recepción (contra entrega).'
              : o.condiciones_pago === 'credito'
                ? 'Al aprobarla queda como crédito (cuenta abierta).'
                : 'Al aprobarla sigue a indicar el método de pago.'}
          </p>
        ) : (
          <div className="border-hairline bg-ink/3 mt-3 rounded-[8px] border p-3">
            <div className="text-ink/80 mb-2 text-sm font-semibold">Motivo por el cual no se pagará:</div>
            <div className="grid gap-1.5" role="radiogroup" aria-label="Motivo por el cual no se pagará">
              {ORDEN_MOTIVOS.map((m) => (
                <label
                  key={m}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1.5 text-sm',
                    motivo === m && (m === 'no_procede' ? 'bg-danger/10' : 'bg-ink/6'),
                    m === 'no_procede' && 'text-danger font-semibold',
                  )}
                >
                  <input
                    type="radio"
                    name="motivo_no_pago"
                    checked={motivo === m}
                    disabled={ocupado}
                    onChange={() => setMotivo(m)}
                  />
                  <span>
                    {MOTIVO_NO_PAGO[m].icono} {MOTIVO_NO_PAGO[m].label}
                  </span>
                </label>
              ))}
            </div>
            {motivo === 'no_procede' ? (
              <div className="mt-2">
                <Textarea
                  label="Justificación de por qué no se hará la compra *"
                  rows={2}
                  maxLength={500}
                  value={justificacion}
                  onChange={(e) => setJustificacion(e.target.value)}
                  placeholder="Explica por qué no se hará la compra…"
                  autoFocus
                />
                <p className="text-ink/55 mt-1 text-xs">
                  Se avisará al analista{o.oc_creada_por_nombre ? ` (${o.oc_creada_por_nombre})` : ''} para que cancele la OC
                  o busque otra cotización.
                </p>
              </div>
            ) : motivo === 'otro' ? (
              <div className="mt-2">
                <Input
                  label="Especifica el motivo *"
                  maxLength={500}
                  value={otro}
                  onChange={(e) => setOtro(e.target.value)}
                  placeholder="Escribe el motivo…"
                  autoFocus
                />
              </div>
            ) : null}
            <p className="text-ink/60 mt-2 text-xs">
              La OC no se aprueba: queda por aprobar con este motivo a la vista. Cuando se pueda pagar, se vuelve a «✔ Aprobar
              OC».
            </p>
          </div>
        )}
      </section>
    </Modal>
  )
}
