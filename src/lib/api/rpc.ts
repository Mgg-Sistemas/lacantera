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

/*
  LO QUE FALLA TAMBIÉN QUEDA ESCRITO.

  Christopher, 16/09/2026, cuando nadie pudo montar una solicitud de salida y la
  auditoría no decía nada: «auditoría no me está informando si hubo errores en
  alguna solicitud». La auditoría la escriben disparadores al guardar, y un
  intento que la base rechaza se deshace entero: no quedaba ni quién, ni qué
  escribió, ni qué le contestó el sistema.

  Aquí, cuando una función se niega, se le cuenta a `registrar_intento_fallido`
  en otra llamada, que sí se guarda y que la pantalla de auditoría enseña. No se
  espera por ella: si el registro falla, quien intentaba sigue viendo su mensaje
  igual. Lo que tiene nombre de secreto no se manda, y un texto larguísimo va
  recortado.
*/
const NO_SE_GUARDA = /contrase|password|clave|token|secret|firma|foto|imagen|archivo|base64/i

function loQueSeGuarda(args: Record<string, unknown>): Record<string, unknown> {
  const guardado: Record<string, unknown> = {}
  for (const [clave, valor] of Object.entries(args)) {
    if (NO_SE_GUARDA.test(clave)) guardado[clave] = '(no se guarda)'
    else if (typeof valor === 'string' && valor.length > 500) guardado[clave] = `${valor.slice(0, 500)}…`
    else guardado[clave] = valor
  }
  return guardado
}

function contarElFallo(nombre: string, args: Record<string, unknown>, error: PostgrestError) {
  // Sin conexión no hay a quién contárselo, y contarlo fallaría otra vez.
  if (nombre === 'registrar_intento_fallido' || (error.message ?? '').includes('Failed to fetch')) {
    return
  }
  void supabase
    .rpc('registrar_intento_fallido', {
      p_funcion: nombre,
      p_codigo: error.code ?? null,
      p_mensaje: error.message ?? '',
      p_datos: loQueSeGuarda(args),
      p_pantalla: typeof window === 'undefined' ? null : window.location.pathname,
    })
    .then(
      () => undefined,
      () => undefined,
    )
}

export async function rpc<T = unknown>(
  nombre: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.rpc(nombre, args)
  if (error) {
    contarElFallo(nombre, args, error)
    throw new Error(traducir(error))
  }
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
