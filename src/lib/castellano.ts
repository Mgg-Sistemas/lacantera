/*
  LO QUE FALLA, DICHO EN CASTELLANO

  Angélica, 29/09/2026: «quiero que todo el sistema esté en español Venezuela,
  todo el sistema por completo».

  Las pantallas ya estaban escritas en castellano de la casa. Lo que no lo
  estaba es lo que aparece cuando algo se rompe: ahí el sistema dejaba de
  hablar y hablaban Postgres, el navegador y Supabase, cada uno en inglés y
  cada uno de su oficio. «Failed to fetch» en una pantalla de despachos.
  «duplicate key value violates unique constraint "clientes_rif_key"» al
  guardar un cliente. «JWT expired» a media mañana, sin más.

  Eso no es un detalle de acabado. Un mensaje que no se entiende no se puede
  obedecer: quien lo lee no sabe si lo hizo mal, si debe repetirlo, o si tiene
  que llamar a alguien. Y llama, siempre, aunque la respuesta fuera «vuelve a
  intentarlo».

  DOS REGLAS, Y LA SEGUNDA IMPORTA MÁS QUE LA PRIMERA

  1. Se traduce lo que viene de fuera. Postgres, PostgREST, el navegador,
     Supabase Auth, el almacenamiento y las funciones de borde.

  2. NO SE TOCA LO QUE YA ESTÁ EN CASTELLANO. Los mensajes de nuestras
     funciones de base están escritos a mano, uno por uno, para que los lea un
     operador —«En "Caja chica en bolívares" hay 120,00 VES y se intentan sacar
     300,00»—. Pasarlos por un traductor para reemplazarlos por algo genérico
     sería cambiar oro por lata. Por eso la salida por defecto es el mensaje
     tal cual, y solo se sustituye cuando se reconoce de dónde viene.

  QUÉ PASA CON EL INGLÉS QUE NO ESTÁ EN LA LISTA

  Se enseña una frase general y el texto crudo va al registro del navegador.
  Es el mismo trato que da `huella.ts` a los fallos de WebAuthn que no conoce,
  y por la misma razón: un mensaje en inglés con el nombre de una restricción
  de Postgres dentro no ayuda a quien está en la báscula, y sí ayuda a quien
  vaya a arreglarlo — que mira la consola, no la pantalla.

  LA HUELLA TIENE EL SUYO. `huella.ts` traduce los fallos de WebAuthn, que van
  por `name` y no por texto. No se juntaron a propósito: aquello es una norma
  cerrada de nueve errores y esto es un cajón abierto.
*/

/** Un error, sea de donde sea, con lo poco que se le puede preguntar a todos. */
interface FalloLegible {
  message?: unknown
  /** Postgres (`23505`) o PostgREST (`PGRST202`). */
  code?: unknown
  /** HTTP, cuando viene de Auth, del almacenamiento o de una función. */
  status?: unknown
  statusCode?: unknown
  /** El `hint` de Postgres, que a veces dice qué hacer. */
  hint?: unknown
  name?: unknown
}

const texto = (v: unknown): string => (typeof v === 'string' ? v : '')

/*
  ¿Esto ya está en castellano?

  Se mira antes que nada, porque equivocarse aquí es lo único que puede empeorar
  las cosas: sustituir un mensaje nuestro, escrito para la persona que lo va a
  leer, por una frase general.

  Dos señales, y basta con una. Los acentos y la eñe no aparecen en inglés. Y
  las palabras de relleno del castellano —«no se pudo», «falta el», «hay que»—
  no coinciden con las inglesas: un mensaje nuestro sin un solo acento, como
  «Error al guardar», cae igual por el «al».
*/
const ACENTOS = /[áéíóúüñÁÉÍÓÚÜÑ¡¿]/
const PALABRAS_DE_CASA =
  /\b(el|la|los|las|un|una|de|del|al|y|que|no|se|con|por|para|sin|ya|hay|es|son|est[aáeé]|m[aá]s|debe|puede|falta|faltan|tiene|vuelve|revisa|pide|sale|queda|desde|hasta|cuenta|correo)\b/i

