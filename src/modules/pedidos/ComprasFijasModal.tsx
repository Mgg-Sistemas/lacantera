/* ============================================================
   La Cantera · Compras FIJAS (Plantillas Recurrentes de Compra)
   Tablero, editor visual e historial de ejecuciones.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Trash2,
  Edit3,
  Settings,
  ArrowLeft,
  History,
  ShoppingCart,
  FileText,
  Info,
  X,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { toast } from '@/lib/avisosFlotantes'
import { hoyVenezuela } from '@/shared/lib/rangosFecha'
import { money } from '@/lib/pedidos'
import { useArticulos, useProveedores, type Articulo, type Proveedor } from '@/lib/api/catalogo'
import { useFichaDesdeSolicitud } from '@/lib/api/pedidos'
import {
  FRECUENCIAS,
  entraPorCategoria,
  errorPlantilla,
  estadoFija,
  normCat,
  textoEstadoFija,
  textoFrecuencia,
  type CompraFija,
  type EstadoFija,
  type FrecuenciaFija,
  type ProductoFijo,
} from './comprasFijas'
import {
  eliminarCompraFija,
  guardarCompraFija,
  historialCompraFija,
  listComprasFijas,
  type CompraFijaEditable,
  type GeneradaFija,
} from './comprasFijas.repository'

const COLOR_BADGE: Record<EstadoFija, { bg: string; text: string; border: string }> = {
  vencida: { bg: 'bg-danger/10', text: 'text-danger font-semibold', border: 'border-danger/30' },
  hoy: { bg: 'bg-warning-soft', text: 'text-warning font-semibold', border: 'border-warning/30' },
  pronto: { bg: 'bg-tierra-500/10', text: 'text-tierra-600 font-semibold', border: 'border-tierra-500/30' },
  al_dia: { bg: 'bg-success/10', text: 'text-success font-semibold', border: 'border-success/30' },
  pausada: { bg: 'bg-canvas', text: 'text-ink/50', border: 'border-hairline' },
  sugerida: { bg: 'bg-canvas', text: 'text-ink/65', border: 'border-hairline' },
}

const fecha = (iso: string | null) =>
  iso
    ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-VE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—'

const NUEVA_PLANTILLA: CompraFijaEditable = {
  nombre: '',
  icono: '🔁',
  frecuencia: 'mensual',
  cada_dias: null,
  proxima_fecha: hoyVenezuela(),
  activa: true,
  modo: 'solicitud',
  permite_cotizar: true,
  solicitante: '',
  unidad_solicitante: '',
  finalidad: '',
  urgente: false,
  proveedor_id: null,
  proveedor_nombre: null,
  categorias: [],
  productos: [],
  nota: '',
  orden: 0,
  sugerida: false,
}

export function ComprasFijasModal({
  articulos: articulosProp,
  proveedores: proveedoresProp,
  puedeEditar = true,
  onGenerarSolicitud,
  onGenerarDirecta,
  onClose,
}: {
  articulos?: Articulo[]
  proveedores?: Proveedor[]
  puedeEditar?: boolean
  onGenerarSolicitud: (c: CompraFija) => void
  onGenerarDirecta: (c: CompraFija) => void
  onClose: () => void
}) {
  const articulosQ = useArticulos(false)
  const proveedoresQ = useProveedores(false)
  const articulos = articulosProp ?? articulosQ.data ?? []
  const proveedores = proveedoresProp ?? proveedoresQ.data ?? []
  const [lista, setLista] = useState<CompraFija[] | null>(null)
  const [editando, setEditando] = useState<{ id: string | null; datos: CompraFijaEditable } | null>(null)
  const [historial, setHistorial] = useState<{ c: CompraFija; filas: GeneradaFija[] | null } | null>(null)
  const [generando, setGenerando] = useState<string | null>(null)
  const hoy = hoyVenezuela()

  const cargar = useCallback(async () => {
    try {
      const r = await listComprasFijas()
      setLista(r.lista)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudieron leer las compras fijas', 'error')
      setLista([])
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  function handleGenerarSolicitud(c: CompraFija) {
    onGenerarSolicitud(c)
  }

  function handleGenerarDirecta(c: CompraFija) {
    setGenerando(c.id)
    try {
      onGenerarDirecta(c)
    } finally {
      setGenerando(null)
    }
  }

  async function verHistorial(c: CompraFija) {
    setHistorial({ c, filas: null })
    try {
      const filas = await historialCompraFija(c.id)
      setHistorial({ c, filas })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo leer el historial', 'error')
      setHistorial({ c, filas: [] })
    }
  }

  // Sub-modal de edición / configuración
  if (editando) {
    return (
      <EditorCompraFija
        inicial={editando.datos}
        id={editando.id}
        articulos={articulos}
        proveedores={proveedores}
        onClose={() => setEditando(null)}
        onGuardada={() => {
          setEditando(null)
          void cargar()
        }}
      />
    )
  }

  // Sub-modal de historial
  if (historial) {
    const filas = historial.filas
    const total = (filas ?? []).reduce((a, f) => a + (f.total ?? 0), 0)
    return (
      <Modal
        abierto
        titulo={`Historial · ${historial.c.icono} ${historial.c.nombre}`}
        descripcion="Registro de todas las solicitudes y compras generadas a partir de esta plantilla."
        onCerrar={() => setHistorial(null)}
        ancho="lg"
        acciones={
          <Button variant="outline" onClick={() => setHistorial(null)} icon={<ArrowLeft className="size-4" />}>
            Volver al tablero
          </Button>
        }
      >
        <div className="space-y-4 max-w-2xl">
          {filas === null ? (
            <div className="py-8 text-center text-xs text-ink/50">Cargando historial...</div>
          ) : !filas.length ? (
            <div className="p-6 text-center text-xs text-ink/55 bg-canvas/60 rounded-card border border-hairline">
              Esta plantilla todavía no ha generado compras en el sistema.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-card border border-hairline">
              <table className="w-full text-xs text-left">
                <thead className="bg-canvas border-b border-hairline text-ink/65 font-bold uppercase text-2xs">
                  <tr>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {filas.map((f, i) => (
                    <tr key={`${f.tipo}-${f.id}-${i}`} className="hover:bg-canvas/40">
                      <td className="px-3 py-2 text-ink/80 font-mono text-2xs">{fecha(f.fecha)}</td>
                      <td className="px-3 py-2 font-mono font-bold text-tierra-600">{f.codigo ?? '—'}</td>
                      <td className="px-3 py-2 text-ink/75">
                        {f.tipo === 'orden' ? 'Solicitud (OP)' : 'Compra Directa'}
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded bg-canvas border border-hairline text-2xs font-medium">
                          {f.estado}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-ink">
                        {f.total ? money(f.total) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {total > 0 ? (
                  <tfoot className="bg-canvas/70 border-t border-hairline font-bold">
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-right text-ink/70">
                        Total acumulado:
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-tierra-600">{money(total)}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          )}
        </div>
      </Modal>
    )
  }

  const tieneSugerencias = (lista ?? []).some((c) => c.sugerida)

  return (
    <Modal
      abierto
      titulo="Compras fijas y periódicas"
      descripcion="Plantillas de compras programadas para campamento, romana, taller y mina. Al pulsar «Generar solicitud» se arma la orden con los materiales y cantidades del ciclo previo."
      onCerrar={onClose}
      ancho="xl"
      acciones={
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="space-y-4 max-w-4xl">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-hairline">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink/60">
              Plantillas de compras recurrentes
            </span>
            <span className="rounded-full bg-canvas px-2 py-0.5 text-2xs font-mono font-bold text-ink/70 border border-hairline">
              {lista?.length ?? 0}
            </span>
          </div>
          {puedeEditar && (
            <Button
              size="sm"
              className="shrink-0 whitespace-nowrap"
              onClick={() => setEditando({ id: null, datos: { ...NUEVA_PLANTILLA, proxima_fecha: hoy } })}
              icon={<Plus className="size-3.5" />}
            >
              Nueva compra fija
            </Button>
          )}
        </div>

        {tieneSugerencias && (
          <div className="p-3 rounded-card border border-hairline bg-canvas/60 text-xs text-ink/75 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Info className="size-4 text-tierra-600 shrink-0" />
              <p className="text-2xs sm:text-xs">
                Las plantillas marcadas como <strong className="text-ink">«Sugerencia»</strong> son modelos base. Compras debe pulsar <strong>«Configurar»</strong> para revisarlas y activarlas.
              </p>
            </div>
          </div>
        )}

        {lista === null ? (
          <div className="py-12 text-center text-xs text-ink/50">Cargando plantillas de compra fija...</div>
        ) : !lista.length ? (
          <div className="p-8 text-center bg-canvas/50 rounded-card border border-hairline space-y-2">
            <p className="text-sm font-bold text-ink">No hay compras fijas configuradas</p>
            <p className="text-xs text-ink/60">Crea la primera plantilla fija para programar compras automáticas.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {lista.map((c) => {
              const est = estadoFija(c, hoy)
              const badge = COLOR_BADGE[est]
              const aCotizar = c.modo === 'solicitud' || c.permite_cotizar

              // Tarjeta de Sugerencia (por configurar)
              if (c.sugerida) {
                return (
                  <div
                    key={c.id}
                    className="p-3.5 rounded-card border border-dashed border-hairline hover:border-tierra-600/40 bg-surface/50 space-y-2.5 transition-colors flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xl shrink-0">{c.icono}</span>
                          <div className="min-w-0">
                            <strong className="text-sm font-bold text-ink block truncate">{c.nombre}</strong>
                            <span className="text-2xs text-ink/60">{textoFrecuencia(c)}</span>
                          </div>
                        </div>
                        <span className="text-2xs px-2 py-0.5 rounded-full border border-hairline bg-canvas/80 text-ink/60 font-medium shrink-0">
                          Sugerencia
                        </span>
                      </div>

                      <p className="text-2xs text-ink/65 leading-relaxed">
                        Plantilla sugerida para La Cantera. Configure los materiales o categorías y defina la próxima fecha para activarla.
                      </p>
                    </div>

                    <div className="pt-2 border-t border-hairline flex items-center justify-between gap-2">
                      <span className="text-2xs text-ink/50 font-mono">
                        {c.categorias.length ? `${c.categorias.length} categoría(s)` : `${c.productos.length} material(es)`}
                      </span>
                      {puedeEditar && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 whitespace-nowrap"
                          onClick={() => {
                            const {
                              id,
                              ultima_ref_tipo: _a,
                              ultima_ref_id: _b,
                              ultima_codigo: _c,
                              ultima_generada_en: _d,
                              ...datos
                            } = c
                            void _a
                            void _b
                            void _c
                            void _d
                            setEditando({
                              id,
                              datos: {
                                ...datos,
                                activa: true,
                                proxima_fecha: datos.proxima_fecha < hoy ? hoy : datos.proxima_fecha,
                              },
                            })
                          }}
                          icon={<Settings className="size-3.5 text-ink/70" />}
                        >
                          Configurar
                        </Button>
                      )}
                    </div>
                  </div>
                )
              }

              // Tarjeta de Compra Fija Activa o Pausada
              return (
                <div
                  key={c.id}
                  className={`p-3.5 rounded-card border bg-surface space-y-2.5 shadow-card transition-all flex flex-col justify-between ${
                    c.activa ? 'border-hairline hover:border-tierra-600/40' : 'border-hairline/60 opacity-70'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xl shrink-0">{c.icono}</span>
                        <div className="min-w-0">
                          <strong className="text-sm font-bold text-ink block truncate">{c.nombre}</strong>
                          <span className="text-2xs text-ink/60">
                            {textoFrecuencia(c)} · {c.modo === 'compra_directa' ? 'Compra Directa' : 'Solicitud → OC'}
                          </span>
                        </div>
                      </div>
                      <span className={`text-2xs px-2 py-0.5 rounded-full border shrink-0 ${badge.bg} ${badge.text} ${badge.border}`}>
                        {textoEstadoFija(c, hoy)}
                      </span>
                    </div>

                    <div className="text-2xs text-ink/75 space-y-1 bg-canvas/50 p-2.5 rounded-card border border-hairline">
                      <div className="flex justify-between items-center">
                        <span className="text-ink/60 text-2xs">Próxima fecha:</span>
                        <strong className="font-mono text-ink text-xs">{fecha(c.proxima_fecha)}</strong>
                      </div>
                      {c.ultima_codigo && (
                        <div className="flex justify-between items-center">
                          <span className="text-ink/60 text-2xs">Última generada:</span>
                          <span className="font-mono text-tierra-600 font-medium text-2xs">
                            {c.ultima_codigo} ({fecha(c.ultima_generada_en)})
                          </span>
                        </div>
                      )}
                      {c.proveedor_nombre && (
                        <div className="flex justify-between items-center">
                          <span className="text-ink/60 text-2xs">Proveedor habitual:</span>
                          <span className="truncate max-w-[160px] text-ink text-2xs">{c.proveedor_nombre}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Acciones de la tarjeta */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-hairline">
                    <div className="flex items-center gap-1.5">
                      {puedeEditar && c.activa && aCotizar && (
                        <Button
                          size="sm"
                          className="shrink-0 whitespace-nowrap"
                          onClick={() => handleGenerarSolicitud(c)}
                          icon={<FileText className="size-3.5" />}
                        >
                          Generar solicitud
                        </Button>
                      )}
                      {puedeEditar && c.activa && c.modo === 'compra_directa' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 whitespace-nowrap"
                          disabled={generando === c.id}
                          onClick={() => handleGenerarDirecta(c)}
                          icon={<ShoppingCart className="size-3.5" />}
                        >
                          {generando === c.id ? 'Generando…' : 'Compra directa'}
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 whitespace-nowrap"
                        onClick={() => void verHistorial(c)}
                        title="Ver compras generadas anteriormente"
                        icon={<History className="size-3.5" />}
                      >
                        Historial
                      </Button>
                      {puedeEditar && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="shrink-0 whitespace-nowrap"
                          onClick={() => {
                            const {
                              id,
                              ultima_ref_tipo: _a,
                              ultima_ref_id: _b,
                              ultima_codigo: _c,
                              ultima_generada_en: _d,
                              ...datos
                            } = c
                            void _a
                            void _b
                            void _c
                            void _d
                            setEditando({ id, datos })
                          }}
                          title="Editar parámetros de la plantilla"
                          icon={<Edit3 className="size-3.5" />}
                        >
                          Editar
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}

function EditorCompraFija({
  inicial,
  id,
  articulos,
  proveedores,
  onClose,
  onGuardada,
}: {
  inicial: CompraFijaEditable
  id: string | null
  articulos: Articulo[]
  proveedores: Proveedor[]
  onClose: () => void
  onGuardada: () => void
}) {
  const [d, setD] = useState<CompraFijaEditable>(inicial)
  const [catTxt, setCatTxt] = useState(inicial.categorias.join(', '))
  const [guardando, setGuardando] = useState(false)
  const [nuevo, setNuevo] = useState<{ nombre: string; categoria: string; unidad: string } | null>(null)
  const [busquedaProd, setBusquedaProd] = useState('')
  const fichaDesdeSolicitud = useFichaDesdeSolicitud()

  const set = <K extends keyof CompraFijaEditable>(k: K, v: CompraFijaEditable[K]) =>
    setD((x) => ({ ...x, [k]: v }))

  const categorias = useMemo(
    () =>
      catTxt
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    [catTxt],
  )

  const porCategoria = useMemo(
    () =>
      articulos.filter((p) => {
        const activo = p.activo !== false
        return activo && entraPorCategoria(p.categoria, categorias)
      }),
    [articulos, categorias],
  )

  const articulosFiltrados = useMemo(() => {
    const q = normCat(busquedaProd)
    if (!q) return []
    return articulos
      .filter((p) => {
        const activo = p.activo !== false
        const yaEsta = d.productos.some((f) => String(f.producto_id) === String(p.id))
        if (!activo || yaEsta) return false
        return normCat(p.nombre).includes(q) || normCat(p.codigo).includes(q)
      })
      .slice(0, 15)
  }, [articulos, busquedaProd, d.productos])

  function agregarProducto(p: Articulo) {
    const fijo: ProductoFijo = {
      producto_id: p.id,
      sku: p.codigo,
      nombre: p.nombre,
      unidad: p.unidad,
      cantidad: 1,
    }
    setD((prev) =>
      prev.productos.some((f) => String(f.producto_id) === String(p.id))
        ? prev
        : { ...prev, productos: [...prev.productos, fijo] },
    )
    setBusquedaProd('')
  }

  async function crearProductoAlVuelo() {
    if (!nuevo) return
    const nombre = nuevo.nombre.trim().toUpperCase()
    const categoria = nuevo.categoria.trim().toUpperCase()
    const unidad = nuevo.unidad.trim() || 'UND'
    if (!nombre || !categoria) {
      toast('Completa el nombre y la categoría del producto', 'error')
      return
    }

    try {
      const ficha = await fichaDesdeSolicitud.mutateAsync({ nombre, categoria, unidad })
      const fijo: ProductoFijo = {
        producto_id: ficha.id,
        sku: ficha.codigo,
        nombre: ficha.nombre,
        unidad: ficha.unidad || unidad,
        cantidad: 1,
      }
      setD((prev) => ({ ...prev, productos: [...prev.productos, fijo] }))
      setNuevo(null)
      toast(`"${ficha.nombre}" (${ficha.codigo}) creado y agregado a la plantilla.`, 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo crear el producto en inventario', 'error')
    }
  }

  async function guardar() {
    const datos = { ...d, categorias }
    const mal = errorPlantilla(datos)
    if (mal) {
      toast(mal, 'error')
      return
    }
    setGuardando(true)
    try {
      await guardarCompraFija(id, datos)
      toast('Compra fija guardada exitosamente.', 'success')
      onGuardada()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar la compra fija', 'error')
      setGuardando(false)
    }
  }

  async function eliminar() {
    if (!id || !window.confirm(`¿Eliminar la compra fija «${d.nombre}»? Las órdenes ya generadas no se alterarán.`))
      return
    setGuardando(true)
    try {
      await eliminarCompraFija(id)
      toast('Compra fija eliminada.', 'success')
      onGuardada()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo eliminar', 'error')
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto
      titulo={id ? `Editar plantilla · ${d.icono} ${d.nombre}` : 'Nueva compra fija'}
      descripcion="Define los parámetros de repetición, categorías y materiales de la compra periódica."
      onCerrar={onClose}
      ancho="lg"
      acciones={
        <div className="flex w-full items-center justify-between">
          {id ? (
            <Button
              variant="danger"
              size="sm"
              onClick={() => void eliminar()}
              disabled={guardando}
              icon={<Trash2 className="size-3.5" />}
            >
              Eliminar plantilla
            </Button>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void guardar()} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar plantilla'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 max-w-2xl text-xs">
        {/* Fila 1: Nombre, Ícono y Frecuencia */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 space-y-1">
            <label className="font-bold text-ink/80 block">Nombre de la Plantilla *</label>
            <div className="flex gap-2">
              <input
                className="w-12 h-9 text-center text-base rounded-control border border-hairline bg-surface text-ink"
                value={d.icono}
                maxLength={4}
                onChange={(e) => set('icono', e.target.value)}
                aria-label="Ícono"
              />
              <input
                className="flex-1 h-9 px-3 rounded-control border border-hairline bg-surface text-ink text-xs"
                value={d.nombre}
                onChange={(e) => set('nombre', e.target.value)}
                placeholder="Ej: Mercado Comedor, Filtros y Grasas…"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-ink/80 block">Frecuencia *</label>
            <select
              className="w-full h-9 px-2.5 rounded-control border border-hairline bg-surface text-ink text-xs"
              value={d.frecuencia}
              onChange={(e) => set('frecuencia', e.target.value as FrecuenciaFija)}
            >
              {FRECUENCIAS.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.etiqueta}
                </option>
              ))}
            </select>
            {d.frecuencia === 'cada_dias' && (
              <input
                type="number"
                min={1}
                max={365}
                className="w-full h-8 px-2.5 mt-1 rounded-control border border-hairline bg-surface text-ink text-xs"
                placeholder="Cantidad de días"
                value={d.cada_dias ?? ''}
                onChange={(e) => set('cada_dias', Number(e.target.value) || null)}
              />
            )}
          </div>
        </div>

        {/* Fila 2: Próxima fecha y Cómo se compra */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="font-bold text-ink/80 block">Próxima Fecha de Compra *</label>
            <input
              type="date"
              className="w-full h-9 px-3 rounded-control border border-hairline bg-surface text-ink text-xs"
              value={d.proxima_fecha}
              onChange={(e) => set('proxima_fecha', e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-ink/80 block">Modalidad de Compra</label>
            <select
              className="w-full h-9 px-2.5 rounded-control border border-hairline bg-surface text-ink text-xs"
              value={d.modo}
              onChange={(e) => set('modo', e.target.value as CompraFijaEditable['modo'])}
            >
              <option value="solicitud">Solicitud de Pedido (cotización → OC)</option>
              <option value="compra_directa">Compra Directa</option>
            </select>
            {d.modo === 'compra_directa' && (
              <label className="flex items-center gap-1.5 text-2xs text-ink/75 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={d.permite_cotizar}
                  onChange={(e) => set('permite_cotizar', e.target.checked)}
                />
                También permite mandar a cotizar como solicitud
              </label>
            )}
          </div>
        </div>

        {/* Fila 3: Solicitante, Unidad y Proveedor habitual */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="font-bold text-ink/80 block">Solicitante (Persona / Cargo)</label>
            <input
              className="w-full h-9 px-3 rounded-control border border-hairline bg-surface text-ink text-xs"
              value={d.solicitante ?? ''}
              onChange={(e) => set('solicitante', e.target.value)}
              placeholder="COCINA, JEFE DE PATIO…"
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-ink/80 block">Unidad Solicitante</label>
            <input
              className="w-full h-9 px-3 rounded-control border border-hairline bg-surface text-ink text-xs"
              value={d.unidad_solicitante ?? ''}
              onChange={(e) => set('unidad_solicitante', e.target.value)}
              placeholder="COCINA, TALLER, MINA…"
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-ink/80 block">Proveedor Habitual (Opcional)</label>
            <select
              className="w-full h-9 px-2.5 rounded-control border border-hairline bg-surface text-ink text-xs"
              value={d.proveedor_id ? String(d.proveedor_id) : ''}
              onChange={(e) => {
                const val = e.target.value
                const p = proveedores.find((x) => String(x.id) === val)
                setD((x) => ({
                  ...x,
                  proveedor_id: p ? String(p.id) : null,
                  proveedor_nombre: p?.nombre ?? null,
                }))
              }}
            >
              <option value="">— Ninguno / Por cotizar —</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Checkboxes de Urgente y Activa */}
        <div className="flex flex-wrap gap-4 py-1">
          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-ink">
            <input
              type="checkbox"
              checked={d.urgente}
              onChange={(e) => set('urgente', e.target.checked)}
            />
            Sale marcada como <strong>Urgente</strong> en el tablero
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-ink">
            <input
              type="checkbox"
              checked={d.activa}
              onChange={(e) => set('activa', e.target.checked)}
            />
            <strong>Activa</strong> (notifica cuando llega la fecha programada)
          </label>
        </div>

        {/* Bloque: Categorías dinámicas */}
        <div className="p-3.5 rounded-control bg-canvas/70 border border-hairline space-y-2">
          <label className="font-bold text-ink block">
            1. Categorías que entran (separadas por coma)
          </label>
          <input
            className="w-full h-9 px-3 rounded-control border border-hairline bg-surface text-ink text-xs"
            value={catTxt}
            onChange={(e) => setCatTxt(e.target.value)}
            placeholder="Ej: viver, proteina, limpieza, papel, filtro, aceite…"
          />
          <p className="text-2xs text-ink/65 leading-relaxed">
            Entran {porCategoria.length} artículo(s) del catálogo por coincidencia de categoría
            {porCategoria.length > 0
              ? `: ${porCategoria.slice(0, 5).map((p) => p.nombre).join(', ')}${
                  porCategoria.length > 5 ? '…' : ''
                }`
              : ''}
            .
          </p>
        </div>

        {/* Bloque: Productos fijos configurados */}
        <div className="p-3.5 rounded-control bg-canvas/70 border border-hairline space-y-3">
          <div className="flex items-center justify-between">
            <label className="font-bold text-ink block">
              2. Materiales fijos y cantidades establecidas
            </label>
            {!nuevo && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setNuevo({ nombre: '', categoria: '', unidad: 'UND' })}
                icon={<Plus className="size-3" />}
              >
                Crear producto nuevo
              </Button>
            )}
          </div>

          {/* Formulario alta al vuelo */}
          {nuevo && (
            <div className="p-3 rounded-control bg-surface border border-tierra-600/40 space-y-2">
              <span className="text-2xs font-bold text-tierra-600 uppercase tracking-wider block">
                Crear ficha en catálogo de inventario
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  className="h-8 px-2 rounded border border-hairline bg-surface text-ink text-xs"
                  placeholder="Nombre del material *"
                  value={nuevo.nombre}
                  onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
                />
                <input
                  className="h-8 px-2 rounded border border-hairline bg-surface text-ink text-xs"
                  placeholder="Categoría *"
                  value={nuevo.categoria}
                  onChange={(e) => setNuevo({ ...nuevo, categoria: e.target.value })}
                />
                <input
                  className="h-8 px-2 rounded border border-hairline bg-surface text-ink text-xs"
                  placeholder="Unidad (UND, KG, L…)"
                  value={nuevo.unidad}
                  onChange={(e) => setNuevo({ ...nuevo, unidad: e.target.value })}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => setNuevo(null)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={() => void crearProductoAlVuelo()}>
                  Crear y agregar a plantilla
                </Button>
              </div>
            </div>
          )}

          {/* Buscador de artículos existentes */}
          <div className="relative">
            <input
              className="w-full h-8 px-3 rounded-control border border-hairline bg-surface text-ink text-xs"
              placeholder="🔍 Escribe para buscar y añadir un producto del inventario…"
              value={busquedaProd}
              onChange={(e) => setBusquedaProd(e.target.value)}
            />
            {articulosFiltrados.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-control bg-surface border border-hairline shadow-md divide-y divide-hairline">
                {articulosFiltrados.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => agregarProducto(p)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-canvas flex items-center justify-between"
                  >
                    <span>
                      <strong className="text-ink">{p.nombre}</strong>{' '}
                      <span className="text-2xs text-ink/50 font-mono">({p.codigo})</span>
                    </span>
                    <span className="text-2xs font-mono text-tierra-600">＋ Añadir</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Lista de productos fijos seleccionados */}
          {d.productos.length > 0 ? (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {d.productos.map((f, i) => (
                <div
                  key={`${f.producto_id}-${i}`}
                  className="flex items-center gap-2 p-2 rounded bg-surface border border-hairline"
                >
                  <span className="flex-1 text-ink truncate">
                    <strong>{f.nombre}</strong> <span className="text-2xs font-mono text-ink/50">({f.sku})</span>
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-2xs text-ink/60">Cant:</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      className="w-16 h-7 text-center rounded border border-hairline bg-surface text-ink font-mono text-xs font-bold"
                      value={f.cantidad || ''}
                      onChange={(e) =>
                        set(
                          'productos',
                          d.productos.map((x, j) =>
                            j === i ? { ...x, cantidad: Number(e.target.value) || 0 } : x,
                          ),
                        )
                      }
                    />
                    <span className="text-2xs text-ink/60 w-8">{f.unidad}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => set('productos', d.productos.filter((_, j) => j !== i))}
                    className="text-danger hover:text-danger/80 p-1"
                    title="Quitar de la lista"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-2xs text-ink/50 italic">
              No hay productos fijos individuales agregados. Se usarán únicamente las categorías definidas arriba.
            </p>
          )}
        </div>

        {/* Nota para la solicitud */}
        <div className="space-y-1">
          <label className="font-bold text-ink/80 block">Nota / Justificación (se incluye en la orden)</label>
          <input
            className="w-full h-9 px-3 rounded-control border border-hairline bg-surface text-ink text-xs"
            value={d.nota ?? ''}
            onChange={(e) => set('nota', e.target.value)}
            placeholder="Ej: Insumos quincenales para mantenimiento preventivo del frente de mina"
          />
        </div>
      </div>
    </Modal>
  )
}
