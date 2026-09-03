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

  Vercel expone el commit en VERCEL_GIT_COMMIT_SHA durante la compilación.
  Fuera de Vercel esa variable no existe, y el sello salía «local» — que no
  distingue un despliegue de otro y deja la pregunta sin contestar justo cuando
  hace falta.

  Así que si la variable no está, se le pregunta a git. Vale para compilar en
  el servidor, en un flujo de GitHub Actions o en el portátil, y en Vercel no
  cambia nada porque la variable gana. Si tampoco hay git —un tarball sin
  historia— se cae a «local», que es lo que había.
*/
function commitDeGit(): string | null {
  try {
    // `execSync` en vez de importarlo arriba: solo se usa aquí y solo cuando
    // hace falta, y así el archivo no arrastra `child_process` sin motivo.
    const { execSync } = require('node:child_process') as typeof import('node:child_process')
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return null
  }
}

const commit = (
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
  commitDeGit() ??
  'local'
)
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
