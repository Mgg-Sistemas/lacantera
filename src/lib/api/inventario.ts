import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'
import type { HechoDeFicha } from '@/components/Historial'

// ---------------------------------------------------------------------------
// Almacenes
// ---------------------------------------------------------------------------

export interface Almacen {
  id: number
  codigo: string
  nombre: string
  tipo: string
  ubicacion: string | null
  recibe_compras: boolean
  activo: boolean
  /**
   * Aqui puede entrar material que esta empresa no pago.
   *
   * El costo promedio se lleva por pareja (almacen, articulo), asi que un sitio
   * marcado con esto lleva el suyo aparte del resto — que es justamente de lo
   * que se trata. Hoy solo lo tiene el tanque del combustible inicial.
   */
  admite_sin_costo?: boolean
  /** Cuanto le cabe. Solo en un tanque de combustible. */
  capacidad?: string | null
  /** Cuantas ordenes aguanta a la vez. Solo en un taller. */
  trabajos_a_la_vez?: number | null
}

export const TIPOS_ALMACEN = [
  { valor: 'ALMACEN', etiqueta: 'Almacén' },
  { valor: 'PATIO', etiqueta: 'Patio de material' },
  { valor: 'TALLER', etiqueta: 'Taller' },
  { valor: 'COMBUSTIBLE', etiqueta: 'Combustible' },
  { valor: 'TRANSITO', etiqueta: 'En tránsito' },
]

export function useAlmacenes(soloActivos = true) {
  return useQuery({
    queryKey: ['almacenes', soloActivos],
    queryFn: async () => {
      let q = supabase.from('almacenes').select('*').order('nombre')
      if (soloActivos) q = q.eq('activo', true)
      return desenvolver<Almacen[]>(await q)
    },
    staleTime: 5 * 60_000,
  })
}

export function useGuardarAlmacen() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: Partial<Almacen> & { codigo: string; nombre: string; tipo: string }) =>
      rpc<number>('guardar_almacen', {
        p_id: a.id ?? null,
        p_codigo: a.codigo,
        p_nombre: a.nombre,
        p_tipo: a.tipo,
        p_ubicacion: a.ubicacion ?? null,
        p_recibe_compras: a.recibe_compras ?? false,
        p_activo: a.activo ?? true,
        // Solo significan algo en su tipo: la capacidad en un tanque y los
        // trabajos a la vez en un taller. La base rechaza lo demas.
        p_capacidad: a.capacidad ?? null,
        p_trabajos_a_la_vez: a.trabajos_a_la_vez ?? null,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['almacenes'] }),
  })
}

// ---------------------------------------------------------------------------
// Existencias
// ---------------------------------------------------------------------------

export interface Existencia {
  almacen_id: number
  almacen_codigo: string
  almacen: string
  articulo_id: number
  articulo_codigo: string
  articulo: string
  categoria: string
  unidad: string
  stock_minimo: string
  existencia: string
  /** De la existencia, cuánto está en manos de alguien y no se puede entregar. */
  prestadas: string
  /** Lo que se puede entregar hoy: existencia menos lo prestado. */
  disponibles: string
  valor_usd: string
  costo_promedio_usd: string | null
  ultimo_movimiento: string | null
}

export function useExistencias(almacenId?: number, activa = true) {
  return useQuery({
    queryKey: ['existencias', almacenId ?? 'todos'],
    queryFn: async () => {
      let q = supabase.from('v_existencias').select('*').order('articulo')
      if (almacenId) q = q.eq('almacen_id', almacenId)
      return desenvolver<Existencia[]>(await q)
    },
    enabled: activa,
  })
}

/**
 * El inventario de la empresa entero, sin partir por almacén.
 *
 * POR QUÉ NO SE SUMA EN LA PANTALLA
 *
 * La existencia sí se podría sumar aquí. El costo promedio no: promediar los
 * promedios de cada almacén da un número que no es el costo de nada. La vista
 * lo recalcula sobre el libro completo, que es la única forma de que cuadre.
 */
export interface ExistenciaTotal {
  articulo_id: number
  articulo_codigo: string
  articulo: string
  categoria: string
  unidad: string
  stock_minimo: string
  densidad_ton_m3: string | null
  existencia: string
  prestadas: string
  disponibles: string
  modo_entrega: string
  /** La misma existencia en la otra medida. Nula si nadie midió la densidad. */
  existencia_equivalente: string | null
  unidad_equivalente: string | null
  valor_usd: string
  costo_promedio_usd: string | null
  /** En cuántos almacenes o talleres ha pasado por el libro. */
  almacenes: number
  ultimo_movimiento: string | null
}

export function useExistenciasTotales(activa = true) {
  return useQuery({
    queryKey: ['existencias-totales'],
    queryFn: async () =>
      desenvolver<ExistenciaTotal[]>(
        await supabase.from('v_existencias_totales').select('*').order('articulo'),
      ),
    enabled: activa,
  })
}

