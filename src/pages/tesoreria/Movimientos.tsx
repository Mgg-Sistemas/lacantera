import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { BookOpen, Undo2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Modal } from '@/components/ui/Modal'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { RangoDeFechas } from '@/components/RangoDeFechas'
import { SIN_RANGO } from '@/components/rango'
import type { Rango } from '@/components/rango'
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
  /*
    LA CUENTA VIENE EN LA DIRECCIÓN

    Christopher: «las cuentas y bancos de la tesorería no tienen un historial de
    movimientos, pensé que lo tenían». Lo tenían —este libro filtra por cuenta—
    pero no había cómo llegar: la tarjeta de la cuenta decía «14 movimientos» y
    no llevaba a ninguna parte, así que había que venir aquí y volver a buscar
    la cuenta en un selector.

    Al vivir el filtro en la dirección, además, el enlace se puede guardar y
    volver atrás en el navegador deshace el filtro en vez de salir del libro.
  */
  const [params, setParams] = useSearchParams()
  const cuentaId = params.get('cuenta') ?? ''
  const setCuentaId = (v: string) => {
    if (v) setParams({ cuenta: v }, { replace: true })
    else setParams({}, { replace: true })
  }
  const { data: cuentas } = useCuentas(false)
  const [rango, setRango] = useState<Rango>(SIN_RANGO)
  const { data, isPending, error } = useMovimientosTesoreria({
    cuentaId: cuentaId ? Number(cuentaId) : undefined,
    desde: rango.desde || undefined,
    hasta: rango.hasta || undefined,
  })
  const { data: perfiles } = usePerfiles()
  const { puede } = useMisRoles()
  const reversar = useReversarTesoreria()

  const [reverso, setReverso] = useState<MovimientoTesoreria | null>(null)
  const [motivo, setMotivo] = useState('')

  const nombreDe = (uid: string | null) =>
    (uid && perfiles?.find((p) => p.id === uid)?.nombre) || '—'

  const puedeReversar = puede('TESORERIA')
  const cuentaElegida = cuentaId ? cuentas?.find((c) => String(c.id) === cuentaId) : undefined

  return (
    <>
      <PageHeader
        title={cuentaElegida ? `Movimientos de ${cuentaElegida.nombre}` : 'Libro de tesorería'}
        description="Todo el dinero que entró y salió. No se edita ni se borra: para deshacer algo se escribe el movimiento contrario, y quedan los dos a la vista — el equivocado y el que lo corrige."
      />

      <Card className="mb-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,20rem)_1fr]">
          <SelectBuscable
            label="Cuenta"
            hint={
              // Con una cuenta elegida, el saldo de esa cuenta es la cifra
              // contra la que se leen sus movimientos. Sin él hay que salir a
              // buscarlo a otra pantalla y volver.
              cuentaElegida
                ? `Saldo hoy: ${dinero(cuentaElegida.moneda, cuentaElegida.saldo)}`
                : undefined
            }
            vacio="Todas las cuentas"
            valor={cuentaId}
            onCambio={(v) => setCuentaId(v)}
            opciones={(cuentas ?? []).map((c) => ({
              valor: String(c.id),
              etiqueta: c.nombre,
            }))}
          />
          <RangoDeFechas valor={rango} onCambio={setRango} />
        </div>
      </Card>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<BookOpen />}
            titulo={
              rango.desde || rango.hasta || cuentaId
                ? 'Nada con esos filtros'
                : 'Todavía no hay movimientos'
            }
            descripcion={
              rango.desde || rango.hasta || cuentaId
                ? 'No se movió dinero en lo que estás mirando. Prueba a ampliar las fechas o a quitar la cuenta.'
                : 'El libro se llena solo: cada pago, ingreso o traslado escribe su línea.'
            }
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
                      {/* No se reversa: lo que ya es un reverso, el pago de una
                          compra —se devuelve la instrucción desde la compra—,
                          una mitad de traslado, que devolvería el dinero al
                          origen dejándolo también en el destino, ni el pago de
                          una nómina, que dejaría los recibos cobrados y el
                          banco intacto. */}
                      {puedeReversar &&
                      !m.movimiento_origen &&
                      !m.instruccion_id &&
                      !m.transferencia_par &&
                      !m.nomina_periodo_id ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Undo2 />}
                          onClick={() => {
                            setReverso(m)
                            setMotivo('')
                          }}
                        >
                          Deshacer
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
          titulo={`Deshacer ${reverso.numero}`}
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
                {reversar.isPending ? 'Guardando…' : 'Deshacer'}
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
            label="Por qué se deshace"
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
