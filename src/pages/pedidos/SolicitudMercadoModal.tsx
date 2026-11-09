import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, Vacio } from '@/components/ui/Estado'
import { cn } from '@/lib/cn'
import { useArticulos, useCategoriasDeArticulo, type Articulo } from '@/lib/api/catalogo'
import { useExistenciasTotales } from '@/lib/api/inventario'
import { useCrearSolicitudMercado, useUltimaSolicitudMercado } from '@/lib/api/pedidos'
import { FINALIDAD_MERCADO, fechaHoraVE, fmtCant } from '@/lib/pedidos'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { comoNumero } from '@/lib/formato'
import { enMayuscula } from '@/lib/texto'

/*
  «🛒 SOLICITUD DE MERCADO» (MGG `SolicitudMercadoModal`)

  Víveres y artículos de limpieza para la cocina: la lista llega armada —todos
  los productos de las categorías de cocina, marcados, con la cantidad de la
  última Solicitud de Mercado— y se quita lo que no hace falta. Sale como una
  Solicitud de Pedido URGENTE con la finalidad «PEDIDO PARA RESTABLECER EL
  MERCADO».

  Lo que cambia respecto a MGG:
    - PASA POR EL ALMACÉN (la dueña, 09/11/2026): en MGG entra directo a
      Pedidos para aprobación; aquí nace «En revisión de almacén» como
      cualquier SP, el almacenista confirma qué tiene (eso sale del almacén)
      y solo lo que falta pasa a Compras para aprobación.
    - LA LISTA SON LAS CATEGORÍAS «SE CONSUME EN COCINA» del catálogo de La
      Cantera (MGG busca las que se llaman «víveres» u «hortalizas»).
    - SIN «PRODUCTO NUEVO» QUE CREA FICHA: lo que no está en el inventario se
      pide con nombre general, como en la Solicitud de Pedido; Compras le pone
      el nombre de inventario al cotizar.
    - SIN TARJETA DE ALERTAS: en La Cantera no hay `alertas_mercado`; la
      cocina pide el mercado desde Alimentación.
*/

interface Marca {
  check: boolean
  cant: string
}

interface General {
  sku: string
  nombre: string
  cantidad: string
  unidad: string
}

const numero = (s: string) => Number(String(s).replace(',', '.'))

