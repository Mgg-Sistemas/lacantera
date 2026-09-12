import { useMemo } from 'react'
import { CargaPorPlanilla } from '@/pages/comunes/CargaPorPlanilla'
import { COLUMNAS_ARTICULOS } from '@/lib/hojas/plantilla'
import type { ColumnaPlantilla } from '@/lib/hojas/plantilla'
import { useRevisarArticulos, useCargarArticulos } from '@/lib/api/cargaLote'
import { useAlmacenes, usePropietarios } from '@/lib/api/inventario'
import { useCategoriasDeArticulo, useUnidades } from '@/lib/api/catalogo'
import { useMonedasUsables } from '@/lib/api/tasas'

/*
  Antes esta pantalla era el formulario entero. Cuando hicieron falta las de
  personal y proveedores, se sacó lo común a `CargaPorPlanilla` y aquí quedó
  solo lo que distingue a los artículos: sus columnas y sus dos ganchos.

  Que las tres pantallas se vean idénticas no es ahorro de código: quien
  aprendió a cargar una planilla no tiene que aprender nada nuevo para cargar
  las otras dos.
*/
export function CargaPorLote() {
  /*
    LAS LISTAS QUE LA EMPRESA PUEDE CAMBIAR SE LEEN DE LA BASE.

    Christopher: «el campo de almacén necesitará ser una lista desplegable», y
    después: «los ítems tienen dueño, esto también es una celda con lista».

    Escribirlas en la plantilla las congelaría el día que se escribieron: se
    abre un almacén nuevo y la planilla que alguien se bajó sigue ofreciendo los
    de antes, rechazando filas por un código que sí existe. Se piden aquí y
    viajan con el archivo que se descarga, así que la plantilla de hoy trae los
    almacenes de hoy.

    Las cerradas —las categorías, el sí o no— van escritas en la plantilla: son
    un CHECK de la base y no cambian sin una migración.
  */
  const { data: almacenes } = useAlmacenes()
  const { data: propietarios } = usePropietarios()
  const { data: unidades } = useUnidades()
  const { data: categorias } = useCategoriasDeArticulo()
  const monedas = useMonedasUsables()

  const columnas = useMemo<ColumnaPlantilla[]>(() => {
    const enVivo: Record<string, string[] | undefined> = {
      almacen: (almacenes ?? []).map((a) => a.codigo),
      propietario: (propietarios ?? []).map((d) => d.codigo),
      unidad: (unidades ?? []).map((u) => u.codigo),
      // Sin datos todavía manda la lista escrita en la plantilla, que es la
      // misma del CHECK. Cuando llega la de la base, gana la de la base.
      // El nombre y no el codigo: «EQUIPO» no dice oficina, y quien busca
      // donde poner una laptop busca lo que la pantalla le enseña.
      categoria: (categorias ?? []).map((c) => c.etiqueta),
      moneda: (monedas.data ?? []).map((m) => m.valor),
    }

    return COLUMNAS_ARTICULOS.map((c) => {
      const lista = enVivo[c.columna]
      // Sin datos todavía se deja la columna como estaba: una lista vacía
      // dejaría la celda sin poder escribir nada.
      return lista && lista.length > 0 ? { ...c, opciones: lista } : c
    })
  }, [almacenes, propietarios, unidades, categorias, monedas.data])

  return (
    <CargaPorPlanilla
      eyebrow="Inventario"
      titulo="Cargar artículos por planilla"
      descripcion="Para dar de alta muchos artículos de una vez, o corregir los que ya están."
      loQueSeCarga="artículos"
      columnas={columnas}
      nombrePlantilla="plantilla-articulos.xlsx"
      columnaClave="codigo"
      volverA={{ a: '/app/inventario/articulos', etiqueta: 'Al catálogo' }}
      revisar={useRevisarArticulos()}
      cargar={useCargarArticulos()}
    />
  )
}
