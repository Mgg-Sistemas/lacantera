import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/*
  Sello del build.

  Sin él no hay forma de saber, mirando la página, si lo que está publicado es
  el último cambio o uno de hace tres despliegues. Y esa pregunta aparece justo
  cuando algo falla: se corrige, se sube, sigue fallando, y no se distingue "el
  arreglo no sirve" de "el arreglo no llegó". Se pierden horas en el primero
  cuando el problema era el segundo.

  Vercel expone el commit en VERCEL_GIT_COMMIT_SHA durante la compilación. En
  local no existe y se pone "local".
*/
const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7)
const compiladoEn = new Date().toISOString().slice(0, 16).replace('T', ' ')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __VERSION__: JSON.stringify(`${commit} · ${compiladoEn}`),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // host: true expone el servidor en la LAN para poder probar desde el telefono.
    // Vite imprime la URL de red (http://192.168.x.x:5173) al arrancar.
    host: true,
    strictPort: true,
  },
})
