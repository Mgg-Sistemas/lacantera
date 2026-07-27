import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Falla al arrancar, no en la primera consulta. Un cliente creado con
// credenciales vacías no da error: devuelve 401 en cada petición y el fallo
// aparece disperso por toda la aplicación en vez de en un solo sitio.
if (!url || !publishableKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY. ' +
      'Copia .env.example a .env.local y rellena los valores.',
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
