/*
  Inventario: el libro y el costo.

  Lo que se prueba aquí es la aritmética del almacén, no las puertas — de esas
  se encarga `permisos.mjs`. Por eso se trabaja como administrador.

  Las entradas costeadas se escriben llamando a `private.registrar_movimiento`
  como dueño de la base. Es la única puerta por la que se escribe el libro —
  todas las operaciones pasan por ella—, y usarla directamente permite fijar el
  costo de cada entrada sin arrastrar una cadena de compra entera. Que una
  recepción de verdad entregue el costo correcto a esa puerta es cosa de
  `compras.mjs`, que es donde se arma la cadena.

  Los números están elegidos para que el promedio ponderado y el promedio a
  secas no coincidan: 10 unidades a 5 y 30 a 9 dan 8 ponderado y 7 a secas. Una
  prueba con 10 y 10 pasaría con la fórmula equivocada.
*/
import { grupo, comprobar, como, comoDueno, debeFallar } from './ayuda.mjs'

const cerca = (a, b, holgura = 0.000001) => Math.abs(Number(a) - Number(b)) < holgura

export default async function pruebaInventario(tx) {
  grupo('Inventario · preparación')

  const [admin] = await tx`
    select ur.usuario_id as id from public.usuarios_roles ur
    join public.perfiles p on p.id = ur.usuario_id
    where ur.rol = 'ADMIN' and p.activo limit 1`

  const [general] = await tx`select id, nombre from public.almacenes where codigo = 'ALM-GEN'`
  const [taller] = await tx`select id, nombre from public.almacenes where codigo = 'TALLER'`

  comprobar(!!admin && !!general && !!taller, 'hay administrador, almacén general y taller')
  if (!admin || !general || !taller) return

  await como(tx, admin.id)

  // Artículo propio: apoyarse en uno del catálogo haría que la prueba dependiera
  // de cuánto haya hoy en el patio, y mañana daría otro resultado.
  const [art] = await tx`
    select public.crear_articulo('PRUEBA-INV-1', 'RODAMIENTO DE PRUEBA', 'REPUESTO', 'UND',
           'Artículo de prueba. No debería sobrevivir a la transacción.') as id`

  const existencia = async (almacen) =>
    Number(
      (
        await tx`select coalesce(sum(cantidad * signo), 0) as e
                 from public.inventario_movimientos
                 where almacen_id = ${almacen} and articulo_id = ${art.id}`
      )[0].e,
    )

  const promedio = async (almacen) =>
    Number(
      (
        await tx`select case when sum(cantidad * signo) > 0
                             then round(sum(valor_usd * signo) / sum(cantidad * signo), 6)
                             else 0 end as c
                 from public.inventario_movimientos
                 where almacen_id = ${almacen} and articulo_id = ${art.id}`
      )[0].c,
    )

  const entrada = async (almacen, cantidad, costo) => {
    await comoDueno(tx)
    const [m] = await tx`
      select private.registrar_movimiento('ENTRADA_COMPRA', 1::smallint, ${almacen}, ${art.id},
             ${cantidad}, ${costo}, 'PRUEBA: entrada costeada') as id`
    await como(tx, admin.id)
    return m.id
  }

  // -------------------------------------------------------------------------
  grupo('Inventario · el costo promedio se pondera')

  await entrada(general.id, 10, 5)
  await entrada(general.id, 30, 9)

  comprobar((await existencia(general.id)) === 40, 'entran 10 y luego 30: hay 40')
  comprobar(
    cerca(await promedio(general.id), 8),
    `el promedio pondera por cantidad: 8, no 7 (${await promedio(general.id)})`,
  )

  const [salida] = await tx`
    select public.registrar_salida(${general.id}, ${art.id}, 10,
           'PRUEBA: consumo para comprobar a que costo sale') as id`

  const [movSalida] = await tx`
    select tipo, signo, costo_usd, valor_usd from public.inventario_movimientos
     where id = ${salida.id}`

  comprobar(movSalida.tipo === 'SALIDA_CONSUMO', 'la salida por defecto es de consumo')
  comprobar(Number(movSalida.signo) === -1, 'y resta')
  comprobar(cerca(movSalida.costo_usd, 8), `sale al promedio que había: 8 (${movSalida.costo_usd})`)

  comprobar((await existencia(general.id)) === 30, 'quedan 30')
  comprobar(
    cerca(await promedio(general.id), 8),
    'y sacar al promedio no mueve el promedio de lo que queda',
  )

  // -------------------------------------------------------------------------
  grupo('Inventario · la existencia sale del libro')

  const [vista] = await tx`
    select existencia, costo_promedio_usd, valor_usd from public.v_existencias
     where almacen_id = ${general.id} and articulo_id = ${art.id}`

  comprobar(Number(vista.existencia) === 30, 'la vista de existencias dice lo mismo que el libro')
  comprobar(cerca(vista.costo_promedio_usd, 8), 'y arrastra el mismo costo promedio')
  comprobar(cerca(vista.valor_usd, 240, 0.01), `30 a 8 valen 240 (${vista.valor_usd})`)

  // -------------------------------------------------------------------------
  grupo('Inventario · el libro no se edita ni se borra')

  // Como dueño a propósito: así lo que rechaza la escritura es el disparador y
  // no la política de fila, que es lo que se quiere comprobar.
  await comoDueno(tx)

  const seEdita = await debeFallar(
    tx,
    (sp) => sp`update public.inventario_movimientos set cantidad = 1 where id = ${salida.id}`,
  )
  comprobar(
    seEdita !== null && /no se modifica ni se borra/i.test(seEdita),
    'un movimiento no se edita, ni siendo dueño de la base',
  )

  const seBorra = await debeFallar(
    tx,
    (sp) => sp`delete from public.inventario_movimientos where id = ${salida.id}`,
  )
  comprobar(
    seBorra !== null && /no se modifica ni se borra/i.test(seBorra),
    'y tampoco se borra',
  )

  await como(tx, admin.id)

  // -------------------------------------------------------------------------
  grupo('Inventario · no sale lo que no hay')

  const deMas = await debeFallar(
    tx,
    (sp) => sp`select public.registrar_salida(${general.id}, ${art.id}, 999,
               'PRUEBA: sacar mas de lo que hay')`,
  )
  comprobar(
    deMas !== null && /solo hay .* y se intentan sacar/i.test(deMas),
    'no se saca más de lo que hay en existencia',
  )

  const sinMotivo = await debeFallar(
    tx,
    (sp) => sp`select public.registrar_salida(${general.id}, ${art.id}, 1, '')`,
  )
  comprobar(
    sinMotivo !== null && /no se puede auditar/i.test(sinMotivo),
    'una salida sin motivo no se registra: no se podría auditar',
  )

  const tipoInventado = await debeFallar(
    tx,
    (sp) => sp`select public.registrar_salida(${general.id}, ${art.id}, 1,
               'PRUEBA: tipo que no existe', 'SALIDA_PORQUE_SI')`,
  )
  comprobar(
    tipoInventado !== null && /tipo de salida no válido/i.test(tipoInventado),
    'y el tipo de salida tiene que ser uno de la lista',
  )

  comprobar((await existencia(general.id)) === 30, 'después de tres intentos fallidos siguen los 30')

  // -------------------------------------------------------------------------
  grupo('Inventario · el conteo físico')

  const sinDiferencia = await debeFallar(
    tx,
    (sp) => sp`select public.registrar_ajuste(${general.id}, ${art.id}, 30,
               'PRUEBA: contado igual a lo que dice el sistema')`,
  )
  comprobar(
    sinDiferencia !== null && /no hay nada que ajustar/i.test(sinDiferencia),
    'contar lo mismo que dice el sistema no escribe una línea vacía',
  )

  const ajusteMudo = await debeFallar(
    tx,
    (sp) => sp`select public.registrar_ajuste(${general.id}, ${art.id}, 28, '')`,
  )
  comprobar(
    ajusteMudo !== null && /descuadre disfrazado/i.test(ajusteMudo),
    'un ajuste sin explicación tampoco',
  )

  const [faltante] = await tx`
    select public.registrar_ajuste(${general.id}, ${art.id}, 28,
           'PRUEBA: conteo fisico, faltaban dos') as id`
  const [movFaltante] = await tx`
    select tipo, cantidad, costo_usd from public.inventario_movimientos where id = ${faltante.id}`

  comprobar(movFaltante.tipo === 'AJUSTE_NEGATIVO', 'contar de menos escribe un ajuste negativo')
  comprobar(Number(movFaltante.cantidad) === 2, 'por la diferencia, no por lo contado')
  comprobar((await existencia(general.id)) === 28, 'y la existencia queda en lo contado')

  const [sobrante] = await tx`
    select public.registrar_ajuste(${general.id}, ${art.id}, 35,
           'PRUEBA: conteo fisico, aparecieron siete') as id`
  const [movSobrante] = await tx`
    select tipo, cantidad, costo_usd from public.inventario_movimientos where id = ${sobrante.id}`

  comprobar(movSobrante.tipo === 'AJUSTE_POSITIVO', 'contar de más escribe un ajuste positivo')
  comprobar(Number(movSobrante.cantidad) === 7, 'también por la diferencia')
  comprobar(
    cerca(movSobrante.costo_usd, 8),
    `el sobrante entra al costo que ya tenía el almacén, no a cero (${movSobrante.costo_usd})`,
  )
  comprobar((await existencia(general.id)) === 35, 'la existencia queda en 35')
  comprobar(
    cerca(await promedio(general.id), 8),
    'y un conteo físico no inventa ni destruye valor: el promedio sigue en 8',
  )

  // -------------------------------------------------------------------------
  grupo('Inventario · el costo viaja con el material')

  const mismoSitio = await debeFallar(
    tx,
    (sp) => sp`select public.transferir_existencia(${general.id}, ${general.id}, ${art.id}, 1,
               'PRUEBA: origen igual al destino')`,
  )
  comprobar(
    mismoSitio !== null && /el mismo almacén/i.test(mismoSitio),
    'no se traslada material a donde ya está',
  )

  const sinTanto = await debeFallar(
    tx,
    (sp) => sp`select public.transferir_existencia(${general.id}, ${taller.id}, ${art.id}, 999,
               'PRUEBA: mover mas de lo que hay')`,
  )
  comprobar(
    sinTanto !== null && /solo hay .* y se intentan mover/i.test(sinTanto),
    'ni más de lo que hay en el origen',
  )

  const [traslado] = await tx`
    select public.transferir_existencia(${general.id}, ${taller.id}, ${art.id}, 10,
           'PRUEBA: al taller para la reparacion de la 966') as id`

  comprobar((await existencia(general.id)) === 25, 'el traslado baja el origen a 25')
  comprobar((await existencia(taller.id)) === 10, 'y sube el destino a 10')
  comprobar(
    cerca(await promedio(taller.id), 8),
    `el material llega al taller costando lo mismo que en el general: 8 (${await promedio(taller.id)})`,
  )

  const [pareja] = await tx`
    select count(*) as n from public.inventario_movimientos
     where movimiento_origen = ${traslado.id} and tipo = 'TRANSFERENCIA_ENTRADA'`
  comprobar(Number(pareja.n) === 1, 'las dos patas quedan enlazadas por el movimiento de origen')

  // -------------------------------------------------------------------------
  grupo('Inventario · reversos')

  const [traslado2] = await tx`
    select public.transferir_existencia(${general.id}, ${taller.id}, ${art.id}, 5,
           'PRUEBA: segundo traslado, para reversarlo entero') as id`

  comprobar((await existencia(general.id)) === 20, 'el segundo traslado deja el general en 20')
  comprobar((await existencia(taller.id)) === 15, 'y el taller en 15')

  await tx`select public.reversar_movimiento(${traslado2.id}, 'PRUEBA: el traslado fue un error')`

  comprobar((await existencia(general.id)) === 25, 'reversar devuelve el material al origen')
  comprobar((await existencia(taller.id)) === 10, 'y lo quita del destino: las dos patas o ninguna')

  const dosVeces = await debeFallar(
    tx,
    (sp) => sp`select public.reversar_movimiento(${traslado2.id}, 'PRUEBA: reversar dos veces')`,
  )
  comprobar(
    dosVeces !== null && /ya fue reversado/i.test(dosVeces),
    'un movimiento no se reversa dos veces',
  )

  const [elReverso] = await tx`
    select id from public.inventario_movimientos
     where movimiento_origen = ${traslado2.id} and tipo = 'REVERSO' limit 1`

  const reversoDelReverso = await debeFallar(
    tx,
    (sp) => sp`select public.reversar_movimiento(${elReverso.id}, 'PRUEBA: reversar un reverso')`,
  )
  comprobar(
    reversoDelReverso !== null && /un reverso no se reversa/i.test(reversoDelReverso),
    'y un reverso no se reversa: se registra el movimiento que corresponda',
  )

  // El caso que obligó a afinar el reverso: si el material ya salió del destino,
  // deshacer el traslado dejaría al taller en negativo.
  await tx`
    select public.registrar_salida(${taller.id}, ${art.id}, 10,
           'PRUEBA: se consumio todo lo que habia llegado al taller')`

  comprobar((await existencia(taller.id)) === 0, 'el taller consume las 10 que le habían llegado')

  const yaSeUso = await debeFallar(
    tx,
    (sp) => sp`select public.reversar_movimiento(${traslado.id},
               'PRUEBA: deshacer un traslado cuyo material ya se consumio')`,
  )
  comprobar(
    yaSeUso !== null && /ya se movió del destino del traslado/i.test(yaSeUso),
    'no se deshace un traslado cuyo material ya salió del destino',
  )

  comprobar((await existencia(general.id)) === 25, 'y el intento fallido no movió el origen')

  const reversoMudo = await debeFallar(
    tx,
    (sp) => sp`select public.reversar_movimiento(${salida.id}, '')`,
  )
  comprobar(
    reversoMudo !== null && /por qué se reversa/i.test(reversoMudo),
    'un reverso sin motivo no se escribe',
  )

  await comoDueno(tx)
}
