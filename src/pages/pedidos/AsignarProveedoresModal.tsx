import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Segmento } from '@/components/ui/Segmento'
import { cn } from '@/lib/cn'
import type { Proveedor } from '@/lib/api/catalogo'
import {
  useAsignarProveedores,
  useCambiarModalidad,
  useGuardarOferta,
  type EstadisticaProveedor,
  type Oferta,
  type Orden,
  type TipoTasaCotizacion,
} from '@/lib/api/pedidos'
import { fmtCant, money } from '@/lib/pedidos'
import {
  empacarNotaTasa,
  infoTasaCotizacion,
  moneyBs,
  notasSinMarcaTasa,
  precioRenglon,
  r2,
  r4,
  recortarOferta,
  representanteGrupo,
  resolverTasaOferta,
  scoreOfertas,
  skusTomados,
  type Modalidad,
} from '@/lib/ofertas'
import { useTasasCotizacion } from '@/lib/tasasCotizacion'
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
  onEditarOferta,
  onClose,
  onDone,
}: {
  madre: Orden
  hijas: Orden[]
  ofertas: Oferta[]
  stats: EstadisticaProveedor[]
  proveedorDe: (id: number | null | undefined) => Proveedor | undefined
  onCargarOferta: (soloSkus: Set<string>) => void
  onEditarOferta?: (oferta: Oferta) => void
  onClose: () => void
  onDone: () => void
}) {
  const asignar = useAsignarProveedores()
  const guardarOferta = useGuardarOferta()
  const cambiarModalidadOc = useCambiarModalidad()
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
  const { tasas } = useTasasCotizacion(ofertas.some((o) => o.detalle?.tasa_tipo === 'USDT'))
  const tasaSel = useMemo(() => resolverTasaOferta(ofertaSel, tasas), [ofertaSel, tasas])

  const scored = useMemo(
    () => scoreOfertas(ofertas, new Map(stats.map((s) => [s.proveedor_id, s])), tasas),
    [ofertas, stats, tasas],
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

  async function cambiarTasaRapido(o: Oferta, nuevoTipo: TipoTasaCotizacion) {
    const info = infoTasaCotizacion(nuevoTipo)
    const tasaValor =
      nuevoTipo === 'EUR_BCV' ? tasas.EUR_BCV : nuevoTipo === 'USDT' ? tasas.USDT : tasas.USD_BCV
    const soloTeniaUsd = !cotizoBs(o) && cotizoUsd(o) && nuevoTipo !== 'USD_BCV'
    try {
      await guardarOferta.mutateAsync({
        ordenId: madre.id,
        ofertaId: o.id,
        proveedorId: o.proveedor_id,
        proveedorNuevo: null,
        motivoCambio: null,
        datos: {
          items: o.items.map((it) => ({
            sku: it.sku,
            cantidad: Number(it.cantidad) || 0,
            precio: soloTeniaUsd ? r4(Number(it.precio_usd) || 0) : r4(Number(it.precio) || 0),
            precio_usd: soloTeniaUsd
              ? null
              : Number(it.precio_usd) > 0
                ? r4(Number(it.precio_usd))
                : null,
            marca: it.marca ?? null,
            modelo: it.modelo ?? null,
            unidad_compra: it.unidad_compra ?? null,
            factor_compra: it.factor_compra ?? null,
            articulo_id: it.articulo_id ?? null,
            agregado: it.agregado || undefined,
          })),
          descuento: Number(o.descuento) || null,
          iva: Number(o.iva) || null,
          igtf: Number(o.igtf) || null,
          iva_incluido: !!o.iva_incluido,
          ajuste: Number(o.ajuste) || null,
          ajuste_motivo: o.ajuste_motivo ?? null,
          fecha_entrega_prometida: o.fecha_entrega_prometida ?? null,
          condiciones_pago: o.condiciones_pago || 'contado',
          notas: empacarNotaTasa(notasSinMarcaTasa(o.notas), {
            tipo: nuevoTipo,
            tasaBs: tasaValor > 0 ? tasaValor : null,
            fija: false,
            etiqueta: null,
          }),
          detalle: {
            ...(o.detalle ?? {}),
            tasa_tipo: nuevoTipo,
            tasa_moneda: info.moneda,
            tasa_bs: tasaValor > 0 ? tasaValor : null,
            tasa_fija: false,
            tasa_etiqueta: null,
          },
          adjuntos: o.adjuntos ?? [],
        },
      })
      if (soloTeniaUsd) {
        setModalidades((m) => new Map(m).set(o.id, 'bs'))
        const hijasProv = hijas.filter(
          (h) =>
            h.proveedor_id === o.proveedor_id &&
            ['oc_creada', 'confirmada_metodo'].includes(h.estado) &&
            h.modalidad_pago === 'usd',
        )
        for (const h of hijasProv) {
          await cambiarModalidadOc.mutateAsync({ id: h.id, modalidad: 'bs' }).catch(() => undefined)
        }
      }
      toast(`Cotización de ${nombre(o)} actualizada a ${info.larga}`, 'success')
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo cambiar la tasa de la cotización'), 'error')
    }
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
                const tr = resolverTasaOferta(o, tasas)
                return (
                  <Button key={o.id} size="sm" variant={sel === o.id ? 'primary' : 'ghost'} onClick={() => setSel(o.id)}>
                    {nombre(o)} · {tr.info.icono} {tr.info.corta}
                    {r ? ` · ${r.skus.length} ítem(s) · ${r.mod === 'usd' ? money(r.total) : tr.enDivisa(r.total)} (${tr.enBs(r.total)})` : ''}
                  </Button>
                )
              })}
            </div>

            {ofertaSel ? (
              <div className="border-hairline bg-canvas flex flex-wrap items-center justify-between gap-2 rounded-[8px] border px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-ink/70">
                    💱 Tasa de la cotización de <strong>{nombre(ofertaSel)}</strong>:
                  </span>
                  <Chip tone={tasaSel.tipo === 'EUR_BCV' ? 'warning' : 'royal'}>
                    {tasaSel.info.icono} {tasaSel.info.larga}
                    {tasaSel.tasaBs > 0 ? ` · ${moneyBs(tasaSel.tasaBs)}` : ''}
                  </Chip>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      ['USD_BCV', '💵 USD BCV'],
                      ['EUR_BCV', '💶 Euro BCV'],
                      ['USDT', '🪙 USDT'],
                    ] as const
                  ).map(([t, lbl]) => (
                    <button
                      key={t}
                      type="button"
                      disabled={guardarOferta.isPending || tasaSel.tipo === t}
                      onClick={() => void cambiarTasaRapido(ofertaSel, t)}
                      className={cn(
                        'rounded border px-2 py-1 text-[11px] font-semibold transition-colors',
                        tasaSel.tipo === t
                          ? 'border-royal-600 bg-royal-600/15 text-royal-700 dark:text-royal-300 cursor-default'
                          : 'border-hairline bg-surface text-ink/75 hover:border-royal-600/50 hover:text-ink cursor-pointer',
                      )}
                      title={`Cambiar tasa de esta cotización a ${lbl}`}
                    >
                      {tasaSel.tipo === t ? `✓ ${lbl}` : lbl}
                    </button>
                  ))}
                  {onEditarOferta ? (
                    <Button size="sm" variant="ghost" onClick={() => onEditarOferta(ofertaSel)}>
                      ✎ Editar oferta
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

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
                    { valor: 'bs', etiqueta: `💵 Bs al cambio (${tasaSel.info.corta})`, pista: cotizoBs(ofertaSel) ? undefined : 'Este proveedor no cotizó en Bs' },
                    { valor: 'usd', etiqueta: '💲 Directo en divisa ($)' },
                  ]}
                />
                {mod === 'usd' ? (
                  <span className="text-ink/55 text-xs">Se usa el precio USD de cada producto; igual se muestra el equivalente en Bs ({tasaSel.info.corta}).</span>
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
              {(() => {
                const filasVisibles = opItems.filter(
                  (it) =>
                    !soloConPrecio ||
                    !ofertaSel ||
                    asign.get(it.sku) === ofertaSel.id ||
                    precioEn(ofertaSel, it.sku, 'bs') > 0 ||
                    precioEn(ofertaSel, it.sku, 'usd') > 0,
                )
                const sumaVisible = filasVisibles.reduce((acc, it) => {
                  const p = ofertaSel ? precioEn(ofertaSel, it.sku, mod) : 0
                  const fila = ofertaSel ? filaDe(ofertaSel, it.sku) : undefined
                  const cant = Number(fila?.cantidad) || Number(it.cantidad) || 0
                  return acc + (p > 0 ? r2(cant * p) : 0)
                }, 0)
                return (
                  <table className="w-full min-w-[860px] text-[0.84rem]">
                    <thead className="text-ink/60 text-left text-xs">
                      <tr className="bg-ink/4 border-hairline border-b">
                        <th className="w-10 px-2.5 py-2" rowSpan={2} />
                        <th className="px-2.5 py-2" rowSpan={2}>
                          Producto
                        </th>
                        <th className="px-2.5 py-2 text-right whitespace-nowrap" rowSpan={2}>
                          Cant.
                        </th>
                        <th
                          className="border-hairline bg-ink/[0.03] border-l px-3 py-1.5 text-center font-semibold whitespace-nowrap"
                          colSpan={2}
                        >
                          Precio unitario · {mod === 'usd' ? 'Divisa $' : tasaSel.info.corta}
                        </th>
                        <th
                          className="border-hairline bg-royal-600/[0.06] border-l px-3 py-1.5 text-center font-semibold whitespace-nowrap"
                          colSpan={2}
                        >
                          Subtotal · {mod === 'usd' ? 'Divisa $' : tasaSel.info.corta}
                        </th>
                        <th className="border-hairline border-l px-3 py-2 whitespace-nowrap" rowSpan={2}>
                          Asignación
                        </th>
                      </tr>
                      <tr className="bg-ink/[0.02] text-[11px]">
                        <th className="border-hairline bg-ink/[0.03] border-l px-3 py-1 text-right font-medium whitespace-nowrap">
                          Monto ($)
                        </th>
                        <th className="bg-ink/[0.03] px-3 py-1 text-right font-medium whitespace-nowrap">En Bs</th>
                        <th className="border-hairline bg-royal-600/[0.06] border-l px-3 py-1 text-right font-medium whitespace-nowrap">
                          Monto ($)
                        </th>
                        <th className="bg-royal-600/[0.06] px-3 py-1 text-right font-medium whitespace-nowrap">En Bs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filasVisibles.map((it) => {
                        const bloqueado = tomados.has(it.sku)
                        const asignadoA = asign.get(it.sku)
                        const aOtro = asignadoA != null && asignadoA !== ofertaSel?.id
                        const precio = ofertaSel ? precioEn(ofertaSel, it.sku, mod) : 0
                        const otra = ofertaSel ? precioEn(ofertaSel, it.sku, mod === 'usd' ? 'bs' : 'usd') : 0
                        const fila = ofertaSel ? filaDe(ofertaSel, it.sku) : undefined
                        const cant = Number(fila?.cantidad) || Number(it.cantidad) || 0
                        const subMonto = r2(cant * precio)
                        return (
                          <tr key={it.sku} className={cn('border-hairline border-t align-middle', bloqueado && 'opacity-65')}>
                            <td className="px-2.5 py-2">
                              <input
                                type="checkbox"
                                className="accent-royal-600 size-4"
                                disabled={bloqueado || precio <= 0 || aOtro || !ofertaSel}
                                title={precio <= 0 ? 'Este proveedor no cotizó el producto' : undefined}
                                checked={!!ofertaSel && asignadoA === ofertaSel.id}
                                onChange={(e) => toggle(it.sku, e.target.checked)}
                              />
                            </td>
                            <td className="px-2.5 py-2">
                              <span className="font-medium">{it.nombre}</span>
                              <span className="text-ink/45 font-mono text-xs"> · {it.sku}</span>
                            </td>
                            <td className="px-2.5 py-2 text-right font-mono whitespace-nowrap tabular-nums">
                              {fmtCant(cant)} <span className="text-ink/50 font-sans text-xs">{it.unidad ?? ''}</span>
                            </td>
                            <td className="border-hairline bg-ink/[0.015] border-l px-3 py-2 text-right font-mono whitespace-nowrap tabular-nums">
                              {precio > 0 ? (
                                <>
                                  <div>{mod === 'usd' ? money(precio) : tasaSel.enDivisa(precio)}</div>
                                  {otra > 0 && Math.abs(otra - precio) > 0.001 ? (
                                    <div className="text-ink/45 text-[0.7rem]">
                                      {mod === 'usd' ? `${tasaSel.enDivisa(otra)} · ${tasaSel.info.corta}` : `${money(otra)} · divisa`}
                                    </div>
                                  ) : null}
                                </>
                              ) : (
                                <span className="text-ink/45 font-sans">no cotizó</span>
                              )}
                            </td>
                            <td className="bg-ink/[0.015] text-royal-700 dark:text-royal-300 px-3 py-2 text-right font-mono text-[0.8rem] font-medium whitespace-nowrap tabular-nums">
                              {precio > 0 && tasaSel.tasaBs > 0 ? tasaSel.enBs(precio) : '—'}
                            </td>
                            <td className="border-hairline bg-royal-600/[0.03] border-l px-3 py-2 text-right font-mono font-semibold whitespace-nowrap tabular-nums">
                              {precio > 0 ? (mod === 'usd' ? money(subMonto) : tasaSel.enDivisa(subMonto)) : '—'}
                            </td>
                            <td className="bg-royal-600/[0.03] text-royal-700 dark:text-royal-300 px-3 py-2 text-right font-mono text-[0.8rem] font-semibold whitespace-nowrap tabular-nums">
                              {precio > 0 && tasaSel.tasaBs > 0 ? tasaSel.enBs(subMonto) : '—'}
                            </td>
                            <td className="border-hairline border-l px-3 py-2 whitespace-nowrap">
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
                    {sumaVisible > 0 ? (
                      <tfoot>
                        <tr className="border-hairline bg-ink/4 border-t text-xs font-semibold">
                          <td colSpan={5} className="px-3 py-2 text-right">
                            SUBTOTAL COTIZADO ({tasaSel.info.corta})
                          </td>
                          <td className="border-hairline border-l px-3 py-2 text-right font-mono whitespace-nowrap tabular-nums">
                            {mod === 'usd' ? money(sumaVisible) : tasaSel.enDivisa(sumaVisible)}
                          </td>
                          <td className="text-royal-700 dark:text-royal-300 px-3 py-2 text-right font-mono whitespace-nowrap tabular-nums">
                            {tasaSel.tasaBs > 0 ? tasaSel.enBs(sumaVisible) : '—'}
                          </td>
                          <td className="border-hairline border-l" />
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                )
              })()}
            </div>

            <Card>
              <div className="text-ink/85 mb-1 font-semibold">Resumen de la asignación</div>
              {!resumen.length ? (
                <p className="text-ink/55">Todavía no asignaste productos en esta sesión.</p>
              ) : (
                <ul className="space-y-1">
                  {resumen.map((r) => {
                    const tr = resolverTasaOferta(r.o, tasas)
                    return (
                      <li key={r.o.id}>
                        <strong>{nombre(r.o)}</strong>{' '}
                        <span className="text-ink/55 text-xs">({tr.info.icono} {tr.info.corta})</span>: {r.skus.length} producto(s) ·{' '}
                        <strong className="font-mono">{r.mod === 'usd' ? money(r.total) : tr.enDivisa(r.total)}</strong>
                        {tr.tasaBs > 0 ? (
                          <strong className="text-royal-700 dark:text-royal-300 ml-1.5 font-mono">· {tr.enBs(r.total)}</strong>
                        ) : null}
                        {r.rec.iva || r.rec.igtf || r.rec.ajuste ? (
                          <span className="text-ink/55">
                            {' '}
                            (base {r.mod === 'usd' ? money(r.rec.subtotalUsd) : tr.enDivisa(r.rec.subtotalBcv || r.rec.subtotalUsd)} · IVA{' '}
                            {tr.enDivisa(r.rec.iva)} · IGTF {tr.enDivisa(r.rec.igtf)} · ajuste {tr.enDivisa(r.rec.ajuste)})
                          </span>
                        ) : null}
                      </li>
                    )
                  })}
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
