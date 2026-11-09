/*
  EL AVISO DEL MOVIMIENTO PARA WHATSAPP (Golden Touch, mensajeMovimiento.ts).

  Qué salió, cuántos litros, de qué tanque, a qué equipo, quién autorizó y
  cuándo. Con emojis porque se lee en el teléfono, a la carrera y con sol.

  TODOS LOS EMOJIS SON «EMOJI POR DEFECTO» y van sin el selector U+FE0F:
  WhatsApp lo pierde al abrir el enlace y los de texto (⚠ ↩ 🛢) llegaban en
  blanco y negro o como un cuadrito. Por eso el tanque es 🪣 y no 🛢.

  Lo de La Cantera que Golden Touch no tenía: el número del vale, quién
  recibió y para qué se surtió. Lo de Golden Touch que aquí no va: el registro
  en Drive (decisión de la dueña: solo el cuaderno).
*/
import { EMPRESA } from '@/lib/empresa'
import { horaParaLeer } from './horaMovimiento'
import { n, type MovimientoLibro, type TipoMovLibro } from './tipos'

export const EMOJI_TIPO: Record<TipoMovLibro, string> = {
  uso: '🔽',
  traslado: '🔁',
  entrada: '🔼',
  retorno: '🔃',
  merma: '🚨',
  reverso: '❌',
  ajuste: '🧮',
}

export const TITULO_TIPO: Record<TipoMovLibro, string> = {
  uso: 'SALIDA DE COMBUSTIBLE',
  traslado: 'TRASLADO ENTRE TANQUES',
  entrada: 'ENTRADA DE COMBUSTIBLE',
  retorno: 'RETORNO AL TANQUE',
  merma: 'MERMA / FALTANTE',
  reverso: 'ANULACIÓN',
  ajuste: 'AJUSTE DE COSTO',
}

const num = (v: number | string | null | undefined) =>
  n(v).toLocaleString('es-VE', { maximumFractionDigits: 2 })

/** AAAA-MM-DD → DD/MM/AAAA. */
export function fechaCorta(f: string | null | undefined): string {
  const d = String(f ?? '').slice(0, 10)
  return d.length === 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : ''
}

export interface DatosMensaje {
  mov: Pick<
    MovimientoLibro,
    | 'tipo'
    | 'litros'
    | 'fecha'
    | 'hora'
    | 'equipo'
    | 'autorizado_por'
    | 'ubicacion'
    | 'observacion'
    | 'contador_global_fin'
    | 'horometro_fin'
    | 'kilometraje'
    | 'registrado_en_cuaderno'
    | 'cuaderno_litros'
  > &
    Partial<Pick<MovimientoLibro, 'vale_numero' | 'numero' | 'recibio' | 'motivo' | 'motivo_detalle' | 'tanque' | 'tanque_destino'>>
  /** El nombre del motivo («Producción»), si se tiene; si no, el código. */
  motivoNombre?: string | null
  /** Quién lo cargó (va al pie). */
  registradoPor?: string | null
}

/** El mensaje listo para WhatsApp. Lo que no existe no se escribe. */
export function mensajeMovimiento(d: DatosMensaje): string {
  const m = d.mov
  const signo = m.tipo === 'entrada' || m.tipo === 'retorno' ? '+' : '-'
  const lineas: string[] = [`${EMOJI_TIPO[m.tipo]} *${TITULO_TIPO[m.tipo]}*`]

  const ref = m.vale_numero ?? m.numero
  if (ref) lineas.push(`🧾 *${m.vale_numero ? 'Vale' : 'Movimiento'}:* ${ref}`)
  lineas.push('', `⛽ *Litros:* ${signo}${num(m.litros)} L`)

  if (m.tanque) lineas.push(`🪣 *Tanque:* ${m.tanque}`)
  if (m.tipo === 'traslado' && m.tanque_destino) lineas.push(`👉 *Pasa al tanque:* ${m.tanque_destino}`)
  if (m.equipo) lineas.push(`🚚 *Equipo:* ${m.equipo}`)
  if (m.recibio) lineas.push(`👤 *Recibió:* ${m.recibio}`)
  const para = d.motivoNombre ?? m.motivo
  if (para) lineas.push(`🎯 *Para qué:* ${para}${m.motivo_detalle ? ` · ${m.motivo_detalle}` : ''}`)
  if (m.autorizado_por) lineas.push(`✅ *Autorizado por:* ${m.autorizado_por}`)
  if (m.ubicacion) lineas.push(`📍 *Destino:* ${m.ubicacion}`)

  const fecha = fechaCorta(m.fecha)
  const hora = horaParaLeer(m.hora)
  if (fecha) lineas.push(`📅 *Fecha:* ${fecha}${hora ? ` · 🕒 ${hora}` : ''}`)
  else if (hora) lineas.push(`🕒 *Hora:* ${hora}`)

  if (m.contador_global_fin != null) lineas.push(`🔢 *Contador:* ${num(m.contador_global_fin)}`)
  if (m.horometro_fin != null) lineas.push(`⏳ *Horómetro:* ${num(m.horometro_fin)}`)
  if (m.kilometraje != null) lineas.push(`📏 *Kilometraje:* ${num(m.kilometraje)}`)

  if (m.registrado_en_cuaderno) {
    const cant = m.cuaderno_litros != null ? `${num(m.cuaderno_litros)} L` : `${num(m.litros)} L`
    lineas.push(`📖 *Registro Cuaderno:* ${cant}`)
  }
  if (m.observacion) lineas.push(`📝 *Nota:* ${m.observacion}`)

  lineas.push('', `🏢 ${EMPRESA.razonSocial}${d.registradoPor ? ` · Cargado por ${d.registradoPor}` : ''}`)
  return lineas.join('\n')
}

/** Quita el selector invisible U+FE0F que algunos teclados pegan detrás de un emoji. */
export function sinSelectorDeEmoji(texto: string): string {
  return texto.replace(/️/g, '')
}
