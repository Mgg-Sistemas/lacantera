import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

// ---------------------------------------------------------------------------
// Las siete columnas del tablero
//
// El nombre de la columna lo calcula la vista `v_compras_tablero`, no esta
// pantalla: si el tablero decidiera por su cuenta en qué columna va cada
// tarjeta, un informe podría contar distinto que el tablero.
// ---------------------------------------------------------------------------

export type Columna =
  | 'PEDIDO'
  | 'CONFIRMADA'
  | 'GERENTE'
  | 'APROBADA'
  | 'PAGADA'
  | 'CANCELADA'
  | 'DESISTIO'
  | 'RECIBIDA'

export interface DefinicionColumna {
  clave: Columna
  titulo: string
  /** Lo que hay que hacer para que la tarjeta salga de aquí. */
  accion: string
  tono: 'neutral' | 'info' | 'royal' | 'warning' | 'success' | 'danger'
}

export const COLUMNAS: DefinicionColumna[] = [
  { clave: 'PEDIDO', titulo: 'Pedido', accion: 'Confirmar', tono: 'neutral' },
  { clave: 'CONFIRMADA', titulo: 'Confirmada', accion: 'Indicar proveedores', tono: 'info' },
  { clave: 'GERENTE', titulo: 'Confirmar por el gerente', accion: 'Aprobar', tono: 'royal' },
  { clave: 'APROBADA', titulo: 'Aprobada', accion: 'Indicar método de pago', tono: 'warning' },
  { clave: 'PAGADA', titulo: 'Pagada', accion: 'Falta que llegue el material', tono: 'success' },
  // La compra termina aquí, pero se queda a la vista: si desapareciera al
  // recibirse, no habría dónde comprobar que llegó.
  { clave: 'RECIBIDA', titulo: 'Recibida', accion: 'Cerrada', tono: 'info' },
  { clave: 'CANCELADA', titulo: 'Cancelada', accion: 'No sigue', tono: 'neutral' },
  { clave: 'DESISTIO', titulo: 'El proveedor desistió', accion: 'Resolver el dinero', tono: 'danger' },
]

export interface Tarjeta {
  solicitud_id: number
  numero: string
  titulo: string
  prioridad: 'NORMAL' | 'ALTA' | 'URGENTE'
  requerida_para: string | null
  destino: string | null
  destino_almacen_id: number | null
  estado_solicitud: string
  creada_en: string
  /** Quién pidió, cuando tiene usuario en el sistema. */
  solicitante_id: string | null
  /** El nombre de quien pidió, venga del perfil o escrito a mano. */
  solicitante: string | null
  solicitante_cargo: string | null
  /** Quién lo cargó. No siempre es la misma persona que lo pidió. */
  registrada_por: string
  registrada_por_nombre: string | null
  orden_id: number | null
  orden_numero: string | null
  estado_orden: string | null
  fecha_pago: string | null
  entrega_estimada: string | null
  desistio_resolucion: string | null
  proveedor: string | null
  moneda: string | null
  total: string | null
  total_usd: string | null
  total_bs: string | null
  cotizaciones: number
  renglones: number
  dias_sin_recibir: number | null
  columna: Columna
}

export function useTablero() {
  return useQuery({
    queryKey: ['compras', 'tablero'],
    queryFn: async () =>
      desenvolver<Tarjeta[]>(
        await supabase.from('v_compras_tablero').select('*').order('creada_en', { ascending: false }),
      ),
    // Quien mantiene esto al día es el enlace en vivo (src/lib/tiempoReal.ts).
    // Este intervalo es la red debajo: si el socket se cayó y nadie lo notó,
    // el tablero se pone al día solo cada cinco minutos en vez de quedarse
    // congelado hasta que alguien recargue.
    refetchInterval: 5 * 60_000,
  })
}

// ---------------------------------------------------------------------------
// Detalle de una compra
// ---------------------------------------------------------------------------

export interface RenglonPedido {
  id: number
  linea: number
  articulo_id: number | null
  descripcion: string
  cantidad: string
  unidad: string
  observacion: string | null
}

