import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Vacio } from '@/components/ui/Estado'
import { cn } from '@/lib/cn'
import { useEmpresa, empresaDelPapel } from '@/lib/api/empresa'
import { useRecepcionesEntre, type PorRecibir, type Recepcion } from '@/lib/api/pedidos'
import {
  ETIQUETA_ALMACEN,
  etiquetaEstado,
  fechaHoraVE,
  fmtCant,
  money,
  progresoRecepcion,
  relTime,
  renglonesARecibir,
  sinTildes,
} from '@/lib/pedidos'
import { abrirArchivoRecepcion } from '@/lib/pagos'
import { mensajeDe } from '@/lib/avisosFlotantes'
import { mensajeRecepcion } from '@/lib/ficha/pedidosWhatsapp'
import { ModalWhatsappCompra } from '@/pages/compras/ModalWhatsappCompra'
import { RecibirOrdenModal, type RecepcionHecha } from './RecibirOrdenModal'

/*
  «RECEPCIONES POR RECIBIR» EN LA PANTALLA DEL ALMACÉN (MGG Inventario →
  Recepciones, `RecepcionesPendientes.tsx`)

  La cuadrícula de tarjetas de MGG (código y fecha, estado, «n ítems · u
  und.», monto, el almacén y «📦 Recibir»), el modal «Recibir {OC}» y, debajo,
  «🧾 Histórico de recepciones» con el WhatsApp de cada una. Un solo almacén
  (ALM-GEN): no hay «Sugerido: 🏭 sede» ni almacén que asignar.
*/

const hoyCaracas = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })
const haceDias = (hoy: string, dias: number) => {
  const d = new Date(`${hoy}T12:00:00`)
  d.setDate(d.getDate() - dias)
  return d.toISOString().slice(0, 10)
}

