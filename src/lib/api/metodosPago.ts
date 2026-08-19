import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { desenvolver } from './rpc'

/**
 * Cómo se mueve el dinero.
 *
 * POR QUÉ ESTO ES UNA CONSULTA Y NO UNA CONSTANTE
 *
 * Había cuatro listas escritas a mano —una en compras, otra en facturas de
 * proveedor, otra en cobros de venta y otra en nómina— y ninguna igual a otra.
 * Se podía cobrar por Zelle pero no pagar por Zelle; pagar una factura con
 * cheque pero no una orden. Nadie lo decidió: cada módulo se escribió en su
 * momento y las listas se separaron solas.
 *
 * Ahora el catálogo vive en la base, en `metodos_pago`, y las cuatro columnas
 * apuntan a él con clave foránea. Añadir un método es insertar una fila.
 *
 * LO QUE TRAE ADEMÁS DEL NOMBRE
 *
 * Cada método sabe en qué monedas vale, qué datos exige para poder pagarse y
 * si necesita comprobante. Eso estaba antes repetido en los `check` de la base
 * y en la validación de cada formulario; ahora se lee de un sitio y las
 * pantallas se limitan a obedecerlo.
 */
export interface MetodoPago {
  codigo: string
  nombre: string
  orden: number
  /** `SOLO_VES` para el pago móvil, `NUNCA_VES` para Zelle y Binance. */
  moneda_regla: 'CUALQUIERA' | 'SOLO_VES' | 'NUNCA_VES'
  /** Columnas de `instrucciones_pago` que no pueden ir vacías. */
  campos_exigidos: string[]
  /** El efectivo no lo lleva: se entrega en mano y lo que queda es la firma. */
  exige_comprobante: boolean
  activo: boolean
}

export function useMetodosPago() {
  return useQuery({
    queryKey: ['metodos-pago'],
    // Un catálogo no cambia en toda una jornada. Pedirlo en cada pantalla que
    // muestre un pago sería una consulta por nada.
    staleTime: 30 * 60_000,
    queryFn: async () =>
      desenvolver<MetodoPago[]>(
        await supabase
          .from('metodos_pago')
          .select('codigo, nombre, orden, moneda_regla, campos_exigidos, exige_comprobante, activo')
          .eq('activo', true)
          .order('orden'),
      ),
  })
}

/** Para los `<Select>`, que piden `{ valor, etiqueta }`. */
export function opcionesDe(metodos: MetodoPago[] | undefined) {
  return (metodos ?? []).map((m) => ({ valor: m.codigo, etiqueta: m.nombre }))
}

/**
 * El nombre de un método ya guardado.
 *
 * Cae al código crudo si el catálogo todavía no cargó o si el método se
 * desactivó: un documento viejo pagado por un método retirado tiene que poder
 * enseñarse igual, aunque sea con el código.
 */
export function nombreDe(metodos: MetodoPago[] | undefined, codigo: string | null | undefined) {
  if (!codigo) return '—'
  return metodos?.find((m) => m.codigo === codigo)?.nombre ?? codigo
}

/**
 * Las monedas que admite un método.
 *
 * Se filtra la lista que se le pase en vez de devolver uno fijo: así el mismo
 * cálculo sirve donde la empresa maneje dos monedas y donde maneje cinco.
 */
export function monedasDe<T extends { valor: string }>(
  metodo: MetodoPago | undefined,
  todas: T[],
): T[] {
  if (!metodo) return todas
  if (metodo.moneda_regla === 'SOLO_VES') return todas.filter((m) => m.valor === 'VES')
  if (metodo.moneda_regla === 'NUNCA_VES') return todas.filter((m) => m.valor !== 'VES')
  return todas
}