export interface RenglonCotizacion {
  id: number
  solicitud_renglon_id: number
  cantidad: string
  precio_unitario: string
  exento_iva: boolean
  subtotal: string
  /**
   * Qué marca ofrece el proveedor para este renglón, y cómo viene.
   *
   * No están en el pedido y no es un olvido: quien pide lo pide en litros,
   * que es como se consume, y la marca y el bidón llegan después, con el
   * papel del proveedor y a otra persona. Por eso se escriben al cargar o al
   * corregir la cotización, y no antes.
   *
   * Es lo que distingue dos cotizaciones del mismo proveedor por el mismo
   * artículo, que desde el 27 de agosto pueden convivir.
   */
  marca: string | null
  presentacion: string | null
  observacion: string | null
}

export interface Cotizacion {
  id: number
  /** Correlativo propio: COT-2026-0001. Lo asigna la base, no el navegador. */
  numero: string
  proveedor_id: number
  /** El número que el proveedor puso en su papel, cuando lo puso. */
  numero_proveedor: string | null
  fecha: string
  validez_dias: number
  dias_entrega: number | null
  condicion_pago: string
  moneda: string
  tasa: string
  tasa_usd: string
  alicuota_iva: string
  descuento: string
  flete: string
  subtotal: string
  base_imponible: string
  iva: string
  total: string
  total_bs: string
  total_usd: string
  observacion: string | null
  /** Quien la cargo. Va en el papel: «Cargada por». */
  registrada_por: string | null
  registrada_en: string
  /**
   * Compras la subió a la gerencia.
   *
   * Pueden estar marcadas varias del mismo pedido: el gerente compara y escoge
   * una al aprobar. Antes esto vivía en `solicitudes_pedido.cotizacion_elegida_id`,
   * que al ser una sola columna hacía que proponer la segunda desproponiera la
   * primera sin decir nada.
   */
  propuesta: boolean
  proveedor: { id: number; nombre: string; rif: string; condicion_pago: string } | null
  renglones: RenglonCotizacion[]
}

export interface InstruccionPago {
  id: number
  metodo: 'TRANSFERENCIA' | 'PAGO_MOVIL' | 'BINANCE' | 'EFECTIVO'
  moneda: string
  monto: string
  monto_bs: string
  monto_usd: string
  igtf_aplica: boolean
  igtf_monto: string
  banco: string | null
  numero_cuenta: string | null
  titular: string | null
  documento: string | null
  telefono: string | null
  correo_binance: string | null
  red_cripto: string | null
  receptor: string | null
  estado: 'POR_PAGAR' | 'PAGADA' | 'DEVUELTA' | 'ANULADA'
  nota: string | null
  referencia: string | null
  fecha_pago: string | null
  creada_en: string
  motivo_devolucion: string | null
}

export interface RenglonOrden {
  id: number
  linea: number
  articulo_id: number | null
  descripcion: string
  cantidad: string
  unidad: string
  precio_unitario: string
  exento_iva: boolean
  subtotal: string
  cantidad_recibida: string
}

export interface Orden {
  id: number
  numero: string
  estado: string
  /**
   * Con qué respalda el proveedor esta compra: NOTA_ENTREGA o FACTURA.
   *
   * Nulo mientras nadie lo diga, y sin decirlo la base no deja instruir el
   * pago. Solo la factura da derecho al crédito fiscal y entra al libro de
   * compras.
   */
  comprobante_tipo: string | null
  moneda: string
  tasa: string
  tasa_usd: string
  subtotal: string
  descuento: string
  flete: string
  iva: string
  total: string
  total_bs: string
  total_usd: string
  dias_entrega: number | null
  entrega_estimada: string | null
  /** Cómo se le paga. Va impreso en la orden que se le manda al proveedor. */
  condicion_pago: string | null
  /** De qué cotización salió. De ahí sale la alícuota que imprime la orden. */
  cotizacion_id: number | null
  fecha_pago: string | null
  recibida_en: string | null
  desistio_motivo: string | null
  desistio_en: string | null
  desistio_resolucion: string | null
  desistio_nota: string | null
  motivo_cancelacion: string | null
  creada_en: string
  proveedor: {
    id: number
    nombre: string
    rif: string
    /** Cómo suele cobrar. Se propone al pagarle. */
    metodo_pago_preferido: string | null
    /** Para el papel: una orden de compra lleva a dónde se le manda. */
    direccion: string | null
    telefono: string | null
  } | null
  /** A dónde pidió el solicitante que fuera. Decide el almacén al recibir. */
  solicitud: { destino: string | null; destino_almacen_id: number | null } | null
  renglones: RenglonOrden[]
  instrucciones: InstruccionPago[]
}

