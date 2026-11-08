import type { SolicitudDeSalida } from '@/lib/api/salidas'
import type { Traslado } from '@/lib/api/inventario'

/*
  SALIDAS Y TRASLADOS COMO MGG (FASE 5), 08/11/2026.

  Lo que comparten el tablero, el histórico y el detalle, aparte de los
  componentes (un archivo que exporta componentes y además funciones rompe la
  recarga en caliente). Copia la ESTRUCTURA de MGG —`columnasSalida.ts`,
  `historicoSalidas.ts`— con los estados de La Cantera, sin tocar su máquina:

    Salidas:   PEDIDA → APROBADA → ENTREGADA, o RECHAZADA / CANCELADA.
    Traslados: SOLICITUD → ACEPTADA («En tránsito») → RECIBIDA, o CANCELADA.

  «Cerrada sin descontar» de MGG no existe aquí: no hay una acción que lo haga.
*/

export type TonoColumna = 'warning' | 'royal' | 'success' | 'danger' | 'neutral'

export interface ColumnaDeTablero<T> {
  clave: string
  etiqueta: string
  tono: TonoColumna
  coincide: (x: T) => boolean
}

/** MGG `TOPE_COLUMNA`: el tablero enseña las 10 últimas; lo demás, en el Histórico. */
export const TOPE_COLUMNA = 10

/** MGG `PAGINA_HISTORICO`: el Histórico se recorre de 50 en 50. */
export const PAGINA_HISTORICO = 50

export const COLUMNAS_SALIDA: ColumnaDeTablero<SolicitudDeSalida>[] = [
  { clave: 'por_aprobar', etiqueta: 'Por aprobar', tono: 'warning', coincide: (s) => s.estado === 'PEDIDA' },
  { clave: 'por_entregar', etiqueta: 'Por entregar', tono: 'royal', coincide: (s) => s.estado === 'APROBADA' },
  { clave: 'entregada', etiqueta: 'Entregada', tono: 'success', coincide: (s) => s.estado === 'ENTREGADA' },
  {
    clave: 'cerrada',
    etiqueta: 'Rechazada / Cancelada',
    tono: 'danger',
    coincide: (s) => s.estado === 'RECHAZADA' || s.estado === 'CANCELADA',
  },
]

export const COLUMNAS_TRASLADO: ColumnaDeTablero<Traslado>[] = [
  { clave: 'solicitado', etiqueta: 'Solicitado', tono: 'warning', coincide: (t) => t.estado === 'SOLICITUD' },
  { clave: 'en_transito', etiqueta: 'En tránsito', tono: 'royal', coincide: (t) => t.estado === 'ACEPTADA' },
  { clave: 'recibido', etiqueta: 'Recibido', tono: 'success', coincide: (t) => t.estado === 'RECIBIDA' },
  { clave: 'cancelado', etiqueta: 'Cancelado', tono: 'danger', coincide: (t) => t.estado === 'CANCELADA' },
]

/* ------------------------------------------------------------------ */
/* Lo que se recuerda en el navegador (columnas ocultas, kanban/lista) */
/* ------------------------------------------------------------------ */

export function leerLista(clave: string, validas: string[]): string[] {
  try {
    const crudo = localStorage.getItem(clave)
    const arr: unknown = crudo ? JSON.parse(crudo) : []
    return Array.isArray(arr) ? arr.filter((k): k is string => typeof k === 'string' && validas.includes(k)) : []
  } catch {
    return []
  }
}

export function guardarLista(clave: string, valores: string[]) {
  try {
    localStorage.setItem(clave, JSON.stringify(valores))
  } catch {
    /* sin localStorage: queda solo en memoria */
  }
}

export type ModoTablero = 'kanban' | 'lista'

export function leerModo(clave: string): ModoTablero {
  try {
    return localStorage.getItem(clave) === 'lista' ? 'lista' : 'kanban'
  } catch {
    return 'kanban'
  }
}

export function guardarModo(clave: string, modo: ModoTablero) {
  try {
    localStorage.setItem(clave, modo)
  } catch {
    /* sin localStorage */
  }
}

/* ------------------------------------------------------------------ */
/* Cómo se dice una solicitud                                          */
/* ------------------------------------------------------------------ */

export const cantidadLegible = (v: string | number): string =>
  Number(v).toLocaleString('es-VE', { maximumFractionDigits: 2 })

/** «Arena lavada» o «Arena lavada +2 más» (MGG: `{primero} +{n-1} más`). */
export function materialDe(s: SolicitudDeSalida): string {
  const r = s.renglones ?? []
  const primero = r[0]?.articulo?.nombre ?? 'Material'
  return r.length > 1 ? `${primero} +${r.length - 1} más` : primero
}

/** «12 M3» con un solo renglón, «3 materiales» con varios. */
export function cantidadDe(s: SolicitudDeSalida): string {
  const r = s.renglones ?? []
  if (r.length === 1) return `${cantidadLegible(r[0].cantidad)} ${r[0].articulo?.unidad ?? ''}`.trim()
  return `${r.length} materiales`
}

export interface PasoDelHistorial {
  evento: string
  cuando: string | null
  quien: string | null
  detalle?: string | null
  tono: TonoColumna
}