export function SolicitudMercadoModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const articulos = useArticulos()
  const categorias = useCategoriasDeArticulo()
  const existencias = useExistenciasTotales()
  const ultima = useUltimaSolicitudMercado()
  const crear = useCrearSolicitudMercado()

  const [unidad, setUnidad] = useState('COCINA')
  const [persona, setPersona] = useState('COCINA')
  const [nota, setNota] = useState('')
  const [sel, setSel] = useState<Record<number, Marca>>({})
  const [extras, setExtras] = useState<Articulo[]>([])
  const [generales, setGenerales] = useState<General[]>([])
  const [filtro, setFiltro] = useState('')
  const [agregarId, setAgregarId] = useState('')
  const [agregarCant, setAgregarCant] = useState('1')
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoCant, setNuevoCant] = useState('1')
  const [nuevoUnd, setNuevoUnd] = useState('UND')

  const deCocina = useMemo(
    () => new Set((categorias.data ?? []).filter((c) => c.de_cocina).map((c) => c.codigo)),
    [categorias.data],
  )
  const base = useMemo(
    () => (articulos.data ?? []).filter((a) => deCocina.has(a.categoria)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [articulos.data, deCocina],
  )
  const stockDe = useMemo(() => {
    const m = new Map<number, number>()
    for (const e of existencias.data ?? []) m.set(e.articulo_id, Number(e.existencia) || 0)
    return m
  }, [existencias.data])

  // Todos marcados, con la cantidad de la última Solicitud de Mercado o 1.
  const [precargado, setPrecargado] = useState(false)
  useEffect(() => {
    if (precargado || articulos.isPending || categorias.isPending || ultima.isPending) return
    const sugerida = new Map<number, string>()
    for (const r of ultima.data?.renglones ?? []) if (Number(r.cantidad) > 0) sugerida.set(r.articulo_id, String(Number(r.cantidad)))
    const inicial: Record<number, Marca> = {}
    for (const a of base) inicial[a.id] = { check: true, cant: sugerida.get(a.id) ?? '1' }
    setSel(inicial)
    setPrecargado(true)
  }, [precargado, articulos.isPending, categorias.isPending, ultima.isPending, ultima.data, base])

  const lista = useMemo(() => {
    const vistos = new Set<number>()
    const out: Articulo[] = []
    for (const a of [...base, ...extras]) {
      if (vistos.has(a.id)) continue
      vistos.add(a.id)
      out.push(a)
    }
    return out
  }, [base, extras])
  const esExtra = (id: number) => extras.some((x) => x.id === id) && !base.some((x) => x.id === id)

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    if (!q) return lista
    return lista.filter((a) => `${a.nombre} ${a.codigo} ${a.categoria}`.toLowerCase().includes(q))
  }, [lista, filtro])

  const marcados = lista.filter((a) => sel[a.id]?.check)
  const totalPedido = marcados.length + generales.length

  const opcionesAgregar = useMemo(() => {
    const ya = new Set(lista.map((a) => a.id))
    return (articulos.data ?? [])
      .filter((a) => !ya.has(a.id))
      .map((a) => ({ valor: String(a.id), codigo: a.codigo, nombre: a.nombre, detalle: `${a.categoria} · ${a.unidad}` }))
  }, [articulos.data, lista])
  const aAgregar = (articulos.data ?? []).find((a) => String(a.id) === agregarId)

  function agregar() {
    const a = aAgregar
    if (!a) return
    const n = numero(agregarCant)
    if (!(n > 0)) {
      toast('Indicá la cantidad a pedir', 'error')
      return
    }
    if (lista.some((x) => x.id === a.id)) {
      setSel((m) => ({ ...m, [a.id]: { check: true, cant: String(n) } }))
      toast(`"${a.nombre}" ya estaba en la lista · cantidad actualizada a ${fmtCant(n)}`, 'info')
    } else {
      setExtras((xs) => [...xs, a])
      setSel((m) => ({ ...m, [a.id]: { check: true, cant: String(n) } }))
      toast(`"${a.nombre}" agregado · ${fmtCant(n)} ${a.unidad}`, 'success')
    }
    setAgregarId('')
    setAgregarCant('1')
  }

  function agregarGeneral() {
    const nombre = enMayuscula(nuevoNombre.trim())
    if (!nombre) {
      toast('Escribí el nombre general de lo que se pide', 'error')
      return
    }
    const n = numero(nuevoCant)
    if (!(n > 0)) {
      toast('Indicá una cantidad mayor que 0', 'error')
      return
    }
    if (generales.some((g) => g.nombre === nombre)) {
      toast(`"${nombre}" ya está en la solicitud: cambiá su cantidad en la lista.`, 'warning')
      return
    }
    setGenerales((gs) => [
      ...gs,
      { sku: `GEN-${Date.now().toString(36).toUpperCase()}-${gs.length}`, nombre, cantidad: String(n), unidad: nuevoUnd.trim() || 'UND' },
    ])
    toast(`"${nombre}" agregado con nombre general · ${fmtCant(n)} ${nuevoUnd.trim() || 'UND'}`, 'success')
    setNuevoNombre('')
    setNuevoCant('1')
    setNuevoOpen(false)
  }

  const marcarVisibles = (check: boolean) =>
    setSel((m) => {
      const n = { ...m }
      for (const a of visibles) n[a.id] = { check, cant: n[a.id]?.cant ?? '1' }
      return n
    })

  async function crearSolicitud() {
    for (const a of marcados) {
      if (!(numero(sel[a.id]?.cant ?? '') > 0)) {
        toast(`Indicá una cantidad válida para "${a.nombre}"`, 'error')
        return
      }
    }
    for (const g of generales) {
      if (!(numero(g.cantidad) > 0)) {
        toast(`Indicá una cantidad válida para "${g.nombre}"`, 'error')
        return
      }
    }
    if (totalPedido === 0) {
      toast('Marcá al menos un producto', 'error')
      return
    }
    if (!unidad.trim()) {
      toast('Indicá la unidad solicitante', 'error')
      return
    }
    try {
      const r = await crear.mutateAsync({
        items: [
          ...marcados.map((a) => ({ nombre: a.nombre, cantidad: numero(sel[a.id].cant), unidad: a.unidad, articulo_id: a.id })),
          ...generales.map((g) => ({ sku: g.sku, nombre: g.nombre, cantidad: numero(g.cantidad), unidad: g.unidad, articulo_id: null })),
        ],
        notas: nota.trim() || null,
        unidad_solicitante: enMayuscula(unidad.trim()),
        solicitante_nombre: persona.trim() ? enMayuscula(persona.trim()) : null,
      })
      toast(`Solicitud de mercado ${r.codigo} · URGENTE enviada a Almacén para revisión`, 'success')
      onCreated(r.id)
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo crear la solicitud'), 'error')
    }
  }

  const cargando = articulos.isPending || categorias.isPending || ultima.isPending

  return (
    <Modal
      abierto
      onCerrar={onClose}
      titulo="🛒 Solicitud de Mercado"
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onClose} disabled={crear.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => void crearSolicitud()} disabled={crear.isPending || totalPedido === 0}>
            {crear.isPending ? 'Creando…' : `Crear solicitud (${totalPedido})`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="border-danger bg-danger/8 text-danger rounded-[6px] border px-3 py-2 text-sm">
          🚨 <strong>Se marca como ORDEN URGENTE.</strong> Reposición de víveres y artículos de limpieza para la cocina.
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input maxLength={60} label="Unidad solicitante" value={unidad} onChange={(e) => setUnidad(e.target.value.toUpperCase())} />
          <Input solo="letras" maxLength={80} label="Solicitado por" value={persona} onChange={(e) => setPersona(e.target.value.toUpperCase())} />
        </div>
        <Textarea
          label="Nota"
          placeholder="Observación de la solicitud de mercado…"
          rows={2}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />

        {cargando ? (
          <Cargando />
        ) : (
          <>
            <div>
              <span className="text-ink/75 mb-1 block text-sm font-medium">
                Víveres, Art. de Limpieza y Hortalizas · marcá los que se piden e indicá la cantidad
              </span>
              {ultima.data ? (
                <p className="text-ink/55 text-xs">
                  🧾 Cantidades sugeridas de la última compra <strong className="font-mono">{ultima.data.codigo}</strong> ·{' '}
                  {fechaHoraVE(ultima.data.fecha)} (editables).
                </p>
              ) : null}
            </div>

            <div className="border-hairline rounded-[6px] border p-3">
              <p className="text-ink/60 mb-2 text-xs">
                ¿Falta algo? Agregá <strong>cualquier producto del inventario</strong>, aunque no sea de estas categorías.
              </p>
              <div className="grid gap-2 sm:grid-cols-[1fr_7rem_auto]">
                <SelectBuscable
                  label="Producto del inventario"
                  opciones={opcionesAgregar}
                  valor={agregarId}
                  onCambio={setAgregarId}
                  vacio="🔎 Buscá el producto por nombre, código o categoría…"
                  hint={opcionesAgregar.length === 0 ? 'No queda ningún producto activo fuera de la lista.' : undefined}
                />
                <Input
                  label="Cantidad"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  limite={{ maxDecimales: 4, sinNegativos: true }}
                  value={agregarCant}
                  onChange={(e) => setAgregarCant(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      agregar()
                    }
                  }}
                />
                <div className="flex items-end pb-0.5">
                  <Button variant="outline" disabled={!agregarId} onClick={agregar}>
                    + Añadir
                  </Button>
                </div>
              </div>
              {aAgregar ? (
                <p className="text-ink/50 mt-1 text-xs">
                  {aAgregar.nombre} · {aAgregar.codigo} · en stock {fmtCant(stockDe.get(aAgregar.id) ?? 0)} {aAgregar.unidad}
                </p>
              ) : null}

              <Button variant="soft" size="sm" className="mt-2" onClick={() => setNuevoOpen((v) => !v)}>
                {nuevoOpen ? '× Cerrar' : '+ No está en inventario (pedir con nombre general)'}
              </Button>
              {nuevoOpen ? (
                <div className="border-hairline mt-2 space-y-2 rounded-[6px] border border-dashed p-3">
                  <p className="text-ink/60 text-xs">
                    Nombre general (Compras fija el nombre de inventario al cotizar). <strong>No se crea</strong> ningún producto
                    en el inventario.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-[1fr_6rem_6rem_auto]">
                    <Input maxLength={150} label="Nombre general de lo que se pide *" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} />
                    <Input
                      label="Cantidad *"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      limite={{ maxDecimales: 4, sinNegativos: true }}
                      value={nuevoCant}
                      onChange={(e) => setNuevoCant(e.target.value)}
                    />
                    <Input maxLength={20} label="Unidad" value={nuevoUnd} onChange={(e) => setNuevoUnd(e.target.value.toUpperCase())} />
                    <div className="flex items-end pb-0.5">
                      <Button variant="outline" onClick={agregarGeneral}>
                        Añadir
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {lista.length === 0 && generales.length === 0 ? (
              <Vacio
                icono={<span className="text-3xl">🛒</span>}
                titulo="No hay productos activos en las categorías de cocina."
                descripcion="Agregá alguno del inventario acá arriba, o marcá en Inventario › Categorías cuáles «se consumen en cocina»."
              />
            ) : (
              <div>
                <div className="mb-2 flex flex-wrap items-end gap-2">
                  <Input
                    label="Buscar en la lista"
                    ocultarEtiqueta
                    sinNormalizar
                    type="search"
                    className="min-w-48 flex-1"
                    placeholder="🔎 Buscar en la lista…"
                    value={filtro}
                    onChange={(e) => setFiltro(e.target.value)}
                  />
                  {filtro ? (
                    <Button size="sm" variant="ghost" onClick={() => setFiltro('')}>
                      ✕
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => marcarVisibles(true)}>
                    ✓ Marcar {filtro ? 'lo visible' : 'todos'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => marcarVisibles(false)}>
                    ✕ Desmarcar {filtro ? 'lo visible' : 'todos'}
                  </Button>
                  <span className="text-ink/50 pb-1.5 text-xs">
                    {marcados.length} de {lista.length} marcados · mostrando {visibles.length}
                  </span>
                </div>

                <div className="border-hairline max-h-80 overflow-y-auto rounded-[6px] border">
                  <table className="w-full text-sm">
                    <thead className="bg-ink/4 text-ink/55 sticky top-0 text-left text-xs">
                      <tr>
                        <th className="w-8 px-3 py-2">✓</th>
                        <th className="px-3 py-2 font-medium">Producto</th>
                        <th className="px-3 py-2 text-right font-medium">Stock</th>
                        <th className="px-3 py-2 text-right font-medium">Cantidad a pedir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.map((a) => {
                        const s = sel[a.id] ?? { check: false, cant: '1' }
                        return (
                          <tr key={a.id} className={cn('border-hairline border-t', s.check && 'bg-safety/8')}>
                            <td className="px-3 py-1.5">
                              <input
                                type="checkbox"
                                className="accent-royal-600 size-4"
                                checked={s.check}
                                aria-label={`Pedir ${a.nombre}`}
                                onChange={() => setSel((m) => ({ ...m, [a.id]: { check: !s.check, cant: s.cant } }))}
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <span className={s.check ? 'text-ink/90' : 'text-ink/50'}>{a.nombre}</span>
                              {esExtra(a.id) ? (
                                <button
                                  type="button"
                                  className="text-danger ml-1.5 text-xs"
                                  title="Quitar de la lista"
                                  onClick={() => {
                                    setExtras((xs) => xs.filter((x) => x.id !== a.id))
                                    setSel((m) => {
                                      const n = { ...m }
                                      delete n[a.id]
                                      return n
                                    })
                                  }}
                                >
                                  ✕
                                </button>
                              ) : null}
                              <div className="text-ink/45 font-mono text-[11px]">
                                {a.codigo}
                                {esExtra(a.id) ? ' · agregado' : ''}
                              </div>
                            </td>
                            <td className="text-ink/60 px-3 py-1.5 text-right text-xs">
                              {fmtCant(stockDe.get(a.id) ?? 0)} {a.unidad}
                            </td>
                            <td className="px-3 py-1.5 text-right whitespace-nowrap">
                              <input
                                type="number"
                                min={0}
                                step="any"
                                inputMode="decimal"
                                aria-label={`Cantidad de ${a.nombre}`}
                                disabled={!s.check}
                                value={s.cant}
                                onChange={(e) => setSel((m) => ({ ...m, [a.id]: { check: s.check, cant: comoNumero(e.target.value, { maxDecimales: 4, sinNegativos: true }) } }))}
                                className={cn(
                                  'border-ink/20 bg-surface w-20 rounded border px-1.5 py-0.5 text-right font-mono',
                                  !s.check && 'opacity-40',
                                  s.check && !(numero(s.cant) > 0) && 'border-danger',
                                )}
                              />{' '}
                              <span className="text-ink/45 text-xs">{a.unidad}</span>
                            </td>
                          </tr>
                        )
                      })}
                      {generales.map((g) => (
                        <tr key={g.sku} className="border-hairline bg-safety/8 border-t">
                          <td className="px-3 py-1.5">✓</td>
                          <td className="px-3 py-1.5">
                            {g.nombre}
                            <button
                              type="button"
                              className="text-danger ml-1.5 text-xs"
                              title="Quitar de la lista"
                              onClick={() => setGenerales((gs) => gs.filter((x) => x.sku !== g.sku))}
                            >
                              ✕
                            </button>
                            <div className="text-warning text-[11px]">nombre general</div>
                          </td>
                          <td className="text-ink/40 px-3 py-1.5 text-right text-xs">—</td>
                          <td className="px-3 py-1.5 text-right whitespace-nowrap">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              inputMode="decimal"
                              aria-label={`Cantidad de ${g.nombre}`}
                              value={g.cantidad}
                              onChange={(e) =>
                                setGenerales((gs) => gs.map((x) => (x.sku === g.sku ? { ...x, cantidad: comoNumero(e.target.value, { maxDecimales: 4, sinNegativos: true }) } : x)))
                              }
                              className="border-ink/20 bg-surface w-20 rounded border px-1.5 py-0.5 text-right font-mono"
                            />{' '}
                            <span className="text-ink/45 text-xs">{g.unidad}</span>
                          </td>
                        </tr>
                      ))}
                      {visibles.length === 0 && filtro ? (
                        <tr>
                          <td colSpan={4} className="text-ink/50 px-3 py-4 text-center text-sm">
                            Nada en la lista coincide con «{filtro}». Si el producto no está, agregalo con el buscador de inventario de
                            arriba.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        <p className="text-ink/55 text-xs">
          Se crea una <strong>Solicitud de Pedido</strong> (finalidad: {FINALIDAD_MERCADO}) sin monto; el precio lo fija el
          proveedor al cotizar. Primero va a <strong>revisión del Almacén General</strong>: el almacenista confirma qué
          tiene en stock (eso sale del almacén) y solo lo que falta pasa a Compras para aprobación.
        </p>
      </div>
    </Modal>
  )
}