/**
 * Las órdenes que esperan material.
 *
 * Es la cola de almacén, no la de compras: aquí no importa quién aprobó ni cómo
 * se pagó, importa qué camión falta por llegar. Trae los renglones completos
 * porque la recepción se registra desde la misma fila, sin abrir la compra.
 */
const SELECT_ORDEN = `
  *,
  proveedor:proveedores(id, nombre, rif, metodo_pago_preferido),
  solicitud:solicitudes_pedido(destino, destino_almacen_id),
  renglones:orden_renglones(*),
  instrucciones:instrucciones_pago(*)
`

export function useOrdenesPorRecibir() {
  return useQuery({
    queryKey: ['compras', 'por-recibir'],
    queryFn: async () =>
      desenvolver<Orden[]>(
        await supabase
          .from('ordenes_compra')
          .select(SELECT_ORDEN)
          // Lo pagado y lo parcial es lo que de verdad está por llegar. Una
          // orden que sigue en tesorería no salió del banco todavía, y el
          // proveedor no despacha lo que no le han pagado.
          .in('estado', ['PAGADA_POR_RECIBIR', 'RECIBIDA_PARCIAL', 'POR_RECIBIR'])
          .order('fecha_pago', { ascending: true, nullsFirst: false }),
      ),
    refetchInterval: 5 * 60_000,
  })
}

export interface Compra {
  id: number
  numero: string
  titulo: string
  justificacion: string
  prioridad: 'NORMAL' | 'ALTA' | 'URGENTE'
  requerida_para: string | null
  destino: string | null
  /** El almacen al que va, cuando el destino es uno del inventario. */
  destino_almacen_id: number | null
  /**
   * La compra ya estaba hecha al cargarla: no paso por cotizaciones ni por el
   * gerente. Lo que cambia es como se lee y que se puede corregir; por debajo
   * es una orden como cualquier otra.
   */
  directa: boolean
  estado: string
  creada_en: string
  enviada_en: string | null
  /** Quién pidió: o un usuario del sistema, o un nombre escrito a mano. */
  solicitante_id: string | null
  solicitante_nombre: string | null
  solicitante_cargo: string | null
  /** Quién lo cargó en el sistema. */
  registrada_por: string
  confirmada_por: string | null
  confirmada_en: string | null
  cotizacion_elegida_id: number | null
  aprobada_gg_por: string | null
  aprobada_gg_en: string | null
  /**
   * De quien era la autoridad, si quien aprobo no podia por derecho propio.
   *
   * Nulo cuando aprueba quien le compete. Es lo que sale como «bajo
   * autorizacion de» en el papel y en el resumen del pedido.
   */
  aprobada_por_autorizacion_de: string | null
  motivo_cancelacion: string | null
  renglones: RenglonPedido[]
  cotizaciones: Cotizacion[]
  ordenes: Orden[]
}

const SELECT_DETALLE = `
  *,
  renglones:solicitud_renglones(*),
  cotizaciones:cotizaciones!cotizaciones_solicitud_id_fkey(
    *,
    proveedor:proveedores(id, nombre, rif, condicion_pago),
    renglones:cotizacion_renglones(*)
  ),
  ordenes:ordenes_compra(
    *,
    proveedor:proveedores(id, nombre, rif, metodo_pago_preferido, direccion, telefono),
  solicitud:solicitudes_pedido(destino, destino_almacen_id),
    renglones:orden_renglones(*),
    instrucciones:instrucciones_pago(*)
  )
`

