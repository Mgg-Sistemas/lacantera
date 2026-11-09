import { supabase } from '@/lib/supabase'
import type { MovimientoLibro } from '@/lib/combustible/tipos'

/*
  LO QUE EL SURTIDOR DEL TELÉFONO PIDE ADEMÁS (fase 4, 10/11/2026).

  Las fotos de un movimiento se cuelgan de su número: el del vale (CMB-…) si
  es un surtido, el del libro de inventario si es una entrada o un traslado
  (`private.exigir_escribir_carga` admite los dos). La entrada y el traslado
  devuelven el id del movimiento, no su número: se lee del libro.
*/

/** A qué número se cuelgan las fotos de un renglón del libro. */
export const referenciaDeFotos = (m: Pick<MovimientoLibro, 'vale_numero' | 'numero'>): string =>
  m.vale_numero ?? m.numero

/** El número (vale o libro) de un movimiento recién guardado, para colgarle las fotos. */
export async function referenciaDelMovimiento(id: number): Promise<string | null> {
  const { data } = await supabase
    .from('v_combustible_libro')
    .select('numero, vale_numero')
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  return (data.vale_numero as string | null) ?? (data.numero as string | null) ?? null
}
