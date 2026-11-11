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
}
