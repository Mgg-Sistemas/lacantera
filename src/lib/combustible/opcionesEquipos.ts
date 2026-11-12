/*
  LAS OPCIONES DEL BUSCADOR DE EQUIPOS (Golden Touch, opcionesEquipos.ts).

  El que surte busca el equipo por como lo llama —el código, el nombre corto—,
  agrupado por clase (máquinas, vehículos, equipos), con los equipos sin ficha
  de Maquinaria aparte y los bidones al final. Solo salen los que pueden surtir
  («¿Puede surtir?» encendido) y, si se dice el tanque, los que surten de ese
  tanque. El que ya estaba elegido sale siempre, para no perderlo al corregir.

  Lo que se guarda no es el texto: una máquina va por su id (`maquina:<id>`),
  un bidón por su tanque (`bidon:<almacen_id>`) y un equipo sin ficha por su
  nombre. `leerOpcionEquipo` lo traduce de vuelta. No se copia la lista fija de
  16 máquinas de Golden Touch: aquí manda el catálogo.
*/
import type { OpcionBuscable } from '@/components/ui/SelectBuscable'
import { enMayuscula } from '@/lib/texto'
import type { CatalogoCombustible, TanqueGt } from './tipos'

export interface MaquinaParaOpcion {
  id: number
  codigo: string
  nombre: string
  tipo?: string | null
  clase?: string | null
  estado?: string | null
}

export interface OpcionEquipo extends OpcionBuscable {
  grupo: string
  icono: string
}

export type EquipoElegido =
  | { maquina_id: number; equipo: null; bidon_id: null }
  | { maquina_id: null; equipo: string; bidon_id: null }
  | { maquina_id: null; equipo: null; bidon_id: number }

export const GRUPOS_EQUIPO: Array<{ clase: string; grupo: string; icono: string }> = [
  { clase: 'MAQUINA', grupo: 'Maquinaria', icono: '🚜' },
  { clase: 'VEHICULO', grupo: 'Vehículos', icono: '🚚' },
  { clase: 'EQUIPO', grupo: 'Equipos', icono: '🔧' },
]
export const GRUPO_OTROS = 'Otros equipos de Combustible'
export const GRUPO_BIDONES = 'Bidones'

const clave = (t: string | null | undefined) => enMayuscula((t ?? '').trim())

/** El valor que se guarda en el selector, para una máquina, un bidón o un texto. */
export const valorMaquina = (id: number) => `maquina:${id}`
export const valorBidon = (almacenId: number) => `bidon:${almacenId}`

/** Lo elegido en el selector, como lo piden las funciones de la base. */
export function leerOpcionEquipo(valor: string | null | undefined): EquipoElegido | null {
  const v = (valor ?? '').trim()
  if (!v) return null
  const m = v.match(/^maquina:(\d+)$/)
  if (m) return { maquina_id: Number(m[1]), equipo: null, bidon_id: null }
  const b = v.match(/^bidon:(\d+)$/)
  if (b) return { maquina_id: null, equipo: null, bidon_id: Number(b[1]) }
  return { maquina_id: null, equipo: v, bidon_id: null }
}

/** ¿Puede este equipo surtir del tanque? Sin lista, de todos. */
export function esTanquePermitidoParaEquipo(
  tanqueId: number | null | undefined,
  permitidos: number[] | null | undefined,
): boolean {
  if (tanqueId == null || !permitidos || permitidos.length === 0) return true
  return permitidos.includes(tanqueId)
}

export function opcionesEquipos(args: {
  catalogo: CatalogoCombustible[]
  maquinas: MaquinaParaOpcion[]
  /** Los tanques: de aquí salen los bidones. */
  tanques?: Pick<TanqueGt, 'almacen_id' | 'nombre' | 'es_bidon' | 'activo'>[]
  /** En el teléfono la etiqueta es el código; en la PC, el nombre. */
  modo: 'telefono' | 'pc'
  /** Tanque del que se surte (almacen_id). */
  tanqueActual?: number | null
  /** El que ya estaba elegido (al corregir): sale siempre. */
  incluirValor?: string | null
}): OpcionEquipo[] {
  const maquinas = new Map(args.maquinas.map((m) => [m.id, m]))
  const ordenGrupo = (g: string) => {
    const i = GRUPOS_EQUIPO.findIndex((x) => x.grupo === g)
    return i >= 0 ? i : g === GRUPO_OTROS ? GRUPOS_EQUIPO.length : GRUPOS_EQUIPO.length + 1
  }
  const opciones: OpcionEquipo[] = []
  const vistos = new Set<string>()

  for (const c of args.catalogo) {
    if (c.tipo !== 'equipo') continue
    const valor = c.maquina_id != null ? valorMaquina(c.maquina_id) : c.valor.trim()
    if (!valor || vistos.has(clave(valor))) continue
    const elegido = !!args.incluirValor && clave(args.incluirValor) === clave(valor)
    if (!elegido && !c.activo) continue
    if (!elegido && !esTanquePermitidoParaEquipo(args.tanqueActual, c.tanques_permitidos)) continue
    const maq = c.maquina_id != null ? maquinas.get(c.maquina_id) : undefined
    // SOLO LAS MÁQUINAS OPERATIVAS (12/11/2026): «que no salgan las máquinas
    // que no están activas». La que ya estaba elegida (al corregir un
    // movimiento viejo) sale igual, para no perderla.
    if (maq && !elegido && maq.estado && maq.estado !== 'ACTIVA') continue
    vistos.add(clave(valor))

    if (!maq) {
      opciones.push({ valor, etiqueta: c.valor, grupo: GRUPO_OTROS, icono: '⛽' })
      continue
    }
    const g = GRUPOS_EQUIPO.find((x) => x.clase === (maq.clase ?? '').toUpperCase()) ?? GRUPOS_EQUIPO[0]
    const nombre = c.valor || maq.nombre
    opciones.push({
      valor,
      codigo: maq.codigo,
      nombre,
      etiqueta: args.modo === 'telefono' ? `${maq.codigo} · ${nombre}` : nombre,
      detalle: [maq.tipo, maq.estado && maq.estado !== 'ACTIVA' ? maq.estado.replace(/_/g, ' ').toLowerCase() : null]
        .filter(Boolean)
        .join(' · ') || undefined,
      grupo: g.grupo,
      icono: g.icono,
    })
  }

  for (const t of args.tanques ?? []) {
    if (!t.es_bidon || t.almacen_id === args.tanqueActual) continue
    const valor = valorBidon(t.almacen_id)
    const elegido = !!args.incluirValor && args.incluirValor === valor
    if (!t.activo && !elegido) continue
    opciones.push({
      valor,
      etiqueta: `🪣 ${t.nombre}`,
      detalle: 'bidón · salida directa',
      grupo: GRUPO_BIDONES,
      icono: '🪣',
    })
  }

  return opciones.sort(
    (a, b) =>
      ordenGrupo(a.grupo) - ordenGrupo(b.grupo) ||
      (a.etiqueta ?? a.valor).localeCompare(b.etiqueta ?? b.valor, 'es', { numeric: true }),
  )
}
