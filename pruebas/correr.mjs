/*
  Corre las pruebas de la base.

    npm run prueba            todas
    npm run prueba permisos   solo ese archivo

  Cada archivo exporta una función que recibe la transacción. La transacción es
  una por archivo y se deshace al terminar, pase lo que pase.
*/
import { conectar, enTransaccion, resumen } from './ayuda.mjs'

const SUITES = {
  permisos: () => import('./permisos.mjs'),
  ventas: () => import('./ventas.mjs'),
  libros: () => import('./libros.mjs'),
  inventario: () => import('./inventario.mjs'),
  compras: () => import('./compras.mjs'),
  nomina: () => import('./nomina.mjs'),
  tesoreria: () => import('./tesoreria.mjs'),
  usuarios: () => import('./usuarios.mjs'),
}

const pedidas = process.argv.slice(2)
const nombres = pedidas.length > 0 ? pedidas : Object.keys(SUITES)

const desconocida = nombres.find((n) => !(n in SUITES))
if (desconocida) {
  console.error(`No hay pruebas que se llamen "${desconocida}".`)
  console.error(`Hay: ${Object.keys(SUITES).join(', ')}`)
  process.exit(2)
}

const sql = conectar()

try {
  for (const nombre of nombres) {
    const modulo = await SUITES[nombre]()
    await enTransaccion(sql, modulo.default)
  }
} catch (e) {
  console.error('\nLa prueba se rompió antes de terminar:\n' + e.message)
  process.exitCode = 1
} finally {
  await sql.end()
}

if (resumen() > 0) process.exitCode = 1
