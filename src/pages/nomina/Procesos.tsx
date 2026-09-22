import { useState } from 'react'
import { Link } from 'react-router'
import { BadgeCheck, Ban, Calculator, CalendarPlus, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_PERIODO } from '@/components/pestanasDeModulos'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import {
  CONCEPTOS_DE_LEY,
  ESTADOS_PERIODO,
  cambioDeConceptos,
  conceptosDeLeyEn,
  enLista,
  useParametros,
  useAbrirPeriodo,
  useAnularPeriodo,
  useAprobarNomina,
  useCalcularNomina,
  usePagarNomina,
  usePeriodos,
} from '@/lib/api/nomina'
import type { Periodo } from '@/lib/api/nomina'
import { useActualizarTasaDelPeriodo, useDevolverNomina } from '@/lib/api/nomina'
import { useCuentas } from '@/lib/api/tesoreria'
import { useTasaVigente } from '@/lib/api/tasas'

import { useMisRoles } from '@/lib/api/catalogo'
import { bolivares, dinero, dolares, fecha } from '@/lib/formato'

/**
 * El aviso de que el período va con una tasa que ya no es la de hoy, o `null`.
 *
 * Solo para los períodos que todavía pueden cobrar: en uno pagado o anulado la
 * tasa vieja es historia y avisar sobraría. Y el umbral es la cuarta cifra
 * decimal, la misma con la que compara `pagar_nomina`, para que la pantalla no
 * avise de algo que la base deja pasar ni al revés.
 */
function avisoDeTasa(p: Periodo, tasaHoy: number | null): string | null {
  if (tasaHoy === null || !['BORRADOR', 'CALCULADA', 'APROBADA'].includes(p.estado)) return null

  const delPeriodo = Number(p.tasa_usd ?? 0)
  if (delPeriodo <= 0) return null
  if (Math.round(delPeriodo * 1e4) === Math.round(tasaHoy * 1e4)) return null

  const diferencia = (tasaHoy / delPeriodo - 1) * 100
  const menos = diferencia > 0

  /*
    EL AVISO DICE QUÉ HACER **EN ESTE ESTADO**, y no una receta genérica.

    La primera versión decía siempre «hay que actualizar la tasa y volver a
    calcular». En una nómina APROBADA eso es un callejón sin salida: no admite
    cambios de tasa ni recálculo, y hasta hoy tampoco había forma de devolverla.
    El usuario lo encontró en la primera pantalla que miró, y tenía razón: un
    aviso que manda a hacer algo imposible desde ahí es peor que no avisar.
  */
  const queHacer =
    p.estado === 'APROBADA'
      ? 'Hay que devolverla a calculada, ponerle la tasa de hoy, recalcular y volver a aprobarla.'
      : 'Hay que ponerle la tasa de hoy y volver a calcular antes de aprobar.'

  return (
    `Esta nómina va con ${delPeriodo.toFixed(4)} Bs por dólar y hoy el BCV está en ` +
    `${tasaHoy.toFixed(4)}. Pagarla así le ${menos ? 'descuenta' : 'suma'} un ` +
    `${Math.abs(diferencia).toFixed(2)} % a cada trabajador. ${queHacer}`
  )
}

/** Qué conceptos de ley cambiaron desde que se calculó la quincena, si cambió alguno. */
function AvisoConceptosCambiados({ periodo }: { periodo: Periodo }) {
  const { encendidos, apagados } = cambioDeConceptos(
    periodo.conceptos_de_ley,
    periodo.conceptos_de_ley_vigentes,
  )
  if (encendidos.length === 0 && apagados.length === 0) return null

  const partes = [
    encendidos.length > 0
      ? `${encendidos.length === 1 ? 'se encendió' : 'se encendieron'} ${enLista(encendidos)}`
      : null,
    apagados.length > 0
      ? `${apagados.length === 1 ? 'se apagó' : 'se apagaron'} ${enLista(apagados)}`
      : null,
  ].filter(Boolean)

  return (
    <p className="border-warning/30 bg-warning-soft text-ink/80 mt-3 rounded-[6px] border p-3 text-sm">
      Después de calcular esta quincena {partes.join(' y ')}. Vuelve a calcularla antes de
      aprobarla.
    </p>
  )
}

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

