import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { BookOpen, Undo2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { RangoDeFechas } from '@/components/RangoDeFechas'
import { SIN_RANGO } from '@/components/rango'
import type { Rango } from '@/components/rango'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import {
  TIPOS_TESORERIA,
  METODOS_DE_PAGO,
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

  /*
    El filtro era «de qué cuenta salió» y ya no hay cuentas.

    Christopher: «ya no se manejan cajas ni bancos, esto dará error tarde o
    temprano». Lo que la empresa sí lleva —y ya se registraba sin que este libro
    lo mirase— es cómo se pagó y en qué moneda.

    Los dos siguen viviendo en la dirección, por lo mismo que vivía la cuenta:
    el enlace se puede guardar y volver atrás deshace el filtro en vez de salir
    del libro.
  */
  const metodo = params.get('metodo') ?? ''
  const moneda = params.get('moneda') ?? ''
  const filtrar = (clave: string, v: string) => {
    const siguiente = new URLSearchParams(params)
    if (v) siguiente.set(clave, v)
    else siguiente.delete(clave)
    setParams(siguiente, { replace: true })
  }

  const [rango, setRango] = useState<Rango>(SIN_RANGO)
  const { data, isPending, error } = useMovimientosTesoreria({
    metodo: metodo || undefined,
    moneda: moneda || undefined,
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

  return (
    <>
      <PageHeader
        title="Libro de tesorería"
        description="Todo el dinero que entró y salió. No se edita ni se borra: para deshacer algo se escribe el movimiento contrario, y quedan los dos a la vista — el equivocado y el que lo corrige."
      />

      <Card className="mb-4">
        {/*
          Los atajos de fecha piden una linea entera, y con dos desplegables
          delante no la tienen: «Esta semana» se partia en dos renglones y la
          fila quedaba con cuatro pastillas de dos pisos.

          Con `flex-wrap` y un ancho minimo de verdad, el rango se baja solo a su
          propia linea cuando no cabe al lado. Es lo contrario de apretarlo:
          se le pide el sitio que necesita y el navegador decide donde ponerlo.
        */}
        <div className="flex flex-wrap items-start gap-3">
          <div className="w-full sm:w-48">
            <Select
              label="Cómo se pagó"
              vacio="De cualquier forma"
              value={metodo}
              onChange={(e) => filtrar('metodo', e.target.value)}
              opciones={METODOS_DE_PAGO.map((m) => ({ valor: m.valor, etiqueta: m.etiqueta }))}
            />
          </div>

          <div className="w-full sm:w-36">
            <Select
              label="Moneda"
              vacio="Todas"
              value={moneda}
              onChange={(e) => filtrar('moneda', e.target.value)}
              opciones={[
                { valor: 'USD', etiqueta: 'Dólares' },
                { valor: 'VES', etiqueta: 'Bolívares' },
                { valor: 'USDT', etiqueta: 'USDT' },
                { valor: 'EUR', etiqueta: 'Euros' },
              ]}
            />
          </div>

          <div className="min-w-0 flex-1">
            <RangoDeFechas valor={rango} onCambio={setRango} />
          </div>
        </div>
      </Card>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<BookOpen />}
            titulo={
              rango.desde || rango.hasta || metodo || moneda
                ? 'Nada con esos filtros'
                : 'Todavía no hay movimientos'
            }
            descripcion={
              rango.desde || rango.hasta || metodo || moneda
                ? 'No se movió dinero en lo que estás mirando. Prueba a ampliar las fechas o a quitar los filtros.'
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
                  <th className="px-3 py-3 font-medium">Cómo se pagó</th>
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
                    <td className="text-ink/70 px-3 py-3">
                      {/* Lo viejo nombra una cuenta y lo nuevo un método. Se
                          enseña lo que haya: esconder los quince movimientos
                          anteriores para que la columna quede limpia sería
                          borrar historia por estética. */}
                      {METODOS_DE_PAGO.find((x) => x.valor === m.metodo)?.etiqueta ??
                        m.metodo ??
                        m.cuenta?.nombre ??
                        '—'}
                      {m.moneda ? (
                        <span className="text-ink/40 ml-1.5 text-xs">{m.moneda}</span>
                      ) : null}
                    </td>
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
                        {dinero(m.moneda ?? m.cuenta?.moneda ?? 'USD', m.monto)}
                      </p>
                      {/* La otra moneda, con la tasa congelada del día del
                          movimiento: es lo que permite comparar un pago de
                          enero con uno de julio. */}
                      <p className="text-ink/35 tabular text-xs">
                        {(m.moneda ?? m.cuenta?.moneda) === 'VES'
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
