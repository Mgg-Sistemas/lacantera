/**
 * Entrar con la huella.
 *
 * QUÉ ES, SIN ADORNOS
 *
 * La huella no viaja a ninguna parte. Nunca sale del sensor del equipo: ni este
 * sistema ni Supabase la ven, y no hay nada que robar de un servidor. Lo que
 * hace el navegador es guardar una credencial dentro del aparato y confirmarnos
 * que el sensor reconoció a su dueño.
 *
 * Con esa confirmación el sistema descifra el pase de sesión —el mismo que hoy
 * el navegador ya guarda para no tener que entrar cada mañana— y abre la
 * sesión. El pase se guarda cifrado con una llave que vive en el navegador
 * marcada como NO EXTRAÍBLE: el navegador la usa, pero no la entrega ni a quien
 * copie el almacenamiento del equipo.
 *
 * Qué mejora respecto a hoy: ahora mismo la sesión queda en el almacenamiento
 * en claro. Quien se siente en un equipo desbloqueado entra sin más, y quien
 * copie ese almacenamiento se lleva la sesión. Con esto, ninguna de las dos
 * cosas basta.
 *
 * Qué NO es: no es una caja fuerte contra alguien que controle el equipo por
 * completo. La comprobación del dedo la hace el navegador y el sistema la
 * respeta; quien pueda ejecutar código dentro de la página podría saltársela.
 * Es un cierre serio de la puerta, no un búnker — y conviene decirlo en vez de
 * prometer de más.
 *
 * POR QUÉ LA LLAVE VA EN EL NAVEGADOR Y NO SE DERIVA DEL SENSOR
 *
 * Se puede pedir al sensor que derive un secreto (la extensión `prf`), y sería
 * más fuerte: la llave no existiría hasta poner el dedo. Pero el pase de sesión
 * ROTA — Supabase lo cambia cada vez que se refresca, cosa de una hora, y anula
 * el anterior. Con la llave detrás del sensor habría que pedir el dedo cada vez
 * que rota, o el pase guardado quedaría muerto y la huella funcionaría un rato
 * y luego no. Aquí el pase guardado se renueva solo, en silencio, y la huella
 * sigue sirviendo mañana. Una protección más fuerte que deja de funcionar a la
 * hora no protege nada: se desactiva y se vuelve a la clave.
 *
 * TODO ESTO ES AÑADIDO. Si algo aquí falla se cae hacia el acceso con clave de
 * siempre, que no se toca. Un fallo en la comodidad no puede dejar a nadie
 * fuera de su trabajo.
 */

const CLAVE_CREDENCIAL = 'lacantera:huella:credencial'
const CLAVE_PASE = 'lacantera:huella:pase'
const CLAVE_QUIEN = 'lacantera:huella:usuario'
const BD_LLAVES = 'lacantera-huella'
const ALMACEN_LLAVES = 'llaves'

const texto = new TextEncoder()

const aBase64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)))
const deBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/** ¿Hay sensor y el navegador sabe hablarle? */
export async function hayHuella(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export function estadoGuardado(): { activa: boolean; usuario: string } {
  return {
    activa: Boolean(localStorage.getItem(CLAVE_CREDENCIAL) && localStorage.getItem(CLAVE_PASE)),
    usuario: localStorage.getItem(CLAVE_QUIEN) ?? '',
  }
}

// ---------------------------------------------------------------------------
// La llave
// ---------------------------------------------------------------------------
function abrirBase(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(BD_LLAVES, 1)
    peticion.onupgradeneeded = () => peticion.result.createObjectStore(ALMACEN_LLAVES)
    peticion.onsuccess = () => resolver(peticion.result)
    peticion.onerror = () => rechazar(new Error('No se pudo abrir el almacén de llaves.'))
  })
}

async function conBase<T>(modo: IDBTransactionMode, fn: (a: IDBObjectStore) => IDBRequest): Promise<T | null> {
  const bd = await abrirBase()
  const salida = await new Promise<T | null>((resolver) => {
    const t = bd.transaction(ALMACEN_LLAVES, modo)
    const p = fn(t.objectStore(ALMACEN_LLAVES))
    p.onsuccess = () => resolver((p.result as T) ?? null)
    p.onerror = () => resolver(null)
  })
  bd.close()
  return salida
}

