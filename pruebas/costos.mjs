/*
  El centro de costo: una caja abierta a la vez, un libro que se copia con
  referencia, y un cierre que congela.

  Lo que se comprueba aquí es lo que se puede romper sin que nadie lo note:
  dos cajas abiertas, el mismo viaje dos veces, el precio que llega a quien
  no debe verlo, y una foto que no cuadra con el libro.
*/
import {
  grupo,
  comprobar,
  como,
  comoDueno,
  debeFallar,
  usuarioDePrueba,
  rolDePrueba,
  asegurarTasaBcv,
} from './ayuda.mjs'

export default async function pruebaCostos(tx) {
  grupo('Centro de costo · una caja abierta a la vez')

  // ── La semilla ───────────────────────────────────────────────────────────
  // Nombres inventados: el repositorio es público y aquí no entra nadie real.
  await comoDueno(tx)
  const gerente = await usuarioDePrueba(tx, {
    usuario: 'prueba_costos_total',
    nombre: 'Quien cierra la caja',
  })
  const acepta = await usuarioDePrueba(tx, {
    usuario: 'prueba_costos_escritura',
    nombre: 'Quien acepta viajes',
  })
  const mira = await usuarioDePrueba(tx, {
    usuario: 'prueba_costos_lectura',
    nombre: 'Quien solo mira',
  })

  // TASAS va porque `asegurarTasaBcv` registra una si la base local no la
  // tiene, y registrar una tasa pide ese módulo.
  await rolDePrueba(tx, 'PRUEBA_COSTOS_TOTAL', {
    PANEL: 'LECTURA',
    COSTOS: 'TOTAL',
    EXPLOTACION: 'TOTAL',
    TASAS: 'TOTAL',
  })
  await rolDePrueba(tx, 'PRUEBA_COSTOS_ESC', { PANEL: 'LECTURA', COSTOS: 'ESCRITURA' })
  await rolDePrueba(tx, 'PRUEBA_COSTOS_LEC', { PANEL: 'LECTURA', COSTOS: 'LECTURA' })
  await tx`
    insert into public.rol_acciones (rol, accion)
    values ('PRUEBA_COSTOS_TOTAL', 'EXPLOTACION.VER_PAGO_VIAJES')`

  await tx`insert into public.usuarios_roles (usuario_id, rol) values (${gerente}, 'PRUEBA_COSTOS_TOTAL')`
  await tx`insert into public.usuarios_roles (usuario_id, rol) values (${acepta}, 'PRUEBA_COSTOS_ESC')`
  await tx`insert into public.usuarios_roles (usuario_id, rol) values (${mira}, 'PRUEBA_COSTOS_LEC')`

  // La base puede tener ya una caja abierta de verdad. Se cierra por debajo
  // del sistema para arrancar limpio; la transacción lo deshace al final.
  await tx`
    update public.costo_cajas
       set estado = 'CERRADA', fecha_fin = coalesce(fecha_fin, fecha_inicio)
     where estado = 'ABIERTA'`

  await como(tx, gerente)
  await asegurarTasaBcv(tx)

  const hoy = (await tx`select current_date::text as d`)[0].d
  const hace10 = (await tx`select (current_date - 10)::text as d`)[0].d

  // ── Abrir la primera ────────────────────────────────────────────────────
  const [{ costo_abrir_primera_caja: caja1 }] = await tx`
    select public.costo_abrir_primera_caja(${hace10}, 'Caja de prueba', 100)`
  comprobar(Number(caja1) > 0, 'se abre la primera caja con saldo inicial')

  const otraAbierta = await debeFallar(
    tx,
    (sp) => sp`select public.costo_abrir_primera_caja(${hace10}, 'Otra', 0)`,
  )
  comprobar(/ya hay una caja abierta/i.test(otraAbierta ?? ''), 'no se abre una segunda caja')

  // Ni por debajo del RPC: el índice parcial lo impide.
  await comoDueno(tx)
  const porDebajo = await debeFallar(
    tx,
    (sp) =>
      sp`insert into public.costo_cajas (numero, fecha_inicio, estado) values (999, current_date, 'ABIERTA')`,
  )
  comprobar(
    /costo_cajas_una_abierta|costo_cajas_sin_solape/i.test(porDebajo ?? ''),
    `la base tampoco deja dos abiertas (${(porDebajo ?? 'no rebotó').slice(0, 50)}…)`,
  )
  await como(tx, gerente)

  // ── Quien solo mira no configura ────────────────────────────────────────
  await como(tx, mira)
  const sinTotal = await debeFallar(tx, (sp) => sp`select public.costo_configurar(true)`)
  comprobar(/permiso|no tiene/i.test(sinTotal ?? ''), 'configurar exige Total')

  await como(tx, gerente)
  await tx`select public.costo_configurar(true)`
  const [conf] = await tx`select corte_mensual from public.costo_configuracion`
  comprobar(conf.corte_mensual === true, 'el corte mensual se guarda')

  const c = { gerente, acepta, mira, caja1: Number(caja1), hoy, hace10 }

  // ═══════════════════════════════════════════════════════════════════════
  grupo('Centro de costo · el fondo y el gasto suelto')

  await como(tx, c.gerente)
  await tx`select public.costo_registrar_entrega(${c.hoy}, 'CASA_MATRIZ', 'USD', 500, 'Primera entrega')`
  await tx`select public.costo_registrar_gasto(${c.hoy}, 'USD', 40, 'Comida del turno', 'COMEDOR')`
  await tx`select public.costo_registrar_gasto(${c.hoy}, 'VES', 3650, 'Peaje', null)`

  const [libro] = await tx`
    select count(*)::int as n,
           sum(monto_usd) filter (where clase = 'ENTREGA') as entregado,
           sum(monto_usd) filter (where clase = 'GASTO')   as gastado,
           count(*) filter (where categoria is null and clase = 'GASTO')::int as sin_clase
      from public.costo_movimientos
     where caja_id = ${c.caja1}`
  comprobar(libro.n === 3, 'tres filas en el libro')
  comprobar(Number(libro.entregado) === 500, 'la entrega suma 500 al fondo')
  // El peaje en bolívares se valora con la tasa BCV del día del hecho. Contra
  // la base local, `asegurarTasaBcv` puso 36,5 y 3650 son 100; contra otra
  // base la tasa es la real, así que solo se exige que valga más que cero.
  comprobar(
    Number(libro.gastado) > 40,
    `el peaje en bolivares se valoro en dolares (${libro.gastado} en total)`,
  )
  comprobar(libro.sin_clase === 1, 'el gasto sin categoria queda sin clasificar, no inventado')

  const [deuda] = await tx`
    select deuda_usd from public.v_costo_deuda_por_origen where origen_fondo = 'CASA_MATRIZ'`
  comprobar(Number(deuda.deuda_usd) === 500, 'la casa matriz figura con 500 de deuda')

  const abonoDeMas = await debeFallar(
    tx,
    (sp) => sp`select public.costo_registrar_abono(${c.hoy}, 'CASA_MATRIZ', 'USD', 600, 'Devolucion')`,
  )
  comprobar(/negativo/i.test(abonoDeMas ?? ''), 'un abono no deja la deuda en negativo')

  await tx`select public.costo_registrar_abono(${c.hoy}, 'CASA_MATRIZ', 'USD', 100, 'Devolucion parcial')`
  const [deuda2] = await tx`
    select deuda_usd from public.v_costo_deuda_por_origen where origen_fondo = 'CASA_MATRIZ'`
  comprobar(Number(deuda2.deuda_usd) === 400, 'y uno que cabe la baja a 400')

  await como(tx, c.acepta)
  const sinFondo = await debeFallar(
    tx,
    (sp) => sp`select public.costo_registrar_entrega(${c.hoy}, 'CASA_MATRIZ', 'USD', 1, 'x')`,
  )
  comprobar(/permiso|no tiene/i.test(sinFondo ?? ''), 'registrar una entrega exige Total')
  await como(tx, c.gerente)

  // ═══════════════════════════════════════════════════════════════════════
  grupo('Centro de costo · lo que entra se acepta, y el dinero se tapa')

  await comoDueno(tx)
  const [camion] = await tx`
    insert into public.vehiculos (placa, tipo, capacidad_m3, carga_util_m3, propio, transportista, activo)
    values ('PRC001', 'VOLTEO', 16, 14, false, 'TRANSPORTE DE PRUEBA COSTOS', true)
    returning id`
  const [propio] = await tx`
    insert into public.vehiculos (placa, tipo, capacidad_m3, carga_util_m3, propio, activo)
    values ('PRC002', 'VOLTEO', 16, 14, true, true)
    returning id`
  await como(tx, c.gerente)
  await tx`select public.registrar_acarreos(${c.hoy}, ${camion.id}, 'MINA_PLANTA', 2)`
  await tx`select public.registrar_acarreos(${c.hoy}, ${propio.id}, 'MINA_PLANTA', 1)`

  const cand = await tx`
    select * from public.costo_candidatos() where origen = 'ACARREO' order by origen_id`
  comprobar(cand.length === 3, `tres viajes por aceptar (${cand.length})`)
  comprobar(
    cand.filter((x) => x.vehiculo_id === propio.id).every((x) => x.monto === null && Number(x.m3) === 14),
    'el camion propio trae m3 pero no precio',
  )
  comprobar(
    cand.filter((x) => x.vehiculo_id === camion.id).every((x) => Number(x.monto) === 12),
    'el de terceros trae el precio del tramo',
  )

  // Sin la casilla del pago, el precio llega nulo y no se puede aceptar.
  await como(tx, c.acepta)
  const tapado = await tx`
    select monto from public.costo_candidatos() where origen = 'ACARREO' and vehiculo_id = ${camion.id}`
  comprobar(tapado.every((x) => x.monto === null), 'sin VER_PAGO_VIAJES el precio viene en blanco')
  const noPuede = await debeFallar(
    tx,
    (sp) => sp`select public.costo_aceptar('ACARREO', ${cand[0].origen_id})`,
  )
  comprobar(/pago|permiso|no tiene/i.test(noPuede ?? ''), 'y tampoco se puede aceptar')

  await como(tx, c.gerente)
  const [{ aceptados, saltados }] = await tx`select * from public.costo_aceptar_dia(${c.hoy}, 'ACARREO')`
  comprobar(aceptados === 3 && saltados === 0, `aceptar el dia copia los tres (${aceptados}/${saltados})`)
  const quedan = await tx`select 1 from public.costo_candidatos() where origen = 'ACARREO'`
  comprobar(quedan.length === 0, 'ya no quedan viajes por aceptar')

  const dosVeces = await debeFallar(
    tx,
    (sp) => sp`select public.costo_aceptar('ACARREO', ${cand[0].origen_id})`,
  )
  comprobar(/ya se decidio/i.test(dosVeces ?? ''), 'el mismo viaje no entra dos veces')

  const corregir = await debeFallar(
    tx,
    (sp) => sp`select public.corregir_acarreo(${cand[0].origen_id}, null, null, 99)`,
  )
  comprobar(/centro de costo/i.test(corregir ?? ''), 'un viaje aceptado no se corrige: se anula y se carga de nuevo')

  await tx`select public.anular_acarreo(${cand[0].origen_id}, 'Se cargo de mas en la prueba')`
  const rev = await tx`select * from public.costo_reversos_pendientes()`
  comprobar(rev.length === 1, 'el anulado aparece en reversos pendientes')
  await tx`select public.costo_reversar(${rev[0].movimiento_id}, 'Viaje anulado')`
  const otraVez = await debeFallar(
    tx,
    (sp) => sp`select public.costo_reversar(${rev[0].movimiento_id}, 'otra vez')`,
  )
  comprobar(/ya tiene reverso/i.test(otraVez ?? ''), 'no se reversa dos veces')
  const [elReverso] = await tx`
    select id from public.costo_movimientos where reversa_a = ${rev[0].movimiento_id}`
  const reversoDeReverso = await debeFallar(
    tx,
    (sp) => sp`select public.costo_reversar(${elReverso.id}, 'de nuevo')`,
  )
  comprobar(/no se reversa/i.test(reversoDeReverso ?? ''), 'ni se reversa un reverso')

  // ── Rechazar y deshacer ─────────────────────────────────────────────────
  await tx`select public.registrar_acarreos(${c.hoy}, ${camion.id}, 'PLANTA_LAVADO', 1)`
  const [nuevo] = await tx`select origen_id from public.costo_candidatos() where origen = 'ACARREO'`
  const cortoMotivo = await debeFallar(
    tx,
    (sp) => sp`select public.costo_rechazar('ACARREO', ${nuevo.origen_id}, 'no')`,
  )
  comprobar(/por que/i.test(cortoMotivo ?? ''), 'rechazar pide motivo')
  const [{ costo_rechazar: decId }] = await tx`
    select public.costo_rechazar('ACARREO', ${nuevo.origen_id}, 'Viaje repetido')`
  const fuera = await tx`select 1 from public.costo_candidatos() where origen = 'ACARREO'`
  comprobar(fuera.length === 0, 'el rechazado sale de la cola')

  await como(tx, c.acepta)
  const sinTotal2 = await debeFallar(tx, (sp) => sp`select public.costo_deshacer_rechazo(${decId})`)
  comprobar(/permiso|no tiene/i.test(sinTotal2 ?? ''), 'deshacer un rechazo exige Total')
  await como(tx, c.gerente)
  await tx`select public.costo_deshacer_rechazo(${decId})`
  const vuelve = await tx`
    select 1 from public.costo_candidatos() where origen = 'ACARREO' and origen_id = ${nuevo.origen_id}`
  comprobar(vuelve.length === 1, 'deshecho el rechazo, vuelve a estar por aceptar')

  // ── Gasto fijo: aparece por aceptar y se acepta con otro monto ──────────
  await tx`select public.costo_guardar_gasto_fijo(null, 'Energia de planta', 'USD', 300, 'SERVICIOS')`
  const [fijo] = await tx`select * from public.costo_candidatos() where origen = 'FIJO'`
  comprobar(Number(fijo?.monto) === 300, 'el gasto fijo aparece por aceptar con su monto')
  await tx`select public.costo_aceptar('FIJO', ${fijo.origen_id}, 280, 'Este mes fue menos')`
  const [fijoLibro] = await tx`
    select monto_usd, categoria from public.costo_movimientos
     where origen = 'FIJO' and caja_id = ${c.caja1}`
  comprobar(
    Number(fijoLibro.monto_usd) === 280 && fijoLibro.categoria === 'SERVICIOS',
    'y entra con el monto que se dijo al aceptar y su categoria',
  )

  c.camion = camion.id

  // Lo que sigue lo llenan las piezas 4 y 5.
  globalThis.__costos = c
}
