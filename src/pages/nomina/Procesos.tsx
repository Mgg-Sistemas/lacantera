import { useState } from 'react'
import { Link } from 'react-router'
import { BadgeCheck, Ban, Calculator, CalendarPlus, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import {
  ESTADOS_PERIODO,
  useAbrirPeriodo,
  useAnularPeriodo,
  useAprobarNomina,
  useCalcularNomina,
  usePagarNomina,
  usePeriodos,
} from '@/lib/api/nomina'
import type { Periodo } from '@/lib/api/nomina'
import { useCuentas } from '@/lib/api/tesoreria'
import { useMisRoles } from '@/lib/api/catalogo'
import { bolivares, dinero, dolares, fecha } from '@/lib/formato'

/** Qué toca hacer ahora con este período. Una sola acción por estado. */
function siguiente(p: Periodo): string {
  if (p.estado === 'BORRADOR')
    return 'Carga las novedades del período —horas extra, faltas, bonos— y calcula.'
  if (p.estado === 'CALCULADA')
    return 'Revisa los recibos. Al aprobar, la nómina queda lista para que tesorería pague.'
  if (p.estado === 'APROBADA') return 'Tesorería paga desde una cuenta y el saldo baja.'
  if (p.estado === 'PAGADA') return 'Cerrada. Los recibos quedan como comprobante.'
  return p.motivo_anulacion ?? 'Anulada.'
}

export function Procesos() {
  const { data, isPending, error } = usePeriodos()
  const { data: cuentas } = useCuentas(true)
  const { puede } = useMisRoles()

  const abrir = useAbrirPeriodo()
  const calcular = useCalcularNomina()
  const aprobar = useAprobarNomina()
  const anular = useAnularPeriodo()
  const pagar = usePagarNomina()

  const [nuevo, setNuevo] = useState<null | {
    tipo: string
    desde: string
    hasta: string
    descripcion: string
  }>(null)
  const [pagando, setPagando] = useState<Periodo | null>(null)
  const [pago, setPago] = useState({ cuenta: '', referencia: '', fecha: '' })
  const [anulando, setAnulando] = useState<Periodo | null>(null)
  const [motivo, setMotivo] = useState('')

  const puedeRRHH = puede('RRHH')
  const puedeGerente = puede('GERENTE_GENERAL')
  const puedeTesoreria = puede('TESORERIA')

  return (
    <>
      <PageHeader
        title="Procesar nómina"
        description="Un período se abre, se calcula, se aprueba y se paga. No se salta pasos: cada uno deja constancia de quién lo hizo."
        actions={
          puedeRRHH ? (
            <Button
              icon={<CalendarPlus />}
              onClick={() =>
                setNuevo({ tipo: 'QUINCENAL', desde: '', hasta: '', descripcion: '' })
              }
            >
              Abrir período
            </Button>
          ) : null
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<Calculator />}
            titulo="Todavía no hay ningún período"
            descripcion="Una nómina empieza abriendo el período que se va a pagar."
            accion={
              puedeRRHH ? (
                <Button
                  icon={<CalendarPlus />}
                  onClick={() =>
                    setNuevo({ tipo: 'QUINCENAL', desde: '', hasta: '', descripcion: '' })
                  }
                >
                  Abrir el primero
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : null}

      <div className="space-y-4">
        {(data ?? []).map((p) => {
          const etiqueta = ESTADOS_PERIODO[p.estado]
          return (
            <Card key={p.id}>
              <CardHeader
                title={`${p.numero} · ${fecha(p.desde)} al ${fecha(p.hasta)}`}
                subtitle={p.descripcion ?? `${p.dias} días · ${p.tipo.toLowerCase()}`}
                action={<Chip tone={etiqueta.tono}>{etiqueta.texto}</Chip>}
              />

              <p className="text-ink/60 mt-3 text-sm">{siguiente(p)}</p>

              {Number(p.recibos ?? 0) > 0 ? (
                <dl className="border-hairline mt-4 grid gap-4 border-t pt-4 sm:grid-cols-4">
                  <div>
                    <dt className="text-ink/45 text-xs">Recibos</dt>
                    <dd className="text-ink/90 tabular text-lg font-semibold">{p.recibos}</dd>
                  </div>
                  <div>
                    <dt className="text-ink/45 text-xs">Asignaciones</dt>
                    <dd className="text-ink/80 tabular text-sm">{bolivares(p.total_asignado)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink/45 text-xs">Deducciones</dt>
                    <dd className="text-ink/80 tabular text-sm">{bolivares(p.total_deducido)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink/45 text-xs">Neto a pagar</dt>
                    <dd className="text-safety tabular text-lg font-semibold">
                      {bolivares(p.total_neto)}
                    </dd>
                    <dd className="text-ink/40 tabular text-xs">{dolares(p.total_neto_usd)}</dd>
                  </div>
                </dl>
              ) : null}

              {p.estado !== 'ANULADA' ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {puedeRRHH && ['BORRADOR', 'CALCULADA'].includes(p.estado) ? (
                    <>
                      <Link to={`/app/nomina/asistencia?periodo=${p.id}`}>
                        <Button size="sm" variant="outline">
                          Cargar novedades
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        icon={<Calculator />}
                        disabled={calcular.isPending}
                        onClick={() => void calcular.mutateAsync({ periodo_id: p.id })}
                      >
                        {calcular.isPending ? 'Calculando…' : 'Calcular'}
                      </Button>
                    </>
                  ) : null}

                  {Number(p.recibos ?? 0) > 0 ? (
                    <Link to={`/app/nomina/recibos?periodo=${p.id}`}>
                      <Button size="sm" variant="outline">
                        Ver recibos
                      </Button>
                    </Link>
                  ) : null}

                  {puedeGerente && p.estado === 'CALCULADA' ? (
                    <Button
                      size="sm"
                      icon={<BadgeCheck />}
                      disabled={aprobar.isPending}
                      onClick={() => void aprobar.mutateAsync({ periodo_id: p.id })}
                    >
                      Aprobar la nómina
                    </Button>
                  ) : null}

                  {puedeTesoreria && p.estado === 'APROBADA' ? (
                    <Button
                      size="sm"
                      icon={<Wallet />}
                      onClick={() => {
                        setPagando(p)
                        setPago({ cuenta: '', referencia: '', fecha: '' })
                      }}
                    >
                      Pagar
                    </Button>
                  ) : null}

                  {puedeRRHH && ['BORRADOR', 'CALCULADA', 'APROBADA'].includes(p.estado) ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Ban />}
                      className="text-danger"
                      onClick={() => {
                        setAnulando(p)
                        setMotivo('')
                      }}
                    >
                      Anular
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {calcular.error ? <ErrorDeCarga error={calcular.error} className="mt-3" /> : null}
              {aprobar.error ? <ErrorDeCarga error={aprobar.error} className="mt-3" /> : null}
            </Card>
          )
        })}
      </div>

      {/* ---------------------------- Abrir ---------------------------- */}
      {nuevo ? (
        <Modal
          abierto
          onCerrar={() => setNuevo(null)}
          titulo="Abrir un período"
          descripcion="La tasa del BCV se congela al abrirlo: si se moviera, el mismo recibo valdría distinto cada vez."
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setNuevo(null)}>
                Cancelar
              </Button>
              <Button
                disabled={abrir.isPending || !nuevo.desde || !nuevo.hasta}
                onClick={async () => {
                  await abrir.mutateAsync(nuevo)
                  setNuevo(null)
                }}
              >
                {abrir.isPending ? 'Abriendo…' : 'Abrir'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Select
              label="Tipo"
              value={nuevo.tipo}
              onChange={(e) => setNuevo((n) => (n ? { ...n, tipo: e.target.value } : n))}
              opciones={[
                { valor: 'SEMANAL', etiqueta: 'Semanal — 7 días' },
                { valor: 'QUINCENAL', etiqueta: 'Quincenal — 15 días' },
                { valor: 'MENSUAL', etiqueta: 'Mensual — 30 días' },
                { valor: 'ESPECIAL', etiqueta: 'Especial — días del calendario' },
              ]}
              hint="Los días que se pagan no son los del calendario: el mes son 30, tenga 28 o 31."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Desde"
                type="date"
                value={nuevo.desde}
                onChange={(e) => setNuevo((n) => (n ? { ...n, desde: e.target.value } : n))}
              />
              <Input
                label="Hasta"
                type="date"
                value={nuevo.hasta}
                onChange={(e) => setNuevo((n) => (n ? { ...n, hasta: e.target.value } : n))}
              />
            </div>
            <Input
              label="Descripción"
              placeholder="Segunda quincena de julio"
              value={nuevo.descripcion}
              onChange={(e) => setNuevo((n) => (n ? { ...n, descripcion: e.target.value } : n))}
            />
            {abrir.error ? <ErrorDeCarga error={abrir.error} /> : null}
          </div>
        </Modal>
      ) : null}

      {/* ---------------------------- Pagar ---------------------------- */}
      {pagando ? (
        <Modal
          abierto
          onCerrar={() => setPagando(null)}
          titulo={`Pagar la nómina ${pagando.numero}`}
          descripcion={`${pagando.recibos} trabajadores · ${bolivares(pagando.total_neto)}`}
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setPagando(null)}>
                Cancelar
              </Button>
              <Button
                disabled={pagar.isPending || !pago.cuenta}
                onClick={async () => {
                  await pagar.mutateAsync({
                    periodo_id: pagando.id,
                    cuenta_id: Number(pago.cuenta),
                    referencia: pago.referencia,
                    fecha: pago.fecha,
                  })
                  setPagando(null)
                }}
              >
                {pagar.isPending ? 'Pagando…' : 'Confirmar el pago'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Select
              label="De qué cuenta sale"
              vacio="Elige la cuenta"
              value={pago.cuenta}
              onChange={(e) => setPago((p) => ({ ...p, cuenta: e.target.value }))}
              opciones={(cuentas ?? []).map((c) => ({
                valor: String(c.id),
                etiqueta: `${c.nombre} — ${dinero(c.moneda, c.saldo)}`,
              }))}
              hint="Los recibos están en bolívares. Desde una cuenta en divisas sale el equivalente a la tasa del período, la misma con la que se calculó."
            />
            <Input
              label="Referencia"
              value={pago.referencia}
              onChange={(e) => setPago((p) => ({ ...p, referencia: e.target.value }))}
            />
            <Input
              label="Fecha del pago"
              type="date"
              hint="Vacío es hoy."
              value={pago.fecha}
              onChange={(e) => setPago((p) => ({ ...p, fecha: e.target.value }))}
            />
            {pagar.error ? <ErrorDeCarga error={pagar.error} /> : null}
          </div>
        </Modal>
      ) : null}

      {/* ---------------------------- Anular ---------------------------- */}
      {anulando ? (
        <Modal
          abierto
          onCerrar={() => setAnulando(null)}
          titulo={`Anular ${anulando.numero}`}
          descripcion="El período queda a la vista con su motivo. Una nómina pagada no se puede anular."
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setAnulando(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={anular.isPending || motivo.trim().length < 10}
                onClick={async () => {
                  await anular.mutateAsync({ periodo_id: anulando.id, motivo })
                  setAnulando(null)
                }}
              >
                {anular.isPending ? 'Anulando…' : 'Anular'}
              </Button>
            </>
          }
        >
          <Textarea
            label="Por qué se anula"
            rows={3}
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            hint="La nómina es un documento con consecuencias legales."
          />
          {anular.error ? <ErrorDeCarga error={anular.error} className="mt-3" /> : null}
        </Modal>
      ) : null}
    </>
  )
}
