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
  /**
   * La columna del problema, cuando la base sabe cuál es.
   *
   * Hoy solo la moneda de la planilla de artículos: la pantalla abre esa fila
   * para corregirla con el cursor puesto ahí.
   */
  campo?: string | null
  /**
   * El código del artículo al que se parece, cuando la fila es nueva y su
   * nombre se parece a uno del catálogo. La pantalla ofrece «es el mismo».
   */
  parecido_codigo?: string | null
  /**
   * Se parece a uno que ya está, pero no es el mismo.
   *
   * No para la carga: una planilla trae DISCO DE CORTE 7 y DISCO DE CORTE 9 el
   * mismo día, y pararla obligaría a partirla en dos. Lo que hace falta es que
   * quien la revisa lo vea antes de confirmar.
   */
  aviso?: string | null
}

export interface InformeDeCarga {
  total: number
  nuevos: number
  actualizados: number
  errores: number
  aplicado: boolean
  /**
   * Cuántas filas traen un costo que hay que mirar antes de confirmar: primera
   * vez que entra a ese almacén, o diez veces fuera de lo que viene costando.
   *
   * Solo lo devuelve la planilla de artículos. Al cargar, la base mete esos
   * renglones con `confirmado: true` porque la revisión ES la confirmación; así
   * que la pantalla no deja confirmar sin que alguien diga que los miró.
   */
  avisos_de_costo?: number
  /** Cuántas filas nuevas se parecen a un artículo que ya está. Solo artículos. */
  avisos_de_parecido?: number
  /**
   * Cuántas filas meten existencia en un almacén. Solo artículos.
   *
   * En cero, la planilla solo carga catálogo, y la pantalla lo pregunta: el lote
   * del 12/09 creó 130 artículos sin un solo asiento y nadie se enteró.
   */
  con_existencia?: number
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
