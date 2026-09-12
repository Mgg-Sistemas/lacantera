/**
 * Los viajes de camiones.
 *
 * Un viaje es a la vez la medida del material que bajó de la mina y una
 * factura por pagar. La pantalla pide «camión tal, tantos viajes» y la base
 * guarda una fila por viaje; estos hooks son la traducción entre las dos.
 *
 * EL DINERO PUEDE LLEGAR NULO Y ESO NO ES UN ERROR. `precio_usd` y
 * `monto_usd` los tapa la vista cuando quien mira no tiene la casilla
 * `EXPLOTACION.VER_PAGO_VIAJES`. Por eso van declarados `string | null` y la
 * pantalla dibuja un guion, no un cero: un cero diría que ese viaje no cuesta
 * nada.
 *
 * Los montos llegan como `string` porque PostgREST serializa `numeric` en
 * texto para no perder precisión. No se convierten hasta el momento de
 * presentar.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/** Los tres trayectos que se pagan, en el orden en que ocurren. */
export const TRAMOS = [
  { valor: 'MINA_PLANTA', etiqueta: 'Mina a planta fija', corto: 'A planta' },
  { valor: 'PLANTA_LAVADO', etiqueta: 'Planta fija a lavado', corto: 'A lavado' },
  { valor: 'MINA_BASE', etiqueta: 'Mina a base (coraza)', corto: 'Coraza' },
] as const

export type Tramo = (typeof TRAMOS)[number]['valor']

export interface Acarreo {
  id: number
  fecha: string
  vehiculo_id: number
  placa: string
  vehiculo: string | null
  tipo: string
  capacidad_m3: string
  carga_util_m3: string | null
  tramo: Tramo
  tramo_dice: string
  secuencia: number
  /** Solo la lleva el primero de una tanda: no se inventan horas. */
  hora: string | null
  transportista: string
  chofer: string | null
  /** Nula cuando el camión no tiene carga útil cargada. Nunca cero. */
  carga_m3: string | null
  /** Nulo sin la casilla del dinero. */
  precio_usd: string | null
  frente_id: number | null
  frente: string | null
  estado: 'REGISTRADO' | 'ANULADO'
  motivo_anulacion: string | null
  nota: string | null
  registrado_en: string
  registrado_por_nombre: string | null
}

export interface AcarreoDia {
  fecha: string
  vehiculo_id: number
  placa: string
  vehiculo: string | null
  transportista: string
  tramo: Tramo
  viajes: number
  anulados: number
  /** Nulo cuando ningún viaje del grupo sabe cuánto cargó. */
  m3: string | null
  /** Cuántos de esos viajes no suman metros cúbicos. */
  sin_carga: number
  /** Nulo sin la casilla del dinero. */
  monto_usd: string | null
  chofer: string | null
}

export interface EquipoEnOperacion {
  codigo: string
  maquina: string
  tipo: string
  horas: string | null
  operador: string | null
}

export interface TarifaAcarreo {
  tramo: Tramo
  tramo_dice: string
  precio_usd: string
  vigente_desde: string
  nota: string | null
  fijada_en: string
  fijada_por_nombre: string | null
}

export interface PagoDeAcarreo {
  mes: string
  transportista: string
  fecha: string
  viajes: number
  m3: string | null
  monto_usd: string | null
  acumulado_usd: string | null
}

/**
 * Invalida lo que un viaje puede haber movido.
 *
 * `explotacion` va también porque el tablero del módulo enseña los viajes del
 * día: si no, la tarjeta se queda con la cifra de antes hasta que alguien
 * recargue.
 */
function useAccion<A, R = unknown>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['acarreos'] })
      void qc.invalidateQueries({ queryKey: ['explotacion'] })
      void qc.invalidateQueries({ queryKey: ['vehiculos'] })
    },
  })
}

/** Lo que hizo cada camión en un día, agrupado por tramo. */
export function useAcarreosDia(fecha: string) {
  return useQuery({
    queryKey: ['acarreos', 'dia', fecha],
    enabled: Boolean(fecha),
    queryFn: async () =>
      desenvolver<AcarreoDia[]>(
        await supabase
          .from('v_acarreos_dia')
          .select('*')
          .eq('fecha', fecha)
          .order('transportista')
          .order('placa'),
      ),
  })
}

/**
 * Todos los viajes de un día, sin agrupar.
 *
 * Es lo que necesita el papel: la vista agrupada sirve para la pantalla, pero
 * el registro diario imprime viaje por viaje, con su hora y su número.
 */
export function useAcarreosDelDia(fecha: string) {
  return useQuery({
    queryKey: ['acarreos', 'todos', fecha],
    enabled: Boolean(fecha),
    queryFn: async () =>
      desenvolver<Acarreo[]>(
        await supabase
          .from('v_acarreos')
          .select('*')
          .eq('fecha', fecha)
          .order('transportista')
          .order('placa')
          .order('tramo')
          .order('secuencia'),
      ),
  })
}

