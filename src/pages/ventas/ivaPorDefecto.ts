import { useEmpresa } from '@/lib/api/empresa'

/**
 * El valor con el que abre el formulario.
 *
 * Se lee aquí y no en cada pantalla para que las tres —cotización, despacho y
 * factura— arranquen igual. Si cada una leyera la ficha por su cuenta, bastaba
 * con que una se olvidara para que la misma venta llevara IVA o no según por
 * dónde se registrara.
 */
export function useIvaPorDefecto(): boolean {
  const { data: empresa } = useEmpresa()
  return empresa?.aplica_iva ?? true
}
