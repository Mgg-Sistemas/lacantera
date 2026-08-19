/*
  Compras: la cadena entera, de la solicitud al pago de la factura.

  Es larga a propósito. Una compra en este sistema pasa por siete estados y
  toca tres módulos —compras, tesorería e inventario— y lo que más importa no
  es que cada función responda, sino que el material y el dinero acaben en el
  sitio correcto. Eso solo se ve armando la cadena completa.

  Se trabaja como administrador: lo que se comprueba es el comportamiento del
  circuito, no quién puede empujarlo. De las puertas se encarga `permisos.mjs`.

  Todo en dólares para que las tasas no metan ruido: en USD la tasa y la tasa
  del dólar son la misma, así que el costo en dólares es el precio tecleado y
  cualquier diferencia que aparezca es un error de verdad y no un redondeo.
*/
import { grupo, comprobar, como, comoDueno, debeFallar, asegurarTasaBcv } from './ayuda.mjs'

const cerca = (a, b, holgura = 0.01) => Math.abs(Number(a) - Number(b)) < holgura

export default async function pruebaCompras(tx) {
  grupo('Compras · preparación')

  const [admin] = await tx`
    select ur.usuario_id as id from public.usuarios_roles ur
    join public.perfiles p on p.id = ur.usuario_id
    where ur.rol = 'ADMIN' and p.activo limit 1`

  const [general] = await tx`select id from public.almacenes where codigo = 'ALM-GEN'`
  const [cuenta] = await tx`select id, moneda from public.cuentas_tesoreria where codigo = 'BCO-USD-1'`

  comprobar(!!admin && !!general && !!cuenta, 'hay administrador, almacén general y cuenta en divisas')
  if (!admin || !general || !cuenta) return

  await como(tx, admin.id)
  await asegurarTasaBcv(tx)

  const json = (v) => tx.json(v)

  // Dos proveedores porque una cotización nueva del mismo proveedor sustituye a
  // la anterior: para comparar dos ofertas hacen falta dos.
  const [prov1] = await tx`
    select public.guardar_proveedor(null, 'J-30111222-3', 'REPUESTOS DE PRUEBA UNO') as id`
  const [prov2] = await tx`
    select public.guardar_proveedor(null, 'J-30111222-4', 'REPUESTOS DE PRUEBA DOS') as id`

  // Uno que se guarda y otro que no. El servicio es el que descubre las
  // existencias fantasma: se compra y se paga, pero no hay nada que poner en
  // un estante.
  const [pieza] = await tx`
    select public.crear_articulo('PRUEBA-COM-1', 'BOMBA HIDRAULICA DE PRUEBA', 'REPUESTO', 'UND') as id`
  const [flete] = await tx`
    select public.crear_articulo('PRUEBA-COM-2', 'FLETE DE PRUEBA', 'SERVICIO', 'SERV',
           null, false) as id`

  await tx`select public.registrar_ingreso(${cuenta.id}, 5000,
           'PRUEBA: fondeo para pagar la compra de prueba')`

  // -------------------------------------------------------------------------
  grupo('Compras · el pedido')

  const sinJustificacion = await debeFallar(
    tx,
    (sp) => sp`select public.crear_pedido('PRUEBA sin justificacion', '',
               ${json([{ descripcion: 'Algo', cantidad: 1 }])})`,
  )
  comprobar(
    sinJustificacion !== null && /necesita el porqué/i.test(sinJustificacion),
    'un pedido sin justificación no sale: quien aprueba no está en el frente',
  )

  const sinRenglones = await debeFallar(
    tx,
    (sp) => sp`select public.crear_pedido('PRUEBA sin renglones',
               'Justificacion suficientemente larga', ${json([])})`,
  )
  comprobar(
    sinRenglones !== null && /al menos un renglón/i.test(sinRenglones),
    'ni uno sin renglones',
  )

  const [pedido] = await tx`
    select public.crear_pedido(
      'PRUEBA: bomba hidraulica para la 966',
      'La bomba de la cargadora esta goteando y para la carga del turno de noche.',
      ${json([
        { articulo_id: Number(pieza.id), descripcion: 'BOMBA HIDRAULICA', cantidad: 20, unidad: 'UND' },
        { articulo_id: Number(flete.id), descripcion: 'FLETE HASTA LA CANTERA', cantidad: 1, unidad: 'SERV' },
      ])},
      'ALTA') as id`

  const [p1] = await tx`select estado from public.solicitudes_pedido where id = ${pedido.id}`
  comprobar(p1.estado === 'PEDIDO', 'el pedido nace enviado, no en borrador')

  const [renglones] = await tx`
    select count(*) as n from public.solicitud_renglones where solicitud_id = ${pedido.id}`
  comprobar(Number(renglones.n) === 2, 'con sus dos renglones')

  await tx`select public.confirmar_pedido(${pedido.id}, 'PRUEBA: compras lo toma')`
  const [p2] = await tx`select estado from public.solicitudes_pedido where id = ${pedido.id}`
  comprobar(p2.estado === 'CONFIRMADA', 'compras lo confirma y queda listo para cotizar')

  // -------------------------------------------------------------------------
  grupo('Compras · el descuento no rebaja el IVA que se debe')

  const [rBomba] = await tx`
    select id from public.solicitud_renglones
     where solicitud_id = ${pedido.id} and articulo_id = ${pieza.id}`
  const [rFlete] = await tx`
    select id from public.solicitud_renglones
     where solicitud_id = ${pedido.id} and articulo_id = ${flete.id}`

  // Oferta con descuento: 600 gravados + 100 exentos, 70 de descuento. Si el
  // descuento se restara entero de la base, el IVA bajaría a 84,80. Repartido
  // en proporción a lo gravado solo le tocan 60, y la base queda en 540.
  const [cot1] = await tx`
    select public.registrar_cotizacion(
      ${pedido.id}, ${prov1.id}, 'USD',
      ${json([
        { solicitud_renglon_id: Number(rBomba.id), cantidad: 20, precio_unitario: 30 },
        { solicitud_renglon_id: Number(rFlete.id), cantidad: 1, precio_unitario: 100, exento_iva: true },
      ])},
      'COT-PRUEBA-1', null, 15::smallint, 5::smallint, 'CONTADO', 16::numeric, 70::numeric) as id`

  const [c1] = await tx`select * from public.cotizaciones where id = ${cot1.id}`
  comprobar(cerca(c1.subtotal, 700), `el subtotal suma los dos renglones: 700 (${c1.subtotal})`)
  comprobar(
    cerca(c1.base_imponible, 540),
    `el descuento se reparte en proporción a lo gravado: base 540, no 530 (${c1.base_imponible})`,
  )
  comprobar(cerca(c1.iva, 86.4), `y el IVA queda en 86,40 (${c1.iva})`)
  comprobar(cerca(c1.total, 716.4), `total 716,40 (${c1.total})`)

  // Oferta sin descuento, que es la que se va a aprobar.
  const [cot2] = await tx`
    select public.registrar_cotizacion(
      ${pedido.id}, ${prov2.id}, 'USD',
      ${json([
        { solicitud_renglon_id: Number(rBomba.id), cantidad: 20, precio_unitario: 30 },
        { solicitud_renglon_id: Number(rFlete.id), cantidad: 1, precio_unitario: 100, exento_iva: true },
      ])},
      'COT-PRUEBA-2', null, 15::smallint, 3::smallint) as id`

  const [c2] = await tx`select * from public.cotizaciones where id = ${cot2.id}`
  comprobar(cerca(c2.iva, 96), `sin descuento el IVA es el 16% de los 600 gravados: 96 (${c2.iva})`)
  comprobar(cerca(c2.total, 796), `y el total 796 (${c2.total})`)
  comprobar(
    cerca(c2.base_imponible, 600),
    'el renglón exento no entra en la base imponible',
  )

  const ajena = await debeFallar(
    tx,
    (sp) => sp`select public.registrar_cotizacion(${pedido.id}, ${prov1.id}, 'USD',
               ${json([{ solicitud_renglon_id: 999999999, cantidad: 1, precio_unitario: 1 }])})`,
  )
  comprobar(
    ajena !== null && /no pertenece a este pedido/i.test(ajena),
    'no se cotiza un renglón de otro pedido',
  )

  // -------------------------------------------------------------------------
  grupo('Compras · la aprobación crea la orden')

  const sinProponer = await debeFallar(
    tx,
    (sp) => sp`select public.aprobar_compra(${pedido.id})`,
  )
  comprobar(
    sinProponer !== null && /todavía no llega a la gerencia/i.test(sinProponer),
    'la gerencia no aprueba lo que compras todavía no le ha propuesto',
  )

  await tx`select public.proponer_cotizacion(${pedido.id}, ${cot2.id},
           'PRUEBA: entrega en tres dias y sin descuento no hay')`

  const [p3] = await tx`select estado from public.solicitudes_pedido where id = ${pedido.id}`
  comprobar(p3.estado === 'POR_CONFIRMAR_GERENTE', 'proponer lo pone en manos del gerente')

  const [orden] = await tx`select public.aprobar_compra(${pedido.id}, 'PRUEBA: aprobada') as id`

  const [o1] = await tx`select * from public.ordenes_compra where id = ${orden.id}`
  comprobar(o1.estado === 'POR_INDICAR_PAGO', 'la orden nace esperando que le digan cómo se paga')
  comprobar(o1.proveedor_id === c2.proveedor_id, 'y sale del proveedor de la cotización elegida')
  comprobar(cerca(o1.total, 796), 'con el total de esa cotización, no el de la otra')

  const [ordenRenglones] = await tx`
    select count(*) as n from public.orden_renglones where orden_id = ${orden.id}`
  comprobar(Number(ordenRenglones.n) === 2, 'los renglones se copian a la orden')

  // -------------------------------------------------------------------------
  grupo('Compras · tesorería paga')

  const deMas = await debeFallar(
    tx,
    (sp) => sp`select public.indicar_pago(${orden.id}, 'TRANSFERENCIA', 'USD', 900,
               ${json({ banco: 'BNC', numero_cuenta: '0191', titular: 'REPUESTOS DOS', documento: 'J-30111222-4' })})`,
  )
  comprobar(
    deMas !== null && /se pagaría más que el total de la orden/i.test(deMas),
    'no se instruye pagar más de lo que la orden vale',
  )

  const [instruccion] = await tx`
    select public.indicar_pago(${orden.id}, 'TRANSFERENCIA', 'USD', 796,
      ${json({ banco: 'BNC', numero_cuenta: '0191', titular: 'REPUESTOS DOS', documento: 'J-30111222-4' })},
      'PRUEBA: pago unico') as id`

  const [o2] = await tx`select estado from public.ordenes_compra where id = ${orden.id}`
  comprobar(o2.estado === 'EN_TESORERIA', 'instruir el pago manda la orden a tesorería')

  const saldoAntes = Number(
    (await tx`select saldo from public.v_saldos_tesoreria where id = ${cuenta.id}`)[0].saldo,
  )

  await tx`select public.registrar_pago(${instruccion.id}, ${cuenta.id}, 'REF-PRUEBA-001')`

  const [o3] = await tx`select estado from public.ordenes_compra where id = ${orden.id}`
  comprobar(o3.estado === 'PAGADA_POR_RECIBIR', 'pagada, y el material todavía sin llegar')

  const saldoDespues = Number(
    (await tx`select saldo from public.v_saldos_tesoreria where id = ${cuenta.id}`)[0].saldo,
  )
  comprobar(
    saldoDespues < saldoAntes,
    `el dinero sale de una cuenta de verdad (${saldoAntes} → ${saldoDespues})`,
  )
  comprobar(
    saldoAntes - saldoDespues >= 796,
    'y sale al menos el monto instruido: en divisas se le suma el IGTF',
  )

  // -------------------------------------------------------------------------
  grupo('Compras · la recepción')

  const enGeneral = async (articulo) =>
    Number(
      (
        await tx`select coalesce(sum(cantidad * signo), 0) as e
                 from public.inventario_movimientos
                 where almacen_id = ${general.id} and articulo_id = ${articulo}`
      )[0].e,
    )

  const [rOrdenBomba] = await tx`
    select id from public.orden_renglones
     where orden_id = ${orden.id} and articulo_id = ${pieza.id}`
  const [rOrdenFlete] = await tx`
    select id from public.orden_renglones
     where orden_id = ${orden.id} and articulo_id = ${flete.id}`

  const masDeLoPedido = await debeFallar(
    tx,
    (sp) => sp`select public.registrar_recepcion(${orden.id}, ${general.id},
               ${json([{ orden_renglon_id: Number(rOrdenBomba.id), cantidad: 25 }])})`,
  )
  comprobar(
    masDeLoPedido !== null && /no se pueden recibir/i.test(masDeLoPedido),
    'no se recibe más de lo que se pidió',
  )

  await tx`select public.registrar_recepcion(${orden.id}, ${general.id},
           ${json([{ orden_renglon_id: Number(rOrdenBomba.id), cantidad: 12 }])},
           'PRUEBA: llegaron doce de veinte')`

  const [o4] = await tx`select estado from public.ordenes_compra where id = ${orden.id}`
  comprobar(o4.estado === 'RECIBIDA_PARCIAL', 'con parte del material la orden queda parcial')
  comprobar((await enGeneral(pieza.id)) === 12, 'y entran doce al almacén')

  const [entrada] = await tx`
    select tipo, costo_usd from public.inventario_movimientos
     where orden_id = ${orden.id} and articulo_id = ${pieza.id} order by id desc limit 1`
  comprobar(entrada.tipo === 'ENTRADA_COMPRA', 'la entrada queda marcada como compra')
  comprobar(
    cerca(entrada.costo_usd, 30, 0.000001),
    `y entra al precio de la orden: 30 (${entrada.costo_usd})`,
  )

  await tx`select public.registrar_recepcion(${orden.id}, ${general.id},
           ${json([
             { orden_renglon_id: Number(rOrdenBomba.id), cantidad: 8 },
             { orden_renglon_id: Number(rOrdenFlete.id), cantidad: 1 },
           ])},
           'PRUEBA: llegaron las ocho que faltaban')`

  const [o5] = await tx`select estado, recibida_en from public.ordenes_compra where id = ${orden.id}`
  comprobar(o5.estado === 'RECIBIDA', 'cuando llega todo, la orden se cierra')
  comprobar(o5.recibida_en !== null, 'y queda la fecha en que se cerró')
  comprobar((await enGeneral(pieza.id)) === 20, 'las veinte piezas están en el almacén')
  comprobar(
    (await enGeneral(flete.id)) === 0,
    'y el flete no dejó ni una existencia fantasma: se paga, no se guarda',
  )

  const [rFleteRecibido] = await tx`
    select cantidad_recibida from public.orden_renglones where id = ${rOrdenFlete.id}`
  comprobar(
    Number(rFleteRecibido.cantidad_recibida) === 1,
    'aunque el renglón de servicio sí queda dado por recibido: por eso cierra la orden',
  )

  // -------------------------------------------------------------------------
  grupo('Compras · la factura del proveedor')

  const futura = await debeFallar(
    tx,
    (sp) => sp`select public.registrar_factura_compra(${prov2.id}, '00099999',
               current_date + 1, 100, 600, 96, 'USD')`,
  )
  comprobar(
    futura !== null && /fecha futura/i.test(futura),
    'no se carga una factura con fecha futura',
  )

  const noCuadra = await debeFallar(
    tx,
    (sp) => sp`select public.registrar_factura_compra(${prov2.id}, '00099998',
               current_date, 100, 600, 96, 'USD', null, null, 'CONTADO', 16, 0, 0, 800)`,
  )
  comprobar(
    noCuadra !== null && /el papel dice .* y lo tecleado suma/i.test(noCuadra),
    'si el total del papel no coincide con lo tecleado, se para ahí',
  )

  const retieneDeMas = await debeFallar(
    tx,
    (sp) => sp`select public.registrar_factura_compra(${prov2.id}, '00099997',
               current_date, 100, 600, 96, 'USD', null, null, 'CONTADO', 16, 150)`,
  )
  comprobar(
    retieneDeMas !== null && /no se puede retener más iva/i.test(retieneDeMas),
    'no se retiene más IVA del que la factura trae',
  )

  // 75% de los 96 de IVA: la retención del contribuyente especial.
  const [factura] = await tx`
    select public.registrar_factura_compra(
      ${prov2.id}, '00012345', current_date, 100, 600, 96, 'USD',
      'CTRL-00012345', ${orden.id}, 'CONTADO', 16, 72, 0, 796,
      'PRUEBA: factura de la orden') as id`

  const [f1] = await tx`select * from public.v_facturas_compra where id = ${factura.id}`
  comprobar(cerca(f1.total, 796), `la factura suma exento + base + IVA: 796 (${f1.total})`)
  comprobar(cerca(f1.retencion_usd, 72), `y retiene 72 de IVA (${f1.retencion_usd})`)
  comprobar(
    cerca(f1.saldo_usd, 724),
    `al proveedor se le deben 724: el total menos lo retenido (${f1.saldo_usd})`,
  )
  comprobar(f1.orden_numero !== null, 'la factura queda enganchada a su orden de compra')

  // Ojo con dónde se busca la deuda: `v_cuentas_por_pagar` lista instrucciones
  // de pago de órdenes, no facturas. Lo que se le debe a un proveedor por una
  // factura vive en la propia factura, en su saldo.
  const [pendientes] = await tx`
    select count(*) as n from public.v_facturas_compra
     where estado = 'REGISTRADA' and saldo_usd > 0 and id = ${factura.id}`
  comprobar(Number(pendientes.n) === 1, 'y queda listada como pendiente de pago')

  await tx`select public.registrar_pago_compra(${factura.id}, ${cuenta.id}, 724,
           'TRANSFERENCIA', null, 'REF-PRUEBA-002')`

  const [f2] = await tx`select estado, saldo_usd from public.v_facturas_compra where id = ${factura.id}`
  comprobar(cerca(f2.saldo_usd, 0), `pagando 724 el saldo queda en cero (${f2.saldo_usd})`)
  comprobar(f2.estado === 'PAGADA', 'y la factura queda pagada')

  const [pendientes2] = await tx`
    select count(*) as n from public.v_facturas_compra
     where estado = 'REGISTRADA' and saldo_usd > 0 and id = ${factura.id}`
  comprobar(Number(pendientes2.n) === 0, 'y deja de figurar entre las pendientes')

  // -------------------------------------------------------------------------
  grupo('Compras · el libro de compras la recoge')

  const [libro] = await tx`
    select count(*) as n from public.v_libro_compras where id = ${factura.id}`
  comprobar(Number(libro.n) === 1, 'la factura entra al libro de compras')

  const [linea] = await tx`select * from public.v_libro_compras where id = ${factura.id}`
  comprobar(cerca(linea.iva_retenido, 72), `con los 72 retenidos (${linea.iva_retenido})`)

  await comoDueno(tx)
}