/**
 * El historial de la solicitud, armado con lo que la fila ya guarda (MGG lo
 * guarda en `historial`; aquí cada paso tiene su columna). La cancelación no
 * guarda quién ni cuándo: se dice el motivo.
 */
export function historialDeSolicitud(
  s: SolicitudDeSalida,
  nombreDe: (uid: string | null) => string,
): PasoDelHistorial[] {
  const pasos: PasoDelHistorial[] = [
    { evento: 'Solicitada', cuando: s.pedida_en, quien: nombreDe(s.pedida_por), tono: 'warning' },
  ]
  if (s.aprobada_en) {
    pasos.push(
      s.estado === 'RECHAZADA'
        ? {
            evento: 'No aprobada',
            cuando: s.aprobada_en,
            quien: nombreDe(s.aprobada_por),
            detalle: s.cierre_motivo,
            tono: 'danger',
          }
        : {
            evento: s.aprobada_de_respaldo ? 'Aprobada (de respaldo)' : 'Aprobada',
            cuando: s.aprobada_en,
            quien: nombreDe(s.aprobada_por),
            tono: 'royal',
          },
    )
  } else if (s.estado === 'RECHAZADA') {
    pasos.push({ evento: 'No aprobada', cuando: null, quien: null, detalle: s.cierre_motivo, tono: 'danger' })
  }
  if (s.entregada_en) {
    pasos.push({
      evento: 'Entregada',
      cuando: s.entregada_en,
      quien: nombreDe(s.entregada_por),
      detalle: s.nota_salida ? `Nota de salida ${s.nota_salida}` : null,
      tono: 'success',
    })
  }
  if (s.estado === 'CANCELADA') {
    pasos.push({ evento: 'Cancelada', cuando: null, quien: null, detalle: s.cierre_motivo, tono: 'danger' })
  }
  return pasos
}

/** MGG «Realizado por»: la última acción y quién la hizo. */
export function ultimaAccionDeSolicitud(
  s: SolicitudDeSalida,
  nombreDe: (uid: string | null) => string,
): { evento: string; quien: string | null; cuando: string | null } {
  const pasos = historialDeSolicitud(s, nombreDe)
  const ultimo = pasos[pasos.length - 1]
  return { evento: ultimo.evento, quien: ultimo.quien, cuando: ultimo.cuando }
}

/** El historial del traslado, con los sellos de la vista `v_traslados`. */
export function historialDeTraslado(t: Traslado): PasoDelHistorial[] {
  const respaldo = (v: boolean | null) => (v ? ' (administración)' : '')
  const pasos: PasoDelHistorial[] = []
  if (t.inmediato) {
    pasos.push({
      evento: 'Traslado directo',
      cuando: t.recibido_en ?? t.solicitado_en,
      quien: t.recibido_por_nombre ?? t.solicitado_por_nombre,
      tono: 'success',
    })
  } else {
    pasos.push({
      evento: t.enviado ? 'Enviado' : 'Solicitado',
      cuando: t.solicitado_en,
      quien: t.solicitado_por_nombre,
      tono: 'warning',
    })
    if (t.aceptado_en && !t.enviado) {
      pasos.push({
        evento: `Aprobado y enviado${respaldo(t.aceptado_de_respaldo)}`,
        cuando: t.aceptado_en,
        quien: t.aceptado_por_nombre,
        tono: 'royal',
      })
    }
    if (t.recibido_en) {
      pasos.push({
        evento: `Llegada confirmada${respaldo(t.recibido_de_respaldo)}`,
        cuando: t.recibido_en,
        quien: t.recibido_por_nombre,
        tono: 'success',
      })
    }
  }
  if (t.estado === 'CANCELADA') {
    pasos.push({
      evento: 'Cancelado',
      cuando: t.cancelado_en,
      quien: t.cancelado_por_nombre,
      detalle: t.motivo_cancelacion,
      tono: 'danger',
    })
  }
  return pasos
}

/** El último paso del traslado, dicho como pasó: quién y cuándo. */
export function ultimoPasoDeTraslado(t: Traslado): { quien: string; cuando: string | null } {
  const deRespaldo = (v: boolean | null) => (v ? ' (administración)' : '')
  switch (t.estado) {
    case 'SOLICITUD':
      return { quien: `Pedido por ${t.solicitado_por_nombre ?? '—'}`, cuando: t.solicitado_en }
    case 'ACEPTADA':
      return {
        quien: t.enviado
          ? `Enviado por ${t.aceptado_por_nombre ?? '—'}${deRespaldo(t.aceptado_de_respaldo)}`
          : `Pedido por ${t.solicitado_por_nombre ?? '—'}; aprobado y enviado por ${t.aceptado_por_nombre ?? '—'}${deRespaldo(t.aceptado_de_respaldo)}`,
        cuando: t.aceptado_en,
      }
    case 'RECIBIDA':
      return t.inmediato
        ? { quien: `Directo, por ${t.recibido_por_nombre ?? '—'}`, cuando: t.recibido_en }
        : {
            quien: `Llegada confirmada por ${t.recibido_por_nombre ?? '—'}${deRespaldo(t.recibido_de_respaldo)}`,
            cuando: t.recibido_en,
          }
    default:
      return { quien: `Cancelado por ${t.cancelado_por_nombre ?? '—'}`, cuando: t.cancelado_en }
  }
}

/** Para buscar sin que importen tildes ni mayúsculas. */
export const normalizar = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
