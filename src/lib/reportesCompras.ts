/*
  LOS REPORTES DE COMPRAS COMO EN MGG · LO QUE NO ES PANTALLA (fase 5b)

  Copiado de MGG (`comprasReporte.ts`, `comprasReporteMensaje.ts`,
  `cierreDiario.ts`, `cierreDiarioMensaje.ts`): los cuatro renglones del
  reporte con sus colores pastel, los totales por moneda, el rango del cierre
  (día, semana de lunes a domingo, mes o rango) en hora de Venezuela y los
  mensajes de WhatsApp con sus emojis SIN el selector U+FE0F.

  Las filas las arma la base (`compras_reporte_por_renglon`,
  `compras_cierre_diario`); aquí solo se agrupan y se escriben, para que la
  pantalla, el PDF, el Excel y el WhatsApp digan lo mismo.

  Lo que cambia respecto a MGG:
    - El cierre suma los PAGOS del período (no hay Tesorería): OC pagadas,
      abonos de créditos y servicios directos pagados, con retenciones y
      monto pagado.
    - Todo va en dólares: sin tasa BCV en el cierre (MGG pasa a $ las OC en
      Bs con la del día). Si alguna fila viniera en Bs, se suma aparte.
    - El pie de los mensajes es la razón social de la empresa, no la de MGG.
*/

// ---------------------------------------------------------------------------
// 📊 Reporte por renglón (MGG `comprasReporte.ts`)
// ---------------------------------------------------------------------------

export type GrupoReporte = 'pendiente_aprobar' | 'cuenta_abierta' | 'indicar_metodo' | 'por_pagar'

/** Los cuatro renglones, en el orden de MGG y con sus colores pastel (fondo y letra). */
export const GRUPOS_REPORTE: { key: GrupoReporte; titulo: string; emoji: string; color: string; colorTexto: string }[] = [
  { key: 'pendiente_aprobar', titulo: 'PENDIENTE POR APROBAR', emoji: '⏳', color: '#ffe0bd', colorTexto: '#8a4b00' },
  { key: 'cuenta_abierta', titulo: 'CUENTAS A CRÉDITO', emoji: '💳', color: '#ffd2d2', colorTexto: '#9b1c1c' },
  { key: 'indicar_metodo', titulo: 'POR INDICAR MÉTODO DE PAGO', emoji: '🏦', color: '#e3dcff', colorTexto: '#4a37a8' },
  { key: 'por_pagar', titulo: 'POR PAGAR', emoji: '💰', color: '#d2e2ff', colorTexto: '#1e4696' },
]

/** El tono del TOTAL GENERAL (MGG `COLOR_TOTAL`). */
export const COLOR_TOTAL = '#ffe6cc'
export const COLOR_TOTAL_TEXTO = '#8a4b00'

export type TipoReporte = 'OC' | 'Servicio' | 'Servicio directo'

/** Una fila del reporte, tal como la da `compras_reporte_por_renglon`. */
export interface FilaReporteCompras {
  grupo: GrupoReporte
  tipo: TipoReporte
  origen: 'orden' | 'servicio_directo'
  id: number
  codigo: string
  motivo: string
  proveedor: string
  /** El monto a pagar (total − descuento − retenciones), en su moneda. */
  monto: number
  moneda: 'USD' | 'Bs'
  /** Solo en crédito: lo ya abonado. */
  abonado: number
  /** Lo que queda por pagar (en crédito, monto − abonado). Es lo que suma el reporte. */
  saldo: number
  fecha: string | null
}

export interface GrupoReporteFilas {
  key: GrupoReporte
  titulo: string
  emoji: string
  color: string
  colorTexto: string
  filas: FilaReporteCompras[]
  totalUsd: number
  totalBs: number
}

const dos = (n: unknown): number => Math.round((Number(n) || 0) * 100) / 100

/** Normaliza lo que llega de la base (los numeric llegan como número o texto). */
export function normalizarFilas(filas: unknown): FilaReporteCompras[] {
  return (Array.isArray(filas) ? filas : []).map((f: Record<string, unknown>) => ({
    grupo: f.grupo as GrupoReporte,
    tipo: f.tipo as TipoReporte,
    origen: (f.origen as FilaReporteCompras['origen']) ?? 'orden',
    id: Number(f.id),
    codigo: String(f.codigo ?? '—'),
    motivo: String(f.motivo ?? '—'),
    proveedor: String(f.proveedor ?? '—'),
    monto: dos(f.monto),
    moneda: f.moneda === 'Bs' ? 'Bs' : 'USD',
    abonado: dos(f.abonado),
    saldo: dos(f.saldo),
    fecha: (f.fecha as string | null) ?? null,
  }))
}

