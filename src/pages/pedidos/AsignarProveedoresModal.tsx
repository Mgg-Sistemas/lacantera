import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Segmento } from '@/components/ui/Segmento'
import { cn } from '@/lib/cn'
import type { Proveedor } from '@/lib/api/catalogo'
import { useAsignarProveedores, type EstadisticaProveedor, type Oferta, type Orden } from '@/lib/api/pedidos'
import { fmtCant, money } from '@/lib/pedidos'
import {
  precioRenglon,
  recortarOferta,
  representanteGrupo,
  scoreOfertas,
  skusTomados,
  type Modalidad,
} from '@/lib/ofertas'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'

/*
  «ASIGNAR PROVEEDORES POR PRODUCTO» (MGG `AsignarProveedoresModal.tsx`)

  Se elige un proveedor y se marcan los productos que se le compran, a su
  precio. Cada proveedor genera su propia sub-OC (con su método de pago) en
  «Ordenes pendiente por aprobar»; lo que quede sin asignar sigue pendiente
  en la OP madre. Un producto que ya tiene sub-OC queda bloqueado.
*/
export function AsignarProveedoresModal({
  madre,
  hijas,
  ofertas,
  stats,
  proveedorDe,
  onCargarOferta,
  onClose,
  onDone,
}: {
  madre: Orden
  hijas: Orden[]
  ofertas: Oferta[]
  stats: EstadisticaProveedor[]
  proveedorDe: (id: number | null | undefined) => Proveedor | undefined
  onCargarOferta: (soloSkus: Set<string>) => void
  onClose: () => void
  onDone: () => void
}) {
  const asignar = useAsignarProveedores()
  const [error, setError] = useState<string | null>(null)
  const [sel, setSel] = useState<number | null>(ofertas[0]?.id ?? null)
  // sku → oferta a la que se asignó en esta sesión.
  const [asign, setAsign] = useState<Map<string, number>>(new Map())
  const [modalidades, setModalidades] = useState<Map<number, Modalidad>>(new Map())
  /*
    Solo lo que este proveedor cotizó (la dueña, 09/11/2026): un producto sin
    precio en su oferta es uno que no tiene, y se le asigna a otro proveedor.
  */
  const [soloConPrecio, setSoloConPrecio] = useState(true)

  const tomados = useMemo(() => skusTomados(hijas), [hijas])
  const hijaDeSku = useMemo(() => {
    const m = new Map<string, Orden>()
    for (const h of hijas) {
      if (['cancelada', 'anulada', 'desistida_proveedor'].includes(h.estado)) continue
      for (const it of h.items) m.set(it.sku, h)
    }
    return m
  }, [hijas])
  const opItems = madre.items.filter((i) => i.comprar !== false)
  const ofertaSel = ofertas.find((o) => o.id === sel) ?? null
  const nombre = (o: Oferta | null | undefined) => (o ? (proveedorDe(o.proveedor_id)?.nombre ?? `Proveedor ${o.proveedor_id}`) : '—')

  const scored = useMemo(
    () => scoreOfertas(ofertas, new Map(stats.map((s) => [s.proveedor_id, s]))),
    [ofertas, stats],
  )
  const mejorPrecio = scored.find((s) => s.mejorPrecio)
  const mejorCalidad = scored.find((s) => s.mejorCalidad)

  const filaDe = (o: Oferta, sku: string) => {
    const g = o.items.filter((i) => i.sku === sku && i.comprar !== false)
    return g.length ? representanteGrupo(g) : undefined
  }
  const cotizoUsd = (o: Oferta) => o.items.some((i) => Number(i.precio_usd) > 0)
  const cotizoBs = (o: Oferta) => o.items.some((i) => Number(i.precio) > 0)
  const modalidadDe = (o: Oferta): Modalidad => modalidades.get(o.id) ?? (cotizoBs(o) ? 'bs' : 'usd')
  const precioEn = (o: Oferta, sku: string, m: Modalidad) => {
    const f = filaDe(o, sku)
    if (!f) return 0
    return m === 'usd' ? Number(f.precio_usd) || 0 : precioRenglon(f)
  }

  const porOferta = useMemo(() => {
    const m = new Map<number, string[]>()
    for (const [sku, id] of asign) m.set(id, [...(m.get(id) ?? []), sku])
    return m
  }, [asign])

  const resumen = [...porOferta.entries()].map(([id, skus]) => {
    const o = ofertas.find((x) => x.id === id)!
    const rec = recortarOferta(o, new Map(skus.map((s) => [s, null])))
    const mod = modalidadDe(o)
    return { o, skus, rec, mod, total: mod === 'usd' ? rec.totalUsd : rec.totalBs }
  })
  const nuevos = asign.size
  const sinAsignar = opItems.filter((i) => !tomados.has(i.sku) && !asign.has(i.sku))

  function toggle(sku: string, marcar: boolean) {
    if (!ofertaSel) return
    setAsign((a) => {
      const x = new Map(a)
      if (marcar) x.set(sku, ofertaSel.id)
      else x.delete(sku)
      return x
    })
  }

  async function confirmar() {
    setError(null)
    if (!nuevos) {
      setError('Marcá al menos un producto para algún proveedor.')
      return
    }
    for (const r of resumen) {
      const falta = r.skus.find((s) => precioEn(r.o, s, r.mod) <= 0)
      if (falta) {
        setError(`El proveedor no cotizó «${opItems.find((i) => i.sku === falta)?.nombre ?? falta}».`)
        return
      }
    }
    try {
      const creadas = await asignar.mutateAsync({
        ordenId: madre.id,
        asignaciones: resumen.map((r) => ({ oferta_id: r.o.id, skus: r.skus, modalidad: r.mod })),
      })
      toast(`${creadas.length} OC creada(s) por proveedor · pendientes de aprobación`, 'success')
      onDone()
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo asignar'))
    }
  }

  const mod = ofertaSel ? modalidadDe(ofertaSel) : 'bs'

  return (
    <Modal
      abierto
      onCerrar={onClose}
      titulo={`Asignar proveedores por producto · ${madre.codigo}`}
      ancho="xl"
      acciones={
        <>
          <Button variant="ghost" onClick={onClose} disabled={asignar.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => void confirmar()} disabled={asignar.isPending || nuevos === 0}>
            {asignar.isPending ? 'Creando OC…' : `Confirmar asignación (${nuevos})`}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        {error ? (
          <Card className="border-danger border">
            <strong>Error:</strong> {error}
          </Card>
        ) : null}

        <div className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onCargarOferta(new Set(opItems.filter((i) => !tomados.has(i.sku)).map((i) => i.sku)))}
          >
            + Cargar oferta de proveedor
          </Button>
        </div>

        {!ofertas.length ? (
          <p className="text-ink/65">
            No hay ofertas cargadas para esta orden. Usá <strong>«+ Cargar oferta de proveedor»</strong> para agregar la
            cotización del proveedor que tiene estos productos y luego asignarlos.
          </p>
        ) : (
          <>
            <p className="text-ink/55 text-[0.84rem]">
              Elegí un proveedor y marcá los productos que le comprás (a su precio). Si el producto que falta no lo cotizó
              nadie, cargá su oferta con <strong>«+ Cargar oferta de proveedor»</strong>. Un producto ya asignado a otro
              proveedor queda bloqueado. Cada proveedor genera su propia OC con su método de pago. Lo que dejes sin asignar
              queda pendiente.
            </p>

            {mejorPrecio || mejorCalidad ? (
              <div className="flex flex-wrap gap-2">
                {mejorPrecio ? (
                  <Chip tone="info">
                    💲 Mejor precio: <strong className="ml-1">{nombre(mejorPrecio.oferta)}</strong>
                  </Chip>
                ) : null}
                {mejorCalidad ? (
                  <Chip tone="info">
                    ⭐ Mejor calidad: <strong className="ml-1">{nombre(mejorCalidad.oferta)}</strong>
                  </Chip>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-1.5">
              {ofertas.map((o) => {
                const r = resumen.find((x) => x.o.id === o.id)
                return (
                  <Button key={o.id} size="sm" variant={sel === o.id ? 'primary' : 'ghost'} onClick={() => setSel(o.id)}>
                    {nombre(o)}
                    {r ? ` · ${r.skus.length} ítem(s) · ${money(r.total)}` : ''}
                  </Button>
                )
              })}
            </div>

            {ofertaSel && cotizoUsd(ofertaSel) ? (
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  Pago de <strong>{nombre(ofertaSel)}</strong>:
                </span>
                <Segmento
                  valor={mod}
                  onCambio={(v) => {
                    if (v === 'bs' && !cotizoBs(ofertaSel)) {
                      toast('Este proveedor no cotizó en Bs', 'warning')
                      return
                    }
                    setModalidades((m) => new Map(m).set(ofertaSel.id, v as Modalidad))
                  }}
                  opciones={[
                    { valor: 'bs', etiqueta: '💵 Bs al cambio (BCV)', pista: cotizoBs(ofertaSel) ? undefined : 'Este proveedor no cotizó en Bs' },
                    { valor: 'usd', etiqueta: '💲 Directo en divisa ($)' },
                  ]}
                />
                {mod === 'usd' ? (
                  <span className="text-ink/55 text-xs">Se usa el precio USD de cada producto; los impuestos de la oferta se prorratean.</span>
                ) : null}
              </div>
            ) : null}

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-royal-600 size-4"
                checked={soloConPrecio}
                onChange={(e) => setSoloConPrecio(e.target.checked)}
              />
              Ver solo los productos que {ofertaSel ? nombre(ofertaSel) : 'este proveedor'} cotizó con precio
            </label>

            <div className="border-hairline overflow-x-auto rounded-[6px] border">
              <table className="w-full min-w-[760px] text-[0.84rem]">
                <thead className="bg-ink/4 text-ink/55 text-left text-xs">
                  <tr>
                    <th className="w-10 px-2 py-2" />
                    <th className="px-2 py-2">Producto</th>
                    <th className="px-2 py-2 text-right">Cant.</th>
                    <th className="px-2 py-2 text-right">
                      Precio {nombre(ofertaSel)} · {mod === 'usd' ? 'Divisa $' : 'Bs (BCV)'}
                    </th>
                    <th className="px-2 py-2 text-right">Subtotal</th>
                    <th className="px-2 py-2">Asignación</th>
                  </tr>
                </thead>
                <tbody>
                  {opItems
                    .filter(
                      (it) =>
                        !soloConPrecio ||
                        !ofertaSel ||
                        asign.get(it.sku) === ofertaSel.id ||
                        precioEn(ofertaSel, it.sku, 'bs') > 0 ||
                        precioEn(ofertaSel, it.sku, 'usd') > 0,
                    )
                    .map((it) => {
                    const bloqueado = tomados.has(it.sku)
                    const asignadoA = asign.get(it.sku)
                    const aOtro = asignadoA != null && asignadoA !== ofertaSel?.id
                    const precio = ofertaSel ? precioEn(ofertaSel, it.sku, mod) : 0
                    const otra = ofertaSel ? precioEn(ofertaSel, it.sku, mod === 'usd' ? 'bs' : 'usd') : 0
                    const fila = ofertaSel ? filaDe(ofertaSel, it.sku) : undefined
                    const cant = Number(fila?.cantidad) || Number(it.cantidad) || 0
                    return (
                      <tr key={it.sku} className={cn('border-hairline border-t', bloqueado && 'opacity-60')}>
                        <td className="px-2 py-1.5">
                          <input
                            type="checkbox"
                            className="accent-royal-600 size-4"
                            disabled={bloqueado || precio <= 0 || aOtro || !ofertaSel}
                            title={precio <= 0 ? 'Este proveedor no cotizó el producto' : undefined}
                            checked={!!ofertaSel && asignadoA === ofertaSel.id}
                            onChange={(e) => toggle(it.sku, e.target.checked)}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          {it.nombre}
                          <span className="text-ink/45"> · {it.sku}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {fmtCant(cant)} {it.unidad ?? ''}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          {precio > 0 ? money(precio) : <span className="text-ink/45 font-sans">no cotizó</span>}
                          {otra > 0 ? (
                            <div className="text-ink/45 text-[0.7rem]">
                              {money(otra)} · {mod === 'usd' ? 'BCV' : 'divisa'}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">{precio > 0 ? money(cant * precio) : '—'}</td>
                        <td className="px-2 py-1.5">
                          {bloqueado ? (
                            <Chip tone="success">
                              🔒 {proveedorDe(hijaDeSku.get(it.sku)?.proveedor_id)?.nombre ?? hijaDeSku.get(it.sku)?.codigo ?? 'sub-OC'} (OC
                              creada)
                            </Chip>
                          ) : asignadoA != null ? (
                            <Chip tone="royal">{nombre(ofertas.find((o) => o.id === asignadoA))}</Chip>
                          ) : (
                            <span className="text-ink/45">sin asignar</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <Card>
              <div className="text-ink/85 mb-1 font-semibold">Resumen de la asignación</div>
              {!resumen.length ? (
                <p className="text-ink/55">Todavía no asignaste productos en esta sesión.</p>
              ) : (
                <ul className="space-y-0.5">
                  {resumen.map((r) => (
                    <li key={r.o.id}>
                      <strong>{nombre(r.o)}</strong>: {r.skus.length} producto(s) · {money(r.total)}
                      {r.rec.iva || r.rec.igtf || r.rec.ajuste ? (
                        <span className="text-ink/55">
                          {' '}
                          (base {money(r.mod === 'usd' ? r.rec.subtotalUsd : r.rec.subtotalBcv || r.rec.subtotalUsd)} · IVA{' '}
                          {money(r.rec.iva)} · IGTF {money(r.rec.igtf)} · ajuste {money(r.rec.ajuste)})
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {sinAsignar.length ? (
                <p className="text-ink/65 mt-1">
                  Quedan <strong>{sinAsignar.length}</strong> producto(s) sin asignar — se podrán asignar después (la OP queda
                  pendiente).
                </p>
              ) : null}
            </Card>
          </>
        )}
      </div>
    </Modal>
  )
}
