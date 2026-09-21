import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, CalendarCheck, FileSpreadsheet, FileText, PieChart } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { Visor } from '@/components/Visor'
import { useCuentas } from '@/lib/api/tesoreria'
import { useEmpresa } from '@/lib/api/empresa'
import { useMiPerfil } from '@/lib/api/usuarios'
import {
  cerrarMes,
  gastosPorCategoria,
  leerLibroDeDinero,
  leerPendientePorMoneda,
  resumirPorMoneda,
} from '@/lib/api/tesoreriaReportes'
import {
  NOTA_FLUJO_Y_EXISTENCIA,
  armarCierreDeMes,
  armarGastosPorCategoria,
  armarLibroDeDinero,
  armarResumenPorMoneda,
} from '@/lib/ficha/tesoreriaPdf'
import type { ArchivoArmado } from '@/lib/ficha/armado'

/*
  LOS REPORTES DE TESORERÍA

  Christopher, 21/09/2026: que Tesorería lleve «sus entradas, salidas, sus
  monedas, todo con sus reportes». Son cuatro, tomados del módulo que ya usa en
  su otro sistema y armados sobre lo que este tiene mejor: aquí el saldo no se
  guarda, se suma de un libro que no se puede editar, así que un mes pasado
  vuelto a imprimir hoy dice exactamente lo que dijo entonces.

  - RESUMEN POR MONEDA: la moneda es la fila. No hay un «total general» porque
    sumar bolívares con dólares da un número que no existe. Al tocar una moneda
    se abre su libro.
  - LIBRO DE UNA CAJA: el de siete columnas, con su saldo anterior.
  - GASTOS POR CATEGORÍA: en qué se fue el dinero, sin los traslados.
  - CIERRE DE MES: lo que entró, lo que salió y cómo quedó cada caja. En PDF y
    en hoja de cálculo.

  NADA SE DESCARGA SOLO: todo se ve primero en el visor.
*/

const hoyEnCaracas = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date())

const decimal2 = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const n = (v: number | null) => (v === null ? '—' : decimal2.format(v))

const ultimoDiaDe = (mes: string) => {
  const [a, m] = mes.split('-').map(Number)
  return `${mes}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`
}
const nombreDelMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number)
  return new Intl.DateTimeFormat('es-VE', { month: 'long', year: 'numeric' }).format(new Date(a, m - 1, 1))
}

