import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/inter'
import './index.css'
import { aplicarTemaInicial } from './lib/tema'

// Antes de montar React: si esperara al primer render, la pantalla parpadearía
// en claro antes de oscurecerse.
aplicarTemaInicial()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Un ERP interno no necesita revalidar al cambiar de pestaña: el dato
      // no cambia solo, cambia porque alguien lo cambia, y eso lo sabremos
      // por la invalidación explícita tras cada mutación.
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      retry: 1,
    },
  },
})

const raiz = document.getElementById('root')!

/**
 * Pantalla de última instancia.
 *
 * Si la configuración está mal, el cliente de Supabase revienta al cargarse y
 * React nunca llega a montar: queda una página en blanco, que en un servidor
 * ajeno no se distingue de un despliegue roto ni de una caída. Se escribe a
 * mano, sin React y sin clases de Tailwind —que también podrían no haber
 * cargado—, para que quien abra la dirección lea qué falta.
 */
function pantallaDeFallo(mensaje: string) {
  raiz.textContent = ''

  const caja = document.createElement('div')
  caja.setAttribute(
    'style',
    'max-width:42rem;margin:12vh auto;padding:2rem;font-family:system-ui,sans-serif;' +
      'color:#262c3d;background:#fff;border:1px solid #e6e9f2;border-radius:6px;line-height:1.6',
  )

  const titulo = document.createElement('h1')
  titulo.textContent = 'El sistema no pudo arrancar'
  titulo.setAttribute('style', 'margin:0 0 .75rem;font-size:1.25rem')

  const detalle = document.createElement('p')
  detalle.textContent = mensaje
  detalle.setAttribute('style', 'margin:0;font-size:.9375rem;color:#5a6072')

  caja.append(titulo, detalle)
  raiz.append(caja)
}

/**
 * El archivo que ya no está.
 *
 * `src/lib/version.ts` vigila los despliegues y recarga sola cuando sale una
 * versión nueva, pero eso vive DENTRO de la aplicación. Si lo que falla es
 * traer la aplicación misma, esa vigilancia no ha llegado a arrancar y lo único
 * que quedaba era una pantalla muerta con un mensaje en inglés.
 *
 * Y falla de verdad: los archivos llevan un hash en el nombre, así que al
 * publicar una versión cambian de nombre todos. Un HTML de hace un rato —el que
 * tenía abierta una pestaña, el que guardó un proxy— pide un archivo que ya no
 * existe con ese nombre.
 *
 * La cura es recargar: el HTML nuevo trae los nombres nuevos. Una sola vez, y
 * con la misma cautela que el vigilante de versión: si al recargar vuelve a
 * fallar, el HTML no viene del navegador sino de más atrás, y recargar otra vez
 * solo dejaría la pantalla parpadeando. Entonces se dice qué pasó, en español y
 * con qué hacer.
 */
const CLAVE_REINTENTO = 'lacantera:recarga-al-arrancar'

/** El almacén de sesión no existe en algunos modos privados. Sin él no se
 *  puede recordar el intento, y sin memoria no se recarga: sería un bucle. */
function recordarIntento(): boolean {
  try {
    if (sessionStorage.getItem(CLAVE_REINTENTO)) return false
    sessionStorage.setItem(CLAVE_REINTENTO, '1')
    return true
  } catch {
    return false
  }
}

function olvidarIntento() {
  try {
    sessionStorage.removeItem(CLAVE_REINTENTO)
  } catch {
    // Da igual: si no se pudo guardar, tampoco hay nada que borrar.
  }
}

const esArchivoQueNoLlego = (e: unknown) =>
  e instanceof Error &&
  /dynamically imported module|Importing a module script failed|error loading dynamically imported/i.test(
    e.message,
  )

/*
  La importación es dinámica a propósito: una estática se evalúa antes que el
  cuerpo de este archivo, y el error se escaparía sin que nadie lo recogiera.
*/
try {
  const { default: App } = await import('./App.tsx')

  olvidarIntento()

  createRoot(raiz).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  )
} catch (error) {
  if (esArchivoQueNoLlego(error) && recordarIntento()) {
    location.reload()
  } else if (esArchivoQueNoLlego(error)) {
    pantallaDeFallo(
      'Se publicó una versión nueva del sistema y tu navegador sigue trayendo la anterior. ' +
        'Recarga con Ctrl+Shift+R. Si sigue igual, ábrelo en una ventana de incógnito y avisa a quien administra el sistema.',
    )
    throw error
  } else {
    pantallaDeFallo(error instanceof Error ? error.message : String(error))
    throw error
  }
}
