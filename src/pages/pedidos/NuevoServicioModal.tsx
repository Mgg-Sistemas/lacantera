import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import {
  useAgregarUnidad,
  useCatalogo,
  useCrearServicio,
  useEditarServicio,
  useEquiposServicio,
  useProximoCodigoServicio,
  useUnidadesSolicitantes,
  type DetalleServicioItem,
  type Orden,
  type PermisosPedidos,
  type RenglonServicio,
} from '@/lib/api/pedidos'
import { money } from '@/lib/pedidos'
import {
  ELECTRODOMESTICOS,
  TIPOS_SERVICIO_MANT,
  equiposDeTipo,
  esMantenimientoElectrodomestico,
  esRecarga,
  esRecargaAgua,
  limpiarDetalle,
  opcionesTipo,
  rotuloEquipo,
  sufijoRecarga,
  sumaDetallePrecios,
  tipoMantenimiento,
  totalRecarga,
} from '@/lib/servicios'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { enMayuscula } from '@/lib/texto'
import { DetalleItemsEditor } from './DetalleItemsEditor'

/*
  «NUEVO SERVICIO · {código}» / «EDITAR SERVICIO · {código}» (MGG `NuevoServicioModal`)

  Mismo flujo que una Solicitud de Pedido pero para servicios: recarga de gas
  o de agua, mantenimiento de maquinaria, de vehículos, de electrodomésticos…
  Varios servicios de distinto tipo en la misma solicitud. Nace en
  «Solicitado» (no pasa por el almacén) y después se aprueba, se cotiza y se
  paga como cualquier OC.

  Lo que cambia respecto a MGG:
    - SIEMPRE EN DÓLARES: sin «Moneda del servicio» ni «⇄ Convertir».
    - SIN «REPUESTO DEL INVENTARIO»: en MGG descuenta el stock al crear; aquí
      toda salida del inventario se pide y se autoriza en Salidas.
    - SIN «PAGO ANTICIPADO»: en MGG crea una Cuenta por Pagar en Tesorería, y
      aquí no hay Tesorería. La condición «anticipado» sigue en la cotización.
    - El equipo sale de Maquinaria de La Cantera.
*/

interface Linea {
  id: number
  sku: string | null
  categoria: string
  tipo: string
  equipoId: string
  electro: string
  cantidad: string
  precio: string
  bombonas: string
  kg: string
  detalle: DetalleServicioItem[]
}

const lineaVacia = (id: number): Linea => ({
  id,
  sku: null,
  categoria: '',
  tipo: '',
  equipoId: '',
  electro: '',
  cantidad: '1',
  precio: '',
  bombonas: '',
  kg: '',
  detalle: [],
})

const numero = (s: string): number => Number(String(s).replace(',', '.')) || 0

/** Las líneas de una orden de servicio, para editarla. */
function lineasDeOrden(o: Orden): Linea[] {
  const out = (o.items ?? []).map((it, i): Linea => {
    const cat = it.servicio_categoria ?? ''
    const bomb = Number(it.bombonas) || 0
    return {
      id: i + 1,
      sku: it.sku,
      categoria: cat,
      tipo: it.servicio_tipo ?? (tipoMantenimiento(cat) || esMantenimientoElectrodomestico(cat) || esRecarga(cat) ? '' : it.nombre),
      equipoId: it.equipo_id ? String(it.equipo_id) : '',
      electro: esMantenimientoElectrodomestico(cat) ? (it.equipo_nombre ?? '') : '',
      cantidad: String(it.cantidad ?? 1),
      precio: it.precio ? String(it.precio) : '',
      bombonas: it.bombonas != null ? String(it.bombonas) : '',
      // Se guarda el total de la recarga; el formulario pide la medida por unidad.
      kg: it.kg_recarga != null ? String(bomb > 0 ? Math.round((Number(it.kg_recarga) / bomb) * 100) / 100 : it.kg_recarga) : '',
      detalle: Array.isArray(it.detalle_items) ? it.detalle_items : [],
    }
  })
  return out.length ? out : [lineaVacia(1)]
}

