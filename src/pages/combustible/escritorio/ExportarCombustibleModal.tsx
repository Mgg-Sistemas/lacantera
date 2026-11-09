import { useMemo, useState } from 'react'
import { Visor } from '@/components/Visor'
import { Button } from '@/components/ui/Button'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { Modal } from '@/components/ui/Modal'
import { Segmento } from '@/components/ui/Segmento'
import { useLibroTanque } from '@/lib/api/combustible'
import type { Maquina } from '@/lib/api/maquinaria'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { armarPapelCombustible } from '@/lib/ficha/combustiblePdf'
import {
  CAMPOS_POR_DEFECTO_POR_MODO,
  CAMPOS_REPORTE_COMBUSTIBLE,
  enriquecerMovimientos,
  esColumnaAplicableModoCombustible,
  filtrarMovimientos,
  procesarFilasReporte,
  type BaseTasaUsd,
  type FilaReporteCombustible,
  type ModoAgrupacionCombustible,
} from '@/lib/combustible/reporteMoldeable'
import { hoyIsoVE, obtenerPresetRango, restarDiasIso } from '@/lib/combustible/reporteExistenciasCorte'
import type { TanqueGt } from '@/lib/combustible/tipos'
import { useSesion } from '@/lib/sesion'
import { bajarArchivo, escribirXlsx } from '@/lib/xlsx'
import { cn } from '@/lib/cn'
import { fichasDeMaquinas, lt, useEmpresaPapel, usePermisosCombustible, usd } from './comun'
import { Cifra, MiniInput, Pastilla } from './piezas'

/*
  📄 DESCARGAR REPORTE DE COMBUSTIBLE (Golden Touch, ExportarCombustibleModal y
  exportarCombustible.ts): el reporte moldeable.

  Los surtidos y traslados de un rango, agrupados como se pida (equipo, día,
  empresa, tipo, ubicación, tanque, mes o detallado), con filtros por casillas,
  las columnas que se elijan, la valuación en $ a la tasa histórica o a la de
  hoy, y en PDF, Excel o CSV.

  Diferencias con Golden Touch: «empresa» es el dueño de la máquina
  (`maquinaria.propietario`); lo anulado no entra; los $ solo con valoración;
  sin las «Fichas Ejecutivas» del PDF (sale la tabla, que es lo que se archiva).
*/

const MODOS: { id: ModoAgrupacionCombustible; icon: string; label: string }[] = [
  { id: 'equipo', icon: '🚜', label: 'Por Equipo' },
  { id: 'dia', icon: '📆', label: 'Por Día' },
  { id: 'empresa', icon: '🏢', label: 'Por Empresa' },
  { id: 'tipo', icon: '🏷', label: 'Por Tipo' },
  { id: 'ubicacion', icon: '📍', label: 'Por Ubicación' },
  { id: 'tanque', icon: '⛽', label: 'Por Tanque' },
  { id: 'mes', icon: '📅', label: 'Por Mes' },
  { id: 'detallado', icon: '📋', label: 'Detallado' },
]

const DE_DINERO = ['usd', 'tasa_promedio']
const NINGUNO = '__ninguno__'

const campo = (clave: string) =>
  CAMPOS_REPORTE_COMBUSTIBLE.find((c) => c.clave === clave) ?? {
    clave,
    etiqueta: clave === 'mes' ? 'Mes' : clave,
    anchoPdf: 14,
    anchoExcel: 14,
    alineacion: 'left' as const,
    formato: 'texto' as const,
  }

function celda(f: FilaReporteCombustible, clave: string): string {
  const v = (f as unknown as Record<string, unknown>)[clave]
  const c = campo(clave)
  if (v == null || v === '') return clave === 'rendimiento' ? '—' : ''
  if (c.formato === 'numero') return lt(v as number)
  if (c.formato === 'moneda') return usd(v as number)
  if (c.formato === 'porcentaje') return `${lt(v as number)}%`
  return String(v)
}

