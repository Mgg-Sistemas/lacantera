/*
  Lo común a todas las pruebas.

  Dos reglas que no se rompen:

  1. Todo corre dentro de una transacción que al final se deshace. Estas pruebas
     se ejecutan contra la base de verdad —no hay otra— y una prueba que deje
     rastro es una prueba que ensucia el patio, el banco o la nómina de alguien.

  2. Nada se prueba como administrador salvo que la prueba trate de eso. El
     administrador pasa por encima de todos los permisos, así que probar con él
     comprueba que la función existe, no que la puerta cierra.
*/
import pg from 'postgres'

const URL_BASE = process.env.DBURL

if (!URL_BASE) {
  console.error(
    'Falta DBURL.\n\n' +
      'Es la cadena de conexión de Postgres (la de Supabase → Project Settings →\n' +
      'Database → Connection string). No se guarda en el repositorio: se pone en\n' +
      'el entorno antes de correr, o en un archivo que git ignora.\n',
  )
  process.exit(2)
}

/**
 * El certificado se exige fuera de casa, no dentro.
 *
 * Supabase solo acepta conexiones cifradas y por eso el valor por defecto es
 * exigirlo. Una base local levantada para correr estas pruebas no tiene SSL, y
 * exigírselo la deja incomunicada con un error que no dice lo que pasa. Se
 * mira la cadena: `sslmode=disable`, o un servidor que es esta misma máquina.
 */
const enCasa = /sslmode=disable/i.test(URL_BASE) || /@(localhost|127\.0\.0\.1)[:/]/.test(URL_BASE)

const opciones = { ssl: enCasa ? false : 'require', prepare: false }

export const conectar = () => pg(URL_BASE, opciones)

/**
 * Una conexión propia, sin reutilizar el pool.
 *
 * Las carreras necesitan esto: dos sesiones de verdad, cada una con su BEGIN,
 * para que una espere de verdad al cerrojo de la otra. Con un pool compartido
 * las dos consultas podrían salir por el mismo socket y no habría carrera que
 * observar.
 */
export const conexionAparte = () => pg(URL_BASE, { ...opciones, max: 1 })

// ---------------------------------------------------------------------------
// Marcador
// ---------------------------------------------------------------------------
const estado = { ok: 0, fallos: [], grupo: '' }

export const grupo = (titulo) => {
  estado.grupo = titulo
  console.log(`\n— ${titulo} —`)
}

export const comprobar = (condicion, texto) => {
  if (condicion) {
    estado.ok++
    console.log('  ok   | ' + texto)
  } else {
    estado.fallos.push(`${estado.grupo} · ${texto}`)
    console.log(' FALLA | ' + texto)
  }
}

export const resumen = () => {
  const total = estado.ok + estado.fallos.length
  console.log(`\n${estado.ok}/${total} comprobaciones`)
  if (estado.fallos.length > 0) {
    console.log('\nFallaron:')
    for (const f of estado.fallos) console.log('  · ' + f)
  }
  return estado.fallos.length
}

// ---------------------------------------------------------------------------
// Sesiones
// ---------------------------------------------------------------------------

/**
 * Habla con la base como hablaría el navegador de esa persona: rol
 * `authenticated` y su identidad en el token. Es `set local`, así que muere con
 * la transacción.
 */
export const como = (tx, uid) =>
  tx.unsafe(
    `set local role authenticated;
     set local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'`,
  )

/** Vuelve a ser el dueño de la base, para preparar o limpiar. */
export const comoDueno = (tx) => tx.unsafe('reset role')

/**
 * Corre algo que DEBE fallar y devuelve el mensaje.
 *
 * Va en un savepoint porque en Postgres un error aborta la transacción entera:
 * sin él, la primera comprobación negativa dejaría inservible todo lo que viene
 * después. Devuelve null si no falló, que es en sí mismo el fallo de la prueba.
 */
export const debeFallar = async (tx, fn) => {
  try {
    await tx.savepoint(fn)
    return null
  } catch (e) {
    return e.message
  }
}

/**
 * Asegura que haya tasa BCV del día.
 *
 * En la base de producción siempre la hay, porque se registra a diario. En una
 * base local recién levantada no hay ninguna, y sin ella no se abre ni una
 * compra ni un período de nómina: los dos congelan la tasa al nacer y se
 * niegan a inventarla.
 *
 * Solo se registra si falta, así que contra producción esta función no escribe
 * nada y las pruebas usan la tasa de verdad. Se llama ya identificado: la tasa
 * lleva la firma de quien la carga.
 */
export const asegurarTasaBcv = async (tx, valor = 36.5) => {
  // Se mira un mes atrás, no hoy: la tasa se arrastra hacia adelante pero no
  // hacia atrás, y un período de nómina se abre sobre la semana que pasó. Una
  // tasa cargada hoy dejaría sin cubrir el lunes pasado.
  const [hay] = await tx`
    select tasa from public.obtener_tasa('USD', 'VES', current_date - 30, 'BCV')`

  if (hay?.tasa) return Number(hay.tasa)

  await tx`select public.registrar_tasa('USD', 'VES', current_date - 30, ${valor}, 'BCV')`
  return valor
}

// ---------------------------------------------------------------------------
// Usuarios de prueba
// ---------------------------------------------------------------------------

/**
 * Un usuario recién nacido con los roles que se le digan.
 *
 * Se crea a mano y no con `crear_usuario_sistema` porque esa función exige
 * ADMIN y aquí a veces estamos probando precisamente qué puede alguien que no
 * lo es. Muere con la transacción, como todo lo demás.
 */
export const usuarioDePrueba = async (tx, { usuario, nombre, roles = [] }) => {
  const [{ id }] = await tx`
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', ${usuario + '@prueba.local'},
            extensions.crypt('prueba-1234', extensions.gen_salt('bf')),
            now(), '{"provider":"email","providers":["email"]}'::jsonb,
            ${tx.json({ nombre })}, now(), now())
    returning id`

  await tx`
    insert into public.perfiles (id, usuario, nombre, activo)
    values (${id}, ${usuario}, ${nombre}, true)
    on conflict (id) do update set usuario = excluded.usuario`

  for (const rol of roles) {
    await tx`insert into public.usuarios_roles (usuario_id, rol) values (${id}, ${rol})`
  }

  return id
}

/** Un rol nuevo con la matriz que se le indique: { MODULO: 'NIVEL' }. */
export const rolDePrueba = async (tx, codigo, permisos) => {
  await tx`
    insert into public.roles (codigo, nombre, descripcion, orden, sistema)
    values (${codigo}, ${codigo}, 'Rol de prueba', 900, false)
    on conflict (codigo) do nothing`

  await tx`
    insert into public.rol_permisos (rol, modulo, nivel)
    select ${codigo}, codigo, 'NINGUNO' from public.modulos
    on conflict (rol, modulo) do nothing`

  for (const [modulo, nivel] of Object.entries(permisos)) {
    await tx`
      update public.rol_permisos set nivel = ${nivel}
       where rol = ${codigo} and modulo = ${modulo}`
  }

  return codigo
}

/**
 * Envuelve un cuerpo de prueba en una transacción que siempre se deshace.
 *
 * El error que la deshace se lanza a propósito y se traga aquí; cualquier otro
 * sube, porque ese sí es un fallo de verdad.
 */
const DESHACER = 'DESHACER-LA-PRUEBA'

export const enTransaccion = async (sql, cuerpo) => {
  try {
    await sql.begin(async (tx) => {
      await cuerpo(tx)
      throw new Error(DESHACER)
    })
  } catch (e) {
    if (e.message !== DESHACER) throw e
  }
}
