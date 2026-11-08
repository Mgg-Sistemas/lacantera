import { useMemo } from 'react'
import { COLUMNAS_ARTICULOS } from '@/lib/hojas/plantilla'
import type { ColumnaPlantilla } from '@/lib/hojas/plantilla'
import { useAlmacenes, usePropietarios } from '@/lib/api/inventario'
import { useCategoriasDeArticulo, useUnidades } from '@/lib/api/catalogo'
import { useMonedasUsables } from '@/lib/api/tasas'

/*
  LAS COLUMNAS DE LA PLANTILLA DE ARTÍCULOS, CON LAS LISTAS DE HOY.

  Sacadas a un gancho el 08/11/2026: «↓ Plantilla» e «↑ Importar Excel» de la
  pantalla principal de inventario (fase 4 de «Almacén e Inventario como MGG»)
  bajan y leen exactamente la misma plantilla que esta pantalla.
*/
export function useColumnasDeArticulos(): ColumnaPlantilla[] {
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

  return useMemo<ColumnaPlantilla[]>(() => {
    const enVivo: Record<string, string[] | undefined> = {
      // Sin los tanques que solo admiten lo que no costó nada: la planilla no
      // carga ahí, y la base lo rechaza.
      almacen: (almacenes ?? []).filter((a) => !a.admite_sin_costo).map((a) => a.codigo),
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
}
