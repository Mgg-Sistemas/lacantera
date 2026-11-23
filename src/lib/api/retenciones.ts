import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { rpc } from './rpc'

export type TipoImpuestoRetencion = 'IVA' | 'ISLR' | 'ISAE' | 'ESTADAL'
export type EstadoRetencion = 'REGISTRADA' | 'DECLARADA' | 'ANULADA'
export type OrigenRetencion = 'PAGO' | 'POST_PAGO'
export type EstadoReintegro = 'NO_APLICA' | 'PENDIENTE' | 'REINTEGRADO' | 'ANULADO'

export interface RetencionItem {
  id: number
  numero_comprobante: string // 14 caracteres: AAAAMMSSSSSSSS (G.O. 43.484, Art. 18.1)
  periodo: string // AAAAMM
  fecha_emision: string // YYYY-MM-DD
  fecha_entrega: string | null // YYYY-MM-DD (Art. 18.3)
  tipo_impuesto: TipoImpuestoRetencion
  estado: EstadoRetencion

  // Proveedor retenido
  proveedor_id: number
  proveedor_nombre: string
  proveedor_rif: string
  proveedor_email: string | null
  proveedor_direccion: string | null
  proveedor_telefono: string | null

  // Documento soporte (solo FACTURA)
  orden_id: number | null
  orden_numero: string | null
  factura_numero: string
  factura_control: string | null
  factura_fecha: string

  // Cifras fiscales
  moneda: string
  tasa: number
  total_factura: number
  monto_sin_derecho_credito_iva: number
  monto_exento: number
  base_imponible: number
  alicuota_pct: number
  impuesto_causado: number // IVA facturado o ISLR bruto antes de sustraendo (Art. 18.8)
  monto_retenido: number
  monto_retenido_bs: number
  monto_retenido_usd: number

  // Gestión de Reintegros (para retenciones post-pago)
  origen_retencion: OrigenRetencion
  estado_reintegro: EstadoReintegro
  reintegro_monto: number | null
  reintegro_fecha: string | null
  reintegro_cuenta_id: number | null
  reintegro_cuenta_nombre: string | null
  reintegro_referencia: string | null
  dias_espera_reintegro?: number

  observacion: string | null
  motivo_anulacion: string | null
  anulado_por_nombre: string | null
  anulado_en: string | null
  creado_en: string
  creado_por_nombre: string | null
}

export interface FacturaPendienteRetencion {
  orden_id: number
  orden_numero: string
  proveedor_id: number
  proveedor_nombre: string
  proveedor_rif: string
  proveedor_email: string | null
  proveedor_telefono: string | null
  factura_numero: string
  factura_control: string | null
  factura_fecha: string
  moneda: string
  tasa: number
  total: number
  base_imponible: number
  iva: number
  estado_orden: string
  ya_pagada: boolean
}

export interface ImpuestoParametro {
  tipo: TipoImpuestoRetencion
  nombre: string
  descripcion: string
  alicuota_defecto: number
  activo: boolean
}

export const IMPUESTOS_DISPONIBLES: ImpuestoParametro[] = [
  {
    tipo: 'IVA',
    nombre: 'Retención de IVA',
    descripcion: '75% o 100% del impuesto al valor agregado causado en la factura.',
    alicuota_defecto: 75,
    activo: true,
  },
  {
    tipo: 'ISLR',
    nombre: 'Retención de ISLR',
    descripcion: 'Impuesto sobre la renta por concepto (servicios 2%, fletes 3%, etc.).',
    alicuota_defecto: 2,
    activo: true,
  },
  {
    tipo: 'ISAE',
    nombre: 'Actividades Económicas (ISAE)',
    descripcion: 'Impuesto municipal sobre actividades económicas según ordenanza.',
    alicuota_defecto: 1,
    activo: true,
  },
]

// Almacenamiento local en memoria / fallback si las tablas de la base aún no se han migrado
const CLAVE_LOCAL_RETENCIONES = 'lacantera_retenciones_cache_v1'

