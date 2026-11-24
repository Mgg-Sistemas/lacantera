/* ============================================================
   La Cantera · Compras FIJAS (Plantillas Recurrentes de Compra)
   Lógica pura: frecuencias, semáforo de fechas y armado de renglones.

   Plantillas de las compras que se repiten (Mercado Comedor, Carnes,
   Papelería y Romana, Filtros y Lubricantes, EPP y Seguridad…).
   Cada una define cada cuánto se compra, qué productos entran (por
   palabras clave de categoría y/o una lista de materiales fijos),
   quién solicita y si va por Solicitud de Pedido (cotización → OC)
   o por Compra directa.

   «Generar» arma la solicitud precargada con las cantidades de la
   última vez que se generó esa misma plantilla.
   Las sugerencias nuevas aparecen como «sugerida: true»: no avisan
   ni se generan hasta que Compras las configure y las guarde.
   ============================================================ */

export type FrecuenciaFija = 'semanal' | 'quincenal' | 'mensual' | 'cada_dias'
export type ModoFija = 'solicitud' | 'compra_directa'

export interface ProductoFijo {
  producto_id: string | number
  sku: string
  nombre: string
  unidad: string
  cantidad: number
}

export function agregarProductoFijo(
  lista: ProductoFijo[],
  producto: { id: string | number; sku?: string; codigo?: string; nombre: string; unidad: string },
): ProductoFijo[] {
  const pId = String(producto.id)
  if (lista.some((item) => String(item.producto_id) === pId)) return lista
  return [
    ...lista,
    {
      producto_id: producto.id,
      sku: producto.sku ?? producto.codigo ?? '',
      nombre: producto.nombre,
      unidad: producto.unidad,
      cantidad: 1,
    },
  ]
}

export interface CompraFija {
  id: string
  nombre: string
  icono: string
  frecuencia: FrecuenciaFija
  cada_dias: number | null
  proxima_fecha: string // YYYY-MM-DD
  activa: boolean
  modo: ModoFija
  permite_cotizar: boolean
  solicitante: string | null
  unidad_solicitante: string | null
  finalidad: string | null
  urgente: boolean
  proveedor_id: string | number | null
  proveedor_nombre: string | null
  categorias: string[]
  productos: ProductoFijo[]
  nota: string | null
  orden: number
  /** Plantilla sugerida que Compras todavía no ha configurado: no avisa ni se genera hasta guardarla. */
  sugerida: boolean
  ultima_ref_tipo: 'orden' | 'compra_directa' | null
  ultima_ref_id: string | null
  ultima_codigo: string | null
  ultima_generada_en: string | null
  updated_by?: string | null
}

export const FRECUENCIAS: { valor: FrecuenciaFija; etiqueta: string }[] = [
  { valor: 'semanal', etiqueta: 'Semanal' },
  { valor: 'quincenal', etiqueta: 'Quincenal' },
  { valor: 'mensual', etiqueta: 'Mensual' },
  { valor: 'cada_dias', etiqueta: 'Cada cierto número de días' },
]

export const FINALIDAD_MERCADO_FIJA = 'PEDIDO PARA RESTABLECER EL MERCADO'

/** Texto legible de la frecuencia: «Semanal», «Cada 20 días»… */
export function textoFrecuencia(c: Pick<CompraFija, 'frecuencia' | 'cada_dias'>): string {
  if (c.frecuencia === 'semanal') return 'Semanal'
  if (c.frecuencia === 'quincenal') return 'Quincenal'
  if (c.frecuencia === 'mensual') return 'Mensual'
  return `Cada ${c.cada_dias ?? 30} días`
}

/** Suma días a una fecha ISO (YYYY-MM-DD) sin problemas de huso horario. */
function sumarDiasIso(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const f = new Date(Date.UTC(y, m - 1, d))
  f.setUTCDate(f.getUTCDate() + dias)
  return f.toISOString().slice(0, 10)
}

/** Suma meses manteniendo el día (o el último del mes si no existe). */
function sumarMesesIso(iso: string, meses: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const objetivoMes = m - 1 + meses
  const nuevoY = y + Math.floor(objetivoMes / 12)
  const nuevoM = ((objetivoMes % 12) + 12) % 12
  const ultimoDia = new Date(Date.UTC(nuevoY, nuevoM + 1, 0)).getUTCDate()
  const diaReal = Math.min(d, ultimoDia)
  const mm = String(nuevoM + 1).padStart(2, '0')
  const dd = String(diaReal).padStart(2, '0')
  return `${nuevoY}-${mm}-${dd}`
}

