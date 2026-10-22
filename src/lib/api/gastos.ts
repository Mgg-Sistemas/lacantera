import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver, rpc } from './rpc'

/*
  GASTOS: LA FACTURA FÍSICA, TRANSCRITA Y CATEGORIZADA.

  Christopher, 22/10/2026: un sitio para cargar la factura física (escaneo o
  foto), transcribirla con una observación de para qué se usó lo comprado, y
  un informe de gasto por categoría. Es bitácora, no contabilidad: no mueve
  ninguna cuenta de Tesorería. Nace aparte de Centro de Costo, que está en
  evaluación de cambiar o eliminarse — este módulo no depende de su suerte.

  Una factura ya registrada no se corrige: se anula con motivo y queda a la
  vista tachada, igual que una orden de mantenimiento anulada.
*/

export interface CategoriaDeGasto {
  codigo: string
  nombre: string
  orden: number
  activa: boolean
}

export function useCategoriasDeGasto() {
  return useQuery({
    queryKey: ['gastos-categorias'],
    queryFn: async () =>
      desenvolver<CategoriaDeGasto[]>(
        await supabase.from('gastos_categorias').select('*').order('orden').order('nombre'),
      ),
    staleTime: 5 * 60_000,
  })
}

/** Las opciones del desplegable, solo las encendidas. */
export function opcionesDeCategoriaDeGasto(categorias: CategoriaDeGasto[] | undefined) {
  return (categorias ?? [])
    .filter((c) => c.activa)
    .map((c) => ({ valor: c.codigo, etiqueta: c.nombre }))
}

export function useGuardarCategoriaDeGasto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (c: { codigo: string; nombre: string; activa: boolean }) =>
      rpc<void>('guardar_categoria_de_gasto', {
        p_codigo: c.codigo,
        p_nombre: c.nombre,
        p_activa: c.activa,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['gastos-categorias'] }),
  })
}

export function useEliminarCategoriaDeGasto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (codigo: string) => rpc<void>('eliminar_categoria_de_gasto', { p_codigo: codigo }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['gastos-categorias'] }),
  })
}

export interface GastoFactura {
  id: number
  numero: string | null
  fecha: string
  proveedor: string
  documento_proveedor: string | null
  numero_factura: string | null
  categoria: string
  categoria_nombre: string
  moneda: string
  monto: string
  observacion: string
  registrado_por: string
  registrado_por_nombre: string | null
  registrado_en: string
  anulada_en: string | null
  anulada_por: string | null
  anulada_por_nombre: string | null
  motivo_anulacion: string | null
}

/** El historial completo, más reciente primero. Se filtra en pantalla. */
export function useGastos() {
  return useQuery({
    queryKey: ['gastos'],
    queryFn: async () =>
      desenvolver<GastoFactura[]>(
        await supabase
          .from('v_gastos_facturas')
          .select('*')
          .order('fecha', { ascending: false })
          .order('registrado_en', { ascending: false }),
      ),
  })
}

export interface DatosDeGasto {
  fecha: string
  proveedor: string
  categoria: string
  moneda: string
  monto: number
  observacion: string
  documento_proveedor?: string | null
  numero_factura?: string | null
}

/** Registra la factura y devuelve su número (GTO-AAAA-NNNN), para colgarle la foto. */
export function useRegistrarGasto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: DatosDeGasto) =>
      rpc<string>('registrar_gasto', {
        p_fecha: d.fecha,
        p_proveedor: d.proveedor,
        p_categoria: d.categoria,
        p_moneda: d.moneda,
        p_monto: d.monto,
        p_observacion: d.observacion,
        p_documento_proveedor: d.documento_proveedor || null,
        p_numero_factura: d.numero_factura || null,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['gastos'] }),
  })
}

export function useAnularGasto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: { id: number; motivo: string }) =>
      rpc<void>('anular_gasto', { p_id: a.id, p_motivo: a.motivo }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['gastos'] }),
  })
}

export interface GastoPorCategoria {
  categoria: string
  categoria_nombre: string
  moneda: string
  monto: string
  cantidad: number
}

/**
 * El gasto por categoría, en un rango de fechas libre.
 *
 * Nunca se suma entre monedas — la misma regla que Tesorería—: cada fila es
 * una categoría EN una moneda, nunca una mezcla de las dos.
 */
export function useInformeGastosPorCategoria(desde: string | null, hasta: string | null) {
  return useQuery({
    queryKey: ['gastos-informe', desde, hasta],
    queryFn: () =>
      rpc<GastoPorCategoria[]>('informe_gastos_por_categoria', {
        p_desde: desde,
        p_hasta: hasta,
      }),
  })
}