/**
 * Dónde está repartido un artículo.
 *
 * Es el escalón que faltaba entre el total de la empresa y un almacén
 * concreto: ver que hay 400 sacos no dice en cuál de los cuatro sitios
 * buscarlos.
 */
export function useExistenciasDeArticulo(articuloId: number | null) {
  return useQuery({
    queryKey: ['existencias-articulo', articuloId],
    queryFn: async () =>
      desenvolver<Existencia[]>(
        await supabase
          .from('v_existencias')
          .select('*')
          .eq('articulo_id', articuloId!)
          .order('almacen'),
      ),
    enabled: articuloId !== null,
  })
}

// ---------------------------------------------------------------------------
// Movimientos
// ---------------------------------------------------------------------------

export interface Movimiento {
  id: number
  numero: string
  fecha: string
  tipo: string
  signo: number
  almacen_id: number
  articulo_id: number
  cantidad: string
  unidad: string
  costo_usd: string
  valor_usd: string
  orden_id: number | null
  nota: string | null
  /** El papel que respalda esta salida. Varios renglones de la misma nota lo comparten. */
  nota_salida: string | null
  registrado_por: string | null
  registrado_en: string
  almacen: { nombre: string } | null
  articulo: { codigo: string; nombre: string } | null
  /** La compra de la que vino, si vino de una. La marca `directa` cuelga de la solicitud. */
  orden: { numero: string; solicitud: { directa: boolean } | null } | null
  /**
   * Cuántas veces se salió el costo del promedio que el artículo ya tenía,
   * cuando alguien vio el aviso y lo guardó igual. Nulo es lo normal.
   */
  aviso_costo: string | null
  /**
   * Lo que la persona contó, al lado de lo que el sistema opera.
   *
   * «7 TAMBOR + 10 L» junto a «1.466 L». Quien contó siete tambores no
   * reconoce 1.466 al releerlo dentro de un mes, y entonces no puede cuadrar el
   * movimiento contra su hoja de conteo. Nulas cuando se contó directamente en
   * la unidad de operación, que es lo normal.
   *
   * No se derivan una de otra a propósito: `unidades_por_presentacion` se puede
   * editar en el catálogo, y un asiento viejo contaría entonces una mentira
   * nueva. Un movimiento tiene que poder leerse dentro de diez años sin
   * depender de una tabla que cambia.
   */
  cantidad_capturada: string | null
  unidad_capturada: string | null
  suelto_capturado: string | null
}

export const TIPOS_MOVIMIENTO: Record<string, string> = {
  ENTRADA_COMPRA: 'Entrada por compra',
  ENTRADA_PRODUCCION: 'Entrada de producción',
  ENTRADA_DEVOLUCION: 'Devolución',
  /*
    «Entrada directa» se leia como «compra directa» y significan lo contrario:
    esta es la que NO tiene compra detras —un saldo inicial, un traslado de otra
    empresa del grupo, material que ya estaba cuando llego el sistema— mientras
    que una compra directa SI es una compra, con su orden y su factura, y entra
    como ENTRADA_COMPRA. Lo pregunto Christopher el 7/09/2026, y si lo pregunta
    quien conoce el sistema, quien lo usa ya se lo habia preguntado.
  */
  ENTRADA_DIRECTA: 'Entrada sin compra',
  SALIDA_CONSUMO: 'Salida a consumo',
  SALIDA_DESPACHO: 'Salida por despacho',
  SALIDA_MERMA: 'Merma',
  SALIDA_BAJA: 'Baja',
  AJUSTE_COSTO: 'Corrección de costo',
  AJUSTE_POSITIVO: 'Ajuste por conteo (sobrante)',
  AJUSTE_NEGATIVO: 'Ajuste por conteo (faltante)',
  TRANSFERENCIA_SALIDA: 'Traslado, salida',
  TRANSFERENCIA_ENTRADA: 'Traslado, entrada',
  REVERSO: 'Reverso',
}

