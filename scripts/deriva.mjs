/*
  ¿DICE EL REPOSITORIO LO QUE DE VERDAD CORRE EN LA BASE?

      node scripts/deriva.mjs <volcado.json>
      node scripts/deriva.mjs <volcado.json> --volcar <destino.sql>

  El registro de migraciones no dice la verdad —es la regla 7 del CLAUDE.md— y
  por eso hay que comprobar contra el catálogo. Esto compara el cuerpo VIVO de
  cada función contra el último archivo de `supabase/migrations` que la CREA. Si
  no coinciden, reconstruir la base desde cero da otra cosa que la que corre.

  Lo levantó el carril de base de datos el 8/09/2026, por tercera vez en un día,
  y con el diagnóstico correcto: **el hueco no es de disciplina, es de orden.**
  Hoy el archivo se escribe después de aplicar, y a mano; mientras eso sea así,
  la deriva vuelve. Un md5 comprobado el lunes no dice nada del miércoles, porque
  seis migraciones después otra cosa toca la misma función.

  POR QUÉ ESTO NO ES UN PARCHE MÁS

  Las migraciones de esta casa parchean con `pg_get_functiondef` + `replace` en
  vez de reescribir funciones de siete mil letras. Eso está bien pensado —copiar
  a mano es lo que introduce diferencias— pero deja el cuerpo repartido entre el
  archivo que la creó y los cinco que la parchearon después. **El archivo deja de
  servir para reconstruir**, aunque el parche sea correcto. `--volcar` cierra eso:
  escribe una migración con los cuerpos vivos tal como los devuelve Postgres, sin
  que nadie los teclee.

  DE DÓNDE SALE EL JSON

  De una sola consulta por MCP (o por psql) contra la base viva:

      select json_agg(json_build_object(
               'f',     n.nspname||'.'||p.proname,
               'firma', n.nspname||'.'||p.proname||'('||
                        pg_get_function_identity_arguments(p.oid)||')',
               'src',   p.prosrc,
               'def',   pg_get_functiondef(p.oid))
               order by n.nspname, p.proname)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public','private') and p.prokind in ('f','p');

  Se acepta tanto el JSON pelado como el envoltorio que deja el MCP al guardar un
  resultado grande en un archivo: aquí se busca el primer `[{` y el último `}]`.

  LAS DOS TRAMPAS QUE HAY QUE EVITAR, y las dos costaron un susto al otro carril

  1. **Los delimitadores no son solo `$$` y `$function$`.** Este repositorio usa
     `$func$` 260 veces, y además `$body$`, `$guarda$`, `$patch$`. Un extractor
     que solo conozca dos etiquetas declara «sin archivo» a setenta y cinco
     funciones que sí lo tienen. Aquí se acepta cualquier `$etiqueta$`.

  2. **Los dos lados se miden con la misma regla, y la regla vive aquí.** El
     detector del otro carril calculaba un md5 en PostgreSQL y el otro en Python;
     los dos hacían `lower()`, que sobre acentuadas no da lo mismo. Con eso, 152
     funciones idénticas carácter a carácter salían con deriva. Por eso
     `normalizar()` es UNA función de este archivo y se aplica a los dos lados.

  Y EL CONTROL, que es lo que cazó aquella mentira: se imprimen aparte tres
  funciones viejas y estables. **Si alguna sale con deriva sin que nadie la haya
  tocado, el que miente es el detector.** Un resultado que no puede ser verdad es
  el mejor control que existe — y hay que curar la lista, porque el día que una
  de las tres cambie de verdad el control acusa con razón.
*/

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIGRACIONES = path.join(raiz, 'supabase', 'migrations')

/*
  EL CONTROL: funciones cuya respuesta se conoce de antemano.

  Un detector que da un número no se puede comprobar contra sí mismo. Éstas son
  viejas y estables, así que lo esperado es «al día» — y si alguna sale con
  deriva SIN QUE NADIE LA HAYA TOCADO, el que miente es el detector, no el
  repositorio. Es lo que cazó el error del md5 del otro carril y lo que cazó el
  mío.

  La lista hay que curarla: el 8/09/2026 se ensanchó la máscara de
  `private.numero_es` y el control la marcó, con razón y sin mentir nadie. Por
  eso el aviso dice «si no la has tocado» en vez de acusar de entrada: un
  control que grita cuando el cambio es legítimo se deja de mirar.
*/
const CONTROL = ['private.en_mayuscula', 'private.tasas_del_dia', 'private.siguiente_numero']

