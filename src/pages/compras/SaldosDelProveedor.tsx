import { useState } from 'react'
import { Link } from 'react-router'
import { HandCoins } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useMisRoles } from '@/lib/api/catalogo'
import { useCuentas } from '@/lib/api/tesoreria'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { useCobrarSaldoAFavor, useSaldosAFavor, type SaldoAFavor } from '@/lib/api/intercambio'
import { dinero, fecha } from '@/lib/formato'

/*
  LO QUE EL PROVEEDOR LE DEBE A LA EMPRESA

  Cuando se le paga una compra con material que vale más de lo que se le debía,
  la diferencia queda a favor de la empresa —Christopher, 16/09 y 17/09/2026—:
  como crédito para la próxima compra o por cobrarle. Aquí se ve cuánto queda
  de cada uno y en qué se fue, y lo que es por cobrar se cobra.

  El crédito no se cobra aquí: se usa al pagar otra orden a este proveedor, en
  el detalle de esa compra.
*/
export function SaldosDelProveedor({ proveedorId }: { proveedorId: number }) {
  const { data: saldos } = useSaldosAFavor(proveedorId)
  const { puede } = useMisRoles()
  const [cobrando, setCobrando] = useState<SaldoAFavor | null>(null)

  if (!saldos || saldos.length === 0) return null

  const abiertos = saldos.filter((s) => s.estado === 'ABIERTO')

  return (
    <Card className="mt-4">
      <CardHeader
        title="Saldos a favor de la empresa"
        subtitle={
          abiertos.length > 0
            ? 'Lo que este proveedor le debe a la empresa por intercambios en los que el material valió más.'
            : 'Todos están liquidados.'
        }
      />
      <ul className="divide-hairline mt-3 divide-y">
        {saldos.map((s) => (
          <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0 text-sm">
              <p className="text-ink/85">
                <span className="font-mono text-xs">{s.numero}</span> ·{' '}
                {s.forma === 'CREDITO' ? 'Crédito para la próxima compra' : 'Por cobrar'}
                {s.orden ? (
                  <>
                    {' '}
                    · de la orden{' '}
                    <Link
                      to={`/app/compras/${s.orden.solicitud_id}`}
                      className="text-royal-600 dark:text-royal-300 font-mono text-xs hover:underline"
                    >
                      {s.orden.numero}
                    </Link>
                  </>
                ) : null}
              </p>
              <p className="text-ink/50 text-xs">{s.motivo}</p>
              {s.movimientos.length > 0 ? (
                <ul className="text-ink/55 mt-1 space-y-0.5 text-xs">
                  {s.movimientos.map((m) => (
                    <li key={m.id}>
                      {fecha(m.fecha)} · {m.tipo === 'APLICADO' ? 'aplicado a ' : 'cobrado'}
                      {m.tipo === 'APLICADO' && m.orden ? m.orden.numero : ''} ·{' '}
                      {dinero(s.moneda, m.monto)}
                      {m.referencia ? ` · ref. ${m.referencia}` : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="text-right">
              <p className="text-ink/90 tabular font-semibold">{dinero(s.moneda, s.pendiente)}</p>
              <p className="text-ink/45 text-xs">de {dinero(s.moneda, s.monto)}</p>
              <div className="mt-1 flex justify-end gap-2">
                <Chip tone={s.estado === 'ABIERTO' ? 'warning' : 'neutral'}>
                  {s.estado === 'ABIERTO' ? 'Pendiente' : s.estado === 'LIQUIDADO' ? 'Liquidado' : 'Anulado'}
                </Chip>
                {s.estado === 'ABIERTO' && s.forma === 'POR_COBRAR' && puede('COMPRAS') ? (
                  <Button size="sm" icon={<HandCoins />} onClick={() => setCobrando(s)}>
                    Cobrar
                  </Button>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {cobrando ? <CobrarSaldo saldo={cobrando} onCerrar={() => setCobrando(null)} /> : null}
    </Card>
  )
}

/** Entra dinero a una cuenta de la empresa, en la moneda del saldo. */
function CobrarSaldo({ saldo, onCerrar }: { saldo: SaldoAFavor; onCerrar: () => void }) {
  const cobrar = useCobrarSaldoAFavor()
  const { data: cuentas } = useCuentas(true)
  const deLaMoneda = (cuentas ?? []).filter((c) => c.moneda === saldo.moneda)
  const [cuentaId, setCuentaId] = useState(deLaMoneda.length === 1 ? String(deLaMoneda[0].id) : '')
  const [monto, setMonto] = useState(Number(saldo.pendiente).toFixed(2))
  const [referencia, setReferencia] = useState('')
  const [dia, setDia] = useState(hoyEnCaracas())
  const [nota, setNota] = useState('')
  const n = Number(monto) || 0
  const listo = cuentaId && n > 0 && n <= Number(saldo.pendiente) + 0.001

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Cobrar ${saldo.numero}`}
      descripcion={`Quedan ${dinero(saldo.moneda, saldo.pendiente)} por cobrar. El dinero entra a la cuenta que se elija.`}
      ancho="sm"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={!listo || cobrar.isPending}
            onClick={() =>
              void cobrar
                .mutateAsync({
                  saldo_id: saldo.id,
                  cuenta_id: Number(cuentaId),
                  monto: n,
                  referencia,
                  fecha: dia,
                  nota,
                })
                .then(onCerrar)
            }
          >
            {cobrar.isPending ? 'Registrando…' : 'Registrar el cobro'}
          </Button>
        </>
      }
    >
      <Select
        label="A qué cuenta entra"
        vacio={deLaMoneda.length ? 'Elige la cuenta' : `No hay cuentas en ${saldo.moneda}`}
        value={cuentaId}
        onChange={(e) => setCuentaId(e.target.value)}
        opciones={deLaMoneda.map((c) => ({ valor: String(c.id), etiqueta: c.nombre }))}
      />
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input
          label={`Monto (${saldo.moneda})`}
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />
        <Input label="Fecha" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
      </div>
      <Input
        className="mt-4"
        label="Referencia"
        value={referencia}
        onChange={(e) => setReferencia(e.target.value)}
      />
      <Textarea label="Nota" className="mt-4" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
      {cobrar.error ? <ErrorDeCarga error={cobrar.error} className="mt-4" /> : null}
    </Modal>
  )
}
