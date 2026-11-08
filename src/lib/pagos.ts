/*
  EL PAGO DE LA OC COMO EN MGG, SIN TESORERÍA · LO QUE NO ES PANTALLA (fase 3)

  Copiado de MGG (`METODOS_PAGO` y `monedaPorMetodo` de pedidos.repository.ts,
  `datosPago.repository.ts`, `DatosPagoFields.tsx` validarDatosPago y
  resumenDatosPago, `retencionesOc.ts`), con las reglas de la dueña:

    - Las retenciones se restan SIEMPRE del total (en MGG solo si se retiene
      «antes»): monto a pagar = total − descuento en el pago − Σ retenciones.
    - Bases del %: IVA sobre el IVA de la OC; ISLR e ISAE sobre la base
      imponible (subtotal − descuento, sin IVA); IGTF sobre el total.

  La base (`private.compras_calcular_retenciones`, `compras_monto_a_pagar`)
  hace las mismas cuentas al guardar: aquí se repiten para enseñarlas antes.
  Si las dos dijeran cosas distintas, manda la base.
*/
import { urlArchivoPago, urlArchivoRecepcion, type Orden } from '@/lib/api/pedidos'
import { r2, subtotalItems } from '@/lib/ofertas'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// ---------------------------------------------------------------------------
// Métodos de pago (MGG `METODOS_PAGO`)
// ---------------------------------------------------------------------------

export type MonedaPago = 'USD' | 'Bs' | 'USDT'

export const METODOS_PAGO: { value: string; label: string; moneda: MonedaPago; sinComprobante?: boolean }[] = [
  { value: 'divisas_efectivo', label: 'Divisas en efectivo', moneda: 'USD', sinComprobante: true },
  { value: 'efectivo_bs', label: 'Efectivo (Bs)', moneda: 'Bs', sinComprobante: true },
  { value: 'transferencia', label: 'Transferencia', moneda: 'Bs' },
  { value: 'pago_movil', label: 'Pago móvil', moneda: 'Bs' },
  { value: 'binance_usdt', label: 'Binance / USDT', moneda: 'USDT' },
  { value: 'zelle', label: 'Zelle', moneda: 'USD' },
  { value: 'otro', label: 'Otro', moneda: 'USD' },
]

export const labelMetodoPago = (v: string | null | undefined): string =>
  METODOS_PAGO.find((m) => m.value === v)?.label ?? (v || '—')

/** La moneda la dicta el método (MGG `monedaPorMetodo`). */
export const monedaPorMetodo = (v: string): MonedaPago => METODOS_PAGO.find((m) => m.value === v)?.moneda ?? 'USD'

/** ¿Todo en efectivo? Entonces no se pide referencia (MGG `pagoSinComprobante`). */
export function pagoEnEfectivo(metodos: PagoMetodo[] | null | undefined): boolean {
  const l = metodos ?? []
  return l.length > 0 && l.every((m) => METODOS_PAGO.find((x) => x.value === m.metodo)?.sinComprobante)
}

/** Datos libres por método (ver `CamposDatosPago`). */
export type DatosPago = Record<string, string>

export interface PagoMetodo {
  metodo: string
  moneda: MonedaPago | string
  monto: number
  datos?: DatosPago
}

/** Métodos que requieren los datos del proveedor para pagarle (MGG `METODOS_CON_DATOS`). */
export const METODOS_CON_DATOS = ['pago_movil', 'transferencia', 'zelle', 'binance_usdt'] as const
export const requiereDatos = (metodo: string): boolean => (METODOS_CON_DATOS as readonly string[]).includes(metodo)

const RE_CI = /^[VEJPGC]-?\d{5,9}(-?\d)?$/i

