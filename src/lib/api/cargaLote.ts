import { useMutation, useQueryClient } from '@tanstack/react-query'
import { rpc } from '@/lib/api/rpc'
import type { FilaDeHoja } from '@/lib/hojas/leerHoja'

/*
  CARGAR UNA PLANILLA ENTERA

  Dos pasadas contra la misma función de la base. La primera solo mira y
  devuelve el informe; la segunda escribe. Es deliberadamente la misma función:
  dos —una que valida y otra que carga— acabarían divergiendo el día que se
  añada una regla a una sola, y quien sube el archivo vería «todo correcto» y
  después un error.
*/

export type EstadoDeFila = 'NUEVO' | 'ACTUALIZA' | 'ERROR'

export interface FilaRevisada {
  fila: number
  codigo: string
  nombre: string
  estado: EstadoDeFila
  motivo: string | null
}

export interface InformeDeCarga {
  total: number
  nuevos: number
  actualizados: number
  errores: number
  aplicado: boolean
  filas: FilaRevisada[]
}

/**
 * Solo viajan las columnas que la función conoce.
 *
 * Una planilla puede traer columnas de más —notas del almacenista, un total
 * calculado— y mandarlas no aportaría nada. Se recortan aquí para que lo que
 * sube sea exactamente lo que se va a interpretar.
 */
const CAMPOS = [
  'codigo',
  'nombre',
  'descripcion',
  'categoria',
  'unidad',
  'inventariable',
  'modo_entrega',
  'stock_minimo',
  'densidad_ton_m3',
  'precio',
  'precio_minimo',
  'moneda',
] as const

export function prepararFilas(filas: FilaDeHoja[]): FilaDeHoja[] {
  return filas
    .map((f) => {
      const limpia: FilaDeHoja = {}
      for (const campo of CAMPOS) limpia[campo] = (f[campo] ?? '').trim()
      return limpia
    })
    // Una planilla de Excel casi siempre arrastra filas en blanco al final.
    // Contarlas como error haría que un archivo correcto pareciera roto.
    .filter((f) => Object.values(f).some((v) => v !== ''))
}

export function useRevisarArticulos() {
  return useMutation({
    mutationFn: (filas: FilaDeHoja[]) =>
      rpc<InformeDeCarga>('cargar_articulos_por_lote', {
        p_filas: filas,
        p_confirmar: false,
      }),
  })
}

export function useCargarArticulos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (filas: FilaDeHoja[]) =>
      rpc<InformeDeCarga>('cargar_articulos_por_lote', {
        p_filas: filas,
        p_confirmar: true,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['articulos'] })
      void qc.invalidateQueries({ queryKey: ['asignables'] })
      // La planilla también pone precios: la lista de ventas que alguien tenga
      // abierta en otra pestaña ya no es la que hay.
      void qc.invalidateQueries({ queryKey: ['ventas'] })
      void qc.invalidateQueries({ queryKey: ['existencias'] })
      void qc.invalidateQueries({ queryKey: ['existencias-totales'] })
    },
  })
}
