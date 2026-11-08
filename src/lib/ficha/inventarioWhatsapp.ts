import { fechaHoraVE } from '@/lib/pedidos'

/*
  LOS AVISOS DE WHATSAPP DEL TELÉFONO DEL ALMACÉN (MGG `inventarioTelefono.ts`).

  08/11/2026, fase 1a de «Almacén e Inventario como MGG»: los mismos mensajes
  que el almacenista de MGG manda al dar de alta un producto o al cargarle una
  entrada, con sus emojis y sus asteriscos, para que quien los recibe lea lo
  mismo en las dos empresas. Dos cosas propias de aquí:

  · El pie lleva la razón social de La Cantera (decisión 0.7), no la de MGG.
  · Lo que entra «sin valorar» —donación, o no se sabe cuánto costó— lo dice
    con todas las letras: en MGG no existe, y un mensaje sin costo se leería
    como que alguien se olvidó de ponerlo.
*/

/** Una cantidad como se lee aquí: con coma decimal y sin ceros de relleno. */
export const num = (n: number) => n.toLocaleString('es-VE', { maximumFractionDigits: 4 })

const conUnidad = (n: number, u?: string | null) => `${num(n)}${u?.trim() ? ` ${u.trim()}` : ''}`

/** El costo con su moneda: el dólar con su signo delante, como MGG; el resto, detrás. */
const costoTxt = (costo: number, moneda: string) =>
  moneda === 'USD' ? `$${num(costo)}` : `${num(costo)} ${moneda === 'VES' ? 'Bs' : moneda}`

/** Quién, cuándo y de qué empresa. */
function pie(d: { almacen: string; empresa: string; quien?: string | null; cuando?: string | null }): string[] {
  const l: string[] = ['']
  if (d.quien?.trim()) l.push(`👷 *Registrado por:* ${d.quien.trim()}`)
  const f = fechaHoraVE(d.cuando ?? null)
  if (f) l.push(`🕒 ${f}`)
  l.push('', `🏢 *${d.empresa.toUpperCase()}* · ${d.almacen}`)
  return l
}

/** Producto nuevo dado de alta (con lo que entró, si entró algo). */
export function mensajeProductoNuevo(d: {
  almacen: string
  empresa: string
  codigo: string
  nombre: string
  categoria: string
  unidad: string
  cantidad: number
  costo: number | null
  sinValor: boolean
  quien?: string | null
  cuando?: string | null
}): string {
  const l = [
    '🆕 *PRODUCTO NUEVO EN INVENTARIO*',
    `🏬 *Almacén:* ${d.almacen}`,
    '',
    `📦 *Producto:* ${d.nombre}`,
    `🔖 *Código:* ${d.codigo}`,
    `📂 *Categoría:* ${d.categoria}`,
    `🔢 *Cantidad inicial:* ${conUnidad(d.cantidad, d.unidad)}`,
  ]
  if (d.cantidad > 0 && d.sinValor) l.push('💵 *Costo c/u:* sin valorar (donación, o no se sabe cuánto costó)')
  else if ((Number(d.costo) || 0) > 0) l.push(`💵 *Costo c/u:* ${costoTxt(Number(d.costo), 'USD')}`)
  l.push(...pie(d))
  return l.join('\n')
}

/** Entrada a un producto que ya estaba. */
export function mensajeEntrada(d: {
  almacen: string
  empresa: string
  nombre: string
  codigo?: string | null
  unidad?: string | null
  cantidad: number
  stockDespues: number
  costo: number | null
  moneda: string
  sinValor: boolean
  nota?: string | null
  quien?: string | null
  cuando?: string | null
}): string {
  const l = [
    '📥 *ENTRADA A INVENTARIO*',
    `🏬 *Almacén:* ${d.almacen}`,
    '',
    `📦 *Producto:* ${d.nombre}${d.codigo ? ` (${d.codigo})` : ''}`,
    `🔢 *Entró:* ${conUnidad(d.cantidad, d.unidad)}`,
    `📊 *Queda en:* ${conUnidad(d.stockDespues, d.unidad)}`,
  ]
  if (d.sinValor) l.push('💵 *Costo c/u:* sin valorar (donación, o no se sabe cuánto costó)')
  else if ((Number(d.costo) || 0) > 0) l.push(`💵 *Costo c/u:* ${costoTxt(Number(d.costo), d.moneda)}`)
  if (d.nota?.trim()) l.push(`📝 *Nota:* ${d.nota.trim()}`)
  l.push(...pie(d))
  return l.join('\n')
}

