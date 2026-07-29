import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
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

const VERSION = `${commit} · ${compiladoEn}`

/**
 * Deja la versión también en un archivo suelto.
 *
 * El HTML dice qué JavaScript cargar, así que si el navegador o la red se
 * quedan con un HTML viejo, la aplicación entera se queda vieja sin que nadie
 * se entere: por fuera se ve igual. Este archivo es diminuto, se pide sin
 * caché y permite que la propia aplicación compare lo que trae compilado con
 * lo que hay publicado, y se recargue si no coinciden.
 */
const publicarVersion = (): Plugin => ({
  name: 'publicar-version',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ version: VERSION }),
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), publicarVersion()],
  define: {
    __VERSION__: JSON.stringify(VERSION),
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
