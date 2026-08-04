/*
  Las puertas.

  Cada comprobación se hace con un usuario recién creado al que se le da
  exactamente un rol propio y una matriz de permisos concreta. Nunca con el
  administrador: ADMIN pasa por encima de todo y probar con él solo demuestra
  que la función existe.

  La técnica para saber si una puerta abrió sin llegar a escribir nada: se llama
  la función con argumentos inválidos a propósito. La comprobación de permiso es
  siempre la primera línea, así que
    · si vuelve "no tiene ese rol" / "no tiene acceso a", la puerta cerró;
    · si vuelve cualquier otra queja —falta el nombre, el RIF no vale— la puerta
      abrió y quien se quejó fue la validación de más adentro.
*/
import { grupo, comprobar, como, comoDueno, debeFallar, usuarioDePrueba, rolDePrueba } from './ayuda.mjs'

const esRechazoDePermiso = (mensaje) =>
  mensaje !== null && /no tiene ese rol|no tiene acceso a/i.test(mensaje)

export default async function pruebaPermisos(tx) {
  grupo('Permisos · la matriz abre las puertas viejas')

  // Un rol de la casa, de los que se crean desde la pantalla: solo nómina.
  await rolDePrueba(tx, 'PRUEBA_NOMINA', { PANEL: 'LECTURA', NOMINA: 'ESCRITURA' })
  const analista = await usuarioDePrueba(tx, {
    usuario: 'prueba_nomina',
    nombre: 'Analista de prueba',
    roles: ['PRUEBA_NOMINA'],
  })

  await como(tx, analista)

  const nomina = await debeFallar(tx, (sp) =>
    sp`select public.guardar_empleado(p_nombres => '', p_apellidos => '')`,
  )
  comprobar(
    !esRechazoDePermiso(nomina),
    'un rol propio con Nómina en escritura entra a la ficha del trabajador ' +
      `(rebotó con: ${(nomina ?? '').slice(0, 45)}…)`,
  )

  // Lo que la escalera NO da: la firma.
  const firma = await debeFallar(tx, (sp) => sp`select public.aprobar_nomina(1)`)
  comprobar(
    esRechazoDePermiso(firma),
    'ese mismo rol no puede aprobar la nómina: aprobar es del gerente, no un nivel más alto',
  )

  // Y tampoco alcanza otros módulos.
  const ajena = await debeFallar(tx, (sp) =>
    sp`select public.guardar_cuenta(null, 'PRUEBA', 'BANCO', 'VES', null, null)`,
  )
  comprobar(esRechazoDePermiso(ajena), 'ese mismo rol no toca tesorería')

  // -------------------------------------------------------------------------
  grupo('Permisos · pedir no es comprar')

  await comoDueno(tx)
  await rolDePrueba(tx, 'PRUEBA_PIDE', { PANEL: 'LECTURA', COMPRAS: 'ESCRITURA' })
  await rolDePrueba(tx, 'PRUEBA_COMPRA', { PANEL: 'LECTURA', COMPRAS: 'TOTAL' })

  const pide = await usuarioDePrueba(tx, {
    usuario: 'prueba_pide',
    nombre: 'Quien pide',
    roles: ['PRUEBA_PIDE'],
  })
  const compra = await usuarioDePrueba(tx, {
    usuario: 'prueba_compra',
    nombre: 'Quien compra',
    roles: ['PRUEBA_COMPRA'],
  })

  await como(tx, pide)
  const provDesdeEscritura = await debeFallar(tx, (sp) =>
    sp`select public.guardar_proveedor(null, '', '')`,
  )
  comprobar(
    esRechazoDePermiso(provDesdeEscritura),
    'con Compras en escritura no se da de alta un proveedor: escritura es pedir',
  )

  await comoDueno(tx)
  await como(tx, compra)
  const provDesdeTotal = await debeFallar(tx, (sp) =>
    sp`select public.guardar_proveedor(null, '', '')`,
  )
  comprobar(
    !esRechazoDePermiso(provDesdeTotal),
    'con Compras en control total sí: comprar es total ' +
      `(rebotó con: ${(provDesdeTotal ?? '').slice(0, 45)}…)`,
  )

  // -------------------------------------------------------------------------
  grupo('Permisos · la tasa del BCV')

  await comoDueno(tx)
  const manana = await usuarioDePrueba(tx, {
    usuario: 'prueba_sin_tasas',
    nombre: 'Sin tasas',
    roles: ['PRUEBA_PIDE'],
  })

  await como(tx, manana)
  const sinTasas = await debeFallar(tx, (sp) =>
    sp`select public.registrar_tasa('USD', 'VES', current_date, 999)`,
  )
  comprobar(
    esRechazoDePermiso(sinTasas),
    'quien no tiene Tasas en escritura ya no puede cargar la tasa del día',
  )

  await comoDueno(tx)
  await rolDePrueba(tx, 'PRUEBA_TASAS', { PANEL: 'LECTURA', TASAS: 'ESCRITURA' })
  const cambista = await usuarioDePrueba(tx, {
    usuario: 'prueba_tasas',
    nombre: 'Con tasas',
    roles: ['PRUEBA_TASAS'],
  })

  await como(tx, cambista)
  const conTasas = await debeFallar(tx, (sp) =>
    sp`select public.registrar_tasa('USD', 'VES', current_date + 30, 999)`,
  )
  comprobar(
    conTasas !== null && /fecha futura/i.test(conTasas),
    'quien sí la tiene entra, y lo que lo para es la regla de la fecha futura',
  )

  // -------------------------------------------------------------------------
  grupo('Permisos · el borrador es de quien lo escribió')

  await comoDueno(tx)
  const otro = await usuarioDePrueba(tx, {
    usuario: 'prueba_ajeno',
    nombre: 'Un tercero',
    roles: ['PRUEBA_PIDE'],
  })

  await como(tx, pide)
  // El último argumento es `p_enviar`: en false el pedido se queda en borrador,
  // que es justo el estado que aquí se prueba.
  const [borrador] = await tx`
    select public.crear_pedido(
      'Pedido de prueba', 'Para comprobar quién puede enviarlo',
      '[{"descripcion":"Renglón de prueba","cantidad":1,"unidad":"UND"}]'::jsonb,
      'NORMAL', null, null,
      false) as id`

  await comoDueno(tx)
  await como(tx, otro)
  const ajeno = await debeFallar(tx, (sp) => sp`select public.enviar_pedido(${borrador.id})`)
  comprobar(
    ajeno !== null && /quien creó el borrador/i.test(ajeno),
    'un tercero ya no puede mandar a compras el borrador de otro con su nombre encima',
  )

  await comoDueno(tx)
  await como(tx, pide)
  await tx`select public.enviar_pedido(${borrador.id})`
  const [estado] = await tx`select estado from public.solicitudes_pedido where id = ${borrador.id}`
  comprobar(estado.estado === 'PEDIDO', 'y su dueño sí lo manda')

  await comoDueno(tx)
}
