import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { type RetencionItem, useAnularRetencion } from '@/lib/api/retenciones'
import { AlertTriangle } from 'lucide-react'

interface Props {
  abierta: boolean
  onCerrar: () => void
  retencion: RetencionItem | null
}

export function ModalAnularRetencion({ abierta, onCerrar, retencion }: Props) {
  const anular = useAnularRetencion()
  const [motivo, setMotivo] = useState('')

  if (!retencion) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!motivo.trim()) return

    await anular.mutateAsync({
      id: retencion.id,
      motivo: motivo.trim(),
    })

    onCerrar()
  }

  return (
    <Modal abierto={abierta} onCerrar={onCerrar} titulo="Anular Comprobante de Retención">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-[6px] border border-danger/30 bg-danger-soft p-3 text-xs text-ink/80 flex gap-2.5 items-start">
          <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-ink/90">Acción Fiscal Irreversible</p>
            <p className="mt-0.5 text-ink/75 leading-relaxed">
              Está a punto de anular el comprobante <strong>{retencion.numero_comprobante}</strong> (Proveedor:{' '}
              {retencion.proveedor_nombre}). El número no se reutilizará y quedará registrado con el motivo de
              anulación exigido por la ley.
            </p>
          </div>
        </div>

        <Textarea
          label="Motivo de Anulación (Obligatorio)"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Escriba claramente la razón fiscal o comercial de la anulación..."
          rows={3}
          required
        />

        {anular.error ? <ErrorDeCarga error={anular.error} /> : null}

        <div className="flex justify-end gap-2 pt-2 border-t border-hairline">
          <Button variant="outline" type="button" onClick={onCerrar} disabled={anular.isPending}>
            Volver
          </Button>
          <Button type="submit" variant="danger" disabled={anular.isPending}>
            {anular.isPending ? 'Anulando...' : 'Confirmar anulación'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
