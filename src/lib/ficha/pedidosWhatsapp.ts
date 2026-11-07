/*
  LOS MENSAJES DE WHATSAPP DE LA SOLICITUD DE PEDIDO (MGG `revisionAlmacen.ts`)

  Copiados línea por línea de MGG, con sus emojis: todos son de color por sí
  mismos y van SIN el selector U+FE0F, que algunos teléfonos pintan como un
  cuadrito. Nada se manda solo: el texto se enseña en `ModalWhatsappCompra` y
  desde ahí se copia o se abre WhatsApp (hoja de compartir en el teléfono,
  api.whatsapp.com en la computadora, nunca wa.me).

  Una diferencia, la de todo el módulo: revisa UN almacén (ALM-GEN). El
  mensaje de la revisión completa de MGG lista «Revisaron: Los Pinos — X ·
  Matanza — Y» y el reparto por sede; aquí hay una sola, así que sale
  «Revisó: …» y lo que tiene, sin bloques por sede ni traslados. Lo que el
  almacén entrega sale por una solicitud de salida, y el mensaje lo dice.
*/
import type { Orden } from '@/lib/api/pedidos'
import {
  cantidadSolicitada,
  fechaHoraVE,
  fmtCant,
  quienSolicita,
  resumenRevision,
  seRevisa,
} from '@/lib/pedidos'

function linea(r: { nombre: string; cantidad: number; unidad?: string | null }): string {
  const u = (r.unidad ?? '').trim()
  return `• ${r.nombre} — ${fmtCant(r.cantidad)}${u ? ' ' + u : ''}`
}

/** MGG `mensajeSolicitudPedido`: la SP tal como se pidió. */
export function mensajeSolicitudPedido(o: Orden): string {
  const items = (o.items ?? []).filter((it) => seRevisa(it) || it.cantidad_solicitada != null)
  const partes: string[] = []
  partes.push(`📋 *SOLICITUD DE PEDIDO ${o.codigo}*`)
  if (o.urgente) partes.push('🚨 *URGENTE*')
  partes.push(`📅 ${fechaHoraVE(o.creado_en)}`)
  // MGG pone aquí la sede donde se necesita. Todo llega al almacén general.
  partes.push('📍 Se necesita en: Almacén General')
  const unidad = (o.unidad_solicitante ?? '').trim()
  const persona = (quienSolicita(o) ?? '').trim()
  if (unidad || persona) partes.push(`👤 Solicita: ${[unidad, persona].filter(Boolean).join(' — ')}`)
  const finalidad = (o.finalidad ?? o.motivo ?? '').trim()
  if (finalidad) partes.push(`🎯 Finalidad: ${finalidad}`)
  partes.push('')
  partes.push(`*PRODUCTOS SOLICITADOS (${items.length}):*`)
  for (const it of items) partes.push(linea({ nombre: it.nombre, cantidad: cantidadSolicitada(it), unidad: it.unidad }))
  const nota = (o.notas ?? '').trim()
  if (nota) {
    partes.push('')
    partes.push(`📝 ${nota}`)
  }
  return partes.join('\n')
}

/** MGG `mensajeRevisionAlmacen`: lo que entrega el almacén y lo que va a Compras. */
export function mensajeRevisionAlmacen(o: Orden): string {
  const { tiene, falta } = resumenRevision(o.items ?? [])
  const partes: string[] = []
  partes.push(`✅ *ALMACÉN HA REVISADO LA ORDEN ${o.codigo}*`)
  partes.push(`📅 ${fechaHoraVE(o.revisada_almacen_en)}`)
  partes.push('📍 Se necesita en: Almacén General')
  const revisor = (o.revisada_almacen_por_nombre ?? '').trim()
  if (revisor) partes.push(`👤 Revisó: ${revisor}`)
  partes.push('')
  partes.push('📦 *TIENE (lo entrega almacén):*')
  if (!tiene.length) partes.push('• Nada de lo solicitado')
  else for (const r of tiene) partes.push(linea(r))
  // Propio de La Cantera: lo que entrega sale por una solicitud de salida.
  if (o.salida_almacen_numero) {
    partes.push('')
    partes.push(`📤 Sale por la solicitud de salida ${o.salida_almacen_numero}`)
  }
  partes.push('')
  if (falta.length) {
    partes.push('🛒 *VA A SOLICITAR A COMPRAS:*')
    for (const r of falta) partes.push(linea(r))
  } else {
    partes.push('🛒 *VA A SOLICITAR A COMPRAS:* nada, almacén tiene todo.')
  }
  const nota = (o.nota_almacen ?? '').trim()
  if (nota) {
    partes.push('')
    partes.push(`📝 ${nota}`)
  }
  return partes.join('\n')
}
