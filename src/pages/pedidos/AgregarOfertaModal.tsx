import { useMemo, useState, type ChangeEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { cn } from '@/lib/cn'
import { useArticulos, useProveedores } from '@/lib/api/catalogo'
import { useTasasCotizacion } from '@/lib/tasasCotizacion'
import {
  subirAdjuntosOferta,
  useEstadisticasProveedores,
  useGuardarOferta,
  type DetalleOferta,
  type Imagen,
  type Oferta,
  type Orden,
  type TipoTasaCotizacion,
} from '@/lib/api/pedidos'
import { fmtCant, money } from '@/lib/pedidos'
import {
  CONDICIONES_PAGO,
  DATOS_TECNICOS,
  LOGISTICA,
  OPCIONES_TASA_COTIZACION,
  UNIDADES_COMPRA,
  cifra2,
  empacarNotaTasa,
  extraerMetaTasaOferta,
  infoTasaCotizacion,
  ivaDesdePorcentaje,
  moneyBs,
  moneyCotizacion,
  notasSinMarcaTasa,
  parseMontoEs,
  r2,
  r4,
  totalDesdePartes,
  totalesRepresentativos,
} from '@/lib/ofertas'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { comoNumero } from '@/lib/formato'
import { CampoTelefono } from '@/components/CampoTelefono'

/*
  REGISTRAR O EDITAR UNA COTIZACIÓN (MGG `AgregarOfertaModal`)

  Las secciones en el orden de MGG: proveedor (o uno nuevo), conversor Bs ⇄ $,
  la cotización por ítem (precio BCV y/o efectivo en $, marca, «Se compra
  en», variantes con «＋ marca»), totales con el descuento, impuestos (IVA,
  IGTF, ajuste), fecha y condición, notas, datos técnicos, logística y los
  adjuntos. Las validaciones van en el orden de MGG y con sus textos; la base
  las repite al guardar.

  Lo que no está, a propósito:
    - «Actividad económica» y «Origen» del proveedor: la ficha de proveedores
      de La Cantera no tiene esos campos.
    - «Se guarda en inventario como» solo liga a una ficha que ya existe. La
      ficha nueva de un renglón de nombre general se crea al recibirlo, en el
      almacén (fase 4).
  La calificación con estrellas sale de las evaluaciones al finalizar el
  pedido (fase 4, `compras_evaluaciones`).
*/

const CAMPO = 'rounded-control border-ink/20 bg-surface h-9 w-full min-w-0 border px-2 text-sm'

interface Fila {
  key: string
  sku: string
  nombre: string
  unidad: string
  /** El renglón de la SP no tiene ficha (nombre general). */
  general: boolean
  cantidad: string
  precio: string
  precio_usd: string
  marca: string
  modelo: string
  unidad_compra: string
  factor_compra: string
  /** «Se guarda en inventario como» (general) o el producto agregado. */
  articulo_id: number | null
  /** Otra marca del mismo producto (fila extra con el mismo SKU). */
  variante: boolean
  agregado: boolean
}

const PREFIJOS_RIF = [
  { letra: 'J', desc: 'Jurídico' },
  { letra: 'V', desc: 'Venezolano' },
  { letra: 'E', desc: 'Extranjero' },
  { letra: 'G', desc: 'Gobierno' },
  { letra: 'P', desc: 'Pasaporte' },
  { letra: 'C', desc: 'Comunal' },
]

let semilla = 0
const nuevaKey = () => `f${Date.now().toString(36)}${(semilla++).toString(36)}`
const txt = (n: number | null | undefined) => (n == null || !Number(n) ? '' : String(n))

export function AgregarOfertaModal({
  orden,
  madre,
  ofertas,
  oferta,
  soloSkus,
  skusTomados,
  onClose,
  onSaved,
}: {
  /** Donde se abrió (la madre o una sub-OC). */
  orden: Orden
  /** Donde viven las ofertas. */
  madre: Orden
  ofertas: Oferta[]
  /** Con oferta: edición. */
  oferta?: Oferta | null
  /** Desde el asignador: solo estos productos. */
  soloSkus?: Set<string>
  /** Lo que ya tiene sub-OC: no se cotiza de nuevo. */
  skusTomados?: Set<string>
  onClose: () => void
  onSaved: () => void
}) {
  const editando = !!oferta
  const guardar = useGuardarOferta()
  const { data: proveedores } = useProveedores(false)
  const { data: articulos } = useArticulos()
  const { data: stats } = useEstadisticasProveedores()
  const metaInicial = useMemo(() => extraerMetaTasaOferta(oferta), [oferta])
  const [tipoTasa, setTipoTasa] = useState<TipoTasaCotizacion>(metaInicial.tipo)
  const [tasaManualStr, setTasaManualStr] = useState(() =>
    metaInicial.fija && metaInicial.tasaBs ? String(metaInicial.tasaBs) : '',
  )
  const [tasaEtiqueta, setTasaEtiqueta] = useState(metaInicial.etiqueta ?? '')
  const { tasas: tasasHoy } = useTasasCotizacion(tipoTasa === 'USDT')

  // A. Proveedor.
  const [provId, setProvId] = useState(oferta ? String(oferta.proveedor_id) : '')
  const [esNuevo, setEsNuevo] = useState(false)
  const [nuevo, setNuevo] = useState({ razon: '', letra: 'J', numero: '', telefono: '', correo: '', direccion: '' })
  const [motivoCambio, setMotivoCambio] = useState('')

  // D. Cotización por ítem.
  const [filas, setFilas] = useState<Fila[]>(() => {
    if (oferta) {
      return oferta.items.map((it, i) => {
        const sp = madre.items.find((x) => x.sku === it.sku)
        return {
          key: nuevaKey(),
          sku: it.sku,
          nombre: it.nombre,
          unidad: it.unidad ?? sp?.unidad ?? '',
          // Un renglón de servicio no se guarda en inventario (fase 5a).
          general: !!sp && !sp.articulo_id && madre.clase !== 'servicio',
          cantidad: String(it.cantidad ?? ''),
          precio: txt(it.precio),
          precio_usd: txt(it.precio_usd),
          marca: it.marca ?? '',
          modelo: it.modelo ?? '',
          unidad_compra: it.unidad_compra ?? '',
          factor_compra: txt(it.factor_compra),
          articulo_id: sp?.articulo_id ? null : (it.articulo_id ?? null),
          variante: oferta.items.findIndex((x) => x.sku === it.sku) < i,
          agregado: !!it.agregado,
        }
      })
    }
    const base = (orden.parent_orden_id ? orden.items : madre.items).filter(
      (it) => it.comprar !== false && (!soloSkus || soloSkus.has(it.sku)),
    )
    const pendientes = base.filter((it) => !skusTomados?.has(it.sku))
    return (pendientes.length ? pendientes : base).map((it) => ({
      key: nuevaKey(),
      sku: it.sku,
      nombre: it.nombre,
      unidad: it.unidad ?? '',
      general: !it.articulo_id && madre.clase !== 'servicio',
      cantidad: String(it.cantidad ?? ''),
      precio: '',
      precio_usd: '',
      marca: it.marca ?? '',
      modelo: it.modelo ?? '',
      unidad_compra: '',
      factor_compra: '',
      articulo_id: null,
      variante: false,
      agregado: false,
    }))
  })
  const [agregarArt, setAgregarArt] = useState('')

  // E-F. Totales e impuestos.
  const [descuentoStr, setDescuentoStr] = useState(txt(Number(oferta?.descuento)))
  // El descuento también en % (la dueña, 09/11/2026): se guarda en monto, como siempre.
  const [descuentoModo, setDescuentoModo] = useState<'pct' | 'monto'>('monto')
  const [descuentoPct, setDescuentoPct] = useState('')
  const [incluyeIva, setIncluyeIva] = useState(Number(oferta?.iva) > 0)
  const [ivaPct, setIvaPct] = useState('')
  const [ivaMonto, setIvaMonto] = useState(txt(Number(oferta?.iva)))
  const [ivaModo, setIvaModo] = useState<'pct' | 'monto'>('monto')
  const [ivaIncluido, setIvaIncluido] = useState(!!oferta?.iva_incluido)
  const [incluyeIgtf, setIncluyeIgtf] = useState(Number(oferta?.igtf) > 0)
  const [igtfPct, setIgtfPct] = useState('')
  const [igtfMonto, setIgtfMonto] = useState(txt(Number(oferta?.igtf)))
  const [igtfModo, setIgtfModo] = useState<'pct' | 'monto'>('monto')
  const [ajusteStr, setAjusteStr] = useState(txt(Number(oferta?.ajuste)))
  const [ajusteMotivo, setAjusteMotivo] = useState(oferta?.ajuste_motivo ?? '')

  // G-J.
  const [fecha, setFecha] = useState(oferta?.fecha_entrega_prometida ?? '')
  const [condicion, setCondicion] = useState(oferta?.condiciones_pago ?? '')
  const [notas, setNotas] = useState(() => notasSinMarcaTasa(oferta?.notas))
  const [detalle, setDetalle] = useState<DetalleOferta>(() => ({ ...(oferta?.detalle ?? {}) }))

  // K. Adjuntos.
  const [archivos, setArchivos] = useState<File[]>([])
  const [actuales, setActuales] = useState<Imagen[]>(oferta?.adjuntos ?? [])

  // B-C. Tasa elegida de la cotización y Conversor.
  const infoTasa = infoTasaCotizacion(tipoTasa, tasaEtiqueta)
  const tasaSugerida =
    tipoTasa === 'EUR_BCV'
      ? tasasHoy.EUR_BCV
      : tipoTasa === 'USDT'
        ? tasasHoy.USDT
        : tipoTasa === 'USD_BCV'
          ? tasasHoy.USD_BCV
          : metaInicial.tasaBs ?? 0
  const tasaManualNum = parseMontoEs(tasaManualStr)
  const tasaActiva = tasaManualNum > 0 ? tasaManualNum : tasaSugerida || metaInicial.tasaBs || 0
  const tasaUsdHoy = tasasHoy.USD_BCV || tasaActiva
  const fmtCot = (n: number | string | null | undefined) => moneyCotizacion(n, tipoTasa)
  const enBsCot = (n: number) => (tasaActiva > 0 ? moneyBs(r2(n * tasaActiva)) : null)

  const [convMonto, setConvMonto] = useState('')
  const [convDir, setConvDir] = useState<'bs_usd' | 'usd_bs'>('bs_usd')
  const [convTasa, setConvTasa] = useState('')
  const tasaConv = parseMontoEs(convTasa) || tasaActiva || 0

  function elegirTipoTasa(nuevoTipo: TipoTasaCotizacion) {
    setTipoTasa(nuevoTipo)
    if (nuevoTipo !== 'MANUAL') {
      setTasaManualStr('')
    }
    setConvTasa('')
  }

  // ── Proveedores ────────────────────────────────────────────────────────────
  const ofertados = useMemo(() => new Set(ofertas.map((o) => o.proveedor_id)), [ofertas])
  const opcionesProv = useMemo(
    () =>
      (proveedores ?? [])
        .filter((p) =>
          editando ? p.activo || p.id === oferta!.proveedor_id : p.activo && !ofertados.has(p.id),
        )
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        .map((p) => ({ valor: String(p.id), etiqueta: `${p.nombre} (${p.rif})` })),
    [proveedores, editando, oferta, ofertados],
  )
  const escondidos = useMemo(
    () =>
      editando
        ? []
        : (proveedores ?? []).filter((p) => ofertados.has(p.id)).map((p) => p.nombre),
    [proveedores, ofertados, editando],
  )
  const avisoEscondidos =
    escondidos.length > 0
      ? `${escondidos.slice(0, 3).join(', ')}${escondidos.length > 3 ? ` y ${escondidos.length - 3} más` : ''} ${
          escondidos.length === 1 ? 'ya cargó una oferta' : 'ya cargaron su oferta'
        } en esta orden, por eso no aparecen acá. Para corregir un precio, editá la oferta desde la comparativa con el ✎.`
      : null
  const cambiaProveedor = editando && provId !== String(oferta!.proveedor_id)
  const statProv = stats?.find((s) => String(s.proveedor_id) === provId)

  // ── Cálculos (MGG 338-363) ─────────────────────────────────────────────────
  const filasNum = filas.map((f) => ({
    sku: f.sku,
    cantidad: parseMontoEs(f.cantidad),
    precio: r4(parseMontoEs(f.precio)),
    precio_usd: r4(parseMontoEs(f.precio_usd)),
  }))
  const tot = totalesRepresentativos(filasNum)
  const bcvSubtotal = tot.bcv
  const usdTotal = tot.usd
  const precioTotal = r2(bcvSubtotal > 0 ? bcvSubtotal : usdTotal)
  const precioEfectivo = bcvSubtotal > 0 && usdTotal > 0 ? r2(usdTotal) : 0
  const ahorro = precioEfectivo > 0 ? r2(precioTotal - precioEfectivo) : 0
  const ahorroPct = ahorro > 0 && precioTotal > 0 ? Math.round((ahorro / precioTotal) * 100) : 0
  const baseFactura = precioTotal > 0 ? precioTotal : precioEfectivo
  const descuentoObt =
    descuentoModo === 'pct'
      ? r2((baseFactura * Math.min(100, Math.max(0, parseMontoEs(descuentoPct)))) / 100)
      : Math.max(0, r2(parseMontoEs(descuentoStr)))
  const facturaNeta = r2(Math.max(0, baseFactura - descuentoObt))
  const ivaCalc =
    ivaModo === 'pct' ? ivaDesdePorcentaje(facturaNeta, parseMontoEs(ivaPct), ivaIncluido) : r2(parseMontoEs(ivaMonto))
  const igtfCalc = igtfModo === 'pct' ? ivaDesdePorcentaje(facturaNeta, parseMontoEs(igtfPct)) : r2(parseMontoEs(igtfMonto))
  const ivaFinal = incluyeIva ? Math.max(0, ivaCalc) : 0
  const igtfFinal = incluyeIgtf ? Math.max(0, igtfCalc) : 0
  const ivaAdentro = incluyeIva && ivaIncluido
  const ajusteMonto = r2(parseMontoEs(ajusteStr))
  const totalConImpuestos = totalDesdePartes({
    subtotal: facturaNeta,
    iva: ivaFinal,
    igtf: igtfFinal,
    iva_incluido: ivaAdentro,
    ajuste: ajusteMonto,
  })
  const hayUC = filas.some((f) => f.unidad_compra.trim() && f.unidad_compra.trim().toUpperCase() !== f.unidad.toUpperCase())
  const hayGenerales = filas.some((f) => f.general)

  function setFila(key: string, cambio: Partial<Fila>) {
    setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, ...cambio } : f)))
  }
  function agregarVariante(f: Fila) {
    setFilas((fs) => {
      const i = fs.findIndex((x) => x.key === f.key)
      const ultimo = fs.reduce((acc, x, j) => (x.sku === f.sku ? j : acc), i)
      const copia: Fila = { ...f, key: nuevaKey(), marca: '', modelo: '', precio: '', precio_usd: '', variante: true }
      return [...fs.slice(0, ultimo + 1), copia, ...fs.slice(ultimo + 1)]
    })
  }
  function quitarFila(key: string) {
    setFilas((fs) => fs.filter((f) => f.key !== key))
  }
  function agregarProducto() {
    const a = articulos?.find((x) => String(x.id) === agregarArt)
    if (!a) return
    if (filas.some((f) => f.sku === a.codigo)) {
      toast(`"${a.nombre}" ya está en la cotización.`, 'warning')
      return
    }
    setFilas((fs) => [
      ...fs,
      {
        key: nuevaKey(),
        sku: a.codigo,
        nombre: a.nombre,
        unidad: a.unidad,
        general: false,
        cantidad: '1',
        precio: '',
        precio_usd: '',
        marca: '',
        modelo: '',
        unidad_compra: '',
        factor_compra: '',
        articulo_id: a.id,
        variante: false,
        agregado: true,
      },
    ])
    setAgregarArt('')
    toast(`"${a.nombre}" (${a.codigo}) agregado`, 'success')
  }
  const puedeAgregarProductos =
    orden.clase !== 'servicio' &&
    !orden.parent_orden_id &&
    ['pendiente', 'aprobada', 'asignada', 'desistida_proveedor', 'oc_creada'].includes(madre.estado)

  function elegirArchivos(e: ChangeEvent<HTMLInputElement>) {
    const lista = Array.from(e.target.files ?? [])
    e.target.value = ''
    const buenos: File[] = []
    for (const f of lista) {
      if (!(f.type === 'application/pdf' || f.type.startsWith('image/'))) {
        toast(`"${f.name}": debe ser PDF o imagen`, 'error')
        continue
      }
      if (f.size > 10 * 1024 * 1024) {
        toast(`"${f.name}": no puede superar 10 MB`, 'error')
        continue
      }
      buenos.push(f)
    }
    setArchivos((prev) => {
      const todos = [...prev, ...buenos]
      if (todos.length > 4) toast('Máximo 4 imágenes por cotización.', 'warning')
      return todos.slice(0, 4)
    })
  }

  // ── Guardar (validaciones de MGG, en su orden) ────────────────────────────
  async function onSubmit() {
    if (bcvSubtotal <= 0 && usdTotal <= 0) {
      toast('Ingresá el precio en Bs (a la tasa elegida) y/o en USD efectivo: al menos uno.', 'error')
      return
    }
    if (tipoTasa === 'MANUAL' && !(tasaActiva > 0)) {
      toast('Indicá el valor en Bs de la tasa acordada / manual.', 'error')
      return
    }
    if (!condicion) {
      toast('Elegí la condición de pago (define el flujo: contado, crédito, contra entrega…)', 'error')
      return
    }
    if (bcvSubtotal > 0 && usdTotal > 0 && usdTotal >= bcvSubtotal) {
      toast('El precio en divisa efectivo debe ser menor al total BCV (es un descuento por pago en efectivo).', 'error')
      return
    }
    for (const f of filas) {
      const uc = f.unidad_compra.trim().toUpperCase()
      if (uc && uc !== f.unidad.toUpperCase() && !(parseMontoEs(f.factor_compra) > 0)) {
        toast(`${f.nombre}: indicá cuántas ${f.unidad || 'unidades'} trae cada ${uc}.`, 'error')
        return
      }
    }
    const sinFicha = filas.find((f) => f.general && f.articulo_id === 0)
    if (sinFicha) {
      toast(`Se guarda en inventario como · «${sinFicha.nombre}»: Elegí el producto del inventario.`, 'error')
      return
    }
    if (cambiaProveedor && oferta!.estado === 'aceptada') {
      if (!motivoCambio.trim()) {
        toast('Indique el motivo del cambio de proveedor: la oferta ya está aceptada y el cambio pasa a la orden.', 'error')
        return
      }
      if (motivoCambio.trim().length < 5) {
        toast('El motivo es muy corto (mínimo 5 letras).', 'error')
        return
      }
    }
    if (esNuevo && !editando) {
      if (!nuevo.razon.trim() || !/\d/.test(nuevo.numero)) {
        toast('Razón social y RIF (con número) son obligatorios para el nuevo proveedor', 'error')
        return
      }
      if (nuevo.correo.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nuevo.correo.trim())) {
        toast('El correo del proveedor no tiene un formato válido', 'error')
        return
      }
    } else if (!provId) {
      toast('Selecciona un proveedor', 'error')
      return
    }

    try {
      const prefijo = esNuevo ? 'nuevo' : provId
      const subidos = archivos.length ? await subirAdjuntosOferta(madre.id, prefijo, archivos) : []
      const r = await guardar.mutateAsync({
        ordenId: madre.id,
        ofertaId: oferta?.id ?? null,
        proveedorId: esNuevo && !editando ? null : Number(provId),
        proveedorNuevo:
          esNuevo && !editando
            ? {
                razon_social: nuevo.razon.trim(),
                rif: `${nuevo.letra}${nuevo.numero.replace(/\D/g, '')}`,
                telefono: nuevo.telefono.trim() || null,
                correo: nuevo.correo.trim() || null,
                direccion: nuevo.direccion.trim() || null,
              }
            : null,
        motivoCambio: cambiaProveedor ? motivoCambio.trim() : null,
        datos: {
          items: filas.map((f) => ({
            sku: f.sku,
            cantidad: parseMontoEs(f.cantidad),
            precio: r4(parseMontoEs(f.precio)),
            precio_usd: parseMontoEs(f.precio_usd) > 0 ? r4(parseMontoEs(f.precio_usd)) : null,
            marca: f.marca.trim() || null,
            modelo: f.modelo.trim() || null,
            unidad_compra: f.unidad_compra.trim() || null,
            factor_compra: parseMontoEs(f.factor_compra) || null,
            articulo_id: f.articulo_id,
            agregado: f.agregado || undefined,
          })),
          descuento: descuentoObt || null,
          iva: ivaFinal || null,
          igtf: igtfFinal || null,
          iva_incluido: ivaAdentro,
          ajuste: ajusteMonto || null,
          ajuste_motivo: ajusteMonto ? ajusteMotivo.trim() || null : null,
          fecha_entrega_prometida: fecha || null,
          condiciones_pago: condicion,
          notas: empacarNotaTasa(notas, {
            tipo: tipoTasa,
            tasaBs: tasaActiva > 0 ? tasaActiva : null,
            fija: tipoTasa === 'MANUAL' || tasaManualNum > 0,
            etiqueta: tipoTasa === 'MANUAL' ? tasaEtiqueta.trim() || null : null,
          }),
          detalle: {
            ...detalle,
            tasa_tipo: tipoTasa,
            tasa_moneda: infoTasa.moneda,
            tasa_bs: tasaActiva > 0 ? tasaActiva : null,
            tasa_fija: tipoTasa === 'MANUAL' || tasaManualNum > 0,
            tasa_etiqueta: tipoTasa === 'MANUAL' ? tasaEtiqueta.trim() || null : null,
          },
          adjuntos: [...actuales, ...subidos],
        },
      })
      if (r.proveedor_creado) toast(`Proveedor "${nuevo.razon.trim().toUpperCase()}" registrado`, 'success')
      toast(`${editando ? 'Oferta actualizada' : 'Oferta registrada'} para ${madre.codigo}`, 'success')
      onSaved()
    } catch (e) {
      toast(mensajeDe(e, 'Error al registrar'), 'error')
    }
  }

  const opcionesArt = useMemo(
    () =>
      (articulos ?? []).map((a) => ({ valor: String(a.id), codigo: a.codigo, nombre: a.nombre, detalle: a.unidad })),
    [articulos],
  )
  const opcionesAgregar = useMemo(
    () => opcionesArt.filter((o) => !filas.some((f) => f.sku === o.codigo)),
    [opcionesArt, filas],
  )

  return (
    <Modal
      abierto
      onCerrar={onClose}
      titulo={`${editando ? 'Editar' : 'Agregar'} oferta · ${madre.codigo}`}
      ancho="xl"
      acciones={
        <>
          <Button variant="ghost" onClick={onClose} disabled={guardar.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => void onSubmit()} disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : editando ? 'Guardar cambios' : 'Registrar oferta'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* A. Proveedor */}
        {editando ? (
          <div>
            <SelectBuscable
              label="Proveedor"
              opciones={opcionesProv}
              valor={provId}
              onCambio={setProvId}
              vacio="Buscar proveedor por nombre o RIF…"
            />
            <p className="text-ink/55 mt-1 text-xs">Podés corregir el proveedor de la oferta. El resto de datos se edita abajo.</p>
            {cambiaProveedor && oferta!.estado === 'aceptada' ? (
              <div className="mt-2">
                <Textarea
                  label="Motivo del cambio de proveedor *"
                  placeholder="Por qué se corrige el proveedor de esta oferta"
                  rows={2}
                  value={motivoCambio}
                  onChange={(e) => setMotivoCambio(e.target.value)}
                />
                <p className="text-ink/55 mt-1 text-xs">
                  Esta oferta ya está aceptada: el proveedor también cambia en su orden y queda en el historial, con este
                  motivo. Con la orden pagada o recibida, el cambio no se permite.
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <div>
            <label className="text-ink/80 inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-royal-600 size-4"
                checked={esNuevo}
                onChange={(e) => setEsNuevo(e.target.checked)}
              />
              Proveedor no registrado (lo creo ahora junto con la oferta)
            </label>
            {!esNuevo ? (
              <div className="mt-2">
                {opcionesProv.length ? (
                  <SelectBuscable
                    label="Proveedor"
                    opciones={opcionesProv}
                    valor={provId}
                    onCambio={setProvId}
                    vacio="Buscar proveedor por nombre o RIF…"
                  />
                ) : (
                  <p className="text-ink/65 text-sm">
                    No quedan proveedores activos sin oferta. Marca <strong>"Proveedor no registrado"</strong> arriba para
                    crear uno nuevo.
                  </p>
                )}
                {avisoEscondidos ? <p className="text-ink/55 mt-1 text-xs">ℹ {avisoEscondidos}</p> : null}
                {provId ? (
                  <div className="border-hairline bg-canvas mt-2 rounded-[8px] border px-3 py-2 text-xs">
                    {statProv && statProv.total_evaluaciones > 0 ? (
                      <>
                        <span className="text-warning">
                          {'★'.repeat(Math.round(statProv.calidad_avg))}
                          {'☆'.repeat(5 - Math.round(statProv.calidad_avg))}
                        </span>{' '}
                        <strong>{statProv.calidad_avg.toFixed(1)}/5</strong> calidad ·{' '}
                        {Math.round(statProv.puntualidad_pct * 100)}% puntual · {statProv.total_evaluaciones} evaluación(es)
                        previa(s)
                      </>
                    ) : (
                      'Proveedor sin evaluaciones previas (calificación neutra hasta su primer pedido recibido).'
                    )}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="border-hairline bg-canvas mt-2 grid gap-3 rounded-[8px] border p-3 sm:grid-cols-2">
                <div className="text-ink/80 font-semibold sm:col-span-2">Datos del nuevo proveedor</div>
                <Input
                  label="Razón social *"
                  maxLength={150}
                  value={nuevo.razon}
                  onChange={(e) => setNuevo((n) => ({ ...n, razon: e.target.value }))}
                />
                <div>
                  <span className="text-ink/75 mb-1.5 block text-sm font-medium">RIF *</span>
                  <div className="flex gap-2">
                    <select
                      className={cn(CAMPO, 'h-10 w-28')}
                      value={nuevo.letra}
                      onChange={(e) => setNuevo((n) => ({ ...n, letra: e.target.value }))}
                      aria-label="Letra del RIF"
                    >
                      {PREFIJOS_RIF.map((p) => (
                        <option key={p.letra} value={p.letra}>
                          {p.letra} · {p.desc}
                        </option>
                      ))}
                    </select>
                    <input
                      className={cn(CAMPO, 'h-10')}
                      inputMode="numeric"
                      // El RIF lleva nueve cifras: ocho y el dígito del final.
                      maxLength={9}
                      placeholder="407784420"
                      value={nuevo.numero}
                      onChange={(e) => setNuevo((n) => ({ ...n, numero: e.target.value.replace(/\D/g, '') }))}
                      aria-label="Número del RIF"
                    />
                  </div>
                  <p className="text-ink/50 mt-1 text-xs">Los 8 dígitos y el verificador (J-40778442-0).</p>
                </div>
                <CampoTelefono
                  label="Teléfono"
                  valor={nuevo.telefono}
                  onCambiar={(v) => setNuevo((n) => ({ ...n, telefono: v }))}
                />
                <Input
                  label="Email"
                  type="email"
                  sinNormalizar
                  placeholder="correo@dominio.com"
                  maxLength={120}
                  value={nuevo.correo}
                  onChange={(e) => setNuevo((n) => ({ ...n, correo: e.target.value }))}
                />
                <Input
                  label="Dirección"
                  className="sm:col-span-2"
                  maxLength={200}
                  value={nuevo.direccion}
                  onChange={(e) => setNuevo((n) => ({ ...n, direccion: e.target.value }))}
                />
              </div>
            )}
          </div>
        )}

        {/* B. Tasa de la cotización (Checks + Desglose) */}
        <div className="border-hairline bg-canvas/60 rounded-[8px] border p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-ink/85 text-sm font-semibold">💱 Tasa a la que se trabaja esta cotización</div>
              <p className="text-ink/55 text-xs">
                Marcá a qué tasa cotizó el proveedor. Toda la cotización mostrará siempre su conversión en <strong>Bolívares (Bs)</strong> según la tasa elegida.
              </p>
            </div>
            {tasaActiva > 0 ? (
              <Chip tone={tipoTasa === 'EUR_BCV' ? 'warning' : 'royal'}>
                {infoTasa.icono} {infoTasa.corta}: {moneyBs(tasaActiva)}
              </Chip>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {OPCIONES_TASA_COTIZACION.map((op) => {
              const activo = tipoTasa === op.tipo
              const valorRef =
                op.tipo === 'USD_BCV'
                  ? tasasHoy.USD_BCV
                  : op.tipo === 'EUR_BCV'
                    ? tasasHoy.EUR_BCV
                    : op.tipo === 'USDT'
                      ? tasasHoy.USDT
                      : tasaManualNum
              return (
                <label
                  key={op.tipo}
                  className={cn(
                    'flex cursor-pointer items-start gap-2.5 rounded-[8px] border p-2.5 text-left transition-colors',
                    activo
                      ? 'border-royal-600 bg-royal-600/10 ring-royal-600/30 ring-1'
                      : 'border-hairline bg-surface hover:border-ink/30',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={activo}
                    onChange={() => elegirTipoTasa(op.tipo)}
                    className="accent-royal-600 mt-0.5 size-4 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-ink/90 text-xs font-semibold">
                        {op.icono} {op.titulo}
                      </span>
                      <span className="text-ink/50 font-mono text-[10px] font-semibold">{op.moneda}</span>
                    </div>
                    <div className="text-royal-700 dark:text-royal-300 mt-0.5 font-mono text-xs font-bold">
                      {valorRef > 0 ? moneyBs(valorRef) : op.tipo === 'MANUAL' ? 'Definir abajo' : 'Escribir tasa'}
                    </div>
                    <div className="text-ink/50 mt-0.5 text-[11px] leading-tight">{op.descripcion}</div>
                  </div>
                </label>
              )
            })}
          </div>

          <div className="border-hairline mt-2.5 grid gap-2 border-t pt-2.5 sm:grid-cols-3">
            <label className="text-ink/65 text-[11px] font-semibold uppercase">
              Valor de tasa aplicada ({infoTasa.par}) {tipoTasa === 'MANUAL' ? '*' : '(ajustable)'}
              <input
                className={cn(CAMPO, 'mt-1 font-mono')}
                inputMode="decimal"
                placeholder={tasaSugerida > 0 ? cifra2(tasaSugerida) : 'Ej.: 1.015,30'}
                value={tasaManualStr}
                onChange={(e) => setTasaManualStr(comoNumero(e.target.value, { maxDecimales: 8, sinNegativos: true }))}
              />
            </label>
            {tipoTasa === 'MANUAL' ? (
              <label className="text-ink/65 text-[11px] font-semibold uppercase">
                Nombre de la tasa (opcional)
                <input
                  className={cn(CAMPO, 'mt-1')}
                  maxLength={60}
                  placeholder="Ej.: Promedio, Acordada, Paralelo…"
                  value={tasaEtiqueta}
                  onChange={(e) => setTasaEtiqueta(e.target.value)}
                />
              </label>
            ) : (
              <div className="text-ink/60 self-end pb-1 text-xs sm:col-span-2">
                {tasaActiva > 0 ? (
                  <>
                    Conversión activa: <strong>1 {infoTasa.simbolo} = {moneyBs(tasaActiva)}</strong>
                    {tasaManualNum > 0 ? (
                      <button
                        type="button"
                        className="text-royal-700 dark:text-royal-300 ml-2 underline"
                        onClick={() => setTasaManualStr('')}
                      >
                        Usar tasa del día ({tasaSugerida > 0 ? moneyBs(tasaSugerida) : 'auto'})
                      </button>
                    ) : (
                      <span className="text-ink/45"> · tomada automáticamente de {infoTasa.corta}</span>
                    )}
                  </>
                ) : (
                  <span className="text-warning">Indicá la tasa en Bs arriba para ver todas las conversiones en Bolívares.</span>
                )}
              </div>
            )}
            {tipoTasa === 'MANUAL' ? (
              <div className="text-ink/60 self-end pb-1 text-xs">
                {tasaActiva > 0 ? (
                  <>
                    1 unidad = <strong>{moneyBs(tasaActiva)}</strong>
                  </>
                ) : (
                  <span className="text-warning">Escribí la tasa en Bs acordada con el proveedor.</span>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {/* C. Conversor Bs ⇄ Divisa */}
        <div>
          <div className="text-ink/75 mb-1.5 text-sm font-medium">
            Conversor Bs ⇄ {infoTasa.simbolo} (ayuda: pasá un precio de bolívares a {infoTasa.corta} o al revés)
          </div>
          <div className="border-royal-600/40 grid gap-2 rounded-[8px] border p-3 sm:grid-cols-4">
            <label className="text-ink/55 text-[11px] font-semibold uppercase">
              Conversor · Monto
              <input
                className={CAMPO}
                inputMode="decimal"
                value={convMonto}
                onChange={(e) => setConvMonto(comoNumero(e.target.value, { maxDecimales: 2, sinNegativos: true }))}
              />
            </label>
            <label className="text-ink/55 text-[11px] font-semibold uppercase">
              Dirección
              <select className={CAMPO} value={convDir} onChange={(e) => setConvDir(e.target.value as 'bs_usd' | 'usd_bs')}>
                <option value="bs_usd">Bs → {infoTasa.simbolo}</option>
                <option value="usd_bs">{infoTasa.simbolo} → Bs</option>
              </select>
            </label>
            <label className="text-ink/55 text-[11px] font-semibold uppercase">
              {infoTasa.larga} ({infoTasa.par})
              <input
                className={CAMPO}
                inputMode="decimal"
                placeholder={tasaActiva > 0 ? cifra2(tasaActiva) : ''}
                value={convTasa}
                onChange={(e) => setConvTasa(comoNumero(e.target.value, { maxDecimales: 8, sinNegativos: true }))}
              />
            </label>
            <div className="text-ink/80 self-end pb-1.5 text-sm">
              {parseMontoEs(convMonto) > 0 && tasaConv > 0 ? (
                <>
                  Equivale a{' '}
                  <strong>
                    {convDir === 'bs_usd'
                      ? fmtCot(parseMontoEs(convMonto) / tasaConv)
                      : moneyBs(parseMontoEs(convMonto) * tasaConv)}
                  </strong>
                </>
              ) : (
                <span className="text-ink/45">—</span>
              )}
            </div>
          </div>
        </div>

        {/* D. Cotización por ítem */}
        <div>
          <div className="text-ink/75 mb-1 text-sm font-medium">
            Cotización por ítem (precio a <strong>{infoTasa.larga}</strong> y/o en USD efectivo — siempre con su equivalente en Bs)
          </div>
          <p className="text-ink/55 mb-2 text-xs">
            💡 Si el proveedor ofrece el mismo producto en <strong>varias marcas/modelos</strong>, usá <strong>＋ marca</strong>{' '}
            para agregar otra variante con su propio precio.
          </p>
          {hayGenerales ? (
            <p className="text-ink/55 mb-2 text-xs">
              📦 <strong>Se guarda en inventario como</strong>: el nombre con que cada renglón entra al inventario al recibirlo.
              Por defecto queda <strong>como viene de la SP</strong>; con <strong>Cambiar</strong> elegís un producto que ya
              existe. Ninguna ficha existente se renombra.
            </p>
          ) : null}
          <div className="border-hairline overflow-x-auto rounded-[6px] border">
            <table className="w-full min-w-[1080px] text-xs">
              <thead className="text-ink/60 text-left">
                <tr className="bg-ink/4">
                  <th className="px-2 py-1.5" rowSpan={2}>
                    SKU
                  </th>
                  <th className="px-2 py-1.5" rowSpan={2}>
                    Producto
                  </th>
                  {hayGenerales ? (
                    <th className="px-2 py-1.5" rowSpan={2}>
                      Se guarda en inventario como
                    </th>
                  ) : null}
                  <th className="px-2 py-1.5" rowSpan={2}>
                    Marca / modelo
                  </th>
                  <th className="px-2 py-1.5" rowSpan={2}>
                    Se compra en
                  </th>
                  <th className="px-2 py-1.5" rowSpan={2}>
                    Cant.
                  </th>
                  <th className="bg-[rgba(80,140,255,.10)] px-2 py-1.5 text-center" colSpan={2}>
                    <div>Pago en Bs · {infoTasa.corta}</div>
                    {tasaActiva > 0 ? (
                      <div className="text-ink/50 font-mono text-[10px] font-normal">
                        1 {infoTasa.simbolo} = {moneyBs(tasaActiva)}
                      </div>
                    ) : null}
                  </th>
                  <th className="bg-[rgba(255,120,120,.10)] px-2 py-1.5 text-center" colSpan={2}>
                    <div>Pago en USD efectivo</div>
                    {tasaUsdHoy > 0 ? (
                      <div className="text-ink/50 font-mono text-[10px] font-normal">ref. {moneyBs(tasaUsdHoy)}/$</div>
                    ) : null}
                  </th>
                  <th className="px-2 py-1.5 text-right" rowSpan={2}>
                    Diferencia
                  </th>
                  <th className="px-2 py-1.5 text-right" rowSpan={2}>
                    Var. %
                  </th>
                  <th className="px-2 py-1.5" rowSpan={2} />
                </tr>
                <tr className="bg-ink/4">
                  <th className="bg-[rgba(80,140,255,.10)] px-2 py-1 text-right">Precio</th>
                  <th className="bg-[rgba(80,140,255,.10)] px-2 py-1 text-right">Total</th>
                  <th className="bg-[rgba(255,120,120,.10)] px-2 py-1 text-right">Precio</th>
                  <th className="bg-[rgba(255,120,120,.10)] px-2 py-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const cant = parseMontoEs(f.cantidad)
                  const p = r4(parseMontoEs(f.precio))
                  const pu = r4(parseMontoEs(f.precio_usd))
                  const tb = r2(cant * p)
                  const tu = r2(cant * pu)
                  const dif = tb > 0 && tu > 0 ? r2(tb - tu) : 0
                  const varPct = p > 0 && pu > 0 ? ((p - pu) / p) * 100 : null
                  const uc = f.unidad_compra.trim().toUpperCase()
                  const conUC = !!uc && uc !== f.unidad.toUpperCase()
                  const factor = parseMontoEs(f.factor_compra)
                  const art = f.articulo_id ? articulos?.find((a) => a.id === f.articulo_id) : null
                  return (
                    <tr key={f.key} className="border-hairline border-t align-top">
                      <td className="px-2 py-1.5 font-mono">
                        {f.variante ? <span title="Variante del mismo producto">↳ </span> : null}
                        {f.sku}
                      </td>
                      <td className="px-2 py-1.5">
                        {f.nombre}
                        {f.agregado ? (
                          <Chip tone="info" className="ml-1">
                            agregado
                          </Chip>
                        ) : null}
                      </td>
                      {hayGenerales ? (
                        <td className="w-56 px-2 py-1.5">
                          {f.general && !f.variante ? (
                            <>
                              <select
                                className={CAMPO}
                                value={f.articulo_id != null ? 'inventario' : 'como_viene'}
                                onChange={(e) =>
                                  setFilas((fs) =>
                                    fs.map((x) =>
                                      x.sku === f.sku
                                        ? { ...x, articulo_id: e.target.value === 'inventario' ? (x.articulo_id ?? 0) : null }
                                        : x,
                                    ),
                                  )
                                }
                              >
                                <option value="como_viene">Dejar como viene</option>
                                <option value="inventario">Cambiar · elegir del inventario</option>
                              </select>
                              {f.articulo_id != null ? (
                                <div className="mt-1">
                                  <SelectBuscable
                                    label="Ficha del inventario"
                                    opciones={opcionesArt}
                                    valor={f.articulo_id ? String(f.articulo_id) : ''}
                                    onCambio={(v) =>
                                      setFilas((fs) => fs.map((x) => (x.sku === f.sku ? { ...x, articulo_id: Number(v) || 0 } : x)))
                                    }
                                    vacio="Buscar producto del inventario…"
                                  />
                                  {art ? (
                                    <div className="text-success mt-0.5">
                                      ✓ Entra a <strong>{art.nombre}</strong> {art.codigo} · en {art.unidad}
                                    </div>
                                  ) : (
                                    <div className="text-warning mt-0.5">⚠ Elegí el producto del inventario.</div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-ink/50 mt-0.5">Queda como viene de la SP.</div>
                              )}
                            </>
                          ) : (
                            <span className="text-ink/40">—</span>
                          )}
                        </td>
                      ) : null}
                      <td className="w-40 px-2 py-1.5">
                        <input
                          className={CAMPO}
                          placeholder="Marca"
                          maxLength={60}
                          value={f.marca}
                          onChange={(e) => setFila(f.key, { marca: e.target.value.toUpperCase() })}
                        />
                        <input
                          className={cn(CAMPO, 'mt-1')}
                          placeholder="Modelo"
                          maxLength={60}
                          value={f.modelo}
                          onChange={(e) => setFila(f.key, { modelo: e.target.value.toUpperCase() })}
                        />
                      </td>
                      <td className="w-36 px-2 py-1.5">
                        <input
                          className={CAMPO}
                          list="unidades-compra"
                          placeholder={f.unidad || 'UND'}
                          maxLength={20}
                          value={f.unidad_compra}
                          onChange={(e) => setFila(f.key, { unidad_compra: e.target.value.toUpperCase() })}
                        />
                        {conUC ? (
                          <div className="mt-1 flex items-center gap-1">
                            <span className="text-ink/50">de</span>
                            <input
                              className={cn(CAMPO, 'w-16')}
                              inputMode="decimal"
                              title={`¿Cuántas ${f.unidad} trae cada ${uc}?`}
                              value={f.factor_compra}
                              onChange={(e) => setFila(f.key, { factor_compra: comoNumero(e.target.value, { maxDecimales: 4, sinNegativos: true }) })}
                            />
                          </div>
                        ) : null}
                        <div className="text-ink/50 mt-0.5">
                          {conUC && factor > 0
                            ? `= ${fmtCant(cant * factor)} ${f.unidad} · ${fmtCot(p / factor)}/${f.unidad}`
                            : `en ${f.unidad || 'unidad de uso'}`}
                        </div>
                      </td>
                      <td className="w-20 px-2 py-1.5">
                        <input
                          className={cn(CAMPO, 'text-right')}
                          inputMode="decimal"
                          value={f.cantidad}
                          onChange={(e) => setFila(f.key, { cantidad: comoNumero(e.target.value, { maxDecimales: 4, sinNegativos: true }) })}
                        />
                      </td>
                      <td className="w-28 bg-[rgba(80,140,255,.05)] px-2 py-1.5">
                        <input
                          className={cn(CAMPO, 'text-right')}
                          inputMode="decimal"
                          placeholder="0,00"
                          value={f.precio}
                          onChange={(e) => setFila(f.key, { precio: comoNumero(e.target.value, { maxDecimales: 4, sinNegativos: true }) })}
                        />
                        {p > 0 && enBsCot(p) ? (
                          <div className="text-royal-700 dark:text-royal-300 mt-0.5 text-right font-mono text-[10px] font-medium whitespace-nowrap tabular-nums">
                            {enBsCot(p)}
                          </div>
                        ) : null}
                      </td>
                      <td className="bg-[rgba(80,140,255,.05)] px-2 py-1.5 text-right font-mono whitespace-nowrap tabular-nums">
                        {tb ? (
                          <>
                            <div>{fmtCot(tb)}</div>
                            {enBsCot(tb) ? (
                              <div className="text-royal-700 dark:text-royal-300 text-[10.5px] font-semibold">{enBsCot(tb)}</div>
                            ) : null}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="w-28 bg-[rgba(255,120,120,.05)] px-2 py-1.5">
                        <input
                          className={cn(CAMPO, 'text-right')}
                          inputMode="decimal"
                          placeholder="—"
                          value={f.precio_usd}
                          onChange={(e) => setFila(f.key, { precio_usd: comoNumero(e.target.value, { maxDecimales: 4, sinNegativos: true }) })}
                        />
                        {pu > 0 && enBsCot(pu) ? (
                          <div className="text-ink/55 mt-0.5 text-right font-mono text-[10px] whitespace-nowrap tabular-nums">{enBsCot(pu)}</div>
                        ) : null}
                      </td>
                      <td className="bg-[rgba(255,120,120,.05)] px-2 py-1.5 text-right font-mono whitespace-nowrap tabular-nums">
                        {tu ? (
                          <>
                            <div>{money(tu)}</div>
                            {enBsCot(tu) ? <div className="text-ink/60 text-[10.5px]">{enBsCot(tu)}</div> : null}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={cn('px-2 py-1.5 text-right font-mono whitespace-nowrap tabular-nums', dif > 0 && 'text-success')}>
                        {dif ? (
                          <>
                            <div>{fmtCot(dif)}</div>
                            {enBsCot(dif) ? <div className="text-[10px] opacity-80">{enBsCot(dif)}</div> : null}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">{varPct != null ? `${varPct.toFixed(1)}%` : '—'}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {!f.variante ? (
                          <Button size="sm" variant="ghost" title="Agregar otra marca/modelo de este producto" onClick={() => agregarVariante(f)}>
                            ＋ marca
                          </Button>
                        ) : null}
                        {f.variante || f.agregado ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger"
                            title={f.variante ? 'Quitar esta variante' : 'Quitar este producto'}
                            onClick={() => quitarFila(f.key)}
                          >
                            ✕
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-hairline border-t font-semibold">
                  <td colSpan={hayGenerales ? 7 : 6} className="px-2 py-1.5 text-right">
                    SUBTOTAL
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">
                    {bcvSubtotal ? (
                      <>
                        <div>{fmtCot(bcvSubtotal)}</div>
                        {enBsCot(bcvSubtotal) ? (
                          <div className="text-royal-700 dark:text-royal-300 text-[11px]">{enBsCot(bcvSubtotal)}</div>
                        ) : null}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td />
                  <td className="px-2 py-1.5 text-right font-mono">
                    {usdTotal ? (
                      <>
                        <div>{money(usdTotal)}</div>
                        {enBsCot(usdTotal) ? <div className="text-ink/65 text-[11px]">{enBsCot(usdTotal)}</div> : null}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={cn('px-2 py-1.5 text-right font-mono', ahorro > 0 && 'text-success')}>
                    {ahorro ? fmtCot(ahorro) : '—'}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
            <datalist id="unidades-compra">
              {UNIDADES_COMPRA.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>
          {hayUC ? (
            <p className="text-ink/55 mt-1 text-xs">
              📦 Cantidad y precio van en la medida del proveedor. Al recibir, el inventario entra en la unidad de uso (ej.: 10
              BULTO de 50 = 500 KILOGRAMO, y el costo por kilo es el precio ÷ 50).
            </p>
          ) : null}
          {puedeAgregarProductos ? (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="min-w-[18rem] flex-1">
                <SelectBuscable
                  label="Agregar producto"
                  opciones={opcionesAgregar}
                  valor={agregarArt}
                  onCambio={setAgregarArt}
                  vacio="Buscar producto del inventario…"
                />
              </div>
              <Button variant="outline" disabled={!agregarArt} onClick={agregarProducto}>
                ＋ Agregar
              </Button>
              <p className="text-ink/50 w-full text-xs">
                {oferta?.estado === 'aceptada'
                  ? 'Se suma a la cotización aceptada; al guardar, la OC toma el producto con su precio y sigue esperando la aprobación.'
                  : 'Se suma a esta cotización con su cantidad y precio.'}
              </p>
            </div>
          ) : null}
        </div>

        {/* E. Totales */}
        <div className="border-hairline rounded-[8px] border p-3">
          <div className="text-ink/85 mb-1 font-semibold">
            💵 Totales · <span className="text-royal-700 dark:text-royal-300">{infoTasa.icono} {infoTasa.larga}</span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>
              Total ({infoTasa.corta}):{' '}
              <strong>
                {bcvSubtotal ? `${fmtCot(bcvSubtotal)}${enBsCot(bcvSubtotal) ? ` · ${enBsCot(bcvSubtotal)}` : ''}` : '—'}
              </strong>
            </span>
            <span>
              Total USD efectivo:{' '}
              <strong className="text-success">
                {precioEfectivo || (!bcvSubtotal && usdTotal)
                  ? `${money(usdTotal)}${enBsCot(usdTotal) ? ` · ${enBsCot(usdTotal)}` : ''}`
                  : '—'}
              </strong>
            </span>
            {ahorro > 0 ? (
              <span>
                Diferencia: <strong>{fmtCot(ahorro)}</strong>{' '}
                <Chip tone="success">−{ahorroPct}%</Chip>
              </span>
            ) : null}
          </div>
          <div className="mt-2">
            <div className="text-ink/75 mb-1.5 text-sm font-medium">Descuento obtenido</div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink/60">%</span>
              <input
                className={cn(CAMPO, 'w-20')}
                inputMode="decimal"
                placeholder="0"
                aria-label="Descuento en porcentaje"
                value={descuentoModo === 'pct' ? descuentoPct : baseFactura > 0 && descuentoObt > 0 ? cifra2((descuentoObt / baseFactura) * 100) : ''}
                onChange={(e) => {
                  setDescuentoModo('pct')
                  setDescuentoPct(comoNumero(e.target.value, { maxEnteros: 3, maxDecimales: 2, sinNegativos: true }))
                }}
              />
              <span className="text-ink/60">Monto</span>
              <input
                className={cn(CAMPO, 'w-28')}
                inputMode="decimal"
                placeholder="0,00"
                aria-label="Descuento en monto"
                value={descuentoModo === 'monto' ? descuentoStr : descuentoObt > 0 ? cifra2(descuentoObt) : ''}
                onChange={(e) => {
                  setDescuentoModo('monto')
                  setDescuentoStr(comoNumero(e.target.value, { maxDecimales: 2, sinNegativos: true }))
                }}
              />
            </div>
          </div>
          <p className="text-ink/55 mt-1 text-xs">
            Descuento negociado que se le resta al monto. Factura a pagar: <strong>{fmtCot(facturaNeta)}</strong>
            {enBsCot(facturaNeta) ? <> (<strong>{enBsCot(facturaNeta)}</strong>)</> : null} · descuento{' '}
            <strong>{fmtCot(descuentoObt)}</strong>
          </p>
        </div>

        {/* F. Impuestos */}
        <div className="border-hairline rounded-[8px] border p-3">
          <div className="text-ink/85 font-semibold">
            🧾 Impuestos{' '}
            <span className="text-ink/55 text-xs font-normal">
              (se calculan sobre la factura neta {fmtCot(facturaNeta)}
              {enBsCot(facturaNeta) ? ` · ${enBsCot(facturaNeta)}` : ''} y se suman al total, salvo que los precios ya traigan el IVA)
            </span>
          </div>
          <label className="mt-2 inline-flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-royal-600 size-4" checked={incluyeIva} onChange={(e) => setIncluyeIva(e.target.checked)} />
            Incluye IVA
          </label>
          {incluyeIva ? (
            <div className="mt-1 ml-6 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-ink/60">%</span>
                <input
                  className={cn(CAMPO, 'w-20')}
                  inputMode="decimal"
                  placeholder="16"
                  value={ivaModo === 'pct' ? ivaPct : ''}
                  onChange={(e) => {
                    setIvaModo('pct')
                    setIvaPct(comoNumero(e.target.value, { maxEnteros: 3, maxDecimales: 2, sinNegativos: true }))
                  }}
                />
                <span className="text-ink/60">Monto</span>
                <input
                  className={cn(CAMPO, 'w-28')}
                  inputMode="decimal"
                  placeholder="0,00"
                  value={ivaModo === 'monto' ? ivaMonto : cifra2(ivaCalc)}
                  onChange={(e) => {
                    setIvaModo('monto')
                    setIvaMonto(comoNumero(e.target.value, { maxDecimales: 2, sinNegativos: true }))
                  }}
                />
                <span>
                  IVA: <strong>{money(ivaFinal)}</strong>
                  {ivaAdentro ? ' (ya adentro de los precios)' : ''}
                </span>
              </div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-royal-600 size-4"
                  checked={ivaIncluido}
                  onChange={(e) => setIvaIncluido(e.target.checked)}
                />
                <span>
                  Los precios cotizados <strong>ya traen el IVA</strong> (factura de punto de venta).
                </span>
              </label>
              <p className="text-ink/50 text-xs">
                El monto se guarda para la retención y el libro fiscal, pero no se suma otra vez al total. Si cargás el %, el
                monto se calcula sobre la base sin IVA (factura ÷ (1 + %)), como lo imprime la factura.
              </p>
            </div>
          ) : null}
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-royal-600 size-4" checked={incluyeIgtf} onChange={(e) => setIncluyeIgtf(e.target.checked)} />
            Incluye IGTF
          </label>
          {incluyeIgtf ? (
            <div className="mt-1 ml-6 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink/60">%</span>
              <input
                className={cn(CAMPO, 'w-20')}
                inputMode="decimal"
                placeholder="3"
                value={igtfModo === 'pct' ? igtfPct : ''}
                onChange={(e) => {
                  setIgtfModo('pct')
                  setIgtfPct(comoNumero(e.target.value, { maxEnteros: 3, maxDecimales: 2, sinNegativos: true }))
                }}
              />
              <span className="text-ink/60">Monto</span>
              <input
                className={cn(CAMPO, 'w-28')}
                inputMode="decimal"
                placeholder="0,00"
                value={igtfModo === 'monto' ? igtfMonto : cifra2(igtfCalc)}
                onChange={(e) => {
                  setIgtfModo('monto')
                  setIgtfMonto(comoNumero(e.target.value, { maxDecimales: 2, sinNegativos: true }))
                }}
              />
              <span>
                IGTF: <strong>{money(igtfFinal)}</strong>
              </span>
            </div>
          ) : null}
          <div className="mt-3 text-sm">
            <div className="text-ink/75 font-medium">Ajuste frente a la factura (± con signo)</div>
            <div className="mt-1 flex flex-wrap gap-2">
              <input
                className={cn(CAMPO, 'w-28')}
                inputMode="decimal"
                placeholder="0,00"
                value={ajusteStr}
                onChange={(e) => setAjusteStr(comoNumero(e.target.value, { maxDecimales: 2 }))}
                aria-label="Ajuste"
              />
              <input
                className={cn(CAMPO, 'min-w-[16rem] flex-1')}
                maxLength={120}
                placeholder="Motivo (p. ej. redondeo de precios unitarios de la factura N.º …)"
                value={ajusteMotivo}
                onChange={(e) => setAjusteMotivo(e.target.value)}
                aria-label="Motivo del ajuste"
              />
            </div>
            <p className="text-ink/50 mt-1 text-xs">
              Para que la OC dé exactamente lo que dice la factura cuando los precios unitarios redondeados no cierran al
              céntimo. Se ve en el pie de la OC con su motivo.
            </p>
          </div>
          <div className="border-royal-600/30 bg-royal-600/6 mt-3 rounded-[8px] border px-3 py-2 text-sm">
            <div>
              Total a pagar (con impuestos):{' '}
              <strong className="text-royal-700 dark:text-royal-300 font-mono">{fmtCot(totalConImpuestos)}</strong>
              <span className="text-ink/55">
                {' '}
                = {fmtCot(facturaNeta)}
                {ivaFinal ? (ivaAdentro ? ` (con IVA ${fmtCot(ivaFinal)} adentro)` : ` + IVA ${fmtCot(ivaFinal)}`) : ''}
                {igtfFinal ? ` + IGTF ${fmtCot(igtfFinal)}` : ''}
                {ajusteMonto ? ` ± ajuste ${fmtCot(ajusteMonto)}` : ''}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                Conversión en Bolívares ({infoTasa.icono} {infoTasa.corta}
                {tasaActiva > 0 ? ` · ${moneyBs(tasaActiva)}` : ''}):{' '}
                <strong className="text-royal-700 dark:text-royal-300 font-mono text-base">
                  {enBsCot(totalConImpuestos) ?? 'Indicá tasa'}
                </strong>
              </span>
              {ivaFinal > 0 && enBsCot(ivaFinal) ? (
                <span className="text-ink/60 text-xs">IVA en Bs: {enBsCot(ivaFinal)}</span>
              ) : null}
              {igtfFinal > 0 && enBsCot(igtfFinal) ? (
                <span className="text-ink/60 text-xs">IGTF en Bs: {enBsCot(igtfFinal)}</span>
              ) : null}
            </div>
          </div>
        </div>

        {/* G. Fecha y condición */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Fecha de entrega prometida" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <label className="block">
            <span className="text-ink/75 mb-1.5 block text-sm font-medium">Condiciones del Pago *</span>
            <select className={cn(CAMPO, 'h-10')} value={condicion} onChange={(e) => setCondicion(e.target.value)}>
              <option value="">— elegir —</option>
              {CONDICIONES_PAGO.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.etiqueta}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* H. Notas */}
        <Textarea
          label="Notas"
          placeholder="Comentarios sobre la oferta, exclusiones, garantías…"
          rows={2}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
        />

        {/* I. Datos técnicos */}
        <div className="border-hairline rounded-[8px] border p-3">
          <div className="text-ink/85 mb-2 font-semibold">📋 Datos técnicos del producto</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {DATOS_TECNICOS.map((t) => (
              <Input
                key={t.clave}
                label={t.label}
                placeholder={t.placeholder}
                maxLength={120}
                value={detalle[t.clave] ?? ''}
                onChange={(e) => setDetalle((d) => ({ ...d, [t.clave]: e.target.value }))}
              />
            ))}
          </div>
        </div>

        {/* J. Logística */}
        <div className="border-hairline rounded-[8px] border p-3">
          <div className="text-ink/85 mb-2 font-semibold">
            🚚 Costos logísticos (¿incluidos en el precio o por cuenta del comprador?)
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            {LOGISTICA.map((l) => (
              <label key={l.clave} className="block text-sm">
                <span className="text-ink/75 mb-1 block font-medium">{l.label}</span>
                <select
                  className={CAMPO}
                  value={detalle.logistica?.[l.clave] ?? ''}
                  onChange={(e) =>
                    setDetalle((d) => {
                      const log = { ...(d.logistica ?? {}) }
                      if (e.target.value) log[l.clave] = e.target.value as 'incluido' | 'comprador'
                      else delete log[l.clave]
                      return { ...d, logistica: log }
                    })
                  }
                >
                  <option value="">— sin especificar —</option>
                  <option value="incluido">Incluido en el precio</option>
                  <option value="comprador">Por cuenta del comprador</option>
                </select>
              </label>
            ))}
          </div>
        </div>

        {/* K. Adjuntos */}
        <div>
          <label className="text-ink/75 mb-1.5 block text-sm font-medium">
            Cargue la cotización del proveedor (hasta 4 fotos/PDF)
            <input type="file" multiple accept="application/pdf,image/*" className="mt-1 block text-sm" onChange={elegirArchivos} />
          </label>
          {archivos.map((f, i) => (
            <div key={`${f.name}-${i}`} className="text-ink/75 text-xs">
              ✓ {f.name} ({Math.round(f.size / 1024)} KB){' '}
              <button
                type="button"
                className="text-danger"
                title="Quitar este archivo"
                onClick={() => setArchivos((a) => a.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
          {editando ? (
            actuales.length ? (
              <div className="mt-1 text-xs">
                <div className="text-ink/60">📎 Adjuntos actuales (los nuevos se suman; podés quitar los que no quieras):</div>
                {actuales.map((a) => (
                  <div key={a.path}>
                    📎 {a.filename}{' '}
                    <button
                      type="button"
                      className="text-danger"
                      title="Quitar este adjunto"
                      onClick={() => setActuales((x) => x.filter((y) => y.path !== a.path))}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-ink/50 mt-1 text-xs">Sin adjuntos. Cargá las fotos/PDF de la cotización si querés.</p>
            )
          ) : null}
          <p className="text-ink/45 mt-1 text-xs">
            PDF o imágenes · máximo 4 archivos · 10 MB c/u. Podés ir agregando varias fotos de la cotización.
          </p>
        </div>
      </div>
    </Modal>
  )
}
