/*
  COTIZACIONES Y OC COMO EN MGG · LO QUE NO ES PANTALLA (fase 2)

  Copiado de MGG (`impuestosOc.ts`, `score.ts`, `variantesOferta.ts`,
  `subOc.ts`, `modalidadPago.ts`, `ofertas.repository.ts` CONDICIONES_PAGO).
  La base (`private.compras_armar_oc`) hace las mismas cuentas al guardar:
  aquí se repiten para enseñar el resumen antes de confirmar. Si las dos
  dijeran cosas distintas, manda la base.

  Una diferencia, a propósito: las variantes de marca de un mismo producto no
  se suman en el total de la oferta (una fila por producto, la más cara), como
  dice el propio `variantesOferta.ts` de MGG. MGG las suma en `precio_total`.
*/
import type { ItemOrden, Oferta, Orden, EstadisticaProveedor } from '@/lib/api/pedidos'

export const r2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100
export const r4 = (n: number): number => Math.round((Number(n) || 0) * 10000) / 10000
const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** «1.234,56» o «1234.56» → 1234.56. Admite «.» o «,» como decimal (MGG `parseMontoEs`). */
export function parseMontoEs(s: string | number | null | undefined): number {
  if (typeof s === 'number') return Number.isFinite(s) ? s : 0
  const t = String(s ?? '').trim().replace(/\s/g, '')
  if (!t) return 0
  const coma = t.lastIndexOf(',')
  const punto = t.lastIndexOf('.')
  let limpio = t
  if (coma > -1 && punto > -1) {
    // El último separador es el decimal; el otro, de miles.
    limpio = coma > punto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  } else if (coma > -1) {
    limpio = t.replace(',', '.')
  }
  const n = Number(limpio.replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** Número en formato venezolano con 2 decimales, sin símbolo. */
export const cifra2 = (n: number | string | null | undefined): string =>
  num(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** MGG `money(n, 'Bs')`. */
export const moneyBs = (n: number | string | null | undefined): string => `Bs ${cifra2(n)}`

// ---------------------------------------------------------------------------
// Condición de pago y modalidad (MGG `CONDICIONES_PAGO`, `modalidadPago.ts`)
// ---------------------------------------------------------------------------

export type CondicionPago = 'contado' | 'contra_entrega' | 'anticipado' | 'credito'

export const CONDICIONES_PAGO: { valor: CondicionPago; etiqueta: string }[] = [
  { valor: 'contado', etiqueta: 'Pago de Contado' },
  { valor: 'contra_entrega', etiqueta: 'Pago Contra Entrega' },
  { valor: 'anticipado', etiqueta: 'Pago Anticipado' },
  { valor: 'credito', etiqueta: 'Pago a Crédito' },
]

export const labelCondicionPago = (c: string | null | undefined): string =>
  CONDICIONES_PAGO.find((x) => x.valor === c)?.etiqueta ?? (c || '—')

export type Modalidad = 'usd' | 'bs'

export function infoModalidad(m: Modalidad | null | undefined) {
  return m === 'usd'
    ? { label: 'Pago en $ (Divisa)', larga: 'Pago en $ (USD / Divisa)', corta: 'Pago en $', icono: '💵' }
    : { label: 'Pago en Bs al cambio (tasa BCV)', larga: 'Pago en Bs al cambio (tasa BCV)', corta: 'Pago en Bs (BCV)', icono: '🏦' }
}

// ---------------------------------------------------------------------------
// Impuestos (MGG `impuestosOc.ts`): la única fórmula del total
// ---------------------------------------------------------------------------

export interface PartesTotal {
  subtotal: number
  descuento?: number | null
  iva?: number | null
  igtf?: number | null
  iva_incluido?: boolean | null
  ajuste?: number | null
}

/** total = r2( max(0, subtotal − desc) + (iva_incluido ? 0 : iva) + igtf + ajuste ) */
export function totalDesdePartes(p: PartesTotal): number {
  return r2(
    Math.max(0, r2(p.subtotal) - Math.max(0, num(p.descuento))) +
      (p.iva_incluido ? 0 : Math.max(0, num(p.iva))) +
      Math.max(0, num(p.igtf)) +
      r2(num(p.ajuste)),
  )
}

/** Con el IVA ya adentro de los precios: base × p / (100 + p); si no, base × p / 100. */
export const ivaDesdePorcentaje = (base: number, pct: number, incluido = false): number =>
  r2(incluido ? (base * pct) / (100 + pct) : (base * pct) / 100)

export const porcentajeDesdeIva = (base: number, monto: number, incluido = false): number => {
  if (base <= 0) return 0
  return r2(incluido ? (100 * monto) / (base - monto || 1) : (monto * 100) / base)
}

// ---------------------------------------------------------------------------
// Variantes de marca (MGG `variantesOferta.ts`)
// ---------------------------------------------------------------------------

export interface FilaPrecio {
  sku: string
  cantidad: number
  precio: number
  precio_usd?: number | null
  comprar?: boolean
}

export function agruparVariantes<T extends FilaPrecio>(items: T[]): T[][] {
  const orden: string[] = []
  const map = new Map<string, T[]>()
  for (const it of items) {
    const k = it.sku
    if (!map.has(k)) {
      map.set(k, [])
      orden.push(k)
    }
    map.get(k)!.push(it)
  }
  return orden.map((k) => map.get(k)!)
}

export const hayVariantes = (items: FilaPrecio[]): boolean => agruparVariantes(items).some((g) => g.length > 1)

/** La variante de mayor total BCV; a igualdad, la primera. */
export function representanteGrupo<T extends FilaPrecio>(grupo: T[]): T {
  return grupo.reduce((best, it) => (num(it.cantidad) * num(it.precio) > num(best.cantidad) * num(best.precio) ? it : best), grupo[0])
}

/** Una fila por producto (la más cara): las alternativas no se suman. */
export function totalesRepresentativos(items: FilaPrecio[]): { bcv: number; usd: number } {
  let bcv = 0
  let usd = 0
  for (const g of agruparVariantes(items.filter((i) => i.comprar !== false))) {
    const r = representanteGrupo(g)
    bcv += num(r.cantidad) * num(r.precio)
    usd += num(r.cantidad) * num(r.precio_usd)
  }
  return { bcv: r2(bcv), usd: r2(usd) }
}

/** MGG `precioRenglon`: el BCV si lo hay; si no, el USD. */
export const precioRenglon = (it: { precio?: number | null; precio_usd?: number | null }): number =>
  num(it.precio) > 0 ? num(it.precio) : num(it.precio_usd)

// ---------------------------------------------------------------------------
// Monto final y score (MGG `score.ts`)
// ---------------------------------------------------------------------------

export type OfertaCotizada = Pick<
  Oferta,
  'precio_total' | 'precio_efectivo' | 'iva' | 'igtf' | 'descuento' | 'iva_incluido' | 'ajuste'
>

export function montoFinalOferta(o: OfertaCotizada): {
  base: number
  descuento: number
  impuestos: number
  ajuste: number
  final: number
} {
  const impuestos = r2((o.iva_incluido ? 0 : num(o.iva)) + num(o.igtf))
  const ajuste = r2(num(o.ajuste))
  const bcv = num(o.precio_total)
  const efe = num(o.precio_efectivo)
  const base = r2(bcv <= 0 ? efe : efe <= 0 ? bcv : Math.min(efe, bcv))
  const descuento = Math.min(Math.max(0, r2(num(o.descuento))), base)
  return { base, descuento, impuestos, ajuste, final: r2(base - descuento + impuestos + ajuste) }
}

export const costoEfectivo = (o: OfertaCotizada): number => montoFinalOferta(o).final

/** Pesos de MGG (`DEFAULT_PESOS_SCORE`). */
export const PESOS_SCORE = { precio: 0.4, puntualidad: 0.25, calidad: 0.25, cumplimiento: 0.1 }

export const STATS_NEUTRAS: EstadisticaProveedor = {
  proveedor_id: 0,
  puntualidad_pct: 0.5,
  calidad_avg: 3,
  cumplimiento_pct: 1,
  total_evaluaciones: 0,
  total_ordenes: 0,
}

export interface ScoredOferta {
  oferta: Oferta
  stats: EstadisticaProveedor
  score: { total: number; precio: number; puntualidad: number; calidad: number; cumplimiento: number }
  recomendada: boolean
  mejorPrecio: boolean
  masPuntual: boolean
  mejorCalidad: boolean
}

const clamp01 = (n: number) => (Number.isNaN(n) ? 0 : Math.min(1, Math.max(0, n)))

export function scoreOfertas(ofertas: Oferta[], statsByProv: Map<number, EstadisticaProveedor>): ScoredOferta[] {
  if (!ofertas.length) return []
  const precios = ofertas.map(costoEfectivo)
  const minP = Math.min(...precios)
  const maxP = Math.max(...precios)
  const rangeP = maxP - minP
  let bestPuntualidad = -Infinity
  let bestCalidad = -Infinity

  const enriched = ofertas.map((o) => {
    const stats = statsByProv.get(o.proveedor_id) ?? { ...STATS_NEUTRAS, proveedor_id: o.proveedor_id }
    const precio = rangeP === 0 ? 1 : 1 - (costoEfectivo(o) - minP) / rangeP
    const puntualidad = clamp01(num(stats.puntualidad_pct))
    const calidad = clamp01(num(stats.calidad_avg) / 5)
    const cumplimiento = clamp01(num(stats.cumplimiento_pct))
    const total =
      PESOS_SCORE.precio * precio +
      PESOS_SCORE.puntualidad * puntualidad +
      PESOS_SCORE.calidad * calidad +
      PESOS_SCORE.cumplimiento * cumplimiento
    if (num(stats.puntualidad_pct) > bestPuntualidad) bestPuntualidad = num(stats.puntualidad_pct)
    if (num(stats.calidad_avg) > bestCalidad) bestCalidad = num(stats.calidad_avg)
    return { oferta: o, stats, score: { total, precio, puntualidad, calidad, cumplimiento } }
  })

  const maxTotal = Math.max(...enriched.map((e) => e.score.total))
  return enriched.map((e) => ({
    ...e,
    recomendada: e.score.total === maxTotal,
    mejorPrecio: costoEfectivo(e.oferta) === minP,
    masPuntual: num(e.stats.puntualidad_pct) === bestPuntualidad && e.stats.total_evaluaciones > 0,
    mejorCalidad: num(e.stats.calidad_avg) === bestCalidad && e.stats.total_evaluaciones > 0,
  }))
}

// ---------------------------------------------------------------------------
// Recorte de una oferta a lo que se compra (MGG `recortarOfertaAHija`)
// ---------------------------------------------------------------------------

export interface Recorte {
  /** Las filas elegidas (una por producto). */
  filas: Oferta['items']
  fraccion: number
  subtotalBcv: number
  subtotalUsd: number
  /** ¿Todas las filas elegidas traen precio en USD? */
  todoUsd: boolean
  /** ¿Todas traen precio (BCV o USD)? */
  todoConPrecio: boolean
  descuento: number
  iva: number
  igtf: number
  ajuste: number
  efectivo: number
  totalBs: number
  totalUsd: number
}

/**
 * Lo mismo que `private.compras_armar_oc`: la fracción de la oferta que se le
 * compra y sus impuestos prorrateados. `seleccion` = sku → índice de la fila
 * elegida en `oferta.items` (o null: el representante).
 */
export function recortarOferta(oferta: Oferta, seleccion: Map<string, number | null>): Recorte {
  const items = oferta.items ?? []
  const filas: Oferta['items'] = []
  for (const [sku, idx] of seleccion) {
    let f = idx != null ? items[idx] : undefined
    if (!f || f.sku !== sku) {
      const grupo = items.filter((i) => i.sku === sku && i.comprar !== false)
      f = grupo.length ? representanteGrupo(grupo) : undefined
    }
    if (f) filas.push(f)
  }
  const cant = (f: (typeof filas)[number]) => num(f.cantidad)
  const gross = filas.reduce((a, f) => a + cant(f) * precioRenglon(f), 0)
  const bcv = filas.reduce((a, f) => a + cant(f) * num(f.precio), 0)
  const usd = filas.reduce((a, f) => a + cant(f) * num(f.precio_usd), 0)
  const subBs = filas.reduce((a, f) => a + cant(f) * precioRenglon(f), 0)
  const grossOf = num(oferta.precio_total) > 0 ? r2(num(oferta.precio_total)) : totalesRepresentativos(items).usd
  const fraccion = grossOf > 0 ? Math.min(1, r2(gross) / grossOf) : gross > 0 ? 1 : 0
  const pr = (v: number | string | null | undefined) => {
    const n = num(v)
    return n > 0 ? r2(n * fraccion) : 0
  }
  const descuento = pr(oferta.descuento)
  const iva = pr(oferta.iva)
  const igtf = pr(oferta.igtf)
  const ajuste = r2(num(oferta.ajuste) * fraccion)
  const partes = { descuento, iva, igtf, iva_incluido: !!oferta.iva_incluido, ajuste }
  const todoUsd = filas.length > 0 && filas.every((f) => num(f.precio_usd) > 0)
  return {
    filas,
    fraccion,
    subtotalBcv: r2(bcv),
    subtotalUsd: r2(usd),
    todoUsd,
    todoConPrecio: filas.length === seleccion.size && filas.every((f) => precioRenglon(f) > 0 && cant(f) > 0),
    descuento,
    iva,
    igtf,
    ajuste,
    efectivo: pr(oferta.precio_efectivo),
    totalBs: totalDesdePartes({ subtotal: subBs, ...partes }),
    totalUsd: todoUsd ? totalDesdePartes({ subtotal: usd, ...partes }) : 0,
  }
}

// ---------------------------------------------------------------------------
// Sub-OC (MGG `subOc.ts`, `ordenDeOfertas.ts`)
// ---------------------------------------------------------------------------

/** MGG: las hijas muertas no tienen dueño de sus productos. */
export const ESTADOS_HIJA_MUERTA = new Set(['cancelada', 'anulada', 'desistida_proveedor'])

export const esHijaViva = (h: Pick<Orden, 'estado'>): boolean => !ESTADOS_HIJA_MUERTA.has(h.estado)

/** Los SKU de la madre que ya tienen una sub-OC viva. */
export function skusTomados(hijas: Orden[], excepto?: number): Set<string> {
  const s = new Set<string>()
  for (const h of hijas) {
    if (h.id === excepto || !esHijaViva(h)) continue
    for (const it of h.items ?? []) if (it.comprar !== false) s.add(it.sku)
  }
  return s
}

/** Lo que de la madre todavía no tiene proveedor. */
export function itemsPendientes(madre: Orden, hijas: Orden[]): ItemOrden[] {
  const t = skusTomados(hijas)
  return (madre.items ?? []).filter((it) => it.comprar !== false && !t.has(it.sku))
}

/** El código de la madre de una sub-OC: «SP-2026-0012-2» → «SP-2026-0012». */
export const codigoMadre = (codigo: string): string => codigo.replace(/-\d+$/, '')

// ---------------------------------------------------------------------------
// Cuadre de la OC (MGG `cuadreOc.ts`, `totalesOc.ts`)
// ---------------------------------------------------------------------------

export const subtotalItems = (items: ItemOrden[]): number =>
  r2(items.filter((i) => i.comprar !== false).reduce((a, i) => a + num(i.cantidad) * num(i.precio), 0))

export interface Desglose {
  subtotal: number
  descuento: number
  iva: number
  igtf: number
  ajuste: number
  ivaIncluido: boolean
  esperado: number
  total: number
  cuadra: boolean
}

export function desglosarOc(o: Orden): Desglose {
  const subtotal = subtotalItems(o.items ?? [])
  const descuento = Math.max(0, num(o.descuento_obtenido))
  const iva = Math.max(0, num(o.iva))
  const igtf = Math.max(0, num(o.igtf))
  const ajuste = r2(num(o.ajuste))
  const esperado = totalDesdePartes({ subtotal, descuento, iva, igtf, iva_incluido: o.iva_incluido, ajuste })
  const total = r2(num(o.total))
  return { subtotal, descuento, iva, igtf, ajuste, ivaIncluido: !!o.iva_incluido, esperado, total, cuadra: Math.abs(esperado - total) <= 0.02 }
}

/** MGG `avisoDeCuadre`. */
export function avisoDeCuadre(o: Orden, money: (n: number) => string): string | null {
  const d = desglosarOc(o)
  if (d.cuadra || d.subtotal <= 0) return null
  const partes = [
    `base ${money(d.subtotal)}${d.ivaIncluido && d.iva ? ` (con IVA ${money(d.iva)} adentro)` : ''}`,
    d.descuento ? `− desc. ${money(d.descuento)}` : '',
    d.iva && !d.ivaIncluido ? `+ IVA ${money(d.iva)}` : '',
    d.igtf ? `+ IGTF ${money(d.igtf)}` : '',
    d.ajuste ? `± ajuste ${money(d.ajuste)}` : '',
  ].filter(Boolean)
  const dif = r2(d.total - d.esperado)
  return `El total no cuadra con sus partes: ${partes.join(' ')} dan ${money(d.esperado)}, pero la orden dice ${money(d.total)} (${dif > 0 ? 'sobran' : 'faltan'} ${money(Math.abs(dif))}).`
}

/** Lo que dice la logística de la oferta. */
export const LOGISTICA: { clave: 'flete' | 'transporte' | 'embalaje' | 'seguros'; label: string }[] = [
  { clave: 'flete', label: 'Flete' },
  { clave: 'transporte', label: 'Transporte' },
  { clave: 'embalaje', label: 'Embalaje' },
  { clave: 'seguros', label: 'Seguros' },
]

export const DATOS_TECNICOS: { clave: 'marca' | 'modelo' | 'procedencia' | 'materiales' | 'dimensiones' | 'peso' | 'calidad'; label: string; placeholder?: string }[] = [
  { clave: 'marca', label: 'Marca' },
  { clave: 'modelo', label: 'Modelo' },
  { clave: 'procedencia', label: 'Procedencia', placeholder: 'País / origen' },
  { clave: 'materiales', label: 'Materiales' },
  { clave: 'dimensiones', label: 'Dimensiones', placeholder: 'Ej.: 120 × 80 × 40 cm' },
  { clave: 'peso', label: 'Peso', placeholder: 'Ej.: 25 kg' },
  { clave: 'calidad', label: 'Nivel de calidad', placeholder: 'Ej.: Industrial / Premium / Estándar' },
]

/** Las medidas en que suele vender un proveedor (MGG, datalist de «Se compra en»). */
export const UNIDADES_COMPRA = ['BULTO', 'CAJA', 'SACO', 'PAQUETE', 'CUÑETE', 'GALON', 'BIDON', 'TAMBOR', 'ROLLO', 'DOCENA', 'BOBINA', 'RESMA']
