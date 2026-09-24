/*
  EL ÚNICO SITIO POR DONDE SALE UN CORREO

  Adaptado del módulo compartido de Golden Touch, que ya resolvió esto y aprendió
  lo caro. Su comentario de cabecera explica por qué no basta con un `fetch`:

    «Las seis funciones enviar-* repetían el mismo fetch, cada una con su propia
    (y laxa) validación. Eso las volvía un relay de phishing: cualquier usuario
    activo podía mandar, desde el remitente verificado de la empresa (SPF/DKIM
    válidos), cualquier adjunto a cualquier lista de correos.»

  Ese es el riesgo de verdad. Un servicio de correo con el dominio de la empresa
  verificado manda mensajes que pasan todos los filtros: si cualquiera puede
  decidir el destinatario y el adjunto, lo que se ha construido es una máquina de
  suplantar a la empresa con su propia firma.

  QUÉ CAMBIA RESPECTO AL ORIGINAL

  · Dos servicios posibles, Brevo o Resend: otro endpoint, otra cabecera y otra
    forma del cuerpo. Manda Brevo si está su llave; si no, Resend.
  · El modelo de permisos de esta casa —`private.tiene_permiso`— en vez del
    `role` de Golden Touch.
  · El adjunto es `.sql.zip` y no `.sql.txt`: el respaldo se comprime porque a
    16,5 MB en crudo son 22 en base64, y en un mes deja de caber en los 40 MB
    que admite Resend. Ver `docs/carriles/evaluaciones/`.
  · Castellano de esta casa, no de la otra.

  Secretos, Brevo:  BREVO_API_KEY  · BREVO_FROM_EMAIL  · BREVO_FROM_NAME
  Secretos, Resend: RESEND_API_KEY · RESEND_FROM_EMAIL · RESEND_FROM_NAME

  POR QUÉ SE ELIGE SOLO Y NO CON UN INTERRUPTOR

  Angélica, 24/09/2026, pidió mandar por Brevo. Cambiar de servicio es poner
  tres secretos, no tocar código ni volver a desplegar: mientras BREVO_API_KEY
  esté puesta manda Brevo, y quitarla devuelve el sistema a Resend sin que nadie
  se quede sin correo entre una cosa y la otra.

  EL ADJUNTO NO PESA LO MISMO EN LOS DOS. Resend admite 40 MB de payload y Brevo
  10: el respaldo de la base va comprimido y hoy cabe en los dos, pero el tope
  cambia con el servicio para que el error salga aquí, con su explicación, y no
  como un rechazo del servicio que nadie sabe leer.
*/

export const MAX_DESTINATARIOS = 10
export const MAX_ASUNTO = 150
/** 25 MB en base64 ≈ 33 MB de payload, con holgura bajo los 40 de Resend. */
export const MAX_ADJUNTO_BYTES = 25 * 1024 * 1024
/** Brevo admite 10 MB de payload: 6 MB en crudo son ~8 en base64, con holgura. */
export const MAX_ADJUNTO_BYTES_BREVO = 6 * 1024 * 1024
export const MAX_CORREOS_POR_HORA = 30

const PREFIJO_ASUNTO = '[La Cantera] '
const REMITENTE_POR_DEFECTO = 'Sistema · Minería Internacional TS'
const RESEND_URL = 'https://api.resend.com/emails'
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email'

/** Quién manda hoy. Lo decide la llave que esté puesta, y Brevo tiene prioridad. */
export function servicioDeCorreo(): 'BREVO' | 'RESEND' {
  return Deno.env.get('BREVO_API_KEY') ? 'BREVO' : 'RESEND'
}

/** Lo que admite de adjunto el servicio que manda hoy. */
export function topeDeAdjunto(): number {
  return servicioDeCorreo() === 'BREVO' ? MAX_ADJUNTO_BYTES_BREVO : MAX_ADJUNTO_BYTES
}

/*
  Un correo y solo uno. Sin espacios, comas ni punto y coma: es lo que impide
  que «a@b.com,d@e.com» entre como si fuera una dirección y acabe siendo dos.
*/
const RX_CORREO = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/
const RX_NOMBRE_PDF = /^[\w.\- ]{1,120}\.pdf$/
/*
  EL RESPALDO VIAJA EN ZIP DESDE EL 24/09/2026.

  Iba en gzip y Brevo lo rechazó en producción —«Unsupported file format: gz»—
  porque tiene lista blanca de extensiones. Resend no la tiene, así que el
  fallo apareció el día que entró el segundo servicio y no antes. Ver
  `src/lib/zip.ts`.
*/
const RX_NOMBRE_RESPALDO = /^[\w.\- ]{1,120}\.sql\.zip$/
const RX_BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

