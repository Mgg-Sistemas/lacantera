import { useState } from 'react'
import { BookOpen, Undo2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import {
  TIPOS_TESORERIA,
  useCuentas,
  useMovimientosTesoreria,
  useReversarTesoreria,
} from '@/lib/api/tesoreria'
import type { MovimientoTesoreria } from '@/lib/api/tesoreria'
import { usePerfiles, useMisRoles } from '@/lib/api/catalogo'
import { bolivares, dinero, dolares, fecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

export function MovimientosTesoreria() {
  const [cuentaId, setCuentaId] = useState('')
  const { data: cuentas } = useCuentas(false)
  const { data, isPending, error } = useMovimientosTesoreria({
    cuentaId: cuentaId ? Number(cuentaId) : undefined,
  })
  const { data: perfiles } = usePerfiles()
  const { puede } = useMisRoles()
  const reversar = useReversarTesoreria()

  const [reverso, setReverso] = useState<MovimientoTesoreria | null>(null)
  const [motivo, setMotivo] = useState('')

  const nombreDe = (uid: string | null) =>
    (uid && perfiles?.find((p) => p.id === uid)?.nombre) || '—'

  const puedeReversar = puede('TESORERIA')

  return (
    <>
      <PageHeader
        title="Libro de tesorería"
        description="Todo el dinero que entró y salió. No se edita ni se borra: lo que estuvo mal se reversa y las dos líneas quedan."
      />

      <Card className="mb-4">
        <div className="sm:max-w-xs">
          <Select
            label="Cuenta"
            vacio="Todas las cuentas"
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
            opciones={(cuentas ?? []).map((c) => ({
              valor: String(c.id),
              etiqueta: `${c.nombre} — ${dinero(c.moneda, c.saldo)}`,
            }))}
          />
        </div>
      </Card>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<BookOpen />}
            titulo="Todavía no hay movimientos"
            descripcion="El libro se llena solo: cada pago, ingreso o traslado escribe su línea."
          />
        </Card>
      ) : null}

      {data && data.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Movimiento</th>
                  <th className="px-3 py-3 font-medium">Fecha</th>
                  <th className="px-3 py-3 font-medium">Cuenta</th>
                  <th className="px-3 py-3 font-medium">Concepto</th>
                  <th className="px-3 py-3 text-right font-medium">Monto</th>
                  <th className="px-5 py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {data.map((m) => (
                  <tr
                    key={m.id}
                    className="border-hairline border-b align-top last:border-0"
                  >
                    <td className="px-5 py-3">
                      <p className="text-ink/60 font-mono text-xs">{m.numero}</p>
                      <Chip
                        tone={
                          m.tipo === 'REVERSO' || m.tipo === 'AJUSTE'
                            ? 'warning'
                            : m.signo > 0
                              ? 'success'
                              : 'neutral'
                        }
                      >
                        {TIPOS_TESORERIA[m.tipo] ?? m.tipo}
                      </Chip>
                    </td>
                    <td className="text-ink/70 px-3 py-3 whitespace-nowrap">
                      {fecha(m.fecha)}
                    </td>
                    <td className="text-ink/70 px-3 py-3">{m.cuenta?.nombre ?? '—'}</td>
                    <td className="text-ink/75 px-3 py-3">
                      {m.concepto}
                      {m.contraparte ? (
                        <span className="text-ink/45 block text-xs">{m.contraparte}</span>
                      ) : null}
                      {m.referencia ? (
                        <span className="text-ink/40 block font-mono text-xs">
                          Ref. {m.referencia}
                        </span>
                      ) : null}
                      <span className="text-ink/35 block text-xs">
                        {nombreDe(m.registrado_por)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <p
                        className={cn(
                          'tabular font-medium whitespace-nowrap',
                          m.signo > 0 ? 'text-success' : 'text-ink/85',
                        )}
                      >
                        {m.signo > 0 ? '+' : '−'}{' '}
                        {dinero(m.cuenta?.moneda ?? 'USD', m.monto)}
                      </p>
                      {/* La otra moneda, con la tasa congelada del día del
                          movimiento: es lo que permite comparar un pago de
                          enero con uno de julio. */}
                      <p className="text-ink/35 tabular text-xs">
                        {m.cuenta?.moneda === 'VES'
                          ? dolares(m.monto_usd)
                          : bolivares(m.monto_bs)}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {puedeReversar && !m.movimiento_origen && !m.instruccion_id ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Undo2 />}
                          onClick={() => {
                            setReverso(m)
                            setMotivo('')
                          }}
                        >
                          Reversar
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {reverso ? (
        <Modal
          abierto
          onCerrar={() => setReverso(null)}
          titulo={`Reversar ${reverso.numero}`}
          descripcion="Se escribe el movimiento contrario. El equivocado se queda a la vista: así se entiende qué pasó."
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setReverso(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={reversar.isPending || motivo.trim().length < 10}
                onClick={async () => {
                  await reversar.mutateAsync({ id: reverso.id, motivo })
                  setReverso(null)
                }}
              >
                {reversar.isPending ? 'Guardando…' : 'Reversar'}
              </Button>
            </>
          }
        >
          <div className="border-hairline bg-canvas rounded-card mb-4 border p-3 text-sm">
            <p className="text-ink/75">{reverso.concepto}</p>
            <p className="text-ink/90 tabular mt-1 font-medium">
              {reverso.signo > 0 ? '+' : '−'}{' '}
              {dinero(reverso.cuenta?.moneda ?? 'USD', reverso.monto)}
            </p>
          </div>

          <Textarea
            label="Por qué se reversa"
            rows={3}
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            hint="Queda escrito en el movimiento nuevo."
          />

          {reversar.error ? <ErrorDeCarga error={reversar.error} className="mt-3" /> : null}
        </Modal>
      ) : null}
    </>
  )
}
