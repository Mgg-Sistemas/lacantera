/*
  POLÍTICA DE REABASTECIMIENTO · copia de `restock.ts` de MGG (08/11/2026)

  Fase 2 de «Almacén e Inventario como MGG»: la pantalla principal de
  inventario calcula en el navegador la clase ABC, el umbral y el estado de
  cada producto, igual que MGG. No hay columna nueva ni migración: todo sale
  de lo que ya está en la base (stock mínimo del artículo, existencia y valor
  de `v_existencias`).

  ABC: el ~80 % del valor del inventario se concentra en el ~20 % de los
  productos. Esa minoría (clase A) merece más control.
    Clase A → 0 % – 80 %   del valor acumulado
    Clase B → 80 % – 95 %
    Clase C → 95 % – 100 %

  LO QUE CAMBIA RESPECTO DE MGG, Y POR QUÉ
  - Aquí no existe `restock_pct` (el % propio de cada producto): no hay modo
    «detallado» ni la estrella «★ {n}%». Manda siempre la política por clase.
  - Un artículo sin stock mínimo (0) no se alerta. En MGG un producto en 0 con
    mínimo 0 cae en «reabastecer» (0 ≤ 0); aquí la mayoría del catálogo no
    tiene mínimo puesto y la tarjeta se llenaría de avisos que nadie puede
    resolver. Es la misma regla que ya seguía el Tablero: «un artículo sin
    punto de pedido no está bajo mínimo, está sin configurar».
  - «Precio» es el costo promedio ponderado de La Cantera, no un precio de
    venta. Lo que no tiene valor visible (sin permiso o sin valorar) pesa 0.
*/

export type AbcClass = 'A' | 'B' | 'C'

export interface RestockPolicy {
  /** % del stock mínimo por clase ABC. */
  thresholdsByClass: Record<AbcClass, number>
}

export const DEFAULT_POLICY: RestockPolicy = {
  thresholdsByClass: { A: 120, B: 100, C: 80 },
}

/** Lo mínimo que hace falta saber de un producto para decorarlo. */
export interface ProductoParaRestock {
  id: number
  nombre: string
  /** El stock con el que se decide la alerta (ver `InventarioPrincipal.tsx`). */
  stockAlerta: number
  /** Stock mínimo. 0 = sin punto de pedido: no se alerta. */
  minimo: number
  /** stock × precio; nulo si no se puede ver. */
  valor: number | null
}

/**
 * Clasificación ABC (Pareto) por valor de inventario.
 * Productos sin valor → C. Igual que `classifyABC` de MGG.
 */
export function classifyABC(productos: ProductoParaRestock[]): Map<number, AbcClass> {
  const result = new Map<number, AbcClass>()

  const items = productos
    .map((p) => ({ id: p.id, valor: p.valor ?? 0 }))
    .filter((x) => x.valor > 0)
    .sort((a, b) => b.valor - a.valor)

  const total = items.reduce((acc, x) => acc + x.valor, 0)
  if (total === 0) {
    productos.forEach((p) => result.set(p.id, 'C'))
    return result
  }

  let acumulado = 0
  items.forEach((x) => {
    acumulado += x.valor
    const ratio = acumulado / total
    if (ratio <= 0.8) result.set(x.id, 'A')
    else if (ratio <= 0.95) result.set(x.id, 'B')
    else result.set(x.id, 'C')
  })

  productos.forEach((p) => {
    if (!result.has(p.id)) result.set(p.id, 'C')
  })

  return result
}

/** % del mínimo que dispara la alerta, según la clase. */
export function effectivePct(klass: AbcClass, policy: RestockPolicy = DEFAULT_POLICY): number {
  return policy.thresholdsByClass[klass] ?? 100
}

/** Umbral efectivo en unidades: `ceil(mínimo × pct / 100)`. */
export function effectiveThreshold(minimo: number, pct: number): number {
  return Math.ceil(minimo * (pct / 100))
}

/** Anotaciones derivadas para la tabla, la tarjeta de alertas y los filtros. */
export interface Decoracion {
  _klass: AbcClass
  _threshold: number
  _pct: number
  _needsRestock: boolean
  _critical: boolean
}

export function decorate<T extends ProductoParaRestock>(
  productos: T[],
  policy: RestockPolicy = DEFAULT_POLICY,
): Array<T & Decoracion> {
  const classMap = classifyABC(productos)
  return (
    productos
      .map((p) => {
        const klass = classMap.get(p.id) ?? 'C'
        const pct = effectivePct(klass, policy)
        const threshold = effectiveThreshold(p.minimo, pct)
        const conMinimo = p.minimo > 0
        return {
          ...p,
          _klass: klass,
          _threshold: threshold,
          _pct: pct,
          _needsRestock: conMinimo && p.stockAlerta <= threshold,
          _critical: conMinimo && p.stockAlerta < p.minimo,
        }
      })
      // Siempre alfabética A→Z, insensible a mayúsculas y acentos, con orden
      // natural para los números (igual que MGG).
      .sort((a, b) =>
        (a.nombre || '').localeCompare(b.nombre || '', 'es', { numeric: true, sensitivity: 'base' }),
      )
  )
}