/**
 * Una compra, o nada si ese pedido no existe.
 *
 * Con `single()` un pedido inexistente devolvia error, y react-query lo
 * reintentaba tres veces con espera creciente: varios segundos de «Cargando…»
 * para acabar en «Cannot coerce the result to a single JSON object», que no le
 * dice nada a nadie.
 *
 * Y llegar aqui es facil: basta una notificacion vieja, un enlace guardado o un
 * numero tecleado a mano. Paso de verdad al borrar los datos de prueba — diez
 * avisos seguian apuntando a un pedido que ya no estaba, y pulsarlos daba ese
 * error tecnico en rojo.
 *
 * Con `maybeSingle()` no hay error que reintentar: no esta, y la pantalla lo
 * dice de una vez con el vacio que ya tenia escrito y no llegaba a usar nunca.
 *
 * Es el mismo arreglo que ya llevaba `useEmpleado` en nomina.ts, por la misma
 * razon. Aqui no se habia hecho.
 */
export function useCompra(id: number | undefined) {
  return useQuery({
    enabled: id !== undefined && Number.isFinite(id),
    queryKey: ['compras', 'detalle', id],
    queryFn: async () =>
      desenvolver<Compra | null>(
        await supabase.from('solicitudes_pedido').select(SELECT_DETALLE).eq('id', id!).maybeSingle(),
      ),
  })
}

export interface EventoBitacora {
  id: number
  documento_tipo: string
  documento_id: number
  estado_anterior: string | null
  estado_nuevo: string
  nota: string | null
  actor_id: string | null
  ocurrido_en: string
}

export function useBitacora(solicitudId: number | undefined, ordenId: number | null | undefined) {
  return useQuery({
    enabled: solicitudId !== undefined,
    queryKey: ['compras', 'bitacora', solicitudId, ordenId],
    queryFn: async () => {
      const eventos = desenvolver<EventoBitacora[]>(
        await supabase
          .from('compras_bitacora')
          .select('*')
          .eq('documento_tipo', 'SOLICITUD')
          .eq('documento_id', solicitudId!)
          .order('ocurrido_en'),
      )

      if (!ordenId) return eventos

      const deOrden = desenvolver<EventoBitacora[]>(
        await supabase
          .from('compras_bitacora')
          .select('*')
          .eq('documento_tipo', 'ORDEN')
          .eq('documento_id', ordenId)
          .order('ocurrido_en'),
      )

      return [...eventos, ...deOrden].sort((a, b) =>
        a.ocurrido_en.localeCompare(b.ocurrido_en),
      )
    },
  })
}

/** La orden viva de una compra. Las canceladas quedan solo como historia. */
export function ordenVigente(compra: Compra | undefined): Orden | undefined {
  if (!compra?.ordenes?.length) return undefined
  return compra.ordenes.find((o) => o.estado !== 'CANCELADA') ?? compra.ordenes[0]
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

/**
 * Toda acción invalida el tablero y el detalle. Es deliberado que no se
 * actualice el estado en local: el estado nuevo lo decide la base, que puede
 * haber hecho más cosas de las que la pantalla sabe — aprobar una compra, por
 * ejemplo, crea una orden con sus renglones.
 */
/*
  El tipo del resultado se conserva.

  Antes se borraba a `unknown`, y por eso el id de orden que devuelve
  `aprobar_compra` llegaba al que llamaba como `{}`: la base lo prometia y
  TypeScript lo negaba. Quien queria encadenar algo con ese id —adjuntarle un
  papel, por ejemplo— tenia que aseverar el tipo a mano.
*/
function useAccion<A, R>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['compras'] })
      // Cada cambio de estado emite un aviso. Sin esta invalidación, quien lo
      // provoca no lo ve hasta la siguiente consulta periódica y parece que el
      // sistema no se enteró.
      void qc.invalidateQueries({ queryKey: ['notificaciones'] })
    },
  })
}

export interface RenglonNuevo {
  articulo_id: number | null
  descripcion: string
  cantidad: number
  unidad: string
  observacion?: string | null
}

