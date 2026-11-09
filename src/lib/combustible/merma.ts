/*
  LA MERMA (Golden Touch, mermaRecepcion.ts y mermaImplicita.ts).

  DE RECEPCIÓN. En una entrada o un traslado se puede anotar cuánto llegó de
  verdad; la diferencia con lo enviado queda como merma ligada a ese
  movimiento, en el tanque que recibe. El margen del tanque (10 % por defecto)
  es un CONTROL: pasarlo pide motivo y COMBUSTIBLE.MERMA_FUERA_DE_MARGEN. La
  base repite la regla (`private.combustible_merma_recepcion`).

  IMPLÍCITA. Cada surtido y traslado pierde un poco por mangueras y goteo. El
  margen del tanque (0,5 % por defecto) NO descuenta nada: solo SUGIERE una
  merma al registrar una, con la lista de los movimientos que la originan
  desde la última merma.
*/
import { compararMovimientos } from './horaMovimiento'
import { cuenta, n, redondear, type MovimientoLibro, type TipoMovLibro } from './tipos'

export const MARGEN_MERMA_DEFECTO = 10
export const MERMA_IMPLICITA_DEFECTO = 0.5

export interface MermaRecepcion {
  /** Litros perdidos: enviados − recibidos. */
  merma: number
  /** En % de lo enviado. */
  pct: number
  /** ¿Pasa el margen del tanque? */
  excede: boolean
}

/** La merma de una recepción, o el error si los números no cierran. Sin recibidos no hay merma. */
export function mermaDeRecepcion(
  enviados: number,
  recibidos: number | null | undefined,
  margenPct: number | string | null | undefined,
): { ok: MermaRecepcion | null; error: string | null } {
  if (recibidos == null || !Number.isFinite(Number(recibidos))) return { ok: null, error: null }
  const env = Number(enviados) || 0
  const rec = Number(recibidos)
  if (!(env > 0)) return { ok: null, error: 'Para anotar lo recibido, los litros enviados tienen que ser mayores que 0.' }
  if (rec < 0) return { ok: null, error: 'Los litros recibidos no pueden ser negativos.' }
  if (rec > env) {
    return { ok: null, error: `No pueden llegar más litros (${rec}) de los que se enviaron (${env}). Revisá la medición.` }
  }
  const merma = redondear(env - rec)
  const pct = redondear((merma / env) * 100)
  const margen = margenPct != null && Number.isFinite(Number(margenPct)) ? Number(margenPct) : MARGEN_MERMA_DEFECTO
  return { ok: { merma, pct, excede: pct > margen + 1e-9 }, error: null }
}

/** El texto de la merma en el libro, igual que lo escribe la base. */
export function observacionMerma(
  origen: 'entrada' | 'traslado',
  ref: string,
  m: MermaRecepcion,
  motivo?: string | null,
): string {
  const de = origen === 'entrada' ? 'Merma de la entrada' : 'Merma del traslado'
  const base = `${de} ${ref} · ${m.pct.toLocaleString('es-VE', { maximumFractionDigits: 2 })}% de lo enviado`
  return `${m.excede ? '⚠ ' : ''}${base}${motivo?.trim() ? ` · ${motivo.trim()}` : ''}`
}

export interface ItemMermaImplicita {
  id: number
  fecha: string
  hora: string | null
  tipo: TipoMovLibro
  equipo: string | null
  autorizado_por: string | null
  ubicacion: string | null
  litros: number
  pctAplicado: number
  mermaLitros: number
  acumulado: number
}

export interface ResumenMermaImplicita {
  totalSugerido: number
  pctUtilizado: number
  totalLitrosBase: number
  cantidadMovimientos: number
  /** Fecha de la última merma registrada (o nula si es desde el principio). */
  fechaUltimaMermaPrevia: string | null
  items: ItemMermaImplicita[]
}

/**
 * La merma sugerida de un tanque: el porcentaje sobre lo que salió por
 * surtidos y traslados desde la última merma. Lo anulado no cuenta.
 */
export function calcularMermaImplicita(args: {
  movimientos: MovimientoLibro[]
  porcentaje?: number | string | null
  desdeUltimaMerma?: boolean
  tiposIncluidos?: TipoMovLibro[]
}): ResumenMermaImplicita {
  const pct = n(args.porcentaje) > 0 ? n(args.porcentaje) : MERMA_IMPLICITA_DEFECTO
  const tipos = args.tiposIncluidos ?? ['uso', 'traslado']
  const vivos = args.movimientos.filter(cuenta).slice().sort(compararMovimientos)

  let corte = -1
  let fechaUltima: string | null = null
  if (args.desdeUltimaMerma ?? true) {
    for (let i = vivos.length - 1; i >= 0; i--) {
      if (vivos[i].tipo === 'merma') {
        corte = i
        fechaUltima = vivos[i].fecha
        break
      }
    }
  }

  const items: ItemMermaImplicita[] = []
  let acumulado = 0
  let base = 0
  for (const m of corte >= 0 ? vivos.slice(corte + 1) : vivos) {
    if (!tipos.includes(m.tipo)) continue
    const litros = Math.abs(n(m.litros))
    if (litros <= 0) continue
    const mermaLitros = redondear(litros * (pct / 100))
    acumulado = redondear(acumulado + mermaLitros)
    base = redondear(base + litros)
    items.push({
      id: m.id,
      fecha: m.fecha,
      hora: m.hora,
      tipo: m.tipo,
      equipo: m.equipo,
      autorizado_por: m.autorizado_por,
      ubicacion: m.ubicacion,
      litros,
      pctAplicado: pct,
      mermaLitros,
      acumulado,
    })
  }

  return {
    totalSugerido: acumulado,
    pctUtilizado: pct,
    totalLitrosBase: base,
    cantidadMovimientos: items.length,
    fechaUltimaMermaPrevia: fechaUltima,
    items,
  }
}

/** El texto para el campo de observación de la merma sugerida. */
export function observacionMermaImplicita(r: ResumenMermaImplicita): string {
  const pct = r.pctUtilizado.toLocaleString('es-VE', { maximumFractionDigits: 2 })
  const litros = r.totalLitrosBase.toLocaleString('es-VE', { maximumFractionDigits: 2 })
  const base = `${pct}% merma implícita sugerida sobre ${litros} L (${r.cantidadMovimientos} movimientos)`
  return r.fechaUltimaMermaPrevia ? `${base} desde el último corte del ${r.fechaUltimaMermaPrevia}` : base
}
