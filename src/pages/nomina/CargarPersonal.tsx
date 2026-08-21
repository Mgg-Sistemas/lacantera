import { CargaPorPlanilla } from '@/pages/comunes/CargaPorPlanilla'
import { COLUMNAS_PERSONAL } from '@/lib/hojas/plantilla'
import { useRevisarPersonal, useCargarPersonal } from '@/lib/api/cargaLote'

/*
  Cargar la plantilla de la empresa de una vez, en lugar de teclear treinta
  fichas de treinta y un campos.

  La cédula es la que manda: si ya existe, la fila corrige esa ficha en vez de
  crear a alguien por segunda vez. Es lo mismo que hace el código en artículos
  y el RIF en proveedores — la identidad de la cosa decide, no el orden del
  archivo.
*/
export function CargarPersonal() {
  return (
    <CargaPorPlanilla
      eyebrow="Nómina"
      titulo="Cargar personal por planilla"
      descripcion="Para dar de alta a toda la gente de una vez, o corregir las fichas que ya están."
      loQueSeCarga="trabajadores"
      columnas={COLUMNAS_PERSONAL}
      nombrePlantilla="plantilla-personal.csv"
      columnaClave="cedula"
      volverA={{ a: '/app/nomina/personal', etiqueta: 'Al personal' }}
      revisar={useRevisarPersonal()}
      cargar={useCargarPersonal()}
    />
  )
}