/**
 * Calcula la próxima fecha de compra corriendo exactamente un período desde
 * la última que tocaba. Si quedó vencida hace varios períodos, la adelanta
 * hasta la primera fecha posterior a `hoy`.
 */
export function siguienteFecha(
  c: Pick<CompraFija, 'frecuencia' | 'cada_dias' | 'proxima_fecha'>,
  hoy: string,
): string {
  let f = c.proxima_fecha || hoy
  const avanzar = (base: string) => {
    switch (c.frecuencia) {
      case 'semanal':
        return sumarDiasIso(base, 7)
      case 'quincenal':
        return sumarDiasIso(base, 15)
      case 'mensual':
        return sumarMesesIso(base, 1)
      case 'cada_dias':
        return sumarDiasIso(base, Math.max(1, Number(c.cada_dias) || 30))
    }
  }
  f = avanzar(f)
  let tope = 0
  while (f <= hoy && tope < 365) {
    f = avanzar(f)
    tope++
  }
  return f
}

/** Días entre hoy y la fecha: negativo = vencida, 0 = hoy, positivo = faltan días. */
export function diasHasta(fechaIso: string, hoyIso: string): number {
  const a = new Date(`${fechaIso}T12:00:00Z`).getTime()
  const b = new Date(`${hoyIso}T12:00:00Z`).getTime()
  return Math.round((a - b) / (1000 * 60 * 60 * 24))
}

export type EstadoFija = 'vencida' | 'hoy' | 'pronto' | 'al_dia' | 'pausada' | 'sugerida'

/**
 * Semáforo de la compra fija:
 * - 'sugerida': plantilla de ejemplo sin configurar por Compras
 * - 'pausada': no está activa
 * - 'vencida': la fecha ya pasó
 * - 'hoy': toca hoy
 * - 'pronto': faltan 3 días o menos
 * - 'al_dia': faltan más de 3 días
 */
export function estadoFija(
  c: Pick<CompraFija, 'activa' | 'proxima_fecha'> & { sugerida?: boolean },
  hoy: string,
): EstadoFija {
  if (c.sugerida) return 'sugerida'
  if (!c.activa) return 'pausada'
  const d = diasHasta(c.proxima_fecha, hoy)
  if (d < 0) return 'vencida'
  if (d === 0) return 'hoy'
  if (d <= 3) return 'pronto'
  return 'al_dia'
}

export function textoEstadoFija(
  c: Pick<CompraFija, 'activa' | 'proxima_fecha'> & { sugerida?: boolean },
  hoy: string,
): string {
  const est = estadoFija(c, hoy)
  const d = diasHasta(c.proxima_fecha, hoy)
  switch (est) {
    case 'sugerida':
      return 'Sugerencia · por configurar'
    case 'pausada':
      return 'Pausada'
    case 'vencida':
      return `Vencida hace ${Math.abs(d)} día${Math.abs(d) === 1 ? '' : 's'}`
    case 'hoy':
      return 'Toca hoy'
    case 'pronto':
      return `Toca en ${d} día${d === 1 ? '' : 's'}`
    case 'al_dia':
      return `Toca en ${d} días`
  }
}