function obtenerLocales(): RetencionItem[] {
  try {
    const raw = localStorage.getItem(CLAVE_LOCAL_RETENCIONES)
    if (!raw) return []
    return JSON.parse(raw) as RetencionItem[]
  } catch {
    return []
  }
}

function guardarLocales(items: RetencionItem[]): void {
  try {
    localStorage.setItem(CLAVE_LOCAL_RETENCIONES, JSON.stringify(items))
  } catch {
    // ignorar fallo de almacenamiento local
  }
}

// Generador de correlativo local R14 si la base no responde aún
function generarNumeroR14Local(fechaStr: string, locales: RetencionItem[]): string {
  const d = new Date(fechaStr || Date.now())
  const aaaa = d.getFullYear().toString()
  const mm = (d.getMonth() + 1).toString().padStart(2, '0')
  const anioMes = `${aaaa}${mm}`
  const delMes = locales.filter((r) => r.numero_comprobante.startsWith(anioMes))
  const sec = (delMes.length + 1).toString().padStart(8, '0')
  return `${anioMes}${sec}`
}

export function useRetenciones(filtro?: {
  tipo?: string
  estado?: string
  busqueda?: string
  proveedor_id?: number
  orden_id?: number
}) {
  return useQuery({
    queryKey: ['retenciones', filtro],
    queryFn: async (): Promise<RetencionItem[]> => {
      try {
        let query = supabase.from('v_retenciones').select('*').order('id', { ascending: false })
        if (filtro?.tipo && filtro.tipo !== 'TODOS') {
          query = query.eq('tipo_impuesto', filtro.tipo)
        }
        if (filtro?.estado && filtro.estado !== 'TODOS') {
          query = query.eq('estado', filtro.estado)
        }
        if (filtro?.proveedor_id) {
          query = query.eq('proveedor_id', filtro.proveedor_id)
        }
        if (filtro?.orden_id) {
          query = query.eq('orden_id', filtro.orden_id)
        }
        const res = await query
        if (!res.error && res.data) {
          return res.data as RetencionItem[]
        }
      } catch {
        // En espera de migración de base
      }

      // Fallback a almacenamiento local para trabajo seguro en desarrollo
      let items = obtenerLocales()
      if (filtro?.tipo && filtro.tipo !== 'TODOS') {
        items = items.filter((i) => i.tipo_impuesto === filtro.tipo)
      }
      if (filtro?.estado && filtro.estado !== 'TODOS') {
        items = items.filter((i) => i.estado === filtro.estado)
      }
      if (filtro?.proveedor_id) {
        items = items.filter((i) => i.proveedor_id === filtro.proveedor_id)
      }
      if (filtro?.orden_id) {
        items = items.filter((i) => i.orden_id === filtro.orden_id)
      }
      if (filtro?.busqueda) {
        const q = filtro.busqueda.toLowerCase()
        items = items.filter(
          (i) =>
            i.numero_comprobante.toLowerCase().includes(q) ||
            i.proveedor_nombre.toLowerCase().includes(q) ||
            i.proveedor_rif.toLowerCase().includes(q) ||
            i.factura_numero.toLowerCase().includes(q),
        )
      }
      return items
    },
  })
}