export function NuevoServicioModal({
  orden,
  permisos,
  onClose,
  onCreated,
}: {
  orden: Orden | null
  permisos: PermisosPedidos
  onClose: () => void
  onCreated: () => void
}) {
  const esEdicion = !!orden
  const crear = useCrearServicio()
  const editar = useEditarServicio()
  const agregarUnidad = useAgregarUnidad()
  const proximo = useProximoCodigoServicio(!esEdicion)
  const { data: unidadesSol } = useUnidadesSolicitantes()
  const { data: categorias } = useCatalogo('servicio_categoria')
  const { data: tipos } = useCatalogo('servicio_tipo')
  const { data: equipos } = useEquiposServicio()

  const codigo = esEdicion ? orden.codigo : (proximo.data ?? (proximo.isError ? 'SV-?' : 'SV-…'))
  const [unidadSol, setUnidadSol] = useState(orden?.unidad_solicitante ?? '')
  const [nuevaUnidad, setNuevaUnidad] = useState('')
  const [persona, setPersona] = useState(orden?.solicitante_nombre ?? permisos.mi_nombre ?? '')
  const [nota, setNota] = useState(orden?.notas ?? '')
  const [lineas, setLineas] = useState<Linea[]>(() => (orden ? lineasDeOrden(orden) : [lineaVacia(1)]))
  const [seq, setSeq] = useState(() => (orden ? lineasDeOrden(orden).length + 1 : 2))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const opcionesUnidad = useMemo(() => {
    const nombres = (unidadesSol ?? []).map((u) => u.nombre)
    if (unidadSol && !nombres.includes(unidadSol)) nombres.unshift(unidadSol)
    return nombres.map((n) => ({ valor: n, nombre: n }))
  }, [unidadesSol, unidadSol])

  const opcionesCategoria = useMemo(() => {
    const activas = (categorias ?? []).filter((c) => c.activo).map((c) => c.nombre)
    // Al editar, la categoría que ya tenía aunque se haya apagado.
    for (const l of lineas) if (l.categoria && !activas.includes(l.categoria)) activas.push(l.categoria)
    return activas.map((n) => ({ valor: n, nombre: n }))
  }, [categorias, lineas])

  const nombresTipo = useMemo(() => (tipos ?? []).filter((t) => t.activo).map((t) => t.nombre), [tipos])
  const tiposMant = useMemo(() => opcionesTipo(TIPOS_SERVICIO_MANT, nombresTipo), [nombresTipo])

  const setLinea = (id: number, patch: Partial<Linea>) => setLineas((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const addLinea = () => {
    setLineas((ls) => [...ls, lineaVacia(seq)])
    setSeq((s) => s + 1)
  }

  // El precio de la línea: si el detalle lleva precios, su suma; si no, el estimado.
  const precioLinea = (l: Linea) => {
    const s = sumaDetallePrecios(l.detalle)
    return s > 0 ? s : numero(l.precio)
  }
  const cantidadLinea = (l: Linea) => (esRecarga(l.categoria) ? numero(l.bombonas) : numero(l.cantidad))
  const total = lineas.reduce((a, l) => a + (l.categoria ? cantidadLinea(l) * precioLinea(l) : 0), 0)

  async function handleAddUnidad() {
    const n = enMayuscula(nuevaUnidad.trim())
    if (!n) {
      toast('Escribí el nombre de la unidad', 'error')
      return
    }
    const existente = (unidadesSol ?? []).find((u) => u.nombre.toLowerCase() === n.toLowerCase())
    if (existente) {
      setUnidadSol(existente.nombre)
      setNuevaUnidad('')
      toast(`La unidad "${existente.nombre}" ya existe — se seleccionó`, 'warning')
      return
    }
    try {
      const guardada = await agregarUnidad.mutateAsync(n)
      setUnidadSol(guardada ?? n)
      setNuevaUnidad('')
      toast(`Unidad "${n}" agregada al catálogo`, 'success')
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo agregar la unidad'), 'error')
    }
  }

  async function submit() {
    setError(null)
    const unidad = enMayuscula(unidadSol.trim())
    if (!unidad) return setError('Indicá la unidad solicitante.')

    const items: RenglonServicio[] = []
    for (const l of lineas) {
      const cat = l.categoria.trim()
      if (!cat) continue
      const agua = esRecargaAgua(cat)
      const recarga = esRecarga(cat)
      const bombonas = recarga ? numero(l.bombonas) : 0
      const kgTotal = recarga ? totalRecarga(bombonas, numero(l.kg)) : 0
      const cant = recarga ? bombonas : numero(l.cantidad)
      if (cant <= 0) {
        return setError(
          recarga
            ? agua
              ? 'Indicá la cantidad (botellones o cisternas; 1 si es una cisterna).'
              : 'Indicá la cantidad de bombonas.'
            : 'Cada servicio debe tener cantidad mayor que 0.',
        )
      }
      const sufijo = sufijoRecarga(cat, bombonas, kgTotal)
      const mant = tipoMantenimiento(cat)
      const electro = esMantenimientoElectrodomestico(cat)
      const tipo = enMayuscula(l.tipo.trim())
      const detalle = limpiarDetalle(l.detalle)
      let equipoId: number | null = null
      let equipoNombre: string | null = null
      let nombre: string
      if (mant || electro) {
        if (electro) {
          equipoNombre = enMayuscula(l.electro.trim())
          if (!equipoNombre) return setError(`Elegí el electrodoméstico de "${cat}".`)
        } else {
          const eq = (equipos ?? []).find((x) => String(x.id) === l.equipoId)
          if (!eq) return setError(`Elegí el equipo de "${cat}".`)
          equipoId = eq.id
          equipoNombre = `${eq.codigo} · ${eq.nombre}`
        }
        nombre = `${cat} · ${equipoNombre}${tipo ? ` · ${tipo}` : ''}${sufijo}`
      } else {
        if (!recarga && !tipo) return setError(`Indicá el servicio de "${cat}".`)
        nombre = recarga ? `${cat}${tipo ? ` · ${tipo}` : ''}${sufijo}` : tipo
      }
      items.push({
        sku: l.sku,
        nombre: enMayuscula(nombre),
        cantidad: cant,
        precio: precioLinea(l),
        servicio_categoria: cat,
        servicio_tipo: tipo || null,
        equipo_id: equipoId,
        equipo_nombre: equipoNombre,
        bombonas: recarga ? bombonas : null,
        kg_recarga: recarga ? kgTotal : null,
        detalle_items: detalle.length ? detalle : null,
      })
    }
    if (!items.length) return setError('Agregá al menos un servicio con su categoría.')

    const datos = {
      items,
      notas: nota.trim() || null,
      unidad_solicitante: unidad,
      solicitante_nombre: persona.trim() || null,
      urgente: orden?.urgente ?? false,
    }
    setSaving(true)
    try {
      if (orden) {
        await editar.mutateAsync({ id: orden.id, ...datos })
        toast(`Servicio ${orden.codigo} actualizado`, 'success')
      } else {
        const r = await crear.mutateAsync(datos)
        toast(`Servicio ${r.codigo} creado`, 'success')
      }
      onCreated()
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo guardar el servicio.'))
    } finally {
      setSaving(false)
    }
  }

  const pista = 'text-ink/50 mt-1 text-xs'

  return (
    <Modal
      abierto
      onCerrar={onClose}
      titulo={esEdicion ? `Editar servicio · ${codigo}` : `Nuevo servicio · ${codigo}`}
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? 'Guardando…' : esEdicion ? '🛠 Guardar cambios' : '🛠 Crear servicio'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="text-ink/60 text-sm">
          Mismo flujo que una Solicitud de Pedido pero para <strong>servicios</strong> (recarga de gas, oxígeno, recarga de
          agua —botellones o cisterna—, mantenimiento de maquinaria, recarga de extintores…). Correlativo{' '}
          <strong className="font-mono">{codigo}</strong>. Luego se aprueba, se cotiza y se paga como cualquier OC.{' '}
          <strong>Mantenimiento de maquinaria</strong> lista los equipos de Maquinaria; <strong>mantenimiento de vehículos</strong>{' '}
          lista los vehículos. En ambos se casa con el equipo de Maquinaria.
        </p>

        <div>
          <SelectBuscable
            label="Unidad solicitante"
            opciones={opcionesUnidad}
            valor={unidadSol}
            onCambio={(v) => {
              setUnidadSol(v)
              setNuevaUnidad('')
            }}
            vacio="🔎 Elegí o buscá la unidad…"
            hint={opcionesUnidad.length === 0 ? 'Sin unidades. Escribí una nueva abajo.' : undefined}
          />
          <div className="mt-2 flex gap-2">
            <Input
              label="Unidad nueva"
              ocultarEtiqueta
              placeholder="¿No está? Escribí una nueva…"
              maxLength={60}
              value={nuevaUnidad}
              onChange={(e) => setNuevaUnidad(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleAddUnidad()
                }
              }}
            />
            <Button variant="outline" onClick={() => void handleAddUnidad()} disabled={agregarUnidad.isPending}>
              + Añadir
            </Button>
          </div>
          <p className={pista}>La unidad nueva queda guardada en el catálogo (Categorías → Unidad solicitante).</p>
        </div>

        <div>
          <Input
            label="Quién lo solicita"
            placeholder="Nombre de la persona que pide el servicio…"
            value={persona}
            disabled={!permisos.pide_por_otro}
            onChange={(e) => setPersona(e.target.value)}
          />
          <p className={pista}>
            La persona que solicita (queda registrada en la solicitud).
            {!permisos.pide_por_otro ? ' Su usuario hace solicitudes a su nombre.' : ''}
          </p>
        </div>

        <div>
          <span className="text-ink/75 mb-1 block text-sm font-medium">Servicios</span>
          <p className="text-ink/55 mb-2 text-xs">
            Podés agregar <strong>varios servicios de distinto tipo</strong> en la misma solicitud (mantenimiento, recarga de
            gas/agua, electrodoméstico…). Los precios van en dólares.
          </p>
          <div className="space-y-2">
            {lineas.map((l, idx) => {
              const mant = tipoMantenimiento(l.categoria)
              const electro = esMantenimientoElectrodomestico(l.categoria)
              const recarga = esRecarga(l.categoria)
              const agua = esRecargaAgua(l.categoria)
              const sumDet = sumaDetallePrecios(l.detalle)
              const equiposLista = equiposDeTipo(equipos ?? [], mant)
              return (
                <Card key={l.id} className="p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <Chip tone="royal">Servicio #{idx + 1}</Chip>
                    {lineas.length > 1 ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Quitar este servicio"
                        onClick={() => setLineas((ls) => ls.filter((x) => x.id !== l.id))}
                      >
                        ✕ Quitar
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SelectBuscable
                      label="Categoría"
                      opciones={opcionesCategoria}
                      valor={l.categoria}
                      onCambio={(v) => setLinea(l.id, { categoria: v, equipoId: '', tipo: '', electro: '' })}
                      vacio="🔎 Elegí o buscá categoría…"
                      hint={opcionesCategoria.length === 0 ? 'Sin categorías. Se cargan en «📒 Categorías».' : undefined}
                    />
                    {mant ? (
                      <SelectBuscable
                        label={rotuloEquipo(mant)}
                        opciones={equiposLista.map((e) => ({
                          valor: String(e.id),
                          codigo: e.codigo,
                          nombre: e.nombre,
                          detalle: [e.tipo, e.marca, e.modelo].filter(Boolean).join(' · '),
                        }))}
                        valor={l.equipoId}
                        onCambio={(v) => setLinea(l.id, { equipoId: v })}
                        vacio={mant === 'vehiculos' ? '🔎 Elegí o buscá el vehículo…' : mant === 'motos' ? '🔎 Elegí o buscá la moto…' : '🔎 Elegí o buscá el equipo…'}
                        hint={
                          equiposLista.length === 0
                            ? mant === 'vehiculos'
                              ? 'Sin vehículos en ese grupo.'
                              : mant === 'motos'
                                ? 'Sin motos registradas.'
                                : 'Sin equipos.'
                            : undefined
                        }
                      />
                    ) : electro ? (
                      <Input
                        label="Electrodoméstico"
                        list="sv-electrodomesticos"
                        placeholder="🔎 Elegí (cocina, nevera, lavadora, microondas…)"
                        value={l.electro}
                        onChange={(e) => setLinea(l.id, { electro: e.target.value })}
                      />
                    ) : (
                      <Input
                        label="Servicio"
                        list="sv-tipos"
                        placeholder="Elegí o escribí uno nuevo…"
                        disabled={!l.categoria}
                        value={l.tipo}
                        onChange={(e) => setLinea(l.id, { tipo: e.target.value })}
                      />
                    )}
                  </div>

                  {mant || electro ? (
                    <div className="mt-3">
                      <Input
                        label="Tipo de servicio"
                        list="sv-tipos-mant"
                        placeholder="🔎 Elegí el tipo (caucho, repuesto, aceite, pintura…)"
                        value={l.tipo}
                        onChange={(e) => setLinea(l.id, { tipo: e.target.value })}
                      />
                      <p className={pista}>Lista base + catálogo. Si escribís uno nuevo, queda guardado.</p>
                    </div>
                  ) : null}

                  {recarga ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Input
                        label={agua ? '🚰 Botellones / cisternas (cantidad)' : '🛢 Cantidad de bombonas'}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        placeholder={agua ? 'N° de botellones/cisternas (1 = cisterna)' : 'N° de bombonas'}
                        value={l.bombonas}
                        onChange={(e) => setLinea(l.id, { bombonas: e.target.value })}
                      />
                      <Input
                        label={agua ? '💧 Litros por unidad' : '⚖ KG por bombona'}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        placeholder={agua ? 'Litros de cada uno' : 'Kg de cada una'}
                        value={l.kg}
                        onChange={(e) => setLinea(l.id, { kg: e.target.value })}
                      />
                      <div>
                        <span className="text-ink/75 mb-1.5 block text-sm font-medium">Total recarga</span>
                        <div className="border-hairline rounded-[6px] border px-3 py-2 font-mono font-semibold">
                          {agua
                            ? `${totalRecarga(numero(l.bombonas), numero(l.kg))} L de agua${numero(l.bombonas) > 1 ? ` · ${numero(l.bombonas)} und` : ''}`
                            : `${numero(l.bombonas)} bombona(s) · ${totalRecarga(numero(l.bombonas), numero(l.kg))} KG`}
                        </div>
                      </div>
                      <Input
                        label="Precio estimado ($)"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        placeholder="0,00"
                        disabled={sumDet > 0}
                        title={sumDet > 0 ? 'Tomado de la suma del detalle' : undefined}
                        value={sumDet > 0 ? String(sumDet) : l.precio}
                        onChange={(e) => setLinea(l.id, { precio: e.target.value })}
                        hint={sumDet > 0 ? `Precio tomado del detalle: ${money(sumDet)}.` : undefined}
                      />
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Input
                        label="Cantidad"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={l.cantidad}
                        onChange={(e) => setLinea(l.id, { cantidad: e.target.value })}
                      />
                      <Input
                        label="Precio estimado ($)"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        placeholder="0,00"
                        disabled={sumDet > 0}
                        title={sumDet > 0 ? 'Tomado de la suma del detalle' : undefined}
                        value={sumDet > 0 ? String(sumDet) : l.precio}
                        onChange={(e) => setLinea(l.id, { precio: e.target.value })}
                        hint={sumDet > 0 ? `Precio tomado del detalle: ${money(sumDet)}.` : undefined}
                      />
                    </div>
                  )}

                  <DetalleItemsEditor value={l.detalle} onChange={(v) => setLinea(l.id, { detalle: v })} />
                </Card>
              )
            })}
          </div>
          <Button variant="outline" block className="mt-2 border-dashed" onClick={addLinea}>
            ＋ Agregar otro servicio (puede ser de otro tipo)
          </Button>
          {total > 0 ? (
            <div className="border-hairline mt-2 flex justify-between rounded-[6px] border px-3 py-2 text-sm">
              <span className="text-ink/60">Total estimado</span>
              <strong className="font-mono">{money(total)}</strong>
            </div>
          ) : null}
          <datalist id="sv-electrodomesticos">
            {ELECTRODOMESTICOS.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </datalist>
          <datalist id="sv-tipos">
            {nombresTipo.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <datalist id="sv-tipos-mant">
            {tiposMant.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </datalist>
        </div>

        <Textarea
          label="Nota"
          placeholder="Detalle / referencia del servicio…"
          rows={2}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />

        {error ? (
          <div className="border-danger text-danger rounded-[6px] border px-3 py-2 text-sm">
            <strong>Error:</strong> {error}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