/*
  08/11/2026, fase 1b: salida, traslado, retorno y reporte de stock, con los
  números de aquí (SS de la solicitud, NS de la nota, MOV del libro, ASG del
  préstamo) en vez de los SAT-/TRA- de MGG.
*/

/** Un material de una salida o un traslado. */
export interface MaterialDelMensaje {
  nombre: string
  codigo?: string | null
  unidad?: string | null
  cantidad: number
}

/** «📦 Material» si es uno, «📦 Materiales (n)» con viñetas si son varios. */
function lineasDeMateriales(m: MaterialDelMensaje[], conCodigo: boolean): string[] {
  if (m.length === 1) {
    const x = m[0]
    return [
      `📦 *Material:* ${x.nombre}${conCodigo && x.codigo ? ` (${x.codigo})` : ''}`,
      `🔢 *Cantidad:* ${conUnidad(x.cantidad, x.unidad)}`,
    ]
  }
  return [`📦 *Materiales (${m.length}):*`, ...m.map((x) => `• ${x.nombre}: ${conUnidad(x.cantidad, x.unidad)}`)]
}

/** Salida de almacén: entregada, por aprobar, o prestada con retorno. */
export function mensajeSalida(d: {
  almacen: string
  empresa: string
  /** SS-… y, si se entregó, NS-…. */
  numero?: string | null
  nota?: string | null
  materiales: MaterialDelMensaje[]
  motivo: string
  /** Para quién sale: la persona, o el destino de fuera con quien responde. */
  recibe?: string | null
  /** Quien la aprobó, si ya está aprobada. */
  autorizo?: string | null
  /** Cierto cuando quedó esperando aprobación. */
  porAprobar?: boolean
  retorna: boolean
  /** A quién se le prestó, si retorna. */
  prestadoA?: string | null
  fotos?: number
  quien?: string | null
  cuando?: string | null
}): string {
  const n = [d.numero, d.nota].filter(Boolean).join(' · ')
  const l = ['📤 *SALIDA DE ALMACÉN*']
  if (n) l.push(`🔖 *N°:* ${n}`)
  l.push(`🏬 *Almacén:* ${d.almacen}`, '', ...lineasDeMateriales(d.materiales, false))
  if (d.motivo.trim()) l.push(`📝 *Motivo:* ${d.motivo.trim()}`)
  if (d.recibe?.trim()) l.push(`👤 *Lo recibe:* ${d.recibe.trim()}`)
  if (d.prestadoA?.trim()) l.push(`👷 *Prestado a:* ${d.prestadoA.trim()}`)
  if (d.porAprobar) l.push('⏳ *Estado:* Por aprobar')
  else if (d.autorizo?.trim()) l.push(`✅ *Autorizado por:* ${d.autorizo.trim()}`)
  l.push(d.retorna ? '🔄 *Retorna:* SÍ' : '❌ *Retorna:* NO')
  if (d.fotos) l.push(`📷 *Fotos:* ${d.fotos}`)
  l.push(...pie(d))
  return l.join('\n')
}

/** Traslado directo entre almacenes. */
export function mensajeTraslado(d: {
  empresa: string
  origen: string
  destino: string
  numeros?: string[]
  materiales: MaterialDelMensaje[]
  motivo: string
  /** Lo que queda en el origen; solo con un material. */
  quedaEnOrigen?: number | null
  quien?: string | null
  cuando?: string | null
}): string {
  const l = ['🔁 *TRASLADO ENTRE ALMACENES*']
  if (d.numeros?.length) l.push(`🔖 *N°:* ${d.numeros.join(', ')}`)
  l.push(`🏬 *De:* ${d.origen}`, `🏬 *A:* ${d.destino}`, '', ...lineasDeMateriales(d.materiales, true))
  if (d.motivo.trim()) l.push(`📝 *Motivo:* ${d.motivo.trim()}`)
  if (d.materiales.length === 1 && d.quedaEnOrigen != null) {
    l.push(`📊 *Queda en ${d.origen}:* ${conUnidad(d.quedaEnOrigen, d.materiales[0].unidad)}`)
  }
  l.push(...pie({ ...d, almacen: d.origen }))
  return l.join('\n')
}

