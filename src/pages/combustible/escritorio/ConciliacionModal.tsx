import { useMemo, useState } from 'react'
import { Visor } from '@/components/Visor'
import { Button } from '@/components/ui/Button'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useConciliaciones, useRegistrarConciliacion, useResumenPeriodo } from '@/lib/api/combustible'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { armarPapelCombustible } from '@/lib/ficha/combustiblePdf'
import { hoyIsoVE, restarDiasIso } from '@/lib/combustible/reporteExistenciasCorte'
import { n, type TanqueGt } from '@/lib/combustible/tipos'
import { useSesion } from '@/lib/sesion'
import { bajarArchivo, escribirXlsx } from '@/lib/xlsx'
import { cn } from '@/lib/cn'
import { leerNumero, lt, norm, useEmpresaPapel } from './comun'
import { MiniInput, MiniSelect } from './piezas'

/*
  ⚖ CONCILIACIÓN SEMANAL DE LOS TANQUES (Golden Touch, ConciliacionModal,
  conciliacionPdf y conciliacionExcel).

  Por cada tanque, la semana según nuestros libros (saldo inicial + entradas +
  retornos − usos − traslados − mermas, calculado en la base) contra el saldo
  que reporta la mina en su libreta. La diferencia es el faltante a vigilar.
  Debajo, el historial con filtros, PDF y Excel.

  Diferencias con Golden Touch: solo se guardan los tanques con libreta
  escrita (un cero inventado sería una diferencia falsa); la base no concilia
  días que no han pasado, así que si la semana no ha terminado se concilia
  hasta hoy; sin «✉ Correo».
*/

function lunesDe(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dia = new Date(y, m - 1, d).getDay()
  return restarDiasIso(iso, (dia + 6) % 7)
}

