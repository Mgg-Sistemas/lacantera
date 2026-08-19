/*
  Los libros del IVA.

  Lo que se comprueba aquí no es que las vistas devuelvan filas, es que las
  filas digan la verdad: que lo exento se despeje bien, que una nota de crédito
  reste, que una factura anulada aparezca en cero sin dejar hueco en la serie de
  control, y que la conversión a bolívares use la tasa del documento.
*/
import { grupo, comprobar, como, comoDueno, asegurarTasaBcv } from './ayuda.mjs'

const cerca = (a, b, holgura = 0.02) => Math.abs(Number(a) - Number(b)) < holgura

export default async function pruebaLibros(tx) {
  grupo('Libros · preparación')

  const [admin] = await tx`
    select ur.usuario_id as id from public.usuarios_roles ur
    join public.perfiles p on p.id = ur.usuario_id
    where ur.rol = 'ADMIN' and p.activo limit 1`
  const [patio] = await tx`select id from public.almacenes where tipo = 'PATIO' order by id limit 1`
  const [piedra] = await tx`
    select id from public.articulos where categoria = 'PRODUCTO' and activo order by id limit 1`
  let [prov] = await tx`select id from public.proveedores order by id limit 1`

  comprobar(!!admin && !!patio && !!piedra, 'hay con qué armar la cadena')
  if (!admin || !patio || !piedra) return

  await como(tx, admin.id)
  await asegurarTasaBcv(tx)

  // En producción siempre hay proveedores cargados. En una base recién
  // levantada no hay ninguno, y sin uno no hay factura de compra que el libro
  // pueda recoger. Se crea aquí y muere con la transacción, como todo.
  if (!prov) {
    const creado = await tx`
      select public.guardar_proveedor(null, 'J-30999888-7', 'PROVEEDOR DE PRUEBA LIBROS') as id`
    prov = creado[0]
  }

  const renglones = (items) => tx.json(items)

  await tx`select public.registrar_ajuste(${patio.id}, ${piedra.id}, 500, 'PRUEBA: libros')`

  const [cli] = await tx`
    select public.guardar_cliente(null, 'J-40333222-1', 'CLIENTE DE PRUEBA LIBROS', null, null,
           null, null, 'VIA UPATA', 'CONTADO', 0, 'USD') as id`
  await tx`select public.guardar_precio_venta(${piedra.id}, 10, 5, 'USD', null)`

  const [nota] = await tx`
    select public.despachar(
      ${cli.id}, ${patio.id},
      ${renglones([{ articulo_id: Number(piedra.id), cantidad: 30, precio_unitario: 10 }])},
      'USD') as id`
  const [factura] = await tx`select public.facturar_notas(array[${nota.id}]::bigint[]) as id`
  const [f] = await tx`select * from public.facturas_venta where id = ${factura.id}`

  // -------------------------------------------------------------------------
  grupo('Libro de ventas · lo que dice cada fila')

  const linea = async (clave) =>
    (await tx`select * from public.v_libro_ventas where clave = ${clave}`)[0]

  const lf = await linea(`FACTURA-${factura.id}`)

  comprobar(lf !== undefined, 'la factura entra al libro de ventas')
  comprobar(cerca(lf.debito_fiscal, f.iva), `el débito fiscal es el IVA de la factura (${lf.debito_fiscal})`)
  comprobar(cerca(lf.base_imponible, f.base_imponible), 'la base imponible es la de la factura')
  comprobar(
    cerca(lf.ventas_exentas, 0),
    `sin renglones exentos, lo exento sale en cero (${lf.ventas_exentas})`,
  )
  comprobar(
    cerca(Number(lf.ventas_exentas) + Number(lf.base_imponible) + Number(lf.debito_fiscal), f.total),
    'exento + base + débito cuadra con el total: es de donde se despeja lo exento',
  )
  comprobar(
    cerca(lf.total_ventas_bs, Number(f.total) * Number(f.tasa), 1),
    'la cifra en bolívares usa la tasa que congeló el documento',
  )
  comprobar(lf.anulada === false && lf.afecta_a === null, 'una factura no corrige a nadie')

  // -------------------------------------------------------------------------
  grupo('Libro de ventas · la nota de crédito resta')

  const [nc] = await tx`
    select public.emitir_nota_credito(${factura.id}, 'DESCUENTO',
      'Rebaja acordada despues de facturar el viaje',
      ${renglones([{ articulo_id: Number(piedra.id), cantidad: 30, precio_unitario: 2 }])}) as id`

  const ln = await linea(`NOTA-${nc.id}`)

  comprobar(ln !== undefined, 'la nota de crédito entra al mismo libro, no a uno aparte')
  comprobar(Number(ln.total_ventas) < 0, `y entra en negativo (${ln.total_ventas})`)
  comprobar(Number(ln.debito_fiscal) < 0, 'su IVA también resta')
  comprobar(ln.afecta_a === f.numero_control, 'y dice a qué número de control corrige')
  comprobar(Number(ln.total_ventas_bs) < 0, 'en bolívares también resta')

  const [suma] = await tx`
    select coalesce(sum(total_ventas), 0) as total,
           coalesce(sum(debito_fiscal), 0) as debito
      from public.v_libro_ventas
     where numero in (${f.numero}, (select numero from public.notas_credito where id = ${nc.id}))`

  const [ncf] = await tx`select total, iva from public.notas_credito where id = ${nc.id}`
  comprobar(
    cerca(suma.total, Number(f.total) - Number(ncf.total)),
    `el período suma la factura menos la nota (${suma.total})`,
  )
  comprobar(cerca(suma.debito, Number(f.iva) - Number(ncf.iva)), 'y el débito fiscal, igual')

  // -------------------------------------------------------------------------
  grupo('Libro de ventas · la anulada no deja hueco')

  const [nota2] = await tx`
    select public.despachar(
      ${cli.id}, ${patio.id},
      ${renglones([{ articulo_id: Number(piedra.id), cantidad: 4, precio_unitario: 10 }])},
      'USD') as id`
  const [factura2] = await tx`select public.facturar_notas(array[${nota2.id}]::bigint[]) as id`
  await tx`select public.anular_factura(${factura2.id}, 'PRUEBA DE ANULACION')`

  const la = await linea(`FACTURA-${factura2.id}`)

  comprobar(la !== undefined, 'la factura anulada sigue apareciendo en el libro')
  comprobar(la.anulada === true, 'marcada como anulada')
  comprobar(
    Number(la.total_ventas) === 0 &&
      Number(la.debito_fiscal) === 0 &&
      Number(la.base_imponible) === 0,
    'y en cero: aparece para explicar el número de control, no para declarar nada',
  )
  comprobar(
    la.numero_control !== null && la.numero_control !== '',
    'con su número de control a la vista, que es justo lo que evita el hueco en la serie',
  )

  // -------------------------------------------------------------------------
  grupo('Libro de compras')

  if (!prov) {
    comprobar(false, 'hace falta al menos un proveedor cargado para probar el libro de compras')
  } else {
    const [fc] = await tx`
      select public.registrar_factura_compra(${prov.id}, 'PRUEBA-0001', current_date,
             100, 500, 80, 'VES', null, null, 'CONTADO', 16, 0, 0, 680) as id`

    const [lc] = await tx`select * from public.v_libro_compras where id = ${fc.id}`

    comprobar(lc !== undefined, 'la factura de proveedor entra al libro de compras')
    comprobar(cerca(lc.credito_fiscal, 80), `el crédito fiscal son los 80 del papel (${lc.credito_fiscal})`)
    comprobar(cerca(lc.compras_exentas, 100), 'lo exento se copia tal cual, no se despeja')
    comprobar(cerca(lc.total_compras, 680), 'y el total es el que se cuadró al registrarla')
    comprobar(
      cerca(lc.credito_fiscal_bs, Number(lc.credito_fiscal) * Number(lc.tasa), 1),
      'la conversión a bolívares usa la tasa de la factura',
    )

    await tx`select public.anular_factura_compra(${fc.id}, 'PRUEBA DE ANULACION')`
    const restantes = await tx`select 1 from public.v_libro_compras where id = ${fc.id}`
    comprobar(
      restantes.length === 0,
      'una factura de compra anulada sale del libro: su número de control es del proveedor, no nuestro',
    )
  }

  await comoDueno(tx)
}
