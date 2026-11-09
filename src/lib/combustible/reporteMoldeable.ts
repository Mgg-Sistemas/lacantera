/*
  EL REPORTE MOLDEABLE DE COMBUSTIBLE (Golden Touch, reporteMoldeable.ts,
  29/10/2026).

  Los surtidos y traslados de un rango, cruzados con la ficha de la máquina y
  agrupados como se pida: por equipo, día, dueño, tipo de máquina, destino,
  tanque o mes, o renglón por renglón. Con horas trabajadas, L/h, $/L, el % de
  cada uno sobre el total y sobre su tanque, y los cinco que más consumen.

  Lo que cambia aquí: la ficha de la máquina se busca por su id (el libro ya lo
  trae), no por el nombre escrito; «empresa» es el dueño de la máquina
  (`maquinaria.propietario`); y lo anulado no entra.
*/
import { enMayuscula } from '@/lib/texto'
import { cuenta, n, redondear, type MovimientoLibro, type Numerico, type TanqueGt } from './tipos'

export type ModoAgrupacionCombustible =
  | 'equipo'
  | 'dia'
  | 'empresa'
  | 'tipo'
  | 'ubicacion'
  | 'tanque'
  | 'mes'
  | 'detallado'

/** Dólares a la tasa con que se movió, o a la tasa de hoy del tanque. */
export type BaseTasaUsd = 'historica' | 'actual'

export interface FichaMaquinaReporte {
  id: number
  codigo: string
  nombre: string
  tipo: string | null
  clase: string | null
  propietario: string | null
}

export interface FilaReporteCombustible {
  id: string
  equipo: string
  empresa: string
  tipo: string
  clase?: string
  ubicacion: string
  tanque: string
  tanque_id?: number
  mes?: string
  fecha?: string
  hora?: string
  autorizado?: string
  observacion?: string
  litros: number
  usd: number
  surtidos: number
  horas: number
  /** Litros por hora. */
  rendimiento: number | null
  horometro_ini: number | null
  horometro_fin: number | null
  kilometraje: number | null
  tasa_promedio: number
  pct_total: number
  pct_tanque: number
  pct_capacidad: number
  capacidad_tanque?: number | null
  total_salidas_tanque?: number
  es_traslado?: boolean
}

export interface TopConsumidorItem {
  nombre: string
  litros: number
  usd: number
  porcentaje: number
}

export interface ResumenReporteCombustible {
  totalLitros: number
  totalUsd: number
  totalHoras: number
  totalSurtidos: number
  rendimientoPromedio: number
  tasaPromedio: number
  totalFilas: number
  totalEquipos: number
  topConsumidores: TopConsumidorItem[]
}

export interface CampoColumnaCombustible {
  clave: string
  etiqueta: string
  descripcion?: string
  anchoPdf: number
  anchoExcel: number
  alineacion: 'left' | 'right' | 'center'
  formato?: 'texto' | 'numero' | 'moneda' | 'porcentaje'
}

