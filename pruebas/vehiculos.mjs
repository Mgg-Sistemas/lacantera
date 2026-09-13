/*
  Los vehículos: el que nunca movió nada se elimina, el que tiene historia no.

  Lo que se comprueba es lo que se rompería en silencio: que un camión con
  viajes se lleve su historia al borrarlo, que el mensaje no diga por qué, o
  que alguien sin Total pueda borrar.
*/
import {
  grupo,
  comprobar,
  como,
  comoDueno,
  debeFallar,
  usuarioDePrueba,
  rolDePrueba,
} from './ayuda.mjs'

export default async function pruebaVehiculos(tx) {
  grupo('Vehículos · se elimina solo lo que nunca se usó')

  // ── La semilla ───────────────────────────────────────────────────────────
  // Nombres inventados: el repositorio es público y aquí no entra nadie real.
  const escribe = await usuarioDePrueba(tx, {
    usuario: 'prueba_edita_vehiculos',
    nombre: 'Quien carga la flota',
  })
  const total = await usuarioDePrueba(tx, {
    usuario: 'prueba_borra_vehiculos',
    nombre: 'Quien puede eliminar',
  })

  await rolDePrueba(tx, 'PRUEBA_FLOTA_ESCRIBE', { PANEL: 'LECTURA', DESPACHOS: 'ESCRITURA' })
  await rolDePrueba(tx, 'PRUEBA_FLOTA_TOTAL', { PANEL: 'LECTURA', DESPACHOS: 'TOTAL' })
  await tx`insert into public.usuarios_roles (usuario_id, rol) values (${escribe}, 'PRUEBA_FLOTA_ESCRIBE')`
  await tx`insert into public.usuarios_roles (usuario_id, rol) values (${total}, 'PRUEBA_FLOTA_TOTAL')`

  // Uno cargado por error, con chofer asignado pero sin haber movido nada.
  const [limpio] = await tx`
    insert into public.vehiculos (placa, tipo, capacidad_m3, propio, transportista, activo)
    values ('PRB901', 'VOLTEO', 16, false, 'TRANSPORTE DE PRUEBA', true)
    returning id`
  await tx`
    insert into public.vehiculo_choferes (vehiculo_id, nombre, cedula, desde)
    values (${limpio.id}, 'CHOFER DE PRUEBA', 'V-00000009', current_date - 3)`

  // Y uno que ya trabajó: dos viajes.
  const [conViajes] = await tx`
    insert into public.vehiculos (placa, tipo, capacidad_m3, propio, transportista, activo)
    values ('PRB902', 'VOLTEO', 16, false, 'TRANSPORTE DE PRUEBA', true)
    returning id`
  await tx`
    insert into public.acarreos (fecha, vehiculo_id, tramo, secuencia, transportista, precio_usd)
    values (current_date, ${conViajes.id}, 'MINA_PLANTA', 1, 'TRANSPORTE DE PRUEBA', 12),
           (current_date, ${conViajes.id}, 'MINA_PLANTA', 2, 'TRANSPORTE DE PRUEBA', 12)`

  // ── La reja ──────────────────────────────────────────────────────────────
  await como(tx, escribe)

  const sinCasilla = await debeFallar(
    tx,
    (sp) => sp`select public.eliminar_vehiculo(${limpio.id})`,
  )
  comprobar(
    /no tiene|permiso|acceso/i.test(sinCasilla ?? ''),
    `con Escritura no se elimina: hace falta Total (${(sinCasilla ?? 'no rebotó').slice(0, 45)}…)`,
  )

  const aMano = await debeFallar(
    tx,
    (sp) => sp`delete from public.vehiculos where id = ${limpio.id}`,
  )
  comprobar(
    /permission denied|permiso/i.test(aMano ?? ''),
    'y la fila tampoco se borra a mano desde el navegador',
  )

  // ── Con historia no se va ────────────────────────────────────────────────
  await comoDueno(tx)
  await como(tx, total)

  const conHistoria = await debeFallar(
    tx,
    (sp) => sp`select public.eliminar_vehiculo(${conViajes.id})`,
  )
  comprobar(
    /2 viajes/.test(conHistoria ?? '') && /servicio/i.test(conHistoria ?? ''),
    `el que tiene viajes no se elimina, y el mensaje dice cuántos y que se saque de servicio (${(conHistoria ?? 'no rebotó').slice(0, 40)}…)`,
  )

  await comoDueno(tx)
  const [sigue] = await tx`
    select (select count(*) from public.vehiculos where id = ${conViajes.id})::int as veh,
           (select count(*) from public.acarreos where vehiculo_id = ${conViajes.id})::int as viajes`
  comprobar(
    sigue.veh === 1 && sigue.viajes === 2,
    `y el camión y sus viajes siguen ahí (${sigue.veh} camión, ${sigue.viajes} viajes)`,
  )

  // ── Sin historia sí, y su chofer se va con él ────────────────────────────
  await como(tx, total)
  await tx`select public.eliminar_vehiculo(${limpio.id})`

  await comoDueno(tx)
  const [quedo] = await tx`
    select (select count(*) from public.vehiculos where id = ${limpio.id})::int as veh,
           (select count(*) from public.vehiculo_choferes where vehiculo_id = ${limpio.id})::int as choferes`
  comprobar(
    quedo.veh === 0 && quedo.choferes === 0,
    `el que nunca movió nada se elimina, y su período de chofer se va con él (${quedo.veh}/${quedo.choferes})`,
  )

  await como(tx, total)
  const dosVeces = await debeFallar(
    tx,
    (sp) => sp`select public.eliminar_vehiculo(${limpio.id})`,
  )
  comprobar(/ya no est/i.test(dosVeces ?? ''), 'eliminarlo dos veces dice que ya no está')

  await comoDueno(tx)
}
