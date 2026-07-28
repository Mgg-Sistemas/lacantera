import { createClient } from '@supabase/supabase-js'

/*
  Las credenciales se limpian antes de usarlas.

  Al cargarlas en un panel de despliegue se pegan desde el portapapeles, y la
  clave publicable es una línea larguísima: al copiarla de una pantalla que la
  parte en dos, o al pegarla en un campo que la envuelve, se cuela un salto de
  línea EN MEDIO del valor.

  Eso rompe de una forma que no se parece a su causa. La clave viaja en una
  cabecera HTTP, y una cabecera con un salto de línea dentro no es una
  cabecera: el navegador rechaza la petición antes de enviarla con "Failed to
  execute 'fetch' on 'Window': Invalid value". Ese mensaje no menciona
  credenciales ni despliegue, así que se busca el fallo en el sitio
  equivocado — y como la pantalla de acceso sí carga, parece un problema del
  servidor.

  Ni una URL ni una clave admiten espacios en ninguna posición, así que
  quitarlos no puede estropear un valor bueno: si hay espacios, sobran. Se
  reparan en vez de rechazarlos, porque un despliegue que funciona vale más
  que uno que explica por qué no.
*/
const sinEspacios = (valor: string | undefined) => valor?.replace(/\s+/g, '')

const url = sinEspacios(import.meta.env.VITE_SUPABASE_URL)
const publishableKey = sinEspacios(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)

const AYUDA =
  'En local van en .env.local (copia .env.example). En Vercel, en ' +
  'Settings → Environment Variables, y hay que volver a desplegar después ' +
  'de cambiarlas: el valor se incrusta al compilar, no se lee al abrir.'

if (!url || !publishableKey) {
  throw new Error(`Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY. ${AYUDA}`)
}

try {
  new URL(url)
} catch {
  throw new Error(
    `VITE_SUPABASE_URL no es una dirección válida: "${url}". ` +
      `Debe ser la Project URL completa, con https:// delante. ${AYUDA}`,
  )
}

// Lo que queda tiene que parecer una clave. Un valor corto suele ser un pegado
// a medias, y con él el sistema arrancaría para dar 401 en cada pantalla.
if (publishableKey.length < 20) {
  throw new Error(
    `VITE_SUPABASE_PUBLISHABLE_KEY parece incompleta (${publishableKey.length} caracteres). ` +
      `Cópiala entera desde Supabase → Settings → API. ${AYUDA}`,
  )
}

export const supabase = createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // La aplicación no usa enlaces mágicos ni OAuth con redirección, así que
    // no hay que inspeccionar la URL en busca de tokens al cargar.
    detectSessionInUrl: false,
  },
})
