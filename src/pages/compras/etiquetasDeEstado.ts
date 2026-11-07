import { ordenVigente, type Compra } from '@/lib/api/compras'

/**
 * Cómo se lee cada estado de la compra (la solicitud y su orden), con su color.
 *
 * Vive aparte para que el detalle, la vista de teléfono y los WhatsApp digan lo
 * mismo.
 */
export const ETIQUETAS: Record<string, { texto: string; tono: 'neutral' | 'info' | 'royal' | 'warning' | 'success' | 'danger' }> = {
  BORRADOR: { texto: 'Borrador', tono: 'neutral' },
  // Fase 2: el almacén general dice qué tiene antes de que llegue a Compras.
  REVISION_ALMACEN: { texto: 'En revisión del almacén', tono: 'warning' },
  PEDIDO: { texto: 'Pedido', tono: 'neutral' },
  CONFIRMADA: { texto: 'Confirmada · indicar proveedores', tono: 'info' },
  POR_CONFIRMAR_GERENTE: { texto: 'Pendiente por aprobar', tono: 'royal' },
  APROBADA: { texto: 'Aprobada', tono: 'warning' },
  CANCELADA: { texto: 'Cancelada', tono: 'neutral' },
  POR_INDICAR_PAGO: { texto: 'Aprobada · indicar método de pago', tono: 'warning' },
  /*
    El estado se sigue llamando EN_TESORERIA en la base y el rotulo ya no lo
    dice. Christopher: «hay un momento en que el estatus es "En tesoreria" y eso
    ya no debe ser, pues "Tesoreria" como la habiamos conocido ya no existe».

    No se le cambia el nombre al estado: es un CHECK sobre texto que nombran
    varias funciones y ocho ordenes ya escritas, y renombrarlo por un rotulo
    seria mover la base para arreglar una palabra. Lo que se cambia es lo que
    lee la gente, que es lo unico que estaba mal: el estado nunca dijo «esta en
    un departamento», dijo «el pago esta indicado y falta que salga el dinero».
  */
  EN_TESORERIA: { texto: 'Por pagar', tono: 'info' },
  // Contra entrega: aprobada y esperando el material, sin un bolivar fuera.
  POR_RECIBIR: { texto: 'Contra entrega · por recibir', tono: 'info' },
  PAGADA_POR_RECIBIR: { texto: 'Pagada · por recibir', tono: 'success' },
  RECIBIDA_PARCIAL: { texto: 'Recibida parcialmente', tono: 'success' },
  RECIBIDA: { texto: 'Recibida', tono: 'success' },
  PROVEEDOR_DESISTIO: { texto: 'El proveedor desistió', tono: 'danger' },
  // La compra pasó al Histórico de compras (06/11/2026). Lo escribe la
  // bitácora; en la compra se decide por `historico_en`.
  FINALIZADA: { texto: 'Finalizada', tono: 'info' },
  // Quien aprueba dijo que no se pagará todavía (lo escribe la bitácora).
  NO_PAGADA: { texto: 'No se pagará todavía', tono: 'warning' },
  // La salida del almacén general se rechazó o canceló (lo escribe la bitácora).
  SALIDA_RECHAZADA: { texto: 'El almacén no entregó: vuelve a compras', tono: 'warning' },
  // Fase 3: aprobada a crédito (lo escribe la bitácora).
  CUENTA_ABIERTA: { texto: 'Cuenta abierta · a crédito', tono: 'info' },
}

/**
 * El estado que se le muestra a la gente: el de la orden si ya la hay, el de la
 * solicitud si no, y «Finalizada» si ya pasó al histórico. El mismo cálculo
 * que hace el detalle de la compra.
 */
export function estadoDeLaCompra(compra: Compra): string {
  const orden = ordenVigente(compra)
  const estado = compra.historico_en ? 'FINALIZADA' : orden ? orden.estado : compra.estado
  return ETIQUETAS[estado]?.texto ?? estado
}