/** MGG `validarDatosPago`: el error del primer dato que falta, o null. */
export function validarDatosPago(metodo: string, d: DatosPago): string | null {
  const t = (k: string) => (d[k] ?? '').trim()
  if (metodo === 'pago_movil') {
    if (!RE_CI.test(t('ci_rif').replace(/\s/g, ''))) return 'La cédula o el RIF no se entienden (V-12345678 / J-12345678-9).'
    if (!t('banco')) return 'Elegí el banco'
    let tel = t('telefono').replace(/\D/g, '')
    if (/^58\d{10}$/.test(tel)) tel = `0${tel.slice(2)}`
    if (!/^0\d{10}$/.test(tel)) return 'El teléfono lleva 11 dígitos: 0414, 0424, 0412, 0416, 0422, 0426 o un fijo 02…'
  } else if (metodo === 'transferencia') {
    if (!t('nombre')) return 'Indicá el nombre'
    if (!RE_CI.test(t('ci').replace(/\s/g, ''))) return 'La cédula o el RIF no se entienden (V-12345678 / J-12345678-9).'
    if (!t('banco')) return 'Elegí el banco'
    if (!/^\d{20}$/.test(t('cuenta').replace(/\D/g, ''))) return 'El número de cuenta lleva 20 dígitos.'
  } else if (metodo === 'zelle') {
    if (!t('nombre')) return 'Indicá el nombre'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t('email'))) return 'Indicá el correo'
  } else if (metodo === 'binance_usdt') {
    if (!t('email_o_id')) return 'Indicá el correo o ID de Binance'
  }
  return null
}

/** MGG `resumenDatosPago`: una línea legible de los datos guardados. */
export function resumenDatosPago(metodo: string, d: DatosPago | null | undefined): string {
  if (!d || !Object.keys(d).length) return ''
  if (metodo === 'pago_movil') return `${d.ci_rif ?? ''} · ${d.banco ?? ''} · ${d.telefono ?? ''}`
  if (metodo === 'transferencia') return `${d.nombre ?? ''} · ${d.ci ?? ''} · ${d.banco ?? ''} · Cta ${d.cuenta ?? ''}`
  if (metodo === 'zelle') return `${d.nombre ?? ''} · ${d.email ?? ''}`
  if (metodo === 'binance_usdt') return `${d.email_o_id ?? ''}`
  return ''
}

// ---------------------------------------------------------------------------
// Retenciones y monto a pagar
// ---------------------------------------------------------------------------

export type TipoRetencion = 'IVA' | 'ISLR' | 'IGTF' | 'ISAE'
export const TIPOS_RETENCION: TipoRetencion[] = ['IVA', 'ISLR', 'IGTF', 'ISAE']

/** Sobre qué se calcula el % de cada una (lo que se le explica a quien llena). */
export const BASE_RETENCION: Record<TipoRetencion, string> = {
  IVA: 'sobre el IVA de la OC',
  ISLR: 'sobre la base imponible',
  IGTF: 'sobre el total',
  ISAE: 'sobre la base imponible (impuesto municipal)',
}

export interface Retencion {
  tipo: TipoRetencion
  modo: 'porcentaje' | 'monto'
  valor: number
  /** La base del %, tal como la calculó la base al guardar. */
  base?: number
  monto: number
}

/** Lo que se escribe en el formulario, renglón por renglón. */
export type RetencionesForm = Record<TipoRetencion, { modo: 'porcentaje' | 'monto'; valor: string }>

export const retencionesVacias = (): RetencionesForm => ({
  IVA: { modo: 'porcentaje', valor: '' },
  ISLR: { modo: 'porcentaje', valor: '' },
  IGTF: { modo: 'porcentaje', valor: '' },
  ISAE: { modo: 'porcentaje', valor: '' },
})

export function retencionesAForm(lista: Retencion[] | null | undefined): RetencionesForm {
  const f = retencionesVacias()
  for (const r of lista ?? []) {
    if (TIPOS_RETENCION.includes(r.tipo)) f[r.tipo] = { modo: r.modo === 'monto' ? 'monto' : 'porcentaje', valor: String(r.valor ?? '') }
  }
  return f
}

/** Total, IVA y base imponible de lo que se paga (`private.compras_bases_pago`). */
export function basesPago(o: Orden): { total: number; iva: number; base: number } {
  const t = num(o.total)
  const bt = o.condiciones_pago === 'contra_entrega' && o.recibido_total != null ? num(o.recibido_total) : t
  const f = t > 0 ? bt / t : 1
  const iva = Math.max(0, num(o.iva))
  const base = Math.max(0, subtotalItems(o.items ?? []) - Math.max(0, num(o.descuento_obtenido)) - (o.iva_incluido ? iva : 0))
  return { total: r2(bt), iva: r2(iva * f), base: r2(base * f) }
}

const aNumero = (s: string): number | null => {
  const t = s.trim().replace(/\s/g, '')
  if (!t) return null
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
  return Number.isFinite(n) ? n : null
}

