import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/**
 * Prestaciones sociales.
 *
 * La cuenta de lo que la empresa le debe a cada quien. Solo mueve tesorería
 * cuando el dinero sale de verdad —un anticipo o una liquidación—, así que esas
 * dos acciones invalidan también el libro.
 */

export interface Prestacion {
  empleado_id: number
  ficha: string
  cedula: string
  nombre: string
  cargo: string
  departamento: string | null
  fecha_ingreso: string
  fecha_egreso: string | null
  activo: boolean
  moneda: string
  fecha_corte: string | null
  corte_garantia: string
  corte_dias: string
  corte_intereses: string
  corte_anticipos: string
  depositado: string
  dias_depositados: string
  trimestres: number
  ultimo_trimestre: number | null
  intereses_abonados: string
  anticipos: string
  garantia: string
  intereses: string
  dias_acumulados: string
  saldo: string
  disponible_anticipo: string
  liquidado: boolean
}

export interface DepositoPrestaciones {
  id: number
  empleado_id: number
  ficha: string
  nombre: string
  anio: number
  trimestre: number
  fecha: string
  dias: string
  dias_adicionales: string
  salario_normal_diario: string
  salario_integral_diario: string
  moneda: string
  monto: string
  monto_usd: string
  estimado: boolean
  estado: string
  motivo_anulacion: string | null
}

export interface AnticipoPrestaciones {
  id: number
  numero: string
  empleado_id: number
  ficha: string
  nombre: string
  fecha: string
  motivo: string
  detalle: string | null
  cuenta: string | null
  moneda: string
  monto: string
  monto_usd: string
  referencia: string | null
  estado: string
  motivo_anulacion: string | null
}

export interface Liquidacion {
  id: number
  numero: string
  empleado_id: number
  ficha: string
  cedula: string
  nombre: string
  cargo: string
  fecha_ingreso: string
  fecha_egreso: string
  motivo: string
  anios_servicio: string
  dias_servicio: number
  moneda: string
  salario_normal_diario: string
  salario_integral_diario: string
  garantia_acumulada: string
  retroactivo_30_dias: string
  base_prestaciones: string
  intereses: string
  anticipos: string
  vacaciones_dias: string
  vacaciones_monto: string
  bono_vacacional_dias: string
  bono_vacacional_monto: string
  utilidades_dias: string
  utilidades_monto: string
  indemnizacion: string
  otras_asignaciones: string
  otras_deducciones: string
  total: string
  total_usd: string
  observacion: string | null
  estado: string
  cuenta: string | null
  referencia: string | null
  motivo_anulacion: string | null
  calculada_en: string
}

export interface TasaPrestaciones {
  anio: number
  mes: number
  tasa: string
  fuente: string | null
  registrada_en: string
}

export const MOTIVOS_ANTICIPO = [
  { valor: 'VIVIENDA', etiqueta: 'Vivienda' },
  { valor: 'SALUD', etiqueta: 'Salud' },
  { valor: 'EDUCACION', etiqueta: 'Educación' },
  { valor: 'PENSION_ALIMENTARIA', etiqueta: 'Pensión alimentaria' },
  { valor: 'OTRO', etiqueta: 'Otro' },
]

export const MOTIVOS_EGRESO = [
  { valor: 'RENUNCIA', etiqueta: 'Renuncia' },
  { valor: 'DESPIDO_INJUSTIFICADO', etiqueta: 'Despido injustificado' },
  { valor: 'DESPIDO_JUSTIFICADO', etiqueta: 'Despido justificado' },
  { valor: 'CONTRATO_VENCIDO', etiqueta: 'Contrato vencido' },
  { valor: 'JUBILACION', etiqueta: 'Jubilación' },
  { valor: 'FALLECIMIENTO', etiqueta: 'Fallecimiento' },
]

function useAccion<A, R = unknown>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['prestaciones'] })
      void qc.invalidateQueries({ queryKey: ['tesoreria'] })
      void qc.invalidateQueries({ queryKey: ['empleados'] })
    },
  })
}

export function usePrestaciones() {
  return useQuery({
    queryKey: ['prestaciones', 'cuentas'],
    queryFn: async () =>
      desenvolver<Prestacion[]>(
        await supabase.from('v_prestaciones').select('*').order('nombre'),
      ),
  })
}

export function useDepositos(empleadoId: number | null) {
  return useQuery({
    queryKey: ['prestaciones', 'depositos', empleadoId],
    enabled: empleadoId !== null,
    queryFn: async () =>
      desenvolver<DepositoPrestaciones[]>(
        await supabase
          .from('v_prestaciones_depositos')
          .select('*')
          .eq('empleado_id', empleadoId!)
          .order('anio', { ascending: false })
          .order('trimestre', { ascending: false }),
      ),
  })
}

