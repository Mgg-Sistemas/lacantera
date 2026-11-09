import { useMemo, useState } from 'react'
import { Visor } from '@/components/Visor'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { Modal } from '@/components/ui/Modal'
import { Segmento } from '@/components/ui/Segmento'
import { useLibroTanque } from '@/lib/api/combustible'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { armarPapelCombustible, type SeccionPdf } from '@/lib/ficha/combustiblePdf'
import {
  calcularCorteTanque,
  calcularTotalesCierre,
  hoyIsoVE,
  nombreMesEs,
  obtenerPresetRango,
  obtenerTituloRangoReporte,
  type PresetPeriodoCombustible,
  type SaldoCorteTanque,
} from '@/lib/combustible/reporteExistenciasCorte'
import { cuenta, n, type MovimientoLibro, type TanqueGt } from '@/lib/combustible/tipos'
import { useSesion } from '@/lib/sesion'
import { bajarArchivo, escribirXlsx } from '@/lib/xlsx'
import { cn } from '@/lib/cn'
import { equipoDe, iconoTanque, lt, TIPO_CORTO, useEmpresaPapel, usePermisosCombustible, usd } from './comun'
import { Cifra, MiniInput, MiniSelect, Pastilla } from './piezas'

/*
  📄 REPORTE DE EXISTENCIAS Y MOVIMIENTOS (Golden Touch, ReporteExistenciasModal
  y reporteExistenciasPdf/Excel).

  Para cualquier rango: con cuánto abrió cada tanque, lo que entró, se surtió,
  se trasladó y se perdió, y con cuánto cerró. Con «hasta» en el pasado es un
  corte histórico. Se eligen los tanques, se ve en fichas o en tabla y sale en
  PDF (vertical o apaisado) y en Excel.

  Diferencias con Golden Touch: el PDF se ve en el visor de la casa en lugar
  de imprimirse desde la pantalla; los $ solo salen con valoración; en el
  tanque sin costo se dice «sin costo»; lo anulado no suma (la columna
  «Otros» lleva las anulaciones para que la cuenta cierre).
*/

type TipoFiltro = 'uso_traslado' | 'uso' | 'traslado' | 'todos'

const PRESETS: PresetPeriodoCombustible[] = ['mes_actual', 'mes_anterior', '7dias', '15dias', '30dias', 'este_ano', 'todos']

