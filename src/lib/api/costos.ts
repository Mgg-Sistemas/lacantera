/**
 * El centro de costo.
 *
 * Cajas que se cierran y congelan, un libro con origen y reversos, lo que
 * está por aceptar, el fondo con su origen, y el costo por metro cúbico.
 * Todo lo que escribe va por RPC; todo lo que cruza a otro módulo va por
 * función `security definer`, nunca por vista.
 *
 * EL RESUMEN LLEGA COMO JSON, ASÍ QUE SUS NÚMEROS SON NÚMEROS. Las vistas
 * siguen mandando los `numeric` como `string`. No se mezclan: `ResumenCaja`
 * es `number | null` y lo demás `string`.
 *
 * EL DINERO PUEDE LLEGAR NULO Y NO ES UN ERROR. Sin la casilla
 * `EXPLOTACION.VER_PAGO_VIAJES`, el precio de un viaje y el costo de una caja
 * con viajes llegan en blanco. La pantalla dibuja un guion, no un cero.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type ClaseCosto =
  | 'ENTREGA'
  | 'ABONO'
  | 'VIAJE'
  | 'SALIDA'
  | 'COMBUSTIBLE'
  | 'NOMINA'
  | 'COMPRA'
  | 'GASTO'
  | 'FIJO'

export const CLASES: Record<ClaseCosto, string> = {
  ENTREGA: 'Entrega de fondo',
  ABONO: 'Abono al fondo',
  VIAJE: 'Viaje de camión',
  SALIDA: 'Salida de planta',
  COMBUSTIBLE: 'Combustible',
  NOMINA: 'Nómina',
  COMPRA: 'Compra',
  GASTO: 'Gasto suelto',
  FIJO: 'Gasto fijo',
}

export interface CajaCosto {
  id: number
  numero: number
  nombre: string | null
  fecha_inicio: string
  fecha_fin: string | null
  estado: 'ABIERTA' | 'CERRADA'
  saldo_inicial_usd: string
  resumen_json: ResumenCaja | null
  abierta_en: string
  cerrada_en: string | null
  abierta_por_nombre: string | null
  cerrada_por_nombre: string | null
}

export interface ResumenCaja {
  caja: {
    id: number
    numero: number
    nombre: string | null
    fecha_inicio: string
    fecha_fin: string | null
    estado: string
    saldo_inicial_usd: number
  }
  /** Cierto cuando hay viajes y quien mira no puede ver su pago. */
  dinero_tapado: boolean
  costo_usd: number | null
  ajustes_tardios_usd: number | null
  entregado_usd: number
  abonado_usd: number
  fondo_usd: number
  m3_mina: number
  m3_planta: number
  m3_despacho: number
  costo_por_m3: number | null
  costo_por_m3_mina: number | null
  incluye: ClaseCosto[]
  por_producto: { producto_id: number; producto: string; m3: number; salidas: number }[]
  por_categoria: { categoria_raiz: string; categoria: string; nombre: string; monto_usd: number }[]
  por_clase: { clase: ClaseCosto; monto_usd: number }[]
  pendientes: number
  reversos_pendientes: number
  fondo_asignado_usd: number | null
  tendencia: {
    numero: number
    fecha_fin: string
    costo_por_m3: number | null
    m3_planta: number
    costo_usd: number | null
  }[]
}

export type OrigenCandidato = 'ACARREO' | 'SALIDA_PLANTA' | 'FIJO'

export interface Candidato {
  origen: OrigenCandidato
  origen_id: number
  fecha: string
  descripcion: string
  clase: ClaseCosto
  moneda: string
  monto: string | null
  m3: string | null
  producto_id: number | null
  medida: string | null
  vehiculo_id: number | null
  placa: string | null
  aviso: 'SIN_PRECIO' | 'PRECIO_RARO' | 'SIN_M3' | null
}

export interface MovimientoCosto {
  id: number
  caja_id: number
  fecha: string
  descripcion: string
  clase: ClaseCosto
  moneda: string
  monto: string
  monto_usd: string
  tasa_arrastrada: boolean
  m3: string | null
  producto: string | null
  medida: string | null
  origen: string
  origen_id: number | null
  sentido: 'ORIGINAL' | 'REVERSO'
  reversa_a: number | null
  categoria: string | null
  categoria_nombre: string | null
  categoria_raiz: string | null
  origen_fondo: string | null
  origen_fondo_nombre: string | null
  placa: string | null
  llego_tarde: boolean
  nota: string | null
  registrado_en: string
  registrado_por_nombre: string | null
}

export interface ReversoPendiente {
  movimiento_id: number
  fecha: string
  descripcion: string
  monto_usd: string
  m3: string | null
  motivo: string | null
}

export interface Decision {
  id: number
  caja_id: number
  origen: OrigenCandidato
  origen_id: number
  decision: 'ACEPTADA' | 'RECHAZADA'
  motivo: string | null
  decidido_en: string
  deshecha_en: string | null
}