export function useAnticipos(empleadoId?: number | null) {
  return useQuery({
    queryKey: ['prestaciones', 'anticipos', empleadoId ?? 'todos'],
    queryFn: async () => {
      let q = supabase.from('v_prestaciones_anticipos').select('*')
      if (empleadoId) q = q.eq('empleado_id', empleadoId)
      return desenvolver<AnticipoPrestaciones[]>(
        await q.order('fecha', { ascending: false }).order('id', { ascending: false }),
      )
    },
  })
}

export function useLiquidaciones() {
  return useQuery({
    queryKey: ['prestaciones', 'liquidaciones'],
    queryFn: async () =>
      desenvolver<Liquidacion[]>(
        await supabase
          .from('v_liquidaciones')
          .select('*')
          .order('fecha_egreso', { ascending: false })
          .order('id', { ascending: false }),
      ),
  })
}

export function useTasasPrestaciones() {
  return useQuery({
    queryKey: ['prestaciones', 'tasas'],
    queryFn: async () =>
      desenvolver<TasaPrestaciones[]>(
        await supabase
          .from('prestaciones_tasas')
          .select('*')
          .order('anio', { ascending: false })
          .order('mes', { ascending: false })
          .limit(36),
      ),
  })
}

export function useGuardarCorte() {
  return useAccion(
    (c: {
      empleado_id: number
      fecha_corte: string
      garantia: number
      dias: number
      intereses: number
      anticipos: number
      moneda: string
      nota?: string | null
    }) =>
      rpc('guardar_corte_prestaciones', {
        p_empleado_id: c.empleado_id,
        p_fecha_corte: c.fecha_corte,
        p_garantia: c.garantia,
        p_dias: c.dias,
        p_intereses: c.intereses,
        p_anticipos: c.anticipos,
        p_moneda: c.moneda,
        p_nota: c.nota ?? null,
      }),
  )
}

export function useCalcularTrimestre() {
  return useAccion((t: { anio: number; trimestre: number }) =>
    rpc<number>('calcular_trimestre_prestaciones', {
      p_anio: t.anio,
      p_trimestre: t.trimestre,
    }),
  )
}

export function useAnularDeposito() {
  return useAccion((a: { id: number; motivo: string }) =>
    rpc('anular_deposito_prestaciones', { p_id: a.id, p_motivo: a.motivo }),
  )
}

export function useGuardarTasaPrestaciones() {
  return useAccion((t: { anio: number; mes: number; tasa: number; fuente?: string | null }) =>
    rpc('guardar_tasa_prestaciones', {
      p_anio: t.anio,
      p_mes: t.mes,
      p_tasa: t.tasa,
      p_fuente: t.fuente ?? null,
    }),
  )
}

export function useCalcularIntereses() {
  return useAccion((m: { anio: number; mes: number }) =>
    rpc<number>('calcular_intereses_prestaciones', { p_anio: m.anio, p_mes: m.mes }),
  )
}

export function useRegistrarAnticipo() {
  return useAccion(
    (a: {
      empleado_id: number
      monto: number
      motivo: string
      cuenta_id?: number | null
      fecha?: string | null
      detalle?: string | null
      referencia?: string | null
    }) =>
      rpc<number>('registrar_anticipo_prestaciones', {
        p_empleado_id: a.empleado_id,
        p_monto: a.monto,
        p_motivo: a.motivo,
        p_cuenta_id: a.cuenta_id ?? null,
        p_fecha: a.fecha ?? null,
        p_detalle: a.detalle ?? null,
        p_referencia: a.referencia ?? null,
      }),
  )
}

export function useAnularAnticipo() {
  return useAccion((a: { id: number; motivo: string }) =>
    rpc('anular_anticipo_prestaciones', { p_id: a.id, p_motivo: a.motivo }),
  )
}

export function useCalcularLiquidacion() {
  return useAccion(
    (l: {
      empleado_id: number
      fecha_egreso: string
      motivo: string
      otras_asignaciones?: number
      otras_deducciones?: number
      observacion?: string | null
    }) =>
      rpc<number>('calcular_liquidacion', {
        p_empleado_id: l.empleado_id,
        p_fecha_egreso: l.fecha_egreso,
        p_motivo: l.motivo,
        p_otras_asignaciones: l.otras_asignaciones ?? 0,
        p_otras_deducciones: l.otras_deducciones ?? 0,
        p_observacion: l.observacion ?? null,
      }),
  )
}

export function usePagarLiquidacion() {
  return useAccion(
    (p: { id: number; cuenta_id: number; fecha?: string | null; referencia?: string | null }) =>
      rpc('pagar_liquidacion', {
        p_id: p.id,
        p_cuenta_id: p.cuenta_id,
        p_fecha: p.fecha ?? null,
        p_referencia: p.referencia ?? null,
      }),
  )
}

export function useAnularLiquidacion() {
  return useAccion((a: { id: number; motivo: string }) =>
    rpc('anular_liquidacion', { p_id: a.id, p_motivo: a.motivo }),
  )
}