export const CAMPOS_REPORTE_COMBUSTIBLE: CampoColumnaCombustible[] = [
  { clave: 'equipo', etiqueta: 'Equipo / Máquina', anchoPdf: 26, anchoExcel: 24, alineacion: 'left', formato: 'texto' },
  { clave: 'horas', etiqueta: 'Horas Trab. (h)', anchoPdf: 15, anchoExcel: 14, alineacion: 'right', formato: 'numero', descripcion: 'Horas de operación en el período' },
  { clave: 'litros', etiqueta: 'Consumo (L)', anchoPdf: 16, anchoExcel: 15, alineacion: 'right', formato: 'numero', descripcion: 'Litros surtidos o trasladados' },
  { clave: 'pct_tanque', etiqueta: '% con respecto al Tanque', anchoPdf: 18, anchoExcel: 16, alineacion: 'right', formato: 'porcentaje', descripcion: '% del total que salió de su tanque' },
  { clave: 'pct_capacidad', etiqueta: '% Cap. Física Tanque', anchoPdf: 16, anchoExcel: 15, alineacion: 'right', formato: 'porcentaje', descripcion: '% de la capacidad del tanque' },
  { clave: 'rendimiento', etiqueta: 'Rend. (L/h)', anchoPdf: 14, anchoExcel: 13, alineacion: 'right', formato: 'numero', descripcion: 'Litros por hora trabajada' },
  { clave: 'tanque', etiqueta: 'Tanque Origen', anchoPdf: 18, anchoExcel: 18, alineacion: 'left', formato: 'texto' },
  { clave: 'empresa', etiqueta: 'Empresa / Propietario', anchoPdf: 22, anchoExcel: 22, alineacion: 'left', formato: 'texto' },
  { clave: 'tipo', etiqueta: 'Tipo de Máquina', anchoPdf: 18, anchoExcel: 18, alineacion: 'left', formato: 'texto' },
  { clave: 'usd', etiqueta: 'Consumo ($ USD)', anchoPdf: 16, anchoExcel: 16, alineacion: 'right', formato: 'moneda' },
  { clave: 'pct_total', etiqueta: '% Total Período', anchoPdf: 14, anchoExcel: 12, alineacion: 'right', formato: 'porcentaje', descripcion: '% del consumo de todos los tanques en el período' },
  { clave: 'surtidos', etiqueta: 'Nº Surtidos', anchoPdf: 12, anchoExcel: 12, alineacion: 'center', formato: 'numero' },
  { clave: 'horometro_ini', etiqueta: 'Horóm. Inicial', anchoPdf: 14, anchoExcel: 14, alineacion: 'right', formato: 'numero' },
  { clave: 'horometro_fin', etiqueta: 'Horóm. Final', anchoPdf: 14, anchoExcel: 14, alineacion: 'right', formato: 'numero' },
  { clave: 'tasa_promedio', etiqueta: 'Tasa Prom. ($/L)', anchoPdf: 15, anchoExcel: 14, alineacion: 'right', formato: 'moneda' },
  { clave: 'ubicacion', etiqueta: 'Destino', anchoPdf: 20, anchoExcel: 20, alineacion: 'left', formato: 'texto' },
  { clave: 'fecha', etiqueta: 'Fecha', anchoPdf: 13, anchoExcel: 13, alineacion: 'center', formato: 'texto' },
  { clave: 'hora', etiqueta: 'Hora', anchoPdf: 11, anchoExcel: 11, alineacion: 'center', formato: 'texto' },
  { clave: 'autorizado', etiqueta: 'Autorizado Por', anchoPdf: 18, anchoExcel: 20, alineacion: 'left', formato: 'texto' },
  { clave: 'observacion', etiqueta: 'Observación', anchoPdf: 24, anchoExcel: 28, alineacion: 'left', formato: 'texto' },
]

export const CAMPOS_POR_DEFECTO_POR_MODO: Record<ModoAgrupacionCombustible, string[]> = {
  equipo: ['equipo', 'horas', 'litros', 'pct_tanque', 'pct_capacidad', 'rendimiento', 'tanque', 'empresa', 'usd'],
  dia: ['fecha', 'horas', 'litros', 'pct_total', 'rendimiento', 'surtidos', 'usd'],
  empresa: ['empresa', 'horas', 'litros', 'pct_total', 'surtidos', 'usd'],
  tipo: ['tipo', 'horas', 'litros', 'pct_total', 'rendimiento', 'surtidos'],
  ubicacion: ['ubicacion', 'horas', 'litros', 'pct_total', 'surtidos'],
  tanque: ['tanque', 'litros', 'pct_total', 'surtidos', 'tasa_promedio', 'usd'],
  mes: ['mes', 'horas', 'litros', 'pct_total', 'surtidos', 'usd'],
  detallado: ['fecha', 'hora', 'equipo', 'horas', 'litros', 'pct_tanque', 'pct_capacidad', 'rendimiento', 'tanque', 'empresa', 'usd'],
}

