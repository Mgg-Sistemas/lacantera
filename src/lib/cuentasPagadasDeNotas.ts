/*
  CUENTAS POR COBRAR PAGADAS EN NOTAS DE ENTREGA (10/11/2026).

  Lógica pura, sin red ni PDF, para el informe ejecutivo de notas de entrega
  registradas con condición de cobro pendiente cuya cancelación ya fue
  confirmada (`pendiente_por_cobrar = true`, `cobrada_en IS NOT NULL` y
  `estado <> 'ANULADA'`). Se prueba directamente con `node` en
  `scripts/test-cuentas-pagadas-notas.mjs`.

  `cobrada_en` llega desde Postgres como `timestamptz` en ISO, mientras que
  `fecha_pago` y `fecha` son fechas calendario (`YYYY-MM-DD`). Para que un pago
  confirmado de noche en Venezuela (por ejemplo, 21:30 America/Caracas = 01:30
  UTC del día siguiente) conserve su fecha administrativa real, el día efectivo
  de pago siempre se extrae en el huso `America/Caracas`.
*/

export interface NotaCobradaMinima {
  cliente_id: number | null
  cliente: string | null
  cliente_rif: string | null
  numero: string
  fecha: string
  fecha_pago: string | null
  cobrada_en: string | null
  pendiente_por_cobrar: boolean
  estado: string
  moneda: string
  total: string | number
  total_bs: string | number | null
  total_usd: string | number | null
}

export interface FiltrosCuentasPagadas {
  desde?: string
  hasta?: string
  clienteId?: string
}

export interface ClienteConCuentaPagada<T extends NotaCobradaMinima = NotaCobradaMinima> {
  clave: string
  cliente_id: number | null
  cliente: string
  rif: string | null
  notas: T[]
  ultimoPago: string | null
  enPlazo: number
  conMora: number
  bs: number
  usd: number
}

export interface ResumenDeCuentasPagadas {
  usd: number
  bs: number
  enPlazoCount: number
  enPlazoUsd: number
  conMoraCount: number
  conMoraUsd: number
  pctEnPlazo: number
  usdEmitidasCount: number
  usdEmitidasMonto: number
  vesEmitidasCount: number
  vesEmitidasMonto: number
  vesEmitidasEquivUsd: number
  otrasEmitidasCount: number
  otrasEmitidasEquivUsd: number
}

const formatoFechaCaracas = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Caracas',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Fecha `YYYY-MM-DD` en hora de Caracas a partir de un ISO o fecha plana; `null` si no es válida. */
export function fechaCaracas(valor: string | null | undefined): string | null {
  if (!valor) return null
  const limpio = valor.trim()
  if (!limpio) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return limpio
  const instante = new Date(limpio)
  if (Number.isNaN(instante.getTime())) return null
  return formatoFechaCaracas.format(instante)
}

function aUtcMedianoche(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return null
  const anio = Number(m[1])
  const mes = Number(m[2])
  const dia = Number(m[3])
  if (!anio || !mes || !dia) return null
  return Date.UTC(anio, mes - 1, dia)
}

/**
 * Días transcurridos entre la fecha de vencimiento acordada (`fecha_pago`) y
 * la fecha efectiva de pago (`cobrada_en` en Caracas). Devuelve `0` cuando se
 * canceló antes o el mismo día del vencimiento, o si falta alguna fecha.
 */
export function diasDeMoraAlPagar(fechaPago: string | null, cobradaEn: string | null): number {
  if (!fechaPago || !cobradaEn) return 0
  const venceUtc = aUtcMedianoche(fechaPago.slice(0, 10))
  const pagoYmd = fechaCaracas(cobradaEn)
  const pagoUtc = pagoYmd ? aUtcMedianoche(pagoYmd) : null
  if (venceUtc === null || pagoUtc === null) return 0
  return Math.max(0, Math.round((pagoUtc - venceUtc) / 86_400_000))
}

/** Filtra las notas que tuvieron cuenta por cobrar y ya fueron pagadas, según período de pago y cliente. */
export function filtrarNotasCobradas<T extends NotaCobradaMinima>(
  notas: T[],
  filtros: FiltrosCuentasPagadas = {},
): T[] {
  const { desde = '', hasta = '', clienteId = '' } = filtros
  return notas.filter((n) => {
    if (!n.pendiente_por_cobrar || !n.cobrada_en || n.estado === 'ANULADA') return false
    const diaPago = fechaCaracas(n.cobrada_en)
    if (!diaPago) return false
    if (desde && diaPago < desde) return false
    if (hasta && diaPago > hasta) return false
    if (clienteId) {
      if (clienteId === 'SIN_CLIENTE') {
        if (n.cliente_id != null) return false
      } else if (String(n.cliente_id ?? '') !== clienteId) {
        return false
      }
    }
    return true
  })
}