export function useMovimientos(
  filtros: { almacenId?: number; articuloId?: number; desde?: string; hasta?: string } = {},
) {
  return useQuery({
    queryKey: ['movimientos', filtros],
    queryFn: async () => {
      let q = supabase
        .from('inventario_movimientos')
        /*
          La orden viaja con el movimiento para poder decir DE QUE compra vino.
          Sin eso las dos se ven igual en la lista, y son distintas: una orden
          normal se aprueba antes de comprar y la directa se registra con la
          factura ya en la mano.

          `directa` NO esta en `ordenes_compra` —se comprobo ejecutando, la
          primera version de esto reventaba con «column ordenes_compra_1.directa
          does not exist»—. Vive en la solicitud que origino la orden, asi que
          hay que saltar dos veces: movimiento -> orden -> solicitud.
        */
        .select(
          '*, almacen:almacenes(nombre), articulo:articulos(codigo, nombre), orden:ordenes_compra(numero, solicitud:solicitudes_pedido(directa))',
        )
        .order('registrado_en', { ascending: false })
        .limit(200)

      if (filtros.almacenId) q = q.eq('almacen_id', filtros.almacenId)
      if (filtros.articuloId) q = q.eq('articulo_id', filtros.articuloId)

      /*
        Se filtra por `fecha`, no por `registrado_en`.

        Son distintas a propósito: una entrada del sábado se puede registrar el
        lunes, y quien pregunta «qué se movió el sábado» pregunta por el día en
        que pasó, no por el día en que alguien lo escribió. `registrado_en`
        sigue mandando en el orden de la lista, que ahí sí importa el momento
        exacto para desempatar dos movimientos del mismo día.
      */
      if (filtros.desde) q = q.gte('fecha', filtros.desde)
      if (filtros.hasta) q = q.lte('fecha', filtros.hasta)

      return desenvolver<Movimiento[]>(await q)
    },
  })
}

/**
 * Toda escritura de inventario invalida existencias, movimientos, el tablero
 * de compras y los avisos: una recepción cierra una orden y emite una
 * notificación, así que refrescar solo el inventario dejaría el resto de la
 * pantalla contando otra cosa.
 */
function useAccionInventario<A>(fn: (args: A) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['existencias'] })
      void qc.invalidateQueries({ queryKey: ['movimientos'] })
      void qc.invalidateQueries({ queryKey: ['compras'] })
      void qc.invalidateQueries({ queryKey: ['notificaciones'] })
    },
  })
}

/** El parte que da la base antes de corregir un costo. Lo devuelve entero. */
export interface ImpactoDeCosto {
  articulo: string
  unidad: string
  existencia: number
  costo_actual: number
  valor_actual: number
  costo_correcto: number
  valor_corregido: number
  ajuste: number
  /** Lo que ya salió del almacén cargado al costo equivocado. */
  ya_salio: number
  ya_salio_cargado_a: number
  ya_salio_deberia_ser: number
  /**
   * Lo que no se recupera: eso ya se le cargó a una máquina o a un centro de
   * costo, y corregir hoy no reprecia lo que salió ayer.
   *
   * La base lo devuelve a propósito, y por eso la pantalla lo enseña: esconder
   * la parte incómoda sería peor que no tener la herramienta.
   */
  no_se_recupera: number
}

/**
 * Qué pasaría si se corrige el costo. Solo lee.
 *
 * Va antes de la corrección y no después: «los sistemas deben ser similar a un
 * runbook, o pasos secuenciales» —Christopher, 7/09/2026—. Quien va a mover
 * medio millón de dólares de valoración tiene que ver el número antes.
 */
export function useImpactoDeCorregirCosto(
  almacenId: number | null,
  articuloId: number | null,
  costo: number,
) {
  return useQuery({
    queryKey: ['impacto-costo', almacenId, articuloId, costo],
    enabled: !!almacenId && !!articuloId && Number.isFinite(costo) && costo >= 0,
    queryFn: () =>
      rpc<ImpactoDeCosto>('impacto_de_corregir_costo', {
        p_almacen_id: almacenId,
        p_articulo_id: articuloId,
        p_costo_correcto: costo,
      }),
  })
}

/**
 * Corregir el costo promedio de un artículo en un almacén.
 *
 * NO EDITA NADA: el libro es inmutable a propósito. Escribe un par de
 * movimientos —sale todo al costo equivocado, vuelve a entrar todo al
 * correcto—, así que la existencia no cambia y los dos renglones quedan a la
 * vista en el historial. Una corrección de esta magnitud tiene que verse.
 *
 * Exige `INVENTARIO.AJUSTAR_COSTO`, que el rol ALMACEN NO tiene y es
 * deliberado: «almacén no tiene interés sobre el precio o valor de las cosas,
 * pero sí en que sus ítems estén rigurosamente contados» —Christopher—. Esto no
 * cambia ni una unidad contada; cambia dinero. Y avisa a ADMIN y a
 * GERENTE_GENERAL, porque el valor del inventario sale en informes de gerencia.
 */
export function useCorregirCosto() {
  return useAccionInventario(
    (c: {
      almacen_id: number
      articulo_id: number
      costo_correcto: number
      motivo: string
      fecha?: string
    }) =>
      rpc<number>('corregir_costo', {
        p_almacen_id: c.almacen_id,
        p_articulo_id: c.articulo_id,
        p_costo_correcto: c.costo_correcto,
        p_motivo: c.motivo,
        p_fecha: c.fecha ?? null,
      }),
  )
}