export function useColaRetenciones() {
  return useQuery({
    queryKey: ['retenciones', 'cola-por-retener'],
    queryFn: async (): Promise<FacturaPendienteRetencion[]> => {
      const locales = obtenerLocales()
      const retenidasOrdenIds = new Set(
        locales.filter((r) => r.estado !== 'ANULADA' && r.orden_id).map((r) => r.orden_id),
      )

      // Buscar compras con comprobante_tipo = 'FACTURA'
      try {
        const res = await supabase
          .from('compras_ordenes')
          .select('id, numero, proveedor_id, total, iva, tasa, comprobante_tipo, estado, factura_nombre, proveedores(nombre, rif, email, telefono)')
          .eq('comprobante_tipo', 'FACTURA')
          .neq('estado', 'CANCELADA')
          .order('id', { ascending: false })
          .limit(50)

        if (!res.error && res.data) {
          return res.data
            .filter((r: any) => !retenidasOrdenIds.has(r.id))
            .map((r: any) => {
              const yaPagada = ['PAGADA', 'RECIBIDA'].includes(r.estado)
              const prov = r.proveedores ?? {}
              const total = Number(r.total) || 0
              const iva = Number(r.iva) || 0
              const base = Math.max(total - iva, 0)
              return {
                orden_id: r.id,
                orden_numero: r.numero,
                proveedor_id: r.proveedor_id,
                proveedor_nombre: prov.nombre || `Proveedor #${r.proveedor_id}`,
                proveedor_rif: prov.rif || 'J-00000000-0',
                proveedor_email: prov.email || null,
                proveedor_telefono: prov.telefono || null,
                factura_numero: r.factura_nombre || `F-${r.numero}`,
                factura_control: null,
                factura_fecha: new Date().toISOString().slice(0, 10),
                moneda: 'USD',
                tasa: Number(r.tasa) || 1,
                total,
                base_imponible: base,
                iva,
                estado_orden: r.estado,
                ya_pagada: yaPagada,
              }
            })
        }
      } catch {
        // En espera de conexión viva
      }
      return []
    },
  })
}

export function useReintegrosPendientes(filtro?: { proveedor_id?: number }) {
  const q = useRetenciones({ estado: 'REGISTRADA', proveedor_id: filtro?.proveedor_id })
  const reintegros = (q.data ?? [])
    .filter((r) => r.estado_reintegro === 'PENDIENTE')
    .map((r) => {
      const emision = new Date(r.fecha_emision).getTime()
      const hoy = Date.now()
      const dias = Math.max(0, Math.floor((hoy - emision) / 86_400_000))
      return {
        ...r,
        dias_espera_reintegro: dias,
      }
    })
  return {
    ...q,
    data: reintegros,
  }
}

export interface RegistrarRetencionInput {
  orden_id?: number | null
  orden_numero?: string | null
  proveedor_id: number
  proveedor_nombre: string
  proveedor_rif: string
  proveedor_email?: string | null
  proveedor_direccion?: string | null
  proveedor_telefono?: string | null

  factura_numero: string
  factura_control?: string | null
  factura_fecha: string
  fecha_emision: string
  fecha_entrega?: string | null // G.O. 43.484 Art. 18.3

  tipo_impuesto: TipoImpuestoRetencion
  moneda: string
  tasa: number
  total_factura: number
  monto_sin_derecho_credito_iva?: number
  monto_exento?: number
  base_imponible: number
  alicuota_pct: number
  impuesto_causado: number
  monto_retenido: number

  ya_pagada: boolean
  observacion?: string | null
}

