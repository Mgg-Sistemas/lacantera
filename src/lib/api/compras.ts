import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'
import { SELECT_MATERIAL, type PagoConMaterial } from './intercambio'

// ---------------------------------------------------------------------------
// Las siete columnas del tablero
//
// El nombre de la columna lo calcula la vista `v_compras_tablero`, no esta
// pantalla: si el tablero decidiera por su cuenta en qué columna va cada
// tarjeta, un informe podría contar distinto que el tablero.
// ---------------------------------------------------------------------------

export type Columna =
  | 'REVISION'
  | 'PEDIDO'
  | 'CONFIRMADA'
  | 'GERENTE'
  | 'APROBADA'
  | 'CREDITO'
  | 'PAGADA'
  | 'CANCELADA'
  | 'DESISTIO'
  | 'RECIBIDA'
  | 'FINALIZADA'

export interface DefinicionColumna {
  clave: Columna
  titulo: string
  /** Lo que hay que hacer para que la tarjeta salga de aquí. */
  accion: string
  tono: 'neutral' | 'info' | 'royal' | 'warning' | 'success' | 'danger'
}

export const COLUMNAS: DefinicionColumna[] = [
  // Fase 2 (06/11/2026): el pedido pasa primero por el almacén general. Lo que
  // el almacén tiene sale por una solicitud de salida; a Compras llega solo lo
  // que falta.
  {
    clave: 'REVISION',
    titulo: 'Revisión de almacén',
    accion: 'El almacén general dice qué tiene',
    tono: 'warning',
  },
  { clave: 'PEDIDO', titulo: 'Pedido', accion: 'Confirmar', tono: 'neutral' },
  { clave: 'CONFIRMADA', titulo: 'Confirmada', accion: 'Indicar proveedores', tono: 'info' },
  // Angélica, 06/11/2026: «que diga órdenes pendientes por aprobar, sin el
  // título de gerente general». La clave sigue siendo GERENTE: la calcula la
  // vista y cambiarla no cambia nada de lo que ve nadie.
  {
    clave: 'GERENTE',
    titulo: 'Órdenes pendientes por aprobar',
    accion: 'Aprobar y decidir si se paga',
    tono: 'royal',
  },
  { clave: 'APROBADA', titulo: 'Aprobada', accion: 'Decidir el pago', tono: 'warning' },
  // Fase 3: a crédito no se pregunta «¿Se pagará?» al aprobar. El material se
  // recibe cuando llegue y la orden se paga al vencer.
  {
    clave: 'CREDITO',
    titulo: 'Cuenta abierta',
    accion: 'Recibir y pagar al vencer',
    tono: 'info',
  },
  { clave: 'PAGADA', titulo: 'Pagada', accion: 'Falta que llegue el material', tono: 'success' },
  // La compra termina aquí, pero se queda a la vista: si desapareciera al
  // recibirse, no habría dónde comprobar que llegó.
  { clave: 'RECIBIDA', titulo: 'Recibida', accion: 'Marcar finalizada', tono: 'info' },
  // Cerrada: o la atendió entera el almacén general (fase 2), o llegó todo lo
  // comprado y Compras la marcó finalizada (fase 4).
  {
    clave: 'FINALIZADA',
    titulo: 'Finalizada',
    accion: 'Cerrada',
    tono: 'success',
  },
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
  /** Orden a crédito: hasta cuándo hay para pagarla. */
  credito_vence?: string | null
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

/*
  EL HISTÓRICO DE COMPRAS.

  Angélica, 06/11/2026: todo lo que había en compras pasa a un histórico, «como
  finalizó, sin sumar stock», para dejar el tablero vacío para el flujo nuevo.

  Es la misma tarjeta del tablero —sale de la misma vista base,
  `v_compras_todas`— con tres datos más: cuándo se cerró, en qué columna estaba
  y por qué. Se lee como FINALIZADA, pero `columna` y `estado_orden` siguen
  diciendo la verdad de lo que pasó: una pagada que no llegó no se disfraza de
  recibida.

  En la base, lo del histórico ya no se mueve (`trg_historico_no_se_mueve`).
*/
export interface TarjetaHistorico extends Tarjeta {
  historico_en: string
  /** La columna del tablero en la que estaba al pasar al histórico. */
  historico_columna: Columna | null
  historico_nota: string | null
}

export function useHistoricoCompras() {
  return useQuery({
    queryKey: ['compras', 'historico'],
    queryFn: async () =>
      desenvolver<TarjetaHistorico[]>(
        await supabase
          .from('v_compras_historico')
          .select('*')
          .order('creada_en', { ascending: false }),
      ),
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
  /** Cómo lo pidió quien lo pidió («Botas»), si Compras le dio después el nombre del inventario. */
  descripcion_pedida: string | null
}

/**
 * Lo que el almacén general entregó de un renglón del pedido. El renglón
 * entregado entero sale del pedido; esto es lo que queda de él.
 */
export interface AtendidoAlmacen {
  id: number
  renglon_id: number | null
  linea: number | null
  descripcion: string
  unidad: string | null
  cantidad_pedida: string
  cantidad_entregada: string
  articulo_id: number
  almacen_id: number
  salida_numero: string | null
  creado_en: string
  /** La solicitud de salida se rechazó o canceló: no salió y volvió a Compras. */
  sin_salida_en?: string | null
  sin_salida_por?: string | null
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
  /**
   * Cómo se le paga al proveedor si se aprueba esta cotización.
   *
   * Lo dice Compras al proponerla (flujo nuevo, 06/11/2026): el pago se conoce
   * antes de aprobar, y quien aprueba decide si se paga ya. Nulo en las
   * cotizaciones que todavía no se han propuesto.
   */
  pago_metodo?: string | null
  pago_moneda?: string | null
  pago_datos?: DatosPago | null
  pago_igtf?: boolean | null
  pago_comprobante?: 'NOTA_ENTREGA' | 'FACTURA' | null
  pago_nota?: string | null
  /** Cuándo Compras dijo el pago. La aprobación lo devuelve: solo se aprueba el pago que se vio. */
  pago_indicado_en?: string | null
  proveedor: { id: number; nombre: string; rif: string; condicion_pago: string } | null
  renglones: RenglonCotizacion[]
}

export interface InstruccionPago {
  id: number
  /** Un código de `metodos_pago`: también INTERCAMBIO (material) y SALDO_A_FAVOR. */
  metodo: string
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
  /** Solo en los pagos con material (INTERCAMBIO): qué, cuánto y su salida. */
  material?: PagoConMaterial | null
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
  /** La marca y la forma en que viene, cuando la cotización las dijo. */
  marca?: string | null
  presentacion?: string | null
  /** Por qué este renglón está como está. Lo escribe corregir el precio. */
  motivo?: string | null
}

/** Lo que devuelve corregir un precio: el antes y el después, para poder decirlo. */
export interface PrecioCorregido {
  orden: string
  renglon: string
  precio_antes: number
  precio_ahora: number
  total_antes: number
  total_ahora: number
  moneda: string
}

/**
 * Corregir un precio mal tecleado sin rehacer la orden entera.
 *
 * Christopher: «¿si el usuario se equivoca desde la orden de compra y el precio
 * es errado, entonces se debe reversar todo desde cero y volver a iniciar la
 * orden desde cero?». Hasta hoy, en una orden que salió de un pedido con
 * cotizaciones: sí. Solo quedaba cancelarla.
 *
 * La base corrige también el renglón de la cotización de la que salió el
 * precio, porque es de ahí de donde se copia al aprobar, y recalcula las dos.
 * Se para si ese renglón ya recibió algo, si hay pagos indicados o si está la
 * factura del proveedor: pasada cualquiera de las tres, hay que anular.
 */
export function useCorregirPrecioDeOrden() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (c: { orden_id: number; renglon_id: number; precio: number; motivo: string }) =>
      rpc<PrecioCorregido>('corregir_precio_de_orden', {
        p_orden_id: c.orden_id,
        p_renglon_id: c.renglon_id,
        p_precio: c.precio,
        p_motivo: c.motivo,
      }),
    /*
      `['compras']` es la clave de la casa, y es la que existe.

      El detalle vive en ['compras','detalle',id], el tablero en
      ['compras','tablero'] y la bitacora en ['compras','bitacora',...]. Las tres
      claves que ponia antes —['orden'], ['ordenes'], ['cotizaciones']— no las
      usa ninguna consulta del repositorio: eran tres invalidaciones que no
      invalidaban nada, y la pantalla se quedaba con el precio viejo hasta
      recargar.
    */
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['compras'] }),
  })
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
  /** Por qué quien aprueba dijo que no se pagará todavía. Se borra al pagarla. */
  /** Orden a crédito: hasta cuándo hay para pagarla (aprobación + días). */
  credito_vence?: string | null
  no_pago_motivo?: string | null
  no_pago_en?: string | null
  /** Quién la marcó pagada en Compras. Tesorería no se vincula. */
  pagada_en_compras_por?: string | null
  aprobada_gg_por?: string | null
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
  solicitud: {
    destino: string | null
    destino_almacen_id: number | null
    historico_en?: string | null
    /** Compra directa: entra donde diga. Las demás se reciben en ALM-GEN (fase 4). */
    directa?: boolean
    /** Para el WhatsApp de la recepción y para ir a la compra. */
    id?: number
    numero?: string
    titulo?: string
    prioridad?: 'NORMAL' | 'ALTA' | 'URGENTE'
  } | null
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
/*
  `!inner` en la solicitud para poder filtrar por ella: lo que está en el
  Histórico de compras no se espera, se cerró. Si apareciera aquí, alguien
  intentaría recibirlo y la base le diría que no.
*/
const SELECT_ORDEN = `
  *,
  proveedor:proveedores(id, nombre, rif, metodo_pago_preferido),
  solicitud:solicitudes_pedido!inner(id, numero, titulo, prioridad, destino, destino_almacen_id, historico_en, directa),
  renglones:orden_renglones(*),
  instrucciones:instrucciones_pago(*)
`

