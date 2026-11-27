import { Navigate } from 'react-router'
import { Cargando } from '@/components/ui/Estado'
import { useMisPermisos } from '@/lib/api/usuarios'
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
  const { puede, isPending } = useMisPermisos()
  const revisar = useRevisarProveedores()
  const cargar = useCargarProveedores()

  if (isPending) return <Cargando />
  if (!puede('COMPRAS', 'ESCRITURA')) return <Navigate to="/app/compras/proveedores" replace />

  return (
    <CargaPorPlanilla
      eyebrow="Compras"
      titulo="Cargar proveedores por planilla"
      descripcion="Para cargar a todos los proveedores de una vez, o corregir los que ya están."
      loQueSeCarga="proveedores"
      columnas={COLUMNAS_PROVEEDORES}
      nombrePlantilla="plantilla-proveedores.xlsx"
      columnaClave="rif"
      volverA={{ a: '/app/compras/proveedores', etiqueta: 'A proveedores' }}
      revisar={revisar}
      cargar={cargar}
    />
  )
}
