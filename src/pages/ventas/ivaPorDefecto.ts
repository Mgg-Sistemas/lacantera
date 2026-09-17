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

/** La alícuota con la que arranca la casilla del IGTF al marcarla: la de ley. */
export const IGTF_POR_DEFECTO = 3

/**
 * El porcentaje que vale de una casilla de tributo, a partir de lo escrito.
 *
 * Las mismas tres cuentas se repetían en cada formulario —lo elegido, si está
 * fuera de rango, y lo que de verdad viaja a la base— y con el IGTF iban a ser
 * seis. `malo` bloquea el guardado; `vale` es cero si no se marcó, si el
 * cliente está exento o si lo escrito no sirve.
 */
export function tributoElegido(p: {
  aplica: boolean
  escrito: string | null
  porDefecto: number
  exento?: boolean
}) {
  const elegido = p.escrito === null ? p.porDefecto : Number(p.escrito.replace(',', '.'))
  const malo = p.aplica && !p.exento && !(elegido >= 0 && elegido <= 100)
  const vale = p.exento || !p.aplica || malo ? 0 : elegido
  return { elegido, malo, vale }
}
