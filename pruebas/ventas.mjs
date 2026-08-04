/*
  Notas de crédito.

  Aquí sí se trabaja como administrador: lo que se comprueba es el
  comportamiento del papel, no quién puede emitirlo — de las puertas se encarga
  `permisos.mjs`.

  La cadena se arma entera dentro de la transacción: cliente, precio, material
  en el patio, despacho, factura. Es larga porque una nota de crédito no existe
  sin una factura, y una factura no existe sin algo que se haya despachado.
*/
import { grupo, comprobar, como, comoDueno, debeFallar } from './ayuda.mjs'

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

  const renglones = (items) => tx.json(items)

  await tx`select public.registrar_ajuste(${patio.id}, ${piedra.id}, 500,
            'PRUEBA: existencia inicial para la cadena de venta')`

  const [cli] = await tx`
    select public.guardar_cliente(null, 'J-40555111-9', 'CLIENTE DE PRUEBA NC', null, null, null,
           null, 'VIA CIUDAD BOLIVAR', 'CONTADO', 0, 'USD') as id`
  await tx`select public.guardar_precio_venta(${piedra.id}, 10, 5, 'USD', null)`

  const [nota] = await tx`
    select public.despachar(
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
    select public.despachar(
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
    select public.despachar(
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
}