/** En un resumen agrupado, la hora, el autorizado o la observación de un solo surtido no significan nada. */
export function esColumnaAplicableModoCombustible(col: string, modo: ModoAgrupacionCombustible): boolean {
  if (modo === 'detallado') return true
  if (col === 'hora' || col === 'autorizado' || col === 'observacion') return false
  if (col === 'fecha') return modo === 'dia' || modo === 'mes'
  if (col === 'horometro_ini' || col === 'horometro_fin' || col === 'equipo') return modo === 'equipo'
  return true
}

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export function mesEtiqueta(fechaIso: string): string {
  const [y, m] = (fechaIso || '').split('-')
  const i = Number(m) - 1
  return i >= 0 && i < 12 && y ? `${MESES_CORTOS[i]} ${y}` : fechaIso || 'Sin fecha'
}

/**
 * Horas trabajadas de un surtido. Un vehículo cuenta kilómetros, no horas. Más
 * de 500 h en un surtido es un odómetro o un acumulado escrito por error.
 */
export function horasDeMovimiento(m: MovimientoLibro, esVehiculo = false): number {
  if (esVehiculo) return 0
  let h = 0
  if (m.horas_utilizadas != null && n(m.horas_utilizadas) > 0) h = n(m.horas_utilizadas)
  else if (m.horometro_fin != null && m.horometro_ini != null && n(m.horometro_fin) >= n(m.horometro_ini)) {
    h = n(m.horometro_fin) - n(m.horometro_ini)
  }
  return h > 500 ? 0 : h
}

/** Los dólares de un movimiento según la base elegida. Sin valoración, cero. */
export function valorUsdDeMovimiento(m: MovimientoLibro, base: BaseTasaUsd, tasaActual?: Numerico | null): number {
  const litros = n(m.litros)
  if (litros <= 0) return 0
  if (base === 'actual' && n(tasaActual) > 0) return litros * n(tasaActual)
  if (m.monto_usd != null) return n(m.monto_usd)
  return litros * n(m.tasa_usd_litro)
}

export interface MovimientoEnriquecido {
  mov: MovimientoLibro
  equipoNombre: string
  empresa: string
  tipoMaquina: string
  claseMaquina: string
  ubicacion: string
  tanqueNombre: string
  tanqueCapacidad: number | null
  esTraslado: boolean
  litros: number
  usd: number
  horas: number
}

/** Los surtidos y traslados (vivos) con los datos de su máquina y su tanque. */
export function enriquecerMovimientos(
  movimientos: MovimientoLibro[],
  fichas: FichaMaquinaReporte[],
  tanques: TanqueGt[],
  base: BaseTasaUsd,
): MovimientoEnriquecido[] {
  const porId = new Map(fichas.map((f) => [f.id, f]))
  const porTanque = new Map(tanques.map((t) => [t.almacen_id, t]))

  return movimientos
    .filter((m) => cuenta(m) && (m.tipo === 'uso' || m.tipo === 'traslado'))
    .map((m) => {
      const t = porTanque.get(m.tanque_id)
      const capacidad = t ? n(t.capacidad_litros) || n(t.capacidad_calculada_litros) || null : null
      const esTraslado = m.tipo === 'traslado'
      const ficha = m.maquina_id != null ? porId.get(m.maquina_id) : undefined

      let equipoNombre = (m.equipo ?? '').trim() || 'Sin equipo asignado'
      let empresa = 'Sin empresa asignada'
      let tipoMaquina = 'Otros / No clasificado'
      let claseMaquina = 'otro'

      if (esTraslado) {
        equipoNombre = `Traslado → ${m.tanque_destino ?? 'otro tanque'}`
        tipoMaquina = 'Traslado entre Tanques'
        empresa = 'Operación Interna'
        claseMaquina = 'traslado'
      } else if (ficha) {
        equipoNombre = ficha.nombre
        empresa = (ficha.propietario ?? '').trim() || 'Sin empresa asignada'
        tipoMaquina = (ficha.tipo ?? '').trim() || 'Sin tipo'
        claseMaquina = (ficha.clase ?? 'otro').toLowerCase()
      } else if (/BID[OÓ]N/i.test(equipoNombre)) {
        tipoMaquina = 'Bidón / Almacenamiento'
      }

      const esVehiculo = claseMaquina === 'vehiculo' || (m.maquina_clase ?? '').toUpperCase() === 'VEHICULO'
      return {
        mov: m,
        equipoNombre,
        empresa,
        tipoMaquina,
        claseMaquina,
        ubicacion: (m.ubicacion ?? '').trim() || 'Sin ubicación',
        tanqueNombre: t?.nombre ?? m.tanque,
        tanqueCapacidad: capacidad,
        esTraslado,
        litros: n(m.litros),
        usd: valorUsdDeMovimiento(m, base, t?.tasa_usd_litro),
        horas: horasDeMovimiento(m, esVehiculo),
      }
    })
}

