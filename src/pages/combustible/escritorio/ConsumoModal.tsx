import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { Modal } from '@/components/ui/Modal'
import { Segmento } from '@/components/ui/Segmento'
import { useLibroTanque } from '@/lib/api/combustible'
import type { Maquina } from '@/lib/api/maquinaria'
import { enriquecerMovimientos, procesarFilasReporte } from '@/lib/combustible/reporteMoldeable'
import { hoyIsoVE, restarDiasIso } from '@/lib/combustible/reporteExistenciasCorte'
import type { TanqueGt } from '@/lib/combustible/tipos'
import { fichasDeMaquinas, lt, norm, usePermisosCombustible, usd } from './comun'
import { ExportarCombustibleModal } from './ExportarCombustibleModal'
import { Cifra, MiniInput, Pastilla } from './piezas'

/*
  📊 CONSUMO DE COMBUSTIBLE POR EQUIPO (Golden Touch, ConsumoChartModal con
  `consumoUso` de tanques.repository).

  Litros surtidos (movimientos de USO) por equipo en el período, con una barra
  por equipo y la tabla con cantidad, horas trabajadas, litros por hora y $.
  Absorbe lo que hacía «Consumo por máquina» de la pantalla vieja
  (`v_consumo_combustible`): aquí las horas salen del horómetro de cada surtido
  (HF − HI), que desde Golden Touch se pide en cada uno, y no se estiman.

  «📄 Descargar reporte» abre el reporte moldeable (PDF, Excel o CSV).
*/

type Preset = 'hoy' | '7d' | '15d' | 'mes' | 'rango'
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: '7d', label: '7 días' },
  { key: '15d', label: '15 días' },
  { key: 'mes', label: 'Este mes' },
  { key: 'rango', label: 'Rango' },
]

function rango(p: Preset, hoy: string, d: string, h: string) {
  if (p === 'rango') return { desde: d, hasta: h }
  if (p === 'hoy') return { desde: hoy, hasta: hoy }
  if (p === '7d') return { desde: restarDiasIso(hoy, 7), hasta: hoy }
  if (p === '15d') return { desde: restarDiasIso(hoy, 15), hasta: hoy }
  return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy }
}

