/*
  PROVIDENCIA SNAT/2026/00093 · lo que va contra la base.

  - La emisión en el Portal SENIAT (o en contingencia) de cada documento fiscal.
  - Las notas de débito.
  - Los comprobantes de retención (solo si la empresa es agente de retención).
  - La configuración fiscal de la ficha de la empresa.

  La migración `20261123160000_providencia_snat_2026_00093.sql` se aplica
  aparte, contra Supabase. Mientras no esté, las lecturas devuelven vacío y la
  pantalla lo dice («falta aplicar la migración»), en vez de romperse.
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { enCastellano } from '@/lib/castellano'
import { useEmpresa } from './empresa'
import { VIGENCIA_PROVIDENCIA, providenciaVigente, type MedioEmision } from '@/lib/fiscal/providencia'

const BUCKET = 'documentos-seniat'

/**
 * Llama a una función de la base. Si la función no existe todavía (migración
 * sin aplicar) lo dice con palabras; si no, el mensaje de la casa.
 */
async function llamar<T = unknown>(nombre: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nombre, args)
  if (error) {
    if (faltaMigracion(error)) throw new Error(AVISO_MIGRACION)
    throw new Error(enCastellano(error))
  }
  return data as T
}

export type DocumentoFiscal = 'FACTURA' | 'NOTA_CREDITO' | 'NOTA_DEBITO'

export interface EmisionSeniat {
  id: number
  documento: DocumentoFiscal
  documento_id: number
  medio: MedioEmision
  numero: string
  numero_control: string
  emitida_en: string
  archivo_path: string | null
  archivo_nombre: string | null
  contingencia_enviada_en: string | null
  registrado_en: string
}

/** Tabla o vista que todavía no existe: la migración no se ha aplicado. */
export function faltaMigracion(error: unknown): boolean {
  const e = error as Partial<PostgrestError> | null
  if (!e) return false
  return (
    e.code === '42P01' ||
    e.code === 'PGRST205' ||
    e.code === 'PGRST202' ||
    e.code === '42883' ||
    /does not exist|Could not find the (table|function)|schema cache/i.test(e.message ?? '')
  )
}

export const AVISO_MIGRACION =
  'Falta aplicar en la base la migración «Providencia SNAT/2026/00093» (20261123160000). Hasta entonces esta función no está disponible.'

// ---------------------------------------------------------------------------
// Configuración fiscal de la empresa
// ---------------------------------------------------------------------------
export interface ConfigFiscal {
  agenteRetencion: boolean
  imprentaProvidenciaFecha: string | null
  vigenteDesde: string
  /** Si la Providencia ya rige hoy. */
  vigente: boolean
}

export function useConfigFiscal(): ConfigFiscal {
  const { data } = useEmpresa()
  const e = data as
    | (Record<string, unknown> & {
        agente_retencion?: boolean | null
        imprenta_providencia_fecha?: string | null
        providencia_vigente_desde?: string | null
      })
    | undefined
  const vigenteDesde = e?.providencia_vigente_desde || VIGENCIA_PROVIDENCIA
  return {
    agenteRetencion: Boolean(e?.agente_retencion),
    imprentaProvidenciaFecha: e?.imprenta_providencia_fecha ?? null,
    vigenteDesde,
    vigente: providenciaVigente(vigenteDesde),
  }
}

export function useGuardarConfigFiscal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (c: {
      agente_retencion: boolean
      imprenta_providencia_fecha: string | null
      providencia_vigente_desde: string | null
    }) =>
      llamar<void>('guardar_config_fiscal', {
        p_agente_retencion: c.agente_retencion,
        p_imprenta_providencia_fecha: c.imprenta_providencia_fecha || null,
        p_providencia_vigente_desde: c.providencia_vigente_desde || null,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['empresa'] }),
  })
}

// ---------------------------------------------------------------------------
// Emisiones en el Portal SENIAT
// ---------------------------------------------------------------------------
export function useEmisionesSeniat(documento?: DocumentoFiscal) {
  return useQuery({
    queryKey: ['seniat', 'emisiones', documento ?? 'todas'],
    queryFn: async () => {
      let q = supabase.from('emisiones_seniat').select('*')
      if (documento) q = q.eq('documento', documento)
      const { data, error } = await q
      if (error) {
        if (faltaMigracion(error)) return { lista: [] as EmisionSeniat[], migracionPendiente: true }
        throw error
      }
      return { lista: (data ?? []) as EmisionSeniat[], migracionPendiente: false }
    },
    staleTime: 30_000,
  })
}

/** Índice por id de documento, para pintar listas sin buscar fila por fila. */
export function useEmisionesPorDocumento(documento: DocumentoFiscal) {
  const q = useEmisionesSeniat(documento)
  const mapa = new Map<number, EmisionSeniat>()
  for (const e of q.data?.lista ?? []) mapa.set(e.documento_id, e)
  return { mapa, migracionPendiente: q.data?.migracionPendiente ?? false, isPending: q.isPending }
}

