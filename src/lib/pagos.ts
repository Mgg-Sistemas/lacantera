/*
  EL PAGO DE LA OC COMO EN MGG, SIN TESORERÍA · LO QUE NO ES PANTALLA (fase 3)

  Copiado de MGG (`METODOS_PAGO` y `monedaPorMetodo` de pedidos.repository.ts,
  `datosPago.repository.ts`, `DatosPagoFields.tsx` validarDatosPago y
  resumenDatosPago, `retencionesOc.ts`), con las reglas de la dueña:

    - Las retenciones se restan SIEMPRE del total (en MGG solo si se retiene
      «antes»): monto a pagar = total − descuento en el pago − Σ retenciones.
    - Bases del %: IVA sobre el IVA de la OC; ISLR e ISAE sobre la base
      imponible (subtotal − descuento, sin IVA); IGTF sobre el total.
    - 08/11/2026: si la OC no trae IVA y el soporte es factura, se indica el
      «IVA de la factura»: se suma al total y es la base de la retención de
      IVA. Cada retención se paga en $ o en Bs a la tasa BCV; el monto a
      pagar sigue en $.

  La base (`private.compras_calcular_retenciones`, `compras_monto_a_pagar`)
  hace las mismas cuentas al guardar: aquí se repiten para enseñarlas antes.
  Si las dos dijeran cosas distintas, manda la base.
*/
import { urlArchivoPago, urlArchivoRecepcion, type Orden } from '@/lib/api/pedidos'
import { moneyBs, r2, subtotalItems } from '@/lib/ofertas'
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

/**
 * Qué se deja teclear en la referencia de un pago (la dueña, 08/11/2026:
 * «si es solo de números, permite poner solo números»). La de una
 * transferencia o un pago móvil son cifras; la de Zelle, Binance o un hash
 * traen letras, y un hash llega a 64 caracteres. Con varios métodos (una
 * tanda), solo cifras si todos son de banco; sin método, se admiten letras.
 */
export function limiteReferencia(
  metodo: string | null | undefined | (string | null | undefined)[],
): { solo: 'numeros' | 'alfanumerico'; maxLength: number } {
  const lista = Array.isArray(metodo) ? metodo : [metodo]
  const deBanco = lista.length > 0 && lista.every((m) => ['TRANSFERENCIA', 'PAGO_MOVIL'].includes((m ?? '').toUpperCase()))
  return deBanco ? { solo: 'numeros', maxLength: 20 } : { solo: 'alfanumerico', maxLength: 80 }
}

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
  /** En qué se paga (08/11/2026). Sin dato, en $. */
  moneda?: 'USD' | 'Bs'
  tasa?: number
  monto_bs?: number
}

/** Lo que se escribe en el formulario, renglón por renglón. */
export type RetencionesForm = Record<
  TipoRetencion,
  { modo: 'porcentaje' | 'monto'; valor: string; moneda: 'USD' | 'Bs' }
>

export const retencionesVacias = (): RetencionesForm => ({
  IVA: { modo: 'porcentaje', valor: '', moneda: 'USD' },
  ISLR: { modo: 'porcentaje', valor: '', moneda: 'USD' },
  IGTF: { modo: 'porcentaje', valor: '', moneda: 'USD' },
  ISAE: { modo: 'porcentaje', valor: '', moneda: 'USD' },
})

export function retencionesAForm(lista: Retencion[] | null | undefined): RetencionesForm {
  const f = retencionesVacias()
  for (const r of lista ?? []) {
    if (TIPOS_RETENCION.includes(r.tipo))
      f[r.tipo] = {
        modo: r.modo === 'monto' ? 'monto' : 'porcentaje',
        valor: String(r.valor ?? ''),
        moneda: r.moneda === 'Bs' ? 'Bs' : 'USD',
      }
  }
  return f
}

/**
 * Total, IVA y base imponible de lo que se paga (`private.compras_bases_pago`).
 * `ivaFactura` es el IVA de la factura que se suma cuando la OC no traía IVA.
 */