function ListaFiltro({
  titulo,
  opciones,
  sel,
  onCambio,
}: {
  titulo: string
  opciones: { valor: string; etiqueta: string }[]
  sel: string[]
  onCambio: (s: string[]) => void
}) {
  const marcado = (v: string) => sel.length === 0 || sel.includes(v)
  const alterna = (v: string) => {
    const base = sel.length === 0 ? opciones.map((o) => o.valor) : sel.filter((x) => x !== NINGUNO)
    const nuevo = base.includes(v) ? base.filter((x) => x !== v) : [...base, v]
    onCambio(nuevo.length === opciones.length ? [] : nuevo.length === 0 ? [NINGUNO] : nuevo)
  }
  return (
    <div className="border-hairline rounded-lg border p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-ink/75 text-xs font-semibold">{titulo}</span>
        <span className="flex gap-1">
          <button type="button" className="text-ink/55 hover:bg-ink/6 rounded px-1.5 text-xs" onClick={() => onCambio([])}>
            Todos
          </button>
          <button type="button" className="text-ink/55 hover:bg-ink/6 rounded px-1.5 text-xs" onClick={() => onCambio([NINGUNO])}>
            Ninguno
          </button>
        </span>
      </div>
      {!opciones.length ? <p className="text-ink/45 text-xs">Sin datos en el período.</p> : null}
      <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
        {opciones.map((o) => (
          <Pastilla key={o.valor} activa={marcado(o.valor)} onClick={() => alterna(o.valor)}>
            {o.etiqueta}
          </Pastilla>
        ))}
      </div>
    </div>
  )
}

