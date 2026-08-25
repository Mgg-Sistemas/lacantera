import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

// ---------------------------------------------------------------------------
// Cuentas y saldos
// ---------------------------------------------------------------------------

export interface Cuenta {
  id: number
  codigo: string
  nombre: string
  tipo: 'BANCO' | 'CAJA' | 'BILLETERA'
  moneda: string
  banco: string | null
  numero_cuenta: string | null
  titular: string | null
  activa: boolean
  permite_sobregiro: boolean
  documento: string | null
  correo_binance: string | null
  red_cripto: string | null
  nota: string | null
  /** Suma del libro. No hay ninguna columna de saldo que pueda quedar vieja. */
  saldo: string
  saldo_bs: string
  saldo_usd: string
  movimientos: number | null
  ultimo_movimiento: string | null
}

export const TIPOS_CUENTA = [
  { valor: 'BANCO', etiqueta: 'Cuenta bancaria' },
  { valor: 'CAJA', etiqueta: 'Caja / efectivo' },
  { valor: 'BILLETERA', etiqueta: 'Billetera digital (Binance)' },
]

export function useCuentas(soloActivas = false) {
  return useQuery({
    queryKey: ['tesoreria', 'cuentas', soloActivas],
    queryFn: async () => {
      let q = supabase.from('v_saldos_tesoreria').select('*').order('nombre')
      if (soloActivas) q = q.eq('activa', true)
      return desenvolver<Cuenta[]>(await q)
    },
  })
}

// ---------------------------------------------------------------------------
// El libro
// ---------------------------------------------------------------------------

export interface MovimientoTesoreria {
  id: number
  numero: string
  fecha: string
  /** EN RETIRADA: la empresa ya no lleva cajas ni bancos. Nulo en lo nuevo. */
  cuenta_id: number | null
  /** Cómo se pagó. Ocupa el sitio que tenía la cuenta. */
  metodo: string | null
  /** En qué moneda se movió. Antes vivía dentro de la cuenta. */
  moneda: string | null
  tipo: string
  signo: number
  monto: string
  tasa: string
  tasa_usd: string
  monto_bs: string
  monto_usd: string
  concepto: string
  referencia: string | null
  contraparte: string | null
  instruccion_id: number | null
  orden_id: number | null
  transferencia_par: number | null
  nomina_periodo_id: number | null
  movimiento_origen: number | null
  nota: string | null
  registrado_por: string | null
  registrado_en: string
  cuenta: { nombre: string; moneda: string } | null
}

export const TIPOS_TESORERIA: Record<string, string> = {
  APERTURA: 'Saldo de apertura',
  INGRESO: 'Ingreso',
  EGRESO: 'Egreso',
  PAGO: 'Pago a proveedor',
  IGTF: 'IGTF',
  COMISION: 'Comisión bancaria',
  TRANSFERENCIA: 'Traslado entre cuentas',
  AJUSTE: 'Ajuste',
  REVERSO: 'Reverso',
}

/*
  CÓMO SE PAGÓ Y EN QUÉ MONEDA, NO DE QUÉ CUENTA

  Christopher: «ya no se manejan cajas ni bancos, esto dará error tarde o
  temprano». La empresa dejó de llevar el dinero por cuenta, y el libro seguía
  preguntando por una — con siete cargadas que eran de prueba, empezando por
  «CAJA CHICA PRUEBA».

  Lo que sí se lleva, y ya se registraba, son dos cosas: el MÉTODO —efectivo,
  transferencia, pago móvil, que estaba en la instrucción de pago y el libro no
  miraba— y la MONEDA, que estaba escondida dentro de la cuenta. Al quitar la
  cuenta la moneda se habría perdido: `monto_bs` y `monto_usd` salen de las
  tasas y ninguno de los dos dice cuál era la original.

  `cuenta` se sigue leyendo mientras haya movimientos viejos que la nombren. Es
  lo único que queda de ella.
*/
export const METODOS_DE_PAGO: Array<{ valor: string; etiqueta: string }> = [
  { valor: 'EFECTIVO', etiqueta: 'Efectivo' },
  { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia' },
  { valor: 'PAGO_MOVIL', etiqueta: 'Pago móvil' },
  { valor: 'ZELLE', etiqueta: 'Zelle' },
  { valor: 'BINANCE', etiqueta: 'Binance' },
  { valor: 'OTRO', etiqueta: 'Otro' },
]

export function useMovimientosTesoreria(
  filtros: { metodo?: string; moneda?: string; desde?: string; hasta?: string } = {},
) {
  return useQuery({
    queryKey: ['tesoreria', 'movimientos', filtros],
    queryFn: async () => {
      let q = supabase
        .from('tesoreria_movimientos')
        .select('*, cuenta:cuentas_tesoreria(nombre, moneda)')
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })
        .limit(200)

      if (filtros.metodo) q = q.eq('metodo', filtros.metodo)
      if (filtros.moneda) q = q.eq('moneda', filtros.moneda)
      // Por la fecha del movimiento —el día que salió el dinero del banco— y no
      // por la de registro: es la que cuadra con el estado de cuenta.
      if (filtros.desde) q = q.gte('fecha', filtros.desde)
      if (filtros.hasta) q = q.lte('fecha', filtros.hasta)

      return desenvolver<MovimientoTesoreria[]>(await q)
    },
  })
}