export interface OrigenFondo {
  codigo: string
  nombre: string
  genera_deuda: boolean
  activo: boolean
  orden: number
}

export interface DeudaPorOrigen {
  origen_fondo: string
  nombre: string
  genera_deuda: boolean
  activo: boolean
  entregado_usd: string
  abonado_usd: string
  deuda_usd: string
}

export interface GastoFijo {
  id: number
  nombre: string
  categoria: string | null
  moneda: string
  monto: string
  activo: boolean
  nota: string | null
}

export interface ConfiguracionCostos {
  corte_mensual: boolean
}

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------

export function useCajaAbierta() {
  return useQuery({
    queryKey: ['costos', 'caja-abierta'],
    queryFn: async () =>
      desenvolver<CajaCosto | null>(
        await supabase.from('v_costo_cajas').select('*').eq('estado', 'ABIERTA').maybeSingle(),
      ),
  })
}

export function useCajas() {
  return useQuery({
    queryKey: ['costos', 'cajas'],
    queryFn: async () =>
      desenvolver<CajaCosto[]>(
        await supabase.from('v_costo_cajas').select('*').order('numero', { ascending: false }),
      ),
  })
}

/** Sin caja, el de la abierta. Con caja, el de esa (abierta o cerrada). */
export function useResumenCaja(cajaId: number | null = null, activo = true) {
  return useQuery({
    queryKey: ['costos', 'resumen', cajaId ?? 'abierta'],
    enabled: activo,
    queryFn: () => rpc<ResumenCaja>('costo_resumen_caja', { p_caja_id: cajaId }),
  })
}

export function useCandidatos(activo = true) {
  return useQuery({
    queryKey: ['costos', 'por-aceptar'],
    enabled: activo,
    queryFn: () => rpc<Candidato[]>('costo_candidatos', { p_caja_id: null }),
  })
}

export function useMovimientosCaja(
  cajaId: number | null,
  filtros: { clase?: string; desde?: string; hasta?: string } = {},
) {
  return useQuery({
    queryKey: ['costos', 'movimientos', cajaId, filtros],
    enabled: cajaId !== null,
    queryFn: async () => {
      let q = supabase
        .from('v_costo_movimientos')
        .select('*')
        .eq('caja_id', cajaId!)
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })
        .limit(500)
      if (filtros.clase) q = q.eq('clase', filtros.clase)
      if (filtros.desde) q = q.gte('fecha', filtros.desde)
      if (filtros.hasta) q = q.lte('fecha', filtros.hasta)
      return desenvolver<MovimientoCosto[]>(await q)
    },
  })
}

export function useReversosPendientes(activo = true) {
  return useQuery({
    queryKey: ['costos', 'reversos'],
    enabled: activo,
    queryFn: () => rpc<ReversoPendiente[]>('costo_reversos_pendientes'),
  })
}

export function useRechazosVigentes(cajaId: number | null) {
  return useQuery({
    queryKey: ['costos', 'rechazos', cajaId],
    enabled: cajaId !== null,
    queryFn: async () =>
      desenvolver<Decision[]>(
        await supabase
          .from('costo_decisiones')
          .select('id, caja_id, origen, origen_id, decision, motivo, decidido_en, deshecha_en')
          .eq('caja_id', cajaId!)
          .eq('decision', 'RECHAZADA')
          .is('deshecha_en', null)
          .order('decidido_en', { ascending: false }),
      ),
  })
}

export function useOrigenesFondo(incluirApagados = false) {
  return useQuery({
    queryKey: ['costos', 'origenes', incluirApagados],
    queryFn: async () => {
      let q = supabase.from('costo_origenes_fondo').select('*').order('orden')
      if (!incluirApagados) q = q.eq('activo', true)
      return desenvolver<OrigenFondo[]>(await q)
    },
  })
}

export function useDeudaPorOrigen() {
  return useQuery({
    queryKey: ['costos', 'deuda'],
    queryFn: async () =>
      desenvolver<DeudaPorOrigen[]>(await supabase.from('v_costo_deuda_por_origen').select('*')),
  })
}

export function useGastosFijos() {
  return useQuery({
    queryKey: ['costos', 'fijos'],
    queryFn: async () =>
      desenvolver<GastoFijo[]>(
        await supabase.from('costo_gastos_fijos').select('*').order('nombre'),
      ),
  })
}

export function useConfiguracionCostos() {
  return useQuery({
    queryKey: ['costos', 'configuracion'],
    queryFn: async () =>
      desenvolver<ConfiguracionCostos>(
        await supabase.from('costo_configuracion').select('corte_mensual').single(),
      ),
  })
}

// ---------------------------------------------------------------------------
// Escrituras
//
// Todas invalidan `costos` entero: aceptar mueve el resumen, el libro, la
// cola y la deuda a la vez, y refrescar solo una deja las otras contando
// otra cosa.
// ---------------------------------------------------------------------------

function useAccion<A, R = unknown>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['costos'] })
      void qc.invalidateQueries({ queryKey: ['salidas-planta'] })
      void qc.invalidateQueries({ queryKey: ['acarreos'] })
    },
  })
}

