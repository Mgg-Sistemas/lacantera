import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Cargando, Vacio } from '@/components/ui/Estado'
import { Visor } from '@/components/Visor'
import { cn } from '@/lib/cn'
import { useProveedores } from '@/lib/api/catalogo'
import { COLUMNAS } from '@/lib/api/compras'
import { useEmpresa, empresaDelPapel } from '@/lib/api/empresa'
import {
  useAbonos,
  useComprasAnteriores,
  usePedidos,
  usePermisosPedidos,
  useServiciosDirectos,
  type CompraAnterior,
  type EstadoOrden,
  type Orden,
  type ServicioDirecto,
} from '@/lib/api/pedidos'
import { ESTADOS, coincide, etiquetaEstado, fechaHoraVE, fmtCant, money, sinTildes, solicitaDe } from '@/lib/pedidos'
import { labelCondicionPago } from '@/lib/ofertas'
import { abrirArchivoPago, abrirArchivoRecepcion, labelMetodoPago } from '@/lib/pagos'
import { ESTADO_SD } from '@/lib/servicios'
import { fechaVE } from '@/lib/reportesCompras'
import { armarDetallePedidoPdf } from '@/lib/ficha/reportesComprasPdf'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { dinero } from '@/lib/formato'
import { mensajeDe } from '@/lib/avisosFlotantes'
import { EstadoBadge } from './OrdenDetailModal'
import { MaterialesDemandaModal } from './MaterialesDemandaModal'

/*
  HISTÓRICO DE PEDIDOS / COMPRAS (MGG `HistoricoPage`, `/app/pedidos/historico`)

  El buscador grande de MGG (cualquier dato del registro, sin acentos, todas
  las palabras), «Realizada por», los chips de estado, el filtro por fecha
  (creación, aprobación, OC emitida o finalización), el orden cronológico y la
  tabla OP · OC · Solicitante · Proveedor · Total · Estado · Fecha solicitud ·
  OC emitida. Cada fila abre el detalle de solo lectura con su PDF.

  Lo que cambia respecto a MGG:
    - Aquí está LO CERRADO: finalizadas, anuladas, canceladas y las que el
      proveedor desistió, más los servicios directos finalizados. Lo que está
      en curso se trabaja en «Pedidos / Compras». El «+ n más · ver en el
      Histórico →» de una columna llega con su estado (`?estado=`) y entonces
      se ve también ese estado, aunque esté en curso.
    - Pestaña «🗄 Compras anteriores»: lo que se cargó en el flujo de compras
      anterior (SOL- y sus órdenes), solo para leer; cada una abre su ficha de
      siempre. Las compras directas se pueden sumar con un chip.
    - El detalle no trae «🧭 Trazabilidad» ni el «Comprobante de Tesorería»
      (no hay Tesorería): trae el comprobante que se subió al pagar, la
      factura o nota de entrega, el QR, los comprobantes de los abonos, «🖨
      Imprimir PDF» y «📂 Abrir la orden», que lleva a la ficha completa (con
      el PDF de la OC, el historial y los avisos).
*/

const CERRADOS: EstadoOrden[] = ['finalizada', 'anulada', 'cancelada', 'desistida_proveedor']

type FechaCampo = 'creado_en' | 'aprobada_en' | 'oc_creada_en' | 'finalizada_en'

const FECHA_CAMPOS: { value: FechaCampo; label: string }[] = [
  { value: 'creado_en', label: 'Creación' },
  { value: 'aprobada_en', label: 'Aprobación' },
  { value: 'oc_creada_en', label: 'OC emitida' },
  { value: 'finalizada_en', label: 'Finalización' },
]

/** Una fila del histórico: una orden (SP/SV/OC) o un servicio directo. */
type Fila = { tipo: 'orden'; orden: Orden } | { tipo: 'sd'; sd: ServicioDirecto }

/** El chip del servicio directo va junto a los estados. */
type ChipEstado = EstadoOrden | 'servicio_directo'

