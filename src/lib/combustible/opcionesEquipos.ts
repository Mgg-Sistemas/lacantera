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
  /** Los tanques: de aquí salía la lista de bidones (ya no se ofrecen; solo el que ya estaba elegido). */
  tanques?: Pick<TanqueGt, 'almacen_id' | 'nombre' | 'es_bidon' | 'activo'>[]
  /** En el teléfono la etiqueta es el código; en la PC, el nombre. */
  modo: 'telefono' | 'pc'
  /** Tanque del que se surte (almacen_id). */
  tanqueActual?: number | null
  /** El que ya estaba elegido (al corregir): sale siempre. */
  incluirValor?: string | null
}): OpcionEquipo[] {
  /*
    LA LISTA SALE DE MAQUINARIA, NO DEL CATÁLOGO (13/11/2026).

    Pedido: «en Equipo solo que me muestre las máquinas operativas en mi
    sistema, en el apartado de Maquinaria», y faltaba el Hyundai 250LC. Antes se
    recorría el catálogo de Combustible, que se llenó con las 17 máquinas del
    10/11: toda máquina dada de alta después no tenía renglón y no salía, y las
    que sí lo tenían salían aunque su estado no lo permitiera. Ahora se recorren
    las máquinas de Maquinaria y solo salen las que están en estado ACTIVA. El
    catálogo queda para lo que de verdad decide: «¿Puede surtir?» y los tanques
    de los que puede surtir (sin renglón, puede surtir de todos).

    Ya no se ofrecen los equipos sin ficha de Maquinaria ni los bidones. Lo que
    ya estaba elegido al corregir un movimiento viejo sale siempre.
  */
  const incluido = args.incluirValor ?? ''
  const vistos = new Set<string>()
  const opciones: OpcionEquipo[] = []
  const catalogoDe = new Map<number, CatalogoCombustible>()
  for (const c of args.catalogo) {
    if (c.tipo === 'equipo' && c.maquina_id != null) catalogoDe.set(c.maquina_id, c)
  }

  for (const maq of args.maquinas) {
    const valor = valorMaquina(maq.id)
    const c = catalogoDe.get(maq.id)
    const elegido = !!incluido && clave(incluido) === clave(valor)
    if (!elegido) {
      if (maq.estado !== 'ACTIVA') continue
      if (c && !c.activo) continue
      if (c && !esTanquePermitidoParaEquipo(args.tanqueActual, c.tanques_permitidos)) continue
    }
    if (vistos.has(clave(valor))) continue
    vistos.add(clave(valor))

    const g = GRUPOS_EQUIPO.find((x) => x.clase === (maq.clase ?? '').toUpperCase()) ?? GRUPOS_EQUIPO[0]
    const nombre = c?.valor || maq.nombre
    opciones.push({
      valor,
      codigo: maq.codigo,
      nombre,
      etiqueta: args.modo === 'telefono' ? `${maq.codigo} · ${nombre}` : nombre,
      detalle:
        [maq.tipo, maq.estado && maq.estado !== 'ACTIVA' ? maq.estado.replace(/_/g, ' ').toLowerCase() : null]
          .filter(Boolean)
          .join(' · ') || undefined,
      grupo: g.grupo,
      icono: g.icono,
    })
  }

  // Lo que ya estaba elegido y no es una máquina de la lista (un equipo sin
  // ficha o un bidón de un movimiento viejo) se conserva para no perderlo.
  if (incluido && !vistos.has(clave(incluido))) {
    const b = incluido.match(/^bidon:(\d+)$/)
    const tanque = b ? args.tanques?.find((t) => t.almacen_id === Number(b[1])) : undefined
    if (b) {
      opciones.push({
        valor: incluido,
        etiqueta: `🪣 ${tanque?.nombre ?? 'Bidón'}`,
        detalle: 'bidón · salida directa',
        grupo: GRUPO_BIDONES,
        icono: '🪣',
      })
    } else if (!/^maquina:\d+$/.test(incluido)) {
      opciones.push({ valor: incluido, etiqueta: incluido, grupo: GRUPO_OTROS, icono: '⛽' })
    }
  }

  return opciones.sort(
    (a, b) =>
      ordenGrupo(a.grupo) - ordenGrupo(b.grupo) ||
      (a.etiqueta ?? a.valor).localeCompare(b.etiqueta ?? b.valor, 'es', { numeric: true }),
  )
}

function ordenGrupo(g: string): number {
  const i = GRUPOS_EQUIPO.findIndex((x) => x.grupo === g)
  return i >= 0 ? i : g === GRUPO_OTROS ? GRUPOS_EQUIPO.length : GRUPOS_EQUIPO.length + 1
}