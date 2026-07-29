import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/**
 * Puente único con las funciones de la base.
 *
 * Todas las escrituras del sistema pasan por aquí porque los permisos de
 * INSERT/UPDATE/DELETE están revocados: la aplicación no puede tocar una tabla
 * ni queriendo. Eso convierte cada función de Postgres en la única puerta, y a
 * este archivo en el único sitio donde hay que traducir sus errores.
 */

/**
 * Los mensajes de las funciones ya vienen escritos para que los lea un
 * operador, así que se muestran tal cual. Lo que se traduce es lo que Postgres
 * emite por su cuenta, que habla de restricciones y no de compras.
 */
function traducir(error: PostgrestError): string {
  const mensaje = error.message ?? ''

  if (error.code === '42501' || mensaje.includes('permission denied')) {
    return mensaje.includes('rol')
      ? mensaje
      : 'Tu usuario no tiene permiso para esta acción.'
  }

  if (error.code === 'PGRST202') {
    return 'Esa operación todavía no existe en la base de datos. Falta correr las migraciones.'
  }

  if (mensaje.includes('Failed to fetch')) {
    return 'No hay conexión con el servidor. Revisa la red e inténtalo otra vez.'
  }

  return error.hint ? `${mensaje} ${error.hint}` : mensaje
}

export async function rpc<T = unknown>(
  nombre: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.rpc(nombre, args)
  if (error) throw new Error(traducir(error))
  return data as T
}

/** Envuelve una lectura de tabla o vista con el mismo tratamiento de errores. */
export function desenvolver<T>({
  data,
  error,
}: {
  data: T | null
  error: PostgrestError | null
}): T {
  if (error) throw new Error(traducir(error))
  return data as T
}
