import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { zipDeUnArchivo } from '@/lib/zip'
import { rpc } from './rpc'

/**
 * El respaldo de la base.
 *
 * La descarga no pasa por el visor de documentos como los PDF y las imágenes,
 * y no es un olvido: un archivo SQL de varios megas no se revisa mirándolo. Lo
 * que hay que revisar de un respaldo —que esté completo— lo comprueba la propia
 * función antes de entregarlo, y lo que hay que saber antes de pulsar está en
 * la pantalla.
 */
export interface ResumenRespaldo {
  tablas: number
  filas: number
  ultimo: string | null
  ultimo_por: string | null
  /** Si este usuario tiene el rol. La base lo vuelve a comprobar al descargar. */
  autorizado: boolean
}

export function useResumenRespaldo() {
  return useQuery({
    queryKey: ['respaldo', 'resumen'],
    // Devuelve una fila; PostgREST envuelve las funciones que devuelven tabla
    // en un arreglo aunque traiga una sola.
    queryFn: async () => (await rpc<ResumenRespaldo[]>('respaldo_resumen'))?.[0] ?? null,
    staleTime: 60_000,
  })
}

/** Cómo se llamará el archivo. Con la fecha delante, que es como se ordenan
 *  solos en la carpeta cuando ya hay varios. */
function nombreDeArchivo(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `respaldo-lacantera-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.sql`
}

/**
 * El correo al que va el respaldo si nadie dice otra cosa.
 *
 * Lo fijó la líder el 24/09/2026. Va aquí y no en la base a propósito: no es un
 * dato del negocio que alguien vaya a mantener desde una pantalla, es la
 * dirección que ya está verificada en el servicio de correo. El día que se
 * autentique el dominio de la empresa, esto cambia en una línea.
 */
export const CORREO_POR_DEFECTO = 'sistemamgg1@gmail.com'

/** Cuántos admite de una vez. El mismo tope que `MAX_DESTINATARIOS` en la
 *  función de correo y que el de `anotar_envio_del_respaldo`. */
export const MAX_CORREOS = 10

/** Pide el respaldo a la base y comprueba que no venga vacío. */
async function armarRespaldo(): Promise<{ sql: string; nombre: string }> {
  const sql = await rpc<string>('respaldo_datos')
  if (!sql || sql.length < 100) {
    throw new Error('La base devolvió un respaldo vacío. No se descargó nada.')
  }
  return { sql, nombre: nombreDeArchivo() }
}

export function useDescargarRespaldo() {
  return useMutation({
    mutationFn: async () => {
      const { sql, nombre } = await armarRespaldo()

      /*
        `text/plain` y no `application/sql`: el segundo no lo reconocen todos
        los navegadores y alguno lo abre en una pestaña en vez de guardarlo.
      */
      const blob = new Blob([sql], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.download = nombre

      // El enlace tiene que estar en el documento para que el clic cuente como
      // navegación, y la dirección no se puede soltar en la misma vuelta: el
      // navegador todavía no ha empezado a leer el archivo y la descarga se
      // cae sin decir nada.
      document.body.append(enlace)
      enlace.click()
      enlace.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)

      /*
        Y ADEMÁS POR CORREO, PERO SIN JUGARSE LA DESCARGA.

        Lo pidió la líder: que el respaldo se baje al navegador Y llegue al
        correo. El orden importa — primero se baja, y solo entonces se intenta
        mandar. Si el correo falla, la persona ya tiene su archivo.

        Por eso el fallo no se propaga: se devuelve dicho, para que la pantalla
        lo cuente, y no como excepción, que tiraría abajo una descarga que salió
        bien.
      */
      let correo: { enviado: boolean; fallo?: string }
      try {
        await mandarPorCorreo(sql, enlace.download, [])
        correo = { enviado: true }
        await anotar(true, null, null)
      } catch (e) {
        const fallo = e instanceof Error ? e.message : String(e)
        correo = { enviado: false, fallo }
        await anotar(false, motivoDelFallo(fallo), null)
      }

      return { bytes: blob.size, nombre: enlace.download, correo }
    },
  })
}

/**
 * Mandar el respaldo a los correos que se escriban, sin bajarlo a esta máquina.
 *
 * Es el encargo de la líder del 24/09/2026, y es una cosa distinta de la
 * descarga aunque comparta casi todo el camino. La diferencia que importa está
 * en cómo se cuenta el fallo: cuando la descarga sale bien y el correo no, lo
 * que hay es un aviso —el archivo ya está en la computadora—. Aquí el correo es
 * lo único que se pidió, así que si no sale, esto es un error y se levanta como
 * tal para que la pantalla lo pinte en rojo.
 *
 * Y hay que decir lo que esto abre: hasta hoy el respaldo solo podía ir al
 * correo de quien lo pedía, que no reparte nada que esa persona no tuviera ya.
 * Ahora puede ir a cualquier dirección. Por eso las direcciones quedan escritas
 * en `correos_enviados` —ver la migración del 24/09/2026—, enlazadas al renglón
 * de auditoría del respaldo.
 */