/** Filtros por casillas: lo que no está marcado no entra. Una lista vacía no filtra. */
export function filtrarMovimientos(
  movs: MovimientoEnriquecido[],
  o: { empresasSel?: string[]; tiposSel?: string[]; tanquesSel?: number[]; ubicacionesSel?: string[]; equiposSel?: string[] },
): MovimientoEnriquecido[] {
  return movs.filter(
    (it) =>
      (!o.empresasSel?.length || o.empresasSel.includes(it.empresa)) &&
      (!o.tiposSel?.length || o.tiposSel.includes(it.tipoMaquina)) &&
      (!o.tanquesSel?.length ||
        o.tanquesSel.includes(it.mov.tanque_id) ||
        (it.esTraslado && it.mov.tanque_destino_id != null && o.tanquesSel.includes(it.mov.tanque_destino_id))) &&
      (!o.ubicacionesSel?.length || o.ubicacionesSel.includes(it.ubicacion)) &&
      (!o.equiposSel?.length || o.equiposSel.includes(it.equipoNombre)),
  )
}

function topConsumidores(movs: MovimientoEnriquecido[], totalLitros: number): TopConsumidorItem[] {
  const mapa = new Map<string, { litros: number; usd: number }>()
  for (const m of movs) {
    const c = mapa.get(m.equipoNombre) ?? { litros: 0, usd: 0 }
    c.litros += m.litros
    c.usd += m.usd
    mapa.set(m.equipoNombre, c)
  }
  return [...mapa.entries()]
    .map(([nombre, { litros, usd }]) => ({
      nombre,
      litros: redondear(litros),
      usd: redondear(usd),
      porcentaje: totalLitros > 0 ? redondear((litros / totalLitros) * 100, 1) : 0,
    }))
    .sort((a, b) => b.litros - a.litros)
    .slice(0, 5)
}