export function basesPago(o: Orden): { total: number; iva: number; base: number; ivaFactura: number } {
  const t = num(o.total)
  const bt = o.condiciones_pago === 'contra_entrega' && o.recibido_total != null ? num(o.recibido_total) : t
  const f = t > 0 ? bt / t : 1
  const ivaOc = Math.max(0, num(o.iva))
  const ivaFac = ivaOc > 0 ? 0 : Math.max(0, num(o.iva_factura))
  const base = Math.max(0, subtotalItems(o.items ?? []) - Math.max(0, num(o.descuento_obtenido)) - (o.iva_incluido ? ivaOc : 0))
  return { total: r2(bt + ivaFac * f), iva: r2((ivaOc + ivaFac) * f), base: r2(base * f), ivaFactura: r2(ivaFac * f) }
}

/** El IVA de la factura y la tasa BCV, tal como se escriben en el formulario. */
export interface DatosFiscales {
  ivaFactura: string
  tasa: string
}

export const ocSinIva = (o: Pick<Orden, 'iva'>): boolean => num(o.iva) <= 0

export const datosFiscalesDe = (o: Orden): DatosFiscales => ({
  ivaFactura: num(o.iva_factura) > 0 ? String(o.iva_factura) : '',
  tasa: num(o.retenciones_tasa) > 0 ? String(o.retenciones_tasa) : '',
})

/** La orden con el IVA de la factura y la tasa del formulario, para hacer las cuentas antes de guardar. */
export function conDatosFiscales(o: Orden, doc: 'factura' | 'nota_entrega', f: DatosFiscales): Orden {
  const iva = doc === 'factura' && ocSinIva(o) ? (aNumero(f.ivaFactura) ?? 0) : 0
  const tasa = aNumero(f.tasa) ?? 0
  return { ...o, iva_factura: iva > 0 ? r2(iva) : null, retenciones_tasa: tasa > 0 ? tasa : null }
}

/** Lo que se manda a `compras_datos_fiscales_pago`. */
export function datosFiscalesParaEnviar(o: Orden, doc: 'factura' | 'nota_entrega', f: DatosFiscales) {
  const c = conDatosFiscales(o, doc, f)
  return { iva_factura: c.iva_factura ? num(c.iva_factura) : null, tasa: c.retenciones_tasa ? num(c.retenciones_tasa) : null }
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
    const moneda = form[tipo].moneda === 'Bs' ? 'Bs' : 'USD'
    const tasa = num(o.retenciones_tasa)
    out.push({
      tipo,
      modo,
      valor: v,
      ...(modo === 'porcentaje' ? { base } : {}),
      monto,
      moneda,
      ...(moneda === 'Bs' && tasa > 0 ? { tasa, monto_bs: r2(monto * tasa) } : {}),
    })
  }
  return out
}

/** Para mandarlas a la base: [{tipo, modo, valor}]. */
export const retencionesParaEnviar = (form: RetencionesForm) =>
  TIPOS_RETENCION.filter((t) => (aNumero(form[t].valor) ?? 0) > 0).map((t) => ({
    tipo: t,
    modo: form[t].modo,
    valor: aNumero(form[t].valor),
    moneda: form[t].moneda === 'Bs' ? ('Bs' as const) : ('USD' as const),
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
      return 'La OC no tiene IVA: indicá el IVA de la factura, o pon la retención de IVA en monto.'
    if (v > 0 && form[t].moneda === 'Bs' && !(num(o.retenciones_tasa) > 0))
      return `Indicá la tasa BCV: la retención de ${t} se paga en Bs.`
  }
  if (totalRetenciones(calcularRetenciones(o, form)) > r2(basesPago(o).total - descuento))
    return 'Las retenciones no pueden superar el monto a pagar.'
  return null
}

export const totalRetenciones = (l: Retencion[] | null | undefined): number => r2((l ?? []).reduce((a, r) => a + num(r.monto), 0))

/** «IVA 75 %» o «ISLR (monto)» (MGG `etiquetaRetencion`). */
export const labelRetencion = (r: Pick<Retencion, 'tipo' | 'modo' | 'valor'>): string =>
  r.modo === 'porcentaje' ? `${r.tipo} ${num(r.valor).toLocaleString('es-VE', { maximumFractionDigits: 4 })} %` : `${r.tipo} (monto)`

/** «$ 12,00» o, si se paga en Bs, «Bs 1.234,56 ($ 12,00)». */
export function montoRetencionTxt(r: Pick<Retencion, 'monto' | 'moneda' | 'monto_bs'>, dolar: (n: number) => string): string {
  return r.moneda === 'Bs' && num(r.monto_bs) > 0 ? `${moneyBs(r.monto_bs)} (${dolar(num(r.monto))})` : dolar(num(r.monto))
}

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