export interface RenglonRecibido {
  orden_renglon_id: number
  cantidad: number
  /**
   * Alguien vio que el precio de la orden se sale de lo que el artículo viene
   * costando, y decidió recibirlo igual.
   *
   * `registrar_recepcion` tiene la misma reja que las entradas: el precio del
   * renglón se tecleó en algún momento y de ahí pasa al libro. Sin esta clave
   * la recepción rebota entera —los demás renglones incluidos— con un mensaje
   * que dice «acéptalo», y hasta hoy no había nada que aceptar en la pantalla.
   */
  confirmado?: boolean
}

export function useRegistrarRecepcion() {
  return useAccionInventario(
    (r: {
      orden_id: number
      almacen_id: number
      renglones: RenglonRecibido[]
      nota?: string
      fecha?: string
    }) =>
      rpc<number>('registrar_recepcion', {
        p_orden_id: r.orden_id,
        p_almacen_id: r.almacen_id,
        p_renglones: r.renglones,
        p_nota: r.nota || null,
        p_fecha: r.fecha || null,
      }),
  )
}

/**
 * Recibir de golpe todo lo que falta de una orden.
 *
 * `registrar_recepcion` pide la lista de qué llegó y con qué id de renglón, que
 * es lo correcto para una recepción parcial. Quien acaba de cargar una compra
 * directa no tiene esos ids —los acaba de crear la base— y además no tiene nada
 * que elegir: el material ya está entero.
 *
 * Por debajo llama a la de siempre, así que conserva sus cuatro comprobaciones,
 * incluida la del papel del proveedor.
 */
export function useRecibirOrdenCompleta() {
  return useAccionInventario(
    (r: { orden_id: number; almacen_id: number; nota?: string | null; fecha?: string | null }) =>
      rpc<number>('recibir_orden_completa', {
        p_orden_id: r.orden_id,
        p_almacen_id: r.almacen_id,
        p_nota: r.nota || null,
        p_fecha: r.fecha || null,
      }),
  )
}

/**
 * Meter mercancía sin una compra detrás.
 *
 * El saldo con el que arranca un almacén, algo comprado por fuera, material
 * que trae alguien. Lleva costo propio — al revés que el ajuste de conteo, que
 * hereda el promedio— porque aquí el costo es un dato que se conoce, y sin él
 * el almacén quedaría lleno y valorado en nada.
 *
 * `sin_costo` es la excepción declarada a eso, y no un atajo. Llegó combustible
 * trasladado desde la base principal del grupo, donde ya se registró el gasto:
 * no hay factura porque no hubo compra aquí. Marcándolo, el costo entra en cero
 * y la base exige a cambio una explicación entera de dónde vino y quién asumió
 * el gasto — que dentro de un año es lo único que lo va a contestar.
 */
export function useRegistrarEntrada() {
  return useAccionInventario(
    (e: {
      almacen_id: number
      articulo_id: number
      cantidad: number
      costo_usd: number
      motivo: string
      referencia?: string | null
      fecha?: string
      /** El gasto lo asumió otra empresa del grupo. Obliga a costo cero. */
      sin_costo?: boolean
      /**
       * Alguien vio el aviso de costo raro y decidió guardarlo igual.
       *
       * Esta puerta también tiene la reja de las diez veces. Sin mandar esto,
       * cargar combustible a precio de mercado sobre un promedio subsidiado
       * fallaba con un «acéptalo» que la pantalla no ofrecía cómo aceptar.
       */
      confirmado?: boolean
    }) =>
      rpc<number>('registrar_entrada', {
        p_almacen_id: e.almacen_id,
        p_articulo_id: e.articulo_id,
        p_cantidad: e.cantidad,
        p_costo_usd: e.costo_usd,
        p_motivo: e.motivo,
        p_referencia: e.referencia ?? null,
        p_fecha: e.fecha ?? null,
        p_sin_costo: e.sin_costo ?? false,
        p_confirmado: e.confirmado ?? false,
      }),
  )
}