export function useEnviarRespaldoPorCorreo() {
  return useMutation({
    mutationFn: async (correos: string[]) => {
      const para = limpiarCorreos(correos)
      if (!para.length) throw new Error('Hace falta al menos un correo de destino.')
      if (para.length > MAX_CORREOS) {
        throw new Error(`No se puede mandar a más de ${MAX_CORREOS} correos a la vez.`)
      }

      const { sql, nombre } = await armarRespaldo()

      let bytes: number
      try {
        bytes = await mandarPorCorreo(sql, nombre, para)
      } catch (e) {
        const fallo = e instanceof Error ? e.message : String(e)
        await anotar(false, motivoDelFallo(fallo), para)
        throw e
      }
      await anotar(true, null, para)

      return { para, bytes, nombre: `${nombre}.zip` }
    },
  })
}

/**
 * Recorta, baja a minúsculas y quita vacíos y repetidos.
 *
 * Lo mismo que hace la base al anotar y la función de correo al mandar. Se
 * repite aquí para que la pantalla enseñe la lista tal como va a salir, y no
 * una que el servidor va a cambiar por detrás sin decirlo.
 */
export function limpiarCorreos(correos: string[]): string[] {
  const lista: string[] = []
  for (const c of correos) {
    const limpio = c.trim().toLowerCase()
    if (limpio && !lista.includes(limpio)) lista.push(limpio)
  }
  return lista
}

/*
  QUÉ CUENTA COMO CORREO, EN LA PANTALLA.

  Deliberadamente laxo y el mismo patrón que usa la función de correo: sin
  espacios, sin comas y sin punto y coma, con arroba y con punto detrás. No
  intenta decidir si el buzón existe —eso no lo sabe nadie hasta que rebota— y
  sí impide lo único que de verdad rompe: que «a@b.com,c@d.com» entre como si
  fuera una sola dirección y acabe siendo dos.
*/
const RX_CORREO = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

export const correoValido = (c: string): boolean => RX_CORREO.test(c.trim().toLowerCase())

/*
  QUE LA AUDITORÍA DIGA SI SALIÓ.

  El renglón de auditoría nace al armar el respaldo, antes de que se sepa nada
  del correo — y no puede completarse después: la tabla tiene un disparador que
  prohíbe modificarla, y el mensaje de ese disparador dice por qué. «El registro
  de auditoría no se modifica ni se borra. Es lo único que lo hace valer.»

  Así que el resultado se anota aparte, en la tabla de correos, enlazado al
  renglón. La vista los junta y en pantalla sigue siendo una sola línea, que es
  lo que pidió el usuario.

  Anotar no puede tumbar nada: si esto falla, el respaldo ya está descargado y
  el correo ya salió o ya no. Lo único que se pierde es la constancia, y eso se
  dice en el registro del navegador en vez de reventarle la pantalla a nadie.
*/
async function anotar(
  enviado: boolean,
  motivo: string | null,
  para: string[] | null,
): Promise<void> {
  try {
    await rpc('anotar_envio_del_respaldo', {
      p_enviado: enviado,
      p_mensaje_id: null,
      p_motivo: motivo,
      // Nulo cuando fue al correo de la propia sesión: ahí no hay destino que
      // revisar, y una columna llena de lo mismo no se lee.
      p_para: para && para.length > 0 ? para : null,
    })
  } catch (e) {
    console.error('No se pudo anotar el envío del respaldo:', e)
  }
}