/**
 * La llave de este equipo. Se crea la primera vez y no se puede sacar de aquí:
 * `extractable: false` hace que el navegador la use pero nunca la devuelva.
 */
async function llaveDelEquipo(crearSiFalta = false): Promise<CryptoKey | null> {
  const guardada = await conBase<CryptoKey>('readonly', (a) => a.get('principal'))
  if (guardada) return guardada
  if (!crearSiFalta) return null

  const nueva = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
  await conBase('readwrite', (a) => a.put(nueva, 'principal'))
  return nueva
}

async function cifrarPase(pase: string, llave: CryptoKey): Promise<void> {
  const vector = crypto.getRandomValues(new Uint8Array(12))
  const cifrado = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: vector },
    llave,
    texto.encode(pase),
  )
  localStorage.setItem(
    CLAVE_PASE,
    JSON.stringify({ v: aBase64(vector.buffer), d: aBase64(cifrado) }),
  )
}

// ---------------------------------------------------------------------------
// Lo que el navegador dice, en castellano
// ---------------------------------------------------------------------------
/**
 * Traduce el fallo de WebAuthn a algo que se pueda leer.
 *
 * A Christopher le salió esto tal cual en pantalla:
 *
 *   «The operation either timed out or was not allowed. See:
 *    https://www.w3.org/TR/webauthn-2/#sctn-privacy-considerations-client»
 *
 * Un enlace a una especificación técnica en inglés, dentro de una tarjeta que
 * hasta esa línea estaba escrita para cualquiera.
 *
 * SE TRADUCE POR `name`, NO POR EL TEXTO
 *
 * El texto lo escribe cada navegador y cambia entre versiones; `name` es lo que
 * manda la norma y no se mueve. La tarjeta intentaba filtrar buscando
 * «NotAllowed» dentro del mensaje, pero Chrome escribe «not allowed» con
 * espacio y en minúscula — así que la comprobación nunca acertaba y el texto
 * crudo pasaba entero a la pantalla. De ahí la captura.
 *
 * `NotAllowedError` es el cajón de sastre de la norma a propósito: no distingue
 * entre «lo cancelé», «se acabó el minuto» y «el navegador ni lo pidió», para
 * no filtrar si el aparato tiene o no huella registrada. Como no se puede
 * saber cuál fue, el mensaje nombra las tres sin acusar de ninguna.
 */
export function enCastellano(fallo: unknown): string {
  const nombre = fallo instanceof DOMException ? fallo.name : ''

  switch (nombre) {
    case 'NotAllowedError':
    case 'AbortError':
      return 'No se completó. Puede que lo hayas cancelado, que pasara el minuto de espera, o que el aparato no llegara a pedírtelo. Vuelve a intentarlo y responde cuando salga el aviso del sistema.'

    case 'InvalidStateError':
      return 'Este equipo ya tiene tu huella registrada para el sistema. Si no te deja entrar con ella, quítala y vuelve a activarla.'

    case 'NotSupportedError':
      return 'Este equipo no tiene un lector que el sistema pueda usar. En Windows hace falta tener configurado Windows Hello; en el teléfono, la huella o la cara del propio aparato.'

    case 'SecurityError':
      return 'La huella solo funciona sobre una conexión segura. Entra por la dirección con https y vuelve a intentarlo.'

    case 'ConstraintError':
      return 'El aparato no puede cumplir lo que el sistema le pide: hace falta que verifique quién eres, y aquí no hay huella, cara ni PIN configurados.'

    case 'UnknownError':
      return 'El lector falló sin decir por qué. Suele arreglarse cerrando el navegador y volviendo a entrar.'

    default:
      // Un error nuestro ya viene escrito para leerse; uno del navegador que no
      // esté en la lista, al menos sin el enlace a la especificación.
      if (fallo instanceof Error && !(fallo instanceof DOMException)) return fallo.message
      return 'No se pudo usar la huella en este equipo. Entra con tu clave y vuelve a intentarlo más tarde.'
  }
}

