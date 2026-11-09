import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Visor } from '@/components/Visor'
import { Button } from '@/components/ui/Button'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useFotosDeCarga } from '@/lib/api/fotosDeCarga'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { armarPapelCombustible, paraArchivo, type ColumnaPdf } from '@/lib/ficha/combustiblePdf'
import { horaParaLeer } from '@/lib/combustible/horaMovimiento'
import { n, nulo, type MovimientoLibro, type TanqueGt, type TipoMovTanque } from '@/lib/combustible/tipos'
import { bajarArchivo, escribirXlsx, type CeldaXlsx } from '@/lib/xlsx'
import { useSesion } from '@/lib/sesion'
import { cn } from '@/lib/cn'
import {
  COLOR_TIPO,
  equipoDe,
  guardar,
  iconoTanque,
  leerGuardado,
  lt,
  norm,
  referenciaFotos,
  TIPO_CORTO,
  useEmpresaPapel,
  usd,
} from './comun'
import { MiniSelect, MiniInput } from './piezas'

/*
  REGISTRO DE MOVIMIENTOS (Golden Touch, RegistroMovimientos de TanquesView).

  La tabla del libro de un tanque, que se usa para el mes en curso en el
  detalle del tanque y para cada mes del Histórico. Las columnas se eligen y se
  reordenan (arrastrando la cabecera o con ▲▼), y la elección queda recordada
  en este navegador. Búsqueda, filtros por tipo, equipo, autorizado, destino y
  fechas, y orden por fecha o por contador.

  Diferencias con Golden Touch, a propósito:
  · «🗑 Eliminar» es «Anular»: el libro no se borra (decisión de la dueña). Lo
    anulado y su reverso se ven tachados y no suman.
  · Sin «Saldo Drive» ni «Diferencia» contra Drive: aquí solo hay cuaderno.
  · Sin «✉ Correo»: La Cantera no manda correos desde la pantalla.
  · Los $ solo salen con INVENTARIO.VER_VALORACION.
*/

type ColId =
  | 'fecha'
  | 'equipo'
  | 'autorizado'
  | 'destino'
  | 'observacion'
  | 'hi'
  | 'hf'
  | 'hrs'
  | 'contFin'
  | 'ltUsados'
  | 'entrada'
  | 'uso'
  | 'traslado'
  | 'retorno'
  | 'merma'
  | 'cuaderno'
  | 'saldoLtrs'
  | 'montoMov'
  | 'saldoUsd'
  | 'acciones'

const COLUMNAS: { id: ColId; label: string; title: string; derecha?: boolean; valor?: boolean }[] = [
  { id: 'fecha', label: 'Fecha', title: 'Fecha y hora del movimiento' },
  { id: 'equipo', label: 'Equipo', title: 'Equipo o máquina receptora' },
  { id: 'autorizado', label: 'Autorizado', title: 'Persona que autorizó el movimiento' },
  { id: 'destino', label: 'Destino', title: 'Ubicación o frente de destino' },
  { id: 'observacion', label: 'Observación', title: 'Detalles u observaciones' },
  { id: 'hi', label: 'HI', title: 'Horómetro inicial', derecha: true },
  { id: 'hf', label: 'HF', title: 'Horómetro final', derecha: true },
  { id: 'hrs', label: 'Hrs', title: 'Horas trabajadas calculadas', derecha: true },
  { id: 'contFin', label: 'Cont. fin', title: 'Lectura final del totalizador del surtidor', derecha: true },
  { id: 'ltUsados', label: 'Lt usados (cont.)', title: 'Litros medidos por el contador', derecha: true },
  { id: 'entrada', label: 'Entrada', title: 'Litros ingresados al tanque', derecha: true },
  { id: 'uso', label: 'Uso', title: 'Litros consumidos/despachados', derecha: true },
  { id: 'traslado', label: 'Traslado', title: 'Litros trasladados hacia otro tanque', derecha: true },
  { id: 'retorno', label: 'Retorno', title: 'Litros devueltos al tanque', derecha: true },
  { id: 'merma', label: 'Merma', title: 'Litros de merma o evaporación', derecha: true },
  { id: 'cuaderno', label: 'Cuaderno', title: 'Registro físico en cuaderno de campo' },
  { id: 'saldoLtrs', label: 'Saldo ltrs', title: 'Saldo resultante en litros en el tanque', derecha: true },
  { id: 'montoMov', label: '$ Mov.', title: 'Costo valorizado en USD del movimiento', derecha: true, valor: true },
  { id: 'saldoUsd', label: 'Saldo $', title: 'Saldo valorizado en USD en el tanque', derecha: true, valor: true },
  { id: 'acciones', label: 'Acciones', title: 'Ver detalle / anular' },
]