/*
  EL HISTORIAL DE LAS COMPRAS DIRECTAS.

  «Nos solicitan permitir visualizar un historial o vista que permita revisar el
  estatus de las órdenes por compra directa» —el usuario, 24/09/2026—.

  Hasta ahora la pantalla de compra directa solo REGISTRABA: no había dónde
  repasar lo registrado. Cuarenta y cinco compras por unos 8.700 dólares y
  ninguna lista donde verlas.

  Se reconoce por la solicitud que la originó: `solicitudes_pedido.directa`. No
  hay marca en la orden y no hacía falta ponerla — la relación ya existe, y
  añadir una segunda forma de saber lo mismo es añadir un sitio donde puedan
  discrepar.

  El filtro va en la BASE y no aquí: `!inner` obliga a que la solicitud exista y
  sea directa, así que lo que llega ya son solo las directas. Filtrar después
  traería las cien más recientes de todas y dejaría diez en la lista.
*/
export function useComprasDirectas() {
  return useQuery({
    queryKey: ['compras', 'directas'],
    queryFn: async () =>
      desenvolver<Orden[]>(
        await supabase
          .from('ordenes_compra')
          /*
            El mismo select de siempre pero con `!inner` en la solicitud: se
            escribe entero y no con un `replace` sobre la constante porque
            Supabase infiere el tipo de la CADENA LITERAL. Con una cadena
            calculada pierde el tipo y devuelve `GenericStringError[]`.
          */
          .select(
            `
              *,
              proveedor:proveedores(id, nombre, rif, metodo_pago_preferido),
              solicitud:solicitudes_pedido!inner(destino, destino_almacen_id, directa, historico_en),
              renglones:orden_renglones(*),
              instrucciones:instrucciones_pago(*)
            `,
          )
          .eq('solicitud.directa', true)
          // Las que pasaron al Histórico de compras se ven allí, cerradas.
          .is('solicitud.historico_en', null)
          // Lo último arriba: quien viene a repasar busca lo de esta semana, no
          // lo de septiembre pasado.
          .order('creada_en', { ascending: false })
          .limit(300),
      ),
  })
}

