/*
  Notas de crédito.

  Aquí sí se trabaja como administrador: lo que se comprueba es el
  comportamiento del papel, no quién puede emitirlo — de las puertas se encarga
  `permisos.mjs`.

  La cadena se arma entera dentro de la transacción: cliente, precio, material
  en el patio, despacho, factura. Es larga porque una nota de crédito no existe
  sin una factura, y una factura no existe sin algo que se haya despachado.
*/
import {
  grupo,
  comprobar,
  como,
  comoDueno,
  debeFallar,
  asegurarTasaBcv,
  usuarioDePrueba,
  rolDePrueba,
} from './ayuda.mjs'

const cerca = (a, b, holgura = 0.02) => Math.abs(Number(a) - Number(b)) < holgura

export default async function pruebaVentas(tx) {
  grupo('Notas de crédito · preparación')

  const [admin] = await tx`
    select ur.usuario_id as id from public.usuarios_roles ur
    join public.perfiles p on p.id = ur.usuario_id
    where ur.rol = 'ADMIN' and p.activo limit 1`

  const [patio] = await tx`select id from public.almacenes where tipo = 'PATIO' order by id limit 1`
  const [piedra] = await tx`
    select id, unidad from public.articulos
     where categoria = 'PRODUCTO' and activo order by id limit 1`

  comprobar(!!admin && !!patio && !!piedra, 'hay administrador, patio y un producto con que trabajar')
  if (!admin || !patio || !piedra) return

  await como(tx, admin.id)
  await asegurarTasaBcv(tx)

  const renglones = (items) => tx.json(items)

  await tx`select public.registrar_ajuste(${patio.id}, ${piedra.id}, 500,
            'PRUEBA: existencia inicial para la cadena de venta')`

  const [cli] = await tx`
    select public.guardar_cliente(null, 'J-40555111-9', 'CLIENTE DE PRUEBA NC', null, null, null,
           null, 'VIA CIUDAD BOLIVAR', 'CONTADO', 0, 'USD') as id`
  await tx`select public.guardar_precio_venta(${piedra.id}, 10, 5, 'USD', null)`

  const [nota] = await tx`
    select private.despachar(
      ${cli.id}, ${patio.id},
      ${renglones([{ articulo_id: Number(piedra.id), cantidad: 20, precio_unitario: 10 }])},
      'USD') as id`

  const [factura] = await tx`select public.facturar_notas(array[${nota.id}]::bigint[]) as id`
  const [f] = await tx`select * from public.v_facturas_venta where id = ${factura.id}`

  comprobar(Number(f.total) === 232, `la factura queda en 232 USD: 200 + 16% (${f.total})`)
  comprobar(Number(f.saldo_usd) > 0, 'y nace debiéndose entera')

  // -------------------------------------------------------------------------
  grupo('Notas de crédito · lo que corrige')

  const antesDeLaFecha = await debeFallar(tx, (sp) =>
    sp`select public.emitir_nota_credito(${factura.id}, 'CORRECCION',
       'Se cobro de mas el flete del viaje',
       ${renglones([{ articulo_id: Number(piedra.id), cantidad: 1, precio_unitario: 10 }])},
       ${'2020-01-01'})`,
  )
  comprobar(
    antesDeLaFecha !== null && /anterior a lo que corrige/i.test(antesDeLaFecha),
    'una corrección no puede ser anterior a la factura que corrige',
  )

  const seExcede = await debeFallar(tx, (sp) =>
    sp`select public.emitir_nota_credito(${factura.id}, 'CORRECCION',
       'Se cobro de mas el flete del viaje',
       ${renglones([{ articulo_id: Number(piedra.id), cantidad: 400, precio_unitario: 10 }])})`,
  )
  comprobar(
    seExcede !== null && /no puede devolver más de lo que se cobró/i.test(seExcede),
    'una nota no puede devolver más de lo que la factura cobró',
  )

  // Corrección de precio: no vuelve material, solo baja lo que se debe.
  const [nc1] = await tx`
    select public.emitir_nota_credito(${factura.id}, 'CORRECCION',
      'Se factura a 10 y lo acordado con el cliente eran 9',
      ${renglones([{ articulo_id: Number(piedra.id), cantidad: 20, precio_unitario: 1 }])}) as id`

  const [n1] = await tx`select * from public.v_notas_credito where id = ${nc1.id}`
  comprobar(Number(n1.total) === 23.2, `la nota queda en 23,20: 20 + su IVA (${n1.total})`)
  comprobar(n1.tasa === f.tasa, 'la nota congela la tasa de la factura, no la de hoy')
  comprobar(n1.numero_control !== f.numero_control, 'gasta su propio número de control')
  comprobar(n1.devolvio_material === false, 'una corrección de precio no mueve una piedra')

  const [f2] = await tx`select * from public.v_facturas_venta where id = ${factura.id}`
  comprobar(
    Number(f2.acreditado_usd) === 23.2,
    `la factura registra 23,20 acreditados (${f2.acreditado_usd})`,
  )
  comprobar(
    Math.abs(Number(f2.saldo_usd) - (Number(f.saldo_usd) - 23.2)) < 0.01,
    'y el saldo baja en esa misma cifra',
  )

  // El techo de crédito del cliente es otra cuenta distinta del saldo de la
  // factura, y vive en su propia función. Si no se entera de la nota, se le
  // devuelve dinero al cliente y su cupo disponible no sube: la siguiente venta
  // le rebota por una deuda que ya no tiene.
  const [c1] = await tx`select deuda_usd from public.v_clientes where id = ${cli.id}`
  comprobar(
    cerca(c1.deuda_usd, Number(f.saldo_usd) - 23.2),
    `el cupo del cliente también descuenta lo acreditado (${c1.deuda_usd})`,
  )

  const noSeAnula = await debeFallar(tx, (sp) =>
    sp`select public.anular_factura(${factura.id}, 'PRUEBA')`,
  )
  comprobar(
    noSeAnula !== null && /nota\(s\) de crédito/i.test(noSeAnula),
    'una factura ya corregida con notas no se anula: o una cosa o la otra',
  )

  // -------------------------------------------------------------------------
  grupo('Notas de crédito · cuando vuelve el material')

  const enPatio = async () =>
    Number(
      (
        await tx`select coalesce(sum(signo * cantidad), 0) as e
                 from public.inventario_movimientos
                 where almacen_id = ${patio.id} and articulo_id = ${piedra.id}`
      )[0].e,
    )

  const antes = await enPatio()

  const [nc2] = await tx`
    select public.emitir_nota_credito(${factura.id}, 'DEVOLUCION',
      'El cliente devolvio 5 toneladas por no ser la granulometria pedida',
      ${renglones([
        {
          articulo_id: Number(piedra.id),
          cantidad: 5,
          precio_unitario: 10,
          almacen_id: Number(patio.id),
        },
      ])}) as id`

  comprobar((await enPatio()) === antes + 5, 'el material devuelto vuelve al patio')

  const [n2] = await tx`select devolvio_material from public.v_notas_credito where id = ${nc2.id}`
  comprobar(n2.devolvio_material === true, 'y la nota queda marcada como que movió material')

  await tx`select public.anular_nota_credito(${nc2.id}, 'PRUEBA DE ANULACION')`
  comprobar((await enPatio()) === antes, 'anular la nota saca ese material otra vez')

  const [n2b] = await tx`select estado from public.notas_credito where id = ${nc2.id}`
  comprobar(n2b.estado === 'ANULADA', 'la nota queda anulada, no borrada: su control se gastó')

  const [f3] = await tx`select acreditado_usd from public.v_facturas_venta where id = ${factura.id}`
  comprobar(
    Number(f3.acreditado_usd) === 23.2,
    'y la factura deja de contar lo que esa nota le había restado',
  )

  // Si el material ya volvió a salir, deshacer la devolución dejaría el patio
  // en negativo y por eso se rechaza.
  const [nc3] = await tx`
    select public.emitir_nota_credito(${factura.id}, 'DEVOLUCION',
      'Segunda devolucion para probar que no se puede deshacer si ya salio',
      ${renglones([
        {
          articulo_id: Number(piedra.id),
          cantidad: 5,
          precio_unitario: 10,
          almacen_id: Number(patio.id),
        },
      ])}) as id`

  // El material devuelto se vuelve a vender, que es exactamente el caso en el
  // que anular la devolución dejaría el patio en negativo. Se vacía vendiendo y
  // no con un ajuste a cero porque un ajuste a cero deja el costo promedio del
  // patio hecho un nudo y lo que se prueba aquí no es eso.
  const disponible = await enPatio()
  await tx`
    select private.despachar(
      ${cli.id}, ${patio.id},
      ${renglones([
        { articulo_id: Number(piedra.id), cantidad: disponible - 2, precio_unitario: 10 },
      ])},
      'USD')`

  const yaSalio = await debeFallar(tx, (sp) =>
    sp`select public.anular_nota_credito(${nc3.id}, 'PRUEBA')`,
  )
  comprobar(
    yaSalio !== null && /no se puede deshacer la devolución/i.test(yaSalio),
    'no se deshace una devolución cuyo material ya salió otra vez',
  )

  // -------------------------------------------------------------------------
  grupo('Notas de crédito · sobre lo que ya no existe')

  const [nota2] = await tx`
    select private.despachar(
      ${cli.id}, ${patio.id},
      ${renglones([{ articulo_id: Number(piedra.id), cantidad: 1, precio_unitario: 10 }])},
      'USD') as id`
  const [factura2] = await tx`select public.facturar_notas(array[${nota2.id}]::bigint[]) as id`
  await tx`select public.anular_factura(${factura2.id}, 'PRUEBA DE ANULACION')`

  const sobreAnulada = await debeFallar(tx, (sp) =>
    sp`select public.emitir_nota_credito(${factura2.id}, 'CORRECCION',
       'No deberia poder corregirse una factura sin efecto',
       ${renglones([{ articulo_id: Number(piedra.id), cantidad: 1, precio_unitario: 1 }])})`,
  )
  comprobar(
    sobreAnulada !== null && /no hay nada que restarle/i.test(sobreAnulada),
    'una factura anulada no se corrige: no hay nada que restarle',
  )

  await comoDueno(tx)

  /*
    DESPACHAR UNA COTIZACIÓN (12/11/2026): el botón deja el despacho pedido y
    Facturación lo completa. Se prueba con usuarios que NO son ADMIN —el ADMIN
    pasa por encima de todo y no diría si la puerta cierra—. Lo que se
    rompería en silencio: que quien no factura pida despachos, que se pidan
    dos a la vez de la misma cotización, o que el pedido no salga de «por
    completar» al completarse.
  */
  grupo('Despachar una cotización · queda por completar')

  const vendedor = await usuarioDePrueba(tx, { usuario: 'prueba_desp_vende', nombre: 'Quien vende y factura' })
  const soloVentas = await usuarioDePrueba(tx, { usuario: 'prueba_desp_solo', nombre: 'Quien solo cotiza' })
  await rolDePrueba(tx, 'PRUEBA_DESP_FACTURA', { PANEL: 'LECTURA', VENTAS: 'ESCRITURA', FACTURACION: 'ESCRITURA' })
  await rolDePrueba(tx, 'PRUEBA_DESP_COTIZA', { PANEL: 'LECTURA', VENTAS: 'ESCRITURA' })
  await tx`insert into public.usuarios_roles (usuario_id, rol) values (${vendedor}, 'PRUEBA_DESP_FACTURA')`
  await tx`insert into public.usuarios_roles (usuario_id, rol) values (${soloVentas}, 'PRUEBA_DESP_COTIZA')`

  await como(tx, vendedor)
  await tx`select public.crear_cotizacion_venta(${cli.id},
            ${renglones([{ articulo_id: Number(piedra.id), cantidad: 5, precio_unitario: 10 }])},
            'USD', 15, null, 0, 7)`
  await comoDueno(tx)
  const [cot] = await tx`select id, numero, estado from public.cotizaciones_venta order by id desc limit 1`
  comprobar(cot?.estado === 'ENVIADA', `la cotización nace enviada (${cot?.numero})`)

  await como(tx, soloVentas)
  const sinFacturar = await debeFallar(tx, (sp) => sp`select public.pedir_despacho_de_cotizacion(${cot.id})`)
  comprobar(/facturaci/i.test(sinFacturar ?? ''), 'quien no factura no pide el despacho')

  await comoDueno(tx)
  await como(tx, vendedor)
  await tx`select public.pedir_despacho_de_cotizacion(${cot.id})`
  const [v1] = await tx`select despacho_por_completar, despacho_por_aprobar from public.v_cotizaciones_venta where id = ${cot.id}`
  comprobar(v1.despacho_por_completar === true, 'pedido sin placa ni chofer: queda por completar')
  const dos = await debeFallar(tx, (sp) => sp`select public.pedir_despacho_de_cotizacion(${cot.id})`)
  comprobar(/ya está pedido/i.test(dos ?? ''), 'no se pide dos veces')

  // Completar es el «Pedir despacho» de siempre, enlazado a la cotización.
  const [sd] = await tx`
    select public.solicitar_despacho(${cli.id}, ${patio.id},
      ${renglones([{ articulo_id: Number(piedra.id), cantidad: 5, precio_unitario: 10 }])},
      'AB123CD', 'CHOFER DE PRUEBA', 'V-12345678', 'CAMION DE PRUEBA', 'USD', ${cot.id}) as numero`
  const [v2] = await tx`select despacho_por_completar, despacho_por_aprobar from public.v_cotizaciones_venta where id = ${cot.id}`
  comprobar(
    v2.despacho_por_completar === false && v2.despacho_por_aprobar === sd.numero,
    `al completarlo sale de «por completar» y espera aprobación (${sd.numero})`,
  )
  const otroSd = await debeFallar(tx, (sp) =>
    sp`select public.solicitar_despacho(${cli.id}, ${patio.id},
      ${renglones([{ articulo_id: Number(piedra.id), cantidad: 5, precio_unitario: 10 }])},
      'AB123CD', 'CHOFER DE PRUEBA', 'V-12345678', 'CAMION DE PRUEBA', 'USD', ${cot.id})`)
  comprobar(/esperando aprobación/i.test(otroSd ?? ''), 'no hay dos despachos esperando aprobación de la misma cotización')

  const corto = await debeFallar(tx, (sp) => sp`select public.cancelar_pedido_de_despacho(${cot.id}, 'no')`)
  comprobar(/por qué/i.test(corto ?? ''), 'cancelar el pedido pide un motivo')

  await comoDueno(tx)
}
