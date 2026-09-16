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

  await losCamionesLosGobiernaMaquinaria(tx, { escribe, total })
}

/*
  LOS CAMIONES LOS GOBIERNA MAQUINARIA (16/09/2026).

  Lo que se rompería en silencio al mudar la pantalla: que Operaciones pueda
  cambiar a quién se le pagan los viajes, que quien tiene la casilla por
  autorización siga sin poder guardar, o que Despachos pierda lo que tenía.
*/
async function losCamionesLosGobiernaMaquinaria(tx, { escribe, total }) {
  grupo('Vehículos · los camiones los gobierna Maquinaria')

  const maquinaria = await usuarioDePrueba(tx, {
    usuario: 'prueba_flota_maquinaria',
    nombre: 'Quien lleva los equipos',
  })
  const soloLee = await usuarioDePrueba(tx, {
    usuario: 'prueba_flota_mira',
    nombre: 'Quien solo mira los equipos',
  })
  const prestada = await usuarioDePrueba(tx, {
    usuario: 'prueba_flota_prestada',
    nombre: 'Quien tiene las casillas prestadas',
  })

  await rolDePrueba(tx, 'PRUEBA_FLOTA_MAQ', { PANEL: 'LECTURA', MAQUINARIA: 'ESCRITURA' })
  await rolDePrueba(tx, 'PRUEBA_FLOTA_MAQ_LEE', { PANEL: 'LECTURA', MAQUINARIA: 'LECTURA' })
  await tx`insert into public.usuarios_roles (usuario_id, rol) values (${maquinaria}, 'PRUEBA_FLOTA_MAQ')`
  await tx`insert into public.usuarios_roles (usuario_id, rol) values (${soloLee}, 'PRUEBA_FLOTA_MAQ_LEE')`
  await tx`insert into public.usuarios_roles (usuario_id, rol) values (${prestada}, 'PRUEBA_FLOTA_MAQ')`

  const [camion] = await tx`
    insert into public.vehiculos (placa, tipo, capacidad_m3, carga_util_m3, propio, transportista, activo)
    values ('PRB903', 'VOLTEO', 16, 14, false, 'TRANSPORTE DE PRUEBA', true)
    returning id`

  const guardar = (sp, cambios = {}) => {
    const f = {
      placa: 'PRB903',
      tipo: 'VOLTEO',
      capacidad: 16,
      descripcion: null,
      propio: false,
      transportista: 'TRANSPORTE DE PRUEBA',
      activo: true,
      nota: null,
      ...cambios,
    }
    return sp`
      select public.guardar_vehiculo(${camion.id}, ${f.placa}, ${f.tipo}, ${f.capacidad}::numeric,
        ${f.descripcion}, null::numeric, ${f.propio}, ${f.transportista}, null::bigint,
        ${f.activo}, ${f.nota})`
  }

  // ── Maquinaria en escritura: corrige lo que no mueve dinero ──────────────
  await como(tx, maquinaria)
  await guardar(tx, { descripcion: 'Volteo corregido desde Maquinaria', nota: 'Nota nueva' })
  comprobar(true, 'con Maquinaria en escritura se corrige la descripción y la nota')

  const [alta] = await tx`
    select public.guardar_vehiculo(null, 'PRB904', 'VOLTEO', 16::numeric, null, null::numeric,
      false, 'TRANSPORTE DE PRUEBA', null::bigint, true, null) as id`
  comprobar(Number(alta.id) > 0, 'y se da de alta un camión nuevo')

  const [chofer] = await tx`
    select public.asignar_chofer(${camion.id}, null::bigint, 'CHOFER DE PRUEBA', 'V-00000010',
      current_date, null, null) as id`
  await tx`select public.terminar_chofer(${chofer.id}, current_date, 'prueba')`
  comprobar(Number(chofer.id) > 0, 'y se le asigna y se le cierra un chofer')

  const otroDueno = await debeFallar(tx, (sp) => guardar(sp, { transportista: 'OTRO TRANSPORTE' }))
  comprobar(
    /casilla/i.test(otroDueno ?? ''),
    `pero cambiarle de quién es pide la casilla: decide a quién se paga (${(otroDueno ?? 'no rebotó').slice(0, 40)}…)`,
  )

  const otraCapacidad = await debeFallar(tx, (sp) => guardar(sp, { capacidad: 18 }))
  comprobar(/casilla/i.test(otraCapacidad ?? ''), 'y cambiarle lo que le cabe también')

  const aPropio = await debeFallar(tx, (sp) => guardar(sp, { propio: true, transportista: null }))
  comprobar(/casilla/i.test(aPropio ?? ''), 'y volverlo propio también')

  const cargaUtil = await debeFallar(
    tx,
    (sp) => sp`select public.fijar_carga_util(${camion.id}, 12::numeric)`,
  )
  comprobar(/permiso/i.test(cargaUtil ?? ''), 'y la carga útil sigue pidiendo su casilla')

  const borrar = await debeFallar(tx, (sp) => sp`select public.eliminar_vehiculo(${alta.id})`)
  comprobar(/permiso/i.test(borrar ?? ''), 'y eliminar también')

  // ── Solo lectura: ve la hoja de vida, no escribe ─────────────────────────
  await comoDueno(tx)
  await como(tx, soloLee)
  const hoja = await tx`select * from public.historial_vehiculo(${camion.id}, 50)`
  comprobar(
    hoja.length > 0 && hoja.every((h) => !String(h.ruta ?? '').includes('/app/despachos/vehiculos')),
    `con Maquinaria en lectura se lee la hoja de vida, y ya no enlaza a Despachos (${hoja.length} hechos)`,
  )
  const leeYGuarda = await debeFallar(tx, (sp) => guardar(sp, { nota: 'no debería' }))
  comprobar(/acceso|permiso/i.test(leeYGuarda ?? ''), 'pero no guarda')

  // ── Las casillas prestadas cuentan ───────────────────────────────────────
  await comoDueno(tx)
  for (const accion of ['DESPACHOS.EDITAR_VEHICULO', 'DESPACHOS.FIJAR_CARGA_UTIL']) {
    await tx`
      insert into public.autorizaciones (accion, a_usuario, por_usuario, desde, motivo, creada_por)
      values (${accion}, ${prestada}, ${total}, current_date, 'PRUEBA: CASILLA PRESTADA', ${total})`
  }

  await como(tx, prestada)
  await guardar(tx, { transportista: 'OTRO TRANSPORTE', capacidad: 18 })
  await tx`select public.fijar_carga_util(${camion.id}, 15::numeric)`
  comprobar(true, 'con la casilla prestada sí se cambia de quién es, lo que le cabe y la carga útil')

  const pordebajo = await debeFallar(tx, (sp) =>
    guardar(sp, { transportista: 'OTRO TRANSPORTE', capacidad: 10 }),
  )
  comprobar(
    /carga útil/i.test(pordebajo ?? '') && !/check constraint/i.test(pordebajo ?? ''),
    `bajar lo que le cabe por debajo de la carga útil lo dice en español (${(pordebajo ?? 'no rebotó').slice(0, 40)}…)`,
  )

  await comoDueno(tx)
  await tx`
    update public.autorizaciones set revocada_en = now(), revocada_por = ${total},
           revocada_motivo = 'PRUEBA: SE RETIRA'
     where a_usuario = ${prestada}`
  await como(tx, prestada)
  const retirada = await debeFallar(tx, (sp) => sp`select public.fijar_carga_util(${camion.id}, 14::numeric)`)
  comprobar(/permiso/i.test(retirada ?? ''), 'y retirada la autorización, deja de poder')

  // ── Despachos no pierde nada ─────────────────────────────────────────────
  await comoDueno(tx)
  await como(tx, escribe)
  await guardar(tx, { transportista: 'TRANSPORTE DE PRUEBA', capacidad: 16 })
  comprobar(true, 'Despachos en escritura sigue cambiando de quién es y lo que le cabe')

  await comoDueno(tx)
}
