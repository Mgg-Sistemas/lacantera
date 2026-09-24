/*
  EL RESPALDO DE LA BASE, TAMBIÉN POR CORREO

  Encargo de la líder: que al descargar un respaldo llegue además al correo de
  quien lo pidió, y que una tarea mensual lo mande solo a una dirección fija.

  QUIÉN PUEDE, EN LA VÍA MANUAL. La misma puerta que la descarga y ni un permiso
  más: se pregunta a la base por `respaldo_resumen()`, que contesta `autorizado`
  según el rol de Respaldo. No se comprueba aquí con una lista propia — una
  segunda lista de permisos es una lista que se queda vieja, y esto manda un
  archivo con las cédulas, los sueldos y las cuentas bancarias de todo el
  personal.

  Se pregunta CON LA SESIÓN DE QUIEN LLAMA, no con la llave de servicio. La
  llave de servicio se usa solo para el registro de envíos, que la persona no
  debe poder tocar.

  POR QUÉ EL NAVEGADOR MANDA EL ARCHIVO YA COMPRIMIDO

  El plan primero decía comprimir aquí, para que la vía manual y la del cron
  compartieran código. Se cambió al medirlo: el respaldo son 16,5 MB y la subida
  desde la cantera da unos 300 kB/s, o sea casi un minuto solo en subir lo que el
  navegador ya tenía en la mano. Comprimido son 1 o 2 MB y son segundos.

  Lo que se comparte, entonces, no es el código sino el formato: `.sql.gz` con
  `CompressionStream('gzip')`, que existe igual en el navegador y en Deno.

  LA VÍA DEL CRON, Y POR QUÉ CONTESTA ANTES DE TRABAJAR

  La tarea mensual no tiene navegador ni sesión. Entra por otra puerta, con un
  secreto compartido que vive en el `vault` de la base —no en el cuerpo de una
  función, que `authenticated` puede leer con `pg_get_functiondef`— y que **no es
  la llave de servicio**: si ese secreto se filtra, lo peor que consigue alguien
  es disparar un envío al destinatario ya configurado, que es una dirección de la
  empresa. Si se fuera la llave de servicio, se iría la base entera.

  Y contesta **202 antes de hacer el trabajo**, a propósito. La extensión `http`
  de Postgres es SÍNCRONA: mientras esto no responda, el cron mantiene ocupado un
  worker de la base. Si se respondiera al terminar, el cron esperaría a que se
  arme el respaldo y se mande un correo con megas de adjunto. Con
  `EdgeRuntime.waitUntil` el trabajo sigue después de contestar, que es lo que
  convierte esto en el «POST corto» que decía el plan.

  La contrapartida hay que decirla: quien dispara **no se entera** de si salió
  bien. Por eso el resultado queda en `correos_enviados` pase lo que pase, y ahí
  es donde se mira si el envío del mes ocurrió.

  Le falta `respaldo_datos_programado` en la base, que prepara el carril BD.
  Mientras no exista, esa vía lo dice en el registro en vez de fallar raro.
*/

import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import {
  ErrorCorreo,
  enviarCorreo,
  escaparHtml,
  leerJson,
  plantillaHtml,
  respuestaDeError,
} from '../_compartido/correo.ts'

const FUNCION = 'respaldo-por-correo'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-respaldo-cron',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Peticion {
  /** El `.sql` ya comprimido y en base64. Lo arma el navegador. */
  archivo: string
  nombre: string
  /** A quién se manda. Vacío = al correo de quien lo pide. */
  para?: string[]
  /** Lo que se enseña en el cuerpo, para que el correo diga qué trae. */
  tablas?: number
  filas?: number
}

