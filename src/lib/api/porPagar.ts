import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/*
  GASTOS › PENDIENTE POR PAGAR (12/11/2026).

  Las cuentas por pagar que vivían en la hoja de Excel «CUENTAS PENDIENTES POR
  PAGAR»: facturas o servicios que se deben y no nacen de una orden de compra
  (esas se pagan en Compras › Pagos por hacer).

  El monto escrito no cambia nunca; el equivalente en la otra moneda lo pone la
  pantalla con la tasa BCV vigente. Cada abono congela la tasa de su día, y el
  saldo vive en la moneda de la deuda. No mueve Tesorería.

  Solo quienes están en la lista del módulo registran y cambian; los demás que
  entran a Gastos —incluidos los ADMIN— solo miran. La base lo exige: la
  pantalla solo esconde los botones.
*/

export type MonedaPorPagar = 'VES' | 'USD'
export type EstadoPorPagar = 'PENDIENTE' | 'ABONADA' | 'PAGADA' | 'ANULADA'

export interface CuentaPorPagar {
  id: number
  numero: string
  fecha: string
  proveedor: string
  numero_factura: string | null
  sin_factura: boolean
  descripcion: string
  moneda: MonedaPorPagar
  monto: number
  vence: string | null
  observacion: string | null
  registrado_por: string
  registrado_por_nombre: string | null
  registrado_en: string
  actualizado_por_nombre: string | null
  actualizado_en: string | null
  anulada_en: string | null
  anulada_por_nombre: string | null
  motivo_anulacion: string | null
  abonado: number
  saldo: number
  abonos: number
  ultimo_abono: string | null
  estado: EstadoPorPagar
}

export interface AbonoPorPagar {
  id: number
  cuenta_id: number
  cuenta_numero: string
  cuenta_moneda: MonedaPorPagar
  fecha: string
  moneda: MonedaPorPagar
  monto: number
  tasa: number | null
  monto_en_moneda_cuenta: number
  referencia: string | null
  nota: string | null
  registrado_por_nombre: string | null
  registrado_en: string
  anulado_en: string | null
  anulado_por_nombre: string | null
  motivo_anulacion: string | null
}

export interface ControladorPorPagar {
  usuario_id: string
  activo: boolean
  nombre: string
  usuario: string
  usuario_activo: boolean
  asignado_en: string
  asignado_por_nombre: string | null
}

// Los numeric llegan como número o como texto según el tamaño: se fijan aquí.
const num = (v: unknown): number => Number(v ?? 0)

const CLAVE = ['por-pagar'] as const

/** Todas las cuentas, la más reciente primero. Se filtra en pantalla. */
export function useCuentasPorPagar() {
  return useQuery({
    queryKey: [...CLAVE, 'cuentas'],
    queryFn: async () => {
      const filas = desenvolver<CuentaPorPagar[]>(
        await supabase
          .from('v_gastos_por_pagar')
          .select('*')
          .order('fecha', { ascending: false })
          .order('id', { ascending: false }),
      )
      return filas.map((f) => ({
        ...f,
        monto: num(f.monto),
        abonado: num(f.abonado),
        saldo: num(f.saldo),
        abonos: num(f.abonos),
      }))
    },
  })
}

/** Todos los abonos, para colgarlos de su cuenta. */
export function useAbonosPorPagar() {
  return useQuery({
    queryKey: [...CLAVE, 'abonos'],
    queryFn: async () => {
      const filas = desenvolver<AbonoPorPagar[]>(
        await supabase
          .from('v_gastos_por_pagar_abonos')
          .select('*')
          .order('fecha', { ascending: true })
          .order('id', { ascending: true }),
      )
      return filas.map((a) => ({
        ...a,
        monto: num(a.monto),
        tasa: a.tasa == null ? null : num(a.tasa),
        monto_en_moneda_cuenta: num(a.monto_en_moneda_cuenta),
      }))
    },
  })
}