export function escaparHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Error con mensaje pensado para enseñárselo a quien lo provocó. */
export class ErrorCorreo extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export function validarDestinatarios(entrada: unknown): string[] {
  const crudos = Array.isArray(entrada) ? entrada : entrada == null || entrada === '' ? [] : [entrada]
  const lista: string[] = []
  for (const e of crudos) {
    if (typeof e !== 'string') throw new ErrorCorreo('Hay un destinatario que no es un correo.')
    const limpio = e.trim().toLowerCase()
    if (!limpio) continue
    if (limpio.length > 254 || !RX_CORREO.test(limpio)) {
      throw new ErrorCorreo('Hay un correo de destino que no es válido.')
    }
    if (!lista.includes(limpio)) lista.push(limpio)
  }
  if (lista.length > MAX_DESTINATARIOS) {
    throw new ErrorCorreo(`No se puede mandar a más de ${MAX_DESTINATARIOS} correos a la vez.`)
  }
  return lista
}

/*
  El asunto, en una sola línea.

  Los saltos de línea se quitan y no es cosmético: un asunto con un `\n` dentro
  permite inyectar cabeceras en algunos servidores de correo, y ahí se acaba
  mandando copia oculta a quien no debía.
*/
export function normalizarAsunto(asunto: string): string {
  let s = String(asunto ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (!s) s = 'Aviso del sistema'
  if (!s.startsWith(PREFIJO_ASUNTO.trim())) s = PREFIJO_ASUNTO + s
  return s.length > MAX_ASUNTO ? `${s.slice(0, MAX_ASUNTO - 1)}…` : s
}

/**
 * Sanea el nombre del adjunto y exige una extensión de las conocidas.
 *
 * El `.sql.zip` solo se admite si quien llama lo habilita: es el respaldo de la
 * base, y no debe poder colarse desde una función que manda un PDF.
 */
export function normalizarNombreAdjunto(nombre: string, permitirRespaldo: boolean): string {
  const limpio = String(nombre ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.\- ]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[.\- ]+/, '')
    .trim()
  if (RX_NOMBRE_PDF.test(limpio)) return limpio
  if (permitirRespaldo && RX_NOMBRE_RESPALDO.test(limpio)) return limpio
  throw new ErrorCorreo('Ese tipo de adjunto no se puede mandar.')
}

/**
 * Comprueba el base64 antes de mandarlo: forma, tamaño y que sea lo que dice.
 *
 * El tamaño se calcula sin decodificar. Decodificar 25 MB para medirlos es
 * gastar la memoria de la función en averiguar si cabe.
 */
function validarContenido(base64: string, esPdf: boolean, esZip: boolean): void {
  const b64 = String(base64 ?? '').replace(/\s+/g, '')
  if (!b64 || b64.length % 4 !== 0 || !RX_BASE64.test(b64)) {
    throw new ErrorCorreo('El adjunto llegó mal formado.')
  }
  const bytes = (b64.length / 4) * 3 - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0)
  const tope = topeDeAdjunto()
  if (bytes > tope) {
    throw new ErrorCorreo(
      `El adjunto pesa más de ${Math.round(tope / 1048576)} MB y no se puede mandar por correo.`,
      413,
    )
  }

  let cabecera: string
  try {
    cabecera = atob(b64.slice(0, 8))
  } catch {
    throw new ErrorCorreo('El adjunto llegó mal formado.')
  }
  // Un PDF empieza por %PDF. Comprobarlo cuesta nada y
  // evita que el nombre diga una cosa y el contenido sea otra.
  if (esPdf && !cabecera.startsWith('%PDF')) {
    throw new ErrorCorreo('Ese archivo no es un PDF.')
  }
  // PK\x03\x04, que es como empieza todo zip. Se comprueba por lo mismo que el
  // %PDF: el nombre lo pone quien llama y la firma la pone quien lo creó.
  if (
    esZip &&
    !(
      cabecera.charCodeAt(0) === 0x50 &&
      cabecera.charCodeAt(1) === 0x4b &&
      cabecera.charCodeAt(2) === 0x03 &&
      cabecera.charCodeAt(3) === 0x04
    )
  ) {
    throw new ErrorCorreo('Ese archivo no es un comprimido válido.')
  }
}

