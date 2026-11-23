import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { type RetencionItem, useRegistrarReintegro } from '@/lib/api/retenciones'
import { useCuentas } from '@/lib/api/tesoreria'
import { CheckCircle2 } from 'lucide-react'

interface Props {
  abierta: boolean
  onCerrar: () => void
  retencion: RetencionItem | null
}

export function ModalRegistrarReintegro({ abierta, onCerrar, retencion }: Props) {
  const registrar = useRegistrarReintegro()
  const { data: cuentas = [] } = useCuentas(true)

  const [cuentaId, setCuentaId] = useState<number>(0)
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [monto, setMonto] = useState(retencion?.reintegro_monto ?? retencion?.monto_retenido ?? 0)
  const [referencia, setReferencia] = useState('')
  const [nota, setNota] = useState('')

  if (!retencion) return null

  const cuentaSeleccionada = cuentas.find((c) => c.id === cuentaId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cuentaId || !referencia.trim()) return

    await registrar.mutateAsync({
      retencion_id: retencion.id,
      cuenta_id: cuentaId,
      cuenta_nombre: cuentaSeleccionada?.nombre,
      monto: Number(monto) || 0,
      fecha,
      referencia,
      nota: nota || null,
    })

    onCerrar()
  }

  return (
    <Modal abierto={abierta} onCerrar={onCerrar} titulo="Registrar Reintegro de Proveedor">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-[6px] border border-success/30 bg-success-soft p-3 text-xs text-ink/80">
          <p className="font-semibold text-ink/90">Ingreso por devolución de retención post-pago</p>
          <p className="mt-1 leading-relaxed text-ink/75">
            El proveedor <strong>{retencion.proveedor_nombre}</strong> está reintegrando el importe correspondiente al
            comprobante <strong>{retencion.numero_comprobante}</strong> (Factura {retencion.factura_numero}).
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Cuenta Receptora (Tesorería)"
            value={cuentaId ? String(cuentaId) : ''}
            onChange={(e) => setCuentaId(Number(e.target.value))}
            vacio="Seleccione cuenta bancaria o caja..."
            opciones={cuentas.map((c) => ({
              valor: String(c.id),
              etiqueta: `${c.nombre} (${c.moneda})`,
            }))}
            required
          />

          <Input
            label="Monto Reintegrado"
            type="number"
            step="0.01"
            value={monto || ''}
            onChange={(e) => setMonto(Number(e.target.value))}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Fecha del Reintegro"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
          />

          <Input
            label="N° Referencia Bancaria / Recibo"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder="Ej. REF-09823412"
            required
          />
        </div>

        <Textarea
          label="Nota o Detalle (Opcional)"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Observación del reintegro o nota del banco..."
          rows={2}
        />

        {registrar.error ? <ErrorDeCarga error={registrar.error} /> : null}

        <div className="flex justify-end gap-2 pt-2 border-t border-hairline">
          <Button variant="outline" type="button" onClick={onCerrar} disabled={registrar.isPending}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={registrar.isPending}
            icon={<CheckCircle2 className="w-4 h-4 text-success" />}
          >
            {registrar.isPending ? 'Asentando...' : 'Asentar ingreso en tesorería'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