const MINIMO: ColId[] = ['fecha', 'equipo', 'uso', 'saldoLtrs', 'acciones']
const CLAVE = 'combustible.registro.columnas.v1'

interface Preferencias {
  visibles: Record<string, boolean>
  orden: ColId[]
}

function leerPreferencias(): Preferencias {
  const p = leerGuardado<Partial<Preferencias>>(CLAVE, {})
  const todas = COLUMNAS.map((c) => c.id)
  const orden = (p.orden ?? []).filter((c): c is ColId => todas.includes(c as ColId))
  for (const c of todas) if (!orden.includes(c)) orden.push(c)
  const visibles: Record<string, boolean> = {}
  for (const c of todas) visibles[c] = p.visibles?.[c] ?? true
  return { visibles, orden }
}

/** La columna de litros de cada tipo; un reverso va a la de entrada o a la de uso según su signo. */
function columnaDeLitros(m: MovimientoLibro): ColId | null {
  if (m.tipo === 'reverso' || m.tipo === 'ajuste') return n(m.litros) === 0 ? null : m.signo > 0 ? 'entrada' : 'uso'
  return m.tipo
}

/** El texto de una celda: el mismo para la pantalla, el PDF y el Excel. */
function texto(m: MovimientoLibro, c: ColId): string {
  const num = (v: unknown) => (nulo(v as string) == null ? '' : lt(v as string))
  switch (c) {
    case 'fecha':
      return `${m.fecha}${m.hora ? ` ${horaParaLeer(m.hora)}` : ''}`
    case 'equipo':
      return equipoDe(m)
    case 'autorizado':
      return m.autorizado_por ?? ''
    case 'destino':
      return m.ubicacion ?? ''
    case 'observacion':
      return [m.observacion ?? m.nota, m.anulado ? `ANULADO: ${m.anulado_motivo ?? ''}` : null].filter(Boolean).join(' · ')
    case 'hi':
      return num(m.horometro_ini)
    case 'hf':
      return num(m.horometro_fin)
    case 'hrs':
      return n(m.horas_utilizadas) ? lt(m.horas_utilizadas) : ''
    case 'contFin':
      return num(m.contador_global_fin)
    case 'ltUsados':
      return n(m.contador_global_dif) ? lt(m.contador_global_dif) : ''
    case 'entrada':
    case 'uso':
    case 'traslado':
    case 'retorno':
    case 'merma':
      return columnaDeLitros(m) === c ? lt(m.litros) : ''
    case 'cuaderno':
      return m.registrado_en_cuaderno ? `✓ ${m.cuaderno_litros != null ? `${lt(m.cuaderno_litros)} L` : 'Sí'}` : ''
    case 'saldoLtrs':
      return lt(m.saldo_litros)
    case 'montoMov':
      return m.monto_usd == null ? '' : usd(m.monto_usd)
    case 'saldoUsd':
      return m.saldo_usd == null ? '' : usd(m.saldo_usd)
    default:
      return ''
  }
}