function pareceDeCasa(m: string): boolean {
  return ACENTOS.test(m) || PALABRAS_DE_CASA.test(m)
}

/*
  DOS FRASES QUE OTROS TIENEN QUE RECONOCER YA TRADUCIDAS.

  `rpc()` lanza el mensaje en castellano y el código de Postgres se pierde por
  el camino. Quien necesita saber que fue la red, o que la base cortó por
  tiempo, compara con estas constantes en vez de copiar la frase a mano: dos
  copias se separan en el primer retoque.
*/
export const SIN_CONEXION =
  'No hay conexión con el servidor. Revise la red e inténtelo otra vez. Lo que no se guardó, no quedó.'
export const CONSULTA_CORTADA =
  'La consulta tardó demasiado y el servidor la cortó. Vuelva a intentarlo; si se repite, avise a soporte.'

/** Cómo dice cada navegador que no llegó a ningún sitio. */
const RED_CAIDA = ['failed to fetch', 'networkerror', 'load failed', 'network request failed']

/**
 * El fallo, dicho como lo diría el sistema.
 *
 * Devuelve siempre algo que se puede enseñar: nunca vacío, nunca «[object
 * Object]», nunca un enlace a una especificación.
 */
export function enCastellano(fallo: unknown): string {
  if (fallo == null) return 'Algo falló y no dijo qué. Vuelva a intentarlo.'

  const e = (typeof fallo === 'object' ? fallo : {}) as FalloLegible
  const m = texto(e.message) || (typeof fallo === 'string' ? fallo : '')
  const codigo = texto(e.code)
  const nombre = texto(e.name)
  const http = Number(e.status ?? e.statusCode ?? 0)
  const bajo = m.toLowerCase()
  const tiene = (...trozos: string[]) => trozos.some((t) => bajo.includes(t))

  // ── El navegador no llegó a ningún sitio ──────────────────────────────────
  /*
    Cada navegador lo dice distinto y ninguno lo dice en castellano: Chrome
    «Failed to fetch», Firefox «NetworkError when attempting to fetch
    resource», Safari «Load failed». Son el mismo suceso y merecen el mismo
    aviso, que además es el más frecuente en la cantera.
  */
  if (tiene(...RED_CAIDA)) return SIN_CONEXION
  if (nombre === 'AbortError' || nombre === 'TimeoutError' || tiene('aborted', 'timed out')) {
    return 'La operación tardó demasiado y se cortó. Vuelva a intentarlo; si la red está lenta, espere un momento.'
  }
  if (tiene('failed to send a request to the edge function')) {
    return 'No se pudo contactar a esa parte del sistema. Vuelva a intentarlo dentro de un minuto.'
  }
  if (tiene('edge function returned a non-2xx')) {
    return 'Esa parte del sistema contestó con un error. Si se repite, avise a soporte.'
  }

  // ── La sesión ─────────────────────────────────────────────────────────────
  if (
    codigo === 'PGRST301' ||
    tiene('jwt expired', 'jwt is expired', 'invalid refresh token', 'refresh_token_not_found', 'auth session missing')
  ) {
    return 'Su sesión venció. Vuelva a entrar y repita lo que estaba haciendo.'
  }

  // ── Entrar al sistema ─────────────────────────────────────────────────────
  if (tiene('invalid login credentials')) return 'Usuario o clave incorrectos.'
  if (tiene('email not confirmed')) return 'Esa cuenta todavía no está confirmada. Avise a quien administra el sistema.'
  if (tiene('user already registered', 'already been registered')) return 'Ese usuario ya existe.'
  if (tiene('user not found')) return 'Ese usuario no existe.'
  if (tiene('user is banned')) return 'Esa cuenta está bloqueada. Hable con quien administra el sistema.'
  if (tiene('signups not allowed', 'signup is disabled')) {
    return 'Las cuentas no se crean solas: las da de alta quien administra el sistema.'
  }
  if (tiene('new password should be different')) return 'La clave nueva tiene que ser distinta de la anterior.'
  if (tiene('password should be at least')) {
    const n = /at least (\d+)/i.exec(m)?.[1]
    return n ? `La clave necesita al menos ${n} caracteres.` : 'La clave es demasiado corta.'
  }
  /*
    El freno de Supabase cuando se prueba muchas veces seguidas. Dice los
    segundos que faltan y se repiten, porque «espera un rato» sin número
    termina en que se prueba cada diez segundos hasta que el freno se alarga.
  */
  if (tiene('for security purposes', 'only request this after')) {
    const n = /after (\d+) seconds?/i.exec(m)?.[1]
    return n ? `Por seguridad hay que esperar ${n} segundos antes de volver a intentarlo.` : 'Por seguridad hay que esperar un momento antes de volver a intentarlo.'
  }
  if (http === 429 || tiene('too many requests', 'rate limit')) {
    return 'Se intentó demasiadas veces seguidas. Espere un minuto y vuelva a probar.'
  }

  // ── Permisos ──────────────────────────────────────────────────────────────
  if (codigo === '42501' || tiene('permission denied', 'row-level security', 'row level security')) {
    return 'Su usuario no tiene permiso para esta acción.'
  }
  if (http === 401 || http === 403) {
    return 'No tiene permiso para esto, o la sesión venció. Vuelva a entrar y pruebe otra vez.'
  }

  // ── Lo que la base no admite ──────────────────────────────────────────────
  /*
    Estos cuatro son los que de verdad salen. Se nombra el DATO cuando Postgres
    lo dice —la columna, la tabla—, porque «ya existe» a secas obliga a
    adivinar cuál de los ocho campos de la pantalla es el repetido.
  */
  if (codigo === '23505' || tiene('duplicate key value')) {
    return 'Ya existe un registro con ese dato, y no puede haber dos.'
  }
  if (codigo === '23503' || tiene('violates foreign key constraint', 'is still referenced from table')) {
    return 'Eso está en uso en otra parte del sistema: no se puede borrar ni cambiar mientras algo dependa de ello.'
  }
  if (codigo === '23502' || tiene('violates not-null constraint')) {
    const col = /column "([^"]+)"/i.exec(m)?.[1]
    return col ? `Falta un dato obligatorio: ${col}.` : 'Falta un dato obligatorio.'
  }
  if (codigo === '23514' || tiene('violates check constraint')) {
    return 'La base no admite ese valor. Revise los datos de la operación; si no escribió nada, avise a soporte.'
  }
  if (codigo === '22P02' || tiene('invalid input syntax')) {
    return 'Hay un dato con el formato equivocado. Si lo escribió usted, revíselo; si llegó por un enlace, el enlace está mal.'
  }
  if (codigo === '22001' || tiene('value too long')) return 'Ese texto es demasiado largo.'
  if (codigo === '22003' || tiene('out of range')) return 'Ese número se sale de lo que el campo admite.'

  // ── La base misma ─────────────────────────────────────────────────────────
  if (codigo === 'PGRST202') {
    return 'Esa operación todavía no está disponible en la base de datos. Avise a soporte.'
  }
  if (codigo === 'PGRST204' || tiene('schema cache')) {
    return 'La base cambió hace un momento y el sistema todavía no se enteró. Recargue la página e inténtelo otra vez.'
  }
  if (codigo === '42P01' || tiene('does not exist')) {
    return 'Falta algo en la base de datos para esta pantalla. Avise a soporte: hay una migración sin correr.'
  }
  /*
    Aquí decía «Acote las fechas o los filtros», y salió en el respaldo, que no
    tiene ni lo uno ni lo otro. Por este traductor pasan casi todas las
    pantallas —`ErrorDeCarga` y `rpc()`—, así que el consejo tiene que poder
    seguirse en cualquiera. Quien tiene filtros delante ya sabe usarlos.
  */
  if (codigo === '57014' || tiene('statement timeout', 'canceling statement')) {
    return CONSULTA_CORTADA
  }
  if (codigo === '53300' || tiene('too many connections')) {
    return 'El servidor está saturado en este momento. Espere un poco y vuelva a intentarlo.'
  }
  if (http >= 500 || tiene('internal server error', 'bad gateway', 'service unavailable')) {
    return 'El servidor falló. Espere un momento y vuelva a intentarlo; si sigue, avise a soporte.'
  }

  // ── Archivos ──────────────────────────────────────────────────────────────
  if (tiene('the resource already exists', 'duplicate', 'already exists')) {
    return 'No se pudo guardar el archivo porque ya había otro igual en el almacén. Vuelva a intentarlo; si se repite, avise a soporte.'
  }
  if (http === 413 || tiene('payload too large', 'maximum allowed size', 'entity too large')) {
    return 'El archivo pesa más de lo que se admite. Redúzcalo y vuelva a subirlo.'
  }
  if (tiene('mime type', 'not supported')) {
    return 'Ese tipo de archivo no se admite aquí.'
  }
  if (tiene('bucket not found')) {
    return 'Falta preparar el almacén de archivos. Avise a soporte.'
  }
  if (tiene('object not found', 'not_found')) {
    return 'Ese archivo ya no está. Puede que lo hayan borrado.'
  }

  // ── La cámara, que es un DOMException y no un error de red ────────────────
  if (nombre === 'NotAllowedError') {
    return 'No dio permiso para usar la cámara. Ábralo en el candado de la barra de direcciones y vuelva a intentarlo.'
  }
  if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') {
    return 'Este equipo no tiene una cámara que el sistema pueda usar.'
  }
  if (nombre === 'NotReadableError') {
    return 'La cámara está ocupada por otro programa. Ciérrelo y vuelva a intentarlo.'
  }

  // ── Lo que ya venía escrito para leerse ───────────────────────────────────
  if (m && pareceDeCasa(m)) {
    const pista = texto(e.hint)
    return pista && pareceDeCasa(pista) ? `${m} ${pista}` : m
  }

  /*
    Y lo que queda: inglés que no está en la lista, o un objeto sin mensaje.

    Va a la consola entero. Es la única copia que quedará del texto original, y
    quien la necesita es quien va a arreglarlo — que sabe abrirla.
  */
  if (m) console.error('Fallo sin traducir:', fallo)
  return 'Algo salió mal y el sistema no supo explicarlo. Vuelva a intentarlo; si se repite, avise a soporte.'
}