export function ConsumoModal({
  tanques,
  maquinas,
  tanqueInicial,
  onCerrar,
}: {
  tanques: TanqueGt[]
  maquinas: Maquina[]
  tanqueInicial: number | null
  onCerrar: () => void
}) {
  const p = usePermisosCombustible()
  const hoy = hoyIsoVE()
  const [preset, setPreset] = useState<Preset>('15d')
  const [d, setD] = useState(hoy)
  const [h, setH] = useState(hoy)
  const [metricaElegida, setMetrica] = useState<'valor' | 'cantidad' | 'horas'>('valor')
  const metrica = !p.veValor && metricaElegida === 'valor' ? 'cantidad' : metricaElegida
  const [q, setQ] = useState('')
  const [exportar, setExportar] = useState(false)

  const { desde, hasta } = rango(preset, hoy, d, h)
  const libro = useLibroTanque({ desde, hasta, porPagina: 20000 })
  const fichas = useMemo(() => fichasDeMaquinas(maquinas), [maquinas])

  const filas = useMemo(() => {
    const usos = enriquecerMovimientos(libro.data?.filas ?? [], fichas, tanques, 'historica').filter((x) => x.mov.tipo === 'uso')
    return procesarFilasReporte(usos, 'equipo', 'litros').filas
  }, [libro.data, fichas, tanques])

  const ordenadas = useMemo(() => {
    const s = norm(q)
    const base = s ? filas.filter((r) => norm(r.equipo).includes(s) || norm(r.tipo).includes(s)) : filas
    return base
      .slice()
      .sort((a, b) => (metrica === 'horas' ? b.horas - a.horas : metrica === 'cantidad' ? b.litros - a.litros : b.usd - a.usd))
  }, [filas, q, metrica])

  const totalL = ordenadas.reduce((a, r) => a + r.litros, 0)
  const totalUsd = ordenadas.reduce((a, r) => a + r.usd, 0)
  const totalH = ordenadas.reduce((a, r) => a + r.horas, 0)
  const valorDe = (r: (typeof ordenadas)[number]) => (metrica === 'valor' ? r.usd : metrica === 'horas' ? r.horas : r.litros)
  const maximo = Math.max(0, ...ordenadas.map(valorDe))

  if (exportar) {
    return (
      <ExportarCombustibleModal
        tanques={tanques}
        maquinas={maquinas}
        tanqueInicial={tanqueInicial}
        rangoInicial={{ desde, hasta }}
        onCerrar={() => setExportar(false)}
      />
    )
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Consumo de combustible por equipo"
      ancho="xl"
      acciones={
        <>
          <Button
            variant="soft"
            className="sm:mr-auto"
            onClick={() => setExportar(true)}
            title="Descargar reporte de combustible (PDF, Excel, CSV) con filtros avanzados"
          >
            📄 Descargar reporte (PDF / Excel / CSV)
          </Button>
          <Button variant="ghost" onClick={onCerrar}>
            Cerrar
          </Button>
        </>
      }
    >
      <p className="text-ink/55 mb-3 text-sm">
        Litros consumidos (movimientos de USO) por equipo.
        {p.veValor ? ' El valor en $ usa la tasa con que salió cada surtido.' : ''} Las horas salen del horómetro de cada
        surtido (HF − HI).
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {PRESETS.map((x) => (
          <Pastilla key={x.key} activa={preset === x.key} onClick={() => setPreset(x.key)}>
            {x.label}
          </Pastilla>
        ))}
        {preset === 'rango' ? (
          <span className="inline-flex items-center gap-1.5">
            <MiniInput type="date" value={d} onChange={setD} />
            <span className="text-ink/45">→</span>
            <MiniInput type="date" value={h} onChange={setH} />
          </span>
        ) : null}
        <Segmento
          className="sm:ml-auto"
          valor={metrica}
          onCambio={(v) => setMetrica(v as 'valor' | 'cantidad' | 'horas')}
          opciones={[
            ...(p.veValor ? [{ valor: 'valor', etiqueta: 'Valor ($)' }] : []),
            { valor: 'horas', etiqueta: 'Horas trabajadas' },
            { valor: 'cantidad', etiqueta: 'Cantidad' },
          ]}
        />
      </div>

      <MiniInput type="search" value={q} onChange={setQ} placeholder="🔍 Buscar…" className="mb-3 w-full" />

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Cifra rotulo="Equipos" valor={ordenadas.length} />
        <Cifra rotulo="Cantidad total" valor={`${lt(totalL)} L`} />
        {p.veValor ? <Cifra rotulo="Valor total ($)" valor={usd(totalUsd)} tono="success" /> : null}
        <Cifra rotulo="Horas trabajadas total" valor={`${lt(totalH)} h`} tono="info" />
        <Cifra rotulo="Promedio L/h" valor={totalH > 0 ? lt(totalL / totalH) : '—'} tono="royal" />
      </div>

      {libro.isPending ? <Cargando /> : null}
      {libro.error ? <ErrorDeCarga error={libro.error} className="mb-3" /> : null}

      <div className="border-hairline mb-3 rounded-lg border p-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-ink/80 text-sm font-semibold">
            Consumo por equipo {metrica === 'valor' ? '(en $)' : metrica === 'horas' ? '(en horas trabajadas)' : '(en cantidad)'}
          </p>
          <p className="text-ink/45 font-mono text-xs">{ordenadas.length} equipo(s)</p>
        </div>
        {!ordenadas.length ? (
          <p className="text-ink/45 py-6 text-center text-sm">Sin consumo en el período seleccionado.</p>
        ) : (
          <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {ordenadas.map((r) => {
              const v = valorDe(r)
              return (
                <li key={r.id} title={`${r.equipo}: ${lt(r.litros)} L${p.veValor ? ` · ${usd(r.usd)}` : ''}${r.horas ? ` · ${lt(r.horas)} h` : ''}`}>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-ink/70 truncate">{r.equipo}</span>
                    <span className="tabular text-ink/80 shrink-0 font-medium">
                      {metrica === 'valor' ? usd(v) : metrica === 'horas' ? `${lt(v)} h` : `${lt(v)} L`}
                    </span>
                  </div>
                  <div className="bg-ink/6 mt-1 h-2 overflow-hidden rounded-full">
                    <div
                      className="bg-royal-600 h-full rounded-full"
                      style={{ width: `${maximo > 0 ? Math.max(2, (v / maximo) * 100) : 0}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="border-hairline max-h-72 overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ink/50 border-hairline border-b text-left text-xs">
              <th className="px-3 py-2 font-medium">Equipo</th>
              <th className="px-3 py-2 text-right font-medium">Cantidad</th>
              <th className="px-3 py-2 text-right font-medium">Horas Trab.</th>
              <th className="px-3 py-2 text-right font-medium">L/h</th>
              {p.veValor ? <th className="px-3 py-2 text-right font-medium">$/h</th> : null}
              {p.veValor ? <th className="px-3 py-2 text-right font-medium">Valor ($)</th> : null}
            </tr>
          </thead>
          <tbody>
            {!ordenadas.length ? (
              <tr>
                <td colSpan={6} className="text-ink/45 px-3 py-4 text-center">
                  Sin consumo en el período.
                </td>
              </tr>
            ) : null}
            {ordenadas.map((r) => (
              <tr key={r.id} className="border-hairline border-b last:border-0">
                <td className="text-ink/85 px-3 py-2">
                  {r.equipo}
                  <span className="text-ink/45 text-xs">
                    {' '}
                    · {r.surtidos} surtido{r.surtidos === 1 ? '' : 's'}
                  </span>
                </td>
                <td className="tabular px-3 py-2 text-right">{lt(r.litros)} L</td>
                <td className="tabular text-info px-3 py-2 text-right">{r.horas > 0 ? `${lt(r.horas)} h` : '—'}</td>
                <td className="tabular text-ink/90 px-3 py-2 text-right font-semibold">
                  {r.rendimiento != null ? lt(r.rendimiento) : <span className="text-ink/35" title="Falta el horómetro en los surtidos">—</span>}
                </td>
                {p.veValor ? <td className="tabular px-3 py-2 text-right">{r.horas > 0 ? usd(r.usd / r.horas) : '—'}</td> : null}
                {p.veValor ? <td className="tabular px-3 py-2 text-right">{usd(r.usd)}</td> : null}
              </tr>
            ))}
          </tbody>
          {ordenadas.length ? (
            <tfoot>
              <tr className="border-hairline border-t font-semibold">
                <td className="px-3 py-2 text-right">TOTAL</td>
                <td className="tabular px-3 py-2 text-right">{lt(totalL)} L</td>
                <td className="tabular text-info px-3 py-2 text-right">{lt(totalH)} h</td>
                <td className="tabular px-3 py-2 text-right">{totalH > 0 ? lt(totalL / totalH) : '—'}</td>
                {p.veValor ? <td className="tabular px-3 py-2 text-right">{totalH > 0 ? usd(totalUsd / totalH) : '—'}</td> : null}
                {p.veValor ? <td className="tabular px-3 py-2 text-right">{usd(totalUsd)}</td> : null}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </Modal>
  )
}
