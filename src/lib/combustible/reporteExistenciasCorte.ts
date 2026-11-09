/*
  EXISTENCIAS Y SALDOS AL CORTE (Golden Touch, reporteExistenciasCorte.ts,
  04/11/2026).

  Para cualquier rango: con cuánto abrió cada tanque, lo que entró, se surtió,
  se trasladó y se perdió, y con cuánto cerró. El saldo de apertura y el de
  cierre salen del saldo corrido que ya trae `v_combustible_libro` (el último
  renglón antes de «desde» y el último hasta «hasta»): no se recalculan aquí.

  Diferencia con Golden Touch: allá los tanques tenían un saldo de apertura
  aparte; aquí todo está en el libro, así que la apertura del historial es
  cero. Y lo anulado no suma en los flujos: el par anulado + reverso se queda
  en `otrosLitros` (anulaciones y ajustes), para que la cuenta cierre siempre.
*/
import { compararMovimientos } from './horaMovimiento'
import { cuenta, n, redondear, type MovimientoLibro, type TanqueGt } from './tipos'

export type PresetPeriodoCombustible =
  | 'mes_actual'
  | 'mes_anterior'
  | '7dias'
  | '15dias'
  | '30dias'
  | 'este_ano'
  | 'todos'
  | 'personalizado'

export interface SaldoCorteTanque {
  tanque: TanqueGt
  saldoInicialLitros: number
  saldoInicialUsd: number
  movimientos: MovimientoLibro[]
  entradasLitros: number
  entradasUsd: number
  entradasCount: number
  surtidosLitros: number
  surtidosUsd: number
  surtidosCount: number
  trasladosLitros: number
  trasladosUsd: number
  trasladosCount: number
  mermasLitros: number
  mermasUsd: number
  /** Anulaciones y ajustes: lo que hace que la cuenta cierre con el saldo del libro. */
  otrosLitros: number
  saldoCierreLitros: number
  saldoCierreUsd: number
  /** Nula en el tanque sin costo: ahí se dice «sin costo», no «Tasa $0,00». */
  tasaCierre: number | null
  porcentajeLleno: number
  variacionPeriodoLitros: number
  esHistorico: boolean
}

export interface TotalesCorteCombustible {
  totalLitrosCierre: number
  totalValorCierre: number
  tasaPromedioCierre: number
  totalLitrosApertura: number
  totalValorApertura: number
  totalEntradasLitros: number
  totalEntradasUsd: number
  totalSurtidosLitros: number
  totalSurtidosUsd: number
  totalSurtidosCount: number
  totalTrasladosLitros: number
  totalTrasladosUsd: number
  totalTrasladosCount: number
  totalMermasLitros: number
  variacionNetaLitros: number
  tanquesSeleccionadosCount: number
  totalTanquesCatalogo: number
  esHistorico: boolean
  cierreFechaLabel: string
}

const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function nombreMesEs(numeroMes: number): string {
  return MESES_ES[(numeroMes - 1 + 12) % 12] || ''
}

