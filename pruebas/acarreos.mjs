/*
  Los viajes de camiones: que se cuenten bien y que el dinero no se vea de más.

  Lo que se comprueba aquí es lo que se puede romper sin que nadie lo note:
  la cantidad que suma en vez de reemplazar, el metro cúbico que va en blanco
  y no en cero, el precio congelado a la fecha del viaje, y la casilla del
  dinero.
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

export default async function pruebaAcarreos(tx) {
  grupo('Viajes de camiones · se cuentan por viaje y el pago se tapa')

  // ── La semilla ───────────────────────────────────────────────────────────
  // Nombres inventados: el repositorio es público y aquí no entra nadie real.
  const registra = await usuarioDePrueba(tx, {
    usuario: 'prueba_carga_viajes',
    nombre: 'Quien teclea la planilla',
  })
  const ve_pago = await usuarioDePrueba(tx, {
    usuario: 'prueba_ve_pago_viajes',
    nombre: 'Quien puede ver el dinero',
  })

  await rolDePrueba(tx, 'PRUEBA_VIAJES', { PANEL: 'LECTURA', EXPLOTACION: 'TOTAL' })
  await rolDePrueba(tx, 'PRUEBA_VIAJES_PAGO', { PANEL: 'LECTURA', EXPLOTACION: 'TOTAL' })
  await tx`
    insert into public.rol_acciones (rol, accion)
    values ('PRUEBA_VIAJES_PAGO', 'EXPLOTACION.VER_PAGO_VIAJES')`

  await tx`insert into public.usuarios_roles (usuario_id, rol) values (${registra}, 'PRUEBA_VIAJES')`
  await tx`insert into public.usuarios_roles (usuario_id, rol) values (${ve_pago}, 'PRUEBA_VIAJES_PAGO')`

  // Dos camiones: uno con carga útil declarada y otro sin ella.
  const [conCarga] = await tx`
    insert into public.vehiculos (placa, tipo, capacidad_m3, carga_util_m3, propio, transportista, activo)
    values ('PRB001', 'VOLTEO', 16, 13, false, 'TRANSPORTE DE PRUEBA UNO', true)
    returning id`
  const [sinCarga] = await tx`
    insert into public.vehiculos (placa, tipo, capacidad_m3, propio, transportista, activo)
    values ('PRB002', 'VOLTEO', 16, false, 'TRANSPORTE DE PRUEBA DOS', true)
    returning id`

  // Quién manejaba, y desde cuándo. El viaje tiene que copiar al del día del
  // viaje, no al de hoy.
  await tx`
    insert into public.vehiculo_choferes (vehiculo_id, nombre, cedula, desde, hasta)
    values (${conCarga.id}, 'CHOFER VIEJO DE PRUEBA', 'V-00000001',
            current_date - 20, current_date - 7)`
  await tx`
    insert into public.vehiculo_choferes (vehiculo_id, nombre, cedula, desde)
    values (${conCarga.id}, 'CHOFER NUEVO DE PRUEBA', 'V-00000002', current_date - 6)`

  const ayer = (await tx`select (current_date - 1)::text as d`)[0].d
  // Una semana atrás, no un mes: la tarifa rige desde el 1 de septiembre y un
  // viaje anterior a eso no tiene precio, que es justo lo que debe pasar.
  const viejo = (await tx`select (current_date - 8)::text as d`)[0].d

  // ── La reja ──────────────────────────────────────────────────────────────
  const forastero = await usuarioDePrueba(tx, {
    usuario: 'prueba_forastero_viajes',
    nombre: 'Alguien sin explotacion',
  })
  await como(tx, forastero)
  const sinPermiso = await debeFallar(
    tx,
    (sp) => sp`select public.registrar_acarreos(${ayer}, ${conCarga.id}, 'MINA_PLANTA', 1)`,
  )
  comprobar(
    /no tiene|permiso/i.test(sinPermiso ?? ''),
    `sin la casilla no se cargan viajes (${(sinPermiso ?? 'no rebotó').slice(0, 45)}…)`,
  )

  // ── La cantidad suma ─────────────────────────────────────────────────────
  await comoDueno(tx)
  await como(tx, registra)

  await tx`select public.registrar_acarreos(${ayer}, ${conCarga.id}, 'MINA_PLANTA', 3)`
  await tx`select public.registrar_acarreos(${ayer}, ${conCarga.id}, 'MINA_PLANTA', 5)`

  const [tras] = await tx`
    select count(*)::int as n, max(secuencia)::int as ultima
      from public.acarreos
     where fecha = ${ayer} and vehiculo_id = ${conCarga.id} and tramo = 'MINA_PLANTA'`
  comprobar(
    tras.n === 8 && tras.ultima === 8,
    `3 y despues 5 dejan 8 viajes, numerados hasta el 8 (quedaron ${tras.n})`,
  )

  // ── El precio sale del tramo, no del camión ──────────────────────────────
  await tx`select public.registrar_acarreos(${ayer}, ${conCarga.id}, 'PLANTA_LAVADO', 2)`

  const [precios] = await tx`
    select
      min(precio_usd) filter (where tramo = 'MINA_PLANTA')   as a_planta,
      min(precio_usd) filter (where tramo = 'PLANTA_LAVADO') as a_lavado
    from public.acarreos
    where fecha = ${ayer} and vehiculo_id = ${conCarga.id}`
  comprobar(
    Number(precios.a_planta) === 12 && Number(precios.a_lavado) === 8,
    `el mismo camion el mismo dia cobra 12 a planta y 8 a lavado (${precios.a_planta}/${precios.a_lavado})`,
  )

  // ── La tarifa se congela a la fecha del viaje ────────────────────────────
  await comoDueno(tx)
  await tx`
    insert into public.tarifas_acarreo (tramo, precio_usd, vigente_desde)
    values ('MINA_PLANTA', 20.00, current_date)`
  await como(tx, registra)

  await tx`select public.registrar_acarreos(${viejo}, ${conCarga.id}, 'MINA_PLANTA', 1)`
  const [congelado] = await tx`
    select precio_usd from public.acarreos
     where fecha = ${viejo} and vehiculo_id = ${conCarga.id}`
  comprobar(
    Number(congelado.precio_usd) === 12,
    `un viaje de la semana pasada vale 12 aunque hoy la tarifa sea 20 (llego ${congelado.precio_usd})`,
  )

  // ── La coraza: sin tarifa, hay que decir el precio ───────────────────────
  const sinTarifa = await debeFallar(
    tx,
    (sp) => sp`select public.registrar_acarreos(${ayer}, ${conCarga.id}, 'MINA_BASE', 1)`,
  )
  comprobar(
    /no tiene tarifa/i.test(sinTarifa ?? ''),
    'la coraza no se registra sin decir cuanto se paga',
  )

  await tx`
    select public.registrar_acarreos(${ayer}, ${conCarga.id}, 'MINA_BASE', 1, null, null, 25.00)`
  const [coraza] = await tx`
    select precio_usd from public.acarreos
     where fecha = ${ayer} and vehiculo_id = ${conCarga.id} and tramo = 'MINA_BASE'`
  comprobar(Number(coraza.precio_usd) === 25, 'con el precio del pedido, la coraza si entra')

  // ── El metro cúbico en blanco, nunca en cero ─────────────────────────────
  await tx`select public.registrar_acarreos(${ayer}, ${sinCarga.id}, 'MINA_PLANTA', 4)`
  const [blanco] = await tx`
    select count(*)::int as viajes, sum(carga_m3) as m3
      from public.acarreos where fecha = ${ayer} and vehiculo_id = ${sinCarga.id}`
  comprobar(
    blanco.viajes === 4 && blanco.m3 === null,
    'un camion sin carga util cuenta sus viajes pero no suma metros cubicos',
  )

  const [aviso] = await tx`
    select sin_carga::int as sin_carga, viajes::int as viajes
      from public.v_acarreos_dia
     where fecha = ${ayer} and vehiculo_id = ${sinCarga.id} and tramo = 'MINA_PLANTA'`
  comprobar(
    aviso.sin_carga === 4 && aviso.viajes === 4,
    'y la vista del dia lo dice, para que el reporte no parezca completo',
  )

  // ── El tope físico ───────────────────────────────────────────────────────
  const seExcede = await debeFallar(
    tx,
    (sp) => sp`select public.registrar_acarreos(${ayer}, ${conCarga.id}, 'MINA_PLANTA', 1, null, 25)`,
  )
  comprobar(
    /no carga|le caben/i.test(seExcede ?? ''),
    'no se guarda una carga mayor que la capacidad del camion',
  )

  // ── El chofer se copia del período correcto ──────────────────────────────
  const [choferes] = await tx`
    select
      max(chofer) filter (where fecha = ${ayer})  as ahora,
      max(chofer) filter (where fecha = ${viejo}) as entonces
    from public.acarreos where vehiculo_id = ${conCarga.id}`
  comprobar(
    choferes.ahora === 'CHOFER NUEVO DE PRUEBA' && choferes.entonces === 'CHOFER VIEJO DE PRUEBA',
    `el viaje guarda quien manejaba ESE dia (${choferes.entonces} / ${choferes.ahora})`,
  )

  // ── Anular no borra ni libera el número ──────────────────────────────────
  const [victima] = await tx`
    select id, secuencia from public.acarreos
     where fecha = ${ayer} and vehiculo_id = ${conCarga.id} and tramo = 'MINA_PLANTA'
     order by secuencia desc limit 1`

  const sinMotivo = await debeFallar(
    tx,
    (sp) => sp`select public.anular_acarreo(${victima.id}, 'no')`,
  )
  comprobar(/por que se anula/i.test(sinMotivo ?? ''), 'no se anula sin decir por que')

  await tx`select public.anular_acarreo(${victima.id}, 'SE CONTO DOS VECES EN LA PLANILLA')`
  const [anulado] = await tx`
    select estado, motivo_anulacion, anulado_por is not null as con_autor
      from public.acarreos where id = ${victima.id}`
  comprobar(
    anulado.estado === 'ANULADO' && anulado.con_autor,
    'queda anulado, con motivo y con autor, y la fila sigue ahi',
  )

  await tx`select public.registrar_acarreos(${ayer}, ${conCarga.id}, 'MINA_PLANTA', 1)`
  const [hueco] = await tx`
    select max(secuencia)::int as ultima from public.acarreos
     where fecha = ${ayer} and vehiculo_id = ${conCarga.id} and tramo = 'MINA_PLANTA'`
  comprobar(
    hueco.ultima === victima.secuencia + 1,
    `el numero del anulado no se reutiliza: el siguiente es el ${hueco.ultima}`,
  )

  const corregirAnulado = await debeFallar(
    tx,
    (sp) => sp`select public.corregir_acarreo(${victima.id}, null, null, 99)`,
  )
  comprobar(
    /anulado/i.test(corregirAnulado ?? ''),
    'lo anulado no se corrige: se registra de nuevo si hizo falta',
  )

  // ── Los totales del día no cuentan lo anulado ────────────────────────────
  const [dia] = await tx`
    select viajes::int as viajes, anulados::int as anulados
      from public.v_acarreos_dia
     where fecha = ${ayer} and vehiculo_id = ${conCarga.id} and tramo = 'MINA_PLANTA'`
  comprobar(
    dia.viajes === 8 && dia.anulados === 1,
    `el dia cuenta 8 vivos y 1 anulado aparte (${dia.viajes}/${dia.anulados})`,
  )

  // ── La casilla del dinero ────────────────────────────────────────────────
  const [tapado] = await tx`
    select precio_usd from public.v_acarreos where id = ${victima.id}`
  comprobar(
    tapado.precio_usd === null,
    'quien carga la planilla ve el viaje pero NO ve el precio',
  )

  const [tapadoDia] = await tx`
    select monto_usd, viajes::int as viajes from public.v_acarreos_dia
     where fecha = ${ayer} and vehiculo_id = ${conCarga.id} and tramo = 'MINA_PLANTA'`
  comprobar(
    tapadoDia.monto_usd === null && tapadoDia.viajes === 8,
    'y en el total del dia ve los viajes, pero el monto llega en blanco',
  )

  const tarifaTapada = await tx`select count(*)::int as n from public.v_tarifas_acarreo`
  comprobar(
    Number(tarifaTapada[0].n) === 0,
    'ni la tarifa: con el precio y el conteo se calcula el pago igual',
  )

  await comoDueno(tx)
  await como(tx, ve_pago)

  const [destapado] = await tx`
    select precio_usd from public.v_acarreos where id = ${victima.id}`
  comprobar(
    destapado.precio_usd !== null && Number(destapado.precio_usd) === 12,
    `con la casilla, el mismo viaje ensena su precio (${destapado.precio_usd})`,
  )

  const [pago] = await tx`
    select monto_usd, acumulado_usd from public.v_acarreo_pago_mensual
     where fecha = ${ayer} and transportista = 'TRANSPORTE DE PRUEBA UNO'`
  // 8 a planta (12) + 2 a lavado (8) + 1 de coraza (25) = 96 + 16 + 25
  comprobar(
    Number(pago.monto_usd) === 137,
    `el registro de pago del dia da 137 dolares: 8x12 + 2x8 + 25 (dio ${pago.monto_usd})`,
  )

  // ── Que la base aguante aunque alguien se salte la función ───────────────
  await comoDueno(tx)
  const [vivo] = await tx`
    select id from public.acarreos where estado = 'REGISTRADO' order by id limit 1`
  const aLaFuerza = await debeFallar(
    tx,
    (sp) => sp`update public.acarreos set estado = 'ANULADO' where id = ${vivo.id}`,
  )
  comprobar(
    /acarreos_anulado_con_motivo/i.test(aLaFuerza ?? ''),
    'ni el dueno de la base deja un anulado sin motivo',
  )

  const cargaImposible = await debeFallar(
    tx,
    (sp) => sp`update public.vehiculos set carga_util_m3 = 99 where id = ${conCarga.id}`,
  )
  comprobar(
    /vehiculos_carga_util_cabe/i.test(cargaImposible ?? ''),
    'ni una carga util mayor que la capacidad del camion',
  )

  // ── Los equipos del reporte diario ───────────────────────────────────────
  // La puerta cruza a Maquinaria, así que lo que se comprueba es que abra con
  // Explotación y que no haga falta el otro módulo.
  await comoDueno(tx)
  const [maquina] = await tx`
    insert into public.maquinaria (codigo, nombre, tipo)
    values ('PRB-MAQ', 'EXCAVADORA DE PRUEBA', 'EXCAVADORA')
    returning id`
  await tx`
    insert into public.horometro_lecturas (maquina_id, fecha, inicial, final)
    values (${maquina.id}, ${ayer}, 1000, 1008)`
  await tx`
    insert into public.horometro_lecturas (maquina_id, fecha, inicial, final)
    values (${maquina.id}, ${viejo}, 900, 900)`

  await como(tx, registra)
  const equipos = await tx`select * from public.equipos_en_operacion(${ayer})`
  comprobar(
    equipos.length === 1 && equipos[0].codigo === 'PRB-MAQ' && Number(equipos[0].horas) === 8,
    `con Explotacion se ven los equipos que trabajaron (${equipos.length} equipo, ${equipos[0]?.horas} h)`,
  )

  const quietos = await tx`select * from public.equipos_en_operacion(${viejo})`
  comprobar(
    quietos.length === 0,
    'un horometro anotado con cero horas no es un equipo en operacion',
  )

  await comoDueno(tx)
  await como(tx, forastero)
  const equiposCerrados = await debeFallar(
    tx,
    (sp) => sp`select * from public.equipos_en_operacion(${ayer})`,
  )
  comprobar(
    /no tiene acceso|no tienes/i.test(equiposCerrados ?? ''),
    'sin Explotacion no se ven los equipos',
  )

  await comoDueno(tx)
}
