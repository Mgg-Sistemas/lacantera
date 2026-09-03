/*
  Levanta una base local con el esquema del sistema, para correr las pruebas
  sin tocar producción y sin la contraseña de Supabase.

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

  ————————————————————————————————————————————————————————————————————————
  POR QUÉ YA NO USA DOCKER

  La versión anterior levantaba un contenedor `postgres:17` y le mandaba el SQL
  con `docker exec … psql`. Funcionaba, pero ataba la base local a tener Docker
  Desktop instalado y corriendo, y en las máquinas donde se trabaja hoy no lo
  hay. Un andamio que nadie puede levantar es un andamio que se pudre: este
  archivo pasó del 18 de agosto al 2 de septiembre sin que nadie lo corriera.

  Ahora usa los binarios sueltos de PostgreSQL —los que EDB publica en un zip,
  sin instalador y sin permisos de administrador— y manda el SQL por el driver
  `postgres` de npm, que ya es dependencia del proyecto porque lo usan las
  pruebas. Así no hace falta Docker NI tener `psql` en el PATH.

  Se descartó instalar PostgreSQL nativo: deja un servicio de Windows corriendo
  siempre y pide administrador, y esto tiene que poder borrarse con un
  `rm -rf supabase/local/pg` sin dejar rastro en la máquina.
  ————————————————————————————————————————————————————————————————————————
*/
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'postgres'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', '..')
const MIGRACIONES = join(RAIZ, 'supabase', 'migrations')

const PG = join(AQUI, 'pg', 'pgsql')
const BIN = join(PG, 'bin')
const DATOS = join(AQUI, 'pg', 'datos')
const REGISTRO = join(AQUI, 'pg', 'servidor.log')

const PUERTO = 55432
const BASE = 'lacantera'
const CLAVE = 'pruebas-locales'
// La del administrador del sistema, que la primera migración exige. Es una
// base local y desechable: no protege nada que exista fuera de esta máquina.
const CLAVE_ADMIN = 'andamio-local-1234'

const morir = (mensaje, detalle) => {
  console.error(`\n${mensaje}`)
  if (detalle) console.error(String(detalle).trim())
  process.exit(1)
}

const correr = (programa, args, opciones = {}) =>
  spawnSync(join(BIN, programa), args, { encoding: 'utf8', ...opciones })

// ---------------------------------------------------------------------------
// Los binarios
// ---------------------------------------------------------------------------

if (!existsSync(join(BIN, 'initdb.exe')) && !existsSync(join(BIN, 'initdb'))) {
  morir(
    'No encuentro los binarios de PostgreSQL.\n\n' +
      'Este andamio usa PostgreSQL portátil: no se instala, se descomprime.\n\n' +
      '  1. Baja el zip de binarios (no el instalador):\n' +
      '     https://get.enterprisedb.com/postgresql/postgresql-17.6-1-windows-x64-binaries.zip\n' +
      `  2. Descomprímelo en:  ${join(AQUI, 'pg')}\n` +
      `     Debe quedar:       ${BIN}\n` +
      '  3. Vuelve a correr esto.\n\n' +
      'La carpeta está en .gitignore y se borra con un rm -rf cuando estorbe.',
  )
}

// ---------------------------------------------------------------------------
// Las extensiones que Supabase trae y los binarios sueltos no
//
// Las migraciones piden tres: `pgcrypto`, que viene de serie, y `http` y
// `pg_cron`, que no. Las dos son de la tasa BCV automática: una sale a buscar
// el valor y la otra programa la salida diaria.
//
// Se fabrican como postizos —un archivo de control y unas funciones que no
// hacen nada— porque es exactamente lo que el andamio de al lado ya hace con
// `auth` y con `storage`: no pretende ser Supabase, pretende ser lo justo para
// que las migraciones se apliquen.
//
// Se descartó saltarse esa migración: entonces la base local dejaría de tener
// la tabla de tasas y todo lo que cuelga de ella, que sí se prueba.
//
// QUÉ NO SE PRUEBA POR ESTO, y conviene tenerlo delante al leer un verde:
// que la tasa se traiga bien de la fuente, y que el cron dispare. `http_get`
// devuelve estado 0 a propósito, que es el camino por el que la función de
// verdad avisa y se retira sin romper nada.
// ---------------------------------------------------------------------------

const EXTENSIONES = join(PG, 'share', 'extension')

const postizo = (nombre, cuerpo, comentario) => {
  writeFileSync(
    join(EXTENSIONES, `${nombre}.control`),
    `comment = '${comentario}'\ndefault_version = '1.0'\nrelocatable = false\n`,
    'utf8',
  )
  writeFileSync(join(EXTENSIONES, `${nombre}--1.0.sql`), cuerpo, 'utf8')
}

postizo('http', `
create type http_header as (field varchar, value varchar);
create type http_response as (
  status       integer,
  content_type varchar,
  headers      http_header[],
  content      varchar
);
-- Estado 0: aquí no hay red. Quien la llama trata el «no 200» avisando y
-- devolviendo null, así que la base local queda sin tasa pero entera.
create function http_get(uri varchar) returns http_response
language sql immutable as $$ select (0, null, null, null)::http_response $$;
create function http_set_curlopt(curlopt varchar, value varchar) returns boolean
language sql immutable as $$ select true $$;
`, 'postizo local de http: no sale a la red')

postizo('pg_cron', `
create schema if not exists cron;
create table if not exists cron.job (
  jobid    bigserial primary key,
  jobname  text unique,
  schedule text,
  command  text
);
create function cron.schedule(job_name text, schedule text, command text)
returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid $$;
create function cron.unschedule(job_name text) returns boolean
language sql as $$ delete from cron.job where jobname = job_name; select true $$;
`, 'postizo local de pg_cron: apunta la tarea, no la dispara')