/** Normaliza texto quitando acentos y espacios superfluos. */
export function normCat(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/** ¿La categoría del producto coincide con alguna palabra clave de la plantilla? */
export function entraPorCategoria(categoria: string | null | undefined, palabras: string[]): boolean {
  if (!categoria || !palabras.length) return false
  const c = normCat(categoria)
  return palabras.some((p) => {
    const pal = normCat(p)
    return pal && c.includes(pal)
  })
}

export interface ArticuloOProducto {
  id: string | number
  sku?: string | null
  codigo?: string | null
  nombre: string
  categoria?: string | null
  unidad?: string | null
  estado?: string | null
  activo?: boolean
  marca?: string | null
  modelo?: string | null
}

export interface RenglonPlantilla {
  productoId: string | number
  sku: string
  nombre: string
  unidad: string
  cantidad: number
  comprar: boolean
  finalidad?: string
  marca?: string
  modelo?: string
}

/**
 * Los renglones de la plantilla: únicamente los productos explícitamente configurados
 * en la lista de materiales de la plantilla y los activos de sus categorías.
 *
 * Si la plantilla definió cantidad en un producto fijo, se respeta esa cantidad establecida;
 * si entra por categoría (o la cantidad es 0), se sugiere la de la última compra previa (o 1).
 * NUNCA se agregan productos ajenos de compras previas que no pertenezcan a la plantilla.
 */
export function renglonesDePlantilla(
  c: Pick<CompraFija, 'categorias' | 'productos'> & { finalidad?: string | null },
  activos: ArticuloOProducto[],
  previas: Map<string, number>,
): RenglonPlantilla[] {
  const porId = new Map(activos.map((p) => [String(p.id), p]))
  const elegidos: ArticuloOProducto[] = []
  const ya = new Set<string>()

  const sumar1 = (p: ArticuloOProducto | undefined) => {
    if (p && !ya.has(String(p.id))) {
      ya.add(String(p.id))
      elegidos.push(p)
    }
  }

  // 1. Productos fijos configurados en la plantilla
  for (const f of c.productos ?? []) {
    const prod = porId.get(String(f.producto_id))
    if (prod) {
      sumar1(prod)
    } else {
      // Producto fijo que quizás no esté en el catálogo activo inmediato
      sumar1({
        id: f.producto_id,
        sku: f.sku,
        nombre: f.nombre,
        unidad: f.unidad,
      })
    }
  }

  // 2. Productos activos que pertenecen a las categorías de la plantilla
  for (const p of activos) {
    const estadoActivo = p.estado ? p.estado === 'activo' : p.activo !== false
    if (estadoActivo && entraPorCategoria(p.categoria, c.categorias ?? [])) {
      sumar1(p)
    }
  }

  const fija = new Map((c.productos ?? []).map((f) => [String(f.producto_id), Number(f.cantidad) || 0]))

  return elegidos.map((p) => {
    const pId = String(p.id)
    const cantFija = fija.get(pId)
    const sku = p.sku ?? p.codigo ?? ''
    const cantidad =
      cantFija && cantFija > 0
        ? cantFija
        : (previas.get(pId) ?? previas.get(sku) ?? 1)

    return {
      productoId: p.id,
      sku,
      nombre: p.nombre,
      unidad: p.unidad || 'UND',
      comprar: true,
      cantidad,
      ...(p.marca ? { marca: p.marca } : {}),
      ...(p.modelo ? { modelo: p.modelo } : {}),
      ...(c.finalidad ? { finalidad: c.finalidad } : {}),
    }
  })
}

/** Mapa id/sku → cantidad de una compra previa. */
export function cantidadesPrevias(
  items: Array<{ productoId?: string | number; articulo_id?: number | null; sku?: string; cantidad: number }>,
): Map<string, number> {
  const m = new Map<string, number>()
  for (const it of items ?? []) {
    const cant = Number(it.cantidad) || 0
    if (cant <= 0) continue
    if (it.productoId != null) m.set(String(it.productoId), cant)
    if (it.articulo_id != null) m.set(String(it.articulo_id), cant)
    if (it.sku) m.set(it.sku, cant)
  }
  return m
}

/** Validación previa al guardar una compra fija. Devuelve null si es válida. */
export function errorPlantilla(
  c: Pick<CompraFija, 'nombre' | 'frecuencia' | 'cada_dias' | 'proxima_fecha' | 'categorias' | 'productos'>,
): string | null {
  const n = (c.nombre || '').trim()
  if (n.length < 3) return 'El nombre de la compra fija debe tener al menos 3 caracteres.'
  if (!c.proxima_fecha) return 'Indica la próxima fecha de la compra.'
  if (c.frecuencia === 'cada_dias' && (!(Number(c.cada_dias) > 0) || Number(c.cada_dias) > 365)) {
    return 'Indica cada cuántos días (entre 1 y 365) se repite la compra.'
  }
  const tieneCat = (c.categorias || []).filter((x) => x && x.trim()).length > 0
  const tieneProd = (c.productos || []).length > 0
  if (!tieneCat && !tieneProd) {
    return 'Agrega al menos una categoría o un producto fijo a la plantilla.'
  }
  return null
}