/** Retorno de un préstamo al almacén, todo o una parte. */
export function mensajeRetorno(d: {
  almacen: string
  empresa: string
  numero?: string | null
  nombre: string
  unidad?: string | null
  cantidad: number
  total: number
  falta: number
  prestadoA?: string | null
  nota?: string | null
  quien?: string | null
  cuando?: string | null
}): string {
  const l = ['🔄 *RETORNO AL ALMACÉN*']
  if (d.numero) l.push(`🔖 *Salida:* ${d.numero}`)
  l.push(
    `🏬 *Almacén:* ${d.almacen}`,
    '',
    `📦 *Material:* ${d.nombre}`,
    `🔢 *Retorna:* ${conUnidad(d.cantidad, d.unidad)} de ${conUnidad(d.total, d.unidad)}`,
  )
  if (d.prestadoA?.trim()) l.push(`👷 *Lo tenía:* ${d.prestadoA.trim()}`)
  l.push(d.falta > 0 ? `⏳ *Falta por retornar:* ${conUnidad(d.falta, d.unidad)}` : '✅ *Retornó completo*')
  if (d.nota?.trim()) l.push(`📝 *Nota:* ${d.nota.trim()}`)
  l.push(...pie(d))
  return l.join('\n')
}

/** dd/mm/aaaa de una fecha AAAA-MM-DD, sin pasar por husos. */
const ddmmaaaa = (f: string) => {
  const [a, m, d] = f.split('-')
  return `${d}/${m}/${a}`
}

/** El stock de un almacén en unas fechas, agrupado por categoría. */
export function mensajeStock(d: {
  almacen: string
  empresa: string
  desde: string
  hasta: string
  filas: Array<{
    nombre: string
    categoria: string
    unidad: string
    cierre: number
    entradas: number
    salidas: number
  }>
  quien?: string | null
}): string {
  const l = [`📦 *STOCK · ${d.almacen.toUpperCase()}*`]
  l.push(
    d.desde === d.hasta
      ? `📅 *Fecha:* ${ddmmaaaa(d.hasta)}`
      : `📅 *Período:* ${ddmmaaaa(d.desde)} al ${ddmmaaaa(d.hasta)}`,
    `📊 *Existencia al cierre del ${ddmmaaaa(d.hasta)}*`,
    '',
  )
  if (d.filas.length === 0) {
    l.push('Sin existencias ni movimientos en esas fechas.')
  } else {
    let cat: string | null = null
    for (const f of d.filas) {
      if (f.categoria !== cat) {
        if (cat !== null) l.push('')
        cat = f.categoria
        l.push(`📂 *${cat.toUpperCase()}*`)
      }
      const mov = [f.entradas > 0 ? `📥 +${num(f.entradas)}` : '', f.salidas > 0 ? `📤 −${num(f.salidas)}` : '']
        .filter(Boolean)
        .join(' · ')
      l.push(`• ${f.nombre}: *${conUnidad(f.cierre, f.unidad)}*${mov ? ` (${mov})` : ''}`)
    }
    l.push(
      '',
      `🔢 *Productos con existencia:* ${d.filas.filter((f) => f.cierre > 0).length}`,
      `🔄 *Con movimiento en el período:* ${d.filas.filter((f) => f.entradas > 0 || f.salidas > 0).length}`,
    )
  }
  const p = pie({ ...d, quien: null })
  if (d.quien?.trim()) p.splice(1, 0, `👷 *Generado por:* ${d.quien.trim()}`)
  l.push(...p)
  return l.join('\n')
}