export function ExportarCombustibleModal({
  tanques,
  maquinas,
  tanqueInicial,
  rangoInicial,
  onCerrar,
}: {
  tanques: TanqueGt[]
  maquinas: Maquina[]
  tanqueInicial: number | null
  rangoInicial?: { desde: string; hasta: string }
  onCerrar: () => void
}) {
  const p = usePermisosCombustible()
  const empresa = useEmpresaPapel()
  const { nombre: yo } = useSesion()
  const hoy = hoyIsoVE()
  const [desde, setDesde] = useState(rangoInicial?.desde ?? `${hoy.slice(0, 8)}01`)
  const [hasta, setHasta] = useState(rangoInicial?.hasta ?? hoy)
  const [agrupacion, setAgrupacion] = useState<ModoAgrupacionCombustible>('equipo')
  const [columnas, setColumnas] = useState<string[]>(CAMPOS_POR_DEFECTO_POR_MODO.equipo)
  const [incluirUsd, setIncluirUsd] = useState(p.veValor)
  const [baseTasa, setBaseTasa] = useState<BaseTasaUsd>('historica')
  const [ordenarPor, setOrdenarPor] = useState<'usd' | 'litros' | 'horas'>(p.veValor ? 'usd' : 'litros')
  const [orientacion, setOrientacion] = useState<'landscape' | 'portrait'>('landscape')
  const [empresasSel, setEmpresasSel] = useState<string[]>([])
  const [tiposSel, setTiposSel] = useState<string[]>([])
  // Abierto desde un tanque, arranca con ese tanque marcado (como Golden Touch).
  const [tanquesSel, setTanquesSel] = useState<string[]>(tanqueInicial != null ? [String(tanqueInicial)] : [])
  const [ubicacionesSel, setUbicacionesSel] = useState<string[]>([])
  const [equiposSel, setEquiposSel] = useState<string[]>([])
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [errorPdf, setErrorPdf] = useState<string | null>(null)

  const conUsd = p.veValor && incluirUsd
  const libro = useLibroTanque({ desde, hasta, porPagina: 20000 }, !!desde && !!hasta && desde <= hasta)
  const fichas = useMemo(() => fichasDeMaquinas(maquinas), [maquinas])
  const enriquecidos = useMemo(
    () => enriquecerMovimientos(libro.data?.filas ?? [], fichas, tanques, baseTasa),
    [libro.data, fichas, tanques, baseTasa],
  )

  const catalogos = useMemo(() => {
    const uniq = (xs: string[]) => Array.from(new Set(xs)).sort((a, b) => a.localeCompare(b, 'es')).map((v) => ({ valor: v, etiqueta: v }))
    return {
      empresas: uniq(enriquecidos.map((x) => x.empresa)),
      tipos: uniq(enriquecidos.map((x) => x.tipoMaquina)),
      ubicaciones: uniq(enriquecidos.map((x) => x.ubicacion)),
      equipos: uniq(enriquecidos.map((x) => x.equipoNombre)),
      tanques: Array.from(new Set(enriquecidos.map((x) => x.mov.tanque_id))).map((id) => ({
        valor: String(id),
        etiqueta: tanques.find((t) => t.almacen_id === id)?.nombre ?? String(id),
      })),
    }
  }, [enriquecidos, tanques])

  const filtrados = useMemo(
    () =>
      filtrarMovimientos(enriquecidos, {
        empresasSel,
        tiposSel,
        tanquesSel: tanquesSel.map((x) => (x === NINGUNO ? -1 : Number(x))),
        ubicacionesSel,
        equiposSel,
      }),
    [enriquecidos, empresasSel, tiposSel, tanquesSel, ubicacionesSel, equiposSel],
  )
  const { filas, resumen } = useMemo(() => procesarFilasReporte(filtrados, agrupacion, ordenarPor), [filtrados, agrupacion, ordenarPor])

  const visibles = columnas.filter((c) => esColumnaAplicableModoCombustible(c, agrupacion) && (conUsd || !DE_DINERO.includes(c)))
  const titulo = `Reporte de combustible · ${MODOS.find((m) => m.id === agrupacion)?.label ?? ''}`
  const periodo = `${desde} → ${hasta}`

  const cambiarModo = (m: ModoAgrupacionCombustible) => {
    setAgrupacion(m)
    setColumnas(CAMPOS_POR_DEFECTO_POR_MODO[m])
  }
  const alternaColumna = (c: string) => setColumnas((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]))
  const disponibles = [
    ...(agrupacion === 'mes' ? ['mes'] : []),
    ...CAMPOS_REPORTE_COMBUSTIBLE.map((c) => c.clave),
  ].filter((c) => esColumnaAplicableModoCombustible(c, agrupacion) && (conUsd || !DE_DINERO.includes(c)))

  const nombreArchivo = (ext: string) => `reporte-combustible-${agrupacion}-${desde}-${hasta}.${ext}`

  const verPdf = async () => {
    setErrorPdf(null)
    try {
      setPdf(
        await armarPapelCombustible({
          titulo,
          empresa,
          datos: [
            ['Período', periodo],
            ['Agrupado', MODOS.find((m) => m.id === agrupacion)?.label ?? ''],
          ],
          resumen: [
            ['Equipos', String(resumen.totalEquipos)],
            ['Consumo', `${lt(resumen.totalLitros)} L`],
            ...(conUsd ? ([['Valor', usd(resumen.totalUsd)]] as [string, string][]) : []),
            ['Horas', `${lt(resumen.totalHoras)} h`],
            ['Despachos', String(resumen.totalSurtidos)],
            ['Promedio L/h', lt(resumen.rendimientoPromedio)],
          ],
          secciones: [
            {
              columnas: visibles.map((c) => ({ titulo: campo(c).etiqueta, ancho: campo(c).anchoPdf, alDerecha: campo(c).alineacion === 'right' })),
              filas: filas.map((f) => visibles.map((c) => celda(f, c))),
              totales: visibles.map((c, i) =>
                i === 0 ? 'TOTALES' : c === 'litros' ? lt(resumen.totalLitros) : c === 'usd' ? usd(resumen.totalUsd) : c === 'horas' ? lt(resumen.totalHoras) : c === 'surtidos' ? String(resumen.totalSurtidos) : '',
              ),
            },
            ...(resumen.topConsumidores.length
              ? [
                  {
                    titulo: 'Los cinco que más consumen',
                    columnas: [
                      { titulo: 'Equipo', ancho: 4 },
                      { titulo: 'Litros', ancho: 1.5, alDerecha: true },
                      ...(conUsd ? [{ titulo: 'Valor ($)', ancho: 1.5, alDerecha: true }] : []),
                      { titulo: '% del total', ancho: 1.2, alDerecha: true },
                    ],
                    filas: resumen.topConsumidores.map((t) => [t.nombre, lt(t.litros), ...(conUsd ? [usd(t.usd)] : []), `${lt(t.porcentaje)}%`]),
                  },
                ]
              : []),
          ],
          apaisado: orientacion === 'landscape',
          emitidoPor: yo ?? '',
          momento: new Date(),
          nombreArchivo: nombreArchivo('pdf'),
          nota: 'Solo surtidos y traslados vivos: lo anulado no entra en el reporte.',
        }),
      )
    } catch (e) {
      setErrorPdf(e instanceof Error ? e.message : 'No se pudo generar el PDF')
    }
  }

  const valorCrudo = (f: FilaReporteCombustible, c: string) => {
    const v = (f as unknown as Record<string, unknown>)[c]
    return typeof v === 'number' ? v : v == null ? '' : String(v)
  }

  const bajarExcel = () =>
    bajarArchivo(
      escribirXlsx({
        nombre: 'Combustible',
        columnas: visibles.map((c) => ({ titulo: campo(c).etiqueta, ancho: campo(c).anchoExcel })),
        filas: [
          ...filas.map((f) => visibles.map((c) => valorCrudo(f, c))),
          [],
          visibles.map((c, i) =>
            i === 0 ? 'TOTALES' : c === 'litros' ? resumen.totalLitros : c === 'usd' ? resumen.totalUsd : c === 'horas' ? resumen.totalHoras : c === 'surtidos' ? resumen.totalSurtidos : '',
          ),
        ],
      }),
      nombreArchivo('xlsx'),
    )

  const bajarCsv = () => {
    const esc = (v: unknown) => {
      const t = String(v ?? '')
      return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
    }
    const lineas = [
      visibles.map((c) => esc(campo(c).etiqueta)).join(';'),
      ...filas.map((f) => visibles.map((c) => esc(String(valorCrudo(f, c)).replace('.', ','))).join(';')),
    ]
    bajarArchivo(new Blob([`﻿${lineas.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }), nombreArchivo('csv'))
  }

  const fijar = (d: string, h: string) => {
    setDesde(d)
    setHasta(h)
  }
  const anterior = obtenerPresetRango('mes_anterior', hoy)
  const presets: { label: string; aplicar: () => void }[] = [
    { label: 'Hoy', aplicar: () => fijar(hoy, hoy) },
    { label: 'Ayer', aplicar: () => fijar(restarDiasIso(hoy, 1), restarDiasIso(hoy, 1)) },
    { label: 'Este mes', aplicar: () => fijar(`${hoy.slice(0, 8)}01`, hoy) },
    { label: 'Mes anterior', aplicar: () => fijar(anterior.desde, anterior.hasta) },
    { label: 'Últimos 30d', aplicar: () => fijar(restarDiasIso(hoy, 30), hoy) },
    { label: 'Últimos 90d', aplicar: () => fijar(restarDiasIso(hoy, 90), hoy) },
    { label: 'Este año', aplicar: () => fijar(`${hoy.slice(0, 4)}-01-01`, hoy) },
  ]

  const vacio = filas.length === 0

  return (
    <>
      <Modal
        abierto
        onCerrar={onCerrar}
        titulo="📄 Descargar reporte de combustible"
        ancho="xl"
        acciones={
          <>
            <Button variant="ghost" className="sm:mr-auto" onClick={onCerrar}>
              ← Volver
            </Button>
            <Button variant="ghost" onClick={bajarCsv} disabled={vacio} title="Archivo plano CSV (compatible con Excel)">
              CSV
            </Button>
            <Button variant="ghost" onClick={bajarExcel} disabled={vacio} title="Libro Excel con el resumen">
              📊 Excel
            </Button>
            <Button onClick={() => void verPdf()} disabled={vacio} title="PDF con membrete">
              ↓ PDF
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="border-hairline bg-canvas rounded-lg border p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-ink/80 text-sm font-semibold">📅 Rango de fechas</span>
              <div className="flex flex-wrap gap-1">
                {presets.map((x) => (
                  <Pastilla key={x.label} activa={false} onClick={x.aplicar}>
                    {x.label}
                  </Pastilla>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="text-ink/55 inline-flex items-center gap-1">
                Desde <MiniInput type="date" value={desde} onChange={setDesde} />
              </label>
              <label className="text-ink/55 inline-flex items-center gap-1">
                Hasta <MiniInput type="date" value={hasta} onChange={setHasta} />
              </label>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="border-hairline bg-canvas rounded-lg border p-3">
              <p className="text-ink/80 mb-2 text-sm font-semibold">🎯 Dimensión principal (agrupar por)</p>
              <div className="flex flex-wrap gap-1">
                {MODOS.map((m) => (
                  <Pastilla key={m.id} activa={agrupacion === m.id} onClick={() => cambiarModo(m.id)}>
                    {m.icon} {m.label}
                  </Pastilla>
                ))}
              </div>
            </div>
            {p.veValor ? (
              <div className="border-hairline bg-canvas rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-ink/80 text-sm font-semibold">💵 Valuación en dólares ($ USD)</span>
                  <label className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', incluirUsd ? 'text-success' : 'text-ink/50')}>
                    <input type="checkbox" className="accent-royal-600" checked={incluirUsd} onChange={(e) => setIncluirUsd(e.target.checked)} />
                    {incluirUsd ? '✓ Activa' : '✕ Ocultar USD'}
                  </label>
                </div>
                {incluirUsd ? (
                  <div className="flex flex-col gap-1 text-sm">
                    <label className="inline-flex items-center gap-2">
                      <input type="radio" className="accent-royal-600" checked={baseTasa === 'historica'} onChange={() => setBaseTasa('historica')} />
                      <span>
                        <strong>Tasa histórica</strong> del movimiento (recomendado)
                      </span>
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input type="radio" className="accent-royal-600" checked={baseTasa === 'actual'} onChange={() => setBaseTasa('actual')} />
                      <span>
                        <strong>Tasa actual</strong> del tanque
                      </span>
                    </label>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <p className="text-ink/55 text-xs">
            Criterio del reporte: solo equipos con movimientos registrados en el período. Se muestran las máquinas que registraron
            surtidos o traslados entre el {desde} y el {hasta}.
          </p>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            <ListaFiltro titulo="🏢 Empresas / propietarios" opciones={catalogos.empresas} sel={empresasSel} onCambio={setEmpresasSel} />
            <ListaFiltro titulo="🏷 Tipos de máquina" opciones={catalogos.tipos} sel={tiposSel} onCambio={setTiposSel} />
            <ListaFiltro titulo="⛽ Tanques" opciones={catalogos.tanques} sel={tanquesSel} onCambio={setTanquesSel} />
            <ListaFiltro titulo="📍 Ubicaciones" opciones={catalogos.ubicaciones} sel={ubicacionesSel} onCambio={setUbicacionesSel} />
            <ListaFiltro titulo="🚜 Equipos" opciones={catalogos.equipos} sel={equiposSel} onCambio={setEquiposSel} />
          </div>

          <div className="border-hairline bg-canvas rounded-lg border p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-ink/80 text-sm font-semibold">🧩 Columnas del reporte</span>
              <span className="flex gap-1">
                <button
                  type="button"
                  className="text-ink/55 hover:bg-ink/6 rounded px-1.5 text-xs"
                  onClick={() => setColumnas(CAMPOS_POR_DEFECTO_POR_MODO[agrupacion])}
                >
                  Principales
                </button>
                <button type="button" className="text-ink/55 hover:bg-ink/6 rounded px-1.5 text-xs" onClick={() => setColumnas([])}>
                  Ninguna
                </button>
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {disponibles.map((c) => (
                <Pastilla key={c} activa={columnas.includes(c)} onClick={() => alternaColumna(c)} title={campo(c).descripcion}>
                  {campo(c).etiqueta}
                </Pastilla>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              <span className="text-ink/55">Ordenar por:</span>
              <Segmento
                valor={ordenarPor}
                onCambio={(v) => setOrdenarPor(v as 'usd' | 'litros' | 'horas')}
                opciones={[
                  ...(conUsd ? [{ valor: 'usd', etiqueta: '$ USD' }] : []),
                  { valor: 'litros', etiqueta: 'Litros' },
                  { valor: 'horas', etiqueta: 'Horas' },
                ]}
              />
              <span className="text-ink/55">PDF:</span>
              <Segmento
                valor={orientacion}
                onCambio={(v) => setOrientacion(v as 'landscape' | 'portrait')}
                opciones={[
                  { valor: 'landscape', etiqueta: 'Horizontal (apaisado)' },
                  { valor: 'portrait', etiqueta: 'Vertical (carta)' },
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Cifra rotulo="Equipos en reporte" valor={resumen.totalEquipos} />
            <Cifra rotulo="Consumo total" valor={`${lt(resumen.totalLitros)} L`} />
            {conUsd ? <Cifra rotulo="Valor ($ USD)" valor={usd(resumen.totalUsd)} tono="success" /> : null}
            <Cifra rotulo="Horas trabajadas" valor={`${lt(resumen.totalHoras)} h`} tono="info" />
            <Cifra rotulo="Despachos" valor={resumen.totalSurtidos} />
            <Cifra rotulo="Promedio L/h" valor={lt(resumen.rendimientoPromedio)} tono="royal" />
          </div>

          {libro.isPending ? <Cargando /> : null}
          {libro.error ? <ErrorDeCarga error={libro.error} /> : null}

          <p className="text-ink/80 text-sm font-semibold">👁 Vista previa</p>
          <div className="border-hairline max-h-80 overflow-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-ink/50 border-hairline border-b text-left">
                  {visibles.map((c) => (
                    <th key={c} className={cn('px-2 py-1.5 font-medium whitespace-nowrap', campo(c).alineacion === 'right' && 'text-right')}>
                      {campo(c).etiqueta}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vacio ? (
                  <tr>
                    <td colSpan={Math.max(1, visibles.length)} className="text-ink/45 px-2 py-4 text-center">
                      Sin surtidos ni traslados con estos filtros.
                    </td>
                  </tr>
                ) : null}
                {filas.map((f) => (
                  <tr key={f.id} className="border-hairline border-b last:border-0">
                    {visibles.map((c) => (
                      <td key={c} className={cn('px-2 py-1', campo(c).alineacion === 'right' && 'tabular text-right')}>
                        {celda(f, c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      <Visor
        abierto={pdf !== null || errorPdf !== null}
        onCerrar={() => {
          setPdf(null)
          setErrorPdf(null)
        }}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? 'reporte-combustible.pdf'}
        titulo="Reporte de combustible"
        error={errorPdf}
      />
    </>
  )
}