/** Cliente con la sesión de quien llama: respeta los permisos de la base. */
function comoElUsuario(req: Request) {
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const auth = req.headers.get('Authorization') ?? ''
  if (!url || !anon || !auth) return null
  return createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Cliente con la llave de servicio: para el registro y para la vía del cron. */
function comoElSistema() {
  const url = Deno.env.get('SUPABASE_URL')
  const servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !servicio) return null
  return createClient(url, servicio, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const cifra = (n: number) => new Intl.NumberFormat('es-VE').format(n)

/**
 * Compara dos secretos sin delatar cuánto se acertó.
 *
 * Un `===` sobre cadenas para en la primera letra distinta, y ese tiempo se
 * puede medir: probando letra por letra se reconstruye el secreto entero. Esto
 * recorre siempre lo mismo pase lo que pase.
 */
function mismoSecreto(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diferencia = 0
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diferencia === 0
}

/** El nombre del secreto compartido, tal como lo guarda el vault. */
const SECRETO_CRON = 'respaldo_cron_secreto'

/**
 * Lee el secreto del vault con la llave de servicio.
 *
 * `vault.decrypted_secrets` solo la puede leer `service_role`, así que esto no
 * se alcanza desde el navegador por mucho que se intente.
 */
async function secretoDelVault(
  sistema: NonNullable<ReturnType<typeof comoElSistema>>,
): Promise<string | null> {
  const { data, error } = await sistema
    .schema('vault')
    .from('decrypted_secrets')
    .select('decrypted_secret')
    .eq('name', SECRETO_CRON)
    .maybeSingle()
  if (error) {
    console.error(`[${FUNCION}] no se pudo leer el vault:`, error.message)
    return null
  }
  return data?.decrypted_secret ?? null
}

/** El `.sql` comprimido y en base64, igual que lo hace el navegador. */
async function comprimirABase64(sql: string): Promise<string> {
  const flujo = new Blob([sql]).stream().pipeThrough(new CompressionStream('gzip'))
  const bytes = new Uint8Array(await new Response(flujo).arrayBuffer())
  // De 32 kB en 32 kB: `String.fromCharCode(...bytes)` de un tirón revienta,
  // porque una llamada tiene tope de argumentos y un mega lo pasa.
  let binario = ''
  const TROZO = 32768
  for (let i = 0; i < bytes.length; i += TROZO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TROZO))
  }
  return btoa(binario)
}

/**
 * El envío del mes. Corre DESPUÉS de haber contestado, así que nadie ve lo que
 * devuelve: lo que queda es el registro en `correos_enviados` y estos console.
 */
