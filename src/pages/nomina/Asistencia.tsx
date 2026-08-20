import { useEffect, useMemo, useState } from 'react'
import { useMonedasUsables, enSimbolos } from '@/lib/api/tasas'
import { useSearchParams } from 'react-router'
import { CalendarClock, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
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
  useGuardarNovedadMonto,
  useNovedades,
  useNovedadesMontos,
  usePeriodos,
} from '@/lib/api/nomina'
import { useMisRoles } from '@/lib/api/catalogo'
import { dinero, fecha } from '@/lib/formato'

/** Los campos que se teclean por trabajador y período. */
const CAMPOS = [
  { clave: 'he_diurnas', columna: 'horas_extra_diurnas', etiqueta: 'HE diurnas' },
  { clave: 'he_nocturnas', columna: 'horas_extra_nocturnas', etiqueta: 'HE nocturnas' },
  { clave: 'horas_nocturnas', columna: 'horas_nocturnas', etiqueta: 'H. nocturnas' },
  { clave: 'feriados', columna: 'dias_feriados_trabajados', etiqueta: 'Feriados trab.' },
  { clave: 'descansos', columna: 'dias_descanso_trabajados', etiqueta: 'Descansos trab.' },
  { clave: 'faltas_inj', columna: 'faltas_injustificadas', etiqueta: 'Faltas s/j' },
  { clave: 'faltas_just', columna: 'faltas_justificadas', etiqueta: 'Faltas just.' },
] as const

type Fila = Record<string, string>

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

  const guardar = useGuardarNovedad()
  const guardarMonto = useGuardarNovedadMonto()
  const eliminarMonto = useEliminarNovedadMonto()

  const [filas, setFilas] = useState<Record<number, Fila>>({})
  const [extra, setExtra] = useState<null | { empleadoId: number; nombre: string }>(null)
  const [nuevoMonto, setNuevoMonto] = useState({ concepto: '', monto: '', moneda: 'VES', nota: '' })

  const puedeRRHH = puede('RRHH')
  const abierto = periodo ? ['BORRADOR', 'CALCULADA'].includes(periodo.estado) : false

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
      faltas_inj: Number(f.faltas_inj || 0),
      faltas_just: Number(f.faltas_just || 0),
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
        <Card flush>
          <div className="p-5 pb-2">
            <CardHeader
              title="Personal activo"
              subtitle="Se guarda por trabajador. Lo que no se toca queda en cero."
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
                                {abierto && puedeRRHH ? (
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

                        {abierto && puedeRRHH ? (
                          <button
                            onClick={() => {
                              setExtra({ empleadoId: e.id, nombre: `${e.nombres} ${e.apellidos}` })
                              setNuevoMonto({ concepto: '', monto: '', moneda: 'VES', nota: '' })
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
            <Input
              label="Nota"
              placeholder="Aparece en el recibo"
              value={nuevoMonto.nota}
              onChange={(e) => setNuevoMonto((n) => ({ ...n, nota: e.target.value }))}
            />
            {guardarMonto.error ? <ErrorDeCarga error={guardarMonto.error} /> : null}
          </div>
        </Modal>
      ) : null}
    </>
  )
}