/**
 * ¿El fallo es que no hubo conexión con el servidor?
 *
 * Reconoce el error crudo del navegador y también el ya traducido, porque
 * `rpc()` entrega el segundo.
 */
export function esFaltaDeConexion(fallo: unknown): boolean {
  const m = (typeof fallo === 'string' ? fallo : texto((fallo as FalloLegible | null)?.message)).toLowerCase()
  return m.includes(SIN_CONEXION.toLowerCase()) || RED_CAIDA.some((t) => m.includes(t))
}

/*
  LO QUE NO SUBIÓ DESPUÉS DE LO QUE SÍ SE GUARDÓ.

  Las fotos de una salida o de un despacho suben cuando la solicitud ya quedó.
  Si fallan, el aviso decía «quedó pedido, pero las fotos no subieron (No hay
  conexión… Lo que no se guardó, no quedó.)»: la coletilla del traductor
  contradecía a la frase que la llevaba dentro. Cuando es la red se dice así, a
  secas; si es otra cosa —un archivo que pesa demasiado—, se dice cuál, porque
  ese motivo sí cambia lo que hay que hacer.
*/
export function porQueNoSubio(fallo: unknown): string {
  return esFaltaDeConexion(fallo) ? ' por falta de conexión.' : `: ${enCastellano(fallo)}`
}
