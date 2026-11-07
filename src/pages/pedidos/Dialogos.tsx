import { useState, type ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'

/** MGG `ConfirmDialog`: título, mensaje y dos botones. */
export function ConfirmDialog({
  title,
  message,
  confirmText,
  danger,
  success,
  busy,
  onConfirm,
  onCancel,
  children,
}: {
  title: string
  message: ReactNode
  confirmText: string
  danger?: boolean
  success?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}) {
  return (
    <Modal
      abierto
      onCerrar={onCancel}
      titulo={title}
      ancho="sm"
      acciones={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            className={success ? 'bg-success hover:bg-success hover:brightness-95' : undefined}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Guardando…' : confirmText}
          </Button>
        </>
      }
    >
      <div className="text-ink/80 text-sm whitespace-pre-line">{message}</div>
      {children ? <div className="mt-3">{children}</div> : null}
    </Modal>
  )
}

/*
  MGG `MotivoModal`: pide el motivo (obligatorio: sin texto el botón no se
  enciende) y, si se le pide, una segunda confirmación antes de hacerlo.
*/
export function MotivoModal({
  title,
  intro,
  label,
  placeholder,
  confirmText,
  doubleConfirm,
  busy,
  onConfirm,
  onClose,
}: {
  title: string
  intro: string
  label: string
  placeholder?: string
  confirmText: string
  /** El texto de la segunda confirmación. */
  doubleConfirm?: string
  busy?: boolean
  onConfirm: (motivo: string) => void
  onClose: () => void
}) {
  const [motivo, setMotivo] = useState('')
  const [seguro, setSeguro] = useState(false)

  if (seguro && doubleConfirm) {
    return (
      <ConfirmDialog
        title={title}
        message={doubleConfirm}
        confirmText={confirmText}
        danger
        busy={busy}
        onCancel={() => setSeguro(false)}
        onConfirm={() => onConfirm(motivo.trim())}
      />
    )
  }

  return (
    <Modal
      abierto
      onCerrar={onClose}
      titulo={title}
      acciones={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cerrar
          </Button>
          <Button
            variant="danger"
            disabled={!motivo.trim() || busy}
            onClick={() => (doubleConfirm ? setSeguro(true) : onConfirm(motivo.trim()))}
          >
            {busy ? 'Guardando…' : confirmText}
          </Button>
        </>
      }
    >
      <p className="text-ink/70 mb-3 text-sm">{intro}</p>
      <Textarea
        label={label}
        placeholder={placeholder}
        rows={3}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
      />
    </Modal>
  )
}