/** ¿Llevo yo estas cuentas? Decide si salen los botones; la base decide de verdad. */
export function useControloPorPagar() {
  return useQuery({
    queryKey: [...CLAVE, 'controlo'],
    queryFn: () => rpc<boolean>('controlo_cuentas_por_pagar'),
    staleTime: 5 * 60_000,
  })
}

export function useControladoresPorPagar() {
  return useQuery({
    queryKey: [...CLAVE, 'controladores'],
    queryFn: async () =>
      desenvolver<ControladorPorPagar[]>(
        await supabase.from('v_gastos_por_pagar_controladores').select('*').order('nombre'),
      ),
  })
}

export interface DatosDeCuentaPorPagar {
  fecha: string
  proveedor: string
  descripcion: string
  moneda: MonedaPorPagar
  monto: number
  sin_factura: boolean
  numero_factura: string | null
  vence: string | null
  observacion: string | null
}

const parametros = (d: DatosDeCuentaPorPagar) => ({
  p_fecha: d.fecha,
  p_proveedor: d.proveedor,
  p_descripcion: d.descripcion,
  p_moneda: d.moneda,
  p_monto: d.monto,
  p_sin_factura: d.sin_factura,
  p_numero_factura: d.sin_factura ? null : d.numero_factura || null,
  p_vence: d.vence || null,
  p_observacion: d.observacion || null,
})

function useInvalidar() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: CLAVE })
}

/** Registra la deuda y devuelve su número (CXP-AAAA-NNNN). */
export function useRegistrarCuentaPorPagar() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (d: DatosDeCuentaPorPagar) => rpc<string>('registrar_cuenta_por_pagar', parametros(d)),
    onSuccess: invalidar,
  })
}

/** Corrige una deuda que todavía no tiene abonos. */
export function useEditarCuentaPorPagar() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (a: { id: number; datos: DatosDeCuentaPorPagar }) =>
      rpc<void>('editar_cuenta_por_pagar', { p_id: a.id, ...parametros(a.datos) }),
    onSuccess: invalidar,
  })
}

export function useAnularCuentaPorPagar() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (a: { id: number; motivo: string }) =>
      rpc<void>('anular_cuenta_por_pagar', { p_id: a.id, p_motivo: a.motivo }),
    onSuccess: invalidar,
  })
}

export function useAbonarCuentaPorPagar() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (a: {
      cuentaId: number
      fecha: string
      moneda: MonedaPorPagar
      monto: number
      referencia: string | null
      nota: string | null
    }) =>
      rpc<number>('abonar_cuenta_por_pagar', {
        p_cuenta_id: a.cuentaId,
        p_fecha: a.fecha,
        p_moneda: a.moneda,
        p_monto: a.monto,
        p_referencia: a.referencia || null,
        p_nota: a.nota || null,
      }),
    onSuccess: invalidar,
  })
}

export function useAnularAbonoPorPagar() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (a: { id: number; motivo: string }) =>
      rpc<void>('anular_abono_por_pagar', { p_id: a.id, p_motivo: a.motivo }),
    onSuccess: invalidar,
  })
}

/** Solo un ADMIN cambia quién lleva estas cuentas; nadie se borra, se apaga. */
export function useGuardarControladorPorPagar() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: (a: { usuarioId: string; activo: boolean }) =>
      rpc<void>('guardar_controlador_por_pagar', { p_usuario: a.usuarioId, p_activo: a.activo }),
    onSuccess: invalidar,
  })
}

/**
 * El equivalente de un monto en la otra moneda, con la tasa dada (Bs por $).
 * Sin tasa no se inventa: devuelve null y la pantalla dice «sin tasa».
 */
export function equivalente(moneda: MonedaPorPagar, monto: number, tasa: number | null): number | null {
  if (!tasa || tasa <= 0) return null
  return moneda === 'USD' ? monto * tasa : monto / tasa
}

/** Lo que cuesta hoy, en Bs y en $, a la tasa dada. */
export function enAmbas(moneda: MonedaPorPagar, monto: number, tasa: number | null) {
  const otro = equivalente(moneda, monto, tasa)
  return moneda === 'USD' ? { bs: otro, usd: monto } : { bs: monto, usd: otro }
}
