/*
  Combustible como Golden Touch (fases 2a y 2b, 10/11/2026).

  Todo con tanques NUEVOS, creados aquí: los de verdad (CMB-TAN, CMB-INI) no se
  tocan, y la prueba no depende de cuánto gasoil haya hoy en el patio. El
  surtido va a un destino escrito («PRUEBA GENERADOR») y no a una máquina de la
  flota, para que el tope de tres vales al día y el horómetro de las máquinas
  de verdad no entren en la cuenta.

  Las reglas se prueban como administrador (la aritmética del libro); la puerta
  del traslado desde un almacén que no es tanque, con un usuario que solo tiene
  la casilla COMBUSTIBLE.TRASLADO.

  Como todo lo de esta carpeta, corre dentro de una transacción que se deshace.
*/
import { grupo, comprobar, como, comoDueno, debeFallar, usuarioDePrueba, rolDePrueba } from './ayuda.mjs'

const cerca = (a, b, holgura = 0.0001) => Math.abs(Number(a) - Number(b)) < holgura

export default async function pruebaCombustible(tx) {
  grupo('Combustible · preparación')

  const [admin] = await tx`
    select ur.usuario_id as id from public.usuarios_roles ur
    join public.perfiles p on p.id = ur.usuario_id
    where ur.rol = 'ADMIN' and p.activo limit 1`
  const [gasoil] = await tx`
    select id from public.articulos where categoria = 'COMBUSTIBLE' and activo order by id limit 1`
  const [general] = await tx`select id from public.almacenes where codigo = 'ALM-GEN'`

  comprobar(!!admin && !!gasoil, 'hay administrador y un combustible en el catálogo')
  if (!admin || !gasoil) return

  await como(tx, admin.id)

  const tanque = async (nombre, extra = {}) =>
    (
      await tx`
        select public.combustible_guardar_tanque(
          p_nombre => ${nombre}, p_capacidad => ${extra.capacidad ?? 50000},
          p_tipo_geometria => 'rectangular', p_largo_m => 2, p_ancho_m => 1, p_alto_m => 1,
          p_es_bidon => ${extra.bidon ?? false}, p_margen_merma_pct => 10) as id`
    )[0].id

  const a = await tanque('PRUEBA TANQUE A')
  const b = await tanque('PRUEBA TANQUE B')
  const bidon = await tanque('PRUEBA BIDON', { bidon: true })
  comprobar(!!a && !!b && !!bidon, 'se crean dos tanques y un bidón, cada uno con su almacén')

  const saldo = async (almacen) =>
    Number(
      (
        await tx`select coalesce(sum(cantidad * signo), 0) as s from public.inventario_movimientos
                 where almacen_id = ${almacen} and articulo_id = ${gasoil.id}`
      )[0].s,
    )
  const libro = async (almacen) =>
    (
      await tx`select count(*)::int as n, coalesce(sum(signo * litros), 0) as s
               from public.v_combustible_libro where tanque_id = ${almacen}`
    )[0]

  // -------------------------------------------------------------------------
  grupo('Combustible · entrada y merma de recepción')

  const sinCosto = await debeFallar(tx, (sp) =>
    sp`select public.combustible_registrar_entrada(${a}, 100, 0, true,
         'Prueba sin costo que no debería entrar aquí', p_articulo_id => ${gasoil.id})`,
  )
  comprobar(/sin costo|no cost/i.test(sinCosto ?? ''), 'a un tanque con costo no entra combustible sin costo')

  const fuera = await debeFallar(tx, (sp) =>
    sp`select public.combustible_registrar_entrada(${a}, 1000, 2, false, 'Compra de prueba',
         p_recibidos => 800, p_articulo_id => ${gasoil.id})`,
  )
  comprobar(/indicá el motivo/i.test(fuera ?? ''), 'una merma del 20 % (margen 10 %) sin motivo no se guarda')
  comprobar((await saldo(a)) === 0, '…y no quedó ni la entrada: se revisa antes de escribir')

  const [ent] = await tx`
    select public.combustible_registrar_entrada(${a}, 1000, 2, false, 'Compra de prueba',
             p_recibidos => 950, p_autorizado => 'PRUEBA AUTORIZA', p_articulo_id => ${gasoil.id}) as r`
  comprobar(!!ent.r.merma_movimiento_id, 'una entrada de 1.000 L que llegó en 950 deja su merma ligada')
  comprobar((await saldo(a)) === 950, 'el tanque queda con 950 L')

  const [merma] = await tx`
    select tipo, litros, merma_de_id from public.v_combustible_libro where id = ${ent.r.merma_movimiento_id}`
  comprobar(
    merma?.tipo === 'merma' && Number(merma.litros) === 50 && Number(merma.merma_de_id) === Number(ent.r.movimiento_id),
    'en el libro la merma es de 50 L y cuelga de su entrada',
  )

  // -------------------------------------------------------------------------
  grupo('Combustible · surtir con contador')

  const [u1] = await tx`
    select public.combustible_registrar_uso(${a}, 100, 'OPERACION',
             p_equipo => 'PRUEBA GENERADOR', p_recibio_nombre => 'PRUEBA RECIBE',
             p_contador_ini => 1000, p_articulo_id => ${gasoil.id}) as r`
  comprobar(/^CMB/.test(u1.r.numero ?? ''), 'el surtido emite su vale CMB-…')
  const [d1] = await tx`
    select contador_global_ini, contador_global_fin, vale_numero
      from public.v_combustible_libro where id = ${u1.r.movimiento_id}`
  comprobar(
    Number(d1.contador_global_ini) === 1000 && Number(d1.contador_global_fin) === 1100 && d1.vale_numero === u1.r.numero,
    'sin contador final se guarda inicial + litros (1.000 → 1.100), y el libro lo ata a su vale',
  )

  const [u2] = await tx`
    select public.combustible_registrar_uso(${a}, 50, 'OPERACION',
             p_equipo => 'PRUEBA GENERADOR', p_recibio_nombre => 'PRUEBA RECIBE',
             p_articulo_id => ${gasoil.id}) as r`
  const [d2] = await tx`
    select contador_global_ini, contador_global_fin from public.v_combustible_libro where id = ${u2.r.movimiento_id}`
  comprobar(
    Number(d2.contador_global_ini) === 1100 && Number(d2.contador_global_fin) === 1150,
    'el surtido siguiente arranca donde terminó el anterior',
  )

  const sinRecibe = await debeFallar(tx, (sp) =>
    sp`select public.combustible_registrar_uso(${a}, 10, 'OPERACION', p_equipo => 'PRUEBA GENERADOR',
         p_articulo_id => ${gasoil.id})`,
  )
  comprobar(/quién recibió/i.test(sinRecibe ?? ''), 'sin «¿Quién recibió?» no se surte')

  const demas = await debeFallar(tx, (sp) =>
    sp`select public.combustible_registrar_uso(${a}, 100000, 'OPERACION', p_equipo => 'PRUEBA GENERADOR',
         p_recibio_nombre => 'PRUEBA RECIBE', p_articulo_id => ${gasoil.id})`,
  )
  comprobar(/solo quedan/i.test(demas ?? ''), 'no se surte más de lo que hay')

  // -------------------------------------------------------------------------
  grupo('Combustible · traslado, bidón, merma y retorno')

  const antesA = await saldo(a)
  const [t1] = await tx`
    select public.combustible_trasladar(${a}, ${b}, 200, 'Traslado de prueba',
             p_recibidos => 190, p_articulo_id => ${gasoil.id}) as r`
  comprobar((await saldo(a)) === antesA - 200, 'el traslado saca 200 L del origen')
  comprobar((await saldo(b)) === 190, '…y en el destino quedan 190: los 10 que faltaron son su merma')

  const [costos] = await tx`
    select (select costo_usd from public.inventario_movimientos where id = ${t1.r.salida_id}) as sale,
           (select costo_usd from public.inventario_movimientos where id = ${t1.r.entrada_id}) as entra`
  comprobar(cerca(costos.sale, costos.entra) && cerca(costos.sale, 2), 'el traslado entra al mismo costo con que sale')

  const bidonSinVale = await debeFallar(tx, (sp) =>
    sp`select public.combustible_trasladar(${a}, ${bidon}, 20, p_articulo_id => ${gasoil.id})`,
  )
  comprobar(/para qué se surtió/i.test(bidonSinVale ?? ''), 'pasar a un bidón sin decir para qué no se puede: es un surtido')

  const [tb] = await tx`
    select public.combustible_trasladar(${a}, ${bidon}, 20, p_articulo_id => ${gasoil.id},
             p_motivo_vale => 'OPERACION', p_recibio_nombre => 'PRUEBA RECIBE') as r`
  comprobar(tb.r.bidon === true && /^CMB/.test(tb.r.numero ?? ''), 'a un bidón sale con vale')
  comprobar((await saldo(bidon)) === 0, '…y el bidón no acumula saldo')

  const mermaSinMotivo = await debeFallar(tx, (sp) =>
    sp`select public.combustible_registrar_merma(${a}, 5, '', p_articulo_id => ${gasoil.id})`,
  )
  comprobar(/por qué se perdió/i.test(mermaSinMotivo ?? ''), 'una merma sin motivo no se guarda')
  const antesMerma = await saldo(a)
  await tx`select public.combustible_registrar_merma(${a}, 5, 'Evaporación de prueba', p_articulo_id => ${gasoil.id})`
  comprobar((await saldo(a)) === antesMerma - 5, 'la merma saca sus litros')

  await tx`select public.combustible_registrar_retorno(${a}, 3, 'Sobró en el equipo de prueba', p_articulo_id => ${gasoil.id})`
  comprobar((await saldo(a)) === antesMerma - 2, 'el retorno los devuelve al tanque')

  // -------------------------------------------------------------------------
  grupo('Combustible · anular y corregir')

  const anulados = Number(
    (await tx`select public.combustible_anular_movimiento(${t1.r.salida_id}, 'Prueba de anulación') as n`)[0].n,
  )
  comprobar(anulados === 3, 'anular el traslado escribe tres reversos: las dos patas y su merma')
  comprobar((await saldo(b)) === 0, 'el destino vuelve a cero')
  const [tachado] = await tx`select anulado from public.v_combustible_libro where id = ${t1.r.salida_id}`
  comprobar(tachado?.anulado === true, 'el traslado sigue en el libro, marcado como anulado')

  const otraVez = await debeFallar(tx, (sp) =>
    sp`select public.combustible_anular_movimiento(${t1.r.salida_id}, 'Otra vez')`,
  )
  comprobar(/ya estaba anulado/i.test(otraVez ?? ''), 'lo anulado no se anula dos veces')

  const antesCorr = await saldo(a)
  const [corr] = await tx`
    select public.combustible_corregir_movimiento(${ent.r.movimiento_id},
             ${tx.json({ litros: 1100, motivo_correccion: 'La factura decía 1.100' })}) as r`
  comprobar(corr.r.camino === 'reverso', 'cambiar los litros de una entrada la anula y la registra de nuevo')
  comprobar((await saldo(a)) === antesCorr + 1100 - 1000 + 50, '…y el saldo queda como si hubiera entrado 1.100 sin merma')

  const [datos] = await tx`
    select public.combustible_corregir_movimiento(${u2.r.movimiento_id},
             ${tx.json({ autorizado: 'PRUEBA OTRO' })}) as r`
  const [u2b] = await tx`select autorizado_por from public.v_combustible_libro where id = ${u2.r.movimiento_id}`
  comprobar(datos.r.camino === 'vale' && u2b.autorizado_por === 'PRUEBA OTRO', 'un surtido se corrige por su vale y guarda el dato')

  await tx`select public.combustible_marcar_cuaderno(${u1.r.movimiento_id}, true, 99)`
  const [cuad] = await tx`
    select registrado_en_cuaderno, cuaderno_litros from public.v_combustible_libro where id = ${u1.r.movimiento_id}`
  comprobar(cuad.registrado_en_cuaderno === true && Number(cuad.cuaderno_litros) === 99, '«📖 Cuaderno» queda marcado con sus litros')

  // -------------------------------------------------------------------------
  grupo('Combustible · el libro cuadra')

  for (const t of [a, b, bidon]) {
    const l = await libro(t)
    const movs = Number(
      (await tx`select count(*)::int as n from public.inventario_movimientos where almacen_id = ${t}`)[0].n,
    )
    comprobar(l.n === movs && cerca(l.s, await saldo(t)), `el libro del tanque ${t} tiene un renglón por movimiento y suma su existencia`)
  }

  const conLitros = await debeFallar(tx, (sp) => sp`select public.combustible_desactivar_tanque(${a}, false)`)
  comprobar(/tiene .* L cargados/i.test(conLitros ?? ''), 'un tanque con litros no se desactiva')

  // -------------------------------------------------------------------------
  grupo('Combustible · la puerta del almacén')

  if (general) {
    await comoDueno(tx)
    await rolDePrueba(tx, 'PRUEBA_TRASLADA', { PANEL: 'LECTURA', COMBUSTIBLE: 'ESCRITURA', INVENTARIO: 'LECTURA' })
    await tx`update public.roles set a_la_medida = true where codigo = 'PRUEBA_TRASLADA'`
    await tx`insert into public.rol_acciones (rol, accion) values ('PRUEBA_TRASLADA', 'COMBUSTIBLE.TRASLADO')`
    const quien = await usuarioDePrueba(tx, {
      usuario: 'prueba_traslada',
      nombre: 'Traslada de prueba',
      roles: ['PRUEBA_TRASLADA'],
    })
    await como(tx, quien)

    const delGeneral = await debeFallar(tx, (sp) =>
      sp`select public.combustible_trasladar(${general.id}, ${a}, 1, p_articulo_id => ${gasoil.id})`,
    )
    comprobar(
      /no tiene ese rol|no tiene acceso/i.test(delGeneral ?? ''),
      'con solo la casilla de traslado no se saca nada del almacén general',
    )

    const entreTanques = await debeFallar(tx, (sp) =>
      sp`select public.combustible_trasladar(${a}, ${b}, 1, p_articulo_id => ${gasoil.id})`,
    )
    comprobar(entreTanques === null, '…pero sí se pasa de un tanque a otro')
  }
}