/** Las filas del reporte según la agrupación, y su resumen. */
export function procesarFilasReporte(
  movs: MovimientoEnriquecido[],
  agrupacion: ModoAgrupacionCombustible,
  ordenarPor: 'usd' | 'litros' | 'horas' = 'usd',
): { filas: FilaReporteCombustible[]; resumen: ResumenReporteCombustible } {
  const totalLitros = movs.reduce((a, m) => a + m.litros, 0)
  const totalUsd = movs.reduce((a, m) => a + m.usd, 0)
  const totalHoras = movs.reduce((a, m) => a + m.horas, 0)

  const salidasPorTanque = new Map<string, number>()
  const capacidadPorTanque = new Map<string, number | null>()
  for (const it of movs) {
    salidasPorTanque.set(it.tanqueNombre, (salidasPorTanque.get(it.tanqueNombre) ?? 0) + it.litros)
    if (!capacidadPorTanque.has(it.tanqueNombre)) capacidadPorTanque.set(it.tanqueNombre, it.tanqueCapacidad)
  }

  const resumen = (filas: number): ResumenReporteCombustible => ({
    totalLitros: redondear(totalLitros),
    totalUsd: redondear(totalUsd),
    totalHoras: redondear(totalHoras, 1),
    totalSurtidos: movs.length,
    rendimientoPromedio: totalHoras > 0 ? redondear(totalLitros / totalHoras) : 0,
    tasaPromedio: totalLitros > 0 ? redondear(totalUsd / totalLitros, 3) : 0,
    totalFilas: filas,
    totalEquipos: new Set(movs.map((m) => m.equipoNombre)).size,
    topConsumidores: topConsumidores(movs, totalLitros),
  })

  if (agrupacion === 'detallado') {
    const filas = movs.map((it): FilaReporteCombustible => {
      const m = it.mov
      const totalTanque = salidasPorTanque.get(it.tanqueNombre) || totalLitros
      const cap = it.tanqueCapacidad ?? capacidadPorTanque.get(it.tanqueNombre) ?? null
      return {
        id: String(m.id),
        equipo: it.equipoNombre,
        empresa: it.empresa,
        tipo: it.tipoMaquina,
        clase: it.claseMaquina,
        ubicacion: it.ubicacion,
        tanque: it.tanqueNombre,
        tanque_id: m.tanque_id,
        capacidad_tanque: cap,
        total_salidas_tanque: totalTanque,
        mes: mesEtiqueta(m.fecha),
        fecha: m.fecha,
        hora: m.hora ?? '',
        autorizado: m.autorizado_por ?? '',
        observacion: m.observacion ?? '',
        es_traslado: it.esTraslado,
        litros: redondear(it.litros),
        usd: redondear(it.usd),
        surtidos: 1,
        horas: redondear(it.horas, 1),
        rendimiento: it.horas > 0 ? redondear(it.litros / it.horas) : null,
        horometro_ini: m.horometro_ini == null ? null : n(m.horometro_ini),
        horometro_fin: m.horometro_fin == null ? null : n(m.horometro_fin),
        kilometraje: m.kilometraje == null ? null : n(m.kilometraje),
        tasa_promedio: it.litros > 0 ? redondear(it.usd / it.litros, 3) : 0,
        pct_total: totalLitros > 0 ? redondear((it.litros / totalLitros) * 100, 1) : 0,
        pct_tanque: totalTanque > 0 ? redondear((it.litros / totalTanque) * 100, 1) : 0,
        pct_capacidad: cap && cap > 0 ? redondear((it.litros / cap) * 100, 1) : 0,
      }
    })
    return { filas, resumen: resumen(filas.length) }
  }

  interface Grupo {
    clave: string
    equipo: string
    empresa: string
    tipo: string
    clase?: string
    ubicacion: string
    tanque: string
    mes: string
    fecha: string
    litros: number
    usd: number
    horas: number
    surtidos: number
    hMin: number | null
    hMax: number | null
    kmMax: number | null
    tanques: Map<string, number>
    capacidad: number | null
    esTraslado: boolean
  }

  const grupos = new Map<string, Grupo>()
  for (const it of movs) {
    const m = it.mov
    let g: Pick<Grupo, 'clave' | 'equipo' | 'empresa' | 'tipo' | 'ubicacion' | 'tanque' | 'mes' | 'fecha'>
    switch (agrupacion) {
      case 'equipo':
        g = { clave: enMayuscula(it.equipoNombre), equipo: it.equipoNombre, empresa: it.empresa, tipo: it.tipoMaquina, ubicacion: it.ubicacion, tanque: it.tanqueNombre, mes: '', fecha: '' }
        break
      case 'dia':
        g = { clave: m.fecha, equipo: m.fecha, empresa: 'Consumo Diario', tipo: 'Fecha', ubicacion: '', tanque: it.tanqueNombre, mes: mesEtiqueta(m.fecha), fecha: m.fecha }
        break
      case 'empresa':
        g = { clave: enMayuscula(it.empresa), equipo: it.empresa, empresa: it.empresa, tipo: 'Empresa / Propietario', ubicacion: '', tanque: it.tanqueNombre, mes: '', fecha: '' }
        break
      case 'tipo':
        g = { clave: enMayuscula(it.tipoMaquina), equipo: it.tipoMaquina, empresa: it.esTraslado ? 'Operación Interna' : 'Flota / Tipo de Máquina', tipo: it.tipoMaquina, ubicacion: '', tanque: it.tanqueNombre, mes: '', fecha: '' }
        break
      case 'ubicacion':
        g = { clave: enMayuscula(it.ubicacion), equipo: it.ubicacion, empresa: 'Frente / Destino', tipo: 'Destino', ubicacion: it.ubicacion, tanque: it.tanqueNombre, mes: '', fecha: '' }
        break
      case 'tanque':
        g = { clave: enMayuscula(it.tanqueNombre), equipo: it.tanqueNombre, empresa: 'Tanque de Suministro', tipo: 'Tanque', ubicacion: '', tanque: it.tanqueNombre, mes: '', fecha: '' }
        break
      default:
        g = { clave: m.fecha.slice(0, 7), equipo: mesEtiqueta(m.fecha), empresa: 'Período Mensual', tipo: 'Mes', ubicacion: '', tanque: it.tanqueNombre, mes: mesEtiqueta(m.fecha), fecha: '' }
    }

    let a = grupos.get(g.clave)
    if (!a) {
      a = { ...g, clase: it.claseMaquina, litros: 0, usd: 0, horas: 0, surtidos: 0, hMin: null, hMax: null, kmMax: null, tanques: new Map(), capacidad: it.tanqueCapacidad, esTraslado: it.esTraslado }
      grupos.set(g.clave, a)
    }
    a.litros += it.litros
    a.usd += it.usd
    a.horas += it.horas
    a.surtidos += 1
    a.tanques.set(it.tanqueNombre, (a.tanques.get(it.tanqueNombre) ?? 0) + it.litros)
    if (m.horometro_ini != null) a.hMin = a.hMin == null ? n(m.horometro_ini) : Math.min(a.hMin, n(m.horometro_ini))
    if (m.horometro_fin != null) a.hMax = a.hMax == null ? n(m.horometro_fin) : Math.max(a.hMax, n(m.horometro_fin))
    if (m.kilometraje != null) a.kmMax = a.kmMax == null ? n(m.kilometraje) : Math.max(a.kmMax, n(m.kilometraje))
  }

  const filas = [...grupos.values()].map((g): FilaReporteCombustible => {
    let principal = g.tanque
    let max = -1
    for (const [tk, l] of g.tanques) {
      if (l > max) {
        max = l
        principal = tk
      }
    }
    const totalTanque = salidasPorTanque.get(principal) || totalLitros
    const cap = capacidadPorTanque.get(principal) ?? g.capacidad ?? null
    return {
      id: g.clave,
      equipo: g.equipo,
      empresa: g.empresa,
      tipo: g.tipo,
      clase: g.clase,
      ubicacion: g.ubicacion,
      tanque: principal,
      capacidad_tanque: cap,
      total_salidas_tanque: totalTanque,
      mes: g.mes,
      fecha: g.fecha,
      litros: redondear(g.litros),
      usd: redondear(g.usd),
      surtidos: g.surtidos,
      horas: redondear(g.horas, 1),
      rendimiento: g.horas > 0 ? redondear(g.litros / g.horas) : null,
      horometro_ini: g.hMin,
      horometro_fin: g.hMax,
      kilometraje: g.kmMax,
      tasa_promedio: g.litros > 0 ? redondear(g.usd / g.litros, 3) : 0,
      pct_total: totalLitros > 0 ? redondear((g.litros / totalLitros) * 100, 1) : 0,
      pct_tanque: totalTanque > 0 ? redondear((g.litros / totalTanque) * 100, 1) : 0,
      pct_capacidad: cap && cap > 0 ? redondear((g.litros / cap) * 100, 1) : 0,
      es_traslado: g.esTraslado,
    }
  })

  if (agrupacion === 'mes' || agrupacion === 'dia') filas.sort((a, b) => a.id.localeCompare(b.id))
  else if (ordenarPor === 'usd') filas.sort((a, b) => b.usd - a.usd)
  else if (ordenarPor === 'horas') filas.sort((a, b) => b.horas - a.horas)
  else filas.sort((a, b) => b.litros - a.litros)

  return { filas, resumen: resumen(filas.length) }
}