export function ReportesTesoreria() {
  const hoy = hoyEnCaracas()
  const [desde, setDesde] = useState(`${hoy.slice(0, 7)}-01`)
  const [hasta, setHasta] = useState(hoy)
  const [cuentaId, setCuentaId] = useState('')
  const [mes, setMes] = useState(hoy.slice(0, 7))
  const [papel, setPapel] = useState<ArchivoArmado | null>(null)
  const [armando, setArmando] = useState<string | null>(null)
  const [fallo, setFallo] = useState<Error | null>(null)

  const cuentas = useCuentas()
  const { data: empresa } = useEmpresa()
  const { data: yo } = useMiPerfil()

  const rangoMalo = Boolean(desde && hasta && desde > hasta)

  const libro = useQuery({
    queryKey: ['tesoreria', 'reportes', 'libro', desde, hasta],
    enabled: !rangoMalo,
    queryFn: () => leerLibroDeDinero({ desde: desde || null, hasta: hasta || null }),
  })
  const pendiente = useQuery({
    queryKey: ['tesoreria', 'reportes', 'pendiente'],
    queryFn: leerPendientePorMoneda,
  })

  const filas = useMemo(
    () =>
      resumirPorMoneda(
        libro.data ?? [],
        (cuentas.data ?? []).filter((c) => c.activa),
        pendiente.data ?? { porPagar: null, porCobrar: null },
      ),
    [libro.data, cuentas.data, pendiente.data],
  )

  const cabecera = () => ({
    empresa: { razonSocial: empresa?.razon_social ?? '', rif: empresa?.rif ?? '' },
    emitidoPor: yo?.nombre ?? '',
    momento: new Date(),
  })

  /** Arma un papel y lo enseña; si falla, lo dice en vez de quedarse callado. */
  const armar = async (cual: string, hacer: () => Promise<ArchivoArmado>) => {
    setArmando(cual)
    setFallo(null)
    try {
      setPapel(await hacer())
    } catch (e) {
      setFallo(e instanceof Error ? e : new Error('No se pudo armar el reporte.'))
    } finally {
      setArmando(null)
    }
  }

  const resumen = () =>
    armar('resumen', () =>
      armarResumenPorMoneda({
        ...cabecera(),
        desde: desde || null,
        hasta: hasta || null,
        filas,
        cuentas: (cuentas.data ?? []).filter((c) => c.activa),
      }),
    )

  const libroDeMoneda = (moneda: string) =>
    armar(`moneda-${moneda}`, async () =>
      armarLibroDeDinero({
        ...cabecera(),
        alcance: `Todas las cuentas en ${moneda}`,
        moneda,
        desde: desde || null,
        hasta: hasta || null,
        saldoAnterior: null,
        renglones: (libro.data ?? []).filter((r) => r.moneda === moneda),
      }),
    )

  const libroDeCuenta = () =>
    armar('cuenta', async () => {
      const cuenta = (cuentas.data ?? []).find((c) => String(c.id) === cuentaId)
      if (!cuenta) throw new Error('Elige de qué caja quieres el libro.')
      const renglones = await leerLibroDeDinero({
        desde: desde || null,
        hasta: hasta || null,
        cuenta_id: cuenta.id,
      })
      /*
        El saldo anterior sale del primer renglón: el saldo que dejó, menos lo
        que ese renglón movió. Sin renglones en el rango, es lo que había antes
        de la fecha inicial, y eso se pide aparte.
      */
      let saldoAnterior = 0
      if (renglones.length > 0) {
        const r = renglones[0]
        saldoAnterior = Number(r.saldo ?? 0) - r.signo * Number(r.monto)
      } else if (desde) {
        const previos = await leerLibroDeDinero({ hasta: desde, cuenta_id: cuenta.id })
        const antes = previos.filter((r) => r.fecha < desde)
        saldoAnterior = Number(antes[antes.length - 1]?.saldo ?? 0)
      }
      return armarLibroDeDinero({
        ...cabecera(),
        alcance: cuenta.nombre,
        moneda: cuenta.moneda,
        desde: desde || null,
        hasta: hasta || null,
        saldoAnterior,
        renglones,
      })
    })

  const gastos = () =>
    armar('gastos', async () =>
      armarGastosPorCategoria({
        ...cabecera(),
        desde: desde || null,
        hasta: hasta || null,
        gastos: gastosPorCategoria(libro.data ?? []),
      }),
    )

  const datosDelCierre = async () => {
    const hastaElFinal = await leerLibroDeDinero({ hasta: ultimoDiaDe(mes) })
    return cerrarMes(hastaElFinal, `${mes}-01`)
  }

  const cierre = () =>
    armar('cierre', async () => {
      const c = await datosDelCierre()
      return armarCierreDeMes({
        ...cabecera(),
        mes: nombreDelMes(mes),
        archivo: mes,
        cuentas: c.cuentas,
        monedas: c.monedas,
        gastos: gastosPorCategoria(c.delMes),
        movimientos: c.delMes.length,
      })
    })

  /*
    LA HOJA DE CÁLCULO DEL CIERRE.

    Un CSV con punto y coma y marca de orden de bytes, que es lo que Excel en
    español abre de un doble clic con los acentos bien y cada dato en su celda.
    Las cifras van con coma decimal por la misma razón.
  */
  const cierreEnHoja = async () => {
    setArmando('hoja')
    setFallo(null)
    try {
      const c = await datosDelCierre()
      const num = (v: number) => v.toFixed(2).replace('.', ',')
      const celda = (v: string) => `"${v.replaceAll('"', '""')}"`
      const lineas: string[][] = [
        [`Cierre de ${nombreDelMes(mes)}`],
        [],
        ['RESULTADO POR MONEDA'],
        ['Moneda', 'Ingresos', 'Gastos', 'Resultado'],
        ...c.monedas.map((m) => [m.moneda, num(m.ingresos), num(m.gastos), num(m.resultado)]),
        [],
        ['CADA CUENTA'],
        ['Cuenta', 'Moneda', 'Saldo inicial', 'Entró', 'Salió', 'Saldo final', 'Movimientos'],
        ...c.cuentas.map((k) => [
          k.cuenta,
          k.moneda,
          num(k.inicial),
          num(k.entradas),
          num(k.salidas),
          num(k.final),
          String(k.movimientos),
        ]),
        [],
        ['GASTOS POR CATEGORÍA'],
        ['Moneda', 'Categoría', 'Subcategoría', 'Monto', 'Movimientos'],
        ...gastosPorCategoria(c.delMes).map((g) => [
          g.moneda,
          g.padre,
          g.categoria === g.padre ? '' : g.categoria,
          num(g.monto),
          String(g.movimientos),
        ]),
        [],
        ['MOVIMIENTOS DEL MES'],
        ['Fecha', 'Número', 'Cuenta', 'Moneda', 'Tipo', 'Concepto', 'Beneficiario', 'Referencia', 'Debe', 'Haber', 'Saldo de la cuenta'],
        ...c.delMes.map((r) => [
          r.fecha,
          r.numero,
          r.cuenta ?? '',
          r.moneda,
          r.tipo,
          r.concepto,
          r.contraparte ?? '',
          r.referencia ?? '',
          num(Number(r.debe)),
          num(Number(r.haber)),
          r.saldo === null ? '' : num(Number(r.saldo)),
        ]),
      ]
      const texto = '﻿' + lineas.map((l) => l.map(celda).join(';')).join('\r\n')
      const blob = new Blob([texto], { type: 'text/csv;charset=utf-8' })
      const enlace = document.createElement('a')
      enlace.href = URL.createObjectURL(blob)
      enlace.download = `tesoreria-cierre-${mes}.csv`
      enlace.click()
      setTimeout(() => URL.revokeObjectURL(enlace.href), 1000)
    } catch (e) {
      setFallo(e instanceof Error ? e : new Error('No se pudo armar la hoja de cálculo.'))
    } finally {
      setArmando(null)
    }
  }

  if (cuentas.isPending) return <Cargando />
  if (cuentas.error) return <ErrorDeCarga error={cuentas.error} />

  return (
    <>
      <PageHeader
        eyebrow="Tesorería"
        title="Reportes"
        description="Lo que entró, lo que salió y lo que hay, moneda por moneda. Todo se ve antes de descargarse."
      />

      <Card className="mb-4">
        <CardHeader
          title="Período"
          subtitle="Manda sobre el resumen, los libros y los gastos. El cierre de mes elige su mes aparte."
        />
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="w-44">
            <Input label="Desde" type="date" value={desde} max={hasta || hoy} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="w-44">
            <Input label="Hasta" type="date" value={hasta} max={hoy} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              setDesde(`${hoy.slice(0, 7)}-01`)
              setHasta(hoy)
            }}
          >
            Este mes
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setDesde('')
              setHasta(hoy)
            }}
          >
            Todo el libro
          </Button>
        </div>
        {rangoMalo ? (
          <p className="text-danger mt-2 text-sm">La fecha inicial es posterior a la final.</p>
        ) : null}
      </Card>

      {fallo ? <ErrorDeCarga error={fallo} className="mb-4" /> : null}

      <Card className="mb-4">
        <CardHeader
          title="Resumen por moneda"
          subtitle="Cada moneda en su fila: no se suman entre sí. Toca una para abrir su libro."
          action={
            <Button icon={<FileText />} disabled={armando !== null || libro.isPending} onClick={() => void resumen()}>
              {armando === 'resumen' ? 'Armando…' : 'Ver en PDF'}
            </Button>
          }
        />
        {libro.error ? (
          <ErrorDeCarga error={libro.error} className="mt-3" />
        ) : libro.isPending ? (
          <Cargando />
        ) : (
          <>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                    <th className="py-2 pr-3 font-medium">Moneda</th>
                    <th className="px-3 py-2 text-right font-medium">Debe</th>
                    <th className="px-3 py-2 text-right font-medium">Haber</th>
                    <th className="px-3 py-2 text-right font-medium">Saldo en cajas</th>
                    <th className="px-3 py-2 text-right font-medium">Por pagar</th>
                    <th className="py-2 pl-3 text-right font-medium">Por cobrar</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr
                      key={f.moneda}
                      onClick={() => void libroDeMoneda(f.moneda)}
                      className="border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors last:border-0"
                      title={`Abrir el libro de ${f.moneda}`}
                    >
                      <td className="text-ink/85 py-2.5 pr-3 font-medium">{f.moneda}</td>
                      <td className="tabular text-ink/75 px-3 py-2.5 text-right">{n(f.debe)}</td>
                      <td className="tabular text-ink/75 px-3 py-2.5 text-right">{n(f.haber)}</td>
                      <td
                        className={`tabular px-3 py-2.5 text-right font-medium ${f.saldo < 0 ? 'text-danger' : 'text-ink/90'}`}
                      >
                        {n(f.saldo)}
                      </td>
                      <td className="tabular text-ink/60 px-3 py-2.5 text-right">{n(f.porPagar)}</td>
                      <td className="tabular text-ink/60 py-2.5 pl-3 text-right">{n(f.porCobrar)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-ink/45 mt-2 text-xs">{NOTA_FLUJO_Y_EXISTENCIA}</p>
          </>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Libro de una caja" subtitle="Fecha, concepto, beneficiario, Debe, Haber y saldo, con su saldo anterior." />
          <div className="mt-3 space-y-3">
            <Select
              label="Caja, banco o billetera"
              vacio="Elige una"
              value={cuentaId}
              onChange={(e) => setCuentaId(e.target.value)}
              opciones={(cuentas.data ?? []).map((c) => ({
                valor: String(c.id),
                etiqueta: `${c.nombre} · ${c.moneda}${c.activa ? '' : ' (cerrada)'}`,
              }))}
            />
            <Button
              variant="outline"
              icon={<BookOpen />}
              disabled={armando !== null || !cuentaId || rangoMalo}
              onClick={() => void libroDeCuenta()}
            >
              {armando === 'cuenta' ? 'Armando…' : 'Ver el libro'}
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Gastos por categoría" subtitle="En qué se fue el dinero en el período, por moneda. Sin los traslados entre cuentas propias." />
          <div className="mt-3">
            <Button
              variant="outline"
              icon={<PieChart />}
              disabled={armando !== null || libro.isPending || rangoMalo}
              onClick={() => void gastos()}
            >
              {armando === 'gastos' ? 'Armando…' : 'Ver los gastos'}
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Cierre de mes" subtitle="Resultado por moneda y cómo empezó y terminó cada caja. Un mes cerrado vuelve a salir igual: el libro no se edita." />
          <div className="mt-3 space-y-3">
            <Input label="Mes" type="month" value={mes} max={hoy.slice(0, 7)} onChange={(e) => setMes(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" icon={<CalendarCheck />} disabled={armando !== null || !mes} onClick={() => void cierre()}>
                {armando === 'cierre' ? 'Armando…' : 'Ver el cierre'}
              </Button>
              <Button variant="ghost" icon={<FileSpreadsheet />} disabled={armando !== null || !mes} onClick={() => void cierreEnHoja()}>
                {armando === 'hoja' ? 'Armando…' : 'Hoja de cálculo'}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <Visor
        abierto={papel !== null}
        onCerrar={() => setPapel(null)}
        blob={papel?.blob ?? null}
        nombreArchivo={papel?.nombre ?? 'reporte.pdf'}
        titulo="Reporte de Tesorería"
        descripcion="Revísalo antes de descargarlo o imprimirlo."
      />
    </>
  )
}