/** Agrupa las notas pagadas por cliente, ordenadas de mayor a menor monto recaudado en dólares. */
export function agruparCuentasPagadasPorCliente<T extends NotaCobradaMinima>(
  notas: T[],
): ClienteConCuentaPagada<T>[] {
  const grupos = new Map<string, ClienteConCuentaPagada<T>>()

  for (const n of notas) {
    const clave = n.cliente_id != null ? `id:${n.cliente_id}` : `s:${(n.cliente ?? '').trim()}`
    const g =
      grupos.get(clave) ??
      ({
        clave,
        cliente_id: n.cliente_id,
        cliente: n.cliente ?? 'Cliente por concretar',
        rif: n.cliente_rif,
        notas: [],
        ultimoPago: null,
        enPlazo: 0,
        conMora: 0,
        bs: 0,
        usd: 0,
      } as ClienteConCuentaPagada<T>)

    g.notas.push(n)
    g.bs += Number(n.total_bs ?? 0)
    g.usd += Number(n.total_usd ?? 0)
    if (!g.rif && n.cliente_rif) g.rif = n.cliente_rif

    const diaPago = fechaCaracas(n.cobrada_en)
    if (diaPago && (g.ultimoPago === null || diaPago > g.ultimoPago)) {
      g.ultimoPago = diaPago
    }
    if (diasDeMoraAlPagar(n.fecha_pago, n.cobrada_en) > 0) g.conMora += 1
    else g.enPlazo += 1

    grupos.set(clave, g)
  }

  const lista = Array.from(grupos.values())
  for (const g of lista) {
    g.notas.sort((a, b) => {
      const fa = fechaCaracas(a.cobrada_en) ?? ''
      const fb = fechaCaracas(b.cobrada_en) ?? ''
      if (fa !== fb) return fb.localeCompare(fa)
      return b.numero.localeCompare(a.numero)
    })
  }

  return lista.sort((a, b) => b.usd - a.usd || b.bs - a.bs || a.cliente.localeCompare(b.cliente, 'es'))
}

/** Calcula los indicadores ejecutivos globales de recaudación, cumplimiento y moneda de emisión. */
export function resumenDeCuentasPagadas(notas: NotaCobradaMinima[]): ResumenDeCuentasPagadas {
  let usd = 0
  let bs = 0
  let enPlazoCount = 0
  let enPlazoUsd = 0
  let conMoraCount = 0
  let conMoraUsd = 0
  let usdEmitidasCount = 0
  let usdEmitidasMonto = 0
  let vesEmitidasCount = 0
  let vesEmitidasMonto = 0
  let vesEmitidasEquivUsd = 0
  let otrasEmitidasCount = 0
  let otrasEmitidasEquivUsd = 0

  for (const n of notas) {
    const montoUsd = Number(n.total_usd ?? 0)
    const montoBs = Number(n.total_bs ?? 0)
    const montoOrig = Number(n.total ?? 0)
    usd += montoUsd
    bs += montoBs

    if (diasDeMoraAlPagar(n.fecha_pago, n.cobrada_en) > 0) {
      conMoraCount += 1
      conMoraUsd += montoUsd
    } else {
      enPlazoCount += 1
      enPlazoUsd += montoUsd
    }

    if (n.moneda === 'USD') {
      usdEmitidasCount += 1
      usdEmitidasMonto += montoOrig
    } else if (n.moneda === 'VES') {
      vesEmitidasCount += 1
      vesEmitidasMonto += montoOrig
      vesEmitidasEquivUsd += montoUsd
    } else {
      otrasEmitidasCount += 1
      otrasEmitidasEquivUsd += montoUsd
    }
  }

  const pctEnPlazo = notas.length > 0 ? (enPlazoCount / notas.length) * 100 : 0

  return {
    usd,
    bs,
    enPlazoCount,
    enPlazoUsd,
    conMoraCount,
    conMoraUsd,
    pctEnPlazo,
    usdEmitidasCount,
    usdEmitidasMonto,
    vesEmitidasCount,
    vesEmitidasMonto,
    vesEmitidasEquivUsd,
    otrasEmitidasCount,
    otrasEmitidasEquivUsd,
  }
}
