import { Navigate, useParams } from 'react-router'

/*
  LA FICHA DE UN ARTÍCULO AHORA ES LA TRAZABILIDAD DE MGG (08/11/2026).

  Fase 3 de «Almacén e Inventario como MGG»: «La ficha
  `/app/inventario/articulos/:id` redirige al modal». La página de antes
  (existencia, mínimo, envases y el historial contado en palabras) quedó
  entera dentro del modal «📋 Trazabilidad · {SKU}» de la pantalla principal:
  el stock por almacén y por dueño, el valor por presentación, el kardex con
  su saldo y, plegado al final, los préstamos y viajes al taller que cuenta
  `historial_articulo`.

  La ruta se queda porque hay enlaces que la usan —el buscador de arriba, el
  catálogo, papeles ya impresos—: todos llegan ahora a la pantalla principal
  con el modal abierto. Un id que no es número vuelve a la pantalla sin modal.
*/
export function FichaArticulo() {
  const { id } = useParams()
  const articuloId = Number(id)
  return (
    <Navigate
      replace
      to={Number.isFinite(articuloId) && articuloId > 0 ? `/app/inventario?trazabilidad=${articuloId}` : '/app/inventario'}
    />
  )
}
