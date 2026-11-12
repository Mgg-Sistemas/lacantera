/*
  Gastos › Reportes PDF: el informe de gastos y el comparativo con las ventas.

  Lo que se rompería en silencio: que quien no entra a Gastos lea los gastos
  por aquí, que quien ve Gastos pero no Ventas vea lo que se vendió, que las
  órdenes de Compras salgan sin permiso de Compras, que una nota por cobrar,
  pendiente o anulada cuente como venta, o que un documento salga sin su
  equivalente y el total quede corto sin avisar.
*/
import { grupo, comprobar, como, comoDueno, debeFallar, usuarioDePrueba, rolDePrueba } from './ayuda.mjs'

export default async function pruebaGastos(tx) {
  grupo('Reportes de gastos · quién ve qué')

  // Nombres inventados: el repositorio es público y aquí no entra nadie real.
  const ajeno = await usuarioDePrueba(tx, { usuario: 'prueba_gastos_ajeno', nombre: 'Quien no entra a gastos' })
  const soloGastos = await usuarioDePrueba(tx, { usuario: 'prueba_gastos_solo', nombre: 'Quien solo ve gastos' })
  const conVentas = await usuarioDePrueba(tx, { usuario: 'prueba_gastos_ventas', nombre: 'Quien ve gastos y ventas' })

  await rolDePrueba(tx, 'PRUEBA_GASTOS_PANEL', { PANEL: 'LECTURA' })
  await rolDePrueba(tx, 'PRUEBA_GASTOS_SOLO', { PANEL: 'LECTURA', GASTOS: 'LECTURA' })
  await rolDePrueba(tx, 'PRUEBA_GASTOS_VENTAS', { PANEL: 'LECTURA', GASTOS: 'LECTURA', VENTAS: 'LECTURA' })
  await tx`insert into public.usuarios_roles (usuario_id, rol) values (${ajeno}, 'PRUEBA_GASTOS_PANEL')`
  await tx`insert into public.usuarios_roles (usuario_id, rol) values (${soloGastos}, 'PRUEBA_GASTOS_SOLO')`
  await tx`insert into public.usuarios_roles (usuario_id, rol) values (${conVentas}, 'PRUEBA_GASTOS_VENTAS')`

  const desde = '2026-01-01'
  const hasta = '2026-12-31'

  await como(tx, ajeno)
  const sinGastos = await debeFallar(tx, (sp) => sp`select * from public.informe_gastos_y_ventas(${desde}, ${hasta}, false, false)`)
  comprobar(/gastos/i.test(sinGastos ?? ''), 'quien no entra a Gastos no lee el informe')

  await comoDueno(tx)
  await como(tx, soloGastos)
  const filas = await tx`select tipo from public.informe_gastos_y_ventas(${desde}, ${hasta}, false, false)`
  comprobar(
    filas.every((f) => f.tipo === 'GASTO' || f.tipo === 'GASTO_ANULADO'),
    `con solo Gastos, el informe trae únicamente gastos (${filas.length} filas)`,
  )
  const sinVentas = await debeFallar(tx, (sp) => sp`select * from public.informe_gastos_y_ventas(${desde}, ${hasta}, true, false)`)
  comprobar(/ventas/i.test(sinVentas ?? ''), 'sin Ventas ni Facturación no se compara con las ventas')
  await comoDueno(tx)
  await como(tx, soloGastos)
  const sinCompras = await debeFallar(tx, (sp) => sp`select * from public.informe_gastos_y_ventas(${desde}, ${hasta}, false, true)`)
  comprobar(/compras/i.test(sinCompras ?? ''), 'sin Compras no se suman las órdenes de Compras')

  await comoDueno(tx)
  await como(tx, conVentas)
  const fechasAlReves = await debeFallar(tx, (sp) => sp`select * from public.informe_gastos_y_ventas(${hasta}, ${desde}, true, false)`)
  comprobar(/anterior/i.test(fechasAlReves ?? ''), 'las fechas al revés se rechazan con un mensaje claro')

  grupo('Reportes de gastos · qué cuenta como venta')

  await comoDueno(tx)
  await como(tx, conVentas)
  const todo = await tx`select tipo, id, total_bs, total_usd from public.informe_gastos_y_ventas(${desde}, ${hasta}, true, false)`
  const ventas = todo.filter((f) => f.tipo === 'VENTA' || f.tipo === 'POR_COBRAR')
  comprobar(ventas.length > 0, `quien ve Ventas recibe las notas (${ventas.length})`)
  comprobar(
    todo.every((f) => f.total_bs != null && f.total_usd != null),
    'ningún documento sale sin su equivalente en Bs y en $',
  )

  await comoDueno(tx)
  const ids = ventas.map((v) => Number(v.id))
  const [{ malas }] = await tx`
    select count(*)::int as malas from public.notas_entrega
     where id = any(${ids}) and estado <> 'DESPACHADA'`
  comprobar(malas === 0, 'solo salen notas despachadas: ni pendientes ni anuladas')

  const porCobrarIds = ventas.filter((v) => v.tipo === 'POR_COBRAR').map((v) => Number(v.id))
  const ventaIds = ventas.filter((v) => v.tipo === 'VENTA').map((v) => Number(v.id))
  const [{ cobrables }] = await tx`
    select count(*)::int as cobrables from public.notas_entrega
     where id = any(${ventaIds}) and pendiente_por_cobrar and cobrada_en is null`
  comprobar(cobrables === 0, 'una nota que sigue por cobrar nunca cuenta como venta')
  const [{ yaCobradas }] = await tx`
    select count(*)::int as "yaCobradas" from public.notas_entrega
     where id = any(${porCobrarIds}) and (not pendiente_por_cobrar or cobrada_en is not null)`
  comprobar(yaCobradas === 0, 'y lo que figura por cobrar de verdad sigue por cobrar')

  /*
    La nómina (11/11/2026): una línea por período aprobado o pagado, por lo
    asignado más los aportes, fechada el día en que termina. Sin permiso de
    Nómina no sale; sin pedirla, tampoco.
  */
  grupo('Reportes de gastos · la nómina')

  const conNomina = await usuarioDePrueba(tx, { usuario: 'prueba_gastos_nomina', nombre: 'Quien ve gastos y nómina' })
  await rolDePrueba(tx, 'PRUEBA_GASTOS_NOMINA', { PANEL: 'LECTURA', GASTOS: 'LECTURA', NOMINA: 'LECTURA' })
  await tx`insert into public.usuarios_roles (usuario_id, rol) values (${conNomina}, 'PRUEBA_GASTOS_NOMINA')`

  await comoDueno(tx)
  await como(tx, soloGastos)
  const sinNomina = await debeFallar(
    tx,
    (sp) => sp`select * from public.informe_gastos_y_ventas(${desde}, ${hasta}, false, false, true)`,
  )
  comprobar(/n[oó]mina/i.test(sinNomina ?? ''), 'sin Nómina no se suma la nómina')

  await comoDueno(tx)
  await como(tx, conNomina)
  const sinPedirla = await tx`select tipo from public.informe_gastos_y_ventas(${desde}, ${hasta}, false, false)`
  comprobar(!sinPedirla.some((f) => f.tipo === 'NOMINA'), 'si no se pide, la nómina no sale')
  const nominas = await tx`
    select id, fecha, monto, total_bs, total_usd, categoria
      from public.informe_gastos_y_ventas(${desde}, ${hasta}, false, false, true)
     where tipo = 'NOMINA'`
  comprobar(nominas.length > 0, `quien ve Nómina recibe las nóminas del año (${nominas.length})`)
  comprobar(
    nominas.every((f) => f.categoria === 'NOMINA' && f.total_bs != null && f.total_usd != null),
    'cada nómina sale en su categoría y con su equivalente en Bs y en $',
  )

  await comoDueno(tx)
  const [{ malasNomina }] = await tx`
    select count(*)::int as "malasNomina"
      from unnest(${nominas.map((f) => Number(f.id))}::bigint[]) as x(id)
      join public.nomina_periodos p on p.id = x.id
     where p.estado not in ('APROBADA', 'PAGADA')`
  comprobar(malasNomina === 0, 'solo salen nóminas aprobadas o pagadas: ni borradores ni anuladas')
  const [{ descuadres }] = await tx`
    select count(*)::int as descuadres
      from unnest(${nominas.map((f) => Number(f.id))}::bigint[], ${nominas.map((f) => String(f.monto))}::numeric[],
                  ${nominas.map((f) => String(f.fecha instanceof Date ? f.fecha.toISOString().slice(0, 10) : f.fecha))}::date[])
           as x(id, monto, fecha)
      join public.nomina_periodos p on p.id = x.id
     where x.fecha <> p.hasta
        or x.monto <> (select coalesce(sum(coalesce(r.total_asignaciones, 0) + coalesce(r.total_aportes, 0)), 0)
                         from public.nomina_recibos r where r.periodo_id = p.id)`
  comprobar(descuadres === 0, 'cada nómina vale lo asignado más los aportes y cae el día en que termina su período')

  /*
    PENDIENTE POR PAGAR (12/11/2026). Lo que se rompería en silencio: que un
    ADMIN que no está en la lista escriba (el ADMIN pasa por encima de la
    matriz, y aquí justamente no debe), que quien no entra a Gastos vea las
    deudas, que un abono en la otra moneda descuente mal, que se pague de más,
    o que se corrija o anule una deuda con abonos encima.
  */
  grupo('Pendiente por pagar · quién escribe y quién solo mira')

  await comoDueno(tx)
  const adminFuera = await usuarioDePrueba(tx, {
    usuario: 'prueba_cxp_admin',
    nombre: 'Administrador que no lleva las cuentas',
    roles: ['ADMIN'],
  })
  const llevador = await usuarioDePrueba(tx, {
    usuario: 'prueba_cxp_lleva',
    nombre: 'Quien lleva las cuentas',
    roles: ['PRUEBA_GASTOS_SOLO'],
  })
  await tx`insert into public.gastos_por_pagar_controladores (usuario_id) values (${llevador})`
  const hoy = (await tx`select (now() at time zone 'America/Caracas')::date::text as d`)[0].d
  const tasaHoy = Number((await tx`select tasa from public.obtener_tasa('USD', 'VES', ${hoy}::date, 'BCV')`)[0]?.tasa ?? 0)

  await como(tx, adminFuera)
  const [{ controla }] = await tx`select public.controlo_cuentas_por_pagar() as controla`
  comprobar(controla === false, 'un ADMIN fuera de la lista no lleva las cuentas')
  const adminNo = await debeFallar(tx, (sp) =>
    sp`select public.registrar_cuenta_por_pagar(${hoy}::date, 'PRUEBA', 'PRUEBA DE ADMIN', 'USD', 10)`)
  comprobar(/solo las registran/i.test(adminNo ?? ''), 'un ADMIN fuera de la lista no registra, con un mensaje claro')
  const directo = await debeFallar(tx, (sp) =>
    sp`insert into public.gastos_por_pagar (numero, fecha, proveedor, descripcion, moneda, monto, registrado_por)
       values ('X', ${hoy}::date, 'X', 'XXX', 'USD', 1, ${adminFuera})`)
  comprobar(directo !== null, 'nadie escribe directo en la tabla, sin pasar por las funciones')

  await comoDueno(tx)
  await como(tx, llevador)
  const [{ numero }] = await tx`
    select public.registrar_cuenta_por_pagar(${hoy}::date, 'prueba proveedor', 'prueba de acarreo', 'USD', 960) as numero`
  comprobar(/^CXP-\d{4}-\d{4}$/.test(numero), `quien lleva las cuentas registra, aunque su rol no sea ADMIN (${numero})`)
  const [cuenta] = await tx`select id, proveedor, estado from public.v_gastos_por_pagar where numero = ${numero}`
  comprobar(cuenta?.estado === 'PENDIENTE' && cuenta.proveedor === 'PRUEBA PROVEEDOR', 'nace pendiente, en mayúsculas')

  await comoDueno(tx)
  await como(tx, adminFuera)
  const [{ ve }] = await tx`select count(*)::int as ve from public.v_gastos_por_pagar where numero = ${numero}`
  comprobar(ve === 1, 'el ADMIN fuera de la lista sí la ve')
  const abonoAjeno = await debeFallar(tx, (sp) =>
    sp`select public.abonar_cuenta_por_pagar(${cuenta.id}, ${hoy}::date, 'USD', 1)`)
  comprobar(abonoAjeno !== null, 'el ADMIN fuera de la lista no abona')

  await comoDueno(tx)
  await como(tx, ajeno)
  const [{ veAjeno }] = await tx`select count(*)::int as "veAjeno" from public.v_gastos_por_pagar`
  comprobar(veAjeno === 0, 'quien no entra a Gastos no ve ninguna cuenta por pagar')
  const ajenoLista = await debeFallar(tx, (sp) => sp`select public.guardar_controlador_por_pagar(${ajeno}, true)`)
  comprobar(/administrador/i.test(ajenoLista ?? ''), 'quien no es ADMIN no se agrega a la lista')

  grupo('Pendiente por pagar · abonos y saldo')

  await comoDueno(tx)
  await como(tx, llevador)
  if (tasaHoy > 0) {
    // 100 $ de la deuda pagados en Bs a la tasa de hoy descuentan exactamente 100 $.
    const bs = Math.round(100 * tasaHoy * 100) / 100
    await tx`select public.abonar_cuenta_por_pagar(${cuenta.id}, ${hoy}::date, 'VES', ${bs})`
    const [a] = await tx`select estado, abonado from public.v_gastos_por_pagar where id = ${cuenta.id}`
    comprobar(
      a.estado === 'ABONADA' && Number(a.abonado) === 100,
      `un abono en Bs descuenta su equivalente a la tasa del día (${a.abonado} $)`,
    )
    const corregir = await debeFallar(tx, (sp) =>
      sp`select public.editar_cuenta_por_pagar(${cuenta.id}, ${hoy}::date, 'X', 'XXX', 'USD', 10)`)
    comprobar(/abonos/i.test(corregir ?? ''), 'con abonos no se corrige')
    const anular = await debeFallar(tx, (sp) => sp`select public.anular_cuenta_por_pagar(${cuenta.id}, 'motivo de prueba')`)
    comprobar(/abonos/i.test(anular ?? ''), 'con abonos vigentes no se anula la deuda')
  } else {
    comprobar(true, 'sin tasa de hoy: se salta la conversión')
  }
  const demas = await debeFallar(tx, (sp) =>
    sp`select public.abonar_cuenta_por_pagar(${cuenta.id}, ${hoy}::date, 'USD', 5000)`)
  comprobar(/pasa de lo que se debe/i.test(demas ?? ''), 'no se paga de más: dice cuánto queda')

  const [{ saldo }] = await tx`select saldo from public.v_gastos_por_pagar where id = ${cuenta.id}`
  await tx`select public.abonar_cuenta_por_pagar(${cuenta.id}, ${hoy}::date, 'USD', ${saldo})`
  const [pagada] = await tx`select estado, saldo from public.v_gastos_por_pagar where id = ${cuenta.id}`
  comprobar(pagada.estado === 'PAGADA' && Number(pagada.saldo) === 0, 'abonando el resto queda pagada')
  const yaPagada = await debeFallar(tx, (sp) =>
    sp`select public.abonar_cuenta_por_pagar(${cuenta.id}, ${hoy}::date, 'USD', 1)`)
  comprobar(/pagada/i.test(yaPagada ?? ''), 'a una cuenta pagada no se le abona más')

  const [{ ultimo }] = await tx`
    select max(id) as ultimo from public.gastos_por_pagar_abonos where cuenta_id = ${cuenta.id} and anulado_en is null`
  await tx`select public.anular_abono_por_pagar(${ultimo}, 'motivo de prueba')`
  const [v] = await tx`select estado from public.v_gastos_por_pagar where id = ${cuenta.id}`
  comprobar(v.estado !== 'PAGADA', `al anular un abono vuelve a deberse (${v.estado})`)

  const manana = await debeFallar(tx, (sp) =>
    sp`select public.registrar_cuenta_por_pagar(${hoy}::date + 1, 'X', 'XXX', 'USD', 1)`)
  comprobar(/mañana/i.test(manana ?? ''), 'no se registra una deuda de mañana')
  const euros = await debeFallar(tx, (sp) =>
    sp`select public.registrar_cuenta_por_pagar(${hoy}::date, 'X', 'XXX', 'EUR', 1)`)
  comprobar(/bolívares o dólares/i.test(euros ?? ''), 'solo bolívares o dólares')
  await comoDueno(tx)
}