const chipCls = (activo: boolean, peligro = false) =>
  cn(
    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
    peligro
      ? 'border-danger/40 text-danger hover:bg-danger/8'
      : activo
        ? 'border-royal-600/40 bg-royal-600/12 text-royal-700 dark:text-royal-300'
        : 'border-ink/15 text-ink/65 hover:bg-ink/5',
  )

const idDe = (f: Fila) => (f.tipo === 'orden' ? `o${f.orden.id}` : `s${f.sd.id}`)
const creadoEn = (f: Fila) => (f.tipo === 'orden' ? f.orden.creado_en : f.sd.creado_en)

/** MGG `creadorDeOrden`: quien creó la OC; si no hay OC, quien cargó la SP. */
const creadorDe = (f: Fila): { id: string; nombre: string } =>
  f.tipo === 'orden'
    ? {
        id: f.orden.oc_creada_por ?? f.orden.creado_por,
        nombre: (f.orden.oc_creada_por ? f.orden.oc_creada_por_nombre : f.orden.creado_por_nombre) ?? '—',
      }
    : { id: f.sd.creado_por, nombre: f.sd.creado_por_nombre ?? '—' }

function fechaDe(f: Fila, campo: FechaCampo): string | null {
  if (f.tipo === 'orden') return f.orden[campo] ?? null
  if (campo === 'creado_en') return f.sd.creado_en
  if (campo === 'finalizada_en') return f.sd.finalizada_en
  return null
}

