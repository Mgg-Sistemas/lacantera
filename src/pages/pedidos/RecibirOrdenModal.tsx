import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { desenvolver } from '@/lib/api/rpc'
import { useArticulos, useCategoriasDeArticulo, useUnidades } from '@/lib/api/catalogo'
import {
  borrarArchivosRecepcion,
  subirArchivoRecepcion,
  useRecibirOrden,
  type ArchivoSubido,
  type DatosRecepcion,
  type FichaRecepcion,
  type ItemOrden,
  type Orden,
  type Recepcion,
} from '@/lib/api/pedidos'
import {
  ETIQUETA_ALMACEN,
  etiquetaEstado,
  faltaDe,
  fmtCant,
  MOTIVO_NO_ENTRA,
  money,
  type MotivoNoEntra,
  recibidoDe,
  renglonesARecibir,
  tieneRecepcion,
  unidadRecepcion,
} from '@/lib/pedidos'
import { leerMonto } from '@/lib/pagos'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { comoNumero } from '@/lib/formato'

/*
  RECIBIR UNA OC EN EL ALMACÉN GENERAL (fase 4)

  MGG tiene dos pantallas para lo mismo: el modal «Recibir {OC}» de
  Inventario → Recepciones (`RecepcionesPendientes.tsx`) y «📥 Recepcionar»
  del teléfono (`RecepcionesTelefono.tsx`). Aquí es un solo formulario con dos
  variantes, la de PC (tabla, dentro de un modal) y la de teléfono (tarjetas).

  Lo de MGG: por renglón la marca recibida (con su nota si es otra) y lo
  recibido (con la unidad de compra: «BULTO · entran 500 KG»), la nota, «No
  sumar al inventario», las fotos y los errores con sus textos.

  Lo de La Cantera (decisiones de la dueña):
    - Un solo almacén: entra a ALM-GEN, sin «Almacén destino» que elegir.
    - Recepción parcial acumulada: se recibe lo que llegó; lo que falta queda
      pendiente para otra recepción, salvo que se marque «No llega más».
    - Un renglón de nombre general sin ficha se liga aquí («Se guarda en
      inventario como»): a una ficha que ya existe o a una nueva.
    - «No entra al inventario» por renglón (servicio o consumo inmediato).
    - La factura / nota de entrega escaneada se puede subir o no.
*/

const MAX_FOTOS = 4

/** El estado de un renglón en el formulario. */
interface Fila {
  /** El almacenista confirma que este producto de verdad entra (09/11/2026). */
  entra: boolean
  /** Por qué no entra lo que falta: obligatorio si entra menos de lo que falta. */
  motivo: MotivoNoEntra | ''
  notaMotivo: string
  recibido: string
  marca: string
  notaMarca: string
  sinInv: boolean
  /** Solo renglones de nombre general sin ficha. */
  modoFicha: 'existente' | 'nueva'
  articuloId: string
  nuevoNombre: string
  nuevaCategoria: string
  nuevaUnidad: string
  confirmado: boolean
}

const normMarca = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
const leer = (s: string) => leerMonto(s)

const generalSinFicha = (it: ItemOrden) => !it.articulo_id

/** Lo que se ve después de recibir: el resultado y la recepción para el WhatsApp. */
export interface RecepcionHecha {
  recepcion: Recepcion
  estado: string
  cerrada: boolean
  completa: boolean
}