/** Total por moneda (suma el SALDO: en crédito, lo pendiente). */
export function totalesPorMoneda(filas: FilaReporteCompras[]): { usd: number; bs: number } {
  let usd = 0
  let bs = 0
  for (const f of filas) {
    if (f.moneda === 'Bs') bs += f.saldo
    else usd += f.saldo
  }
  return { usd: dos(usd), bs: dos(bs) }
}

/** «$ 1.204,88» / «Bs 367.606,68» (MGG `fmtMonto`). */
export function fmtMonto(n: number | null | undefined, moneda: 'USD' | 'Bs' = 'USD'): string {
  const m = (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return moneda === 'Bs' ? `Bs ${m}` : `$ ${m}`
}

/** Los totales de un renglón: solo las monedas que tienen filas, sin mezclarlas. */
export function totalesTexto(x: Pick<GrupoReporteFilas, 'filas' | 'totalUsd' | 'totalBs'>): string {
  const partes: string[] = []
  if (x.filas.some((f) => f.moneda === 'USD')) partes.push(fmtMonto(x.totalUsd, 'USD'))
  if (x.filas.some((f) => f.moneda === 'Bs')) partes.push(fmtMonto(x.totalBs, 'Bs'))
  return partes.join('  ·  ') || fmtMonto(0, 'USD')
}

/** Los cuatro renglones (siempre los cuatro, aunque estén vacíos). */
export function agruparReporte(filas: FilaReporteCompras[]): GrupoReporteFilas[] {
  return GRUPOS_REPORTE.map((g) => {
    const propias = filas.filter((f) => f.grupo === g.key)
    const { usd, bs } = totalesPorMoneda(propias)
    return { ...g, filas: propias, totalUsd: usd, totalBs: bs }
  })
}

/** El total general en una línea: «$ X  ·  Bs Y» (Bs solo si hay). */
export function totalGeneralTexto(filas: FilaReporteCompras[]): string {
  const { usd, bs } = totalesPorMoneda(filas)
  return [fmtMonto(usd, 'USD'), ...(bs > 0 ? [fmtMonto(bs, 'Bs')] : [])].join('  ·  ')
}

// ---------------------------------------------------------------------------
// Mensajes de WhatsApp (MGG `comprasReporteMensaje.ts`)
// ---------------------------------------------------------------------------

export const MAX_POR_GRUPO_WHATSAPP = 30
export const MAX_MOTIVO_WHATSAPP = 70

/** «07/11/2026 · 3:45 p. m.» en hora de Venezuela (MGG `fechaReporteTexto`). */
export function fechaReporteTexto(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const fecha = new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
  const hora = new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d)
  return `${fecha} · ${hora}`
}

function motivoCorto(motivo: string, max = MAX_MOTIVO_WHATSAPP): string {
  const m = String(motivo ?? '').trim()
  if (!m || m === '—') return ''
  return m.length > max ? `${m.slice(0, max - 1).trimEnd()}…` : m
}

function lineaFila(f: FilaReporteCompras, i: number, esCredito: boolean): string {
  const partes = [f.codigo, motivoCorto(f.motivo)].filter(Boolean).join(' · ')
  const monto = fmtMonto(esCredito ? f.saldo : f.monto, f.moneda)
  const extra = esCredito ? ` (abonado ${fmtMonto(f.abonado, f.moneda)} · saldo ${fmtMonto(f.saldo, f.moneda)})` : ''
  return `${i + 1}. ${partes} — ${monto}${extra}`
}

/** El reporte listo para WhatsApp (MGG `mensajeReporteCompras`). */
export function mensajeReporteCompras(filas: FilaReporteCompras[], empresa: string, fecha = new Date().toISOString()): string {
  const grupos = agruparReporte(filas).filter((g) => g.filas.length > 0)
  const lineas: string[] = [
    '📊 *REPORTE DE COMPRAS POR RENGLÓN*',
    `📅 ${fechaReporteTexto(fecha)}`,
    `🧾 ${filas.length} renglón(es) pendiente(s)`,
  ]
  if (!grupos.length) lineas.push('', '✅ No hay compras pendientes en este momento.')
  for (const g of grupos) {
    lineas.push('', `${g.emoji} *${g.titulo} · ${g.filas.length}*`)
    const visibles = g.filas.slice(0, MAX_POR_GRUPO_WHATSAPP)
    visibles.forEach((f, i) => lineas.push(lineaFila(f, i, g.key === 'cuenta_abierta')))
    if (g.filas.length > visibles.length) {
      lineas.push(`   • … y ${g.filas.length - visibles.length} más (mirá el Excel o el PDF)`)
    }
    lineas.push(`*Subtotal${g.key === 'cuenta_abierta' ? ' (saldo)' : ''}:* ${totalesTexto(g)}`)
  }
  if (grupos.length) lineas.push('', '💰 *TOTAL GENERAL*', totalGeneralTexto(filas))
  lineas.push('', `🏢 *${empresa.toUpperCase()}*`)
  return lineas.join('\n')
}

