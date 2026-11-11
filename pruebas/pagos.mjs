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

  // Con la casilla en su rol, sí. (Desde el 09/11/2026 ya no se presta por
  // persona: la casilla va en el rol.)
  await comoDueno(tx)
  await tx`
    insert into public.rol_acciones (rol, accion, puesta_por)
    values ('PRUEBA_PAGOS_VENTAS', 'VENTAS.REGISTRAR_PAGOS', ${admin})`
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

  // 11/11/2026: cambiar el monto aplicado de una nota enlazada es casilla aparte.
  const sinCasilla = await debeFallar(tx, (sp) => sp`select public.cambiar_monto_aplicado_pago(${enlace}, ${totalBs * 2})`)
  comprobar(/permiso/i.test(sinCasilla ?? ''), 'registrar pagos no basta para cambiar el monto aplicado')
  await comoDueno(tx)
  await como(tx, mira)
  const porLaOtraPuerta = await debeFallar(
    tx,
    (sp) => sp`select public.asociar_notas_a_pago_bancario(${pago}, ${sp.json([{ nota_id: nota.id, monto: totalBs * 2 }])})`,
  )
  comprobar(/permiso/i.test(porLaOtraPuerta ?? ''), 'ni volviendo a asociar la nota con otro monto')
  await comoDueno(tx)
  await tx`
    insert into public.rol_acciones (rol, accion, puesta_por)
    values ('PRUEBA_PAGOS_VENTAS', 'VENTAS.CAMBIAR_MONTO_APLICADO', ${admin})`
  await como(tx, mira)

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

  grupo('Registros de pagos · comprobantes')

  // Solo se anota la fila: el archivo de verdad lo sube el navegador al depósito.
  const [{ adjuntar_comprobante_pago: comp }] = await tx`
    select public.adjuntar_comprobante_pago(${pago}, ${`${pago}/prueba.jpg`}, 'prueba.jpg', 'image/jpeg', 100)`
  comprobar(Boolean(comp), 'con el permiso extendido se adjunta un comprobante')
  const ajena = await debeFallar(
    tx,
    (sp) => sp`select public.adjuntar_comprobante_pago(${pago}, 'otro/prueba.jpg', 'x.jpg', 'image/jpeg', 100)`,
  )
  comprobar(/no corresponde/i.test(ajena ?? ''), 'un archivo que no cuelga del pago no se anota')
  const raro = await debeFallar(
    tx,
    (sp) => sp`select public.adjuntar_comprobante_pago(${pago}, ${`${pago}/x.exe`}, 'x.exe', 'application/x-msdownload', 100)`,
  )
  comprobar(/solo se admiten/i.test(raro ?? ''), 'solo fotos o PDF')
  const sinMotivoComp = await debeFallar(tx, (sp) => sp`select public.quitar_comprobante_pago(${comp}, '')`)
  comprobar(/por qu/i.test(sinMotivoComp ?? ''), 'quitar un comprobante pide motivo')

  await comoDueno(tx)
  await como(tx, ajeno)
  const [{ n: ajenoVeComp }] = await tx`select count(*)::int as n from public.pagos_bancarios_comprobantes`
  comprobar(ajenoVeComp === 0, 'quien no entra a Ventas no ve los comprobantes')
  const ajenoAdjunta = await debeFallar(
    tx,
    (sp) => sp`select public.adjuntar_comprobante_pago(${pago}, ${`${pago}/y.jpg`}, 'y.jpg', 'image/jpeg', 100)`,
  )
  comprobar(/permiso|ventas/i.test(ajenoAdjunta ?? ''), 'ni los adjunta')

  await comoDueno(tx)
  await como(tx, mira)
  await tx`select public.quitar_comprobante_pago(${comp}, 'captura equivocada')`
  await comoDueno(tx)
  const [quitado] = await tx`select quitado_en, motivo_quitado from public.pagos_bancarios_comprobantes where id = ${comp}`
  comprobar(Boolean(quitado?.quitado_en) && quitado.motivo_quitado === 'captura equivocada', 'quitado no se borra: queda con su motivo')
  await como(tx, mira)

  grupo('Registros de pagos · observación')

  await tx`select public.guardar_observacion_pago(${pago}, '  pagó dos viajes en uno  ')`
  const [{ observacion: obs }] = await tx`select observacion from public.pagos_bancarios where id = ${pago}`
  comprobar(obs === 'pagó dos viajes en uno', 'la observación se guarda tal cual, sin espacios de sobra')
  await tx`select public.guardar_observacion_pago(${pago}, '')`
  const [{ observacion: vacia }] = await tx`select observacion from public.pagos_bancarios where id = ${pago}`
  comprobar(vacia === null, 'vaciarla la quita')
  await comoDueno(tx)
  await como(tx, ajeno)
  const ajenoObs = await debeFallar(tx, (sp) => sp`select public.guardar_observacion_pago(${pago}, 'no')`)
  comprobar(/permiso|ventas/i.test(ajenoObs ?? ''), 'sin el permiso no se escribe observación')
  await comoDueno(tx)
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

  // -------------------------------------------------------------------------
  grupo('Clientes · los que deben por notas de entrega')

  // Una nota real se marca por cobrar con una fecha ya pasada: todo se deshace al final.
  await comoDueno(tx)
  await tx`update public.notas_entrega
              set pendiente_por_cobrar = true, fecha_pago = current_date - 3, cobrada_en = null
            where id = ${nota.id}`

  await como(tx, mira)
  const debe = await tx`select * from public.notas_por_cobrar_de_clientes() where nota_id = ${nota.id}`
  comprobar(debe.length === 1, 'quien entra a Ventas (sin ser admin) ve la nota por cobrar')
  comprobar(debe[0]?.vencida === false, 'y no sale vencida: las cuentas por cobrar no vencen (11/11/2026)')
  comprobar(Number(debe[0]?.total_bs) === Number(nota.total_bs), 'con el mismo total que la nota')

  await comoDueno(tx)
  await tx`update public.notas_entrega set cobrada_en = now() where id = ${nota.id}`
  await como(tx, mira)
  const [{ n: cobrada }] = await tx`select count(*)::int as n from public.notas_por_cobrar_de_clientes() where nota_id = ${nota.id}`
  comprobar(cobrada === 0, 'una vez cobrada, deja de salir')

  await como(tx, ajeno)
  const fuera = await debeFallar(tx, (sp) => sp`select * from public.notas_por_cobrar_de_clientes()`)
  comprobar(Boolean(fuera), 'quien no entra a Ventas no ve lo que deben los clientes')

  await comoDueno(tx)
}