console.log('Extensiones postizas escritas: http y pg_cron')

// ---------------------------------------------------------------------------
// El servidor
//
// Se rehace el directorio de datos en cada ejecución, a propósito: una base que
// arrastra el estado de la vez anterior deja de responder a «¿esto funciona
// partiendo de cero?», que es justo lo que se le pregunta.
// ---------------------------------------------------------------------------

if (existsSync(DATOS)) {
  correr('pg_ctl', ['-D', DATOS, '-m', 'immediate', 'stop'], { stdio: 'ignore' })
  rmSync(DATOS, { recursive: true, force: true })
}
mkdirSync(DATOS, { recursive: true })

// initdb en Windows no acepta la contraseña por argumento: la pide por teclado
// o la lee de un archivo. Como esto no es interactivo, va por archivo y se
// borra en cuanto termina.
const archivoClave = join(AQUI, 'pg', 'clave.txt')
writeFileSync(archivoClave, CLAVE, 'utf8')

const iniciado = correr('initdb', [
  '-D', DATOS,
  '-U', 'postgres',
  `--pwfile=${archivoClave}`,
  '-E', 'UTF8',
  '--locale=C',
])
rmSync(archivoClave, { force: true })

if (iniciado.status !== 0) morir('initdb falló.', iniciado.stderr || iniciado.stdout)
console.log('Directorio de datos creado')

/*
  `stdio: 'ignore'` no es para callar la salida: es lo que hace que esto vuelva.

  `pg_ctl start` lanza el servidor y termina, pero el servidor es su hijo y
  hereda sus descriptores. Con las tuberías por defecto, `spawnSync` se queda
  esperando el EOF de unas tuberías que el servidor no cierra nunca —porque no
  se va a morir— y el guion se cuelga ahí para siempre. Se vio: diez minutos con
  el servidor arriba, cero conexiones de cliente y node quieto.

  Sin tuberías que heredar, `pg_ctl` termina en cuanto `-w` confirma que el
  servidor acepta conexiones. Lo que se pierde es su stderr, y por eso el
  diagnóstico sale del registro del propio servidor, que es mejor de todos modos.
*/
const arranque = correr('pg_ctl', [
  '-D', DATOS,
  '-l', REGISTRO,
  '-o', `-p ${PUERTO} -c listen_addresses=127.0.0.1`,
  '-w', '-t', '60',
  'start',
], { stdio: 'ignore' })

if (arranque.status !== 0) {
  const registro = existsSync(REGISTRO) ? readFileSync(REGISTRO, 'utf8').slice(-1500) : ''
  morir('El servidor no arrancó.', registro || 'El registro no dice nada.')
}
console.log(`Postgres escuchando en el puerto ${PUERTO}`)

// ---------------------------------------------------------------------------
// El esquema
// ---------------------------------------------------------------------------

const url = (base) =>
  `postgresql://postgres:${CLAVE}@127.0.0.1:${PUERTO}/${base}?sslmode=disable`

// `max: 1` no es capricho: el `set app.clave_admin` de cada migración tiene que
// caer en la misma sesión que el SQL que lo lee, y con varias conexiones en el
// pool no hay nada que lo garantice.
const opciones = { ssl: false, prepare: false, max: 1, onnotice: () => {} }

const admin = pg(url('postgres'), opciones)
await admin.unsafe(`drop database if exists ${BASE}`)
await admin.unsafe(`create database ${BASE}`)
await admin.end()

const sql = pg(url(BASE), opciones)

/**
 * Manda un guion entero y se para en el primer error.
 *
 * Va por el protocolo simple —`.simple()`— porque un archivo de migración son
 * muchas sentencias en un solo texto, y el protocolo extendido solo admite una.
 * Ese es también el motivo de `prepare: false`.
 */
const aplicar = async (guion, comoSeLlama) => {
  try {
    await sql.unsafe(guion).simple()
  } catch (e) {
    await sql.end({ timeout: 5 }).catch(() => {})
    morir(
      `Falló al aplicar ${comoSeLlama}.`,
      [e.message, e.detail, e.hint, e.where].filter(Boolean).join('\n'),
    )
  }
}

await aplicar(readFileSync(join(AQUI, 'andamio.sql'), 'utf8'), 'el andamio')
console.log('Andamio aplicado: esquemas auth y storage, roles y publicación')

const archivos = readdirSync(MIGRACIONES)
  .filter((f) => f.endsWith('.sql'))
  .sort()

let n = 0
for (const archivo of archivos) {
  // La clave del administrador va por delante de cada migración: la primera la
  // exige y las demás la ignoran.
  const guion =
    `set app.clave_admin = '${CLAVE_ADMIN}';\n` +
    readFileSync(join(MIGRACIONES, archivo), 'utf8')

  await aplicar(guion, archivo)
  n += 1
  if (n % 25 === 0) console.log(`  ${n} de ${archivos.length}…`)
}

console.log(`${archivos.length} migraciones aplicadas`)

const [{ tablas }] = await sql`
  select count(*)::int as tablas
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relkind = 'r'`

await sql.end()

console.log(`\nLa base quedó con ${tablas} tablas en \`public\`.\n`)
console.log('Para correr las pruebas contra ella:\n')
console.log(`  $env:DBURL = "${url(BASE)}"    (PowerShell)`)
console.log(`  export DBURL="${url(BASE)}"    (bash)`)
console.log('\n  npm run prueba\n')
console.log('Para apagarla:\n')
console.log(`  ${join(BIN, 'pg_ctl')} -D ${DATOS} stop\n`)