async function enviarElProgramado(sistema: NonNullable<ReturnType<typeof comoElSistema>>) {
  try {
    const { data: destino, error: errorDestino } = await sistema
      .from('respaldo_destinatarios')
      .select('correo')
      .eq('activo', true)
      .limit(1)
      .maybeSingle()
    if (errorDestino) throw new Error(`destinatario: ${errorDestino.message}`)
    if (!destino?.correo) {
      console.error(`[${FUNCION}] no hay destinatario configurado; no se manda nada`)
      return
    }

    const { data: sql, error: errorSql } = await sistema.rpc('respaldo_datos_programado')
    if (errorSql) throw new Error(`respaldo: ${errorSql.message}`)
    if (!sql || String(sql).length < 100) throw new Error('la base devolvió un respaldo vacío')

    const hoy = new Date().toISOString().slice(0, 10)
    await enviarCorreo({
      funcion: `${FUNCION}-programado`,
      // Sin persona detrás: el tope por hora se cuenta contra el propio sistema.
      usuarioId: '00000000-0000-0000-0000-000000000000',
      admin: sistema,
      to: [destino.correo],
      subject: `Respaldo mensual de la base · ${hoy}`,
      permitirRespaldo: true,
      adjunto: {
        nombre: `respaldo-lacantera-${hoy}.sql.gz`,
        base64: await comprimirABase64(String(sql)),
      },
      html: plantillaHtml(
        'Respaldo mensual de la base de datos',
        `<p>Va adjunto el respaldo automático del <strong>${escaparHtml(hoy)}</strong>. Lo manda el
        sistema solo, una vez al mes; nadie lo pidió.</p>
        <p style="background:#fdf2ec;border-left:4px solid #CC3F00;padding:12px 14px;margin:20px 0">
          <strong>Lleva las cédulas, los sueldos y las cuentas bancarias de todo el personal.</strong>
          Guárdalo donde guardarías el libro de nómina en papel.
        </p>
        <p style="color:#8a8079;font-size:13px">Si esta dirección ya no debe recibirlo, se cambia en
        el sistema, en Respaldo de la base — y hay que decir por qué.</p>`,
      ),
    })
  } catch (e) {
    console.error(
      `[${FUNCION}] el envío programado falló:`,
      e instanceof Error ? e.message : String(e),
    )
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    if (req.method !== 'POST') throw new ErrorCorreo('Método no admitido.', 405)

    /*
      LA VÍA DEL CRON, ANTES QUE NADA.

      Se reconoce por su cabecera y se resuelve sin tocar la sesión: la tarea
      programada no tiene ninguna. Va primero para que el camino de la persona no
      tenga que preguntarse de dónde viene la llamada.
    */
    const secretoRecibido = req.headers.get('x-respaldo-cron')
    if (secretoRecibido) {
      const sistema = comoElSistema()
      if (!sistema) {
        console.error(`[${FUNCION}] faltan las variables del proyecto`)
        throw new ErrorCorreo('El envío programado todavía no está configurado.', 500)
      }
      /*
        El secreto se lee del vault de la base, no de una variable de esta
        función. Así hay UNA copia y no dos: dos copias de un secreto son dos
        sitios donde caduca distinto, y el día que alguien rote una y no la otra
        el cron deja de funcionar sin que nadie sepa por qué.
      */
      const esperado = await secretoDelVault(sistema)
      if (!esperado) {
        console.error(`[${FUNCION}] no hay secreto ${SECRETO_CRON} en el vault`)
        throw new ErrorCorreo('El envío programado todavía no está configurado.', 500)
      }
      if (!mismoSecreto(secretoRecibido, esperado)) {
        console.error(`[${FUNCION}] secreto del cron incorrecto`)
        throw new ErrorCorreo('No autorizado.', 401)
      }

      // 202 ya, y el trabajo detrás. Ver la cabecera del archivo.
      const trabajo = enviarElProgramado(sistema)
      const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } })
        .EdgeRuntime
      if (runtime) runtime.waitUntil(trabajo)
      else void trabajo.catch(() => undefined)

      return new Response(JSON.stringify({ aceptado: true }), {
        status: 202,
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    const usuario = comoElUsuario(req)
    const sistema = comoElSistema()
    if (!usuario || !sistema) {
      console.error(`[${FUNCION}] faltan las variables del proyecto`)
      throw new ErrorCorreo('El envío de correo todavía no está configurado.', 500)
    }

    const { data: quienSoy, error: errorSesion } = await usuario.auth.getUser()
    if (errorSesion || !quienSoy?.user) throw new ErrorCorreo('Hay que iniciar sesión.', 401)

    /*
      LA MISMA PUERTA QUE LA DESCARGA.

      `respaldo_resumen` ya contesta si esta persona puede respaldar. Se le
      pregunta a ella en vez de resolverlo aquí: el día que cambie quién puede,
      cambia en un sitio.
    */
    const { data: resumen, error: errorResumen } = await usuario.rpc('respaldo_resumen')
    if (errorResumen) {
      console.error(`[${FUNCION}] no se pudo comprobar el permiso:`, errorResumen.message)
      throw new ErrorCorreo('No se pudo comprobar tu permiso para esto.', 500)
    }
    const fila = Array.isArray(resumen) ? resumen[0] : resumen
    if (!fila?.autorizado) {
      throw new ErrorCorreo(
        'Mandar el respaldo por correo requiere el rol de Respaldo de la base.',
        403,
      )
    }

    const cuerpo = await leerJson<Peticion>(req)
    if (!cuerpo.archivo || !cuerpo.nombre) {
      throw new ErrorCorreo('No llegó el archivo del respaldo.')
    }

    /*
      A QUIÉN. Por defecto, al correo de quien lo pide y a nadie más.

      Es el caso que pidió la líder —«enviarse por correo electrónico al
      usuario»— y además el único que no necesita pensarse dos veces: mandarte a
      ti mismo lo que acabas de descargar no reparte nada que no tuvieras ya.
    */
    const para = cuerpo.para && cuerpo.para.length > 0 ? cuerpo.para : [quienSoy.user.email ?? '']

    const cuando = new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })
    const detalle =
      cuerpo.tablas && cuerpo.filas
        ? `<p><strong>${cifra(cuerpo.tablas)}</strong> tablas · alrededor de <strong>${cifra(cuerpo.filas)}</strong> filas.</p>`
        : ''

    const { destinatarios, id } = await enviarCorreo({
      funcion: FUNCION,
      usuarioId: quienSoy.user.id,
      admin: sistema,
      to: para,
      subject: `Respaldo de la base · ${cuando}`,
      permitirRespaldo: true,
      adjunto: { nombre: cuerpo.nombre, base64: cuerpo.archivo },
      html: plantillaHtml(
        'Respaldo de la base de datos',
        `<p>Va adjunto el respaldo que descargaste el <strong>${escaparHtml(cuando)}</strong>.</p>
        ${detalle}
        <p style="background:#fdf2ec;border-left:4px solid #CC3F00;padding:12px 14px;margin:20px 0">
          <strong>Este archivo lleva las cédulas, los sueldos y las cuentas bancarias de todo el
          personal</strong>, además de los precios, los clientes y la bitácora completa. Todo lo que
          el sistema protege con permisos, junto y sin ninguna protección.
        </p>
        <p>Viene comprimido. Para restaurarlo hacen falta dos cosas y en este orden: las migraciones
        del repositorio sobre una base limpia, y después este archivo.</p>
        <p style="color:#8a8079;font-size:13px">Quedó anotado en la auditoría que lo descargaste tú,
        con la fecha y la hora.</p>`,
      ),
    })

    return new Response(JSON.stringify({ ok: true, destinatarios: destinatarios.length, id }), {
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  } catch (e) {
    const r = respuestaDeError(FUNCION, e)
    return new Response(r.body, { status: r.status, headers: { ...CORS, ...r.headers } })
  }
})
