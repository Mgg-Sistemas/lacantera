/*
  LA CANTIDAD EN LA SUBDIVISIÓN DE SIEMPRE, PARA LO QUE SE PESA EN POCO.

  Christopher, 19/10/2026, con un plato que gasta 500 gramos de queso y un
  víver que está en KG: «ahorita solo se puede poner completo». El catálogo
  de unidades (`public.unidades`) no tiene gramo ni mililitro —la unidad del
  artículo manda, y el gramo no es una unidad nueva, es la forma en que la
  cocina cuenta un kilo cuando lo que gasta es menos de uno.

  Por eso esto no toca la base ni el catálogo: lo que sale de aquí siempre
  está en la unidad del víver, igual que antes. Es solo una forma más cómoda
  de escribirlo.
*/

export interface Subunidad {
  nombre: string
  factor: number
}

const SUBUNIDADES: Record<string, Subunidad> = {
  KG: { nombre: 'Gramos', factor: 1000 },
  L: { nombre: 'Mililitros', factor: 1000 },
}

/** Si esta unidad tiene una subdivisión más chica para teclear cantidades pequeñas. */
export function subunidadDe(unidad: string): Subunidad | null {
  return SUBUNIDADES[unidad] ?? null
}
