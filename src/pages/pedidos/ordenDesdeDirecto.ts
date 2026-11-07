import { urlArchivoDirecto, type Orden, type ServicioDirecto } from '@/lib/api/pedidos'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'

/*
  UN SERVICIO DIRECTO VISTO COMO ORDEN, PARA LAS CUENTAS DEL PAGO

  El método de pago, el documento, las retenciones y «💵 Marcar pagado» del
  servicio directo usan las mismas pantallas de la fase 3 (`MetodoPagoModal`,
  `MarcarPagadaModal`). Esas pantallas calculan sobre una `Orden`: aquí se
  arma una con lo que importa al pago, igual que `private.compras_sd_como_orden`
  en la base: un solo renglón por el total de la factura, sin IVA ni descuento
  de cotización (un servicio directo no los lleva), y lo ya indicado del pago.
*/
export function ordenDesdeDirecto(s: ServicioDirecto): Orden {
  const gasto = Number(s.gasto) || 0
  return {
    id: s.id,
    codigo: s.codigo,
    parent_orden_id: null,
    clase: 'servicio',
    estado: s.estado === 'confirmada_pagar' ? 'oc_aprobada' : 'confirmada_metodo',
    proveedor_id: s.proveedor_id,
    items: [{ sku: 'SD', nombre: s.descripcion, cantidad: 1, precio: gasto, comprar: true }],
    total: gasto,
    moneda: 'USD',
    iva: null,
    igtf: null,
    iva_incluido: false,
    descuento_obtenido: null,
    ajuste: null,
    condiciones_pago: null,
    recibido_total: null,
    recibida_en: null,
    modalidad_pago: null,
    oc_codigo: null,
    abonado_total: 0,
    retenciones: s.retenciones ?? [],
    descuento_pago: s.descuento_pago,
    metodo_pago: s.metodo_pago,
    metodo_pago_por_nombre: s.metodo_pago_por_nombre,
    metodo_pago_en: s.metodo_pago_en,
    comprobante_tipo: s.comprobante_tipo,
    numero_administracion: s.numero_administracion,
    pago_qr_path: s.pago_qr_path,
    pago_qr_nombre: s.pago_qr_nombre,
    pagada_en: s.pagada_en,
    historial: s.historial ?? [],
    urgente: false,
  } as unknown as Orden
}

/** Abre un archivo del servicio directo (factura, QR, comprobante) en otra pestaña. */
export async function abrirArchivoDirecto(path: string): Promise<void> {
  try {
    window.open(await urlArchivoDirecto(path), '_blank', 'noopener')
  } catch (e) {
    toast(mensajeDe(e, 'No se pudo abrir el archivo'), 'error')
  }
}