/*
  Se quitan los comentarios y se colapsa el espacio antes de comparar.

  Es a propósito más indulgente de lo necesario: así «al día» es una afirmación
  débil y «con deriva» es una afirmación fuerte —difieren en el CÓDIGO, no en un
  comentario reescrito—. Un detector que grita por un acento se deja de mirar a
  la tercera vez.
*/
function normalizar(t) {
  return t
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Cada `create function` de un archivo, con su cuerpo entre `$etiqueta$`. */
function cuerposDelArchivo(texto) {
  const fuera = []
  const crea = /create\s+(?:or\s+replace\s+)?function\s+([a-z_]+\.[a-z_0-9]+)\s*\(/gi
  let m
  while ((m = crea.exec(texto)) !== null) {
    const resto = texto.slice(crea.lastIndex)
    const tag = /\$([a-z_0-9]*)\$/i.exec(resto)
    if (!tag) continue
    const marca = `$${tag[1]}$`
    const ini = crea.lastIndex + tag.index + marca.length
    const fin = texto.indexOf(marca, ini)
    if (fin === -1) continue
    fuera.push([m[1].toLowerCase(), texto.slice(ini, fin)])
  }
  return fuera
}

/*
  El JSON viene envuelto hasta tres veces y hay que pelarlo EN ORDEN.

  Me mordió al escribir esto: busqué `[{` en el texto crudo del archivo y lo
  encontré, pero era el `[{\"todo\"...` ESCAPADO de dentro de una cadena JSON, no
  el array de verdad. La misma forma que el detector del otro carril: el
  extractor encuentra algo, no falla, y devuelve basura con toda la confianza.

  Las capas, de fuera adentro:
    1. el archivo entero es {"result": "<texto>"}          <- si viene del MCP
    2. dentro de ese texto hay un array [{ "todo": "<json>" }]
    3. y `todo` es el JSON de verdad
  Cada `json_agg` devuelve una sola fila con una sola columna, y de ahí las dos
  últimas capas.
*/
function leerVivas(ruta) {
  let texto = fs.readFileSync(ruta, 'utf8')

  // Capa 1: el envoltorio del MCP, si está.
  try {
    const env = JSON.parse(texto)
    if (env && typeof env.result === 'string') texto = env.result
  } catch {
    // No era un objeto JSON: será el array pelado. Sigue.
  }

  const i = texto.indexOf('[{')
  const j = texto.lastIndexOf('}]')
  if (i === -1 || j === -1) throw new Error(`No encuentro el JSON dentro de ${ruta}`)
  let datos = JSON.parse(texto.slice(i, j + 2))

  /*
    Capas 2 y 3: la fila única de json_agg, venga como venga.

    La primera versión exigía que la columna se llamara `todo` y que su valor
    fuera una CADENA. Las dos cosas eran supuestos míos: el alias depende de cómo
    se escriba la consulta —la del comentario de aquí arriba no lleva ninguno, y
    Postgres la llamaría `json_agg`— y el MCP a veces devuelve el agregado ya
    parseado como array en vez de como texto.

    Lo encontró el carril de base de datos corriendo esto la primera vez: fallaba
    con «El volcado no trae f y src» sobre el volcado que la cabecera promete
    aceptar. Es el tercer fallo de la misma familia en dos días. **Una
    herramienta de verificación que rechaza la entrada que promete aceptar es
    peor que no tenerla**, porque quien la corre concluye lo que ella le diga —
    y ésta al menos falló hacia el lado seguro: se negó a correr en vez de
    devolver un número inventado.
  */
  if (datos.length === 1 && Object.keys(datos[0]).length === 1) {
    const unica = datos[0][Object.keys(datos[0])[0]]
    if (typeof unica === 'string') datos = JSON.parse(unica)
    else if (Array.isArray(unica)) datos = unica
  }

  if (!datos.length || !datos[0].f || typeof datos[0].src !== 'string') {
    throw new Error('El volcado no trae `f` y `src`. Revisa la consulta del comentario de arriba.')
  }
  return datos
}

const [, , rutaVivas, ...banderas] = process.argv
if (!rutaVivas) {
  console.error('Uso: node scripts/deriva.mjs <volcado.json> [--volcar <destino.sql>]')
  process.exit(2)
}

const vivas = leerVivas(rutaVivas)

// El último archivo que la crea manda: es el orden en que se aplican.
const archivoDe = new Map()
for (const nombre of fs.readdirSync(MIGRACIONES).filter((f) => f.endsWith('.sql')).sort()) {
  const texto = fs.readFileSync(path.join(MIGRACIONES, nombre), 'utf8')
  for (const [fn, cuerpo] of cuerposDelArchivo(texto)) archivoDe.set(fn, { nombre, cuerpo })
}

const alDia = [], conDeriva = [], sinArchivo = []
for (const v of vivas) {
  const clave = v.f.toLowerCase()
  const enArchivo = archivoDe.get(clave)
  if (!enArchivo) { sinArchivo.push(v); continue }
  if (normalizar(enArchivo.cuerpo) === normalizar(v.src)) alDia.push(v)
  else conDeriva.push({ ...v, ultimo: enArchivo.nombre })
}

console.log(`funciones vivas: ${vivas.length}`)
console.log(`  al dia ....... ${alDia.length}`)
console.log(`  CON DERIVA ... ${conDeriva.length}`)
console.log(`  sin archivo .. ${sinArchivo.length}`)

console.log('\n--- control: las que nadie toca desde julio ---')
for (const c of CONTROL) {
  const estado = alDia.some((x) => x.f.toLowerCase() === c) ? 'al dia'
    : conDeriva.some((x) => x.f.toLowerCase() === c) ? 'DERIVA  <- si no la has tocado, miente el detector'
    : sinArchivo.some((x) => x.f.toLowerCase() === c) ? 'sin archivo  <- si no la has tocado, miente el detector'
    : 'no esta en el volcado'
  console.log(`  ${c.padEnd(32)} ${estado}`)
}

if (conDeriva.length) {
  console.log('\n--- con deriva ---')
  for (const d of conDeriva) {
    console.log(`  ${d.f.padEnd(50)} ${String(d.src.length).padStart(6)} letras   ultimo: ${d.ultimo}`)
  }
}
if (sinArchivo.length) {
  console.log('\n--- sin archivo ---')
  for (const s of sinArchivo) console.log(`  ${s.f}`)
}

// ---------------------------------------------------------------------------
// El volcado
// ---------------------------------------------------------------------------
const iVolcar = banderas.indexOf('--volcar')
if (iVolcar !== -1) {
  const destino = banderas[iVolcar + 1]
  if (!destino) { console.error('--volcar necesita un destino'); process.exit(2) }

  const pendientes = [...conDeriva, ...sinArchivo]
  if (!pendientes.length) {
    console.log('\nNada que volcar: el repositorio ya dice lo que corre.')
    process.exit(0)
  }

  const trozos = pendientes.map((p) => {
    let def = p.def
    if (!def) throw new Error(`El volcado no trae pg_get_functiondef de ${p.f}`)
    def = def.trimEnd()
    if (!def.endsWith(';')) def += ';'
    return `-- ${p.firma || p.f}\n-- venia de: ${p.ultimo || '(ninguna migracion la creaba)'}\n${def}\n`
  })

  const cabecera = `/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  ${pendientes.length} funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
  las crea. No cambia nada en la base: son los mismos cuerpos que ya corren,
  puestos donde reconstruir desde cero da lo mismo que hay.

  POR QUE APARECIO ESTA DIFERENCIA, que es lo unico interesante de este archivo:
  las migraciones de esta casa parchean con \`pg_get_functiondef\` + \`replace\` en
  vez de reescribir funciones de siete mil letras. El parche es correcto y el
  motivo es bueno —copiar a mano es lo que introduce diferencias—, pero deja el
  cuerpo repartido entre el archivo que la creo y los cinco que la tocaron
  despues. El archivo deja de servir para reconstruir aunque cada parche este
  bien.

  Lo levanto el carril de base de datos, tres veces en un dia, y la tercera con
  el diagnostico que lo explica: no es falta de cuidado, es que la verificacion
  se hace UNA VEZ al escribir y seis migraciones despues otra cosa toca la misma
  funcion. Un md5 comprobado el lunes no dice nada del miercoles.

  Por eso esto es generado y no transcrito: volcar la salida de Postgres no puede
  introducir una diferencia, y teclearla si.

  QUE SE COMPROBO ANTES DE GUARDARLO

  Cada cuerpo de aqui se comparo BYTE A BYTE contra \`pg_proc.prosrc\` de la base
  viva —no normalizado, no perdonando comentarios— y los ${pendientes.length} coinciden. Y el
  detector, que antes marcaba estas ${pendientes.length}, pasa a cero.

  NO SE APLICO, Y ES A PROPOSITO

  Aplicarlo seria un no-op: son exactamente los cuerpos que ya corren, sacados de
  \`pg_get_functiondef\`. Su valor no esta en cambiar la base sino en que
  reconstruirla desde cero de lo mismo que hay.

  Y LA TRAMPA QUE ESO DEJA, dicha aqui para que no sorprenda: si manana otra
  migracion toca una de estas funciones y alguien corre ESTE archivo suelto,
  despues, la revierte al cuerpo de hoy. En orden no pasa —va fechado con su dia y
  detras de todo lo de ese dia—, pero un volcado no es una migracion normal y
  conviene saberlo antes de ejecutarlo a mano.
*/

`
  fs.writeFileSync(destino, cabecera + trozos.join('\n'), 'utf8')
  console.log(`\nVolcadas ${pendientes.length} funciones en ${destino}`)
  console.log('Vuelve a correr el detector con un volcado nuevo para comprobar que da cero.')
}
