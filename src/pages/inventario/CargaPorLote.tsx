import { CargaPorPlanilla } from '@/pages/comunes/CargaPorPlanilla'
import { useRevisarArticulos, useCargarArticulos } from '@/lib/api/cargaLote'
import { useColumnasDeArticulos } from './columnasDeArticulos'

/*
  Antes esta pantalla era el formulario entero. Cuando hicieron falta las de
  personal y proveedores, se sacó lo común a `CargaPorPlanilla` y aquí quedó
  solo lo que distingue a los artículos: sus columnas y sus dos ganchos.

  Que las tres pantallas se vean idénticas no es ahorro de código: quien
  aprendió a cargar una planilla no tiene que aprender nada nuevo para cargar
  las otras dos.
*/
export function CargaPorLote() {
  const columnas = useColumnasDeArticulos()

  return (
    <CargaPorPlanilla
      eyebrow="Inventario"
      titulo="Cargar artículos por planilla"
      descripcion="Para cargar muchos artículos de una vez, o corregir los que ya están."
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
