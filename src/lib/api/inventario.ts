import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

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
  activo: boolean  /** Cuanto le cabe. Solo en un tanque de combustible. */
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
  registrado_por: string | null
  registrado_en: string
  almacen: { nombre: string } | null
  articulo: { codigo: string; nombre: string } | null
}

export const TIPOS_MOVIMIENTO: Record<string, string> = {
  ENTRADA_COMPRA: 'Entrada por compra',
  ENTRADA_PRODUCCION: 'Entrada de producción',
  ENTRADA_DEVOLUCION: 'Devolución',
  ENTRADA_DIRECTA: 'Entrada directa',
  SALIDA_CONSUMO: 'Salida a consumo',
  SALIDA_DESPACHO: 'Salida por despacho',
  SALIDA_MERMA: 'Merma',
  SALIDA_BAJA: 'Baja',
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
        .select('*, almacen:almacenes(nombre), articulo:articulos(codigo, nombre)')
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

export interface RenglonRecibido {
  orden_renglon_id: number
  cantidad: number
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
 * Meter mercancía sin una compra detrás.
 *
 * El saldo con el que arranca un almacén, algo comprado por fuera, material
 * que trae alguien. Lleva costo propio — al revés que el ajuste de conteo, que
 * hereda el promedio— porque aquí el costo es un dato que se conoce, y sin él
 * el almacén quedaría lleno y valorado en nada.
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
    }) =>
      rpc<number>('registrar_entrada', {
        p_almacen_id: e.almacen_id,
        p_articulo_id: e.articulo_id,
        p_cantidad: e.cantidad,
        p_costo_usd: e.costo_usd,
        p_motivo: e.motivo,
        p_referencia: e.referencia ?? null,
        p_fecha: e.fecha ?? null,
      }),
  )
}

/** Un renglón de una entrada: qué, cuánto, y cuánto costó en qué moneda. */
export interface RenglonDeEntrada {
  articulo_id: number
  cantidad: number
  costo: number
  moneda: string
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
        p_renglones: e.renglones,
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

/*
  DE QUÉ CLASE ES UNA SALIDA

  Christopher: «validar si se pueden registrar salidas del inventario, así como
  ya se tienen entradas con o sin compras».

  Se podían, pero de una sola clase. La base admite tres —consumo, merma y
  despacho— y la pantalla mandaba siempre `SALIDA_CONSUMO` sin preguntar, así
  que la merma existía en el catálogo y no había forma de registrarla.

  Y eso importa más de lo que parece: el porcentaje de merma es lo que se
  vigila para detectar robo. Si todo lo que se pierde se anota como consumo, la
  merma da siempre cero y el indicador que debería avisar no avisa nunca.

  El despacho NO se ofrece aquí a propósito. Lo escribe una venta cuando sale
  el camión, con su nota de entrega detrás. Dejarlo a mano permitiría restar
  material «por despacho» sin documento que lo respalde, y al facturar la venta
  el patio quedaría descontado dos veces.
*/
export const CLASES_DE_SALIDA: Array<{ valor: string; etiqueta: string; dice: string }> = [
  {
    valor: 'SALIDA_CONSUMO',
    etiqueta: 'Se usó trabajando',
    dice: 'El repuesto que se montó, el aceite del cambio, el combustible que se quemó.',
  },
  {
    valor: 'SALIDA_MERMA',
    etiqueta: 'Se perdió en el manejo',
    dice: 'Lo que se derrama, se evapora o se rompe moviéndolo. Se vigila: una merma que sube sin explicación es la primera señal de un faltante.',
  },
]

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
      contado: number
      motivo: string
      fecha?: string
    }) =>
      rpc<number>('registrar_ajuste', {
        p_almacen_id: a.almacen_id,
        p_articulo_id: a.articulo_id,
        p_contado: a.contado,
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
    }) =>
      rpc<number>('transferir_existencia', {
        p_origen_id: t.origen_id,
        p_destino_id: t.destino_id,
        p_articulo_id: t.articulo_id,
        p_cantidad: t.cantidad,
        p_motivo: t.motivo,
        p_fecha: t.fecha || null,
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

  Sale de `v_historial_articulo`, que une los hechos donde ya viven en vez de
  copiarlos a una tabla nueva. Copiarlos sería asegurar que un día las dos
  versiones no coincidan.
*/
export interface HechoDelArticulo {
  articulo_id: number
  ocurrido_en: string
  fecha: string
  tipo: string
  titulo: string
  detalle: string | null
  cantidad: string | null
  /** +1 sumó, -1 restó, 0 no movió existencia. */
  signo: number
  almacen: string | null
  documento: string | null
  /** Quién lo registró en el sistema. */
  quien: string | null
  /** A quién se le entregó, cuando el hecho es una entrega. */
  persona: string | null
}

export function useHistorialArticulo(articuloId: number | null) {
  return useQuery({
    queryKey: ['historial-articulo', articuloId],
    enabled: articuloId != null,
    queryFn: async () =>
      desenvolver<HechoDelArticulo[]>(
        await supabase
          .from('v_historial_articulo')
          .select('*')
          .eq('articulo_id', articuloId)
          .order('ocurrido_en', { ascending: false }),
      ),
  })
}
