import { useEffect, useState } from 'react'

/**
 * Que la aplicación se entere de que está vieja, y que actualizar lo decida
 * quien la está usando.
 *
 * El HTML es el único archivo sin hash en el nombre: es quien dice cuál de
 * todos los `index-*.js` hay que cargar. Si el navegador, un proxy o la red de
 * la oficina se quedan con un HTML de ayer, la aplicación entera se queda en
 * ayer — y por fuera se ve exactamente igual que si estuviera al día. Eso ya
 * costó una tarde: se corrige algo, se publica, sigue fallando, y no hay forma
 * de distinguir "el arreglo no sirve" de "el arreglo no llegó".
 *
 * `version.json` se genera en cada compilación y se pide sin caché. Si lo que
 * hay publicado no es lo que está corriendo, se avisa.
 *
 * SE AVISA Y NO SE RECARGA. Hasta el 14-sep se recargaba sola, y eso se llevaba
 * por delante lo que la persona tuviera a medio escribir: el formulario a medio
 * llenar desaparecía sin preguntar. Se pidió así: «que no recargue de inmediato,
 * que sea elección del usuario, para que pueda terminar lo que está haciendo y
 * guardar antes de recargar a la nueva versión».
 *
 * Mientras no actualice, la pestaña sigue con su versión. En el droplet los
 * archivos de la anterior se quedan publicados unos días (`~/desplegar.sh`), así
 * que hasta las pantallas que no había abierto siguen llegando. En Vercel no se
 * quedan: ahí, lo que no llegue lo explica `cargarPagina.ts`.
 */

const CLAVE_INTENTO = 'lacantera:recarga-por-version'
const CADA_MS = 5 * 60_000
const EVENTO_REVISAR = 'lacantera:revisar-version'

export type EstadoVersion = 'al-dia' | 'nueva' | 'vieja-y-atascada'

export async function versionPublicada(): Promise<string | null> {
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

/**
 * Lo que hace el botón «Actualizar».
 *
 * Antes de recargar se apunta qué versión se fue a buscar. Si al volver sigue la
 * vieja, el HTML no viene del navegador sino de más atrás —un proxy, la caché de
 * la operadora— y otro botón igual no lo arreglaría: entonces el aviso cambia y
 * dice qué hacer.
 */
export function actualizarAhora(publicada: string | null) {
  try {
    if (publicada) sessionStorage.setItem(CLAVE_INTENTO, publicada)
  } catch {
    // Sin almacenamiento de sesión no se detecta el atasco, pero actualizar sí.
  }
  location.reload()
}

/**
 * Pide revisar ya, sin esperar al reloj. La usa quien se topa con un archivo que
 * no llegó: puede ser la señal de que salió una versión nueva hace un minuto.
 */
export function revisarVersionAhora() {
  window.dispatchEvent(new Event(EVENTO_REVISAR))
}

export function useVersion(): { estado: EstadoVersion; publicada: string | null } {
  const [estado, setEstado] = useState<EstadoVersion>('al-dia')
  const [publicada, setPublicada] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true

    const revisar = async () => {
      const v = await versionPublicada()
      if (!vigente || !v || v === __VERSION__) return

      let intentada: string | null = null
      try {
        intentada = sessionStorage.getItem(CLAVE_INTENTO)
      } catch {
        // Modo privado sin almacenamiento: cuenta como primera vez.
      }

      setPublicada(v)
      setEstado(intentada === v ? 'vieja-y-atascada' : 'nueva')
    }

    void revisar()

    // Al volver a la pestaña: es cuando alguien retoma el trabajo después de
    // un rato, que es justo cuando puede haber salido algo nuevo.
    const alVolver = () => {
      if (document.visibilityState === 'visible') void revisar()
    }
    const alPedirlo = () => void revisar()

    const reloj = setInterval(() => void revisar(), CADA_MS)
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener(EVENTO_REVISAR, alPedirlo)

    return () => {
      vigente = false
      clearInterval(reloj)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener(EVENTO_REVISAR, alPedirlo)
    }
  }, [])

  return { estado, publicada }
}
