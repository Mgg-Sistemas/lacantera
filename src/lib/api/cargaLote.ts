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

/*
  LOS DOS GANCHOS DE FONDO, Y POR QUÉ NO SON UNA FÁBRICA

  El primer intento fue una función `cargaPorLote(funcion, invalidar)` que
  devolvía el par de ganchos ya hechos. Se veía más corto y estaba mal: los
  ganchos que devolvía eran funciones anónimas, y una función anónima que llama
  a `useMutation` rompe la regla de los ganchos de React — no hay forma de que
  el compilador ni el linter comprueben que se llama siempre en el mismo orden.

  Lo atrapó el lint del repositorio, no yo: en local venía filtrando su salida
  con `grep` y me estaba comiendo justo estas líneas.

  Estos dos sí empiezan por `use`, así que son ganchos de verdad y quien los
  envuelve también lo es.
*/

function useRevisarPlanilla(funcion: string) {
  return useMutation({
    mutationFn: (filas: FilaDeHoja[]) =>
      rpc<InformeDeCarga>(funcion, { p_filas: filas, p_confirmar: false }),
  })
}

function useCargarPlanilla(funcion: string, invalidar: string[]) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (filas: FilaDeHoja[]) =>
      rpc<InformeDeCarga>(funcion, { p_filas: filas, p_confirmar: true }),
    onSuccess: () => {
      for (const clave of invalidar) void qc.invalidateQueries({ queryKey: [clave] })
    },
  })
}

// ---------------------------------------------------------------------------

export function useRevisarArticulos() {
  return useRevisarPlanilla('cargar_articulos_por_lote')
}

/**
 * La planilla de artículos también pone precios: la lista de ventas que alguien
 * tenga abierta en otra pestaña ya no es la que hay.
 */
export function useCargarArticulos() {
  return useCargarPlanilla('cargar_articulos_por_lote', [
    'articulos',
    'asignables',
    'ventas',
    'existencias',
    'existencias-totales',
  ])
}

export function useRevisarPersonal() {
  return useRevisarPlanilla('cargar_personal_por_lote')
}

/**
 * Cargar gente mueve el organigrama: cada ficha lleva su departamento, y el
 * organigrama cuenta cuánta gente hay registrada en cada uno.
 */
export function useCargarPersonal() {
  return useCargarPlanilla('cargar_personal_por_lote', [
    'empleados',
    'nomina',
    'tabulador',
    'organigrama',
  ])
}

export function useRevisarProveedores() {
  return useRevisarPlanilla('cargar_proveedores_por_lote')
}

export function useCargarProveedores() {
  return useCargarPlanilla('cargar_proveedores_por_lote', ['proveedores', 'compras'])
}