// ---------------------------------------------------------------------------
// Lo que se debe
// ---------------------------------------------------------------------------

export interface PorPagar {
  /*
    Lo que urge y para quién es.

    Sale de la solicitud, donde siempre estuvo, y llega hasta aquí porque quien
    paga necesita saber qué apura y de qué unidad viene antes de decidir por
    dónde empieza. Antes tenía que abrir cada compra para averiguarlo.
  */
  prioridad: 'NORMAL' | 'ALTA' | 'URGENTE'
  prioridad_orden: number
  unidad: string
  destino_almacen_id: number | null
  requerida_para: string | null

  instruccion_id: number
  orden_id: number
  orden_numero: string
  solicitud_id: number
  titulo: string
  proveedor_id: number | null
  proveedor: string | null
  rif: string | null
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
  nota: string | null
  creada_en: string
  dias_esperando: number
}

export function usePorPagar() {
  return useQuery({
    queryKey: ['tesoreria', 'por-pagar'],
    queryFn: async () =>
      desenvolver<PorPagar[]>(
        await supabase.from('v_cuentas_por_pagar').select('*').order('creada_en'),
      ),
    // Respaldo del enlace en vivo, que es lo que de verdad mantiene esta cola
    // al día. Ver src/lib/tiempoReal.ts.
    refetchInterval: 5 * 60_000,
  })
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export interface ResumenPanel {
  compras_pedido: number
  compras_cotizando: number
  compras_por_aprobar: number
  compras_aprobadas: number
  compras_pagadas_sin_recibir: number
  pagado_sin_recibir_usd: string
  compras_atrasadas: number
  por_pagar_n: number
  por_pagar_usd: string
  pago_mas_viejo_dias: number
  disponible_usd: string
  disponible_ves: string
  cuentas_sin_abrir: number
  inventario_usd: string
  articulos_bajo_minimo: number
  tasa_de_hoy: boolean
}

/**
 * Los totales del panel, sumados en la base.
 *
 * Sumarlos en el navegador obligaría a bajarse cada movimiento y cada tarjeta
 * para devolver un número, y con dos años de operación eso deja de abrir.
 */
export function useResumenPanel() {
  return useQuery({
    queryKey: ['tesoreria', 'panel'],
    queryFn: async () =>
      desenvolver<ResumenPanel>(
        await supabase.from('v_panel_resumen').select('*').single(),
      ),
    // Respaldo del enlace en vivo. Ver src/lib/tiempoReal.ts.
    refetchInterval: 5 * 60_000,
  })
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

/**
 * Un movimiento de tesorería cambia el saldo, la cola de pagos y —cuando es el
 * pago de una compra— el estado de la compra y los avisos. Refrescar solo la
 * pantalla de tesorería dejaría el tablero de compras diciendo que esa orden
 * sigue esperando dinero.
 */
function useAccionTesoreria<A>(fn: (args: A) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tesoreria'] })
      void qc.invalidateQueries({ queryKey: ['compras'] })
      void qc.invalidateQueries({ queryKey: ['notificaciones'] })
    },
  })
}

export function useGuardarCuenta() {
  return useAccionTesoreria(
    (c: {
      id?: number | null
      codigo?: string
      nombre: string
      tipo: string
      moneda: string
      banco?: string | null
      numero_cuenta?: string | null
      titular?: string | null
      documento?: string | null
      correo_binance?: string | null
      red_cripto?: string | null
      permite_sobregiro?: boolean
      activa?: boolean
      nota?: string | null
    }) =>
      rpc<number>('guardar_cuenta', {
        p_id: c.id ?? null,
        p_codigo: c.codigo || null,
        p_nombre: c.nombre,
        p_tipo: c.tipo,
        p_moneda: c.moneda,
        p_banco: c.banco || null,
        p_numero_cuenta: c.numero_cuenta || null,
        p_titular: c.titular || null,
        p_documento: c.documento || null,
        p_correo_binance: c.correo_binance || null,
        p_red_cripto: c.red_cripto || null,
        p_sobregiro: c.permite_sobregiro ?? true,
        p_activa: c.activa ?? true,
        p_nota: c.nota || null,
      }),
  )
}

