import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
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

export function useDescargarRespaldo() {
  return useMutation({
    mutationFn: async () => {
      const sql = await rpc<string>('respaldo_datos')

      if (!sql || sql.length < 100) {
        throw new Error('La base devolvió un respaldo vacío. No se descargó nada.')
      }

      /*
        `text/plain` y no `application/sql`: el segundo no lo reconocen todos
        los navegadores y alguno lo abre en una pestaña en vez de guardarlo.
      */
      const blob = new Blob([sql], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.download = nombreDeArchivo()

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
        await mandarPorCorreo(sql, enlace.download)
        correo = { enviado: true }
        await anotar(true, null)
      } catch (e) {
        const fallo = e instanceof Error ? e.message : String(e)
        correo = { enviado: false, fallo }
        await anotar(false, motivoDelFallo(fallo))
      }

      return { bytes: blob.size, nombre: enlace.download, correo }
    },
  })
}

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
async function anotar(enviado: boolean, motivo: string | null): Promise<void> {
  try {
    await rpc('anotar_envio_del_respaldo', {
      p_enviado: enviado,
      p_mensaje_id: null,
      p_motivo: motivo,
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
  if (t.includes('fetch') || t.includes('network') || t.includes('contactar')) return 'ERROR_DE_RED'
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
*/
async function mandarPorCorreo(sql: string, nombreSql: string): Promise<void> {
  const crudo = new Blob([sql]).stream()
  const comprimido = crudo.pipeThrough(new CompressionStream('gzip'))
  const bytes = new Uint8Array(await new Response(comprimido).arrayBuffer())

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
      nombre: `${nombreSql}.gz`,
    },
  })
  if (error) throw error
}
