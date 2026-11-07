import { useMemo, useState, type ChangeEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Textarea } from '@/components/ui/Textarea'
import { cn } from '@/lib/cn'
import { subirAdjuntosOferta, useAceptarOferta, type Orden } from '@/lib/api/pedidos'
import { fmtCant, money } from '@/lib/pedidos'
import {
  agruparVariantes,
  hayVariantes,
  infoModalidad,
  precioRenglon,
  r2,
  recortarOferta,
  skusTomados,
  type Modalidad,
  type ScoredOferta,
} from '@/lib/ofertas'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'

/*
  «ELEGIR OFERTA» (MGG `AceptarOfertaModal.tsx`)

  Se tildan los productos que se le compran a este proveedor (lo destildado
  queda pendiente en la OP madre para otro), se elige la marca cuando cotizó
  varias, y cómo se paga: en $ (divisa, a su precio efectivo) o en Bs al
  cambio BCV. El resumen es el monto exacto que tendrá la OC; la base lo
  vuelve a calcular al guardar.

  Lo que no está: «📍 ¿A dónde se entrega?» (Los Pinos / Matanza en MGG). Aquí
  todo llega al almacén general (fase 1), así que no hay nada que elegir.
*/
export function AceptarOfertaModal({
  orden,
  madre,
  hijas,
  scored,
  proveedorNombre,
  onClose,
  onDone,
}: {
  orden: Orden
  madre: Orden
  hijas: Orden[]
  scored: ScoredOferta
  proveedorNombre: string
  onClose: () => void
  onDone: () => void
}) {
  const oferta = scored.oferta
  const aceptar = useAceptarOferta()
  const esHija = !!orden.parent_orden_id

  // Lo que se puede tildar: lo pendiente (o lo de la sub-OC) y lo que el proveedor agregó.
  const tomados = useMemo(() => (esHija ? new Set<string>() : skusTomados(hijas)), [esHija, hijas])
  const disponibles = useMemo(() => {
    const base = new Set((esHija ? orden.items : madre.items).filter((i) => i.comprar !== false).map((i) => i.sku))
    return new Set(oferta.items.filter((i) => (base.has(i.sku) || i.agregado) && !tomados.has(i.sku)).map((i) => i.sku))
  }, [esHija, orden.items, madre.items, oferta.items, tomados])

  const grupos = useMemo(() => {
    const conIndice = oferta.items.map((it, idx) => ({ ...it, idx }))
    return agruparVariantes(conIndice)
  }, [oferta.items])

  const [incluidos, setIncluidos] = useState<Set<string>>(() => new Set(disponibles))
  const [marca, setMarca] = useState<Map<string, number>>(() => {
    const m = new Map<string, number>()
    for (const g of grupos) {
      const conPrecio = g.find((r) => precioRenglon(r) > 0) ?? g[0]
      m.set(g[0].sku, conPrecio.idx)
    }
    return m
  })

  const seleccion = useMemo(() => {
    const m = new Map<string, number | null>()
    for (const sku of incluidos) m.set(sku, marca.get(sku) ?? null)
    return m
  }, [incluidos, marca])
  const rec = useMemo(() => recortarOferta(oferta, seleccion), [oferta, seleccion])

  const hayBs = rec.filas.some((f) => Number(f.precio) > 0)
  const hayUsd = rec.todoUsd
  const [modalidadElegida, setModalidad] = useState<Modalidad>(() =>
    oferta.items.some((i) => Number(i.precio_usd) > 0) ? 'usd' : 'bs',
  )
  // Si solo hay una moneda, se fuerza esa.
  const modalidad: Modalidad = !hayUsd ? 'bs' : !hayBs ? 'usd' : modalidadElegida
  const final = modalidad === 'usd' ? rec.totalUsd : rec.totalBs
  const ahorro = hayUsd ? r2(rec.totalBs - rec.totalUsd) : 0

  const [motivo, setMotivo] = useState('')
  const [archivos, setArchivos] = useState<File[]>([])

  const yaComprados = oferta.items.filter((i) => tomados.has(i.sku))
  const destildados = [...disponibles].filter((s) => !incluidos.has(s))
  const variantes = hayVariantes(oferta.items)

  function elegirArchivos(e: ChangeEvent<HTMLInputElement>) {
    const lista = Array.from(e.target.files ?? []).filter(
      (f) => (f.type === 'application/pdf' || f.type.startsWith('image/')) && f.size <= 10 * 1024 * 1024,
    )
    e.target.value = ''
    setArchivos((a) => [...a, ...lista])
  }

  async function confirmar() {
    if (!rec.filas.length || final <= 0) {
      toast('Cargá al menos un precio: las marcas elegidas están en $0.', 'error')
      return
    }
    try {
      const adjuntos = archivos.length ? await subirAdjuntosOferta(madre.id, 'motivo', archivos) : []
      await aceptar.mutateAsync({
        ordenId: orden.id,
        ofertaId: oferta.id,
        seleccion: [...seleccion.entries()].map(([sku, idx]) => ({ sku, idx })),
        modalidad,
        motivo: motivo.trim() || null,
        adjuntos,
        score: Math.round(scored.score.total * 10000) / 10000,
      })
      toast(
        `Oferta elegida · ${modalidad === 'usd' ? 'pago en $ (divisa)' : 'pago en Bs (BCV)'} · pendiente por aprobación`,
        'success',
      )
      onDone()
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo elegir la oferta'), 'error')
    }
  }

  const sinSeleccion = incluidos.size === 0
  const n = incluidos.size

  return (
    <Modal
      abierto
      onCerrar={onClose}
      titulo={`Elegir oferta · ${proveedorNombre}`}
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onClose} disabled={aceptar.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => void confirmar()}
            disabled={aceptar.isPending || sinSeleccion || final <= 0}
            title={sinSeleccion ? 'Tildá al menos un producto para comprarle a este proveedor' : undefined}
          >
            {aceptar.isPending ? 'Eligiendo…' : `Elegir oferta · ${n} producto(s) · Pagar ${money(final)}`}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-ink/70">
          {variantes
            ? 'Este proveedor cotizó algún producto en varias marcas. Elegí cuál marca se compra de cada uno (no se compran todas). Se muestran los precios en Bs (BCV) y en $ (USD).'
            : 'Revisá los productos, marcas y precios (Bs y $). Al confirmar, la orden queda pendiente por aprobación.'}
        </p>
        <p className="text-ink/70">
          ☑ Tildá los productos que le comprás <strong>a este proveedor</strong>. Si alguno lo vas a comprar a otro,{' '}
          <strong>destildalo</strong>: queda pendiente y se asigna aparte desde la OP.
        </p>
        {yaComprados.length ? (
          <p className="text-ink/70">
            🧩 <strong>{new Set(yaComprados.map((i) => i.sku)).size}</strong> producto(s) de esta oferta ya se le compraron a
            otro proveedor: salen <strong>en gris</strong> y no se pueden marcar. Solo se compra —y se cobra— lo que queda
            pendiente.
          </p>
        ) : null}
        {destildados.length ? (
          <p className="text-warning">
            ⚠ <strong>{destildados.length}</strong> producto(s) destildado(s): <strong>no</strong> se le compran a este
            proveedor y quedan <strong>pendientes por asignar</strong> en la OP madre.
          </p>
        ) : null}
        <p className="text-ink/55 text-xs">📍 Se entrega en el Almacén General.</p>

        {/* Tarjetas por producto */}
        <div className="space-y-2">
          {grupos.map((g) => {
            const sku = g[0].sku
            const comprado = tomados.has(sku)
            const disponible = disponibles.has(sku)
            const incluido = incluidos.has(sku)
            return (
              <div
                key={sku}
                className={cn('border-hairline rounded-[8px] border p-2', (comprado || !disponible) && 'opacity-50', !incluido && disponible && 'opacity-60')}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="accent-royal-600 size-4"
                      disabled={comprado || !disponible}
                      checked={incluido}
                      title="Se le compra a este proveedor · destildá para comprarlo a otro"
                      onChange={(e) =>
                        setIncluidos((s) => {
                          const x = new Set(s)
                          if (e.target.checked) x.add(sku)
                          else x.delete(sku)
                          return x
                        })
                      }
                    />
                    <span className={cn('font-medium', !incluido && 'line-through')}>{g[0].nombre}</span>
                    <span className="text-ink/45 font-mono text-xs">· {sku}</span>
                  </label>
                  {comprado ? (
                    <Chip>✓ Ya comprado a otro proveedor</Chip>
                  ) : !incluido && disponible ? (
                    <Chip tone="warning">Queda pendiente · se compra a otro</Chip>
                  ) : g.length > 1 ? (
                    <Chip tone="warning">{g.length} marcas · elegí una</Chip>
                  ) : (
                    <span className="text-ink/45 text-xs">marca única</span>
                  )}
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {g.map((r) => {
                    const sel = marca.get(sku) === r.idx
                    const c = Number(r.cantidad) || 0
                    const p = Number(r.precio) || 0
                    const pu = Number(r.precio_usd) || 0
                    return (
                      <label
                        key={r.idx}
                        className={cn(
                          'cursor-pointer rounded-[8px] border p-2 text-xs',
                          sel ? 'border-royal-600 bg-royal-600/8' : 'border-hairline',
                        )}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          name={`marca-${sku}`}
                          checked={sel}
                          disabled={comprado || !disponible}
                          onChange={() => setMarca((m) => new Map(m).set(sku, r.idx))}
                        />
                        <div className="font-semibold">{[r.marca, r.modelo].filter(Boolean).join(' · ') || 'Sin marca'}</div>
                        <div className="text-ink/55">
                          Cantidad: {fmtCant(c)} {r.unidad_compra ?? r.unidad ?? ''}
                        </div>
                        <div>
                          $ BCV: <strong>{p ? money(p) : '—'}</strong>
                        </div>
                        <div className="text-success">
                          $ efectivo: <strong>{pu ? money(pu) : '—'}</strong>
                        </div>
                        <div className="text-ink/55">
                          Total: {p ? money(c * p) : '—'} · {pu ? money(c * pu) : '—'}
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* ¿Cómo se va a pagar? */}
        <div className="border-l-royal-600 border-hairline rounded-[8px] border border-l-4 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong>🪙 ¿Cómo se va a pagar esta compra?</strong>
            <span
              className={cn(
                'rounded px-2 py-0.5 text-xs font-semibold',
                modalidad === 'usd' ? 'bg-success text-white' : 'bg-info/15 text-info',
              )}
            >
              ✓ Seleccionado: {infoModalidad(modalidad).larga}
            </span>
          </div>
          <p className="text-ink/55 mt-1 text-xs">
            Indicá la opción que acordaste con el proveedor. Evita confusiones cuando la cotización muestra un monto en Bs y otro
            en dólares: la OC y el monto a pagar se generarán con la opción que marques aquí.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={!hayUsd}
              onClick={() => setModalidad('usd')}
              className={cn(
                'rounded-[8px] border p-2 text-left',
                modalidad === 'usd' ? 'border-success border-2 bg-[rgba(16,185,129,.10)]' : 'border-hairline',
                !hayUsd && 'cursor-not-allowed opacity-50',
              )}
            >
              <div className="text-success font-semibold">Pagar en $ (USD / Divisa)</div>
              {hayUsd ? (
                <>
                  <div className="font-mono text-lg font-semibold">{money(rec.totalUsd)}</div>
                  <div className="text-ink/55 text-xs">
                    Base {money(rec.subtotalUsd)} + imp. {money(r2(rec.totalUsd - Math.max(0, rec.subtotalUsd - rec.descuento) - rec.ajuste))}
                  </div>
                  {ahorro > 0 ? (
                    <Chip tone="success">
                      −{money(ahorro)} ({Math.round((ahorro / (rec.totalBs || 1)) * 100)}%)
                    </Chip>
                  ) : null}
                </>
              ) : (
                <div className="text-ink/55 text-xs">Esta oferta no cotizó precio en USD</div>
              )}
            </button>
            <button
              type="button"
              disabled={!hayBs}
              onClick={() => setModalidad('bs')}
              className={cn(
                'rounded-[8px] border p-2 text-left',
                modalidad === 'bs' ? 'border-info border-2 bg-[rgba(59,130,246,.10)]' : 'border-hairline',
                !hayBs && 'cursor-not-allowed opacity-50',
              )}
            >
              <div className="text-info font-semibold">Pagar en Bs al cambio (tasa BCV)</div>
              {hayBs ? (
                <>
                  <div className="font-mono text-lg font-semibold">{money(rec.totalBs)}</div>
                  <div className="text-ink/55 text-xs">
                    Base {money(r2(rec.filas.reduce((a, f) => a + (Number(f.cantidad) || 0) * precioRenglon(f), 0)))} + imp.{' '}
                    {money(r2((rec.iva && !oferta.iva_incluido ? rec.iva : 0) + rec.igtf))}
                  </div>
                </>
              ) : (
                <div className="text-ink/55 text-xs">Esta oferta no cotizó precio en Bs</div>
              )}
            </button>
          </div>
        </div>

        {/* Observación */}
        <div>
          <Textarea
            label="📝 Observación · ¿por qué elegís esta oferta? (opcional)"
            placeholder="Ej.: mejor precio en efectivo, entrega inmediata, único con stock, calidad comprobada…"
            rows={2}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <p className="text-ink/50 mt-1 text-xs">
            Lo verá <strong>quien aprueba</strong> la OC.
          </p>
          <label className="text-ink/75 mt-2 block text-xs font-medium">
            📎 Adjuntar imágenes / PDF de respaldo (opcional)
            <input type="file" multiple accept="application/pdf,image/*" className="mt-1 block text-xs" onChange={elegirArchivos} />
          </label>
          {archivos.map((f, i) => (
            <div key={`${f.name}-${i}`} className="text-ink/70 text-xs">
              ✓ {f.name} ({Math.round(f.size / 1024)} KB){' '}
              <button type="button" className="text-danger" onClick={() => setArchivos((a) => a.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
          <p className="text-ink/45 text-xs">PDF o imágenes · máximo 10 MB c/u.</p>
        </div>

        {/* Resumen */}
        <div className="border-hairline bg-canvas rounded-[8px] border p-3">
          <div className="font-semibold">💵 Resumen del monto a comprar</div>
          {rec.filas.length && final > 0 ? (
            <>
              {hayBs ? (
                <div className="mt-1">
                  Total cotizado en Bs (BCV): <strong>{money(rec.subtotalBcv)}</strong> · con imp. {money(rec.totalBs)}
                </div>
              ) : null}
              {hayUsd ? (
                <div>
                  Total cotizado en $ (USD): <strong>{money(rec.subtotalUsd)}</strong> · con imp. {money(rec.totalUsd)}
                </div>
              ) : null}
              <div className="mt-1 flex flex-wrap gap-1">
                {rec.descuento ? <Chip tone="success">− desc. {money(rec.descuento)}</Chip> : null}
                {rec.iva ? (
                  oferta.iva_incluido ? (
                    <Chip title="Los precios ya traen el IVA: se guarda para la retención, no se suma">IVA incluido {money(rec.iva)}</Chip>
                  ) : (
                    <Chip>+ IVA {money(rec.iva)}</Chip>
                  )
                ) : null}
                {rec.igtf ? <Chip>+ IGTF {money(rec.igtf)}</Chip> : null}
                {rec.ajuste ? <Chip title={oferta.ajuste_motivo ?? undefined}>± ajuste {money(rec.ajuste)}</Chip> : null}
              </div>
              <div className="mt-2 text-base">
                Total final de la OC a emitir: <strong className="font-mono">{money(final)}</strong>{' '}
                <Chip tone={modalidad === 'usd' ? 'success' : 'info'}>
                  {modalidad === 'usd' ? 'Pago en $ (Divisa)' : 'Pago en Bs a tasa BCV'}
                </Chip>
              </div>
              <p className="text-ink/55 mt-1 text-xs">
                Este es el monto exacto que se registrará en la Orden de Compra y pasará a aprobación.
                {rec.fraccion < 1
                  ? ` Se le compra el ${Math.round(rec.fraccion * 100)}% de esta oferta, así que descuento e impuestos van en esa proporción.`
                  : ''}
              </p>
            </>
          ) : (
            <p className="text-ink/60 mt-1">Las marcas elegidas no tienen precio. Elegí una con precio o cargalo en la oferta.</p>
          )}
        </div>
      </div>
    </Modal>
  )
}