export function useRegistrarEmisionSeniat() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (e: {
      documento: DocumentoFiscal
      documento_id: number
      medio: MedioEmision
      numero: string
      numero_control: string
      emitida_en: string
      archivo?: File | null
    }) => {
      let ruta: string | null = null
      if (e.archivo) {
        if (e.archivo.size > 10 * 1024 * 1024) throw new Error('El archivo supera los 10 MB.')
        const extension = e.archivo.name.split('.').pop()?.toLowerCase() ?? 'pdf'
        ruta = `${e.documento.toLowerCase()}/${e.documento_id}/${Date.now()}.${extension}`
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(ruta, e.archivo, { contentType: e.archivo.type, upsert: false })
        if (error) throw error
      }
      try {
        return await llamar<number>('registrar_emision_seniat', {
          p_documento: e.documento,
          p_documento_id: e.documento_id,
          p_medio: e.medio,
          p_numero: e.numero.trim(),
          p_numero_control: e.numero_control.trim(),
          p_emitida_en: e.emitida_en,
          p_archivo_path: ruta,
          p_archivo_nombre: e.archivo?.name ?? null,
        })
      } catch (err) {
        if (ruta) await supabase.storage.from(BUCKET).remove([ruta])
        if (faltaMigracion(err)) throw new Error(AVISO_MIGRACION)
        throw err
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['seniat'] })
      void qc.invalidateQueries({ queryKey: ['ventas', 'libro'] })
    },
  })
}

export function useMarcarContingenciaEnviada() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => llamar<void>('marcar_contingencia_enviada', { p_id: id }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['seniat'] }),
  })
}

export async function urlArchivoSeniat(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300)
  if (error) throw error
  return data.signedUrl
}

// ---------------------------------------------------------------------------
// Notas de débito
// ---------------------------------------------------------------------------
export interface RenglonNotaDebito {
  descripcion: string
  monto: number
  exento_iva: boolean
}

export interface NotaDebito {
  id: number
  numero: string
  numero_control: string
  factura_id: number
  cliente_id: number
  fecha: string
  motivo: string
  moneda: string
  tasa: string
  tasa_usd: string
  alicuota_iva: string
  renglones: RenglonNotaDebito[]
  exento: string
  base_imponible: string
  iva: string
  total: string
  total_bs: string
  total_usd: string
  estado: 'EMITIDA' | 'ANULADA'
  motivo_anulacion: string | null
  emitida_en: string
  cliente: string
  cliente_rif: string
  cliente_direccion: string | null
  factura_numero: string
  factura_control: string
  factura_fecha: string
  factura_total: string
}

export function useNotasDebito() {
  return useQuery({
    queryKey: ['seniat', 'notas-debito'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_notas_debito')
        .select('*')
        .order('fecha', { ascending: false })
        .order('id', { ascending: false })
      if (error) {
        if (faltaMigracion(error)) return { lista: [] as NotaDebito[], migracionPendiente: true }
        throw error
      }
      return { lista: (data ?? []) as NotaDebito[], migracionPendiente: false }
    },
  })
}

function useAccionDebito<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: A) => {
      try {
        return await fn(a)
      } catch (err) {
        if (faltaMigracion(err)) throw new Error(AVISO_MIGRACION)
        throw err
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['seniat'] })
      void qc.invalidateQueries({ queryKey: ['ventas', 'libro'] })
    },
  })
}

export function useEmitirNotaDebito() {
  return useAccionDebito(
    (n: { factura_id: number; motivo: string; renglones: RenglonNotaDebito[]; fecha?: string | null }) =>
      llamar<number>('emitir_nota_debito', {
        p_factura_id: n.factura_id,
        p_motivo: n.motivo,
        p_renglones: n.renglones,
        p_fecha: n.fecha || null,
      }),
  )
}

export function useAnularNotaDebito() {
  return useAccionDebito((n: { id: number; motivo: string }) =>
    llamar<void>('anular_nota_debito', { p_id: n.id, p_motivo: n.motivo }),
  )
}

// ---------------------------------------------------------------------------
// Comprobantes de retención (Art. 18)
// ---------------------------------------------------------------------------
export interface ComprobanteRetencion {
  id: number
  numero: string
  tipo: 'IVA' | 'ISLR'
  factura_compra_id: number
  periodo: string
  fecha_emision: string
  monto_retenido: string
  emitido_en: string
}

export function useComprobantesRetencion(facturaCompraId: number | null) {
  return useQuery({
    queryKey: ['seniat', 'comprobantes', facturaCompraId],
    enabled: facturaCompraId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comprobantes_retencion')
        .select('*')
        .eq('factura_compra_id', facturaCompraId!)
      if (error) {
        if (faltaMigracion(error)) return [] as ComprobanteRetencion[]
        throw error
      }
      return (data ?? []) as ComprobanteRetencion[]
    },
  })
}

export function useEmitirComprobanteRetencion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: { factura_compra_id: number; tipo: 'IVA' | 'ISLR'; fecha?: string | null }) => {
      try {
        return await llamar<string>('emitir_comprobante_retencion', {
          p_factura_compra_id: c.factura_compra_id,
          p_tipo: c.tipo,
          p_fecha: c.fecha || null,
        })
      } catch (err) {
        if (faltaMigracion(err)) throw new Error(AVISO_MIGRACION)
        throw err
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['seniat', 'comprobantes'] }),
  })
}