/** Un renglón de una entrada: qué, cuánto, y cuánto costó en qué moneda. */
export interface RenglonDeEntrada {
  articulo_id: number
  /**
   * Lo suelto, en la unidad de operación.
   *
   * Con `presentaciones` al lado esto son «los diez litros del octavo tambor»;
   * sin ella, la cantidad entera de siempre.
   */
  cantidad: number
  /**
   * Bultos enteros contados: los siete tambores de «7 tambores y 10 L».
   *
   * LA SUMA LA HACE LA BASE, y ése es el punto. `private.en_unidad_base`
   * multiplica por `unidades_por_presentacion` y guarda al lado lo que la
   * persona contó —7, TAMBOR, 10— para que el asiento se pueda cuadrar contra
   * la hoja de conteo dentro de un año. Si el navegador mandara ya la
   * multiplicación hecha, esas tres cifras se perderían y la base volvería a no
   * tener ni idea de que existen los tambores.
   */
  presentaciones?: number | null
  /**
   * En cuál de las presentaciones se contó.
   *
   * SIN ESTO, DOS PRESENTACIONES SON UNA TRAMPA. Un aceite declarado en TAMBOR
   * (208 L) y en BIDON (20 L) recibe «3 bultos» y la base no tiene forma de
   * saber cuáles: coge la de por defecto y deja 624 litros donde había 60.
   *
   * Nulo cuando el artículo solo tiene una forma —ahí la base la resuelve sola,
   * que es lo que hace compatible todo lo anterior a esto.
   */
  presentacion?: string | null
  costo: number
  moneda: string
  /**
   * Alguien vio el aviso de costo raro y decidió guardarlo igual.
   *
   * La base avisa cuando el costo se sale diez veces del promedio que el
   * artículo ya tenía, y no impide: un precio puede multiplicarse por diez de
   * verdad. Lo que no deja es aceptarlo en silencio — el movimiento queda
   * marcado con el factor.
   */
  confirmado?: boolean
}

/** Lo que la base contesta sobre un costo que se está tecleando. */
export interface RevisionDeCosto {
  /**
   * `PRIMERA` no hay promedio contra el que comparar · `DESVIA` se sale diez
   * veces · `NORMAL` nada que decir · `SIN_TASA` no hay tasa de ese día, así
   * que no se puede comparar · `SIN_ARTICULO` no existe o está inactivo.
   */
  estado: 'PRIMERA' | 'DESVIA' | 'NORMAL' | 'SIN_TASA' | 'SIN_ARTICULO'
  hacia?: 'ARRIBA' | 'ABAJO'
  /** Las tres cifras vienen nulas a quien no puede ver la valoración. */
  veces?: number | null
  viene_costando?: number | null
  entra_a?: number | null
}

/**
 * ¿Este costo es el primero de este artículo aquí, o se sale de lo que viene
 * costando?
 *
 * LA PANTALLA NO PUEDE DEDUCIRLO SOLA, y creerlo costó una reja entera. El
 * formulario lo sacaba de `v_existencias.costo_promedio_usd`, que devuelve nulo
 * a quien no tiene INVENTARIO.VER_VALORACION —nivel TOTAL, y ALMACEN tiene
 * ESCRITURA—. Para el almacenista salía nulo siempre, así que la pantalla decía
 * «es la primera vez que entra» en la entrada número treinta, y la casilla que
 * marcaba para poder seguir manda `confirmado`, que en la base vale también
 * para la reja de las diez veces: el aviso del desvío quedaba aceptado sin
 * haberse llegado a enseñar.
 *
 * La vista filtra para MOSTRAR; esta función contesta para DECIDIR. Dice QUE
 * pasa a todo el mundo y CUANTO solo a quien puede ver el dinero, igual que los
 * mensajes de la base.
 *
 * Y como la conversión la hace ella con la tasa del día, el aviso también
 * funciona en bolívares — antes callaba con cualquier moneda que no fuera el
 * dólar, que es justo la moneda de las facturas de aquí.
 */
export function useRevisarCostoDeEntrada(
  almacenId: number | null,
  articuloId: number | null,
  costo: number,
  moneda: string,
) {
  return useQuery({
    queryKey: ['revision-costo', almacenId, articuloId, costo, moneda],
    enabled: !!almacenId && !!articuloId && costo > 0,
    // El costo no cambia solo: lo que conteste para estas cuatro cosas vale
    // mientras el formulario siga abierto.
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      rpc<RevisionDeCosto>('revisar_costo_de_entrada', {
        p_almacen_id: almacenId,
        p_articulo_id: articuloId,
        p_costo: costo,
        p_moneda: moneda,
        p_fecha: null,
      }),
  })
}

/**
 * Meter varias cosas al almacén de una vez, sin compra detrás.
 *
 * Antes era de una en una: cargar el saldo inicial de un almacén con veinte
 * artículos eran veinte formularios, veinte veces eligiendo el mismo sitio.
 *
 * Cada renglón dice en qué moneda costó y la conversión a dólares la hace la
 * base con la tasa del día — aquí no se calcula ninguna tasa, que es la regla
 * de la casa. La unidad tampoco viaja: sale del artículo.
 */
export function useRegistrarEntradas() {
  return useAccionInventario(
    (e: {
      almacen_id: number
      renglones: RenglonDeEntrada[]
      motivo: string
      referencia?: string | null
      fecha?: string
    }) =>
      rpc<number>('registrar_entradas', {
        p_almacen_id: e.almacen_id,
        p_renglones: e.renglones.map((r) => ({
          ...r,
          // Las dos claves solo viajan cuando hay bultos: sin ellas la base
          // cuenta exactamente como siempre, que es lo que hace esto compatible.
          presentaciones: r.presentaciones || undefined,
          presentacion: (r.presentaciones && r.presentacion) || undefined,
        })),
        p_motivo: e.motivo,
        p_referencia: e.referencia ?? null,
        p_fecha: e.fecha ?? null,
      }),
  )
}