export function useCrearPedido() {
  return useAccion(
    (p: {
      titulo: string
      justificacion: string
      renglones: RenglonNuevo[]
      prioridad?: string
      requerida_para?: string | null
      destino?: string | null
      /** El sitio del inventario al que va. Nulo si el destino no es uno. */
      destino_almacen_id?: number | null
      enviar?: boolean
      /** Usuario que pide. Sin ninguno de los dos, pide quien carga. */
      solicitante_id?: string | null
      /** Quien pide y no tiene usuario: el mecánico, el operador del frente. */
      solicitante_nombre?: string | null
      solicitante_cargo?: string | null
    }) =>
      rpc<number>('crear_pedido', {
        p_titulo: p.titulo,
        p_justificacion: p.justificacion,
        p_renglones: p.renglones,
        p_prioridad: p.prioridad ?? 'NORMAL',
        p_requerida_para: p.requerida_para || null,
        p_destino: p.destino || null,
        p_destino_almacen_id: p.destino_almacen_id ?? null,
        p_enviar: p.enviar ?? true,
        p_solicitante_id: p.solicitante_id || null,
        p_solicitante_nombre: p.solicitante_nombre || null,
        p_solicitante_cargo: p.solicitante_cargo || null,
      }),
  )
}

/**
 * Corregir un pedido, incluso después de enviado.
 *
 * Lo pidió Jesmary: equivocarse en un pedido ya enviado obligaba a cancelarlo
 * entero y volver a teclearlo, y el pedido perdía su número.
 *
 * La base lo permite hasta CONFIRMADA y **se niega en seco si ya hay
 * cotizaciones cargadas**. No es prudencia: los renglones de una cotización
 * cuelgan de los del pedido con borrado en cascada, y guardar aquí los borra y
 * los vuelve a crear con otros identificadores — se llevaría por delante las
 * cotizaciones sin dar un solo error.
 */
export function useActualizarPedido() {
  return useAccion(
    (p: {
      id: number
      titulo: string
      justificacion: string
      renglones: RenglonNuevo[]
      prioridad?: string
      requerida_para?: string | null
      destino?: string | null
      destino_almacen_id?: number | null
      solicitante_id?: string | null
      solicitante_nombre?: string | null
      solicitante_cargo?: string | null
    }) =>
      rpc('actualizar_pedido', {
        p_id: p.id,
        p_titulo: p.titulo,
        p_justificacion: p.justificacion,
        p_renglones: p.renglones,
        p_prioridad: p.prioridad ?? 'NORMAL',
        p_requerida_para: p.requerida_para || null,
        p_destino: p.destino || null,
        p_destino_almacen_id: p.destino_almacen_id ?? null,
        p_solicitante_id: p.solicitante_id || null,
        p_solicitante_nombre: p.solicitante_nombre || null,
        p_solicitante_cargo: p.solicitante_cargo || null,
      }),
  )
}

/** Un renglón de una compra que ya se hizo: lleva su precio puesto. */
export interface RenglonComprado {
  articulo_id?: number | null
  descripcion: string
  cantidad: number
  unidad: string
  precio_unitario: number
  exento_iva?: boolean
  marca?: string | null
  presentacion?: string | null
  observacion?: string | null
}

/**
 * Cargar una compra que ya se hizo, con su factura.
 *
 * NO ES UN PEDIDO. Un pedido pregunta; esto declara. Cuando alguien vuelve del
 * pueblo con dos cajas de guantes y su factura no hay nada que cotizar ni a
 * quién proponérselo: la compra ya ocurrió y lo único que falta es que el
 * sistema se entere, valorice el inventario y guarde el papel para el IVA.
 *
 * Por debajo recorre la misma escalera de siempre —solicitud, cotización,
 * orden— en una sola transacción, y por eso devuelve el id de la ORDEN: de ahí
 * en adelante la recepción, el pago, el libro de compras y el costo promedio
 * funcionan sin enterarse de que esta compra vino por otro camino. Una tabla
 * aparte la habría dejado fuera del libro de compras, que es justo donde el
 * SENIAT la busca.
 *
 * `recibir_en_almacen` mete el material en la misma transacción. Va aquí y no
 * en un segundo botón porque una recepción que falla despues de crear la
 * compra dejaría a quien la hizo creyendo que el material está en el almacén.
 */
