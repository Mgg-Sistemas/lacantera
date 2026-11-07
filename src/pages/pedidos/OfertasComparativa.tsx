import { Fragment, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Vacio } from '@/components/ui/Estado'
import { cn } from '@/lib/cn'
import type { Proveedor } from '@/lib/api/catalogo'
import {
  urlAdjuntoOferta,
  useEliminarOferta,
  type EstadisticaProveedor,
  type Oferta,
  type Orden,
} from '@/lib/api/pedidos'
import { fmtCant, money } from '@/lib/pedidos'
import {
  LOGISTICA,
  DATOS_TECNICOS,
  codigoMadre,
  infoModalidad,
  itemsPendientes,
  montoFinalOferta,
  r2,
  scoreOfertas,
  skusTomados,
  type ScoredOferta,
} from '@/lib/ofertas'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { ConfirmDialog } from './Dialogos'

/*
  «OFERTAS Y COMPARATIVA» (MGG `OfertasComparativa.tsx`)

  Las cotizaciones de la orden con el score de MGG (precio 40 %, puntualidad
  25 %, calidad 25 %, cumplimiento 10 %), la más barata arriba (por el precio
  BCV crudo, como MGG). Cada fila se abre para ver el detalle por producto.

  Lo que no está: el aviso de «oferta huérfana» con «↩ Liberar y volver a
  elegir» y el de «⚡ Sincronizar IVA y total». En MGG elegir la oferta son dos
  escrituras desde el navegador y pueden quedar a medias; aquí es una sola
  función en la base, y editar una oferta aceptada sincroniza su OC ahí mismo.
*/

export const MAX_OFERTAS = 6
const MIN_OFERTAS = 1