/** El cuerpo del correo, con la marca de la casa. */
export function plantillaHtml(titulo: string, cuerpoHtml: string): string {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;color:#1f1a17">
      <h2 style="border-bottom:3px solid #CC3F00;padding-bottom:8px;margin-top:0">${escaparHtml(titulo)}</h2>
      ${cuerpoHtml}
      <p style="color:#8a8079;font-size:12px;margin-top:32px;border-top:1px solid #e3ddd7;padding-top:12px">
        MINERÍA INTERNACIONAL TS, C.A. · Sistema administrativo · Este correo lo generó el sistema
      </p>
    </div>`
}

export type Adjunto = { nombre: string; base64: string }

export type OpcionesCorreo = {
  /** Cómo se llama la función que manda. Queda escrito en el registro. */
  funcion: string
  /** Para contar cuántos lleva mandados esta persona en la última hora. */
  usuarioId: string
  /** Cliente con la llave de servicio, para leer y escribir el registro. */
  admin: {
    from: (tabla: string) => any
  }
  to: string[]
  subject: string
  html: string
  adjunto?: Adjunto
  /** Habilita el `.sql.zip`. Solo la función del respaldo lo enciende. */
  permitirRespaldo?: boolean
}

export type ResultadoCorreo = { destinatarios: string[]; id: string | null }

/**
 * Manda el correo. Es el único sitio del sistema que habla con Brevo o Resend.
 *
 * Valida, cuenta, manda y registra — en ese orden. Si algo falla, lo que sale
 * hacia quien llamó es un mensaje genérico; el detalle queda en el registro de
 * la función, sin destinatarios.
 */
export async function enviarCorreo(o: OpcionesCorreo): Promise<ResultadoCorreo> {
  const destinatarios = validarDestinatarios(o.to)
  if (!destinatarios.length) throw new ErrorCorreo('Hace falta al menos un correo de destino.')
  const subject = normalizarAsunto(o.subject)

  let attachments: { filename: string; content: string }[] | undefined
  if (o.adjunto) {
    const nombre = normalizarNombreAdjunto(o.adjunto.nombre, Boolean(o.permitirRespaldo))
    const content = String(o.adjunto.base64 ?? '').replace(/\s+/g, '')
    validarContenido(content, nombre.endsWith('.pdf'), nombre.endsWith('.zip'))
    attachments = [{ filename: nombre, content }]
  }

  /*
    EL TOPE POR PERSONA, QUE ES LO QUE CONVIERTE UN FALLO EN UN INCIDENTE.

    Sin él, una llave filtrada o un bucle mal escrito mandan miles de correos
    firmados por la empresa antes de que nadie lo note, y lo que se pierde no es
    la cuota: es la reputación del dominio, que tarda meses en volver.
  */
  const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error: errorCuenta } = await o.admin
    .from('correos_enviados')
    .select('id', { count: 'exact', head: true })
    .eq('usuario_id', o.usuarioId)
    .gte('enviado_en', desde)
  if (errorCuenta) {
    console.error(`[${o.funcion}] no se pudo leer correos_enviados:`, errorCuenta.message)
    throw new ErrorCorreo('No se pudo mandar el correo. Vuelve a intentarlo en un rato.', 500)
  }
  if ((count ?? 0) >= MAX_CORREOS_POR_HORA) {
    throw new ErrorCorreo(
      `Llegaste al límite de ${MAX_CORREOS_POR_HORA} correos por hora. Prueba más tarde.`,
      429,
    )
  }

  const servicio = servicioDeCorreo()
  const esBrevo = servicio === 'BREVO'
  const llave = Deno.env.get(esBrevo ? 'BREVO_API_KEY' : 'RESEND_API_KEY')
  const remitente = Deno.env.get(esBrevo ? 'BREVO_FROM_EMAIL' : 'RESEND_FROM_EMAIL')
  const nombreRemitente =
    Deno.env.get(esBrevo ? 'BREVO_FROM_NAME' : 'RESEND_FROM_NAME') || REMITENTE_POR_DEFECTO
  if (!llave || !remitente) {
    console.error(`[${o.funcion}] faltan los secretos de ${servicio}`)
    throw new ErrorCorreo('El envío de correo todavía no está configurado.', 500)
  }

  /*
    El remitente tiene que estar verificado en el servicio. Si no lo está, la
    respuesta es un rechazo del servicio y el correo no sale: queda en el
    registro de la función, no en la pantalla de quien lo pidió.
  */
  const url = esBrevo ? BREVO_URL : RESEND_URL
  const cabeceras: Record<string, string> = esBrevo
    ? { 'api-key': llave, 'content-type': 'application/json', accept: 'application/json' }
    : { authorization: `Bearer ${llave}`, 'content-type': 'application/json' }
  const cuerpoPeticion = esBrevo
    ? {
        sender: { name: nombreRemitente, email: remitente },
        to: destinatarios.map((email) => ({ email })),
        subject,
        htmlContent: o.html,
        ...(attachments
          ? { attachment: attachments.map((a) => ({ name: a.filename, content: a.content })) }
          : {}),
      }
    : {
        from: `${nombreRemitente} <${remitente}>`,
        to: destinatarios,
        subject,
        html: o.html,
        ...(attachments ? { attachments } : {}),
      }

  let resp: Response
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: cabeceras,
      body: JSON.stringify(cuerpoPeticion),
      // Los dos tardan poco; treinta segundos es de sobra incluso con adjunto
      // grande, y sin tope la función se queda colgada hasta que la maten.
      signal: AbortSignal.timeout(30_000),
    })
  } catch (e) {
    console.error(
      `[${o.funcion}] no se pudo contactar a ${servicio} (${destinatarios.length} destinatario/s):`,
      e instanceof Error ? e.name : String(e),
    )
    throw new ErrorCorreo('No se pudo contactar al servicio de correo. Vuelve a intentarlo.', 502)
  }

  const texto = await resp.text()
  // Brevo devuelve `messageId`; Resend, `id`. El registro guarda el que venga.
  let cuerpo:
    | { id?: string; messageId?: string; message?: string; name?: string; code?: string }
    | null = null
  try {
    cuerpo = texto ? JSON.parse(texto) : null
  } catch {
    /* el servicio contestó algo que no era JSON */
  }
  if (!resp.ok) {
    console.error(
      `[${o.funcion}] ${servicio} HTTP ${resp.status} ${cuerpo?.name ?? cuerpo?.code ?? '-'}:`,
      (cuerpo?.message ?? texto).slice(0, 300),
    )
    /*
      EL CÓDIGO DEL SERVICIO SÍ SALE A PANTALLA. SU MENSAJE, NO.

      No es la misma cosa. El mensaje es texto libre y puede traer la dirección
      que rechazó, una cabecera o el detalle de la cuenta; eso no debe acabar en
      la pantalla de nadie ni en un renglón de auditoría. El código es de una
      lista corta del propio servicio —`unauthorized`, `invalid_parameter`,
      `permission_denied`, `account_under_validation`— y no lleva ningún dato de
      nadie.

      Sin él, «El servicio de correo rechazó el envío» obliga a entrar al panel
      de Supabase a leer el registro para saber si es la llave, el remitente o
      la cuenta sin aprobar. Con él, se sabe desde la pantalla. Lo pidió la
      realidad: 24/09/2026, tres intentos fallidos sin poder decir por qué.
    */
    const senal = String(cuerpo?.code ?? cuerpo?.name ?? `HTTP ${resp.status}`).slice(0, 60)
    throw new ErrorCorreo(`El servicio de correo rechazó el envío (${senal}).`, 502)
  }

  const { error: errorRegistro } = await o.admin.from('correos_enviados').insert({
    usuario_id: o.usuarioId,
    funcion: o.funcion,
    destinatarios: destinatarios.length,
    asunto: subject,
    mensaje_id: cuerpo?.id ?? cuerpo?.messageId ?? null,
  })
  // Que no se pueda anotar no deshace un correo ya mandado: se avisa y sigue.
  if (errorRegistro) {
    console.error(`[${o.funcion}] no se pudo registrar el envío:`, errorRegistro.message)
  }

  return { destinatarios, id: cuerpo?.id ?? cuerpo?.messageId ?? null }
}

/** Convierte cualquier error en una respuesta que se puede enseñar. */
export function respuestaDeError(funcion: string, e: unknown): Response {
  if (e instanceof ErrorCorreo) return json({ error: e.message }, e.status)
  console.error(`[${funcion}] error inesperado:`, e instanceof Error ? e.message : String(e))
  return json({ error: 'No se pudo mandar el correo.' }, 500)
}

/** Lee el cuerpo JSON de la petición, o falla con un mensaje claro. */
export async function leerJson<T>(req: Request): Promise<T> {
  try {
    const b = await req.json()
    if (!b || typeof b !== 'object') throw new Error('no es un objeto')
    return b as T
  } catch {
    throw new ErrorCorreo('La petición no traía un cuerpo JSON válido.')
  }
}