export function useComprarDirecto() {
  return useAccion(
    (c: {
      proveedor_id: number
      moneda: string
      renglones: RenglonComprado[]
      titulo: string
      justificacion?: string | null
      numero_factura?: string | null
      fecha?: string | null
      condicion_pago?: string
      alicuota_iva?: number
      descuento?: number
      flete?: number
      observacion?: string | null
      destino_almacen_id?: number | null
      /** Si viene, el material entra al almacén en el mismo golpe. */
      recibir_en_almacen?: number | null
    }) =>
      rpc<number>('comprar_directo', {
        p_proveedor_id: c.proveedor_id,
        p_moneda: c.moneda,
        p_renglones: c.renglones,
        p_titulo: c.titulo,
        p_justificacion: c.justificacion || null,
        p_numero_factura: c.numero_factura || null,
        p_fecha: c.fecha || null,
        p_condicion_pago: c.condicion_pago ?? 'CONTADO',
        p_alicuota_iva: c.alicuota_iva ?? 16,
        p_descuento: c.descuento ?? 0,
        p_flete: c.flete ?? 0,
        p_observacion: c.observacion || null,
        p_destino_almacen_id: c.destino_almacen_id ?? null,
        p_recibir_en_almacen: c.recibir_en_almacen ?? null,
      }),
  )
}

/**
 * Corregir una compra directa. «Al darle aceptar, pueden editarla.»
 *
 * Mientras no se haya recibido ni pagado nada. Después no: los renglones de
 * una orden recibida ya movieron existencias y costo promedio, y corregirlos
 * por detrás dejaría el almacén diciendo una cosa y el papel otra.
 */
export function useEditarCompraDirecta() {
  return useAccion(
    (c: {
      orden_id: number
      proveedor_id: number
      moneda: string
      renglones: RenglonComprado[]
      titulo: string
      justificacion?: string | null
      numero_factura?: string | null
      fecha?: string | null
      condicion_pago?: string
      alicuota_iva?: number
      descuento?: number
      flete?: number
      observacion?: string | null
    }) =>
      rpc<number>('editar_compra_directa', {
        p_orden_id: c.orden_id,
        p_proveedor_id: c.proveedor_id,
        p_moneda: c.moneda,
        p_renglones: c.renglones,
        p_titulo: c.titulo,
        p_justificacion: c.justificacion || null,
        p_numero_factura: c.numero_factura || null,
        p_fecha: c.fecha || null,
        p_condicion_pago: c.condicion_pago ?? 'CONTADO',
        p_alicuota_iva: c.alicuota_iva ?? 16,
        p_descuento: c.descuento ?? 0,
        p_flete: c.flete ?? 0,
        p_observacion: c.observacion || null,
      }),
  )
}

export function useEnviarPedido() {
  return useAccion((p: { id: number }) => rpc('enviar_pedido', { p_id: p.id }))
}

export function useConfirmarPedido() {
  return useAccion((p: { id: number; nota?: string }) =>
    rpc('confirmar_pedido', { p_id: p.id, p_nota: p.nota ?? null }),
  )
}

export function useCancelarPedido() {
  return useAccion((p: { id: number; motivo: string }) =>
    rpc('cancelar_pedido', { p_id: p.id, p_motivo: p.motivo }),
  )
}

export interface RenglonCotizado {
  solicitud_renglon_id: number
  cantidad: number
  precio_unitario: number
  exento_iva: boolean
  marca?: string | null
  presentacion?: string | null
}

export function useRegistrarCotizacion() {
  return useAccion(
    (c: {
      solicitud_id: number
      proveedor_id: number
      moneda: string
      renglones: RenglonCotizado[]
      numero_proveedor?: string | null
      fecha?: string | null
      validez_dias?: number
      dias_entrega?: number | null
      condicion_pago?: string
      alicuota_iva?: number
      descuento?: number
      flete?: number
      observacion?: string | null
    }) =>
      rpc<number>('registrar_cotizacion', {
        p_solicitud_id: c.solicitud_id,
        p_proveedor_id: c.proveedor_id,
        p_moneda: c.moneda,
        p_renglones: c.renglones,
        p_numero_proveedor: c.numero_proveedor || null,
        p_fecha: c.fecha || null,
        p_validez_dias: c.validez_dias ?? 15,
        p_dias_entrega: c.dias_entrega ?? null,
        p_condicion_pago: c.condicion_pago ?? 'CONTADO',
        p_alicuota_iva: c.alicuota_iva ?? 16,
        p_descuento: c.descuento ?? 0,
        p_flete: c.flete ?? 0,
        p_observacion: c.observacion || null,
      }),
  )
}

