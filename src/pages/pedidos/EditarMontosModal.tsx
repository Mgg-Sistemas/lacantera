import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { useEditarMontosServicioDirecto, type ServicioDirecto } from '@/lib/api/pedidos'
import { fmtCant, money } from '@/lib/pedidos'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'

/*
  «✎ EDITAR MONTOS» DE UN SERVICIO DIRECTO YA FINALIZADO (MGG `EditarMontosModal`)

  El monto por renglón; la cantidad no cambia. En MGG el cambio reajusta el
  egreso de Tesorería; aquí no hay egreso (sin Tesorería): el pago registrado
  no se toca, y el monto de antes, el nuevo y lo pagado quedan en la
  trazabilidad. Siempre en $: sin el selector de moneda de MGG ni IVA/IGTF
  (esos son de la compra directa en Bs).
*/

const r2 = (n: number) => Math.round(n * 100) / 100

export function EditarMontosModal({ servicio: s, onClose }: { servicio: ServicioDirecto; onClose: () => void }) {
  const editar = useEditarMontosServicioDirecto()
  const [gastos, setGastos] = useState<string[]>(() => s.items.map((it) => (Number(it.gasto) > 0 ? String(it.gasto) : '')))
  const [nota, setNota] = useState(s.nota ?? '')
  const [pagoExterno, setPagoExterno] = useState(!!s.pago_externo)
  const [pagoExternoDatos, setPagoExternoDatos] = useState(s.pago_externo_datos ?? '')

  const total = useMemo(() => r2(gastos.reduce((a, g) => a + (Number(g) || 0), 0)), [gastos])

  async function guardar() {
    if (total <= 0) return toast('El total debe ser mayor que 0.', 'error')
    if (pagoExterno && !pagoExternoDatos.trim()) return toast('Ingresá los datos de la persona externa que pagó.', 'error')
    try {
      await editar.mutateAsync({
        id: s.id,
        gastos: gastos.map((g) => Number(g) || 0),
        nota: nota.trim() || null,
        pago_externo: pagoExterno,
        pago_externo_datos: pagoExterno ? pagoExternoDatos.trim() : null,
      })
      toast('Montos actualizados · quedan en la trazabilidad', 'success')
      onClose()
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo actualizar'), 'error')
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onClose}
      titulo={`Editar montos · ${s.codigo}`}
      ancho="md"
      acciones={
        <>
          <Button variant="ghost" onClick={onClose} disabled={editar.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={editar.isPending}>
            {editar.isPending ? 'Guardando…' : `Guardar · ${money(total)}`}
          </Button>
        </>
      }
    >
      <p className="text-ink/65 mb-3 text-sm">
        Corregí el monto por renglón. El <strong>pago registrado no cambia</strong>: el monto de antes, el nuevo y lo pagado quedan en
        la <strong>trazabilidad</strong> del servicio. La cantidad no cambia.
      </p>
      <div className="border-hairline overflow-x-auto rounded-[6px] border">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="bg-ink/4 text-ink/55 text-left text-xs">
            <tr>
              <th className="px-3 py-2 font-medium">Detalle</th>
              <th className="px-3 py-2 text-right font-medium">Cantidad</th>
              <th className="w-36 px-3 py-2 font-medium">Monto</th>
              <th className="px-3 py-2 text-right font-medium">Costo unit.</th>
            </tr>
          </thead>
          <tbody>
            {s.items.map((it, i) => {
              const g = Number(gastos[i]) || 0
              const cu = Number(it.cantidad) > 0 && g > 0 ? g / Number(it.cantidad) : 0
              return (
                <tr key={i} className="border-hairline border-t">
                  <td className="px-3 py-2">{it.descripcion}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtCant(it.cantidad)}</td>
                  <td className="px-3 py-2">
                    <input
                      className="rounded-control border-ink/20 bg-surface h-9 w-full border px-2 text-right font-mono text-sm"
                      type="number"
                      min={0}
                      step="any"
                      placeholder="0,00"
                      aria-label={`Monto de ${it.descripcion}`}
                      value={gastos[i]}
                      onChange={(e) => setGastos((prev) => prev.map((x, k) => (k === i ? e.target.value : x)))}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{money(cu)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="border-hairline my-3 rounded-[6px] border px-3 py-2 text-sm">
        Nuevo total: <strong className="font-mono">{money(total)}</strong>
        {s.pago_monto_usd != null ? <span className="text-ink/50"> · pagado {money(s.pago_monto_usd)}</span> : null}
      </div>
      <Textarea
        label="Nota / motivo"
        rows={2}
        placeholder="Motivo o detalle del servicio…"
        hint="Aparece en el detalle y en el PDF."
        value={nota}
        onChange={(e) => setNota(e.target.value)}
      />
      <div className="border-hairline mt-3 border-t pt-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={pagoExterno} onChange={(e) => setPagoExterno(e.target.checked)} />
          <span>
            💳 Pago a externo <span className="text-ink/50">(lo pagó otra persona; hay que reintegrarle)</span>
          </span>
        </label>
        {pagoExterno ? (
          <Textarea
            className="mt-2"
            label="Datos de la persona externa que pagó *"
            rows={2}
            sinNormalizar
            placeholder="Nombre, C.I. / RIF, teléfono, y cómo reintegrarle (cuenta / pago móvil)…"
            hint="Aparece en el detalle y en el PDF."
            value={pagoExternoDatos}
            onChange={(e) => setPagoExternoDatos(e.target.value)}
          />
        ) : null}
      </div>
    </Modal>
  )
}