export function OfertasComparativa({
  orden,
  madre,
  hijas,
  ofertas,
  cargando,
  stats,
  proveedorDe,
  canDecidir,
  onAgregar,
  onEditar,
  onAceptar,
  onIrMadre,
}: {
  orden: Orden
  madre: Orden
  hijas: Orden[]
  ofertas: Oferta[]
  cargando: boolean
  stats: EstadisticaProveedor[]
  proveedorDe: (id: number | null | undefined) => Proveedor | undefined
  canDecidir: boolean
  onAgregar: () => void
  onEditar: (o: Oferta) => void
  onAceptar: (s: ScoredOferta) => void
  onIrMadre: () => void
}) {
  const eliminar = useEliminarOferta()
  const [abierta, setAbierta] = useState<number | null>(null)
  const [porEliminar, setPorEliminar] = useState<Oferta | null>(null)

  const esHija = !!orden.parent_orden_id
  const enEtapaOc = orden.estado === 'aprobada' || orden.estado === 'desistida_proveedor'
  // MGG «reelegible»: una sub-OC que se reabrió y quedó sin proveedor.
  const hijaSinProveedor = esHija && !orden.proveedor_id && orden.estado === 'aprobada'
  const puedeDecidir = canDecidir && enEtapaOc && ofertas.length >= MIN_OFERTAS
  const puedeAgregar = canDecidir && enEtapaOc && ofertas.length < MAX_OFERTAS

  const statsMap = useMemo(() => new Map(stats.map((s) => [s.proveedor_id, s])), [stats])
  const scored = useMemo(() => scoreOfertas(ofertas, statsMap), [ofertas, statsMap])
  const tomados = useMemo(() => skusTomados(hijas), [hijas])
  const pendientesHija = esHija ? itemsPendientes(madre, hijas) : []

  // En la madre se ocultan los productos que ya tienen sub-OC.
  const skusVisibles = (o: Oferta) =>
    esHija
      ? new Set(orden.items.map((i) => i.sku))
      : new Set(o.items.map((i) => i.sku).filter((s) => !tomados.has(s)))

  const proveedorVivoEnHermana = (provId: number) =>
    hijas.some((h) => h.id !== orden.id && h.proveedor_id === provId && !['cancelada', 'anulada', 'desistida_proveedor'].includes(h.estado))

  async function verAdjunto(path: string) {
    try {
      window.open(await urlAdjuntoOferta(path), '_blank', 'noopener')
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo abrir el adjunto'), 'error')
    }
  }

  return (
    <Card className="mt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-ink/85 font-semibold">Ofertas y comparativa</h4>
        <span className="flex items-center gap-2">
          <span className="text-ink/50 font-mono text-xs">
            {ofertas.length}/{MAX_OFERTAS} oferta(s)
          </span>
          {puedeAgregar ? (
            <Button size="sm" variant="ghost" onClick={onAgregar}>
              + Agregar oferta
            </Button>
          ) : null}
        </span>
      </div>

      {esHija ? (
        <div className="border-warning bg-warning/6 mb-3 rounded-[6px] border px-3 py-2 text-sm">
          <div>
            🧩 Compra multiproveedor — esta es una sub-orden de <strong>{codigoMadre(orden.codigo)}</strong>.
          </div>
          {pendientesHija.length ? (
            <>
              <div className="mt-1">
                Quedaron <strong>{pendientesHija.length}</strong> artículo(s) pendiente(s) por asignar a otro proveedor:
              </div>
              <ul className="text-ink/70 ml-4 list-disc text-xs">
                {pendientesHija.map((it) => (
                  <li key={it.sku}>
                    {it.nombre} · {fmtCant(it.cantidad)} {it.unidad ?? ''}
                  </li>
                ))}
              </ul>
              <Button
                size="sm"
                variant="ghost"
                className="mt-1"
                title="Abre la OP madre, donde se reparten los productos que faltan entre los demás proveedores"
                onClick={onIrMadre}
              >
                🧩 Ir a {codigoMadre(orden.codigo)} y asignar lo que falta
              </Button>
            </>
          ) : (
            <div className="text-ink/65 mt-1 text-xs">Todos los artículos de la OP quedaron asignados a algún proveedor.</div>
          )}
        </div>
      ) : null}

      {cargando ? (
        <p className="text-ink/50 text-sm">Cargando ofertas…</p>
      ) : !ofertas.length ? (
        <Vacio icono={<span className="text-2xl">◇</span>} titulo="Aún no hay ofertas registradas para esta orden." />
      ) : (
        <div className="border-hairline overflow-x-auto rounded-[6px] border">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-ink/4 text-ink/55 text-left text-xs">
              <tr>
                <th className="px-3 py-2 font-medium">Proveedor</th>
                <th className="px-3 py-2 font-medium">
                  Precio total <div className="text-ink/40 font-normal">BCV · efectivo</div>
                </th>
                <th className="px-3 py-2 font-medium">Entrega prom.</th>
                <th className="px-3 py-2 text-right font-medium">Puntualidad</th>
                <th className="px-3 py-2 text-right font-medium">Calidad</th>
                <th className="px-3 py-2 text-right font-medium">Cumpl.</th>
                <th className="px-3 py-2 text-right font-medium">Score</th>
                <th className="px-3 py-2 font-medium">PDF</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {scored.map((s) => {
                const o = s.oferta
                const prov = proveedorDe(o.proveedor_id)
                const m = montoFinalOferta(o)
                const bcv = Number(o.precio_total) || 0
                const efe = Number(o.precio_efectivo) || 0
                const ahorro = bcv > 0 && efe > 0 ? r2(bcv - efe) : 0
                const aceptada = o.estado === 'aceptada'
                const recomendada = s.recomendada && o.estado === 'pendiente'
                const hijaDe = hijas.find((h) => h.proveedor_id === o.proveedor_id && !['cancelada', 'anulada', 'desistida_proveedor'].includes(h.estado))
                const ordenDeLaOferta = hijaDe ?? (madre.proveedor_id === o.proveedor_id ? madre : null)
                const visibles = skusVisibles(o)
                const quedan = o.items.filter((i) => visibles.has(i.sku))
                const reelegible =
                  hijaSinProveedor && (o.estado === 'aceptada' || o.estado === 'descartada') && !proveedorVivoEnHermana(o.proveedor_id)
                const seleccionable =
                  puedeDecidir &&
                  (o.estado === 'pendiente' || reelegible) &&
                  (esHija ? !proveedorVivoEnHermana(o.proveedor_id) : quedan.length > 0)
                const expandida = abierta === o.id
                return (
                  <Fragment key={o.id}>
                    <tr
                      className={cn(
                        'border-hairline hover:bg-ink/3 cursor-pointer border-t align-top',
                        recomendada && 'bg-royal-600/6',
                        aceptada && 'bg-[rgba(41,192,129,0.08)]',
                      )}
                      title="Clic para ver el detalle por producto (Bs · USD)"
                      onClick={() => setAbierta(expandida ? null : o.id)}
                    >
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <strong>{prov?.nombre ?? `Proveedor ${o.proveedor_id}`}</strong>
                          {recomendada ? <Chip tone="royal">★ Recomendada</Chip> : null}
                          {aceptada && ordenDeLaOferta?.modalidad_pago ? (
                            <Chip tone="success">
                              Aceptada · {ordenDeLaOferta.modalidad_pago === 'usd' ? '💵 Pago en $' : '🏦 Pago en Bs'}
                            </Chip>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                          {s.mejorPrecio ? <Chip tone="info">Mejor precio</Chip> : null}
                          {s.masPuntual ? <Chip tone="info">Más puntual</Chip> : null}
                          {s.mejorCalidad ? <Chip tone="info">Mejor calidad</Chip> : null}
                          <span className="text-ink/50">{expandida ? '▾ Detalle por producto' : '▸ Clic para ver detalle por producto'}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <strong className="font-mono">{money(m.final)}</strong>
                        <div className="text-ink/50 text-[11px]">
                          {[
                            `base ${money(m.base)}`,
                            m.descuento ? `desc. ${money(m.descuento)}` : '',
                            Number(o.iva) ? `${o.iva_incluido ? 'IVA incl.' : 'IVA'} ${money(o.iva)}` : '',
                            Number(o.igtf) ? `IGTF ${money(o.igtf)}` : '',
                            Number(o.ajuste) ? `ajuste ${money(o.ajuste)}` : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                        {ahorro > 0 ? (
                          <div className="text-success text-[11px]" title={`Ahorro ${money(ahorro)} (BCV − efectivo)`}>
                            Divisa: {money(efe)} <Chip tone="success">−{Math.round((ahorro / bcv) * 100)}%</Chip>
                          </div>
                        ) : null}
                        {aceptada && ordenDeLaOferta?.modalidad_pago ? (
                          <div className={cn('text-[11px]', ordenDeLaOferta.modalidad_pago === 'usd' ? 'text-success' : 'text-info')}>
                            ✓ Opción elegida: {infoModalidad(ordenDeLaOferta.modalidad_pago).label}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {o.fecha_entrega_prometida ? new Date(`${o.fecha_entrega_prometida}T12:00:00`).toLocaleDateString('es-VE') : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{Math.round(s.score.puntualidad * 100)}%</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{(s.score.calidad * 5).toFixed(1)} / 5</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{Math.round(s.score.cumplimiento * 100)}%</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{Math.round(s.score.total * 100)}</td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        {o.adjuntos?.length ? (
                          <div className="flex flex-col gap-1">
                            {o.adjuntos.map((a, i) => (
                              <Button key={a.path} size="sm" variant="ghost" onClick={() => void verAdjunto(a.path)}>
                                📎 {o.adjuntos.length > 1 ? (i === 0 ? 'Ver 1' : `Ver ${i + 1}`) : 'Ver'}
                              </Button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-ink/40">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        {o.estado === 'pendiente' ? (
                          <Chip tone="warning">Pendiente</Chip>
                        ) : aceptada ? (
                          <>
                            <Chip tone="success">Aceptada</Chip>
                            {hijaDe ? (
                              <div className="text-ink/50 mt-0.5 text-[11px]">
                                orden de {hijaDe.items.filter((i) => i.comprar !== false).length} ítem(s) · {hijaDe.codigo}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <Chip tone="danger" title={o.motivo_descarte ?? undefined}>
                            Descartada
                          </Chip>
                        )}
                        <div className="mt-1 flex gap-1">
                          {canDecidir ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Editar esta oferta (precios por producto, condición, datos…)"
                              onClick={() => onEditar(o)}
                            >
                              ✎
                            </Button>
                          ) : null}
                          {canDecidir && !esHija && o.estado === 'pendiente' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-danger"
                              title="Eliminar esta oferta"
                              onClick={() => setPorEliminar(o)}
                            >
                              🗑
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {o.detalle && (DATOS_TECNICOS.some((t) => o.detalle?.[t.clave]) || o.detalle.logistica) ? (
                      <tr className="border-hairline border-t">
                        <td colSpan={9} className="text-ink/65 px-3 py-1.5 text-xs">
                          {DATOS_TECNICOS.filter((t) => o.detalle?.[t.clave]).map((t) => (
                            <span key={t.clave} className="mr-3">
                              <strong>{t.label}:</strong> {o.detalle?.[t.clave]}
                            </span>
                          ))}
                          {LOGISTICA.filter((l) => o.detalle?.logistica?.[l.clave]).map((l) => (
                            <span key={l.clave} className="mr-3">
                              🚚 <strong>{l.label}:</strong>{' '}
                              {o.detalle?.logistica?.[l.clave] === 'incluido' ? 'incluido' : 'por cuenta del comprador'}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ) : null}
                    {expandida ? (
                      <tr className="border-hairline border-t">
                        <td colSpan={9} className="bg-canvas px-3 py-2">
                          {quedan.length === 0 ? (
                            <p className="text-ink/55 text-xs">Todos los productos de esta oferta ya fueron asignados a un proveedor.</p>
                          ) : (
                            <DetalleOferta oferta={o} items={quedan} />
                          )}
                        </td>
                      </tr>
                    ) : null}
                    {seleccionable ? (
                      <tr>
                        <td colSpan={9} className="px-3 pb-2 text-right">
                          <Button size="sm" variant={recomendada ? 'primary' : 'ghost'} onClick={() => onAceptar(s)}>
                            {recomendada ? '★ Aceptar oferta recomendada' : 'Aceptar esta oferta'}
                          </Button>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {enEtapaOc && ofertas.length < MIN_OFERTAS ? (
        <p className="text-ink/55 mt-2 text-xs">
          Cargá al menos {MIN_OFERTAS} cotizaciones (máximo {MAX_OFERTAS}) para poder elegir la oferta ganadora.
        </p>
      ) : null}
      {!canDecidir && enEtapaOc ? (
        <p className="text-ink/55 mt-2 text-xs">La oferta del proveedor la elige quien lleva Compras.</p>
      ) : null}

      {porEliminar ? (
        <ConfirmDialog
          title="Eliminar oferta"
          message={`¿Eliminar la oferta de ${proveedorDe(porEliminar.proveedor_id)?.nombre ?? 'este proveedor'} (${money(porEliminar.precio_total)})? Se quita de la comparativa.`}
          confirmText="Eliminar"
          danger
          busy={eliminar.isPending}
          onCancel={() => setPorEliminar(null)}
          onConfirm={async () => {
            try {
              await eliminar.mutateAsync(porEliminar.id)
              toast('Oferta eliminada', 'success')
              setPorEliminar(null)
            } catch (e) {
              toast(mensajeDe(e, 'No se pudo eliminar la oferta'), 'error')
            }
          }}
        />
      ) : null}
    </Card>
  )
}

/** La subtabla por producto (MGG: Producto, Marca, Cant., BCV, USD, Diferencia, Var. %). */
function DetalleOferta({ oferta, items }: { oferta: Oferta; items: Oferta['items'] }) {
  const tb = items.reduce((a, i) => a + (Number(i.cantidad) || 0) * (Number(i.precio) || 0), 0)
  const tu = items.reduce((a, i) => a + (Number(i.cantidad) || 0) * (Number(i.precio_usd) || 0), 0)
  return (
    <table className="w-full text-xs">
      <thead className="text-ink/55 text-left">
        <tr>
          <th className="py-1 pr-2">Producto</th>
          <th className="py-1 pr-2">Marca / modelo</th>
          <th className="py-1 pr-2 text-right">Cant.</th>
          <th className="py-1 pr-2 text-right">Precio BCV</th>
          <th className="py-1 pr-2 text-right">Total BCV</th>
          <th className="py-1 pr-2 text-right">Precio USD</th>
          <th className="py-1 pr-2 text-right">Total USD</th>
          <th className="py-1 pr-2 text-right">Diferencia</th>
          <th className="py-1 text-right">Var. %</th>
        </tr>
      </thead>
      <tbody>
        {items.map((i, k) => {
          const c = Number(i.cantidad) || 0
          const p = Number(i.precio) || 0
          const pu = Number(i.precio_usd) || 0
          const dif = p > 0 && pu > 0 ? r2(c * p - c * pu) : 0
          const factor = Number(i.factor_compra) || 0
          return (
            <tr key={`${oferta.id}-${k}`} className="border-hairline border-t">
              <td className="py-1 pr-2">
                {i.nombre}
                {i.articulo_nombre && i.articulo_nombre !== i.nombre ? (
                  <span className="text-ink/45"> → {i.articulo_nombre}</span>
                ) : null}
              </td>
              <td className="py-1 pr-2">{[i.marca, i.modelo].filter(Boolean).join(' · ') || '—'}</td>
              <td className="py-1 pr-2 text-right">
                {fmtCant(c)} {i.unidad_compra ?? i.unidad ?? ''}
                {i.unidad_compra && factor ? (
                  <div className="text-ink/45">
                    (= {fmtCant(c * factor)} {i.unidad})
                  </div>
                ) : null}
              </td>
              <td className="py-1 pr-2 text-right font-mono">
                {p ? money(p) : '—'}
                {p && i.unidad_compra && factor ? (
                  <div className="text-ink/45">
                    ≈ {money(p / factor)}/{i.unidad}
                  </div>
                ) : null}
              </td>
              <td className="py-1 pr-2 text-right font-mono">{p ? money(c * p) : '—'}</td>
              <td className="py-1 pr-2 text-right font-mono">{pu ? money(pu) : '—'}</td>
              <td className="py-1 pr-2 text-right font-mono">{pu ? money(c * pu) : '—'}</td>
              <td className={cn('py-1 pr-2 text-right font-mono', dif > 0 && 'text-success')}>{dif ? money(dif) : '—'}</td>
              <td className="py-1 text-right font-mono">{p > 0 && pu > 0 ? `${(((p - pu) / p) * 100).toFixed(1)}%` : '—'}</td>
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr className="border-hairline border-t font-semibold">
          <td colSpan={4} className="py-1 pr-2 text-right">
            TOTAL
          </td>
          <td className="py-1 pr-2 text-right font-mono">{tb ? money(tb) : '—'}</td>
          <td />
          <td className="py-1 pr-2 text-right font-mono">{tu ? money(tu) : '—'}</td>
          <td className={cn('py-1 pr-2 text-right font-mono', tb > tu && tu > 0 && 'text-success')}>
            {tb && tu ? money(tb - tu) : '—'}
          </td>
          <td />
        </tr>
      </tfoot>
    </table>
  )
}
