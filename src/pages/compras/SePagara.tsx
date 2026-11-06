import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'

/*
  «¿SE PAGARÁ ESTA ORDEN?»

  Tomado del modal de pago de la Tesorería de MGG, y traído a Compras porque
  aquí Tesorería no se vincula (Angélica, 06/11/2026): quien aprueba marca si se
  paga y, si dice que sí, la orden queda pagada.

  Si dice que no, se pide el motivo. Los dos de MGG que son temporales —sin
  fondos, esperando respuesta— más «Otro» con texto. El tercero de MGG, «No
  procede esta compra», aquí no es un motivo: es «Devolver a compras», que ya
  existe y manda la solicitud a buscar otra cotización o a cancelarse.

  Es un bloque controlado: lo usa la aprobación (que lo manda junto con
  aprobar) y la orden ya aprobada (que lo manda sola).
*/

import { MOTIVOS } from './decisionPago'
import type { DecisionPago } from './decisionPago'

export function SePagara({
  valor,
  onCambio,
  deshabilitado,
  className,
}: {
  valor: DecisionPago
  onCambio: (d: DecisionPago) => void
  deshabilitado?: boolean
  className?: string
}) {
  const cambiar = (c: Partial<DecisionPago>) => onCambio({ ...valor, ...c })

  return (
    <div className={cn('border-royal-600/25 rounded-[6px] border p-3', className)}>
      <p className="text-ink/85 text-sm font-medium">¿Se pagará esta orden?</p>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={deshabilitado}
          onClick={() => cambiar({ sePaga: true })}
          className={cn(
            'flex-1 rounded-[6px] border px-3 py-1.5 text-sm font-semibold transition-colors',
            valor.sePaga === true
              ? 'border-success bg-success text-white'
              : 'border-hairline text-ink/70 hover:bg-ink/5',
          )}
        >
          ✓ Sí, se pagará
        </button>
        <button
          type="button"
          disabled={deshabilitado}
          onClick={() => cambiar({ sePaga: false })}
          className={cn(
            'flex-1 rounded-[6px] border px-3 py-1.5 text-sm font-semibold transition-colors',
            valor.sePaga === false
              ? 'border-danger bg-danger text-white'
              : 'border-hairline text-ink/70 hover:bg-ink/5',
          )}
        >
          ✕ No se pagará
        </button>
      </div>

      {valor.sePaga === true ? (
        <>
          <p className="text-success mt-2 text-xs">
            La orden queda <strong>pagada</strong>. No mueve ninguna cuenta de Tesorería.
          </p>
          <Input
            label="Referencia del pago (opcional)"
            className="mt-2"
            placeholder="Número de la transferencia o del pago móvil"
            value={valor.referencia}
            disabled={deshabilitado}
            onChange={(e) => cambiar({ referencia: e.target.value })}
          />
        </>
      ) : null}

      {valor.sePaga === false ? (
        <div className="bg-ink/4 mt-2 space-y-1.5 rounded-[6px] p-2.5">
          <p className="text-ink/75 text-xs font-medium">Motivo por el cual no se pagará:</p>
          {MOTIVOS.map((m) => (
            <label key={m.valor} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="motivo-no-pago"
                className="accent-royal-600 size-4"
                checked={valor.motivo === m.valor}
                disabled={deshabilitado}
                onChange={() => cambiar({ motivo: m.valor })}
              />
              <span className="text-ink/80">{m.texto}</span>
            </label>
          ))}
          {valor.motivo === 'OTRO' ? (
            <Input
              label="Escriba el motivo"
              value={valor.otro}
              disabled={deshabilitado}
              onChange={(e) => cambiar({ otro: e.target.value })}
            />
          ) : null}
          <p className="text-ink/50 text-xs">
            Queda aprobada y por pagar. Se podrá marcar pagada más tarde. Si la compra no procede,
            use «Devolver a compras».
          </p>
        </div>
      ) : null}
    </div>
  )
}
