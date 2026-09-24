import { useState } from 'react'
import { HandCoins } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useCuentas } from '@/lib/api/tesoreria'
import { useMisPermisos } from '@/lib/api/usuarios'
import { usePagarSaldoACliente, usePorPagarAClientes, type PorPagarACliente } from '@/lib/api/cobrosConMaterial'
import { dinero, documento, fecha } from '@/lib/formato'

/*
  LO QUE LA EMPRESA LE DEBE A UN CLIENTE

  Nace cuando un cliente paga una factura con material que vale más que lo
  que debía y quien cobró eligió «por pagarle» en vez de dejárselo como
  crédito. Es una deuda en dinero, así que vive en Pagos por hacer y sale de
  una cuenta de tesorería, en la misma moneda de la deuda.
*/

export function PorPagarAClientes() {
  const { data, error } = usePorPagarAClientes()
  const { data: cuentas } = useCuentas(true)
  const { puede } = useMisPermisos()
  const pagar = usePagarSaldoACliente()
  const [pagando, setPagando] = useState<PorPagarACliente | null>(null)
  const [pago, setPago] = useState({ cuenta: '', monto: '', referencia: '', fecha: '', nota: '' })

  const deudas = data ?? []
  if (deudas.length === 0 && !error) return null

  const puedePagar = puede('TESORERIA', 'ESCRITURA')
  const cuentasDeLaMoneda = (cuentas ?? []).filter((c) => c.moneda === pagando?.moneda)

  return (
    <>
      <Card className="mb-4" flush>
        <CardHeader
          className="p-5 pb-0"
          title="Por pagar a clientes"
          subtitle="Pagaron una factura con material que valía más de lo que debían, y la diferencia se les devuelve en dinero."
          action={<Chip tone="warning">{deudas.length}</Chip>}
        />
        {error ? <ErrorDeCarga error={error} className="m-5" /> : null}
        <div className="divide-hairline divide-y px-5 pb-2">
          {deudas.map((d) => (
            <div key={d.saldo_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-ink/90 text-sm font-medium">
                  {d.cliente} <span className="text-ink/45 font-normal">· {documento(d.rif)}</span>
                </p>
                <p className="text-ink/50 text-xs">
                  {d.numero}
                  {d.factura ? ` · factura ${d.factura}` : ''} · desde el {fecha(d.desde)}
                  {d.dias > 0 ? ` · ${d.dias} día${d.dias === 1 ? '' : 's'}` : ''} · {d.motivo}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="tabular text-ink/90 font-semibold">{dinero(d.moneda, d.pendiente)}</p>
                {puedePagar ? (
                  <Button
                    size="sm"
                    icon={<HandCoins />}
                    onClick={() => {
                      setPago({ cuenta: '', monto: String(d.pendiente), referencia: '', fecha: '', nota: '' })
                      setPagando(d)
                    }}
                  >
                    Pagar
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {pagando ? (
        <Modal
          abierto
          onCerrar={() => setPagando(null)}
          titulo={`Pagarle a ${pagando.cliente}`}
          descripcion={`Quedan ${dinero(pagando.moneda, pagando.pendiente)} por devolverle del saldo ${pagando.numero}.`}
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setPagando(null)}>
                Cancelar
              </Button>
              <Button
                disabled={pagar.isPending || !pago.cuenta || !(Number(pago.monto) > 0)}
                onClick={() =>
                  pagar.mutate(
                    {
                      saldo_id: pagando.saldo_id,
                      cuenta_id: Number(pago.cuenta),
                      monto: Number(pago.monto),
                      referencia: pago.referencia || null,
                      fecha: pago.fecha || null,
                      nota: pago.nota || null,
                    },
                    { onSuccess: () => setPagando(null) },
                  )
                }
              >
                {pagar.isPending ? 'Pagando…' : 'Registrar el pago'}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Select
              label="De qué cuenta sale"
              vacio={cuentasDeLaMoneda.length ? 'Elige la cuenta' : `No hay cuentas en ${pagando.moneda}`}
              value={pago.cuenta}
              onChange={(e) => setPago({ ...pago, cuenta: e.target.value })}
              opciones={cuentasDeLaMoneda.map((c) => ({
                valor: String(c.id),
                etiqueta: `${c.nombre} · ${dinero(c.moneda, c.saldo)}`,
              }))}
              hint="Se paga desde una cuenta en la misma moneda de la deuda."
            />
            <Input
              label={`Cuánto (${pagando.moneda})`}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={pago.monto}
              onChange={(e) => setPago({ ...pago, monto: e.target.value })}
            />
            <Input
              label="Referencia"
              value={pago.referencia}
              onChange={(e) => setPago({ ...pago, referencia: e.target.value })}
            />
            <Input
              label="Fecha"
              type="date"
              hint="Vacío es hoy."
              value={pago.fecha}
              onChange={(e) => setPago({ ...pago, fecha: e.target.value })}
            />
          </div>
          {pagar.error ? <ErrorDeCarga error={pagar.error} className="mt-3" /> : null}
        </Modal>
      ) : null}
    </>
  )
}