// ---------------------------------------------------------------------------
// 📆 Cierre diario (MGG `cierreDiario.ts`)
// ---------------------------------------------------------------------------

export type ModoCierre = 'dia' | 'semana' | 'mes' | 'rango'

export interface FiltroCierre {
  modo: ModoCierre
  /** Día (modo «dia») o un día cualquiera de la semana, YYYY-MM-DD. */
  dia: string
  /** YYYY-MM. */
  mes: string
  desde: string
  hasta: string
}

export interface RangoCierre {
  desde: string
  hasta: string
  etiqueta: string
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/

/** Fecha (YYYY-MM-DD) de un instante en hora de Venezuela. */
export function fechaVE(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(d)
}

export const hoyVE = (): string => fechaVE(new Date().toISOString()) as string

const esYmd = (s: string | null | undefined): s is string => !!s && YMD.test(s)

function aUtc(ymd: string): Date {
  const m = YMD.exec(ymd) as RegExpExecArray
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

export function sumarDias(ymd: string, n: number): string {
  const d = aUtc(ymd)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 21/10/2026 */
export function fechaCorta(ymd: string): string {
  const m = YMD.exec(ymd)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ymd
}

/** El rango que dice el filtro (MGG `rangoCierre`): semana de lunes a domingo; sin dato, hoy. */
export function rangoCierre(f: FiltroCierre, hoy: string = hoyVE()): RangoCierre {
  if (f.modo === 'semana') {
    const base = esYmd(f.dia) ? f.dia : hoy
    const dow = (aUtc(base).getUTCDay() + 6) % 7
    const desde = sumarDias(base, -dow)
    const hasta = sumarDias(desde, 6)
    return { desde, hasta, etiqueta: `Semana del ${fechaCorta(desde)} al ${fechaCorta(hasta)}` }
  }
  if (f.modo === 'mes') {
    const m = /^(\d{4})-(\d{2})$/.exec(f.mes ?? '')
    const ym = m ? { y: Number(m[1]), mo: Number(m[2]) } : { y: Number(hoy.slice(0, 4)), mo: Number(hoy.slice(5, 7)) }
    const ultimo = new Date(Date.UTC(ym.y, ym.mo, 0)).getUTCDate()
    const pref = `${String(ym.y).padStart(4, '0')}-${String(ym.mo).padStart(2, '0')}`
    const desde = `${pref}-01`
    const hasta = `${pref}-${String(ultimo).padStart(2, '0')}`
    const nombre = `${MESES[ym.mo - 1].charAt(0).toUpperCase()}${MESES[ym.mo - 1].slice(1)} ${ym.y}`
    return { desde, hasta, etiqueta: `${nombre} (${fechaCorta(desde)} al ${fechaCorta(hasta)})` }
  }
  if (f.modo === 'rango') {
    let a = esYmd(f.desde) ? f.desde : esYmd(f.hasta) ? f.hasta : hoy
    let b = esYmd(f.hasta) ? f.hasta : a
    if (a > b) [a, b] = [b, a]
    return { desde: a, hasta: b, etiqueta: a === b ? `Día ${fechaCorta(a)}` : `Del ${fechaCorta(a)} al ${fechaCorta(b)}` }
  }
  const dia = esYmd(f.dia) ? f.dia : hoy
  return { desde: dia, hasta: dia, etiqueta: dia === hoy ? `Hoy · ${fechaCorta(dia)}` : `Día ${fechaCorta(dia)}` }
}

export type ClaveCierre = 'pedidos' | 'pendientes_aprobar' | 'por_pagar' | 'pagadas'

/** Las cuatro tarjetas de MGG, en su orden. */
export const ITEMS_CIERRE: { key: ClaveCierre; titulo: string; emoji: string; ayuda: string }[] = [
  { key: 'pedidos', titulo: 'Total de pedidos', emoji: '📋', ayuda: 'Solicitudes creadas en el período' },
  {
    key: 'pendientes_aprobar',
    titulo: 'Total órdenes pendientes por aprobar',
    emoji: '⏳',
    ayuda: 'Pendientes de aprobación que entraron en el período',
  },
  { key: 'por_pagar', titulo: 'Total órdenes por pagar', emoji: '💰', ayuda: 'Confirmadas en el período que siguen sin pagarse' },
  { key: 'pagadas', titulo: 'Total órdenes pagadas', emoji: '✅', ayuda: 'Pagadas en el período' },
]

export interface OcPorPagarCierre {
  id: number
  codigo: string
  proveedor: string
  monto: number
  moneda: 'USD' | 'Bs'
  estado: string
  entrada: string | null
}

export interface AnalistaCierre {
  id: string
  nombre: string
  cotizaciones: number
  finalizadas: number
}

/** Un pago del período (lo que La Cantera suma porque no hay Tesorería). */
export interface PagoCierre {
  origen: 'orden' | 'abono' | 'servicio_directo'
  id: number
  tipo: 'OC' | 'Servicio' | 'Abono' | 'Servicio directo'
  codigo: string
  proveedor: string
  fecha: string
  pagado_por: string | null
  /** Total de la compra; en un abono, nulo. */
  total: number | null
  retenciones: { tipo: string; modo: string; valor: number; monto: number }[]
  total_retenciones: number
  descuento: number
  /** En dólares. */
  monto_pagado: number
  metodos: string[]
  referencia: string | null
  moneda_pago: string | null
  monto_moneda: number | null
}

export interface ResumenCierre {
  desde: string
  hasta: string
  pedidos: number
  pendientes_aprobar: number
  por_pagar: number
  pagadas: number
  por_pagar_detalle: OcPorPagarCierre[]
  analistas: AnalistaCierre[]
  total_cotizaciones: number
  total_finalizadas: number
  pagos: PagoCierre[]
  total_pagado: number
  total_retenciones: number
}

/** Los numeric de la base, a número. */
export function normalizarCierre(r: Record<string, unknown>): ResumenCierre {
  const n = (v: unknown) => Number(v) || 0
  const lista = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : [])
  return {
    desde: String(r.desde ?? ''),
    hasta: String(r.hasta ?? ''),
    pedidos: n(r.pedidos),
    pendientes_aprobar: n(r.pendientes_aprobar),
    por_pagar: n(r.por_pagar),
    pagadas: n(r.pagadas),
    por_pagar_detalle: lista(r.por_pagar_detalle).map((x) => ({
      id: n(x.id),
      codigo: String(x.codigo ?? '—'),
      proveedor: String(x.proveedor ?? '—'),
      monto: dos(x.monto),
      moneda: x.moneda === 'Bs' ? 'Bs' : 'USD',
      estado: String(x.estado ?? ''),
      entrada: (x.entrada as string | null) ?? null,
    })),
    analistas: lista(r.analistas).map((x) => ({
      id: String(x.id ?? ''),
      nombre: String(x.nombre ?? '—'),
      cotizaciones: n(x.cotizaciones),
      finalizadas: n(x.finalizadas),
    })),
    total_cotizaciones: n(r.total_cotizaciones),
    total_finalizadas: n(r.total_finalizadas),
    pagos: lista(r.pagos).map((x) => ({
      origen: (x.origen as PagoCierre['origen']) ?? 'orden',
      id: n(x.id),
      tipo: (x.tipo as PagoCierre['tipo']) ?? 'OC',
      codigo: String(x.codigo ?? '—'),
      proveedor: String(x.proveedor ?? '—'),
      fecha: String(x.fecha ?? ''),
      pagado_por: (x.pagado_por as string | null) ?? null,
      total: x.total == null ? null : dos(x.total),
      retenciones: lista(x.retenciones).map((t) => ({
        tipo: String(t.tipo ?? ''),
        modo: String(t.modo ?? ''),
        valor: n(t.valor),
        monto: dos(t.monto),
      })),
      total_retenciones: dos(x.total_retenciones),
      descuento: dos(x.descuento),
      monto_pagado: dos(x.monto_pagado),
      metodos: Array.isArray(x.metodos) ? (x.metodos as unknown[]).map(String) : [],
      referencia: (x.referencia as string | null) ?? null,
      moneda_pago: (x.moneda_pago as string | null) ?? null,
      monto_moneda: x.monto_moneda == null ? null : dos(x.monto_moneda),
    })),
    total_pagado: dos(r.total_pagado),
    total_retenciones: dos(r.total_retenciones),
  }
}

/** La cantidad de cada tarjeta. */
export const cantidadCierre = (r: ResumenCierre, k: ClaveCierre): number => r[k]

/** Total en $ del detalle por pagar (lo que esté en Bs se dice aparte). */
export function totalPorPagar(r: ResumenCierre): { usd: number; bs: number; enBs: number } {
  let usd = 0
  let bs = 0
  let enBs = 0
  for (const f of r.por_pagar_detalle) {
    if (f.moneda === 'Bs') {
      bs += f.monto
      enBs++
    } else usd += f.monto
  }
  return { usd: dos(usd), bs: dos(bs), enBs }
}

/** «ISLR 2 % $ 2,00 · IVA (monto) $ 5,00» */
export const textoRetenciones = (p: Pick<PagoCierre, 'retenciones'>): string =>
  p.retenciones.length
    ? p.retenciones
        .map(
          (r) =>
            `${r.modo === 'porcentaje' ? `${r.tipo} ${r.valor.toLocaleString('es-VE', { maximumFractionDigits: 4 })} %` : `${r.tipo} (monto)`} ${fmtMonto(r.monto)}`,
        )
        .join(' · ')
    : '—'

/** El cierre listo para WhatsApp (MGG `mensajeCierreDiario`, más los pagos). */
export function mensajeCierreDiario(
  r: ResumenCierre,
  d: { etiqueta: string; empresa: string; labelMetodo: (m: string) => string },
  impresoIso: string = new Date().toISOString(),
): string {
  const EN_MENSAJE: Record<ClaveCierre, { emoji: string; titulo: string }> = {
    pedidos: { emoji: '📥', titulo: 'Pedidos' },
    pendientes_aprobar: { emoji: '⏳', titulo: 'Órdenes pendientes por aprobar' },
    por_pagar: { emoji: '💵', titulo: 'Órdenes por pagar' },
    pagadas: { emoji: '✅', titulo: 'Órdenes pagadas' },
  }
  const L: string[] = [
    '📊 *CIERRE DIARIO · COMPRAS*',
    '',
    `📅 *Período:* ${d.etiqueta}`,
    '',
    `🕒 *Impreso:* ${fechaReporteTexto(impresoIso)}`,
    '',
  ]
  for (const it of ITEMS_CIERRE) {
    L.push(`${EN_MENSAJE[it.key].emoji} *${EN_MENSAJE[it.key].titulo}:* ${r[it.key]}`)
    L.push('')
  }

  if (r.por_pagar_detalle.length) {
    const t = totalPorPagar(r)
    L.push(`💵 *DETALLE · ÓRDENES POR PAGAR (${r.por_pagar_detalle.length})*`, '')
    r.por_pagar_detalle.forEach((f, i) => L.push(`${i + 1}. ${f.codigo} · ${f.proveedor} — ${fmtMonto(f.monto, f.moneda)}`))
    L.push('', `💰 *TOTAL PENDIENTE POR PAGAR:* ${fmtMonto(t.usd)}${t.enBs ? `  ·  ${fmtMonto(t.bs, 'Bs')}` : ''}`, '')
  }

  if (r.pagos.length) {
    L.push(`🧾 *PAGOS DEL PERÍODO (${r.pagos.length})*`, '')
    r.pagos.forEach((p, i) => {
      const metodo = p.metodos.map(d.labelMetodo).join(' + ')
      const ret = p.total_retenciones > 0 ? ` (retenciones ${fmtMonto(p.total_retenciones)})` : ''
      L.push(`${i + 1}. ${p.codigo}${p.tipo === 'Abono' ? ' · abono' : ''} · ${p.proveedor} — ${fmtMonto(p.monto_pagado)}${ret}${metodo ? ` · ${metodo}` : ''}`)
    })
    L.push('', `💵 *TOTAL PAGADO:* ${fmtMonto(r.total_pagado)}`)
    if (r.total_retenciones > 0) L.push(`🧾 *Retenciones:* ${fmtMonto(r.total_retenciones)}`)
    L.push('')
  }

  if (r.analistas.length) {
    L.push('👥 *POR ANALISTA*', '')
    for (const a of r.analistas) {
      L.push(`👤 *${a.nombre.toUpperCase()}:*`)
      L.push(`Total de cotizaciones realizadas: *${a.cotizaciones}*`)
      L.push(`Total de órdenes finalizadas: *${a.finalizadas}*`)
      L.push('')
    }
  }

  L.push(`🏢 *${d.empresa.toUpperCase()}*`)
  return L.join('\n')
}