export function useRegistrarSalida() {
  return useAccionInventario(
    (s: {
      almacen_id: number
      articulo_id: number
      cantidad: number
      motivo: string
      tipo?: string
      fecha?: string
    }) =>
      rpc<number>('registrar_salida', {
        p_almacen_id: s.almacen_id,
        p_articulo_id: s.articulo_id,
        p_cantidad: s.cantidad,
        p_motivo: s.motivo,
        p_tipo: s.tipo ?? 'SALIDA_CONSUMO',
        p_fecha: s.fecha || null,
      }),
  )
}

/**
 * Sacar varios materiales de una vez, bajo un solo número de nota.
 *
 * Cada renglón puede decir de qué almacén sale. El de arriba es solo el valor
 * por defecto: el aceite está en el almacén general y las varillas en el patio,
 * y obligar a hacer dos salidas para un mismo trabajo parte en dos un papel que
 * es uno solo.
 *
 * Devuelve el número de nota —NS-2026-0001—, que es lo que después permite
 * volver a leerla entera con `leerNotaDeSalida`.
 */
export function useRegistrarSalidas() {
  return useAccionInventario(
    (s: {
      almacen_id: number | null
      renglones: Array<{
        almacen_id: number
        articulo_id: number
        /** Lo suelto. Con `presentaciones` al lado, lo que acompaña a los bultos. */
        cantidad: number
        /** Bultos enteros: la cuenta la hace la base, no el navegador. */
        presentaciones?: number | null
        /** En cuál se contó. Sin esto, dos presentaciones son una trampa. */
        presentacion?: string | null
      }>
      motivo: string
      tipo?: string
      fecha?: string
    }) =>
      rpc<string>('registrar_salidas', {
        p_almacen_id: s.almacen_id,
        p_renglones: s.renglones.map((r) => ({
          almacen_id: String(r.almacen_id),
          articulo_id: String(r.articulo_id),
          cantidad: String(r.cantidad),
          ...(r.presentaciones
            ? {
                presentaciones: String(r.presentaciones),
                ...(r.presentacion ? { presentacion: r.presentacion } : {}),
              }
            : {}),
        })),
        p_motivo: s.motivo,
        p_tipo: s.tipo ?? 'SALIDA_CONSUMO',
        p_fecha: s.fecha || null,
      }),
  )
}

/** Un renglón de una nota de salida, tal como se emitió. */
export interface RenglonDeNota {
  nota: string
  fecha: string
  almacen: string
  tipo: string
  motivo: string | null
  articulo_codigo: string
  articulo: string
  cantidad: string
  unidad: string
  costo_usd: string
  valor_usd: string
  registrado_en: string
  /**
   * Lo que la persona contó, para que el papel lo diga.
   *
   * Quien entregó siete tambores y firma un papel que dice «1.466 L» no puede
   * cotejar lo que firma con lo que sacó del estante. Y ese papel es la única
   * prueba de la entrega: si mañana falta material, es contra él que se compara.
   */
  cantidad_capturada: string | null
  unidad_capturada: string | null
  suelto_capturado: string | null
}

/**
 * Los renglones de una nota, para volver a imprimirla.
 *
 * No es un hook: se llama en el momento en que alguien pide el papel, no al
 * pintar la lista. Doscientos movimientos en pantalla no son doscientas notas
 * que traer por si acaso.
 */
export function leerNotaDeSalida(numero: string) {
  return rpc<RenglonDeNota[]>('nota_de_salida', { p_numero: numero })
}

/*
  DE QUÉ CLASE ES UNA SALIDA, Y ESA LISTA LA LLEVA LA EMPRESA

  Empezó siendo dos opciones escritas aquí —consumo y merma—, y la misma queja
  llegó DOS VECES:

    «Esta lista no da las opciones necesarias o al menos otorga la opción "Otro"
     para especificar por qué sale, es que está el caso en que no se dañó, no se
     perdió, pero es obsoleto por ejemplo»

    «Solo 2 opciones no da apertura necesaria, ¿y si solo lo sacan porque está
     obsoleto? Y si mejor se le añade la opción "Otro" y que especifique»

  La primera vez se contestó con un puente a «Dar de baja», que contablemente es
  correcto y como respuesta es mala: cuando alguien pregunta dos veces lo mismo,
  el problema no es que no se lo hayan explicado.

  Desde el patio, «sacar material» es UNA acción. Que el sistema la parta en dos
  funciones es asunto nuestro. Así que la lista es una y cada opción sabe si va a
  consumo, a merma o a baja —y con qué causa—; la base encamina.

  Y es editable, como pidió la líder para los motivos del vale: «igual debe ser
  editable, no quiero nos llamen a cada rato por cosas así». Es la tercera lista
  que se pasa de CHECK a tabla por el mismo motivo.

  El porcentaje de merma sigue separado del consumo, que era para lo que servía
  distinguir clases: es lo que se vigila para detectar un faltante, y si todo lo
  que se pierde se anota como consumo, la merma da cero para siempre.

  EL DESPACHO NO SE OFRECE, y eso no cambia. Lo escribe una venta cuando sale el
  camión, con su nota de entrega detrás. A mano permitiría restar material «por
  despacho» sin documento, y al facturar la venta el patio quedaría descontado
  dos veces.
*/
export interface ClaseDeSalida {
  codigo: string
  nombre: string
  pista: string | null
  /** A dónde va en el libro. No lo elige quien saca el material. */
  tipo: 'SALIDA_CONSUMO' | 'SALIDA_MERMA' | 'SALIDA_BAJA'
  causa_baja: string | null
  orden: number
  /** Cierto si obliga a explicarse en más de cuatro palabras. */
  exige_detalle: boolean
  activa: boolean
}