/*
  DEL FALLO AL MOTIVO, QUE ES UNA LISTA CERRADA.

  La base solo admite estos seis y lo hace cumplir con un CHECK. Es a propósito:
  el texto crudo del servicio de correo no debe llegar nunca a una pantalla de
  auditoría —puede traer direcciones, cabeceras o el detalle de por qué se
  rechazó—, y un motivo de lista se puede contar y comparar entre meses, que un
  texto libre no.

  Lo que no se reconoce es DESCONOCIDO y no se fuerza a parecerse a otro: un
  motivo mal clasificado es peor que uno sin clasificar.
*/
function motivoDelFallo(fallo: string): string {
  const t = fallo.toLowerCase()
  if (t.includes('no está configurado') || t.includes('configurad')) return 'SIN_CONFIGURAR'
  if (t.includes('límite') || t.includes('429')) return 'TOPE_ALCANZADO'
  if (t.includes('rechazó') || t.includes('502')) return 'RECHAZADO'
  if (t.includes('destino') || t.includes('destinatario')) return 'SIN_DESTINATARIO'
  /*
    «Failed to send a request to the Edge Function» entra aquí, y costó un
    renglón de auditoría averiguarlo: es lo que dice `supabase-js` cuando el
    `fetch` a la función ni siquiera llega a responder —porque no está
    desplegada, porque no hay red, o porque el 404 del portal viene sin
    cabeceras CORS y el navegador lo corta—. Sin esta línea se anotaba como
    DESCONOCIDO, que es justo lo que no ayuda a nadie a arreglarlo.
  */
  if (
    t.includes('fetch') ||
    t.includes('network') ||
    t.includes('contactar') ||
    t.includes('edge function') ||
    t.includes('failed to send')
  ) {
    return 'ERROR_DE_RED'
  }
  return 'DESCONOCIDO'
}

/*
  EL RESPALDO COMPRIMIDO, CAMINO DEL CORREO.

  Se comprime aquí y no en el servidor por una razón medida: son 16,5 MB, y
  subirlos desde la cantera a unos 300 kB/s es casi un minuto de espera por algo
  que el navegador ya tiene en la mano. Comprimido son uno o dos megas.

  Y hace falta comprimir de todos modos: en base64 el crudo son 22 MB, Resend
  admite 40, y `auditoria` crece 509 filas al día — la cuenta da unos treinta
  días hasta que deje de caber. Ver `docs/carriles/evaluaciones/`.

  `CompressionStream` es nativo del navegador desde 2023. No hay librería que
  instalar ni que mantener.

  VA EN ZIP Y NO EN GZIP DESDE EL 24/09/2026, y la razón salió de producción:

      [respaldo-por-correo] BREVO HTTP 400 invalid_parameter:
      Unsupported file format: gz

  Brevo tiene lista blanca de extensiones y `gz` no está en ella. Resend no mira
  la extensión, así que esto funcionó mientras hubo un solo servicio y se rompió
  el día que entró el segundo. Zip lo admiten los dos.

  Y de paso arregla algo que no se había mirado: quien recibe el correo abre un
  zip con doble clic en Windows, y un `.gz` le pide instalar algo.
*/
async function mandarPorCorreo(
  sql: string,
  nombreSql: string,
  para: string[],
): Promise<number> {
  // El nombre de dentro es el .sql; el del zip se arma más abajo.
  const bytes = await zipDeUnArchivo(nombreSql, sql)

  /*
    A base64 por trozos.

    `btoa(String.fromCharCode(...bytes))` es lo que se escribe primero y revienta
    con archivos grandes: los argumentos de una llamada tienen tope y un mega de
    bytes lo pasa. Se hace de 32 kB en 32 kB.
  */
  let binario = ''
  const TROZO = 32768
  for (let i = 0; i < bytes.length; i += TROZO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TROZO))
  }

  const { data: sesion } = await supabase.auth.getSession()
  const token = sesion.session?.access_token
  if (!token) throw new Error('La sesión caducó: vuelve a entrar para que se mande el correo.')

  const { error } = await supabase.functions.invoke('respaldo-por-correo', {
    body: {
      archivo: btoa(binario),
      nombre: `${nombreSql}.zip`,
      // Vacío = al correo de quien lo pide. Lo resuelve la función, que es
      // quien sabe de qué sesión viene la llamada.
      ...(para.length > 0 ? { para } : {}),
    },
  })

  /*
    EL FALLO DE RED LLEGA EN INGLÉS, Y ASÍ NO SE PUEDE ENSEÑAR.

    `supabase-js` devuelve «Failed to send a request to the Edge Function»
    cuando el `fetch` no llega a completarse. En la cantera eso se leyó tal cual
    en pantalla y no le dijo nada a nadie. El texto crudo sigue yendo al
    registro del navegador, que es donde lo necesita quien lo va a arreglar.
  */
  if (error) {
    const crudo = error.message ?? String(error)
    console.error('El respaldo no se pudo mandar por correo:', error)
    throw new Error(
      /failed to send a request|failed to fetch|networkerror/i.test(crudo)
        ? 'No se pudo contactar al servicio de correo del sistema. Vuelve a intentarlo dentro de un minuto.'
        : crudo,
    )
  }

  return bytes.length
}
