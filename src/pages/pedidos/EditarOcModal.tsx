import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { cn } from '@/lib/cn'
import { useArticulos, type Proveedor } from '@/lib/api/catalogo'
import { useEditarOc, useUnidadesSolicitantes, type Orden } from '@/lib/api/pedidos'
import { money } from '@/lib/pedidos'
import { CONDICIONES_PAGO, parseMontoEs, r2, r4, totalDesdePartes } from '@/lib/ofertas'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'

/*
  «✎ EDITAR OC (TODO)» / «✎ MODIFICAR OC» (MGG `EditarOcModal`, `actualizarOc`)

  - Por aprobar («Ordenes pendiente por aprobar») se corrige todo: la
    solicitud (unidad, persona, motivo, finalidad, urgente), el proveedor, los
    productos (marca, cantidad, precio), el descuento, el IVA, el IGTF, el
    ajuste, la condición y la nota.
  - En «Confirmada (indicar método de pago)», un cambio de productos,
    cantidades, precios, proveedor, condición o descuento la devuelve a
    aprobación; la nota y los nombres se guardan sin reabrirla.
*/

const CAMPO = 'rounded-control border-ink/20 bg-surface h-9 w-full min-w-0 border px-2 text-sm'

interface FilaOc {
  sku: string
  nombre: string
  unidad: string
  marca: string
  modelo: string
  finalidad: string
  cantidad: string
  precio: string
  articulo_id: number | null
}

