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

  Quitar los espacios no basta. Probado uno por uno en el navegador: el espacio
  cero (U+200B) y el byte nulo NO son "espacio" para una expresión regular, y
  rompen la cabecera igual. Y de ahí salen justo los dos mensajes que se ven en
  la práctica: "Invalid value" y "String contains non ISO-8859-1 code point".
  Se cuelan al copiar de un documento, de un correo o de un chat.

  Por eso no se listan los caracteres malos —siempre falta uno— sino los
  buenos. Una URL de Supabase y una clave publicable usan alfabetos estrechos y
  conocidos: letras, dígitos y un puñado de signos. Todo lo que no esté ahí
  sobra, venga de donde venga. Reparar en vez de rechazar, porque un despliegue
  que funciona vale más que uno que explica por qué no.

  Y hay dos formas distintas de llegar partido en renglones, que piden lo
  contrario la una de la otra:

  - La clave PARTIDA. Una sola clave que se envolvió al pegarla. Cada renglón
    es un trozo, y hay que coserlos: 100 + 108 = la clave.
  - La clave REPETIDA. Es lo que había en el despliegue real: la misma clave
    cuatro veces, una por renglón. Coserlas daría una tira de 832 caracteres —
    una cabecera perfectamente válida con una credencial que no existe. El
    sistema arrancaría para dar 401 en cada pantalla, y ese fallo aparece lejos
    de su causa. Aquí hay que quedarse con una.

  Se distinguen solas: si todos los renglones dicen lo mismo, el campo quiere
  decir la clave y no la suma de todas; si dicen cosas distintas, son trozos.
*/
// \u2028 y \u2029 son los saltos que mete un procesador de textos al
// copiar: no son \n, pero parten el valor igual.
const unaSolaVez = (valor: string | undefined) => {
  const renglones = valor
    ?.split(/[\r\n\u2028\u2029]+/)
    .map((renglon) => renglon.trim())
    .filter((renglon) => renglon.length > 0)

  if (!renglones?.length) return undefined

  const distintos = [...new Set(renglones)]
  return distintos.length === 1 ? distintos[0] : renglones.join('')
}

const soloLoValido = (valor: string | undefined, permitidos: RegExp) =>
  unaSolaVez(valor)?.replace(permitidos, '')

// La clave es base64url con puntos (un JWT) o `sb_publishable_…`.
const url = soloLoValido(import.meta.env.VITE_SUPABASE_URL, /[^A-Za-z0-9:/._~%-]/g)
const publishableKey = soloLoValido(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  /[^A-Za-z0-9._~+/=-]/g,
)

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

/*
  Lo que queda tiene que parecer una clave, y no solo tener el largo.

  Una clave publicable tiene dos formas posibles: `sb_publishable_…`, o un JWT,
  que son tres tramos separados por puntos. Cualquier otra cosa —dos claves
  cosidas, media clave, el nombre de la variable pegado por delante— pasaría el
  corte del largo y dejaría arrancar el sistema para dar 401 en cada pantalla.
  Ese fallo aparece lejos de su causa y cuesta días; este aparece encima de
  ella, con el nombre de la variable que hay que corregir.
*/
const pareceClave = /^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(publishableKey)
const pareceJwt = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(publishableKey)

if (!pareceClave && !pareceJwt) {
  throw new Error(
    `VITE_SUPABASE_PUBLISHABLE_KEY no tiene forma de clave (${publishableKey.length} caracteres). ` +
      `Debe ser una sola línea: o empieza por "sb_publishable_", o son tres tramos ` +
      `separados por puntos. Revisa que esté copiada una sola vez y entera, desde ` +
      `Supabase → Settings → API. ${AYUDA}`,
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
