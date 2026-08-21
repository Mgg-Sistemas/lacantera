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

  Artículos, personal y proveedores comparten esta forma. Lo único que cambia
  es qué función de la base atiende y qué se invalida después.
*/

export type EstadoDeFila = 'NUEVO' | 'ACTUALIZA' | 'ERROR'

export interface FilaRevisada {
  fila: number
  /** Lo que identifica la fila: el código, la cédula, el RIF. */
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
 * El par de ganchos de una carga.
 *
 * Se fabrican juntos porque van juntos siempre: revisar sin poder cargar no
 * sirve, y cargar sin haber revisado es lo que esta pantalla existe para
 * evitar.
 */
function cargaPorLote(funcion: string, invalidar: string[]) {
  const usarRevisar = () =>
    useMutation({
      mutationFn: (filas: FilaDeHoja[]) =>
        rpc<InformeDeCarga>(funcion, { p_filas: filas, p_confirmar: false }),
    })

  const usarCargar = () => {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: (filas: FilaDeHoja[]) =>
        rpc<InformeDeCarga>(funcion, { p_filas: filas, p_confirmar: true }),
      onSuccess: () => {
        for (const clave of invalidar) void qc.invalidateQueries({ queryKey: [clave] })
      },
    })
  }

  return { usarRevisar, usarCargar }
}

// La planilla de artículos también pone precios: la lista de ventas que alguien
// tenga abierta en otra pestaña ya no es la que hay.
const articulos = cargaPorLote('cargar_articulos_por_lote', [
  'articulos',
  'asignables',
  'ventas',
  'existencias',
  'existencias-totales',
])
export const useRevisarArticulos = articulos.usarRevisar
export const useCargarArticulos = articulos.usarCargar

// Cargar gente mueve el organigrama: cada ficha lleva su departamento, y el
// organigrama cuenta cuánta gente hay registrada en cada uno.
const personal = cargaPorLote('cargar_personal_por_lote', [
  'empleados',
  'nomina',
  'tabulador',
  'organigrama',
])
export const useRevisarPersonal = personal.usarRevisar
export const useCargarPersonal = personal.usarCargar

const proveedores = cargaPorLote('cargar_proveedores_por_lote', ['proveedores', 'compras'])
export const useRevisarProveedores = proveedores.usarRevisar
export const useCargarProveedores = proveedores.usarCargar
