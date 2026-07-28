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

/*
  La importación es dinámica a propósito: una estática se evalúa antes que el
  cuerpo de este archivo, y el error se escaparía sin que nadie lo recogiera.
*/
try {
  const { default: App } = await import('./App.tsx')

  createRoot(raiz).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  )
} catch (error) {
  pantallaDeFallo(error instanceof Error ? error.message : String(error))
  throw error
}
