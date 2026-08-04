import { useState } from 'react'
import { CalendarClock, HandCoins, Percent, PiggyBank, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { dinero, fecha } from '@/lib/formato'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useCuentas } from '@/lib/api/tesoreria'
import {
  MOTIVOS_ANTICIPO,
  MOTIVOS_EGRESO,
  useAnticipos,
  useCalcularIntereses,
  useCalcularLiquidacion,
  useCalcularTrimestre,
  useDepositos,
  useGuardarCorte,
  useGuardarTasaPrestaciones,
  useLiquidaciones,
  usePagarLiquidacion,
  usePrestaciones,
  useRegistrarAnticipo,
  type Prestacion,
} from '@/lib/api/prestaciones'

/**
 * Prestaciones sociales.
 *
 * La pantalla es una lista de cuentas: una por trabajador. Lo que se enseña en
 * grande es el saldo —lo que se le debe hoy— porque es la cifra que se necesita
 * cuando alguien pregunta, y lo que se enseña al lado es cuánto de eso se le
 * puede adelantar, que es la segunda pregunta.
 *
 * Todo empieza por el corte: mientras un trabajador no lo tenga, el sistema no
 * sabe qué traía de antes y su cuenta arranca en cero. Eso se ve en la lista,
 * no se esconde.
 */

const trimestreDe = (mes: number) => Math.ceil(mes / 3)