/** El detalle viaje por viaje de un camión en un día. */
export function useAcarreosDeVehiculo(fecha: string, vehiculoId: number | null) {
  return useQuery({
    queryKey: ['acarreos', 'detalle', fecha, vehiculoId],
    enabled: Boolean(fecha) && vehiculoId !== null,
    queryFn: async () =>
      desenvolver<Acarreo[]>(
        await supabase
          .from('v_acarreos')
          .select('*')
          .eq('fecha', fecha)
          .eq('vehiculo_id', vehiculoId!)
          .order('tramo')
          .order('secuencia'),
      ),
  })
}

/**
 * Las tarifas vigentes hoy.
 *
 * Llega vacía —no con error— a quien no puede ver el dinero: la reja de la
 * tabla lo filtra. La cajita de tarifas simplemente no se dibuja.
 */
export function useTarifasAcarreo() {
  return useQuery({
    queryKey: ['acarreos', 'tarifas'],
    queryFn: async () =>
      desenvolver<TarifaAcarreo[]>(
        await supabase.from('v_tarifas_acarreo').select('*').order('tramo'),
      ),
  })
}

/**
 * Qué máquinas trabajaron ese día, para el reporte de operaciones.
 *
 * Pasa por una función y no por una vista a propósito: los datos son de
 * Maquinaria y quien carga los viajes no tiene ese módulo. La función
 * pregunta por Explotación y responde solo lo que el reporte dice.
 */
export function useEquiposEnOperacion(fecha: string) {
  return useQuery({
    queryKey: ['acarreos', 'equipos', fecha],
    enabled: Boolean(fecha),
    queryFn: () => rpc<EquipoEnOperacion[]>('equipos_en_operacion', { p_fecha: fecha }),
  })
}

/** El registro de pago de un mes. `mes` en formato AAAA-MM. */
export function usePagoDeAcarreos(mes: string) {
  return useQuery({
    queryKey: ['acarreos', 'pago', mes],
    enabled: /^\d{4}-\d{2}$/.test(mes),
    queryFn: async () =>
      desenvolver<PagoDeAcarreo[]>(
        await supabase
          .from('v_acarreo_pago_mensual')
          .select('*')
          .eq('mes', `${mes}-01`)
          .order('transportista')
          .order('fecha'),
      ),
  })
}

/**
 * Carga viajes. La cantidad SUMA a lo que el camión ya tenga ese día en ese
 * tramo: no reemplaza el total.
 */
export function useRegistrarAcarreos() {
  return useAccion(
    (a: {
      fecha: string
      vehiculo_id: number
      tramo: Tramo
      cantidad: number
      hora?: string | null
      carga_m3?: number | null
      precio_usd?: number | null
      frente_id?: number | null
      nota?: string | null
    }) =>
      rpc<number>('registrar_acarreos', {
        p_fecha: a.fecha,
        p_vehiculo_id: a.vehiculo_id,
        p_tramo: a.tramo,
        p_cantidad: a.cantidad,
        p_hora: a.hora ?? null,
        p_carga_m3: a.carga_m3 ?? null,
        p_precio_usd: a.precio_usd ?? null,
        p_frente_id: a.frente_id ?? null,
        p_nota: a.nota ?? null,
      }),
  )
}

/** Arregla un viaje suelto. Lo que no se manda se queda como está. */
export function useCorregirAcarreo() {
  return useAccion(
    (a: {
      id: number
      hora?: string | null
      carga_m3?: number | null
      precio_usd?: number | null
      nota?: string | null
    }) =>
      rpc('corregir_acarreo', {
        p_id: a.id,
        p_hora: a.hora ?? null,
        p_carga_m3: a.carga_m3 ?? null,
        p_precio_usd: a.precio_usd ?? null,
        p_nota: a.nota ?? null,
      }),
  )
}

export function useAnularAcarreo() {
  return useAccion((a: { id: number; motivo: string }) =>
    rpc('anular_acarreo', { p_id: a.id, p_motivo: a.motivo }),
  )
}

export function useFijarTarifaAcarreo() {
  return useAccion((a: { tramo: Tramo; precio: number; desde?: string | null; nota?: string | null }) =>
    rpc('fijar_tarifa_acarreo', {
      p_tramo: a.tramo,
      p_precio: a.precio,
      p_desde: a.desde ?? null,
      p_nota: a.nota ?? null,
    }),
  )
}

/** La carga útil del camión: lo que suele llevar, no lo que le cabe. */
export function useFijarCargaUtil() {
  return useAccion((a: { vehiculo_id: number; carga_util: number | null }) =>
    rpc('fijar_carga_util', {
      p_vehiculo_id: a.vehiculo_id,
      p_carga_util: a.carga_util,
    }),
  )
}