export function useClasesDeSalida(incluirApagadas = false) {
  return useQuery({
    queryKey: ['clases-de-salida', incluirApagadas],
    queryFn: () =>
      rpc<ClaseDeSalida[]>('clases_de_salida', { p_incluir_apagadas: incluirApagadas }),
  })
}

function useAccionDeClase<A>(fn: (a: A) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['clases-de-salida'] }),
  })
}

export function useGuardarClaseDeSalida() {
  return useAccionDeClase(
    (c: { codigo?: string | null; nombre: string; pista?: string | null; activa?: boolean }) =>
      rpc<string>('guardar_clase_de_salida', {
        p_codigo: c.codigo ?? null,
        p_nombre: c.nombre,
        p_pista: c.pista ?? null,
        p_activa: c.activa ?? true,
      }),
  )
}

export function useBorrarClaseDeSalida() {
  return useAccionDeClase((codigo: string) =>
    rpc<void>('borrar_clase_de_salida', { p_codigo: codigo }),
  )
}

/*
  LAS CAUSAS POR LAS QUE UN BIEN DEJA DE SERVIR

  La líder: «el inventario registra entradas, pero no registra salidas que no
  necesariamente son ventas (ej. equipo dañado e irreparable, desechado,
  obsoleto, etc.)».

  Ninguna de las tres salidas que había servía. Consumo es haberlo gastado
  trabajando; merma es lo que se pierde en el manejo —y su porcentaje se vigila
  para detectar robo, así que meter ahí un taladro quemado lo dispararía por
  una razón que no tiene nada que ver—; despacho es haberlo vendido.

  No hay «otro» a propósito: con esa opción acaba todo ahí, y en un año nadie
  puede responder cuánto se perdió por obsolescencia.
*/
export const CAUSAS_DE_BAJA: Array<{ valor: string; etiqueta: string; dice: string }> = [
  {
    valor: 'DANADO',
    etiqueta: 'Dañado sin reparación',
    dice: 'Se rompió y no compensa arreglarlo.',
  },
  {
    valor: 'OBSOLETO',
    etiqueta: 'Obsoleto',
    dice: 'Funciona, pero ya no sirve para lo que se hace hoy.',
  },
  {
    valor: 'VENCIDO',
    etiqueta: 'Vencido',
    dice: 'Caducó: químicos, filtros con vida útil, consumibles.',
  },
  {
    valor: 'EXTRAVIADO',
    etiqueta: 'Extraviado',
    dice: 'No aparece y nadie sabe dónde está.',
  },
  {
    valor: 'ROBADO',
    etiqueta: 'Robado',
    dice: 'Falta, y hay motivos para creer que se lo llevaron.',
  },
]

/**
 * Saca del inventario lo que dejó de servir.
 *
 * Pide más explicación que una salida normal —diez caracteres frente a
 * cuatro— porque una baja destruye valor en libros y lo único que quedará para
 * justificarla dentro de un año es esa frase.
 */
export function useRegistrarBaja() {
  return useAccionInventario(
    (b: {
      almacen_id: number
      articulo_id: number
      cantidad: number
      causa: string
      motivo: string
      destino?: string | null
      fecha?: string
    }) =>
      rpc<number>('registrar_baja', {
        p_almacen_id: b.almacen_id,
        p_articulo_id: b.articulo_id,
        p_cantidad: b.cantidad,
        p_causa: b.causa,
        p_motivo: b.motivo,
        p_destino: b.destino || null,
        p_fecha: b.fecha || null,
      }),
  )
}