export function ConciliacionModal({ tanques, onCerrar }: { tanques: TanqueGt[]; onCerrar: () => void }) {
  const empresa = useEmpresaPapel()
  const { nombre: yo } = useSesion()
  const hoy = hoyIsoVE()
  const semanaDe = (iso: string) => ({ desde: lunesDe(iso), hasta: restarDiasIso(lunesDe(iso), -6) })
  const [{ desde, hasta }, setRango] = useState(() => semanaDe(hoy))
  const [libreta, setLibreta] = useState<Record<number, string>>({})
  const [notas, setNotas] = useState('')
  const [hTexto, setHTexto] = useState('')
  const [hTanque, setHTanque] = useState('')
  const [hDesde, setHDesde] = useState('')
  const [hHasta, setHHasta] = useState('')
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [errorPdf, setErrorPdf] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)

  const valido = !!desde && !!hasta && desde <= hasta
  const resumen = useResumenPeriodo(desde, hasta, valido)
  const historial = useConciliaciones()
  const registrar = useRegistrarConciliacion()
  const filas = useMemo(() => resumen.data ?? [], [resumen.data])

  const mover = (dir: number) => setRango({ desde: restarDiasIso(desde, -7 * dir), hasta: restarDiasIso(hasta, -7 * dir) })
  const dif = (almacenId: number, libros: number) => {
    const v = leerNumero(libreta[almacenId] ?? '')
    return v == null ? null : libros - v
  }

  const tot = useMemo(() => {
    const s = (k: 'saldo_inicial' | 'entradas' | 'usos' | 'traslados' | 'retornos' | 'mermas' | 'saldo_libros') =>
      filas.reduce((a, r) => a + n(r[k]), 0)
    return {
      saldoInicial: s('saldo_inicial'),
      entradas: s('entradas'),
      usos: s('usos'),
      traslados: s('traslados'),
      retornos: s('retornos'),
      mermas: s('mermas'),
      saldoLibros: s('saldo_libros'),
      libreta: filas.reduce((a, r) => a + (leerNumero(libreta[r.almacen_id] ?? '') ?? 0), 0),
    }
  }, [filas, libreta])

  const conLibreta = filas.filter((r) => leerNumero(libreta[r.almacen_id] ?? '') != null)
  const hastaGuardar = hasta > hoy ? hoy : hasta

  const guardar = async () => {
    setGuardado(false)
    const periodo = `${desde} a ${hasta}`
    for (const r of conLibreta) {
      await registrar.mutateAsync({
        almacen_id: r.almacen_id,
        saldo_reportado: leerNumero(libreta[r.almacen_id] ?? '') ?? 0,
        desde,
        hasta: hastaGuardar,
        periodo,
        notas: notas.trim() || null,
      })
    }
    setNotas('')
    setLibreta({})
    setGuardado(true)
  }

  const nombreTanque = (id: number) => tanques.find((t) => t.almacen_id === id)?.nombre ?? '—'
  const histFiltrado = useMemo(() => {
    const q = norm(hTexto)
    return (historial.data ?? []).filter((c) => {
      if (hTanque && String(c.almacen_id) !== hTanque) return false
      if (hDesde && c.fecha < hDesde) return false
      if (hHasta && c.fecha > hHasta) return false
      if (q) {
        const hay = norm([c.periodo, nombreTanque(c.almacen_id), c.fecha, c.notas, lt(c.saldo_libros), lt(c.saldo_reportado_mina)].join(' '))
        if (!hay.includes(q)) return false
      }
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historial.data, hTexto, hTanque, hDesde, hHasta, tanques])
  const totHist = {
    libros: histFiltrado.reduce((a, c) => a + n(c.saldo_libros), 0),
    libreta: histFiltrado.reduce((a, c) => a + n(c.saldo_reportado_mina), 0),
  }
  const hayFiltro = !!(hTexto || hTanque || hDesde || hHasta)

  const verPdf = async () => {
    setErrorPdf(null)
    try {
      setPdf(
        await armarPapelCombustible({
          titulo: 'Conciliaciones de combustible',
          empresa,
          datos: [['Registros', String(histFiltrado.length)]],
          resumen: [
            ['Libros', `${lt(totHist.libros)} L`],
            ['Libreta (mina)', `${lt(totHist.libreta)} L`],
            ...(hayFiltro ? ([['Filtro', 'con el filtro aplicado']] as [string, string][]) : []),
          ],
          secciones: [
            {
              columnas: [
                { titulo: 'Semana', ancho: 2.2 },
                { titulo: 'Tanque', ancho: 2 },
                { titulo: 'Registrada', ancho: 1.2 },
                { titulo: 'Libros', ancho: 1.2, alDerecha: true },
                { titulo: 'Libreta (mina)', ancho: 1.3, alDerecha: true },
                { titulo: 'Dif.', ancho: 1, alDerecha: true },
                { titulo: 'Notas', ancho: 2.5 },
              ],
              filas: histFiltrado.map((c) => [
                c.periodo ?? '—',
                nombreTanque(c.almacen_id),
                c.fecha,
                lt(c.saldo_libros),
                lt(c.saldo_reportado_mina),
                lt(c.diferencia),
                c.notas ?? '',
              ]),
              totales: ['TOTALES', '', '', lt(totHist.libros), lt(totHist.libreta), '', ''],
            },
          ],
          apaisado: true,
          emitidoPor: yo ?? '',
          momento: new Date(),
          nombreArchivo: `conciliaciones-combustible-${hoy}.pdf`,
        }),
      )
    } catch (e) {
      setErrorPdf(e instanceof Error ? e.message : 'No se pudo generar el PDF')
    }
  }

  const bajarExcel = () =>
    bajarArchivo(
      escribirXlsx({
        nombre: 'Conciliaciones',
        columnas: [
          { titulo: 'Semana', ancho: 26 },
          { titulo: 'Tanque', ancho: 22 },
          { titulo: 'Registrada', ancho: 12 },
          { titulo: 'Libros (L)', ancho: 14 },
          { titulo: 'Libreta mina (L)', ancho: 16 },
          { titulo: 'Diferencia (L)', ancho: 14 },
          { titulo: 'Notas', ancho: 40 },
        ],
        filas: [
          ...histFiltrado.map((c) => [
            c.periodo ?? '',
            nombreTanque(c.almacen_id),
            c.fecha,
            n(c.saldo_libros),
            n(c.saldo_reportado_mina),
            n(c.diferencia),
            c.notas ?? '',
          ]),
          [],
          ['TOTALES', '', '', totHist.libros, totHist.libreta, '', ''],
        ],
      }),
      `conciliaciones-combustible-${hoy}.xlsx`,
    )

  const td = 'tabular px-2 py-2 text-right'

  return (
    <>
      <Modal
        abierto
        onCerrar={onCerrar}
        titulo="Conciliación semanal · Tanques"
        ancho="xl"
        acciones={<Button onClick={onCerrar}>Cerrar</Button>}
      >
        <div className="border-hairline mb-5 rounded-lg border p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => mover(-1)}>
              ← Semana ant.
            </Button>
            <label className="text-ink/55 inline-flex items-center gap-1 text-xs">
              Desde <MiniInput type="date" value={desde} onChange={(v) => setRango((r) => ({ ...r, desde: v }))} />
            </label>
            <label className="text-ink/55 inline-flex items-center gap-1 text-xs">
              Hasta <MiniInput type="date" value={hasta} onChange={(v) => setRango((r) => ({ ...r, hasta: v }))} />
            </label>
            <Button size="sm" variant="ghost" onClick={() => mover(1)}>
              Semana sig. →
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRango(semanaDe(hoy))}>
              Semana actual
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink/50 border-hairline border-b text-left text-xs">
                  <th className="px-2 py-2 font-medium">Tanque</th>
                  <th className="px-2 py-2 text-right font-medium">Saldo inicial</th>
                  <th className="px-2 py-2 text-right font-medium">Entradas</th>
                  <th className="px-2 py-2 text-right font-medium">Usos</th>
                  <th className="px-2 py-2 text-right font-medium">Traslados</th>
                  <th className="px-2 py-2 text-right font-medium">Retornos</th>
                  <th className="px-2 py-2 text-right font-medium">Mermas</th>
                  <th className="px-2 py-2 text-right font-medium">Saldo libros</th>
                  <th className="px-2 py-2 font-medium">Saldo según la mina (Libreta)</th>
                  <th className="px-2 py-2 text-right font-medium">Dif.</th>
                </tr>
              </thead>
              <tbody>
                {resumen.isPending && valido ? (
                  <tr>
                    <td colSpan={10} className="text-ink/45 px-2 py-4 text-center">
                      Calculando…
                    </td>
                  </tr>
                ) : null}
                {!resumen.isPending && !filas.length ? (
                  <tr>
                    <td colSpan={10} className="text-ink/45 px-2 py-4 text-center">
                      Sin tanques.
                    </td>
                  </tr>
                ) : null}
                {filas.map((r) => {
                  const d = dif(r.almacen_id, n(r.saldo_libros))
                  return (
                    <tr key={r.almacen_id} className="border-hairline border-b last:border-0">
                      <td className="px-2 py-2">
                        <strong className="text-ink/85">{r.tanque}</strong>{' '}
                        <span className="text-ink/45 text-xs">· {r.movimientos} mov.</span>
                      </td>
                      <td className={td}>{lt(r.saldo_inicial)}</td>
                      <td className={cn(td, 'text-success')}>{lt(r.entradas)}</td>
                      <td className={cn(td, 'text-danger')}>{lt(r.usos)}</td>
                      <td className={cn(td, 'text-warning')}>{lt(r.traslados)}</td>
                      <td className={cn(td, 'text-info')}>{lt(r.retornos)}</td>
                      <td className={cn(td, 'text-danger')}>{lt(r.mermas)}</td>
                      <td className={cn(td, 'font-semibold')}>{lt(r.saldo_libros)}</td>
                      <td className="px-2 py-1.5">
                        <div className="w-32">
                          <Input
                            label={`Libreta de ${r.tanque}`}
                            ocultarEtiqueta
                            type="number"
                            inputMode="decimal"
                            placeholder="libreta"
                            value={libreta[r.almacen_id] ?? ''}
                            onChange={(e) => setLibreta((c) => ({ ...c, [r.almacen_id]: e.target.value }))}
                          />
                        </div>
                      </td>
                      <td className={cn(td, d != null && Math.abs(d) > 0.01 && 'text-warning font-semibold')}>{d == null ? '—' : lt(d)}</td>
                    </tr>
                  )
                })}
              </tbody>
              {filas.length ? (
                <tfoot>
                  <tr className="border-hairline border-t-2 font-semibold">
                    <td className="px-2 py-2">TOTALES</td>
                    <td className={td}>{lt(tot.saldoInicial)}</td>
                    <td className={cn(td, 'text-success')}>{lt(tot.entradas)}</td>
                    <td className={cn(td, 'text-danger')}>{lt(tot.usos)}</td>
                    <td className={cn(td, 'text-warning')}>{lt(tot.traslados)}</td>
                    <td className={cn(td, 'text-info')}>{lt(tot.retornos)}</td>
                    <td className={cn(td, 'text-danger')}>{lt(tot.mermas)}</td>
                    <td className={td}>{lt(tot.saldoLibros)}</td>
                    <td className="tabular px-2 py-2">{lt(tot.libreta)}</td>
                    <td />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>

          <div className="my-4 grid gap-3 sm:grid-cols-2">
            <div className="border-danger/30 bg-danger-soft rounded-lg border p-3 text-center">
              <p className="text-ink/75 text-xs font-bold tracking-wide">SALDOS DE CONSUMO DIÉSEL · NUESTROS LIBROS</p>
              <p className="tabular text-ink/90 mt-1 text-2xl font-extrabold">{lt(tot.saldoLibros)} L</p>
              <p className="text-ink/50 text-2xs">resultado de la semana · no editable</p>
            </div>
            <div className="border-info/30 bg-info-soft rounded-lg border p-3 text-center">
              <p className="text-ink/75 text-xs font-bold tracking-wide">SALDOS REPORTADOS POR LA MINA (LIBRETA)</p>
              <p className="tabular text-ink/90 mt-1 text-2xl font-extrabold">{lt(tot.libreta)} L</p>
              <p className="text-ink/50 text-2xs">según libreta · no editable</p>
            </div>
          </div>

          <Input label="Notas de la semana" value={notas} onChange={(e) => setNotas(e.target.value)} />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => void guardar()} disabled={registrar.isPending || !conLibreta.length}>
              {registrar.isPending ? 'Guardando…' : 'Guardar conciliación de la semana'}
            </Button>
            {guardado ? <span className="text-success text-sm">✓ Conciliación registrada</span> : null}
          </div>
          {registrar.error ? <ErrorDeCarga error={registrar.error} className="mt-3" /> : null}
          <p className="text-ink/50 mt-2 text-xs">
            El saldo en libros se calcula con todos los movimientos de cada tanque en la semana (saldo inicial + entradas + retornos −
            usos − traslados − mermas; lo anulado no suma). La diferencia contra el saldo según la mina (libreta) es el faltante o la
            merma a vigilar. Se guardan los tanques con libreta escrita
            {hasta > hoy ? `, con corte a hoy (${hoy}): la semana todavía no termina` : ''}.
          </p>
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-ink/85 text-sm font-semibold">Conciliaciones registradas</span>
            <Button size="sm" variant="ghost" disabled={!histFiltrado.length} onClick={() => void verPdf()} title="PDF con el filtro aplicado">
              ↓ PDF
            </Button>
            <Button size="sm" variant="ghost" disabled={!histFiltrado.length} onClick={bajarExcel} title="Excel con el filtro aplicado">
              📊 Excel
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <MiniInput type="search" value={hTexto} onChange={setHTexto} placeholder="🔍 Buscar (semana, tanque, notas…)" className="w-56" />
            <MiniSelect
              value={hTanque}
              onChange={setHTanque}
              opciones={[{ valor: '', etiqueta: 'Todo tanque' }, ...tanques.map((t) => ({ valor: String(t.almacen_id), etiqueta: t.nombre }))]}
            />
            <label className="text-ink/55 inline-flex items-center gap-1 text-xs">
              Desde <MiniInput type="date" value={hDesde} onChange={setHDesde} />
            </label>
            <label className="text-ink/55 inline-flex items-center gap-1 text-xs">
              Hasta <MiniInput type="date" value={hHasta} onChange={setHHasta} />
            </label>
            {hayFiltro ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setHTexto('')
                  setHTanque('')
                  setHDesde('')
                  setHHasta('')
                }}
              >
                ✕ Limpiar
              </Button>
            ) : null}
            <span className="text-ink/50 text-xs">
              {histFiltrado.length}/{(historial.data ?? []).length}
            </span>
          </div>
        </div>

        <div className="border-hairline overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-ink/50 border-hairline border-b text-left text-xs">
                <th className="px-2 py-2 font-medium">Semana</th>
                <th className="px-2 py-2 font-medium">Tanque</th>
                <th className="px-2 py-2 font-medium">Registrada</th>
                <th className="px-2 py-2 text-right font-medium">Libros</th>
                <th className="px-2 py-2 text-right font-medium">Libreta (mina)</th>
                <th className="px-2 py-2 text-right font-medium">Dif.</th>
                <th className="px-2 py-2 font-medium">Notas</th>
              </tr>
            </thead>
            <tbody>
              {!(historial.data ?? []).length ? (
                <tr>
                  <td colSpan={7} className="text-ink/45 px-2 py-4 text-center">
                    Sin conciliaciones.
                  </td>
                </tr>
              ) : !histFiltrado.length ? (
                <tr>
                  <td colSpan={7} className="text-ink/45 px-2 py-4 text-center">
                    Ninguna conciliación coincide con el filtro.
                  </td>
                </tr>
              ) : null}
              {histFiltrado.map((c) => (
                <tr key={c.id} className="border-hairline border-b last:border-0">
                  <td className="tabular px-2 py-2">{c.periodo || '—'}</td>
                  <td className="px-2 py-2">{nombreTanque(c.almacen_id)}</td>
                  <td className="tabular px-2 py-2">{c.fecha}</td>
                  <td className={td}>{lt(c.saldo_libros)}</td>
                  <td className={td}>{lt(c.saldo_reportado_mina)}</td>
                  <td className={cn(td, Math.abs(n(c.diferencia)) > 0.01 && 'text-warning font-semibold')}>{lt(c.diferencia)}</td>
                  <td className="text-ink/60 px-2 py-2">{c.notas || '—'}</td>
                </tr>
              ))}
            </tbody>
            {histFiltrado.length ? (
              <tfoot>
                <tr className="border-hairline border-t-2 font-semibold">
                  <td className="px-2 py-2" colSpan={3}>
                    TOTALES
                  </td>
                  <td className={td}>{lt(totHist.libros)}</td>
                  <td className={td}>{lt(totHist.libreta)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </Modal>

      <Visor
        abierto={pdf !== null || errorPdf !== null}
        onCerrar={() => {
          setPdf(null)
          setErrorPdf(null)
        }}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? 'conciliaciones-combustible.pdf'}
        titulo="Conciliaciones de combustible"
        error={errorPdf}
      />
    </>
  )
}
