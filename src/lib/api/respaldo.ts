import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
        DESCARGAR ES DESCARGAR, Y NADA MÁS.

        Hasta hoy esto mandaba además un correo a quien pulsaba. Tenía sentido
        mientras era la única forma de que el respaldo saliera de la máquina;
        dejó de tenerlo el 24/09/2026, cuando la líder pidió un botón propio de
        «Enviar por correo». Ella misma lo dijo al verlo: «si estoy descargando,
        ¿por qué me sale lo del envío de correo?».

        Y no era solo ruido. El correo fallaba —el servicio de correo estaba a
        medio configurar— y cada descarga buena terminaba con una línea amarilla
        de advertencia debajo. Una descarga que salió bien no debe parecer que
        salió a medias.

        Quien quiera las dos cosas las pide dos veces, que son dos botones y
        están uno al lado del otro.
      */
      return { bytes: blob.size, nombre: enlace.download }
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

    Ojo con lo que NO va aquí: «non-2xx status code» suena parecido y es lo
    contrario. Ahí la función contestó, y contestó que no. Eso es un rechazo,
    y mezclarlo con la red haría buscar el problema en el sitio equivocado.
  */
  if (t.includes('non-2xx')) return 'RECHAZADO'
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
    console.error('El respaldo no se pudo mandar por correo:', error)
    throw new Error(await razonDelFallo(error))
  }

  return bytes.length
}

/*
  LO QUE DE VERDAD CONTESTÓ LA FUNCIÓN.

  `supabase-js` tapa el motivo con dos frases que no le dicen nada a nadie:
  «Failed to send a request to the Edge Function» cuando la petición no llega a
  contestar, y «Edge Function returned a non-2xx status code» cuando contesta
  con error. La segunda es la peor de las dos, porque la función SÍ explicó qué
  pasó —«El servicio de correo rechazó el envío», «El envío de correo todavía no
  está configurado»— y esa explicación se tira a la basura.

  No se tira del todo: el `Response` sin leer sigue colgando de `error.context`,
  y el cuerpo es `{ error: '…' }`. De ahí sale el texto que se enseña. Las dos
  veces que esto falló en la cantera —24/09/2026, 8:37 y 10:23— se perdió media
  mañana averiguando por fuera algo que el servidor ya había contestado.
*/
async function razonDelFallo(error: unknown): Promise<string> {
  const contexto = (error as { context?: unknown }).context
  if (contexto instanceof Response) {
    try {
      const cuerpo = await contexto.clone().json()
      const dicho = typeof cuerpo?.error === 'string' ? cuerpo.error.trim() : ''
      if (dicho) return dicho
    } catch {
      /* la función contestó algo que no era JSON */
    }
  }

  const crudo = error instanceof Error ? error.message : String(error)
  if (/failed to send a request|failed to fetch|networkerror/i.test(crudo)) {
    return 'No se pudo contactar al servicio de correo del sistema. Vuelve a intentarlo dentro de un minuto.'
  }
  if (/non-2xx/i.test(crudo)) {
    return 'El servicio de correo contestó con un error y no dijo cuál. Mira el registro de la función en Supabase.'
  }
  return crudo
}

// ---------------------------------------------------------------------------
// A quién se manda el respaldo automático
// ---------------------------------------------------------------------------

/*
  EL DESTINATARIO DEL ENVÍO MENSUAL, QUE HASTA HOY NO TENÍA PANTALLA.

  La tabla y la función existen desde el 24/09/2026 y nadie podía llenarlas: el
  envío automático no se ha podido encender nunca porque no hay a quién
  mandárselo. Esto es lo que faltaba del encargo original —«el correo se indica
  después en sistema, justificando el porqué»—.

  UNO SOLO ACTIVO, Y LOS ANTERIORES SE GUARDAN. Lo garantiza un índice único en
  la base, y `guardar_destinatario_del_respaldo` apaga el anterior antes de
  poner el nuevo. Los viejos no se borran: quedan con su motivo y su fecha, que
  es lo que convierte esto en un rastro y no en un campo.

  QUIÉN LO VE Y QUIÉN LO CAMBIA NO SON LOS MISMOS. Leerlo lo puede quien tenga
  RESPALDO en lectura; cambiarlo, solo el rol de administrador —lo exige la
  función, no la pantalla—. Por eso la pantalla enseña el destinatario a quien
  puede verlo y el botón solo a quien puede tocarlo: un botón que va a rebotar
  contra un permiso manda a alguien a que el sistema le diga que no.
*/
export interface DestinatarioDelRespaldo {
  id: number
  correo: string
  nombre: string | null
  activo: boolean
  motivo: string
  puesto_en: string
}

