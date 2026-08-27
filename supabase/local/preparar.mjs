/*
  Levanta una base local con el esquema del sistema, para correr las pruebas
  sin tocar producción y sin la contraseña de Supabase.

  ————————————————————————————————————————————————————————————————————————
  SIN PROBAR DESDE EL 18 DE AGOSTO DE 2026. Vino de la rama del carril
  funcional, que se quedó parada ese día; se rescató el 27 de agosto porque
  era lo único de ella que no estaba ya en `develop`.

  Desde entonces han entrado unas cuantas migraciones, y el andamio de al lado
  es un esqueleto escrito a mano: es probable que le falte algo y que la
  preparación se caiga en la primera migración que dé por hecho una tabla que
  el andamio no crea. Al arreglarlo, quitar este aviso.
  ————————————————————————————————————————————————————————————————————————

    node supabase/local/preparar.mjs

  Deja un PostgreSQL en el 55432 con el andamio y todas las migraciones
  aplicadas, e imprime la línea de `DBURL` que hay que usar para las pruebas.

  POR QUÉ EXISTE ESTO. Las pruebas de `pruebas/` necesitan hablar con Postgres
  directamente: abren una transacción larga, cambian de rol a mitad para
  comprobar qué ve cada usuario, y lo deshacen todo al terminar. Nada de eso se
  puede hacer por la API. Y la cadena de conexión de producción lleva la
  contraseña de la base, que no siempre se tiene a mano ni conviene repartir.

  QUÉ NO ES. No es un espejo de producción: no tiene ni un dato real. Verifica
  que las funciones calculan bien, que es una pregunta distinta de si lo que
  hay cargado está bien. Para lo segundo hacen falta las pruebas contra la base
  de verdad.

  El contenedor se rehace en cada ejecución, a propósito: una base que arrastra
  el estado de la vez anterior deja de responder a "¿esto funciona partiendo de
  cero?", que es justo lo que se le pregunta.
*/
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', '..')
const MIGRACIONES = join(RAIZ, 'supabase', 'migrations')

const CONTENEDOR = 'lacantera-pg'
const PUERTO = 55432
const CLAVE = 'pruebas-locales'
// La del administrador del sistema, que la primera migración exige. Es una
// base local y desechable: no protege nada que exista fuera de esta máquina.
const CLAVE_ADMIN = 'andamio-local-1234'

const docker = (args, opciones = {}) =>
  spawnSync('docker', args, { encoding: 'utf8', ...opciones })

const morir = (mensaje, detalle) => {
  console.error(`\n${mensaje}`)
  if (detalle) console.error(detalle.trim())
  process.exit(1)
}

// ---------------------------------------------------------------------------

const version = docker(['info', '--format', '{{.ServerVersion}}'])

if (version.status !== 0) {
  morir(
    'Docker no responde.\n\n' +
      'Hace falta Docker Desktop corriendo. Si está instalado, ábrelo y espera a\n' +
      'que el icono deje de moverse; si no, se instala desde docker.com.',
    version.stderr,
  )
}

console.log(`Docker ${version.stdout.trim()}`)

// El de la vez anterior estorba: el puerto está ocupado y los datos viejos
// mentirían sobre si esto funciona partiendo de cero.
docker(['rm', '-f', CONTENEDOR], { stdio: 'ignore' })

const arranque = docker([
  'run', '-d',
  '--name', CONTENEDOR,
  '-e', `POSTGRES_PASSWORD=${CLAVE}`,
  '-p', `${PUERTO}:5432`,
  'postgres:17',
])

if (arranque.status !== 0) morir('No se pudo levantar el contenedor.', arranque.stderr)

console.log(`Contenedor ${CONTENEDOR} levantado en el puerto ${PUERTO}`)

// La espera va dentro del contenedor: así no depende de tener psql instalado
// en esta máquina, que es justo lo que estamos evitando.
const listo = docker([
  'exec', CONTENEDOR, 'bash', '-c',
  'for i in $(seq 1 60); do pg_isready -U postgres -q && exit 0; sleep 1; done; exit 1',
])

if (listo.status !== 0) morir('Postgres no llegó a aceptar conexiones.', listo.stderr)

console.log('Postgres aceptando conexiones')

/** Manda un guion SQL al contenedor y se para en el primer error. */
const aplicar = (sql, comoSeLlama) => {
  const r = docker(
    ['exec', '-i', '-e', 'PGCLIENTENCODING=UTF8', CONTENEDOR,
      'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '--quiet'],
    { input: sql },
  )

  if (r.status !== 0) {
    const causa = (r.stderr || '')
      .split('\n')
      .filter((l) => /^(ERROR|psql:)/.test(l))
      .slice(0, 4)
      .join('\n')
    morir(`Falló al aplicar ${comoSeLlama}.`, causa || r.stderr)
  }
}

aplicar(readFileSync(join(AQUI, 'andamio.sql'), 'utf8'), 'el andamio')
console.log('Andamio aplicado: esquemas auth y storage, roles y publicación')

const archivos = readdirSync(MIGRACIONES)
  .filter((f) => f.endsWith('.sql'))
  .sort()

for (const archivo of archivos) {
  // La clave del administrador va por delante de cada migración: la primera la
  // exige y las demás la ignoran.
  const sql =
    `set app.clave_admin = '${CLAVE_ADMIN}';\n` +
    readFileSync(join(MIGRACIONES, archivo), 'utf8')

  aplicar(sql, archivo)
}

console.log(`${archivos.length} migraciones aplicadas`)

const url = `postgresql://postgres:${CLAVE}@localhost:${PUERTO}/postgres?sslmode=disable`

console.log(`
Listo. Para correr las pruebas:

  DBURL="${url}" npm run prueba

En PowerShell:

  $env:DBURL="${url}"; npm run prueba

Para tirar la base cuando sobre:

  docker rm -f ${CONTENEDOR}
`)