export function RecepcionesPorRecibir({
  filas,
  cargando,
  error,
  canWrite,
  abrirId,
  onAbierta,
}: {
  filas: PorRecibir[]
  cargando: boolean
  error: unknown
  canWrite: boolean
  /** La orden que pidió abrir el aviso de la campana (?detalle=ID). */
  abrirId: number | null
  onAbierta: () => void
}) {
  const { data: empresa } = useEmpresa()
  const empresaNombre = empresaDelPapel(empresa).razonSocial
  const [selId, setSelId] = useState<number | null>(null)
  const [mensaje, setMensaje] = useState<{ titulo: string; texto: string } | null>(null)

  const idAbierto = selId ?? abrirId
  const sel = filas.find((f) => f.orden.id === idAbierto) ?? null

  function alRecibir(r: RecepcionHecha) {
    setSelId(null)
    onAbierta()
    setMensaje({
      titulo: `📥 Recepción ${r.recepcion.codigo}`,
      texto: mensajeRecepcion(r.recepcion, { empresa: empresaNombre }),
    })
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-ink/85 mb-2 font-semibold">
          Recepciones por recibir <span className="text-ink/50 text-sm font-normal">({filas.length} órdenes)</span>
        </h2>
        {error ? (
          <Card className="border-danger border">
            <strong>Error:</strong> {mensajeDe(error, 'No se pudieron leer las recepciones')}
          </Card>
        ) : cargando ? (
          <p className="text-ink/50 text-sm">Cargando…</p>
        ) : filas.length === 0 ? (
          <Card>
            <Vacio
              icono={<span className="text-3xl">📦</span>}
              titulo="No hay mercancía por recibir. Cuando llegue una orden, aparecerá acá."
            />
          </Card>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {filas.map((f) => {
              const o = f.orden
              const ren = renglonesARecibir(o)
              const unidades = ren.reduce((a, it) => a + (Number(it.cantidad) || 0), 0)
              const prog = progresoRecepcion(o)
              return (
                <Card key={o.id} className={cn('flex flex-col gap-1.5 text-sm', o.urgente && 'border-danger border')}>
                  <div className="flex items-center gap-2">
                    <strong className="font-mono">{o.oc_codigo ?? o.codigo}</strong>
                    <span className="text-ink/45 ml-auto text-xs" title={fechaHoraVE(o.pagada_en ?? o.oc_aprobada_en ?? o.creado_en)}>
                      {relTime(o.pagada_en ?? o.oc_aprobada_en ?? o.creado_en)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip tone="royal">{etiquetaEstado(o.estado)}</Chip>
                    {o.urgente ? <Chip tone="danger">🚨 URGENTE</Chip> : null}
                    {prog.parcial ? (
                      <Chip tone="warning">
                        Parcial · {prog.completos}/{prog.total} completos
                      </Chip>
                    ) : null}
                  </div>
                  <div className="text-ink/80 truncate font-semibold">{f.proveedor ?? '—'}</div>
                  <div className="text-ink/55 text-xs">
                    {ren.length} ítems · {fmtCant(unidades)} und. · {o.codigo}
                  </div>
                  <div className="text-royal-700 dark:text-royal-300 font-mono font-semibold">{money(o.total)}</div>
                  <div className="text-ink/55 text-xs">📦 {ETIQUETA_ALMACEN}</div>
                  <Button className="mt-1" disabled={!canWrite} onClick={() => setSelId(o.id)}>
                    📦 Recibir
                  </Button>
                </Card>
              )
            })}
          </div>
        )}
        {!canWrite && filas.length > 0 ? (
          <small className="text-ink/50 mt-1 block">Tu rol solo puede ver: para recepcionar hace falta escritura en Inventario.</small>
        ) : null}
      </section>

      <HistoricoRecepciones
        onWhatsapp={(r) => setMensaje({ titulo: `📥 Recepción ${r.codigo}`, texto: mensajeRecepcion(r, { empresa: empresaNombre }) })}
      />

      {sel && canWrite ? (
        <RecibirOrdenModal
          key={sel.orden.id}
          orden={sel.orden}
          proveedor={sel.proveedor}
          onCancel={() => {
            setSelId(null)
            onAbierta()
          }}
          onHecho={alRecibir}
        />
      ) : null}

      {mensaje ? <ModalWhatsappCompra titulo={mensaje.titulo} texto={mensaje.texto} onCerrar={() => setMensaje(null)} /> : null}
    </div>
  )
}

/** «🧾 Histórico de recepciones»: lo recibido en el almacén general. */
export function HistoricoRecepciones({
  onWhatsapp,
  compacto = false,
}: {
  onWhatsapp: (r: Recepcion) => void
  compacto?: boolean
}) {
  const hoy = hoyCaracas()
  const [desde, setDesde] = useState(haceDias(hoy, 30))
  const [hasta, setHasta] = useState(hoy)
  const [busca, setBusca] = useState('')
  const q = useRecepcionesEntre(desde, hasta)

  const lista = useMemo(() => {
    const t = sinTildes(busca.trim())
    const xs = q.data ?? []
    if (!t) return xs
    return xs.filter((r) =>
      sinTildes(
        [r.codigo, r.orden_codigo, r.oc_codigo, r.proveedor_nombre, r.recibida_por_nombre, ...r.renglones.map((i) => i.nombre)]
          .filter(Boolean)
          .join(' '),
      ).includes(t),
    )
  }, [q.data, busca])

  return (
    <section>
      <h2 className="text-ink/85 mb-2 font-semibold">🧾 Histórico de recepciones</h2>
      <div className={cn('mb-2 grid gap-2', compacto ? 'grid-cols-2' : 'sm:grid-cols-[10rem_10rem_1fr]')}>
        <Input label="Desde" type="date" value={desde} max={hoy} onChange={(e) => setDesde(e.target.value)} />
        <Input label="Hasta" type="date" value={hasta} max={hoy} onChange={(e) => setHasta(e.target.value)} />
        <div className={cn(compacto && 'col-span-2')}>
          <Input
            label="Buscar"
            sinNormalizar
            type="search"
            placeholder="🔍 Orden, proveedor o material…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>
      {q.isPending ? (
        <p className="text-ink/50 text-sm">Cargando…</p>
      ) : q.error ? (
        <p className="text-danger text-sm">{mensajeDe(q.error, 'No se pudo leer el histórico')}</p>
      ) : lista.length === 0 ? (
        <p className="text-ink/50 text-sm">Sin recepciones en esas fechas.</p>
      ) : compacto ? (
        <div className="space-y-2">
          <p className="text-ink/55 text-sm">{lista.length} recepción(es)</p>
          {lista.map((r) => (
            <div key={r.id} className="bg-surface shadow-card rounded-[10px] p-3">
              <div className="font-medium">
                📥 {r.codigo}
                {r.proveedor_nombre ? <span className="text-ink/55"> · {r.proveedor_nombre}</span> : null}
              </div>
              <div className="text-ink/55 text-xs">
                {fechaHoraVE(r.recibida_en)} · {r.renglones.length} material(es) · Recibió {r.recibida_por_nombre ?? '—'}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button variant="ghost" onClick={() => onWhatsapp(r)}>
                  💬 WhatsApp
                </Button>
                {r.documento_path ? (
                  <Button variant="ghost" onClick={() => void abrirArchivoRecepcion(r.documento_path!)}>
                    📎 Documento
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card flush className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-ink/55 border-hairline border-b text-left text-xs">
              <tr>
                <th className="px-3 py-2 font-medium">N°</th>
                <th className="px-3 py-2 font-medium">Proveedor</th>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Materiales</th>
                <th className="px-3 py-2 text-right font-medium">Valor</th>
                <th className="px-3 py-2 font-medium">Recibió</th>
                <th className="px-3 py-2" aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id} className="border-hairline border-b align-top">
                  <td className="px-3 py-2">
                    <strong className="font-mono">{r.codigo}</strong>
                    <div className="text-ink/45 font-mono text-xs">{r.orden_codigo}</div>
                    {!r.completa ? (
                      <Chip tone={r.cierra ? 'warning' : 'info'}>{r.cierra ? 'Cerrada con lo recibido' : 'Parcial'}</Chip>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{r.proveedor_nombre ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fechaHoraVE(r.recibida_en)}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.renglones.map((i) => `${i.nombre}: ${fmtCant(i.cantidad)}${i.unidad ? ` ${i.unidad}` : ''}`).join(' · ')}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{money(r.valor)}</td>
                  <td className="px-3 py-2">{r.recibida_por_nombre ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => onWhatsapp(r)}>
                      💬 WhatsApp
                    </Button>
                    {r.documento_path ? (
                      <Button size="sm" variant="ghost" onClick={() => void abrirArchivoRecepcion(r.documento_path!)}>
                        📎
                      </Button>
                    ) : null}
                    {r.fotos.map((f, i) => (
                      <Button key={f.path} size="sm" variant="ghost" title={`Foto ${i + 1}`} onClick={() => void abrirArchivoRecepcion(f.path)}>
                        📷
                      </Button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  )
}
