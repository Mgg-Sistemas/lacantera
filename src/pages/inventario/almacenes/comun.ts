import type { Existencia } from '@/lib/api/inventario'
import type { RenglonDeReporte } from '@/lib/ficha/reporteAlmacen'
import { enteros } from '@/lib/formato'

/*
  Lo que comparten la pantalla de Almacenes, su detalle y sus dos modales
  (fase 6 de «Almacén e Inventario como MGG», 08/11/2026).
*/

/** Entera si es entera, con dos decimales si no. */
export function cantidad(valor: number): string {
  return Number.isInteger(valor)
    ? enteros(valor)
    : valor.toLocaleString('es-VE', { maximumFractionDigits: 2 })
}

/** «1 producto» / «3 productos», como MGG. */
export const productos = (n: number) => `${enteros(n)} producto${n === 1 ? '' : 's'}`

/**
 * Los renglones del «📄 Reporte · {almacén}»: lo que tiene existencia, por
 * nombre. El costo y el valor llegan nulos a quien no ve precios.
 */
export function renglonesDeReporte(
  filas: Existencia[],
  etiquetaDeCategoria: (codigo: string) => string,
): RenglonDeReporte[] {
  return filas
    .filter((e) => (Number(e.existencia) || 0) !== 0)
    .sort((a, b) => a.articulo.localeCompare(b.articulo, 'es', { numeric: true, sensitivity: 'base' }))
    .map((e) => ({
      codigo: e.articulo_codigo,
      producto: e.articulo,
      categoria: etiquetaDeCategoria(e.categoria),
      unidad: e.unidad,
      stock: Number(e.existencia) || 0,
      costo: e.costo_promedio_usd === null ? null : Number(e.costo_promedio_usd) || 0,
      valor: e.valor_usd === null ? null : Number(e.valor_usd) || 0,
    }))
}

/** Lo que guarda la vista elegida (▦ / ☰) entre visitas. Sin almacenamiento, el defecto. */
export function leerVista<T extends string>(clave: string, defecto: T, validas: T[]): T {
  try {
    const v = localStorage.getItem(clave) as T | null
    return v && validas.includes(v) ? v : defecto
  } catch {
    return defecto
  }
}

export function guardarVista(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor)
  } catch {
    // Sin almacenamiento la vista vuelve a la de siempre; no pasa nada más.
  }
}
