import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { cn } from '@/lib/cn'
import { useAlmacenes, useExistencias } from '@/lib/api/inventario'
import { guardarMarcas, useConfirmarRevision, type ItemOrden, type Orden } from '@/lib/api/pedidos'
import {
  ETIQUETA_ALMACEN,
  cantidadSolicitada,
  estadoRevision,
  estadoStock,
  fechaHoraVE,
  fmtCant,
  marcasIniciales,
  pasoStepper,
  relTime,
  resumenRevision,
  seRevisa,
  sinTildes,
  solicitaDe,
  todoRevisado,
  type Marca,
  type ResumenRevision,
} from '@/lib/pedidos'
import { mensajeSolicitudPedido } from '@/lib/ficha/pedidosWhatsapp'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { comoNumero } from '@/lib/formato'
import { ModalWhatsappCompra } from '@/pages/compras/ModalWhatsappCompra'
import { ConfirmDialog } from './Dialogos'

/*
  LA REVISIÓN DE UNA SP EN EL ALMACÉN (MGG `RevisionSolicitudAlmacen.tsx`)

  Igual que en MGG: la cabecera con sus botones, el resumen en vivo («revisados
  n de N», «📦 Tiene», «❌ No tiene»), los tres botones de lote, cada renglón
  con su stepper «− / ＋ / ✗ No hay» y su barra de cobertura, el autoguardado a
  los 700 ms solo de lo tocado (y lo tocado no se pisa con lo que llega en vivo
  durante 4 s), la nota y la confirmación con su vista previa.

  Lo que cambia (decisiones de la dueña, 07/11/2026):
    - UNA SOLA SEDE, el almacén general: no hay «Respondo por» ni «Falta que
      responda …». Confirmar es cerrar la revisión.
    - CADA RENGLÓN QUE ENTREGA DICE QUÉ ARTÍCULO SALE. Lo que el almacén tiene
      sale por una solicitud de salida de ALM-GEN, con su autorización, y una
      salida se pide por artículo del inventario. Un renglón de nombre general
      no tiene ficha: aquí se elige (se propone el que se llama igual).
*/

const ESPERA_GUARDAR_MS = 700
const PROTEGER_LOCAL_MS = 4000
const ALMACEN_QUE_REVISA = 'ALM-GEN'

type Lote = 'stock' | 'todo' | 'nada'
const LOTE_TEXTO: Record<Lote, string> = {
  stock: '✔ Según existencias',
  todo: '✔ Todo disponible',
  nada: '🛒 Todo a Compras',
}

const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/** Lo que el almacén general tiene, por artículo. */
function useStockAlmacen() {
  const almacenes = useAlmacenes()
  const almacen = (almacenes.data ?? []).find((a) => a.codigo === ALMACEN_QUE_REVISA)
  const existencias = useExistencias(almacen?.id, !!almacen)
  const porArticulo = useMemo(() => {
    const m = new Map<number, { nombre: string; codigo: string; unidad: string; hay: number }>()
    for (const e of existencias.data ?? []) {
      m.set(e.articulo_id, {
        nombre: e.articulo,
        codigo: e.articulo_codigo,
        unidad: e.unidad,
        hay: num(e.disponibles ?? e.existencia),
      })
    }
    return m
  }, [existencias.data])
  return {
    porArticulo,
    cargando: almacenes.isPending || (!!almacen && existencias.isPending),
    sinAlmacen: almacenes.isSuccess && !almacen,
  }
}