export function useRegistrarRetencion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: RegistrarRetencionInput) => {
      try {
        const res = await rpc<number>('retenciones_registrar_practicada', {
          p_datos: input,
        })
        if (res) return res
      } catch {
        // Modo local mientras se migra el SQL en la base
      }

      // Registro local en caché para pruebas inmediatas
      const locales = obtenerLocales()
      const numComp = generarNumeroR14Local(input.fecha_emision, locales)
      const aaaa = new Date(input.fecha_emision).getFullYear().toString()
      const mm = (new Date(input.fecha_emision).getMonth() + 1).toString().padStart(2, '0')

      const nueva: RetencionItem = {
        id: Date.now(),
        numero_comprobante: numComp,
        periodo: `${aaaa}${mm}`,
        fecha_emision: input.fecha_emision,
        fecha_entrega: input.fecha_entrega || null,
        tipo_impuesto: input.tipo_impuesto,
        estado: 'REGISTRADA',
        proveedor_id: input.proveedor_id,
        proveedor_nombre: input.proveedor_nombre,
        proveedor_rif: input.proveedor_rif,
        proveedor_email: input.proveedor_email || null,
        proveedor_direccion: input.proveedor_direccion || null,
        proveedor_telefono: input.proveedor_telefono || null,
        orden_id: input.orden_id ?? null,
        orden_numero: input.orden_numero ?? null,
        factura_numero: input.factura_numero,
        factura_control: input.factura_control || null,
        factura_fecha: input.factura_fecha,
        moneda: input.moneda,
        tasa: input.tasa,
        total_factura: input.total_factura,
        monto_sin_derecho_credito_iva: input.monto_sin_derecho_credito_iva ?? 0,
        monto_exento: input.monto_exento ?? 0,
        base_imponible: input.base_imponible,
        alicuota_pct: input.alicuota_pct,
        impuesto_causado: input.impuesto_causado,
        monto_retenido: input.monto_retenido,
        monto_retenido_bs: Math.round(input.monto_retenido * input.tasa * 100) / 100,
        monto_retenido_usd: input.moneda === 'USD' ? input.monto_retenido : Math.round((input.monto_retenido / input.tasa) * 100) / 100,
        origen_retencion: input.ya_pagada ? 'POST_PAGO' : 'PAGO',
        estado_reintegro: input.ya_pagada ? 'PENDIENTE' : 'NO_APLICA',
        reintegro_monto: input.ya_pagada ? input.monto_retenido : null,
        reintegro_fecha: null,
        reintegro_cuenta_id: null,
        reintegro_cuenta_nombre: null,
        reintegro_referencia: null,
        observacion: input.observacion || null,
        motivo_anulacion: null,
        anulado_por_nombre: null,
        anulado_en: null,
        creado_en: new Date().toISOString(),
        creado_por_nombre: 'Usuario Actual',
      }

      locales.unshift(nueva)
      guardarLocales(locales)
      return nueva.id
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['retenciones'] })
      void qc.invalidateQueries({ queryKey: ['compras'] })
    },
  })
}

export interface RegistrarReintegroInput {
  retencion_id: number
  cuenta_id: number
  cuenta_nombre?: string
  monto: number
  fecha: string
  referencia: string
  nota?: string | null
}

export function useRegistrarReintegro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: RegistrarReintegroInput) => {
      try {
        await rpc('retenciones_registrar_reintegro', {
          p_retencion_id: input.retencion_id,
          p_cuenta_id: input.cuenta_id,
          p_monto: input.monto,
          p_fecha: input.fecha,
          p_referencia: input.referencia,
          p_nota: input.nota || null,
        })
        return true
      } catch {
        // En espera de migración de base
      }

      const locales = obtenerLocales()
      const idx = locales.findIndex((r) => r.id === input.retencion_id)
      if (idx >= 0) {
        locales[idx].estado_reintegro = 'REINTEGRADO'
        locales[idx].reintegro_fecha = input.fecha
        locales[idx].reintegro_referencia = input.referencia
        locales[idx].reintegro_cuenta_id = input.cuenta_id
        locales[idx].reintegro_cuenta_nombre = input.cuenta_nombre ?? `Cuenta #${input.cuenta_id}`
        guardarLocales(locales)
      }
      return true
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['retenciones'] })
      void qc.invalidateQueries({ queryKey: ['tesoreria'] })
    },
  })
}

export function useAnularRetencion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: number; motivo: string }) => {
      try {
        await rpc('retenciones_anular', {
          p_id: v.id,
          p_motivo: v.motivo,
        })
        return true
      } catch {
        // Fallback local
      }

      const locales = obtenerLocales()
      const idx = locales.findIndex((r) => r.id === v.id)
      if (idx >= 0) {
        locales[idx].estado = 'ANULADA'
        locales[idx].motivo_anulacion = v.motivo
        locales[idx].anulado_en = new Date().toISOString()
        locales[idx].anulado_por_nombre = 'Usuario Actual'
        if (locales[idx].estado_reintegro === 'PENDIENTE') {
          locales[idx].estado_reintegro = 'ANULADO'
        }
        guardarLocales(locales)
      }
      return true
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['retenciones'] })
    },
  })
}
