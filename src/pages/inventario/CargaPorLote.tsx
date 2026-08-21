import { CargaPorPlanilla } from '@/pages/comunes/CargaPorPlanilla'
import { COLUMNAS_ARTICULOS } from '@/lib/hojas/plantilla'
import { useRevisarArticulos, useCargarArticulos } from '@/lib/api/cargaLote'

/*
  Antes esta pantalla era el formulario entero. Cuando hicieron falta las de
  personal y proveedores, se sacó lo común a `CargaPorPlanilla` y aquí quedó
  solo lo que distingue a los artículos: sus columnas y sus dos ganchos.

  Que las tres pantallas se vean idénticas no es ahorro de código: quien
  aprendió a cargar una planilla no tiene que aprender nada nuevo para cargar
  las otras dos.
*/
export function CargaPorLote() {
  return (
    <CargaPorPlanilla
      eyebrow="Inventario"
      titulo="Cargar artículos por planilla"
      descripcion="Para dar de alta muchos artículos de una vez, o corregir los que ya están."
      loQueSeCarga="artículos"
      columnas={COLUMNAS_ARTICULOS}
      nombrePlantilla="plantilla-articulos.xlsx"
      columnaClave="codigo"
      volverA={{ a: '/app/inventario/articulos', etiqueta: 'Al catálogo' }}
      revisar={useRevisarArticulos()}
      cargar={useCargarArticulos()}
    />
  )
}