/** Las retenciones calculadas del formulario (`private.compras_calcular_retenciones`). */
export function calcularRetenciones(o: Orden, form: RetencionesForm): Retencion[] {
  const b = basesPago(o)
  const out: Retencion[] = []
  for (const tipo of TIPOS_RETENCION) {
    const { modo, valor } = form[tipo]
    const v = aNumero(valor)
    if (v == null || v <= 0) continue
    const base = tipo === 'IVA' ? b.iva : tipo === 'IGTF' ? b.total : b.base
    const monto = modo === 'porcentaje' ? r2((base * Math.min(v, 100)) / 100) : r2(v)
    out.push({ tipo, modo, valor: v, ...(modo === 'porcentaje' ? { base } : {}), monto })
  }
  return out
}

/** Para mandarlas a la base: [{tipo, modo, valor}]. */
export const retencionesParaEnviar = (form: RetencionesForm) =>
  TIPOS_RETENCION.filter((t) => (aNumero(form[t].valor) ?? 0) > 0).map((t) => ({
    tipo: t,
    modo: form[t].modo,
    valor: aNumero(form[t].valor),
  }))

/** El error del formulario de retenciones, o null. */
export function errorRetenciones(o: Orden, form: RetencionesForm, descuento = 0): string | null {
  for (const t of TIPOS_RETENCION) {
    const s = form[t].valor.trim()
    if (!s) continue
    const v = aNumero(s)
    if (v == null || v < 0) return `La retención de ${t} no se entiende.`
    if (form[t].modo === 'porcentaje' && v > 100) return `El porcentaje de la retención de ${t} no puede pasar de 100.`
    if (t === 'IVA' && form[t].modo === 'porcentaje' && v > 0 && basesPago(o).iva <= 0)
      return 'La OC no tiene IVA: la retención de IVA va en monto o se deja en blanco.'
  }
  if (totalRetenciones(calcularRetenciones(o, form)) > r2(basesPago(o).total - descuento))
    return 'Las retenciones no pueden superar el monto a pagar.'
  return null
}

export const totalRetenciones = (l: Retencion[] | null | undefined): number => r2((l ?? []).reduce((a, r) => a + num(r.monto), 0))

/** «IVA 75 %» o «ISLR (monto)» (MGG `etiquetaRetencion`). */
export const labelRetencion = (r: Pick<Retencion, 'tipo' | 'modo' | 'valor'>): string =>
  r.modo === 'porcentaje' ? `${r.tipo} ${num(r.valor).toLocaleString('es-VE', { maximumFractionDigits: 4 })} %` : `${r.tipo} (monto)`

/** Monto a pagar = total − descuento en el pago − Σ retenciones. */
export function montoAPagar(o: Orden, retenciones?: Retencion[], descuento?: number): number {
  const b = basesPago(o)
  const ret = totalRetenciones(retenciones ?? o.retenciones)
  const des = descuento ?? Math.max(0, num(o.descuento_pago))
  return r2(Math.max(0, b.total - des - ret))
}

/** Lo que falta por pagar de un crédito. */
export const saldoCredito = (o: Orden): number => r2(Math.max(0, montoAPagar(o) - num(o.abonado_total)))

export const esCredito = (o: Pick<Orden, 'condiciones_pago'>): boolean => o.condiciones_pago === 'credito'

/** Un crédito con saldo en un estado donde se abona. */
export const aceptaAbonos = (o: Orden): boolean =>
  esCredito(o) && ['cuenta_abierta', 'por_recibir', 'recibida'].includes(o.estado) && saldoCredito(o) > 0.01

export const etiquetaDocumento = (t: string | null | undefined): string =>
  t === 'factura' ? 'Factura' : t === 'nota_entrega' ? 'Nota de entrega' : '—'

/** Un número escrito a la venezolana o con punto: «1.234,56» o «1234.56». */
export const leerMonto = (s: string): number => aNumero(s) ?? 0

/** Abre un comprobante o el QR de pago en otra pestaña (dirección firmada de diez minutos). */
export async function abrirArchivoPago(path: string): Promise<void> {
  try {
    window.open(await urlArchivoPago(path), '_blank', 'noopener')
  } catch (e) {
    toast(mensajeDe(e, 'No se pudo abrir el archivo'), 'error')
  }
}

/** Abre una foto o la factura / nota de entrega de una recepción (fase 4). */
export async function abrirArchivoRecepcion(path: string): Promise<void> {
  try {
    window.open(await urlArchivoRecepcion(path), '_blank', 'noopener')
  } catch (e) {
    toast(mensajeDe(e, 'No se pudo abrir el archivo'), 'error')
  }
}
