import { useEffect, useMemo, useState } from 'react'
import { useMonedasUsables, enSimbolos } from '@/lib/api/tasas'
import { useSearchParams } from 'react-router'
import { CalendarClock, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_PERIODO } from '@/components/pestanasDeModulos'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import {
  ESTADOS_PERIODO,
  useConceptos,
  useEliminarNovedadMonto,
  useEmpleados,
  useGuardarNovedad,
  useFaltas,
  useMarcarFalta,
  useGuardarNovedadMonto,
  useNovedades,
  useNovedadesMontos,
  usePeriodos,
} from '@/lib/api/nomina'
import type { Empleado, FaltaDelPeriodo, Periodo } from '@/lib/api/nomina'
import { opcionesDe, useMetodosPago } from '@/lib/api/metodosPago'
import { useMisRoles } from '@/lib/api/catalogo'
import { dinero, fecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

/** Los campos que se teclean por trabajador y período. */
const CAMPOS = [
  { clave: 'he_diurnas', columna: 'horas_extra_diurnas', etiqueta: 'HE diurnas' },
  { clave: 'he_nocturnas', columna: 'horas_extra_nocturnas', etiqueta: 'HE nocturnas' },
  { clave: 'horas_nocturnas', columna: 'horas_nocturnas', etiqueta: 'H. nocturnas' },
  { clave: 'feriados', columna: 'dias_feriados_trabajados', etiqueta: 'Feriados trab.' },
  { clave: 'descansos', columna: 'dias_descanso_trabajados', etiqueta: 'Descansos trab.' },
] as const

/*
  Las dos casillas de faltas salieron de esta rejilla.

  Ahora los dias se señalan en el calendario de arriba y la base recuenta sola
  las columnas de nomina_novedades. Dejarlas aqui serian dos sitios diciendo lo
  mismo, y el que se toque de ultimo gana — que es como se pierde una falta.

  `guardar_novedad` ademas las ignora, asi que ni una pestaña abierta desde
  antes del cambio puede borrarlas.
*/

type Fila = Record<string, string>

/*
  LOS DÍAS DE LA QUINCENA, UNO A UNO

  La líder: «QUE DEL PAGO QUINCENAL SE VEA DIARIO, Y QUE PERMITA INDICAR SI NO
  TRABAJÓ ALGÚN DÍA PARA DESCONTARLO. QUE PUEDA ESCOGER LOS DÍAS QUE FALTÓ Y SE
  LE DESCUENTE». Y de la pantalla anterior dijo que no era intuitiva: eran siete
  casillas numéricas por persona, y en dos de ellas se tecleaba un número de
  faltas que no decía qué días.

  Un «2» no se puede discutir el día del reclamo. Dos fechas señaladas sí.

  SE ELIGE A LA PERSONA Y SE VE SU QUINCENA. Lo decidió Christopher entre las dos
  formas posibles. La otra —todo el mundo en filas y los días en columnas— era
  más rápida para cerrar la quincena de veinte personas, pero se lee peor cuando
  hay que explicarle a alguien por qué le descontaron.

  Para que elegir uno a uno no signifique entrar y salir diecinueve veces, la
  lista de la izquierda se queda a la vista con lo que lleva marcado cada quien.
*/

const DIAS_SEMANA = ['do', 'lu', 'ma', 'mi', 'ju', 'vi', 'sá']

/** Las fechas del período, de la primera a la última, sin saltarse ninguna. */
function diasDelPeriodo(desde: string, hasta: string): string[] {
  const dias: string[] = []
  // Se recorre en UTC a propósito: las fechas de la base son `date` sin hora, y
  // construirlas en la zona local haría que en Caracas —UTC-4— el día 16 se
  // leyera como el 15 a las ocho de la noche.
  const d = new Date(desde + 'T00:00:00Z')
  const fin = new Date(hasta + 'T00:00:00Z')
  while (d <= fin) {
    dias.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return dias
}

function DiasDelPeriodo({
  periodo,
  empleados,
  editable,
}: {
  periodo: Periodo
  empleados: Empleado[]
  editable: boolean
}) {
  const faltas = useFaltas(periodo.id)
  const marcar = useMarcarFalta()
  const [elegido, setElegido] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const quien = elegido ?? empleados[0]?.id ?? null
  const trabajador = empleados.find((e) => e.id === quien)

  const dias = useMemo(() => diasDelPeriodo(periodo.desde, periodo.hasta), [periodo.desde, periodo.hasta])

  /** Lo marcado, por trabajador y por fecha. */
  const porTrabajador = useMemo(() => {
    const mapa = new Map<number, Map<string, FaltaDelPeriodo>>()
    for (const f of faltas.data ?? []) {
      const suyas = mapa.get(f.empleado_id) ?? new Map()
      suyas.set(f.fecha, f)
      mapa.set(f.empleado_id, suyas)
    }
    return mapa
  }, [faltas.data])

  const suyas = quien ? (porTrabajador.get(quien) ?? new Map<string, FaltaDelPeriodo>()) : new Map()

  const cuenta = (id: number, tipo: 'INJUSTIFICADA' | 'JUSTIFICADA') =>
    [...(porTrabajador.get(id)?.values() ?? [])].filter((f) => f.tipo === tipo).length

  /*
    LOS TRES NÚMEROS, EN VIVO

    Facturados es lo que paga el período —quince en una quincena, aunque el
    rango tenga dieciséis fechas—. Se leen aquí mismo mientras se marca, porque
    el número que importa es el de a pagar y verlo cambiar es lo que confirma
    que el clic hizo lo que se creía.
  */
  const inj = quien ? cuenta(quien, 'INJUSTIFICADA') : 0
  const jus = quien ? cuenta(quien, 'JUSTIFICADA') : 0
  const facturados = Number(periodo.dias)
  const laborados = Math.max(facturados - inj - jus, 0)
  const aPagar = Math.max(facturados - inj, 0)

  /** Un clic rota: limpio → no vino y descuenta → justificada → limpio. */
  const siguiente = (actual?: FaltaDelPeriodo): 'INJUSTIFICADA' | 'JUSTIFICADA' | null =>
    !actual ? 'INJUSTIFICADA' : actual.tipo === 'INJUSTIFICADA' ? 'JUSTIFICADA' : null

  const pulsar = (fecha: string) => {
    if (!editable || !quien) return
    setError(null)
    marcar.mutate(
      { periodo_id: periodo.id, empleado_id: quien, fecha, tipo: siguiente(suyas.get(fecha)) },
      { onError: (e: Error) => setError(e.message) },
    )
  }

  if (faltas.isPending) return <Cargando />
  if (faltas.error) return <ErrorDeCarga error={faltas.error} />

  return (
    <Card flush className="mb-4">
      <div className="p-5 pb-3">
        <CardHeader
          title="Días de la quincena"
          subtitle="Señala los días que no trabajó. Un clic: no vino y se le descuenta. Dos: justificada, no descuenta. Tres: se limpia."
        />
      </div>

      <div className="border-hairline flex flex-col border-t lg:flex-row">
        {/* La gente, siempre a la vista */}
        <div className="border-hairline shrink-0 border-b lg:w-64 lg:border-r lg:border-b-0">
          <ul className="max-h-[26rem] overflow-y-auto">
            {empleados.map((e) => {
              const i = cuenta(e.id, 'INJUSTIFICADA')
              const j = cuenta(e.id, 'JUSTIFICADA')
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setElegido(e.id)}
                    aria-current={quien === e.id}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm',
                      quien === e.id
                        ? 'bg-royal-600/10 text-royal-700 dark:text-royal-300 font-medium'
                        : 'text-ink/70 hover:bg-ink/5',
                    )}
                  >
                    <span className="min-w-0 truncate">
                      {e.apellidos}, {e.nombres}
                    </span>
                    {/* Solo cuando hay algo que decir: una columna de ceros en
                        diecinueve filas es ruido que esconde las tres que sí
                        tienen faltas. */}
                    {i + j > 0 ? (
                      <span className="shrink-0 text-xs tabular">
                        {i > 0 ? <span className="text-danger">{i}</span> : null}
                        {i > 0 && j > 0 ? <span className="text-ink/30"> · </span> : null}
                        {j > 0 ? <span className="text-warning">{j}</span> : null}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Su quincena */}
        <div className="min-w-0 flex-1 p-5">
          {!trabajador ? (
            <p className="text-ink/50 text-sm">Elige a alguien de la lista.</p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
                <p className="text-ink/85 font-medium">
                  {trabajador.apellidos}, {trabajador.nombres}
                  <span className="text-ink/45 ml-2 text-sm font-normal">{trabajador.cargo}</span>
                </p>
                <dl className="text-ink/70 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  <div className="flex gap-1.5">
                    <dt className="text-ink/45">Facturados</dt>
                    <dd className="tabular font-medium">{facturados}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-ink/45">Laborados</dt>
                    <dd className="tabular font-medium">{laborados}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-ink/45">A pagar</dt>
                    <dd
                      className={cn(
                        'tabular font-semibold',
                        aPagar < facturados ? 'text-danger' : 'text-ink/85',
                      )}
                    >
                      {aPagar}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
                {dias.map((d) => {
                  const marca = suyas.get(d)
                  const dia = new Date(d + 'T00:00:00Z')
                  const fuera =
                    d < trabajador.fecha_ingreso ||
                    (trabajador.fecha_egreso !== null && d > trabajador.fecha_egreso)

                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={!editable || fuera || marcar.isPending}
                      onClick={() => pulsar(d)}
                      title={
                        fuera
                          ? 'Esta persona no trabajaba aquí ese día'
                          : marca?.tipo === 'INJUSTIFICADA'
                            ? 'No vino · se le descuenta'
                            : marca?.tipo === 'JUSTIFICADA'
                              ? `Justificada · no se descuenta${marca.motivo ? ` · ${marca.motivo}` : ''}`
                              : 'Trabajó'
                      }
                      className={cn(
                        'flex flex-col items-center gap-0.5 rounded-[6px] border py-2 text-sm transition-colors',
                        fuera && 'border-hairline text-ink/20 cursor-not-allowed',
                        !fuera && !marca && 'border-hairline text-ink/70 hover:bg-ink/5',
                        marca?.tipo === 'INJUSTIFICADA' &&
                          'border-danger/40 bg-danger/12 text-danger font-semibold',
                        marca?.tipo === 'JUSTIFICADA' &&
                          'border-warning/40 bg-warning-soft text-warning font-semibold',
                      )}
                    >
                      <span className="text-2xs opacity-70">{DIAS_SEMANA[dia.getUTCDay()]}</span>
                      <span className="tabular">{dia.getUTCDate()}</span>
                    </button>
                  )
                })}
              </div>

              {/*
                Lo marcado, con su motivo escribible.

                La justificada es la que hay que poder defender: una falta que no
                descuenta y no dice por qué es la que nadie puede explicar seis
                meses después. Se escribe aquí y no en un diálogo por clic, que
                convertiría marcar cuatro días en cuatro ventanas.
              */}
              {suyas.size > 0 ? (
                <ul className="border-hairline mt-5 space-y-2 border-t pt-4">
                  {[...suyas.values()]
                    .sort((a, b) => a.fecha.localeCompare(b.fecha))
                    .map((f) => (
                      <li key={f.fecha} className="flex flex-wrap items-center gap-2 text-sm">
                        <Chip tone={f.tipo === 'INJUSTIFICADA' ? 'danger' : 'warning'}>
                          {fecha(f.fecha)}
                        </Chip>
                        <span className="text-ink/50 text-xs">
                          {f.tipo === 'INJUSTIFICADA' ? 'se le descuenta' : 'no descuenta'}
                        </span>
                        <input
                          className="border-hairline text-ink/80 placeholder:text-ink/30 min-w-0 flex-1 rounded-[6px] border bg-transparent px-2.5 py-1 text-sm"
                          placeholder="Por qué faltó"
                          defaultValue={f.motivo ?? ''}
                          disabled={!editable}
                          onBlur={(ev) => {
                            const v = ev.target.value.trim()
                            if (v === (f.motivo ?? '')) return
                            marcar.mutate(
                              {
                                periodo_id: periodo.id,
                                empleado_id: quien!,
                                fecha: f.fecha,
                                tipo: f.tipo,
                                motivo: v || null,
                              },
                              { onError: (e: Error) => setError(e.message) },
                            )
                          }}
                        />
                        {f.quien ? (
                          <span className="text-ink/35 shrink-0 text-2xs">lo marcó {f.quien}</span>
                        ) : null}
                      </li>
                    ))}
                </ul>
              ) : null}

              {error ? <ErrorDeCarga error={new Error(error)} className="mt-4" /> : null}
            </>
          )}
        </div>
      </div>
    </Card>
  )
}


export function Asistencia() {
  const monedas = useMonedasUsables()
  const [params, setParams] = useSearchParams()
  const { data: periodos } = usePeriodos()
  const { data: empleados, isPending, error } = useEmpleados(true)
  const { puede } = useMisRoles()

  const periodoId = params.get('periodo') ? Number(params.get('periodo')) : undefined
  const periodo = (periodos ?? []).find((p) => p.id === periodoId)

  const { data: novedades } = useNovedades(periodoId)
  const { data: montos } = useNovedadesMontos(periodoId)
  const { data: conceptos } = useConceptos()
  const metodos = useMetodosPago()

  const guardar = useGuardarNovedad()
  const guardarMonto = useGuardarNovedadMonto()
  const eliminarMonto = useEliminarNovedadMonto()

  const [filas, setFilas] = useState<Record<number, Fila>>({})
  const [extra, setExtra] = useState<null | { empleadoId: number; nombre: string }>(null)
  const [nuevoMonto, setNuevoMonto] = useState({
    concepto: '',
    monto: '',
    moneda: 'VES',
    nota: '',
    metodo_pago: '',
    // Vacío quiere decir «con la nómina», que es lo normal. Con fecha, el bono
    // se paga ese día — los tres o cinco de después que mencionó la líder.
    pagar_en: '',
  })

  const puedeRRHH = puede('RRHH')
  const abierto = periodo ? ['BORRADOR', 'CALCULADA'].includes(periodo.estado) : false

  /*
    LOS BONOS SE TOCAN MÁS TIEMPO QUE LAS NOVEDADES.

    «Aunque se carguen los bonos, estos deberán poder editarse en todo momento
    siempre que la nómina no se haya pagado o cerrado.» Así que también con la
    nómina APROBADA, que las horas extra y las faltas ya no admiten: esas son
    hechos del período y se cierran al calcularlo; un bono es una decisión
    administrativa que puede tomarse hasta el momento de pagar.
  */
  const bonosAbiertos = periodo ? !['PAGADA', 'ANULADA'].includes(periodo.estado) : false
  const bonoTrasAprobar = periodo?.estado === 'APROBADA'

  // Las novedades guardadas llenan la tabla. Sin esto, quien vuelve a la
  // pantalla ve ceros y cree que se perdió lo que cargó ayer.
  useEffect(() => {
    if (!novedades) return
    const cargadas: Record<number, Fila> = {}
    for (const n of novedades) {
      const f: Fila = {}
      for (const c of CAMPOS) f[c.clave] = String(Number(n[c.columna]))
      cargadas[n.empleado_id] = f
    }
    setFilas(cargadas)
  }, [novedades])

  const deNovedad = (empleadoId: number, clave: string) =>
    filas[empleadoId]?.[clave] ?? ''

  const cambiar = (empleadoId: number, clave: string, valor: string) =>
    setFilas((f) => ({ ...f, [empleadoId]: { ...(f[empleadoId] ?? {}), [clave]: valor } }))

  const guardarFila = async (empleadoId: number) => {
    const f = filas[empleadoId] ?? {}
    await guardar.mutateAsync({
      periodo_id: periodoId!,
      empleado_id: empleadoId,
      he_diurnas: Number(f.he_diurnas || 0),
      he_nocturnas: Number(f.he_nocturnas || 0),
      horas_nocturnas: Number(f.horas_nocturnas || 0),
      feriados: Number(f.feriados || 0),
      descansos: Number(f.descansos || 0),
    })
  }

  const montosDe = useMemo(() => {
    const mapa = new Map<number, typeof montos>()
    for (const m of montos ?? []) {
      mapa.set(m.empleado_id, [...(mapa.get(m.empleado_id) ?? []), m])
    }
    return mapa
  }, [montos])

  const porNovedad = (conceptos ?? []).filter((c) => c.origen === 'NOVEDAD')

  return (
    <>
      <PageHeader
        title="Novedades del período"
        description="Lo único que cambia de una quincena a otra: horas extra, faltas, bonos y descuentos. El resto lo saca el sistema del contrato."
      />

      <Pestanas pestanas={PESTANAS_PERIODO} />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1 sm:max-w-md">
            <Select
              label="Período"
              vacio="Elige el período"
              value={periodoId ? String(periodoId) : ''}
              onChange={(e) => setParams(e.target.value ? { periodo: e.target.value } : {})}
              opciones={(periodos ?? [])
                .filter((p) => p.estado !== 'ANULADA')
                .map((p) => ({
                  valor: String(p.id),
                  etiqueta: `${p.numero} · ${fecha(p.desde)} al ${fecha(p.hasta)}`,
                }))}
            />
          </div>
          {periodo ? (
            <Chip tone={ESTADOS_PERIODO[periodo.estado].tono}>
              {ESTADOS_PERIODO[periodo.estado].texto}
            </Chip>
          ) : null}
        </div>
      </Card>

      {!periodo ? (
        <Card>
          <Vacio
            icono={<CalendarClock />}
            titulo="Elige un período"
            descripcion="Las novedades se cargan sobre el período que se va a pagar."
          />
        </Card>
      ) : null}

      {periodo && !abierto ? (
        <Card className="mb-4">
          <p className="text-ink/70 text-sm">
            Este período está en «{ESTADOS_PERIODO[periodo.estado].texto.toLowerCase()}» y ya no
            admite cambios. Lo que se ve es lo que se usó para calcular.
          </p>
        </Card>
      ) : null}

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {periodo && empleados && empleados.length > 0 ? (
        <DiasDelPeriodo periodo={periodo} empleados={empleados} editable={puedeRRHH && abierto} />
      ) : null}

      {periodo && empleados && empleados.length > 0 ? (
        <Card flush>
          <div className="p-5 pb-2">
            <CardHeader
              title="Horas y recargos"
              subtitle="Horas extra, nocturnas y días trabajados de descanso o feriado. Se guarda por trabajador; lo que no se toca queda en cero."
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-y text-left text-xs">
                  <th className="px-5 py-2.5 font-medium">Trabajador</th>
                  {CAMPOS.map((c) => (
                    <th key={c.clave} className="px-2 py-2.5 text-center font-medium">
                      {c.etiqueta}
                    </th>
                  ))}
                  <th className="px-5 py-2.5 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {empleados.map((e) => {
                  const sueltos = montosDe.get(e.id) ?? []
                  return (
                    <tr key={e.id} className="border-hairline border-b align-top last:border-0">
                      <td className="px-5 py-3">
                        <p className="text-ink/85 font-medium">
                          {e.apellidos}, {e.nombres}
                        </p>
                        <p className="text-ink/45 text-xs">{e.cargo}</p>

                        {sueltos.length > 0 ? (
                          <ul className="mt-1.5 space-y-1">
                            {sueltos.map((m) => (
                              <li
                                key={m.id}
                                className="text-ink/60 flex items-center gap-1.5 text-xs"
                              >
                                <span className="tabular">
                                  {m.concepto} · {dinero(m.moneda, m.monto)}
                                </span>
                                {/*
                                  El diferimiento se dice aquí, en la pantalla,
                                  que sí se actualiza. En el recibo no: un papel
                                  que dice «pendiente» sigue diciéndolo cuando
                                  ya se pagó.
                                */}
                                {m.pagar_en ? (
                                  <span className="text-warning text-2xs">
                                    se paga el {fecha(m.pagar_en)}
                                  </span>
                                ) : null}
                                {bonosAbiertos && puedeRRHH ? (
                                  <button
                                    onClick={() => void eliminarMonto.mutateAsync({ id: m.id })}
                                    className="text-danger/70 hover:text-danger"
                                    aria-label="Quitar"
                                  >
                                    <Trash2 className="size-3" />
                                  </button>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        {bonosAbiertos && puedeRRHH ? (
                          <button
                            onClick={() => {
                              setExtra({ empleadoId: e.id, nombre: `${e.nombres} ${e.apellidos}` })
                              setNuevoMonto({
                              concepto: '',
                              monto: '',
                              moneda: 'VES',
                              nota: '',
                              metodo_pago: '',
                              pagar_en: '',
                            })
                            }}
                            className="text-royal-600 dark:text-royal-300 mt-1.5 flex items-center gap-1 text-xs hover:underline"
                          >
                            <Plus className="size-3" /> Bono o descuento
                          </button>
                        ) : null}
                      </td>

                      {CAMPOS.map((c) => (
                        <td key={c.clave} className="px-2 py-3">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            inputMode="decimal"
                            disabled={!abierto || !puedeRRHH}
                            value={deNovedad(e.id, c.clave)}
                            onChange={(ev) => cambiar(e.id, c.clave, ev.target.value)}
                            placeholder="0"
                            className="border-hairline bg-canvas text-ink/85 tabular focus:border-royal-500 w-16 rounded-[4px] border px-2 py-1 text-center text-sm outline-none disabled:opacity-50"
                          />
                        </td>
                      ))}

                      <td className="px-5 py-3 text-right">
                        {abierto && puedeRRHH ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={guardar.isPending}
                            onClick={() => void guardarFila(e.id)}
                          >
                            Guardar
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {guardar.error ? (
            <div className="p-5 pt-0">
              <ErrorDeCarga error={guardar.error} />
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* --------------------- Bono o descuento suelto --------------------- */}
      {extra ? (
        <Modal
          abierto
          onCerrar={() => setExtra(null)}
          titulo={`Bono o descuento — ${extra.nombre}`}
          descripcion="Lo que no sale del contrato ni de las horas: una prima, un bono en divisas, la cuota de un préstamo."
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setExtra(null)}>
                Cancelar
              </Button>
              <Button
                disabled={
                  guardarMonto.isPending || !nuevoMonto.concepto || Number(nuevoMonto.monto) <= 0
                }
                onClick={async () => {
                  await guardarMonto.mutateAsync({
                    periodo_id: periodoId!,
                    empleado_id: extra.empleadoId,
                    concepto: nuevoMonto.concepto,
                    monto: Number(nuevoMonto.monto),
                    moneda: nuevoMonto.moneda,
                    nota: nuevoMonto.nota,
                    metodo_pago: nuevoMonto.metodo_pago || null,
                    pagar_en: nuevoMonto.pagar_en || null,
                  })
                  setExtra(null)
                }}
              >
                {guardarMonto.isPending ? 'Guardando…' : 'Agregar'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {/*
              Cambiar un bono con la nómina ya aprobada cambia lo que se va a
              pagar. Es lo que se pidió —se toca hasta que se pague— pero quien
              lo hace tiene que saber que el total aprobado deja de ser el
              total que sale.
            */}
            {bonoTrasAprobar ? (
              <p className="border-warning/30 bg-warning-soft rounded-card text-ink/80 border p-3 text-xs">
                Esta nómina ya está aprobada. Lo que cambies aquí cambia lo que se va a pagar, y
                el total deja de ser el que se aprobó.
              </p>
            ) : null}

            <Select
              label="Concepto"
              vacio="Elige el concepto"
              value={nuevoMonto.concepto}
              onChange={(e) => setNuevoMonto((n) => ({ ...n, concepto: e.target.value }))}
              opciones={porNovedad.map((c) => ({
                valor: c.codigo,
                etiqueta: `${c.nombre} — ${c.tipo === 'ASIGNACION' ? 'suma' : 'resta'}`,
              }))}
            />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                label="Monto"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={nuevoMonto.monto}
                onChange={(e) => setNuevoMonto((n) => ({ ...n, monto: e.target.value }))}
              />
              <Select
                label="Moneda"
                value={nuevoMonto.moneda}
                onChange={(e) => setNuevoMonto((n) => ({ ...n, moneda: e.target.value }))}
                opciones={enSimbolos(monedas.data)}
              />
            </div>
            {/*
              CÓMO Y CUÁNDO SE PAGA.

              Un bono puede ir por pago móvil mientras el sueldo va por
              transferencia, y puede cobrarse días después de la nómina. Las
              dos cosas pasaban de verdad y ninguna tenía dónde decirse.
            */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Cómo se paga"
                vacio="Como el resto de la nómina"
                value={nuevoMonto.metodo_pago}
                onChange={(e) => setNuevoMonto((n) => ({ ...n, metodo_pago: e.target.value }))}
                opciones={opcionesDe(metodos.data)}
              />
              <Input
                label="Cuándo se paga"
                type="date"
                value={nuevoMonto.pagar_en}
                onChange={(e) => setNuevoMonto((n) => ({ ...n, pagar_en: e.target.value }))}
                hint={
                  nuevoMonto.pagar_en
                    ? 'Diferido: se paga ese día, no con la nómina.'
                    : 'Vacío: se paga con la nómina.'
                }
              />
            </div>

            <Input
              label="Nota"
              placeholder="Aparece en el recibo"
              value={nuevoMonto.nota}
              onChange={(e) => setNuevoMonto((n) => ({ ...n, nota: e.target.value }))}
            />

            {/*
              EL RECIBO NO DICE «PENDIENTE», Y HAY QUE SABERLO AL DIFERIR.

              Lo acotó Christopher: un papel impreso que dice «pendiente» sigue
              diciéndolo el año que viene, cuando ya se pagó, y entonces es un
              documento firmado que afirma una deuda que no existe. El recibo
              dice lo que se ganó; el diferimiento vive aquí, que sí se
              actualiza.
            */}
            {nuevoMonto.pagar_en ? (
              <p className="border-hairline bg-canvas rounded-card text-ink/60 border p-3 text-xs">
                El bono sale en el recibo como cualquier otra asignación, sin marca de pendiente:
                un papel no se actualiza cuando se paga. El día queda aquí, que es lo que se
                consulta para saber qué falta por sacar de caja.
              </p>
            ) : null}
            {guardarMonto.error ? <ErrorDeCarga error={guardarMonto.error} /> : null}
          </div>
        </Modal>
      ) : null}
    </>
  )
}
