/*
  SERVICIOS Y SERVICIO DIRECTO COMO EN MGG (fase 5a) · LO QUE NO ES PANTALLA

  Las reglas con que el formulario de servicio de MGG cambia de forma según la
  categoría (`PedidosPage.tsx` NuevoServicioModal y `ServicioDirectoView.tsx`):
  una recarga pide bombonas o botellones y su medida; un mantenimiento de
  maquinaria, de vehículos o de motos pide el equipo; uno de
  electrodomésticos, el artículo. Y las listas base de tipos de servicio y de
  electrodomésticos, con sus íconos (sin el selector U+FE0F).

  El equipo sale de Maquinaria de La Cantera (`maquinaria`), que distingue
  MAQUINA / EQUIPO / VEHICULO en `clase`: un vehículo es la clase VEHICULO o
  un tipo de carro, camión o camioneta (MGG mira solo el tipo).
*/
import type { DetalleServicioItem, EquipoServicio, EstadoServicioDirecto } from '@/lib/api/pedidos'

/** ¿La categoría es de recarga (gas / oxígeno / extintores)? → bombonas + KG. */
export const esRecargaGas = (cat: string): boolean => /gas|ox[ií]geno|extintor|bombona/i.test(cat)

/** ¿La categoría es de recarga de AGUA? (botellones, garrafones o cisterna) → cantidad × litros. */
export const esRecargaAgua = (cat: string): boolean => /\bagua\b|botell[oó]n|garraf|cisterna/i.test(cat)

/** Recarga en general (gas O agua). */
export const esRecarga = (cat: string): boolean => esRecargaGas(cat) || esRecargaAgua(cat)

export type TipoMantenimiento = 'maquinaria' | 'vehiculos' | 'motos'

/** Qué lista de equipos aplica según la categoría; null: no pide equipo. */
export function tipoMantenimiento(cat: string): TipoMantenimiento | null {
  if (/\bmotos?\b|motocicleta/i.test(cat)) return 'motos'
  if (/veh[ií]culo/i.test(cat)) return 'vehiculos'
  if (/maquinaria|planta/i.test(cat)) return 'maquinaria'
  return null
}

export const esMantenimientoEquipo = (cat: string): boolean => tipoMantenimiento(cat) !== null

/** ¿Mantenimiento de electrodomésticos? → elige el artículo de la lista. */
export const esMantenimientoElectrodomestico = (cat: string): boolean => /electrodom/i.test(cat)

const esMoto = (e: EquipoServicio): boolean => /\bmotos?\b|motocicleta/i.test(`${e.tipo ?? ''} ${e.nombre ?? ''}`)

const esVehiculo = (e: EquipoServicio): boolean =>
  !esMoto(e) && (e.clase === 'VEHICULO' || /carro|cami[oó]n|camioneta|veh[ií]culo|auto/i.test(e.tipo ?? ''))

/** Los equipos de un tipo de mantenimiento (MGG `equiposDeTipo`); null: todos. */
export function equiposDeTipo(equipos: EquipoServicio[], tipo: TipoMantenimiento | null): EquipoServicio[] {
  if (tipo === 'motos') return equipos.filter(esMoto)
  if (tipo === 'vehiculos') return equipos.filter(esVehiculo)
  if (tipo === 'maquinaria') return equipos.filter((e) => !esVehiculo(e) && !esMoto(e))
  return equipos
}

/** «Equipo (Control de Maquinaria)» / «Vehículo (Control de Vehículos)» / «Moto (Control de Motos)». */
export function rotuloEquipo(tipo: TipoMantenimiento | null): string {
  return tipo === 'vehiculos' ? 'Vehículo (Control de Vehículos)' : tipo === 'motos' ? 'Moto (Control de Motos)' : 'Equipo (Control de Maquinaria)'
}

/** MGG `ELECTRODOMESTICOS`: la lista base; se puede escribir uno nuevo. */
export const ELECTRODOMESTICOS: { value: string; label: string }[] = [
  { value: 'COCINA', label: '🍳 Cocina' },
  { value: 'NEVERA', label: '🧊 Nevera' },
  { value: 'CONGELADOR', label: '🧊 Congelador' },
  { value: 'LAVADORA', label: '🧺 Lavadora' },
  { value: 'SECADORA', label: '🌀 Secadora' },
  { value: 'MICROONDAS', label: '📡 Microondas' },
  { value: 'AIRE ACONDICIONADO', label: '❄ Aire acondicionado' },
  { value: 'VENTILADOR', label: '💨 Ventilador' },
  { value: 'TELEVISOR', label: '📺 Televisor' },
  { value: 'LICUADORA', label: '🥤 Licuadora' },
  { value: 'CAFETERA', label: '☕ Cafetera' },
  { value: 'FREIDORA', label: '🍟 Freidora' },
  { value: 'CALENTADOR / TERMO', label: '🚿 Calentador / termo' },
  { value: 'CAMPANA EXTRACTORA', label: '🌫 Campana extractora' },
  { value: 'LAVAPLATOS', label: '🍽 Lavaplatos' },
  { value: 'PLANCHA', label: '👕 Plancha' },
  { value: 'OTRO', label: '• Otro electrodoméstico' },
]

