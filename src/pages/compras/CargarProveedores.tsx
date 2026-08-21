import { CargaPorPlanilla } from '@/pages/comunes/CargaPorPlanilla'
import { COLUMNAS_PROVEEDORES } from '@/lib/hojas/plantilla'
import { useRevisarProveedores, useCargarProveedores } from '@/lib/api/cargaLote'

/*
  A quién se le compra, cargado de una vez.

  Manda el RIF, y por un motivo que se paga caro: el mismo proveedor metido dos
  veces con dos RIF distintos es como se acaba pagando dos veces la misma
  factura, y el libro de compras deja de cuadrar con el SENIAT.
*/
export function CargarProveedores() {
  return (
    <CargaPorPlanilla
      eyebrow="Compras"
      titulo="Cargar proveedores por planilla"
      descripcion="Para dar de alta a todos los proveedores de una vez, o corregir los que ya están."
      loQueSeCarga="proveedores"
      columnas={COLUMNAS_PROVEEDORES}
      nombrePlantilla="plantilla-proveedores.xlsx"
      columnaClave="rif"
      volverA={{ a: '/app/compras/proveedores', etiqueta: 'A proveedores' }}
      revisar={useRevisarProveedores()}
      cargar={useCargarProveedores()}
    />
  )
}