/**
 * Corregir una cotización ya cargada, sobre la misma fila.
 *
 * No es lo mismo que volver a cargarla. Desde el 27 de agosto
 * `registrar_cotizacion` no sustituye a nadie: cada carga es una cotización
 * nueva, con su número, y dos del mismo proveedor conviven — que es lo que
 * pidió compras, porque un proveedor manda dos ofertas del mismo artículo en
 * marcas distintas.
 *
 * Así que las dos cosas hacen falta y no son la misma: cargar añade una oferta
 * más a la mesa; corregir arregla la que ya estaba. Esto último actualiza en
 * su sitio — mismo `id`, mismo número, misma trazabilidad—, que es lo que
 * pidió el reporte: «guardar los cambios sobre el mismo registro sin alterar
 * la trazabilidad del historial».
 */
export function useActualizarCotizacion() {
  return useAccion(
    (c: {
      id: number
      moneda: string
      renglones: Array<{
        solicitud_renglon_id: number
        cantidad: number
        precio_unitario: number
        exento_iva?: boolean
        marca?: string | null
        presentacion?: string | null
        observacion?: string | null
      }>
      numero_proveedor?: string | null
      fecha?: string | null
      validez_dias?: number
      dias_entrega?: number | null
      condicion_pago?: string
      alicuota_iva?: number
      descuento?: number
      flete?: number
      observacion?: string | null
    }) =>
      rpc<number>('actualizar_cotizacion', {
        p_id: c.id,
        p_moneda: c.moneda,
        p_renglones: c.renglones,
        p_numero_proveedor: c.numero_proveedor || null,
        p_fecha: c.fecha || null,
        p_validez_dias: c.validez_dias ?? 15,
        p_dias_entrega: c.dias_entrega ?? null,
        p_condicion_pago: c.condicion_pago ?? 'CONTADO',
        p_alicuota_iva: c.alicuota_iva ?? 16,
        p_descuento: c.descuento ?? 0,
        p_flete: c.flete ?? 0,
        p_observacion: c.observacion || null,
      }),
  )
}

/**
 * Bajar una cotización de la mesa del gerente.
 *
 * Antes no hacía falta: como solo podía haber una propuesta, proponer otra
 * desproponía la anterior sola. Ahora que se suman, retirar es una acción
 * propia — y retirar la última devuelve el pedido a compras, porque un pedido
 * esperando en la gerencia sin nada que aprobar es una bandeja con un papel
 * en blanco.
 *
 * Es además el camino para corregir o eliminar una cotización propuesta, que
 * la base sigue sin permitir: primero se baja, luego se toca.
 */
export function useRetirarCotizacion() {
  return useAccion((p: { id: number; nota?: string }) =>
    rpc('retirar_cotizacion', { p_cotizacion_id: p.id, p_nota: p.nota ?? null }),
  )
}

export function useEliminarCotizacion() {
  return useAccion((p: { id: number }) => rpc('eliminar_cotizacion', { p_id: p.id }))
}

export function useProponerCotizacion() {
  return useAccion((p: { solicitud_id: number; cotizacion_id: number; nota?: string }) =>
    rpc('proponer_cotizacion', {
      p_solicitud_id: p.solicitud_id,
      p_cotizacion_id: p.cotizacion_id,
      p_nota: p.nota ?? null,
    }),
  )
}

/**
 * El gerente aprueba, y ahora dice cuál.
 *
 * `cotizacion_id` se puede omitir cuando solo hay una propuesta —que es el
 * caso de siempre— y la base la toma sola. Con dos o más se niega a elegir por
 * su cuenta, y hace bien: escoger por el gerente sería firmarle una compra que
 * no decidió.
 */
export function useAprobarCompra() {
  return useAccion((p: { solicitud_id: number; cotizacion_id?: number | null; nota?: string }) =>
    rpc<number>('aprobar_compra', {
      p_solicitud_id: p.solicitud_id,
      p_cotizacion_id: p.cotizacion_id ?? null,
      p_nota: p.nota ?? null,
    }),
  )
}