export function useRegistrarAjuste() {
  return useAccionInventario(
    (a: {
      almacen_id: number
      articulo_id: number
      /** Lo suelto. Con `presentaciones` al lado, lo que acompaña a los bultos. */
      contado: number
      /**
       * Bultos enteros contados.
       *
       * Contar un almacén es JUSTO lo que se hace en bultos: nadie recorre las
       * estanterías anotando «1.466 litros», anota siete tambores llenos y uno
       * empezado. La suma la hace la base, y guarda al lado lo que la persona
       * contó para que el movimiento se pueda cuadrar contra su hoja.
       */
      presentaciones?: number | null
      /** En cuál se contó. Contar un almacén es justo donde más importa. */
      presentacion?: string | null
      /*
        LA HOJA DE CONTEO, cuando en el estante hay de varios tipos.

        «1 tambor y 20 pailas» no cabe en un solo envase, y era el caso real del
        ACEITE HIDRAULICO 68. La base suma cada línea, guarda el total en el
        libro y anota la hoja aparte, en `conteo_envases`: es el único momento
        en que alguien sabe de verdad cuántos envases hay, porque los tiene
        delante.
      */
      envases?: { presentacion: string; cantidad: number }[] | null
      motivo: string
      fecha?: string
    }) =>
      rpc<number>('registrar_ajuste', {
        p_envases: a.envases && a.envases.length > 0 ? a.envases : null,
        p_almacen_id: a.almacen_id,
        p_articulo_id: a.articulo_id,
        p_contado: a.contado,
        p_presentaciones: a.presentaciones || null,
        p_presentacion: (a.presentaciones && a.presentacion) || null,
        p_motivo: a.motivo,
        p_fecha: a.fecha || null,
      }),
  )
}

/**
 * Traslado entre almacenes.
 *
 * Devuelve el id de la salida, que es la cabeza de la pareja: la entrada al
 * destino cuelga de ella. Quien quiera deshacerlo reversa esa y caen las dos.
 */
export function useTransferir() {
  return useAccionInventario(
    (t: {
      origen_id: number
      destino_id: number
      articulo_id: number
      cantidad: number
      motivo: string
      fecha?: string
      /*
        LO QUE SE TECLEÓ, cuando se contó en envases. Se manda además del total
        y no en su lugar: la base rehace la cuenta con `en_unidad_base` —el
        mismo ayudante que usan la entrada y la salida— y deja las tres cifras
        al lado de las dos patas del traslado. Un asiento que solo guarda «213
        L» no le dice nada a quien cargó un tambor y cinco litros.
      */
      presentaciones?: number | null
      presentacion?: string | null
      suelto?: number | null
    }) =>
      rpc<number>('transferir_existencia', {
        p_origen_id: t.origen_id,
        p_destino_id: t.destino_id,
        p_articulo_id: t.articulo_id,
        p_cantidad: t.cantidad,
        p_motivo: t.motivo,
        p_fecha: t.fecha || null,
        p_presentaciones: t.presentaciones ?? null,
        p_presentacion: t.presentacion || null,
        p_suelto: t.suelto ?? null,
      }),
  )
}

export function useReversarMovimiento() {
  return useAccionInventario((r: { id: number; motivo: string }) =>
    rpc<number>('reversar_movimiento', { p_id: r.id, p_motivo: r.motivo }),
  )
}

// ---------------------------------------------------------------------------
// La historia de un artículo
// ---------------------------------------------------------------------------

/*
  TODO LO QUE LE HA PASADO, SEGUIDO

  Estaba todo escrito y repartido en tres sitios que nadie cruza a mano: el
  libro, las asignaciones y la propia fila del catálogo. Christopher lo pidió
  con la comparación exacta —«tal como ya lo hacen las solicitudes de compras»—
  y tenía razón: una compra sí cuenta su historia seguida y un artículo no.

  SALÍA DE UNA VISTA, Y AHORA DE UNA FUNCIÓN

  `v_historial_articulo` es `security_invoker` y se apoya en RLS. Suena bien y
  miente: `empleados` exige NOMINA:LECTURA y ALMACEN la tiene en NINGUNO, así que
  un almacenista miraba la ficha de un casco y veía «se entregó» sin A QUIÉN. La
  columna salía nula y nada avisaba. Es el mismo fallo que ya costó el nombre de
  quien recibe en el vale de combustible.

  Y una vista sin permiso devuelve CERO FILAS, que la pantalla pinta como «no ha
  pasado nada» — una mentira peor que un error.

  `historial_articulo()` es SECURITY DEFINER, hace su propia comprobación y
  lanza si falta. Además añade lo que la vista no tenía: los viajes al taller y
  el número de la nota de salida en papel.
*/
export function useHistorialArticulo(articuloId: number | null) {
  return useQuery({
    queryKey: ['historial-articulo', articuloId],
    enabled: articuloId != null,
    queryFn: () =>
      rpc<HechoDeFicha[]>('historial_articulo', {
        p_articulo_id: articuloId,
        p_limite: 200,
      }),
  })
}