export function FormularioRecepcion({
  orden: o,
  proveedor,
  variante,
  onCancel,
  onHecho,
}: {
  orden: Orden
  proveedor: string | null
  variante: 'pc' | 'telefono'
  onCancel: () => void
  onHecho: (r: RecepcionHecha) => void
}) {
  const recibir = useRecibirOrden()
  const { data: articulos } = useArticulos()
  const { data: categorias } = useCategoriasDeArticulo()
  const { data: unidades } = useUnidades()

  const renglones = useMemo(() => renglonesARecibir(o), [o])
  const pendientes = useMemo(() => renglones.filter((it) => faltaDe(it) > 0), [renglones])
  const completos = renglones.filter((it) => faltaDe(it) <= 0)
  const yaHubo = tieneRecepcion(o)

  const [filas, setFilas] = useState<Record<string, Fila>>(() =>
    Object.fromEntries(
      pendientes.map((it) => [
        it.sku,
        {
          // MGG arranca con lo pedido; aquí, con lo que falta.
          entra: false,
          motivo: '',
          notaMotivo: '',
          recibido: String(faltaDe(it)),
          marca: '',
          notaMarca: '',
          sinInv: !!it.sin_inventario,
          modoFicha: 'existente',
          articuloId: '',
          nuevoNombre: it.nombre,
          nuevaCategoria: '',
          nuevaUnidad: (it.unidad ?? '').toUpperCase(),
          confirmado: false,
        } satisfies Fila,
      ]),
    ),
  )
  const [nota, setNota] = useState('')
  const [sinInventario, setSinInventario] = useState(o.sin_inventario)
  const [cerrar, setCerrar] = useState(false)
  const [fotos, setFotos] = useState<File[]>([])
  const [documento, setDocumento] = useState<File | null>(null)
  const [docTipo, setDocTipo] = useState<'factura' | 'nota_entrega'>('factura')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const previas = useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos])
  useEffect(() => () => previas.forEach((u) => URL.revokeObjectURL(u)), [previas])

  const setFila = (sku: string, cambio: Partial<Fila>) => setFilas((fs) => ({ ...fs, [sku]: { ...fs[sku], ...cambio } }))
  /** Lo que entra de verdad: nada si no está marcado. */
  const recDe = (f: Fila | undefined) => (f?.entra ? leer(f.recibido) : 0)
  const todosMarcados = pendientes.length > 0 && pendientes.every((it) => filas[it.sku]?.entra)
  const marcarTodos = (v: boolean) =>
    setFilas((fs) => Object.fromEntries(Object.entries(fs).map(([k, f]) => [k, { ...f, entra: v }])))
  const conDevolucion = pendientes.some((it) => {
    const f = filas[it.sku]
    return !!f && recDe(f) < faltaDe(it) - 0.0001 && !!f.motivo && f.motivo !== 'no_llego'
  })

  const opcionesArt = useMemo(
    () => (articulos ?? []).map((a) => ({ valor: String(a.id), codigo: a.codigo, nombre: a.nombre, detalle: a.unidad })),
    [articulos],
  )
  const opcionesCat = useMemo(() => (categorias ?? []).map((c) => ({ valor: c.codigo, etiqueta: c.etiqueta })), [categorias])
  const opcionesUni = useMemo(() => (unidades ?? []).map((u) => ({ valor: u.codigo, etiqueta: `${u.codigo} · ${u.nombre}` })), [unidades])

  // Lo que quedaría faltando después de esta recepción.
  const quedaFaltando = pendientes.some((it) => recDe(filas[it.sku]) < faltaDe(it) - 0.0001)
  const valorAhora = pendientes.reduce((a, it) => a + recDe(filas[it.sku]) * (Number(it.precio) || 0), 0)
  const contraEntrega = o.condiciones_pago === 'contra_entrega' && !o.pagada_en
  const notaObligatoria = cerrar && quedaFaltando && !conDevolucion
  const ocCodigo = o.oc_codigo ?? o.codigo

  function fichaDe(it: ItemOrden, f: Fila): FichaRecepcion | null {
    if (!generalSinFicha(it) || f.sinInv || sinInventario || !f.entra) return null
    if (f.modoFicha === 'existente') return f.articuloId ? { articulo_id: Number(f.articuloId) } : null
    return {
      crear: {
        nombre: f.nuevoNombre.trim() || it.nombre,
        categoria: f.nuevaCategoria,
        unidad: f.nuevaUnidad,
        confirmado: f.confirmado,
      },
    }
  }

  /** Las validaciones de MGG, en su orden, con lo propio de la fase 4. */
  function validar(): string | null {
    const algo = pendientes.some((it) => recDe(filas[it.sku]) > 0)
    if (!algo && !conDevolucion && !(cerrar && yaHubo)) {
      return 'Marcá al menos un producto que entra, o indicá por qué no entra.'
    }
    for (const it of pendientes) {
      const f = filas[it.sku]
      if (f.entra && leer(f.recibido) <= 0) return `${it.nombre}: está marcado como recibido, pero en 0. Indicá cuánto entró o desmarcalo.`
      const rec = recDe(f)
      if (rec < faltaDe(it) - 0.0001 && !f.motivo) {
        return `${it.nombre}: ${f.entra ? 'entra menos de lo que falta' : 'no está marcado'}. Indicá por qué no entra a inventario.`
      }
      if (rec < 0) return `${it.nombre}: la cantidad recibida no puede ser negativa.`
      if (rec > faltaDe(it) + 0.0001) return `No podés recibir más de lo pedido en ${it.nombre}.`
      if (rec <= 0) continue
      const mr = normMarca(f.marca)
      const mp = normMarca(it.marca)
      if (mr && mp && mr !== mp && f.notaMarca.trim().length < 3) {
        return `${it.nombre}: llegó ${mr} en vez de ${mp}. Escribí una nota corta explicando el cambio de marca.`
      }
      if (generalSinFicha(it) && !f.sinInv && !sinInventario) {
        if (f.modoFicha === 'existente' && !f.articuloId) {
          return `${it.nombre}: sin ficha de inventario. Elegí con qué nombre se guarda en inventario: una ficha que ya existe o una nueva.`
        }
        if (f.modoFicha === 'nueva') {
          if (!f.nuevaCategoria) return `Elegí la categoría de la ficha nueva de «${it.nombre}».`
          if (!f.nuevaUnidad) return `«${it.nombre}»: elegí la unidad de la ficha nueva.`
        }
      }
    }
    if (notaObligatoria && !nota.trim()) return 'Recibiste menos de lo pedido: indicá una nota explicando la diferencia.'
    if (documento && documento.size > 10 * 1024 * 1024) return 'La factura / nota de entrega supera los 10 MB.'
    return null
  }

  async function confirmar() {
    setError(null)
    const e = validar()
    if (e) {
      setError(e)
      return
    }
    setGuardando(true)
    const subidos: ArchivoSubido[] = []
    try {
      const fotosSub: ArchivoSubido[] = []
      for (const f of fotos) {
        const s = await subirArchivoRecepcion(o.id, 'foto', f)
        subidos.push(s)
        fotosSub.push(s)
      }
      let doc: DatosRecepcion['documento'] = null
      if (documento) {
        const s = await subirArchivoRecepcion(o.id, 'documento', documento)
        subidos.push(s)
        doc = { ...s, tipo: docTipo }
      }
      const datos: DatosRecepcion = {
        renglones: pendientes.map((it) => {
          const f = filas[it.sku]
          const mr = normMarca(f.marca)
          const rec = Math.max(0, recDe(f))
          const resto = rec < faltaDe(it) - 0.0001
          return {
            sku: it.sku,
            cantidad: rec,
            motivo: resto && f.motivo ? f.motivo : undefined,
            nota_motivo: resto ? f.notaMotivo.trim() || null : null,
            marca_recibida: mr || null,
            nota_marca: mr && mr !== normMarca(it.marca) ? f.notaMarca.trim() || null : null,
            sin_inventario: f.sinInv || undefined,
            ficha: fichaDe(it, f),
          }
        }),
        nota: nota.trim() || null,
        sin_inventario: sinInventario,
        cerrar: cerrar && quedaFaltando && !conDevolucion,
        fotos: fotosSub,
        documento: doc,
      }
      const r = await recibir.mutateAsync({ id: o.id, datos })
      const recepcion = desenvolver<Recepcion>(
        await supabase.from('compras_recepciones').select('*').eq('id', r.recepcion_id).single(),
      )
      if (r.devoluciones) {
        toast(`${r.devoluciones} producto(s) para cambiar o devolver: Compras decide qué hacer`, 'info')
      }
      toast(
        !r.cerrada
          ? `Recepción parcial · ${ocCodigo} · R${r.numero} · falta por recibir`
          : contraEntrega
            ? `Recepción confirmada · ${ocCodigo} · indicá el método para pagar lo recibido`
            : sinInventario
              ? `Recepción confirmada · ${ocCodigo} · sin sumar al inventario (carga manual)`
              : `Mercancía recibida · ${ocCodigo} · stock actualizado`,
        'success',
      )
      onHecho({ recepcion, estado: r.estado, cerrada: r.cerrada, completa: r.completa })
    } catch (err) {
      if (subidos.length) void borrarArchivosRecepcion(subidos.map((s) => s.path))
      setError(mensajeDe(err, 'No se pudo registrar la recepción'))
      setGuardando(false)
    }
  }

  const tel = variante === 'telefono'

  const campoFicha = (it: ItemOrden, f: Fila) =>
    generalSinFicha(it) && !f.sinInv && !sinInventario && recDe(f) > 0 ? (
      <div className="border-warning bg-warning/6 mt-1.5 space-y-1.5 rounded-[6px] border px-2 py-1.5 text-xs">
        <div>
          📦 <strong>Se guarda en inventario como</strong>: «{it.nombre}» es un nombre general, sin ficha.
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="inline-flex items-center gap-1.5">
            <input
              type="radio"
              className="accent-royal-600"
              checked={f.modoFicha === 'existente'}
              onChange={() => setFila(it.sku, { modoFicha: 'existente' })}
            />
            Una ficha que ya existe
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="radio"
              className="accent-royal-600"
              checked={f.modoFicha === 'nueva'}
              onChange={() => setFila(it.sku, { modoFicha: 'nueva' })}
            />
            Ficha nueva
          </label>
        </div>
        {f.modoFicha === 'existente' ? (
          <SelectBuscable
            label="Ficha del inventario"
            opciones={opcionesArt}
            valor={f.articuloId}
            onCambio={(v) => setFila(it.sku, { articuloId: v })}
            vacio="Buscar producto del inventario…"
          />
        ) : (
          <div className={cn('grid gap-2', !tel && 'sm:grid-cols-3')}>
            <Input
              label="Nombre de la ficha"
              maxLength={150}
              value={f.nuevoNombre}
              onChange={(e) => setFila(it.sku, { nuevoNombre: e.target.value })}
            />
            <Select
              label="Categoría"
              vacio="— elegí —"
              opciones={opcionesCat}
              value={f.nuevaCategoria}
              onChange={(e) => setFila(it.sku, { nuevaCategoria: e.target.value })}
            />
            <Select
              label="Unidad de uso"
              vacio="— elegí —"
              opciones={opcionesUni}
              value={f.nuevaUnidad}
              onChange={(e) => setFila(it.sku, { nuevaUnidad: e.target.value })}
            />
            <label className="text-ink/70 inline-flex items-center gap-1.5 sm:col-span-3">
              <input
                type="checkbox"
                className="accent-royal-600"
                checked={f.confirmado}
                onChange={(e) => setFila(it.sku, { confirmado: e.target.checked })}
              />
              Si ya existe una ficha con ese nombre, es otra cosa: crearla igual
            </label>
          </div>
        )}
      </div>
    ) : null

  const campoMarca = (it: ItemOrden, f: Fila) => {
    const mr = normMarca(f.marca)
    const cambio = !!mr && !!normMarca(it.marca) && mr !== normMarca(it.marca)
    return (
      <>
        <input
          className={cn(
            'border-ink/20 bg-surface h-8 w-full min-w-0 rounded-[6px] border px-2 text-sm uppercase',
            cambio && 'border-warning',
          )}
          placeholder={it.marca ? it.marca : 'Marca'}
          aria-label={`Marca recibida de ${it.nombre}`}
          maxLength={60}
          value={f.marca}
          onChange={(e) => setFila(it.sku, { marca: e.target.value })}
        />
        {cambio ? (
          <div className="mt-1">
            <div className="text-warning text-xs">⚠ Llegó otra marca: anotá por qué</div>
            <input
              className="border-warning bg-surface h-8 w-full min-w-0 rounded-[6px] border px-2 text-sm"
              placeholder="Ej.: el proveedor no tenía, mandó esta"
              aria-label={`Por qué llegó otra marca de ${it.nombre}`}
              maxLength={200}
              value={f.notaMarca}
              onChange={(e) => setFila(it.sku, { notaMarca: e.target.value })}
            />
          </div>
        ) : null}
      </>
    )
  }

  /** Lo que no entra: el motivo (obligatorio) y una nota. */
  const campoMotivo = (it: ItemOrden, f: Fila) => {
    const rec = recDe(f)
    if (rec >= faltaDe(it) - 0.0001) return null
    const resto = faltaDe(it) - rec
    const devolucion = !!f.motivo && f.motivo !== 'no_llego'
    return (
      <div
        className={cn(
          'mt-1.5 space-y-1.5 rounded-[6px] border px-2 py-1.5 text-xs',
          f.motivo ? 'border-hairline' : 'border-danger bg-danger/6',
        )}
      >
        <div>
          {f.entra ? `Faltan ${fmtCant(resto)} ${unidadRecepcion(it)}` : 'No entra'} · <strong>¿por qué no entra a inventario?</strong>
        </div>
        <select
          className="border-ink/20 bg-surface h-8 w-full rounded-[6px] border px-2 text-sm"
          aria-label={`Motivo por el que ${it.nombre} no entra`}
          value={f.motivo}
          onChange={(e) => setFila(it.sku, { motivo: e.target.value as MotivoNoEntra | '' })}
        >
          <option value="">— elegí el motivo —</option>
          {(Object.keys(MOTIVO_NO_ENTRA) as MotivoNoEntra[]).map((m) => (
            <option key={m} value={m}>
              {MOTIVO_NO_ENTRA[m]}
            </option>
          ))}
        </select>
        {f.motivo ? (
          <input
            className="border-ink/20 bg-surface h-8 w-full min-w-0 rounded-[6px] border px-2 text-sm"
            placeholder={devolucion ? 'Qué pasó (ej.: llegó roto, no es la medida)' : 'Nota'}
            aria-label={`Nota del motivo de ${it.nombre}`}
            maxLength={300}
            value={f.notaMotivo}
            onChange={(e) => setFila(it.sku, { notaMotivo: e.target.value })}
          />
        ) : null}
        {devolucion ? (
          <div className="text-warning">↩ Pasa a Compras: decide si lo cambia el proveedor, se vuelve a cotizar o no se repone.</div>
        ) : null}
      </div>
    )
  }

  /** La casilla «entra». */
  const casillaEntra = (it: ItemOrden, f: Fila, grande = false) => (
    <input
      type="checkbox"
      className={cn('accent-royal-600', grande ? 'size-6' : 'size-4')}
      checked={f.entra}
      aria-label={`${it.nombre} entra al almacén`}
      onChange={(e) => setFila(it.sku, { entra: e.target.checked })}
    />
  )

  const unidadTxt = (it: ItemOrden) => {
    const u = unidadRecepcion(it)
    return it.unidad_compra && it.factor_compra ? `${it.unidad_compra} · entran ${fmtCant(Number(it.factor_compra))} ${it.unidad ?? ''}` : u
  }

  const cuerpo = (
    <div className="space-y-3">
      <p className="text-ink/65 text-sm">
        <strong>Marcá cada producto que de verdad entra</strong> al almacén (uno a uno, o todos con «Marcar todos») y su
        cantidad. Lo que no marques, o entre incompleto, lleva su <strong>motivo</strong>: no llegó (queda pendiente), lo
        cambia el proveedor, equivocación en la compra o vino defectuoso. Los tres últimos pasan a Compras, que decide si se
        cambia, se vuelve a cotizar o no se repone.
      </p>
      <div className="border-hairline rounded-[8px] border px-3 py-2 text-sm">
        <div>
          <span className="text-ink/55">Almacén destino:</span> <strong>{ETIQUETA_ALMACEN}</strong> (ALM-GEN)
        </div>
        <div className="text-ink/60 text-xs">La mercancía entrará a: 📦 {ETIQUETA_ALMACEN}</div>
        {proveedor ? (
          <div className="text-ink/60 text-xs">
            🏭 {proveedor} · {etiquetaEstado(o.estado)}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="border-danger text-danger rounded-[6px] border px-3 py-2 text-sm">
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      {tel ? (
        <div className="space-y-2">
          <Button block variant="ghost" onClick={() => marcarTodos(!todosMarcados)}>
            {todosMarcados ? '☐ Desmarcar todos' : '☑ Marcar todos'}
          </Button>
          {pendientes.map((it) => {
            const f = filas[it.sku]
            const rec = recDe(f)
            return (
              <div key={it.sku} className={cn('bg-surface shadow-card rounded-[10px] p-3', !f.entra && 'opacity-80')}>
                <label className="flex items-start gap-2.5">
                  {casillaEntra(it, f, true)}
                  <strong className="block">{it.nombre}</strong>
                </label>
                {it.marca ? <small className="text-ink/55 block">🏷 Pedido: {it.marca}</small> : null}
                <small className="text-ink/55 block">
                  Pedido: {fmtCant(it.cantidad)} {unidadTxt(it)}
                  {recibidoDe(it) > 0 ? ` · ya recibido ${fmtCant(recibidoDe(it))}` : ''}
                </small>
                {f.entra ? (
                  <>
                    <input
                      className="border-ink/20 bg-surface mt-1.5 h-12 w-full rounded-[8px] border px-3 text-right font-mono text-xl"
                      inputMode="decimal"
                      aria-label={`Recibido de ${it.nombre}`}
                      value={f.recibido}
                      onChange={(e) => setFila(it.sku, { recibido: comoNumero(e.target.value, { maxDecimales: 4, sinNegativos: true }) })}
                    />
                    {rec > faltaDe(it) ? <small className="text-warning">Más de lo pedido</small> : null}
                    <div className="mt-1.5">{campoMarca(it, f)}</div>
                    <label className="text-ink/70 mt-1.5 inline-flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        className="accent-royal-600"
                        checked={f.sinInv}
                        disabled={sinInventario}
                        onChange={(e) => setFila(it.sku, { sinInv: e.target.checked })}
                      />
                      No suma al stock (servicio o consumo inmediato)
                    </label>
                  </>
                ) : null}
                {campoMotivo(it, f)}
                {campoFicha(it, f)}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="border-hairline overflow-x-auto rounded-[6px] border">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-ink/4 text-ink/55 text-left text-xs">
              <tr>
                <th className="w-16 px-2 py-2 text-center font-medium">
                  <label className="inline-flex flex-col items-center gap-0.5" title="Marcar o desmarcar todos">
                    <input
                      type="checkbox"
                      className="accent-royal-600 size-4"
                      checked={todosMarcados}
                      aria-label="Marcar todos"
                      onChange={(e) => marcarTodos(e.target.checked)}
                    />
                    <span>Entra</span>
                  </label>
                </th>
                <th className="px-2 py-2 font-medium">Material</th>
                <th className="px-2 py-2 font-medium">Marca recibida</th>
                <th className="px-2 py-2 text-right font-medium">Pedido</th>
                <th className="px-2 py-2 text-right font-medium">Ya recibido</th>
                <th className="px-2 py-2 text-right font-medium">Recibido</th>
                <th className="px-2 py-2 text-right font-medium">Subtotal</th>
                <th className="px-2 py-2 text-center font-medium" title="Servicio o consumo inmediato: no suma al stock">
                  No suma al stock
                </th>
              </tr>
            </thead>
            <tbody>
              {pendientes.map((it) => {
                const f = filas[it.sku]
                const rec = recDe(f)
                return (
                  <tr key={it.sku} className={cn('border-hairline border-t align-top', !f.entra && 'bg-ink/3')}>
                    <td className="px-2 py-2 text-center">{casillaEntra(it, f)}</td>
                    <td className="px-2 py-2">
                      {it.nombre}
                      {it.marca ? <div className="text-ink/55 text-xs">🏷 Pedido: {it.marca}</div> : null}
                      {it.articulo_nombre && it.articulo_nombre !== it.nombre ? (
                        <div className="text-ink/55 text-xs">📦 Entra como {it.articulo_nombre}</div>
                      ) : null}
                      {campoMotivo(it, f)}
                      {campoFicha(it, f)}
                    </td>
                    <td className="w-44 px-2 py-2">{f.entra ? campoMarca(it, f) : null}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {fmtCant(it.cantidad)} <span className="text-ink/50 text-xs">{unidadRecepcion(it)}</span>
                    </td>
                    <td className="text-ink/60 px-2 py-2 text-right">{recibidoDe(it) > 0 ? fmtCant(recibidoDe(it)) : '—'}</td>
                    <td className="w-36 px-2 py-2 text-right">
                      <input
                        className={cn(
                          'border-ink/20 bg-surface h-8 w-24 rounded-[6px] border px-2 text-right font-mono disabled:opacity-40',
                          f.entra && rec < faltaDe(it) - 0.0001 && 'border-warning text-warning',
                        )}
                        inputMode="decimal"
                        aria-label={`Recibido de ${it.nombre}`}
                        disabled={!f.entra}
                        value={f.entra ? f.recibido : '0'}
                        onChange={(e) => setFila(it.sku, { recibido: comoNumero(e.target.value, { maxDecimales: 4, sinNegativos: true }) })}
                      />
                      {it.unidad_compra && it.factor_compra ? (
                        <div className="text-ink/50 mt-0.5 text-[11px]">{unidadTxt(it)}</div>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{money(rec * (Number(it.precio) || 0))}</td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        className="accent-royal-600 size-4"
                        checked={f.sinInv}
                        disabled={sinInventario || !f.entra}
                        aria-label={`${it.nombre} no suma al stock`}
                        onChange={(e) => setFila(it.sku, { sinInv: e.target.checked })}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-hairline border-t font-semibold">
                <td colSpan={6} className="px-2 py-2 text-right">
                  Total recibido
                </td>
                <td className="px-2 py-2 text-right font-mono">{money(valorAhora)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {completos.length ? (
        <p className="text-success text-xs">
          ✓ Ya recibido completo: {completos.map((it) => `${it.nombre} (${fmtCant(it.cantidad)} ${unidadRecepcion(it)})`).join(', ')}
        </p>
      ) : null}

      {contraEntrega ? (
        <div className="border-info bg-info/6 rounded-[6px] border px-3 py-2 text-sm">
          Contra entrega: luego Compras indicará el método para pagar <strong>{money(valorAhora)}</strong> (lo recibido).
        </div>
      ) : null}

      {quedaFaltando && !conDevolucion ? (
        <label className="border-warning bg-warning/6 flex items-start gap-2 rounded-[6px] border px-3 py-2 text-sm">
          <input type="checkbox" className="accent-royal-600 mt-0.5" checked={cerrar} onChange={(e) => setCerrar(e.target.checked)} />
          <span>
            <strong>No llega más: cerrar la recepción con lo recibido.</strong>
            <span className="text-ink/60 block text-xs">
              Sin marcar, lo que falta queda pendiente y la orden sigue en «Pendiente por recepción».
            </span>
          </span>
        </label>
      ) : null}

      <Textarea
        label={notaObligatoria ? 'Nota (obligatoria: hay diferencia con lo pedido)' : 'Nota'}
        rows={2}
        placeholder="Diferencias, faltantes, observaciones de la recepción…"
        value={nota}
        onChange={(e) => setNota(e.target.value)}
      />

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="accent-royal-600 mt-0.5"
          checked={sinInventario}
          disabled={o.sin_inventario}
          onChange={(e) => setSinInventario(e.target.checked)}
        />
        <span>
          No sumar al inventario (productos ya ingresados manualmente)
          {sinInventario ? (
            <span className="text-warning block text-xs">
              ⚠ Esta orden se recibirá, pero <strong>no</strong> generará entradas de stock.
            </span>
          ) : null}
        </span>
      </label>

      <div>
        <div className="text-ink/75 mb-1.5 text-sm font-medium">
          Fotos ({fotos.length}/{MAX_FOTOS}) · van con el WhatsApp
        </div>
        {fotos.length < MAX_FOTOS ? (
          <input
            type="file"
            accept="image/*"
            multiple
            aria-label="Fotos de la recepción"
            onChange={(e) => {
              const xs = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'))
              setFotos((f) => [...f, ...xs].slice(0, MAX_FOTOS))
              e.target.value = ''
            }}
          />
        ) : null}
        {fotos.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {fotos.map((f, i) => (
              <div key={`${f.name}-${i}`} className="relative">
                <img src={previas[i]} alt={f.name} className="size-20 rounded-[6px] object-cover" />
                <button
                  type="button"
                  className="bg-danger absolute -top-1.5 -right-1.5 rounded-full px-1.5 text-xs text-white"
                  aria-label={`Quitar ${f.name}`}
                  onClick={() => setFotos((xs) => xs.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className={cn('grid gap-2', !tel && 'sm:grid-cols-[1fr_14rem]')}>
        <div>
          <div className="text-ink/75 mb-1.5 text-sm font-medium">Factura / nota de entrega escaneada (PDF o imagen, máx. 10 MB)</div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept="application/pdf,image/*"
              aria-label="Factura o nota de entrega"
              onChange={(e) => setDocumento(e.target.files?.[0] ?? null)}
            />
            {documento ? (
              <Button size="sm" variant="ghost" onClick={() => setDocumento(null)}>
                ✕ Quitar
              </Button>
            ) : null}
          </div>
        </div>
        {documento ? (
          <Select
            label="Tipo de comprobante"
            value={docTipo}
            onChange={(e) => setDocTipo(e.target.value as 'factura' | 'nota_entrega')}
            opciones={[
              { valor: 'factura', etiqueta: 'Factura' },
              { valor: 'nota_entrega', etiqueta: 'Nota de entrega' },
            ]}
          />
        ) : null}
      </div>
    </div>
  )

  if (tel) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📥</span>
          <strong className="text-lg">Recepcionar · {ocCodigo}</strong>
        </div>
        <div className="text-ink/60 text-sm">
          {proveedor ?? '—'} · entra a <strong>{ETIQUETA_ALMACEN}</strong>
        </div>
        {cuerpo}
        <Button block size="lg" disabled={guardando} onClick={() => void confirmar()}>
          {guardando ? 'Recibiendo…' : `✓ Recepcionar en ${ETIQUETA_ALMACEN}`}
        </Button>
        <Button block variant="ghost" disabled={guardando} onClick={onCancel}>
          ← Otra orden
        </Button>
      </div>
    )
  }

  return (
    <Modal
      abierto
      onCerrar={onCancel}
      titulo={`Recibir ${ocCodigo}`}
      ancho="xl"
      acciones={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={() => void confirmar()} disabled={guardando}>
            {guardando ? 'Guardando…' : '📦 Confirmar recepción'}
          </Button>
        </>
      }
    >
      {yaHubo ? (
        <div className="mb-3">
          <Chip tone="warning">Recepción parcial · ya se recibió {money(o.recibido_total)}</Chip>
        </div>
      ) : null}
      {cuerpo}
    </Modal>
  )
}

/** El modal «Recibir {OC}» de la PC. */
export function RecibirOrdenModal(props: {
  orden: Orden
  proveedor: string | null
  onCancel: () => void
  onHecho: (r: RecepcionHecha) => void
}) {
  return <FormularioRecepcion {...props} variante="pc" />
}
