/*
  Tesorería: las dos marcas que se ponen después de crear el movimiento.

  Esta suite existe por un fallo concreto. El libro de tesorería es inmutable
  con dos excepciones —enlazar las patas de un traslado y marcar de qué nómina
  sale un pago—, y ninguna de las dos funcionaba: el disparador vive en un
  BEFORE UPDATE, donde las columnas generadas todavía no están calculadas, así
  que su comprobación de "no cambió nada más" nunca podía ser cierta.

  Lo que se prueba aquí es lo de siempre, en los dos sentidos: que las dos
  excepciones dejan pasar lo que tienen que dejar pasar, y —más importante—
  que el libro sigue sin poder editarse por ningún otro sitio. Una corrección
  que arreglara lo primero abriendo lo segundo sería peor que el fallo.
*/
import { grupo, comprobar, como, comoDueno, debeFallar, asegurarTasaBcv } from './ayuda.mjs'

const cerca = (a, b, holgura = 0.01) => Math.abs(Number(a) - Number(b)) < holgura

export default async function pruebaTesoreria(tx) {
  grupo('Tesorería · preparación')

  const [admin] = await tx`
    select ur.usuario_id as id from public.usuarios_roles ur
    join public.perfiles p on p.id = ur.usuario_id
    where ur.rol = 'ADMIN' and p.activo limit 1`

  const [banco] = await tx`select id from public.cuentas_tesoreria where codigo = 'BCO-USD-1'`
  const [caja] = await tx`select id from public.cuentas_tesoreria where codigo = 'CAJA-USD'`

  comprobar(!!admin && !!banco && !!caja, 'hay administrador y dos cuentas en divisas')
  if (!admin || !banco || !caja) return

  await como(tx, admin.id)
  await asegurarTasaBcv(tx)

  await tx`select public.registrar_ingreso(${banco.id}, 3000,
           'PRUEBA: fondeo para el traslado entre cuentas')`

  const saldo = async (cuenta) =>
    Number((await tx`select saldo from public.v_saldos_tesoreria where id = ${cuenta}`)[0].saldo)

  const bancoAntes = await saldo(banco.id)
  const cajaAntes = await saldo(caja.id)

  // -------------------------------------------------------------------------
  grupo('Tesorería · el dinero cambia de sitio')

  const [traslado] = await tx`
    select public.transferir_entre_cuentas(${banco.id}, ${caja.id}, 500, null, null,
           'REF-PRUEBA-TRASLADO', 'PRUEBA: a caja para gastos menores') as id`

  comprobar(
    cerca(await saldo(banco.id), bancoAntes - 500),
    `salen 500 del banco (${bancoAntes} → ${await saldo(banco.id)})`,
  )
  comprobar(
    cerca(await saldo(caja.id), cajaAntes + 500),
    `y entran 500 en la caja (${cajaAntes} → ${await saldo(caja.id)})`,
  )

  // El enlace entre las dos patas es la marca que no se podía escribir. Sin
  // ella el traslado queda como dos movimientos sueltos que casualmente
  // cuadran, y el reverso de uno solo deja de estar protegido.
  const [salida] = await tx`
    select id, transferencia_par from public.tesoreria_movimientos where id = ${traslado.id}`
  comprobar(salida.transferencia_par !== null, 'la salida queda apuntando a su entrada')

  const [entrada] = await tx`
    select id, transferencia_par from public.tesoreria_movimientos
     where id = ${salida.transferencia_par}`
  comprobar(
    Number(entrada.transferencia_par) === Number(salida.id),
    'y la entrada apuntando de vuelta a la salida: las dos, no una',
  )

  const mediaPata = await debeFallar(
    tx,
    (sp) => sp`select public.reversar_movimiento_tesoreria(${salida.id},
               'PRUEBA: deshacer una sola mitad del traslado')`,
  )
  comprobar(
    mediaPata !== null && /mitades de un traslado/i.test(mediaPata),
    'y por eso no se reversa una sola mitad: es lo que protege el enlace',
  )

  // -------------------------------------------------------------------------
  grupo('Tesorería · el libro sigue cerrado')

  // Lo importante de esta corrección no es lo que deja pasar sino lo que
  // sigue sin dejar pasar. Se prueba como dueño de la base a propósito: así
  // quien rechaza es el disparador y no la política de fila.
  await comoDueno(tx)

  const cambiarMonto = await debeFallar(
    tx,
    (sp) => sp`update public.tesoreria_movimientos set monto = 1 where id = ${salida.id}`,
  )
  comprobar(
    cambiarMonto !== null && /no se edita ni se borra/i.test(cambiarMonto),
    'cambiar el monto de un movimiento sigue prohibido',
  )

  const cambiarConcepto = await debeFallar(
    tx,
    (sp) => sp`update public.tesoreria_movimientos set concepto = 'OTRA COSA' where id = ${salida.id}`,
  )
  comprobar(
    cambiarConcepto !== null && /no se edita ni se borra/i.test(cambiarConcepto),
    'y el concepto también',
  )

  // El caso fino: escribir la marca permitida y de paso colar otro cambio.
  const colarse = await debeFallar(
    tx,
    (sp) => sp`update public.tesoreria_movimientos
                  set nomina_periodo_id = 1, monto = 9999
                where id = ${salida.id}`,
  )
  comprobar(
    colarse !== null && /no se edita ni se borra/i.test(colarse),
    'ni aprovechando la excepción para cambiar además el monto',
  )

  const volverAMarcar = await debeFallar(
    tx,
    (sp) => sp`update public.tesoreria_movimientos set transferencia_par = null
                where id = ${salida.id}`,
  )
  comprobar(
    volverAMarcar !== null && /no se edita ni se borra/i.test(volverAMarcar),
    'una marca ya puesta no se quita: la excepción es de nulo a no nulo, una sola vez',
  )

  const borrar = await debeFallar(
    tx,
    (sp) => sp`delete from public.tesoreria_movimientos where id = ${salida.id}`,
  )
  comprobar(
    borrar !== null && /no se edita ni se borra/i.test(borrar),
    'y no se borra ninguna línea',
  )

  await comoDueno(tx)
}
