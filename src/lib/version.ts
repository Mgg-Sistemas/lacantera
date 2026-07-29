import { useEffect, useState } from 'react'

/**
 * Que la aplicación se entere de que está vieja.
 *
 * El HTML es el único archivo sin hash en el nombre: es quien dice cuál de
 * todos los `index-*.js` hay que cargar. Si el navegador, un proxy o la red de
 * la oficina se quedan con un HTML de ayer, la aplicación entera se queda en
 * ayer — y por fuera se ve exactamente igual que si estuviera al día. Eso ya
 * costó una tarde: se corrige algo, se publica, sigue fallando, y no hay forma
 * de distinguir "el arreglo no sirve" de "el arreglo no llegó".
 *
 * `version.json` se genera en cada compilación y se pide sin caché. Si lo que
 * hay publicado no es lo que está corriendo, se recarga sola.
 */

const CLAVE_INTENTO = 'lacantera:recarga-por-version'
const CADA_MS = 5 * 60_000

export type EstadoVersion = 'al-dia' | 'vieja-y-atascada'

async function versionPublicada(): Promise<string | null> {
  try {
    // `no-store` en la petición además de la cabecera del servidor: si el
    // archivo llegara de la caché, diría lo mismo que ya tenemos y no
    // detectaría nada. Es el único sitio donde la caché no puede opinar.
    const r = await fetch(`/version.json`, { cache: 'no-store' })
    if (!r.ok) return null
    const cuerpo: unknown = await r.json()
    const v = (cuerpo as { version?: unknown })?.version
    return typeof v === 'string' ? v : null
  } catch {
    // Sin conexión no se sabe nada, y no saber no es motivo para molestar.
    return null
  }
}

export function useVersion(): EstadoVersion {
  const [estado, setEstado] = useState<EstadoVersion>('al-dia')

  useEffect(() => {
    let vigente = true

    const revisar = async () => {
      const publicada = await versionPublicada()
      if (!vigente || !publicada || publicada === __VERSION__) return

      /*
        Recargar una sola vez por versión.

        Si tras recargar seguimos con la vieja, el HTML no viene del navegador
        sino de más atrás —un proxy, la caché de la red— y volver a recargar
        entraría en un bucle que deja la pantalla parpadeando sin arreglar
        nada. En ese caso se avisa y decide la persona.
      */
      if (sessionStorage.getItem(CLAVE_INTENTO) === publicada) {
        setEstado('vieja-y-atascada')
        return
      }

      sessionStorage.setItem(CLAVE_INTENTO, publicada)
      location.reload()
    }

    void revisar()

    // Al volver a la pestaña: es cuando alguien retoma el trabajo después de
    // un rato, que es justo cuando puede haber salido algo nuevo.
    const alVolver = () => {
      if (document.visibilityState === 'visible') void revisar()
    }

    const reloj = setInterval(() => void revisar(), CADA_MS)
    document.addEventListener('visibilitychange', alVolver)

    return () => {
      vigente = false
      clearInterval(reloj)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [])

  return estado
}
