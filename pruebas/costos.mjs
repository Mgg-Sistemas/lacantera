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

  // Lo que sigue lo llenan las piezas 2 a 5.
  globalThis.__costos = { gerente, acepta, mira, caja1: Number(caja1), hoy, hace10 }
}