export function useDevolverACotizacion() {
  return useAccion((p: { solicitud_id: number; motivo: string }) =>
    rpc('devolver_a_cotizacion', { p_solicitud_id: p.solicitud_id, p_motivo: p.motivo }),
  )
}


export interface DatosPago {
  banco?: string
  numero_cuenta?: string
  titular?: string
  documento?: string
  telefono?: string
  correo_binance?: string
  red_cripto?: string
  receptor?: string
}

/*
  DECLARAR CON QUÉ ENTREGA EL PROVEEDOR

  Va aparte de `indicar_pago` a propósito. Se sabe al pactar la compra o al
  recibir el material, casi siempre antes de que nadie piense en pagar, y
  obligar a decirlo dentro del formulario de pago sería preguntarlo tarde.

  Lo que sí hace el pago es negarse si esto falta.
*/
export function useDeclararComprobante() {
  return useAccion((p: { orden_id: number; tipo: 'NOTA_ENTREGA' | 'FACTURA' }) =>
    rpc('declarar_comprobante', { p_orden_id: p.orden_id, p_tipo: p.tipo }),
  )
}

export function useIndicarPago() {
  return useAccion(
    (p: {
      orden_id: number
      metodo: string
      moneda: string
      monto: number
      datos: DatosPago
      nota?: string
      /** Si la operación causa IGTF. Sin valor, decide la moneda. */
      igtf?: boolean | null
    }) =>
      rpc<number>('indicar_pago', {
        p_orden_id: p.orden_id,
        p_metodo: p.metodo,
        p_moneda: p.moneda,
        p_monto: p.monto,
        p_datos: p.datos,
        p_nota: p.nota ?? null,
        p_igtf: p.igtf ?? null,
      }),
  )
}

// Registrar el pago vive en tesorería (`useRegistrarPago`): quien lo hace es
// tesorería, y el movimiento que escribe es de su libro, no del de compras.

/**
 * Cambia por dónde se paga una orden que ya está aprobada.
 *
 * Lo pidió la líder: se equivocaron al armar la instrucción, la cuenta no tiene
 * fondos, el proveedor cambió la seña. Hasta ahora la única salida era devolver
 * la instrucción a compras, que retrocede la orden entera y obliga a rehacer un
 * paso que estaba bien.
 *
 * Cambia el método y los datos que lo acompañan; no el monto, no la moneda, no
 * el estado. Y exige el motivo, que es lo único que va a leer quien pague.
 */
export function useCambiarMetodoDePago() {
  return useAccion(
    (p: { instruccion_id: number; metodo: string; datos: DatosPago; motivo: string }) =>
      rpc('cambiar_metodo_de_pago', {
        p_instruccion_id: p.instruccion_id,
        p_metodo: p.metodo,
        p_datos: p.datos,
        p_motivo: p.motivo,
      }),
  )
}

export function useDevolverInstruccion() {
  return useAccion((p: { instruccion_id: number; motivo: string }) =>
    rpc('devolver_instruccion', { p_instruccion_id: p.instruccion_id, p_motivo: p.motivo }),
  )
}

export function useCancelarOrden() {
  return useAccion((p: { orden_id: number; motivo: string }) =>
    rpc('cancelar_orden', { p_orden_id: p.orden_id, p_motivo: p.motivo }),
  )
}

export function useMarcarDesistimiento() {
  return useAccion(
    (p: {
      orden_id: number
      motivo: string
      /**
       * Si el proveedor se llevó de vuelta lo que ya había entregado.
       *
       * Por defecto no: lo recibido llegó de verdad y es de la empresa —contra
       * entrega paga lo que llegue—. Marcarlo saca ese material del inventario
       * con un reverso, no borrando nada.
       */
      material_devuelto?: boolean
    }) =>
      rpc('marcar_desistimiento', {
        p_orden_id: p.orden_id,
        p_motivo: p.motivo,
        p_material_devuelto: p.material_devuelto ?? false,
      }),
  )
}

export function useResolverDesistimiento() {
  return useAccion((p: { orden_id: number; resolucion: string; nota?: string }) =>
    rpc('resolver_desistimiento', {
      p_orden_id: p.orden_id,
      p_resolucion: p.resolucion,
      p_nota: p.nota ?? null,
    }),
  )
}
