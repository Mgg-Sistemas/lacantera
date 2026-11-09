import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fabricarMiniatura } from './fotosDeCarga'
import { desenvolver, rpc } from './rpc'

/**
 * Ventas › Registros de pagos: los depósitos que llegaron al banco y las notas
 * de entrega que cubre cada uno. No es Tesorería —no mueve saldos— ni cobra
 * notas: solo relaciona y muestra.
 *
 * Todo pasa por funciones de la base: la tabla de notas solo la leen Salidas y
 * Facturación, y quien entra por Ventas tiene que poder ver qué cubre un pago.
 * Los montos llegan como texto (PostgREST serializa `numeric` así).
 */

export type EstadoPago = 'CUADRA' | 'MINIMA' | 'DIFERENCIA' | 'SIN_NOTAS' | 'ANULADO'

export interface PagoBancario {
  id: number
  fecha: string
  moneda: string
  monto: string
  tasa: string | null
  monto_usd: string | null
  referencia: string | null
  descripcion: string | null
  registrado_en: string
  registrado_por_nombre: string | null
  anulado_en: string | null
  motivo_anulacion: string | null
  notas: number
  aplicado: string
  diferencia: string
  estado: EstadoPago
  numeros: string | null
  clientes: string | null
}

export interface NotaDePago {
  enlace_id: number
  nota_id: number
  numero: string
  fecha: string
  cliente: string | null
  moneda: string
  total: string
  total_bs: string | null
  total_usd: string | null
  en_moneda_del_pago: string
  monto_aplicado: string
  estado: string
  otros_pagos: number
}

export interface NotaCandidata {
  nota_id: number
  numero: string
  fecha: string
  cliente: string | null
  moneda: string
  total: string
  en_moneda_del_pago: string
  otros_pagos: number
}

export interface NotaSinPago {
  nota_id: number
  numero: string
  fecha: string
  cliente: string | null
  moneda: string
  total: string
  total_bs: string | null
  total_usd: string | null
  facturable: boolean
}

/** Una nota que recibe en sus pagos más de lo que vale. */
export interface NotaCubiertaDeMas {
  nota_id: number
  numero: string
  fecha: string
  cliente: string | null
  moneda: string
  total: string
  total_usd: string
  aplicado_usd: string
  pagos: number
}

/** Las notas de un período que no tienen ningún pago asociado: el otro lado del cierre. */
export const leerNotasSinPago = (desde: string, hasta: string) =>
  rpc<NotaSinPago[]>('notas_sin_pago_bancario', { p_desde: desde, p_hasta: hasta })

export interface FilaDePago {
  fecha: string
  moneda: string
  monto: number
  tasa?: number | null
  referencia?: string | null
  descripcion?: string | null
}

const CLAVE = ['pagos-bancarios'] as const

export function usePagosBancarios() {
  return useQuery({
    queryKey: [...CLAVE, 'lista'],
    queryFn: () => rpc<PagoBancario[]>('listar_pagos_bancarios', {}),
  })
}

export function useNotasCubiertasDeMas() {
  return useQuery({
    queryKey: [...CLAVE, 'cubiertas-de-mas'],
    queryFn: () => rpc<NotaCubiertaDeMas[]>('notas_cubiertas_de_mas_pago_bancario', {}),
    // Mientras la función no exista en la base, el aviso simplemente no sale.
    retry: false,
  })
}

export function useNotasDePago(pagoId: number | null) {
  return useQuery({
    queryKey: [...CLAVE, 'notas', pagoId],
    queryFn: () => rpc<NotaDePago[]>('notas_de_pago_bancario', { p_pago_id: pagoId }),
    enabled: pagoId != null,
  })
}

export function useNotasCandidatas(pagoId: number | null, texto: string) {
  return useQuery({
    queryKey: [...CLAVE, 'candidatas', pagoId, texto],
    queryFn: () =>
      rpc<NotaCandidata[]>('notas_candidatas_pago_bancario', {
        p_pago_id: pagoId,
        p_texto: texto.trim() || null,
      }),
    enabled: pagoId != null,
  })
}

function useAccionPagos<A, R = unknown>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CLAVE })
    },
  })
}

export function useGuardarPagoBancario() {
  return useAccionPagos((p: FilaDePago & { id?: number }) => {
    const args = {
      p_fecha: p.fecha,
      p_moneda: p.moneda,
      p_monto: p.monto,
      p_tasa: p.tasa ?? null,
      p_referencia: p.referencia || null,
      p_descripcion: p.descripcion || null,
    }
    return p.id
      ? rpc<unknown>('editar_pago_bancario', { p_id: p.id, ...args })
      : rpc<unknown>('registrar_pago_bancario', args)
  })
}

export function useImportarPagosBancarios() {
  return useAccionPagos((filas: FilaDePago[]) =>
    rpc<{ nuevos: number; repetidos: number }>('importar_pagos_bancarios', { p_filas: filas }),
  )
}

export function useAnularPagoBancario() {
  return useAccionPagos((a: { id: number; motivo: string }) =>
    rpc<void>('anular_pago_bancario', { p_id: a.id, p_motivo: a.motivo }),
  )
}

export function useAsociarNotas() {
  return useAccionPagos((a: { pagoId: number; notas: Array<{ nota_id: number; monto?: number }> }) =>
    rpc<void>('asociar_notas_a_pago_bancario', { p_pago_id: a.pagoId, p_notas: a.notas }),
  )
}

export function useCambiarMontoAplicado() {
  return useAccionPagos((a: { enlaceId: number; monto: number }) =>
    rpc<void>('cambiar_monto_aplicado_pago', { p_enlace_id: a.enlaceId, p_monto: a.monto }),
  )
}