export function useDestinatariosDelRespaldo() {
  return useQuery({
    queryKey: ['respaldo', 'destinatarios'],
    queryFn: async (): Promise<DestinatarioDelRespaldo[]> => {
      const { data, error } = await supabase
        .from('respaldo_destinatarios')
        .select('id, correo, nombre, activo, motivo, puesto_en')
        // El activo primero y el resto por fecha: arriba lo que rige hoy,
        // debajo la historia de a quién se le mandó antes y por qué.
        .order('activo', { ascending: false })
        .order('puesto_en', { ascending: false })
      if (error) throw error
      return (data ?? []) as DestinatarioDelRespaldo[]
    },
  })
}

export function useGuardarDestinatarioDelRespaldo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: { correo: string; motivo: string; nombre?: string | null }) =>
      rpc<number>('guardar_destinatario_del_respaldo', {
        p_correo: d.correo,
        p_motivo: d.motivo,
        p_nombre: d.nombre ?? null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['respaldo'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Cada cuánto se manda
// ---------------------------------------------------------------------------

/*
  LA PROGRAMACIÓN DEL ENVÍO AUTOMÁTICO.

  La hora es SIEMPRE de Caracas, aquí y en la base. La conversión a la hora del
  servidor —que corre en GMT— la hace `programar_respaldo`, y no es un detalle:
  el cron estaba puesto en `0 8 1 * *` creyendo que eran las 8:00 y eran las
  4:00 de la madrugada. Tres de los cuatro trabajos programados de la casa sí
  llevaban la conversión hecha; el del respaldo no.

  `encendido` NO ES `activo`. Activo es lo que alguien pidió; encendido es si de
  verdad va a salir un correo, que además necesita el secreto del vault y un
  destinatario. `por_que_no` dice qué falta, con las razones unidas por ' · '.

  Y `proxima_vez` ES NULA MIENTRAS NO ESTÉ ENCENDIDO, a propósito: una pantalla
  que dice «el próximo sale el lunes» cuando no va a salir ninguno es peor que
  una que calla.
*/
export type Cadencia = 'SEMANAL' | 'QUINCENAL' | 'MENSUAL'

export interface ProgramacionDelRespaldo {
  cadencia: Cadencia | null
  /** SEMANAL: 1 lunes … 7 domingo. MENSUAL: 1..28. QUINCENAL: nulo, son el 1 y el 16. */
  dia: number | null
  hora: number | null
  minuto: number | null
  activo: boolean | null
  motivo: string | null
  puesto_en: string | null
  /** Si quien mira puede siquiera verla. Es columna y no excepción, como en `respaldo_resumen`. */
  autorizado: boolean
  encendido: boolean
  por_que_no: string | null
  proxima_vez: string | null
}

export function useProgramacionDelRespaldo() {
  return useQuery({
    queryKey: ['respaldo', 'programacion'],
    queryFn: async (): Promise<ProgramacionDelRespaldo> => {
      const filas = await rpc<ProgramacionDelRespaldo[]>('respaldo_programacion_actual')
      return Array.isArray(filas) ? filas[0] : filas
    },
  })
}

export function useProgramarRespaldo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: {
      cadencia: Cadencia
      dia: number | null
      hora: number
      minuto: number
      activo: boolean
      motivo: string
    }) =>
      rpc<void>('programar_respaldo', {
        p_cadencia: p.cadencia,
        p_dia: p.dia,
        p_hora: p.hora,
        p_minuto: p.minuto,
        p_activo: p.activo,
        p_motivo: p.motivo,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['respaldo'] })
    },
  })
}

