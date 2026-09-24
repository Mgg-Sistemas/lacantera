/*
  EL RESPALDO DE LA BASE, TAMBIÉN POR CORREO

  Encargo de la líder: que al descargar un respaldo llegue además al correo de
  quien lo pidió, y que una tarea mensual lo mande solo a una dirección fija.

  QUIÉN PUEDE. La misma puerta que la descarga y ni un permiso más: se pregunta
  a la base por `respaldo_resumen()`, que contesta `autorizado` según el rol de
  Respaldo. No se comprueba aquí con una lista propia — una segunda lista de
  permisos es una lista que se queda vieja, y esta manda un archivo con las
  cédulas, los sueldos y las cuentas bancarias de todo el personal.

  Se pregunta CON LA SESIÓN DE QUIEN LLAMA, no con la llave de servicio. La
  llave de servicio se usa solo para el registro de envíos, que la persona no
  debe poder tocar.

  POR QUÉ EL NAVEGADOR MANDA EL ARCHIVO YA COMPRIMIDO

  El plan primero decía comprimir aquí, para que la vía manual y la del cron
  compartieran código. Se cambió al medirlo: el respaldo son 16,5 MB y la subida
  desde la cantera da unos 300 kB/s, o sea **casi un minuto** solo en subir lo
  que el navegador ya tenía en la mano. Comprimido son 1 o 2 MB y son segundos.

  Lo que se comparte, entonces, no es el código sino el formato: `.sql.gz` con
  `CompressionStream('gzip')`, que existe igual en el navegador y en Deno. Son
  dos líneas repetidas a cambio de cincuenta segundos de espera, y se acepta el
  trato a propósito.

  LO QUE FALTA PARA EL CRON. La tarea mensual no tiene navegador ni sesión, así
  que necesita una función de base que arme el respaldo sin `auth.uid()`. La
  prepara el carril BD; mientras no exista, esta función solo atiende la vía
  manual y lo dice con un error claro en vez de fallar de forma rara.
*/

import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import {
  ErrorCorreo,
  enviarCorreo,
  escaparHtml,
  json,
  leerJson,
  plantillaHtml,
  respuestaDeError,
} from '../_compartido/correo.ts'

const FUNCION = 'respaldo-por-correo'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

/** Cliente con la llave de servicio: solo para el registro de envíos. */
function comoElSistema() {
  const url = Deno.env.get('SUPABASE_URL')
  const servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !servicio) return null
  return createClient(url, servicio, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const cifra = (n: number) => new Intl.NumberFormat('es-VE').format(n)

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    if (req.method !== 'POST') throw new ErrorCorreo('Método no admitido.', 405)

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
      usuario»— y además el único que no necesita pensarse dos veces: mandarte
      a ti mismo lo que acabas de descargar no reparte nada que no tuvieras ya.
    */
    const para =
      cuerpo.para && cuerpo.para.length > 0 ? cuerpo.para : [quienSoy.user.email ?? '']

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
        `
        <p>Va adjunto el respaldo que descargaste el <strong>${escaparHtml(cuando)}</strong>.</p>
        ${detalle}
        <p style="background:#fdf2ec;border-left:4px solid #CC3F00;padding:12px 14px;margin:20px 0">
          <strong>Este archivo lleva las cédulas, los sueldos y las cuentas bancarias de todo el
          personal</strong>, además de los precios, los clientes y la bitácora completa. Todo lo
          que el sistema protege con permisos, junto y sin ninguna protección.
        </p>
        <p>Viene comprimido. Para restaurarlo hacen falta dos cosas y en este orden: las
        migraciones del repositorio sobre una base limpia, y después este archivo.</p>
        <p style="color:#8a8079;font-size:13px">Quedó anotado en la auditoría que lo descargaste
        tú, con la fecha y la hora.</p>`,
      ),
    })

    return json({ ok: true, destinatarios: destinatarios.length, id }, 200)
  } catch (e) {
    const r = respuestaDeError(FUNCION, e)
    return new Response(r.body, { status: r.status, headers: { ...CORS, ...r.headers } })
  }
})