// ---------------------------------------------------------------------------
// Activar
// ---------------------------------------------------------------------------
export async function activarHuella(datos: {
  usuario: string
  nombre: string
  refreshToken: string
}): Promise<void> {
  if (!(await hayHuella())) {
    throw new Error('Este equipo no tiene lector de huella, o el navegador no sabe usarlo.')
  }

  let credencial: PublicKeyCredential | null
  try {
    credencial = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Minería Internacional TS', id: location.hostname },
      user: {
        id: texto.encode(datos.usuario),
        name: datos.usuario,
        displayName: datos.nombre || datos.usuario,
      },
      // ES256 y RS256: entre las dos cubren cualquier sensor en uso.
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        // El sensor del propio aparato, no una llave USB que se presta.
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        // Exige el dedo. Sin esto bastaría con que el equipo esté desbloqueado.
        userVerification: 'required',
      },
      timeout: 60_000,
      },
    })) as PublicKeyCredential | null
  } catch (fallo) {
    throw new Error(enCastellano(fallo))
  }

  if (!credencial) throw new Error('No se registró la huella.')

  const llave = await llaveDelEquipo(true)
  if (!llave) throw new Error('Este navegador no deja guardar la llave de cifrado.')

  await cifrarPase(datos.refreshToken, llave)
  localStorage.setItem(CLAVE_CREDENCIAL, aBase64(credencial.rawId))
  localStorage.setItem(CLAVE_QUIEN, datos.usuario)
}

// ---------------------------------------------------------------------------
// Mantener el pase al día
// ---------------------------------------------------------------------------
/**
 * Vuelve a guardar el pase cuando Supabase lo cambia.
 *
 * Sin esto la huella serviría una vez. Supabase rota el pase al refrescar la
 * sesión y anula el anterior; el que quedó cifrado en el equipo se muere solo,
 * y a la mañana siguiente el botón fallaría con un error que no dice nada. No
 * pide el dedo a propósito: guardar no es entrar, y despertar el sensor cada
 * hora sería insoportable.
 */
export async function renovarPaseGuardado(nuevoPase: string): Promise<void> {
  if (!estadoGuardado().activa) return
  const llave = await llaveDelEquipo()
  if (!llave) return
  await cifrarPase(nuevoPase, llave)
}

// ---------------------------------------------------------------------------
// Entrar
// ---------------------------------------------------------------------------
export async function paseConHuella(): Promise<string> {
  const idCredencial = localStorage.getItem(CLAVE_CREDENCIAL)
  const guardado = localStorage.getItem(CLAVE_PASE)
  if (!idCredencial || !guardado) throw new Error('La huella no está activada en este equipo.')

  let afirmacion: PublicKeyCredential | null
  try {
    afirmacion = (await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: deBase64(idCredencial) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null
  } catch (fallo) {
    throw new Error(enCastellano(fallo))
  }

  if (!afirmacion) throw new Error('No se reconoció la huella.')

  const llave = await llaveDelEquipo()
  if (!llave) throw new Error('Se perdió la llave de este equipo. Entra con tu clave.')

  const { v, d } = JSON.parse(guardado) as { v: string; d: string }
  const plano = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: deBase64(v) },
    llave,
    deBase64(d),
  )
  return new TextDecoder().decode(plano)
}

// ---------------------------------------------------------------------------
// Desactivar
// ---------------------------------------------------------------------------
/**
 * Quita la huella de ESTE equipo.
 *
 * La credencial que el navegador guardó dentro del aparato no se borra desde
 * aquí —eso lo llevan los ajustes de llaves de acceso del sistema operativo—,
 * pero sin el pase cifrado no sirve para nada: no queda nada que descifrar.
 */
export async function desactivarHuella(): Promise<void> {
  localStorage.removeItem(CLAVE_CREDENCIAL)
  localStorage.removeItem(CLAVE_PASE)
  localStorage.removeItem(CLAVE_QUIEN)
  try {
    await conBase('readwrite', (a) => a.delete('principal'))
  } catch {
    // Si no se puede abrir el almacén, no hay llave que borrar.
  }
}
