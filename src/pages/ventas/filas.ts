import type { RenglonVenta } from '@/lib/api/ventas'

/**
 * Las filas del editor de renglones, mientras se escriben.
 *
 * Van en su propio archivo y no junto al componente porque son funciones, no
 * pantalla: un archivo que exporta componentes y funciones a la vez rompe la
 * recarga en caliente durante el desarrollo, y además estas se prueban solas.
 *
 * Todo se guarda como texto. Un campo numérico vacío no es cero: es "todavía no
 * lo han escrito", y guardarlo como número obliga a distinguir el cero real del
 * campo en blanco con un `null` que se acaba colando en la cuenta.
 */

export interface FilaRenglon {
  clave: number
  articulo_id: string
  descripcion: string
  cantidad: string
  unidad: string
  precio: string
  exento: boolean
}

let contador = 0

export const filaVacia = (): FilaRenglon => ({
  clave: contador++,
  articulo_id: '',
  descripcion: '',
  cantidad: '',
  unidad: '',
  precio: '',
  exento: false,
})

/** Las filas completas, listas para la función de la base. */
export function aRenglones(filas: FilaRenglon[]): RenglonVenta[] {
  return filas
    .filter((f) => f.articulo_id && Number(f.cantidad) > 0)
    .map((f) => ({
      articulo_id: Number(f.articulo_id),
      descripcion: f.descripcion.trim() || undefined,
      cantidad: Number(f.cantidad),
      unidad: f.unidad || undefined,
      precio_unitario: Number(f.precio) || 0,
      exento_iva: f.exento,
    }))
}

export function subtotalDe(filas: FilaRenglon[]): number {
  return filas.reduce((suma, f) => suma + (Number(f.cantidad) || 0) * (Number(f.precio) || 0), 0)
}

/** Lo gravado: lo que no está marcado como exento. Es la base del IVA. */
export function gravadoDe(filas: FilaRenglon[]): number {
  return filas
    .filter((f) => !f.exento)
    .reduce((suma, f) => suma + (Number(f.cantidad) || 0) * (Number(f.precio) || 0), 0)
}