export function useAbrirPrimeraCaja() {
  return useAccion((c: { fecha_inicio: string; nombre?: string | null; saldo_inicial?: number }) =>
    rpc<number>('costo_abrir_primera_caja', {
      p_fecha_inicio: c.fecha_inicio,
      p_nombre: c.nombre ?? null,
      p_saldo_inicial: c.saldo_inicial ?? 0,
    }),
  )
}

export function useCerrarCaja() {
  return useAccion(
    (c: { fecha_fin: string; nombre_siguiente?: string | null; pendientes: 'ACEPTAR_TODOS' | 'DEJAR' }) =>
      rpc<number>('costo_cerrar_caja', {
        p_fecha_fin: c.fecha_fin,
        p_nombre_siguiente: c.nombre_siguiente ?? null,
        p_pendientes: c.pendientes,
      }),
  )
}

export function useAceptar() {
  return useAccion((a: { origen: OrigenCandidato; origen_id: number; monto?: number | null; nota?: string | null }) =>
    rpc<number>('costo_aceptar', {
      p_origen: a.origen,
      p_origen_id: a.origen_id,
      p_monto: a.monto ?? null,
      p_nota: a.nota ?? null,
    }),
  )
}

export function useAceptarDia() {
  return useAccion((a: { fecha: string; origen: 'ACARREO' | 'SALIDA_PLANTA' }) =>
    rpc<{ aceptados: number; saltados: number }[]>('costo_aceptar_dia', {
      p_fecha: a.fecha,
      p_origen: a.origen,
    }).then((r) => r?.[0] ?? { aceptados: 0, saltados: 0 }),
  )
}

export function useRechazar() {
  return useAccion((a: { origen: OrigenCandidato; origen_id: number; motivo: string }) =>
    rpc<number>('costo_rechazar', { p_origen: a.origen, p_origen_id: a.origen_id, p_motivo: a.motivo }),
  )
}

export function useDeshacerRechazo() {
  return useAccion((id: number) => rpc('costo_deshacer_rechazo', { p_decision_id: id }))
}

export function useReversar() {
  return useAccion((a: { movimiento_id: number; motivo: string }) =>
    rpc<number>('costo_reversar', { p_movimiento_id: a.movimiento_id, p_motivo: a.motivo }),
  )
}

export function useRegistrarEntrega() {
  return useAccion(
    (e: { fecha: string; origen_fondo: string; moneda: string; monto: number; descripcion: string; nota?: string | null }) =>
      rpc<number>('costo_registrar_entrega', {
        p_fecha: e.fecha,
        p_origen_fondo: e.origen_fondo,
        p_moneda: e.moneda,
        p_monto: e.monto,
        p_descripcion: e.descripcion,
        p_nota: e.nota ?? null,
      }),
  )
}

export function useRegistrarAbono() {
  return useAccion(
    (e: { fecha: string; origen_fondo: string; moneda: string; monto: number; descripcion: string; nota?: string | null }) =>
      rpc<number>('costo_registrar_abono', {
        p_fecha: e.fecha,
        p_origen_fondo: e.origen_fondo,
        p_moneda: e.moneda,
        p_monto: e.monto,
        p_descripcion: e.descripcion,
        p_nota: e.nota ?? null,
      }),
  )
}

export function useRegistrarGastoCosto() {
  return useAccion(
    (g: { fecha: string; moneda: string; monto: number; descripcion: string; categoria?: string | null; nota?: string | null }) =>
      rpc<number>('costo_registrar_gasto', {
        p_fecha: g.fecha,
        p_moneda: g.moneda,
        p_monto: g.monto,
        p_descripcion: g.descripcion,
        p_categoria: g.categoria ?? null,
        p_nota: g.nota ?? null,
      }),
  )
}

export function useGuardarOrigenFondo() {
  return useAccion(
    (o: { codigo?: string | null; nombre: string; genera_deuda?: boolean; activo?: boolean; orden?: number }) =>
      rpc<string>('costo_guardar_origen_fondo', {
        p_codigo: o.codigo ?? null,
        p_nombre: o.nombre,
        p_genera_deuda: o.genera_deuda ?? true,
        p_activo: o.activo ?? true,
        p_orden: o.orden ?? 100,
      }),
  )
}

export function useGuardarGastoFijo() {
  return useAccion(
    (f: { id?: number | null; nombre: string; moneda: string; monto: number; categoria?: string | null; activo?: boolean; nota?: string | null }) =>
      rpc<number>('costo_guardar_gasto_fijo', {
        p_id: f.id ?? null,
        p_nombre: f.nombre,
        p_moneda: f.moneda,
        p_monto: f.monto,
        p_categoria: f.categoria ?? null,
        p_activo: f.activo ?? true,
        p_nota: f.nota ?? null,
      }),
  )
}

export function useConfigurarCostos() {
  return useAccion((c: { corte_mensual: boolean }) =>
    rpc('costo_configurar', { p_corte_mensual: c.corte_mensual }),
  )
}
