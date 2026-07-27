import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/inter'
import './index.css'
import App from './App.tsx'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