export function useOrdenesPorRecibir() {
  return useQuery({
    queryKey: ['compras', 'por-recibir'],
    queryFn: async () => {
      const ordenes = desenvolver<Orden[]>(
        await supabase
          .from('ordenes_compra')
          .select(SELECT_ORDEN)
          // Lo pagado y lo parcial es lo que de verdad está por llegar. Una
          // orden que sigue en tesorería no salió del banco todavía, y el
          // proveedor no despacha lo que no le han pagado.
          // A crédito (fase 3) se recibe sin haber pagado: entra también lo
          // que sigue en cuenta abierta.
          .or(
            'estado.in.(PAGADA_POR_RECIBIR,RECIBIDA_PARCIAL,POR_RECIBIR),' +
              'and(condicion_pago.in.(CREDITO_15,CREDITO_30,CREDITO_60),estado.in.(POR_INDICAR_PAGO,EN_TESORERIA))',
          )
          .is('solicitud.historico_en', null)
          .order('fecha_pago', { ascending: true, nullsFirst: false }),
      )
      // La de crédito que ya llegó entera y solo falta pagar no está por recibir.
      return ordenes.filter((o) =>
        (o.renglones ?? []).some((r) => Number(r.cantidad) - Number(r.cantidad_recibida) > 0.0001),
      )
    },
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
  /**
   * Si quien pidió y quien aprobó eligieron poner su firma digital en la orden
   * de compra. Nula en la de quien pide: no se preguntó, y va sin ella. Nula en
   * la de quien aprueba: se aprobó antes de preguntarlo, y va con ella.
   */
  firma_de_quien_pide: boolean | null
  firma_de_quien_aprueba: boolean | null
  motivo_cancelacion: string | null
  /**
   * Cuándo pasó al Histórico de compras. Con valor, la compra está cerrada como
   * FINALIZADA: la pantalla no ofrece acciones y la base las rechaza.
   */
  historico_en?: string | null
  historico_columna?: string | null
  historico_nota?: string | null
  /** La revisión del almacén general (fase 2): quién, cuándo y con qué salida. */
  revisada_almacen_por?: string | null
  revisada_almacen_en?: string | null
  revision_almacen_nota?: string | null
  salida_almacen_numero?: string | null
  finalizada_en?: string | null
  /** Quién la marcó finalizada (fase 4); nulo si la cerró el almacén. */
  finalizada_por?: string | null
  finalizada_nota?: string | null
  /** Lo que entregó el almacén general, renglón por renglón. */
  atendido?: AtendidoAlmacen[]
  renglones: RenglonPedido[]
  cotizaciones: Cotizacion[]
  ordenes: Orden[]
}

const SELECT_DETALLE = `
  *,
  renglones:solicitud_renglones(*),
  atendido:solicitud_atendido_almacen(*),
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
    instrucciones:instrucciones_pago(*, ${SELECT_MATERIAL})
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
  /** Solo al corregir un renglón que Compras ya nombró: cómo se pidió. */
  descripcion_pedida?: string | null
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
      /** Quien pide y carga su propio pedido: si su firma va en «Solicitado por». */
      con_firma?: boolean
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
        p_con_firma: p.con_firma === true,
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
      /**
       * Nulo cuando no se preguntó —quien corrige no es quien pide—: la base
       * deja lo que había, salvo que cambie quien pide.
       */
      con_firma?: boolean | null
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
        p_con_firma: p.con_firma ?? null,
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
 * NO RECIBE. Se intentó y no puede: `registrar_recepcion` exige que la orden
 * tenga colgada una factura o una nota de entrega antes de dejar entrar nada, y
 * en ese momento la orden acaba de nacer y todavía no tiene papeles. La guarda
 * es correcta y no se saltó — lo que cambia es el orden.
 *
 * La pantalla hace los tres pasos: crea la compra, cuelga la factura, y
 * entonces recibe. Por eso «entra al almacén ahora» exige la factura, que en
 * una compra directa es justo lo que la persona tiene en la mano.
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
      /** Pide y autoriza la misma persona: su firma va en las dos rayas o en ninguna. */
      con_firma?: boolean
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
        p_con_firma: c.con_firma === true,
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

/** Lo que devuelve editar una orden: si tuvo que volver a la gerencia y por cuánto. */
export interface OrdenEditada {
  orden_id: number
  solicitud_id: number
  vuelve_a_gerencia: boolean
  total_usd_antes: string
  total_usd_despues: string
}

/**
 * Editar una orden de compra entera: proveedor, renglones, cantidades, precios.
 *
 * Angélica, 21/09/2026: se edita aunque la gerencia ya la haya aprobado. Lo que
 * no se edita es lo que ya entró al almacén o ya tiene pagos indicados: eso se
 * anula. Y si la edición la encarece en más de 100 $, la orden se cancela y el
 * pedido vuelve a la gerencia, que aprueba de nuevo y emite otra orden.
 *
 * El inventario se sincroniza solo: la recepción lee los renglones de la orden,
 * así que corregirlos antes de que llegue el material es lo que hace que el
 * almacén reciba lo corregido.
 */
export function useEditarOrdenDeCompra() {
  return useAccion(
    (c: {
      orden_id: number
      proveedor_id: number
      moneda: string
      renglones: RenglonComprado[]
      motivo: string
      titulo?: string | null
      justificacion?: string | null
      numero_factura?: string | null
      condicion_pago?: string | null
      alicuota_iva?: number | null
      descuento?: number | null
      flete?: number | null
      observacion?: string | null
    }) =>
      rpc<OrdenEditada>('editar_orden_de_compra', {
        p_orden_id: c.orden_id,
        p_proveedor_id: c.proveedor_id,
        p_moneda: c.moneda,
        p_renglones: c.renglones,
        p_motivo: c.motivo,
        p_titulo: c.titulo || null,
        p_justificacion: c.justificacion || null,
        p_numero_factura: c.numero_factura || null,
        p_condicion_pago: c.condicion_pago || null,
        p_alicuota_iva: c.alicuota_iva ?? null,
        p_descuento: c.descuento ?? null,
        p_flete: c.flete ?? null,
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

/**
 * La revisión del almacén general. Lo que entrega sale por una solicitud de
 * salida de ALM-GEN (devuelve su número). Si entrega todo, la compra queda
 * Finalizada; si no, a Compras pasa solo lo que falta.
 */
export function useRevisarEnAlmacen() {
  return useAccion(
    (p: {
      id: number
      renglones: { renglon_id: number; articulo_id: number | null; cantidad: number }[]
      empleado_id: number | null
      nota?: string | null
    }) =>
      rpc<string | null>('revisar_pedido_en_almacen', {
        p_id: p.id,
        p_renglones: p.renglones,
        p_empleado_id: p.empleado_id,
        p_nota: p.nota || null,
      }),
  )
}

/**
 * Compras le da al renglón su nombre en el inventario: el artículo que ya
 * existe, o el que acaba de crear con el nombre del pedido o con otro. El
 * renglón toma el nombre y la unidad del artículo; cómo se pidió queda en
 * `descripcion_pedida`.
 */
export function useVincularRenglon() {
  return useAccion((p: { renglon_id: number; articulo_id: number }) =>
    rpc('vincular_renglon_al_inventario', {
      p_renglon_id: p.renglon_id,
      p_articulo_id: p.articulo_id,
    }),
  )
}

/** Fase 4: con la orden recibida completa, Compras cierra la compra. */
export function useFinalizarCompra() {
  return useAccion((p: { id: number; nota?: string | null }) =>
    rpc('finalizar_compra', { p_id: p.id, p_nota: p.nota || null }),
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
  return useAccion(
    (p: {
      solicitud_id: number
      cotizacion_id?: number | null
      nota?: string
      /** Si la firma de quien aprueba va en «Autorizado por». */
      con_firma: boolean
    }) =>
      rpc<number>('aprobar_compra', {
        p_solicitud_id: p.solicitud_id,
        p_cotizacion_id: p.cotizacion_id ?? null,
        p_nota: p.nota ?? null,
        p_con_firma: p.con_firma,
      }),
  )
}

/*
  FLUJO NUEVO (06/11/2026): EL PAGO SE DICE AL PROPONER, Y AL APROBAR SE DECIDE
  SI SE PAGA.

  Las órdenes las aprueba solo quien está en `compras_aprobadores` —hoy,
  Norbelis—. La base lo exige al nacer la orden; esto es para que la pantalla
  sepa si enseña los botones.
*/
export function useSoyAprobador() {
  return useQuery({
    queryKey: ['compras', 'soy-aprobador'],
    queryFn: () => rpc<boolean>('soy_aprobador_de_compras'),
    staleTime: 5 * 60_000,
  })
}

/** Quiénes aprueban, para decirlo en pantalla: «La aprueba NORBELIS SEQUEA». */
export function useAprobadores() {
  return useQuery({
    queryKey: ['compras', 'aprobadores'],
    queryFn: async () =>
      desenvolver<{ usuario_id: string }[]>(
        await supabase.from('compras_aprobadores').select('usuario_id'),
      ),
    staleTime: 5 * 60_000,
  })
}

/** Proponer una cotización con el pago ya dicho: método, moneda, datos y si entrega factura o nota. */
export function useProponerConPago() {
  return useAccion(
    (p: {
      solicitud_id: number
      cotizacion_id: number
      metodo: string
      moneda: string
      datos: DatosPago
      comprobante: 'NOTA_ENTREGA' | 'FACTURA'
      igtf?: boolean | null
      nota?: string | null
    }) =>
      rpc('proponer_cotizacion_con_pago', {
        p_solicitud_id: p.solicitud_id,
        p_cotizacion_id: p.cotizacion_id,
        p_metodo: p.metodo,
        p_moneda: p.moneda,
        p_datos: p.datos,
        p_comprobante: p.comprobante,
        p_igtf: p.igtf ?? null,
        p_nota: p.nota || null,
      }),
  )
}

/**
 * Aprobar y contestar «¿Se pagará?» en un solo paso.
 *
 * Sí → la orden queda pagada en Compras (sin cuenta ni movimiento de
 * Tesorería). No → queda aprobada y por pagar, con el motivo. Contra entrega y
 * pago con productos no preguntan: la base ignora `se_paga` en esos casos.
 */
export function useAprobarOrden() {
  return useAccion(
    (p: {
      solicitud_id: number
      cotizacion_id?: number | null
      con_firma: boolean
      nota?: string | null
      se_paga: boolean | null
      motivo?: string | null
      referencia?: string | null
      /** El `pago_indicado_en` de la propuesta que se vio; la base rechaza si cambió. */
      pago_visto: string | null
    }) =>
      rpc<number>('aprobar_orden_de_compra', {
        p_solicitud_id: p.solicitud_id,
        p_cotizacion_id: p.cotizacion_id ?? null,
        p_con_firma: p.con_firma,
        p_nota: p.nota || null,
        p_se_paga: p.se_paga,
        p_motivo: p.motivo || null,
        p_referencia: p.referencia || null,
        p_pago_visto: p.pago_visto,
      }),
  )
}

/** Decidir el pago de una orden ya aprobada: marcarla pagada, o decir por qué todavía no. */
export function useDecidirPago() {
  return useAccion(
    (p: { orden_id: number; se_paga: boolean; motivo?: string | null; referencia?: string | null }) =>
      rpc('decidir_pago_de_orden', {
        p_orden_id: p.orden_id,
        p_se_paga: p.se_paga,
        p_motivo: p.motivo || null,
        p_referencia: p.referencia || null,
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