export function EditarOcModal({
  orden: o,
  proveedores,
  onClose,
  onDone,
}: {
  orden: Orden
  proveedores: Proveedor[]
  onClose: () => void
  onDone: () => void
}) {
  const editar = useEditarOc()
  const todo = o.estado === 'oc_creada'
  const { data: articulos } = useArticulos()
  const { data: unidades } = useUnidadesSolicitantes()

  const [unidad, setUnidad] = useState(o.unidad_solicitante ?? '')
  const [persona, setPersona] = useState(o.solicitante_nombre ?? '')
  const [motivo, setMotivo] = useState(o.motivo ?? '')
  const [finalidad, setFinalidad] = useState(o.finalidad ?? '')
  const [urgente, setUrgente] = useState(o.urgente)
  const [provId, setProvId] = useState(o.proveedor_id ? String(o.proveedor_id) : '')
  const [filas, setFilas] = useState<FilaOc[]>(() =>
    o.items
      .filter((i) => i.comprar !== false)
      .map((i) => ({
        sku: i.sku,
        nombre: i.nombre,
        unidad: i.unidad_compra ?? i.unidad ?? '',
        marca: i.marca ?? '',
        modelo: i.modelo ?? '',
        finalidad: i.finalidad ?? '',
        cantidad: String(i.cantidad ?? ''),
        precio: String(i.precio ?? ''),
        articulo_id: null,
      })),
  )
  const [descuento, setDescuento] = useState(Number(o.descuento_obtenido) ? String(o.descuento_obtenido) : '')
  const [iva, setIva] = useState(Number(o.iva) ? String(o.iva) : '')
  const [ivaIncluido, setIvaIncluido] = useState(o.iva_incluido)
  const [igtf, setIgtf] = useState(Number(o.igtf) ? String(o.igtf) : '')
  const [ajuste, setAjuste] = useState(Number(o.ajuste) ? String(o.ajuste) : '')
  const [ajusteMotivo, setAjusteMotivo] = useState(o.ajuste_motivo ?? '')
  const [condicion, setCondicion] = useState(o.condiciones_pago ?? '')
  const [notas, setNotas] = useState(o.notas ?? '')
  const [agregarArt, setAgregarArt] = useState('')

  const subtotal = r2(filas.reduce((a, f) => a + parseMontoEs(f.cantidad) * r4(parseMontoEs(f.precio)), 0))
  const desc = Math.max(0, r2(parseMontoEs(descuento)))
  const ivaN = Math.max(0, r2(parseMontoEs(iva)))
  const igtfN = Math.max(0, r2(parseMontoEs(igtf)))
  const ajN = r2(parseMontoEs(ajuste))
  const total = totalDesdePartes({ subtotal, descuento: desc, iva: ivaN, igtf: igtfN, iva_incluido: ivaIncluido && ivaN > 0, ajuste: ajN })
  const cambiaProv = provId !== (o.proveedor_id ? String(o.proveedor_id) : '')

  const opcionesProv = useMemo(
    () =>
      proveedores
        .filter((p) => p.activo || p.id === o.proveedor_id)
        .map((p) => ({ valor: String(p.id), etiqueta: `${p.nombre} (${p.rif})` })),
    [proveedores, o.proveedor_id],
  )
  const opcionesArt = useMemo(
    () =>
      (articulos ?? [])
        .filter((a) => !filas.some((f) => f.sku === a.codigo))
        .map((a) => ({ valor: String(a.id), codigo: a.codigo, nombre: a.nombre, detalle: a.unidad })),
    [articulos, filas],
  )

  const setFila = (sku: string, c: Partial<FilaOc>) => setFilas((fs) => fs.map((f) => (f.sku === sku ? { ...f, ...c } : f)))

  function agregar() {
    const a = articulos?.find((x) => String(x.id) === agregarArt)
    if (!a) return
    setFilas((fs) => [
      ...fs,
      { sku: a.codigo, nombre: a.nombre, unidad: a.unidad, marca: '', modelo: '', finalidad: '', cantidad: '1', precio: '0', articulo_id: a.id },
    ])
    setAgregarArt('')
    toast(`"${a.nombre}" (${a.codigo}) agregado`, 'success')
  }

  async function guardar() {
    if (!filas.length) {
      toast('La OC debe tener al menos un producto.', 'error')
      return
    }
    try {
      const r = await editar.mutateAsync({
        id: o.id,
        datos: {
          items: filas.map((f) => ({
            sku: f.sku,
            nombre: f.nombre,
            cantidad: parseMontoEs(f.cantidad),
            precio: r4(parseMontoEs(f.precio)),
            marca: f.marca.trim() || null,
            modelo: f.modelo.trim() || null,
            finalidad: f.finalidad.trim() || null,
            articulo_id: f.articulo_id,
          })),
          proveedor_id: provId ? Number(provId) : null,
          condiciones_pago: condicion || null,
          notas: notas.trim() || null,
          descuento: desc || null,
          ...(todo
            ? {
                iva: ivaN || null,
                igtf: igtfN || null,
                iva_incluido: ivaIncluido && ivaN > 0,
                ajuste: ajN || null,
                ajuste_motivo: ajN ? ajusteMotivo.trim() || null : null,
                unidad_solicitante: unidad.trim() || null,
                solicitante_nombre: persona.trim() || null,
                motivo: motivo.trim() || null,
                finalidad: finalidad.trim() || null,
                urgente,
              }
            : {}),
        },
      })
      if (r.sin_cambios) {
        toast('Sin cambios que guardar', 'info')
        onClose()
        return
      }
      toast(r.reabierta ? 'OC actualizada · vuelve a aprobación' : 'OC actualizada', 'success')
      onDone()
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo guardar la OC'), 'error')
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onClose}
      titulo={`Editar OC ${o.oc_codigo ?? o.codigo}`}
      ancho="xl"
      acciones={
        <>
          <Button variant="ghost" onClick={onClose} disabled={editar.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={editar.isPending}>
            {editar.isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-ink/65">
          {todo
            ? 'Antes de aprobarla se corrige todo: unidad y persona que solicita, motivo, finalidad, proveedor, productos (marca, cantidad, precio), descuento, IVA e IGTF, condición y nota.'
            : 'La OC ya está confirmada: si cambiás productos, cantidades, precios, proveedor, condición o descuento, vuelve a aprobación. La nota y los nombres se guardan sin reabrirla.'}
        </p>

        {todo ? (
          <div className="border-hairline grid gap-3 rounded-[8px] border p-3 sm:grid-cols-2">
            <div className="text-ink/85 font-semibold sm:col-span-2">Solicitud</div>
            <div>
              <Input label="Unidad solicitante" list="unidades-oc" value={unidad} onChange={(e) => setUnidad(e.target.value)} />
              <datalist id="unidades-oc">
                {(unidades ?? []).map((u) => (
                  <option key={u.id} value={u.nombre} />
                ))}
              </datalist>
            </div>
            <Input label="Persona que solicita" value={persona} onChange={(e) => setPersona(e.target.value)} />
            <Input label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            <Input label="Finalidad" value={finalidad} onChange={(e) => setFinalidad(e.target.value)} />
            <label className={cn('inline-flex items-center gap-2 font-semibold sm:col-span-2', urgente && 'text-danger')}>
              <input type="checkbox" className="accent-danger size-4" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} />
              🚨 ORDEN: URGENTE
            </label>
          </div>
        ) : null}

        <div>
          <SelectBuscable label="Proveedor" opciones={opcionesProv} valor={provId} onCambio={setProvId} vacio="Buscar proveedor…" />
          {cambiaProv ? (
            <p className="text-warning mt-1 text-xs">⚠ Cambiás el proveedor: la OC vuelve a aprobación.</p>
          ) : null}
        </div>

        <div className="border-hairline overflow-x-auto rounded-[6px] border">
          <table className="w-full min-w-[820px] text-xs">
            <thead className="bg-ink/4 text-ink/55 text-left">
              <tr>
                <th className="px-2 py-1.5">Producto</th>
                {todo ? (
                  <>
                    <th className="px-2 py-1.5">Marca</th>
                    <th className="px-2 py-1.5">Modelo</th>
                    <th className="px-2 py-1.5">Finalidad</th>
                  </>
                ) : null}
                <th className="px-2 py-1.5 text-right">Cantidad</th>
                <th className="px-2 py-1.5 text-right">Precio unit.</th>
                <th className="px-2 py-1.5 text-right">Subtotal</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.sku} className="border-hairline border-t">
                  <td className="px-2 py-1">
                    <input
                      className={CAMPO}
                      value={f.nombre}
                      onChange={(e) => setFila(f.sku, { nombre: e.target.value.toUpperCase() })}
                      aria-label="Producto"
                    />
                  </td>
                  {todo ? (
                    <>
                      <td className="w-28 px-2 py-1">
                        <input className={CAMPO} value={f.marca} onChange={(e) => setFila(f.sku, { marca: e.target.value.toUpperCase() })} aria-label="Marca" />
                      </td>
                      <td className="w-28 px-2 py-1">
                        <input className={CAMPO} value={f.modelo} onChange={(e) => setFila(f.sku, { modelo: e.target.value.toUpperCase() })} aria-label="Modelo" />
                      </td>
                      <td className="w-36 px-2 py-1">
                        <input
                          className={CAMPO}
                          value={f.finalidad}
                          onChange={(e) => setFila(f.sku, { finalidad: e.target.value.toUpperCase() })}
                          aria-label="Finalidad"
                        />
                      </td>
                    </>
                  ) : null}
                  <td className="w-28 px-2 py-1">
                    <div className="flex items-center gap-1">
                      <input
                        className={cn(CAMPO, 'text-right')}
                        inputMode="decimal"
                        value={f.cantidad}
                        onChange={(e) => setFila(f.sku, { cantidad: e.target.value })}
                        aria-label="Cantidad"
                      />
                      <span className="text-ink/45">{f.unidad}</span>
                    </div>
                  </td>
                  <td className="w-28 px-2 py-1">
                    <input
                      className={cn(CAMPO, 'text-right')}
                      inputMode="decimal"
                      value={f.precio}
                      onChange={(e) => setFila(f.sku, { precio: e.target.value })}
                      aria-label="Precio unitario"
                    />
                  </td>
                  <td className="px-2 py-1 text-right font-mono">{money(parseMontoEs(f.cantidad) * parseMontoEs(f.precio))}</td>
                  <td className="px-2 py-1">
                    <Button size="sm" variant="ghost" className="text-danger" title="Quitar este producto" onClick={() => setFilas((fs) => fs.filter((x) => x.sku !== f.sku))}>
                      ✕
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-xs">
              {[
                ['Subtotal', money(subtotal)],
                desc ? ['Descuento', `−${money(desc)}`] : null,
                ivaN ? [ivaIncluido ? 'IVA (incluido en los precios)' : 'IVA', money(ivaN)] : null,
                igtfN ? ['IGTF', money(igtfN)] : null,
                ajN ? [ajusteMotivo ? `Ajuste · ${ajusteMotivo}` : 'Ajuste', money(ajN)] : null,
              ]
                .filter((x): x is string[] => !!x)
                .map(([k, v]) => (
                  <tr key={k} className="border-hairline border-t">
                    <td colSpan={todo ? 6 : 3} className="px-2 py-1 text-right">
                      {k}
                    </td>
                    <td className="px-2 py-1 text-right font-mono">{v}</td>
                    <td />
                  </tr>
                ))}
              <tr className="border-hairline border-t font-semibold">
                <td colSpan={todo ? 6 : 3} className="px-2 py-1 text-right">
                  Total
                </td>
                <td className="px-2 py-1 text-right font-mono">{money(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[18rem] flex-1">
            <SelectBuscable
              label="Agregar producto"
              opciones={opcionesArt}
              valor={agregarArt}
              onCambio={setAgregarArt}
              vacio="Buscar producto del inventario…"
            />
          </div>
          <Button variant="outline" disabled={!agregarArt} onClick={agregar}>
            ＋ Agregar
          </Button>
          <p className="text-ink/50 w-full text-xs">
            El precio viene en 0: ajustalo en la tabla. Agregar o quitar productos deja la OC en aprobación.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Descuento obtenido (opcional)" type="number" placeholder="0,00" value={descuento} onChange={(e) => setDescuento(e.target.value)} />
          {todo ? (
            <>
              <div>
                <Input label="IVA (monto)" type="number" placeholder="0,00" value={iva} onChange={(e) => setIva(e.target.value)} />
                <div className="mt-1 flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIva(String(r2(((ivaIncluido ? subtotal : Math.max(0, subtotal - desc)) * 16) / (ivaIncluido ? 116 : 100))))}
                  >
                    16 %
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setIva('')}>
                    Quitar
                  </Button>
                </div>
                <label className="mt-1 inline-flex items-center gap-2 text-xs">
                  <input type="checkbox" className="accent-royal-600 size-4" checked={ivaIncluido} onChange={(e) => setIvaIncluido(e.target.checked)} />
                  Los precios ya traen el IVA (factura de punto de venta)
                </label>
              </div>
              <div>
                <Input label="IGTF (monto)" type="number" placeholder="0,00" value={igtf} onChange={(e) => setIgtf(e.target.value)} />
                <div className="mt-1 flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setIgtf(String(r2((Math.max(0, subtotal - desc) * 3) / 100)))}>
                    3 %
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setIgtf('')}>
                    Quitar
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {todo ? (
          <div>
            <div className="text-ink/75 font-medium">Ajuste frente a la factura (opcional, ± con signo)</div>
            <div className="mt-1 flex flex-wrap gap-2">
              <input className={cn(CAMPO, 'w-28')} inputMode="decimal" placeholder="0,00" value={ajuste} onChange={(e) => setAjuste(e.target.value)} aria-label="Ajuste" />
              <input
                className={cn(CAMPO, 'min-w-[16rem] flex-1')}
                maxLength={120}
                placeholder="Motivo (p. ej. redondeo de precios unitarios de la factura N.º …)"
                value={ajusteMotivo}
                onChange={(e) => setAjusteMotivo(e.target.value)}
                aria-label="Motivo del ajuste"
              />
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-ink/75 mb-1.5 block font-medium">Condición de pago</span>
            <select className={cn(CAMPO, 'h-10')} value={condicion} onChange={(e) => setCondicion(e.target.value)}>
              <option value="">— sin especificar —</option>
              {CONDICIONES_PAGO.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <Textarea label="Nota" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}