export function HistoricoPage() {
  const permisosQ = usePermisosPedidos()
  const [params, setParams] = useSearchParams()
  const pestana = params.get('pestana') === 'anteriores' ? 'anteriores' : 'pedidos'

  const cambiarPestana = (p: 'pedidos' | 'anteriores') => {
    const next = new URLSearchParams(params)
    if (p === 'anteriores') next.set('pestana', 'anteriores')
    else next.delete('pestana')
    setParams(next, { replace: true })
  }

  if (permisosQ.isPending) return <Cargando texto="Cargando histórico…" />
  if (!permisosQ.data?.compras) {
    return (
      <Card className="mt-6 max-w-xl">
        <p className="text-ink/75 text-sm">
          El histórico de Pedidos / Compras lo ve quien lleva Compras. Tus solicitudes y la fase en que van están en{' '}
          <Link to="/app/pedidos" className="text-royal-700 dark:text-royal-300 font-medium underline">
            Solicitudes de Pedido
          </Link>
          .
        </p>
      </Card>
    )
  }

  return (
    <div>
      <PageHeader
        title="Histórico de Pedidos / Compras"
        description="Busca por código de pedido, OC, usuario, proveedor, SKU, estado, monto, fecha, método de pago o cualquier dato del registro; y filtra por quién la realizó."
        actions={<AccionesCabecera />}
      />

      <div role="tablist" aria-label="Qué histórico" className="mb-4 flex flex-wrap gap-1.5">
        {(
          [
            ['pedidos', '🧾 Pedidos / Compras', 'Lo finalizado, anulado, cancelado o desistido del flujo de Pedidos / Compras'],
            ['anteriores', '🗄 Compras anteriores', 'Lo que se cargó en el flujo de compras anterior (solo lectura)'],
          ] as const
        ).map(([k, label, title]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={pestana === k}
            title={title}
            onClick={() => cambiarPestana(k)}
            className={cn(
              'rounded-[8px] px-3 py-1.5 text-sm font-medium transition-colors',
              pestana === k ? 'bg-royal-600/12 text-royal-700 dark:text-royal-300' : 'text-ink/60 hover:bg-ink/5',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {pestana === 'anteriores' ? <ComprasAnteriores /> : <HistoricoPedidos />}
    </div>
  )
}

function AccionesCabecera() {
  const pedidos = usePedidos()
  const [demanda, setDemanda] = useState(false)
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => setDemanda(true)} disabled={!pedidos.data}>
        📊 Materiales con más demanda
      </Button>
      <Link to="/app/pedidos">
        <Button variant="ghost">← Volver a Pedidos</Button>
      </Link>
      {demanda && pedidos.data ? <MaterialesDemandaModal ordenes={pedidos.data} onClose={() => setDemanda(false)} /> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 🧾 Pedidos / Compras (lo cerrado del flujo nuevo)
// ---------------------------------------------------------------------------

function HistoricoPedidos() {
  const pedidos = usePedidos()
  const directos = useServiciosDirectos()
  const proveedoresQ = useProveedores(false)
  const navigate = useNavigate()
  const [params] = useSearchParams()

  // El «+ n más» de una columna en curso llega con su estado: se suma a los chips.
  const crudo = params.get('estado')
  const estadoUrl = crudo && crudo in ESTADOS ? (crudo as EstadoOrden) : null
  const extra = estadoUrl && !CERRADOS.includes(estadoUrl) ? estadoUrl : null
  const chips: { value: ChipEstado; label: string }[] = [
    ...(extra ? [{ value: extra as ChipEstado, label: `${ESTADOS[extra].label} (en curso)` }] : []),
    ...CERRADOS.map((e) => ({ value: e as ChipEstado, label: ESTADOS[e].label })),
  ]

  const [texto, setTexto] = useState('')
  const [creador, setCreador] = useState('')
  const [estadosSel, setEstadosSel] = useState<Set<ChipEstado>>(() => new Set(estadoUrl ? [estadoUrl] : []))
  const [fechaAbierta, setFechaAbierta] = useState(false)
  const [fechaCampo, setFechaCampo] = useState<FechaCampo>('creado_en')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [recientes, setRecientes] = useState(true)
  const [detalle, setDetalle] = useState<Orden | null>(null)

  const proveedor = useMemo(() => {
    const m = new Map<number, string>()
    for (const p of proveedoresQ.data ?? []) m.set(p.id, p.nombre)
    return (id: number | null | undefined) => (id ? (m.get(id) ?? null) : null)
  }, [proveedoresQ.data])

  const filas = useMemo<Fila[]>(() => {
    const visibles = new Set<EstadoOrden>([...CERRADOS, ...(extra ? [extra] : [])])
    return [
      ...(pedidos.data ?? []).filter((o) => visibles.has(o.estado)).map((o) => ({ tipo: 'orden' as const, orden: o })),
      ...(directos.data ?? []).filter((s) => s.estado === 'finalizada').map((s) => ({ tipo: 'sd' as const, sd: s })),
    ]
  }, [pedidos.data, directos.data, extra])

  const creadores = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of filas) {
      const c = creadorDe(f)
      if (c.id) m.set(c.id, c.nombre)
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  }, [filas])

  const filtradas = useMemo(() => {
    const palabras = sinTildes(texto).split(/\s+/).filter(Boolean)
    const rows = filas.filter((f) => {
      if (estadosSel.size) {
        const clave: ChipEstado = f.tipo === 'orden' ? f.orden.estado : 'servicio_directo'
        if (!estadosSel.has(clave)) return false
      }
      if (creador && creadorDe(f).id !== creador) return false
      if (desde || hasta) {
        const dia = fechaVE(fechaDe(f, fechaCampo))
        if (!dia) return false
        if (desde && dia < desde) return false
        if (hasta && dia > hasta) return false
      }
      if (!palabras.length) return true
      if (f.tipo === 'orden') {
        const o = f.orden
        const extraTxt = sinTildes(
          [
            ...(o.metodo_pago ?? []).map((m) => labelMetodoPago(m.metodo)),
            o.condiciones_pago ? labelCondicionPago(o.condiciones_pago) : '',
            o.finalidad,
            o.motivo,
            o.motivo_cancelacion,
            o.motivo_anulacion,
            o.urgente ? 'urgente' : '',
            o.finalizada_en ? fechaHoraVE(o.finalizada_en) : '',
          ]
            .filter(Boolean)
            .join(' '),
        )
        return palabras.every((p) => extraTxt.includes(p) || coincide(o, p, proveedor(o.proveedor_id)))
      }
      const s = f.sd
      const todo = sinTildes(
        [
          s.codigo,
          s.descripcion,
          s.proveedor_nombre,
          s.equipo_nombre,
          s.unidad_solicitante,
          s.solicitante_nombre,
          s.creado_por_nombre,
          s.nota,
          s.pago_referencia,
          'servicio directo finalizada',
          money(s.gasto),
          String(s.gasto ?? ''),
          fechaHoraVE(s.creado_en),
          ...(s.metodo_pago ?? []).map((m) => labelMetodoPago(m.metodo)),
          ...(s.items ?? []).map((i) => i.descripcion),
        ]
          .filter(Boolean)
          .join(' '),
      )
      return palabras.every((p) => todo.includes(p))
    })
    return rows.sort((a, b) => {
      const d = new Date(creadoEn(a)).getTime() - new Date(creadoEn(b)).getTime()
      return recientes ? -d : d
    })
  }, [filas, estadosSel, creador, desde, hasta, fechaCampo, texto, recientes, proveedor])

  const hayFiltro = Boolean(texto.trim() || creador || estadosSel.size || desde || hasta)

  function alternar(v: ChipEstado) {
    setEstadosSel((prev) => {
      const n = new Set(prev)
      if (n.has(v)) n.delete(v)
      else n.add(v)
      return n
    })
  }

  function limpiar() {
    setTexto('')
    setCreador('')
    setEstadosSel(new Set())
    setDesde('')
    setHasta('')
    setFechaAbierta(false)
    setFechaCampo('creado_en')
  }

  const error = pedidos.error ?? directos.error
  const cargando = pedidos.isPending || directos.isPending

  return (
    <>
      {error ? (
        <Card className="border-danger mb-4 border">
          <strong>Error:</strong> {mensajeDe(error, 'Error al cargar histórico')}
        </Card>
      ) : null}

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-2">
          <Input
            label="Buscar"
            ocultarEtiqueta
            sinNormalizar
            type="search"
            placeholder="🔎 Busca por OP, OC, usuario, proveedor, SKU, estado, monto, fecha, método de pago, nota… (cualquier cosa)"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="min-w-[18rem] flex-1"
          />
          <select
            className="rounded-control border-ink/20 bg-surface text-ink/85 h-10 max-w-[260px] border px-3 text-sm"
            value={creador}
            onChange={(e) => setCreador(e.target.value)}
            aria-label="Realizada por"
            title="Ver solo las órdenes realizadas por un usuario"
          >
            <option value="">Realizada por: todos los usuarios</option>
            {creadores.map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {chips.map((c) => {
            const activo = estadosSel.has(c.value)
            return (
              <button key={c.value} type="button" className={chipCls(activo)} onClick={() => alternar(c.value)}>
                {activo ? '✓ ' : ''}
                {c.label}
              </button>
            )
          })}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <button type="button" className={chipCls(fechaAbierta || !!desde || !!hasta)} onClick={() => setFechaAbierta((v) => !v)}>
            ⌚ Filtrar por fecha
            {desde || hasta ? (
              <span className="ml-1.5 opacity-85">
                ({desde || '…'} → {hasta || '…'})
              </span>
            ) : null}
          </button>
          <button type="button" className={chipCls(false)} title="Cambiar orden cronológico" onClick={() => setRecientes((v) => !v)}>
            {recientes ? '↓ Más reciente primero' : '↑ Más antigua primero'}
          </button>
          {hayFiltro ? (
            <button type="button" className={chipCls(false, true)} onClick={limpiar}>
              ✕ Limpiar filtros
            </button>
          ) : null}
          <span className="text-ink/55 ml-auto text-[13px]">{filtradas.length} resultado(s)</span>
        </div>

        {fechaAbierta ? (
          <div className="bg-ink/4 mt-3.5 flex flex-wrap items-center gap-2 rounded-[8px] p-3.5">
            <span className="text-ink/55 text-[13px]">Tipo de fecha:</span>
            {FECHA_CAMPOS.map((f) => (
              <button key={f.value} type="button" className={chipCls(fechaCampo === f.value)} onClick={() => setFechaCampo(f.value)}>
                {f.label}
              </button>
            ))}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <span className="text-ink/55 text-[13px]">Desde</span>
              <input
                type="date"
                aria-label="Desde"
                className="rounded-control border-ink/20 bg-surface text-ink/85 h-9 border px-2.5 text-sm"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
              />
              <span className="text-ink/55 text-[13px]">Hasta</span>
              <input
                type="date"
                aria-label="Hasta"
                className="rounded-control border-ink/20 bg-surface text-ink/85 h-9 border px-2.5 text-sm"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
              />
            </div>
          </div>
        ) : null}
      </Card>

      {cargando ? (
        <Vacio icono={<span className="text-3xl">◔</span>} titulo="Cargando histórico…" />
      ) : !filtradas.length ? (
        <Card>
          <Vacio
            icono={<span className="text-3xl">◇</span>}
            titulo={hayFiltro ? 'Sin coincidencias para los filtros aplicados.' : 'Aún no hay órdenes registradas.'}
          />
        </Card>
      ) : (
        <Card flush className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-ink/55 border-hairline border-b text-left text-xs">
              <tr>
                <th className="px-4 py-2.5 font-medium">OP</th>
                <th className="px-4 py-2.5 font-medium">OC</th>
                <th className="px-4 py-2.5 font-medium">Solicitante</th>
                <th className="px-4 py-2.5 font-medium">Proveedor</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
                <th className="px-4 py-2.5 font-medium">Fecha solicitud</th>
                <th className="px-4 py-2.5 font-medium">OC emitida</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((f) =>
                f.tipo === 'orden' ? (
                  <tr
                    key={idDe(f)}
                    className="border-hairline hover:bg-ink/3 cursor-pointer border-b last:border-b-0"
                    title="Ver detalle e imprimir PDF"
                    onClick={() => setDetalle(f.orden)}
                  >
                    <td className="px-4 py-2.5 font-mono font-semibold">{f.orden.codigo}</td>
                    <td className="px-4 py-2.5 font-mono">
                      {f.orden.oc_codigo ? <Chip tone="royal">{f.orden.oc_codigo}</Chip> : <span className="text-ink/40 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-2.5">{solicitaDe(f.orden)}</td>
                    <td className="px-4 py-2.5">{proveedor(f.orden.proveedor_id) ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{money(f.orden.total)}</td>
                    <td className="px-4 py-2.5">
                      <EstadoBadge estado={f.orden.estado} />
                    </td>
                    <td className="text-ink/55 px-4 py-2.5 text-xs">{fechaHoraVE(f.orden.creado_en)}</td>
                    <td className="text-ink/55 px-4 py-2.5 text-xs">{f.orden.oc_creada_en ? fechaHoraVE(f.orden.oc_creada_en) : '—'}</td>
                  </tr>
                ) : (
                  <tr
                    key={idDe(f)}
                    className="border-hairline hover:bg-ink/3 cursor-pointer border-b last:border-b-0"
                    title="Abrir el servicio directo"
                    onClick={() => void navigate(`/app/pedidos?scope=servicio_directo&sd=${f.sd.id}`)}
                  >
                    <td className="px-4 py-2.5 font-mono font-semibold">{f.sd.codigo}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-ink/40 text-xs">—</span>
                    </td>
                    <td className="px-4 py-2.5">{f.sd.solicitante_nombre ?? f.sd.unidad_solicitante ?? '—'}</td>
                    <td className="px-4 py-2.5">{f.sd.proveedor_nombre ?? f.sd.equipo_nombre ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{money(f.sd.gasto)}</td>
                    <td className="px-4 py-2.5">
                      <Chip tone="success">🔧 {ESTADO_SD[f.sd.estado].replace(/^\S+\s/, '')}</Chip>
                    </td>
                    <td className="text-ink/55 px-4 py-2.5 text-xs">{fechaHoraVE(f.sd.creado_en)}</td>
                    <td className="text-ink/55 px-4 py-2.5 text-xs">—</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </Card>
      )}

      {detalle ? (
        <PedidoDetalleModal orden={detalle} proveedorNombre={proveedor(detalle.proveedor_id)} onClose={() => setDetalle(null)} />
      ) : null}
    </>
  )
}

/** Detalle de un pedido / compra, solo lectura, con su PDF (MGG `PedidoDetalleModal`). */
function PedidoDetalleModal({
  orden: o,
  proveedorNombre,
  onClose,
}: {
  orden: Orden
  proveedorNombre: string | null
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { data: empresa } = useEmpresa()
  const abonosQ = useAbonos(o.id, Number(o.abonado_total) > 0)
  const abonos = (abonosQ.data ?? []).filter((b) => !!b.comprobante_path)
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [errorPdf, setErrorPdf] = useState<string | null>(null)
  const items = (o.items ?? []).filter((it) => it.comprar !== false)
  const motivo = (o.motivo ?? o.finalidad ?? '').trim()
  const notas = (o.notas ?? '').trim()

  const fila = (k: string, v: ReactNode) => (
    <div className="flex gap-2 text-sm">
      <span className="text-ink/50 min-w-[8.5rem]">{k}</span>
      <span className="text-ink/85 font-medium">{v}</span>
    </div>
  )

  async function imprimir() {
    try {
      setErrorPdf(null)
      setPdf(await armarDetallePedidoPdf(o, proveedorNombre, empresaDelPapel(empresa)))
    } catch (e) {
      setErrorPdf(mensajeDe(e, 'No se pudo generar el PDF'))
    }
  }

  return (
    <>
      <Modal
        abierto
        onCerrar={onClose}
        titulo={`Pedido ${o.codigo}${o.oc_codigo ? ` · OC ${o.oc_codigo}` : ''}`}
        ancho="lg"
        acciones={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
            <Button
              variant="ghost"
              title="La ficha completa: PDF de la OC, historial, chat y avisos"
              onClick={() => void navigate(`/app/pedidos?detalle=${o.id}`)}
            >
              📂 Abrir la orden
            </Button>
            {o.pago_comprobante_path ? (
              <Button variant="ghost" onClick={() => void abrirArchivoPago(o.pago_comprobante_path!)}>
                🧾 Comprobante de pago
              </Button>
            ) : null}
            {o.factura_path ? (
              <Button variant="ghost" title={o.factura_nombre ?? 'Factura / nota de entrega'} onClick={() => void abrirArchivoRecepcion(o.factura_path!, o.factura_nombre)}>
                📎 {o.estado === 'finalizada' ? 'Ver factura / soporte' : 'Ver adjunto de pago'}
              </Button>
            ) : null}
            {o.pago_qr_path ? (
              <Button variant="ghost" title={o.pago_qr_nombre ?? 'QR de pago'} onClick={() => void abrirArchivoPago(o.pago_qr_path!, o.pago_qr_nombre)}>
                📎 QR de pago
              </Button>
            ) : null}
            {abonos.map((b, i) => (
              <Button
                key={b.id}
                variant="ghost"
                title={b.comprobante_nombre ?? 'Comprobante del abono'}
                onClick={() => void abrirArchivoPago(b.comprobante_path!, b.comprobante_nombre)}
              >
                📎 Abono {i + 1} · {money(b.monto)}
              </Button>
            ))}
            <Button onClick={() => void imprimir()}>🖨 Imprimir PDF</Button>
          </div>
        }
      >
        <div className="mb-3 flex items-center gap-2.5">
          <EstadoBadge estado={o.estado} />
          <span className="font-mono text-lg font-bold">{money(o.total)}</span>
        </div>

        <div className="border-hairline mb-3 grid gap-1 rounded-[8px] border px-3.5 py-3">
          {fila('Solicitante', solicitaDe(o))}
          {fila('Proveedor', proveedorNombre || '—')}
          {(o.clasificacion ?? []).length ? fila('Clasificación', o.clasificacion.join(', ')) : null}
          {o.condiciones_pago ? fila('Condición de pago', labelCondicionPago(o.condiciones_pago)) : null}
          {o.metodo_pago?.length ? fila('Método de pago', o.metodo_pago.map((m) => labelMetodoPago(m.metodo)).join(' + ')) : null}
          {fila('Almacén destino', o.clase === 'servicio' ? '—' : 'Almacén General')}
          {fila('Fecha solicitud', fechaHoraVE(o.creado_en))}
          {o.aprobada_en ? fila('Aprobada', fechaHoraVE(o.aprobada_en)) : null}
          {o.oc_creada_en ? fila('OC emitida', fechaHoraVE(o.oc_creada_en)) : null}
          {o.pagada_en ? fila('Pagada', `${fechaHoraVE(o.pagada_en)}${o.pago_monto_usd != null ? ` · ${money(o.pago_monto_usd)}` : ''}`) : null}
          {o.finalizada_en ? fila('Finalizada', fechaHoraVE(o.finalizada_en)) : null}
          {o.cancelada_en ? fila('Cancelada', `${fechaHoraVE(o.cancelada_en)}${o.motivo_cancelacion ? ` · ${o.motivo_cancelacion}` : ''}`) : null}
          {o.anulada_en ? fila('Anulada', `${fechaHoraVE(o.anulada_en)}${o.motivo_anulacion ? ` · ${o.motivo_anulacion}` : ''}`) : null}
        </div>

        <div className="border-hairline overflow-x-auto rounded-[8px] border">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead className="text-ink/55 border-hairline border-b text-left text-xs">
              <tr>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                <th className="px-3 py-2 text-right font-medium">Precio</th>
                <th className="px-3 py-2 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {!items.length ? (
                <tr>
                  <td colSpan={5} className="text-ink/50 px-3 py-3 text-center">
                    Sin items
                  </td>
                </tr>
              ) : null}
              {items.map((it, i) => (
                <tr key={`${it.sku}-${i}`} className="border-hairline border-b last:border-b-0">
                  <td className="px-3 py-2 font-mono text-xs">{it.sku ?? '—'}</td>
                  <td className="px-3 py-2">{it.nombre ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {fmtCant(it.cantidad)}
                    {it.unidad ? ` ${it.unidad}` : ''}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{money(it.precio)}</td>
                  <td className="px-3 py-2 text-right font-mono">{money((Number(it.cantidad) || 0) * (Number(it.precio) || 0))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-hairline border-t">
                <td colSpan={4} className="px-3 py-2 text-right font-bold">
                  TOTAL
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold">{money(o.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {motivo ? (
          <div className="mt-3">
            <div className="text-ink/50 text-xs">Motivo / finalidad</div>
            <div className="text-sm">{motivo}</div>
          </div>
        ) : null}
        {notas ? (
          <div className="mt-2.5">
            <div className="text-ink/50 text-xs">Notas</div>
            <div className="text-sm">{notas}</div>
          </div>
        ) : null}
      </Modal>

      <Visor
        abierto={pdf !== null || errorPdf !== null}
        error={errorPdf}
        onCerrar={() => {
          setPdf(null)
          setErrorPdf(null)
        }}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? `pedido-${o.codigo}.pdf`}
        titulo={`Pedido ${o.codigo}`}
        descripcion={etiquetaEstado(o.estado)}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// 🗄 Compras anteriores (el flujo de compras de antes, solo lectura)
// ---------------------------------------------------------------------------

/** La etapa en la que quedó, con el nombre que tenía en el tablero anterior. */
function etapa(c: CompraAnterior): string {
  const col = c.historico_columna ?? c.columna
  if (!col) return '—'
  return COLUMNAS.find((x) => x.clave === col)?.titulo ?? (col === 'FINALIZADA' ? 'Finalizada' : col)
}

function tonoDeEtapa(c: CompraAnterior): 'success' | 'warning' | 'neutral' | 'danger' | 'info' {
  const col = c.historico_columna ?? c.columna
  if (col === 'RECIBIDA' || col === 'FINALIZADA') return 'success'
  if (col === 'CANCELADA') return 'neutral'
  if (col === 'DESISTIO') return 'danger'
  return 'warning'
}

function ComprasAnteriores() {
  const q = useComprasAnteriores()
  const [texto, setTexto] = useState('')
  const [conDirectas, setConDirectas] = useState(false)

  const filtradas = useMemo(() => {
    const palabras = sinTildes(texto).split(/\s+/).filter(Boolean)
    return (q.data ?? []).filter((c) => {
      if (c.directa && !conDirectas) return false
      if (!palabras.length) return true
      const todo = sinTildes(
        [
          c.numero,
          c.orden_numero,
          c.titulo,
          c.proveedor,
          c.solicitante,
          c.registrada_por_nombre,
          c.destino,
          c.finalidad,
          etapa(c),
          c.directa ? 'compra directa' : 'pedido',
          fechaHoraVE(c.creada_en),
          c.total_usd != null ? dinero('USD', c.total_usd) : '',
        ]
          .filter(Boolean)
          .join(' '),
      )
      return palabras.every((p) => todo.includes(p))
    })
  }, [q.data, texto, conDirectas])

  const total = filtradas.reduce((s, c) => s + Number(c.total_usd ?? 0), 0)

  return (
    <>
      <Card className="mb-4">
        <p className="text-ink/60 mb-3 text-[13px]">
          Lo que se cargó en el flujo de compras anterior (números SOL- y sus órdenes). Es solo para consulta: nada de aquí se
          mueve, y lo nuevo se pide en «Solicitud de pedido».
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            label="Buscar"
            ocultarEtiqueta
            sinNormalizar
            type="search"
            placeholder="🔎 Número, orden, proveedor, quién pidió, qué se pidió…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="min-w-[18rem] flex-1"
          />
          <button type="button" className={chipCls(conDirectas)} onClick={() => setConDirectas((v) => !v)}>
            {conDirectas ? '✓ ' : ''}Incluir compras directas
          </button>
          <span className="text-ink/55 ml-auto text-[13px]">
            {filtradas.length} compra(s) · {dinero('USD', total)}
          </span>
        </div>
      </Card>

      {q.isPending ? <Cargando texto="Cargando las compras anteriores…" /> : null}
      {q.error ? (
        <Card className="border-danger mb-4 border">
          <strong>Error:</strong> {mensajeDe(q.error, 'No se pudieron cargar las compras anteriores')}
        </Card>
      ) : null}

      {q.data && !filtradas.length ? (
        <Card>
          <Vacio
            icono={<span className="text-3xl">◇</span>}
            titulo={texto.trim() ? 'Sin coincidencias para la búsqueda.' : 'No hay compras del flujo anterior.'}
          />
        </Card>
      ) : null}

      {filtradas.length ? (
        <Card flush className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="text-ink/55 border-hairline border-b text-left text-xs">
              <tr>
                <th className="px-4 py-2.5 font-medium">Compra</th>
                <th className="px-4 py-2.5 font-medium">Qué se pidió</th>
                <th className="px-4 py-2.5 font-medium">Proveedor</th>
                <th className="px-4 py-2.5 font-medium">Quedó en</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((c) => (
                <tr key={c.solicitud_id} className="border-hairline border-b last:border-b-0">
                  <td className="px-4 py-2.5">
                    <Link
                      to={`/app/compras/${c.solicitud_id}`}
                      className="text-ink/85 hover:text-tierra-600 dark:hover:text-tierra-300 font-mono text-xs font-medium hover:underline"
                      title="Ver la ficha (solo lectura)"
                    >
                      {c.orden_numero ?? c.numero}
                    </Link>
                    {c.orden_numero ? <div className="text-ink/45 font-mono text-[11px]">{c.numero}</div> : null}
                    <div className="text-ink/45 text-xs">{fechaHoraVE(c.creada_en)}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="text-ink/85 leading-snug">
                      {c.titulo}
                      {c.directa ? (
                        <Chip tone="info" className="ml-1.5">
                          Compra directa
                        </Chip>
                      ) : null}
                    </div>
                    <div className="text-ink/45 text-xs">
                      {c.solicitante ?? 'Sin solicitante'}
                      {c.destino ? ` · ${c.destino}` : ''}
                    </div>
                  </td>
                  <td className="text-ink/70 px-4 py-2.5">{c.proveedor ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <Chip tone={tonoDeEtapa(c)}>{etapa(c)}</Chip>
                    {c.historico_en ? <div className="text-ink/45 mt-0.5 text-[11px]">Cerrada en el histórico</div> : null}
                  </td>
                  <td className="text-ink/85 px-4 py-2.5 text-right font-medium whitespace-nowrap">
                    {c.total_usd ? dinero('USD', c.total_usd) : <span className="text-ink/30">Sin cotizar</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </>
  )
}
