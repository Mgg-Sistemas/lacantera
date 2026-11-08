import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { cn } from '@/lib/cn'
import { useServicioRealizado, type Orden } from '@/lib/api/pedidos'
import { fmtCant, money } from '@/lib/pedidos'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { comoNumero } from '@/lib/formato'

/*
  «SERVICIO REALIZADO · {código}» (MGG `RecepcionParcialModal` con `esServicio`)

  Un servicio no se recibe en el almacén ni entra al inventario: Compras deja
  constancia de que se prestó. Por renglón, cuánto se prestó (no más de lo
  pedido); si fue menos, la nota es obligatoria. Como en MGG, la orden cierra
  de una vez: lo que no se prestó queda anotado.
*/

const num = (s: string) => Number(String(s).replace(',', '.'))

export function ServicioRealizadoModal({
  orden: o,
  onClose,
  onListo,
}: {
  orden: Orden
  onClose: () => void
  onListo: () => void
}) {
  const realizar = useServicioRealizado()
  const renglones = useMemo(() => (o.items ?? []).filter((it) => it.comprar !== false), [o.items])
  const [cant, setCant] = useState<Record<string, string>>(() =>
    Object.fromEntries(renglones.map((it) => [it.sku, String(it.cantidad ?? 0)])),
  )
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recibidoTotal = renglones.reduce((a, it) => a + (num(cant[it.sku] ?? '0') || 0) * (Number(it.precio) || 0), 0)
  const menos = renglones.some((it) => (num(cant[it.sku] ?? '0') || 0) < Number(it.cantidad) - 0.0001)
  const equipos = [...new Set(renglones.map((it) => it.equipo_nombre).filter((x): x is string => !!x))]
  const contraEntrega = o.condiciones_pago === 'contra_entrega' && !o.pagada_en

  async function confirmar() {
    setError(null)
    const datos = renglones.map((it) => ({ sku: it.sku, cantidad: num(cant[it.sku] ?? '0') }))
    if (datos.some((d) => !Number.isFinite(d.cantidad) || d.cantidad < 0)) return setError('Una cantidad no se entiende.')
    const exceso = renglones.find((it) => num(cant[it.sku] ?? '0') > Number(it.cantidad) + 0.0001)
    if (exceso) return setError(`No podés recibir más de lo pedido en ${exceso.nombre}.`)
    if (!datos.some((d) => d.cantidad > 0)) return setError('Indicá al menos una cantidad recibida.')
    if (menos && !nota.trim()) return setError('Recibiste menos de lo pedido: indicá una nota explicando la diferencia.')
    try {
      const r = await realizar.mutateAsync({ id: o.id, renglones: datos, nota: nota.trim() || null })
      toast(
        contraEntrega
          ? `Servicio realizado · ${o.codigo} · indicá el método para pagar lo prestado`
          : r.estado === 'cuenta_abierta'
            ? `Servicio realizado · ${o.codigo} · el crédito sigue abierto`
            : `Servicio realizado · ${o.codigo}`,
        'success',
      )
      onListo()
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo confirmar el servicio'))
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onClose}
      titulo={`Servicio realizado · ${o.codigo}`}
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onClose} disabled={realizar.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => void confirmar()} disabled={realizar.isPending}>
            {realizar.isPending ? 'Guardando…' : '🔧 Confirmar servicio realizado'}
          </Button>
        </>
      }
    >
      <p className="text-ink/65 mb-3 text-sm">
        Confirmá cuánto se prestó realmente de cada servicio. Si se prestó menos de lo pedido, dejá una <strong>nota</strong>;
        la orden cierra sin saldo pendiente.
      </p>

      <div className="border-hairline overflow-x-auto rounded-[6px] border">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-ink/4 text-ink/55 text-left text-xs">
            <tr>
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium">Servicio</th>
              <th className="px-3 py-2 text-right font-medium">Pedido</th>
              <th className="px-3 py-2 text-right font-medium">Recibido</th>
              <th className="px-3 py-2 text-right font-medium">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {renglones.map((it) => {
              const v = num(cant[it.sku] ?? '0') || 0
              return (
                <tr key={it.sku} className="border-hairline border-t">
                  <td className="px-3 py-2 font-mono text-xs">{it.sku}</td>
                  <td className="px-3 py-2">{it.nombre}</td>
                  <td className="px-3 py-2 text-right">{fmtCant(it.cantidad)}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      inputMode="decimal"
                      aria-label={`Prestado de ${it.nombre}`}
                      className={cn(
                        'border-ink/20 w-20 rounded border px-1.5 py-0.5 text-right font-mono',
                        v < Number(it.cantidad) && 'border-warning text-warning',
                      )}
                      value={cant[it.sku] ?? ''}
                      onChange={(e) => setCant((m) => ({ ...m, [it.sku]: comoNumero(e.target.value, { maxDecimales: 4, sinNegativos: true }) }))}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{money(v * (Number(it.precio) || 0))}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-hairline border-t font-semibold">
              <td colSpan={4} className="px-3 py-2 text-right">
                Total recibido
              </td>
              <td className="px-3 py-2 text-right font-mono">{money(recibidoTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-ink/60 mt-3 text-xs">
        🔧 Es un <strong>servicio</strong>: <strong>no entra al inventario</strong> ni se le asigna almacén. Se registra como
        prestado y su rastro queda en el <strong>equipo asociado</strong>
        {equipos.length ? (
          <>
            {' '}
            (<strong>{equipos.join(' · ')}</strong>)
          </>
        ) : null}
        .
      </p>

      <Textarea
        className="mt-3"
        label={menos ? 'Nota de recepción (obligatoria · llegó menos de lo pedido)' : 'Nota de recepción'}
        placeholder="Diferencias, faltantes, observaciones de la recepción…"
        rows={2}
        value={nota}
        onChange={(e) => setNota(e.target.value)}
      />

      {contraEntrega ? (
        <p className="text-ink/60 mt-2 text-xs">
          Contra entrega: luego se indicará el método para pagar <strong className="font-mono">{money(recibidoTotal)}</strong> (lo
          recibido).
        </p>
      ) : null}

      {error ? (
        <div className="border-danger text-danger mt-3 rounded-[6px] border px-3 py-2 text-sm">
          <strong>Error:</strong> {error}
        </div>
      ) : null}
    </Modal>
  )
}