export function RegistroMovimientos({
  tanque,
  movs,
  titulo,
  vacio,
  cargando,
  error,
  veValor,
  onVer,
  onAnular,
}: {
  tanque: TanqueGt
  /** Ya acotados (un mes), en el orden del libro. */
  movs: MovimientoLibro[]
  titulo: ReactNode
  vacio?: string
  cargando?: boolean
  error?: unknown
  veValor: boolean
  onVer: (m: MovimientoLibro) => void
  /** Sin esto no se ofrece anular (el Histórico es para mirar). */
  onAnular?: (m: MovimientoLibro) => void
}) {
  const empresa = useEmpresaPapel()
  const { nombre: yo } = useSesion()
  const fotos = useFotosDeCarga('COMBUSTIBLE')

  const [fTexto, setFTexto] = useState('')
  const [fTipo, setFTipo] = useState<'' | TipoMovTanque>('')
  const [fEquipo, setFEquipo] = useState('')
  const [fAutorizado, setFAutorizado] = useState('')
  const [fUbicacion, setFUbicacion] = useState('')
  const [fDesde, setFDesde] = useState('')
  const [fHasta, setFHasta] = useState('')
  const [ordenCampo, setOrdenCampo] = useState<'fecha' | 'contFin'>('fecha')
  const [ordenDesc, setOrdenDesc] = useState(true)
  const [pref, setPref] = useState<Preferencias>(leerPreferencias)
  const [menuCols, setMenuCols] = useState(false)
  const [arrastre, setArrastre] = useState<ColId | null>(null)
  const [sobre, setSobre] = useState<ColId | null>(null)
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [errorPdf, setErrorPdf] = useState<string | null>(null)
  const [generando, setGenerando] = useState(false)

  useEffect(() => guardar(CLAVE, pref), [pref])

  // Al cambiar de tanque, se limpian los filtros.
  useEffect(() => {
    setFTexto('')
    setFTipo('')
    setFEquipo('')
    setFAutorizado('')
    setFUbicacion('')
    setFDesde('')
    setFHasta('')
  }, [tanque.almacen_id])

  const conteoFotos = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of fotos.data ?? []) if (!f.quitada_en) m.set(f.referencia, (m.get(f.referencia) ?? 0) + 1)
    return m
  }, [fotos.data])

  const opcs = useMemo(() => {
    const uniq = (g: (m: MovimientoLibro) => string | null | undefined) =>
      Array.from(new Set(movs.map((m) => (g(m) ?? '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'))
    return { equipos: uniq(equipoDe), autorizados: uniq((m) => m.autorizado_por), ubicaciones: uniq((m) => m.ubicacion) }
  }, [movs])

  const filtrados = useMemo(() => {
    const q = norm(fTexto)
    const arr = movs.filter((m) => {
      if (fTipo && m.tipo !== fTipo) return false
      if (fEquipo && equipoDe(m) !== fEquipo) return false
      if (fAutorizado && (m.autorizado_por ?? '') !== fAutorizado) return false
      if (fUbicacion && (m.ubicacion ?? '') !== fUbicacion) return false
      if (fDesde && m.fecha < fDesde) return false
      if (fHasta && m.fecha > fHasta) return false
      if (q) {
        const hay = norm(
          [m.fecha, m.hora, equipoDe(m), m.autorizado_por, m.ubicacion, m.observacion, m.nota, m.tipo, m.numero, m.vale_numero, m.recibio]
            .map((x) => x ?? '')
            .join(' '),
        )
        if (!hay.includes(q)) return false
      }
      return true
    })
    if (ordenCampo === 'fecha') return ordenDesc ? arr.slice().reverse() : arr
    return arr.slice().sort((a, b) => {
      const av = nulo(a.contador_global_fin)
      const bv = nulo(b.contador_global_fin)
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return ordenDesc ? bv - av : av - bv
    })
  }, [movs, fTexto, fTipo, fEquipo, fAutorizado, fUbicacion, fDesde, fHasta, ordenCampo, ordenDesc])

  const hayFiltro = !!(fTexto || fTipo || fEquipo || fAutorizado || fUbicacion || fDesde || fHasta)
  const limpiar = () => {
    setFTexto('')
    setFTipo('')
    setFEquipo('')
    setFAutorizado('')
    setFUbicacion('')
    setFDesde('')
    setFHasta('')
  }

  const disponibles = COLUMNAS.filter((c) => veValor || !c.valor)
  const ordenVisible = pref.orden.filter((c) => disponibles.some((d) => d.id === c))
  const columnas = ordenVisible.filter((c) => pref.visibles[c])
  const numVisibles = columnas.length

  const mover = (origen: ColId | null, destino: ColId) => {
    if (!origen || origen === destino) return
    setPref((p) => {
      const orden = [...p.orden]
      const i = orden.indexOf(origen)
      const j = orden.indexOf(destino)
      if (i < 0 || j < 0) return p
      orden.splice(i, 1)
      orden.splice(j, 0, origen)
      return { ...p, orden }
    })
  }
  const moverPaso = (c: ColId, dir: -1 | 1) => {
    setPref((p) => {
      const orden = [...p.orden]
      const i = orden.indexOf(c)
      const j = i + dir
      if (i < 0 || j < 0 || j >= orden.length) return p
      ;[orden[i], orden[j]] = [orden[j], orden[i]]
      return { ...p, orden }
    })
  }

  const ordenarPor = (c: 'fecha' | 'contFin') => {
    if (c === ordenCampo) setOrdenDesc((d) => !d)
    else {
      setOrdenCampo(c)
      setOrdenDesc(true)
    }
  }

  // ─── PDF y Excel, con el filtro aplicado y las columnas a la vista ─────────
  const exportables = columnas.filter((c) => c !== 'acciones')
  const tachadas = filtrados.map((m, i) => (m.anulado || m.tipo === 'reverso' ? i : -1)).filter((i) => i >= 0)

  const verPdf = async () => {
    setGenerando(true)
    setErrorPdf(null)
    try {
      const cols: ColumnaPdf[] = exportables.map((c) => {
        const d = COLUMNAS.find((x) => x.id === c)!
        const ancho = c === 'observacion' ? 3 : c === 'equipo' || c === 'fecha' ? 2.2 : c === 'autorizado' || c === 'destino' ? 1.8 : 1.2
        return { titulo: d.label, ancho, alDerecha: d.derecha }
      })
      setPdf(
        await armarPapelCombustible({
          titulo: `Registro de movimientos · ${tanque.nombre}`,
          empresa,
          datos: [
            ['Tanque', tanque.nombre],
            ['Movimientos', String(filtrados.length)],
          ],
          resumen: [
            ['Saldo actual', `${lt(tanque.saldo_litros)} L`],
            ...(veValor && !tanque.sin_costo ? ([['Valor', usd(tanque.saldo_usd)]] as [string, string][]) : []),
            ...(hayFiltro ? ([['Filtro', 'con el filtro aplicado']] as [string, string][]) : []),
          ],
          secciones: [{ columnas: cols, filas: filtrados.map((m) => exportables.map((c) => texto(m, c))), tachadas }],
          apaisado: true,
          emitidoPor: yo ?? '',
          momento: new Date(),
          nombreArchivo: `combustible-${paraArchivo(tanque.nombre)}-${new Date().toISOString().slice(0, 10)}.pdf`,
          nota: tachadas.length ? 'Los renglones tachados están anulados: se ven, pero no suman en el saldo.' : undefined,
        }),
      )
    } catch (e) {
      setErrorPdf(e instanceof Error ? e.message : 'No se pudo generar el PDF')
    } finally {
      setGenerando(false)
    }
  }

  const bajarExcel = () => {
    const numericas: ColId[] = ['hi', 'hf', 'hrs', 'contFin', 'ltUsados', 'entrada', 'uso', 'traslado', 'retorno', 'merma', 'saldoLtrs', 'montoMov', 'saldoUsd']
    const valor = (m: MovimientoLibro, c: ColId): CeldaXlsx => {
      if (!numericas.includes(c)) return texto(m, c)
      const t = texto(m, c)
      if (t === '') return null
      switch (c) {
        case 'hi':
          return n(m.horometro_ini)
        case 'hf':
          return n(m.horometro_fin)
        case 'hrs':
          return n(m.horas_utilizadas)
        case 'contFin':
          return n(m.contador_global_fin)
        case 'ltUsados':
          return n(m.contador_global_dif)
        case 'saldoLtrs':
          return n(m.saldo_litros)
        case 'montoMov':
          return n(m.monto_usd)
        case 'saldoUsd':
          return n(m.saldo_usd)
        default:
          return n(m.litros)
      }
    }
    bajarArchivo(
      escribirXlsx({
        nombre: tanque.nombre,
        columnas: [
          { titulo: 'N°', ancho: 14 },
          ...exportables.map((c) => ({ titulo: COLUMNAS.find((x) => x.id === c)!.label, ancho: c === 'observacion' ? 40 : 16 })),
          { titulo: 'Estado', ancho: 12 },
        ],
        filas: filtrados.map((m) => [
          m.vale_numero ?? m.numero,
          ...exportables.map((c) => valor(m, c)),
          m.anulado ? 'ANULADO' : m.tipo === 'reverso' ? 'REVERSO' : '',
        ]),
      }),
      `combustible-${paraArchivo(tanque.nombre)}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    )
  }

  // ─── Celdas ───────────────────────────────────────────────────────────────
  const celda = (m: MovimientoLibro, c: ColId) => {
    const d = COLUMNAS.find((x) => x.id === c)!
    const base = cn('px-2.5 py-2 align-top', d.derecha && 'tabular text-right whitespace-nowrap')
    switch (c) {
      case 'fecha':
        return (
          <td key={c} className={cn(base, 'whitespace-nowrap')}>
            <span className="tabular text-ink/85">{m.fecha}</span>
            {m.hora ? <div className="text-ink/45 text-2xs">{horaParaLeer(m.hora)}</div> : null}
            <div className="text-ink/40 text-2xs font-mono">{m.vale_numero ?? m.numero}</div>
          </td>
        )
      case 'equipo':
        return (
          <td key={c} className={base}>
            <span className="text-ink/85">{equipoDe(m) || '—'}</span>
            {m.recibio ? <div className="text-ink/45 text-2xs">recibió {m.recibio}</div> : null}
            {m.tipo === 'reverso' || m.tipo === 'ajuste' ? (
              <div className="text-ink/45 text-2xs">{TIPO_CORTO[m.tipo]}</div>
            ) : null}
          </td>
        )
      case 'autorizado':
      case 'destino':
        return (
          <td key={c} className={cn(base, 'text-ink/60')}>
            {texto(m, c) || '—'}
          </td>
        )
      case 'observacion':
        return (
          <td key={c} className={cn(base, 'text-ink/60 max-w-[220px]')}>
            {m.observacion ?? m.nota ?? '—'}
            {m.anulado ? <div className="text-danger text-2xs no-underline">Anulado: {m.anulado_motivo}</div> : null}
            {m.merma_fuera_de_margen ? <div className="text-danger text-2xs">⚠ fuera del margen</div> : null}
          </td>
        )
      case 'entrada':
      case 'uso':
      case 'traslado':
      case 'retorno':
      case 'merma':
        return (
          <td key={c} className={cn(base, COLOR_TIPO[m.tipo])}>
            {texto(m, c)}
          </td>
        )
      case 'cuaderno':
        return (
          <td key={c} className={cn(base, 'whitespace-nowrap')}>
            {m.registrado_en_cuaderno ? (
              <span className="bg-success/14 text-success rounded px-1.5 py-0.5 text-xs font-semibold">
                ✓ {m.cuaderno_litros != null ? `${lt(m.cuaderno_litros)} L` : 'Sí'}
              </span>
            ) : (
              <span className="text-ink/40 text-xs">✕ No</span>
            )}
          </td>
        )
      case 'saldoLtrs':
      case 'saldoUsd':
        return (
          <td key={c} className={cn(base, 'text-ink/90 font-semibold')}>
            {texto(m, c)}
          </td>
        )
      case 'acciones': {
        const nf = conteoFotos.get(referenciaFotos(m)) ?? 0
        return (
          <td key={c} className="px-2 py-1.5 whitespace-nowrap no-underline">
            <Button size="sm" variant="ghost" onClick={() => onVer(m)} title="Ver detalle">
              👁 Ver
            </Button>
            {nf > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => onVer(m)} title="Ver las fotos cargadas de este movimiento">
                📷 {nf}
              </Button>
            ) : null}
            {onAnular && !m.anulado && m.tipo !== 'reverso' && m.tipo !== 'ajuste' ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                onClick={() => onAnular(m)}
                title="Anular (vuelve el saldo con un reverso; el renglón queda tachado)"
              >
                Anular
              </Button>
            ) : null}
          </td>
        )
      }
      default:
        return (
          <td key={c} className={cn(base, 'text-ink/60')}>
            {texto(m, c) || '—'}
          </td>
        )
    }
  }

  return (
    <>
      {movs.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-ink/85 text-sm font-semibold">{titulo}</span>
            <Button
              size="sm"
              variant="ghost"
              disabled={!filtrados.length || generando}
              onClick={() => void verPdf()}
              title="Descargar PDF del registro (con el filtro aplicado)"
            >
              {generando ? 'Generando…' : '↓ PDF'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!filtrados.length}
              onClick={bajarExcel}
              title="Descargar Excel del registro (con el filtro aplicado)"
            >
              📊 Excel
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <MiniInput
              type="search"
              value={fTexto}
              onChange={setFTexto}
              placeholder="🔍 Buscar (equipo, autorizado, destino…)"
              className="w-60"
            />
            <MiniSelect
              value={fTipo}
              onChange={(v) => setFTipo(v as '' | TipoMovTanque)}
              opciones={[
                { valor: '', etiqueta: 'Todo movimiento' },
                { valor: 'entrada', etiqueta: '⬇ Entrada' },
                { valor: 'uso', etiqueta: '⛽ Uso' },
                { valor: 'traslado', etiqueta: '↔ Traslado' },
                { valor: 'retorno', etiqueta: '↩ Retorno' },
                { valor: 'merma', etiqueta: '🔻 Merma' },
              ]}
            />
            <MiniSelect
              value={fEquipo}
              onChange={setFEquipo}
              opciones={[{ valor: '', etiqueta: 'Todo equipo' }, ...opcs.equipos.map((v) => ({ valor: v, etiqueta: v }))]}
            />
            <MiniSelect
              value={fAutorizado}
              onChange={setFAutorizado}
              opciones={[{ valor: '', etiqueta: 'Todo autorizado' }, ...opcs.autorizados.map((v) => ({ valor: v, etiqueta: v }))]}
            />
            <MiniSelect
              value={fUbicacion}
              onChange={setFUbicacion}
              opciones={[{ valor: '', etiqueta: 'Todo destino' }, ...opcs.ubicaciones.map((v) => ({ valor: v, etiqueta: v }))]}
            />
            <label className="text-ink/55 inline-flex items-center gap-1 text-xs">
              Desde <MiniInput type="date" value={fDesde} onChange={setFDesde} />
            </label>
            <label className="text-ink/55 inline-flex items-center gap-1 text-xs">
              Hasta <MiniInput type="date" value={fHasta} onChange={setFHasta} />
            </label>
            <Button
              size="sm"
              variant={ordenCampo === 'fecha' ? 'soft' : 'ghost'}
              onClick={() => ordenarPor('fecha')}
              title="Ordenar por fecha y hora"
            >
              Fecha {ordenCampo === 'fecha' ? (ordenDesc ? '↓ (nuevo→viejo)' : '↑ (viejo→nuevo)') : ''}
            </Button>
            <Button
              size="sm"
              variant={ordenCampo === 'contFin' ? 'soft' : 'ghost'}
              onClick={() => ordenarPor('contFin')}
              title="Ordenar por el contador final del surtidor"
            >
              Cont. F {ordenCampo === 'contFin' ? (ordenDesc ? '↓' : '↑') : ''}
            </Button>
            <div className="relative">
              <Button
                size="sm"
                variant={numVisibles < disponibles.length ? 'soft' : 'ghost'}
                onClick={() => setMenuCols((v) => !v)}
                title="Elegir qué columnas ver u ocultar en la tabla"
              >
                👁 Columnas {numVisibles < disponibles.length ? `(${numVisibles}/${disponibles.length})` : ''} ▾
              </Button>
              {menuCols ? (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenuCols(false)} aria-hidden="true" />
                  <div className="border-hairline bg-surface shadow-popover absolute top-full right-0 z-40 mt-1 w-60 rounded-lg border p-3">
                    <div className="border-hairline mb-2 flex items-center justify-between border-b pb-2">
                      <span className="text-ink/85 text-xs font-semibold">Columnas y orden</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="text-ink/60 hover:bg-ink/6 rounded px-1.5 text-xs"
                          onClick={() => setPref((p) => ({ ...p, visibles: Object.fromEntries(COLUMNAS.map((c) => [c.id, true])) }))}
                        >
                          Todas
                        </button>
                        <button
                          type="button"
                          className="text-ink/60 hover:bg-ink/6 rounded px-1.5 text-xs"
                          onClick={() =>
                            setPref((p) => ({ ...p, visibles: Object.fromEntries(COLUMNAS.map((c) => [c.id, MINIMO.includes(c.id)])) }))
                          }
                        >
                          Mínimo
                        </button>
                        <button
                          type="button"
                          className="text-info hover:bg-ink/6 rounded px-1.5 text-xs"
                          title="Restablecer orden predeterminado"
                          onClick={() => setPref((p) => ({ ...p, orden: COLUMNAS.map((c) => c.id) }))}
                        >
                          ↺ Orden
                        </button>
                      </div>
                    </div>
                    <div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
                      {ordenVisible.map((c, i) => (
                        <div key={c} className="flex items-center justify-between gap-1 rounded px-1 py-0.5">
                          <label
                            className={cn(
                              'flex flex-1 cursor-pointer items-center gap-2 text-xs',
                              pref.visibles[c] ? 'text-ink/85' : 'text-ink/40',
                            )}
                          >
                            <input
                              type="checkbox"
                              className="accent-royal-600"
                              checked={!!pref.visibles[c]}
                              onChange={(e) => {
                                const v = e.target.checked
                                setPref((p) => ({ ...p, visibles: { ...p.visibles, [c]: v } }))
                              }}
                            />
                            {COLUMNAS.find((x) => x.id === c)!.label}
                          </label>
                          <button
                            type="button"
                            disabled={i === 0}
                            onClick={() => moverPaso(c, -1)}
                            title="Mover a la izquierda / antes"
                            className="text-ink/50 disabled:text-ink/20 px-1 text-[10px]"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            disabled={i === ordenVisible.length - 1}
                            onClick={() => moverPaso(c, 1)}
                            title="Mover a la derecha / después"
                            className="text-ink/50 disabled:text-ink/20 px-1 text-[10px]"
                          >
                            ▼
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
            {hayFiltro ? (
              <Button size="sm" variant="ghost" onClick={limpiar}>
                ✕ Limpiar
              </Button>
            ) : null}
            <span className="text-ink/50 text-xs">
              {filtrados.length}/{movs.length}
            </span>
          </div>
        </div>
      ) : null}

      {error ? <ErrorDeCarga error={error} className="mb-3" /> : null}
      {cargando ? (
        <Cargando />
      ) : !movs.length ? (
        <Vacio icono={<span className="text-3xl">{iconoTanque(tanque)}</span>} titulo={vacio ?? 'Sin movimientos.'} />
      ) : (
        <div className="border-hairline bg-surface overflow-x-auto rounded-lg border">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-ink/50 border-hairline border-b text-left text-xs">
                {columnas.map((c) => {
                  const d = COLUMNAS.find((x) => x.id === c)!
                  const arrastrable = c !== 'acciones'
                  return (
                    <th
                      key={c}
                      title={arrastrable ? `${d.title} · (Arrastrá para reorganizar)` : undefined}
                      draggable={arrastrable}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', c)
                        setArrastre(c)
                      }}
                      onDragOver={(e) => {
                        e.preventDefault()
                        setSobre(c)
                      }}
                      onDragLeave={() => setSobre(null)}
                      onDrop={(e) => {
                        e.preventDefault()
                        mover(arrastre, c)
                        setArrastre(null)
                        setSobre(null)
                      }}
                      className={cn(
                        'px-2.5 py-2 font-medium whitespace-nowrap select-none',
                        d.derecha && 'text-right',
                        arrastrable && 'cursor-grab',
                        arrastre === c && 'opacity-40',
                        sobre === c && 'border-royal-600 bg-royal-600/8 border-l-[3px]',
                      )}
                    >
                      {c === 'acciones' ? '' : d.label}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {!filtrados.length ? (
                <tr>
                  <td colSpan={Math.max(1, numVisibles)} className="text-ink/45 px-3 py-4 text-center">
                    Ningún movimiento coincide con el filtro.
                  </td>
                </tr>
              ) : null}
              {filtrados.map((m) => (
                <tr
                  key={m.id}
                  className={cn(
                    'border-hairline hover:bg-ink/3 border-b last:border-0',
                    (m.anulado || m.tipo === 'reverso') && 'text-ink/45 line-through decoration-ink/40',
                  )}
                >
                  {columnas.map((c) => celda(m, c))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Visor
        abierto={pdf !== null || errorPdf !== null}
        onCerrar={() => {
          setPdf(null)
          setErrorPdf(null)
        }}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? 'registro-combustible.pdf'}
        titulo={`Registro · ${tanque.nombre}`}
        error={errorPdf}
      />
    </>
  )
}