export function Prestaciones() {
  const { data, isPending, error } = usePrestaciones()
  const { data: cuentas } = useCuentas()
  const { data: liquidaciones } = useLiquidaciones()
  const guardarCorte = useGuardarCorte()
  const calcularTrimestre = useCalcularTrimestre()
  const guardarTasa = useGuardarTasaPrestaciones()
  const calcularIntereses = useCalcularIntereses()
  const registrarAnticipo = useRegistrarAnticipo()
  const calcularLiquidacion = useCalcularLiquidacion()
  const pagarLiquidacion = usePagarLiquidacion()
  const { puede } = useMisPermisos()

  const [detalleId, setDetalleId] = useState<number | null>(null)
  const [corte, setCorte] = useState<Prestacion | null>(null)
  const [anticipo, setAnticipo] = useState<Prestacion | null>(null)
  const [liquidando, setLiquidando] = useState<Prestacion | null>(null)
  const [trimestre, setTrimestre] = useState(false)
  const [intereses, setIntereses] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const hoy = hoyEnCaracas()
  const anioActual = Number(hoy.slice(0, 4))
  const mesActual = Number(hoy.slice(5, 7))

  const [fCorte, setFCorte] = useState({ fecha: '', garantia: '', dias: '', intereses: '', anticipos: '', nota: '' })
  const [fTri, setFTri] = useState({ anio: String(anioActual), trimestre: String(Math.max(trimestreDe(mesActual) - 1, 1)) })
  const [fInt, setFInt] = useState({ anio: String(anioActual), mes: String(Math.max(mesActual - 1, 1)), tasa: '' })
  const [fAnt, setFAnt] = useState({ monto: '', motivo: 'VIVIENDA', cuenta_id: '', detalle: '', referencia: '' })
  const [fLiq, setFLiq] = useState({ fecha: '', motivo: 'RENUNCIA', otras: '', deducciones: '', observacion: '' })

  const detalle = detalleId !== null ? ((data ?? []).find((p) => p.empleado_id === detalleId) ?? null) : null
  const depositos = useDepositos(detalleId)
  const anticipos = useAnticipos(detalleId)
  const liquidacion = (liquidaciones ?? []).find(
    (l) => l.empleado_id === detalleId && l.estado !== 'ANULADA',
  )

  const activos = (data ?? []).filter((p) => p.activo)
  const sinCorte = activos.filter((p) => !p.fecha_corte).length

  /**
   * Los totales, separados por moneda.
   *
   * Aquí hay sueldos en bolívares y sueldos en dólares al mismo tiempo, así que
   * sumarlos en una sola cifra daría un número que no es nada: ni bolívares ni
   * dólares. Se enseñan los dos, uno al lado del otro, hasta que alguien decida
   * a qué tasa se convierten — y esa decisión no la puede tomar una pantalla.
   */
  const porMoneda = (campo: (p: Prestacion) => number): [string, number][] => {
    const suma = new Map<string, number>()
    for (const p of activos) suma.set(p.moneda, (suma.get(p.moneda) ?? 0) + campo(p))
    return [...suma.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  }

  const enCifra = (pares: [string, number][]) =>
    pares.length === 0
      ? dinero(activos[0]?.moneda ?? 'USD', 0)
      : pares.map(([mo, v]) => dinero(mo, v)).join('  ·  ')

  const totalDebido = porMoneda((p) => Number(p.saldo))
  const totalAnticipos = porMoneda((p) => Number(p.anticipos) + Number(p.corte_anticipos))

  return (
    <>
      <PageHeader
        title="Prestaciones sociales"
        description="Lo que la empresa le debe a cada quien por el tiempo trabajado."
        actions={
          puede('NOMINA', 'ESCRITURA') ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" icon={<CalendarClock />} onClick={() => setTrimestre(true)}>
                Cerrar trimestre
              </Button>
              <Button variant="outline" icon={<Percent />} onClick={() => setIntereses(true)}>
                Intereses del mes
              </Button>
            </div>
          ) : undefined
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length > 0 ? (
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Se les debe hoy"
            value={enCifra(totalDebido)}
            icon={<PiggyBank />}
            tone="royal"
          />
          <StatCard
            label="Adelantado"
            value={enCifra(totalAnticipos)}
            icon={<HandCoins />}
            tone="warning"
          />
          <StatCard
            label="Sin corte cargado"
            value={String(sinCorte)}
            icon={<Wallet />}
            tone={sinCorte > 0 ? 'danger' : 'success'}
          />
        </div>
      ) : null}

      {sinCorte > 0 ? (
        <Card className="border-warning/30 mb-5 border">
          <p className="text-ink/70 text-sm leading-relaxed">
            Hay <span className="font-semibold">{sinCorte}</span> trabajador(es) sin corte cargado.
            Mientras no lo tengan, su cuenta arranca en cero y el sistema no sabe qué traían de
            antes. El corte se carga desde la ficha de cada uno, con lo que tenga acumulado a una
            fecha.
          </p>
        </Card>
      ) : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<PiggyBank />}
            titulo="No hay trabajadores"
            descripcion="Las prestaciones se calculan sobre el personal cargado en Nómina."
          />
        </Card>
      ) : null}

      {data && data.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Trabajador</th>
                  <th className="px-3 py-3 font-medium">Desde</th>
                  <th className="px-3 py-3 text-right font-medium">Garantía</th>
                  <th className="px-3 py-3 text-right font-medium">Intereses</th>
                  <th className="px-3 py-3 text-right font-medium">Adelantado</th>
                  <th className="px-3 py-3 text-right font-medium">Se le debe</th>
                  <th className="px-5 py-3 text-right font-medium">Corte</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr
                    key={p.empleado_id}
                    onClick={() => setDetalleId(p.empleado_id)}
                    className={`border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors last:border-0 ${
                      !p.activo ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="px-5 py-3">
                      <p className="text-ink/85 font-medium">{p.nombre}</p>
                      <p className="text-ink/45 text-xs">
                        {p.ficha} · {p.cargo}
                        {p.liquidado ? ' · liquidado' : ''}
                      </p>
                    </td>
                    <td className="text-ink/60 px-3 py-3 text-xs">{fecha(p.fecha_ingreso)}</td>
                    <td className="tabular text-ink/70 px-3 py-3 text-right">
                      {dinero(p.moneda, p.garantia)}
                    </td>
                    <td className="tabular text-ink/70 px-3 py-3 text-right">
                      {dinero(p.moneda, p.intereses)}
                    </td>
                    <td className="tabular px-3 py-3 text-right">
                      {Number(p.anticipos) + Number(p.corte_anticipos) > 0 ? (
                        <span className="text-warning">
                          −{dinero(p.moneda, Number(p.anticipos) + Number(p.corte_anticipos))}
                        </span>
                      ) : (
                        <span className="text-ink/30">—</span>
                      )}
                    </td>
                    <td className="tabular text-ink/90 px-3 py-3 text-right font-semibold">
                      {dinero(p.moneda, p.saldo)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {p.fecha_corte ? (
                        <span className="text-ink/50 text-xs">{fecha(p.fecha_corte)}</span>
                      ) : (
                        <Chip tone="warning">Sin corte</Chip>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* ----------------------------------------------------- detalle */}
      {detalle ? (
        <Modal
          abierto
          ancho="lg"
          onCerrar={() => setDetalleId(null)}
          titulo={detalle.nombre}
          descripcion={`${detalle.ficha} · ${detalle.cargo} · desde ${fecha(detalle.fecha_ingreso)}`}
          acciones={
            <>
              <Button variant="ghost" onClick={() => setDetalleId(null)}>
                Cerrar
              </Button>
              {puede('NOMINA', 'TOTAL') ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCorte(detalle)
                      setFCorte({
                        fecha: detalle.fecha_corte ?? '',
                        garantia: detalle.fecha_corte ? String(Number(detalle.corte_garantia)) : '',
                        dias: detalle.fecha_corte ? String(Number(detalle.corte_dias)) : '',
                        intereses: detalle.fecha_corte ? String(Number(detalle.corte_intereses)) : '',
                        anticipos: detalle.fecha_corte ? String(Number(detalle.corte_anticipos)) : '',
                        nota: '',
                      })
                    }}
                  >
                    {detalle.fecha_corte ? 'Corregir el corte' : 'Cargar el corte'}
                  </Button>
                  {detalle.activo && !detalle.liquidado ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setAnticipo(detalle)
                          setFAnt({ monto: '', motivo: 'VIVIENDA', cuenta_id: '', detalle: '', referencia: '' })
                        }}
                      >
                        Anticipo
                      </Button>
                      <Button
                        onClick={() => {
                          setLiquidando(detalle)
                          setFLiq({ fecha: hoy, motivo: 'RENUNCIA', otras: '', deducciones: '', observacion: '' })
                        }}
                      >
                        Liquidar
                      </Button>
                    </>
                  ) : null}
                </>
              ) : null}
            </>
          }
        >
          <div className="bg-ink/4 rounded-card space-y-1.5 p-4 text-sm">
            {[
              ['Garantía acumulada', detalle.garantia],
              ['Intereses', detalle.intereses],
              ['Adelantado', `−${dinero(detalle.moneda, Number(detalle.anticipos) + Number(detalle.corte_anticipos))}`],
            ].map(([k, v], i) => (
              <div key={String(k)} className="flex justify-between">
                <span className="text-ink/55">{k}</span>
                <span className="tabular text-ink/80">
                  {i === 2 ? (v as string) : dinero(detalle.moneda, v as string)}
                </span>
              </div>
            ))}
            <div className="border-hairline flex justify-between border-t pt-1.5">
              <span className="text-ink/75 font-medium">Se le debe</span>
              <span className="tabular text-ink/90 font-semibold">
                {dinero(detalle.moneda, detalle.saldo)}
              </span>
            </div>
            <p className="text-ink/45 pt-1 text-xs">
              Se le puede adelantar hasta {dinero(detalle.moneda, detalle.disponible_anticipo)} — el
              75% de lo acumulado, menos lo ya adelantado.
            </p>
          </div>

          {liquidacion ? (
            <Card className="border-hairline mt-4 border">
              <CardHeader
                title={`Liquidación ${liquidacion.numero}`}
                subtitle={`${MOTIVOS_EGRESO.find((m) => m.valor === liquidacion.motivo)?.etiqueta} · ${fecha(liquidacion.fecha_egreso)}`}
                action={
                  <Chip tone={liquidacion.estado === 'PAGADA' ? 'success' : 'royal'}>
                    {liquidacion.estado.toLowerCase()}
                  </Chip>
                }
              />
              <div className="mt-3 space-y-1 text-sm">
                {[
                  ['Garantía acumulada', liquidacion.garantia_acumulada],
                  ['30 días por año', liquidacion.retroactivo_30_dias],
                  ['Base (la mayor)', liquidacion.base_prestaciones],
                  ['Intereses', liquidacion.intereses],
                  ['Vacaciones fraccionadas', liquidacion.vacaciones_monto],
                  ['Bono vacacional', liquidacion.bono_vacacional_monto],
                  ['Utilidades fraccionadas', liquidacion.utilidades_monto],
                  ['Indemnización', liquidacion.indemnizacion],
                  ['Menos lo adelantado', `−${dinero(liquidacion.moneda, liquidacion.anticipos)}`],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between">
                    <span className="text-ink/55">{k}</span>
                    <span className="tabular text-ink/80">
                      {String(v).startsWith('−') ? (v as string) : dinero(liquidacion.moneda, v as string)}
                    </span>
                  </div>
                ))}
                <div className="border-hairline flex justify-between border-t pt-1.5">
                  <span className="text-ink/75 font-medium">Total a pagar</span>
                  <span className="tabular text-ink/90 font-semibold">
                    {dinero(liquidacion.moneda, liquidacion.total)}
                  </span>
                </div>
              </div>

              {liquidacion.estado === 'CALCULADA' && puede('NOMINA', 'TOTAL') ? (
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <Select
                    label="Pagar desde"
                    vacio="Elige la cuenta"
                    value={fAnt.cuenta_id}
                    onChange={(e) => setFAnt({ ...fAnt, cuenta_id: e.target.value })}
                    opciones={(cuentas ?? [])
                      .filter((c) => c.activa)
                      .map((c) => ({ valor: String(c.id), etiqueta: `${c.nombre} · ${c.moneda}` }))}
                    className="min-w-56 flex-1"
                  />
                  <Button
                    disabled={pagarLiquidacion.isPending || !fAnt.cuenta_id}
                    onClick={async () => {
                      await pagarLiquidacion.mutateAsync({
                        id: liquidacion.id,
                        cuenta_id: Number(fAnt.cuenta_id),
                      })
                      setDetalleId(null)
                    }}
                  >
                    {pagarLiquidacion.isPending ? 'Pagando…' : 'Pagar y dar de baja'}
                  </Button>
                </div>
              ) : null}

              {pagarLiquidacion.error ? (
                <ErrorDeCarga error={pagarLiquidacion.error} className="mt-3" />
              ) : null}
            </Card>
          ) : null}

          {(depositos.data ?? []).length > 0 ? (
            <Card flush className="mt-4">
              <CardHeader title="Depósitos trimestrales" className="p-4 pb-0" />
              <div className="space-y-2 p-4 pt-3 text-sm">
                {(depositos.data ?? []).map((d) => (
                  <div
                    key={d.id}
                    className={`border-hairline flex items-center justify-between gap-3 border-b pb-2 last:border-0 ${
                      d.estado === 'ANULADO' ? 'opacity-50' : ''
                    }`}
                  >
                    <div>
                      <p className="text-ink/80">
                        {d.anio} · trimestre {d.trimestre}
                        {d.estimado ? ' · estimado' : ''}
                      </p>
                      <p className="text-ink/45 text-xs">
                        {Number(d.dias)} días
                        {Number(d.dias_adicionales) > 0
                          ? ` + ${Number(d.dias_adicionales)} adicionales`
                          : ''}{' '}
                        × {dinero(d.moneda, d.salario_integral_diario)}
                      </p>
                    </div>
                    <span className="tabular text-ink/85 font-medium">
                      {dinero(d.moneda, d.monto)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {(anticipos.data ?? []).length > 0 ? (
            <Card flush className="mt-4">
              <CardHeader title="Anticipos" className="p-4 pb-0" />
              <div className="space-y-2 p-4 pt-3 text-sm">
                {(anticipos.data ?? []).map((a) => (
                  <div
                    key={a.id}
                    className={`border-hairline flex items-center justify-between gap-3 border-b pb-2 last:border-0 ${
                      a.estado === 'ANULADO' ? 'opacity-50' : ''
                    }`}
                  >
                    <div>
                      <p className="text-ink/80">
                        {a.numero} ·{' '}
                        {MOTIVOS_ANTICIPO.find((m) => m.valor === a.motivo)?.etiqueta ?? a.motivo}
                      </p>
                      <p className="text-ink/45 text-xs">
                        {fecha(a.fecha)}
                        {a.cuenta ? ` · ${a.cuenta}` : ''}
                        {a.detalle ? ` · ${a.detalle}` : ''}
                      </p>
                    </div>
                    <span className="tabular text-ink/85 font-medium">
                      {dinero(a.moneda, a.monto)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </Modal>
      ) : null}

      {/* ------------------------------------------------------- corte */}
      {corte ? (
        <Modal
          abierto
          onCerrar={() => setCorte(null)}
          titulo={`Corte de ${corte.nombre}`}
          descripcion="Lo que tiene acumulado hasta una fecha. Desde ahí el sistema sigue solo."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setCorte(null)}>
                Cancelar
              </Button>
              <Button
                disabled={guardarCorte.isPending || !fCorte.fecha}
                onClick={async () => {
                  await guardarCorte.mutateAsync({
                    empleado_id: corte.empleado_id,
                    fecha_corte: fCorte.fecha,
                    garantia: Number(fCorte.garantia) || 0,
                    dias: Number(fCorte.dias) || 0,
                    intereses: Number(fCorte.intereses) || 0,
                    anticipos: Number(fCorte.anticipos) || 0,
                    moneda: corte.moneda,
                    nota: fCorte.nota || null,
                  })
                  setCorte(null)
                }}
              >
                {guardarCorte.isPending ? 'Guardando…' : 'Guardar el corte'}
              </Button>
            </>
          }
        >
          <p className="text-ink/60 mb-4 text-sm leading-relaxed">
            El sistema no tiene los salarios de los años anteriores, así que calcular hacia atrás
            daría un número con cara de exacto y falso. Esto se carga a mano, y se ve que es a mano.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Acumulado hasta"
              type="date"
              value={fCorte.fecha}
              onChange={(e) => setFCorte({ ...fCorte, fecha: e.target.value })}
              required
            />
            <Input
              label="Días acumulados"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              value={fCorte.dias}
              onChange={(e) => setFCorte({ ...fCorte, dias: e.target.value })}
            />
            <Input
              label={`Garantía en ${corte.moneda}`}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={fCorte.garantia}
              onChange={(e) => setFCorte({ ...fCorte, garantia: e.target.value })}
            />
            <Input
              label="Intereses acumulados"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={fCorte.intereses}
              onChange={(e) => setFCorte({ ...fCorte, intereses: e.target.value })}
            />
            <Input
              label="Ya adelantado"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={fCorte.anticipos}
              onChange={(e) => setFCorte({ ...fCorte, anticipos: e.target.value })}
              className="sm:col-span-2"
            />
          </div>

          <Textarea
            label="De dónde sale esta cifra"
            hint="Queda guardado con tu nombre y la hora."
            rows={2}
            className="mt-4"
            value={fCorte.nota}
            onChange={(e) => setFCorte({ ...fCorte, nota: e.target.value })}
          />

          {guardarCorte.error ? <ErrorDeCarga error={guardarCorte.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      {/* --------------------------------------------------- trimestre */}
      {trimestre ? (
        <Modal
          abierto
          onCerrar={() => setTrimestre(false)}
          titulo="Cerrar el trimestre"
          descripcion="Abona quince días de salario integral a cada trabajador que llevaba más de tres meses."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setTrimestre(false)}>
                Cancelar
              </Button>
              <Button
                disabled={calcularTrimestre.isPending}
                onClick={async () => {
                  const n = await calcularTrimestre.mutateAsync({
                    anio: Number(fTri.anio),
                    trimestre: Number(fTri.trimestre),
                  })
                  setTrimestre(false)
                  setAviso(
                    n === 0
                      ? 'No había nada que abonar: ese trimestre ya estaba cerrado o nadie cumplía los tres meses.'
                      : `Trimestre cerrado para ${n} trabajador(es).`,
                  )
                }}
              >
                {calcularTrimestre.isPending ? 'Calculando…' : 'Cerrar el trimestre'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Año"
              type="number"
              min="2020"
              inputMode="numeric"
              value={fTri.anio}
              onChange={(e) => setFTri({ ...fTri, anio: e.target.value })}
            />
            <Select
              label="Trimestre"
              value={fTri.trimestre}
              onChange={(e) => setFTri({ ...fTri, trimestre: e.target.value })}
              opciones={[
                { valor: '1', etiqueta: '1 — enero a marzo' },
                { valor: '2', etiqueta: '2 — abril a junio' },
                { valor: '3', etiqueta: '3 — julio a septiembre' },
                { valor: '4', etiqueta: '4 — octubre a diciembre' },
              ]}
            />
          </div>

          <p className="text-ink/55 mt-4 text-sm leading-relaxed">
            El salario sale del último recibo del trimestre, con las horas extras y los recargos que
            de verdad se pagaron. Si no hay recibos, se calcula desde la ficha y el depósito queda
            marcado como estimado. Volver a correrlo no duplica nada.
          </p>

          {calcularTrimestre.error ? (
            <ErrorDeCarga error={calcularTrimestre.error} className="mt-4" />
          ) : null}
        </Modal>
      ) : null}

      {/* --------------------------------------------------- intereses */}
      {intereses ? (
        <Modal
          abierto
          onCerrar={() => setIntereses(false)}
          titulo="Intereses del mes"
          descripcion="Corren sobre la garantía acumulada, a la tasa que publica el BCV."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setIntereses(false)}>
                Cancelar
              </Button>
              <Button
                disabled={calcularIntereses.isPending || !Number(fInt.tasa)}
                onClick={async () => {
                  await guardarTasa.mutateAsync({
                    anio: Number(fInt.anio),
                    mes: Number(fInt.mes),
                    tasa: Number(fInt.tasa),
                    fuente: 'BCV',
                  })
                  const n = await calcularIntereses.mutateAsync({
                    anio: Number(fInt.anio),
                    mes: Number(fInt.mes),
                  })
                  setIntereses(false)
                  setAviso(`Intereses abonados a ${n} trabajador(es).`)
                }}
              >
                {calcularIntereses.isPending ? 'Calculando…' : 'Abonar intereses'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Año"
              type="number"
              min="2020"
              inputMode="numeric"
              value={fInt.anio}
              onChange={(e) => setFInt({ ...fInt, anio: e.target.value })}
            />
            <Input
              label="Mes"
              type="number"
              min="1"
              max="12"
              inputMode="numeric"
              value={fInt.mes}
              onChange={(e) => setFInt({ ...fInt, mes: e.target.value })}
            />
            <Input
              label="Tasa anual (%)"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={fInt.tasa}
              onChange={(e) => setFInt({ ...fInt, tasa: e.target.value })}
              required
            />
          </div>

          <p className="text-ink/55 mt-4 text-sm leading-relaxed">
            La tasa se guarda con el mes al que pertenece: sin ella no se calcula nada, porque unos
            intereses con una tasa inventada también son inventados.
          </p>

          {guardarTasa.error ? <ErrorDeCarga error={guardarTasa.error} className="mt-4" /> : null}
          {calcularIntereses.error ? (
            <ErrorDeCarga error={calcularIntereses.error} className="mt-4" />
          ) : null}
        </Modal>
      ) : null}

      {/* ---------------------------------------------------- anticipo */}
      {anticipo ? (
        <Modal
          abierto
          onCerrar={() => setAnticipo(null)}
          titulo={`Anticipo a ${anticipo.nombre}`}
          descripcion={`Se le puede adelantar hasta ${dinero(anticipo.moneda, anticipo.disponible_anticipo)}.`}
          acciones={
            <>
              <Button variant="ghost" onClick={() => setAnticipo(null)}>
                Cancelar
              </Button>
              <Button
                disabled={registrarAnticipo.isPending || !Number(fAnt.monto)}
                onClick={async () => {
                  await registrarAnticipo.mutateAsync({
                    empleado_id: anticipo.empleado_id,
                    monto: Number(fAnt.monto),
                    motivo: fAnt.motivo,
                    cuenta_id: Number(fAnt.cuenta_id) || null,
                    detalle: fAnt.detalle || null,
                    referencia: fAnt.referencia || null,
                  })
                  setAnticipo(null)
                }}
              >
                {registrarAnticipo.isPending ? 'Registrando…' : 'Registrar el anticipo'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={`Monto en ${anticipo.moneda}`}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={fAnt.monto}
              onChange={(e) => setFAnt({ ...fAnt, monto: e.target.value })}
              error={
                Number(fAnt.monto) > Number(anticipo.disponible_anticipo)
                  ? 'Pasa del 75% permitido'
                  : undefined
              }
              required
            />
            <Select
              label="Para qué"
              value={fAnt.motivo}
              onChange={(e) => setFAnt({ ...fAnt, motivo: e.target.value })}
              opciones={MOTIVOS_ANTICIPO}
              hint="La ley permite adelantar para vivienda, salud, educación y pensión alimentaria."
            />
            <Select
              label="De qué cuenta sale"
              vacio="Sin mover tesorería"
              value={fAnt.cuenta_id}
              onChange={(e) => setFAnt({ ...fAnt, cuenta_id: e.target.value })}
              opciones={(cuentas ?? [])
                .filter((c) => c.activa)
                .map((c) => ({ valor: String(c.id), etiqueta: `${c.nombre} · ${c.moneda}` }))}
            />
            <Input
              label="Referencia"
              value={fAnt.referencia}
              onChange={(e) => setFAnt({ ...fAnt, referencia: e.target.value })}
            />
          </div>

          <Textarea
            label="Detalle"
            rows={2}
            className="mt-4"
            value={fAnt.detalle}
            onChange={(e) => setFAnt({ ...fAnt, detalle: e.target.value })}
          />

          {registrarAnticipo.error ? (
            <ErrorDeCarga error={registrarAnticipo.error} className="mt-4" />
          ) : null}
        </Modal>
      ) : null}

      {/* -------------------------------------------------- liquidación */}
      {liquidando ? (
        <Modal
          abierto
          onCerrar={() => setLiquidando(null)}
          titulo={`Liquidar a ${liquidando.nombre}`}
          descripcion="Se calculan las dos cuentas que manda comparar la ley y se paga la mayor."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setLiquidando(null)}>
                Cancelar
              </Button>
              <Button
                disabled={calcularLiquidacion.isPending || !fLiq.fecha}
                onClick={async () => {
                  await calcularLiquidacion.mutateAsync({
                    empleado_id: liquidando.empleado_id,
                    fecha_egreso: fLiq.fecha,
                    motivo: fLiq.motivo,
                    otras_asignaciones: Number(fLiq.otras) || 0,
                    otras_deducciones: Number(fLiq.deducciones) || 0,
                    observacion: fLiq.observacion || null,
                  })
                  setLiquidando(null)
                }}
              >
                {calcularLiquidacion.isPending ? 'Calculando…' : 'Calcular la liquidación'}
              </Button>
            </>
          }
        >
          <p className="text-ink/60 mb-4 text-sm leading-relaxed">
            Calcular no paga ni da de baja a nadie: deja el cálculo a la vista para revisarlo. El
            pago se confirma después, desde la ficha.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Último día trabajado"
              type="date"
              value={fLiq.fecha}
              onChange={(e) => setFLiq({ ...fLiq, fecha: e.target.value })}
              required
            />
            <Select
              label="Por qué sale"
              value={fLiq.motivo}
              onChange={(e) => setFLiq({ ...fLiq, motivo: e.target.value })}
              opciones={MOTIVOS_EGRESO}
              hint="El despido injustificado paga, además, otro tanto igual."
            />
            <Input
              label="Otras asignaciones"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={fLiq.otras}
              onChange={(e) => setFLiq({ ...fLiq, otras: e.target.value })}
            />
            <Input
              label="Otras deducciones"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={fLiq.deducciones}
              onChange={(e) => setFLiq({ ...fLiq, deducciones: e.target.value })}
            />
          </div>

          <Textarea
            label="Observación"
            rows={2}
            className="mt-4"
            value={fLiq.observacion}
            onChange={(e) => setFLiq({ ...fLiq, observacion: e.target.value })}
          />

          {calcularLiquidacion.error ? (
            <ErrorDeCarga error={calcularLiquidacion.error} className="mt-4" />
          ) : null}
        </Modal>
      ) : null}

      {/* -------------------------------------------------------- aviso */}
      {aviso ? (
        <Modal
          abierto
          onCerrar={() => setAviso(null)}
          titulo="Listo"
          acciones={<Button onClick={() => setAviso(null)}>Entendido</Button>}
        >
          <p className="text-ink/70 text-sm leading-relaxed">{aviso}</p>
        </Modal>
      ) : null}
    </>
  )
}
