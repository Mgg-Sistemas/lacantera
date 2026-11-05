/*
  Ventas › Registros de pagos: los depósitos del banco y las notas que cubren.

  Lo que se rompería en silencio: que alguien sin el permiso extendido
  registre o asocie pagos, que quien no entra a Ventas los vea, que importar
  dos veces el mismo archivo duplique, que una fila mala deje media
  importación hecha, o que el estado diga «cuadra» cuando no cuadra.
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

export default async function pruebaPagos(tx) {
  grupo('Registros de pagos · quién ve y quién escribe')

  // Nombres inventados: el repositorio es público y aquí no entra nadie real.
  const mira = await usuarioDePrueba(tx, { usuario: 'prueba_pagos_mira', nombre: 'Quien mira ventas' })
  const ajeno = await usuarioDePrueba(tx, { usuario: 'prueba_pagos_ajeno', nombre: 'Quien no entra a ventas' })
  const admin = await usuarioDePrueba(tx, { usuario: 'prueba_pagos_admin', nombre: 'Quien administra', roles: ['ADMIN'] })

  await rolDePrueba(tx, 'PRUEBA_PAGOS_VENTAS', { PANEL: 'LECTURA', VENTAS: 'TOTAL' })
  await rolDePrueba(tx, 'PRUEBA_PAGOS_PANEL', { PANEL: 'LECTURA' })
  await tx`insert into public.usuarios_roles (usuario_id, rol) values (${mira}, 'PRUEBA_PAGOS_VENTAS')`
  await tx`insert into public.usuarios_roles (usuario_id, rol) values (${ajeno}, 'PRUEBA_PAGOS_PANEL')`

  // Una nota real despachada en bolívares, solo para asociarla: todo se deshace al final.
  const [nota] = await tx`
    select id, total_bs from public.notas_entrega
     where estado = 'DESPACHADA' and moneda = 'VES' and total_bs > 1000
     order by id limit 1`
  comprobar(Boolean(nota), 'hay una nota despachada en Bs para probar')
  if (!nota) return

  // Ventas en Total no regala el permiso: es extendido.
  await como(tx, mira)
  const [{ n: visibles }] = await tx`select count(*)::int as n from public.listar_pagos_bancarios()`
  comprobar(visibles >= 0, 'quien entra a Ventas ve la lista')
  const sinPermiso = await debeFallar(tx, (sp) => sp`select public.registrar_pago_bancario(current_date, 'VES', 100)`)
  comprobar(/permiso/i.test(sinPermiso ?? ''), `Ventas en Total no basta para registrar (${(sinPermiso ?? 'no rebotó').slice(0, 50)}…)`)
  const aMano = await debeFallar(
    tx,
    (sp) => sp`insert into public.pagos_bancarios (fecha, moneda, monto, registrado_por) values (current_date, 'VES', 1, ${mira})`,
  )
  comprobar(/permission denied|permiso|policy/i.test(aMano ?? ''), 'y tampoco se escribe a mano en la tabla')

  await comoDueno(tx)
  await como(tx, ajeno)
  const ajenoVe = await debeFallar(tx, (sp) => sp`select * from public.listar_pagos_bancarios()`)
  comprobar(/ventas/i.test(ajenoVe ?? ''), 'quien no entra a Ventas no ve los pagos')

  // Con el permiso prestado, sí.
  await comoDueno(tx)
  await tx`
    insert into public.autorizaciones (accion, a_usuario, por_usuario, motivo)
    values ('VENTAS.REGISTRAR_PAGOS', ${mira}, ${admin}, 'prueba')`
  await como(tx, mira)

  grupo('Registros de pagos · el estado dice la verdad')

  const totalBs = Number(nota.total_bs)
  const [{ registrar_pago_bancario: pago }] = await tx`
    select public.registrar_pago_bancario(current_date - 1, 'VES', ${totalBs}, 100, 'PRB-1', 'pago de prueba')`
  comprobar(Boolean(pago), 'con el permiso extendido se registra')

  const estado = async () => {
    const [p] = await tx`select estado, diferencia from public.listar_pagos_bancarios() where id = ${pago}`
    return p
  }
  comprobar((await estado()).estado === 'SIN_NOTAS', 'recién registrado, sin notas')

  await tx`select public.asociar_notas_a_pago_bancario(${pago}, ${tx.json([{ nota_id: nota.id }])})`
  comprobar((await estado()).estado === 'CUADRA', 'con la nota de su mismo monto, cuadra')

  await tx`select public.editar_pago_bancario(${pago}, current_date - 1, 'VES', ${totalBs + 0.5}, 100, 'PRB-1', 'pago de prueba')`
  comprobar((await estado()).estado === 'MINIMA', 'medio bolívar de más es diferencia mínima, no cuadra')

  await tx`select public.editar_pago_bancario(${pago}, current_date - 1, 'VES', ${totalBs * 2}, 100, 'PRB-1', 'pago de prueba')`
  comprobar((await estado()).estado === 'DIFERENCIA', 'el doble del monto no cuadra')

  const [{ enlace_id: enlace }] = await tx`select enlace_id from public.notas_de_pago_bancario(${pago})`
  await tx`select public.cambiar_monto_aplicado_pago(${enlace}, ${totalBs * 2})`
  comprobar((await estado()).estado === 'CUADRA', 'ajustando el monto aplicado vuelve a cuadrar')
  await comoDueno(tx)
  const [{ total: sigue }] = await tx`select total_bs as total from public.notas_entrega where id = ${nota.id}`
  comprobar(Number(sigue) === totalBs, 'y la nota de entrega no cambió')
  await como(tx, mira)

  await tx`select public.quitar_nota_de_pago_bancario(${enlace})`
  comprobar((await estado()).estado === 'SIN_NOTAS', 'quitar la nota la saca del pago')
  await comoDueno(tx)
  const [{ n: quedanEnlaces }] = await tx`select count(*)::int as n from public.pagos_bancarios_notas where id = ${enlace}`
  comprobar(quedanEnlaces === 1, 'pero el enlace no se borra: queda marcado')
  await como(tx, mira)

  const sinMotivo = await debeFallar(tx, (sp) => sp`select public.anular_pago_bancario(${pago}, '')`)
  comprobar(/por qu/i.test(sinMotivo ?? ''), 'anular pide motivo')
  await tx`select public.anular_pago_bancario(${pago}, 'prueba de anular')`
  comprobar((await estado()).estado === 'ANULADO', 'anulado con motivo')

  grupo('Registros de pagos · importar')

  const filas = [
    { fecha: '2026-09-15', moneda: 'VES', monto: 1234.56, referencia: 'PRB-IMP-1', descripcion: 'uno' },
    { fecha: '2026-09-15', moneda: 'USD', monto: 20, descripcion: 'dos' },
  ]
  const [{ importar_pagos_bancarios: primera }] = await tx`select public.importar_pagos_bancarios(${tx.json(filas)})`
  comprobar(primera.nuevos === 2 && primera.repetidos === 0, `primera vez entran las dos (${JSON.stringify(primera)})`)
  const [{ importar_pagos_bancarios: segunda }] = await tx`select public.importar_pagos_bancarios(${tx.json(filas)})`
  comprobar(segunda.nuevos === 0 && segunda.repetidos === 2, `importar otra vez no duplica (${JSON.stringify(segunda)})`)

  const mala = await debeFallar(
    tx,
    (sp) => sp`select public.importar_pagos_bancarios(${sp.json([
      { fecha: '2026-09-16', moneda: 'VES', monto: 777.77, referencia: 'PRB-IMP-3' },
      { fecha: 'no es fecha', moneda: 'VES', monto: 1 },
    ])})`,
  )
  comprobar(/fila 2/i.test(mala ?? ''), 'una fila mala dice cuál es')
  const [{ n: medias }] = await tx`select count(*)::int as n from public.listar_pagos_bancarios() where referencia = 'PRB-IMP-3'`
  comprobar(medias === 0, 'y no deja la importación a medias')

  await comoDueno(tx)
}