/*
  EL DÍA 28 CON HORA TARDÍA SE SALTA FEBRERO, Y HAY QUE FRENARLO ANTES.

  El día del mes se topa en 28 para que «el 31» no se salte los meses cortos.
  Pero la conversión a la hora del servidor vuelve a crear ese mismo fallo en el
  borde: el 28 a las 21:00 de Caracas es el 29 en GMT, y el 29 no existe en
  febrero de un año común. Ese mes se saltaría sin avisar.

  La base lo rechaza —tiene que hacerlo, porque a la función se puede llamar sin
  pasar por aquí— y la pantalla lo dice antes de que se pulse. Lo que no hace
  ninguna de las dos es moverlo en silencio al 27 o a las 19:00: una
  programación que no es la que alguien escribió es una que nadie va a volver a
  mirar.
*/
export const HORA_QUE_YA_CRUZA = 20

export function loQueImpideProgramar(p: {
  cadencia: Cadencia
  dia: number | null
  hora: number
  motivo: string
}): string | null {
  if (p.cadencia !== 'QUINCENAL' && !p.dia) return 'Falta elegir el día.'
  if (p.cadencia === 'MENSUAL' && p.dia === 28 && p.hora >= HORA_QUE_YA_CRUZA) {
    return `El día 28 a las ${String(p.hora).padStart(2, '0')}:00 de Caracas cae el día 29 en la hora del servidor, y febrero no tiene 29: ese mes se saltaría. Elige un día anterior, o una hora antes de las ${HORA_QUE_YA_CRUZA}:00.`
  }
  if (p.motivo.trim().length < 4) return 'Falta decir por qué se programa así.'
  return null
}

/*
  EL ÚLTIMO INTENTO DEL PROGRAMADOR, PARA PODER DECIRLO EN LA TARJETA.

  Nació de un reporte del usuario que valía por cuatro: «no se aprecia ni
  detecta que el cron esté funcionando». Y el cron SÍ estaba funcionando —se
  despertó a las 12:45:00 en punto— pero no había dónde verlo.

  El rastro acabó existiendo en la auditoría, y aun así no bastaba por dos
  motivos que solo se ven juntos: la pantalla de auditoría **esconde por
  defecto** lo que hace el sistema, y además pide el rol de administrador,
  mientras que esta pantalla la abre quien tenga el de Respaldo. O sea que el
  encargado de los respaldos no podía ver si su propio envío había corrido.

  Por eso el dato viene aquí, donde alguien ya está mirando cuando se pregunta
  si esto funciona. La auditoría sigue teniendo la historia completa; esto es
  el semáforo, que es otra pregunta.

  `cuando` SALE DEL CRON Y NO DE LA CONSTANCIA, a propósito. Son dos cosas
  distintas —cuándo se despertó y cuándo dejó dicho algo— y hoy ni siquiera
  coinciden: corrió a las 12:45 y el rastro se montó a las 13:46. Leyéndolo del
  cron, la tarjeta dice la verdad aunque algún día la función muera antes de
  poder anotar nada.

  Y `resultado` VIENE ESCRITO DE LA BASE. Es la misma frase que se guarda en la
  auditoría. Componerla aquí daría dos redacciones de lo mismo, y dos
  redacciones de lo mismo se separan.
*/
export interface UltimoIntentoDelRespaldo {
  /** Cuándo se despertó la tarea. Nulo si no ha corrido nunca. */
  cuando: string | null
  /** Lo que dice pg_cron: `succeeded` o `failed`. */
  estado: string | null
  /** Nulo cuando la pasada es anterior a que existiera el rastro. */
  enviado: boolean | null
  motivo: string | null
  resultado: string | null
}

export function useUltimoIntentoDelRespaldo() {
  return useQuery({
    queryKey: ['respaldo', 'ultimo-intento'],
    queryFn: async (): Promise<UltimoIntentoDelRespaldo | null> => {
      const filas = await rpc<UltimoIntentoDelRespaldo[]>('respaldo_ultimo_intento')
      const fila = Array.isArray(filas) ? filas[0] : filas
      return fila ?? null
    },
  })
}