/*
  LAS FECHAS NO DECIDEN CUÁNTO SE PAGA, Y ESO HAY QUE DECIRLO EN VOZ ALTA.

  Christopher trajo el reclamo: «lo puse desde el 1 al 14 y me arroja el mismo
  monto». Era cierto, y es a propósito: una quincena paga 15 días vengan las
  fechas que vengan, igual que agosto del 16 al 31 —dieciséis días de
  calendario— también pagó 15. El salario mensual se divide siempre entre 30.

  El fallo no era el cálculo: era que el sistema aceptaba en silencio unas
  fechas que no iban a hacer lo que quien las escribía creía. El `hint` del
  selector ya lo contaba en general, pero un aviso general no se lee; uno que
  aparece justo cuando el caso ocurre, sí.

  No se prohíbe abrirlo. Un período corto es legítimo —un cierre, una
  liquidación— y prohibirlo quitaría flexibilidad real para atajar un error de
  tecleo. Se avisa y se deja seguir, que es lo que se decidió.
*/
const DIAS_QUE_PAGA: Record<string, number> = { SEMANAL: 7, QUINCENAL: 15, MENSUAL: 30 }

function avisoDeFechas(tipo: string, desde: string, hasta: string): string | null {
  const paga = DIAS_QUE_PAGA[tipo]
  if (!paga || !desde || !hasta) return null

  const d = new Date(desde + 'T00:00:00')
  const h = new Date(hasta + 'T00:00:00')
  if (Number.isNaN(d.getTime()) || Number.isNaN(h.getTime()) || h < d) return null

  const calendario = Math.round((h.getTime() - d.getTime()) / 86400000) + 1
  if (calendario === paga) return null

  return `Estas fechas abarcan ${calendario} ${calendario === 1 ? 'día' : 'días'} de calendario, pero este período pagará ${paga} igual: las fechas no cambian el monto. Sirven para prorratear a quien entre o salga a mitad de período, y para que dos nóminas no se pisen.`
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
  const actualizarTasa = useActualizarTasaDelPeriodo()
  const devolver = useDevolverNomina()
  const { data: tasaHoy } = useTasaVigente('USD', 'BCV')
  const tasaDeHoy = tasaHoy?.tasa ? Number(tasaHoy.tasa) : null
  const { data: parametros } = useParametros()

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
  /*
    La nómina la paga Recursos Humanos.

    Tesorería no existe en La Cantera —la absorbió Compras— y el rol se retiró
    el 25/08/2026. `pagar_nomina` pasó a pedir RRHH o el gerente general, que es
    lo que decidió Christopher: quien arma la nómina la paga. Este botón pedía
    el rol viejo, así que sin esto se habría quedado escondido para todo el
    mundo menos administración.
  */
  const puedePagar = puede('RRHH', 'GERENTE_GENERAL')

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

      <Pestanas pestanas={PESTANAS_PERIODO} />

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

              {/*
                UN INTERRUPTOR SE MOVIÓ DESPUÉS DE CALCULAR.

                Los recibos están hechos con conceptos de ley que ya no rigen para
                esta quincena, y la base no deja aprobarla así. Se dice aquí, y
                cuáles, antes de que alguien pulse «Aprobar la nómina» y se
                encuentre el rechazo.
              */}
              {p.estado === 'CALCULADA' ? <AvisoConceptosCambiados periodo={p} /> : null}

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

              {/*
                LA TASA DEL RECIBO CONTRA LA DE HOY.

                31 de 32 sueldos están pactados en dólares, así que la tasa del
                período no decora: con ella se convierte lo que cobra cada
                quien. Una nómina calculada el día 11 y pagada el 22 le paga a
                todo el mundo la devaluación de esos once días de menos —el
                22/09/2026 eran 2,39 %—.

                `pagar_nomina` ya se niega a pagar así. Esto es el aviso que lo
                dice ANTES, para que nadie llegue al botón y se lleve un error
                sin entender por qué.
              */}
              {avisoDeTasa(p, tasaDeHoy) ? (
                <p className="border-warning/40 bg-warning-soft text-warning mt-4 rounded-[6px] border p-3 text-xs">
                  {avisoDeTasa(p, tasaDeHoy)}

                  {/* El botón que corresponde al estado. En una aprobada, lo
                      primero es devolverla: sin eso no admite ni tasa ni
                      recálculo, y el aviso quedaría mandando al vacío. */}
                  {puedeRRHH && ['BORRADOR', 'CALCULADA'].includes(p.estado) ? (
                    <button
                      type="button"
                      className="ml-2 font-medium underline underline-offset-4"
                      disabled={actualizarTasa.isPending}
                      onClick={() => void actualizarTasa.mutateAsync({ periodo_id: p.id })}
                    >
                      {actualizarTasa.isPending ? 'Poniendo…' : 'Poner la tasa de hoy'}
                    </button>
                  ) : null}

                  {puedeGerente && p.estado === 'APROBADA' ? (
                    <button
                      type="button"
                      className="ml-2 font-medium underline underline-offset-4"
                      disabled={devolver.isPending}
                      onClick={() =>
                        void devolver.mutateAsync({
                          periodo_id: p.id,
                          motivo: 'La tasa del período ya no es la del día',
                        })
                      }
                    >
                      {devolver.isPending ? 'Devolviendo…' : 'Devolver a calculada'}
                    </button>
                  ) : null}

                  {/* Quien no aprueba tampoco desaprueba: quitar una
                      aprobación es un acto de control. Se dice a quién
                      pedírselo en vez de dejar un aviso sin salida. */}
                  {!puedeGerente && p.estado === 'APROBADA' ? (
                    <span className="ml-1 font-medium">
                      Pídele a gerencia general que la devuelva a calculada.
                    </span>
                  ) : null}
                </p>
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

                  {puedePagar && p.estado === 'APROBADA' ? (
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
            {(() => {
              const aviso = avisoDeFechas(nuevo.tipo, nuevo.desde, nuevo.hasta)
              return aviso ? (
                <p className="border-warning/40 bg-warning-soft text-warning rounded-[6px] border p-3 text-xs">
                  {aviso}
                </p>
              ) : null
            })()}
            {/*
              EL PERÍODO TRAE LOS CONCEPTOS DE LEY QUE RIJAN PARA SU CIERRE.

              No se eligen aquí: los deciden los interruptores de Parámetros de
              nómina, por fecha. Se dice antes de abrir para que nadie se entere
              al ver los recibos de que no llevan, o sí llevan, seguro social.
            */}
            {nuevo.hasta && parametros
              ? (() => {
                  const nombres = conceptosDeLeyEn(parametros, nuevo.hasta).map(
                    (c) => CONCEPTOS_DE_LEY.find((x) => x.codigo === c)?.nombre ?? c,
                  )
                  return (
                    <p className="border-hairline bg-canvas text-ink/70 rounded-[6px] border p-3 text-xs">
                      {nombres.length === 0
                        ? 'Este período calculará solo lo pactado: el sueldo de la ficha, los bonos y descuentos, y las faltas.'
                        : `Además de lo pactado, este período calculará: ${enLista(nombres)}.`}{' '}
                      Son los conceptos de ley que rigen el día que cierra; se cambian en Parámetros de
                      nómina y se guardan al calcularlo.
                    </p>
                  )
                })()
              : null}
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
            <SelectBuscable
              label="De qué cuenta sale"
              vacio="Elige la cuenta"
              valor={pago.cuenta}
              onCambio={(v) => setPago((p) => ({ ...p, cuenta: v }))}
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