export function hoyIsoVE(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function restarDiasIso(iso: string, dias: number): string {
  const [y, m, d] = (iso || '').split('-').map(Number)
  const fecha = new Date(y, (m || 1) - 1, d || 1)
  fecha.setDate(fecha.getDate() - dias)
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}

/** Fechas «desde» y «hasta» y la etiqueta de un preset de rango. */
export function obtenerPresetRango(
  preset: PresetPeriodoCombustible,
  hoyRef?: string,
): { desde: string; hasta: string; label: string } {
  const hoy = hoyRef || hoyIsoVE()
  const [aStr, mStr] = hoy.split('-')
  const anio = Number(aStr) || new Date().getFullYear()
  const mes = Number(mStr) || new Date().getMonth() + 1

  switch (preset) {
    case 'mes_actual':
      return { desde: `${aStr}-${mStr}-01`, hasta: hoy, label: `Mes actual (${nombreMesEs(mes)})` }
    case 'mes_anterior': {
      const anioAnt = mes === 1 ? anio - 1 : anio
      const mesAnt = mes === 1 ? 12 : mes - 1
      const mm = String(mesAnt).padStart(2, '0')
      const ultimo = new Date(anioAnt, mesAnt, 0).getDate()
      return {
        desde: `${anioAnt}-${mm}-01`,
        hasta: `${anioAnt}-${mm}-${String(ultimo).padStart(2, '0')}`,
        label: `Mes anterior (${nombreMesEs(mesAnt)} ${anioAnt})`,
      }
    }
    case '7dias':
      return { desde: restarDiasIso(hoy, 7), hasta: hoy, label: 'Últimos 7 días' }
    case '15dias':
      return { desde: restarDiasIso(hoy, 15), hasta: hoy, label: 'Últimos 15 días' }
    case '30dias':
      return { desde: restarDiasIso(hoy, 30), hasta: hoy, label: 'Últimos 30 días' }
    case 'este_ano':
      return { desde: `${aStr}-01-01`, hasta: hoy, label: `Año ${aStr}` }
    case 'personalizado':
      return { desde: '', hasta: '', label: 'Personalizado' }
    default:
      return { desde: '', hasta: '', label: 'Historial completo' }
  }
}

/** El título del reporte: «Reporte del 01 al 31 de Octubre 2026». */
export function obtenerTituloRangoReporte(
  desde?: string | null,
  hasta?: string | null,
  preset?: PresetPeriodoCombustible,
): string {
  if (preset === 'todos') return 'Reporte Histórico Completo de Combustible'
  const d = (desde || '').trim()
  const h = (hasta || '').trim()
  if (d && h) {
    const [yD, mD, diaD] = d.split('-').map(Number)
    const [yH, mH, diaH] = h.split('-').map(Number)
    const pD = String(diaD).padStart(2, '0')
    const pH = String(diaH).padStart(2, '0')
    if (yD === yH && mD === mH) return `Reporte del ${pD} al ${pH} de ${nombreMesEs(mD)} ${yH}`
    if (yD === yH) return `Reporte del ${pD} de ${nombreMesEs(mD)} al ${pH} de ${nombreMesEs(mH)} ${yH}`
    return `Reporte del ${pD} de ${nombreMesEs(mD)} ${yD} al ${pH} de ${nombreMesEs(mH)} ${yH}`
  }
  if (h) {
    const [yH, mH, diaH] = h.split('-').map(Number)
    return `Reporte de Combustible al ${String(diaH).padStart(2, '0')} de ${nombreMesEs(mH)} ${yH}`
  }
  if (d) {
    const [yD, mD, diaD] = d.split('-').map(Number)
    return `Reporte de Combustible desde el ${String(diaD).padStart(2, '0')} de ${nombreMesEs(mD)} ${yD}`
  }
  return 'Reporte de Existencias y Movimientos de Combustible'
}

/** Apertura, flujos del rango y cierre de un tanque. `todosMovs` son los de ese tanque. */
export function calcularCorteTanque(
  tanque: TanqueGt,
  todosMovs: MovimientoLibro[],
  fechaDesde?: string | null,
  fechaHasta?: string | null,
  hoyRef?: string,
): SaldoCorteTanque {
  const hoy = hoyRef || hoyIsoVE()
  const ordenados = todosMovs.filter((m) => m.tanque_id === tanque.almacen_id).sort(compararMovimientos)

  const antes = fechaDesde ? ordenados.filter((m) => m.fecha < fechaDesde) : []
  const ultimoAntes = antes[antes.length - 1]
  const saldoInicialLitros = ultimoAntes ? n(ultimoAntes.saldo_litros) : 0
  const saldoInicialUsd = ultimoAntes ? n(ultimoAntes.saldo_usd) : 0

  const movimientos = ordenados.filter(
    (m) => (!fechaDesde || m.fecha >= fechaDesde) && (!fechaHasta || m.fecha <= fechaHasta),
  )

  const suma = { eL: 0, eU: 0, eC: 0, sL: 0, sU: 0, sC: 0, tL: 0, tU: 0, tC: 0, mL: 0, mU: 0 }
  for (const m of movimientos) {
    if (!cuenta(m)) continue
    const l = n(m.litros)
    const u = n(m.monto_usd)
    if (m.tipo === 'entrada' || m.tipo === 'retorno') {
      suma.eL += l
      suma.eU += u
      suma.eC++
    } else if (m.tipo === 'uso') {
      suma.sL += l
      suma.sU += u
      suma.sC++
    } else if (m.tipo === 'traslado') {
      suma.tL += l
      suma.tU += u
      suma.tC++
    } else if (m.tipo === 'merma') {
      suma.mL += l
      suma.mU += u
    }
  }

  const hasta = fechaHasta ? ordenados.filter((m) => m.fecha <= fechaHasta) : ordenados
  const ultimoHasta = hasta[hasta.length - 1]
  const saldoCierreLitros = redondear(ultimoHasta ? n(ultimoHasta.saldo_litros) : 0)
  const saldoCierreUsd = redondear(ultimoHasta ? n(ultimoHasta.saldo_usd) : 0)

  const otros = saldoCierreLitros - (saldoInicialLitros + suma.eL - suma.sL - suma.tL - suma.mL)
  const cap = n(tanque.capacidad_litros) || n(tanque.capacidad_calculada_litros)
  const porcentajeLleno = cap > 0 ? Math.min(100, Math.max(0, (saldoCierreLitros / cap) * 100)) : 0
  const tasaCierre = tanque.sin_costo
    ? null
    : saldoCierreLitros > 0
      ? saldoCierreUsd / saldoCierreLitros
      : n(tanque.tasa_usd_litro)

  return {
    tanque,
    saldoInicialLitros: redondear(saldoInicialLitros),
    saldoInicialUsd: redondear(saldoInicialUsd),
    movimientos,
    entradasLitros: redondear(suma.eL),
    entradasUsd: redondear(suma.eU),
    entradasCount: suma.eC,
    surtidosLitros: redondear(suma.sL),
    surtidosUsd: redondear(suma.sU),
    surtidosCount: suma.sC,
    trasladosLitros: redondear(suma.tL),
    trasladosUsd: redondear(suma.tU),
    trasladosCount: suma.tC,
    mermasLitros: redondear(suma.mL),
    mermasUsd: redondear(suma.mU),
    otrosLitros: redondear(otros),
    saldoCierreLitros,
    saldoCierreUsd,
    tasaCierre: tasaCierre == null ? null : redondear(tasaCierre, 3),
    porcentajeLleno: redondear(porcentajeLleno, 1),
    variacionPeriodoLitros: redondear(saldoCierreLitros - saldoInicialLitros),
    esHistorico: Boolean(fechaHasta && fechaHasta < hoy),
  }
}

/** Los totales de la cabecera sobre los tanques elegidos. */
export function calcularTotalesCierre(
  items: SaldoCorteTanque[],
  totalTanquesCatalogo: number,
  fechaHasta?: string | null,
  hoyRef?: string,
): TotalesCorteCombustible {
  const hoy = hoyRef || hoyIsoVE()
  const esHistorico = Boolean(fechaHasta && fechaHasta < hoy)
  const t = items.reduce(
    (a, it) => ({
      lC: a.lC + it.saldoCierreLitros,
      vC: a.vC + it.saldoCierreUsd,
      lA: a.lA + it.saldoInicialLitros,
      vA: a.vA + it.saldoInicialUsd,
      eL: a.eL + it.entradasLitros,
      eU: a.eU + it.entradasUsd,
      sL: a.sL + it.surtidosLitros,
      sU: a.sU + it.surtidosUsd,
      sC: a.sC + it.surtidosCount,
      tL: a.tL + it.trasladosLitros,
      tU: a.tU + it.trasladosUsd,
      tC: a.tC + it.trasladosCount,
      mL: a.mL + it.mermasLitros,
    }),
    { lC: 0, vC: 0, lA: 0, vA: 0, eL: 0, eU: 0, sL: 0, sU: 0, sC: 0, tL: 0, tU: 0, tC: 0, mL: 0 },
  )
  return {
    totalLitrosCierre: redondear(t.lC),
    totalValorCierre: redondear(t.vC),
    tasaPromedioCierre: t.lC > 0 ? redondear(t.vC / t.lC, 3) : 0,
    totalLitrosApertura: redondear(t.lA),
    totalValorApertura: redondear(t.vA),
    totalEntradasLitros: redondear(t.eL),
    totalEntradasUsd: redondear(t.eU),
    totalSurtidosLitros: redondear(t.sL),
    totalSurtidosUsd: redondear(t.sU),
    totalSurtidosCount: t.sC,
    totalTrasladosLitros: redondear(t.tL),
    totalTrasladosUsd: redondear(t.tU),
    totalTrasladosCount: t.tC,
    totalMermasLitros: redondear(t.mL),
    variacionNetaLitros: redondear(t.lC - t.lA),
    tanquesSeleccionadosCount: items.length,
    totalTanquesCatalogo,
    esHistorico,
    cierreFechaLabel: fechaHasta
      ? esHistorico
        ? `Cierre al ${fechaHasta}`
        : 'Cierre al corte actual'
      : 'Saldo actual disponible',
  }
}