export function ResumenListas({
  resumen,
  tituloTiene = '📦 Tiene almacén',
  tituloFalta = '🛒 Va a Compras',
  vacioTiene = 'Nada de lo solicitado',
  vacioFalta = 'Nada: almacén tiene todo',
}: {
  resumen: ResumenRevision
  tituloTiene?: string
  tituloFalta?: string
  vacioTiene?: string
  vacioFalta?: string
}) {
  const lista = (rs: ResumenRevision['tiene'], vacio: string) =>
    rs.length ? (
      <ul className="space-y-0.5">
        {rs.map((r) => (
          <li key={r.sku}>
            {r.nombre} — <strong className="font-semibold">{fmtCant(r.cantidad)}</strong> {r.unidad}
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-ink/50">{vacio}</p>
    )
  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      <div>
        <p className="text-ink/80 mb-1 font-semibold">{tituloTiene}</p>
        {lista(resumen.tiene, vacioTiene)}
      </div>
      <div>
        <p className="text-ink/80 mb-1 font-semibold">{tituloFalta}</p>
        {lista(resumen.falta, vacioFalta)}
      </div>
    </div>
  )
}

export function RevisionSolicitudAlmacen({
  orden,
  variante,
  canWrite,
  onConfirmada,
  onVerPdf,
  armandoPdf,
}: {
  orden: Orden
  variante: 'pc' | 'telefono'
  canWrite: boolean
  onConfirmada: (actualizada: Orden) => void
  onVerPdf: () => void
  armandoPdf: boolean
}) {
  const tel = variante === 'telefono'
  const stock = useStockAlmacen()
  const confirmar = useConfirmarRevision()
  const [mensajeWs, setMensajeWs] = useState<{ titulo: string; texto: string } | null>(null)

  const items = useMemo(() => (orden.items ?? []).filter(seRevisa), [orden.items])

  // El artículo que se propone: el de la ficha del renglón o, si es de nombre
  // general, uno del almacén que se llame igual.
  const propuesto = useMemo(() => {
    const porNombre = new Map<string, number>()
    for (const [id, e] of stock.porArticulo) porNombre.set(sinTildes(e.nombre).trim(), id)
    const m = new Map<string, number | null>()
    for (const it of items) m.set(it.sku, it.articulo_id ?? porNombre.get(sinTildes(it.nombre).trim()) ?? null)
    return m
  }, [items, stock.porArticulo])

  const [marcas, setMarcas] = useState<Record<string, Marca>>(() => marcasIniciales(orden.items ?? []))
  const tocados = useRef(new Map<string, number>())
  const pendientes = useRef(new Set<string>())
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [estadoGuardado, setEstadoGuardado] = useState<'guardando' | 'error' | 'ok' | null>(null)
  const [nota, setNota] = useState('')
  const [lotePendiente, setLotePendiente] = useState<Lote | null>(null)
  const [preguntaConfirmar, setPreguntaConfirmar] = useState(false)

  // Lo que llega en vivo pisa lo local, salvo lo tocado hace menos de 4 s.
  useEffect(() => {
    const servidor = marcasIniciales(orden.items ?? [])
    const ahora = Date.now()
    setMarcas((local) => {
      const out = { ...servidor }
      for (const [sku, t] of tocados.current) {
        if (ahora - t < PROTEGER_LOCAL_MS && local[sku]) out[sku] = local[sku]
      }
      return out
    })
  }, [orden.items])

  const marcaDe = (it: ItemOrden): Marca =>
    marcas[it.sku] ?? { disponible: 0, revisado: false, articulo_id: propuesto.get(it.sku) ?? null }
  const articuloDe = (it: ItemOrden): number | null => marcaDe(it).articulo_id ?? propuesto.get(it.sku) ?? null

  const guardarAhora = async () => {
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = null
    const skus = [...pendientes.current]
    if (!skus.length) return
    pendientes.current.clear()
    const lista = skus
      .map((sku) => {
        const it = items.find((x) => x.sku === sku)
        const m = marcasRef.current[sku]
        if (!it || !m) return null
        return { sku, disponible: m.disponible, revisado: m.revisado, articulo_id: m.articulo_id ?? propuesto.get(sku) ?? null }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
    setEstadoGuardado('guardando')
    try {
      await guardarMarcas(orden.id, lista)
      setEstadoGuardado('ok')
    } catch (e) {
      skus.forEach((s) => pendientes.current.add(s))
      setEstadoGuardado('error')
      toast(mensajeDe(e, 'No se pudo guardar la revisión'), 'error')
    }
  }

  // La versión vigente de las marcas, para guardar desde el temporizador y al salir.
  const marcasRef = useRef(marcas)
  useEffect(() => {
    marcasRef.current = marcas
  })
  const guardarRef = useRef(guardarAhora)
  useEffect(() => {
    guardarRef.current = guardarAhora
  })
  // Al cambiar de SP o salir, lo pendiente se guarda.
  useEffect(() => () => void guardarRef.current(), [])

  function cambiar(nuevas: Record<string, Marca>) {
    const ahora = Date.now()
    for (const sku of Object.keys(nuevas)) {
      tocados.current.set(sku, ahora)
      pendientes.current.add(sku)
    }
    setMarcas((m) => ({ ...m, ...nuevas }))
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => void guardarRef.current(), ESPERA_GUARDAR_MS)
  }

  const confirmada = estadoRevision(orden).confirmada
  const bloqueado = !canWrite || confirmar.isPending || confirmada

  const stockDe = (it: ItemOrden): number | null => {
    const a = articuloDe(it)
    return a ? (stock.porArticulo.get(a)?.hay ?? 0) : null
  }

  function marcarLote(modo: Lote) {
    const nuevas: Record<string, Marca> = {}
    for (const it of items) {
      const pedido = cantidadSolicitada(it)
      const s = stockDe(it)
      const disp = modo === 'todo' ? pedido : modo === 'nada' ? 0 : Math.min(Math.max(s ?? 0, 0), pedido)
      nuevas[it.sku] = { disponible: disp, revisado: true, articulo_id: articuloDe(it) }
    }
    cambiar(nuevas)
  }

  const revisados = items.filter((it) => marcas[it.sku]?.revisado).length
  const faltanPorRevisar = items.length - revisados
  const resumen = resumenRevision(orden.items ?? [], marcas)
  const sinArticulo = items.filter((it) => {
    const m = marcas[it.sku]
    return m?.revisado && m.disponible > 0 && !articuloDe(it)
  })
  const puedeConfirmar = !bloqueado && todoRevisado(orden.items ?? [], marcas) && sinArticulo.length === 0

  async function confirmarRevision() {
    setPreguntaConfirmar(false)
    const lista = items.map((it) => {
      const m = marcaDe(it)
      return { sku: it.sku, disponible: m.disponible, revisado: m.revisado, articulo_id: articuloDe(it) }
    })
    pendientes.current.clear()
    try {
      const actualizada = await confirmar.mutateAsync({ id: orden.id, marcas: lista, nota: nota.trim() || null })
      toast(
        actualizada.estado === 'atendida_almacen'
          ? `${orden.codigo}: los almacenes tienen todo, no pasa a Compras`
          : actualizada.estado === 'pendiente'
            ? `${orden.codigo} revisada por todos los almacenes: lo que falta pasó a Compras`
            : `${ETIQUETA_ALMACEN} confirmó su revisión de ${orden.codigo}`,
        'success',
      )
      onConfirmada(actualizada)
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo confirmar la revisión'), 'error')
    }
  }

  const opcionesArticulo = useMemo(
    () =>
      [...stock.porArticulo.entries()]
        .filter(([, e]) => e.hay > 0)
        .map(([id, e]) => ({
          valor: String(id),
          codigo: e.codigo,
          nombre: e.nombre,
          detalle: `Hay ${fmtCant(e.hay)} ${e.unidad}`,
        })),
    [stock.porArticulo],
  )

  const estadoTexto =
    estadoGuardado === 'guardando'
      ? 'Guardando…'
      : estadoGuardado === 'error'
        ? '⚠ Sin guardar'
        : revisados > 0 && !confirmada
          ? '✓ Guardado'
          : ''

  const resumenVivo = (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>
        🏬 <strong className="font-semibold">{ETIQUETA_ALMACEN}</strong>: revisados{' '}
        <strong className="font-semibold">{revisados}</strong> de{' '}
        <strong className="font-semibold">{items.length}</strong>
      </span>
      <Chip tone="success">📦 Tiene {resumen.tiene.length}</Chip>
      <Chip tone="danger">❌ No tiene {items.filter((it) => marcas[it.sku]?.revisado && (marcas[it.sku]?.disponible ?? 0) <= 0).length}</Chip>
      <span className="text-ink/50 ml-auto text-xs">{estadoTexto}</span>
    </div>
  )

  const lote = confirmada ? null : (
    <div className={cn(tel ? 'grid grid-cols-3 gap-2' : 'flex flex-wrap gap-2')}>
      {(Object.keys(LOTE_TEXTO) as Lote[]).map((modo) => (
        <Button
          key={modo}
          variant="outline"
          size={tel ? 'lg' : 'sm'}
          className={cn(
            tel && 'h-auto py-2 text-sm',
            modo === 'stock' && 'border-info',
            modo === 'todo' && 'border-success',
            modo === 'nada' && 'border-danger',
          )}
          disabled={bloqueado || (modo === 'stock' && (stock.cargando || stock.porArticulo.size === 0))}
          title={
            modo === 'stock'
              ? `Marca en cada renglón lo que dice el inventario de ${ETIQUETA_ALMACEN} (hasta lo pedido)`
              : undefined
          }
          onClick={() => (revisados > 0 ? setLotePendiente(modo) : marcarLote(modo))}
        >
          {LOTE_TEXTO[modo]}
        </Button>
      ))}
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Cabecera */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <strong className="font-mono">📋 {orden.codigo}</strong>
            {orden.urgente ? <Chip tone="danger">🚨 URGENTE</Chip> : null}
            <Chip tone="warning">En revisión de almacén</Chip>
            <Chip
              tone={confirmada ? 'success' : revisados > 0 ? 'info' : 'warning'}
              title={
                confirmada
                  ? `Confirmó ${estadoRevision(orden).confirmadaPor ?? ''} · ${fechaHoraVE(estadoRevision(orden).confirmadaEn)}`
                  : undefined
              }
            >
              🏬 {ETIQUETA_ALMACEN} {confirmada ? '✓' : revisados > 0 ? `${revisados}/${items.length}` : 'pendiente'}
            </Chip>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="ghost"
              size={tel ? 'md' : 'sm'}
              onClick={() =>
                setMensajeWs({ titulo: `💬 Solicitud de Pedido ${orden.codigo}`, texto: mensajeSolicitudPedido(orden) })
              }
            >
              💬 WhatsApp de la SP
            </Button>
            <Button
              variant="ghost"
              size={tel ? 'md' : 'sm'}
              disabled={armandoPdf}
              title="Abre la solicitud en la vista previa de PDF (no se descarga sola)"
              onClick={onVerPdf}
            >
              {armandoPdf ? 'Armando…' : '📄 Ver PDF'}
            </Button>
          </div>
        </div>
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink/45 text-[11px] font-medium tracking-wide uppercase">Fecha</dt>
            <dd>
              {fechaHoraVE(orden.creado_en)} <span className="text-ink/50">· {relTime(orden.creado_en)}</span>
            </dd>
          </div>
          <div>
            <dt className="text-ink/45 text-[11px] font-medium tracking-wide uppercase">Solicitante</dt>
            <dd>{solicitaDe(orden)}</dd>
          </div>
          <div>
            <dt className="text-ink/45 text-[11px] font-medium tracking-wide uppercase">Se necesita en</dt>
            <dd>
              <strong className="font-semibold">{ETIQUETA_ALMACEN}</strong>
            </dd>
          </div>
          {orden.finalidad || orden.motivo ? (
            <div>
              <dt className="text-ink/45 text-[11px] font-medium tracking-wide uppercase">Finalidad</dt>
              <dd>{orden.finalidad ?? orden.motivo}</dd>
            </div>
          ) : null}
          {orden.notas ? (
            <div className="sm:col-span-2">
              <dt className="text-ink/45 text-[11px] font-medium tracking-wide uppercase">Notas</dt>
              <dd className="text-ink/60">{orden.notas}</dd>
            </div>
          ) : null}
        </dl>
      </Card>

      {!canWrite ? (
        <div className="border-warning/40 bg-warning/8 flex gap-2 rounded-[6px] border px-3 py-2 text-sm">
          <span aria-hidden="true">👁</span>
          <span>Tu rol solo puede ver. Para revisar solicitudes hace falta escritura en Inventario o en Salidas.</span>
        </div>
      ) : null}

      {stock.sinAlmacen ? (
        <div className="border-danger/40 bg-danger/8 rounded-[6px] border px-3 py-2 text-sm">
          No está el almacén general ({ALMACEN_QUE_REVISA}), o está apagado.
        </div>
      ) : null}

      {/* Resumen y lote: arriba y pegado en la PC; en el teléfono, primero el lote. */}
      {tel ? (
        <>
          {lote ? (
            <div>
              <p className="text-ink/55 mb-1.5 text-xs font-semibold tracking-wide uppercase">
                Marcar todo de una vez · {ETIQUETA_ALMACEN}
              </p>
              {lote}
            </div>
          ) : null}
          <Card>{resumenVivo}</Card>
        </>
      ) : (
        <Card className="sticky top-0 z-10 space-y-2 shadow-md">
          {resumenVivo}
          {lote ? (
            <div className="border-hairline space-y-1.5 border-t pt-2">
              <p className="text-ink/55 text-xs font-semibold tracking-wide uppercase">Marcar todo · {ETIQUETA_ALMACEN}</p>
              {lote}
            </div>
          ) : null}
        </Card>
      )}

      {confirmada ? (
        <div className="border-success/40 bg-success/8 flex gap-2 rounded-[6px] border px-3 py-2 text-sm">
          <span aria-hidden="true">✅</span>
          <span>
            <strong className="font-semibold">{ETIQUETA_ALMACEN} ya confirmó su revisión</strong> ·{' '}
            {estadoRevision(orden).confirmadaPor ?? ''} · {fechaHoraVE(estadoRevision(orden).confirmadaEn)}
          </span>
        </div>
      ) : null}

      {/* Renglones */}
      <div className="space-y-2">
        {(orden.items ?? []).map((it) =>
          seRevisa(it) ? (
            <Renglon
              key={it.sku}
              it={it}
              tel={tel}
              marca={marcaDe(it)}
              articulo={articuloDe(it)}
              stock={stockDe(it)}
              cargandoStock={stock.cargando}
              infoArticulo={(id) => stock.porArticulo.get(id)}
              opcionesArticulo={opcionesArticulo}
              bloqueado={bloqueado}
              onCambio={(m) => cambiar({ [it.sku]: m })}
            />
          ) : (
            <div key={it.sku} className="border-hairline rounded-[8px] border p-3 text-sm opacity-55">
              <div className="font-medium">{it.nombre}</div>
              <div className="text-ink/55 text-xs">No se pide: venía desmarcado en la SP.</div>
            </div>
          ),
        )}
      </div>

      {!confirmada ? (
        <Card className="space-y-3">
          <Textarea
            label={`Nota de ${ETIQUETA_ALMACEN} (opcional)`}
            rows={tel ? 3 : 2}
            placeholder="Ej.: el aceite que hay está abierto"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            disabled={bloqueado}
          />
          {sinArticulo.length > 0 ? (
            <p className="text-warning text-sm">
              ⚠ Elegí qué artículo del almacén entrega: {sinArticulo.map((it) => it.nombre).join(', ')}.
            </p>
          ) : null}
          <Button
            block
            size={tel ? 'lg' : 'md'}
            className={cn(!tel && 'h-[46px]')}
            disabled={!puedeConfirmar}
            title={faltanPorRevisar > 0 ? 'Falta revisar algún renglón' : undefined}
            onClick={() => setPreguntaConfirmar(true)}
          >
            {confirmar.isPending ? 'Confirmando…' : `✅ Confirmar revisión de ${ETIQUETA_ALMACEN}`}
          </Button>
          {faltanPorRevisar > 0 ? (
            <p className="text-ink/55 text-center text-xs">
              Faltan {faltanPorRevisar} renglón(es) por revisar en {ETIQUETA_ALMACEN}.
            </p>
          ) : null}
        </Card>
      ) : null}

      {lotePendiente ? (
        <ConfirmDialog
          title={`${LOTE_TEXTO[lotePendiente]} · ${ETIQUETA_ALMACEN}`}
          message={
            <>
              Ya hay {revisados} renglón(es) revisados en {ETIQUETA_ALMACEN}. Esto cambia{' '}
              <strong className="font-semibold">todos</strong> los renglones de {orden.codigo} para {ETIQUETA_ALMACEN}.
              ¿Seguir?
            </>
          }
          confirmText="Sí, marcar todo"
          onCancel={() => setLotePendiente(null)}
          onConfirm={() => {
            marcarLote(lotePendiente)
            setLotePendiente(null)
          }}
        />
      ) : null}

      {preguntaConfirmar ? (
        <ConfirmDialog
          title={`Confirmar revisión de ${ETIQUETA_ALMACEN} · ${orden.codigo}`}
          confirmText={`✅ Confirmar ${ETIQUETA_ALMACEN}`}
          success
          busy={confirmar.isPending}
          onCancel={() => setPreguntaConfirmar(false)}
          onConfirm={() => void confirmarRevision()}
          message={
            resumen.falta.length > 0 ? (
              <>
                Con esto responde el almacén: lo que falta (<strong className="font-semibold">{resumen.falta.length}</strong>{' '}
                producto(s)) pasa a Compras para cotizar.
                {resumen.tiene.length > 0
                  ? ' Lo que tiene sale por una solicitud de salida del almacén general, a autorizar en Salidas.'
                  : ''}
              </>
            ) : (
              <>
                Con esto responde el almacén y tiene <strong className="font-semibold">todo</strong>: la SP queda «Atendida
                por almacén» y no pasa a Compras. Lo que entrega sale por una solicitud de salida del almacén general, a
                autorizar en Salidas.
              </>
            )
          }
        >
          <ResumenListas resumen={resumen} />
        </ConfirmDialog>
      ) : null}

      {mensajeWs ? (
        <ModalWhatsappCompra titulo={mensajeWs.titulo} texto={mensajeWs.texto} onCerrar={() => setMensajeWs(null)} />
      ) : null}
    </div>
  )
}

function Renglon({
  it,
  tel,
  marca,
  articulo,
  stock,
  cargandoStock,
  infoArticulo,
  opcionesArticulo,
  bloqueado,
  onCambio,
}: {
  it: ItemOrden
  tel: boolean
  marca: Marca
  articulo: number | null
  stock: number | null
  cargandoStock: boolean
  infoArticulo: (id: number) => { nombre: string; codigo: string; unidad: string; hay: number } | undefined
  opcionesArticulo: { valor: string; codigo: string; nombre: string; detalle: string }[]
  bloqueado: boolean
  onCambio: (m: Marca) => void
}) {
  const pedido = cantidadSolicitada(it)
  const und = it.unidad || 'und'
  const disp = marca.revisado ? Math.min(Math.max(marca.disponible, 0), pedido) : 0
  const falta = Math.max(Math.round((pedido - disp) * 10000) / 10000, 0)
  const paso = pasoStepper(pedido)
  const pct = pedido > 0 ? Math.round((disp / pedido) * 100) : 0
  const est = estadoStock(pedido, stock)
  const [texto, setTexto] = useState<string | null>(null)

  const fijar = (valor: number, revisado = true) => onCambio({ disponible: valor, revisado, articulo_id: articulo })

  const borde = !marca.revisado
    ? 'border-l-ink/15'
    : disp >= pedido && pedido > 0
      ? 'border-l-success'
      : disp > 0
        ? 'border-l-warning'
        : 'border-l-danger'

  const opciones =
    articulo && !opcionesArticulo.some((o) => o.valor === String(articulo)) && infoArticulo(articulo)
      ? [
          ...opcionesArticulo,
          {
            valor: String(articulo),
            codigo: infoArticulo(articulo)!.codigo,
            nombre: infoArticulo(articulo)!.nombre,
            detalle: `Hay ${fmtCant(infoArticulo(articulo)!.hay)} ${infoArticulo(articulo)!.unidad}`,
          },
        ]
      : opcionesArticulo

  return (
    <div className={cn('border-hairline bg-surface rounded-[8px] border border-l-4 p-3', borde)}>
      <div className={cn('grid gap-3', !tel && 'lg:grid-cols-[1fr_auto]')}>
        <div className="min-w-0 space-y-1">
          <div className={cn('font-medium', tel ? 'text-[1.05rem]' : 'text-[.98rem]')}>{it.nombre}</div>
          <div className="text-ink/65 text-sm">
            Piden{' '}
            <strong className="font-semibold">
              {fmtCant(pedido)} {und}
            </strong>
            {it.finalidad ? ` · ${it.finalidad}` : ''}
          </div>
          <div className="text-ink/65 flex flex-wrap items-center gap-1.5 text-sm">
            📍 {ETIQUETA_ALMACEN}
            {cargandoStock ? (
              <span className="text-ink/45">buscando en el inventario…</span>
            ) : stock == null ? (
              <Chip tone="danger" title="El renglón no tiene un producto del inventario: revísalo a mano">
                sin vincular
              </Chip>
            ) : (
              <Chip
                tone={est === 'alcanza' ? 'success' : est === 'parcial' ? 'warning' : 'danger'}
                className="font-mono"
              >
                {fmtCant(stock)} {und}
              </Chip>
            )}
          </div>
          <SelectBuscable
            label="Artículo del almacén que entrega"
            opciones={opciones}
            valor={articulo ? String(articulo) : ''}
            vacio="— Elegí el artículo —"
            disabled={bloqueado}
            hint={it.general ? 'Pedido con nombre general: diga qué artículo del inventario sale.' : undefined}
            onCambio={(v) => onCambio({ ...marca, articulo_id: v ? Number(v) : null })}
          />
        </div>

        <div className={cn('space-y-1.5', !tel && 'lg:w-80')}>
          <div className="text-ink/65 flex items-center gap-1.5 text-sm">
            📦 Sale de {ETIQUETA_ALMACEN}
            {!marca.revisado ? <Chip tone="warning">sin revisar</Chip> : null}
          </div>
          <div className={cn('grid items-center gap-1.5', tel ? 'grid-cols-[60px_1fr_60px]' : 'grid-cols-[44px_120px_44px_auto]')}>
            <Button
              variant="outline"
              className={tel ? 'h-[60px] text-xl' : undefined}
              aria-label={`Menos de ${ETIQUETA_ALMACEN}`}
              disabled={bloqueado || disp <= 0}
              onClick={() => fijar(Math.max(0, Math.round((disp - paso) * 10000) / 10000))}
            >
              −
            </Button>
            <input
              inputMode="decimal"
              disabled={bloqueado}
              aria-label="Cuánto sale"
              className={cn(
                'rounded-control border-ink/20 bg-surface w-full border px-2 text-center font-mono',
                tel ? 'h-[60px] text-xl' : 'h-10',
              )}
              value={texto ?? (marca.revisado ? fmtCant(disp) : '')}
              onFocus={() => setTexto(marca.revisado ? String(disp) : '')}
              onChange={(e) => setTexto(comoNumero(e.target.value, { maxDecimales: 4, sinNegativos: true }))}
              onBlur={() => {
                const t = texto
                setTexto(null)
                if (t == null || t.trim() === '') return
                let v = num(t)
                if (v > pedido) {
                  toast(`No puede ser más de lo pedido (${fmtCant(pedido)} ${und}).`, 'warning')
                  v = pedido
                }
                fijar(Math.max(0, v))
              }}
            />
            <Button
              variant="outline"
              className={tel ? 'h-[60px] text-xl' : undefined}
              aria-label={`Más de ${ETIQUETA_ALMACEN}`}
              disabled={bloqueado || disp >= pedido}
              onClick={() => fijar(Math.min(pedido, Math.round((disp + paso) * 10000) / 10000))}
            >
              ＋
            </Button>
            <Button
              variant={marca.revisado && disp <= 0 ? 'danger' : 'ghost'}
              className={cn(tel && 'col-span-3 h-12')}
              aria-pressed={marca.revisado && disp <= 0}
              disabled={bloqueado}
              onClick={() => fijar(0)}
            >
              ✗ No hay
            </Button>
          </div>
          <div className="text-sm">
            {!marca.revisado ? (
              <span className="text-ink/50">Sin revisar: toca ＋, escribe la cantidad o marca ✗ No hay.</span>
            ) : falta > 0 ? (
              <span>
                🛒 A Compras:{' '}
                <b className="text-royal-700 dark:text-royal-300 font-mono">
                  {fmtCant(falta)} {und}
                </b>
                {disp > 0 ? ` · ${ETIQUETA_ALMACEN} entrega ${fmtCant(disp)}` : ''}
              </span>
            ) : (
              <span className="text-success">✓ {ETIQUETA_ALMACEN} lo cubre completo</span>
            )}
          </div>
        </div>
      </div>
      <div
        className="bg-royal-600/10 mt-2 h-1.5 overflow-hidden rounded-full"
        aria-label={`${ETIQUETA_ALMACEN} entrega el ${pct} % de lo pedido`}
      >
        <i className="bg-success block h-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
