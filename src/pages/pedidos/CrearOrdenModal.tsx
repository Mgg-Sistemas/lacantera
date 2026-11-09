import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { useArticulos, useCategoriasDeInventario, useUnidades } from '@/lib/api/catalogo'
import {
  MAX_IMAGENES_OP,
  guardarImagenesOrden,
  useAgregarUnidad,
  useCrearSolicitud,
  useEditarSolicitud,
  useFichaDesdeSolicitud,
  useProximoCodigo,
  useUnidadesSolicitantes,
  type Imagen,
  type Orden,
  type PermisosPedidos,
} from '@/lib/api/pedidos'
import { fmtCant } from '@/lib/pedidos'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { enMayuscula } from '@/lib/texto'

/*
  «NUEVA ORDEN DE PEDIDO» / «EDITAR ORDEN DE PEDIDO {código}» (MGG `CrearOrdenModal`)

  Los campos, sus textos, sus avisos y el orden de las validaciones son los de
  MGG. Se aparta en lo que la dueña decidió (07/11/2026) o en lo que aquí no
  existe:

  - SIN «¿DÓNDE SE NECESITA?»: un solo almacén revisa, todo llega a ALM-GEN.
  - «+ NO ESTÁ EN INVENTARIO»: sin categoría se pide con NOMBRE GENERAL y no
    se crea nada (SKU GEN-…). CON CATEGORÍA (la dueña, 09/11/2026) se crea la
    ficha en el catálogo con el código siguiente de la categoría —REP-0001,
    REP-0002…— con `compras_ficha_desde_solicitud`, y el renglón entra como
    un producto del inventario. Si ya hay una con ese nombre en la categoría,
    entra esa. La base se la admite también a quien pide con nombres
    generales: es la ficha que él mismo sacó.
  - QUIÉN PIDE: quien no puede pedir por otro (`puede_pedir_por_otro`) ve su
    nombre y no lo puede cambiar; la base tampoco se lo acepta.
  - LA NOTA: MGG dice «la ve Tesorería al pagar». Aquí Tesorería no entra en
    compras (decisión de la dueña), así que dice quién la lee de verdad.
  - EL NOMBRE NO RENOMBRA EL INVENTARIO: MGG sincroniza el nombre editado con
    la ficha del producto. Aquí el catálogo se cuida en Inventario; el nombre
    del renglón es solo cómo se pidió.
*/

interface Fila {
  clave: string
  sku: string
  nombre: string
  cantidad: string
  unidad: string
  comprar: boolean
  finalidad: string
  general: boolean
  articulo_id: number | null
  /** El almacén ya lo entregó entero: queda con cero a comprar. */
  entregado: boolean
  /**
   * La ficha salió de «+ No está en inventario» con categoría: recién creada
   * o la que ya se llamaba así. Quien pide con nombres generales sí la puede
   * llevar (la base se la admite por ser suya).
   */
  fichaPropia: 'creada' | 'existente' | null
}

let contador = 0
const clave = () => `f${++contador}`

const numero = (s: string) => Number(String(s).replace(',', '.'))

