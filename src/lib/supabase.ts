import { createClient } from '@supabase/supabase-js'

/*
  Las credenciales se limpian antes de usarlas.

  Al cargarlas en un panel de despliegue se pegan desde el portapapeles, y lo
  que se copia de la consola de Supabase arrastra a menudo un salto de línea o
  un espacio al final. La clave viaja en una cabecera HTTP, y una cabecera con
  un salto de línea dentro no es una cabecera válida: el navegador rechaza la
  petición entera con "Failed to execute 'fetch' on 'Window': Invalid value".

  Ese mensaje no dice nada de credenciales ni de despliegue, así que se pierde
  media tarde buscándolo en el sitio equivocado. Un trim aquí lo evita, y lo
  que el trim no pueda arreglar se explica abajo con nombre y apellido.
*/
const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

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

// Una cabecera HTTP no admite espacios, tabuladores ni saltos de línea dentro.
// Si quedan después del trim, están en medio del valor: se pegó cortado o se
// pegaron dos cosas juntas.
if (/\s/.test(publishableKey)) {
  throw new Error(
    'VITE_SUPABASE_PUBLISHABLE_KEY tiene espacios o saltos de línea dentro. ' +
      `Cópiala de una sola vez, sin cortar. ${AYUDA}`,
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