export function ReporteExistenciasModal({ tanques, onCerrar }: { tanques: TanqueGt[]; onCerrar: () => void }) {
  const p = usePermisosCombustible()
  const empresa = useEmpresaPapel()
  const { nombre: yo } = useSesion()
  const hoy = hoyIsoVE()
  const inicial = obtenerPresetRango('mes_actual', hoy)
  const [periodo, setPeriodo] = useState<PresetPeriodoCombustible>('mes_actual')
  const [desde, setDesde] = useState(inicial.desde)
  const [hasta, setHasta] = useState(inicial.hasta)
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>('uso_traslado')
  const [incluirFichas, setIncluirFichas] = useState(true)
  const [incluirMovs, setIncluirMovs] = useState(true)
  const [vista, setVista] = useState<'tarjetas' | 'tabla'>('tabla')
  const [orientacion, setOrientacion] = useState<'landscape' | 'portrait'>('landscape')
  const [elegidos, setElegidos] = useState<Set<number>>(() => new Set(tanques.filter((t) => !t.es_bidon).map((t) => t.almacen_id)))
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [errorPdf, setErrorPdf] = useState<string | null>(null)

  // Todo el libro hasta el corte: la apertura sale del último renglón antes de «desde».
  const libro = useLibroTanque({ hasta: hasta || null, porPagina: 20000 })
  const movs = useMemo(() => libro.data?.filas ?? [], [libro.data])

  const cortes = useMemo(
    () => tanques.map((t) => calcularCorteTanque(t, movs, desde || null, hasta || null, hoy)),
    [tanques, movs, desde, hasta, hoy],
  )
  const seleccion = cortes.filter((c) => elegidos.has(c.tanque.almacen_id))
  const totales = calcularTotalesCierre(seleccion, tanques.length, hasta || null, hoy)
  const titulo = obtenerTituloRangoReporte(desde, hasta, periodo)

  const aplicar = (pr: PresetPeriodoCombustible) => {
    const r = obtenerPresetRango(pr, hoy)
    setPeriodo(pr)
    setDesde(r.desde)
    setHasta(r.hasta)
  }
  const etiquetaPreset = (pr: PresetPeriodoCombustible) => {
    if (pr === 'mes_actual') return `Mes actual (${nombreMesEs(Number(hoy.slice(5, 7)))})`
    if (pr === 'mes_anterior') return `Mes anterior (${nombreMesEs(Number(hoy.slice(5, 7)) - 1)})`
    if (pr === 'este_ano') return `Año ${hoy.slice(0, 4)}`
    return obtenerPresetRango(pr, hoy).label
  }
  const alterna = (id: number) =>
    setElegidos((s) => {
      const nuevo = new Set(s)
      if (nuevo.has(id)) nuevo.delete(id)
      else nuevo.add(id)
      return nuevo
    })

  const filtraDetalle = (m: MovimientoLibro) =>
    cuenta(m) &&
    (tipoFiltro === 'todos' ||
      (tipoFiltro === 'uso_traslado' && (m.tipo === 'uso' || m.tipo === 'traslado')) ||
      m.tipo === tipoFiltro)

  const valor = (c: SaldoCorteTanque) => (c.tanque.sin_costo ? 'sin costo' : p.veValor ? usd(c.saldoCierreUsd) : '')
  const tasa = (c: SaldoCorteTanque) =>
    c.tanque.sin_costo ? 'sin costo' : p.veValor && c.tasaCierre != null ? usd(c.tasaCierre) : ''

  // ─── Papeles ─────────────────────────────────────────────────────────────
  const verPdf = async () => {
    setErrorPdf(null)
    try {
      const secciones: SeccionPdf[] = []
      if (incluirFichas) {
        secciones.push({
          titulo: 'Saldos por tanque',
          columnas: [
            { titulo: 'Tanque', ancho: 3 },
            { titulo: 'Apertura (L)', ancho: 1.4, alDerecha: true },
            { titulo: 'Entradas (+)', ancho: 1.4, alDerecha: true },
            { titulo: 'Surtidos (-)', ancho: 1.4, alDerecha: true },
            { titulo: 'Traslados (-)', ancho: 1.4, alDerecha: true },
            { titulo: 'Mermas (-)', ancho: 1.2, alDerecha: true },
            { titulo: 'Otros', ancho: 1, alDerecha: true },
            { titulo: 'Cierre (L)', ancho: 1.4, alDerecha: true },
            { titulo: '% Cap.', ancho: 1, alDerecha: true },
            ...(p.veValor
              ? [
                  { titulo: 'Tasa ($/L)', ancho: 1.2, alDerecha: true },
                  { titulo: 'Valor ($)', ancho: 1.4, alDerecha: true },
                ]
              : []),
          ],
          filas: seleccion.map((c) => [
            c.tanque.nombre,
            lt(c.saldoInicialLitros),
            lt(c.entradasLitros),
            lt(c.surtidosLitros),
            lt(c.trasladosLitros),
            lt(c.mermasLitros),
            lt(c.otrosLitros),
            lt(c.saldoCierreLitros),
            `${lt(c.porcentajeLleno)}%`,
            ...(p.veValor ? [tasa(c), valor(c)] : []),
          ]),
          totales: [
            'TOTALES',
            lt(totales.totalLitrosApertura),
            lt(totales.totalEntradasLitros),
            lt(totales.totalSurtidosLitros),
            lt(totales.totalTrasladosLitros),
            lt(totales.totalMermasLitros),
            '',
            lt(totales.totalLitrosCierre),
            '',
            ...(p.veValor ? ['', usd(totales.totalValorCierre)] : []),
          ],
        })
      }
      if (incluirMovs) {
        for (const c of seleccion) {
          const det = c.movimientos.filter(filtraDetalle)
          if (!det.length) continue
          secciones.push({
            titulo: `Movimientos · ${c.tanque.nombre}`,
            columnas: [
              { titulo: 'Fecha', ancho: 1.2 },
              { titulo: 'Tipo', ancho: 1.1 },
              { titulo: 'Equipo / Destino', ancho: 2.4 },
              { titulo: 'Litros', ancho: 1, alDerecha: true },
              { titulo: 'Saldo tanque', ancho: 1.1, alDerecha: true },
              { titulo: 'Autorizado / Recibió', ancho: 1.8 },
              { titulo: 'Observaciones', ancho: 2.6 },
            ],
            filas: det.map((m) => [
              m.fecha,
              TIPO_CORTO[m.tipo],
              equipoDe(m) || m.ubicacion || '',
              lt(m.litros),
              lt(m.saldo_litros),
              [m.autorizado_por, m.recibio].filter(Boolean).join(' / '),
              m.observacion ?? m.nota ?? '',
            ]),
          })
        }
      }
      setPdf(
        await armarPapelCombustible({
          titulo,
          empresa,
          datos: [
            ['Corte', totales.cierreFechaLabel],
            ['Tanques', `${seleccion.length} de ${tanques.length}`],
          ],
          resumen: [
            ['Apertura', `${lt(totales.totalLitrosApertura)} L`],
            ['Entradas', `${lt(totales.totalEntradasLitros)} L`],
            ['Surtidos', `${lt(totales.totalSurtidosLitros)} L (${totales.totalSurtidosCount})`],
            ['Traslados', `${lt(totales.totalTrasladosLitros)} L`],
            ['Mermas', `${lt(totales.totalMermasLitros)} L`],
            ['Cierre', `${lt(totales.totalLitrosCierre)} L`],
            ...(p.veValor ? ([['Valor', usd(totales.totalValorCierre)]] as [string, string][]) : []),
          ],
          secciones,
          apaisado: orientacion === 'landscape',
          emitidoPor: yo ?? '',
          momento: new Date(),
          nombreArchivo: `existencias-combustible-${desde || 'inicio'}-${hasta || hoy}.pdf`,
          nota: 'Lo anulado no suma en los flujos: la columna «Otros» lleva las anulaciones y ajustes para que la cuenta cierre con el saldo del libro.',
        }),
      )
    } catch (e) {
      setErrorPdf(e instanceof Error ? e.message : 'No se pudo generar el PDF')
    }
  }

  const bajarExcel = () => {
    const filas = seleccion.map((c) => [
      c.tanque.nombre,
      c.saldoInicialLitros,
      c.entradasLitros,
      c.surtidosLitros,
      c.trasladosLitros,
      c.mermasLitros,
      c.otrosLitros,
      c.saldoCierreLitros,
      c.porcentajeLleno,
      ...(p.veValor ? [c.tanque.sin_costo ? 'sin costo' : (c.tasaCierre ?? 0), c.tanque.sin_costo ? 0 : c.saldoCierreUsd] : []),
    ])
    const detalle = incluirMovs
      ? seleccion.flatMap((c) =>
          c.movimientos
            .filter(filtraDetalle)
            .map((m) => [c.tanque.nombre, m.fecha, TIPO_CORTO[m.tipo], equipoDe(m), n(m.litros), n(m.saldo_litros), m.autorizado_por ?? '', m.observacion ?? m.nota ?? '']),
        )
      : []
    bajarArchivo(
      escribirXlsx({
        nombre: 'Existencias',
        columnas: [
          { titulo: 'Tanque', ancho: 26 },
          { titulo: 'Apertura (L)', ancho: 14 },
          { titulo: 'Entradas (L)', ancho: 14 },
          { titulo: 'Surtidos (L)', ancho: 14 },
          { titulo: 'Traslados (L)', ancho: 14 },
          { titulo: 'Mermas (L)', ancho: 12 },
          { titulo: 'Otros (L)', ancho: 12 },
          { titulo: 'Cierre (L)', ancho: 14 },
          { titulo: '% Cap.', ancho: 10 },
          ...(p.veValor ? [{ titulo: 'Tasa ($/L)', ancho: 12 }, { titulo: 'Valor ($)', ancho: 14 }] : []),
        ],
        filas: [
          [titulo],
          [],
          ...filas,
          [],
          [
            'TOTALES',
            totales.totalLitrosApertura,
            totales.totalEntradasLitros,
            totales.totalSurtidosLitros,
            totales.totalTrasladosLitros,
            totales.totalMermasLitros,
            '',
            totales.totalLitrosCierre,
            '',
            ...(p.veValor ? ['', totales.totalValorCierre] : []),
          ],
          ...(detalle.length
            ? [[], ['DETALLE DE MOVIMIENTOS'], ['Tanque', 'Fecha', 'Tipo', 'Equipo / Destino', 'Litros', 'Saldo tanque', 'Autorizado', 'Observaciones'], ...detalle]
            : []),
        ],
      }),
      `existencias-combustible-${desde || 'inicio'}-${hasta || hoy}.xlsx`,
    )
  }

  const ninguno = seleccion.length === 0

  return (
    <>
      <Modal
        abierto
        onCerrar={onCerrar}
        titulo="📄 Reporte de existencias y movimientos de combustible"
        ancho="xl"
        acciones={
          <>
            <Button variant="ghost" onClick={onCerrar}>
              Cerrar
            </Button>
            <Button variant="ghost" onClick={bajarExcel} disabled={ninguno} title="Reporte en Excel (.xlsx)">
              📊 Excel
            </Button>
            <Button onClick={() => void verPdf()} disabled={ninguno} title="Reporte en PDF con membrete">
              ↓ PDF
            </Button>
          </>
        }
      >
        <div className="border-hairline bg-canvas mb-3 flex flex-col gap-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-ink/60 mr-1 text-xs font-semibold">📅 Rango de fechas:</span>
            {PRESETS.map((pr) => (
              <Pastilla key={pr} activa={periodo === pr} onClick={() => aplicar(pr)}>
                {etiquetaPreset(pr)}
              </Pastilla>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-ink/55 inline-flex items-center gap-1 text-xs">
              Desde
              <MiniInput
                type="date"
                value={desde}
                onChange={(v) => {
                  setDesde(v)
                  setPeriodo('personalizado')
                }}
              />
            </label>
            <label className="text-ink/55 inline-flex items-center gap-1 text-xs">
              Hasta
              <MiniInput
                type="date"
                value={hasta}
                onChange={(v) => {
                  setHasta(v)
                  setPeriodo('personalizado')
                }}
              />
            </label>
            {totales.esHistorico ? <Chip tone="warning">📅 Corte histórico: {hasta}</Chip> : null}
            <span className="text-ink/60 ml-auto text-xs font-semibold">Filtrar detalle:</span>
            <MiniSelect
              value={tipoFiltro}
              onChange={(v) => setTipoFiltro(v as TipoFiltro)}
              opciones={[
                { valor: 'uso_traslado', etiqueta: '⛽ Surtidos y ↔ Traslados' },
                { valor: 'uso', etiqueta: 'Solo surtidos (equipos)' },
                { valor: 'traslado', etiqueta: 'Solo traslados' },
                { valor: 'todos', etiqueta: 'Todos los movimientos' },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <label className="text-ink/70 inline-flex items-center gap-1.5">
              <input type="checkbox" className="accent-royal-600" checked={incluirFichas} onChange={(e) => setIncluirFichas(e.target.checked)} />
              Fichas de saldo puntual
            </label>
            <label className="text-ink/70 inline-flex items-center gap-1.5">
              <input type="checkbox" className="accent-royal-600" checked={incluirMovs} onChange={(e) => setIncluirMovs(e.target.checked)} />
              Detalle de movimientos
            </label>
            <span className="text-ink/55 ml-auto">Vista:</span>
            <Segmento
              valor={vista}
              onCambio={(v) => setVista(v as 'tarjetas' | 'tabla')}
              opciones={[
                { valor: 'tarjetas', etiqueta: '🏢 Fichas' },
                { valor: 'tabla', etiqueta: '📊 Tabla' },
              ]}
            />
            <span className="text-ink/55">PDF:</span>
            <Segmento
              valor={orientacion}
              onCambio={(v) => setOrientacion(v as 'landscape' | 'portrait')}
              opciones={[
                { valor: 'landscape', etiqueta: '📜 Horizontal' },
                { valor: 'portrait', etiqueta: '📄 Vertical' },
              ]}
            />
          </div>
        </div>

        <div className="border-hairline mb-4 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
          <span className="text-ink/80 text-sm font-semibold">
            🛢 Tanques a incluir ({seleccion.length} de {tanques.length}):
          </span>
          <Button size="sm" variant="ghost" onClick={() => setElegidos(new Set(tanques.map((t) => t.almacen_id)))}>
            ✓ Todos
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setElegidos(new Set(cortes.filter((c) => c.saldoCierreLitros > 0).map((c) => c.tanque.almacen_id)))}
          >
            Solo con combustible ({cortes.filter((c) => c.saldoCierreLitros > 0).length})
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setElegidos(new Set())}>
            ✕ Desmarcar todos
          </Button>
          <span className="text-ink/50 ml-auto text-xs">💡 Tocá una ficha o una fila para incluirla o sacarla del reporte</span>
        </div>

        {libro.isPending ? <Cargando /> : null}
        {libro.error ? <ErrorDeCarga error={libro.error} className="mb-3" /> : null}

        <h3 className="text-ink/90 mb-1 text-lg font-bold">{titulo}</h3>
        <p className="text-ink/55 mb-3 text-xs">{totales.cierreFechaLabel}</p>

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          <Cifra rotulo="Apertura" valor={`${lt(totales.totalLitrosApertura)} L`} />
          <Cifra rotulo="Entradas" valor={`${lt(totales.totalEntradasLitros)} L`} tono="success" />
          <Cifra rotulo="Surtidos" valor={`${lt(totales.totalSurtidosLitros)} L`} tono="danger" />
          <Cifra rotulo="Traslados" valor={`${lt(totales.totalTrasladosLitros)} L`} tono="warning" />
          <Cifra rotulo="Mermas" valor={`${lt(totales.totalMermasLitros)} L`} tono="danger" />
          <Cifra rotulo="Cierre" valor={`${lt(totales.totalLitrosCierre)} L`} tono="royal" />
          {p.veValor ? <Cifra rotulo="Valor ($)" valor={usd(totales.totalValorCierre)} tono="success" /> : null}
        </div>

        {vista === 'tarjetas' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
            {cortes.map((c) => {
              const si = elegidos.has(c.tanque.almacen_id)
              return (
                <button
                  key={c.tanque.almacen_id}
                  type="button"
                  onClick={() => alterna(c.tanque.almacen_id)}
                  title={si ? 'Clic para excluir del reporte' : 'Clic para incluir en el reporte'}
                  className={cn(
                    'bg-surface rounded-card text-left shadow-card border p-3 text-sm',
                    si ? 'border-royal-600' : 'border-hairline opacity-50',
                  )}
                >
                  <p className="text-ink/85 font-semibold">
                    {si ? '☑' : '☐'} {iconoTanque(c.tanque)} {c.tanque.nombre}
                  </p>
                  <p className="tabular text-ink/90 mt-1 text-xl font-extrabold">{lt(c.saldoCierreLitros)} L</p>
                  <p className="text-ink/55 text-xs">
                    Apertura {lt(c.saldoInicialLitros)} · ↓{lt(c.entradasLitros)} · ⛽{lt(c.surtidosLitros)} · ↔{lt(c.trasladosLitros)} · 🔻
                    {lt(c.mermasLitros)}
                  </p>
                  <p className="text-ink/55 text-xs">
                    {lt(c.porcentajeLleno)}% de la capacidad{tasa(c) ? ` · ${tasa(c)}` : ''}
                    {valor(c) && !c.tanque.sin_costo ? ` · ${valor(c)}` : ''}
                  </p>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="border-hairline overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink/50 border-hairline border-b text-left text-xs">
                  <th className="px-2 py-2 text-center font-medium">Inc.</th>
                  <th className="px-2 py-2 font-medium">Tanque</th>
                  <th className="px-2 py-2 font-medium">Tipo</th>
                  <th className="px-2 py-2 text-right font-medium">Apertura (L)</th>
                  <th className="text-success px-2 py-2 text-right font-medium">Entradas (+)</th>
                  <th className="text-danger px-2 py-2 text-right font-medium">Surtidos (-)</th>
                  <th className="text-warning px-2 py-2 text-right font-medium">Traslados (-)</th>
                  <th className="px-2 py-2 text-right font-medium">Mermas (-)</th>
                  <th className="bg-royal-600/8 px-2 py-2 text-right font-medium">Cierre (L)</th>
                  <th className="px-2 py-2 text-center font-medium">% Cap.</th>
                  {p.veValor ? <th className="px-2 py-2 text-right font-medium">Tasa ($/L)</th> : null}
                  {p.veValor ? <th className="text-success px-2 py-2 text-right font-medium">Valor ($)</th> : null}
                </tr>
              </thead>
              <tbody>
                {cortes.map((c) => {
                  const si = elegidos.has(c.tanque.almacen_id)
                  return (
                    <tr
                      key={c.tanque.almacen_id}
                      onClick={() => alterna(c.tanque.almacen_id)}
                      className={cn('border-hairline hover:bg-ink/3 cursor-pointer border-b last:border-0', !si && 'opacity-45')}
                    >
                      <td className="px-2 py-2 text-center">
                        <input type="checkbox" className="accent-royal-600" checked={si} readOnly />
                      </td>
                      <td className="text-ink/85 px-2 py-2 font-medium">
                        {iconoTanque(c.tanque)} {c.tanque.nombre}
                      </td>
                      <td className="text-ink/55 px-2 py-2 text-xs">
                        {c.tanque.es_bidon ? 'Bidón' : c.tanque.es_movil ? 'Móvil' : 'Fijo'}
                      </td>
                      <td className="tabular px-2 py-2 text-right">{lt(c.saldoInicialLitros)}</td>
                      <td className="tabular text-success px-2 py-2 text-right">{lt(c.entradasLitros)}</td>
                      <td className="tabular text-danger px-2 py-2 text-right">{lt(c.surtidosLitros)}</td>
                      <td className="tabular text-warning px-2 py-2 text-right">{lt(c.trasladosLitros)}</td>
                      <td className="tabular px-2 py-2 text-right">{lt(c.mermasLitros)}</td>
                      <td className="tabular bg-royal-600/5 px-2 py-2 text-right font-semibold">{lt(c.saldoCierreLitros)}</td>
                      <td className="tabular px-2 py-2 text-center">{lt(c.porcentajeLleno)}%</td>
                      {p.veValor ? <td className="tabular px-2 py-2 text-right">{tasa(c)}</td> : null}
                      {p.veValor ? <td className="tabular text-success px-2 py-2 text-right">{valor(c)}</td> : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {incluirMovs
          ? seleccion.map((c) => {
              const det = c.movimientos.filter(filtraDetalle)
              if (!det.length) return null
              return (
                <div key={c.tanque.almacen_id} className="mt-5">
                  <p className="text-ink/85 mb-2 text-sm font-semibold">
                    {iconoTanque(c.tanque)} {c.tanque.nombre} · {det.length} movimientos
                  </p>
                  <div className="border-hairline max-h-72 overflow-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-ink/50 border-hairline border-b text-left">
                          <th className="px-2 py-1.5 font-medium">Fecha</th>
                          <th className="px-2 py-1.5 font-medium">Tipo</th>
                          <th className="px-2 py-1.5 font-medium">Equipo / Destino</th>
                          <th className="px-2 py-1.5 text-right font-medium">Litros</th>
                          <th className="px-2 py-1.5 text-right font-medium">Saldo tanque</th>
                          <th className="px-2 py-1.5 font-medium">Autorizado / Recibió</th>
                          <th className="px-2 py-1.5 font-medium">Observaciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {det.map((m) => (
                          <tr key={m.id} className="border-hairline border-b last:border-0">
                            <td className="tabular px-2 py-1">{m.fecha}</td>
                            <td className="px-2 py-1">{TIPO_CORTO[m.tipo]}</td>
                            <td className="px-2 py-1">{equipoDe(m) || m.ubicacion || '—'}</td>
                            <td className="tabular px-2 py-1 text-right">{lt(m.litros)}</td>
                            <td className="tabular px-2 py-1 text-right">{lt(m.saldo_litros)}</td>
                            <td className="text-ink/60 px-2 py-1">{[m.autorizado_por, m.recibio].filter(Boolean).join(' / ') || '—'}</td>
                            <td className="text-ink/60 px-2 py-1">{m.observacion ?? m.nota ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })
          : null}
      </Modal>

      <Visor
        abierto={pdf !== null || errorPdf !== null}
        onCerrar={() => {
          setPdf(null)
          setErrorPdf(null)
        }}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? 'existencias-combustible.pdf'}
        titulo="Reporte de existencias"
        error={errorPdf}
      />
    </>
  )
}