export function useRegistrarApertura() {
  return useAccionTesoreria((a: { cuenta_id: number; monto: number; fecha?: string; nota?: string }) =>
    rpc<number>('registrar_apertura', {
      p_cuenta: a.cuenta_id,
      p_monto: a.monto,
      p_fecha: a.fecha || null,
      p_nota: a.nota || null,
    }),
  )
}

export function useRegistrarIngreso() {
  return useAccionTesoreria(
    (m: {
      cuenta_id: number
      monto: number
      concepto: string
      fecha?: string
      referencia?: string
      contraparte?: string
    }) =>
      rpc<number>('registrar_ingreso', {
        p_cuenta: m.cuenta_id,
        p_monto: m.monto,
        p_concepto: m.concepto,
        p_fecha: m.fecha || null,
        p_referencia: m.referencia || null,
        p_contraparte: m.contraparte || null,
      }),
  )
}

export function useRegistrarEgreso() {
  return useAccionTesoreria(
    (m: {
      cuenta_id: number
      monto: number
      concepto: string
      /** De que clase es. Es el unico gasto que hay que clasificar a mano:
          los que nacen de una orden o de una nomina se deducen solos. */
      categoria?: string | null
      fecha?: string
      referencia?: string
      contraparte?: string
      tipo?: 'EGRESO' | 'COMISION'
    }) =>
      rpc<number>('registrar_egreso', {
        p_cuenta: m.cuenta_id,
        p_monto: m.monto,
        p_concepto: m.concepto,
        p_categoria: m.categoria || null,
        p_fecha: m.fecha || null,
        p_referencia: m.referencia || null,
        p_contraparte: m.contraparte || null,
        p_tipo: m.tipo ?? 'EGRESO',
      }),
  )
}

export function useTransferir() {
  return useAccionTesoreria(
    (t: {
      origen: number
      destino: number
      monto: number
      monto_destino?: number | null
      fecha?: string
      referencia?: string
      nota?: string
    }) =>
      rpc<number>('transferir_entre_cuentas', {
        p_origen: t.origen,
        p_destino: t.destino,
        p_monto: t.monto,
        p_monto_destino: t.monto_destino ?? null,
        p_fecha: t.fecha || null,
        p_referencia: t.referencia || null,
        p_nota: t.nota || null,
      }),
  )
}

export function useAjustarCuenta() {
  return useAccionTesoreria((a: { cuenta_id: number; monto: number; motivo: string; fecha?: string }) =>
    rpc<number>('ajustar_cuenta', {
      p_cuenta: a.cuenta_id,
      p_monto: a.monto,
      p_motivo: a.motivo,
      p_fecha: a.fecha || null,
    }),
  )
}

/**
 * El pago de una compra: marca la instrucción como pagada y saca el dinero de
 * una cuenta concreta. Si el pago causa IGTF, el impuesto se escribe como una
 * línea aparte para poder sumarlo por sí solo a fin de mes.
 */
/**
 * Registra varios pagos de una tanda.
 *
 * La líder pidió poder marcarlos con casillas y pagarlos por lote. La base
 * recorre y llama a la misma función que paga uno solo, así que hereda todas
 * sus comprobaciones; y como una función es una transacción, o pasan todos o
 * no pasa ninguno. Quien marca doce casillas no puede quedarse sin saber
 * cuáles pasaron.
 *
 * Devuelve cuántos se registraron.
 */
export function useRegistrarPagosEnLote() {
  return useAccionTesoreria(
    (p: {
      ids: number[]
      cuenta_id: number
      referencia?: string
      fecha?: string
      nota?: string
    }) =>
      rpc<number>('registrar_pagos_en_lote', {
        p_ids: p.ids,
        p_cuenta_id: p.cuenta_id,
        p_referencia: p.referencia || null,
        p_fecha: p.fecha || null,
        p_nota: p.nota ?? null,
      }),
  )
}

export function useRegistrarPago() {
  return useAccionTesoreria(
    (p: {
      instruccion_id: number
      cuenta_id: number
      referencia?: string
      fecha?: string
      nota?: string
    }) =>
      rpc('registrar_pago', {
        p_instruccion_id: p.instruccion_id,
        p_cuenta_id: p.cuenta_id,
        p_referencia: p.referencia || null,
        p_fecha: p.fecha || null,
        p_nota: p.nota ?? null,
      }),
  )
}

export function useReversarTesoreria() {
  return useAccionTesoreria((r: { id: number; motivo: string }) =>
    rpc<number>('reversar_movimiento_tesoreria', { p_id: r.id, p_motivo: r.motivo }),
  )
}