/** MGG `TIPOS_SERVICIO_MANT` (Nuevo servicio): la lista base; el catálogo suma los suyos. */
export const TIPOS_SERVICIO_MANT: { value: string; label: string }[] = [
  { value: 'CAMBIO DE ACEITE', label: '🛢 Cambio de aceite' },
  { value: 'CAMBIO DE FILTRO', label: '🧯 Cambio de filtro' },
  { value: 'CAMBIO DE CAUCHOS / NEUMATICOS', label: '🛞 Cambio de cauchos / neumáticos' },
  { value: 'REPUESTOS', label: '🛠 Repuestos' },
  { value: 'CAMBIO DE PIEZA', label: '⚙ Cambio de pieza' },
  { value: 'PINTURA / LATONERIA', label: '🎨 Pintura / latonería' },
  { value: 'FRENOS', label: '🛑 Frenos' },
  { value: 'BATERIA', label: '🔋 Batería' },
  { value: 'SISTEMA ELECTRICO', label: '💡 Sistema eléctrico' },
  { value: 'SISTEMA HIDRAULICO', label: '💧 Sistema hidráulico' },
  { value: 'SOLDADURA', label: '🔥 Soldadura' },
  { value: 'ENGRASE / LUBRICACION', label: '🧴 Engrase / lubricación' },
  { value: 'REFRIGERANTE', label: '❄ Refrigerante' },
  { value: 'SERVICIO / PREVENTIVO', label: '🔧 Servicio / preventivo' },
  { value: 'REPARACION', label: '🛠 Reparación' },
  { value: 'INSPECCION', label: '🔍 Inspección' },
  { value: 'LECTURA DE HOROMETRO', label: '⏱ Lectura de horómetro' },
  { value: 'OTRO', label: '• Otro' },
]

/** MGG `TIPOS_SERVICIO` (Servicio directo): la lista curada, más corta. */
export const TIPOS_SERVICIO_DIRECTO: { value: string; label: string }[] = TIPOS_SERVICIO_MANT.filter(
  (t) => !['ENGRASE / LUBRICACION', 'REFRIGERANTE', 'INSPECCION', 'LECTURA DE HOROMETRO'].includes(t.value),
)

/** La lista base más lo del catálogo que no está en ella. */
export function opcionesTipo(base: { value: string; label: string }[], catalogo: string[]): { value: string; label: string }[] {
  const ya = new Set(base.map((b) => b.value))
  return [...base, ...catalogo.filter((n) => !ya.has(n.trim().toUpperCase())).map((n) => ({ value: n, label: n }))]
}

/** Suma de los precios del detalle (0 si ninguno lleva precio). MGG `sumaDetallePrecios`. */
export function sumaDetallePrecios(items?: DetalleServicioItem[] | null): number {
  const s = (items ?? []).reduce((a, d) => a + (Number(d.precio) || 0), 0)
  return Math.round(s * 100) / 100
}

/** MGG `limpiarDetalle`: sin descripciones vacías; cantidad y precio solo si son > 0. */
export function limpiarDetalle(items?: DetalleServicioItem[] | null): DetalleServicioItem[] {
  return (items ?? [])
    .map((d) => ({
      descripcion: (d.descripcion ?? '').trim(),
      cantidad: d.cantidad != null && Number(d.cantidad) > 0 ? Number(d.cantidad) : null,
      precio: d.precio != null && Number(d.precio) > 0 ? Number(d.precio) : null,
    }))
    .filter((d) => d.descripcion.length > 0)
}

/** El total de una recarga: unidades × medida (KG de gas o litros de agua). */
export const totalRecarga = (unidades: number, medida: number): number => Math.round(unidades * medida * 100) / 100

/**
 * Lo que va detrás del nombre en una recarga (MGG): gas «· 2 BOMBONA(S) · 86 KG»,
 * agua «· 100 L DE AGUA (5 UND)».
 */
export function sufijoRecarga(cat: string, unidades: number, total: number): string {
  if (!esRecarga(cat)) return ''
  return esRecargaAgua(cat)
    ? ` · ${total} L DE AGUA${unidades > 1 ? ` (${unidades} UND)` : ''}`
    : ` · ${unidades} BOMBONA(S) · ${total} KG`
}

// ---------------------------------------------------------------------------
// Servicio directo
// ---------------------------------------------------------------------------

/** MGG `ESTADO_LABEL`, con «Confirmado pagar» (sin Tesorería, lo paga Compras). */
export const ESTADO_SD: Record<EstadoServicioDirecto, string> = {
  en_proceso: '⏳ En proceso',
  por_pagar: '💸 Por pagar',
  confirmada_pagar: '💳 Confirmado pagar',
  finalizada: '🏁 Finalizada',
}

/** MGG `COLS` del kanban del servicio directo. */
export const COLUMNAS_SD: { key: EstadoServicioDirecto; label: string }[] = [
  { key: 'en_proceso', label: 'En proceso' },
  { key: 'por_pagar', label: 'Por pagar' },
  { key: 'confirmada_pagar', label: 'Confirmado pagar' },
  { key: 'finalizada', label: 'Finalizada' },
]