export function CrearOrdenModal({
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
  const crear = useCrearSolicitud()
  const editar = useEditarSolicitud()
  const agregarUnidad = useAgregarUnidad()
  const fichaDesdeSolicitud = useFichaDesdeSolicitud()
  const { data: categorias } = useCategoriasDeInventario()
  const { data: unidadesSol } = useUnidadesSolicitantes()
  const { data: articulos } = useArticulos()
  const { data: medidas } = useUnidades()
  const proximo = useProximoCodigo(!esEdicion)

  // 30-10-2026 en MGG: la SP va con nombres generales salvo que la haga un
  // analista de Compras (o un administrador).
  const soloNombreGeneral = !permisos.gestiona

  const [filas, setFilas] = useState<Fila[]>(() =>
    (orden?.items ?? []).map((it) => ({
      clave: clave(),
      sku: it.sku,
      nombre: it.nombre,
      cantidad: String(it.cantidad ?? ''),
      unidad: it.unidad ?? 'UND',
      comprar: it.comprar !== false,
      finalidad: it.finalidad ?? '',
      general: !!it.general || !it.articulo_id,
      articulo_id: it.articulo_id ?? null,
      entregado: Number(it.cantidad_almacen) > 0,
      fichaPropia: null,
    })),
  )
  const [unidad, setUnidad] = useState(orden?.unidad_solicitante ?? '')
  const [nuevaUnidad, setNuevaUnidad] = useState('')
  const [persona, setPersona] = useState(
    orden?.solicitante_nombre ?? permisos.mi_nombre ?? '',
  )
  const [urgente, setUrgente] = useState(orden?.urgente ?? false)
  const [nota, setNota] = useState(orden?.notas ?? '')
  const [prodSelect, setProdSelect] = useState('')

  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [generalCant, setGeneralCant] = useState('1')
  const [nuevoUnidad, setNuevoUnidad] = useState('UND')
  const [nuevoCategoria, setNuevoCategoria] = useState('')

  const [imagenes, setImagenes] = useState<File[]>([])
  const [imagenesExist] = useState<Imagen[]>(orden?.imagenes ?? [])
  const [imagenesQuitar, setImagenesQuitar] = useState<string[]>([])
  const totalImg = imagenesExist.filter((a) => !imagenesQuitar.includes(a.path)).length + imagenes.length

  const [submitting, setSubmitting] = useState(false)

  const opcionesUnidad = useMemo(() => {
    const nombres = (unidadesSol ?? []).map((u) => u.nombre)
    if (unidad && !nombres.includes(unidad)) nombres.unshift(unidad)
    return nombres.map((n) => ({ valor: n, nombre: n }))
  }, [unidadesSol, unidad])

  const opcionesProducto = useMemo(
    () =>
      (articulos ?? []).map((a) => ({
        valor: String(a.id),
        codigo: a.codigo,
        nombre: a.nombre,
        detalle: [a.categoria, a.unidad].filter(Boolean).join(' · '),
      })),
    [articulos],
  )

  const medidasOpciones = (medidas ?? []).map((m) => ({ valor: m.codigo, etiqueta: m.nombre }))

  // Un servicio no se pide aquí: va por «Nuevo servicio».
  const categoriasOpciones = (categorias ?? [])
    .filter((c) => c.activa && c.codigo !== 'SERVICIO')
    .map((c) => ({ valor: c.codigo, etiqueta: `${c.etiqueta} · ${c.prefijo}-…` }))
  const prefijoElegido = (categorias ?? []).find((c) => c.codigo === nuevoCategoria)?.prefijo ?? '…'

  async function handleAddUnidad() {
    const n = enMayuscula(nuevaUnidad.trim())
    if (!n) {
      toast('Escribí el nombre de la unidad', 'error')
      return
    }
    const existente = (unidadesSol ?? []).find((u) => u.nombre.toLowerCase() === n.toLowerCase())
    if (existente) {
      setUnidad(existente.nombre)
      setNuevaUnidad('')
      toast(`La unidad "${existente.nombre}" ya existe — se seleccionó`, 'warning')
      return
    }
    try {
      const guardada = await agregarUnidad.mutateAsync(n)
      setUnidad(guardada ?? n)
      setNuevaUnidad('')
      toast(`Unidad "${n}" agregada al catálogo`, 'success')
    } catch (e) {
      toast(mensajeDe(e, 'No se pudo agregar la unidad'), 'error')
    }
  }

  function addItem() {
    const a = (articulos ?? []).find((x) => String(x.id) === prodSelect)
    if (!a) return
    const ya = filas.find((f) => f.articulo_id === a.id)
    if (ya) {
      const nueva = (numero(ya.cantidad) || 0) + 1
      setFilas((prev) => prev.map((f) => (f.clave === ya.clave ? { ...f, cantidad: String(nueva) } : f)))
      toast(`"${a.nombre}" ya estaba en la solicitud · cantidad ahora ${nueva}${a.unidad ? ` ${a.unidad}` : ''}`, 'warning')
      return
    }
    setFilas((prev) => [
      ...prev,
      {
        clave: clave(),
        sku: a.codigo,
        nombre: a.nombre,
        cantidad: '1',
        unidad: a.unidad ?? 'UND',
        comprar: true,
        finalidad: '',
        general: false,
        articulo_id: a.id,
        entregado: false,
        fichaPropia: null,
      },
    ])
    toast(`"${a.nombre}" agregado a la solicitud`, 'success')
  }

  /**
   * Lo que no está en el inventario. Sin categoría, un renglón con NOMBRE
   * GENERAL y no se crea nada; con categoría, la ficha nueva con su código.
   */
  async function agregarNombreGeneral() {
    const nombre = enMayuscula(nuevoNombre.trim())
    if (!nombre) {
      toast('Escribí el nombre general de lo que se pide', 'error')
      return
    }
    const cantidad = numero(generalCant)
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      toast('Indicá una cantidad mayor que 0', 'error')
      return
    }
    if (filas.some((f) => f.nombre.trim().toUpperCase() === nombre)) {
      toast(`"${nombre}" ya está en la solicitud: cambiá su cantidad en la lista.`, 'warning')
      return
    }
    const und = nuevoUnidad.trim() || 'UND'

    if (nuevoCategoria) {
      let ficha
      try {
        ficha = await fichaDesdeSolicitud.mutateAsync({ nombre, categoria: nuevoCategoria, unidad: und })
      } catch (e) {
        toast(mensajeDe(e, 'No se pudo crear el producto en el inventario'), 'error')
        return
      }
      const undFicha = ficha.unidad || und
      if (filas.some((f) => f.articulo_id === ficha.id)) {
        toast(`"${ficha.nombre}" (${ficha.codigo}) ya está en la solicitud: cambiá su cantidad en la lista.`, 'warning')
        return
      }
      setFilas((prev) => [
        ...prev,
        {
          clave: clave(),
          sku: ficha.codigo,
          nombre: ficha.nombre,
          cantidad: String(cantidad),
          unidad: undFicha,
          comprar: true,
          finalidad: '',
          general: false,
          articulo_id: ficha.id,
          entregado: false,
          fichaPropia: ficha.creada ? 'creada' : 'existente',
        },
      ])
      toast(
        ficha.creada
          ? `"${ficha.nombre}" creado en el inventario con el código ${ficha.codigo} · ${fmtCant(cantidad)} ${undFicha}`
          : `"${ficha.nombre}" ya estaba en el inventario como ${ficha.codigo}: se agregó ese · ${fmtCant(cantidad)} ${undFicha}`,
        'success',
      )
      setNuevoNombre('')
      setGeneralCant('1')
      setNuevoOpen(false)
      return
    }

    setFilas((prev) => [
      ...prev,
      {
        clave: clave(),
        sku: `GEN-${Date.now().toString(36).toUpperCase()}-${prev.length}`,
        nombre,
        cantidad: String(cantidad),
        unidad: und,
        comprar: true,
        finalidad: '',
        general: true,
        articulo_id: null,
        entregado: false,
        fichaPropia: null,
      },
    ])
    toast(`"${nombre}" agregado con nombre general · ${fmtCant(cantidad)} ${und}`, 'success')
    setNuevoNombre('')
    setGeneralCant('1')
    setNuevoOpen(false)
  }

  const cambiar = (c: string, patch: Partial<Fila>) =>
    setFilas((prev) => prev.map((f) => (f.clave === c ? { ...f, ...patch } : f)))

  function agregarImagenes(files: FileList | null) {
    if (!files?.length) return
    const cupo = Math.max(0, MAX_IMAGENES_OP - totalImg)
    const todas = Array.from(files)
    const nuevas = todas.filter((f) => !f.type || f.type.startsWith('image/')).slice(0, cupo)
    if (todas.length > nuevas.length) toast(`Máximo ${MAX_IMAGENES_OP} imágenes.`, 'warning')
    setImagenes((prev) => [...prev, ...nuevas])
  }

  async function handleSubmit() {
    if (!filas.length) {
      toast('Añade al menos un producto', 'error')
      return
    }
    if (!filas.some((f) => f.comprar)) {
      toast('Marcá al menos un artículo a comprar', 'error')
      return
    }
    const notaValor = nota.trim()
    if (!notaValor) {
      toast('Escribe la nota del analista: qué se pide y para quién. Se lee al aprobar y al pagar.', 'error')
      return
    }
    const previos = new Set((orden?.items ?? []).map((i) => i.sku))
    if (soloNombreGeneral && filas.some((f) => f.articulo_id && !previos.has(f.sku) && !f.fichaPropia)) {
      toast('La solicitud va con nombres generales: el analista de Compras pone el nombre de inventario al cotizar.', 'error')
      return
    }
    // Cero solo vale en lo que el almacén ya entregó entero.
    const mala = filas.find((f) => !(numero(f.cantidad) > 0) && !(f.entregado && numero(f.cantidad) === 0))
    if (mala) {
      toast(`La cantidad de "${mala.nombre}" debe ser mayor que 0.`, 'error')
      return
    }

    const items = filas.map((f) => ({
      sku: f.sku,
      nombre: f.nombre,
      cantidad: numero(f.cantidad),
      unidad: f.unidad,
      comprar: f.comprar,
      finalidad: f.finalidad.trim() || null,
      articulo_id: f.articulo_id,
    }))
    const datos = {
      items,
      notas: notaValor,
      unidad_solicitante: unidad.trim() || null,
      solicitante_nombre: persona.trim() || null,
      urgente,
    }

    setSubmitting(true)
    try {
      if (orden) {
        const saved = await editar.mutateAsync({ id: orden.id, ...datos })
        if (imagenes.length || imagenesQuitar.length) {
          try {
            await guardarImagenesOrden(saved.id, imagenes, imagenesExist, imagenesQuitar)
          } catch (e) {
            toast(`Orden guardada, pero no se pudieron subir las imágenes: ${mensajeDe(e, '')}`, 'warning')
          }
        }
        toast(`Orden ${saved.codigo} editada${urgente ? ' · URGENTE' : ''}`, 'success')
        onCreated()
        return
      }
      const saved = await crear.mutateAsync(datos)
      if (imagenes.length) {
        try {
          await guardarImagenesOrden(saved.id, imagenes)
        } catch (e) {
          toast(`Orden creada, pero no se pudieron subir las imágenes: ${mensajeDe(e, '')}`, 'warning')
        }
      }
      toast(
        saved.estado === 'revision_almacen'
          ? `${saved.codigo}${urgente ? ' · URGENTE' : ''} enviada a Almacén para revisión`
          : `Nueva orden de pedido ${saved.codigo}${urgente ? ' · URGENTE' : ''} enviada para aprobación`,
        'success',
      )
      onCreated()
    } catch (e) {
      toast(mensajeDe(e, 'Error al crear'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const etiquetaCampo = 'text-ink/75 mb-1.5 block text-sm font-medium'
  const pista = 'text-ink/50 mt-1.5 text-xs'

  return (
    <Modal
      abierto
      onCerrar={onClose}
      titulo={esEdicion ? `Editar orden de pedido ${orden.codigo}` : 'Nueva orden de pedido'}
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? 'Guardando…' : esEdicion ? 'Guardar cambios' : 'Crear solicitud'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* 1 · Unidad solicitante */}
        <div>
          <SelectBuscable
            label="Unidad solicitante"
            opciones={opcionesUnidad}
            valor={unidad}
            onCambio={setUnidad}
            vacio="Departamento / unidad que solicita"
            hint={opcionesUnidad.length === 0 ? 'Sin unidades en el catálogo. Agregá una abajo.' : undefined}
          />
          <div className="mt-2 flex gap-2">
            <Input
              label="Unidad nueva"
              ocultarEtiqueta
              placeholder="¿No está? Escribí la unidad nueva…"
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

        {/* 2 · Código y 3 · Persona que solicita */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Código"
            disabled
            value={esEdicion ? orden.codigo : (proximo.data ?? (proximo.isError ? 'OP-?' : '…'))}
            readOnly
            hint={esEdicion ? undefined : 'El número definitivo lo pone el sistema al crear.'}
          />
          <div>
            <Input
              label="Persona que solicita"
              placeholder="Quién pide el material (no quien carga la solicitud)"
              solo="letras"
              maxLength={80}
              value={persona}
              disabled={!permisos.pide_por_otro}
              onChange={(e) => setPersona(e.target.value)}
            />
            <p className={pista}>
              Quien pide el material. La solicitud queda registrada a nombre de{' '}
              <strong className="font-semibold">{permisos.mi_nombre ?? 'usted'}</strong> como quien la cargó.
              {!permisos.pide_por_otro ? ' Su usuario hace solicitudes a su nombre.' : ''}
            </p>
          </div>
        </div>

        {/* MGG pregunta «¿Dónde se necesita?» entre dos sedes; aquí hay una. */}
        <p className="border-hairline bg-canvas text-ink/70 rounded-[6px] border px-3 py-2 text-sm">
          📍 Se necesita en <strong className="font-semibold">Almacén General (ALM-GEN)</strong>: el almacén
          revisa si lo tiene y lo que falte pasa a Compras.
        </p>

        {/* 5 · Productos solicitados */}
        <div>
          <span className={etiquetaCampo}>Productos solicitados</span>
          <p className="text-ink/55 mb-2 text-xs">
            Marcá los artículos a comprar e indicá la finalidad de cada uno. Los desmarcados quedan en la
            solicitud pero no se cotizan.
          </p>

          {soloNombreGeneral ? (
            <div className="border-info/30 bg-info/8 text-ink/75 mb-3 flex gap-2 rounded-[6px] border px-3 py-2 text-sm">
              <span aria-hidden="true">ℹ</span>
              <span>
                Escribe lo que necesitas con un <strong className="font-semibold">nombre general</strong> (ej.
                «TORNILLO 1/2»). Sin categoría no se guarda en el inventario: el analista de Compras le pone el nombre
                correcto al cargar la cotización. Si sabés su categoría, elegila en «+ No está en inventario» y se crea
                en el inventario con su código.
              </span>
            </div>
          ) : (
            <div className="mb-3 flex items-end gap-2">
              <SelectBuscable
                label="Producto del inventario"
                opciones={opcionesProducto}
                valor={prodSelect}
                onCambio={setProdSelect}
                vacio="Buscar producto por nombre o SKU…"
                hint={opcionesProducto.length === 0 ? 'Ningún producto coincide' : undefined}
                className="flex-1"
              />
              <Button variant="outline" onClick={addItem} disabled={!prodSelect}>
                + Añadir
              </Button>
            </div>
          )}

          {filas.length > 0 ? (
            <div className="border-hairline overflow-hidden rounded-[6px] border">
              <div className="bg-ink/4 text-ink/55 hidden grid-cols-[2rem_1fr_9rem_2rem] gap-2 px-3 py-1.5 text-xs font-medium sm:grid">
                <span>✓</span>
                <span>Producto</span>
                <span className="text-center">Cantidad</span>
                <span />
              </div>
              {filas.map((f) => (
                <div key={f.clave} className="border-hairline space-y-2 border-t px-3 py-2.5 first:border-t-0">
                  <div className="grid grid-cols-[2rem_1fr_2rem] items-start gap-2 sm:grid-cols-[2rem_1fr_9rem_2rem]">
                    <input
                      type="checkbox"
                      className="accent-royal-600 mt-3 size-4"
                      checked={f.comprar}
                      title={f.comprar ? 'Quitar de la compra' : 'Marcar para comprar'}
                      onChange={(e) => cambiar(f.clave, { comprar: e.target.checked })}
                    />
                    <div className="min-w-0">
                      <Input
                        label="Producto"
                        ocultarEtiqueta
                        maxLength={150}
                        value={f.nombre}
                        onChange={(e) => cambiar(f.clave, { nombre: e.target.value })}
                      />
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        {f.general ? (
                          <>
                            <Chip tone="warning">nombre general</Chip>
                            <span className="text-ink/50">Compras fija el nombre de inventario al cotizar</span>
                          </>
                        ) : (
                          <span className="text-ink/50 font-mono">{f.sku}</span>
                        )}
                        {f.fichaPropia === 'creada' ? <Chip tone="info">nuevo en inventario</Chip> : null}
                        {f.entregado ? <Chip tone="success">📦 lo entrega el almacén</Chip> : null}
                      </div>
                    </div>
                    <div className="col-span-3 grid grid-cols-[1fr_6rem] gap-2 sm:col-span-1 sm:grid-cols-1">
                      <Input
                        label="Cantidad"
                        ocultarEtiqueta
                        type="number"
                        inputMode="decimal"
                        className="[&_input]:text-center [&_input]:text-lg [&_input]:font-semibold"
                        limite={{ maxDecimales: 4, sinNegativos: true }}
                        value={f.cantidad}
                        onChange={(e) => cambiar(f.clave, { cantidad: e.target.value })}
                      />
                      {/* Una lista con el estilo de la casa, no la del navegador (la dueña, 09/11/2026: «se perdió el estilo»). */}
                      <Select
                        label="Unidad"
                        className="[&>label]:sr-only"
                        vacio="Unidad"
                        value={f.unidad}
                        onChange={(e) => cambiar(f.clave, { unidad: e.target.value })}
                        opciones={
                          f.unidad && !medidasOpciones.some((m) => m.valor === f.unidad)
                            ? [{ valor: f.unidad, etiqueta: f.unidad }, ...medidasOpciones]
                            : medidasOpciones
                        }
                      />
                    </div>
                    <button
                      type="button"
                      className="text-danger hover:bg-danger/10 row-start-1 mt-2 rounded px-1.5 py-1 text-sm sm:col-start-4"
                      title="Quitar de la solicitud"
                      aria-label={`Quitar ${f.nombre}`}
                      onClick={() => setFilas((prev) => prev.filter((x) => x.clave !== f.clave))}
                    >
                      ✕
                    </button>
                  </div>
                  {f.comprar ? (
                    <Input
                      label="Finalidad"
                      ocultarEtiqueta
                      placeholder="Finalidad de este producto (¿para qué se compra?)"
                      maxLength={200}
                      value={f.finalidad}
                      onChange={(e) => cambiar(f.clave, { finalidad: e.target.value })}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          <Button variant="soft" size="sm" className="mt-3" onClick={() => setNuevoOpen((v) => !v)}>
            {nuevoOpen ? '× Cerrar' : '+ No está en inventario (pedir con nombre general)'}
          </Button>

          {nuevoOpen ? (
            <div className="border-hairline mt-3 space-y-3 rounded-[6px] border border-dashed p-3">
              <p className="text-ink/60 text-xs">
                {nuevoCategoria ? (
                  <>
                    Con categoría <strong className="font-semibold">se crea el producto en el inventario</strong> con su
                    código ({prefijoElegido}-0001, {prefijoElegido}-0002…) y entra a la solicitud como cualquier producto
                    del inventario. Si ya hay uno con ese nombre en la categoría, se usa ese.
                  </>
                ) : (
                  <>
                    Sin categoría va con nombre general (Compras fija el nombre de inventario al cotizar) y{' '}
                    <strong className="font-semibold">no se crea</strong> ningún producto en el inventario. Si elegís la
                    categoría, sí se crea con su código.
                  </>
                )}
              </p>
              <Input
                label="Nombre general de lo que se pide *"
                maxLength={150}
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
              />
              <Select
                label="Categoría"
                value={nuevoCategoria}
                onChange={(e) => setNuevoCategoria(e.target.value)}
                vacio="Sin categoría (nombre general)"
                opciones={categoriasOpciones}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Cantidad *"
                  type="number"
                  inputMode="decimal"
                  limite={{ maxDecimales: 4, sinNegativos: true }}
                  value={generalCant}
                  onChange={(e) => setGeneralCant(e.target.value)}
                />
                <Select
                  label="Unidad"
                  value={nuevoUnidad}
                  onChange={(e) => setNuevoUnidad(e.target.value)}
                  opciones={medidasOpciones.length ? medidasOpciones : [{ valor: 'UND', etiqueta: 'Unidad' }]}
                />
              </div>
              <Button
                variant="outline"
                onClick={() => void agregarNombreGeneral()}
                disabled={fichaDesdeSolicitud.isPending}
              >
                {fichaDesdeSolicitud.isPending
                  ? 'Creando en el inventario…'
                  : nuevoCategoria
                    ? 'Crear en el inventario y añadir'
                    : 'Añadir a la solicitud con nombre general'}
              </Button>
            </div>
          ) : null}
        </div>

        {/* 6 · Urgente */}
        <label className="border-hairline flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm">
          <input
            type="checkbox"
            className="accent-danger mt-0.5 size-4 shrink-0"
            checked={urgente}
            onChange={(e) => setUrgente(e.target.checked)}
          />
          <span>
            <strong className="text-danger font-semibold">🚨 ORDEN: URGENTE</strong>
            <span className="text-ink/55 mt-0.5 block text-xs">
              Marca la orden como prioritaria (se refleja en el PDF y en toda la trazabilidad).
            </span>
          </span>
        </label>

        {/* 7 · Nota */}
        <Textarea
          label="Nota del analista * · se lee al aprobar y al pagar"
          placeholder="Qué se pide y para quién, ej.: equipo switch solicitado por Joel, técnico de las cámaras, para el cableado de las oficinas nuevas"
          rows={3}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />

        {/* 8 · Imágenes */}
        <div>
          <span className={etiquetaCampo}>Imágenes de referencia (hasta {MAX_IMAGENES_OP} · opcional)</span>
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={totalImg >= MAX_IMAGENES_OP}
            className="text-ink/70 file:bg-royal-600/10 file:text-royal-700 block w-full text-sm file:mr-3 file:rounded-[6px] file:border-0 file:px-3 file:py-1.5"
            onChange={(e) => {
              agregarImagenes(e.target.files)
              e.target.value = ''
            }}
          />
          <ul className="mt-2 space-y-1 text-sm">
            {imagenesExist
              .filter((a) => !imagenesQuitar.includes(a.path))
              .map((a) => (
                <li key={a.path} className="flex items-center gap-2">
                  <span className="text-ink/75">✓ {a.filename}</span>
                  <button
                    type="button"
                    className="text-danger text-xs"
                    onClick={() => setImagenesQuitar((q) => [...q, a.path])}
                  >
                    ✕
                  </button>
                </li>
              ))}
            {imagenes.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2">
                <span className="text-ink/75">
                  ✓ {f.name} ({(f.size / 1024 / 1024).toFixed(1)} MB)
                </span>
                <button
                  type="button"
                  className="text-danger text-xs"
                  onClick={() => setImagenes((prev) => prev.filter((_, k) => k !== i))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <p className={pista}>
            Fotos del repuesto/modelo a comprar (máx. {MAX_IMAGENES_OP}). Se adjuntan a la orden y quedan en su
            trazabilidad.
          </p>
        </div>

        <p className="text-ink/50 text-xs">
          El precio lo fijará el proveedor al cargar su oferta. La solicitud queda sin monto hasta entonces.
        </p>
      </div>
    </Modal>
  )
}
