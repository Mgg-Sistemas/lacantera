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