export function useQuitarNotaDePago() {
  return useAccionPagos((enlaceId: number) =>
    rpc<void>('quitar_nota_de_pago_bancario', { p_enlace_id: enlaceId }),
  )
}

/*
  LA OBSERVACIÓN DE CADA PAGO (06/11/2026): la nota interna de quien concilia,
  aparte de la descripción del banco. Se lee directo de la tabla —Ventas ya la
  puede leer— para no cambiar la forma de `listar_pagos_bancarios`.
*/
export interface ObservacionPago {
  id: number
  observacion: string
  observacion_por: string | null
  observacion_en: string | null
}

export function useObservacionesDePagos() {
  return useQuery({
    queryKey: [...CLAVE, 'observaciones'],
    queryFn: async () =>
      desenvolver<ObservacionPago[]>(
        await supabase
          .from('pagos_bancarios')
          .select('id, observacion, observacion_por, observacion_en')
          .not('observacion', 'is', null),
      ),
  })
}

/** Texto vacío quita la observación; el cambio queda en la bitácora. */
export function useGuardarObservacionPago() {
  return useAccionPagos((a: { id: number; texto: string }) =>
    rpc<void>('guardar_observacion_pago', { p_id: a.id, p_texto: a.texto }),
  )
}

/*
  LOS COMPROBANTES DE CADA PAGO (06/11/2026).

  Christopher: «adjuntar el capture del pago efectuado y poner el monto de forma
  manual, para después asociarlo a la nota de entrega». Varios por pago (hasta
  seis), fotos o PDF. No van en el reporte PDF.

  El archivo va del navegador al depósito privado `comprobantes-pago`, colgado
  del número del pago (`<pago>/<uuid>.jpg`), y después se anota en la base. Si
  la subida falla, no queda anotado un comprobante que no existe. Quitar no
  borra el archivo: lo deja fuera de la vista, con quién, cuándo y por qué.

  Se guarda una miniatura al lado del original, como las fotos de carga, para
  que la lista no baje capturas enteras.
*/

export const MAXIMO_COMPROBANTES = 6
const DEPOSITO_COMPROBANTES = 'comprobantes-pago'
const miniaturaDe = (path: string) => `${path}.thumb.jpg`

export interface ComprobantePago {
  id: number
  pago_id: number
  path: string
  nombre: string | null
  tipo: string
  tamano: number | null
  subido_por: string
  subido_en: string
  quitado_por: string | null
  quitado_en: string | null
  motivo_quitado: string | null
}

/** Todos de una vez —una consulta por pantalla—: la lista los usa para el clip. */
export function useComprobantesDePagos() {
  return useQuery({
    queryKey: [...CLAVE, 'comprobantes'],
    queryFn: async () =>
      desenvolver<ComprobantePago[]>(
        await supabase.from('pagos_bancarios_comprobantes').select('*').order('subido_en'),
      ),
  })
}

export async function subirComprobantes(pagoId: number, archivos: File[]) {
  for (const archivo of archivos) {
    const extension = archivo.name.split('.').pop()?.toLowerCase() || 'bin'
    const ruta = `${pagoId}/${crypto.randomUUID()}.${extension}`
    const { error } = await supabase.storage
      .from(DEPOSITO_COMPROBANTES)
      .upload(ruta, archivo, { contentType: archivo.type, upsert: false })
    if (error) throw new Error(`No se pudo subir ${archivo.name}: ${error.message}`)

    if (archivo.type.startsWith('image/')) {
      try {
        const mini = await fabricarMiniatura(archivo)
        await supabase.storage
          .from(DEPOSITO_COMPROBANTES)
          .upload(miniaturaDe(ruta), mini, { contentType: 'image/jpeg', upsert: true })
      } catch {
        /* sin miniatura: mirarlo bajará el original */
      }
    }

    await rpc<number>('adjuntar_comprobante_pago', {
      p_pago_id: pagoId,
      p_path: ruta,
      p_nombre: archivo.name,
      p_tipo: archivo.type,
      p_tamano: archivo.size,
    })
  }
}

export function useSubirComprobantes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: { pagoId: number; archivos: File[] }) => subirComprobantes(a.pagoId, a.archivos),
    // Aunque falle a medias, los que sí entraron tienen que verse.
    onSettled: () => void qc.invalidateQueries({ queryKey: [...CLAVE, 'comprobantes'] }),
  })
}

export function useQuitarComprobante() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (q: { id: number; motivo: string }) =>
      rpc<void>('quitar_comprobante_pago', { p_id: q.id, p_motivo: q.motivo }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...CLAVE, 'comprobantes'] }),
  })
}

/** La miniatura guardada; lanza si no hay, para que quien llama baje el original. */
export async function miniaturaDeComprobante(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(DEPOSITO_COMPROBANTES)
    .createSignedUrl(miniaturaDe(path), 600)
  if (error || !data) throw new Error('No hay miniatura guardada.')
  return data.signedUrl
}

/** El archivo entero, tal cual. Para abrirlo con `abrirArchivo` sin enseñar su dirección. */
export async function bajarComprobante(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(DEPOSITO_COMPROBANTES).download(path)
  if (error || !data) throw new Error('No se pudo abrir el comprobante.')
  return data
}

/** El archivo entero, para pintarlo. Una URL de objeto que hay que revocar al terminar. */
export async function abrirComprobante(path: string): Promise<string> {
  return URL.createObjectURL(await bajarComprobante(path))
}
